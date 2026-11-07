/**
 * monk/windwalker: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 * NOT ATTESTED, and why:
 *
 *   touch_of_karma: touch_of_karma_t::target_ready (sc_monk.cpp:2819) returns false for a target named Target Dummy, a reason other than the shared rule.
 *   invoke_xuen_the_white_tiger: xuen_summon_t is a pet summon (sc_monk.cpp:3619 spawns the pet), not an ordinary harmful action aimed at the enemy.
 *   zenith: zenith_t is a self-buff cooldown (sc_monk.cpp:3989 triggers the buff on the player), not an action aimed at the enemy.
 *   touch_of_death: touch_of_death_t::target_ready (sc_monk.cpp:2674) depends on target health against player health, a reason other than the shared rule.
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const MONK_WINDWALKER_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze([
  {
    simcToken: "zenith_stomp",
    provenance:
      "engine/class_modules/monk/sc_monk.cpp:5395 zenith_stomp_t. Foreground object is built with ZENITH_STOMP_CAST (trigger variant is a background child); chain zenith_stomp_t -> monk_spell_t -> monk_action_t has no override or filter.",
  },
  {
    simcToken: "tiger_palm",
    provenance:
      "engine/class_modules/monk/sc_monk.cpp:5329 tiger_palm_t. Chain tiger_palm_t -> harmonic_surge_t -> overwhelming_force_t -> monk_melee_attack_t -> monk_action_t has no override; the TBase filter at sc_monk.cpp:575 is confirmed on impact_t, the background children built with new at sc_monk.cpp:624-628, not the foreground object.",
  },
  {
    simcToken: "celestial_conduit",
    provenance:
      "engine/class_modules/monk/sc_monk.cpp:5399 celestial_conduit_t. Chain celestial_conduit_t -> monk_spell_t -> monk_action_t has no override or filter and keeps the enemy target; the player target at sc_monk.cpp:3799 is only on the background heal child.",
  },
  {
    simcToken: "fists_of_fury",
    provenance:
      "engine/class_modules/monk/sc_monk.cpp:5373 fists_of_fury_t. Chain fists_of_fury_t -> monk_melee_attack_t -> monk_action_t has no override or filter; the target_list override at sc_monk.cpp:1768 is on the nested tick child.",
  },
  {
    simcToken: "rising_sun_kick",
    provenance:
      "engine/class_modules/monk/sc_monk.cpp:5335 rising_sun_kick_t. Chain rising_sun_kick_t -> monk_melee_attack_t -> monk_action_t has no override; the filter at sc_monk.cpp:1014 is on the nested skyfire_heel damage child, not the foreground object.",
  },
  {
    simcToken: "rushing_wind_kick",
    provenance:
      "engine/class_modules/monk/sc_monk.cpp:5337 rushing_wind_kick_t. Chain rushing_wind_kick_t -> monk_melee_attack_t -> monk_action_t has no override; damage_t is an execute_action child and the filter at sc_monk.cpp:1014 does not reach the foreground object.",
  },
  {
    simcToken: "blackout_kick",
    provenance:
      "engine/class_modules/monk/sc_monk.cpp:5331 blackout_kick_t. Chain blackout_kick_t -> overwhelming_force_t -> charred_passions_t -> teachings_of_the_monastery_t -> base_blackout_kick_t -> monk_melee_attack_t -> monk_action_t has no override or filter.",
  },
  {
    simcToken: "spinning_crane_kick",
    provenance:
      "engine/class_modules/monk/sc_monk.cpp:5339 spinning_crane_kick_t. Chain spinning_crane_kick_t -> monk_melee_attack_t -> monk_action_t has no override or filter; the tick_t set_target at sc_monk.cpp:1548 is on the background tick child.",
  },
]);
