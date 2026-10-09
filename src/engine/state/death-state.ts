/**
 * Positive death facts (M11-F).
 *
 * WHAT THIS MODULE MAY SAY
 *
 * Warcraft Logs writes a `death` event for some actor instances. When it does,
 * that is a positive fact: "ActorKey X has a death event at T". This module
 * reads those facts and nothing else into a state.
 *
 * WHAT IT MAY NEVER SAY
 *
 * Anything from the ABSENCE of a death event. The M11-ED audit of the
 * canonical capture (report b1PmaKrd6CDfzngc fight 48) found:
 *
 *   - the boss of a KILL with no death event (last hit left it at 52,771 HP);
 *   - eleven NPC instances that stopped appearing with no death event;
 *   - dead NPC instances SOURCING delayed damage for up to 32 s after their
 *     own death event.
 *
 * So there is no ALIVE, SURVIVED, DID_NOT_DIE, PRESENT, TARGETABLE or ACTIVE
 * state here, and there never will be. `NO_POSITIVE_DEATH_EVIDENCE` means
 * exactly what it says and nothing more. Retrieval completeness is a separate
 * question with a separate name (`deathEventRetrieval`) and only ever means
 * "every death event the retrieved stream emitted in the range was
 * retrieved" — not that every real death, defeat or despawn produced one.
 *
 * WHAT CAN FOLLOW A DEATH
 *
 * After a death at T, the state of that same ActorKey at a query time D is
 * decided by the FIRST decisive event targeting it in (T, D]:
 *
 *   RESURRECTION          a decoded resurrection (no production contract
 *                         exists yet; see `resurrectionContractFor`)
 *                         -> RESURRECTION_OBSERVED, never "alive"
 *   reviewed contradiction a DAMAGE event targeting the same key whose
 *                         TARGET-side snapshot describes that same key with
 *                         hitPoints > 0. In the audited capture this never
 *                         followed a death without an intervening
 *                         resurrection (0 of 133 NPC deaths; the one player
 *                         death had 29, all after the resurrection).
 *                         -> EVIDENCE_CONTRADICTION
 *   unreviewed event       an UNSUPPORTED_TYPE or MALFORMED_FAMILY event
 *                         targeting the key — it could be a resurrection this
 *                         build does not decode -> UNREVIEWED_EVENT_AFTER_DEATH
 *
 * Everything else is NOT decisive, by audit: aura removals (cleanup at and
 * after death), aura applications (both audited ones followed a resurrection
 * and prove nothing on their own), casts aimed at the dead actor (the
 * resurrection attempt), healing, absorbs, resource changes, and anything the
 * dead actor SOURCES.
 *
 * NO FUTURE EVIDENCE
 *
 * A query at D reads only events at or before D. An event AFTER D can never
 * change the answer at D — the authority rule of owner decision O2. A
 * decisive event at the same report millisecond as the death, or a death at
 * the query millisecond itself, is ORDERING_AMBIGUOUS: retrieval order is not
 * an authoritative order of game events.
 *
 * Identity is the full ActorKey. A death of actor 180 instance 3 says nothing
 * about instance 4, and instance `null` is not instance 0.
 */

import type { EvidenceLocator } from "../evidence/locator.js";
import type { CombatFight } from "../normalization/combat-fight.js";
import type { ActorRef, CombatEvent, DeathEvent } from "../normalization/normalized-events.js";

/** One positive death fact. */
export interface DeathObservation {
  /** The dying actor instance: the event's TARGET. */
  readonly actor: ActorRef;
  readonly reportTimeMs: number;
  readonly killer: ActorRef | "NOT_SUPPLIED";
  readonly killingAbilityGameId: number | "NOT_SUPPLIED";
  readonly locator: EvidenceLocator;
  /** Canonical position in the fight's event sequence. */
  readonly position: number;
}

/**
 * The positive death facts of a fight. There is deliberately no "complete"
 * variant: this collection says which deaths were OBSERVED and makes no claim
 * about any actor it does not list.
 */
export interface ObservedDeaths {
  readonly observed: readonly DeathObservation[];
  readonly absenceSemantics: "NONE";
}

export interface DecisiveAfterDeath {
  readonly reportTimeMs: number;
  readonly rawType: string;
  readonly locator: EvidenceLocator;
  readonly position: number;
}

export type DeathState =
  /** No death event for this ActorKey at or before the query. NEVER alive. */
  | { readonly state: "NO_POSITIVE_DEATH_EVIDENCE" }
  /** A death event at T, and no decisive event targeting the key in (T, D]. */
  | { readonly state: "DEAD_SINCE"; readonly death: DeathObservation }
  /** A decoded resurrection after the death. Not alive: UNKNOWN beyond this. */
  | {
      readonly state: "RESURRECTION_OBSERVED";
      readonly death: DeathObservation;
      readonly resurrection: DecisiveAfterDeath;
    }
  /** Reviewed target-side life evidence after the death, with no resurrection. */
  | {
      readonly state: "EVIDENCE_CONTRADICTION";
      readonly death: DeathObservation;
      readonly contradiction: DecisiveAfterDeath;
      readonly rule: "TARGET_SIDE_POSITIVE_HEALTH_SNAPSHOT";
    }
  /** An event this build does not decode targeted the key after its death. */
  | {
      readonly state: "UNREVIEWED_EVENT_AFTER_DEATH";
      readonly death: DeathObservation;
      readonly event: DecisiveAfterDeath;
    }
  /** Two facts share a report millisecond and their order is not authoritative. */
  | {
      readonly state: "ORDERING_AMBIGUOUS";
      readonly death: DeathObservation;
      readonly reason: "DEATH_AT_QUERY_TIME" | "DECISIVE_EVENT_AT_DEATH_TIME" | "CONFLICTING_DECISIVE_EVENTS";
    };

export type DeathEventRetrieval =
  /**
   * Every death event the retrieved stream emitted in the range, for this
   * actor, was retrieved. It does NOT mean Warcraft Logs emits a death event
   * for every real death, defeat or despawn.
   */
  "DEATH_EVENTS_RETRIEVED_COMPLETE" | "DEATH_EVENT_RETRIEVAL_NOT_ESTABLISHED";

function sameKey(left: ActorRef, right: ActorRef): boolean {
  return left.actorId === right.actorId && left.instanceId === right.instanceId;
}

function observationOf(event: DeathEvent, position: number): DeathObservation | null {
  if (event.target === null) return null;
  return {
    actor: { actorId: event.target.actorId, instanceId: event.target.instanceId },
    reportTimeMs: event.reportTimeMs,
    killer: event.killer,
    killingAbilityGameId: event.killingAbilityGameId,
    locator: event.locator,
    position,
  };
}

const INDEX = new WeakMap<CombatFight, ReadonlyMap<number, readonly number[]>>();

/** Positions of events TARGETING each actor id, built once per fight. */
function targetPositions(fight: CombatFight): ReadonlyMap<number, readonly number[]> {
  const cached = INDEX.get(fight);
  if (cached !== undefined) return cached;
  const byActor = new Map<number, number[]>();
  fight.events.forEach((event, position) => {
    if (event.target === null) return;
    const list = byActor.get(event.target.actorId);
    if (list === undefined) byActor.set(event.target.actorId, [position]);
    else list.push(position);
  });
  INDEX.set(fight, byActor);
  return byActor;
}

/** Every positive death fact in the fight, in canonical order. */
export function observedDeathsOf(fight: CombatFight): ObservedDeaths {
  const observed: DeathObservation[] = [];
  fight.events.forEach((event, position) => {
    if (event.kind !== "DEATH") return;
    const observation = observationOf(event, position);
    if (observation !== null) observed.push(observation);
  });
  return { observed, absenceSemantics: "NONE" };
}

type Decisive = "RESURRECTION" | "CONTRADICTION" | "UNREVIEWED";

/** Whether an event targeting `key` after its death is decisive, and how. */
function decisiveClass(event: CombatEvent, key: ActorRef): Decisive | null {
  switch (event.kind) {
    case "RESURRECTION":
      return "RESURRECTION";
    case "UNSUPPORTED_TYPE":
    case "MALFORMED_FAMILY":
      return "UNREVIEWED";
    case "DAMAGE": {
      const snapshot = event.attachedResources;
      if (
        snapshot !== null &&
        snapshot.side === "TARGET" &&
        snapshot.actor !== null &&
        sameKey(snapshot.actor, key) &&
        snapshot.hitPoints !== null &&
        snapshot.hitPoints > 0
      ) {
        return "CONTRADICTION";
      }
      return null;
    }
    default:
      return null;
  }
}

function decisiveOf(event: CombatEvent, position: number): DecisiveAfterDeath {
  return { reportTimeMs: event.reportTimeMs, rawType: event.rawType, locator: event.locator, position };
}

/**
 * The death state of one ActorKey at report time `atReportTimeMs`, from events
 * at or before that time only.
 */
export function deathStateAt(fight: CombatFight, key: ActorRef, atReportTimeMs: number): DeathState {
  const positions = targetPositions(fight).get(key.actorId) ?? [];
  // The latest positive death of this exact key at or before the query.
  let death: DeathObservation | null = null;
  for (const position of positions) {
    const event = fight.events[position];
    if (event === undefined || event.kind !== "DEATH" || event.reportTimeMs > atReportTimeMs) continue;
    if (event.target === null || !sameKey(event.target, key)) continue;
    const observation = observationOf(event, position);
    if (observation !== null && (death === null || observation.reportTimeMs >= death.reportTimeMs)) {
      death = observation;
    }
  }
  if (death === null) return { state: "NO_POSITIVE_DEATH_EVIDENCE" };
  if (death.reportTimeMs === atReportTimeMs) {
    return { state: "ORDERING_AMBIGUOUS", death, reason: "DEATH_AT_QUERY_TIME" };
  }

  // Decisive events targeting the same key, at the death's millisecond or after, up to the query.
  let first: {
    readonly at: number;
    readonly classes: Set<Decisive>;
    readonly event: DecisiveAfterDeath;
  } | null = null;
  for (const position of positions) {
    const event = fight.events[position];
    if (event === undefined || event.target === null || !sameKey(event.target, key)) continue;
    if (event.kind === "DEATH" || event.reportTimeMs < death.reportTimeMs) continue;
    if (event.reportTimeMs > atReportTimeMs) continue;
    const decisive = decisiveClass(event, key);
    if (decisive === null) continue;
    if (event.reportTimeMs === death.reportTimeMs) {
      return { state: "ORDERING_AMBIGUOUS", death, reason: "DECISIVE_EVENT_AT_DEATH_TIME" };
    }
    if (first === null || event.reportTimeMs < first.at) {
      first = { at: event.reportTimeMs, classes: new Set([decisive]), event: decisiveOf(event, position) };
    } else if (event.reportTimeMs === first.at) {
      first.classes.add(decisive);
    }
  }
  if (first === null) return { state: "DEAD_SINCE", death };
  if (first.classes.size > 1)
    return { state: "ORDERING_AMBIGUOUS", death, reason: "CONFLICTING_DECISIVE_EVENTS" };
  const [only] = [...first.classes];
  if (only === "RESURRECTION") return { state: "RESURRECTION_OBSERVED", death, resurrection: first.event };
  if (only === "CONTRADICTION") {
    return {
      state: "EVIDENCE_CONTRADICTION",
      death,
      contradiction: first.event,
      rule: "TARGET_SIDE_POSITIVE_HEALTH_SNAPSHOT",
    };
  }
  return { state: "UNREVIEWED_EVENT_AFTER_DEATH", death, event: first.event };
}

/**
 * Whether every death event the retrieved stream emitted for `actorId` over
 * `[fromMs, toMs]` was retrieved. A positive answer is a RETRIEVAL fact only:
 * it never makes the absence of a death event mean anything about the actor.
 */
export function deathEventRetrieval(
  fight: CombatFight,
  actorId: number,
  fromMs: number,
  toMs: number,
): DeathEventRetrieval {
  const evidence = fight.completeness.categories.DEATHS;
  if (evidence.capability !== "OBSERVABLE") return "DEATH_EVENT_RETRIEVAL_NOT_ESTABLISHED";
  const coverage = evidence.coverage;
  if (coverage.state !== "COMPLETE") return "DEATH_EVENT_RETRIEVAL_NOT_ESTABLISHED";
  if (coverage.actorScope !== null && !coverage.actorScope.includes(actorId)) {
    return "DEATH_EVENT_RETRIEVAL_NOT_ESTABLISHED";
  }
  const covered = coverage.coveredRanges.some(
    (range) =>
      range.fromReportTimeMs <= fromMs &&
      (range.upperBound === "INCLUSIVE" ? toMs <= range.toReportTimeMs : toMs < range.toReportTimeMs),
  );
  return covered ? "DEATH_EVENTS_RETRIEVED_COMPLETE" : "DEATH_EVENT_RETRIEVAL_NOT_ESTABLISHED";
}
