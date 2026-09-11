import { describe, expect, it } from "vitest";

import { ingestFight } from "../../src/wcl/ingest-fight.js";
import { NORMALIZATION_REVISION } from "../../src/engine/normalization/combat-fight.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import {
  contextResponse,
  createTestGraphqlClient,
  eventPageResponse,
  ingestionResponder,
  rawEvent,
} from "../support/wcl-harness.js";

/**
 * Two invariants, both non-negotiable.
 *
 * 1. No credential, token or Authorization header may reach normalized data.
 *    The transport holds them; nothing below it ever sees one, and provenance
 *    has no field that could carry one.
 * 2. Every observation must be traceable to the exact response position that
 *    produced it, so the analyzer can eventually answer "why did it tell me
 *    this?" without retaining the whole raw payload.
 */

const REQUEST = {
  reportCode: "aBcDeFgH12345678",
  fightId: 6,
  sourceId: 5,
  scope: "PLAYER_CONTEXT" as const,
  includeResources: true,
  limit: 100,
};

/** Distinctive values that would be unmistakable if they ever leaked. */
const LEAK_SENTINELS = [
  "fake-client-id-not-real",
  "fake-client-secret-not-real",
  "fake-access-token-not-real",
];

async function ingestOnce(): Promise<CombatFight | null> {
  const { client } = createTestGraphqlClient(
    ingestionResponder({
      context: () =>
        contextResponse({
          actors: [{ id: 5, gameID: 111, name: "Rogue", type: "Player", subType: "Rogue" }],
          abilities: [{ gameID: 1329, name: "Mutilate", type: "1" }],
          phases: [{ encounterID: 2900, phases: [{ id: 1, name: "Phase One", isIntermission: false }] }],
          fight: { phaseTransitions: [{ id: 1, startTime: 1000 }] },
        }),
      pages: [
        () => eventPageResponse([rawEvent(1100, "cast"), rawEvent(1200, "damage")], 2000),
        () => eventPageResponse([rawEvent(2100, "heal")], null),
      ],
    }),
  );

  const result = await ingestFight(REQUEST, { client, now: () => 1_700_000_000_000 });
  return result.ok ? result.fight : null;
}

describe("no credential reaches normalized data", () => {
  it("contains no sentinel credential anywhere in the serialized fight", async () => {
    const fight = await ingestOnce();
    expect(fight).not.toBeNull();

    const serialized = JSON.stringify(fight, (_key, value: unknown) =>
      value instanceof Map ? Object.fromEntries(value) : value,
    ).toLowerCase();

    for (const sentinel of LEAK_SENTINELS) {
      expect(serialized).not.toContain(sentinel.toLowerCase());
    }
  });

  it("contains no credential-shaped key or header", async () => {
    const fight = await ingestOnce();
    const serialized = JSON.stringify(fight, (_key, value: unknown) =>
      value instanceof Map ? Object.fromEntries(value) : value,
    ).toLowerCase();

    for (const pattern of [
      "authorization",
      "bearer",
      "client_secret",
      "clientsecret",
      "client_id",
      "clientid",
      "access_token",
      "accesstoken",
    ]) {
      expect(serialized, `serialized fight contains ${pattern}`).not.toContain(pattern);
    }
  });

  it("has no provenance field that could carry one", async () => {
    const fight = await ingestOnce();
    expect(fight).not.toBeNull();
    if (fight === null) return;

    expect(Object.keys(fight.provenance).sort()).toEqual([
      "fightId",
      "gameVersion",
      "hostilityStreams",
      "logVersion",
      "malformedEnvelopeCount",
      "malformedEventTypes",
      "normalizationRevision",
      "plan",
      "reportCode",
      "reportRevision",
      "reportStartTimeUnixMs",
      "retrievedAtUnixMs",
      "source",
      "streams",
      "unsupportedEventTypes",
    ]);
  });
});

describe("every observation is traceable", () => {
  it("gives each event a complete evidence locator", async () => {
    const fight = await ingestOnce();
    expect(fight).not.toBeNull();
    if (fight === null) return;

    for (const event of fight.events) {
      expect(event.locator.streamId).toBe("all");
      expect(Number.isInteger(event.locator.pageOrdinal)).toBe(true);
      expect(Number.isInteger(event.locator.indexInPage)).toBe(true);
      expect(Number.isInteger(event.locator.ingestionOrdinal)).toBe(true);
      // Non-optional on the locator, because it could only be constructed for
      // an observation whose envelope was proven.
      expect(typeof event.locator.rawType).toBe("string");
      expect(typeof event.locator.reportTimeMs).toBe("number");
    }
  });

  it("records enough to re-issue the originating request", async () => {
    const fight = await ingestOnce();
    if (fight === null) return;

    expect(fight.provenance.reportCode).toBe("aBcDeFgH12345678");
    expect(fight.provenance.fightId).toBe(6);
    expect(fight.provenance.reportRevision).toBe(3);
    expect(fight.provenance.plan).toMatchObject({
      dataType: "All",
      includeResources: true,
      limit: 100,
      requestedStartTimeMs: 1000,
      requestedEndTimeMs: 5000,
    });
    expect(fight.provenance.source).toBe("WARCRAFT_LOGS_V2_CLIENT");
  });

  it("records per-page retrieval facts without event contents", async () => {
    const fight = await ingestOnce();
    if (fight === null) return;

    const stream = fight.provenance.streams[0];
    expect(stream?.streamId).toBe("all");
    expect(stream?.pages).toEqual([
      { pageOrdinal: 0, requestedStartTimeMs: 1000, retrieved: true, nextPageTimestamp: 2000, eventCount: 2 },
      { pageOrdinal: 1, requestedStartTimeMs: 2000, retrieved: true, nextPageTimestamp: null, eventCount: 1 },
    ]);
  });

  it("stamps the normalization revision for historical reproducibility", async () => {
    const fight = await ingestOnce();
    expect(fight?.provenance.normalizationRevision).toBe(NORMALIZATION_REVISION);
  });

  it("uses an injected clock so provenance is deterministic in tests", async () => {
    const fight = await ingestOnce();
    expect(fight?.provenance.retrievedAtUnixMs).toBe(1_700_000_000_000);
  });

  it("keeps the report's wall-clock origin once, not on every event", async () => {
    const fight = await ingestOnce();
    if (fight === null) return;

    expect(fight.provenance.reportStartTimeUnixMs).toBe(1_700_000_000_000);
    for (const event of fight.events) {
      // Report-relative stays the primary representation. Converting to
      // wall clock and keeping only that would sever the tie to fight position.
      expect(event).not.toHaveProperty("unixTimeMs");
      expect(event.reportTimeMs).toBeLessThan(10_000);
    }
  });
});

describe("typed evidence rides alongside the event stream", () => {
  it("records phases from the typed schema rather than parsed events", async () => {
    const fight = await ingestOnce();
    if (fight === null) return;

    expect(fight.phases).toEqual([
      { phaseId: 1, name: "Phase One", isIntermission: false, startTimeMs: 1000, fightTimeMs: 0 },
    ]);
    const phaseEvidence = fight.completeness.categories.ENCOUNTER_PHASES;
    expect(phaseEvidence.capability).toBe("OBSERVABLE");
  });

  it("records the talent import code unparsed", async () => {
    const fight = await ingestOnce();
    expect(fight?.talentImportCode).toBe("ABCDEF");
  });
});
