/**
 * The Brewmaster Monk observed-decision facade (M11-C2, INTERNAL_ONLY).
 *
 * WHAT IT IS
 *
 * One pure function over an ALREADY-INGESTED normalized fight. It enumerates
 * the observed foreground casts of one Brewmaster Monk, evaluates each cast
 * of a SUPPORTED offensive token against the pinned offensive authority
 * through the nested unselectability proof and the shared first-GCD query,
 * and reports the decision domains separately. Nothing selects it for a
 * public request: the registration is INTERNAL_ONLY, and what this returns is
 * read by the internal lookup, the corpus and tests.
 *
 * WHAT IT IS FOR: MEASUREMENT. The next cohort's representative is a tank
 * whose pinned authority dispatches two hero-tree lists by
 * `run_action_list`, interleaves NON_GCD brews with GCD actions, and reads
 * brew charges and continuous Energy. This facade records, for every eligible
 * decision, WHERE the root scan stopped and on WHICH atoms
 * (`stoppingPoint`), every dispatch entry the root scan visited with the
 * outcome the engine gave it (`dispatches`), and every competing GCD
 * candidate, and tallies all of them in the coverage disclosure. Those
 * numbers — not a MATCH count — are the deliverable.
 *
 * WHAT IT DELIBERATELY IS NOT
 *
 * - Not a fetcher, not a transport, not a coach: no network, no HTTP, no
 *   score, no severity, no vocabulary for correctness anywhere in the result.
 * - Not a survival evaluator. The brews and Expel Harm are judged nowhere
 *   here; their defensive meaning belongs to domains with no authority
 *   (`domains.ts`).
 * - Not a resource simulator. No Energy is read, carried or regenerated; no
 *   brew charge is modelled. Gates that need either stay undecided.
 * - Not a racial, potion or trinket evaluator: those entries are outside the
 *   rotational decision domain (`domain-boundary.ts`).
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
 *     keg_smash / blackout_kick / tiger_palm / breath_of_fire / invoke_niuzao
 *                                           ELIGIBLE  -> proof + first-GCD query -> comparison
 *
 * `celestial_brew`, `expel_harm`, `chi_burst`, `exploding_keg`,
 * `empty_the_cellar` and `rushing_jade_wind` are in-domain GCD tokens the
 * slice observes and does not judge.
 *
 * NO VALIDATED-PROFILE GATE. The slice is INTERNAL_ONLY and exists to be
 * measured; it analyzes whatever hero tree the observed tree resolves to,
 * truthfully (`resolver.ts`). A build that resolves to NO hero tree leaves
 * both run gates unbound, and the measurement records the resulting
 * UNDECIDED_RUN_GATE rather than refusing the actor.
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
  brewmasterBaseGcdMsForAbility,
  brewmasterExecutionLaneForAbility,
  brewmasterTokenByAbilityId,
} from "../../../data/game/monk-brewmaster-gcd-semantics.js";
import {
  brewmasterModelledTalentNames,
  resolveBrewmasterApexTrait,
  resolveBrewmasterHeroTree,
  resolveBrewmasterModelledTalents,
  resolveBrewmasterTalent,
} from "../../../data/game/monk-brewmaster-talents.js";
import type {
  HeroTreeResolution,
  ObservedTalentEntry,
  TalentResolution,
} from "../../../data/game/talent-selection.js";
import type { BrewmasterBuildFacts, BrewmasterReadinessFact } from "./action-profile.js";
import {
  bindSupportedBrewmasterAuras,
  brewmasterBuffBindingsFrom,
  resolveBrewmasterReadinessAuraFacts,
  type BrewmasterAuraBinding,
  type BrewmasterReadinessAuraFact,
} from "./aura-bindings.js";
import {
  brewmasterCooldownBindingsFrom,
  deriveSupportedBrewmasterCooldowns,
  type BrewmasterTokenCooldown,
} from "./cooldown-bindings.js";
import { standaloneBrewmasterAuthorityAccess } from "./authority-bindings.js";
import { brewmasterDomainResults, type BrewmasterDomainResults } from "./domains.js";
import {
  brewmasterFirstGcdSelectionAt,
  type BrewmasterDispatchStep,
  type BrewmasterFirstGcdQueryOutcome,
  type BrewmasterStoppingPoint,
  type BrewmasterUndecidedCandidate,
} from "./first-gcd-adapter.js";
import {
  proveObservedActionUnselectable,
  type ObservedActionUnselectability,
} from "./observed-action-gate.js";
import { resolveBrewmasterAtoms, type BrewmasterResolverDiagnostics } from "./resolver.js";
import { BREWMASTER_MONK_SPEC_ID } from "./spec.js";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The observed tokens the slice judges. Everything else in-domain is OUTSIDE_FIRST_SLICE. */
export const FIRST_SLICE_TOKENS = Object.freeze([
  "keg_smash",
  "blackout_kick",
  "tiger_palm",
  "breath_of_fire",
  "invoke_niuzao",
] as const);

/** Why an observed cast is NOT an eligible decision. Counted, never dropped. */
export type BrewmasterExclusionReason =
  /** Warcraft Logs flags the cast `melee`: an auto-attack swing, not a foreground press. */
  | "MELEE_SWING"
  /** Proven off-GCD by the pinned lane data (Purifying Brew, Black Ox Brew, Fortifying Brew, …). */
  | "NON_GCD_ACTION"
  /** The pinned dataset carries no lane record for the ability (Provoke, Gift of the Ox, a potion, …). */
  | "EXECUTION_LANE_NOT_ESTABLISHED"
  /** A GCD action with no pinned authority token. */
  | "NO_AUTHORITY_TOKEN_BINDING"
  /** An in-domain GCD action the slice observes but does not judge (Celestial Brew, Expel Harm, …). */
  | "OUTSIDE_FIRST_SLICE";

export const BREWMASTER_EXCLUSION_REASONS = [
  "MELEE_SWING",
  "NON_GCD_ACTION",
  "EXECUTION_LANE_NOT_ESTABLISHED",
  "NO_AUTHORITY_TOKEN_BINDING",
  "OUTSIDE_FIRST_SLICE",
] as const satisfies readonly BrewmasterExclusionReason[];

export interface ExcludedBrewmasterCast {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly reason: BrewmasterExclusionReason;
}

export interface CountOf<T extends string> {
  readonly key: T;
  readonly count: number;
}

/** The coverage disclosure. The denominator is `eligibleDecisions` and nothing else. */
export interface BrewmasterDecisionCoverage {
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
  readonly exclusions: readonly CountOf<BrewmasterExclusionReason>[];
  readonly excludedCastCount: number;
  /** Every eligible decision's observed token -> count. */
  readonly eligibleTokens: readonly CountOf<string>[];
  /**
   * Every UNKNOWN decision's engine refusal, as `<raw blocker> @ <list[ordinal] token>` -> count: the
   * blocker the first-GCD query returned and the entry it names (the refused NON_GCD branch, or the
   * head of the diverging worlds). The root scan may resolve and the query still refuse, so this is
   * the tally that says why each UNKNOWN is UNKNOWN.
   */
  readonly unresolvedAt: readonly CountOf<string>[];
  /** Every eligible decision's root-scan stopping entry -> count (`(root scan resolved)` when none). */
  readonly stoppingEntries: readonly CountOf<string>[];
  /** Every eligible decision's root-scan stopping entry AND atom, as `list[ordinal] token | atom` -> count. */
  readonly stoppingAtoms: readonly CountOf<string>[];
  /** Every dispatch step of every eligible decision's root scan, as `list[ordinal] -> callee : outcome` -> count. */
  readonly dispatchOutcomes: readonly CountOf<string>[];
  /**
   * Every GCD_CONSUMING entry some eligible decision's root scan recorded
   * MAY_SELECT, as `list[ordinal] token | atom` -> count: the competing
   * candidates a reader needs before believing a stopping point is the ONLY
   * obstacle.
   */
  readonly undecidedGcdCandidates: readonly CountOf<string>[];
  /** Every NON_GCD entry some eligible decision's root scan recorded MAY_SELECT, same keying. */
  readonly undecidedNonGcdCandidates: readonly CountOf<string>[];
  /** Every eligible decision's `buff.<name>.up` evidence, as `atom | up <bool> (<proof>) / <reason>` -> count. */
  readonly auraEvidence: readonly CountOf<string>[];
  /** Every eligible decision's readiness-aura evidence, as `token | <state or reason>` -> count. */
  readonly readinessAuraEvidence: readonly CountOf<string>[];
  /** Every eligible decision's cooldown readiness per pinned token, as `token | <readiness or reason>` -> count. */
  readonly cooldownReadiness: readonly CountOf<string>[];
  /**
   * Every non-melee COMPLETE cast by the actor, by pinned execution lane and
   * base GCD, as `<lane> | <baseGcdMs> ms` (`no record` when the dataset has
   * none) -> count.
   */
  readonly gcdDistribution: readonly CountOf<string>[];
}

/** The build facts the evaluator resolved once from the actor's combatant info. */
export interface BrewmasterBuildResolution {
  readonly talents: Readonly<Record<string, TalentResolution>>;
  readonly heroTree: HeroTreeResolution;
  readonly apex1: TalentResolution;
  readonly apex3: TalentResolution;
}

/** One derived cooldown at a decision, as the payload carries it. */
export interface BrewmasterCooldownDiagnostics {
  readonly simcToken: string;
  readonly readiness: BrewmasterTokenCooldown["readiness"];
  readonly readinessAbilityGameId: number | null;
  readonly remainsSeconds: BrewmasterTokenCooldown["remainsSeconds"];
  readonly perAbility: readonly {
    readonly abilityGameId: number;
    readonly effectiveBase: BrewmasterTokenCooldown["perAbility"][number]["effectiveBase"];
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
export interface BrewmasterSelectionDiagnostics {
  readonly kind: RotationalGcdResult["kind"];
  /** The entry the engine stopped at, as `list[ordinal] token`, or `null`. */
  readonly blockedAt: string | null;
  readonly detail: string | null;
  /** The ROOT scan's innermost BLOCKED step, as `list[ordinal] token`, or null. */
  readonly rootScanBlockedAt: string | null;
  readonly rootScanBlocker: string | null;
  /** Every dispatch entry the ROOT scan visited, in visit order. */
  readonly dispatches: readonly BrewmasterDispatchStep[];
  /** The ROOT scan's stopping point with its atoms, or null when it resolved. */
  readonly stoppingPoint: BrewmasterStoppingPoint | null;
  /** Every MAY_SELECT step of the ROOT scan, in visit order. */
  readonly undecidedCandidates: readonly BrewmasterUndecidedCandidate[];
}

/** The unselectability proof's outcome, reduced to what evidence needs. */
export interface BrewmasterUnselectabilityDiagnostics {
  readonly proven: boolean;
  readonly refusal: string | null;
  readonly at: string | null;
}

/** What Brewmaster attaches to an analyzed envelope: ITS payload. */
export interface BrewmasterMonkPayload {
  readonly comparisons: readonly ObservedActionComparison[];
  readonly excluded: readonly ExcludedBrewmasterCast[];
  readonly coverage: BrewmasterDecisionCoverage;
  readonly domains: BrewmasterDomainResults;
  readonly build: BrewmasterBuildResolution;
  /** The resolver's diagnostics at each eligible decision, by position. */
  readonly resolved: readonly {
    readonly position: number;
    readonly diagnostics: BrewmasterResolverDiagnostics;
    readonly auras: readonly BrewmasterAuraBinding[];
    readonly readinessAuras: readonly BrewmasterReadinessAuraFact[];
    readonly cooldowns: readonly BrewmasterCooldownDiagnostics[];
    readonly selection: BrewmasterSelectionDiagnostics;
    readonly unselectability: BrewmasterUnselectabilityDiagnostics;
  }[];
}

export type BrewmasterMonkAnalysis = SpecAnalysisEnvelope<
  typeof BREWMASTER_MONK_SPEC_ID,
  BrewmasterMonkPayload
>;

export interface BrewmasterAnalysisInput extends SpecAnalysisInput {
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
): BrewmasterMonkAnalysis {
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

function selectionDiagnosticsOf(outcome: BrewmasterFirstGcdQueryOutcome): BrewmasterSelectionDiagnostics {
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
): BrewmasterUnselectabilityDiagnostics {
  if (result.proven) return { proven: true, refusal: null, at: null };
  return {
    proven: false,
    refusal: result.refusal,
    at: result.at === null ? null : `${result.at.listName}[${String(result.at.priorityOrdinal)}]`,
  };
}

/** One derived cooldown, reduced to what evidence needs. */
function cooldownDiagnosticsOf(entry: BrewmasterTokenCooldown): BrewmasterCooldownDiagnostics {
  return {
    simcToken: entry.simcToken,
    readiness: entry.readiness,
    readinessAbilityGameId: entry.readinessAbilityGameId,
    remainsSeconds: entry.remainsSeconds,
    perAbility: entry.perAbility.map((derived) => ({
      abilityGameId: derived.abilityGameId,
      effectiveBase: derived.effectiveBase,
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
  for (const simcName of brewmasterModelledTalentNames()) {
    talents[simcName] = resolveBrewmasterTalent(observedTalents, simcName);
  }
  return talents;
}

function talentOrNotModelled(
  talents: Readonly<Record<string, TalentResolution>>,
  observedTalents: readonly ObservedTalentEntry[],
  simcName: string,
): TalentResolution {
  return talents[simcName] ?? resolveBrewmasterTalent(observedTalents, simcName);
}

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/**
 * Analyses one Brewmaster Monk's observed rotational decisions.
 *
 * Decisions are enumerated MECHANICALLY from the normalized fight — every
 * COMPLETE cast by the actor, through M4's own source-actor index, in
 * canonical order. Nothing here indexes the event array, nothing treats an
 * ingestion ordinal as a position, and no timestamp is hard-coded.
 */
export function analyzeObservedBrewmasterMonkDecisions(
  input: BrewmasterAnalysisInput,
): BrewmasterMonkAnalysis {
  const { state, actorId, specId } = input;

  // ---- spec gate, before any Brewmaster rule runs ----
  if (specId !== BREWMASTER_MONK_SPEC_ID) {
    return unsupported(
      "SPEC_NOT_SUPPORTED",
      specId,
      `This evaluator supports '${BREWMASTER_MONK_SPEC_ID}' only. No gameplay evaluation was attempted for this specialization.`,
    );
  }

  const access = input.authority ?? standaloneBrewmasterAuthorityAccess();
  const offensive = access.forDomain("OFFENSIVE_ROTATION");
  if (offensive.outcome !== "AUTHORITY_AVAILABLE") {
    return unsupported(
      "AUTHORITY_NOT_AVAILABLE",
      specId,
      "The pinned SimulationCraft Brewmaster Monk authority artifact could not be resolved, so no offensive decision was evaluated.",
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

  // ---- build facts, resolved once ----
  const observedTalents = snapshot.talents;
  const talents = resolveAllModelledTalents(observedTalents);
  const heroTree = resolveBrewmasterHeroTree(observedTalents);
  const apex1 = resolveBrewmasterApexTrait(observedTalents, 1);
  const apex3 = resolveBrewmasterApexTrait(observedTalents, 3);
  const buildFacts: BrewmasterBuildFacts = { talents, heroTree };
  const build: BrewmasterBuildResolution = { talents, heroTree, apex1, apex3 };
  const knownTalents = resolveBrewmasterModelledTalents(observedTalents);
  const resolution = resolveBrewmasterAtoms({
    heroTree,
    blackoutCombo: talentOrNotModelled(talents, observedTalents, "blackout_combo"),
    salsalabimsStrength: talentOrNotModelled(talents, observedTalents, "salsalabims_strength"),
    apex1,
    apex3,
  });
  const tokens = brewmasterTokenByAbilityId();

  const comparisons: ObservedActionComparison[] = [];
  const excluded: ExcludedBrewmasterCast[] = [];
  const gcdDistribution = new Map<string, number>();
  const resolved: BrewmasterMonkPayload["resolved"][number][] = [];

  for (const position of state.positionsBySourceActor(actorId)) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId) continue;
    const abilityGameId = event.abilityGameId;
    if (abilityGameId === null) continue;

    const exclude = (reason: BrewmasterExclusionReason): void => {
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

    const lane = brewmasterExecutionLaneForAbility(abilityGameId);
    const baseGcdMs = brewmasterBaseGcdMsForAbility(abilityGameId);
    bump(gcdDistribution, `${lane} | ${baseGcdMs === null ? "no record" : `${String(baseGcdMs)} ms`}`);
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
    const auras = bindSupportedBrewmasterAuras({ state, actorId, position, talents });
    const cooldowns = deriveSupportedBrewmasterCooldowns({ state, actorId, position, observedTalents });
    const readinessAuras = resolveBrewmasterReadinessAuraFacts({ state, actorId, position });
    const bindings: AtomBindings = {
      comboPoints: unknownNumber("STATE_NOT_MODELLED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: brewmasterBuffBindingsFrom(auras),
      knownTalents,
      knownCooldownRemainsSeconds: brewmasterCooldownBindingsFrom(cooldowns),
      specAtoms: resolution.specAtoms,
    };

    const readiness: BrewmasterReadinessFact[] = cooldowns.map((entry) => ({
      simcToken: entry.simcToken,
      readiness: entry.readiness,
      abilityGameId: entry.readinessAbilityGameId,
    }));

    const outcome = brewmasterFirstGcdSelectionAt({
      authority,
      bindings,
      buildFacts,
      observedAbilityGameId: abilityGameId,
      readiness,
      readinessAuras,
    });

    // Brewmaster's own proof that the authority could not have selected the
    // observed action here, across every list (`observed-action-gate.ts`).
    const unselectable = proveObservedActionUnselectable({ authority, observedToken, bindings, buildFacts });

    resolved.push({
      position,
      diagnostics: resolution.diagnostics,
      auras,
      readinessAuras,
      cooldowns: cooldowns.map(cooldownDiagnosticsOf),
      selection: selectionDiagnosticsOf(outcome),
      unselectability: unselectabilityDiagnosticsOf(unselectable),
    });

    comparisons.push(
      compareObservedAction({
        decision,
        authorityResult: outcome.result,
        observedActionJudgment: null,
        observedActionUnselectable: unselectable.proven ? unselectable.proof : null,
        usabilityProvenance: "OBSERVED_EXECUTION",
      }),
    );
  }

  return {
    status: "ANALYZED",
    specId: BREWMASTER_MONK_SPEC_ID,
    authority: metadataOf(authority),
    comparisons,
    excluded,
    coverage: summarizeBrewmasterDecisions(actorId, comparisons, excluded, resolved, gcdDistribution),
    domains: brewmasterDomainResults(access, state.fight.completeness.categories.INTERRUPTS.capability),
    build,
    resolved,
  };
}

/** The label the tallies use when a root scan resolved. */
export const ROOT_SCAN_RESOLVED = "(root scan resolved)";

/** The census key of one aura binding. */
export function auraEvidenceKeyOf(binding: BrewmasterAuraBinding): string {
  if (binding.state === "UNBOUND") return `${binding.atomName} | ${binding.reason}`;
  return `${binding.atomName} | up ${String(binding.up)} (${binding.proof})`;
}

/** The census key of one readiness-aura fact. */
export function readinessAuraEvidenceKeyOf(fact: BrewmasterReadinessAuraFact): string {
  return `${fact.simcToken} | ${fact.state === "PROVEN_INACTIVE" ? fact.state : fact.reason}`;
}

/** The census key of one token's derived readiness. */
export function cooldownReadinessKeyOf(entry: BrewmasterCooldownDiagnostics): string {
  return `${entry.simcToken} | ${entry.readiness.state === "PROVEN_NOT_READY" ? entry.readiness.state : entry.readiness.reason}`;
}

/** Counts the comparisons. The three outcomes partition the eligible decisions exactly. */
export function summarizeBrewmasterDecisions(
  actorId: number,
  comparisons: readonly ObservedActionComparison[],
  excluded: readonly ExcludedBrewmasterCast[],
  resolved: BrewmasterMonkPayload["resolved"],
  gcdDistribution: ReadonlyMap<string, number> = new Map(),
): BrewmasterDecisionCoverage {
  let match = 0;
  let rejected = 0;
  let unknown = 0;
  let exactEntryMatches = 0;
  let tokenConvergedMatches = 0;
  const precision = new Map<DecisionCoverage, number>();
  const bases = new Map<ComparisonBasis, number>();
  const blockers = new Map<DecisionBlockerClass, number>();
  const exclusions = new Map<BrewmasterExclusionReason, number>();
  const eligibleTokens = new Map<string, number>();
  const unresolvedAt = new Map<string, number>();
  const stoppingEntries = new Map<string, number>();
  const stoppingAtoms = new Map<string, number>();
  const dispatchOutcomes = new Map<string, number>();
  const undecidedGcdCandidates = new Map<string, number>();
  const undecidedNonGcdCandidates = new Map<string, number>();
  const auraEvidence = new Map<string, number>();
  const readinessAuraEvidence = new Map<string, number>();
  const cooldownReadiness = new Map<string, number>();

  comparisons.forEach((comparison, index) => {
    bump(eligibleTokens, comparison.decision.observedToken);
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
      const at = resolved[index]?.selection.blockedAt ?? "(no entry)";
      bump(unresolvedAt, `${comparison.rawBlocker ?? "(no blocker)"} @ ${at}`);
    }
  });
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
      const target = candidate.lane === "GCD_CONSUMING" ? undecidedGcdCandidates : undecidedNonGcdCandidates;
      for (const atom of candidate.atoms) bump(target, `${candidate.at} | ${atom}`);
    }
    for (const binding of entry.auras) bump(auraEvidence, auraEvidenceKeyOf(binding));
    for (const fact of entry.readinessAuras) bump(readinessAuraEvidence, readinessAuraEvidenceKeyOf(fact));
    for (const cooldown of entry.cooldowns) bump(cooldownReadiness, cooldownReadinessKeyOf(cooldown));
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
    exclusions: tally(BREWMASTER_EXCLUSION_REASONS, exclusions),
    excludedCastCount: excluded.length,
    eligibleTokens: tallyOpen(eligibleTokens),
    unresolvedAt: tallyOpen(unresolvedAt),
    stoppingEntries: tallyOpen(stoppingEntries),
    stoppingAtoms: tallyOpen(stoppingAtoms),
    dispatchOutcomes: tallyOpen(dispatchOutcomes),
    undecidedGcdCandidates: tallyOpen(undecidedGcdCandidates),
    undecidedNonGcdCandidates: tallyOpen(undecidedNonGcdCandidates),
    auraEvidence: tallyOpen(auraEvidence),
    readinessAuraEvidence: tallyOpen(readinessAuraEvidence),
    cooldownReadiness: tallyOpen(cooldownReadiness),
    gcdDistribution: tallyOpen(gcdDistribution),
  };
}
