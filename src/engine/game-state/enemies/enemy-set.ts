/**
 * The enemy set at a decision (ONB-S3; agent/architecture.md "Owner decision (2026-11-05): ONB-S3
 * enemy-set and target-count model").
 *
 * WHAT THIS ANSWERS. "Which enemy instances does positive evidence place in the encounter at D,
 * and what does that prove about how many there are?" It is gameplay-neutral: it knows no action,
 * class, spell or encounter, and it never decides what a count should mean.
 *
 * MEMBERSHIP NEEDS TWO POSITIVE FACTS, BOTH READ AT OR BEFORE D
 *
 *   Hostile identity. The instance is an NPC in the actor catalog and a friendly player or that
 *   player's pet was observed DAMAGING that exact instance. Whole-fight classification
 *   (`WCL_ENEMY_NPC_CLASSIFIED`) is post-hoc metadata and is never read (N2). This fact says what
 *   the instance IS, not that it is still there, so an earlier hit admits nothing by itself.
 *
 *   Presence at D, one of:
 *     CARRIES_SUBJECT_DEBUFF          the subject's own debuff is ACTIVE on it at D by `presenceAt`:
 *                                     an observed gain carried to D under complete coverage
 *     POSITIVE_HEALTH_SNAPSHOT_AT_D   a damage event stamped in D's own millisecond carries that
 *                                     instance's TARGET-side health above zero
 *
 *   Why a carried debuff is trusted: a demise cancels DoTs (player.cpp:7219-7220), and the audited
 *   whole-fight capture closes them. In b1PmaKrd6CDfzngc fight 48, 1,880 of 1,882 player debuff
 *   tracks on NPC instances end in an observed removal, and the two left open are on the boss at the
 *   end of the capture, so no instance that vanished with no death event keeps a debuff.
 *
 * WHAT NEVER ADMITS AN INSTANCE. Encounter metadata, an earlier appearance, another player's
 * unrelated interaction, a SimulationCraft expectation, a mechanic that normally spawns adds,
 * proximity or a guide. A hit a second before D proves nothing about D.
 *
 * WHAT NEVER REMOVES ONE. Missing events prove no enemy absent, dead, untargetable or out of range.
 * Only positive evidence removes an instance from the set, and then only from the proof: any death
 * event in the resolved prefix for the key, or for a key that may alias it, leaves it out, because a resurrection or a contradiction
 * after it says nothing about life at D. Whole-prefix on purpose: `deathStateAt` reads by report time,
 * so it would admit an event after the boundary in the same millisecond.
 *
 * THE COUNT
 *
 *   Lower bound  the members. Two instance keys are two units only when they can be told apart: a
 *                `null` instance may be the same unit as a numbered instance of its actor, so it
 *                counts only when that actor has no numbered member.
 *   Upper bound  none is ever derived from events, because an enemy nobody touched leaves none.
 *                A caller may supply one with a full citation (Policy B, through the encounter-state
 *                supplier). None is supplied in production: the census holds no row, and no
 *                completeness contract is reviewed (POLB-A), so a real count today is BOUNDED below
 *                or UNKNOWN. A lower bound above a supplied upper bound is a contradiction, which
 *                yields UNKNOWN, never either number. The pinned SimC profile (SIMC-FB-A) supplies no
 *                bound here: this set stays real evidence alone, and that precedence sits above it.
 *
 * PRESENT, TARGETABLE AND IN-RANGE ARE DISTINCT. A member is PRESENT. Neither basis proves the
 * subject could target it (a DoT keeps ticking on an untargetable unit), and range is action-owned,
 * so both stay UNKNOWN here, and an expression needing more than PRESENT must not read this count.
 *
 * NO FUTURE EVIDENCE (O2). Every read stops at the resolved prefix. Appending events after D cannot
 * change the answer. A non-monotonic timeline has no sound prefix of time, so the state is UNKNOWN.
 */

import { fromSource } from "../../auras/aura-state.js";
import type { CombatFight } from "../../normalization/combat-fight.js";
import type { ActorRef, CombatEvent, SourceRef, TargetRef } from "../../normalization/normalized-events.js";
import type { CombatState } from "../../state/combat-state.js";
import type { TemporalPosition } from "../../state/temporal.js";

export type EnemyPresenceBasis = "CARRIES_SUBJECT_DEBUFF" | "POSITIVE_HEALTH_SNAPSHOT_AT_D";

export interface EnemySetMember {
  readonly actor: ActorRef;
  readonly presence: "PRESENT";
  readonly targetable: "UNKNOWN";
  readonly inRange: "UNKNOWN";
  readonly bases: readonly EnemyPresenceBasis[];
  /** The position of the friendly damage event that established hostile identity. */
  readonly hostileIdentityPosition: number;
}

export type EnemySetExclusionReason =
  /** Presence was shown, and no friendly actor was observed damaging this instance by D. */
  | "HOSTILE_IDENTITY_NOT_ESTABLISHED"
  /** A death event for this key is in the prefix, so presence at D is not proven whatever follows it. */
  | "DEATH_EVENT_FOR_KEY"
  /** A death event of a key that may be this same unit. Not proven dead, and not proven present. */
  | "DEATH_EVENT_MAY_ALIAS"
  /** A `null` instance that may be the same unit as a numbered member of its actor. */
  | "NULL_INSTANCE_MAY_ALIAS";

export interface EnemySetExclusion {
  readonly actor: ActorRef;
  readonly reason: EnemySetExclusionReason;
}

/** Mirrors `EnemyCountEvidence` in `src/simc`, which imports nothing from the engine. */
export type EnemySetCount =
  | { readonly kind: "EXACT"; readonly count: number }
  | { readonly kind: "BOUNDED"; readonly lowerBound: number; readonly upperBound: number | null }
  | { readonly kind: "UNKNOWN"; readonly reason: EnemySetUnknownReason };

export type EnemySetUnknownReason =
  | "POSITION_UNRESOLVED"
  | "TIMELINE_NOT_MONOTONIC"
  | "NO_POSITIVE_MEMBER"
  | "UPPER_BOUND_CONTRADICTS_OBSERVED_MEMBERS"
  | "UPPER_BOUND_NOT_A_COUNT"
  | "UPPER_BOUND_WITHOUT_PROVENANCE";

/**
 * Where a curated encounter-state datum came from (POLB-A). Every field is required, because a bound
 * nobody can trace back to retained evidence is not evidence. This layer reads no dataset.
 */
export interface EncounterStateCitation {
  readonly datasetId: string;
  readonly datasetRevision: string;
  readonly datumId: string;
  readonly acquisitionRuleId: string;
  readonly evidencePredicate: string;
  readonly sourceCorpusRevision: string;
  readonly window: string;
  readonly completeness: string;
  readonly sourcePulls: readonly { readonly reportCode: string; readonly fightId: number }[];
}

/** An upper bound from a source other than events. It must say where it came from. */
export interface EnemySetUpperBoundEvidence {
  readonly upperBound: number;
  readonly provenance: EncounterStateCitation;
}

function isCompleteCitation(citation: EncounterStateCitation): boolean {
  return (
    [
      citation.datasetId,
      citation.datasetRevision,
      citation.datumId,
      citation.acquisitionRuleId,
      citation.evidencePredicate,
      citation.sourceCorpusRevision,
      citation.window,
    ].every((field) => field.length > 0) &&
    citation.completeness === "COMPLETE" &&
    citation.sourcePulls.length > 0
  );
}

export interface EnemySetQuery {
  /** The player the decision belongs to. Only this player's debuffs are read as presence. */
  readonly subjectActorId: number;
  readonly at: TemporalPosition;
  readonly upperBound?: EnemySetUpperBoundEvidence;
}

export interface EnemySetState {
  readonly count: EnemySetCount;
  readonly members: readonly EnemySetMember[];
  readonly excluded: readonly EnemySetExclusion[];
  /** Absence of an instance from `members` means nothing about that instance. */
  readonly absenceSemantics: "NONE";
}

function keyOf(actor: ActorRef): string {
  return `${String(actor.actorId)}#${actor.instanceId === null ? "null" : String(actor.instanceId)}`;
}

function sameKey(left: ActorRef, right: ActorRef): boolean {
  return left.actorId === right.actorId && left.instanceId === right.instanceId;
}

function isFriendlyDamageSource(fight: CombatFight, actorId: number): boolean {
  const actor = fight.actors.get(actorId);
  if (actor === undefined) return false;
  if (actor.actorType === "PLAYER") return true;
  if (actor.actorType !== "PET" || actor.petOwnerActorId === null) return false;
  return fight.actors.get(actor.petOwnerActorId)?.actorType === "PLAYER";
}

const HOSTILE_IDENTITY = new WeakMap<CombatFight, ReadonlyMap<string, number>>();

/** Each NPC instance's first friendly damage event, by position. Built once per fight. */
function hostileIdentityIndex(fight: CombatFight): ReadonlyMap<string, number> {
  const cached = HOSTILE_IDENTITY.get(fight);
  if (cached !== undefined) return cached;
  const index = new Map<string, number>();
  fight.events.forEach((event, position) => {
    if (event.kind !== "DAMAGE" || event.source === null || event.target === null) return;
    if (fight.actors.get(event.target.actorId)?.actorType !== "NPC") return;
    if (!isFriendlyDamageSource(fight, event.source.actorId)) return;
    const key = keyOf(event.target);
    if (!index.has(key)) index.set(key, position);
  });
  HOSTILE_IDENTITY.set(fight, index);
  return index;
}

/** One debuff on one NPC instance, as the subject was observed transitioning it. */
interface SubjectDebuffTrack {
  readonly caster: SourceRef;
  readonly target: TargetRef;
  readonly abilityGameId: number;
  readonly firstPosition: number;
}

const SUBJECT_DEBUFFS = new WeakMap<CombatFight, Map<number, readonly SubjectDebuffTrack[]>>();

/** The subject's debuff tracks on NPC instances, by first transition. Built once per subject. */
function subjectDebuffTracks(state: CombatState, subjectActorId: number): readonly SubjectDebuffTrack[] {
  let bySubject = SUBJECT_DEBUFFS.get(state.fight);
  if (bySubject === undefined) {
    bySubject = new Map();
    SUBJECT_DEBUFFS.set(state.fight, bySubject);
  }
  const cached = bySubject.get(subjectActorId);
  if (cached !== undefined) return cached;
  const tracks = new Map<string, SubjectDebuffTrack>();
  for (const position of state.positionsBySourceActor(subjectActorId)) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "AURA" || event.auraClass !== "DEBUFF") continue;
    if (event.source === null || event.target === null || event.abilityGameId === null) continue;
    if (state.fight.actors.get(event.target.actorId)?.actorType !== "NPC") continue;
    const key = `${keyOf(event.source)}|${keyOf(event.target)}|${String(event.abilityGameId)}`;
    if (tracks.has(key)) continue;
    tracks.set(key, {
      caster: event.source,
      target: event.target,
      abilityGameId: event.abilityGameId,
      firstPosition: position,
    });
  }
  const found = [...tracks.values()];
  bySubject.set(subjectActorId, found);
  return found;
}

function positiveTargetHealthOf(event: CombatEvent): ActorRef | null {
  if (event.kind !== "DAMAGE" || event.target === null) return null;
  const snapshot = event.attachedResources;
  if (snapshot === null || snapshot.side !== "TARGET" || snapshot.actor === null) return null;
  if (!sameKey(snapshot.actor, event.target)) return null;
  return snapshot.hitPoints !== null && snapshot.hitPoints > 0 ? event.target : null;
}

/**
 * The strongest death fact in the prefix that can concern this member: its exact key, or a key that
 * may be the same unit, which a `null` instance of its actor may be. Two numbered instances are told
 * apart, so a death of one says nothing about the other.
 */
function deathExclusionOf(
  state: CombatState,
  actor: ActorRef,
  lastIncludedPosition: number,
): EnemySetExclusionReason | null {
  let found: EnemySetExclusionReason | null = null;
  for (const position of state.positionsByTargetActor(actor.actorId)) {
    if (position > lastIncludedPosition) continue;
    const event = state.eventAt(position);
    if (event?.kind !== "DEATH" || event.target === null) continue;
    if (sameKey(event.target, actor)) return "DEATH_EVENT_FOR_KEY";
    if (event.target.instanceId === null || actor.instanceId === null) found = "DEATH_EVENT_MAY_ALIAS";
  }
  return found;
}

function unknownSet(reason: EnemySetUnknownReason): EnemySetState {
  return { count: { kind: "UNKNOWN", reason }, members: [], excluded: [], absenceSemantics: "NONE" };
}

function countOf(lowerBound: number, upper: EnemySetUpperBoundEvidence | undefined): EnemySetCount {
  if (upper === undefined) {
    return lowerBound === 0
      ? { kind: "UNKNOWN", reason: "NO_POSITIVE_MEMBER" }
      : { kind: "BOUNDED", lowerBound, upperBound: null };
  }
  if (!isCompleteCitation(upper.provenance)) {
    return { kind: "UNKNOWN", reason: "UPPER_BOUND_WITHOUT_PROVENANCE" };
  }
  if (!Number.isSafeInteger(upper.upperBound) || upper.upperBound < 0) {
    return { kind: "UNKNOWN", reason: "UPPER_BOUND_NOT_A_COUNT" };
  }
  if (lowerBound > upper.upperBound) {
    return { kind: "UNKNOWN", reason: "UPPER_BOUND_CONTRADICTS_OBSERVED_MEMBERS" };
  }
  if (lowerBound === upper.upperBound) return { kind: "EXACT", count: lowerBound };
  return { kind: "BOUNDED", lowerBound, upperBound: upper.upperBound };
}

/** The enemy set at one position. See the module header for every rule this applies. */
export function enemySetAt(state: CombatState, query: EnemySetQuery): EnemySetState {
  const resolved = state.resolveTemporalPosition(query.at);
  if (!resolved.ok) return unknownSet("POSITION_UNRESOLVED");
  if (state.temporalIntegrity.state !== "MONOTONIC") return unknownSet("TIMELINE_NOT_MONOTONIC");
  const { lastIncludedPosition, boundaryReportTimeMs } = resolved.prefix;
  const { fight } = state;

  // ---- presence at D ----
  const presence = new Map<string, { actor: ActorRef; bases: EnemyPresenceBasis[] }>();
  const notePresence = (actor: ActorRef, basis: EnemyPresenceBasis): void => {
    if (fight.actors.get(actor.actorId)?.actorType !== "NPC") return;
    const key = keyOf(actor);
    const entry = presence.get(key);
    if (entry === undefined) {
      presence.set(key, { actor: { actorId: actor.actorId, instanceId: actor.instanceId }, bases: [basis] });
    } else if (!entry.bases.includes(basis)) {
      entry.bases.push(basis);
    }
  };

  for (const track of subjectDebuffTracks(state, query.subjectActorId)) {
    if (track.firstPosition > lastIncludedPosition) continue;
    const reading = state.auras.presenceAt({
      target: track.target,
      abilityGameId: track.abilityGameId,
      auraClass: "DEBUFF",
      source: fromSource(track.caster),
      at: query.at,
    });
    if (reading.certainty === "EXACT" && reading.value.presence === "ACTIVE") {
      notePresence(track.target, "CARRIES_SUBJECT_DEBUFF");
    }
  }
  for (let position = lastIncludedPosition; position >= 0; position -= 1) {
    const event = state.eventAt(position);
    if (event === null || event.reportTimeMs !== boundaryReportTimeMs) break;
    const alive = positiveTargetHealthOf(event);
    if (alive !== null) notePresence(alive, "POSITIVE_HEALTH_SNAPSHOT_AT_D");
  }

  // ---- identity and lifecycle ----
  const hostile = hostileIdentityIndex(fight);
  const admitted: EnemySetMember[] = [];
  const excluded: EnemySetExclusion[] = [];
  for (const [key, entry] of presence) {
    const identityPosition = hostile.get(key);
    if (identityPosition === undefined || identityPosition > lastIncludedPosition) {
      excluded.push({ actor: entry.actor, reason: "HOSTILE_IDENTITY_NOT_ESTABLISHED" });
      continue;
    }
    const deathExclusion = deathExclusionOf(state, entry.actor, lastIncludedPosition);
    if (deathExclusion !== null) {
      excluded.push({ actor: entry.actor, reason: deathExclusion });
      continue;
    }
    admitted.push({
      actor: entry.actor,
      presence: "PRESENT",
      targetable: "UNKNOWN",
      inRange: "UNKNOWN",
      bases: entry.bases,
      hostileIdentityPosition: identityPosition,
    });
  }

  // ---- distinct units ----
  const numberedActors = new Set(
    admitted.filter((member) => member.actor.instanceId !== null).map((member) => member.actor.actorId),
  );
  const members = admitted.filter((member) => {
    if (member.actor.instanceId !== null || !numberedActors.has(member.actor.actorId)) return true;
    excluded.push({ actor: member.actor, reason: "NULL_INSTANCE_MAY_ALIAS" });
    return false;
  });

  return {
    count: countOf(members.length, query.upperBound),
    members,
    excluded,
    absenceSemantics: "NONE",
  };
}
