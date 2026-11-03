/**
 * Restoration Druid's identity and declared inputs (HEAL-B1, registered
 * INTERNAL_ONLY).
 *
 * The Warcraft Logs class and specialization strings are the ones the
 * committed fight context records for the identity subject (gtKb2xHn87pNcFfW
 * fight 22, actor 2: `subType` "Druid", `friendlySpecs` "Restoration").
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const RESTORATION_DRUID_EVALUATOR_REVISION = "restoration-druid-evaluator/1" as const;

/** The id. `InternalOnlySpecId`: the compile-time side of the exposure. */
export const RESTORATION_DRUID_SPEC_ID = "druid/restoration" satisfies InternalOnlySpecId;

export const RESTORATION_DRUID_ANALYZER_ID = "druid-restoration-healer-findings";

/** The roster display name; the factory refuses any other. */
export const RESTORATION_DRUID_DISPLAY_NAME = "Restoration Druid";

export const RESTORATION_DRUID_WCL_CLASS_NAME = "Druid";
export const RESTORATION_DRUID_WCL_SPEC_NAME = "Restoration";

/**
 * What the evaluator reads (CLAUDE.md "Ingestion Scope Derivation").
 *
 * FULL_RAID because a cooldown's overlap with damage episodes ranges over the
 * whole friendly roster, and a plan's player names resolve only against it.
 * Under a smaller scope the overlap reports ROSTER_NOT_IN_SCOPE instead of an
 * empty list. The registration declares its capabilities FROM this object, so
 * the derived ingestion requirement cannot drift from it (`registration.ts`).
 */
export const RESTORATION_DRUID_REQUIRED_INPUTS = {
  scope: "FULL_RAID",
  categories: ["ACTORS", "CASTS", "DAMAGE", "HEALING", "ABSORBS"],
} as const;
