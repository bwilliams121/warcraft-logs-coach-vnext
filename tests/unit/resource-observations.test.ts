import { describe, expect, it } from "vitest";

import { exclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import { afterEvent, beforeEvent, endOfTimestamp } from "../../src/engine/state/temporal.js";
import {
  absentCategory,
  attachedResources,
  castEvent,
  classResource,
  damageEvent,
  partialCategory,
  resourceChangeEvent,
  syntheticFight,
  UNVERIFIED_CATEGORY,
  type SyntheticFightOptions,
} from "../support/synthetic-fight.js";
import { corpusState } from "../support/corpus/fight.js";

const PLAYER = 5;
const BOSS = 160;
const ALLY = 11;
const ENERGY = 3;
const COMBO_POINTS = 4;
const MUTILATE = 1329;

// --------------------------------------------------------------------------
// Side attribution
// --------------------------------------------------------------------------

describe("a snapshot stays on the actor whose side it describes", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["RESOURCES"],
      events: [
        // A source-side snapshot on the player's own cast.
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
            hitPoints: 777_040,
            maxHitPoints: 777_040,
          }),
        }),
        // A target-side snapshot on the player's damage: the BOSS's pool.
        damageEvent({
          ordinal: 1,
          reportTimeMs: 1400,
          sourceActorId: PLAYER,
          targetActorId: BOSS,
          attachedResources: attachedResources({
            side: "TARGET",
            actorId: BOSS,
            classResources: [classResource(ENERGY, 900)],
            hitPoints: 859_705_671,
          }),
        }),
      ],
    }),
  );

  it("keeps a source-side observation on the source actor", () => {
    const result = state.resources.observationOnEvent(0, PLAYER, ENERGY);

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.side).toBe("SOURCE");
    expect(result.value.actor?.actorId).toBe(PLAYER);
    expect(result.value.observedAmount).toBe(43);
  });

  it("keeps a target-side observation on the target actor", () => {
    const onBoss = state.resources.observationOnEvent(1, BOSS, ENERGY);
    const onPlayer = state.resources.observationOnEvent(1, PLAYER, ENERGY);

    if (onBoss.certainty !== "EXACT") return;
    expect(onBoss.value.side).toBe("TARGET");
    expect(onBoss.value.observedAmount).toBe(900);
    // The decisive assertion. A player hitting the boss carries the boss's pool,
    // and asking about the player must not answer with it.
    expect(onPlayer.certainty).toBe("UNKNOWN");
  });

  it("indexes the two sides under two different actors", () => {
    expect(state.resources.snapshotPositionsFor(PLAYER, ENERGY)).toEqual([0]);
    expect(state.resources.snapshotPositionsFor(BOSS, ENERGY)).toEqual([1]);
  });

  it("does not report the boss's health as the player's", () => {
    const onBoss = state.resources.healthObservationOnEvent(1, BOSS);
    const onPlayer = state.resources.healthObservationOnEvent(1, PLAYER);

    if (onBoss.certainty !== "EXACT") return;
    expect(onBoss.value.hitPoints).toBe(859_705_671);
    expect(onPlayer.certainty).toBe("UNKNOWN");
  });
});

describe("a snapshot with no actor is preserved without inventing one", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["RESOURCES"],
      events: [
        damageEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          sourceActorId: null,
          sourceAbsence: "NO_ACTOR_SENTINEL",
          targetActorId: PLAYER,
          attachedResources: attachedResources({
            side: "SOURCE",
            actorId: null,
            classResources: [classResource(ENERGY, 50, { max: 100 })],
            hitPoints: 500,
          }),
        }),
      ],
    }),
  );

  it("records the position observationally", () => {
    // The snapshot is still a fact; the actor behind it was not stated.
    expect(state.resources.indexes.unattributedSnapshotPositions).toEqual([0]);
  });

  it("attributes it to no actor at all", () => {
    // The historical failure: `-1` read as "actor minus one", accumulating state
    // belonging to nobody.
    expect(state.resources.indexes.snapshotPositionsByActor.size).toBe(0);
    expect(state.resources.snapshotPositionsFor(-1, ENERGY)).toEqual([]);
    expect(state.resources.snapshotPositionsFor(PLAYER, ENERGY)).toEqual([]);
    expect(state.resources.observationOnEvent(0, PLAYER, ENERGY).certainty).toBe("UNKNOWN");
  });
});

describe("actor id 0 is a real actor", () => {
  it("indexes a snapshot on actor 0", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["RESOURCES"],
        events: [
          castEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            castPhase: "COMPLETE",
            sourceActorId: 0,
            attachedResources: attachedResources({
              side: "SOURCE",
              actorId: 0,
              classResources: [classResource(ENERGY, 77)],
            }),
          }),
        ],
      }),
    );

    // A truthiness check would silently drop this actor's resources.
    expect(state.resources.snapshotPositionsFor(0, ENERGY)).toEqual([0]);
    expect(state.resources.observationOnEvent(0, 0, ENERGY).certainty).toBe("EXACT");
  });
});

// --------------------------------------------------------------------------
// Exact and stale
// --------------------------------------------------------------------------

describe("an observation is exact at itself and stale later", () => {
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
        damageEvent({ ordinal: 1, reportTimeMs: 2000, sourceActorId: PLAYER, targetActorId: BOSS }),
      ],
    }),
  );

  const energyOnPlayer = { actorId: PLAYER, resourceType: ENERGY };

  it("is EXACT at the observation itself", () => {
    const result = state.resources.latestObservedAtOrBefore({
      ...energyOnPlayer,
      at: afterEvent(0),
    });

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.observedAmount).toBe(43);
    expect(result.derivation).toBe("OBSERVED");
  });

  it("becomes STALE at a later position, disclosing both instants", () => {
    const result = state.resources.latestObservedAtOrBefore({
      ...energyOnPlayer,
      at: afterEvent(1),
    });

    expect(result.certainty).toBe("STALE");
    if (result.certainty !== "STALE") return;
    expect(result.value.observedAmount).toBe(43);
    expect(result.observedAtReportTimeMs).toBe(1200);
    expect(result.asOfReportTimeMs).toBe(2000);
  });

  it("does not regenerate the value across the 800ms gap", () => {
    const result = state.resources.latestObservedAtOrBefore({
      ...energyOnPlayer,
      at: afterEvent(1),
    });

    if (result.certainty !== "STALE") return;
    // Energy regenerates in the game. It does not regenerate here: there is no
    // regeneration model, no rate, and no interpolated intermediate value.
    expect(result.value.observedAmount).toBe(43);
    expect(result.value.observedAmount).not.toBe(51);
  });

  it("reports no staleness threshold of its own", () => {
    // M4 reports the AGE. Whether 800ms is tolerable depends on the resource,
    // the spec and the decision, so nothing here decides it.
    const serialized = JSON.stringify(
      state.resources.latestObservedAtOrBefore({ ...energyOnPlayer, at: afterEvent(1) }),
    ).toLowerCase();
    for (const forbidden of ["threshold", "acceptable", "tooold", "expired", "fresh"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("never offers a bounded interval it cannot prove", () => {
    const result = state.resources.latestObservedAtOrBefore({
      ...energyOnPlayer,
      at: afterEvent(1),
    });

    // Bounded continuous resources need a versioned game-data model that does
    // not exist. Until it does, the honest answer is the observation plus its
    // age, not a fabricated interval.
    expect(result.certainty).not.toBe("BOUNDED");
    expect(result).not.toHaveProperty("lowerBound");
    expect(result).not.toHaveProperty("upperBound");
  });

  it("returns NO_OBSERVATION before the first observation", () => {
    const result = state.resources.latestObservedAtOrBefore({
      ...energyOnPlayer,
      at: beforeEvent(0),
    });

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("NO_OBSERVATION");
  });

  it("returns NO_OBSERVATION for a resource type never observed", () => {
    const result = state.resources.latestObservedAtOrBefore({
      actorId: PLAYER,
      resourceType: COMBO_POINTS,
      at: afterEvent(1),
    });

    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("NO_OBSERVATION");
  });
});

describe("sampling timing travels with the value, not in the accessor name", () => {
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
            classResources: [classResource(ENERGY, 43, { max: 100, cost: 50 })],
          }),
        }),
      ],
    }),
  );

  it("offers no before/after-cast accessor", () => {
    for (const forbidden of [
      "resourceBeforeCast",
      "resourceAfterCast",
      "resourceBeforeSpend",
      "resourceAfterSpend",
      "preCastResource",
      "postCastResource",
    ]) {
      expect(state.resources).not.toHaveProperty(forbidden);
    }
  });

  it("describes the snapshot as an observation on the event, with its raw type", () => {
    const result = state.resources.observationOnEvent(0, PLAYER, ENERGY);

    if (result.certainty !== "EXACT") return;
    // The accessor is still named for the event it reads. What changed is that
    // the observation now CARRIES when it was sampled, instead of the accessor
    // implying it for every event that reaches it.
    expect(result.value.attachedToRawType).toBe("cast");
    expect(result.value.timing).toBe("PRE_COST");
    const keys = Object.keys(result.value).join(" ").toLowerCase();
    expect(keys).not.toContain("before");
    expect(keys).not.toContain("after");
  });

  it("preserves the observed cost as a number, not a spend verdict", () => {
    const result = state.resources.observationOnEvent(0, PLAYER, ENERGY);

    if (result.certainty !== "EXACT") return;
    expect(result.value.observedCost).toBe(50);
    // 43 observed PRE_COST with a cost of 50 is not a claim that anything was
    // reduced to -7 here, and not a verdict that the cast was mis-timed. The
    // amount AFTER the cost is never computed: see the no-simulation regression.
    expect(result.value.observedAmount).toBe(43);
    expect(result.value).not.toHaveProperty("amountAfterCost");
    expect(JSON.stringify(result.value)).not.toContain("-7");
  });
});

// --------------------------------------------------------------------------
// Standalone changes
// --------------------------------------------------------------------------

describe("standalone changes stay separate from attached snapshots", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["RESOURCES"],
      events: [
        // A real capture carries BOTH shapes on one event: a delta of 10 and an
        // attached snapshot reading 100.
        resourceChangeEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          sourceActorId: PLAYER,
          targetActorId: PLAYER,
          resourceType: ENERGY,
          resourceChange: 10,
          maxResourceAmount: 100,
          reportedWasteAmount: 4,
          attachedResources: attachedResources({
            side: "SOURCE",
            actorId: PLAYER,
            classResources: [classResource(ENERGY, 100, { max: 100 })],
          }),
        }),
        damageEvent({ ordinal: 1, reportTimeMs: 2000, sourceActorId: PLAYER, targetActorId: BOSS }),
      ],
    }),
  );

  it("indexes the same event in both, because it carries both observations", () => {
    expect(state.resources.standaloneChangePositionsFor(PLAYER, ENERGY)).toEqual([0]);
    expect(state.resources.snapshotPositionsFor(PLAYER, ENERGY)).toEqual([0]);
  });

  it("returns two structurally different observations", () => {
    const change = state.resources.standaloneChangeOnEvent(0);
    const snapshot = state.resources.observationOnEvent(0, PLAYER, ENERGY);

    if (change.certainty !== "EXACT" || snapshot.certainty !== "EXACT") return;
    expect(change.value.resourceChange).toBe(10);
    expect(snapshot.value.observedAmount).toBe(100);
    // Never merged into one synthetic event. 100 is the amount AFTER the +10
    // (POST_CHANGE, settled by M11-B5's whole-window reconciliation), and it is
    // READ: the change carries no amount and the snapshot carries no delta, so
    // nothing can add the two.
    expect(snapshot.value.timing).toBe("POST_CHANGE");
    expect(change.value).not.toHaveProperty("observedAmount");
    expect(snapshot.value).not.toHaveProperty("resourceChange");
  });

  it("preserves the factual fields M3 normalized", () => {
    const change = state.resources.standaloneChangeOnEvent(0);

    if (change.certainty !== "EXACT") return;
    expect(change.value.resourceType).toBe(ENERGY);
    expect(change.value.maxResourceAmount).toBe(100);
    expect(change.value.otherResourceChange).toBeNull();
    expect(change.value.source?.actorId).toBe(PLAYER);
  });

  it("keeps Warcraft Logs' waste number observational", () => {
    const change = state.resources.standaloneChangeOnEvent(0);

    if (change.certainty !== "EXACT") return;
    expect(change.value.reportedWasteAmount).toBe(4);
    // An observed field, not a verdict. Being at cap is not waste, and a
    // reported 4 is not a mistake, an overcap judgement, or a finding.
    for (const forbidden of ["wastedResource", "atCap", "overcap", "isWaste", "mistake"]) {
      expect(change.value).not.toHaveProperty(forbidden);
    }
    expect(JSON.stringify(change.value).toLowerCase()).not.toContain("mistake");
  });

  it("does not replay the delta into a later exact amount", () => {
    const later = state.resources.latestObservedAtOrBefore({
      actorId: PLAYER,
      resourceType: ENERGY,
      at: afterEvent(1),
    });

    expect(later.certainty).toBe("STALE");
    if (later.certainty !== "STALE") return;
    // The snapshot's 100, aged — not 110, and not any other number arrived at by
    // applying the observed +10 to something.
    expect(later.value.observedAmount).toBe(100);
    expect(later.value.observedAmount).not.toBe(110);
  });

  it("returns NO_OBSERVATION for a position holding no standalone change", () => {
    const result = state.resources.standaloneChangeOnEvent(1);

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("NO_OBSERVATION");
  });

  it("refuses a position outside the canonical sequence", () => {
    const result = state.resources.standaloneChangeOnEvent(99);

    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });
});

describe("resource at cap is not resource waste", () => {
  it("reports a full pool as an amount, with no verdict attached", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["RESOURCES"],
        events: [
          castEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            castPhase: "COMPLETE",
            sourceActorId: PLAYER,
            attachedResources: attachedResources({
              side: "SOURCE",
              actorId: PLAYER,
              // 7 / 7 combo points, immediately spent. Not waste.
              classResources: [classResource(COMBO_POINTS, 7, { max: 7, cost: 7 })],
            }),
          }),
        ],
      }),
    );
    const result = state.resources.observationOnEvent(0, PLAYER, COMBO_POINTS);

    if (result.certainty !== "EXACT") return;
    expect(result.value.observedAmount).toBe(7);
    expect(result.value.observedMax).toBe(7);
    // Being at cap is a number equal to another number. Whether it means
    // anything is a specialization evaluator's call.
    expect(JSON.stringify(result.value).toLowerCase()).not.toContain("waste");
  });
});

// --------------------------------------------------------------------------
// Evidence gating
// --------------------------------------------------------------------------

describe("an observational query is not a continuity claim", () => {
  /**
   * `latestObservedAtOrBefore` reports what is IN OUR EVIDENCE:
   *
   *     "the latest matching observation we hold is 43, made at 1200, and you
   *      asked about 4000"
   *
   * Nothing about an uncovered stretch, an unverified capability or a declared
   * scope makes that sentence false. Each of those would only block the STRONGER
   * claim — that no newer observation existed — which this query never makes.
   * STALE rather than EXACT is how it declines to make it.
   */
  function fightWith(categories: SyntheticFightOptions["categories"]) {
    return createCombatState(
      syntheticFight({
        categories,
        events: [
          castEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            castPhase: "COMPLETE",
            sourceActorId: PLAYER,
            attachedResources: attachedResources({
              side: "SOURCE",
              actorId: PLAYER,
              classResources: [classResource(ENERGY, 43, { max: 100 })],
            }),
          }),
          damageEvent({ ordinal: 1, reportTimeMs: 4000, sourceActorId: PLAYER, targetActorId: BOSS }),
        ],
      }),
    );
  }

  const query = { actorId: PLAYER, resourceType: ENERGY, at: afterEvent(1) };

  it("does not let an uncovered stretch erase the observation", () => {
    const result = fightWith({
      RESOURCES: partialCategory([exclusiveRange(1000, 2000)]),
    }).resources.latestObservedAtOrBefore(query);

    expect(result.certainty).toBe("STALE");
    if (result.certainty !== "STALE") return;
    // The 2000-4000 stretch was never retrieved. That means we cannot say
    // nothing newer existed — and we do not say it. What we DO say, truthfully,
    // is that 43 at 1200 is the latest matching observation we hold.
    expect(result.value.observedAmount).toBe(43);
    expect(result.observedAtReportTimeMs).toBe(1200);
    expect(result.asOfReportTimeMs).toBe(4000);
    expect(result.provenance.locators[0]?.ingestionOrdinal).toBe(0);
  });

  it("does not let an UNVERIFIED capability erase evidence already in hand", () => {
    const result = fightWith({ RESOURCES: UNVERIFIED_CATEGORY }).resources.latestObservedAtOrBefore(query);

    expect(result.certainty).toBe("STALE");
    if (result.certainty !== "STALE") return;
    // Not knowing whether Warcraft Logs emits a category cannot un-observe an
    // observation it already emitted.
    expect(result.value.observedAmount).toBe(43);
  });

  it("does not let ABSENT coverage erase the observation", () => {
    const result = fightWith({ RESOURCES: absentCategory() }).resources.latestObservedAtOrBefore(query);

    expect(result.certainty).toBe("STALE");
    if (result.certainty !== "STALE") return;
    expect(result.value.observedAmount).toBe(43);
  });

  it("still reads the observation off its own event without any coverage", () => {
    const bare = fightWith({ RESOURCES: UNVERIFIED_CATEGORY });

    // The positive-observation asymmetry: the event is in hand.
    expect(bare.resources.observationOnEvent(0, PLAYER, ENERGY).certainty).toBe("EXACT");
    expect(bare.resources.latestObservedAtOrBefore({ ...query, at: afterEvent(0) }).certainty).toBe("EXACT");
  });

  it("reports an out-of-scope actor's observation, since it was observed", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["RESOURCES"],
        actorScope: [PLAYER],
        events: [
          castEvent({
            ordinal: 0,
            reportTimeMs: 1200,
            castPhase: "COMPLETE",
            sourceActorId: ALLY,
            attachedResources: attachedResources({
              side: "SOURCE",
              actorId: ALLY,
              classResources: [classResource(ENERGY, 60)],
            }),
          }),
          damageEvent({ ordinal: 1, reportTimeMs: 2000, sourceActorId: ALLY, targetActorId: BOSS }),
        ],
      }),
    );
    const result = state.resources.latestObservedAtOrBefore({
      actorId: ALLY,
      resourceType: ENERGY,
      at: afterEvent(1),
    });

    expect(result.certainty).toBe("STALE");
    if (result.certainty !== "STALE") return;
    // Scope declares what the evidence VOUCHES for, which bears on absence
    // claims. It does not retract an ally observation that physically sits in
    // the stream.
    expect(result.value.observedAmount).toBe(60);
    expect(result.value.actor?.actorId).toBe(ALLY);
  });

  it("still gates the one branch that IS an absence claim", () => {
    // "Our evidence contains no matching observation" is a claim about having
    // looked. With coverage it is NO_OBSERVATION; without, it is the gate's
    // reason.
    const covered = createCombatState(
      syntheticFight({ observedCategories: ["RESOURCES"], events: fightWith({}).fight.events }),
    );
    const uncovered = fightWith({ RESOURCES: UNVERIFIED_CATEGORY });
    const missing = { actorId: PLAYER, resourceType: COMBO_POINTS, at: afterEvent(1) };

    const withCoverage = covered.resources.latestObservedAtOrBefore(missing);
    const withoutCoverage = uncovered.resources.latestObservedAtOrBefore(missing);

    if (withCoverage.certainty !== "UNKNOWN" || withoutCoverage.certainty !== "UNKNOWN") return;
    expect(withCoverage.reason).toBe("NO_OBSERVATION");
    expect(withoutCoverage.reason).toBe("CAPABILITY_UNVERIFIED");
  });

  it("never presents a stale value as exact current state", () => {
    const result = fightWith({ RESOURCES: absentCategory() }).resources.latestObservedAtOrBefore(query);

    // Ungating STALE must not have turned it into EXACT. The whole reason the
    // observation survives an uncovered gap is that the result refuses to claim
    // the value still held at the query instant.
    expect(result.certainty).not.toBe("EXACT");
    expect(result.certainty).not.toBe("BOUNDED");
    if (result.certainty !== "STALE") return;
    expect(result.asOfReportTimeMs).toBeGreaterThan(result.observedAtReportTimeMs);
  });

  it("fails closed on disordered time", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["RESOURCES"],
        events: [
          castEvent({
            ordinal: 0,
            reportTimeMs: 4000,
            castPhase: "COMPLETE",
            sourceActorId: PLAYER,
            attachedResources: attachedResources({
              side: "SOURCE",
              actorId: PLAYER,
              classResources: [classResource(ENERGY, 43)],
            }),
          }),
          damageEvent({ ordinal: 1, reportTimeMs: 1200, sourceActorId: PLAYER, targetActorId: BOSS }),
        ],
      }),
    );
    const result = state.resources.latestObservedAtOrBefore(query);

    expect(state.temporalIntegrity.state).toBe("NON_MONOTONIC");
    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // A STALE result asserts that `observedAt` precedes `asOf`. The observation
    // sits at 4000 and the query instant at 1200, so that ordering cannot be
    // stated — the one claim the result does make is the one that fails.
    expect(result.reason).toBe("NON_MONOTONIC_TIME");
  });
});

// --------------------------------------------------------------------------
// Health
// --------------------------------------------------------------------------

describe("health observations are sparse and never continuous", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["RESOURCES"],
      events: [
        castEvent({
          ordinal: 0,
          reportTimeMs: 1200,
          castPhase: "COMPLETE",
          sourceActorId: PLAYER,
          attachedResources: attachedResources({
            side: "SOURCE",
            actorId: PLAYER,
            hitPoints: 777_040,
            maxHitPoints: 777_040,
            absorb: 28_169,
          }),
        }),
        damageEvent({ ordinal: 1, reportTimeMs: 2000, sourceActorId: BOSS, targetActorId: PLAYER }),
      ],
    }),
  );

  it("reads the health fields off the snapshot that carried them", () => {
    const result = state.resources.healthObservationOnEvent(0, PLAYER);

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.hitPoints).toBe(777_040);
    expect(result.value.maxHitPoints).toBe(777_040);
    expect(result.value.absorb).toBe(28_169);
  });

  it("indexes only the positions that actually carried health", () => {
    expect(state.resources.healthPositionsFor(PLAYER)).toEqual([0]);
    expect(state.resources.healthPositionsFor(BOSS)).toEqual([]);
  });

  it("offers no carried-forward or continuous health accessor", () => {
    for (const forbidden of [
      "latestHealthAtOrBefore",
      "healthAt",
      "healthDeficitAt",
      "isAlive",
      "wasAlive",
      "deathAt",
    ]) {
      expect(state.resources).not.toHaveProperty(forbidden);
    }
  });

  it("infers nothing about health between observations", () => {
    // Position 1 is damage to the player carrying no snapshot. The health from
    // position 0 is not carried onto it, and no death is inferred.
    const result = state.resources.healthObservationOnEvent(1, PLAYER);

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("NO_OBSERVATION");
  });
});

// --------------------------------------------------------------------------
// Real normalized input
// --------------------------------------------------------------------------

describe("resource indexes over a committed capture", () => {
  const CAPTURE_END = 7_383_000;

  // Through the shared corpus coverage interpreter: the artifact retains no
  // coverage grant, so nothing below may rest on an absence or a carry-forward.
  const state = corpusState("wcl-pull-window-with-resources");

  it("has real captured resource evidence to index", () => {
    expect(state.resources.indexes.snapshotPositionsByActor.size).toBeGreaterThan(0);
    expect(state.resources.indexes.standaloneChangePositions.length).toBeGreaterThan(0);
  });

  it("agrees with a direct scan for every indexed actor and resource", () => {
    for (const [actorId, byType] of state.resources.indexes.snapshotPositionsByActor) {
      for (const [resourceType, positions] of byType) {
        const expected = state.fight.events
          .map((event, position) => ({ event, position }))
          .filter(
            (entry) =>
              entry.event.attachedResources?.actor?.actorId === actorId &&
              entry.event.attachedResources.classResources.some(
                (resource) => resource.resourceType === resourceType,
              ),
          )
          .map((entry) => entry.position);

        expect(positions).toEqual(expected);
      }
    }
  });

  it("keeps every captured snapshot's side as M3 recorded it", () => {
    for (const [actorId, byType] of state.resources.indexes.snapshotPositionsByActor) {
      for (const [resourceType, positions] of byType) {
        for (const position of positions) {
          const result = state.resources.observationOnEvent(position, actorId, resourceType);
          if (result.certainty !== "EXACT") continue;
          const attached = state.fight.events[position]?.attachedResources;
          expect(result.value.side).toBe(attached?.side);
          expect(result.value.actor?.actorId).toBe(attached?.actor?.actorId);
        }
      }
    }
  });

  it("finds the captured resourcechange events with their reported waste", () => {
    const positions = state.resources.indexes.standaloneChangePositions;
    expect(positions.length).toBeGreaterThan(0);

    for (const position of positions) {
      const result = state.resources.standaloneChangeOnEvent(position);
      if (result.certainty !== "EXACT") continue;
      // The capture's `waste: 0`. Zero reported waste is an observed number, and
      // it is not "no mistake was made" any more than a positive one is a
      // mistake.
      expect(result.value.reportedWasteAmount).toBe(0);
      expect(typeof result.value.resourceChange).toBe("number");
    }
  });

  it("answers a timestamp-addressed query over the capture", () => {
    const [actorId] = [...state.resources.indexes.snapshotPositionsByActor.keys()];
    if (actorId === undefined) return;
    const byType = state.resources.indexes.snapshotPositionsByActor.get(actorId);
    const [resourceType] = byType === undefined ? [] : [...byType.keys()];
    if (resourceType === undefined) return;

    const result = state.resources.latestObservedAtOrBefore({
      actorId,
      resourceType,
      at: endOfTimestamp(CAPTURE_END),
    });

    // Exact or stale, never fabricated.
    expect(["EXACT", "STALE"]).toContain(result.certainty);
  });
});
