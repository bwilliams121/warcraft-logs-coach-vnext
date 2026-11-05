/**
 * Affliction Warlock's identity constants (ONB-D4).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const AFFLICTION_WARLOCK_SPEC_ID = "warlock/affliction" satisfies InternalOnlySpecId;

export const AFFLICTION_WARLOCK_ANALYZER_ID = "warlock-affliction-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const AFFLICTION_WARLOCK_DISPLAY_NAME = "Affliction Warlock";
