/**
 * Devastation Evoker's identity constants (ONB-X2).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const DEVASTATION_EVOKER_SPEC_ID = "evoker/devastation" satisfies InternalOnlySpecId;

export const DEVASTATION_EVOKER_ANALYZER_ID = "evoker-devastation-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const DEVASTATION_EVOKER_DISPLAY_NAME = "Devastation Evoker";
