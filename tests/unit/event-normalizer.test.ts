import { describe, expect, it } from "vitest";

import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import type { DirectionFieldNames } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  type SupportedTypeContract,
} from "../../src/engine/normalization/supported-families.js";
import type { RawEventPage } from "../../src/wcl/retrieval-types.js";

const RANGE = inclusiveRange(1000, 5000);
const FIGHT_START = 1000;

/**
 * A verified-SHAPED field map, used to exercise the direction machinery.
 *
 * Production still carries `VERIFIED_DIRECTION_FIELDS = null`, because probe
 * question P2 has not been answered. These tests prove the mechanism works the
 * moment real key names are committed; they do not assert that these are the
 * real key names.
 */
const TEST_DIRECTION_FIELDS: DirectionFieldNames = {
  sourceId: "sourceID",
  sourceInstance: "sourceInstance",
  targetId: "targetID",
  targetInstance: "targetInstance",
  abilityGameId: "abilityGameID",
};

/** A test-only contract. Production's registry is empty until evidence exists. */
const CAST_CONTRACT: SupportedTypeContract = {
  handling: "FAMILY",
  rawType: "cast",
  family: "CAST",
  category: "CASTS",
  evidence: { kind: "SANITIZED_CAPTURE", fixtureId: "test-only", capturedOn: "2026-09-11" },
  decode: (base, raw) => {
    const duration = raw["duration"];
    if (typeof duration !== "number") {
      return { ok: false, problems: [{ field: "duration", problem: "MISSING" }] };
    }
    return { ok: true, event: { ...base, kind: "ENVELOPE_ONLY" } };
  },
};

const ENVELOPE_ONLY_CONTRACT: SupportedTypeContract = {
  handling: "ENVELOPE_ONLY",
  rawType: "zonechange",
  category: "ENCOUNTER_PHASES",
  evidence: { kind: "SANITIZED_CAPTURE", fixtureId: "test-only", capturedOn: "2026-09-11" },
};

function page(events: readonly unknown[], pageOrdinal = 0): RawEventPage {
  return {
    streamId: "all",
    pageOrdinal,
    requestedStartTimeMs: RANGE.fromReportTimeMs,
    nextPageTimestamp: null,
    events,
  };
}

function normalize(
  events: readonly unknown[],
  options: {
    contracts?: readonly SupportedTypeContract[];
    directionFields?: DirectionFieldNames | null;
  } = {},
) {
  const normalizer = createNormalizer({
    fightStartTimeMs: FIGHT_START,
    requestedRange: RANGE,
    contracts: indexContracts(options.contracts ?? []),
    directionFields: options.directionFields ?? null,
  });
  normalizer.accept(page(events));
  return normalizer.finish();
}

describe("envelope establishment", () => {
  it("normalizes an event with a valid timestamp and type", () => {
    const output = normalize([{ timestamp: 1500, type: "cast" }]);

    expect(output.events).toHaveLength(1);
    expect(output.malformedObservations).toHaveLength(0);
    const event = output.events[0];
    expect(event?.reportTimeMs).toBe(1500);
    expect(event?.fightTimeMs).toBe(500);
    expect(event?.rawType).toBe("cast");
  });

  it("preserves reportTimeMs alongside fightTimeMs rather than replacing it", () => {
    const output = normalize([{ timestamp: 4321, type: "damage" }]);
    const event = output.events[0];

    expect(event?.reportTimeMs).toBe(4321);
    expect(event?.fightTimeMs).toBe(3321);
    expect(event?.locator.reportTimeMs).toBe(4321);
  });

  it("does not require timestamps to be integers", () => {
    const output = normalize([{ timestamp: 1500.75, type: "cast" }]);
    expect(output.events[0]?.reportTimeMs).toBe(1500.75);
  });

  it("ignores extra unknown fields instead of failing", () => {
    // Warcraft Logs may add keys without notice; that must not break a usable
    // fight. Decoding is open-world for extras and strict for required fields.
    const output = normalize([
      { timestamp: 1500, type: "cast", somethingBrandNew: { nested: true }, another: 7 },
    ]);
    expect(output.events).toHaveLength(1);
    expect(output.malformedObservations).toHaveLength(0);
  });
});

describe("observations whose envelope cannot be established", () => {
  it("keeps them OUT of events[] entirely", () => {
    const output = normalize([{ type: "cast" }]);

    // Without a timestamp there is no position in a chronological sequence, so
    // it is not an event and must not be placed in one.
    expect(output.events).toHaveLength(0);
    expect(output.malformedObservations).toHaveLength(1);
    expect(output.malformedEnvelopeCount).toBe(1);
  });

  it("invents no timestamp, type, source or target", () => {
    const output = normalize([{ somethingElse: 1 }]);
    const observation = output.malformedObservations[0];

    expect(observation).toBeDefined();
    // The entire reason this type is separate: nothing gets fabricated to
    // satisfy a required field.
    expect(observation && "reportTimeMs" in observation).toBe(false);
    expect(observation && "rawType" in observation).toBe(false);
    expect(observation).not.toHaveProperty("source");
    expect(observation).not.toHaveProperty("target");
  });

  it("preserves the retrieval position, which is always knowable", () => {
    const output = normalize([{ timestamp: 1500, type: "cast" }, { type: "broken" }]);
    const observation = output.malformedObservations[0];

    expect(observation?.position).toEqual({
      streamId: "all",
      pageOrdinal: 0,
      indexInPage: 1,
      ingestionOrdinal: 1,
    });
  });

  it("keeps whichever envelope field actually decoded, and only that one", () => {
    const missingTimestamp = normalize([{ type: "cast" }]);
    expect(missingTimestamp.malformedObservations[0]?.rawType).toBe("cast");
    expect(missingTimestamp.malformedObservations[0]).not.toHaveProperty("reportTimeMs");

    const missingType = normalize([{ timestamp: 1500 }]);
    expect(missingType.malformedObservations[0]?.reportTimeMs).toBe(1500);
    expect(missingType.malformedObservations[0]).not.toHaveProperty("rawType");
  });

  it("distinguishes a missing field from a wrongly typed one", () => {
    const missing = normalize([{ type: "cast" }]);
    expect(missing.malformedObservations[0]?.problems).toEqual([{ field: "timestamp", problem: "MISSING" }]);

    const wrongType = normalize([{ timestamp: "1500", type: "cast" }]);
    expect(wrongType.malformedObservations[0]?.problems).toEqual([
      { field: "timestamp", problem: "WRONG_TYPE" },
    ]);
  });

  it("degrades every category of the stream when the defect is untyped", () => {
    // An untyped, untimed observation could belong to any family. Deciding it
    // probably did not matter is the alternative, and it is the wrong one.
    const output = normalize([{ nothing: true }]);
    expect(output.streamsWithUntypedDefects.has("all")).toBe(true);
  });
});

describe("unknown event types", () => {
  it("preserves and counts them rather than dropping them", () => {
    const output = normalize([{ timestamp: 1500, type: "somethingblizzardaddedlastweek" }]);

    expect(output.events).toHaveLength(1);
    expect(output.events[0]?.kind).toBe("UNSUPPORTED_TYPE");
    expect(output.unsupportedTypeCounts.get("somethingblizzardaddedlastweek")).toBe(1);
  });

  it("does not degrade any category", () => {
    // A new upstream type is expected churn and costs us nothing. It is not
    // evidence that our contracts broke.
    const output = normalize([{ timestamp: 1500, type: "brandnew" }]);
    expect(output.degradedCategories.size).toBe(0);
  });

  it("normalizes every event as UNSUPPORTED_TYPE while the registry is empty", () => {
    // The honest current state: no sanitized capture is committed, so no raw
    // type string can be cited, so none is recognised.
    const output = normalize([
      { timestamp: 1500, type: "cast" },
      { timestamp: 1600, type: "damage" },
    ]);
    expect(output.events.every((event) => event.kind === "UNSUPPORTED_TYPE")).toBe(true);
  });
});

describe("recognized types", () => {
  it("decodes an envelope-only type without reading family fields", () => {
    const output = normalize([{ timestamp: 1500, type: "zonechange" }], {
      contracts: [ENVELOPE_ONLY_CONTRACT],
    });

    expect(output.events[0]?.kind).toBe("ENVELOPE_ONLY");
    expect(output.unsupportedTypeCounts.size).toBe(0);
  });

  it("produces MALFORMED_FAMILY — not UNSUPPORTED_TYPE — for a bad required field", () => {
    const output = normalize([{ timestamp: 1500, type: "cast" }], { contracts: [CAST_CONTRACT] });
    const event = output.events[0];

    // The asymmetry is the point. An unknown TYPE is upstream churn; a
    // malformed KNOWN event means our contract broke and must be visible.
    expect(event?.kind).toBe("MALFORMED_FAMILY");
    expect(output.unsupportedTypeCounts.size).toBe(0);
    expect(output.malformedFamilyCountsByType.get("cast")).toBe(1);
  });

  it("degrades the owning category when a known event is malformed", () => {
    const output = normalize([{ timestamp: 1500, type: "cast" }], { contracts: [CAST_CONTRACT] });
    expect(output.degradedCategories.has("CASTS")).toBe(true);
  });

  it("keeps a real envelope on a malformed family event, so the defect stays localisable", () => {
    const output = normalize([{ timestamp: 1500, type: "cast" }], { contracts: [CAST_CONTRACT] });
    const event = output.events[0];

    expect(event?.reportTimeMs).toBe(1500);
    expect(event?.locator.pageOrdinal).toBe(0);
    if (event?.kind === "MALFORMED_FAMILY") {
      expect(event.claimedType).toBe("cast");
      expect(event.problems).toEqual([{ field: "duration", problem: "MISSING" }]);
    }
  });
});

describe("timestamps outside the requested range", () => {
  it("keeps the event and flags it rather than clamping or dropping it", () => {
    const output = normalize([
      { timestamp: 500, type: "early" },
      { timestamp: 1500, type: "inside" },
      { timestamp: 9000, type: "late" },
    ]);

    expect(output.events).toHaveLength(3);
    expect(output.events[0]?.outsideRequestedRange).toBe(true);
    expect(output.events[1]?.outsideRequestedRange).toBe(false);
    expect(output.events[2]?.outsideRequestedRange).toBe(true);
    // Clamping would fabricate precision; dropping would fabricate absence.
    expect(output.events[0]?.reportTimeMs).toBe(500);
    expect(output.events[2]?.reportTimeMs).toBe(9000);
  });

  it("treats an event at exactly the requested endTime as INSIDE the range", () => {
    // Warcraft Logs returns events at exactly `endTime` (verified by live
    // probe), so flagging one as outside would misreport evidence we genuinely
    // requested and genuinely received.
    const output = normalize([{ timestamp: 5000, type: "boundary" }]);
    expect(output.events[0]?.outsideRequestedRange).toBe(false);
  });

  it("still treats an event past the requested endTime as outside", () => {
    const output = normalize([{ timestamp: 5001, type: "beyond" }]);
    expect(output.events[0]?.outsideRequestedRange).toBe(true);
  });
});

describe("direction fields while unverified", () => {
  it("records direction as ABSENT rather than guessing it", () => {
    const output = normalize([{ timestamp: 1500, type: "applydebuff", sourceID: 42, targetID: 5 }]);
    const event = output.events[0];

    // Probe question P2 has not been answered, so no key name may be read. The
    // event still normalizes; its direction is simply not asserted.
    expect(event?.source).toBeNull();
    expect(event?.target).toBeNull();
    expect(event?.abilityGameId).toBeNull();
  });

  it("never infers direction from which stream returned the event", () => {
    const fromEnemyStream = createNormalizer({
      fightStartTimeMs: FIGHT_START,
      requestedRange: RANGE,
      contracts: indexContracts([]),
      directionFields: null,
    });
    fromEnemyStream.accept({
      streamId: "all:enemies",
      pageOrdinal: 0,
      requestedStartTimeMs: 1000,
      nextPageTimestamp: null,
      events: [{ timestamp: 1500, type: "applydebuff" }],
    });

    expect(fromEnemyStream.finish().events[0]?.source).toBeNull();
  });
});

describe("direction machinery, exercised with an injected field map", () => {
  it("keeps source and target as separate, distinguishable actors", () => {
    const output = normalize(
      [
        {
          timestamp: 1500,
          type: "applydebuff",
          sourceID: 42,
          sourceInstance: 2,
          targetID: 5,
          abilityGameID: 1329,
        },
      ],
      { directionFields: TEST_DIRECTION_FIELDS },
    );
    const event = output.events[0];

    expect(event?.source).toEqual({ actorId: 42, instanceId: 2 });
    expect(event?.target).toEqual({ actorId: 5, instanceId: null });
    expect(event?.abilityGameId).toBe(1329);
  });

  it("does not collapse an absent instance id into instance 0", () => {
    const output = normalize([{ timestamp: 1500, type: "damage", sourceID: 7 }], {
      directionFields: TEST_DIRECTION_FIELDS,
    });
    expect(output.events[0]?.source).toEqual({ actorId: 7, instanceId: null });
  });

  it("leaves a missing source null instead of substituting the target", () => {
    const output = normalize([{ timestamp: 1500, type: "damage", targetID: 5 }], {
      directionFields: TEST_DIRECTION_FIELDS,
    });
    expect(output.events[0]?.source).toBeNull();
    expect(output.events[0]?.target).toEqual({ actorId: 5, instanceId: null });
  });
});

describe("ordering", () => {
  it("assigns monotonic ingestion ordinals across pages in retrieval order", () => {
    const normalizer = createNormalizer({
      fightStartTimeMs: FIGHT_START,
      requestedRange: RANGE,
      contracts: indexContracts([]),
      directionFields: null,
    });
    normalizer.accept(
      page(
        [
          { timestamp: 1500, type: "a" },
          { timestamp: 1500, type: "b" },
        ],
        0,
      ),
    );
    normalizer.accept(page([{ timestamp: 1500, type: "c" }], 1));
    const output = normalizer.finish();

    expect(output.events.map((event) => event.ingestionOrdinal)).toEqual([0, 1, 2]);
    expect(output.events.map((event) => event.rawType)).toEqual(["a", "b", "c"]);
  });

  it("preserves relative order of events sharing a timestamp", () => {
    const output = normalize([
      { timestamp: 2000, type: "first" },
      { timestamp: 2000, type: "second" },
      { timestamp: 2000, type: "third" },
    ]);
    expect(output.events.map((event) => event.rawType)).toEqual(["first", "second", "third"]);
  });
});
