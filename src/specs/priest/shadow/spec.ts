/**
 * Shadow Priest's identity constants (ONB-D2).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const SHADOW_PRIEST_SPEC_ID = "priest/shadow" satisfies InternalOnlySpecId;

export const SHADOW_PRIEST_ANALYZER_ID = "priest-shadow-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const SHADOW_PRIEST_DISPLAY_NAME = "Shadow Priest";
