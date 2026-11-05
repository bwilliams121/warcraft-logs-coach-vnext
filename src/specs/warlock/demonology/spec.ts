/**
 * Demonology Warlock's identity constants (ONB-X4).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const DEMONOLOGY_WARLOCK_SPEC_ID = "warlock/demonology" satisfies InternalOnlySpecId;

export const DEMONOLOGY_WARLOCK_ANALYZER_ID = "warlock-demonology-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const DEMONOLOGY_WARLOCK_DISPLAY_NAME = "Demonology Warlock";
