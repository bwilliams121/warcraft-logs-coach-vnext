/**
 * Restoration Shaman's identity and declared inputs (M12-D).
 *
 * The Warcraft Logs class and specialization strings are the ones the
 * committed fight context records for the canonical subject (b1PmaKrd6CDfzngc
 * fight 48, actor 122: `subType` "Shaman", `friendlySpecs` "Restoration").
 */

export const RESTORATION_SHAMAN_EVALUATOR_REVISION = "restoration-shaman-evaluator/1" as const;

export const RESTORATION_SHAMAN_WCL_CLASS_NAME = "Shaman";
export const RESTORATION_SHAMAN_WCL_SPEC_NAME = "Restoration";

/**
 * What the evaluator reads (CLAUDE.md "Ingestion Scope Derivation").
 *
 * FULL_RAID because a cooldown's overlap with damage episodes ranges over the
 * whole friendly roster. Under a smaller scope the overlap reports
 * ROSTER_NOT_IN_SCOPE instead of an empty list. The evaluator is not yet
 * registered with the analysis service (agent/follow-ups.md "After M12-D"),
 * so nothing derives a scope from this today; registration must.
 */
export const RESTORATION_SHAMAN_REQUIRED_INPUTS = {
  scope: "FULL_RAID",
  categories: ["ACTORS", "CASTS", "DAMAGE", "HEALING", "ABSORBS"],
} as const;
