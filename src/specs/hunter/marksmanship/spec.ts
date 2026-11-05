/**
 * Marksmanship Hunter's identity constants (ONB-D4).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const MARKSMANSHIP_HUNTER_SPEC_ID = "hunter/marksmanship" satisfies InternalOnlySpecId;

export const MARKSMANSHIP_HUNTER_ANALYZER_ID = "hunter-marksmanship-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const MARKSMANSHIP_HUNTER_DISPLAY_NAME = "Marksmanship Hunter";
