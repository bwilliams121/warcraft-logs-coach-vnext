import { describe, expect, it } from "vitest";

import { coveredRangesContain, exclusiveRange, inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { paginateEventStream } from "../../src/wcl/paginator.js";
import { createEventRetrievalPlan, MAX_PAGES } from "../../src/wcl/retrieval-plan.js";
import type { RawEventPage } from "../../src/wcl/retrieval-types.js";
import { jsonResponse, rawResponse, networkFailure } from "../support/fake-fetch.js";
import {
  createTestGraphqlClient,
  eventPageResponse,
  malformedPaginatorResponse,
  rawEvent,
  variablesOf,
} from "../support/wcl-harness.js";

const PLAN = createEventRetrievalPlan({
  reportCode: "aBcDeFgH12345678",
  fightId: 6,
  startTimeMs: 1000,
  endTimeMs: 5000,
  includeResources: false,
  limit: 100,
});

async function run(responses: readonly (() => Response)[]) {
  const pages: RawEventPage[] = [];
  const { client, fetch } = createTestGraphqlClient((_request, index) => {
    const next = responses[Math.min(index, responses.length - 1)];
    if (next === undefined) {
      throw new Error("no response configured");
    }
    return next();
  });
  const result = await paginateEventStream(
    { plan: PLAN, hostility: "UNSPECIFIED", onPage: (page) => pages.push(page) },
    { client, now: () => 0 },
  );
  return { ...result, pages, fetch };
}

describe("terminal pages", () => {
  it("completes on a single terminal page", async () => {
    const { completeness, pages } = await run([() => eventPageResponse([rawEvent(1100, "cast")], null)]);

    expect(completeness.state).toBe("COMPLETE");
    expect(completeness.reason).toBe("COMPLETED_NORMALLY");
    expect(completeness.coveredRanges).toEqual([inclusiveRange(1000, 5000)]);
    expect(pages).toHaveLength(1);
  });

  it("reports a complete stream containing zero events, not an absent one", async () => {
    const { completeness } = await run([() => eventPageResponse([], null)]);

    // "We retrieved everything and there was nothing" must never be confused
    // with "we retrieved nothing".
    expect(completeness.state).toBe("COMPLETE");
    expect(completeness.eventsRetrieved).toBe(0);
    expect(completeness.coveredRanges).toEqual([inclusiveRange(1000, 5000)]);
  });

  it("records the terminal bound as INCLUSIVE, matching verified WCL behaviour", async () => {
    // A live probe established that events(endTime:) returns events at exactly
    // that instant, so the requested range is closed at the top.
    const { completeness } = await run([() => eventPageResponse([], null)]);

    expect(completeness.requestedRange.upperBound).toBe("INCLUSIVE");
    expect(completeness.coveredRanges).toEqual([
      { fromReportTimeMs: 1000, toReportTimeMs: 5000, upperBound: "INCLUSIVE" },
    ]);
    expect(coveredRangesContain(completeness.coveredRanges, 5000)).toBe(true);
  });
});

describe("cursor continuation", () => {
  it("passes nextPageTimestamp back VERBATIM as the next startTime", async () => {
    const { fetch } = await run([
      () => eventPageResponse([rawEvent(1100, "cast")], 2345),
      () => eventPageResponse([rawEvent(2400, "cast")], null),
    ]);

    const second = fetch.graphqlCalls()[1];
    expect(second).toBeDefined();
    // Not 2346. The schema documents this value as the next start time, so an
    // offset would skip every event at that instant.
    expect(variablesOf(second?.body)["startTime"]).toBe(2345);
  });

  it("pins endTime to the fight boundary on every page", async () => {
    const { fetch } = await run([
      () => eventPageResponse([], 2000),
      () => eventPageResponse([], 3000),
      () => eventPageResponse([], null),
    ]);

    for (const call of fetch.graphqlCalls()) {
      expect(variablesOf(call.body)["endTime"]).toBe(5000);
    }
  });

  it("walks multiple pages and reports them in retrieval order", async () => {
    const { completeness, pages } = await run([
      () => eventPageResponse([rawEvent(1100, "a")], 2000),
      () => eventPageResponse([rawEvent(2100, "b")], 3000),
      () => eventPageResponse([rawEvent(3100, "c")], null),
    ]);

    expect(pages.map((page) => page.pageOrdinal)).toEqual([0, 1, 2]);
    expect(completeness.state).toBe("COMPLETE");
    expect(completeness.eventsRetrieved).toBe(3);
  });

  it("continues through an empty page that still advances the cursor", async () => {
    const { completeness, pages } = await run([
      () => eventPageResponse([], 2000),
      () => eventPageResponse([rawEvent(2100, "a")], null),
    ]);

    expect(pages).toHaveLength(2);
    expect(completeness.state).toBe("COMPLETE");
  });

  it("finishes when the cursor points past the requested window", async () => {
    const { completeness, fetch } = await run([() => eventPageResponse([rawEvent(4900, "a")], 6000)]);

    expect(completeness.state).toBe("COMPLETE");
    expect(fetch.graphqlCalls()).toHaveLength(1);
  });
});

describe("cursors that cannot make progress", () => {
  it("stops on a repeated cursor and stays PARTIAL", async () => {
    const { completeness, fetch } = await run([() => eventPageResponse([rawEvent(1100, "a")], 1000)]);

    expect(completeness.reason).toBe("PAGINATION_STALLED");
    expect(completeness.state).not.toBe("COMPLETE");
    // Crucially: it stopped rather than looping forever.
    expect(fetch.graphqlCalls()).toHaveLength(1);
  });

  it("stops on a decreasing cursor", async () => {
    const { completeness } = await run([
      () => eventPageResponse([], 3000),
      () => eventPageResponse([], 1500),
    ]);

    expect(completeness.reason).toBe("PAGINATION_STALLED");
    expect(completeness.state).toBe("PARTIAL");
  });
});

describe("malformed paginators", () => {
  it("treats a null data payload as malformed, never as an empty page", async () => {
    const { completeness } = await run([
      () => malformedPaginatorResponse({ data: null, nextPageTimestamp: null }),
    ]);

    expect(completeness.reason).toBe("MALFORMED_PAGE");
    expect(completeness.state).toBe("ABSENT");
    expect(completeness.eventsRetrieved).toBe(0);
  });

  it("treats a null paginator as malformed", async () => {
    const { completeness } = await run([() => malformedPaginatorResponse(null)]);
    expect(completeness.reason).toBe("MALFORMED_PAGE");
  });

  it("rejects a non-numeric cursor rather than coercing it", async () => {
    const { completeness } = await run([
      () => malformedPaginatorResponse({ data: [], nextPageTimestamp: "2000" }),
    ]);
    expect(completeness.reason).toBe("MALFORMED_PAGE");
  });

  it("keeps earlier pages when a later one is malformed", async () => {
    const { completeness, pages } = await run([
      () => eventPageResponse([rawEvent(1100, "a")], 2000),
      () => malformedPaginatorResponse({ data: "not-an-array", nextPageTimestamp: null }),
    ]);

    expect(pages).toHaveLength(1);
    expect(completeness.state).toBe("PARTIAL");
    expect(completeness.coveredRanges).toEqual([exclusiveRange(1000, 2000)]);
  });
});

describe("upstream failures", () => {
  it("reports ABSENT when the first page fails", async () => {
    const { completeness, pages } = await run([() => rawResponse(503, "")]);

    expect(completeness.state).toBe("ABSENT");
    expect(completeness.reason).toBe("UPSTREAM_UNAVAILABLE");
    expect(pages).toHaveLength(0);
  });

  it("keeps retrieved evidence when a middle page fails", async () => {
    const { completeness, pages } = await run([
      () => eventPageResponse([rawEvent(1100, "a")], 2000),
      () => eventPageResponse([rawEvent(2100, "b")], 3500),
      () => rawResponse(503, ""),
    ]);

    // The retrieved pages survive, and coverage stops at the last cursor —
    // NOT at wherever the last event happened to fall.
    expect(pages).toHaveLength(2);
    expect(completeness.state).toBe("PARTIAL");
    expect(completeness.coveredRanges).toEqual([exclusiveRange(1000, 3500)]);
    expect(completeness.eventsRetrieved).toBe(2);
  });

  it("does NOT retry a rate limit, and stays PARTIAL", async () => {
    const responses = [() => eventPageResponse([rawEvent(1100, "a")], 2000), () => rawResponse(429, "")];
    const { completeness, fetch } = await run(responses);

    expect(completeness.reason).toBe("RATE_LIMITED");
    expect(completeness.state).toBe("PARTIAL");
    // Two GraphQL calls: the good page and the single rejected one. Retrying a
    // rate limit would only spend more points.
    expect(fetch.graphqlCalls()).toHaveLength(2);
  });

  it("does NOT retry a 5xx", async () => {
    const { fetch } = await run([() => rawResponse(500, "")]);
    expect(fetch.graphqlCalls()).toHaveLength(1);
  });

  it("does NOT retry a network failure", async () => {
    const { completeness, fetch } = await run([() => networkFailure({} as never, 0) as never]);
    expect(completeness.reason).toBe("UPSTREAM_UNAVAILABLE");
    expect(fetch.graphqlCalls()).toHaveLength(1);
  });

  it("fails closed on GraphQL errors rather than reading them as an empty page", async () => {
    const { completeness } = await run([
      () => jsonResponse(200, { data: null, errors: [{ message: "anything" }] }),
    ]);

    expect(completeness.state).toBe("ABSENT");
    expect(completeness.reason).toBe("UPSTREAM_DATA_INVALID");
  });
});

describe("safety ceilings", () => {
  it("returns PARTIAL and never COMPLETE when the page ceiling is hit", async () => {
    // A cursor that always advances by 1ms inside a 4000ms window: legal,
    // terminating-looking, and far more pages than the ceiling allows.
    let cursor = PLAN.startTimeMs;
    const { client } = createTestGraphqlClient(() => {
      cursor += 1;
      return eventPageResponse([rawEvent(cursor, "a")], cursor);
    });
    const result = await paginateEventStream(
      { plan: PLAN, hostility: "UNSPECIFIED", onPage: () => {} },
      { client, now: () => 0 },
    );

    expect(result.completeness.reason).toBe("SAFETY_LIMIT_REACHED");
    expect(result.completeness.state).toBe("PARTIAL");
    expect(result.provenance.pages).toHaveLength(MAX_PAGES);
  });

  it("returns PARTIAL when the elapsed ceiling is hit, even if pages spanned the range", async () => {
    let clock = 0;
    const { client } = createTestGraphqlClient(() => eventPageResponse([], 2000));
    const result = await paginateEventStream(
      { plan: PLAN, hostility: "UNSPECIFIED", onPage: () => {} },
      {
        client,
        now: () => {
          clock += 20_000;
          return clock;
        },
      },
    );

    expect(result.completeness.reason).toBe("SAFETY_LIMIT_REACHED");
    expect(result.completeness.state).not.toBe("COMPLETE");
  });

  it("can never report COMPLETE alongside a safety limit", async () => {
    // The guardrail is a truncation we chose. Evidence has to say so even when
    // the pages retrieved happen to span the requested range.
    let clock = 0;
    const { client } = createTestGraphqlClient(() => eventPageResponse([], null));
    const result = await paginateEventStream(
      { plan: PLAN, hostility: "UNSPECIFIED", onPage: () => {} },
      {
        client,
        now: () => {
          const value = clock;
          clock += 30_000;
          return value;
        },
      },
    );

    if (result.completeness.reason === "SAFETY_LIMIT_REACHED") {
      expect(result.completeness.state).not.toBe("COMPLETE");
    }
  });
});

describe("no deduplication", () => {
  it("preserves events that are identical in every observable field", async () => {
    const duplicate = rawEvent(1500, "cast", { sourceID: 5, targetID: 42, abilityGameID: 1329 });
    const { pages } = await run([() => eventPageResponse([duplicate, duplicate], null)]);

    // Multiple legitimate combat events can share timestamp, type, source,
    // target and ability. Any dedup key would be a guess that deletes real
    // evidence, so nothing is deduplicated at all.
    expect(pages[0]?.events).toHaveLength(2);
  });
});
