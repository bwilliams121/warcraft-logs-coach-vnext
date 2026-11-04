#!/usr/bin/env node
/**
 * Deterministic SimulationCraft GCD-semantics extractor.
 *
 * Reads FOUR files from ONE pinned SimulationCraft commit and emits the Rogue
 * ability GCD-semantics artifact. Run manually; never at runtime. The analyzer
 * has no network dependency on GitHub — it imports the committed JSON this
 * produces.
 *
 * WHY THIS EXISTS
 *
 * SimulationCraft decides whether an executed foreground action consumes the
 * player's rotational GCD slot with exactly one predicate:
 *
 *     player.cpp:7397   if ( action->trigger_gcd > timespan_t::zero() )
 *                         prev_gcd_actions.push_back( action );
 *                       else
 *                         off_gcdactions.push_back( action );
 *
 * and `trigger_gcd` for a spell-backed action comes straight from spell data:
 *
 *     action.cpp:645    trigger_gcd = spell_data.gcd();
 *     spell_data.hpp:558  timespan_t gcd() const { return timespan_t::from_millis( _gcd ); }
 *     spell_data.hpp:461  unsigned _gcd;   // GCD in milliseconds
 *
 * So the whole runtime primitive is `_gcd`, in milliseconds, per numeric spell
 * id. This extractor reads it from the generated DBC table at the pinned commit
 * rather than from anyone's memory of what a spell does.
 *
 * FAIL CLOSED IS THE WHOLE POINT.
 *
 * - every input file's SHA-256 may be pinned with --expect-*-sha256
 * - the `_gcd` column index is DERIVED from the struct declaration in
 *   spell_data.hpp and checked against the constant this parser uses, so an
 *   upstream field insertion fails loudly instead of silently reading the
 *   neighbouring column
 * - two independently known GCD values are re-measured as sanity anchors
 * - a required id that is missing, or present twice, is a hard failure
 * - class-ability token bindings are cross-checked against class_spells.inc
 * - every extracted value is compared against the recorded expectation
 *
 *   node scripts/authority/extract-simc-gcd.mjs \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --out src/data/game/rogue-gcd-semantics.json
 *
 * TARGETS (M10-C). `--target` selects one specialization profile: its dataset
 * id, class id, the class module(s) whose hand-reviewed readings the token
 * bindings cite, and its required facts. The default is `rogue-assassination`,
 * so every invocation recorded before M10-C regenerates the Rogue artifact
 * byte for byte. `paladin-protection` reads the same DBC tables and cites
 * `sc_paladin.cpp` / `sc_paladin_protection.cpp` / `racial_spells.inc`
 * instead of `sc_rogue.cpp`. A target is coordinates and facts, never a
 * different parser.
 *
 *   node scripts/authority/extract-simc-gcd.mjs --target paladin-protection \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --out src/data/game/paladin-protection-gcd-semantics.json
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;
const DATASET_ID = "SIMC_DBC_ROGUE_GCD_SEMANTICS";

/** SimulationCraft's own class id for Rogue, as used by class_spells.inc rows. */
const ROGUE_CLASS_ID = 4;

/**
 * The flat field index of `_gcd`, counting from `_id` (the first field after the
 * name string literal) in a generated `__spell_data` row.
 *
 * NOT trusted. `deriveGcdFieldIndex` recomputes it from the struct declaration
 * in spell_data.hpp and extraction aborts on disagreement.
 */
const GCD_FIELD_INDEX = 16;

/**
 * The pinned inputs, and what each one is FOR.
 *
 * `rogueModule` is loaded and hashed but deliberately NEVER PARSED. It is the
 * C++ that establishes which spell record an APL token binds to, and that
 * relation is read by a human, not by this script. Hashing it is what makes the
 * hand-reviewed reading auditable: the recorded hash is measured from the file,
 * not copied from a note, so a reviewer can re-read the exact bytes the binding
 * was derived from.
 */
const SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  rogueModule: "engine/class_modules/sc_rogue.cpp",
  // HASHED, NEVER PARSED. The meta-action lanes and the racial token bindings
  // are hand-reviewed readings of these two files; the hashes exist so a reader
  // can confirm they are reading the same bytes the readings rest on.
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

/**
 * How a token -> spell-id relation was established.
 *
 * The artifact carries TWO kinds of knowledge and must never let a reader
 * confuse them:
 *
 *   token  -> candidate spell ids   HAND_REVIEWED_CPP_CONTROL_FLOW
 *   spell id -> baseGcdMs           MACHINE_EXTRACTED_DBC_RECORD
 *
 * The first is a human reading C++ control flow. This script does not parse C++
 * and must not present the reading as though it had.
 */
const HAND_REVIEWED_BINDING_METHOD = "HAND_REVIEWED_CPP_CONTROL_FLOW";
const MACHINE_EXTRACTED_METHOD = "MACHINE_EXTRACTED_DBC_RECORD";

/**
 * How a declared spell was resolved to the spell that actually EXECUTES.
 *
 * A FOURTH kind of knowledge, and the one M5-E added. A token can bind to a
 * spell that is never executed: `thistle_tea_auto` (469779) is a TALENT record
 * whose effect TRIGGERS the executed ability (381623). Recording 469779 as an
 * execution candidate claims the player casts a talent, which is wrong even
 * though both records happen to agree on the lane.
 *
 * The trigger relation is MACHINE-EXTRACTED from the generated effect table, so
 * this is not a hand-deletion of an inconvenient id: the resolution is derived,
 * verified against the pinned data, and recorded with the effect index it came
 * from. A future pin that stops exhibiting the relation fails extraction.
 */
const MACHINE_EXTRACTED_TRIGGER_METHOD = "MACHINE_EXTRACTED_EFFECT_TRIGGER";

/**
 * How a META-ACTION's lane was established.
 *
 * A THIRD kind of knowledge, and it needs its own name. `potion`, `use_item`,
 * `use_items` and `invoke_external_buff` are not spell-backed: no DBC row exists
 * for them, so `_gcd` cannot answer the question. Their `trigger_gcd` is
 * assigned literally in a C++ constructor, and a human read it there.
 *
 * Kept separate from HAND_REVIEWED_CPP_CONTROL_FLOW because that method records
 * a token -> SPELL ID relation, whose lane still comes from machine-extracted
 * DBC. This one records a token -> TRIGGER_GCD value directly, with no DBC row
 * behind it at all. Writing a fake DBC record for these would be the dishonest
 * alternative.
 */
const HAND_REVIEWED_TRIGGER_GCD_METHOD = "HAND_REVIEWED_CPP_TRIGGER_GCD";

/**
 * Facts this extractor REQUIRES the pinned data to exhibit.
 *
 * Checked against the extracted values, not against a prompt or a description.
 * If a future pin stops satisfying one of these, extraction fails loudly rather
 * than emitting an artifact whose downstream lane classification would rest on a
 * stale belief.
 */
const REQUIRED_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  /**
   * Independently known GCDs, used as parser sanity anchors.
   *
   * If the column index silently shifted, these would be the first values to go
   * wrong — and they are checkable without reference to anything this milestone
   * is trying to establish.
   */
  sanityAnchors: [
    { abilityGameId: 17, displayNameEn: "Power Word: Shield", baseGcdMs: 1500 },
    { abilityGameId: 53, displayNameEn: "Backstab", baseGcdMs: 1000 },
    { abilityGameId: 116, displayNameEn: "Frostbolt", baseGcdMs: 1500 },
  ],
  /** The nine records the supported Assassination slice needs. */
  abilities: [
    { abilityGameId: 1766, displayNameEn: "Kick", baseGcdMs: 0 },
    { abilityGameId: 1784, displayNameEn: "Stealth", baseGcdMs: 0 },
    { abilityGameId: 1856, displayNameEn: "Vanish", baseGcdMs: 0 },
    { abilityGameId: 8676, displayNameEn: "Ambush", baseGcdMs: 1000 },
    { abilityGameId: 32645, displayNameEn: "Envenom", baseGcdMs: 1000 },
    { abilityGameId: 360194, displayNameEn: "Deathmark", baseGcdMs: 1000 },
    { abilityGameId: 381623, displayNameEn: "Thistle Tea", baseGcdMs: 0 },
    { abilityGameId: 385627, displayNameEn: "Kingsbane", baseGcdMs: 1000 },
    { abilityGameId: 469779, displayNameEn: "Thistle Tea", baseGcdMs: 0 },
    // ---- added at M5-C3c3a: the rest of the root -> Garrote authority path ----
    // Garrote is the eventual first-GCD answer, so its own lane is load-bearing.
    { abilityGameId: 703, displayNameEn: "Garrote", baseGcdMs: 1000 },
    { abilityGameId: 1943, displayNameEn: "Rupture", baseGcdMs: 1000 },
    // The four racials in `misc_cds`. All THREE Blood Fury rows are recorded
    // because the row a Rogue resolves to depends on a class mask this build
    // does not evaluate - and all three agree on the lane, so the token's lane
    // holds under every branch without anyone picking one.
    { abilityGameId: 20572, displayNameEn: "Blood Fury", baseGcdMs: 0 },
    { abilityGameId: 33697, displayNameEn: "Blood Fury", baseGcdMs: 0 },
    { abilityGameId: 33702, displayNameEn: "Blood Fury", baseGcdMs: 0 },
    { abilityGameId: 26297, displayNameEn: "Berserking", baseGcdMs: 0 },
    { abilityGameId: 265221, displayNameEn: "Fireblood", baseGcdMs: 0 },
    { abilityGameId: 274738, displayNameEn: "Ancestral Call", baseGcdMs: 0 },
  ],
  /**
   * SimulationCraft APL token -> the numeric spell ids that token can resolve to.
   *
   * EVERY ENTRY HERE IS A HAND-REVIEWED READING OF PINNED C++. This script does
   * not parse `sc_rogue.cpp` and never will; it hashes it so the reading is
   * auditable, and verifies that each id the reading names is a real record in
   * the machine-extracted spell data.
   *
   * A token is NOT always one spell. `thistle_tea` binds through a talent
   * branch, so it has two reachable records and both are recorded rather than
   * one being picked.
   *
   * `crossCheck: "CLASS_SPELLS"` means the id is additionally confirmed against
   * the generated class-ability table — available only for class abilities, and
   * never a substitute for the C++ reading that says the token uses that spell.
   */
  tokenBindings: [
    {
      simcToken: "kick",
      candidateAbilityGameIds: [1766],
      crossCheck: "CLASS_SPELLS",
      symbol: "rogue_t::init_spells",
      startLine: 9915,
      endLine: 9915,
      sourceNote: 'spell.kick = find_class_spell( "Kick" );',
    },
    {
      simcToken: "stealth",
      candidateAbilityGameIds: [1784],
      crossCheck: "CLASS_SPELLS",
      symbol: "rogue_t::init_spells",
      startLine: 9919,
      endLine: 9919,
      sourceNote: 'spell.stealth = find_class_spell( "Stealth" );',
    },
    {
      simcToken: "vanish",
      candidateAbilityGameIds: [1856],
      crossCheck: "CLASS_SPELLS",
      symbol: "rogue_t::init_spells",
      startLine: 9920,
      endLine: 9920,
      sourceNote: 'spell.vanish = find_class_spell( "Vanish" );',
    },
    {
      simcToken: "ambush",
      candidateAbilityGameIds: [8676],
      crossCheck: "CLASS_SPELLS",
      symbol: "rogue_t::init_spells",
      startLine: 9908,
      endLine: 9908,
      sourceNote: 'spell.ambush = find_class_spell( "Ambush" );',
    },
    {
      simcToken: "envenom",
      candidateAbilityGameIds: [32645],
      crossCheck: "CLASS_SPELLS",
      symbol: "rogue_t::create_action",
      startLine: 9453,
      endLine: 9500,
      sourceNote:
        'create_action dispatches "envenom" to envenom_t; class_spells.inc row { 4, 259, 32645 } confirms the id.',
    },
    {
      simcToken: "thistle_tea",
      // CORRECTED AT M5-E. Both C++ branches resolve to 381623, so that is the
      // only spell that can execute. The talent record 469779 is not deleted —
      // it is declared below as a spell that RESOLVES THROUGH its own effect
      // trigger, and the extractor verifies that against the pinned table.
      candidateAbilityGameIds: [381623],
      triggerResolutions: [
        {
          declaredSpellId: 469779,
          // `effectN( 1 )` is 1-based; the generated table indexes from 0.
          effectIndex: 0,
          expectedTriggerSpellId: 381623,
          note:
            "talent.rogue.thistle_tea_auto is spell 469779. The taken branch calls " +
            "effectN( 1 ).trigger(), so the executed action is the TRIGGERED spell, " +
            "not 469779 itself. The other branch is thistle_tea_ability = 381623 " +
            "directly, so both branches execute 381623.",
        },
      ],
      crossCheck: "NONE_TALENT_BOUND",
      symbol: "rogue_t::init_spells",
      startLine: 10237,
      endLine: 10238,
      sourceNote:
        "spell.thistle_tea = talent.rogue.thistle_tea_auto->ok() " +
        "? talent.rogue.thistle_tea_auto->effectN( 1 ).trigger() " +
        ": ( talent.rogue.thistle_tea_ability->ok() ? talent.rogue.thistle_tea_ability : not_found() ). " +
        "BOTH branches resolve to 381623: the first through the effect trigger of " +
        "469779, the second directly. The talent branch is therefore irrelevant to " +
        "execution identity, and no branch needs to be chosen.",
    },
    // ---- added at M5-C3c3a ----
    {
      simcToken: "garrote",
      candidateAbilityGameIds: [703],
      crossCheck: "CLASS_SPELLS",
      symbol: "rogue_t::create_action / rogue_t::init_spells",
      startLine: 9472,
      endLine: 9472,
      sourceNote:
        'create_action dispatches "garrote" to garrote_t( name, this, spec.garrote, options_str ); ' +
        'spec.garrote = find_specialization_spell( "Garrote" ) at sc_rogue.cpp:9934. ' +
        "class_spells.inc row { 4, 259, 703 } confirms the id.",
    },
    {
      simcToken: "rupture",
      candidateAbilityGameIds: [1943],
      crossCheck: "CLASS_SPELLS",
      symbol: "rogue_t::create_action / rogue_t::init_spells",
      startLine: 9486,
      endLine: 9486,
      sourceNote:
        'create_action dispatches "rupture" to rupture_t( name, this, spec.rupture, options_str ); ' +
        'spec.rupture = find_specialization_spell( "Rupture" ) at sc_rogue.cpp:9937. ' +
        "class_spells.inc row { 4, 259, 1943 } confirms the id.",
    },
    {
      simcToken: "deathmark",
      candidateAbilityGameIds: [360194],
      crossCheck: "NONE_TALENT_BOUND",
      symbol: "rogue_t::create_action / deathmark_t",
      startLine: 9464,
      endLine: 9464,
      sourceNote:
        'create_action dispatches "deathmark" to deathmark_t, whose base is ' +
        "rogue_attack_t( name, p, p->talent.assassination.deathmark, options_str ) at sc_rogue.cpp:4127. " +
        'talent.assassination.deathmark = find_talent_spell( SPECIALIZATION, "Deathmark" ) at sc_rogue.cpp:10033. ' +
        "Talent-granted, so class_spells.inc carries no row and no cross-check is available.",
    },
    {
      simcToken: "kingsbane",
      candidateAbilityGameIds: [385627],
      crossCheck: "NONE_TALENT_BOUND",
      symbol: "rogue_t::create_action / kingsbane_t",
      startLine: 9480,
      endLine: 9480,
      sourceNote:
        'create_action dispatches "kingsbane" to kingsbane_t, whose base is ' +
        "rogue_attack_t( name, p, p->talent.assassination.kingsbane, options_str ) at sc_rogue.cpp:4835. " +
        'talent.assassination.kingsbane = find_talent_spell( SPECIALIZATION, "Kingsbane" ) at sc_rogue.cpp:10045. ' +
        "Talent-granted, so class_spells.inc carries no row and no cross-check is available.",
    },
    {
      simcToken: "blood_fury",
      candidateAbilityGameIds: [20572, 33697, 33702],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / blood_fury_t",
      startLine: 11060,
      endLine: 11061,
      sourceNote:
        'player_t::create_action dispatches "blood_fury" to blood_fury_t, whose base is ' +
        'racial_spell_t( p, "blood_fury", p->find_racial_spell( "Blood Fury" ) ) at player.cpp:9131-9132. ' +
        "racial_spells.inc carries THREE Blood Fury rows selected by a class mask " +
        "(33697/0x240, 33702/0x190, 20572/0x2d). All three are recorded rather than one being chosen, " +
        "because the lane is invariant across them and the mask is not evaluated here.",
    },
    {
      simcToken: "berserking",
      candidateAbilityGameIds: [26297],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / berserking_t",
      startLine: 11058,
      endLine: 11059,
      sourceNote:
        'player_t::create_action dispatches "berserking" to berserking_t, whose base is ' +
        'racial_spell_t( p, "berserking", p->find_racial_spell( "Berserking" ) ) at player.cpp:9104-9105. ' +
        'racial_spells.inc: { 0x0080 (Troll), 0x3fff, 26297, "Berserking" }.',
    },
    {
      simcToken: "fireblood",
      candidateAbilityGameIds: [265221],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / fireblood_t",
      startLine: 11064,
      endLine: 11065,
      sourceNote:
        'player_t::create_action dispatches "fireblood" to fireblood_t, whose base is ' +
        'racial_spell_t( p, "fireblood", p->find_racial_spell( "Fireblood" ) ) at player.cpp:9400-9401. ' +
        'racial_spells.inc: { 0x0800 (Dark Iron Dwarf), 0x3fff, 265221, "Fireblood" }.',
    },
    {
      simcToken: "ancestral_call",
      candidateAbilityGameIds: [274738],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / ancestral_call_t",
      startLine: 11052,
      endLine: 11053,
      sourceNote:
        'player_t::create_action dispatches "ancestral_call" to ancestral_call_t, whose base is ' +
        'racial_spell_t( p, "ancestral_call", p->find_racial_spell( "Ancestral Call" ) ) at player.cpp:9359-9360. ' +
        'racial_spells.inc: { 0x2000 (Maghar Orc), 0x3fff, 274738, "Ancestral Call" }.',
    },
  ],

  /**
   * META-ACTION LANES - tokens with NO DBC spell behind them.
   *
   * Each of these is an `action_t` subclass whose constructor assigns
   * `trigger_gcd` literally. There is no `_gcd` column to read, so the value is
   * a hand-reviewed reading of a C++ constructor, recorded with the file's
   * measured hash and a line so the reading can be re-checked.
   *
   * `use_off_gcd=1` IS NOT WHY THESE ARE NON_GCD, and must never be read as
   * though it were. That option ADDS an action to `off_gcd_actions`
   * (player.cpp:4340-4342, a push_back that erases nothing) for a separate
   * polling pass that runs only while a GCD is already active. The lane is
   * `trigger_gcd > 0` and nothing else.
   */
  metaActionLanes: [
    {
      simcToken: "use_item",
      triggerGcdMs: 0,
      sourcePath: "engine/player/player.cpp",
      symbol: "use_item_t::use_item_t",
      line: 9999,
      sourceNote:
        "use_item_t's constructor (struct opens at player.cpp:9847) assigns " +
        "trigger_gcd = timespan_t::zero(). No spell record backs the APL token.",
    },
    {
      simcToken: "use_items",
      triggerGcdMs: 0,
      sourcePath: "engine/player/player.cpp",
      symbol: "use_items_t::use_items_t",
      line: 10232,
      sourceNote:
        "use_items_t's constructor (struct opens at player.cpp:10216) assigns " +
        "trigger_gcd = timespan_t::zero(). It is the foreground entry; its per-slot " +
        "sub-actions are internal.",
    },
    {
      simcToken: "invoke_external_buff",
      triggerGcdMs: 0,
      sourcePath: "engine/player/player.cpp",
      symbol: "invoke_external_buff_t::invoke_external_buff_t",
      line: 10915,
      sourceNote:
        "invoke_external_buff_t's constructor (struct opens at player.cpp:10889) assigns " +
        "trigger_gcd = timespan_t::zero(). Its action type is ACTION_OTHER, not a spell.",
    },
    {
      simcToken: "potion",
      triggerGcdMs: 0,
      sourcePath: "engine/player/consumable.cpp",
      symbol: "dbc_consumable_base_t::dbc_consumable_base_t",
      line: 804,
      sourceNote:
        "potion_t (consumable.cpp:428) derives from dbc_consumable_base_t, whose constructor " +
        "(consumable.cpp:791) assigns trigger_gcd = timespan_t::zero(). The lane therefore holds " +
        "for EVERY potion identity, which matters because the pinned default potion is chosen by " +
        "player level (apl_rogue.cpp:6-15) and Warcraft Logs supplies no level.",
    },
  ],
};

/**
 * The Protection Paladin profile (M10-C).
 *
 * The SAME kinds of knowledge as the Rogue facts above, with the SAME
 * methods: `abilities` are machine-extracted `_gcd` records, `tokenBindings`
 * are hand-reviewed readings of pinned C++ verified against those records,
 * and `metaActionLanes` are hand-reviewed `trigger_gcd` assignments for
 * tokens no DBC row backs.
 *
 * Only the actions the pinned Protection APL names, plus the abilities the
 * M10-B capture observed the subject casting, are listed. An observed ability
 * with no APL token (Ardent Defender, Hand of Reckoning, Divine Steed,
 * Blessing of Spellwarding) gets a LANE record and no binding: the lane is
 * what classifies the observed cast, and a token nobody wrote would be a
 * binding nobody reviewed.
 */
const PALADIN_PROTECTION_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED — the class and specialization modules the token
  // bindings are hand-reviewed readings of.
  classModule: "engine/class_modules/paladin/sc_paladin.cpp",
  specModule: "engine/class_modules/paladin/sc_paladin_protection.cpp",
  // HASHED, NEVER PARSED. The Paladin Arcane Torrent row is a class-mask
  // reading of this table; the racial and meta-action lanes cite the next two.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const PALADIN_PROTECTION_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    // ---- actions the pinned Protection APL names ----
    { abilityGameId: 26573, displayNameEn: "Consecration", baseGcdMs: 1500 },
    { abilityGameId: 31884, displayNameEn: "Avenging Wrath", baseGcdMs: 0 },
    { abilityGameId: 31935, displayNameEn: "Avenger's Shield", baseGcdMs: 1500 },
    { abilityGameId: 53595, displayNameEn: "Hammer of the Righteous", baseGcdMs: 1500 },
    { abilityGameId: 53600, displayNameEn: "Shield of the Righteous", baseGcdMs: 0 },
    { abilityGameId: 85673, displayNameEn: "Word of Glory", baseGcdMs: 1500 },
    { abilityGameId: 155145, displayNameEn: "Arcane Torrent", baseGcdMs: 1500 },
    { abilityGameId: 204019, displayNameEn: "Blessed Hammer", baseGcdMs: 1500 },
    { abilityGameId: 265221, displayNameEn: "Fireblood", baseGcdMs: 0 },
    { abilityGameId: 275779, displayNameEn: "Judgment", baseGcdMs: 1500 },
    { abilityGameId: 375576, displayNameEn: "Divine Toll", baseGcdMs: 1500 },
    { abilityGameId: 389539, displayNameEn: "Sentinel", baseGcdMs: 0 },
    { abilityGameId: 427453, displayNameEn: "Hammer of Light", baseGcdMs: 1500 },
    { abilityGameId: 432459, displayNameEn: "Holy Bulwark", baseGcdMs: 1500 },
    // M10-C5 Phase B: the Sacred Weapon record the same press casts on the
    // alternate armament. Same lane as 432459; bound to the same token below.
    { abilityGameId: 432472, displayNameEn: "Sacred Weapon", baseGcdMs: 1500 },
    { abilityGameId: 1241413, displayNameEn: "Hammer of Wrath", baseGcdMs: 1500 },
    // ---- abilities the M10-B subject cast that the APL does not name ----
    // Lane records only. They classify the observed casts (all four are
    // outside the offensive authority) and bind to no token.
    { abilityGameId: 31850, displayNameEn: "Ardent Defender", baseGcdMs: 0 },
    { abilityGameId: 62124, displayNameEn: "Hand of Reckoning", baseGcdMs: 0 },
    { abilityGameId: 190784, displayNameEn: "Divine Steed", baseGcdMs: 0 },
    { abilityGameId: 204018, displayNameEn: "Blessing of Spellwarding", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "avenging_wrath",
      // TWO records, and the split is a talent this extractor does not
      // evaluate. Protection's create_action returns sentinel_t when the
      // Sentinel talent is taken (the talent spell, 389539) and otherwise falls
      // to the base avenging_wrath_t on 31884. Both records are `_gcd` 0, so
      // the lane holds under either resolution without choosing one.
      candidateAbilityGameIds: [31884, 389539],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin_protection.cpp",
      symbol: "paladin_t::create_action_protection / sentinel_t",
      startLine: 980,
      endLine: 981,
      sourceNote:
        'create_action_protection: if ( name == "avenging_wrath" && talents.sentinel->ok() ) return new sentinel_t; ' +
        'sentinel_t( p, options_str ) : paladin_spell_t( "sentinel", p, p->talents.sentinel ) at ' +
        'sc_paladin_protection.cpp:723, talents.sentinel = find_talent_spell( SPECIALIZATION, "Sentinel" ) at ' +
        "sc_paladin_protection.cpp:1074 (trait spell 389539). Otherwise paladin_t::create_action dispatches " +
        'to avenging_wrath_t( p, options_str ) : paladin_spell_t( "avenging_wrath", p, p->find_spell( 31884 ) ) ' +
        "at sc_paladin.cpp:3381-3382 and 283-284, which sets background = true when the Sentinel talent is taken.",
    },
    {
      simcToken: "divine_toll",
      candidateAbilityGameIds: [375576],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / divine_toll_t",
      startLine: 3423,
      endLine: 3424,
      sourceNote:
        'create_action dispatches "divine_toll" to divine_toll_t, whose base is ' +
        'paladin_spell_t( "divine_toll", p, p->talents.divine_toll ) at sc_paladin.cpp:1823; ' +
        'talents.divine_toll = find_talent_spell( talent_tree::CLASS, "Divine Toll" ) at sc_paladin.cpp:4201, ' +
        "whose Protection trait row carries spell 375576.",
    },
    {
      simcToken: "hammer_of_light",
      candidateAbilityGameIds: [427453],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / hammer_of_light_t",
      startLine: 3431,
      endLine: 3432,
      sourceNote:
        'create_action dispatches "hammer_of_light" to hammer_of_light_t, whose base is ' +
        'holy_power_consumer_t( "hammer_of_light", p, p->spells.templar.hammer_of_light_driver ) at ' +
        "sc_paladin.cpp:2143; spells.templar.hammer_of_light_driver = find_spell( 427453 ) at sc_paladin.cpp:4336.",
    },
    {
      simcToken: "shield_of_the_righteous",
      candidateAbilityGameIds: [53600],
      crossCheck: "CLASS_SPELLS",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / shield_of_the_righteous_t",
      startLine: 3425,
      endLine: 3426,
      sourceNote:
        'create_action dispatches "shield_of_the_righteous" to shield_of_the_righteous_t, whose base is ' +
        'holy_power_consumer_t( "shield_of_the_righteous", p, p->spec.shield_of_the_righteous ) at ' +
        'sc_paladin.cpp:2902; spec.shield_of_the_righteous = find_class_spell( "Shield of the Righteous" ) at ' +
        "sc_paladin_protection.cpp:1106. class_spells.inc row { 2, 0, 53600 } confirms the id.",
    },
    {
      simcToken: "holy_armaments",
      // TWO records (M10-C5 Phase B). SimulationCraft models ONE action on
      // 432459 whose execute_time and effect come from the alternation state
      // (sc_paladin.cpp:2628-2635: `active.armament[ p()->next_armament ]`),
      // but the game logs the press under whichever armament it cast: Holy
      // Bulwark 432459 or Sacred Weapon 432472. Both DBC records carry `_gcd`
      // 1500, `_charges` 2, `_charge_cooldown` 60000 and category 2220, so
      // the lane and the cooldown object are the same under either id. The
      // Phase B1 evidence holds both ids as GCD-spaced casts by the subject
      // (+61.521 s and +121.011 s as 432472; +70.832 s and +162.809 s as
      // 432459), each applying its own armament buff at the same millisecond.
      candidateAbilityGameIds: [432459, 432472],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / holy_armaments_t",
      startLine: 3429,
      endLine: 3430,
      sourceNote:
        'create_action dispatches "holy_armaments" to holy_armaments_t, whose base is ' +
        'paladin_spell_t( "holy_armaments", p, p->find_spell( 432459 ) ) at sc_paladin.cpp:2616. The DBC record ' +
        'is named "Holy Bulwark"; the token is the Lightsmith armament action, background unless the Lightsmith ' +
        "hero tree is active (sc_paladin.cpp:2621). holy_armaments_t::execute (2632-2635) casts " +
        "active.armament[ next_armament ] with LS_HARDCAST — Holy Bulwark or Sacred Weapon — so the press the " +
        "log records is 432459 or 432472 (the Sacred Weapon spell row) depending on the alternation; both rows " +
        "share `_gcd` 1500, `_charges` 2, `_charge_cooldown` 60000 and category 2220.",
    },
    {
      simcToken: "hammer_of_wrath",
      candidateAbilityGameIds: [1241413],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / hammer_of_wrath_t",
      startLine: 3407,
      endLine: 3410,
      sourceNote:
        'create_action dispatches "hammer_of_wrath" for PALADIN_PROTECTION to ' +
        'hammer_of_wrath_t( this, "hammer_of_wrath", options_str, find_spell( 1241413 ) ). The Retribution ' +
        "branch (24275) is a different record and is not a candidate for this specialization.",
    },
    {
      simcToken: "judgment",
      candidateAbilityGameIds: [275779],
      crossCheck: "CLASS_SPELLS",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / judgment_t",
      startLine: 3414,
      endLine: 3417,
      sourceNote:
        'create_action dispatches "judgment" for PALADIN_PROTECTION to ' +
        'judgment_t( this, "judgment", options_str, find_spell( 275779 ) ). class_spells.inc row ' +
        "{ 2, 66, 275779 } confirms the id as the Protection Judgment.",
    },
    {
      simcToken: "avengers_shield",
      candidateAbilityGameIds: [31935],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin_protection.cpp",
      symbol: "paladin_t::create_action_protection / avengers_shield_base_t",
      startLine: 975,
      endLine: 975,
      sourceNote:
        'create_action_protection dispatches "avengers_shield" to avengers_shield_t, whose base ' +
        'avengers_shield_base_t is paladin_spell_t( n, p, p->find_talent_spell( SPECIALIZATION, "Avenger\'s Shield" ) ) ' +
        "at sc_paladin_protection.cpp:171; the Protection trait row carries spell 31935.",
    },
    {
      simcToken: "consecration",
      candidateAbilityGameIds: [26573],
      crossCheck: "CLASS_SPELLS",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / consecration_t",
      startLine: 3387,
      endLine: 3388,
      sourceNote:
        'create_action dispatches "consecration" to consecration_t, whose base is ' +
        'paladin_spell_t( "consecration", p, p->find_spell( 26573 ) ) at sc_paladin.cpp:425. class_spells.inc ' +
        "row { 2, 0, 26573 } confirms the id.",
    },
    {
      simcToken: "hammer_of_the_righteous",
      candidateAbilityGameIds: [53595],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin_protection.cpp",
      symbol: "paladin_t::create_action_protection / hammer_of_the_righteous_t",
      startLine: 979,
      endLine: 979,
      sourceNote:
        'create_action_protection dispatches "hammer_of_the_righteous" to hammer_of_the_righteous_t, whose base is ' +
        'paladin_melee_attack_t( "hammer_of_the_righteous", p, p->find_talent_spell( SPECIALIZATION, ' +
        '"Hammer of the Righteous" ) ) at sc_paladin_protection.cpp:608; the trait row carries spell 53595. ' +
        "The action is background when the Blessed Hammer talent is taken (sc_paladin_protection.cpp:612-613).",
    },
    {
      simcToken: "blessed_hammer",
      candidateAbilityGameIds: [204019],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin_protection.cpp",
      symbol: "paladin_t::create_action_protection / blessed_hammer_t",
      startLine: 976,
      endLine: 976,
      sourceNote:
        'create_action_protection dispatches "blessed_hammer" to blessed_hammer_t, whose base is ' +
        'paladin_spell_t( "blessed_hammer", p, p->talents.blessed_hammer ) at sc_paladin_protection.cpp:407; ' +
        'talents.blessed_hammer = find_talent_spell( SPECIALIZATION, "Blessed Hammer" ) at ' +
        "sc_paladin_protection.cpp:1026, whose trait row carries spell 204019.",
    },
    {
      simcToken: "arcane_torrent",
      candidateAbilityGameIds: [155145],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / arcane_torrent_t",
      startLine: 11056,
      endLine: 11057,
      sourceNote:
        'player_t::create_action dispatches "arcane_torrent" to arcane_torrent_t, whose base is ' +
        'racial_spell_t( p, "arcane_torrent", p->find_racial_spell( "Arcane Torrent" ) ) at player.cpp:9050-9051. ' +
        "racial_spells.inc carries nine Arcane Torrent rows selected by class mask; the row whose class mask is " +
        "0x00000002 (Paladin) is { 0x0200 (Blood Elf), 0x00000002, 155145 }. Only that row can resolve for a " +
        "Paladin, so it is the single candidate.",
    },
    {
      simcToken: "word_of_glory",
      candidateAbilityGameIds: [85673],
      crossCheck: "CLASS_SPELLS",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / word_of_glory_t",
      startLine: 3427,
      endLine: 3428,
      sourceNote:
        'create_action dispatches "word_of_glory" to word_of_glory_t( this, options_str, "word_of_glory" ), whose ' +
        'base is holy_power_consumer_t( name, p, p->find_class_spell( "Word of Glory" ) ) at sc_paladin.cpp:1218. ' +
        "class_spells.inc row { 2, 0, 85673 } confirms the id.",
    },
    {
      simcToken: "fireblood",
      candidateAbilityGameIds: [265221],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / fireblood_t",
      startLine: 11064,
      endLine: 11065,
      sourceNote:
        'player_t::create_action dispatches "fireblood" to fireblood_t, whose base is ' +
        'racial_spell_t( p, "fireblood", p->find_racial_spell( "Fireblood" ) ) at player.cpp:9400-9401. ' +
        'racial_spells.inc: { 0x0800 (Dark Iron Dwarf), 0x3fff, 265221, "Fireblood" }.',
    },
  ],
  metaActionLanes: [
    {
      simcToken: "auto_attack",
      triggerGcdMs: 0,
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "auto_melee_attack_t::auto_melee_attack_t",
      line: 1034,
      sourceNote:
        "auto_melee_attack_t's constructor (struct opens at sc_paladin.cpp:1024) is built on " +
        "spell_data_t::nil() and assigns trigger_gcd = 0_ms. No spell record backs the APL token; its " +
        "ready() is `!is_moving() && main_hand_attack->execute_event == nullptr` (sc_paladin.cpp:1046-1052).",
    },
    {
      simcToken: "use_item",
      triggerGcdMs: 0,
      sourcePath: "engine/player/player.cpp",
      symbol: "use_item_t::use_item_t",
      line: 9999,
      sourceNote:
        "use_item_t's constructor (struct opens at player.cpp:9847) assigns " +
        "trigger_gcd = timespan_t::zero(). No spell record backs the APL token.",
    },
    {
      simcToken: "use_items",
      triggerGcdMs: 0,
      sourcePath: "engine/player/player.cpp",
      symbol: "use_items_t::use_items_t",
      line: 10232,
      sourceNote:
        "use_items_t's constructor (struct opens at player.cpp:10216) assigns " +
        "trigger_gcd = timespan_t::zero(). It is the foreground entry; its per-slot " +
        "sub-actions are internal.",
    },
    {
      simcToken: "potion",
      triggerGcdMs: 0,
      sourcePath: "engine/player/consumable.cpp",
      symbol: "dbc_consumable_base_t::dbc_consumable_base_t",
      line: 804,
      sourceNote:
        "potion_t (consumable.cpp:428) derives from dbc_consumable_base_t, whose constructor " +
        "(consumable.cpp:791) assigns trigger_gcd = timespan_t::zero(). The lane therefore holds " +
        "for EVERY potion identity; Warcraft Logs supplies no player level to pick one.",
    },
  ],
};

/**
 * The extractable targets. Each is coordinates and facts; the parser, the
 * hash gate, the field-index derivation and every verification rule are the
 * same for all of them.
 */
/**
 * M11-A4: the Retribution profile. Same DBC tables, class module, racial
 * table, player and consumable modules as Protection; the SPEC module is
 * Retribution's own file. Every ability record is machine-extracted; every
 * token binding is a hand-reviewed reading of the pinned modules with the
 * measured hash travelling beside it.
 */
const PALADIN_RETRIBUTION_SOURCES = {
  ...PALADIN_PROTECTION_SOURCES,
  specModule: "engine/class_modules/paladin/sc_paladin_retribution.cpp",
};
const PALADIN_RETRIBUTION_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    // ---- actions the pinned Retribution APL names ----
    { abilityGameId: 35395, displayNameEn: "Crusader Strike", baseGcdMs: 1500 },
    { abilityGameId: 20271, displayNameEn: "Judgment", baseGcdMs: 1500 },
    { abilityGameId: 24275, displayNameEn: "Hammer of Wrath", baseGcdMs: 1500 },
    { abilityGameId: 184575, displayNameEn: "Blade of Justice", baseGcdMs: 1500 },
    { abilityGameId: 255937, displayNameEn: "Wake of Ashes", baseGcdMs: 1500 },
    { abilityGameId: 375576, displayNameEn: "Divine Toll", baseGcdMs: 1500 },
    { abilityGameId: 343527, displayNameEn: "Execution Sentence", baseGcdMs: 750 },
    { abilityGameId: 31884, displayNameEn: "Avenging Wrath", baseGcdMs: 0 },
    { abilityGameId: 85256, displayNameEn: "Templar's Verdict", baseGcdMs: 1500 },
    { abilityGameId: 383328, displayNameEn: "Final Verdict", baseGcdMs: 1500 },
    { abilityGameId: 53385, displayNameEn: "Divine Storm", baseGcdMs: 1500 },
    { abilityGameId: 427453, displayNameEn: "Hammer of Light", baseGcdMs: 1500 },
    { abilityGameId: 407480, displayNameEn: "Templar Strike", baseGcdMs: 1000 },
    { abilityGameId: 406647, displayNameEn: "Templar Slash", baseGcdMs: 1000 },
    { abilityGameId: 96231, displayNameEn: "Rebuke", baseGcdMs: 0 },
    { abilityGameId: 155145, displayNameEn: "Arcane Torrent", baseGcdMs: 1500 },
    { abilityGameId: 265221, displayNameEn: "Fireblood", baseGcdMs: 0 },
    { abilityGameId: 255647, displayNameEn: "Light's Judgment", baseGcdMs: 1500 },
    // ---- abilities the two M11-A4 subjects cast that the APL does not name ----
    // Lane records only: they classify the observed casts and bind to no token.
    { abilityGameId: 408385, displayNameEn: "Crusading Strikes", baseGcdMs: 0 },
    { abilityGameId: 383926, displayNameEn: "Bound by Fire and Blaze", baseGcdMs: 0 },
    { abilityGameId: 1236616, displayNameEn: "Light's Potential", baseGcdMs: 0 },
    { abilityGameId: 403876, displayNameEn: "Divine Protection", baseGcdMs: 0 },
    { abilityGameId: 184662, displayNameEn: "Shield of Vengeance", baseGcdMs: 0 },
    { abilityGameId: 190784, displayNameEn: "Divine Steed", baseGcdMs: 0 },
    { abilityGameId: 633, displayNameEn: "Lay on Hands", baseGcdMs: 0 },
    { abilityGameId: 85673, displayNameEn: "Word of Glory", baseGcdMs: 1500 },
    { abilityGameId: 1044, displayNameEn: "Blessing of Freedom", baseGcdMs: 1500 },
    { abilityGameId: 6940, displayNameEn: "Blessing of Sacrifice", baseGcdMs: 0 },
    { abilityGameId: 1297761, displayNameEn: "Voracious Heart of Ula'tek", baseGcdMs: 0 },
  ],
  tokenBindings: [
    {
      simcToken: "crusader_strike",
      candidateAbilityGameIds: [35395],
      crossCheck: "CLASS_SPELLS",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / crusader_strike_t",
      startLine: 3389,
      endLine: 3390,
      sourceNote:
        'create_action dispatches "crusader_strike" to crusader_strike_t, whose base is ' +
        'paladin_melee_attack_t( "crusader_strike", p, p->find_class_spell( "Crusader Strike" ) ) at ' +
        "sc_paladin.cpp:1061-1062. class_spells.inc row { 2, 0, 35395 } confirms the id. The action is " +
        "background when Crusading Strikes or Templar Strikes is taken (sc_paladin.cpp:1072-1075).",
    },
    {
      simcToken: "judgment",
      candidateAbilityGameIds: [20271],
      crossCheck: "CLASS_SPELLS",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / judgment_ret_t",
      startLine: 3414,
      endLine: 3419,
      sourceNote:
        'create_action dispatches "judgment" for PALADIN_RETRIBUTION to ' +
        'judgment_ret_t( this, "judgment", options_str, find_spell( 20271 ) ). class_spells.inc row ' +
        "{ 2, 0, 20271 } confirms the id as the class Judgment. The Protection branch (275779) is a " +
        "different record and is not a candidate for this specialization.",
    },
    {
      simcToken: "hammer_of_wrath",
      candidateAbilityGameIds: [24275],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / hammer_of_wrath_t",
      startLine: 3407,
      endLine: 3412,
      sourceNote:
        'create_action dispatches "hammer_of_wrath" for PALADIN_RETRIBUTION to ' +
        'hammer_of_wrath_t( this, "hammer_of_wrath", options_str, find_spell( 24275 ) ). The Protection ' +
        "branch (1241413) is a different record and is not a candidate for this specialization.",
    },
    {
      simcToken: "blade_of_justice",
      candidateAbilityGameIds: [184575],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin_retribution.cpp",
      symbol: "paladin_t::create_action_retribution / blade_of_justice_t",
      startLine: 1133,
      endLine: 1133,
      sourceNote:
        'create_action_retribution dispatches "blade_of_justice" to blade_of_justice_t, whose base is ' +
        'paladin_melee_attack_t( "blade_of_justice", p, p->talents.blade_of_justice ) at ' +
        "sc_paladin_retribution.cpp:370; talents.blade_of_justice = find_talent_spell( SPECIALIZATION, " +
        '"Blade of Justice" ) at :1185, whose Retribution trait row carries spell 184575.',
    },
    {
      simcToken: "wake_of_ashes",
      candidateAbilityGameIds: [255937],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin_retribution.cpp",
      symbol: "paladin_t::create_action_retribution / wake_of_ashes_t",
      startLine: 1136,
      endLine: 1136,
      sourceNote:
        'create_action_retribution dispatches "wake_of_ashes" to wake_of_ashes_t, whose base is ' +
        'paladin_spell_t( "wake_of_ashes", p, p->talents.wake_of_ashes ) at sc_paladin_retribution.cpp:803-804; ' +
        'talents.wake_of_ashes = find_talent_spell( SPECIALIZATION, "Wake of Ashes" ) at :1213, whose trait row ' +
        "carries spell 255937. Background when the talent is not taken (:807-808).",
    },
    {
      simcToken: "divine_toll",
      candidateAbilityGameIds: [375576],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / divine_toll_t",
      startLine: 3423,
      endLine: 3424,
      sourceNote:
        'create_action dispatches "divine_toll" to divine_toll_t, whose base is ' +
        'paladin_spell_t( "divine_toll", p, p->talents.divine_toll ) at sc_paladin.cpp:1823; ' +
        'talents.divine_toll = find_talent_spell( talent_tree::CLASS, "Divine Toll" ) at sc_paladin.cpp:4201, ' +
        "whose Retribution trait row carries spell 375576.",
    },
    {
      simcToken: "execution_sentence",
      candidateAbilityGameIds: [343527],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin_retribution.cpp",
      symbol: "paladin_t::create_action_retribution / execution_sentence_t",
      startLine: 1139,
      endLine: 1139,
      sourceNote:
        'create_action_retribution dispatches "execution_sentence" to execution_sentence_t, whose base is ' +
        'paladin_melee_attack_t( "execution_sentence", p, p->talents.execution_sentence ) at ' +
        "sc_paladin_retribution.cpp:216-217; talents.execution_sentence = find_talent_spell( SPECIALIZATION, " +
        '"Execution Sentence" ) at :1215, whose trait row carries spell 343527. Background when the talent is ' +
        "not taken (:221-222). The DBC record carries `_gcd` 750: GCD-consuming to the first-GCD question.",
    },
    {
      simcToken: "avenging_wrath",
      candidateAbilityGameIds: [31884],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / avenging_wrath_t",
      startLine: 3381,
      endLine: 3382,
      sourceNote:
        'create_action dispatches "avenging_wrath" to avenging_wrath_t( p, options_str ) : ' +
        'paladin_spell_t( "avenging_wrath", p, p->find_spell( 31884 ) ) at sc_paladin.cpp:282-283. Retribution ' +
        "has no Sentinel substitution (create_action_retribution names no avenging_wrath, :1131-1140); the " +
        "action is background under Radiant Glory (:290-291) and without the Avenging Wrath talent (:286-287). " +
        "Under Crusade the BUFF spell changes (spells.crusade 231895, sc_paladin_retribution.cpp:1246) but the " +
        "action record the log reports as cast stays 31884 — the two M11-A4 subjects both take Crusade and both " +
        "log 31884 casts.",
    },
    {
      simcToken: "templars_verdict",
      // TWO records, and the split is a talent this extractor does not
      // evaluate: with Final Verdict taken the action is built on 383328 and
      // named "final_verdict"; otherwise on the specialization spell 85256.
      // Both are `_gcd` 1500, so the lane holds under either resolution.
      candidateAbilityGameIds: [85256, 383328],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin_retribution.cpp",
      symbol: "paladin_t::create_action_retribution / templars_verdict_t",
      startLine: 1135,
      endLine: 1135,
      sourceNote:
        'create_action_retribution dispatches "templars_verdict" to templars_verdict_t, whose base is ' +
        'holy_power_consumer_t( talents.final_verdict->ok() ? "final_verdict" : "templars_verdict", p, ' +
        'talents.final_verdict->ok() ? find_spell( 383328 ) : find_specialization_spell( "Templar\'s Verdict" ) ) ' +
        "at sc_paladin_retribution.cpp:662-669. class_spells.inc row { 2, 70, 85256 } is the specialization " +
        "spell; 383328 is the Final Verdict record. The action is background unless the main hand is a " +
        "two-handed weapon (:675-676).",
    },
    {
      simcToken: "divine_storm",
      candidateAbilityGameIds: [53385],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin_retribution.cpp",
      symbol: "paladin_t::create_action_retribution / divine_storm_t",
      startLine: 1134,
      endLine: 1134,
      sourceNote:
        'create_action_retribution dispatches "divine_storm" to divine_storm_t, whose base is ' +
        'holy_power_consumer_t( "divine_storm", p, p->talents.divine_storm ) at sc_paladin_retribution.cpp:545; ' +
        'talents.divine_storm = find_talent_spell( SPECIALIZATION, "Divine Storm" ) at :1186, whose trait row ' +
        "carries spell 53385. Background when the talent is not taken (:549-550).",
    },
    {
      simcToken: "hammer_of_light",
      candidateAbilityGameIds: [427453],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / hammer_of_light_t",
      startLine: 3431,
      endLine: 3432,
      sourceNote:
        'create_action dispatches "hammer_of_light" to hammer_of_light_t, whose base is ' +
        'holy_power_consumer_t( "hammer_of_light", p, p->spells.templar.hammer_of_light_driver ) at ' +
        "sc_paladin.cpp:2143; spells.templar.hammer_of_light_driver = find_spell( 427453 ) at sc_paladin.cpp:4336. " +
        "Background unless the Templar tree is active (:2149).",
    },
    {
      simcToken: "templar_strike",
      candidateAbilityGameIds: [407480],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin_retribution.cpp",
      symbol: "paladin_t::create_action_retribution / templar_strike_t",
      startLine: 1137,
      endLine: 1137,
      sourceNote:
        'create_action_retribution dispatches "templar_strike" to templar_strike_t : ' +
        'base_templar_strike_t( "templar_strike", p, options_str, p->find_spell( 407480 ) ) at ' +
        "sc_paladin_retribution.cpp:988-989. Background without the Templar Strikes talent (:962-963).",
    },
    {
      simcToken: "templar_slash",
      candidateAbilityGameIds: [406647],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin_retribution.cpp",
      symbol: "paladin_t::create_action_retribution / templar_slash_t",
      startLine: 1138,
      endLine: 1138,
      sourceNote:
        'create_action_retribution dispatches "templar_slash" to templar_slash_t : ' +
        'base_templar_strike_t( "templar_slash", p, options_str, p->find_spell( 406647 ) ) at ' +
        "sc_paladin_retribution.cpp:1008-1009. Background without the Templar Strikes talent (:962-963).",
    },
    {
      simcToken: "rebuke",
      candidateAbilityGameIds: [96231],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "paladin_t::create_action / rebuke_t",
      startLine: 3399,
      endLine: 3400,
      sourceNote:
        'create_action dispatches "rebuke" to rebuke_t, whose base is ' +
        'paladin_melee_attack_t( "rebuke", p, p->find_class_spell( "Rebuke" ) ) at sc_paladin.cpp:1944-1945. ' +
        "The pinned spell table carries one Rebuke record for class mask 0x2, 96231, with `_gcd` 0. " +
        "target_ready requires the target to be casting (:1956-1961): usability is never claimed either way.",
    },
    {
      simcToken: "arcane_torrent",
      candidateAbilityGameIds: [155145],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / arcane_torrent_t",
      startLine: 11056,
      endLine: 11057,
      sourceNote:
        'player_t::create_action dispatches "arcane_torrent" to arcane_torrent_t, whose base is ' +
        'racial_spell_t( p, "arcane_torrent", p->find_racial_spell( "Arcane Torrent" ) ) at player.cpp:9050-9051. ' +
        "racial_spells.inc row { 0x0200 (Blood Elf), 0x00000002 (Paladin), 155145 } is the only row a Paladin " +
        "can resolve. OUTSIDE the Retribution rotational decision domain (racial action).",
    },
    {
      simcToken: "fireblood",
      candidateAbilityGameIds: [265221],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / fireblood_t",
      startLine: 11064,
      endLine: 11065,
      sourceNote:
        'player_t::create_action dispatches "fireblood" to fireblood_t, whose base is ' +
        'racial_spell_t( p, "fireblood", p->find_racial_spell( "Fireblood" ) ) at player.cpp:9400-9401. ' +
        'racial_spells.inc: { 0x0800 (Dark Iron Dwarf), 0x3fff, 265221, "Fireblood" }. OUTSIDE the Retribution ' +
        "rotational decision domain (racial action).",
    },
    {
      simcToken: "lights_judgment",
      candidateAbilityGameIds: [255647],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / lights_judgment_t",
      startLine: 11070,
      endLine: 11071,
      sourceNote:
        'player_t::create_action dispatches "lights_judgment" to lights_judgment_t, whose base is ' +
        'racial_spell_t( p, "lights_judgment", p->find_racial_spell( "Light\'s Judgment" ) ) at player.cpp:9251-9252. ' +
        'racial_spells.inc: { 0x20000000 (Lightforged Draenei), 0x3fff, 255647, "Light\'s Judgment" }; the record ' +
        "carries `_gcd` 1500. OUTSIDE the Retribution rotational decision domain (racial action): the lane is " +
        "recorded for provenance and the entry is classified non-domain before selection.",
    },
  ],
  metaActionLanes: [
    {
      simcToken: "auto_attack",
      triggerGcdMs: 0,
      sourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
      symbol: "auto_melee_attack_t::auto_melee_attack_t",
      line: 1034,
      sourceNote:
        "auto_melee_attack_t's constructor (struct opens at sc_paladin.cpp:1024) is built on " +
        "spell_data_t::nil() and assigns trigger_gcd = 0_ms. No spell record backs the APL token; its " +
        "ready() is `!is_moving() && main_hand_attack->execute_event == nullptr` (sc_paladin.cpp:1046-1052).",
    },
    {
      simcToken: "use_item",
      triggerGcdMs: 0,
      sourcePath: "engine/player/player.cpp",
      symbol: "use_item_t::use_item_t",
      line: 9999,
      sourceNote:
        "use_item_t's constructor (struct opens at player.cpp:9847) assigns " +
        "trigger_gcd = timespan_t::zero(). No spell record backs the APL token. OUTSIDE the Retribution " +
        "rotational decision domain (item use).",
    },
    {
      simcToken: "use_items",
      triggerGcdMs: 0,
      sourcePath: "engine/player/player.cpp",
      symbol: "use_items_t::use_items_t",
      line: 10232,
      sourceNote:
        "use_items_t's constructor (struct opens at player.cpp:10216) assigns " +
        "trigger_gcd = timespan_t::zero(). OUTSIDE the Retribution rotational decision domain (item use).",
    },
    {
      simcToken: "potion",
      triggerGcdMs: 0,
      sourcePath: "engine/player/consumable.cpp",
      symbol: "dbc_consumable_base_t::dbc_consumable_base_t",
      line: 804,
      sourceNote:
        "potion_t (consumable.cpp:428) derives from dbc_consumable_base_t, whose constructor " +
        "(consumable.cpp:791) assigns trigger_gcd = timespan_t::zero(). OUTSIDE the Retribution rotational " +
        "decision domain (consumable).",
    },
    {
      simcToken: "invoke_external_buff",
      triggerGcdMs: 0,
      sourcePath: "engine/player/player.cpp",
      symbol: "invoke_external_buff_t::invoke_external_buff_t",
      line: 10915,
      sourceNote:
        "invoke_external_buff_t's constructor (struct opens at player.cpp:10889) assigns trigger_gcd = " +
        "timespan_t::zero(). Its action type is ACTION_OTHER, not a spell. OUTSIDE the Retribution rotational " +
        "decision domain (externally supplied buff).",
    },
  ],
};

/**
 * The Blood Death Knight sources (M11-B2). One class module holds every
 * specialization, so there is no separate spec module; the shared DBC tables,
 * racial rows and the player/consumable modules are the same files the
 * Paladin targets hash.
 */
const DEATHKNIGHT_BLOOD_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED — the class module every token binding is a hand-reviewed reading of.
  classModule: "engine/class_modules/sc_death_knight.cpp",
  // HASHED, NEVER PARSED. The racial rows are class-mask readings of this table.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const DK = "engine/class_modules/sc_death_knight.cpp";

/**
 * The Blood Death Knight facts (M11-B2).
 *
 * `abilities` are the machine-extracted `_gcd` records the Blood analyzer's
 * decision population needs: every spell the pinned Blood list names through
 * a token (the eleven class/spec actions, the three racial tokens the list
 * carries), the Vampiric Strike record the `heart_strike` token EXECUTES under
 * the San'layn buff, and the observed-only abilities the two M11-B2 subjects
 * cast that the list does not name (lane records only; they bind to no
 * token). Every `baseGcdMs` here is a claim verified against the DBC row.
 *
 * Two facts a reader should not have to rediscover:
 *
 *   - DANCING RUNE WEAPON IS `_gcd` 1500 at the pin. It is a GCD-consuming
 *     entry of `high_prio_actions`, not an off-GCD cooldown, so it competes
 *     with the rotational GCD whenever it is not proven unusable.
 *   - `heart_strike` BINDS TO TWO RECORDS (206930 and 433895): under the
 *     San'layn Vampiric Strike talent, heart_strike_t::execute runs the
 *     Vampiric Strike child instead of itself (sc_death_knight.cpp:11350-11357),
 *     and the log reports that press as a Vampiric Strike cast. Both are lane
 *     1500, so the lane holds without deciding the buff.
 */
const DEATHKNIGHT_BLOOD_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    // ---- actions the pinned Blood APL names ----
    { abilityGameId: 49998, displayNameEn: "Death Strike", baseGcdMs: 1500 },
    { abilityGameId: 206930, displayNameEn: "Heart Strike", baseGcdMs: 1500 },
    { abilityGameId: 433895, displayNameEn: "Vampiric Strike", baseGcdMs: 1500 },
    { abilityGameId: 50842, displayNameEn: "Blood Boil", baseGcdMs: 1500 },
    { abilityGameId: 195182, displayNameEn: "Marrowrend", baseGcdMs: 1500 },
    { abilityGameId: 195292, displayNameEn: "Death's Caress", baseGcdMs: 1500 },
    { abilityGameId: 43265, displayNameEn: "Death and Decay", baseGcdMs: 1500 },
    { abilityGameId: 49028, displayNameEn: "Dancing Rune Weapon", baseGcdMs: 1500 },
    { abilityGameId: 46585, displayNameEn: "Raise Dead", baseGcdMs: 0 },
    { abilityGameId: 55233, displayNameEn: "Vampiric Blood", baseGcdMs: 0 },
    { abilityGameId: 1263824, displayNameEn: "Consumption", baseGcdMs: 500 },
    { abilityGameId: 439843, displayNameEn: "Reaper's Mark", baseGcdMs: 1500 },
    { abilityGameId: 50613, displayNameEn: "Arcane Torrent", baseGcdMs: 1500 },
    { abilityGameId: 265221, displayNameEn: "Fireblood", baseGcdMs: 0 },
    { abilityGameId: 20572, displayNameEn: "Blood Fury", baseGcdMs: 0 },
    { abilityGameId: 26297, displayNameEn: "Berserking", baseGcdMs: 0 },
    { abilityGameId: 274738, displayNameEn: "Ancestral Call", baseGcdMs: 0 },
    // ---- abilities the two M11-B2 subjects cast that the APL does not name ----
    // Lane records only: they classify the observed casts and bind to no token.
    { abilityGameId: 56222, displayNameEn: "Dark Command", baseGcdMs: 0 },
    { abilityGameId: 48707, displayNameEn: "Anti-Magic Shell", baseGcdMs: 0 },
    { abilityGameId: 51052, displayNameEn: "Anti-Magic Zone", baseGcdMs: 1500 },
    { abilityGameId: 48265, displayNameEn: "Death's Advance", baseGcdMs: 0 },
    { abilityGameId: 434144, displayNameEn: "Infliction of Sorrow", baseGcdMs: 0 },
    { abilityGameId: 1236994, displayNameEn: "Potion of Recklessness", baseGcdMs: 0 },
    { abilityGameId: 1297761, displayNameEn: "Voracious Heart of Ula'tek", baseGcdMs: 0 },
  ],
  tokenBindings: [
    {
      simcToken: "death_strike",
      candidateAbilityGameIds: [49998],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / death_strike_t",
      startLine: 14343,
      endLine: 14344,
      sourceNote:
        'create_action dispatches "death_strike" to death_strike_t, whose base is ' +
        'death_knight_melee_attack_t( "death_strike", p, p->talent.death_strike ) at sc_death_knight.cpp:10017-10020; ' +
        'talent.death_strike = find_talent_spell( talent_tree::CLASS, "Death Strike" ) at :14843, whose trait row ' +
        "carries spell 49998. Background when the talent is not taken (action.cpp:541-549).",
    },
    {
      simcToken: "heart_strike",
      candidateAbilityGameIds: [206930, 433895],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / heart_strike_t",
      startLine: 14369,
      endLine: 14370,
      sourceNote:
        'create_action dispatches "heart_strike" to heart_strike_t( name, this, options_str ), whose base is ' +
        "heart_strike_base_t( n, p, p->talent.blood.heart_strike ) at sc_death_knight.cpp:11325-11328; " +
        'talent.blood.heart_strike = find_talent_spell( SPECIALIZATION, "Heart Strike" ) at :14898, trait row spell 206930. ' +
        "Under the San'layn Vampiric Strike talent the constructor builds a vampiric_strike_blood_t child on " +
        "spell.vampiric_strike (433895, :11288-11291, :15372) and execute() runs THAT child whenever buffs.vampiric_strike " +
        "is up (:11350-11357), so an observed Vampiric Strike cast is this token executing.",
    },
    {
      simcToken: "blood_boil",
      candidateAbilityGameIds: [50842],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / blood_boil_t",
      startLine: 14357,
      endLine: 14358,
      sourceNote:
        'create_action dispatches "blood_boil" to blood_boil_t, whose base is ' +
        'death_knight_spell_t( "blood_boil", p, p->talent.blood.blood_boil ) at sc_death_knight.cpp:9029-9032; ' +
        'talent.blood.blood_boil = find_talent_spell( SPECIALIZATION, "Blood Boil" ) at :14901, trait row spell 50842. ' +
        "The constructor sets cooldown->hasted = true (:9037): its charge cooldown is haste-scaled.",
    },
    {
      simcToken: "marrowrend",
      candidateAbilityGameIds: [195182],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / marrowrend_t",
      startLine: 14371,
      endLine: 14372,
      sourceNote:
        'create_action dispatches "marrowrend" to marrowrend_t, whose base is ' +
        'death_knight_melee_attack_t( "marrowrend", p, p->talent.blood.marrowrend ) at sc_death_knight.cpp:11662-11667; ' +
        'talent.blood.marrowrend = find_talent_spell( SPECIALIZATION, "Marrowrend" ) at :14900, trait row spell 195182.',
    },
    {
      simcToken: "deaths_caress",
      candidateAbilityGameIds: [195292],
      crossCheck: "NONE_SPECIALIZATION_SPELL",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / deaths_caress_t",
      startLine: 14365,
      endLine: 14366,
      sourceNote:
        'create_action dispatches "deaths_caress" to deaths_caress_t, whose base is ' +
        'death_knight_spell_t( "deaths_caress", p, p->spec.deaths_caress ) at sc_death_knight.cpp:9756-9759; ' +
        'spec.deaths_caress = find_specialization_spell( "Death\'s Caress" ) at :14821, and specialization_spells.inc ' +
        "row { 6, 250, 195292 } is the Blood record. A baseline specialization spell, not a talent.",
    },
    {
      simcToken: "death_and_decay",
      candidateAbilityGameIds: [43265],
      crossCheck: "NONE_SPECIALIZATION_SPELL",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / death_and_decay_t",
      startLine: 14405,
      endLine: 14406,
      sourceNote:
        'create_action dispatches "death_and_decay" to death_and_decay_t, whose base is ' +
        'death_and_decay_base_t( p, "death_and_decay", p->spec.death_and_decay ) at sc_death_knight.cpp:9722-9725; ' +
        "spec.death_and_decay = find_spell( 43265 ) at :14810 — an unconditional lookup, never not_found().",
    },
    {
      simcToken: "any_dnd",
      candidateAbilityGameIds: [43265],
      crossCheck: "NONE_SPECIALIZATION_SPELL",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / any_dnd alias",
      startLine: 14424,
      endLine: 14427,
      sourceNote:
        'create_action maps the "any_dnd" (and "dnd_any") token to create_action( "death_and_decay", options_str ) ' +
        "unconditionally at sc_death_knight.cpp:14424-14427 (the comment mentions Defile; the code does not branch on it). " +
        "The token is therefore the SAME action as death_and_decay, spell 43265, and an observed 43265 cast is " +
        "either token's execution.",
    },
    {
      simcToken: "dancing_rune_weapon",
      candidateAbilityGameIds: [49028],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / dancing_rune_weapon_t",
      startLine: 14361,
      endLine: 14362,
      sourceNote:
        'create_action dispatches "dancing_rune_weapon" to dancing_rune_weapon_t, whose base is ' +
        'death_knight_spell_t( "dancing_rune_weapon", p, p->talent.blood.dancing_rune_weapon ) at sc_death_knight.cpp:9476-9479; ' +
        'talent.blood.dancing_rune_weapon = find_talent_spell( SPECIALIZATION, "Dancing Rune Weapon" ) at :14914, trait row spell 49028. ' +
        "The DBC record carries `_gcd` 1500: a GCD-consuming press. execute() triggers gift_of_the_sanlayn under that " +
        "hero talent (:9513-9514).",
    },
    {
      simcToken: "raise_dead",
      candidateAbilityGameIds: [46585],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / raise_dead_t",
      startLine: 14349,
      endLine: 14350,
      sourceNote:
        'create_action dispatches "raise_dead" to raise_dead_t, whose base is death_knight_summon_spell_t( "raise_dead", p, ' +
        "p->spec.raise_dead->ok() ? p->spec.raise_dead : p->talent.raise_dead ) at sc_death_knight.cpp:12216-12220; " +
        'talent.raise_dead = find_talent_spell( talent_tree::CLASS, "Raise Dead" ) at :14844, trait row spell 46585. ' +
        "The DBC record carries `_gcd` 0. ready() is false while the ghoul pet is active (:12256-12264).",
    },
    {
      simcToken: "vampiric_blood",
      candidateAbilityGameIds: [55233],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / vampiric_blood_t",
      startLine: 14373,
      endLine: 14374,
      sourceNote:
        'create_action dispatches "vampiric_blood" to vampiric_blood_t, whose base is ' +
        'death_knight_spell_t( "vampiric_blood", p, p->talent.blood.vampiric_blood ) at sc_death_knight.cpp:12785-12788; ' +
        'talent.blood.vampiric_blood = find_talent_spell( SPECIALIZATION, "Vampiric Blood" ) at :14903, trait row spell 55233. ' +
        "The DBC record carries `_gcd` 0. execute() triggers buffs.vampiric_blood and nothing else (:12797-12802).",
    },
    {
      simcToken: "consumption",
      candidateAbilityGameIds: [1263824],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / consumption_t",
      startLine: 14359,
      endLine: 14360,
      sourceNote:
        'create_action dispatches "consumption" to consumption_t, whose base is ' +
        'death_knight_empowered_charge_spell_t( "consumption", p, p->talent.blood.consumption, options_str ) at ' +
        'sc_death_knight.cpp:9445-9446; talent.blood.consumption = find_talent_spell( SPECIALIZATION, "Consumption" ) at ' +
        ":14942, trait row spell 1263824. An empowered charge spell: the pinned list names it with empower_to=1, an " +
        "action option this project does not model.",
    },
    {
      simcToken: "reapers_mark",
      candidateAbilityGameIds: [439843],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / reapers_mark_t",
      startLine: 14331,
      endLine: 14332,
      sourceNote:
        'create_action dispatches "reapers_mark" to reapers_mark_t, whose base is ' +
        'death_knight_spell_t( "reapers_mark", p, p->talent.deathbringer.reapers_mark ) at sc_death_knight.cpp:8488-8491; ' +
        'talent.deathbringer.reapers_mark = find_talent_spell( talent_tree::HERO, "Reaper\'s Mark" ) at :15083, trait row ' +
        "spell 439843. A Deathbringer hero talent: background for a San'layn build.",
    },
    {
      simcToken: "arcane_torrent",
      candidateAbilityGameIds: [50613],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / arcane_torrent_t",
      startLine: 11056,
      endLine: 11057,
      sourceNote:
        'player_t::create_action dispatches "arcane_torrent" to arcane_torrent_t, whose base is ' +
        'racial_spell_t( p, "arcane_torrent", p->find_racial_spell( "Arcane Torrent" ) ) at player.cpp:9050-9051. ' +
        "racial_spells.inc row { 0x0200 (Blood Elf), 0x00000020 (Death Knight), 50613 } is the only row a Death Knight " +
        "can resolve. OUTSIDE the Blood rotational decision domain (racial action).",
    },
    {
      simcToken: "fireblood",
      candidateAbilityGameIds: [265221],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / fireblood_t",
      startLine: 11064,
      endLine: 11065,
      sourceNote:
        'player_t::create_action dispatches "fireblood" to fireblood_t, whose base is ' +
        'racial_spell_t( p, "fireblood", p->find_racial_spell( "Fireblood" ) ) at player.cpp:9400-9401. ' +
        'racial_spells.inc: { 0x0800 (Dark Iron Dwarf), 0x3fff, 265221, "Fireblood" }. OUTSIDE the Blood rotational ' +
        "decision domain (racial action).",
    },
    {
      simcToken: "blood_fury",
      candidateAbilityGameIds: [20572],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / blood_fury_t",
      startLine: 11060,
      endLine: 11061,
      sourceNote:
        'player_t::create_action dispatches "blood_fury" to blood_fury_t, built on p->find_racial_spell( "Blood Fury" ). ' +
        "racial_spells.inc row { 0x0002 (Orc), 0x0000002d, 20572 } is the one whose class mask carries the Death Knight " +
        "bit (0x20); the 33697 and 33702 rows are other classes' variants. OUTSIDE the Blood rotational decision domain " +
        "(racial action).",
    },
    {
      simcToken: "berserking",
      candidateAbilityGameIds: [26297],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / berserking_t",
      startLine: 11058,
      endLine: 11059,
      sourceNote:
        'player_t::create_action dispatches "berserking" to berserking_t, built on p->find_racial_spell( "Berserking" ). ' +
        'racial_spells.inc: { 0x0080 (Troll), 0x3fff, 26297, "Berserking" }. OUTSIDE the Blood rotational decision ' +
        "domain (racial action).",
    },
    {
      simcToken: "ancestral_call",
      candidateAbilityGameIds: [274738],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / ancestral_call_t",
      startLine: 11052,
      endLine: 11053,
      sourceNote:
        'player_t::create_action dispatches "ancestral_call" to ancestral_call_t, built on p->find_racial_spell( ' +
        '"Ancestral Call" ). racial_spells.inc: { 0x2000 (Mag\'har Orc), 0x3fff, 274738, "Ancestral Call" }. OUTSIDE ' +
        "the Blood rotational decision domain (racial action).",
    },
  ],
  metaActionLanes: [
    {
      simcToken: "auto_attack",
      triggerGcdMs: 0,
      sourcePath: DK,
      symbol: "auto_attack_t::auto_attack_t",
      line: 7753,
      sourceNote:
        "auto_attack_t's constructor (struct opens at sc_death_knight.cpp:7728) is built on the spell-less " +
        'death_knight_melee_attack_t( "auto_attack", p ) base (:6387, default spell_data_t::nil()) and assigns ' +
        "trigger_gcd = 0_ms at :7753. execute() schedules the main-hand (and off-hand) swing (:7756-7763); ready() " +
        "is `!is_moving() && main_hand_attack->execute_event == nullptr` (:7765-7771).",
    },
    {
      simcToken: "use_item",
      triggerGcdMs: 0,
      sourcePath: "engine/player/player.cpp",
      symbol: "use_item_t::use_item_t",
      line: 9999,
      sourceNote:
        "use_item_t's constructor (struct opens at player.cpp:9847) assigns " +
        "trigger_gcd = timespan_t::zero(). No spell record backs the APL token. OUTSIDE the Blood " +
        "rotational decision domain (item use).",
    },
    {
      simcToken: "use_items",
      triggerGcdMs: 0,
      sourcePath: "engine/player/player.cpp",
      symbol: "use_items_t::use_items_t",
      line: 10232,
      sourceNote:
        "use_items_t's constructor (struct opens at player.cpp:10216) assigns " +
        "trigger_gcd = timespan_t::zero(). OUTSIDE the Blood rotational decision domain (item use).",
    },
    {
      simcToken: "potion",
      triggerGcdMs: 0,
      sourcePath: "engine/player/consumable.cpp",
      symbol: "dbc_consumable_base_t::dbc_consumable_base_t",
      line: 804,
      sourceNote:
        "potion_t (consumable.cpp:428) derives from dbc_consumable_base_t, whose constructor " +
        "(consumable.cpp:791) assigns trigger_gcd = timespan_t::zero(). OUTSIDE the Blood rotational " +
        "decision domain (consumable).",
    },
  ],
};

/**
 * The Brewmaster Monk target's pinned inputs (M11-C1).
 *
 * Monk keeps its class module in its own directory
 * (`engine/class_modules/monk/sc_monk.cpp`); there is no spec module. The
 * racial rows and the player/consumable modules are the files every other
 * target hashes. `talentModule` is hashed because the Fortifying Brew binding
 * rests on `player_talent_t::find_override_spell` (engine/player/talent.cpp).
 */
const MONK_BREWMASTER_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED — the class module every token binding is a hand-reviewed reading of.
  classModule: "engine/class_modules/monk/sc_monk.cpp",
  // HASHED, NEVER PARSED. `find_override_spell` returns the trait's override spell when the talent is enabled.
  talentModule: "engine/player/talent.cpp",
  // HASHED, NEVER PARSED. The racial rows are class-mask readings of this table.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const MONK = "engine/class_modules/monk/sc_monk.cpp";

/**
 * The Brewmaster Monk facts (M11-C1): authority data only, no analyzer.
 *
 * `abilities` are the machine-extracted `_gcd` records of every spell a token
 * of the pinned Brewmaster list (apl_monk.cpp `namespace brewmaster`) can
 * execute, plus ONE record that is deliberately NOT an execution candidate:
 * the Empty the Cellar TALENT record 1262329. Observed-only abilities arrive
 * with the evidence that observes them, not here.
 *
 * Facts a reader should not have to rediscover (all read off the pinned DBC):
 *
 *   - THE BREWS SPLIT. Celestial Brew 322507 and Celestial Infusion 1241059
 *     are `_gcd` 1000 — GCD-consuming. Purifying Brew 119582, Black Ox Brew
 *     115399 and Fortifying Brew 115203 are `_gcd` 0.
 *   - `celestial_brew` BINDS TO TWO RECORDS. create_action builds
 *     celestial_infusion_t when the Celestial Infusion talent is taken
 *     (sc_monk.cpp:5349-5350), and monk_t::create_expression reads every
 *     `cooldown|action|buff.celestial_brew.*` expression through the
 *     celestial_infusion objects under the same talent (:7390-7400). Both are
 *     lane 1000, so the token's lane holds without deciding the talent; the
 *     executed ability id does not.
 *   - `empty_the_cellar` EXECUTES THE DRIVER. The action is built on
 *     talent.brewmaster.empty_the_cellar_driver = find_spell( 1263438 )
 *     (`_gcd` 1000), not on the talent record 1262329 (`_gcd` 0). Recording
 *     the talent id as a candidate would give the token the wrong lane. The
 *     relation is a direct C++ binding, not an effect trigger, so no
 *     `triggerResolutions` entry is declared for it.
 */
const MONK_BREWMASTER_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    // ---- class/spec actions the pinned Brewmaster list names ----
    { abilityGameId: 100780, displayNameEn: "Tiger Palm", baseGcdMs: 1500 },
    { abilityGameId: 205523, displayNameEn: "Blackout Kick", baseGcdMs: 1500 },
    { abilityGameId: 322101, displayNameEn: "Expel Harm", baseGcdMs: 1000 },
    { abilityGameId: 121253, displayNameEn: "Keg Smash", baseGcdMs: 1000 },
    { abilityGameId: 115181, displayNameEn: "Breath of Fire", baseGcdMs: 1000 },
    { abilityGameId: 322507, displayNameEn: "Celestial Brew", baseGcdMs: 1000 },
    { abilityGameId: 1241059, displayNameEn: "Celestial Infusion", baseGcdMs: 1000 },
    { abilityGameId: 119582, displayNameEn: "Purifying Brew", baseGcdMs: 0 },
    { abilityGameId: 115399, displayNameEn: "Black Ox Brew", baseGcdMs: 0 },
    { abilityGameId: 115203, displayNameEn: "Fortifying Brew", baseGcdMs: 0 },
    { abilityGameId: 123986, displayNameEn: "Chi Burst", baseGcdMs: 1500 },
    { abilityGameId: 132578, displayNameEn: "Invoke Niuzao, the Black Ox", baseGcdMs: 1000 },
    { abilityGameId: 325153, displayNameEn: "Exploding Keg", baseGcdMs: 1000 },
    { abilityGameId: 1263438, displayNameEn: "Empty the Cellar", baseGcdMs: 1000 },
    { abilityGameId: 116847, displayNameEn: "Rushing Jade Wind", baseGcdMs: 1500 },
    // ---- NOT an execution candidate: the Empty the Cellar talent record ----
    // Recorded so the lane hazard is pinned mechanically: this record is
    // `_gcd` 0, the executed driver 1263438 is `_gcd` 1000.
    { abilityGameId: 1262329, displayNameEn: "Empty the Cellar", baseGcdMs: 0 },
    // ---- the seven racial tokens of `race_actions`, as a Monk resolves them ----
    { abilityGameId: 33697, displayNameEn: "Blood Fury", baseGcdMs: 0 },
    { abilityGameId: 26297, displayNameEn: "Berserking", baseGcdMs: 0 },
    { abilityGameId: 129597, displayNameEn: "Arcane Torrent", baseGcdMs: 1000 },
    { abilityGameId: 255647, displayNameEn: "Light's Judgment", baseGcdMs: 1500 },
    { abilityGameId: 265221, displayNameEn: "Fireblood", baseGcdMs: 0 },
    { abilityGameId: 274738, displayNameEn: "Ancestral Call", baseGcdMs: 0 },
    { abilityGameId: 312411, displayNameEn: "Bag of Tricks", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "tiger_palm",
      candidateAbilityGameIds: [100780],
      crossCheck: "CLASS_SPELLS",
      sourcePath: MONK,
      symbol: "monk_t::create_action / tiger_palm_t",
      startLine: 5329,
      endLine: 5330,
      sourceNote:
        'create_action dispatches "tiger_palm" to tiger_palm_t, whose base is built on ' +
        "player->baseline.monk.tiger_palm at sc_monk.cpp:836-837; baseline.monk.tiger_palm = find_spell( 100780 ) at " +
        ":5571. class_spells.inc row { 10, 0, 100780 } confirms the id. tiger_palm_t::ready() returns false whenever " +
        "talent.brewmaster.press_the_advantage is taken (:848-853).",
    },
    {
      simcToken: "blackout_kick",
      candidateAbilityGameIds: [205523],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: MONK,
      symbol: "monk_t::create_action / blackout_kick_t",
      startLine: 5331,
      endLine: 5332,
      sourceNote:
        'create_action dispatches "blackout_kick" to blackout_kick_t, whose base is built on ' +
        "( player->specialization() == MONK_BREWMASTER ? player->baseline.brewmaster.blackout_kick : " +
        "player->baseline.monk.blackout_kick ) at sc_monk.cpp:1368-1371; baseline.brewmaster.blackout_kick = " +
        "find_spell( 205523 ) at :5587 — a literal lookup, carried by neither class_spells.inc nor " +
        "specialization_spells.inc, so no table cross-check is available.",
    },
    {
      simcToken: "expel_harm",
      candidateAbilityGameIds: [322101],
      crossCheck: "CLASS_SPELLS",
      sourcePath: MONK,
      symbol: "monk_t::create_action / expel_harm_t",
      startLine: 5333,
      endLine: 5334,
      sourceNote:
        'create_action dispatches "expel_harm" to expel_harm_t, whose base is built on ' +
        "( talent.windwalker.combat_wisdom->ok() ? talent.windwalker.combat_wisdom_expel_harm : " +
        "baseline.monk.expel_harm ) at sc_monk.cpp:4011-4014. Combat Wisdom is a Windwalker specialization talent, " +
        "which a Brewmaster cannot resolve, so the Brewmaster action is baseline.monk.expel_harm = " +
        "find_spell( 322101 ) at :5562. class_spells.inc row { 10, 0, 322101 } confirms the id.",
    },
    {
      simcToken: "keg_smash",
      candidateAbilityGameIds: [121253],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / keg_smash_t",
      startLine: 5363,
      endLine: 5364,
      sourceNote:
        'create_action dispatches "keg_smash" to keg_smash_t, whose base is ' +
        "monk_melee_attack_t( player, name, player->talent.brewmaster.keg_smash ) at sc_monk.cpp:2509-2510; " +
        'talent.brewmaster.keg_smash = _ST( "Keg Smash" ) at :5696, whose Brewmaster trait row carries spell 121253.',
    },
    {
      simcToken: "breath_of_fire",
      candidateAbilityGameIds: [115181],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / breath_of_fire_t",
      startLine: 5347,
      endLine: 5348,
      sourceNote:
        'create_action dispatches "breath_of_fire" to breath_of_fire_t, whose base is ' +
        'monk_spell_t( player, "breath_of_fire", player->talent.brewmaster.breath_of_fire ) at sc_monk.cpp:3267-3268; ' +
        'talent.brewmaster.breath_of_fire = _ST( "Breath of Fire" ) at :5726, trait row spell 115181.',
    },
    {
      simcToken: "celestial_brew",
      candidateAbilityGameIds: [322507, 1241059],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / celestial_brew_t / celestial_infusion_t",
      startLine: 5349,
      endLine: 5352,
      sourceNote:
        'create_action dispatches "celestial_brew" to celestial_infusion_t when talent.brewmaster.celestial_infusion->ok() ' +
        "(:5349-5350), else to celestial_brew_t (:5351-5352). celestial_brew_t is absorb_brew_t( ..., " +
        '"celestial_brew", talent.brewmaster.celestial_brew ) at :4113-4114 (_ST( "Celestial Brew" ) at :5716, spell ' +
        '322507); celestial_infusion_t is absorb_brew_t( ..., "celestial_infusion", talent.brewmaster.celestial_infusion ) ' +
        'at :4121-4122 (_ST( "Celestial Infusion" ) at :5717, spell 1241059). Under the same talent ' +
        "monk_t::create_expression reads cooldown/action/buff.celestial_brew.* through the celestial_infusion " +
        "objects (:7390-7400). Both records are lane 1000, so the token's lane holds without deciding the talent.",
    },
    {
      simcToken: "purifying_brew",
      candidateAbilityGameIds: [119582],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / purifying_brew_t",
      startLine: 5365,
      endLine: 5366,
      sourceNote:
        'create_action dispatches "purifying_brew" to purifying_brew_t, whose base is ' +
        'brew_t<monk_spell_t>( player, "purifying_brew", player->talent.brewmaster.purifying_brew ) at sc_monk.cpp:3487-3488; ' +
        'talent.brewmaster.purifying_brew = _ST( "Purifying Brew" ) at :5697, trait row spell 119582. The DBC record ' +
        "carries `_gcd` 0. ready() is true only while Stagger is ticking (:3497-3502).",
    },
    {
      simcToken: "black_ox_brew",
      candidateAbilityGameIds: [115399],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / black_ox_brew_t",
      startLine: 5369,
      endLine: 5370,
      sourceNote:
        'create_action dispatches "black_ox_brew" to black_ox_brew_t, whose base is ' +
        'brew_t<monk_spell_t>( player, "black_ox_brew", player->talent.brewmaster.black_ox_brew ) at sc_monk.cpp:3108-3109; ' +
        'talent.brewmaster.black_ox_brew = _ST( "Black Ox Brew" ) at :5737, trait row spell 115399. The DBC record ' +
        "carries `_gcd` 0. execute() resets the Purifying Brew, Celestial Brew and Celestial Infusion cooldowns " +
        "(:3122-3130).",
    },
    {
      simcToken: "fortifying_brew",
      candidateAbilityGameIds: [115203],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / fortifying_brew_t",
      startLine: 5341,
      endLine: 5342,
      sourceNote:
        'create_action dispatches "fortifying_brew" to fortifying_brew_t, whose base is brew_t<monk_spell_t>( player, ' +
        '"fortifying_brew", player->talent.monk.fortifying_brew.find_override_spell() ) at sc_monk.cpp:3334-3335; ' +
        'talent.monk.fortifying_brew = _CT( "Fortifying Brew" ) at :5666, whose class trait row carries spell 388917 ' +
        "and id_override_spell 115203. player_talent_t::find_override_spell() returns find_spell( id_override_spell ) " +
        "when the talent is enabled and not_found() otherwise (engine/player/talent.cpp:28-31), so the executed " +
        "record is 115203. The DBC record carries `_gcd` 0.",
    },
    {
      simcToken: "chi_burst",
      candidateAbilityGameIds: [123986],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / chi_burst_t",
      startLine: 5367,
      endLine: 5368,
      sourceNote:
        'create_action dispatches "chi_burst" to chi_burst_t, whose base is monk_spell_t( player, "chi_burst", ' +
        "specialization() == MONK_WINDWALKER ? talent.monk.chi_burst_projectile : talent.monk.chi_burst ) at " +
        'sc_monk.cpp:3022-3025; talent.monk.chi_burst = _CT( "Chi Burst" ) at :5643, trait row spell 123986. ' +
        "chi_burst_t::ready() adds a buff gate for Windwalker only (:3036-3043).",
    },
    {
      simcToken: "invoke_niuzao",
      candidateAbilityGameIds: [132578],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / niuzao_spell_t",
      startLine: 5359,
      endLine: 5360,
      sourceNote:
        'create_action dispatches "invoke_niuzao" (and "invoke_niuzao_the_black_ox", :5361-5362) to niuzao_spell_t, ' +
        'whose base is monk_spell_t( player, "invoke_niuzao_the_black_ox", talent.brewmaster.invoke_niuzao_the_black_ox ) ' +
        "at sc_monk.cpp:3734-3735 — the ACTION is named invoke_niuzao_the_black_ox; talent.brewmaster." +
        'invoke_niuzao_the_black_ox = _ST( "Invoke Niuzao, the Black Ox" ) at :5760, trait row spell 132578.',
    },
    {
      simcToken: "exploding_keg",
      candidateAbilityGameIds: [325153],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / exploding_keg_t",
      startLine: 5357,
      endLine: 5358,
      sourceNote:
        'create_action dispatches "exploding_keg" to exploding_keg_t, whose base is ' +
        'monk_spell_t( player, "exploding_keg", player->talent.brewmaster.exploding_keg ) at sc_monk.cpp:3381-3382; ' +
        'talent.brewmaster.exploding_keg = _ST( "Exploding Keg" ) at :5754, trait row spell 325153.',
    },
    {
      simcToken: "empty_the_cellar",
      candidateAbilityGameIds: [1263438],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: MONK,
      symbol: "monk_t::create_action / empty_the_cellar_t",
      startLine: 5355,
      endLine: 5356,
      sourceNote:
        'create_action dispatches "empty_the_cellar" to empty_the_cellar_t, whose base is monk_spell_t( player, ' +
        '"empty_the_cellar", player->talent.brewmaster.empty_the_cellar_driver ) at sc_monk.cpp:3438-3439; ' +
        "talent.brewmaster.empty_the_cellar_driver = find_spell( 1263438 ) at :5768 (`_gcd` 1000). The talent " +
        'record talent.brewmaster.empty_the_cellar = _ST( "Empty the Cellar" ) at :5766 is spell 1262329 (`_gcd` 0) ' +
        "and is NOT what the action executes. empty_the_cellar_t::ready() returns buff.empty_the_cellar->up() " +
        "(:3447-3450), the buff built from find_spell( 1262768 ) (:5767, :6288-6289).",
    },
    {
      simcToken: "rushing_jade_wind",
      candidateAbilityGameIds: [116847],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / rushing_jade_wind_t",
      startLine: 5389,
      endLine: 5390,
      sourceNote:
        'create_action dispatches "rushing_jade_wind" to rushing_jade_wind_t, whose base is ' +
        'monk_melee_attack_t( player, "rushing_jade_wind", player->talent.brewmaster.rushing_jade_wind ) at ' +
        'sc_monk.cpp:1476-1477; talent.brewmaster.rushing_jade_wind = _ST( "Rushing Jade Wind" ) at :5713, trait row ' +
        "spell 116847.",
    },
    {
      simcToken: "blood_fury",
      candidateAbilityGameIds: [33697],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / blood_fury_t",
      startLine: 11060,
      endLine: 11061,
      sourceNote:
        'player_t::create_action dispatches "blood_fury" to blood_fury_t, built on p->find_racial_spell( "Blood Fury" ) ' +
        "at player.cpp:9132. racial_spells.inc row { 0x0002 (Orc), 0x00000240, 33697 } is the one whose class mask " +
        "carries the Monk bit (0x200); the 33702 and 20572 rows are other classes' variants. OUTSIDE the rotational " +
        "decision domain (racial action).",
    },
    {
      simcToken: "berserking",
      candidateAbilityGameIds: [26297],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / berserking_t",
      startLine: 11058,
      endLine: 11059,
      sourceNote:
        'player_t::create_action dispatches "berserking" to berserking_t, built on p->find_racial_spell( "Berserking" ) ' +
        'at player.cpp:9105. racial_spells.inc: { 0x0080 (Troll), 0x3fff, 26297, "Berserking" }. OUTSIDE the rotational ' +
        "decision domain (racial action).",
    },
    {
      simcToken: "arcane_torrent",
      candidateAbilityGameIds: [129597],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / arcane_torrent_t",
      startLine: 11056,
      endLine: 11057,
      sourceNote:
        'player_t::create_action dispatches "arcane_torrent" to arcane_torrent_t, built on p->find_racial_spell( ' +
        '"Arcane Torrent" ) at player.cpp:9051. racial_spells.inc row { 0x0200 (Blood Elf), 0x00000200 (Monk), 129597 } ' +
        "is the only row a Monk can resolve. OUTSIDE the rotational decision domain (racial action).",
    },
    {
      simcToken: "lights_judgment",
      candidateAbilityGameIds: [255647],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / lights_judgment_t",
      startLine: 11070,
      endLine: 11071,
      sourceNote:
        'player_t::create_action dispatches "lights_judgment" to lights_judgment_t, built on p->find_racial_spell( ' +
        '"Light\'s Judgment" ) at player.cpp:9252. racial_spells.inc: { 0x20000000 (Lightforged Draenei), 0x3fff, ' +
        '255647, "Light\'s Judgment" }. OUTSIDE the rotational decision domain (racial action).',
    },
    {
      simcToken: "fireblood",
      candidateAbilityGameIds: [265221],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / fireblood_t",
      startLine: 11064,
      endLine: 11065,
      sourceNote:
        'player_t::create_action dispatches "fireblood" to fireblood_t, built on p->find_racial_spell( "Fireblood" ) at ' +
        'player.cpp:9401. racial_spells.inc: { 0x0800 (Dark Iron Dwarf), 0x3fff, 265221, "Fireblood" }. OUTSIDE the ' +
        "rotational decision domain (racial action).",
    },
    {
      simcToken: "ancestral_call",
      candidateAbilityGameIds: [274738],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / ancestral_call_t",
      startLine: 11052,
      endLine: 11053,
      sourceNote:
        'player_t::create_action dispatches "ancestral_call" to ancestral_call_t, built on p->find_racial_spell( ' +
        '"Ancestral Call" ) at player.cpp:9360. racial_spells.inc: { 0x2000 (Mag\'har Orc), 0x3fff, 274738, ' +
        '"Ancestral Call" }. OUTSIDE the rotational decision domain (racial action).',
    },
    {
      simcToken: "bag_of_tricks",
      candidateAbilityGameIds: [312411],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / bag_of_tricks_t",
      startLine: 11078,
      endLine: 11079,
      sourceNote:
        'player_t::create_action dispatches "bag_of_tricks" to bag_of_tricks_t, built on p->find_racial_spell( ' +
        '"Bag of Tricks" ) at player.cpp:9465. racial_spells.inc: { 0x1000 (Vulpera), 0x3fff, 312411, ' +
        '"Bag of Tricks" }. OUTSIDE the rotational decision domain (racial action).',
    },
  ],
  metaActionLanes: [
    {
      simcToken: "auto_attack",
      triggerGcdMs: 0,
      sourcePath: MONK,
      symbol: "auto_attack_t::auto_attack_t",
      line: 2299,
      sourceNote:
        "auto_attack_t (struct opens at sc_monk.cpp:2034) is built on the spell-less " +
        'monk_melee_attack_t( player, "auto_attack" ) base and its constructor (:2293) assigns trigger_gcd = 0_ms at ' +
        ":2299.",
    },
    {
      simcToken: "use_items",
      triggerGcdMs: 0,
      sourcePath: "engine/player/player.cpp",
      symbol: "use_items_t::use_items_t",
      line: 10232,
      sourceNote:
        "use_items_t's constructor (struct opens at player.cpp:10216) assigns " +
        "trigger_gcd = timespan_t::zero(). OUTSIDE the rotational decision domain (item use).",
    },
    {
      simcToken: "potion",
      triggerGcdMs: 0,
      sourcePath: "engine/player/consumable.cpp",
      symbol: "dbc_consumable_base_t::dbc_consumable_base_t",
      line: 804,
      sourceNote:
        "potion_t (consumable.cpp:428) derives from dbc_consumable_base_t, whose constructor " +
        "(consumable.cpp:791) assigns trigger_gcd = timespan_t::zero(). OUTSIDE the rotational " +
        "decision domain (consumable).",
    },
  ],
};

/**
 * The Havoc Demon Hunter target's pinned inputs (ONB-A1).
 *
 * Demon Hunter keeps one class module; there is no spec module. The racial row
 * and the player and consumable modules are the files every other target
 * hashes.
 */
const DEMONHUNTER_HAVOC_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED — the class module every token binding is a hand-reviewed reading of.
  classModule: "engine/class_modules/sc_demon_hunter.cpp",
  // HASHED, NEVER PARSED. The racial row is a class-mask reading of this table.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const DEMON_HUNTER = "engine/class_modules/sc_demon_hunter.cpp";

/**
 * The Havoc Demon Hunter facts (ONB-A1).
 *
 * `abilities` are the machine-extracted `_gcd` records of every spell a token
 * of the pinned Havoc list (apl_demon_hunter.cpp `havoc`) can execute. Facts a
 * reader should not have to rediscover (all read off the pinned DBC):
 *
 *   - FELBLADE IS `_gcd` 500, Vengeful Retreat `_gcd` 0, every other token 1500.
 *   - METAMORPHOSIS HAS TWO RECORDS AND ONLY ONE IS THE ACTION. The action is
 *     built on 191427 (`_gcd` 1500). The log reports the leap's IMPACT, 200166,
 *     as a `cast` (`metamorphosis_impact_t`, sc_demon_hunter.cpp:4890-4896) and
 *     never reports 191427. 200166 is recorded with no token binding: it is a
 *     background impact, not the press.
 *   - THE HUNT'S IMPACT 370966 AND FELBLADE'S CHARGE 213243 are logged as casts
 *     too; both are recorded with no token binding, for the same reason.
 *   - THROW GLAIVE IS NOT ALWAYS A PRESS. Screaming Brutality executes background
 *     copies on the same spell (sc_demon_hunter.cpp:7354-7357, :7406-7409), which
 *     log as 185123. The token still binds 185123; the analyzer owns what that
 *     means.
 */
const DEMONHUNTER_HAVOC_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    // ---- class/spec actions the pinned Havoc list names ----
    { abilityGameId: 258920, displayNameEn: "Immolation Aura", baseGcdMs: 1500 },
    { abilityGameId: 191427, displayNameEn: "Metamorphosis", baseGcdMs: 1500 },
    { abilityGameId: 370965, displayNameEn: "The Hunt", baseGcdMs: 1500 },
    { abilityGameId: 198793, displayNameEn: "Vengeful Retreat", baseGcdMs: 0 },
    { abilityGameId: 442294, displayNameEn: "Reaver's Glaive", baseGcdMs: 1500 },
    { abilityGameId: 201427, displayNameEn: "Annihilation", baseGcdMs: 1500 },
    { abilityGameId: 258860, displayNameEn: "Essence Break", baseGcdMs: 1500 },
    { abilityGameId: 210152, displayNameEn: "Death Sweep", baseGcdMs: 1500 },
    { abilityGameId: 185123, displayNameEn: "Throw Glaive", baseGcdMs: 1500 },
    { abilityGameId: 198013, displayNameEn: "Eye Beam", baseGcdMs: 1500 },
    { abilityGameId: 232893, displayNameEn: "Felblade", baseGcdMs: 500 },
    { abilityGameId: 188499, displayNameEn: "Blade Dance", baseGcdMs: 1500 },
    { abilityGameId: 162794, displayNameEn: "Chaos Strike", baseGcdMs: 1500 },
    // ---- NOT execution candidates: what the log reports beside the press ----
    { abilityGameId: 200166, displayNameEn: "Metamorphosis", baseGcdMs: 0 },
    { abilityGameId: 370966, displayNameEn: "The Hunt", baseGcdMs: 0 },
    { abilityGameId: 213243, displayNameEn: "Felblade", baseGcdMs: 0 },
    // ---- the one racial token of the list, as a Demon Hunter resolves it ----
    { abilityGameId: 202719, displayNameEn: "Arcane Torrent", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "immolation_aura",
      candidateAbilityGameIds: [258920],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / immolation_aura_t",
      startLine: 9747,
      endLine: 9748,
      sourceNote:
        'create_action dispatches "immolation_aura" to immolation_aura_t, built on p->spell.immolation_aura at ' +
        'sc_demon_hunter.cpp:4802-4803; spell.immolation_aura = find_class_spell( "Immolation Aura" ) at :10769. ' +
        "class_spells.inc row { 12, 0, 258920 } confirms the id.",
    },
    {
      simcToken: "metamorphosis",
      candidateAbilityGameIds: [191427],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / metamorphosis_t",
      startLine: 9749,
      endLine: 9750,
      sourceNote:
        'create_action dispatches "metamorphosis" to metamorphosis_t, built on p->spec.metamorphosis at ' +
        'sc_demon_hunter.cpp:4902-4903; for Havoc spec.metamorphosis = find_class_spell( "Metamorphosis" ) at ' +
        ":10787, class_spells.inc row { 12, 0, 191427 }. The log reports the leap's impact 200166 as a cast and " +
        "never 191427, so this binding names the action, not the wire id.",
    },
    {
      simcToken: "the_hunt",
      candidateAbilityGameIds: [370965],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / the_hunt_t",
      startLine: 9759,
      endLine: 9760,
      sourceNote:
        'create_action dispatches "the_hunt" to the_hunt_t, built on p->spec.the_hunt at sc_demon_hunter.cpp:5612; ' +
        'for Havoc spec.the_hunt = talent.havoc.the_hunt at :11290, find_talent_spell( SPECIALIZATION, "The Hunt" ) ' +
        "at :11024, whose Havoc trait row carries spell 370965.",
    },
    {
      simcToken: "vengeful_retreat",
      candidateAbilityGameIds: [198793],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / vengeful_retreat_t",
      startLine: 9812,
      endLine: 9813,
      sourceNote:
        'create_action dispatches "vengeful_retreat" to vengeful_retreat_t, built on ' +
        "p->talent.demon_hunter.vengeful_retreat at sc_demon_hunter.cpp:8588-8589; talent.demon_hunter.vengeful_retreat = " +
        'find_talent_spell( CLASS, "Vengeful Retreat" ) at :10868, trait row spell 198793. The DBC record carries _gcd 0.',
    },
    {
      simcToken: "reavers_glaive",
      candidateAbilityGameIds: [442294],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / reavers_glaive_t",
      startLine: 9816,
      endLine: 9817,
      sourceNote:
        'create_action dispatches "reavers_glaive" to reavers_glaive_t, built on p->hero_spec.reavers_glaive at ' +
        "sc_demon_hunter.cpp:8431-8432; for Havoc hero_spec.reavers_glaive = talent_spell_lookup( " +
        "talent.aldrachi_reaver.art_of_the_glaive, 442294 ) at :11317. ready() requires buff.reavers_glaive up (:8461-8464).",
    },
    {
      simcToken: "annihilation",
      candidateAbilityGameIds: [201427],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / annihilation_t",
      startLine: 9792,
      endLine: 9793,
      sourceNote:
        'create_action dispatches "annihilation" to annihilation_t, built on p->spec.annihilation at ' +
        "sc_demon_hunter.cpp:7677-7678; spec.annihilation = find_spell( 201427, DEMON_HUNTER_HAVOC ) at :10837. ready() " +
        "requires buff.metamorphosis up (:7699-7705).",
    },
    {
      simcToken: "essence_break",
      candidateAbilityGameIds: [258860],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / essence_break_t",
      startLine: 9798,
      endLine: 9799,
      sourceNote:
        'create_action dispatches "essence_break" to essence_break_t, built on p->talent.havoc.essence_break at ' +
        'sc_demon_hunter.cpp:7804-7805; talent.havoc.essence_break = find_talent_spell( SPECIALIZATION, "Essence Break" ) ' +
        "at :11034, trait row spell 258860.",
    },
    {
      simcToken: "death_sweep",
      candidateAbilityGameIds: [210152],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / death_sweep_t",
      startLine: 9800,
      endLine: 9801,
      sourceNote:
        'create_action dispatches "death_sweep" to death_sweep_t, built on p->spec.death_sweep at ' +
        "sc_demon_hunter.cpp:7365-7366; spec.death_sweep = find_spell( 210152, DEMON_HUNTER_HAVOC ) at :10844. ready() " +
        "requires buff.metamorphosis up (:7412-7418).",
    },
    {
      simcToken: "throw_glaive",
      candidateAbilityGameIds: [185123],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / throw_glaive_t",
      startLine: 9810,
      endLine: 9811,
      sourceNote:
        'create_action dispatches "throw_glaive" to throw_glaive_t, built on p->spell.throw_glaive at ' +
        'sc_demon_hunter.cpp:8309-8311; for Havoc spell.throw_glaive = find_class_spell( "Throw Glaive" ) at :10781, ' +
        "class_spells.inc row { 12, 0, 185123 }. Background copies under Screaming Brutality execute on the same spell " +
        "(:7354-7357, :7406-7409), so a logged 185123 does not prove a press.",
    },
    {
      simcToken: "eye_beam",
      candidateAbilityGameIds: [198013],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / eye_beam_t",
      startLine: 9739,
      endLine: 9740,
      sourceNote:
        'create_action dispatches "eye_beam" to eye_beam_t, built on p->talent.havoc.eye_beam at ' +
        'sc_demon_hunter.cpp:4095-4096; talent.havoc.eye_beam = find_talent_spell( SPECIALIZATION, "Eye Beam" ) at ' +
        ":10985, trait row spell 198013.",
    },
    {
      simcToken: "felblade",
      candidateAbilityGameIds: [232893],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / felblade_t",
      startLine: 9802,
      endLine: 9803,
      sourceNote:
        'create_action dispatches "felblade" to felblade_t, built on p->talent.demon_hunter.felblade at ' +
        'sc_demon_hunter.cpp:7875-7876; talent.demon_hunter.felblade = find_talent_spell( CLASS, "Felblade" ) at :10869, ' +
        "the Havoc trait row carrying spell 232893.",
    },
    {
      simcToken: "blade_dance",
      candidateAbilityGameIds: [188499],
      crossCheck: "NONE_SPECIALIZATION_SPELL",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / blade_dance_t",
      startLine: 9794,
      endLine: 9795,
      sourceNote:
        'create_action dispatches "blade_dance" to blade_dance_t, built on p->spec.blade_dance at ' +
        'sc_demon_hunter.cpp:7315-7316; spec.blade_dance = find_specialization_spell( "Blade Dance" ) at :10838. ' +
        "ready() is false while buff.metamorphosis is up (:7342-7347).",
    },
    {
      simcToken: "chaos_strike",
      candidateAbilityGameIds: [162794],
      crossCheck: "NONE_SPECIALIZATION_SPELL",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / chaos_strike_t",
      startLine: 9796,
      endLine: 9797,
      sourceNote:
        'create_action dispatches "chaos_strike" to chaos_strike_t, built on p->spec.chaos_strike at ' +
        'sc_demon_hunter.cpp:7638-7640; spec.chaos_strike = find_specialization_spell( "Chaos Strike" ) at :10841. ' +
        "ready() is false while buff.metamorphosis is up (:7662-7669).",
    },
    {
      simcToken: "arcane_torrent",
      candidateAbilityGameIds: [202719],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / arcane_torrent_t",
      startLine: 11056,
      endLine: 11057,
      sourceNote:
        'player_t::create_action dispatches "arcane_torrent" to arcane_torrent_t, built on p->find_racial_spell( ' +
        '"Arcane Torrent" ) at player.cpp:9051. racial_spells.inc row { 0x0200 (Blood Elf), 0x00000800 (Demon Hunter), ' +
        "202719 } is the only row a Demon Hunter can resolve. OUTSIDE the rotational decision domain (racial action).",
    },
  ],
  metaActionLanes: [
    {
      simcToken: "auto_attack",
      triggerGcdMs: 0,
      sourcePath: DEMON_HUNTER,
      symbol: "auto_attack_t::auto_attack_t",
      line: 7006,
      sourceNote:
        'auto_attack_t is built on the spell-less demon_hunter_attack_t( "auto_attack", p, spell_data_t::nil() ) base ' +
        "(sc_demon_hunter.cpp:7002-7003) and its constructor assigns trigger_gcd = timespan_t::zero() at :7006.",
    },
    {
      simcToken: "pick_up_fragment",
      triggerGcdMs: 0,
      sourcePath: DEMON_HUNTER,
      symbol: "pick_up_fragment_t::pick_up_fragment_t",
      line: 5146,
      sourceNote:
        "pick_up_fragment_t is built on spell_data_t::nil() (sc_demon_hunter.cpp:5133-5134) and its constructor assigns " +
        "trigger_gcd = timespan_t::zero() at :5146. It is simulated movement and has no spell or log event of its own.",
    },
    {
      simcToken: "potion",
      triggerGcdMs: 0,
      sourcePath: "engine/player/consumable.cpp",
      symbol: "dbc_consumable_base_t::dbc_consumable_base_t",
      line: 804,
      sourceNote:
        "potion_t (consumable.cpp:428) derives from dbc_consumable_base_t, whose constructor " +
        "(consumable.cpp:791) assigns trigger_gcd = timespan_t::zero(). OUTSIDE the rotational " +
        "decision domain (consumable).",
    },
  ],
};

export const TARGETS = {
  "rogue-assassination": {
    datasetId: DATASET_ID,
    classId: ROGUE_CLASS_ID,
    className: "Rogue",
    sources: SOURCES,
    classModulePath: SOURCES.rogueModule,
    /** Files hashed but never parsed, listed for the run summary. */
    handReviewedPaths: [SOURCES.rogueModule, SOURCES.playerModule, SOURCES.consumableModule],
    requiredFacts: REQUIRED_FACTS,
    defaultOut: "src/data/game/rogue-gcd-semantics.json",
  },
  "paladin-retribution": {
    datasetId: "SIMC_DBC_PALADIN_RETRIBUTION_GCD_SEMANTICS",
    classId: 2,
    className: "Paladin",
    sources: PALADIN_RETRIBUTION_SOURCES,
    classModulePath: PALADIN_RETRIBUTION_SOURCES.classModule,
    handReviewedPaths: [
      PALADIN_RETRIBUTION_SOURCES.classModule,
      PALADIN_RETRIBUTION_SOURCES.specModule,
      PALADIN_RETRIBUTION_SOURCES.racialSpells,
      PALADIN_RETRIBUTION_SOURCES.playerModule,
      PALADIN_RETRIBUTION_SOURCES.consumableModule,
    ],
    requiredFacts: PALADIN_RETRIBUTION_FACTS,
    defaultOut: "src/data/game/paladin-retribution-gcd-semantics.json",
  },
  "deathknight-blood": {
    datasetId: "SIMC_DBC_DEATHKNIGHT_BLOOD_GCD_SEMANTICS",
    classId: 6,
    className: "Death Knight",
    sources: DEATHKNIGHT_BLOOD_SOURCES,
    classModulePath: DEATHKNIGHT_BLOOD_SOURCES.classModule,
    handReviewedPaths: [
      DEATHKNIGHT_BLOOD_SOURCES.classModule,
      DEATHKNIGHT_BLOOD_SOURCES.racialSpells,
      DEATHKNIGHT_BLOOD_SOURCES.playerModule,
      DEATHKNIGHT_BLOOD_SOURCES.consumableModule,
    ],
    requiredFacts: DEATHKNIGHT_BLOOD_FACTS,
    defaultOut: "src/data/game/deathknight-blood-gcd-semantics.json",
  },
  "paladin-protection": {
    datasetId: "SIMC_DBC_PALADIN_PROTECTION_GCD_SEMANTICS",
    classId: 2,
    className: "Paladin",
    sources: PALADIN_PROTECTION_SOURCES,
    classModulePath: PALADIN_PROTECTION_SOURCES.classModule,
    handReviewedPaths: [
      PALADIN_PROTECTION_SOURCES.classModule,
      PALADIN_PROTECTION_SOURCES.specModule,
      PALADIN_PROTECTION_SOURCES.racialSpells,
      PALADIN_PROTECTION_SOURCES.playerModule,
      PALADIN_PROTECTION_SOURCES.consumableModule,
    ],
    requiredFacts: PALADIN_PROTECTION_FACTS,
    defaultOut: "src/data/game/paladin-protection-gcd-semantics.json",
  },
  "monk-brewmaster": {
    datasetId: "SIMC_DBC_MONK_BREWMASTER_GCD_SEMANTICS",
    classId: 10,
    className: "Monk",
    sources: MONK_BREWMASTER_SOURCES,
    classModulePath: MONK_BREWMASTER_SOURCES.classModule,
    handReviewedPaths: [
      MONK_BREWMASTER_SOURCES.classModule,
      MONK_BREWMASTER_SOURCES.talentModule,
      MONK_BREWMASTER_SOURCES.racialSpells,
      MONK_BREWMASTER_SOURCES.playerModule,
      MONK_BREWMASTER_SOURCES.consumableModule,
    ],
    requiredFacts: MONK_BREWMASTER_FACTS,
    defaultOut: "src/data/game/monk-brewmaster-gcd-semantics.json",
  },
  "demonhunter-havoc": {
    datasetId: "SIMC_DBC_DEMONHUNTER_HAVOC_GCD_SEMANTICS",
    classId: 12,
    className: "Demon Hunter",
    sources: DEMONHUNTER_HAVOC_SOURCES,
    classModulePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
    handReviewedPaths: [
      DEMONHUNTER_HAVOC_SOURCES.classModule,
      DEMONHUNTER_HAVOC_SOURCES.racialSpells,
      DEMONHUNTER_HAVOC_SOURCES.playerModule,
      DEMONHUNTER_HAVOC_SOURCES.consumableModule,
    ],
    requiredFacts: DEMONHUNTER_HAVOC_FACTS,
    defaultOut: "src/data/game/demonhunter-havoc-gcd-semantics.json",
  },
};

const DEFAULT_TARGET = TARGETS["rogue-assassination"];

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
// Pure parsers. Exported so their rules are testable without running the CLI.
// --------------------------------------------------------------------------

/**
 * The pinned-hash gate for one input file.
 *
 * Returns a problem string, or `null` when the file is acceptable. An absent
 * expectation is acceptable — that is how a re-pin discovers the new hash — but
 * a MISMATCHED one never is, because the values downstream would be read from
 * bytes nobody reviewed.
 */
export function sourceHashProblem(path, expectedSha256, actualSha256) {
  if (typeof expectedSha256 !== "string") return null;
  if (expectedSha256 === actualSha256) return null;
  return `${path} SHA-256 mismatch\n  expected ${expectedSha256}\n  actual   ${actualSha256}`;
}

/**
 * Reads the build stamp from `client_data_version.inc`.
 *
 * Every field is required. A partial stamp would produce an artifact that looks
 * provenance-bearing while omitting the thing a reader needs to decide whether
 * it applies.
 */
export function parseClientDataVersion(text) {
  const read = (macro, pattern) => {
    const match = new RegExp(`^#define\\s+${macro}\\s+${pattern}\\s*$`, "m").exec(text);
    return match === null ? null : match[1];
  };
  const wowVersion = read("CLIENT_DATA_WOW_VERSION", '"([^"]+)"');
  const hotfixDate = read("CLIENT_DATA_HOTFIX_DATE", '"([^"]+)"');
  const hotfixBuildRaw = read("CLIENT_DATA_HOTFIX_BUILD", "\\((\\d+)\\)");
  const hotfixHash = read("CLIENT_DATA_HOTFIX_HASH", '"([0-9a-f]{64})"');

  const missing = [];
  if (wowVersion === null) missing.push("CLIENT_DATA_WOW_VERSION");
  if (hotfixDate === null) missing.push("CLIENT_DATA_HOTFIX_DATE");
  if (hotfixBuildRaw === null) missing.push("CLIENT_DATA_HOTFIX_BUILD");
  if (hotfixHash === null) missing.push("CLIENT_DATA_HOTFIX_HASH");
  if (missing.length > 0) {
    return { ok: false, error: `client_data_version.inc is missing ${missing.join(", ")}` };
  }
  return {
    ok: true,
    value: { wowVersion, hotfixDate, hotfixBuild: Number.parseInt(hotfixBuildRaw, 10), hotfixHash },
  };
}

/**
 * Derives the flat index of `_gcd` from the `spell_data_t` declaration.
 *
 * Counts scalar members from `_id` up to the first ARRAY member, which is where
 * a generated row stops being flat comma-separated scalars. An upstream field
 * inserted before `_gcd` shifts this index, and the caller aborts rather than
 * reading the neighbouring column.
 */
export function deriveGcdFieldIndex(headerText) {
  const lines = headerText.split(/\r?\n/);

  // The DEFINITION, not the forward declaration. `struct spell_data_t;` appears
  // earlier in the header, and starting there would read the wrong block
  // entirely — silently, which is the one outcome this function exists to stop.
  let bodyStart = -1;
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i]?.trim() !== "struct spell_data_t") continue;
    const next = lines[i + 1]?.trim();
    if (next === "{") {
      bodyStart = i + 2;
      break;
    }
  }
  if (bodyStart < 0) {
    return {
      ok: false,
      error: "spell_data.hpp does not define struct spell_data_t (only a forward declaration?)",
    };
  }

  const member = /^\s*(?:const\s+)?[A-Za-z_][A-Za-z0-9_:<>]*\s*\*?\s+(_[A-Za-z0-9_]+)\s*(\[[^\]]*\])?\s*;/;

  const fields = [];
  for (let i = bodyStart; i < lines.length; i += 1) {
    // Comments are stripped FIRST. A trailing `// ... (enGB)` would otherwise
    // look like a method declaration and end the scan on the very first member.
    const line = (lines[i] ?? "").replace(/\/\/.*$/, "");
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    // The member block ends at the first method declaration. Everything after it
    // is behaviour, not row layout.
    if (trimmed.includes("(")) break;
    const match = member.exec(line);
    if (match === null) continue;
    const [, name, arraySuffix] = match;
    if (arraySuffix !== undefined) break; // first array member ends the flat prefix
    fields.push(name);
  }

  const idAt = fields.indexOf("_id");
  const gcdAt = fields.indexOf("_gcd");
  if (idAt < 0) return { ok: false, error: "spell_data_t declares no _id member" };
  if (gcdAt < 0)
    return { ok: false, error: "spell_data_t declares no _gcd member before its first array member" };
  if (gcdAt < idAt)
    return { ok: false, error: "_gcd is declared before _id, which the row parser cannot handle" };
  return { ok: true, index: gcdAt - idAt, fields };
}

/**
 * Derives the flat field indices this script needs from `spelleffect_data_t`.
 *
 * DIFFERENT FROM `deriveGcdFieldIndex` IN ONE IMPORTANT WAY. That function stops
 * at the first array member, because `_gcd` sits before any. `_trigger_spell_id`
 * sits AFTER `_class_flags[...]`, so the array cannot be a stopping point — the
 * generated row writes it as a single braced group, which the row parser reads
 * as ONE comma-separated slot. This counts it the same way.
 *
 * Derived rather than hard-coded for the same reason as the GCD index: an
 * upstream field insertion must fail loudly, not silently read a neighbour.
 */
export function deriveEffectFieldIndices(headerText) {
  const lines = headerText.split(/\r?\n/);

  let bodyStart = -1;
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i]?.trim() !== "struct spelleffect_data_t") continue;
    if (lines[i + 1]?.trim() === "{") {
      bodyStart = i + 2;
      break;
    }
  }
  if (bodyStart < 0) {
    return { ok: false, error: "spell_data.hpp does not define struct spelleffect_data_t" };
  }

  const member = /^\s*(?:const\s+)?[A-Za-z_][A-Za-z0-9_:<>]*\s*\*?\s+(_[A-Za-z0-9_]+)\s*(\[[^\]]*\])?\s*;/;
  const fields = [];
  for (let i = bodyStart; i < lines.length; i += 1) {
    const line = (lines[i] ?? "").replace(/\/\/.*$/, "");
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.includes("(")) break;
    const match = member.exec(line);
    if (match === null) continue;
    // An array member occupies exactly one braced slot in the generated row.
    fields.push(match[1]);
  }

  const idAt = fields.indexOf("_id");
  const spellAt = fields.indexOf("_spell_id");
  const indexAt = fields.indexOf("_index");
  const triggerAt = fields.indexOf("_trigger_spell_id");
  if (idAt < 0) return { ok: false, error: "spelleffect_data_t declares no _id member" };
  for (const [name, at] of [
    ["_spell_id", spellAt],
    ["_index", indexAt],
    ["_trigger_spell_id", triggerAt],
  ]) {
    if (at < 0) return { ok: false, error: `spelleffect_data_t declares no ${name} member` };
    if (at < idAt) return { ok: false, error: `${name} is declared before _id` };
  }
  return {
    ok: true,
    fields,
    spellIdIndex: spellAt - idAt,
    effectIndexIndex: indexAt - idAt,
    triggerSpellIdIndex: triggerAt - idAt,
  };
}

/** Splits one generated row into its comma-separated slots, braces kept whole. */
function rowSlots(inner) {
  const slots = [];
  let depth = 0;
  let current = "";
  for (const char of inner) {
    if (char === "{") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      current += char;
      continue;
    }
    if (char === "," && depth === 0) {
      slots.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() !== "") slots.push(current.trim());
  return slots;
}

/**
 * Reads `spellId -> effectIndex -> triggerSpellId` from `__spelleffect_data`.
 *
 * Only the wanted spell ids are retained; the table has tens of thousands of
 * rows and nothing else here needs them.
 */
export function parseEffectTriggers(text, wantedSpellIds, indices) {
  const wanted = new Set([...wantedSpellIds].map(Number));
  const bySpell = new Map();
  let rowsScanned = 0;

  const tableAt = text.indexOf("static spelleffect_data_t __spelleffect_data[");
  if (tableAt < 0) return { ok: false, error: "no __spelleffect_data table in the generated spell data" };

  for (const line of text.slice(tableAt).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    const close = trimmed.lastIndexOf("}");
    if (close < 0) continue;
    const slots = rowSlots(trimmed.slice(1, close));
    if (slots.length <= indices.triggerSpellIdIndex) continue;
    rowsScanned += 1;
    const spellId = Number(slots[indices.spellIdIndex]);
    if (!wanted.has(spellId)) continue;
    const effectIndex = Number(slots[indices.effectIndexIndex]);
    const triggerSpellId = Number(slots[indices.triggerSpellIdIndex]);
    if (!Number.isSafeInteger(effectIndex) || !Number.isSafeInteger(triggerSpellId)) continue;
    const forSpell = bySpell.get(spellId) ?? new Map();
    forSpell.set(effectIndex, triggerSpellId);
    bySpell.set(spellId, forSpell);
  }
  if (rowsScanned === 0) return { ok: false, error: "the __spelleffect_data table parsed to zero rows" };
  return { ok: true, bySpell, rowsScanned };
}

/** Reads one C string literal starting at `start`, honouring `\"` and `\\`. */
function readStringLiteral(line, start) {
  if (line[start] !== '"') return null;
  let value = "";
  let index = start + 1;
  while (index < line.length) {
    const char = line[index];
    if (char === "\\") {
      const escaped = line[index + 1];
      if (escaped === undefined) return null;
      value += escaped === "n" ? "\n" : escaped;
      index += 2;
      continue;
    }
    if (char === '"') return { value, next: index + 1 };
    value += char;
    index += 1;
  }
  return null;
}

/**
 * Extracts `{ displayNameEn, baseGcdMs }` for each wanted id from a generated
 * `__spell_data` table.
 *
 * Scans the flat comma-separated scalar prefix of each row only; `_gcd` sits
 * well before the first nested brace, so no brace matching is needed. A wanted
 * id seen twice is reported rather than resolved — an ambiguous record cannot be
 * silently reduced to one reading.
 */
export function parseSpellRecords(text, wantedIds, gcdFieldIndex) {
  const wanted = new Set([...wantedIds].map(Number));
  const found = new Map();
  const duplicates = [];
  let rowsScanned = 0;

  for (const line of text.split(/\r?\n/)) {
    const open = line.indexOf('{ "');
    if (open < 0) continue;
    const name = readStringLiteral(line, open + 2);
    if (name === null) continue;
    rowsScanned += 1;

    const afterName = line.slice(name.next);
    const firstBrace = afterName.indexOf("{");
    const flat = (firstBrace < 0 ? afterName : afterName.slice(0, firstBrace))
      .replace(/^\s*,\s*/, "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    const idRaw = flat[0];
    if (idRaw === undefined || !/^\d+$/.test(idRaw)) continue;
    const abilityGameId = Number.parseInt(idRaw, 10);
    if (!wanted.has(abilityGameId)) continue;

    const gcdRaw = flat[gcdFieldIndex];
    if (gcdRaw === undefined || !/^\d+$/.test(gcdRaw)) {
      return {
        ok: false,
        error: `spell ${abilityGameId} has no readable _gcd at flat index ${gcdFieldIndex} (saw '${String(gcdRaw)}')`,
      };
    }

    const record = { abilityGameId, displayNameEn: name.value, baseGcdMs: Number.parseInt(gcdRaw, 10) };
    if (found.has(abilityGameId)) {
      duplicates.push(abilityGameId);
      continue;
    }
    found.set(abilityGameId, record);
  }

  if (duplicates.length > 0) {
    return {
      ok: false,
      error: `spell ids appear more than once and are ambiguous: ${duplicates.join(", ")}`,
    };
  }
  return { ok: true, records: found, rowsScanned };
}

/**
 * Parses `class_spells.inc` rows: `{ classId, specId, spellId, replacesSpellId, "Name" }`.
 *
 * Used only to CROSS-CHECK class-ability token bindings. It cannot establish a
 * talent-bound binding, and this parser does not pretend otherwise.
 */
export function parseClassSpells(text) {
  const rows = [];
  const row = /^\s*\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*"((?:[^"\\]|\\.)*)"\s*\}\s*,?\s*$/;
  for (const line of text.split(/\r?\n/)) {
    const match = row.exec(line);
    if (match === null) continue;
    rows.push({
      classId: Number.parseInt(match[1], 10),
      specId: Number.parseInt(match[2], 10),
      spellId: Number.parseInt(match[3], 10),
      replacesSpellId: Number.parseInt(match[4], 10),
      displayNameEn: match[5],
    });
  }
  return rows;
}

/**
 * Checks every required fact against what was actually extracted.
 *
 * Returns a list of problems. An empty list is the only thing that licenses
 * writing the artifact.
 */
export function verifyRequiredFacts({
  build,
  records,
  classSpells,
  gcdFieldIndex,
  expectedGcdFieldIndex,
  measuredSourcePaths,
  spellDataText,
  spellDataLayoutText,
  target = DEFAULT_TARGET,
}) {
  const problems = [];
  const REQUIRED_FACTS = target.requiredFacts;
  const knownPaths = new Set(measuredSourcePaths ?? Object.values(target.sources));

  if (gcdFieldIndex !== expectedGcdFieldIndex) {
    problems.push(
      `_gcd is at flat field index ${gcdFieldIndex} in the pinned spell_data.hpp, but this parser reads index ` +
        `${expectedGcdFieldIndex}. The struct layout moved; do not adjust the reader without re-verifying every value.`,
    );
  }

  if (build.wowVersion !== REQUIRED_FACTS.clientDataWowVersion) {
    problems.push(
      `client data build is '${build.wowVersion}', expected '${REQUIRED_FACTS.clientDataWowVersion}'`,
    );
  }
  if (build.hotfixBuild !== REQUIRED_FACTS.clientDataHotfixBuild) {
    problems.push(`hotfix build is ${build.hotfixBuild}, expected ${REQUIRED_FACTS.clientDataHotfixBuild}`);
  }

  for (const anchor of REQUIRED_FACTS.sanityAnchors) {
    const record = records.get(anchor.abilityGameId);
    if (record === undefined) {
      problems.push(
        `sanity anchor ${anchor.abilityGameId} (${anchor.displayNameEn}) is absent from the spell data`,
      );
      continue;
    }
    if (record.baseGcdMs !== anchor.baseGcdMs) {
      problems.push(
        `sanity anchor ${anchor.abilityGameId} (${anchor.displayNameEn}) has _gcd ${record.baseGcdMs}ms, ` +
          `expected ${anchor.baseGcdMs}ms — the column index is probably wrong`,
      );
    }
  }

  for (const expected of REQUIRED_FACTS.abilities) {
    const record = records.get(expected.abilityGameId);
    if (record === undefined) {
      problems.push(
        `required spell ${expected.abilityGameId} (${expected.displayNameEn}) is absent from the spell data`,
      );
      continue;
    }
    if (record.displayNameEn !== expected.displayNameEn) {
      problems.push(
        `spell ${expected.abilityGameId} is named '${record.displayNameEn}', expected '${expected.displayNameEn}'`,
      );
    }
    if (record.baseGcdMs !== expected.baseGcdMs) {
      problems.push(
        `spell ${expected.abilityGameId} (${expected.displayNameEn}) has _gcd ${record.baseGcdMs}ms, ` +
          `expected ${expected.baseGcdMs}ms`,
      );
    }
  }

  // ---- execution identity: resolve declared spells through effect triggers ----
  //
  // MACHINE-VERIFIED. Every declared resolution is checked against the pinned
  // effect table, so "469779 executes as 381623" is derived here rather than
  // asserted in a comment and hand-applied to the candidate list.
  const effectLayout = deriveEffectFieldIndices(spellDataLayoutText ?? "");
  if (!effectLayout.ok) {
    problems.push(`effect field layout: ${effectLayout.error}`);
  }
  const declaredResolutions = REQUIRED_FACTS.tokenBindings.flatMap((binding) =>
    (binding.triggerResolutions ?? []).map((resolution) => ({ binding, resolution })),
  );
  let effectTriggers = null;
  if (effectLayout.ok && declaredResolutions.length > 0) {
    const parsed = parseEffectTriggers(
      spellDataText ?? "",
      declaredResolutions.map((entry) => entry.resolution.declaredSpellId),
      effectLayout,
    );
    if (!parsed.ok) {
      problems.push(`effect trigger table: ${parsed.error}`);
    } else {
      effectTriggers = parsed;
      for (const { binding, resolution } of declaredResolutions) {
        const forSpell = parsed.bySpell.get(resolution.declaredSpellId);
        const actual = forSpell?.get(resolution.effectIndex);
        if (actual === undefined) {
          problems.push(
            `token '${binding.simcToken}': spell ${resolution.declaredSpellId} has no effect at index ` +
              `${resolution.effectIndex} in the pinned effect table`,
          );
          continue;
        }
        if (actual !== resolution.expectedTriggerSpellId) {
          problems.push(
            `token '${binding.simcToken}': spell ${resolution.declaredSpellId} effect ${resolution.effectIndex} ` +
              `triggers ${actual}, expected ${resolution.expectedTriggerSpellId}`,
          );
          continue;
        }
        // The resolved spell must be the one the token actually binds to, or the
        // resolution would be recorded next to a candidate list it disagrees with.
        if (!binding.candidateAbilityGameIds.includes(actual)) {
          problems.push(
            `token '${binding.simcToken}': spell ${resolution.declaredSpellId} resolves to ${actual}, ` +
              `which is not among its execution candidates`,
          );
        }
        // And the resolved spell must never ALSO be listed as a candidate in its
        // unresolved form, which would reintroduce the ambiguity being removed.
        if (binding.candidateAbilityGameIds.includes(resolution.declaredSpellId)) {
          problems.push(
            `token '${binding.simcToken}': spell ${resolution.declaredSpellId} is both resolved through a ` +
              `trigger and listed as an execution candidate`,
          );
        }
      }
    }
  }

  const expectedById = new Map(REQUIRED_FACTS.abilities.map((entry) => [entry.abilityGameId, entry]));
  for (const binding of REQUIRED_FACTS.tokenBindings) {
    if (binding.candidateAbilityGameIds.length === 0) {
      problems.push(`token '${binding.simcToken}' declares no candidate spell id`);
    }
    if (typeof binding.sourceNote !== "string" || binding.sourceNote.length === 0) {
      problems.push(`token '${binding.simcToken}' carries no sourceNote for its hand-reviewed binding`);
    }
    if (
      !Number.isInteger(binding.startLine) ||
      !Number.isInteger(binding.endLine) ||
      binding.startLine > binding.endLine
    ) {
      problems.push(`token '${binding.simcToken}' has a malformed source line range`);
    }

    // THE LOAD-BEARING CHECK for the two-kinds-of-knowledge split: every id a
    // HAND-REVIEWED reading names must be a real MACHINE-EXTRACTED record, so
    // the hand-reviewed half can never introduce a spell the DBC does not have.
    for (const candidate of binding.candidateAbilityGameIds) {
      const extracted = records.get(candidate);
      if (extracted === undefined) {
        problems.push(
          `token '${binding.simcToken}' names spell ${candidate}, which was not extracted from the generated spell data`,
        );
        continue;
      }
      const expected = expectedById.get(candidate);
      if (expected === undefined) {
        problems.push(
          `token '${binding.simcToken}' names spell ${candidate}, which is not part of the declared runtime slice`,
        );
        continue;
      }
      if (extracted.displayNameEn !== expected.displayNameEn || extracted.baseGcdMs !== expected.baseGcdMs) {
        problems.push(
          `token '${binding.simcToken}' names spell ${candidate}, whose extracted record does not match the declared identity`,
        );
      }
    }
    // A binding may name a file other than the Rogue module - the racials are
    // read out of player.cpp. Whichever file it names must be one this run
    // actually hashed, or the recorded hash would belong to a different file.
    const bindingPath = binding.sourcePath ?? target.classModulePath;
    if (!knownPaths.has(bindingPath)) {
      problems.push(
        `token '${binding.simcToken}' cites '${bindingPath}', which this extractor does not hash`,
      );
    }

    if (binding.crossCheck !== "CLASS_SPELLS") continue;

    for (const candidate of binding.candidateAbilityGameIds) {
      const match = classSpells.find(
        (entry) => entry.classId === target.classId && entry.spellId === candidate,
      );
      if (match === undefined) {
        problems.push(
          `token '${binding.simcToken}' claims spell ${candidate} is a ${target.className} class ability, but class_spells.inc has no such row`,
        );
      }
    }
  }

  // ---- meta-action lanes ----
  //
  // Nothing here can be cross-checked against DBC, by construction: these tokens
  // have no spell record. So the checks are structural, and the one that matters
  // most is the LAST one - a token must not be able to get a lane from two
  // different kinds of evidence at once.
  const boundTokens = new Set(REQUIRED_FACTS.tokenBindings.map((binding) => binding.simcToken));
  const seenMetaTokens = new Set();
  for (const meta of REQUIRED_FACTS.metaActionLanes) {
    if (typeof meta.simcToken !== "string" || meta.simcToken.length === 0) {
      problems.push("a meta-action lane has no token");
      continue;
    }
    if (!Number.isInteger(meta.triggerGcdMs) || meta.triggerGcdMs < 0) {
      problems.push(`meta-action '${meta.simcToken}' has a non-integer or negative triggerGcdMs`);
    }
    if (!knownPaths.has(meta.sourcePath)) {
      problems.push(
        `meta-action '${meta.simcToken}' cites '${meta.sourcePath}', which this extractor does not hash`,
      );
    }
    if (!Number.isInteger(meta.line) || meta.line <= 0) {
      problems.push(`meta-action '${meta.simcToken}' has no usable source line`);
    }
    if (typeof meta.sourceNote !== "string" || meta.sourceNote.length === 0) {
      problems.push(`meta-action '${meta.simcToken}' carries no sourceNote`);
    }
    if (seenMetaTokens.has(meta.simcToken)) {
      problems.push(`meta-action '${meta.simcToken}' is declared more than once`);
    }
    seenMetaTokens.add(meta.simcToken);
    if (boundTokens.has(meta.simcToken)) {
      problems.push(
        `token '${meta.simcToken}' has BOTH a spell-id binding and a meta-action lane. One token, one ` +
          "kind of evidence: two would let the same lane be claimed from a DBC row and from a C++ " +
          "constructor at once, with no rule for which wins.",
      );
    }
  }

  return problems;
}

/** The artifact body, built from verified inputs. Deterministic apart from `extractedOn`. */
/** Prettier's `printWidth` for this repository. The generated file must satisfy it. */
const PRINT_WIDTH = 110;

/**
 * Serialises the artifact the way Prettier would.
 *
 * `JSON.stringify(..., 2)` puts every array element on its own line; Prettier
 * keeps a short array inline. Without this the documented reproduce command
 * would emit a file that immediately fails `prettier --check`, and the repo
 * would be one regeneration away from a spurious formatting diff.
 *
 * Only arrays whose every element is a bare integer are collapsed — that is the
 * `candidateAbilityGameIds` shape and nothing else in this artifact. A collapsed
 * line that would exceed `printWidth` is a hard failure rather than a guess,
 * because Prettier would have kept that one wrapped.
 */
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

    // Collect elements until the closing bracket, requiring every one to be a
    // bare integer. Anything else — an object, a string, a nested array — is
    // left exactly as `JSON.stringify` produced it.
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
    // Past `printWidth` Prettier keeps the array wrapped, so we must too. A long
    // STRING value is not wrappable and is left alone either way.
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
  build,
  records,
  extractedOn,
  rogueModuleSha256,
  target = DEFAULT_TARGET,
}) {
  const REQUIRED_FACTS = target.requiredFacts;
  const byPath = new Map(sources.map((source) => [source.path, source.sha256]));
  if (rogueModuleSha256 !== undefined && rogueModuleSha256 !== null) {
    byPath.set(target.classModulePath, rogueModuleSha256);
  }

  /** The measured hash of the file a hand-reviewed reading cites. Never invented. */
  const hashFor = (path) => {
    const sha256 = byPath.get(path);
    if (sha256 === undefined) {
      throw new Error(`cannot record a hand-reviewed reading of ${path} without a measured hash of it`);
    }
    return sha256;
  };

  return {
    artifactVersion: ARTIFACT_VERSION,
    datasetId: target.datasetId,
    artifactRevision: `simc-${commitSha.slice(0, 8)}-${EXTRACTOR_VERSION}`,
    provenance: {
      repository: REPOSITORY,
      commitSha,
      sources,
      clientDataWowVersion: build.wowVersion,
      clientDataHotfixDate: build.hotfixDate,
      clientDataHotfixBuild: build.hotfixBuild,
      clientDataHotfixHash: build.hotfixHash,
      gcdFieldName: "_gcd",
      gcdFieldUnits: "MILLISECONDS",
      /**
       * How the `abilities` half was established. Named explicitly so it cannot
       * be confused with the hand-reviewed half recorded on each token binding.
       */
      abilityDataMethod: MACHINE_EXTRACTED_METHOD,
      extractedOn,
      extractorVersion: EXTRACTOR_VERSION,
      applicabilityNote:
        "Not version-gated at runtime. CombatFight exposes no client-build key, and gameVersion/logVersion " +
        "are Warcraft Logs parser keys, not the World of Warcraft client build — comparing either against " +
        "12.1.0.69587 would be a gate that always passes while appearing rigorous. The build is recorded for " +
        "traceability; a client build moving is a regeneration trigger for a human, not a runtime condition.",
    },
    // Ascending numeric order, so the file is byte-stable across runs.
    abilities: [...records.values()]
      .sort((left, right) => left.abilityGameId - right.abilityGameId)
      .map((record) => ({
        abilityGameId: record.abilityGameId,
        baseGcdMs: record.baseGcdMs,
        displayNameEn: record.displayNameEn,
      })),
    tokenBindings: REQUIRED_FACTS.tokenBindings.map((binding) => ({
      simcToken: binding.simcToken,
      candidateAbilityGameIds: [...binding.candidateAbilityGameIds].sort((left, right) => left - right),
      // A HUMAN read this relation out of C++ control flow. The hash is measured
      // from the file so the reading is reproducible, but the reading itself was
      // never machine-parsed and this record must not imply that it was.
      binding: {
        method: HAND_REVIEWED_BINDING_METHOD,
        sourcePath: binding.sourcePath ?? target.classModulePath,
        sourceSha256: hashFor(binding.sourcePath ?? target.classModulePath),
        symbol: binding.symbol,
        startLine: binding.startLine,
        endLine: binding.endLine,
        sourceNote: binding.sourceNote,
        crossCheck: binding.crossCheck,
      },
      // Present only where a declared spell is NOT the executing one. Records
      // the derivation instead of quietly dropping the id, so a reader can see
      // that 469779 was resolved rather than forgotten.
      ...((binding.triggerResolutions ?? []).length === 0
        ? {}
        : {
            executionResolutions: (binding.triggerResolutions ?? []).map((resolution) => ({
              declaredSpellId: resolution.declaredSpellId,
              effectIndex: resolution.effectIndex,
              resolvedAbilityGameId: resolution.expectedTriggerSpellId,
              method: MACHINE_EXTRACTED_TRIGGER_METHOD,
              sourcePath: target.sources.spellData,
              sourceSha256: hashFor(target.sources.spellData),
              note: resolution.note,
            })),
          }),
    })),
    // A THIRD kind of knowledge, in its own field so it cannot be mistaken for
    // either of the other two. These tokens have no DBC row at all.
    metaActionLanes: REQUIRED_FACTS.metaActionLanes.map((meta) => ({
      simcToken: meta.simcToken,
      triggerGcdMs: meta.triggerGcdMs,
      binding: {
        method: HAND_REVIEWED_TRIGGER_GCD_METHOD,
        sourcePath: meta.sourcePath,
        sourceSha256: hashFor(meta.sourcePath),
        symbol: meta.symbol,
        line: meta.line,
        sourceNote: meta.sourceNote,
      },
    })),
  };
}

// --------------------------------------------------------------------------
// CLI. Runs only when invoked as a script.
// --------------------------------------------------------------------------

async function loadSource(args, key, path) {
  const localFlag = `file-${key}`;
  if (typeof args[localFlag] === "string") {
    return readFileSync(args[localFlag]);
  }
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
  const REQUIRED_FACTS = target.requiredFacts;

  const loaded = {};
  const sources = [];
  for (const [key, path] of Object.entries(target.sources)) {
    const buffer = await loadSource(args, key, path);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const problem = sourceHashProblem(path, args[`expect-${key}-sha256`], sha256);
    if (problem !== null) fail(problem);
    loaded[key] = buffer.toString("utf8");
    sources.push({ path, sha256, byteLength: buffer.length });
  }

  const build = parseClientDataVersion(loaded.clientDataVersion);
  if (!build.ok) fail(build.error);

  const fieldIndex = deriveGcdFieldIndex(loaded.spellDataLayout);
  if (!fieldIndex.ok) fail(fieldIndex.error);

  const wantedIds = [
    ...REQUIRED_FACTS.abilities.map((entry) => entry.abilityGameId),
    ...REQUIRED_FACTS.sanityAnchors.map((entry) => entry.abilityGameId),
  ];
  const parsed = parseSpellRecords(loaded.spellData, wantedIds, GCD_FIELD_INDEX);
  if (!parsed.ok) fail(parsed.error);

  const classSpells = parseClassSpells(loaded.classSpells);
  if (classSpells.length === 0) fail("class_spells.inc yielded no rows; the table format changed");

  const problems = verifyRequiredFacts({
    build: build.value,
    records: parsed.records,
    classSpells,
    gcdFieldIndex: fieldIndex.index,
    expectedGcdFieldIndex: GCD_FIELD_INDEX,
    measuredSourcePaths: new Set(sources.map((source) => source.path)),
    spellDataText: loaded.spellData,
    spellDataLayoutText: loaded.spellDataLayout,
    target,
  });
  if (problems.length > 0) {
    console.error("EXTRACTION FAILED: the pinned data does not exhibit the required facts.\n");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("\nDo not rewrite expectations to match. Report the discrepancy.");
    process.exit(1);
  }

  // The sanity anchors prove the column; they are not part of the runtime slice.
  const anchorIds = new Set(REQUIRED_FACTS.sanityAnchors.map((entry) => entry.abilityGameId));
  const slice = new Map([...parsed.records].filter(([id]) => !anchorIds.has(id)));

  const artifact = buildArtifact({
    commitSha: typeof args.sha === "string" ? args.sha : "UNKNOWN",
    sources,
    build: build.value,
    records: slice,
    extractedOn:
      typeof args["extracted-on"] === "string" ? args["extracted-on"] : new Date().toISOString().slice(0, 10),
    target,
  });

  const outPath = typeof args.out === "string" ? args.out : target.defaultOut;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, formatArtifactJson(artifact), "utf8");

  console.log(`Wrote ${outPath}`);
  console.log(`  commit        ${artifact.provenance.commitSha}`);
  console.log(`  client build  ${artifact.provenance.clientDataWowVersion}`);
  console.log(`  _gcd index    ${fieldIndex.index} (derived from spell_data.hpp)`);
  console.log(`  rows scanned  ${parsed.rowsScanned}`);
  console.log(`  abilities     ${artifact.abilities.length} (${artifact.provenance.abilityDataMethod})`);
  console.log(`  tokens        ${artifact.tokenBindings.length} (${HAND_REVIEWED_BINDING_METHOD})`);
  console.log(`  meta actions  ${artifact.metaActionLanes.length} (${HAND_REVIEWED_TRIGGER_GCD_METHOD})`);
  console.log("  required facts: VERIFIED");
  for (const path of target.handReviewedPaths) {
    console.log(`  NOTE: ${path} was hashed, NOT parsed. Readings of it are hand-reviewed.`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
