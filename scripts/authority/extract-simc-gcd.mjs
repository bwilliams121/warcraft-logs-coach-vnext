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

/**
 * The Warrior targets' pinned inputs (ONB-A2).
 *
 * One class module, shared by every Warrior specialization. Only the facts differ.
 */
const WARRIOR_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED — the class module every token binding is a hand-reviewed reading of.
  classModule: "engine/class_modules/sc_warrior.cpp",
  // HASHED, NEVER PARSED. Present because every target hashes the same shared sources.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const WARRIOR_MODULE_PATH = "engine/class_modules/sc_warrior.cpp";

/**
 * The Windwalker Monk facts (ONB-T1).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the pinned Windwalker list
 * (apl_monk.cpp `namespace windwalker`, `live_apl`) executes. Facts a reader should not have to rediscover:
 *
 *   - THE RECORDS ARE THE DATA'S, NOT THE LIVE GLOBAL. The module says a spec aura lowers monk GCDs by 500 ms at init_finished
 *     (sc_monk.cpp:505-507), so a 1500 record runs at 1000 ms. A lane needs only zero or not zero, and no record here crosses it.
 *   - SLICING WINDS' CONSTRUCTOR SETS trigger_gcd = 1400 ms (:2918) over its record's 1000. Both are on the GCD, so the lane holds, and the extracted number stays the record's.
 *   - THE LOG REPORTS IDS NO TOKEN OF THE LIST BINDS. Chi Explosion 393056, Roll 109132, Flying Serpent Kick 101545, Fortifying Brew 115203, a trinket and a potion are logged
 *     and the list names none of them, so they have no lane record and are excluded.
 *   - THE LIST'S RACIAL, POTION, ITEM AND EXTERNAL-BUFF TOKENS ARE NOT BOUND. They are outside the rotational domain, and the domain
 *     boundary refuses them before any lane is read.
 */
const MONK_WINDWALKER_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 100784, displayNameEn: "Blackout Kick", baseGcdMs: 1500 },
    { abilityGameId: 443028, displayNameEn: "Celestial Conduit", baseGcdMs: 750 },
    { abilityGameId: 113656, displayNameEn: "Fists of Fury", baseGcdMs: 1000 },
    { abilityGameId: 123904, displayNameEn: "Invoke Xuen, the White Tiger", baseGcdMs: 1000 },
    { abilityGameId: 107428, displayNameEn: "Rising Sun Kick", baseGcdMs: 1500 },
    { abilityGameId: 467307, displayNameEn: "Rushing Wind Kick", baseGcdMs: 1500 },
    { abilityGameId: 1217413, displayNameEn: "Slicing Winds", baseGcdMs: 1000 },
    { abilityGameId: 101546, displayNameEn: "Spinning Crane Kick", baseGcdMs: 1500 },
    { abilityGameId: 392983, displayNameEn: "Strike of the Windlord", baseGcdMs: 1000 },
    { abilityGameId: 100780, displayNameEn: "Tiger Palm", baseGcdMs: 1500 },
    { abilityGameId: 322109, displayNameEn: "Touch of Death", baseGcdMs: 1500 },
    { abilityGameId: 122470, displayNameEn: "Touch of Karma", baseGcdMs: 0 },
    { abilityGameId: 152175, displayNameEn: "Whirling Dragon Punch", baseGcdMs: 1000 },
    { abilityGameId: 1249625, displayNameEn: "Zenith", baseGcdMs: 0 },
    { abilityGameId: 1272696, displayNameEn: "Zenith Stomp", baseGcdMs: 1000 },
  ],
  tokenBindings: [
    {
      simcToken: "blackout_kick",
      candidateAbilityGameIds: [100784],
      crossCheck: "CLASS_SPELLS",
      sourcePath: MONK,
      symbol: "monk_t::create_action / blackout_kick_t",
      startLine: 5331,
      endLine: 5332,
      sourceNote:
        'create_action dispatches "blackout_kick" to blackout_kick_t: built on baseline.monk.blackout_kick off a Brewmaster (:1368-1371); find_class_spell( "Blackout Kick" ) at :5564.',
    },
    {
      simcToken: "celestial_conduit",
      candidateAbilityGameIds: [443028],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: MONK,
      symbol: "monk_t::create_action / celestial_conduit_t",
      startLine: 5399,
      endLine: 5400,
      sourceNote:
        'create_action dispatches "celestial_conduit" to celestial_conduit_t: built on talent.conduit_of_the_celestials.celestial_conduit_action (:3836-3837); find_spell( 443028 ) at :5895.',
    },
    {
      simcToken: "fists_of_fury",
      candidateAbilityGameIds: [113656],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / fists_of_fury_t",
      startLine: 5373,
      endLine: 5374,
      sourceNote:
        'create_action dispatches "fists_of_fury" to fists_of_fury_t: built on talent.windwalker.fists_of_fury (:1782); _ST( "Fists of Fury" ) at :5784.',
    },
    {
      simcToken: "invoke_xuen_the_white_tiger",
      candidateAbilityGameIds: [123904],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / xuen_summon_t",
      startLine: 5387,
      endLine: 5388,
      sourceNote:
        'create_action dispatches "invoke_xuen_the_white_tiger" to xuen_summon_t: built on talent.conduit_of_the_celestials.invoke_xuen_the_white_tiger (:3603); _HT( "Invoke Xuen, the White Tiger" ) at :5870.',
    },
    {
      simcToken: "rising_sun_kick",
      candidateAbilityGameIds: [107428],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / rising_sun_kick_t",
      startLine: 5335,
      endLine: 5336,
      sourceNote:
        'create_action dispatches "rising_sun_kick" to rising_sun_kick_t: built on talent.monk.rising_sun_kick (:1110); _CT( "Rising Sun Kick" ) at :5621.',
    },
    {
      simcToken: "rushing_wind_kick",
      candidateAbilityGameIds: [467307],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: MONK,
      symbol: "monk_t::create_action / rushing_wind_kick_t",
      startLine: 5337,
      endLine: 5338,
      sourceNote:
        'create_action dispatches "rushing_wind_kick" to rushing_wind_kick_t: built on talent.windwalker.rushing_wind_kick_action (:1180); find_spell( 467307 ) at :5839.',
    },
    {
      simcToken: "slicing_winds",
      candidateAbilityGameIds: [1217413],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / slicing_winds_t",
      startLine: 5379,
      endLine: 5380,
      sourceNote:
        'create_action dispatches "slicing_winds" to slicing_winds_t: built on talent.windwalker.slicing_winds (:2910); _ST( "Slicing Winds" ) at :5844.',
    },
    {
      simcToken: "spinning_crane_kick",
      candidateAbilityGameIds: [101546],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: MONK,
      symbol: "monk_t::create_action / spinning_crane_kick_t",
      startLine: 5339,
      endLine: 5340,
      sourceNote:
        'create_action dispatches "spinning_crane_kick" to spinning_crane_kick_t: built on baseline.monk.spinning_crane_kick off a Brewmaster (:1572-1575); find_spell( 101546 ) at :5570.',
    },
    {
      simcToken: "strike_of_the_windlord",
      candidateAbilityGameIds: [392983],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / strike_of_the_windlord_t",
      startLine: 5383,
      endLine: 5384,
      sourceNote:
        'create_action dispatches "strike_of_the_windlord" to strike_of_the_windlord_t: built on talent.windwalker.strike_of_the_windlord (:1993); _ST( "Strike of the Windlord" ) at :5823.',
    },
    {
      simcToken: "tiger_palm",
      candidateAbilityGameIds: [100780],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: MONK,
      symbol: "monk_t::create_action / tiger_palm_t",
      startLine: 5329,
      endLine: 5330,
      sourceNote:
        'create_action dispatches "tiger_palm" to tiger_palm_t: built on baseline.monk.tiger_palm (:837); find_spell( 100780 ) at :5571.',
    },
    {
      simcToken: "touch_of_death",
      candidateAbilityGameIds: [322109],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: MONK,
      symbol: "monk_t::create_action / touch_of_death_t",
      startLine: 5343,
      endLine: 5344,
      sourceNote:
        'create_action dispatches "touch_of_death" to touch_of_death_t: built on baseline.monk.touch_of_death (:2655); find_spell( 322109 ) at :5572.',
    },
    {
      simcToken: "touch_of_karma",
      candidateAbilityGameIds: [122470],
      crossCheck: "NONE_SPECIALIZATION_SPELL",
      sourcePath: MONK,
      symbol: "monk_t::create_action / touch_of_karma_t",
      startLine: 5381,
      endLine: 5382,
      sourceNote:
        'create_action dispatches "touch_of_karma" to touch_of_karma_t: built on baseline.windwalker.touch_of_karma (:2773); find_specialization_spell( "Touch of Karma" ) at :5610; its constructor also assigns trigger_gcd = timespan_t::zero(), the record\'s own value.',
    },
    {
      simcToken: "whirling_dragon_punch",
      candidateAbilityGameIds: [152175],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / whirling_dragon_punch_t",
      startLine: 5391,
      endLine: 5392,
      sourceNote:
        'create_action dispatches "whirling_dragon_punch" to whirling_dragon_punch_t: built on talent.windwalker.whirling_dragon_punch (:1875); _ST( "Whirling Dragon Punch" ) at :5824.',
    },
    {
      simcToken: "zenith",
      candidateAbilityGameIds: [1249625],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MONK,
      symbol: "monk_t::create_action / zenith_t",
      startLine: 5393,
      endLine: 5394,
      sourceNote:
        'create_action dispatches "zenith" to zenith_t: built on talent.windwalker.zenith (:3960); _ST( "Zenith" ) at :5805.',
    },
    {
      simcToken: "zenith_stomp",
      candidateAbilityGameIds: [1272696],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: MONK,
      symbol: "monk_t::create_action / zenith_stomp_t",
      startLine: 5395,
      endLine: 5396,
      sourceNote:
        'create_action dispatches "zenith_stomp" to zenith_stomp_t: built on talent.monk.zenith_stomp_damage (:3896); find_spell( 1272696 ) at :5675. The token builds the ZENITH_STOMP_CAST source (:5396), which keeps the record\'s _gcd; only the ZENITH_STOMP_TRIGGER child sets trigger_gcd = 0_ms.',
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
 * The Unholy Death Knight facts (ONB-X5).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the pinned Unholy list
 * (apl_death_knight.cpp `unholy`) executes. Facts a reader should not have to rediscover:
 *
 *   - FIVE TOKENS EACH RUN A SECOND SPELL. dark_transformation, death_coil, epidemic, festering_strike and scourge_strike each hold a
 *     replacement action (sc_death_knight.cpp:6033-6055) that runs while a buff is up, so Blightfall, Necrotic Coil, Graveyard, Festering
 *     Scythe and Vampiric Strike are those tokens executing. The list names none of the five.
 *   - DARK TRANSFORMATION'S `_gcd` IS NOT ITS LANE. The record is 1500 ms as extracted, and its constructor sets trigger_gcd = 0_ms
 *     (:8724). The extractor records the data; deathknight-unholy-gcd-semantics.ts holds the reviewed lane.
 *   - THE LOG REPORTS IDS NO TOKEN OF THE LIST BINDS. Death Charge 444347, Lichborne 49039 and Anti-Magic Shell 48707 are logged and the list never
 *     names them, so they have no lane record and are excluded. Raise Dead appears only in precombat.
 *   - THE LIST'S RACIAL, POTION, ITEM AND EXTERNAL-BUFF TOKENS ARE NOT BOUND. They are outside the rotational domain, and the domain
 *     boundary refuses them before any lane is read.
 */
const DEATHKNIGHT_UNHOLY_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 42650, displayNameEn: "Army of the Dead", baseGcdMs: 1500 },
    { abilityGameId: 1233448, displayNameEn: "Dark Transformation", baseGcdMs: 1500 },
    { abilityGameId: 1271967, displayNameEn: "Blightfall", baseGcdMs: 1500 },
    { abilityGameId: 43265, displayNameEn: "Death and Decay", baseGcdMs: 1500 },
    { abilityGameId: 47541, displayNameEn: "Death Coil", baseGcdMs: 1500 },
    { abilityGameId: 1242174, displayNameEn: "Necrotic Coil", baseGcdMs: 1500 },
    { abilityGameId: 207317, displayNameEn: "Epidemic", baseGcdMs: 1500 },
    { abilityGameId: 383269, displayNameEn: "Graveyard", baseGcdMs: 1500 },
    { abilityGameId: 85948, displayNameEn: "Festering Strike", baseGcdMs: 1500 },
    { abilityGameId: 458128, displayNameEn: "Festering Scythe", baseGcdMs: 1500 },
    { abilityGameId: 77575, displayNameEn: "Outbreak", baseGcdMs: 1500 },
    { abilityGameId: 1247378, displayNameEn: "Putrefy", baseGcdMs: 1500 },
    { abilityGameId: 55090, displayNameEn: "Scourge Strike", baseGcdMs: 1500 },
    { abilityGameId: 433895, displayNameEn: "Vampiric Strike", baseGcdMs: 1500 },
    { abilityGameId: 343294, displayNameEn: "Soul Reaper", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "army_of_the_dead",
      candidateAbilityGameIds: [42650],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / army_of_the_dead_t",
      startLine: 14401,
      endLine: 14402,
      sourceNote:
        'create_action dispatches "army_of_the_dead" to army_of_the_dead_t: built on p->talent.unholy.army_of_the_dead (:8819); find_talent_spell( SPECIALIZATION, "Army of the Dead" ) at :15034, trait row spell 42650.',
    },
    {
      simcToken: "dark_transformation",
      candidateAbilityGameIds: [1233448, 1271967],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / dark_transformation_t",
      startLine: 14403,
      endLine: 14404,
      sourceNote:
        'create_action dispatches "dark_transformation" to dark_transformation_t: built on p->talent.unholy.dark_transformation (:8700); find_talent_spell( SPECIALIZATION, "Dark Transformation" ) at :15018, trait row spell 1233448. The specialization table\'s 325554 "Rank 2" and the buff rows 63560, 344955 and 1235391 are not presses. The constructor sets trigger_gcd = 0_ms (:8724), over the record\'s 1500 ms, a lane src/data/game/deathknight-unholy-gcd-semantics.ts reviews. Under the Blightfall buff its replacement (:8722) runs blightfall_t on spell.blightfall (1271967, :15329), which has no such override, so the token\'s lane depends on the buff. The list holds no blightfall token.',
    },
    {
      simcToken: "death_and_decay",
      candidateAbilityGameIds: [43265],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / death_and_decay_t",
      startLine: 14405,
      endLine: 14406,
      sourceNote:
        'create_action dispatches "death_and_decay" to death_and_decay_t: built on p->spec.death_and_decay (:9725); find_spell( 43265 ) at :14810.',
    },
    {
      simcToken: "death_coil",
      candidateAbilityGameIds: [47541, 1242174],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / death_coil_t",
      startLine: 14407,
      endLine: 14408,
      sourceNote:
        'create_action dispatches "death_coil" to death_coil_t: built on p->spec.death_coil (:9899); find_class_spell( "Death Coil" ) at :14807, row 47541. Under the Forbidden Knowledge buff the constructor\'s replacement (:9907, the rule at :6033-6055) runs necrotic_coil_t on spell.necrotic_coil_action (1242174, :15336), so an observed Necrotic Coil is this token executing. The list holds no necrotic_coil token.',
    },
    {
      simcToken: "epidemic",
      candidateAbilityGameIds: [207317, 383269],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / epidemic_t",
      startLine: 14409,
      endLine: 14410,
      sourceNote:
        'create_action dispatches "epidemic" to epidemic_t: built on p->spec.epidemic (:10370); find_specialization_spell( "Epidemic" ) at :14838, row 207317. Under the Forbidden Knowledge buff the constructor\'s replacement (:10375) runs graveyard_t on spell.graveyard_action (383269, :15339). The list holds no graveyard token.',
    },
    {
      simcToken: "festering_strike",
      candidateAbilityGameIds: [85948, 458128],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / festering_strike_t",
      startLine: 14411,
      endLine: 14412,
      sourceNote:
        'create_action dispatches "festering_strike" to festering_strike_t: built on p->spec.festering_strike (:10452); find_specialization_spell( "Festering Strike" ) at :14835, row 85948. Under the Festering Scythe buff the constructor\'s replacement (:10457) runs festering_scythe_t on spell.festering_scythe (458128, :15308). The list holds no festering_scythe token.',
    },
    {
      simcToken: "outbreak",
      candidateAbilityGameIds: [77575],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / outbreak_t",
      startLine: 14413,
      endLine: 14414,
      sourceNote:
        'create_action dispatches "outbreak" to outbreak_t: built on p->talent.unholy.outbreak (:11985); find_talent_spell( SPECIALIZATION, "Outbreak" ) at :15011, trait row spell 77575.',
    },
    {
      simcToken: "putrefy",
      candidateAbilityGameIds: [1247378],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / putrefy_t",
      startLine: 14417,
      endLine: 14418,
      sourceNote:
        'create_action dispatches "putrefy" to putrefy_t: built on p->talent.unholy.putrefy (:12169); find_talent_spell( SPECIALIZATION, "Putrefy" ) at :15017, trait row spell 1247378. Rows 390220, 1270443 and 1277016 are its damage children, not presses.',
    },
    {
      simcToken: "scourge_strike",
      candidateAbilityGameIds: [55090, 433895],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / scourge_strike_t",
      startLine: 14415,
      endLine: 14416,
      sourceNote:
        "create_action dispatches \"scourge_strike\" to scourge_strike_t: built on p->talent.unholy.scourge_strike (:12631); find_talent_spell( SPECIALIZATION, \"Scourge Strike\" ) at :15013, trait row spell 55090. Under the San'layn Vampiric Strike talent the constructor's replacement (:12636) runs vampiric_strike_unholy_t on spell.vampiric_strike (433895, :15372). 445508 is Nazgrim's, a pet's, and no token binds it.",
    },
    {
      simcToken: "soul_reaper",
      candidateAbilityGameIds: [343294],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / soul_reaper_t",
      startLine: 14419,
      endLine: 14420,
      sourceNote:
        'create_action dispatches "soul_reaper" to soul_reaper_t: built on p->talent.unholy.soul_reaper (:12659); find_talent_spell( SPECIALIZATION, "Soul Reaper" ) at :15028, trait row spell 343294.',
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
        'auto_attack_t is built on death_knight_melee_attack_t( "auto_attack", p ) with no spell data ' +
        "(sc_death_knight.cpp:7732-7733) and its constructor assigns trigger_gcd = 0_ms.",
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
 * The Frost Death Knight facts (ONB-B2).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of
 * the pinned Frost list (apl_death_knight.cpp `frost`) executes. Facts a reader should not have
 * to rediscover (all read off the pinned DBC and module):
 *
 *   - MIND FREEZE IS BUILT ON not_found(). mind_freeze_t asks find_class_spell, and the pinned
 *     table has no row: the spell is talent-only. So its list line is background at this pin.
 *   - THE LOG REPORTS IDS NO ACTION BUILDS. Exterminate (441424, 441426) and the second
 *     Frostwyrm's Fury (1265384) have no record here and no token, so they are excluded.
 *   - THE LIST'S RACIAL, POTION AND ITEM TOKENS ARE NOT BOUND. They are outside the rotational
 *     domain, and the domain boundary refuses them before any lane is read.
 */
const DEATHKNIGHT_FROST_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 49020, displayNameEn: "Obliterate", baseGcdMs: 1500 },
    { abilityGameId: 49184, displayNameEn: "Howling Blast", baseGcdMs: 1500 },
    { abilityGameId: 49143, displayNameEn: "Frost Strike", baseGcdMs: 1500 },
    { abilityGameId: 207230, displayNameEn: "Frostscythe", baseGcdMs: 1500 },
    { abilityGameId: 194913, displayNameEn: "Glacial Advance", baseGcdMs: 1500 },
    { abilityGameId: 196770, displayNameEn: "Remorseless Winter", baseGcdMs: 1500 },
    { abilityGameId: 51271, displayNameEn: "Pillar of Frost", baseGcdMs: 0 },
    { abilityGameId: 1249658, displayNameEn: "Breath of Sindragosa", baseGcdMs: 0 },
    { abilityGameId: 439843, displayNameEn: "Reaper's Mark", baseGcdMs: 1500 },
    { abilityGameId: 279302, displayNameEn: "Frostwyrm's Fury", baseGcdMs: 1500 },
    { abilityGameId: 46585, displayNameEn: "Raise Dead", baseGcdMs: 0 },
    { abilityGameId: 47568, displayNameEn: "Empower Rune Weapon", baseGcdMs: 750 },
    { abilityGameId: 47528, displayNameEn: "Mind Freeze", baseGcdMs: 0 },
    { abilityGameId: 48707, displayNameEn: "Anti-Magic Shell", baseGcdMs: 0 },
  ],
  tokenBindings: [
    {
      simcToken: "obliterate",
      candidateAbilityGameIds: [49020],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / obliterate_t",
      startLine: 14391,
      endLine: 14392,
      sourceNote:
        'create_action dispatches "obliterate" to obliterate_t, built on p->talent.frost.obliterate (:11855-11856); find_talent_spell( SPECIALIZATION, "Obliterate" ) at :14958, trait row spell 49020. The wire agrees: 104 and 103 casts on the two retained subjects.',
    },
    {
      simcToken: "howling_blast",
      candidateAbilityGameIds: [49184],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / howling_blast_t",
      startLine: 14389,
      endLine: 14390,
      sourceNote:
        'create_action dispatches "howling_blast" to howling_blast_t, built on p->talent.frost.howling_blast (:11460-11461); find_talent_spell( SPECIALIZATION, "Howling Blast" ) at :14959, trait row spell 49184.',
    },
    {
      simcToken: "frost_strike",
      candidateAbilityGameIds: [49143],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / frost_strike_t",
      startLine: 14381,
      endLine: 14382,
      sourceNote:
        'create_action dispatches "frost_strike" to frost_strike_t, built on p->talent.frost.frost_strike (:10933-10934); find_talent_spell( SPECIALIZATION, "Frost Strike" ) at :14956, trait row spell 49143.',
    },
    {
      simcToken: "frostscythe",
      candidateAbilityGameIds: [207230],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / frostscythe_t",
      startLine: 14383,
      endLine: 14384,
      sourceNote:
        'create_action dispatches "frostscythe" to frostscythe_t, built on p->talent.frost.frostscythe (:10535-10536); find_talent_spell( SPECIALIZATION, "Frostscythe" ) at :14963, trait row spell 207230.',
    },
    {
      simcToken: "glacial_advance",
      candidateAbilityGameIds: [194913],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / glacial_advance_t",
      startLine: 14387,
      endLine: 14388,
      sourceNote:
        'create_action dispatches "glacial_advance" to glacial_advance_t, built on p->spec.glacial_advance (:11111-11112); find_specialization_spell( "Glacial Advance" ) at :14830, class_spells.inc row { 6, 251, 194913 }.',
    },
    {
      simcToken: "remorseless_winter",
      candidateAbilityGameIds: [196770],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / remorseless_winter_t",
      startLine: 14395,
      endLine: 14396,
      sourceNote:
        'create_action dispatches "remorseless_winter" to remorseless_winter_t, built on p->spec.remorseless_winter (:12435-12436); find_specialization_spell( "Remorseless Winter" ) at :14826, class_spells.inc row { 6, 251, 196770 }.',
    },
    {
      simcToken: "pillar_of_frost",
      candidateAbilityGameIds: [51271],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / pillar_of_frost_t",
      startLine: 14393,
      endLine: 14394,
      sourceNote:
        'create_action dispatches "pillar_of_frost" to pillar_of_frost_t, built on p->talent.frost.pillar_of_frost (:12008-12009); find_talent_spell( SPECIALIZATION, "Pillar of Frost" ) at :14972, trait row spell 51271.',
    },
    {
      simcToken: "breath_of_sindragosa",
      candidateAbilityGameIds: [1249658],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / breath_of_sindragosa_t",
      startLine: 14377,
      endLine: 14378,
      sourceNote:
        'create_action dispatches "breath_of_sindragosa" to breath_of_sindragosa_t, built on p->talent.frost.breath_of_sindragosa (:9235-9236); find_talent_spell( SPECIALIZATION, "Breath of Sindragosa" ) at :15003, trait row spell 1249658.',
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
        'create_action dispatches "reapers_mark" to reapers_mark_t, built on p->talent.deathbringer.reapers_mark (:8490-8491); find_talent_spell( HERO, "Reaper\'s Mark" ) at :15083, trait row spell 439843.',
    },
    {
      simcToken: "frostwyrms_fury",
      candidateAbilityGameIds: [279302],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / frostwyrms_fury_t",
      startLine: 14385,
      endLine: 14386,
      sourceNote:
        'create_action dispatches "frostwyrms_fury" to frostwyrms_fury_t, built on p->talent.frost.frostwyrms_fury (:10697-10698); find_talent_spell( SPECIALIZATION, "Frostwyrm\'s Fury" ) at :14979, trait row spell 279302. The log also reports 1265384 once per 279302 on both retained subjects; that id is not built by this action, so it has no lane record here and no token.',
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
        'create_action dispatches "raise_dead" to raise_dead_t, on p->spec.raise_dead when that is ok and p->talent.raise_dead otherwise (:12218-12220). Frost has no specialization row for it (class_spells.inc holds { 6, 252, 46584 } for Unholy only), so it builds on talent.raise_dead = find_talent_spell( CLASS, "Raise Dead" ) at :14844, trait row spell 46585.',
    },
    {
      simcToken: "empower_rune_weapon",
      candidateAbilityGameIds: [47568],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / empower_rune_weapon_t",
      startLine: 14379,
      endLine: 14380,
      sourceNote:
        'create_action dispatches "empower_rune_weapon" to empower_rune_weapon_t, built on p->talent.frost.empower_rune_weapon (:10148-10149); find_talent_spell( SPECIALIZATION, "Empower Rune Weapon" ) at :14962, trait row spell 47568.',
    },
    {
      simcToken: "mind_freeze",
      candidateAbilityGameIds: [47528],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / mind_freeze_t",
      startLine: 14347,
      endLine: 14348,
      sourceNote:
        'create_action dispatches "mind_freeze" to mind_freeze_t, built on p->find_class_spell( "Mind Freeze" ) (:11728-11729). class_spells.inc has no such row, the spell being talent-only (talent.mindfreeze at :14850, trait row spell 47528), so the action is built on not_found() and is background (action.cpp:541-549). The id is bound so a logged Mind Freeze reads NON_GCD. OUTSIDE offensive authority by domain: an interrupt.',
    },
    {
      simcToken: "antimagic_shell",
      candidateAbilityGameIds: [48707],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DK,
      symbol: "death_knight_t::create_action / antimagic_shell_t",
      startLine: 14335,
      endLine: 14336,
      sourceNote:
        'create_action dispatches "antimagic_shell" to antimagic_shell_t, built on p->spec.antimagic_shell (:12697-12698); find_class_spell( "Anti-Magic Shell" ) at :14813, class_spells.inc row { 6, 0, 48707 }. OUTSIDE offensive authority by domain: a defensive.',
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
        'auto_attack_t is built on death_knight_melee_attack_t( "auto_attack", p ) with no spell data ' +
        "(sc_death_knight.cpp:7732-7733) and its constructor assigns trigger_gcd = 0_ms.",
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

const SHAMAN_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED — the class module every token binding is a hand-reviewed reading of.
  classModule: "engine/class_modules/sc_shaman.cpp",
  // HASHED, NEVER PARSED. Present because every target hashes the same shared sources.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const SHAMAN_MODULE_PATH = "engine/class_modules/sc_shaman.cpp";

/**
 * The Enhancement Shaman facts (ONB-B2).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of
 * the pinned Enhancement list (sc_shaman.cpp `init_action_list_enhancement`) executes. Facts a
 * reader should not have to rediscover:
 *
 *   - WIND SHEAR IS NOT HERE. Its list statement is the spell-gated add_action form, and it has
 *     no class or specialization row, so that line does not exist at this pin.
 *   - DOOM WINDS BINDS THE TALENT, NOT WHAT THE LOG REPORTS. 469270 is its damage child.
 *   - BLOODLUST BINDS 2825 ONLY. Heroism has its own row and no action here.
 *   - FLAME SHOCK BINDS THE CLASS ROW 470411. The action is built on 188389, `_gcd` 0, and takes
 *     its trigger_gcd from the class row in its constructor, so that row is what makes it a GCD action.
 *   - DOOM WINDS AND BLOODLUST ARE `_gcd` 0, SO THEY ARE NON_GCD. SURGING TOTEM IS 1000.
 *   - THE LIST'S RACIAL, POTION, ITEM AND IMBUE TOKENS ARE NOT BOUND. The imbues appear only in
 *     precombat, which nothing here selects from.
 */
const SHAMAN_ENHANCEMENT_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 2825, displayNameEn: "Bloodlust", baseGcdMs: 0 },
    { abilityGameId: 470057, displayNameEn: "Voltaic Blaze", baseGcdMs: 1500 },
    { abilityGameId: 470411, displayNameEn: "Flame Shock", baseGcdMs: 1500 },
    { abilityGameId: 444995, displayNameEn: "Surging Totem", baseGcdMs: 1000 },
    { abilityGameId: 114051, displayNameEn: "Ascendance", baseGcdMs: 1500 },
    { abilityGameId: 197214, displayNameEn: "Sundering", baseGcdMs: 1500 },
    { abilityGameId: 60103, displayNameEn: "Lava Lash", baseGcdMs: 1500 },
    { abilityGameId: 384352, displayNameEn: "Doom Winds", baseGcdMs: 0 },
    { abilityGameId: 187874, displayNameEn: "Crash Lightning", baseGcdMs: 1500 },
    { abilityGameId: 115356, displayNameEn: "Windstrike", baseGcdMs: 1500 },
    { abilityGameId: 17364, displayNameEn: "Stormstrike", baseGcdMs: 1500 },
    { abilityGameId: 452201, displayNameEn: "Tempest", baseGcdMs: 1500 },
    { abilityGameId: 1218090, displayNameEn: "Primordial Storm", baseGcdMs: 1500 },
    { abilityGameId: 188443, displayNameEn: "Chain Lightning", baseGcdMs: 1500 },
    { abilityGameId: 188196, displayNameEn: "Lightning Bolt", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "bloodlust",
      candidateAbilityGameIds: [2825],
      crossCheck: "CLASS_SPELLS",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / bloodlust_t",
      startLine: 10345,
      endLine: 10346,
      sourceNote:
        'create_action dispatches "bloodlust" to bloodlust_t, built on player->find_class_spell( "Bloodlust" ) (:6259-6260), class_spells.inc row { 7, 0, 2825 }. Heroism (32182) has its own row and no action of its own in this module, so nothing here binds it: a logged Heroism has no lane record and is excluded, never judged.',
    },
    {
      simcToken: "voltaic_blaze",
      candidateAbilityGameIds: [470057],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / voltaic_blaze_t",
      startLine: 10417,
      endLine: 10418,
      sourceNote:
        'create_action dispatches "voltaic_blaze" to voltaic_blaze_t, built on player->talent.voltaic_blaze (:10111-10112), trait row spell 470057.',
    },
    {
      simcToken: "flame_shock",
      candidateAbilityGameIds: [470411],
      crossCheck: "CLASS_SPELLS",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / flame_shock_t",
      startLine: 10352,
      endLine: 10353,
      sourceNote:
        'create_action dispatches "flame_shock" to flame_shock_t, built on player->find_spell( 188389 ) (:8343-8346), a record whose _gcd is 0; its constructor takes the cooldown and trigger_gcd from find_class_spell( "Flame Shock" ) (:8352-8353), class_spells.inc row { 7, 0, 470411 }, _gcd 1500. So this token binds the class row: the action consumes a GCD, and binding 188389 would read it as off-GCD. No retained capture holds a Flame Shock cast, so which id the log reports is not corroborated; a logged 188389 has no lane record and is excluded.',
    },
    {
      simcToken: "surging_totem",
      candidateAbilityGameIds: [444995],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / surging_totem_spell_t",
      startLine: 10437,
      endLine: 10438,
      sourceNote:
        'create_action dispatches "surging_totem" to surging_totem_spell_t, built on p->find_spell( 444995 ) (:9538-9540); the talent itself (spell 455630) gates it at :9561.',
    },
    {
      simcToken: "ascendance",
      candidateAbilityGameIds: [114051],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / ascendance_t",
      startLine: 10341,
      endLine: 10342,
      sourceNote:
        'create_action dispatches "ascendance" to ascendance_t, built on player->spell.ascendance (:8557-8559); spell.ascendance = find_spell( 114051 ) for Enhancement at :11420. Its ready() refuses without talent.ascendance (:8686-8691), a usability claim this slice does not make.',
    },
    {
      simcToken: "sundering",
      candidateAbilityGameIds: [197214],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / sundering_t",
      startLine: 10409,
      endLine: 10410,
      sourceNote:
        'create_action dispatches "sundering" to sundering_t, built on player->talent.sundering (:5708-5709), trait row spell 197214.',
    },
    {
      simcToken: "lava_lash",
      candidateAbilityGameIds: [60103],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / lava_lash_t",
      startLine: 10401,
      endLine: 10402,
      sourceNote:
        'create_action dispatches "lava_lash" to lava_lash_t, built on player->talent.lava_lash (:5167-5168); _CT( "Lava Lash" ) at :11153, trait row spell 60103.',
    },
    {
      simcToken: "doom_winds",
      candidateAbilityGameIds: [384352],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / doom_winds_t",
      startLine: 10415,
      endLine: 10416,
      sourceNote:
        'create_action dispatches "doom_winds" to doom_winds_t, built on player->talent.doom_winds (:8795-8796), trait row spell 384352. The log reports 469270, doom_winds_damage on find_spell( 469270 ) (:8785), triggered by effect row 1183511 of 384352: ten of those in 151 s on the filtered M13-A capture cannot be a 90 s cooldown press, so that id is NOT bound. It has no lane record here and is excluded.',
    },
    {
      simcToken: "crash_lightning",
      candidateAbilityGameIds: [187874],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / crash_lightning_t",
      startLine: 10393,
      endLine: 10394,
      sourceNote:
        'create_action dispatches "crash_lightning" to crash_lightning_t, built on player->talent.crash_lightning (:5926-5927), trait row spell 187874.',
    },
    {
      simcToken: "windstrike",
      candidateAbilityGameIds: [115356],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / windstrike_t",
      startLine: 10411,
      endLine: 10412,
      sourceNote:
        'create_action dispatches "windstrike" to windstrike_t, built on player->find_spell( 115356 ) (:5665-5667).',
    },
    {
      simcToken: "stormstrike",
      candidateAbilityGameIds: [17364],
      crossCheck: "CLASS_SPELLS",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / stormstrike_t",
      startLine: 10407,
      endLine: 10408,
      sourceNote:
        'create_action dispatches "stormstrike" to stormstrike_t, built on player->spec.stormstrike (:5622-5624); find_specialization_spell( "Stormstrike" ) at :11126, class_spells.inc row { 7, 263, 17364 }.',
    },
    {
      simcToken: "tempest",
      candidateAbilityGameIds: [452201],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / tempest_t",
      startLine: 10372,
      endLine: 10373,
      sourceNote:
        'create_action dispatches "tempest" to tempest_t, built on player->find_spell( 452201 ) (:9875-9876). The talent itself is spell 454009.',
    },
    {
      simcToken: "primordial_storm",
      candidateAbilityGameIds: [1218090],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / primordial_storm_t",
      startLine: 10419,
      endLine: 10420,
      sourceNote:
        'create_action dispatches "primordial_storm" to primordial_storm_t, built on player->find_spell( 1218090 ) (:9702-9703). The talent itself is spell 1218047.',
    },
    {
      simcToken: "chain_lightning",
      candidateAbilityGameIds: [188443],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / chain_lightning_t",
      startLine: 10360,
      endLine: 10361,
      sourceNote:
        'create_action dispatches "chain_lightning" to chain_lightning_t, built on player->talent.chain_lightning (:6463-6464); _CT( "Chain Lightning" ) at :11154, trait row spell 188443.',
    },
    {
      simcToken: "lightning_bolt",
      candidateAbilityGameIds: [188196],
      crossCheck: "CLASS_SPELLS",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "shaman_t::create_action / lightning_bolt_t",
      startLine: 10358,
      endLine: 10359,
      sourceNote:
        'create_action dispatches "lightning_bolt" to lightning_bolt_t, built on player->find_class_spell( "Lightning Bolt" ) (:7356-7357), class_spells.inc row { 7, 0, 188196 }.',
    },
  ],
  metaActionLanes: [
    {
      simcToken: "auto_attack",
      triggerGcdMs: 0,
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "auto_attack_t::auto_attack_t",
      line: 5104,
      sourceNote:
        'auto_attack_t is built on shaman_attack_t( "auto_attack", player, spell_data_t::nil() ) ' +
        "(sc_shaman.cpp:5081-5082) and its constructor assigns trigger_gcd = 0_ms.",
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
 * The Arms Warrior facts (ONB-B1).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of
 * the pinned Arms list (apl_warrior.cpp `arms`) executes. Facts a reader should not have to
 * rediscover (all read off the pinned DBC):
 *
 *   - AVATAR, CHARGE AND PUMMEL ARE `_gcd` 0. SWEEPING STRIKES IS 750, SO IT CONSUMES A GCD.
 *     Every other token is 1500.
 *   - EXECUTE BINDS TWO RECORDS. Massacre overrides 163201 with 281000, and the log reports the
 *     override. Both are 1500.
 *   - BLADESTORM BINDS TWO RECORDS. Unrelenting Onslaught swaps the action onto 446035
 *     (sc_warrior.cpp:7316). Both are 1500.
 *   - THE LIST'S RACIAL, POTION AND ITEM TOKENS ARE NOT BOUND. They are outside the rotational
 *     domain, and the domain boundary refuses them before any lane is read.
 */
const WARRIOR_ARMS_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 100, displayNameEn: "Charge", baseGcdMs: 0 },
    { abilityGameId: 6552, displayNameEn: "Pummel", baseGcdMs: 0 },
    { abilityGameId: 107574, displayNameEn: "Avatar", baseGcdMs: 0 },
    { abilityGameId: 260708, displayNameEn: "Sweeping Strikes", baseGcdMs: 750 },
    { abilityGameId: 12294, displayNameEn: "Mortal Strike", baseGcdMs: 1500 },
    { abilityGameId: 7384, displayNameEn: "Overpower", baseGcdMs: 1500 },
    { abilityGameId: 163201, displayNameEn: "Execute", baseGcdMs: 1500 },
    { abilityGameId: 281000, displayNameEn: "Execute", baseGcdMs: 1500 },
    { abilityGameId: 1269383, displayNameEn: "Heroic Strike", baseGcdMs: 1500 },
    { abilityGameId: 845, displayNameEn: "Cleave", baseGcdMs: 1500 },
    { abilityGameId: 772, displayNameEn: "Rend", baseGcdMs: 1500 },
    { abilityGameId: 167105, displayNameEn: "Colossus Smash", baseGcdMs: 1500 },
    { abilityGameId: 1464, displayNameEn: "Slam", baseGcdMs: 1500 },
    { abilityGameId: 1680, displayNameEn: "Whirlwind", baseGcdMs: 1500 },
    { abilityGameId: 227847, displayNameEn: "Bladestorm", baseGcdMs: 1500 },
    { abilityGameId: 446035, displayNameEn: "Bladestorm", baseGcdMs: 1500 },
    { abilityGameId: 228920, displayNameEn: "Ravager", baseGcdMs: 1500 },
    { abilityGameId: 376079, displayNameEn: "Champion's Spear", baseGcdMs: 1500 },
    { abilityGameId: 436358, displayNameEn: "Demolish", baseGcdMs: 1500 },
    { abilityGameId: 384110, displayNameEn: "Wrecking Throw", baseGcdMs: 1500 },
    { abilityGameId: 107570, displayNameEn: "Storm Bolt", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "charge",
      candidateAbilityGameIds: [100],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / charge_t",
      startLine: 7321,
      endLine: 7322,
      sourceNote:
        'create_action dispatches "charge" to charge_t, built on p->spell.charge (sc_warrior.cpp:3384); spell.charge = find_class_spell( "Charge" ) at :7449, class_spells.inc row { 1, 0, 100 }. The log also reports the impact 126664, which has no lane record here and no token.',
    },
    {
      simcToken: "pummel",
      candidateAbilityGameIds: [6552],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / pummel_t",
      startLine: 7370,
      endLine: 7371,
      sourceNote:
        'create_action dispatches "pummel" to pummel_t, built on p->find_class_spell( "Pummel" ) (:4887-4888), class_spells.inc row { 1, 0, 6552 }. OUTSIDE offensive authority by domain: an interrupt.',
    },
    {
      simcToken: "avatar",
      candidateAbilityGameIds: [107574],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / avatar_t",
      startLine: 7303,
      endLine: 7304,
      sourceNote:
        'create_action dispatches "avatar" to avatar_t, built on talents.shared.avatar (:7304); for Arms talents.arms.avatar = find_talent_spell( SPECIALIZATION, "Avatar", WARRIOR_ARMS ) at :7643, shared at :7928, trait row spell 107574.',
    },
    {
      simcToken: "sweeping_strikes",
      candidateAbilityGameIds: [260708],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / sweeping_strikes_t",
      startLine: 7408,
      endLine: 7409,
      sourceNote:
        'create_action dispatches "sweeping_strikes" to sweeping_strikes_t, built on p->spec.sweeping_strikes (:5280-5281); spec.sweeping_strikes = find_specialization_spell( "Sweeping Strikes" ) at :7474, specialization_spells.inc row { 1, 71, 260708 }. Its _gcd is 750, so it consumes a GCD.',
    },
    {
      simcToken: "mortal_strike",
      candidateAbilityGameIds: [12294],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / mortal_strike_t",
      startLine: 7362,
      endLine: 7363,
      sourceNote:
        'create_action dispatches "mortal_strike" to mortal_strike_t, built on p->talents.arms.mortal_strike (:3024-3025); find_talent_spell( SPECIALIZATION, "Mortal Strike" ) at :7593, trait row spell 12294. Unhinged runs background copies on the same spell (:3252-3254, :3324), so a logged 12294 is not always a press.',
    },
    {
      simcToken: "overpower",
      candidateAbilityGameIds: [7384],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / overpower_t",
      startLine: 7366,
      endLine: 7367,
      sourceNote:
        'create_action dispatches "overpower" to overpower_t, built on p->talents.arms.overpower (:5430-5431); find_talent_spell( SPECIALIZATION, "Overpower" ) at :7595, trait row spell 7384.',
    },
    {
      simcToken: "execute",
      candidateAbilityGameIds: [163201, 281000],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / execute_arms_t",
      startLine: 7337,
      endLine: 7345,
      sourceNote:
        'create_action dispatches "execute" to execute_arms_t for Arms (:7343-7345), built on p->spell.execute (:4272-4273); spell.execute = find_class_spell( "Execute" ) at :7450, class_spells.inc row { 1, 0, 163201 }. The sc_spell_data.inc effect row 738985 of Massacre (281001) is an action override of 163201 onto 281000, which is the id the log reports for a Massacre build (fight 48 actor 5: 79 of 281000, none of 163201). Both records are _gcd 1500, so the lane holds without deciding the talent.',
    },
    {
      simcToken: "heroic_strike",
      candidateAbilityGameIds: [1269383],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / heroic_strike_t",
      startLine: 7354,
      endLine: 7355,
      sourceNote:
        'create_action dispatches "heroic_strike" to heroic_strike_t, built on p->spell.heroic_strike (:3553-3554); spell.heroic_strike = find_spell( 1269383 ) at :7478.',
    },
    {
      simcToken: "cleave",
      candidateAbilityGameIds: [845],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / cleave_t",
      startLine: 7323,
      endLine: 7324,
      sourceNote:
        'create_action dispatches "cleave" to cleave_t, built on p->talents.arms.cleave (:3620-3621); find_talent_spell( SPECIALIZATION, "Cleave" ) at :7618, trait row spell 845.',
    },
    {
      simcToken: "rend",
      candidateAbilityGameIds: [772],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / rend_t",
      startLine: 7382,
      endLine: 7383,
      sourceNote:
        'create_action dispatches "rend" to rend_t, built on p->talents.warrior.rend (:2291-2292); find_talent_spell( CLASS, "Rend" ) at :7546, trait row spell 772.',
    },
    {
      simcToken: "colossus_smash",
      candidateAbilityGameIds: [167105],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / colossus_smash_t",
      startLine: 7325,
      endLine: 7326,
      sourceNote:
        'create_action dispatches "colossus_smash" to colossus_smash_t, built on p->talents.arms.colossus_smash (:3735-3736); find_talent_spell( SPECIALIZATION, "Colossus Smash" ) at :7608, trait row spell 167105.',
    },
    {
      simcToken: "slam",
      candidateAbilityGameIds: [1464],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / slam_t",
      startLine: 7398,
      endLine: 7399,
      sourceNote:
        'create_action dispatches "slam" to slam_t, built on p->spell.slam (:3587-3588); spell.slam = find_class_spell( "Slam" ) at :7457, class_spells.inc row { 1, 0, 1464 }.',
    },
    {
      simcToken: "whirlwind",
      candidateAbilityGameIds: [1680],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / arms_whirlwind_parent_t",
      startLine: 7420,
      endLine: 7429,
      sourceNote:
        'create_action dispatches "whirlwind" to arms_whirlwind_parent_t for Arms (:7426-7428), built on p->spell.whirlwind (:6707-6708); spell.whirlwind = find_class_spell( "Whirlwind" ) at :7460, class_spells.inc row { 1, 0, 1680 }.',
    },
    {
      simcToken: "bladestorm",
      candidateAbilityGameIds: [227847, 446035],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / bladestorm_t",
      startLine: 7315,
      endLine: 7316,
      sourceNote:
        'create_action dispatches "bladestorm" to bladestorm_t on find_spell( 446035 ) when talents.slayer.unrelenting_onslaught and talents.shared.bladestorm are both taken, and on talents.shared.bladestorm otherwise (:7316); for Arms the trait row carries spell 227847, a CHOICE node with Ravager. Both records are _gcd 1500, so the lane holds without deciding the talent.',
    },
    {
      simcToken: "ravager",
      candidateAbilityGameIds: [228920],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / ravager_t",
      startLine: 7380,
      endLine: 7381,
      sourceNote:
        'create_action dispatches "ravager" to ravager_t, built on talents.shared.ravager (:5867-5868, :7931); for Arms talents.arms.ravager = find_talent_spell( SPECIALIZATION, "Ravager", WARRIOR_ARMS ) at :7633, trait row spell 228920, a CHOICE node with Bladestorm.',
    },
    {
      simcToken: "champions_spear",
      candidateAbilityGameIds: [376079],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / champions_spear_t",
      startLine: 7402,
      endLine: 7403,
      sourceNote:
        'create_action dispatches "champions_spear" to champions_spear_t, built on p->talents.warrior.champions_spear (:6846-6847); find_talent_spell( CLASS, "Champion\'s Spear" ) at :7587, trait row spell 376079.',
    },
    {
      simcToken: "demolish",
      candidateAbilityGameIds: [436358],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / demolish_t",
      startLine: 7433,
      endLine: 7434,
      sourceNote:
        'create_action dispatches "demolish" to demolish_t, built on p->talents.colossus.demolish (:3857-3858); find_talent_spell( HERO, "Demolish" ) at :7766, trait row spell 436358.',
    },
    {
      simcToken: "wrecking_throw",
      candidateAbilityGameIds: [384110],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / wrecking_throw_t",
      startLine: 7431,
      endLine: 7432,
      sourceNote:
        'create_action dispatches "wrecking_throw" to wrecking_throw_t, built on p->talents.warrior.wrecking_throw (:6783-6784); find_talent_spell( CLASS, "Wrecking Throw" ) at :7562, trait row spell 384110, a CHOICE node with Shattering Throw.',
    },
    {
      simcToken: "storm_bolt",
      candidateAbilityGameIds: [107570],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / storm_bolt_t",
      startLine: 7406,
      endLine: 7407,
      sourceNote:
        'create_action dispatches "storm_bolt" to storm_bolt_t, built on p->talents.warrior.storm_bolt (:6403-6404); find_talent_spell( CLASS, "Storm Bolt" ) at :7544, trait row spell 107570.',
    },
  ],
  metaActionLanes: [
    {
      simcToken: "auto_attack",
      triggerGcdMs: 0,
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "auto_attack_t::auto_attack_t",
      line: 2208,
      sourceNote:
        'auto_attack_t is built on warrior_attack_t( "auto_attack", p ) with no spell data ' +
        "(sc_warrior.cpp:2181) and its constructor assigns trigger_gcd = timespan_t::zero() at :2208.",
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
 * The Fury Warrior facts (ONB-A2).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of
 * the pinned Fury list (apl_warrior.cpp `fury`) executes. Facts a reader should not have to
 * rediscover (all read off the pinned DBC):
 *
 *   - RECKLESSNESS, AVATAR, CHARGE, HEROIC LEAP AND PUMMEL ARE `_gcd` 0. Every other token is 1500.
 *   - BLADESTORM BINDS TWO RECORDS. Unrelenting Onslaught swaps the action onto 446035
 *     (sc_warrior.cpp:7316). Both are 1500, so the lane holds without deciding the talent.
 *   - THE LIST'S RACIAL, POTION AND ITEM TOKENS ARE NOT BOUND. They are outside the rotational
 *     domain, and the domain boundary refuses them before any lane is read.
 */
const WARRIOR_FURY_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 100, displayNameEn: "Charge", baseGcdMs: 0 },
    { abilityGameId: 6544, displayNameEn: "Heroic Leap", baseGcdMs: 0 },
    { abilityGameId: 6552, displayNameEn: "Pummel", baseGcdMs: 0 },
    { abilityGameId: 1719, displayNameEn: "Recklessness", baseGcdMs: 0 },
    { abilityGameId: 107574, displayNameEn: "Avatar", baseGcdMs: 0 },
    { abilityGameId: 184367, displayNameEn: "Rampage", baseGcdMs: 1500 },
    { abilityGameId: 227847, displayNameEn: "Bladestorm", baseGcdMs: 1500 },
    { abilityGameId: 446035, displayNameEn: "Bladestorm", baseGcdMs: 1500 },
    { abilityGameId: 5308, displayNameEn: "Execute", baseGcdMs: 1500 },
    { abilityGameId: 335097, displayNameEn: "Crushing Blow", baseGcdMs: 1500 },
    { abilityGameId: 385059, displayNameEn: "Odyn's Fury", baseGcdMs: 1500 },
    { abilityGameId: 335096, displayNameEn: "Bloodbath", baseGcdMs: 1500 },
    { abilityGameId: 85288, displayNameEn: "Raging Blow", baseGcdMs: 1500 },
    { abilityGameId: 23881, displayNameEn: "Bloodthirst", baseGcdMs: 1500 },
    { abilityGameId: 190411, displayNameEn: "Whirlwind", baseGcdMs: 1500 },
    { abilityGameId: 107570, displayNameEn: "Storm Bolt", baseGcdMs: 1500 },
    { abilityGameId: 435222, displayNameEn: "Thunder Blast", baseGcdMs: 1500 },
    { abilityGameId: 6343, displayNameEn: "Thunder Clap", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "charge",
      candidateAbilityGameIds: [100],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / charge_t",
      startLine: 7321,
      endLine: 7322,
      sourceNote:
        'create_action dispatches "charge" to charge_t, built on p->spell.charge (sc_warrior.cpp:3384); spell.charge = find_class_spell( "Charge" ) at :7449, class_spells.inc row { 1, 0, 100 }.',
    },
    {
      simcToken: "heroic_leap",
      candidateAbilityGameIds: [6544],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / heroic_leap_t",
      startLine: 7352,
      endLine: 7353,
      sourceNote:
        'create_action dispatches "heroic_leap" to heroic_leap_t, built on p->talents.warrior.heroic_leap (:4672-4673), the class trait row carrying spell 6544.',
    },
    {
      simcToken: "pummel",
      candidateAbilityGameIds: [6552],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / pummel_t",
      startLine: 7370,
      endLine: 7371,
      sourceNote:
        'create_action dispatches "pummel" to pummel_t, built on p->find_class_spell( "Pummel" ) (:4887-4888), class_spells.inc row { 1, 0, 6552 }. OUTSIDE offensive authority by domain: an interrupt.',
    },
    {
      simcToken: "recklessness",
      candidateAbilityGameIds: [1719],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / recklessness_t",
      startLine: 7307,
      endLine: 7308,
      sourceNote:
        'create_action dispatches "recklessness" to recklessness_t, built for Fury on talents.fury.recklessness (:7308); find_talent_spell( SPECIALIZATION, "Recklessness" ) at :7683, trait row spell 1719.',
    },
    {
      simcToken: "avatar",
      candidateAbilityGameIds: [107574],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / avatar_t",
      startLine: 7303,
      endLine: 7304,
      sourceNote:
        'create_action dispatches "avatar" to avatar_t, built on talents.shared.avatar (:7304); for Fury talents.fury.avatar = find_talent_spell( SPECIALIZATION, "Avatar", WARRIOR_FURY ) at :7698, shared at :7928, trait row spell 107574, a CHOICE node with Bladestorm.',
    },
    {
      simcToken: "rampage",
      candidateAbilityGameIds: [184367],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / rampage_parent_t",
      startLine: 7378,
      endLine: 7379,
      sourceNote:
        'create_action dispatches "rampage" to rampage_parent_t, built on p->talents.fury.rampage (:5697-5698); find_talent_spell( SPECIALIZATION, "Rampage" ) at :7668, trait row spell 184367.',
    },
    {
      simcToken: "bladestorm",
      candidateAbilityGameIds: [227847, 446035],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / bladestorm_t",
      startLine: 7315,
      endLine: 7316,
      sourceNote:
        'create_action dispatches "bladestorm" to bladestorm_t on find_spell( 446035 ) when talents.slayer.unrelenting_onslaught and talents.shared.bladestorm are both taken, and on talents.shared.bladestorm otherwise (:7316); for Fury the trait row carries spell 227847, a CHOICE node with Avatar. Both records are _gcd 1500, so the lane holds without deciding the talent.',
    },
    {
      simcToken: "execute",
      candidateAbilityGameIds: [5308],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / execute_fury_t",
      startLine: 7337,
      endLine: 7342,
      sourceNote:
        'create_action dispatches "execute" to execute_fury_t for Fury (:7339-7341), built on p->spec.execute (:4497); spec.execute = find_specialization_spell( "Execute" ) at :7487, the Fury active spell row { 1, 72, 5308, 163201 } in class_spells.inc. No other id is bound: a log reporting another Execute id has no lane here.',
    },
    {
      simcToken: "crushing_blow",
      candidateAbilityGameIds: [335097],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / crushing_blow_t",
      startLine: 7374,
      endLine: 7375,
      sourceNote:
        'create_action dispatches "crushing_blow" to crushing_blow_t, built on p->spec.crushing_blow (:5127-5128); spec.crushing_blow = find_spell( 335097 ) at :7490.',
    },
    {
      simcToken: "odyns_fury",
      candidateAbilityGameIds: [385059],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / odyns_fury_t",
      startLine: 7364,
      endLine: 7365,
      sourceNote:
        'create_action dispatches "odyns_fury" to odyns_fury_t on talents.fury.odyns_fury (:7365); find_talent_spell( SPECIALIZATION, "Odyn\'s Fury" ) at :7692, trait row spell 385059.',
    },
    {
      simcToken: "bloodbath",
      candidateAbilityGameIds: [335096],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / bloodbath_t",
      startLine: 7319,
      endLine: 7320,
      sourceNote:
        'create_action dispatches "bloodbath" to bloodbath_t, built on p->spec.bloodbath (:2799-2800); spec.bloodbath = find_spell(335096) at :7489.',
    },
    {
      simcToken: "raging_blow",
      candidateAbilityGameIds: [85288],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / raging_blow_t",
      startLine: 7372,
      endLine: 7373,
      sourceNote:
        'create_action dispatches "raging_blow" to raging_blow_t, built on p->talents.fury.raging_blow (:4960-4961); find_talent_spell( SPECIALIZATION, "Raging Blow" ) at :7653, trait row spell 85288.',
    },
    {
      simcToken: "bloodthirst",
      candidateAbilityGameIds: [23881],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / bloodthirst_t",
      startLine: 7317,
      endLine: 7318,
      sourceNote:
        'create_action dispatches "bloodthirst" to bloodthirst_t, built on p->talents.fury.bloodthirst (:2569-2570); find_talent_spell( SPECIALIZATION, "Bloodthirst" ) at :7651, trait row spell 23881.',
    },
    {
      simcToken: "whirlwind",
      candidateAbilityGameIds: [190411],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / fury_whirlwind_parent_t",
      startLine: 7420,
      endLine: 7425,
      sourceNote:
        'create_action dispatches "whirlwind" to fury_whirlwind_parent_t for Fury (:7422-7424), built on p->spec.whirlwind (:6566-6567); spec.whirlwind = find_specialization_spell( "Whirlwind" ) at :7488, the Fury active spell row { 1, 72, 190411, 1680 } in class_spells.inc.',
    },
    {
      simcToken: "storm_bolt",
      candidateAbilityGameIds: [107570],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / storm_bolt_t",
      startLine: 7406,
      endLine: 7407,
      sourceNote:
        'create_action dispatches "storm_bolt" to storm_bolt_t, built on p->talents.warrior.storm_bolt (:6403-6404); find_talent_spell( CLASS, "Storm Bolt" ) at :7544, trait row spell 107570.',
    },
    {
      simcToken: "thunder_blast",
      candidateAbilityGameIds: [435222],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / thunder_blast_t",
      startLine: 7414,
      endLine: 7415,
      sourceNote:
        'create_action dispatches "thunder_blast" to thunder_blast_t, built on p->find_spell( 435222 ) (:3949-3950). The talent record 435607 is not the action.',
    },
    {
      simcToken: "thunder_clap",
      candidateAbilityGameIds: [6343],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / thunder_clap_t",
      startLine: 7412,
      endLine: 7413,
      sourceNote:
        'create_action dispatches "thunder_clap" to thunder_clap_t, built on p->talents.warrior.thunder_clap (:4085-4086); find_talent_spell( CLASS, "Thunder Clap", specialization() ) at :7538, trait row spell 6343.',
    },
  ],
  metaActionLanes: [
    {
      simcToken: "auto_attack",
      triggerGcdMs: 0,
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "auto_attack_t::auto_attack_t",
      line: 2208,
      sourceNote:
        'auto_attack_t is built on warrior_attack_t( "auto_attack", p ) with no spell data ' +
        "(sc_warrior.cpp:2181) and its constructor assigns trigger_gcd = timespan_t::zero() at :2208.",
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
 * The Protection Warrior facts (ONB-A2).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of
 * the pinned Protection list (apl_warrior.cpp `protection`) executes. Facts a reader should not
 * have to rediscover (all read off the pinned DBC):
 *
 *   - SHIELD BLOCK, IGNORE PAIN, SHIELD WALL, AVATAR, CHARGE AND CHAMPION'S LEAP ARE `_gcd` 0. Every
 *     other token is 1500.
 *   - EXECUTE IS NOT FURY'S. Protection builds execute_arms_t on the class spell 163201
 *     (sc_warrior.cpp:7343-7345), where Fury builds execute_fury_t on 5308.
 *   - THE LIST ORDERS MITIGATION FOR DAMAGE. Its Ignore Pain, Shield Block and Shield Wall lines say
 *     nothing about what a tank needed to survive: this data binds them so they can be placed, and
 *     the specialization never judges them.
 */
const WARRIOR_PROTECTION_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 100, displayNameEn: "Charge", baseGcdMs: 0 },
    { abilityGameId: 107574, displayNameEn: "Avatar", baseGcdMs: 0 },
    { abilityGameId: 871, displayNameEn: "Shield Wall", baseGcdMs: 0 },
    { abilityGameId: 190456, displayNameEn: "Ignore Pain", baseGcdMs: 0 },
    { abilityGameId: 2565, displayNameEn: "Shield Block", baseGcdMs: 0 },
    { abilityGameId: 1271985, displayNameEn: "Champion's Leap", baseGcdMs: 0 },
    { abilityGameId: 228920, displayNameEn: "Ravager", baseGcdMs: 1500 },
    { abilityGameId: 435222, displayNameEn: "Thunder Blast", baseGcdMs: 1500 },
    { abilityGameId: 1160, displayNameEn: "Demoralizing Shout", baseGcdMs: 1500 },
    { abilityGameId: 376079, displayNameEn: "Champion's Spear", baseGcdMs: 1500 },
    { abilityGameId: 436358, displayNameEn: "Demolish", baseGcdMs: 1500 },
    { abilityGameId: 385952, displayNameEn: "Shield Charge", baseGcdMs: 1500 },
    { abilityGameId: 6343, displayNameEn: "Thunder Clap", baseGcdMs: 1500 },
    { abilityGameId: 6572, displayNameEn: "Revenge", baseGcdMs: 1500 },
    { abilityGameId: 23922, displayNameEn: "Shield Slam", baseGcdMs: 1500 },
    { abilityGameId: 163201, displayNameEn: "Execute", baseGcdMs: 1500 },
    { abilityGameId: 384110, displayNameEn: "Wrecking Throw", baseGcdMs: 1500 },
    { abilityGameId: 64382, displayNameEn: "Shattering Throw", baseGcdMs: 1500 },
    { abilityGameId: 20243, displayNameEn: "Devastate", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "charge",
      candidateAbilityGameIds: [100],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / charge_t",
      startLine: 7321,
      endLine: 7322,
      sourceNote:
        'create_action dispatches "charge" to charge_t, built on p->spell.charge (sc_warrior.cpp:3384); spell.charge = find_class_spell( "Charge" ) at :7449, class_spells.inc row { 1, 0, 100 }.',
    },
    {
      simcToken: "avatar",
      candidateAbilityGameIds: [107574],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / avatar_t",
      startLine: 7303,
      endLine: 7304,
      sourceNote:
        'create_action dispatches "avatar" to avatar_t, built on talents.shared.avatar (:7304); for Protection talents.protection.avatar = find_talent_spell( SPECIALIZATION, "Avatar", WARRIOR_PROTECTION ) at :7748, shared at :7928, trait row spell 107574.',
    },
    {
      simcToken: "shield_wall",
      candidateAbilityGameIds: [871],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / shield_wall_t",
      startLine: 7394,
      endLine: 7395,
      sourceNote:
        'create_action dispatches "shield_wall" to shield_wall_t, built on p->talents.protection.shield_wall (:7215-7216); find_talent_spell( SPECIALIZATION, "Shield Wall" ) at :7723, trait row spell 871. A defensive cooldown: the offensive authority only places it, it never judges it.',
    },
    {
      simcToken: "ignore_pain",
      candidateAbilityGameIds: [190456],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / ignore_pain_t",
      startLine: 7418,
      endLine: 7419,
      sourceNote:
        'create_action dispatches "ignore_pain" to ignore_pain_t, built on p->talents.shared.ignore_pain (:2475-2476); talents.protection.ignore_pain = find_talent_spell( SPECIALIZATION, "Ignore Pain", WARRIOR_PROTECTION ) at :7707, shared at :7935, trait row spell 190456. Active mitigation: the offensive authority only places it, it never judges it.',
    },
    {
      simcToken: "shield_block",
      candidateAbilityGameIds: [2565],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / shield_block_t",
      startLine: 7388,
      endLine: 7389,
      sourceNote:
        'create_action dispatches "shield_block" to shield_block_t, built on p->spell.shield_block (:7183-7184); spell.shield_block = find_class_spell( "Shield Block" ) at :7455, class_spells.inc row { 1, 0, 2565 }. Active mitigation: the offensive authority only places it, it never judges it.',
    },
    {
      simcToken: "champions_leap",
      candidateAbilityGameIds: [1271985],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / champions_leap_t",
      startLine: 7400,
      endLine: 7401,
      sourceNote:
        'create_action dispatches "champions_leap" to champions_leap_t, built on p->find_spell( 1271985 ) (:6801-6802).',
    },
    {
      simcToken: "ravager",
      candidateAbilityGameIds: [228920],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / ravager_t",
      startLine: 7380,
      endLine: 7381,
      sourceNote:
        'create_action dispatches "ravager" to ravager_t, built on p->talents.shared.ravager (:5867-5868); talents.protection.ravager = find_talent_spell( SPECIALIZATION, "Ravager", WARRIOR_PROTECTION ) at :7759, shared at :7931, trait row spell 228920, a CHOICE node with Whirling Blade.',
    },
    {
      simcToken: "thunder_blast",
      candidateAbilityGameIds: [435222],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / thunder_blast_t",
      startLine: 7414,
      endLine: 7415,
      sourceNote:
        'create_action dispatches "thunder_blast" to thunder_blast_t, built on p->find_spell( 435222 ) (:3949-3950). The talent record 435607 is not the action.',
    },
    {
      simcToken: "demoralizing_shout",
      candidateAbilityGameIds: [1160],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / demoralizing_shout_t",
      startLine: 7329,
      endLine: 7330,
      sourceNote:
        'create_action dispatches "demoralizing_shout" to demoralizing_shout_t, built on p->talents.protection.demoralizing_shout (:3909-3910); find_talent_spell( SPECIALIZATION, "Demoralizing Shout" ) at :7709, trait row spell 1160.',
    },
    {
      simcToken: "champions_spear",
      candidateAbilityGameIds: [376079],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / champions_spear_t",
      startLine: 7402,
      endLine: 7403,
      sourceNote:
        'create_action dispatches "champions_spear" to champions_spear_t, built on p->talents.warrior.champions_spear (:6846-6847); find_talent_spell( CLASS, "Champion\'s Spear" ) at :7587, trait row spell 376079.',
    },
    {
      simcToken: "demolish",
      candidateAbilityGameIds: [436358],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / demolish_t",
      startLine: 7433,
      endLine: 7434,
      sourceNote:
        'create_action dispatches "demolish" to demolish_t, built on p->talents.colossus.demolish (:3857-3858), channeled (:3864); find_talent_spell( HERO, "Demolish" ) at :7766, trait row spell 436358.',
    },
    {
      simcToken: "shield_charge",
      candidateAbilityGameIds: [385952],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / shield_charge_t",
      startLine: 7390,
      endLine: 7391,
      sourceNote:
        'create_action dispatches "shield_charge" to shield_charge_t, built on p->talents.protection.shield_charge (:6153-6154); find_talent_spell( SPECIALIZATION, "Shield Charge" ) at :7756, trait row spell 385952.',
    },
    {
      simcToken: "thunder_clap",
      candidateAbilityGameIds: [6343],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / thunder_clap_t",
      startLine: 7412,
      endLine: 7413,
      sourceNote:
        'create_action dispatches "thunder_clap" to thunder_clap_t, built on p->talents.warrior.thunder_clap (:4085-4086); find_talent_spell( CLASS, "Thunder Clap", specialization() ) at :7538, trait row spell 6343.',
    },
    {
      simcToken: "revenge",
      candidateAbilityGameIds: [6572],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / revenge_t",
      startLine: 7384,
      endLine: 7385,
      sourceNote:
        'create_action dispatches "revenge" to revenge_t, built on p->talents.protection.revenge (:5996-5997); find_talent_spell( SPECIALIZATION, "Revenge" ) at :7710, trait row spell 6572.',
    },
    {
      simcToken: "shield_slam",
      candidateAbilityGameIds: [23922],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / shield_slam_t",
      startLine: 7392,
      endLine: 7393,
      sourceNote:
        'create_action dispatches "shield_slam" to shield_slam_t, built on p->spell.shield_slam (:6228-6229); spell.shield_slam = find_class_spell( "Shield Slam" ) at :7456, class_spells.inc row { 1, 0, 23922 }.',
    },
    {
      simcToken: "execute",
      candidateAbilityGameIds: [163201],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / execute_arms_t",
      startLine: 7337,
      endLine: 7346,
      sourceNote:
        'create_action dispatches "execute" to execute_arms_t for every specialization but Fury (:7343-7345), built on p->spell.execute (:4272-4273); spell.execute = find_class_spell( "Execute" ) at :7450, class_spells.inc row { 1, 0, 163201 }.',
    },
    {
      simcToken: "wrecking_throw",
      candidateAbilityGameIds: [384110],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / wrecking_throw_t",
      startLine: 7431,
      endLine: 7432,
      sourceNote:
        'create_action dispatches "wrecking_throw" to wrecking_throw_t, built on p->talents.warrior.wrecking_throw (:6783-6784); find_talent_spell( CLASS, "Wrecking Throw" ) at :7562, trait row spell 384110, a CHOICE node with Shattering Throw.',
    },
    {
      simcToken: "shattering_throw",
      candidateAbilityGameIds: [64382],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / shattering_throw_t",
      startLine: 7386,
      endLine: 7387,
      sourceNote:
        'create_action dispatches "shattering_throw" to shattering_throw_t, built on p->talents.warrior.shattering_throw (:5263-5264); find_talent_spell( CLASS, "Shattering Throw" ) at :7563, trait row spell 64382, a CHOICE node with Wrecking Throw.',
    },
    {
      simcToken: "devastate",
      candidateAbilityGameIds: [20243],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "warrior_t::create_action / devastate_t",
      startLine: 7331,
      endLine: 7332,
      sourceNote:
        'create_action dispatches "devastate" to devastate_t, built on p->spec.devastate (:1869-1870); spec.devastate = find_specialization_spell( "Devastate" ) at :7500, the Protection active spell row { 1, 73, 20243 } in class_spells.inc.',
    },
  ],
  metaActionLanes: [
    {
      simcToken: "auto_attack",
      triggerGcdMs: 0,
      sourcePath: WARRIOR_MODULE_PATH,
      symbol: "auto_attack_t::auto_attack_t",
      line: 2208,
      sourceNote:
        'auto_attack_t is built on warrior_attack_t( "auto_attack", p ) with no spell data ' +
        "(sc_warrior.cpp:2181) and its constructor assigns trigger_gcd = timespan_t::zero() at :2208.",
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
 * The Subtlety Rogue target's pinned inputs (ONB-A2).
 */
const ROGUE_SUBTLETY_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED — the class module every token binding is a hand-reviewed reading of.
  classModule: "engine/class_modules/sc_rogue.cpp",
  // HASHED, NEVER PARSED. Present because every target hashes the same shared sources.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const ROGUE_SUBTLETY_MODULE_PATH = "engine/class_modules/sc_rogue.cpp";

/**
 * The Subtlety Rogue facts (ONB-A2).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of
 * the pinned Subtlety list (apl_rogue.cpp `subtlety`) executes. Facts a reader should not have
 * to rediscover (all read off the pinned DBC):
 *
 *   - STEALTH, SHADOW BLADES, SHADOW DANCE AND VANISH ARE `_gcd` 0. COUP DE GRACE IS 1200. Every other
 *     token is 1000.
 *   - COUP DE GRACE'S ACTION IS 441776, not its talent record 441423 (sc_rogue.cpp:10265).
 *   - THE RACIALS, ITEMS AND `arcane_pulse` ARE NOT BOUND. `arcane_pulse` is a racial the shared
 *     non-domain table does not list (player.cpp:9299), so an entry reaching it refuses.
 */
const ROGUE_SUBTLETY_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 1784, displayNameEn: "Stealth", baseGcdMs: 0 },
    { abilityGameId: 121471, displayNameEn: "Shadow Blades", baseGcdMs: 0 },
    { abilityGameId: 185313, displayNameEn: "Shadow Dance", baseGcdMs: 0 },
    { abilityGameId: 1856, displayNameEn: "Vanish", baseGcdMs: 0 },
    { abilityGameId: 197835, displayNameEn: "Shuriken Storm", baseGcdMs: 1000 },
    { abilityGameId: 200758, displayNameEn: "Gloomblade", baseGcdMs: 1000 },
    { abilityGameId: 185438, displayNameEn: "Shadowstrike", baseGcdMs: 1000 },
    { abilityGameId: 426591, displayNameEn: "Goremaw's Bite", baseGcdMs: 1000 },
    { abilityGameId: 196819, displayNameEn: "Eviscerate", baseGcdMs: 1000 },
    { abilityGameId: 280719, displayNameEn: "Secret Technique", baseGcdMs: 1000 },
    { abilityGameId: 441776, displayNameEn: "Coup de Grace", baseGcdMs: 1200 },
    { abilityGameId: 319175, displayNameEn: "Black Powder", baseGcdMs: 1000 },
    { abilityGameId: 53, displayNameEn: "Backstab", baseGcdMs: 1000 },
  ],
  tokenBindings: [
    {
      simcToken: "stealth",
      candidateAbilityGameIds: [1784],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_SUBTLETY_MODULE_PATH,
      symbol: "rogue_t::create_action / stealth_t",
      startLine: 9497,
      endLine: 9497,
      sourceNote:
        'create_action dispatches "stealth" to stealth_t, built on p->spell.stealth (sc_rogue.cpp:6061-6062); spell.stealth = find_class_spell( "Stealth" ) at :9919, class_spells.inc row { 4, 0, 1784 }.',
    },
    {
      simcToken: "shadow_blades",
      candidateAbilityGameIds: [121471],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: ROGUE_SUBTLETY_MODULE_PATH,
      symbol: "rogue_t::create_action / shadow_blades_t",
      startLine: 9488,
      endLine: 9488,
      sourceNote:
        'create_action dispatches "shadow_blades" to shadow_blades_t, built on p->talent.subtlety.shadow_blades (:5451-5452); find_talent_spell( SPECIALIZATION, "Shadow Blades" ) at :10147, trait row spell 121471.',
    },
    {
      simcToken: "shadow_dance",
      candidateAbilityGameIds: [185313],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_SUBTLETY_MODULE_PATH,
      symbol: "rogue_t::create_action / shadow_dance_t",
      startLine: 9489,
      endLine: 9489,
      sourceNote:
        'create_action dispatches "shadow_dance" to shadow_dance_t, built on p->spec.shadow_dance (:5486-5487); spec.shadow_dance = find_specialization_spell( "Shadow Dance" ) at :9955, the Subtlety active spell row { 4, 261, 185313 } in class_spells.inc.',
    },
    {
      simcToken: "vanish",
      candidateAbilityGameIds: [1856],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_SUBTLETY_MODULE_PATH,
      symbol: "rogue_t::create_action / vanish_t",
      startLine: 9500,
      endLine: 9500,
      sourceNote:
        'create_action dispatches "vanish" to vanish_t, built on p->spell.vanish (:6031-6032); spell.vanish = find_class_spell( "Vanish" ) at :9920, class_spells.inc row { 4, 0, 1856 }.',
    },
    {
      simcToken: "shuriken_storm",
      candidateAbilityGameIds: [197835],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_SUBTLETY_MODULE_PATH,
      symbol: "rogue_t::create_action / shuriken_storm_t",
      startLine: 9492,
      endLine: 9492,
      sourceNote:
        'create_action dispatches "shuriken_storm" to shuriken_storm_t, built on p->spec.shuriken_storm (:5768-5769); find_specialization_spell( "Shuriken Storm" ) at :9959, the Subtlety active spell row { 4, 261, 197835 } in class_spells.inc.',
    },
    {
      simcToken: "gloomblade",
      candidateAbilityGameIds: [200758],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: ROGUE_SUBTLETY_MODULE_PATH,
      symbol: "rogue_t::create_action / gloomblade_t",
      startLine: 9475,
      endLine: 9475,
      sourceNote:
        'create_action dispatches "gloomblade" to gloomblade_t, built on p->talent.subtlety.gloomblade (:4562-4563); find_talent_spell( SPECIALIZATION, "Gloomblade" ) at :10131, trait row spell 200758.',
    },
    {
      simcToken: "shadowstrike",
      candidateAbilityGameIds: [185438],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_SUBTLETY_MODULE_PATH,
      symbol: "rogue_t::create_action / shadowstrike_t",
      startLine: 9491,
      endLine: 9491,
      sourceNote:
        'create_action dispatches "shadowstrike" to shadowstrike_t, built on p->spec.shadowstrike (:5566-5567); find_specialization_spell( "Shadowstrike" ) at :9957, the Subtlety active spell row { 4, 261, 185438, 8676 } in class_spells.inc.',
    },
    {
      simcToken: "goremaws_bite",
      candidateAbilityGameIds: [426591],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: ROGUE_SUBTLETY_MODULE_PATH,
      symbol: "rogue_t::create_action / goremaws_bite_t",
      startLine: 9473,
      endLine: 9473,
      sourceNote:
        'create_action dispatches "goremaws_bite" to goremaws_bite_t, built on p->talent.subtlety.goremaws_bite (:6462-6463); find_talent_spell( SPECIALIZATION, "Goremaw\'s Bite" ) at :10132, trait row spell 426591.',
    },
    {
      simcToken: "eviscerate",
      candidateAbilityGameIds: [196819],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_SUBTLETY_MODULE_PATH,
      symbol: "rogue_t::create_action / eviscerate_t",
      startLine: 9469,
      endLine: 9469,
      sourceNote:
        'create_action dispatches "eviscerate" to eviscerate_t, built on p->spec.eviscerate (:4345-4346); spec.eviscerate = find_class_spell( "Eviscerate" ) at :9953, class_spells.inc row { 4, 0, 196819 }.',
    },
    {
      simcToken: "secret_technique",
      candidateAbilityGameIds: [280719],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_SUBTLETY_MODULE_PATH,
      symbol: "rogue_t::create_action / secret_technique_t",
      startLine: 9487,
      endLine: 9487,
      sourceNote:
        'create_action dispatches "secret_technique" to secret_technique_t, built on p->spec.secret_technique (:5361-5362); find_specialization_spell( "Secret Technique" ) at :9954, the Subtlety active spell row { 4, 261, 280719 } in class_spells.inc.',
    },
    {
      simcToken: "coup_de_grace",
      candidateAbilityGameIds: [441776],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: ROGUE_SUBTLETY_MODULE_PATH,
      symbol: "rogue_t::create_action / coup_de_grace_t",
      startLine: 9462,
      endLine: 9462,
      sourceNote:
        'create_action dispatches "coup_de_grace" to coup_de_grace_t, built on p->spell.coup_de_grace (:6781-6782); spell.coup_de_grace = talent.trickster.coup_de_grace->ok() ? find_spell( 441776 ) : not_found at :10265. Its record carries _gcd 1200.',
    },
    {
      simcToken: "black_powder",
      candidateAbilityGameIds: [319175],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_SUBTLETY_MODULE_PATH,
      symbol: "rogue_t::create_action / black_powder_t",
      startLine: 9458,
      endLine: 9458,
      sourceNote:
        'create_action dispatches "black_powder" to black_powder_t, built on p->spec.black_powder (:5690-5691); find_specialization_spell( "Black Powder" ) at :9952, the Subtlety active spell row { 4, 261, 319175 } in class_spells.inc.',
    },
    {
      simcToken: "backstab",
      candidateAbilityGameIds: [53],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_SUBTLETY_MODULE_PATH,
      symbol: "rogue_t::create_action / backstab_t",
      startLine: 9456,
      endLine: 9456,
      sourceNote:
        'create_action dispatches "backstab" to backstab_t, built on p->spec.backstab (:3691-3692); find_specialization_spell( "Backstab" ) at :9951, the Subtlety active spell row { 4, 261, 53, 1752 } in class_spells.inc.',
    },
  ],
  metaActionLanes: [
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

const ROGUE_OUTLAW_SOURCES = ROGUE_SUBTLETY_SOURCES;

const ROGUE_OUTLAW_MODULE_PATH = "engine/class_modules/sc_rogue.cpp";

/**
 * The Outlaw Rogue facts (ONB-C2).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the
 * pinned Outlaw list (apl_rogue.cpp `outlaw`) executes. Facts a reader should not have to
 * rediscover (all read off the pinned DBC):
 *
 *   - STEALTH, KICK, VANISH, ADRENALINE RUSH AND KEEP IT ROLLING ARE `_gcd` 0. COUP DE
 *     GRACE IS 1200. Every other token is 1000.
 *   - SINISTER STRIKE'S ACTION IS 193315, the Outlaw row replacing the class's 1752.
 *   - SHADOWMELD, THE RACIALS AND ITEMS ARE NOT BOUND, and `arcane_pulse` refuses if reached, as for
 *     Subtlety.
 */
const ROGUE_OUTLAW_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 1784, displayNameEn: "Stealth", baseGcdMs: 0 },
    { abilityGameId: 1766, displayNameEn: "Kick", baseGcdMs: 0 },
    { abilityGameId: 1856, displayNameEn: "Vanish", baseGcdMs: 0 },
    { abilityGameId: 13750, displayNameEn: "Adrenaline Rush", baseGcdMs: 0 },
    { abilityGameId: 381989, displayNameEn: "Keep It Rolling", baseGcdMs: 0 },
    { abilityGameId: 1277933, displayNameEn: "Preparation", baseGcdMs: 1000 },
    { abilityGameId: 13877, displayNameEn: "Blade Flurry", baseGcdMs: 1000 },
    { abilityGameId: 1214909, displayNameEn: "Roll the Bones", baseGcdMs: 1000 },
    { abilityGameId: 271877, displayNameEn: "Blade Rush", baseGcdMs: 1000 },
    { abilityGameId: 8676, displayNameEn: "Ambush", baseGcdMs: 1000 },
    { abilityGameId: 185763, displayNameEn: "Pistol Shot", baseGcdMs: 1000 },
    { abilityGameId: 193315, displayNameEn: "Sinister Strike", baseGcdMs: 1000 },
    { abilityGameId: 315341, displayNameEn: "Between the Eyes", baseGcdMs: 1000 },
    { abilityGameId: 51690, displayNameEn: "Killing Spree", baseGcdMs: 1000 },
    { abilityGameId: 441776, displayNameEn: "Coup de Grace", baseGcdMs: 1200 },
    { abilityGameId: 2098, displayNameEn: "Dispatch", baseGcdMs: 1000 },
  ],
  tokenBindings: [
    {
      simcToken: "stealth",
      candidateAbilityGameIds: [1784],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / stealth_t",
      startLine: 9497,
      endLine: 9497,
      sourceNote:
        'create_action dispatches "stealth" to stealth_t, built on p->spell.stealth (:6062); spell.stealth = find_class_spell( "Stealth" ) at :9919, class_spells.inc row { 4, 0, 1784 }.',
    },
    {
      simcToken: "kick",
      candidateAbilityGameIds: [1766],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / kick_t",
      startLine: 9477,
      endLine: 9477,
      sourceNote:
        'create_action dispatches "kick" to kick_t, built on p->spell.kick (:4603); spell.kick = find_class_spell( "Kick" ) at :9915, class_spells.inc row { 4, 0, 1766 }.',
    },
    {
      simcToken: "vanish",
      candidateAbilityGameIds: [1856],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / vanish_t",
      startLine: 9500,
      endLine: 9500,
      sourceNote:
        'create_action dispatches "vanish" to vanish_t, built on p->spell.vanish (:6032); spell.vanish = find_class_spell( "Vanish" ) at :9920, class_spells.inc row { 4, 0, 1856 }.',
    },
    {
      simcToken: "adrenaline_rush",
      candidateAbilityGameIds: [13750],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / adrenaline_rush_t",
      startLine: 9452,
      endLine: 9452,
      sourceNote:
        'create_action dispatches "adrenaline_rush" to adrenaline_rush_t, built on p->talent.outlaw.adrenaline_rush (:3545); find_talent_spell( SPECIALIZATION, "Adrenaline Rush" ) at :10074, trait row spell 13750.',
    },
    {
      simcToken: "keep_it_rolling",
      candidateAbilityGameIds: [381989],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / keep_it_rolling_t",
      startLine: 9476,
      endLine: 9476,
      sourceNote:
        'create_action dispatches "keep_it_rolling" to keep_it_rolling_t, built on p->talent.outlaw.keep_it_rolling (:6330); find_talent_spell( SPECIALIZATION, "Keep it Rolling" ) at :10098, trait row spell 381989.',
    },
    {
      simcToken: "preparation",
      candidateAbilityGameIds: [1277933],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / preparation_t",
      startLine: 9484,
      endLine: 9484,
      sourceNote:
        'create_action dispatches "preparation" to preparation_t, built on p->talent.outlaw.preparation (:6348); find_talent_spell( SPECIALIZATION, "Preparation" ) at :10104, trait row spell 1277933.',
    },
    {
      simcToken: "blade_flurry",
      candidateAbilityGameIds: [13877],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / blade_flurry_t",
      startLine: 9459,
      endLine: 9459,
      sourceNote:
        'create_action dispatches "blade_flurry" to blade_flurry_t, built on p->spec.blade_flurry (:3948); find_specialization_spell( "Blade Flurry" ) at :9947, the Outlaw active spell row { 4, 260, 13877 } in class_spells.inc.',
    },
    {
      simcToken: "roll_the_bones",
      candidateAbilityGameIds: [1214909],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / roll_the_bones_t",
      startLine: 9485,
      endLine: 9485,
      sourceNote:
        'create_action dispatches "roll_the_bones" to roll_the_bones_t, built on p->spec.roll_the_bones (:5129); find_specialization_spell( "Roll the Bones" ) at :9945, the Outlaw active spell row { 4, 260, 1214909 } in class_spells.inc.',
    },
    {
      simcToken: "blade_rush",
      candidateAbilityGameIds: [271877],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / blade_rush_t",
      startLine: 9460,
      endLine: 9460,
      sourceNote:
        'create_action dispatches "blade_rush" to blade_rush_t, built on p->talent.outlaw.blade_rush (:4040); find_talent_spell( SPECIALIZATION, "Blade Rush" ) at :10076, trait row spell 271877.',
    },
    {
      simcToken: "ambush",
      candidateAbilityGameIds: [8676],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / ambush_t",
      startLine: 9453,
      endLine: 9453,
      sourceNote:
        'create_action dispatches "ambush" to ambush_t, built on p->spell.ambush (:3582); spell.ambush = find_class_spell( "Ambush" ) at :9908, class_spells.inc row { 4, 0, 8676 }.',
    },
    {
      simcToken: "pistol_shot",
      candidateAbilityGameIds: [185763],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / pistol_shot_t",
      startLine: 9482,
      endLine: 9482,
      sourceNote:
        'create_action dispatches "pistol_shot" to pistol_shot_t, built on p->spec.pistol_shot (:4910); find_specialization_spell( "Pistol Shot" ) at :9943, the Outlaw active spell row { 4, 260, 185763 } in class_spells.inc.',
    },
    {
      simcToken: "sinister_strike",
      candidateAbilityGameIds: [193315],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / sinister_strike_t",
      startLine: 9494,
      endLine: 9494,
      sourceNote:
        'create_action dispatches "sinister_strike" to sinister_strike_t, built on p->spec.sinister_strike (:5895); find_specialization_spell( "Sinister Strike" ) at :9944, the Outlaw active spell row { 4, 260, 193315, 1752 } in class_spells.inc.',
    },
    {
      simcToken: "between_the_eyes",
      candidateAbilityGameIds: [315341],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / between_the_eyes_t",
      startLine: 9457,
      endLine: 9457,
      sourceNote:
        'create_action dispatches "between_the_eyes" to between_the_eyes_t, built on p->spec.between_the_eyes (:3810); find_specialization_spell( "Between the Eyes" ) at :9941, the Outlaw active spell row { 4, 260, 315341 } in class_spells.inc.',
    },
    {
      simcToken: "killing_spree",
      candidateAbilityGameIds: [51690],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / killing_spree_t",
      startLine: 9479,
      endLine: 9479,
      sourceNote:
        'create_action dispatches "killing_spree" to killing_spree_t, built on p->talent.outlaw.killing_spree (:4673); find_talent_spell( SPECIALIZATION, "Killing Spree" ) at :10099, trait row spell 51690.',
    },
    {
      simcToken: "coup_de_grace",
      candidateAbilityGameIds: [441776],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / coup_de_grace_t",
      startLine: 9462,
      endLine: 9462,
      sourceNote:
        'create_action dispatches "coup_de_grace" to coup_de_grace_t, built on p->spell.coup_de_grace (:6782); spell.coup_de_grace = talent.trickster.coup_de_grace->ok() ? find_spell( 441776 ) : not_found at :10265. Its record carries _gcd 1200.',
    },
    {
      simcToken: "dispatch",
      candidateAbilityGameIds: [2098],
      crossCheck: "CLASS_SPELLS",
      sourcePath: ROGUE_OUTLAW_MODULE_PATH,
      symbol: "rogue_t::create_action / dispatch_t",
      startLine: 9467,
      endLine: 9467,
      sourceNote:
        'create_action dispatches "dispatch" to dispatch_t, built on p->spec.dispatch (:3752); find_specialization_spell( "Dispatch" ) at :9942, the Outlaw active spell row { 4, 260, 2098, 196819 } in class_spells.inc.',
    },
  ],
  metaActionLanes: [
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

const WARLOCK_DESTRUCTION_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED — the action file every token binding is a hand-reviewed reading of,
  // and the init file that binds each action's spell.
  classModule: "engine/class_modules/warlock/sc_warlock_actions.cpp",
  initModule: "engine/class_modules/warlock/sc_warlock_init.cpp",
  // HASHED, NEVER PARSED. Present because every target hashes the same shared sources.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const WARLOCK_DESTRUCTION_MODULE_PATH = "engine/class_modules/warlock/sc_warlock_actions.cpp";

const SHAMAN_ELEMENTAL_SOURCES = SHAMAN_SOURCES;

/**
 * The Elemental Shaman facts (ONB-D2).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the pinned Elemental list
 * (apl_shaman.cpp `elemental`) executes. Facts a reader should not have to rediscover:
 *
 *   - FLAME SHOCK BINDS THE CLASS ROW 470411, as Enhancement's does. Every retained subject that casts it logs both 470411 and
 *     188389 in one press, which corroborates the binding: 188389 has no lane record here and is excluded.
 *   - ASCENDANCE BINDS TWO ROWS. The constructor reads find_spell( 1219480 ) for Elemental (sc_shaman.cpp:11419), and every
 *     retained subject logs 114050. Both are _gcd 1500, so the lane does not depend on which, and neither is called wrong.
 *   - EARTHQUAKE IS ONE OF TWO ROWS: the talent node offers 61882 and 462620.
 *   - SPIRITWALKER'S GRACE, WIND SHEAR, NATURE'S SWIFTNESS AND ANCESTRAL SWIFTNESS ARE `_gcd` 0, SO THEY ARE NON_GCD.
 *   - THE RACIAL, POTION, ITEM AND EXTERNAL-BUFF TOKENS ARE NOT BOUND. The imbue and the ward appear only in precombat.
 */
const SHAMAN_ELEMENTAL_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 79206, displayNameEn: "Spiritwalker's Grace", baseGcdMs: 0 },
    { abilityGameId: 57994, displayNameEn: "Wind Shear", baseGcdMs: 0 },
    { abilityGameId: 192106, displayNameEn: "Lightning Shield", baseGcdMs: 1500 },
    { abilityGameId: 378081, displayNameEn: "Nature's Swiftness", baseGcdMs: 0 },
    { abilityGameId: 443454, displayNameEn: "Ancestral Swiftness", baseGcdMs: 0 },
    { abilityGameId: 191634, displayNameEn: "Stormkeeper", baseGcdMs: 1500 },
    { abilityGameId: 470411, displayNameEn: "Flame Shock", baseGcdMs: 1500 },
    { abilityGameId: 470057, displayNameEn: "Voltaic Blaze", baseGcdMs: 1500 },
    { abilityGameId: 114050, displayNameEn: "Ascendance", baseGcdMs: 1500 },
    { abilityGameId: 1219480, displayNameEn: "Ascendance", baseGcdMs: 1500 },
    { abilityGameId: 117014, displayNameEn: "Elemental Blast", baseGcdMs: 1500 },
    { abilityGameId: 61882, displayNameEn: "Earthquake", baseGcdMs: 1500 },
    { abilityGameId: 462620, displayNameEn: "Earthquake", baseGcdMs: 1500 },
    { abilityGameId: 51505, displayNameEn: "Lava Burst", baseGcdMs: 1500 },
    { abilityGameId: 452201, displayNameEn: "Tempest", baseGcdMs: 1500 },
    { abilityGameId: 188443, displayNameEn: "Chain Lightning", baseGcdMs: 1500 },
    { abilityGameId: 196840, displayNameEn: "Frost Shock", baseGcdMs: 1500 },
    { abilityGameId: 8042, displayNameEn: "Earth Shock", baseGcdMs: 1500 },
    { abilityGameId: 188196, displayNameEn: "Lightning Bolt", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "spiritwalkers_grace",
      candidateAbilityGameIds: [79206],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / spiritwalkers_grace_t",
      startLine: 10423,
      endLine: 10423,
      sourceNote:
        'create_action dispatches "spiritwalkers_grace" to spiritwalkers_grace_t: built on player->talent.spiritwalkers_grace (:7761); _CT( "Spiritwalker\'s Grace" ) at :11166.',
    },
    {
      simcToken: "wind_shear",
      candidateAbilityGameIds: [57994],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / wind_shear_t",
      startLine: 10364,
      endLine: 10364,
      sourceNote:
        'create_action dispatches "wind_shear" to wind_shear_t: built on player->talent.wind_shear (:8509); _CT( "Wind Shear" ) at :11157. Its string form in the list is emitted whatever the class tables say.',
    },
    {
      simcToken: "lightning_shield",
      candidateAbilityGameIds: [192106],
      crossCheck: "CLASS_SPELLS",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / lightning_shield_t",
      startLine: 10403,
      endLine: 10403,
      sourceNote:
        'create_action dispatches "lightning_shield" to lightning_shield_t: built on player->find_class_spell( "Lightning Shield" ) (:4788), class_spells.inc row 192106.',
    },
    {
      simcToken: "natures_swiftness",
      candidateAbilityGameIds: [378081],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / natures_swiftness_t",
      startLine: 10370,
      endLine: 10370,
      sourceNote:
        'create_action dispatches "natures_swiftness" to natures_swiftness_t: built on player->talent.natures_swiftness (:8118); _CT( "Nature\'s Swiftness" ) at :11182.',
    },
    {
      simcToken: "ancestral_swiftness",
      candidateAbilityGameIds: [443454],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / ancestral_swiftness_t",
      startLine: 10441,
      endLine: 10441,
      sourceNote:
        'create_action dispatches "ancestral_swiftness" to ancestral_swiftness_t: built on player->find_spell( 443454 ) (:8148). Its ready() refuses without the hero talent, a usability claim this slice does not make.',
    },
    {
      simcToken: "stormkeeper",
      candidateAbilityGameIds: [191634],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / stormkeeper_t",
      startLine: 10362,
      endLine: 10362,
      sourceNote:
        'create_action dispatches "stormkeeper" to stormkeeper_t: built on player->find_spell( 191634 ) (:8733). Its ready() refuses without talent.stormkeeper, a usability claim this slice does not make.',
    },
    {
      simcToken: "flame_shock",
      candidateAbilityGameIds: [470411],
      crossCheck: "CLASS_SPELLS",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / flame_shock_t",
      startLine: 10352,
      endLine: 10352,
      sourceNote:
        'create_action dispatches "flame_shock" to flame_shock_t: built on player->find_spell( 188389 ), a record whose _gcd is 0; its constructor takes the cooldown and trigger_gcd from find_class_spell( "Flame Shock" ), class_spells.inc row 470411, _gcd 1500. So this token binds the class row. The retained Elemental subjects log both ids in one press, so a logged 188389 has no lane record and is excluded.',
    },
    {
      simcToken: "voltaic_blaze",
      candidateAbilityGameIds: [470057],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / voltaic_blaze_t",
      startLine: 10417,
      endLine: 10417,
      sourceNote:
        'create_action dispatches "voltaic_blaze" to voltaic_blaze_t: built on player->talent.voltaic_blaze (:10112); { talent.voltaic_blaze, "Voltaic Blaze" } at :11237.',
    },
    {
      simcToken: "ascendance",
      candidateAbilityGameIds: [114050, 1219480],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / ascendance_t",
      startLine: 10341,
      endLine: 10341,
      sourceNote:
        'create_action dispatches "ascendance" to ascendance_t: built on player->spell.ascendance (:8559); spell.ascendance = find_spell( 1219480 ) for Elemental at :11419. Every retained subject logs 114050, so both rows bind; both are _gcd 1500. Its ready() refuses without talent.ascendance, a usability claim this slice does not make.',
    },
    {
      simcToken: "elemental_blast",
      candidateAbilityGameIds: [117014],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / elemental_blast_t",
      startLine: 10350,
      endLine: 10350,
      sourceNote:
        'create_action dispatches "elemental_blast" to elemental_blast_t: built on player->find_spell( 117014 ). Its ready() refuses without talent.elemental_blast, a usability claim this slice does not make.',
    },
    {
      simcToken: "earthquake",
      candidateAbilityGameIds: [61882, 462620],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / earthquake_t",
      startLine: 10381,
      endLine: 10381,
      sourceNote:
        'create_action dispatches "earthquake" to earthquake_t: built on talent.earthquake_reticle or talent.earthquake_target (:7956); find_talent_spell( SPECIALIZATION, 61882 ) and ( SPECIALIZATION, 462620 ) at :11334-11335, one choice node.',
    },
    {
      simcToken: "lava_burst",
      candidateAbilityGameIds: [51505],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / lava_burst_t",
      startLine: 10385,
      endLine: 10385,
      sourceNote:
        'create_action dispatches "lava_burst" to lava_burst_t: built on player->talent.lava_burst (:7087); _CT( "Lava Burst" ) at :11152.',
    },
    {
      simcToken: "tempest",
      candidateAbilityGameIds: [452201],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / tempest_t",
      startLine: 10372,
      endLine: 10372,
      sourceNote:
        'create_action dispatches "tempest" to tempest_t: built on player->find_spell( 452201 ) (:9876).',
    },
    {
      simcToken: "chain_lightning",
      candidateAbilityGameIds: [188443],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / chain_lightning_t",
      startLine: 10360,
      endLine: 10360,
      sourceNote:
        'create_action dispatches "chain_lightning" to chain_lightning_t: built on player->talent.chain_lightning; _CT( "Chain Lightning" ) at :11154.',
    },
    {
      simcToken: "frost_shock",
      candidateAbilityGameIds: [196840],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / frost_shock_t",
      startLine: 10354,
      endLine: 10354,
      sourceNote:
        'create_action dispatches "frost_shock" to frost_shock_t: built on player->talent.frost_shock (:8491); _CT( "Frost Shock" ) at :11160.',
    },
    {
      simcToken: "earth_shock",
      candidateAbilityGameIds: [8042],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / earth_shock_t",
      startLine: 10379,
      endLine: 10379,
      sourceNote:
        'create_action dispatches "earth_shock" to earth_shock_t: built on player->talent.earth_shock (:8207); _ST( "Earth Shock" ) at :11332.',
    },
    {
      simcToken: "lightning_bolt",
      candidateAbilityGameIds: [188196],
      crossCheck: "CLASS_SPELLS",
      sourcePath: SHAMAN_MODULE_PATH,
      symbol: "create_action / lightning_bolt_t",
      startLine: 10358,
      endLine: 10358,
      sourceNote:
        'create_action dispatches "lightning_bolt" to lightning_bolt_t: built on player->find_class_spell( "Lightning Bolt" ), class_spells.inc row 188196.',
    },
  ],
  metaActionLanes: [
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

const DRUID_BALANCE_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED: the class module every token binding is a hand-reviewed reading of.
  classModule: "engine/class_modules/sc_druid.cpp",
  // HASHED, NEVER PARSED. Present because every target hashes the same shared sources.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const DRUID_BALANCE_MODULE_PATH = "engine/class_modules/sc_druid.cpp";

/**
 * The Balance Druid facts (ONB-D2).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the pinned Balance list
 * (apl/druid/balance_apl.inc) executes. Facts a reader should not have to rediscover:
 *
 *   - CELESTIAL ALIGNMENT BINDS TWO ROWS. create_action builds Incarnation for the same token when the talent is taken, and
 *     both rows are _gcd 0, so the token is NON_GCD on either build.
 *   - ECLIPSE BINDS TWO ROWS. eclipse_t picks 1233272 or 1233346 by Lunar Calling, and both are _gcd 500: a GCD action.
 *     Retained subjects log 1233272.
 *   - THE MOONS BIND THEIR OWN ROWS: 274281 at _gcd 1000, 274282 and 274283 at 1500.
 *   - THE RACIAL, POTION, ITEM AND EXTERNAL-BUFF TOKENS ARE NOT BOUND. Moonkin Form appears only in precombat.
 */
const DRUID_BALANCE_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 194223, displayNameEn: "Celestial Alignment", baseGcdMs: 0 },
    { abilityGameId: 102560, displayNameEn: "Incarnation: Chosen of Elune", baseGcdMs: 0 },
    { abilityGameId: 190984, displayNameEn: "Wrath", baseGcdMs: 1500 },
    { abilityGameId: 194153, displayNameEn: "Starfire", baseGcdMs: 1500 },
    { abilityGameId: 1233272, displayNameEn: "Lunar Eclipse", baseGcdMs: 500 },
    { abilityGameId: 1233346, displayNameEn: "Solar Eclipse", baseGcdMs: 500 },
    { abilityGameId: 8921, displayNameEn: "Moonfire", baseGcdMs: 1500 },
    { abilityGameId: 93402, displayNameEn: "Sunfire", baseGcdMs: 1500 },
    { abilityGameId: 202770, displayNameEn: "Fury of Elune", baseGcdMs: 1500 },
    { abilityGameId: 205636, displayNameEn: "Force of Nature", baseGcdMs: 1500 },
    { abilityGameId: 391528, displayNameEn: "Convoke the Spirits", baseGcdMs: 1500 },
    { abilityGameId: 78674, displayNameEn: "Starsurge", baseGcdMs: 1500 },
    { abilityGameId: 191034, displayNameEn: "Starfall", baseGcdMs: 1500 },
    { abilityGameId: 274281, displayNameEn: "New Moon", baseGcdMs: 1000 },
    { abilityGameId: 274282, displayNameEn: "Half Moon", baseGcdMs: 1500 },
    { abilityGameId: 274283, displayNameEn: "Full Moon", baseGcdMs: 1500 },
    { abilityGameId: 88747, displayNameEn: "Wild Mushroom", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "celestial_alignment",
      candidateAbilityGameIds: [194223, 102560],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / celestial_alignment_t / incarnation_moonkin_t",
      startLine: 10160,
      endLine: 10160,
      sourceNote:
        'create_action dispatches "celestial_alignment" to celestial_alignment_t / incarnation_moonkin_t: on the token "celestial_alignment", create_action builds incarnation_moonkin_t when talent.incarnation_moonkin is taken (:10160), else celestial_alignment_t (:10167). spec.celestial_alignment = talent.celestial_alignment.find_override_spell() at :10692; spec.incarnation_moonkin = check( talent.incarnation_moonkin, 102560 ) at :10697.',
    },
    {
      simcToken: "wrath",
      candidateAbilityGameIds: [190984],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / wrath_t",
      startLine: 10258,
      endLine: 10258,
      sourceNote:
        'create_action dispatches "wrath" to wrath_t: built on p->spec.wrath (:9030); find_specialization_spell( "Wrath" ) at :10686.',
    },
    {
      simcToken: "starfire",
      candidateAbilityGameIds: [194153],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / starfire_t",
      startLine: 10239,
      endLine: 10239,
      sourceNote:
        'create_action dispatches "starfire" to starfire_t: built on p->talent.starfire (:8486); CT( "Starfire" ) at :10365.',
    },
    {
      simcToken: "eclipse",
      candidateAbilityGameIds: [1233272, 1233346],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / eclipse_t",
      startLine: 10175,
      endLine: 10175,
      sourceNote:
        'create_action dispatches "eclipse" to eclipse_t: built on p->find_spell( p->talent.lunar_calling.ok() ? 1233272 : 1233346 ) (:7258).',
    },
    {
      simcToken: "moonfire",
      candidateAbilityGameIds: [8921],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / moonfire_t",
      startLine: 10254,
      endLine: 10254,
      sourceNote:
        'create_action dispatches "moonfire" to moonfire_t: built on p->spec.moonfire (:7869); find_class_spell( "Moonfire" ), or find_spell( 8921 ) with Red Moon, at :10681. Both are 8921.',
    },
    {
      simcToken: "sunfire",
      candidateAbilityGameIds: [93402],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / sunfire_t",
      startLine: 10241,
      endLine: 10241,
      sourceNote:
        'create_action dispatches "sunfire" to sunfire_t: built on p->talent.sunfire (:8764); CT( "Sunfire" ) at :10368.',
    },
    {
      simcToken: "fury_of_elune",
      candidateAbilityGameIds: [202770],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / fury_of_elune_t",
      startLine: 10179,
      endLine: 10179,
      sourceNote:
        'create_action dispatches "fury_of_elune" to fury_of_elune_t: built on p->talent.fury_of_elune; ST( "Fury of Elune" ) at :10402.',
    },
    {
      simcToken: "force_of_nature",
      candidateAbilityGameIds: [205636],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / force_of_nature_t",
      startLine: 10178,
      endLine: 10178,
      sourceNote:
        'create_action dispatches "force_of_nature" to force_of_nature_t: built on p->talent.force_of_nature (:7304); ST( "Force of Nature" ) at :10401.',
    },
    {
      simcToken: "convoke_the_spirits",
      candidateAbilityGameIds: [391528],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / convoke_the_spirits_t",
      startLine: 10219,
      endLine: 10219,
      sourceNote:
        'create_action dispatches "convoke_the_spirits" to convoke_the_spirits_t: built on p->talent.convoke_the_spirits (:9256); ST( "Convoke the Spirits" ) at :10383, trait row spell 391528.',
    },
    {
      simcToken: "starsurge",
      candidateAbilityGameIds: [78674],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / starsurge_t",
      startLine: 10186,
      endLine: 10186,
      sourceNote:
        'create_action dispatches "starsurge" to starsurge_t: for Balance, create_action builds starsurge_t (:10186), built on p->talent.starsurge (:8650); CT( "Starsurge" ) at :10367, Balance\'s trait row spell 78674.',
    },
    {
      simcToken: "starfall",
      candidateAbilityGameIds: [191034],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / starfall_t",
      startLine: 10185,
      endLine: 10185,
      sourceNote:
        'create_action dispatches "starfall" to starfall_t: built on spec.starfall; find_specialization_spell( "Starfall" ) at :10699.',
    },
    {
      simcToken: "new_moon",
      candidateAbilityGameIds: [274281],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / new_moon_t",
      startLine: 10180,
      endLine: 10180,
      sourceNote:
        'create_action dispatches "new_moon" to new_moon_t: built on p->talent.new_moon (:7611); ST( "New Moon" ) at :10412.',
    },
    {
      simcToken: "half_moon",
      candidateAbilityGameIds: [274282],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / half_moon_t",
      startLine: 10181,
      endLine: 10181,
      sourceNote:
        'create_action dispatches "half_moon" to half_moon_t: built on p->spec.half_moon (:7623); check( talent.new_moon, 274282 ) at :10696.',
    },
    {
      simcToken: "full_moon",
      candidateAbilityGameIds: [274283],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / full_moon_t",
      startLine: 10182,
      endLine: 10182,
      sourceNote:
        'create_action dispatches "full_moon" to full_moon_t: built on p->spec.full_moon (:7635); check( talent.new_moon, 274283 ) at :10695.',
    },
    {
      simcToken: "wild_mushroom",
      candidateAbilityGameIds: [88747],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID_BALANCE_MODULE_PATH,
      symbol: "create_action / wild_mushroom_t",
      startLine: 10188,
      endLine: 10188,
      sourceNote:
        'create_action dispatches "wild_mushroom" to wild_mushroom_t: built on talent.wild_mushroom; ST( "Wild Mushroom" ) at :10434.',
    },
  ],
  metaActionLanes: [
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

const PRIEST_SHADOW_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED: the two files every token binding is a hand-reviewed reading of.
  classModule: "engine/class_modules/priest/sc_priest.cpp",
  shadowModule: "engine/class_modules/priest/sc_priest_shadow.cpp",
  // HASHED, NEVER PARSED. Present because every target hashes the same shared sources.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const PRIEST_MODULE_PATH = "engine/class_modules/priest/sc_priest.cpp";
const SHADOW_MODULE_PATH = "engine/class_modules/priest/sc_priest_shadow.cpp";

/**
 * The Shadow Priest facts (ONB-D2).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the pinned Shadow list
 * (apl_priest.cpp `shadow`) executes. Facts a reader should not have to rediscover:
 *
 *   - POWER INFUSION AND DESPERATE PRAYER ARE `_gcd` 0, SO THEY ARE NON_GCD.
 *   - HALO BINDS SHADOW'S TRAIT ROW 120644. Holy's is 120517; the retained subjects log 120644.
 *   - VOID BLAST BINDS 450983, Shadow's row, not Discipline's 450215.
 *   - SHADOWY APPARITION (341263) IS LOGGED AS A CAST HUNDREDS OF TIMES AND IS NOT A PRESS. It is no token of the list, has no lane
 *     record and is excluded.
 *   - THE RACIAL, POTION, ITEM AND EXTERNAL-BUFF TOKENS ARE NOT BOUND. Shadowform appears only in precombat.
 */
const PRIEST_SHADOW_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 10060, displayNameEn: "Power Infusion", baseGcdMs: 0 },
    { abilityGameId: 120644, displayNameEn: "Halo", baseGcdMs: 1500 },
    { abilityGameId: 228260, displayNameEn: "Voidform", baseGcdMs: 1500 },
    { abilityGameId: 19236, displayNameEn: "Desperate Prayer", baseGcdMs: 0 },
    { abilityGameId: 132157, displayNameEn: "Holy Nova", baseGcdMs: 1500 },
    { abilityGameId: 32379, displayNameEn: "Shadow Word: Death", baseGcdMs: 1500 },
    { abilityGameId: 335467, displayNameEn: "Shadow Word: Madness", baseGcdMs: 1500 },
    { abilityGameId: 1227280, displayNameEn: "Tentacle Slam", baseGcdMs: 1500 },
    { abilityGameId: 263165, displayNameEn: "Void Torrent", baseGcdMs: 1500 },
    { abilityGameId: 589, displayNameEn: "Shadow Word: Pain", baseGcdMs: 1500 },
    { abilityGameId: 1242173, displayNameEn: "Void Volley", baseGcdMs: 1500 },
    { abilityGameId: 450983, displayNameEn: "Void Blast", baseGcdMs: 1500 },
    { abilityGameId: 8092, displayNameEn: "Mind Blast", baseGcdMs: 1500 },
    { abilityGameId: 391403, displayNameEn: "Mind Flay: Insanity", baseGcdMs: 1500 },
    { abilityGameId: 34914, displayNameEn: "Vampiric Touch", baseGcdMs: 1500 },
    { abilityGameId: 15407, displayNameEn: "Mind Flay", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "power_infusion",
      candidateAbilityGameIds: [10060],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: PRIEST_MODULE_PATH,
      symbol: "create_action / power_infusion_t",
      startLine: 3078,
      endLine: 3078,
      sourceNote:
        'create_action dispatches "power_infusion" to power_infusion_t: built on p.talents.power_infusion (:925); CT( "Power Infusion" ) at :3334.',
    },
    {
      simcToken: "halo",
      candidateAbilityGameIds: [120644],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: PRIEST_MODULE_PATH,
      symbol: "create_action / halo_t",
      startLine: 3046,
      endLine: 3046,
      sourceNote:
        'create_action dispatches "halo" to halo_t: built on p.talents.archon.halo (:604); HT( "Halo" ) at :3394, Shadow\'s trait row spell 120644.',
    },
    {
      simcToken: "voidform",
      candidateAbilityGameIds: [228260],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHADOW_MODULE_PATH,
      symbol: "create_action / voidform_t",
      startLine: 2497,
      endLine: 2497,
      sourceNote:
        'create_action dispatches "voidform" to voidform_t: built on p.talents.shadow.voidform (:1349); ST( "Voidform" ) at :2412.',
    },
    {
      simcToken: "desperate_prayer",
      candidateAbilityGameIds: [19236],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: PRIEST_MODULE_PATH,
      symbol: "create_action / desperate_prayer_t",
      startLine: 3074,
      endLine: 3074,
      sourceNote:
        'create_action dispatches "desperate_prayer" to desperate_prayer_t: built on p.talents.desperate_prayer (:1857); CT( "Desperate Prayer" ) at :3364.',
    },
    {
      simcToken: "holy_nova",
      candidateAbilityGameIds: [132157],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: PRIEST_MODULE_PATH,
      symbol: "create_action / holy_nova_t",
      startLine: 3090,
      endLine: 3090,
      sourceNote:
        'create_action dispatches "holy_nova" to holy_nova_t: built on p.talents.holy_nova (:1497); CT( "Holy Nova" ) at :3325.',
    },
    {
      simcToken: "shadow_word_death",
      candidateAbilityGameIds: [32379],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: PRIEST_MODULE_PATH,
      symbol: "create_action / shadow_word_death_t",
      startLine: 3086,
      endLine: 3086,
      sourceNote:
        'create_action dispatches "shadow_word_death" to shadow_word_death_t: built on p.talents.shadow_word_death (:1211); CT( "Shadow Word: Death" ) at :3360.',
    },
    {
      simcToken: "shadow_word_madness",
      candidateAbilityGameIds: [335467],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHADOW_MODULE_PATH,
      symbol: "create_action / shadow_word_madness_t",
      startLine: 2533,
      endLine: 2533,
      sourceNote:
        'create_action dispatches "shadow_word_madness" to shadow_word_madness_t: built on p.dot_spells.shadow_word_madness; find_talent_spell( SPECIALIZATION, "Shadow Word: Madness" ) at sc_priest.cpp:3311.',
    },
    {
      simcToken: "tentacle_slam",
      candidateAbilityGameIds: [1227280],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHADOW_MODULE_PATH,
      symbol: "create_action / tentacle_slam_t",
      startLine: 2501,
      endLine: 2501,
      sourceNote:
        'create_action dispatches "tentacle_slam" to tentacle_slam_t: built on p.talents.shadow.tentacle_slam (:1801); ST( "Tentacle Slam" ) at :2401.',
    },
    {
      simcToken: "void_torrent",
      candidateAbilityGameIds: [263165],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: SHADOW_MODULE_PATH,
      symbol: "create_action / void_torrent_t",
      startLine: 2505,
      endLine: 2505,
      sourceNote:
        'create_action dispatches "void_torrent" to void_torrent_t: built on p.talents.voidweaver.void_torrent (:1424); HT( "Void Torrent" ) at sc_priest.cpp:3445.',
    },
    {
      simcToken: "shadow_word_pain",
      candidateAbilityGameIds: [589],
      crossCheck: "CLASS_SPELLS",
      sourcePath: SHADOW_MODULE_PATH,
      symbol: "create_action / shadow_word_pain_t",
      startLine: 2509,
      endLine: 2509,
      sourceNote:
        'create_action dispatches "shadow_word_pain" to shadow_word_pain_t: built on p.dot_spells.shadow_word_pain (:559); find_class_spell( "Shadow Word: Pain" ) at sc_priest.cpp:3309.',
    },
    {
      simcToken: "void_volley",
      candidateAbilityGameIds: [1242173],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHADOW_MODULE_PATH,
      symbol: "create_action / void_volley_t",
      startLine: 2537,
      endLine: 2537,
      sourceNote:
        'create_action dispatches "void_volley" to void_volley_t: built on talents.shadow.void_volley = find_spell( 1242173 ) at :2413.',
    },
    {
      simcToken: "void_blast",
      candidateAbilityGameIds: [450983],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: PRIEST_MODULE_PATH,
      symbol: "create_action / void_blast_shadow_t",
      startLine: 3102,
      endLine: 3102,
      sourceNote:
        'create_action dispatches "void_blast" to void_blast_shadow_t: for Shadow, create_action builds void_blast_shadow_t, built on p.talents.voidweaver.void_blast_shadow (:373).',
    },
    {
      simcToken: "mind_blast",
      candidateAbilityGameIds: [8092],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: PRIEST_MODULE_PATH,
      symbol: "create_action / mind_blast_t",
      startLine: 3066,
      endLine: 3066,
      sourceNote:
        'create_action dispatches "mind_blast" to mind_blast_t: built on p.talents.mind_blast (:340); CT( "Mind Blast" ) at :3322.',
    },
    {
      simcToken: "mind_flay_insanity",
      candidateAbilityGameIds: [391403],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHADOW_MODULE_PATH,
      symbol: "create_action / mind_flay_insanity_t",
      startLine: 2493,
      endLine: 2493,
      sourceNote:
        'create_action dispatches "mind_flay_insanity" to mind_flay_insanity_t: built on p.talents.archon.mind_flay_insanity_spell (:97); find_spell( 391403 ) at sc_priest.cpp:3405.',
    },
    {
      simcToken: "vampiric_touch",
      candidateAbilityGameIds: [34914],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHADOW_MODULE_PATH,
      symbol: "create_action / vampiric_touch_t",
      startLine: 2513,
      endLine: 2513,
      sourceNote:
        'create_action dispatches "vampiric_touch" to vampiric_touch_t: built on p.dot_spells.vampiric_touch; find_specialization_spell( "Vampiric Touch", PRIEST_SHADOW ) at sc_priest.cpp:3310.',
    },
    {
      simcToken: "mind_flay",
      candidateAbilityGameIds: [15407],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: SHADOW_MODULE_PATH,
      symbol: "create_action / mind_flay_t",
      startLine: 2489,
      endLine: 2489,
      sourceNote:
        'create_action dispatches "mind_flay" to mind_flay_t: built on p.specs.mind_flay (:130); find_specialization_spell( "Mind Flay" ) at :2472.',
    },
  ],
  metaActionLanes: [
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

const MAGE_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED: the class module every token binding is a hand-reviewed reading of.
  classModule: "engine/class_modules/sc_mage.cpp",
  // HASHED, NEVER PARSED. Present because every target hashes the same shared sources.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const MAGE_MODULE_PATH = "engine/class_modules/sc_mage.cpp";

/**
 * The Arcane Mage facts (ONB-D3).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the pinned Arcane list
 * (apl/mage.cpp `arcane`) executes. Facts a reader should not have to rediscover:
 *
 *   - PRISMATIC BOLT BINDS 1295924, the literal its constructor reads (sc_mage.cpp:2908). Retained subjects log it.
 *   - ARCANE PULSE BINDS 1241462, the talent's row. Its echo, 1243460, is a triggered copy (_cast_time 0), so it has no lane record here.
 *   - COUNTERSPELL, TOUCH OF THE MAGI AND PRESENCE OF MIND ARE `_gcd` 0, SO THEY ARE NON_GCD. The last two carry `use_off_gcd=1`.
 *   - CANCEL_ACTION IS NOT BOUND. It starts nothing: it stops a channel.
 *   - THE RACIAL, POTION, ITEM AND EXTERNAL-BUFF TOKENS ARE NOT BOUND. Arcane Intellect and Mirror Image appear only in precombat.
 */
const MAGE_ARCANE_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 2139, displayNameEn: "Counterspell", baseGcdMs: 0 },
    { abilityGameId: 44425, displayNameEn: "Arcane Barrage", baseGcdMs: 1500 },
    { abilityGameId: 30451, displayNameEn: "Arcane Blast", baseGcdMs: 1500 },
    { abilityGameId: 5143, displayNameEn: "Arcane Missiles", baseGcdMs: 1500 },
    { abilityGameId: 1241462, displayNameEn: "Arcane Pulse", baseGcdMs: 1500 },
    { abilityGameId: 153626, displayNameEn: "Arcane Orb", baseGcdMs: 1500 },
    { abilityGameId: 365350, displayNameEn: "Arcane Surge", baseGcdMs: 1500 },
    { abilityGameId: 12051, displayNameEn: "Evocation", baseGcdMs: 1500 },
    { abilityGameId: 205025, displayNameEn: "Presence of Mind", baseGcdMs: 0 },
    { abilityGameId: 1295924, displayNameEn: "Prismatic Bolt", baseGcdMs: 1500 },
    { abilityGameId: 321507, displayNameEn: "Touch of the Magi", baseGcdMs: 0 },
  ],
  tokenBindings: [
    {
      simcToken: "counterspell",
      candidateAbilityGameIds: [2139],
      crossCheck: "CLASS_SPELLS",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / counterspell_t",
      startLine: 5711,
      endLine: 5711,
      sourceNote:
        'create_action dispatches "counterspell" to counterspell_t: built on p->find_class_spell( "Counterspell" ) (:3641), class_spells.inc row 2139.',
    },
    {
      simcToken: "arcane_barrage",
      candidateAbilityGameIds: [44425],
      crossCheck: "CLASS_SPELLS",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / arcane_barrage_t",
      startLine: 5677,
      endLine: 5677,
      sourceNote:
        'create_action dispatches "arcane_barrage" to arcane_barrage_t: built on p->find_specialization_spell( "Arcane Barrage" ) (:2684), class_spells.inc row 44425.',
    },
    {
      simcToken: "arcane_blast",
      candidateAbilityGameIds: [30451],
      crossCheck: "CLASS_SPELLS",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / arcane_blast_t",
      startLine: 5678,
      endLine: 5678,
      sourceNote:
        'create_action dispatches "arcane_blast" to arcane_blast_t: built on p->find_specialization_spell( "Arcane Blast" ) (:2832), class_spells.inc row 30451.',
    },
    {
      simcToken: "arcane_missiles",
      candidateAbilityGameIds: [5143],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / arcane_missiles_t",
      startLine: 5679,
      endLine: 5679,
      sourceNote:
        'create_action dispatches "arcane_missiles" to arcane_missiles_t: built on p->talents.arcane_missiles (:3184); talents.arcane_missiles = find_talent_spell at :6016.',
    },
    {
      simcToken: "arcane_pulse",
      candidateAbilityGameIds: [1241462],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / arcane_pulse_t",
      startLine: 5680,
      endLine: 5680,
      sourceNote:
        'create_action dispatches "arcane_pulse" to arcane_pulse_t: built on p->talents.arcane_pulse (:2974) when not an echo; talents.arcane_pulse = find_talent_spell at :6025.',
    },
    {
      simcToken: "arcane_orb",
      candidateAbilityGameIds: [153626],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / arcane_orb_t",
      startLine: 5681,
      endLine: 5681,
      sourceNote:
        'create_action dispatches "arcane_orb" to arcane_orb_t: built on p->talents.arcane_orb (:2604) on the normal path; talents.arcane_orb = find_talent_spell at :6027.',
    },
    {
      simcToken: "arcane_surge",
      candidateAbilityGameIds: [365350],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / arcane_surge_t",
      startLine: 5682,
      endLine: 5682,
      sourceNote:
        'create_action dispatches "arcane_surge" to arcane_surge_t: built on p->talents.arcane_surge (:3306); talents.arcane_surge = find_talent_spell at :6026.',
    },
    {
      simcToken: "evocation",
      candidateAbilityGameIds: [12051],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / evocation_t",
      startLine: 5683,
      endLine: 5683,
      sourceNote:
        'create_action dispatches "evocation" to evocation_t: built on p->talents.evocation (:3682); talents.evocation = find_talent_spell at :6050.',
    },
    {
      simcToken: "presence_of_mind",
      candidateAbilityGameIds: [205025],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / presence_of_mind_t",
      startLine: 5684,
      endLine: 5684,
      sourceNote:
        'create_action dispatches "presence_of_mind" to presence_of_mind_t: built on p->talents.presence_of_mind (:2477); talents.presence_of_mind = find_talent_spell at :6030.',
    },
    {
      simcToken: "prismatic_bolt",
      candidateAbilityGameIds: [1295924],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / prismatic_bolt_t",
      startLine: 5685,
      endLine: 5685,
      sourceNote:
        'create_action dispatches "prismatic_bolt" to prismatic_bolt_t: built on p->find_spell( 1295924 ) (:2907). Its ready() refuses without buffs.prismatic_bolt, a usability claim this slice does not make.',
    },
    {
      simcToken: "touch_of_the_magi",
      candidateAbilityGameIds: [321507],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / touch_of_the_magi_t",
      startLine: 5686,
      endLine: 5686,
      sourceNote:
        'create_action dispatches "touch_of_the_magi" to touch_of_the_magi_t: built on p->talents.touch_of_the_magi (:5128); talents.touch_of_the_magi = find_talent_spell at :6037.',
    },
  ],
  metaActionLanes: [
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
 * The Frost Mage facts (ONB-D3).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the pinned Frost list
 * (apl/mage.cpp `frost`) executes. Facts a reader should not have to rediscover:
 *
 *   - FROSTBOLT BINDS TWO ROWS. create_action builds frostfire_bolt for the token when the talent is taken (sc_mage.cpp:5673), and both
 *     rows are _gcd 1500, so the lane does not depend on which.
 *   - BLIZZARD BINDS TWO ROWS, the talent's choice of blizzard_1 and blizzard_2 (sc_mage.cpp:6128-6129), both _gcd 1500.
 *   - ANY_BLINK IS NOT BOUND. It builds Shimmer (_gcd 0) or Blink (_gcd 1500) by talent, so no one lane holds, and it sits behind `movement.distance`.
 *   - MIRROR IMAGE'S PET CASTS FROSTBOLT 59638. It is another actor's cast and no row here.
 *   - THE RACIAL, POTION, ITEM AND EXTERNAL-BUFF TOKENS ARE NOT BOUND. Arcane Intellect and Summon Water Elemental appear only in precombat.
 */
const MAGE_FROST_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 190356, displayNameEn: "Blizzard", baseGcdMs: 1500 },
    { abilityGameId: 1248829, displayNameEn: "Blizzard", baseGcdMs: 1500 },
    { abilityGameId: 153595, displayNameEn: "Comet Storm", baseGcdMs: 1500 },
    { abilityGameId: 120, displayNameEn: "Cone of Cold", baseGcdMs: 1500 },
    { abilityGameId: 44614, displayNameEn: "Flurry", baseGcdMs: 1500 },
    { abilityGameId: 116, displayNameEn: "Frostbolt", baseGcdMs: 1500 },
    { abilityGameId: 431044, displayNameEn: "Frostfire Bolt", baseGcdMs: 1500 },
    { abilityGameId: 84714, displayNameEn: "Frozen Orb", baseGcdMs: 1500 },
    { abilityGameId: 199786, displayNameEn: "Glacial Spike", baseGcdMs: 1500 },
    { abilityGameId: 30455, displayNameEn: "Ice Lance", baseGcdMs: 1500 },
    { abilityGameId: 157997, displayNameEn: "Ice Nova", baseGcdMs: 1500 },
    { abilityGameId: 205021, displayNameEn: "Ray of Frost", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "blizzard",
      candidateAbilityGameIds: [190356, 1248829],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / blizzard_t",
      startLine: 5697,
      endLine: 5697,
      sourceNote:
        'create_action dispatches "blizzard" to blizzard_t: built on talents.blizzard_1 or talents.blizzard_2 (:3402); find_talent_spell( SPECIALIZATION, 190356 ) and ( SPECIALIZATION, 1248829 ) at :6128-6129.',
    },
    {
      simcToken: "comet_storm",
      candidateAbilityGameIds: [153595],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / comet_storm_t",
      startLine: 5699,
      endLine: 5699,
      sourceNote:
        'create_action dispatches "comet_storm" to comet_storm_t: built on p->find_spell( 153595 ) (:3561). Its ready() is a usability claim this slice does not make.',
    },
    {
      simcToken: "cone_of_cold",
      candidateAbilityGameIds: [120],
      crossCheck: "CLASS_SPELLS",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / cone_of_cold_t",
      startLine: 5710,
      endLine: 5710,
      sourceNote:
        'create_action dispatches "cone_of_cold" to cone_of_cold_t: built on p->find_class_spell( "Cone of Cold" ) (:3618), class_spells.inc row 120.',
    },
    {
      simcToken: "flurry",
      candidateAbilityGameIds: [44614],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / flurry_t",
      startLine: 5700,
      endLine: 5700,
      sourceNote:
        'create_action dispatches "flurry" to flurry_t: built on p->talents.flurry (:3917); talents.flurry = find_talent_spell at :6135.',
    },
    {
      simcToken: "frostbolt",
      candidateAbilityGameIds: [116, 431044],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / frostbolt_t",
      startLine: 5715,
      endLine: 5715,
      sourceNote:
        'create_action dispatches "frostbolt" to frostbolt_t: built on p->talents.frostfire_bolt when talented, else p->find_class_spell( "Frostbolt" ) (:3985); create_action redirects the token at :5673.',
    },
    {
      simcToken: "frozen_orb",
      candidateAbilityGameIds: [84714],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / frozen_orb_t",
      startLine: 5701,
      endLine: 5701,
      sourceNote:
        'create_action dispatches "frozen_orb" to frozen_orb_t: built on p->talents.frozen_orb (:4145); talents.frozen_orb = find_talent_spell at :6138.',
    },
    {
      simcToken: "glacial_spike",
      candidateAbilityGameIds: [199786],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / glacial_spike_t",
      startLine: 5702,
      endLine: 5702,
      sourceNote:
        'create_action dispatches "glacial_spike" to glacial_spike_t: built on p->find_spell( 199786 ) (:4227).',
    },
    {
      simcToken: "ice_lance",
      candidateAbilityGameIds: [30455],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / ice_lance_t",
      startLine: 5703,
      endLine: 5703,
      sourceNote:
        'create_action dispatches "ice_lance" to ice_lance_t: built on p->talents.ice_lance (:4408); talents.ice_lance = find_talent_spell at :6126.',
    },
    {
      simcToken: "ice_nova",
      candidateAbilityGameIds: [157997],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / ice_nova_t",
      startLine: 5716,
      endLine: 5716,
      sourceNote:
        'create_action dispatches "ice_nova" to ice_nova_t: built on p->talents.ice_nova (:4492); talents.ice_nova = find_talent_spell at :5999.',
    },
    {
      simcToken: "ray_of_frost",
      candidateAbilityGameIds: [205021],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / ray_of_frost_t",
      startLine: 5704,
      endLine: 5704,
      sourceNote:
        'create_action dispatches "ray_of_frost" to ray_of_frost_t: built on p->talents.ray_of_frost (:4939); talents.ray_of_frost = find_talent_spell at :6142.',
    },
  ],
  metaActionLanes: [
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

const HUNTER_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED: the class module every token binding is a hand-reviewed reading of.
  classModule: "engine/class_modules/sc_hunter.cpp",
  // HASHED, NEVER PARSED. Present because every target hashes the same shared sources.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const HUNTER_MODULE_PATH = "engine/class_modules/sc_hunter.cpp";

/**
 * The Affliction Warlock facts (ONB-D4).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the pinned Affliction list
 * (warlock.cpp `affliction`) executes. Facts a reader should not have to rediscover:
 *
 *   - DRAIN SOUL AND MALEFIC GRASP BIND THE ROW THEIR CHANNEL READS, not the talent's: 198590 (talents.drain_soul_dot, sc_warlock_init.cpp:149) and 1261153 (talents.malefic_grasp_2, :182). Each talent row is `_gcd` 0. The filtered M13-A capture logs 1261153.
 *   - MALEVOLENCE BINDS 442726, as Destruction's does: its action reads trigger_gcd and cooldown from hero.malevolence_buff.
 *   - CORRUPTION IS BUILT ONLY WITHOUT WITHER, and Shadow Bolt only without Drain Soul. The action profile reads that, not this table.
 *   - THE RACIAL, POTION, ITEM AND EXTERNAL-BUFF TOKENS ARE NOT BOUND. `summon_pet` and `grimoire_of_sacrifice` appear only in precombat.
 */
const WARLOCK_AFFLICTION_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 980, displayNameEn: "Agony", baseGcdMs: 1500 },
    { abilityGameId: 172, displayNameEn: "Corruption", baseGcdMs: 1500 },
    { abilityGameId: 1257052, displayNameEn: "Dark Harvest", baseGcdMs: 1500 },
    { abilityGameId: 198590, displayNameEn: "Drain Soul", baseGcdMs: 1500 },
    { abilityGameId: 48181, displayNameEn: "Haunt", baseGcdMs: 1500 },
    { abilityGameId: 1261153, displayNameEn: "Malefic Grasp", baseGcdMs: 1500 },
    { abilityGameId: 442726, displayNameEn: "Malevolence", baseGcdMs: 1500 },
    { abilityGameId: 27243, displayNameEn: "Seed of Corruption", baseGcdMs: 1500 },
    { abilityGameId: 686, displayNameEn: "Shadow Bolt", baseGcdMs: 1500 },
    { abilityGameId: 205180, displayNameEn: "Summon Darkglare", baseGcdMs: 1500 },
    { abilityGameId: 1259790, displayNameEn: "Unstable Affliction", baseGcdMs: 1500 },
    { abilityGameId: 445468, displayNameEn: "Wither", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "agony",
      candidateAbilityGameIds: [980],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / agony_t",
      startLine: 5874,
      endLine: 5874,
      sourceNote:
        'create_action dispatches "agony" to agony_t: built on p->talents.agony (:1411); find_talent_spell( SPECIALIZATION, "Agony" ) at sc_warlock_init.cpp:129.',
    },
    {
      simcToken: "corruption",
      candidateAbilityGameIds: [172],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / corruption_t",
      startLine: 5858,
      endLine: 5858,
      sourceNote:
        'create_action dispatches "corruption" to corruption_t: built on !p->hero.wither.ok() ? p->warlock_base.corruption : not_found (:785); find_class_spell( "Corruption" ) at sc_warlock_init.cpp:22, class_spells.inc row 172.',
    },
    {
      simcToken: "dark_harvest",
      candidateAbilityGameIds: [1257052],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / dark_harvest_t",
      startLine: 5886,
      endLine: 5886,
      sourceNote:
        'create_action dispatches "dark_harvest" to dark_harvest_t: built on p->talents.dark_harvest (:2461), channeled; find_talent_spell( SPECIALIZATION, "Dark Harvest" ) at sc_warlock_init.cpp:164.',
    },
    {
      simcToken: "drain_soul",
      candidateAbilityGameIds: [198590],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / drain_soul_t",
      startLine: 5880,
      endLine: 5880,
      sourceNote:
        'create_action dispatches "drain_soul" to drain_soul_t: built on p->talents.drain_soul.ok() ? p->talents.drain_soul_dot : not_found (:2281), channeled; talents.drain_soul_dot = conditional_spell_lookup( talents.drain_soul.ok(), 198590 ) at sc_warlock_init.cpp:149.',
    },
    {
      simcToken: "haunt",
      candidateAbilityGameIds: [48181],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / haunt_t",
      startLine: 5884,
      endLine: 5884,
      sourceNote:
        'create_action dispatches "haunt" to haunt_t: built on p->talents.haunt (:2390); find_talent_spell( SPECIALIZATION, "Haunt" ) at sc_warlock_init.cpp:142.',
    },
    {
      simcToken: "malefic_grasp",
      candidateAbilityGameIds: [1261153],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / malefic_grasp_t",
      startLine: 5882,
      endLine: 5882,
      sourceNote:
        'create_action dispatches "malefic_grasp" to malefic_grasp_t: built on p->talents.malefic_grasp.ok() ? p->talents.malefic_grasp_2 : not_found (:2100), channeled; talents.malefic_grasp_2 = conditional_spell_lookup( talents.malefic_grasp.ok(), 1261153 ) at sc_warlock_init.cpp:182.',
    },
    {
      simcToken: "malevolence",
      candidateAbilityGameIds: [442726],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / malevolence_t",
      startLine: 5962,
      endLine: 5962,
      sourceNote:
        'create_action dispatches "malevolence" to malevolence_t: built on p->hero.malevolence (:1298), whose trigger_gcd and cooldown it reads from hero.malevolence_buff, conditional_spell_lookup( hero.malevolence.ok(), 442726 ) at sc_warlock_init.cpp:635.',
    },
    {
      simcToken: "seed_of_corruption",
      candidateAbilityGameIds: [27243],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / seed_of_corruption_t",
      startLine: 5888,
      endLine: 5888,
      sourceNote:
        'create_action dispatches "seed_of_corruption" to seed_of_corruption_t: built on p->talents.seed_of_corruption (:1782); find_talent_spell( SPECIALIZATION, "Seed of Corruption" ) at sc_warlock_init.cpp:135.',
    },
    {
      simcToken: "shadow_bolt",
      candidateAbilityGameIds: [686],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / shadow_bolt_t",
      startLine: 5860,
      endLine: 5860,
      sourceNote:
        'create_action dispatches "shadow_bolt" to shadow_bolt_t: built on p->talents.drain_soul.ok() ? not_found : p->warlock_base.shadow_bolt (:829); find_class_spell( "Shadow Bolt" ) at sc_warlock_init.cpp:23, class_spells.inc row 686.',
    },
    {
      simcToken: "summon_darkglare",
      candidateAbilityGameIds: [205180],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / summon_darkglare_t",
      startLine: 5878,
      endLine: 5878,
      sourceNote:
        'create_action dispatches "summon_darkglare" to summon_darkglare_t: built on p->talents.summon_darkglare (:2423); find_talent_spell( SPECIALIZATION, "Summon Darkglare" ) at sc_warlock_init.cpp:169.',
    },
    {
      simcToken: "unstable_affliction",
      candidateAbilityGameIds: [1259790],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / unstable_affliction_t",
      startLine: 5876,
      endLine: 5876,
      sourceNote:
        'create_action dispatches "unstable_affliction" to unstable_affliction_t: built on p->talents.unstable_affliction (:1500); find_talent_spell( SPECIALIZATION, "Unstable Affliction" ) at sc_warlock_init.cpp:132.',
    },
    {
      simcToken: "wither",
      candidateAbilityGameIds: [445468],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / wither_t",
      startLine: 5959,
      endLine: 5959,
      sourceNote:
        'create_action dispatches "wither" to wither_t: built on p->hero.wither.ok() ? p->hero.wither_direct : not_found (:1189); hero.wither_direct = conditional_spell_lookup( hero.wither.ok(), 445468 ) at sc_warlock_init.cpp:605.',
    },
  ],
  metaActionLanes: [
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
 * The Demonology Warlock facts (ONB-X4).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the pinned Demonology list
 * (warlock.cpp `demonology`) executes. Facts a reader should not have to rediscover:
 *
 *   - HAND OF GUL'DAN BINDS THE PRESS, 105174 (talents.hand_of_guldan_cast), not the talent row 1250273.
 *   - RUINATION BINDS 434635 AND INFERNAL BOLT 434506, as Destruction's do. Each has like-named buff rows with `_gcd` 0, which no press logs.
 *   - WILD IMP 104317 AND 279910, AND DREADSTALKERS 193331 AND 193332, ARE SUMMONS, not presses, and no token binds them.
 *   - THE RACIAL, POTION, ITEM AND EXTERNAL-BUFF TOKENS ARE NOT BOUND. `summon_pet` appears only in precombat.
 */
const WARLOCK_DEMONOLOGY_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 104316, displayNameEn: "Call Dreadstalkers", baseGcdMs: 1500 },
    { abilityGameId: 264178, displayNameEn: "Demonbolt", baseGcdMs: 1500 },
    { abilityGameId: 1276467, displayNameEn: "Grimoire: Fel Ravager", baseGcdMs: 1500 },
    { abilityGameId: 1276452, displayNameEn: "Grimoire: Imp Lord", baseGcdMs: 1500 },
    { abilityGameId: 105174, displayNameEn: "Hand of Gul'dan", baseGcdMs: 1500 },
    { abilityGameId: 196277, displayNameEn: "Implosion", baseGcdMs: 1500 },
    { abilityGameId: 434506, displayNameEn: "Infernal Bolt", baseGcdMs: 1500 },
    { abilityGameId: 264130, displayNameEn: "Power Siphon", baseGcdMs: 1500 },
    { abilityGameId: 434635, displayNameEn: "Ruination", baseGcdMs: 1500 },
    { abilityGameId: 686, displayNameEn: "Shadow Bolt", baseGcdMs: 1500 },
    { abilityGameId: 265187, displayNameEn: "Summon Demonic Tyrant", baseGcdMs: 1500 },
    { abilityGameId: 1276672, displayNameEn: "Summon Doomguard", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "call_dreadstalkers",
      candidateAbilityGameIds: [104316],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / call_dreadstalkers_t",
      startLine: 5904,
      endLine: 5904,
      sourceNote:
        'create_action dispatches "call_dreadstalkers" to call_dreadstalkers_t: built on p->talents.call_dreadstalkers (:3405); find_talent_spell( SPECIALIZATION, "Call Dreadstalkers" ) at sc_warlock_init.cpp:255.',
    },
    {
      simcToken: "demonbolt",
      candidateAbilityGameIds: [264178],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / demonbolt_t",
      startLine: 5896,
      endLine: 5896,
      sourceNote:
        'create_action dispatches "demonbolt" to demonbolt_t: built on p->talents.demoniac.ok() ? p->talents.demonbolt_spell : not_found (:2912); conditional_spell_lookup( talents.demoniac.ok(), 264178 ) at sc_warlock_init.cpp:250.',
    },
    {
      simcToken: "grimoire_fel_ravager",
      candidateAbilityGameIds: [1276467],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / grimoire_fel_ravager_t",
      startLine: 5910,
      endLine: 5910,
      sourceNote:
        'create_action dispatches "grimoire_fel_ravager" to grimoire_fel_ravager_t: built on p->talents.grimoire_fel_ravager (:3699); find_talent_spell( SPECIALIZATION, "Grimoire: Fel Ravager" ) at sc_warlock_init.cpp:330.',
    },
    {
      simcToken: "grimoire_imp_lord",
      candidateAbilityGameIds: [1276452],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / grimoire_imp_lord_t",
      startLine: 5908,
      endLine: 5908,
      sourceNote:
        'create_action dispatches "grimoire_imp_lord" to grimoire_imp_lord_t: built on p->talents.grimoire_imp_lord (:3678); find_talent_spell( SPECIALIZATION, "Grimoire: Imp Lord" ) at sc_warlock_init.cpp:328.',
    },
    {
      simcToken: "hand_of_guldan",
      candidateAbilityGameIds: [105174],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / hand_of_guldan_t",
      startLine: 5898,
      endLine: 5898,
      sourceNote:
        'create_action dispatches "hand_of_guldan" to hand_of_guldan_t: built on p->talents.hand_of_guldan_cast (:2778); conditional_spell_lookup( talents.hand_of_guldan.ok(), 105174 ) at sc_warlock_init.cpp:246. The talent row is 1250273.',
    },
    {
      simcToken: "implosion",
      candidateAbilityGameIds: [196277],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / implosion_t",
      startLine: 5900,
      endLine: 5900,
      sourceNote:
        'create_action dispatches "implosion" to implosion_t: built on p->talents.implosion (:3028); find_talent_spell( SPECIALIZATION, "Implosion" ) at sc_warlock_init.cpp:269.',
    },
    {
      simcToken: "infernal_bolt",
      candidateAbilityGameIds: [434506],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / infernal_bolt_t",
      startLine: 5948,
      endLine: 5948,
      sourceNote:
        'create_action dispatches "infernal_bolt" to infernal_bolt_t: built on p->hero.infernal_bolt (:5202); conditional_spell_lookup( hero.secrets_of_the_coven.ok(), 434506 ) at sc_warlock_init.cpp:561.',
    },
    {
      simcToken: "power_siphon",
      candidateAbilityGameIds: [264130],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / power_siphon_t",
      startLine: 5902,
      endLine: 5902,
      sourceNote:
        'create_action dispatches "power_siphon" to power_siphon_t: built on p->talents.power_siphon (:3460); find_talent_spell( SPECIALIZATION, "Power Siphon" ) at sc_warlock_init.cpp:272.',
    },
    {
      simcToken: "ruination",
      candidateAbilityGameIds: [434635],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / ruination_t",
      startLine: 5951,
      endLine: 5951,
      sourceNote:
        'create_action dispatches "ruination" to ruination_t: built on p->hero.ruination_cast (:5309); conditional_spell_lookup( hero.ruination.ok(), 434635 ) at sc_warlock_init.cpp:578.',
    },
    {
      simcToken: "shadow_bolt",
      candidateAbilityGameIds: [686],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / shadow_bolt_t",
      startLine: 5860,
      endLine: 5860,
      sourceNote:
        'create_action dispatches "shadow_bolt" to shadow_bolt_t: built on p->talents.drain_soul.ok() ? not_found : p->warlock_base.shadow_bolt (:829); find_class_spell( "Shadow Bolt" ) at sc_warlock_init.cpp:23, class_spells.inc row 686. Drain Soul is an Affliction talent, not in this specialization\'s tree.',
    },
    {
      simcToken: "summon_demonic_tyrant",
      candidateAbilityGameIds: [265187],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / summon_demonic_tyrant_t",
      startLine: 5906,
      endLine: 5906,
      sourceNote:
        'create_action dispatches "summon_demonic_tyrant" to summon_demonic_tyrant_t: built on p->talents.summon_demonic_tyrant (:3567); find_talent_spell( SPECIALIZATION, "Summon Demonic Tyrant" ) at sc_warlock_init.cpp:291.',
    },
    {
      simcToken: "summon_doomguard",
      candidateAbilityGameIds: [1276672],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / summon_doomguard_t",
      startLine: 5912,
      endLine: 5912,
      sourceNote:
        'create_action dispatches "summon_doomguard" to summon_doomguard_t: built on p->talents.summon_doomguard (:3720); find_talent_spell( SPECIALIZATION, "Summon Doomguard" ) at sc_warlock_init.cpp:339.',
    },
  ],
  metaActionLanes: [
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
 * The Marksmanship Hunter facts (ONB-D4).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the pinned Marksmanship list
 * (apl_hunter.cpp `marksmanship`) executes. Facts a reader should not have to rediscover:
 *
 *   - BLACK ARROW BINDS 466930, the action's own spell (talents.black_arrow_spell, sc_hunter.cpp:4670). The Marksmanship talent row, 466932, is a `_gcd` 0 passive.
 *   - MOONLIGHT CHAKRAM BINDS 1264949 (talents.moonlight_chakram_spell, :4438). The talent row 1264902, the buff 1264946 and the damage 1266081 are not the press. The filtered M13-A capture logs 1264949.
 *   - KILL SHOT IS BACKGROUND WITH BLACK ARROW TAKEN (:4357). The action profile reads that, not this table.
 *   - TRUESHOT IS `_gcd` 0, SO IT IS NON_GCD.
 *   - RETARGET IS NOT BOUND. It is the shared pseudo-action. AUTO_SHOT is a meta-action lane below.
 *   - THE RACIAL, POTION, ITEM AND EXTERNAL-BUFF TOKENS ARE NOT BOUND. `summon_pet` appears only in precombat.
 */
const HUNTER_MARKSMANSHIP_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 19434, displayNameEn: "Aimed Shot", baseGcdMs: 1500 },
    { abilityGameId: 185358, displayNameEn: "Arcane Shot", baseGcdMs: 1500 },
    { abilityGameId: 466930, displayNameEn: "Black Arrow", baseGcdMs: 1500 },
    { abilityGameId: 212431, displayNameEn: "Explosive Shot", baseGcdMs: 1500 },
    { abilityGameId: 53351, displayNameEn: "Kill Shot", baseGcdMs: 1500 },
    { abilityGameId: 1264949, displayNameEn: "Moonlight Chakram", baseGcdMs: 1500 },
    { abilityGameId: 257620, displayNameEn: "Multi-Shot", baseGcdMs: 1500 },
    { abilityGameId: 257044, displayNameEn: "Rapid Fire", baseGcdMs: 1500 },
    { abilityGameId: 56641, displayNameEn: "Steady Shot", baseGcdMs: 1500 },
    { abilityGameId: 288613, displayNameEn: "Trueshot", baseGcdMs: 0 },
    { abilityGameId: 260243, displayNameEn: "Volley", baseGcdMs: 1500 },
    { abilityGameId: 392060, displayNameEn: "Wailing Arrow", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "aimed_shot",
      candidateAbilityGameIds: [19434],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: HUNTER_MODULE_PATH,
      symbol: "hunter_t::create_action / aimed_shot_t",
      startLine: 7535,
      endLine: 7535,
      sourceNote:
        'create_action dispatches "aimed_shot" to aimed_shot_t: built on p->talents.aimed_shot (:5451); find_talent_spell( SPECIALIZATION, "Aimed Shot", HUNTER_MARKSMANSHIP ) at :7747.',
    },
    {
      simcToken: "arcane_shot",
      candidateAbilityGameIds: [185358],
      crossCheck: "CLASS_SPELLS",
      sourcePath: HUNTER_MODULE_PATH,
      symbol: "hunter_t::create_action / arcane_shot_t",
      startLine: 7569,
      endLine: 7569,
      sourceNote:
        'create_action dispatches "arcane_shot" to arcane_shot_t: create_action builds arcane_shot_t unless Cobra Shot is taken, a Beast Mastery talent; specs.arcane_shot = find_class_spell( "Arcane Shot" ) at :8029, class_spells.inc row 185358.',
    },
    {
      simcToken: "black_arrow",
      candidateAbilityGameIds: [466930],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: HUNTER_MODULE_PATH,
      symbol: "hunter_t::create_action / black_arrow_t",
      startLine: 7541,
      endLine: 7541,
      sourceNote:
        'create_action dispatches "black_arrow" to black_arrow_t: built on p->talents.black_arrow_spell (:4670); talents.black_arrow_spell = talents.black_arrow.ok() ? find_spell( 466930 ) : not_found at :4670.',
    },
    {
      simcToken: "explosive_shot",
      candidateAbilityGameIds: [212431],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: HUNTER_MODULE_PATH,
      symbol: "hunter_t::create_action / explosive_shot_t",
      startLine: 7544,
      endLine: 7544,
      sourceNote:
        'create_action dispatches "explosive_shot" to explosive_shot_t: built on p->talents.explosive_shot (:6047); find_talent_spell( SPECIALIZATION, "Explosive Shot", HUNTER_MARKSMANSHIP ) at :7773.',
    },
    {
      simcToken: "kill_shot",
      candidateAbilityGameIds: [53351],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: HUNTER_MODULE_PATH,
      symbol: "hunter_t::create_action / kill_shot_t",
      startLine: 7577,
      endLine: 7577,
      sourceNote:
        'create_action dispatches "kill_shot" to kill_shot_t: create_action builds kill_shot_t on Marksmanship; built on p->talents.kill_shot (:4355), background with Black Arrow taken; find_talent_spell( SPECIALIZATION, "Kill Shot", HUNTER_MARKSMANSHIP ) at :7777.',
    },
    {
      simcToken: "moonlight_chakram",
      candidateAbilityGameIds: [1264949],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: HUNTER_MODULE_PATH,
      symbol: "hunter_t::create_action / moonlight_chakram_t",
      startLine: 7550,
      endLine: 7550,
      sourceNote:
        'create_action dispatches "moonlight_chakram" to moonlight_chakram_t: built on p->talents.moonlight_chakram_spell (:4438); talents.moonlight_chakram.ok() ? find_spell( 1264949 ) : not_found at :4438. Its ready() asks for its buff, a usability claim this slice does not make.',
    },
    {
      simcToken: "multishot",
      candidateAbilityGameIds: [257620],
      crossCheck: "CLASS_SPELLS",
      sourcePath: HUNTER_MODULE_PATH,
      symbol: "hunter_t::create_action / multishot_t",
      startLine: 7551,
      endLine: 7551,
      sourceNote:
        'create_action dispatches "multishot" to multishot_t: built on p->specs.multishot (:5193); find_specialization_spell( "Multi-Shot" ) at :7743, class_spells.inc row 257620.',
    },
    {
      simcToken: "rapid_fire",
      candidateAbilityGameIds: [257044],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: HUNTER_MODULE_PATH,
      symbol: "hunter_t::create_action / rapid_fire_t",
      startLine: 7553,
      endLine: 7553,
      sourceNote:
        'create_action dispatches "rapid_fire" to rapid_fire_t: built on p->talents.rapid_fire (:5833), channeled; find_talent_spell( SPECIALIZATION, "Rapid Fire", HUNTER_MARKSMANSHIP ) at :7749.',
    },
    {
      simcToken: "steady_shot",
      candidateAbilityGameIds: [56641],
      crossCheck: "CLASS_SPELLS",
      sourcePath: HUNTER_MODULE_PATH,
      symbol: "hunter_t::create_action / steady_shot_t",
      startLine: 7556,
      endLine: 7556,
      sourceNote:
        'create_action dispatches "steady_shot" to steady_shot_t: built on p->specs.steady_shot (:4077); find_class_spell( "Steady Shot" ) unless Pack Tactics is taken, at :8030, class_spells.inc row 56641.',
    },
    {
      simcToken: "trueshot",
      candidateAbilityGameIds: [288613],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: HUNTER_MODULE_PATH,
      symbol: "hunter_t::create_action / trueshot_t",
      startLine: 7561,
      endLine: 7561,
      sourceNote:
        'create_action dispatches "trueshot" to trueshot_t: built on p->talents.trueshot (:7013); find_talent_spell( SPECIALIZATION, "Trueshot", HUNTER_MARKSMANSHIP ) at :7778.',
    },
    {
      simcToken: "volley",
      candidateAbilityGameIds: [260243],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: HUNTER_MODULE_PATH,
      symbol: "hunter_t::create_action / volley_t",
      startLine: 7562,
      endLine: 7562,
      sourceNote:
        'create_action dispatches "volley" to volley_t: built on p->talents.volley (:7094); find_talent_spell( SPECIALIZATION, "Volley", HUNTER_MARKSMANSHIP ) at :7804.',
    },
    {
      simcToken: "wailing_arrow",
      candidateAbilityGameIds: [392060],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: HUNTER_MODULE_PATH,
      symbol: "hunter_t::create_action / wailing_arrow_t",
      startLine: 7563,
      endLine: 7563,
      sourceNote:
        'create_action dispatches "wailing_arrow" to wailing_arrow_t: built on p->talents.wailing_arrow (:4761); talents.wailing_dead.ok() ? find_spell( 392060 ) : not_found at :7925. Its ready() asks for its buff, a usability claim this slice does not make.',
    },
  ],
  metaActionLanes: [
    {
      simcToken: "auto_shot",
      triggerGcdMs: 0,
      sourcePath: HUNTER_MODULE_PATH,
      symbol: "auto_attack_t::auto_attack_t",
      line: 7351,
      sourceNote:
        'create_action builds actions::auto_attack_t for "auto_shot" (:7538), an action_t of type ACTION_OTHER with no spell, whose constructor assigns trigger_gcd = 0_ms.',
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
 * The Vengeance Demon Hunter facts (ONB-X3).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the pinned Vengeance list
 * (apl/apl_demon_hunter.cpp `vengeance`) executes. Facts a reader should not have to rediscover:
 *
 *   - NO CAST TIME. No row has a positive `_cast_time`. Fel Devastation is the one channel.
 *   - DEMON SPIKES, DISRUPT, INFERNAL STRIKE, METAMORPHOSIS AND VENGEFUL RETREAT ARE `_gcd` 0, SO THEY ARE NON_GCD.
 *   - FIERY BRAND IS `_gcd` 1500. `use_off_gcd` is on its constructor, and the lane reads the record.
 *   - FELBLADE IS `_gcd` 500, on the GCD lane.
 *   - REAVER'S GLAIVE IS 1283344 HERE. The Havoc row is 442294.
 *   - THE RACIAL, POTION, ITEM AND EXTERNAL-BUFF TOKENS ARE NOT BOUND.
 */
const DEMONHUNTER_VENGEANCE_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 203720, displayNameEn: "Demon Spikes", baseGcdMs: 0 },
    { abilityGameId: 183752, displayNameEn: "Disrupt", baseGcdMs: 0 },
    { abilityGameId: 212084, displayNameEn: "Fel Devastation", baseGcdMs: 1500 },
    { abilityGameId: 232893, displayNameEn: "Felblade", baseGcdMs: 500 },
    { abilityGameId: 204021, displayNameEn: "Fiery Brand", baseGcdMs: 1500 },
    { abilityGameId: 263642, displayNameEn: "Fracture", baseGcdMs: 1500 },
    { abilityGameId: 258920, displayNameEn: "Immolation Aura", baseGcdMs: 1500 },
    { abilityGameId: 189110, displayNameEn: "Infernal Strike", baseGcdMs: 0 },
    { abilityGameId: 187827, displayNameEn: "Metamorphosis", baseGcdMs: 0 },
    { abilityGameId: 1283344, displayNameEn: "Reaver's Glaive", baseGcdMs: 1500 },
    { abilityGameId: 204596, displayNameEn: "Sigil of Flame", baseGcdMs: 1500 },
    { abilityGameId: 390163, displayNameEn: "Sigil of Spite", baseGcdMs: 1500 },
    { abilityGameId: 207407, displayNameEn: "Soul Carver", baseGcdMs: 1500 },
    { abilityGameId: 228477, displayNameEn: "Soul Cleave", baseGcdMs: 1500 },
    { abilityGameId: 247454, displayNameEn: "Spirit Bomb", baseGcdMs: 1500 },
    { abilityGameId: 204157, displayNameEn: "Throw Glaive", baseGcdMs: 1500 },
    { abilityGameId: 198793, displayNameEn: "Vengeful Retreat", baseGcdMs: 0 },
  ],
  tokenBindings: [
    {
      simcToken: "demon_spikes",
      candidateAbilityGameIds: [203720],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / demon_spikes_t",
      startLine: 9735,
      endLine: 9736,
      sourceNote:
        'create_action dispatches "demon_spikes" to demon_spikes_t: built on p->spec.demon_spikes (:3877), which is find_specialization_spell( "Demon Spikes" ) at :10853. _gcd 0, use_off_gcd.',
    },
    {
      simcToken: "disrupt",
      candidateAbilityGameIds: [183752],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / disrupt_t",
      startLine: 9737,
      endLine: 9738,
      sourceNote:
        'create_action dispatches "disrupt" to disrupt_t: built on p->spell.disrupt (:3905), which is find_class_spell( "Disrupt" ) at :10768. _gcd 0.',
    },
    {
      simcToken: "fel_devastation",
      candidateAbilityGameIds: [212084],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / fel_devastation_t",
      startLine: 9741,
      endLine: 9742,
      sourceNote:
        'create_action dispatches "fel_devastation" to fel_devastation_t: built on p->talent.vengeance.fel_devastation (:4160); channeled = true at :4165.',
    },
    {
      simcToken: "felblade",
      candidateAbilityGameIds: [232893],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / felblade_t",
      startLine: 9802,
      endLine: 9803,
      sourceNote:
        'create_action dispatches "felblade" to felblade_t: built on p->talent.demon_hunter.felblade (:7876).',
    },
    {
      simcToken: "fiery_brand",
      candidateAbilityGameIds: [204021],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / fiery_brand_t",
      startLine: 9743,
      endLine: 9744,
      sourceNote:
        'create_action dispatches "fiery_brand" to fiery_brand_t: built on p->talent.vengeance.fiery_brand (:4360). use_off_gcd is on its constructor and its _gcd is 1500, so its lane is GCD_CONSUMING.',
    },
    {
      simcToken: "fracture",
      candidateAbilityGameIds: [263642],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / fracture_t",
      startLine: 9806,
      endLine: 9807,
      sourceNote:
        'create_action dispatches "fracture" to fracture_t: built on p->spec.fracture (:8040), which is find_spell( 263642, DEMON_HUNTER_VENGEANCE ) at :10856.',
    },
    {
      simcToken: "immolation_aura",
      candidateAbilityGameIds: [258920],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / immolation_aura_t",
      startLine: 9747,
      endLine: 9748,
      sourceNote:
        'create_action dispatches "immolation_aura" to immolation_aura_t: built on p->spell.immolation_aura (:4803).',
    },
    {
      simcToken: "infernal_strike",
      candidateAbilityGameIds: [189110],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / infernal_strike_t",
      startLine: 9745,
      endLine: 9746,
      sourceNote:
        'create_action dispatches "infernal_strike" to infernal_strike_t: built on p->spec.infernal_strike (:4577), which is find_specialization_spell( "Infernal Strike" ) at :10854. _gcd 0.',
    },
    {
      simcToken: "metamorphosis",
      candidateAbilityGameIds: [187827],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / metamorphosis_t",
      startLine: 9749,
      endLine: 9750,
      sourceNote:
        'create_action dispatches "metamorphosis" to metamorphosis_t: built on p->spec.metamorphosis (:4903); for Vengeance spec.metamorphosis = find_specialization_spell( "Metamorphosis" ) at :10799. _gcd 0.',
    },
    {
      simcToken: "reavers_glaive",
      candidateAbilityGameIds: [1283344],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / reavers_glaive_t",
      startLine: 9816,
      endLine: 9817,
      sourceNote:
        'create_action dispatches "reavers_glaive" to reavers_glaive_t: built on p->hero_spec.reavers_glaive (:8432); for Vengeance that is talent_spell_lookup( talent.aldrachi_reaver.art_of_the_glaive, 1283344 ) at :11322, not the Havoc row 442294.',
    },
    {
      simcToken: "sigil_of_flame",
      candidateAbilityGameIds: [204596],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / sigil_of_flame_t",
      startLine: 9753,
      endLine: 9754,
      sourceNote:
        'create_action dispatches "sigil_of_flame" to sigil_of_flame_t: built on p->spec.sigil_of_flame (:4479), which is find_spell( 204596, DEMON_HUNTER_VENGEANCE ) at :11261.',
    },
    {
      simcToken: "sigil_of_spite",
      candidateAbilityGameIds: [390163],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / sigil_of_spite_t",
      startLine: 9757,
      endLine: 9758,
      sourceNote:
        'create_action dispatches "sigil_of_spite" to sigil_of_spite_t: built on p->talent.vengeance.sigil_of_spite (:5470).',
    },
    {
      simcToken: "soul_carver",
      candidateAbilityGameIds: [207407],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / soul_carver_t",
      startLine: 9814,
      endLine: 9815,
      sourceNote:
        'create_action dispatches "soul_carver" to soul_carver_t: built on p->talent.vengeance.soul_carver (:8686).',
    },
    {
      simcToken: "soul_cleave",
      candidateAbilityGameIds: [228477],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / soul_cleave_t",
      startLine: 9808,
      endLine: 9809,
      sourceNote:
        'create_action dispatches "soul_cleave" to soul_cleave_t: built on p->spec.soul_cleave (:8199), which is find_specialization_spell( "Soul Cleave" ) at :10855.',
    },
    {
      simcToken: "spirit_bomb",
      candidateAbilityGameIds: [247454],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / spirit_bomb_t",
      startLine: 9755,
      endLine: 9756,
      sourceNote:
        'create_action dispatches "spirit_bomb" to spirit_bomb_t: built on p->talent.vengeance.spirit_bomb (:5379).',
    },
    {
      simcToken: "throw_glaive",
      candidateAbilityGameIds: [204157],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / throw_glaive_t",
      startLine: 9810,
      endLine: 9811,
      sourceNote:
        'create_action dispatches "throw_glaive" to throw_glaive_t: built on p->spell.throw_glaive (:8311).',
    },
    {
      simcToken: "vengeful_retreat",
      candidateAbilityGameIds: [198793],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "demon_hunter_t::create_action / vengeful_retreat_t",
      startLine: 9812,
      endLine: 9813,
      sourceNote:
        'create_action dispatches "vengeful_retreat" to vengeful_retreat_t: built on p->talent.demon_hunter.vengeful_retreat (:8589). _gcd 0.',
    },
  ],
  metaActionLanes: [
    {
      simcToken: "auto_attack",
      triggerGcdMs: 0,
      sourcePath: DEMONHUNTER_HAVOC_SOURCES.classModule,
      symbol: "auto_attack_t::auto_attack_t",
      line: 7006,
      sourceNote:
        'auto_attack_t is built on the spell-less demon_hunter_attack_t( "auto_attack", p, spell_data_t::nil() ) base ' +
        "(sc_demon_hunter.cpp:7002-7003) and its constructor assigns trigger_gcd = timespan_t::zero() at :7006.",
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

const EVOKER_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED: the class module every token binding is a hand-reviewed reading of.
  classModule: "engine/class_modules/sc_evoker.cpp",
  // HASHED, NEVER PARSED. Present because every target hashes the same shared sources.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const EVOKER_MODULE_PATH = "engine/class_modules/sc_evoker.cpp";

/**
 * The Devastation Evoker facts (ONB-X2).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the pinned Devastation list
 * (apl/apl_evoker.cpp `devastation`) executes. Facts a reader should not have to rediscover:
 *
 *   - FIRE BREATH AND ETERNITY SURGE ARE `_gcd` 500, on the GCD lane. The empowered charge sets gcd_type NONE and min_gcd to it (sc_evoker.cpp:2042). Each binds its Font of Magic row too.
 *   - DEEP BREATH BINDS TWO ROWS, 357210 and Maneuverability's 433874, both _gcd 1500.
 *   - HOVER, QUELL AND TIP THE SCALES ARE `_gcd` 0, SO THEY ARE NON_GCD.
 *   - AZURE SWEEP 1265871 AND UNBOUND FLAME 1292323 ARE THEIR BUFFS, _gcd 0, and no row here. 1265872 and 1292321 are the actions.
 *   - THE RACIAL, POTION, ITEM AND EXTERNAL-BUFF TOKENS ARE NOT BOUND.
 */
const EVOKER_DEVASTATION_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 362969, displayNameEn: "Azure Strike", baseGcdMs: 1500 },
    { abilityGameId: 1265872, displayNameEn: "Azure Sweep", baseGcdMs: 1500 },
    { abilityGameId: 357210, displayNameEn: "Deep Breath", baseGcdMs: 1500 },
    { abilityGameId: 433874, displayNameEn: "Deep Breath", baseGcdMs: 1500 },
    { abilityGameId: 356995, displayNameEn: "Disintegrate", baseGcdMs: 1500 },
    { abilityGameId: 375087, displayNameEn: "Dragonrage", baseGcdMs: 1500 },
    { abilityGameId: 355913, displayNameEn: "Emerald Blossom", baseGcdMs: 1500 },
    { abilityGameId: 359073, displayNameEn: "Eternity Surge", baseGcdMs: 500 },
    { abilityGameId: 382411, displayNameEn: "Eternity Surge", baseGcdMs: 500 },
    { abilityGameId: 357208, displayNameEn: "Fire Breath", baseGcdMs: 500 },
    { abilityGameId: 382266, displayNameEn: "Fire Breath", baseGcdMs: 500 },
    { abilityGameId: 358267, displayNameEn: "Hover", baseGcdMs: 0 },
    { abilityGameId: 361469, displayNameEn: "Living Flame", baseGcdMs: 1500 },
    { abilityGameId: 357211, displayNameEn: "Pyre", baseGcdMs: 1500 },
    { abilityGameId: 351338, displayNameEn: "Quell", baseGcdMs: 0 },
    { abilityGameId: 370553, displayNameEn: "Tip the Scales", baseGcdMs: 0 },
    { abilityGameId: 1292321, displayNameEn: "Unbound Flame", baseGcdMs: 1500 },
    { abilityGameId: 360995, displayNameEn: "Verdant Embrace", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "azure_strike",
      candidateAbilityGameIds: [362969],
      crossCheck: "CLASS_SPELLS",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / azure_strike_t",
      startLine: 10941,
      endLine: 10941,
      sourceNote:
        'create_action dispatches "azure_strike" to azure_strike_t: built on p->find_class_spell( "Azure Strike" ) (:5584).',
    },
    {
      simcToken: "azure_sweep",
      candidateAbilityGameIds: [1265872],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / azure_sweep_t",
      startLine: 10943,
      endLine: 10943,
      sourceNote:
        'create_action dispatches "azure_sweep" to azure_sweep_t: built on p->talent.azure_sweep_spell (:5602), which is find_spell( 1265872 ) at :10027; ready() asks for its buff.',
    },
    {
      simcToken: "deep_breath",
      candidateAbilityGameIds: [357210, 433874],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / deep_breath_t",
      startLine: 10945,
      endLine: 10945,
      sourceNote:
        'create_action dispatches "deep_breath" to deep_breath_t: built on the Maneuverability row 433874 when that hero talent is taken, else p->find_class_spell( "Deep Breath" ) 357210 (:6253), and on not_found() only with breath_of_eons, which no Devastation build has. Both rows are _gcd 1500, so the lane does not depend on which.',
    },
    {
      simcToken: "disintegrate",
      candidateAbilityGameIds: [356995],
      crossCheck: "CLASS_SPELLS",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / disintegrate_t",
      startLine: 10947,
      endLine: 10947,
      sourceNote:
        'create_action dispatches "disintegrate" to disintegrate_t: built on p->find_class_spell( "Disintegrate" ) (:6353), and on not_found() only with eruption, which no Devastation build has.',
    },
    {
      simcToken: "dragonrage",
      candidateAbilityGameIds: [375087],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / dragonrage_t",
      startLine: 10949,
      endLine: 10949,
      sourceNote:
        'create_action dispatches "dragonrage" to dragonrage_t: built on p->talent.dragonrage (:7336).',
    },
    {
      simcToken: "emerald_blossom",
      candidateAbilityGameIds: [355913],
      crossCheck: "CLASS_SPELLS",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / emerald_blossom_t",
      startLine: 10973,
      endLine: 10973,
      sourceNote:
        'create_action dispatches "emerald_blossom" to emerald_blossom_t: built on p->spec.emerald_blossom (:4343), which is find_spell( 355913 ) at :9970.',
    },
    {
      simcToken: "eternity_surge",
      candidateAbilityGameIds: [359073, 382411],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / eternity_surge_t",
      startLine: 10951,
      endLine: 10951,
      sourceNote:
        'create_action dispatches "eternity_surge" to eternity_surge_t: built on p->talent.eternity_surge (:5508), and find_spell_override( spell, p->talent.font_of_magic ) reads the Font of Magic row (:3509). Both rows are _gcd 500, so the lane does not depend on which.',
    },
    {
      simcToken: "fire_breath",
      candidateAbilityGameIds: [357208, 382266],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / fire_breath_t",
      startLine: 10955,
      endLine: 10955,
      sourceNote:
        'create_action dispatches "fire_breath" to fire_breath_t: built on p->find_class_spell( "Fire Breath" ) (:5339), and find_spell_override( spell, p->talent.font_of_magic ) reads the Font of Magic row (:3509). Both rows are _gcd 500, so the lane does not depend on which.',
    },
    {
      simcToken: "hover",
      candidateAbilityGameIds: [358267],
      crossCheck: "CLASS_SPELLS",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / hover_t",
      startLine: 10957,
      endLine: 10957,
      sourceNote:
        'create_action dispatches "hover" to hover_t: built on p->find_class_spell( "Hover" ) (:6730). _gcd 0, usable_while_casting.',
    },
    {
      simcToken: "living_flame",
      candidateAbilityGameIds: [361469],
      crossCheck: "CLASS_SPELLS",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / living_flame_t",
      startLine: 10961,
      endLine: 10961,
      sourceNote:
        'create_action dispatches "living_flame" to living_flame_t: built on p->find_class_spell( "Living Flame" ) (:6790).',
    },
    {
      simcToken: "pyre",
      candidateAbilityGameIds: [357211],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / pyre_t",
      startLine: 10965,
      endLine: 10965,
      sourceNote: 'create_action dispatches "pyre" to pyre_t: built on p->talent.pyre (:7189).',
    },
    {
      simcToken: "quell",
      candidateAbilityGameIds: [351338],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / quell_t",
      startLine: 10967,
      endLine: 10967,
      sourceNote:
        'create_action dispatches "quell" to quell_t: built on p->talent.quell (:7029). _gcd 0, use_off_gcd.',
    },
    {
      simcToken: "tip_the_scales",
      candidateAbilityGameIds: [370553],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / tip_the_scales_t",
      startLine: 10969,
      endLine: 10969,
      sourceNote:
        'create_action dispatches "tip_the_scales" to tip_the_scales_t: built on p->talent.tip_the_scales (:7079). _gcd 0.',
    },
    {
      simcToken: "unbound_flame",
      candidateAbilityGameIds: [1292321],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / unbound_flame_t",
      startLine: 10995,
      endLine: 10995,
      sourceNote:
        'create_action dispatches "unbound_flame" to unbound_flame_t: built on p->talent.unbound_flame_spell (:7383), which is find_spell( 1292321 ) at :10068. create_action builds it from client data 12.1.0, which this data is.',
    },
    {
      simcToken: "verdant_embrace",
      candidateAbilityGameIds: [360995],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: EVOKER_MODULE_PATH,
      symbol: "create_action / verdant_embrace_t",
      startLine: 10971,
      endLine: 10971,
      sourceNote:
        'create_action dispatches "verdant_embrace" to verdant_embrace_t: built on p->talent.verdant_embrace (:4471).',
    },
  ],
  metaActionLanes: [
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
 * The Fire Mage facts (ONB-X1).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the pinned Fire list
 * (apl/mage.cpp `fire`) executes. Facts a reader should not have to rediscover:
 *
 *   - COMBUSTION AND FIRE BLAST ARE `_gcd` 0, SO THEY ARE NON_GCD. Each carries `use_off_gcd=1` and `use_while_casting=1`.
 *   - FIRE BLAST BINDS THE TALENT'S ROW ONLY. Its talent replaces the class spell 319836 (trait_data.inc:1738), which is `_gcd` 1500. The action profile reads that.
 *   - FIREBALL BINDS TWO ROWS. create_action builds frostfire_bolt for the token when the talent is taken (sc_mage.cpp:5673), and both
 *     rows are _gcd 1500, so the lane does not depend on which.
 *   - FLAMESTRIKE BINDS TWO ROWS, the talent's choice of flamestrike_1 and flamestrike_2 (sc_mage.cpp:6075-6076), both _gcd 1500.
 *   - METEOR 117588 AND FIRE BLAST 57984 ARE A SHAMAN'S FIRE ELEMENTAL, another family and no row here.
 *   - THE RACIAL, POTION, ITEM AND EXTERNAL-BUFF TOKENS ARE NOT BOUND. Arcane Intellect and Mirror Image appear only in precombat.
 */
const MAGE_FIRE_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 190319, displayNameEn: "Combustion", baseGcdMs: 0 },
    { abilityGameId: 108853, displayNameEn: "Fire Blast", baseGcdMs: 0 },
    { abilityGameId: 133, displayNameEn: "Fireball", baseGcdMs: 1500 },
    { abilityGameId: 431044, displayNameEn: "Frostfire Bolt", baseGcdMs: 1500 },
    { abilityGameId: 2120, displayNameEn: "Flamestrike", baseGcdMs: 1500 },
    { abilityGameId: 1254851, displayNameEn: "Flamestrike", baseGcdMs: 1500 },
    { abilityGameId: 153561, displayNameEn: "Meteor", baseGcdMs: 1500 },
    { abilityGameId: 11366, displayNameEn: "Pyroblast", baseGcdMs: 1500 },
    { abilityGameId: 2948, displayNameEn: "Scorch", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "combustion",
      candidateAbilityGameIds: [190319],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / combustion_t",
      startLine: 5689,
      endLine: 5689,
      sourceNote:
        'create_action dispatches "combustion" to combustion_t: built on p->talents.combustion (:3500); talents.combustion = find_talent_spell at :6079. _gcd 0, usable_while_casting.',
    },
    {
      simcToken: "fire_blast",
      candidateAbilityGameIds: [108853],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / fire_blast_t",
      startLine: 5713,
      endLine: 5713,
      sourceNote:
        'create_action dispatches "fire_blast" to fire_blast_t: built on p->talents.fire_blast when taken, else the class spell 319836 (:4528); talents.fire_blast = find_talent_spell at :6073. Only the talent\'s row is bound: the class row is _gcd 1500, a lane this binding does not claim.',
    },
    {
      simcToken: "fireball",
      candidateAbilityGameIds: [133, 431044],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / fireball_t",
      startLine: 5690,
      endLine: 5690,
      sourceNote:
        'create_action dispatches "fireball" to fireball_t: built on p->talents.frostfire_bolt when talented, else p->find_specialization_spell( "Fireball" ) (:3721); create_action redirects the token at :5673.',
    },
    {
      simcToken: "flamestrike",
      candidateAbilityGameIds: [2120, 1254851],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / flamestrike_t",
      startLine: 5691,
      endLine: 5691,
      sourceNote:
        'create_action dispatches "flamestrike" to flamestrike_t: built on talents.flamestrike_1 or talents.flamestrike_2 (:3829), a talent\'s choice of two rows on one specialization. Both rows are _gcd 1500.',
    },
    {
      simcToken: "meteor",
      candidateAbilityGameIds: [153561],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / meteor_t",
      startLine: 5692,
      endLine: 5692,
      sourceNote:
        'create_action dispatches "meteor" to meteor_t: built on p->talents.meteor for the token (:4668); talents.meteor = find_talent_spell at :6084.',
    },
    {
      simcToken: "pyroblast",
      candidateAbilityGameIds: [11366],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / pyroblast_t",
      startLine: 5693,
      endLine: 5693,
      sourceNote:
        'create_action dispatches "pyroblast" to pyroblast_t: built on p->talents.pyroblast (:4868); talents.pyroblast = find_talent_spell at :6071.',
    },
    {
      simcToken: "scorch",
      candidateAbilityGameIds: [2948],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: MAGE_MODULE_PATH,
      symbol: "create_action / scorch_t",
      startLine: 5694,
      endLine: 5694,
      sourceNote:
        'create_action dispatches "scorch" to scorch_t: built on p->talents.scorch (:5003); talents.scorch = find_talent_spell at :6086.',
    },
  ],
  metaActionLanes: [
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
 * The Destruction Warlock facts (ONB-D1).
 *
 * `abilities` are the machine-extracted `_gcd` records of every class/spec spell a token of the
 * pinned Destruction list (warlock.cpp `destruction`) executes. Facts a reader should not have to
 * rediscover (all read off the pinned DBC):
 *
 *   - EVERY TOKEN IS 1500, the cast-time ones included: their cast time is separate data, and it
 *     is the specialization's cast-anchor profile that reads it.
 *   - RAIN OF FIRE HAS TWO ROWS. The talent is one of 5740 and 1214467, by find_talent_spell order.
 *   - THE RACIALS, ITEMS AND POTION ARE NOT BOUND.
 */
const WARLOCK_DESTRUCTION_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    { abilityGameId: 6353, displayNameEn: "Soul Fire", baseGcdMs: 1500 },
    { abilityGameId: 17962, displayNameEn: "Conflagrate", baseGcdMs: 1500 },
    { abilityGameId: 116858, displayNameEn: "Chaos Bolt", baseGcdMs: 1500 },
    { abilityGameId: 1122, displayNameEn: "Summon Infernal", baseGcdMs: 1500 },
    { abilityGameId: 442726, displayNameEn: "Malevolence", baseGcdMs: 1500 },
    { abilityGameId: 17877, displayNameEn: "Shadowburn", baseGcdMs: 1500 },
    { abilityGameId: 445468, displayNameEn: "Wither", baseGcdMs: 1500 },
    { abilityGameId: 348, displayNameEn: "Immolate", baseGcdMs: 1500 },
    { abilityGameId: 434635, displayNameEn: "Ruination", baseGcdMs: 1500 },
    { abilityGameId: 152108, displayNameEn: "Cataclysm", baseGcdMs: 1500 },
    { abilityGameId: 434506, displayNameEn: "Infernal Bolt", baseGcdMs: 1500 },
    { abilityGameId: 29722, displayNameEn: "Incinerate", baseGcdMs: 1500 },
    { abilityGameId: 5740, displayNameEn: "Rain of Fire", baseGcdMs: 1500 },
    { abilityGameId: 1214467, displayNameEn: "Rain of Fire", baseGcdMs: 1500 },
    { abilityGameId: 80240, displayNameEn: "Havoc", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "soul_fire",
      candidateAbilityGameIds: [6353],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / soul_fire_t",
      startLine: 5934,
      endLine: 5934,
      sourceNote:
        'create_action dispatches "soul_fire" to soul_fire_t, built on p->talents.soul_fire (:5101); find_talent_spell( SPECIALIZATION, "Soul Fire" ) at sc_warlock_init.cpp:485',
    },
    {
      simcToken: "conflagrate",
      candidateAbilityGameIds: [17962],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / conflagrate_t",
      startLine: 5920,
      endLine: 5920,
      sourceNote:
        'create_action dispatches "conflagrate" to conflagrate_t, built on p->talents.conflagrate (:4440); find_talent_spell( SPECIALIZATION, "Conflagrate" ) at sc_warlock_init.cpp:390',
    },
    {
      simcToken: "chaos_bolt",
      candidateAbilityGameIds: [116858],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / chaos_bolt_t",
      startLine: 5926,
      endLine: 5926,
      sourceNote:
        'create_action dispatches "chaos_bolt" to chaos_bolt_t, built on p->talents.chaos_bolt (:4285); find_talent_spell( SPECIALIZATION, "Chaos Bolt" ) at sc_warlock_init.cpp:388',
    },
    {
      simcToken: "summon_infernal",
      candidateAbilityGameIds: [1122],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / summon_infernal_t",
      startLine: 5932,
      endLine: 5932,
      sourceNote:
        'create_action dispatches "summon_infernal" to summon_infernal_t, built on p->talents.summon_infernal (:5064); find_talent_spell( SPECIALIZATION, "Summon Infernal" ) at sc_warlock_init.cpp:437',
    },
    {
      simcToken: "malevolence",
      candidateAbilityGameIds: [442726],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / malevolence_t",
      startLine: 5962,
      endLine: 5962,
      sourceNote:
        'create_action dispatches "malevolence" to malevolence_t, built on p->hero.malevolence (:1298), whose trigger_gcd and cooldown it reads from hero.malevolence_buff, conditional_spell_lookup( hero.malevolence.ok(), 442726 ) at sc_warlock_init.cpp:635',
    },
    {
      simcToken: "shadowburn",
      candidateAbilityGameIds: [17877],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / shadowburn_t",
      startLine: 5936,
      endLine: 5936,
      sourceNote:
        'create_action dispatches "shadowburn" to shadowburn_t, built on p->talents.shadowburn (:4773); find_talent_spell( SPECIALIZATION, "Shadowburn" ) at sc_warlock_init.cpp:416',
    },
    {
      simcToken: "wither",
      candidateAbilityGameIds: [445468],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / wither_t",
      startLine: 5959,
      endLine: 5959,
      sourceNote:
        'create_action dispatches "wither" to wither_t, built on p->hero.wither.ok() ? p->hero.wither_direct : not_found (:1189); hero.wither_direct = conditional_spell_lookup( hero.wither.ok(), 445468 ) at sc_warlock_init.cpp:605',
    },
    {
      simcToken: "immolate",
      candidateAbilityGameIds: [348],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / immolate_t",
      startLine: 5924,
      endLine: 5924,
      sourceNote:
        'create_action dispatches "immolate" to immolate_t, built on p->warlock_base.immolate->ok() && !p->hero.wither.ok() ? p->warlock_base.immolate_old : not_found (:4071); warlock_base.immolate_old = conditional_spell_lookup( ..., 348 ) at sc_warlock_init.cpp:42',
    },
    {
      simcToken: "ruination",
      candidateAbilityGameIds: [434635],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / ruination_t",
      startLine: 5951,
      endLine: 5951,
      sourceNote:
        'create_action dispatches "ruination" to ruination_t, built on p->hero.ruination_cast (:5309); conditional_spell_lookup( hero.ruination.ok(), 434635 ) at sc_warlock_init.cpp:578',
    },
    {
      simcToken: "cataclysm",
      candidateAbilityGameIds: [152108],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / cataclysm_t",
      startLine: 5938,
      endLine: 5938,
      sourceNote:
        'create_action dispatches "cataclysm" to cataclysm_t, built on p->talents.cataclysm (:4723); find_talent_spell( SPECIALIZATION, "Cataclysm" ) at sc_warlock_init.cpp:426',
    },
    {
      simcToken: "infernal_bolt",
      candidateAbilityGameIds: [434506],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / infernal_bolt_t",
      startLine: 5948,
      endLine: 5948,
      sourceNote:
        'create_action dispatches "infernal_bolt" to infernal_bolt_t, built on p->hero.infernal_bolt (:5202); conditional_spell_lookup( hero.secrets_of_the_coven.ok(), 434506 ) at sc_warlock_init.cpp:561',
    },
    {
      simcToken: "incinerate",
      candidateAbilityGameIds: [29722],
      crossCheck: "CLASS_SPELLS",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / incinerate_t",
      startLine: 5922,
      endLine: 5922,
      sourceNote:
        'create_action dispatches "incinerate" to incinerate_t, built on p->warlock_base.incinerate (:3922); conditional_spell_lookup( ..., 29722 ) at sc_warlock_init.cpp:44',
    },
    {
      simcToken: "rain_of_fire",
      candidateAbilityGameIds: [5740, 1214467],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / rain_of_fire_t",
      startLine: 5928,
      endLine: 5928,
      sourceNote:
        'create_action dispatches "rain_of_fire" to rain_of_fire_t, built on p->talents.rain_of_fire (:4556), find_talent_spell( SPECIALIZATION, 5740 ), falling back to 1214467, at sc_warlock_init.cpp:393-395',
    },
    {
      simcToken: "havoc",
      candidateAbilityGameIds: [80240],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: WARLOCK_DESTRUCTION_MODULE_PATH,
      symbol: "warlock_t::create_action_* / havoc_t",
      startLine: 5930,
      endLine: 5930,
      sourceNote:
        'create_action dispatches "havoc" to havoc_t, built on p->talents.havoc (:4624); find_talent_spell( SPECIALIZATION, "Havoc" ) at sc_warlock_init.cpp:411',
    },
  ],
  metaActionLanes: [
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
 * The Devourer Demon Hunter facts (ONB-B3).
 *
 * `abilities` are the machine-extracted `_gcd` records of every spell a token of the
 * pinned Devourer list (apl_demon_hunter.cpp `devourer`) can execute. Facts a reader
 * should not have to rediscover (all read off the pinned DBC and the retained wire):
 *
 *   - VOID METAMORPHOSIS HAS TWO RECORDS AND ONLY ONE IS THE ACTION. The action is built on
 *     1217605 (`_gcd` 1500). The log never reports it: the wire holds the aura 1217607.
 *   - VOIDBLADE'S 1245414 AND THE HUNT'S 1246169 ARE IMPACTS, `_gcd` 0, logged beside the
 *     press. Both are recorded with no token binding.
 *   - SOUL FRAGMENT 1223412 is logged as a cast, 243 to 385 times a fight, with `_gcd` 0. No
 *     action of the list is built on it. It is recorded with no token binding.
 *   - PICK_UP_FRAGMENT IS NO SPELL. It is built on spell_data_t::nil(), and has no log event.
 */
const DEMONHUNTER_DEVOURER_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    // ---- class/spec actions the pinned Devourer list names ----
    { abilityGameId: 1217605, displayNameEn: "Void Metamorphosis", baseGcdMs: 1500 },
    { abilityGameId: 1246167, displayNameEn: "The Hunt", baseGcdMs: 1500 },
    { abilityGameId: 1259431, displayNameEn: "Predator's Wake", baseGcdMs: 1500 },
    { abilityGameId: 1217610, displayNameEn: "Devour", baseGcdMs: 1500 },
    { abilityGameId: 473662, displayNameEn: "Consume", baseGcdMs: 1500 },
    { abilityGameId: 1245412, displayNameEn: "Voidblade", baseGcdMs: 500 },
    { abilityGameId: 1245483, displayNameEn: "Pierce the Veil", baseGcdMs: 500 },
    { abilityGameId: 1241937, displayNameEn: "Soul Immolation", baseGcdMs: 1500 },
    { abilityGameId: 1225826, displayNameEn: "Eradicate", baseGcdMs: 1500 },
    { abilityGameId: 1245453, displayNameEn: "Cull", baseGcdMs: 1500 },
    { abilityGameId: 1226019, displayNameEn: "Reap", baseGcdMs: 1500 },
    { abilityGameId: 473728, displayNameEn: "Void Ray", baseGcdMs: 1500 },
    { abilityGameId: 1221150, displayNameEn: "Collapsing Star", baseGcdMs: 1500 },
    { abilityGameId: 1239123, displayNameEn: "Hungering Slash", baseGcdMs: 1500 },
    { abilityGameId: 1245470, displayNameEn: "Reaper's Toll", baseGcdMs: 1500 },
    { abilityGameId: 198793, displayNameEn: "Vengeful Retreat", baseGcdMs: 0 },
    // ---- NOT execution candidates: what the log reports beside the press ----
    { abilityGameId: 1245414, displayNameEn: "Voidblade", baseGcdMs: 0 },
    { abilityGameId: 1246169, displayNameEn: "The Hunt", baseGcdMs: 0 },
    { abilityGameId: 1223412, displayNameEn: "Soul Fragment", baseGcdMs: 0 },
    // ---- the one racial token of the list, as a Demon Hunter resolves it ----
    { abilityGameId: 202719, displayNameEn: "Arcane Torrent", baseGcdMs: 1500 },
  ],
  tokenBindings: [
    {
      simcToken: "metamorphosis",
      candidateAbilityGameIds: [1217605],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / metamorphosis_t",
      startLine: 9749,
      endLine: 9750,
      sourceNote:
        'create_action dispatches "metamorphosis" to metamorphosis_t, built on p->spec.metamorphosis (:4902-4903); for Devourer spec.metamorphosis = find_specialization_spell( "Void Metamorphosis" ) at :10811, class_spells.inc row { 12, 1480, 1217605 }. action_ready is false below max stacks (:5057). The log never reports 1217605: the three retained subjects log only the aura 1217607, so this binding names the action, not the wire id.',
    },
    {
      simcToken: "the_hunt",
      candidateAbilityGameIds: [1246167],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / the_hunt_t",
      startLine: 9759,
      endLine: 9760,
      sourceNote:
        'create_action dispatches "the_hunt" to the_hunt_t, built on p->spec.the_hunt (:5612); for Devourer spec.the_hunt = talent.devourer.the_hunt at :11285, find_talent_spell( SPECIALIZATION, "The Hunt" ) at :10973, whose Devourer trait row carries spell 1246167. The log also reports the impact 1246169, which is recorded with no token.',
    },
    {
      simcToken: "predators_wake",
      candidateAbilityGameIds: [1259431],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / predators_wake_t",
      startLine: 9761,
      endLine: 9762,
      sourceNote:
        'create_action dispatches "predators_wake" to predators_wake_t, built on p->hero_spec.predators_wake (:5594); hero_spec.predators_wake = conditional_spell_lookup( Devourer && the_hunt && demonic_intensity, 1259431 ) at :11380-11383.',
    },
    {
      simcToken: "devour",
      candidateAbilityGameIds: [1217610],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / devour_t",
      startLine: 9763,
      endLine: 9764,
      sourceNote:
        'create_action dispatches "devour" to devour_t, built on p->spec.devour (:5792); spec.devour = find_spell( 1217610, DEMON_HUNTER_DEVOURER ) at :10824. action_ready is false outside buff.metamorphosis (:5813-5820).',
    },
    {
      simcToken: "consume",
      candidateAbilityGameIds: [473662],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / consume_t",
      startLine: 9765,
      endLine: 9766,
      sourceNote:
        'create_action dispatches "consume" to consume_t, built on p->spec.consume (:5825); spec.consume = find_spell( 473662, DEMON_HUNTER_DEVOURER ) at :10822, class_spells.inc row { 12, 1480, 473662 }.',
    },
    {
      simcToken: "voidblade",
      candidateAbilityGameIds: [1245412],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / voidblade_t",
      startLine: 9767,
      endLine: 9768,
      sourceNote:
        'create_action dispatches "voidblade" to voidblade_t, built on p->talent.demon_hunter.voidblade (:5913); find_talent_spell( CLASS, "Voidblade" ) at :10870, trait row spell 1245412, _gcd 500. The log also reports 1245414, _gcd 0, after every Voidblade and Pierce the Veil; it is recorded with no token.',
    },
    {
      simcToken: "pierce_the_veil",
      candidateAbilityGameIds: [1245483],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / pierce_the_veil_t",
      startLine: 9769,
      endLine: 9770,
      sourceNote:
        'create_action dispatches "pierce_the_veil" to pierce_the_veil_t, built on p->hero_spec.pierce_the_veil (:5895); spec_talent_spell_lookup( Devourer, talent.scarred.demonsurge, 1245483 ) at :11384, where talent.scarred.demonsurge is the HERO talent "Voidsurge" for a Devourer (:11158).',
    },
    {
      simcToken: "soul_immolation",
      candidateAbilityGameIds: [1241937],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / soul_immolation_heal_t",
      startLine: 9771,
      endLine: 9772,
      sourceNote:
        'create_action dispatches "soul_immolation" to soul_immolation_heal_t, built on p->talent.devourer.soul_immolation (:5951); find_talent_spell( SPECIALIZATION, "Soul Immolation" ) at :10930, trait row spell 1241937.',
    },
    {
      simcToken: "eradicate",
      candidateAbilityGameIds: [1225826],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / eradicate_t",
      startLine: 9773,
      endLine: 9774,
      sourceNote:
        'create_action dispatches "eradicate" to eradicate_t, built on p->spec.eradicate (:6143); spec.eradicate = talent_spell_lookup( talent.devourer.eradicate, 1225826 ) at :11196. The trait row itself carries 1226033, _gcd 0, which is not the action.',
    },
    {
      simcToken: "cull",
      candidateAbilityGameIds: [1245453],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / cull_t",
      startLine: 9775,
      endLine: 9776,
      sourceNote:
        'create_action dispatches "cull" to cull_t, built on p->spec.cull (:6286); spec.cull = find_spell( 1245453, DEMON_HUNTER_DEVOURER ) at :10831. action_ready is false outside buff.metamorphosis (:6290-6298).',
    },
    {
      simcToken: "reap",
      candidateAbilityGameIds: [1226019],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / reap_t",
      startLine: 9777,
      endLine: 9778,
      sourceNote:
        'create_action dispatches "reap" to reap_t, built on p->spec.reap (:6304); spec.reap = find_spell( 1226019, DEMON_HUNTER_DEVOURER ) at :10828, class_spells.inc row { 12, 1480, 1226019 }. action_ready is false inside buff.metamorphosis (:6308-6316).',
    },
    {
      simcToken: "void_ray",
      candidateAbilityGameIds: [473728],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / void_ray_t",
      startLine: 9779,
      endLine: 9780,
      sourceNote:
        'create_action dispatches "void_ray" to void_ray_t, built on p->talent.devourer.void_ray (:6373); find_talent_spell( SPECIALIZATION, "Void Ray" ) at :10928, trait row spell 473728. It is channeled. The wire reports its cast with no begincast, and every tick of the 26 casts of a whole-fight subject follows that cast, so the cast is the start of the channel.',
    },
    {
      simcToken: "collapsing_star",
      candidateAbilityGameIds: [1221150],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / collapsing_star_t",
      startLine: 9781,
      endLine: 9782,
      sourceNote:
        'create_action dispatches "collapsing_star" to collapsing_star_t, built on p->spec.collapsing_star_spell (:6548); conditional_spell_lookup( talent.devourer.collapsing_star || talent.devourer.midnight3, 1221150 ) at :11208-11209. Not observed on a retained subject.',
    },
    {
      simcToken: "hungering_slash",
      candidateAbilityGameIds: [1239123],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / hungering_slash_t",
      startLine: 9783,
      endLine: 9784,
      sourceNote:
        'create_action dispatches "hungering_slash" to hungering_slash_t, built on p->spec.hungering_slash (:6808); spec.hungering_slash = talent_spell_lookup( talent.devourer.hungering_slash, 1239123 ) at :11216. The trait row itself carries 1239519, _gcd 0, which is not the action.',
    },
    {
      simcToken: "reapers_toll",
      candidateAbilityGameIds: [1245470],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DEMON_HUNTER,
      symbol: "demon_hunter_t::create_action / reapers_toll_t",
      startLine: 9785,
      endLine: 9786,
      sourceNote:
        'create_action dispatches "reapers_toll" to reapers_toll_t, built on p->hero_spec.reapers_toll (:6783); spec_talent_spell_lookup( Devourer, talent.scarred.demonsurge, 1245470 ) at :11385, where talent.scarred.demonsurge is the HERO talent "Voidsurge" for a Devourer (:11158).',
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
        'create_action dispatches "vengeful_retreat" to vengeful_retreat_t, built on p->talent.demon_hunter.vengeful_retreat at sc_demon_hunter.cpp:8588-8589; talent.demon_hunter.vengeful_retreat = find_talent_spell( CLASS, "Vengeful Retreat" ) at :10868, trait row spell 198793. The DBC record carries _gcd 0.',
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

/**
 * The Feral Druid facts (ONB-C1).
 *
 * `abilities` are the machine-extracted `_gcd` records of every spell a token of the
 * pinned Feral list (`apl/druid/feral_apl.inc`) can execute. Facts a reader should not
 * have to rediscover (all read off the pinned DBC and the retained wire):
 *
 *   - BERSERK IS ONE TOKEN WITH TWO ACTIONS. `berserk` builds Incarnation when it is
 *     taken, so both records are candidates and the talent decides which.
 *   - TALENT ROWS ARE NOT ALWAYS THE ACTION. Lunar Inspiration's row is 155580 and the
 *     action is 155625; Berserk's is 343223 and the action 106951; Swipe's is 213764 and
 *     the cat action 106785.
 *   - PROWL, TIGER'S FURY AND BERSERK ARE `_gcd` 0: off-GCD steps of a scan.
 */
const DRUID_FERAL_SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  classSpells: "engine/dbc/generated/class_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  // HASHED, NEVER PARSED — the class module every token binding is a hand-reviewed reading of.
  classModule: "engine/class_modules/sc_druid.cpp",
  // HASHED, NEVER PARSED. The racial rows are class-mask readings of this table.
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  playerModule: "engine/player/player.cpp",
  consumableModule: "engine/player/consumable.cpp",
};

const DRUID = "engine/class_modules/sc_druid.cpp";

const DRUID_FERAL_FACTS = {
  clientDataWowVersion: "12.1.0.69587",
  clientDataHotfixBuild: 69587,
  sanityAnchors: REQUIRED_FACTS.sanityAnchors,
  abilities: [
    // ---- class/spec actions the pinned Feral list names ----
    { abilityGameId: 5215, displayNameEn: "Prowl", baseGcdMs: 0 },
    { abilityGameId: 768, displayNameEn: "Cat Form", baseGcdMs: 1500 },
    { abilityGameId: 5217, displayNameEn: "Tiger's Fury", baseGcdMs: 0 },
    { abilityGameId: 1822, displayNameEn: "Rake", baseGcdMs: 1000 },
    { abilityGameId: 1244258, displayNameEn: "Chomp", baseGcdMs: 1000 },
    { abilityGameId: 22568, displayNameEn: "Ferocious Bite", baseGcdMs: 1000 },
    { abilityGameId: 8936, displayNameEn: "Regrowth", baseGcdMs: 1500 },
    { abilityGameId: 5221, displayNameEn: "Shred", baseGcdMs: 1000 },
    { abilityGameId: 155625, displayNameEn: "Moonfire", baseGcdMs: 1000 },
    { abilityGameId: 106785, displayNameEn: "Swipe", baseGcdMs: 1000 },
    { abilityGameId: 285381, displayNameEn: "Primal Wrath", baseGcdMs: 1000 },
    { abilityGameId: 1079, displayNameEn: "Rip", baseGcdMs: 1000 },
    { abilityGameId: 106951, displayNameEn: "Berserk", baseGcdMs: 0 },
    { abilityGameId: 102543, displayNameEn: "Incarnation: Avatar of Ashamane", baseGcdMs: 0 },
    { abilityGameId: 274837, displayNameEn: "Feral Frenzy", baseGcdMs: 1000 },
    { abilityGameId: 1243807, displayNameEn: "Frantic Frenzy", baseGcdMs: 1000 },
    { abilityGameId: 391528, displayNameEn: "Convoke the Spirits", baseGcdMs: 1500 },
    // ---- the two racial tokens of the list, as a Druid resolves them ----
    { abilityGameId: 58984, displayNameEn: "Shadowmeld", baseGcdMs: 0 },
    { abilityGameId: 26297, displayNameEn: "Berserking", baseGcdMs: 0 },
  ],
  tokenBindings: [
    {
      simcToken: "prowl",
      candidateAbilityGameIds: [5215],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / prowl_t",
      startLine: 10255,
      endLine: 10255,
      sourceNote:
        'prowl_t is built on p->find_class_spell( "Prowl" ) at :7956, class_spells.inc row { 11, 0, 5215 }. use_off_gcd is set at :7958. Its ready() is false while buff.prowl is up, and while in combat without buff.incarnation_cat_prowl (:7990-7996).',
    },
    {
      simcToken: "cat_form",
      candidateAbilityGameIds: [768],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / cat_form_t",
      startLine: 10149,
      endLine: 10149,
      sourceNote:
        'create_action dispatches "cat_form" to cat_form_t, built on p->spec.cat_form (:3675); spec.cat_form = find_class_spell( "Cat Form" ) at :10674, class_spells.inc row { 11, 0, 768 }.',
    },
    {
      simcToken: "tigers_fury",
      candidateAbilityGameIds: [5217],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / tigers_fury_t",
      startLine: 10197,
      endLine: 10197,
      sourceNote:
        'create_action dispatches "tigers_fury" to tigers_fury_t, built on p->talent.tigers_fury (:4857); find_talent_spell( SPECIALIZATION, "Tiger\'s Fury" ) at :10475, trait row spell 5217, _gcd 0.',
    },
    {
      simcToken: "rake",
      candidateAbilityGameIds: [1822],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / rake_t",
      startLine: 10232,
      endLine: 10232,
      sourceNote:
        'create_action dispatches "rake" to rake_t, built on p->talent.rake (:4551); find_talent_spell( CLASS, "Rake" ) at :10358, trait row spell 1822. The log also reports the debuff 155722, which is not the action.',
    },
    {
      simcToken: "chomp",
      candidateAbilityGameIds: [1244258],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / chomp_t",
      startLine: 10191,
      endLine: 10191,
      sourceNote:
        'create_action dispatches "chomp" to chomp_t, built on p->talent.chomp (:4050); find_talent_spell( SPECIALIZATION, "Chomp" ) at :10445, trait row spell 1244258. Its ready() also needs buff.chomp_enabler (:4054). Not observed on a retained subject.',
    },
    {
      simcToken: "ferocious_bite",
      candidateAbilityGameIds: [22568],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / ferocious_bite_t",
      startLine: 10251,
      endLine: 10251,
      sourceNote:
        'create_action dispatches "ferocious_bite" to ferocious_bite_t, built on p->find_class_spell( "Ferocious Bite" ) at :4427, class_spells.inc row { 11, 0, 22568 }. Its max_energy option is read in ready() (:4267-4273).',
    },
    {
      simcToken: "regrowth",
      candidateAbilityGameIds: [8936],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / regrowth_t",
      startLine: 10256,
      endLine: 10256,
      sourceNote:
        'create_action dispatches "regrowth" to regrowth_t, built on p->find_class_spell( "Regrowth" ) at :6310, class_spells.inc row { 11, 0, 8936 }. The retained subjects log a begincast for every hardcast.',
    },
    {
      simcToken: "shred",
      candidateAbilityGameIds: [5221],
      crossCheck: "CLASS_SPELLS",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / shred_t",
      startLine: 10257,
      endLine: 10257,
      sourceNote:
        'create_action dispatches "shred" to shred_t, built on p->find_class_spell( "Shred" ) at :4792, class_spells.inc row { 11, 0, 5221 }.',
    },
    {
      simcToken: "moonfire_cat",
      candidateAbilityGameIds: [155625],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / lunar_inspiration_t",
      startLine: 10194,
      endLine: 10195,
      sourceNote:
        'create_action dispatches "moonfire_cat" to lunar_inspiration_t, built on p->talent.lunar_inspiration.ok() ? p->find_spell( 155625 ) : spell_data_t::not_found() at :4461-4462. The talent row carries 155580, _gcd 0, which is not the action.',
    },
    {
      simcToken: "swipe_cat",
      candidateAbilityGameIds: [106785],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / swipe_cat_t",
      startLine: 10244,
      endLine: 10244,
      sourceNote:
        'create_action dispatches "swipe_cat" to swipe_cat_t, built on p->apply_override( p->talent.swipe, p->spec.cat_form_override ) at :4839, with spec.cat_form_override = find_spell( 48629 ) at :10675. The retained subjects log the cat override 106785; the talent row itself carries 213764.',
    },
    {
      simcToken: "primal_wrath",
      candidateAbilityGameIds: [285381],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / primal_wrath_t",
      startLine: 10196,
      endLine: 10196,
      sourceNote:
        'create_action dispatches "primal_wrath" to primal_wrath_t, built on p->talent.primal_wrath (:4743); find_talent_spell( SPECIALIZATION, "Primal Wrath" ) at :10464, trait row spell 285381.',
    },
    {
      simcToken: "rip",
      candidateAbilityGameIds: [1079],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / rip_t",
      startLine: 10235,
      endLine: 10235,
      sourceNote:
        'create_action dispatches "rip" to rip_t, built on p->talent.rip (:4656); find_talent_spell( CLASS, "Rip" ) at :10361, trait row spell 1079.',
    },
    {
      simcToken: "berserk",
      candidateAbilityGameIds: [106951, 102543],
      crossCheck: "NONE_FIND_SPELL_LITERAL",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / incarnation_cat_t or berserk_cat_t",
      startLine: 10162,
      endLine: 10172,
      sourceNote:
        'create_action dispatches "berserk" to incarnation_cat_t when talent.incarnation_cat is taken (:10162-10163), built on the talent, spell 102543 (:3946). Otherwise to berserk_cat_t (:10168-10172), built on spec.berserk_cat = talent.berserk_cat.find_override_spell() (:3937-3938, :10703). The retained subject without Incarnation logs 106951; the talent row carries 343223, _gcd 0, which is not the action.',
    },
    {
      simcToken: "feral_frenzy",
      candidateAbilityGameIds: [274837],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / feral_frenzy_t",
      startLine: 10192,
      endLine: 10192,
      sourceNote:
        'create_action dispatches "feral_frenzy" to feral_frenzy_t, built on p->talent.feral_frenzy (:4134); find_talent_spell( SPECIALIZATION, "Feral Frenzy" ) at :10450, trait row spell 274837. The log also reports the debuff 274838, which is not the action.',
    },
    {
      simcToken: "frantic_frenzy",
      candidateAbilityGameIds: [1243807],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / frantic_frenzy_t",
      startLine: 10193,
      endLine: 10193,
      sourceNote:
        'create_action dispatches "frantic_frenzy" to frantic_frenzy_t, built on p->talent.frantic_frenzy (:4084); find_talent_spell( SPECIALIZATION, "Frantic Frenzy" ) at :10452, trait row spell 1243807. Not observed on a retained subject.',
    },
    {
      simcToken: "convoke_the_spirits",
      candidateAbilityGameIds: [391528],
      crossCheck: "NONE_TALENT_BOUND",
      sourcePath: DRUID,
      symbol: "druid_t::create_action / convoke_the_spirits_t",
      startLine: 10219,
      endLine: 10219,
      sourceNote:
        'create_action dispatches "convoke_the_spirits" to convoke_the_spirits_t, built on p->talent.convoke_the_spirits (:9256); find_talent_spell( SPECIALIZATION, "Convoke the Spirits" ) at :10383, whose Feral trait row carries spell 391528.',
    },
    {
      simcToken: "shadowmeld",
      candidateAbilityGameIds: [58984],
      crossCheck: "NONE_RACE_BOUND",
      sourcePath: "engine/player/player.cpp",
      symbol: "player_t::create_action / shadowmeld_t",
      startLine: 11074,
      endLine: 11075,
      sourceNote:
        'player_t::create_action dispatches "shadowmeld" to shadowmeld_t. racial_spells.inc row { 0x0000000000000008 (Night Elf), 0x00003fff (every class), 58984 } is the one row a Druid resolves. OUTSIDE the rotational decision domain (racial action).',
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
        'player_t::create_action dispatches "berserking" to berserking_t. racial_spells.inc row { 0x0000000000000080 (Troll), 0x00003fff (every class), 26297 } is the one row a Druid resolves. OUTSIDE the rotational decision domain (racial action).',
    },
  ],
  metaActionLanes: [
    {
      simcToken: "auto_attack",
      triggerGcdMs: 0,
      sourcePath: DRUID,
      symbol: "auto_attack_t::auto_attack_t",
      line: 9887,
      sourceNote:
        'auto_attack_t is built on melee_attack_t( "auto_attack", p, spell_data_t::nil() ) (sc_druid.cpp:9885) and its constructor assigns trigger_gcd = 0_ms at :9887.',
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
  "demonhunter-devourer": {
    datasetId: "SIMC_DBC_DEMONHUNTER_DEVOURER_GCD_SEMANTICS",
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
    requiredFacts: DEMONHUNTER_DEVOURER_FACTS,
    defaultOut: "src/data/game/demonhunter-devourer-gcd-semantics.json",
  },
  "druid-feral": {
    datasetId: "SIMC_DBC_DRUID_FERAL_GCD_SEMANTICS",
    classId: 11,
    className: "Druid",
    sources: DRUID_FERAL_SOURCES,
    classModulePath: DRUID_FERAL_SOURCES.classModule,
    handReviewedPaths: [
      DRUID_FERAL_SOURCES.classModule,
      DRUID_FERAL_SOURCES.racialSpells,
      DRUID_FERAL_SOURCES.playerModule,
      DRUID_FERAL_SOURCES.consumableModule,
    ],
    requiredFacts: DRUID_FERAL_FACTS,
    defaultOut: "src/data/game/druid-feral-gcd-semantics.json",
  },
  "monk-windwalker": {
    datasetId: "SIMC_DBC_MONK_WINDWALKER_GCD_SEMANTICS",
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
    requiredFacts: MONK_WINDWALKER_FACTS,
    defaultOut: "src/data/game/monk-windwalker-gcd-semantics.json",
  },
  "deathknight-unholy": {
    datasetId: "SIMC_DBC_DEATHKNIGHT_UNHOLY_GCD_SEMANTICS",
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
    requiredFacts: DEATHKNIGHT_UNHOLY_FACTS,
    defaultOut: "src/data/game/deathknight-unholy-gcd-semantics.json",
  },
  "deathknight-frost": {
    datasetId: "SIMC_DBC_DEATHKNIGHT_FROST_GCD_SEMANTICS",
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
    requiredFacts: DEATHKNIGHT_FROST_FACTS,
    defaultOut: "src/data/game/deathknight-frost-gcd-semantics.json",
  },
  "shaman-enhancement": {
    datasetId: "SIMC_DBC_SHAMAN_ENHANCEMENT_GCD_SEMANTICS",
    classId: 7,
    className: "Shaman",
    sources: SHAMAN_SOURCES,
    classModulePath: SHAMAN_SOURCES.classModule,
    handReviewedPaths: [
      SHAMAN_SOURCES.classModule,
      SHAMAN_SOURCES.racialSpells,
      SHAMAN_SOURCES.playerModule,
      SHAMAN_SOURCES.consumableModule,
    ],
    requiredFacts: SHAMAN_ENHANCEMENT_FACTS,
    defaultOut: "src/data/game/shaman-enhancement-gcd-semantics.json",
  },
  "warrior-arms": {
    datasetId: "SIMC_DBC_WARRIOR_ARMS_GCD_SEMANTICS",
    classId: 1,
    className: "Warrior",
    sources: WARRIOR_SOURCES,
    classModulePath: WARRIOR_SOURCES.classModule,
    handReviewedPaths: [
      WARRIOR_SOURCES.classModule,
      WARRIOR_SOURCES.racialSpells,
      WARRIOR_SOURCES.playerModule,
      WARRIOR_SOURCES.consumableModule,
    ],
    requiredFacts: WARRIOR_ARMS_FACTS,
    defaultOut: "src/data/game/warrior-arms-gcd-semantics.json",
  },
  "warrior-fury": {
    datasetId: "SIMC_DBC_WARRIOR_FURY_GCD_SEMANTICS",
    classId: 1,
    className: "Warrior",
    sources: WARRIOR_SOURCES,
    classModulePath: WARRIOR_SOURCES.classModule,
    handReviewedPaths: [
      WARRIOR_SOURCES.classModule,
      WARRIOR_SOURCES.racialSpells,
      WARRIOR_SOURCES.playerModule,
      WARRIOR_SOURCES.consumableModule,
    ],
    requiredFacts: WARRIOR_FURY_FACTS,
    defaultOut: "src/data/game/warrior-fury-gcd-semantics.json",
  },
  "warrior-protection": {
    datasetId: "SIMC_DBC_WARRIOR_PROTECTION_GCD_SEMANTICS",
    classId: 1,
    className: "Warrior",
    sources: WARRIOR_SOURCES,
    classModulePath: WARRIOR_SOURCES.classModule,
    handReviewedPaths: [
      WARRIOR_SOURCES.classModule,
      WARRIOR_SOURCES.racialSpells,
      WARRIOR_SOURCES.playerModule,
      WARRIOR_SOURCES.consumableModule,
    ],
    requiredFacts: WARRIOR_PROTECTION_FACTS,
    defaultOut: "src/data/game/warrior-protection-gcd-semantics.json",
  },
  "rogue-outlaw": {
    datasetId: "SIMC_DBC_ROGUE_OUTLAW_GCD_SEMANTICS",
    classId: 4,
    className: "Rogue",
    sources: ROGUE_OUTLAW_SOURCES,
    classModulePath: ROGUE_OUTLAW_SOURCES.classModule,
    handReviewedPaths: [
      ROGUE_OUTLAW_SOURCES.classModule,
      ROGUE_OUTLAW_SOURCES.racialSpells,
      ROGUE_OUTLAW_SOURCES.playerModule,
      ROGUE_OUTLAW_SOURCES.consumableModule,
    ],
    requiredFacts: ROGUE_OUTLAW_FACTS,
    defaultOut: "src/data/game/rogue-outlaw-gcd-semantics.json",
  },
  "shaman-elemental": {
    datasetId: "SIMC_DBC_SHAMAN_ELEMENTAL_GCD_SEMANTICS",
    classId: 7,
    className: "Shaman",
    sources: SHAMAN_ELEMENTAL_SOURCES,
    classModulePath: SHAMAN_ELEMENTAL_SOURCES.classModule,
    handReviewedPaths: [
      SHAMAN_ELEMENTAL_SOURCES.classModule,
      SHAMAN_ELEMENTAL_SOURCES.racialSpells,
      SHAMAN_ELEMENTAL_SOURCES.playerModule,
      SHAMAN_ELEMENTAL_SOURCES.consumableModule,
    ],
    requiredFacts: SHAMAN_ELEMENTAL_FACTS,
    defaultOut: "src/data/game/shaman-elemental-gcd-semantics.json",
  },
  "druid-balance": {
    datasetId: "SIMC_DBC_DRUID_BALANCE_GCD_SEMANTICS",
    classId: 11,
    className: "Druid",
    sources: DRUID_BALANCE_SOURCES,
    classModulePath: DRUID_BALANCE_SOURCES.classModule,
    handReviewedPaths: [
      DRUID_BALANCE_SOURCES.classModule,
      DRUID_BALANCE_SOURCES.racialSpells,
      DRUID_BALANCE_SOURCES.playerModule,
      DRUID_BALANCE_SOURCES.consumableModule,
    ],
    requiredFacts: DRUID_BALANCE_FACTS,
    defaultOut: "src/data/game/druid-balance-gcd-semantics.json",
  },
  "priest-shadow": {
    datasetId: "SIMC_DBC_PRIEST_SHADOW_GCD_SEMANTICS",
    classId: 5,
    className: "Priest",
    sources: PRIEST_SHADOW_SOURCES,
    classModulePath: PRIEST_SHADOW_SOURCES.classModule,
    handReviewedPaths: [
      PRIEST_SHADOW_SOURCES.classModule,
      PRIEST_SHADOW_SOURCES.shadowModule,
      PRIEST_SHADOW_SOURCES.racialSpells,
      PRIEST_SHADOW_SOURCES.playerModule,
      PRIEST_SHADOW_SOURCES.consumableModule,
    ],
    requiredFacts: PRIEST_SHADOW_FACTS,
    defaultOut: "src/data/game/priest-shadow-gcd-semantics.json",
  },
  "mage-arcane": {
    datasetId: "SIMC_DBC_MAGE_ARCANE_GCD_SEMANTICS",
    classId: 8,
    className: "Mage",
    sources: MAGE_SOURCES,
    classModulePath: MAGE_SOURCES.classModule,
    handReviewedPaths: [
      MAGE_SOURCES.classModule,
      MAGE_SOURCES.racialSpells,
      MAGE_SOURCES.playerModule,
      MAGE_SOURCES.consumableModule,
    ],
    requiredFacts: MAGE_ARCANE_FACTS,
    defaultOut: "src/data/game/mage-arcane-gcd-semantics.json",
  },
  "mage-frost": {
    datasetId: "SIMC_DBC_MAGE_FROST_GCD_SEMANTICS",
    classId: 8,
    className: "Mage",
    sources: MAGE_SOURCES,
    classModulePath: MAGE_SOURCES.classModule,
    handReviewedPaths: [
      MAGE_SOURCES.classModule,
      MAGE_SOURCES.racialSpells,
      MAGE_SOURCES.playerModule,
      MAGE_SOURCES.consumableModule,
    ],
    requiredFacts: MAGE_FROST_FACTS,
    defaultOut: "src/data/game/mage-frost-gcd-semantics.json",
  },
  "warlock-affliction": {
    datasetId: "SIMC_DBC_WARLOCK_AFFLICTION_GCD_SEMANTICS",
    classId: 9,
    className: "Warlock",
    sources: WARLOCK_DESTRUCTION_SOURCES,
    classModulePath: WARLOCK_DESTRUCTION_SOURCES.classModule,
    handReviewedPaths: [
      WARLOCK_DESTRUCTION_SOURCES.classModule,
      WARLOCK_DESTRUCTION_SOURCES.initModule,
      WARLOCK_DESTRUCTION_SOURCES.racialSpells,
      WARLOCK_DESTRUCTION_SOURCES.playerModule,
      WARLOCK_DESTRUCTION_SOURCES.consumableModule,
    ],
    requiredFacts: WARLOCK_AFFLICTION_FACTS,
    defaultOut: "src/data/game/warlock-affliction-gcd-semantics.json",
  },
  "warlock-demonology": {
    datasetId: "SIMC_DBC_WARLOCK_DEMONOLOGY_GCD_SEMANTICS",
    classId: 9,
    className: "Warlock",
    sources: WARLOCK_DESTRUCTION_SOURCES,
    classModulePath: WARLOCK_DESTRUCTION_SOURCES.classModule,
    handReviewedPaths: [
      WARLOCK_DESTRUCTION_SOURCES.classModule,
      WARLOCK_DESTRUCTION_SOURCES.initModule,
      WARLOCK_DESTRUCTION_SOURCES.racialSpells,
      WARLOCK_DESTRUCTION_SOURCES.playerModule,
      WARLOCK_DESTRUCTION_SOURCES.consumableModule,
    ],
    requiredFacts: WARLOCK_DEMONOLOGY_FACTS,
    defaultOut: "src/data/game/warlock-demonology-gcd-semantics.json",
  },
  "hunter-marksmanship": {
    datasetId: "SIMC_DBC_HUNTER_MARKSMANSHIP_GCD_SEMANTICS",
    classId: 3,
    className: "Hunter",
    sources: HUNTER_SOURCES,
    classModulePath: HUNTER_SOURCES.classModule,
    handReviewedPaths: [
      HUNTER_SOURCES.classModule,
      HUNTER_SOURCES.racialSpells,
      HUNTER_SOURCES.playerModule,
      HUNTER_SOURCES.consumableModule,
    ],
    requiredFacts: HUNTER_MARKSMANSHIP_FACTS,
    defaultOut: "src/data/game/hunter-marksmanship-gcd-semantics.json",
  },
  "demonhunter-vengeance": {
    datasetId: "SIMC_DBC_DEMONHUNTER_VENGEANCE_GCD_SEMANTICS",
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
    requiredFacts: DEMONHUNTER_VENGEANCE_FACTS,
    defaultOut: "src/data/game/demonhunter-vengeance-gcd-semantics.json",
  },
  "evoker-devastation": {
    datasetId: "SIMC_DBC_EVOKER_DEVASTATION_GCD_SEMANTICS",
    classId: 13,
    className: "Evoker",
    sources: EVOKER_SOURCES,
    classModulePath: EVOKER_SOURCES.classModule,
    handReviewedPaths: [
      EVOKER_SOURCES.classModule,
      EVOKER_SOURCES.racialSpells,
      EVOKER_SOURCES.playerModule,
      EVOKER_SOURCES.consumableModule,
    ],
    requiredFacts: EVOKER_DEVASTATION_FACTS,
    defaultOut: "src/data/game/evoker-devastation-gcd-semantics.json",
  },
  "mage-fire": {
    datasetId: "SIMC_DBC_MAGE_FIRE_GCD_SEMANTICS",
    classId: 8,
    className: "Mage",
    sources: MAGE_SOURCES,
    classModulePath: MAGE_SOURCES.classModule,
    handReviewedPaths: [
      MAGE_SOURCES.classModule,
      MAGE_SOURCES.racialSpells,
      MAGE_SOURCES.playerModule,
      MAGE_SOURCES.consumableModule,
    ],
    requiredFacts: MAGE_FIRE_FACTS,
    defaultOut: "src/data/game/mage-fire-gcd-semantics.json",
  },
  "warlock-destruction": {
    datasetId: "SIMC_DBC_WARLOCK_DESTRUCTION_GCD_SEMANTICS",
    classId: 9,
    className: "Warlock",
    sources: WARLOCK_DESTRUCTION_SOURCES,
    classModulePath: WARLOCK_DESTRUCTION_SOURCES.classModule,
    handReviewedPaths: [
      WARLOCK_DESTRUCTION_SOURCES.classModule,
      WARLOCK_DESTRUCTION_SOURCES.initModule,
      WARLOCK_DESTRUCTION_SOURCES.racialSpells,
      WARLOCK_DESTRUCTION_SOURCES.playerModule,
      WARLOCK_DESTRUCTION_SOURCES.consumableModule,
    ],
    requiredFacts: WARLOCK_DESTRUCTION_FACTS,
    defaultOut: "src/data/game/warlock-destruction-gcd-semantics.json",
  },
  "rogue-subtlety": {
    datasetId: "SIMC_DBC_ROGUE_SUBTLETY_GCD_SEMANTICS",
    classId: 4,
    className: "Rogue",
    sources: ROGUE_SUBTLETY_SOURCES,
    classModulePath: ROGUE_SUBTLETY_SOURCES.classModule,
    handReviewedPaths: [
      ROGUE_SUBTLETY_SOURCES.classModule,
      ROGUE_SUBTLETY_SOURCES.racialSpells,
      ROGUE_SUBTLETY_SOURCES.playerModule,
      ROGUE_SUBTLETY_SOURCES.consumableModule,
    ],
    requiredFacts: ROGUE_SUBTLETY_FACTS,
    defaultOut: "src/data/game/rogue-subtlety-gcd-semantics.json",
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

  // The sanity anchors prove the column; they are not part of the runtime slice, unless
  // the target itself names one as an ability (Backstab, for Subtlety).
  const namedByTarget = new Set(REQUIRED_FACTS.abilities.map((entry) => entry.abilityGameId));
  const anchorIds = new Set(
    REQUIRED_FACTS.sanityAnchors
      .map((entry) => entry.abilityGameId)
      .filter((abilityGameId) => !namedByTarget.has(abilityGameId)),
  );
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
