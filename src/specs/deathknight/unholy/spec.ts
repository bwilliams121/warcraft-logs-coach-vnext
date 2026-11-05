/**
 * Unholy Death Knight's identity constants (ONB-X5).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const UNHOLY_DEATH_KNIGHT_SPEC_ID = "deathknight/unholy" satisfies InternalOnlySpecId;

export const UNHOLY_DEATH_KNIGHT_ANALYZER_ID = "deathknight-unholy-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const UNHOLY_DEATH_KNIGHT_DISPLAY_NAME = "Unholy Death Knight";
