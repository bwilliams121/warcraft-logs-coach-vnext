/**
 * Subtlety Rogue's identity constants (ONB-A2).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const SUBTLETY_ROGUE_SPEC_ID = "rogue/subtlety" satisfies InternalOnlySpecId;

export const SUBTLETY_ROGUE_ANALYZER_ID = "rogue-subtlety-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const SUBTLETY_ROGUE_DISPLAY_NAME = "Subtlety Rogue";
