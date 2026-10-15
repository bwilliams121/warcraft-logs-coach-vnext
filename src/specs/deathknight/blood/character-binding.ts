/**
 * Blood Death Knight's CHARACTER BINDING (M11-G3-2): what this specialization
 * means to character reconstruction and the profile-fidelity gate.
 *
 * - specialization 250 of class 6, read through the shared class-6 loadout table;
 * - the hero tree is resolved by the existing pinned Blood dataset;
 * - the main-hand permanent enchant is the RUNEFORGE: simulation-relevant
 *   setup that must be KNOWN or observed absent, never UNKNOWN;
 * - tier-set activation is proven by spells the pinned engine reports only
 *   while a set bonus is active (engine/class_modules/sc_death_knight.cpp at
 *   33622e9d, `conditional_spell_lookup( sets->has_set_bonus( DEATH_KNIGHT_BLOOD, … ) )`).
 *   MID1's 4-piece bonus has no engine-reported spell, so it has no marker.
 *
 * No gameplay judgment: nothing here says which talents, gear or tier set are
 * good, and nothing feeds Blood's APL authority.
 */

import type { CharacterSpecBinding } from "../../../character-profile/binding.js";
import { resolveBloodHeroTree } from "../../../data/game/deathknight-blood-talents.js";
import { pinnedLoadoutTable } from "../../../data/game/trait-loadout-tables.js";

import { BLOOD_SIMULATION_BINDING } from "./simulation-binding.js";

export const BLOOD_SPEC_ID = 250;
/** Blood is a Death Knight specialization: class 6. */
export const DEATH_KNIGHT_CLASS_ID = 6;

export const BLOOD_CHARACTER_BINDING: CharacterSpecBinding = {
  simulation: BLOOD_SIMULATION_BINDING,
  specId: BLOOD_SPEC_ID,
  classId: DEATH_KNIGHT_CLASS_ID,
  loadoutTable: () => pinnedLoadoutTable(DEATH_KNIGHT_CLASS_ID),
  resolveHeroTree: resolveBloodHeroTree,
  requiredEnchantSlots: ["main_hand"],
  setBonusMarkers: [
    {
      tier: "MID1",
      pieces: 2,
      spellIds: [1271198],
      citation: "sc_death_knight.cpp:15245 spell.rejuvenating_blood (MID1 2pc)",
    },
    {
      tier: "MID2",
      pieces: 2,
      spellIds: [1310372, 1300369],
      citation:
        "sc_death_knight.cpp:15246-15247 spell.blood_debt_buff, spell.relentless_riders_strength_buff (MID2 2pc)",
    },
    {
      tier: "MID2",
      pieces: 4,
      spellIds: [1310571],
      citation: "sc_death_knight.cpp:15248 spell.bloody_demise (MID2 4pc)",
    },
  ],
};
