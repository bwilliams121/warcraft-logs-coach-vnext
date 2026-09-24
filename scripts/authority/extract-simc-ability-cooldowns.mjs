#!/usr/bin/env node
/**
 * Deterministic SimulationCraft ability-cooldown extractor with a MACHINE
 * CENSUS of passive cooldown modifiers (M10-C5 Phase A).
 *
 * Reads ONE pinned SimulationCraft commit and emits, per target ability:
 *
 *   MACHINE_EXTRACTED_DBC_RECORD          base cooldown, charges, charge
 *                                         cooldown, category, category
 *                                         cooldown, family flags, labels.
 *
 *   MACHINE_CENSUS_OF_PASSIVE_TRAIT_EFFECTS
 *                                         every trait of the target class whose
 *                                         spell is SX_PASSIVE and carries an
 *                                         aura effect that SimulationCraft's
 *                                         generic passive parser would apply to
 *                                         the ability's COOLDOWN, recharge,
 *                                         charge count or haste flag — with
 *                                         the trait's identity (entry, node,
 *                                         siblings) so a consumer can resolve
 *                                         its selection against an observed
 *                                         tree, its property, its value and
 *                                         its DIRECTION.
 *
 *   HAND_REVIEWED_CPP_ABSENCE_PROOF       "nothing DYNAMIC in the class module
 *                                         resets, adjusts, hastes or overrides
 *                                         this cooldown after it starts" —
 *                                         recorded check by check against the
 *                                         measured module hashes, and every
 *                                         check that CAN be re-run
 *                                         mechanically IS re-run on every
 *                                         extraction and fails the run when
 *                                         the module has drifted.
 *
 * WHY THE CENSUS EXISTS
 *
 * A static talent such as Quickened Invocation ("Divine Toll cooldown reduced
 * by 15 s") never touches `cooldowns.divine_toll` in the class module. It is a
 * passive spell whose A_ADD_FLAT_MODIFIER / P_COOLDOWN effect the generic
 * parser (player.cpp `parse_all_passive_talents` -> `parse_passive_effects`
 * -> `register_passive_effect`) applies to the DBC row through
 * `dbc_override_->register_spell( id, "cooldown", value )` BEFORE
 * `action_t::init` reads `spell_data.cooldown()`. A hand review of the module
 * cannot see it; only the DBC can. So the extractor reads the DBC the way the
 * parser does — family flags for 107/108/416, labels for 218/219, category
 * for 341/453/454/457/411, category type mask for 173/205 — and records every
 * hit. A consumer that cannot resolve a censused trait's selection must treat
 * the modifier as POSSIBLE in the direction it acts.
 *
 * THREE PASSIVE SOURCES (M10-C5 Phase B correction)
 *
 * `parse_all_passive_talents` is not the only parser call. `parse_all_class_
 * passives` (player.cpp) parses every CLASS passive (`__passive_spells_data`
 * in class_spells.inc) and every SPECIALIZATION spell with SX_PASSIVE
 * (`__specialization_spell_data`) — and that is where the spec aura
 * "Protection Paladin" (137028) hastes Avenger's Shield, Consecration and
 * Shield of the Righteous and reduces the Judgment category's recharge, and
 * where "Consecration" rank 3 (327980) halves Consecration's cooldown. Phase
 * A's census read traits only and would have missed those; every modifier
 * now carries its `origin` (TRAIT, SPEC_PASSIVE or CLASS_PASSIVE), and a
 * passive origin is always active for the spec.
 *
 * WHAT THE CENSUS DOES NOT CLAIM
 *
 * It censuses TRAITS of one class (trait_data.inc, `id_class`) that the target
 * specialization can select (a row's spec list names the spec, or is empty),
 * the specialization's passive spells and the class's passive spells.
 * Set bonuses,
 * embellishments, racials and external auras are outside it and are covered,
 * where at all, by the hand review. It is a census of the pinned build's data,
 * not a promise about a later build.
 *
 *   node scripts/authority/extract-simc-ability-cooldowns.mjs --target paladin-protection \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-18 [--local-<key> <path> ...]
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseClientDataVersion,
  readEnumerator,
  readSpellRows,
  structMembers,
  tokenizeRow,
} from "./extract-simc-enchant-effects.mjs";
import { parseTraitRows, verifyTraitFieldOrder } from "./extract-simc-talents.mjs";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;

const SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  traitData: "engine/dbc/generated/trait_data.inc",
  traitDataLayout: "engine/dbc/trait_data.hpp",
  specializationSpells: "engine/dbc/generated/specialization_spells.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  dataEnums: "engine/dbc/data_enums.hh",
  playerModule: "engine/player/player.cpp",
  actionModule: "engine/action/action.cpp",
  classModule: "engine/class_modules/paladin/sc_paladin.cpp",
  classHeader: "engine/class_modules/paladin/sc_paladin.hpp",
  specModule: "engine/class_modules/paladin/sc_paladin_protection.cpp",
  /** The ground-effect lifetime a `<x>.up` expression over a ground aoe actually reads (M10-C5 Phase B2 audit). */
  groundAoeHeader: "engine/player/ground_aoe.hpp",
  groundAoeModule: "engine/player/ground_aoe.cpp",
};

const TREE_NAME = { 1: "CLASS", 2: "SPECIALIZATION", 3: "HERO" };
const NODE_TYPE_CHOICE = 2;

/**
 * The passive aura subtypes SimulationCraft's parser can turn into a cooldown,
 * recharge, charge or haste modification of ANOTHER spell, and how each one
 * decides which spells it affects (player.cpp `spells_affected_by_passive`).
 */
const COOLDOWN_SUBTYPES = {
  107: { name: "A_ADD_FLAT_MODIFIER", match: "CLASS_FLAGS", needsProperty: true, kind: "FLAT_MS" },
  108: { name: "A_ADD_PCT_MODIFIER", match: "CLASS_FLAGS", needsProperty: true, kind: "PCT" },
  218: { name: "A_ADD_PCT_LABEL_MODIFIER", match: "LABEL", needsProperty: true, kind: "PCT" },
  219: { name: "A_ADD_FLAT_LABEL_MODIFIER", match: "LABEL", needsProperty: true, kind: "FLAT_MS" },
  416: { name: "A_HASTED_COOLDOWN", match: "CLASS_FLAGS", needsProperty: false, kind: "HASTED" },
  341: { name: "A_MODIFY_CATEGORY_COOLDOWN", match: "CATEGORY", needsProperty: false, kind: "FLAT_MS" },
  453: { name: "A_MOD_RECHARGE_TIME_CATEGORY", match: "CATEGORY", needsProperty: false, kind: "FLAT_MS" },
  454: { name: "A_MOD_RECHARGE_TIME_PCT_CATEGORY", match: "CATEGORY", needsProperty: false, kind: "PCT" },
  457: { name: "A_HASTED_CATEGORY", match: "CATEGORY", needsProperty: false, kind: "HASTED" },
  411: { name: "A_MOD_MAX_CHARGES", match: "CATEGORY", needsProperty: false, kind: "CHARGES" },
  205: {
    name: "A_MOD_RECHARGE_TIME_CATEGORY_MASK",
    match: "CATEGORY_MASK",
    needsProperty: false,
    kind: "FLAT_MS",
  },
  173: {
    name: "A_MOD_RECHARGE_TIME_PCT_CATEGORY_MASK",
    match: "CATEGORY_MASK",
    needsProperty: false,
    kind: "PCT",
  },
};
/** `P_COOLDOWN` in the property enum (player.cpp:15112 `{ P_COOLDOWN, "cooldown" }, // 11`). */
const P_COOLDOWN = 11;
/** `E_APPLY_AURA` and the two party/pet variants `parse_passive_effects` admits. */
const APPLY_AURA_TYPES = new Set([6, 27, 35]);
/** `SX_PASSIVE` is bit 6 of `_attributes[0]` (data_enums.hh; spell_data.hpp `flags()`). */
const SX_PASSIVE_BIT = 6;

// --------------------------------------------------------------------------
// Targets
// --------------------------------------------------------------------------

const PALADIN_PROTECTION_TARGET = {
  datasetId: "SIMC_DBC_PALADIN_PROTECTION_ABILITY_COOLDOWNS",
  classId: 2,
  className: "Paladin",
  specId: 66,
  defaultOut: "src/data/game/paladin-protection-cooldowns.json",
  /**
   * The abilities the Protection first-GCD question needed at M10-C5 Phase A,
   * and only those. Each `simcToken` is the APL token whose `cooldown.<token>`
   * and readiness the ability answers; an alias group names the abilities that
   * share ONE cooldown object in the pinned module.
   */
  abilities: [
    {
      simcToken: "divine_toll",
      abilityGameId: 375576,
      aliasGroup: null,
      createAction:
        'sc_paladin.cpp:3423-3424 if ( name == "divine_toll" ) return new divine_toll_t( this, options_str )',
      specBinding:
        'sc_paladin.cpp:4201 talents.divine_toll = find_talent_spell( talent_tree::CLASS, "Divine Toll" )',
      actionStruct: { file: "classModule", name: "divine_toll_t" },
      cooldownHandle: "cooldowns.divine_toll",
      cooldownName: "divine_toll",
    },
    {
      simcToken: "avenging_wrath",
      abilityGameId: 389539,
      aliasGroup: "wings",
      createAction:
        'sc_paladin_protection.cpp:980-981 if ( name == "avenging_wrath" && talents.sentinel->ok() ) return new sentinel_t( this, options_str )',
      specBinding:
        'sc_paladin_protection.cpp:723 sentinel_t : paladin_spell_t( "sentinel", p, p->talents.sentinel )',
      actionStruct: { file: "specModule", name: "sentinel_t" },
      cooldownHandle: "cooldowns.sentinel",
      cooldownName: "sentinel",
    },
    {
      simcToken: "avenging_wrath",
      abilityGameId: 31884,
      aliasGroup: "wings",
      createAction:
        'sc_paladin.cpp:3381-3382 if ( name == "avenging_wrath" ) return new avenging_wrath_t( this, options_str )',
      specBinding:
        'sc_paladin.cpp:282-283 avenging_wrath_t : paladin_spell_t( "avenging_wrath", p, p->find_spell( 31884 ) )',
      actionStruct: { file: "classModule", name: "avenging_wrath_t", constructorOnly: true },
      cooldownHandle: "cooldowns.avenging_wrath",
      cooldownName: "avenging_wrath",
    },
    {
      simcToken: "avengers_shield",
      abilityGameId: 31935,
      aliasGroup: null,
      createAction:
        'sc_paladin_protection.cpp:972-973 create_action_protection dispatches "avengers_shield" to avengers_shield_t',
      specBinding:
        'sc_paladin_protection.cpp:1026-1030 region; avengers_shield_t : paladin_spell_t( "avengers_shield", p, p->find_specialization_spell( "Avenger\'s Shield" ) )',
      actionStruct: { file: "specModule", name: "avengers_shield_t" },
      cooldownHandle: "cooldowns.avengers_shield",
      cooldownName: "avengers_shield",
      /**
       * Grand Crusader resets the cooldown in the module with NO buff of its
       * own (sc_paladin_protection.cpp:903-950). The game applies buff 85416
       * on the same proc; that observable signature is a Warcraft Logs fact
       * the consumer must establish from evidence, not a SimulationCraft one.
       */
      knownDynamicMutations: [
        {
          member: "reset",
          site: "paladin_t::trigger_grand_crusader",
          effect: "RESET_TO_READY",
          observableSignature: {
            kind: "AURA_APPLICATION_ON_ACTOR",
            abilityGameId: 85416,
            basis:
              "Grand Crusader's proc buff (DBC 85416, 6,000 ms, an Avenger's Shield modifier by family flags); in the Phase B1 capture 16 of its 19 removals coincide to the millisecond with an Avenger's Shield cast",
          },
        },
      ],
    },
    {
      simcToken: "consecration",
      abilityGameId: 26573,
      aliasGroup: null,
      createAction: 'sc_paladin.cpp:3387-3388 create_action dispatches "consecration" to consecration_t',
      specBinding:
        'sc_paladin.cpp:425 consecration_t : paladin_spell_t( "consecration", p, p->find_spell( 26573 ) )',
      actionStruct: { file: "classModule", name: "consecration_t" },
      cooldownHandle: "cooldowns.consecration",
      cooldownName: "consecration",
      knownDynamicMutations: [
        {
          member: "adjust",
          site: "consecration_t::execute (guarded by !player->in_combat && precombat_time > 0)",
          effect: "PRECOMBAT_ONLY",
        },
      ],
      /**
       * consecration_t has TWO constructors: the hardcast one (sc_paladin.cpp:425-449)
       * leaves the cooldown as the DBC gives it; the source_name overload
       * (453-467) is for BACKGROUND copies (Divine Toll, Blessed Hammer,
       * Sacred Weapon consecrations) and zeroes their cooldown. init_finished
       * reads `cooldown->duration` for the precombat bound. Neither is an
       * override of the player's action cooldown.
       */
      knownStructCooldownReferences: {
        count: 2,
        note: "cooldown->duration = 0_ms in the background source_name constructor (453-467, background = true); cooldown->duration.total_seconds() read in init_finished for the precombat bound",
      },
      /**
       * `consecration.up` reads `active_consecration != nullptr` (sc_paladin.cpp:5036-5038):
       * the HARDCAST ground effect, whose duration is `data().duration()`. The pointer
       * is set on EVENT_CREATED and cleared on EVENT_DESTRUCTED by the state callback
       * (sc_paladin.cpp:513-546), and ground_aoe_event_t fires DESTRUCTED at EVERY
       * pulse before deciding whether another pulse fits (ground_aoe.cpp:207-283):
       * the effect is therefore alive until its LAST pulse, not until the nominal
       * duration. `lifetime` below is read mechanically from the pinned text.
       */
      groundEffect: {
        expression: "consecration.up / consecration.ticking",
        source:
          "sc_paladin.cpp:5023-5043 create_consecration_expression; 500-556 consecration_t::execute (cons_params.duration( data().duration() ); a HARDCAST cancels the previous active_consecration)",
        lifetime: {
          activeStructMember: "active_consecration",
          paramsVariable: "cons_params",
        },
      },
    },
  ],
  aliasGroups: {
    wings: {
      simcToken: "avenging_wrath",
      basis:
        "sc_paladin_protection.cpp:980-981 substitutes sentinel_t for the `avenging_wrath` action when the Sentinel talent is taken, and sc_paladin.cpp:286-291 makes avenging_wrath_t background under Sentinel; sc_paladin.cpp:5296-5299 rewrites every `<x>.avenging_wrath` expression to `<x>.sentinel` under Protection when Sentinel is taken. Both spells share DBC category 1550 with a 120,000 ms category cooldown. Which member is castable is a talent fact the consumer resolves; a cast of EITHER member anchors the group's cooldown.",
    },
  },
};

/**
 * M11-A4: the cooldowns the Retribution SPENDER slice must prove NOT READY
 * for an observed spender decision to resolve — the class/spec entries that
 * sit above the unconditional `finishers` call in the pinned list
 * (`cooldowns[9] execution_sentence`, `cooldowns[10] avenging_wrath`,
 * `generators[1] wake_of_ashes`, `generators[2] divine_toll`,
 * `generators[3] blade_of_justice`). Hammer of Wrath and Judgment are NOT
 * here: Final Verdict resets both on an unobservable proc
 * (sc_paladin_retribution.cpp:720-729), so no cooldown claim about them is
 * sound and the slice never makes one (Hammer of Wrath is gated by its
 * readiness aura instead).
 *
 * The spec module this target reads is `sc_paladin_retribution.cpp`; the
 * shared class module and header are the same files Protection pins.
 */
const PALADIN_RETRIBUTION_TARGET = {
  datasetId: "SIMC_DBC_PALADIN_RETRIBUTION_ABILITY_COOLDOWNS",
  classId: 2,
  className: "Paladin",
  specId: 70,
  defaultOut: "src/data/game/paladin-retribution-cooldowns.json",
  sourceOverrides: { specModule: "engine/class_modules/paladin/sc_paladin_retribution.cpp" },
  abilities: [
    {
      simcToken: "wake_of_ashes",
      abilityGameId: 255937,
      aliasGroup: null,
      createAction:
        'sc_paladin_retribution.cpp:1136 if ( name == "wake_of_ashes" ) return new wake_of_ashes_t( this, options_str )',
      specBinding:
        'sc_paladin_retribution.cpp:803-804 wake_of_ashes_t : paladin_spell_t( "wake_of_ashes", p, p->talents.wake_of_ashes ); :1213 talents.wake_of_ashes = find_talent_spell( talent_tree::SPECIALIZATION, "Wake of Ashes" )',
      actionStruct: { file: "specModule", name: "wake_of_ashes_t" },
      cooldownHandle: "cooldowns.wake_of_ashes",
      cooldownName: "wake_of_ashes",
    },
    {
      simcToken: "divine_toll",
      abilityGameId: 375576,
      aliasGroup: null,
      createAction:
        'sc_paladin.cpp:3423-3424 if ( name == "divine_toll" ) return new divine_toll_t( this, options_str )',
      specBinding:
        'sc_paladin.cpp:4201 talents.divine_toll = find_talent_spell( talent_tree::CLASS, "Divine Toll" )',
      actionStruct: { file: "classModule", name: "divine_toll_t" },
      cooldownHandle: "cooldowns.divine_toll",
      cooldownName: "divine_toll",
    },
    {
      simcToken: "execution_sentence",
      abilityGameId: 343527,
      aliasGroup: null,
      createAction:
        'sc_paladin_retribution.cpp:1139 if ( name == "execution_sentence" ) return new execution_sentence_t( this, options_str )',
      specBinding:
        'sc_paladin_retribution.cpp:216-217 execution_sentence_t : paladin_melee_attack_t( "execution_sentence", p, p->talents.execution_sentence ); :1215 talents.execution_sentence = find_talent_spell( talent_tree::SPECIALIZATION, "Execution Sentence" )',
      actionStruct: { file: "specModule", name: "execution_sentence_t" },
      cooldownHandle: "cooldowns.execution_sentence",
      cooldownName: "execution_sentence",
      /**
       * The constructor re-assigns the action's own cooldown from its own DBC
       * record (`cooldown->duration = data().cooldown()`, :229): a no-op
       * restatement, not an override of the pinned value.
       */
      knownStructCooldownReferences: {
        count: 1,
        note: "cooldown->duration = data().cooldown() in the constructor (:229) re-reads the same DBC field the base action reads; no other value is ever assigned",
      },
    },
    {
      simcToken: "avenging_wrath",
      abilityGameId: 31884,
      aliasGroup: null,
      createAction:
        'sc_paladin.cpp:3381-3382 if ( name == "avenging_wrath" ) return new avenging_wrath_t( this, options_str )',
      specBinding:
        'sc_paladin.cpp:282-283 avenging_wrath_t : paladin_spell_t( "avenging_wrath", p, p->find_spell( 31884 ) ); background under Radiant Glory (:290-291) — Retribution has no Sentinel substitution',
      actionStruct: { file: "classModule", name: "avenging_wrath_t", constructorOnly: true },
      cooldownHandle: "cooldowns.avenging_wrath",
      cooldownName: "avenging_wrath",
    },
    {
      simcToken: "blade_of_justice",
      abilityGameId: 184575,
      aliasGroup: null,
      createAction:
        'sc_paladin_retribution.cpp:1133 if ( name == "blade_of_justice" ) return new blade_of_justice_t( this, options_str )',
      specBinding:
        'sc_paladin_retribution.cpp:370 blade_of_justice_t : paladin_melee_attack_t( "blade_of_justice", p, p->talents.blade_of_justice ); :1185 talents.blade_of_justice = find_talent_spell( talent_tree::SPECIALIZATION, "Blade of Justice" )',
      actionStruct: { file: "specModule", name: "blade_of_justice_t" },
      cooldownHandle: "cooldowns.blade_of_justice",
      cooldownName: "blade_of_justice",
      /**
       * THREE reset sites, each observable through an aura on the actor. A
       * consumer may claim Blade of Justice NOT READY only while no Art of War
       * (406086) application/refresh and no Righteous Cause (402916) aura
       * event lies between the anchoring cast and the decision.
       */
      knownDynamicMutations: [
        {
          member: "reset",
          site: "paladin_melee_attack_t::impact Art of War proc (sc_paladin.cpp:1005-1015)",
          effect: "RESET_TO_READY",
          observableSignature: {
            kind: "AURA_APPLICATION_ON_ACTOR",
            abilityGameId: 406086,
            basis:
              'buffs.art_of_war->trigger() (sc_paladin.cpp:1011) precedes the reset on the same proc; buffs.art_of_war = make_buff( this, "art_of_war", find_spell( 406086 ) ) (sc_paladin_retribution.cpp:1164)',
          },
        },
        {
          member: "reset",
          site: "blade_of_justice_t::execute, Light Within stacking branch on an Art of War / Righteous Cause stack decrease (sc_paladin_retribution.cpp:398-405)",
          effect: "RESET_TO_READY",
          observableSignature: {
            kind: "AURA_STACK_CHANGE_ON_ACTOR",
            abilityGameIds: [406086, 402916],
            basis:
              "the branch fires only when buffs.art_of_war or buffs.righteous_cause lost a stack during this execute; both are auras the log reports on the actor",
          },
        },
        {
          member: "reset",
          site: "blade_of_justice_t::execute, Light Within Righteous Cause decrement (sc_paladin_retribution.cpp:416-423)",
          effect: "RESET_TO_READY",
          observableSignature: {
            kind: "AURA_STACK_CHANGE_ON_ACTOR",
            abilityGameIds: [402916],
            basis:
              'buffs.righteous_cause->decrement() precedes the reset; buffs.righteous_cause = make_buff( this, "righteous_cause", find_spell( 402916 ) ) (sc_paladin_retribution.cpp:1165)',
          },
        },
      ],
      /**
       * The nested Light Within child (light_within_t, :328-368) zeroes ITS
       * OWN cooldown; the parent's cooldown is untouched.
       */
      knownStructCooldownReferences: {
        count: 1,
        note: "cooldown->duration = 0_ms in the nested light_within_t constructor (:368) is the background child's cooldown, not blade_of_justice_t's",
      },
    },
  ],
  aliasGroups: {},
};

/**
 * The Blood Death Knight target (M11-B2): ONE ability, Dancing Rune Weapon.
 *
 * It is the only cooldown the M11-B2 measurement slice claims anything about:
 * a GCD-consuming (`_gcd` 1500) entry of `high_prio_actions` whose gate
 * reads `fight_remains` and therefore never resolves before +300 s, so the
 * only way a scan gets past it is a PROVEN active cooldown from an observed
 * cast. Vampiric Blood is deliberately NOT here — `cooldown.vampiric_blood->
 * adjust( -sec )` under Red Thirst (sc_death_knight.cpp:13143-13147) shortens
 * it dynamically by Runic Power spent, so no lower bound on its remaining
 * time is sound; nor is Raise Dead, Blood Boil (hasted charges, a Plague
 * Infusion adjust and a reset), Consumption (a reset) or Death and Decay.
 * Each of those stays UNKNOWN and is measured as such.
 *
 * One class module holds every Death Knight specialization: there is no spec
 * module and no class header, and the module conventions the Paladin targets
 * verify (a Blessing-of-Autumn recharge multiplier, a `hasted_cd` base member)
 * do not exist in it — declared absent below and checked generically.
 */
const DEATHKNIGHT_BLOOD_TARGET = {
  datasetId: "SIMC_DBC_DEATHKNIGHT_BLOOD_ABILITY_COOLDOWNS",
  classId: 6,
  className: "Death Knight",
  specId: 250,
  defaultOut: "src/data/game/deathknight-blood-cooldowns.json",
  sourceOverrides: {
    classModule: "engine/class_modules/sc_death_knight.cpp",
    specModule: null,
    classHeader: null,
  },
  moduleConventions: {
    moduleLabel: "sc_death_knight.cpp",
    rechargeRateMechanism: null,
    hastedCooldownMember: null,
  },
  abilities: [
    {
      simcToken: "dancing_rune_weapon",
      abilityGameId: 49028,
      aliasGroup: null,
      createAction:
        'sc_death_knight.cpp:14361-14362 if ( name == "dancing_rune_weapon" ) return new dancing_rune_weapon_t( this, options_str )',
      specBinding:
        'sc_death_knight.cpp:9476-9479 dancing_rune_weapon_t : death_knight_spell_t( "dancing_rune_weapon", p, p->talent.blood.dancing_rune_weapon ); :14914 talent.blood.dancing_rune_weapon = find_talent_spell( talent_tree::SPECIALIZATION, "Dancing Rune Weapon" ), whose Blood trait row carries spell 49028; the module handle cooldown.dancing_rune_weapon = get_cooldown( "dancing_rune_weapon" ) at :1948',
      actionStruct: { file: "classModule", name: "dancing_rune_weapon_t" },
      cooldownHandle: "cooldown.dancing_rune_weapon",
      cooldownName: "dancing_rune_weapon",
    },
  ],
  aliasGroups: {},
};

/**
 * The Brewmaster Monk target (M11-C1): authority data only, no analyzer.
 *
 * SIX abilities, each an APL action whose cooldown NOTHING in the pinned
 * module mutates after it starts — verified by this extractor's mechanical
 * policy AND by a hand review of the one mutation path that policy cannot
 * see (below). Monk keeps one class module and a class header in its own
 * directory; there is no spec module.
 *
 * DELIBERATELY NOT PINNED, each for a reason read at the pin:
 *
 *   - celestial_brew (322507), celestial_infusion (1241059), purifying_brew,
 *     black_ox_brew, fortifying_brew: every one is a `brew_t<...>`, whose
 *     constructor inserts the action's cooldown into
 *     `baseline.brewmaster.brews` (sc_monk.cpp:4153-4156, :4168-4171). That
 *     container is mutated through a GENERIC `cooldown->` receiver —
 *     `brews_t::adjust` (:4178-4185, called from Tiger Palm :874-877, Press
 *     the Advantage :2163-2164, Keg Smash :2606, Empty the Cellar :3432 and
 *     Anvil & Stave on an avoided hit :7250-7251) and Black Ox Brew's resets
 *     (:3122-3130) — which the handle
 *     and name searches of `dynamicPolicyChecks` do not see. Run naively, the
 *     policy PASSES Celestial Brew, Purifying Brew and Fortifying Brew; that
 *     pass would be a false absence proof, so none of the five is pinned.
 *   - keg_smash: reset by exploding_keg_t::execute (:3408) and by the Empty
 *     Barrel buff trigger (:4514-4516). The first has no aura signature the
 *     artifact schema can express (it is a cast), so no sound lower bound.
 *     The mechanical policy fails it, correctly.
 *   - breath_of_fire: reset by keg_smash_t::execute under Sal'salabim's
 *     Strength (:2548-2549, :2588-2592) — again a cast, not an aura. The
 *     mechanical policy fails it, correctly.
 *   - empty_the_cellar: no DBC cooldown; its usability is the aura gate of
 *     empty_the_cellar_t::ready() (:3447-3450), pinned beside the other
 *     readiness facts, not here.
 */
const MONK_BREWMASTER_TARGET = {
  datasetId: "SIMC_DBC_MONK_BREWMASTER_ABILITY_COOLDOWNS",
  classId: 10,
  className: "Monk",
  specId: 268,
  defaultOut: "src/data/game/monk-brewmaster-cooldowns.json",
  sourceOverrides: {
    classModule: "engine/class_modules/monk/sc_monk.cpp",
    classHeader: "engine/class_modules/monk/sc_monk.hpp",
    specModule: null,
  },
  moduleConventions: {
    moduleLabel: "sc_monk.cpp",
    rechargeRateMechanism: null,
    hastedCooldownMember: null,
  },
  cooldownStartNote:
    "Execution coincides with the observed cast event. Five of the six pinned abilities are instant; Chi Burst " +
    "carries a 1,000 ms cast time, and its execute — hence update_ready() — happens at cast completion, which is " +
    "when the log reports its cast.",
  abilities: [
    {
      simcToken: "blackout_kick",
      abilityGameId: 205523,
      aliasGroup: null,
      createAction:
        'sc_monk.cpp:5331-5332 if ( name == "blackout_kick" ) return new blackout_kick_t( this, options_str )',
      specBinding:
        'sc_monk.cpp:1368-1371 blackout_kick_t : base_t( player, "blackout_kick", specialization() == MONK_BREWMASTER ? baseline.brewmaster.blackout_kick : baseline.monk.blackout_kick ); :5587 baseline.brewmaster.blackout_kick = find_spell( 205523 ); the module handle cooldown.blackout_kick = get_cooldown( "blackout_kick" ) at :5231',
      actionStruct: { file: "classModule", name: "blackout_kick_t" },
      cooldownHandle: "cooldown.blackout_kick",
      cooldownName: "blackout_kick",
    },
    {
      simcToken: "expel_harm",
      abilityGameId: 322101,
      aliasGroup: null,
      createAction:
        'sc_monk.cpp:5333-5334 if ( name == "expel_harm" ) return new expel_harm_t( this, options_str )',
      specBinding:
        'sc_monk.cpp:4011-4014 expel_harm_t : monk_heal_t( player, "expel_harm", talent.windwalker.combat_wisdom->ok() ? talent.windwalker.combat_wisdom_expel_harm : baseline.monk.expel_harm ); :5562 baseline.monk.expel_harm = find_spell( 322101 ); the header declares a cooldown.expel_harm handle (sc_monk.hpp:632) that the module never initialises',
      actionStruct: { file: "classModule", name: "expel_harm_t" },
      cooldownHandle: "cooldown.expel_harm",
      cooldownName: "expel_harm",
    },
    {
      simcToken: "chi_burst",
      abilityGameId: 123986,
      aliasGroup: null,
      createAction:
        'sc_monk.cpp:5367-5368 if ( name == "chi_burst" ) return new chi_burst_t( this, options_str )',
      specBinding:
        'sc_monk.cpp:3022-3025 chi_burst_t : monk_spell_t( player, "chi_burst", specialization() == MONK_WINDWALKER ? talent.monk.chi_burst_projectile : talent.monk.chi_burst ); :5643 talent.monk.chi_burst = _CT( "Chi Burst" ), whose class trait row carries spell 123986; no module handle names this cooldown',
      actionStruct: { file: "classModule", name: "chi_burst_t" },
      cooldownHandle: "cooldown.chi_burst",
      cooldownName: "chi_burst",
    },
    {
      simcToken: "invoke_niuzao",
      abilityGameId: 132578,
      aliasGroup: null,
      createAction:
        'sc_monk.cpp:5359-5360 if ( name == "invoke_niuzao" ) return new niuzao_spell_t( this, options_str )',
      specBinding:
        'sc_monk.cpp:3734-3735 niuzao_spell_t : monk_spell_t( player, "invoke_niuzao_the_black_ox", talent.brewmaster.invoke_niuzao_the_black_ox ) — the action, and so its cooldown, is named invoke_niuzao_the_black_ox; :5760 talent.brewmaster.invoke_niuzao_the_black_ox = _ST( "Invoke Niuzao, the Black Ox" ), trait row spell 132578',
      actionStruct: { file: "classModule", name: "niuzao_spell_t" },
      cooldownHandle: "cooldown.invoke_niuzao_the_black_ox",
      cooldownName: "invoke_niuzao_the_black_ox",
    },
    {
      simcToken: "exploding_keg",
      abilityGameId: 325153,
      aliasGroup: null,
      createAction:
        'sc_monk.cpp:5357-5358 if ( name == "exploding_keg" ) return new exploding_keg_t( this, options_str )',
      specBinding:
        'sc_monk.cpp:3381-3382 exploding_keg_t : monk_spell_t( player, "exploding_keg", talent.brewmaster.exploding_keg ); :5754 talent.brewmaster.exploding_keg = _ST( "Exploding Keg" ), trait row spell 325153',
      actionStruct: { file: "classModule", name: "exploding_keg_t" },
      cooldownHandle: "cooldown.exploding_keg",
      cooldownName: "exploding_keg",
    },
    {
      simcToken: "rushing_jade_wind",
      abilityGameId: 116847,
      aliasGroup: null,
      createAction:
        'sc_monk.cpp:5389-5390 if ( name == "rushing_jade_wind" ) return new rushing_jade_wind_t( this, options_str )',
      specBinding:
        'sc_monk.cpp:1476-1477 rushing_jade_wind_t : monk_melee_attack_t( player, "rushing_jade_wind", talent.brewmaster.rushing_jade_wind ); :5713 talent.brewmaster.rushing_jade_wind = _ST( "Rushing Jade Wind" ), trait row spell 116847',
      actionStruct: { file: "classModule", name: "rushing_jade_wind_t" },
      cooldownHandle: "cooldown.rushing_jade_wind",
      cooldownName: "rushing_jade_wind",
    },
  ],
  aliasGroups: {},
};

export const TARGETS = {
  "deathknight-blood": DEATHKNIGHT_BLOOD_TARGET,
  "monk-brewmaster": MONK_BREWMASTER_TARGET,
  "paladin-protection": PALADIN_PROTECTION_TARGET,
  "paladin-retribution": PALADIN_RETRIBUTION_TARGET,
};

function fail(message) {
  console.error(`EXTRACTION FAILED: ${message}`);
  process.exit(1);
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    args[key] = next === undefined || next.startsWith("--") ? true : next;
    if (args[key] !== true) i += 1;
  }
  return args;
}

// --------------------------------------------------------------------------
// DBC reading
// --------------------------------------------------------------------------

function intToken(token) {
  if (token === undefined || !/^-?\d+(?:\.0+)?$/.test(token)) return null;
  return Number.parseInt(token, 10);
}

function numberToken(token) {
  if (token === undefined || !/^-?\d+(?:\.\d+)?$/.test(token)) return null;
  return Number(token);
}

function arrayToken(token) {
  if (token === undefined || !token.startsWith("{")) return null;
  const values = token
    .replace(/[{}]/g, "")
    .split(",")
    .map((v) => intToken(v.trim()));
  return values.some((v) => v === null) ? null : values;
}

/** Spell rows with their family, flag and attribute arrays, for every wanted id. */
export function readSpellRecords(text, wantedIds, members) {
  const wanted = new Set(wantedIds);
  const at = (name) => members.indexOf(name);
  const found = new Map();
  const start = text.indexOf("__spell_data[");
  const end = text.indexOf("\n};", start);
  for (const line of text.slice(start, end).split(/\r?\n/)) {
    if (!line.includes('{ "')) continue;
    const tokens = tokenizeRow(line);
    if (tokens === null) continue;
    const id = intToken(tokens[at("_id")]);
    if (id === null || !wanted.has(id) || found.has(id)) continue;
    const record = {
      spellId: id,
      nameEn: tokens[0].replace(/^"|"$/g, ""),
      cooldownMs: intToken(tokens[at("_cooldown")]),
      categoryCooldownMs: intToken(tokens[at("_category_cooldown")]),
      category: intToken(tokens[at("_category")]),
      categoryTypeMask: intToken(tokens[at("_category_type")]),
      charges: intToken(tokens[at("_charges")]),
      chargeCooldownMs: intToken(tokens[at("_charge_cooldown")]),
      internalCooldownMs: intToken(tokens[at("_internal_cooldown")]),
      gcdMs: intToken(tokens[at("_gcd")]),
      durationMs: intToken(tokens[at("_duration")]),
      classFamily: intToken(tokens[at("_class_flags_family")]),
      classFlags: arrayToken(tokens[at("_class_flags")]),
      attributes: arrayToken(tokens[at("_attributes")]),
    };
    if (Object.values(record).some((value) => value === null)) {
      return { ok: false, error: `spell ${String(id)}: a required field is not readable` };
    }
    found.set(id, record);
  }
  return { ok: true, records: found };
}

/** Every `(spell, label)` pair of `__spelllabel_data`, as a map spell -> labels. */
export function readSpellLabels(text) {
  const start = text.indexOf("__spelllabel_data");
  if (start < 0) return null;
  const end = text.indexOf("} };", start);
  const labels = new Map();
  for (const match of text.slice(start, end).matchAll(/\{\s*(\d+),\s*(-?\d+)\s*\}/g)) {
    const spellId = Number(match[1]);
    labels.set(spellId, [...(labels.get(spellId) ?? []), Number(match[2])]);
  }
  return labels;
}

/** Every aura effect row of the wanted spells, with the fields the census reads. */
export function readAuraEffects(text, wantedSpellIds, members) {
  const wanted = new Set(wantedSpellIds);
  const at = (name) => members.indexOf(name);
  const effects = [];
  let examined = 0;
  const start = text.indexOf("__spelleffect_data[");
  const end = text.indexOf("\n};", start);
  for (const line of text.slice(start, end).split(/\r?\n/)) {
    const tokens = tokenizeRow(line);
    if (tokens === null) continue;
    const spellId = intToken(tokens[at("_spell_id")]);
    if (spellId === null || !wanted.has(spellId)) continue;
    examined += 1;
    const effect = {
      effectId: intToken(tokens[at("_id")]),
      spellId,
      index: intToken(tokens[at("_index")]),
      type: intToken(tokens[at("_type")]),
      subtype: intToken(tokens[at("_subtype")]),
      baseValue: numberToken(tokens[at("_base_value")]),
      miscValue1: intToken(tokens[at("_misc_value")]),
      miscValue2: intToken(tokens[at("_misc_value_2")]),
      classFlags: arrayToken(tokens[at("_class_flags")]),
    };
    if (Object.values(effect).some((value) => value === null)) continue;
    effects.push(effect);
  }
  return { effects, examined };
}

function isPassive(record) {
  return ((record.attributes[0] ?? 0) & (1 << SX_PASSIVE_BIT)) !== 0;
}

/**
 * Whether one passive aura effect would be applied to `target` by the generic
 * parser, and how it matched. Mirrors player.cpp `spells_affected_by_passive`.
 */
export function passiveEffectMatch(effect, ownerRecord, target, targetLabels) {
  const rule = COOLDOWN_SUBTYPES[effect.subtype];
  if (rule === undefined) return null;
  if (rule.needsProperty && effect.miscValue1 !== P_COOLDOWN) return null;
  switch (rule.match) {
    case "CLASS_FLAGS": {
      if (ownerRecord.classFamily !== target.classFamily) return null;
      const hit = effect.classFlags.some((word, i) => (word & (target.classFlags[i] ?? 0)) !== 0);
      return hit ? "CLASS_FLAGS" : null;
    }
    case "LABEL":
      return targetLabels.includes(effect.miscValue2) ? `LABEL:${String(effect.miscValue2)}` : null;
    case "CATEGORY":
      return target.category !== 0 && effect.miscValue1 === target.category
        ? `CATEGORY:${String(target.category)}`
        : null;
    case "CATEGORY_MASK": {
      // `spells_by_category_mask_bit( i )` walks the mask's set bits against the
      // spell category's type mask. A target whose category type mask is 0 is
      // in no mask; otherwise the bit test is recorded conservatively as a hit
      // when any set bit of the effect mask is set in the target's mask.
      if (target.categoryTypeMask === 0) return null;
      const hit = (effect.miscValue1 & target.categoryTypeMask) !== 0;
      return hit ? `CATEGORY_MASK:${String(effect.miscValue1)}` : null;
    }
    default:
      return null;
  }
}

function directionOf(kind, value) {
  if (kind === "HASTED") return "SHORTENS_WITH_HASTE";
  if (kind === "CHARGES") return "CHANGES_CHARGES";
  if (value < 0) return "SHORTENS";
  if (value > 0) return "LENGTHENS";
  return "NONE";
}

/** The census of one class's passive traits against one target spell. */
export function censusPassiveModifiers({
  traits,
  traitRecords,
  effects,
  target,
  labels,
  specId,
  specPassiveIds = new Set(),
  classPassiveIds = new Set(),
  property = "COOLDOWN",
}) {
  const targetLabels = labels.get(target.spellId) ?? [];
  const matches = [];
  for (const effect of effects) {
    if (!APPLY_AURA_TYPES.has(effect.type)) continue;
    const owner = traitRecords.get(effect.spellId);
    if (owner === undefined || !isPassive(owner)) continue;
    const matched =
      property === "COOLDOWN"
        ? passiveEffectMatch(effect, owner, target, targetLabels)
        : durationEffectMatch(effect, owner, target);
    if (matched === null) continue;
    const rule = property === "COOLDOWN" ? COOLDOWN_SUBTYPES[effect.subtype] : DURATION_RULES[effect.subtype];
    const origin = specPassiveIds.has(effect.spellId)
      ? "SPEC_PASSIVE"
      : classPassiveIds.has(effect.spellId)
        ? "CLASS_PASSIVE"
        : null;
    if (origin !== null) {
      matches.push({
        origin,
        talentSpellId: effect.spellId,
        displayNameEn: owner.nameEn,
        tree: null,
        specIds: [],
        traitNodeId: null,
        traitEntryId: null,
        nodeType: null,
        alternativeEntries: [],
        effectId: effect.effectId,
        effectIndex: effect.index,
        subtype: effect.subtype,
        subtypeName: rule.name,
        miscValue1: effect.miscValue1,
        miscValue2: effect.miscValue2,
        matchedBy: matched,
        kind: rule.kind,
        value: effect.baseValue,
        direction: directionOf(rule.kind, effect.baseValue),
      });
    }
    for (const trait of traits.filter(
      (row) =>
        row.talentSpellId === effect.spellId && (row.specIds.length === 0 || row.specIds.includes(specId)),
    )) {
      const siblings = traits.filter(
        (row) => row.traitNodeId === trait.traitNodeId && row.traitEntryId !== trait.traitEntryId,
      );
      matches.push({
        origin: "TRAIT",
        talentSpellId: effect.spellId,
        displayNameEn: owner.nameEn,
        tree: TREE_NAME[trait.treeIndex] ?? `TREE_${String(trait.treeIndex)}`,
        specIds: trait.specIds,
        traitNodeId: trait.traitNodeId,
        traitEntryId: trait.traitEntryId,
        nodeType: trait.nodeType === NODE_TYPE_CHOICE ? "CHOICE" : "NORMAL",
        alternativeEntries: siblings.map((row) => ({
          traitEntryId: row.traitEntryId,
          displayNameEn: row.displayNameEn,
          talentSpellId: row.talentSpellId,
        })),
        effectId: effect.effectId,
        effectIndex: effect.index,
        subtype: effect.subtype,
        subtypeName: rule.name,
        miscValue1: effect.miscValue1,
        miscValue2: effect.miscValue2,
        matchedBy: matched,
        kind: rule.kind,
        value: effect.baseValue,
        direction: directionOf(rule.kind, effect.baseValue),
      });
    }
  }
  matches.sort(
    (a, b) =>
      a.talentSpellId - b.talentSpellId ||
      (a.traitEntryId ?? 0) - (b.traitEntryId ?? 0) ||
      a.effectIndex - b.effectIndex,
  );
  return matches;
}

/** `P_DURATION` (1): the property a ground effect's lifetime reads. */
const P_DURATION = 1;
const DURATION_RULES = {
  107: { name: "A_ADD_FLAT_MODIFIER", kind: "FLAT_MS" },
  108: { name: "A_ADD_PCT_MODIFIER", kind: "PCT" },
};

/** A flat/pct modifier of the DURATION property, matched by class family flags. */
export function durationEffectMatch(effect, ownerRecord, target) {
  if (DURATION_RULES[effect.subtype] === undefined || effect.miscValue1 !== P_DURATION) return null;
  if (ownerRecord.classFamily !== target.classFamily) return null;
  const hit = effect.classFlags.some((word, i) => (word & (target.classFlags[i] ?? 0)) !== 0);
  return hit ? "CLASS_FLAGS" : null;
}

/** The spell ids of one class's passive spells and one spec's passive spells, as SimulationCraft's parser enumerates them. */
export function readPassiveSpellIds({
  classSpellsText,
  specializationSpellsText,
  classId,
  specId,
  spellRecords,
}) {
  const passiveBlock = classSpellsText.slice(classSpellsText.indexOf("__passive_spells_data"));
  const classPassiveIds = new Set(
    [...passiveBlock.matchAll(/\{\s*(\d+),\s*(\d+)\s*,/g)]
      .filter((match) => Number(match[1]) === classId)
      .map((match) => Number(match[2])),
  );
  const specPassiveIds = new Set(
    [...specializationSpellsText.matchAll(/^\s*\{\s*(\d+),\s*(\d+),\s*(\d+),/gm)]
      .filter((match) => Number(match[1]) === classId && Number(match[2]) === specId)
      .map((match) => Number(match[3]))
      .filter((id) => {
        const record = spellRecords.get(id);
        return record !== undefined && isPassive(record);
      }),
  );
  return { classPassiveIds, specPassiveIds };
}

// --------------------------------------------------------------------------
// Hand-reviewed, mechanically re-checked dynamic policy
// --------------------------------------------------------------------------

function count(text, needle) {
  return text.split(needle).length - 1;
}

function lineNumbersOf(text, needle) {
  const lines = text.split(/\r?\n/);
  const found = [];
  lines.forEach((line, index) => {
    if (line.includes(needle)) found.push(index + 1);
  });
  return found;
}

/** The body of `struct <name>` (from its line to the next `};` at column 0), or null. */
export function structBody(text, name) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^struct\\s+${name}\\b`).test(line));
  if (start < 0) return null;
  let end = start;
  while (end < lines.length && lines[end] !== "};") end += 1;
  return { startLine: start + 1, endLine: end + 1, text: lines.slice(start, end + 1).join("\n") };
}

/** The out-of-line constructors and methods of `<name>::` in a file, concatenated. */
function outOfLineMembers(text, name) {
  const lines = text.split(/\r?\n/);
  const chunks = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!new RegExp(`^[A-Za-z_][^(]*\\b${name}::`).test(lines[i])) continue;
    let depth = 0;
    let seen = false;
    let j = i;
    for (; j < lines.length; j += 1) {
      for (const char of lines[j]) {
        if (char === "{") {
          depth += 1;
          seen = true;
        } else if (char === "}") depth -= 1;
      }
      if (seen && depth === 0) break;
    }
    chunks.push({ startLine: i + 1, endLine: j + 1, text: lines.slice(i, j + 1).join("\n") });
    i = j;
  }
  return chunks;
}

/** The nearest `struct <x>` above a line number. */
function enclosingStruct(text, lineNumber) {
  const lines = text.split(/\r?\n/);
  for (let i = lineNumber - 1; i >= 0; i -= 1) {
    const match = /^struct\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(lines[i] ?? "");
    if (match !== null) return match[1];
  }
  return null;
}

/**
 * The ground-effect LIFETIME rule a `<x>.up` expression actually follows,
 * read mechanically from the pinned ground_aoe files and the class module
 * (M10-C5 Phase B2 audit). Every fact below is REQUIRED to hold; a drifted
 * module fails the extraction.
 *
 *   ground_aoe_params_t()            pulse_time_( 1_s ), expiration_pulse_( NO_EXPIRATION_PULSE ), n_pulses_( 0 )
 *   _pulse_time                      tick *= p->cache.spell_haste() under SPELL_HASTE (haste only SHORTENS the tick)
 *   may_pulse (NO_EXPIRATION_PULSE)  return time_left >= pulse_time( false )
 *   execute                          EVENT_DESTRUCTED is fired at EVERY pulse, then `if ( may_pulse() ) schedule_event()`
 *   internal constructor             EVENT_CREATED is fired for every scheduled pulse event
 *   consecration_t                   cons_params sets duration and hasted( SPELL_HASTE ) and NOTHING else about
 *                                    pulsing; the callback sets the active pointer on EVENT_CREATED and clears it
 *                                    on EVENT_DESTRUCTED
 *
 * Consequence: the pointer is non-null from the cast until the LAST pulse —
 * the first pulse after which less than one hasted tick of the duration
 * remains — which lies in (D − tick, D] with tick ≤ pulseBaseMs. A consumer
 * may claim TRUE only while elapsed ≤ D − pulseBaseMs, and FALSE only after D.
 */
export function groundEffectLifetimeChecks(ability, loaded) {
  const problems = [];
  const need = (text, needle, where) => {
    if (!text.includes(needle))
      problems.push(`${ability.simcToken}: ${where} no longer contains \`${needle}\``);
  };
  const forbid = (text, needle, where) => {
    if (text.includes(needle)) problems.push(`${ability.simcToken}: ${where} now contains \`${needle}\``);
  };
  const aoe = loaded.groundAoeModule;
  need(aoe, "pulse_time_( 1_s )", "ground_aoe.cpp ground_aoe_params_t()");
  need(aoe, "expiration_pulse_( NO_EXPIRATION_PULSE )", "ground_aoe.cpp ground_aoe_params_t()");
  need(aoe, "n_pulses_( 0 )", "ground_aoe.cpp ground_aoe_params_t()");
  need(
    aoe,
    "case ground_aoe_params_t::SPELL_HASTE:       tick *= p->cache.spell_haste();",
    "ground_aoe.cpp _pulse_time",
  );
  need(aoe, "return time_left >= pulse_time( false );", "ground_aoe.cpp may_pulse");
  need(
    aoe,
    "params->state_callback()( ground_aoe_params_t::EVENT_DESTRUCTED, this );",
    "ground_aoe.cpp execute",
  );
  need(
    aoe,
    "params->state_callback()( ground_aoe_params_t::EVENT_CREATED, this );",
    "ground_aoe.cpp constructor",
  );
  const destructed = aoe.indexOf("params->state_callback()( ground_aoe_params_t::EVENT_DESTRUCTED, this );");
  const mayPulse = aoe.indexOf("if ( may_pulse() )");
  if (destructed === -1 || mayPulse === -1 || destructed > mayPulse)
    problems.push(
      `${ability.simcToken}: ground_aoe.cpp execute no longer fires EVENT_DESTRUCTED before deciding on the next pulse`,
    );
  const header = loaded.groundAoeHeader;
  need(header, "NO_EXPIRATION_PULSE = 0,", "ground_aoe.hpp expiration_pulse_type");
  need(header, "EVENT_DESTRUCTED,", "ground_aoe.hpp state_type");

  const member = ability.groundEffect.lifetime.activeStructMember;
  const params = ability.groundEffect.lifetime.paramsVariable;
  const module = loaded.classModule;
  const start = module.indexOf(`${params} = ground_aoe_params_t()`);
  if (start === -1) {
    problems.push(
      `${ability.simcToken}: sc_paladin.cpp no longer builds ${params} from ground_aoe_params_t()`,
    );
    return { problems, lifetime: null };
  }
  const end = module.indexOf("} );", start);
  const chain = module.slice(start, end === -1 ? start + 4000 : end);
  need(chain, ".duration( cons_duration )", `sc_paladin.cpp ${params}`);
  need(chain, ".hasted( ground_aoe_params_t::SPELL_HASTE )", `sc_paladin.cpp ${params}`);
  forbid(chain, ".pulse_time(", `sc_paladin.cpp ${params}`);
  forbid(chain, ".expiration_pulse(", `sc_paladin.cpp ${params}`);
  forbid(chain, ".n_pulses(", `sc_paladin.cpp ${params}`);
  need(module, "timespan_t cons_duration = data().duration();", "sc_paladin.cpp consecration_t");
  need(chain, `p()->${member} = event;`, `sc_paladin.cpp ${params} state callback (EVENT_CREATED)`);
  need(chain, `p()->${member} = nullptr;`, `sc_paladin.cpp ${params} state callback (EVENT_DESTRUCTED)`);
  need(module, `return ${member} != nullptr;`, "sc_paladin.cpp create_consecration_expression");
  return {
    problems,
    lifetime: {
      activeStructMember: member,
      paramsVariable: params,
      pulseBaseMs: 1000,
      pulseHasted: "SPELL_HASTE",
      expirationPulse: "NO_EXPIRATION_PULSE",
      rule: "ALIVE_UNTIL_LAST_PULSE",
      claim:
        "The active pointer is set on EVENT_CREATED and cleared on EVENT_DESTRUCTED; ground_aoe_event_t::execute fires EVENT_DESTRUCTED at every pulse and schedules another only while time_left >= one hasted pulse (may_pulse under NO_EXPIRATION_PULSE). The effect is therefore alive from the cast until the last pulse, at tick * floor(D / tick) with tick = 1,000 ms * spell haste factor <= 1,000 ms — inside (D - 1,000 ms, D]. TRUE may be claimed only while elapsed <= D - 1,000 ms; FALSE only after D; the interval between is UNKNOWN without a haste model.",
      sources: [
        "engine/player/ground_aoe.cpp: ground_aoe_params_t() defaults; _pulse_time; may_pulse; execute",
        "engine/player/ground_aoe.hpp: expiration_pulse_type; state_type",
        "engine/class_modules/paladin/sc_paladin.cpp: consecration_t (cons_duration, cons_params, state callback); create_consecration_expression",
      ],
    },
  };
}

/**
 * The absence checks for one ability, each computed from the pinned text and
 * each REQUIRED to hold. A drifted module fails the extraction rather than
 * producing a policy that no longer describes it.
 */
export function dynamicPolicyChecks(ability, loaded, traits, conventions = undefined) {
  const modules = {
    classModule: loaded.classModule,
    specModule: loaded.specModule,
    classHeader: loaded.classHeader,
  };
  const moduleText = `${loaded.classModule}\n${loaded.specModule}`;
  const moduleLabel = conventions?.moduleLabel ?? "sc_paladin.cpp + sc_paladin_protection.cpp";
  const checks = [];
  const problems = [];
  const require = (claim, search, holds, finding) => {
    checks.push({ claim, search, finding });
    if (!holds)
      problems.push(
        `${ability.simcToken}/${String(ability.abilityGameId)}: ${claim} does not hold — ${finding}`,
      );
  };

  // 1. Handle mutations: every `<handle>->` use must be a read.
  const handleArrow = `${ability.cooldownHandle}->`;
  const arrowLines = lineNumbersOf(moduleText, handleArrow);
  const arrowUses = [];
  for (const line of arrowLines) {
    const text = moduleText.split(/\r?\n/)[line - 1] ?? "";
    const after = text.slice(text.indexOf(handleArrow) + handleArrow.length);
    const member = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(after)?.[1] ?? "?";
    arrowUses.push(member);
  }
  const READ_ONLY_MEMBERS = new Set([
    "up",
    "remains",
    "ready",
    "down",
    "charges",
    "current_charge",
    "is_ready",
    "duration",
  ]);
  const declared = ability.knownDynamicMutations ?? [];
  const mutating = arrowUses.filter((member) => !READ_ONLY_MEMBERS.has(member));
  const undeclared = mutating.filter((member) => !declared.some((known) => known.member === member));
  const declaredMissing = declared.filter((known) => !mutating.includes(known.member));
  require(declared.length === 0
    ? "NO_DYNAMIC_MUTATION_THROUGH_THE_MODULE_HANDLE"
    : "EVERY_DYNAMIC_MUTATION_IS_DECLARED", `every '${handleArrow}<member>' in ${moduleLabel}`, undeclared.length ===
    0 && declaredMissing.length === 0, arrowUses.length === 0
    ? `no '${handleArrow}' use exists in the module`
    : `${String(arrowUses.length)} use(s): ${arrowUses.map((m) => `->${m}()`).join(", ")}` +
        (declared.length === 0
          ? " — reads only; no adjust(), reset(), start() or duration assignment"
          : `; the mutation(s) ${declared.map((known) => `->${known.member}() in ${known.site} [${known.effect}]`).join("; ")} are declared and nothing else mutates it`));

  // 2. Named cooldown objects obtained by name: reads only.
  const byName = `get_cooldown( "${ability.cooldownName}" )`;
  const byNameLines = lineNumbersOf(moduleText, byName);
  require("NO_MUTATION_THROUGH_A_NAMED_COOLDOWN_OBJECT", `every 'get_cooldown( "${ability.cooldownName}" )' site`, byNameLines.every(
    (line) => {
      const text = moduleText.split(/\r?\n/)[line - 1] ?? "";
      return (
        text.includes(`${ability.cooldownHandle} `) ||
        text.includes(`${ability.cooldownHandle}=`) ||
        /\w+_cd\(\s*p\.get_cooldown/.test(text)
      );
    },
  ), byNameLines.length === 0
    ? "no site obtains this cooldown by name"
    : `${String(byNameLines.length)} site(s): the constructor assignment to the handle and/or a read-only expression member initialiser (\`<x>_cd( p.get_cooldown(...) )\`, consulted through remains() only)`);

  // 3. Every adjust()/reset()/start() receiver in the module is some OTHER cooldown.
  const mutators = [];
  for (const needle of ["->adjust(", "->reset(", "->start(", "->adjust_recharge_multiplier("]) {
    for (const line of lineNumbersOf(moduleText, needle)) {
      const text = moduleText.split(/\r?\n/)[line - 1] ?? "";
      const receiver =
        /([A-Za-z_][A-Za-z0-9_.>-]*)->(adjust|reset|start|adjust_recharge_multiplier)\(/.exec(text)?.[1] ??
        "?";
      mutators.push(receiver);
    }
  }
  const namesIt = mutators.filter(
    (receiver) => receiver.includes(ability.cooldownHandle) || receiver.includes(ability.cooldownName),
  );
  require(declared.length === 0
    ? "NO_ADJUST_RESET_OR_START_NAMES_THIS_COOLDOWN"
    : "ONLY_DECLARED_ADJUST_RESET_OR_START_NAMES_THIS_COOLDOWN", "every '->adjust(', '->reset(', '->start(' and '->adjust_recharge_multiplier(' receiver in the module", namesIt.length ===
    declared.length, `${String(mutators.length)} mutation site(s) in the module; receivers: ${[...new Set(mutators)].join(", ")}; ` +
    (declared.length === 0
      ? "none names this cooldown"
      : `exactly ${String(declared.length)} name(s) this cooldown, each declared: ${declared.map((known) => `${known.member}() in ${known.site}`).join("; ")}`));

  // 4. The one recharge-rate mechanism is a buff that is never constructed.
  //
  // A target may declare the Paladin mechanism ABSENT from its module
  // (`moduleConventions.rechargeRateMechanism: null`), in which case the
  // generic form of the claim is checked: no recharge-rate multiplier is
  // adjusted anywhere in the module at all.
  if (conventions !== undefined && conventions.rechargeRateMechanism === null) {
    const rechargeSites = count(moduleText, "->adjust_recharge_multiplier(");
    require("NO_RECHARGE_RATE_MULTIPLIER_MECHANISM_ACTIVE", "'adjust_recharge_multiplier' sites in the module", rechargeSites ===
      0, rechargeSites === 0
      ? `no '->adjust_recharge_multiplier(' site exists in ${moduleLabel}`
      : `${String(rechargeSites)} '->adjust_recharge_multiplier(' site(s) exist in ${moduleLabel}`);
  }
  const autumnDefined = count(loaded.classModule, "struct blessing_of_autumn_t");
  const autumnConstructed =
    count(moduleText, "new blessing_of_autumn_t") + count(loaded.classHeader, "blessing_of_autumn_t");
  const autumnTrait = traits.filter((row) =>
    /Blessing of (Autumn|Summer|Winter|Spring|the Seasons)/i.test(row.displayNameEn),
  );
  if (conventions === undefined || conventions.rechargeRateMechanism !== null)
    require("NO_RECHARGE_RATE_MULTIPLIER_MECHANISM_ACTIVE", "'adjust_recharge_multiplier' sites; 'blessing_of_autumn_t' construction; Blessing of the Seasons traits in trait_data.inc", autumnDefined ===
      1 &&
      autumnConstructed === 0 &&
      autumnTrait.length === 0 &&
      mutators.filter((r) => r === "a->cooldown" || r === "a->internal_cooldown").length ===
        count(
          moduleText,
          "->adjust_recharge_multiplier(",
        ), `struct blessing_of_autumn_t is defined once (sc_paladin.cpp) and constructed nowhere (0 'new blessing_of_autumn_t', 0 references in sc_paladin.hpp); no Paladin trait row is named for Blessing of the Seasons; every '->adjust_recharge_multiplier(' call in the module sits inside that dead struct`);

  // 5. No action-level cooldown override in the ability's own action struct.
  const structFile = modules[ability.actionStruct.file];
  const body = ability.actionStruct.constructorOnly
    ? {
        text: outOfLineMembers(structFile, ability.actionStruct.name)
          .map((c) => c.text)
          .join("\n"),
        startLine: null,
        endLine: null,
      }
    : structBody(structFile, ability.actionStruct.name);
  const knownReferences = ability.knownStructCooldownReferences?.count ?? 0;
  const overrides =
    body === null
      ? null
      : count(body.text.replaceAll(`${ability.cooldownHandle}->`, ""), "cooldown->") -
        knownReferences +
        count(body.text, "update_ready") +
        count(body.text, "cooldown_duration");
  require("NO_ACTION_LEVEL_COOLDOWN_OVERRIDE", `the body of ${ability.actionStruct.name} for 'cooldown->', 'update_ready' and 'cooldown_duration'`, body !==
    null && overrides === 0, body === null
    ? `${ability.actionStruct.name} was not found`
    : `${ability.actionStruct.name}${body.startLine === null ? " (out-of-line members)" : ` (lines ${String(body.startLine)}-${String(body.endLine)})`} declares no cooldown override and no update_ready; the base action_t::update_ready path applies unchanged` +
        (knownReferences === 0
          ? ""
          : ` (${String(knownReferences)} declared cooldown reference(s): ${ability.knownStructCooldownReferences.note})`));

  // 6. The hasted-cooldown flag is set only in other actions' structs.
  //
  // A target may declare that its base action carries no `hasted_cd`
  // member at all (`moduleConventions.hastedCooldownMember: null`); the
  // generic half of the claim — no `cooldown->hasted` site inside THIS
  // ability's own struct — is then the whole check, and the member half is
  // verified absent rather than initialised false.
  const hastedSites = [];
  for (const [file, text] of Object.entries(modules)) {
    for (const line of lineNumbersOf(text, "cooldown->hasted"))
      hastedSites.push(`${file}:${String(line)} in ${enclosingStruct(text, line) ?? "?"}`);
  }
  // The base paladin_action_t forwards its own `hasted_cd` member to the flag;
  // that member must be initialised false and never assigned true anywhere.
  const allText = `${loaded.classModule}
${loaded.specModule}
${loaded.classHeader}`;
  const hastedCdTrue =
    count(allText, "hasted_cd = true") + count(allText, "hasted_cd( true") + count(allText, "hasted_cd=true");
  const hastedCdInit = count(loaded.classHeader, "hasted_cd( false )");
  if (conventions !== undefined && conventions.hastedCooldownMember === null) {
    const memberMentions = count(allText, "hasted_cd");
    require("NO_MODULE_HASTED_COOLDOWN_FLAG", "'cooldown->hasted' sites and their enclosing structs; any 'hasted_cd' member", hastedSites.every(
      (site) => !site.endsWith(` in ${ability.actionStruct.name}`),
    ) && memberMentions === 0, (hastedSites.length === 0
      ? "no site sets the flag"
      : `${String(hastedSites.length)} site(s): ${hastedSites.join("; ")}; none is this ability's struct`) +
      `; no 'hasted_cd' member exists in ${moduleLabel} (${String(memberMentions)} mention(s))`);
  } else
    require("NO_MODULE_HASTED_COOLDOWN_FLAG", "'cooldown->hasted' sites and their enclosing structs; every assignment of paladin_action_t::hasted_cd", hastedSites.every(
      (site) => !site.endsWith(` in ${ability.actionStruct.name}`),
    ) &&
      hastedCdTrue === 0 &&
      hastedCdInit === 1, (hastedSites.length === 0
      ? "no site sets the flag"
      : `${String(hastedSites.length)} site(s): ${hastedSites.join("; ")}; none is this ability's struct`) +
      `; paladin_action_t::hasted_cd is initialised false once and assigned true nowhere (${String(hastedCdTrue)} assignment(s)), so the base init() forwards false`);

  // 7. The module's explicit passive affect-list registrations name other spells.
  const affectLists = lineNumbersOf(moduleText, "register_passive_affect_list(").map((line) => {
    const lines = moduleText.split(/\r?\n/);
    return `${lines[line - 1]?.trim() ?? ""} ${lines[line]?.trim() ?? ""}`;
  });
  require("NO_MODULE_AFFECT_LIST_NAMES_THIS_SPELL", "'register_passive_affect_list(' calls and the spell ids they add", affectLists.every(
    (call) => !call.includes(String(ability.abilityGameId)),
  ), affectLists.length === 0
    ? "no explicit affect list is registered"
    : `${String(affectLists.length)} call(s): ${affectLists.join(" | ")}; none adds ${String(ability.abilityGameId)}`);

  return { checks, problems };
}

// --------------------------------------------------------------------------
// Artifact
// --------------------------------------------------------------------------

export function formatArtifactJson(artifact) {
  const text = JSON.stringify(artifact, null, 2);
  return `${text.replace(/\[\n\s+((?:-?\d+,\n\s+)*-?\d+)\n\s+\]/g, (_, inner) => `[${inner.replace(/,\n\s+/g, ", ")}]`)}\n`;
}

async function loadSource(args, key, path) {
  const localFlag = `local-${key}`;
  if (typeof args[localFlag] === "string") return readFileSync(args[localFlag]);
  if (typeof args.sha !== "string" || !/^[0-9a-f]{40}$/.test(args.sha)) {
    fail(`--sha must be a full 40-character commit SHA (or pass --${localFlag} for a local copy)`);
  }
  const url = `${REPOSITORY.replace("https://github.com", "https://raw.githubusercontent.com")}/${args.sha}/${path}`;
  const response = await fetch(url, { headers: { "User-Agent": "wlc-vnext-extractor" } });
  if (!response.ok) fail(`could not fetch pinned source (HTTP ${String(response.status)}) from ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetName = typeof args.target === "string" ? args.target : null;
  const target = targetName === null ? undefined : TARGETS[targetName];
  if (target === undefined) fail(`--target is required (known: ${Object.keys(TARGETS).join(", ")})`);
  const outPath = typeof args.out === "string" ? args.out : target.defaultOut;
  const extractedOn = typeof args["extracted-on"] === "string" ? args["extracted-on"] : null;
  if (extractedOn === null || !/^\d{4}-\d{2}-\d{2}$/.test(extractedOn))
    fail("--extracted-on YYYY-MM-DD is required");

  // A target may name a different SPEC module (Retribution's own file); the
  // class module, header and DBC tables are the same for every Paladin target.
  const SOURCE_PATHS = { ...SOURCES, ...(target.sourceOverrides ?? {}) };
  const loaded = {};
  const sources = [];
  for (const [key, path] of Object.entries(SOURCE_PATHS)) {
    if (path === null) {
      // The target declares this source ABSENT (a class with one module has no
      // spec module and no class header). Loaded as empty text so every
      // module-wide search runs unchanged over what exists.
      loaded[key] = "";
      continue;
    }
    const buffer = await loadSource(args, key, path);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    loaded[key] = buffer.toString("utf8");
    sources.push({ path, sha256, byteLength: buffer.length });
  }
  const sourceFor = (key) => sources.find((s) => s.path === SOURCE_PATHS[key]);

  const build = parseClientDataVersion(loaded.clientDataVersion);
  if (!build.ok) fail(build.error);
  const spellMembers = structMembers(loaded.spellDataLayout, "spell_data_t");
  const effectMembers = structMembers(loaded.spellDataLayout, "spelleffect_data_t");
  for (const [name, members, required] of [
    [
      "spell_data_t",
      spellMembers,
      [
        "_id",
        "_cooldown",
        "_category_cooldown",
        "_category",
        "_category_type",
        "_charges",
        "_charge_cooldown",
        "_internal_cooldown",
        "_gcd",
        "_duration",
        "_class_flags_family",
        "_class_flags",
        "_attributes",
      ],
    ],
    [
      "spelleffect_data_t",
      effectMembers,
      [
        "_id",
        "_spell_id",
        "_index",
        "_type",
        "_subtype",
        "_base_value",
        "_misc_value",
        "_misc_value_2",
        "_class_flags",
      ],
    ],
  ]) {
    if (members === null) fail(`spell_data.hpp does not define struct ${name}`);
    for (const field of required) if (!members.includes(field)) fail(`${name} has no member ${field}`);
  }
  const traitLayout = verifyTraitFieldOrder(loaded.traitDataLayout);
  if (!traitLayout.ok) fail(traitLayout.error);
  const passiveBit = readEnumerator(loaded.dataEnums, "SX_PASSIVE");
  if (passiveBit !== SX_PASSIVE_BIT)
    fail(`SX_PASSIVE is ${String(passiveBit)} in data_enums.hh, expected ${String(SX_PASSIVE_BIT)}`);
  if (!/\{\s*P_COOLDOWN,\s*"cooldown"\s*\},\s*\/\/\s*11/.test(loaded.playerModule)) {
    fail('player.cpp no longer lists P_COOLDOWN as property 11 with field "cooldown"');
  }

  const traits = parseTraitRows(loaded.traitData).filter((row) => row.classId === target.classId);
  if (traits.length === 0) fail(`no trait rows for class ${String(target.classId)}`);
  const traitSpellIds = [...new Set(traits.map((row) => row.talentSpellId))];
  const abilityIds = target.abilities.map((ability) => ability.abilityGameId);
  // Spec and class passive candidates need their spell records first (to test SX_PASSIVE).
  const specRows = [...loaded.specializationSpells.matchAll(/^\s*\{\s*(\d+),\s*(\d+),\s*(\d+),/gm)]
    .filter((match) => Number(match[1]) === target.classId && Number(match[2]) === target.specId)
    .map((match) => Number(match[3]));
  const classBlock = loaded.classSpells.slice(loaded.classSpells.indexOf("__passive_spells_data"));
  const classRows = [...classBlock.matchAll(/\{\s*(\d+),\s*(\d+)\s*,/g)]
    .filter((match) => Number(match[1]) === target.classId)
    .map((match) => Number(match[2]));
  const spellRead = readSpellRecords(
    loaded.spellData,
    [...new Set([...abilityIds, ...traitSpellIds, ...specRows, ...classRows])],
    spellMembers,
  );
  if (!spellRead.ok) fail(spellRead.error);
  const { classPassiveIds, specPassiveIds } = readPassiveSpellIds({
    classSpellsText: loaded.classSpells,
    specializationSpellsText: loaded.specializationSpells,
    classId: target.classId,
    specId: target.specId,
    spellRecords: spellRead.records,
  });
  const labels = readSpellLabels(loaded.spellData);
  if (labels === null) fail("sc_spell_data.inc has no __spelllabel_data table");
  const candidateIds = [...new Set([...traitSpellIds, ...specPassiveIds, ...classPassiveIds])];
  const { effects, examined } = readAuraEffects(loaded.spellData, candidateIds, effectMembers);

  const abilities = [];
  const problems = [];
  for (const ability of target.abilities) {
    const record = spellRead.records.get(ability.abilityGameId);
    if (record === undefined) fail(`spell ${String(ability.abilityGameId)} is not in the pinned spell table`);
    const censusInput = {
      traits,
      traitRecords: spellRead.records,
      effects,
      target: record,
      labels,
      specId: target.specId,
      specPassiveIds,
      classPassiveIds,
    };
    const passiveModifiers = censusPassiveModifiers(censusInput);
    const durationModifiers =
      ability.groundEffect === undefined
        ? undefined
        : censusPassiveModifiers({ ...censusInput, property: "DURATION" });
    const policy = dynamicPolicyChecks(ability, loaded, traits, target.moduleConventions);
    problems.push(...policy.problems);
    const lifetime = ability.groundEffect === undefined ? null : groundEffectLifetimeChecks(ability, loaded);
    if (lifetime !== null) problems.push(...lifetime.problems);
    abilities.push({
      simcToken: ability.simcToken,
      abilityGameId: ability.abilityGameId,
      displayNameEn: record.nameEn,
      aliasGroup: ability.aliasGroup,
      baseCooldownMs: record.cooldownMs,
      charges: record.charges,
      chargeCooldownMs: record.chargeCooldownMs,
      internalCooldownMs: record.internalCooldownMs,
      category: record.category,
      categoryCooldownMs: record.categoryCooldownMs,
      categoryTypeMask: record.categoryTypeMask,
      baseGcdMs: record.gcdMs,
      classFamily: record.classFamily,
      classFlags: record.classFlags,
      labels: labels.get(ability.abilityGameId) ?? [],
      ...(ability.groundEffect === undefined
        ? {}
        : {
            groundEffect: {
              expression: ability.groundEffect.expression,
              source: ability.groundEffect.source,
              durationMs: record.durationMs,
              durationModifiers,
              lifetime: lifetime?.lifetime ?? null,
            },
          }),
      ...(ability.knownDynamicMutations === undefined
        ? {}
        : { knownDynamicMutations: ability.knownDynamicMutations }),
      binding: {
        method: "MACHINE_EXTRACTED_DBC_RECORD",
        sourcePath: SOURCE_PATHS.spellData,
        createAction: ability.createAction,
        specBinding: ability.specBinding,
      },
      passiveModifierCensus: {
        method: "MACHINE_CENSUS_OF_PASSIVE_TRAIT_EFFECTS",
        classId: target.classId,
        traitRowsExamined: traits.length,
        traitSpellsExamined: traitSpellIds.length,
        specPassiveSpellsExamined: specPassiveIds.size,
        classPassiveSpellsExamined: classPassiveIds.size,
        effectRowsExamined: examined,
        subtypesChecked: Object.entries(COOLDOWN_SUBTYPES).map(([id, rule]) => `${id}:${rule.name}`),
        rule: "player.cpp parse_all_class_passives (class passives from class_spells.inc __passive_spells_data; specialization spells with SX_PASSIVE from specialization_spells.inc) and parse_all_passive_talents -> parse_passive_effects (SX_PASSIVE spells; E_APPLY_AURA effects) -> register_passive_effect: A_ADD_FLAT/PCT_MODIFIER with misc_value1 == P_COOLDOWN (11) match by class family flags; the LABEL variants match by misc_value2 against __spelllabel_data; category subtypes match the spell's _category; category-mask subtypes match the spell's _category_type mask; A_HASTED_COOLDOWN matches by family flags. A matched flat value is added to the DBC cooldown field and a matched pct value scales it BEFORE action_t::init reads spell_data.cooldown() (dbc_override_->register_spell( id, \"cooldown\", value )).",
        modifiers: passiveModifiers,
      },
      dynamicModifierPolicy: {
        method: "HAND_REVIEWED_CPP_ABSENCE_PROOF",
        appliesTo: ability.simcToken,
        sourcePaths: [SOURCE_PATHS.classModule, SOURCE_PATHS.specModule, SOURCE_PATHS.classHeader].filter(
          (path) => path !== null,
        ),
        sourceSha256: Object.fromEntries(
          ["classModule", "specModule", "classHeader"]
            .filter((key) => SOURCE_PATHS[key] !== null)
            .map((key) => [key, sourceFor(key).sha256]),
        ),
        reviewedOn: extractedOn,
        checks: policy.checks,
      },
      cooldownStart: {
        anchor: "ACTION_EXECUTE",
        evidence: [
          "action.cpp:1914 action_t::execute() calls update_ready()",
          "action.cpp:2333-2372 action_t::update_ready() calls cooldown->start( this, cd_duration, delay )",
          "action.cpp:2342-2358 the only start-time adjustment is a non-negative world-lag delay, which can only move the ready time LATER, never earlier",
        ],
        // A target may state its own note (M11-C1); every earlier target keeps this text byte for byte.
        note:
          target.cooldownStartNote ??
          "For an instant, non-channelled ability, execution coincides with the observed cast. Divine Toll, Sentinel and Avenging Wrath are instant in the pinned data.",
      },
    });
  }
  if (problems.length > 0)
    fail(`the module no longer satisfies the recorded absence proof:\n  ${problems.join("\n  ")}`);

  const artifact = {
    artifactVersion: ARTIFACT_VERSION,
    datasetId: target.datasetId,
    artifactRevision: `simc-${(typeof args.sha === "string" ? args.sha : "local").slice(0, 8)}-1`,
    provenance: {
      repository: REPOSITORY,
      commitSha: typeof args.sha === "string" ? args.sha : null,
      sources,
      clientDataWowVersion: build.value.wowVersion,
      clientDataHotfixDate: build.value.hotfixDate,
      clientDataHotfixBuild: build.value.hotfixBuild,
      clientDataHotfixHash: build.value.hotfixHash,
      cooldownFieldUnits: "MILLISECONDS",
      classId: target.classId,
      className: target.className,
      specId: target.specId,
      extractedOn,
      extractorVersion: EXTRACTOR_VERSION,
      applicabilityNote:
        "Not version-gated at runtime, for the same reason as the other pinned datasets: CombatFight exposes no client-build key. The build is recorded for traceability.",
    },
    aliasGroups: target.aliasGroups,
    abilities,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, formatArtifactJson(artifact), "utf8");
  console.log(`Wrote ${outPath}`);
  for (const ability of abilities) {
    console.log(
      `  ${ability.simcToken} ${String(ability.abilityGameId)} ${ability.displayNameEn}: base ${String(ability.baseCooldownMs)} ms, category ${String(ability.category)}, ${String(ability.passiveModifierCensus.modifiers.length)} passive modifier(s)`,
    );
    for (const modifier of ability.passiveModifierCensus.modifiers) {
      console.log(
        `    ${modifier.displayNameEn} (${modifier.tree} entry ${String(modifier.traitEntryId)} node ${String(modifier.traitNodeId)} ${modifier.nodeType}) ${modifier.subtypeName} ${modifier.kind} ${String(modifier.value)} ${modifier.direction} via ${modifier.matchedBy}`,
      );
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
