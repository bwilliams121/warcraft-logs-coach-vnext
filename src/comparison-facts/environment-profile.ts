/**
 * The OBSERVED ENVIRONMENT PROFILE of one fight (M11-G2): post-hoc facts the
 * evidence supports, and nothing more.
 *
 * It is not a model of available targets, attackability or opportunity. A
 * whole-fight enemy list is participation metadata with no decision-time
 * meaning; a target the focus never hit is recorded as exactly that; a
 * death is a POSITIVE fact (M11-F) and no death event never means alive.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import { observedDeathsOf } from "../engine/state/death-state.js";
import { observedActivityOf } from "../combat-facts/activity.js";
import { actorsOwnedBy } from "../combat-facts/descriptors.js";
import type { ActorKey } from "../combat-facts/observations.js";
import { NO_ACTOR_SENTINEL } from "../engine/normalization/raw-event-fields.js";
import { summarizeDamage, type DamageSummary } from "./damage-ledger.js";
import type { EvidenceBasis } from "./evidence-basis.js";
import type { EnemyNpcList } from "./target-classification.js";

export interface EnemyNpcEntry {
  readonly actorId: number;
  readonly gameId: number | null;
  readonly instanceCount: number | null;
}

export type EnemyNpcProfile =
  | {
      readonly kind: "RETRIEVED";
      readonly entries: readonly EnemyNpcEntry[];
      readonly meaning: "WHOLE_FIGHT_PARTICIPATION_METADATA";
    }
  | { readonly kind: "NOT_RETRIEVED"; readonly reason: string };

export interface ActivitySpan {
  readonly actorId: number;
  readonly role: "FOCUS" | "OWNED";
  readonly firstObservedAtMs: number | null;
  readonly lastObservedAtMs: number | null;
  readonly observationCount: number;
}

export interface DeathFact {
  readonly actor: ActorKey;
  readonly reportTimeMs: number;
  readonly killer: ActorKey | "NOT_SUPPLIED";
}

export interface EnvironmentProfile {
  readonly fightStartMs: number;
  readonly fightEndMs: number;
  readonly fightDurationMs: number;
  /** Catalog actors with WCL subType Boss (metadata). */
  readonly bossSubtypeActors: readonly { readonly actorId: number; readonly gameId: number | null }[];
  readonly enemyNpcs: EnemyNpcProfile;
  readonly focusDamage: DamageSummary;
  readonly ownedDamage: DamageSummary;
  /** Enemy-listed actors the focus was never observed hitting: a relationship only. */
  readonly enemyListedNotObservedHitByFocus: readonly number[] | "ENEMY_LIST_NOT_RETRIEVED";
  readonly activitySpans: readonly ActivitySpan[];
  /** Positive deaths of the focus and its owned actors. Absence means nothing. */
  readonly deaths: readonly DeathFact[];
  readonly deathAbsenceSemantics: "NONE";
}

export function buildEnvironmentProfile(
  fight: CombatFight,
  basis: EvidenceBasis,
  focusActorId: number,
  enemyNpcs: EnemyNpcList,
  enemyEntries: readonly EnemyNpcEntry[] | null,
): EnvironmentProfile {
  const window = { startMs: fight.fight.startTimeMs, endMs: fight.fight.endTimeMs };
  const owned = actorsOwnedBy(fight, focusActorId);
  const scope = new Set([focusActorId, ...owned]);
  const focusDamage = summarizeDamage(fight, basis, [focusActorId], window, enemyNpcs);
  const hitByFocus = new Set(focusDamage.participation.items.map((entry) => entry.target.actorId));
  const bossSubtypeActors = [...fight.actors.values()]
    .filter((actor) => actor.actorId !== NO_ACTOR_SENTINEL && actor.subType === "Boss")
    .map((actor) => ({ actorId: actor.actorId, gameId: actor.gameId }))
    .sort((left, right) => left.actorId - right.actorId);
  const spans: ActivitySpan[] = [focusActorId, ...owned].map((actorId) => {
    const extremes = observedActivityOf(fight, actorId).observationExtremes;
    return {
      actorId,
      role: actorId === focusActorId ? "FOCUS" : "OWNED",
      firstObservedAtMs: extremes?.firstObservedAtMs ?? null,
      lastObservedAtMs: extremes?.lastObservedAtMs ?? null,
      observationCount: extremes?.observationCount ?? 0,
    };
  });
  const deaths: DeathFact[] = observedDeathsOf(fight)
    .observed.filter((death) => scope.has(death.actor.actorId))
    .map((death) => ({
      actor: { actorId: death.actor.actorId, instanceId: death.actor.instanceId },
      reportTimeMs: death.reportTimeMs,
      killer:
        death.killer === "NOT_SUPPLIED"
          ? "NOT_SUPPLIED"
          : { actorId: death.killer.actorId, instanceId: death.killer.instanceId },
    }));
  return {
    fightStartMs: fight.fight.startTimeMs,
    fightEndMs: fight.fight.endTimeMs,
    fightDurationMs: fight.fight.durationMs,
    bossSubtypeActors,
    enemyNpcs:
      enemyEntries === null || enemyNpcs.kind === "NOT_RETRIEVED"
        ? {
            kind: "NOT_RETRIEVED",
            reason: enemyNpcs.kind === "NOT_RETRIEVED" ? enemyNpcs.reason : "NO_ENTRIES",
          }
        : { kind: "RETRIEVED", entries: enemyEntries, meaning: "WHOLE_FIGHT_PARTICIPATION_METADATA" },
    focusDamage,
    ownedDamage: summarizeDamage(fight, basis, owned, window, enemyNpcs),
    enemyListedNotObservedHitByFocus:
      enemyNpcs.kind === "NOT_RETRIEVED"
        ? "ENEMY_LIST_NOT_RETRIEVED"
        : [...enemyNpcs.actorIds].filter((actorId) => !hitByFocus.has(actorId)).sort((a, b) => a - b),
    activitySpans: spans,
    deaths,
    deathAbsenceSemantics: "NONE",
  };
}
