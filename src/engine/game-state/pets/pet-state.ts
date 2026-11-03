/**
 * Shared pet actor mapping and pet presence (ONB-S6).
 *
 * WHAT IT ANSWERS
 *
 * For one owner and the pinned SimulationCraft pet entities its
 * specialization declares:
 *
 *     WHICH Warcraft Logs actors are this entity?      its mapping
 *     WAS an instance of it present at instant t?      its presence
 *     HOW MANY instances were present at instant t?    its instance count
 *
 * Shared plumbing only. Nothing here knows a pet. The CALLER — the
 * specialization — supplies a `PetMappingProfile`: each SimulationCraft pet
 * entity it reads, the Warcraft Logs `gameID`s that entity is, and what its
 * reviewed game data proves about one instance's life. What `pet.X.active`,
 * a pet count or a pet-scoped buff MEANS in its APL stays the
 * specialization's; this file owns only the mapping and the fail-closed rules.
 *
 * OWNERSHIP
 *
 * An actor is the owner's pet only when Warcraft Logs master data states it
 * (`petOwner`, carried as `petOwnerActorId`). Never inferred from a summon
 * event's source, a name, timing or proximity (`actors.ts`). A catalog actor
 * of a mapped `gameID` whose owner Warcraft Logs did NOT state could be the
 * owner's, so it blocks every absence claim and every count ceiling for that
 * entity. An owned actor with no `gameID` could be any entity, so it blocks
 * them for every entity.
 *
 * MAPPING
 *
 * An entity maps to the owned actors whose `gameID` it lists. Two entities
 * listing one `gameID` cannot be told apart from the log (the retained Rune
 * Weapon is one actor for several engine pets, follow-ups "After M11-G3-1"),
 * so BOTH are `AMBIGUOUS` and every question about them is UNKNOWN. Never a
 * guess at which one an actor is.
 *
 * NO FUTURE EVIDENCE (owner decision O2)
 *
 * Every answer about instant t reads only events stamped at or before t. An
 * observation after t can never raise, or otherwise change, the answer at t.
 * So no "seen before and after t, therefore present throughout" bracketing.
 *
 * THROUGHOUT THE MILLISECOND t
 *
 * Same-millisecond order is not proven (M11-G2), and a decision at t may sit
 * before or after a summon stamped t. Every answer holds whatever that order.
 *
 * PRESENT
 *
 * Instance identity is the full ActorRef (`instanceId: null` is not 0). An
 * instance is PRESENT at t only when:
 *
 *     the profile pins a minimum lifetime L (the instance cannot end sooner)
 *     its single summon at or before t lies strictly before t
 *     t < summon + L
 *     no positive death of it lies in [summon, t]
 *     its identity is settled up to t: one summon, no cast it sources before
 *       that summon or after summon + the maximum lifetime, and no null
 *       instance id beside numbered ones on the same actor
 *
 * A cast or damage it sources never proves presence on its own: dead NPCs
 * source delayed damage for up to 32 s (the M11-ED audit, `death-state.ts`),
 * and a cast proves only its own millisecond. A death never proves absence:
 * a resurrection is not decoded here.
 *
 * NOT_PRESENT AND COUNT CEILINGS: NO UNOBSERVED INSTANCE
 *
 * With a maximum lifetime D, an instance present at t was summoned in
 * [t − D, t]. Absence and a count ceiling need every such summon to have been
 * seen:
 *
 *     the profile pins that every instance begins with a summon event
 *     the profile pins a maximum lifetime D
 *     t − D is not before the pull (no pre-pull instance can reach t)
 *     SUMMONS coverage is COMPLETE over [t − D, t] for the owner and every
 *       mapped actor
 *     no summon the owner sourced in that window targets an actor with no
 *       usable catalog `gameID`
 *     no unstated-owner or `gameID`-less candidate (OWNERSHIP above)
 *     no cast at or before t contradicts D (a cast by a key with no summon of
 *       it in the D before, where that stretch is after the pull and fully
 *       covered)
 *     the fight's canonical order is ordered by time (else every answer,
 *       PRESENT included, is NON_MONOTONIC_TIME)
 *
 * Then a key with no summon in [t − D, t] is NOT_PRESENT, and the entity is
 * NOT_PRESENT when no key has one.
 */

import { inclusiveRange } from "../../evidence/coverage.js";
import type { EvidenceLocator } from "../../evidence/locator.js";
import type { CombatActor } from "../../normalization/actors.js";
import type { ActorRef } from "../../normalization/normalized-events.js";
import type { CombatState } from "../../state/combat-state.js";
import { gateAbsenceClaim, type UnknownReason } from "../../state/state-result.js";
import { isMonotonic } from "../../state/temporal.js";

// ---------------------------------------------------------------------------
// The caller's profile
// ---------------------------------------------------------------------------

/** One pinned SimulationCraft pet entity, as the specialization's reviewed data states it. */
export interface PetEntityDefinition {
  /** The entity's name as the pinned APL addresses it, e.g. the `X` of `pet.X.active`. */
  readonly simcName: string;
  /** The Warcraft Logs `ReportActor.gameID`s this entity is. At least one. */
  readonly wclGameIds: readonly number[];
  /**
   * A PROVEN lower bound on one instance's life from its summon, in ms: the
   * instance cannot be killed, dismissed or otherwise end sooner. `null` when
   * none is proven, and then nothing is ever PRESENT.
   */
  readonly minLifetimeMs: number | null;
  /**
   * A PROVEN upper bound on one instance's life from its summon, in ms, every
   * extension included, or `null` when none is proven. A guessed bound is
   * worse than none: absence claims act on it.
   */
  readonly maxLifetimeMs: number | null;
  /** Reviewed: every instance of this entity begins with a Warcraft Logs `summon` event. */
  readonly instancesBeginWithSummon: boolean;
  /** Where the facts above come from. Recorded, never read. */
  readonly provenance: string;
}

export interface PetMappingProfile {
  /** The specialization that owns these entities. Recorded, never branched on. */
  readonly ownerSpecId: string;
  readonly entities: readonly PetEntityDefinition[];
}

export type PetProfileDefect =
  | "NO_OWNER"
  | "MALFORMED_SIMC_NAME"
  | "DUPLICATE_SIMC_NAME"
  | "NO_GAME_ID"
  | "MALFORMED_GAME_ID"
  | "MALFORMED_LIFETIME";

export class PetProfileError extends Error {
  readonly defect: PetProfileDefect;
  readonly simcName: string | null;

  constructor(defect: PetProfileDefect, simcName: string | null, detail: string) {
    super(`Pet mapping profile rejected (${defect}): ${detail}`);
    this.name = "PetProfileError";
    this.defect = defect;
    this.simcName = simcName;
  }
}

const SIMC_NAME = /^[a-z_][a-z0-9_]*$/;

function validLifetime(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value > 0);
}

/**
 * Builds a frozen profile, or throws.
 *
 * A profile is a build constant, so a malformed one must fail to load rather
 * than silently map less than it claims. Two entities sharing a `gameID` is
 * NOT a defect: it is a real property of some logs, reported as AMBIGUOUS.
 */
export function definePetMappingProfile(
  ownerSpecId: string,
  entities: readonly PetEntityDefinition[],
): PetMappingProfile {
  if (ownerSpecId.length === 0) {
    throw new PetProfileError("NO_OWNER", null, "a profile must name its owning specialization");
  }
  const seen = new Set<string>();
  const frozen = entities.map((entity) => {
    const { simcName } = entity;
    if (!SIMC_NAME.test(simcName)) {
      throw new PetProfileError(
        "MALFORMED_SIMC_NAME",
        simcName,
        `'${simcName}' is not a SimulationCraft pet name`,
      );
    }
    if (seen.has(simcName)) {
      throw new PetProfileError("DUPLICATE_SIMC_NAME", simcName, `'${simcName}' is declared twice`);
    }
    seen.add(simcName);
    if (entity.wclGameIds.length === 0) {
      throw new PetProfileError("NO_GAME_ID", simcName, `'${simcName}' maps to no Warcraft Logs gameID`);
    }
    if (entity.wclGameIds.some((gameId) => !Number.isSafeInteger(gameId) || gameId <= 0)) {
      throw new PetProfileError(
        "MALFORMED_GAME_ID",
        simcName,
        `'${simcName}' lists a gameID no actor could have`,
      );
    }
    const { minLifetimeMs, maxLifetimeMs } = entity;
    if (
      !validLifetime(minLifetimeMs) ||
      !validLifetime(maxLifetimeMs) ||
      (minLifetimeMs !== null && maxLifetimeMs !== null && minLifetimeMs > maxLifetimeMs)
    ) {
      throw new PetProfileError(
        "MALFORMED_LIFETIME",
        simcName,
        `'${simcName}' has lifetime bounds that are not positive and ordered`,
      );
    }
    return Object.freeze({
      simcName,
      wclGameIds: Object.freeze([...new Set(entity.wclGameIds)].sort((left, right) => left - right)),
      minLifetimeMs,
      maxLifetimeMs,
      instancesBeginWithSummon: entity.instancesBeginWithSummon,
      provenance: entity.provenance,
    });
  });
  return Object.freeze({ ownerSpecId, entities: Object.freeze(frozen) });
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Why a pet question could not be answered. Each is a different remedy. */
export type PetStateUnknownReason =
  /** The profile declares no entity of this name. */
  | "ENTITY_NOT_DECLARED"
  /** Another declared entity lists one of this entity's gameIDs. */
  | "ENTITY_MAPPING_AMBIGUOUS"
  /** The owner is not in the fight's actor catalog. */
  | "OWNER_NOT_IN_CATALOG"
  /** The instant lies outside the fight. */
  | "OUTSIDE_FIGHT"
  /** A candidate whose owner Warcraft Logs did not state, or a summon target with no usable gameID. */
  | "OWNERSHIP_NOT_STATED"
  /** Two summons of one instance key in the window: how many lives it holds is not settled. */
  | "INSTANCE_IDENTITY_AMBIGUOUS"
  /** The profile does not pin that every instance begins with a summon event. */
  | "INSTANCE_START_NOT_PINNED"
  /** The profile pins no maximum lifetime. */
  | "LIFETIME_BOUND_NOT_PINNED"
  /** An observed cast contradicts the profile's maximum lifetime. */
  | "LIFETIME_BOUND_CONTRADICTED"
  /** An instance summoned before the pull could still be present. */
  | "PRE_PULL_INSTANCE_POSSIBLE"
  /** An instance summoned in the window is neither proven present nor proven gone. */
  | "PRESENCE_NOT_ESTABLISHED"
  /** A summon-coverage, scope or ordering condition from the shared gate. */
  | UnknownReason;

/** What the evidence up to t proves about one instance key at t. */
export type InstancePresence =
  | { readonly state: "PRESENT"; readonly locators: readonly EvidenceLocator[] }
  | { readonly state: "NOT_PRESENT" }
  | { readonly state: "POSSIBLE" };

export type PetPresence =
  | { readonly state: "PRESENT"; readonly locators: readonly EvidenceLocator[] }
  | { readonly state: "NOT_PRESENT" }
  | { readonly state: "UNKNOWN"; readonly reason: PetStateUnknownReason };

/**
 * How many instances were present. `atMost: null` means no upper bound is
 * proven. EXACT only when no unobserved instance is possible and every
 * candidate is decided.
 */
export type PetInstanceCount =
  | { readonly kind: "EXACT"; readonly value: number }
  | {
      readonly kind: "BOUNDED";
      readonly atLeast: number;
      readonly atMost: number | null;
      readonly reason: PetStateUnknownReason;
    }
  | { readonly kind: "UNKNOWN"; readonly reason: PetStateUnknownReason };

export type PetInstancesAt =
  | {
      readonly state: "OBSERVED_KEYS";
      /** Every key with an observation at or before t. */
      readonly instances: readonly { readonly key: ActorRef; readonly presence: InstancePresence }[];
      /** Why the list may be incomplete, or `null`. While it is set no key is NOT_PRESENT. */
      readonly unobservedKeysPossible: PetStateUnknownReason | null;
    }
  | { readonly state: "UNKNOWN"; readonly reason: PetStateUnknownReason };

/** One observed instance key of a mapped actor, over the whole fight. Facts, not presence. */
export interface PetInstanceFacts {
  readonly key: ActorRef;
  readonly summonTimesMs: readonly number[];
  /** Casts (begin or completion) the key sources. */
  readonly castTimesMs: readonly number[];
  /** Positive deaths of the key. They end PRESENT; they never prove absence. */
  readonly deathTimesMs: readonly number[];
}

export type PetEntityMapping =
  | {
      readonly simcName: string;
      readonly status: "MAPPED";
      /** Owned actors (WCL `petOwner`) whose gameID the entity lists. May be empty. */
      readonly actorIds: readonly number[];
      readonly instances: readonly PetInstanceFacts[];
      /** Catalog actors of a listed gameID whose owner Warcraft Logs did not state. */
      readonly unstatedOwnerCandidateIds: readonly number[];
    }
  | {
      readonly simcName: string;
      readonly status: "AMBIGUOUS";
      /** The other entities listing one of this entity's gameIDs. */
      readonly sharedWith: readonly string[];
      readonly actorIds: readonly number[];
    };

export interface PetState {
  readonly ownerActorId: number;
  readonly ownerSpecId: string;
  readonly ownerInCatalog: boolean;
  readonly entities: readonly PetEntityMapping[];
  /** Owned actors no declared entity lists. Disclosed, never assigned. */
  readonly unclassifiedOwnedActorIds: readonly number[];
  /** Owned actors with no gameID: they could be any entity. */
  readonly ownedActorsWithoutGameId: readonly number[];

  mappingOf(simcName: string): PetEntityMapping | null;
  /**
   * Every key of a mapped entity observed at or before t, with its presence.
   * For pet-scoped aura reads, the caller queries `state.auras` with these
   * keys.
   */
  instancesAt(simcName: string, reportTimeMs: number): PetInstancesAt;
  presenceAt(simcName: string, reportTimeMs: number): PetPresence;
  instanceCountAt(simcName: string, reportTimeMs: number): PetInstanceCount;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

interface Stamp {
  readonly t: number;
  readonly locator: EvidenceLocator;
}

interface InstanceEvidence {
  readonly key: ActorRef;
  readonly summons: Stamp[];
  readonly casts: Stamp[];
  readonly deaths: number[];
}

interface InternalEntity {
  readonly definition: PetEntityDefinition;
  readonly mapping: PetEntityMapping;
  readonly instances: readonly InstanceEvidence[];
}

export interface PetStateInput {
  readonly state: CombatState;
  readonly ownerActorId: number;
  readonly profile: PetMappingProfile;
}

function keyString(key: ActorRef): string {
  return `${String(key.actorId)}:${key.instanceId === null ? "null" : String(key.instanceId)}`;
}

function sortedUnique(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

const POSSIBLE: InstancePresence = Object.freeze({ state: "POSSIBLE" });
const NOT_PRESENT: InstancePresence = Object.freeze({ state: "NOT_PRESENT" });

export function buildPetState(input: PetStateInput): PetState {
  const { state, ownerActorId, profile } = input;
  const { fight } = state;
  const catalog: ReadonlyMap<number, CombatActor> = fight.actors;
  const ownerInCatalog = catalog.has(ownerActorId);

  const owned = [...catalog.values()].filter((actor) => actor.petOwnerActorId === ownerActorId);
  const ownedActorsWithoutGameId = sortedUnique(
    owned.filter((actor) => actor.gameId === null).map((actor) => actor.actorId),
  );

  const claimants = new Map<number, string[]>();
  for (const entity of profile.entities) {
    for (const gameId of entity.wclGameIds) {
      claimants.set(gameId, [...(claimants.get(gameId) ?? []), entity.simcName]);
    }
  }
  const unclassifiedOwnedActorIds = sortedUnique(
    owned
      .filter((actor) => actor.gameId !== null && !claimants.has(actor.gameId))
      .map((actor) => actor.actorId),
  );

  // One pass over the fight for every owned actor's instance evidence.
  const ownedIds = new Set(owned.map((actor) => actor.actorId));
  const byKey = new Map<string, InstanceEvidence>();
  const evidenceOf = (key: ActorRef): InstanceEvidence => {
    const id = keyString(key);
    let entry = byKey.get(id);
    if (entry === undefined) {
      entry = {
        key: { actorId: key.actorId, instanceId: key.instanceId },
        summons: [],
        casts: [],
        deaths: [],
      };
      byKey.set(id, entry);
    }
    return entry;
  };
  for (const event of fight.events) {
    if (event.kind === "SUMMON" && event.target !== null && ownedIds.has(event.target.actorId)) {
      evidenceOf(event.target).summons.push({ t: event.reportTimeMs, locator: event.locator });
    } else if (event.kind === "CAST" && event.source !== null && ownedIds.has(event.source.actorId)) {
      evidenceOf(event.source).casts.push({ t: event.reportTimeMs, locator: event.locator });
    } else if (event.kind === "DEATH" && event.target !== null && ownedIds.has(event.target.actorId)) {
      evidenceOf(event.target).deaths.push(event.reportTimeMs);
    }
  }
  for (const entry of byKey.values()) {
    entry.summons.sort((left, right) => left.t - right.t);
    entry.casts.sort((left, right) => left.t - right.t);
    entry.deaths.sort((left, right) => left - right);
  }

  const entities: InternalEntity[] = profile.entities.map((definition) => {
    const sharedWith = [
      ...new Set(
        definition.wclGameIds
          .flatMap((gameId) => claimants.get(gameId) ?? [])
          .filter((name) => name !== definition.simcName),
      ),
    ].sort();
    const listed = new Set(definition.wclGameIds);
    const actorIds = sortedUnique(
      owned
        .filter((actor) => actor.gameId !== null && listed.has(actor.gameId))
        .map((actor) => actor.actorId),
    );
    if (sharedWith.length > 0) {
      return {
        definition,
        mapping: { simcName: definition.simcName, status: "AMBIGUOUS", sharedWith, actorIds },
        instances: [],
      };
    }
    const unstatedOwnerCandidateIds = sortedUnique(
      [...catalog.values()]
        .filter(
          (actor) => actor.petOwnerActorId === null && actor.gameId !== null && listed.has(actor.gameId),
        )
        .map((actor) => actor.actorId),
    );
    const actorSet = new Set(actorIds);
    const instances = [...byKey.values()]
      .filter((entry) => actorSet.has(entry.key.actorId))
      .sort(
        (left, right) =>
          left.key.actorId - right.key.actorId || (left.key.instanceId ?? -1) - (right.key.instanceId ?? -1),
      );
    return {
      definition,
      mapping: {
        simcName: definition.simcName,
        status: "MAPPED",
        actorIds,
        instances: instances.map((entry) => ({
          key: entry.key,
          summonTimesMs: entry.summons.map((stamp) => stamp.t),
          castTimesMs: entry.casts.map((stamp) => stamp.t),
          deathTimesMs: [...entry.deaths],
        })),
        unstatedOwnerCandidateIds,
      },
      instances,
    };
  });

  const byName = new Map(entities.map((entity) => [entity.definition.simcName, entity]));
  const monotonic = isMonotonic(state.indexes.temporalIntegrity);
  const fightStart = fight.fight.startTimeMs;
  const fightEnd = fight.fight.endTimeMs;

  function summonsCovered(range: ReturnType<typeof inclusiveRange>, actorIds: readonly number[]) {
    for (const actorId of [ownerActorId, ...actorIds]) {
      const gate = gateAbsenceClaim({
        completeness: fight.completeness,
        category: "SUMMONS",
        range,
        actorId,
      });
      if (!gate.ok) return gate;
    }
    return { ok: true as const };
  }

  /** Why an unobserved instance may exist at t, or `null` when none can. Reads nothing after t. */
  function unobservedInstanceBlocker(entity: InternalEntity, t: number): PetStateUnknownReason | null {
    const { definition, mapping } = entity;
    if (mapping.status !== "MAPPED") return "ENTITY_MAPPING_AMBIGUOUS";
    if (mapping.unstatedOwnerCandidateIds.length > 0 || ownedActorsWithoutGameId.length > 0) {
      return "OWNERSHIP_NOT_STATED";
    }
    if (!definition.instancesBeginWithSummon) return "INSTANCE_START_NOT_PINNED";
    const lifetime = definition.maxLifetimeMs;
    if (lifetime === null) return "LIFETIME_BOUND_NOT_PINNED";
    const from = t - lifetime;
    if (from < fightStart) return "PRE_PULL_INSTANCE_POSSIBLE";
    const window = summonsCovered(inclusiveRange(from, t), mapping.actorIds);
    if (!window.ok) return window.reason;
    for (const position of state.positionsOfKind("SUMMON")) {
      const event = state.eventAt(position);
      if (event === null || event.kind !== "SUMMON") continue;
      if (event.reportTimeMs < from || event.reportTimeMs > t) continue;
      if (event.source?.actorId !== ownerActorId) continue;
      const target = event.target === null ? undefined : catalog.get(event.target.actorId);
      if (target === undefined || target.gameId === null) return "OWNERSHIP_NOT_STATED";
    }
    // A cast at c, by a key with no summon of it in [c − D, c], where that
    // stretch is after the pull and fully covered, is a life longer than D.
    for (const entry of entity.instances) {
      for (const cast of entry.casts) {
        if (cast.t > t) break;
        const start = cast.t - lifetime;
        if (start < fightStart) continue;
        if (entry.summons.some((summon) => summon.t >= start && summon.t <= cast.t)) continue;
        if (summonsCovered(inclusiveRange(start, cast.t), [entry.key.actorId]).ok) {
          return "LIFETIME_BOUND_CONTRADICTED";
        }
      }
    }
    return null;
  }

  function guard(
    simcName: string,
    t: number,
  ): { entity: InternalEntity } | { reason: PetStateUnknownReason } {
    const entity = byName.get(simcName);
    if (entity === undefined) return { reason: "ENTITY_NOT_DECLARED" };
    if (entity.mapping.status !== "MAPPED") return { reason: "ENTITY_MAPPING_AMBIGUOUS" };
    if (!ownerInCatalog) return { reason: "OWNER_NOT_IN_CATALOG" };
    if (!Number.isFinite(t) || t < fightStart || t > fightEnd) return { reason: "OUTSIDE_FIGHT" };
    // Every answer is timestamp-addressed, positive ones included, so an
    // unordered canonical sequence refuses all of them (`temporal.ts`).
    if (!monotonic) return { reason: "NON_MONOTONIC_TIME" };
    return { entity };
  }

  interface KeyAt {
    readonly key: ActorRef;
    readonly presence: InstancePresence;
    /** Summons of this key in [t − D, t]; empty when D is not pinned. */
    readonly windowSummons: number;
  }

  /** Every key observed at or before t, read from the prefix only. */
  function read(entity: InternalEntity, t: number) {
    const { definition } = entity;
    const blocker = unobservedInstanceBlocker(entity, t);
    const seen = entity.instances.filter(
      (entry) =>
        (entry.summons[0]?.t ?? Infinity) <= t ||
        (entry.casts[0]?.t ?? Infinity) <= t ||
        (entry.deaths[0] ?? Infinity) <= t,
    );
    const mixedActors = new Set(
      seen
        .filter((entry) => entry.key.instanceId === null)
        .map((entry) => entry.key.actorId)
        .filter((actorId) =>
          seen.some((other) => other.key.actorId === actorId && other.key.instanceId !== null),
        ),
    );
    const max = definition.maxLifetimeMs;
    const keys: KeyAt[] = seen.map((entry) => {
      const summons = entry.summons.filter((summon) => summon.t <= t);
      const windowSummons = max === null ? 0 : summons.filter((summon) => summon.t >= t - max).length;
      const presence = presenceOfKey(entry, definition, t, summons, mixedActors.has(entry.key.actorId));
      return {
        key: entry.key,
        windowSummons,
        presence:
          presence.state === "PRESENT"
            ? presence
            : blocker === null && windowSummons === 0
              ? NOT_PRESENT
              : POSSIBLE,
      };
    });
    return { blocker, keys };
  }

  function presenceAt(simcName: string, t: number): PetPresence {
    const guarded = guard(simcName, t);
    if ("reason" in guarded) return { state: "UNKNOWN", reason: guarded.reason };
    const { blocker, keys } = read(guarded.entity, t);
    const present = keys.flatMap((key) => (key.presence.state === "PRESENT" ? key.presence.locators : []));
    if (present.length > 0) return { state: "PRESENT", locators: present };
    if (blocker !== null) return { state: "UNKNOWN", reason: blocker };
    if (keys.some((key) => key.presence.state === "POSSIBLE")) {
      return { state: "UNKNOWN", reason: "PRESENCE_NOT_ESTABLISHED" };
    }
    return { state: "NOT_PRESENT" };
  }

  function instanceCountAt(simcName: string, t: number): PetInstanceCount {
    const guarded = guard(simcName, t);
    if ("reason" in guarded) return { kind: "UNKNOWN", reason: guarded.reason };
    const { blocker, keys } = read(guarded.entity, t);
    const atLeast = keys.filter((key) => key.presence.state === "PRESENT").length;
    if (blocker !== null) return { kind: "BOUNDED", atLeast, atMost: null, reason: blocker };
    if (keys.some((key) => key.windowSummons > 1)) {
      return { kind: "BOUNDED", atLeast, atMost: null, reason: "INSTANCE_IDENTITY_AMBIGUOUS" };
    }
    // Every key that may be present has a summon in the window; a null key
    // beside numbered ones may double count, which only widens the ceiling.
    const possible = keys.filter((key) => key.presence.state === "POSSIBLE").length;
    if (possible === 0) return { kind: "EXACT", value: atLeast };
    return { kind: "BOUNDED", atLeast, atMost: atLeast + possible, reason: "PRESENCE_NOT_ESTABLISHED" };
  }

  return {
    ownerActorId,
    ownerSpecId: profile.ownerSpecId,
    ownerInCatalog,
    entities: entities.map((entity) => entity.mapping),
    unclassifiedOwnedActorIds,
    ownedActorsWithoutGameId,
    mappingOf: (simcName) => byName.get(simcName)?.mapping ?? null,
    instancesAt(simcName, t) {
      const guarded = guard(simcName, t);
      if ("reason" in guarded) return { state: "UNKNOWN", reason: guarded.reason };
      const { blocker, keys } = read(guarded.entity, t);
      return {
        state: "OBSERVED_KEYS",
        instances: keys.map(({ key, presence }) => ({ key, presence })),
        unobservedKeysPossible: blocker,
      };
    },
    presenceAt,
    instanceCountAt,
  };
}

/**
 * PRESENT for one key at t from its single summon and the minimum lifetime,
 * reading only what was observed at or before t; otherwise POSSIBLE (the
 * caller decides NOT_PRESENT).
 */
function presenceOfKey(
  entry: InstanceEvidence,
  definition: PetEntityDefinition,
  t: number,
  summonsUpToT: readonly Stamp[],
  mixedNullInstance: boolean,
): InstancePresence {
  const min = definition.minLifetimeMs;
  if (min === null || mixedNullInstance || summonsUpToT.length !== 1) return POSSIBLE;
  const summon = summonsUpToT[0] as Stamp;
  if (!(summon.t < t && t < summon.t + min)) return POSSIBLE;
  if (entry.deaths.some((death) => death >= summon.t && death <= t)) return POSSIBLE;
  const max = definition.maxLifetimeMs;
  const castsUpToT = entry.casts.filter((cast) => cast.t <= t);
  if (castsUpToT.some((cast) => cast.t < summon.t || (max !== null && cast.t > summon.t + max))) {
    return POSSIBLE;
  }
  return { state: "PRESENT", locators: [summon.locator] };
}
