/**
 * The environment's versioned MODEL ASSUMPTIONS, owner-approved engine
 * approximations, recorded investigations and the standardized tank load
 * (M11-G3-4).
 *
 * An assumption is never observed knowledge. Each is named, versioned and
 * stated, appears in the reconstruction's provenance, and carries its own
 * approval state: only an OWNER_APPROVED assumption may stand in a publishable
 * environment (see publishability.ts). Changing what an assumption says, or
 * what a tank-load model generates, requires a new version/revision.
 *
 * Some approvals are SCOPED: they hold only for the fights named here, and any
 * other fight gets the same assumption PENDING its own owner decision.
 */

import { TANK_MODEL_DIRECTIVES } from "../simulation/tank-model.js";
import type { EnvironmentAssumption, TankModelId } from "./model.js";

/** Owner decision (G3-4): the retrospective ceiling simulates the completed pull with its exact end known. */
export const RETROSPECTIVE_EXACT_FIGHT_END: EnvironmentAssumption = {
  id: "RETROSPECTIVE_EXACT_FIGHT_END",
  version: 1,
  approval: "OWNER_APPROVED",
  statement:
    "The simulated APL knows the actual completed pull duration (fixed_time=1, exact max_time, vary_combat_length=0), so fight_remains is exact. Allowed because the simulation is retrospective; it is not knowledge the player had.",
};

/** Owner decision (G3-1/G3-4): tank offense is simulated under a standardized incoming-damage load. */
export const STANDARD_TANK_LOAD: EnvironmentAssumption = {
  id: "STANDARD_TANK_LOAD_V1",
  version: 1,
  approval: "OWNER_APPROVED",
  statement:
    "Standardized incoming tank damage used for offensive tank simulation; does not reconstruct encounter-specific incoming damage.",
};

/**
 * Owner decision (2026-10-22): continuous primary-boss availability, approved
 * for the fights listed below ONLY. Any other fight carries the assumption
 * PENDING its own evidence/assumption decision.
 */
export const PRIMARY_TARGET_CONTINUOUS_APPROVALS: readonly {
  readonly fightRef: string;
  readonly encounterId: number;
  readonly rationale: string;
}[] = [
  {
    fightRef: "b1PmaKrd6CDfzngc#48",
    encounterId: 3455,
    rationale:
      "Vashnik the Malignant (canonical subject): the boss is observed throughout the fight and the subject's largest observed damage gap is 2.475 s.",
  },
];

export function primaryTargetContinuous(fightRef: string, encounterId: number): EnvironmentAssumption {
  const approved = PRIMARY_TARGET_CONTINUOUS_APPROVALS.find(
    (entry) => entry.fightRef === fightRef && entry.encounterId === encounterId,
  );
  return {
    id: "PRIMARY_TARGET_CONTINUOUS_V1",
    version: 1,
    approval: approved === undefined ? "PENDING_OWNER_APPROVAL" : "OWNER_APPROVED",
    statement:
      approved === undefined
        ? "The encounter's WCL boss-subtype actor is simulated as continuously available for the whole fixed encounter. Not observed: targetability and phases are not established. Approval is per fight; this fight has none."
        : `The encounter's WCL boss-subtype actor is simulated as continuously available for the whole fixed encounter. Not observed; approved for ${approved.fightRef} only: ${approved.rationale}`,
  };
}

/**
 * Owner decision (2026-10-22): a temporary weapon enchant PROVEN at pull
 * persists for the whole fight, provided the full retained evidence holds no
 * contradictory replacement or removal. Applied only when the subject's casts
 * are COMPLETE for the fight (a replacement would be a cast) — never to an
 * unknown enchant.
 */
export const TEMPORARY_ENCHANT_WHOLE_FIGHT: EnvironmentAssumption = {
  id: "TEMPORARY_ENCHANT_PERSISTS_WHOLE_FIGHT",
  version: 1,
  approval: "OWNER_APPROVED",
  statement:
    "A temporary weapon enchant established on the pull's combatantinfo gear is simulated for the whole fight when the subject's COMPLETE cast evidence holds no temporary-enchant application that could replace it. Warcraft Logs writes no event when one expires.",
};

/**
 * Owner decision (2026-10-22): the pinned defensive ally auras (Devotion Aura,
 * Power Word: Shield, Prayer of Mending — src/data/game/raid-environment.json
 * `defensiveAllyAuras`, every effect row defensive) are excluded from the
 * offensive environment, because incoming damage is standardized rather than
 * reconstructed. Applies only to effects that do not independently alter
 * offensive output; any other ally aura keeps the pending assumption below.
 */
export const DEFENSIVE_ALLY_AURAS_EXCLUDED: EnvironmentAssumption = {
  id: "DEFENSIVE_ALLY_AURAS_EXCLUDED_V1",
  version: 1,
  approval: "OWNER_APPROVED",
  statement:
    "Pinned defensive ally auras (damage-taken, absorb and dummy effects only) are excluded from the offensive environment under STANDARD_TANK_LOAD_V1: incoming damage is standardized, not encounter-reconstructed.",
};

/** Not approved: any OTHER ally aura the engine cannot represent on a player. */
export const UNREPRESENTABLE_ALLY_AURAS_EXCLUDED: EnvironmentAssumption = {
  id: "UNREPRESENTABLE_ALLY_AURAS_EXCLUDED",
  version: 1,
  approval: "PENDING_OWNER_APPROVAL",
  statement:
    "Ally-sourced auras observed on the subject that are neither engine raid-buff overrides nor pinned defensive ally auras have no player-side representation at the pin and would be excluded from the simulated environment.",
};

/**
 * Owner decision (2026-10-22): the pinned engine starts Bloodlust at the first
 * whole second at or after the observed start. Approved as a bounded,
 * non-blocking engine approximation; both values are kept in provenance.
 */
export const BLOODLUST_WHOLE_SECOND_START: EnvironmentAssumption = {
  id: "BLOODLUST_WHOLE_SECOND_START_V1",
  version: 1,
  approval: "OWNER_APPROVED",
  statement:
    "The observed Bloodlust-equivalent start is kept; the pinned engine applies it at the next whole second (sim.cpp bloodlust_check_t). The offset is under one second and recorded with both values.",
};

/**
 * Owner policy (2026-10-22): a current-setup simulation uses the player's
 * ACTUAL potion identity/availability and the elite APL's potion TIMING. The
 * logged potion timestamps stay factual evidence for later causal analysis and
 * are never replayed.
 */
export const POTION_TIMING_ELITE_APL: EnvironmentAssumption = {
  id: "POTION_TIMING_ELITE_APL_V1",
  version: 1,
  approval: "OWNER_APPROVED",
  statement:
    "Potion identity and availability are the actual logged setup; potion timing is the elite APL's. Logged potion timestamps are evidence, not simulation input.",
};

/**
 * A recorded, owner-authorized live investigation of a fight's target
 * availability surfaces. Its result is not evidence of availability; it
 * records that no surface with boundary semantics was found.
 */
export interface TargetAvailabilityInvestigation {
  readonly fightRef: string;
  readonly result: "WCL_TARGET_AVAILABILITY_AUTHORITY_NOT_FOUND";
  readonly investigatedOn: string;
  readonly finding: string;
}

export const TARGET_AVAILABILITY_INVESTIGATIONS: readonly TargetAvailabilityInvestigation[] = [
  {
    fightRef: "b1PmaKrd6CDfzngc#48",
    result: "WCL_TARGET_AVAILABILITY_AUTHORITY_NOT_FOUND",
    investigatedOn: "2026-10-22",
    finding:
      "Three filtered Warcraft Logs event queries over the fight (adds as source or target under both hostilities, and every enemy) returned no targetability, spawn or despawn event type: only encounterstart/encounterend, summon, death, resurrect and aurabroken. A summon is creation, not targetability; a death bounds the end only. Raw capture not retained in the repository.",
  },
];

/**
 * A recorded, read-only audit (2026-10-22) for a PINNED source that could
 * establish deterministic add-availability intervals for an encounter. Not
 * evidence of availability; it records that no such authority exists.
 */
export interface EncounterScheduleAuthorityAudit {
  readonly encounterId: number;
  readonly result: "PINNED_ENCOUNTER_SCHEDULE_AUTHORITY_NOT_FOUND";
  readonly auditedOn: string;
  readonly finding: string;
}

export const ENCOUNTER_SCHEDULE_AUTHORITY_AUDITS: readonly EncounterScheduleAuthorityAudit[] = [
  {
    encounterId: 3455,
    result: "PINNED_ENCOUNTER_SCHEDULE_AUTHORITY_NOT_FOUND",
    auditedOn: "2026-10-22",
    finding:
      "No pinned source defines NPCs 260895/260905 or encounter 3455: the approved engine image holds only the binary; the engine's fight styles and raid events are generic templates; the pinned spell/item data carry no encounter or creature schedule (the adds' summon spell 1284785 is absent from it); the repository holds no encounter metadata. Timers, observations and aggregates were not used.",
  },
];

/**
 * A recorded attempt to certify boss-debuff windows (2026-10-22). One request
 * to the friendly-sourced Debuffs table on the boss returned no aura for any of
 * the three debuffs, so the filtered-capture intervals stay uncertified.
 */
export interface BossDebuffCertificationAttempt {
  readonly fightRef: string;
  readonly result: "WCL_DEBUFF_INTERVAL_CERTIFICATION_NOT_ACHIEVED";
  readonly investigatedOn: string;
  readonly finding: string;
}

export const BOSS_DEBUFF_CERTIFICATION_ATTEMPTS: readonly BossDebuffCertificationAttempt[] = [
  {
    fightRef: "b1PmaKrd6CDfzngc#48",
    result: "WCL_DEBUFF_INTERVAL_CERTIFICATION_NOT_ACHIEVED",
    investigatedOn: "2026-10-22",
    finding:
      "table(Debuffs, hostilityType Friendlies, targetID 161) for 113746/1490/257284 returned no aura band; the filtered-event intervals (Mystic Touch 505 ms, Chaos Brand 1336 ms, Hunter's Mark pre-pull, all to the fight end) remain uncertified. Raw capture not retained in the repository.",
  },
];

export const TANK_LOAD_VERSION = 1;

/** The canonical directive list a tank-load revision covers (the builder writes the target line, then these). */
export function tankLoadDirectives(model: TankModelId): readonly string[] {
  return ["tank_dummy=<primary target>", ...TANK_MODEL_DIRECTIVES[model]];
}

/**
 * SHA-256 of `canonicalJson({ model, version, directives })`. Pinned here and
 * recomputed by a test, so a changed directive cannot keep its revision.
 */
export const TANK_LOAD_REVISIONS: Readonly<Record<TankModelId, string>> = {
  STANDARD_TANK_LOAD_V1: "7397216ba23406188218ea9444e2387de05988156cabcc235cba06e99338aad1",
};
