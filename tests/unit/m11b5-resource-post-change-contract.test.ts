/**
 * M11-B5: the `POST_CHANGE` resource timing — the narrow wire contract and
 * the whole-window reconciliation that established it.
 *
 * THE CONTRACT. An attachment on a normalized `RESOURCE_CHANGE` event whose
 * resource type IS the type that event changed reports the amount AFTER the
 * change. Nothing else is POST_CHANGE: a second pool's snapshot on the same
 * event, an uncosted cast, a damage event — all stay EVENT_ASSOCIATED; a
 * positively costed completed cast stays PRE_COST.
 *
 * THE EVIDENCE, reproduced here as the retrospective validation of the
 * M11-B5 design audit: over the committed Blood captures, carrying the
 * latest exact observed state forward — a `resourcechange` REPLACES it with
 * the attachment (never `previous + resourceChange`), a costed cast makes it
 * unknown until the next observation — reproduces every later Death Strike
 * PRE_COST amount and every later uncosted attachment. The delta is checked
 * beside the attachment ONLY to show which of the two is exact: it sums at
 * every integer gain and cap, and is a rounded whole number at the
 * Anti-Magic Shell gains where the attachment carries the fraction.
 *
 * The later observations are validation only. Nothing here builds an earlier
 * value from a later one.
 */

import { describe, expect, it } from "vitest";

import { RESOURCE_OBSERVATION_TIMINGS } from "../../src/engine/resources/resource-observations.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import { bloodResourceWireTypes } from "../../src/specs/deathknight/blood/resources.js";
import { corpusBundleState, corpusState } from "../support/corpus/fight.js";
import {
  attachedResources,
  castEvent,
  classResource,
  resourceChangeEvent,
  syntheticFight,
} from "../support/synthetic-fight.js";

const ACTOR = 14;
const ENERGY = 3;
const COMBO = 4;
const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
const BUNDLE = [
  BLOOD45,
  "wcl-blood-death-knight-a7r6-rotational-165s.seg-45-105",
  "wcl-blood-death-knight-a7r6-rotational-165s.seg-105-165",
];
const GTKB = "wcl-blood-death-knight-gtkb-opener";
const AMS = 49088;

function runicPowerWireType(): number {
  const wire = bloodResourceWireTypes();
  if (wire === null) throw new Error("no Runic Power wire contract");
  return wire.runicPower;
}

describe("the timing contract", () => {
  it("admits exactly three timings, with POST_CHANGE between the two established ones and the default", () => {
    // RE-POINTED for M11-B5: `POST_CHANGE` was withheld until whole-window
    // reconciliation established it (below). POST_COST and PRE_CHANGE remain
    // unspellable.
    expect([...RESOURCE_OBSERVATION_TIMINGS]).toEqual(["PRE_COST", "POST_CHANGE", "EVENT_ASSOCIATED"]);
    expect(RESOURCE_OBSERVATION_TIMINGS).not.toContain("POST_COST");
    expect(RESOURCE_OBSERVATION_TIMINGS).not.toContain("PRE_CHANGE");
  });

  it("tags the changed type's attachment on a resourcechange POST_CHANGE, and a second pool's attachment EVENT_ASSOCIATED", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["RESOURCES", "CASTS"],
        events: [
          resourceChangeEvent({
            ordinal: 0,
            reportTimeMs: 1500,
            sourceActorId: ACTOR,
            targetActorId: ACTOR,
            abilityGameId: 1,
            resourceType: ENERGY,
            resourceChange: 10,
            attachedResources: attachedResources({
              side: "SOURCE",
              actorId: ACTOR,
              classResources: [classResource(ENERGY, 60, { max: 100 }), classResource(COMBO, 3, { max: 7 })],
            }),
          }),
        ],
      }),
    );
    const energy = state.resources.observationOnEvent(0, ACTOR, ENERGY);
    expect(energy.certainty === "EXACT" && energy.value.timing).toBe("POST_CHANGE");
    expect(energy.certainty === "EXACT" && energy.value.observedAmount).toBe(60);
    const combo = state.resources.observationOnEvent(0, ACTOR, COMBO);
    expect(combo.certainty === "EXACT" && combo.value.timing).toBe("EVENT_ASSOCIATED");
  });

  it("leaves an uncosted cast EVENT_ASSOCIATED and a costed cast PRE_COST — the contract widened by one event kind only", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["RESOURCES", "CASTS"],
        events: [
          castEvent({
            ordinal: 0,
            reportTimeMs: 1500,
            castPhase: "COMPLETE",
            sourceActorId: ACTOR,
            targetActorId: 22,
            abilityGameId: 1,
            attachedResources: attachedResources({
              side: "SOURCE",
              actorId: ACTOR,
              classResources: [classResource(ENERGY, 60, { max: 100 })],
            }),
          }),
          castEvent({
            ordinal: 1,
            reportTimeMs: 1600,
            castPhase: "COMPLETE",
            sourceActorId: ACTOR,
            targetActorId: 22,
            abilityGameId: 2,
            attachedResources: attachedResources({
              side: "SOURCE",
              actorId: ACTOR,
              classResources: [classResource(ENERGY, 60, { max: 100, cost: 35 })],
            }),
          }),
        ],
      }),
    );
    expect(state.resources.observationOnEvent(0, ACTOR, ENERGY)).toMatchObject({
      certainty: "EXACT",
      value: { timing: "EVENT_ASSOCIATED" },
    });
    expect(state.resources.observationOnEvent(1, ACTOR, ENERGY)).toMatchObject({
      certainty: "EXACT",
      value: { timing: "PRE_COST" },
    });
  });
});

/**
 * The reconciliation. Walks every observation of the actor's Runic Power in
 * canonical order, carrying the latest exact state, and counts what each
 * later observation does to it. No delta is ever added to produce a state;
 * the delta is compared beside the attachment only to classify the event.
 */
function reconcile(state: CombatState) {
  const type = runicPowerWireType();
  const positions = [
    ...new Set([
      ...state.resources.snapshotPositionsFor(ACTOR, type),
      ...state.resources.standaloneChangePositionsFor(ACTOR, type),
    ]),
  ].sort((a, b) => a - b);
  const counts = {
    observations: positions.length,
    postChange: 0,
    integerGainsReconciled: 0,
    capEvents: 0,
    fractionalGainsAttachmentExact: 0,
    preCostMatches: 0,
    uncostedMatches: 0,
    hiddenChangeMismatches: 0,
    maxValues: new Set<number>(),
  };
  const mismatches: string[] = [];
  let carried: number | null = null; // the latest exact state, or null after a costed cast
  for (const position of positions) {
    const snapshot = state.resources.observationOnEvent(position, ACTOR, type);
    const change = state.resources.standaloneChangeOnEvent(position);
    if (snapshot.certainty !== "EXACT") throw new Error(`no snapshot at ${String(position)}`);
    const { observedAmount: amount, observedMax: max, timing } = snapshot.value;
    if (max !== null) counts.maxValues.add(max);
    if (timing === "POST_CHANGE") {
      counts.postChange += 1;
      if (change.certainty !== "EXACT")
        throw new Error(`POST_CHANGE without a change at ${String(position)}`);
      const delta = change.value.resourceChange;
      if (carried !== null && max !== null) {
        // Classification only. The state is `amount`, read, whatever this says.
        const summed = carried + delta * 10;
        const capped = Math.min(summed, max);
        if (capped === amount && summed > max) counts.capEvents += 1;
        else if (capped === amount) counts.integerGainsReconciled += 1;
        else if (change.value.source?.actorId === ACTOR && amountOfAbility(state, position) === AMS) {
          // Anti-Magic Shell: the game moved a fraction; the delta is rounded.
          counts.fractionalGainsAttachmentExact += 1;
        } else {
          counts.hiddenChangeMismatches += 1;
          mismatches.push(
            `POST_CHANGE at ${String(snapshot.value.reportTimeMs)}: carried ${String(carried)} + ${String(delta)}0 != ${String(amount)}`,
          );
        }
      }
      carried = amount;
    } else if (timing === "PRE_COST") {
      if (carried !== null) {
        if (carried === amount) counts.preCostMatches += 1;
        else {
          counts.hiddenChangeMismatches += 1;
          mismatches.push(
            `PRE_COST at ${String(snapshot.value.reportTimeMs)}: carried ${String(carried)} != ${String(amount)}`,
          );
        }
      }
      carried = null; // the amount after the cost is not observed
    } else {
      if (carried !== null) {
        if (carried === amount) counts.uncostedMatches += 1;
        else {
          counts.hiddenChangeMismatches += 1;
          mismatches.push(
            `uncosted at ${String(snapshot.value.reportTimeMs)}: carried ${String(carried)} != ${String(amount)}`,
          );
        }
      }
      carried = amount;
    }
  }
  return { counts, mismatches };
}

function amountOfAbility(state: CombatState, position: number): number | null {
  const event = state.eventAt(position);
  return event === null ? null : event.abilityGameId;
}

describe("the whole-window reconciliation that established POST_CHANGE (validation only)", () => {
  it("reproduces every later PRE_COST and uncosted amount over the 165 s bundle with zero hidden changes", () => {
    const { counts, mismatches } = reconcile(corpusBundleState(BUNDLE, []));
    expect(mismatches).toEqual([]);
    expect(counts).toMatchObject({
      observations: 459,
      postChange: 245,
      integerGainsReconciled: 200,
      capEvents: 8,
      fractionalGainsAttachmentExact: 15,
      preCostMatches: 44,
      uncostedMatches: 147,
      hiddenChangeMismatches: 0,
    });
    expect([...counts.maxValues]).toEqual([1250]);
    // The classification partitions the POST_CHANGE population that had a carried state to compare against.
    expect(counts.integerGainsReconciled + counts.capEvents + counts.fractionalGainsAttachmentExact).toBe(
      223,
    );
  });

  it("reproduces the opener the same way", () => {
    const { counts, mismatches } = reconcile(corpusState(GTKB));
    expect(mismatches).toEqual([]);
    expect(counts).toMatchObject({
      observations: 84,
      postChange: 45,
      integerGainsReconciled: 38,
      capEvents: 0,
      fractionalGainsAttachmentExact: 5,
      preCostMatches: 6,
      uncostedMatches: 28,
      hiddenChangeMismatches: 0,
    });
    expect([...counts.maxValues]).toEqual([1250]);
  });

  it("shows the attachment exact where the delta is rounded: the first Anti-Magic Shell gain of the bundle", () => {
    const state = corpusBundleState(BUNDLE, []);
    const type = runicPowerWireType();
    const positions = state.resources.standaloneChangePositionsFor(ACTOR, type);
    const first = positions.find((position) => amountOfAbility(state, position) === AMS);
    if (first === undefined) throw new Error("no Anti-Magic Shell gain in the bundle");
    const change = state.resources.standaloneChangeOnEvent(first);
    const snapshot = state.resources.observationOnEvent(first, ACTOR, type);
    // The preceding uncosted attachment reads 610; the game granted 0.7 RP, the
    // wire rounds the delta to 0, and the attachment carries 617. Summing the
    // delta would have said 610.
    expect(change.certainty === "EXACT" && change.value.resourceChange).toBe(0);
    expect(snapshot.certainty === "EXACT" && snapshot.value.observedAmount).toBe(617);
    expect(snapshot.certainty === "EXACT" && snapshot.value.timing).toBe("POST_CHANGE");
  });
});
