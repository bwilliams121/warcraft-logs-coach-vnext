/**
 * The internal Retribution Paladin observed-decision facade (M11-A4).
 *
 * WHAT IT IS
 *
 * One pure function over an ALREADY-INGESTED normalized fight. It enumerates
 * the observed foreground casts of one Retribution Paladin, evaluates each
 * Holy Power SPENDER cast against the pinned offensive authority through the
 * nested unselectability proof and the shared first-GCD query, records what
 * Holy Power each cast observed, and reports the decision domains
 * separately. INTERNAL_ONLY: the application service never selects it, and
 * nothing here is projected to a public document.
 *
 * WHAT IT DELIBERATELY IS NOT
 *
 * - Not a fetcher, not a transport, not a coach: no network, no HTTP, no
 *   score, no severity, no vocabulary for correctness anywhere in the result.
 * - Not a generator evaluator, not a cooldown evaluator. Judgment, Blade of
 *   Justice, Hammer of Wrath, Wake of Ashes, Divine Toll, Execution Sentence
 *   and the strikes are observed, counted, and excluded as OUTSIDE the first
 *   slice — never judged.
 * - Not a resource simulator. Holy Power is read where a cast observed it
 *   (PRE_COST on a costed spender) and reported NO_OBSERVATION everywhere
 *   else. No amount is carried between decisions.
 * - Not a racial, potion, trinket or external-buff evaluator: those entries
 *   are outside the rotational decision domain (`domain-boundary.ts`).
 *
 * THE DECISION POPULATION, STATED
 *
 * Every COMPLETE cast by the actor, in canonical order, classified:
 *
 *     melee swing                           excluded  MELEE_SWING
 *     pinned lane NON_GCD                   excluded  NON_GCD_ACTION
 *     no pinned lane record                 excluded  EXECUTION_LANE_NOT_ESTABLISHED
 *     GCD lane, no authority token          excluded  NO_AUTHORITY_TOKEN_BINDING
 *     GCD lane, in-domain, not a spender    excluded  OUTSIDE_FIRST_SLICE
 *     divine_storm / templars_verdict       ELIGIBLE  -> proof + first-GCD query -> comparison
 *
 * MATCH MEANS AUTHORITY_COMPATIBLE_ONLY, after the non-domain exclusion.
 * See `src/findings/observed-comparison.ts` and `domain-boundary.ts`.
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
import { unknownNumber, type AtomBindings } from "../../../simc/expression/evaluate.js";
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
import {
  retributionExecutionLaneForAbility,
  retributionTokenByAbilityId,
} from "../../../data/game/paladin-retribution-gcd-semantics.js";
import {
  resolveRetributionHeroTree,
  resolveRetributionModelledTalents,
  resolveRetributionTalent,
  retributionModelledTalentNames,
} from "../../../data/game/paladin-retribution-talents.js";
import type {
  HeroTreeResolution,
  ObservedTalentEntry,
  TalentResolution,
} from "../../../data/game/talent-selection.js";
import {
  DIVINE_STORM_TOKEN,
  HAMMER_OF_WRATH_TOKEN,
  TEMPLARS_VERDICT_TOKEN,
  foregroundProvenByObservedExecution,
  wornTwoHandedWeapon,
  type RetributionAuraGateFact,
  type RetributionBuildFacts,
  type RetributionReadinessFact,
} from "./action-profile.js";
import {
  bindSupportedRetributionAuras,
  bindSupportedRetributionStacks,
  retributionBuffBindingsFrom,
  retributionStackBindingsFrom,
  type RetributionAuraBinding,
  type RetributionStackBinding,
} from "./aura-bindings.js";
import {
  deriveSupportedRetributionCooldowns,
  retributionCooldownBindingsFrom,
  type RetributionDerivedCooldown,
  type RetributionTokenCooldown,
} from "./cooldown-bindings.js";
import { RETRIBUTION_FOREGROUND_ONLY_EXECUTIONS } from "../../../data/game/paladin-retribution-foreground-execution-authority.js";
import { standaloneRetributionAuthorityAccess } from "./authority-bindings.js";
import { retributionDomainResults, type RetributionDomainResults } from "./domains.js";
import { retributionFirstGcdSelectionAt, type RetributionFirstGcdQueryOutcome } from "./first-gcd-adapter.js";
import {
  holyPowerOn,
  holyPowerWireType,
  spenderFactsFrom,
  type RetributionCastHolyPower,
} from "./holy-power.js";
import {
  proveObservedActionUnselectable,
  type ObservedActionUnselectability,
} from "./observed-action-gate.js";
import { resolveRetributionAtoms, type RetributionResolverDiagnostics } from "./resolver.js";
import { RETRIBUTION_PALADIN_SPEC_ID } from "./spec.js";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The observed tokens the first slice judges. Everything else in-domain is OUTSIDE_FIRST_SLICE. */
export const FIRST_SLICE_TOKENS = Object.freeze([DIVINE_STORM_TOKEN, TEMPLARS_VERDICT_TOKEN] as const);

/** Why an observed cast is NOT an eligible spender decision. Counted, never dropped. */
export type RetributionExclusionReason =
  /** Warcraft Logs flags the cast `melee`: an auto-attack swing, not a foreground press. */
  | "MELEE_SWING"
  /** Proven off-GCD by the pinned lane data (Rebuke, Avenging Wrath, Divine Protection, …). */
  | "NON_GCD_ACTION"
  /** The pinned dataset carries no lane record for the ability. */
  | "EXECUTION_LANE_NOT_ESTABLISHED"
  /** A GCD action with no pinned authority token. */
  | "NO_AUTHORITY_TOKEN_BINDING"
  /** An in-domain GCD action that is not a Holy Power spender choice: observed, not judged, in A4. */
  | "OUTSIDE_FIRST_SLICE";

export const RETRIBUTION_EXCLUSION_REASONS = [
  "MELEE_SWING",
  "NON_GCD_ACTION",
  "EXECUTION_LANE_NOT_ESTABLISHED",
  "NO_AUTHORITY_TOKEN_BINDING",
  "OUTSIDE_FIRST_SLICE",
] as const satisfies readonly RetributionExclusionReason[];

export interface ExcludedRetributionCast {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly reason: RetributionExclusionReason;
}

export interface CountOf<T extends string> {
  readonly key: T;
  readonly count: number;
}

/** The coverage disclosure. The denominator is `eligibleDecisions` and nothing else. */
export interface RetributionDecisionCoverage {
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
  readonly exclusions: readonly CountOf<RetributionExclusionReason>[];
  readonly excludedCastCount: number;
}

/** The build facts the evaluator resolved once from the actor's combatant info. */
export interface RetributionBuildResolution {
  /** Every modelled talent, by SimulationCraft name, three-way. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  readonly heroTree: HeroTreeResolution;
  /** The worn item pinned as a two-handed weapon, when one is. */
  readonly twoHandedWeaponItemId: number | null;
  /**
   * Tokens whose UNKNOWN constructor reading a pinned FOREGROUND-ONLY
   * execution fact settled from an observed cast of exactly the record the
   * fact names (`paladin-retribution-foreground-execution-authority.ts`).
   * Empty when no such fact applied; never a generic cast-observed claim.
   */
  readonly foregroundProvenByObservedExecution: readonly {
    readonly simcToken: string;
    readonly abilityGameId: number;
  }[];
}

/** One derived cooldown at a decision, as the payload carries it. */
export interface RetributionCooldownDiagnostics {
  readonly simcToken: string;
  readonly readiness: RetributionTokenCooldown["readiness"];
  readonly readinessAbilityGameId: number | null;
  readonly remainsSeconds: RetributionTokenCooldown["remainsSeconds"];
  readonly perAbility: readonly {
    readonly abilityGameId: number;
    readonly effectiveBase: RetributionDerivedCooldown["effectiveBase"];
    readonly staticModifiers: RetributionDerivedCooldown["staticModifiers"];
    readonly cooldown:
      | { readonly state: "UNKNOWN"; readonly reason: string; readonly anchorPosition: number | null }
      | {
          readonly state: "EXACT" | "BOUNDED";
          readonly atLeastRemainingMs: number;
          readonly baseCooldownMs: number;
          readonly elapsedMs: number;
          readonly anchorPosition: number;
          readonly anchorLocator: EvidenceLocator;
        };
  }[];
}

/** The engine's own account of one first-GCD query, reduced to what evidence needs. */
export interface RetributionSelectionDiagnostics {
  readonly kind: RotationalGcdResult["kind"];
  /** The entry the engine stopped at, as `list[ordinal] token`, or `null`. */
  readonly blockedAt: string | null;
  readonly detail: string | null;
  /**
   * The ROOT scan's innermost BLOCKED step, as `list[ordinal] token`, or null
   * (`first-gcd-adapter.ts`). The engine's `blockedAt` names the earliest
   * unresolved candidate, which for this list is always the NON_GCD
   * `default[0] auto_attack`; this names the entry the evidence could not
   * decide. Diagnostic only.
   */
  readonly rootScanBlockedAt: string | null;
  readonly rootScanBlocker: string | null;
}

/** The unselectability proof's outcome, reduced to what evidence needs. */
export interface RetributionUnselectabilityDiagnostics {
  readonly proven: boolean;
  readonly refusal: string | null;
  readonly at: string | null;
}

/** What Retribution attaches to an analyzed envelope: ITS payload. */
export interface RetributionPaladinPayload {
  readonly comparisons: readonly ObservedActionComparison[];
  readonly excluded: readonly ExcludedRetributionCast[];
  readonly coverage: RetributionDecisionCoverage;
  readonly domains: RetributionDomainResults;
  readonly holyPower: readonly RetributionCastHolyPower[];
  readonly build: RetributionBuildResolution;
  /** The resolver's diagnostics at each eligible decision, by position. */
  readonly resolved: readonly {
    readonly position: number;
    readonly diagnostics: RetributionResolverDiagnostics;
    readonly auras: readonly RetributionAuraBinding[];
    readonly stacks: readonly RetributionStackBinding[];
    readonly cooldowns: readonly RetributionCooldownDiagnostics[];
    readonly selection: RetributionSelectionDiagnostics;
    readonly unselectability: RetributionUnselectabilityDiagnostics;
  }[];
}

export type RetributionPaladinAnalysis = SpecAnalysisEnvelope<
  typeof RETRIBUTION_PALADIN_SPEC_ID,
  RetributionPaladinPayload
>;

export interface RetributionAnalysisInput extends SpecAnalysisInput {
  /** The registration's authority access; omitted, the standalone access over the SAME bindings. */
  readonly authority?: AuthorityAccess;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unsupported(
  status: Exclude<AnalysisStatus, "ANALYZED">,
  specId: string,
  detail: string,
): RetributionPaladinAnalysis {
  return { status, specId, detail };
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
): { readonly talents: readonly ObservedTalentEntry[]; readonly gear: readonly GearPiece[] } | null {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "COMBATANT_INFO") continue;
    if (event.snapshot.actorId !== actorId) continue;
    return {
      talents: event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId })),
      gear: event.snapshot.gear,
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

function selectionDiagnosticsOf(outcome: RetributionFirstGcdQueryOutcome): RetributionSelectionDiagnostics {
  const { result, rootScan } = outcome;
  const root = { rootScanBlockedAt: rootScan.blockedStep, rootScanBlocker: rootScan.blocker };
  if (result.kind !== "ROTATIONAL_GCD_UNKNOWN")
    return { kind: result.kind, blockedAt: null, detail: null, ...root };
  const step = result.blockedAt;
  return {
    kind: result.kind,
    blockedAt: step === null ? null : `${step.listName}[${String(step.priorityOrdinal)}] ${step.actionToken}`,
    detail: result.detail,
    ...root,
  };
}

function unselectabilityDiagnosticsOf(
  result: ObservedActionUnselectability,
): RetributionUnselectabilityDiagnostics {
  if (result.proven) return { proven: true, refusal: null, at: null };
  return {
    proven: false,
    refusal: result.refusal,
    at: result.at === null ? null : `${result.at.listName}[${String(result.at.priorityOrdinal)}]`,
  };
}

/** One derived cooldown, reduced to what evidence needs. */
function cooldownDiagnosticsOf(entry: RetributionTokenCooldown): RetributionCooldownDiagnostics {
  return {
    simcToken: entry.simcToken,
    readiness: entry.readiness,
    readinessAbilityGameId: entry.readinessAbilityGameId,
    remainsSeconds: entry.remainsSeconds,
    perAbility: entry.perAbility.map((derived) => ({
      abilityGameId: derived.abilityGameId,
      effectiveBase: derived.effectiveBase,
      staticModifiers: derived.staticModifiers,
      cooldown:
        derived.cooldown.state === "UNKNOWN"
          ? {
              state: "UNKNOWN",
              reason: derived.cooldown.reason,
              anchorPosition: derived.cooldown.anchor?.position ?? null,
            }
          : {
              state: derived.cooldown.state,
              atLeastRemainingMs:
                derived.cooldown.state === "EXACT"
                  ? derived.cooldown.remainingMs
                  : derived.cooldown.atLeastRemainingMs,
              baseCooldownMs: derived.cooldown.baseCooldownMs,
              elapsedMs: derived.cooldown.elapsedMs,
              anchorPosition: derived.cooldown.anchor.position,
              anchorLocator: derived.cooldown.anchor.locator,
            },
    })),
  };
}

/** Every ability the actor was observed casting COMPLETE (melee swings excluded) in the fight's evidence. */
function observedCastAbilityIdsOf(state: CombatState, actorId: number): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const position of state.positionsBySourceActor(actorId)) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId || event.isMelee === true || event.abilityGameId === null) continue;
    ids.add(event.abilityGameId);
  }
  return ids;
}

/** Every modelled talent's three-way resolution, by name. UNKNOWN is a refusal, kept as one. */
function resolveAllModelledTalents(
  observedTalents: readonly ObservedTalentEntry[],
): Readonly<Record<string, TalentResolution>> {
  const talents: Record<string, TalentResolution> = {};
  for (const simcName of retributionModelledTalentNames()) {
    talents[simcName] = resolveRetributionTalent(observedTalents, simcName);
  }
  return talents;
}

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/**
 * Analyses one Retribution Paladin's observed spender decisions.
 *
 * Decisions are enumerated MECHANICALLY from the normalized fight — every
 * COMPLETE cast by the actor, through M4's own source-actor index, in
 * canonical order. Nothing here indexes the event array, nothing treats an
 * ingestion ordinal as a position, and no timestamp is hard-coded.
 */
export function analyzeObservedRetributionPaladinDecisions(
  input: RetributionAnalysisInput,
): RetributionPaladinAnalysis {
  const { state, actorId, specId } = input;

  // ---- spec gate, before any Retribution rule runs ----
  if (specId !== RETRIBUTION_PALADIN_SPEC_ID) {
    return unsupported(
      "SPEC_NOT_SUPPORTED",
      specId,
      `This evaluator supports '${RETRIBUTION_PALADIN_SPEC_ID}' only. No gameplay evaluation was attempted for this specialization.`,
    );
  }

  const access = input.authority ?? standaloneRetributionAuthorityAccess();
  const offensive = access.forDomain("OFFENSIVE_ROTATION");
  if (offensive.outcome !== "AUTHORITY_AVAILABLE") {
    return unsupported(
      "AUTHORITY_NOT_AVAILABLE",
      specId,
      "The pinned SimulationCraft Retribution Paladin authority artifact could not be resolved, so no offensive decision was evaluated.",
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

  const wireType = holyPowerWireType();
  if (wireType === null) {
    return unsupported(
      "INSUFFICIENT_EVIDENCE",
      specId,
      "The version-scoped resource wire contract required to read Holy Power is not available.",
    );
  }

  // ---- build facts, resolved once ----
  const observedTalents = snapshot.talents;
  const talents = resolveAllModelledTalents(observedTalents);
  const buildFacts: RetributionBuildFacts = {
    talents,
    heroTree: resolveRetributionHeroTree(observedTalents),
    wornGear: snapshot.gear,
    observedCastAbilityIds: observedCastAbilityIdsOf(state, actorId),
  };
  const build: RetributionBuildResolution = {
    talents,
    heroTree: buildFacts.heroTree,
    twoHandedWeaponItemId: wornTwoHandedWeapon(snapshot.gear)?.itemId ?? null,
    foregroundProvenByObservedExecution: RETRIBUTION_FOREGROUND_ONLY_EXECUTIONS.flatMap((fact) => {
      const proven = foregroundProvenByObservedExecution(buildFacts, fact.simcToken);
      return proven === null ? [] : [{ simcToken: fact.simcToken, abilityGameId: proven.abilityGameId }];
    }),
  };
  const knownTalents = resolveRetributionModelledTalents(observedTalents);
  const tokens = retributionTokenByAbilityId();

  const comparisons: ObservedActionComparison[] = [];
  const excluded: ExcludedRetributionCast[] = [];
  const holyPower: RetributionCastHolyPower[] = [];
  const resolved: RetributionPaladinPayload["resolved"][number][] = [];

  for (const position of state.positionsBySourceActor(actorId)) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId) continue;
    const abilityGameId = event.abilityGameId;
    if (abilityGameId === null) continue;

    const exclude = (reason: RetributionExclusionReason): void => {
      excluded.push({
        position,
        locator: event.locator,
        abilityGameId,
        reportTimeMs: event.reportTimeMs,
        reason,
      });
    };

    if (event.isMelee === true) {
      exclude("MELEE_SWING");
      continue;
    }

    // Every foreground cast's Holy Power observation, eligible or not.
    const observation = holyPowerOn(state, position, actorId, wireType);
    holyPower.push({
      position,
      locator: event.locator,
      abilityGameId,
      reportTimeMs: event.reportTimeMs,
      observation,
    });

    const lane = retributionExecutionLaneForAbility(abilityGameId);
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
    if (!(FIRST_SLICE_TOKENS as readonly string[]).includes(observedToken)) {
      exclude("OUTSIDE_FIRST_SLICE");
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

    // ---- bindings: only what is POSITIVELY established ----
    const auraInput = { state, actorId, position, talents };
    const auras = bindSupportedRetributionAuras(auraInput);
    const stacks = bindSupportedRetributionStacks(auraInput);
    const cooldowns = deriveSupportedRetributionCooldowns({ state, actorId, position, observedTalents });
    const sharedBindings: Omit<AtomBindings, "specAtoms"> = {
      comboPoints: unknownNumber("STATE_NOT_MODELLED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: retributionBuffBindingsFrom(auras),
      knownBuffStacks: retributionStackBindingsFrom(stacks),
      knownTalents,
      knownCooldownRemainsSeconds: retributionCooldownBindingsFrom(cooldowns),
    };
    const resolution = resolveRetributionAtoms({ holyPower: observation, sharedBindings });
    const bindings: AtomBindings = { ...sharedBindings, specAtoms: resolution.specAtoms };

    const spender = spenderFactsFrom(observation, auras);
    const readiness: RetributionReadinessFact[] = cooldowns.map((entry) => ({
      simcToken: entry.simcToken,
      readiness: entry.readiness,
      abilityGameId: entry.readinessAbilityGameId,
    }));
    // Hammer of Wrath's own ready() requires its readiness aura; an OBSERVED
    // removal proves it unusable. Silence never does.
    const auraGates: RetributionAuraGateFact[] = auras.flatMap((aura) =>
      aura.atomName === "hammer_of_wrath" && aura.state === "BOUND" && !aura.up
        ? [
            {
              simcToken: HAMMER_OF_WRATH_TOKEN,
              requiredAuraAbilityGameId: aura.abilityGameId,
              anchorReportTimeMs: aura.anchorLocator.reportTimeMs,
            },
          ]
        : [],
    );

    const outcome = retributionFirstGcdSelectionAt({
      authority,
      bindings,
      buildFacts,
      observedAbilityGameId: abilityGameId,
      spender,
      readiness,
      auraGates,
    });
    const result = outcome.result;

    // Retribution's own proof that the authority could not have selected the
    // observed action here, across every list (`observed-action-gate.ts`).
    const unselectable = proveObservedActionUnselectable({ authority, observedToken, bindings, buildFacts });

    resolved.push({
      position,
      diagnostics: resolution.diagnostics,
      auras,
      stacks,
      cooldowns: cooldowns.map(cooldownDiagnosticsOf),
      selection: selectionDiagnosticsOf(outcome),
      unselectability: unselectabilityDiagnosticsOf(unselectable),
    });

    comparisons.push(
      compareObservedAction({
        decision,
        authorityResult: result,
        observedActionJudgment: null,
        observedActionUnselectable: unselectable.proven ? unselectable.proof : null,
        usabilityProvenance: "OBSERVED_EXECUTION",
      }),
    );
  }

  return {
    status: "ANALYZED",
    specId: RETRIBUTION_PALADIN_SPEC_ID,
    authority: metadataOf(authority),
    comparisons,
    excluded,
    coverage: summarizeRetributionDecisions(actorId, comparisons, excluded),
    domains: retributionDomainResults(access, state.fight.completeness.categories.INTERRUPTS.capability),
    holyPower,
    build,
    resolved,
  };
}

/** Counts the comparisons. The three outcomes partition the eligible decisions exactly. */
export function summarizeRetributionDecisions(
  actorId: number,
  comparisons: readonly ObservedActionComparison[],
  excluded: readonly ExcludedRetributionCast[],
): RetributionDecisionCoverage {
  let match = 0;
  let rejected = 0;
  let unknown = 0;
  let exactEntryMatches = 0;
  let tokenConvergedMatches = 0;
  const precision = new Map<DecisionCoverage, number>();
  const bases = new Map<ComparisonBasis, number>();
  const blockers = new Map<DecisionBlockerClass, number>();
  const exclusions = new Map<RetributionExclusionReason, number>();

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
    exclusions: tally(RETRIBUTION_EXCLUSION_REASONS, exclusions),
    excludedCastCount: excluded.length,
  };
}
