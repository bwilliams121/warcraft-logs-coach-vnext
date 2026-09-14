import { describe, expect, it } from "vitest";

import { projectCategoryEvidence } from "../../src/engine/normalization/completeness.js";
import {
  EVIDENCE_CATEGORIES,
  EVIDENCE_CAPABILITY_REGISTRY,
  capabilityFromCapture,
  type CapabilityRecord,
  type EvidenceCategory,
  type RetrievalSource,
} from "../../src/wcl/evidence-capability.js";
import type { StreamCompleteness } from "../../src/wcl/retrieval-types.js";
import { exclusiveRange, inclusiveRange } from "../../src/engine/evidence/coverage.js";

const RANGE = inclusiveRange(0, 4000);

function stream(overrides: Partial<StreamCompleteness> & { streamId: string }): StreamCompleteness {
  return {
    state: "COMPLETE",
    reason: "COMPLETED_NORMALLY",
    requestedRange: RANGE,
    coveredRanges: [RANGE],
    pagesRequested: 1,
    pagesRetrieved: 1,
    eventsRetrieved: 0,
    ...overrides,
  };
}

const OBSERVABLE_CASTS: CapabilityRecord = {
  capability: "OBSERVABLE",
  retrievalSource: "EVENTS_ALL_STREAM",
  evidence: { kind: "SANITIZED_CAPTURE", fixtureId: "test-only", capturedOn: "2026-09-11" },
  logVersionObserved: null,
  gameVersionObserved: null,
};

function registryWith(overrides: Partial<Record<EvidenceCategory, CapabilityRecord>>) {
  return { ...EVIDENCE_CAPABILITY_REGISTRY, ...overrides };
}

const STREAM_IDS: Record<RetrievalSource, readonly string[]> = {
  EVENTS_ALL_STREAM: ["all"],
  TYPED_GRAPHQL_FIELD: ["context:typed"],
  TYPED_GRAPHQL_FIELD_PER_ACTOR: ["context:typed:actor"],
  REPORT_MASTER_DATA: ["context:masterData"],
};

function project(
  options: {
    registry?: Record<EvidenceCategory, CapabilityRecord>;
    streams?: readonly StreamCompleteness[];
    degraded?: ReadonlySet<EvidenceCategory>;
    untyped?: ReadonlySet<string>;
  } = {},
) {
  return projectCategoryEvidence({
    registry: options.registry ?? EVIDENCE_CAPABILITY_REGISTRY,
    streams: options.streams ?? [
      stream({ streamId: "all" }),
      stream({ streamId: "context:typed" }),
      stream({ streamId: "context:masterData" }),
    ],
    streamIdsBySource: STREAM_IDS,
    degradedCategories: options.degraded ?? new Set(),
    streamsWithUntypedDefects: options.untyped ?? new Set(),
    actorScope: null,
  });
}

describe("capability is separate from coverage", () => {
  it("gives an UNVERIFIED category no coverage at all", () => {
    const categories = project();
    const targetability = categories.TARGETABILITY;

    // This is the defect the revision fixed. A fully retrieved All stream with
    // zero targetability events must NOT read as "TARGETABILITY: COMPLETE",
    // because we have never established that Warcraft Logs emits targetability
    // evidence through that stream at all.
    expect(targetability.capability).toBe("UNVERIFIED");
    expect(targetability).not.toHaveProperty("coverage");
  });

  it("keeps a fully retrieved zero-event stream from implying observability", () => {
    const categories = project({
      streams: [
        stream({ streamId: "all", state: "COMPLETE", eventsRetrieved: 0 }),
        stream({ streamId: "context:typed" }),
        stream({ streamId: "context:masterData" }),
      ],
    });

    // A completely retrieved stream that contained nothing still cannot make an
    // unverified category observable. Capability comes from the committed
    // registry, never from what a fight happened to contain.
    expect(categories.TARGETABILITY.capability).toBe("UNVERIFIED");
    expect(categories.TARGETABILITY).not.toHaveProperty("coverage");
  });

  it("does not let a busy stream upgrade an unverified category either", () => {
    const busy = project({ streams: [stream({ streamId: "all", eventsRetrieved: 5010 })] });
    const quiet = project({ streams: [stream({ streamId: "all", eventsRetrieved: 0 })] });

    // Identical capability regardless of event volume: 5,010 events observed
    // across 21 types still included no targetability event, and that changes
    // nothing about whether one could exist.
    expect(busy.TARGETABILITY).toEqual(quiet.TARGETABILITY);
    expect(busy.DEATHS).toEqual(quiet.DEATHS);
  });

  it("reports coverage only once capability is OBSERVABLE", () => {
    const categories = project({ registry: registryWith({ CASTS: OBSERVABLE_CASTS }) });
    const casts = categories.CASTS;

    expect(casts.capability).toBe("OBSERVABLE");
    if (casts.capability === "OBSERVABLE") {
      expect(casts.coverage.state).toBe("COMPLETE");
      expect(casts.coverage.coveredRanges).toEqual([RANGE]);
    }
  });

  it("always includes every category, so none can silently go missing", () => {
    const categories = project();
    for (const category of EVIDENCE_CATEGORIES) {
      expect(categories[category]).toBeDefined();
    }
  });
});

describe("capability evidence is directional", () => {
  it("never lets a capture's silence establish NOT_OBSERVABLE", () => {
    // Failing to observe a category proves nothing: we may simply have captured
    // fights where it never occurred.
    const notObserved = capabilityFromCapture(
      false,
      "EVENTS_ALL_STREAM",
      { kind: "SANITIZED_CAPTURE", fixtureId: "probe-1", capturedOn: "2026-09-11" },
      "a capture containing a targetability event",
    );
    expect(notObserved.capability).toBe("UNVERIFIED");
    expect(notObserved.capability).not.toBe("NOT_OBSERVABLE");
  });

  it("lets a capture positively establish OBSERVABLE", () => {
    const observed = capabilityFromCapture(
      true,
      "EVENTS_ALL_STREAM",
      { kind: "SANITIZED_CAPTURE", fixtureId: "probe-1", capturedOn: "2026-09-11" },
      "unused",
    );
    expect(observed.capability).toBe("OBSERVABLE");
  });

  it("keeps TARGETABILITY UNVERIFIED in the committed registry", () => {
    const record = EVIDENCE_CAPABILITY_REGISTRY.TARGETABILITY;
    expect(record.capability).toBe("UNVERIFIED");
    if (record.capability === "UNVERIFIED") {
      expect(record.whatWouldVerify).toContain("never establishes NOT_OBSERVABLE");
    }
  });

  it("requires authoritative negative evidence for any NOT_OBSERVABLE entry", () => {
    for (const category of EVIDENCE_CATEGORIES) {
      const record = EVIDENCE_CAPABILITY_REGISTRY[category];
      if (record.capability === "NOT_OBSERVABLE") {
        expect(["SCHEMA_ENUM_EXHAUSTIVE", "DOCUMENTED_UNSUPPORTED"]).toContain(record.evidence.kind);
      }
    }
  });

  it("requires positive evidence for any OBSERVABLE entry", () => {
    for (const category of EVIDENCE_CATEGORIES) {
      const record = EVIDENCE_CAPABILITY_REGISTRY[category];
      if (record.capability === "OBSERVABLE") {
        expect(["SCHEMA_TYPED_FIELD", "SANITIZED_CAPTURE"]).toContain(record.evidence.kind);
      }
    }
  });

  it("marks typed-schema categories OBSERVABLE without needing a capture", () => {
    // A typed, non-JSON GraphQL field is part of the frozen schema, so its
    // existence is established without observing an instance of it.
    for (const category of ["ACTORS", "ABILITIES", "ENCOUNTER_PHASES", "TALENTS"] as const) {
      const record = EVIDENCE_CAPABILITY_REGISTRY[category];
      expect(record.capability).toBe("OBSERVABLE");
      if (record.capability === "OBSERVABLE") {
        expect(record.evidence.kind).toBe("SCHEMA_TYPED_FIELD");
      }
    }
  });
});

describe("coverage projection", () => {
  it("does not treat a category with no contributing stream as COMPLETE", () => {
    const categories = project({
      registry: registryWith({ CASTS: OBSERVABLE_CASTS }),
      streams: [stream({ streamId: "context:typed" })],
    });

    const casts = categories.CASTS;
    if (casts.capability === "OBSERVABLE") {
      expect(casts.coverage.state).toBe("ABSENT");
      expect(casts.coverage.reason).toBe("NOT_REQUESTED");
    }
  });

  it("degrades COMPLETE to PARTIAL when a known event was malformed", () => {
    const categories = project({
      registry: registryWith({ CASTS: OBSERVABLE_CASTS }),
      degraded: new Set<EvidenceCategory>(["CASTS"]),
    });

    const casts = categories.CASTS;
    if (casts.capability === "OBSERVABLE") {
      expect(casts.coverage.state).toBe("PARTIAL");
      expect(casts.coverage.reason).toBe("MALFORMED_EVENT_CONTENT");
    }
  });

  it("does NOT upgrade ABSENT to PARTIAL through degradation", () => {
    // Failing to decode something we never retrieved is not partial coverage.
    const categories = project({
      registry: registryWith({ CASTS: OBSERVABLE_CASTS }),
      streams: [stream({ streamId: "all", state: "ABSENT", coveredRanges: [], reason: "RATE_LIMITED" })],
      degraded: new Set<EvidenceCategory>(["CASTS"]),
    });

    const casts = categories.CASTS;
    if (casts.capability === "OBSERVABLE") {
      expect(casts.coverage.state).toBe("ABSENT");
      expect(casts.coverage.reason).toBe("RATE_LIMITED");
    }
  });

  it("degrades every category of a stream that produced an untyped defect", () => {
    const categories = project({
      registry: registryWith({ CASTS: OBSERVABLE_CASTS }),
      untyped: new Set(["all"]),
    });

    const casts = categories.CASTS;
    if (casts.capability === "OBSERVABLE") {
      expect(casts.coverage.state).toBe("PARTIAL");
    }
    // The typed context stream is unaffected: the defect was not in it.
    const phases = categories.ENCOUNTER_PHASES;
    if (phases.capability === "OBSERVABLE") {
      expect(phases.coverage.state).toBe("COMPLETE");
    }
  });

  it("keeps an unaffected stream usable when another stream fails", () => {
    const categories = project({
      registry: registryWith({ CASTS: OBSERVABLE_CASTS }),
      streams: [
        stream({ streamId: "all", state: "ABSENT", coveredRanges: [], reason: "UPSTREAM_UNAVAILABLE" }),
        stream({ streamId: "context:typed" }),
        stream({ streamId: "context:masterData" }),
      ],
    });

    const phases = categories.ENCOUNTER_PHASES;
    expect(phases.capability).toBe("OBSERVABLE");
    if (phases.capability === "OBSERVABLE") {
      expect(phases.coverage.state).toBe("COMPLETE");
    }
  });

  it("carries partial coverage ranges through to the category", () => {
    const partialRange = exclusiveRange(0, 2500);
    const categories = project({
      registry: registryWith({ CASTS: OBSERVABLE_CASTS }),
      streams: [
        stream({ streamId: "all", state: "PARTIAL", coveredRanges: [partialRange], reason: "RATE_LIMITED" }),
      ],
    });

    const casts = categories.CASTS;
    if (casts.capability === "OBSERVABLE") {
      expect(casts.coverage.state).toBe("PARTIAL");
      expect(casts.coverage.coveredRanges).toEqual([partialRange]);
      // PARTIAL always carries something; ABSENT always carries nothing.
      expect(casts.coverage.coveredRanges.length).toBeGreaterThan(0);
    }
  });
});
