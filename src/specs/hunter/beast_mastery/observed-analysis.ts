/**
 * The Beast Mastery Hunter observed-decision facade (ONB-T2).
 *
 * One pure function over an ALREADY-INGESTED normalized fight. It enumerates the observed
 * foreground casts of one Beast Mastery Hunter, finds the instant each was decided (the shared
 * ONB-S4 anchor), evaluates each cast of a SUPPORTED token against the pinned offensive authority
 * through the shared first-GCD query, and reports the decision domains separately.
 *
 * WHAT IT DELIBERATELY IS NOT. Not a fetcher, a transport or a coach: no network, no score, no
 * severity. Not a resource simulator: no resource is read at all. Not a racial, potion or trinket
 * evaluator (`domain-boundary.ts`).
 *
 * THE DECISION POPULATION, STATED
 *
 * Every COMPLETE cast by the actor, in canonical order, classified:
 *
 *     melee swing                           excluded  MELEE_SWING
 *     pinned lane NON_GCD                   excluded  NON_GCD_ACTION
 *     no pinned lane record                 excluded  EXECUTION_LANE_NOT_ESTABLISHED
 *     GCD lane, no authority token          excluded  NO_AUTHORITY_TOKEN_BINDING
 *     every other GCD token                 ELIGIBLE  -> anchor -> first-GCD query -> comparison
 *
 * A begin with no completion is NOT a decision here, and neither is any instant with no cast: nothing builds a
 * missed-action opportunity, in or out of a cast. Unpaired begins are counted, never judged.
 *
 * THE ANCHOR IS WHEN THE DECISION WAS MADE. A cast-time action is decided at its begin. So:
 *
 *   - The decision's times are the anchor's. Its `position` and `locator` stay the completion's, because the
 *     completion is the observation that names the action.
 *   - No anchor, no comparison. The query still runs, for its diagnostics, but an UNKNOWN anchor makes the
 *     decision UNKNOWN, whatever the scan says: a moment that is not established cannot be judged.
 *   - Nothing is read at the completion and called the decision's state: every binding here is fixed for the fight
 *     (`resolver.ts`).
 *
 * MATCH MEANS AUTHORITY_COMPATIBLE_ONLY, after the non-domain exclusion.
 *
 * NO UNSELECTABILITY PROOF, AND NO DECISION RESOLVES. Every comparison passes `null` for the
 * unselectability proof: the conditions it would need FALSE read state this slice does not
 * bind. All 707 decisions of its four retained subjects, all Pack Leader, stop at `default[0] retarget`, on its `target_if`, a line gated on a simulation fight style, before any rotation line (`src/specs/hunter/beast_mastery/README.md`).
 * A decision here is observed and explained, not judged.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import { decisionPositionOfAnchor, withEnemyCountAt } from "../../../findings/enemy-count-bindings.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type {
  AnalysisAuthorityMetadata,
  AnalysisStatus,
  SpecAnalysisEnvelope,
  SpecAnalysisInput,
} from "../../../findings/analysis-envelope.js";
import type { AuthorityAccess } from "../../../findings/authority-domain.js";
import type { AplAuthority } from "../../../simc/apl-authority.js";
import { decisionAnchorNotEstablished, type RotationalGcdResult } from "../../../simc/first-gcd-selection.js";
import { unknownNumber, type AtomBindings } from "../../../simc/expression/evaluate.js";
import {
  buildCastTimeline,
  castAnchorKey,
  decisionAnchorStateAt,
  unpairedBeginKey,
  type CastDecisionAnchorState,
  type UnpairedBegin,
} from "../../../engine/game-state/casting/cast-decision-anchor.js";
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
  beastMasteryBaseGcdMsForAbility,
  beastMasteryExecutionLaneForAbility,
  beastMasteryTokenByAbilityId,
} from "../../../data/game/hunter-beast_mastery-gcd-semantics.js";
import {
  beastMasteryModelledTalentNames,
  resolveBeastMasteryHeroTree,
  resolveBeastMasteryTalent,
} from "../../../data/game/hunter-beast_mastery-talents.js";
import type {
  HeroTreeResolution,
  ObservedTalentEntry,
  TalentResolution,
} from "../../../data/game/talent-selection.js";
import type { BeastMasteryBuildFacts } from "./action-profile.js";
import { standaloneBeastMasteryAuthorityAccess } from "./authority-bindings.js";
import { beastMasteryCastAnchorProfile } from "./cast-anchor-profile.js";
import { beastMasteryDomainResults, type BeastMasteryDomainResults } from "./domains.js";
import {
  BEAST_MASTERY_FIRST_GCD_ROOT_LIST,
  beastMasteryFirstGcdSelectionAt,
  type BeastMasteryDispatchStep,
  type BeastMasteryFirstGcdQueryOutcome,
  type BeastMasteryStoppingPoint,
  type BeastMasteryUndecidedCandidate,
} from "./first-gcd-adapter.js";
import {
  beastMasteryTalentsDisprovedByHeroTree,
  resolveBeastMasteryAtoms,
  type BeastMasteryResolverDiagnostics,
} from "./resolver.js";
import { BEAST_MASTERY_HUNTER_SPEC_ID } from "./spec.js";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Why an observed cast is NOT an eligible decision. Counted, never dropped. */
export type BeastMasteryExclusionReason =
  /** Warcraft Logs flags the cast `melee`: an auto-attack swing, not a foreground press. */
  | "MELEE_SWING"
  /** Proven off-GCD by the pinned lane data. */
  | "NON_GCD_ACTION"
  /** The pinned dataset carries no lane record for the ability. */
  | "EXECUTION_LANE_NOT_ESTABLISHED"
  /** A GCD action with no pinned authority token. */
  | "NO_AUTHORITY_TOKEN_BINDING";

export const BEAST_MASTERY_EXCLUSION_REASONS = [
  "MELEE_SWING",
  "NON_GCD_ACTION",
  "EXECUTION_LANE_NOT_ESTABLISHED",
  "NO_AUTHORITY_TOKEN_BINDING",
] as const satisfies readonly BeastMasteryExclusionReason[];

export interface ExcludedBeastMasteryCast {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly reason: BeastMasteryExclusionReason;
}

export interface CountOf<T extends string> {
  readonly key: T;
  readonly count: number;
}

/** The coverage disclosure. The denominator is `eligibleDecisions` and nothing else. */
export interface BeastMasteryDecisionCoverage {
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
  readonly exclusions: readonly CountOf<BeastMasteryExclusionReason>[];
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
  /** Every eligible decision's established anchor source, or its unknown reason -> count. */
  readonly anchors: readonly CountOf<string>[];
  /** The fight's begins that not every placement pairs: `INTERRUPTED`, or the unknown reason -> count. Never judged. */
  readonly unpairedBegins: readonly CountOf<string>[];
}

/** The build facts the evaluator resolved once from the actor's combatant info. */
export interface BeastMasteryBuildResolution {
  readonly talents: Readonly<Record<string, TalentResolution>>;
  readonly heroTree: HeroTreeResolution;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: readonly string[];
}

/** The engine's own account of one first-GCD query, reduced to what evidence needs. */
export interface BeastMasterySelectionDiagnostics {
  readonly kind: RotationalGcdResult["kind"];
  /** The entry the engine stopped at, as `list[ordinal] token`, or `null`. */
  readonly blockedAt: string | null;
  readonly detail: string | null;
  /** Every dispatch entry the ROOT scan visited, in visit order. */
  readonly dispatches: readonly BeastMasteryDispatchStep[];
  /** The ROOT scan's stopping point with its atoms, or null when it resolved. */
  readonly stoppingPoint: BeastMasteryStoppingPoint | null;
  /** Every MAY_SELECT step of the ROOT scan, in visit order. */
  readonly undecidedCandidates: readonly BeastMasteryUndecidedCandidate[];
}

/** What this specialization attaches to an analyzed envelope: ITS payload. */
export interface BeastMasteryHunterPayload {
  readonly comparisons: readonly ObservedActionComparison[];
  readonly excluded: readonly ExcludedBeastMasteryCast[];
  readonly coverage: BeastMasteryDecisionCoverage;
  readonly domains: BeastMasteryDomainResults;
  readonly build: BeastMasteryBuildResolution;
  /** The resolver's diagnostics at each eligible decision, by position. */
  readonly resolved: readonly {
    readonly position: number;
    readonly diagnostics: BeastMasteryResolverDiagnostics;
    readonly selection: BeastMasterySelectionDiagnostics;
    /** The instant this decision was made, or why it is not established. */
    readonly anchor: CastDecisionAnchorState;
  }[];
}

export type BeastMasteryHunterAnalysis = SpecAnalysisEnvelope<
  typeof BEAST_MASTERY_HUNTER_SPEC_ID,
  BeastMasteryHunterPayload
>;

export interface BeastMasteryAnalysisInput extends SpecAnalysisInput {
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
): BeastMasteryHunterAnalysis {
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

function selectionDiagnosticsOf(outcome: BeastMasteryFirstGcdQueryOutcome): BeastMasterySelectionDiagnostics {
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
  for (const simcName of beastMasteryModelledTalentNames()) {
    talents[simcName] = resolveBeastMasteryTalent(observedTalents, simcName);
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
  for (const name of beastMasteryTalentsDisprovedByHeroTree(heroTree)) absent.add(name);
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

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/**
 * Analyses one Beast Mastery Hunter's observed rotational decisions.
 *
 * Decisions are enumerated MECHANICALLY from the normalized fight: every COMPLETE cast by the
 * actor, through M4's own source-actor index, in canonical order.
 */
export function analyzeObservedBeastMasteryHunterDecisions(
  input: BeastMasteryAnalysisInput,
): BeastMasteryHunterAnalysis {
  const { state, actorId, specId } = input;

  // ---- spec gate, before any rule of this specialization runs ----
  if (specId !== BEAST_MASTERY_HUNTER_SPEC_ID) {
    return unsupported(
      "SPEC_NOT_SUPPORTED",
      specId,
      `This evaluator supports '${BEAST_MASTERY_HUNTER_SPEC_ID}' only. No gameplay evaluation was attempted for this specialization.`,
    );
  }

  const access = input.authority ?? standaloneBeastMasteryAuthorityAccess();
  const offensive = access.forDomain("OFFENSIVE_ROTATION");
  if (offensive.outcome !== "AUTHORITY_AVAILABLE") {
    return unsupported(
      "AUTHORITY_NOT_AVAILABLE",
      specId,
      "The pinned SimulationCraft Beast Mastery Hunter authority artifact could not be resolved, so no offensive decision was evaluated.",
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
  const heroTree = resolveBeastMasteryHeroTree(observedTalents);
  const talentsProvenAbsent = talentsProvenAbsentFrom(talents, heroTree);
  const buildFacts: BeastMasteryBuildFacts = { talents, talentsProvenAbsent };
  const build: BeastMasteryBuildResolution = {
    talents,
    heroTree,
    talentsProvenAbsent: [...talentsProvenAbsent],
  };
  const knownTalents = knownTalentsFrom(talents, talentsProvenAbsent);
  const tokens = beastMasteryTokenByAbilityId();
  const timeline = buildCastTimeline({
    state,
    actorId,
    profile: beastMasteryCastAnchorProfile(),
  });
  // Every binding is fixed for the fight (resolver.ts), so one resolution serves every decision.
  const resolution = resolveBeastMasteryAtoms({ heroTree, talents, talentsProvenAbsent });
  const bindings: AtomBindings = {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: [],
    knownTalents,
    knownCooldownRemainsSeconds: [],
    specAtoms: resolution.specAtoms,
  };

  const comparisons: ObservedActionComparison[] = [];
  const excluded: ExcludedBeastMasteryCast[] = [];
  const gcdDistribution = new Map<string, number>();
  const resolved: BeastMasteryHunterPayload["resolved"][number][] = [];

  for (const position of state.positionsBySourceActor(actorId)) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId) continue;
    const abilityGameId = event.abilityGameId;
    if (abilityGameId === null) continue;

    const exclude = (reason: BeastMasteryExclusionReason): void => {
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

    const lane = beastMasteryExecutionLaneForAbility(abilityGameId);
    const baseGcdMs = beastMasteryBaseGcdMsForAbility(abilityGameId);
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

    const targetActorId = input.targetActorId ?? event.target?.actorId ?? null;
    const anchor = decisionAnchorStateAt(timeline, position);
    const decidedBeforeCompletionMs =
      anchor.state === "ESTABLISHED" ? event.reportTimeMs - anchor.reportTimeMs : 0;
    const decision: ObservedRotationalDecision = {
      position,
      locator: event.locator,
      actorId,
      abilityGameId,
      observedToken,
      reportTimeMs: event.reportTimeMs - decidedBeforeCompletionMs,
      fightTimeMs: event.fightTimeMs - decidedBeforeCompletionMs,
      targetActorId,
    };

    const outcome = beastMasteryFirstGcdSelectionAt({
      authority,
      bindings: withEnemyCountAt(bindings, state, actorId, decisionPositionOfAnchor(anchor, position)),
      buildFacts,
      observedAbilityGameId: abilityGameId,
    });

    const authorityResult =
      anchor.state === "ESTABLISHED"
        ? outcome.result
        : decisionAnchorNotEstablished(
            BEAST_MASTERY_FIRST_GCD_ROOT_LIST,
            `${anchor.reason}: ${anchor.detail}`,
          );

    resolved.push({
      position,
      diagnostics: resolution.diagnostics,
      selection: selectionDiagnosticsOf({ result: authorityResult, rootScan: outcome.rootScan }),
      anchor,
    });

    comparisons.push(
      compareObservedAction({
        decision,
        authorityResult,
        observedActionJudgment: null,
        observedActionUnselectable: null,
        usabilityProvenance: "OBSERVED_EXECUTION",
      }),
    );
  }

  return {
    status: "ANALYZED",
    specId: BEAST_MASTERY_HUNTER_SPEC_ID,
    authority: metadataOf(authority),
    comparisons,
    excluded,
    coverage: summarizeBeastMasteryDecisions(
      actorId,
      comparisons,
      excluded,
      resolved,
      gcdDistribution,
      timeline.unpairedBegins,
    ),
    domains: beastMasteryDomainResults(access, state.fight.completeness.categories.INTERRUPTS.capability),
    build,
    resolved,
  };
}

/** Counts the comparisons. The three outcomes partition the eligible decisions exactly. */
export function summarizeBeastMasteryDecisions(
  actorId: number,
  comparisons: readonly ObservedActionComparison[],
  excluded: readonly ExcludedBeastMasteryCast[],
  resolved: BeastMasteryHunterPayload["resolved"],
  gcdDistribution: ReadonlyMap<string, number> = new Map(),
  unpairedBegins: readonly UnpairedBegin[] = [],
): BeastMasteryDecisionCoverage {
  let match = 0;
  let rejected = 0;
  let unknown = 0;
  let exactEntryMatches = 0;
  let tokenConvergedMatches = 0;
  const precision = new Map<DecisionCoverage, number>();
  const bases = new Map<ComparisonBasis, number>();
  const blockers = new Map<DecisionBlockerClass, number>();
  const exclusions = new Map<BeastMasteryExclusionReason, number>();
  const eligibleTokens = new Map<string, number>();
  const unresolvedAt = new Map<string, number>();
  const stoppingAtoms = new Map<string, number>();
  const dispatchOutcomes = new Map<string, number>();
  const undecidedGcdCandidates = new Map<string, number>();
  const undecidedNonGcdCandidates = new Map<string, number>();
  const anchors = new Map<string, number>();
  const unpaired = new Map<string, number>();
  for (const begin of unpairedBegins) bump(unpaired, unpairedBeginKey(begin));

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
    bump(anchors, castAnchorKey(entry.anchor));
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
    exclusions: tally(BEAST_MASTERY_EXCLUSION_REASONS, exclusions),
    excludedCastCount: excluded.length,
    eligibleTokens: tallyOpen(eligibleTokens),
    unresolvedAt: tallyOpen(unresolvedAt),
    stoppingAtoms: tallyOpen(stoppingAtoms),
    dispatchOutcomes: tallyOpen(dispatchOutcomes),
    undecidedGcdCandidates: tallyOpen(undecidedGcdCandidates),
    undecidedNonGcdCandidates: tallyOpen(undecidedNonGcdCandidates),
    gcdDistribution: tallyOpen(gcdDistribution),
    anchors: tallyOpen(anchors),
    unpairedBegins: tallyOpen(unpaired),
  };
}
