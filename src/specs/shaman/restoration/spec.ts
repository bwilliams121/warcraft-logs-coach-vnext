/**
 * Restoration Shaman's identity and declared inputs (M12-D; registered
 * INTERNAL_ONLY in HEAL-A; PUBLIC since HEAL-AP).
 *
 * The Warcraft Logs class and specialization strings are the ones the
 * committed fight context records for the canonical subject (b1PmaKrd6CDfzngc
 * fight 48, actor 122: `subType` "Shaman", `friendlySpecs` "Restoration").
 */

import type { PublicSpecId } from "../../../findings/spec-id.js";

/**
 * `/2` (HEAL-A): when the subject's own name is not known, every unresolved
 * plan entry may name it, so none is counted as another player's.
 */
export const RESTORATION_SHAMAN_EVALUATOR_REVISION = "restoration-shaman-evaluator/2" as const;

/**
 * The id. `PublicSpecId` since HEAL-AP (it was `InternalOnlySpecId` in
 * HEAL-A): the compile-time side of the exposure, one of the five promotion
 * sites.
 */
export const RESTORATION_SHAMAN_SPEC_ID = "shaman/restoration" satisfies PublicSpecId;

export const RESTORATION_SHAMAN_ANALYZER_ID = "shaman-restoration-healer-findings";

/** The roster display name; the factory refuses any other. */
export const RESTORATION_SHAMAN_DISPLAY_NAME = "Restoration Shaman";

export const RESTORATION_SHAMAN_WCL_CLASS_NAME = "Shaman";
export const RESTORATION_SHAMAN_WCL_SPEC_NAME = "Restoration";

/**
 * What the evaluator reads (CLAUDE.md "Ingestion Scope Derivation").
 *
 * FULL_RAID because a cooldown's overlap with damage episodes ranges over the
 * whole friendly roster, and a plan's player names resolve only against it.
 * Under a smaller scope the overlap reports ROSTER_NOT_IN_SCOPE instead of an
 * empty list. Since HEAL-A the registration declares its capabilities FROM
 * this object, so the derived ingestion requirement cannot drift from it
 * (`registration.ts`).
 */
export const RESTORATION_SHAMAN_REQUIRED_INPUTS = {
  scope: "FULL_RAID",
  categories: ["ACTORS", "CASTS", "DAMAGE", "HEALING", "ABSORBS"],
} as const;
