/**
 * PREPARATION consumable status (src/analysis/preparation/consumable-status.ts).
 *
 * The mandatory negative cases (CLAUDE.md "Always-Report Consumables"):
 * - a category is never omitted;
 * - zero is never reported from PARTIAL, ABSENT or unverified coverage;
 * - racial abilities never count;
 * - a consumable the identity data cannot classify never reads as no use.
 */

import { describe, expect, it } from "vitest";

import {
  assessConsumableStatus,
  type ConsumableStatus,
  type ConsumableStatusReport,
} from "../../../src/analysis/preparation/consumable-status.js";
import { loadPreparationConsumables } from "../../../src/data/game/preparation-consumables.js";
import { inclusiveRange } from "../../../src/engine/evidence/coverage.js";
import type { CombatAbility } from "../../../src/engine/normalization/abilities.js";
import type { CombatEvent } from "../../../src/engine/normalization/normalized-events.js";
import {
  absentCategory,
  auraEvent,
  castEvent,
  observableCategory,
  partialCategory,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const PLAYER = 14;
const OTHER = 20;
const START = 1_000;
const END = 181_000; // a 180 s fight: longer than any combat-potion buff
const SILVERMOON = 1234768;
const HEALTHSTONE = 6262;
const DEMONIC_HEALTHSTONE = 452930;
const RECKLESSNESS = 1236994;

let ordinal = 0;
const cast = (
  spellId: number,
  atMs: number,
  options: { source?: number; phase?: "BEGIN" | "COMPLETE" } = {},
) =>
  castEvent({
    ordinal: ordinal++,
    reportTimeMs: atMs,
    sourceActorId: options.source ?? PLAYER,
    abilityGameId: spellId,
    castPhase: options.phase ?? "COMPLETE",
  });
const buff = (
  spellId: number,
  atMs: number,
  operation: "APPLIED" | "REMOVED" | "REFRESHED",
  target = PLAYER,
) =>
  auraEvent({
    ordinal: ordinal++,
    reportTimeMs: atMs,
    sourceActorId: target,
    targetActorId: target,
    abilityGameId: spellId,
    operation,
    auraClass: "BUFF",
  });

const range = inclusiveRange(START, END);
const complete = { CASTS: observableCategory(range, [PLAYER]), AURAS: observableCategory(range, [PLAYER]) };

function assess(
  events: readonly CombatEvent[],
  options: {
    categories?: Parameters<typeof syntheticFight>[0] extends infer O
      ? O extends { categories?: infer C }
        ? C
        : never
      : never;
    endTimeMs?: number;
    abilities?: ReadonlyMap<number, CombatAbility>;
  } = {},
): ConsumableStatusReport {
  const fight = syntheticFight({
    startTimeMs: START,
    endTimeMs: options.endTimeMs ?? END,
    events,
    categories: options.categories ?? complete,
    ...(options.abilities === undefined ? {} : { abilities: options.abilities }),
  });
  return assessConsumableStatus(fight, PLAYER);
}

const observed = (status: ConsumableStatus) => (status.state === "OBSERVED" ? status.count : null);
const codes = (status: ConsumableStatus) =>
  status.state === "UNKNOWN" ? status.reasons.map((reason) => reason.code) : [];

function expectAllThree(report: ConsumableStatusReport) {
  expect(Object.keys(report.statuses).sort()).toEqual(["COMBAT_POTION", "HEALTHSTONE", "HEALTH_POTION"]);
}

describe("COMPLETE coverage: counts are observed facts", () => {
  it("no use under COMPLETE coverage is an observed zero for all three", () => {
    const report = assess([]);
    expectAllThree(report);
    expect(report).toMatchObject({
      category: "PREPARATION",
      authority: "WCL_OBSERVED_FACT",
      identityData: { authority: "RUNTIME_GAME_DATA", clientDataWowVersion: "12.1.0.69587" },
    });
    for (const status of Object.values(report.statuses)) expect(observed(status)).toBe(0);
  });

  it("counts the player's completed casts, each with its identity and evidence", () => {
    const report = assess([
      cast(SILVERMOON, 60_000),
      cast(HEALTHSTONE, 20_000),
      cast(DEMONIC_HEALTHSTONE, 120_000),
      cast(RECKLESSNESS, 2_000),
      buff(RECKLESSNESS, 2_000, "APPLIED"),
      buff(RECKLESSNESS, 32_000, "REMOVED"),
    ]);
    expect(observed(report.statuses.HEALTH_POTION)).toBe(1);
    expect(observed(report.statuses.HEALTHSTONE)).toBe(2);
    expect(observed(report.statuses.COMBAT_POTION)).toBe(1);
    expect(report.statuses.HEALTHSTONE.uses.map((use) => [use.spellId, use.name, use.timing])).toEqual([
      [HEALTHSTONE, "Healthstone", "IN_FIGHT"],
      [DEMONIC_HEALTHSTONE, "Demonic Healthstone", "IN_FIGHT"],
    ]);
    expect(report.statuses.HEALTH_POTION.uses[0]?.evidence).toMatchObject({
      rawType: "cast",
      reportTimeMs: 60_000,
    });
  });

  it("ignores other players, cast beginnings and casts outside the fight", () => {
    const report = assess([
      cast(SILVERMOON, 60_000, { source: OTHER }),
      cast(HEALTHSTONE, 20_000, { phase: "BEGIN" }),
      cast(SILVERMOON, END + 1),
      cast(SILVERMOON, START - 1),
    ]);
    for (const status of Object.values(report.statuses)) expect(observed(status)).toBe(0);
  });

  it("a combat-potion buff removed with no application or cast in the fight is a pre-pull use", () => {
    const report = assess([buff(RECKLESSNESS, 25_000, "REMOVED")]);
    expect(observed(report.statuses.COMBAT_POTION)).toBe(1);
    expect(report.statuses.COMBAT_POTION.uses[0]).toMatchObject({
      timing: "BEFORE_PULL",
      spellId: RECKLESSNESS,
    });
  });

  it("a pre-pull potion and a later in-fight potion are two uses; an in-fight buff's removal is not a second", () => {
    const report = assess([
      buff(RECKLESSNESS, 25_000, "REMOVED"),
      cast(RECKLESSNESS, 100_000),
      buff(RECKLESSNESS, 130_000, "REMOVED"), // the in-fight cast's buff, application not recorded
    ]);
    expect(observed(report.statuses.COMBAT_POTION)).toBe(2);
    expect(report.statuses.COMBAT_POTION.uses.map((use) => use.timing)).toEqual(["BEFORE_PULL", "IN_FIGHT"]);
  });

  it("another player's potion buff is not the player's use", () => {
    const report = assess([buff(RECKLESSNESS, 25_000, "REMOVED", OTHER)]);
    expect(observed(report.statuses.COMBAT_POTION)).toBe(0);
  });
});

describe("incomplete evidence never reads as zero", () => {
  it("PARTIAL cast coverage: every kind is UNKNOWN, with the uses seen as a lower bound", () => {
    const partial = { ...complete, CASTS: partialCategory([inclusiveRange(START, 90_000)], [PLAYER]) };
    const report = assess([cast(SILVERMOON, 60_000)], { categories: partial });
    expectAllThree(report);
    for (const status of Object.values(report.statuses)) {
      expect(status.state).toBe("UNKNOWN");
      expect(codes(status)).toContain("CAST_COVERAGE");
    }
    expect(report.statuses.HEALTH_POTION).toMatchObject({ observedAtLeast: 1 });
    expect(report.statuses.HEALTHSTONE).toMatchObject({ observedAtLeast: 0 });
  });

  it("ABSENT or unverified cast coverage: UNKNOWN, never 0", () => {
    for (const casts of [absentCategory([PLAYER]), { capability: "UNVERIFIED" as const }]) {
      const report = assess([], { categories: { ...complete, CASTS: casts } });
      for (const status of Object.values(report.statuses)) expect(status.state).toBe("UNKNOWN");
    }
  });

  it("a player outside the evidence's actor scope is UNKNOWN (INSUFFICIENT_SCOPE)", () => {
    const report = assess([], {
      categories: { CASTS: observableCategory(range, [OTHER]), AURAS: observableCategory(range, [OTHER]) },
    });
    expect(report.statuses.HEALTH_POTION).toMatchObject({
      state: "UNKNOWN",
      reasons: [{ code: "CAST_COVERAGE", gate: "INSUFFICIENT_SCOPE" }],
    });
  });

  it("PARTIAL aura coverage makes only the combat potion UNKNOWN (a pre-pull potion could be hidden)", () => {
    const report = assess([], {
      categories: { ...complete, AURAS: partialCategory([inclusiveRange(START, 90_000)], [PLAYER]) },
    });
    expect(observed(report.statuses.HEALTH_POTION)).toBe(0);
    expect(observed(report.statuses.HEALTHSTONE)).toBe(0);
    expect(codes(report.statuses.COMBAT_POTION)).toEqual(["AURA_COVERAGE"]);
  });

  it("a fight shorter than the longest combat-potion buff leaves the combat potion UNKNOWN", () => {
    const short = inclusiveRange(START, START + 45_000);
    const report = assess([cast(RECKLESSNESS, 2_000)], {
      endTimeMs: START + 45_000,
      categories: { CASTS: observableCategory(short, [PLAYER]), AURAS: observableCategory(short, [PLAYER]) },
    });
    expect(observed(report.statuses.HEALTH_POTION)).toBe(0);
    expect(report.statuses.COMBAT_POTION).toMatchObject({
      state: "UNKNOWN",
      observedAtLeast: 1,
      reasons: [
        {
          code: "FIGHT_SHORTER_THAN_LONGEST_COMBAT_POTION_BUFF",
          fightDurationMs: 45_000,
          longestBuffMs: 60_000,
        },
      ],
    });
  });

  it("an unmatched buff removal under incomplete coverage is a use with UNRESOLVED timing, never BEFORE_PULL", () => {
    // The cast and application may sit in the gap (90 s → end), so nothing
    // shows the potion was taken before the pull.
    const gap = [inclusiveRange(START, 90_000)];
    for (const categories of [
      { ...complete, CASTS: partialCategory(gap, [PLAYER]) },
      { ...complete, AURAS: partialCategory(gap, [PLAYER]) },
    ]) {
      const report = assess([buff(RECKLESSNESS, 120_000, "REMOVED")], { categories });
      expect(report.statuses.COMBAT_POTION).toMatchObject({ state: "UNKNOWN", observedAtLeast: 1 });
      expect(report.statuses.COMBAT_POTION.uses.map((use) => use.timing)).toEqual(["UNRESOLVED"]);
    }
  });
});

describe("identity limits fail closed", () => {
  const abilities = new Map<number, CombatAbility>([
    [999_001, { gameId: 999_001, name: "Potion of Unknown Futures", school: "1" }],
    [999_002, { gameId: 999_002, name: "Fel Healthstone", school: "1" }],
    [185_311, { gameId: 185_311, name: "Crimson Vial", school: "1" }],
  ]);

  it("an unclassified cast named like a potion makes both potion kinds UNKNOWN, not zero", () => {
    const report = assess([cast(999_001, 50_000)], { abilities });
    expect(codes(report.statuses.HEALTH_POTION)).toEqual(["UNCLASSIFIED_CANDIDATE"]);
    expect(codes(report.statuses.COMBAT_POTION)).toEqual(["UNCLASSIFIED_CANDIDATE"]);
    expect(observed(report.statuses.HEALTHSTONE)).toBe(0);
  });

  it("an unclassified healthstone affects only the healthstone", () => {
    const report = assess([cast(999_002, 50_000)], { abilities });
    expect(codes(report.statuses.HEALTHSTONE)).toEqual(["UNCLASSIFIED_CANDIDATE"]);
    expect(observed(report.statuses.HEALTH_POTION)).toBe(0);
  });

  it("an ordinary class ability is not a candidate", () => {
    const report = assess([cast(185_311, 50_000)], { abilities });
    for (const status of Object.values(report.statuses)) expect(observed(status)).toBe(0);
  });

  it("an unknown pre-pull potion seen only as its buff cannot produce an observed zero", () => {
    // COMPLETE coverage, no cast at all: the buff (unknown to the data, named
    // like a potion) is removed during the fight.
    const report = assess([buff(999_001, 25_000, "REMOVED")], { abilities });
    expect(report.statuses.COMBAT_POTION).toMatchObject({
      state: "UNKNOWN",
      reasons: [
        { code: "UNCLASSIFIED_CANDIDATE", spellId: 999_001, abilityName: "Potion of Unknown Futures" },
      ],
    });
    expect(observed(report.statuses.HEALTH_POTION)).toBe(0);
    expect(observed(report.statuses.HEALTHSTONE)).toBe(0);
    // An unknown buff not named like a potion is not a candidate.
    const vial = assess([buff(185_311, 25_000, "REMOVED")], { abilities });
    expect(observed(vial.statuses.COMBAT_POTION)).toBe(0);
  });

  it("racial abilities never count, even on a consumable-like heal", () => {
    // Gift of the Naaru, Blood Fury, Berserking, Fireblood (pinned racial_spells.inc).
    const report = assess([
      cast(28880, 10_000),
      cast(33697, 11_000),
      cast(26297, 12_000),
      cast(265221, 13_000),
    ]);
    for (const status of Object.values(report.statuses)) expect(observed(status)).toBe(0);
  });

  it("identity data that fails to load makes every kind UNKNOWN", () => {
    const fight = syntheticFight({ startTimeMs: START, endTimeMs: END, events: [], categories: complete });
    const report = assessConsumableStatus(fight, PLAYER, loadPreparationConsumables({}));
    expectAllThree(report);
    expect(report.identityData).toBeNull();
    for (const status of Object.values(report.statuses)) {
      expect(codes(status)).toEqual(["IDENTITY_DATA_UNAVAILABLE"]);
    }
  });
});
