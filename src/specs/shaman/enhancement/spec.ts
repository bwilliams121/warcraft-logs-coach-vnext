/**
 * Enhancement Shaman's identity constants (ONB-B2).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const ENHANCEMENT_SHAMAN_SPEC_ID = "shaman/enhancement" satisfies InternalOnlySpecId;

export const ENHANCEMENT_SHAMAN_ANALYZER_ID = "shaman-enhancement-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const ENHANCEMENT_SHAMAN_DISPLAY_NAME = "Enhancement Shaman";
