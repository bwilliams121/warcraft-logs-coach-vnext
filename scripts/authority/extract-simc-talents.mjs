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

export const TARGETS = {
  "deathknight-blood": DEATHKNIGHT_BLOOD_TARGET,
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
      (row.specIds.length === 0 || row.specIds.includes(target.specId)),
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
        row.specIds.includes(target.specId),
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
