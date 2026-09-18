/**
 * Retribution Paladin's identity constants (M11-A4).
 *
 * One place for the id the registration, the facade, the corpus executor and
 * every test agree on. It is an INTERNAL_ONLY id from `src/findings/spec-id.ts`:
 * the `satisfies` is the compile-time side of the exposure — promoting the id
 * to `PUBLIC_SPEC_IDS` without touching this file (and the four other public
 * sites) fails at the registry, and moving this constant without moving the
 * partition fails here.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const RETRIBUTION_PALADIN_SPEC_ID = "paladin/retribution" satisfies InternalOnlySpecId;

export const RETRIBUTION_PALADIN_ANALYZER_ID = "paladin-retribution-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const RETRIBUTION_PALADIN_DISPLAY_NAME = "Retribution Paladin";

/** The `ResourceId` of the one resource this evaluator reads. */
export const HOLY_POWER_RESOURCE_ID = "HOLY_POWER";
