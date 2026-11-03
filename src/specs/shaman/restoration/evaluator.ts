/**
 * RESTORATION SHAMAN EVALUATOR (M12-D): the first healer specialization
 * evaluator, internal.
 *
 * Owner decision (2026-10-31, agent/autopilot-queue.md "M12-D"): Restoration
 * Shaman first, with exactly three decision categories in v1.
 *
 * ASSIGNMENT. Authority is a supplied raid cooldown plan, and nothing else:
 * the shared normalized `RaidCooldownPlan` (M12-E), resolved against this
 * fight by `src/raid-plan/resolve.ts`.
 * - No plan: NO_AUTHORITY_AVAILABLE. Assignments are never inferred from what
 *   other healers did. A plan for another encounter or difficulty is no
 *   authority for this fight either: NO_AUTHORITY_AVAILABLE. A plan whose
 *   binding cannot be established (no reported difficulty) is UNKNOWN.
 * - Only this player's assignments of its identified healing cooldowns are
 *   evaluated. Its other assignments (a kick, a CC, an unregistered id) are
 *   listed as not evaluated, never reinterpreted.
 * - An assignment whose player cannot be resolved but may be this player, or
 *   whose planned time cannot be resolved (a phase label with no reviewed
 *   map), is ASSIGNMENT_UNKNOWN with that reason.
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
 *
 * HEAL-B1. The spec-independent parts of this evaluator moved, unchanged in
 * behavior, to shared modules when three more healer specializations needed
 * them: the observed uses and their overlap to
 * `src/healing/cooldown-use-context.ts`, and the plan rules to
 * `src/findings/healer-assignment-execution.ts`. Their types are re-exported
 * here under the same names. This module still owns the identity gate, its
 * healing-cooldown data, the decision to count the player's stated pets as
 * its sources, and the decision to judge its assignments by the shared plan
 * rules.
 */

import type { CombatFight } from "../../../engine/normalization/combat-fight.js";
import type { RaidCooldownPlan } from "../../../raid-plan/raid-cooldown-plan.js";
import {
  pinnedRestorationShamanHealingCooldowns,
  type RestorationShamanHealingCooldownLoad,
} from "../../../data/game/shaman-restoration-healing-cooldowns.js";
import {
  evaluateAssignmentExecution,
  type AssignmentEvaluation,
} from "../../../findings/healer-assignment-execution.js";
import {
  cooldownUseListingOf,
  cooldownUseOverlapOf,
  observedCooldownCastsOf,
  statedPetSourcesOf,
  unidentifiedCastTimesOf,
  type CooldownUse,
  type CooldownUseListing,
} from "../../../healing/cooldown-use-context.js";
import type { FightIdentity } from "../../../wcl/types.js";

import {
  RESTORATION_SHAMAN_EVALUATOR_REVISION,
  RESTORATION_SHAMAN_WCL_CLASS_NAME,
  RESTORATION_SHAMAN_WCL_SPEC_NAME,
} from "./spec.js";

export type {
  AssignmentEvaluation,
  AssignmentReference,
  AssignmentResult,
  AssignmentUnknownReason,
  NotEvaluatedAssignment,
  PlanAuthority,
} from "../../../findings/healer-assignment-execution.js";
export type {
  CooldownUse,
  EpisodeOverlap,
  ObservedCooldownCast,
  OverlapListing,
} from "../../../healing/cooldown-use-context.js";

/** The span after a cast within which an episode is reported as overlapping. A reporting window, not an effect duration. */
export const DEFAULT_COOLDOWN_OVERLAP_SPAN_MS = 10_000;

export interface CooldownObservation {
  readonly category: "COOLDOWN";
  readonly authority: "WCL_OBSERVED_FACT";
  /**
   * COMPLETE: every identified healing cooldown the player cast in the fight is
   * listed. It needs the player's CASTS coverage over the fight AND no
   * completed cast of the player without an ability id, since any such cast
   * could be an unlisted cooldown.
   */
  readonly listing: CooldownUseListing;
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

/**
 * The subject identity the gate and the plan reader use. The identity
 * preflight's `FightIdentity` is one; HEAL-A's registration facade builds one
 * from the normalized fight's own report, fight, actor name and stated
 * specialization.
 */
export interface RestorationShamanSubjectIdentity {
  readonly report: Pick<FightIdentity["report"], "code">;
  readonly fight: Pick<FightIdentity["fight"], "id">;
  readonly player: Pick<FightIdentity["player"], "sourceId" | "className" | "specName"> & {
    /**
     * The player's character name, or `null` when no source states it. Null
     * never means "named nothing": every unresolved plan entry may then be
     * this player's.
     */
    readonly name: string | null;
  };
}

export interface RestorationShamanInput {
  readonly fight: CombatFight;
  /** The identity of the player under evaluation (the preflight's, or the facade's). */
  readonly identity: RestorationShamanSubjectIdentity;
  /** The caller's normalized raid cooldown plan, or `null` when none was supplied. */
  readonly plan: RaidCooldownPlan | null;
  readonly overlapSpanMs?: number;
  /** Test seam: the runtime dataset. */
  readonly dataset?: RestorationShamanHealingCooldownLoad;
}

type Refusal = Extract<RestorationShamanEvaluation, { state: "IDENTITY_REFUSED" }>["reason"];

function identityRefusal(fight: CombatFight, identity: RestorationShamanSubjectIdentity): Refusal | null {
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
  const casts = observedCooldownCastsOf(fight, subject, identified);
  // This specialization counts its Warcraft Logs-stated pets (its totems) as its own sources.
  const subjectSources = statedPetSourcesOf(fight, subject);
  // A completed cast of the player with no ability id could be any cooldown.
  const unidentifiedCastTimes = unidentifiedCastTimesOf(fight, subject);

  const assignment = evaluateAssignmentExecution({
    fight,
    subject: { actorId: subject, name: identity.player.name },
    plan,
    identified,
    casts,
    unidentifiedCastTimes,
  });

  return {
    revision,
    state: "EVALUATED",
    subjectActorId: subject,
    dataset: { datasetId: dataset.datasetId, artifactRevision: dataset.artifactRevision },
    assignment,
    cooldowns: {
      category: "COOLDOWN",
      authority: "WCL_OBSERVED_FACT",
      listing: cooldownUseListingOf(fight, subject, unidentifiedCastTimes),
      uses: cooldownUseOverlapOf(fight, casts, new Set(subjectSources), spanMs),
      subjectSources,
    },
    healingDecision: {
      category: "HEALING_DECISION",
      status: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_APPROVED_PER_CAST_HEALER_MODEL",
    },
  };
}
