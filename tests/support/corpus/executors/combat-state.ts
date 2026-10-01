/**
 * COMBAT_STATE executors: the real M4 state over a fight granted exactly the
 * coverage its artifact retains. Every claim is about `src/engine/state`,
 * `src/engine/auras` or `src/engine/resources`.
 */

import { anySource, fromSource } from "../../../../src/engine/auras/aura-state.js";
import { sourceRef, targetRef } from "../../../../src/engine/normalization/normalized-events.js";
import type { CombatState } from "../../../../src/engine/state/combat-state.js";
import type { ResourceAmountObservation } from "../../../../src/engine/resources/resource-observations.js";
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

/**
 * M11-B5: the whole-window reconciliation behind POST_CHANGE, generic over
 * actor and resource. The state is always the latest READ amount; the scaled
 * delta is compared beside each POST_CHANGE attachment only to classify it.
 */
export function resourceChangePostChangeContract(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"COMBAT_STATE.RESOURCE_CHANGE_POST_CHANGE_CONTRACT">,
): AssertionOutcome {
  const state = stateOf(corpus, artifact);
  const { actorId, resourceWireType: type, deltaScale } = params;
  const positions = [
    ...new Set([
      ...state.resources.snapshotPositionsFor(actorId, type),
      ...state.resources.standaloneChangePositionsFor(actorId, type),
    ]),
  ].sort((a, b) => a - b);
  const counts = {
    observations: positions.length,
    postChange: 0,
    integerReconciled: 0,
    capEvents: 0,
    deltaRoundedAttachmentExact: 0,
    preCostMatches: 0,
    uncostedMatches: 0,
    hiddenChangeMismatches: 0,
    maxValues: [] as number[],
  };
  const maxValues = new Set<number>();
  let carried: number | null = null;
  for (const position of positions) {
    const snapshot: StateResult<ResourceAmountObservation> = state.resources.observationOnEvent(
      position,
      actorId,
      type,
    );
    if (snapshot.certainty !== "EXACT") {
      const change = state.resources.standaloneChangeOnEvent(position);
      if (change.certainty === "EXACT") {
        // A change with no attachment of its own type: the state after it is unread.
        carried = null;
        continue;
      }
      return fail("an indexed resource position carries neither a snapshot nor a change", {
        locator: state.locatorAt(position) ?? undefined,
      });
    }
    const { observedAmount: amount, observedMax: max, timing } = snapshot.value;
    if (max !== null) maxValues.add(max);
    if (timing === "POST_CHANGE") {
      counts.postChange += 1;
      const change = state.resources.standaloneChangeOnEvent(position);
      if (change.certainty !== "EXACT") {
        return fail("a POST_CHANGE attachment sits on an event that is not a standalone change", {
          locator: snapshot.value.locator,
        });
      }
      if (carried !== null && max !== null) {
        const summed: number = carried + change.value.resourceChange * deltaScale;
        if (summed > max && amount === max) counts.capEvents += 1;
        else if (summed === amount) counts.integerReconciled += 1;
        else if (Math.abs(amount - summed) < deltaScale) counts.deltaRoundedAttachmentExact += 1;
        else counts.hiddenChangeMismatches += 1;
      }
      carried = amount;
    } else if (timing === "PRE_COST") {
      if (carried !== null) {
        if (carried === amount) counts.preCostMatches += 1;
        else counts.hiddenChangeMismatches += 1;
      }
      carried = null;
    } else {
      if (carried !== null) {
        if (carried === amount) counts.uncostedMatches += 1;
        else counts.hiddenChangeMismatches += 1;
      }
      carried = amount;
    }
  }
  counts.maxValues = [...maxValues].sort((a, b) => a - b);
  if (JSON.stringify(counts) !== JSON.stringify(params.expected)) {
    return fail("the POST_CHANGE reconciliation does not match the case", {
      expected: params.expected,
      actual: counts,
    });
  }
  return pass();
}

/**
 * M11-D2-A3: whose pool one standalone change changed, and that the index
 * agrees — under the owner and no other actor on the event, or under nobody.
 */
export function resourceChangePoolOwner(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER">,
): AssertionOutcome {
  const state = stateOf(corpus, artifact);
  const { reportTimeMs, sourceActorId, targetActorId, resourceWireType: type } = params;
  const matches = state.resources.indexes.standaloneChangePositions.filter((position) => {
    const event = state.eventAt(position);
    return (
      event?.kind === "RESOURCE_CHANGE" &&
      event.reportTimeMs === reportTimeMs &&
      event.source?.actorId === sourceActorId &&
      event.target?.actorId === targetActorId &&
      event.resourceType === type
    );
  });
  const position = matches[0];
  if (position === undefined || matches.length !== 1) {
    return fail("the locator does not name exactly one standalone change", {
      expected: 1,
      actual: matches.length,
    });
  }
  const change = state.resources.standaloneChangeOnEvent(position);
  if (change.certainty !== "EXACT") {
    return fail("the located change is not an exact standalone observation", { actual: change.certainty });
  }
  const { ownership, source } = change.value;
  if (source?.actorId !== sourceActorId) {
    return fail("the change's source was not carried through", {
      locator: change.value.locator,
      expected: sourceActorId,
      actual: source?.actorId ?? null,
    });
  }
  const actual =
    ownership.state === "RESOLVED"
      ? { state: "RESOLVED", ownerActorId: ownership.owner.actorId, basis: ownership.basis }
      : { state: "UNRESOLVED", reason: ownership.reason, candidateActorIds: ownership.candidateActorIds };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the change's pool ownership does not match the case", {
      locator: change.value.locator,
      expected: params.expected,
      actual,
    });
  }
  const indexedUnder = [...new Set([sourceActorId, targetActorId])].filter((actorId) =>
    state.resources.standaloneChangePositionsFor(actorId, type).includes(position),
  );
  const unresolved = state.resources.indexes.unresolvedOwnershipChangePositions.includes(position);
  const expectedIndex =
    ownership.state === "RESOLVED"
      ? {
          indexedUnder: [ownership.owner.actorId].filter(
            (id) => id === sourceActorId || id === targetActorId,
          ),
          unresolved: false,
        }
      : { indexedUnder: [], unresolved: true };
  if (
    ownership.state === "RESOLVED" &&
    !state.resources.standaloneChangePositionsFor(ownership.owner.actorId, type).includes(position)
  ) {
    return fail("the change is not indexed under its owner", { locator: change.value.locator });
  }
  if (JSON.stringify({ indexedUnder, unresolved }) !== JSON.stringify(expectedIndex)) {
    return fail("the standalone index disagrees with the change's ownership", {
      locator: change.value.locator,
      expected: expectedIndex,
      actual: { indexedUnder, unresolved },
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

// ---------------------------------------------------------------------------
// M10-B: the M4 actor indexes over a tank's slice
// ---------------------------------------------------------------------------

/**
 * `positionsBySourceActor` / `positionsByTargetActor` for the actor yield
 * exactly these kinds in these counts, and every position resolves to an
 * event whose named side IS the actor. Damage taken, healing received and
 * absorbs reach a consumer as observed events with locators; nothing here
 * sums, scores or models them.
 */
export function actorIndexCensus(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"COMBAT_STATE.ACTOR_INDEX_CENSUS">,
): AssertionOutcome {
  const state = stateOf(corpus, artifact);
  const positions =
    params.side === "SOURCE"
      ? state.positionsBySourceActor(params.actorId)
      : state.positionsByTargetActor(params.actorId);
  const counts = new Map<string, number>();
  for (const position of positions) {
    const event = state.eventAt(position);
    if (event === null) {
      return fail("an indexed position resolves to no event", { locator: { position } });
    }
    const side = params.side === "SOURCE" ? event.source : event.target;
    if (side?.actorId !== params.actorId) {
      return fail(`an indexed position's ${params.side} side is not actor ${String(params.actorId)}`, {
        actual: { actorId: side?.actorId ?? null },
        locator: event.locator,
      });
    }
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  }
  const sorted = (entries: Iterable<[string, number]>) =>
    Object.fromEntries([...entries].sort(([left], [right]) => (left < right ? -1 : 1)));
  const actual = sorted(counts.entries());
  const expected = sorted(Object.entries(params.expected));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail(
      `the ${params.side} index census for actor ${String(params.actorId)} differs from what the case pins`,
      {
        expected,
        actual,
      },
    );
  }
  return pass();
}
