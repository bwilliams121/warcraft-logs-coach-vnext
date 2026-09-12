import { describe, expect, it } from "vitest";

import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../src/engine/normalization/supported-families.js";
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
import pullWindowFixture from "../fixtures/wcl/events/wcl-pull-window-with-resources.json";

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
 * Three evidence contracts remain deliberately NOT ESTABLISHED, and this file
 * pins that none of them has been quietly assumed:
 *
 * 1. whether an aura `stack` value is an absolute count or a delta
 * 2. when an attached `classResources[].amount` is sampled relative to a cast
 * 3. whether a `resourcechange` snapshot is pre-change or post-change
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

describe("the unestablished evidence contracts are not quietly assumed", () => {
  // The source-vocabulary sweep for these contracts lives in
  // `tests/contracts/m4-state-vocabulary.test.ts`, which runs under Node and can
  // read the repository. This block covers the BEHAVIOUR.
  it("names the cast attachment for the event it rode in on, not for a phase of it", () => {
    const state = createCombatState(silentAfterObservation());
    const result = state.resources.observationOnEvent(0, PLAYER, ENERGY);

    if (result.certainty !== "EXACT") return;
    // The snapshot is an exact observation ASSOCIATED WITH this cast. Calling it
    // pre-cast or post-cast would decide a contract nobody has established.
    expect(result.value.attachedToRawType).toBe("cast");
    expect(result.value.observedCost).toBe(50);
    expect(result.value.observedAmount).toBe(43);
    // 43 with a cost of 50 does not resolve to -7, to 93, or to anything.
    expect(JSON.stringify(result.value)).not.toContain("-7");
    expect(JSON.stringify(result.value)).not.toContain("93");
  });
});

describe("captured resource evidence is reported, not reinterpreted", () => {
  const CAPTURE_START = 7_381_097;
  const CAPTURE_END = 7_383_000;

  const normalizer = createNormalizer({
    fightStartTimeMs: CAPTURE_START,
    requestedRange: inclusiveRange(CAPTURE_START, CAPTURE_END),
    contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: CAPTURE_START,
    nextPageTimestamp: null,
    events: pullWindowFixture as Record<string, unknown>[],
  });
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["RESOURCES"],
      events: normalizer.finish().events,
      startTimeMs: CAPTURE_START,
      endTimeMs: CAPTURE_END,
    }),
  );

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
      at: endOfTimestamp(CAPTURE_END),
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
    // The mid-fight capture carries ability 383414 on the boss with
    // `applydebuffstack` stacks 10, 11, 12 and then a `removedebuffstack` with
    // stack 3. Those four numbers do not form a consistent series under EITHER
    // reading — which is exactly why the absolute-vs-delta contract is NOT
    // ESTABLISHED, and why nothing may do arithmetic on them.
    const stackEvents = state.fight.events.filter((event) => event.kind === "AURA" && event.stacks !== null);

    for (const event of stackEvents) {
      if (event.kind !== "AURA" || event.target === null || event.abilityGameId === null) continue;
      const observation = state.auras.observationAt(state.fight.events.indexOf(event));
      expect(observation?.observedStacks).toBe(event.stacks);
    }
  });
});
