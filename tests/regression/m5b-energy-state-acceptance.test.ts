import { describe, expect, it } from "vitest";

import { createCombatState } from "../../src/engine/state/combat-state.js";
import { staleObservation, unknownState } from "../../src/engine/state/state-result.js";
import type { ResourceAmountObservation } from "../../src/engine/resources/resource-observations.js";
import { acceptExactPreCost, adaptEnergyPct } from "../../src/specs/rogue/assassination/envenom-decision.js";
import { selectAssassinationSpendAction } from "../../src/specs/rogue/assassination/evaluator.js";
import { attachedResources, castEvent, classResource, syntheticFight } from "../support/synthetic-fight.js";
import { m5aStateWithVersions, scopedSelectionOf } from "../support/m5a-fixture.js";

/**
 * THE ENERGY ADAPTER, AND EVERY WAY IT REFUSES.
 *
 * `energy.pct` is the one piece of NEW state M5-B reads, and it is the one place
 * a number could be invented. The adapter therefore accepts exactly one shape —
 * an EXACT / OBSERVED / PRE_COST observation carried on the cast itself, with a
 * usable maximum — and every other shape fails closed with a blocker naming the
 * actual remedy.
 *
 * The percentage contract, restated: SimulationCraft's `energy.pct` is a
 * percentage from 0 to 100, and a ratio of two numbers from the SAME observation
 * is independent of the scale they are encoded on. So the adapter never needs to
 * know Warcraft Logs' absolute Energy units, and never assumes they match
 * anyone else's.
 */

const ROGUE = 19;
const ENERGY_WIRE_TYPE = 3;
const COMBO_POINTS_WIRE_TYPE = 4;
const ENVENOM = 32_645;

const locator = {
  streamId: "all",
  pageOrdinal: 0,
  indexInPage: 0,
  ingestionOrdinal: 0,
  rawType: "cast",
  reportTimeMs: 1200,
};

function energyObservation(overrides: Partial<ResourceAmountObservation>): ResourceAmountObservation {
  return {
    position: 0,
    locator,
    side: "SOURCE",
    actor: { kind: "ACTOR", actorId: ROGUE, actorInstanceId: null },
    resourceType: ENERGY_WIRE_TYPE,
    observedAmount: 233,
    observedMax: 250,
    observedCost: 35,
    timing: "PRE_COST",
    attachedToRawType: "cast",
    reportTimeMs: 1200,
    fightTimeMs: 200,
    ...overrides,
  } as ResourceAmountObservation;
}

/** One synthetic Envenom carrying whatever resource entries a case needs. */
function stateWith(entries: readonly ReturnType<typeof classResource>[]) {
  return createCombatState(
    syntheticFight({
      observedCategories: ["CASTS", "RESOURCES"],
      events: [
        castEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          castPhase: "COMPLETE",
          sourceActorId: ROGUE,
          abilityGameId: ENVENOM,
          attachedResources: attachedResources({
            side: "SOURCE",
            actorId: ROGUE,
            classResources: entries as ReturnType<typeof classResource>[],
          }),
        }),
      ],
    }),
  );
}

function scopedStatusFor(entries: readonly ReturnType<typeof classResource>[]) {
  const run = selectAssassinationSpendAction(stateWith(entries), { actorId: ROGUE });
  if (run.outcome !== "EVALUATED") throw new Error(`expected EVALUATED, got ${run.outcome}`);
  const finding = run.findings[0];
  if (finding === undefined) throw new Error("expected one scoped finding");
  return scopedSelectionOf(finding);
}

describe("the percentage is computed, never rounded or special-cased", () => {
  it.each([
    [250, 250, 100],
    [233, 250, 93.2],
    [183, 250, 73.2],
    [175, 250, 70],
    [0, 250, 0],
    [1, 3, 33.33333333333333],
  ])("%i of %i is %f percent", (amount, max, percent) => {
    const result = adaptEnergyPct(energyObservation({ observedAmount: amount, observedMax: max }), "ENERGY");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.percent).toBe(percent);
  });

  it("is scale-invariant, so the absolute encoding never matters", () => {
    // The same pool at the same fill, reported on three different scales. A
    // percentage cannot tell them apart, which is exactly why the adapter is
    // defined as a ratio rather than as a raw amount.
    const scales = [
      adaptEnergyPct(energyObservation({ observedAmount: 70, observedMax: 100 }), "ENERGY"),
      adaptEnergyPct(energyObservation({ observedAmount: 175, observedMax: 250 }), "ENERGY"),
      adaptEnergyPct(energyObservation({ observedAmount: 700, observedMax: 1000 }), "ENERGY"),
    ];
    for (const scale of scales) {
      expect(scale.ok).toBe(true);
      if (!scale.ok) return;
      expect(scale.percent).toBe(70);
    }
  });

  it("records the observation it came from, with no delta replayed", () => {
    const result = adaptEnergyPct(energyObservation({}), "ENERGY");
    if (!result.ok) return;
    expect(result.state).toEqual({
      resourceId: "ENERGY",
      wireType: ENERGY_WIRE_TYPE,
      observedAmount: 233,
      observedMax: 250,
      derivedDeficit: 17,
      timing: "PRE_COST",
    });
    // `observedCost` is NOT subtracted anywhere. PRE_COST makes one instant
    // knowable; it does not make the instant after the cost knowable.
    expect(JSON.stringify(result.state)).not.toContain("198");
  });
});

describe("an unusable maximum fails closed rather than being invented", () => {
  it.each([
    ["a null maximum", { observedMax: null }],
    ["a zero maximum", { observedMax: 0 }],
    ["a negative maximum", { observedMax: -250 }],
    ["a non-finite maximum", { observedMax: Number.POSITIVE_INFINITY }],
    ["a NaN maximum", { observedMax: Number.NaN }],
    ["an amount above the maximum", { observedAmount: 300, observedMax: 250 }],
  ])("refuses %s with RESOURCE_MAX_UNKNOWN", (_label, overrides) => {
    // 100, 150 and 250 are all plausible Energy maxima for some build. None of
    // them may be substituted here.
    const result = adaptEnergyPct(energyObservation(overrides), "ENERGY");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("RESOURCE_MAX_UNKNOWN");
    // Structural, not a substring sweep: the refusal branch of the union has no
    // `percent` field at all, so there is no number to read a default out of.
    expect(result).not.toHaveProperty("percent");
    expect(result).not.toHaveProperty("state");
  });

  it.each([
    ["a negative amount", { observedAmount: -5 }],
    ["a non-finite amount", { observedAmount: Number.NaN }],
  ])("refuses %s with AMOUNT_UNUSABLE", (_label, overrides) => {
    const result = adaptEnergyPct(energyObservation(overrides), "ENERGY");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("AMOUNT_UNUSABLE");
  });

  it("accepts a fractional amount, unlike a discrete resource", () => {
    // Combo points are a count and integrality is part of plausibility. An
    // Energy amount carries no such guarantee, and rejecting a real fractional
    // reading would fail closed for the wrong reason.
    const result = adaptEnergyPct(energyObservation({ observedAmount: 124.5 }), "ENERGY");
    expect(result.ok).toBe(true);
  });
});

describe("only an EXACT / OBSERVED / PRE_COST observation is decision state", () => {
  it("refuses a STALE carried-forward Energy reading", () => {
    // Energy regenerates continuously. An earlier reading is the sharpest
    // possible wrong answer: it was real, and it is not what the player had.
    const acceptance = acceptExactPreCost(
      staleObservation(energyObservation({}), 1000, 1200, [locator], "RESOURCES"),
    );
    expect(acceptance.accepted).toBe(false);
    if (acceptance.accepted) return;
    expect(acceptance.detail).toContain("carried-forward");
  });

  it("refuses an EVENT_ASSOCIATED reading", () => {
    const acceptance = acceptExactPreCost({
      certainty: "EXACT",
      derivation: "OBSERVED",
      value: energyObservation({ timing: "EVENT_ASSOCIATED" }),
      provenance: { locators: [locator], category: "RESOURCES" },
    });
    expect(acceptance.accepted).toBe(false);
    if (acceptance.accepted) return;
    expect(acceptance.detail).toContain("EVENT_ASSOCIATED");
  });

  it("refuses an absent observation without substituting zero", () => {
    const acceptance = acceptExactPreCost(unknownState("NO_OBSERVATION", [], "RESOURCES"));
    expect(acceptance.accepted).toBe(false);
    if (acceptance.accepted) return;
    expect(acceptance.detail).toContain("NO_OBSERVATION");
  });
});

describe("the scoped run fails closed on real state shapes", () => {
  it("blocks when the cast carries no Energy entry at all", () => {
    // Combo points present, Energy absent. Never 0% and never 100%.
    const selection = scopedStatusFor([classResource(COMBO_POINTS_WIRE_TYPE, 7, { max: 7, cost: 7 })]);
    expect(selection.status).toBe("UNKNOWN");
    if (selection.status !== "UNKNOWN") return;
    expect(selection.blocker).toBe("EXACT_RESOURCE_UNAVAILABLE");
    expect(JSON.stringify(selection)).not.toContain('"ENERGY"');
  });

  it("blocks when the Energy entry carries no maximum", () => {
    const selection = scopedStatusFor([
      classResource(COMBO_POINTS_WIRE_TYPE, 7, { max: 7, cost: 7 }),
      classResource(ENERGY_WIRE_TYPE, 233, { max: null, cost: 35 }),
    ]);
    expect(selection.status).toBe("UNKNOWN");
    if (selection.status !== "UNKNOWN") return;
    expect(selection.blocker).toBe("RESOURCE_MAX_UNKNOWN");
  });

  it("blocks when the Energy entry has a zero cost, making its timing unestablished", () => {
    // A zero cost establishes no ordering, so M4 tags the entry
    // EVENT_ASSOCIATED and it cannot be read as the pre-cast amount.
    const selection = scopedStatusFor([
      classResource(COMBO_POINTS_WIRE_TYPE, 7, { max: 7, cost: 7 }),
      classResource(ENERGY_WIRE_TYPE, 233, { max: 250, cost: 0 }),
    ]);
    expect(selection.status).toBe("UNKNOWN");
    if (selection.status !== "UNKNOWN") return;
    expect(selection.blocker).toBe("EXACT_RESOURCE_UNAVAILABLE");
    expect(selection.detail).toContain("EVENT_ASSOCIATED");
  });

  it("blocks on the combo-point gap before it ever looks at Energy", () => {
    const selection = scopedStatusFor([classResource(ENERGY_WIRE_TYPE, 250, { max: 250, cost: 35 })]);
    expect(selection.status).toBe("UNKNOWN");
    if (selection.status !== "UNKNOWN") return;
    expect(selection.blocker).toBe("EXACT_RESOURCE_UNAVAILABLE");
    expect(selection.observedState).toEqual([]);
  });

  it("selects when both resources are present and exact", () => {
    const selection = scopedStatusFor([
      classResource(COMBO_POINTS_WIRE_TYPE, 7, { max: 7, cost: 7 }),
      classResource(ENERGY_WIRE_TYPE, 250, { max: 250, cost: 35 }),
    ]);
    expect(selection.status).toBe("SELECTED_BY_AUTHORITY");
  });
});

describe("the Energy wire contract is version-scoped and fails closed", () => {
  it.each([
    ["a later parser version", { logVersion: 18 }],
    ["an earlier parser version", { logVersion: 16 }],
    ["a different game", { gameVersion: 2 }],
    ["an unstated game", { gameVersion: null }],
  ])("declines the whole run under %s", (_label, overrides) => {
    // Not a per-cast UNKNOWN: without the wire contract the decision surface
    // itself is unreadable, so the run never begins.
    const run = selectAssassinationSpendAction(m5aStateWithVersions(overrides), { actorId: ROGUE });
    expect(run.outcome).toBe("NOT_EVALUATED");
    if (run.outcome !== "NOT_EVALUATED") return;
    expect(run.reason).toBe("INCOMPATIBLE_RESOURCE_WIRE_VERSION");
    expect(run).not.toHaveProperty("findings");
  });

  it("never hard-codes the Energy wire type outside the contract module", () => {
    // Enforced mechanically by the M5 boundary contract; asserted here as the
    // behavioural half: the number reaches the query through the gated accessor.
    const selection = scopedStatusFor([
      classResource(COMBO_POINTS_WIRE_TYPE, 7, { max: 7, cost: 7 }),
      classResource(ENERGY_WIRE_TYPE, 250, { max: 250, cost: 35 }),
    ]);
    if (selection.status !== "SELECTED_BY_AUTHORITY") return;
    expect(selection.observedState.find((entry) => entry.resourceId === "ENERGY")?.wireType).toBe(3);
  });
});
