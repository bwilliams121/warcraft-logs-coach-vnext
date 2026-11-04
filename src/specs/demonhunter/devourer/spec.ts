/**
 * Devourer Demon Hunter's identity constants (ONB-B3).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const DEVOURER_DEMON_HUNTER_SPEC_ID = "demonhunter/devourer" satisfies InternalOnlySpecId;

export const DEVOURER_DEMON_HUNTER_ANALYZER_ID = "demonhunter-devourer-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const DEVOURER_DEMON_HUNTER_DISPLAY_NAME = "Devourer Demon Hunter";
