/**
 * Frost Death Knight's identity constants (ONB-B2).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const FROST_DEATH_KNIGHT_SPEC_ID = "deathknight/frost" satisfies InternalOnlySpecId;

export const FROST_DEATH_KNIGHT_ANALYZER_ID = "deathknight-frost-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const FROST_DEATH_KNIGHT_DISPLAY_NAME = "Frost Death Knight";
