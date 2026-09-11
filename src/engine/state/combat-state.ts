/**
 * `CombatState` — the query surface over one normalized fight.
 *
 * This is the M3 -> M4 seam. It takes an immutable `CombatFight` and answers
 * factual questions about it. It does not copy, rewrite or reinterpret a single
 * observation: every answer is a reference back into the fight, and the fight
 * itself stays reachable so callers read `state.fight.actors` rather than a
 * duplicate catalog.
 *
 * What this layer answers:
 *
 *     Where does this observation sit in the canonical sequence?
 *     What was observed at or before this point?
 *     Do we have the evidence to say something did NOT happen?
 *
 * What it does not answer, and must not grow into:
 *
 *     Was that correct play?          — specialization evaluator
 *     Was that ability available?     — needs runtime game data, not here
 *     Was the player able to act?     — actionability, later
 *
 * A cast index is a record of what was observed. It is NOT a cooldown model:
 * nothing here knows a base cooldown, a charge count, a recharge rate or a
 * reset, and nothing here should learn one.
 */

import type { EvidenceCategory } from "../../wcl/evidence-capability.js";
import { inclusiveRange } from "../evidence/coverage.js";
import type { EvidenceLocator } from "../evidence/locator.js";
import type { CombatFight } from "../normalization/combat-fight.js";
import type { CastEvent, CastPhase, CombatEvent } from "../normalization/normalized-events.js";
import { buildCombatIndexes, type CombatEventKind, type CombatIndexes } from "./indexes.js";
import { exactObserved, gateAbsenceClaim, unknownState, type StateResult } from "./state-result.js";
import {
  isMonotonic,
  lastPositionAtOrBefore,
  resolveTemporalPosition,
  type OrdinalResolution,
  type PositionResolution,
  type TemporalContext,
  type TemporalIntegrity,
  type TemporalPosition,
} from "./temporal.js";

const CASTS: EvidenceCategory = "CASTS";
const NO_POSITIONS: readonly number[] = [];

/**
 * A reference to one observed cast.
 *
 * A REFERENCE, not a copy. It carries what identifies the observation and
 * where to find it; a caller wanting the rest reads `state.eventAt(position)`.
 * Duplicating the event here would create a second version of a fact that M3
 * already owns.
 */
export interface ObservedCast {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly actorId: number;
  readonly abilityGameId: number | null;
  /** BEGIN and COMPLETE stay distinct. Neither is described as "successful". */
  readonly castPhase: CastPhase;
  readonly reportTimeMs: number;
  readonly fightTimeMs: number;
}

export interface LastCastQuery {
  readonly actorId: number;
  /** `null` asks about any ability by this actor. */
  readonly abilityGameId: number | null;
  readonly castPhase: CastPhase;
  readonly before: TemporalPosition;
}

export interface CombatState {
  /** The normalized fight, unmodified. Read actors and abilities from here. */
  readonly fight: CombatFight;
  readonly indexes: CombatIndexes;
  readonly temporalIntegrity: TemporalIntegrity;

  /** The event at a canonical position, or `null` when the position is outside the sequence. */
  eventAt(position: number): CombatEvent | null;
  locatorAt(position: number): EvidenceLocator | null;

  /**
   * Resolves an `ingestionOrdinal`.
   *
   * Never an array index. An ordinal consumed by a malformed observation
   * resolves to `MALFORMED_OBSERVATION`, not to a neighbouring event.
   */
  resolveIngestionOrdinal(ordinal: number): OrdinalResolution;

  resolveTemporalPosition(position: TemporalPosition): PositionResolution;

  positionsOfKind(kind: CombatEventKind): readonly number[];
  positionsBySourceActor(actorId: number): readonly number[];
  positionsByTargetActor(actorId: number): readonly number[];
  positionsByAbility(abilityGameId: number): readonly number[];

  /**
   * The last observed cast matching the query at or before a temporal position.
   *
   * `EXACT` with a value  — an observation. Needs no coverage, because it
   *                         happened.
   * `EXACT` with `null`   — a PROVEN absence: capability OBSERVABLE, the actor
   *                         in scope, and COMPLETE coverage across the whole
   *                         interval. This is the only way "they never cast it"
   *                         may be said.
   * `UNKNOWN`             — we could not look properly. Never "they never cast
   *                         it".
   */
  lastObservedCast(query: LastCastQuery): StateResult<ObservedCast | null>;
}

function observedCastFrom(event: CastEvent, position: number, actorId: number): ObservedCast {
  return {
    position,
    locator: event.locator,
    actorId,
    abilityGameId: event.abilityGameId,
    castPhase: event.castPhase,
    reportTimeMs: event.reportTimeMs,
    fightTimeMs: event.fightTimeMs,
  };
}

export function createCombatState(fight: CombatFight): CombatState {
  const indexes = buildCombatIndexes(fight);

  function eventAt(position: number): CombatEvent | null {
    if (!Number.isInteger(position) || position < 0 || position >= fight.events.length) {
      return null;
    }
    return fight.events[position] ?? null;
  }

  const temporalContext: TemporalContext = {
    eventCount: fight.events.length,
    reportTimeAt: (position) => eventAt(position)?.reportTimeMs ?? null,
    timestampRuns: indexes.timestampRuns,
    integrity: indexes.temporalIntegrity,
  };

  function resolve(position: TemporalPosition): PositionResolution {
    return resolveTemporalPosition(temporalContext, position);
  }

  function lastObservedCast(query: LastCastQuery): StateResult<ObservedCast | null> {
    const resolution = resolve(query.before);
    if (!resolution.ok) {
      return unknownState(resolution.reason, [], CASTS);
    }
    const { lastIncludedPosition, boundaryReportTimeMs } = resolution.prefix;

    const actorIndex = indexes.castsByPhase[query.castPhase].get(query.actorId);
    const candidates =
      actorIndex === undefined
        ? NO_POSITIONS
        : query.abilityGameId === null
          ? actorIndex.allPositions
          : (actorIndex.positionsByAbility.get(query.abilityGameId) ?? NO_POSITIONS);

    const found = lastPositionAtOrBefore(candidates, lastIncludedPosition);
    if (found !== null) {
      const event = eventAt(found);
      if (event === null || event.kind !== "CAST" || event.source === null) {
        // Unreachable while the index is built from these same events. Reported
        // rather than asserted, because a confident answer from an index that
        // disagrees with the fight would be worse than admitting confusion.
        return unknownState("UNSUPPORTED_DERIVATION", [], CASTS);
      }
      return exactObserved(observedCastFrom(event, found, event.source.actorId), [event.locator], CASTS);
    }

    // Nothing found. Saying so is an ABSENCE claim, and absence claims have to
    // be earned.
    //
    // Monotonicity is required even for an event-relative anchor: the prefix is
    // a range of canonical POSITIONS, and treating it as a time interval to
    // check coverage against is only valid when the two orders agree.
    if (!isMonotonic(indexes.temporalIntegrity)) {
      return unknownState("NON_MONOTONIC_TIME", [], CASTS);
    }

    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: CASTS,
      range: inclusiveRange(fight.fight.startTimeMs, boundaryReportTimeMs),
      actorId: query.actorId,
    });
    if (!gate.ok) {
      return unknownState(gate.reason, [], CASTS);
    }

    // COMPLETE coverage over the whole interval, the actor in scope, and no
    // such cast observed. A zero-use result backed by complete coverage is a
    // valid observed fact.
    return exactObserved(null, [], CASTS);
  }

  return {
    fight,
    indexes,
    temporalIntegrity: indexes.temporalIntegrity,
    eventAt,
    locatorAt: (position) => eventAt(position)?.locator ?? null,
    resolveIngestionOrdinal(ordinal: number): OrdinalResolution {
      const position = indexes.positionByOrdinal.get(ordinal);
      if (position !== undefined) {
        return { kind: "EVENT", position };
      }
      if (indexes.malformedOrdinals.has(ordinal)) {
        return { kind: "MALFORMED_OBSERVATION" };
      }
      return { kind: "NOT_PRESENT" };
    },
    resolveTemporalPosition: resolve,
    positionsOfKind: (kind) => indexes.positionsByKind.get(kind) ?? NO_POSITIONS,
    positionsBySourceActor: (actorId) => indexes.positionsBySourceActor.get(actorId) ?? NO_POSITIONS,
    positionsByTargetActor: (actorId) => indexes.positionsByTargetActor.get(actorId) ?? NO_POSITIONS,
    positionsByAbility: (abilityGameId) => indexes.positionsByAbility.get(abilityGameId) ?? NO_POSITIONS,
    lastObservedCast,
  };
}
