/**
 * The stable internal M5 analysis facade.
 *
 * WHAT IT IS
 *
 * One pure function over an ALREADY-INGESTED normalized fight. It enumerates the
 * observed rotational decisions of one Assassination actor, compares each against
 * the pinned authority, and discloses how much it could actually resolve.
 *
 * WHAT IT DELIBERATELY IS NOT
 *
 * - It does not fetch. No Warcraft Logs client, no network, no `fetch`. M3 owns
 *   retrieval; this module receives its output. That boundary is what stops the
 *   analyzer from quietly issuing its own queries to fill a gap.
 * - It does not know about HTTP. No route, no request, no response shape, no
 *   status code. `/v1/analysis`, MCP and tests are all just callers.
 * - It does not coach. There is no scoring, no severity, and no vocabulary for
 *   correctness anywhere in the result.
 *
 * WHY A FACADE AT ALL
 *
 * M5's pieces are individually honest and collectively hard to assemble: bind
 * state, load authority, resolve a profile, run a scan, classify, compare, count.
 * A caller that assembles them by hand will eventually assemble them slightly
 * differently, and the differences will be invisible. One entry point means one
 * assembly, and M6 gets something small enough to expose safely.
 *
 * PARTIAL COVERAGE IS A SUCCESSFUL RESULT
 *
 * A supported report with two MATCHes and thirty UNKNOWNs is the analyzer
 * working. It is `ANALYZED`, never an error — the coverage disclosure is how the
 * shortfall reaches the reader, and turning it into a failure would just hide it.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { AplAuthority } from "../../../simc/apl-authority.js";
import { pinnedAssassinationAuthority } from "../../../simc/pinned-authority.js";
import { RESOURCE_WIRE_CONTRACTS } from "../../../data/wcl-wire/resource-types.js";
import { resolveModelledTalents } from "../../../data/game/rogue-talents.js";
import {
  executionLaneForAbility,
  pinnedRogueGcdSemantics,
} from "../../../data/game/ability-gcd-semantics.js";
import type { ObservedActionJudgment } from "../../../findings/judgment.js";
import { ASSASSINATION_SPEC_ID, evaluateAssassinationEnvenom } from "./evaluator.js";
import { authorityProfileFor } from "./observed-profile.js";
import { rotationalBindingsAt } from "./rotational-traversal.js";
import { firstGcdSelectionAt } from "./first-gcd-adapter.js";
import {
  compareObservedAction,
  COMPARISON_BASES,
  type ComparisonBasis,
  type ObservedActionComparison,
  type ObservedRotationalDecision,
} from "./observed-comparison.js";
import {
  DECISION_BLOCKER_CLASSES,
  DECISION_COVERAGES,
  type DecisionBlockerClass,
  type DecisionCoverage,
} from "./decision-coverage.js";

/**
 * Why an observed cast is NOT an eligible rotational decision.
 *
 * Counted and disclosed rather than silently dropped. An excluded cast is a cast
 * the analyzer did not look at, and a reader who cannot see the exclusions
 * cannot tell a small honest denominator from a cherry-picked one.
 */
export type DecisionExclusionReason =
  /**
   * The action is proven off-GCD. It occupies no rotational GCD slot, so it is
   * not a rotational decision and must not be counted as an unresolved one.
   */
  | "NON_GCD_ACTION"
  /**
   * The pinned GCD artifact carries no record for this ability, so its lane is
   * not established and it cannot be shown to be a rotational GCD.
   *
   * This is where M5's deferred debt surfaces in the output: builders such as
   * Mutilate and Fan of Knives land here. Counting them as UNKNOWN would claim
   * they are rotational decisions we failed on; dropping them silently would
   * flatter the denominator. They are excluded, and said out loud.
   */
  | "EXECUTION_LANE_NOT_ESTABLISHED"
  /** The ability has a lane but binds to no pinned authority token. */
  | "NO_AUTHORITY_TOKEN_BINDING";

export const DECISION_EXCLUSION_REASONS = [
  "NON_GCD_ACTION",
  "EXECUTION_LANE_NOT_ESTABLISHED",
  "NO_AUTHORITY_TOKEN_BINDING",
] as const satisfies readonly DecisionExclusionReason[];

export interface ExcludedObservedCast {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly reason: DecisionExclusionReason;
}

export interface CountOf<T extends string> {
  readonly key: T;
  readonly count: number;
}

/**
 * What the analysis could resolve, and over what.
 *
 * THE DENOMINATOR IS `eligibleDecisions` AND NOTHING ELSE. Not all casts, not
 * all combat events, not all GCDs in the fight, not other specs' actions. It is
 * the observed rotational-GCD decisions this authority comparison could
 * legitimately be asked about.
 *
 * There is deliberately no percentage field and no field whose name could be
 * read as a correctness rate. `resolvedComparisons / eligibleDecisions` is
 * RESOLVED COVERAGE — how often the comparison reached any conclusion at all —
 * and a caller that wants a ratio computes it from the two integers, which makes
 * it hard to accidentally print as "percent correct".
 */
export interface ObservedDecisionCoverage {
  readonly actorId: number;
  readonly eligibleDecisions: number;
  readonly match: number;
  readonly rejected: number;
  readonly unknown: number;
  /** MATCH + REJECTED. The numerator of resolved coverage. */
  readonly resolvedComparisons: number;
  /** MATCHes whose authority selection named an exact entry. */
  readonly exactEntryMatches: number;
  /** MATCHes that established only the token. Never merged with the above. */
  readonly tokenConvergedMatches: number;
  /**
   * Authority-selection precision across eligible decisions, INDEPENDENT of the
   * comparison outcome. A decision can resolve exactly and still be REJECTED.
   */
  readonly selectionPrecision: readonly CountOf<DecisionCoverage>[];
  readonly unknownBases: readonly CountOf<ComparisonBasis>[];
  readonly unknownBlockerClasses: readonly CountOf<DecisionBlockerClass>[];
  readonly exclusions: readonly CountOf<DecisionExclusionReason>[];
  readonly excludedCastCount: number;
}

export type AnalysisStatus =
  | "ANALYZED"
  | "SPEC_NOT_SUPPORTED"
  | "AUTHORITY_NOT_AVAILABLE"
  | "PROFILE_NOT_RESOLVED"
  | "INSUFFICIENT_EVIDENCE";

export const ANALYSIS_STATUSES = [
  "ANALYZED",
  "SPEC_NOT_SUPPORTED",
  "AUTHORITY_NOT_AVAILABLE",
  "PROFILE_NOT_RESOLVED",
  "INSUFFICIENT_EVIDENCE",
] as const satisfies readonly AnalysisStatus[];

/** Pinned authority identity, read from the artifact. Never hand-maintained. */
export interface AnalysisAuthorityMetadata {
  readonly authorityId: string;
  readonly artifactRevision: string;
  readonly repository: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly specName: string;
  readonly className: string;
}

export type ObservedAssassinationAnalysis =
  | {
      readonly status: "ANALYZED";
      readonly specId: string;
      readonly authority: AnalysisAuthorityMetadata;
      readonly comparisons: readonly ObservedActionComparison[];
      readonly excluded: readonly ExcludedObservedCast[];
      readonly coverage: ObservedDecisionCoverage;
    }
  | {
      readonly status: Exclude<AnalysisStatus, "ANALYZED">;
      readonly specId: string;
      readonly detail: string;
    };

export interface ObservedAnalysisInput {
  readonly state: CombatState;
  readonly actorId: number;
  /**
   * The caller's resolved specialization. REQUIRED.
   *
   * No default and no inference. A missing or wrong spec must not fall through
   * into Assassination rules, so the caller states it and this module checks it.
   */
  readonly specId: string;
  /** The enemy the decisions are about, where the caller established one. */
  readonly targetActorId: number | null;
  /** Omit for the pinned artifact; pass `null` to model "no authority". */
  readonly authority?: AplAuthority | null;
}

function unsupported(
  status: Exclude<AnalysisStatus, "ANALYZED">,
  specId: string,
  detail: string,
): ObservedAssassinationAnalysis {
  return { status, specId, detail };
}

function wireTypeFor(resourceId: string): number | null {
  return RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === resourceId)?.wireType ?? null;
}

/**
 * The inverse of the pinned token bindings: ability id -> SimulationCraft token.
 *
 * DERIVED from the committed artifact rather than hand-listed, so a binding
 * change cannot leave a stale duplicate here. An id that binds to more than one
 * token would be ambiguous, so it is dropped rather than resolved arbitrarily.
 */
function tokenByAbilityId(): ReadonlyMap<number, string> {
  const load = pinnedRogueGcdSemantics();
  if (!load.ok) return new Map();
  const seen = new Map<number, string | null>();
  for (const binding of load.artifact.tokenBindings) {
    for (const abilityGameId of binding.candidateAbilityGameIds) {
      const existing = seen.get(abilityGameId);
      seen.set(
        abilityGameId,
        existing === undefined || existing === binding.simcToken ? binding.simcToken : null,
      );
    }
  }
  const resolved = new Map<number, string>();
  for (const [abilityGameId, token] of seen) if (token !== null) resolved.set(abilityGameId, token);
  return resolved;
}

function tally<T extends string>(order: readonly T[], counts: ReadonlyMap<T, number>): readonly CountOf<T>[] {
  const rows: CountOf<T>[] = [];
  for (const key of order) {
    const count = counts.get(key) ?? 0;
    if (count > 0) rows.push({ key, count });
  }
  return rows;
}

/**
 * The M5-A judgments for this actor, indexed by canonical position.
 *
 * M5-A covers exactly one action, so most decisions get `null` — which means
 * "M5-A did not evaluate this", never "M5-A approved it".
 */
function observedActionJudgments(
  state: CombatState,
  actorId: number,
  authority: AplAuthority | null | undefined,
): ReadonlyMap<number, ObservedActionJudgment> {
  const run =
    authority === undefined
      ? evaluateAssassinationEnvenom(state, { actorId })
      : evaluateAssassinationEnvenom(state, { actorId, authority });
  const byPosition = new Map<number, ObservedActionJudgment>();
  if (run.outcome !== "EVALUATED") return byPosition;
  for (const finding of run.findings) {
    if (finding.judgment.kind !== "OBSERVED_ACTION_JUDGMENT") continue;
    byPosition.set(finding.decisionPoint.position, finding.judgment);
  }
  return byPosition;
}

/**
 * Analyses one Assassination actor's observed rotational decisions.
 *
 * Decisions are enumerated MECHANICALLY from the normalized fight — every
 * COMPLETE cast by the actor, in canonical order. There is no hard-coded list of
 * interesting timestamps, and equal timestamps stay distinguishable because a
 * decision is identified by canonical position and locator, never by time alone.
 */
export function analyzeObservedAssassinationDecisions(
  input: ObservedAnalysisInput,
): ObservedAssassinationAnalysis {
  const { state, actorId, specId } = input;

  // ---- spec gate, before any Assassination rule runs ----
  if (specId !== ASSASSINATION_SPEC_ID) {
    return unsupported(
      "SPEC_NOT_SUPPORTED",
      specId,
      `Milestone 5 supports '${ASSASSINATION_SPEC_ID}' only. No gameplay evaluation was attempted for this specialization.`,
    );
  }

  const authority =
    input.authority === undefined
      ? (() => {
          const loaded = pinnedAssassinationAuthority();
          return loaded.ok ? loaded.authority : null;
        })()
      : input.authority;
  if (authority === null) {
    return unsupported(
      "AUTHORITY_NOT_AVAILABLE",
      specId,
      "The pinned SimulationCraft Assassination authority artifact could not be resolved, so no rotational decision was evaluated.",
    );
  }

  const profile = authorityProfileFor(state, actorId);
  if (profile === null) {
    return unsupported(
      "PROFILE_NOT_RESOLVED",
      specId,
      "No combatant profile was resolved for this actor, so action applicability and usability could not be established.",
    );
  }

  const comboPointWireType = wireTypeFor("COMBO_POINTS");
  const energyWireType = wireTypeFor("ENERGY");
  if (comboPointWireType === null || energyWireType === null) {
    return unsupported(
      "INSUFFICIENT_EVIDENCE",
      specId,
      "The version-scoped resource wire contracts required to read combo points and energy are not available.",
    );
  }

  const tokens = tokenByAbilityId();
  const judgments = observedActionJudgments(state, actorId, input.authority);
  const knownTalents = resolveModelledTalents(talentEntriesFor(state, actorId));

  const comparisons: ObservedActionComparison[] = [];
  const excluded: ExcludedObservedCast[] = [];

  // Enumerated through M4's own source-actor index, which yields CANONICAL
  // positions in ascending order. Nothing here indexes the event array, and
  // nothing treats an ingestion ordinal as a position. Because the index is
  // keyed by source actor, background and non-player events cannot enter.
  for (const position of state.positionsBySourceActor(actorId)) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId) continue;
    const abilityGameId = event.abilityGameId;
    if (abilityGameId === null) continue;

    const lane = executionLaneForAbility(abilityGameId);
    if (lane === "NON_GCD") {
      excluded.push({
        position,
        locator: event.locator,
        abilityGameId,
        reportTimeMs: event.reportTimeMs,
        reason: "NON_GCD_ACTION",
      });
      continue;
    }
    if (lane === "UNKNOWN_LANE") {
      excluded.push({
        position,
        locator: event.locator,
        abilityGameId,
        reportTimeMs: event.reportTimeMs,
        reason: "EXECUTION_LANE_NOT_ESTABLISHED",
      });
      continue;
    }
    const observedToken = tokens.get(abilityGameId);
    if (observedToken === undefined) {
      excluded.push({
        position,
        locator: event.locator,
        abilityGameId,
        reportTimeMs: event.reportTimeMs,
        reason: "NO_AUTHORITY_TOKEN_BINDING",
      });
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

    const { bindings } = rotationalBindingsAt({
      state,
      actorId,
      targetActorId: targetActorId ?? 0,
      position,
      observedAbilityGameId: abilityGameId,
      authority,
      comboPointWireType,
      energyWireType,
      comboPointResourceId: "COMBO_POINTS",
      energyResourceId: "ENERGY",
      knownTalents,
    });
    const outcome = firstGcdSelectionAt({
      state,
      actorId,
      position,
      authority,
      profile,
      bindings,
      observedAbilityGameId: abilityGameId,
      ...(targetActorId === null ? {} : { engagementTargetActorId: targetActorId }),
    });

    comparisons.push(
      compareObservedAction({
        decision,
        authorityResult: outcome.result,
        observedActionJudgment: judgments.get(position) ?? null,
        // The observed cast is what proves this action was usable here. Recorded
        // rather than implied: it is the reason a comparison is not a prediction.
        usabilityProvenance: "OBSERVED_EXECUTION",
      }),
    );
  }

  return {
    status: "ANALYZED",
    specId,
    authority: metadataOf(authority),
    comparisons,
    excluded,
    coverage: summarize(actorId, comparisons, excluded),
  };
}

function talentEntriesFor(
  state: CombatState,
  actorId: number,
): readonly { readonly id: number; readonly nodeId: number | null }[] {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "COMBATANT_INFO") continue;
    if (event.snapshot.actorId !== actorId) continue;
    return event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
  }
  return [];
}

function metadataOf(authority: AplAuthority): AnalysisAuthorityMetadata {
  // Read straight off the validated artifact. No hand-maintained duplicate of
  // any of these values exists, so metadata cannot drift from the authority the
  // decisions were actually evaluated against.
  const artifact = authority.artifact;
  const provenance = artifact.provenance;
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

/**
 * Counts the comparisons.
 *
 * The three outcomes partition the eligible decisions exactly. That invariant is
 * asserted in the contract tests, because a denominator that stops matching its
 * parts is the specific way a coverage number becomes a lie.
 */
export function summarize(
  actorId: number,
  comparisons: readonly ObservedActionComparison[],
  excluded: readonly ExcludedObservedCast[],
): ObservedDecisionCoverage {
  let match = 0;
  let rejected = 0;
  let unknown = 0;
  let exactEntryMatches = 0;
  let tokenConvergedMatches = 0;
  const precision = new Map<DecisionCoverage, number>();
  const bases = new Map<ComparisonBasis, number>();
  const blockers = new Map<DecisionBlockerClass, number>();
  const exclusions = new Map<DecisionExclusionReason, number>();

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
    exclusions: tally(DECISION_EXCLUSION_REASONS, exclusions),
    excludedCastCount: excluded.length,
  };
}
