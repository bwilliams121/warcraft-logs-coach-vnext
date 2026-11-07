/**
 * druid/feral: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 * NOT ATTESTED, and why:
 *
 *   prowl: prowl_t sets harmful = false at sc_druid.cpp:7959 and is a self-buff stealth action, not aimed at the enemy.
 *   shadowmeld: shadowmeld_t is a racial self-buff (player.cpp:9033 triggers the buff on the player), not an action aimed at the enemy.
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const DRUID_FERAL_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze([
  {
    simcToken: "rake",
    provenance:
      "engine/class_modules/sc_druid.cpp:10232 rake_t. Chain rake_t -> use_fluid_form_t -> trigger_call_of_the_elder_druid_t -> cp_generator_t -> trigger_aggravate_wounds_t -> cat_attack_t -> druid_attack_t -> druid_action_t has no available_targets or target_ready override; the target_list override at sc_druid.cpp:4579 reorders only when the list exceeds aoe, not with one enemy.",
  },
  {
    simcToken: "moonfire_cat",
    provenance:
      "engine/class_modules/sc_druid.cpp:10194 lunar_inspiration_t. Chain lunar_inspiration_t -> trigger_panthers_guile_t -> cp_generator_t -> trigger_aggravate_wounds_t -> cat_attack_t -> druid_attack_t -> druid_action_t has no override or foreground filter.",
  },
  {
    simcToken: "primal_wrath",
    provenance:
      "engine/class_modules/sc_druid.cpp:10196 primal_wrath_t. Chain primal_wrath_t -> cp_spender_t -> trigger_aggravate_wounds_t -> cat_attack_t -> druid_attack_t -> druid_action_t has no available_targets or target_ready override; the target_list override at sc_druid.cpp:4759 only shuffles, which leaves a one-element list unchanged.",
  },
  {
    simcToken: "rip",
    provenance:
      "engine/class_modules/sc_druid.cpp:10235 rip_t. Chain rip_t -> trigger_thriving_growth_t -> use_dot_list_t -> cp_spender_t -> trigger_aggravate_wounds_t -> cat_attack_t -> druid_attack_t -> druid_action_t has no override or foreground filter.",
  },
  {
    simcToken: "ferocious_bite",
    provenance:
      "engine/class_modules/sc_druid.cpp:10251 ferocious_bite_t. Chain ferocious_bite_t -> ferocious_bite_base_t -> cp_spender_t -> trigger_aggravate_wounds_t -> cat_attack_t -> druid_attack_t -> druid_action_t has no override or foreground filter; the filter at sc_druid.cpp:4181 is on the background child rampant_ferocity_t.",
  },
]);
