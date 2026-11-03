/**
 * Discipline Priest's identity and declared inputs (HEAL-B3, registered
 * INTERNAL_ONLY).
 *
 * The Warcraft Logs class and specialization strings are the ones the
 * committed fight contexts record for the identity subjects (the M13-A fight
 * context actor 9, and the G2 cohort246 fight 33 context actor 88: `subType`
 * "Priest", `friendlySpecs` "Discipline").
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const DISCIPLINE_PRIEST_EVALUATOR_REVISION = "discipline-priest-evaluator/1" as const;

/**
 * The id. `InternalOnlySpecId` (HEAL-B3): the compile-time side of the
 * exposure, one of the five promotion sites. Its public promotion is HEAL-B3P.
 */
export const DISCIPLINE_PRIEST_SPEC_ID = "priest/discipline" satisfies InternalOnlySpecId;

export const DISCIPLINE_PRIEST_ANALYZER_ID = "priest-discipline-healer-findings";

/** The roster display name; the factory refuses any other. */
export const DISCIPLINE_PRIEST_DISPLAY_NAME = "Discipline Priest";

export const DISCIPLINE_PRIEST_WCL_CLASS_NAME = "Priest";
export const DISCIPLINE_PRIEST_WCL_SPEC_NAME = "Discipline";

/**
 * What the evaluator reads (CLAUDE.md "Ingestion Scope Derivation").
 *
 * FULL_RAID because a cooldown's overlap with damage episodes ranges over the
 * whole friendly roster, a plan's player names resolve only against it, and
 * the Atonement listings range over every ally the subject could have applied
 * Atonement to or healed through it. AURAS is Discipline's own addition to the
 * healer set: the Atonement buff is an aura on an ally. Under a smaller scope
 * the overlap reports ROSTER_NOT_IN_SCOPE and the Atonement listings are
 * UNKNOWN (INSUFFICIENT_SCOPE), never an empty "none". The registration
 * declares its capabilities FROM this object, so the derived ingestion
 * requirement cannot drift from it (`registration.ts`).
 */
export const DISCIPLINE_PRIEST_REQUIRED_INPUTS = {
  scope: "FULL_RAID",
  categories: ["ACTORS", "CASTS", "AURAS", "DAMAGE", "HEALING", "ABSORBS"],
} as const;
