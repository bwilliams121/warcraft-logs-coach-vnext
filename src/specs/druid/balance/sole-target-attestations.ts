/**
 * druid/balance: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const DRUID_BALANCE_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze([
  {
    simcToken: "moonfire",
    provenance:
      "engine/class_modules/sc_druid.cpp:10254 moonfire_t. Chain moonfire_t -> druid_spell_t -> druid_spell_base_t -> druid_action_t -> parse_action_effects_t has no override or foreground filter; line 10205 only diverts to red_moon_t with the Red Moon talent, and twin and damage are secondary actions.",
  },
  {
    simcToken: "sunfire",
    provenance:
      "engine/class_modules/sc_druid.cpp:10241 sunfire_t. Chain sunfire_t -> druid_spell_t -> druid_spell_base_t -> druid_action_t -> parse_action_effects_t has no override or foreground filter; the damage action is secondary.",
  },
]);
