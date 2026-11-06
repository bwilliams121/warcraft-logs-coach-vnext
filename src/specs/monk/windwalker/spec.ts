/**
 * Windwalker Monk's identity constants (ONB-T1).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const WINDWALKER_MONK_SPEC_ID = "monk/windwalker" satisfies InternalOnlySpecId;

export const WINDWALKER_MONK_ANALYZER_ID = "monk-windwalker-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const WINDWALKER_MONK_DISPLAY_NAME = "Windwalker Monk";
