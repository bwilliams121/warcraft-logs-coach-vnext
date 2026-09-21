/**
 * The Blood Death Knight observed-decision facade (M11-B2, INTERNAL_ONLY).
 *
 * WHAT IT IS
 *
 * One pure function over an ALREADY-INGESTED normalized fight. It enumerates
 * the observed foreground casts of one Blood Death Knight, evaluates each
 * cast of a SUPPORTED rotational token against the pinned offensive
 * authority through the nested unselectability proof and the shared
 * first-GCD query, records what Runes and Runic Power each cast observed,
 * and reports the decision domains separately. Nothing selects it for a
 * public request: the registration is INTERNAL_ONLY, and what this returns
 * is read by the internal lookup, the corpus and tests.
 *
 * WHAT IT IS FOR: MEASUREMENT. The M11-B cohort exists because the shared
 * engine had never traversed a `run_action_list` authority on real
 * evidence. This facade records, for every eligible decision, WHERE the
 * root scan stopped and on WHICH atoms (`stoppingPoint`), and every
 * dispatch entry the root scan visited with the outcome the engine gave it
 * (`dispatches`), and tallies both in the coverage disclosure. Those
 * numbers — not a MATCH count — are the deliverable.
 *
 * WHAT IT DELIBERATELY IS NOT
 *
 * - Not a fetcher, not a transport, not a coach: no network, no HTTP, no
 *   score, no severity, no vocabulary for correctness anywhere in the result.
 * - Not a survival evaluator. Death Strike is judged here ONLY as the
 *   offensive list's spender (`domains.ts`); its mitigation and healing are
 *   domains with no authority.
 * - Not a resource simulator. Runes and Runic Power are read where a cast
 *   observed them (PRE_COST on a costed entry) and reported NO_OBSERVATION
 *   everywhere else. No amount is carried between decisions and nothing
 *   regenerates.
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
 *     GCD lane, in-domain, not supported    excluded  OUTSIDE_FIRST_SLICE
 *     death_strike / heart_strike (incl. its Vampiric Strike execution) /
 *     blood_boil / marrowrend / deaths_caress
 *                                           ELIGIBLE  -> proof + first-GCD query -> comparison
 *
 * `death_and_decay` (the `any_dnd` alias's resolution) and
 * `dancing_rune_weapon` are in-domain GCD casts the slice observes and
 * does not judge: Death and Decay because the alias/token identity question
 * (`any_dnd` in the list, `death_and_decay` on the wire) is itself a
 * measured stopping point for the token-string comparison, Dancing Rune
 * Weapon because its gate reads PREDICTIVE state the slice cannot decide.
 *
 * MATCH MEANS AUTHORITY_COMPATIBLE_ONLY, after the non-domain exclusion.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
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
  bloodExecutionLaneForAbility,
  bloodTokenByAbilityId,
} from "../../../data/game/deathknight-blood-gcd-semantics.js";
import {
  bloodModelledTalentNames,
  resolveBloodHeroTree,
  resolveBloodModelledTalents,
  resolveBloodTalent,
} from "../../../data/game/deathknight-blood-talents.js";
import type {
  HeroTreeResolution,
  ObservedTalentEntry,
  TalentResolution,
} from "../../../data/game/talent-selection.js";
import type { BloodBuildFacts, BloodReadinessFact } from "./action-profile.js";
import {
  bindSupportedBloodAuras,
  bindSupportedBloodStacks,
  bloodBuffBindingsFrom,
  bloodStackBindingsFrom,
  type BloodAuraBinding,
  type BloodStackBinding,
} from "./aura-bindings.js";
import {
  bindSupportedBloodRemains,
  bloodRemainsBindingsFrom,
  type BloodRemainsBinding,
} from "./aura-remains.js";
import {
  bindBloodRunicPower,
  bloodRunicPowerDeficitBinding,
  type BloodRunicPowerState,
} from "./runic-power-state.js";
import {
  bloodRuneAffordability,
  pinnedMarrowrend,
  type BloodRuneAffordability,
} from "./rune-affordability.js";
import {
  bloodCooldownBindingsFrom,
  deriveSupportedBloodCooldowns,
  type BloodDerivedCooldown,
  type BloodTokenCooldown,
} from "./cooldown-bindings.js";
import { standaloneBloodAuthorityAccess } from "./authority-bindings.js";
import { bloodDomainResults, type BloodDomainResults } from "./domains.js";
import {
  bloodFirstGcdSelectionAt,
  type BloodDispatchStep,
  type BloodFirstGcdQueryOutcome,
  type BloodStoppingPoint,
  type BloodUndecidedCandidate,
} from "./first-gcd-adapter.js";
import {
  proveObservedActionUnselectable,
  type ObservedActionUnselectability,
} from "./observed-action-gate.js";
import { resolveBloodAtoms, type BloodResolverDiagnostics } from "./resolver.js";
import { bloodResourceOn, bloodResourceWireTypes, type BloodCastResources } from "./resources.js";
import { BLOOD_DEATH_KNIGHT_SPEC_ID } from "./spec.js";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The observed tokens the slice judges. Everything else in-domain is OUTSIDE_FIRST_SLICE. */
export const FIRST_SLICE_TOKENS = Object.freeze([
  "death_strike",
  "heart_strike",
  "blood_boil",
  "marrowrend",
  "deaths_caress",
] as const);

/** Why an observed cast is NOT an eligible decision. Counted, never dropped. */
export type BloodExclusionReason =
  /** Warcraft Logs flags the cast `melee`: an auto-attack swing, not a foreground press. */
  | "MELEE_SWING"
  /** Proven off-GCD by the pinned lane data (Raise Dead, Vampiric Blood, Anti-Magic Shell, …). */
  | "NON_GCD_ACTION"
  /** The pinned dataset carries no lane record for the ability. */
  | "EXECUTION_LANE_NOT_ESTABLISHED"
  /** A GCD action with no pinned authority token. */
  | "NO_AUTHORITY_TOKEN_BINDING"
  /** An in-domain GCD action the slice observes but does not judge (Death and Decay, Dancing Rune Weapon, …). */
  | "OUTSIDE_FIRST_SLICE";

export const BLOOD_EXCLUSION_REASONS = [
  "MELEE_SWING",
  "NON_GCD_ACTION",
  "EXECUTION_LANE_NOT_ESTABLISHED",
  "NO_AUTHORITY_TOKEN_BINDING",
  "OUTSIDE_FIRST_SLICE",
] as const satisfies readonly BloodExclusionReason[];

export interface ExcludedBloodCast {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly reason: BloodExclusionReason;
}

export interface CountOf<T extends string> {
  readonly key: T;
  readonly count: number;
}

/** The coverage disclosure. The denominator is `eligibleDecisions` and nothing else. */
export interface BloodDecisionCoverage {
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
  readonly exclusions: readonly CountOf<BloodExclusionReason>[];
  readonly excludedCastCount: number;
  /** Every eligible decision's root-scan stopping entry -> count (`(root scan resolved)` when none). */
  readonly stoppingEntries: readonly CountOf<string>[];
  /** Every eligible decision's root-scan stopping entry AND atom, as `list[ordinal] token | atom` -> count. */
  readonly stoppingAtoms: readonly CountOf<string>[];
  /** Every dispatch step of every eligible decision's root scan, as `list[ordinal] -> callee : outcome` -> count. */
  readonly dispatchOutcomes: readonly CountOf<string>[];
  /**
   * Every GCD_CONSUMING entry some eligible decision's root scan recorded
   * MAY_SELECT, as `list[ordinal] token | atom` -> count. A competing
   * candidate the stopping entry does not name, and the second thing a
   * reader needs before believing a stopping point is the ONLY obstacle.
   */
  readonly undecidedGcdCandidates: readonly CountOf<string>[];
  /**
   * Every eligible decision's `buff.<name>.remains` evidence, per modelled
   * aura, as `atom | EXACT / BOUNDED / WINDOW_ORDER_INVARIANT_BOUNDED / ZERO_BY_PROOF / PERMANENT / <unbound reason>`
   * -> count (M11-B4). The census the remains slice exists to take.
   */
  readonly remainsEvidence: readonly CountOf<string>[];
  /**
   * Every pre-decision-window refusal across the aura, stack and remains
   * bindings, as `atom | <binding kind> | lead <ms>` -> count, so the cost
   * of the Blood window is visible (M11-B4).
   */
  readonly preDecisionWindowRefusals: readonly CountOf<string>[];
  /**
   * Every eligible decision's Runic Power evidence, as
   * `OWN_PRE_COST / CARRIED_EXACT / WINDOW_BOUNDED / <unbound reason>` -> count
   * (M11-B5). The census the Runic Power slice exists to take.
   */
  readonly runicPowerEvidence: readonly CountOf<string>[];
  /** Every window observation's lead across the eligible decisions, as `lead <ms>` -> count (M11-B5). */
  readonly runicPowerWindowLeads: readonly CountOf<string>[];
  /**
   * Every eligible decision's `buff.<name>.stack` evidence, per modelled
   * stack atom, as `atom | <proof> / <unbound reason>` -> count (M11-B6).
   * The census the Blood Debt slice exists to take; each atom's rows sum to
   * the eligible population.
   */
  readonly stackEvidence: readonly CountOf<string>[];
  /** Every BOUND stack value across the eligible decisions, as `atom | stack <n>` -> count (M11-B6). */
  readonly stackValues: readonly CountOf<string>[];
  /**
   * Every eligible decision's Marrowrend Rune-affordability evidence, as
   * `OWN_PRE_COST_AFFORDABLE / OWN_PRE_COST_BELOW_COST / NO_RUNE_OBSERVATION /
   * MODIFIER_UNPROVEN / AUTHORITY_NOT_PINNED` -> count (M11-B7). The census
   * the Rune slice exists to take; the rows sum to the eligible population.
   */
  readonly runeAffordabilityEvidence: readonly CountOf<string>[];
  /** Every EXACT own-cast Rune count across the eligible decisions, as `runes <n>` -> count (M11-B7). */
  readonly runeCounts: readonly CountOf<string>[];
}

/** The build facts the evaluator resolved once from the actor's combatant info. */
export interface BloodBuildResolution {
  readonly talents: Readonly<Record<string, TalentResolution>>;
  readonly heroTree: HeroTreeResolution;
}

/** One derived cooldown at a decision, as the payload carries it. */
export interface BloodCooldownDiagnostics {
  readonly simcToken: string;
  readonly readiness: BloodTokenCooldown["readiness"];
  readonly readinessAbilityGameId: number | null;
  readonly remainsSeconds: BloodTokenCooldown["remainsSeconds"];
  readonly perAbility: readonly {
    readonly abilityGameId: number;
    readonly effectiveBase: BloodDerivedCooldown["effectiveBase"];
    readonly staticModifiers: BloodDerivedCooldown["staticModifiers"];
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
export interface BloodSelectionDiagnostics {
  readonly kind: RotationalGcdResult["kind"];
  /** The entry the engine stopped at, as `list[ordinal] token`, or `null`. */
  readonly blockedAt: string | null;
  readonly detail: string | null;
  /** The ROOT scan's innermost BLOCKED step, as `list[ordinal] token`, or null (`first-gcd-adapter.ts`). */
  readonly rootScanBlockedAt: string | null;
  readonly rootScanBlocker: string | null;
  /** Every dispatch entry the ROOT scan visited, in visit order. */
  readonly dispatches: readonly BloodDispatchStep[];
  /** The ROOT scan's stopping point with its atoms, or null when it resolved. */
  readonly stoppingPoint: BloodStoppingPoint | null;
  /** Every MAY_SELECT step of the ROOT scan, in visit order. */
  readonly undecidedCandidates: readonly BloodUndecidedCandidate[];
}

/** The unselectability proof's outcome, reduced to what evidence needs. */
export interface BloodUnselectabilityDiagnostics {
  readonly proven: boolean;
  readonly refusal: string | null;
  readonly at: string | null;
}

/** What Blood attaches to an analyzed envelope: ITS payload. */
export interface BloodDeathKnightPayload {
  readonly comparisons: readonly ObservedActionComparison[];
  readonly excluded: readonly ExcludedBloodCast[];
  readonly coverage: BloodDecisionCoverage;
  readonly domains: BloodDomainResults;
  readonly resources: readonly BloodCastResources[];
  readonly build: BloodBuildResolution;
  /** The resolver's diagnostics at each eligible decision, by position. */
  readonly resolved: readonly {
    readonly position: number;
    readonly diagnostics: BloodResolverDiagnostics;
    readonly auras: readonly BloodAuraBinding[];
    readonly stacks: readonly BloodStackBinding[];
    /** The remains bindings at this decision, one per modelled aura (M11-B4). */
    readonly remains: readonly BloodRemainsBinding[];
    /** The Runic Power state at this decision (M11-B5). */
    readonly runicPower: BloodRunicPowerState;
    /** Marrowrend's Rune affordability at this decision, from the decision cast's own Rune entry (M11-B7). */
    readonly runeAffordability: BloodRuneAffordability;
    readonly cooldowns: readonly BloodCooldownDiagnostics[];
    readonly selection: BloodSelectionDiagnostics;
    readonly unselectability: BloodUnselectabilityDiagnostics;
  }[];
}

export type BloodDeathKnightAnalysis = SpecAnalysisEnvelope<
  typeof BLOOD_DEATH_KNIGHT_SPEC_ID,
  BloodDeathKnightPayload
>;

export interface BloodAnalysisInput extends SpecAnalysisInput {
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
): BloodDeathKnightAnalysis {
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

/** A tally over an open key space, in first-seen order. */
function tallyOpen(counts: ReadonlyMap<string, number>): readonly CountOf<string>[] {
  return [...counts].map(([key, count]) => ({ key, count }));
}

function bump(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** The actor's combatant snapshot: talents, or `null` when none was captured. */
function combatantSnapshotFor(
  state: CombatState,
  actorId: number,
): { readonly talents: readonly ObservedTalentEntry[] } | null {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "COMBATANT_INFO") continue;
    if (event.snapshot.actorId !== actorId) continue;
    return { talents: event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId })) };
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

function stepLabel(step: { listName: string; priorityOrdinal: number; actionToken: string }): string {
  return `${step.listName}[${String(step.priorityOrdinal)}] ${step.actionToken}`;
}

function selectionDiagnosticsOf(outcome: BloodFirstGcdQueryOutcome): BloodSelectionDiagnostics {
  const { result, rootScan } = outcome;
  const root = {
    rootScanBlockedAt: rootScan.blockedStep,
    rootScanBlocker: rootScan.blocker,
    dispatches: rootScan.dispatches,
    stoppingPoint: rootScan.stoppingPoint,
    undecidedCandidates: rootScan.undecidedCandidates,
  };
  if (result.kind !== "ROTATIONAL_GCD_UNKNOWN")
    return { kind: result.kind, blockedAt: null, detail: null, ...root };
  const step = result.blockedAt;
  return {
    kind: result.kind,
    blockedAt: step === null ? null : stepLabel(step),
    detail: result.detail,
    ...root,
  };
}

function unselectabilityDiagnosticsOf(
  result: ObservedActionUnselectability,
): BloodUnselectabilityDiagnostics {
  if (result.proven) return { proven: true, refusal: null, at: null };
  return {
    proven: false,
    refusal: result.refusal,
    at: result.at === null ? null : `${result.at.listName}[${String(result.at.priorityOrdinal)}]`,
  };
}

/** One derived cooldown, reduced to what evidence needs. */
function cooldownDiagnosticsOf(entry: BloodTokenCooldown): BloodCooldownDiagnostics {
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

/** Every modelled talent's three-way resolution, by name. UNKNOWN is a refusal, kept as one. */
function resolveAllModelledTalents(
  observedTalents: readonly ObservedTalentEntry[],
): Readonly<Record<string, TalentResolution>> {
  const talents: Record<string, TalentResolution> = {};
  for (const simcName of bloodModelledTalentNames()) {
    talents[simcName] = resolveBloodTalent(observedTalents, simcName);
  }
  return talents;
}

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/**
 * Analyses one Blood Death Knight's observed rotational decisions.
 *
 * Decisions are enumerated MECHANICALLY from the normalized fight — every
 * COMPLETE cast by the actor, through M4's own source-actor index, in
 * canonical order. Nothing here indexes the event array, nothing treats an
 * ingestion ordinal as a position, and no timestamp is hard-coded.
 */
export function analyzeObservedBloodDeathKnightDecisions(
  input: BloodAnalysisInput,
): BloodDeathKnightAnalysis {
  const { state, actorId, specId } = input;

  // ---- spec gate, before any Blood rule runs ----
  if (specId !== BLOOD_DEATH_KNIGHT_SPEC_ID) {
    return unsupported(
      "SPEC_NOT_SUPPORTED",
      specId,
      `This evaluator supports '${BLOOD_DEATH_KNIGHT_SPEC_ID}' only. No gameplay evaluation was attempted for this specialization.`,
    );
  }

  const access = input.authority ?? standaloneBloodAuthorityAccess();
  const offensive = access.forDomain("OFFENSIVE_ROTATION");
  if (offensive.outcome !== "AUTHORITY_AVAILABLE") {
    return unsupported(
      "AUTHORITY_NOT_AVAILABLE",
      specId,
      "The pinned SimulationCraft Blood Death Knight authority artifact could not be resolved, so no offensive decision was evaluated.",
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

  const wireTypes = bloodResourceWireTypes();
  if (wireTypes === null) {
    return unsupported(
      "INSUFFICIENT_EVIDENCE",
      specId,
      "The version-scoped resource wire contracts required to read Runes and Runic Power are not available.",
    );
  }

  // ---- build facts, resolved once ----
  const observedTalents = snapshot.talents;
  const talents = resolveAllModelledTalents(observedTalents);
  const heroTree = resolveBloodHeroTree(observedTalents);
  const buildFacts: BloodBuildFacts = { talents, heroTree };
  const build: BloodBuildResolution = { talents, heroTree };
  const knownTalents = resolveBloodModelledTalents(observedTalents);
  const tokens = bloodTokenByAbilityId();
  const marrowrendPin = pinnedMarrowrend();

  const comparisons: ObservedActionComparison[] = [];
  const excluded: ExcludedBloodCast[] = [];
  const resources: BloodCastResources[] = [];
  const resolved: BloodDeathKnightPayload["resolved"][number][] = [];

  for (const position of state.positionsBySourceActor(actorId)) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId) continue;
    const abilityGameId = event.abilityGameId;
    if (abilityGameId === null) continue;

    const exclude = (reason: BloodExclusionReason): void => {
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

    // Every foreground cast's resource observations, eligible or not.
    const runes = bloodResourceOn(state, position, actorId, wireTypes.runes);
    const runicPower = bloodResourceOn(state, position, actorId, wireTypes.runicPower);
    resources.push({
      position,
      locator: event.locator,
      abilityGameId,
      reportTimeMs: event.reportTimeMs,
      runes,
      runicPower,
    });

    const lane = bloodExecutionLaneForAbility(abilityGameId);
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
    const auraInput = { state, actorId, position, talents, heroTree };
    const auras = bindSupportedBloodAuras(auraInput);
    const stacks = bindSupportedBloodStacks(auraInput);
    const remains = bindSupportedBloodRemains(auraInput);
    const cooldowns = deriveSupportedBloodCooldowns({ state, actorId, position, observedTalents });
    const sharedBindings: Omit<AtomBindings, "specAtoms"> = {
      comboPoints: unknownNumber("STATE_NOT_MODELLED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: bloodBuffBindingsFrom(auras),
      knownBuffStacks: bloodStackBindingsFrom(stacks),
      knownBuffRemainsSeconds: bloodRemainsBindingsFrom(remains),
      knownTalents,
      knownCooldownRemainsSeconds: bloodCooldownBindingsFrom(cooldowns),
    };
    const runicPowerState = bindBloodRunicPower({ state, actorId, position });
    const resolution = resolveBloodAtoms({
      runes,
      runicPower,
      runicPowerDeficit: bloodRunicPowerDeficitBinding(runicPowerState),
      heroTree,
      fightTimeMs: event.fightTimeMs,
    });
    const bindings: AtomBindings = { ...sharedBindings, specAtoms: resolution.specAtoms };

    const readiness: BloodReadinessFact[] = cooldowns.map((entry) => ({
      simcToken: entry.simcToken,
      readiness: entry.readiness,
      abilityGameId: entry.readinessAbilityGameId,
    }));
    // Marrowrend's affordability from THIS cast's own Rune entry and the
    // resolved hero tree (M11-B7). Computed per decision, carried nowhere.
    const runeAffordability = bloodRuneAffordability(runes, heroTree, marrowrendPin);

    const outcome = bloodFirstGcdSelectionAt({
      authority,
      bindings,
      buildFacts,
      observedAbilityGameId: abilityGameId,
      readiness,
      runeAffordability,
    });
    const result = outcome.result;

    // Blood's own proof that the authority could not have selected the
    // observed action here, across every list (`observed-action-gate.ts`).
    const unselectable = proveObservedActionUnselectable({ authority, observedToken, bindings, buildFacts });

    resolved.push({
      position,
      diagnostics: resolution.diagnostics,
      auras,
      stacks,
      remains,
      runicPower: runicPowerState,
      runeAffordability,
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
    specId: BLOOD_DEATH_KNIGHT_SPEC_ID,
    authority: metadataOf(authority),
    comparisons,
    excluded,
    coverage: summarizeBloodDecisions(actorId, comparisons, excluded, resolved),
    domains: bloodDomainResults(access, state.fight.completeness.categories.INTERRUPTS.capability),
    resources,
    build,
    resolved,
  };
}

/** The label the tallies use when a root scan resolved. */
export const ROOT_SCAN_RESOLVED = "(root scan resolved)";

/** Counts the comparisons. The three outcomes partition the eligible decisions exactly. */
export function summarizeBloodDecisions(
  actorId: number,
  comparisons: readonly ObservedActionComparison[],
  excluded: readonly ExcludedBloodCast[],
  resolved: BloodDeathKnightPayload["resolved"],
): BloodDecisionCoverage {
  let match = 0;
  let rejected = 0;
  let unknown = 0;
  let exactEntryMatches = 0;
  let tokenConvergedMatches = 0;
  const precision = new Map<DecisionCoverage, number>();
  const bases = new Map<ComparisonBasis, number>();
  const blockers = new Map<DecisionBlockerClass, number>();
  const exclusions = new Map<BloodExclusionReason, number>();
  const stoppingEntries = new Map<string, number>();
  const stoppingAtoms = new Map<string, number>();
  const dispatchOutcomes = new Map<string, number>();
  const undecidedGcdCandidates = new Map<string, number>();
  const remainsEvidence = new Map<string, number>();
  const preDecisionWindowRefusals = new Map<string, number>();
  const runicPowerEvidence = new Map<string, number>();
  const runicPowerWindowLeads = new Map<string, number>();
  const stackEvidence = new Map<string, number>();
  const stackValues = new Map<string, number>();
  const runeAffordabilityEvidence = new Map<string, number>();
  const runeCounts = new Map<string, number>();

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
  for (const entry of resolved) {
    const { stoppingPoint, dispatches } = entry.selection;
    if (stoppingPoint === null) {
      bump(stoppingEntries, ROOT_SCAN_RESOLVED);
    } else {
      bump(stoppingEntries, stoppingPoint.at);
      for (const atom of stoppingPoint.atoms) bump(stoppingAtoms, `${stoppingPoint.at} | ${atom}`);
    }
    for (const dispatch of dispatches) {
      bump(dispatchOutcomes, `${dispatch.at} -> ${dispatch.calleeListName ?? "?"} : ${dispatch.outcome}`);
    }
    for (const candidate of entry.selection.undecidedCandidates) {
      if (candidate.lane !== "GCD_CONSUMING") continue;
      for (const atom of candidate.atoms) bump(undecidedGcdCandidates, `${candidate.at} | ${atom}`);
    }
    for (const binding of entry.remains) {
      bump(remainsEvidence, `${binding.atomName} | ${remainsEvidenceClassOf(binding)}`);
      if (binding.state === "UNBOUND" && binding.windowTransition !== null) {
        bump(
          preDecisionWindowRefusals,
          `${binding.atomName} | remains | lead ${String(binding.windowTransition.leadMs)}`,
        );
      }
    }
    for (const binding of entry.auras) {
      if (binding.state === "UNBOUND" && binding.windowTransition !== null) {
        bump(
          preDecisionWindowRefusals,
          `${binding.atomName} | up | lead ${String(binding.windowTransition.leadMs)}`,
        );
      }
    }
    for (const binding of entry.stacks) {
      bump(
        stackEvidence,
        `${binding.atomName} | ${binding.state === "UNBOUND" ? binding.reason : binding.proof}`,
      );
      if (binding.state === "BOUND")
        bump(stackValues, `${binding.atomName} | stack ${String(binding.stack)}`);
      // M11-B9: a finite set is censused as the set, never as either member.
      if (binding.state === "BOUND_SET")
        bump(stackValues, `${binding.atomName} | stack one of {${binding.possibleStacks.join(",")}}`);
      if (binding.state === "UNBOUND" && binding.windowTransition !== null) {
        bump(
          preDecisionWindowRefusals,
          `${binding.atomName} | stack | lead ${String(binding.windowTransition.leadMs)}`,
        );
      }
    }
    const rp = entry.runicPower;
    bump(runicPowerEvidence, rp.state === "BOUND" ? rp.proof : rp.reason);
    if (rp.state === "BOUND") {
      for (const item of rp.windowEntries) bump(runicPowerWindowLeads, `lead ${String(item.leadMs)}`);
    }
    const affordability = entry.runeAffordability;
    bump(runeAffordabilityEvidence, affordability.evidence);
    if (affordability.runes.state === "EXACT") {
      bump(runeCounts, `runes ${String(affordability.runes.amount)}`);
    }
  }

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
    exclusions: tally(BLOOD_EXCLUSION_REASONS, exclusions),
    excludedCastCount: excluded.length,
    stoppingEntries: tallyOpen(stoppingEntries),
    stoppingAtoms: tallyOpen(stoppingAtoms),
    dispatchOutcomes: tallyOpen(dispatchOutcomes),
    undecidedGcdCandidates: tallyOpen(undecidedGcdCandidates),
    remainsEvidence: tallyOpen(remainsEvidence),
    preDecisionWindowRefusals: tallyOpen(preDecisionWindowRefusals),
    runicPowerEvidence: tallyOpen(runicPowerEvidence),
    runicPowerWindowLeads: tallyOpen(runicPowerWindowLeads),
    stackEvidence: tallyOpen(stackEvidence),
    stackValues: tallyOpen(stackValues),
    runeAffordabilityEvidence: tallyOpen(runeAffordabilityEvidence),
    runeCounts: tallyOpen(runeCounts),
  };
}

/** The evidence class of one remains binding, as the census keys it. */
export function remainsEvidenceClassOf(binding: BloodRemainsBinding): string {
  if (binding.state === "UNBOUND") return binding.reason;
  switch (binding.proof) {
    case "GAIN_ANCHOR_EXACT":
      return "EXACT";
    case "GAIN_ANCHOR_BOUNDED":
      return "BOUNDED";
    case "WINDOW_ORDER_INVARIANT_BOUNDED":
      return "WINDOW_ORDER_INVARIANT_BOUNDED";
    case "PERMANENT_ACTIVE":
      return "PERMANENT";
    default:
      return "ZERO_BY_PROOF";
  }
}
