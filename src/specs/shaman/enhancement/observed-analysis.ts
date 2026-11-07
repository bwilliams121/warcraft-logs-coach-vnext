/**
 * The Enhancement Shaman observed-decision facade (ONB-B2).
 *
 * One pure function over an ALREADY-INGESTED normalized fight. It enumerates the observed
 * foreground casts of one Enhancement Shaman, evaluates each cast of a SUPPORTED token against the
 * pinned offensive authority through the shared first-GCD query, and reports the decision
 * domains separately.
 *
 * WHAT IT DELIBERATELY IS NOT. Not a fetcher, a transport or a coach: no network, no score, no
 * severity. Not a resource simulator: only the decision cast's own PRE_COST value is read. Not
 * a racial, potion or trinket evaluator (`domain-boundary.ts`).
 *
 * THE DECISION POPULATION, STATED
 *
 * Every COMPLETE cast by the actor, in canonical order, classified:
 *
 *     melee swing                           excluded  MELEE_SWING
 *     pinned lane NON_GCD                   excluded  NON_GCD_ACTION
 *     no pinned lane record                 excluded  EXECUTION_LANE_NOT_ESTABLISHED
 *     GCD lane, no authority token          excluded  NO_AUTHORITY_TOKEN_BINDING
 *     lightning_bolt, chain_lightning, tempest excluded  OUTSIDE_FIRST_SLICE
 *     every other GCD token                 ELIGIBLE  -> first-GCD query -> comparison
 *
 * MATCH MEANS AUTHORITY_COMPATIBLE_ONLY, after the non-domain exclusion.
 *
 * NO UNSELECTABILITY PROOF, AND NO DECISION RESOLVES. Every comparison passes `null` for the
 * unselectability proof: the conditions it would need FALSE read state this slice does not
 * bind. An off-GCD entry with no reviewed contract and an open condition precedes every GCD
 * action of the pinned list, so the query stays UNKNOWN (`src/specs/shaman/enhancement/README.md`).
 * A decision here is observed and explained, not judged.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import {
  aplAuthorityIdentityOf,
  withEncounterStateAt,
  type SimcProfileProvenance,
} from "../../../findings/simc-profile-fallback.js";
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
import {
  lineSelectionHistoryFromObservedCasts,
  type LineSelectionHistory,
  type ObservedCast,
} from "../../../simc/line-cooldown.js";
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
  enhancementShamanBaseGcdMsForAbility,
  enhancementShamanExecutionLaneForAbility,
  enhancementShamanTokenByAbilityId,
} from "../../../data/game/shaman-enhancement-gcd-semantics.js";
import {
  enhancementShamanModelledTalentNames,
  resolveEnhancementShamanHeroTree,
  resolveEnhancementShamanTalent,
} from "../../../data/game/shaman-enhancement-talents.js";
import type {
  HeroTreeResolution,
  ObservedTalentEntry,
  TalentResolution,
} from "../../../data/game/talent-selection.js";

import type { EnhancementShamanBuildFacts } from "./action-profile.js";
import { standaloneEnhancementShamanAuthorityAccess } from "./authority-bindings.js";
import { enhancementShamanDomainResults, type EnhancementShamanDomainResults } from "./domains.js";
import {
  enhancementShamanFirstGcdSelectionAt,
  type EnhancementShamanDispatchStep,
  type EnhancementShamanFirstGcdQueryOutcome,
  type EnhancementShamanStoppingPoint,
  type EnhancementShamanUndecidedCandidate,
} from "./first-gcd-adapter.js";
import {
  enhancementShamanTalentsDisprovedByHeroTree,
  resolveEnhancementShamanAtoms,
  type EnhancementShamanResolverDiagnostics,
} from "./resolver.js";
import { ENHANCEMENT_SHAMAN_SPEC_ID } from "./spec.js";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * The observed in-domain GCD tokens the slice does not judge. These have a cast time that Maelstrom Weapon shortens: the
 * filtered M13-A capture holds 31 of their begincasts. So each is decided at its start, this facade
 * evaluates state at the observed `cast`, and that would ask the wrong moment.
 */
export const OUTSIDE_FIRST_SLICE_TOKENS = Object.freeze([
  "lightning_bolt",
  "chain_lightning",
  "tempest",
] as const);

/** Why an observed cast is NOT an eligible decision. Counted, never dropped. */
export type EnhancementShamanExclusionReason =
  /** Warcraft Logs flags the cast `melee`: an auto-attack swing, not a foreground press. */
  | "MELEE_SWING"
  /** Proven off-GCD by the pinned lane data. */
  | "NON_GCD_ACTION"
  /** The pinned dataset carries no lane record for the ability. */
  | "EXECUTION_LANE_NOT_ESTABLISHED"
  /** A GCD action with no pinned authority token. */
  | "NO_AUTHORITY_TOKEN_BINDING"
  /** An in-domain GCD action the slice observes but does not judge (lightning_bolt, chain_lightning, tempest). */
  | "OUTSIDE_FIRST_SLICE";

export const ENHANCEMENT_SHAMAN_EXCLUSION_REASONS = [
  "MELEE_SWING",
  "NON_GCD_ACTION",
  "EXECUTION_LANE_NOT_ESTABLISHED",
  "NO_AUTHORITY_TOKEN_BINDING",
  "OUTSIDE_FIRST_SLICE",
] as const satisfies readonly EnhancementShamanExclusionReason[];

export interface ExcludedEnhancementShamanCast {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly reason: EnhancementShamanExclusionReason;
}

export interface CountOf<T extends string> {
  readonly key: T;
  readonly count: number;
}

/** The coverage disclosure. The denominator is `eligibleDecisions` and nothing else. */
export interface EnhancementShamanDecisionCoverage {
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
  readonly exclusions: readonly CountOf<EnhancementShamanExclusionReason>[];
  readonly excludedCastCount: number;
  /** Every eligible decision's observed token -> count. */
  readonly eligibleTokens: readonly CountOf<string>[];
  /** Every UNKNOWN decision's engine refusal, as `<raw blocker> @ <list[ordinal] token>` -> count. */
  readonly unresolvedAt: readonly CountOf<string>[];
  /** Every eligible decision's root-scan stopping entry AND atom, as `list[ordinal] token | atom` -> count. */
  readonly stoppingAtoms: readonly CountOf<string>[];
  /** Every dispatch step of every eligible decision's root scan, as `list[ordinal] -> callee : outcome` -> count. */
  readonly dispatchOutcomes: readonly CountOf<string>[];
  /** Every GCD_CONSUMING entry some root scan recorded MAY_SELECT, as `list[ordinal] token | atom` -> count. */
  readonly undecidedGcdCandidates: readonly CountOf<string>[];
  /** Every NON_GCD entry some root scan recorded MAY_SELECT, same keying. */
  readonly undecidedNonGcdCandidates: readonly CountOf<string>[];
  /** Every non-melee COMPLETE cast by the actor, by pinned execution lane and base GCD -> count. */
  readonly gcdDistribution: readonly CountOf<string>[];
}

/** The build facts the evaluator resolved once from the actor's combatant info. */
export interface EnhancementShamanBuildResolution {
  readonly talents: Readonly<Record<string, TalentResolution>>;
  readonly heroTree: HeroTreeResolution;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: readonly string[];
}

/** The engine's own account of one first-GCD query, reduced to what evidence needs. */
export interface EnhancementShamanSelectionDiagnostics {
  readonly kind: RotationalGcdResult["kind"];
  /** The entry the engine stopped at, as `list[ordinal] token`, or `null`. */
  readonly blockedAt: string | null;
  readonly detail: string | null;
  /** Every dispatch entry the ROOT scan visited, in visit order. */
  readonly dispatches: readonly EnhancementShamanDispatchStep[];
  /** The ROOT scan's stopping point with its atoms, or null when it resolved. */
  readonly stoppingPoint: EnhancementShamanStoppingPoint | null;
  /** Every MAY_SELECT step of the ROOT scan, in visit order. */
  readonly undecidedCandidates: readonly EnhancementShamanUndecidedCandidate[];
}

/** What this specialization attaches to an analyzed envelope: ITS payload. */
export interface EnhancementShamanPayload {
  readonly comparisons: readonly ObservedActionComparison[];
  readonly excluded: readonly ExcludedEnhancementShamanCast[];
  readonly coverage: EnhancementShamanDecisionCoverage;
  readonly domains: EnhancementShamanDomainResults;
  readonly build: EnhancementShamanBuildResolution;
  /** The resolver's diagnostics at each eligible decision, by position. */
  readonly resolved: readonly {
    /** The tier-3 facts this decision was evaluated under, for the view to disclose. */
    readonly profileFacts: readonly SimcProfileProvenance[];
    readonly position: number;
    readonly diagnostics: EnhancementShamanResolverDiagnostics;
    readonly selection: EnhancementShamanSelectionDiagnostics;
  }[];
}

export type EnhancementShamanAnalysis = SpecAnalysisEnvelope<
  typeof ENHANCEMENT_SHAMAN_SPEC_ID,
  EnhancementShamanPayload
>;

export interface EnhancementShamanAnalysisInput extends SpecAnalysisInput {
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
): EnhancementShamanAnalysis {
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

function selectionDiagnosticsOf(
  outcome: EnhancementShamanFirstGcdQueryOutcome,
): EnhancementShamanSelectionDiagnostics {
  const { result, rootScan } = outcome;
  const root = {
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

/** Every modelled talent's three-way resolution, by name. UNKNOWN is a refusal, kept as one. */
function resolveAllModelledTalents(
  observedTalents: readonly ObservedTalentEntry[],
): Readonly<Record<string, TalentResolution>> {
  const talents: Record<string, TalentResolution> = {};
  for (const simcName of enhancementShamanModelledTalentNames()) {
    talents[simcName] = resolveEnhancementShamanTalent(observedTalents, simcName);
  }
  return talents;
}

/** The talents proven not taken: the three-way rule, and the resolved tree's own proof. */
function talentsProvenAbsentFrom(
  talents: Readonly<Record<string, TalentResolution>>,
  heroTree: HeroTreeResolution,
): ReadonlySet<string> {
  const absent = new Set<string>();
  for (const [name, resolution] of Object.entries(talents)) {
    if (resolution.selection === "NOT_SELECTED") absent.add(name);
  }
  for (const name of enhancementShamanTalentsDisprovedByHeroTree(heroTree)) absent.add(name);
  return absent;
}

/** What `AtomBindings.knownTalents` may state: never an UNKNOWN. */
function knownTalentsFrom(
  talents: Readonly<Record<string, TalentResolution>>,
  absent: ReadonlySet<string>,
): readonly { readonly name: string; readonly taken: boolean }[] {
  const known = new Map<string, boolean>();
  for (const [name, resolution] of Object.entries(talents)) {
    if (resolution.selection === "SELECTED") known.set(name, true);
  }
  for (const name of absent) if (!known.has(name)) known.set(name, false);
  return [...known].map(([name, taken]) => ({ name, taken }));
}

/**
 * The selections this actor's observed casts attribute, for `line_cd`.
 *
 * Sole-entry attribution by the shared rule: `bloodlust` has one in-combat entry, so a logged
 * 2825 attributes to it. A cast only bounds a selection from above, and a selection that cast
 * nothing is in no log, so this can prove the timer neither running nor idle, and the shared
 * readiness rule answers UNKNOWN. Cast coverage is passed as null because that rule never reads it.
 */
function observedLineHistory(
  state: CombatState,
  actorId: number,
  authority: AplAuthority,
  tokens: ReadonlyMap<number, string>,
): LineSelectionHistory {
  const casts: ObservedCast[] = [];
  for (const position of state.positionsBySourceActor(actorId)) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId || event.abilityGameId === null) continue;
    const actionToken = tokens.get(event.abilityGameId);
    if (actionToken !== undefined) casts.push({ actionToken, observedAtMs: event.reportTimeMs });
  }
  return lineSelectionHistoryFromObservedCasts({
    authority,
    combatStartMs: state.fight.fight.startTimeMs,
    observedCastCoverage: null,
    casts,
  });
}

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/**
 * Analyses one Enhancement Shaman's observed rotational decisions.
 *
 * Decisions are enumerated MECHANICALLY from the normalized fight: every COMPLETE cast by the
 * actor, through M4's own source-actor index, in canonical order.
 */
export function analyzeObservedEnhancementShamanDecisions(
  input: EnhancementShamanAnalysisInput,
): EnhancementShamanAnalysis {
  const { state, actorId, specId } = input;

  // ---- spec gate, before any rule of this specialization runs ----
  if (specId !== ENHANCEMENT_SHAMAN_SPEC_ID) {
    return unsupported(
      "SPEC_NOT_SUPPORTED",
      specId,
      `This evaluator supports '${ENHANCEMENT_SHAMAN_SPEC_ID}' only. No gameplay evaluation was attempted for this specialization.`,
    );
  }

  const access = input.authority ?? standaloneEnhancementShamanAuthorityAccess();
  const offensive = access.forDomain("OFFENSIVE_ROTATION");
  if (offensive.outcome !== "AUTHORITY_AVAILABLE") {
    return unsupported(
      "AUTHORITY_NOT_AVAILABLE",
      specId,
      "The pinned SimulationCraft Enhancement Shaman authority artifact could not be resolved, so no offensive decision was evaluated.",
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
  const heroTree = resolveEnhancementShamanHeroTree(observedTalents);
  const talentsProvenAbsent = talentsProvenAbsentFrom(talents, heroTree);
  const buildFacts: EnhancementShamanBuildFacts = { talents, talentsProvenAbsent };
  const build: EnhancementShamanBuildResolution = {
    talents,
    heroTree,
    talentsProvenAbsent: [...talentsProvenAbsent],
  };
  const knownTalents = knownTalentsFrom(talents, talentsProvenAbsent);
  const tokens = enhancementShamanTokenByAbilityId();
  const lineHistory = observedLineHistory(state, actorId, authority, tokens);

  const comparisons: ObservedActionComparison[] = [];
  const excluded: ExcludedEnhancementShamanCast[] = [];
  const gcdDistribution = new Map<string, number>();
  const resolved: EnhancementShamanPayload["resolved"][number][] = [];

  for (const position of state.positionsBySourceActor(actorId)) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId) continue;
    const abilityGameId = event.abilityGameId;
    if (abilityGameId === null) continue;

    const exclude = (reason: EnhancementShamanExclusionReason): void => {
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

    const lane = enhancementShamanExecutionLaneForAbility(abilityGameId);
    const baseGcdMs = enhancementShamanBaseGcdMsForAbility(abilityGameId);
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
    if ((OUTSIDE_FIRST_SLICE_TOKENS as readonly string[]).includes(observedToken)) {
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

    const resolution = resolveEnhancementShamanAtoms({
      heroTree,
      talents,
      talentsProvenAbsent,
    });
    const bindings: AtomBindings = {
      comboPoints: unknownNumber("STATE_NOT_MODELLED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: [],
      knownTalents,
      knownCooldownRemainsSeconds: [],
      specAtoms: resolution.specAtoms,
    };

    const encounterState = withEncounterStateAt(bindings, state, actorId, position, {
      authority: aplAuthorityIdentityOf(authority),
    });

    const outcome = enhancementShamanFirstGcdSelectionAt({
      lineHistory,
      decisionTimeMs: event.reportTimeMs,
      authority,
      bindings: encounterState.bindings,
      buildFacts,
      observedAbilityGameId: abilityGameId,
    });

    resolved.push({
      profileFacts: encounterState.profileFacts,
      position,
      diagnostics: resolution.diagnostics,
      selection: selectionDiagnosticsOf(outcome),
    });

    comparisons.push(
      compareObservedAction({
        decision,
        authorityResult: outcome.result,
        observedActionJudgment: null,
        observedActionUnselectable: null,
        usabilityProvenance: "OBSERVED_EXECUTION",
      }),
    );
  }

  return {
    status: "ANALYZED",
    specId: ENHANCEMENT_SHAMAN_SPEC_ID,
    authority: metadataOf(authority),
    comparisons,
    excluded,
    coverage: summarizeEnhancementShamanDecisions(actorId, comparisons, excluded, resolved, gcdDistribution),
    domains: enhancementShamanDomainResults(
      access,
      state.fight.completeness.categories.INTERRUPTS.capability,
    ),
    build,
    resolved,
  };
}

/** Counts the comparisons. The three outcomes partition the eligible decisions exactly. */
export function summarizeEnhancementShamanDecisions(
  actorId: number,
  comparisons: readonly ObservedActionComparison[],
  excluded: readonly ExcludedEnhancementShamanCast[],
  resolved: EnhancementShamanPayload["resolved"],
  gcdDistribution: ReadonlyMap<string, number> = new Map(),
): EnhancementShamanDecisionCoverage {
  let match = 0;
  let rejected = 0;
  let unknown = 0;
  let exactEntryMatches = 0;
  let tokenConvergedMatches = 0;
  const precision = new Map<DecisionCoverage, number>();
  const bases = new Map<ComparisonBasis, number>();
  const blockers = new Map<DecisionBlockerClass, number>();
  const exclusions = new Map<EnhancementShamanExclusionReason, number>();
  const eligibleTokens = new Map<string, number>();
  const unresolvedAt = new Map<string, number>();
  const stoppingAtoms = new Map<string, number>();
  const dispatchOutcomes = new Map<string, number>();
  const undecidedGcdCandidates = new Map<string, number>();
  const undecidedNonGcdCandidates = new Map<string, number>();

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
    const { stoppingPoint, dispatches, undecidedCandidates } = entry.selection;
    if (stoppingPoint !== null) {
      for (const atom of stoppingPoint.atoms) bump(stoppingAtoms, `${stoppingPoint.at} | ${atom}`);
    }
    for (const dispatch of dispatches) {
      bump(dispatchOutcomes, `${dispatch.at} -> ${dispatch.calleeListName ?? "?"} : ${dispatch.outcome}`);
    }
    for (const candidate of undecidedCandidates) {
      const target = candidate.lane === "GCD_CONSUMING" ? undecidedGcdCandidates : undecidedNonGcdCandidates;
      for (const atom of candidate.atoms) bump(target, `${candidate.at} | ${atom}`);
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
    exclusions: tally(ENHANCEMENT_SHAMAN_EXCLUSION_REASONS, exclusions),
    excludedCastCount: excluded.length,
    eligibleTokens: tallyOpen(eligibleTokens),
    unresolvedAt: tallyOpen(unresolvedAt),
    stoppingAtoms: tallyOpen(stoppingAtoms),
    dispatchOutcomes: tallyOpen(dispatchOutcomes),
    undecidedGcdCandidates: tallyOpen(undecidedGcdCandidates),
    undecidedNonGcdCandidates: tallyOpen(undecidedNonGcdCandidates),
    gcdDistribution: tallyOpen(gcdDistribution),
  };
}
