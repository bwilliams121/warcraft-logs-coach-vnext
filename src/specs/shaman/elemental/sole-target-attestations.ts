/**
 * shaman/elemental: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const SHAMAN_ELEMENTAL_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze([
  {
    simcToken: "elemental_blast",
    provenance:
      "engine/class_modules/sc_shaman.cpp:10350 elemental_blast_t. Chain elemental_blast_t -> shaman_spell_t -> shaman_spell_base_t -> shaman_action_t has no override or filter; the available_targets overrides at sc_shaman.cpp:6566, 7059 and 7155 belong to chain_lightning_t, fire_nova_t and lava_burst_t.",
  },
  {
    simcToken: "tempest",
    provenance:
      "engine/class_modules/sc_shaman.cpp:10372 tempest_t. Chain tempest_t -> shaman_spell_t -> shaman_spell_base_t -> shaman_action_t has no override or filter; those available_targets overrides belong to other structs.",
  },
  {
    simcToken: "flame_shock",
    provenance:
      "engine/class_modules/sc_shaman.cpp:10352 flame_shock_t. Chain flame_shock_t -> shaman_spell_t -> shaman_spell_base_t -> shaman_action_t has no override or filter; those available_targets overrides belong to other structs.",
  },
  {
    simcToken: "earth_shock",
    provenance:
      "engine/class_modules/sc_shaman.cpp:10379 earth_shock_t. Chain earth_shock_t -> shaman_spell_t -> shaman_spell_base_t -> shaman_action_t has no override or filter; those available_targets overrides belong to other structs.",
  },
]);
