/**
 * Blood Death Knight's identity constants (M11-B2, INTERNAL_ONLY).
 *
 * One place for the id the registration, the facade, the corpus executor and
 * every test agree on. It is an INTERNAL_ONLY id from
 * `src/findings/spec-id.ts`: the `satisfies` is the compile-time side of the
 * exposure — moving the id across the partition is a reviewed five-site edit
 * (`agent/architecture.md`, M10-D), and M11-B2 makes no such edit. Blood is
 * a MEASUREMENT slice: reachable by the internal lookup, the corpus and
 * tests, never selected by the application service, raid-night
 * orchestration, REST or MCP.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const BLOOD_DEATH_KNIGHT_SPEC_ID = "deathknight/blood" satisfies InternalOnlySpecId;

export const BLOOD_DEATH_KNIGHT_ANALYZER_ID = "deathknight-blood-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const BLOOD_DEATH_KNIGHT_DISPLAY_NAME = "Blood Death Knight";

/** The `ResourceId`s of the two resources this evaluator reads. */
export const RUNES_RESOURCE_ID = "RUNES";
export const RUNIC_POWER_RESOURCE_ID = "RUNIC_POWER";
