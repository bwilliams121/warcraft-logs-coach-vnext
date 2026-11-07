/**
 * hunter/beast_mastery: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 * NOT ATTESTED, and why:
 *
 *   retarget: Pseudo-action: retarget_t (player.cpp:10862) derives from action_t with ACTION_OTHER and only changes the player target.
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const HUNTER_BEAST_MASTERY_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze([
  {
    simcToken: "barbed_shot",
    provenance:
      "engine/class_modules/sc_hunter.cpp:7539 barbed_shot_t. Chain barbed_shot_t -> barbed_shot_base_t -> hunter_ranged_attack_t -> hunter_action_t has no override or foreground filter.",
  },
]);
