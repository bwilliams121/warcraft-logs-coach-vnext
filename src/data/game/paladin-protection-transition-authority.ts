/**
 * What executing a NON_GCD Protection Paladin foreground action changes, at
 * zero elapsed simulated time (M10-C; widened in correction 1).
 *
 * THE SAME KIND OF CLAIM THE ASSASSINATION AUTHORITY MAKES, and the same rule
 * for admitting one: a contract is a hand-reviewed reading of the pinned
 * SimulationCraft source, recorded with the file, the symbol, the lines and
 * the measured hash of the bytes it rests on. The first-GCD engine executes a
 * NON_GCD entry hypothetically ONLY through a contract; an entry without one
 * refuses the branch (`TRANSITION_UNSUPPORTED`) rather than being skipped as
 * though nothing happened.
 *
 * WHAT A CONTRACT MUST SAY: EVERYTHING THE ACTION WRITES THAT THE PINNED
 * PROTECTION LIST COULD READ. The list reads buffs by name, debuffs, cooldowns
 * by name, talents, the hero tree, the previous GCD, the armament state, and
 * nothing about stats, health, or damage. So a write is either
 *
 *     OWN_PREFIX_AVAILABILITY    the entry cannot be selected again in its
 *                                own branch (every contract)
 *     PLAYER_STAT_BUFF           a rating / primary-stat aura on the player,
 *                                which no atom of the pinned list reads
 *     WINGS_BUFF_AND_COOLDOWN    `buff.avenging_wrath.up` becomes TRUE and
 *                                `cooldown.avenging_wrath.remains` becomes
 *                                the full base cooldown — atoms the list DOES
 *                                read, so the adapter overlays them in that
 *                                branch (`first-gcd-adapter.ts`)
 *     DEFERRED_PROC_CALLBACK_ARMED
 *                                a proc callback becomes active; it writes
 *                                nothing at the instant of use and fires only
 *                                on LATER hits (M10-C4, Ula'tek)
 *     HOLY_POWER_SPEND           the pinned base cost leaves the pool; the
 *                                pinned list reads no `holy_power` atom
 *     UNBOUND_ATOMS_MAY_CHANGE   atoms the list reads MAY change, in ways the
 *                                evidence cannot pin (a stack, a stochastic
 *                                proc). Admissible ONLY while every named atom
 *                                is unbound in the caller's bindings — the
 *                                engine then already enumerates both truths —
 *                                and the adapter REFUSES the contract the
 *                                moment one of them is bound without an
 *                                overlay (`requiresUnbound`)
 *
 * and an action whose writes fit none of these has no contract and refuses.
 *
 * THE CONTRACTS
 *
 *   auto_attack      schedules the main-hand swing; writes nothing the list reads
 *   potion           a stat buff and the shared `potion` cooldown
 *   fireblood        the racial stat buff (spell 273104, STR/AGI/INT)
 *   use_items        the ONE on-use effect the M10-B subject wears, 1297761
 *                    (Voracious Heart of Ula'tek). Its DBC shape is two
 *                    A_MOD_STAT auras and an E_DUMMY; the dummy is SCRIPTED
 *                    in unique_gear_midnight.cpp, and the script was read: a
 *                    primary-stat buff, a stacking primary-stat buff and a
 *                    damage proc — nothing the list reads. The contract is
 *                    admitted only for that driver with EXACTLY that shape,
 *                    and only when the caller has CLOSED the sub-action set
 *                    (every worn item, enchant and gem pinned as use/no-use),
 *                    because `use_items` fires whichever sub-action is ready
 *                    and an unpinned one could write anything.
 *   avenging_wrath   under Sentinel, `sentinel_t::execute`; otherwise
 *                    `avenging_wrath_t::execute`. Both trigger the wings buff
 *                    the APL's `buff.avenging_wrath` atom resolves to, and start
 *                    the 120,000 ms cooldown; Sentinel also triggers the Hammer
 *                    of Wrath buff (which changes Hammer of Wrath's READINESS,
 *                    a fact this build states UNKNOWN in every world already).
 *
 *   shield_of_the_righteous   (M10-C4) the NON_GCD spender: cost 3 Holy
 *                             Power from the pinned power table, 1,000 ms
 *                             cooldown, `use_off_gcd`; its writes that the
 *                             list reads — Shining Light progress
 *                             (`buff.shining_light_free`), the Lightsmith
 *                             spender buffs (`buff.divine_guidance.stack`,
 *                             `buff.blessed_assurance.up`), and the stochastic
 *                             Divine Inspiration channel its own melee hit and
 *                             Forge's Reckoning can open (`next_armament`,
 *                             `buff.sacred_weapon`) — are all UNBOUND in this
 *                             build's bindings, and the contract is admitted
 *                             only while they stay so
 *
 * WHAT IS DELIBERATELY NOT HERE, and is therefore refused rather than modelled:
 *
 *   word_of_glory             a Holy Power spend and a heal; its free cast
 *                             consumes Shining Light, which is unbound
 *   arcane_torrent            a GCD action for a Paladin (`_gcd` 1500); not a
 *                             NON_GCD step at all
 *   use_item,name=…           the named item is not worn by the subject; a
 *                             worn one would need its own reviewed contract
 *
 * Every refusal surfaces as an UNKNOWN decision with the engine's own
 * `TRANSITION_UNSUPPORTED` blocker and the entry it stopped at.
 */

import type { ItemOnUseEffect } from "./item-effect-artifact.js";

/** A hand-reviewed reading of one pinned C++ or generated-table site. */
export interface PaladinCppClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export type ProtectionTransitionWrite =
  | "OWN_PREFIX_AVAILABILITY"
  | "PLAYER_STAT_BUFF"
  | "WINGS_BUFF_AND_COOLDOWN"
  | "DEFERRED_PROC_CALLBACK_ARMED"
  | "HOLY_POWER_SPEND"
  | "UNBOUND_ATOMS_MAY_CHANGE";

/** An atom a contract may change without an overlay, admissible only while unbound. */
export interface UnboundAtomRequirement {
  readonly kind: "BUFF" | "SPEC_ATOM";
  readonly name: string;
  readonly why: string;
}

export interface ProtectionNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly ProtectionTransitionWrite[];
  /** Present iff `writes` includes UNBOUND_ATOMS_MAY_CHANGE. */
  readonly requiresUnbound?: readonly UnboundAtomRequirement[];
  /** The Holy Power the execution spends, when `writes` includes HOLY_POWER_SPEND. */
  readonly holyPowerCost?: number;
  readonly claims: readonly PaladinCppClaim[];
}

/** Measured at M10-C from the fetched pinned files; recorded, never typed from memory. */
export const SC_PALADIN_CPP_SHA256 = "519e69485c0efa9c9b51b2828a13c944b622c0c42f3f170b39e30b6ea5b36a85";
export const SC_PALADIN_PROTECTION_CPP_SHA256 =
  "9d334955482bd6e70b0b8b26d1ecc3237932f6067d142c2e99b1f0b21a5d06a4";
export const PLAYER_CPP_SHA256 = "50a804d0f63d7bffd7b9eeb89a6de054b1767c3202133c765b1b893987940a5c";
export const CONSUMABLE_CPP_SHA256 = "1a2ad7ed821bcda3f7b588e0d1e8caf5f8e027f1ad83312886965dca4f6ee941";
export const DATA_ENUMS_HH_SHA256 = "25a88c629f3d4ebb4ac966f3927307b28f756cf9cef9482dc77a79b197873ea4";
export const UNIQUE_GEAR_MIDNIGHT_CPP_SHA256 =
  "96ad359bdabe5a07e6ec3f94dcb783d9c3959c420a57a63e1fb714f5d2c47f0e";
export const BUFF_CPP_SHA256 = "e0645fc16c38a8ade1b23e07d91620d620a9eac2107a27e4e91b2bf6edc4addc";
export const DBC_PROC_CALLBACK_CPP_SHA256 =
  "53472022531b09a31338dd00ea34ccf74a4c9039e73c89f96a73b40ccb797bd1";
export const SC_PALADIN_HPP_SHA256 = "51fa0abc7fab5e433325c83a4115a7a73a2e57d93276265cf892abb894f56af1";

/** `spell_data_t::cost( POWER_HOLY_POWER )` for Shield of the Righteous, from the pinned power table. */
export const SHIELD_OF_THE_RIGHTEOUS_SPELL_ID = 53_600;
export const SHIELD_OF_THE_RIGHTEOUS_HOLY_POWER_COST = 3;
export const SHIELD_OF_THE_RIGHTEOUS_COOLDOWN_MS = 1_000;

/** The wings cooldown both records share (`_cooldown` 120000 for 31884 and 389539). */
export const WINGS_BASE_COOLDOWN_MS = 120_000;

const AUTO_ATTACK: ProtectionNonGcdTransitionContract = {
  simcToken: "auto_attack",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  claims: [
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "auto_melee_attack_t::auto_melee_attack_t",
      lines: "1026-1036",
      claim:
        "Built on spell_data_t::nil() with trigger_gcd = 0_ms: no spell record, no GCD, no cost, no cooldown.",
    },
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "auto_melee_attack_t::execute",
      lines: "1038-1044",
      claim:
        "Schedules main_hand_attack->schedule_execute() when no swing is scheduled and does nothing else: " +
        "no buff is triggered, no resource is gained, no cooldown is started, and no APL atom the pinned " +
        "Protection list reads is written.",
    },
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "auto_melee_attack_t::ready",
      lines: "1046-1052",
      claim:
        "Ready only while not moving and no swing is scheduled. Once executed in a branch the swing IS " +
        "scheduled, so the entry cannot be selected again at zero elapsed time — which is what the " +
        "prefix rule states as SIMULATED_PREFIX_EXECUTION.",
    },
  ],
};

const POTION: ProtectionNonGcdTransitionContract = {
  simcToken: "potion",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY", "PLAYER_STAT_BUFF"],
  claims: [
    {
      sourcePath: "engine/player/consumable.cpp",
      sourceSha256: CONSUMABLE_CPP_SHA256,
      symbol: "dbc_consumable_base_t::dbc_consumable_base_t",
      lines: "791-806",
      claim:
        "potion_t (consumable.cpp:428) derives from dbc_consumable_base_t, whose constructor assigns " +
        "trigger_gcd = timespan_t::zero() at consumable.cpp:804. Read off the shared base class, so the lane " +
        "holds for every potion identity; Warcraft Logs supplies no player level to pick one.",
    },
    {
      sourcePath: "engine/player/consumable.cpp",
      sourceSha256: CONSUMABLE_CPP_SHA256,
      symbol: "dbc_consumable_base_t::execute",
      lines: "838-852",
      claim:
        "Runs action_t::execute, then the consumable's own action and buff. The buff is the potion's stat " +
        "buff; the pinned Protection list reads no `buff.<potion>` atom, no stat, and no `cooldown.potion`, " +
        "so nothing it evaluates changes.",
    },
    {
      sourcePath: "engine/player/consumable.cpp",
      sourceSha256: CONSUMABLE_CPP_SHA256,
      symbol: "potion_t::potion_t / initialize_consumable",
      lines: "428-500",
      claim:
        'The constructor takes cooldown = player->get_cooldown( "potion" ) and sets its duration from the ' +
        "item effect's cooldown group, throwing if none is found — minutes, far longer than the queueing " +
        "tolerance, so a fired potion is not selectable again at zero elapsed time.",
    },
  ],
};

const FIREBLOOD: ProtectionNonGcdTransitionContract = {
  simcToken: "fireblood",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY", "PLAYER_STAT_BUFF"],
  claims: [
    {
      sourcePath: "engine/player/player.cpp",
      sourceSha256: PLAYER_CPP_SHA256,
      symbol: "fireblood_t::fireblood_t / fireblood_t::execute",
      lines: "9396-9421",
      claim:
        "A racial_spell_t on Fireblood (265221, `_gcd` 0 in the pinned Paladin dataset) targeting the " +
        "player, harmful = false; execute() runs racial_spell_t::execute and triggers one stat_buff_t on " +
        "spell 273104 adding the hybrid STR/AGI/INT stat. A primary stat is not an atom the pinned " +
        "Protection list reads.",
    },
    {
      sourcePath: "engine/player/player.cpp",
      sourceSha256: PLAYER_CPP_SHA256,
      symbol: "player_t::create_action",
      lines: "11064-11065",
      claim:
        "Dispatched by name; racial_spell_t::init backgrounds it for a race that lacks it, which the " +
        "adapter's race worlds already express as RACIAL_NOT_AVAILABLE_TO_RACE.",
    },
  ],
};

const AVENGING_WRATH: ProtectionNonGcdTransitionContract = {
  simcToken: "avenging_wrath",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY", "WINGS_BUFF_AND_COOLDOWN"],
  claims: [
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin_protection.cpp",
      sourceSha256: SC_PALADIN_PROTECTION_CPP_SHA256,
      symbol: "sentinel_t::execute",
      lines: "729-747",
      claim:
        "Expires any running sentinel / sentinel_decay buff, triggers buffs.sentinel, triggers " +
        "sentinel_decay, executes blessing_of_the_forge under Lightsmith, and triggers " +
        "buffs.hammer_of_wrath. None of sentinel_decay, blessing_of_the_forge or hammer_of_wrath is a " +
        "buff name the pinned list reads. Under the Sentinel talent the APL's " +
        "`buff.avenging_wrath` and `cooldown.avenging_wrath` are rewritten to `sentinel` " +
        "(sc_paladin.cpp:5296-5299), so the atom `buff.avenging_wrath.up` is TRUE in this branch.",
    },
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "avenging_wrath_t::execute",
      lines: "303-330",
      claim:
        "Without Sentinel, avenging_wrath_t::execute triggers buffs.avenging_wrath (and, talent-gated, " +
        "blessing_of_the_forge, empyrean_legacy and hammer_of_wrath — none a buff name the list reads); " +
        "the atom `buff.avenging_wrath.up` is TRUE in this branch under either talent, so the overlay " +
        "does not depend on which record fired.",
    },
    {
      sourcePath: "engine/dbc/generated/sc_spell_data.inc",
      sourceSha256: "d8e3d1970520f2161de6d5a59aa5ea0e7c81eaef14c6bc980d5a208ed33b4c62",
      symbol: "spell rows 31884 and 389539",
      lines: "_cooldown column",
      claim:
        "Both records carry `_cooldown` 120000 and `_gcd` 0. At zero elapsed simulated time the started " +
        "cooldown's remainder is at least the base (SimulationCraft adds a sampled non-negative lag on " +
        "start, action.cpp:2350-2360), so `cooldown.avenging_wrath.remains` is bound BELOW by 120 s.",
    },
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "paladin_t::get_how_availability / wings_up",
      lines: "4998-5006",
      claim:
        "Hammer of Wrath's readiness depends on wings_up(), which this branch makes true. This build " +
        "states Hammer of Wrath's usability UNKNOWN in every world, so the change is already covered " +
        "conservatively and nothing here narrows it.",
    },
  ],
};

/**
 * Shield of the Righteous (M10-C4). Every write the pinned execution makes
 * that the list could read is named; those the evidence cannot pin are
 * admitted only while unbound. Divine Purpose, Faith's Armor, Afterimage,
 * Sentinel decay, the Bulwark buffs, the MID1 set bonus and the Shield of the
 * Righteous mitigation buff itself are written too and are NOT read by the
 * pinned list, so they are not atoms here.
 */
const SHIELD_OF_THE_RIGHTEOUS: ProtectionNonGcdTransitionContract = {
  simcToken: "shield_of_the_righteous",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY", "HOLY_POWER_SPEND", "UNBOUND_ATOMS_MAY_CHANGE"],
  holyPowerCost: SHIELD_OF_THE_RIGHTEOUS_HOLY_POWER_COST,
  requiresUnbound: [
    {
      kind: "BUFF",
      name: "shining_light_free",
      why: "shield_of_the_righteous_t::execute advances shining_light_stacks and, at max stacks, triggers shining_light_free (default[28])",
    },
    {
      kind: "BUFF",
      name: "divine_guidance",
      why: "holy_power_consumer_t::execute triggers buffs.lightsmith.divine_guidance under the talent (default[15] reads its stack)",
    },
    {
      kind: "BUFF",
      name: "blessed_assurance",
      why: "holy_power_consumer_t::execute triggers buffs.lightsmith.blessed_assurance under the talent (default[20], default[21])",
    },
    {
      kind: "BUFF",
      name: "sacred_weapon",
      why: "the Divine Inspiration RPPM callback can cast a Sacred Weapon armament from this action's own melee hit or Forge's Reckoning (default[9])",
    },
    {
      kind: "SPEC_ATOM",
      name: "next_armament",
      why: "a Divine Inspiration proc flips the Lightsmith armament alternation (default[9], default[14])",
    },
  ],
  claims: [
    {
      sourcePath: "engine/dbc/generated/sc_spell_data.inc",
      sourceSha256: "d8e3d1970520f2161de6d5a59aa5ea0e7c81eaef14c6bc980d5a208ed33b4c62",
      symbol: "__spellpower_data rows 192485 and 312790; spell row 53600",
      lines: "91461-92342, 1856",
      claim:
        "Two Holy Power (power type 9) rows: the first costs 3 with no aura condition, the second costs 3 " +
        "under aura 1277162 (Instrument of the Divine); spell_data_t::cost( POWER_HOLY_POWER ) returns the " +
        "FIRST row of the type in table order (spell_data.hpp:756-765), so the base cost is 3. The spell row " +
        "carries `_cooldown` 1000, `_gcd` 0, no charges: a fired Shield of the Righteous is not selectable " +
        "again at zero elapsed time.",
    },
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "shield_of_the_righteous_t",
      lines: "2879-2975",
      claim:
        "use_off_gcd = is_sotr = true; background only when no shield is equipped (has_shield_equipped, " +
        "player.cpp:7664-7668 — not modelled, so applicability stays APPLICABLE). execute(): runs " +
        "holy_power_consumer_t::execute, triggers buffs.shield_of_the_righteous (not read by the list), " +
        "advances shining_light_stacks or, at max stacks, expires them and triggers shining_light_free, " +
        "executes Forge's Reckoning while blessing_of_the_forge is up, and consumes Valor. The action is a " +
        "paladin_melee_attack_t whose hit lands at the instant (no travel time).",
    },
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin.hpp",
      sourceSha256: SC_PALADIN_HPP_SHA256,
      symbol: "holy_power_consumer_t::execute",
      lines: "1540-1760",
      claim:
        "The shared spender execute: a free cast under Divine Purpose or (for Word of Glory) Shining Light, " +
        "the Divine Purpose roll under its talent, Faith's Armor, Afterimage, Sentinel decay extension, and " +
        "UNCONDITIONALLY under their Lightsmith talents buffs.lightsmith.divine_guidance->trigger() and " +
        "buffs.lightsmith.blessed_assurance->trigger(). No Holy Power spend reduces any cooldown the list " +
        "reads: in this build Righteous Protector only scales the Sentinel decay cooldown " +
        "(sc_paladin_protection.cpp:48-60) and no `cooldowns.avenging_wrath->adjust` exists in the Paladin " +
        "module.",
    },
    {
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "paladin_t::init_special_effects (Divine Inspiration)",
      lines: "4108-4137",
      claim:
        "Under the Lightsmith talent Divine Inspiration an RPPM (-0.55, haste-scaled) callback on " +
        "PF_MELEE_ABILITY | PF_RANGED | PF_RANGED_ABILITY | PF_NONE_HARMFUL | PF_MAGIC_SPELL | PF_ALL_HEAL " +
        "casts a Sacred Weapon armament. Shield of the Righteous is a melee ability whose hit lands at the " +
        "instant, so the proc is POSSIBLE at zero time and STOCHASTIC. It is admissible here only because " +
        "the atoms it writes are unbound and therefore already enumerated by the engine; binding either of " +
        "them without branching this contract would be unsound, which `requiresUnbound` refuses.",
    },
  ],
};

export const PROTECTION_NON_GCD_TRANSITIONS: readonly ProtectionNonGcdTransitionContract[] = Object.freeze([
  AUTO_ATTACK,
  POTION,
  FIREBLOOD,
  AVENGING_WRATH,
  SHIELD_OF_THE_RIGHTEOUS,
]);

/** The contract for a token, or `null` when this milestone reviewed none. */
export function protectionTransitionContractFor(
  simcToken: string,
): ProtectionNonGcdTransitionContract | null {
  return PROTECTION_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}

// ---------------------------------------------------------------------------
// On-use items
// ---------------------------------------------------------------------------

/**
 * `E_APPLY_AURA` / `A_MOD_STAT` and `E_DUMMY`, data_enums.hh:685, 1069 and 682.
 *
 * The ONE on-use driver reviewed for the M10-B subject: 1297761 applies two
 * primary-stat auras and one dummy effect. The DUMMY IS NOT "NOTHING": the
 * driver is registered to `trinkets::voracious_heart_of_ulatek` in
 * unique_gear_midnight.cpp, and that script is what the second claim below
 * reads. The shared machine classifier admits only `A_MOD_RATING` as inert
 * and therefore records this driver as `OTHER`; the reading here is the
 * specialization's, made against the pinned shape AND the pinned script, and
 * refused for any other driver.
 */
const REVIEWED_INERT_EFFECT_SHAPE: readonly { readonly type: number; readonly subtype: number }[] = [
  { type: 6, subtype: 29 },
  { type: 6, subtype: 29 },
  { type: 3, subtype: 0 },
];

export const REVIEWED_ON_USE_DRIVER_SPELL_ID = 1_297_761;

function sameShape(
  left: readonly { readonly type: number; readonly subtype: number }[],
  right: readonly { readonly type: number; readonly subtype: number }[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry.type === right[index]?.type && entry.subtype === right[index]?.subtype)
  );
}

/**
 * The transition contract for a worn on-use item, or `null` when none was
 * reviewed. FOUR gates, every one a refusal: the driver must be the reviewed
 * one, its pinned effect shape must be exactly the reviewed shape, its base
 * GCD must be zero, and it must start a positive cooldown.
 */
export function protectionItemUseContractFor(
  simcToken: "use_item" | "use_items",
  onUse: ItemOnUseEffect,
): ProtectionNonGcdTransitionContract | null {
  if (onUse.effectSpellId !== REVIEWED_ON_USE_DRIVER_SPELL_ID) return null;
  if (!sameShape(onUse.effectShape, REVIEWED_INERT_EFFECT_SHAPE)) return null;
  if (onUse.baseGcdMs !== 0) return null;
  if (!(onUse.baseCooldownMs > 0)) return null;
  return {
    simcToken,
    baseGcdMs: 0,
    timeAdvanceMs: 0,
    writes: ["OWN_PREFIX_AVAILABILITY", "PLAYER_STAT_BUFF", "DEFERRED_PROC_CALLBACK_ARMED"],
    claims: [
      {
        sourcePath: "engine/dbc/data_enums.hh",
        sourceSha256: DATA_ENUMS_HH_SHA256,
        symbol: "E_APPLY_AURA / A_MOD_STAT / E_DUMMY",
        lines: "685, 1069, 682",
        claim:
          "Driver 1297761's pinned effect rows are { 6, 29 }, { 6, 29 }, { 3, 0 }: two applied auras of " +
          "subtype A_MOD_STAT (a primary-stat modifier) and one E_DUMMY, whose behaviour is scripted and is " +
          "read in the next claim rather than assumed.",
      },
      {
        sourcePath: "engine/player/unique_gear_midnight.cpp",
        sourceSha256: UNIQUE_GEAR_MIDNIGHT_CPP_SHA256,
        symbol: "trinkets::voracious_heart_of_ulatek (registered at 6321)",
        lines: "3732-3784",
        claim:
          "On use: `effect.custom_buff` is stat_buff_t `voracious_heart_of_ulatek` (primary stat from " +
          "1297760 effect 1) and the driver's E_DUMMY is a proc callback registered as " +
          "`voracious_heart_of_ulatek_equip_driver` on PF2_ALL_HIT with cooldown 0, ACTIVATED WITH THE BUFF " +
          "(`cb->activate_with_buff( buff )`): on the player's LATER hits it executes `devour_morsel` damage " +
          "(1305374) and triggers the stacking stat buff `devoured_strength` (1305376). At the instant of " +
          "use, nothing but the stat buff is written.",
      },
      {
        sourcePath: "engine/player/player.cpp",
        sourceSha256: PLAYER_CPP_SHA256,
        symbol: "use_item_t::init / use_item_t::execute",
        lines: "9954-10035, 10055-10080",
        claim:
          "init(): buff = e->create_buff() is the custom buff; action = e->create_action() is NONE (the " +
          "driver's effects carry no damage, heal, weapon or energize effect: special_effect.cpp " +
          "action_type()). execute(): triggers the buff, executes no action, calls update_ready() and starts " +
          "the shared item cooldown group. It does NOT call action_t::execute, so no proc callback — not " +
          "the Divine Inspiration RPPM driver, not the trinket's own — is triggered by the use itself.",
      },
      {
        sourcePath: "engine/buff/buff.cpp",
        sourceSha256: BUFF_CPP_SHA256,
        symbol: "buff_t::set_rppm / buff_t::trigger / update_trigger_calculations",
        lines: "1675-1684, 2092-2131, 800-823",
        claim:
          "The script sets RPPM_DISABLE (rppm = nullptr) and cooldown 0 on the buff, so trigger() rolls " +
          "default_chance, which is 1.0 (the driver carries real_ppm 18 so the proc-chance branch is not " +
          "taken, and the disabled rppm leaves the 1.0 default). The use is DETERMINISTIC: the buff always " +
          "goes up.",
      },
      {
        sourcePath: "engine/action/dbc_proc_callback.cpp",
        sourceSha256: DBC_PROC_CALLBACK_CPP_SHA256,
        symbol: "dbc_proc_callback_t::activate_with_buff",
        lines: "124-140",
        claim:
          "The callback is deactivated at init and activated by the buff's stack-change callback when the " +
          "buff goes from 0 to up; it then fires on qualifying hit events. Its damage (`devour_morsel`, a " +
          "magic spell) can in turn trigger the Divine Inspiration RPPM callback (sc_paladin.cpp:4108-4137) " +
          "and cast a Sacred Weapon armament — but only on a LATER hit, causally after the first GCD this " +
          "query selects. For THIS question the channel is armed, not fired: DEFERRED_PROC_CALLBACK_ARMED.",
      },
      {
        sourcePath: "engine/dbc/generated/sc_spell_data.inc",
        sourceSha256: "d8e3d1970520f2161de6d5a59aa5ea0e7c81eaef14c6bc980d5a208ed33b4c62",
        symbol: "spell row 1297761",
        lines: "31361",
        claim:
          "`_cooldown` 90000, `_category` 1141, `_category_cooldown` 20000, `_gcd` 0, `_duration` 20000. The " +
          "own 90 s cooldown plus the 20 s shared category make a fired use unselectable again at zero " +
          "elapsed time; whether either is modified for a Paladin is UNREVIEWED (MODIFIERS_POSSIBLE), so " +
          "readiness before or after an observed use stays UNKNOWN rather than derived.",
      },
      {
        sourcePath: "engine/player/player.cpp",
        sourceSha256: PLAYER_CPP_SHA256,
        symbol: "use_items_t::use_items_t / use_item_t::use_item_t",
        lines: "10232, 9999",
        claim:
          "Both constructors assign trigger_gcd = timespan_t::zero(); the driver's own `_gcd` is 0 and its " +
          "`_cooldown` is 90000 ms, so a fired use is not selectable again at zero elapsed time.",
      },
    ],
  };
}
