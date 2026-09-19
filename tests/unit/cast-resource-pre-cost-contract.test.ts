import { describe, expect, it } from "vitest";

import { RESOURCE_OBSERVATION_TIMINGS } from "../../src/engine/resources/resource-observations.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import { afterEvent } from "../../src/engine/state/temporal.js";
import {
  attachedResources,
  castEvent,
  classResource,
  resourceChangeEvent,
  syntheticFight,
} from "../support/synthetic-fight.js";
import { corpusState, normalizationFactsOf } from "../support/corpus/fight.js";

/**
 * EVIDENCE CONTRACT B — a costed CAST's attached `classResources[].amount`.
 *
 * For `gameVersion` 1 / `logVersion` 17, when a COMPLETED cast carries a
 * `classResources[]` entry with a positive `cost`, `amount` is the actor's
 * amount BEFORE that cost was paid.
 *
 * The falsifier the fixture carries is structural and needs no arithmetic, no
 * event ordering and no regeneration model. It is decided from ONE event:
 *
 *     amount == max  while  cost > 0
 *
 * Under a post-cost reading the actor would have held `max + cost` beforehand,
 * which is above the cap. The sharpest instance is a capped discrete resource
 * spent in full — `amount == max == cost == 7` — where the post-cost reading
 * requires holding 14 of a 7-capacity pool.
 *
 * WHAT THIS CONTRACT DOES NOT DO
 *
 * It settles one INSTANT. It does not make the amount after the cost knowable,
 * and `amount - cost` is not that number: it is arithmetic across an instant
 * nothing observed. Live captures contain costed casts whose next observation
 * disagrees with it. See the no-simulation regression.
 *
 * Everything that is not a positively costed completed cast stays
 * `EVENT_ASSOCIATED` — except, since M11-B5, the attachment OF THE CHANGED TYPE
 * on a `resourcechange`, which is `POST_CHANGE`: established by whole-window
 * reconciliation over the Blood corpus rather than by same-timestamp adjacency
 * (tests/unit/m11b5-resource-post-change-contract.test.ts).
 */

const CAPPED_DISCRETE = 4;
const ENERGY = 3;
const SOUL_SHARDS = 7;
const ROGUE = 19;
const WARLOCK = 12;

const FINISHER = 32_645;
const COSTED_CAST = 703;
const MELEE = 1;

// Through the shared corpus coverage interpreter: the artifact retains no
// coverage grant, so nothing below may rest on an absence or a carry-forward.
const normalized = normalizationFactsOf("wcl-cast-resource-pre-cost");
const state = corpusState("wcl-cast-resource-pre-cost");

/** The canonical position of the fixture's cast of one ability. */
function positionOf(abilityGameId: number): number {
  const position = state.fight.events.findIndex((event) => event.abilityGameId === abilityGameId);
  if (position < 0) throw new Error(`fixture is missing ability ${abilityGameId}`);
  return position;
}

describe("the fixture carries the evidence the contract rests on", () => {
  it("normalizes every fixture event without a malformed family", () => {
    expect(normalized.normalizedEventCount).toBe(normalized.rawEventCount);
    expect(normalized.malformedFamilyEvents).toBe(0);
    expect(normalized.malformedObservations).toBe(0);
    expect(normalized.malformedEnvelopes).toBe(0);
  });

  it("holds a capped discrete resource spent in full", () => {
    const result = state.resources.observationOnEvent(positionOf(FINISHER), ROGUE, CAPPED_DISCRETE);

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    // The whole argument, in one event: 7 of 7, costing 7.
    expect(result.value.observedAmount).toBe(7);
    expect(result.value.observedMax).toBe(7);
    expect(result.value.observedCost).toBe(7);
  });

  it("holds a second, independent resource and actor", () => {
    // A different actor, a different resource type, a different ability. The
    // contract is not a quirk of one class's pool.
    const result = state.resources.observationOnEvent(positionOf(116_858), WARLOCK, SOUL_SHARDS);

    if (result.certainty !== "EXACT") return;
    expect(result.value.observedAmount).toBe(50);
    expect(result.value.observedMax).toBe(50);
    expect(result.value.observedCost).toBe(20);
  });
});

describe("a costed completed cast reports the amount before the cost", () => {
  it("tags the capped discrete observation PRE_COST", () => {
    const result = state.resources.observationOnEvent(positionOf(FINISHER), ROGUE, CAPPED_DISCRETE);

    if (result.certainty !== "EXACT") return;
    expect(result.value.timing).toBe("PRE_COST");
  });

  it("tags every positively costed entry on that cast, not just the first", () => {
    // The capture's finisher carries TWO entries: a continuous pool and the
    // capped discrete one. Both are costed, so both are PRE_COST.
    for (const resourceType of [ENERGY, CAPPED_DISCRETE]) {
      const result = state.resources.observationOnEvent(positionOf(FINISHER), ROGUE, resourceType);
      if (result.certainty !== "EXACT") continue;
      expect(result.value.observedCost).toBeGreaterThan(0);
      expect(result.value.timing, `resource ${resourceType}`).toBe("PRE_COST");
    }
  });

  it("keeps amount == max == cost legal evidence rather than a defect", () => {
    const result = state.resources.observationOnEvent(positionOf(FINISHER), ROGUE, CAPPED_DISCRETE);

    if (result.certainty !== "EXACT") return;
    // Being at cap is not waste, and spending the whole pool is not an anomaly.
    // This is the sharpest form of the evidence, so it must survive normalization
    // intact rather than be rejected or flagged.
    expect(result.value.observedAmount).toBe(result.value.observedMax);
    expect(result.value.observedAmount).toBe(result.value.observedCost);
    expect(result.value.timing).toBe("PRE_COST");
    expect(JSON.stringify(result.value).toLowerCase()).not.toContain("waste");
  });

  it("preserves amount, max and cost verbatim alongside the timing", () => {
    const result = state.resources.observationOnEvent(positionOf(COSTED_CAST), ROGUE, ENERGY);

    if (result.certainty !== "EXACT") return;
    expect(result.value.observedAmount).toBe(195);
    expect(result.value.observedMax).toBe(250);
    expect(result.value.observedCost).toBe(45);
    expect(result.value.timing).toBe("PRE_COST");
  });
});

describe("everything without the established contract stays EVENT_ASSOCIATED", () => {
  it("tags an uncosted cast EVENT_ASSOCIATED", () => {
    const result = state.resources.observationOnEvent(positionOf(MELEE), ROGUE, ENERGY);

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    // A cast is not PRE_COST because it is a cast. It is PRE_COST because it
    // carries a cost, and this one does not.
    expect(result.value.observedCost).toBeNull();
    expect(result.value.timing).toBe("EVENT_ASSOCIATED");
  });

  it("tags a resourcechange attachment of the changed type POST_CHANGE, and only that (M11-B5)", () => {
    // RE-POINTED for M11-B5. The Rogue capture's energy `resourcechange`
    // carries an energy attachment: POST_CHANGE. Any other type riding on it
    // would stay EVENT_ASSOCIATED.
    const position = state.fight.events.findIndex((event) => event.kind === "RESOURCE_CHANGE");
    const result = state.resources.observationOnEvent(position, ROGUE, ENERGY);

    if (result.certainty !== "EXACT") return;
    expect(result.value.attachedToRawType).toBe("resourcechange");
    expect(result.value.timing).toBe("POST_CHANGE");
  });

  it("offers no POST_COST or PRE_CHANGE timing to acquire by accident", () => {
    // A behavioural guard rather than a text sweep: the runtime list of timings
    // is the same union the type declares.
    expect([...RESOURCE_OBSERVATION_TIMINGS]).toEqual(["PRE_COST", "POST_CHANGE", "EVENT_ASSOCIATED"]);
    expect(RESOURCE_OBSERVATION_TIMINGS).not.toContain("POST_COST");
    expect(RESOURCE_OBSERVATION_TIMINGS).not.toContain("PRE_CHANGE");
  });

  it("tags a begincast attachment EVENT_ASSOCIATED even when it carries a cost", () => {
    // No capture has shown `begincast` carrying an attachment at all, so the
    // contract was never established for it. It shares `kind: "CAST"` with the
    // completed cast, which is exactly why the rule keys on the phase too.
    const synthetic = createCombatState(
      syntheticFight({
        observedCategories: ["RESOURCES"],
        events: [
          castEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            castPhase: "BEGIN",
            sourceActorId: ROGUE,
            attachedResources: attachedResources({
              side: "SOURCE",
              actorId: ROGUE,
              classResources: [classResource(ENERGY, 100, { max: 100, cost: 40 })],
            }),
          }),
        ],
      }),
    );
    const result = synthetic.resources.observationOnEvent(0, ROGUE, ENERGY);

    if (result.certainty !== "EXACT") return;
    expect(result.value.attachedToRawType).toBe("begincast");
    expect(result.value.timing).toBe("EVENT_ASSOCIATED");
  });

  it("treats a zero cost as no established ordering", () => {
    // Zero is an observed cost of nothing. There is no deduction for the amount
    // to precede, so it establishes no before/after relationship.
    const synthetic = createCombatState(
      syntheticFight({
        observedCategories: ["RESOURCES"],
        events: [
          castEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            castPhase: "COMPLETE",
            sourceActorId: ROGUE,
            attachedResources: attachedResources({
              side: "SOURCE",
              actorId: ROGUE,
              classResources: [classResource(ENERGY, 60, { max: 100, cost: 0 })],
            }),
          }),
          resourceChangeEvent({
            ordinal: 1,
            reportTimeMs: 1400,
            sourceActorId: ROGUE,
            targetActorId: ROGUE,
            resourceType: ENERGY,
            resourceChange: 5,
          }),
        ],
      }),
    );
    const result = synthetic.resources.observationOnEvent(0, ROGUE, ENERGY);

    if (result.certainty !== "EXACT") return;
    expect(result.value.observedCost).toBe(0);
    expect(result.value.timing).toBe("EVENT_ASSOCIATED");
  });
});

describe("PRE_COST opens no route to reconstruction", () => {
  it("never computes the amount after the cost", () => {
    const result = state.resources.observationOnEvent(positionOf(COSTED_CAST), ROGUE, ENERGY);

    if (result.certainty !== "EXACT") return;
    // 195 - 45 = 150 happens to be the next observed value in this capture and
    // is still not computed here. Elsewhere in the same capture that arithmetic
    // disagrees with the next observation, which is precisely why it is not a
    // derivation.
    expect(JSON.stringify(result.value)).not.toContain("150");
    for (const forbidden of ["amountAfterCost", "postCostAmount", "amountAfterSpend", "remainingAmount"]) {
      expect(result.value).not.toHaveProperty(forbidden);
    }
  });

  it("still ages a PRE_COST observation rather than advancing it", () => {
    const later = state.resources.latestObservedAtOrBefore({
      actorId: ROGUE,
      resourceType: CAPPED_DISCRETE,
      at: afterEvent(state.fight.events.length - 1),
    });

    expect(later.certainty).toBe("STALE");
    if (later.certainty !== "STALE") return;
    // The finisher spent all 7. A ledger would report 0 here; an observation
    // layer reports the 7 it saw, with its age.
    expect(later.value.observedAmount).toBe(7);
    expect(later.value.timing).toBe("PRE_COST");
    expect(later.asOfReportTimeMs).toBeGreaterThan(later.observedAtReportTimeMs);
  });

  it("exposes no spend ledger on the view", () => {
    for (const forbidden of [
      "resourceAt",
      "applyCosts",
      "replayChanges",
      "resourceLedger",
      "amountAfterChanges",
      "spentBetween",
    ]) {
      expect(state.resources).not.toHaveProperty(forbidden);
    }
  });
});
