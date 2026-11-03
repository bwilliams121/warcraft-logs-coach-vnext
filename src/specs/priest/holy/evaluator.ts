/**
 * HOLY PRIEST EVALUATOR (HEAL-B2): a healer specialization evaluator on the
 * healer architecture Restoration Shaman proved (M12-D, HEAL-A), internal.
 *
 * The M12-D verdict-category limits apply unchanged:
 *
 * ASSIGNMENT. Authority is a supplied raid cooldown plan, and nothing else,
 * judged by the shared plan rules (`src/findings/healer-assignment-
 * execution.ts`): NO_AUTHORITY_AVAILABLE without a plan or for another
 * fight's plan, UNKNOWN for an unbindable one, and per entry for this player
 * ASSIGNMENT_MET (its own cast in the window), ASSIGNMENT_NOT_ACTIONABLE (a
 * completed encounter ended before the window) or ASSIGNMENT_UNKNOWN. No cast
 * in a covered window is READINESS_NOT_ESTABLISHED: this specialization's
 * data claims no cooldown, so a miss cannot be proven.
 *
 * COOLDOWN. Observational only: each identified healing cooldown the player
 * cast, and the damage episodes overlapping it with the healing and absorbs
 * from the player and its Warcraft Logs-stated pets in them. No verdict.
 *
 * HEALING_DECISION. NO_AUTHORITY_AVAILABLE: no approved, machine-usable
 * per-cast healer model exists.
 *
 * WHAT THIS MODULE OWNS. The identity gate (Priest, Holy, a Priest player in
 * the fight's master data); which abilities are its healing cooldowns
 * (`src/data/game/priest-holy-healing-cooldowns.json`: Divine Hymn and
 * Apotheosis); that a use is its own completed cast (a channel is used once,
 * at its cast: Divine Hymn's healing pulses are another spell's casts);
 * that its stated pets count as its sources; and the decision to judge its
 * assignments by the shared plan rules. The shared modules supply the facts
 * and the plan rules, and decide nothing about Holy Priest.
 */

import type { CombatFight } from "../../../engine/normalization/combat-fight.js";
import type { RaidCooldownPlan } from "../../../raid-plan/raid-cooldown-plan.js";
import {
  pinnedHolyPriestHealingCooldowns,
  type HolyPriestHealingCooldownLoad,
} from "../../../data/game/priest-holy-healing-cooldowns.js";
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
  HOLY_PRIEST_EVALUATOR_REVISION,
  HOLY_PRIEST_WCL_CLASS_NAME,
  HOLY_PRIEST_WCL_SPEC_NAME,
} from "./spec.js";

/** The span after a cast within which an episode is reported as overlapping. A reporting window, not an effect duration. */
export const DEFAULT_COOLDOWN_OVERLAP_SPAN_MS = 10_000;

export interface HolyPriestCooldownObservation {
  readonly category: "COOLDOWN";
  readonly authority: "WCL_OBSERVED_FACT";
  /** COMPLETE: every identified healing cooldown the player cast in the fight is listed. */
  readonly listing: CooldownUseListing;
  readonly uses: readonly CooldownUse[];
  /** The player's own actor plus every actor whose Warcraft Logs `petOwner` is the player. */
  readonly subjectSources: readonly number[];
}

export type HolyPriestEvaluation =
  | {
      readonly revision: typeof HOLY_PRIEST_EVALUATOR_REVISION;
      readonly state: "IDENTITY_REFUSED";
      readonly reason:
        "IDENTITY_MISMATCH" | "NOT_THIS_SPECIALIZATION" | "IDENTITY_UNRESOLVED" | "IDENTITY_CONFLICT";
    }
  | {
      readonly revision: typeof HOLY_PRIEST_EVALUATOR_REVISION;
      readonly state: "RUNTIME_DATA_UNAVAILABLE";
      readonly reason: string;
    }
  | {
      readonly revision: typeof HOLY_PRIEST_EVALUATOR_REVISION;
      readonly state: "EVALUATED";
      readonly subjectActorId: number;
      readonly dataset: { readonly datasetId: string; readonly artifactRevision: string };
      readonly assignment: AssignmentEvaluation;
      readonly cooldowns: HolyPriestCooldownObservation;
      readonly healingDecision: {
        readonly category: "HEALING_DECISION";
        readonly status: "NO_AUTHORITY_AVAILABLE";
        readonly reason: "NO_APPROVED_PER_CAST_HEALER_MODEL";
      };
    };

/** The subject identity the gate and the plan reader use (the registration facade builds it). */
export interface HolyPriestSubjectIdentity {
  readonly report: Pick<FightIdentity["report"], "code">;
  readonly fight: Pick<FightIdentity["fight"], "id">;
  readonly player: Pick<FightIdentity["player"], "sourceId" | "className" | "specName"> & {
    /** The player's character name, or `null` when no source states it: every unresolved plan entry may then be this player's. */
    readonly name: string | null;
  };
}

export interface HolyPriestInput {
  readonly fight: CombatFight;
  readonly identity: HolyPriestSubjectIdentity;
  /** The caller's normalized raid cooldown plan, or `null` when none was supplied. */
  readonly plan: RaidCooldownPlan | null;
  readonly overlapSpanMs?: number;
  /** Test seam: the runtime dataset. */
  readonly dataset?: HolyPriestHealingCooldownLoad;
}

type Refusal = Extract<HolyPriestEvaluation, { state: "IDENTITY_REFUSED" }>["reason"];

function identityRefusal(fight: CombatFight, identity: HolyPriestSubjectIdentity): Refusal | null {
  if (identity.report.code !== fight.report.code || identity.fight.id !== fight.fight.id) {
    return "IDENTITY_MISMATCH";
  }
  const { player } = identity;
  if (player.className !== HOLY_PRIEST_WCL_CLASS_NAME || player.specName !== HOLY_PRIEST_WCL_SPEC_NAME) {
    return "NOT_THIS_SPECIALIZATION";
  }
  const actor = fight.actors.get(player.sourceId);
  if (actor === undefined) return "IDENTITY_UNRESOLVED";
  if (actor.actorType !== "PLAYER" || actor.subType !== HOLY_PRIEST_WCL_CLASS_NAME)
    return "IDENTITY_CONFLICT";
  return null;
}

/** Evaluates one Holy Priest in one fight. Pure. */
export function evaluateHolyPriest(input: HolyPriestInput): HolyPriestEvaluation {
  const revision = HOLY_PRIEST_EVALUATOR_REVISION;
  const { fight, identity, plan } = input;
  const refusal = identityRefusal(fight, identity);
  if (refusal !== null) return { revision, state: "IDENTITY_REFUSED", reason: refusal };
  const dataset = input.dataset ?? pinnedHolyPriestHealingCooldowns();
  if (!dataset.ok) return { revision, state: "RUNTIME_DATA_UNAVAILABLE", reason: dataset.reason };
  const spanMs = input.overlapSpanMs ?? DEFAULT_COOLDOWN_OVERLAP_SPAN_MS;
  if (!Number.isSafeInteger(spanMs) || spanMs < 0) {
    throw new RangeError(`overlapSpanMs must be a non-negative integer, got ${String(spanMs)}`);
  }

  const subject = identity.player.sourceId;
  const identified = new Set(dataset.cooldowns.map((cooldown) => cooldown.abilityGameId));
  const casts = observedCooldownCastsOf(fight, subject, identified);
  // This specialization counts its Warcraft Logs-stated pets as its own sources.
  const subjectSources = statedPetSourcesOf(fight, subject);
  // A completed cast of the player with no ability id could be any cooldown.
  const unidentifiedCastTimes = unidentifiedCastTimesOf(fight, subject);

  return {
    revision,
    state: "EVALUATED",
    subjectActorId: subject,
    dataset: { datasetId: dataset.datasetId, artifactRevision: dataset.artifactRevision },
    assignment: evaluateAssignmentExecution({
      fight,
      subject: { actorId: subject, name: identity.player.name },
      plan,
      identified,
      casts,
      unidentifiedCastTimes,
    }),
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
