/**
 * The factual SUB-ACTOR TREE (M11-G2), rooted at the focus player.
 *
 * Direct children are exactly the actors whose Warcraft Logs master-data
 * `petOwner` is the focus — never inferred from summon events, never a pet's
 * pet, never another player's pet, never an actor id a caller supplies. A
 * child's KIND comes from its catalog gameID via the specialization's
 * definition; an unlisted gameID stays in the tree as UNCLASSIFIED.
 *
 * Instances are the ActorKeys observed for the child. A summon event is kept
 * as an observation (who summoned which instance, with which ability) and
 * establishes nothing about ownership. An instance is related to cooldown
 * windows only by its observed activity span:
 *
 *   WITHIN_ONE_WINDOW                    the span lies inside one window whose
 *                                        start and end were both observed
 *   OVERLAPS_ONE_WINDOW_PARTIALLY        it overlaps exactly one, not inside it
 *   OVERLAPS_SEVERAL_WINDOWS             it overlaps more than one
 *   AMBIGUOUS_WINDOW_BOUND_NOT_OBSERVED  a window it might overlap has an
 *                                        unobserved bound
 *   NO_OVERLAP_WITH_AN_OBSERVED_WINDOW   disjoint from every observed window
 *   NO_OBSERVED_ACTIVITY
 *
 * Nothing here classifies a child as player-controlled, environmental, RNG
 * or execution (a later causal layer).
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { Proven } from "../combat-facts/coverage.js";
import { actorsOwnedBy } from "../combat-facts/descriptors.js";
import { observedActivityOf } from "../combat-facts/activity.js";
import { actorKeyString, compareActorKeys, type ActorKey } from "../combat-facts/observations.js";
import type { RawFieldSum } from "../combat-facts/window-query.js";
import { castsFrom } from "./cast-facts.js";
import type { CooldownWindow } from "./cooldown-windows.js";
import { damageFrom, summarizeDamage, type DamageSummary } from "./damage-ledger.js";
import {
  collectionUnder,
  countUnder,
  factStateOf,
  rawAmountFieldSumUnder,
  type EvidenceBasis,
  type FactCollection,
} from "./evidence-basis.js";
import { describeTargetActor, type EnemyNpcList } from "./target-classification.js";

export interface SubActorKindDefinition {
  readonly kind: string;
  readonly gameIds: readonly number[];
}

export type WindowAssociation =
  | { readonly kind: "WITHIN_ONE_WINDOW"; readonly windowIndex: number }
  | { readonly kind: "OVERLAPS_ONE_WINDOW_PARTIALLY"; readonly windowIndex: number }
  | { readonly kind: "OVERLAPS_SEVERAL_WINDOWS"; readonly windowIndices: readonly number[] }
  | { readonly kind: "AMBIGUOUS_WINDOW_BOUND_NOT_OBSERVED"; readonly windowIndices: readonly number[] }
  | { readonly kind: "NO_OVERLAP_WITH_AN_OBSERVED_WINDOW" }
  | { readonly kind: "NO_OBSERVED_ACTIVITY" };

export interface SummonObservation {
  readonly reportTimeMs: number;
  readonly instance: ActorKey;
  /** The summon event's source, verbatim; never an ownership claim. */
  readonly summonSource: ActorKey | null;
  readonly abilityGameId: number | null;
}

export interface SubActorInstanceFacts {
  readonly key: ActorKey;
  readonly firstObservedAtMs: number;
  readonly lastObservedAtMs: number;
  readonly damageEventCount: Proven<number>;
  readonly castCompleteEventCount: Proven<number>;
  readonly rawAmountFieldSum: Proven<RawFieldSum>;
  readonly distinctTargets: Proven<number>;
  /** Damage events against a WCL boss-subtype target vs every other observed target. */
  readonly bossSubtypeTargetEvents: Proven<number>;
  readonly otherTargetEvents: Proven<number>;
  readonly windowAssociation: WindowAssociation;
}

export interface SubActorNode {
  readonly actorId: number;
  readonly gameId: number | null;
  readonly kind: string;
  readonly ownershipAuthority: "WCL_PET_OWNER";
  readonly ownerActorId: number;
  readonly instances: FactCollection<SubActorInstanceFacts>;
  /** Positive observations only. */
  readonly summons: FactCollection<SummonObservation>;
  readonly activity: { readonly firstObservedAtMs: number; readonly lastObservedAtMs: number } | null;
  readonly castCompleteEventCount: Proven<number>;
  readonly damage: DamageSummary;
}

export interface SubActorTree {
  readonly rootActorId: number;
  readonly ownershipAuthority: "WCL_PET_OWNER";
  readonly children: readonly SubActorNode[];
}

const UNCLASSIFIED = "UNCLASSIFIED_OWNED_ACTOR";

function associationOf(
  span: { first: number; last: number } | null,
  windows: readonly CooldownWindow[],
): WindowAssociation {
  if (span === null) return { kind: "NO_OBSERVED_ACTIVITY" };
  const overlapping: number[] = [];
  const unknown: number[] = [];
  let inside: number | null = null;
  for (const window of windows) {
    const start = window.start.kind === "OBSERVED" ? window.start.reportTimeMs : null;
    const end = window.end.kind === "OBSERVED" ? window.end.reportTimeMs : null;
    const mayOverlap = (start === null || span.last >= start) && (end === null || span.first <= end);
    if (!mayOverlap) continue;
    if (start === null || end === null) {
      unknown.push(window.index);
      continue;
    }
    overlapping.push(window.index);
    if (span.first >= start && span.last <= end) inside = window.index;
  }
  if (unknown.length > 0)
    return {
      kind: "AMBIGUOUS_WINDOW_BOUND_NOT_OBSERVED",
      windowIndices: [...unknown, ...overlapping].sort((a, b) => a - b),
    };
  if (overlapping.length === 0) return { kind: "NO_OVERLAP_WITH_AN_OBSERVED_WINDOW" };
  if (overlapping.length > 1) return { kind: "OVERLAPS_SEVERAL_WINDOWS", windowIndices: overlapping };
  const only = overlapping[0] as number;
  return inside === only
    ? { kind: "WITHIN_ONE_WINDOW", windowIndex: only }
    : { kind: "OVERLAPS_ONE_WINDOW_PARTIALLY", windowIndex: only };
}

export function buildSubActorTree(
  fight: CombatFight,
  basis: EvidenceBasis,
  focusActorId: number,
  kinds: readonly SubActorKindDefinition[],
  windows: readonly CooldownWindow[],
  enemyNpcs: EnemyNpcList,
): SubActorTree {
  const fightWindow = { startMs: fight.fight.startTimeMs, endMs: fight.fight.endTimeMs };
  const children = actorsOwnedBy(fight, focusActorId).map((actorId): SubActorNode => {
    const actor = fight.actors.get(actorId);
    const gameId = actor?.gameId ?? null;
    const kind =
      kinds.find((entry) => gameId !== null && entry.gameIds.includes(gameId))?.kind ?? UNCLASSIFIED;
    const state = factStateOf(fight, basis, ["DAMAGE", "CASTS"], fightWindow, [actorId]);
    const activity = observedActivityOf(fight, actorId);

    // Instances: every ActorKey observed for this actor, with its own span.
    const spans = new Map<string, { key: ActorKey; first: number; last: number }>();
    for (const observation of activity.observations.items) {
      const id = actorKeyString(observation.actor);
      const span = spans.get(id);
      if (span === undefined)
        spans.set(id, {
          key: observation.actor,
          first: observation.reportTimeMs,
          last: observation.reportTimeMs,
        });
      else {
        span.first = Math.min(span.first, observation.reportTimeMs);
        span.last = Math.max(span.last, observation.reportTimeMs);
      }
    }
    const damage = damageFrom(fight, [actorId], fightWindow);
    const casts = castsFrom(fight, [actorId], fightWindow).filter((cast) => cast.phase === "COMPLETE");
    const instances: SubActorInstanceFacts[] = [...spans.values()]
      .sort((left, right) => compareActorKeys(left.key, right.key))
      .map(({ key, first, last }) => {
        const own = damage.filter(
          (event) =>
            event.source.kind === "ACTOR" && actorKeyString(event.source.key) === actorKeyString(key),
        );
        const targets = new Set<string>();
        let boss = 0;
        for (const event of own) {
          if (event.target.kind !== "ACTOR") continue;
          targets.add(actorKeyString(event.target.key));
          if (describeTargetActor(fight, event.target.key.actorId, enemyNpcs).bossSubtype) boss += 1;
        }
        return {
          key,
          firstObservedAtMs: first,
          lastObservedAtMs: last,
          damageEventCount: countUnder(state, own.length),
          castCompleteEventCount: countUnder(
            state,
            casts.filter(
              (cast) =>
                cast.source.kind === "ACTOR" && actorKeyString(cast.source.key) === actorKeyString(key),
            ).length,
          ),
          rawAmountFieldSum: rawAmountFieldSumUnder(
            state,
            own.map((event) => event.raw.amountField),
          ),
          distinctTargets: countUnder(state, targets.size),
          bossSubtypeTargetEvents: countUnder(state, boss),
          otherTargetEvents: countUnder(state, own.length - boss),
          windowAssociation: associationOf({ first, last }, windows),
        };
      });

    const summons: SummonObservation[] = [];
    for (const event of fight.events) {
      if (event.kind !== "SUMMON" || event.target === null || event.target.actorId !== actorId) continue;
      summons.push({
        reportTimeMs: event.reportTimeMs,
        instance: { actorId: event.target.actorId, instanceId: event.target.instanceId },
        summonSource:
          event.source === null
            ? null
            : { actorId: event.source.actorId, instanceId: event.source.instanceId },
        abilityGameId: event.abilityGameId,
      });
    }
    const summonState = factStateOf(fight, basis, ["SUMMONS"], fightWindow, [focusActorId, actorId]);
    return {
      actorId,
      gameId,
      kind,
      ownershipAuthority: "WCL_PET_OWNER",
      ownerActorId: focusActorId,
      instances: collectionUnder(state, instances),
      summons: collectionUnder(summonState, summons),
      activity:
        activity.observationExtremes === null
          ? null
          : {
              firstObservedAtMs: activity.observationExtremes.firstObservedAtMs,
              lastObservedAtMs: activity.observationExtremes.lastObservedAtMs,
            },
      castCompleteEventCount: countUnder(state, casts.length),
      damage: summarizeDamage(fight, basis, [actorId], fightWindow, enemyNpcs),
    };
  });
  return { rootActorId: focusActorId, ownershipAuthority: "WCL_PET_OWNER", children };
}
