/**
 * Fire Mage's identity constants (ONB-X1).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const FIRE_MAGE_SPEC_ID = "mage/fire" satisfies InternalOnlySpecId;

export const FIRE_MAGE_ANALYZER_ID = "mage-fire-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const FIRE_MAGE_DISPLAY_NAME = "Fire Mage";
