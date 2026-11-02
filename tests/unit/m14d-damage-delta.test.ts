import { beforeAll, describe, expect, it } from "vitest";

import type { CombatActor } from "../../src/engine/normalization/actors.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import type { ComparisonFightInput, PostHocDefinition } from "../../src/comparison-facts/fight-facts.js";
import type { AlignmentInput } from "../../src/comparison-facts/timing-alignment.js";
import type { RaidDamageEntry } from "../../src/wcl/comparison/comparison-tables.js";
import {
  decomposeDamageDeltas,
  observationSentence,
  type DamageDeltaDecomposition,
  type DeltaRow,
} from "../../src/comparison-facts/damage-delta.js";
import { BLOOD_POST_HOC_DEFINITION } from "../../src/specs/deathknight/blood/post-hoc-definition.js";
import { damageEvent, syntheticFight } from "../support/synthetic-fight.js";
import { COMPARISONS, comparisonInput, subjectInput } from "../support/m11/g2-four-fights.js";

/**
 * M14-D factual damage-delta decomposition over the four committed M11-G2
 * fights, plus synthetic fights. No Warcraft Logs request is made.
 */

const BLOOD = BLOOD_POST_HOC_DEFINITION as unknown as PostHocDefinition;

const decomposed = (result: DamageDeltaDecomposition) => {
  if (result.kind !== "DECOMPOSED") throw new Error(`decomposition refused: ${result.reason}`);
  return result;
};
const rowOf = (result: DamageDeltaDecomposition, id: string): DeltaRow => {
  const found = decomposed(result).rows.find((row) => row.rowId === id);
  if (found === undefined) throw new Error(`no row ${id}`);
  return found;
};
const brief = (row: DeltaRow) =>
  row.pairs.map((pair) => ({
    ref: pair.comparisonFightRef,
    comparison: pair.comparison.value,
    absolute: pair.absolute,
    direction: pair.perMinuteDirection,
  }));

/** Causal or prescriptive vocabulary no observation may carry. */
const CAUSAL =
  /\b(fail|failed|failing|should|enough|missed|lost|loss|because|mistake|improve|wrong|ought)\b/i;

// ---------------------------------------------------------------------------
// The committed fights
// ---------------------------------------------------------------------------

let real: AlignmentInput;
let realResult: DamageDeltaDecomposition;
const DRW1 = "COOLDOWN_WINDOW_START:DANCING_RUNE_WEAPON#1";

beforeAll(async () => {
  const comparisons: ComparisonFightInput[] = [];
  for (const fixture of COMPARISONS) comparisons.push(await comparisonInput(fixture));
  real = { subject: await subjectInput(), comparisons };
  realResult = decomposeDamageDeltas(real, BLOOD, [
    { windowId: "FIRST_30S", landmarkId: "PULL", offsets: { fromMs: 0, toMs: 30_000 } },
    { windowId: "DRW1_20S", landmarkId: DRW1, offsets: { fromMs: 0, toMs: 20_000 } },
  ]);
}, 120_000);

const [C246, C116, C261] = ["COHORT246AAAAAAA#33", "COHORT116AAAAAAA#64", "COHORT261AAAAAAA#31"];
const SUBJECT_REF = "b1PmaKrd6CDfzngc#48";

describe("the committed fights: observations only", () => {
  it("declares observation only: no causal claim, no finding effect, no cross-comparison figure, no residual", () => {
    const result = decomposed(realResult);
    expect(result.encounterId).toBe(2900);
    expect(result.subjectFightRef).toBe(SUBJECT_REF);
    expect(result.comparisonFightRefs).toEqual([C246, C116, C261]);
    expect(result.use).toBe("OBSERVATION_ONLY");
    expect(result.causalClaim).toBe("NONE");
    expect(result.findingEffect).toEqual({ suppression: "NONE", confidence: "NONE" });
    expect(result.acrossComparisons).toBe("NOT_COMBINED");
    expect(result.residual).toBe("NOT_COMPUTED");
    expect(result.comparisonCoverage).toBe("AT_LEAST_UNCERTIFIED");
    expect(result.rawAmountMeaning).toBe("NOT_YET_PROVEN");
    for (const row of result.rows)
      expect(row.pairs.map((pair) => pair.comparisonFightRef)).toEqual([C246, C116, C261]);
  });

  it("Warcraft Logs raid-entry totals give EXACT whole-fight deltas, table against table", () => {
    const row = rowOf(realResult, "WHOLE_FIGHT|WCL_TABLE_AMOUNT|TOTAL");
    expect(row.authority).toBe("WCL_RAID_DAMAGE_DONE_TABLE");
    // M11-G4-4: the subject's table total, reconciled to the unit.
    expect(row.subject.value).toEqual({ kind: "EXACT", value: 45_802_009 });
    expect(row.subject.durationMs).toBe(345_177);
    expect(brief(row)).toEqual([
      {
        ref: C246,
        comparison: { kind: "EXACT", value: 59_295_730 },
        absolute: { kind: "EXACT", value: -13_493_721 },
        direction: "SUBJECT_LOWER",
      },
      {
        ref: C116,
        comparison: { kind: "EXACT", value: 58_873_321 },
        absolute: { kind: "EXACT", value: -13_071_312 },
        direction: "SUBJECT_LOWER",
      },
      {
        ref: C261,
        comparison: { kind: "EXACT", value: 62_896_995 },
        absolute: { kind: "EXACT", value: -17_094_986 },
        direction: "SUBJECT_LOWER",
      },
    ]);
  });

  it("the pet sub-actor tree decomposes by kind, keyed by game id, and the table states no focus-only amount", () => {
    expect(
      rowOf(realResult, "WHOLE_FIGHT|WCL_TABLE_AMOUNT|BY_SOURCE:RISEN_GHOUL").pairs.map(
        (p) => p.perMinuteDirection,
      ),
    ).toEqual(["SUBJECT_HIGHER", "SUBJECT_HIGHER", "SUBJECT_HIGHER"]);
    expect(rowOf(realResult, "WHOLE_FIGHT|WCL_TABLE_AMOUNT|BY_SOURCE:RUNE_WEAPON").subject.value).toEqual({
      kind: "EXACT",
      value: 7_344_648,
    });
    expect(rowOf(realResult, "WHOLE_FIGHT|WCL_TABLE_AMOUNT|BY_SOURCE:BLOOD_BEAST").subject.value).toEqual({
      kind: "EXACT",
      value: 1_333_469,
    });
    const focus = rowOf(realResult, "WHOLE_FIGHT|WCL_TABLE_AMOUNT|BY_SOURCE:FOCUS");
    expect(focus.subject.value).toEqual({ kind: "UNKNOWN", reason: "TABLE_STATES_NO_FOCUS_ONLY_AMOUNT" });
    for (const pair of focus.pairs) {
      expect(pair.absolute).toEqual({ kind: "UNKNOWN", reason: "SUBJECT_FIGURE_UNKNOWN" });
      expect(pair.perMinuteDirection).toBe("UNDECIDED");
    }
  });

  it("Warcraft Logs target types are kept verbatim", () => {
    expect(rowOf(realResult, "WHOLE_FIGHT|WCL_TABLE_AMOUNT|BY_WCL_TARGET_TYPE:Boss").subject.value).toEqual({
      kind: "EXACT",
      value: 32_251_561,
    });
    expect(rowOf(realResult, "WHOLE_FIGHT|WCL_TABLE_AMOUNT|BY_WCL_TARGET_TYPE:NPC").subject.value).toEqual({
      kind: "EXACT",
      value: 13_550_448,
    });
  });

  it("per-ability table amounts exist only for the comparisons, so every per-ability table delta is UNKNOWN", () => {
    const rows = decomposed(realResult).rows.filter(
      (row) => row.measure === "WCL_TABLE_AMOUNT" && row.component.dimension === "BY_ABILITY",
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.authority).toBe("WCL_DAMAGE_DONE_TABLE");
      expect(row.subject.value).toEqual({ kind: "UNKNOWN", reason: "NO_PER_ACTOR_TABLE" });
      for (const pair of row.pairs) {
        expect(pair.absolute.kind).toBe("UNKNOWN");
        expect(pair.perMinuteDirection).toBe("UNDECIDED");
      }
    }
  });

  it("event counts against an uncertified capture are bounds: NO_MORE_THAN, never EXACT, never SUBJECT_HIGHER", () => {
    const total = rowOf(realResult, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|TOTAL");
    expect(total.authority).toBe("OBSERVED_DAMAGE_EVENTS");
    expect(total.subject.value).toEqual({ kind: "EXACT", value: 3761 });
    expect(brief(total)).toEqual([
      {
        ref: C246,
        comparison: { kind: "AT_LEAST", value: 4268 },
        absolute: { kind: "NO_MORE_THAN", value: -507 },
        direction: "SUBJECT_LOWER",
      },
      {
        ref: C116,
        comparison: { kind: "AT_LEAST", value: 4700 },
        absolute: { kind: "NO_MORE_THAN", value: -939 },
        direction: "SUBJECT_LOWER",
      },
      {
        ref: C261,
        comparison: { kind: "AT_LEAST", value: 4240 },
        absolute: { kind: "NO_MORE_THAN", value: -479 },
        direction: "SUBJECT_LOWER",
      },
    ]);
    for (const row of decomposed(realResult).rows.filter((entry) => entry.measure === "DAMAGE_EVENT_COUNT")) {
      for (const pair of row.pairs) {
        expect(["NO_MORE_THAN", "UNKNOWN"]).toContain(pair.perMinute.kind);
        expect(pair.perMinuteDirection).not.toBe("SUBJECT_HIGHER");
      }
    }
  });

  it("a bound decides only its own side: fewer events in total but a higher observed rate stays UNDECIDED", () => {
    const boss = rowOf(realResult, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_TARGET_CLASS:BOSS_SUBTYPE");
    const pair = boss.pairs[2];
    expect(pair?.absolute).toEqual({ kind: "NO_MORE_THAN", value: -98 });
    expect(pair?.perMinute.kind).toBe("NO_MORE_THAN");
    expect(pair?.perMinute.kind === "UNKNOWN" ? null : pair?.perMinute.value).toBeGreaterThan(0);
    expect(pair?.perMinuteDirection).toBe("UNDECIDED");
  });

  it("a component the comparison never showed is UNKNOWN for it, never zero", () => {
    const players = rowOf(realResult, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_TARGET_CLASS:PLAYER_TARGET");
    expect(players.pairs[0]?.comparison.value).toEqual({
      kind: "UNKNOWN",
      reason: "NO_INFORMATIVE_LOWER_BOUND",
    });
    expect(players.pairs[0]?.absolute).toEqual({ kind: "UNKNOWN", reason: "COMPARISON_FIGURE_UNKNOWN" });
  });

  it("every raw-amount delta is UNKNOWN (M1), while each fight's raw sum is shown as G2 holds it", () => {
    const rows = decomposed(realResult).rows.filter((row) => row.measure === "RAW_AMOUNT_FIELD_SUM");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const pair of row.pairs) {
        expect(pair.absolute).toEqual({ kind: "UNKNOWN", reason: "RAW_AMOUNT_MEANING_NOT_PROVEN" });
        expect(pair.perMinute).toEqual({ kind: "UNKNOWN", reason: "RAW_AMOUNT_MEANING_NOT_PROVEN" });
        expect(pair.perMinuteDirection).toBe("UNDECIDED");
      }
    }
    const total = rowOf(realResult, "WHOLE_FIGHT|RAW_AMOUNT_FIELD_SUM|TOTAL");
    expect(total.subject.rawAmountFieldSum?.kind).toBe("EXACT");
    for (const pair of total.pairs)
      expect(pair.comparison.value).toEqual({ kind: "UNKNOWN", reason: "FIELD_DOMAIN_NOT_PROVEN" });
  });

  it("only the subject's component list is EXHAUSTIVE", () => {
    const whole = decomposed(realResult).windows[0];
    expect(whole?.componentLists).toEqual([
      { fightRef: SUBJECT_REF, claim: "EXHAUSTIVE" },
      { fightRef: C246, claim: "OBSERVED_ONLY" },
      { fightRef: C116, claim: "OBSERVED_ONLY" },
      { fightRef: C261, claim: "OBSERVED_ONLY" },
    ]);
  });

  it("aligned windows: the pull places every fight; a bound anchor places no comparison window", () => {
    const result = decomposed(realResult);
    expect(result.windows.map((window) => window.windowId)).toEqual(["WHOLE_FIGHT", "FIRST_30S", "DRW1_20S"]);
    expect(rowOf(realResult, "FIRST_30S|DAMAGE_EVENT_COUNT|TOTAL").subject.value).toEqual({
      kind: "EXACT",
      value: 366,
    });
    const drw = result.windows[2];
    expect(drw?.slices.map((slice) => slice.kind)).toEqual(["SLICED", "UNKNOWN", "UNKNOWN", "UNKNOWN"]);
    for (const slice of drw?.slices.slice(1) ?? [])
      expect(slice).toMatchObject({ kind: "UNKNOWN", reason: "ANCHOR_NOT_EXACT" });
    for (const row of result.rows.filter((entry) => entry.windowId === "DRW1_20S")) {
      for (const pair of row.pairs) {
        expect(pair.comparison.value).toEqual({ kind: "UNKNOWN", reason: "ANCHOR_NOT_EXACT" });
        expect(pair.perMinuteDirection).toBe("UNDECIDED");
      }
    }
    // No table surface exists for an aligned moment.
    expect(
      result.rows.some((row) => row.windowId !== "WHOLE_FIGHT" && row.measure === "WCL_TABLE_AMOUNT"),
    ).toBe(false);
  });

  it("sentences state a proven difference in a figure and nothing causal", () => {
    const total = rowOf(realResult, "WHOLE_FIGHT|WCL_TABLE_AMOUNT|TOTAL");
    expect(observationSentence(total, total.pairs[0]!, "the subject fight")).toBe(
      `Total Warcraft Logs table damage per minute was lower in the subject fight than in ${C246}.`,
    );
    let sentences = 0;
    for (const row of decomposed(realResult).rows) {
      for (const pair of row.pairs) {
        const sentence = observationSentence(row, pair, "S");
        if (pair.perMinuteDirection === "UNDECIDED") expect(sentence).toBeNull();
        else {
          sentences += 1;
          expect(sentence).not.toMatch(CAUSAL);
        }
      }
    }
    expect(sentences).toBeGreaterThan(0);
  });

  it("is deterministic over the committed bytes", () => {
    const again = decomposeDamageDeltas(real, BLOOD, [
      { windowId: "FIRST_30S", landmarkId: "PULL", offsets: { fromMs: 0, toMs: 30_000 } },
      { windowId: "DRW1_20S", landmarkId: DRW1, offsets: { fromMs: 0, toMs: 20_000 } },
    ]);
    expect(JSON.stringify(again)).toBe(JSON.stringify(realResult));
  });
});

// ---------------------------------------------------------------------------
// Synthetic fights
// ---------------------------------------------------------------------------

const FOCUS = 5;
const BOSS = 50;
const ADD = 51;
const PET_GAME_ID = 7777;
const RUPTURE = 1943;
const SYNTHETIC: PostHocDefinition = {
  specId: "synthetic/spec",
  cooldownWindows: [],
  subActorKinds: [{ kind: "SYNTHETIC_PET", gameIds: [PET_GAME_ID] }],
};

const actor = (actorId: number, fields: Partial<CombatActor>): [number, CombatActor] => [
  actorId,
  {
    actorId,
    gameId: null,
    name: null,
    server: null,
    actorType: "NPC",
    rawType: "NPC",
    subType: null,
    petOwnerActorId: null,
    ...fields,
  },
];

/** A fight whose pet has a report-local `petActorId`: kinds are keyed by game id, never actor id. */
function input(
  fightRef: string,
  options: {
    petActorId?: number;
    events?: (pet: number) => CombatEvent[];
    endTimeMs?: number;
    uncertified?: boolean;
    enemyListed?: boolean;
    raidEntry?: Omit<RaidDamageEntry, "actorId" | "itemLevel">;
    logVersion?: number;
    encounterId?: number;
  } = {},
): ComparisonFightInput {
  const pet = options.petActorId ?? 60;
  const actors = new Map<number, CombatActor>([
    actor(FOCUS, { actorType: "PLAYER", rawType: "Rogue" }),
    actor(BOSS, { subType: "Boss", gameId: 9000 }),
    actor(ADD, { gameId: 9001 }),
    actor(pet, { actorType: "PET", rawType: "Pet", gameId: PET_GAME_ID, petOwnerActorId: FOCUS }),
  ]);
  const base = syntheticFight({
    focusActorId: FOCUS,
    actors,
    events: options.events?.(pet) ?? [],
    endTimeMs: options.endTimeMs ?? 5000,
    finality: "COMPLETED",
    observedCategories: ["DAMAGE", "CASTS", "AURAS", "ACTORS"],
  });
  return {
    fightRef,
    fight: {
      ...base,
      data: { ...base.data, logVersion: options.logVersion ?? 17 },
      fight: { ...base.fight, difficulty: 5, encounterId: options.encounterId ?? 3000 },
    },
    focusActorId: FOCUS,
    basis:
      options.uncertified === true
        ? { kind: "UNCERTIFIED_FILTERED_CAPTURE", reason: "synthetic" }
        : { kind: "COVERAGE_VOUCHED" },
    enemyNpcs:
      options.enemyListed === true
        ? { kind: "RETRIEVED", actorIds: new Set([BOSS, ADD]) }
        : { kind: "NOT_RETRIEVED", reason: "synthetic" },
    enemyEntries: null,
    wcl: {
      raidEntry:
        options.raidEntry === undefined ? null : { actorId: FOCUS, itemLevel: null, ...options.raidEntry },
      raidTotalTimeMs: options.raidEntry === undefined ? null : (options.endTimeMs ?? 5000) - 1000,
      tables: null,
    },
  };
}

let ordinal = 0;
const hit = (at: number, source: number, target: number, ability: number, amount = 100) =>
  damageEvent({
    ordinal: (ordinal += 1),
    reportTimeMs: at,
    sourceActorId: source,
    sourceInstanceId: 0,
    targetActorId: target,
    targetInstanceId: 0,
    abilityGameId: ability,
    amount,
  });
const hits = (count: number, source: number, target: number, ability: number) =>
  Array.from({ length: count }, (_, index) => hit(1100 + index * 10, source, target, ability));

describe("synthetic: what an EXACT delta and its wording look like", () => {
  const result = () =>
    decomposeDamageDeltas(
      {
        subject: input("S", { events: (pet) => [...hits(3, FOCUS, BOSS, RUPTURE), ...hits(2, pet, ADD, 1)] }),
        comparisons: [
          input("C1", {
            petActorId: 61,
            events: (pet) => [...hits(6, FOCUS, BOSS, RUPTURE), ...hits(2, pet, ADD, 1)],
          }),
        ],
      },
      SYNTHETIC,
    );

  it("both sides COMPLETE: EXACT deltas and proven directions", () => {
    const rupture = rowOf(result(), "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:1943");
    expect(rupture.pairs[0]).toMatchObject({
      absolute: { kind: "EXACT", value: -3 },
      perMinute: { kind: "EXACT", value: -45 },
      perMinuteDirection: "SUBJECT_LOWER",
    });
    // The pets have different report-local actor ids but one game id: one component.
    const pet = rowOf(result(), "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_SOURCE:SYNTHETIC_PET");
    expect(pet.pairs[0]).toMatchObject({
      absolute: { kind: "EXACT", value: 0 },
      perMinuteDirection: "EQUAL",
    });
  });

  it("the allowed sentence: a figure was lower, nothing about casting or failing", () => {
    const rupture = rowOf(result(), "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:1943");
    const sentence = observationSentence(rupture, rupture.pairs[0]!, "S", new Map([[RUPTURE, "Rupture"]]));
    expect(sentence).toBe("Rupture damage events per minute were lower in S than in C1.");
    expect(sentence).not.toMatch(CAUSAL);
  });

  it("the raw-amount delta stays UNKNOWN even when both raw sums are EXACT (M1)", () => {
    const raw = rowOf(result(), "WHOLE_FIGHT|RAW_AMOUNT_FIELD_SUM|TOTAL");
    expect(raw.subject.value).toEqual({ kind: "EXACT", value: 500 });
    expect(raw.pairs[0]?.comparison.value).toEqual({ kind: "EXACT", value: 800 });
    expect(raw.pairs[0]?.absolute).toEqual({ kind: "UNKNOWN", reason: "RAW_AMOUNT_MEANING_NOT_PROVEN" });
    expect(observationSentence(raw, raw.pairs[0]!, "S")).toBeNull();
  });

  it("a component absent from a COMPLETE fight is an EXACT zero; from an uncertified capture it is UNKNOWN", () => {
    const subject = input("S", { events: () => hits(3, FOCUS, BOSS, RUPTURE) });
    const complete = decomposeDamageDeltas(
      { subject, comparisons: [input("C1", { events: () => hits(3, FOCUS, BOSS, 2) })] },
      SYNTHETIC,
    );
    expect(rowOf(complete, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:1943").pairs[0]).toMatchObject({
      comparison: { value: { kind: "EXACT", value: 0 } },
      absolute: { kind: "EXACT", value: 3 },
      perMinuteDirection: "SUBJECT_HIGHER",
    });
    const uncertified = decomposeDamageDeltas(
      { subject, comparisons: [input("C1", { uncertified: true, events: () => hits(3, FOCUS, BOSS, 2) })] },
      SYNTHETIC,
    );
    expect(rowOf(uncertified, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:1943").pairs[0]).toMatchObject(
      {
        comparison: { value: { kind: "UNKNOWN", reason: "NO_INFORMATIVE_LOWER_BOUND" } },
        absolute: { kind: "UNKNOWN", reason: "COMPARISON_FIGURE_UNKNOWN" },
        perMinuteDirection: "UNDECIDED",
      },
    );
  });

  it("equal rates over different durations are EQUAL, decided in integer arithmetic", () => {
    const equal = decomposeDamageDeltas(
      {
        subject: input("S", { endTimeMs: 4000, events: () => hits(3, FOCUS, BOSS, RUPTURE) }),
        comparisons: [input("C1", { endTimeMs: 7000, events: () => hits(6, FOCUS, BOSS, RUPTURE) })],
      },
      SYNTHETIC,
    );
    expect(rowOf(equal, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|TOTAL").pairs[0]).toMatchObject({
      absolute: { kind: "EXACT", value: -3 },
      perMinuteDirection: "EQUAL",
    });
  });

  it("target classes mean the same thing whether or not a fight's enemy list is held", () => {
    const merged = decomposeDamageDeltas(
      {
        subject: input("S", { events: () => hits(2, FOCUS, ADD, RUPTURE) }),
        comparisons: [input("C1", { enemyListed: true, events: () => hits(2, FOCUS, ADD, RUPTURE) })],
      },
      SYNTHETIC,
    );
    expect(
      rowOf(merged, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_TARGET_CLASS:NON_BOSS_NPC").pairs[0],
    ).toMatchObject({
      absolute: { kind: "EXACT", value: 0 },
      perMinuteDirection: "EQUAL",
    });
  });
});

describe("synthetic: Warcraft Logs table amounts", () => {
  const entry = (total: number, pets: { actorId: number; total: number }[]) => ({
    total,
    pets,
    targetTypes: [{ type: "Boss", total }],
  });

  it("a pet a table does not list is NOT_LISTED_IN_TABLE, never zero", () => {
    const result = decomposeDamageDeltas(
      {
        subject: input("S", { raidEntry: entry(1000, [{ actorId: 60, total: 200 }]) }),
        comparisons: [input("C1", { raidEntry: entry(1500, []) })],
      },
      SYNTHETIC,
    );
    const pet = rowOf(result, "WHOLE_FIGHT|WCL_TABLE_AMOUNT|BY_SOURCE:SYNTHETIC_PET");
    expect(pet.pairs[0]?.comparison.value).toEqual({ kind: "UNKNOWN", reason: "NOT_LISTED_IN_TABLE" });
    expect(pet.pairs[0]?.perMinuteDirection).toBe("UNDECIDED");
    expect(rowOf(result, "WHOLE_FIGHT|WCL_TABLE_AMOUNT|TOTAL").pairs[0]).toMatchObject({
      absolute: { kind: "EXACT", value: -500 },
      perMinuteDirection: "SUBJECT_LOWER",
    });
  });

  it("tables read under different log versions are never subtracted", () => {
    const result = decomposeDamageDeltas(
      {
        subject: input("S", { raidEntry: entry(1000, []) }),
        comparisons: [input("C1", { logVersion: 18, raidEntry: entry(1500, []) })],
      },
      SYNTHETIC,
    );
    expect(rowOf(result, "WHOLE_FIGHT|WCL_TABLE_AMOUNT|TOTAL").pairs[0]).toMatchObject({
      absolute: { kind: "UNKNOWN", reason: "LOG_VERSION_DIFFERS" },
      perMinuteDirection: "UNDECIDED",
    });
  });

  it("no raid entry: the table figure is UNKNOWN, never zero", () => {
    const result = decomposeDamageDeltas(
      { subject: input("S", { raidEntry: entry(1000, []) }), comparisons: [input("C1")] },
      SYNTHETIC,
    );
    expect(rowOf(result, "WHOLE_FIGHT|WCL_TABLE_AMOUNT|TOTAL").pairs[0]?.comparison.value).toEqual({
      kind: "UNKNOWN",
      reason: "NO_RAID_ENTRY",
    });
  });
});

describe("synthetic: windows and refusals", () => {
  const pair = () => ({ subject: input("S"), comparisons: [input("C1")] });

  it("an aligned window outside the recorded fight is UNKNOWN, never clipped", () => {
    const result = decomposed(
      decomposeDamageDeltas(pair(), SYNTHETIC, [
        { windowId: "LATE", landmarkId: "PULL", offsets: { fromMs: 3000, toMs: 9000 } },
      ]),
    );
    expect(result.windows[1]?.slices).toEqual([
      { fightRef: "S", kind: "UNKNOWN", reason: "WINDOW_OUTSIDE_RECORDED_FIGHT" },
      { fightRef: "C1", kind: "UNKNOWN", reason: "WINDOW_OUTSIDE_RECORDED_FIGHT" },
    ]);
  });

  it.each([
    [
      [{ windowId: "WHOLE_FIGHT", landmarkId: "PULL", offsets: { fromMs: 0, toMs: 10 } }],
      "RESERVED_WINDOW_ID",
    ],
    [
      [
        { windowId: "A", landmarkId: "PULL", offsets: { fromMs: 0, toMs: 10 } },
        { windowId: "A", landmarkId: "PULL", offsets: { fromMs: 0, toMs: 20 } },
      ],
      "DUPLICATE_WINDOW_ID",
    ],
    [[{ windowId: "A", landmarkId: "NO_SUCH", offsets: { fromMs: 0, toMs: 10 } }], "UNKNOWN_LANDMARK"],
    [[{ windowId: "A", landmarkId: "PULL", offsets: { fromMs: 10, toMs: 10 } }], "INVALID_OFFSETS"],
  ] as const)("refuses %j with %s", (windows, reason) => {
    expect(decomposeDamageDeltas(pair(), SYNTHETIC, windows)).toEqual({ kind: "REFUSED", reason });
  });

  it("refuses fights of different encounters", () => {
    expect(
      decomposeDamageDeltas(
        { subject: input("S"), comparisons: [input("C1", { encounterId: 1 })] },
        SYNTHETIC,
      ),
    ).toEqual({ kind: "REFUSED", reason: "ALIGNMENT_REFUSED" });
  });
});
