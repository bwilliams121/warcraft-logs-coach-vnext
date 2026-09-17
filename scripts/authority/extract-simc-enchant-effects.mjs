#!/usr/bin/env node
/**
 * Pins whether the ENCHANTS and GEMS on a subject's worn gear carry an on-use
 * effect, from one exact SimulationCraft commit (M10-C, correction 1).
 *
 * WHY THIS EXISTS
 *
 * `use_items` with no `slots=` builds a `use_item` sub-action for every worn
 * slot whose item carries a SPECIAL_EFFECT_USE from ANY of three sources —
 * the item itself, a gem, or an enchant (player.cpp `create_use_subactions`).
 * The item-effect artifact pins the first source. The other two come from
 * `spell_item_enchantment.inc`: `enchant::initialize_item_enchant` creates a
 * USE effect only for an `ench_type[i]` of ITEM_ENCHANTMENT_USE_SPELL with a
 * non-zero `ench_prop[i]` (enchants.cpp), and a gem reaches the same code
 * through `item_data.gem_properties -> gem_property_data_t.enchant_id`.
 *
 * So the claim "exactly these worn slots produce a sub-action" needs every
 * enchant id and every gem id on the gear pinned as use/no-use. That is what
 * this script writes first. No stat values, no scaling.
 *
 * THE UNIVERSE CENSUS (M10-C2). Warcraft Logs omits the `permanentEnchant`,
 * `temporaryEnchant` and `gems` keys on a gear row that has none, and this
 * project reads an absent key as "not reported", never as "none". The only
 * other way to close such a slot is to prove from the pinned build that NO
 * enchant or gem that could occupy it creates a use effect. So the script
 * also enumerates EVERY row of `spell_item_enchantment.inc` that creates a
 * use effect and, for each, whether it is a temporary enchant
 * (`temporary_enchant.inc`), which inventory types it may be applied to as a
 * permanent enchant (`permanent_enchant.inc` `mask_inventory_type`), and
 * whether it is gem-borne (`id_gem`). A use-producing row that is none of
 * those carries NO slot restriction the pinned tables can state, and is
 * recorded as such: it is what keeps a slot open, and the artifact says so
 * rather than the reader assuming it away.
 *
 * THE DRIVER RESOLUTION (M10-C3). For every use-producing row the USE spell
 * (`ench_prop[i]` where `ench_type[i]` is USE_SPELL) is resolved from
 * `sc_spell_data.inc`: its cooldown, internal cooldown, category cooldown,
 * GCD, cast time and charges, and every effect row (type, subtype, misc
 * value, trigger spell), then the trigger spell's effects the same way. From
 * those the extractor applies SimulationCraft's OWN generic use-effect rules
 * (`special_effect_t::buff_type` / `action_type`, special_effect.cpp) to say
 * what a sub-action built from the row would be: a stat buff, an absorb, a
 * damage / heal / attack / resource action, or nothing. A driver that any
 * `unique_gear*.cpp` registers a custom handler for is marked SCRIPTED and
 * its behaviour is NOT derived from the tables — a script can do anything.
 * The unique_gear modules and special_effect.cpp are hashed, not parsed
 * beyond the registration census.
 *
 * CLASS-NEUTRAL. A target names the enchant ids and gem item ids a subject's
 * combatant info reports; the parsing does not know what class wears them.
 *
 * SOURCES (fetched at --sha, or supplied with --local-<key>):
 *   engine/dbc/generated/spell_item_enchantment.inc   machine-parsed
 *   engine/dbc/generated/gem_data.inc                  machine-parsed
 *   engine/dbc/generated/item_data.inc                 machine-parsed (gem rows only)
 *   engine/dbc/generated/client_data_version.inc       machine-parsed
 *   engine/dbc/spell_item_enchantment.hpp              layout check
 *   engine/dbc/gem_data.hpp                            layout check
 *   engine/dbc/item_data.hpp                           layout check
 *   engine/dbc/data_enums.hh                           ITEM_ENCHANTMENT_USE_SPELL value
 *   engine/item/enchants.cpp                           HASHED, hand-reviewed
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { deriveScalarFieldIndices } from "./extract-simc-item-effects.mjs";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;

const SOURCES = {
  itemEnchantment: "engine/dbc/generated/spell_item_enchantment.inc",
  temporaryEnchant: "engine/dbc/generated/temporary_enchant.inc",
  permanentEnchant: "engine/dbc/generated/permanent_enchant.inc",
  gemData: "engine/dbc/generated/gem_data.inc",
  itemData: "engine/dbc/generated/item_data.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  itemEnchantmentLayout: "engine/dbc/spell_item_enchantment.hpp",
  temporaryEnchantLayout: "engine/dbc/temporary_enchant.hpp",
  permanentEnchantLayout: "engine/dbc/permanent_enchant.hpp",
  gemDataLayout: "engine/dbc/gem_data.hpp",
  itemDataLayout: "engine/dbc/item_data.hpp",
  dataEnums: "engine/dbc/data_enums.hh",
  enchantModule: "engine/item/enchants.cpp",
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  specialEffectModule: "engine/item/special_effect.cpp",
  uniqueGearCore: "engine/player/unique_gear.cpp",
  uniqueGearLegion: "engine/player/unique_gear_legion.cpp",
  uniqueGearBfa: "engine/player/unique_gear_bfa.cpp",
  uniqueGearShadowlands: "engine/player/unique_gear_shadowlands.cpp",
  uniqueGearDragonflight: "engine/player/unique_gear_dragonflight.cpp",
  uniqueGearTheWarWithin: "engine/player/unique_gear_thewarwithin.cpp",
  uniqueGearMidnight: "engine/player/unique_gear_midnight.cpp",
};

/** The `unique_gear*.cpp` sources whose `register_special_effect` calls are censused. */
const UNIQUE_GEAR_KEYS = [
  "uniqueGearCore",
  "uniqueGearLegion",
  "uniqueGearBfa",
  "uniqueGearShadowlands",
  "uniqueGearDragonflight",
  "uniqueGearTheWarWithin",
  "uniqueGearMidnight",
];

/**
 * The enumerators SimulationCraft's generic use-effect rules dispatch on
 * (special_effect.cpp `stat_buff_type`, `is_absorb_buff`,
 * `is_offensive_spell_action`, `is_heal_action`, `is_attack_action`,
 * `is_resource_action`). Every value is READ from data_enums.hh, never typed.
 */
const GENERIC_RULE_ENUMERATORS = [
  "E_SCHOOL_DAMAGE",
  "E_DUMMY",
  "E_APPLY_AURA",
  "E_HEALTH_LEECH",
  "E_HEAL",
  "E_ENERGIZE",
  "E_WEAPON_PERCENT_DAMAGE",
  "E_WEAPON_DAMAGE",
  "E_TRIGGER_SPELL",
  "A_PERIODIC_DAMAGE",
  "A_PERIODIC_HEAL",
  "A_MOD_DAMAGE_DONE",
  "A_MOD_RESISTANCE",
  "A_PERIODIC_ENERGIZE",
  "A_MOD_STAT",
  "A_MOD_INCREASE_HEALTH",
  "A_PERIODIC_LEECH",
  "A_SCHOOL_ABSORB",
  "A_MOD_ATTACK_POWER",
  "A_MOD_RANGED_ATTACK_POWER",
  "A_MOD_RATING",
  "A_MOD_INCREASE_HEALTH_2",
  "A_MOD_BONUS_ARMOR",
];

/** `item_enchantment`, engine/dbc/data_enums.hh. Verified against the header, not assumed. */
const EXPECTED_USE_SPELL_TYPE = 7;

/**
 * The hand-reviewed reading of `enchants.cpp` that turns table rows into a
 * "creates a use sub-action" fact. Recorded with the module's measured hash.
 */
const ENCHANT_SEMANTICS_CHECKS = [
  {
    claim: "USE_EFFECT_REQUIRES_USE_SPELL_TYPE_WITH_NONZERO_PROP",
    symbol: "enchant::initialize_item_enchant",
    lines: "193-198",
    detail:
      "The only branch that sets effect.type = SPECIAL_EFFECT_USE is `case ITEM_ENCHANTMENT_USE_SPELL`, and it " +
      "`continue`s when ench_prop[i] == 0. Every other ench_type (STAT, EQUIP_SPELL, DAMAGE, RESISTANCE, " +
      "APPLY_BONUS, ...) produces stats, an EQUIP effect, or nothing. So an enchant row whose three ench_type " +
      "entries contain no USE_SPELL cannot create a use sub-action.",
  },
  {
    claim: "GEM_EFFECTS_FLOW_THROUGH_THE_SAME_ENCHANT_PATH",
    symbol: "enchant::initialize_gem",
    lines: "330-352",
    detail:
      "A gem is resolved item -> gem_properties -> gem_property_data_t.enchant_id -> item_enchantment row, then " +
      "passed to initialize_item_enchant with SPECIAL_EFFECT_SOURCE_GEM. A gem's use-effect question is " +
      "therefore its enchant row's question.",
  },
];

/**
 * The M10-B Protection Paladin subject (A7R6kxPJ1hC8YQ4w fight 7, actor 7):
 * every permanent enchant, temporary enchant and gem its combatant info
 * reports. Nothing about a slot that reports none.
 */
const PALADIN_PROTECTION_TARGET = {
  datasetId: "SIMC_DBC_PALADIN_PROTECTION_ENCHANT_USE_EFFECTS",
  defaultOut: "src/data/game/paladin-protection-enchant-effects.json",
  requiredEnchantIds: [
    { enchantId: 7961, why: "head permanentEnchant" },
    { enchantId: 8031, why: "shoulder permanentEnchant" },
    { enchantId: 7987, why: "chest permanentEnchant" },
    { enchantId: 8159, why: "legs permanentEnchant" },
    { enchantId: 8019, why: "feet permanentEnchant" },
    { enchantId: 7967, why: "finger1 and finger2 permanentEnchant" },
    { enchantId: 7981, why: "main hand permanentEnchant" },
    { enchantId: 7143, why: "main hand temporaryEnchant (Rite of Sanctification)" },
  ],
  requiredGemItemIds: [
    { itemId: 240_890, why: "head, finger1 and finger2 gem" },
    { itemId: 240_983, why: "neck gem" },
  ],
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

export function sourceHashProblem(path, expectedSha256, actualSha256) {
  if (typeof expectedSha256 !== "string") return null;
  if (expectedSha256 === actualSha256) return null;
  return `${path} SHA-256 mismatch\n  expected ${expectedSha256}\n  actual   ${actualSha256}`;
}

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
  if (missing.length > 0)
    return { ok: false, error: `client_data_version.inc is missing ${missing.join(", ")}` };
  return {
    ok: true,
    value: { wowVersion, hotfixDate, hotfixBuild: Number.parseInt(hotfixBuildRaw, 10), hotfixHash },
  };
}

/** The value of one enumerator in `data_enums.hh`, or null. */
export function readEnumerator(text, name) {
  const match = new RegExp(`^\\s*${name}\\s*=\\s*(\\d+)\\s*,?`, "m").exec(text);
  return match === null ? null : Number.parseInt(match[1], 10);
}

/**
 * Checks that a struct's members appear in the order this parser assumes.
 *
 * Returns null when they do, or a message naming the first divergence. A row
 * regex that silently read the wrong column would put an unverified fact into
 * the artifact, so the layout is checked before any row is read.
 */
export function checkStructLayout(headerText, structName, expectedMembers) {
  const lines = headerText.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^\\s*struct\\s+${structName}\\b`).test(line));
  if (start < 0) return `struct ${structName} not found`;
  const members = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith("};")) break;
    if (
      line === "" ||
      line === "{" ||
      line.startsWith("//") ||
      line.startsWith("static") ||
      line.startsWith("{ return")
    )
      continue;
    const declaration =
      /^(?:const\s+)?[A-Za-z_][A-Za-z0-9_:<>*\s]*?\s\*?([A-Za-z_][A-Za-z0-9_]*)(\[[^\]]*\])?\s*;/.exec(line);
    if (declaration === null) continue;
    members.push(declaration[1]);
    if (members.length === expectedMembers.length) break;
  }
  for (let i = 0; i < expectedMembers.length; i += 1) {
    if (members[i] !== expectedMembers[i]) {
      return `${structName} member ${String(i)} is '${members[i] ?? "<absent>"}', expected '${expectedMembers[i]}'`;
    }
  }
  return null;
}

/**
 * Parses `spell_item_enchantment.inc` rows for the wanted ids.
 *
 * Layout (spell_item_enchantment.hpp): `{ id, id_gem, id_scaling,
 * min_scaling_level, max_scaling_level, min_ilevel, max_ilevel, req_skill,
 * req_skill_value, { ench_type[3] }, { ench_amount[3] }, { ench_prop[3] },
 * { ench_coeff[3] }, id_spell, "name" }`.
 */
export function parseEnchantRows(text, wantedEnchantIds) {
  const wanted = new Set([...wantedEnchantIds].map(Number));
  const rows = new Map();
  const duplicates = [];
  const row =
    /^\s*\{\s*(\d+),\s*(\d+),\s*(-?\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*\{\s*(\d+),\s*(\d+),\s*(\d+)\s*\},\s*\{\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\},\s*\{\s*(\d+),\s*(\d+),\s*(\d+)\s*\},\s*\{[^}]*\},\s*(\d+),\s*"((?:[^"\\]|\\.)*)"/;
  for (const line of text.split(/\r?\n/)) {
    const match = row.exec(line);
    if (match === null) continue;
    const enchantId = Number.parseInt(match[1], 10);
    if (!wanted.has(enchantId)) continue;
    if (rows.has(enchantId)) {
      duplicates.push(enchantId);
      continue;
    }
    rows.set(enchantId, {
      enchantId,
      gemItemId: Number.parseInt(match[2], 10),
      enchTypes: [10, 11, 12].map((index) => Number.parseInt(match[index], 10)),
      enchProps: [16, 17, 18].map((index) => Number.parseInt(match[index], 10)),
      spellId: Number.parseInt(match[19], 10),
      nameEn: match[20],
    });
  }
  return { rows, duplicates };
}

/**
 * EVERY row of `spell_item_enchantment.inc`, reduced to the use-effect
 * question. Returns the total row count (so a reader can see the census was
 * over the whole table) and the rows that create a use effect.
 */
export function censusUseProducingRows(text, useSpellType) {
  const row =
    /^\s*\{\s*(\d+),\s*(\d+),\s*(-?\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*\{\s*(\d+),\s*(\d+),\s*(\d+)\s*\},\s*\{\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\},\s*\{\s*(\d+),\s*(\d+),\s*(\d+)\s*\},\s*\{[^}]*\},\s*(\d+),\s*"((?:[^"\\]|\\.)*)"/;
  let totalRows = 0;
  const useProducing = [];
  for (const line of text.split(/\r?\n/)) {
    const match = row.exec(line);
    if (match === null) continue;
    totalRows += 1;
    const enchTypes = [10, 11, 12].map((index) => Number.parseInt(match[index], 10));
    const enchProps = [16, 17, 18].map((index) => Number.parseInt(match[index], 10));
    if (!enchTypes.some((type, index) => type === useSpellType && enchProps[index] !== 0)) continue;
    useProducing.push({
      enchantId: Number.parseInt(match[1], 10),
      gemItemId: Number.parseInt(match[2], 10),
      reqSkill: Number.parseInt(match[8], 10),
      reqSkillValue: Number.parseInt(match[9], 10),
      enchTypes,
      enchProps,
      spellId: Number.parseInt(match[19], 10),
      nameEn: match[20],
    });
  }
  return { totalRows, useProducing };
}

/** `temporary_enchant.inc`: `{ enchant_id, rank, spell_id, "tokenized_name" }` → the set of enchant ids. */
export function parseTemporaryEnchantIds(text) {
  const ids = new Set();
  const row = /^\s*\{\s*(\d+),\s*(\d+),\s*(\d+),\s*"([^"]*)"/;
  for (const line of text.split(/\r?\n/)) {
    const match = row.exec(line);
    if (match !== null) ids.add(Number.parseInt(match[1], 10));
  }
  return ids;
}

/**
 * `permanent_enchant.inc`: `{ enchant_id, rank, item_class, mask_inventory_type,
 * mask_item_subclass, "tokenized_name" }` → per enchant id, every entry's
 * class / inventory-type mask / subclass mask. An enchant may have several
 * entries (one per rank or class); all are kept.
 */
export function parsePermanentEnchantEntries(text) {
  const entries = new Map();
  const row =
    /^\s*\{\s*(\d+),\s*(\d+),\s*(-?\d+),\s*(0x[0-9a-fA-F]+|-?\d+),\s*(0x[0-9a-fA-F]+|-?\d+),\s*"([^"]*)"/;
  for (const line of text.split(/\r?\n/)) {
    const match = row.exec(line);
    if (match === null) continue;
    const enchantId = Number.parseInt(match[1], 10);
    const list = entries.get(enchantId) ?? [];
    list.push({
      itemClass: Number.parseInt(match[3], 10),
      maskInventoryType: Number.parseInt(match[4], match[4].startsWith("0x") ? 16 : 10),
      maskItemSubclass: Number.parseInt(match[5], match[5].startsWith("0x") ? 16 : 10),
    });
    entries.set(enchantId, list);
  }
  return entries;
}

/**
 * Splits one generated-table row into top-level tokens: a `{ ... }` group is
 * ONE token, a string literal is one token. Member N of the struct is token N.
 */
export function tokenizeRow(line) {
  const open = line.indexOf("{");
  if (open < 0) return null;
  const tokens = [];
  let depth = 0;
  let current = "";
  let inString = false;
  for (let i = open + 1; i < line.length; i += 1) {
    const char = line[i];
    if (inString) {
      current += char;
      if (char === "\\") {
        current += line[i + 1] ?? "";
        i += 1;
      } else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      current += char;
    } else if (char === "{") {
      depth += 1;
      current += char;
    } else if (char === "}") {
      if (depth === 0) {
        tokens.push(current.trim());
        return tokens.filter((token) => token.length > 0);
      }
      depth -= 1;
      current += char;
    } else if (char === "," && depth === 0) {
      tokens.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  return null;
}

/** Every member of a struct in declaration order, arrays included (one token each). */
export function structMembers(headerText, structName) {
  const lines = headerText.split(/\r?\n/);
  let bodyStart = -1;
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i].trim() !== `struct ${structName}`) continue;
    if (lines[i + 1].trim() === "{") {
      bodyStart = i + 2;
      break;
    }
  }
  if (bodyStart < 0) return null;
  const member = /^\s*(?:const\s+)?[A-Za-z_][A-Za-z0-9_:<>]*\s*\*?\s+(_[A-Za-z0-9_]+)\s*(\[[^\]]*\])?\s*;/;
  const members = [];
  for (let i = bodyStart; i < lines.length; i += 1) {
    const line = lines[i].replace(/\/\/.*$/, "");
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.includes("(")) break;
    const match = member.exec(line);
    if (match === null) continue;
    members.push(match[1]);
  }
  return members;
}

function intToken(token) {
  if (token === undefined || !/^-?\d+(?:\.0+)?$/.test(token)) return null;
  return Number.parseInt(token, 10);
}

/** The wanted spells' scalar fields, by member name, from `__spell_data`. */
export function readSpellRows(text, wantedSpellIds, members, wantedFields) {
  const wanted = new Set([...wantedSpellIds].map(Number));
  const idAt = members.indexOf("_id");
  const found = new Map();
  const start = text.indexOf("__spell_data[");
  const end = text.indexOf("\n};", start);
  for (const line of text.slice(start, end).split(/\r?\n/)) {
    if (!line.includes('{ "')) continue;
    const tokens = tokenizeRow(line);
    if (tokens === null) continue;
    const spellId = intToken(tokens[idAt]);
    if (spellId === null || !wanted.has(spellId) || found.has(spellId)) continue;
    const row = { spellId, nameEn: tokens[0].replace(/^"|"$/g, "") };
    for (const field of wantedFields) {
      const value = intToken(tokens[members.indexOf(field)]);
      if (value === null) return { ok: false, error: `spell ${String(spellId)}: ${field} is not an integer` };
      row[field] = value;
    }
    found.set(spellId, row);
  }
  return { ok: true, rows: found };
}

/** Every effect row of the wanted spells, from `__spelleffect_data`. */
export function readEffectRows(text, wantedSpellIds, members) {
  const wanted = new Set([...wantedSpellIds].map(Number));
  const at = (name) => members.indexOf(name);
  const bySpell = new Map();
  const start = text.indexOf("__spelleffect_data[");
  const end = text.indexOf("\n};", start);
  for (const line of text.slice(start, end).split(/\r?\n/)) {
    const tokens = tokenizeRow(line);
    if (tokens === null) continue;
    const spellId = intToken(tokens[at("_spell_id")]);
    if (spellId === null || !wanted.has(spellId)) continue;
    const effect = {
      effectId: intToken(tokens[at("_id")]),
      index: intToken(tokens[at("_index")]),
      type: intToken(tokens[at("_type")]),
      subtype: intToken(tokens[at("_subtype")]),
      miscValue: intToken(tokens[at("_misc_value")]),
      triggerSpellId: intToken(tokens[at("_trigger_spell_id")]),
    };
    if (Object.values(effect).some((value) => value === null)) continue;
    bySpell.set(spellId, [...(bySpell.get(spellId) ?? []), effect]);
  }
  for (const list of bySpell.values()) list.sort((a, b) => a.index - b.index);
  return bySpell;
}

/** Every spell id any `register_special_effect( <id> | { ids } , ...)` call names. */
export function censusRegisteredSpecialEffects(text) {
  const ids = new Set();
  for (const match of text.matchAll(/register_special_effect\(\s*(\d+)/g))
    ids.add(Number.parseInt(match[1], 10));
  for (const match of text.matchAll(/register_special_effect\(\s*\{([^}]*)\}/g)) {
    for (const id of match[1].matchAll(/\d+/g)) ids.add(Number.parseInt(id[0], 10));
  }
  return ids;
}

/**
 * SimulationCraft's generic reading of one use effect, from its driver and
 * trigger effect rows. `special_effect.cpp`: the "trigger" is the first
 * driver effect with a trigger spell, else the driver itself; the buff and
 * action questions are asked of the TRIGGER's effects.
 */
export function classifyGenericUseEffect({ driverId, driverEffects, spells, effectsBySpell, E }) {
  const trigger = driverEffects.find(
    (effect) => effect.triggerSpellId !== 0 && spells.has(effect.triggerSpellId),
  );
  const triggerId = trigger === undefined ? driverId : trigger.triggerSpellId;
  const effects = effectsBySpell.get(triggerId) ?? [];
  const statBuffType = (effect) => {
    if (effect.type !== E.E_APPLY_AURA) return false;
    return (
      [
        E.A_MOD_STAT,
        E.A_MOD_RATING,
        E.A_MOD_INCREASE_HEALTH_2,
        E.A_MOD_INCREASE_HEALTH,
        E.A_MOD_RESISTANCE,
        E.A_MOD_ATTACK_POWER,
        E.A_MOD_RANGED_ATTACK_POWER,
        E.A_MOD_BONUS_ARMOR,
      ].includes(effect.subtype) ||
      (effect.subtype === E.A_MOD_DAMAGE_DONE && (effect.miscValue & 0x7e) !== 0)
    );
  };
  const isStat = effects.some(statBuffType);
  const isAbsorb = effects.some(
    (effect) => effect.type === E.E_APPLY_AURA && effect.subtype === E.A_SCHOOL_ABSORB,
  );
  const buffType = isStat ? "STAT" : isAbsorb ? "ABSORB" : "NONE";
  const offensive = effects.some(
    (effect) =>
      effect.type === E.E_SCHOOL_DAMAGE ||
      effect.type === E.E_HEALTH_LEECH ||
      (effect.type === E.E_APPLY_AURA &&
        (effect.subtype === E.A_PERIODIC_DAMAGE || effect.subtype === E.A_PERIODIC_LEECH)),
  );
  const heal = effects.some(
    (effect) =>
      effect.type === E.E_HEAL || (effect.type === E.E_APPLY_AURA && effect.subtype === E.A_PERIODIC_HEAL),
  );
  const attack = effects.some(
    (effect) => effect.type === E.E_WEAPON_DAMAGE || effect.type === E.E_WEAPON_PERCENT_DAMAGE,
  );
  const resource = effects.some(
    (effect) =>
      effect.type === E.E_ENERGIZE ||
      (effect.type === E.E_APPLY_AURA && effect.subtype === E.A_PERIODIC_ENERGIZE),
  );
  const actionType = offensive ? "SPELL" : heal ? "HEAL" : attack ? "ATTACK" : resource ? "RESOURCE" : "NONE";
  // The action, when one is built, is constructed from the trigger spell (or the driver), so its cast time is that spell's.
  const actionSpell = spells.get(triggerId) ?? spells.get(driverId);
  return {
    triggerSpellId: triggerId,
    buffType,
    actionType,
    actionCastTimeMs: actionSpell?._cast_time ?? null,
  };
}

/** Every enchant id ANY gem property row points at: the forward gem → enchant link. */
export function censusGemLinkedEnchantIds(text) {
  const ids = new Set();
  const row = /^\s*\{\s*(\d+),\s*(\d+),\s*(0x[0-9a-fA-F]+|\d+),\s*(\d+)\s*\}/;
  for (const line of text.split(/\r?\n/)) {
    const match = row.exec(line);
    if (match !== null) ids.add(Number.parseInt(match[2], 10));
  }
  return ids;
}

/** `gem_data.inc`: `{ id, enchant_id, color, desc_id }`. */
export function parseGemProperties(text, wantedPropertyIds) {
  const wanted = new Set([...wantedPropertyIds].map(Number));
  const rows = new Map();
  const row = /^\s*\{\s*(\d+),\s*(\d+),\s*(0x[0-9a-fA-F]+|\d+),\s*(\d+)\s*\}/;
  for (const line of text.split(/\r?\n/)) {
    const match = row.exec(line);
    if (match === null) continue;
    const id = Number.parseInt(match[1], 10);
    if (!wanted.has(id) || rows.has(id)) continue;
    rows.set(id, { propertyId: id, enchantId: Number.parseInt(match[2], 10) });
  }
  return rows;
}

/**
 * `item_data.inc`: the gem item's name and `gem_properties`, which is the
 * first scalar after the `{ socket_color[3] }` group (item_data.hpp).
 */
export function parseGemItems(text, wantedItemIds) {
  const wanted = new Set([...wantedItemIds].map(Number));
  const rows = new Map();
  const row = /^\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*(\d+),.*?\{\s*-?\d+,\s*-?\d+,\s*-?\d+\s*\},\s*(\d+),/;
  for (const line of text.split(/\r?\n/)) {
    const match = row.exec(line);
    if (match === null) continue;
    const itemId = Number.parseInt(match[2], 10);
    if (!wanted.has(itemId) || rows.has(itemId)) continue;
    rows.set(itemId, { itemId, displayNameEn: match[1], gemPropertiesId: Number.parseInt(match[3], 10) });
  }
  return rows;
}

/** The fact the evaluator reads: does this enchant row create a use sub-action? */
export function enchantCreatesUseEffect(row, useSpellType) {
  return row.enchTypes.some((type, index) => type === useSpellType && row.enchProps[index] !== 0);
}

export function formatArtifactJson(artifact) {
  const text = JSON.stringify(artifact, null, 2);
  // Collapse short numeric arrays onto one line, as prettier will.
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

  const build = parseClientDataVersion(loaded.clientDataVersion);
  if (!build.ok) fail(build.error);

  const problems = [];
  for (const [header, structName, members] of [
    [
      "itemEnchantmentLayout",
      "item_enchantment_data_t",
      [
        "id",
        "id_gem",
        "id_scaling",
        "min_scaling_level",
        "max_scaling_level",
        "min_ilevel",
        "max_ilevel",
        "req_skill",
        "req_skill_value",
        "ench_type",
        "ench_amount",
        "ench_prop",
        "ench_coeff",
        "id_spell",
        "name",
      ],
    ],
    ["gemDataLayout", "gem_property_data_t", ["id", "enchant_id", "color", "desc_id"]],
    [
      "temporaryEnchantLayout",
      "temporary_enchant_entry_t",
      ["enchant_id", "rank", "spell_id", "tokenized_name"],
    ],
    [
      "permanentEnchantLayout",
      "permanent_enchant_entry_t",
      ["enchant_id", "rank", "item_class", "mask_inventory_type", "mask_item_subclass", "tokenized_name"],
    ],
  ]) {
    const problem = checkStructLayout(loaded[header], structName, members);
    if (problem !== null) problems.push(problem);
  }
  if (
    !/int\s+socket_color\[MAX_ITEM_SOCKET_SLOT\];\s*(?:\/\/[^\n]*)?\n\s*int\s+gem_properties;/.test(
      loaded.itemDataLayout,
    )
  ) {
    problems.push("item_data.hpp: gem_properties no longer directly follows socket_color[]");
  }

  const useSpellType = readEnumerator(loaded.dataEnums, "ITEM_ENCHANTMENT_USE_SPELL");
  if (useSpellType !== EXPECTED_USE_SPELL_TYPE) {
    problems.push(
      `ITEM_ENCHANTMENT_USE_SPELL is ${String(useSpellType)}, expected ${String(EXPECTED_USE_SPELL_TYPE)}`,
    );
  }
  if (problems.length > 0) fail(`\n  - ${problems.join("\n  - ")}`);

  const gemItems = parseGemItems(
    loaded.itemData,
    target.requiredGemItemIds.map((gem) => gem.itemId),
  );
  for (const gem of target.requiredGemItemIds) {
    if (!gemItems.has(gem.itemId)) problems.push(`gem item ${String(gem.itemId)} not found in item_data.inc`);
  }
  const gemProperties = parseGemProperties(
    loaded.gemData,
    [...gemItems.values()].map((gem) => gem.gemPropertiesId),
  );
  for (const gem of gemItems.values()) {
    if (!gemProperties.has(gem.gemPropertiesId)) {
      problems.push(
        `gem_properties ${String(gem.gemPropertiesId)} (item ${String(gem.itemId)}) not found in gem_data.inc`,
      );
    }
  }
  const gemEnchantIds = [...gemProperties.values()].map((property) => property.enchantId);
  const { rows, duplicates } = parseEnchantRows(loaded.itemEnchantment, [
    ...target.requiredEnchantIds.map((enchant) => enchant.enchantId),
    ...gemEnchantIds,
  ]);
  for (const id of duplicates) problems.push(`enchant ${String(id)} appears more than once`);
  for (const enchant of target.requiredEnchantIds) {
    if (!rows.has(enchant.enchantId)) problems.push(`enchant ${String(enchant.enchantId)} not found`);
  }
  for (const id of gemEnchantIds) if (!rows.has(id)) problems.push(`gem enchant ${String(id)} not found`);
  if (problems.length > 0) fail(`\n  - ${problems.join("\n  - ")}`);

  // ---- the universe census ----
  const census = censusUseProducingRows(loaded.itemEnchantment, useSpellType);
  const temporaryIds = parseTemporaryEnchantIds(loaded.temporaryEnchant);
  const permanentEntries = parsePermanentEnchantEntries(loaded.permanentEnchant);
  if (temporaryIds.size === 0) fail("temporary_enchant.inc parsed to zero rows");
  if (permanentEntries.size === 0) fail("permanent_enchant.inc parsed to zero rows");
  const gemLinked = censusGemLinkedEnchantIds(loaded.gemData);
  const universeRows = census.useProducing.map((row) => {
    const permanent = permanentEntries.get(row.enchantId) ?? null;
    const gemBorne = row.gemItemId !== 0 || gemLinked.has(row.enchantId);
    return {
      enchantId: row.enchantId,
      nameEn: row.nameEn,
      enchTypes: row.enchTypes,
      enchProps: row.enchProps,
      spellId: row.spellId,
      reqSkill: row.reqSkill,
      reqSkillValue: row.reqSkillValue,
      gemItemId: row.gemItemId === 0 ? null : row.gemItemId,
      /** Reached through a gem: the row's own `id_gem`, or any gem property row pointing at it. */
      gemBorne,
      temporary: temporaryIds.has(row.enchantId),
      permanent,
      /**
       * The pinned tables state a placement for this row: it is a temporary
       * enchant, a permanent enchant with an inventory-type mask, or gem-borne.
       * False means NOTHING pinned says where it can sit.
       */
      placementKnown: temporaryIds.has(row.enchantId) || permanent !== null || gemBorne,
    };
  });
  let permanentInventoryTypeMask = 0;
  for (const row of universeRows) {
    for (const entry of row.permanent ?? []) permanentInventoryTypeMask |= entry.maskInventoryType;
  }

  // ---- driver resolution (M10-C3) ----
  const E = {};
  for (const name of GENERIC_RULE_ENUMERATORS) {
    const value = readEnumerator(loaded.dataEnums, name);
    if (value === null) fail(`data_enums.hh does not define ${name}`);
    E[name] = value;
  }
  const spellMembers = structMembers(loaded.spellDataLayout, "spell_data_t");
  const effectMembers = structMembers(loaded.spellDataLayout, "spelleffect_data_t");
  if (spellMembers === null || effectMembers === null) fail("spell_data.hpp layouts not found");
  // The scalar-prefix derivation the item extractor uses must agree with the token positions here.
  const check = deriveScalarFieldIndices(loaded.spellDataLayout, ["_cooldown", "_gcd", "_cast_time"]);
  if (!check.ok) fail(check.error);
  for (const [field, offset] of Object.entries(check.indices)) {
    if (spellMembers.indexOf(field) - spellMembers.indexOf("_id") !== offset)
      fail(`layout disagreement on ${field}`);
  }
  const SPELL_FIELDS = [
    "_cooldown",
    "_gcd",
    "_category_cooldown",
    "_category",
    "_charges",
    "_charge_cooldown",
    "_internal_cooldown",
    "_cast_time",
    "_max_targets",
  ];
  const driverIds = new Set();
  for (const row of universeRows) {
    row.enchTypes.forEach((type, index) => {
      if (type === useSpellType && row.enchProps[index] !== 0) driverIds.add(row.enchProps[index]);
    });
  }
  const driverEffects = readEffectRows(loaded.spellData, driverIds, effectMembers);
  const triggerIds = new Set();
  for (const effects of driverEffects.values()) {
    for (const effect of effects) if (effect.triggerSpellId !== 0) triggerIds.add(effect.triggerSpellId);
  }
  const allSpellIds = new Set([...driverIds, ...triggerIds]);
  const spellRead = readSpellRows(loaded.spellData, allSpellIds, spellMembers, SPELL_FIELDS);
  if (!spellRead.ok) fail(spellRead.error);
  const spells = spellRead.rows;
  const effectsBySpell = readEffectRows(loaded.spellData, allSpellIds, effectMembers);
  const registered = new Map();
  for (const key of UNIQUE_GEAR_KEYS) {
    for (const id of censusRegisteredSpecialEffects(loaded[key])) {
      registered.set(id, [...(registered.get(id) ?? []), SOURCES[key]]);
    }
  }
  const describeSpell = (spellId) => {
    const spell = spells.get(spellId);
    if (spell === undefined) return null;
    return {
      spellId,
      nameEn: spell.nameEn,
      cooldownMs: spell._cooldown,
      internalCooldownMs: spell._internal_cooldown,
      categoryCooldownMs: spell._category_cooldown,
      category: spell._category,
      charges: spell._charges,
      chargeCooldownMs: spell._charge_cooldown,
      gcdMs: spell._gcd,
      castTimeMs: spell._cast_time,
      maxTargets: spell._max_targets,
      effects: (effectsBySpell.get(spellId) ?? []).map((effect) => ({
        index: effect.index,
        type: effect.type,
        subtype: effect.subtype,
        miscValue: effect.miscValue,
        triggerSpellId: effect.triggerSpellId,
      })),
    };
  };
  for (const row of universeRows) {
    row.drivers = [];
    row.enchTypes.forEach((type, index) => {
      if (type !== useSpellType || row.enchProps[index] === 0) return;
      const driverId = row.enchProps[index];
      const driver = describeSpell(driverId);
      if (driver === null) {
        row.drivers.push({ spellId: driverId, resolved: false });
        return;
      }
      const generic = classifyGenericUseEffect({
        driverId,
        driverEffects: effectsBySpell.get(driverId) ?? [],
        spells,
        effectsBySpell,
        E,
      });
      const trigger = generic.triggerSpellId === driverId ? null : describeSpell(generic.triggerSpellId);
      // special_effect_t::cooldown(): the driver's cooldown, else its internal cooldown, else zero.
      const effectiveCooldownMs =
        driver.cooldownMs > 0
          ? driver.cooldownMs
          : driver.internalCooldownMs > 0
            ? driver.internalCooldownMs
            : 0;
      const scriptedIn = registered.get(driverId) ?? [];
      row.drivers.push({
        spellId: driverId,
        resolved: true,
        driver,
        trigger,
        scriptedIn,
        generic: {
          buffType: generic.buffType,
          actionType: generic.actionType,
          actionCastTimeMs: generic.actionCastTimeMs,
          effectiveCooldownMs,
        },
      });
    });
  }
  const useEffectUniverse = {
    method: "MACHINE_EXTRACTED_DBC_RECORD",
    totalEnchantRows: census.totalRows,
    temporaryEnchantRows: temporaryIds.size,
    permanentEnchantIds: permanentEntries.size,
    useProducingRows: universeRows,
    temporaryUseProducingCount: universeRows.filter((row) => row.temporary).length,
    gemBorneUseProducingCount: universeRows.filter((row) => row.gemBorne).length,
    /** The union of every permanent use-producing row's inventory-type mask (bit = inventory type). */
    permanentUseProducingInventoryTypeMask: permanentInventoryTypeMask,
    /** Use-producing rows with no pinned placement at all. Non-zero means no slot can be closed by type. */
    unplacedUseProducingCount: universeRows.filter((row) => !row.placementKnown).length,
    /** The enumerator values the generic rules were applied with, as read from data_enums.hh. */
    genericRuleEnumerators: E,
    scriptedDriverCount: universeRows.filter((row) =>
      row.drivers.some((d) => d.resolved && d.scriptedIn.length > 0),
    ).length,
    unresolvedDriverCount: universeRows.filter((row) => row.drivers.some((d) => !d.resolved)).length,
  };

  const enchantModuleSource = sources.find((source) => source.path === SOURCES.enchantModule);
  const extractedOn =
    typeof args["extracted-on"] === "string" ? args["extracted-on"] : new Date().toISOString().slice(0, 10);

  const describe = (row, why) => ({
    enchantId: row.enchantId,
    nameEn: row.nameEn,
    enchTypes: row.enchTypes,
    enchProps: row.enchProps,
    createsUseEffect: enchantCreatesUseEffect(row, useSpellType),
    why,
  });

  const artifact = {
    artifactVersion: ARTIFACT_VERSION,
    datasetId: target.datasetId,
    artifactRevision: `simc-${args.sha.slice(0, 8)}-${String(EXTRACTOR_VERSION)}`,
    provenance: {
      repository: REPOSITORY,
      commitSha: args.sha,
      sources,
      clientDataWowVersion: build.value.wowVersion,
      clientDataHotfixDate: build.value.hotfixDate,
      clientDataHotfixBuild: build.value.hotfixBuild,
      clientDataHotfixHash: build.value.hotfixHash,
      extractor: "scripts/authority/extract-simc-enchant-effects.mjs",
      extractorVersion: EXTRACTOR_VERSION,
      extractedOn,
      method: "MACHINE_EXTRACTED_DBC_RECORD",
      useSpellEnchantType: useSpellType,
    },
    enchantSemantics: {
      method: "HAND_REVIEWED_CPP_ENCHANT_SEMANTICS",
      sourcePath: SOURCES.enchantModule,
      sourceSha256: enchantModuleSource.sha256,
      reviewedOn: extractedOn,
      checks: ENCHANT_SEMANTICS_CHECKS,
    },
    useEffectUniverse,
    enchants: target.requiredEnchantIds.map((enchant) => describe(rows.get(enchant.enchantId), enchant.why)),
    gems: target.requiredGemItemIds.map((gem) => {
      const item = gemItems.get(gem.itemId);
      const property = gemProperties.get(item.gemPropertiesId);
      return {
        itemId: item.itemId,
        displayNameEn: item.displayNameEn,
        gemPropertiesId: item.gemPropertiesId,
        enchant: describe(rows.get(property.enchantId), gem.why),
      };
    }),
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, formatArtifactJson(artifact), "utf8");
  console.log(`Wrote ${outPath}`);
  for (const enchant of artifact.enchants) {
    console.log(
      `  enchant ${String(enchant.enchantId)} types ${enchant.enchTypes.join("/")} use=${String(enchant.createsUseEffect)} ${enchant.nameEn}`,
    );
  }
  for (const gem of artifact.gems) {
    console.log(
      `  gem ${String(gem.itemId)} -> enchant ${String(gem.enchant.enchantId)} use=${String(gem.enchant.createsUseEffect)} ${gem.displayNameEn}`,
    );
  }
  console.log(
    `  universe: ${String(useEffectUniverse.totalEnchantRows)} enchant rows, ` +
      `${String(useEffectUniverse.useProducingRows.length)} use-producing ` +
      `(${String(useEffectUniverse.temporaryUseProducingCount)} temporary, ` +
      `${String(useEffectUniverse.gemBorneUseProducingCount)} gem-borne, ` +
      `permanent inventory-type mask 0x${useEffectUniverse.permanentUseProducingInventoryTypeMask.toString(16)}, ` +
      `${String(useEffectUniverse.unplacedUseProducingCount)} with no pinned placement)`,
  );
  console.log(
    `  drivers: ${String(useEffectUniverse.scriptedDriverCount)} rows with a scripted handler, ` +
      `${String(useEffectUniverse.unresolvedDriverCount)} rows whose driver spell is absent from sc_spell_data.inc`,
  );
  for (const row of universeRows) {
    for (const d of row.drivers) {
      if (!d.resolved) {
        console.log(`    ${String(row.enchantId)} driver ${String(d.spellId)} UNRESOLVED`);
        continue;
      }
      console.log(
        `    ${String(row.enchantId)} driver ${String(d.spellId)} cd ${String(d.generic.effectiveCooldownMs)} gcd ${String(d.driver.gcdMs)} ` +
          `cast ${String(d.generic.actionCastTimeMs)} buff ${d.generic.buffType} action ${d.generic.actionType}` +
          (d.scriptedIn.length > 0 ? ` SCRIPTED(${d.scriptedIn.join(",")})` : ""),
      );
    }
  }
  console.log(
    `  NOTE: ${SOURCES.enchantModule} was hashed, NOT parsed. Enchant semantics are hand-reviewed.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
