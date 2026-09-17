/**
 * Protection Paladin's identity constants (M10-C).
 *
 * One place for the id the registration, the facade, the corpus executor and
 * every test agree on. It is the INTERNAL_ONLY id from `src/findings/spec-id.ts`;
 * nothing here makes it public.
 */

import type { InternalOnlySpecId } from "../../../findings/spec-id.js";

export const PROTECTION_PALADIN_SPEC_ID = "paladin/protection" satisfies InternalOnlySpecId;

export const PROTECTION_PALADIN_ANALYZER_ID = "paladin-protection-observed-decisions";

/** The `ResourceId` of the one resource this evaluator reads. */
export const HOLY_POWER_RESOURCE_ID = "HOLY_POWER";
