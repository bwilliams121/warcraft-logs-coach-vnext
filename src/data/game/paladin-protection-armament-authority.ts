/**
 * Protection Paladin's pinned LIGHTSMITH ARMAMENT rules (M10-C5 Phase B) —
 * what `next_armament` is, what flips it, and what does not — hand-reviewed
 * against the same pinned SimulationCraft commit as every other Paladin
 * dataset, with the file hashes the review was made against.
 *
 * THE ALTERNATION IS FLIPPED BY A HARDCAST AND NOTHING ELSE
 *
 *   `paladin_t::cast_holy_armaments( target, usedArmament, src )`
 *   (sc_paladin.cpp:2638-2754): `changeArmament = src == LS_HARDCAST`, and
 *   `next_armament` advances only `if ( changeArmament )` (2752). The
 *   Divine Inspiration callback calls it with LS_DIVINE_INSPIRATION and
 *   advances its OWN counter, `divine_inspiration_next` (2753); Blessing of
 *   the Forge calls it with LS_WINGS (3720). Neither touches
 *   `next_armament`.
 *
 * WHAT THE LOG SHOWS
 *
 *   The player's press is `holy_armaments_t` (spell data 432459), whose
 *   execute casts `active.armament[ next_armament ]` (2632-2635). The game
 *   records that press under the armament it produced: Holy Bulwark 432459
 *   or Sacred Weapon 432472. A proc- or wings-sourced armament is a buff
 *   application (432496 / 432502) with NO cast event — the Phase B1 capture
 *   holds four of those (+21.652 s and +83.755 s at the Sentinel presses,
 *   +68.765 s and +126.835 s from Divine Inspiration) and four hardcasts,
 *   each GCD-spaced and each applying its own buff at the same millisecond,
 *   whose alternation SW → HB → SW → HB is exactly the rule above.
 *
 * WHAT A HARDCAST TELLS THE NEXT DECISION
 *
 *   A hardcast of Holy Bulwark means `next_armament` was HOLY_BULWARK when it
 *   fired and is SACRED_WEAPON after; a hardcast of Sacred Weapon the
 *   reverse. That value carries forward only while the actor's CASTS
 *   coverage is COMPLETE from the hardcast to the decision — an unretrieved
 *   hardcast in between would have flipped it again — and never across a
 *   declared coverage hole. A buff transition never anchors. A later
 *   hardcast never speaks about an earlier decision.
 */

import {
  SC_PALADIN_CPP_SHA256,
  SC_PALADIN_PROTECTION_CPP_SHA256,
} from "./paladin-protection-transition-authority.js";
import type { PaladinAuraClaim } from "./paladin-protection-aura-authority.js";

/** `armament` enum values, sc_paladin.hpp:25-29 — the numbers `next_armament` compares against. */
export const ARMAMENT_HOLY_BULWARK = 0;
export const ARMAMENT_SACRED_WEAPON = 1;

export interface ArmamentHardcastIdentity {
  /** The spell the log records the press under. */
  readonly abilityGameId: number;
  readonly displayNameEn: string;
  /** The armament this hardcast produced, so `next_armament` was this value BEFORE it. */
  readonly usedArmament: 0 | 1;
  /** `next_armament` AFTER it. */
  readonly nextArmament: 0 | 1;
  /** The buff the same press applies at the same millisecond (a corroboration, never an anchor). */
  readonly ownBuffAbilityGameId: number;
}

export const ARMAMENT_HARDCASTS: readonly ArmamentHardcastIdentity[] = [
  {
    abilityGameId: 432459,
    displayNameEn: "Holy Bulwark",
    usedArmament: 0,
    nextArmament: 1,
    ownBuffAbilityGameId: 432496,
  },
  {
    abilityGameId: 432472,
    displayNameEn: "Sacred Weapon",
    usedArmament: 1,
    nextArmament: 0,
    ownBuffAbilityGameId: 432502,
  },
];

/** Buff transitions that a proc or wings can produce WITHOUT a press; never anchors. */
export const ARMAMENT_BUFF_SPELL_IDS = [432496, 432502] as const;

export const ARMAMENT_CLAIMS: readonly PaladinAuraClaim[] = [
  {
    sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
    sourceSha256: SC_PALADIN_CPP_SHA256,
    symbol: "paladin_t::cast_holy_armaments",
    lines: "2638-2754",
    claim:
      "`bool changeArmament = src == LS_HARDCAST;` (2641) and `if ( changeArmament ) next_armament = " +
      "armament( ( next_armament + 1 ) % NUM_ARMAMENT );` (2752). LS_DIVINE_INSPIRATION advances only " +
      "`divine_inspiration_next` (2642, 2648-2651, 2753); LS_WINGS advances nothing.",
  },
  {
    sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
    sourceSha256: SC_PALADIN_CPP_SHA256,
    symbol: "holy_armaments_t",
    lines: "2613-2636",
    claim:
      '`paladin_spell_t( "holy_armaments", p, p->find_spell( 432459 ) )`; execute_time and the cast come from ' +
      "`active.armament[ p()->next_armament ]` with LS_HARDCAST (2628-2635). The two armament actions, " +
      "holy_bulwark_t and sacred_weapon_t (2576-2611), carry no spell data of their own and trigger the " +
      "buffs 432496 / 432502 on the target.",
  },
  {
    sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
    sourceSha256: SC_PALADIN_CPP_SHA256,
    symbol: "divine_inspiration_cb_t::execute; blessing_of_the_forge stack callback",
    lines: "4111-4137; 3717-3721",
    claim:
      "Divine Inspiration calls cast_holy_armaments( p, SACRED_WEAPON, LS_DIVINE_INSPIRATION ) from an RPPM " +
      "callback; Blessing of the Forge calls it with LS_WINGS when the wings buff gains a stack. Neither is " +
      "a press and neither flips next_armament.",
  },
  {
    sourcePath: "engine/class_modules/paladin/sc_paladin_protection.cpp",
    sourceSha256: SC_PALADIN_PROTECTION_CPP_SHA256,
    symbol: "sentinel_t::execute",
    lines: "729-747",
    claim:
      "The Sentinel press executes blessing_of_the_forge under Lightsmith (744-745), which is the LS_WINGS " +
      "path above: the Sacred Weapon buff applied at a Sentinel press is not a hardcast.",
  },
];
