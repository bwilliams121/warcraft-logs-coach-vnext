/**
 * PREP-3: consumable status in the raid night (owner decisions 2026-10-30).
 *
 * - Every PRESENT cell carries the player's consumable status, analyzable or
 *   not. An ABSENT cell carries none.
 * - A fight whose present players are all unanalyzable is retrieved once, for
 *   the shared preparation producer alone: no resources, no analyzer.
 * - A failed retrieval leaves the existing fight-failure semantics untouched
 *   (ANALYSIS_UNAVAILABLE, FIGHT_INGESTION_FAILED). Preparation is
 *   NOT_ASSESSED (RETRIEVAL_FAILED), never a zero.
 * - The public cell form is COMPACT: a count, or UNKNOWN with a lower bound and
 *   reason codes (no `count`). Uses and evidence stay in the single-fight
 *   document.
 */

import { describe, expect, it } from "vitest";

import { cellPreparationOf } from "../../src/aggregation/cell-projection.js";
import type { RaidNightAnalysis } from "../../src/aggregation/raid-night.js";
import { assessConsumableStatus } from "../../src/analysis/preparation/consumable-status.js";
import { PublicRaidNightResultSchema } from "../../src/contracts/raid-night-contract.js";
import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import type { RaidNightRunResult } from "../../src/services/raid-night-runner.js";
import {
  assassinationSnapshot,
  fakePorts,
  M5D2_ACTOR,
  REPORT_CODE,
  runNight,
} from "../support/raid-night-orchestration-fixture.js";
import {
  castEvent,
  observableCategory,
  partialCategory,
  syntheticFight,
} from "../support/synthetic-fight.js";

const BEAST_MASTERY_HUNTER = 20;
const ABSENT_ROGUE = 23;
const classNameFor = (sourceId: number): string => (sourceId === BEAST_MASTERY_HUNTER ? "Hunter" : "Rogue");

function aggregateOf(run: RaidNightRunResult): RaidNightAnalysis {
  if (!run.ok) throw new Error(`expected success, got ${run.error.code}: ${run.error.message}`);
  return run.aggregate;
}

/** Ports that also record each ingestion request, to read what was asked for. */
type IngestFightCore = ReturnType<typeof fakePorts>["deps"]["ingestFightCore"];
type FightCoreRequest = Parameters<IngestFightCore>[0];

function recordingPorts(options: Parameters<typeof fakePorts>[0]) {
  const ports = fakePorts(options);
  const requests: FightCoreRequest[] = [];
  const ingest: IngestFightCore = ports.deps.ingestFightCore;
  return {
    ...ports,
    requests,
    deps: {
      ...ports.deps,
      ingestFightCore: async (request: FightCoreRequest, credentials: Parameters<IngestFightCore>[1]) => {
        requests.push(request);
        return ingest(request, credentials);
      },
    },
  };
}

describe("an all-unanalyzable fight is retrieved for preparation alone", () => {
  const snapshot = assassinationSnapshot({
    fightIds: [1],
    sourceIds: [BEAST_MASTERY_HUNTER, ABSENT_ROGUE],
    classNameFor,
    specNameFor: () => "BeastMastery",
    absentOn: new Map([[1, [ABSENT_ROGUE]]]),
  });

  it("one retrieval, with no resources and naming the present player, and an assessed cell", async () => {
    const ports = recordingPorts({ snapshot });
    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports));

    expect(ports.requests).toHaveLength(1);
    expect(ports.requests[0]).toMatchObject({
      fightId: 1,
      includeResources: false,
      talentImportActorId: BEAST_MASTERY_HUNTER,
    });
    expect(aggregate.fights[0]?.processingOutcome).toBe("INGESTED");

    const present = aggregate.cells.find((cell) => cell.sourceId === BEAST_MASTERY_HUNTER);
    expect(present?.kind).toBe("NOT_ANALYZED");
    if (present?.kind !== "NOT_ANALYZED") return;
    expect(present.status).toBe("SPEC_NOT_SUPPORTED");
    expect(present.preparation.assessment).toBe("ASSESSED");
    expect(aggregate.cells.find((cell) => cell.sourceId === ABSENT_ROGUE)?.kind).toBe("ABSENT");
  });

  it("projects a schema-valid public cell with the compact status; the absent cell has none", async () => {
    const ports = recordingPorts({ snapshot });
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports);
    if (!run.ok) throw new Error(run.error.message);
    const projected = projectRaidNightResult(run.aggregate);
    expect(PublicRaidNightResultSchema.safeParse(projected).success).toBe(true);

    const cells = JSON.parse(JSON.stringify(projected)).cells as Record<string, unknown>[];
    const present = cells.find((cell) => cell["sourceId"] === BEAST_MASTERY_HUNTER) as Record<string, any>;
    expect(present["preparation"]["assessment"]).toBe("ASSESSED");
    expect(Object.keys(present["preparation"]["statuses"]).sort()).toEqual([
      "combatPotion",
      "healthPotion",
      "healthstone",
    ]);
    // Compact: no uses, no evidence locators on the night.
    expect(JSON.stringify(present["preparation"])).not.toMatch(/"uses"|"evidence"|"spellId"/);
    const absent = cells.find((cell) => cell["sourceId"] === ABSENT_ROGUE) as Record<string, unknown>;
    expect("preparation" in absent).toBe(false);
  });

  it("a failed retrieval keeps the fight-failure semantics and never reports a zero", async () => {
    const ports = recordingPorts({ snapshot, ingestionFailures: new Map([[1, "UPSTREAM_DATA_INVALID"]]) });
    const aggregate = aggregateOf(await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports));
    expect(aggregate.fights[0]?.processingOutcome).toBe("INGESTION_FAILED");
    const present = aggregate.cells.find((cell) => cell.sourceId === BEAST_MASTERY_HUNTER);
    expect(present?.kind).toBe("ANALYSIS_UNAVAILABLE");
    if (present?.kind !== "ANALYSIS_UNAVAILABLE") return;
    expect(present.reason).toBe("FIGHT_INGESTION_FAILED");
    expect(present.preparation).toEqual({ assessment: "NOT_ASSESSED", reason: "RETRIEVAL_FAILED" });
  });
});

describe("every present cell kind carries consumable status", () => {
  it("an analyzed and an unsupported player in one fight both carry it", async () => {
    const snapshot = assassinationSnapshot({
      fightIds: [1],
      sourceIds: [BEAST_MASTERY_HUNTER, M5D2_ACTOR],
      classNameFor,
      specNameFor: (_fightId, sourceId) =>
        sourceId === BEAST_MASTERY_HUNTER ? "BeastMastery" : "Assassination",
    });
    const aggregate = aggregateOf(
      await runNight({ reportCode: REPORT_CODE, fightIds: [1] }, fakePorts({ snapshot })),
    );
    for (const cell of aggregate.cells) {
      expect(cell.kind === "ABSENT" ? null : cell.preparation.assessment, cell.kind).toBe("ASSESSED");
    }
    expect(aggregate.cells.map((cell) => cell.kind).sort()).toEqual(["ANALYZED", "NOT_ANALYZED"]);
  });
});

describe("the compact cell form", () => {
  const PLAYER = 14;
  const range = inclusiveRange(1_000, 181_000);
  const healthstone = castEvent({
    ordinal: 1,
    reportTimeMs: 50_000,
    sourceActorId: PLAYER,
    abilityGameId: 6262,
    castPhase: "COMPLETE",
  });

  it("OBSERVED is a count; UNKNOWN has a lower bound, each reason code once, and no count", () => {
    const complete = syntheticFight({
      startTimeMs: 1_000,
      endTimeMs: 181_000,
      events: [healthstone],
      categories: { CASTS: observableCategory(range, [PLAYER]), AURAS: observableCategory(range, [PLAYER]) },
    });
    expect(
      cellPreparationOf({ state: "ASSESSED", report: assessConsumableStatus(complete, PLAYER) }),
    ).toEqual({
      assessment: "ASSESSED",
      statuses: {
        healthPotion: { countState: "OBSERVED", count: 0 },
        healthstone: { countState: "OBSERVED", count: 1 },
        combatPotion: { countState: "OBSERVED", count: 0 },
      },
    });

    const partial = syntheticFight({
      startTimeMs: 1_000,
      endTimeMs: 181_000,
      events: [healthstone],
      categories: {
        CASTS: partialCategory([inclusiveRange(1_000, 90_000)], [PLAYER]),
        AURAS: partialCategory([inclusiveRange(1_000, 90_000)], [PLAYER]),
      },
    });
    const compact = cellPreparationOf({ state: "ASSESSED", report: assessConsumableStatus(partial, PLAYER) });
    if (compact.assessment !== "ASSESSED") throw new Error("not assessed");
    expect(compact.statuses.healthstone).toEqual({
      countState: "UNKNOWN",
      observedAtLeast: 1,
      reasonCodes: ["CAST_COVERAGE"],
    });
    expect(compact.statuses.combatPotion).toEqual({
      countState: "UNKNOWN",
      observedAtLeast: 0,
      reasonCodes: ["CAST_COVERAGE", "AURA_COVERAGE"],
    });
  });
});
