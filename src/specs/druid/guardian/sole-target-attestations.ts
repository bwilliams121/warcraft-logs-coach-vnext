/**
 * druid/guardian: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const DRUID_GUARDIAN_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze([
  {
    simcToken: "thrash",
    provenance:
      "engine/class_modules/sc_druid.cpp:10245 thrash_t. Chain thrash_t -> trigger_claw_rampage_t -> trigger_aggravate_wounds_t -> trigger_ursocs_fury_t -> trigger_gore_t -> trigger_spirits_wrath_t -> bear_attack_t -> druid_attack_t has no override or foreground filter; the bleed is a secondary impact action.",
  },
]);
