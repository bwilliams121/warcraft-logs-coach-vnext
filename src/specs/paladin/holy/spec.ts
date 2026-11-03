/**
 * Holy Paladin's identity and declared inputs (HEAL-B1, registered
 * INTERNAL_ONLY; PUBLIC since HEAL-B1P).
 *
 * The Warcraft Logs class and specialization strings are the ones the
 * committed fight context records for the identity subject (b1PmaKrd6CDfzngc
 * fight 48, actor 1: `subType` "Paladin", `friendlySpecs` "Holy").
 */

import type { PublicSpecId } from "../../../findings/spec-id.js";

export const HOLY_PALADIN_EVALUATOR_REVISION = "holy-paladin-evaluator/1" as const;

/**
 * The id. `PublicSpecId` since HEAL-B1P (it was `InternalOnlySpecId` in
 * HEAL-B1): the compile-time side of the exposure, one of the five promotion
 * sites.
 */
export const HOLY_PALADIN_SPEC_ID = "paladin/holy" satisfies PublicSpecId;

export const HOLY_PALADIN_ANALYZER_ID = "paladin-holy-healer-findings";

/** The roster display name; the factory refuses any other. */
export const HOLY_PALADIN_DISPLAY_NAME = "Holy Paladin";

export const HOLY_PALADIN_WCL_CLASS_NAME = "Paladin";
export const HOLY_PALADIN_WCL_SPEC_NAME = "Holy";

/**
 * What the evaluator reads (CLAUDE.md "Ingestion Scope Derivation").
 *
 * FULL_RAID because a cooldown's overlap with damage episodes ranges over the
 * whole friendly roster, and a plan's player names resolve only against it.
 * Under a smaller scope the overlap reports ROSTER_NOT_IN_SCOPE instead of an
 * empty list. The registration declares its capabilities FROM this object, so
 * the derived ingestion requirement cannot drift from it (`registration.ts`).
 */
export const HOLY_PALADIN_REQUIRED_INPUTS = {
  scope: "FULL_RAID",
  categories: ["ACTORS", "CASTS", "DAMAGE", "HEALING", "ABSORBS"],
} as const;
