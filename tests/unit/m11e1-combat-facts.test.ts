/**
 * M11-E1: observed combat facts — evidence only.
 *
 * The substrate answers "what did the observed evidence establish?" and never
 * "was it good". Raw fields are named for their raw v2 key and never combined:
 * what raw `amount` means is NOT YET PROVEN (M1), what each raw `hitType`
 * number means is NOT YET PROVEN (M2), and an absent `tick` is not "direct"
 * (M3). Missing or partial evidence is never zero.
 */

import { describe, expect, it } from "vitest";

import { observedActivityOf } from "../../src/combat-facts/activity.js";
import { actorsOwnedBy, describeActor, describeTarget } from "../../src/combat-facts/descriptors.js";
import { observationsOf, type ActorKey } from "../../src/combat-facts/observations.js";
import {
  evaluateWindowQuery,
  MEASURES,
  type Measure,
  type MeasureResult,
  type MeasureValue,
  type WindowQuery,
} from "../../src/combat-facts/window-query.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import type { CombatActor } from "../../src/engine/normalization/actors.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../src/engine/normalization/supported-families.js";
import type { EvidenceCategory } from "../../src/wcl/evidence-capability.js";
import type { Proven } from "../../src/combat-facts/coverage.js";
import { corpusFight } from "../support/corpus/fight.js";
import {
  castEvent,
  damageEvent,
  observableCategory,
  partialCategory,
  summonEvent,
  syntheticFight,
} from "../support/synthetic-fight.js";

const PLAYER = 7;
const PET = 40; // WCL petOwner = PLAYER
const OTHER_PLAYER = 8;
const OTHERS_PET = 41; // WCL petOwner = OTHER_PLAYER
const UNOWNED_PET = 42; // a PET with no petOwner
const BOSS = 21;
const ADD = 55;
const START = 1_000;
const END = 5_000;

function actor(
  actorId: number,
  actorType: CombatActor["actorType"],
  subType: string | null,
  petOwner: number | null,
): CombatActor {
  return {
    actorId,
    gameId: null,
    name: null,
    server: null,
    actorType,
    rawType: actorType === "PLAYER" ? "Player" : actorType === "PET" ? "Pet" : "NPC",
    subType,
    petOwnerActorId: petOwner,
  };
}

const CATALOG: ReadonlyMap<number, CombatActor> = new Map([
  [PLAYER, actor(PLAYER, "PLAYER", "DeathKnight", null)],
  [OTHER_PLAYER, actor(OTHER_PLAYER, "PLAYER", "Mage", null)],
  [PET, actor(PET, "PET", "Pet", PLAYER)],
  [OTHERS_PET, actor(OTHERS_PET, "PET", "Pet", OTHER_PLAYER)],
  [UNOWNED_PET, actor(UNOWNED_PET, "PET", "Pet", null)],
  [BOSS, actor(BOSS, "NPC", "Boss", null)],
  [ADD, actor(ADD, "NPC", "NPC", null)],
  // The sentinel exactly as Warcraft Logs' master data lists it.
  [-1, actor(-1, "NPC", "Boss", null)],
]);

const ALL: readonly EvidenceCategory[] = ["DAMAGE", "CASTS", "ACTORS"];

/** A fight whose DAMAGE, CASTS and ACTORS are COMPLETE over [START, END] for `actorScope`. */
function fightWith(
  events: readonly CombatEvent[],
  options: {
    readonly actorScope?: readonly number[] | null;
    readonly categories?: Partial<Record<EvidenceCategory, ReturnType<typeof observableCategory>>>;
  } = {},
): CombatFight {
  return syntheticFight({
    events,
    startTimeMs: START,
    endTimeMs: END,
    actors: CATALOG,
    observedCategories: ALL,
    actorScope: options.actorScope === undefined ? null : options.actorScope,
    ...(options.categories === undefined ? {} : { categories: options.categories }),
  });
}

function query(fight: CombatFight, partial: Partial<WindowQuery> & { measures: readonly Measure[] }) {
  const result = evaluateWindowQuery(fight, {
    startMs: START,
    endMs: END,
    sourceScope: { kind: "DIRECT_PLAYER", playerActorId: PLAYER },
    ...partial,
  });
  if (!result.ok) throw new Error(result.reason);
  return result;
}
const measureOf = (result: ReturnType<typeof query>, measure: Measure): MeasureResult => {
  const found = result.measures.find((entry) => entry.measure === measure);
  if (found === undefined) throw new Error(`no ${measure}`);
  return found;
};
/** The `Proven` scalar of a count or raw-field-sum value; a collection is never one. */
function provenOf(value: MeasureValue): Proven<unknown> {
  if (value.shape === "EVENT_COUNT" || value.shape === "RAW_FIELD_SUM") return value.value;
  throw new Error(`not a scalar measure: ${value.shape}`);
}
const scalar = (result: ReturnType<typeof query>, measure: Measure) =>
  provenOf(measureOf(result, measure).total);

const hit = (
  ordinal: number,
  at: number,
  options: Parameters<typeof damageEvent>[0] extends infer O ? Partial<O> : never = {},
) =>
  damageEvent({
    ordinal,
    reportTimeMs: at,
    sourceActorId: PLAYER,
    targetActorId: BOSS,
    abilityGameId: 100,
    ...options,
  });

// ---------------------------------------------------------------------------
// Raw components and the additive normalizer fields
// ---------------------------------------------------------------------------

describe("raw components are preserved verbatim and never combined", () => {
  it("round-trips the committed boss melee exactly (21)", () => {
    // The manifest-pinned incoming melee on the Protection Paladin opener.
    const fight = corpusFight("wcl-protection-paladin-a7r6-opener");
    const melee = observationsOf(fight).damage.find(
      (event) =>
        event.reportTimeMs === 2_008_051 &&
        event.source.kind === "ACTOR" &&
        event.source.key.actorId === BOSS,
    );
    expect(melee).toBeDefined();
    expect(melee?.raw).toEqual({
      amountField: 76_501,
      absorbedField: 369_945,
      mitigatedField: 731_895,
      unmitigatedAmountField: 1_178_341,
      blockedField: null,
      overkillField: null,
      isAoEField: false,
      supportActorIdField: null,
      subtractsFromSupportedActorField: null,
    });
    expect(melee?.hitTypeRaw).toBe(1);
    expect(melee?.tickField).toBe("NOT_SUPPLIED");
  });

  it("keeps an absent overkill null and an absent tick NOT_SUPPLIED — never 0, never false (9, 10)", () => {
    const normalizer = createNormalizer({
      fightStartTimeMs: 0,
      requestedRange: inclusiveRange(0, 10_000),
      contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
      directionFields: VERIFIED_DIRECTION_FIELDS,
    });
    const base = { type: "damage", sourceID: 1, targetID: 2, abilityGameID: 3, fight: 1, amount: 50 };
    normalizer.accept({
      streamId: "all",
      pageOrdinal: 0,
      requestedStartTimeMs: 0,
      nextPageTimestamp: null,
      events: [
        { ...base, timestamp: 1 },
        { ...base, timestamp: 2, tick: true, overkill: 7 },
        { ...base, timestamp: 3, tick: false },
        { ...base, timestamp: 4, tick: "yes" },
      ],
    });
    const damage = normalizer.finish().events.filter((event) => event.kind === "DAMAGE");
    expect(
      damage.map((event) =>
        event.kind === "DAMAGE" ? [event.tickField, event.overkillAmount, event.isTick] : null,
      ),
    ).toEqual([
      ["NOT_SUPPLIED", null, false],
      ["TRUE", 7, true],
      ["FALSE", null, false],
      ["UNUSABLE_VALUE", null, false],
    ]);
  });

  it("hitType 2 is the raw value 2 and nothing more — there is no crit anywhere (11)", () => {
    const fight = fightWith([hit(0, 1_500, { hitType: 2 })]);
    const [event] = observationsOf(fight).damage;
    expect(event?.hitTypeRaw).toBe(2);
    expect(JSON.stringify(event).toLowerCase()).not.toContain("crit");
    const result = query(fight, { measures: ["HITTYPE_RAW_DISTRIBUTION"] });
    expect(measureOf(result, "HITTYPE_RAW_DISTRIBUTION").total).toEqual({
      shape: "HITTYPE_RAW_DISTRIBUTION",
      buckets: {
        items: [{ hitTypeRaw: 2, observedEventCount: 1 }],
        completeness: expect.objectContaining({ kind: "EXHAUSTIVE" }),
      },
    });
    expect(MEASURES.some((measure) => /CRIT|EFFECTIVE|DONE|DIRECT|DPS/.test(measure))).toBe(false);
  });

  it("never adds absorbed or overkill to amount, and never substitutes unmitigatedAmount (6, 7, 8)", () => {
    const fight = fightWith([
      hit(0, 1_500, { amount: 100, absorbedAmount: 40, overkillAmount: 25, unmitigatedAmount: 999 }),
      hit(1, 1_600, { amount: 10 }),
    ]);
    const result = query(fight, {
      measures: [
        "RAW_AMOUNT_FIELD_SUM",
        "RAW_ABSORBED_FIELD_SUM",
        "RAW_OVERKILL_FIELD_SUM",
        "RAW_UNMITIGATED_AMOUNT_FIELD_SUM",
      ],
    });
    expect(scalar(result, "RAW_AMOUNT_FIELD_SUM")).toEqual({
      kind: "EXACT",
      value: { sumOfSuppliedValues: 110, eventsSupplyingField: 2, eventsNotSupplyingField: 0 },
    });
    // Each other field is its own sum, and absence is counted, not added as 0.
    expect(scalar(result, "RAW_ABSORBED_FIELD_SUM")).toEqual({
      kind: "EXACT",
      value: { sumOfSuppliedValues: 40, eventsSupplyingField: 1, eventsNotSupplyingField: 1 },
    });
    expect(scalar(result, "RAW_OVERKILL_FIELD_SUM")).toEqual({
      kind: "EXACT",
      value: { sumOfSuppliedValues: 25, eventsSupplyingField: 1, eventsNotSupplyingField: 1 },
    });
    expect(scalar(result, "RAW_UNMITIGATED_AMOUNT_FIELD_SUM")).toEqual({
      kind: "EXACT",
      value: { sumOfSuppliedValues: 999, eventsSupplyingField: 1, eventsNotSupplyingField: 1 },
    });
  });

  it("refuses a raw sum it cannot add exactly", () => {
    const fight = fightWith([
      hit(0, 1_500, { amount: 0.5 }),
      hit(1, 1_600, { amount: Number.MAX_SAFE_INTEGER }),
    ]);
    expect(
      provenOf(measureOf(query(fight, { measures: ["RAW_AMOUNT_FIELD_SUM"] }), "RAW_AMOUNT_FIELD_SUM").total),
    ).toEqual({
      kind: "UNKNOWN",
      reason: "UNSAFE_INTEGER_ARITHMETIC",
    });
  });
});

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

describe("coverage decides exactness; absence is never zero", () => {
  it("1/4: COMPLETE coverage with no matching events is EXACT 0, and the raw sum is EXACT", () => {
    const fight = fightWith([hit(0, 1_500, { amount: 30 })]);
    const result = query(fight, {
      abilityGameIds: [999],
      measures: ["DAMAGE_EVENT_COUNT", "RAW_AMOUNT_FIELD_SUM"],
    });
    expect(scalar(result, "DAMAGE_EVENT_COUNT")).toEqual({ kind: "EXACT", value: 0 });
    expect(scalar(result, "RAW_AMOUNT_FIELD_SUM")).toEqual({
      kind: "EXACT",
      value: { sumOfSuppliedValues: 0, eventsSupplyingField: 0, eventsNotSupplyingField: 0 },
    });
  });

  it("2/3/5: PARTIAL coverage — counts are AT_LEAST, nothing observed is UNKNOWN, raw sums are UNKNOWN", () => {
    const partial = partialCategory([inclusiveRange(START, 2_000)]);
    const fight = fightWith([hit(0, 1_500, { amount: 30 })], { categories: { DAMAGE: partial } });
    const result = query(fight, { measures: ["DAMAGE_EVENT_COUNT", "RAW_AMOUNT_FIELD_SUM"] });
    expect(measureOf(result, "DAMAGE_EVENT_COUNT").coverage.state).toBe("PARTIAL");
    expect(scalar(result, "DAMAGE_EVENT_COUNT")).toEqual({ kind: "AT_LEAST", value: 1 });
    // Not AT_LEAST: raw amount's sign is not pinned, so a partial sum bounds nothing.
    expect(scalar(result, "RAW_AMOUNT_FIELD_SUM")).toEqual({
      kind: "UNKNOWN",
      reason: "FIELD_DOMAIN_NOT_PROVEN",
    });
    // Nothing matching under PARTIAL: never a zero, exact or "at least".
    const none = query(fight, { abilityGameIds: [999], measures: ["DAMAGE_EVENT_COUNT"] });
    expect(scalar(none, "DAMAGE_EVENT_COUNT")).toEqual({
      kind: "UNKNOWN",
      reason: "NO_INFORMATIVE_LOWER_BOUND",
    });
  });

  it("3: COMPLETE cast coverage does not make damage exact", () => {
    const partial = partialCategory([inclusiveRange(START, 2_000)]);
    const fight = fightWith(
      [
        castEvent({
          ordinal: 0,
          reportTimeMs: 1_400,
          sourceActorId: PLAYER,
          abilityGameId: 100,
          castPhase: "COMPLETE",
        }),
        hit(1, 1_500),
      ],
      { categories: { DAMAGE: partial } },
    );
    const result = query(fight, {
      measures: ["CAST_COMPLETE_EVENT_COUNT", "DAMAGE_EVENT_COUNT", "RAW_AMOUNT_FIELD_SUM"],
    });
    expect(scalar(result, "CAST_COMPLETE_EVENT_COUNT")).toEqual({ kind: "EXACT", value: 1 });
    expect(scalar(result, "DAMAGE_EVENT_COUNT").kind).toBe("AT_LEAST");
    expect(scalar(result, "RAW_AMOUNT_FIELD_SUM").kind).toBe("UNKNOWN");
  });

  it("5: decode degradation makes every fact needing that category non-exact, anywhere", () => {
    const complete = observableCategory(inclusiveRange(START, END));
    if (complete.capability !== "OBSERVABLE") throw new Error("expected observable");
    const degraded = {
      ...complete,
      coverage: {
        ...complete.coverage,
        state: "PARTIAL" as const,
        reason: "MALFORMED_EVENT_CONTENT" as const,
      },
    };
    const fight = fightWith([hit(0, 1_500)], { categories: { DAMAGE: degraded } });
    const result = query(fight, {
      measures: ["DAMAGE_EVENT_COUNT", "RAW_AMOUNT_FIELD_SUM", "CAST_COMPLETE_EVENT_COUNT"],
    });
    expect(measureOf(result, "DAMAGE_EVENT_COUNT").coverage.categories[0]?.reasons).toContain(
      "DECODE_DEGRADED",
    );
    expect(scalar(result, "DAMAGE_EVENT_COUNT").kind).toBe("AT_LEAST");
    expect(scalar(result, "RAW_AMOUNT_FIELD_SUM").kind).toBe("UNKNOWN");
    // The unaffected category stays exact.
    expect(scalar(result, "CAST_COMPLETE_EVENT_COUNT")).toEqual({ kind: "EXACT", value: 0 });
  });

  it("the window is half-open: an event at exactly endMs is outside it", () => {
    const fight = fightWith([hit(0, 2_000), hit(1, 1_999)]);
    const result = query(fight, { startMs: 1_000, endMs: 2_000, measures: ["DAMAGE_EVENT_COUNT"] });
    expect(scalar(result, "DAMAGE_EVENT_COUNT")).toEqual({ kind: "EXACT", value: 1 });
    expect(
      evaluateWindowQuery(fight, {
        startMs: 2_000,
        endMs: 2_000,
        sourceScope: { kind: "DIRECT_PLAYER", playerActorId: PLAYER },
        measures: ["CAST_COMPLETE_EVENT_COUNT"],
      }),
    ).toEqual({
      ok: false,
      reason: "EMPTY_OR_INVERTED_WINDOW",
    });
  });

  it("UNVERIFIED and ABSENT categories establish nothing", () => {
    const fight = syntheticFight({
      events: [hit(0, 1_500)],
      startTimeMs: START,
      endTimeMs: END,
      actors: CATALOG,
    });
    const result = query(fight, { measures: ["DAMAGE_EVENT_COUNT"] });
    expect(measureOf(result, "DAMAGE_EVENT_COUNT").coverage.state).toBe("NOT_ESTABLISHED");
    expect(scalar(result, "DAMAGE_EVENT_COUNT")).toEqual({
      kind: "UNKNOWN",
      reason: "COVERAGE_INSUFFICIENT",
    });
  });
});

// ---------------------------------------------------------------------------
// Actors, ownership, targets
// ---------------------------------------------------------------------------

describe("ownership is WCL petOwner only, and owner views keep the source subtree", () => {
  const events = [
    hit(0, 1_500, { amount: 100 }),
    hit(1, 1_600, { amount: 40, sourceActorId: PET }),
    hit(2, 1_700, { amount: 40, sourceActorId: PET, sourceInstanceId: 2 }),
    hit(3, 1_800, { amount: 9, sourceActorId: UNOWNED_PET }),
    hit(4, 1_900, { amount: 9, sourceActorId: OTHERS_PET }),
    summonEvent({ ordinal: 5, reportTimeMs: 1_000, sourceActorId: PLAYER, targetActorId: UNOWNED_PET }),
  ];

  it("15: OWNER_ROLLUP keeps a per-source and per-member breakdown beside the total", () => {
    const result = query(fightWith(events), {
      sourceScope: { kind: "OWNER_ROLLUP", ownerActorId: PLAYER },
      measures: ["RAW_AMOUNT_FIELD_SUM"],
    });
    expect(result.memberActorIds).toEqual([PLAYER, PET]);
    const raw = measureOf(result, "RAW_AMOUNT_FIELD_SUM");
    expect(provenOf(raw.total)).toMatchObject({ kind: "EXACT", value: { sumOfSuppliedValues: 180 } });
    expect(raw.bySource.map((entry) => [entry.source, provenOf(entry.value)])).toEqual([
      [
        { actorId: PLAYER, instanceId: null },
        {
          kind: "EXACT",
          value: { sumOfSuppliedValues: 100, eventsSupplyingField: 1, eventsNotSupplyingField: 0 },
        },
      ],
      [
        { actorId: PET, instanceId: null },
        {
          kind: "EXACT",
          value: { sumOfSuppliedValues: 40, eventsSupplyingField: 1, eventsNotSupplyingField: 0 },
        },
      ],
      [
        { actorId: PET, instanceId: 2 },
        {
          kind: "EXACT",
          value: { sumOfSuppliedValues: 40, eventsSupplyingField: 1, eventsNotSupplyingField: 0 },
        },
      ],
    ]);
    expect(raw.byMember.map((entry) => [entry.actorId, provenOf(entry.value)])).toEqual([
      [
        PLAYER,
        {
          kind: "EXACT",
          value: { sumOfSuppliedValues: 100, eventsSupplyingField: 1, eventsNotSupplyingField: 0 },
        },
      ],
      [
        PET,
        {
          kind: "EXACT",
          value: { sumOfSuppliedValues: 80, eventsSupplyingField: 2, eventsNotSupplyingField: 0 },
        },
      ],
    ]);
  });

  it("16: a pet with no stated owner — even one the player was seen summoning — is disclosed, never rolled up", () => {
    const fight = fightWith(events);
    expect(describeActor(fight, UNOWNED_PET)).toMatchObject({
      ownership: { status: "NO_OWNER_STATED", ownerActorId: null },
    });
    expect(describeActor(fight, UNOWNED_PET).summonEvidence.items).toHaveLength(1);
    expect(actorsOwnedBy(fight, PLAYER)).toEqual([PET]);
    const result = query(fight, {
      sourceScope: { kind: "OWNER_ROLLUP", ownerActorId: PLAYER },
      measures: ["DAMAGE_EVENT_COUNT"],
    });
    expect(result.memberActorIds).not.toContain(UNOWNED_PET);
    expect(result.unresolvedOwnershipObserved.items).toEqual([{ actorId: UNOWNED_PET, instanceId: null }]);
    // Another player's pet is neither rolled up nor "unresolved": its owner is stated.
    expect(result.memberActorIds).not.toContain(OTHERS_PET);
    expect(result.unresolvedOwnershipObserved.items).not.toContainEqual({
      actorId: OTHERS_PET,
      instanceId: null,
    });
  });

  it("17/4: an owned pet outside the vouched scope makes the rollup incomplete, while DIRECT_PLAYER stays exact", () => {
    const fight = fightWith(events, { actorScope: [PLAYER, BOSS] });
    const rollup = query(fight, {
      sourceScope: { kind: "OWNER_ROLLUP", ownerActorId: PLAYER },
      measures: ["DAMAGE_EVENT_COUNT", "RAW_AMOUNT_FIELD_SUM"],
    });
    expect(measureOf(rollup, "DAMAGE_EVENT_COUNT").coverage.state).toBe("PARTIAL");
    expect(
      measureOf(rollup, "DAMAGE_EVENT_COUNT").coverage.categories.find(
        (entry) => entry.category === "DAMAGE",
      ),
    ).toMatchObject({
      reasons: ["SOURCE_SCOPE_NOT_COVERED"],
      sourceActorIdsNotVouched: [PET],
    });
    expect(scalar(rollup, "RAW_AMOUNT_FIELD_SUM").kind).toBe("UNKNOWN");
    // The player's own member total is still exact inside the same result.
    expect(measureOf(rollup, "RAW_AMOUNT_FIELD_SUM").byMember[0]).toMatchObject({
      actorId: PLAYER,
      value: { shape: "RAW_FIELD_SUM", value: { kind: "EXACT" } },
    });
    const direct = query(fight, { measures: ["RAW_AMOUNT_FIELD_SUM"] });
    expect(scalar(direct, "RAW_AMOUNT_FIELD_SUM")).toMatchObject({
      kind: "EXACT",
      value: { sumOfSuppliedValues: 100 },
    });
  });

  it("owner views and the boss filter need the catalog: without ACTORS they establish nothing", () => {
    const fight = syntheticFight({
      events,
      startTimeMs: START,
      endTimeMs: END,
      actors: CATALOG,
      observedCategories: ["DAMAGE", "CASTS"],
    });
    const result = query(fight, {
      sourceScope: { kind: "OWNER_ROLLUP", ownerActorId: PLAYER },
      measures: ["DAMAGE_EVENT_COUNT"],
    });
    expect(measureOf(result, "DAMAGE_EVENT_COUNT").coverage.state).toBe("NOT_ESTABLISHED");
  });
});

describe("target metadata is metadata", () => {
  it("12/13/14: an NPC is not hostile, a boss subtype is not targetable, and -1 is never a boss", () => {
    const fight = fightWith([]);
    expect(describeTarget(fight, ADD)).toMatchObject({
      catalogKind: "NPC",
      hostility: "UNKNOWN",
      targetability: "UNKNOWN",
      bossSubtype: "NOT_WCL_BOSS_SUBTYPE",
    });
    expect(describeTarget(fight, BOSS)).toMatchObject({
      bossSubtype: "WCL_BOSS_SUBTYPE",
      hostility: "UNKNOWN",
      targetability: "UNKNOWN",
    });
    // Master data lists -1 as NPC/Boss; it is the no-actor sentinel all the same.
    expect(describeTarget(fight, -1)).toMatchObject({
      bossSubtype: "NO_ACTOR_SENTINEL",
      catalogKind: "NO_ACTOR_SENTINEL",
    });
    expect(describeTarget(fight, 999)).toMatchObject({ bossSubtype: "NOT_IN_CATALOG" });
  });

  it("the WCL_BOSS_SUBTYPE filter keeps catalogued Boss targets only, and never the sentinel", () => {
    const fight = fightWith([
      hit(0, 1_500, { targetActorId: BOSS }),
      hit(1, 1_600, { targetActorId: ADD }),
      hit(2, 1_700, { targetActorId: -1 }),
    ]);
    const result = query(fight, {
      targetMetadata: "WCL_BOSS_SUBTYPE",
      measures: ["DAMAGE_EVENT_COUNT", "DISTINCT_TARGETS_OBSERVED"],
    });
    expect(scalar(result, "DAMAGE_EVENT_COUNT")).toEqual({ kind: "EXACT", value: 1 });
    expect(measureOf(result, "DISTINCT_TARGETS_OBSERVED").total).toMatchObject({
      targets: { items: [{ actorId: BOSS, instanceId: null }], completeness: { kind: "EXHAUSTIVE" } },
      eventsWithNoTargetActor: { kind: "EXACT", value: 0 },
    });
  });
});

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

describe("observed activity is observations only", () => {
  it("18: two observations 30 s apart prove nothing about the time between", () => {
    const fight = fightWith([
      hit(0, 1_000, { targetActorId: ADD }),
      hit(1, 31_000, { sourceActorId: ADD, targetActorId: PLAYER }),
    ]);
    const activity = observedActivityOf(fight, ADD);
    // Positive observations only: never claimed to be all of them.
    expect(activity.observations.completeness).toEqual({ kind: "OBSERVED_ONLY", coverage: null });
    expect(
      activity.observations.items.map((entry) => [entry.reportTimeMs, entry.role, entry.category]),
    ).toEqual([
      [1_000, "TARGET", "DAMAGE"],
      [31_000, "SOURCE", "DAMAGE"],
    ]);
    expect(activity.observationExtremes).toEqual({
      firstObservedAtMs: 1_000,
      lastObservedAtMs: 31_000,
      observationCount: 2,
    });
    // Nothing interval-, presence- or life-shaped exists on the result.
    const keys =
      JSON.stringify(Object.keys(activity)) + JSON.stringify(Object.keys(activity.observationExtremes ?? {}));
    for (const word of ["presence", "alive", "active", "spawn", "despawn", "interval", "duration"]) {
      expect(keys.toLowerCase()).not.toContain(word);
    }
    expect(observedActivityOf(fight, 12345).observationExtremes).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  const events = [
    castEvent({
      ordinal: 0,
      reportTimeMs: 1_500,
      sourceActorId: PLAYER,
      abilityGameId: 1,
      castPhase: "COMPLETE",
    }),
    castEvent({
      ordinal: 1,
      reportTimeMs: 1_500,
      sourceActorId: PLAYER,
      abilityGameId: 2,
      castPhase: "COMPLETE",
    }),
    castEvent({
      ordinal: 2,
      reportTimeMs: 1_400,
      sourceActorId: PLAYER,
      abilityGameId: 3,
      castPhase: "BEGIN",
    }),
    hit(3, 1_500, { amount: 5, hitType: 1 }),
    hit(4, 1_500, { amount: 7, hitType: 2, tickField: "TRUE" }),
    hit(5, 1_600, { amount: 9, targetActorId: ADD, targetInstanceId: 3 }),
  ];

  it("19: equal timestamps are listed in retrieval order and marked as not proven authoritative", () => {
    const sequence = measureOf(
      query(fightWith(events), { measures: ["CAST_EVENT_SEQUENCE"] }),
      "CAST_EVENT_SEQUENCE",
    ).total;
    if (sequence.shape !== "CAST_EVENT_SEQUENCE") throw new Error("not a sequence");
    expect(sequence.events.completeness.kind).toBe("EXHAUSTIVE");
    expect(sequence.events.items.map((entry) => [entry.abilityGameId, entry.phase, entry.order])).toEqual([
      [3, "BEGIN", "UNIQUE_TIMESTAMP"],
      [1, "COMPLETE", "RETRIEVAL_ORDER_NOT_PROVEN_AUTHORITATIVE"],
      [2, "COMPLETE", "RETRIEVAL_ORDER_NOT_PROVEN_AUTHORITATIVE"],
    ]);
  });

  it("20: permuting the input events changes no result byte", () => {
    const forward = query(fightWith(events), { measures: MEASURES });
    const reversed = query(fightWith([...events].reverse()), { measures: MEASURES });
    const shuffledEvents = [4, 0, 5, 2, 3, 1]
      .map((index) => events[index])
      .filter((event) => event !== undefined);
    const shuffled = query(fightWith(shuffledEvents), { measures: MEASURES });
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(forward));
    // BEGIN and COMPLETE are counted separately, never summed as "casts".
    expect(scalar(forward, "CAST_COMPLETE_EVENT_COUNT")).toEqual({ kind: "EXACT", value: 2 });
    expect(scalar(forward, "CAST_BEGIN_EVENT_COUNT")).toEqual({ kind: "EXACT", value: 1 });
    expect(scalar(forward, "TICK_TRUE_COUNT")).toEqual({ kind: "EXACT", value: 1 });
    expect(scalar(forward, "TICK_NOT_SUPPLIED_COUNT")).toEqual({ kind: "EXACT", value: 2 });
    expect(measureOf(forward, "DISTINCT_TARGETS_OBSERVED").total).toMatchObject({
      targets: {
        items: [
          { actorId: BOSS, instanceId: null },
          { actorId: ADD, instanceId: 3 },
        ] satisfies ActorKey[],
        completeness: { kind: "EXHAUSTIVE" },
      },
      eventsWithNoTargetActor: { kind: "EXACT", value: 0 },
    });
  });
});

// ---------------------------------------------------------------------------
// The real fixture, end to end
// ---------------------------------------------------------------------------

describe("the committed Protection Paladin opener", () => {
  it("answers exactly inside its grant and nothing inside the catalog it lacks", () => {
    const fight = corpusFight("wcl-protection-paladin-a7r6-opener");
    const result = evaluateWindowQuery(fight, {
      startMs: 2_004_589,
      endMs: 2_026_589,
      sourceScope: { kind: "DIRECT_PLAYER", playerActorId: 7 },
      measures: [
        "DAMAGE_EVENT_COUNT",
        "CAST_BEGIN_EVENT_COUNT",
        "CAST_COMPLETE_EVENT_COUNT",
        "TICK_TRUE_COUNT",
        "TICK_NOT_SUPPLIED_COUNT",
        "HITTYPE_RAW_DISTRIBUTION",
        "RAW_AMOUNT_FIELD_SUM",
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const total = (measure: Measure) => {
      const found = result.measures.find((entry) => entry.measure === measure)?.total;
      if (found === undefined) throw new Error(measure);
      return found;
    };
    const value = (measure: Measure) => provenOf(total(measure));
    expect(value("DAMAGE_EVENT_COUNT")).toEqual({ kind: "EXACT", value: 196 });
    // Every cast-family event in this capture is a COMPLETE one; none is a BEGIN.
    expect(value("CAST_COMPLETE_EVENT_COUNT")).toEqual({ kind: "EXACT", value: 45 });
    expect(value("CAST_BEGIN_EVENT_COUNT")).toEqual({ kind: "EXACT", value: 0 });
    expect(value("TICK_TRUE_COUNT")).toEqual({ kind: "EXACT", value: 52 });
    expect(value("TICK_NOT_SUPPLIED_COUNT")).toEqual({ kind: "EXACT", value: 144 });
    expect(total("HITTYPE_RAW_DISTRIBUTION")).toMatchObject({
      buckets: {
        items: [
          { hitTypeRaw: 1, observedEventCount: 161 },
          { hitTypeRaw: 2, observedEventCount: 35 },
        ],
        completeness: { kind: "EXHAUSTIVE" },
      },
    });
    expect(value("RAW_AMOUNT_FIELD_SUM")).toEqual({
      kind: "EXACT",
      value: { sumOfSuppliedValues: 1_199_550, eventsSupplyingField: 196, eventsNotSupplyingField: 0 },
    });
    // Beyond the grant the same query is not exact.
    const wider = evaluateWindowQuery(fight, {
      startMs: 2_000_000,
      endMs: 2_026_589,
      sourceScope: { kind: "DIRECT_PLAYER", playerActorId: 7 },
      measures: ["DAMAGE_EVENT_COUNT"],
    });
    expect(wider.ok && wider.measures[0] !== undefined && provenOf(wider.measures[0].total).kind).toBe(
      "AT_LEAST",
    );
    // The corpus fight carries no actor catalog, so owner views establish nothing.
    const rollup = evaluateWindowQuery(fight, {
      startMs: 2_004_589,
      endMs: 2_026_589,
      sourceScope: { kind: "OWNER_ROLLUP", ownerActorId: 7 },
      measures: ["DAMAGE_EVENT_COUNT"],
    });
    expect(rollup.ok && rollup.measures[0]?.coverage.state).toBe("NOT_ESTABLISHED");
  });
});

// ---------------------------------------------------------------------------
// M11-E1.1: collections are observed, never "at least"; cast events are events
// ---------------------------------------------------------------------------

describe("collections carry their completeness, never a scalar bound", () => {
  const TARGET_A = 60;
  const TARGET_B = 61;
  const events = [
    hit(0, 1_500, { targetActorId: TARGET_A, hitType: 1 }),
    hit(1, 1_600, { targetActorId: TARGET_B, hitType: 1 }),
    hit(2, 1_700, { targetActorId: TARGET_A, hitType: 1 }),
    hit(3, 1_800, { targetActorId: TARGET_B, hitType: 1 }),
    hit(4, 1_850, { targetActorId: TARGET_A, hitType: 2 }),
  ];
  const partial = partialCategory([inclusiveRange(START, 2_000)]);
  const targetsOf = (result: ReturnType<typeof query>) => {
    const total = measureOf(result, "DISTINCT_TARGETS_OBSERVED").total;
    if (total.shape !== "OBSERVED_TARGETS") throw new Error("not targets");
    return total;
  };
  const bucketsOf = (result: ReturnType<typeof query>) => {
    const total = measureOf(result, "HITTYPE_RAW_DISTRIBUTION").total;
    if (total.shape !== "HITTYPE_RAW_DISTRIBUTION") throw new Error("not a distribution");
    return total.buckets;
  };
  const AB = [
    { actorId: TARGET_A, instanceId: null },
    { actorId: TARGET_B, instanceId: null },
  ];

  it("A: PARTIAL — A and B were observed; nothing claims they are all the targets", () => {
    const targets = targetsOf(
      query(fightWith(events, { categories: { DAMAGE: partial } }), {
        measures: ["DISTINCT_TARGETS_OBSERVED"],
      }),
    );
    expect(targets.targets.items).toEqual(AB);
    expect(targets.targets.completeness.kind).toBe("OBSERVED_ONLY");
    expect(targets.targets.completeness.coverage?.state).toBe("PARTIAL");
    // No scalar wrapper around the set: neither EXACT nor AT_LEAST exists on it.
    expect(JSON.stringify(targets.targets)).not.toMatch(/"kind":"(EXACT|AT_LEAST|EXHAUSTIVE)"/);
    // The scalar beside it may still be a bound; with nothing observed it says nothing.
    expect(targets.eventsWithNoTargetActor).toEqual({
      kind: "UNKNOWN",
      reason: "NO_INFORMATIVE_LOWER_BOUND",
    });
  });

  it("B: COMPLETE — the same A and B are exhaustive for that capability, scope and window", () => {
    const targets = targetsOf(query(fightWith(events), { measures: ["DISTINCT_TARGETS_OBSERVED"] }));
    expect(targets.targets.items).toEqual(AB);
    expect(targets.targets.completeness).toMatchObject({
      kind: "EXHAUSTIVE",
      coverage: { state: "COMPLETE" },
    });
  });

  it("C: PARTIAL — observed hitType buckets are kept, and labelled non-exhaustive", () => {
    const buckets = bucketsOf(
      query(fightWith(events, { categories: { DAMAGE: partial } }), {
        measures: ["HITTYPE_RAW_DISTRIBUTION"],
      }),
    );
    expect(buckets.items).toEqual([
      { hitTypeRaw: 1, observedEventCount: 4 },
      { hitTypeRaw: 2, observedEventCount: 1 },
    ]);
    expect(buckets.completeness).toMatchObject({ kind: "OBSERVED_ONLY", coverage: { state: "PARTIAL" } });
    expect(JSON.stringify(buckets)).not.toMatch(/"kind":"(EXACT|AT_LEAST|EXHAUSTIVE)"/);
  });

  it("D: COMPLETE — the same buckets are the exhaustive distribution", () => {
    const buckets = bucketsOf(query(fightWith(events), { measures: ["HITTYPE_RAW_DISTRIBUTION"] }));
    expect(buckets.items).toEqual([
      { hitTypeRaw: 1, observedEventCount: 4 },
      { hitTypeRaw: 2, observedEventCount: 1 },
    ]);
    expect(buckets.completeness.kind).toBe("EXHAUSTIVE");
  });

  it("evidence collections never claim exhaustiveness on their own", () => {
    const fight = fightWith([
      summonEvent({ ordinal: 0, reportTimeMs: 1_000, sourceActorId: PLAYER, targetActorId: PET }),
    ]);
    expect(describeActor(fight, PET).summonEvidence.completeness).toEqual({
      kind: "OBSERVED_ONLY",
      coverage: null,
    });
    const result = query(fight, {
      sourceScope: { kind: "OWNER_ROLLUP", ownerActorId: PLAYER },
      measures: ["DAMAGE_EVENT_COUNT"],
    });
    expect(result.unresolvedOwnershipObserved.completeness).toEqual({
      kind: "OBSERVED_ONLY",
      coverage: null,
    });
  });
});

describe("cast-family measures count and list EVENTS, per phase", () => {
  const events = [
    castEvent({
      ordinal: 0,
      reportTimeMs: 1_500,
      sourceActorId: PLAYER,
      targetActorId: BOSS,
      abilityGameId: 77,
      castPhase: "BEGIN",
    }),
    castEvent({
      ordinal: 1,
      reportTimeMs: 2_500,
      sourceActorId: PLAYER,
      targetActorId: BOSS,
      abilityGameId: 77,
      castPhase: "COMPLETE",
    }),
  ];

  it("E: a BEGIN and a COMPLETE of one ability are one event of each phase — never '2 casts'", () => {
    const result = query(fightWith(events), {
      measures: ["CAST_BEGIN_EVENT_COUNT", "CAST_COMPLETE_EVENT_COUNT"],
    });
    expect(measureOf(result, "CAST_BEGIN_EVENT_COUNT").total).toEqual({
      shape: "EVENT_COUNT",
      eventFamily: "CAST",
      castPhase: "BEGIN",
      tickField: null,
      value: { kind: "EXACT", value: 1 },
    });
    expect(measureOf(result, "CAST_COMPLETE_EVENT_COUNT").total).toMatchObject({
      castPhase: "COMPLETE",
      value: { kind: "EXACT", value: 1 },
    });
    // No measure counts cast events without naming the phase, or calls them casts or actions.
    expect(MEASURES).not.toContain("CAST_COUNT");
    expect(MEASURES.some((measure) => /^CAST_(EVENT_)?COUNT$|ACTION|GCD/.test(measure))).toBe(false);
  });

  it("F: the cast-event sequence keeps BEGIN and COMPLETE as separate entries, with locators", () => {
    const total = measureOf(
      query(fightWith(events), { measures: ["CAST_EVENT_SEQUENCE"] }),
      "CAST_EVENT_SEQUENCE",
    ).total;
    if (total.shape !== "CAST_EVENT_SEQUENCE") throw new Error("not a sequence");
    expect(
      total.events.items.map((entry) => [
        entry.reportTimeMs,
        entry.phase,
        entry.abilityGameId,
        entry.source,
        entry.target,
        entry.locator.ingestionOrdinal,
        entry.order,
      ]),
    ).toEqual([
      [
        1_500,
        "BEGIN",
        77,
        { actorId: PLAYER, instanceId: null },
        { kind: "ACTOR", key: { actorId: BOSS, instanceId: null } },
        0,
        "UNIQUE_TIMESTAMP",
      ],
      [
        2_500,
        "COMPLETE",
        77,
        { actorId: PLAYER, instanceId: null },
        { kind: "ACTOR", key: { actorId: BOSS, instanceId: null } },
        1,
        "UNIQUE_TIMESTAMP",
      ],
    ]);
    expect(total.events.completeness.kind).toBe("EXHAUSTIVE");
  });

  it("G: under PARTIAL cast coverage the observed events are returned, explicitly non-exhaustive — not a prefix", () => {
    const partial = partialCategory([inclusiveRange(START, 2_000), inclusiveRange(3_000, END)]);
    const total = measureOf(
      query(fightWith(events, { categories: { CASTS: partial } }), { measures: ["CAST_EVENT_SEQUENCE"] }),
      "CAST_EVENT_SEQUENCE",
    ).total;
    if (total.shape !== "CAST_EVENT_SEQUENCE") throw new Error("not a sequence");
    expect(total.events.items.map((entry) => entry.phase)).toEqual(["BEGIN", "COMPLETE"]);
    expect(total.events.completeness).toMatchObject({
      kind: "OBSERVED_ONLY",
      coverage: { state: "PARTIAL" },
    });
    expect(JSON.stringify(total.events)).not.toMatch(/"kind":"(EXACT|AT_LEAST|EXHAUSTIVE)"/);
  });
});
