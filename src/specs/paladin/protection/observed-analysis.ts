/**
 * The internal Protection Paladin observed-decision facade (M10-C).
 *
 * WHAT IT IS
 *
 * One pure function over an ALREADY-INGESTED normalized fight. It enumerates
 * the observed foreground casts of one Protection Paladin, evaluates each
 * GCD-consuming one against the pinned offensive authority through the shared
 * first-GCD query, records what Holy Power each cast observed, and reports the
 * six decision domains separately. It is INTERNAL_ONLY: no public path
 * selects it, and its result cannot be projected publicly.
 *
 * WHAT IT DELIBERATELY IS NOT
 *
 * - Not a fetcher, not a transport, not a coach: no network, no HTTP, no
 *   score, no severity, no vocabulary for correctness anywhere in the result.
 * - Not a defensive evaluator. Active mitigation, defensive cooldowns,
 *   self-healing and interrupts are represented as domains with NO PINNED
 *   AUTHORITY, and nothing here judges uptime, timing, necessity or survival.
 * - Not a resource simulator. Holy Power is read where a cast observed it
 *   (PRE_COST on a costed cast) and reported NO_OBSERVATION everywhere else.
 *   Two real Shield of the Righteous casts carry no Holy Power entry; their
 *   occurrence proves they fired, not what the amount was.
 *
 * THE DECISION POPULATION, STATED
 *
 * Every COMPLETE cast by the actor, in canonical order, classified:
 *
 *     melee swing                       excluded  MELEE_SWING
 *     pinned lane NON_GCD               excluded  NON_GCD_ACTION
 *     no pinned lane record             excluded  EXECUTION_LANE_NOT_ESTABLISHED
 *     GCD lane, no authority token      excluded  NO_AUTHORITY_TOKEN_BINDING
 *     GCD lane with an authority token  ELIGIBLE  -> first-GCD query -> comparison
 *
 * Protection's primary spender, Shield of the Righteous, is `_gcd` 0 and
 * therefore NON_GCD: its observed casts are excluded from the GCD decision
 * population, exactly as a Rogue's Kick or Vanish is. That is a real property
 * of the shared first-GCD question, not a Paladin oversight, and the payload
 * says so through the exclusion count. Its Holy Power observations are still
 * recorded, because they are facts about the evidence.
 *
 * MATCH MEANS AUTHORITY_COMPATIBLE_ONLY. See `src/findings/observed-comparison.ts`.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import type { GearPiece } from "../../../engine/normalization/normalized-events.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type {
  AnalysisAuthorityMetadata,
  AnalysisStatus,
  SpecAnalysisEnvelope,
  SpecAnalysisInput,
} from "../../../findings/analysis-envelope.js";
import type { AuthorityAccess } from "../../../findings/authority-domain.js";
import type { AplAuthority } from "../../../simc/apl-authority.js";
import type { RotationalGcdResult } from "../../../simc/first-gcd-selection.js";
import type { AtomBindings } from "../../../simc/expression/evaluate.js";
import { unknownNumber } from "../../../simc/expression/evaluate.js";
import {
  compareObservedAction,
  COMPARISON_BASES,
  type ComparisonBasis,
  type ObservedActionComparison,
  type ObservedRotationalDecision,
} from "../../../findings/observed-comparison.js";
import {
  DECISION_BLOCKER_CLASSES,
  DECISION_COVERAGES,
  type DecisionBlockerClass,
  type DecisionCoverage,
} from "../../../simc/decision-coverage.js";
import { RESOURCE_WIRE_CONTRACTS } from "../../../data/wcl-wire/resource-types.js";
import {
  protectionExecutionLaneForAbility,
  protectionTokenByAbilityId,
} from "../../../data/game/paladin-protection-gcd-semantics.js";
import {
  resolveProtectionHeroTree,
  resolveProtectionTalent,
} from "../../../data/game/paladin-protection-talents.js";
import type {
  HeroTreeResolution,
  ObservedTalentEntry,
  TalentResolution,
} from "../../../data/game/talent-selection.js";
import type { ProtectionBuildFacts } from "./action-profile.js";
import { DIVINE_INSPIRATION_DISPLAY_NAME, resolveProtectionHeroEntry } from "./subaction-candidates.js";
import { standaloneProtectionAuthorityAccess } from "./authority-bindings.js";
import { protectionDomainResults, type ProtectionDomainResults } from "./domains.js";
import { protectionFirstGcdSelectionAt } from "./first-gcd-adapter.js";
import { proveObservedActionUnselectable } from "./observed-action-gate.js";
import { resolveProtectionAtoms, type ProtectionResolverDiagnostics } from "./resolver.js";
import { HOLY_POWER_RESOURCE_ID, PROTECTION_PALADIN_SPEC_ID } from "./spec.js";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Why an observed cast is NOT an eligible GCD decision. Counted, never dropped. */
export type ProtectionExclusionReason =
  /** Warcraft Logs flags the cast `melee`: an auto-attack swing, not a foreground press. */
  | "MELEE_SWING"
  /** Proven off-GCD by the pinned lane data (Shield of the Righteous, Sentinel, …). */
  | "NON_GCD_ACTION"
  /** The pinned dataset carries no lane record for the ability. */
  | "EXECUTION_LANE_NOT_ESTABLISHED"
  /** A GCD action with no pinned authority token (Blessing of Spellwarding). */
  | "NO_AUTHORITY_TOKEN_BINDING";

export const PROTECTION_EXCLUSION_REASONS = [
  "MELEE_SWING",
  "NON_GCD_ACTION",
  "EXECUTION_LANE_NOT_ESTABLISHED",
  "NO_AUTHORITY_TOKEN_BINDING",
] as const satisfies readonly ProtectionExclusionReason[];

export interface ExcludedProtectionCast {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly reason: ProtectionExclusionReason;
}

/**
 * The Holy Power a cast OBSERVED. An observation record, never a state.
 *
 * `EXACT_PRE_COST` is the amount before the cast's own cost, as the wire
 * carried it. `NO_OBSERVATION` is the event carrying no Holy Power entry —
 * which is every uncosted cast and, in the real evidence, two costed ones.
 * There is no "derived" member: nothing replays a change onto a snapshot.
 */
export type HolyPowerObservation =
  | {
      readonly state: "EXACT_PRE_COST";
      readonly amount: number;
      readonly max: number | null;
      readonly cost: number | null;
    }
  | { readonly state: "NO_OBSERVATION"; readonly reason: string };

export interface ProtectionCastHolyPower {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly observation: HolyPowerObservation;
}

export interface CountOf<T extends string> {
  readonly key: T;
  readonly count: number;
}

/** The coverage disclosure. The denominator is `eligibleDecisions` and nothing else. */
export interface ProtectionDecisionCoverage {
  readonly actorId: number;
  readonly eligibleDecisions: number;
  readonly match: number;
  readonly rejected: number;
  readonly unknown: number;
  readonly resolvedComparisons: number;
  readonly exactEntryMatches: number;
  readonly tokenConvergedMatches: number;
  readonly selectionPrecision: readonly CountOf<DecisionCoverage>[];
  readonly unknownBases: readonly CountOf<ComparisonBasis>[];
  readonly unknownBlockerClasses: readonly CountOf<DecisionBlockerClass>[];
  readonly exclusions: readonly CountOf<ProtectionExclusionReason>[];
  readonly excludedCastCount: number;
}

/** The build facts the evaluator resolved once from the actor's combatant info. */
export interface ProtectionBuildResolution {
  readonly righteousProtector: TalentResolution;
  readonly sentinel: TalentResolution;
  readonly avengingWrath: TalentResolution;
  readonly blessedHammer: TalentResolution;
  readonly heroTree: HeroTreeResolution;
}

/** What Protection attaches to an analyzed envelope: ITS payload. */
export interface ProtectionPaladinPayload {
  readonly comparisons: readonly ObservedActionComparison[];
  readonly excluded: readonly ExcludedProtectionCast[];
  readonly coverage: ProtectionDecisionCoverage;
  readonly domains: ProtectionDomainResults;
  readonly holyPower: readonly ProtectionCastHolyPower[];
  readonly build: ProtectionBuildResolution;
  /** The resolver's diagnostics at each eligible decision, by position. */
  readonly resolved: readonly {
    readonly position: number;
    readonly diagnostics: ProtectionResolverDiagnostics;
    /** Where the shared first-GCD engine stopped, when it did. Internal evidence; never projected. */
    readonly selection: ProtectionSelectionDiagnostics;
  }[];
}

/** The engine's own account of one first-GCD query, reduced to what evidence needs. */
export interface ProtectionSelectionDiagnostics {
  readonly kind: RotationalGcdResult["kind"];
  /** The entry the engine stopped at, as `list[ordinal] token`, or `null`. */
  readonly blockedAt: string | null;
  readonly detail: string | null;
}

function selectionDiagnosticsOf(result: RotationalGcdResult): ProtectionSelectionDiagnostics {
  if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return { kind: result.kind, blockedAt: null, detail: null };
  const step = result.blockedAt;
  return {
    kind: result.kind,
    blockedAt: step === null ? null : `${step.listName}[${String(step.priorityOrdinal)}] ${step.actionToken}`,
    detail: result.detail,
  };
}

export type ProtectionPaladinAnalysis = SpecAnalysisEnvelope<
  typeof PROTECTION_PALADIN_SPEC_ID,
  ProtectionPaladinPayload
>;

export interface ProtectionAnalysisInput extends SpecAnalysisInput {
  /**
   * The registration's authority access. Omitted, the facade builds the
   * standalone access over the SAME bindings (`authority-bindings.ts`), so a
   * direct call resolves exactly what an orchestrated call resolves.
   */
  readonly authority?: AuthorityAccess;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unsupported(
  status: Exclude<AnalysisStatus, "ANALYZED">,
  specId: string,
  detail: string,
): ProtectionPaladinAnalysis {
  return { status, specId, detail };
}

function wireTypeFor(resourceId: string): number | null {
  return RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === resourceId)?.wireType ?? null;
}

function tally<T extends string>(order: readonly T[], counts: ReadonlyMap<T, number>): readonly CountOf<T>[] {
  const rows: CountOf<T>[] = [];
  for (const key of order) {
    const count = counts.get(key) ?? 0;
    if (count > 0) rows.push({ key, count });
  }
  return rows;
}

/** The actor's combatant snapshot: talents and positional gear, or `null` when none was captured. */
function combatantSnapshotFor(
  state: CombatState,
  actorId: number,
): {
  readonly talents: readonly ObservedTalentEntry[];
  readonly gear: readonly GearPiece[];
  readonly malformedGearRows: readonly number[];
} | null {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "COMBATANT_INFO") continue;
    if (event.snapshot.actorId !== actorId) continue;
    return {
      talents: event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId })),
      gear: event.snapshot.gear,
      malformedGearRows: event.snapshot.malformedGearRows,
    };
  }
  return null;
}

function metadataOf(authority: AplAuthority): AnalysisAuthorityMetadata {
  const { artifact } = authority;
  const { provenance } = artifact;
  return {
    authorityId: artifact.authorityId,
    artifactRevision: artifact.artifactRevision,
    repository: provenance.repository,
    branch: provenance.branch,
    commitSha: provenance.commitSha,
    sourcePath: provenance.sourcePath,
    sourceSha256: provenance.sourceSha256,
    specName: artifact.spec.specName,
    className: artifact.spec.className,
  };
}

/** The Holy Power a cast carried, read once through M4's observation accessor. */
function holyPowerOn(
  state: CombatState,
  position: number,
  actorId: number,
  holyPowerWireType: number,
): HolyPowerObservation {
  const result = state.resources.observationOnEvent(position, actorId, holyPowerWireType);
  if (result.certainty === "UNKNOWN") return { state: "NO_OBSERVATION", reason: result.reason };
  if (result.certainty !== "EXACT" || result.derivation !== "OBSERVED") {
    return { state: "NO_OBSERVATION", reason: `observation was ${result.certainty}/${result.derivation}` };
  }
  if (result.value.timing !== "PRE_COST") {
    return { state: "NO_OBSERVATION", reason: `observation timing is ${result.value.timing}, not PRE_COST` };
  }
  return {
    state: "EXACT_PRE_COST",
    amount: result.value.observedAmount,
    max: result.value.observedMax,
    cost: result.value.observedCost,
  };
}

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/**
 * Analyses one Protection Paladin's observed decisions.
 *
 * Decisions are enumerated MECHANICALLY from the normalized fight — every
 * COMPLETE cast by the actor, through M4's own source-actor index, in
 * canonical order. Nothing here indexes the event array, nothing treats an
 * ingestion ordinal as a position, and no timestamp is hard-coded.
 */
export function analyzeObservedProtectionPaladinDecisions(
  input: ProtectionAnalysisInput,
): ProtectionPaladinAnalysis {
  const { state, actorId, specId } = input;

  // ---- spec gate, before any Protection rule runs ----
  if (specId !== PROTECTION_PALADIN_SPEC_ID) {
    return unsupported(
      "SPEC_NOT_SUPPORTED",
      specId,
      `This evaluator supports '${PROTECTION_PALADIN_SPEC_ID}' only. No gameplay evaluation was attempted for this specialization.`,
    );
  }

  const access = input.authority ?? standaloneProtectionAuthorityAccess();
  const offensive = access.forDomain("OFFENSIVE_ROTATION");
  if (offensive.outcome !== "AUTHORITY_AVAILABLE") {
    return unsupported(
      "AUTHORITY_NOT_AVAILABLE",
      specId,
      `The pinned SimulationCraft Protection Paladin authority could not be resolved (${offensive.outcome}), so no offensive decision was evaluated.`,
    );
  }
  const authority = offensive.authority;

  const snapshot = combatantSnapshotFor(state, actorId);
  if (snapshot === null) {
    return unsupported(
      "PROFILE_NOT_RESOLVED",
      specId,
      "No combatant profile was resolved for this actor, so build facts and action applicability could not be established.",
    );
  }

  const holyPowerWireType = wireTypeFor(HOLY_POWER_RESOURCE_ID);
  if (holyPowerWireType === null) {
    return unsupported(
      "INSUFFICIENT_EVIDENCE",
      specId,
      "The version-scoped resource wire contract required to read Holy Power is not available.",
    );
  }

  // ---- build facts, resolved once ----
  const observedTalents = snapshot.talents;
  const build: ProtectionBuildResolution = {
    righteousProtector: resolveProtectionTalent(observedTalents, "righteous_protector"),
    sentinel: resolveProtectionTalent(observedTalents, "sentinel"),
    avengingWrath: resolveProtectionTalent(observedTalents, "avenging_wrath"),
    blessedHammer: resolveProtectionTalent(observedTalents, "blessed_hammer"),
    heroTree: resolveProtectionHeroTree(observedTalents),
  };
  const buildFacts: ProtectionBuildFacts = {
    blessedHammer: build.blessedHammer,
    sentinel: build.sentinel,
    avengingWrath: build.avengingWrath,
    heroTree: build.heroTree,
    wornGear: snapshot.gear,
    malformedGearRows: snapshot.malformedGearRows,
    divineInspiration: resolveProtectionHeroEntry(observedTalents, DIVINE_INSPIRATION_DISPLAY_NAME).selection,
  };
  const actionTokens = [...new Set(authority.actions.map((action) => action.actionToken))];
  const tokens = protectionTokenByAbilityId();

  const comparisons: ObservedActionComparison[] = [];
  const excluded: ExcludedProtectionCast[] = [];
  const holyPower: ProtectionCastHolyPower[] = [];
  const resolved: {
    position: number;
    diagnostics: ProtectionResolverDiagnostics;
    selection: ProtectionSelectionDiagnostics;
  }[] = [];

  for (const position of state.positionsBySourceActor(actorId)) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId) continue;
    const abilityGameId = event.abilityGameId;
    if (abilityGameId === null) continue;

    const exclude = (reason: ProtectionExclusionReason): void => {
      excluded.push({
        position,
        locator: event.locator,
        abilityGameId,
        reportTimeMs: event.reportTimeMs,
        reason,
      });
    };

    // A melee swing is a background attack. It carries no Holy Power
    // observation worth recording and is not a press.
    if (event.isMelee === true) {
      exclude("MELEE_SWING");
      continue;
    }

    // Every foreground cast's Holy Power observation, eligible or not.
    holyPower.push({
      position,
      locator: event.locator,
      abilityGameId,
      reportTimeMs: event.reportTimeMs,
      observation: holyPowerOn(state, position, actorId, holyPowerWireType),
    });

    const lane = protectionExecutionLaneForAbility(abilityGameId);
    if (lane === "NON_GCD") {
      exclude("NON_GCD_ACTION");
      continue;
    }
    if (lane === "UNKNOWN_LANE") {
      exclude("EXECUTION_LANE_NOT_ESTABLISHED");
      continue;
    }
    const observedToken = tokens.get(abilityGameId);
    if (observedToken === undefined) {
      exclude("NO_AUTHORITY_TOKEN_BINDING");
      continue;
    }

    const targetActorId = input.targetActorId ?? event.target?.actorId ?? null;
    const decision: ObservedRotationalDecision = {
      position,
      locator: event.locator,
      actorId,
      abilityGameId,
      observedToken,
      reportTimeMs: event.reportTimeMs,
      fightTimeMs: event.fightTimeMs,
      targetActorId,
    };

    const resolution = resolveProtectionAtoms({ state, actorId, position, observedTalents, actionTokens });

    // ---- bindings: only what is POSITIVELY established ----
    //
    // No Rogue resource is read: combo points and energy are stated UNKNOWN,
    // which the pinned Protection APL never asks about anyway. Buffs are not
    // bound — no Paladin aura identity is pinned at M10-C — so every
    // `buff.<name>.up` is enumerated, and a verdict survives only if it holds
    // under both assignments.
    const bindings: AtomBindings = {
      comboPoints: unknownNumber("STATE_NOT_MODELLED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: [],
      knownTalents: resolution.diagnostics.knownTalents,
      specAtoms: resolution.specAtoms,
    };

    const outcome = protectionFirstGcdSelectionAt({
      authority,
      bindings,
      buildFacts,
      observedAbilityGameId: abilityGameId,
    });

    resolved.push({
      position,
      diagnostics: resolution.diagnostics,
      selection: selectionDiagnosticsOf(outcome.result),
    });

    // Protection's own proof that the authority could not have selected the
    // observed action here (`observed-action-gate.ts`). Independent of the
    // global scan, and the ONLY route to REJECTED for this specialization.
    const unselectable = proveObservedActionUnselectable({
      authority,
      observedToken,
      bindings,
      buildFacts,
    });

    comparisons.push(
      compareObservedAction({
        decision,
        authorityResult: outcome.result,
        // No M5-A style judgment exists for Protection; `null` is NOT a
        // positive verdict.
        observedActionJudgment: null,
        observedActionUnselectable: unselectable.proven ? unselectable.proof : null,
        usabilityProvenance: "OBSERVED_EXECUTION",
      }),
    );
  }

  return {
    status: "ANALYZED",
    specId: PROTECTION_PALADIN_SPEC_ID,
    authority: metadataOf(authority),
    comparisons,
    excluded,
    coverage: summarizeProtectionDecisions(actorId, comparisons, excluded),
    domains: protectionDomainResults(access, state.fight.completeness.categories.INTERRUPTS.capability),
    holyPower,
    build,
    resolved,
  };
}

/** Counts the comparisons. The three outcomes partition the eligible decisions exactly. */
export function summarizeProtectionDecisions(
  actorId: number,
  comparisons: readonly ObservedActionComparison[],
  excluded: readonly ExcludedProtectionCast[],
): ProtectionDecisionCoverage {
  let match = 0;
  let rejected = 0;
  let unknown = 0;
  let exactEntryMatches = 0;
  let tokenConvergedMatches = 0;
  const precision = new Map<DecisionCoverage, number>();
  const bases = new Map<ComparisonBasis, number>();
  const blockers = new Map<DecisionBlockerClass, number>();
  const exclusions = new Map<ProtectionExclusionReason, number>();

  for (const comparison of comparisons) {
    precision.set(comparison.authorityCoverage, (precision.get(comparison.authorityCoverage) ?? 0) + 1);
    if (comparison.outcome === "MATCH") {
      match += 1;
      if (comparison.selectionPrecision === "EXACT_ENTRY") exactEntryMatches += 1;
      if (comparison.selectionPrecision === "TOKEN_CONVERGED") tokenConvergedMatches += 1;
    } else if (comparison.outcome === "REJECTED") {
      rejected += 1;
    } else {
      unknown += 1;
      bases.set(comparison.basis, (bases.get(comparison.basis) ?? 0) + 1);
      if (comparison.decisiveBlocker !== null) {
        blockers.set(comparison.decisiveBlocker, (blockers.get(comparison.decisiveBlocker) ?? 0) + 1);
      }
    }
  }
  for (const cast of excluded) exclusions.set(cast.reason, (exclusions.get(cast.reason) ?? 0) + 1);

  return {
    actorId,
    eligibleDecisions: comparisons.length,
    match,
    rejected,
    unknown,
    resolvedComparisons: match + rejected,
    exactEntryMatches,
    tokenConvergedMatches,
    selectionPrecision: tally(DECISION_COVERAGES, precision),
    unknownBases: tally(COMPARISON_BASES, bases),
    unknownBlockerClasses: tally(DECISION_BLOCKER_CLASSES, blockers),
    exclusions: tally(PROTECTION_EXCLUSION_REASONS, exclusions),
    excludedCastCount: excluded.length,
  };
}
