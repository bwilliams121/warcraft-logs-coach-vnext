/**
 * evoker/devastation: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const EVOKER_DEVASTATION_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze([
  {
    simcToken: "pyre",
    provenance:
      "engine/class_modules/sc_evoker.cpp:10965 pyre_t. Chain pyre_t -> essence_base_t -> evoker_spell_t -> evoker_action_t; the available_targets override at sc_evoker.cpp:7227 was read and pushes every non-sleeping enemy, skipping the target only for VOLATILITY children, so the foreground object (proc_spell_type NONE) returns the one enemy; no foreground filter.",
  },
  {
    simcToken: "disintegrate",
    provenance:
      "engine/class_modules/sc_evoker.cpp:10947 disintegrate_t. Chain disintegrate_t -> essence_base_t -> evoker_spell_t -> evoker_action_t has no override or foreground filter; the target assignment at sc_evoker.cpp:6572 reads an existing dot target and cannot leave the one enemy.",
  },
  {
    simcToken: "fire_breath",
    provenance:
      "engine/class_modules/sc_evoker.cpp:10955 fire_breath_t. Chain fire_breath_t -> empowered_charge_spell_t -> empowered_charge_t -> empowered_base_t -> evoker_spell_t -> evoker_action_t has no override or foreground filter; the overrides at sc_evoker.cpp:3345 and 3396 are on shifting_sands_t, a child of the release side.",
  },
  {
    simcToken: "unbound_flame",
    provenance:
      "engine/class_modules/sc_evoker.cpp:10995 unbound_flame_t. Chain unbound_flame_t -> evoker_spell_t -> evoker_action_t has no override or foreground filter; the mapping is gated on wowv >= 12.1.0, which holds for the pin data version 12.1.0.69587 (engine/dbc/generated/client_data_version.inc:6).",
  },
  {
    simcToken: "eternity_surge",
    provenance:
      "engine/class_modules/sc_evoker.cpp:10951 eternity_surge_t. Chain eternity_surge_t -> empowered_charge_spell_t -> empowered_charge_t -> empowered_base_t -> evoker_spell_t -> evoker_action_t has no override or foreground filter; the release spell is a separate object.",
  },
]);
