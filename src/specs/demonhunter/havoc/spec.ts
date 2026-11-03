/**
 * Havoc Demon Hunter's identity constants (ONB-A1).
 *
 * One place for the id the registration, the facade, the corpus executor and
 * every test agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`:
 * the `satisfies` is the compile-time side of the exposure, and it changes in
 * the reviewed five-site edit of a public promotion, never by itself.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const HAVOC_DEMON_HUNTER_SPEC_ID = "demonhunter/havoc" satisfies InternalOnlySpecId;

export const HAVOC_DEMON_HUNTER_ANALYZER_ID = "demonhunter-havoc-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const HAVOC_DEMON_HUNTER_DISPLAY_NAME = "Havoc Demon Hunter";
