/**
 * Arms Warrior's identity constants (ONB-B1).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const ARMS_WARRIOR_SPEC_ID = "warrior/arms" satisfies InternalOnlySpecId;

export const ARMS_WARRIOR_ANALYZER_ID = "warrior-arms-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const ARMS_WARRIOR_DISPLAY_NAME = "Arms Warrior";
