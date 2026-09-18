/**
 * Retribution Paladin's identity constants (M11-A4; PUBLIC since M11-A5).
 *
 * One place for the id the registration, the facade, the corpus executor and
 * every test agree on. It is a PUBLIC id from `src/findings/spec-id.ts`: the
 * `satisfies` is the compile-time side of the exposure — it was
 * `InternalOnlySpecId` from M11-A4 until the M11-A5 promotion moved the id
 * across the partition, and it changed here in the same reviewed edit as the
 * four other public sites (the partition, the public contract's `specId`
 * enum, the identity table and the registration's exposure).
 */

import type { PublicSpecId } from "../../../findings/spec-id.js";

export const RETRIBUTION_PALADIN_SPEC_ID = "paladin/retribution" satisfies PublicSpecId;

export const RETRIBUTION_PALADIN_ANALYZER_ID = "paladin-retribution-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const RETRIBUTION_PALADIN_DISPLAY_NAME = "Retribution Paladin";

/** The `ResourceId` of the one resource this evaluator reads. */
export const HOLY_POWER_RESOURCE_ID = "HOLY_POWER";
