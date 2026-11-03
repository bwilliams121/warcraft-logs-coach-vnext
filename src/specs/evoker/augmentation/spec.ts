/**
 * Augmentation Evoker's identity and declared inputs (M13-A; registered
 * INTERNAL_ONLY in M13-E; PUBLIC since M13-F).
 *
 * The Warcraft Logs class and specialization strings are the ones the
 * committed M13-A fight context records for its subject (`subType` "Evoker",
 * `friendlySpecs` "Augmentation").
 */

import type { PublicSpecId } from "../../../findings/spec-id.js";

/**
 * `/2` (M13-B): each ally window carries its recipient's stated specialization.
 * `/3` (M13-C): recipient cooldown ids come from the shared reviewed registry,
 * not the caller, and each ally window carries that lookup.
 */
export const AUGMENTATION_EVOKER_EVALUATOR_REVISION = "augmentation-evoker-evaluator/3" as const;

/**
 * The id. `PublicSpecId` since M13-F (it was `InternalOnlySpecId` in M13-E):
 * the compile-time side of the exposure, one of the five promotion sites.
 */
export const AUGMENTATION_EVOKER_SPEC_ID = "evoker/augmentation" satisfies PublicSpecId;

export const AUGMENTATION_EVOKER_ANALYZER_ID = "evoker-augmentation-support-observations";

/** The roster display name; the factory refuses any other. */
export const AUGMENTATION_EVOKER_DISPLAY_NAME = "Augmentation Evoker";

export const AUGMENTATION_EVOKER_WCL_CLASS_NAME = "Evoker";
export const AUGMENTATION_EVOKER_WCL_SPEC_NAME = "Augmentation";

/**
 * What the evaluator reads (CLAUDE.md "Ingestion Scope Derivation").
 *
 * FULL_RAID because every question about a buff recipient — its deaths, its
 * own cooldown casts — is a question about an ally. Since M13-E the
 * registration declares its capabilities FROM this object, so the derived
 * ingestion requirement cannot drift from it (`registration.ts`).
 */
export const AUGMENTATION_EVOKER_REQUIRED_INPUTS = {
  scope: "FULL_RAID",
  categories: ["ACTORS", "CASTS", "AURAS", "DEATHS"],
} as const;
