/**
 * DAMAGE EPISODES (M12-B): when damage arrived on the raid, and on whom.
 *
 * The second shared healing primitive (agent/architecture.md "Healer
 * Architecture": raid damage windows). It reconstructs facts only. Whether a
 * healer covered an episode, or should have, is decided later by a
 * specialization evaluator under its own authority.
 *
 * WHAT AN EPISODE IS
 *
 * Every DAMAGE event whose target is a friendly player in the declared
 * roster, grouped by ability: consecutive hits of one ability no more than
 * `gapMs` apart form one episode. For each episode, the hits per target, the
 * reported sources, and each target's lowest observed health (a snapshot of
 * that same target, M12-A's identity rule). A grouping parameter is not a
 * judgement: no episode is called "raid-wide", "dangerous" or "healable" here.
 * A consumer that needs such a class applies its own, declared threshold.
 *
 * THE ROSTER
 *
 * The declared friendly roster is `breadth.friendlyActorsInScope`, which
 * production fills only under FULL_RAID. Without it there is no report of
 * episodes at all — `ROSTER_NOT_IN_SCOPE` — never an empty list, which would
 * read as "the raid took no damage".
 *
 * WHAT IT NEVER SAYS
 *
 * - No totals. Raw `amount` meaning is follow-up M1.
 * - No complete target set, hit count or boundary without coverage. An
 *   episode is COMPLETE only when DAMAGE coverage holds for EVERY roster
 *   player over `[first hit - gapMs, last hit + gapMs]`: then no hit of that
 *   ability on any roster player is missing inside the episode, and none sits
 *   close enough outside it to have extended it. If that span runs past the
 *   fight's edge, or any roster player is not covered, the episode is UNKNOWN
 *   and names why, and its contents are what was observed. A hit with no
 *   ability id inside that span makes it UNKNOWN too: it could be this
 *   ability's hit.
 * - Nothing about cause, avoidability or who should have done what.
 */

import { inclusiveRange } from "../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { ActorRef, DamageEvent } from "../engine/normalization/normalized-events.js";
import { gateAbsenceClaim, type UnknownReason } from "../engine/state/state-result.js";

export const DAMAGE_EPISODES_REVISION = "healing-damage-episodes/1" as const;

/** The default largest gap between two hits of one ability inside one episode. A grouping parameter. */
export const DEFAULT_DAMAGE_EPISODE_GAP_MS = 2_000;

export interface EpisodeTargetHealth {
  readonly hitPoints: number;
  readonly maxHitPoints: number | null;
  readonly reportTimeMs: number;
  readonly locator: EvidenceLocator;
}

export interface EpisodeTarget {
  readonly actorId: number;
  readonly hits: number;
  readonly firstHitMs: number;
  readonly lastHitMs: number;
  /** The lowest hit-point snapshot of this same target on the episode's hits; null when none was attached. */
  readonly lowestObservedHealth: EpisodeTargetHealth | null;
}

export type EpisodeCoverage =
  | { readonly state: "COMPLETE" }
  | {
      readonly state: "UNKNOWN";
      /** The span the claim needed runs past the fight's start or end. */
      readonly beyondFightEdge: boolean;
      /** Roster players whose DAMAGE evidence does not vouch for the span, with the gate's reason. */
      readonly uncoveredActors: readonly { readonly actorId: number; readonly reason: UnknownReason }[];
      /**
       * Hits on roster players with NO ability id inside the span. Any one of
       * them could be this ability's — changing the hits, the targets or the
       * boundary — so the episode cannot be COMPLETE while one is there.
       */
      readonly unidentifiedHitsInSpan: number;
    };

export interface DamageEpisode {
  readonly abilityGameId: number;
  readonly firstHitMs: number;
  readonly lastHitMs: number;
  readonly hits: number;
  /** Reported sources of the hits, distinct, in actor then instance order; `null` sources are counted, not listed. */
  readonly sources: readonly ActorRef[];
  readonly hitsWithoutSource: number;
  /** One per roster player hit, by actor id. */
  readonly targets: readonly EpisodeTarget[];
  readonly coverage: EpisodeCoverage;
  readonly firstLocator: EvidenceLocator;
}

export type DamageEpisodeReport =
  | {
      readonly revision: typeof DAMAGE_EPISODES_REVISION;
      readonly authority: "WCL_OBSERVED_FACT";
      readonly state: "ROSTER_NOT_IN_SCOPE";
      readonly scope: string;
    }
  | {
      readonly revision: typeof DAMAGE_EPISODES_REVISION;
      readonly authority: "WCL_OBSERVED_FACT";
      readonly state: "RECONSTRUCTED";
      readonly gapMs: number;
      /** The declared friendly roster the episodes range over, ascending. */
      readonly roster: readonly number[];
      /** In order of first hit, then ability id. */
      readonly episodes: readonly DamageEpisode[];
      /** Hits on roster players with no ability id: kept as a count, never silently dropped. */
      readonly hitsWithoutAbility: number;
    };

function compareRefs(a: ActorRef, b: ActorRef): number {
  return a.actorId - b.actorId || (a.instanceId ?? -1) - (b.instanceId ?? -1);
}

function lowerHealth(current: EpisodeTargetHealth | null, event: DamageEvent): EpisodeTargetHealth | null {
  const snapshot = event.attachedResources;
  if (snapshot === null || snapshot.actor === null || snapshot.hitPoints === null) return current;
  if (event.target === null) return current;
  if (
    snapshot.actor.actorId !== event.target.actorId ||
    snapshot.actor.instanceId !== event.target.instanceId
  ) {
    return current;
  }
  if (current !== null && current.hitPoints <= snapshot.hitPoints) return current;
  return {
    hitPoints: snapshot.hitPoints,
    maxHitPoints: snapshot.maxHitPoints,
    reportTimeMs: event.reportTimeMs,
    locator: event.locator,
  };
}

function episodeOf(
  fight: CombatFight,
  roster: readonly number[],
  gapMs: number,
  abilityGameId: number,
  hits: readonly DamageEvent[],
  unidentifiedHitTimes: readonly number[],
): DamageEpisode {
  const first = hits[0];
  const last = hits[hits.length - 1];
  if (first === undefined || last === undefined) throw new Error("an episode has at least one hit");

  const sources = new Map<string, ActorRef>();
  let hitsWithoutSource = 0;
  const byTarget = new Map<
    number,
    { hits: number; first: number; last: number; low: EpisodeTargetHealth | null }
  >();
  for (const hit of hits) {
    if (hit.source === null) hitsWithoutSource += 1;
    else {
      sources.set(`${String(hit.source.actorId)}:${String(hit.source.instanceId)}`, {
        actorId: hit.source.actorId,
        instanceId: hit.source.instanceId,
      });
    }
    const targetId = hit.target?.actorId;
    if (targetId === undefined) continue;
    const entry = byTarget.get(targetId) ?? {
      hits: 0,
      first: hit.reportTimeMs,
      last: hit.reportTimeMs,
      low: null,
    };
    entry.hits += 1;
    entry.last = hit.reportTimeMs;
    entry.low = lowerHealth(entry.low, hit);
    byTarget.set(targetId, entry);
  }

  const { startTimeMs, endTimeMs } = fight.fight;
  const spanFrom = first.reportTimeMs - gapMs;
  const spanTo = last.reportTimeMs + gapMs;
  const beyondFightEdge = spanFrom < startTimeMs || spanTo > endTimeMs;
  const range = inclusiveRange(Math.max(spanFrom, startTimeMs), Math.min(spanTo, endTimeMs));
  const uncoveredActors: { actorId: number; reason: UnknownReason }[] = [];
  for (const actorId of roster) {
    const gate = gateAbsenceClaim({ completeness: fight.completeness, category: "DAMAGE", range, actorId });
    if (!gate.ok) uncoveredActors.push({ actorId, reason: gate.reason });
  }
  const unidentifiedHitsInSpan = unidentifiedHitTimes.filter(
    (time) => time >= spanFrom && time <= spanTo,
  ).length;

  return {
    abilityGameId,
    firstHitMs: first.reportTimeMs,
    lastHitMs: last.reportTimeMs,
    hits: hits.length,
    sources: [...sources.values()].sort(compareRefs),
    hitsWithoutSource,
    targets: [...byTarget.entries()]
      .sort(([a], [b]) => a - b)
      .map(([actorId, entry]) => ({
        actorId,
        hits: entry.hits,
        firstHitMs: entry.first,
        lastHitMs: entry.last,
        lowestObservedHealth: entry.low,
      })),
    coverage:
      !beyondFightEdge && uncoveredActors.length === 0 && unidentifiedHitsInSpan === 0
        ? { state: "COMPLETE" }
        : { state: "UNKNOWN", beyondFightEdge, uncoveredActors, unidentifiedHitsInSpan },
    firstLocator: first.locator,
  };
}

/** The damage episodes on the declared friendly roster of one fight. */
export function damageEpisodesOf(
  fight: CombatFight,
  gapMs: number = DEFAULT_DAMAGE_EPISODE_GAP_MS,
): DamageEpisodeReport {
  if (!Number.isSafeInteger(gapMs) || gapMs < 0) {
    throw new RangeError(`gapMs must be a non-negative integer, got ${String(gapMs)}`);
  }
  const base = { revision: DAMAGE_EPISODES_REVISION, authority: "WCL_OBSERVED_FACT" as const };
  const roster = [...new Set(fight.breadth.friendlyActorsInScope)].sort((a, b) => a - b);
  if (fight.breadth.scope !== "FULL_RAID" || roster.length === 0) {
    return { ...base, state: "ROSTER_NOT_IN_SCOPE", scope: fight.breadth.scope };
  }
  const inRoster = new Set(roster);
  const { startTimeMs, endTimeMs } = fight.fight;

  const hitsByAbility = new Map<number, DamageEvent[]>();
  let hitsWithoutAbility = 0;
  const unidentifiedHitTimes: number[] = [];
  const hits = fight.events
    .filter(
      (event): event is DamageEvent =>
        event.kind === "DAMAGE" &&
        event.target !== null &&
        inRoster.has(event.target.actorId) &&
        event.reportTimeMs >= startTimeMs &&
        event.reportTimeMs <= endTimeMs,
    )
    .sort((a, b) => a.reportTimeMs - b.reportTimeMs || a.ingestionOrdinal - b.ingestionOrdinal);
  for (const hit of hits) {
    if (hit.abilityGameId === null) {
      hitsWithoutAbility += 1;
      unidentifiedHitTimes.push(hit.reportTimeMs);
      continue;
    }
    const list = hitsByAbility.get(hit.abilityGameId) ?? [];
    list.push(hit);
    hitsByAbility.set(hit.abilityGameId, list);
  }

  const episodes: DamageEpisode[] = [];
  for (const [abilityGameId, list] of hitsByAbility) {
    let current: DamageEvent[] = [];
    for (const hit of list) {
      const previous = current[current.length - 1];
      if (previous !== undefined && hit.reportTimeMs - previous.reportTimeMs > gapMs) {
        episodes.push(episodeOf(fight, roster, gapMs, abilityGameId, current, unidentifiedHitTimes));
        current = [];
      }
      current.push(hit);
    }
    if (current.length > 0)
      episodes.push(episodeOf(fight, roster, gapMs, abilityGameId, current, unidentifiedHitTimes));
  }
  episodes.sort((a, b) => a.firstHitMs - b.firstHitMs || a.abilityGameId - b.abilityGameId);

  return { ...base, state: "RECONSTRUCTED", gapMs, roster, episodes, hitsWithoutAbility };
}
