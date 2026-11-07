/**
 * hunter/survival: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 * NOT ATTESTED, and why:
 *
 *   retarget: Pseudo-action: retarget_t (player.cpp:10862) derives from action_t with ACTION_OTHER and only changes the player target.
 *   wildfire_bomb: wildfire_bomb_base_t sets harmful = false on the foreground object at sc_hunter.cpp:7254, so it is not an ordinary harmful action and the invulnerability clause of target_ready does not apply to it.
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const HUNTER_SURVIVAL_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze([
  {
    simcToken: "takedown",
    provenance:
      "engine/class_modules/sc_hunter.cpp:7559 takedown_t. Player takedown_t (sc_hunter.cpp:6487, not the pet struct at 3093) -> hunter_spell_t -> hunter_action_t has no override or foreground filter; its damage child is background.",
  },
  {
    simcToken: "moonlight_chakram",
    provenance:
      "engine/class_modules/sc_hunter.cpp:7550 moonlight_chakram_t. Chain moonlight_chakram_t -> hunter_ranged_attack_t -> hunter_action_t has no override or foreground filter; damage is a child action.",
  },
  {
    simcToken: "raptor_strike",
    provenance:
      "engine/class_modules/sc_hunter.cpp:7554 raptor_strike_t. Chain raptor_strike_t -> raptor_strike_base_t -> melee_focus_spender_t -> hunter_melee_attack_t -> hunter_action_t has no override or foreground filter; swipe_t is a child action.",
  },
]);
