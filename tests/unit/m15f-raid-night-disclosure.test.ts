/**
 * M15-F: the raid-night coverage disclosure, as a pure function of the night.
 *
 * What must hold:
 * - PARTIAL always, disclosures never empty, codes in vocabulary order, and
 *   the coverage sentence first;
 * - every code is held exactly when the night's own coverage or cells say so;
 * - the same night always discloses the same thing.
 *
 * What must NOT happen:
 * - a night with no analyzed cell reading as clean play;
 * - an UNKNOWN consumable count stated as zero;
 * - a cell that was not analyzed described as a statement about play being
 *   omitted;
 * - a rate, percentage or score in any line.
 */

import { describe, expect, it } from "vitest";

import type { PlayerFightResult } from "../../src/aggregation/cell.js";
import {
  RAID_NIGHT_DISCLOSURES,
  RAID_NIGHT_DISCLOSURE_REVISION,
  discloseRaidNightCoverage,
} from "../../src/aggregation/raid-night-disclosure.js";
import type { RaidNightAnalysis } from "../../src/aggregation/raid-night.js";
import {
  aggregateOf,
  analyzedCell,
  comparison,
  excludedCast,
  hundredCellAggregate,
  notAnalyzedCell,
  rosterFightFor,
  rosterPlayerFor,
} from "../support/raid-night-fixture.js";

const players = [
  rosterPlayerFor({ sourceId: 1, name: "One" }),
  rosterPlayerFor({ sourceId: 2, name: "Two" }),
];
const fight = rosterFightFor({
  fightId: 1,
  participants: [
    { sourceId: 1, specName: "Assassination" },
    { sourceId: 2, specName: "Fire" },
  ],
});

function nightOf(cells: readonly PlayerFightResult[]): RaidNightAnalysis {
  return aggregateOf({ players, fights: [fight], cells });
}

const ANALYZED_ONLY_MATCH = nightOf([
  analyzedCell({ fightId: 1, sourceId: 1 }),
  notAnalyzedCell({ fightId: 1, sourceId: 2, status: "SPEC_NOT_SUPPORTED", specName: "Fire" }),
]);

const WITH_UNKNOWN = nightOf([
  analyzedCell({
    fightId: 1,
    sourceId: 1,
    comparisons: [
      comparison({
        ordinal: 0,
        outcome: "UNKNOWN",
        basis: "AUTHORITY_SELECTION_UNRESOLVED",
        observedToken: "envenom",
        decisiveBlocker: "OBSERVED_STATE_MISSING",
      }),
    ],
    excluded: [excludedCast({ ordinal: 0, reason: "EXECUTION_LANE_NOT_ESTABLISHED", abilityGameId: 1000 })],
  }),
  notAnalyzedCell({ fightId: 1, sourceId: 2, status: "AUTHORITY_NOT_AVAILABLE", specName: "Fire" }),
]);

const NONE_ANALYZED = nightOf([
  notAnalyzedCell({ fightId: 1, sourceId: 1, status: "SPEC_NOT_SUPPORTED" }),
  notAnalyzedCell({ fightId: 1, sourceId: 2, status: "SPEC_NOT_SUPPORTED", specName: "Fire" }),
]);

/** The same night, with one present cell's healthstone count UNKNOWN. */
function withUnknownConsumable(night: RaidNightAnalysis): RaidNightAnalysis {
  return {
    ...night,
    cells: night.cells.map((cell, index) =>
      index === 0 && cell.kind !== "ABSENT"
        ? {
            ...cell,
            preparation: {
              assessment: "ASSESSED",
              statuses: {
                healthPotion: { countState: "OBSERVED", count: 0 },
                healthstone: { countState: "UNKNOWN", observedAtLeast: 0, reasonCodes: ["CAST_COVERAGE"] },
                combatPotion: { countState: "OBSERVED", count: 1 },
              },
            },
          }
        : cell,
    ) as readonly PlayerFightResult[],
  };
}

describe("the shape every disclosure has", () => {
  it("is PARTIAL, never empty, in vocabulary order, and always names the per-fight presentation it omits", () => {
    for (const night of [ANALYZED_ONLY_MATCH, WITH_UNKNOWN, NONE_ANALYZED, hundredCellAggregate()]) {
      const disclosure = discloseRaidNightCoverage(night);
      expect(disclosure.revision).toBe(RAID_NIGHT_DISCLOSURE_REVISION);
      expect(disclosure.assessmentScope).toBe("PARTIAL");
      expect(disclosure.disclosures.length).toBeGreaterThan(0);
      expect(disclosure.disclosures).toEqual(
        RAID_NIGHT_DISCLOSURES.filter((code) => disclosure.disclosures.includes(code)),
      );
      expect(disclosure.disclosures).toContain("PER_FIGHT_PRESENTATION_NOT_INCLUDED");
      expect(disclosure.lines.at(-1)).toContain("single-fight analysis (analysisRef)");
      for (const line of disclosure.lines) {
        expect(line).not.toMatch(/%|\bscore|\brank|\brating|\bgrade|clean|perfect|flawless|mistake/i);
      }
    }
  });

  it("is deterministic", () => {
    expect(discloseRaidNightCoverage(hundredCellAggregate())).toEqual(
      discloseRaidNightCoverage(hundredCellAggregate()),
    );
  });
});

describe("each code follows the night's own coverage", () => {
  it("an analyzed night verifies observed decisions only, and says how many resolved", () => {
    const disclosure = discloseRaidNightCoverage(ANALYZED_ONLY_MATCH);
    expect(disclosure.disclosures).toEqual([
      "ONLY_OBSERVED_DECISIONS_VERIFIED",
      "CELLS_SPEC_NOT_SUPPORTED",
      ...(disclosure.disclosures.includes("PREPARATION_NOT_ASSESSED") ? ["PREPARATION_NOT_ASSESSED"] : []),
      "PER_FIGHT_PRESENTATION_NOT_INCLUDED",
    ]);
    expect(disclosure.lines[0]).toBe(
      "Partial analysis: 1 of 2 present player-fight cells were analyzed (1 specialization not supported, 0 not analyzed, 0 analysis unavailable; 0 absent).",
    );
    expect(disclosure.lines[1]).toBe(
      "In the analyzed cells, 1 of 1 eligible observed decision resolved against the authority and 0 are UNKNOWN. Only observed decisions were verified, not moments of inaction.",
    );
  });

  it("UNKNOWN decisions, excluded casts and an unanalyzed cell are each disclosed", () => {
    const disclosure = discloseRaidNightCoverage(WITH_UNKNOWN);
    expect(disclosure.disclosures).toEqual(
      expect.arrayContaining(["DECISIONS_UNKNOWN", "CASTS_EXCLUDED", "CELLS_NOT_ANALYZED"]),
    );
    expect(disclosure.disclosures).not.toContain("CELLS_SPEC_NOT_SUPPORTED");
    expect(disclosure.lines).toContain(
      "A cell that was not analyzed is a coverage limit, not a statement about play.",
    );
    expect(disclosure.lines[1]).toContain("0 of 1 eligible observed decision resolved");
    expect(disclosure.lines[1]).toContain("1 are UNKNOWN; 1 cast was excluded");
  });

  it("a night with no analyzed cell says no gameplay analysis exists, never that it was clean", () => {
    const disclosure = discloseRaidNightCoverage(NONE_ANALYZED);
    expect(disclosure.disclosures[0]).toBe("NO_CELL_ANALYZED");
    expect(disclosure.disclosures).not.toContain("ONLY_OBSERVED_DECISIONS_VERIFIED");
    expect(disclosure.lines[0]).toBe(
      "No player-fight cell was analyzed (2 present cells, 0 absent). No gameplay analysis was produced, so nothing is claimed about how anyone played.",
    );
    // No decision sentence: there are no decisions to describe, not zero of them.
    expect(disclosure.lines.some((line) => line.includes("eligible observed"))).toBe(false);
  });

  it("an UNKNOWN consumable count is disclosed as UNKNOWN, never as zero", () => {
    const disclosure = discloseRaidNightCoverage(withUnknownConsumable(ANALYZED_ONLY_MATCH));
    expect(disclosure.disclosures).toContain("CONSUMABLE_COUNT_UNKNOWN");
    expect(disclosure.lines).toContain("1 cell has a consumable count that is UNKNOWN, which is not zero.");
  });

  it("a failed and a missing fight, with their unavailable cells, are disclosed and nothing is claimed about them", () => {
    const night = hundredCellAggregate();
    const disclosure = discloseRaidNightCoverage(night);
    expect(night.coverage.fightsFailed).toBeGreaterThan(0);
    expect(night.coverage.fightsMissing).toBeGreaterThan(0);
    expect(disclosure.disclosures).toEqual(
      expect.arrayContaining([
        "FIGHTS_FAILED",
        "FIGHTS_MISSING",
        "CELLS_ANALYSIS_UNAVAILABLE",
        "PREPARATION_NOT_ASSESSED",
        "CELLS_SPEC_NOT_SUPPORTED",
        "DECISIONS_UNKNOWN",
        "CASTS_EXCLUDED",
      ]),
    );
    expect(disclosure.lines).toContain(
      `${String(night.coverage.fightsMissing)} requested fight was not in the report and ${String(night.coverage.fightsFailed)} could not be retrieved; nothing is claimed about them.`,
    );
  });
});
