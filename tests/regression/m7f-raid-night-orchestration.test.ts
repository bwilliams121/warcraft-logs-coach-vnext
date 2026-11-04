/**
 * Raid-night orchestration.
 *
 * WHAT THESE TESTS DEFEND
 *
 * The three cost properties, which are the reason this is viable at all:
 *
 *   ONE roster query per request
 *   ONE ingestion per fight that NEEDS one, reused across every analyzed player
 *   ZERO ingestion for a fight no selected player needs analyzed
 *
 * All three are invisible to a correctness-only test. An orchestration that
 * re-queried the roster per fight, re-ingested per player, or paginated a fight
 * full of unsupported specs would produce byte-identical output while spending
 * many times the quota — so they are proven by COUNTING port calls.
 *
 * And the fail-closed properties, which are the reason it is trustworthy: a moved
 * report revision must abort the whole night rather than yielding a partial one,
 * and a fight whose evidence never arrived must not become zero counts or
 * manufactured UNKNOWN decisions.
 *
 * Only the three Warcraft Logs ports are faked. Spec resolution, the analyzer
 * registry, focused views, `CombatState`, the M5 facade, the M7-D gate and the
 * aggregator all run for real.
 */

import { describe, expect, it } from "vitest";

import {
  assassinationSnapshot,
  fakePorts,
  M5D2_ACTOR,
  REPORT_CODE,
  REVISION,
  runNight,
} from "../support/raid-night-orchestration-fixture.js";
import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import type { RaidNightAnalysis } from "../../src/aggregation/raid-night.js";
import type { RaidNightRunResult } from "../../src/services/raid-night-runner.js";

/** A second supported Rogue, so "many players on one fight" is a real case. */
const ROGUE_B = 23;
/**
 * The canonical UNSUPPORTED participant: Mage/Fire, A7R6 fight 7 actor 17
 * per the committed fight-context artifact. (Until M10-D this file used
 * source 7 with spec "Protection" and the fixture's default class, which
 * spelled the impossible identity Rogue/Protection; Protection Paladin is
 * supported now and a real unsupported class/spec pair takes its place.)
 */
const FIRE_MAGE = 17;
const ZERO_ID = 0;

/** The fixture's class for each player: Mage for the Fire participant, Rogue otherwise. */
const classNameFor = (sourceId: number): string => (sourceId === FIRE_MAGE ? "Mage" : "Rogue");

function aggregateOf(run: RaidNightRunResult): RaidNightAnalysis {
  if (!run.ok) throw new Error(`expected success, got ${run.error.code}: ${run.error.message}`);
  return run.aggregate;
}

function errorOf(run: RaidNightRunResult): string {
  if (run.ok) throw new Error("expected the request to fail");
  return run.error.code;
}

describe("one roster query, whatever the request asks for", () => {
  // Twelve real M5 analyses (four fights x three players over the D2 corpus)
  // in one request. Under a loaded CI runner that exceeds the default 5 s;
  // the work is the point of the test, so the timeout is raised for this
  // test only.
  const FOUR_FIGHT_TIMEOUT_MS = 20_000;

  it(
    "discovers the roster exactly once for four fights and many players",
    async () => {
      const snapshot = assassinationSnapshot({
        fightIds: [1, 2, 3, 4],
        sourceIds: [ZERO_ID, M5D2_ACTOR, ROGUE_B],
      });
      const ports = fakePorts({ snapshot });

      const run = await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2, 3, 4] }, ports);
      expect(aggregateOf(run).coverage.cellsTotal).toBe(12);

      // Not one per fight, and not one per player.
      expect(ports.rosterCalls()).toBe(1);
      // And exactly one final confirmation, not one per fight.
      expect(ports.revisionCalls()).toBe(1);
    },
    FOUR_FIGHT_TIMEOUT_MS,
  );
});

describe("one ingestion per needed fight, never one per player", () => {
  it("ingests twice for two fights with three supported players each", async () => {
    const snapshot = assassinationSnapshot({
      fightIds: [1, 2],
      sourceIds: [ZERO_ID, M5D2_ACTOR, ROGUE_B],
    });
    const ports = fakePorts({ snapshot });

    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2] }, ports);
    const aggregate = aggregateOf(run);

    // THE COUNT. Six analyzed cells from two retrievals, not six.
    expect(ports.ingestedFightIds()).toEqual([1, 2]);
    expect(aggregate.coverage.cellsAnalyzed).toBe(6);
    expect(aggregate.coverage.cellsTotal).toBe(6);
  });

  it("pins every ingestion to the roster's own revision", async () => {
    const snapshot = assassinationSnapshot({ fightIds: [1, 2], sourceIds: [M5D2_ACTOR] });
    const ports = fakePorts({ snapshot });

    await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2] }, ports);
    // R0 travels to every fight, so a report that moved fails before pagination.
    expect(ports.ingestedExpectations()).toEqual([REVISION, REVISION]);
  });

  it("processes fights in ascending order", async () => {
    const snapshot = assassinationSnapshot({ fightIds: [2, 9, 4], sourceIds: [M5D2_ACTOR] });
    const ports = fakePorts({ snapshot });

    await runNight({ reportCode: REPORT_CODE, fightIds: [9, 2, 4] }, ports);
    expect(ports.ingestedFightIds()).toEqual([2, 4, 9]);
  });
});

describe("zero ingestion when no selected player needs it", () => {
  it("retrieves an all-unsupported fight once, for consumable status (PREP-3)", async () => {
    // Fire Mage has no registered analyzer, but a present player always
    // needs the fight: every report carries their consumable status (owner
    // decision PREP-3). Until PREP-3 this pull was skipped.
    const snapshot = assassinationSnapshot({
      fightIds: [1],
      sourceIds: [FIRE_MAGE],
      classNameFor,
      specNameFor: () => "Fire",
    });
    const ports = fakePorts({ snapshot });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports));

    expect(ports.ingestedFightIds()).toEqual([1]);
    expect(aggregate.fights[0]?.processingOutcome).toBe("INGESTED");
    expect(aggregate.coverage.fightsNotIngested).toBe(0);
    expect(aggregate.coverage.fightsIngested).toBe(1);
    expect(aggregate.coverage.fightsFailed).toBe(0);
    // The player is still reported as unsupported, now with an assessed status.
    expect(aggregate.coverage.cellsSpecNotSupported).toBe(1);
    expect(aggregate.status).toBe("NO_ANALYZED_CELLS");
    const cell = aggregate.cells[0];
    expect(cell?.kind === "NOT_ANALYZED" && cell.preparation.assessment).toBe("ASSESSED");
  });

  it("retrieves nothing when every selected player is absent", async () => {
    const snapshot = assassinationSnapshot({
      fightIds: [1],
      sourceIds: [M5D2_ACTOR],
      absentOn: new Map([[1, [M5D2_ACTOR]]]),
    });
    const ports = fakePorts({ snapshot });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports));

    expect(ports.ingestedFightIds()).toEqual([]);
    expect(aggregate.fights[0]?.processingOutcome).toBe("NOT_INGESTED");
    expect(aggregate.coverage.cellsAbsent).toBe(1);
    expect(aggregate.status).toBe("NO_ANALYZED_CELLS");
  });

  it("retrieves once for a mix of absent and unsupported (the unsupported player is present)", async () => {
    const snapshot = assassinationSnapshot({
      fightIds: [1],
      sourceIds: [FIRE_MAGE, M5D2_ACTOR],
      classNameFor,
      // The present Rogue is absent and the Fire Mage is unsupported; the
      // Rogue's own spec string is still Assassination.
      specNameFor: (_fightId, sourceId) => (sourceId === FIRE_MAGE ? "Fire" : "Assassination"),
      absentOn: new Map([[1, [M5D2_ACTOR]]]),
    });
    const ports = fakePorts({ snapshot });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports));
    expect(ports.ingestedFightIds()).toEqual([1]);
    expect(aggregate.coverage.cellsAbsent).toBe(1);
    expect(aggregate.coverage.cellsSpecNotSupported).toBe(1);
  });

  it("still ingests a fight where only ONE selected player is supported", async () => {
    // The saving must not overreach: one supported player is enough to need the
    // evidence, and the unsupported ones ride along at no extra cost.
    const snapshot = assassinationSnapshot({
      fightIds: [1],
      sourceIds: [FIRE_MAGE, M5D2_ACTOR],
      classNameFor,
      specNameFor: (_fightId, sourceId) => (sourceId === FIRE_MAGE ? "Fire" : "Assassination"),
    });
    const ports = fakePorts({ snapshot });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports));
    expect(ports.ingestedFightIds()).toEqual([1]);
    expect(aggregate.fights[0]?.processingOutcome).toBe("INGESTED");
    expect(aggregate.coverage.cellsAnalyzed).toBe(1);
    expect(aggregate.coverage.cellsSpecNotSupported).toBe(1);
  });

  it("ingests every fight with a present player in a mixed night (PREP-3)", async () => {
    // Fight 2 is all-unsupported; the others are not. Since PREP-3 fight 2 is
    // retrieved too, for the present player's consumable status.
    // The Rogue is reported as an unsupported Rogue spec on fight 2 — a real
    // pair (Rogue/Outlaw), since a class does not change between pulls.
    const snapshot = assassinationSnapshot({
      fightIds: [1, 2, 3],
      sourceIds: [M5D2_ACTOR],
      specNameFor: (fightId) => (fightId === 2 ? "Outlaw" : "Assassination"),
    });
    const ports = fakePorts({ snapshot });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2, 3] }, ports));
    expect(ports.ingestedFightIds()).toEqual([1, 2, 3]);
    expect(aggregate.coverage.fightsIngested).toBe(3);
    expect(aggregate.coverage.fightsNotIngested).toBe(0);
    // The identity the domain claims still holds.
    expect(aggregate.coverage.fightsIncluded).toBe(
      aggregate.coverage.fightsIngested +
        aggregate.coverage.fightsNotIngested +
        aggregate.coverage.fightsFailed,
    );
  });
});

describe("a mixed roster keeps every status distinct", () => {
  it("analyzes the supported player, reports the rest truthfully", async () => {
    const snapshot = assassinationSnapshot({
      fightIds: [1, 2],
      sourceIds: [FIRE_MAGE, M5D2_ACTOR, ROGUE_B],
      classNameFor,
      specNameFor: (_fightId, sourceId) => (sourceId === FIRE_MAGE ? "Fire" : "Assassination"),
      absentOn: new Map([[2, [ROGUE_B]]]),
    });
    const ports = fakePorts({ snapshot });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2] }, ports));

    expect(aggregate.coverage.cellsTotal).toBe(6);
    expect(aggregate.coverage.cellsAnalyzed).toBe(3);
    expect(aggregate.coverage.cellsSpecNotSupported).toBe(2);
    expect(aggregate.coverage.cellsAbsent).toBe(1);
    expect(aggregate.status).toBe("ANALYZED");
    // Real counts from the real corpus, not an empty analysis.
    expect(aggregate.coverage.eligibleDecisionsTotal).toBeGreaterThan(0);
  });

  it("preserves a specialization change as one player with two observations", async () => {
    const snapshot = assassinationSnapshot({
      fightIds: [1, 2],
      sourceIds: [M5D2_ACTOR],
      specNameFor: (fightId) => (fightId === 1 ? "Assassination" : "Outlaw"),
    });
    const ports = fakePorts({ snapshot });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2] }, ports));

    expect(aggregate.roster).toHaveLength(1);
    expect(aggregate.roster[0]?.observedSpecNames).toEqual(["Assassination", "Outlaw"]);
    expect(aggregate.roster[0]?.specChanged).toBe(true);
    // Fight 2's Outlaw has no analyzer; the pull is retrieved for consumable status only (PREP-3).
    expect(ports.ingestedFightIds()).toEqual([1, 2]);
    expect(aggregate.trendEvidence.series[0]?.comparability[0]?.sameSpec).toBe("DIFFERENT");
    // No direction label anywhere.
    expect(JSON.stringify(aggregate.trendEvidence)).not.toMatch(/improv|regress|better|worse/i);
  });

  it("reports a present player whose specialization WCL never supplied", async () => {
    // Not SPEC_NOT_SUPPORTED: we never identified a specialization, so whether an
    // analyzer exists for it is a question that was never reached.
    const snapshot = assassinationSnapshot({
      fightIds: [1],
      sourceIds: [M5D2_ACTOR],
      specNameFor: () => null,
    });
    const ports = fakePorts({ snapshot });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports));
    const cell = aggregate.cells[0];

    // Present, so retrieved for consumable status (PREP-3); still no analyzer.
    expect(ports.ingestedFightIds()).toEqual([1]);
    expect(cell?.kind).toBe("ANALYSIS_UNAVAILABLE");
    if (cell?.kind !== "ANALYSIS_UNAVAILABLE") return;
    expect(cell.reason).toBe("SPECIALIZATION_UNRESOLVED");
    expect(cell.preparation.assessment).toBe("ASSESSED");
    expect(cell.specName).toBeNull();
    expect(aggregate.coverage.cellsSpecNotSupported).toBe(0);
    expect(aggregate.coverage.cellsAnalysisUnavailable).toBe(1);
  });
});

describe("a non-fatal ingestion failure loses one fight, not the night", () => {
  const snapshot = assassinationSnapshot({
    fightIds: [1, 2],
    sourceIds: [M5D2_ACTOR, ROGUE_B],
    absentOn: new Map([[2, [ROGUE_B]]]),
  });

  it("marks the fight failed and gives present players an explicit unavailability", async () => {
    const ports = fakePorts({
      snapshot,
      ingestionFailures: new Map([[2, "UPSTREAM_DATA_INVALID"]]),
    });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2] }, ports));

    expect(aggregate.fights.find((fight) => fight.fightId === 2)?.processingOutcome).toBe("INGESTION_FAILED");
    expect(aggregate.partialFailures).toEqual([{ fightId: 2, reason: "FIGHT_INGESTION_FAILED" }]);

    const failed = aggregate.cells.filter((cell) => cell.fightId === 2);
    expect(failed.find((cell) => cell.sourceId === M5D2_ACTOR)?.kind).toBe("ANALYSIS_UNAVAILABLE");
    // Absence is a roster fact and survives the fight failing.
    expect(failed.find((cell) => cell.sourceId === ROGUE_B)?.kind).toBe("ABSENT");
  });

  it("manufactures no zero counts and no UNKNOWN decisions for the failed fight", async () => {
    const ports = fakePorts({
      snapshot,
      ingestionFailures: new Map([[2, "EVENT_RETRIEVAL_ABSENT"]]),
    });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2] }, ports));

    // Only fight 1's two players analyzed; fight 2 contributes nothing at all.
    expect(aggregate.coverage.cellsAnalyzed).toBe(2);
    expect(aggregate.coverage.cellsAnalysisUnavailable).toBe(1);
    const failedCells = aggregate.cells.filter((cell) => cell.fightId === 2);
    for (const cell of failedCells) {
      expect(cell).not.toHaveProperty("counts");
    }
    // The night still succeeds — the other pull is true.
    expect(aggregate.status).toBe("ANALYZED");
  });

  it.each(["UPSTREAM_AUTH_FAILED", "UPSTREAM_RATE_LIMITED", "REPORT_ARCHIVED_INACCESSIBLE"] as const)(
    "aborts the whole night on %s, which would affect every remaining fight",
    async (reason) => {
      const ports = fakePorts({ snapshot, ingestionFailures: new Map([[1, reason]]) });
      const run = await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2] }, ports);

      expect(run.ok).toBe(false);
      // And it stops: fight 2 is never attempted.
      expect(ports.ingestedFightIds()).toEqual([1]);
    },
  );
});

describe("revision integrity fails closed at every stage", () => {
  const snapshot = assassinationSnapshot({ fightIds: [1, 2], sourceIds: [M5D2_ACTOR] });

  it("aborts when a fight's context revision has already moved, before pagination", async () => {
    const ports = fakePorts({ snapshot, contextRevisions: new Map([[2, REVISION + 1]]) });
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2] }, ports);

    expect(errorOf(run)).toBe("REPORT_REVISION_CHANGED");
    // The final confirmation is never reached — the night was already invalid.
    expect(ports.revisionCalls()).toBe(0);
  });

  it("aborts when M3 reports a mid-pagination revision change", async () => {
    const ports = fakePorts({
      snapshot,
      ingestionFailures: new Map([[1, "REPORT_REVISION_CHANGED"]]),
    });
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2] }, ports);

    // Never downgraded to a per-fight FIGHT_INGESTION_FAILED. Mixed revisions
    // cannot produce an aggregate.
    expect(errorOf(run)).toBe("REPORT_REVISION_CHANGED");
    expect(ports.ingestedFightIds()).toEqual([1]);
  });

  it("aborts when the FINAL confirmation reports a change", async () => {
    const ports = fakePorts({
      snapshot,
      finalRevision: { outcome: "CHANGED", expected: REVISION, observed: REVISION + 1 },
    });
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2] }, ports);

    // Every fight was read at R0 and every cell is individually fine. The
    // SNAPSHOT is not, so nothing is published.
    expect(errorOf(run)).toBe("REPORT_REVISION_CHANGED");
    expect(ports.ingestedFightIds()).toEqual([1, 2]);
    expect(ports.revisionCalls()).toBe(1);
  });

  it("aborts when the final confirmation could not be completed", async () => {
    // UNVERIFIED is not a softer MATCHES. Nothing was established.
    const ports = fakePorts({
      snapshot,
      finalRevision: { outcome: "UNVERIFIED", cause: { kind: "REPORT_NOT_SERVED" } },
    });
    expect(errorOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2] }, ports))).toBe(
      "REPORT_REVISION_UNVERIFIED",
    );
  });

  it("aborts when the final confirmation names a DIFFERENT revision", async () => {
    const ports = fakePorts({
      snapshot,
      finalRevision: { outcome: "MATCHES", revision: REVISION + 5 },
    });
    expect(errorOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2] }, ports))).toBe(
      "REPORT_REVISION_UNVERIFIED",
    );
  });
});

describe("the source filter", () => {
  const snapshot = assassinationSnapshot({
    fightIds: [1],
    sourceIds: [ZERO_ID, FIRE_MAGE, M5D2_ACTOR],
  });

  it("defaults to every player in the selected fights", async () => {
    const ports = fakePorts({ snapshot });
    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports));
    expect(aggregate.coverage.cellsTotal).toBe(3);
    expect(aggregate.roster.map((player) => player.sourceId)).toEqual([ZERO_ID, FIRE_MAGE, M5D2_ACTOR]);
  });

  it("narrows the matrix to the requested players", async () => {
    const ports = fakePorts({ snapshot });
    const aggregate = aggregateOf(
      await runNight({ reportCode: REPORT_CODE, fightIds: [1], sourceIds: [M5D2_ACTOR] }, ports),
    );
    // The matrix is included fights x SELECTED players, not the whole raid.
    expect(aggregate.coverage.cellsTotal).toBe(1);
    expect(aggregate.roster).toHaveLength(1);
    // But the PULL was not one player, and the summary still says so. A
    // one-player request must not read as a one-player raid.
    expect(aggregate.fights[0]?.participantCount).toBe(3);
    expect(aggregate.fights[0]?.analyzedCount).toBe(1);
  });

  it("keeps actor 0 through the filter and into the cells", async () => {
    const ports = fakePorts({ snapshot });
    const aggregate = aggregateOf(
      await runNight({ reportCode: REPORT_CODE, fightIds: [1], sourceIds: [ZERO_ID] }, ports),
    );
    expect(aggregate.cells[0]?.sourceId).toBe(ZERO_ID);
    expect(aggregate.cells[0]?.playerKey).toBe(`${REPORT_CODE}:0`);

    // And through the public projection, including its analysisRef.
    const published = projectRaidNightResult(aggregate);
    const cell = published.cells[0];
    expect(cell?.kind).toBe("ANALYZED");
    if (cell?.kind !== "ANALYZED") return;
    expect(cell.analysisRef.sourceId).toBe(ZERO_ID);
  });

  it("refuses a requested player who is not in the selected-fight roster", async () => {
    const ports = fakePorts({ snapshot });
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [1], sourceIds: [999] }, ports);

    // No player invented, and no silent drop.
    expect(errorOf(run)).toBe("INVALID_REQUEST");
    if (run.ok) return;
    expect(run.error.message).toContain("999");
    // Checked after the roster query — the first point the fact exists — and
    // before any ingestion.
    expect(ports.rosterCalls()).toBe(1);
    expect(ports.ingestedFightIds()).toEqual([]);
  });

  it("keeps two players sharing a name distinct", async () => {
    const shared = assassinationSnapshot({ fightIds: [1], sourceIds: [FIRE_MAGE, M5D2_ACTOR] });
    const named = {
      ...shared,
      players: shared.players.map((player) => ({ ...player, name: "SameName" })),
    };
    const ports = fakePorts({ snapshot: named });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports));
    expect(aggregate.roster.every((player) => player.name === "SameName")).toBe(true);
    expect(aggregate.roster.map((player) => player.playerKey)).toEqual([
      `${REPORT_CODE}:17`,
      `${REPORT_CODE}:19`,
    ]);
  });
});

describe("discovered bounds are enforced after the roster query, before ingestion", () => {
  it("refuses a default-all selection above the player cap", async () => {
    // Not knowable before the roster query: with no explicit filter, the player
    // count is a fact only Warcraft Logs can supply.
    const snapshot = assassinationSnapshot({
      fightIds: [1],
      sourceIds: Array.from({ length: 26 }, (_, index) => index),
    });
    const ports = fakePorts({ snapshot });

    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports);
    expect(errorOf(run)).toBe("INVALID_REQUEST");
    expect(ports.rosterCalls()).toBe(1);
    // THE PROPERTY THAT MATTERS: the expensive part never started.
    expect(ports.ingestedFightIds()).toEqual([]);
  });

  it("accepts a full 4 x 25 matrix at exactly the cell cap", async () => {
    // The largest request this service accepts: 100 cells from 4 retrievals.
    //
    // The corpus describes one of the 25, so the other 24 are players whose
    // combatant profile the report never supplied. That is a real Warcraft Logs
    // condition and the analyzer fails closed on it — which keeps this test about
    // the matrix SHAPE and the retrieval count, and keeps it quick.
    const snapshot = assassinationSnapshot({
      fightIds: [1, 2, 3, 4],
      sourceIds: Array.from({ length: 25 }, (_, index) => index),
    });
    const ports = fakePorts({ snapshot, eventActorIds: [M5D2_ACTOR] });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1, 2, 3, 4] }, ports));
    expect(aggregate.coverage.cellsTotal).toBe(100);
    expect(ports.ingestedFightIds()).toEqual([1, 2, 3, 4]);
    // Every cell accounted for, and the 96 stated as what they are rather than
    // silently dropped or counted as analyzed.
    expect(aggregate.coverage.cellsAnalyzed).toBe(4);
    expect(aggregate.coverage.cellsProfileNotResolved).toBe(96);
  });

  it("serves ten analyzed players on one fight from ONE retrieval", async () => {
    // The sharing property at a raid-shaped width rather than a pair: ten real
    // analyses, each with its own focused view and its own combat state, over one
    // ingested core.
    const sourceIds = [0, 19, 23, 24, 25, 26, 27, 28, 29, 30];
    const snapshot = assassinationSnapshot({ fightIds: [1], sourceIds });
    const ports = fakePorts({ snapshot });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports));
    expect(ports.ingestedFightIds()).toEqual([1]);
    expect(aggregate.coverage.cellsAnalyzed).toBe(10);
    // Ten players' worth of real decisions, not one player's counted ten times:
    // each cell carries its own eligible-decision count.
    expect(aggregate.coverage.eligibleDecisionsTotal).toBe(
      aggregate.cells.reduce(
        (total, cell) => total + (cell.kind === "ANALYZED" ? cell.counts.eligibleDecisions : 0),
        0,
      ),
    );
  });
});

describe("a requested fight the report does not contain", () => {
  it("becomes a fight-level failure and leaves the rest of the night intact", async () => {
    const snapshot = assassinationSnapshot({
      fightIds: [1],
      sourceIds: [M5D2_ACTOR],
      requestedFightIds: [1, 5],
    });
    const ports = fakePorts({ snapshot });

    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1, 5] }, ports));

    expect(aggregate.partialFailures).toEqual([{ fightId: 5, reason: "FIGHT_NOT_FOUND" }]);
    // No summary, no cell, no absence, no zero-fill.
    expect(aggregate.fights.map((fight) => fight.fightId)).toEqual([1]);
    expect(aggregate.cells.every((cell) => cell.fightId === 1)).toBe(true);
    expect(ports.ingestedFightIds()).toEqual([1]);
    expect(aggregate.coverage.fightsRequested).toBe(2);
    expect(aggregate.coverage.fightsMissing).toBe(1);
    expect(aggregate.status).toBe("ANALYZED");
  });
});

describe("roster discovery failures reach the caller in the shared vocabulary", () => {
  it.each([
    ["REPORT_NOT_ACCESSIBLE", "REPORT_NOT_ACCESSIBLE"],
    ["UPSTREAM_AUTH_FAILED", "UPSTREAM_AUTH_FAILED"],
    ["UPSTREAM_RATE_LIMITED", "UPSTREAM_RATE_LIMITED"],
    ["UPSTREAM_UNAVAILABLE", "UPSTREAM_UNAVAILABLE"],
    ["ROSTER_DATA_INVALID", "UPSTREAM_DATA_INVALID"],
  ] as const)("maps %s to %s and ingests nothing", async (reason, expected) => {
    const snapshot = assassinationSnapshot({ fightIds: [1], sourceIds: [M5D2_ACTOR] });
    const ports = fakePorts({
      snapshot,
      rosterFailure: { ok: false, failure: { reason } },
    });

    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports);
    expect(errorOf(run)).toBe(expected);
    expect(ports.ingestedFightIds()).toEqual([]);
  });
});
