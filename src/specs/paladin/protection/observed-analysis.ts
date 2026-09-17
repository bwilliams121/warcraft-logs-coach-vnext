/**
 * The internal Protection Paladin observed-decision facade (M10-C).
 *
 * WHAT IT IS
 *
 * One pure function over an ALREADY-INGESTED normalized fight. It enumerates
 * the observed foreground casts of one Protection Paladin, evaluates each
 * GCD-consuming one against the pinned offensive authority through the shared
 * first-GCD query, records what Holy Power each cast observed, and reports the
 * six decision domains separately. PUBLIC since M10-D: the application
 * service selects it for a resolved Protection Paladin identity, and the
 * registration's view (`registration.ts`) is what the public projection
 * reads — the payload below is never projected directly.
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
  resolveProtectionApexTrait,
  resolveProtectionHeroTree,
  resolveProtectionTalent,
} from "../../../data/game/paladin-protection-talents.js";
import type {
  HeroTreeResolution,
  ObservedTalentEntry,
  TalentResolution,
} from "../../../data/game/talent-selection.js";
import type {
  ProtectionAuraGateFact,
  ProtectionBuildFacts,
  ProtectionReadinessFact,
} from "./action-profile.js";
import { HAMMER_OF_WRATH_TOKEN } from "./action-profile.js";
import { AVENGING_WRATH_TOKEN } from "./action-profile.js";
import {
  bindSupportedProtectionAuras,
  protectionBuffBindingsFrom,
  type ProtectionAuraBinding,
} from "./aura-bindings.js";
import {
  deriveSupportedProtectionCooldowns,
  effectiveBaseFor,
  protectionCooldownBindingsFrom,
  type ProtectionDerivedCooldown,
  type ProtectionTokenCooldown,
} from "./cooldown-bindings.js";
import { protectionCooldownAbilitiesFor } from "../../../data/game/paladin-protection-cooldowns.js";
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
  /** `apex.1`, the trait that gates the Vanguard buff identity (M10-C5 Phase B). */
  readonly gloryOfTheVanguard: TalentResolution;
  /** The Lightsmith choice node against Divine Guidance (M10-C5 Phase B). */
  readonly blessedAssurance: TalentResolution;
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
    /** The buff atoms bound (or not) at this decision, with M4's anchor. */
    readonly auras: readonly ProtectionAuraBinding[];
    /** The cooldowns derived (or not) at this decision. */
    readonly cooldowns: readonly ProtectionCooldownDiagnostics[];
    /** Where the shared first-GCD engine stopped, when it did. Internal evidence; never projected. */
    readonly selection: ProtectionSelectionDiagnostics;
  }[];
}

/** One derived cooldown at a decision, as the payload carries it. */
export interface ProtectionCooldownDiagnostics {
  readonly simcToken: string;
  readonly readiness: ProtectionTokenCooldown["readiness"];
  readonly readinessAbilityGameId: number | null;
  readonly remainsSeconds: ProtectionTokenCooldown["remainsSeconds"];
  readonly perAbility: readonly {
    readonly abilityGameId: number;
    readonly effectiveBase: ProtectionDerivedCooldown["effectiveBase"];
    readonly staticModifiers: ProtectionDerivedCooldown["staticModifiers"];
    readonly cooldown:
      | {
          readonly state: "UNKNOWN";
          readonly reason: string;
          readonly anchorPosition: number | null;
        }
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

/** The smallest effective wings base any pinned wings record admits for this build, or null. */
function wingsCooldownLowerBoundFor(observedTalents: readonly ObservedTalentEntry[]): number | null {
  let bound: number | null = null;
  for (const ability of protectionCooldownAbilitiesFor(AVENGING_WRATH_TOKEN)) {
    const { base } = effectiveBaseFor(ability, observedTalents);
    if (base.state === "REFUSED") return null;
    bound = bound === null ? base.ms : Math.min(bound, base.ms);
  }
  return bound;
}

/** One derived cooldown, reduced to what evidence needs. */
function cooldownDiagnosticsOf(entry: ProtectionTokenCooldown): ProtectionCooldownDiagnostics {
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
      // Author-written and FIXED, like Assassination's: the resolution outcome
      // (`offensive.outcome`) is an internal vocabulary constant and is not
      // interpolated into a string that reaches the public `detail` field.
      "The pinned SimulationCraft Protection Paladin authority artifact could not be resolved, so no offensive decision was evaluated.",
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
    gloryOfTheVanguard: resolveProtectionApexTrait(observedTalents, 1),
    blessedAssurance: resolveProtectionTalent(observedTalents, "blessed_assurance"),
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
  // The wings cooldown a HYPOTHETICAL wings execution would start for this
  // actor: the pinned base after the censused static modifiers, as a lower
  // bound over both wings records. Established once from the build, not per
  // decision, and null when either record refuses.
  const wingsCooldownLowerBoundMs = wingsCooldownLowerBoundFor(observedTalents);

  const comparisons: ObservedActionComparison[] = [];
  const excluded: ExcludedProtectionCast[] = [];
  const holyPower: ProtectionCastHolyPower[] = [];
  const resolved: {
    position: number;
    diagnostics: ProtectionResolverDiagnostics;
    selection: ProtectionSelectionDiagnostics;
    auras: readonly ProtectionAuraBinding[];
    cooldowns: readonly ProtectionCooldownDiagnostics[];
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
    // which the pinned Protection APL never asks about anyway. Buff atoms are
    // bound from OBSERVED transitions strictly before the decision (Sentinel
    // wings, Vanguard) or from the observed BUILD (the Templar-only and
    // Blessed Assurance absences); cooldowns from observed casts; everything
    // else is enumerated, and a verdict survives only if it holds under every
    // assignment.
    const auras = bindSupportedProtectionAuras({
      state,
      actorId,
      position,
      talents: {
        sentinel: build.sentinel,
        glory_of_the_vanguard: build.gloryOfTheVanguard,
        blessed_assurance: build.blessedAssurance,
      },
      heroTree: build.heroTree,
    });
    const cooldowns = deriveSupportedProtectionCooldowns({ state, actorId, position, observedTalents });
    const bindings: AtomBindings = {
      comboPoints: unknownNumber("STATE_NOT_MODELLED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: protectionBuffBindingsFrom(auras),
      knownTalents: resolution.diagnostics.knownTalents,
      knownCooldownRemainsSeconds: protectionCooldownBindingsFrom(cooldowns),
      specAtoms: resolution.specAtoms,
    };
    const readiness: ProtectionReadinessFact[] = cooldowns.map((entry) => ({
      simcToken: entry.simcToken,
      readiness: entry.readiness,
      abilityGameId: entry.readinessAbilityGameId,
    }));
    // Hammer of Wrath's own ready() requires its readiness aura (1277026)
    // outside wings; an OBSERVED removal proves it unusable. Silence never does.
    const auraGates: ProtectionAuraGateFact[] = auras.flatMap((aura) =>
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

    const outcome = protectionFirstGcdSelectionAt({
      authority,
      bindings,
      buildFacts,
      observedAbilityGameId: abilityGameId,
      readiness,
      auraGates,
      wingsCooldownLowerBoundMs,
    });

    resolved.push({
      position,
      diagnostics: resolution.diagnostics,
      selection: selectionDiagnosticsOf(outcome.result),
      auras,
      cooldowns: cooldowns.map(cooldownDiagnosticsOf),
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
