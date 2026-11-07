/**
 * hunter/marksmanship: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 * NOT ATTESTED, and why:
 *
 *   retarget: Pseudo-action: retarget_t (player.cpp:10862) derives from action_t with ACTION_OTHER and only changes the player target.
 *   black_arrow: black_arrow_t::target_ready (sc_hunter.cpp:4718) and black_arrow_base_t::target_ready (sc_hunter.cpp:4638) require a health range or Deathblow, so it can be false on the one target outside the shared rule.
 *   kill_shot: kill_shot_t::target_ready (sc_hunter.cpp:4380) and kill_shot_base_t::target_ready (sc_hunter.cpp:4318) require a health threshold or Deathblow, so it can be false on the one target outside the shared rule.
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const HUNTER_MARKSMANSHIP_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze([
  {
    simcToken: "explosive_shot",
    provenance:
      "engine/class_modules/sc_hunter.cpp:7544 explosive_shot_t. Chain explosive_shot_t -> explosive_shot_base_t -> hunter_ranged_attack_t -> hunter_action_t has no override or foreground filter; the filter at sc_hunter.cpp:6003 is on cleave_t, a background action fetched at sc_hunter.cpp:6014.",
  },
  {
    simcToken: "multishot",
    provenance:
      "engine/class_modules/sc_hunter.cpp:7551 multishot_t. Chain multishot_t -> hunter_ranged_attack_t -> hunter_action_t has no override or foreground filter.",
  },
  {
    simcToken: "arcane_shot",
    provenance:
      "engine/class_modules/sc_hunter.cpp:7569 arcane_shot_t. Chain arcane_shot_t -> arcane_shot_base_t -> hunter_ranged_attack_t -> hunter_action_t has no override or foreground filter; the cobra_shot_t branch at sc_hunter.cpp:7572 has none either.",
  },
  {
    simcToken: "aimed_shot",
    provenance:
      "engine/class_modules/sc_hunter.cpp:7535 aimed_shot_t. Chain aimed_shot_t -> aimed_shot_base_t -> hunter_ranged_attack_t -> hunter_action_t has no available_targets or target_ready override; the target_list override at sc_hunter.cpp:5362 shuffles only when the list exceeds n_targets, not with one enemy.",
  },
  {
    simcToken: "rapid_fire",
    provenance:
      "engine/class_modules/sc_hunter.cpp:7553 rapid_fire_t. Chain rapid_fire_t -> hunter_ranged_attack_t -> hunter_action_t has no override or foreground filter; the target_list override at sc_hunter.cpp:5623 is on the tick child.",
  },
]);
