/**
 * Factual indexes over the canonical event sequence.
 *
 * Everything here is built by ONE forward pass over `CombatFight.events`. That
 * is not a performance preference — it is what keeps the indexes honest:
 *
 * - positions are appended in canonical order, so every position list is
 *   ascending BY CONSTRUCTION and can be searched without assuming sortedness
 * - temporal integrity is observed while walking, rather than asserted
 * - nothing is sorted, deduplicated, or reordered, because nothing is ever
 *   revisited
 *
 * These are LOOKUPS, not interpretations. An index says where an observation
 * sits in the canonical sequence. It does not say what the observation means,
 * whether it was correct, or whether anything was missing — those are gameplay
 * questions that belong to a specialization evaluator.
 *
 * `CombatFight.actors` and `CombatFight.abilities` are NOT re-derived here.
 * They already exist as maps on the fight, and a second copy could disagree
 * with the first.
 */

import type { CombatFight } from "../normalization/combat-fight.js";
import type { CastPhase, CombatEvent } from "../normalization/normalized-events.js";
import type {
  TemporalIntegrity,
  TemporalIntegrityReason,
  TimestampRun,
  TimestampViolation,
} from "./temporal.js";

export type CombatEventKind = CombatEvent["kind"];

/**
 * One actor's observed casts for a single cast phase.
 *
 * `allPositions` holds every cast, including those whose `abilityGameId` was
 * null — those cannot be keyed by ability, and dropping them would understate
 * what the actor did.
 */
export interface ActorCastIndex {
  readonly allPositions: readonly number[];
  readonly positionsByAbility: ReadonlyMap<number, readonly number[]>;
}

export interface CombatIndexes {
  readonly temporalIntegrity: TemporalIntegrity;
  /**
   * `ingestionOrdinal` -> canonical position.
   *
   * Sparse on purpose. Ordinals consumed by malformed observations are absent,
   * and no gap is filled, interpolated, or rounded to a neighbour.
   */
  readonly positionByOrdinal: ReadonlyMap<number, number>;
  /** Ordinals consumed by observations that never became events. */
  readonly malformedOrdinals: ReadonlySet<number>;
  /** Sound only under MONOTONIC integrity. See `TimestampRun`. */
  readonly timestampRuns: readonly TimestampRun[];
  readonly positionsByKind: ReadonlyMap<CombatEventKind, readonly number[]>;
  /** Keyed by the SOURCE actor. Events with no source contribute nothing. */
  readonly positionsBySourceActor: ReadonlyMap<number, readonly number[]>;
  /** Keyed by the TARGET actor. Kept separate from sources; never merged. */
  readonly positionsByTargetActor: ReadonlyMap<number, readonly number[]>;
  readonly positionsByAbility: ReadonlyMap<number, readonly number[]>;
  /** Cast positions per phase, then per source actor. BEGIN and COMPLETE never merge. */
  readonly castsByPhase: Readonly<Record<CastPhase, ReadonlyMap<number, ActorCastIndex>>>;
}

interface MutableActorCastIndex {
  readonly allPositions: number[];
  readonly positionsByAbility: Map<number, number[]>;
}

function append<K>(index: Map<K, number[]>, key: K, position: number): void {
  const existing = index.get(key);
  if (existing === undefined) {
    index.set(key, [position]);
    return;
  }
  existing.push(position);
}

function castIndexFor(index: Map<number, MutableActorCastIndex>, actorId: number): MutableActorCastIndex {
  const existing = index.get(actorId);
  if (existing !== undefined) {
    return existing;
  }
  const created: MutableActorCastIndex = { allPositions: [], positionsByAbility: new Map() };
  index.set(actorId, created);
  return created;
}

/**
 * Builds every factual index in a single forward scan.
 *
 * Null actors are skipped rather than keyed. A sentinel source is an explicit
 * "no actor here" statement, and giving it an index entry would recreate the
 * historical failure in which `-1` accumulated events belonging to nobody.
 *
 * Actor id `0` is a real id — M3 pins that — so every actor test here is an
 * explicit `null` comparison and never a truthiness check.
 */
export function buildCombatIndexes(fight: CombatFight): CombatIndexes {
  const positionByOrdinal = new Map<number, number>();
  const malformedOrdinals = new Set<number>();
  const timestampRuns: TimestampRun[] = [];
  const positionsByKind = new Map<CombatEventKind, number[]>();
  const positionsBySourceActor = new Map<number, number[]>();
  const positionsByTargetActor = new Map<number, number[]>();
  const positionsByAbility = new Map<number, number[]>();
  const beginCasts = new Map<number, MutableActorCastIndex>();
  const completeCasts = new Map<number, MutableActorCastIndex>();
  const observedStreamIds: string[] = [];
  const seenStreamIds = new Set<string>();

  let previousReportTimeMs: number | null = null;
  let previousPosition = -1;
  let firstViolation: TimestampViolation | null = null;

  // An indexed `for` rather than `forEach`: the scan carries mutable state
  // across iterations, and a callback boundary would defeat the narrowing that
  // keeps `previousReportTimeMs` honest.
  for (let position = 0; position < fight.events.length; position += 1) {
    const event = fight.events[position];
    if (event === undefined) {
      continue;
    }

    positionByOrdinal.set(event.ingestionOrdinal, position);

    const streamId = event.locator.streamId;
    if (!seenStreamIds.has(streamId)) {
      seenStreamIds.add(streamId);
      observedStreamIds.push(streamId);
    }

    if (
      previousReportTimeMs !== null &&
      event.reportTimeMs < previousReportTimeMs &&
      firstViolation === null
    ) {
      const previousEvent = fight.events[previousPosition];
      if (previousEvent !== undefined) {
        firstViolation = {
          previousPosition,
          previousLocator: previousEvent.locator,
          previousReportTimeMs,
          offendingPosition: position,
          offendingLocator: event.locator,
          offendingReportTimeMs: event.reportTimeMs,
        };
      }
    }
    previousReportTimeMs = event.reportTimeMs;
    previousPosition = position;

    const lastRun = timestampRuns[timestampRuns.length - 1];
    if (lastRun !== undefined && lastRun.reportTimeMs === event.reportTimeMs) {
      timestampRuns[timestampRuns.length - 1] = { ...lastRun, lastPosition: position };
    } else {
      timestampRuns.push({
        reportTimeMs: event.reportTimeMs,
        firstPosition: position,
        lastPosition: position,
      });
    }

    append(positionsByKind, event.kind, position);

    // Explicit null checks throughout: actor id 0 is a real actor.
    if (event.source !== null) {
      append(positionsBySourceActor, event.source.actorId, position);
    }
    if (event.target !== null) {
      append(positionsByTargetActor, event.target.actorId, position);
    }
    if (event.abilityGameId !== null) {
      append(positionsByAbility, event.abilityGameId, position);
    }

    if (event.kind === "CAST" && event.source !== null) {
      const byActor = event.castPhase === "BEGIN" ? beginCasts : completeCasts;
      const actorIndex = castIndexFor(byActor, event.source.actorId);
      actorIndex.allPositions.push(position);
      if (event.abilityGameId !== null) {
        append(actorIndex.positionsByAbility, event.abilityGameId, position);
      }
    }
  }

  for (const observation of fight.malformedObservations) {
    malformedOrdinals.add(observation.position.ingestionOrdinal);
  }

  const reasons: TemporalIntegrityReason[] = [];
  // Structural first: more than one stream was concatenated into one array,
  // whether or not a decrease happened to be observable at the seam.
  if (fight.provenance.hostilityStreams.length > 1 || observedStreamIds.length > 1) {
    reasons.push("CONCATENATED_STREAMS");
  }
  if (firstViolation !== null) {
    reasons.push("TIMESTAMP_DECREASED");
  }

  return {
    temporalIntegrity: {
      state: reasons.length === 0 ? "MONOTONIC" : "NON_MONOTONIC",
      reasons,
      firstViolation,
      observedStreamIds,
      declaredStreamCount: fight.provenance.hostilityStreams.length,
    },
    positionByOrdinal,
    malformedOrdinals,
    timestampRuns,
    positionsByKind,
    positionsBySourceActor,
    positionsByTargetActor,
    positionsByAbility,
    castsByPhase: { BEGIN: beginCasts, COMPLETE: completeCasts },
  };
}
