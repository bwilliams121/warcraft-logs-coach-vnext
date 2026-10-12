/**
 * Factual target labels (M11-G2). Metadata about WHO an observed event named
 * as its target — never whether that target could, or should, have been hit.
 *
 *   WCL_BOSS_SUBTYPE          the catalog lists the actor with subType Boss
 *   WCL_ENEMY_NPC_CLASSIFIED  the fight's whole-fight `enemyNPCs` list names
 *                             the actor: participation metadata with NO
 *                             decision-time meaning — never hostile,
 *                             attackable, targetable or an active enemy
 *   OBSERVED_NPC_OTHER        a catalog NPC that is not boss-subtype and not
 *                             ESTABLISHED as enemy-listed — including every
 *                             such NPC when the enemy list is not held (then
 *                             `enemyNpcListed` is UNKNOWN, never NOT_LISTED)
 *   OBSERVED_PLAYER_TARGET    a catalog Player — never an enemy, whatever hit it
 *   OTHER_OBSERVED_TARGET     a pet, an actor outside the catalog, or the
 *                             no-actor sentinel
 *
 * A boss-subtype actor that the enemy list also names keeps the boss label and
 * records the enemy classification beside it; nothing is inferred from either.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import { NO_ACTOR_SENTINEL } from "../engine/normalization/raw-event-fields.js";

export type TargetLabel =
  | "WCL_BOSS_SUBTYPE"
  | "WCL_ENEMY_NPC_CLASSIFIED"
  | "OBSERVED_NPC_OTHER"
  | "OBSERVED_PLAYER_TARGET"
  | "OTHER_OBSERVED_TARGET";

/** The fight's whole-fight enemy NPC list, or why it is not held. */
export type EnemyNpcList =
  | { readonly kind: "RETRIEVED"; readonly actorIds: ReadonlySet<number> }
  | { readonly kind: "NOT_RETRIEVED"; readonly reason: string };

export interface TargetDescription {
  readonly actorId: number;
  readonly label: TargetLabel;
  readonly bossSubtype: boolean;
  /** Whether the whole-fight enemy list names the actor; UNKNOWN when the list is not held. */
  readonly enemyNpcListed: "LISTED" | "NOT_LISTED" | "UNKNOWN";
  readonly gameId: number | null;
  /** Never established here. */
  readonly hostility: "UNKNOWN";
  /** Never established here. */
  readonly targetability: "UNKNOWN";
}

export function describeTargetActor(
  fight: CombatFight,
  actorId: number,
  enemyNpcs: EnemyNpcList,
): TargetDescription {
  const actor = actorId === NO_ACTOR_SENTINEL ? undefined : fight.actors.get(actorId);
  const bossSubtype = actor !== undefined && actor.subType === "Boss";
  const enemyNpcListed =
    enemyNpcs.kind === "NOT_RETRIEVED"
      ? "UNKNOWN"
      : enemyNpcs.actorIds.has(actorId)
        ? "LISTED"
        : "NOT_LISTED";
  let label: TargetLabel;
  if (actor === undefined) label = "OTHER_OBSERVED_TARGET";
  else if (actor.actorType === "PLAYER") label = "OBSERVED_PLAYER_TARGET";
  else if (bossSubtype) label = "WCL_BOSS_SUBTYPE";
  else if (enemyNpcListed === "LISTED" && actor.actorType === "NPC") label = "WCL_ENEMY_NPC_CLASSIFIED";
  else if (actor.actorType === "NPC") label = "OBSERVED_NPC_OTHER";
  else label = "OTHER_OBSERVED_TARGET";
  return {
    actorId,
    label,
    bossSubtype,
    enemyNpcListed,
    gameId: actor?.gameId ?? null,
    hostility: "UNKNOWN",
    targetability: "UNKNOWN",
  };
}
