/**
 * M13-F: an Augmentation Evoker in a raid night.
 *
 * Augmentation is the first PUBLIC registration whose requirement is
 * FULL_RAID. A raid night analyzes every present player over ONE shared
 * core, and before M13-F each player's focused view took the fight-level
 * union of the selected analyzers' scopes. With an Evoker present that union
 * is FULL_RAID, so every other player's view — and therefore their cell —
 * would have changed because a neighbour's registration was selected.
 *
 * What must hold: each player's view is derived from THEIR OWN analyzer's
 * requirement plus preparation's, exactly as the single-fight service
 * derives it. A Brewmaster cell is identical alone and beside an Evoker; the
 * Evoker's own analyzer runs once and its cell evaluates no decision.
 */

import { describe, expect, it } from "vitest";

import type { PlayerFightResult } from "../../src/aggregation/cell.js";
import { PublicRaidNightResultSchema } from "../../src/contracts/raid-night-contract.js";
import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import { AUGMENTATION_EVOKER_ANALYZER_ID } from "../../src/specs/evoker/augmentation/spec.js";
import { BREWMASTER_MONK_ANALYZER_ID } from "../../src/specs/monk/brewmaster/spec.js";
import { countedProductionCatalog } from "../support/catalog.js";
import {
  REPORT_CODE,
  assassinationSnapshot,
  corpusArtifactCore,
  fakePorts,
  runNight,
  type FakePorts,
} from "../support/raid-night-orchestration-fixture.js";

const OPENER = "wcl-brewmaster-monk-gtkb-opener";
const FIGHT_ID = 22;
const BREWMASTER = 4;
/** A roster slot stated as an Augmentation Evoker in the night's snapshot. */
const EVOKER = 17;

const CLASS_OF: Readonly<Record<number, string>> = { [BREWMASTER]: "Monk", [EVOKER]: "Evoker" };
const SPEC_OF: Readonly<Record<number, string>> = { [BREWMASTER]: "Brewmaster", [EVOKER]: "Augmentation" };

function classNameFor(sourceId: number): string {
  const className = CLASS_OF[sourceId];
  if (className === undefined) throw new Error(`no class for ${String(sourceId)}`);
  return className;
}

function portsFor(roster: readonly number[]): {
  readonly ports: FakePorts;
  readonly calls: Readonly<Record<string, number>>;
  /** The evidence breadth each analyzer was actually handed, in run order. */
  readonly scopes: readonly (readonly [string, string])[];
} {
  const snapshot = assassinationSnapshot({
    fightIds: [FIGHT_ID],
    sourceIds: [...roster],
    classNameFor,
    specNameFor: (_fightId, sourceId) => SPEC_OF[sourceId] ?? null,
    fightFacts: {
      encounterId: 3420,
      difficulty: 4,
      kill: true,
      startTimeMs: 2_415_041,
      endTimeMs: 2_699_832,
    },
  });
  const counted = countedProductionCatalog();
  const ports = fakePorts({
    snapshot,
    coreFor: (fightId, participants) =>
      corpusArtifactCore(
        OPENER,
        fightId,
        participants.map((sourceId) => ({ sourceId, className: classNameFor(sourceId) })),
      ),
  });
  const scopes: (readonly [string, string])[] = [];
  const registry = counted.registry.map((row) => ({
    ...row,
    analyze: (input: Parameters<typeof row.analyze>[0]) => {
      scopes.push([row.analyzerId, input.state.fight.breadth.scope]);
      return row.analyze(input);
    },
  }));
  return { ports: { ...ports, deps: { ...ports.deps, registry } }, calls: counted.calls, scopes };
}

function cellOf(cells: readonly PlayerFightResult[], sourceId: number): PlayerFightResult {
  const cell = cells.find((candidate) => candidate.fightId === FIGHT_ID && candidate.sourceId === sourceId);
  if (cell === undefined) throw new Error(`no cell for ${String(sourceId)}`);
  return cell;
}

describe("an Augmentation Evoker beside a Brewmaster Monk", () => {
  it("leaves the Brewmaster cell exactly as it is alone: a neighbour's FULL_RAID requirement widens no one else's view", async () => {
    const alone = await runNight(
      { reportCode: REPORT_CODE, fightIds: [FIGHT_ID] },
      portsFor([BREWMASTER]).ports,
    );
    const mixedPorts = portsFor([BREWMASTER, EVOKER]);
    const mixed = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, mixedPorts.ports);
    if (!alone.ok || !mixed.ok) throw new Error("run failed");
    expect(cellOf(mixed.aggregate.cells, BREWMASTER)).toEqual(cellOf(alone.aggregate.cells, BREWMASTER));
    expect(mixedPorts.calls[BREWMASTER_MONK_ANALYZER_ID]).toBe(1);
    expect(mixedPorts.calls[AUGMENTATION_EVOKER_ANALYZER_ID]).toBe(1);
    // The discriminating fact: each analyzer is handed its OWN breadth. Before
    // M13-F the Brewmaster view took the fight-level FULL_RAID union here.
    expect(mixedPorts.scopes).toEqual([
      [BREWMASTER_MONK_ANALYZER_ID, "PLAYER_CONTEXT"],
      [AUGMENTATION_EVOKER_ANALYZER_ID, "FULL_RAID"],
    ]);
  });

  it("dispatches the Evoker to its own registration, whose cell evaluates no decision, and the night stays schema-valid", async () => {
    const run = await runNight(
      { reportCode: REPORT_CODE, fightIds: [FIGHT_ID] },
      portsFor([BREWMASTER, EVOKER]).ports,
    );
    if (!run.ok) throw new Error("run failed");
    const cell = cellOf(run.aggregate.cells, EVOKER);
    expect(cell.kind).not.toBe("ANALYZED");
    expect(JSON.stringify(cell)).not.toMatch(/"match"|"rejected"/);
    const published = projectRaidNightResult(run.aggregate);
    expect(PublicRaidNightResultSchema.safeParse(published).success).toBe(true);
  });
});
