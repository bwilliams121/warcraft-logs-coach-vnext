/**
 * priest/shadow: which `target_if` actions read the pinned profile's one target (SIMC-FB-R).
 *
 * Each row is this specialization's claim, audited against the source at 33622e9d16: the
 * action's `target_list()` under the profile is the one target and `target_ready` holds on it. Anything
 * not listed gets no target domain and its line stays UNKNOWN (`src/findings/simc-profile-fallback.ts`).
 *
 * NOT ATTESTED, and why:
 *
 *   variable: Pseudo-action: variable_t (engine/action/variable.hpp:40) is an ACTION_VARIABLE action that sets an APL variable.
 *
 */

import type { SoleTargetAttestation } from "../../../findings/simc-profile-fallback.js";

export const PRIEST_SHADOW_SOLE_TARGET_ATTESTATIONS: readonly SoleTargetAttestation[] = Object.freeze([
  {
    simcToken: "shadow_word_death",
    provenance:
      "engine/class_modules/priest/sc_priest.cpp:3086 shadow_word_death_t. Chain shadow_word_death_t -> priest_spell_t -> priest_action_t -> parse_action_effects_t<spell_t> has no override or foreground filter; the player target at sc_priest.cpp:1094 is on the self-damage child.",
  },
  {
    simcToken: "shadow_word_madness",
    provenance:
      "engine/class_modules/priest/sc_priest_shadow.cpp:2533 shadow_word_madness_t. Chain shadow_word_madness_t -> priest_spell_t -> priest_action_t -> parse_action_effects_t<spell_t> has no override or foreground filter.",
  },
  {
    simcToken: "tentacle_slam",
    provenance:
      "engine/class_modules/priest/sc_priest_shadow.cpp:2501 tentacle_slam_t. Chain tentacle_slam_t -> priest_spell_t -> priest_action_t -> parse_action_effects_t<spell_t> has no override or foreground filter; the target_list override at sc_priest_shadow.cpp:1749 is on the child tentacle_slam_dots_t.",
  },
  {
    simcToken: "void_torrent",
    provenance:
      "engine/class_modules/priest/sc_priest_shadow.cpp:2505 void_torrent_t. Chain void_torrent_t -> priest_spell_t -> priest_action_t -> parse_action_effects_t<spell_t> has no override or foreground filter.",
  },
  {
    simcToken: "shadow_word_pain",
    provenance:
      "engine/class_modules/priest/sc_priest_shadow.cpp:2509 shadow_word_pain_t. Chain shadow_word_pain_t -> priest_spell_t -> priest_action_t -> parse_action_effects_t<spell_t> has no override or foreground filter.",
  },
  {
    simcToken: "void_blast",
    provenance:
      "engine/class_modules/priest/sc_priest.cpp:3102 void_blast_shadow_t. Shadow branch at sc_priest.cpp:3105; chain void_blast_shadow_t -> mind_blast_base_t -> priest_spell_t -> priest_action_t -> parse_action_effects_t<spell_t> has no override or foreground filter.",
  },
  {
    simcToken: "mind_blast",
    provenance:
      "engine/class_modules/priest/sc_priest.cpp:3066 mind_blast_t. Chain mind_blast_t -> mind_blast_base_t -> priest_spell_t -> priest_action_t -> parse_action_effects_t<spell_t> has no override or foreground filter.",
  },
  {
    simcToken: "mind_flay_insanity",
    provenance:
      "engine/class_modules/priest/sc_priest_shadow.cpp:2493 mind_flay_insanity_t. Chain mind_flay_insanity_t -> mind_flay_base_t -> priest_spell_t -> priest_action_t -> parse_action_effects_t<spell_t> has no override or foreground filter.",
  },
  {
    simcToken: "vampiric_touch",
    provenance:
      "engine/class_modules/priest/sc_priest_shadow.cpp:2513 vampiric_touch_t. Chain vampiric_touch_t -> priest_spell_t -> priest_action_t -> parse_action_effects_t<spell_t> has no override or foreground filter; the heal is a child.",
  },
  {
    simcToken: "mind_flay",
    provenance:
      "engine/class_modules/priest/sc_priest_shadow.cpp:2489 mind_flay_t. Chain mind_flay_t -> mind_flay_base_t -> priest_spell_t -> priest_action_t -> parse_action_effects_t<spell_t> has no override or foreground filter.",
  },
]);
