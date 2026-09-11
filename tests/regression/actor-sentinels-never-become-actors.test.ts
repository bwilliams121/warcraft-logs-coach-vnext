import { describe, expect, it } from "vitest";

import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import {
  NO_ACTOR_SENTINEL,
  VERIFIED_DIRECTION_FIELDS,
} from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../src/engine/normalization/supported-families.js";
import sentinelSourceFixture from "../fixtures/wcl/events/wcl-no-actor-sentinel-source.json";
import midfightFixture from "../fixtures/wcl/events/wcl-midfight-window.json";

/**
 * Warcraft Logs uses `-1` as a no-actor sentinel on BOTH `sourceID` and
 * `targetID`. Verified in live captures: the mid-fight window carries 92 events
 * with `sourceID: -1` and 117 with `targetID: -1`, including an `empowerend`
 * whose target is -1 and environment damage with no stated source.
 *
 * Read naively, `-1` becomes "actor number minus one" — an actor that does not
 * exist, that resolves against no master-data entry, and that would silently
 * accumulate events belonging to nobody. Worse, it would be a perfectly
 * well-formed `ActorRef`, so nothing downstream would notice.
 *
 * Nothing here fabricates an actor, and nothing generalises `-1`'s meaning to
 * other negative values, for which there is no evidence at all.
 */

const RANGE = inclusiveRange(7_550_000, 7_560_000);

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

describe("sourceID: -1 never becomes actor -1", () => {
  it("produces no source actor for real captured sentinel events", () => {
    const output = normalize(sentinelSourceFixture);

    expect(output.events.length).toBeGreaterThan(0);
    for (const event of output.events) {
      expect(event.source).toBeNull();
      expect(event.sourceAbsence).toBe("NO_ACTOR_SENTINEL");
    }
  });

  it("never mints an ActorRef holding the sentinel value", () => {
    const output = normalize(sentinelSourceFixture);
    const serialized = JSON.stringify(output.events);

    expect(serialized).not.toContain(`"actorId":${NO_ACTOR_SENTINEL}`);
    expect(serialized).not.toContain('"actorId":-1');
  });

  it("keeps the rest of the event intact", () => {
    // The sentinel says "no actor here". It does not invalidate the event: the
    // damage still happened, and its target, ability and amount are all facts.
    const output = normalize(sentinelSourceFixture);
    const first = output.events[0];

    expect(first?.kind).toBe("DAMAGE");
    expect(first?.target).not.toBeNull();
    expect(first?.abilityGameId).not.toBeNull();
    expect(output.malformedObservations).toHaveLength(0);
  });
});

describe("targetID: -1 never becomes actor -1", () => {
  const sentinelTargets = (midfightFixture as { targetID?: number }[]).filter(
    (event) => event.targetID === NO_ACTOR_SENTINEL,
  );

  it("has real captured evidence to test against", () => {
    expect(sentinelTargets.length).toBeGreaterThan(0);
  });

  it("produces no target actor", () => {
    const output = normalize(sentinelTargets);

    for (const event of output.events) {
      expect(event.target).toBeNull();
      expect(event.targetAbsence).toBe("NO_ACTOR_SENTINEL");
    }
    expect(JSON.stringify(output.events)).not.toContain('"actorId":-1');
  });
});

describe("absence is distinguishable from the sentinel", () => {
  it("records NOT_SUPPLIED when the key is missing", () => {
    const output = normalize([{ timestamp: 7_551_000, type: "cast", targetID: 5 }]);
    const event = output.events[0];

    expect(event?.source).toBeNull();
    expect(event?.sourceAbsence).toBe("NOT_SUPPLIED");
    // Different fact from "Warcraft Logs told us there is no actor here".
    expect(event?.sourceAbsence).not.toBe("NO_ACTOR_SENTINEL");
  });

  it("records NO_ACTOR_SENTINEL when the key holds -1", () => {
    const output = normalize([{ timestamp: 7_551_000, type: "cast", sourceID: -1, targetID: 5 }]);
    expect(output.events[0]?.sourceAbsence).toBe("NO_ACTOR_SENTINEL");
  });

  it("sets an absence reason exactly when the reference is null", () => {
    const output = normalize([{ timestamp: 7_551_000, type: "cast", sourceID: 5, targetID: -1 }]);
    const event = output.events[0];

    expect(event?.source).not.toBeNull();
    expect(event?.sourceAbsence).toBeNull();
    expect(event?.target).toBeNull();
    expect(event?.targetAbsence).not.toBeNull();
  });
});

describe("other negative values are not given the sentinel's meaning", () => {
  it("records an unobserved negative as unusable rather than as the sentinel", () => {
    // No evidence supports generalising `-1`. A different negative is recorded
    // as something we cannot interpret — it is neither an actor nor a verified
    // "no actor" statement.
    const output = normalize([{ timestamp: 7_551_000, type: "cast", sourceID: -5 }]);
    const event = output.events[0];

    expect(event?.source).toBeNull();
    expect(event?.sourceAbsence).toBe("UNUSABLE_VALUE");
    expect(event?.sourceAbsence).not.toBe("NO_ACTOR_SENTINEL");
  });

  it("still refuses to build an actor from it", () => {
    const output = normalize([{ timestamp: 7_551_000, type: "cast", sourceID: -5 }]);
    expect(JSON.stringify(output.events)).not.toContain('"actorId":-5');
  });

  it("treats actor id 0 as a real id, since nothing rules it out", () => {
    const output = normalize([{ timestamp: 7_551_000, type: "cast", sourceID: 0 }]);
    expect(output.events[0]?.source).toEqual({ actorId: 0, instanceId: null });
  });
});
