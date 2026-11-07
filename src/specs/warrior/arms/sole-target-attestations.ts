/**
 * warrior/arms: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 * NOT ATTESTED, and why:
 *
 *   run_action_list: Pseudo-action: run_action_list_t (engine/action/action.hpp:1188) switches APL lists and is not aimed at any target.
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const WARRIOR_ARMS_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze([]);
