/**
 * Havoc Demon Hunter's identity constants (ONB-A1; PUBLIC since ONB-A1P).
 *
 * One place for the id the registration, the facade, the corpus executor and
 * every test agree on. It is a PUBLIC id from `src/findings/spec-id.ts` since
 * ONB-A1P (it was internal-only in ONB-A1): the `satisfies` is the compile-time
 * side of the exposure, one of the five promotion sites.
 */

import type { PublicSpecId } from "../../../findings/spec-id.js";

export const HAVOC_DEMON_HUNTER_SPEC_ID = "demonhunter/havoc" satisfies PublicSpecId;

export const HAVOC_DEMON_HUNTER_ANALYZER_ID = "demonhunter-havoc-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const HAVOC_DEMON_HUNTER_DISPLAY_NAME = "Havoc Demon Hunter";
