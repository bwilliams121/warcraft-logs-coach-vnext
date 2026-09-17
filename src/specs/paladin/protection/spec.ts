/**
 * Protection Paladin's identity constants (M10-C).
 *
 * One place for the id the registration, the facade, the corpus executor and
 * every test agree on. It is a PUBLIC id from `src/findings/spec-id.ts` since
 * M10-D; the `satisfies` is the fifth site of the public move, so demoting the
 * id in the partition without touching this file fails to compile.
 */

import type { PublicSpecId } from "../../../findings/spec-id.js";

export const PROTECTION_PALADIN_SPEC_ID = "paladin/protection" satisfies PublicSpecId;

export const PROTECTION_PALADIN_ANALYZER_ID = "paladin-protection-observed-decisions";

/** The human-readable name the public surfaces derive their support wording from (M11-A1). */
export const PROTECTION_PALADIN_DISPLAY_NAME = "Protection Paladin";

/** The `ResourceId` of the one resource this evaluator reads. */
export const HOLY_POWER_RESOURCE_ID = "HOLY_POWER";
