import { describe, expect, it } from "vitest";

import { RESOURCE_OBSERVATION_TIMINGS } from "../../src/engine/resources/resource-observations.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import { afterEvent, endOfTimestamp } from "../../src/engine/state/temporal.js";
import {
  attachedResources,
  castEvent,
  classResource,
  damageEvent,
  resourceChangeEvent,
  syntheticFight,
} from "../support/synthetic-fight.js";
import { committedEventArray } from "../support/corpus/artifacts.js";
import { corpusState } from "../support/corpus/fight.js";

/** The canonical corpus artifact; provenance in tests/corpus/manifest.json. */
const pullWindowFixture = committedEventArray("wcl-pull-window-with-resources");

/**
 * Historical failure categories this protects against:
 *
 * - INVENTED RESOURCE STATE. The old analyzer produced a confident Energy number
 *   for an instant it had never observed, by assuming a regeneration rate.
 * - CONTINUOUS-RESOURCE RECONSTRUCTION ERRORS. A single point estimate was
 *   emitted where only bounds — or nothing — were defensible.
 * - RESOURCE CAP TREATED AS RESOURCE WASTE. `amount === max` became a finding.
 *
 * The property held here is narrow and absolute: every resource number this
 * layer returns was OBSERVED, verbatim, at a stated instant. Nothing is
 * computed, aged forward, added, subtracted, or bounded. The only thing M4-B
 * adds to an observation is its AGE.
 *
 * TWO SETTLED CONTRACTS DID NOT WEAKEN THAT
 *
 * For `gameVersion` 1 / `logVersion` 17 it is now established that an aura
 * `stack` value is the absolute resulting count, and that a costed completed
 * cast's `amount` is PRE_COST. Both settle what a number MEANS AT AN INSTANT.
 * Neither makes any instant BETWEEN observations knowable, and this file exists
 * to keep that distinction from eroding now that exact anchors are easier to
 * come by.
 *
 * The reconstruction was actually measured against live captures and does not
 * reconcile: snapshots appear whose value disagrees with an anchor plus the
 * intervening observed deltas. Two explanations survive and neither can be
 * excluded — not every resource change emits an event, and same-timestamp
 * retrieval order is not guaranteed causal. Either is fatal to replay.
 *
 * One evidence contract remains deliberately NOT ESTABLISHED, and this file pins
 * that it has not been quietly assumed:
 *
 *     whether a `resourcechange` attachment is pre-change or post-change
 */

const PLAYER = 5;
const BOSS = 160;
const ENERGY = 3;
const COMBO_POINTS = 4;
const MUTILATE = 1329;

const ENERGY_TICK_MS = 1000;

/** Energy 43 observed at 1200, then 3.8 seconds of silence. */
function silentAfterObservation() {
  return syntheticFight({
    observedCategories: ["RESOURCES"],
    events: [
      castEvent({
        ordinal: 0,
        reportTimeMs: 1200,
        castPhase: "COMPLETE",
        sourceActorId: PLAYER,
        targetActorId: BOSS,
        abilityGameId: MUTILATE,
        attachedResources: attachedResources({
          side: "SOURCE",
          actorId: PLAYER,
          classResources: [classResource(ENERGY, 43, { max: 100, cost: 50 })],
        }),
      }),
      damageEvent({ ordinal: 1, reportTimeMs: 1200 + 3800, sourceActorId: PLAYER, targetActorId: BOSS }),
    ],
  });
}

describe("no resource regenerates while nothing is observed", () => {
  const state = createCombatState(silentAfterObservation());

  it("returns the observed number aged, never a regenerated one", () => {
    const result = state.resources.latestObservedAtOrBefore({
      actorId: PLAYER,
      resourceType: ENERGY,
      at: afterEvent(1),
    });

    expect(result.certainty).toBe("STALE");
    if (result.certainty !== "STALE") return;
    // Energy regenerates roughly 10/s in the game. 3.8 seconds at 43 would put a
    // simulator around 81, and a capped one at 100. Neither number exists here.
    expect(result.value.observedAmount).toBe(43);
    expect(result.value.observedAmount).not.toBe(81);
    expect(result.value.observedAmount).not.toBe(100);
  });

  it("discloses the age rather than resolving it", () => {
    const result = state.resources.latestObservedAtOrBefore({
      actorId: PLAYER,
      resourceType: ENERGY,
      at: afterEvent(1),
    });

    if (result.certainty !== "STALE") return;
    expect(result.asOfReportTimeMs - result.observedAtReportTimeMs).toBe(3800);
    // Whether 3.8 seconds is tolerable depends on the resource, the spec and the
    // decision. M4 states the gap; a later consumer decides.
    expect(result.certainty).not.toBe("EXACT");
  });

  it("never widens a stale value into a fabricated interval", () => {
    const result = state.resources.latestObservedAtOrBefore({
      actorId: PLAYER,
      resourceType: ENERGY,
      at: afterEvent(1),
    });

    // A bounded [43, 100] would look defensible and be a guess: it needs a
    // regeneration rate, a haste figure and a cap model, none of which exist as
    // versioned runtime data yet.
    expect(result.certainty).not.toBe("BOUNDED");
    expect(result).not.toHaveProperty("lowerBound");
    expect(result).not.toHaveProperty("upperBound");
  });

  it("exposes no regeneration surface at all", () => {
    for (const forbidden of [
      "regenRate",
      "regenerationModel",
      "energyAt",
      "resourceAt",
      "projectedAmount",
      "reconstructAmount",
      "boundedAmountAt",
      "interpolate",
    ]) {
      expect(state.resources).not.toHaveProperty(forbidden);
    }
  });

  it("reports the same number however long the silence lasts", () => {
    const longer = createCombatState(
      syntheticFight({
        observedCategories: ["RESOURCES"],
        events: [
          silentAfterObservation().events[0]!,
          damageEvent({
            ordinal: 1,
            reportTimeMs: 1200 + 30 * ENERGY_TICK_MS,
            sourceActorId: PLAYER,
            targetActorId: BOSS,
          }),
        ],
        endTimeMs: 1200 + 60 * ENERGY_TICK_MS,
      }),
    );
    const result = longer.resources.latestObservedAtOrBefore({
      actorId: PLAYER,
      resourceType: ENERGY,
      at: afterEvent(1),
    });

    if (result.certainty !== "STALE") return;
    // Thirty seconds later the pool would certainly be full in the game. The
    // layer still reports 43, because 43 is what was observed.
    expect(result.value.observedAmount).toBe(43);
    expect(result.asOfReportTimeMs - result.observedAtReportTimeMs).toBe(30_000);
  });
});

describe("an observed delta is never replayed into a later amount", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["RESOURCES"],
      events: [
        castEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          castPhase: "COMPLETE",
          sourceActorId: PLAYER,
          abilityGameId: MUTILATE,
          attachedResources: attachedResources({
            side: "SOURCE",
            actorId: PLAYER,
            classResources: [classResource(ENERGY, 43, { max: 100 })],
          }),
        }),
        // A standalone +20 with no snapshot of its own.
        resourceChangeEvent({
          ordinal: 1,
          reportTimeMs: 1600,
          sourceActorId: PLAYER,
          targetActorId: PLAYER,
          resourceType: ENERGY,
          resourceChange: 20,
          maxResourceAmount: 100,
          reportedWasteAmount: 0,
        }),
        damageEvent({ ordinal: 2, reportTimeMs: 2000, sourceActorId: PLAYER, targetActorId: BOSS }),
      ],
    }),
  );

  it("keeps the two observation shapes as two answers", () => {
    const snapshot = state.resources.observationOnEvent(0, PLAYER, ENERGY);
    const change = state.resources.standaloneChangeOnEvent(1);

    if (snapshot.certainty !== "EXACT" || change.certainty !== "EXACT") return;
    expect(snapshot.value.observedAmount).toBe(43);
    expect(change.value.resourceChange).toBe(20);
  });

  it("does not add the delta to the earlier snapshot", () => {
    const result = state.resources.latestObservedAtOrBefore({
      actorId: PLAYER,
      resourceType: ENERGY,
      at: afterEvent(2),
    });

    if (result.certainty !== "STALE") return;
    // 43 + 20 = 63 is arithmetic on two observations whose relative sampling
    // order is NOT ESTABLISHED. The honest answer is the snapshot, aged.
    expect(result.value.observedAmount).toBe(43);
    expect(result.value.observedAmount).not.toBe(63);
  });

  it("offers no ledger that would make the arithmetic easy to write", () => {
    for (const forbidden of [
      "applyChanges",
      "replayChanges",
      "resourceLedger",
      "netChangeBetween",
      "amountAfterChanges",
    ]) {
      expect(state.resources).not.toHaveProperty(forbidden);
    }
  });

  it("keeps the standalone change's own position, not the snapshot's", () => {
    // The change is at 1600 and the snapshot at 1200. Merging them into a single
    // synthetic event would have had to pick one instant.
    const change = state.resources.standaloneChangeOnEvent(1);
    if (change.certainty !== "EXACT") return;
    expect(change.value.reportTimeMs).toBe(1600);
    expect(state.resources.snapshotPositionsFor(PLAYER, ENERGY)).toEqual([0]);
  });
});

describe("Warcraft Logs' waste number stays a number", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["RESOURCES"],
      events: [
        resourceChangeEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          sourceActorId: PLAYER,
          targetActorId: PLAYER,
          resourceType: COMBO_POINTS,
          resourceChange: 1,
          maxResourceAmount: 7,
          reportedWasteAmount: 1,
          attachedResources: attachedResources({
            side: "SOURCE",
            actorId: PLAYER,
            // At cap, with a reported waste of 1. Still not a finding.
            classResources: [classResource(COMBO_POINTS, 7, { max: 7 })],
          }),
        }),
      ],
    }),
  );

  it("reports it verbatim under an observational name", () => {
    const result = state.resources.standaloneChangeOnEvent(0);

    if (result.certainty !== "EXACT") return;
    expect(result.value.reportedWasteAmount).toBe(1);
    // `reportedWasteAmount` names its SOURCE, not a conclusion. Renaming it to
    // `wastedResource` would turn a Warcraft Logs field into an M4 verdict.
    expect(result.value).not.toHaveProperty("wastedResource");
    expect(result.value).not.toHaveProperty("waste");
  });

  it("does not turn being at cap into waste", () => {
    const snapshot = state.resources.observationOnEvent(0, PLAYER, COMBO_POINTS);

    if (snapshot.certainty !== "EXACT") return;
    expect(snapshot.value.observedAmount).toBe(snapshot.value.observedMax);
    // 7 / 7 combo points followed by a spender is not waste. The invariant is
    // `resourceAtCap != resourceWasted`, and this layer states neither.
    for (const forbidden of ["atCap", "isCapped", "wasted", "overcapped"]) {
      expect(snapshot.value).not.toHaveProperty(forbidden);
    }
  });

  it("forms no gameplay verdict anywhere in either observation", () => {
    const serialized = (
      JSON.stringify(state.resources.standaloneChangeOnEvent(0)) +
      JSON.stringify(state.resources.observationOnEvent(0, PLAYER, COMBO_POINTS))
    ).toLowerCase();

    for (const word of ["mistake", "shouldhave", "suboptimal", "wasteful", "error", "bad"]) {
      expect(serialized).not.toContain(word);
    }
  });
});

describe("a settled instant does not become a reconstruction between instants", () => {
  // The source-vocabulary sweep lives in
  // `tests/contracts/m4-state-vocabulary.test.ts`, which runs under Node and can
  // read the repository. This block covers the BEHAVIOUR.
  it("reports a costed cast attachment as PRE_COST and stops there", () => {
    const state = createCombatState(silentAfterObservation());
    const result = state.resources.observationOnEvent(0, PLAYER, ENERGY);

    if (result.certainty !== "EXACT") return;
    expect(result.value.attachedToRawType).toBe("cast");
    expect(result.value.timing).toBe("PRE_COST");
    expect(result.value.observedCost).toBe(50);
    expect(result.value.observedAmount).toBe(43);
    // PRE_COST says the 43 preceded the 50. It does not resolve to -7, and the
    // post-cost amount is not computed here or anywhere.
    expect(JSON.stringify(result.value)).not.toContain("-7");
    expect(JSON.stringify(result.value)).not.toContain("93");
  });

  it("does not advance a PRE_COST anchor by its own cost", () => {
    const state = createCombatState(silentAfterObservation());
    const later = state.resources.latestObservedAtOrBefore({
      actorId: PLAYER,
      resourceType: ENERGY,
      at: afterEvent(1),
    });

    expect(later.certainty).toBe("STALE");
    if (later.certainty !== "STALE") return;
    // Knowing the 43 preceded a cost of 50 makes a ledger look one subtraction
    // away. It is not: the value stays 43, aged, and never becomes -7.
    expect(later.value.observedAmount).toBe(43);
    expect(later.value.observedAmount).not.toBe(-7);
  });
});

describe("the resourcechange timing contract stays unestablished", () => {
  /**
   * Live evidence strongly favours POST_CHANGE, and it is still not a contract.
   *
   * The favourable evidence depends on same-timestamp retrieval adjacency
   * behaving as causal order, which M3/M4-A deliberately do not guarantee, and
   * whole-window reconciliation left unexplained gaps. So the attachment carries
   * the conservative tag, and the assumption has nowhere to enter from.
   */
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["RESOURCES"],
      events: [
        resourceChangeEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          sourceActorId: PLAYER,
          targetActorId: PLAYER,
          resourceType: ENERGY,
          resourceChange: 10,
          maxResourceAmount: 100,
          reportedWasteAmount: 0,
          attachedResources: attachedResources({
            side: "SOURCE",
            actorId: PLAYER,
            classResources: [classResource(ENERGY, 60, { max: 100 })],
          }),
        }),
      ],
    }),
  );

  it("tags the changed type's attachment POST_CHANGE (M11-B5) and never PRE_COST", () => {
    // RE-POINTED for M11-B5: the reconciliation over the Blood corpus settled
    // the contract (tests/unit/m11b5-resource-post-change-contract.test.ts).
    const result = state.resources.observationOnEvent(0, PLAYER, ENERGY);

    if (result.certainty !== "EXACT") return;
    expect(result.value.timing).toBe("POST_CHANGE");
    expect(result.value.timing).not.toBe("PRE_COST");
  });

  it("produces neither 50 nor 70: the amount is read as 60, and the delta is applied to nothing", () => {
    const snapshot = state.resources.observationOnEvent(0, PLAYER, ENERGY);
    const change = state.resources.standaloneChangeOnEvent(0);

    if (snapshot.certainty !== "EXACT" || change.certainty !== "EXACT") return;
    expect(snapshot.value.observedAmount).toBe(60);
    expect(change.value.resourceChange).toBe(10);
    // 60 is the amount AFTER the change (POST_CHANGE). The amount before it,
    // 50, is not derived — the delta is a rounded number where the game moved
    // a fraction — and 70 is not a reading anything supports.
    const serialized = JSON.stringify(snapshot.value) + JSON.stringify(change.value);
    expect(serialized).not.toContain("50");
    expect(serialized).not.toContain("70");
  });

  it("admits only the three timings the evidence supports", () => {
    expect([...RESOURCE_OBSERVATION_TIMINGS]).toEqual(["PRE_COST", "POST_CHANGE", "EVENT_ASSOCIATED"]);
  });
});

describe("captured resource evidence is reported, not reinterpreted", () => {
  // Through the shared corpus coverage interpreter: the artifact retains no
  // coverage grant, so nothing below may rest on an absence or a carry-forward.
  // Every assertion here is about indexes and on-event observations.
  const state = corpusState("wcl-pull-window-with-resources");

  it("returns only amounts that appear verbatim in the capture", () => {
    const capturedAmounts = new Set<number>();
    for (const raw of pullWindowFixture as { classResources?: { amount?: number }[] }[]) {
      for (const resource of raw.classResources ?? []) {
        if (typeof resource.amount === "number") {
          capturedAmounts.add(resource.amount);
        }
      }
    }
    expect(capturedAmounts.size).toBeGreaterThan(0);

    let checked = 0;
    for (const [actorId, byType] of state.resources.indexes.snapshotPositionsByActor) {
      for (const [resourceType, positions] of byType) {
        for (const position of positions) {
          const result = state.resources.observationOnEvent(position, actorId, resourceType);
          if (result.certainty !== "EXACT") continue;
          // Every number this layer hands back is a number Warcraft Logs sent.
          expect(capturedAmounts.has(result.value.observedAmount)).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("keeps a stale captured value equal to the observation it came from", () => {
    const [actorId] = [...state.resources.indexes.snapshotPositionsByActor.keys()];
    if (actorId === undefined) return;
    const byType = state.resources.indexes.snapshotPositionsByActor.get(actorId);
    const [resourceType] = byType === undefined ? [] : [...byType.keys()];
    const positions = byType?.get(resourceType ?? -1) ?? [];
    const first = positions[0];
    if (resourceType === undefined || first === undefined) return;

    const atObservation = state.resources.observationOnEvent(first, actorId, resourceType);
    const later = state.resources.latestObservedAtOrBefore({
      actorId,
      resourceType,
      at: endOfTimestamp(state.fight.fight.endTimeMs),
    });

    if (atObservation.certainty !== "EXACT") return;
    if (later.certainty === "STALE") {
      // Whatever the gap, the value is one that was observed — possibly a later
      // observation, never a computed one.
      const observed = positions
        .map((position) => state.resources.observationOnEvent(position, actorId, resourceType))
        .flatMap((result) => (result.certainty === "EXACT" ? [result.value.observedAmount] : []));
      expect(observed).toContain(later.value.observedAmount);
    }
  });

  it("preserves the captured aura stack numbers without reconciling them", () => {
    // The capture carries ability 383414 on the boss climbing by one per
    // `applydebuffstack` and then dropping several at once on a
    // `removedebuffstack` — coherent as absolute resulting counts, which is the
    // established reading. Knowing that does not license arithmetic: the count
    // is known AT a transition that reported one, and this layer hands back
    // exactly the number it was given.
    const stackEvents = state.fight.events.filter((event) => event.kind === "AURA" && event.stacks !== null);

    for (const event of stackEvents) {
      if (event.kind !== "AURA" || event.target === null || event.abilityGameId === null) continue;
      const observation = state.auras.observationAt(state.fight.events.indexOf(event));
      expect(observation?.observedStacks).toBe(event.stacks);
    }
  });
});
