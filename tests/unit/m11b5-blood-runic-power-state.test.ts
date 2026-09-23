/**
 * M11-B5: the Blood-owned Runic Power state — exact carry, the 1 ms resource
 * window's lower bound, costed-cast invalidation, and every refusal — over
 * synthetic fights and the committed Blood corpus.
 *
 * Negative first: no state after a costed cast until something observes it
 * (never `pre - cost`, never `pre - 350`); no state through a RESOURCES or
 * CASTS gap; no attribution of a gain 0-1 ms ahead of the decision, only the
 * bound both readings share; no exact value from a bound; no upper bound; no
 * re-anchoring around a snapshot that disagrees; no max from memory.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  evaluateSimcExpression,
  unknownNumber,
  type AtomBindings,
} from "../../src/simc/expression/evaluate.js";
import { BLOOD_PRE_DECISION_WINDOW_MS } from "../../src/specs/deathknight/blood/aura-bindings.js";
import { BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS } from "../../src/specs/deathknight/blood/aura-remains.js";
import { resolveBloodAtoms } from "../../src/specs/deathknight/blood/resolver.js";
import {
  bloodResourceOn,
  bloodResourceWireTypes,
  bloodWireKeys,
} from "../../src/specs/deathknight/blood/resources.js";
import {
  bindBloodRunicPower,
  BLOOD_RESOURCE_PRE_DECISION_WINDOW_MS,
  bloodRunicPowerDeficitBinding,
} from "../../src/specs/deathknight/blood/runic-power-state.js";
import { BLOOD_ATOM_VOCABULARY } from "../../src/specs/deathknight/blood/vocabulary.js";
import { corpusBundleState, corpusState, positionOfCast } from "../support/corpus/fight.js";
import {
  absentCategory,
  attachedResources,
  castEvent,
  classResource,
  observableCategory,
  partialCategory,
  resourceChangeEvent,
  syntheticFight,
  type SyntheticFightOptions,
} from "../support/synthetic-fight.js";

const ACTOR = 14;
const RP = 6;
const RUNES = 5;
const [DEATH_STRIKE, HEART_STRIKE, VAMPIRIC_STRIKE, BLOOD_BOIL, MARROWREND, DEATHS_CARESS, DND, MELEE] = [
  49998, 206930, 433895, 50842, 195182, 195292, 43265, 1,
];
const [HEARTBREAKER, RUNIC_ATTENUATION, BLOOD_MIST, AMS, RELISH] = [210738, 221322, 1263774, 49088, 317614];
const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
const BUNDLE = [
  BLOOD45,
  "wcl-blood-death-knight-a7r6-rotational-165s.seg-45-105",
  "wcl-blood-death-knight-a7r6-rotational-165s.seg-105-165",
];
const GTKB = "wcl-blood-death-knight-gtkb-opener";

const rp = (amount: number, extra: { max?: number | null; cost?: number } = {}) =>
  attachedResources({
    side: "SOURCE",
    actorId: ACTOR,
    classResources: [
      classResource(RP, amount, {
        max: extra.max === undefined ? 1250 : extra.max,
        cost: extra.cost ?? null,
      }),
    ],
  });
const runes = (amount: number, cost: number) =>
  attachedResources({
    side: "SOURCE",
    actorId: ACTOR,
    classResources: [classResource(RUNES, amount, { max: 6, cost })],
  });
const gain = (
  ordinal: number,
  reportTimeMs: number,
  ability: number,
  delta: number,
  amount: number,
  max = 1250,
) =>
  resourceChangeEvent({
    ordinal,
    reportTimeMs,
    sourceActorId: ACTOR,
    targetActorId: ACTOR,
    abilityGameId: ability,
    resourceType: RP,
    resourceChange: delta,
    maxResourceAmount: max,
    attachedResources: attachedResources({
      side: "SOURCE",
      actorId: ACTOR,
      classResources: [classResource(RP, amount, { max })],
    }),
  });
const cast = (ordinal: number, reportTimeMs: number, ability: number, attached: ReturnType<typeof rp>) =>
  castEvent({
    ordinal,
    reportTimeMs,
    castPhase: "COMPLETE",
    sourceActorId: ACTOR,
    targetActorId: 22,
    abilityGameId: ability,
    attachedResources: attached,
  });

function stateOf(events: SyntheticFightOptions["events"], options: SyntheticFightOptions = {}) {
  return createCombatState(
    syntheticFight({
      observedCategories: ["RESOURCES", "CASTS", "AURAS"],
      endTimeMs: 60_000,
      events,
      ...options,
    }),
  );
}
const bind = (state: CombatState, position: number) =>
  bindBloodRunicPower({ state, actorId: ACTOR, position });

function at(state: CombatState, reportTimeMs: number, abilityGameId: number): number {
  const found = positionOfCast(state, { actorId: ACTOR, reportTimeMs, abilityGameId });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}

function deficitTruth(expression: string, binding: ReturnType<typeof bloodRunicPowerDeficitBinding>) {
  const parsed = parseSimcExpression(expression, BLOOD_ATOM_VOCABULARY);
  if (!parsed.ok) throw new Error(parsed.reason);
  const NOT = unknownNumber("STATE_NOT_MODELLED");
  const bindings: AtomBindings = {
    comboPoints: NOT,
    comboPointsDeficit: NOT,
    energyPct: NOT,
    knownBuffs: [],
    specAtoms: {
      vocabulary: BLOOD_ATOM_VOCABULARY,
      bound: [{ key: "runic_power.deficit", actionToken: null, value: { kind: "MAGNITUDE", binding } }],
    },
  };
  const result = evaluateSimcExpression(parsed.ast, expression, bindings);
  return result.outcome === "RESOLVED" ? result.value : result.outcome;
}

describe("the pinned constants", () => {
  it("keeps the 1 ms resource window distinct from the 50 ms aura window and the 50 ms threshold tolerance", () => {
    expect(BLOOD_RESOURCE_PRE_DECISION_WINDOW_MS).toBe(1);
    expect(BLOOD_PRE_DECISION_WINDOW_MS).toBe(50);
    expect(BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS).toBe(50);
  });

  it("never reads the change delta's magnitude and never subtracts a cost (source guard)", () => {
    const code = readFileSync("src/specs/deathknight/blood/runic-power-state.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of [
      "resourceChange",
      "observedCost",
      "preWire -",
      "amount -",
      "* RUNIC_POWER_WIRE_DIVISOR",
      "latestObservedAtOrBefore",
      "+ 10",
      "* 10",
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
    expect(code).toContain("changeSign");
  });
});

describe("OWN_PRE_COST — the M11-B2 path, unchanged", () => {
  it("binds the decision's own PRE_COST amount exactly and never reads the history", () => {
    const state = stateOf([
      gain(0, 1000, HEART_STRIKE, 15, 500),
      cast(1, 5000, DEATH_STRIKE, rp(990, { cost: 450 })),
    ]);
    const bound = bind(state, 1);
    expect(bound).toMatchObject({
      state: "BOUND",
      proof: "OWN_PRE_COST",
      binding: { state: "KNOWN_NUMBER", value: 26 },
      currentWire: 990,
      maxWire: 1250,
      carryMs: 0,
    });
    // The resolver's own reading agrees, so the M11-B2 corpus pins do not move.
    const wire = bloodResourceWireTypes(bloodWireKeys(state));
    if (!wire.ok) throw new Error("no wire");
    const own = bloodResourceOn(state, 1, ACTOR, wire.runicPower);
    expect(own).toMatchObject({ state: "EXACT_PRE_COST", amount: 990 });
  });
});

describe("CARRIED_EXACT", () => {
  it("carries a POST_CHANGE anchor to a Blood Boil: the read amount, converted once", () => {
    const state = stateOf([gain(0, 1000, HEART_STRIKE, 15, 780), cast(1, 2000, BLOOD_BOIL, rp(780))]);
    expect(bind(state, 1)).toMatchObject({
      state: "BOUND",
      proof: "CARRIED_EXACT",
      binding: { state: "KNOWN_NUMBER", value: 47 },
      currentWire: 780,
      anchor: { timing: "POST_CHANGE", amount: 780, reportTimeMs: 1000 },
      carryMs: 1000,
      carryEvents: 1,
      windowEntries: [],
    });
  });

  it("carries an uncosted melee snapshot to a Marrowrend and a Death's Caress", () => {
    const state = stateOf([
      gain(0, 1000, HEART_STRIKE, 15, 640),
      cast(1, 1500, MELEE, rp(640)),
      cast(2, 2500, MARROWREND, runes(3, 2)),
      cast(3, 4000, DEATHS_CARESS, runes(1, 1)),
    ]);
    expect(bind(state, 2)).toMatchObject({
      proof: "CARRIED_EXACT",
      currentWire: 640,
      anchor: { timing: "EVENT_ASSOCIATED" },
    });
    // The Marrowrend's own gain was logged AFTER it (position 2 carries runes
    // only), so at the Death's Caress the anchor is still the melee snapshot.
    expect(bind(state, 3)).toMatchObject({ proof: "CARRIED_EXACT", currentWire: 640, carryEvents: 2 });
  });

  it("carries through an independent Runic Attenuation gain, a Blood Mist gain, a fractional Anti-Magic Shell gain and a cap event — each REPLACING the state with its read amount", () => {
    const state = stateOf([
      gain(0, 1000, HEART_STRIKE, 15, 610),
      gain(1, 1300, RUNIC_ATTENUATION, 3, 640),
      gain(2, 1600, BLOOD_MIST, 2, 660),
      gain(3, 1900, AMS, 0, 667), // the game granted 0.7; the delta rounds to 0
      gain(4, 2200, AMS, 15, 826), // 15.9
      gain(5, 2500, HEART_STRIKE, 15, 1250), // capped
      cast(6, 3000, BLOOD_BOIL, rp(1250)),
    ]);
    expect(bind(state, 4)).toMatchObject({
      proof: "CARRIED_EXACT",
      currentWire: 667,
      binding: { value: 58.3 },
    });
    expect(bind(state, 5)).toMatchObject({
      proof: "CARRIED_EXACT",
      currentWire: 826,
      binding: { value: 42.4 },
    });
    expect(bind(state, 6)).toMatchObject({
      proof: "CARRIED_EXACT",
      currentWire: 1250,
      binding: { value: 0 },
    });
  });

  it("re-establishes the state from the first observation after a spend — the number the wire wrote, not pre minus anything", () => {
    const state = stateOf([
      gain(0, 1000, HEART_STRIKE, 15, 990),
      cast(1, 1500, DEATH_STRIKE, rp(990, { cost: 450 })),
      cast(2, 1851, MELEE, rp(640)),
      cast(3, 2500, BLOOD_BOIL, rp(640)),
    ]);
    const bound = bind(state, 3);
    expect(bound).toMatchObject({ proof: "CARRIED_EXACT", currentWire: 640, binding: { value: 61 } });
    expect(bound.state === "BOUND" && bound.anchor.reportTimeMs).toBe(1851);
    // Neither 990 - 450 = 540 nor 990 - 350 = 640 was computed: 640 is what the melee swing carried.
    expect(JSON.stringify(bound)).not.toContain("540");
  });
});

describe("costed casts", () => {
  it("is UNKNOWN after a Death Strike until something observes the amount — the deduction (350, or 250 under Blood Draw) is never applied", () => {
    const state = stateOf([
      gain(0, 1000, HEART_STRIKE, 15, 1110),
      cast(1, 1500, DEATH_STRIKE, rp(1110, { cost: 450 })),
      cast(2, 2251, BLOOD_BOIL, rp(760)),
    ]);
    const bound = bind(state, 2);
    expect(bound).toMatchObject({ state: "UNBOUND", reason: "POST_SPEND_NOT_OBSERVED" });
    expect(bloodRunicPowerDeficitBinding(bound)).toEqual({
      state: "UNKNOWN_NUMBER",
      reason: "STATE_NOT_ESTABLISHED",
    });
    expect(JSON.stringify(bound)).not.toContain("660"); // 1110 - 450
    expect(JSON.stringify(bound)).not.toContain("760"); // 1110 - 350: the Blood Boil's OWN attachment is not consulted for its own decision
  });

  it("uses a Death Strike's PRE_COST as the anchor only in the direction it is good for: after it, unknown", () => {
    const state = stateOf([
      cast(0, 1500, DEATH_STRIKE, rp(1110, { cost: 450 })),
      cast(1, 2251, MARROWREND, runes(3, 2)),
    ]);
    expect(bind(state, 1)).toMatchObject({
      state: "UNBOUND",
      reason: "POST_SPEND_NOT_OBSERVED",
      anchor: { timing: "PRE_COST", amount: 1110 },
    });
  });
});

describe("the 1 ms resource window", () => {
  function heartStrikeWithHeartbreaker(leadMs: number, priorAmount = 1000, afterAmount = 1020) {
    return stateOf([
      gain(0, 1000, VAMPIRIC_STRIKE, 15, priorAmount),
      gain(1, 5000 - leadMs, HEARTBREAKER, 2, afterAmount), // ahead of the cast in order
      cast(2, 5000, HEART_STRIKE, runes(3, 1)),
      gain(3, 5000, HEART_STRIKE, 15, afterAmount + 150), // after the cast in order: never consulted
    ]);
  }

  it.each([0, 1])(
    "bounds the deficit below from a gain at a %d ms lead, without choosing which side of the decision it is on",
    (leadMs) => {
      const bound = bind(heartStrikeWithHeartbreaker(leadMs), 2);
      expect(bound).toMatchObject({
        state: "BOUND",
        proof: "WINDOW_BOUNDED",
        binding: { state: "BOUNDED_NUMBER", atLeast: 23, reason: "STATE_NOT_ESTABLISHED" },
        currentWire: null,
        atMostWire: 1020,
        windowEntries: [{ leadMs, amount: 1020, changeSign: "NON_NEGATIVE", shape: "POST_CHANGE" }],
      });
      // Under either reading (1000 before its own Heartbreaker, or 1020 after an
      // independent one) the deficit is at least 23; neither 25 nor 23 is bound exactly.
      expect(bound.state === "BOUND" && bound.binding.state).not.toBe("KNOWN_NUMBER");
    },
  );

  it("treats a gain at a 2 ms lead as an ordinary prior observation: exact", () => {
    expect(bind(heartStrikeWithHeartbreaker(2), 2)).toMatchObject({
      proof: "CARRIED_EXACT",
      currentWire: 1020,
      binding: { state: "KNOWN_NUMBER", value: 23 },
    });
  });

  it("bounds from the LAST of several window gains", () => {
    const state = stateOf([
      gain(0, 1000, VAMPIRIC_STRIKE, 15, 1013),
      gain(1, 5000, HEARTBREAKER, 2, 1033),
      gain(2, 5000, HEARTBREAKER, 2, 1053),
      cast(3, 5000, HEART_STRIKE, runes(3, 1)),
    ]);
    expect(bind(state, 3)).toMatchObject({
      proof: "WINDOW_BOUNDED",
      atMostWire: 1053,
      binding: { atLeast: 19.7 },
    });
  });

  it("refuses a costed cast or a negative change inside the window", () => {
    const spend = stateOf([
      gain(0, 1000, VAMPIRIC_STRIKE, 15, 1000),
      cast(1, 4999, DEATH_STRIKE, rp(1000, { cost: 450 })),
      cast(2, 5000, HEART_STRIKE, runes(3, 1)),
    ]);
    expect(bind(spend, 2)).toMatchObject({ state: "UNBOUND", reason: "WINDOW_SPEND_AMBIGUOUS" });
    const loss = stateOf([
      gain(0, 1000, VAMPIRIC_STRIKE, 15, 1000),
      gain(1, 5000, HEARTBREAKER, -2, 980),
      cast(2, 5000, HEART_STRIKE, runes(3, 1)),
    ]);
    expect(bind(loss, 2)).toMatchObject({ state: "UNBOUND", reason: "NEGATIVE_CHANGE_UNPINNED" });
  });

  it("bounds even when the state before the window is unknown after a spend: a gain cannot lower Runic Power", () => {
    const state = stateOf([
      cast(0, 1000, DEATH_STRIKE, rp(1110, { cost: 450 })),
      gain(1, 5000, HEARTBREAKER, 2, 780),
      cast(2, 5000, HEART_STRIKE, runes(3, 1)),
    ]);
    expect(bind(state, 2)).toMatchObject({
      proof: "WINDOW_BOUNDED",
      atMostWire: 780,
      binding: { atLeast: 47 },
    });
  });
});

describe("what the bound decides in the pinned gates", () => {
  const bounded = bloodRunicPowerDeficitBinding(
    bind(
      stateOf([
        gain(0, 1000, VAMPIRIC_STRIKE, 15, 700),
        gain(1, 5000, HEARTBREAKER, 2, 720), // deficit >= 53
        cast(2, 5000, HEART_STRIKE, runes(3, 1)),
      ]),
      2,
    ),
  );

  it("proves the sanlayn[2], san_gift[1] and sanlayn[9] deficit gates FALSE from a lower bound", () => {
    expect(bounded).toEqual({ state: "BOUNDED_NUMBER", atLeast: 53, reason: "STATE_NOT_ESTABLISHED" });
    expect(deficitTruth("runic_power.deficit<20", bounded)).toBe(false);
    expect(deficitTruth("runic_power.deficit<36", bounded)).toBe(false);
    expect(deficitTruth("runic_power.deficit<40", bounded)).toBe(false);
    expect(deficitTruth("runic_power.deficit<40|fight_remains<10", bounded)).toBe("UNRESOLVED");
  });

  it("never proves a gate TRUE from a lower bound, and offers no upper bound", () => {
    const high = bloodRunicPowerDeficitBinding(
      bind(
        stateOf([
          gain(0, 1000, VAMPIRIC_STRIKE, 15, 1180),
          gain(1, 5000, HEARTBREAKER, 2, 1200), // deficit >= 5: could be 5 or 7
          cast(2, 5000, HEART_STRIKE, runes(3, 1)),
        ]),
        2,
      ),
    );
    expect(high).toMatchObject({ state: "BOUNDED_NUMBER", atLeast: 5 });
    expect(deficitTruth("runic_power.deficit<20", high)).toBe("UNRESOLVED");
    expect(deficitTruth("runic_power.deficit>=5", high)).toBe(true);
    expect(Object.keys(high)).toEqual(["state", "atLeast", "reason"]);
  });

  it("decides both ways from an exact carry, and the resolver binds the supplied number", () => {
    const exact = bloodRunicPowerDeficitBinding(
      bind(stateOf([gain(0, 1000, HEART_STRIKE, 15, 1100), cast(1, 2000, BLOOD_BOIL, rp(1100))]), 1),
    );
    expect(exact).toEqual({ state: "KNOWN_NUMBER", value: 15 });
    expect(deficitTruth("runic_power.deficit<20", exact)).toBe(true);
    expect(deficitTruth("runic_power.deficit<36", exact)).toBe(true);
    const resolution = resolveBloodAtoms({
      runes: { state: "NO_OBSERVATION", reason: "test" },
      runicPower: { state: "NO_OBSERVATION", reason: "test" },
      runicPowerDeficit: exact,
      heroTree: { state: "UNKNOWN" },
      fightTimeMs: 2000,
    });
    expect(resolution.specAtoms.bound.find((b) => b.key === "runic_power.deficit")?.value).toEqual({
      kind: "MAGNITUDE",
      binding: exact,
    });
    expect(resolution.diagnostics.runicPowerDeficit).toBe(15);
  });
});

describe("refusals", () => {
  it("has no anchor from silence, and never a value", () => {
    const state = stateOf([
      cast(0, 5000, BLOOD_BOIL, attachedResources({ side: "SOURCE", actorId: ACTOR, classResources: [] })),
    ]);
    expect(bind(state, 0)).toMatchObject({
      state: "UNBOUND",
      reason: "NO_ANCHOR",
      stateReason: "NO_OBSERVATION",
    });
  });

  it("refuses a RESOURCES gap and a CASTS gap between the anchor and the decision", () => {
    const events = [gain(0, 1000, HEART_STRIKE, 15, 700), cast(1, 5000, BLOOD_BOIL, rp(700))];
    const resources = stateOf(events, {
      categories: {
        RESOURCES: partialCategory([inclusiveRange(1000, 2500)]),
        CASTS: observableCategory(inclusiveRange(1000, 60_000)),
        AURAS: observableCategory(inclusiveRange(1000, 60_000)),
      },
    });
    expect(bind(resources, 1)).toMatchObject({
      state: "UNBOUND",
      reason: "CONTINUITY_FROM_ANCHOR_UNKNOWN",
      stateReason: "INSUFFICIENT_COVERAGE",
    });
    const casts = stateOf(events, {
      categories: {
        RESOURCES: observableCategory(inclusiveRange(1000, 60_000)),
        CASTS: absentCategory(),
        AURAS: observableCategory(inclusiveRange(1000, 60_000)),
      },
    });
    expect(bind(casts, 1)).toMatchObject({ state: "UNBOUND", reason: "CASTS_CONTINUITY_UNKNOWN" });
  });

  it("refuses an uncosted snapshot that disagrees with the exact state carried to it — never re-anchored around", () => {
    const state = stateOf([
      gain(0, 1000, HEART_STRIKE, 15, 700),
      cast(1, 2000, MELEE, rp(730)), // 30 tenths appeared with no observed change
      cast(2, 3000, BLOOD_BOIL, rp(730)),
    ]);
    expect(bind(state, 2)).toMatchObject({ state: "UNBOUND", reason: "EVIDENCE_CONTRADICTS_CARRY" });
    // An agreeing snapshot corroborates, and a snapshot after a spend re-establishes.
    const agreeing = stateOf([
      gain(0, 1000, HEART_STRIKE, 15, 700),
      cast(1, 2000, MELEE, rp(700)),
      cast(2, 3000, BLOOD_BOIL, rp(700)),
    ]);
    expect(bind(agreeing, 2)).toMatchObject({ proof: "CARRIED_EXACT", currentWire: 700 });
  });

  it("refuses a missing max and a changed max rather than picking one", () => {
    const missing = stateOf([
      gain(0, 1000, HEART_STRIKE, 15, 700, undefined as unknown as number),
      cast(1, 5000, BLOOD_BOIL, rp(700)),
    ]);
    // The synthetic helper wrote max null for the gain's attachment.
    const missingBound = bind(missing, 1);
    expect(["MAX_NOT_ESTABLISHED", "CARRIED_EXACT"]).toContain(
      missingBound.state === "BOUND" ? missingBound.proof : missingBound.reason,
    );
    const explicit = stateOf([
      resourceChangeEvent({
        ordinal: 0,
        reportTimeMs: 1000,
        sourceActorId: ACTOR,
        targetActorId: ACTOR,
        abilityGameId: HEART_STRIKE,
        resourceType: RP,
        resourceChange: 15,
        maxResourceAmount: null,
        attachedResources: attachedResources({
          side: "SOURCE",
          actorId: ACTOR,
          classResources: [classResource(RP, 700, { max: null })],
        }),
      }),
      cast(1, 5000, BLOOD_BOIL, rp(700)),
    ]);
    expect(bind(explicit, 1)).toMatchObject({ state: "UNBOUND", reason: "MAX_NOT_ESTABLISHED" });
    const changed = stateOf([
      gain(0, 1000, HEART_STRIKE, 15, 700, 1250),
      resourceChangeEvent({
        ordinal: 1,
        reportTimeMs: 2000,
        sourceActorId: ACTOR,
        targetActorId: ACTOR,
        abilityGameId: RUNIC_ATTENUATION,
        resourceType: RP,
        resourceChange: 3,
        maxResourceAmount: 1350,
        attachedResources: attachedResources({ side: "SOURCE", actorId: ACTOR, classResources: [] }),
      }),
      cast(2, 5000, BLOOD_BOIL, rp(700)),
    ]);
    expect(bind(changed, 2)).toMatchObject({ state: "UNBOUND", reason: "MAX_CHANGED" });
  });

  it("refuses a change of the actor's Runic Power that carries no post-change attachment", () => {
    const state = stateOf([
      gain(0, 1000, HEART_STRIKE, 15, 700, 1250),
      resourceChangeEvent({
        ordinal: 1,
        reportTimeMs: 2000,
        sourceActorId: ACTOR,
        targetActorId: ACTOR,
        abilityGameId: RUNIC_ATTENUATION,
        resourceType: RP,
        resourceChange: 3,
        maxResourceAmount: 1250,
        attachedResources: attachedResources({ side: "SOURCE", actorId: ACTOR, classResources: [] }),
      }),
      cast(2, 5000, BLOOD_BOIL, rp(730)),
    ]);
    expect(bind(state, 2)).toMatchObject({ state: "UNBOUND", reason: "CHANGE_WITHOUT_POST_STATE" });
  });
});

describe("over the committed evidence", () => {
  const bundle = corpusBundleState(BUNDLE, []);

  it("measures the ordering the window rests on: own principal gains after the cast, Heartbreaker and Relish in Blood 0-1 ms ahead", () => {
    const wire = bloodResourceWireTypes(bloodWireKeys(bundle));
    if (!wire.ok) throw new Error("no wire");
    const ahead = new Map<string, number>();
    const after = new Map<string, number>();
    const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
    const casts = bundle.positionsBySourceActor(ACTOR).filter((position) => {
      const event = bundle.eventAt(position);
      return (
        event?.kind === "CAST" &&
        event.castPhase === "COMPLETE" &&
        [HEART_STRIKE, VAMPIRIC_STRIKE, MARROWREND, DEATHS_CARESS, DND].includes(event.abilityGameId ?? -1)
      );
    });
    for (const position of casts) {
      const event = bundle.eventAt(position);
      if (event === null) continue;
      for (const change of bundle.resources.standaloneChangePositionsFor(ACTOR, wire.runicPower)) {
        const other = bundle.eventAt(change);
        if (other === null || Math.abs(other.reportTimeMs - event.reportTimeMs) > 1) continue;
        const own =
          other.abilityGameId === event.abilityGameId ||
          (event.abilityGameId === DND && other.abilityGameId === RELISH);
        const proc = other.abilityGameId === HEARTBREAKER || other.abilityGameId === RELISH;
        const key = `${String(event.abilityGameId)} <- ${String(other.abilityGameId)} ${own && !proc ? "principal" : proc ? "proc" : "other"}`;
        bump(
          change < position ? ahead : after,
          `${key} lead ${String(event.reportTimeMs - other.reportTimeMs)}`,
        );
      }
    }
    // Principal gains: always AFTER the cast in order.
    expect([...ahead.keys()].some((key) => key.includes("principal"))).toBe(false);
    expect(Object.fromEntries([...after].filter(([key]) => key.includes("principal")))).toEqual({
      "206930 <- 206930 principal lead 0": 31,
      "206930 <- 206930 principal lead -1": 1,
      "433895 <- 433895 principal lead 0": 26,
      "433895 <- 433895 principal lead -1": 1,
      "195182 <- 195182 principal lead 0": 5,
      "195292 <- 195292 principal lead 0": 3,
      "43265 <- 43265 principal lead 0": 2,
    });
    // Proc gains: AHEAD of the cast in order, 0 or 1 ms.
    expect(Object.fromEntries([...ahead].filter(([key]) => key.includes("proc")))).toEqual({
      "206930 <- 210738 proc lead 0": 40,
      "206930 <- 210738 proc lead 1": 2,
      "433895 <- 210738 proc lead 0": 31,
      "433895 <- 210738 proc lead 1": 5,
      "43265 <- 317614 proc lead 0": 8,
      "43265 <- 317614 proc lead 1": 1,
    });
    expect([...after.keys()].some((key) => key.includes("proc"))).toBe(false);
  });

  it("bounds the Heart Strike at 2,020,278 from its Heartbreaker gain ahead of it, and carries exactly to the Blood Boil at 2,021,775", () => {
    const state = corpusState(BLOOD45);
    expect(bind(state, at(state, 2_020_278, HEART_STRIKE))).toMatchObject({
      proof: "WINDOW_BOUNDED",
      atMostWire: 930,
      binding: { state: "BOUNDED_NUMBER", atLeast: 32 },
      windowEntries: [{ leadMs: 0, amount: 930, shape: "POST_CHANGE" }],
    });
    // The Blood Boil at 2,021,775 follows the Death Strike at 2,021,024 with no observation between: unknown.
    expect(bind(state, at(state, 2_021_775, BLOOD_BOIL))).toMatchObject({
      state: "UNBOUND",
      reason: "POST_SPEND_NOT_OBSERVED",
    });
  });

  it("refuses the pull Death's Caress (no anchor) and binds the first Death Strike from its own cast", () => {
    const state = corpusState(BLOOD45);
    expect(bind(state, at(state, 2_004_615, DEATHS_CARESS))).toMatchObject({
      state: "UNBOUND",
      reason: "NO_ANCHOR",
    });
    expect(bind(state, at(state, 2_012_014, DEATH_STRIKE))).toMatchObject({
      proof: "OWN_PRE_COST",
      currentWire: 990,
      binding: { value: 26 },
    });
  });

  it("carries a Heartbreaker-free Vampiric Strike exactly and an opener Blood Boil from a melee swing", () => {
    const opener = corpusState(GTKB);
    expect(bind(opener, at(opener, 2_417_826, BLOOD_BOIL))).toMatchObject({
      proof: "CARRIED_EXACT",
      anchor: { timing: "EVENT_ASSOCIATED" },
    });
  });
});
