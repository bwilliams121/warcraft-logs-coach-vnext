/**
 * Augmentation Evoker's identity and declared inputs (M13-A).
 *
 * The Warcraft Logs class and specialization strings are the ones the
 * committed M13-A fight context records for its subject (`subType` "Evoker",
 * `friendlySpecs` "Augmentation").
 */

/**
 * `/2` (M13-B): each ally window carries its recipient's stated specialization.
 * `/3` (M13-C): recipient cooldown ids come from the shared reviewed registry,
 * not the caller, and each ally window carries that lookup.
 */
export const AUGMENTATION_EVOKER_EVALUATOR_REVISION = "augmentation-evoker-evaluator/3" as const;

export const AUGMENTATION_EVOKER_WCL_CLASS_NAME = "Evoker";
export const AUGMENTATION_EVOKER_WCL_SPEC_NAME = "Augmentation";

/**
 * What the evaluator reads (CLAUDE.md "Ingestion Scope Derivation").
 *
 * FULL_RAID because every question about a buff recipient — its deaths, its
 * own cooldown casts — is a question about an ally. The evaluator is not yet
 * registered with the analysis service (agent/follow-ups.md "After M13-A"),
 * so nothing derives a scope from this today; registration must.
 */
export const AUGMENTATION_EVOKER_REQUIRED_INPUTS = {
  scope: "FULL_RAID",
  categories: ["ACTORS", "CASTS", "AURAS", "DEATHS"],
} as const;
