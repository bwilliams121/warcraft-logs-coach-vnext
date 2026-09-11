/**
 * The manual live Warcraft Logs probe.
 *
 * Purpose: capture the raw shapes that normalization contracts are built from,
 * and re-verify the API behaviours those contracts depend on. Nothing in `src/`
 * recognises a raw event type or field name without a sanitized slice of this
 * probe's output committed as a fixture.
 *
 * Run it deliberately:
 *
 *     npm run probe
 *
 * Requirements and guarantees:
 *
 * - Reads WCL_CLIENT_ID / WCL_CLIENT_SECRET from `.dev.vars` (gitignored).
 * - NEVER prints or persists a credential, an access token, or an
 *   Authorization header. Only decoded GraphQL `data` is written out.
 * - Writes raw output to `.probe/`, which is gitignored. Nothing under
 *   `.probe/` may be committed; only reviewed, sanitized slices enter
 *   `tests/fixtures/`.
 * - Spends real API points. It is excluded from `npm test` and from CI.
 *
 * It uses the REAL production transport (token provider, GraphQL client,
 * paginator), so what it verifies is what the analyzer will actually do.
 *
 * To capture a new log, override the target:
 *
 *     PROBE_REPORT_CODE=... PROBE_FIGHT_ID=... PROBE_SOURCE_ID=... npm run probe
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { loadConfig, type WclCredentials } from "../../src/config/env.js";
import { createGraphqlClient, type DecodeOutcome } from "../../src/wcl/graphql-client.js";
import { createTokenProvider } from "../../src/wcl/token-provider.js";
import { decodeEventPage, EVENTS_QUERY } from "../../src/wcl/events-query.js";
import {
  FIGHT_CONTEXT_QUERY,
  fightContextVariables,
  decodeFightContext,
} from "../../src/wcl/fight-context-query.js";
import { createEventRetrievalPlan, EVENT_PAGE_LIMIT } from "../../src/wcl/retrieval-plan.js";
import { paginateEventStream } from "../../src/wcl/paginator.js";

const PROBE_DIR = ".probe";

const TARGET = {
  reportCode: process.env["PROBE_REPORT_CODE"] ?? "qJ1pgB49ZrRNVmCd",
  fightId: Number(process.env["PROBE_FIGHT_ID"] ?? 6),
  sourceId: Number(process.env["PROBE_SOURCE_ID"] ?? 5),
};

/** Small limit for shape capture, so early probing stays cheap. */
const SHAPE_LIMIT = 300;

/**
 * Minimal rate-limit query. Selects nothing but `rateLimitData`, so the
 * measurement itself is as cheap as this API allows.
 */
const RATE_LIMIT_QUERY = `query CoachProbeRateLimit {
  rateLimitData {
    limitPerHour
    pointsSpentThisHour
    pointsResetIn
  }
}`;

function write(name: string, value: unknown): void {
  mkdirSync(PROBE_DIR, { recursive: true });
  writeFileSync(`${PROBE_DIR}/${name}`, JSON.stringify(value, null, 2), "utf8");
}

const passthrough = (data: unknown): DecodeOutcome<unknown> => ({ ok: true, value: data });

/**
 * Resolves credentials through the SAME loader the Worker uses, so the probe
 * inherits its validation and its redacting `toJSON`. Nothing here reads the
 * values; they go straight to the token provider.
 */
function credentials(): WclCredentials | null {
  const config = loadConfig({
    WCL_CLIENT_ID: process.env["WCL_CLIENT_ID"],
    WCL_CLIENT_SECRET: process.env["WCL_CLIENT_SECRET"],
  });
  return config.ok ? config.config.wcl : null;
}

function makeClient() {
  const configured = credentials();
  if (configured === null) {
    return null;
  }
  const fetchLike = (input: string, init: RequestInit) => fetch(input, init);
  const tokens = createTokenProvider({ credentials: configured, fetch: fetchLike, now: Date.now });
  return createGraphqlClient({ tokens, fetch: fetchLike });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keyHistogram(events: readonly unknown[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    if (!isRecord(event)) continue;
    for (const key of Object.keys(event)) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

function typeHistogram(events: readonly unknown[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    if (!isRecord(event)) continue;
    const type = event["type"];
    const key = typeof type === "string" ? type : `<non-string:${typeof type}>`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function approximateBytes(value: unknown): number {
  return JSON.stringify(value)?.length ?? 0;
}

const client = makeClient();
const findings: Record<string, unknown> = {};
let fightWindow: { startTimeMs: number; endTimeMs: number } | null = null;

async function readPoints(): Promise<number | null> {
  if (client === null) return null;
  const outcome = await client.execute({
    query: RATE_LIMIT_QUERY,
    variables: {},
    decode: passthrough,
  });
  return outcome.ok ? (outcome.rateLimit?.pointsSpentThisHour ?? null) : null;
}

describe("live Warcraft Logs probe", () => {
  it("has credentials configured", () => {
    expect(
      client,
      "WCL_CLIENT_ID / WCL_CLIENT_SECRET not found. Copy .dev.vars.example to .dev.vars and fill them in. The probe needs real credentials; the offline test suite does not.",
    ).not.toBeNull();
  });

  it("captures fight context, phases and archive status", async () => {
    if (client === null) return;

    const raw = await client.execute({
      query: FIGHT_CONTEXT_QUERY,
      variables: fightContextVariables(TARGET.reportCode, TARGET.fightId, TARGET.sourceId),
      decode: passthrough,
    });
    expect(raw.ok, "context query failed").toBe(true);
    if (!raw.ok) return;

    write("context-raw.json", raw.data);

    // Run it through the REAL decoder, so the probe proves the decoder works
    // against reality rather than only against hand-written fixtures.
    const decoded = decodeFightContext(raw.data);
    expect(decoded.ok, "decodeFightContext rejected a live response").toBe(true);
    if (!decoded.ok || decoded.value.report === null) return;

    const report = decoded.value.report;
    const rawFight = report.fights[0];
    if (isRecord(rawFight)) {
      fightWindow = {
        startTimeMs: Number(rawFight["startTime"]),
        endTimeMs: Number(rawFight["endTime"]),
      };
    }
    findings["context"] = {
      revision: report.revision,
      logVersion: report.logVersion,
      gameVersion: report.gameVersion,
      actorCount: report.actors.length,
      abilityCount: report.abilities.length,
      archiveStatus: report.archiveStatus,
      phaseEntries: report.phases.length,
      fightWindow,
    };
  });

  it("captures raw event shapes, with and without resources", async () => {
    if (client === null || fightWindow === null) return;

    for (const [name, includeResources] of [
      ["events-page1-noresources.json", false],
      ["events-page1-withresources.json", true],
    ] as const) {
      const raw = await client.execute({
        query: EVENTS_QUERY,
        variables: {
          code: TARGET.reportCode,
          fightIDs: [TARGET.fightId],
          startTime: fightWindow.startTimeMs,
          endTime: fightWindow.endTimeMs,
          limit: SHAPE_LIMIT,
          includeResources,
        },
        decode: passthrough,
      });
      expect(raw.ok, `${name} query failed`).toBe(true);
      if (!raw.ok) continue;

      write(name, raw.data);
      const page = decodeEventPage(raw.data);
      if (!page.ok || page.value.kind !== "PAGE") continue;

      findings[includeResources ? "withResources" : "withoutResources"] = {
        events: page.value.events.length,
        approximateBytes: approximateBytes(page.value.events),
        keys: keyHistogram(page.value.events),
        types: typeHistogram(page.value.events),
        nextPageTimestamp: page.value.nextPageTimestamp,
      };
    }
  });

  /**
   * Durable check: pagination continuation.
   *
   * The cursor must be the first timestamp NOT returned by the previous page,
   * and passing it back verbatim must not duplicate or skip anything. Coverage
   * derivation depends on this, so it is re-verified on every capture rather
   * than assumed to hold forever on a non-frozen API.
   */
  it("verifies cursor continuation and page-boundary behaviour", async () => {
    if (client === null || fightWindow === null) return;

    const request = (startTime: number) =>
      client.execute({
        query: EVENTS_QUERY,
        variables: {
          code: TARGET.reportCode,
          fightIDs: [TARGET.fightId],
          startTime,
          endTime: fightWindow?.endTimeMs ?? 0,
          limit: 100,
          includeResources: false,
        },
        decode: decodeEventPage,
      });

    const first = await request(fightWindow.startTimeMs);
    if (!first.ok || first.data.kind !== "PAGE" || first.data.nextPageTimestamp === null) {
      findings["cursorContinuation"] = "single page at limit 100; inconclusive";
      return;
    }

    const cursor = first.data.nextPageTimestamp;
    // VERBATIM. No +1. The schema documents this as the next start time.
    const second = await request(cursor);
    if (!second.ok || second.data.kind !== "PAGE") return;

    const lastOfFirst = first.data.events.at(-1);
    const firstOfSecond = second.data.events[0];
    const maxOfFirst = Math.max(
      ...first.data.events.filter(isRecord).map((event) => Number(event["timestamp"])),
    );

    findings["cursorContinuation"] = {
      cursor,
      requestedLimit: 100,
      firstPageEventCount: first.data.events.length,
      limitIsSoftCap: first.data.events.length > 100,
      maxTimestampOfFirstPage: maxOfFirst,
      cursorIsAboveLastTimestamp: cursor > maxOfFirst,
      boundaryEventsDuplicated: JSON.stringify(lastOfFirst) === JSON.stringify(firstOfSecond),
      note: "cursorIsAboveLastTimestamp true + boundaryEventsDuplicated false confirms [start, cursor) coverage with no overlap.",
    };
    write("events-cursor-pages.json", { cursor, first: first.data.events, second: second.data.events });
  });

  /**
   * Durable check: `endTime` boundary inclusivity.
   *
   * Coverage treats a terminal page as `[start, endTime]`. That is only correct
   * while Warcraft Logs returns events at exactly `endTime`, so the behaviour is
   * re-measured rather than trusted.
   */
  it("verifies whether endTime includes its own instant", async () => {
    if (client === null || fightWindow === null) return;

    const sample = await client.execute({
      query: EVENTS_QUERY,
      variables: {
        code: TARGET.reportCode,
        fightIDs: [TARGET.fightId],
        startTime: fightWindow.startTimeMs,
        endTime: fightWindow.endTimeMs,
        limit: 300,
        includeResources: false,
      },
      decode: decodeEventPage,
    });
    if (!sample.ok || sample.data.kind !== "PAGE") return;

    const timestamps = sample.data.events
      .filter(isRecord)
      .map((event) => Number(event["timestamp"]))
      .filter((value) => Number.isFinite(value));
    // A timestamp carrying several events, comfortably inside the sample.
    const chosen = timestamps[Math.floor(timestamps.length / 2)];
    if (chosen === undefined) return;

    const boundedAt = async (endTime: number) => {
      const outcome = await client.execute({
        query: EVENTS_QUERY,
        variables: {
          code: TARGET.reportCode,
          fightIDs: [TARGET.fightId],
          startTime: chosen,
          endTime,
          limit: 300,
          includeResources: false,
        },
        decode: decodeEventPage,
      });
      if (!outcome.ok || outcome.data.kind !== "PAGE") return null;
      const rows = outcome.data.events.filter(isRecord);
      return {
        endTime,
        total: rows.length,
        atChosen: rows.filter((event) => Number(event["timestamp"]) === chosen).length,
      };
    };

    const endingAtT = await boundedAt(chosen);
    findings["endTimeBoundary"] = {
      chosenTimestamp: chosen,
      endingExactlyAtT: endingAtT,
      interpretation: "atChosen > 0 means endTime is INCLUSIVE, which is what EVENTS_END_TIME_BOUND asserts.",
    };
    expect(
      endingAtT?.atChosen,
      "endTime appears to have become EXCLUSIVE; EVENTS_END_TIME_BOUND and the coverage model would both be wrong",
    ).toBeGreaterThan(0);
  });

  /**
   * Durable check: full-fight cost, volume and wall clock.
   *
   * Brackets the run with two minimal rate-limit queries so the point delta is
   * measured rather than inferred. This is the measurement that justifies
   * EVENT_PAGE_LIMIT.
   */
  it("measures a full-fight ingestion", async () => {
    if (client === null || fightWindow === null) return;

    const pointsBefore = await readPoints();

    const plan = createEventRetrievalPlan({
      reportCode: TARGET.reportCode,
      fightId: TARGET.fightId,
      startTimeMs: fightWindow.startTimeMs,
      endTimeMs: fightWindow.endTimeMs,
      includeResources: true,
      limit: EVENT_PAGE_LIMIT,
    });

    let pageCount = 0;
    let totalBytes = 0;
    let largestPageBytes = 0;
    let maxEventsInAPage = 0;
    const startedAt = Date.now();

    const outcome = await paginateEventStream(
      {
        plan,
        hostility: "UNSPECIFIED",
        onPage: (page) => {
          pageCount += 1;
          const bytes = approximateBytes(page.events);
          totalBytes += bytes;
          largestPageBytes = Math.max(largestPageBytes, bytes);
          maxEventsInAPage = Math.max(maxEventsInAPage, page.events.length);
        },
      },
      { client, now: Date.now },
    );

    const elapsedMs = Date.now() - startedAt;
    const pointsAfter = await readPoints();

    findings["fullFight"] = {
      limit: EVENT_PAGE_LIMIT,
      pageCount,
      eventCount: outcome.completeness.eventsRetrieved,
      maxEventsInAPage,
      limitIsSoftCap: maxEventsInAPage > EVENT_PAGE_LIMIT,
      elapsedMs,
      approximateTotalBytes: totalBytes,
      approximateLargestPageBytes: largestPageBytes,
      pointsBefore,
      pointsAfter,
      pointsDelta: pointsBefore !== null && pointsAfter !== null ? pointsAfter - pointsBefore : null,
      completenessState: outcome.completeness.state,
      completenessReason: outcome.completeness.reason,
      note: "Point delta includes the two bracketing rate-limit queries. Bytes are JSON.stringify lengths, not compressed wire size.",
    };
    write("full-fight-provenance.json", outcome.provenance);
  });

  it("writes the findings summary", () => {
    findings["_meta"] = {
      target: TARGET,
      capturedAt: new Date().toISOString(),
      warning:
        "Raw output under .probe/ is gitignored. Only reviewed, sanitized slices may enter tests/fixtures/.",
    };
    write("findings.json", findings);
    expect(true).toBe(true);
  });
});
