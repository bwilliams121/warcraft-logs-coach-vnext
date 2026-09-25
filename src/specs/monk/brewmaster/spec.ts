/**
 * Brewmaster Monk's identity constants (M11-C2, INTERNAL_ONLY).
 *
 * One place for the id the registration, the facade, the corpus executor and
 * every test agree on. It is an INTERNAL-ONLY id from
 * `src/findings/spec-id.ts`: the `satisfies` is the compile-time side of the
 * exposure, and it changes only in the reviewed five-site promotion edit (the
 * partition, the public contract's `specId` enum, the identity table, this
 * `satisfies`, and the registration's `exposure`). Until then Brewmaster is a
 * MEASUREMENT slice reachable only by the internal lookup, the corpus and
 * tests.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const BREWMASTER_MONK_SPEC_ID = "monk/brewmaster" satisfies InternalOnlySpecId;

export const BREWMASTER_MONK_ANALYZER_ID = "monk-brewmaster-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const BREWMASTER_MONK_DISPLAY_NAME = "Brewmaster Monk";
