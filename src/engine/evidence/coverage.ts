/**
 * Evidence coverage primitives.
 *
 * Coverage answers exactly one question: which report-relative intervals did we
 * actually obtain the requested evidence for?
 *
 * It deliberately does NOT answer:
 *
 * - "can Warcraft Logs supply this category at all?" — that is CAPABILITY, and
 *   it lives in `src/wcl/evidence-capability.ts`
 * - "was the fight finished?" — that is FINALITY, recorded on the fight itself
 *
 * Overloading coverage with either of those is how "we retrieved nothing"
 * becomes "nothing happened".
 *
 * This module has no Warcraft Logs types and no gameplay content, so both the
 * retrieval layer and the normalization layer can depend on it.
 */

/**
 * Coverage of evidence that Warcraft Logs is CAPABLE of supplying.
 *
 * These values are meaningless for a category whose capability is not
 * OBSERVABLE, which is why `CategoryEvidence` makes them structurally
 * unreachable in that case.
 */
export type CoverageState = "COMPLETE" | "PARTIAL" | "ABSENT";

export const COVERAGE_STATES = ["COMPLETE", "PARTIAL", "ABSENT"] as const satisfies readonly CoverageState[];

/**
 * Whether an interval's upper bound includes its own instant.
 *
 * Both kinds are needed because the two things we model genuinely differ, and
 * the difference was established by live probe rather than assumed:
 *
 * - a pagination cursor is the first timestamp NOT returned, so a non-terminal
 *   page covers up to it EXCLUSIVELY
 * - `events(endTime:)` returns events at exactly that instant, so a terminal
 *   page covers up to it INCLUSIVELY
 *
 * Representing this explicitly is the alternative to the things that would
 * otherwise be needed to keep a uniformly half-open model: adding a
 * millisecond, inventing an epsilon, or assuming timestamps are integers.
 * Warcraft Logs types timestamps as `Float`, so none of those is available.
 */
export type BoundKind = "INCLUSIVE" | "EXCLUSIVE";

/**
 * A report-relative interval.
 *
 * The LOWER bound is always inclusive. That is not an assumption: the probe
 * confirmed that passing a cursor as `startTime` returns the event at exactly
 * that timestamp.
 *
 * The UPPER bound is explicit. Empty when `from === to` and the upper bound is
 * exclusive; a single instant when `from === to` and it is inclusive.
 */
export interface TimeRangeMs {
  readonly fromReportTimeMs: number;
  readonly toReportTimeMs: number;
  readonly upperBound: BoundKind;
}

export function exclusiveRange(fromReportTimeMs: number, toReportTimeMs: number): TimeRangeMs {
  return { fromReportTimeMs, toReportTimeMs, upperBound: "EXCLUSIVE" };
}

export function inclusiveRange(fromReportTimeMs: number, toReportTimeMs: number): TimeRangeMs {
  return { fromReportTimeMs, toReportTimeMs, upperBound: "INCLUSIVE" };
}

/**
 * Why a retrieval ended in the state it did.
 *
 * `NOT_REQUESTED` means no enabled plan asked for it. It is NOT "Warcraft Logs
 * cannot supply it" — that is a capability value, and the two must never be
 * substituted for one another.
 */
export type RetrievalOutcomeReason =
  | "COMPLETED_NORMALLY"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_AUTH_FAILED"
  | "UPSTREAM_DATA_INVALID"
  | "RATE_LIMITED"
  | "MALFORMED_PAGE"
  | "PAGINATION_STALLED"
  | "SAFETY_LIMIT_REACHED"
  | "REPORT_REVISION_CHANGED"
  | "REPORT_ARCHIVED_INACCESSIBLE"
  | "MALFORMED_EVENT_CONTENT"
  | "NOT_REQUESTED";

export const RETRIEVAL_OUTCOME_REASONS = [
  "COMPLETED_NORMALLY",
  "UPSTREAM_UNAVAILABLE",
  "UPSTREAM_AUTH_FAILED",
  "UPSTREAM_DATA_INVALID",
  "RATE_LIMITED",
  "MALFORMED_PAGE",
  "PAGINATION_STALLED",
  "SAFETY_LIMIT_REACHED",
  "REPORT_REVISION_CHANGED",
  "REPORT_ARCHIVED_INACCESSIBLE",
  "MALFORMED_EVENT_CONTENT",
  "NOT_REQUESTED",
] as const satisfies readonly RetrievalOutcomeReason[];

/**
 * Everything `deriveCoveredRanges` is allowed to see about one page.
 *
 * This type is deliberately narrow. It carries no events, no event timestamps,
 * and no event count, so coverage CANNOT be computed from what happened to be
 * in a page. That is not a convention — a page with zero events vouches for its
 * full range exactly as a busy page does, and a type that cannot express event
 * contents is the only way to keep that true under later edits.
 */
export interface PageCoverageFact {
  readonly pageOrdinal: number;
  /** The `startTime` this page was requested with. Inclusive. */
  readonly requestedStartTimeMs: number;
  readonly retrieved: boolean;
  /**
   * The cursor Warcraft Logs returned. `null` marks the terminal page.
   * Meaningful only when `retrieved` is true.
   */
  readonly nextPageTimestamp: number | null;
}

/** Ordering on upper bounds: a higher value wins, and inclusive beats exclusive at equal value. */
function upperExceeds(left: TimeRangeMs, right: TimeRangeMs): boolean {
  if (left.toReportTimeMs !== right.toReportTimeMs) {
    return left.toReportTimeMs > right.toReportTimeMs;
  }
  return left.upperBound === "INCLUSIVE" && right.upperBound === "EXCLUSIVE";
}

function isEmpty(range: TimeRangeMs): boolean {
  if (range.fromReportTimeMs > range.toReportTimeMs) {
    return true;
  }
  return range.fromReportTimeMs === range.toReportTimeMs && range.upperBound === "EXCLUSIVE";
}

function intersect(range: TimeRangeMs, bounds: TimeRangeMs): TimeRangeMs | null {
  const from = Math.max(range.fromReportTimeMs, bounds.fromReportTimeMs);
  const upper = upperExceeds(range, bounds) ? bounds : range;
  const result: TimeRangeMs = {
    fromReportTimeMs: from,
    toReportTimeMs: upper.toReportTimeMs,
    upperBound: upper.upperBound,
  };
  return isEmpty(result) ? null : result;
}

/** Merges touching or overlapping ranges. Input must be in order. */
function mergeContiguous(ranges: readonly TimeRangeMs[]): readonly TimeRangeMs[] {
  const merged: TimeRangeMs[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && range.fromReportTimeMs <= previous.toReportTimeMs) {
      const upper = upperExceeds(range, previous) ? range : previous;
      merged[merged.length - 1] = {
        fromReportTimeMs: previous.fromReportTimeMs,
        toReportTimeMs: upper.toReportTimeMs,
        upperBound: upper.upperBound,
      };
      continue;
    }
    merged.push(range);
  }
  return merged;
}

/**
 * Derives which intervals a stream's retrieved pages vouch for.
 *
 * Both rules are established by live probe, not inferred:
 *
 *     non-terminal page k vouches for  [s_k, c_k)   cursor is the first
 *                                                   timestamp NOT returned
 *     terminal     page k vouches for  [s_k, end]   endTime is inclusive
 *
 * Consequences that are the entire point of this function:
 *
 * - A page containing ZERO events still vouches for its full range. A quiet
 *   interval is observed absence of events, not unobserved time. Deriving
 *   coverage from "the last retrieved event" silently converts the first into
 *   the second.
 * - Coverage stops at the first page that failed. Pages after a failure vouch
 *   for nothing, even if a later one happened to succeed.
 * - A cursor that fails to advance (stalled, or decreasing) proves no
 *   additional coverage, so it contributes an empty range and is dropped.
 */
export function deriveCoveredRanges(
  pages: readonly PageCoverageFact[],
  requested: TimeRangeMs,
): readonly TimeRangeMs[] {
  const vouched: TimeRangeMs[] = [];

  for (const page of pages) {
    if (!page.retrieved) {
      break;
    }

    const terminal = page.nextPageTimestamp === null;
    const candidate: TimeRangeMs = terminal
      ? {
          fromReportTimeMs: page.requestedStartTimeMs,
          toReportTimeMs: requested.toReportTimeMs,
          upperBound: requested.upperBound,
        }
      : exclusiveRange(page.requestedStartTimeMs, page.nextPageTimestamp ?? 0);

    const clamped = intersect(candidate, requested);
    if (clamped !== null) {
      vouched.push(clamped);
    }

    if (terminal) {
      break;
    }
  }

  return mergeContiguous(vouched);
}

/**
 * Intersects two covered-range lists.
 *
 * Used when one category draws on more than one stream: it is covered only
 * where EVERY contributing stream covers it. Union would claim coverage from a
 * stream that never carried the category.
 */
export function intersectRangeLists(
  left: readonly TimeRangeMs[],
  right: readonly TimeRangeMs[],
): readonly TimeRangeMs[] {
  const overlaps: TimeRangeMs[] = [];
  for (const a of left) {
    for (const b of right) {
      const overlap = intersect(a, b);
      if (overlap !== null) {
        overlaps.push(overlap);
      }
    }
  }
  overlaps.sort((a, b) => a.fromReportTimeMs - b.fromReportTimeMs);
  return mergeContiguous(overlaps);
}

export function rangesAreEqual(left: TimeRangeMs, right: TimeRangeMs): boolean {
  return (
    left.fromReportTimeMs === right.fromReportTimeMs &&
    left.toReportTimeMs === right.toReportTimeMs &&
    left.upperBound === right.upperBound
  );
}

/**
 * True when `timeMs` falls inside `range`.
 *
 * The lower bound always includes its instant. The upper bound includes its
 * instant only when the range says so — which, for a Warcraft Logs events
 * request, it does.
 */
export function rangeContains(range: TimeRangeMs, timeMs: number): boolean {
  if (timeMs < range.fromReportTimeMs) {
    return false;
  }
  return range.upperBound === "INCLUSIVE" ? timeMs <= range.toReportTimeMs : timeMs < range.toReportTimeMs;
}

export function coveredRangesContain(ranges: readonly TimeRangeMs[], timeMs: number): boolean {
  return ranges.some((range) => rangeContains(range, timeMs));
}

/**
 * Classifies coverage from the derived ranges.
 *
 * COMPLETE requires covering the requested range exactly, bound included.
 * PARTIAL requires having covered something. Nothing covered is ABSENT — and
 * note the asymmetry: ABSENT implies empty ranges, but empty ranges do not by
 * themselves imply ABSENT, because a caller may already know the retrieval
 * failed for another reason.
 */
export function classifyCoverage(
  coveredRanges: readonly TimeRangeMs[],
  requested: TimeRangeMs,
): CoverageState {
  const first = coveredRanges[0];
  if (first === undefined) {
    return "ABSENT";
  }
  if (coveredRanges.length === 1 && rangesAreEqual(first, requested)) {
    return "COMPLETE";
  }
  return "PARTIAL";
}
