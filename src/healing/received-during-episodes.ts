/**
 * RECEIVED DURING EPISODES (M12-C): what healing and absorbs each player hit
 * by a damage episode received while it ran, and from whom.
 *
 * The third shared healing primitive (agent/architecture.md "Healer
 * Architecture": WHAT covered raid damage, other-healer coverage, absorbs).
 * It reconstructs facts only. Whether any healer covered an episode well, or
 * should have done more, is decided later by a specialization evaluator under
 * its own authority.
 *
 * WHAT IT REPORTS
 *
 * For each M12-B damage episode, a window from the episode's first hit to its
 * last hit plus `trailingMs`. For each roster player the episode hit, every
 * HEALING and ABSORB event that targeted that player inside the window,
 * grouped by the reported source and kept with its raw fields verbatim. The
 * trailing span is a reporting window, not a judgement of how fast healing
 * ought to arrive.
 *
 * The source is what Warcraft Logs reported, nothing more: a pet or guardian
 * is its own source and is never folded into an owner, and a player's own
 * heal is listed under that player. `DAMAGE_ABSORBED` and `HEAL_ABSORBED`
 * stay distinct kinds, because a heal absorb takes healing away.
 *
 * WHAT IT NEVER SAYS
 *
 * - No totals. Raw `amount` meaning is follow-up M1.
 * - No "nothing was received". Each player's HEALING and ABSORBS lists carry
 *   their own coverage from the shared absence gate over that player and that
 *   window. Only COMPLETE makes a list complete for its category; otherwise it
 *   is UNKNOWN with the gate's reason, and holds what was observed.
 * - No complete set of players. The players are the episode's targets, and
 *   the episode's own DAMAGE coverage (carried in `episode.coverage`) says
 *   whether that set is complete.
 * - Nothing about players the episode did not hit, or about the episode's
 *   cause.
 *
 * Windows of overlapping episodes overlap, so one event can be listed under
 * several episodes. That is why nothing here is ever added up across them.
 */

import { inclusiveRange } from "../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { AbsorbEvent, ActorRef, HealingEvent } from "../engine/normalization/normalized-events.js";
import { gateAbsenceClaim, type UnknownReason } from "../engine/state/state-result.js";
import type { EvidenceCategory } from "../wcl/evidence-capability.js";

import { DEFAULT_DAMAGE_EPISODE_GAP_MS, damageEpisodesOf, type DamageEpisode } from "./damage-episodes.js";

export const RECEIVED_DURING_EPISODES_REVISION = "healing-received-during-episodes/1" as const;

/** The default span after an episode's last hit that its window still reports. A reporting window. */
export const DEFAULT_RECEIVED_TRAILING_MS = 2_000;

/** The categories the received entries come from, each with its own coverage. */
export const RECEIVED_CATEGORIES = ["HEALING", "ABSORBS"] as const;
export type ReceivedCategory = (typeof RECEIVED_CATEGORIES)[number] & EvidenceCategory;

export type ReceivedEntry =
  | {
      readonly kind: "HEALING_RECEIVED";
      readonly reportTimeMs: number;
      readonly abilityGameId: number | null;
      /** The raw fields, verbatim. Their accounting meaning is follow-up M1. */
      readonly raw: {
        readonly amount: number;
        readonly overhealAmount: number | null;
        readonly absorbedAmount: number | null;
        readonly hitType: number | null;
      };
      readonly locator: EvidenceLocator;
    }
  | {
      readonly kind: "DAMAGE_ABSORBED" | "HEAL_ABSORBED";
      readonly reportTimeMs: number;
      readonly abilityGameId: number | null;
      readonly raw: {
        readonly amount: number;
        /** The ability that was absorbed (`extraAbilityGameID`). */
        readonly absorbedAbilityGameId: number | null;
        /** `attackerID` for a damage absorb, `healerID` for a heal absorb. */
        readonly attributedActorId: number | null;
      };
      readonly locator: EvidenceLocator;
    };

export interface ReceivedFromSource {
  /** The reported source, verbatim; `null` when Warcraft Logs stated none. */
  readonly source: ActorRef | null;
  /** Chronological: report time, then retrieval order. */
  readonly entries: readonly ReceivedEntry[];
}

/**
 * COMPLETE: every retrieved event of this category targeting the player in
 * the window is listed. UNKNOWN: the listed ones were observed; more may exist.
 */
export type ReceivedCoverage =
  { readonly state: "COMPLETE" } | { readonly state: "UNKNOWN"; readonly reason: UnknownReason };

export interface ReceivedByPlayer {
  readonly actorId: number;
  /** Sources in actor then instance order; the `null` source last. Empty only as the lists' coverage allows. */
  readonly bySource: readonly ReceivedFromSource[];
  readonly coverage: { readonly [K in ReceivedCategory]: ReceivedCoverage };
}

export interface ReceivedWindow {
  /** The episode's first hit. */
  readonly fromReportTimeMs: number;
  readonly toReportTimeMs: number;
  /** "FIGHT_END" when the trailing span was cut at the fight's end. */
  readonly clampedBy: "FIGHT_END" | null;
}

export interface EpisodeReceived {
  readonly episode: DamageEpisode;
  readonly window: ReceivedWindow;
  /** One per roster player the episode hit, by actor id. */
  readonly players: readonly ReceivedByPlayer[];
}

export type ReceivedDuringEpisodesReport =
  | {
      readonly revision: typeof RECEIVED_DURING_EPISODES_REVISION;
      readonly authority: "WCL_OBSERVED_FACT";
      readonly state: "ROSTER_NOT_IN_SCOPE";
      readonly scope: string;
    }
  | {
      readonly revision: typeof RECEIVED_DURING_EPISODES_REVISION;
      readonly authority: "WCL_OBSERVED_FACT";
      readonly state: "RECONSTRUCTED";
      readonly gapMs: number;
      readonly trailingMs: number;
      readonly roster: readonly number[];
      /** In the episodes' own order. */
      readonly episodes: readonly EpisodeReceived[];
    };

function sourceKey(source: ActorRef | null): string {
  return source === null ? "none" : `${String(source.actorId)}:${String(source.instanceId)}`;
}

function compareSources(a: ActorRef | null, b: ActorRef | null): number {
  if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0);
  return a.actorId - b.actorId || (a.instanceId ?? -1) - (b.instanceId ?? -1);
}

function entryOf(event: HealingEvent | AbsorbEvent): ReceivedEntry {
  if (event.kind === "HEALING") {
    return {
      kind: "HEALING_RECEIVED",
      reportTimeMs: event.reportTimeMs,
      abilityGameId: event.abilityGameId,
      raw: {
        amount: event.amount,
        overhealAmount: event.overhealAmount,
        absorbedAmount: event.absorbedAmount,
        hitType: event.hitType,
      },
      locator: event.locator,
    };
  }
  return {
    kind: event.absorbKind,
    reportTimeMs: event.reportTimeMs,
    abilityGameId: event.abilityGameId,
    raw: {
      amount: event.amount,
      absorbedAbilityGameId: event.absorbedAbilityGameId,
      attributedActorId: event.attributedActorId,
    },
    locator: event.locator,
  };
}

function coverageOf(
  fight: CombatFight,
  category: ReceivedCategory,
  window: ReceivedWindow,
  actorId: number,
): ReceivedCoverage {
  const gate = gateAbsenceClaim({
    completeness: fight.completeness,
    category,
    range: inclusiveRange(window.fromReportTimeMs, window.toReportTimeMs),
    actorId,
  });
  return gate.ok ? { state: "COMPLETE" } : { state: "UNKNOWN", reason: gate.reason };
}

/** The healing and absorbs each player hit by each damage episode received in that episode's window. */
export function receivedDuringEpisodesOf(
  fight: CombatFight,
  options: { readonly gapMs?: number; readonly trailingMs?: number } = {},
): ReceivedDuringEpisodesReport {
  const gapMs = options.gapMs ?? DEFAULT_DAMAGE_EPISODE_GAP_MS;
  const trailingMs = options.trailingMs ?? DEFAULT_RECEIVED_TRAILING_MS;
  if (!Number.isSafeInteger(trailingMs) || trailingMs < 0) {
    throw new RangeError(`trailingMs must be a non-negative integer, got ${String(trailingMs)}`);
  }
  const base = { revision: RECEIVED_DURING_EPISODES_REVISION, authority: "WCL_OBSERVED_FACT" as const };
  const damage = damageEpisodesOf(fight, gapMs);
  if (damage.state === "ROSTER_NOT_IN_SCOPE") {
    return { ...base, state: "ROSTER_NOT_IN_SCOPE", scope: damage.scope };
  }

  // Every heal and absorb on a roster player, chronological, grouped by player, read once.
  const inRoster = new Set(damage.roster);
  const byPlayer = new Map<number, (HealingEvent | AbsorbEvent)[]>();
  const received = fight.events
    .filter(
      (event): event is HealingEvent | AbsorbEvent =>
        (event.kind === "HEALING" || event.kind === "ABSORB") &&
        event.target !== null &&
        inRoster.has(event.target.actorId),
    )
    .sort((a, b) => a.reportTimeMs - b.reportTimeMs || a.ingestionOrdinal - b.ingestionOrdinal);
  for (const event of received) {
    const actorId = event.target?.actorId;
    if (actorId === undefined) continue;
    const list = byPlayer.get(actorId) ?? [];
    list.push(event);
    byPlayer.set(actorId, list);
  }

  const { endTimeMs } = fight.fight;
  const episodes = damage.episodes.map((episode): EpisodeReceived => {
    const requested = episode.lastHitMs + trailingMs;
    const window: ReceivedWindow = {
      fromReportTimeMs: episode.firstHitMs,
      toReportTimeMs: Math.min(requested, endTimeMs),
      clampedBy: requested > endTimeMs ? "FIGHT_END" : null,
    };
    const players = episode.targets.map((target): ReceivedByPlayer => {
      const sources = new Map<string, { source: ActorRef | null; entries: ReceivedEntry[] }>();
      for (const event of byPlayer.get(target.actorId) ?? []) {
        if (event.reportTimeMs < window.fromReportTimeMs || event.reportTimeMs > window.toReportTimeMs) {
          continue;
        }
        const source =
          event.source === null
            ? null
            : { actorId: event.source.actorId, instanceId: event.source.instanceId };
        const key = sourceKey(source);
        const group = sources.get(key) ?? { source, entries: [] };
        group.entries.push(entryOf(event));
        sources.set(key, group);
      }
      return {
        actorId: target.actorId,
        bySource: [...sources.values()].sort((a, b) => compareSources(a.source, b.source)),
        coverage: {
          HEALING: coverageOf(fight, "HEALING", window, target.actorId),
          ABSORBS: coverageOf(fight, "ABSORBS", window, target.actorId),
        },
      };
    });
    return { episode, window, players };
  });

  return { ...base, state: "RECONSTRUCTED", gapMs, trailingMs, roster: damage.roster, episodes };
}
