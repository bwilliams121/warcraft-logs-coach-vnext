/**
 * PRESERVATION EVOKER EVALUATOR (HEAL-B4): a healer specialization evaluator
 * on the healer architecture Restoration Shaman proved (M12-D, HEAL-A),
 * internal, and its own representative.
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
 * WHY ITS OWN REPRESENTATIVE.
 *
 * - EMPOWERED CASTS. Preservation casts empowered spells (Dream Breath,
 *   Spiritbloom, Fire Breath), and for those a `cast` event is NOT a
 *   completed cast. The committed M13-A capture records each empowered cast
 *   as an `empowerstart`, a `cast` of the same spell at that start (in its
 *   millisecond, or one later), and an `empowerend` (the release) later; an empowered spell made instant
 *   records the `cast` alone. So the shared rule "a use is a completed
 *   `cast`" holds only for an ability that is not empowered. No identified
 *   ability is empowered (Rewind, Dream Flight, Stasis), and this evaluator
 *   checks that against the evidence: an empower envelope from the player of
 *   an identified ability contradicts the data, and the evaluation stops as
 *   RUNTIME_DATA_CONTRADICTED with the envelopes as evidence, rather than
 *   counting a start as a use. The empower envelopes are otherwise never
 *   read: their empowerment level is not decoded and nothing is judged from
 *   them.
 * - ROLE. The pinned roster leaves Preservation's role UNKNOWN. Nothing here
 *   reads or infers a role (`./spec.ts`).
 *
 * WHAT THIS MODULE OWNS. The identity gate (Evoker, Preservation, an Evoker
 * player in the fight's master data); which abilities are its healing
 * cooldowns (`src/data/game/evoker-preservation-healing-cooldowns.json`:
 * Rewind, and Dream Flight and Stasis on one choice node); that a use is its
 * own completed cast of a non-empowered identified ability (Stasis's release
 * is another spell's cast and is never a use); the empower contradiction
 * check; that its stated pets count as its sources; and the decision to judge
 * its assignments by the shared plan rules. The shared modules supply the
 * facts and the plan rules, and decide nothing about Preservation.
 */

import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { CombatFight } from "../../../engine/normalization/combat-fight.js";
import type { RaidCooldownPlan } from "../../../raid-plan/raid-cooldown-plan.js";
import {
  pinnedPreservationEvokerHealingCooldowns,
  type PreservationEvokerHealingCooldownLoad,
} from "../../../data/game/evoker-preservation-healing-cooldowns.js";
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
  PRESERVATION_EVOKER_EVALUATOR_REVISION,
  PRESERVATION_EVOKER_WCL_CLASS_NAME,
  PRESERVATION_EVOKER_WCL_SPEC_NAME,
} from "./spec.js";

/** The span after a cast within which an episode is reported as overlapping. A reporting window, not an effect duration. */
export const DEFAULT_COOLDOWN_OVERLAP_SPAN_MS = 10_000;

/** Warcraft Logs' empowered-cast envelope types, verbatim (envelope-only in normalization). */
export const EMPOWER_ENVELOPE_TYPES: readonly string[] = Object.freeze(["empowerstart", "empowerend"]);

export interface PreservationEvokerCooldownObservation {
  readonly category: "COOLDOWN";
  readonly authority: "WCL_OBSERVED_FACT";
  /** COMPLETE: every identified healing cooldown the player cast in the fight is listed. */
  readonly listing: CooldownUseListing;
  readonly uses: readonly CooldownUse[];
  /** The player's own actor plus every actor whose Warcraft Logs `petOwner` is the player. */
  readonly subjectSources: readonly number[];
}

/** One empower envelope from the player of an ability the data names as a (non-empowered) healing cooldown. */
export interface EmpoweredIdentifiedObservation {
  readonly rawType: string;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly locator: EvidenceLocator;
}

export type PreservationEvokerEvaluation =
  | {
      readonly revision: typeof PRESERVATION_EVOKER_EVALUATOR_REVISION;
      readonly state: "IDENTITY_REFUSED";
      readonly reason:
        "IDENTITY_MISMATCH" | "NOT_THIS_SPECIALIZATION" | "IDENTITY_UNRESOLVED" | "IDENTITY_CONFLICT";
    }
  | {
      readonly revision: typeof PRESERVATION_EVOKER_EVALUATOR_REVISION;
      readonly state: "RUNTIME_DATA_UNAVAILABLE";
      readonly reason: string;
    }
  | {
      readonly revision: typeof PRESERVATION_EVOKER_EVALUATOR_REVISION;
      readonly state: "RUNTIME_DATA_CONTRADICTED";
      readonly reason: "IDENTIFIED_ABILITY_OBSERVED_EMPOWERED";
      /** Every such envelope, in event order. Nothing was evaluated. */
      readonly evidence: readonly EmpoweredIdentifiedObservation[];
    }
  | {
      readonly revision: typeof PRESERVATION_EVOKER_EVALUATOR_REVISION;
      readonly state: "EVALUATED";
      readonly subjectActorId: number;
      readonly dataset: { readonly datasetId: string; readonly artifactRevision: string };
      readonly assignment: AssignmentEvaluation;
      readonly cooldowns: PreservationEvokerCooldownObservation;
      readonly healingDecision: {
        readonly category: "HEALING_DECISION";
        readonly status: "NO_AUTHORITY_AVAILABLE";
        readonly reason: "NO_APPROVED_PER_CAST_HEALER_MODEL";
      };
    };

/** The subject identity the gate and the plan reader use (the registration facade builds it). */
export interface PreservationEvokerSubjectIdentity {
  readonly report: Pick<FightIdentity["report"], "code">;
  readonly fight: Pick<FightIdentity["fight"], "id">;
  readonly player: Pick<FightIdentity["player"], "sourceId" | "className" | "specName"> & {
    /** The player's character name, or `null` when no source states it: every unresolved plan entry may then be this player's. */
    readonly name: string | null;
  };
}

export interface PreservationEvokerInput {
  readonly fight: CombatFight;
  readonly identity: PreservationEvokerSubjectIdentity;
  /** The caller's normalized raid cooldown plan, or `null` when none was supplied. */
  readonly plan: RaidCooldownPlan | null;
  readonly overlapSpanMs?: number;
  /** Test seam: the runtime dataset. */
  readonly dataset?: PreservationEvokerHealingCooldownLoad;
}

type Refusal = Extract<PreservationEvokerEvaluation, { state: "IDENTITY_REFUSED" }>["reason"];

function identityRefusal(fight: CombatFight, identity: PreservationEvokerSubjectIdentity): Refusal | null {
  if (identity.report.code !== fight.report.code || identity.fight.id !== fight.fight.id) {
    return "IDENTITY_MISMATCH";
  }
  const { player } = identity;
  if (
    player.className !== PRESERVATION_EVOKER_WCL_CLASS_NAME ||
    player.specName !== PRESERVATION_EVOKER_WCL_SPEC_NAME
  ) {
    return "NOT_THIS_SPECIALIZATION";
  }
  const actor = fight.actors.get(player.sourceId);
  if (actor === undefined) return "IDENTITY_UNRESOLVED";
  if (actor.actorType !== "PLAYER" || actor.subType !== PRESERVATION_EVOKER_WCL_CLASS_NAME)
    return "IDENTITY_CONFLICT";
  return null;
}

/**
 * The player's empower envelopes of identified abilities, anywhere in the
 * retrieved events: each one contradicts the data's claim that the ability is
 * not empowered, whatever its time.
 */
function empoweredIdentifiedOf(
  fight: CombatFight,
  actorId: number,
  identified: ReadonlySet<number>,
): EmpoweredIdentifiedObservation[] {
  const found: EmpoweredIdentifiedObservation[] = [];
  for (const event of fight.events) {
    if (event.kind !== "ENVELOPE_ONLY" || !EMPOWER_ENVELOPE_TYPES.includes(event.rawType)) continue;
    if (event.source?.actorId !== actorId) continue;
    if (event.abilityGameId === null || !identified.has(event.abilityGameId)) continue;
    found.push({
      rawType: event.rawType,
      abilityGameId: event.abilityGameId,
      reportTimeMs: event.reportTimeMs,
      locator: event.locator,
    });
  }
  return found;
}

/** Evaluates one Preservation Evoker in one fight. Pure. */
export function evaluatePreservationEvoker(input: PreservationEvokerInput): PreservationEvokerEvaluation {
  const revision = PRESERVATION_EVOKER_EVALUATOR_REVISION;
  const { fight, identity, plan } = input;
  const refusal = identityRefusal(fight, identity);
  if (refusal !== null) return { revision, state: "IDENTITY_REFUSED", reason: refusal };
  const dataset = input.dataset ?? pinnedPreservationEvokerHealingCooldowns();
  if (!dataset.ok) return { revision, state: "RUNTIME_DATA_UNAVAILABLE", reason: dataset.reason };
  const spanMs = input.overlapSpanMs ?? DEFAULT_COOLDOWN_OVERLAP_SPAN_MS;
  if (!Number.isSafeInteger(spanMs) || spanMs < 0) {
    throw new RangeError(`overlapSpanMs must be a non-negative integer, got ${String(spanMs)}`);
  }

  const subject = identity.player.sourceId;
  const identified = new Set(dataset.cooldowns.map((cooldown) => cooldown.abilityGameId));
  // An identified ability seen empowered: its `cast` may be a start, not a use. Stop rather than count it.
  const empowered = empoweredIdentifiedOf(fight, subject, identified);
  if (empowered.length > 0) {
    return {
      revision,
      state: "RUNTIME_DATA_CONTRADICTED",
      reason: "IDENTIFIED_ABILITY_OBSERVED_EMPOWERED",
      evidence: empowered,
    };
  }
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
