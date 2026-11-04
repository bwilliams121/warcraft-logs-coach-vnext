/**
 * The Feral Druid observed-decision facade (ONB-C1).
 *
 * One pure function over an ALREADY-INGESTED normalized fight. It enumerates the observed
 * foreground casts of one Feral Druid, evaluates each cast of a SUPPORTED token against the
 * pinned offensive authority through the shared first-GCD query, and reports the decision
 * domains separately.
 *
 * WHAT IT DELIBERATELY IS NOT. Not a fetcher, a transport or a coach: no network, no score, no
 * severity. Not a resource simulator: only the decision cast's own PRE_COST values are read, and Energy
 * is never regenerated between them. Not a racial, potion or trinket evaluator (`domain-boundary.ts`).
 *
 * THE DECISION POPULATION, STATED
 *
 * Every COMPLETE cast by the actor, in canonical order, classified:
 *
 *     melee swing                           excluded  MELEE_SWING
 *     pinned lane NON_GCD                   excluded  NON_GCD_ACTION
 *     no pinned lane record                 excluded  EXECUTION_LANE_NOT_ESTABLISHED
 *     GCD lane, no authority token          excluded  NO_AUTHORITY_TOKEN_BINDING
 *     regrowth                              excluded  OUTSIDE_FIRST_SLICE
 *     every other GCD token                 ELIGIBLE  -> first-GCD query -> comparison
 *
 * MATCH MEANS AUTHORITY_COMPATIBLE_ONLY, after the non-domain exclusion.
 *
 * NO UNSELECTABILITY PROOF, AND NO DECISION RESOLVES. Every comparison passes `null` for the
 * unselectability proof: the conditions it would need FALSE read state this slice does not
 * bind. Off-GCD entries with no reviewed contract and open conditions precede every GCD action of
 * the pinned list but Cat Form, and the finishers and builders stand behind the enemy count, so the
 * query stays UNKNOWN (`src/specs/druid/feral/README.md`). A decision here is observed and explained,
 * not judged.
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
import {
  knownNumber,
  unknownNumber,
  type AtomBindings,
  type NumericBinding,
} from "../../../simc/expression/evaluate.js";
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
  feralDruidBaseGcdMsForAbility,
  feralDruidExecutionLaneForAbility,
  feralDruidTokenByAbilityId,
} from "../../../data/game/druid-feral-gcd-semantics.js";
import {
  feralDruidModelledTalentNames,
  resolveFeralDruidHeroTree,
  resolveFeralDruidTalent,
} from "../../../data/game/druid-feral-talents.js";
import type {
  HeroTreeResolution,
  ObservedTalentEntry,
  TalentResolution,
} from "../../../data/game/talent-selection.js";
import { ownCastResourceAt, type OwnCastResource } from "../../../findings/resources/own-cast-resource.js";
import type { FeralDruidBuildFacts } from "./action-profile.js";
import { standaloneFeralDruidAuthorityAccess } from "./authority-bindings.js";
import {
  bindSupportedFeralAuras,
  feralBuffBindingsFrom,
  feralBuffUp,
  type FeralAuraBinding,
} from "./aura-bindings.js";
import { feralCastFactsFrom, prowlReadinessAt, type ProwlReadiness } from "./combat-engagement.js";
import { feralDruidDomainResults, type FeralDruidDomainResults } from "./domains.js";
import {
  feralDruidFirstGcdSelectionAt,
  type FeralDruidDispatchStep,
  type FeralDruidFirstGcdQueryOutcome,
  type FeralDruidStoppingPoint,
  type FeralDruidUndecidedCandidate,
} from "./first-gcd-adapter.js";
import {
  feralDruidTalentsDisprovedByHeroTree,
  resolveFeralDruidAtoms,
  type FeralDruidResolverDiagnostics,
} from "./resolver.js";
import { FERAL_DRUID_SPEC_ID } from "./spec.js";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * The observed in-domain GCD tokens the slice does not judge. Regrowth has a cast time: every retained subject logs a begincast for each hardcast, so it is decided at its start,
 * and this facade evaluates state at the observed `cast`, which would ask the wrong moment.
 */
export const OUTSIDE_FIRST_SLICE_TOKENS = Object.freeze(["regrowth"] as const);

/** Why an observed cast is NOT an eligible decision. Counted, never dropped. */
export type FeralDruidExclusionReason =
  /** Warcraft Logs flags the cast `melee`: an auto-attack swing, not a foreground press. */
  | "MELEE_SWING"
  /** Proven off-GCD by the pinned lane data. */
  | "NON_GCD_ACTION"
  /** The pinned dataset carries no lane record for the ability. */
  | "EXECUTION_LANE_NOT_ESTABLISHED"
  /** A GCD action with no pinned authority token. */
  | "NO_AUTHORITY_TOKEN_BINDING"
  /** An in-domain GCD action the slice observes but does not judge (regrowth). */
  | "OUTSIDE_FIRST_SLICE";

export const FERAL_DRUID_EXCLUSION_REASONS = [
  "MELEE_SWING",
  "NON_GCD_ACTION",
  "EXECUTION_LANE_NOT_ESTABLISHED",
  "NO_AUTHORITY_TOKEN_BINDING",
  "OUTSIDE_FIRST_SLICE",
] as const satisfies readonly FeralDruidExclusionReason[];

export interface ExcludedFeralDruidCast {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly reason: FeralDruidExclusionReason;
}

export interface CountOf<T extends string> {
  readonly key: T;
  readonly count: number;
}

/** The coverage disclosure. The denominator is `eligibleDecisions` and nothing else. */
export interface FeralDruidDecisionCoverage {
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
  readonly exclusions: readonly CountOf<FeralDruidExclusionReason>[];
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
export interface FeralDruidBuildResolution {
  readonly talents: Readonly<Record<string, TalentResolution>>;
  readonly heroTree: HeroTreeResolution;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: readonly string[];
}

/** The engine's own account of one first-GCD query, reduced to what evidence needs. */
export interface FeralDruidSelectionDiagnostics {
  readonly kind: RotationalGcdResult["kind"];
  /** The entry the engine stopped at, as `list[ordinal] token`, or `null`. */
  readonly blockedAt: string | null;
  readonly detail: string | null;
  /** Every dispatch entry the ROOT scan visited, in visit order. */
  readonly dispatches: readonly FeralDruidDispatchStep[];
  /** The ROOT scan's stopping point with its atoms, or null when it resolved. */
  readonly stoppingPoint: FeralDruidStoppingPoint | null;
  /** Every MAY_SELECT step of the ROOT scan, in visit order. */
  readonly undecidedCandidates: readonly FeralDruidUndecidedCandidate[];
}

/** What this specialization attaches to an analyzed envelope: ITS payload. */
export interface FeralDruidPayload {
  readonly comparisons: readonly ObservedActionComparison[];
  readonly excluded: readonly ExcludedFeralDruidCast[];
  readonly coverage: FeralDruidDecisionCoverage;
  readonly domains: FeralDruidDomainResults;
  readonly build: FeralDruidBuildResolution;
  /** The resolver's diagnostics at each eligible decision, by position. */
  readonly resolved: readonly {
    readonly position: number;
    readonly diagnostics: FeralDruidResolverDiagnostics;
    readonly selection: FeralDruidSelectionDiagnostics;
    /** Every aura atom's binding at this decision, form state included. */
    readonly auras: readonly FeralAuraBinding[];
    readonly prowl: ProwlReadiness;
  }[];
}

export type FeralDruidAnalysis = SpecAnalysisEnvelope<typeof FERAL_DRUID_SPEC_ID, FeralDruidPayload>;

export interface FeralDruidAnalysisInput extends SpecAnalysisInput {
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
): FeralDruidAnalysis {
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

function selectionDiagnosticsOf(outcome: FeralDruidFirstGcdQueryOutcome): FeralDruidSelectionDiagnostics {
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
  for (const simcName of feralDruidModelledTalentNames()) {
    talents[simcName] = resolveFeralDruidTalent(observedTalents, simcName);
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
  for (const name of feralDruidTalentsDisprovedByHeroTree(heroTree)) absent.add(name);
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

/** The exact amount of an established own-cast observation; otherwise an unknown. */
function amountOf(own: OwnCastResource): NumericBinding {
  return own.state === "EXACT_PRE_COST" ? knownNumber(own.amount) : unknownNumber("STATE_NOT_ESTABLISHED");
}

/** The exact deficit of an established own-cast observation; otherwise an unknown. */
function deficitOf(own: OwnCastResource): NumericBinding {
  return own.state === "EXACT_PRE_COST" ? knownNumber(own.deficit) : unknownNumber("STATE_NOT_ESTABLISHED");
}

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/**
 * Analyses one Feral Druid's observed rotational decisions.
 *
 * Decisions are enumerated MECHANICALLY from the normalized fight: every COMPLETE cast by the
 * actor, through M4's own source-actor index, in canonical order.
 */
export function analyzeObservedFeralDruidDecisions(input: FeralDruidAnalysisInput): FeralDruidAnalysis {
  const { state, actorId, specId } = input;

  // ---- spec gate, before any rule of this specialization runs ----
  if (specId !== FERAL_DRUID_SPEC_ID) {
    return unsupported(
      "SPEC_NOT_SUPPORTED",
      specId,
      `This evaluator supports '${FERAL_DRUID_SPEC_ID}' only. No gameplay evaluation was attempted for this specialization.`,
    );
  }

  const access = input.authority ?? standaloneFeralDruidAuthorityAccess();
  const offensive = access.forDomain("OFFENSIVE_ROTATION");
  if (offensive.outcome !== "AUTHORITY_AVAILABLE") {
    return unsupported(
      "AUTHORITY_NOT_AVAILABLE",
      specId,
      "The pinned SimulationCraft Feral Druid authority artifact could not be resolved, so no offensive decision was evaluated.",
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
  const heroTree = resolveFeralDruidHeroTree(observedTalents);
  const talentsProvenAbsent = talentsProvenAbsentFrom(talents, heroTree);
  const buildFacts: FeralDruidBuildFacts = { talents, talentsProvenAbsent };
  const build: FeralDruidBuildResolution = {
    talents,
    heroTree,
    talentsProvenAbsent: [...talentsProvenAbsent],
  };
  const knownTalents = knownTalentsFrom(talents, talentsProvenAbsent);
  const tokens = feralDruidTokenByAbilityId();
  const castFacts = feralCastFactsFrom(state, actorId, tokens);

  const comparisons: ObservedActionComparison[] = [];
  const excluded: ExcludedFeralDruidCast[] = [];
  const gcdDistribution = new Map<string, number>();
  const resolved: FeralDruidPayload["resolved"][number][] = [];

  for (const position of state.positionsBySourceActor(actorId)) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId) continue;
    const abilityGameId = event.abilityGameId;
    if (abilityGameId === null) continue;

    const exclude = (reason: FeralDruidExclusionReason): void => {
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

    const lane = feralDruidExecutionLaneForAbility(abilityGameId);
    const baseGcdMs = feralDruidBaseGcdMsForAbility(abilityGameId);
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
    const ownENERGY = ownCastResourceAt(state, { position, actorId, resourceId: "ENERGY" });
    const ownCOMBO_POINTS = ownCastResourceAt(state, { position, actorId, resourceId: "COMBO_POINTS" });
    const auras = bindSupportedFeralAuras({
      state,
      actorId,
      position,
      talents,
      talentsProvenAbsent,
      castFacts,
      decisionReportTimeMs: event.reportTimeMs,
      observedToken,
    });
    const bsIncUp = feralBuffUp(auras, "bs_inc");
    const incarnation = talents["incarnation_cat"];
    const prowl = prowlReadinessAt({
      state,
      facts: castFacts,
      decisionMs: event.reportTimeMs,
      incarnation,
      incarnationProvenAbsent: talentsProvenAbsent.has("incarnation_cat"),
    });
    const resolution = resolveFeralDruidAtoms({
      heroTree,
      talents,
      talentsProvenAbsent,
      energy: amountOf(ownENERGY),
      bsIncUp,
    });
    const bindings: AtomBindings = {
      comboPoints: amountOf(ownCOMBO_POINTS),
      comboPointsDeficit: deficitOf(ownCOMBO_POINTS),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: feralBuffBindingsFrom(auras),
      knownTalents,
      knownCooldownRemainsSeconds: [],
      specAtoms: resolution.specAtoms,
    };

    const outcome = feralDruidFirstGcdSelectionAt({
      authority,
      bindings,
      buildFacts,
      observedAbilityGameId: abilityGameId,
      prowl,
      maxEnergy: {
        energy: amountOf(ownENERGY),
        bsIncUp,
        apexUp: feralBuffUp(auras, "apex_predators_craving"),
        incarnationSelected:
          incarnation?.selection === "SELECTED"
            ? true
            : talentsProvenAbsent.has("incarnation_cat")
              ? false
              : null,
      },
      energyMaximum: ownENERGY.state === "EXACT_PRE_COST" ? ownENERGY.max : null,
    });

    resolved.push({
      position,
      diagnostics: resolution.diagnostics,
      selection: selectionDiagnosticsOf(outcome),
      auras,
      prowl,
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
    specId: FERAL_DRUID_SPEC_ID,
    authority: metadataOf(authority),
    comparisons,
    excluded,
    coverage: summarizeFeralDruidDecisions(actorId, comparisons, excluded, resolved, gcdDistribution),
    domains: feralDruidDomainResults(access, state.fight.completeness.categories.INTERRUPTS.capability),
    build,
    resolved,
  };
}

/** Counts the comparisons. The three outcomes partition the eligible decisions exactly. */
export function summarizeFeralDruidDecisions(
  actorId: number,
  comparisons: readonly ObservedActionComparison[],
  excluded: readonly ExcludedFeralDruidCast[],
  resolved: FeralDruidPayload["resolved"],
  gcdDistribution: ReadonlyMap<string, number> = new Map(),
): FeralDruidDecisionCoverage {
  let match = 0;
  let rejected = 0;
  let unknown = 0;
  let exactEntryMatches = 0;
  let tokenConvergedMatches = 0;
  const precision = new Map<DecisionCoverage, number>();
  const bases = new Map<ComparisonBasis, number>();
  const blockers = new Map<DecisionBlockerClass, number>();
  const exclusions = new Map<FeralDruidExclusionReason, number>();
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
    exclusions: tally(FERAL_DRUID_EXCLUSION_REASONS, exclusions),
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
