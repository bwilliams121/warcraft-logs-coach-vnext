/**
 * Holy Priest's identity and declared inputs (HEAL-B2, registered
 * INTERNAL_ONLY; PUBLIC since HEAL-B2P).
 *
 * The Warcraft Logs class and specialization strings are the ones the
 * committed fight contexts record for the identity subjects (b1PmaKrd6CDfzngc
 * fight 48 actor 2, and the M13-A fight context actor 2: `subType` "Priest",
 * `friendlySpecs` "Holy").
 */

import type { PublicSpecId } from "../../../findings/spec-id.js";

export const HOLY_PRIEST_EVALUATOR_REVISION = "holy-priest-evaluator/1" as const;

/**
 * The id. `PublicSpecId` since HEAL-B2P (it was `InternalOnlySpecId` in
 * HEAL-B2): the compile-time side of the exposure, one of the five promotion
 * sites.
 */
export const HOLY_PRIEST_SPEC_ID = "priest/holy" satisfies PublicSpecId;

export const HOLY_PRIEST_ANALYZER_ID = "priest-holy-healer-findings";

/** The roster display name; the factory refuses any other. */
export const HOLY_PRIEST_DISPLAY_NAME = "Holy Priest";

export const HOLY_PRIEST_WCL_CLASS_NAME = "Priest";
export const HOLY_PRIEST_WCL_SPEC_NAME = "Holy";

/**
 * What the evaluator reads (CLAUDE.md "Ingestion Scope Derivation").
 *
 * FULL_RAID because a cooldown's overlap with damage episodes ranges over the
 * whole friendly roster, and a plan's player names resolve only against it.
 * Under a smaller scope the overlap reports ROSTER_NOT_IN_SCOPE instead of an
 * empty list. The registration declares its capabilities FROM this object, so
 * the derived ingestion requirement cannot drift from it (`registration.ts`).
 */
export const HOLY_PRIEST_REQUIRED_INPUTS = {
  scope: "FULL_RAID",
  categories: ["ACTORS", "CASTS", "DAMAGE", "HEALING", "ABSORBS"],
} as const;
