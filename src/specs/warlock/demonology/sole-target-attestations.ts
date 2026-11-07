/**
 * warlock/demonology: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 * NOT ATTESTED, and why:
 *
 *   demonbolt: Inherits warlock_spell_t::select_target (sc_warlock_actions.cpp:548), which rule 4 forbids; read, it only calls the base and invalidates the cache on a target change, and the override at sc_warlock_actions.cpp:573 returns the base list for one enemy, so this is the only disqualifier found for demonbolt_t.
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const WARLOCK_DEMONOLOGY_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze(
  [],
);
