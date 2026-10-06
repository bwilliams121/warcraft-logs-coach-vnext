/**
 * Actor, ownership and target METADATA (M11-E1). Metadata only.
 *
 * OWNERSHIP. Warcraft Logs' master-data `petOwner` is the ONLY ownership
 * authority. A summon event is recorded as evidence and never creates
 * ownership (owner decision M4); a pet whose owner WCL did not state is never
 * guessed into anyone's view. Whether an owned pet's events "count toward" the
 * owner is a gameplay question this domain does not answer: an owner view is a
 * factual grouping by stated ownership, nothing more.
 *
 * TARGET METADATA. `WCL_BOSS_SUBTYPE` means exactly "the actor is catalogued
 * by Warcraft Logs with subType Boss" — and the `-1` no-actor sentinel, which
 * master data also lists as NPC/Boss, is never it. It does NOT mean hostile,
 * targetable, an encounter member, the current or intended target, or the
 * only enemy. Hostility and targetability are UNKNOWN here, always: no field
 * establishes either (M11-ED/F own those). An NPC is not an enemy.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { CombatActorType } from "../engine/normalization/actors.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";
import { NO_ACTOR_SENTINEL } from "../engine/normalization/raw-event-fields.js";
import { observationsOnly, type ObservedCollection } from "./coverage.js";

export type CatalogKind = CombatActorType | "NOT_IN_CATALOG" | "NO_ACTOR_SENTINEL";

export type OwnershipStatus =
  /** Master data names an owner (`petOwner`). */
  | "OWNER_STATED_BY_WCL"
  /** In the catalog, with no `petOwner`. Not "owns itself"; not anyone's. */
  | "NO_OWNER_STATED"
  | "ACTOR_NOT_IN_CATALOG"
  | "NO_ACTOR_SENTINEL";

export interface Ownership {
  readonly status: OwnershipStatus;
  /** Set exactly when `status` is OWNER_STATED_BY_WCL. */
  readonly ownerActorId: number | null;
}

export interface ActorDescriptor {
  readonly actorId: number;
  readonly catalogKind: CatalogKind;
  readonly rawType: string | null;
  readonly subType: string | null;
  readonly ownership: Ownership;
  /**
   * Observed summon events naming this actor as their target. EVIDENCE only:
   * it never establishes ownership (M4). OBSERVED_ONLY: no claim that there
   * were no other summons.
   */
  readonly summonEvidence: ObservedCollection<EvidenceLocator>;
}

export type BossSubtypeStatus =
  | "WCL_BOSS_SUBTYPE"
  | "NOT_WCL_BOSS_SUBTYPE"
  | "NOT_IN_CATALOG"
  /** The `-1` sentinel — excluded even though master data lists it NPC/Boss. */
  | "NO_ACTOR_SENTINEL";

export interface TargetDescriptor {
  readonly actorId: number;
  readonly catalogKind: CatalogKind;
  readonly rawType: string | null;
  readonly subType: string | null;
  readonly bossSubtype: BossSubtypeStatus;
  /** Never established by this domain. An NPC is not an enemy. */
  readonly hostility: "UNKNOWN";
  /** Never established by this domain. A boss subtype is not attackable. */
  readonly targetability: "UNKNOWN";
}

export function describeActor(fight: CombatFight, actorId: number): ActorDescriptor {
  const summonEvidence: EvidenceLocator[] = [];
  for (const event of fight.events) {
    if (event.kind === "SUMMON" && event.target !== null && event.target.actorId === actorId) {
      summonEvidence.push(event.locator);
    }
  }
  if (actorId === NO_ACTOR_SENTINEL) {
    return {
      actorId,
      catalogKind: "NO_ACTOR_SENTINEL",
      rawType: null,
      subType: null,
      ownership: { status: "NO_ACTOR_SENTINEL", ownerActorId: null },
      summonEvidence: observationsOnly(summonEvidence),
    };
  }
  const actor = fight.actors.get(actorId);
  if (actor === undefined) {
    return {
      actorId,
      catalogKind: "NOT_IN_CATALOG",
      rawType: null,
      subType: null,
      ownership: { status: "ACTOR_NOT_IN_CATALOG", ownerActorId: null },
      summonEvidence: observationsOnly(summonEvidence),
    };
  }
  return {
    actorId,
    catalogKind: actor.actorType,
    rawType: actor.rawType,
    subType: actor.subType,
    ownership:
      actor.petOwnerActorId === null
        ? { status: "NO_OWNER_STATED", ownerActorId: null }
        : { status: "OWNER_STATED_BY_WCL", ownerActorId: actor.petOwnerActorId },
    summonEvidence: observationsOnly(summonEvidence),
  };
}

export function bossSubtypeOf(fight: CombatFight, actorId: number): BossSubtypeStatus {
  if (actorId === NO_ACTOR_SENTINEL) return "NO_ACTOR_SENTINEL";
  const actor = fight.actors.get(actorId);
  if (actor === undefined) return "NOT_IN_CATALOG";
  return actor.subType === "Boss" ? "WCL_BOSS_SUBTYPE" : "NOT_WCL_BOSS_SUBTYPE";
}

export function describeTarget(fight: CombatFight, actorId: number): TargetDescriptor {
  const actor = actorId === NO_ACTOR_SENTINEL ? undefined : fight.actors.get(actorId);
  return {
    actorId,
    catalogKind:
      actorId === NO_ACTOR_SENTINEL
        ? "NO_ACTOR_SENTINEL"
        : actor === undefined
          ? "NOT_IN_CATALOG"
          : actor.actorType,
    rawType: actor?.rawType ?? null,
    subType: actor?.subType ?? null,
    bossSubtype: bossSubtypeOf(fight, actorId),
    hostility: "UNKNOWN",
    targetability: "UNKNOWN",
  };
}

/**
 * The actors whose master data states `owner` as their `petOwner`, in actor-id
 * order. Never includes an actor with no stated owner, one only seen as a
 * summon target, or the owner itself.
 */
export function actorsOwnedBy(fight: CombatFight, ownerActorId: number): readonly number[] {
  const owned: number[] = [];
  for (const [actorId, actor] of fight.actors) {
    if (actorId === NO_ACTOR_SENTINEL) continue;
    if (actor.petOwnerActorId !== null && actor.petOwnerActorId === ownerActorId) owned.push(actorId);
  }
  return owned.sort((left, right) => left - right);
}
