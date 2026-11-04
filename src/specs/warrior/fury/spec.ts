/**
 * Fury Warrior's identity constants (ONB-A2).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const FURY_WARRIOR_SPEC_ID = "warrior/fury" satisfies InternalOnlySpecId;

export const FURY_WARRIOR_ANALYZER_ID = "warrior-fury-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const FURY_WARRIOR_DISPLAY_NAME = "Fury Warrior";
