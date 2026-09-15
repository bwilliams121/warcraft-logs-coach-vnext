/**
 * Executors for the EXECUTABLE assertion kinds.
 *
 * One function per kind, each driving the REAL production path for its layer —
 * the real normalizer under the real contracts, the real combat state, the
 * real event-page decoder — over the artifact's bytes. No executor reimplements
 * the layer it tests, and no executor may consult a case's prose.
 *
 * WHAT THE HARNESS GRANTS A FIGHT, AND WHY IT IS STINGY
 *
 * A case that runs the state layer needs a `CombatFight`, and a fight carries
 * completeness. Completeness is where a fixture could quietly lie: declare
 * COMPLETE coverage over a four-event slice and every absence claim comes out
 * "proven". So coverage is granted from the artifact's `retainedCoverage`
 * ranges and from NOTHING else, capability is granted only to categories a
 * capture can vouch for, and a SYNTHETIC artifact is granted no capability at
 * all. A slice that retains no range can prove no absence — which is the
 * property one of the seed cases exists to pin.
 *
 * This is the M9-A minimum. The layer-specific regression harness that runs a
 * populated corpus is M9-B's; these executors are what proves the contract can
 * carry executable claims, on the smallest surface that demonstrates it.
 */

import { classifyCoverage, inclusiveRange, type TimeRangeMs } from "../../../src/engine/evidence/coverage.js";
import type { CategoryEvidence } from "../../../src/engine/normalization/completeness.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import {
  createNormalizer,
  type NormalizationOutput,
} from "../../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../../src/engine/normalization/supported-families.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import { endOfTimestamp } from "../../../src/engine/state/temporal.js";
import { decodeEventPage } from "../../../src/wcl/events-query.js";
import type { CapabilityRecord, EvidenceCategory } from "../../../src/wcl/evidence-capability.js";
import { syntheticFight } from "../synthetic-fight.js";
import { ASSERTION_KINDS, type AssertionKind } from "./contract.js";
import type { LoadedArtifact, LoadedAssertion, LoadedCase, LoadedCorpus } from "./loader.js";

export type AssertionOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly detail: string }
  /** The kind is registered but has no executor. Reported, never counted. */
  | { readonly ok: "DECLARED" };

/**
 * Categories a Warcraft Logs `All`-stream capture can vouch for. Read from the
 * committed capability evidence: these are the ones `PROVENANCE.md` records as
 * OBSERVABLE from sanitized captures. Everything else stays UNVERIFIED even for
 * a real capture, because a capture cannot vouch for a category it never held.
 */
const CAPTURE_VOUCHED_CATEGORIES: readonly EvidenceCategory[] = [
  "CASTS",
  "AURAS",
  "RESOURCES",
  "ABSORBS",
  "DAMAGE",
  "HEALING",
  "SUMMONS",
  "COMBATANT_INFO",
  "GEAR",
];

// --------------------------------------------------------------------------
// Artifact → fight
// --------------------------------------------------------------------------

/** The nearest capture source up the lineage chain, or `null` for SYNTHETIC. */
export function captureSourceOf(corpus: LoadedCorpus, artifact: LoadedArtifact) {
  let cursor: LoadedArtifact | undefined = artifact;
  while (cursor !== undefined) {
    if (cursor.record.provenance.source !== null) return cursor.record.provenance.source;
    const parentId: string | null = cursor.record.provenance.parentArtifactId;
    cursor =
      parentId === null ? undefined : corpus.artifacts.find((entry) => entry.record.artifactId === parentId);
  }
  return null;
}

function rawEventsOf(artifact: LoadedArtifact): readonly Record<string, unknown>[] {
  if (!Array.isArray(artifact.json)) {
    throw new Error(`artifact ${artifact.record.artifactId} is not an event array`);
  }
  return artifact.json as readonly Record<string, unknown>[];
}

/**
 * The window the normalizer is told it is looking at.
 *
 * From the source query when it was recorded; otherwise the artifact's own
 * timestamp extent, which is the honest maximum for a synthetic payload. A
 * synthetic window is never wider than its events.
 */
function windowOf(corpus: LoadedCorpus, artifact: LoadedArtifact): TimeRangeMs {
  const source = captureSourceOf(corpus, artifact);
  if (
    source !== null &&
    typeof source.query.startTimeMs === "number" &&
    typeof source.query.endTimeMs === "number"
  ) {
    return inclusiveRange(source.query.startTimeMs, source.query.endTimeMs);
  }
  const timestamps = rawEventsOf(artifact)
    .map((event) => event["timestamp"])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (timestamps.length === 0) return inclusiveRange(0, 0);
  return inclusiveRange(Math.min(...timestamps), Math.max(...timestamps));
}

export function normalizeArtifact(corpus: LoadedCorpus, artifact: LoadedArtifact): NormalizationOutput {
  const window = windowOf(corpus, artifact);
  const normalizer = createNormalizer({
    fightStartTimeMs: window.fromReportTimeMs,
    requestedRange: window,
    contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: window.fromReportTimeMs,
    nextPageTimestamp: null,
    events: rawEventsOf(artifact),
  });
  return normalizer.finish();
}

function capabilityFor(
  artifact: LoadedArtifact,
  source: NonNullable<ReturnType<typeof captureSourceOf>>,
): CapabilityRecord {
  return {
    capability: "OBSERVABLE",
    retrievalSource: "EVENTS_ALL_STREAM",
    evidence: {
      kind: "SANITIZED_CAPTURE",
      fixtureId: artifact.record.artifactId,
      capturedOn:
        typeof source.capturedOn === "string" && /^\d{4}/.test(source.capturedOn)
          ? source.capturedOn
          : "UNAVAILABLE",
    },
    logVersionObserved: typeof source.logVersion === "number" ? source.logVersion : null,
    gameVersionObserved: typeof source.gameVersion === "number" ? source.gameVersion : null,
  };
}

/** A fight over the artifact, granted exactly the coverage the artifact retains. */
export function fightOf(corpus: LoadedCorpus, artifact: LoadedArtifact): CombatFight {
  const window = windowOf(corpus, artifact);
  const normalized = normalizeArtifact(corpus, artifact);
  const source = captureSourceOf(corpus, artifact);

  const categories: Partial<Record<EvidenceCategory, CategoryEvidence>> = {};
  if (source !== null) {
    const ranges = artifact.record.provenance.retainedCoverage.ranges.map((range) =>
      inclusiveRange(range.fromReportTimeMs, range.toReportTimeMs),
    );
    const capability = capabilityFor(artifact, source);
    for (const category of CAPTURE_VOUCHED_CATEGORIES) {
      categories[category] = {
        capability: "OBSERVABLE",
        source: capability,
        coverage: {
          state: classifyCoverage(ranges, window),
          reason: "COMPLETED_NORMALLY",
          coveredRanges: ranges,
          sourceStreamIds: ["all"],
          actorScope: null,
        },
      };
    }
  }

  return syntheticFight({
    events: normalized.events,
    malformedObservations: normalized.malformedObservations,
    startTimeMs: window.fromReportTimeMs,
    endTimeMs: window.toReportTimeMs,
    categories,
  });
}

// --------------------------------------------------------------------------
// Executors
// --------------------------------------------------------------------------

type ParamsOf<K extends AssertionKind> = (typeof ASSERTION_KINDS)[K]["params"]["_output"];

function pass(): AssertionOutcome {
  return { ok: true };
}
function fail(detail: string): AssertionOutcome {
  return { ok: false, detail };
}

function eventCountPreserved(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.EVENT_COUNT_PRESERVED">,
): AssertionOutcome {
  const raw = rawEventsOf(artifact);
  if (raw.length !== params.expectedEventCount) {
    return fail(
      `artifact holds ${String(raw.length)} raw events, expected ${String(params.expectedEventCount)}`,
    );
  }
  const output = normalizeArtifact(corpus, artifact);
  if (output.events.length !== raw.length) {
    return fail(`normalized ${String(output.events.length)} events from ${String(raw.length)} raw events`);
  }
  if (output.malformedObservations.length !== 0 || output.malformedEnvelopeCount !== 0) {
    return fail(
      `${String(output.malformedObservations.length)} malformed observations, ${String(output.malformedEnvelopeCount)} malformed envelopes`,
    );
  }
  return pass();
}

function sourceAbsence(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.SOURCE_ABSENCE">,
): AssertionOutcome {
  const output = normalizeArtifact(corpus, artifact);
  const selected =
    params.selector.kind === "EVERY_EVENT"
      ? output.events.map((event, index) => ({ event, index }))
      : [{ event: output.events[params.selector.index], index: params.selector.index }];
  if (selected.length === 0) return fail("the artifact normalized to zero events");
  for (const { event, index } of selected) {
    if (event === undefined) return fail(`no normalized event at raw index ${String(index)}`);
    if (event.source !== null)
      return fail(`event ${String(index)} has a source actor ${JSON.stringify(event.source)}`);
    if (event.sourceAbsence !== params.absence) {
      return fail(
        `event ${String(index)} sourceAbsence is ${String(event.sourceAbsence)}, expected ${params.absence}`,
      );
    }
  }
  return pass();
}

function noActorRefHolds(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.NO_ACTOR_REF_HOLDS">,
): AssertionOutcome {
  const output = normalizeArtifact(corpus, artifact);
  const serialized = JSON.stringify(output.events);
  const needle = `"actorId":${String(params.actorId)}`;
  if (serialized.includes(needle))
    return fail(`a normalized ActorRef holds actorId ${String(params.actorId)}`);
  return pass();
}

function unsupportedTypeCounted(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.UNSUPPORTED_TYPE_COUNTED">,
): AssertionOutcome {
  const output = normalizeArtifact(corpus, artifact);
  const counted = output.unsupportedTypeCounts.get(params.rawType) ?? 0;
  if (counted !== params.count) {
    return fail(
      `unsupported type ${params.rawType} counted ${String(counted)} times, expected ${String(params.count)}`,
    );
  }
  const preserved = output.events.filter(
    (event) => event.kind === "UNSUPPORTED_TYPE" && event.rawType === params.rawType,
  );
  if (preserved.length !== params.count) {
    return fail(
      `${String(preserved.length)} UNSUPPORTED_TYPE events preserved for ${params.rawType}, expected ${String(params.count)}`,
    );
  }
  return pass();
}

function lastObservedCastUnknown(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN">,
): AssertionOutcome {
  const state = createCombatState(fightOf(corpus, artifact));
  const result = state.lastObservedCast({
    actorId: params.actorId,
    abilityGameId: params.abilityGameId,
    castPhase: "COMPLETE",
    // The end of the artifact's window: the widest interval an absence claim
    // over it could range across.
    before: endOfTimestamp(state.fight.fight.endTimeMs),
  });
  if (result.certainty !== "UNKNOWN") {
    return fail(
      `expected UNKNOWN, got ${result.certainty}${result.certainty === "EXACT" ? ` (value ${result.value === null ? "null — a proven absence" : "an observation"})` : ""}`,
    );
  }
  if (result.reason !== params.reason) return fail(`UNKNOWN for ${result.reason}, expected ${params.reason}`);
  return pass();
}

function resourceObservationOnCast(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST">,
): AssertionOutcome {
  const state = createCombatState(fightOf(corpus, artifact));
  const positions: number[] = [];
  state.fight.events.forEach((event, position) => {
    if (event.kind !== "CAST" || event.castPhase !== "COMPLETE") return;
    if (event.source?.actorId !== params.actorId) return;
    if (event.abilityGameId !== params.abilityGameId || event.reportTimeMs !== params.reportTimeMs) return;
    positions.push(position);
  });
  const position = positions[0];
  if (positions.length !== 1 || position === undefined) {
    return fail(
      `expected exactly one COMPLETE cast of ${String(params.abilityGameId)} by ${String(params.actorId)} at ${String(params.reportTimeMs)}; found ${String(positions.length)}`,
    );
  }
  const result = state.resources.observationOnEvent(position, params.actorId, params.resourceWireType);
  if (result.certainty !== "EXACT") {
    return fail(
      `observation is ${result.certainty}${result.certainty === "UNKNOWN" ? ` (${result.reason})` : ""}, expected EXACT`,
    );
  }
  const { expected } = params;
  const actual = {
    observedAmount: result.value.observedAmount,
    observedMax: result.value.observedMax,
    observedCost: result.value.observedCost,
    timing: result.value.timing,
  };
  for (const key of ["observedAmount", "observedMax", "observedCost", "timing"] as const) {
    if (actual[key] !== expected[key]) {
      return fail(`${key} is ${String(actual[key])}, expected ${String(expected[key])}`);
    }
  }
  return pass();
}

function eventPageOutcome(
  artifact: LoadedArtifact,
  params: ParamsOf<"WCL_DECODE.EVENT_PAGE_OUTCOME">,
): AssertionOutcome {
  const decoded = decodeEventPage(artifact.json);
  const actual = decoded.ok ? decoded.value.kind : "DECODE_FAILED";
  if (actual !== params.expected) return fail(`decoder produced ${actual}, expected ${params.expected}`);
  return pass();
}

/**
 * Runs one assertion. Payload-kind compatibility and parameter validity were
 * established by the loader, so a mismatch here is a programming error and
 * throws rather than failing softly.
 */
export function executeAssertion(
  corpus: LoadedCorpus,
  kase: LoadedCase,
  assertion: LoadedAssertion,
): AssertionOutcome {
  const { artifact } = kase;
  switch (assertion.kind) {
    case "NORMALIZATION.EVENT_COUNT_PRESERVED":
      return eventCountPreserved(corpus, artifact, assertion.params as ParamsOf<typeof assertion.kind>);
    case "NORMALIZATION.SOURCE_ABSENCE":
      return sourceAbsence(corpus, artifact, assertion.params as ParamsOf<typeof assertion.kind>);
    case "NORMALIZATION.NO_ACTOR_REF_HOLDS":
      return noActorRefHolds(corpus, artifact, assertion.params as ParamsOf<typeof assertion.kind>);
    case "NORMALIZATION.UNSUPPORTED_TYPE_COUNTED":
      return unsupportedTypeCounted(corpus, artifact, assertion.params as ParamsOf<typeof assertion.kind>);
    case "COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN":
      return lastObservedCastUnknown(corpus, artifact, assertion.params as ParamsOf<typeof assertion.kind>);
    case "COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST":
      return resourceObservationOnCast(corpus, artifact, assertion.params as ParamsOf<typeof assertion.kind>);
    case "WCL_DECODE.EVENT_PAGE_OUTCOME":
      return eventPageOutcome(artifact, assertion.params as ParamsOf<typeof assertion.kind>);
    case "PUBLIC_CONTRACT.REST_MCP_PARITY":
    case "SPEC_ASSASSINATION.DECISION_COVERAGE":
      return { ok: "DECLARED" };
  }
}

/** The kinds this file can execute. Checked against the registry by a contract test. */
export const EXECUTABLE_KINDS: readonly AssertionKind[] = [
  "NORMALIZATION.EVENT_COUNT_PRESERVED",
  "NORMALIZATION.SOURCE_ABSENCE",
  "NORMALIZATION.NO_ACTOR_REF_HOLDS",
  "NORMALIZATION.UNSUPPORTED_TYPE_COUNTED",
  "COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN",
  "COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST",
  "WCL_DECODE.EVENT_PAGE_OUTCOME",
];
