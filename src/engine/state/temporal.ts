/**
 * Temporal addressing over the canonical event sequence.
 *
 * Milestone 3 is explicit that `CombatFight.events` is RETRIEVAL order: never
 * re-sorted, never deduplicated, and NOT contractually guaranteed to be
 * ordered by `reportTimeMs`. A regression test pins the case where a later page
 * carries an earlier timestamp.
 *
 * That single fact shapes everything here:
 *
 * - CANONICAL POSITION (the index into `events`) is always a sound address.
 *   Event-relative questions resolve from it and need no assumptions.
 * - A TIMESTAMP is only a sound address once monotonicity has been OBSERVED.
 *   Timestamp-addressed questions therefore fail closed with
 *   `NON_MONOTONIC_TIME` rather than answering over an order that may not hold.
 *
 * Nothing in this module repairs, sorts around, or compensates for a violation.
 * A violation is recorded as a fact, with provenance, and the queries that
 * depend on the missing property decline to answer.
 *
 * `ingestionOrdinal` is also NOT an index into `events`: malformed observations
 * consume ordinals and live outside the array, so ordinals are gapped.
 * Resolution of an ordinal is therefore an explicit three-way answer rather
 * than an array lookup.
 */

import type { EvidenceLocator } from "../evidence/locator.js";
import type { UnknownReason } from "./state-result.js";

// --------------------------------------------------------------------------
// Temporal integrity
// --------------------------------------------------------------------------

/**
 * Why the canonical order cannot be read as a timeline.
 *
 * - `TIMESTAMP_DECREASED` — observed directly during the forward scan.
 * - `CONCATENATED_STREAMS` — more than one retrieval stream contributed to a
 *   single array. Ingestion appends streams one after another, so even if each
 *   stream is internally chronological the concatenation is not. This is a
 *   STRUCTURAL fact, knowable without finding a decrease, and it is recorded
 *   even when no decrease happened to be observed (an empty second stream
 *   leaves no seam to detect).
 */
export type TemporalIntegrityReason = "CONCATENATED_STREAMS" | "TIMESTAMP_DECREASED";

/** The first observed place where time went backwards, kept for provenance. */
export interface TimestampViolation {
  readonly previousPosition: number;
  readonly previousLocator: EvidenceLocator;
  readonly previousReportTimeMs: number;
  readonly offendingPosition: number;
  readonly offendingLocator: EvidenceLocator;
  readonly offendingReportTimeMs: number;
}

/**
 * Whether the canonical event order may be treated as a timeline.
 *
 * `MONOTONIC` exactly when `reasons` is empty. Only the FIRST violation is
 * retained: one counterexample is enough to disqualify timestamp addressing,
 * and collecting every subsequent one would grow without adding information.
 */
export interface TemporalIntegrity {
  readonly state: "MONOTONIC" | "NON_MONOTONIC";
  readonly reasons: readonly TemporalIntegrityReason[];
  readonly firstViolation: TimestampViolation | null;
  /** Stream ids actually observed on events, in first-seen order. */
  readonly observedStreamIds: readonly string[];
  /** Streams the retrieval plan declared, from provenance. */
  readonly declaredStreamCount: number;
}

export function isMonotonic(integrity: TemporalIntegrity): boolean {
  return integrity.state === "MONOTONIC";
}

// --------------------------------------------------------------------------
// Timestamp runs
// --------------------------------------------------------------------------

/**
 * A maximal run of consecutive events sharing one timestamp.
 *
 * Built during the forward scan so a timestamp can be addressed without
 * searching `CombatFight.events` itself. When temporal integrity is MONOTONIC
 * this array is sorted ascending by construction, which is what makes the
 * search in `resolveTemporalPosition` sound. It is built unconditionally but
 * READ only under MONOTONIC, because under a violation the same timestamp may
 * appear in more than one run.
 */
export interface TimestampRun {
  readonly reportTimeMs: number;
  readonly firstPosition: number;
  readonly lastPosition: number;
}

// --------------------------------------------------------------------------
// Ordinal resolution
// --------------------------------------------------------------------------

/**
 * What an `ingestionOrdinal` refers to.
 *
 * Three outcomes, not two. `MALFORMED_OBSERVATION` is the one that matters:
 * an ordinal belonging to an observation whose envelope failed must resolve to
 * "that was a defect", never to a neighbouring event. Silently returning the
 * next event is exactly how a gap becomes a wrong answer.
 */
export type OrdinalResolution =
  | { readonly kind: "EVENT"; readonly position: number }
  | { readonly kind: "MALFORMED_OBSERVATION" }
  | { readonly kind: "NOT_PRESENT" };

// --------------------------------------------------------------------------
// Temporal positions
// --------------------------------------------------------------------------

export type TemporalAnchor = "BEFORE_EVENT" | "AFTER_EVENT" | "START_OF_TIMESTAMP" | "END_OF_TIMESTAMP";

/**
 * A point in the fight that a state question can be asked about.
 *
 * Event-relative anchors address a canonical position:
 *
 * - `BEFORE_EVENT` — the instant just before that event was observed. The event
 *   itself is NOT included.
 * - `AFTER_EVENT` — the instant just after. The event IS included.
 *
 * Timestamp anchors address a millisecond:
 *
 * - `START_OF_TIMESTAMP` — before anything at that timestamp.
 * - `END_OF_TIMESTAMP` — after everything at that timestamp.
 *
 * The distinction is load-bearing because many events legitimately share a
 * millisecond and their relative order is not recoverable from the timestamp.
 * "What was established immediately before this cast?" is a BEFORE_EVENT
 * question and must not degrade into a START_OF_TIMESTAMP one.
 */
export type TemporalPosition =
  | { readonly anchor: "BEFORE_EVENT"; readonly position: number }
  | { readonly anchor: "AFTER_EVENT"; readonly position: number }
  | { readonly anchor: "START_OF_TIMESTAMP"; readonly reportTimeMs: number }
  | { readonly anchor: "END_OF_TIMESTAMP"; readonly reportTimeMs: number };

export function beforeEvent(position: number): TemporalPosition {
  return { anchor: "BEFORE_EVENT", position };
}

export function afterEvent(position: number): TemporalPosition {
  return { anchor: "AFTER_EVENT", position };
}

export function startOfTimestamp(reportTimeMs: number): TemporalPosition {
  return { anchor: "START_OF_TIMESTAMP", reportTimeMs };
}

export function endOfTimestamp(reportTimeMs: number): TemporalPosition {
  return { anchor: "END_OF_TIMESTAMP", reportTimeMs };
}

/**
 * A temporal position resolved against one fight.
 *
 * `lastIncludedPosition` is the last canonical position at or before the
 * position, or `-1` when the position precedes every event. Because the
 * canonical sequence is total, "at or before" is always a prefix.
 *
 * `boundaryReportTimeMs` is the instant the question was about — the anchor
 * event's own timestamp for event anchors, or the addressed millisecond for
 * timestamp anchors. Absence claims need coverage through this instant, so it
 * is deliberately the anchor's time rather than the last included event's,
 * which would under-claim the interval that has to be covered.
 */
export interface ResolvedPrefix {
  readonly lastIncludedPosition: number;
  readonly boundaryReportTimeMs: number;
}

export type PositionResolution =
  | { readonly ok: true; readonly prefix: ResolvedPrefix }
  | { readonly ok: false; readonly reason: UnknownReason };

export interface TemporalContext {
  readonly eventCount: number;
  readonly reportTimeAt: (position: number) => number | null;
  readonly timestampRuns: readonly TimestampRun[];
  readonly integrity: TemporalIntegrity;
}

/** Last run whose timestamp satisfies the predicate, assuming ascending runs. */
function lastRunBelow(
  runs: readonly TimestampRun[],
  limitMs: number,
  inclusive: boolean,
): TimestampRun | null {
  let low = 0;
  let high = runs.length - 1;
  let found: TimestampRun | null = null;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const run = runs[middle];
    if (run === undefined) {
      break;
    }
    const qualifies = inclusive ? run.reportTimeMs <= limitMs : run.reportTimeMs < limitMs;
    if (qualifies) {
      found = run;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found;
}

/**
 * Resolves a temporal position to a canonical prefix.
 *
 * Event anchors resolve unconditionally: canonical order is always valid, so
 * "immediately before this event" is answerable even in a fight whose
 * timestamps are not monotonic. That is the reason event-relative addressing
 * exists rather than being sugar over timestamps.
 *
 * Timestamp anchors require MONOTONIC and otherwise fail closed. The search
 * runs over the derived `timestampRuns` index, never over
 * `CombatFight.events` — the canonical array is not searched by time anywhere
 * in this codebase.
 */
export function resolveTemporalPosition(
  context: TemporalContext,
  position: TemporalPosition,
): PositionResolution {
  if (position.anchor === "BEFORE_EVENT" || position.anchor === "AFTER_EVENT") {
    const reportTimeMs = context.reportTimeAt(position.position);
    if (reportTimeMs === null) {
      // A position outside the canonical sequence is not a point in this fight.
      return { ok: false, reason: "UNSUPPORTED_DERIVATION" };
    }
    const lastIncludedPosition =
      position.anchor === "AFTER_EVENT" ? position.position : position.position - 1;
    return { ok: true, prefix: { lastIncludedPosition, boundaryReportTimeMs: reportTimeMs } };
  }

  if (!isMonotonic(context.integrity)) {
    return { ok: false, reason: "NON_MONOTONIC_TIME" };
  }

  const inclusive = position.anchor === "END_OF_TIMESTAMP";
  const run = lastRunBelow(context.timestampRuns, position.reportTimeMs, inclusive);
  return {
    ok: true,
    prefix: {
      lastIncludedPosition: run === null ? -1 : run.lastPosition,
      boundaryReportTimeMs: position.reportTimeMs,
    },
  };
}

/**
 * Last entry of an ascending position list that is at or before `limit`.
 *
 * The lists this runs over are built by a single forward scan, so they are
 * ascending BY CONSTRUCTION rather than by assumption. `limit` of `-1` yields
 * `null`, since canonical positions start at 0.
 */
export function lastPositionAtOrBefore(positions: readonly number[], limit: number): number | null {
  let low = 0;
  let high = positions.length - 1;
  let found: number | null = null;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const candidate = positions[middle];
    if (candidate === undefined) {
      break;
    }
    if (candidate <= limit) {
      found = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found;
}
