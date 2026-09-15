/**
 * Running encounter-context projection changes no gameplay verdict.
 *
 * WHY A BEHAVIOURAL TEST AS WELL AS THE STATIC ONE
 *
 * `m8e-encounter-context-layering.test.ts` proves the module graph: a spec
 * evaluator cannot import the encounter-context domain, so it cannot read a
 * nearby boss cast. That is the strong guarantee and it holds by construction.
 *
 * This proves the other half, over the real M5-D2 corpus: projecting encounter
 * context does not disturb the state the analyzer reads. The projection walks
 * `fight.events`, builds observations that reference the same locators, and
 * consults `gateAbsenceClaim` — all read-only, but "read-only" is an assertion
 * until something asserts it. A mutation here would be invisible in the module
 * graph and would corrupt every analysis in the same request.
 */

import { describe, expect, it } from "vitest";

import { createCombatState } from "../../src/engine/state/combat-state.js";
import { analyzeObservedAssassinationDecisions } from "../../src/specs/rogue/assassination/observed-analysis.js";
import { ASSASSINATION_SPEC_ID } from "../../src/specs/rogue/assassination/evaluator.js";
import { afterEvent } from "../../src/engine/state/temporal.js";
import {
  encounterEventsNear,
  ENCOUNTER_EVENT_FAMILIES,
} from "../../src/encounter-context/encounter-events.js";
import { phasePlacementOfObservation } from "../../src/encounter-context/phase-context.js";
import { temporalWindow } from "../../src/encounter-context/temporal-window.js";
import { M5D2_ACTOR, M5D2_TARGET, m5d2Fight } from "../support/m5d2-fixture.js";

const WINDOW = (() => {
  const result = temporalWindow(5_000, 5_000);
  if (!result.ok) throw new Error("window rejected");
  return result.window;
})();

function analysisOf() {
  const state = createCombatState(m5d2Fight());
  return {
    state,
    analysis: analyzeObservedAssassinationDecisions({
      state,
      actorId: M5D2_ACTOR,
      specId: ASSASSINATION_SPEC_ID,
      targetActorId: M5D2_TARGET,
    }),
  };
}

describe("encounter-context projection leaves authority output untouched", () => {
  it("did real analysis work, so the comparison is not vacuous", () => {
    const { analysis } = analysisOf();
    expect(analysis.status).toBe("ANALYZED");
    if (analysis.status !== "ANALYZED") return;
    expect(analysis.coverage.eligibleDecisions).toBeGreaterThan(0);
    expect(analysis.coverage.excludedCastCount).toBeGreaterThan(0);
  });

  it("produces byte-identical analysis whether or not context was projected", () => {
    const baseline = analysisOf().analysis;

    // Same corpus, but project encounter context across the whole fight first —
    // and at every supported family — before analysing.
    const { state, analysis: unused } = analysisOf();
    void unused;
    for (let position = 0; position < state.fight.events.length; position += 1) {
      const nearby = encounterEventsNear(state, {
        anchor: afterEvent(position),
        window: WINDOW,
        families: [...ENCOUNTER_EVENT_FAMILIES],
      });
      if (nearby.certainty === "EXACT") {
        for (const observation of nearby.value) {
          phasePlacementOfObservation(state, observation);
        }
      }
    }

    const afterProjection = analyzeObservedAssassinationDecisions({
      state,
      actorId: M5D2_ACTOR,
      specId: ASSASSINATION_SPEC_ID,
      targetActorId: M5D2_TARGET,
    });

    expect(JSON.stringify(afterProjection)).toBe(JSON.stringify(baseline));
  });

  it("does not disturb the normalized event sequence", () => {
    const { state } = analysisOf();
    const before = JSON.stringify(state.fight.events);

    for (let position = 0; position < state.fight.events.length; position += 1) {
      encounterEventsNear(state, {
        anchor: afterEvent(position),
        window: WINDOW,
        families: [...ENCOUNTER_EVENT_FAMILIES],
      });
    }

    expect(JSON.stringify(state.fight.events)).toBe(before);
  });

  it("carries no gameplay verdict in its own output", () => {
    const { state } = analysisOf();
    const nearby = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: WINDOW,
      families: [...ENCOUNTER_EVENT_FAMILIES],
    });
    const serialized = JSON.stringify(nearby);
    for (const banned of ["MATCH", "REJECTED", "cause", "avoidable", "mechanic", "death"]) {
      expect(serialized.toLowerCase(), `leaked ${banned}`).not.toContain(banned.toLowerCase());
    }
  });
});
