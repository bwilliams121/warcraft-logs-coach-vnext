#!/usr/bin/env node
/**
 * Deterministic SimulationCraft talent-identity extractor.
 *
 * Reads the generated trait table from ONE pinned SimulationCraft commit and
 * emits the narrow Assassination talent slice M5-C2 needs. Run manually; never
 * at runtime.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A TALENT DATABASE
 *
 * The pinned `default[4]` Ambush condition asks three `talent.<name>` questions.
 * Answering them needs a mapping from SimulationCraft's talent NAME to the
 * numeric ids a Warcraft Logs `combatantinfo` actually carries. That mapping is
 * machine-readable at the pinned commit, so it is extracted rather than typed.
 *
 * Only the talents a supported decision needs are emitted. This is the same rule
 * `rogue-abilities.ts` follows: entries appear when a decision requires them,
 * never speculatively.
 *
 * THE LOAD-BEARING PART IS THE CHOICE NODE
 *
 * A WCL talent entry is `{ id, rank, nodeId }`. A talent is NOT selected merely
 * because its NODE appears: a choice node offers several entries and the player
 * picked one of them. Actor 19's tree contains node 90692 — the Improved Ambush
 * node — with entry 117152, which is Tight Spender. Reading node presence as
 * selection would have resolved `talent.improved_ambush` TRUE when it is FALSE.
 *
 * So every emitted talent carries its sibling entries at the same node, and the
 * extractor FAILS if a talent it was asked for turns out to share a node with
 * entries it did not enumerate.
 *
 *   node scripts/authority/extract-simc-talents.mjs \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --out src/data/game/rogue-talents.json
 *
 * TARGETS (M10-C). `--target` selects one specialization profile: dataset id,
 * class and spec ids, the talents it needs, and — for a specialization whose
 * APL asks about them — the HERO SUB-TREES and the TIERED ("apex") spec-tree
 * traits. The default is `rogue-assassination`, so every earlier invocation
 * regenerates the Rogue artifact byte for byte; the two extra sections are
 * emitted only for a target that declares them.
 *
 *   node scripts/authority/extract-simc-talents.mjs --target paladin-protection \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --out src/data/game/paladin-protection-talents.json
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;
const DATASET_ID = "SIMC_TRAIT_ROGUE_ASSASSINATION_TALENTS";

const ROGUE_CLASS_ID = 4;
const ASSASSINATION_SPEC_ID = 259;

const SOURCES = {
  traitData: "engine/dbc/generated/trait_data.inc",
  traitLayout: "engine/dbc/trait_data.hpp",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
};

/** `trait_data_t::tree_index` values. */
const TREE_INDEX = { CLASS: 1, SPECIALIZATION: 2, HERO: 3 };

/** `trait_data_t::node_type` values, from the declaration comment. */
const NODE_TYPE = { NORMAL: 0, TIERED: 1, CHOICE: 2, SUB_TREE_SELECTION: 3 };

/**
 * The talents M5-C2 requires, and the SimulationCraft binding for each.
 *
 * `simcName` is the token as it appears after `talent.` in the pinned APL.
 * `displayNameEn` is the trait-table name `find_talent_spell` looks up.
 */
const REQUIRED_TALENTS = [
  {
    simcName: "improved_ambush",
    displayNameEn: "Improved Ambush",
    tree: "CLASS",
    binding:
      'sc_rogue.cpp:9993 talent.rogue.improved_ambush = find_talent_spell( talent_tree::CLASS, "Improved Ambush" )',
  },
  {
    simcName: "shrouded_suffocation",
    displayNameEn: "Shrouded Suffocation",
    tree: "SPECIALIZATION",
    binding:
      'sc_rogue.cpp:10059 talent.assassination.shrouded_suffocation = find_talent_spell( talent_tree::SPECIALIZATION, "Shrouded Suffocation" )',
  },
  {
    simcName: "blindside",
    displayNameEn: "Blindside",
    tree: "SPECIALIZATION",
    binding:
      'sc_rogue.cpp:10026 talent.assassination.blindside = find_talent_spell( talent_tree::SPECIALIZATION, "Blindside" )',
  },
  {
    simcName: "improved_garrote",
    displayNameEn: "Improved Garrote",
    tree: "SPECIALIZATION",
    binding:
      'sc_rogue.cpp:10039 talent.assassination.improved_garrote = find_talent_spell( talent_tree::SPECIALIZATION, "Improved Garrote" )',
  },
  {
    // M5-D1. Needed by `core_dot[2]` and `core_dot[4]`, the two `cycle_targets`
    // entries, which both open with `!talent.crimson_tempest`. That conjunct is
    // a static build fact and therefore has the same value for every candidate
    // target — which is what lets a Crimson Tempest build eliminate both cycling
    // entries without this project enumerating a single enemy.
    //
    // The talent is resolved; the ACTION is not. Crimson Tempest's own rotational
    // entry sits in `generate`, is gated on `spell_targets.fan_of_knives`, and
    // stays out of scope.
    simcName: "crimson_tempest",
    displayNameEn: "Crimson Tempest",
    tree: "SPECIALIZATION",
    binding:
      'sc_rogue.cpp:10030 talent.assassination.crimson_tempest = find_talent_spell( talent_tree::SPECIALIZATION, "Crimson Tempest" )',
  },
];

/**
 * The Protection Paladin profile (M10-C).
 *
 * `requiredTalents` are the `talent.<name>` questions the pinned Protection
 * APL asks plus the talents whose selection changes what an APL TOKEN or
 * EXPRESSION binds to (Sentinel rewrites `avenging_wrath`; Blessed Hammer
 * backgrounds `hammer_of_the_righteous`). `heroTrees` are the two sub-trees
 * `hero_tree.<name>` can name for this specialization, with EVERY entry of
 * each, so membership of an observed entry is decided by the table and never
 * by a spell the player happened to cast. `apexTraits` are the NODE_TIERED
 * spec-tree traits in generated-table order, which is exactly the list
 * `player_t::create_expression` indexes for `apex.N` (player.cpp:12313-12331).
 */
const PALADIN_PROTECTION_TARGET = {
  datasetId: "SIMC_TRAIT_PALADIN_PROTECTION_TALENTS",
  classId: 2,
  specId: 66,
  className: "Paladin",
  defaultOut: "src/data/game/paladin-protection-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeId }. In the supported capture " +
    "(report A7R6kxPJ1hC8YQ4w revision 30, logVersion 17, gameVersion 1) `id` equals " +
    "trait_data_t::id_trait_node_entry and `nodeId` equals trait_data_t::id_node. Corroborated for the " +
    "Protection Paladin subject (actor 7) by Righteous Protector 102440/81477, Sentinel 102466/81497, " +
    "Blessed Hammer 102430/81469 at the Hammer of the Righteous choice node, and Holy Armaments 117882/95234 " +
    "in the Lightsmith sub-tree. This equivalence is recorded for that capture and parser version; it is not " +
    "claimed for Warcraft Logs in general.",
  requiredTalents: [
    {
      simcName: "righteous_protector",
      displayNameEn: "Righteous Protector",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_protection.cpp:1081 talents.righteous_protector = find_talent_spell( talent_tree::SPECIALIZATION, "Righteous Protector" )',
    },
    {
      simcName: "sentinel",
      displayNameEn: "Sentinel",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_protection.cpp:1074 talents.sentinel = find_talent_spell( talent_tree::SPECIALIZATION, "Sentinel" )',
    },
    {
      simcName: "avenging_wrath",
      displayNameEn: "Avenging Wrath",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_protection.cpp:1043 talents.avenging_wrath = find_talent_spell( talent_tree::SPECIALIZATION, "Avenging Wrath" )',
    },
    {
      simcName: "blessed_hammer",
      displayNameEn: "Blessed Hammer",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_protection.cpp:1026 talents.blessed_hammer = find_talent_spell( talent_tree::SPECIALIZATION, "Blessed Hammer" )',
    },
    {
      simcName: "hammer_of_the_righteous",
      displayNameEn: "Hammer of the Righteous",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_protection.cpp:1025 talents.hammer_of_the_righteous = find_talent_spell( talent_tree::SPECIALIZATION, "Hammer of the Righteous" )',
    },
    {
      simcName: "divine_toll",
      displayNameEn: "Divine Toll",
      tree: "CLASS",
      binding:
        'sc_paladin.cpp:4201 talents.divine_toll = find_talent_spell( talent_tree::CLASS, "Divine Toll" )',
    },
    // M10-C5 Phase B: `buff.blessed_assurance.up` (default[20], default[21])
    // can be FALSE by build when the Lightsmith choice node was spent on
    // Divine Guidance instead.
    {
      simcName: "blessed_assurance",
      displayNameEn: "Blessed Assurance",
      tree: "HERO",
      binding:
        'sc_paladin.cpp:4253 talents.lightsmith.blessed_assurance = find_talent_spell( talent_tree::HERO, "Blessed Assurance" )',
    },
  ],
  heroTrees: [
    // `hero_tree_e` values, sc_enums.hpp:320-321. `hero_tree.<name>` resolves
    // through trait_data_t::get_hero_tree_id( name ) to these ids
    // (player.cpp:12205-12207).
    { simcName: "templar", subTreeId: 48 },
    { simcName: "lightsmith", subTreeId: 49 },
  ],
  apexTraits: true,
};

const ROGUE_ASSASSINATION_TARGET = {
  datasetId: DATASET_ID,
  classId: ROGUE_CLASS_ID,
  specId: ASSASSINATION_SPEC_ID,
  className: "Rogue",
  defaultOut: "src/data/game/rogue-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeId }. In the supported capture " +
    "(report A7R6kxPJ1hC8YQ4w revision 30, logVersion 17, gameVersion 1) `id` equals " +
    "trait_data_t::id_trait_node_entry and `nodeId` equals trait_data_t::id_node. Corroborated by three " +
    "independent selected entries for two actors: Improved Garrote 112510/90625, Shrouded Suffocation " +
    "112669/90776, and Tight Spender 117152/90692 at the Improved Ambush choice node. This equivalence " +
    "is recorded for that capture and parser version; it is not claimed for Warcraft Logs in general.",
  requiredTalents: REQUIRED_TALENTS,
  heroTrees: [],
  apexTraits: false,
};

/**
 * M11-A4: the `talent.<name>` questions, hero sub-trees and tiered apex
 * traits the pinned RETRIBUTION spender slice reads
 * (agent/m11-a4-first-spec-contract.md section 2). Build-dependent
 * `background` rules read the specialization tree (Final Verdict renames the
 * spender; Crusading Strikes / Templar Strikes background Crusader Strike;
 * Radiant Glory backgrounds Avenging Wrath; Divine Storm, Wake of Ashes and
 * Execution Sentence are their own talents); the class tree supplies Hammer
 * of Wrath (the readiness aura's trigger), Divine Toll and Divine Purpose
 * (the free-cast route); the Herald of the Sun sub-tree supplies Walk Into
 * Light (the Hammer of Wrath charge line and the Blade of Justice gate).
 */
const PALADIN_RETRIBUTION_TARGET = {
  datasetId: "SIMC_TRAIT_PALADIN_RETRIBUTION_TALENTS",
  classId: 2,
  specId: 70,
  className: "Paladin",
  defaultOut: "src/data/game/paladin-retribution-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeId }. In the supported captures " +
    "(report A7R6kxPJ1hC8YQ4w revision 30 and gtKb2xHn87pNcFfW revision 22, logVersion 17, gameVersion 1) " +
    "`id` equals trait_data_t::id_trait_node_entry and `nodeId` equals trait_data_t::id_node, the same " +
    "equivalence M10-C recorded for the Protection subject of the same A7R6 capture. It is recorded for " +
    "those captures and parser version; it is not claimed for Warcraft Logs in general.",
  requiredTalents: [
    {
      simcName: "final_verdict",
      displayNameEn: "Final Verdict",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_retribution.cpp:1191 talents.final_verdict = find_talent_spell( talent_tree::SPECIALIZATION, "Final Verdict" )',
    },
    {
      simcName: "crusading_strikes",
      displayNameEn: "Crusading Strikes",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_retribution.cpp:1209 talents.crusading_strikes = find_talent_spell( talent_tree::SPECIALIZATION, "Crusading Strikes" )',
    },
    {
      simcName: "templar_strikes",
      displayNameEn: "Templar Strikes",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_retribution.cpp:1208 talents.templar_strikes = find_talent_spell( talent_tree::SPECIALIZATION, "Templar Strikes" )',
    },
    {
      simcName: "divine_storm",
      displayNameEn: "Divine Storm",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_retribution.cpp:1186 talents.divine_storm = find_talent_spell( talent_tree::SPECIALIZATION, "Divine Storm" )',
    },
    {
      simcName: "blade_of_justice",
      displayNameEn: "Blade of Justice",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_retribution.cpp:1185 talents.blade_of_justice = find_talent_spell( talent_tree::SPECIALIZATION, "Blade of Justice" )',
    },
    {
      simcName: "wake_of_ashes",
      displayNameEn: "Wake of Ashes",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_retribution.cpp:1213 talents.wake_of_ashes = find_talent_spell( talent_tree::SPECIALIZATION, "Wake of Ashes" )',
    },
    {
      simcName: "execution_sentence",
      displayNameEn: "Execution Sentence",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_retribution.cpp:1215 talents.execution_sentence = find_talent_spell( talent_tree::SPECIALIZATION, "Execution Sentence" )',
    },
    {
      simcName: "empyrean_legacy",
      displayNameEn: "Empyrean Legacy",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_retribution.cpp:1217 talents.empyrean_legacy = find_talent_spell( talent_tree::SPECIALIZATION, "Empyrean Legacy" )',
    },
    {
      simcName: "radiant_glory",
      displayNameEn: "Radiant Glory",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_retribution.cpp:1219 talents.radiant_glory = find_talent_spell( talent_tree::SPECIALIZATION, "Radiant Glory" )',
    },
    {
      simcName: "holy_flames",
      displayNameEn: "Holy Flames",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_retribution.cpp:1200 talents.holy_flames = find_talent_spell( talent_tree::SPECIALIZATION, "Holy Flames" )',
    },
    {
      simcName: "crusade",
      displayNameEn: "Crusade",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_retribution.cpp:1221 talents.crusade = find_talent_spell( talent_tree::SPECIALIZATION, "Crusade" )',
    },
    {
      simcName: "avenging_wrath",
      displayNameEn: "Avenging Wrath",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin.cpp:4244 talents.avenging_wrath = find_talent_spell( talent_tree::SPECIALIZATION, "Avenging Wrath" )',
    },
    {
      simcName: "hammer_of_wrath",
      displayNameEn: "Hammer of Wrath",
      tree: "CLASS",
      binding:
        'sc_paladin.cpp:4174 talents.hammer_of_wrath = find_talent_spell( talent_tree::CLASS, "Hammer of Wrath" )',
    },
    {
      simcName: "divine_toll",
      displayNameEn: "Divine Toll",
      tree: "CLASS",
      binding:
        'sc_paladin.cpp:4201 talents.divine_toll = find_talent_spell( talent_tree::CLASS, "Divine Toll" )',
    },
    {
      simcName: "divine_purpose",
      displayNameEn: "Divine Purpose",
      tree: "CLASS",
      binding:
        'sc_paladin.cpp:4219 talents.divine_purpose = find_talent_spell( talent_tree::CLASS, "Divine Purpose" )',
    },
    // The two auras `generators[3] blade_of_justice` reads by STACK. A build
    // without the talent cannot hold the aura, which is the second of the
    // two authorized exact-zero proofs (`aura-bindings.ts`).
    {
      simcName: "art_of_war",
      displayNameEn: "Art of War",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_retribution.cpp:1194 talents.art_of_war = find_talent_spell( talent_tree::SPECIALIZATION, "Art of War" )',
    },
    {
      simcName: "righteous_cause",
      displayNameEn: "Righteous Cause",
      tree: "SPECIALIZATION",
      binding:
        'sc_paladin_retribution.cpp:1195 talents.righteous_cause = find_talent_spell( talent_tree::SPECIALIZATION, "Righteous Cause" )',
    },
    {
      simcName: "walk_into_light",
      displayNameEn: "Walk Into Light",
      tree: "HERO",
      binding:
        'sc_paladin.cpp:4305 talents.herald_of_the_sun.walk_into_light = find_talent_spell( talent_tree::HERO, "Walk Into Light" )',
    },
  ],
  heroTrees: [
    // `hero_tree_e` values, sc_enums.hpp:320-322. Retribution chooses between
    // Templar (48, shared with Protection) and Herald of the Sun (50).
    { simcName: "templar", subTreeId: 48 },
    { simcName: "herald_of_the_sun", subTreeId: 50 },
  ],
  apexTraits: false,
};

/**
 * The Blood Death Knight profile (M11-B2).
 *
 * `requiredTalents` are the talents whose selection decides whether an APL
 * TOKEN of the pinned Blood list is a foreground action for the actor — each
 * a `find_talent_spell` the action's constructor is built on
 * (`action.cpp:541-549`: an action built on `spell_data_t::not_found()` is
 * background) — plus the hero talents whose absence makes an aura the list
 * reads impossible for the build. `heroTrees` are the two sub-trees
 * `hero_tree.<name>` can name for Blood: San'layn (31) and Deathbringer
 * (33); Rider of the Apocalypse (32) is Frost/Unholy only at the pin. No
 * `apex.N` atom appears in the pinned Blood list.
 */
const DEATHKNIGHT_BLOOD_TARGET = {
  datasetId: "SIMC_TRAIT_DEATHKNIGHT_BLOOD_TALENTS",
  classId: 6,
  specId: 250,
  defaultOut: "src/data/game/deathknight-blood-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. In the supported captures " +
    "(report A7R6kxPJ1hC8YQ4w revision 30 and gtKb2xHn87pNcFfW revision 22, logVersion 17, gameVersion 1) " +
    "`id` equals trait_data_t::id_trait_node_entry and `nodeID` equals trait_data_t::id_node for the Blood " +
    "Death Knight subject (actor 14 on both), the same equivalence M10-C and M11-A4 recorded for the Paladin " +
    "subjects of the same captures. It is recorded for those captures and parser version; it is not claimed " +
    "for Warcraft Logs in general.",
  requiredTalents: [
    {
      simcName: "death_strike",
      displayNameEn: "Death Strike",
      tree: "CLASS",
      binding:
        'sc_death_knight.cpp:14843 talent.death_strike = find_talent_spell( talent_tree::CLASS, "Death Strike" ); death_strike_t is built on it (:10017-10020)',
    },
    {
      simcName: "raise_dead",
      displayNameEn: "Raise Dead",
      tree: "CLASS",
      binding:
        'sc_death_knight.cpp:14844 talent.raise_dead = find_talent_spell( talent_tree::CLASS, "Raise Dead" ); raise_dead_t is built on spec.raise_dead when that is ok, else on this talent (:12216-12220)',
    },
    {
      simcName: "heart_strike",
      displayNameEn: "Heart Strike",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14898 talent.blood.heart_strike = find_talent_spell( talent_tree::SPECIALIZATION, "Heart Strike" ); heart_strike_t is built on it (:11325-11328)',
    },
    {
      simcName: "marrowrend",
      displayNameEn: "Marrowrend",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14900 talent.blood.marrowrend = find_talent_spell( talent_tree::SPECIALIZATION, "Marrowrend" ); marrowrend_t is built on it (:11662-11667)',
    },
    {
      simcName: "blood_boil",
      displayNameEn: "Blood Boil",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14901 talent.blood.blood_boil = find_talent_spell( talent_tree::SPECIALIZATION, "Blood Boil" ); blood_boil_t is built on it (:9029-9032)',
    },
    {
      simcName: "vampiric_blood",
      displayNameEn: "Vampiric Blood",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14903 talent.blood.vampiric_blood = find_talent_spell( talent_tree::SPECIALIZATION, "Vampiric Blood" ); vampiric_blood_t is built on it (:12785-12788)',
    },
    {
      simcName: "dancing_rune_weapon",
      displayNameEn: "Dancing Rune Weapon",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14914 talent.blood.dancing_rune_weapon = find_talent_spell( talent_tree::SPECIALIZATION, "Dancing Rune Weapon" ); dancing_rune_weapon_t is built on it (:9476-9479)',
    },
    {
      simcName: "consumption",
      displayNameEn: "Consumption",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14942 talent.blood.consumption = find_talent_spell( talent_tree::SPECIALIZATION, "Consumption" ); consumption_t (:9325) is the empowered charge spell the list names with empower_to=1',
    },
    {
      simcName: "reapers_mark",
      displayNameEn: "Reaper's Mark",
      tree: "HERO",
      binding:
        'sc_death_knight.cpp:15083 talent.deathbringer.reapers_mark = find_talent_spell( talent_tree::HERO, "Reaper\'s Mark" ); reapers_mark_t is built on it (:8488-8491); its debuff 434765 is the `debuff.reapers_mark_debuff` the list reads (:15391)',
    },
    {
      simcName: "exterminate",
      displayNameEn: "Exterminate",
      tree: "HERO",
      binding:
        'sc_death_knight.cpp:15099 talent.deathbringer.exterminate = find_talent_spell( talent_tree::HERO, "Exterminate" ); the `buff.exterminate` aura 441416 exists only under it or Echoing Fury (:15403-15404)',
    },
    {
      simcName: "vampiric_strike",
      displayNameEn: "Vampiric Strike",
      tree: "HERO",
      binding:
        'sc_death_knight.cpp:15102 talent.sanlayn.vampiric_strike = find_talent_spell( talent_tree::HERO, "Vampiric Strike" ); heart_strike_t executes the Vampiric Strike child while buffs.vampiric_strike is up (:11331-11357); the `buff.vampiric_strike` (433899, :15373) and `buff.essence_of_the_blood_queen` (433925, :15374) auras exist only under it',
    },
    {
      simcName: "gift_of_the_sanlayn",
      displayNameEn: "Gift of the San'layn",
      tree: "HERO",
      binding:
        'sc_death_knight.cpp:15119 talent.sanlayn.gift_of_the_sanlayn = find_talent_spell( talent_tree::HERO, "Gift of the San\'layn" ); the `buff.gift_of_the_sanlayn` aura 434153 exists only under it (:15375, :15879-15880)',
    },
    {
      simcName: "visceral_strength",
      displayNameEn: "Visceral Strength",
      tree: "HERO",
      binding:
        'sc_death_knight.cpp:15113 talent.sanlayn.visceral_strength = find_talent_spell( talent_tree::HERO, "Visceral Strength" ); the Blood `buff.visceral_strength` aura 461130 exists only under it (:15383-15384)',
    },
    {
      // M11-B9. Not read by any APL atom: pinned because its passive effect
      // 1123818 (spell 434075, A_ADD_FLAT_LABEL_MODIFIER P_MAX_STACKS +2 on
      // label 3134, carried only by 433925) is the modifier that lifts
      // Essence of the Blood Queen's max stacks from the DBC 5 to 7, and the
      // pinned module parses it (parse_all_passive_talents, :15163) without
      // buff_t ever reading the parsed "max_stack" field.
      simcName: "frenzied_bloodthirst",
      displayNameEn: "Frenzied Bloodthirst",
      tree: "HERO",
      binding:
        'sc_death_knight.cpp:15111 talent.sanlayn.frenzied_bloodthirst = find_talent_spell( talent_tree::HERO, "Frenzied Bloodthirst" ); the only other reference is the declaration (:1411) — no buff, action or expression reads it; its max-stack effect on 433925 is pinned Blood-side (deathknight-blood-stack-authority.ts)',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4398, :4400): San'layn is
    // sub-tree 31 and Deathbringer 33, both class 6. `hero_tree.sanlayn`
    // resolves through trait_data_t::get_hero_tree_id( "sanlayn" ), which
    // tokenizes the sub-tree name (trait_data.cpp:225-238).
    { simcName: "sanlayn", subTreeId: 31 },
    { simcName: "deathbringer", subTreeId: 33 },
  ],
  apexTraits: false,
};

/**
 * The Brewmaster Monk profile (M11-C1): authority data only, no analyzer.
 *
 * `requiredTalents` are (a) the two talents the pinned Brewmaster list reads
 * as `talent.<name>.enabled` — which `player_t::create_expression` answers
 * with the SAME build-static constant as `talent.<name>` (player.cpp:
 * 12355-12362) — (b) the talents each Brewmaster APL action's constructor is
 * built on (an action on `not_found()` is background, action.cpp:541-549),
 * and (c) Press the Advantage, under which `tiger_palm_t::ready()` is false
 * (sc_monk.cpp:848-853). `heroTrees` are the two sub-trees
 * `hero_tree.<name>` can name for Brewmaster: Shado-Pan (65) and Master of
 * Harmony (66); Conduit of the Celestials (64) has no Brewmaster entry at
 * the pin. `apexTraits` are the three tiered "Bring Me Another" entries
 * `apex.N` indexes.
 *
 * DELIBERATELY ABSENT: Empty the Cellar. The pinned table carries TWO
 * Brewmaster specialization rows of that name, both spell 1262329 (entry
 * 136150 on node 101198, which it shares with Fuel on the Fire, and entry
 * 125002 alone on node 101711). `find_talent_spell` settles the clash by the
 * rules of trait_data_t::find (trait_data.cpp:87-137) — here, "the only entry
 * on its node", i.e. 125002 — but this extractor never picks between rows of
 * one name (a duplicate is a hard failure), so the talent is not pinned and
 * the clash is recorded instead.
 */
const MONK_BREWMASTER_TARGET = {
  datasetId: "SIMC_TRAIT_MONK_BREWMASTER_TALENTS",
  classId: 10,
  specId: 268,
  defaultOut: "src/data/game/monk-brewmaster-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. The same equivalence M10-C, M11-A4 " +
    "and M11-B2 recorded — `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals trait_data_t::id_node " +
    "— is EXPECTED for Brewmaster but NOT yet corroborated: no Brewmaster capture is committed (M11-C1 pins " +
    "authority only). The corroboration belongs to the milestone that commits Brewmaster evidence; until then " +
    "it is not claimed.",
  requiredTalents: [
    {
      simcName: "blackout_combo",
      displayNameEn: "Blackout Combo",
      tree: "SPECIALIZATION",
      binding:
        'sc_monk.cpp:5751 talent.brewmaster.blackout_combo = _ST( "Blackout Combo" ); the pinned list reads it as `talent.blackout_combo.enabled`, the same create_constant( _talent.enabled() ) as `talent.blackout_combo` (player.cpp:12355-12362)',
    },
    {
      simcName: "press_the_advantage",
      displayNameEn: "Press the Advantage",
      tree: "SPECIALIZATION",
      binding:
        'sc_monk.cpp:5748 talent.brewmaster.press_the_advantage = _ST( "Press the Advantage" ); tiger_palm_t::ready() returns false while it is taken (:848-853). The alternative entry of Blackout Combo\'s choice node',
    },
    {
      simcName: "salsalabims_strength",
      displayNameEn: "Sal'salabim's Strength",
      tree: "SPECIALIZATION",
      binding:
        "sc_monk.cpp:5734 talent.brewmaster.salsalabims_strength = _ST( \"Sal'salabim's Strength\" ); the pinned list reads it as `talent.salsalabims_strength.enabled` (player.cpp:12355-12362); keg_smash_t resets Breath of Fire under it (:2549, :2588-2592)",
    },
    {
      simcName: "celestial_brew",
      displayNameEn: "Celestial Brew",
      tree: "SPECIALIZATION",
      binding:
        'sc_monk.cpp:5716 talent.brewmaster.celestial_brew = _ST( "Celestial Brew" ); celestial_brew_t is built on it (:4113-4114) when Celestial Infusion is not taken (:5349-5352)',
    },
    {
      simcName: "celestial_infusion",
      displayNameEn: "Celestial Infusion",
      tree: "SPECIALIZATION",
      binding:
        'sc_monk.cpp:5717 talent.brewmaster.celestial_infusion = _ST( "Celestial Infusion" ); the `celestial_brew` token builds celestial_infusion_t on it (:4121-4122, :5349-5350) and reads cooldown/action/buff.celestial_brew.* through it (:7390-7400)',
    },
    {
      simcName: "keg_smash",
      displayNameEn: "Keg Smash",
      tree: "SPECIALIZATION",
      binding:
        'sc_monk.cpp:5696 talent.brewmaster.keg_smash = _ST( "Keg Smash" ); keg_smash_t is built on it (:2509-2510)',
    },
    {
      simcName: "purifying_brew",
      displayNameEn: "Purifying Brew",
      tree: "SPECIALIZATION",
      binding:
        'sc_monk.cpp:5697 talent.brewmaster.purifying_brew = _ST( "Purifying Brew" ); purifying_brew_t is built on it (:3487-3488)',
    },
    {
      simcName: "rushing_jade_wind",
      displayNameEn: "Rushing Jade Wind",
      tree: "SPECIALIZATION",
      binding:
        'sc_monk.cpp:5713 talent.brewmaster.rushing_jade_wind = _ST( "Rushing Jade Wind" ); rushing_jade_wind_t is built on it (:1476-1477)',
    },
    {
      simcName: "breath_of_fire",
      displayNameEn: "Breath of Fire",
      tree: "SPECIALIZATION",
      binding:
        'sc_monk.cpp:5726 talent.brewmaster.breath_of_fire = _ST( "Breath of Fire" ); breath_of_fire_t is built on it (:3267-3268)',
    },
    {
      simcName: "black_ox_brew",
      displayNameEn: "Black Ox Brew",
      tree: "SPECIALIZATION",
      binding:
        'sc_monk.cpp:5737 talent.brewmaster.black_ox_brew = _ST( "Black Ox Brew" ); black_ox_brew_t is built on it (:3108-3109)',
    },
    {
      simcName: "exploding_keg",
      displayNameEn: "Exploding Keg",
      tree: "SPECIALIZATION",
      binding:
        'sc_monk.cpp:5754 talent.brewmaster.exploding_keg = _ST( "Exploding Keg" ); exploding_keg_t is built on it (:3381-3382)',
    },
    {
      simcName: "invoke_niuzao_the_black_ox",
      displayNameEn: "Invoke Niuzao, the Black Ox",
      tree: "SPECIALIZATION",
      binding:
        'sc_monk.cpp:5760 talent.brewmaster.invoke_niuzao_the_black_ox = _ST( "Invoke Niuzao, the Black Ox" ); niuzao_spell_t, the `invoke_niuzao` action, is built on it (:3734-3735)',
    },
    {
      simcName: "chi_burst",
      displayNameEn: "Chi Burst",
      tree: "CLASS",
      binding:
        'sc_monk.cpp:5643 talent.monk.chi_burst = _CT( "Chi Burst" ); chi_burst_t is built on it for a non-Windwalker (:3022-3025)',
    },
    {
      simcName: "fortifying_brew",
      displayNameEn: "Fortifying Brew",
      tree: "CLASS",
      binding:
        'sc_monk.cpp:5666 talent.monk.fortifying_brew = _CT( "Fortifying Brew" ); fortifying_brew_t is built on its find_override_spell() (:3334-3335), i.e. id_override_spell 115203 while it is enabled (engine/player/talent.cpp:28-31)',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data`: Shado-Pan is sub-tree 65 and Master of
    // Harmony 66, both class 10. `hero_tree.shadopan` resolves through
    // trait_data_t::get_hero_tree_id( "shadopan" ), which tokenizes the
    // sub-tree name (trait_data.cpp:225-238; util.cpp:3234 drops the '-').
    { simcName: "shadopan", subTreeId: 65 },
    { simcName: "master_of_harmony", subTreeId: 66 },
  ],
  apexTraits: true,
};

/**
 * The Havoc Demon Hunter profile (ONB-A1).
 *
 * `requiredTalents` are (a) the talents the pinned Havoc list reads as
 * `talent.<name>`, (b) the talents an action of that list is built on (an action
 * on `not_found()` is background, action.cpp:541-549), and (c) the talents that
 * gate a buff or a background copy the analyzer reads.
 *
 * DELIBERATELY ABSENT, each a duplicate name the extractor refuses to pick
 * between:
 *
 *   violent_transformation  rows 117509 (Fel-Scarred, sub-tree 34) and 136622
 *                           (Void-Scarred, sub-tree 126), both listing spec 577.
 *   eternal_hunt            three tiers at one node, read by the module as
 *                           eternal_hunt_1/2/3 (:11041-11043).
 *
 * The specialization answers `violent_transformation` only from a RESOLVED hero
 * tree, and leaves `eternal_hunt` unbound.
 */
const DEMONHUNTER_HAVOC_TARGET = {
  datasetId: "SIMC_TRAIT_DEMONHUNTER_HAVOC_TALENTS",
  classId: 12,
  specId: 577,
  defaultOut: "src/data/game/demonhunter-havoc-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. The same equivalence M10-C, M11-A4, " +
    "M11-B2 and M11-C2 recorded — `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals " +
    "trait_data_t::id_node — is corroborated for Havoc by the retained fight-48 subject: all 76 of its entries are " +
    "pinned rows of class 12 at their own nodes.",
  requiredTalents: [
    {
      simcName: "burning_wound",
      displayNameEn: "Burning Wound",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:11019 talent.havoc.burning_wound = find_talent_spell( SPECIALIZATION, "Burning Wound" ); the pinned list reads talent.burning_wound',
    },
    {
      simcName: "a_fire_inside",
      displayNameEn: "A Fire Inside",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:11039 talent.havoc.a_fire_inside = find_talent_spell( SPECIALIZATION, "A Fire Inside" ); the pinned list reads talent.a_fire_inside',
    },
    {
      simcName: "chaotic_transformation",
      displayNameEn: "Chaotic Transformation",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:11010 talent.havoc.chaotic_transformation = find_talent_spell( SPECIALIZATION, "Chaotic Transformation" ); the pinned list reads talent.chaotic_transformation, and metamorphosis_t::execute resets Eye Beam and Blade Dance under it (:5008-5012)',
    },
    {
      simcName: "screaming_brutality",
      displayNameEn: "Screaming Brutality",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:11038 talent.havoc.screaming_brutality = find_talent_spell( SPECIALIZATION, "Screaming Brutality" ); the pinned list reads talent.screaming_brutality, and Blade Dance and Death Sweep execute a background Throw Glaive under it (:7354-7357, :7406-7409)',
    },
    {
      simcName: "initiative",
      displayNameEn: "Initiative",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:11002 talent.havoc.initiative = find_talent_spell( SPECIALIZATION, "Initiative" ); the pinned items list reads talent.initiative',
    },
    {
      simcName: "inertia",
      displayNameEn: "Inertia",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:11015 talent.havoc.inertia = find_talent_spell( SPECIALIZATION, "Inertia" ); it gates buff.inertia_trigger, which the pinned list reads; its sibling at the node is Exergy',
    },
    {
      simcName: "eye_beam",
      displayNameEn: "Eye Beam",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:10985 talent.havoc.eye_beam = find_talent_spell( SPECIALIZATION, "Eye Beam" ); eye_beam_t is built on it (:4095-4096)',
    },
    {
      simcName: "essence_break",
      displayNameEn: "Essence Break",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:11034 talent.havoc.essence_break = find_talent_spell( SPECIALIZATION, "Essence Break" ); essence_break_t is built on it (:7804-7805)',
    },
    {
      simcName: "the_hunt",
      displayNameEn: "The Hunt",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:11024 talent.havoc.the_hunt = find_talent_spell( SPECIALIZATION, "The Hunt" ); the_hunt_t is built on it for Havoc (:5612, :11290)',
    },
    {
      simcName: "felblade",
      displayNameEn: "Felblade",
      tree: "CLASS",
      binding:
        'sc_demon_hunter.cpp:10869 talent.demon_hunter.felblade = find_talent_spell( CLASS, "Felblade" ); felblade_t is built on it (:7875-7876)',
    },
    {
      simcName: "vengeful_retreat",
      displayNameEn: "Vengeful Retreat",
      tree: "CLASS",
      binding:
        'sc_demon_hunter.cpp:10868 talent.demon_hunter.vengeful_retreat = find_talent_spell( CLASS, "Vengeful Retreat" ); vengeful_retreat_t is built on it (:8588-8589)',
    },
    {
      simcName: "art_of_the_glaive",
      displayNameEn: "Art of the Glaive",
      tree: "HERO",
      binding:
        'sc_demon_hunter.cpp:11110 talent.aldrachi_reaver.art_of_the_glaive = find_talent_spell( HERO, "Art of the Glaive" ); reavers_glaive_t is built on the spell looked up through it (:8431-8432, :11317)',
    },
    {
      simcName: "demonsurge",
      displayNameEn: "Demonsurge",
      tree: "HERO",
      binding:
        'sc_demon_hunter.cpp:11156 talent.scarred.demonsurge = find_talent_spell( HERO, "Demonsurge" ); action.<x>.demonsurge_available is the constant 0 without it (:2676-2686)',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data`: Fel-Scarred is sub-tree 34 and Aldrachi Reaver 35,
    // both class 12. `hero_tree.felscarred` resolves through
    // trait_data_t::get_hero_tree_id( "felscarred" ), which tokenizes the
    // sub-tree name (trait_data.cpp:225-238; util.cpp:3234 drops the '-').
    { simcName: "felscarred", subTreeId: 34 },
    { simcName: "aldrachi_reaver", subTreeId: 35 },
  ],
};

/**
 * The Fury Warrior profile (ONB-A2): (a) the talents the pinned Fury list reads as
 * `talent.<name>`, and (b) the talents an action of that list is built on (an action on
 * `not_found()` is background, action.cpp:541-549).
 */
const WARRIOR_FURY_TARGET = {
  datasetId: "SIMC_TRAIT_WARRIOR_FURY_TALENTS",
  classId: 1,
  specId: 72,
  defaultOut: "src/data/game/warrior-fury-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. The same equivalence every earlier target " +
    "recorded, that `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals trait_data_t::id_node, is ASSUMED for Fury Warrior: " +
    "no retained capture holds one of its combatantinfo events, so this target has no corroboration of its own.",
  requiredTalents: [
    {
      simcName: "recklessness",
      displayNameEn: "Recklessness",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7683 talents.fury.recklessness = find_talent_spell( SPECIALIZATION, "Recklessness" ); recklessness_t is built on it for Fury (:7308)',
    },
    {
      simcName: "avatar",
      displayNameEn: "Avatar",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7698 talents.fury.avatar = find_talent_spell( SPECIALIZATION, "Avatar", WARRIOR_FURY ); avatar_t is built on talents.shared.avatar (:7304, :7928). A CHOICE node with Bladestorm',
    },
    {
      simcName: "bladestorm",
      displayNameEn: "Bladestorm",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7699 talents.fury.bladestorm = find_talent_spell( SPECIALIZATION, "Bladestorm", WARRIOR_FURY ); bladestorm_t is built on talents.shared.bladestorm (:7316, :7929). A CHOICE node with Avatar',
    },
    {
      simcName: "odyns_fury",
      displayNameEn: "Odyn's Fury",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7692 talents.fury.odyns_fury = find_talent_spell( SPECIALIZATION, "Odyn\'s Fury" ); odyns_fury_t is built on it (:7365)',
    },
    {
      simcName: "raging_blow",
      displayNameEn: "Raging Blow",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7653 talents.fury.raging_blow = find_talent_spell( SPECIALIZATION, "Raging Blow" ); raging_blow_t is built on it (:4960-4961)',
    },
    {
      simcName: "rampage",
      displayNameEn: "Rampage",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7668 talents.fury.rampage = find_talent_spell( SPECIALIZATION, "Rampage" ); rampage_parent_t is built on it (:5697-5698)',
    },
    {
      simcName: "bloodthirst",
      displayNameEn: "Bloodthirst",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7651 talents.fury.bloodthirst = find_talent_spell( SPECIALIZATION, "Bloodthirst" ); bloodthirst_t is built on it (:2569-2570)',
    },
    {
      simcName: "improved_whirlwind",
      displayNameEn: "Improved Whirlwind",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7663 talents.fury.improved_whirlwind = find_talent_spell( SPECIALIZATION, "Improved Whirlwind" ); the pinned list reads talent.improved_whirlwind',
    },
    {
      simcName: "wrath_and_fury",
      displayNameEn: "Wrath and Fury",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7685 talents.fury.wrath_and_fury = find_talent_spell( SPECIALIZATION, "Wrath and Fury" ); the pinned list reads talent.wrath_and_fury',
    },
    {
      simcName: "deep_wounds",
      displayNameEn: "Deep Wounds",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7672 talents.fury.deep_wounds = find_talent_spell( SPECIALIZATION, "Deep Wounds", WARRIOR_FURY ); the pinned list reads talent.deep_wounds',
    },
    {
      simcName: "massacre",
      displayNameEn: "Massacre",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7665 talents.fury.massacre = find_talent_spell( SPECIALIZATION, "Massacre", WARRIOR_FURY ); the pinned list reads talent.massacre.enabled',
    },
    {
      simcName: "thunder_clap",
      displayNameEn: "Thunder Clap",
      tree: "CLASS",
      binding:
        'sc_warrior.cpp:7538 talents.warrior.thunder_clap = find_talent_spell( CLASS, "Thunder Clap", specialization() ); thunder_clap_t is built on it (:4085-4086)',
    },
    {
      simcName: "storm_bolt",
      displayNameEn: "Storm Bolt",
      tree: "CLASS",
      binding:
        'sc_warrior.cpp:7544 talents.warrior.storm_bolt = find_talent_spell( CLASS, "Storm Bolt" ); storm_bolt_t is built on it (:6403-6404)',
    },
    {
      simcName: "heroic_leap",
      displayNameEn: "Heroic Leap",
      tree: "CLASS",
      binding:
        'sc_warrior.cpp:7542 talents.warrior.heroic_leap = find_talent_spell( CLASS, "Heroic Leap" ); heroic_leap_t is built on it (:4672-4673)',
    },
    {
      simcName: "slayers_dominance",
      displayNameEn: "Slayer's Dominance",
      tree: "HERO",
      binding:
        'sc_warrior.cpp:7785 talents.slayer.slayers_dominance = find_talent_spell( HERO, "Slayer\'s Dominance" ); the pinned list reads talent.slayers_dominance',
    },
    {
      simcName: "lightning_strikes",
      displayNameEn: "Lightning Strikes",
      tree: "HERO",
      binding:
        'sc_warrior.cpp:7804 talents.mountain_thane.lightning_strikes = find_talent_spell( HERO, "Lightning Strikes" ); the pinned list reads talent.lightning_strikes',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4424-4425).
    { simcName: "slayer", subTreeId: 60 },
    { simcName: "mountain_thane", subTreeId: 61 },
  ],
};

/**
 * The Protection Warrior profile (ONB-A2): the same two questions over the pinned
 * Protection list. Heavy Repercussions and Practiced Strikes are read only inside Ignore
 * Pain's condition and are not pinned, so they stay UNKNOWN.
 */
const WARRIOR_PROTECTION_TARGET = {
  datasetId: "SIMC_TRAIT_WARRIOR_PROTECTION_TALENTS",
  classId: 1,
  specId: 73,
  defaultOut: "src/data/game/warrior-protection-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. The same equivalence every earlier target " +
    "recorded, that `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals trait_data_t::id_node, is ASSUMED for Protection Warrior: " +
    "no retained capture holds one of its combatantinfo events, so this target has no corroboration of its own.",
  requiredTalents: [
    {
      simcName: "avatar",
      displayNameEn: "Avatar",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7748 talents.protection.avatar = find_talent_spell( SPECIALIZATION, "Avatar", WARRIOR_PROTECTION ); avatar_t is built on talents.shared.avatar (:7304, :7928)',
    },
    {
      simcName: "shield_wall",
      displayNameEn: "Shield Wall",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7723 talents.protection.shield_wall = find_talent_spell( SPECIALIZATION, "Shield Wall" ); shield_wall_t is built on it (:7215-7216)',
    },
    {
      simcName: "ignore_pain",
      displayNameEn: "Ignore Pain",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7707 talents.protection.ignore_pain = find_talent_spell( SPECIALIZATION, "Ignore Pain", WARRIOR_PROTECTION ); ignore_pain_t is built on talents.shared.ignore_pain (:2475-2476, :7935)',
    },
    {
      simcName: "ravager",
      displayNameEn: "Ravager",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7759 talents.protection.ravager = find_talent_spell( SPECIALIZATION, "Ravager", WARRIOR_PROTECTION ); ravager_t is built on talents.shared.ravager (:5867-5868, :7931). A CHOICE node with Whirling Blade',
    },
    {
      simcName: "demoralizing_shout",
      displayNameEn: "Demoralizing Shout",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7709 talents.protection.demoralizing_shout = find_talent_spell( SPECIALIZATION, "Demoralizing Shout" ); demoralizing_shout_t is built on it (:3909-3910)',
    },
    {
      simcName: "booming_voice",
      displayNameEn: "Booming Voice",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7751 talents.protection.booming_voice = find_talent_spell( SPECIALIZATION, "Booming Voice" ); the pinned list reads talent.booming_voice.enabled',
    },
    {
      simcName: "shield_charge",
      displayNameEn: "Shield Charge",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7756 talents.protection.shield_charge = find_talent_spell( SPECIALIZATION, "Shield Charge" ); shield_charge_t is built on it (:6153-6154)',
    },
    {
      simcName: "revenge",
      displayNameEn: "Revenge",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7710 talents.protection.revenge = find_talent_spell( SPECIALIZATION, "Revenge" ); revenge_t is built on it (:5996-5997)',
    },
    {
      simcName: "heavy_handed",
      displayNameEn: "Heavy Handed",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7754 talents.protection.heavy_handed = find_talent_spell( SPECIALIZATION, "Heavy Handed", WARRIOR_PROTECTION ); the pinned list reads talent.heavy_handed.enabled',
    },
    {
      simcName: "massacre",
      displayNameEn: "Massacre",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7750 talents.protection.massacre = find_talent_spell( SPECIALIZATION, "Massacre", WARRIOR_PROTECTION ); the pinned list reads talent.massacre.enabled',
    },
    {
      simcName: "thunder_clap",
      displayNameEn: "Thunder Clap",
      tree: "CLASS",
      binding:
        'sc_warrior.cpp:7538 talents.warrior.thunder_clap = find_talent_spell( CLASS, "Thunder Clap", specialization() ); thunder_clap_t is built on it (:4085-4086)',
    },
    {
      simcName: "champions_spear",
      displayNameEn: "Champion's Spear",
      tree: "CLASS",
      binding:
        'sc_warrior.cpp:7587 talents.warrior.champions_spear = find_talent_spell( CLASS, "Champion\'s Spear" ); champions_spear_t is built on it (:6846-6847)',
    },
    {
      simcName: "wrecking_throw",
      displayNameEn: "Wrecking Throw",
      tree: "CLASS",
      binding:
        'sc_warrior.cpp:7562 talents.warrior.wrecking_throw = find_talent_spell( CLASS, "Wrecking Throw" ); wrecking_throw_t is built on it (:6783-6784). A CHOICE node with Shattering Throw',
    },
    {
      simcName: "shattering_throw",
      displayNameEn: "Shattering Throw",
      tree: "CLASS",
      binding:
        'sc_warrior.cpp:7563 talents.warrior.shattering_throw = find_talent_spell( CLASS, "Shattering Throw" ); shattering_throw_t is built on it (:5263-5264). A CHOICE node with Wrecking Throw',
    },
    {
      simcName: "javelineer",
      displayNameEn: "Javelineer",
      tree: "CLASS",
      binding:
        'sc_warrior.cpp:7576 talents.warrior.javelineer = find_talent_spell( CLASS, "Javelineer" ); the pinned list reads talent.javelineer.enabled',
    },
    {
      simcName: "demolish",
      displayNameEn: "Demolish",
      tree: "HERO",
      binding:
        'sc_warrior.cpp:7766 talents.colossus.demolish = find_talent_spell( HERO, "Demolish" ); demolish_t is built on it (:3857-3858), and the pinned list reads talent.demolish',
    },
    {
      simcName: "lightning_strikes",
      displayNameEn: "Lightning Strikes",
      tree: "HERO",
      binding:
        'sc_warrior.cpp:7804 talents.mountain_thane.lightning_strikes = find_talent_spell( HERO, "Lightning Strikes" ); the pinned list reads talent.lightning_strikes',
    },
    {
      simcName: "snap_induction",
      displayNameEn: "Snap Induction",
      tree: "HERO",
      binding:
        'sc_warrior.cpp:7816 talents.mountain_thane.snap_induction = find_talent_spell( HERO, "Snap Induction" ); the pinned list reads talent.snap_induction.enabled. A CHOICE node with Flashing Skies',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4425-4426).
    { simcName: "mountain_thane", subTreeId: 61 },
    { simcName: "colossus", subTreeId: 62 },
  ],
};

/**
 * The Subtlety Rogue profile (ONB-A2).
 *
 * DELIBERATELY ABSENT: `ancient_arts_3`. Ancient Arts is one TIERED node with three rows
 * under one name (sc_rogue.cpp:10163-10165 reads them by id), and the extractor never picks
 * between rows of one name, so `talent.ancient_arts_3` stays UNKNOWN and so does
 * `variable.build_at_max_for_apex`.
 */
const ROGUE_SUBTLETY_TARGET = {
  datasetId: "SIMC_TRAIT_ROGUE_SUBTLETY_TALENTS",
  classId: 4,
  specId: 261,
  defaultOut: "src/data/game/rogue-subtlety-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. The same equivalence every earlier target " +
    "recorded, that `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals trait_data_t::id_node, is ASSUMED for Subtlety Rogue: " +
    "no retained capture holds one of its combatantinfo events, so this target has no corroboration of its own.",
  requiredTalents: [
    {
      simcName: "goremaws_bite",
      displayNameEn: "Goremaw's Bite",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10132 talent.subtlety.goremaws_bite = find_talent_spell( SPECIALIZATION, "Goremaw\'s Bite" ); goremaws_bite_t is built on it (:6462-6463)',
    },
    {
      simcName: "gloomblade",
      displayNameEn: "Gloomblade",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10131 talent.subtlety.gloomblade = find_talent_spell( SPECIALIZATION, "Gloomblade" ); gloomblade_t is built on it (:4562-4563)',
    },
    {
      simcName: "shadow_blades",
      displayNameEn: "Shadow Blades",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10147 talent.subtlety.shadow_blades = find_talent_spell( SPECIALIZATION, "Shadow Blades" ); shadow_blades_t is built on it (:5451-5452)',
    },
    {
      simcName: "potent_powder",
      displayNameEn: "Potent Powder",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10141 talent.subtlety.potent_powder = find_talent_spell( SPECIALIZATION, "Potent Powder" ); the pinned list reads talent.potent_powder',
    },
    {
      simcName: "deathstalkers_mark",
      displayNameEn: "Deathstalker's Mark",
      tree: "HERO",
      binding:
        'sc_rogue.cpp:10175 talent.deathstalker.deathstalkers_mark = find_talent_spell( HERO, "Deathstalker\'s Mark" ); the pinned list reads talent.deathstalkers_mark',
    },
    {
      simcName: "unseen_blade",
      displayNameEn: "Unseen Blade",
      tree: "HERO",
      binding:
        'sc_rogue.cpp:10227 talent.trickster.unseen_blade = find_talent_spell( HERO, "Unseen Blade" ); the pinned list reads talent.unseen_blade',
    },
    {
      simcName: "coup_de_grace",
      displayNameEn: "Coup de Grace",
      tree: "HERO",
      binding:
        'sc_rogue.cpp:10212 talent.trickster.coup_de_grace = find_talent_spell( HERO, "Coup de Grace" ); spell.coup_de_grace, which coup_de_grace_t is built on, is not_found without it (:10265)',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4415, :4417).
    { simcName: "trickster", subTreeId: 51 },
    { simcName: "deathstalker", subTreeId: 53 },
  ],
};

/**
 * The Outlaw Rogue profile (ONB-C2): the talents the pinned Outlaw list reads as `talent.<name>`, and
 * the talents an action of that list is built on (an action on `not_found()` is background,
 * action.cpp:541-549). The hero sub-trees are Trickster (51) and Fatebound (52).
 */
const ROGUE_OUTLAW_TARGET = {
  datasetId: "SIMC_TRAIT_ROGUE_OUTLAW_TALENTS",
  classId: 4,
  specId: 260,
  defaultOut: "src/data/game/rogue-outlaw-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. The same equivalence every earlier target " +
    "recorded, that `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals trait_data_t::id_node, is ASSUMED for Outlaw Rogue: " +
    "no retained capture holds one of its combatantinfo events, so this target has no corroboration of its own.",
  requiredTalents: [
    {
      simcName: "adrenaline_rush",
      displayNameEn: "Adrenaline Rush",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10074 talent.outlaw.adrenaline_rush = find_talent_spell( SPECIALIZATION, "Adrenaline Rush" ); ; adrenaline_rush_t is built on it',
    },
    {
      simcName: "audacity",
      displayNameEn: "Audacity",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10075 talent.outlaw.audacity = find_talent_spell( SPECIALIZATION, "Audacity" ); ; the pinned list reads talent.audacity',
    },
    {
      simcName: "blade_rush",
      displayNameEn: "Blade Rush",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10076 talent.outlaw.blade_rush = find_talent_spell( SPECIALIZATION, "Blade Rush" ); ; blade_rush_t is built on it',
    },
    {
      simcName: "deft_maneuvers",
      displayNameEn: "Deft Maneuvers",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10083 talent.outlaw.deft_maneuvers = find_talent_spell( SPECIALIZATION, "Deft Maneuvers" ); ; the pinned list reads talent.deft_maneuvers',
    },
    {
      simcName: "fan_the_hammer",
      displayNameEn: "Fan the Hammer",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10087 talent.outlaw.fan_the_hammer = find_talent_spell( SPECIALIZATION, "Fan the Hammer" ); ; the pinned list reads talent.fan_the_hammer',
    },
    {
      simcName: "hidden_opportunity",
      displayNameEn: "Hidden Opportunity",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10094 talent.outlaw.hidden_opportunity = find_talent_spell( SPECIALIZATION, "Hidden Opportunity" ); ; the pinned list reads talent.hidden_opportunity, which gates the guarded Ambush',
    },
    {
      simcName: "improved_adrenaline_rush",
      displayNameEn: "Improved Adrenaline Rush",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10096 talent.outlaw.improved_adrenaline_rush = find_talent_spell( SPECIALIZATION, "Improved Adrenaline Rush" ); ; the pinned precombat list reads talent.improved_adrenaline_rush',
    },
    {
      simcName: "keep_it_rolling",
      displayNameEn: "Keep It Rolling",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10098 talent.outlaw.keep_it_rolling = find_talent_spell( SPECIALIZATION, "Keep it Rolling" ); ; keep_it_rolling_t is built on it',
    },
    {
      simcName: "killing_spree",
      displayNameEn: "Killing Spree",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10099 talent.outlaw.killing_spree = find_talent_spell( SPECIALIZATION, "Killing Spree" ); ; killing_spree_t is built on it',
    },
    {
      simcName: "preparation",
      displayNameEn: "Preparation",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10104 talent.outlaw.preparation = find_talent_spell( SPECIALIZATION, "Preparation" ); ; preparation_t is built on it',
    },
    {
      simcName: "quick_draw",
      displayNameEn: "Quick Draw",
      tree: "SPECIALIZATION",
      binding:
        'sc_rogue.cpp:10105 talent.outlaw.quick_draw = find_talent_spell( SPECIALIZATION, "Quick Draw" ); ; the pinned list reads talent.quick_draw',
    },
    {
      simcName: "improved_ambush",
      displayNameEn: "Improved Ambush",
      tree: "CLASS",
      binding:
        'sc_rogue.cpp:9993 talent.rogue.improved_ambush = find_talent_spell( CLASS, "Improved Ambush" ); ; the pinned list reads talent.improved_ambush',
    },
    {
      simcName: "supercharger",
      displayNameEn: "Supercharger",
      tree: "CLASS",
      binding:
        'sc_rogue.cpp:10009 talent.rogue.supercharger = find_talent_spell( CLASS, "Supercharger" ); ; the pinned list reads talent.supercharger',
    },
    {
      simcName: "deal_fate",
      displayNameEn: "Deal Fate",
      tree: "HERO",
      binding:
        'sc_rogue.cpp:10193 talent.fatebound.deal_fate = find_talent_spell( HERO, "Deal Fate" ); ; the pinned list reads talent.deal_fate',
    },
    {
      simcName: "coup_de_grace",
      displayNameEn: "Coup de Grace",
      tree: "HERO",
      binding:
        'sc_rogue.cpp:10212 talent.trickster.coup_de_grace = find_talent_spell( HERO, "Coup de Grace" ); ; spell.coup_de_grace, which coup_de_grace_t is built on, is not_found without it (:10265)',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4415-4416).
    { simcName: "trickster", subTreeId: 51 },
    { simcName: "fatebound", subTreeId: 52 },
  ],
};

/**
 * The Elemental Shaman profile (ONB-D2): the talents the pinned list reads as `talent.<name>`, and the talents an action of
 * that list is built on (an action on `not_found()` is background, action.cpp:541-549).
 */
const SHAMAN_ELEMENTAL_TARGET = {
  datasetId: "SIMC_TRAIT_SHAMAN_ELEMENTAL_TALENTS",
  classId: 7,
  specId: 262,
  defaultOut: "src/data/game/shaman-elemental-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals " +
    "trait_data_t::id_node, as every earlier target recorded. Corroborated for Elemental Shaman on its retained subjects, whose observed trees resolve " +
    'a hero tree and the pinned list\'s talents by these keys (agent/architecture.md "ONB-D2").',
  requiredTalents: [
    {
      simcName: "ascendance",
      displayNameEn: "Ascendance",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11202 { talent.ascendance,             "Ascendance"            },; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "ancestral_swiftness",
      displayNameEn: "Ancestral Swiftness",
      tree: "HERO",
      binding:
        'sc_shaman.cpp:11411 talent.ancestral_swiftness    = find_talent_spell( talent_tree::HERO, "Ancestral Swiftness" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "call_of_the_ancestors",
      displayNameEn: "Call of the Ancestors",
      tree: "HERO",
      binding:
        'sc_shaman.cpp:11393 talent.call_of_the_ancestors  = find_talent_spell( talent_tree::HERO, "Call of the Ancestors" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "chain_lightning",
      displayNameEn: "Chain Lightning",
      tree: "CLASS",
      binding:
        'sc_shaman.cpp:11154 talent.chain_lightning = _CT( "Chain Lightning" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "crackling_fury",
      displayNameEn: "Crackling Fury",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11384 talent.crackling_fury            = _ST( "Crackling Fury" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "earth_shock",
      displayNameEn: "Earth Shock",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11332 talent.earth_shock = _ST( "Earth Shock" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "elemental_blast",
      displayNameEn: "Elemental Blast",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11198 talent.elemental_blast         = _ST( "Elemental Blast" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "eye_of_the_storm",
      displayNameEn: "Eye of the Storm",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11372 talent.eye_of_the_storm       = _ST( "Eye of the Storm" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "flametongue_weapon",
      displayNameEn: "Flametongue Weapon",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11221 { talent.flametongue_weapon,     "Flametongue Weapon"     },; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "frost_shock",
      displayNameEn: "Frost Shock",
      tree: "CLASS",
      binding:
        'sc_shaman.cpp:11160 talent.frost_shock     = _CT( "Frost Shock" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "inferno_arc",
      displayNameEn: "Inferno Arc",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11373 talent.inferno_arc            = _ST( "Inferno Arc" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "lava_burst",
      displayNameEn: "Lava Burst",
      tree: "CLASS",
      binding:
        'sc_shaman.cpp:11152 talent.lava_burst      = _CT( "Lava Burst" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "master_of_the_elements",
      displayNameEn: "Master of the Elements",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11346 talent.master_of_the_elements = _ST( "Master of the Elements" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "molten_wrath",
      displayNameEn: "Molten Wrath",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11347 talent.molten_wrath           = _ST( "Molten Wrath" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "natures_swiftness",
      displayNameEn: "Nature's Swiftness",
      tree: "CLASS",
      binding:
        'sc_shaman.cpp:11182 talent.natures_swiftness       = _CT( "Nature\'s Swiftness" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "purging_flames",
      displayNameEn: "Purging Flames",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11385 talent.purging_flames            = _ST( "Purging Flames" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "spiritwalkers_grace",
      displayNameEn: "Spiritwalker's Grace",
      tree: "CLASS",
      binding:
        'sc_shaman.cpp:11166 talent.spiritwalkers_grace = _CT( "Spiritwalker\'s Grace" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "stormkeeper",
      displayNameEn: "Stormkeeper",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11345 talent.stormkeeper            = _ST( "Stormkeeper" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "tempest",
      displayNameEn: "Tempest",
      tree: "HERO",
      binding:
        'sc_shaman.cpp:11268 { talent.tempest,           "Tempest"           },; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "voltaic_blaze",
      displayNameEn: "Voltaic Blaze",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11237 { talent.voltaic_blaze,          "Voltaic Blaze"          },; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "wind_shear",
      displayNameEn: "Wind Shear",
      tree: "CLASS",
      binding:
        'sc_shaman.cpp:11157 talent.wind_shear      = _CT( "Wind Shear" );; the pinned list reads it or an action of the list is built on it',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4418-4420).
    { simcName: "farseer", subTreeId: 56 },
    { simcName: "stormbringer", subTreeId: 55 },
  ],
};

/**
 * The Balance Druid profile (ONB-D2): the talents the pinned list reads as `talent.<name>`, and the talents an action of
 * that list is built on (an action on `not_found()` is background, action.cpp:541-549).
 */
const DRUID_BALANCE_TARGET = {
  datasetId: "SIMC_TRAIT_DRUID_BALANCE_TALENTS",
  classId: 11,
  specId: 102,
  defaultOut: "src/data/game/druid-balance-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals " +
    "trait_data_t::id_node, as every earlier target recorded. Corroborated for Balance Druid on its retained subjects, whose observed trees resolve " +
    'a hero tree and the pinned list\'s talents by these keys (agent/architecture.md "ONB-D2").',
  requiredTalents: [
    {
      simcName: "aetherial_kindling",
      displayNameEn: "Aetherial Kindling",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10391 talent.aetherial_kindling             = ST( "Aetherial Kindling" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "celestial_alignment",
      displayNameEn: "Celestial Alignment",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10394 talent.celestial_alignment            = ST( "Celestial Alignment" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "convoke_the_spirits",
      displayNameEn: "Convoke the Spirits",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10383 talent.convoke_the_spirits            = ST( "Convoke the Spirits" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "dream_surge",
      displayNameEn: "Dream Surge",
      tree: "HERO",
      binding:
        'sc_druid.cpp:10635 talent.dream_surge                    = HT( "Dream Surge" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "force_of_nature",
      displayNameEn: "Force of Nature",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10401 talent.force_of_nature                = ST( "Force of Nature" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "fury_of_elune",
      displayNameEn: "Fury of Elune",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10402 talent.fury_of_elune                  = ST( "Fury of Elune" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "incarnation_chosen_of_elune",
      displayNameEn: "Incarnation: Chosen of Elune",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10406 talent.incarnation_moonkin            = ST( "Incarnation: Chosen of Elune" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "lunation",
      displayNameEn: "Lunation",
      tree: "HERO",
      binding:
        'sc_druid.cpp:10660 talent.lunation                       = HT( "Lunation" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "meteor_storm",
      displayNameEn: "Meteor Storm",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10408 talent.meteor_storm                   = ST( "Meteor Storm" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "meteorites",
      displayNameEn: "Meteorites",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10409 talent.meteorites                     = ST( "Meteorites" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "new_moon",
      displayNameEn: "New Moon",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10412 talent.new_moon                       = ST( "New Moon" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "power_of_goldrinn",
      displayNameEn: "Power of Goldrinn",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10415 talent.power_of_goldrinn              = ST( "Power of Goldrinn" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "radiant_moonlight",
      displayNameEn: "Radiant Moonlight",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10416 talent.radiant_moonlight              = ST( "Radiant Moonlight" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "rattle_the_stars",
      displayNameEn: "Rattle the Stars",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10417 talent.rattle_the_stars               = ST( "Rattle the Stars" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "starfire",
      displayNameEn: "Starfire",
      tree: "CLASS",
      binding:
        'sc_druid.cpp:10365 talent.starfire                       = CT( "Starfire" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "starsurge",
      displayNameEn: "Starsurge",
      tree: "CLASS",
      binding:
        'sc_druid.cpp:10367 talent.starsurge                      = CT( "Starsurge" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "starweaver",
      displayNameEn: "Starweaver",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10424 talent.starweaver                     = ST( "Starweaver" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "stellar_amplification",
      displayNameEn: "Stellar Amplification",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10425 talent.stellar_amplification          = ST( "Stellar Amplification" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "sunfire",
      displayNameEn: "Sunfire",
      tree: "CLASS",
      binding:
        'sc_druid.cpp:10368 talent.sunfire                        = CT( "Sunfire" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "wild_mushroom",
      displayNameEn: "Wild Mushroom",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10434 talent.wild_mushroom                  = ST( "Wild Mushroom" );; the pinned list reads it or an action of the list is built on it',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4396-4397).
    { simcName: "keeper_of_the_grove", subTreeId: 23 },
    { simcName: "elunes_chosen", subTreeId: 24 },
  ],
};

/**
 * The Shadow Priest profile (ONB-D2): the talents the pinned list reads as `talent.<name>`, and the talents an action of
 * that list is built on (an action on `not_found()` is background, action.cpp:541-549).
 */
const PRIEST_SHADOW_TARGET = {
  datasetId: "SIMC_TRAIT_PRIEST_SHADOW_TALENTS",
  classId: 5,
  specId: 258,
  defaultOut: "src/data/game/priest-shadow-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals " +
    "trait_data_t::id_node, as every earlier target recorded. Corroborated for Shadow Priest on its retained subjects, whose observed trees resolve " +
    'a hero tree and the pinned list\'s talents by these keys (agent/architecture.md "ONB-D2").',
  requiredTalents: [
    {
      simcName: "ancient_madness",
      displayNameEn: "Ancient Madness",
      tree: "SPECIALIZATION",
      binding:
        'sc_priest_shadow.cpp:2424 talents.shadow.ancient_madness          = ST( "Ancient Madness" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "deathspeaker",
      displayNameEn: "Deathspeaker",
      tree: "SPECIALIZATION",
      binding:
        'sc_priest_shadow.cpp:2438 talents.shadow.deathspeaker                 = ST( "Deathspeaker" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "desperate_prayer",
      displayNameEn: "Desperate Prayer",
      tree: "CLASS",
      binding:
        'sc_priest.cpp:3364 talents.desperate_prayer   = CT( "Desperate Prayer" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "devour_matter",
      displayNameEn: "Devour Matter",
      tree: "HERO",
      binding:
        'sc_priest.cpp:3459 talents.voidweaver.devour_matter          = HT( "Devour Matter" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "distorted_reality",
      displayNameEn: "Distorted Reality",
      tree: "SPECIALIZATION",
      binding:
        'sc_priest_shadow.cpp:2434 talents.shadow.distorted_reality   = ST( "Distorted Reality" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "halo",
      displayNameEn: "Halo",
      tree: "HERO",
      binding:
        'sc_priest.cpp:3394 talents.archon.halo                     = HT( "Halo" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "holy_nova",
      displayNameEn: "Holy Nova",
      tree: "CLASS",
      binding:
        'sc_priest.cpp:3325 talents.holy_nova          = CT( "Holy Nova" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "idol_of_yshaarj",
      displayNameEn: "Idol of Y'Shaarj",
      tree: "SPECIALIZATION",
      binding:
        'sc_priest_shadow.cpp:2454 talents.shadow.idol_of_yshaarj        = ST( "Idol of Y\'Shaarj" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "inescapable_torment",
      displayNameEn: "Inescapable Torment",
      tree: "SPECIALIZATION",
      binding:
        'sc_priest.cpp:3292 talents.shared.inescapable_torment = ST( "Inescapable Torment" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "invoked_nightmare",
      displayNameEn: "Invoked Nightmare",
      tree: "SPECIALIZATION",
      binding:
        'sc_priest_shadow.cpp:2396 talents.shadow.invoked_nightmare = ST( "Invoked Nightmare" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "lightburst",
      displayNameEn: "Lightburst",
      tree: "CLASS",
      binding:
        'sc_priest.cpp:3331 talents.lightburst         = CT( "Lightburst" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "maddening_tentacles",
      displayNameEn: "Maddening Tentacles",
      tree: "SPECIALIZATION",
      binding:
        'sc_priest_shadow.cpp:2444 talents.shadow.maddening_tentacles          = ST( "Maddening Tentacles" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "mind_blast",
      displayNameEn: "Mind Blast",
      tree: "CLASS",
      binding:
        'sc_priest.cpp:3322 talents.mind_blast          = CT( "Mind Blast" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "mind_devourer",
      displayNameEn: "Mind Devourer",
      tree: "SPECIALIZATION",
      binding:
        'sc_priest_shadow.cpp:2442 talents.shadow.mind_devourer                = ST( "Mind Devourer" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "power_infusion",
      displayNameEn: "Power Infusion",
      tree: "CLASS",
      binding:
        'sc_priest.cpp:3334 talents.power_infusion     = CT( "Power Infusion" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "resonant_energy",
      displayNameEn: "Resonant Energy",
      tree: "HERO",
      binding:
        'sc_priest.cpp:3417 talents.archon.resonant_energy         = HT( "Resonant Energy" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "shadow_word_death",
      displayNameEn: "Shadow Word: Death",
      tree: "CLASS",
      binding:
        'sc_priest.cpp:3360 talents.shadow_word_death             = CT( "Shadow Word: Death" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "shadow_word_madness",
      displayNameEn: "Shadow Word: Madness",
      tree: "SPECIALIZATION",
      binding:
        'sc_priest.cpp:3311 dot_spells.shadow_word_madness = find_talent_spell( talent_tree::SPECIALIZATION, "Shadow Word: Madness" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "shadowfiend",
      displayNameEn: "Shadowfiend",
      tree: "SPECIALIZATION",
      binding:
        'sc_priest.cpp:3293 talents.shared.shadowfiend         = ST( "Shadowfiend" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "tentacle_slam",
      displayNameEn: "Tentacle Slam",
      tree: "SPECIALIZATION",
      binding:
        'sc_priest_shadow.cpp:2401 talents.shadow.tentacle_slam        = ST( "Tentacle Slam" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "thought_harvester",
      displayNameEn: "Thought Harvester",
      tree: "SPECIALIZATION",
      binding:
        'sc_priest_shadow.cpp:2400 talents.shadow.thought_harvester    = ST( "Thought Harvester" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "void_blast",
      displayNameEn: "Void Blast",
      tree: "HERO",
      binding:
        'sc_priest.cpp:3453 talents.voidweaver.void_blast             = HT( "Void Blast" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "void_torrent",
      displayNameEn: "Void Torrent",
      tree: "HERO",
      binding:
        'sc_priest.cpp:3445 talents.voidweaver.void_torrent           = HT( "Void Torrent" );; the pinned list reads it or an action of the list is built on it',
    },
    {
      simcName: "voidform",
      displayNameEn: "Voidform",
      tree: "SPECIALIZATION",
      binding:
        'sc_priest_shadow.cpp:2412 talents.shadow.voidform            = ST( "Voidform" );; the pinned list reads it or an action of the list is built on it',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4391-4392).
    { simcName: "voidweaver", subTreeId: 18 },
    { simcName: "archon", subTreeId: 19 },
  ],
};

/**
 * The Destruction Warlock profile (ONB-D1): the talents the pinned Destruction list reads as
 * `talent.<name>`, the talents an action of that list is built on (an action on `not_found()` is
 * background, action.cpp:541-549). The hero sub-trees are Hellcaller (58) and Diabolist (59).
 */
const WARLOCK_DESTRUCTION_TARGET = {
  datasetId: "SIMC_TRAIT_WARLOCK_DESTRUCTION_TALENTS",
  classId: 9,
  specId: 267,
  defaultOut: "src/data/game/warlock-destruction-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals " +
    "trait_data_t::id_node, as every earlier target recorded. Corroborated for Destruction Warlock on the retained A7R6kxPJ1hC8YQ4w fight 7 actors 12 and 15: " +
    'their observed trees resolve Hellcaller and the pinned list\'s talents by these keys (agent/architecture.md "ONB-D1").',
  requiredTalents: [
    {
      simcName: "avatar_of_destruction",
      displayNameEn: "Avatar of Destruction",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:500 talents.avatar_of_destruction = find_talent_spell( SPECIALIZATION, "Avatar of Destruction" ); ; the pinned list reads talent.avatar_of_destruction',
    },
    {
      simcName: "backdraft",
      displayNameEn: "Backdraft",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:400 talents.backdraft = find_talent_spell( SPECIALIZATION, "Backdraft" ); ; the pinned list reads talent.backdraft',
    },
    {
      simcName: "cataclysm",
      displayNameEn: "Cataclysm",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:426 talents.cataclysm = find_talent_spell( SPECIALIZATION, "Cataclysm" ); ; cataclysm_t is built on it',
    },
    {
      simcName: "chaos_bolt",
      displayNameEn: "Chaos Bolt",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:388 talents.chaos_bolt = find_talent_spell( SPECIALIZATION, "Chaos Bolt" ); ; chaos_bolt_t is built on it',
    },
    {
      simcName: "conflagrate",
      displayNameEn: "Conflagrate",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:390 talents.conflagrate = find_talent_spell( SPECIALIZATION, "Conflagrate" ); ; conflagrate_t is built on it',
    },
    {
      simcName: "conflagration_of_chaos",
      displayNameEn: "Conflagration of Chaos",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:490 talents.conflagration_of_chaos = find_talent_spell( SPECIALIZATION, "Conflagration of Chaos" ); ; the pinned list reads talent.conflagration_of_chaos',
    },
    {
      simcName: "destructive_rapidity",
      displayNameEn: "Destructive Rapidity",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:471 talents.destructive_rapidity = find_talent_spell( SPECIALIZATION, "Destructive Rapidity" ); ; the pinned list reads talent.destructive_rapidity',
    },
    {
      simcName: "fire_and_brimstone",
      displayNameEn: "Fire and Brimstone",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:447 talents.fire_and_brimstone = find_talent_spell( SPECIALIZATION, "Fire and Brimstone" ); ; the pinned list reads talent.fire_and_brimstone',
    },
    {
      simcName: "havoc",
      displayNameEn: "Havoc",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:411 talents.havoc = find_talent_spell( SPECIALIZATION, "Havoc" ); ; havoc_t is built on it',
    },
    {
      simcName: "internal_combustion",
      displayNameEn: "Internal Combustion",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:457 talents.internal_combustion = find_talent_spell( SPECIALIZATION, "Internal Combustion" ); ; the pinned list reads talent.internal_combustion',
    },
    {
      simcName: "lake_of_fire",
      displayNameEn: "Lake of Fire",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:449 talents.lake_of_fire = find_talent_spell( SPECIALIZATION, "Lake of Fire" ); ; the pinned list reads talent.lake_of_fire',
    },
    {
      simcName: "roaring_blaze",
      displayNameEn: "Roaring Blaze",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:405 talents.roaring_blaze = find_talent_spell( SPECIALIZATION, "Roaring Blaze" ); ; the pinned list reads talent.roaring_blaze',
    },
    {
      simcName: "shadowburn",
      displayNameEn: "Shadowburn",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:416 talents.shadowburn = find_talent_spell( SPECIALIZATION, "Shadowburn" ); ; shadowburn_t is built on it',
    },
    {
      simcName: "soul_fire",
      displayNameEn: "Soul Fire",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:485 talents.soul_fire = find_talent_spell( SPECIALIZATION, "Soul Fire" ); ; soul_fire_t is built on it',
    },
    {
      simcName: "summon_infernal",
      displayNameEn: "Summon Infernal",
      tree: "SPECIALIZATION",
      binding:
        'sc_warlock_init.cpp:437 talents.summon_infernal = find_talent_spell( SPECIALIZATION, "Summon Infernal" ); ; summon_infernal_t is built on it',
    },
    {
      simcName: "diabolic_ritual",
      displayNameEn: "Diabolic Ritual",
      tree: "HERO",
      binding:
        'sc_warlock_init.cpp:538 hero.diabolic_ritual = find_talent_spell( HERO, "Diabolic Ritual" ); ; the pinned list reads talent.diabolic_ritual',
    },
    {
      simcName: "ruination",
      displayNameEn: "Ruination",
      tree: "HERO",
      binding:
        'sc_warlock_init.cpp:576 hero.ruination = find_talent_spell( HERO, "Ruination" ); ; ruination_t is built on hero.ruination_cast, which is not_found without it',
    },
    {
      simcName: "secrets_of_the_coven",
      displayNameEn: "Secrets of the Coven",
      tree: "HERO",
      binding:
        'sc_warlock_init.cpp:560 hero.secrets_of_the_coven = find_talent_spell( HERO, "Secrets of the Coven" ); ; infernal_bolt_t is built on hero.infernal_bolt, which is not_found without it',
    },
    {
      simcName: "wither",
      displayNameEn: "Wither",
      tree: "HERO",
      binding:
        'sc_warlock_init.cpp:604 hero.wither = find_talent_spell( HERO, "Wither" ); ; the pinned list reads talent.wither, and wither_t and immolate_t read it',
    },
    {
      simcName: "malevolence",
      displayNameEn: "Malevolence",
      tree: "HERO",
      binding:
        'sc_warlock_init.cpp:634 hero.malevolence = find_talent_spell( HERO, "Malevolence" ); ; malevolence_t is built on it',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4422-4423).
    { simcName: "hellcaller", subTreeId: 58 },
    { simcName: "diabolist", subTreeId: 59 },
  ],
};

/**
 * The Frost Death Knight profile (ONB-B2): (a) the talents the pinned Frost list reads as
 * `talent.<name>`, and (b) the talents an action of that list is built on (an action on
 * `not_found()` is background, action.cpp:541-549). `chosen_of_frostbrood` is NOT here: it is a
 * three-entry tiered node, and a talent with no row of its own resolves UNKNOWN, never false.
 */
const DEATHKNIGHT_FROST_TARGET = {
  datasetId: "SIMC_TRAIT_DEATHKNIGHT_FROST_TALENTS",
  classId: 6,
  specId: 251,
  defaultOut: "src/data/game/deathknight-frost-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. That `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals " +
    "trait_data_t::id_node is corroborated for Frost Death Knight on two real subjects: b1PmaKrd6CDfzngc fight 48 actor 19 and gtKb2xHn87pNcFfW fight 22 actor 26.",
  requiredTalents: [
    {
      simcName: "obliterate",
      displayNameEn: "Obliterate",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14958 talent.frost.obliterate = find_talent_spell( talent_tree::SPECIALIZATION, "Obliterate" ); obliterate_t is built on it (:11855-11856)',
    },
    {
      simcName: "howling_blast",
      displayNameEn: "Howling Blast",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14959 talent.frost.howling_blast = find_talent_spell( talent_tree::SPECIALIZATION, "Howling Blast" ); howling_blast_t is built on it (:11460-11461)',
    },
    {
      simcName: "frost_strike",
      displayNameEn: "Frost Strike",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14956 talent.frost.frost_strike = find_talent_spell( talent_tree::SPECIALIZATION, "Frost Strike" ); frost_strike_t is built on it (:10933-10934)',
    },
    {
      simcName: "frostscythe",
      displayNameEn: "Frostscythe",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14963 talent.frost.frostscythe = find_talent_spell( talent_tree::SPECIALIZATION, "Frostscythe" ); frostscythe_t is built on it (:10535-10536)',
    },
    {
      simcName: "pillar_of_frost",
      displayNameEn: "Pillar of Frost",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14972 talent.frost.pillar_of_frost = find_talent_spell( talent_tree::SPECIALIZATION, "Pillar of Frost" ); pillar_of_frost_t is built on it (:12008-12009), and the pinned Frost list reads it',
    },
    {
      simcName: "breath_of_sindragosa",
      displayNameEn: "Breath of Sindragosa",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:15003 talent.frost.breath_of_sindragosa = find_talent_spell( talent_tree::SPECIALIZATION, "Breath of Sindragosa" ); breath_of_sindragosa_t is built on it (:9235-9236), and the pinned Frost list reads it',
    },
    {
      simcName: "frostwyrms_fury",
      displayNameEn: "Frostwyrm's Fury",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14979 talent.frost.frostwyrms_fury = find_talent_spell( talent_tree::SPECIALIZATION, "Frostwyrm\'s Fury" ); frostwyrms_fury_t is built on it (:10697-10698)',
    },
    {
      simcName: "empower_rune_weapon",
      displayNameEn: "Empower Rune Weapon",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14962 talent.frost.empower_rune_weapon = find_talent_spell( talent_tree::SPECIALIZATION, "Empower Rune Weapon" ); empower_rune_weapon_t is built on it (:10148-10149)',
    },
    {
      simcName: "shattering_blade",
      displayNameEn: "Shattering Blade",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14997 talent.frost.shattering_blade = find_talent_spell( talent_tree::SPECIALIZATION, "Shattering Blade" ); the pinned Frost list reads it',
    },
    {
      simcName: "frostbound_will",
      displayNameEn: "Frostbound Will",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14967 talent.frost.frostbound_will = find_talent_spell( talent_tree::SPECIALIZATION, "Frostbound Will" ); the pinned Frost list reads it',
    },
    {
      simcName: "frostbane",
      displayNameEn: "Frostbane",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:15002 talent.frost.frostbane = find_talent_spell( talent_tree::SPECIALIZATION, "Frostbane" ); the pinned Frost list reads it',
    },
    {
      simcName: "obliteration",
      displayNameEn: "Obliteration",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14995 talent.frost.obliteration = find_talent_spell( talent_tree::SPECIALIZATION, "Obliteration" ); the pinned Frost list reads it',
    },
    {
      simcName: "gathering_storm",
      displayNameEn: "Gathering Storm",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14974 talent.frost.gathering_storm = find_talent_spell( talent_tree::SPECIALIZATION, "Gathering Storm" ); the pinned Frost list reads it',
    },
    {
      simcName: "icy_onslaught",
      displayNameEn: "Icy Onslaught",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14973 talent.frost.icy_onslaught = find_talent_spell( talent_tree::SPECIALIZATION, "Icy Onslaught" ); the pinned Frost list reads it',
    },
    {
      simcName: "killing_streak",
      displayNameEn: "Killing Streak",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:15000 talent.frost.killing_streak = find_talent_spell( talent_tree::SPECIALIZATION, "Killing Streak" ); the pinned Frost list reads it',
    },
    {
      simcName: "bonegrinder",
      displayNameEn: "Bonegrinder",
      tree: "SPECIALIZATION",
      binding:
        'sc_death_knight.cpp:14990 talent.frost.bonegrinder = find_talent_spell( talent_tree::SPECIALIZATION, "Bonegrinder" ); the pinned Frost list reads it',
    },
    {
      simcName: "raise_dead",
      displayNameEn: "Raise Dead",
      tree: "CLASS",
      binding:
        'sc_death_knight.cpp:14844 talent.raise_dead = find_talent_spell( talent_tree::CLASS, "Raise Dead" ); raise_dead_t is built on it for Frost, which has no spec.raise_dead (:12218-12220)',
    },
    {
      simcName: "reapers_mark",
      displayNameEn: "Reaper's Mark",
      tree: "HERO",
      binding:
        'sc_death_knight.cpp:15083 talent.deathbringer.reapers_mark = find_talent_spell( talent_tree::HERO, "Reaper\'s Mark" ); reapers_mark_t is built on it (:8490-8491)',
    },
    {
      simcName: "deathly_blows",
      displayNameEn: "Deathly Blows",
      tree: "HERO",
      binding:
        'sc_death_knight.cpp:15092 talent.deathbringer.deathly_blows = find_talent_spell( talent_tree::HERO, "Deathly Blows" ); the pinned Frost list reads it',
    },
    {
      simcName: "apocalypse_now",
      displayNameEn: "Apocalypse Now",
      tree: "HERO",
      binding:
        'sc_death_knight.cpp:15080 talent.rider.apocalypse_now = find_talent_spell( talent_tree::HERO, "Apocalypse Now" ); the pinned Frost list reads it',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4399, :4400).
    { simcName: "rider_of_the_apocalypse", subTreeId: 32 },
    { simcName: "deathbringer", subTreeId: 33 },
  ],
};

/**
 * The Enhancement Shaman profile (ONB-B2): the talents the pinned list reads and the talents an
 * action is built on. `storm_unleashed` is NOT here, for the reason Frost leaves out
 * `chosen_of_frostbrood`. No retained capture holds an Enhancement combatantinfo, so the id-space
 * claim is not corroborated for this specialization.
 */
const SHAMAN_ENHANCEMENT_TARGET = {
  datasetId: "SIMC_TRAIT_SHAMAN_ENHANCEMENT_TALENTS",
  classId: 7,
  specId: 263,
  defaultOut: "src/data/game/shaman-enhancement-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. That `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals " +
    "trait_data_t::id_node is NOT corroborated for Enhancement Shaman: no retained capture holds one of its combatantinfo events. It is corroborated for other specializations of the same parser version.",
  requiredTalents: [
    {
      simcName: "voltaic_blaze",
      displayNameEn: "Voltaic Blaze",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11237 { talent.voltaic_blaze, "Voltaic Blaze" }; voltaic_blaze_t is built on it (:10111-10112)',
    },
    {
      simcName: "sundering",
      displayNameEn: "Sundering",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11251 { talent.sundering, "Sundering" }; sundering_t is built on it (:5708-5709), and the pinned Enhancement list reads it',
    },
    {
      simcName: "doom_winds",
      displayNameEn: "Doom Winds",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11250 { talent.doom_winds, "Doom Winds" }; doom_winds_t is built on it (:8795-8796), and the pinned Enhancement list reads it',
    },
    {
      simcName: "crash_lightning",
      displayNameEn: "Crash Lightning",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11224 { talent.crash_lightning, "Crash Lightning" }; crash_lightning_t is built on it (:5926-5927)',
    },
    {
      simcName: "ascendance",
      displayNameEn: "Ascendance",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11202 { talent.ascendance, "Ascendance" }; the pinned Enhancement list reads it; ascendance_t is not built on it, but its ready() reads it (:8686-8691). A CHOICE node with Deeply Rooted Elements',
    },
    {
      simcName: "primordial_storm",
      displayNameEn: "Primordial Storm",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11262 { talent.primordial_storm, "Primordial Storm" }; the pinned list names the action; primordial_storm_t is not built on it',
    },
    {
      simcName: "surging_elements",
      displayNameEn: "Surging Elements",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11257 { talent.surging_elements, "Surging Elements" }; the pinned Enhancement list reads it',
    },
    {
      simcName: "feral_spirit",
      displayNameEn: "Feral Spirit",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11256 { talent.feral_spirit, "Feral Spirit" }; the pinned Enhancement list reads it',
    },
    {
      simcName: "fire_nova",
      displayNameEn: "Fire Nova",
      tree: "SPECIALIZATION",
      binding: 'sc_shaman.cpp:11246 { talent.fire_nova, "Fire Nova" }; the pinned Enhancement list reads it',
    },
    {
      simcName: "thorims_invocation",
      displayNameEn: "Thorim's Invocation",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11261 { talent.thorims_invocation, "Thorim\'s Invocation" }; the pinned Enhancement list reads it',
    },
    {
      simcName: "lashing_flames",
      displayNameEn: "Lashing Flames",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11247 { talent.lashing_flames, "Lashing Flames" }; the pinned Enhancement list reads it',
    },
    {
      simcName: "elemental_tempo",
      displayNameEn: "Elemental Tempo",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11238 { talent.elemental_tempo, "Elemental Tempo" }; the pinned Enhancement list reads it',
    },
    {
      simcName: "deeply_rooted_elements",
      displayNameEn: "Deeply Rooted Elements",
      tree: "SPECIALIZATION",
      binding:
        'sc_shaman.cpp:11260 { talent.deeply_rooted_elements, "Deeply Rooted Elements" }; the pinned Enhancement list reads it. A CHOICE node with Ascendance',
    },
    {
      simcName: "lava_lash",
      displayNameEn: "Lava Lash",
      tree: "CLASS",
      binding:
        'sc_shaman.cpp:11153 talent.lava_lash = _CT( "Lava Lash" ); lava_lash_t is built on it (:5167-5168)',
    },
    {
      simcName: "chain_lightning",
      displayNameEn: "Chain Lightning",
      tree: "CLASS",
      binding:
        'sc_shaman.cpp:11154 talent.chain_lightning = _CT( "Chain Lightning" ); chain_lightning_t is built on it (:6463-6464)',
    },
    {
      simcName: "surging_totem",
      displayNameEn: "Surging Totem",
      tree: "HERO",
      binding:
        'sc_shaman.cpp:11292 { talent.surging_totem, "Surging Totem" }; the pinned Enhancement list reads it, and it picks the single-target list',
    },
    {
      simcName: "splitstream",
      displayNameEn: "Splitstream",
      tree: "HERO",
      binding:
        'sc_shaman.cpp:11300 { talent.splitstream, "Splitstream" }; the pinned Enhancement list reads it',
    },
    {
      simcName: "tempest",
      displayNameEn: "Tempest",
      tree: "HERO",
      binding:
        'sc_shaman.cpp:11268 { talent.tempest, "Tempest" }; a Stormbringer talent the hero tree resolves against, and tempest_t is not built on it',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4418, :4419).
    { simcName: "totemic", subTreeId: 54 },
    { simcName: "stormbringer", subTreeId: 55 },
  ],
};

/**
 * The Arms Warrior profile (ONB-B1): (a) the talents the pinned Arms list reads as
 * `talent.<name>`, and (b) the talents an action of that list is built on (an action on
 * `not_found()` is background, action.cpp:541-549).
 */
const WARRIOR_ARMS_TARGET = {
  datasetId: "SIMC_TRAIT_WARRIOR_ARMS_TALENTS",
  classId: 1,
  specId: 71,
  defaultOut: "src/data/game/warrior-arms-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. That `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals " +
    "trait_data_t::id_node is corroborated for Arms Warrior on one real subject: every entry of b1PmaKrd6CDfzngc fight 48 actor 5's combatantinfo names a pinned row.",
  requiredTalents: [
    {
      simcName: "mortal_strike",
      displayNameEn: "Mortal Strike",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7593 talents.arms.mortal_strike = find_talent_spell( SPECIALIZATION, "Mortal Strike" ); mortal_strike_t is built on it (:3024-3025)',
    },
    {
      simcName: "overpower",
      displayNameEn: "Overpower",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7595 talents.arms.overpower = find_talent_spell( SPECIALIZATION, "Overpower" ); overpower_t is built on it (:5430-5431)',
    },
    {
      simcName: "colossus_smash",
      displayNameEn: "Colossus Smash",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7608 talents.arms.colossus_smash = find_talent_spell( SPECIALIZATION, "Colossus Smash" ); colossus_smash_t is built on it (:3735-3736)',
    },
    {
      simcName: "cleave",
      displayNameEn: "Cleave",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7618 talents.arms.cleave = find_talent_spell( SPECIALIZATION, "Cleave" ); cleave_t is built on it (:3620-3621), and the pinned list reads talent.cleave',
    },
    {
      simcName: "avatar",
      displayNameEn: "Avatar",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7643 talents.arms.avatar = find_talent_spell( SPECIALIZATION, "Avatar", WARRIOR_ARMS ); avatar_t is built on talents.shared.avatar (:7304, :7928), and precombat reads talent.avatar',
    },
    {
      simcName: "bladestorm",
      displayNameEn: "Bladestorm",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7632 talents.arms.bladestorm = find_talent_spell( SPECIALIZATION, "Bladestorm", WARRIOR_ARMS ); bladestorm_t is built on talents.shared.bladestorm (:7316, :7929). A CHOICE node with Ravager',
    },
    {
      simcName: "ravager",
      displayNameEn: "Ravager",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7633 talents.arms.ravager = find_talent_spell( SPECIALIZATION, "Ravager", WARRIOR_ARMS ); ravager_t is built on talents.shared.ravager (:5867-5868, :7931). A CHOICE node with Bladestorm',
    },
    {
      simcName: "massacre",
      displayNameEn: "Massacre",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7626 talents.arms.massacre = find_talent_spell( SPECIALIZATION, "Massacre", WARRIOR_ARMS ); the pinned list reads talent.massacre.enabled',
    },
    {
      simcName: "bloodletting",
      displayNameEn: "Bloodletting",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7637 talents.arms.bloodletting = find_talent_spell( SPECIALIZATION, "Bloodletting" ); the pinned list reads talent.bloodletting',
    },
    {
      simcName: "dreadnaught",
      displayNameEn: "Dreadnaught",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7622 talents.arms.dreadnaught = find_talent_spell( SPECIALIZATION, "Dreadnaught" ); the pinned list reads talent.dreadnaught',
    },
    {
      simcName: "fervor_of_battle",
      displayNameEn: "Fervor of Battle",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7605 talents.arms.fervor_of_battle = find_talent_spell( SPECIALIZATION, "Fervor of Battle" ); the pinned list reads talent.fervor_of_battle',
    },
    {
      simcName: "tactical_edge",
      displayNameEn: "Tactical Edge",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7624 talents.arms.tactical_edge = find_talent_spell( SPECIALIZATION, "Tactical Edge" ); the pinned list reads talent.tactical_edge. A CHOICE node with Crushing Combo',
    },
    {
      simcName: "deep_wounds",
      displayNameEn: "Deep Wounds",
      tree: "SPECIALIZATION",
      binding:
        'sc_warrior.cpp:7623 talents.arms.deep_wounds = find_talent_spell( SPECIALIZATION, "Deep Wounds", WARRIOR_ARMS ); the pinned list reads talent.deep_wounds',
    },
    {
      simcName: "rend",
      displayNameEn: "Rend",
      tree: "CLASS",
      binding:
        'sc_warrior.cpp:7546 talents.warrior.rend = find_talent_spell( CLASS, "Rend" ); rend_t is built on it (:2291-2292), and the pinned list reads talent.rend',
    },
    {
      simcName: "champions_spear",
      displayNameEn: "Champion's Spear",
      tree: "CLASS",
      binding:
        'sc_warrior.cpp:7587 talents.warrior.champions_spear = find_talent_spell( CLASS, "Champion\'s Spear" ); champions_spear_t is built on it (:6846-6847)',
    },
    {
      simcName: "wrecking_throw",
      displayNameEn: "Wrecking Throw",
      tree: "CLASS",
      binding:
        'sc_warrior.cpp:7562 talents.warrior.wrecking_throw = find_talent_spell( CLASS, "Wrecking Throw" ); wrecking_throw_t is built on it (:6783-6784). A CHOICE node with Shattering Throw',
    },
    {
      simcName: "shattering_throw",
      displayNameEn: "Shattering Throw",
      tree: "CLASS",
      binding:
        'sc_warrior.cpp:7563 talents.warrior.shattering_throw = find_talent_spell( CLASS, "Shattering Throw" ); a CHOICE node with Wrecking Throw, pinned so that node resolves',
    },
    {
      simcName: "storm_bolt",
      displayNameEn: "Storm Bolt",
      tree: "CLASS",
      binding:
        'sc_warrior.cpp:7544 talents.warrior.storm_bolt = find_talent_spell( CLASS, "Storm Bolt" ); storm_bolt_t is built on it (:6403-6404)',
    },
    {
      simcName: "demolish",
      displayNameEn: "Demolish",
      tree: "HERO",
      binding:
        'sc_warrior.cpp:7766 talents.colossus.demolish = find_talent_spell( HERO, "Demolish" ); demolish_t is built on it (:3857-3858), and the pinned list reads talent.demolish',
    },
    {
      simcName: "slayers_dominance",
      displayNameEn: "Slayer's Dominance",
      tree: "HERO",
      binding:
        'sc_warrior.cpp:7785 talents.slayer.slayers_dominance = find_talent_spell( HERO, "Slayer\'s Dominance" ); the pinned list reads talent.slayers_dominance',
    },
    {
      simcName: "opportunist",
      displayNameEn: "Opportunist",
      tree: "HERO",
      binding:
        'sc_warrior.cpp:7795 talents.slayer.opportunist = find_talent_spell( HERO, "Opportunist" ); the pinned list reads talent.opportunist. A CHOICE node with Fierce Followthrough',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4424, :4426).
    { simcName: "slayer", subTreeId: 60 },
    { simcName: "colossus", subTreeId: 62 },
  ],
};

/**
 * Devourer Demon Hunter (ONB-B3). The hero sub-trees are Annihilator (124) and Void-Scarred (126).
 * The three-entry tiered "Midnight" node is left out: `apex.1` stays unmodelled and UNKNOWN.
 */
const DEMONHUNTER_DEVOURER_TARGET = {
  datasetId: "SIMC_TRAIT_DEMONHUNTER_DEVOURER_TALENTS",
  classId: 12,
  specId: 1480,
  defaultOut: "src/data/game/demonhunter-devourer-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. That `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals " +
    "trait_data_t::id_node is corroborated for Devourer on three real subjects: gtKb2xHn87pNcFfW fight 22 actor 32 and rXAfw9t1q8YpmkKD fight 13 actors 20 and 79. All 229 of their entries are pinned rows of class 12.",
  requiredTalents: [
    {
      simcName: "the_hunt",
      displayNameEn: "The Hunt",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:10973 talent.devourer.the_hunt = find_talent_spell( SPECIALIZATION, "The Hunt" ); the pinned list dispatches on talent.the_hunt, and the_hunt_t is built on it (:5612, :11285)',
    },
    {
      simcName: "eradicate",
      displayNameEn: "Eradicate",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:10976 talent.devourer.eradicate = find_talent_spell( SPECIALIZATION, "Eradicate" ); the pinned list reads talent.eradicate, and eradicate_t is built on spec.eradicate = talent_spell_lookup( talent.devourer.eradicate, 1225826 ) (:6143, :11196)',
    },
    {
      simcName: "collapsing_star",
      displayNameEn: "Collapsing Star",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:10940 talent.devourer.collapsing_star = find_talent_spell( SPECIALIZATION, "Collapsing Star" ); the pinned list reads talent.collapsing_star. Alone it does not prove the action unbuilt: spec.collapsing_star_spell also opens on talent.devourer.midnight3 (:11208-11209)',
    },
    {
      simcName: "star_fragments",
      displayNameEn: "Star Fragments",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:10971 talent.devourer.star_fragments = find_talent_spell( SPECIALIZATION, "Star Fragments" ); the pinned list reads talent.star_fragments',
    },
    {
      simcName: "devourers_bite",
      displayNameEn: "Devourer's Bite",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:10968 talent.devourer.devourers_bite = find_talent_spell( SPECIALIZATION, "Devourer\'s Bite" ); the pinned list reads talent.devourers_bite',
    },
    {
      simcName: "scythes_embrace",
      displayNameEn: "Scythe's Embrace",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:10938 talent.devourer.scythes_embrace = find_talent_spell( SPECIALIZATION, "Scythe\'s Embrace" ); the pinned list reads talent.scythes_embrace. A CHOICE node with Duty Eternal',
    },
    {
      simcName: "duty_eternal",
      displayNameEn: "Duty Eternal",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:10939 talent.devourer.duty_eternal = find_talent_spell( SPECIALIZATION, "Duty Eternal" ); a CHOICE node with Scythe\'s Embrace, pinned so that node resolves',
    },
    {
      simcName: "void_ray",
      displayNameEn: "Void Ray",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:10928 talent.devourer.void_ray = find_talent_spell( SPECIALIZATION, "Void Ray" ); void_ray_t is built on it (:6373)',
    },
    {
      simcName: "soul_immolation",
      displayNameEn: "Soul Immolation",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:10930 talent.devourer.soul_immolation = find_talent_spell( SPECIALIZATION, "Soul Immolation" ); soul_immolation_heal_t is built on it (:5951)',
    },
    {
      simcName: "hungering_slash",
      displayNameEn: "Hungering Slash",
      tree: "SPECIALIZATION",
      binding:
        'sc_demon_hunter.cpp:10956 talent.devourer.hungering_slash = find_talent_spell( SPECIALIZATION, "Hungering Slash" ); hungering_slash_t is built on spec.hungering_slash = talent_spell_lookup( talent.devourer.hungering_slash, 1239123 ) (:6808, :11216)',
    },
    {
      simcName: "voidblade",
      displayNameEn: "Voidblade",
      tree: "CLASS",
      binding:
        'sc_demon_hunter.cpp:10870 talent.demon_hunter.voidblade = find_talent_spell( CLASS, "Voidblade" ); voidblade_t is built on it (:5913)',
    },
    {
      simcName: "vengeful_retreat",
      displayNameEn: "Vengeful Retreat",
      tree: "CLASS",
      binding:
        'sc_demon_hunter.cpp:10868 talent.demon_hunter.vengeful_retreat = find_talent_spell( CLASS, "Vengeful Retreat" ); vengeful_retreat_t is built on it (:8588-8589)',
    },
    {
      simcName: "voidfall",
      displayNameEn: "Voidfall",
      tree: "HERO",
      binding:
        'sc_demon_hunter.cpp:11133 talent.annihilator.voidfall = find_talent_spell( HERO, "Voidfall" ); the pinned list reads talent.voidfall',
    },
    {
      simcName: "dark_matter",
      displayNameEn: "Dark Matter",
      tree: "HERO",
      binding:
        'sc_demon_hunter.cpp:11149 talent.annihilator.dark_matter = find_talent_spell( HERO, "Dark Matter" ); an Annihilator talent, pinned so the tree resolves from more than one entry',
    },
    {
      simcName: "voidsurge",
      displayNameEn: "Voidsurge",
      tree: "HERO",
      binding:
        'sc_demon_hunter.cpp:11158 talent.scarred.demonsurge = find_talent_spell( HERO, "Voidsurge" ) for a Devourer; pierce_the_veil_t and reapers_toll_t are built on lookups of it (:11384-11385)',
    },
    {
      simcName: "demonic_intensity",
      displayNameEn: "Demonic Intensity",
      tree: "HERO",
      subTreeId: 126,
      binding:
        'sc_demon_hunter.cpp:11184 talent.scarred.demonic_intensity = HT_FS( "Demonic Intensity" ), the Void-Scarred tree for a Devourer (:11160-11162); predators_wake_t is built on a lookup of it (:11380-11383)',
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4430, :4431).
    { simcName: "annihilator", subTreeId: 124 },
    { simcName: "voidscarred", subTreeId: 126 },
  ],
};

/**
 * Feral Druid (ONB-C1). The hero sub-trees are Druid of the Claw (21) and Wildstalker (22).
 */
const DRUID_FERAL_TARGET = {
  datasetId: "SIMC_TRAIT_DRUID_FERAL_TALENTS",
  classId: 11,
  specId: 103,
  defaultOut: "src/data/game/druid-feral-talents.json",
  wclIdSpaceNote:
    "A Warcraft Logs combatantinfo talentTree entry is { id, rank, nodeID }. That `id` equals trait_data_t::id_trait_node_entry and `nodeID` equals " +
    "trait_data_t::id_node is corroborated for Feral on two real subjects: b1PmaKrd6CDfzngc fight 48 actor 170 and A7R6kxPJ1hC8YQ4w fight 7 actor 1. All 159 of their entries are pinned rows of class 11.",
  requiredTalents: [
    {
      simcName: "berserk_cat",
      displayNameEn: "Berserk",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10441 talent.berserk_cat = ST( "Berserk", DRUID_FERAL ); berserk_cat_t is built on its override when Incarnation is not taken (:3937-3938, :10703)',
    },
    {
      simcName: "incarnation_cat",
      displayNameEn: "Incarnation: Avatar of Ashamane",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10455 talent.incarnation_cat = ST( "Incarnation: Avatar of Ashamane" ); the "berserk" token builds incarnation_cat_t on it (:10162-10163, :3946). A CHOICE node with Convoke the Spirits',
    },
    {
      simcName: "convoke_the_spirits",
      displayNameEn: "Convoke the Spirits",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10383 talent.convoke_the_spirits = ST( "Convoke the Spirits" ); the pinned list reads it and convoke_the_spirits_t is built on it (:9256). A CHOICE node with Incarnation',
    },
    {
      simcName: "frantic_frenzy",
      displayNameEn: "Frantic Frenzy",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10452 talent.frantic_frenzy = ST( "Frantic Frenzy" ); the pinned list reads it and frantic_frenzy_t is built on it (:4084). A CHOICE node with Focused Frenzy',
    },
    {
      simcName: "focused_frenzy",
      displayNameEn: "Focused Frenzy",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10451 talent.focused_frenzy = ST( "Focused Frenzy" ); a CHOICE node with Frantic Frenzy, pinned so that node resolves',
    },
    {
      simcName: "feral_frenzy",
      displayNameEn: "Feral Frenzy",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10450 talent.feral_frenzy = ST( "Feral Frenzy" ); feral_frenzy_t is built on it (:4134)',
    },
    {
      simcName: "chomp",
      displayNameEn: "Chomp",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10445 talent.chomp = ST( "Chomp" ); chomp_t is built on it (:4050). A CHOICE node with Lunar Inspiration',
    },
    {
      simcName: "lunar_inspiration",
      displayNameEn: "Lunar Inspiration",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10458 talent.lunar_inspiration = ST( "Lunar Inspiration" ); the pinned list reads it and lunar_inspiration_t opens on it (:4461-4462). A CHOICE node with Chomp',
    },
    {
      simcName: "apex_predators_craving",
      displayNameEn: "Apex Predator's Craving",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10439 talent.apex_predators_craving = ST( "Apex Predator\'s Craving" ); it produces buff.apex_predators_craving, which the pinned list and maximum_energy() read',
    },
    {
      simcName: "ashamanes_guidance",
      displayNameEn: "Ashamane's Guidance",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10440 talent.ashamanes_guidance = ST( "Ashamane\'s Guidance" ); the pinned list reads talent.ashamanes_guidance',
    },
    {
      simcName: "berserk_heart_of_the_lion",
      displayNameEn: "Berserk: Heart of the Lion",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10442 talent.berserk_heart_of_the_lion = ST( "Berserk: Heart of the Lion" ); the pinned list reads talent.berserk_heart_of_the_lion',
    },
    {
      simcName: "doubleclawed_rake",
      displayNameEn: "Double-Clawed Rake",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10448 talent.doubleclawed_rake = ST( "Double-Clawed Rake" ); the pinned list reads talent.doubleclawed_rake',
    },
    {
      simcName: "panthers_guile",
      displayNameEn: "Panther's Guile",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10462 talent.panthers_guile = ST( "Panther\'s Guile" ); the pinned list reads talent.panthers_guile',
    },
    {
      simcName: "primal_wrath",
      displayNameEn: "Primal Wrath",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10464 talent.primal_wrath = ST( "Primal Wrath" ); the pinned list reads it and primal_wrath_t is built on it (:4743)',
    },
    {
      simcName: "rampant_ferocity",
      displayNameEn: "Rampant Ferocity",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10467 talent.rampant_ferocity = ST( "Rampant Ferocity" ); the pinned list reads talent.rampant_ferocity',
    },
    {
      simcName: "merciless_claws",
      displayNameEn: "Merciless Claws",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10459 talent.merciless_claws = ST( "Merciless Claws" ); the precombat list reads talent.merciless_claws',
    },
    {
      simcName: "wild_slashes",
      displayNameEn: "Wild Slashes",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10482 talent.wild_slashes = ST( "Wild Slashes" ); the precombat list reads talent.wild_slashes',
    },
    {
      simcName: "tigers_fury",
      displayNameEn: "Tiger's Fury",
      tree: "SPECIALIZATION",
      binding:
        'sc_druid.cpp:10475 talent.tigers_fury = ST( "Tiger\'s Fury" ); tigers_fury_t is built on it (:4857)',
    },
    {
      simcName: "fluid_form",
      displayNameEn: "Fluid Form",
      tree: "CLASS",
      binding:
        'sc_druid.cpp:10326 talent.fluid_form = CT( "Fluid Form" ); the pinned list reads talent.fluid_form',
    },
    {
      simcName: "rake",
      displayNameEn: "Rake",
      tree: "CLASS",
      binding: 'sc_druid.cpp:10358 talent.rake = CT( "Rake" ); rake_t is built on it (:4551)',
    },
    {
      simcName: "rip",
      displayNameEn: "Rip",
      tree: "CLASS",
      binding: 'sc_druid.cpp:10361 talent.rip = CT( "Rip" ); rip_t is built on it (:4656)',
    },
    {
      simcName: "swipe",
      displayNameEn: "Swipe",
      tree: "CLASS",
      binding:
        'sc_druid.cpp:10369 talent.swipe = CT( "Swipe" ); swipe_cat_t is built on an override of it (:4839)',
    },
    {
      simcName: "ravage",
      displayNameEn: "Ravage",
      tree: "HERO",
      binding:
        "a Druid of the Claw talent, pinned so the tree resolves from an entry (trait_data.inc sub-tree 21)",
    },
    {
      simcName: "wildpower_surge",
      displayNameEn: "Wildpower Surge",
      tree: "HERO",
      binding:
        "a Druid of the Claw talent, pinned so the tree resolves from more than one entry (sub-tree 21)",
    },
    {
      simcName: "thriving_growth",
      displayNameEn: "Thriving Growth",
      tree: "HERO",
      binding: "a Wildstalker talent, pinned so the tree resolves from an entry (sub-tree 22)",
    },
    {
      simcName: "bursting_growth",
      displayNameEn: "Bursting Growth",
      tree: "HERO",
      binding: "a Wildstalker talent, pinned so the tree resolves from more than one entry (sub-tree 22)",
    },
  ],
  heroTrees: [
    // `__trait_sub_tree_data` (trait_data.inc:4394, :4395).
    { simcName: "druid_of_the_claw", subTreeId: 21 },
    { simcName: "wildstalker", subTreeId: 22 },
  ],
};

export const TARGETS = {
  "deathknight-blood": DEATHKNIGHT_BLOOD_TARGET,
  "demonhunter-havoc": DEMONHUNTER_HAVOC_TARGET,
  "druid-feral": DRUID_FERAL_TARGET,
  "demonhunter-devourer": DEMONHUNTER_DEVOURER_TARGET,
  "deathknight-frost": DEATHKNIGHT_FROST_TARGET,
  "shaman-enhancement": SHAMAN_ENHANCEMENT_TARGET,
  "warrior-arms": WARRIOR_ARMS_TARGET,
  "warrior-fury": WARRIOR_FURY_TARGET,
  "warrior-protection": WARRIOR_PROTECTION_TARGET,
  "rogue-outlaw": ROGUE_OUTLAW_TARGET,
  "shaman-elemental": SHAMAN_ELEMENTAL_TARGET,
  "druid-balance": DRUID_BALANCE_TARGET,
  "priest-shadow": PRIEST_SHADOW_TARGET,
  "warlock-destruction": WARLOCK_DESTRUCTION_TARGET,
  "rogue-subtlety": ROGUE_SUBTLETY_TARGET,
  "monk-brewmaster": MONK_BREWMASTER_TARGET,
  "paladin-retribution": PALADIN_RETRIBUTION_TARGET,
  "rogue-assassination": ROGUE_ASSASSINATION_TARGET,
  "paladin-protection": PALADIN_PROTECTION_TARGET,
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

export function sourceHashProblem(path, expectedSha256, actualSha256) {
  if (typeof expectedSha256 !== "string") return null;
  if (expectedSha256 === actualSha256) return null;
  return `${path} SHA-256 mismatch\n  expected ${expectedSha256}\n  actual   ${actualSha256}`;
}

/**
 * Verifies the `trait_data_t` field order the row parser assumes.
 *
 * Same guard as the GCD extractor's `_gcd` index check: an upstream field
 * inserted before `id_node` would shift every column silently.
 */
export function verifyTraitFieldOrder(headerText) {
  const expected = [
    "tree_index",
    "id_class",
    "id_trait_node_entry",
    "id_node",
    "max_ranks",
    "req_points",
    "id_trait_definition",
    "id_spell",
    "id_replace_spell",
    "id_override_spell",
    "row",
    "col",
    "selection_index",
    "name",
  ];

  const lines = headerText.split(/\r?\n/);
  let bodyStart = -1;
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i]?.trim() !== "struct trait_data_t") continue;
    if (lines[i + 1]?.trim() === "{") {
      bodyStart = i + 2;
      break;
    }
  }
  if (bodyStart < 0) return { ok: false, error: "trait_data.hpp does not define struct trait_data_t" };

  const member =
    /^\s*(?:const\s+)?[A-Za-z_][A-Za-z0-9_:<>,\s]*?\*?\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\[[^\]]*\])?\s*;/;
  const fields = [];
  for (let i = bodyStart; i < lines.length; i += 1) {
    const line = (lines[i] ?? "").replace(/\/\/.*$/, "");
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.includes("(")) break;
    const match = member.exec(line);
    if (match === null) continue;
    fields.push(match[1]);
    if (fields.length === expected.length) break;
  }

  for (let i = 0; i < expected.length; i += 1) {
    if (fields[i] !== expected[i]) {
      return {
        ok: false,
        error:
          `trait_data_t field ${i} is '${String(fields[i])}', expected '${String(expected[i])}'. ` +
          "The struct layout moved; do not adjust the row parser without re-verifying every value.",
      };
    }
  }
  return { ok: true, fields };
}

/**
 * Parses the generated `__trait_data_data` rows.
 *
 * Anchored on the two brace-delimited spec arrays, which is what separates the
 * leading scalars and the name from the trailing `id_sub_tree` / `node_type`.
 */
export function parseTraitRows(text) {
  const rows = [];
  const pattern =
    /^\s*\{\s*(.+?),\s*"((?:[^"\\]|\\.)*)"\s*,\s*\{([^}]*)\}\s*,\s*\{([^}]*)\}\s*,\s*(\d+)\s*,\s*(\d+)\s*\}\s*,?\s*$/;

  for (const line of text.split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (match === null) continue;
    const scalars = match[1].split(",").map((part) => part.trim());
    if (scalars.length !== 13) continue;
    const [treeIndex, classId, entryId, nodeId, maxRanks, , definitionId, spellId, , , , , selectionIndex] =
      scalars.map((v) => Number.parseInt(v, 10));
    if (!Number.isSafeInteger(entryId) || !Number.isSafeInteger(nodeId)) continue;

    rows.push({
      treeIndex,
      classId,
      traitEntryId: entryId,
      traitNodeId: nodeId,
      maxRanks,
      traitDefinitionId: definitionId,
      talentSpellId: spellId,
      displayNameEn: match[2],
      specIds: match[3]
        .split(",")
        .map((v) => Number.parseInt(v.trim(), 10))
        .filter((v) => Number.isSafeInteger(v) && v > 0),
      idSubTree: Number.parseInt(match[5], 10),
      nodeType: Number.parseInt(match[6], 10),
      selectionIndex,
    });
  }
  return rows;
}

/**
 * Resolves one required talent to a full record, including its node siblings.
 *
 * Fails loudly on anything ambiguous: a missing talent, a duplicate name in the
 * same tree, or a node whose siblings cannot be enumerated.
 */
export function resolveTalent(rows, required, target = ROGUE_ASSASSINATION_TARGET) {
  const treeIndex = TREE_INDEX[required.tree];
  if (treeIndex === undefined) return { ok: false, error: `unknown tree '${required.tree}'` };

  // A class-tree talent can have one row PER SPECIALIZATION (Divine Toll has
  // three), each scoped by `id_spec`. Only a row available to this target's
  // specialization — or scoped to none, i.e. class-wide — can be the one
  // `find_talent_spell` resolves for it, so the others are not candidates.
  const matches = rows.filter(
    (row) =>
      row.classId === target.classId &&
      row.treeIndex === treeIndex &&
      row.displayNameEn === required.displayNameEn &&
      (row.specIds.length === 0 || row.specIds.includes(target.specId)) &&
      // Devourer: two hero sub-trees can each hold a row of one name, both open to the spec (Demonic Intensity
      // in Fel-Scarred and Void-Scarred). The module names the tree (`HT_FS`, sc_demon_hunter.cpp:11160-11162), so the target does too.
      (required.subTreeId === undefined || row.idSubTree === required.subTreeId),
  );
  if (matches.length === 0) {
    return { ok: false, error: `talent '${required.displayNameEn}' not found in the ${required.tree} tree` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: `talent '${required.displayNameEn}' matches ${String(matches.length)} rows and is ambiguous`,
    };
  }
  const talent = matches[0];

  // Spec-tree talents must be available to Assassination. A row scoped to other
  // specs would mean this binding does not apply to the analyzed player.
  if (treeIndex === TREE_INDEX.SPECIALIZATION && !talent.specIds.includes(target.specId)) {
    return {
      ok: false,
      error: `talent '${required.displayNameEn}' is not available to spec ${String(target.specId)}`,
    };
  }

  const siblings = rows.filter(
    (row) =>
      row.classId === target.classId &&
      row.traitNodeId === talent.traitNodeId &&
      row.traitEntryId !== talent.traitEntryId,
  );

  // A choice node MUST have siblings, and a normal node must not. If that ever
  // stops holding, the selection rule this artifact feeds is not the right one.
  const isChoice = talent.nodeType === NODE_TYPE.CHOICE;
  if (isChoice && siblings.length === 0) {
    return { ok: false, error: `'${required.displayNameEn}' is a choice node with no alternative entries` };
  }
  if (!isChoice && siblings.length > 0) {
    return {
      ok: false,
      error: `'${required.displayNameEn}' is node_type ${String(talent.nodeType)} but shares its node with ${String(siblings.length)} other entries`,
    };
  }

  return {
    ok: true,
    talent: {
      simcName: required.simcName,
      displayNameEn: talent.displayNameEn,
      tree: required.tree,
      traitNodeId: talent.traitNodeId,
      traitEntryId: talent.traitEntryId,
      talentSpellId: talent.talentSpellId,
      nodeType: isChoice ? "CHOICE" : "NORMAL",
      alternativeEntries: siblings
        .map((row) => ({
          traitEntryId: row.traitEntryId,
          displayNameEn: row.displayNameEn,
          talentSpellId: row.talentSpellId,
        }))
        .sort((left, right) => left.traitEntryId - right.traitEntryId),
      binding: required.binding,
    },
  };
}

/**
 * Every HERO-tree entry of one sub-tree available to the target's spec.
 *
 * Membership is what `hero_tree.<name>` needs: an observed entry belongs to
 * exactly one sub-tree, and the table says which. Fails on an empty sub-tree,
 * because a name with no entries could never be resolved and would silently
 * make every hero-tree question UNKNOWN.
 */
export function resolveHeroTree(rows, declared, target) {
  const entries = rows
    .filter(
      (row) =>
        row.classId === target.classId &&
        row.treeIndex === TREE_INDEX.HERO &&
        row.idSubTree === declared.subTreeId &&
        // A row scoped to no specialization is class-wide (player.cpp:2778, :2898), which is how the
        // pinned table holds all of Annihilator's rows, exactly as `resolveTalent` reads it.
        (row.specIds.length === 0 || row.specIds.includes(target.specId)),
    )
    .map((row) => ({
      traitEntryId: row.traitEntryId,
      traitNodeId: row.traitNodeId,
      displayNameEn: row.displayNameEn,
      talentSpellId: row.talentSpellId,
    }))
    .sort((left, right) => left.traitEntryId - right.traitEntryId);
  if (entries.length === 0) {
    return {
      ok: false,
      error: `hero sub-tree ${String(declared.subTreeId)} ('${declared.simcName}') has no entries for spec ${String(target.specId)}`,
    };
  }
  return { ok: true, heroTree: { simcName: declared.simcName, subTreeId: declared.subTreeId, entries } };
}

/**
 * The NODE_TIERED spec-tree traits for the target's spec, IN TABLE ORDER.
 *
 * This is the exact list `player_t::create_expression` builds for `apex.N`
 * (player.cpp:12313-12331): every SPECIALIZATION-tree trait of the class whose
 * node_type is NODE_TIERED and whose id_spec contains the specialization, in
 * the order `trait_data_t::data( class, SPECIALIZATION )` yields them — the
 * generated array's own order (trait_data.cpp:33-38 is an equal_range over a
 * sorted array, which preserves it). `apexIndex` is the 1-based N.
 */
export function resolveApexTraits(rows, target) {
  const traits = rows
    .filter(
      (row) =>
        row.classId === target.classId &&
        row.treeIndex === TREE_INDEX.SPECIALIZATION &&
        row.nodeType === NODE_TYPE.TIERED &&
        row.specIds.includes(target.specId),
    )
    .map((row, index) => ({
      apexIndex: index + 1,
      traitEntryId: row.traitEntryId,
      traitNodeId: row.traitNodeId,
      displayNameEn: row.displayNameEn,
      talentSpellId: row.talentSpellId,
      selectionIndex: row.selectionIndex,
    }));
  if (traits.length === 0) {
    return {
      ok: false,
      error: `no NODE_TIERED specialization traits exist for spec ${String(target.specId)}`,
    };
  }
  return { ok: true, apexTraits: traits };
}

export function parseClientDataVersion(text) {
  const match = /^#define\s+CLIENT_DATA_WOW_VERSION\s+"([^"]+)"\s*$/m.exec(text);
  return match === null ? null : match[1];
}

/** Prettier's `printWidth` for this repository. */
const PRINT_WIDTH = 110;

/** Serialises the artifact the way Prettier would. Shared rule with the GCD extractor. */
export function formatArtifactJson(artifact) {
  const lines = JSON.stringify(artifact, null, 2).split("\n");
  const out = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const opening = /^(\s*(?:"[^"]+":\s*)?)\[$/.exec(line);
    if (opening === null) {
      out.push(line);
      continue;
    }
    const numbers = [];
    let cursor = index + 1;
    let allIntegers = true;
    for (; cursor < lines.length; cursor += 1) {
      const inner = (lines[cursor] ?? "").trim();
      if (inner === "]" || inner === "],") break;
      const element = /^(-?\d+),?$/.exec(inner);
      if (element === null) {
        allIntegers = false;
        break;
      }
      numbers.push(element[1]);
    }
    const closing = (lines[cursor] ?? "").trim();
    if (!allIntegers || numbers.length === 0 || (closing !== "]" && closing !== "],")) {
      out.push(line);
      continue;
    }
    const collapsed = `${opening[1]}[${numbers.join(", ")}${closing}`;
    if (collapsed.length > PRINT_WIDTH) {
      out.push(line);
      continue;
    }
    out.push(collapsed);
    index = cursor;
  }
  return `${out.join("\n")}\n`;
}

export function buildArtifact({
  commitSha,
  sources,
  clientDataWowVersion,
  talents,
  extractedOn,
  target = ROGUE_ASSASSINATION_TARGET,
  heroTrees = [],
  apexTraits = null,
}) {
  return {
    artifactVersion: ARTIFACT_VERSION,
    datasetId: target.datasetId,
    artifactRevision: `simc-${commitSha.slice(0, 8)}-${EXTRACTOR_VERSION}`,
    provenance: {
      repository: REPOSITORY,
      commitSha,
      sources,
      clientDataWowVersion,
      talentDataMethod: "MACHINE_EXTRACTED_TRAIT_RECORD",
      extractedOn,
      extractorVersion: EXTRACTOR_VERSION,
      wclIdSpaceNote: target.wclIdSpaceNote,
      applicabilityNote:
        "Not version-gated at runtime. CombatFight exposes no client-build key, so a gate against " +
        "12.1.0.69587 would always pass while appearing rigorous. A client build or talent-tree revision " +
        "moving is a regeneration trigger for a human, not a runtime condition.",
    },
    talents: [...talents].sort((left, right) => left.simcName.localeCompare(right.simcName)),
    // The two M10-C sections are emitted ONLY for a target that declares them,
    // so an artifact without hero trees or apex traits carries no key for them
    // and the Rogue artifact is byte-identical to its pre-M10-C form.
    ...(heroTrees.length === 0
      ? {}
      : { heroTrees: [...heroTrees].sort((left, right) => left.subTreeId - right.subTreeId) }),
    ...(apexTraits === null ? {} : { apexTraits }),
  };
}

// --------------------------------------------------------------------------
// CLI
// --------------------------------------------------------------------------

async function loadSource(args, key, path) {
  const localFlag = `file-${key}`;
  if (typeof args[localFlag] === "string") return readFileSync(args[localFlag]);
  if (typeof args.sha !== "string" || !/^[0-9a-f]{40}$/.test(args.sha)) {
    fail(`--sha must be a full 40-character commit SHA (or pass --${localFlag} for a local copy)`);
  }
  const url = `${REPOSITORY.replace("https://github.com", "https://raw.githubusercontent.com")}/${args.sha}/${path}`;
  const response = await fetch(url, { headers: { "User-Agent": "wlc-vnext-extractor" } });
  if (!response.ok) fail(`could not fetch pinned source (HTTP ${response.status}) from ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetName = typeof args.target === "string" ? args.target : "rogue-assassination";
  const target = TARGETS[targetName];
  if (target === undefined) {
    fail(`unknown --target '${targetName}' (known: ${Object.keys(TARGETS).join(", ")})`);
  }

  const loaded = {};
  const sources = [];
  for (const [key, path] of Object.entries(SOURCES)) {
    const buffer = await loadSource(args, key, path);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const problem = sourceHashProblem(path, args[`expect-${key}-sha256`], sha256);
    if (problem !== null) fail(problem);
    loaded[key] = buffer.toString("utf8");
    sources.push({ path, sha256, byteLength: buffer.length });
  }

  const layout = verifyTraitFieldOrder(loaded.traitLayout);
  if (!layout.ok) fail(layout.error);

  const clientDataWowVersion = parseClientDataVersion(loaded.clientDataVersion);
  if (clientDataWowVersion === null) fail("client_data_version.inc has no CLIENT_DATA_WOW_VERSION");

  const rows = parseTraitRows(loaded.traitData);
  if (rows.length === 0) fail("trait_data.inc yielded no rows; the table format changed");

  const talents = [];
  const problems = [];
  for (const required of target.requiredTalents) {
    const resolved = resolveTalent(rows, required, target);
    if (!resolved.ok) {
      problems.push(resolved.error);
      continue;
    }
    talents.push(resolved.talent);
  }
  const heroTrees = [];
  for (const declared of target.heroTrees) {
    const resolved = resolveHeroTree(rows, declared, target);
    if (!resolved.ok) {
      problems.push(resolved.error);
      continue;
    }
    heroTrees.push(resolved.heroTree);
  }
  let apexTraits = null;
  if (target.apexTraits) {
    const resolved = resolveApexTraits(rows, target);
    if (!resolved.ok) problems.push(resolved.error);
    else apexTraits = resolved.apexTraits;
  }
  if (problems.length > 0) {
    console.error("EXTRACTION FAILED: the pinned trait data does not exhibit the required facts.\n");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("\nDo not rewrite expectations to match. Report the discrepancy.");
    process.exit(1);
  }

  const artifact = buildArtifact({
    commitSha: typeof args.sha === "string" ? args.sha : "UNKNOWN",
    sources,
    clientDataWowVersion,
    talents,
    extractedOn:
      typeof args["extracted-on"] === "string" ? args["extracted-on"] : new Date().toISOString().slice(0, 10),
    target,
    heroTrees,
    apexTraits,
  });

  const outPath = typeof args.out === "string" ? args.out : target.defaultOut;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, formatArtifactJson(artifact), "utf8");

  console.log(`Wrote ${outPath}`);
  console.log(`  commit        ${artifact.provenance.commitSha}`);
  console.log(`  client build  ${artifact.provenance.clientDataWowVersion}`);
  console.log(`  trait rows    ${rows.length}`);
  console.log(`  talents       ${artifact.talents.length}`);
  for (const talent of artifact.talents) {
    const alts = talent.alternativeEntries.map((a) => `${a.displayNameEn}(${a.traitEntryId})`).join(", ");
    console.log(
      `    ${talent.simcName.padEnd(22)} node ${talent.traitNodeId} entry ${talent.traitEntryId} ` +
        `${talent.nodeType}${alts.length > 0 ? ` alt: ${alts}` : ""}`,
    );
  }
  for (const tree of artifact.heroTrees ?? []) {
    console.log(
      `    hero tree ${tree.simcName.padEnd(12)} sub-tree ${tree.subTreeId} entries ${tree.entries.length}`,
    );
  }
  for (const apex of artifact.apexTraits ?? []) {
    console.log(
      `    apex.${apex.apexIndex} ${apex.displayNameEn} entry ${apex.traitEntryId} node ${apex.traitNodeId} sel ${apex.selectionIndex}`,
    );
  }
  console.log("  required facts: VERIFIED");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
