/**
 * Brewmaster Monk's identity constants (M11-C2; PUBLIC since M11-C4j).
 *
 * One place for the id the registration, the facade, the corpus executor and
 * every test agree on. It is a PUBLIC id from `src/findings/spec-id.ts`: the
 * `satisfies` is the compile-time side of the exposure — it was
 * `InternalOnlySpecId` from M11-C2, while Brewmaster was a MEASUREMENT slice
 * reachable only by the internal lookup, the corpus and tests, and it changed
 * here in the same reviewed five-site edit as the partition, the public
 * contract's `specId` enum, the identity table and the registration's
 * `exposure` (`agent/architecture.md`, M10-D's precedent).
 */

import type { PublicSpecId } from "../../../findings/spec-id.js";

export const BREWMASTER_MONK_SPEC_ID = "monk/brewmaster" satisfies PublicSpecId;

export const BREWMASTER_MONK_ANALYZER_ID = "monk-brewmaster-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const BREWMASTER_MONK_DISPLAY_NAME = "Brewmaster Monk";
