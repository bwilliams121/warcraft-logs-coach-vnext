import { describe, expect, it } from "vitest";

import { exclusiveRange } from "../../src/engine/evidence/coverage.js";
import { ingestFight } from "../../src/wcl/ingest-fight.js";
import {
  contextResponse,
  createTestGraphqlClient,
  eventPageResponse,
  ingestionResponder,
  rawEvent,
  revisionResponse,
} from "../support/wcl-harness.js";

/**
 * Historical failure this protects against:
 *
 * Retrieval order and event identity were treated as negotiable — events were
 * re-sorted for convenience, and "duplicates" were removed using a guessed key
 * of timestamp + type + source + target + ability. Multiple legitimate combat
 * events routinely share all five, so that key deleted real evidence and the
 * resulting gaps were indistinguishable from the player doing nothing.
 */

const REQUEST = {
  reportCode: "aBcDeFgH12345678",
  fightId: 6,
  sourceId: 5,
  scope: "PLAYER_CONTEXT" as const,
  includeResources: false,
  limit: 100,
};

async function ingest(pages: readonly (() => Response)[]) {
  const { client, fetch } = createTestGraphqlClient(ingestionResponder({ pages }));
  const result = await ingestFight(REQUEST, { client, now: () => 1_700_000_000_000 });
  return { result, fetch };
}

describe("retrieval order", () => {
  it("preserves the order events arrived in", async () => {
    const { result } = await ingest([
      () =>
        eventPageResponse([rawEvent(1100, "first"), rawEvent(1200, "second"), rawEvent(1300, "third")], null),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fight.events.map((event) => event.rawType)).toEqual(["first", "second", "third"]);
  });

  it("preserves relative order among events sharing a timestamp", async () => {
    const { result } = await ingest([
      () =>
        eventPageResponse([rawEvent(2000, "alpha"), rawEvent(2000, "beta"), rawEvent(2000, "gamma")], null),
    ]);

    if (!result.ok) return;
    // Re-sorting by timestamp would scramble these, and the true sequence of
    // simultaneous events is not recoverable afterwards.
    expect(result.fight.events.map((event) => event.rawType)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("does not reorder across a page boundary", async () => {
    const { result } = await ingest([
      () => eventPageResponse([rawEvent(3000, "page-one-last")], 3000.5),
      () => eventPageResponse([rawEvent(2500, "page-two-earlier")], null),
    ]);

    if (!result.ok) return;
    // Even when a later page carries an EARLIER timestamp, retrieval order is
    // what is recorded. The ordinals preserve what actually happened, and any
    // reordering is a later, explicit decision with evidence behind it.
    expect(result.fight.events.map((event) => event.rawType)).toEqual(["page-one-last", "page-two-earlier"]);
    expect(result.fight.events.map((event) => event.ingestionOrdinal)).toEqual([0, 1]);
  });

  it("assigns strictly increasing ingestion ordinals across pages", async () => {
    const { result } = await ingest([
      () => eventPageResponse([rawEvent(1100, "a"), rawEvent(1200, "b")], 2000),
      () => eventPageResponse([rawEvent(2100, "c")], null),
    ]);

    if (!result.ok) return;
    const ordinals = result.fight.events.map((event) => event.ingestionOrdinal);
    expect(ordinals).toEqual([0, 1, 2]);
    expect(result.fight.events.map((event) => event.locator.pageOrdinal)).toEqual([0, 0, 1]);
    expect(result.fight.events.map((event) => event.locator.indexInPage)).toEqual([0, 1, 0]);
  });
});

describe("no deduplication", () => {
  it("keeps events identical in timestamp, type, source, target and ability", async () => {
    const duplicate = rawEvent(1500, "cast", {
      sourceID: 5,
      targetID: 42,
      abilityGameID: 1329,
    });
    const { result } = await ingest([() => eventPageResponse([duplicate, duplicate], null)]);

    if (!result.ok) return;
    // A Rogue can legitimately land two identical events in the same
    // millisecond. Deleting one would be inventing an absence.
    expect(result.fight.events).toHaveLength(2);
    expect(result.fight.events[0]?.ingestionOrdinal).toBe(0);
    expect(result.fight.events[1]?.ingestionOrdinal).toBe(1);
  });

  it("keeps a boundary event that appears on both sides of a page split", async () => {
    const boundary = rawEvent(2000, "cast", { sourceID: 5 });
    const { result } = await ingest([
      () => eventPageResponse([rawEvent(1900, "before"), boundary], 2000.5),
      () => eventPageResponse([boundary, rawEvent(2100, "after")], null),
    ]);

    if (!result.ok) return;
    // Whether Warcraft Logs actually overlaps pages is probe question P3. Until
    // that is answered with real evidence, everything is preserved: no dedup
    // key may be invented, and a suppression rule needs a decision, not a guess.
    expect(result.fight.events).toHaveLength(4);
    expect(result.fight.events.filter((event) => event.reportTimeMs === 2000)).toHaveLength(2);
  });
});

describe("failed pages never become empty periods", () => {
  it("keeps retrieved events and reports PARTIAL coverage", async () => {
    const { client } = createTestGraphqlClient(
      ingestionResponder({
        pages: [
          () => eventPageResponse([rawEvent(1100, "a")], 2000),
          () => eventPageResponse([rawEvent(2100, "b")], 3500),
          () => new Response("", { status: 503 }),
        ],
      }),
    );
    const result = await ingestFight(REQUEST, { client, now: () => 1_700_000_000_000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fight.events).toHaveLength(2);

    const stream = result.fight.completeness.streams.find((entry) => entry.streamId === "all");
    expect(stream?.state).toBe("PARTIAL");
    // The missing period is recorded as UNCOVERED, not as a quiet stretch in
    // which the player did nothing.
    expect(stream?.coveredRanges).toEqual([exclusiveRange(1000, 3500)]);
  });

  it("refuses to produce a fight when no page was retrieved at all", async () => {
    const { client } = createTestGraphqlClient(
      ingestionResponder({ pages: [() => new Response("", { status: 503 })] }),
    );
    const result = await ingestFight(REQUEST, { client, now: () => 1_700_000_000_000 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe("EVENT_RETRIEVAL_ABSENT");
  });
});

describe("report revision changes", () => {
  it("refuses a dataset that may straddle two exports", async () => {
    const { client } = createTestGraphqlClient(
      ingestionResponder({
        context: () => contextResponse({ revision: 3 }),
        pages: [() => eventPageResponse([rawEvent(1100, "a")], null)],
        revision: () => revisionResponse(4),
      }),
    );
    const result = await ingestFight(REQUEST, { client, now: () => 1_700_000_000_000 });

    // A mixed-revision dataset is NOT representable as PARTIAL: partial means
    // less evidence than requested, not evidence from two different worlds.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe("REPORT_REVISION_CHANGED");
  });
});

describe("archived reports", () => {
  it("stops before spending a single event request", async () => {
    const { client, fetch } = createTestGraphqlClient(
      ingestionResponder({
        context: () =>
          contextResponse({
            archiveStatus: { isArchived: true, isAccessible: false, archiveDate: 123 },
          }),
        pages: [() => eventPageResponse([], null)],
      }),
    );
    const result = await ingestFight(REQUEST, { client, now: () => 1_700_000_000_000 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe("REPORT_ARCHIVED_INACCESSIBLE");
    // Exactly one GraphQL call: the context query. An archived report's events
    // are unreachable with client credentials, so paginating would spend points
    // producing empty pages that must never read as an empty fight.
    expect(fetch.graphqlCalls()).toHaveLength(1);
  });
});

describe("fight finality", () => {
  it("records an in-progress fight without degrading retrieval coverage", async () => {
    const { client } = createTestGraphqlClient(
      ingestionResponder({
        context: () => contextResponse({ fight: { inProgress: true } }),
        pages: [() => eventPageResponse([rawEvent(1100, "a")], null)],
      }),
    );
    const result = await ingestFight(REQUEST, { client, now: () => 1_700_000_000_000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Two independent facts. Coverage answers "did we get what we asked for?";
    // finality answers "was the fight over?". Folding the second into the first
    // would claim a retrieval deficiency that did not happen.
    expect(result.fight.fight.finality).toBe("IN_PROGRESS");
    const stream = result.fight.completeness.streams.find((entry) => entry.streamId === "all");
    expect(stream?.state).toBe("COMPLETE");
  });
});
