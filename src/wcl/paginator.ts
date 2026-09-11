/**
 * The reusable Warcraft Logs event paginator.
 *
 * It knows about pages and cursors. It knows nothing about specialisations,
 * roles, event families or gameplay, and it never will — that is what makes it
 * reusable across every future analyzer.
 *
 * Three rules define it:
 *
 * 1. `nextPageTimestamp` is passed back VERBATIM as the next `startTime`. The
 *    schema documents it as exactly that, so an offset would skip events.
 * 2. Nothing is deduplicated and nothing is re-sorted. Multiple legitimate
 *    combat events can share timestamp, type, source, target and ability, so
 *    any dedup key would be a guess that silently deletes real evidence.
 * 3. There is NO page-level retry. The only retry in this system remains M2's
 *    bounded cached-token 401 refresh, inside the transport.
 *
 * Every abnormal ending preserves what was already retrieved and records why it
 * stopped. A failed page never becomes an empty period.
 */

import type { PageCoverageFact, RetrievalOutcomeReason, TimeRangeMs } from "../engine/evidence/coverage.js";
import { classifyCoverage, deriveCoveredRanges } from "../engine/evidence/coverage.js";
import { decodeEventPage, eventsQueryFor, eventsVariables } from "./events-query.js";
import type { WclGraphqlClient } from "./graphql-client.js";
import {
  EVENTS_END_TIME_BOUND,
  MAX_ELAPSED_MS,
  MAX_EVENTS,
  MAX_PAGES,
  streamIdFor,
  type EventRetrievalPlan,
  type HostilitySelector,
} from "./retrieval-plan.js";
import type {
  PageProvenance,
  RawEventPage,
  StreamCompleteness,
  StreamProvenance,
} from "./retrieval-types.js";
import type { WclFailureReason } from "./types.js";

/**
 * Called with each successfully retrieved page, in order, before the next is
 * requested.
 *
 * Pages are handed over as they arrive so the caller can normalize and release
 * them. That keeps peak memory at O(one page) + O(normalized fight) rather than
 * O(raw fight), which is what makes a full `All` stream viable inside a Worker.
 */
export type PageSink = (page: RawEventPage) => void;

export interface PaginateStreamRequest {
  readonly plan: EventRetrievalPlan;
  readonly hostility: HostilitySelector;
  readonly onPage: PageSink;
}

export interface PaginateStreamResult {
  readonly completeness: StreamCompleteness;
  readonly provenance: StreamProvenance;
}

export interface PaginatorDeps {
  readonly client: WclGraphqlClient;
  /** Injected so elapsed-time ceilings are deterministic in tests. */
  readonly now: () => number;
}

function reasonForFailure(reason: WclFailureReason): RetrievalOutcomeReason {
  switch (reason) {
    case "UPSTREAM_RATE_LIMITED":
      return "RATE_LIMITED";
    case "UPSTREAM_AUTH_FAILED":
    case "CREDENTIALS_NOT_ENCODABLE":
      return "UPSTREAM_AUTH_FAILED";
    case "UPSTREAM_UNAVAILABLE":
      return "UPSTREAM_UNAVAILABLE";
    default:
      return "UPSTREAM_DATA_INVALID";
  }
}

/**
 * Retrieves one stream to completion, or to the first condition that stops it.
 *
 * Pages already retrieved are always preserved and always reported through
 * `onPage`, including when a later page fails.
 */
export async function paginateEventStream(
  request: PaginateStreamRequest,
  deps: PaginatorDeps,
): Promise<PaginateStreamResult> {
  const { plan, hostility } = request;
  const streamId = streamIdFor(hostility);
  // Warcraft Logs treats `endTime` inclusively (verified by live probe), so the
  // requested range is closed at the top. An event at exactly `plan.endTimeMs`
  // is inside it.
  const requestedRange: TimeRangeMs = {
    fromReportTimeMs: plan.startTimeMs,
    toReportTimeMs: plan.endTimeMs,
    upperBound: EVENTS_END_TIME_BOUND,
  };
  const startedAt = deps.now();

  const pages: PageProvenance[] = [];
  let cursor = plan.startTimeMs;
  let eventsRetrieved = 0;
  let pagesRequested = 0;
  let stopReason: RetrievalOutcomeReason = "COMPLETED_NORMALLY";

  for (;;) {
    if (pages.length >= MAX_PAGES || eventsRetrieved >= MAX_EVENTS) {
      stopReason = "SAFETY_LIMIT_REACHED";
      break;
    }
    if (deps.now() - startedAt >= MAX_ELAPSED_MS) {
      stopReason = "SAFETY_LIMIT_REACHED";
      break;
    }

    const pageOrdinal = pages.length;
    const requestedStartTimeMs = cursor;
    pagesRequested += 1;

    const outcome = await deps.client.execute({
      query: eventsQueryFor(hostility),
      variables: eventsVariables(plan, hostility, requestedStartTimeMs),
      decode: decodeEventPage,
    });

    if (!outcome.ok) {
      pages.push({
        pageOrdinal,
        requestedStartTimeMs,
        retrieved: false,
        nextPageTimestamp: null,
        eventCount: 0,
      });
      stopReason = reasonForFailure(outcome.failure.reason);
      break;
    }

    if (outcome.data.kind === "REPORT_NOT_ACCESSIBLE") {
      pages.push({
        pageOrdinal,
        requestedStartTimeMs,
        retrieved: false,
        nextPageTimestamp: null,
        eventCount: 0,
      });
      stopReason = "UPSTREAM_DATA_INVALID";
      break;
    }

    if (outcome.data.kind === "MALFORMED_PAGINATOR") {
      pages.push({
        pageOrdinal,
        requestedStartTimeMs,
        retrieved: false,
        nextPageTimestamp: null,
        eventCount: 0,
      });
      stopReason = "MALFORMED_PAGE";
      break;
    }

    const { events, nextPageTimestamp } = outcome.data;
    eventsRetrieved += events.length;
    pages.push({
      pageOrdinal,
      requestedStartTimeMs,
      retrieved: true,
      nextPageTimestamp,
      eventCount: events.length,
    });
    request.onPage({
      streamId,
      pageOrdinal,
      requestedStartTimeMs,
      nextPageTimestamp,
      events,
    });

    if (nextPageTimestamp === null) {
      // Terminal page. The stream ended the way the schema says it should.
      break;
    }

    // A cursor that does not advance cannot ever terminate. Stopping here is
    // what turns a potential infinite loop into honest PARTIAL evidence. The
    // same check catches a decreasing cursor, which would otherwise re-request
    // ground already covered forever.
    if (nextPageTimestamp <= requestedStartTimeMs) {
      stopReason = "PAGINATION_STALLED";
      break;
    }

    // A cursor past the requested window means there is nothing left in range.
    // We asked for [start, end) and Warcraft Logs is pointing beyond it, so the
    // stream is finished rather than truncated.
    if (nextPageTimestamp >= plan.endTimeMs) {
      break;
    }

    cursor = nextPageTimestamp;
  }

  const coverageFacts: readonly PageCoverageFact[] = pages.map((page) => ({
    pageOrdinal: page.pageOrdinal,
    requestedStartTimeMs: page.requestedStartTimeMs,
    retrieved: page.retrieved,
    nextPageTimestamp: page.nextPageTimestamp,
  }));

  const coveredRanges = deriveCoveredRanges(coverageFacts, requestedRange);
  const derivedState = classifyCoverage(coveredRanges, requestedRange);

  // A safety ceiling must never present as COMPLETE, even if the pages
  // retrieved happen to span the requested range. Hitting a guardrail means we
  // stopped early by our own choice, and the evidence has to say so.
  const state =
    stopReason === "COMPLETED_NORMALLY"
      ? derivedState
      : derivedState === "COMPLETE"
        ? "PARTIAL"
        : derivedState;

  return {
    completeness: {
      streamId,
      state,
      reason: stopReason,
      requestedRange,
      coveredRanges,
      pagesRequested,
      pagesRetrieved: pages.filter((page) => page.retrieved).length,
      eventsRetrieved,
    },
    provenance: { streamId, hostility, pages },
  };
}
