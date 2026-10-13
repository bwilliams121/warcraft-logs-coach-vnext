import { describe, expect, it } from "vitest";

import {
  captureComparisons,
  checkComparisonContext,
  COMPARISON_CAPTURE_LIMITS,
  COMPARISON_EVENTS_QUERY,
  COMPARISON_EXCLUDED_TYPES,
  comparisonSliceFilter,
  comparisonTablesQuery,
  type ComparisonCapturePorts,
  type ComparisonFightRequest,
} from "../../src/wcl/comparison/comparison-capture.js";
import { FIGHT_CONTEXT_QUERY } from "../../src/wcl/fight-context-query.js";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";

/**
 * M11-G2: the bounded comparison capture (tests Z, AA, AB, AC and the actor-set
 * gate). Every port here is a fake: nothing reaches the network.
 */

type Json = Record<string, unknown>;

const FOCUS_GAME_ID = 900_000_001;
const REQUEST: ComparisonFightRequest = {
  comparisonRef: "COHORTTESTAAAAAA#33",
  reportCode: "TESTREPORTAAAAAA",
  fightId: 33,
  focusActorId: 7,
  encounterId: 3455,
  difficulty: 5,
  className: "DeathKnight",
  specName: "Blood",
};

/** A fight context: focus 7 owns 15 and 16; 17 is a pet of pet 15; 25 has no owner; 30 is another player's pet. */
function context(overrides: { spec?: string; subType?: string; kill?: boolean; actors?: Json[] } = {}): Json {
  return {
    reportData: {
      report: {
        revision: 46,
        archiveStatus: { isArchived: false, isAccessible: true, archiveDate: null },
        masterData: {
          actors: overrides.actors ?? [
            {
              id: 7,
              gameID: FOCUS_GAME_ID,
              type: "Player",
              subType: overrides.subType ?? "DeathKnight",
              petOwner: null,
            },
            { id: 8, gameID: 900_000_002, type: "Player", subType: "DeathKnight", petOwner: null },
            { id: 15, gameID: 27893, type: "Pet", subType: "Pet", petOwner: 7 },
            { id: 16, gameID: 26125, type: "Pet", subType: "Pet", petOwner: 7 },
            { id: 17, gameID: 11111, type: "Pet", subType: "Pet", petOwner: 15 },
            { id: 25, gameID: 27893, type: "Pet", subType: "Pet", petOwner: null },
            { id: 30, gameID: 27893, type: "Pet", subType: "Pet", petOwner: 8 },
          ],
        },
        fights: [
          {
            id: 33,
            encounterID: 3455,
            difficulty: 5,
            kill: overrides.kill ?? true,
            startTime: 1000,
            endTime: 5000,
            friendlyPlayers: [7, 8],
            friendlySpecs: [overrides.spec ?? "Blood", "Frost"],
          },
        ],
      },
    },
  };
}

const page = (cursor: number | null): Json => ({
  reportData: {
    report: { events: { data: [{ type: "cast", sourceID: 7, timestamp: 1500 }], nextPageTimestamp: cursor } },
  },
});

function fakePorts(options: { pagesBeforeTerminal?: number; context?: Json } = {}) {
  const calls: { kind: string; payload: unknown }[] = [];
  let served = 0;
  const ports: ComparisonCapturePorts = {
    fightContext: async (code, fight, actor) => {
      calls.push({ kind: "context", payload: [code, fight, actor] });
      return { ok: true, data: options.context ?? context() };
    },
    eventsPage: async (variables) => {
      calls.push({ kind: "events", payload: variables });
      served += 1;
      return {
        ok: true,
        data: page(served > (options.pagesBeforeTerminal ?? 1) ? null : 1000 + served * 100),
      };
    },
    tables: async (query, variables) => {
      calls.push({ kind: "tables", payload: { query, variables } });
      return { ok: true, data: { reportData: { report: { revision: 46 } } } };
    },
  };
  return { ports, calls };
}

describe("A/B: the actor set is the focus plus its WCL petOwner actors, nothing else", () => {
  it("derives [7, 15, 16]: no pet of a pet (17), no ownerless pet (25), no other player's pet (30)", () => {
    const check = checkComparisonContext(context(), REQUEST);
    expect(check).toMatchObject({
      ok: true,
      scope: [7, 15, 16],
      owned: [15, 16],
      focusGameId: FOCUS_GAME_ID,
    });
  });

  it("refuses a context whose identity does not hold, before any event request", async () => {
    expect(checkComparisonContext(context({ spec: "Frost" }), REQUEST)).toEqual({
      ok: false,
      reason: "FOCUS_SPEC_UNRESOLVED",
    });
    expect(checkComparisonContext(context({ subType: "Paladin" }), REQUEST)).toEqual({
      ok: false,
      reason: "FOCUS_CLASS_MISMATCH",
    });
    expect(checkComparisonContext(context({ kill: false }), REQUEST)).toEqual({
      ok: false,
      reason: "NOT_KILL",
    });
    const { ports, calls } = fakePorts({ context: context({ spec: "Unholy" }) });
    const run = await captureComparisons(ports, [REQUEST], "SUBJECTCODEAAAAA", () => []);
    expect(run.fights[0]).toMatchObject({ status: "REFUSED", reason: "FOCUS_SPEC_UNRESOLVED" });
    expect(calls.map((call) => call.kind)).toEqual(["context"]);
  });

  it("refuses a focus gameID the catalog does not hold uniquely (the filter addresses it by gameID)", () => {
    const actors = [
      { id: 7, gameID: FOCUS_GAME_ID, type: "Player", subType: "DeathKnight", petOwner: null },
      { id: 9, gameID: FOCUS_GAME_ID, type: "Player", subType: "Warrior", petOwner: null },
    ];
    expect(checkComparisonContext(context({ actors }), REQUEST)).toEqual({
      ok: false,
      reason: "FOCUS_GAME_ID_NOT_UNIQUE",
    });
  });
});

describe("AB/AC: never the subject, never an unfiltered stream", () => {
  it("AB: refuses the subject's report before making any request", async () => {
    const { ports, calls } = fakePorts();
    await expect(
      captureComparisons(
        ports,
        [{ ...REQUEST, reportCode: "b1PmaKrd6CDfzngc" }],
        "b1PmaKrd6CDfzngc",
        () => [],
      ),
    ).rejects.toThrow(/never re-fetched/);
    expect(calls).toEqual([]);
  });

  it("AC: every events request carries the one filter, built from the focus gameID, over the whole fight", async () => {
    const { ports, calls } = fakePorts({ pagesBeforeTerminal: 2 });
    const run = await captureComparisons(ports, [REQUEST], "SUBJECTCODEAAAAA", () => []);
    const pages = calls.filter((call) => call.kind === "events").map((call) => call.payload as Json);
    expect(pages).toHaveLength(3);
    for (const variables of pages) {
      expect(variables["filterExpression"]).toBe(comparisonSliceFilter(FOCUS_GAME_ID));
      expect(variables["endTime"]).toBe(5000);
    }
    expect(pages.map((variables) => variables["startTime"])).toEqual([1000, 1100, 1200]);
    expect(run.fights[0]).toMatchObject({ status: "CAPTURED", terminal: true });
    expect(COMPARISON_EVENTS_QUERY).toContain("filterExpression: $filterExpression");
    expect(COMPARISON_EVENTS_QUERY).toContain("$filterExpression: String!");
    expect(COMPARISON_EVENTS_QUERY).not.toMatch(/sourceID|targetID|hostilityType/);
  });

  it("AC: the filter names the actor (never empty), excludes the never-requested types, and refuses a bad gameID", () => {
    const filter = comparisonSliceFilter(FOCUS_GAME_ID);
    expect(filter).toContain(`source.id = ${String(FOCUS_GAME_ID)}`);
    expect(filter).toContain(`target.owner.id = ${String(FOCUS_GAME_ID)}`);
    for (const type of COMPARISON_EXCLUDED_TYPES) expect(filter).toContain(`"${type}"`);
    expect(() => comparisonSliceFilter(0)).toThrow();
    expect(() => comparisonSliceFilter(Number.NaN)).toThrow();
  });

  it("AC: a fight that has not reached a terminal page by the page cap stops — no table request, no grant", async () => {
    const { ports, calls } = fakePorts({ pagesBeforeTerminal: 99 });
    const run = await captureComparisons(ports, [REQUEST], "SUBJECTCODEAAAAA", () => []);
    expect(run.fights[0]).toMatchObject({
      status: "STOPPED",
      reason: "PAGE_CAP_REACHED_BEFORE_TERMINAL_PAGE",
    });
    expect(calls.filter((call) => call.kind === "events")).toHaveLength(
      COMPARISON_CAPTURE_LIMITS.maxEventPagesPerFight,
    );
    expect(calls.some((call) => call.kind === "tables")).toBe(false);
  });

  it("the committed provenance records the same filter, gameID redacted", () => {
    const manifest = JSON.parse(committedEvidenceArchiveFiles()["manifest.json"] ?? "null") as {
      artifacts: Json[];
    };
    const templates = new Set(
      manifest.artifacts.flatMap((artifact) => {
        const query = ((artifact["provenance"] as Json)["source"] as Json | null)?.["query"] as
          Json | undefined;
        const filter = query?.["actorFilter"];
        return typeof filter === "object" && filter !== null && "filterExpressionTemplate" in filter
          ? [(filter as Json)["filterExpressionTemplate"]]
          : [];
      }),
    );
    expect([...templates]).toEqual([
      comparisonSliceFilter(FOCUS_GAME_ID).replaceAll(String(FOCUS_GAME_ID), "<FOCUS_GAME_ID>"),
    ]);
  });
});

describe("Z/AA: the request budget, and no rankings at all", () => {
  it("Z: the plan's worst case is checked before the first request; five fights at the cap would exceed 36", async () => {
    expect(COMPARISON_CAPTURE_LIMITS.maxGraphqlRequests).toBe(36);
    expect(3 * (2 + COMPARISON_CAPTURE_LIMITS.maxEventPagesPerFight)).toBeLessThanOrEqual(36);
    const { ports, calls } = fakePorts();
    const five = [1, 2, 3, 4, 5].map((n) => ({ ...REQUEST, reportCode: `TESTREPORT${String(n)}AAAAA` }));
    await expect(captureComparisons(ports, five, "SUBJECTCODEAAAAA", () => [])).rejects.toThrow(
      /exceeds the cap/,
    );
    expect(calls).toEqual([]);
  });

  it("Z: the run stops at the cap rather than exceed it", async () => {
    const { ports, calls } = fakePorts({ pagesBeforeTerminal: 99 });
    const limits = { ...COMPARISON_CAPTURE_LIMITS, maxGraphqlRequests: 5, maxEventPagesPerFight: 3 };
    const run = await captureComparisons(ports, [REQUEST], "SUBJECTCODEAAAAA", () => [], limits);
    expect(calls.length).toBeLessThanOrEqual(5);
    expect(run.requests.length).toBeLessThanOrEqual(5);
  });

  it("Z: even if the plan check were wrong, the run itself refuses the request past the cap", async () => {
    // A limits object whose page cap reads 1 for the plan check and 10 after:
    // the plan passes (1 x (2 + 1) = 3 <= 4), the run tries for more.
    let reads = 0;
    const limits = {
      maxGraphqlRequests: 4,
      eventPageLimit: 10_000,
      get maxEventPagesPerFight() {
        reads += 1;
        return reads === 1 ? 1 : 10;
      },
    };
    const { ports, calls } = fakePorts({ pagesBeforeTerminal: 99 });
    const run = await captureComparisons(ports, [REQUEST], "SUBJECTCODEAAAAA", () => [], limits);
    expect(calls).toHaveLength(4);
    expect(run.stoppedReason).toBe("REQUEST_BUDGET_EXHAUSTED");
  });

  it("AA: the capture has exactly three ports and no document requests rankings, cohort or another fight", () => {
    const { ports } = fakePorts();
    expect(Object.keys(ports).sort()).toEqual(["eventsPage", "fightContext", "tables"]);
    const tables = comparisonTablesQuery(7, [7, 15], [{ label: "w", fromMs: 1100, toMs: 1200 }]);
    for (const document of [COMPARISON_EVENTS_QUERY, tables, FIGHT_CONTEXT_QUERY]) {
      expect(document).not.toMatch(/characterRankings|worldData|rankings\(|playerDetails/);
    }
    // Every per-actor table uses the capture's own interval.
    expect(tables).toContain(
      "casts_7: table(dataType: Casts, fightIDs: $fightIDs, startTime: $startTime, endTime: $endTime, sourceID: 7)",
    );
    expect(tables).toContain(
      "window0_15: table(dataType: DamageDone, fightIDs: $fightIDs, startTime: 1100, endTime: 1200, sourceID: 15)",
    );
  });
});
