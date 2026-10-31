/**
 * RESTORATION SHAMAN EVALUATOR (M12-D): the first healer specialization
 * evaluator, internal.
 *
 * Owner decision (2026-10-31, agent/autopilot-queue.md "M12-D"): Restoration
 * Shaman first, with exactly three decision categories in v1.
 *
 * ASSIGNMENT. Authority is a supplied raid cooldown plan, and nothing else.
 * - No plan: NO_AUTHORITY_AVAILABLE. Assignments are never inferred from what
 *   other healers did.
 * - A plan entry for this player and one of its identified healing cooldowns:
 *   - ASSIGNMENT_MET when the player's own cast of that ability lies in the
 *     planned window. The cast is the positive actionability evidence.
 *   - ASSIGNMENT_NOT_ACTIONABLE when the completed encounter ended before the
 *     window opened.
 *   - ASSIGNMENT_UNKNOWN otherwise, with the reason. In particular, no cast in
 *     a COMPLETE-covered window is still UNKNOWN: the pinned data claims no
 *     cooldown, so whether the ability was ready is not established, and a
 *     missed assignment needs that positive evidence. MISSED, EARLY and LATE
 *     are therefore not reachable in v1 (agent/follow-ups.md "After M12-D").
 *
 * COOLDOWN. Observational only. Each identified healing cooldown the player
 * cast, when, and which damage episodes overlap it, with the healing and
 * absorbs from the player and its Warcraft Logs-stated pets in them. No
 * verdict: nothing says a cooldown should or should not have been used.
 *
 * HEALING_DECISION. Per-cast spell choice is NO_AUTHORITY_AVAILABLE: no
 * approved, machine-usable per-cast healer model exists.
 *
 * The shared healing primitives (`src/healing/`) supply the facts; this module
 * decides what they mean for this specialization, and nothing else does.
 */

import { inclusiveRange } from "../../../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { CombatFight } from "../../../engine/normalization/combat-fight.js";
import type { CastEvent } from "../../../engine/normalization/normalized-events.js";
import { gateAbsenceClaim, type UnknownReason } from "../../../engine/state/state-result.js";
import {
  pinnedRestorationShamanHealingCooldowns,
  type RestorationShamanHealingCooldownLoad,
} from "../../../data/game/shaman-restoration-healing-cooldowns.js";
import {
  provenActionableByObservedExecution,
  type ActionabilityEvidence,
} from "../../../findings/actionability.js";
import type { DamageEpisode } from "../../../healing/damage-episodes.js";
import {
  receivedDuringEpisodesOf,
  type ReceivedCoverage,
} from "../../../healing/received-during-episodes.js";
import type { FightIdentity } from "../../../wcl/types.js";

import {
  RESTORATION_SHAMAN_EVALUATOR_REVISION,
  RESTORATION_SHAMAN_WCL_CLASS_NAME,
  RESTORATION_SHAMAN_WCL_SPEC_NAME,
} from "./spec.js";

/** The span after a cast within which an episode is reported as overlapping. A reporting window, not an effect duration. */
export const DEFAULT_COOLDOWN_OVERLAP_SPAN_MS = 10_000;

/**
 * One planned cooldown, in the normalized form agent/architecture.md "Raid
 * Cooldown Assignments" sketches (player, ability, planned time, tolerance,
 * source). How a plan is written and supplied is M12-E's owner decision; it
 * maps onto this. Nothing in production supplies one yet.
 */
export interface PlannedCooldownAssignment {
  readonly assignmentId: string;
  readonly actorId: number;
  readonly abilityGameId: number;
  readonly plannedReportTimeMs: number;
  /** Either side of the planned time. Stated by the plan, never defaulted here. */
  readonly toleranceMs: number;
}

export interface RaidCooldownPlan {
  /** Who authored the plan, verbatim. The authority every assignment verdict cites. */
  readonly source: string;
  readonly assignments: readonly PlannedCooldownAssignment[];
}

export interface ObservedCooldownCast {
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  /** Canonical index into `CombatFight.events`. */
  readonly position: number;
  readonly locator: EvidenceLocator;
}

export type AssignmentUnknownReason =
  | "ASSIGNMENT_INVALID"
  | "ABILITY_NOT_IDENTIFIED"
  | "WINDOW_OUTSIDE_FIGHT"
  | "READINESS_NOT_ESTABLISHED"
  /** A completed cast by the player with no ability id lies in the window: it could be this one. */
  | "UNIDENTIFIED_SUBJECT_CAST"
  | UnknownReason;

export type AssignmentResult =
  | {
      readonly status: "ASSIGNMENT_MET";
      readonly assignmentId: string;
      readonly window: { readonly fromReportTimeMs: number; readonly toReportTimeMs: number };
      readonly cast: ObservedCooldownCast;
      readonly actionability: ActionabilityEvidence;
    }
  | {
      readonly status: "ASSIGNMENT_NOT_ACTIONABLE";
      readonly assignmentId: string;
      readonly window: { readonly fromReportTimeMs: number; readonly toReportTimeMs: number };
      readonly reason: "ENCOUNTER_ENDED_BEFORE_WINDOW";
      readonly fightEndReportTimeMs: number;
    }
  | {
      readonly status: "ASSIGNMENT_UNKNOWN";
      readonly assignmentId: string;
      readonly reason: AssignmentUnknownReason;
      /** The player's observed casts of the ability nearest the window, as context. Never classified early or late. */
      readonly nearestObservedCasts: {
        readonly before: ObservedCooldownCast | null;
        readonly after: ObservedCooldownCast | null;
      };
    };

export type AssignmentEvaluation =
  | {
      readonly category: "ASSIGNMENT";
      readonly status: "NO_AUTHORITY_AVAILABLE";
      readonly reason: "NO_RAID_COOLDOWN_PLAN";
    }
  | {
      readonly category: "ASSIGNMENT";
      readonly status: "EVALUATED";
      readonly authority: { readonly kind: "RAID_COOLDOWN_PLAN"; readonly source: string };
      /** One per plan entry naming this player, in plan order. Empty when the plan assigns this player nothing. */
      readonly results: readonly AssignmentResult[];
      readonly assignmentsForOtherPlayers: number;
    };

export interface EpisodeOverlap {
  readonly episodeAbilityGameId: number;
  readonly firstHitMs: number;
  readonly lastHitMs: number;
  /** The episode's own DAMAGE coverage: UNKNOWN means its player set may be incomplete. */
  readonly episodeCoverage: DamageEpisode["coverage"];
  /** Per player the episode hit: entries from the player or its stated pets in the episode's window, and that list's coverage. */
  readonly players: readonly {
    readonly actorId: number;
    readonly entriesFromSubject: number;
    readonly coverage: { readonly HEALING: ReceivedCoverage; readonly ABSORBS: ReceivedCoverage };
  }[];
}

/**
 * COMPLETE when DAMAGE evidence holds for every roster player over the span
 * widened by the episodes' grouping gap on both sides, inside the fight, with
 * no ability-less roster hit there. Then any episode reaching into the span
 * has an observed hit in that range, so none is missing from the list. This
 * is the M12-B episode-coverage rule applied to the span.
 */
export type OverlapListing =
  | { readonly state: "COMPLETE" }
  | {
      readonly state: "UNKNOWN";
      /** The widened span runs past the fight's start or end. */
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

export interface CooldownObservation {
  readonly category: "COOLDOWN";
  readonly authority: "WCL_OBSERVED_FACT";
  /**
   * COMPLETE: every identified healing cooldown the player cast in the fight is
   * listed. It needs the player's CASTS coverage over the fight AND no
   * completed cast of the player without an ability id, since any such cast
   * could be an unlisted cooldown.
   */
  readonly listing:
    | { readonly state: "COMPLETE" }
    | {
        readonly state: "UNKNOWN";
        readonly reason: UnknownReason | "UNIDENTIFIED_SUBJECT_CAST";
        /** Completed casts by the player inside the fight that carry no ability id. */
        readonly unidentifiedCasts: number;
      };
  readonly uses: readonly CooldownUse[];
  /** The player's own actor plus every actor whose Warcraft Logs `petOwner` is the player. */
  readonly subjectSources: readonly number[];
}

export interface HealingDecisionEvaluation {
  readonly category: "HEALING_DECISION";
  readonly status: "NO_AUTHORITY_AVAILABLE";
  readonly reason: "NO_APPROVED_PER_CAST_HEALER_MODEL";
}

export type RestorationShamanEvaluation =
  | {
      readonly revision: typeof RESTORATION_SHAMAN_EVALUATOR_REVISION;
      readonly state: "IDENTITY_REFUSED";
      readonly reason:
        "IDENTITY_MISMATCH" | "NOT_THIS_SPECIALIZATION" | "IDENTITY_UNRESOLVED" | "IDENTITY_CONFLICT";
    }
  | {
      readonly revision: typeof RESTORATION_SHAMAN_EVALUATOR_REVISION;
      readonly state: "RUNTIME_DATA_UNAVAILABLE";
      readonly reason: string;
    }
  | {
      readonly revision: typeof RESTORATION_SHAMAN_EVALUATOR_REVISION;
      readonly state: "EVALUATED";
      readonly subjectActorId: number;
      readonly dataset: { readonly datasetId: string; readonly artifactRevision: string };
      readonly assignment: AssignmentEvaluation;
      readonly cooldowns: CooldownObservation;
      readonly healingDecision: HealingDecisionEvaluation;
    };

export interface RestorationShamanInput {
  readonly fight: CombatFight;
  /** The identity preflight's result for the player under evaluation. */
  readonly identity: FightIdentity;
  /** The authoritative raid cooldown plan, or `null` when none was supplied. */
  readonly plan: RaidCooldownPlan | null;
  readonly overlapSpanMs?: number;
  /** Test seam: the runtime dataset. */
  readonly dataset?: RestorationShamanHealingCooldownLoad;
}

type Refusal = Extract<RestorationShamanEvaluation, { state: "IDENTITY_REFUSED" }>["reason"];

function identityRefusal(fight: CombatFight, identity: FightIdentity): Refusal | null {
  if (identity.report.code !== fight.report.code || identity.fight.id !== fight.fight.id) {
    return "IDENTITY_MISMATCH";
  }
  const { player } = identity;
  if (
    player.className !== RESTORATION_SHAMAN_WCL_CLASS_NAME ||
    player.specName !== RESTORATION_SHAMAN_WCL_SPEC_NAME
  ) {
    return "NOT_THIS_SPECIALIZATION";
  }
  const actor = fight.actors.get(player.sourceId);
  if (actor === undefined) return "IDENTITY_UNRESOLVED";
  if (actor.actorType !== "PLAYER" || actor.subType !== RESTORATION_SHAMAN_WCL_CLASS_NAME)
    return "IDENTITY_CONFLICT";
  return null;
}

/** The player's completed casts of identified cooldowns inside the encounter, bounds inclusive. */
function castsOf(fight: CombatFight, subject: number, ids: ReadonlySet<number>): ObservedCooldownCast[] {
  const { startTimeMs, endTimeMs } = fight.fight;
  const casts: ObservedCooldownCast[] = [];
  fight.events.forEach((event, position) => {
    if (event.kind !== "CAST") return;
    const cast: CastEvent = event;
    if (cast.castPhase !== "COMPLETE" || cast.source?.actorId !== subject) return;
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

function evaluateAssignment(
  fight: CombatFight,
  subject: number,
  identified: ReadonlySet<number>,
  casts: readonly ObservedCooldownCast[],
  unidentifiedCastTimes: readonly number[],
  entry: PlannedCooldownAssignment,
): AssignmentResult {
  const ofAbility = casts.filter((cast) => cast.abilityGameId === entry.abilityGameId);
  const unknown = (reason: AssignmentUnknownReason, from: number, to: number): AssignmentResult => ({
    status: "ASSIGNMENT_UNKNOWN",
    assignmentId: entry.assignmentId,
    reason,
    nearestObservedCasts: {
      before: [...ofAbility].reverse().find((cast) => cast.reportTimeMs < from) ?? null,
      after: ofAbility.find((cast) => cast.reportTimeMs > to) ?? null,
    },
  });
  if (
    !Number.isSafeInteger(entry.plannedReportTimeMs) ||
    !Number.isSafeInteger(entry.toleranceMs) ||
    entry.toleranceMs < 0
  ) {
    return unknown("ASSIGNMENT_INVALID", entry.plannedReportTimeMs, entry.plannedReportTimeMs);
  }
  const window = {
    fromReportTimeMs: entry.plannedReportTimeMs - entry.toleranceMs,
    toReportTimeMs: entry.plannedReportTimeMs + entry.toleranceMs,
  };
  if (!identified.has(entry.abilityGameId)) {
    return unknown("ABILITY_NOT_IDENTIFIED", window.fromReportTimeMs, window.toReportTimeMs);
  }
  const met = ofAbility.find(
    (cast) => cast.reportTimeMs >= window.fromReportTimeMs && cast.reportTimeMs <= window.toReportTimeMs,
  );
  if (met !== undefined) {
    return {
      status: "ASSIGNMENT_MET",
      assignmentId: entry.assignmentId,
      window,
      cast: met,
      actionability: provenActionableByObservedExecution({
        abilityGameId: met.abilityGameId,
        position: met.position,
        locator: met.locator,
      }),
    };
  }
  const { startTimeMs, endTimeMs, finality } = fight.fight;
  if (window.fromReportTimeMs > endTimeMs) {
    // Only a completed encounter's end is evidence that nothing was castable after it.
    if (finality !== "COMPLETED")
      return unknown("WINDOW_OUTSIDE_FIGHT", window.fromReportTimeMs, window.toReportTimeMs);
    return {
      status: "ASSIGNMENT_NOT_ACTIONABLE",
      assignmentId: entry.assignmentId,
      window,
      reason: "ENCOUNTER_ENDED_BEFORE_WINDOW",
      fightEndReportTimeMs: endTimeMs,
    };
  }
  if (window.toReportTimeMs < startTimeMs) {
    return unknown("WINDOW_OUTSIDE_FIGHT", window.fromReportTimeMs, window.toReportTimeMs);
  }
  const gate = gateAbsenceClaim({
    completeness: fight.completeness,
    category: "CASTS",
    range: inclusiveRange(
      Math.max(window.fromReportTimeMs, startTimeMs),
      Math.min(window.toReportTimeMs, endTimeMs),
    ),
    actorId: subject,
  });
  if (!gate.ok) return unknown(gate.reason, window.fromReportTimeMs, window.toReportTimeMs);
  const unidentified = unidentifiedCastTimes.some(
    (time) => time >= window.fromReportTimeMs && time <= window.toReportTimeMs,
  );
  return unknown(
    unidentified ? "UNIDENTIFIED_SUBJECT_CAST" : "READINESS_NOT_ESTABLISHED",
    window.fromReportTimeMs,
    window.toReportTimeMs,
  );
}

function overlapOf(
  fight: CombatFight,
  casts: readonly ObservedCooldownCast[],
  subjectSources: ReadonlySet<number>,
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
            .filter((group) => group.source !== null && subjectSources.has(group.source.actorId))
            .reduce((count, group) => count + group.entries.length, 0),
          coverage: player.coverage,
        })),
      }));
    return { cast, overlap: { state: "RECONSTRUCTED", spanMs, listing, episodes } };
  });
}

/** Evaluates one Restoration Shaman in one fight. Pure. */
export function evaluateRestorationShaman(input: RestorationShamanInput): RestorationShamanEvaluation {
  const revision = RESTORATION_SHAMAN_EVALUATOR_REVISION;
  const { fight, identity, plan } = input;
  const refusal = identityRefusal(fight, identity);
  if (refusal !== null) return { revision, state: "IDENTITY_REFUSED", reason: refusal };
  const dataset = input.dataset ?? pinnedRestorationShamanHealingCooldowns();
  if (!dataset.ok) return { revision, state: "RUNTIME_DATA_UNAVAILABLE", reason: dataset.reason };
  const spanMs = input.overlapSpanMs ?? DEFAULT_COOLDOWN_OVERLAP_SPAN_MS;
  if (!Number.isSafeInteger(spanMs) || spanMs < 0) {
    throw new RangeError(`overlapSpanMs must be a non-negative integer, got ${String(spanMs)}`);
  }

  const subject = identity.player.sourceId;
  const identified = new Set(dataset.cooldowns.map((cooldown) => cooldown.abilityGameId));
  const casts = castsOf(fight, subject, identified);
  const subjectSources = [
    subject,
    ...[...fight.actors.values()]
      .filter((actor) => actor.petOwnerActorId === subject)
      .map((actor) => actor.actorId),
  ].sort((a, b) => a - b);

  // A completed cast of the player with no ability id could be any cooldown.
  const unidentifiedCastTimes = fight.events
    .filter(
      (event) =>
        event.kind === "CAST" &&
        event.castPhase === "COMPLETE" &&
        event.source?.actorId === subject &&
        event.abilityGameId === null,
    )
    .map((event) => event.reportTimeMs)
    .filter((time) => time >= fight.fight.startTimeMs && time <= fight.fight.endTimeMs);
  const listingGate = gateAbsenceClaim({
    completeness: fight.completeness,
    category: "CASTS",
    range: inclusiveRange(fight.fight.startTimeMs, fight.fight.endTimeMs),
    actorId: subject,
  });
  const unidentifiedCasts = unidentifiedCastTimes.length;
  const listing: CooldownObservation["listing"] = !listingGate.ok
    ? { state: "UNKNOWN", reason: listingGate.reason, unidentifiedCasts }
    : unidentifiedCasts > 0
      ? { state: "UNKNOWN", reason: "UNIDENTIFIED_SUBJECT_CAST", unidentifiedCasts }
      : { state: "COMPLETE" };

  const assignment: AssignmentEvaluation =
    plan === null
      ? { category: "ASSIGNMENT", status: "NO_AUTHORITY_AVAILABLE", reason: "NO_RAID_COOLDOWN_PLAN" }
      : {
          category: "ASSIGNMENT",
          status: "EVALUATED",
          authority: { kind: "RAID_COOLDOWN_PLAN", source: plan.source },
          results: plan.assignments
            .filter((entry) => entry.actorId === subject)
            .map((entry) =>
              evaluateAssignment(fight, subject, identified, casts, unidentifiedCastTimes, entry),
            ),
          assignmentsForOtherPlayers: plan.assignments.filter((entry) => entry.actorId !== subject).length,
        };

  return {
    revision,
    state: "EVALUATED",
    subjectActorId: subject,
    dataset: { datasetId: dataset.datasetId, artifactRevision: dataset.artifactRevision },
    assignment,
    cooldowns: {
      category: "COOLDOWN",
      authority: "WCL_OBSERVED_FACT",
      listing,
      uses: overlapOf(fight, casts, new Set(subjectSources), spanMs),
      subjectSources,
    },
    healingDecision: {
      category: "HEALING_DECISION",
      status: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_APPROVED_PER_CAST_HEALER_MODEL",
    },
  };
}
