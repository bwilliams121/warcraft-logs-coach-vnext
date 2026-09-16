/**
 * NORMALIZATION executors: the real normalizer under the real contracts, over
 * the artifact's raw events. Every claim is about `src/engine/normalization`.
 */

import type { ParamsOf } from "./params.js";
import { normalizeFightContext } from "../../../../src/engine/normalization/fight-context.js";
import { decodeFightContext } from "../../../../src/wcl/fight-context-query.js";
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

/** The real decoder and normalizer over a report context artifact, or a reason they refused. */
function normalizedContext(artifact: LoadedArtifact, fightId: number) {
  const decoded = decodeFightContext(artifact.json);
  if (!decoded.ok) return { ok: false as const, detail: "the fight-context decoder rejected the payload" };
  if (decoded.value.report === null) return { ok: false as const, detail: "the payload served no report" };
  const normalized = normalizeFightContext(decoded.value.report, fightId);
  if (!normalized.ok)
    return { ok: false as const, detail: `normalizeFightContext refused: ${normalized.reason}` };
  return { ok: true as const, normalized };
}

export function actorCatalog(
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.ACTOR_CATALOG">,
): AssertionOutcome {
  const context = normalizedContext(artifact, params.fightId);
  if (!context.ok) return fail(context.detail);
  const catalog = context.normalized.actors;
  const actors = [...catalog.actors.values()];
  const count = (type: string) => actors.filter((actor) => actor.actorType === type).length;
  const actual = {
    actors: actors.length,
    players: count("PLAYER"),
    pets: count("PET"),
    npcs: count("NPC"),
    unknown: count("UNKNOWN"),
    unusableEntries: catalog.unusableEntryCount,
    petOwnerLinks: params.expected.petOwnerLinks.map((link) => ({
      actorId: link.actorId,
      petOwnerActorId: catalog.actors.get(link.actorId)?.petOwnerActorId ?? null,
    })),
    holdsActorIds: params.expected.holdsActorIds.filter((id) => catalog.actors.has(id)),
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the actor catalog differs from what the case pins", { expected: params.expected, actual });
  }
  return pass();
}

export function fightHeader(
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.FIGHT_HEADER">,
): AssertionOutcome {
  const context = normalizedContext(artifact, params.fightId);
  if (!context.ok) return fail(context.detail);
  const { fight, phases, zone, abilities } = context.normalized;
  const actual = {
    encounterId: fight.encounterId,
    difficulty: fight.difficulty,
    kill: fight.kill,
    startTimeMs: fight.startTimeMs,
    endTimeMs: fight.endTimeMs,
    finality: fight.finality,
    friendlyPlayerCount: fight.friendlyPlayers.length,
    phases: phases.map((phase) => ({
      phaseId: phase.phaseId,
      isIntermission: phase.isIntermission,
      startTimeMs: phase.startTimeMs,
    })),
    outcome: {
      lastPhase: fight.outcome.lastPhase,
      lastPhaseAsAbsoluteIndex: fight.outcome.lastPhaseAsAbsoluteIndex,
      lastPhaseIsIntermission: fight.outcome.lastPhaseIsIntermission,
      bossPercentageRaw: fight.outcome.bossPercentageRaw,
      fightPercentageRaw: fight.outcome.fightPercentageRaw,
      wipeCalledReportTimeMs: fight.outcome.wipeCalledReportTimeMs,
    },
    zone: zone === null ? null : { id: zone.id, name: zone.name },
    abilities: abilities.abilities.size,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the fight header differs from what the case pins", { expected: params.expected, actual });
  }
  return pass();
}

// ---------------------------------------------------------------------------
// M10-B: factual reads of what a slice holds for one actor
// ---------------------------------------------------------------------------

/**
 * Reads a dotted path off a normalized event. `length` on an array reads its
 * length, so a case can pin "80 talent-tree entries" without copying them.
 * Anything absent reads as null — which is what a case comparing against a
 * pinned value then sees as a mismatch, never as a silent zero.
 */
function fieldAt(event: unknown, path: string): unknown {
  let cursor: unknown = event;
  for (const segment of path.split(".")) {
    if (Array.isArray(cursor) && segment === "length") return cursor.length;
    if (typeof cursor !== "object" || cursor === null) return null;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor ?? null;
}

function sortedCensus(counts: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => (left < right ? -1 : 1)));
}

/**
 * Exactly one normalized event matches the locator; it has the pinned kind and
 * each named top-level field carries the pinned value. The event is read as
 * captured — nothing is aggregated, interpolated or interpreted.
 */
export function eventFacts(
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.EVENT_FACTS">,
): AssertionOutcome {
  const output = normalizeArtifact(artifact);
  const { at } = params;
  const matches = output.events.filter(
    (event) =>
      event.reportTimeMs === at.reportTimeMs &&
      event.locator.rawType === at.rawType &&
      (event.source?.actorId ?? null) === at.sourceActorId &&
      (event.target?.actorId ?? null) === at.targetActorId &&
      event.abilityGameId === at.abilityGameId,
  );
  const event = matches[0];
  if (matches.length !== 1 || event === undefined) {
    return fail(`expected exactly one normalized event at the locator; found ${String(matches.length)}`, {
      expected: { matches: 1 },
      actual: { matches: matches.length },
      locator: at,
    });
  }
  if (event.kind !== params.expected.kind) {
    return fail("the normalized event has a different kind than the case pins", {
      expected: { kind: params.expected.kind },
      actual: { kind: event.kind },
      locator: event.locator,
    });
  }
  const actual: Record<string, unknown> = {};
  for (const field of Object.keys(params.expected.fields)) actual[field] = fieldAt(event, field);
  if (JSON.stringify(actual) !== JSON.stringify(params.expected.fields)) {
    return fail("the normalized event's fields differ from what the case pins", {
      expected: params.expected.fields,
      actual,
      locator: event.locator,
    });
  }
  return pass();
}

/**
 * The normalized events whose named side is the actor, counted by kind —
 * exactly and exhaustively. A census of what the slice RETAINED, never a
 * claim about what happened in the fight.
 */
export function actorEventCensus(
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.ACTOR_EVENT_CENSUS">,
): AssertionOutcome {
  const output = normalizeArtifact(artifact);
  const counts = new Map<string, number>();
  for (const event of output.events) {
    const side = params.side === "SOURCE" ? event.source : event.target;
    if (side?.actorId !== params.actorId) continue;
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  }
  const actual = sortedCensus(counts);
  const expected = sortedCensus(new Map(Object.entries(params.expected)));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail(
      `the ${params.side} census for actor ${String(params.actorId)} differs from what the case pins`,
      {
        expected,
        actual,
      },
    );
  }
  return pass();
}
