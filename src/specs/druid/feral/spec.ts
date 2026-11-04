/**
 * Feral Druid's identity constants (ONB-C1).
 *
 * One place for the id the registration, the facade, the corpus executor and every test
 * agree on. It is an INTERNAL-ONLY id from `src/findings/spec-id.ts`: the `satisfies` is
 * the compile-time side of the exposure.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const FERAL_DRUID_SPEC_ID = "druid/feral" satisfies InternalOnlySpecId;

export const FERAL_DRUID_ANALYZER_ID = "druid-feral-observed-decisions";

/** The roster display name; the factory refuses any other. */
export const FERAL_DRUID_DISPLAY_NAME = "Feral Druid";
