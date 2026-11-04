/**
 * Protection Warrior's identity constants (ONB-A2).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const PROTECTION_WARRIOR_SPEC_ID = "warrior/protection" satisfies InternalOnlySpecId;

export const PROTECTION_WARRIOR_ANALYZER_ID = "warrior-protection-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const PROTECTION_WARRIOR_DISPLAY_NAME = "Protection Warrior";
