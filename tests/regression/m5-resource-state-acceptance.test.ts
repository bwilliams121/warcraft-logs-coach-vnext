import { describe, expect, it } from "vitest";

import { createCombatState } from "../../src/engine/state/combat-state.js";
import {
  boundedDerived,
  exactDerived,
  exactObserved,
  staleObservation,
  unknownState,
} from "../../src/engine/state/state-result.js";
import type { ResourceAmountObservation } from "../../src/engine/resources/resource-observations.js";
import { acceptExactPreCost } from "../../src/specs/rogue/assassination/envenom-decision.js";
import { evaluateAssassinationEnvenom } from "../../src/specs/rogue/assassination/evaluator.js";
import { attachedResources, castEvent, classResource, syntheticFight } from "../support/synthetic-fight.js";

/**
 * Only an EXACT / OBSERVED / PRE_COST observation carried ON the cast counts as
 * decision state.
 *
 * Each refusal below closes a different door, and all four doors lead to the
 * same place: a combo-point number that was not the player's state when they
 * pressed the button.
 *
 * `observationOnEvent` cannot currently return STALE — it reads one event. The
 * refusal is still tested directly, because a rule that holds only by accident
 * of today's call site is not a rule anyone can rely on tomorrow.
 */

const ROGUE = 19;
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

function observation(timing: "PRE_COST" | "EVENT_ASSOCIATED"): ResourceAmountObservation {
  return {
    position: 0,
    locator,
    side: "SOURCE",
    actor: { actorId: ROGUE, instanceId: null },
    resourceType: COMBO_POINTS_WIRE_TYPE,
    observedAmount: 3,
    observedMax: 7,
    observedCost: 3,
    timing,
    attachedToRawType: "cast",
    reportTimeMs: 1200,
    fightTimeMs: 200,
  };
}

describe("acceptExactPreCost refuses everything that is not exact decision state", () => {
  it("accepts EXACT + OBSERVED + PRE_COST", () => {
    const result = acceptExactPreCost(exactObserved(observation("PRE_COST"), [locator], "RESOURCES"));
    expect(result.accepted).toBe(true);
  });

  it("refuses STALE, however real the earlier observation was", () => {
    const result = acceptExactPreCost(
      staleObservation(observation("PRE_COST"), 1000, 1200, [locator], "RESOURCES"),
    );
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.detail).toContain("predates");
  });

  it("refuses EVENT_ASSOCIATED, which has no established ordering to the cost", () => {
    const result = acceptExactPreCost(exactObserved(observation("EVENT_ASSOCIATED"), [locator], "RESOURCES"));
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.detail).toContain("EVENT_ASSOCIATED");
  });

  it("refuses BOUNDED, which carries no single value", () => {
    const result = acceptExactPreCost(
      boundedDerived(observation("PRE_COST"), observation("PRE_COST"), [locator], "RESOURCES"),
    );
    expect(result.accepted).toBe(false);
  });

  it("refuses a DERIVED_EXACT value, which was calculated rather than observed", () => {
    const result = acceptExactPreCost(exactDerived(observation("PRE_COST"), [locator], "RESOURCES"));
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.detail).toContain("DERIVED_EXACT");
  });

  it("refuses UNKNOWN without inventing a value", () => {
    const result = acceptExactPreCost(unknownState("NO_OBSERVATION", [], "RESOURCES"));
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.detail).toContain("NO_OBSERVATION");
    expect(JSON.stringify(result)).not.toContain("observedAmount");
  });
});

describe("an EVENT_ASSOCIATED snapshot on a real cast yields UNKNOWN", () => {
  // A completed cast whose combo-point entry carries a ZERO cost. M4 tags that
  // EVENT_ASSOCIATED, because a cost of nothing establishes no ordering for the
  // amount to precede.
  const state = createCombatState(
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
            classResources: [classResource(COMBO_POINTS_WIRE_TYPE, 3, { max: 7, cost: 0 })],
          }),
        }),
      ],
    }),
  );

  const run = evaluateAssassinationEnvenom(state, { actorId: ROGUE });

  it("still identifies the decision point", () => {
    expect(run.outcome).toBe("EVALUATED");
    if (run.outcome !== "EVALUATED") return;
    expect(run.findings).toHaveLength(1);
  });

  it("declines to judge it, and asserts no combo-point value", () => {
    if (run.outcome !== "EVALUATED") return;
    const judgment = run.findings[0]?.judgment;
    expect(judgment?.status).toBe("UNKNOWN");
    if (judgment?.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("EXACT_RESOURCE_UNAVAILABLE");
    expect(judgment.observedState).toBeNull();
    // 3 of 7 would have been REJECTED. Accepting the wrong timing would have
    // produced a confident rejection from an observation that does not describe
    // the instant before the cast.
    expect(judgment.detail).toContain("EVENT_ASSOCIATED");
  });
});

describe("an observation without a usable maximum yields UNKNOWN", () => {
  const state = createCombatState(
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
            // Costed, so the timing is PRE_COST, but no maximum is supplied.
            classResources: [classResource(COMBO_POINTS_WIRE_TYPE, 3, { max: null, cost: 3 })],
          }),
        }),
      ],
    }),
  );

  const run = evaluateAssassinationEnvenom(state, { actorId: ROGUE });

  it("blocks on the missing maximum rather than inventing one", () => {
    if (run.outcome !== "EVALUATED") return;
    const judgment = run.findings[0]?.judgment;
    expect(judgment?.status).toBe("UNKNOWN");
    if (judgment?.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("RESOURCE_MAX_UNKNOWN");
    // A deficit needs a capacity. Assuming 5, or 7, or "whatever rogues have"
    // would be the fabrication the whole project refuses.
    expect(judgment.observedState).toBeNull();
  });
});
