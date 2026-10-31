/**
 * DEATH TIMELINES (M12-A): what happened TO one actor in the moments before
 * each of its observed deaths.
 *
 * The first shared healing primitive (agent/architecture.md "Healer
 * Architecture"). `src/healing/` reconstructs facts — WHEN damage arrived and
 * WHAT covered it. It never decides whether a healer, a defensive or the
 * player did the right thing; a specialization evaluator does that, under its
 * own authority, from these facts.
 *
 * WHAT A TIMELINE IS
 *
 * For each positive death of the actor (`observedDeathsOf`, M11-F), the events
 * that TARGETED that exact actor instance in a lookback window ending at the
 * death: damage taken, healing received, and damage or healing absorbed. Each
 * entry keeps Warcraft Logs' raw fields verbatim, its source as reported, and
 * the health snapshot when Warcraft Logs attached one of that same actor.
 *
 * WHAT IT NEVER SAYS
 *
 * - No totals. What the raw `amount` fields mean in Warcraft Logs' accounting
 *   is NOT YET PROVEN (follow-up M1), so nothing here sums them into "damage
 *   taken" or "healing received".
 * - No "no healing was received". An empty or short entry list is a complete
 *   list for a category ONLY when that category's coverage for this actor
 *   over the whole window is COMPLETE (the shared absence gate). Otherwise the
 *   category is UNKNOWN and its entries are the ones observed, nothing more.
 * - Nothing after the death. The window ends at the death's report time.
 *   Entries at that exact millisecond are kept and marked: retrieval order is
 *   not an authoritative order of game events, so whether they preceded the
 *   death is not known.
 * - No cause. The killing blow is Warcraft Logs' `killer` and
 *   `killingAbilityGameId` when supplied, never inferred from the last hit.
 * - Nothing about deaths that were not observed. The list is positive-only.
 *
 * WINDOW
 *
 * `[death - lookbackMs, death]`, clamped so it never starts before the fight,
 * or at or before this actor's previous observed death: the previous death's
 * events belong to the previous timeline. The lookback is a reporting window,
 * not a judgement threshold.
 */

import { inclusiveRange } from "../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type {
  AbsorbEvent,
  ActorRef,
  CombatEvent,
  DamageEvent,
  HealingEvent,
  ResourceSide,
  TickFieldState,
} from "../engine/normalization/normalized-events.js";
import { observedDeathsOf, type DeathObservation } from "../engine/state/death-state.js";
import { gateAbsenceClaim, type UnknownReason } from "../engine/state/state-result.js";
import type { EvidenceCategory } from "../wcl/evidence-capability.js";

export const DEATH_TIMELINE_REVISION = "healing-death-timeline/1" as const;

/** The default reporting window before a death. A presentation choice, not a verdict. */
export const DEFAULT_DEATH_TIMELINE_LOOKBACK_MS = 10_000;

/** The categories a timeline's entries come from, each with its own coverage. */
export const DEATH_TIMELINE_CATEGORIES = ["DAMAGE", "HEALING", "ABSORBS"] as const;
export type DeathTimelineCategory = (typeof DEATH_TIMELINE_CATEGORIES)[number] & EvidenceCategory;

export type DeathTimelineEntryKind =
  "DAMAGE_TAKEN" | "HEALING_RECEIVED" | "DAMAGE_ABSORBED" | "HEAL_ABSORBED";

/**
 * The dying actor's own health: a snapshot Warcraft Logs attached to the
 * event and stated to be of that same actor instance. `side` is the verified
 * `resourceActor` side it came from — SOURCE only when the actor was also the
 * event's source (its own heal or absorb). A snapshot of anyone else is never
 * read as the dying actor's health.
 */
export interface ActorHealthSnapshot {
  readonly side: ResourceSide;
  readonly hitPoints: number | null;
  readonly maxHitPoints: number | null;
}

interface EntryBase {
  readonly reportTimeMs: number;
  /** The reported source, verbatim; `null` when Warcraft Logs stated none. */
  readonly source: ActorRef | null;
  readonly abilityGameId: number | null;
  /** Null when no snapshot of the dying actor itself was attached. */
  readonly actorHealth: ActorHealthSnapshot | null;
  /** Same report millisecond as the death: whether it came first is not known. */
  readonly atDeathTime: boolean;
  readonly locator: EvidenceLocator;
}

export type DeathTimelineEntry =
  | (EntryBase & {
      readonly kind: "DAMAGE_TAKEN";
      /** The raw fields, verbatim. Their accounting meaning is follow-up M1. */
      readonly raw: {
        readonly amount: number;
        readonly unmitigatedAmount: number | null;
        readonly mitigatedAmount: number | null;
        readonly absorbedAmount: number | null;
        readonly blockedAmount: number | null;
        readonly overkillAmount: number | null;
        readonly hitType: number | null;
        /**
         * The raw `tick` key's state (M11-E1): absent is NOT_SUPPLIED, never
         * false. What a tick means is follow-up M3.
         */
        readonly tickField: TickFieldState;
      };
    })
  | (EntryBase & {
      readonly kind: "HEALING_RECEIVED";
      readonly raw: {
        readonly amount: number;
        readonly overhealAmount: number | null;
        readonly absorbedAmount: number | null;
        readonly hitType: number | null;
        // No tick field: the healing decoder keeps only a collapsed boolean,
        // which cannot tell an absent `tick` from false, so none is reported.
      };
    })
  | (EntryBase & {
      readonly kind: "DAMAGE_ABSORBED" | "HEAL_ABSORBED";
      readonly raw: {
        readonly amount: number;
        /** The ability that was absorbed (`extraAbilityGameID`). */
        readonly absorbedAbilityGameId: number | null;
        /** `attackerID` for a damage absorb, `healerID` for a heal absorb. */
        readonly attributedActorId: number | null;
      };
    });

/**
 * COMPLETE: every retrieved event of this category targeting the actor in the
 * window is in `entries`. UNKNOWN: entries of this category are the ones
 * observed; more may exist.
 */
export type DeathTimelineCoverage =
  { readonly state: "COMPLETE" } | { readonly state: "UNKNOWN"; readonly reason: UnknownReason };

export interface DeathTimelineWindow {
  readonly fromReportTimeMs: number;
  /** The death's report time. */
  readonly toReportTimeMs: number;
  /** What shortened the window below the requested lookback, if anything. */
  readonly clampedBy: "FIGHT_START" | "PREVIOUS_DEATH" | null;
}

export interface DeathTimeline {
  readonly death: DeathObservation;
  readonly window: DeathTimelineWindow;
  /** Chronological: report time, then retrieval order. */
  readonly entries: readonly DeathTimelineEntry[];
  readonly coverage: { readonly [K in DeathTimelineCategory]: DeathTimelineCoverage };
}

export interface DeathTimelineReport {
  readonly revision: typeof DEATH_TIMELINE_REVISION;
  readonly authority: "WCL_OBSERVED_FACT";
  readonly actorId: number;
  readonly lookbackMs: number;
  /** One per positive death of the actor, in time order. Never a claim about unobserved deaths. */
  readonly timelines: readonly DeathTimeline[];
  readonly absenceSemantics: "NONE";
}

function sameKey(left: ActorRef, right: ActorRef): boolean {
  return left.actorId === right.actorId && left.instanceId === right.instanceId;
}

function actorHealthOf(event: CombatEvent, key: ActorRef): ActorHealthSnapshot | null {
  const snapshot = event.attachedResources;
  if (snapshot === null || snapshot.actor === null || !sameKey(snapshot.actor, key)) return null;
  return { side: snapshot.side, hitPoints: snapshot.hitPoints, maxHitPoints: snapshot.maxHitPoints };
}

function entryOf(
  event: DamageEvent | HealingEvent | AbsorbEvent,
  key: ActorRef,
  deathMs: number,
): DeathTimelineEntry {
  const base: EntryBase = {
    reportTimeMs: event.reportTimeMs,
    source:
      event.source === null ? null : { actorId: event.source.actorId, instanceId: event.source.instanceId },
    abilityGameId: event.abilityGameId,
    actorHealth: actorHealthOf(event, key),
    atDeathTime: event.reportTimeMs === deathMs,
    locator: event.locator,
  };
  switch (event.kind) {
    case "DAMAGE":
      return {
        ...base,
        kind: "DAMAGE_TAKEN",
        raw: {
          amount: event.amount,
          unmitigatedAmount: event.unmitigatedAmount,
          mitigatedAmount: event.mitigatedAmount,
          absorbedAmount: event.absorbedAmount,
          blockedAmount: event.blockedAmount,
          overkillAmount: event.overkillAmount,
          hitType: event.hitType,
          tickField: event.tickField,
        },
      };
    case "HEALING":
      return {
        ...base,
        kind: "HEALING_RECEIVED",
        raw: {
          amount: event.amount,
          overhealAmount: event.overhealAmount,
          absorbedAmount: event.absorbedAmount,
          hitType: event.hitType,
        },
      };
    case "ABSORB":
      return {
        ...base,
        kind: event.absorbKind === "DAMAGE_ABSORBED" ? "DAMAGE_ABSORBED" : "HEAL_ABSORBED",
        raw: {
          amount: event.amount,
          absorbedAbilityGameId: event.absorbedAbilityGameId,
          attributedActorId: event.attributedActorId,
        },
      };
  }
}

function coverageOf(
  fight: CombatFight,
  category: DeathTimelineCategory,
  window: DeathTimelineWindow,
  actorId: number,
): DeathTimelineCoverage {
  const gate = gateAbsenceClaim({
    completeness: fight.completeness,
    category,
    range: inclusiveRange(window.fromReportTimeMs, window.toReportTimeMs),
    actorId,
  });
  return gate.ok ? { state: "COMPLETE" } : { state: "UNKNOWN", reason: gate.reason };
}

/**
 * The death timelines of one actor in one fight: one per positive death of
 * any instance of `actorId`, each over its own instance's events.
 */
export function deathTimelinesOf(
  fight: CombatFight,
  actorId: number,
  lookbackMs: number = DEFAULT_DEATH_TIMELINE_LOOKBACK_MS,
): DeathTimelineReport {
  if (!Number.isSafeInteger(lookbackMs) || lookbackMs < 0) {
    throw new RangeError(`lookbackMs must be a non-negative integer, got ${String(lookbackMs)}`);
  }
  const deaths = observedDeathsOf(fight)
    .observed.filter((death) => death.actor.actorId === actorId)
    .sort((a, b) => a.reportTimeMs - b.reportTimeMs || a.position - b.position);

  // Every event targeting the actor, in chronological order, read once.
  const targeting = fight.events
    .filter((event) => event.target !== null && event.target.actorId === actorId)
    .sort((a, b) => a.reportTimeMs - b.reportTimeMs || a.ingestionOrdinal - b.ingestionOrdinal);

  const fightStart = fight.fight.startTimeMs;
  const timelines = deaths.map((death, index): DeathTimeline => {
    const key = death.actor;
    const deathMs = death.reportTimeMs;
    const requested = deathMs - lookbackMs;
    const previous = deaths
      .slice(0, index)
      .filter((earlier) => sameKey(earlier.actor, key) && earlier.reportTimeMs < deathMs)
      .at(-1);
    let from = requested;
    let clampedBy: DeathTimelineWindow["clampedBy"] = null;
    if (from < fightStart) {
      from = fightStart;
      clampedBy = "FIGHT_START";
    }
    if (previous !== undefined && from <= previous.reportTimeMs) {
      from = previous.reportTimeMs + 1;
      clampedBy = "PREVIOUS_DEATH";
    }
    const window: DeathTimelineWindow = { fromReportTimeMs: from, toReportTimeMs: deathMs, clampedBy };

    const entries: DeathTimelineEntry[] = [];
    for (const event of targeting) {
      if (event.reportTimeMs < from || event.reportTimeMs > deathMs) continue;
      if (event.target === null || !sameKey(event.target, key)) continue;
      if (event.kind === "DAMAGE" || event.kind === "HEALING" || event.kind === "ABSORB") {
        entries.push(entryOf(event, key, deathMs));
      }
    }

    return {
      death,
      window,
      entries,
      coverage: {
        DAMAGE: coverageOf(fight, "DAMAGE", window, actorId),
        HEALING: coverageOf(fight, "HEALING", window, actorId),
        ABSORBS: coverageOf(fight, "ABSORBS", window, actorId),
      },
    };
  });

  return {
    revision: DEATH_TIMELINE_REVISION,
    authority: "WCL_OBSERVED_FACT",
    actorId,
    lookbackMs,
    timelines,
    absenceSemantics: "NONE",
  };
}
