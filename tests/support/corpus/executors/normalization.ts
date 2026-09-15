/**
 * NORMALIZATION executors: the real normalizer under the real contracts, over
 * the artifact's raw events. Every claim is about `src/engine/normalization`.
 */

import type { ParamsOf } from "./params.js";
import { normalizeArtifact, rawEventsOf } from "../fight.js";
import type { LoadedArtifact } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";

export function eventCountPreserved(
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.EVENT_COUNT_PRESERVED">,
): AssertionOutcome {
  const raw = rawEventsOf(artifact);
  if (raw.length !== params.expectedEventCount) {
    return fail(`artifact holds ${String(raw.length)} raw events`, {
      expected: { rawEventCount: params.expectedEventCount },
      actual: { rawEventCount: raw.length },
    });
  }
  const output = normalizeArtifact(artifact);
  const actual = {
    normalizedEventCount: output.events.length,
    malformedObservations: output.malformedObservations.length,
    malformedEnvelopes: output.malformedEnvelopeCount,
  };
  if (
    actual.normalizedEventCount !== raw.length ||
    actual.malformedObservations !== 0 ||
    actual.malformedEnvelopes !== 0
  ) {
    return fail("normalization did not preserve every raw event cleanly", {
      expected: { normalizedEventCount: raw.length, malformedObservations: 0, malformedEnvelopes: 0 },
      actual,
    });
  }
  return pass();
}

export function inputOrderPreserved(artifact: LoadedArtifact): AssertionOutcome {
  const raw = rawEventsOf(artifact);
  const output = normalizeArtifact(artifact);
  if (output.events.length !== raw.length) {
    return fail("cannot compare order when counts differ", {
      expected: { normalizedEventCount: raw.length },
      actual: { normalizedEventCount: output.events.length },
    });
  }
  for (let index = 0; index < raw.length; index += 1) {
    const rawTimestamp = raw[index]?.["timestamp"];
    const event = output.events[index];
    if (event === undefined) return fail(`no normalized event at ${String(index)}`);
    if (event.reportTimeMs !== rawTimestamp) {
      return fail(
        `position ${String(index)} carries a different timestamp than the raw event at that index`,
        {
          expected: { reportTimeMs: rawTimestamp },
          actual: { reportTimeMs: event.reportTimeMs },
          locator: { rawIndex: index },
        },
      );
    }
    const previous = output.events[index - 1];
    if (previous !== undefined && event.ingestionOrdinal <= previous.ingestionOrdinal) {
      return fail(`ingestion ordinal is not ascending at position ${String(index)}`, {
        expected: { greaterThan: previous.ingestionOrdinal },
        actual: { ingestionOrdinal: event.ingestionOrdinal },
        locator: { rawIndex: index },
      });
    }
  }
  return pass();
}

export function timestampRunRetained(
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.TIMESTAMP_RUN_RETAINED">,
): AssertionOutcome {
  const output = normalizeArtifact(artifact);
  const count = output.events.filter((event) => event.reportTimeMs === params.reportTimeMs).length;
  if (count !== params.count) {
    return fail(`${String(count)} normalized events share timestamp ${String(params.reportTimeMs)}`, {
      expected: { count: params.count },
      actual: { count },
      locator: { reportTimeMs: params.reportTimeMs },
    });
  }
  return pass();
}

export function allTypesRecognised(artifact: LoadedArtifact): AssertionOutcome {
  const output = normalizeArtifact(artifact);
  const actual = {
    unsupportedTypes: [...output.unsupportedTypeCounts.keys()].sort(),
    malformedFamilyTypes: [...output.malformedFamilyCountsByType.keys()].sort(),
    malformedObservations: output.malformedObservations.length,
    malformedEnvelopes: output.malformedEnvelopeCount,
    degradedCategories: [...output.degradedCategories].sort(),
  };
  const clean =
    actual.unsupportedTypes.length === 0 &&
    actual.malformedFamilyTypes.length === 0 &&
    actual.malformedObservations === 0 &&
    actual.malformedEnvelopes === 0 &&
    actual.degradedCategories.length === 0;
  if (!clean) {
    return fail("the artifact carries a raw type or shape the contracts do not fully recognise", {
      expected: {
        unsupportedTypes: [],
        malformedFamilyTypes: [],
        malformedObservations: 0,
        malformedEnvelopes: 0,
        degradedCategories: [],
      },
      actual,
    });
  }
  return pass();
}

export function sourceAbsence(
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.SOURCE_ABSENCE">,
): AssertionOutcome {
  const output = normalizeArtifact(artifact);
  const selected =
    params.selector.kind === "EVERY_EVENT"
      ? output.events.map((event, index) => ({ event, index }))
      : [{ event: output.events[params.selector.index], index: params.selector.index }];
  if (selected.length === 0) return fail("the artifact normalized to zero events");
  for (const { event, index } of selected) {
    if (event === undefined)
      return fail(`no normalized event at raw index ${String(index)}`, { locator: { rawIndex: index } });
    if (event.source !== null || event.sourceAbsence !== params.absence) {
      return fail(`event ${String(index)} does not carry the expected source absence`, {
        expected: { source: null, sourceAbsence: params.absence },
        actual: { source: event.source, sourceAbsence: event.sourceAbsence },
        locator: { rawIndex: index, evidence: event.locator },
      });
    }
  }
  return pass();
}

export function sideReference(
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.SIDE_REFERENCE">,
): AssertionOutcome {
  const output = normalizeArtifact(artifact);
  const event = output.events[params.index];
  if (event === undefined)
    return fail(`no normalized event at raw index ${String(params.index)}`, {
      locator: { rawIndex: params.index },
    });
  const reference = params.side === "SOURCE" ? event.source : event.target;
  const absence = params.side === "SOURCE" ? event.sourceAbsence : event.targetAbsence;
  const actual = { reference, absence };
  const expected =
    params.expected.kind === "ACTOR"
      ? {
          reference: { actorId: params.expected.actorId, instanceId: params.expected.instanceId },
          absence: null,
        }
      : { reference: null, absence: params.expected.absence };
  const matches =
    JSON.stringify(actual.reference) === JSON.stringify(expected.reference) &&
    actual.absence === expected.absence;
  if (!matches) {
    return fail(`the ${params.side} side of event ${String(params.index)} is not what the case pins`, {
      expected,
      actual,
      locator: { rawIndex: params.index, evidence: event.locator },
    });
  }
  return pass();
}

export function attachedResourceSide(
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.ATTACHED_RESOURCE_SIDE">,
): AssertionOutcome {
  const output = normalizeArtifact(artifact);
  const event = output.events[params.index];
  if (event === undefined)
    return fail(`no normalized event at raw index ${String(params.index)}`, {
      locator: { rawIndex: params.index },
    });
  const attached = event.attachedResources;
  const actualSide = attached === null ? "NONE" : attached.side;
  const sideActor = attached === null ? null : attached.actor;
  const expectedActor =
    params.expectedSide === "SOURCE" ? event.source : params.expectedSide === "TARGET" ? event.target : null;
  const actorMatches =
    params.expectedSide === "NONE" || JSON.stringify(sideActor) === JSON.stringify(expectedActor);
  if (actualSide !== params.expectedSide || !actorMatches) {
    return fail(
      `the attached resource snapshot on event ${String(params.index)} is not bound to the expected side`,
      {
        expected: { side: params.expectedSide, actor: expectedActor },
        actual: { side: actualSide, actor: sideActor },
        locator: { rawIndex: params.index, evidence: event.locator },
      },
    );
  }
  return pass();
}

export function noActorRefHolds(
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.NO_ACTOR_REF_HOLDS">,
): AssertionOutcome {
  const output = normalizeArtifact(artifact);
  const needle = `"actorId":${String(params.actorId)}`;
  const offending = output.events.findIndex((event) => JSON.stringify(event).includes(needle));
  if (offending >= 0) {
    return fail(`a normalized ActorRef holds actorId ${String(params.actorId)}`, {
      expected: { actorRefHolding: null },
      actual: { actorRefHolding: params.actorId },
      locator: { rawIndex: offending },
    });
  }
  return pass();
}

export function unsupportedTypeCounted(
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.UNSUPPORTED_TYPE_COUNTED">,
): AssertionOutcome {
  const output = normalizeArtifact(artifact);
  const counted = output.unsupportedTypeCounts.get(params.rawType) ?? 0;
  const preserved = output.events.filter(
    (event) => event.kind === "UNSUPPORTED_TYPE" && event.rawType === params.rawType,
  ).length;
  if (counted !== params.count || preserved !== params.count) {
    return fail(`unsupported type ${params.rawType} was not counted and preserved exactly`, {
      expected: { counted: params.count, preserved: params.count },
      actual: { counted, preserved },
    });
  }
  return pass();
}
