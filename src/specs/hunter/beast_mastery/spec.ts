/**
 * Beast Mastery Hunter's identity constants (ONB-T2).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const BEAST_MASTERY_HUNTER_SPEC_ID = "hunter/beast_mastery" satisfies InternalOnlySpecId;

export const BEAST_MASTERY_HUNTER_ANALYZER_ID = "hunter-beast_mastery-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const BEAST_MASTERY_HUNTER_DISPLAY_NAME = "Beast Mastery Hunter";
