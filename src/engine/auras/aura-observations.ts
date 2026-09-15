/**
 * Observed aura facts, indexed by logical aura identity.
 *
 * This module reads M3's normalized `AuraEvent`s and nothing else. It never
 * touches raw Warcraft Logs JSON, never re-derives `auraClass` from which query
 * returned an event, and never constructs a `SourceRef` or `TargetRef` of its
 * own — it carries M3's branded references through by reference, which is what
 * makes an inversion in this layer impossible rather than merely unlikely.
 *
 * WHAT AN AURA IDENTITY IS HERE
 *
 *     target actor instance  +  ability game id  +  BUFF / DEBUFF
 *
 * with source kept as a REFINEMENT inside the track rather than as part of the
 * key. Two reasons:
 *
 * - a removal is frequently attributed to a different source than the
 *   application, so keying on source would split one real aura into two tracks
 *   and let a removal go unseen
 * - the caller sometimes genuinely needs "this aura, from this source" — so the
 *   refinement has to remain available rather than be discarded
 *
 * `auraClass` is part of the key because the same ability id appearing as a buff
 * and as a debuff is two different facts, and merging them would let a
 * `removebuff` answer a debuff question.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No duration, no expiration, no pandemic arithmetic, no stack reconstruction.
 * There is no duration database in M4, and an aura must never become inactive
 * because a remembered spell duration elapsed.
 */

import type { EvidenceLocator } from "../evidence/locator.js";
import type { CombatFight } from "../normalization/combat-fight.js";
import type { AuraClass, AuraOperation, SourceRef, TargetRef } from "../normalization/normalized-events.js";
import { actorInstanceKey } from "../state/state-environment.js";

/**
 * An opaque composite address for one aura GROUP — target, ability, aura class.
 *
 * A group is NOT an identity. It is the set of source-specific tracks that share
 * a target and ability, and it exists only so an any-source question has
 * somewhere to look.
 */
export type AuraGroupKey = string;

/** An opaque composite address for one aura identity, source included. */
export type AuraTrackKey = string;

/**
 * A reference to one observed aura transition.
 *
 * A REFERENCE, not a copy: it carries what identifies the observation and where
 * to find it, and the fight keeps owning the event. `source` and `target` are
 * M3's own branded references, passed through untouched.
 */
export interface AuraObservation {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly operation: AuraOperation;
  readonly auraClass: AuraClass;
  readonly abilityGameId: number;
  /** Who applied it. `null` when Warcraft Logs supplied no source. Never defaulted to the target. */
  readonly source: SourceRef | null;
  /** Who it is on. Always present — an aura with no target gets no state at all. */
  readonly target: TargetRef;
  /** True when the raw type was a `*stack` variant. */
  readonly isStackChange: boolean;
  /**
   * The observed `stack` value, verbatim.
   *
   * For `gameVersion` 1 / `logVersion` 17 this is the ABSOLUTE RESULTING STACK
   * COUNT AFTER this transition — established, not assumed, and never a delta.
   * Evidence: corpus artifact `wcl-aura-stack-absolute` (tests/corpus/manifest.json).
   *
   * Verbatim still means verbatim. Nothing here adds, subtracts or reconciles
   * two stack numbers, because the value is only known AT a transition that
   * carried one. `null` means this transition carried no `stack` field — an
   * absence, never zero stacks.
   */
  readonly observedStacks: number | null;
  readonly reportTimeMs: number;
  readonly fightTimeMs: number;
}

/**
 * One aura IDENTITY's complete observed history.
 *
 * The identity includes the source:
 *
 *     target actor + target instance + ability + aura class + source actor + source instance
 *
 * That is the whole point of this type. Two rogues both keeping Rupture on the
 * same boss are two independent auras in the game, and they are two independent
 * tracks here. Rogue B refreshing or removing their own Rupture is not evidence
 * about Rogue A's, and must never be able to invalidate it.
 *
 * `source` is `null` for exactly one track per group: the one holding
 * transitions where Warcraft Logs supplied no source at all. That is not a
 * source identity — it is the absence of one, kept separate so a sourceless
 * transition is neither invented into an actor nor silently merged into a real
 * source's history.
 *
 * Both position lists are ascending BY CONSTRUCTION — appended during a single
 * forward scan — so they can be searched with M4-A's `lastPositionAtOrBefore`
 * without assuming sortedness.
 */
export interface AuraTrack {
  readonly key: AuraTrackKey;
  readonly target: TargetRef;
  readonly abilityGameId: number;
  readonly auraClass: AuraClass;
  /** The source that owns this history. `null` means none was supplied. */
  readonly source: SourceRef | null;
  readonly positions: readonly number[];
  /** Transitions carrying a non-null `stack`. A subset of `positions`. */
  readonly stackObservationPositions: readonly number[];
}

/**
 * The source-specific tracks sharing a target, ability and aura class.
 *
 * A grouping, not a state machine. It exists so an any-source question has a
 * place to look, and it deliberately does NOT hold an aggregate presence: the
 * set of sources that could have applied an aura is not observable, so a union
 * answer has to be derived from the member tracks each time rather than
 * maintained here as if the members could not overlap.
 */
export interface AuraGroup {
  readonly key: AuraGroupKey;
  readonly target: TargetRef;
  readonly abilityGameId: number;
  readonly auraClass: AuraClass;
  /** Keyed by source actor INSTANCE. Excludes the sourceless track. */
  readonly tracksBySource: ReadonlyMap<string, AuraTrack>;
  /** The track for transitions with no supplied source, when any exist. */
  readonly sourcelessTrack: AuraTrack | null;
  /** Every member track, including the sourceless one. */
  readonly tracks: readonly AuraTrack[];
  /** Every transition in the group, in canonical order. */
  readonly allPositions: readonly number[];
  /** Group-wide transitions carrying a non-null `stack`, in canonical order. */
  readonly stackObservationPositions: readonly number[];
}

export interface AuraIndexes {
  readonly groups: ReadonlyMap<AuraGroupKey, AuraGroup>;
  /**
   * Aura observations on a target whose ability id was NOT supplied, by target
   * instance key.
   *
   * These cannot be attributed to any aura identity, so they cannot join a
   * track. They are kept because discarding them would be fail-open: an
   * unidentifiable transition sitting between an application and a query is a
   * transition we cannot rule out, and a derived-state query has to be able to
   * notice one and decline.
   */
  readonly unidentifiedPositionsByTarget: ReadonlyMap<string, readonly number[]>;
  /**
   * Aura observations with no target at all.
   *
   * Counted, never indexed. An aura with no target is on nobody, so it belongs
   * to no track, and giving the sentinel an entry would recreate the historical
   * failure in which `-1` accumulated state belonging to no actor.
   */
  readonly targetlessObservationCount: number;
}

export function auraGroupKey(target: TargetRef, abilityGameId: number, auraClass: AuraClass): AuraGroupKey {
  return `${actorInstanceKey(target.actorId, target.instanceId)}|${abilityGameId}|${auraClass}`;
}

export function auraSourceKey(source: SourceRef): string {
  return actorInstanceKey(source.actorId, source.instanceId);
}

/** The sentinel segment for the one track that has no source. Never an actor key. */
const NO_SOURCE_SEGMENT = "nosource";

export function auraTrackKey(
  target: TargetRef,
  abilityGameId: number,
  auraClass: AuraClass,
  source: SourceRef | null,
): AuraTrackKey {
  const sourceSegment = source === null ? NO_SOURCE_SEGMENT : `s${auraSourceKey(source)}`;
  return `${auraGroupKey(target, abilityGameId, auraClass)}|${sourceSegment}`;
}

interface MutableAuraTrack {
  readonly key: AuraTrackKey;
  readonly target: TargetRef;
  readonly abilityGameId: number;
  readonly auraClass: AuraClass;
  readonly source: SourceRef | null;
  readonly positions: number[];
  readonly stackObservationPositions: number[];
}

interface MutableAuraGroup {
  readonly key: AuraGroupKey;
  readonly target: TargetRef;
  readonly abilityGameId: number;
  readonly auraClass: AuraClass;
  readonly tracksBySource: Map<string, MutableAuraTrack>;
  sourcelessTrack: MutableAuraTrack | null;
  readonly tracks: MutableAuraTrack[];
  readonly allPositions: number[];
  readonly stackObservationPositions: number[];
}

function append<K>(index: Map<K, number[]>, key: K, position: number): void {
  const existing = index.get(key);
  if (existing === undefined) {
    index.set(key, [position]);
    return;
  }
  existing.push(position);
}

/**
 * Builds the aura indexes in one forward scan.
 *
 * Its own scan rather than a branch inside M4-A's index builder: aura identity
 * is a domain shape, and pushing it into the shared builder would make the
 * shared layer own a piece of aura meaning. The cost is one extra pass over an
 * array the process already holds.
 *
 * A transition is appended to exactly one TRACK and to its group's roll-up
 * lists, in that order. Both remain ascending by construction, and the track is
 * the one a source-specific query reads — so the scan is where source
 * independence is actually established, not somewhere a later filter tries to
 * reconstruct it.
 *
 * Every actor test below is an explicit `null` comparison. Actor id `0` is a
 * real id, and a truthiness check here would silently drop a legitimate actor's
 * auras.
 */
export function buildAuraIndexes(fight: CombatFight): AuraIndexes {
  const groups = new Map<AuraGroupKey, MutableAuraGroup>();
  const unidentifiedPositionsByTarget = new Map<string, number[]>();
  let targetlessObservationCount = 0;

  for (let position = 0; position < fight.events.length; position += 1) {
    const event = fight.events[position];
    if (event === undefined || event.kind !== "AURA") {
      continue;
    }

    const { target } = event;
    if (target === null) {
      targetlessObservationCount += 1;
      continue;
    }

    if (event.abilityGameId === null) {
      append(unidentifiedPositionsByTarget, actorInstanceKey(target.actorId, target.instanceId), position);
      continue;
    }

    const groupKey = auraGroupKey(target, event.abilityGameId, event.auraClass);
    let group = groups.get(groupKey);
    if (group === undefined) {
      group = {
        key: groupKey,
        target,
        abilityGameId: event.abilityGameId,
        auraClass: event.auraClass,
        tracksBySource: new Map(),
        sourcelessTrack: null,
        tracks: [],
        allPositions: [],
        stackObservationPositions: [],
      };
      groups.set(groupKey, group);
    }

    // The source segments the history. A sourceless transition goes to the one
    // sourceless track rather than being given an actor or folded into a real
    // source's history.
    let track: MutableAuraTrack | null =
      event.source === null
        ? group.sourcelessTrack
        : (group.tracksBySource.get(auraSourceKey(event.source)) ?? null);
    if (track === null) {
      track = {
        key: auraTrackKey(target, event.abilityGameId, event.auraClass, event.source),
        target,
        abilityGameId: event.abilityGameId,
        auraClass: event.auraClass,
        source: event.source,
        positions: [],
        stackObservationPositions: [],
      };
      group.tracks.push(track);
      if (event.source === null) {
        group.sourcelessTrack = track;
      } else {
        group.tracksBySource.set(auraSourceKey(event.source), track);
      }
    }

    track.positions.push(position);
    group.allPositions.push(position);
    if (event.stacks !== null) {
      track.stackObservationPositions.push(position);
      group.stackObservationPositions.push(position);
    }
  }

  return { groups, unidentifiedPositionsByTarget, targetlessObservationCount };
}

/**
 * Rebuilds an `AuraObservation` from the event at a canonical position.
 *
 * `null` when that position does not hold an identifiable aura observation.
 * Nothing is filled in: a missing target or ability id yields `null` rather than
 * a reference to a guessed actor.
 */
export function auraObservationAt(fight: CombatFight, position: number): AuraObservation | null {
  const event = fight.events[position];
  if (event === undefined || event.kind !== "AURA") {
    return null;
  }
  if (event.target === null || event.abilityGameId === null) {
    return null;
  }
  return {
    position,
    locator: event.locator,
    operation: event.operation,
    auraClass: event.auraClass,
    abilityGameId: event.abilityGameId,
    source: event.source,
    target: event.target,
    isStackChange: event.isStackChange,
    observedStacks: event.stacks,
    reportTimeMs: event.reportTimeMs,
    fightTimeMs: event.fightTimeMs,
  };
}
