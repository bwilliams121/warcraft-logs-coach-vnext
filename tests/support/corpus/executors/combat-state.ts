/**
 * COMBAT_STATE executors: the real M4 state over a fight granted exactly the
 * coverage its artifact retains. Every claim is about `src/engine/state`,
 * `src/engine/auras` or `src/engine/resources`.
 */

import { anySource, fromSource } from "../../../../src/engine/auras/aura-state.js";
import { sourceRef, targetRef } from "../../../../src/engine/normalization/normalized-events.js";
import type { CombatState } from "../../../../src/engine/state/combat-state.js";
import type { StateResult } from "../../../../src/engine/state/state-result.js";
import { beforeEvent, endOfTimestamp, type TemporalPosition } from "../../../../src/engine/state/temporal.js";
import { positionOfCast, stateOf } from "../fight.js";
import type { LoadedArtifact, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

type Locator = ParamsOf<"COMBAT_STATE.LAST_OBSERVED_CAST_AT">["at"];

/** Resolves a fact locator to a temporal position, or explains why it cannot. */
function positionAt(
  state: CombatState,
  at: Locator,
):
  | { readonly ok: true; readonly position: TemporalPosition }
  | { readonly ok: false; readonly detail: string } {
  if (at.kind === "END_OF_TIMESTAMP") return { ok: true, position: endOfTimestamp(at.reportTimeMs) };
  const found = positionOfCast(state, at.cast);
  return found.ok ? { ok: true, position: beforeEvent(found.position) } : found;
}

/** The compact semantic shape of any state result, for expected/actual reporting. */
function summarize<T>(result: StateResult<T>, value: (found: T) => unknown): unknown {
  switch (result.certainty) {
    case "EXACT":
      return { certainty: "EXACT", value: value(result.value) };
    case "STALE":
      return {
        certainty: "STALE",
        value: value(result.value),
        observedAtReportTimeMs: result.observedAtReportTimeMs,
      };
    case "BOUNDED":
      return { certainty: "BOUNDED" };
    case "UNKNOWN":
      return { certainty: "UNKNOWN", reason: result.reason };
  }
}

export function lastObservedCastUnknown(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN">,
): AssertionOutcome {
  const state = stateOf(corpus, artifact);
  const result = state.lastObservedCast({
    actorId: params.actorId,
    abilityGameId: params.abilityGameId,
    castPhase: "COMPLETE",
    // The end of the artifact's window: the widest interval an absence claim
    // over it could range across.
    before: endOfTimestamp(state.fight.fight.endTimeMs),
  });
  const actual = summarize(result, (cast) =>
    cast === null ? "PROVEN_ABSENCE" : { reportTimeMs: cast.reportTimeMs },
  );
  if (result.certainty !== "UNKNOWN" || result.reason !== params.reason) {
    return fail("the state layer did not answer UNKNOWN for the pinned reason", {
      expected: { certainty: "UNKNOWN", reason: params.reason },
      actual,
    });
  }
  return pass();
}

export function lastObservedCastProvenAbsent(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"COMBAT_STATE.LAST_OBSERVED_CAST_PROVEN_ABSENT">,
): AssertionOutcome {
  const state = stateOf(corpus, artifact);
  const at = positionAt(state, params.at);
  if (!at.ok) return fail(at.detail);
  const result = state.lastObservedCast({
    actorId: params.actorId,
    abilityGameId: params.abilityGameId,
    castPhase: "COMPLETE",
    before: at.position,
  });
  const actual = summarize(result, (cast) =>
    cast === null ? "PROVEN_ABSENCE" : { reportTimeMs: cast.reportTimeMs },
  );
  if (result.certainty !== "EXACT" || result.value !== null) {
    return fail("the state layer did not prove the absence the case pins", {
      expected: { certainty: "EXACT", value: "PROVEN_ABSENCE" },
      actual,
    });
  }
  return pass();
}

export function lastObservedCastAt(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"COMBAT_STATE.LAST_OBSERVED_CAST_AT">,
): AssertionOutcome {
  const state = stateOf(corpus, artifact);
  const at = positionAt(state, params.at);
  if (!at.ok) return fail(at.detail);
  const result = state.lastObservedCast({
    actorId: params.actorId,
    abilityGameId: params.abilityGameId,
    castPhase: "COMPLETE",
    before: at.position,
  });
  const actual = summarize(result, (cast) =>
    cast === null ? "PROVEN_ABSENCE" : { reportTimeMs: cast.reportTimeMs },
  );
  if (
    result.certainty !== "EXACT" ||
    result.value === null ||
    result.value.reportTimeMs !== params.expectedReportTimeMs
  ) {
    return fail("the last observed cast is not the one the case pins", {
      expected: { certainty: "EXACT", value: { reportTimeMs: params.expectedReportTimeMs } },
      actual,
      locator: result.certainty === "EXACT" && result.value !== null ? result.value.locator : undefined,
    });
  }
  return pass();
}

export function resourceObservationOnCast(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST">,
): AssertionOutcome {
  const state = stateOf(corpus, artifact);
  const found = positionOfCast(state, params);
  if (!found.ok) return fail(found.detail);
  const result = state.resources.observationOnEvent(found.position, params.actorId, params.resourceWireType);
  const project = (value: {
    observedAmount: number;
    observedMax: number | null;
    observedCost: number | null;
    timing: string;
  }) => ({
    observedAmount: value.observedAmount,
    observedMax: value.observedMax,
    observedCost: value.observedCost,
    timing: value.timing,
  });
  const actual = summarize(result, project);
  const { expected } = params;
  const matches =
    expected.certainty === "UNKNOWN"
      ? result.certainty === "UNKNOWN" && result.reason === expected.reason
      : result.certainty === "EXACT" &&
        JSON.stringify(project(result.value)) ===
          JSON.stringify({
            observedAmount: expected.observedAmount,
            observedMax: expected.observedMax,
            observedCost: expected.observedCost,
            timing: expected.timing,
          });
  if (!matches) {
    return fail("the attached resource observation is not what the case pins", {
      expected,
      actual,
      locator: result.certainty === "EXACT" ? result.value.locator : { position: found.position },
    });
  }
  return pass();
}

export function latestResourceObservation(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"COMBAT_STATE.LATEST_RESOURCE_OBSERVATION">,
): AssertionOutcome {
  const state = stateOf(corpus, artifact);
  const at = positionAt(state, params.at);
  if (!at.ok) return fail(at.detail);
  const result = state.resources.latestObservedAtOrBefore({
    actorId: params.actorId,
    resourceType: params.resourceWireType,
    at: at.position,
  });
  const actual = summarize(result, (value) => ({
    observedAmount: value.observedAmount,
    reportTimeMs: value.reportTimeMs,
  }));
  const matches =
    (result.certainty === "EXACT" || result.certainty === "STALE") &&
    result.certainty === params.expected.certainty &&
    result.value.observedAmount === params.expected.observedAmount &&
    result.value.reportTimeMs === params.expected.observedAtReportTimeMs;
  if (!matches) {
    return fail("the latest resource observation is not what the case pins", {
      expected: params.expected,
      actual,
      locator:
        result.certainty === "EXACT" || result.certainty === "STALE" ? result.value.locator : undefined,
    });
  }
  return pass();
}

function auraQuery(params: { readonly aura: ParamsOf<"COMBAT_STATE.AURA_PRESENCE">["aura"] }) {
  const { aura } = params;
  return {
    target: targetRef(aura.targetActorId, null),
    abilityGameId: aura.abilityGameId,
    auraClass: aura.auraClass,
    source: aura.sourceActorId === null ? anySource() : fromSource(sourceRef(aura.sourceActorId, null)),
  };
}

export function auraPresence(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"COMBAT_STATE.AURA_PRESENCE">,
): AssertionOutcome {
  const state = stateOf(corpus, artifact);
  const at = positionAt(state, params.at);
  if (!at.ok) return fail(at.detail);
  const result = state.auras.presenceAt({ ...auraQuery(params), at: at.position });
  const actual = summarize(result, (value) => ({
    presence: value.presence,
    anchorReportTimeMs: value.anchor.reportTimeMs,
  }));
  const matches =
    params.expected.certainty === "UNKNOWN"
      ? result.certainty === "UNKNOWN" && result.reason === params.expected.reason
      : result.certainty === "EXACT" &&
        result.value.presence === params.expected.presence &&
        result.value.anchor.reportTimeMs === params.expected.anchorReportTimeMs;
  if (!matches) {
    return fail("aura presence is not what the case pins", {
      expected: params.expected,
      actual,
      locator: result.certainty === "EXACT" ? result.value.anchor.locator : undefined,
    });
  }
  return pass();
}

export function auraStackObservation(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"COMBAT_STATE.AURA_STACK_OBSERVATION">,
): AssertionOutcome {
  const state = stateOf(corpus, artifact);
  const at = positionAt(state, params.at);
  if (!at.ok) return fail(at.detail);
  const result = state.auras.latestStackObservation({ ...auraQuery(params), at: at.position });
  const project = (value: { observedStacks: number | null; position: number }) => {
    const event = state.eventAt(value.position);
    return {
      rawType: event?.rawType ?? null,
      observedStacks: value.observedStacks,
      reportTimeMs: event?.reportTimeMs ?? null,
    };
  };
  const actual = summarize(result, project);
  const matches =
    result.certainty === "EXACT" && JSON.stringify(project(result.value)) === JSON.stringify(params.expected);
  if (!matches) {
    return fail("the latest stack observation is not what the case pins", {
      expected: { certainty: "EXACT", value: params.expected },
      actual,
      locator: result.certainty === "EXACT" ? result.value.locator : undefined,
    });
  }
  return pass();
}
