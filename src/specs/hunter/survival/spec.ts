/**
 * Survival Hunter's identity constants (ONB-T2).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const SURVIVAL_HUNTER_SPEC_ID = "hunter/survival" satisfies InternalOnlySpecId;

export const SURVIVAL_HUNTER_ANALYZER_ID = "hunter-survival-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const SURVIVAL_HUNTER_DISPLAY_NAME = "Survival Hunter";
