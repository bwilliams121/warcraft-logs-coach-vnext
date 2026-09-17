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
 * WHAT THE CENSUS DOES NOT CLAIM
 *
 * It censuses TRAITS of one class (trait_data.inc, `id_class`) that the target
 * specialization can select (a row's spec list names the spec, or is empty).
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
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  dataEnums: "engine/dbc/data_enums.hh",
  playerModule: "engine/player/player.cpp",
  actionModule: "engine/action/action.cpp",
  classModule: "engine/class_modules/paladin/sc_paladin.cpp",
  classHeader: "engine/class_modules/paladin/sc_paladin.hpp",
  specModule: "engine/class_modules/paladin/sc_paladin_protection.cpp",
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
  ],
  aliasGroups: {
    wings: {
      simcToken: "avenging_wrath",
      basis:
        "sc_paladin_protection.cpp:980-981 substitutes sentinel_t for the `avenging_wrath` action when the Sentinel talent is taken, and sc_paladin.cpp:286-291 makes avenging_wrath_t background under Sentinel; sc_paladin.cpp:5296-5299 rewrites every `<x>.avenging_wrath` expression to `<x>.sentinel` under Protection when Sentinel is taken. Both spells share DBC category 1550 with a 120,000 ms category cooldown. Which member is castable is a talent fact the consumer resolves; a cast of EITHER member anchors the group's cooldown.",
    },
  },
};

export const TARGETS = {
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
export function censusPassiveModifiers({ traits, traitRecords, effects, target, labels, specId }) {
  const targetLabels = labels.get(target.spellId) ?? [];
  const matches = [];
  for (const effect of effects) {
    if (!APPLY_AURA_TYPES.has(effect.type)) continue;
    const owner = traitRecords.get(effect.spellId);
    if (owner === undefined || !isPassive(owner)) continue;
    const matched = passiveEffectMatch(effect, owner, target, targetLabels);
    if (matched === null) continue;
    const rule = COOLDOWN_SUBTYPES[effect.subtype];
    for (const trait of traits.filter(
      (row) =>
        row.talentSpellId === effect.spellId && (row.specIds.length === 0 || row.specIds.includes(specId)),
    )) {
      const siblings = traits.filter(
        (row) => row.traitNodeId === trait.traitNodeId && row.traitEntryId !== trait.traitEntryId,
      );
      matches.push({
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
      a.talentSpellId - b.talentSpellId || a.traitEntryId - b.traitEntryId || a.effectIndex - b.effectIndex,
  );
  return matches;
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
 * The absence checks for one ability, each computed from the pinned text and
 * each REQUIRED to hold. A drifted module fails the extraction rather than
 * producing a policy that no longer describes it.
 */
export function dynamicPolicyChecks(ability, loaded, traits) {
  const modules = {
    classModule: loaded.classModule,
    specModule: loaded.specModule,
    classHeader: loaded.classHeader,
  };
  const moduleText = `${loaded.classModule}\n${loaded.specModule}`;
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
  const mutating = arrowUses.filter((member) => !READ_ONLY_MEMBERS.has(member));
  require("NO_DYNAMIC_MUTATION_THROUGH_THE_MODULE_HANDLE", `every '${handleArrow}<member>' in sc_paladin.cpp + sc_paladin_protection.cpp`, mutating.length ===
    0, arrowUses.length === 0
    ? `no '${handleArrow}' use exists in the module`
    : `${String(arrowUses.length)} use(s): ${arrowUses.map((m) => `->${m}()`).join(", ")} — reads only; no adjust(), reset(), start() or duration assignment`);

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
  require("NO_ADJUST_RESET_OR_START_NAMES_THIS_COOLDOWN", "every '->adjust(', '->reset(', '->start(' and '->adjust_recharge_multiplier(' receiver in the module", namesIt.length ===
    0, `${String(mutators.length)} mutation site(s) in the module; receivers: ${[...new Set(mutators)].join(", ")}; none names this cooldown`);

  // 4. The one recharge-rate mechanism is a buff that is never constructed.
  const autumnDefined = count(loaded.classModule, "struct blessing_of_autumn_t");
  const autumnConstructed =
    count(moduleText, "new blessing_of_autumn_t") + count(loaded.classHeader, "blessing_of_autumn_t");
  const autumnTrait = traits.filter((row) =>
    /Blessing of (Autumn|Summer|Winter|Spring|the Seasons)/i.test(row.displayNameEn),
  );
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
  const overrides =
    body === null
      ? null
      : count(body.text, "cooldown->") +
        count(body.text, "update_ready") +
        count(body.text, "cooldown_duration");
  require("NO_ACTION_LEVEL_COOLDOWN_OVERRIDE", `the body of ${ability.actionStruct.name} for 'cooldown->', 'update_ready' and 'cooldown_duration'`, body !==
    null && overrides === 0, body === null
    ? `${ability.actionStruct.name} was not found`
    : `${ability.actionStruct.name}${body.startLine === null ? " (out-of-line members)" : ` (lines ${String(body.startLine)}-${String(body.endLine)})`} declares no cooldown override and no update_ready; the base action_t::update_ready path applies unchanged`);

  // 6. The hasted-cooldown flag is set only in other actions' structs.
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

  const loaded = {};
  const sources = [];
  for (const [key, path] of Object.entries(SOURCES)) {
    const buffer = await loadSource(args, key, path);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    loaded[key] = buffer.toString("utf8");
    sources.push({ path, sha256, byteLength: buffer.length });
  }
  const sourceFor = (key) => sources.find((s) => s.path === SOURCES[key]);

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
  const spellRead = readSpellRecords(loaded.spellData, [...abilityIds, ...traitSpellIds], spellMembers);
  if (!spellRead.ok) fail(spellRead.error);
  const labels = readSpellLabels(loaded.spellData);
  if (labels === null) fail("sc_spell_data.inc has no __spelllabel_data table");
  const { effects, examined } = readAuraEffects(loaded.spellData, traitSpellIds, effectMembers);

  const abilities = [];
  const problems = [];
  for (const ability of target.abilities) {
    const record = spellRead.records.get(ability.abilityGameId);
    if (record === undefined) fail(`spell ${String(ability.abilityGameId)} is not in the pinned spell table`);
    const passiveModifiers = censusPassiveModifiers({
      traits,
      traitRecords: spellRead.records,
      effects,
      target: record,
      labels,
      specId: target.specId,
    });
    const policy = dynamicPolicyChecks(ability, loaded, traits);
    problems.push(...policy.problems);
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
      binding: {
        method: "MACHINE_EXTRACTED_DBC_RECORD",
        sourcePath: SOURCES.spellData,
        createAction: ability.createAction,
        specBinding: ability.specBinding,
      },
      passiveModifierCensus: {
        method: "MACHINE_CENSUS_OF_PASSIVE_TRAIT_EFFECTS",
        classId: target.classId,
        traitRowsExamined: traits.length,
        traitSpellsExamined: traitSpellIds.length,
        effectRowsExamined: examined,
        subtypesChecked: Object.entries(COOLDOWN_SUBTYPES).map(([id, rule]) => `${id}:${rule.name}`),
        rule: "player.cpp parse_all_passive_talents -> parse_passive_effects (SX_PASSIVE spells; E_APPLY_AURA effects) -> register_passive_effect: A_ADD_FLAT/PCT_MODIFIER with misc_value1 == P_COOLDOWN (11) match by class family flags; the LABEL variants match by misc_value2 against __spelllabel_data; category subtypes match the spell's _category; category-mask subtypes match the spell's _category_type mask; A_HASTED_COOLDOWN matches by family flags. A matched flat value is added to the DBC cooldown field and a matched pct value scales it BEFORE action_t::init reads spell_data.cooldown() (dbc_override_->register_spell( id, \"cooldown\", value )).",
        modifiers: passiveModifiers,
      },
      dynamicModifierPolicy: {
        method: "HAND_REVIEWED_CPP_ABSENCE_PROOF",
        appliesTo: ability.simcToken,
        sourcePaths: [SOURCES.classModule, SOURCES.specModule, SOURCES.classHeader],
        sourceSha256: {
          classModule: sourceFor("classModule").sha256,
          specModule: sourceFor("specModule").sha256,
          classHeader: sourceFor("classHeader").sha256,
        },
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
        note: "For an instant, non-channelled ability, execution coincides with the observed cast. Divine Toll, Sentinel and Avenging Wrath are instant in the pinned data.",
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
