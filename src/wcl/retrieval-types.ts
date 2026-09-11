/**
 * The raw/normalized boundary.
 *
 * `RawEventPage.events` is the ONLY `readonly unknown[]` in this codebase, and
 * only `src/engine/normalization/` may import it. Nothing above that boundary
 * ever sees a Warcraft Logs page, a GraphQL shape, or a
 * `Record<string, unknown>` — which is what keeps a non-frozen upstream from
 * rippling into the analyzer.
 *
 * A contract test enforces the import restriction.
 */

import type { CoverageState, RetrievalOutcomeReason, TimeRangeMs } from "../engine/evidence/coverage.js";
import type { HostilitySelector } from "./retrieval-plan.js";

/**
 * One retrieved page, exactly as Warcraft Logs returned it.
 *
 * `nextPageTimestamp` is stored VERBATIM. No offset is applied anywhere: the
 * schema documents it as "a timestamp to pass in as the start time when
 * fetching the next page of data", so adding 1ms would skip events.
 */
export interface RawEventPage {
  readonly streamId: string;
  readonly pageOrdinal: number;
  readonly requestedStartTimeMs: number;
  readonly nextPageTimestamp: number | null;
  readonly events: readonly unknown[];
}

/** Per-page provenance. Retrieval facts only — no event contents. */
export interface PageProvenance {
  readonly pageOrdinal: number;
  readonly requestedStartTimeMs: number;
  readonly retrieved: boolean;
  readonly nextPageTimestamp: number | null;
  readonly eventCount: number;
}

export interface StreamProvenance {
  readonly streamId: string;
  readonly hostility: HostilitySelector;
  readonly pages: readonly PageProvenance[];
}

/**
 * What a retrieval stream vouches for.
 *
 * Purely a RETRIEVAL record. It says nothing about whether Warcraft Logs is
 * capable of emitting a category (capability), and nothing about whether the
 * fight was finished (finality). Both of those are recorded separately, on
 * purpose.
 */
export interface StreamCompleteness {
  readonly streamId: string;
  readonly state: CoverageState;
  readonly reason: RetrievalOutcomeReason;
  readonly requestedRange: TimeRangeMs;
  readonly coveredRanges: readonly TimeRangeMs[];
  readonly pagesRequested: number;
  readonly pagesRetrieved: number;
  readonly eventsRetrieved: number;
}
