/**
 * Assignment execution against a supplied raid cooldown plan (HEAL-B1).
 *
 * Lifted from the Restoration Shaman evaluator (M12-D, M12-E) when three more
 * healer specializations needed exactly the same rules, unchanged in
 * behavior. These are CLAUDE.md "Healer Cooldown Assignments" rules, not any
 * specialization's gameplay: whether the plan governs this fight, whether an
 * entry names this player, and whether the player's own cast of the planned
 * ability lies in the planned window. What stays with each specialization
 * is everything that IS its own:
 *
 * - its identity gate, which runs first;
 * - which ability ids are its healing cooldowns (its reviewed runtime data);
 * - the observed casts it hands in (its own use-evidence rule);
 * - and the decision to judge its assignments by these rules at all.
 *
 * THE RULES (agent/architecture.md "M12-D", "M12-E")
 *
 * - No plan: NO_AUTHORITY_AVAILABLE. Assignments are never inferred from what
 *   this player or another healer cast. A plan for another encounter or
 *   difficulty is no authority for this fight either. A plan whose binding
 *   cannot be established is UNKNOWN.
 * - Only this player's entries of an identified ability are evaluated; its
 *   other entries are listed `notEvaluated` (ABILITY_NOT_REGISTERED), never
 *   reinterpreted. An entry that may be this player's but is not uniquely
 *   resolved, or whose time cannot be placed, is ASSIGNMENT_UNKNOWN.
 * - ASSIGNMENT_MET: the player's own completed cast of the planned ability in
 *   `[planned - tolerance, planned + tolerance]`. The cast is the positive
 *   actionability evidence.
 * - ASSIGNMENT_NOT_ACTIONABLE: a COMPLETED encounter ended before the window
 *   opened. The encounter's end is the positive evidence. An assignment
 *   outcome, not a member of the actionability vocabulary.
 * - ASSIGNMENT_UNKNOWN otherwise, with the reason. No cast in a
 *   COMPLETE-covered window is READINESS_NOT_ESTABLISHED: no pinned data
 *   proves the ability was ready, and a miss needs that proof. So MISSED,
 *   EARLY and LATE are not reachable (agent/follow-ups.md "After M12-D").
 */

import { inclusiveRange } from "../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { CombatFight } from "../engine/normalization/combat-fight.js";
import { gateAbsenceClaim, type UnknownReason } from "../engine/state/state-result.js";
import type { PlannedTime, PlanSourceReference, RaidCooldownPlan } from "../raid-plan/raid-cooldown-plan.js";
import {
  namesMatch,
  resolveRaidCooldownPlan,
  type EncounterBinding,
  type PlannedTimeResolution,
  type PlayerResolution,
  type ResolvedAssignment,
} from "../raid-plan/resolve.js";
import { provenActionableByObservedExecution, type ActionabilityEvidence } from "./actionability.js";

/** A completed cast of an identified ability by the player, as the specialization observed it. */
export interface PlanExecutionCast {
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  /** Canonical index into `CombatFight.events`. */
  readonly position: number;
  readonly locator: EvidenceLocator;
}

/** Which plan entry a result is about, traced back to the supplied plan. */
export interface AssignmentReference {
  readonly assignmentId: string;
  readonly abilityGameId: number;
  readonly plannedTime: PlannedTime;
  /** Either side of the planned time. Stated by the plan, never defaulted here. */
  readonly toleranceMs: number;
  readonly toleranceSource: "ASSIGNMENT" | "PLAN_DEFAULT";
  readonly source: PlanSourceReference;
}

export type AssignmentUnknownReason =
  | "ASSIGNMENT_INVALID"
  /** The plan names a player who may be this one, but no unique roster match is established. */
  | "PLAYER_NOT_RESOLVED"
  /** The planned time could not be placed in this fight (a phase label with no reviewed map). */
  | "PLANNED_TIME_UNRESOLVED"
  | "WINDOW_OUTSIDE_FIGHT"
  | "READINESS_NOT_ESTABLISHED"
  /** A completed cast by the player with no ability id lies in the window: it could be this one. */
  | "UNIDENTIFIED_SUBJECT_CAST"
  | UnknownReason;

export type AssignmentResult =
  | {
      readonly status: "ASSIGNMENT_MET";
      readonly assignment: AssignmentReference;
      readonly window: { readonly fromReportTimeMs: number; readonly toReportTimeMs: number };
      readonly cast: PlanExecutionCast;
      readonly actionability: ActionabilityEvidence;
    }
  | {
      readonly status: "ASSIGNMENT_NOT_ACTIONABLE";
      readonly assignment: AssignmentReference;
      readonly window: { readonly fromReportTimeMs: number; readonly toReportTimeMs: number };
      readonly reason: "ENCOUNTER_ENDED_BEFORE_WINDOW";
      readonly fightEndReportTimeMs: number;
    }
  | {
      readonly status: "ASSIGNMENT_UNKNOWN";
      readonly assignment: AssignmentReference;
      readonly reason: AssignmentUnknownReason;
      /** For PLAYER_NOT_RESOLVED and PLANNED_TIME_UNRESOLVED, the shared resolver's own answer. */
      readonly resolution:
        | Extract<PlayerResolution, { state: "UNRESOLVED" }>
        | Extract<PlannedTimeResolution, { state: "UNRESOLVED" }>
        | null;
      /** The player's observed casts of the ability nearest the window, as context. Never classified early or late. */
      readonly nearestObservedCasts: {
        readonly before: PlanExecutionCast | null;
        readonly after: PlanExecutionCast | null;
      };
    };

export interface PlanAuthority {
  readonly kind: RaidCooldownPlan["authority"];
  readonly format: RaidCooldownPlan["source"]["format"];
  readonly label: string | null;
}

export interface NotEvaluatedAssignment {
  readonly assignment: AssignmentReference;
  readonly reason: "ABILITY_NOT_REGISTERED";
}

export type AssignmentEvaluation =
  | {
      readonly category: "ASSIGNMENT";
      readonly status: "NO_AUTHORITY_AVAILABLE";
      readonly reason: "NO_RAID_COOLDOWN_PLAN";
    }
  | {
      readonly category: "ASSIGNMENT";
      readonly status: "NO_AUTHORITY_AVAILABLE";
      /** The plan is for another encounter or difficulty: no authority for this fight. */
      readonly reason: "PLAN_NOT_FOR_THIS_FIGHT";
      readonly binding: Extract<EncounterBinding, { state: "MISMATCHED" }>;
    }
  | {
      readonly category: "ASSIGNMENT";
      readonly status: "UNKNOWN";
      readonly reason: "ENCOUNTER_BINDING_UNKNOWN";
      readonly binding: Extract<EncounterBinding, { state: "UNKNOWN" }>;
    }
  | {
      readonly category: "ASSIGNMENT";
      readonly status: "EVALUATED";
      readonly authority: PlanAuthority;
      /**
       * One per plan entry of an identified healing cooldown that names this
       * player, or may name it, in plan order. Empty when there is none.
       */
      readonly results: readonly AssignmentResult[];
      /** This player's entries of an ability the specialization does not identify. Never evaluated. */
      readonly notEvaluated: readonly NotEvaluatedAssignment[];
      /** Entries resolved to another player, or unresolved with no way to be this one. */
      readonly assignmentsForOtherPlayers: number;
    };

/** Everything the rules read. The specialization supplies each part. */
export interface AssignmentExecutionInput {
  readonly fight: CombatFight;
  /** The player under evaluation, after the specialization's identity gate. */
  readonly subject: {
    readonly actorId: number;
    /**
     * The player's character name, or `null` when no source states it. Null
     * never means "named nothing": every unresolved plan entry may then be
     * this player's.
     */
    readonly name: string | null;
  };
  /** The caller's normalized raid cooldown plan, or `null` when none was supplied. */
  readonly plan: RaidCooldownPlan | null;
  /** The specialization's identified healing-cooldown ids. */
  readonly identified: ReadonlySet<number>;
  /** The player's completed casts of identified abilities inside the encounter, in time order. */
  readonly casts: readonly PlanExecutionCast[];
  /** Report times of the player's completed casts inside the encounter with no ability id. */
  readonly unidentifiedCastTimes: readonly number[];
}

function referenceOf({ assignment }: ResolvedAssignment): AssignmentReference {
  return {
    assignmentId: assignment.assignmentId,
    abilityGameId: assignment.abilityId,
    plannedTime: assignment.plannedTime,
    toleranceMs: assignment.toleranceMs,
    toleranceSource: assignment.toleranceSource,
    source: assignment.source,
  };
}

type UnknownResult = Extract<AssignmentResult, { status: "ASSIGNMENT_UNKNOWN" }>;

function unresolvedResult(
  entry: AssignmentReference,
  reason: "PLAYER_NOT_RESOLVED" | "PLANNED_TIME_UNRESOLVED",
  resolution: NonNullable<UnknownResult["resolution"]>,
): AssignmentResult {
  // No window was placed, so no observed cast is nearer to it than another.
  return {
    status: "ASSIGNMENT_UNKNOWN",
    assignment: entry,
    reason,
    resolution,
    nearestObservedCasts: { before: null, after: null },
  };
}

function evaluateAssignment(
  fight: CombatFight,
  subject: number,
  casts: readonly PlanExecutionCast[],
  unidentifiedCastTimes: readonly number[],
  entry: AssignmentReference,
  plannedReportTimeMs: number,
): AssignmentResult {
  const ofAbility = casts.filter((cast) => cast.abilityGameId === entry.abilityGameId);
  const unknown = (reason: AssignmentUnknownReason, from: number, to: number): AssignmentResult => ({
    status: "ASSIGNMENT_UNKNOWN",
    assignment: entry,
    reason,
    resolution: null,
    nearestObservedCasts: {
      before: [...ofAbility].reverse().find((cast) => cast.reportTimeMs < from) ?? null,
      after: ofAbility.find((cast) => cast.reportTimeMs > to) ?? null,
    },
  });
  if (
    !Number.isSafeInteger(plannedReportTimeMs) ||
    !Number.isSafeInteger(entry.toleranceMs) ||
    entry.toleranceMs < 0
  ) {
    return unknown("ASSIGNMENT_INVALID", plannedReportTimeMs, plannedReportTimeMs);
  }
  const window = {
    fromReportTimeMs: plannedReportTimeMs - entry.toleranceMs,
    toReportTimeMs: plannedReportTimeMs + entry.toleranceMs,
  };
  const met = ofAbility.find(
    (cast) => cast.reportTimeMs >= window.fromReportTimeMs && cast.reportTimeMs <= window.toReportTimeMs,
  );
  if (met !== undefined) {
    return {
      status: "ASSIGNMENT_MET",
      assignment: entry,
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
      assignment: entry,
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

/** The player's assignments under the supplied plan. Pure. See the module header. */
export function evaluateAssignmentExecution(input: AssignmentExecutionInput): AssignmentEvaluation {
  const { fight, plan, identified, casts, unidentifiedCastTimes } = input;
  if (plan === null) {
    return { category: "ASSIGNMENT", status: "NO_AUTHORITY_AVAILABLE", reason: "NO_RAID_COOLDOWN_PLAN" };
  }
  const resolved = resolveRaidCooldownPlan(plan, fight);
  if (resolved.state === "NOT_BOUND") {
    const { binding } = resolved;
    return binding.state === "MISMATCHED"
      ? {
          category: "ASSIGNMENT",
          status: "NO_AUTHORITY_AVAILABLE",
          reason: "PLAN_NOT_FOR_THIS_FIGHT",
          binding,
        }
      : { category: "ASSIGNMENT", status: "UNKNOWN", reason: "ENCOUNTER_BINDING_UNKNOWN", binding };
  }

  const subject = input.subject.actorId;
  const subjectName = input.subject.name;
  const results: AssignmentResult[] = [];
  const notEvaluated: NotEvaluatedAssignment[] = [];
  let assignmentsForOtherPlayers = 0;
  for (const entry of resolved.assignments) {
    const { player, time } = entry;
    const mine = player.state === "RESOLVED" && player.actorId === subject;
    // Unresolved, but this player is among the name matches, or the name is
    // the one established for this player (the roster may lack it, or name it
    // nowhere): it may be this one, whatever the reason. With no known name
    // for this player, any unresolved entry may be this one.
    const maybeMine =
      player.state === "UNRESOLVED" &&
      (player.candidateActorIds.includes(subject) ||
        subjectName === null ||
        namesMatch(entry.assignment.player.name, subjectName));
    if (!mine && !maybeMine) {
      assignmentsForOtherPlayers += 1;
      continue;
    }
    const reference = referenceOf(entry);
    if (!identified.has(entry.assignment.abilityId)) {
      notEvaluated.push({ assignment: reference, reason: "ABILITY_NOT_REGISTERED" });
      continue;
    }
    if (player.state === "UNRESOLVED") {
      results.push(unresolvedResult(reference, "PLAYER_NOT_RESOLVED", player));
    } else if (time.state === "UNRESOLVED") {
      results.push(unresolvedResult(reference, "PLANNED_TIME_UNRESOLVED", time));
    } else {
      results.push(
        evaluateAssignment(fight, subject, casts, unidentifiedCastTimes, reference, time.plannedReportTimeMs),
      );
    }
  }
  return {
    category: "ASSIGNMENT",
    status: "EVALUATED",
    authority: { kind: plan.authority, format: plan.source.format, label: plan.source.label },
    results,
    notEvaluated,
    assignmentsForOtherPlayers,
  };
}
