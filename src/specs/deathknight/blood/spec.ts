/**
 * Blood Death Knight's identity constants (M11-B2; PUBLIC since M11-B12).
 *
 * One place for the id the registration, the facade, the corpus executor and
 * every test agree on. It is a PUBLIC id from `src/findings/spec-id.ts`: the
 * `satisfies` is the compile-time side of the exposure — it was
 * `InternalOnlySpecId` from M11-B2, while Blood was a MEASUREMENT slice
 * reachable only by the internal lookup, the corpus and tests, and it changed
 * here in the same reviewed five-site edit as the partition, the public
 * contract's `specId` enum, the identity table and the registration's
 * `exposure` (`agent/architecture.md`, M10-D's precedent).
 */

import type { PublicSpecId } from "../../../findings/spec-id.js";

export const BLOOD_DEATH_KNIGHT_SPEC_ID = "deathknight/blood" satisfies PublicSpecId;

export const BLOOD_DEATH_KNIGHT_ANALYZER_ID = "deathknight-blood-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const BLOOD_DEATH_KNIGHT_DISPLAY_NAME = "Blood Death Knight";

/** The `ResourceId`s of the two resources this evaluator reads. */
export const RUNES_RESOURCE_ID = "RUNES";
export const RUNIC_POWER_RESOURCE_ID = "RUNIC_POWER";
