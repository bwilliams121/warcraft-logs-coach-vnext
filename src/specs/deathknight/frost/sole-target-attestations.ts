/**
 * deathknight/frost: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const DEATHKNIGHT_FROST_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze([
  {
    simcToken: "frost_strike",
    provenance:
      "engine/class_modules/sc_death_knight.cpp:14381 frost_strike_t. Chain frost_strike_t -> frost_strike_base_t -> death_knight_melee_attack_t -> death_knight_action_t -> parse_action_effects_t<melee_attack_t> has no available_targets, target_ready or select_target override and no foreground target_filter_callback; the frostbane replacement redirects readiness only.",
  },
  {
    simcToken: "obliterate",
    provenance:
      "engine/class_modules/sc_death_knight.cpp:14391 obliterate_t. Chain obliterate_t -> death_knight_melee_attack_t -> death_knight_action_t -> parse_action_effects_t<melee_attack_t> has no available_targets, target_ready or select_target override and no foreground target_filter_callback.",
  },
  {
    simcToken: "reapers_mark",
    provenance:
      "engine/class_modules/sc_death_knight.cpp:14331 reapers_mark_t. Chain reapers_mark_t -> death_knight_spell_t -> death_knight_action_t -> parse_action_effects_t<spell_t> has no override or foreground filter; the filter at sc_death_knight.cpp:8475 is on the background child soul_rupture_t.",
  },
]);
