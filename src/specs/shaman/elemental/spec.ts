/**
 * Elemental Shaman's identity constants (ONB-D2).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const ELEMENTAL_SHAMAN_SPEC_ID = "shaman/elemental" satisfies InternalOnlySpecId;

export const ELEMENTAL_SHAMAN_ANALYZER_ID = "shaman-elemental-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const ELEMENTAL_SHAMAN_DISPLAY_NAME = "Elemental Shaman";
