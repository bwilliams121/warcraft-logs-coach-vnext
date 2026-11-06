/**
 * Guardian Druid's identity constants (ONB-T2).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const GUARDIAN_DRUID_SPEC_ID = "druid/guardian" satisfies InternalOnlySpecId;

export const GUARDIAN_DRUID_ANALYZER_ID = "druid-guardian-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const GUARDIAN_DRUID_DISPLAY_NAME = "Guardian Druid";
