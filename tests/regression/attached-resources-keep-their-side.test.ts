import { describe, expect, it } from "vitest";

import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import {
  RESOURCE_ACTOR_SOURCE,
  RESOURCE_ACTOR_TARGET,
  VERIFIED_DIRECTION_FIELDS,
} from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../src/engine/normalization/supported-families.js";
import pullWindowFixture from "../fixtures/wcl/events/wcl-pull-window-with-resources.json";

/**
 * Warcraft Logs attaches ONE resource snapshot per event under
 * `includeResources`, flattened onto the event's top level, and says which side
 * it belongs to via `resourceActor` (1 = source, 2 = target).
 *
 * Verified in a live capture: a `damage` event from a player to the boss
 * carried `resourceActor: 2` and `hitPoints: 859705671` — the boss's health
 * pool, not the player's. A `cast` by the same player carried
 * `resourceActor: 1` and that player's own 777,040 health.
 *
 * Assuming a snapshot belongs to the source would therefore attribute the
 * boss's health, position and resources to the player on every damage and heal
 * event. That is the same class of bug as the historical aura-direction
 * inversion, in a place nobody was looking.
 *
 * There is no `sourceResources` / `targetResources` object in the raw payload.
 */

const RANGE = inclusiveRange(7_381_097, 7_382_500);

function normalize(events: readonly unknown[]) {
  const normalizer = createNormalizer({
    fightStartTimeMs: 7_381_097,
    requestedRange: RANGE,
    contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: RANGE.fromReportTimeMs,
    nextPageTimestamp: null,
    events,
  });
  return normalizer.finish();
}

const CAPTURED = pullWindowFixture as Record<string, unknown>[];

describe("a target-side snapshot is never attributed to the source", () => {
  const targetSide = CAPTURED.filter((event) => event["resourceActor"] === RESOURCE_ACTOR_TARGET);

  it("has real captured evidence to test against", () => {
    expect(targetSide.length).toBeGreaterThan(0);
  });

  it("records side TARGET and binds the snapshot to the target actor", () => {
    const output = normalize(targetSide);

    for (const event of output.events) {
      const attached = event.attachedResources;
      expect(attached).not.toBeNull();
      expect(attached?.side).toBe("TARGET");
      // The decisive assertion: the snapshot's actor is the event's TARGET.
      expect(attached?.actor?.actorId).toBe(event.target?.actorId);
      if (event.source !== null) {
        expect(attached?.actor?.actorId).not.toBe(event.source.actorId);
      }
    }
  });

  it("does not report the target's health as the source's", () => {
    // The captured case: a player hits the boss, and the snapshot carries the
    // boss's 859M health pool.
    const damage = normalize(targetSide).events.find((event) => event.kind === "DAMAGE");
    const attached = damage?.attachedResources;

    expect(attached?.side).toBe("TARGET");
    expect(attached?.hitPoints).not.toBeNull();
    expect(attached?.actor?.actorId).toBe(damage?.target?.actorId);
  });
});

describe("a source-side snapshot binds to the source", () => {
  const sourceSide = CAPTURED.filter((event) => event["resourceActor"] === RESOURCE_ACTOR_SOURCE);

  it("has real captured evidence to test against", () => {
    expect(sourceSide.length).toBeGreaterThan(0);
  });

  it("records side SOURCE and binds the snapshot to the source actor", () => {
    const output = normalize(sourceSide);

    for (const event of output.events) {
      expect(event.attachedResources?.side).toBe("SOURCE");
      expect(event.attachedResources?.actor?.actorId).toBe(event.source?.actorId);
    }
  });

  it("preserves class resources, including the observed cast cost", () => {
    const withCost = normalize(sourceSide)
      .events.flatMap((event) => event.attachedResources?.classResources ?? [])
      .filter((resource) => resource.cost !== null);

    expect(withCost.length).toBeGreaterThan(0);
    for (const resource of withCost) {
      expect(typeof resource.resourceType).toBe("number");
      expect(typeof resource.amount).toBe("number");
    }
  });
});

describe("the two resource observation shapes stay distinct", () => {
  it("keeps standalone resourcechange out of attachedResources", () => {
    const output = normalize(CAPTURED);
    const standalone = output.events.filter((event) => event.kind === "RESOURCE_CHANGE");

    expect(standalone.length).toBeGreaterThan(0);
    for (const event of standalone) {
      if (event.kind !== "RESOURCE_CHANGE") continue;
      // The standalone observation lives in its own variant, with its own
      // fields. An attached snapshot may ALSO be present on the same event, and
      // the two must not be confused for one another.
      expect(typeof event.resourceChange).toBe("number");
      expect(typeof event.resourceType).toBe("number");
    }
  });

  it("preserves WCL's waste number without calling it waste", () => {
    const output = normalize(CAPTURED);
    const change = output.events.find((event) => event.kind === "RESOURCE_CHANGE");
    if (change?.kind !== "RESOURCE_CHANGE") return;

    // An observed field, not a verdict. Being at cap is not waste, and this
    // number is not a claim that anything was wasted.
    expect(change).toHaveProperty("reportedWasteAmount");
    expect(change).not.toHaveProperty("wastedResource");
    expect(change).not.toHaveProperty("atCap");
  });
});

describe("no snapshot is manufactured from unrelated fields", () => {
  it("ignores armor/absorb on events that carry no resourceActor", () => {
    // `armor`, `absorb` and `avoidance` also appear as unrelated top-level keys
    // on combatantinfo and on some aura events. Reading them ungated would
    // invent resource snapshots out of them.
    const output = normalize([
      { timestamp: 7_381_200, type: "applybuff", sourceID: 5, targetID: 5, absorb: 1234 },
    ]);
    expect(output.events[0]?.attachedResources).toBeNull();
  });

  it("ignores an unrecognised resourceActor discriminator", () => {
    const output = normalize([
      { timestamp: 7_381_200, type: "cast", sourceID: 5, resourceActor: 9, hitPoints: 100 },
    ]);
    expect(output.events[0]?.attachedResources).toBeNull();
  });

  it("keeps a snapshot whose side has no concrete actor, without inventing one", () => {
    const output = normalize([
      {
        timestamp: 7_381_200,
        type: "damage",
        sourceID: -1,
        targetID: 5,
        amount: 10,
        resourceActor: RESOURCE_ACTOR_SOURCE,
        hitPoints: 500,
        classResources: [{ type: 3, amount: 50, max: 100 }],
      },
    ]);
    const attached = output.events[0]?.attachedResources;

    // The snapshot is still a fact; the actor behind it simply was not stated.
    expect(attached?.side).toBe("SOURCE");
    expect(attached?.actor).toBeNull();
    expect(attached?.hitPoints).toBe(500);
    expect(attached?.classResources).toHaveLength(1);
  });
});
