#!/usr/bin/env node
/**
 * Deterministic SimulationCraft APL extractor.
 *
 * Reads ONE pinned commit of one class module's APL source and emits one
 * specialization's authority artifact. Run manually; never at runtime. The
 * analyzer has no network dependency on GitHub or the SimulationCraft site — it
 * imports the committed JSON this produces.
 *
 * TARGETS. Each extractable specialization is a TARGET profile below: which
 * source file, which region markers, which function header, which authority
 * id, and which facts the pinned source must exhibit. `--target` selects one;
 * the default is `rogue-assassination`, so every invocation recorded before
 * M10-B regenerates the Assassination artifact byte for byte. M10-B added
 * `paladin-protection` (`engine/class_modules/apl/apl_paladin.cpp`, the
 * `//protection_apl_start` region). A target is a set of coordinates and
 * required facts, never a different parser.
 *
 * FAIL CLOSED IS THE WHOLE POINT. This is not a general C++ parser, and it does
 * not try to be. It understands exactly five constructs inside the bounded
 * region: the list declaration, `add_action`, braces, comments, and (M11-B2)
 * a CLIENT-VERSION GUARD — `if ( p->sim->dbc->wowv() <op> wowv_t( a, b, c ) )`
 * or its `else if` — over a `{ ... }` block or the single statement that
 * follows. Anything else inside that region is a hard failure with a line
 * number, because an extractor that silently skipped a line it did not
 * understand would emit an artifact that LOOKS complete while missing an action
 * — and the reachability proof built on it would be worthless.
 *
 * VERSION GUARDS (M11-B2). SimulationCraft keeps both sides of a patch
 * transition in one region and picks at runtime by the client build the DBC
 * was generated from. A target that names a `clientVersion` has every guard
 * EVALUATED against it: the statements under a guard that holds are emitted at
 * their ordinal positions, the statements under one that does not are parsed
 * (they must still be well-formed `add_action` lines) and DROPPED, and every
 * guard — its line, its comparison, whether it held, how many statements it
 * governed — is recorded in the artifact's provenance so a reader can see that
 * a dead branch was excluded rather than never present. A target without
 * `clientVersion` fails on the first guard, exactly as before: no target
 * silently acquires branch selection. One level only; a nested guard fails.
 *
 * REGION SELECTION (M11-C1). A target locates its region in ONE of two ways:
 *
 *   MARKER LINES   `regionStart` / `regionEnd` — the literal comment lines
 *                  (`//blood_apl_start` .. `//blood_apl_end`) every target
 *                  used before M11-C1. Unchanged, still the default, and
 *                  recorded exactly as before: `provenance.regionStartMarker`
 *                  / `provenance.regionEndMarker` are those marker lines.
 *   NAMESPACE_FUNCTION
 *                  `enclosingNamespace` + `functionHeader` — source-coordinate
 *                  selection for a pinned file that carries no markers
 *                  (`apl_monk.cpp`). The line `namespace <name>` must occur
 *                  exactly once; its brace-balanced body is scanned (comments,
 *                  string and character literals do not count as braces) for
 *                  exactly one line equal to the function header at namespace
 *                  depth, and that function's own brace-balanced body is the
 *                  region. A same-named function in another namespace is
 *                  outside the span and cannot be selected. Recorded as
 *                  `provenance.regionSelector` (M11-C1a) — kind, namespace,
 *                  header and player identifier — and WITHOUT either marker
 *                  field: a namespace boundary is not a marker.
 *
 *   INCLUDED_FILE  `includedBy` (ONB-C1): the list is a whole pinned file with no
 *                  markers, `#include`d as the sole body of `functionHeader` in
 *                  another pinned file (`apl/druid/druid.cpp`). The including file
 *                  is hash-checked, and the include must be the function's only
 *                  statement. Recorded as `provenance.regionSelector`.
 *
 * `playerIdentifier` names the parameter the list declarations and version
 * guards are called on (`p->get_action_priority_list`, or
 * `player->get_action_priority_list`); it defaults to `p`, must be the
 * function header's own parameter name, and changes nothing else about what
 * the region parser accepts. None of this reads gameplay: it decides WHICH
 * lines are parsed, never what a parsed line means.
 *
 * The artifact stores `actionStringVerbatim`: the exact first string argument
 * given to `add_action`. It deliberately does NOT store a synthesized
 * `actions+=/...` line, because the source does not contain one, and it does NOT
 * store derived fields (actionToken, conditionRaw, callsListName) — those are
 * derived at load time from the verbatim string, so there is exactly one source
 * of truth and "reproducible from the verbatim string" is true by construction.
 *
 *   node scripts/authority/extract-simc-apl.mjs \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --out src/simc/data/rogue-assassination.apl.json
 *
 *   node scripts/authority/extract-simc-apl.mjs --target paladin-protection \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --out src/simc/data/paladin-protection.apl.json
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;

/**
 * The one SimulationCraft commit every PINNED target is recorded against
 * (M11-D2-C). Every byte count and SHA-256 below was read from the file at
 * this commit, each file first matched against the commit's own git blob id.
 */
export const PINNED_SIMC_COMMIT = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";

/**
 * Every pinned source file a PINNED target reads (M11-D2-C): the APL module,
 * the class module that dispatches to it, and the files an inert-statement
 * proof rests on. Path, exact byte length and SHA-256 at `PINNED_SIMC_COMMIT`.
 */
const PINNED_SOURCES = Object.freeze({
  APL_WARRIOR: {
    sourcePath: "engine/class_modules/apl/apl_warrior.cpp",
    commitSha: PINNED_SIMC_COMMIT,
    sha256: "bc9473e51e3d4d233793d6d165eb0165183f61eebde5c119ddd8aaa7b1202ec1",
    byteLength: 30516,
  },
  APL_DEATH_KNIGHT: {
    sourcePath: "engine/class_modules/apl/apl_death_knight.cpp",
    commitSha: PINNED_SIMC_COMMIT,
    sha256: "e381da691875ceecb8357a76e90fef9e01f3a200c67da7024deff1ca7f728df6",
    byteLength: 36557,
  },
  APL_DEMON_HUNTER: {
    sourcePath: "engine/class_modules/apl/apl_demon_hunter.cpp",
    commitSha: PINNED_SIMC_COMMIT,
    sha256: "c95ab0af6cfce46c64304903a7e8c65417beb01ff69f661beb727b9e23b4b389",
    byteLength: 56505,
  },
  APL_ROGUE: {
    sourcePath: "engine/class_modules/apl/apl_rogue.cpp",
    commitSha: PINNED_SIMC_COMMIT,
    sha256: "a74e4daa8376197d94f8449555035b3fd67634db450d2f7cb16bf84233939eb3",
    byteLength: 26074,
  },
  APL_WARLOCK: {
    sourcePath: "engine/class_modules/apl/warlock.cpp",
    commitSha: PINNED_SIMC_COMMIT,
    sha256: "09f2bb54304a3886a87aae18931bf2214f56882a88c074c7e77f730ed3e51bda",
    byteLength: 33759,
  },
  APL_SHAMAN: {
    sourcePath: "engine/class_modules/apl/apl_shaman.cpp",
    commitSha: PINNED_SIMC_COMMIT,
    sha256: "71f38c728fdba909d3a807139c538aedad7a63bec56a15ad64647b5a29630f65",
    byteLength: 25414,
  },
  APL_PRIEST: {
    sourcePath: "engine/class_modules/apl/apl_priest.cpp",
    commitSha: PINNED_SIMC_COMMIT,
    sha256: "eff8fcc1db8f4ff8a992a48f7c66fc1595cd7b6ca7b0136b12020e9fd0540516",
    byteLength: 38115,
  },
  APL_DRUID_BALANCE: {
    sourcePath: "engine/class_modules/apl/druid/balance_apl.inc",
    commitSha: PINNED_SIMC_COMMIT,
    sha256: "9b481c5f42e9671941adfabd44f6a02a3912b42dc5c2d191cc4629873aa54525",
    byteLength: 12928,
  },
  APL_MAGE: {
    sourcePath: "engine/class_modules/apl/mage.cpp",
    commitSha: PINNED_SIMC_COMMIT,
    sha256: "b0310f97988f53af34507015d8adda68606c2401466f534430c876676b72c578",
    byteLength: 40053,
  },
  APL_EVOKER: {
    sourcePath: "engine/class_modules/apl/apl_evoker.cpp",
    commitSha: PINNED_SIMC_COMMIT,
    sha256: "84086fb5b6c3e40e28859c2e4ca3ee13e70b8bee0ca64cab69fedd7819b93c4b",
    byteLength: 42774,
  },
  APL_HUNTER: {
    sourcePath: "engine/class_modules/apl/apl_hunter.cpp",
    commitSha: PINNED_SIMC_COMMIT,
    sha256: "8d7b7273ac056d1b28154cd9342db48cd95c643c215e5731c6b770c2e49facbb",
    byteLength: 51094,
  },
  WARRIOR_DISPATCH: {
    sourcePath: "engine/class_modules/sc_warrior.cpp",
    sha256: "ba492ee43e62e01d6921cb40b5269d692d8edb64bebc26de9f722ee76a632d8e",
    byteLength: 350723,
  },
  DEATH_KNIGHT_DISPATCH: {
    sourcePath: "engine/class_modules/sc_death_knight.cpp",
    sha256: "beed4d7cffad6a548dc1791eef6f4208c308d53836b46d644e4e9c9c95058d39",
    byteLength: 636861,
  },
  APL_DRUID_FERAL: {
    sourcePath: "engine/class_modules/apl/druid/feral_apl.inc",
    commitSha: PINNED_SIMC_COMMIT,
    sha256: "d4a1274f99c10bdde08d5a36832b2b20b898a09b35d2d10258aca3fa7b6fcbfb",
    byteLength: 17108,
  },
  APL_DRUID_INCLUDER: {
    sourcePath: "engine/class_modules/apl/druid/druid.cpp",
    sha256: "dea8183f92e3a0da438e763355de6a41509d53930360287a05797994940ef28c",
    byteLength: 926,
  },
  DRUID_DISPATCH: {
    sourcePath: "engine/class_modules/sc_druid.cpp",
    sha256: "59227a2f687a9fe5229964f797fa2623040e3915dd6daec18b434ca4730a8fb0",
    byteLength: 479886,
  },
  DEMON_HUNTER_DISPATCH: {
    sourcePath: "engine/class_modules/sc_demon_hunter.cpp",
    sha256: "62a1b4ace1d7e658ad293023fbb67c2b669a3c52415ee2d5a1c08d5b63c867b0",
    byteLength: 459885,
  },
  ROGUE_DISPATCH: {
    sourcePath: "engine/class_modules/sc_rogue.cpp",
    sha256: "209e95265aae4168cf7cda57d1b241dda6361971ba6849a9262bd933bff3e13e",
    byteLength: 436673,
  },
  WARLOCK_DISPATCH: {
    sourcePath: "engine/class_modules/warlock/sc_warlock_init.cpp",
    sha256: "8e1eae332a7be9607a4bde41640411183ecef8e00fddd1ab611c9d5fe8241d4c",
    byteLength: 95724,
  },
  PRIEST_DISPATCH: {
    sourcePath: "engine/class_modules/priest/sc_priest.cpp",
    sha256: "520c2ad3599926a3f8c4a0620c78edd61c006685ae8dd855ccae1b80e00db76d",
    byteLength: 148517,
  },
  MAGE_DISPATCH: {
    sourcePath: "engine/class_modules/sc_mage.cpp",
    sha256: "8bd38fb5393485b86e4e146cdbbe68ad38d5f9e0d48ef76fb9d8c16e4ee110bb",
    byteLength: 262461,
  },
  EVOKER_DISPATCH: {
    sourcePath: "engine/class_modules/sc_evoker.cpp",
    sha256: "91f34b4bcc311efc6c9a8d199dd766af9957a8b3ffd58e8703c3df32885a9976",
    byteLength: 378295,
  },
  HUNTER_DISPATCH: {
    sourcePath: "engine/class_modules/sc_hunter.cpp",
    sha256: "d576fa2205fd79d279fda803edb201eb9b375106a6eba05afd483818a19537d9",
    byteLength: 309166,
  },
  SHAMAN_MODULE: {
    sourcePath: "engine/class_modules/sc_shaman.cpp",
    commitSha: PINNED_SIMC_COMMIT,
    sha256: "0ca278a862eb9ceb8aba2255bceb534955a9e5ed83c9b81ec35b2a0f86763bd0",
    byteLength: 450570,
  },
  SHAMAN_DISPATCH: {
    sourcePath: "engine/class_modules/sc_shaman.cpp",
    sha256: "0ca278a862eb9ceb8aba2255bceb534955a9e5ed83c9b81ec35b2a0f86763bd0",
    byteLength: 450570,
  },
  ACTION_PRIORITY_LIST_CPP: {
    sourcePath: "engine/player/action_priority_list.cpp",
    sha256: "2e6774efb1cf8926b0e28806164d52cd64b2a2d30cbff48277272579632ff495",
    byteLength: 4969,
  },
  CONST_DATA_CPP: {
    sourcePath: "engine/dbc/sc_const_data.cpp",
    sha256: "cf54989f52842087b67add28d9cd7ef4b721a746cf95dc597ca6a07a4a2cb2bd",
    byteLength: 58452,
  },
  CLASS_SPELLS_INC: {
    sourcePath: "engine/dbc/generated/class_spells.inc",
    sha256: "85ad0bcec9885423576d8945c74f1de212fe039bfee54bc725d1024509ae389b",
    byteLength: 36917,
  },
  SPECIALIZATION_SPELLS_INC: {
    sourcePath: "engine/dbc/generated/specialization_spells.inc",
    sha256: "514d7a509a3b95f130aadccb6a6f1a28c6f5f2568f211cd5139bb567b712e4fc",
    byteLength: 45852,
  },
  PLAYER_CPP: {
    sourcePath: "engine/player/player.cpp",
    sha256: "50a804d0f63d7bffd7b9eeb89a6de054b1767c3202133c765b1b893987940a5c",
    byteLength: 546677,
  },
  PLAYER_HPP: {
    sourcePath: "engine/player/player.hpp",
    sha256: "7c28e2264813fea679d53b030ac6ca68ca209df3d64d67ce5b9839b437732d68",
    byteLength: 69912,
  },
  PARSE_EFFECTS_HPP: {
    sourcePath: "engine/action/parse_effects.hpp",
    sha256: "22ca12c1a54c5bef93293687bffe160669fbea461756aeaedb3de6a2d4a01d2a",
    byteLength: 42977,
  },
  PARSE_EFFECTS_CPP: {
    sourcePath: "engine/action/parse_effects.cpp",
    sha256: "48203b6bf57f0d593d6c72dc836bef7e446715e0a09764923bad20dcae233c58",
    byteLength: 62848,
  },
});

/**
 * ONE statement the Arms and Fury regions carry that the region parser does
 * not model, proven inert per target (M11-D2-C). Not a rule about unused
 * locals: the record names the exact statement text, and every claim it rests
 * on is checked against hash-pinned bytes on every run.
 *
 *   1. In the target's region the statement occurs exactly once and its
 *      identifier occurs on no other line (checked by `extract`, per region).
 *   2. Its initializer is `player_t::get_racial_actions()`, declared virtual in
 *      player.hpp, and the body at the pin builds and returns a local vector of
 *      eight literals and nothing else (the body's SHA-256 is pinned).
 *   3. Nothing between warrior_t and player_t overrides it: warrior_t derives
 *      from parse_player_effects_t, which derives from player_t and
 *      parse_effects_t, and none of sc_warrior.cpp, parse_effects.hpp or
 *      parse_effects.cpp names `get_racial_actions`.
 *
 * So the statement constructs a value nobody reads, with no side effect, and
 * dropping it cannot change one `add_action` the extractor emits. Each target
 * carries its own copy so its own region is checked on its own.
 */
function racialActionsInert(regionName) {
  return Object.freeze({
    statement: "std::vector<std::string> racial_actions = p->get_racial_actions();",
    identifier: "racial_actions",
    reason: `the ${regionName} region declares racial_actions and never reads it; its initializer is the side-effect-free base player_t::get_racial_actions(), which no class between warrior_t and player_t overrides`,
    proofs: [
      {
        ...PINNED_SOURCES.PLAYER_CPP,
        checks: [
          {
            kind: "FUNCTION_BODY_SHA256",
            functionHeader: "std::vector<std::string> player_t::get_racial_actions()",
            bodySha256: "857fc6f4fab83d398ac0981582d6d14007665aeadd9bc713498990d96d7c2ce9",
          },
        ],
      },
      {
        ...PINNED_SOURCES.PLAYER_HPP,
        checks: [
          { kind: "LINE_EXACTLY_ONCE", line: "virtual std::vector<std::string> get_racial_actions();" },
        ],
      },
      {
        ...PINNED_SOURCES.WARRIOR_DISPATCH,
        checks: [
          { kind: "LINE_EXACTLY_ONCE", line: "struct warrior_t : public parse_player_effects_t" },
          { kind: "TOKEN_ABSENT", token: "get_racial_actions" },
        ],
      },
      {
        ...PINNED_SOURCES.PARSE_EFFECTS_HPP,
        checks: [
          {
            kind: "LINE_EXACTLY_ONCE",
            line: "struct parse_player_effects_t : public player_t, public parse_effects_t",
          },
          { kind: "TOKEN_ABSENT", token: "get_racial_actions" },
        ],
      },
      {
        ...PINNED_SOURCES.PARSE_EFFECTS_CPP,
        checks: [{ kind: "TOKEN_ABSENT", token: "get_racial_actions" }],
      },
    ],
  });
}

/**
 * What `add_action( this, "<Name>", "<options>", ... )` means at the pin (ONB-B2): the
 * lines that make it conditional on the player's own spell data. Pinned files, so "the form
 * emits nothing without a row" is checked rather than remembered:
 *
 *   action_priority_list.cpp  the name is looked up with find_class_spell, then with
 *                             find_specialization_spell; a spell that is not ok() returns
 *                             nullptr and emits nothing; otherwise the token is the
 *                             tokenized spell name and the options follow a comma.
 *   sc_const_data.cpp         those lookups read the class and specialization tables and
 *                             nothing else (dbc_t::class_ability_id and
 *                             dbc_t::specialization_ability_id).
 */
const SPELL_GATED_FORM_PROOFS = Object.freeze([
  {
    ...PINNED_SOURCES.ACTION_PRIORITY_LIST_CPP,
    checks: [
      { kind: "LINE_EXACTLY_ONCE", line: "const spell_data_t* s = p->find_class_spell( name );" },
      { kind: "LINE_EXACTLY_ONCE", line: "s = p->find_specialization_spell( name );" },
      {
        kind: "LINE_EXACTLY_ONCE",
        line: "return add_action( p, s, util::tokenize_fn( s->name_cstr() ), action_options, comment );",
      },
      {
        kind: "LINE_EXACTLY_ONCE",
        line: 'return add_action( fmt::format( "{},{}", action_name, action_options ), comment );',
      },
    ],
  },
  {
    ...PINNED_SOURCES.CONST_DATA_CPP,
    checks: [
      {
        kind: "LINE_EXACTLY_ONCE",
        line: "active_spell = &active_class_spell_t::find( spell_name, spec_id, ptr, name_tokenized );",
      },
      {
        kind: "LINE_EXACTLY_ONCE",
        line: "unsigned dbc_t::specialization_ability_id( specialization_e  spec_id,",
      },
    ],
  },
]);

/**
 * Facts this extractor REQUIRES the pinned source to exhibit, per target.
 *
 * Checked against the extracted artifact, not against a prompt. If the pinned
 * commit stops satisfying one of these, extraction fails loudly rather than
 * producing an artifact whose downstream verdicts would rest on a stale belief.
 *
 * Assassination's facts are about its list call graph. Protection's are
 * deliberately structural only — two lists, no list dispatch, the spender and
 * the self-heal each present exactly once in `default` — because M10-B pins
 * the artifact without evaluating it; the facts a Protection evaluator will
 * rest on are M10-C's to state.
 */
export const TARGETS = {
  "rogue-assassination": {
    sourcePath: "engine/class_modules/apl/apl_rogue.cpp",
    regionStart: "//assassination_apl_start",
    regionEnd: "//assassination_apl_end",
    functionHeader: "void assassination( player_t* p )",
    regionName: "assassination",
    authorityId: "SIMC_APL_ROGUE_ASSASSINATION",
    spec: { className: "rogue", specName: "assassination" },
    defaultOut: "src/simc/data/rogue-assassination.apl.json",
    requiredFacts: {
      kind: "ASSASSINATION_CALL_GRAPH",
      entryListName: "default",
      requiredLists: [
        "default",
        "precombat",
        "cds",
        "core_dot",
        "generate",
        "spend",
        "items",
        "misc_cds",
        "vanish",
      ],
      spendCallCondition:
        "!buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0",
      generateCallCondition:
        "!buff.darkest_night.up&combo_points<5|buff.darkest_night.up&combo_points.deficit>0",
      envenomOnlyInList: "spend",
      crimsonTempestInList: "generate",
      defaultOrder: ["cds", "core_dot", "generate", "spend"],
    },
  },
  "paladin-protection": {
    sourcePath: "engine/class_modules/apl/apl_paladin.cpp",
    regionStart: "//protection_apl_start",
    regionEnd: "//protection_apl_end",
    functionHeader: "void protection( player_t* p )",
    regionName: "protection",
    authorityId: "SIMC_APL_PALADIN_PROTECTION",
    spec: { className: "paladin", specName: "protection" },
    defaultOut: "src/simc/data/paladin-protection.apl.json",
    requiredFacts: {
      kind: "PROTECTION_STRUCTURE",
      entryListName: "default",
      requiredLists: ["default", "precombat"],
      noListDispatch: true,
      exactlyOnceInDefault: ["shield_of_the_righteous", "word_of_glory"],
    },
  },
  "paladin-retribution": {
    sourcePath: "engine/class_modules/apl/apl_paladin.cpp",
    regionStart: "//retribution_apl_start",
    regionEnd: "//retribution_apl_end",
    functionHeader: "void retribution( player_t* p )",
    regionName: "retribution",
    authorityId: "SIMC_APL_PALADIN_RETRIBUTION",
    spec: { className: "paladin", specName: "retribution" },
    defaultOut: "src/simc/data/paladin-retribution.apl.json",
    // The facts the M11-A4 spender slice rests on (agent/m11-a4-first-spec-contract.md
    // section 2): every one is structural and read off the pinned text.
    requiredFacts: {
      kind: "RETRIBUTION_CALL_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "cooldowns", "generators", "finishers"],
      defaultOrder: ["cooldowns", "generators"],
      // `finishers` is reachable from `generators` exactly twice: a gated call
      // the shared evaluator cannot decide, and an UNCONDITIONAL call further
      // down, which is the definitive entry to the spender decision.
      finishersCalls: [
        {
          list: "generators",
          ordinal: 0,
          condition: "holy_power=5&cooldown.wake_of_ashes.remains|buff.hammer_of_light_free.remains<gcd*2",
        },
        { list: "generators", ordinal: 5, condition: null },
      ],
      // The two spenders: one entry each, both in `finishers`, in this order.
      finishersSpenders: [
        { token: "divine_storm", condition: "variable.ds_castable" },
        { token: "templars_verdict", condition: null },
      ],
      dsCastableValue:
        "(active_enemies>=2|buff.divine_arbiter_verdict.up)&!buff.empyrean_legacy.up&!buff.divine_arbiter_divine_storm.up",
      // `pre_es_wake` is reset in precombat and never assigned in combat.
      resetOnlyVariables: ["pre_es_wake"],
    },
  },
  "deathknight-blood": {
    sourcePath: "engine/class_modules/apl/apl_death_knight.cpp",
    regionStart: "//blood_apl_start",
    regionEnd: "//blood_apl_end",
    functionHeader: "void blood( player_t* p )",
    regionName: "blood",
    authorityId: "SIMC_APL_DEATHKNIGHT_BLOOD",
    spec: { className: "deathknight", specName: "blood" },
    defaultOut: "src/simc/data/deathknight-blood.apl.json",
    // The pinned region carries both sides of the 12.1.0 transition behind
    // `p->sim->dbc->wowv()` guards; the roster pins the DBC at 12.1.0.69587,
    // so the `>= 12.1.0` side is the authority and the `< 12.1.0` side is dead.
    clientVersion: [12, 1, 0],
    // M11-B2: a GENERIC pinned dispatch graph. The verifier below reads no
    // Blood semantics; this data is the whole claim. Every dispatch entry in
    // the artifact must be listed here with its kind, source, ordinal, target
    // and verbatim gate — call and run are distinct kinds — and every list's
    // entry count is pinned, so a moved, added, removed or re-gated dispatch
    // line, or any change to a list's length, fails extraction.
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "high_prio_actions", "deathbringer", "san_gift", "sanlayn"],
      listSizes: {
        default: 17,
        precombat: 2,
        high_prio_actions: 2,
        deathbringer: 12,
        san_gift: 8,
        sanlayn: 15,
      },
      edges: [
        { from: "default", ordinal: 13, kind: "CALL", to: "high_prio_actions", condition: null },
        {
          from: "default",
          ordinal: 14,
          kind: "RUN",
          to: "deathbringer",
          condition: "hero_tree.deathbringer",
        },
        {
          from: "default",
          ordinal: 15,
          kind: "RUN",
          to: "san_gift",
          condition: "hero_tree.sanlayn&buff.gift_of_the_sanlayn.up",
        },
        { from: "default", ordinal: 16, kind: "RUN", to: "sanlayn", condition: "hero_tree.sanlayn" },
      ],
      forbiddenTokens: ["swap_action_list"],
      noTargetingOptions: true,
    },
  },
  "monk-brewmaster": {
    sourcePath: "engine/class_modules/apl/apl_monk.cpp",
    // M11-C1. The pinned file carries NO `//<spec>_apl_start` markers, and
    // `void default_apl( monk_t* player )` is defined twice (once per
    // namespace), so the region is the one function of that name inside
    // `namespace brewmaster`. `monk_t::init_action_list` calls
    // `brewmaster::default_apl( this )` unconditionally for MONK_BREWMASTER
    // (apl_monk.cpp:542-556); unlike Windwalker there is no live/ptr split.
    enclosingNamespace: "brewmaster",
    functionHeader: "void default_apl( monk_t* player )",
    playerIdentifier: "player",
    regionName: "brewmaster",
    authorityId: "SIMC_APL_MONK_BREWMASTER",
    spec: { className: "monk", specName: "brewmaster" },
    defaultOut: "src/simc/data/monk-brewmaster.apl.json",
    // The M11-C0 dispatch graph, verbatim. The region has no client-version
    // guard, so no `clientVersion` is declared and a guard would fail.
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: [
        "default",
        "precombat",
        "item_actions",
        "race_actions",
        "master_of_harmony",
        "shado_pan",
      ],
      listSizes: {
        precombat: 2,
        default: 6,
        item_actions: 1,
        race_actions: 7,
        master_of_harmony: 23,
        shado_pan: 23,
      },
      edges: [
        { from: "default", ordinal: 2, kind: "CALL", to: "race_actions", condition: null },
        { from: "default", ordinal: 3, kind: "CALL", to: "item_actions", condition: null },
        {
          from: "default",
          ordinal: 4,
          kind: "RUN",
          to: "master_of_harmony",
          condition: "hero_tree.master_of_harmony",
        },
        { from: "default", ordinal: 5, kind: "RUN", to: "shado_pan", condition: "hero_tree.shadopan" },
      ],
      forbiddenTokens: ["swap_action_list"],
      noTargetingOptions: true,
    },
  },
  // ---- M11-D2-C: PINNED targets ------------------------------------------
  //
  // Extraction coordinates only; no analyzer reads them. Each carries the
  // pinned bytes of its module and of its region, its live/PTR policy, the
  // class-module dispatch that calls its function, and its pinned topology,
  // all measured from the files at PINNED_SIMC_COMMIT. They are preflighted
  // and extracted only through the batch path (--targets/--source-root).
  "warrior-arms": {
    sourcePath: PINNED_SOURCES.APL_WARRIOR.sourcePath,
    regionStart: "//arms_apl_start",
    regionEnd: "//arms_apl_end",
    functionHeader: "void arms( player_t* p )",
    regionName: "arms",
    authorityId: "SIMC_APL_WARRIOR_ARMS",
    spec: { className: "warrior", specName: "arms" },
    defaultOut: "src/simc/data/warrior-arms.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_WARRIOR,
      regionSha256: "ff4607b25ff123b06b23af460b7be7e7da93e7a9cb9164c157e188fe2a4508c6",
    },
    livePtrPolicy: {
      kind: "NO_PTR_REGION",
      ptrRegionStart: "//arms_ptr_apl_start",
      ptrRegionEnd: "//arms_ptr_apl_end",
      ptrFunctionHeader: "void arms_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.WARRIOR_DISPATCH,
      functionHeader: "void warrior_t::init_action_list()",
      sequence: ["case WARRIOR_ARMS:", "warrior_apl::arms( this );", "break;"],
    },
    inertStatements: [racialActionsInert("arms")],
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: [
        "default",
        "precombat",
        "colossus_aoe",
        "colossus_execute",
        "colossus_st",
        "slayer_aoe",
        "slayer_execute",
        "slayer_st",
        "trinkets",
        "variables",
      ],
      listSizes: {
        default: 20,
        precombat: 14,
        colossus_aoe: 18,
        colossus_execute: 12,
        colossus_st: 21,
        slayer_aoe: 20,
        slayer_execute: 16,
        slayer_st: 19,
        trinkets: 5,
        variables: 3,
      },
      edges: [
        { from: "default", ordinal: 4, kind: "CALL", to: "variables", condition: null },
        { from: "default", ordinal: 5, kind: "CALL", to: "trinkets", condition: null },
        {
          from: "default",
          ordinal: 14,
          kind: "RUN",
          to: "colossus_aoe",
          condition: "talent.demolish&active_enemies>2",
        },
        {
          from: "default",
          ordinal: 15,
          kind: "RUN",
          to: "colossus_execute",
          condition: "talent.demolish&variable.execute_phase",
        },
        { from: "default", ordinal: 16, kind: "RUN", to: "colossus_st", condition: "talent.demolish" },
        {
          from: "default",
          ordinal: 17,
          kind: "RUN",
          to: "slayer_aoe",
          condition: "talent.slayers_dominance&active_enemies>2",
        },
        {
          from: "default",
          ordinal: 18,
          kind: "RUN",
          to: "slayer_execute",
          condition: "talent.slayers_dominance&variable.execute_phase",
        },
        { from: "default", ordinal: 19, kind: "RUN", to: "slayer_st", condition: "talent.slayers_dominance" },
      ],
      forbiddenTokens: ["swap_action_list"],
    },
  },
  "warrior-fury": {
    sourcePath: PINNED_SOURCES.APL_WARRIOR.sourcePath,
    regionStart: "//fury_apl_start",
    regionEnd: "//fury_apl_end",
    functionHeader: "void fury( player_t* p )",
    regionName: "fury",
    authorityId: "SIMC_APL_WARRIOR_FURY",
    spec: { className: "warrior", specName: "fury" },
    defaultOut: "src/simc/data/warrior-fury.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_WARRIOR,
      regionSha256: "d924df0f14ad4b838ea104903c62ff5b91b480efce506d1bc27772df49340b63",
    },
    livePtrPolicy: {
      kind: "NO_PTR_REGION",
      ptrRegionStart: "//fury_ptr_apl_start",
      ptrRegionEnd: "//fury_ptr_apl_end",
      ptrFunctionHeader: "void fury_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.WARRIOR_DISPATCH,
      functionHeader: "void warrior_t::init_action_list()",
      sequence: ["case WARRIOR_FURY:", "warrior_apl::fury( this );", "break;"],
    },
    inertStatements: [racialActionsInert("fury")],
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: [
        "default",
        "precombat",
        "slayer",
        "slayer_aoe",
        "thane",
        "thane_aoe",
        "trinkets",
        "variables",
      ],
      listSizes: {
        default: 18,
        precombat: 16,
        slayer: 22,
        slayer_aoe: 14,
        thane: 20,
        thane_aoe: 22,
        trinkets: 5,
        variables: 4,
      },
      edges: [
        { from: "default", ordinal: 5, kind: "CALL", to: "trinkets", condition: null },
        { from: "default", ordinal: 6, kind: "CALL", to: "variables", condition: null },
        {
          from: "default",
          ordinal: 14,
          kind: "RUN",
          to: "slayer",
          condition: "talent.slayers_dominance&active_enemies=1",
        },
        {
          from: "default",
          ordinal: 15,
          kind: "RUN",
          to: "slayer_aoe",
          condition: "talent.slayers_dominance&active_enemies>1",
        },
        {
          from: "default",
          ordinal: 16,
          kind: "RUN",
          to: "thane",
          condition: "talent.lightning_strikes&active_enemies=1",
        },
        {
          from: "default",
          ordinal: 17,
          kind: "RUN",
          to: "thane_aoe",
          condition: "talent.lightning_strikes&active_enemies>1",
        },
      ],
      forbiddenTokens: ["swap_action_list"],
      noTargetingOptions: true,
    },
  },
  "warrior-protection": {
    sourcePath: PINNED_SOURCES.APL_WARRIOR.sourcePath,
    regionStart: "//protection_apl_start",
    regionEnd: "//protection_apl_end",
    functionHeader: "void protection( player_t* p )",
    regionName: "protection",
    authorityId: "SIMC_APL_WARRIOR_PROTECTION",
    spec: { className: "warrior", specName: "protection" },
    defaultOut: "src/simc/data/warrior-protection.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_WARRIOR,
      regionSha256: "d545e36d629c3dd693cbfa2a901ff6d4ee73d70f89af2ec432815fbf6f2af7cb",
    },
    livePtrPolicy: {
      kind: "NO_PTR_REGION",
      ptrRegionStart: "//protection_ptr_apl_start",
      ptrRegionEnd: "//protection_ptr_apl_end",
      ptrFunctionHeader: "void protection_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.WARRIOR_DISPATCH,
      functionHeader: "void warrior_t::init_action_list()",
      sequence: ["case WARRIOR_PROTECTION:", "warrior_apl::protection( this );", "break;"],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: [
        "default",
        "precombat",
        "colossus_aoe",
        "colossus_st",
        "thane_aoe",
        "thane_st",
        "variables",
      ],
      listSizes: {
        default: 29,
        precombat: 3,
        colossus_aoe: 9,
        colossus_st: 12,
        thane_aoe: 7,
        thane_st: 10,
        variables: 1,
      },
      edges: [
        { from: "default", ordinal: 1, kind: "CALL", to: "variables", condition: null },
        {
          from: "default",
          ordinal: 25,
          kind: "RUN",
          to: "colossus_aoe",
          condition: "hero_tree.colossus&spell_targets.thunder_clap>=3",
        },
        {
          from: "default",
          ordinal: 26,
          kind: "RUN",
          to: "thane_aoe",
          condition: "hero_tree.mountain_thane&spell_targets.thunder_clap>=3",
        },
        { from: "default", ordinal: 27, kind: "RUN", to: "colossus_st", condition: "talent.demolish" },
        { from: "default", ordinal: 28, kind: "RUN", to: "thane_st", condition: "talent.lightning_strikes" },
      ],
      forbiddenTokens: ["swap_action_list"],
      noTargetingOptions: true,
    },
  },
  "deathknight-frost": {
    sourcePath: PINNED_SOURCES.APL_DEATH_KNIGHT.sourcePath,
    regionStart: "//frost_apl_start",
    regionEnd: "//frost_apl_end",
    functionHeader: "void frost( player_t* p )",
    regionName: "frost",
    authorityId: "SIMC_APL_DEATHKNIGHT_FROST",
    spec: { className: "deathknight", specName: "frost" },
    defaultOut: "src/simc/data/deathknight-frost.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_DEATH_KNIGHT,
      regionSha256: "3a7f6677af62e244e952279a1418a3d3c469be93807815959d0437438dce5a87",
    },
    livePtrPolicy: {
      kind: "NO_PTR_REGION",
      ptrRegionStart: "//frost_ptr_apl_start",
      ptrRegionEnd: "//frost_ptr_apl_end",
      ptrFunctionHeader: "void frost_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.DEATH_KNIGHT_DISPATCH,
      functionHeader: "void death_knight_t::init_action_list()",
      sequence: ["case DEATH_KNIGHT_FROST:", "death_knight_apl::frost( this );", "break;"],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: [
        "default",
        "precombat",
        "aoe",
        "cooldowns",
        "high_prio_actions",
        "racials",
        "single_target",
        "trinkets",
        "variables",
      ],
      listSizes: {
        default: 8,
        precombat: 11,
        aoe: 14,
        cooldowns: 15,
        high_prio_actions: 3,
        racials: 8,
        single_target: 9,
        trinkets: 8,
        variables: 9,
      },
      edges: [
        { from: "default", ordinal: 1, kind: "CALL", to: "variables", condition: null },
        { from: "default", ordinal: 2, kind: "CALL", to: "trinkets", condition: null },
        { from: "default", ordinal: 3, kind: "CALL", to: "high_prio_actions", condition: null },
        { from: "default", ordinal: 4, kind: "CALL", to: "cooldowns", condition: null },
        { from: "default", ordinal: 5, kind: "CALL", to: "racials", condition: null },
        { from: "default", ordinal: 6, kind: "RUN", to: "aoe", condition: "active_enemies>=2" },
        { from: "default", ordinal: 7, kind: "RUN", to: "single_target", condition: null },
      ],
      forbiddenTokens: ["swap_action_list"],
    },
  },
  // ONB-B2: the one target whose list is a CLASS METHOD, not a marked APL region. The
  // method opens on a guard that returns before any list exists, and two of its lines are
  // the spell-gated add_action form, each decided here against the pinned class and
  // specialization tables. Wind Shear is talent-only at the pin, so its line emits nothing.
  "shaman-enhancement": {
    sourcePath: PINNED_SOURCES.SHAMAN_MODULE.sourcePath,
    enclosingClass: "shaman_t",
    functionHeader: "void shaman_t::init_action_list_enhancement()",
    regionName: "enhancement",
    authorityId: "SIMC_APL_SHAMAN_ENHANCEMENT",
    spec: { className: "shaman", specName: "enhancement" },
    defaultOut: "src/simc/data/shaman-enhancement.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.SHAMAN_MODULE,
      regionSha256: "352db0baac97b2733ba57d3945c83e9ef3c079749cf9c7da2eea93883c6bb4d8",
    },
    livePtrPolicy: {
      kind: "NO_PTR_REGION",
      ptrRegionStart: "//init_action_list_enhancement_ptr_apl_start",
      ptrRegionEnd: "//init_action_list_enhancement_ptr_apl_end",
      ptrFunctionHeader: "void shaman_t::init_action_list_enhancement_ptr()",
    },
    dispatch: {
      ...PINNED_SOURCES.SHAMAN_DISPATCH,
      functionHeader: "void shaman_t::init_action_list()",
      sequence: ["case SHAMAN_ENHANCEMENT:", "init_action_list_enhancement();", "break;"],
    },
    methodPrologue: {
      lines: [
        "if ( main_hand_weapon.type == WEAPON_NONE )",
        "{",
        "if ( !quiet )",
        'sim->errorf( "Player %s has no weapon equipped at the Main-Hand slot.", name() );',
        "quiet = true;",
        "return;",
        "}",
      ],
      appliesWhen: "main_hand_weapon.type != WEAPON_NONE",
    },
    spellGatedActions: [
      {
        statement: 'def->add_action( this, "Bloodlust", "line_cd=600" );',
        spellName: "Bloodlust",
        emitted: "bloodlust,line_cd=600",
        proofs: [
          ...SPELL_GATED_FORM_PROOFS,
          {
            ...PINNED_SOURCES.CLASS_SPELLS_INC,
            checks: [
              {
                kind: "LINE_EXACTLY_ONCE",
                line: '{  7,    0,    2825,       0, "Bloodlust"                          },',
              },
            ],
          },
        ],
      },
      {
        statement: 'def->add_action( this, "Wind Shear", "", "Interrupt of casts." );',
        spellName: "Wind Shear",
        emitted: null,
        proofs: [
          ...SPELL_GATED_FORM_PROOFS,
          { ...PINNED_SOURCES.CLASS_SPELLS_INC, checks: [{ kind: "TOKEN_ABSENT", token: "Wind Shear" }] },
          {
            ...PINNED_SOURCES.SPECIALIZATION_SPELLS_INC,
            checks: [{ kind: "TOKEN_ABSENT", token: "Wind Shear" }],
          },
        ],
      },
    ],
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "single_sb", "single_totemic", "aoe", "cooldowns"],
      listSizes: {
        default: 9,
        precombat: 9,
        single_sb: 27,
        single_totemic: 23,
        aoe: 34,
        cooldowns: 11,
      },
      edges: [
        {
          from: "default",
          ordinal: 6,
          kind: "CALL",
          to: "single_sb",
          condition: "active_enemies=1&!talent.surging_totem.enabled",
        },
        {
          from: "default",
          ordinal: 7,
          kind: "CALL",
          to: "single_totemic",
          condition: "active_enemies=1&talent.surging_totem.enabled",
        },
        { from: "default", ordinal: 8, kind: "CALL", to: "aoe", condition: "active_enemies>1" },
        { from: "single_sb", ordinal: 5, kind: "CALL", to: "cooldowns", condition: null },
        { from: "single_totemic", ordinal: 3, kind: "CALL", to: "cooldowns", condition: null },
        { from: "aoe", ordinal: 4, kind: "CALL", to: "cooldowns", condition: null },
      ],
      forbiddenTokens: ["swap_action_list"],
    },
  },
  "demonhunter-havoc": {
    sourcePath: PINNED_SOURCES.APL_DEMON_HUNTER.sourcePath,
    regionStart: "//havoc_apl_start",
    regionEnd: "//havoc_apl_end",
    functionHeader: "void havoc( player_t* p )",
    regionName: "havoc",
    authorityId: "SIMC_APL_DEMONHUNTER_HAVOC",
    spec: { className: "demonhunter", specName: "havoc" },
    defaultOut: "src/simc/data/demonhunter-havoc.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_DEMON_HUNTER,
      regionSha256: "ee8c3c24abed354f3dcad01daa794aa5f17ae2e12c7a8990e8067186b064fb56",
    },
    livePtrPolicy: {
      kind: "PTR_MARKERS_EMPTY",
      ptrRegionStart: "//havoc_ptr_apl_start",
      ptrRegionEnd: "//havoc_ptr_apl_end",
      ptrFunctionHeader: "void havoc_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.DEMON_HUNTER_DISPATCH,
      functionHeader: "void demon_hunter_t::init_action_list()",
      sequence: ["case DEMON_HUNTER_HAVOC:", "demon_hunter_apl::havoc( this );", "break;"],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "items"],
      listSizes: { default: 29, precombat: 10, items: 6 },
      edges: [{ from: "default", ordinal: 7, kind: "CALL", to: "items", condition: null }],
      forbiddenTokens: ["swap_action_list"],
    },
  },
  "druid-feral": {
    sourcePath: PINNED_SOURCES.APL_DRUID_FERAL.sourcePath,
    includedBy: {
      ...PINNED_SOURCES.APL_DRUID_INCLUDER,
      includeLine: '#include "class_modules/apl/druid/feral_apl.inc"',
    },
    functionHeader: "void apl_feral( player_t* p )",
    regionName: "apl_feral",
    authorityId: "SIMC_APL_DRUID_FERAL",
    spec: { className: "druid", specName: "feral" },
    defaultOut: "src/simc/data/druid-feral.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_DRUID_FERAL,
      regionSha256: "d4a1274f99c10bdde08d5a36832b2b20b898a09b35d2d10258aca3fa7b6fcbfb",
    },
    livePtrPolicy: {
      kind: "PTR_SEPARATE_INCLUDE",
      ptrFunctionHeader: "void apl_feral_ptr( player_t* p )",
      ptrIncludeLine: '#include "class_modules/apl/druid/feral_apl_ptr.inc"',
    },
    dispatch: {
      ...PINNED_SOURCES.DRUID_DISPATCH,
      functionHeader: "void druid_t::init_action_list()",
      sequence: [
        "case DRUID_FERAL:       is_ptr() ? druid_apl::apl_feral_ptr( this ) : druid_apl::apl_feral( this );             break;",
      ],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: [
        "precombat",
        "default",
        "aoe_builder",
        "aoe_finisher",
        "builder",
        "cd_variable",
        "cooldown",
        "finisher",
      ],
      listSizes: {
        precombat: 9,
        default: 14,
        aoe_builder: 11,
        aoe_finisher: 6,
        builder: 6,
        cd_variable: 10,
        cooldown: 14,
        finisher: 3,
      },
      edges: [
        { from: "default", ordinal: 7, kind: "CALL", to: "cooldown", condition: null },
        { from: "default", ordinal: 9, kind: "CALL", to: "finisher", condition: "spell_targets=1" },
        { from: "default", ordinal: 10, kind: "CALL", to: "aoe_finisher", condition: "spell_targets>=2" },
        {
          from: "default",
          ordinal: 11,
          kind: "CALL",
          to: "builder",
          condition: "spell_targets=1&combo_points<=4",
        },
        {
          from: "default",
          ordinal: 12,
          kind: "CALL",
          to: "aoe_builder",
          condition: "spell_targets>1&combo_points<=4",
        },
        {
          from: "cooldown",
          ordinal: 0,
          kind: "CALL",
          to: "cd_variable",
          condition:
            "!cooldown.bs_inc.remains|!cooldown.potion.remains|!trinket.1.cooldown.remains|!trinket.2.cooldown.remains",
        },
      ],
      forbiddenTokens: ["swap_action_list", "run_action_list"],
    },
  },
  "demonhunter-devourer": {
    sourcePath: PINNED_SOURCES.APL_DEMON_HUNTER.sourcePath,
    regionStart: "//devourer_apl_start",
    regionEnd: "//devourer_apl_end",
    functionHeader: "void devourer( player_t* p )",
    regionName: "devourer",
    authorityId: "SIMC_APL_DEMONHUNTER_DEVOURER",
    spec: { className: "demonhunter", specName: "devourer" },
    defaultOut: "src/simc/data/demonhunter-devourer.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_DEMON_HUNTER,
      regionSha256: "7ea8913291909f2060a752d391cd7c1360c3795276db28203893bc871e54e48e",
    },
    livePtrPolicy: {
      kind: "PTR_MARKERS_EMPTY",
      ptrRegionStart: "//devourer_ptr_apl_start",
      ptrRegionEnd: "//devourer_ptr_apl_end",
      ptrFunctionHeader: "void devourer_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.DEMON_HUNTER_DISPATCH,
      functionHeader: "void demon_hunter_t::init_action_list()",
      sequence: ["case DEMON_HUNTER_DEVOURER:", "demon_hunter_apl::devourer( this );", "break;"],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: [
        "default",
        "precombat",
        "annihilator_ranged",
        "annihilator_melee",
        "voidscarred_ranged",
        "voidscarred_melee",
        "vsm_st",
        "vsm_meta",
        "vsm_out",
        "variables",
        "cooldowns",
        "reaps",
      ],
      listSizes: {
        default: 6,
        precombat: 14,
        annihilator_ranged: 18,
        annihilator_melee: 27,
        voidscarred_ranged: 15,
        voidscarred_melee: 3,
        vsm_st: 20,
        vsm_meta: 17,
        vsm_out: 14,
        variables: 6,
        cooldowns: 10,
        reaps: 3,
      },
      edges: [
        { from: "default", ordinal: 0, kind: "CALL", to: "variables", condition: null },
        { from: "default", ordinal: 1, kind: "CALL", to: "cooldowns", condition: null },
        {
          from: "default",
          ordinal: 2,
          kind: "RUN",
          to: "annihilator_melee",
          condition: "hero_tree.annihilator&talent.the_hunt",
        },
        {
          from: "default",
          ordinal: 3,
          kind: "RUN",
          to: "annihilator_ranged",
          condition: "hero_tree.annihilator",
        },
        {
          from: "default",
          ordinal: 4,
          kind: "RUN",
          to: "voidscarred_ranged",
          condition: "hero_tree.voidscarred&!talent.the_hunt",
        },
        {
          from: "default",
          ordinal: 5,
          kind: "RUN",
          to: "voidscarred_melee",
          condition: "hero_tree.voidscarred&talent.the_hunt",
        },
        {
          from: "annihilator_ranged",
          ordinal: 7,
          kind: "CALL",
          to: "reaps",
          condition:
            "active_enemies=1&!buff.metamorphosis.up&action.reap.souls_consumed>=4&variable.wont_drop_meta",
        },
        {
          from: "annihilator_ranged",
          ordinal: 9,
          kind: "CALL",
          to: "reaps",
          condition: "active_enemies=1&action.reap.souls_consumed>=4",
        },
        {
          from: "annihilator_ranged",
          ordinal: 10,
          kind: "CALL",
          to: "reaps",
          condition: "fight_remains<=6&action.reap.souls_consumed>=1",
        },
        {
          from: "annihilator_ranged",
          ordinal: 11,
          kind: "CALL",
          to: "reaps",
          condition:
            "active_enemies>1&buff.eradicate.up&action.reap.souls_consumed>=4+6*buff.moment_of_craving.up",
        },
        {
          from: "annihilator_ranged",
          ordinal: 13,
          kind: "CALL",
          to: "reaps",
          condition:
            "(!buff.eradicate.up|active_enemies=1)&(buff.voidfall_spending.stack>=3&prev_gcd.1.void_ray|buff.voidfall_spending.react>=3)",
        },
        {
          from: "annihilator_ranged",
          ordinal: 14,
          kind: "CALL",
          to: "reaps",
          condition:
            "buff.metamorphosis.up&talent.collapsing_star&buff.collapsing_star_stacking.stack+action.reap.souls_consumed>=30&variable.wont_overcap_cstar&void_metamorphosis_base_drain_ps>35&action.reap.souls_consumed>=4&variable.wont_drop_meta",
        },
        {
          from: "annihilator_melee",
          ordinal: 13,
          kind: "CALL",
          to: "reaps",
          condition: "active_enemies=1&action.reap.souls_consumed>=4",
        },
        {
          from: "annihilator_melee",
          ordinal: 14,
          kind: "CALL",
          to: "reaps",
          condition:
            "!talent.eradicate&(active_enemies>1&variable.wont_overcap_cstar&set_bonus.midnight_season_2_4pc&(buff.voidfall_spending.stack>=3&prev_gcd.1.void_ray|buff.voidfall_spending.react>=3))",
        },
        {
          from: "annihilator_melee",
          ordinal: 15,
          kind: "CALL",
          to: "reaps",
          condition:
            "action.reap.souls_consumed>=4&active_enemies<5&(active_enemies>1|!buff.metamorphosis.up|buff.moment_of_craving.up|buff.collapsing_star_stacking.stack+action.reap.souls_consumed>=30|void_metamorphosis_base_drain_ps>35)",
        },
        {
          from: "annihilator_melee",
          ordinal: 16,
          kind: "CALL",
          to: "reaps",
          condition: "fight_remains<=6&action.reap.souls_consumed>=1",
        },
        {
          from: "annihilator_melee",
          ordinal: 17,
          kind: "CALL",
          to: "reaps",
          condition: "talent.eradicate&active_enemies>1&buff.eradicate.up&action.reap.souls_consumed>=1",
        },
        {
          from: "annihilator_melee",
          ordinal: 20,
          kind: "CALL",
          to: "reaps",
          condition:
            "buff.eradicate.up&active_enemies>1&action.reap.souls_consumed>=4+6*buff.moment_of_craving.up",
        },
        {
          from: "annihilator_melee",
          ordinal: 21,
          kind: "CALL",
          to: "reaps",
          condition:
            "!talent.eradicate&(active_enemies>1&!buff.metamorphosis.up&buff.moment_of_craving.up&talent.voidfall&(buff.voidfall_building.react<2|variable.ray_after_reap))",
        },
        {
          from: "annihilator_melee",
          ordinal: 22,
          kind: "CALL",
          to: "reaps",
          condition:
            "!talent.eradicate&(active_enemies>1&(buff.voidfall_spending.stack>=3&prev_gcd.1.void_ray|buff.voidfall_spending.react>=3))",
        },
        {
          from: "annihilator_melee",
          ordinal: 23,
          kind: "CALL",
          to: "reaps",
          condition:
            "active_enemies>1&buff.metamorphosis.up&talent.collapsing_star&(active_enemies>1|apex.1|buff.dark_matter.up|talent.star_fragments)&buff.collapsing_star_stacking.stack+action.reap.souls_consumed>=30&variable.wont_overcap_cstar&void_metamorphosis_base_drain_ps>35",
        },
        {
          from: "voidscarred_ranged",
          ordinal: 5,
          kind: "CALL",
          to: "reaps",
          condition: "action.reap.souls_consumed>=4",
        },
        {
          from: "voidscarred_ranged",
          ordinal: 6,
          kind: "CALL",
          to: "reaps",
          condition: "fight_remains<=6&action.reap.souls_consumed>=1",
        },
        { from: "voidscarred_melee", ordinal: 0, kind: "RUN", to: "vsm_st", condition: "active_enemies=1" },
        {
          from: "voidscarred_melee",
          ordinal: 1,
          kind: "RUN",
          to: "vsm_meta",
          condition: "buff.metamorphosis.up",
        },
        { from: "voidscarred_melee", ordinal: 2, kind: "RUN", to: "vsm_out", condition: null },
        {
          from: "vsm_st",
          ordinal: 14,
          kind: "CALL",
          to: "reaps",
          condition: "action.reap.souls_consumed>=4",
        },
      ],
      forbiddenTokens: ["swap_action_list"],
      noTargetingOptions: true,
    },
  },
  "rogue-subtlety": {
    sourcePath: PINNED_SOURCES.APL_ROGUE.sourcePath,
    regionStart: "//subtlety_apl_start",
    regionEnd: "//subtlety_apl_end",
    functionHeader: "void subtlety( player_t* p )",
    regionName: "subtlety",
    authorityId: "SIMC_APL_ROGUE_SUBTLETY",
    spec: { className: "rogue", specName: "subtlety" },
    defaultOut: "src/simc/data/rogue-subtlety.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_ROGUE,
      regionSha256: "065f1a57d8d63fc5a7fff496c054daf37ff9c5ea13bbbfdb8e8c57dae4da3aee",
    },
    livePtrPolicy: {
      kind: "NO_PTR_REGION",
      ptrRegionStart: "//subtlety_ptr_apl_start",
      ptrRegionEnd: "//subtlety_ptr_apl_end",
      ptrFunctionHeader: "void subtlety_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.ROGUE_DISPATCH,
      functionHeader: "void rogue_t::init_action_list()",
      sequence: ["else if ( specialization() == ROGUE_SUBTLETY )", "{", "rogue_apl::subtlety( this );", "}"],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "cds", "race", "item", "finish", "build", "fill"],
      listSizes: { default: 15, precombat: 6, cds: 7, race: 5, item: 4, finish: 7, build: 5, fill: 4 },
      edges: [
        { from: "default", ordinal: 6, kind: "CALL", to: "race", condition: null },
        { from: "default", ordinal: 7, kind: "CALL", to: "item", condition: null },
        { from: "default", ordinal: 8, kind: "CALL", to: "cds", condition: null },
        {
          from: "default",
          ordinal: 12,
          kind: "CALL",
          to: "finish",
          condition: "combo_points>=cp_max_spend-!buff.darkest_night.up",
        },
        { from: "default", ordinal: 13, kind: "CALL", to: "build", condition: "variable.stealth|energy>60" },
        { from: "default", ordinal: 14, kind: "CALL", to: "fill", condition: "!variable.stealth" },
      ],
      forbiddenTokens: ["swap_action_list"],
      noTargetingOptions: true,
    },
  },
  "rogue-outlaw": {
    sourcePath: PINNED_SOURCES.APL_ROGUE.sourcePath,
    regionStart: "//outlaw_apl_start",
    regionEnd: "//outlaw_apl_end",
    functionHeader: "void outlaw( player_t* p )",
    regionName: "outlaw",
    authorityId: "SIMC_APL_ROGUE_OUTLAW",
    spec: { className: "rogue", specName: "outlaw" },
    defaultOut: "src/simc/data/rogue-outlaw.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_ROGUE,
      regionSha256: "859365c952280376f1ae604968f2178054a60cbb1809416b9b223aad4a07f725",
    },
    livePtrPolicy: {
      kind: "NO_PTR_REGION",
      ptrRegionStart: "//outlaw_ptr_apl_start",
      ptrRegionEnd: "//outlaw_ptr_apl_end",
      ptrFunctionHeader: "void outlaw_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.ROGUE_DISPATCH,
      functionHeader: "void rogue_t::init_action_list()",
      sequence: ["else if ( specialization() == ROGUE_OUTLAW )", "{", "rogue_apl::outlaw( this );", "}"],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "cds", "finish", "build"],
      listSizes: { default: 13, precombat: 6, cds: 15, finish: 5, build: 9 },
      edges: [
        { from: "default", ordinal: 6, kind: "CALL", to: "cds", condition: null },
        { from: "default", ordinal: 7, kind: "RUN", to: "finish", condition: "variable.finish_condition" },
        { from: "default", ordinal: 8, kind: "CALL", to: "build", condition: null },
      ],
      forbiddenTokens: ["swap_action_list"],
      noTargetingOptions: true,
    },
  },
  "warlock-affliction": {
    sourcePath: PINNED_SOURCES.APL_WARLOCK.sourcePath,
    regionStart: "//affliction_apl_start",
    regionEnd: "//affliction_apl_end",
    functionHeader: "void affliction( player_t* p )",
    regionName: "affliction",
    authorityId: "SIMC_APL_WARLOCK_AFFLICTION",
    spec: { className: "warlock", specName: "affliction" },
    defaultOut: "src/simc/data/warlock-affliction.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_WARLOCK,
      regionSha256: "ff8a30d2009b5775069f4d006348398b6381fccb266519289ae43ca176eb6c51",
    },
    livePtrPolicy: {
      kind: "NO_PTR_REGION",
      ptrRegionStart: "//affliction_ptr_apl_start",
      ptrRegionEnd: "//affliction_ptr_apl_end",
      ptrFunctionHeader: "void affliction_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.WARLOCK_DISPATCH,
      functionHeader: "void warlock_t::init_action_list()",
      sequence: ["case WARLOCK_AFFLICTION:", "warlock_apl::affliction( this );", "break;"],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: [
        "default",
        "precombat",
        "soul_harvester",
        "hellcaller",
        "items",
        "ogcd",
        "SH_st",
        "SH_aoe",
        "SH_cleave",
        "HC_st",
        "HC_aoe",
        "HC_cleave",
        "end_of_fight",
        "variables",
      ],
      listSizes: {
        default: 9,
        precombat: 8,
        soul_harvester: 3,
        hellcaller: 3,
        items: 5,
        ogcd: 6,
        SH_st: 10,
        SH_aoe: 12,
        SH_cleave: 12,
        HC_st: 10,
        HC_aoe: 10,
        HC_cleave: 9,
        end_of_fight: 4,
        variables: 5,
      },
      edges: [
        { from: "default", ordinal: 0, kind: "CALL", to: "variables", condition: null },
        { from: "default", ordinal: 1, kind: "CALL", to: "end_of_fight", condition: null },
        { from: "default", ordinal: 2, kind: "CALL", to: "ogcd", condition: null },
        { from: "default", ordinal: 3, kind: "CALL", to: "items", condition: null },
        {
          from: "default",
          ordinal: 4,
          kind: "CALL",
          to: "soul_harvester",
          condition: "hero_tree.soul_harvester",
        },
        { from: "default", ordinal: 5, kind: "CALL", to: "hellcaller", condition: "hero_tree.hellcaller" },
        { from: "soul_harvester", ordinal: 0, kind: "CALL", to: "SH_st", condition: "active_enemies=1" },
        { from: "soul_harvester", ordinal: 1, kind: "CALL", to: "SH_cleave", condition: "active_enemies=2" },
        { from: "soul_harvester", ordinal: 2, kind: "CALL", to: "SH_aoe", condition: "active_enemies>2" },
        { from: "hellcaller", ordinal: 0, kind: "CALL", to: "HC_st", condition: "active_enemies=1" },
        { from: "hellcaller", ordinal: 1, kind: "CALL", to: "HC_cleave", condition: "active_enemies=2" },
        { from: "hellcaller", ordinal: 2, kind: "CALL", to: "HC_aoe", condition: "active_enemies>2" },
      ],
      forbiddenTokens: ["swap_action_list", "run_action_list"],
    },
  },
  "warlock-destruction": {
    sourcePath: PINNED_SOURCES.APL_WARLOCK.sourcePath,
    regionStart: "//destruction_apl_start",
    regionEnd: "//destruction_apl_end",
    functionHeader: "void destruction( player_t* p )",
    regionName: "destruction",
    authorityId: "SIMC_APL_WARLOCK_DESTRUCTION",
    spec: { className: "warlock", specName: "destruction" },
    defaultOut: "src/simc/data/warlock-destruction.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_WARLOCK,
      regionSha256: "7ce972aac42e3409bedab2511c407217049df1756fd23517597f0f447f068df3",
    },
    livePtrPolicy: {
      kind: "NO_PTR_REGION",
      ptrRegionStart: "//destruction_ptr_apl_start",
      ptrRegionEnd: "//destruction_ptr_apl_end",
      ptrFunctionHeader: "void destruction_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.WARLOCK_DISPATCH,
      functionHeader: "void warlock_t::init_action_list()",
      sequence: ["case WARLOCK_DESTRUCTION:", "warlock_apl::destruction( this );", "break;"],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "aoe_hc", "aoe_dia", "items", "ogcd", "variables"],
      listSizes: { default: 20, precombat: 15, aoe_hc: 14, aoe_dia: 16, items: 5, ogcd: 6, variables: 4 },
      edges: [
        { from: "default", ordinal: 0, kind: "CALL", to: "variables", condition: null },
        { from: "default", ordinal: 1, kind: "CALL", to: "ogcd", condition: null },
        { from: "default", ordinal: 2, kind: "CALL", to: "items", condition: null },
        {
          from: "default",
          ordinal: 3,
          kind: "CALL",
          to: "aoe_hc",
          condition: "active_enemies>=2&talent.wither",
        },
        {
          from: "default",
          ordinal: 4,
          kind: "CALL",
          to: "aoe_dia",
          condition: "active_enemies>=2&talent.diabolic_ritual",
        },
      ],
      forbiddenTokens: ["swap_action_list"],
    },
  },
  "shaman-elemental": {
    sourcePath: PINNED_SOURCES.APL_SHAMAN.sourcePath,
    regionStart: "//elemental_apl_start",
    regionEnd: "//elemental_apl_end",
    functionHeader: "void elemental( player_t* p )",
    regionName: "elemental",
    authorityId: "SIMC_APL_SHAMAN_ELEMENTAL",
    spec: { className: "shaman", specName: "elemental" },
    defaultOut: "src/simc/data/shaman-elemental.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_SHAMAN,
      regionSha256: "db72156b6e5625ae51f01e08a1ba65c671a2faebe7eff6b91ed3dbec43e77517",
    },
    livePtrPolicy: {
      kind: "PTR_BODY_IDENTICAL",
      ptrRegionStart: "//elemental_ptr_apl_start",
      ptrRegionEnd: "//elemental_ptr_apl_end",
      ptrFunctionHeader: "void elemental_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.SHAMAN_DISPATCH,
      functionHeader: "void shaman_t::init_action_list()",
      sequence: [
        "case SHAMAN_ELEMENTAL:",
        "is_ptr() ? shaman_apl::elemental_ptr( this ) : shaman_apl::elemental( this );",
        "break;",
      ],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "aoe", "single_target"],
      listSizes: { default: 19, precombat: 9, aoe: 21, single_target: 31 },
      edges: [
        {
          from: "default",
          ordinal: 17,
          kind: "RUN",
          to: "aoe",
          condition: "spell_targets.chain_lightning>=3",
        },
        { from: "default", ordinal: 18, kind: "RUN", to: "single_target", condition: null },
      ],
      forbiddenTokens: ["swap_action_list", "call_action_list"],
    },
  },
  "druid-balance": {
    sourcePath: PINNED_SOURCES.APL_DRUID_BALANCE.sourcePath,
    includedBy: {
      ...PINNED_SOURCES.APL_DRUID_INCLUDER,
      includeLine: '#include "class_modules/apl/druid/balance_apl.inc"',
    },
    functionHeader: "void apl_balance( player_t* p )",
    regionName: "apl_balance",
    authorityId: "SIMC_APL_DRUID_BALANCE",
    spec: { className: "druid", specName: "balance" },
    defaultOut: "src/simc/data/druid-balance.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_DRUID_BALANCE,
      regionSha256: "9b481c5f42e9671941adfabd44f6a02a3912b42dc5c2d191cc4629873aa54525",
    },
    livePtrPolicy: {
      kind: "PTR_SEPARATE_INCLUDE",
      ptrFunctionHeader: "void apl_balance_ptr( player_t* p )",
      ptrIncludeLine: '#include "class_modules/apl/druid/balance_apl_ptr.inc"',
    },
    dispatch: {
      ...PINNED_SOURCES.DRUID_DISPATCH,
      functionHeader: "void druid_t::init_action_list()",
      sequence: [
        "case DRUID_BALANCE:     is_ptr() ? druid_apl::apl_balance_ptr( this ) : druid_apl::apl_balance( this );         break;",
      ],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["precombat", "default", "aoe", "cooldowns", "ec_st", "kotg_st", "mini", "opener"],
      listSizes: {
        precombat: 11,
        default: 19,
        aoe: 19,
        cooldowns: 6,
        ec_st: 15,
        kotg_st: 15,
        mini: 3,
        opener: 13,
      },
      edges: [
        { from: "default", ordinal: 13, kind: "RUN", to: "opener", condition: "variable.opener" },
        {
          from: "default",
          ordinal: 14,
          kind: "RUN",
          to: "mini",
          condition: "variable.mini&!variable.opener",
        },
        {
          from: "default",
          ordinal: 15,
          kind: "RUN",
          to: "cooldowns",
          condition: "variable.cds&!variable.opener",
        },
        {
          from: "default",
          ordinal: 16,
          kind: "RUN",
          to: "ec_st",
          condition: "hero_tree.elunes_chosen&spell_targets=1",
        },
        { from: "default", ordinal: 17, kind: "RUN", to: "kotg_st", condition: "spell_targets=1" },
        { from: "default", ordinal: 18, kind: "RUN", to: "aoe", condition: "spell_targets>1" },
      ],
      forbiddenTokens: ["swap_action_list", "call_action_list"],
    },
  },
  "priest-shadow": {
    sourcePath: PINNED_SOURCES.APL_PRIEST.sourcePath,
    regionStart: "//shadow_apl_start",
    regionEnd: "//shadow_apl_end",
    functionHeader: "void shadow( player_t* p )",
    regionName: "shadow",
    authorityId: "SIMC_APL_PRIEST_SHADOW",
    spec: { className: "priest", specName: "shadow" },
    defaultOut: "src/simc/data/priest-shadow.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_PRIEST,
      regionSha256: "638c4a8f9e9907dcb3c9299b2e3e2485999cbe8fcb910c3d5288d840cd92c33e",
    },
    livePtrPolicy: {
      kind: "PTR_BODY_DIFFERS",
      ptrRegionStart: "//shadow_ptr_apl_start",
      ptrRegionEnd: "//shadow_ptr_apl_end",
      ptrFunctionHeader: "void shadow_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.PRIEST_DISPATCH,
      functionHeader: "void priest_t::init_action_list()",
      sequence: [
        "case PRIEST_SHADOW:",
        "if ( is_ptr() )",
        "{",
        "priest_apl::shadow_ptr( this );",
        "}",
        "else",
        "{",
        "priest_apl::shadow( this );",
        "}",
        "break;",
      ],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: [
        "default",
        "precombat",
        "aoe",
        "aoe_variables",
        "cds",
        "heal_for_tof",
        "main",
        "trinkets",
      ],
      listSizes: {
        default: 3,
        precombat: 12,
        aoe: 1,
        aoe_variables: 6,
        cds: 13,
        heal_for_tof: 1,
        main: 23,
        trinkets: 5,
      },
      edges: [
        { from: "default", ordinal: 1, kind: "CALL", to: "aoe", condition: "active_enemies>2" },
        { from: "default", ordinal: 2, kind: "RUN", to: "main", condition: null },
        { from: "aoe", ordinal: 0, kind: "CALL", to: "aoe_variables", condition: null },
        { from: "cds", ordinal: 11, kind: "CALL", to: "trinkets", condition: null },
        {
          from: "main",
          ordinal: 1,
          kind: "CALL",
          to: "cds",
          condition:
            "fight_remains<30|target.time_to_die>15&(!variable.holding_tentacle_slam|active_enemies>2)&variable.dots_up",
        },
        {
          from: "main",
          ordinal: 13,
          kind: "CALL",
          to: "heal_for_tof",
          condition: "!buff.twist_of_fate.up&buff.twist_of_fate_can_trigger_on_ally_heal.up&talent.halo",
        },
      ],
      forbiddenTokens: ["swap_action_list"],
    },
  },
  "demonhunter-vengeance": {
    sourcePath: PINNED_SOURCES.APL_DEMON_HUNTER.sourcePath,
    regionStart: "//vengeance_apl_start",
    regionEnd: "//vengeance_apl_end",
    functionHeader: "void vengeance( player_t* p )",
    regionName: "vengeance",
    authorityId: "SIMC_APL_DEMONHUNTER_VENGEANCE",
    spec: { className: "demonhunter", specName: "vengeance" },
    defaultOut: "src/simc/data/demonhunter-vengeance.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_DEMON_HUNTER,
      regionSha256: "ea44428b9dc9c4c27284a81083f42418229f882b49ead6053c06093cb18c6b85",
    },
    livePtrPolicy: {
      kind: "PTR_MARKERS_EMPTY",
      ptrRegionStart: "//vengeance_ptr_apl_start",
      ptrRegionEnd: "//vengeance_ptr_apl_end",
      ptrFunctionHeader: "void vengeance_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.DEMON_HUNTER_DISPATCH,
      functionHeader: "void demon_hunter_t::init_action_list()",
      sequence: ["case DEMON_HUNTER_VENGEANCE:", "demon_hunter_apl::vengeance( this );", "break;"],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: [
        "default",
        "precombat",
        "ar",
        "ar_quick_consume",
        "ar_fillers",
        "ar_glaive_cycle",
        "ar_glaive_cycle_filler",
        "anni",
        "anni_cooldowns",
        "anni_voidfall_spending",
        "anni_meta_entry",
        "anni_pre_meta_spb",
        "anni_voidfall_fishing",
        "anni_generate_fury",
        "anni_filler_no_spend",
        "trinkets",
      ],
      listSizes: {
        default: 23,
        precombat: 4,
        ar: 60,
        ar_quick_consume: 3,
        ar_fillers: 16,
        ar_glaive_cycle: 11,
        ar_glaive_cycle_filler: 9,
        anni: 19,
        anni_cooldowns: 5,
        anni_voidfall_spending: 12,
        anni_meta_entry: 12,
        anni_pre_meta_spb: 7,
        anni_voidfall_fishing: 2,
        anni_generate_fury: 4,
        anni_filler_no_spend: 10,
        trinkets: 6,
      },
      edges: [
        { from: "default", ordinal: 21, kind: "RUN", to: "ar", condition: "hero_tree.aldrachi_reaver" },
        { from: "default", ordinal: 22, kind: "RUN", to: "anni", condition: "hero_tree.annihilator" },
        { from: "ar", ordinal: 49, kind: "CALL", to: "trinkets", condition: null },
        {
          from: "ar",
          ordinal: 51,
          kind: "CALL",
          to: "ar_glaive_cycle",
          condition: "buff.rending_strike.up|buff.glaive_flurry.up|prev_gcd.1.reavers_glaive",
        },
        {
          from: "ar",
          ordinal: 54,
          kind: "CALL",
          to: "ar_quick_consume",
          condition:
            "!buff.reavers_glaive.up&!buff.rending_strike.up&!buff.glaive_flurry.up&(buff.art_of_the_glaive.stack+soul_fragments>=20|(variable.aoe&soul_fragments>=6))",
        },
        { from: "ar", ordinal: 59, kind: "CALL", to: "ar_fillers", condition: null },
        {
          from: "ar_glaive_cycle",
          ordinal: 2,
          kind: "CALL",
          to: "ar_glaive_cycle_filler",
          condition:
            "(variable.prio_slashes&((cooldown.fracture.charges<1&buff.rending_strike.up&buff.glaive_flurry.up)|fury<10))|(!variable.prio_slashes&((buff.rending_strike.up&buff.glaive_flurry.up&fury<35)|(buff.rending_strike.up&!buff.glaive_flurry.up&cooldown.fracture.charges<1)))",
        },
        { from: "ar_glaive_cycle", ordinal: 10, kind: "CALL", to: "ar_glaive_cycle_filler", condition: null },
        {
          from: "anni",
          ordinal: 3,
          kind: "CALL",
          to: "anni_voidfall_spending",
          condition: "buff.voidfall_spending.up",
        },
        {
          from: "anni",
          ordinal: 4,
          kind: "CALL",
          to: "anni_voidfall_fishing",
          condition: "buff.voidfall_building.stack>=2&!buff.voidfall_spending.up",
        },
        {
          from: "anni",
          ordinal: 5,
          kind: "CALL",
          to: "anni_meta_entry",
          condition:
            "buff.untethered_rage.up|(variable.dung_meta_ok&cooldown.metamorphosis.remains<variable.anni_meta_entry_time)",
        },
        {
          from: "anni",
          ordinal: 6,
          kind: "CALL",
          to: "anni_cooldowns",
          condition:
            "variable.dung_cd_ok&(!talent.fiery_demise|variable.fiery_demise_active|cooldown.fiery_brand.remains>20|variable.execute)",
        },
        {
          from: "anni_cooldowns",
          ordinal: 4,
          kind: "CALL",
          to: "anni_generate_fury",
          condition: "cooldown.fel_devastation.up&fury<50",
        },
        {
          from: "anni_voidfall_spending",
          ordinal: 11,
          kind: "CALL",
          to: "anni_filler_no_spend",
          condition: null,
        },
        { from: "anni_meta_entry", ordinal: 1, kind: "CALL", to: "trinkets", condition: null },
        {
          from: "anni_meta_entry",
          ordinal: 4,
          kind: "CALL",
          to: "anni_pre_meta_spb",
          condition:
            "cooldown.spirit_bomb.remains<variable.anni_meta_entry_time&soul_fragments.total<variable.fragment_target",
        },
        {
          from: "anni_meta_entry",
          ordinal: 9,
          kind: "CALL",
          to: "anni_generate_fury",
          condition: "fury<75&cooldown.metamorphosis.up&cooldown.spirit_bomb.remains>gcd.max*3",
        },
        { from: "anni_meta_entry", ordinal: 11, kind: "CALL", to: "anni_filler_no_spend", condition: null },
        { from: "anni_pre_meta_spb", ordinal: 6, kind: "CALL", to: "anni_filler_no_spend", condition: null },
        {
          from: "anni_voidfall_fishing",
          ordinal: 1,
          kind: "CALL",
          to: "anni_generate_fury",
          condition: "cooldown.fracture.charges_fractional>=0.75",
        },
      ],
      forbiddenTokens: ["swap_action_list"],
    },
  },
  "evoker-devastation": {
    sourcePath: PINNED_SOURCES.APL_EVOKER.sourcePath,
    regionStart: "//devastation_apl_start",
    regionEnd: "//devastation_apl_end",
    functionHeader: "void devastation( player_t* p )",
    regionName: "devastation",
    authorityId: "SIMC_APL_EVOKER_DEVASTATION",
    spec: { className: "evoker", specName: "devastation" },
    defaultOut: "src/simc/data/evoker-devastation.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_EVOKER,
      regionSha256: "460e88bfba7864def1fd982bd25a05500e92481dd4d9dd3ebdfe8ef0bb89111b",
    },
    livePtrPolicy: {
      kind: "PTR_STUB_NEVER_DISPATCHED",
      ptrRegionStart: "//devastation_ptr_apl_start",
      ptrRegionEnd: "//devastation_ptr_apl_end",
      ptrFunctionHeader: "void devastation_ptr( player_t* )",
    },
    dispatch: {
      ...PINNED_SOURCES.EVOKER_DISPATCH,
      functionHeader: "void evoker_t::init_action_list()",
      sequence: ["case EVOKER_DEVASTATION:", "evoker_apl::devastation( this );", "break;"],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "sc", "fs", "es", "fb", "green", "trinkets"],
      listSizes: { default: 10, precombat: 27, sc: 17, fs: 15, es: 4, fb: 3, green: 2, trinkets: 8 },
      edges: [
        { from: "default", ordinal: 7, kind: "CALL", to: "trinkets", condition: null },
        { from: "default", ordinal: 8, kind: "RUN", to: "sc", condition: "talent.mass_disintegrate" },
        { from: "default", ordinal: 9, kind: "RUN", to: "fs", condition: null },
        { from: "sc", ordinal: 4, kind: "CALL", to: "es", condition: null },
        {
          from: "sc",
          ordinal: 15,
          kind: "CALL",
          to: "green",
          condition:
            "talent.ancient_flame&!buff.ancient_flame.up&talent.scarlet_adaptation&!buff.dragonrage.up",
        },
        {
          from: "fs",
          ordinal: 4,
          kind: "CALL",
          to: "es",
          condition: "variable.can_use_empower|buff.tip_the_scales.up",
        },
        {
          from: "fs",
          ordinal: 5,
          kind: "CALL",
          to: "fb",
          condition: "variable.can_use_empower&dot.fire_breath_damage.refreshable&!buff.tip_the_scales.up",
        },
        {
          from: "fs",
          ordinal: 13,
          kind: "CALL",
          to: "green",
          condition:
            "talent.ancient_flame&!buff.ancient_flame.up&talent.scarlet_adaptation&!buff.dragonrage.up&active_enemies<4",
        },
      ],
      forbiddenTokens: ["swap_action_list"],
    },
  },
  "mage-fire": {
    sourcePath: PINNED_SOURCES.APL_MAGE.sourcePath,
    regionStart: "//fire_apl_start",
    regionEnd: "//fire_apl_end",
    functionHeader: "void fire( player_t* p )",
    regionName: "fire",
    authorityId: "SIMC_APL_MAGE_FIRE",
    spec: { className: "mage", specName: "fire" },
    defaultOut: "src/simc/data/mage-fire.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_MAGE,
      regionSha256: "b6b35a8c03a28003d9021aa374dda24aa28dba6e02d4711077be06a252c9973f",
    },
    livePtrPolicy: {
      kind: "NO_PTR_REGION",
      ptrRegionStart: "//fire_ptr_apl_start",
      ptrRegionEnd: "//fire_ptr_apl_end",
      ptrFunctionHeader: "void fire_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.MAGE_DISPATCH,
      functionHeader: "void mage_t::init_action_list()",
      sequence: ["case MAGE_FIRE:", "mage_apl::fire( this );", "break;"],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: [
        "default",
        "precombat",
        "cds",
        "fireblast",
        "ff_combustion",
        "ff_filler",
        "sf_combustion",
        "sf_filler",
      ],
      listSizes: {
        default: 10,
        precombat: 9,
        cds: 18,
        fireblast: 8,
        ff_combustion: 12,
        ff_filler: 8,
        sf_combustion: 15,
        sf_filler: 8,
      },
      edges: [
        { from: "default", ordinal: 0, kind: "CALL", to: "cds", condition: null },
        {
          from: "default",
          ordinal: 6,
          kind: "RUN",
          to: "ff_combustion",
          condition:
            "talent.frostfire_bolt&((time>=variable.combustion_delay)&(cooldown.combustion.remains<=variable.combustion_precast_time|buff.combustion.up|cooldown.combustion.ready))",
        },
        {
          from: "default",
          ordinal: 7,
          kind: "RUN",
          to: "sf_combustion",
          condition:
            "!talent.frostfire_bolt&((time>=variable.combustion_delay)&(cooldown.combustion.remains<=variable.combustion_precast_time+gcd.max*(talent.sunfury_execution&cooldown.meteor.remains<gcd.max)|buff.combustion.up|cooldown.combustion.ready))",
        },
        { from: "default", ordinal: 8, kind: "RUN", to: "ff_filler", condition: "talent.frostfire_bolt" },
        { from: "default", ordinal: 9, kind: "RUN", to: "sf_filler", condition: null },
        {
          from: "ff_combustion",
          ordinal: 11,
          kind: "CALL",
          to: "fireblast",
          condition:
            "!talent.pyroclasm|(buff.pyroclasm.stack<2|action.pyroblast.executing&action.pyroblast.execute_remains>0.2&buff.pyroclasm.stack=2|cooldown.fire_blast.charges_fractional>=2.9|buff.combustion.remains<action.pyroblast.cast_time)&(active_enemies<variable.sf_combustion_flamestrike|buff.pyroclasm.down|!action.flamestrike.executing)",
        },
        { from: "ff_filler", ordinal: 7, kind: "CALL", to: "fireblast", condition: null },
        {
          from: "sf_combustion",
          ordinal: 14,
          kind: "CALL",
          to: "fireblast",
          condition:
            "!talent.pyroclasm|(buff.pyroclasm.stack<2|action.pyroblast.executing&action.pyroblast.execute_remains>0.2&buff.pyroclasm.stack=2|cooldown.fire_blast.charges_fractional>=2.9|buff.combustion.remains<action.pyroblast.cast_time)&(active_enemies<variable.sf_combustion_flamestrike|buff.pyroclasm.down|!action.flamestrike.executing)",
        },
        { from: "sf_filler", ordinal: 7, kind: "CALL", to: "fireblast", condition: null },
      ],
      forbiddenTokens: ["swap_action_list"],
    },
  },
  "mage-arcane": {
    sourcePath: PINNED_SOURCES.APL_MAGE.sourcePath,
    regionStart: "//arcane_apl_start",
    regionEnd: "//arcane_apl_end",
    functionHeader: "void arcane( player_t* p )",
    regionName: "arcane",
    authorityId: "SIMC_APL_MAGE_ARCANE",
    spec: { className: "mage", specName: "arcane" },
    defaultOut: "src/simc/data/mage-arcane.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_MAGE,
      regionSha256: "b4dc53d609500d5323f9f4a98fd084810f62fec4c0b5e0303c0a274a83a7558e",
    },
    livePtrPolicy: {
      kind: "NO_PTR_REGION",
      ptrRegionStart: "//arcane_ptr_apl_start",
      ptrRegionEnd: "//arcane_ptr_apl_end",
      ptrFunctionHeader: "void arcane_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.MAGE_DISPATCH,
      functionHeader: "void mage_t::init_action_list()",
      sequence: ["case MAGE_ARCANE:", "mage_apl::arcane( this );", "break;"],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "cooldowns", "spellslinger", "sunfury"],
      listSizes: { default: 17, precombat: 13, cooldowns: 6, spellslinger: 8, sunfury: 7 },
      edges: [
        { from: "default", ordinal: 13, kind: "CALL", to: "cooldowns", condition: null },
        {
          from: "default",
          ordinal: 14,
          kind: "CALL",
          to: "spellslinger",
          condition: "talent.splintering_sorcery",
        },
        {
          from: "default",
          ordinal: 15,
          kind: "CALL",
          to: "sunfury",
          condition: "!talent.splintering_sorcery",
        },
      ],
      forbiddenTokens: ["swap_action_list", "run_action_list"],
    },
  },
  "mage-frost": {
    sourcePath: PINNED_SOURCES.APL_MAGE.sourcePath,
    regionStart: "//frost_apl_start",
    regionEnd: "//frost_apl_end",
    functionHeader: "void frost( player_t* p )",
    regionName: "frost",
    authorityId: "SIMC_APL_MAGE_FROST",
    spec: { className: "mage", specName: "frost" },
    defaultOut: "src/simc/data/mage-frost.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_MAGE,
      regionSha256: "2b69aaf6459a417d6cb97a6f8bf8e75ff8acea3edb020d6ebf46ee10f63cc6cc",
    },
    livePtrPolicy: {
      kind: "NO_PTR_REGION",
      ptrRegionStart: "//frost_ptr_apl_start",
      ptrRegionEnd: "//frost_ptr_apl_end",
      ptrFunctionHeader: "void frost_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.MAGE_DISPATCH,
      functionHeader: "void mage_t::init_action_list()",
      sequence: ["case MAGE_FROST:", "mage_apl::frost( this );", "break;"],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "cds", "frostfire", "movement", "spellslinger"],
      listSizes: { default: 3, precombat: 6, cds: 25, frostfire: 16, movement: 5, spellslinger: 16 },
      edges: [
        { from: "default", ordinal: 0, kind: "CALL", to: "cds", condition: null },
        { from: "default", ordinal: 1, kind: "RUN", to: "frostfire", condition: "talent.frostfire_bolt" },
        { from: "default", ordinal: 2, kind: "RUN", to: "spellslinger", condition: null },
        { from: "frostfire", ordinal: 15, kind: "CALL", to: "movement", condition: null },
        { from: "spellslinger", ordinal: 15, kind: "CALL", to: "movement", condition: null },
      ],
      forbiddenTokens: ["swap_action_list"],
    },
  },
  "hunter-marksmanship": {
    sourcePath: PINNED_SOURCES.APL_HUNTER.sourcePath,
    regionStart: "//marksmanship_apl_start",
    regionEnd: "//marksmanship_apl_end",
    functionHeader: "void marksmanship( player_t* p )",
    regionName: "marksmanship",
    authorityId: "SIMC_APL_HUNTER_MARKSMANSHIP",
    spec: { className: "hunter", specName: "marksmanship" },
    defaultOut: "src/simc/data/hunter-marksmanship.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_HUNTER,
      regionSha256: "5f66ad059a846939fbf1cf32984852a41711e38f2b69848b539fafaf93c3e456",
    },
    livePtrPolicy: {
      kind: "PTR_BODY_DIFFERS",
      ptrRegionStart: "//marksmanship_ptr_apl_start",
      ptrRegionEnd: "//marksmanship_ptr_apl_end",
      ptrFunctionHeader: "void marksmanship_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.HUNTER_DISPATCH,
      functionHeader: "void hunter_t::init_action_list()",
      sequence: [
        "case HUNTER_MARKSMANSHIP:",
        "if ( is_ptr() )",
        "hunter_apl::marksmanship_ptr( this );",
        "else",
        "hunter_apl::marksmanship( this );",
        "break;",
      ],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "cds", "drst", "draoe", "sentaoe", "sentst", "trinkets"],
      listSizes: {
        default: 10,
        precombat: 4,
        cds: 8,
        drst: 13,
        draoe: 14,
        sentaoe: 13,
        sentst: 14,
        trinkets: 4,
      },
      edges: [
        { from: "default", ordinal: 4, kind: "CALL", to: "cds", condition: null },
        { from: "default", ordinal: 5, kind: "CALL", to: "trinkets", condition: null },
        {
          from: "default",
          ordinal: 6,
          kind: "CALL",
          to: "draoe",
          condition: "active_enemies>2&talent.trick_shots&hero_tree.dark_ranger",
        },
        {
          from: "default",
          ordinal: 7,
          kind: "CALL",
          to: "sentaoe",
          condition: "active_enemies>2&talent.trick_shots&hero_tree.sentinel",
        },
        { from: "default", ordinal: 8, kind: "CALL", to: "drst", condition: "hero_tree.dark_ranger" },
        { from: "default", ordinal: 9, kind: "CALL", to: "sentst", condition: "hero_tree.sentinel" },
      ],
      forbiddenTokens: ["swap_action_list", "run_action_list"],
    },
  },
  "hunter-survival": {
    sourcePath: PINNED_SOURCES.APL_HUNTER.sourcePath,
    regionStart: "//survival_apl_start",
    regionEnd: "//survival_apl_end",
    functionHeader: "void survival( player_t* p )",
    regionName: "survival",
    authorityId: "SIMC_APL_HUNTER_SURVIVAL",
    spec: { className: "hunter", specName: "survival" },
    defaultOut: "src/simc/data/hunter-survival.apl.json",
    pinnedSource: {
      ...PINNED_SOURCES.APL_HUNTER,
      regionSha256: "b16ff21787dc24f665080261989540cafa1c1e2904d4a6e9c0cea01d3d37c1d8",
    },
    livePtrPolicy: {
      kind: "PTR_BODY_IDENTICAL",
      ptrRegionStart: "//survival_ptr_apl_start",
      ptrRegionEnd: "//survival_ptr_apl_end",
      ptrFunctionHeader: "void survival_ptr( player_t* p )",
    },
    dispatch: {
      ...PINNED_SOURCES.HUNTER_DISPATCH,
      functionHeader: "void hunter_t::init_action_list()",
      sequence: [
        "case HUNTER_SURVIVAL:",
        "if ( is_ptr() )",
        "hunter_apl::survival_ptr( this );",
        "else",
        "hunter_apl::survival( this );",
        "break;",
      ],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "precombat", "cds", "plst", "sentst", "plcleave", "sentcleave"],
      listSizes: { default: 7, precombat: 4, cds: 12, plst: 9, sentst: 10, plcleave: 10, sentcleave: 8 },
      edges: [
        { from: "default", ordinal: 2, kind: "CALL", to: "cds", condition: null },
        {
          from: "default",
          ordinal: 3,
          kind: "CALL",
          to: "plst",
          condition: "active_enemies<3&talent.howl_of_the_pack_leader",
        },
        {
          from: "default",
          ordinal: 4,
          kind: "CALL",
          to: "plcleave",
          condition: "active_enemies>2&talent.howl_of_the_pack_leader",
        },
        {
          from: "default",
          ordinal: 5,
          kind: "CALL",
          to: "sentst",
          condition: "active_enemies<3&!talent.howl_of_the_pack_leader",
        },
        {
          from: "default",
          ordinal: 6,
          kind: "CALL",
          to: "sentcleave",
          condition: "active_enemies>2&!talent.howl_of_the_pack_leader",
        },
      ],
      forbiddenTokens: ["swap_action_list"],
    },
  },
};

/**
 * A fail-closed extraction stop. Thrown rather than exiting so the region
 * selector and the fact verifier can be exercised by tests; the CLI prints
 * `EXTRACTION FAILED: <message>` and exits 1, exactly as it always has.
 */
export class ExtractionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExtractionError";
  }
}

function fail(message) {
  throw new ExtractionError(message);
}

function parseArgs(argv) {
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

async function loadSource(args, sourcePath) {
  if (typeof args.file === "string") {
    return readFileSync(args.file);
  }
  if (typeof args.sha !== "string" || !/^[0-9a-f]{40}$/.test(args.sha)) {
    fail("--sha must be a full 40-character commit SHA (or pass --file for a local copy)");
  }
  const url = `https://raw.githubusercontent.com/simulationcraft/simc/${args.sha}/${sourcePath}`;
  const response = await fetch(url, { headers: { "User-Agent": "wlc-vnext-extractor" } });
  if (!response.ok) {
    fail(`could not fetch pinned source (HTTP ${response.status}) from ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Reads one C++ double-quoted string literal starting at `start`.
 *
 * Handles `\"` and `\\`. Returns the decoded value and the index just past the
 * closing quote. A literal that does not terminate is a failure, never a
 * truncated value.
 */
function readStringLiteral(line, start, lineNumber) {
  if (line[start] !== '"') {
    fail(`line ${lineNumber}: expected a string literal at column ${start + 1}`);
  }
  let value = "";
  let index = start + 1;
  while (index < line.length) {
    const char = line[index];
    if (char === "\\") {
      const escaped = line[index + 1];
      if (escaped === undefined) fail(`line ${lineNumber}: dangling escape in string literal`);
      if (escaped === '"') value += '"';
      else if (escaped === "\\") value += "\\";
      else if (escaped === "n") value += "\n";
      else fail(`line ${lineNumber}: unsupported escape \\${escaped} in string literal`);
      index += 2;
      continue;
    }
    if (char === '"') {
      return { value, next: index + 1 };
    }
    value += char;
    index += 1;
  }
  fail(`line ${lineNumber}: unterminated string literal`);
  return { value: "", next: index };
}

/** `add_action( "a" )` or `add_action( "a", "comment" )`. Anything else fails. */
function parseAddActionArguments(line, openParenIndex, lineNumber) {
  let index = openParenIndex + 1;
  const skipSpace = () => {
    while (index < line.length && /\s/.test(line[index])) index += 1;
  };

  skipSpace();
  const first = readStringLiteral(line, index, lineNumber);
  index = first.next;
  skipSpace();

  let comment = null;
  if (line[index] === ",") {
    index += 1;
    skipSpace();
    const second = readStringLiteral(line, index, lineNumber);
    comment = second.value;
    index = second.next;
    skipSpace();
  }

  if (line[index] !== ")") {
    fail(
      `line ${lineNumber}: add_action takes one or two string literals; found an unsupported argument form`,
    );
  }
  index += 1;
  skipSpace();
  if (line[index] !== ";" || index + 1 !== line.length) {
    fail(`line ${lineNumber}: expected the statement to end with ');'`);
  }
  return { actionStringVerbatim: first.value, comment };
}

/**
 * A client-version guard line, or `null`.
 *
 *     if ( p->sim->dbc->wowv() < wowv_t( 12, 1, 0 ) )
 *     else if ( p->sim->dbc->wowv() >= wowv_t( 12, 1, 0 ) )
 *
 * Only this exact shape is a guard. Any other `if` is an unsupported construct
 * and fails the region, as every unknown line always has. `p` is the target's
 * `playerIdentifier` (M11-C1); for every target that does not declare one it
 * is `p`, and the pattern is the one it always was.
 */
function versionGuardPattern(playerIdentifier) {
  return new RegExp(
    `^(else\\s+)?if\\s*\\(\\s*${playerIdentifier}->sim->dbc->wowv\\(\\)\\s*(<=|>=|==|!=|<|>)\\s*wowv_t\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)\\s*\\)$`,
  );
}

function compareVersions(left, right) {
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

/** Whether `clientVersion <op> guardVersion` holds. Total over the six operators the regex admits. */
function guardHolds(clientVersion, operator, guardVersion) {
  const cmp = compareVersions(clientVersion, guardVersion);
  switch (operator) {
    case "<":
      return cmp < 0;
    case "<=":
      return cmp <= 0;
    case ">":
      return cmp > 0;
    case ">=":
      return cmp >= 0;
    case "==":
      return cmp === 0;
    case "!=":
      return cmp !== 0;
    default:
      return fail(`unsupported version operator '${operator}'`);
  }
}

/** The first line at or after `from` that is neither blank nor a `//` comment, or -1. */
function nextCodeLine(lines, from) {
  for (let i = from; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.length > 0 && !line.startsWith("//")) return i;
  }
  return -1;
}

/**
 * Follows the brace opened on `openIndex` to the line holding the brace that
 * closes it, recording the brace depth at the START of every line on the way.
 *
 * Braces inside `//` and block comments, string literals and character
 * literals are not braces. A raw string literal, an unterminated literal or an
 * unclosed brace fails: a span that cannot be delimited exactly is refused,
 * never guessed.
 */
function braceSpan(lines, openIndex) {
  const depthAtLineStart = new Map();
  let depth = 0;
  let inBlockComment = false;
  for (let i = openIndex; i < lines.length; i += 1) {
    depthAtLineStart.set(i, depth);
    const line = lines[i];
    let j = 0;
    while (j < line.length) {
      if (inBlockComment) {
        const end = line.indexOf("*/", j);
        if (end < 0) {
          j = line.length;
          continue;
        }
        inBlockComment = false;
        j = end + 2;
        continue;
      }
      const char = line[j];
      if (char === "/" && line[j + 1] === "/") break;
      if (char === "/" && line[j + 1] === "*") {
        inBlockComment = true;
        j += 2;
        continue;
      }
      if (char === "R" && line[j + 1] === '"') {
        fail(`line ${i + 1}: a raw string literal cannot be brace-matched by this extractor`);
      }
      if (char === '"' || char === "'") {
        j += 1;
        while (j < line.length && line[j] !== char) j += line[j] === "\\" ? 2 : 1;
        if (j >= line.length) fail(`line ${i + 1}: unterminated literal while matching braces`);
        j += 1;
        continue;
      }
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) return { closeIndex: i, depthAtLineStart };
      }
      j += 1;
    }
  }
  fail(`line ${openIndex + 1}: the brace opened here is never closed`);
  return { closeIndex: -1, depthAtLineStart };
}

/**
 * Which source lines a target's region occupies (M11-C1).
 *
 * Returns `startIndex` / `endIndex` such that the region parser reads the
 * lines strictly between them, and `provenance`: the region provenance the
 * artifact records — the two marker lines for a MARKER target (located
 * exactly as before), or the `regionSelector` for a NAMESPACE_FUNCTION target
 * (M11-C1a). Source coordinates only: nothing here reads what an action
 * string means.
 */
export function locateRegion(lines, target) {
  const hasMarkers = target.regionStart !== undefined || target.regionEnd !== undefined;
  const hasNamespace = target.enclosingNamespace !== undefined;
  const hasClass = target.enclosingClass !== undefined;
  const hasInclude = target.includedBy !== undefined;
  if (Number(hasMarkers) + Number(hasNamespace) + Number(hasClass) + Number(hasInclude) !== 1) {
    fail(
      `target '${target.regionName}' must declare exactly one region selector: regionStart/regionEnd markers, an enclosingNamespace, an enclosingClass, or includedBy`,
    );
  }

  if (hasInclude) {
    // ONB-C1: the whole file is the function body, and verifyInclusion proves that against
    // the hash-pinned including file. A file that names its own function is not this form.
    if (lines.some((line) => line.trim() === target.functionHeader)) {
      fail(`'${target.functionHeader}' occurs inside the included file, so it is not the body alone`);
    }
    return {
      startIndex: -1,
      endIndex: lines.length,
      provenance: {
        regionSelector: {
          kind: "INCLUDED_FILE",
          includingSourcePath: target.includedBy.sourcePath,
          includingSourceSha256: target.includedBy.sha256,
          includeLine: target.includedBy.includeLine,
          functionHeader: target.functionHeader,
        },
      },
    };
  }

  if (hasClass) {
    // ONB-B2: a class method defined at file scope. The header must name that class, and the
    // line must be unindented and occur exactly once, so a declaration or a nested copy cannot
    // be selected.
    if (!target.functionHeader.startsWith(`void ${target.enclosingClass}::`)) {
      fail(`'${target.functionHeader}' does not define a method of ${target.enclosingClass}`);
    }
    const headers = lines.flatMap((line, index) => (line.trim() === target.functionHeader ? [index] : []));
    if (headers.length !== 1) {
      fail(`'${target.functionHeader}' occurs ${String(headers.length)} times; exactly one is required`);
    }
    const headerIndex = headers[0];
    if (lines[headerIndex] !== target.functionHeader) {
      fail(`line ${headerIndex + 1}: '${target.functionHeader}' is not at file scope`);
    }
    const methodBrace = nextCodeLine(lines, headerIndex + 1);
    if (methodBrace < 0 || lines[methodBrace].trim() !== "{") {
      fail(`line ${headerIndex + 1}: the ${target.regionName} method header is not followed by '{'`);
    }
    const methodSpan = braceSpan(lines, methodBrace);
    if (lines[methodSpan.closeIndex].trim() !== "}") {
      fail(
        `line ${methodSpan.closeIndex + 1}: the ${target.regionName} method must close with '}' on its own line`,
      );
    }
    return {
      startIndex: headerIndex - 1,
      endIndex: methodSpan.closeIndex + 1,
      provenance: {
        regionSelector: {
          kind: "CLASS_METHOD",
          enclosingClass: target.enclosingClass,
          functionHeader: target.functionHeader,
        },
      },
    };
  }

  if (hasMarkers) {
    // M11-D2-C: each marker line must occur EXACTLY once. A first match is
    // not a region when a second copy of the marker could bound another one.
    for (const marker of [target.regionStart, target.regionEnd]) {
      const count = lines.filter((line) => line.trim() === marker).length;
      if (count > 1) fail(`region marker ${marker} occurs ${String(count)} times; exactly one is required`);
    }
    const startIndex = lines.findIndex((line) => line.trim() === target.regionStart);
    const endIndex = lines.findIndex((line) => line.trim() === target.regionEnd);
    if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
      fail(`could not locate the bounded region between ${target.regionStart} and ${target.regionEnd}`);
    }
    return {
      startIndex,
      endIndex,
      provenance: { regionStartMarker: target.regionStart, regionEndMarker: target.regionEnd },
    };
  }

  const namespaceLine = `namespace ${target.enclosingNamespace}`;
  const openings = lines.flatMap((line, index) => (line.trim() === namespaceLine ? [index] : []));
  if (openings.length !== 1) {
    fail(`'${namespaceLine}' occurs ${String(openings.length)} times in the source; exactly one is required`);
  }
  const namespaceIndex = openings[0];
  const namespaceBrace = nextCodeLine(lines, namespaceIndex + 1);
  if (namespaceBrace < 0 || lines[namespaceBrace].trim() !== "{") {
    fail(
      `line ${namespaceIndex + 1}: '${namespaceLine}' is not followed by an opening brace on its own line`,
    );
  }
  const namespaceSpan = braceSpan(lines, namespaceBrace);

  const headers = [];
  for (let i = namespaceBrace + 1; i < namespaceSpan.closeIndex; i += 1) {
    if (lines[i].trim() === target.functionHeader) headers.push(i);
  }
  if (headers.length !== 1) {
    fail(
      `'${target.functionHeader}' occurs ${String(headers.length)} times inside '${namespaceLine}'; exactly one is required`,
    );
  }
  const headerIndex = headers[0];
  if (namespaceSpan.depthAtLineStart.get(headerIndex) !== 1) {
    fail(`line ${headerIndex + 1}: '${target.functionHeader}' is not at the scope of '${namespaceLine}'`);
  }
  const functionBrace = nextCodeLine(lines, headerIndex + 1);
  if (functionBrace < 0 || lines[functionBrace].trim() !== "{") {
    fail(
      `line ${headerIndex + 1}: the ${target.regionName} function header is not followed by '{' on its own line`,
    );
  }
  const functionSpan = braceSpan(lines, functionBrace);
  if (lines[functionSpan.closeIndex].trim() !== "}") {
    fail(
      `line ${functionSpan.closeIndex + 1}: the ${target.regionName} function must close with '}' on its own line`,
    );
  }
  return {
    startIndex: headerIndex - 1,
    endIndex: functionSpan.closeIndex + 1,
    provenance: {
      regionSelector: {
        kind: "NAMESPACE_FUNCTION",
        enclosingNamespace: target.enclosingNamespace,
        functionHeader: target.functionHeader,
        playerIdentifier: target.playerIdentifier ?? "p",
      },
    },
  };
}

export function extract(sourceText, target) {
  const playerIdentifier = target.playerIdentifier ?? "p";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(playerIdentifier)) {
    fail(`playerIdentifier '${playerIdentifier}' is not a C++ identifier`);
  }
  if (
    target.enclosingClass === undefined &&
    !new RegExp(`[\\s*&]${playerIdentifier}\\s*\\)$`).test(target.functionHeader)
  ) {
    fail(
      `the ${target.regionName} function header does not take '${playerIdentifier}' as its parameter: ${target.functionHeader}`,
    );
  }
  const lines = sourceText.split(/\r?\n/);
  const region = locateRegion(lines, target);
  const { startIndex, endIndex } = region;
  const VERSION_GUARD = versionGuardPattern(playerIdentifier);
  const TARGET = target;

  const listNameByReceiver = new Map();
  const actionsByList = new Map();
  const listOrder = [];

  // A class method calls its own member, and may give the list a description nothing reads.
  const declaration = new RegExp(
    target.enclosingClass === undefined
      ? `^action_priority_list_t\\*\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*${playerIdentifier}->get_action_priority_list\\(\\s*"([^"]+)"\\s*\\)\\s*;$`
      : `^action_priority_list_t\\*\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*get_action_priority_list\\(\\s*"([^"]+)"(?:\\s*,\\s*"[^"]*")?\\s*\\)\\s*;$`,
  );
  const addActionHead = /^([A-Za-z_][A-Za-z0-9_]*)->add_action\s*\(/;

  // An included file is already inside its function: there is no header and no closing brace.
  const included = target.includedBy !== undefined;
  let sawFunctionHeader = included;
  let braceDepth = included ? 1 : 0;
  const inertDeclared = TARGET.inertStatements ?? [];
  const inertSeen = [];
  const prologueDeclared = TARGET.methodPrologue ?? null;
  let prologueSeen = null;
  const spellGatedDeclared = TARGET.spellGatedActions ?? [];
  const spellGatedSeen = [];

  // ---- version guards (M11-B2) ----
  //
  // `pending` is a guard whose governed statement(s) have not started yet:
  // the next line decides whether it governs a `{ ... }` block or one
  // statement. `active` is a block guard until its closing brace. Both
  // carry `taken`; a statement under a guard that did not hold is parsed
  // for well-formedness and then dropped, and the guard's record counts it.
  const guards = [];
  let pending = null;
  let active = null;
  let lastGuard = null;

  for (let i = startIndex + 1; i < endIndex; i += 1) {
    const rawLine = lines[i];
    const lineNumber = i + 1;
    const line = rawLine.trim();

    if (line.length === 0) continue;
    if (line.startsWith("//")) continue;

    if (!sawFunctionHeader) {
      if (line === TARGET.functionHeader) {
        sawFunctionHeader = true;
        continue;
      }
      fail(
        `line ${lineNumber}: unexpected construct before the ${TARGET.regionName} function header: ${line}`,
      );
    }

    // ONB-B2: the guard a class method opens on, by exact text and before anything else. Any
    // other `if`, or this one anywhere later, is still an unsupported construct below.
    if (
      prologueDeclared !== null &&
      prologueSeen === null &&
      braceDepth === 1 &&
      listOrder.length === 0 &&
      line === prologueDeclared.lines[0]
    ) {
      const span = prologueDeclared.lines.length;
      for (let offset = 0; offset < span; offset += 1) {
        if ((lines[i + offset] ?? "").trim() !== prologueDeclared.lines[offset]) {
          fail(
            `line ${lineNumber + offset}: the declared method prologue does not match: ${lines[i + offset]}`,
          );
        }
      }
      prologueSeen = { startLine: lineNumber, endLine: lineNumber + span - 1 };
      i += span - 1;
      continue;
    }

    const guard = VERSION_GUARD.exec(line);
    if (guard !== null) {
      const [, elseKeyword, operator, a, b, c] = guard;
      if (TARGET.clientVersion === undefined) {
        fail(
          `line ${lineNumber}: a client-version guard exists in the ${TARGET.regionName} region and the target declares no clientVersion to evaluate it against: ${line}`,
        );
      }
      if (pending !== null)
        fail(`line ${lineNumber}: a version guard follows another with no governed statement`);
      if (active !== null) fail(`line ${lineNumber}: nested version guards are not supported`);
      if (elseKeyword !== undefined && (lastGuard === null || lastGuard.endLine === null)) {
        fail(`line ${lineNumber}: 'else if' with no preceding closed version guard`);
      }
      const guardVersion = [Number(a), Number(b), Number(c)];
      const taken = guardHolds(TARGET.clientVersion, operator, guardVersion);
      const record = {
        line: lineNumber,
        form: elseKeyword === undefined ? "IF" : "ELSE_IF",
        comparison: `wowv() ${operator} ${guardVersion.join(".")}`,
        clientVersion: TARGET.clientVersion.join("."),
        holds: taken,
        statementsEmitted: 0,
        statementsDropped: 0,
        endLine: null,
      };
      guards.push(record);
      pending = record;
      lastGuard = record;
      continue;
    }

    if (line === "{") {
      braceDepth += 1;
      if (pending !== null) {
        active = { record: pending, depth: braceDepth };
        pending = null;
      }
      continue;
    }
    if (line === "}") {
      if (pending !== null) fail(`line ${lineNumber}: a version guard governs no statement`);
      if (active !== null && active.depth === braceDepth) {
        active.record.endLine = lineNumber;
        active = null;
      }
      braceDepth -= 1;
      if (braceDepth < 0) fail(`line ${lineNumber}: unbalanced closing brace`);
      continue;
    }

    // The guard governing THIS line, if any: a block guard, or a pending
    // single-statement guard, which this line closes.
    let governing = active === null ? null : active.record;
    if (pending !== null) {
      governing = pending;
      governing.endLine = lineNumber;
      pending = null;
    }

    const declared = declaration.exec(line);
    if (declared !== null) {
      const [, receiver, listName] = declared;
      if (listNameByReceiver.has(receiver)) {
        fail(`line ${lineNumber}: receiver ${receiver} declared twice`);
      }
      if (listOrder.includes(listName)) {
        fail(`line ${lineNumber}: list ${listName} declared twice`);
      }
      listNameByReceiver.set(receiver, listName);
      actionsByList.set(listName, []);
      listOrder.push(listName);
      continue;
    }

    const added = addActionHead.exec(line);
    if (added !== null) {
      const receiver = added[1];
      const listName = listNameByReceiver.get(receiver);
      if (listName === undefined) {
        fail(`line ${lineNumber}: add_action on undeclared receiver '${receiver}'`);
      }
      const openParen = line.indexOf("(", added[0].length - 1);
      // ONB-B2: the spell-gated form emits only under the player's own spell data. It is
      // never parsed as a list line: each statement is declared by exact text, and its
      // outcome is decided by the proofs the pinned preflight checks.
      if (/^\s*this\s*,/.test(line.slice(openParen + 1))) {
        const declaredForm = spellGatedDeclared.find((form) => form.statement === line);
        if (declaredForm === undefined) {
          fail(`line ${lineNumber}: undeclared spell-gated add_action: ${line}`);
        }
        if (governing !== null) fail(`line ${lineNumber}: a spell-gated add_action under a version guard`);
        spellGatedSeen.push({
          sourceLine: lineNumber,
          statement: line,
          spellName: declaredForm.spellName,
          emitted: declaredForm.emitted,
        });
        if (declaredForm.emitted !== null) {
          const gatedBucket = actionsByList.get(listName);
          gatedBucket.push({
            priorityOrdinal: gatedBucket.length,
            actionStringVerbatim: declaredForm.emitted,
            comment: null,
            sourceLine: lineNumber,
          });
        }
        continue;
      }
      const parsed = parseAddActionArguments(line, openParen, lineNumber);
      if (governing !== null && !governing.holds) {
        // Well-formed, parsed, and NOT the authority at this client version.
        governing.statementsDropped += 1;
        continue;
      }
      if (governing !== null) governing.statementsEmitted += 1;
      const bucket = actionsByList.get(listName);
      bucket.push({
        priorityOrdinal: bucket.length,
        actionStringVerbatim: parsed.actionStringVerbatim,
        comment: parsed.comment,
        sourceLine: lineNumber,
      });
      continue;
    }

    if (governing !== null) {
      fail(`line ${lineNumber}: a version guard may govern only add_action statements: ${line}`);
    }

    // A statement THIS target declares inert, by exact text (M11-D2-C). Its
    // per-region conditions are checked after the walk; its proof sources by
    // the pinned preflight.
    if (inertDeclared.some((inert) => inert.statement === line)) {
      if (braceDepth !== 1)
        fail(`line ${lineNumber}: an inert statement must sit at function scope: ${line}`);
      inertSeen.push({ sourceLine: lineNumber, statement: line });
      continue;
    }

    // Reached only by a construct this extractor does not model. Failing here is
    // the contract: a silently skipped line produces a complete-looking artifact
    // with a missing action, and every reachability proof built on it is void.
    fail(`line ${lineNumber}: unsupported construct inside the ${TARGET.regionName} region: ${line}`);
  }

  if (!sawFunctionHeader) fail(`${TARGET.regionName} function header not found inside the region`);
  if (braceDepth !== (included ? 1 : 0)) fail(`unbalanced braces inside the ${TARGET.regionName} region`);
  if (pending !== null || active !== null) fail(`a version guard is left open at the end of the region`);
  if (prologueDeclared !== null && prologueSeen === null) {
    fail(`the declared method prologue does not open the ${TARGET.regionName} method`);
  }
  for (const form of spellGatedDeclared) {
    const count = spellGatedSeen.filter((seen) => seen.statement === form.statement).length;
    if (count !== 1) {
      fail(`spell-gated statement occurs ${String(count)} times; exactly one is required: ${form.statement}`);
    }
  }

  // Each declared inert statement: exactly once in THIS region, and its
  // identifier on no other region line — a later read, however indirect,
  // would make it not inert, so any mention refuses the region.
  const inertStatements = [];
  for (const inert of inertDeclared) {
    const seen = inertSeen.filter((entry) => entry.statement === inert.statement);
    if (seen.length !== 1) {
      fail(
        `inert statement occurs ${String(seen.length)} times in the ${TARGET.regionName} region; exactly one is required: ${inert.statement}`,
      );
    }
    const mention = new RegExp(`\\b${inert.identifier}\\b`);
    for (let i = startIndex + 1; i < endIndex; i += 1) {
      if (i + 1 === seen[0].sourceLine) continue;
      if (mention.test(lines[i])) {
        fail(
          `line ${i + 1}: '${inert.identifier}' is referenced after its inert declaration: ${lines[i].trim()}`,
        );
      }
    }
    inertStatements.push({
      sourceLine: seen[0].sourceLine,
      statement: inert.statement,
      identifier: inert.identifier,
    });
  }

  return {
    lists: listOrder.map((listName) => ({
      listName,
      receiverIdentifier: [...listNameByReceiver.entries()].find(([, name]) => name === listName)[0],
      actions: actionsByList.get(listName),
    })),
    guards,
    regionProvenance: region.provenance,
    // The region's own bytes, marker lines included, LF-joined (M11-D2-C).
    regionSha256: sha256Of(lines.slice(Math.max(startIndex, 0), endIndex + 1).join("\n")),
    ...(inertDeclared.length === 0 ? {} : { inertStatements }),
    ...(prologueSeen === null
      ? {}
      : { methodPrologue: { ...prologueSeen, appliesWhen: prologueDeclared.appliesWhen } }),
    ...(spellGatedSeen.length === 0 ? {} : { spellGatedActions: spellGatedSeen }),
  };
}

function sha256Of(value) {
  return createHash("sha256").update(value).digest("hex");
}

// --------------------------------------------------------------------------
// Derivations used only to VERIFY the required facts. The artifact stores none
// of them; the runtime re-derives them from `actionStringVerbatim`.
// --------------------------------------------------------------------------

function actionTokenOf(actionString) {
  const comma = actionString.indexOf(",");
  return comma < 0 ? actionString : actionString.slice(0, comma);
}

function conditionOf(actionString) {
  const marker = ",if=";
  const at = actionString.indexOf(marker);
  if (at < 0) return null;
  if (actionString.indexOf(marker, at + 1) >= 0) {
    fail(`action string carries more than one ',if=' and is ambiguous: ${actionString}`);
  }
  return actionString.slice(at + marker.length);
}

function callsListOf(actionString) {
  const token = actionTokenOf(actionString);
  if (token !== "call_action_list" && token !== "run_action_list") return null;
  const match = /(?:^|,)name=([A-Za-z_][A-Za-z0-9_]*)/.exec(actionString);
  if (match === null) fail(`${token} without a name= parameter: ${actionString}`);
  return match[1];
}

export function verifyRequiredFacts(artifact, target) {
  const REQUIRED_FACTS = target.requiredFacts;
  const byName = new Map(artifact.lists.map((list) => [list.listName, list]));
  const problems = [];

  for (const required of REQUIRED_FACTS.requiredLists) {
    if (!byName.has(required)) problems.push(`missing required list '${required}'`);
  }
  if (artifact.entryListName !== REQUIRED_FACTS.entryListName) {
    problems.push(`entry list is '${artifact.entryListName}'`);
  }

  if (REQUIRED_FACTS.kind === "PROTECTION_STRUCTURE") {
    // Structural facts only: no call_action_list / run_action_list anywhere,
    // and each named action exactly once in `default`. Nothing about which
    // action wins — that is not this milestone's claim.
    for (const list of artifact.lists) {
      for (const action of list.actions) {
        if (REQUIRED_FACTS.noListDispatch && callsListOf(action.actionStringVerbatim) !== null) {
          problems.push(`list dispatch found in '${list.listName}': ${action.actionStringVerbatim}`);
        }
        const token = actionTokenOf(action.actionStringVerbatim);
        if (token === "run_action_list" || token === "swap_action_list") {
          problems.push(`unmodelled dispatch '${token}' found in '${list.listName}'`);
        }
      }
    }
    const defaults = byName.get("default");
    for (const required of REQUIRED_FACTS.exactlyOnceInDefault) {
      const count = (defaults?.actions ?? []).filter(
        (action) => actionTokenOf(action.actionStringVerbatim) === required,
      ).length;
      if (count !== 1)
        problems.push(`'${required}' appears ${count} times in default, expected exactly once`);
    }
    return problems;
  }

  if (REQUIRED_FACTS.kind === "DISPATCH_GRAPH") {
    // GENERIC (M11-B2). The target supplies the whole expected topology —
    // every list's size and every dispatch edge with its kind, coordinates and
    // verbatim gate — and this block compares, in full, both ways. It reads
    // no token semantics: which list a run enters or what a gate means is the
    // target's data, never this code's opinion. A run edge and a call edge
    // are different kinds and never match each other.
    for (const [listName, size] of Object.entries(REQUIRED_FACTS.listSizes)) {
      const actual = byName.get(listName)?.actions.length ?? null;
      if (actual !== size) {
        problems.push(`list '${listName}' has ${String(actual)} entries, expected ${String(size)}`);
      }
    }
    for (const list of artifact.lists) {
      if (!(list.listName in REQUIRED_FACTS.listSizes)) {
        problems.push(`list '${list.listName}' is not in the pinned topology`);
      }
    }
    const actualEdges = [];
    for (const list of artifact.lists) {
      list.actions.forEach((action, ordinal) => {
        const token = actionTokenOf(action.actionStringVerbatim);
        if ((REQUIRED_FACTS.forbiddenTokens ?? []).includes(token)) {
          problems.push(`forbidden token '${token}' found in '${list.listName}'`);
        }
        if (
          REQUIRED_FACTS.noTargetingOptions &&
          /(?:^|,)(?:target_if|cycle_targets)=/.test(action.actionStringVerbatim)
        ) {
          problems.push(`targeting option found in '${list.listName}': ${action.actionStringVerbatim}`);
        }
        const kind = token === "call_action_list" ? "CALL" : token === "run_action_list" ? "RUN" : null;
        if (kind === null) return;
        actualEdges.push({
          from: list.listName,
          ordinal,
          kind,
          to: callsListOf(action.actionStringVerbatim),
          condition: conditionOf(action.actionStringVerbatim),
        });
      });
    }
    const key = (edge) =>
      `${edge.from}[${String(edge.ordinal)}] ${edge.kind} -> ${edge.to} if=${JSON.stringify(edge.condition)}`;
    const expected = REQUIRED_FACTS.edges.map(key);
    const actual = actualEdges.map(key);
    if (expected.join("\n") !== actual.join("\n")) {
      problems.push(
        `dispatch graph differs from the pinned topology\n  expected:\n    ${expected.join("\n    ")}\n  actual:\n    ${actual.join("\n    ")}`,
      );
    }
    for (const edge of actualEdges) {
      if (!byName.has(edge.to))
        problems.push(`dispatch edge ${key(edge)} names a list the region does not declare`);
    }
    return problems;
  }

  if (REQUIRED_FACTS.kind === "RETRIBUTION_CALL_GRAPH") {
    for (const list of artifact.lists) {
      for (const action of list.actions) {
        const token = actionTokenOf(action.actionStringVerbatim);
        if (token === "run_action_list" || token === "swap_action_list") {
          problems.push(`unmodelled dispatch '${token}' found in '${list.listName}'`);
        }
        if (/(?:^|,)(?:target_if|cycle_targets)=/.test(action.actionStringVerbatim)) {
          problems.push(`targeting option found in '${list.listName}': ${action.actionStringVerbatim}`);
        }
      }
    }
    const defaults = byName.get("default");
    const calls = (defaults?.actions ?? [])
      .map((action) => callsListOf(action.actionStringVerbatim))
      .filter((name) => name !== null);
    if (calls.join(",") !== REQUIRED_FACTS.defaultOrder.join(",")) {
      problems.push(
        `default list calls [${calls.join(", ")}], expected [${REQUIRED_FACTS.defaultOrder.join(", ")}]`,
      );
    }
    // Every call into `finishers`, anywhere, must be one of the two pinned ones.
    const finisherCalls = [];
    for (const list of artifact.lists) {
      list.actions.forEach((action, ordinal) => {
        if (callsListOf(action.actionStringVerbatim) === "finishers") {
          finisherCalls.push({
            list: list.listName,
            ordinal,
            condition: conditionOf(action.actionStringVerbatim),
          });
        }
      });
    }
    const expectedCalls = REQUIRED_FACTS.finishersCalls;
    if (JSON.stringify(finisherCalls) !== JSON.stringify(expectedCalls)) {
      problems.push(
        `finishers is called as ${JSON.stringify(finisherCalls)}, expected ${JSON.stringify(expectedCalls)}`,
      );
    }
    // The spenders appear ONLY in `finishers`, once each, in order, with the pinned gates.
    for (const spender of REQUIRED_FACTS.finishersSpenders) {
      const occurrences = [];
      for (const list of artifact.lists) {
        for (const action of list.actions) {
          if (actionTokenOf(action.actionStringVerbatim) === spender.token) {
            occurrences.push({ list: list.listName, condition: conditionOf(action.actionStringVerbatim) });
          }
        }
      }
      if (
        occurrences.length !== 1 ||
        occurrences[0].list !== "finishers" ||
        occurrences[0].condition !== spender.condition
      ) {
        problems.push(
          `'${spender.token}' occurrences ${JSON.stringify(occurrences)}, expected once in finishers with condition ${JSON.stringify(spender.condition)}`,
        );
      }
    }
    const finishers = byName.get("finishers");
    const spenderTokens = (finishers?.actions ?? [])
      .map((action) => actionTokenOf(action.actionStringVerbatim))
      .filter((token) => REQUIRED_FACTS.finishersSpenders.some((spender) => spender.token === token));
    if (
      spenderTokens.join(",") !== REQUIRED_FACTS.finishersSpenders.map((spender) => spender.token).join(",")
    ) {
      problems.push(`finishers spender order is [${spenderTokens.join(", ")}]`);
    }
    // `variable.ds_castable` is assigned exactly once, in `finishers`, with the pinned value.
    const dsAssignments = [];
    for (const list of artifact.lists) {
      for (const action of list.actions) {
        if (/^variable,name=ds_castable(?:,|$)/.test(action.actionStringVerbatim)) {
          const value = /(?:^|,)value=(.*)$/.exec(action.actionStringVerbatim)?.[1] ?? null;
          dsAssignments.push({ list: list.listName, value });
        }
      }
    }
    if (
      dsAssignments.length !== 1 ||
      dsAssignments[0].list !== "finishers" ||
      dsAssignments[0].value !== REQUIRED_FACTS.dsCastableValue
    ) {
      problems.push(`variable ds_castable assignments ${JSON.stringify(dsAssignments)}`);
    }
    // Reset-only variables: assigned in precombat with op=reset and nowhere else.
    for (const name of REQUIRED_FACTS.resetOnlyVariables) {
      const assignments = [];
      for (const list of artifact.lists) {
        for (const action of list.actions) {
          if (new RegExp(`^variable,name=${name}(?:,|$)`).test(action.actionStringVerbatim)) {
            assignments.push({ list: list.listName, action: action.actionStringVerbatim });
          }
        }
      }
      const only = assignments[0];
      if (
        assignments.length !== 1 ||
        only.list !== "precombat" ||
        !/,op=reset,default=0$/.test(only.action)
      ) {
        problems.push(
          `variable '${name}' assignments ${JSON.stringify(assignments)}, expected one precombat reset`,
        );
      }
    }
    return problems;
  }

  const defaultList = byName.get("default");
  if (defaultList === undefined) {
    problems.push("no default list");
  } else {
    const calls = defaultList.actions
      .map((action) => callsListOf(action.actionStringVerbatim))
      .filter((name) => name !== null);
    const expected = REQUIRED_FACTS.defaultOrder;
    const filtered = calls.filter((name) => expected.includes(name));
    if (filtered.join(",") !== expected.join(",")) {
      problems.push(`default list call order is [${filtered.join(", ")}], expected [${expected.join(", ")}]`);
    }

    const spendCall = defaultList.actions.find(
      (action) => callsListOf(action.actionStringVerbatim) === "spend",
    );
    const generateCall = defaultList.actions.find(
      (action) => callsListOf(action.actionStringVerbatim) === "generate",
    );
    if (spendCall === undefined) problems.push("default does not call spend");
    else {
      const condition = conditionOf(spendCall.actionStringVerbatim);
      if (condition !== REQUIRED_FACTS.spendCallCondition) {
        problems.push(
          `spend call condition is:\n    ${condition}\n  expected:\n    ${REQUIRED_FACTS.spendCallCondition}`,
        );
      }
    }
    if (generateCall === undefined) problems.push("default does not call generate");
    else {
      const condition = conditionOf(generateCall.actionStringVerbatim);
      if (condition !== REQUIRED_FACTS.generateCallCondition) {
        problems.push(
          `generate call condition is:\n    ${condition}\n  expected:\n    ${REQUIRED_FACTS.generateCallCondition}`,
        );
      }
    }
  }

  const envenomLists = new Set();
  const crimsonTempestLists = new Set();
  for (const list of artifact.lists) {
    for (const action of list.actions) {
      const token = actionTokenOf(action.actionStringVerbatim);
      if (token === "envenom") envenomLists.add(list.listName);
      if (token === "crimson_tempest") crimsonTempestLists.add(list.listName);
    }
  }
  if (envenomLists.size !== 1 || !envenomLists.has(REQUIRED_FACTS.envenomOnlyInList)) {
    problems.push(`envenom appears in lists [${[...envenomLists].join(", ")}]`);
  }
  if (!crimsonTempestLists.has(REQUIRED_FACTS.crimsonTempestInList)) {
    problems.push(`crimson_tempest not found in '${REQUIRED_FACTS.crimsonTempestInList}'`);
  }

  return problems;
}

/**
 * The artifact, from an extracted region and the run's coordinates.
 *
 * Exported (M11-C1a) so the provenance form can be validated against the
 * runtime schema without the pinned checkout. The region provenance sits
 * exactly where the two marker fields always sat, so a MARKER target's
 * artifact is byte-for-byte what it was; a NAMESPACE_FUNCTION target's
 * carries `regionSelector` there instead, and no marker field.
 */
export function buildArtifact({
  target,
  extracted,
  sourceSha256,
  sourceByteLength,
  sha,
  branch,
  commitDate,
  extractedOn,
}) {
  return {
    artifactVersion: ARTIFACT_VERSION,
    authorityId: target.authorityId,
    artifactRevision: `simc-${String(sha ?? "local").slice(0, 8)}-${EXTRACTOR_VERSION}`,
    spec: target.spec,
    entryListName: "default",
    provenance: {
      repository: REPOSITORY,
      branch,
      commitSha: sha ?? "UNKNOWN",
      commitDate,
      sourcePath: target.sourcePath,
      sourceSha256,
      sourceByteLength,
      ...extracted.regionProvenance,
      extractedOn,
      extractorVersion: EXTRACTOR_VERSION,
      ...(target.clientVersion === undefined
        ? {}
        : {
            // M11-B2: what the extractor DECIDED about the region's version
            // guards, so a reader of the artifact can see that a dead branch was
            // excluded rather than absent from the source.
            conditionalCompilation: {
              clientVersion: target.clientVersion.join("."),
              guards: extracted.guards,
            },
          }),
      ...(target.pinnedSource === undefined
        ? {}
        : {
            // M11-D2-C: what ties a PINNED target's artifact back to its
            // record — the region's bytes, the live/PTR policy that chose
            // the region, the class module that dispatches to it, and every
            // statement the region parser was told to treat as inert.
            regionSha256: extracted.regionSha256,
            livePtrPolicy: target.livePtrPolicy.kind,
            dispatchSource: { sourcePath: target.dispatch.sourcePath, sourceSha256: target.dispatch.sha256 },
            ...(extracted.inertStatements === undefined
              ? {}
              : { inertStatements: extracted.inertStatements }),
            ...(extracted.methodPrologue === undefined ? {} : { methodPrologue: extracted.methodPrologue }),
            ...(extracted.spellGatedActions === undefined
              ? {}
              : { spellGatedActions: extracted.spellGatedActions }),
          }),
    },
    lists: extracted.lists,
  };
}

// --------------------------------------------------------------------------
// PINNED BATCH PREFLIGHT (M11-D2-C)
//
// A PINNED target carries, besides its coordinates, the exact bytes it was
// recorded against: its module's SHA-256 and length, its region's SHA-256, a
// live/PTR policy, the class-module dispatch that calls its function, and any
// statement it declares inert with the hash-pinned proof of it. The preflight
// checks every one of those against a local source root and reads nothing
// else. C++ is text here: nothing is compiled, evaluated or executed.
//
// A batch is ATOMIC. Every selected target is preflighted and every artifact
// built in memory first; if ANY target or the batch itself fails, nothing is
// written. `--check` writes nothing even when everything passes.
// --------------------------------------------------------------------------

export const LIVE_PTR_POLICIES = Object.freeze([
  "NO_PTR_REGION",
  "PTR_MARKERS_EMPTY",
  "PTR_STUB_NEVER_DISPATCHED",
  "PTR_BODY_IDENTICAL",
  "PTR_BODY_DIFFERS",
  "PTR_SEPARATE_INCLUDE",
]);

const MARKER_LINE = /^\/\/[a-z][a-z0-9_]*_apl_(?:start|end)$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const COMMIT_HEX = /^[0-9a-f]{40}$/;
const LIVE_FUNCTION_HEADER = /^void ([A-Za-z_][A-Za-z0-9_]*)\( player_t\* p \)$/;
const CLASS_METHOD_HEADER = /^void [A-Za-z_][A-Za-z0-9_]*::([A-Za-z_][A-Za-z0-9_]*)\(\)$/;

/** The function a pinned target's region defines: `[, name]`, or `null` when the header is neither form. */
function liveFunctionOf(target) {
  return (target.enclosingClass === undefined ? LIVE_FUNCTION_HEADER : CLASS_METHOD_HEADER).exec(
    target.functionHeader ?? "",
  );
}
const PROOF_CHECK_KINDS = ["FUNCTION_BODY_SHA256", "LINE_EXACTLY_ONCE", "TOKEN_ABSENT"];

/**
 * One relative source path, resolved inside the source root. Absolute paths,
 * drive letters, backslashes and empty, `.` or `..` segments are refused
 * before anything touches the filesystem.
 */
export function confinedSourcePath(sourceRoot, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    fail("a source path must be a non-empty string");
  }
  if (relativePath.includes("\\") || isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) {
    fail(`source path '${relativePath}' must be relative to the source root and use '/'`);
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail(`source path '${relativePath}' has an empty, '.' or '..' segment`);
  }
  const root = resolve(sourceRoot);
  const full = resolve(root, ...segments);
  const inside = relative(root, full);
  if (inside.startsWith("..") || isAbsolute(inside)) {
    fail(`source path '${relativePath}' escapes the source root`);
  }
  return full;
}

/**
 * A reader over one source root: the bytes of a confined path, or `null` when
 * the file does not exist. A path whose real location (symlinks followed)
 * leaves the root is refused, not read.
 */
export function sourceRootReader(sourceRoot) {
  if (typeof sourceRoot !== "string" || !existsSync(sourceRoot)) {
    fail(`source root '${String(sourceRoot)}' does not exist`);
  }
  const root = realpathSync(resolve(sourceRoot));
  return (relativePath) => {
    const full = confinedSourcePath(root, relativePath);
    if (!existsSync(full)) return null;
    const real = realpathSync(full);
    const inside = relative(root, real);
    if (inside.startsWith("..") || isAbsolute(inside)) {
      fail(`source path '${relativePath}' resolves outside the source root`);
    }
    return readFileSync(real);
  };
}

function isPinnedFile(record) {
  return (
    record !== null &&
    typeof record === "object" &&
    typeof record.sourcePath === "string" &&
    typeof record.sha256 === "string" &&
    SHA256_HEX.test(record.sha256) &&
    Number.isInteger(record.byteLength) &&
    record.byteLength > 0
  );
}

/** The record's own shape, before any byte is read. Problems, never a throw. */
export function validatePinnedRecord(targetName, target) {
  const problems = [];
  const pinned = target.pinnedSource;
  if (!isPinnedFile(pinned)) problems.push(`MALFORMED_RECORD: '${targetName}' pinnedSource is incomplete`);
  else {
    if (typeof pinned.commitSha !== "string" || !COMMIT_HEX.test(pinned.commitSha)) {
      problems.push(`MISSING_COMMIT: '${targetName}' pinnedSource names no 40-character commit`);
    }
    if (typeof pinned.regionSha256 !== "string" || !SHA256_HEX.test(pinned.regionSha256)) {
      problems.push(`MALFORMED_RECORD: '${targetName}' pinnedSource names no region SHA-256`);
    }
    if (pinned.sourcePath !== target.sourcePath) {
      problems.push(
        `MODULE_MISMATCH: '${targetName}' reads ${target.sourcePath} but is pinned to ${pinned.sourcePath}`,
      );
    }
  }
  if (target.includedBy !== undefined) {
    if (!isPinnedFile(target.includedBy) || typeof target.includedBy.includeLine !== "string") {
      problems.push(`MALFORMED_RECORD: '${targetName}' includedBy is incomplete`);
    }
  }
  const markerFields =
    target.enclosingClass === undefined && target.includedBy === undefined
      ? [
          ["regionStart", target.regionStart, "_start"],
          ["regionEnd", target.regionEnd, "_end"],
        ]
      : [];
  for (const [field, marker, suffix] of markerFields) {
    if (typeof marker !== "string" || !MARKER_LINE.test(marker) || !marker.endsWith(suffix)) {
      problems.push(
        `MALFORMED_MARKER: '${targetName}' ${field} '${String(marker)}' is not a //<name>_apl${suffix} line`,
      );
    }
  }
  if (
    typeof target.regionStart === "string" &&
    typeof target.regionEnd === "string" &&
    target.regionStart.replace(/_start$/, "") !== target.regionEnd.replace(/_end$/, "")
  ) {
    problems.push(`MALFORMED_MARKER: '${targetName}' start and end markers name different regions`);
  }
  const live = liveFunctionOf(target);
  if (live === null) {
    problems.push(
      target.enclosingClass === undefined
        ? `MALFORMED_RECORD: '${targetName}' functionHeader is not 'void <name>( player_t* p )'`
        : `MALFORMED_RECORD: '${targetName}' functionHeader is not 'void <class>::<name>()'`,
    );
  }
  const policy = target.livePtrPolicy;
  if (policy === undefined || !LIVE_PTR_POLICIES.includes(policy.kind)) {
    problems.push(`MALFORMED_POLICY: '${targetName}' declares no known live/PTR policy`);
  } else if ((policy.kind === "PTR_SEPARATE_INCLUDE") !== (target.includedBy !== undefined)) {
    problems.push(`MALFORMED_POLICY: '${targetName}' PTR_SEPARATE_INCLUDE and includedBy go together`);
  } else if (live !== null && policy.kind === "PTR_SEPARATE_INCLUDE") {
    if (policy.ptrFunctionHeader !== `void ${live[1]}_ptr( player_t* p )`) {
      problems.push(`MALFORMED_POLICY: '${targetName}' PTR function header does not name ${live[1]}_ptr`);
    }
    if (
      typeof policy.ptrIncludeLine !== "string" ||
      policy.ptrIncludeLine === target.includedBy.includeLine
    ) {
      problems.push(`MALFORMED_POLICY: '${targetName}' names no separate PTR include`);
    }
  } else if (live !== null) {
    if (
      policy.ptrRegionStart !== `//${live[1]}_ptr_apl_start` ||
      policy.ptrRegionEnd !== `//${live[1]}_ptr_apl_end`
    ) {
      problems.push(`MALFORMED_POLICY: '${targetName}' PTR markers do not name the ${live[1]}_ptr region`);
    }
    const expectedPtrHeader =
      policy.kind === "PTR_STUB_NEVER_DISPATCHED"
        ? `void ${live[1]}_ptr( player_t* )`
        : target.enclosingClass === undefined
          ? `void ${live[1]}_ptr( player_t* p )`
          : `void ${target.enclosingClass}::${live[1]}_ptr()`;
    if (policy.ptrFunctionHeader !== expectedPtrHeader) {
      problems.push(`MALFORMED_POLICY: '${targetName}' PTR function header does not name ${live[1]}_ptr`);
    }
  }
  const dispatch = target.dispatch;
  if (
    !isPinnedFile(dispatch) ||
    typeof dispatch.functionHeader !== "string" ||
    !Array.isArray(dispatch.sequence) ||
    dispatch.sequence.length === 0 ||
    dispatch.sequence.some((line) => typeof line !== "string" || line.length === 0 || line.trim() !== line)
  ) {
    problems.push(`MALFORMED_DISPATCH: '${targetName}' dispatch record is incomplete`);
  } else if (live !== null && target.includedBy !== undefined) {
    if (dispatch.sequence.filter((line) => line.includes(`::${live[1]}( this );`)).length !== 1) {
      problems.push(
        `MALFORMED_DISPATCH: '${targetName}' dispatch sequence does not call ${live[1]}( this ) exactly once`,
      );
    }
  } else if (live !== null) {
    const call =
      target.enclosingClass === undefined
        ? // ONB-D2: Elemental's dispatch chooses its live function in one ternary.
          new RegExp(
            `^(?:is_ptr\\(\\) \\? [A-Za-z_][A-Za-z0-9_]*::${live[1]}_ptr\\( this \\) : )?[A-Za-z_][A-Za-z0-9_]*::${live[1]}\\( this \\);$`,
          )
        : new RegExp(`^${live[1]}\\(\\);$`);
    if (dispatch.sequence.filter((line) => call.test(line)).length !== 1) {
      problems.push(
        `MALFORMED_DISPATCH: '${targetName}' dispatch sequence does not call ${live[1]}( this ) exactly once`,
      );
    }
  }
  for (const inert of target.inertStatements ?? []) {
    if (
      typeof inert.statement !== "string" ||
      typeof inert.identifier !== "string" ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(inert.identifier) ||
      !inert.statement.includes(inert.identifier) ||
      !Array.isArray(inert.proofs) ||
      inert.proofs.length === 0 ||
      inert.proofs.some(
        (proof) =>
          !isPinnedFile(proof) ||
          !Array.isArray(proof.checks) ||
          proof.checks.length === 0 ||
          proof.checks.some((check) => !PROOF_CHECK_KINDS.includes(check.kind)),
      )
    ) {
      problems.push(
        `MALFORMED_INERT: '${targetName}' declares an inert statement without a complete pinned proof`,
      );
    }
  }
  for (const form of target.spellGatedActions ?? []) {
    if (
      typeof form.statement !== "string" ||
      typeof form.spellName !== "string" ||
      !form.statement.includes(`"${form.spellName}"`) ||
      !(form.emitted === null || typeof form.emitted === "string") ||
      !Array.isArray(form.proofs) ||
      form.proofs.length === 0 ||
      form.proofs.some(
        (proof) =>
          !isPinnedFile(proof) ||
          !Array.isArray(proof.checks) ||
          proof.checks.length === 0 ||
          proof.checks.some((check) => !PROOF_CHECK_KINDS.includes(check.kind)),
      )
    ) {
      problems.push(
        `MALFORMED_SPELL_GATED: '${targetName}' declares a spell-gated statement without a complete pinned proof`,
      );
    }
  }
  return problems;
}

/** The pinned file's bytes, or a problem: missing, or not the recorded bytes. */
function readPinned(read, record, role, problems) {
  let bytes;
  try {
    bytes = read(record.sourcePath);
  } catch (error) {
    if (!(error instanceof ExtractionError)) throw error;
    problems.push(`PATH_REFUSED: ${role} ${error.message}`);
    return null;
  }
  if (bytes === null) {
    problems.push(`MISSING_SOURCE: ${role} ${record.sourcePath} is not under the source root`);
    return null;
  }
  const sha256 = sha256Of(bytes);
  if (sha256 !== record.sha256 || bytes.length !== record.byteLength) {
    problems.push(
      `SOURCE_SHA256_MISMATCH: ${role} ${record.sourcePath} is ${sha256} (${String(bytes.length)} bytes), pinned ${record.sha256} (${String(record.byteLength)} bytes)`,
    );
    return null;
  }
  return bytes;
}

/** The lines of the one function whose header line equals `header`, header to closing brace. */
function functionBody(lines, header) {
  const headers = lines.flatMap((line, index) => (line.trim() === header ? [index] : []));
  if (headers.length !== 1)
    fail(`'${header}' occurs ${String(headers.length)} times; exactly one is required`);
  const open = nextCodeLine(lines, headers[0] + 1);
  if (open < 0 || lines[open].trim() !== "{") fail(`'${header}' is not followed by '{' on its own line`);
  return lines.slice(headers[0], braceSpan(lines, open).closeIndex + 1);
}

function countLines(lines, text) {
  return lines.filter((line) => line.trim() === text).length;
}

/** The live/PTR relationship the target declares, checked against the module and its dispatch. */
export function verifyLivePtrPolicy(lines, dispatchText, target, includerText = null) {
  const policy = target.livePtrPolicy;
  const name = liveFunctionOf(target)[1];
  if (policy.kind === "PTR_SEPARATE_INCLUDE") {
    // ONB-C1: the PTR list is another file, and the dispatch chooses between the two with
    // is_ptr(). A live build takes the live branch, so the PTR file is neither read nor needed.
    // The choice must be that one ternary, and the two functions must include different files.
    const ptrBody = functionBody((includerText ?? "").split(/\r?\n/), policy.ptrFunctionHeader)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (!ptrBody.includes(policy.ptrIncludeLine)) {
      fail(`POLICY_VIOLATED: ${policy.ptrFunctionHeader} does not include ${policy.ptrIncludeLine}`);
    }
    const ternary = `is_ptr() ? ${target.dispatch.sequence[0].split("is_ptr() ? ")[1]?.split(" : ")[0]} : `;
    if (dispatchText.split(ternary).length !== 2) {
      fail(`POLICY_VIOLATED: the dispatch must choose ${name} by one is_ptr() ternary`);
    }
    return;
  }
  const starts = countLines(lines, policy.ptrRegionStart);
  const ends = countLines(lines, policy.ptrRegionEnd);
  const ptrDefinitions = lines.filter((line) =>
    line.trim().startsWith(`${policy.ptrFunctionHeader.split("(")[0]}(`),
  ).length;
  const ptrDispatches =
    dispatchText.split(target.enclosingClass === undefined ? `::${name}_ptr(` : `${name}_ptr(`).length - 1;

  if (policy.kind === "NO_PTR_REGION") {
    if (starts !== 0 || ends !== 0 || ptrDefinitions !== 0 || ptrDispatches !== 0) {
      fail(
        `POLICY_VIOLATED: NO_PTR_REGION, but the module has ${String(starts)}/${String(ends)} PTR markers and ${String(ptrDefinitions)} ${name}_ptr definitions, and the dispatch calls ${name}_ptr ${String(ptrDispatches)} times`,
      );
    }
    return;
  }
  if (starts !== 1 || ends !== 1) {
    fail(
      `POLICY_VIOLATED: ${policy.kind} needs exactly one ${policy.ptrRegionStart} and one ${policy.ptrRegionEnd}`,
    );
  }
  const ptrStart = lines.findIndex((line) => line.trim() === policy.ptrRegionStart);
  const ptrEnd = lines.findIndex((line) => line.trim() === policy.ptrRegionEnd);
  if (ptrEnd <= ptrStart) fail(`POLICY_VIOLATED: the PTR markers of ${name} are reversed`);

  if (policy.kind === "PTR_MARKERS_EMPTY") {
    const between = lines.slice(ptrStart + 1, ptrEnd).filter((line) => line.trim().length > 0);
    if (between.length !== 0 || ptrDefinitions !== 0 || ptrDispatches !== 0) {
      fail(
        `POLICY_VIOLATED: PTR_MARKERS_EMPTY, but the PTR region holds ${String(between.length)} non-blank lines, the module defines ${name}_ptr ${String(ptrDefinitions)} times and the dispatch calls it ${String(ptrDispatches)} times`,
      );
    }
    return;
  }

  // PTR_STUB_NEVER_DISPATCHED (ONB-X2): the markers hold one definition whose parameter is unnamed and whose
  // body is empty, and nothing calls it, so it can build no list. Anything more in the region is a violation.
  if (policy.kind === "PTR_STUB_NEVER_DISPATCHED") {
    const between = lines
      .slice(ptrStart + 1, ptrEnd)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const stub = [policy.ptrFunctionHeader, "{", "}"];
    const isStub = between.length === stub.length && between.every((line, index) => line === stub[index]);
    if (!isStub || ptrDefinitions !== 1 || ptrDispatches !== 0) {
      fail(
        `POLICY_VIOLATED: PTR_STUB_NEVER_DISPATCHED, but the PTR region holds ${String(between.length)} non-blank lines, the module defines ${name}_ptr ${String(ptrDefinitions)} times and the dispatch calls it ${String(ptrDispatches)} times`,
      );
    }
    return;
  }

  // PTR_BODY_DIFFERS (ONB-D2): the module defines both regions and they differ, and the dispatch
  // chooses by is_ptr(), so a live build takes the live branch and the PTR region is neither read
  // nor needed. The same shape as PTR_SEPARATE_INCLUDE, inside one file. The choice must be a
  // literal if ( is_ptr() ) around the PTR call, and if the bodies are equal the stronger
  // PTR_BODY_IDENTICAL is the policy to declare.
  if (policy.kind === "PTR_BODY_DIFFERS") {
    const liveStartAt = lines.findIndex((line) => line.trim() === target.regionStart);
    const liveEndAt = lines.findIndex((line) => line.trim() === target.regionEnd);
    const liveOpen = nextCodeLine(lines, liveStartAt + 1);
    const ptrOpen = nextCodeLine(lines, ptrStart + 1);
    if (liveOpen < 0 || lines[liveOpen].trim() !== target.functionHeader) {
      fail(`POLICY_VIOLATED: the live region does not open on ${target.functionHeader}`);
    }
    if (ptrOpen < 0 || lines[ptrOpen].trim() !== policy.ptrFunctionHeader) {
      fail(`POLICY_VIOLATED: the PTR region does not open on ${policy.ptrFunctionHeader}`);
    }
    const live = lines.slice(liveOpen + 1, liveEndAt);
    const ptr = lines.slice(ptrOpen + 1, ptrEnd);
    if (live.length === ptr.length && live.every((line, index) => line === ptr[index])) {
      fail("POLICY_VIOLATED: PTR_BODY_DIFFERS, but the bodies are identical; declare PTR_BODY_IDENTICAL");
    }
    if (ptrDefinitions !== 1 || ptrDispatches !== 1) {
      fail(`POLICY_VIOLATED: PTR_BODY_DIFFERS needs one ${name}_ptr definition and one dispatch call`);
    }
    const choice = target.dispatch.sequence.findIndex((line) => line === "if ( is_ptr() )");
    const ptrCall = target.dispatch.sequence.findIndex((line) => line.includes(`::${name}_ptr(`));
    if (choice < 0 || ptrCall < choice) {
      fail(`POLICY_VIOLATED: PTR_BODY_DIFFERS needs the dispatch to choose ${name}_ptr by if ( is_ptr() )`);
    }
    return;
  }

  // PTR_BODY_IDENTICAL: both regions open on their own header, and every line
  // after the header is byte-identical, so either branch of the dispatch
  // builds the same lists.
  const liveStart = lines.findIndex((line) => line.trim() === target.regionStart);
  const liveEnd = lines.findIndex((line) => line.trim() === target.regionEnd);
  const liveHeader = nextCodeLine(lines, liveStart + 1);
  const ptrHeader = nextCodeLine(lines, ptrStart + 1);
  if (liveHeader < 0 || lines[liveHeader].trim() !== target.functionHeader) {
    fail(`POLICY_VIOLATED: the live region does not open on ${target.functionHeader}`);
  }
  if (ptrHeader < 0 || lines[ptrHeader].trim() !== policy.ptrFunctionHeader) {
    fail(`POLICY_VIOLATED: the PTR region does not open on ${policy.ptrFunctionHeader}`);
  }
  const liveBody = lines.slice(liveHeader + 1, liveEnd);
  const ptrBody = lines.slice(ptrHeader + 1, ptrEnd);
  if (liveBody.length !== ptrBody.length || liveBody.some((line, index) => line !== ptrBody[index])) {
    const at = liveBody.findIndex((line, index) => line !== ptrBody[index]);
    fail(
      `POLICY_VIOLATED: PTR_BODY_IDENTICAL, but the bodies differ (${String(liveBody.length)} vs ${String(ptrBody.length)} lines, first difference at body line ${String(at + 1)})`,
    );
  }
  if (ptrDefinitions !== 1 || ptrDispatches !== 1) {
    fail(`POLICY_VIOLATED: PTR_BODY_IDENTICAL needs one ${name}_ptr definition and one dispatch call`);
  }
}

/**
 * The class module dispatches to the target's function: inside the one
 * dispatch function, the pinned code-line sequence occurs exactly once, and
 * the live call occurs exactly once in the whole module.
 */
export function verifyDispatch(dispatchText, target) {
  const { functionHeader, sequence } = target.dispatch;
  const lines = dispatchText.split(/\r?\n/);
  const code = functionBody(lines, functionHeader)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"));
  let occurrences = 0;
  for (let i = 0; i + sequence.length <= code.length; i += 1) {
    if (sequence.every((line, offset) => code[i + offset] === line)) occurrences += 1;
  }
  if (occurrences !== 1) {
    fail(
      `DISPATCH_UNVERIFIED: the sequence [${sequence.join(" | ")}] occurs ${String(occurrences)} times in ${functionHeader}; exactly one is required`,
    );
  }
  const name = liveFunctionOf(target)[1];
  const call = sequence.find((line) =>
    target.includedBy !== undefined
      ? line.includes(`::${name}( this );`)
      : target.enclosingClass === undefined
        ? new RegExp(`::${name}\\( this \\);$`).test(line)
        : line === `${name}();`,
  );
  if (countLines(lines, call) !== 1)
    fail(`DISPATCH_UNVERIFIED: '${call}' must occur exactly once in the module`);
}

/** ONB-C1: the included file is the whole body of its function, in the hash-pinned including file. */
export function verifyInclusion(includerText, target) {
  const { includeLine } = target.includedBy;
  const lines = includerText.split(/\r?\n/);
  const body = functionBody(lines, target.functionHeader)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  // Header, opening brace, the include, closing brace: nothing else.
  if (body.length !== 4 || body[2] !== includeLine) {
    fail(`INCLUSION_UNVERIFIED: '${includeLine}' is not the sole body of ${target.functionHeader}`);
  }
  if (countLines(lines, includeLine) !== 1) {
    fail(`INCLUSION_UNVERIFIED: '${includeLine}' must occur exactly once`);
  }
}

/** One hash-pinned proof file's checks. */
function verifyProof(bytes, proof) {
  const text = Buffer.from(bytes).toString("utf8");
  const lines = text.split(/\r?\n/);
  for (const check of proof.checks) {
    if (check.kind === "FUNCTION_BODY_SHA256") {
      const body = sha256Of(functionBody(lines, check.functionHeader).join("\n"));
      if (body !== check.bodySha256) {
        fail(`INERT_PROOF_FAILED: ${check.functionHeader} body is ${body}, pinned ${check.bodySha256}`);
      }
    } else if (check.kind === "LINE_EXACTLY_ONCE") {
      const count = countLines(lines, check.line);
      if (count !== 1)
        fail(`INERT_PROOF_FAILED: '${check.line}' occurs ${String(count)} times in ${proof.sourcePath}`);
    } else if (check.kind === "TOKEN_ABSENT") {
      if (text.includes(check.token)) fail(`INERT_PROOF_FAILED: ${proof.sourcePath} names '${check.token}'`);
    } else {
      fail(`INERT_PROOF_FAILED: unknown check kind '${String(check.kind)}'`);
    }
  }
}

/**
 * Every pinned fact of one target, against one source root. Never writes.
 * Returns the problems found (empty when the target passes) and, on success,
 * the artifact the target would produce.
 */
export function preflightTarget({ targetName, target, read, sha, extractedOn, commitDate, branch }) {
  const problems = [];
  const result = {
    targetName,
    ok: false,
    problems,
    sourcePath: target?.sourcePath ?? null,
    sourceSha256: null,
    sourceByteLength: null,
    regionSha256: null,
    livePtrPolicy: target?.livePtrPolicy?.kind ?? null,
    dispatchSourcePath: target?.dispatch?.sourcePath ?? null,
    inertStatements: 0,
    lists: 0,
    actions: 0,
    artifact: null,
  };
  const step = (run) => {
    try {
      return run();
    } catch (error) {
      if (!(error instanceof ExtractionError)) throw error;
      problems.push(error.message);
      return undefined;
    }
  };
  if (target === undefined) {
    problems.push(`UNKNOWN_TARGET: '${targetName}'`);
    return result;
  }
  if (target.pinnedSource === undefined) {
    problems.push(`NOT_PINNED: '${targetName}' carries no pinned source record and cannot be preflighted`);
    return result;
  }
  problems.push(...validatePinnedRecord(targetName, target));
  if (typeof sha !== "string" || !COMMIT_HEX.test(sha)) {
    problems.push("MISSING_COMMIT: no 40-character --sha was given");
  } else if (sha !== target.pinnedSource.commitSha) {
    problems.push(`COMMIT_MISMATCH: --sha ${sha} is not the pinned commit ${target.pinnedSource.commitSha}`);
  }
  if (problems.length > 0) return result;

  const module = readPinned(read, target.pinnedSource, "module", problems);
  const dispatchBytes = readPinned(read, target.dispatch, "dispatch", problems);
  const includerBytes =
    target.includedBy === undefined ? null : readPinned(read, target.includedBy, "includer", problems);
  const proofBytes = [...(target.inertStatements ?? []), ...(target.spellGatedActions ?? [])].flatMap(
    (inert) =>
      inert.proofs.map((proof) => ({ proof, bytes: readPinned(read, proof, "inert proof", problems) })),
  );
  if (problems.length > 0 || module === null || dispatchBytes === null) return result;
  result.sourceSha256 = target.pinnedSource.sha256;
  result.sourceByteLength = module.length;

  const text = Buffer.from(module).toString("utf8");
  const lines = text.split(/\r?\n/);
  const dispatchText = Buffer.from(dispatchBytes).toString("utf8");
  const extracted = step(() => extract(text, target));
  if (extracted !== undefined) {
    result.regionSha256 = extracted.regionSha256;
    if (extracted.regionSha256 !== target.pinnedSource.regionSha256) {
      problems.push(
        `REGION_SHA256_MISMATCH: region ${target.regionStart ?? target.functionHeader} is ${extracted.regionSha256}, pinned ${target.pinnedSource.regionSha256}`,
      );
    }
  }
  const includerText = includerBytes === null ? null : Buffer.from(includerBytes).toString("utf8");
  if (target.includedBy !== undefined) step(() => verifyInclusion(includerText ?? "", target));
  step(() => verifyLivePtrPolicy(lines, dispatchText, target, includerText));
  step(() => verifyDispatch(dispatchText, target));
  for (const { proof, bytes } of proofBytes) step(() => verifyProof(bytes, proof));
  if (extracted === undefined || problems.length > 0) return result;

  const artifact = buildArtifact({
    target,
    extracted,
    sourceSha256: target.pinnedSource.sha256,
    sourceByteLength: module.length,
    sha,
    branch,
    commitDate,
    extractedOn,
  });
  problems.push(...verifyRequiredFacts(artifact, target).map((problem) => `REQUIRED_FACT: ${problem}`));
  if (problems.length > 0) return result;
  result.inertStatements = (extracted.inertStatements ?? []).length;
  result.lists = artifact.lists.length;
  result.actions = artifact.lists.reduce((sum, list) => sum + list.actions.length, 0);
  result.artifact = artifact;
  result.ok = true;
  return result;
}

/** Where a target's artifact would be written: `outDir` keeps the default file name. */
export function outputPathOf(target, outDir) {
  return outDir === undefined ? target.defaultOut : join(outDir, basename(target.defaultOut));
}

/**
 * Preflights a batch, all-or-nothing, without writing. Batch problems —
 * no targets, a repeated or unknown name, two targets on one region or one
 * output path — fail the batch even when every target passes alone.
 */
export function preflightBatch({
  targetNames,
  targets = TARGETS,
  read,
  sha,
  extractedOn,
  commitDate,
  branch,
  outDir,
}) {
  const problems = [];
  if (!Array.isArray(targetNames) || targetNames.length === 0)
    problems.push("NO_TARGETS: the batch selects no target");
  const names = Array.isArray(targetNames) ? targetNames : [];
  const seen = new Set();
  for (const name of names) {
    if (seen.has(name)) problems.push(`DUPLICATE_TARGET: '${name}' is selected twice`);
    seen.add(name);
  }
  const unique = [...seen].sort();
  const byRegion = new Map();
  const byOutput = new Map();
  for (const name of unique) {
    const target = Object.hasOwn(targets, name) ? targets[name] : undefined;
    if (target === undefined) continue;
    const region = `${target.sourcePath}#${target.regionStart ?? target.enclosingNamespace ?? target.functionHeader}`;
    if (byRegion.has(region))
      problems.push(`DUPLICATE_REGION: '${byRegion.get(region)}' and '${name}' select ${region}`);
    else byRegion.set(region, name);
    const output = resolve(outputPathOf(target, outDir));
    if (byOutput.has(output))
      problems.push(`DUPLICATE_OUTPUT: '${byOutput.get(output)}' and '${name}' both write ${output}`);
    else byOutput.set(output, name);
  }
  const results = unique.map((targetName) => ({
    ...preflightTarget({
      targetName,
      target: Object.hasOwn(targets, targetName) ? targets[targetName] : undefined,
      read,
      sha,
      extractedOn,
      commitDate,
      branch,
    }),
    outputPath: Object.hasOwn(targets, targetName) ? outputPathOf(targets[targetName], outDir) : null,
  }));
  return { ok: problems.length === 0 && results.every((result) => result.ok), problems, results };
}

/** The batch as a deterministic report: sorted targets, no artifact bodies, no clock. */
export function batchReport(batch) {
  return {
    ok: batch.ok,
    problems: batch.problems,
    targets: batch.results.map(({ artifact: _artifact, ...result }) => result),
  };
}

/**
 * Writes a PASSED batch, all or nothing: every artifact to a temporary file
 * first, then each renamed into place. A failure before the renames removes
 * every temporary file and writes nothing.
 */
export function writeBatch(batch) {
  if (!batch.ok) fail("the batch did not pass preflight; nothing is written");
  const staged = [];
  try {
    for (const result of batch.results) {
      const outPath = result.outputPath;
      mkdirSync(dirname(outPath), { recursive: true });
      const temporary = `${outPath}.${String(process.pid)}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(result.artifact, null, 2)}\n`, "utf8");
      staged.push({ temporary, outPath });
    }
  } catch (error) {
    for (const { temporary } of staged) rmSync(temporary, { force: true });
    throw error;
  }
  for (const { temporary, outPath } of staged) renameSync(temporary, outPath);
  return staged.map(({ outPath }) => outPath);
}

function mainBatch(args) {
  const names =
    typeof args.targets === "string"
      ? args.targets.split(",").map((name) => name.trim())
      : typeof args.target === "string"
        ? [args.target]
        : [];
  if (typeof args["source-root"] !== "string") fail("--source-root <dir> is required for pinned targets");
  const check = args.check === true;
  const outDir = typeof args["out-dir"] === "string" ? args["out-dir"] : undefined;
  if (!check && outDir === undefined)
    fail("--out-dir <dir> is required to write; use --check to verify only");
  if (!check && typeof args["extracted-on"] !== "string")
    fail("--extracted-on <YYYY-MM-DD> is required to write");
  const batch = preflightBatch({
    targetNames: names,
    read: sourceRootReader(args["source-root"]),
    sha: typeof args.sha === "string" ? args.sha : null,
    extractedOn: check ? "CHECK" : args["extracted-on"],
    commitDate: typeof args["commit-date"] === "string" ? args["commit-date"] : "UNKNOWN",
    branch: typeof args.branch === "string" ? args.branch : "midnight",
    outDir,
  });
  console.log(JSON.stringify(batchReport(batch), null, 2));
  if (!batch.ok) {
    console.error("EXTRACTION FAILED: the batch did not pass preflight; nothing was written.");
    process.exit(1);
  }
  if (check) {
    console.error(`CHECK PASSED: ${String(batch.results.length)} target(s); nothing was written.`);
    return;
  }
  for (const path of writeBatch(batch)) console.error(`Wrote ${path}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // M11-D2-C: a PINNED target is preflighted and extracted only as a batch.
  if (
    args.targets !== undefined ||
    (typeof args.target === "string" && TARGETS[args.target]?.pinnedSource !== undefined)
  ) {
    mainBatch(args);
    return;
  }
  const targetName = typeof args.target === "string" ? args.target : "rogue-assassination";
  const TARGET = TARGETS[targetName];
  if (TARGET === undefined) {
    fail(`unknown --target '${targetName}' (known: ${Object.keys(TARGETS).join(", ")})`);
  }

  const sourceBuffer = await loadSource(args, TARGET.sourcePath);
  const sourceSha256 = createHash("sha256").update(sourceBuffer).digest("hex");

  if (typeof args["expect-sha256"] === "string" && args["expect-sha256"] !== sourceSha256) {
    fail(`source SHA-256 mismatch\n  expected ${args["expect-sha256"]}\n  actual   ${sourceSha256}`);
  }

  const sourceText = sourceBuffer.toString("utf8");
  const extracted = extract(sourceText, TARGET);

  const artifact = buildArtifact({
    target: TARGET,
    extracted,
    sourceSha256,
    sourceByteLength: sourceBuffer.length,
    sha: typeof args.sha === "string" ? args.sha : null,
    branch: typeof args.branch === "string" ? args.branch : "midnight",
    commitDate: typeof args["commit-date"] === "string" ? args["commit-date"] : "UNKNOWN",
    extractedOn:
      typeof args["extracted-on"] === "string" ? args["extracted-on"] : new Date().toISOString().slice(0, 10),
  });

  const problems = verifyRequiredFacts(artifact, TARGET);
  if (problems.length > 0) {
    console.error("EXTRACTION FAILED: the pinned source does not exhibit the required authority facts.\n");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("\nDo not rewrite expectations to match. Report the discrepancy.");
    process.exit(1);
  }

  const outPath = typeof args.out === "string" ? args.out : TARGET.defaultOut;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(`Wrote ${outPath}`);
  console.log(`  commit      ${artifact.provenance.commitSha}`);
  console.log(`  sourceSha256 ${sourceSha256}`);
  console.log(`  lists       ${artifact.lists.length}`);
  console.log(`  actions     ${artifact.lists.reduce((n, l) => n + l.actions.length, 0)}`);
  console.log("  required authority facts: VERIFIED");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    if (!(error instanceof ExtractionError)) throw error;
    console.error(`EXTRACTION FAILED: ${error.message}`);
    process.exit(1);
  }
}
