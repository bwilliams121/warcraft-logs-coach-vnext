/**
 * Observed healing-cooldown uses and the damage episodes around them (HEAL-B1).
 *
 * Lifted from the Restoration Shaman evaluator (M12-D) when three more healer
 * specializations needed exactly the same facts, unchanged in behavior. Like
 * the rest of `src/healing/` it reconstructs facts and never judges:
 *
 * - WHICH ability ids are a player's healing cooldowns is not known here. The
 *   caller passes them, from its own reviewed runtime data.
 * - WHICH actors' entries count as the player's in an episode is not decided
 *   here either. The caller passes the source set; `statedPetSourcesOf` only
 *   reads what Warcraft Logs states (`petOwner`), and choosing to count pets
 *   is the caller's decision.
 *
 * USES. A use is a completed `cast` sourced by the player inside the
 * encounter, bounds inclusive. Not a begincast, not an aura of the same id,
 * not another actor's cast (a totem's own cast included).
 *
 * THE USE LISTING is COMPLETE only under the player's CASTS coverage over the
 * whole encounter AND with no completed cast of the player that carries no
 * ability id, since any such cast could be an unlisted use. Otherwise it is
 * UNKNOWN with the reason, and the known uses are kept.
 *
 * THE OVERLAP of one use is the damage episodes (M12-B) reaching into
 * `[cast, cast + span]`, each with the entries from the caller's sources in
 * it (M12-C). The span is a reporting window, not an effect duration. Its own
 * listing is COMPLETE only when DAMAGE evidence holds for every roster player
 * over the span widened by the episodes' grouping gap on both sides, inside
 * the encounter, with no ability-less roster hit there: then any episode
 * reaching into the span has an observed hit in that range. Otherwise an
 * empty list is UNKNOWN, not "no overlap". Without the FULL_RAID roster the
 * overlap is ROSTER_NOT_IN_SCOPE.
 */

import { inclusiveRange } from "../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { CastEvent } from "../engine/normalization/normalized-events.js";
import { gateAbsenceClaim, type UnknownReason } from "../engine/state/state-result.js";
import type { DamageEpisode } from "./damage-episodes.js";
import { receivedDuringEpisodesOf, type ReceivedCoverage } from "./received-during-episodes.js";

export interface ObservedCooldownCast {
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  /** Canonical index into `CombatFight.events`. */
  readonly position: number;
  readonly locator: EvidenceLocator;
}

/** Whether a use list is every use of the listed ids. Only COMPLETE makes an empty list "none cast". */
export type CooldownUseListing =
  | { readonly state: "COMPLETE" }
  | {
      readonly state: "UNKNOWN";
      readonly reason: UnknownReason | "UNIDENTIFIED_SUBJECT_CAST";
      /** Completed casts by the player inside the encounter that carry no ability id. */
      readonly unidentifiedCasts: number;
    };

export interface EpisodeOverlap {
  readonly episodeAbilityGameId: number;
  readonly firstHitMs: number;
  readonly lastHitMs: number;
  /** The episode's own DAMAGE coverage: UNKNOWN means its player set may be incomplete. */
  readonly episodeCoverage: DamageEpisode["coverage"];
  /** Per player the episode hit: entries from the caller's sources in the episode's window, and that list's coverage. */
  readonly players: readonly {
    readonly actorId: number;
    readonly entriesFromSubject: number;
    readonly coverage: { readonly HEALING: ReceivedCoverage; readonly ABSORBS: ReceivedCoverage };
  }[];
}

/** Whether an overlap list is every episode reaching into the span. See the module header. */
export type OverlapListing =
  | { readonly state: "COMPLETE" }
  | {
      readonly state: "UNKNOWN";
      /** The widened span runs past the encounter's start or end. */
      readonly beyondFightEdge: boolean;
      readonly uncoveredActors: readonly { readonly actorId: number; readonly reason: UnknownReason }[];
      /** Roster hits with no ability id in the widened span: any could belong to an unlisted episode. */
      readonly unidentifiedHitsInSpan: number;
    };

export interface CooldownUse {
  readonly cast: ObservedCooldownCast;
  readonly overlap:
    | { readonly state: "ROSTER_NOT_IN_SCOPE"; readonly scope: string }
    | {
        readonly state: "RECONSTRUCTED";
        readonly spanMs: number;
        /** Whether `episodes` is every episode overlapping the span. Only COMPLETE makes an empty list "no overlap". */
        readonly listing: OverlapListing;
        /** Observed overlapping episodes, each with its own coverage. */
        readonly episodes: readonly EpisodeOverlap[];
      };
}

/** The player's completed casts of the given ids inside the encounter, bounds inclusive, in time order. */
export function observedCooldownCastsOf(
  fight: CombatFight,
  actorId: number,
  ids: ReadonlySet<number>,
): ObservedCooldownCast[] {
  const { startTimeMs, endTimeMs } = fight.fight;
  const casts: ObservedCooldownCast[] = [];
  fight.events.forEach((event, position) => {
    if (event.kind !== "CAST") return;
    const cast: CastEvent = event;
    if (cast.castPhase !== "COMPLETE" || cast.source?.actorId !== actorId) return;
    if (cast.reportTimeMs < startTimeMs || cast.reportTimeMs > endTimeMs) return;
    if (cast.abilityGameId === null || !ids.has(cast.abilityGameId)) return;
    casts.push({
      abilityGameId: cast.abilityGameId,
      reportTimeMs: cast.reportTimeMs,
      position,
      locator: cast.locator,
    });
  });
  return casts.sort((a, b) => a.reportTimeMs - b.reportTimeMs || a.position - b.position);
}

/** Report times of the player's completed casts inside the encounter that carry no ability id. */
export function unidentifiedCastTimesOf(fight: CombatFight, actorId: number): number[] {
  return fight.events
    .filter(
      (event) =>
        event.kind === "CAST" &&
        event.castPhase === "COMPLETE" &&
        event.source?.actorId === actorId &&
        event.abilityGameId === null,
    )
    .map((event) => event.reportTimeMs)
    .filter((time) => time >= fight.fight.startTimeMs && time <= fight.fight.endTimeMs);
}

/** Whether the uses of the listed ids are every use the player made. See the module header. */
export function cooldownUseListingOf(
  fight: CombatFight,
  actorId: number,
  unidentifiedCastTimes: readonly number[],
): CooldownUseListing {
  const gate = gateAbsenceClaim({
    completeness: fight.completeness,
    category: "CASTS",
    range: inclusiveRange(fight.fight.startTimeMs, fight.fight.endTimeMs),
    actorId,
  });
  const unidentifiedCasts = unidentifiedCastTimes.length;
  if (!gate.ok) return { state: "UNKNOWN", reason: gate.reason, unidentifiedCasts };
  if (unidentifiedCasts > 0)
    return { state: "UNKNOWN", reason: "UNIDENTIFIED_SUBJECT_CAST", unidentifiedCasts };
  return { state: "COMPLETE" };
}

/** The actor plus every actor whose Warcraft Logs `petOwner` is it, ascending. A statement, not a choice to count them. */
export function statedPetSourcesOf(fight: CombatFight, actorId: number): number[] {
  return [
    actorId,
    ...[...fight.actors.values()]
      .filter((actor) => actor.petOwnerActorId === actorId)
      .map((actor) => actor.actorId),
  ].sort((a, b) => a - b);
}

/** Each use with the damage episodes overlapping `[cast, cast + spanMs]`. See the module header. */
export function cooldownUseOverlapOf(
  fight: CombatFight,
  casts: readonly ObservedCooldownCast[],
  sources: ReadonlySet<number>,
  spanMs: number,
): CooldownUse[] {
  const received = receivedDuringEpisodesOf(fight);
  if (received.state === "ROSTER_NOT_IN_SCOPE") {
    return casts.map((cast) => ({ cast, overlap: { state: "ROSTER_NOT_IN_SCOPE", scope: received.scope } }));
  }
  const roster = new Set(received.roster);
  const unidentifiedHitTimes = fight.events
    .filter(
      (event) =>
        event.kind === "DAMAGE" &&
        event.abilityGameId === null &&
        event.target !== null &&
        roster.has(event.target.actorId),
    )
    .map((event) => event.reportTimeMs);
  const { startTimeMs, endTimeMs } = fight.fight;
  const listingOf = (from: number, to: number): OverlapListing => {
    const spanFrom = from - received.gapMs;
    const spanTo = to + received.gapMs;
    const beyondFightEdge = spanFrom < startTimeMs || spanTo > endTimeMs;
    const range = inclusiveRange(Math.max(spanFrom, startTimeMs), Math.min(spanTo, endTimeMs));
    const uncoveredActors: { actorId: number; reason: UnknownReason }[] = [];
    for (const actorId of received.roster) {
      const gate = gateAbsenceClaim({ completeness: fight.completeness, category: "DAMAGE", range, actorId });
      if (!gate.ok) uncoveredActors.push({ actorId, reason: gate.reason });
    }
    const unidentifiedHitsInSpan = unidentifiedHitTimes.filter(
      (time) => time >= spanFrom && time <= spanTo,
    ).length;
    return !beyondFightEdge && uncoveredActors.length === 0 && unidentifiedHitsInSpan === 0
      ? { state: "COMPLETE" }
      : { state: "UNKNOWN", beyondFightEdge, uncoveredActors, unidentifiedHitsInSpan };
  };
  return casts.map((cast) => {
    const until = cast.reportTimeMs + spanMs;
    const listing = listingOf(cast.reportTimeMs, until);
    const episodes = received.episodes
      .filter(({ episode }) => episode.lastHitMs >= cast.reportTimeMs && episode.firstHitMs <= until)
      .map(({ episode, players }): EpisodeOverlap => ({
        episodeAbilityGameId: episode.abilityGameId,
        firstHitMs: episode.firstHitMs,
        lastHitMs: episode.lastHitMs,
        episodeCoverage: episode.coverage,
        players: players.map((player) => ({
          actorId: player.actorId,
          entriesFromSubject: player.bySource
            .filter((group) => group.source !== null && sources.has(group.source.actorId))
            .reduce((count, group) => count + group.entries.length, 0),
          coverage: player.coverage,
        })),
      }));
    return { cast, overlap: { state: "RECONSTRUCTED", spanMs, listing, episodes } };
  });
}
