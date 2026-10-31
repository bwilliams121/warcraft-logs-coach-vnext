/**
 * M12-A: death timelines (src/healing/death-timeline.ts).
 *
 * The negative cases matter most:
 * - missing or out-of-scope healing evidence never becomes "no healing was
 *   received": the category is UNKNOWN, never a complete empty list;
 * - nothing after the death is read, and nothing at the death's millisecond
 *   is claimed to have preceded it;
 * - a snapshot of any other actor or instance is never the dying
 *   actor's health;
 * - no total is computed from raw amounts (follow-up M1).
 *
 * Raw shapes are the audited fight-48 shapes (report b1PmaKrd6CDfzngc); the
 * last block reads the committed real death itself.
 */

import { describe, expect, it } from "vitest";

import { inclusiveRange } from "../../../src/engine/evidence/coverage.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import { createNormalizer } from "../../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../../src/engine/normalization/supported-families.js";
import type { CategoryEvidence } from "../../../src/engine/normalization/completeness.js";
import {
  DEATH_TIMELINE_REVISION,
  DEFAULT_DEATH_TIMELINE_LOOKBACK_MS,
  deathTimelinesOf,
  type DeathTimelineEntry,
} from "../../../src/healing/death-timeline.js";
import type { EvidenceCategory } from "../../../src/wcl/evidence-capability.js";
import { corpusFight } from "../../support/corpus/fight.js";
import {
  observableCategory,
  partialCategory,
  syntheticFight,
  UNVERIFIED_CATEGORY,
} from "../../support/synthetic-fight.js";

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 100_000;
const WARRIOR = 5;
const BOSS = 161;
const HEALER = 9;
const OTHER = 7;

function fightOf(
  raw: readonly Raw[],
  categories: Partial<Record<EvidenceCategory, CategoryEvidence>> = everyCategoryComplete(),
): CombatFight {
  const normalizer = createNormalizer({
    fightStartTimeMs: START,
    requestedRange: inclusiveRange(START, END),
    contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: START,
    nextPageTimestamp: null,
    events: raw,
  });
  const output = normalizer.finish();
  return syntheticFight({
    events: output.events,
    malformedObservations: output.malformedObservations,
    startTimeMs: START,
    endTimeMs: END,
    categories,
  });
}

function everyCategoryComplete(
  scope: readonly number[] | null = null,
): Partial<Record<EvidenceCategory, CategoryEvidence>> {
  const whole = inclusiveRange(START, END);
  return {
    DAMAGE: observableCategory(whole, scope),
    HEALING: observableCategory(whole, scope),
    ABSORBS: observableCategory(whole, scope),
  };
}

/** The audited shapes: target-side snapshot (resourceActor 2) of the target. */
const snapshot = (hitPoints: number, side: 1 | 2 = 2): Raw => ({
  resourceActor: side,
  classResources: [{ amount: 1300, max: 1300, type: 1 }],
  hitPoints,
  maxHitPoints: 1_053_852,
  attackPower: 4015,
  spellPower: 434,
  armor: 2661,
  absorb: 0,
  x: 29867,
  y: 42209,
  facing: -387,
  mapID: 2608,
  versatility: 300,
  avoidance: 0,
  itemLevel: 328,
});
const damage = (timestamp: number, target: number, amount: number, extra: Raw = {}): Raw => ({
  timestamp,
  type: "damage",
  sourceID: target === WARRIOR ? BOSS : WARRIOR,
  targetID: target,
  abilityGameID: 1284561,
  fight: 48,
  hitType: 1,
  amount,
  mitigated: 100,
  unmitigatedAmount: amount + 100,
  isAoE: true,
  ...extra,
});
const heal = (timestamp: number, source: number, target: number, amount: number, extra: Raw = {}): Raw => ({
  timestamp,
  type: "heal",
  sourceID: source,
  targetID: target,
  abilityGameID: 425804,
  fight: 48,
  hitType: 2,
  amount,
  ...extra,
});
const absorbed = (timestamp: number, target: number, amount: number): Raw => ({
  timestamp,
  type: "absorbed",
  sourceID: 1,
  targetID: target,
  abilityGameID: 1245369,
  fight: 48,
  attackerID: BOSS,
  amount,
  extraAbilityGameID: 1285979,
});
const death = (timestamp: number, target: number, extra: Raw = {}): Raw => ({
  timestamp,
  type: "death",
  sourceID: -1,
  targetID: target,
  abilityGameID: 0,
  fight: 48,
  ...extra,
});

const DEATH_AT = 20_000;
const SCENARIO: readonly Raw[] = [
  damage(9_000, WARRIOR, 500, snapshot(900_000)), // before the 10 s window
  damage(12_000, WARRIOR, 30_000, { tick: false, ...snapshot(600_000) }),
  heal(15_000, HEALER, WARRIOR, 31_746, { overheal: 1_000, ...snapshot(640_000) }),
  absorbed(16_000, WARRIOR, 19_561),
  damage(17_000, BOSS, 99_999), // dealt BY the warrior: not something that happened to it
  heal(17_500, WARRIOR, OTHER, 5_000), // given BY the warrior
  damage(19_000, WARRIOR, 193_241, { overkill: 81_824, tick: true, ...snapshot(0) }),
  death(DEATH_AT, WARRIOR, { killerID: BOSS, killingAbilityGameID: 1295173 }),
  heal(DEATH_AT, HEALER, WARRIOR, 2_807), // same millisecond as the death
  damage(21_000, WARRIOR, 12_000, snapshot(0)), // after the death: never read
];

const kinds = (entries: readonly DeathTimelineEntry[]) =>
  entries.map((entry) => [entry.reportTimeMs, entry.kind]);

describe("a timeline is what happened TO the actor before its death, and nothing else", () => {
  const report = deathTimelinesOf(fightOf(SCENARIO), WARRIOR);
  const [timeline] = report.timelines;

  it("carries its revision, observed-fact authority, and positive-only semantics", () => {
    expect(report.revision).toBe(DEATH_TIMELINE_REVISION);
    expect(report.authority).toBe("WCL_OBSERVED_FACT");
    expect(report.absenceSemantics).toBe("NONE");
    expect(report.lookbackMs).toBe(DEFAULT_DEATH_TIMELINE_LOOKBACK_MS);
    expect(report.timelines).toHaveLength(1);
  });

  it("keeps the reported killer and killing ability, never inferring them", () => {
    expect(timeline?.death.reportTimeMs).toBe(DEATH_AT);
    expect(timeline?.death.killer).toEqual({ actorId: BOSS, instanceId: null });
    expect(timeline?.death.killingAbilityGameId).toBe(1295173);
  });

  it("keeps only events targeting the actor inside [death - lookback, death]", () => {
    expect(timeline?.window).toEqual({ fromReportTimeMs: 10_000, toReportTimeMs: DEATH_AT, clampedBy: null });
    expect(kinds(timeline?.entries ?? [])).toEqual([
      [12_000, "DAMAGE_TAKEN"],
      [15_000, "HEALING_RECEIVED"],
      [16_000, "DAMAGE_ABSORBED"],
      [19_000, "DAMAGE_TAKEN"],
      [DEATH_AT, "HEALING_RECEIVED"],
    ]);
  });

  it("marks an entry at the death's millisecond: whether it came first is not known", () => {
    expect(timeline?.entries.map((entry) => entry.atDeathTime)).toEqual([false, false, false, false, true]);
  });

  it("keeps the raw fields verbatim and the dying actor's own health snapshot", () => {
    const blow = timeline?.entries[3];
    expect(blow?.kind).toBe("DAMAGE_TAKEN");
    if (blow?.kind !== "DAMAGE_TAKEN") return;
    expect(blow.raw.amount).toBe(193_241);
    expect(blow.raw.overkillAmount).toBe(81_824);
    expect(blow.actorHealth).toEqual({ side: "TARGET", hitPoints: 0, maxHitPoints: 1_053_852 });
    expect(blow.source).toEqual({ actorId: BOSS, instanceId: null });

    const received = timeline?.entries[1];
    if (received?.kind !== "HEALING_RECEIVED") throw new Error("expected a heal");
    expect(received.raw).toMatchObject({ amount: 31_746, overhealAmount: 1_000 });
    expect(received.source).toEqual({ actorId: HEALER, instanceId: null });

    const shield = timeline?.entries[2];
    if (shield?.kind !== "DAMAGE_ABSORBED") throw new Error("expected an absorb");
    expect(shield.raw).toEqual({ amount: 19_561, absorbedAbilityGameId: 1285979, attributedActorId: BOSS });
    expect(shield.actorHealth).toBeNull();
  });

  it("is COMPLETE per category only because each category is covered for the actor over the window", () => {
    expect(timeline?.coverage).toEqual({
      DAMAGE: { state: "COMPLETE" },
      HEALING: { state: "COMPLETE" },
      ABSORBS: { state: "COMPLETE" },
    });
  });

  it("keeps the raw tick state: an absent key is NOT_SUPPLIED, never false (M11-E1)", () => {
    const raw = [damage(15_000, WARRIOR, 1_000), ...SCENARIO];
    const [only] = deathTimelinesOf(fightOf(raw), WARRIOR).timelines;
    const ticks = (only?.entries ?? []).flatMap((entry) =>
      entry.kind === "DAMAGE_TAKEN" ? [[entry.reportTimeMs, entry.raw.tickField]] : [],
    );
    expect(ticks).toEqual([
      [12_000, "FALSE"],
      [15_000, "NOT_SUPPLIED"],
      [19_000, "TRUE"],
    ]);
    // Healing keeps no tick at all: its decoder holds only the collapsed boolean.
    const healed = only?.entries.find((entry) => entry.kind === "HEALING_RECEIVED");
    expect(healed === undefined ? [] : Object.keys(healed.raw)).not.toContain("isTick");
    expect(healed === undefined ? [] : Object.keys(healed.raw)).not.toContain("tickField");
  });

  it("computes no total from raw amounts (follow-up M1)", () => {
    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
          keys.add(key);
          walk(inner);
        }
      }
    };
    walk(report);
    for (const key of keys) expect(key, key).not.toMatch(/total|sum|effective|dps|hps/i);
  });
});

describe("missing evidence is UNKNOWN, never an empty complete list", () => {
  it("a healing gap inside the window makes HEALING UNKNOWN, and the observed heals stay", () => {
    const categories = {
      ...everyCategoryComplete(),
      HEALING: partialCategory([inclusiveRange(START, 13_000), inclusiveRange(16_000, END)]),
    };
    const [timeline] = deathTimelinesOf(fightOf(SCENARIO, categories), WARRIOR).timelines;
    expect(timeline?.coverage.HEALING).toEqual({ state: "UNKNOWN", reason: "INSUFFICIENT_COVERAGE" });
    expect(timeline?.coverage.DAMAGE).toEqual({ state: "COMPLETE" });
    expect(timeline?.entries.filter((entry) => entry.kind === "HEALING_RECEIVED")).toHaveLength(2);
  });

  it("an ally outside the evidence's actor scope is INSUFFICIENT_SCOPE in every category", () => {
    // PLAYER_CONTEXT for another focus player: the Warrior's bytes may be present, but nothing vouches for them.
    const [timeline] = deathTimelinesOf(fightOf(SCENARIO, everyCategoryComplete([OTHER])), WARRIOR).timelines;
    expect(timeline?.coverage).toEqual({
      DAMAGE: { state: "UNKNOWN", reason: "INSUFFICIENT_SCOPE" },
      HEALING: { state: "UNKNOWN", reason: "INSUFFICIENT_SCOPE" },
      ABSORBS: { state: "UNKNOWN", reason: "INSUFFICIENT_SCOPE" },
    });
    expect(timeline?.entries).toHaveLength(5);
  });

  it("an unverified category is CAPABILITY_UNVERIFIED, even with no events at all", () => {
    const categories = { ...everyCategoryComplete(), ABSORBS: UNVERIFIED_CATEGORY };
    const raw = [damage(15_000, WARRIOR, 1_000), death(DEATH_AT, WARRIOR)];
    const [timeline] = deathTimelinesOf(fightOf(raw, categories), WARRIOR).timelines;
    expect(timeline?.coverage.ABSORBS).toEqual({ state: "UNKNOWN", reason: "CAPABILITY_UNVERIFIED" });
    // HEALING is COMPLETE with no heal: that, and only that, is an observed "none retrieved".
    expect(timeline?.coverage.HEALING).toEqual({ state: "COMPLETE" });
    expect(kinds(timeline?.entries ?? [])).toEqual([[15_000, "DAMAGE_TAKEN"]]);
  });
});

describe("windows, instances and snapshots", () => {
  it("is clamped at the fight start", () => {
    const raw = [damage(2_000, WARRIOR, 1_000), death(4_000, WARRIOR)];
    const [timeline] = deathTimelinesOf(fightOf(raw), WARRIOR).timelines;
    expect(timeline?.window).toEqual({
      fromReportTimeMs: START,
      toReportTimeMs: 4_000,
      clampedBy: "FIGHT_START",
    });
  });

  it("never reaches back past the actor's previous death: those events belong to that timeline", () => {
    const raw = [
      damage(30_000, WARRIOR, 1_000),
      death(31_000, WARRIOR),
      heal(33_000, HEALER, WARRIOR, 50_000), // after the first death, before the second
      death(36_000, WARRIOR),
    ];
    const report = deathTimelinesOf(fightOf(raw), WARRIOR);
    expect(report.timelines.map((timeline) => timeline.window)).toEqual([
      { fromReportTimeMs: 21_000, toReportTimeMs: 31_000, clampedBy: null },
      { fromReportTimeMs: 31_001, toReportTimeMs: 36_000, clampedBy: "PREVIOUS_DEATH" },
    ]);
    expect(report.timelines.map((timeline) => kinds(timeline.entries))).toEqual([
      [[30_000, "DAMAGE_TAKEN"]],
      [[33_000, "HEALING_RECEIVED"]],
    ]);
  });

  it("keys on the actor instance: instance 4's events are not instance 3's timeline", () => {
    const raw = [
      { ...damage(15_000, 180, 1_000), sourceID: WARRIOR, targetInstance: 3 },
      { ...damage(16_000, 180, 2_000), sourceID: WARRIOR, targetInstance: 4 },
      { ...death(DEATH_AT, 180), targetInstance: 3 },
    ];
    const report = deathTimelinesOf(fightOf(raw), 180);
    expect(report.timelines).toHaveLength(1);
    expect(report.timelines[0]?.death.actor).toEqual({ actorId: 180, instanceId: 3 });
    expect(kinds(report.timelines[0]?.entries ?? [])).toEqual([[15_000, "DAMAGE_TAKEN"]]);
  });

  it("keeps a heal absorb on the actor with its reported source, absorbed heal and healer", () => {
    // The audited fight-48 shape: source and target are the absorbed actor,
    // healerID the healer whose heal was absorbed, extraAbilityGameID that heal.
    const raw = [
      {
        timestamp: 15_000,
        type: "healabsorbed",
        sourceID: WARRIOR,
        targetID: WARRIOR,
        abilityGameID: 448005,
        fight: 48,
        healerID: HEALER,
        amount: 11_717,
        extraAbilityGameID: 139,
      },
      death(DEATH_AT, WARRIOR),
    ];
    const [timeline] = deathTimelinesOf(fightOf(raw), WARRIOR).timelines;
    expect(timeline?.entries).toHaveLength(1);
    const [entry] = timeline?.entries ?? [];
    expect(entry?.kind).toBe("HEAL_ABSORBED");
    if (entry?.kind !== "HEAL_ABSORBED") return;
    expect(entry.source).toEqual({ actorId: WARRIOR, instanceId: null });
    expect(entry.abilityGameId).toBe(448005);
    expect(entry.raw).toEqual({ amount: 11_717, absorbedAbilityGameId: 139, attributedActorId: HEALER });
    expect(timeline?.coverage.ABSORBS).toEqual({ state: "COMPLETE" });
  });

  it("never reads another actor's snapshot as the dying actor's health", () => {
    // resourceActor 1 on boss damage is the BOSS's health: handing it to the Warrior is the M10-B failure.
    const raw = [damage(15_000, WARRIOR, 1_000, snapshot(777, 1)), death(DEATH_AT, WARRIOR)];
    const [timeline] = deathTimelinesOf(fightOf(raw), WARRIOR).timelines;
    expect(timeline?.entries[0]?.actorHealth).toBeNull();
  });

  it("reads a SOURCE-side snapshot only when the dying actor is that source (its own heal)", () => {
    const raw = [heal(15_000, WARRIOR, WARRIOR, 4_000, snapshot(250_000, 1)), death(DEATH_AT, WARRIOR)];
    const [timeline] = deathTimelinesOf(fightOf(raw), WARRIOR).timelines;
    expect(timeline?.entries[0]?.actorHealth).toEqual({
      side: "SOURCE",
      hitPoints: 250_000,
      maxHitPoints: 1_053_852,
    });
  });

  it("has no timeline, and claims nothing, for an actor with no observed death", () => {
    const report = deathTimelinesOf(fightOf([damage(15_000, WARRIOR, 1_000)]), WARRIOR);
    expect(report.timelines).toEqual([]);
    expect(report.absenceSemantics).toBe("NONE");
  });

  it("refuses a lookback that is not a non-negative integer", () => {
    const fight = fightOf(SCENARIO);
    expect(() => deathTimelinesOf(fight, WARRIOR, -1)).toThrow(RangeError);
    expect(() => deathTimelinesOf(fight, WARRIOR, 1.5)).toThrow(RangeError);
  });
});

describe("the real death in the regression corpus (b1PmaKrd6CDfzngc fight 48, actor 5)", () => {
  const ARTIFACT = "wcl-b1pm-fight-48-warrior-5-death-5s";
  const REAL_DEATH = 7_749_235;
  const report = deathTimelinesOf(corpusFight(ARTIFACT), WARRIOR, 5_000);
  const [timeline] = report.timelines;
  const entries = timeline?.entries ?? [];

  it("finds the one death, with Warcraft Logs' own killer and killing ability", () => {
    expect(report.timelines).toHaveLength(1);
    expect(timeline?.death.actor).toEqual({ actorId: WARRIOR, instanceId: null });
    expect(timeline?.death.reportTimeMs).toBe(REAL_DEATH);
    expect(timeline?.death.killer).toEqual({ actorId: BOSS, instanceId: null });
    expect(timeline?.death.killingAbilityGameId).toBe(1295173);
  });

  it("is COMPLETE in all three categories under the slice's grant for actor 5", () => {
    expect(timeline?.coverage).toEqual({
      DAMAGE: { state: "COMPLETE" },
      HEALING: { state: "COMPLETE" },
      ABSORBS: { state: "COMPLETE" },
    });
  });

  it("lists what happened to the Warrior, not what it did", () => {
    const count = (kind: DeathTimelineEntry["kind"]) => entries.filter((entry) => entry.kind === kind).length;
    expect([
      count("DAMAGE_TAKEN"),
      count("HEALING_RECEIVED"),
      count("DAMAGE_ABSORBED"),
      count("HEAL_ABSORBED"),
    ]).toEqual([13, 38, 3, 0]);
    expect(entries.every((entry) => entry.reportTimeMs <= REAL_DEATH)).toBe(true);
  });

  it("keeps six damage events without a tick key as NOT_SUPPLIED, not false", () => {
    const states: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.kind !== "DAMAGE_TAKEN") continue;
      states[entry.raw.tickField] = (states[entry.raw.tickField] ?? 0) + 1;
    }
    expect(states).toEqual({ NOT_SUPPLIED: 6, TRUE: 7 });
  });

  it("ends with the killing blow: raw overkill, and a target snapshot of zero hit points", () => {
    const blows = entries.filter((entry) => entry.kind === "DAMAGE_TAKEN" && entry.atDeathTime);
    expect(blows).toHaveLength(1);
    const [blow] = blows;
    if (blow?.kind !== "DAMAGE_TAKEN") throw new Error("expected the killing blow");
    expect(blow.abilityGameId).toBe(1295173);
    expect(blow.raw.amount).toBe(193_241);
    expect(blow.raw.overkillAmount).toBe(81_824);
    expect(blow.actorHealth).toEqual({ side: "TARGET", hitPoints: 0, maxHitPoints: 1_053_852 });
  });

  it("keeps every reported heal source, the Warrior's own heals included", () => {
    // Self-healing is healing received too; the timeline keeps it as reported, by count per source.
    const bySource: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.kind !== "HEALING_RECEIVED") continue;
      const key = String(entry.source?.actorId ?? "none");
      bySource[key] = (bySource[key] ?? 0) + 1;
    }
    expect(bySource).toEqual({ "1": 3, "2": 7, "3": 2, "5": 14, "9": 9, "122": 2, "129": 1 });
  });
});
