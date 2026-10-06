/**
 * Query-specific coverage for observed facts (M11-E1). Designed BEFORE the
 * aggregates, and the only thing that lets an aggregate be exact.
 *
 * A fact about a window is COMPLETE for one evidence category only when ALL of:
 *
 *   capability  the category is OBSERVABLE (UNVERIFIED / NOT_OBSERVABLE
 *               establish nothing — NOT_ESTABLISHED)
 *   integrity   the category is not decode-degraded. Degradation is recorded
 *               per category, not per instant (`MALFORMED_EVENT_CONTENT`), so
 *               it can never be ruled out for any window: PARTIAL at best
 *   interval    the window `[start, end)` lies wholly inside the category's
 *               covered ranges, each range's own upper-bound kind honoured
 *   scope       every source actor the fact is about is in the category's
 *               vouched `actorScope` (null vouches for every actor)
 *
 * WHAT THE STATES LICENSE
 *
 *   COMPLETE         EXACT scalars, including EXACT 0; collections EXHAUSTIVE
 *   PARTIAL          what was observed is real, but more may exist. A COUNT may
 *                    be AT_LEAST (never AT_LEAST 0 — that says nothing, so it is
 *                    UNKNOWN); raw-field sums, averages and rates are UNKNOWN,
 *                    because no raw field's sign is proven; a collection is
 *                    OBSERVED_ONLY
 *   ABSENT           nothing was retrieved for the window: scalars UNKNOWN,
 *                    collections OBSERVED_ONLY
 *   NOT_ESTABLISHED  the category cannot be vouched for at all: likewise
 *
 * AT_LEAST is a SCALAR bound with a defined monotone order. A set, a map of
 * counts, a sequence or a list of evidence is never "at least" anything: a
 * partial set is not a lower bound in that sense, and a sequence observed
 * through coverage gaps is not a prefix. Collections therefore carry their own
 * completeness, derived from coverage (`ObservedCollection`).
 *
 * Absence of events is never zero here unless the state is COMPLETE.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import {
  classifyCoverage,
  exclusiveRange,
  intersectRangeLists,
  type TimeRangeMs,
} from "../engine/evidence/coverage.js";
import type { EvidenceCategory } from "../wcl/evidence-capability.js";

export type FactCoverageState = "COMPLETE" | "PARTIAL" | "ABSENT" | "NOT_ESTABLISHED";

export type FactCoverageReason =
  | "CAPABILITY_UNVERIFIED"
  | "CAPABILITY_NOT_OBSERVABLE"
  | "RETRIEVAL_ABSENT"
  | "DECODE_DEGRADED"
  | "INTERVAL_NOT_COVERED"
  | "INTERVAL_NOT_FULLY_COVERED"
  | "SOURCE_SCOPE_NOT_COVERED"
  | "CATALOG_NOT_COMPLETE";

const SEVERITY: Record<FactCoverageState, number> = {
  COMPLETE: 0,
  PARTIAL: 1,
  ABSENT: 2,
  NOT_ESTABLISHED: 3,
};

function moreSevere(left: FactCoverageState, right: FactCoverageState): FactCoverageState {
  return SEVERITY[right] > SEVERITY[left] ? right : left;
}

/** Coverage of ONE category for one fact. */
export interface CategoryFactCoverage {
  readonly category: EvidenceCategory;
  readonly state: FactCoverageState;
  /** Sorted, distinct. Empty exactly when COMPLETE. */
  readonly reasons: readonly FactCoverageReason[];
  /** Source actors the fact needs that the category does not vouch for. Sorted. */
  readonly sourceActorIdsNotVouched: readonly number[];
}

/** Coverage of a fact: the worst of the categories it needs, with each one kept. */
export interface FactCoverage {
  readonly state: FactCoverageState;
  /** Sorted by category. */
  readonly categories: readonly CategoryFactCoverage[];
}

/** A half-open report-relative window `[startMs, endMs)`. */
export interface FactWindow {
  readonly startMs: number;
  readonly endMs: number;
}

function sortedDistinct<T extends string | number>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort((left, right) =>
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left) < String(right)
        ? -1
        : 1,
  );
}

/**
 * Coverage of a TIME-RANGED event category (casts, damage, ...) for a window
 * and a set of source actors.
 */
export function eventCategoryCoverage(
  fight: CombatFight,
  category: EvidenceCategory,
  window: FactWindow,
  sourceActorIds: readonly number[],
): CategoryFactCoverage {
  const evidence = fight.completeness.categories[category];
  if (evidence.capability === "UNVERIFIED") {
    return {
      category,
      state: "NOT_ESTABLISHED",
      reasons: ["CAPABILITY_UNVERIFIED"],
      sourceActorIdsNotVouched: [],
    };
  }
  if (evidence.capability === "NOT_OBSERVABLE") {
    return {
      category,
      state: "NOT_ESTABLISHED",
      reasons: ["CAPABILITY_NOT_OBSERVABLE"],
      sourceActorIdsNotVouched: [],
    };
  }
  const coverage = evidence.coverage;
  if (coverage.state === "ABSENT") {
    return { category, state: "ABSENT", reasons: ["RETRIEVAL_ABSENT"], sourceActorIdsNotVouched: [] };
  }

  const requested: TimeRangeMs = exclusiveRange(window.startMs, window.endMs);
  const within = intersectRangeLists(coverage.coveredRanges, [requested]);
  const interval = classifyCoverage(within, requested);
  if (interval === "ABSENT") {
    return { category, state: "ABSENT", reasons: ["INTERVAL_NOT_COVERED"], sourceActorIdsNotVouched: [] };
  }

  let state: FactCoverageState = "COMPLETE";
  const reasons: FactCoverageReason[] = [];
  if (interval === "PARTIAL") {
    state = "PARTIAL";
    reasons.push("INTERVAL_NOT_FULLY_COVERED");
  }
  if (coverage.reason === "MALFORMED_EVENT_CONTENT") {
    state = moreSevere(state, "PARTIAL");
    reasons.push("DECODE_DEGRADED");
  }
  const vouched = coverage.actorScope === null ? null : new Set(coverage.actorScope);
  const notVouched = vouched === null ? [] : sourceActorIds.filter((actorId) => !vouched.has(actorId));
  if (notVouched.length > 0) {
    state = moreSevere(state, "PARTIAL");
    reasons.push("SOURCE_SCOPE_NOT_COVERED");
  }
  return {
    category,
    state,
    reasons: sortedDistinct(reasons),
    sourceActorIdsNotVouched: sortedDistinct(notVouched),
  };
}

/**
 * Coverage of the actor CATALOG, which a fact needs whenever it groups or
 * filters by master data (owner views, the boss-subtype filter). The catalog
 * is not time-ranged: it is COMPLETE or it is not.
 */
export function catalogCoverage(fight: CombatFight): CategoryFactCoverage {
  const evidence = fight.completeness.categories.ACTORS;
  if (evidence.capability === "UNVERIFIED") {
    return {
      category: "ACTORS",
      state: "NOT_ESTABLISHED",
      reasons: ["CAPABILITY_UNVERIFIED"],
      sourceActorIdsNotVouched: [],
    };
  }
  if (evidence.capability === "NOT_OBSERVABLE") {
    return {
      category: "ACTORS",
      state: "NOT_ESTABLISHED",
      reasons: ["CAPABILITY_NOT_OBSERVABLE"],
      sourceActorIdsNotVouched: [],
    };
  }
  if (evidence.coverage.state === "COMPLETE") {
    return { category: "ACTORS", state: "COMPLETE", reasons: [], sourceActorIdsNotVouched: [] };
  }
  return {
    category: "ACTORS",
    state: evidence.coverage.state === "ABSENT" ? "ABSENT" : "PARTIAL",
    reasons: ["CATALOG_NOT_COMPLETE"],
    sourceActorIdsNotVouched: [],
  };
}

export function combineCoverage(categories: readonly CategoryFactCoverage[]): FactCoverage {
  const sorted = [...categories].sort((left, right) => (left.category < right.category ? -1 : 1));
  let state: FactCoverageState = "COMPLETE";
  for (const entry of sorted) state = moreSevere(state, entry.state);
  return { state, categories: sorted };
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export type ProvenUnknownReason =
  /** Coverage is ABSENT or NOT_ESTABLISHED. */
  | "COVERAGE_INSUFFICIENT"
  /** PARTIAL coverage and nothing observed: "at least 0" says nothing. */
  | "NO_INFORMATIVE_LOWER_BOUND"
  /** PARTIAL coverage of a raw-field sum: no raw field's sign is proven. */
  | "FIELD_DOMAIN_NOT_PROVEN"
  /** A supplied value or running total is not a safe integer. */
  | "UNSAFE_INTEGER_ARITHMETIC";

/**
 * A SCALAR value with its epistemic status. Never used for a collection.
 *
 *   EXACT     COMPLETE coverage
 *   AT_LEAST  PARTIAL coverage, and only for counts — monotone and
 *             non-negative by construction: the observed count, and more
 *             events may exist
 *   UNKNOWN   everything else
 */
export type Proven<T> =
  | { readonly kind: "EXACT"; readonly value: T }
  | { readonly kind: "AT_LEAST"; readonly value: T }
  | { readonly kind: "UNKNOWN"; readonly reason: ProvenUnknownReason };

/** A count: monotone and non-negative by construction. */
export function provenCount(state: FactCoverageState, observed: number): Proven<number> {
  if (state === "COMPLETE") return { kind: "EXACT", value: observed };
  if (state === "PARTIAL") {
    return observed > 0
      ? { kind: "AT_LEAST", value: observed }
      : { kind: "UNKNOWN", reason: "NO_INFORMATIVE_LOWER_BOUND" };
  }
  return { kind: "UNKNOWN", reason: "COVERAGE_INSUFFICIENT" };
}

/**
 * How much a collection claims.
 *
 *   EXHAUSTIVE     COMPLETE coverage of the capability, scope and window the
 *                  collection answers for: nothing else exists there
 *   OBSERVED_ONLY  these items were positively observed, and NOTHING is claimed
 *                  about what else may exist — not exhaustive, not a lower
 *                  bound, not a prefix. `coverage` says why; `null` means the
 *                  collection makes no coverage claim at all (e.g. per-actor
 *                  activity and summon evidence, which are positive
 *                  observations only)
 */
export type CollectionCompleteness =
  | { readonly kind: "EXHAUSTIVE"; readonly coverage: FactCoverage }
  | { readonly kind: "OBSERVED_ONLY"; readonly coverage: FactCoverage | null };

/** Items that were observed, and exactly what is claimed about the rest. */
export interface ObservedCollection<T> {
  readonly items: readonly T[];
  readonly completeness: CollectionCompleteness;
}

/** A coverage-gated collection: EXHAUSTIVE only under COMPLETE coverage. */
export function observedCollection<T>(coverage: FactCoverage, items: readonly T[]): ObservedCollection<T> {
  return {
    items,
    completeness:
      coverage.state === "COMPLETE" ? { kind: "EXHAUSTIVE", coverage } : { kind: "OBSERVED_ONLY", coverage },
  };
}

/** A collection of positive observations that makes no coverage claim. */
export function observationsOnly<T>(items: readonly T[]): ObservedCollection<T> {
  return { items, completeness: { kind: "OBSERVED_ONLY", coverage: null } };
}
