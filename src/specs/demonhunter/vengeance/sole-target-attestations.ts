/**
 * demonhunter/vengeance: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 * NOT ATTESTED, and why:
 *
 *   retarget_auto_attack: Pseudo-action: retarget_auto_attack_t (player.cpp:10820) derives from action_t with ACTION_OTHER and only moves auto attacks.
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const DEMONHUNTER_VENGEANCE_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze(
  [],
);
