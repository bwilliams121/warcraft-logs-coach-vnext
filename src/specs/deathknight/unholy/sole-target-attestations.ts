/**
 * deathknight/unholy: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 * NOT ATTESTED, and why:
 *
 *   soul_reaper: soul_reaper_t::target_ready (sc_death_knight.cpp:12681) returns false above the health threshold without the Reaping buff, a reason other than the shared rule.
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const DEATHKNIGHT_UNHOLY_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze([
  {
    simcToken: "festering_strike",
    provenance:
      "engine/class_modules/sc_death_knight.cpp:14411 festering_strike_t. Chain festering_strike_t -> festering_base_t -> death_knight_melee_attack_t -> death_knight_action_t -> parse_action_effects_t<melee_attack_t> has no available_targets, target_ready or select_target override and no foreground target_filter_callback.",
  },
  {
    simcToken: "death_coil",
    provenance:
      "engine/class_modules/sc_death_knight.cpp:14407 death_coil_t. Chain death_coil_t -> death_coil_base_t -> death_knight_spell_t -> death_knight_action_t -> parse_action_effects_t<spell_t> has no override or foreground filter, and the target is left as the player target.",
  },
  {
    simcToken: "scourge_strike",
    provenance:
      "engine/class_modules/sc_death_knight.cpp:14415 scourge_strike_t. Chain scourge_strike_t -> scourge_strike_base_t -> death_knight_melee_attack_t -> death_knight_action_t -> parse_action_effects_t<melee_attack_t> has no available_targets or target_ready override; the target_list override at sc_death_knight.cpp:12483 returns the base list unchanged when its size does not exceed n_targets, as with one enemy.",
  },
]);
