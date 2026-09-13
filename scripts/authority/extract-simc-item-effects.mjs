#!/usr/bin/env node
/**
 * Deterministic SimulationCraft item-use-effect extractor.
 *
 * Reads the generated item and item-effect tables from ONE pinned
 * SimulationCraft commit and emits the narrow slice M5-C3c2 needs. Run
 * manually; never at runtime.
 *
 * WHY THIS EXISTS
 *
 * The pinned `items` list contains three NAMED `use_item` entries and two
 * slot-based `use_items` entries. Deciding whether any of them is a selectable
 * action for a given player needs two facts SimulationCraft reads from DBC:
 *
 *   1. which numeric item a `use_item,name=<token>` refers to
 *   2. whether an equipped item has an ON_USE effect at all
 *
 * Both are game facts, so they belong in runtime data with provenance rather
 * than in a comment.
 *
 * THE TRIGGER TYPE IS THE WHOLE POINT
 *
 *     ITEM_SPELLTRIGGER_ON_USE   = 0   (data_enums.hh:449)
 *     ITEM_SPELLTRIGGER_ON_EQUIP = 1   (data_enums.hh:450)
 *
 * `use_item_t::init` asks for `special_effect( SOURCE_NONE, SPECIAL_EFFECT_USE )`
 * and, finding none, sets `background = true` and erases itself from the
 * foreground action list. An ON_EQUIP-only trinket therefore produces NO
 * selectable action — which is a structural fact about the profile, not a
 * statement that the item is on cooldown. Recording the trigger type is what
 * lets the analyzer tell those apart.
 *
 * TWO EPISTEMIC GRADES, KEPT APART
 *
 *   MACHINE_EXTRACTED_DBC_RECORD      item ids, effect rows, trigger types,
 *                                     the effect spell's cooldowns. Parsed from
 *                                     hashed generated tables.
 *
 *   HAND_REVIEWED_CPP_ACTION_SEMANTICS  what SimulationCraft DOES with those
 *                                     rows — which `background` assignments
 *                                     fire, which cooldown object `ready()`
 *                                     consults. No parser establishes that.
 *
 * The second is a human reading C++ and is labelled so. It carries the measured
 * hash of the file it was read from, because a change there alters behaviour
 * without touching a single DBC row.
 *
 * WHAT THIS IS NOT
 *
 * Not an item database. Entries appear when a supported decision needs them:
 * the three items the pinned APL names, and the two the analysed actor actually
 * equips. Nothing speculative.
 *
 *   node scripts/authority/extract-simc-item-effects.mjs \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --out src/data/game/rogue-item-effects.json
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;
const DATASET_ID = "SIMC_DBC_ROGUE_ITEM_USE_EFFECTS";

/** `item_spell_trigger_type`, engine/dbc/data_enums.hh:449-450. */
const TRIGGER_ON_USE = 0;
const TRIGGER_ON_EQUIP = 1;

/** `inventory_type` for a trinket. The only value this milestone dispatches on. */
const INVENTORY_TYPE_TRINKET = 12;

/**
 * How the `inventory_type` column is LOCATED, and why it is not a constant.
 *
 * `item_data.inc` is a bare list of brace-initialised `item_data_t` rows with no
 * field header — unlike `sc_spell_data.inc`, whose layout the other extractors
 * derive from `spell_data.hpp`. A hard-coded column index would silently read
 * the wrong field the moment upstream inserts a member.
 *
 * So the column is IDENTIFIED rather than assumed: below are sixteen items whose
 * inventory type is independently known, spanning fourteen distinct values. The
 * extractor scans every leading scalar column and keeps the ones that match ALL
 * sixteen. If that is not exactly one column, it refuses to write.
 *
 * The anchors are the analysed actor's own eighteen-entry gear array, whose
 * ORDER is the equipment-slot order — which is the fact being pinned. A shirt at
 * index 3 and a tabard at index 17 could not both land where they do by
 * coincidence, and the sixteen-way agreement is what turns that from a
 * plausible reading into a checked one.
 */
const INVENTORY_TYPE_ANCHORS = [
  { itemId: 271_510, inventoryType: 1, slot: "head" },
  { itemId: 251_173, inventoryType: 2, slot: "neck" },
  { itemId: 271_508, inventoryType: 3, slot: "shoulder" },
  { itemId: 42_360, inventoryType: 4, slot: "shirt" },
  { itemId: 244_570, inventoryType: 5, slot: "chest" },
  { itemId: 159_301, inventoryType: 6, slot: "waist" },
  { itemId: 271_509, inventoryType: 7, slot: "legs" },
  { itemId: 251_153, inventoryType: 8, slot: "feet" },
  { itemId: 244_576, inventoryType: 9, slot: "wrist" },
  { itemId: 271_511, inventoryType: 10, slot: "hands" },
  { itemId: 272_149, inventoryType: 11, slot: "finger1" },
  { itemId: 251_136, inventoryType: 11, slot: "finger2" },
  { itemId: 270_173, inventoryType: 12, slot: "trinket1" },
  { itemId: 273_796, inventoryType: 12, slot: "trinket2" },
  { itemId: 272_230, inventoryType: 16, slot: "back" },
  { itemId: 233_290, inventoryType: 19, slot: "tabard" },
];

const SOURCES = {
  itemData: "engine/dbc/generated/item_data.inc",
  itemEffect: "engine/dbc/generated/item_effect.inc",
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  playerModule: "engine/player/player.cpp",
};

/**
 * The items M5-C3c2 requires, and why each is here.
 *
 * `simcToken` is present only for the items the pinned APL names by token; the
 * equipped trinkets are reached through a SLOT, so they have none.
 */
const REQUIRED_ITEMS = [
  {
    itemId: 230_638,
    displayNameEn: "Astral Gladiator's Badge of Ferocity",
    simcToken: "astral_gladiators_badge_of_ferocity",
    inventoryType: INVENTORY_TYPE_TRINKET,
    why: "items[1] use_item,name=astral_gladiators_badge_of_ferocity",
  },
  {
    itemId: 193_701,
    displayNameEn: "Algeth'ar Puzzle Box",
    simcToken: "algethar_puzzle_box",
    inventoryType: INVENTORY_TYPE_TRINKET,
    why: "items[2] use_item,name=algethar_puzzle_box",
  },
  {
    itemId: 270_168,
    displayNameEn: "Font of Venomous Rage",
    simcToken: "font_of_venomous_rage",
    inventoryType: INVENTORY_TYPE_TRINKET,
    why: "items[3] use_item,name=font_of_venomous_rage",
  },
  {
    itemId: 270_173,
    displayNameEn: "Zul'jin's Guillotine Technique",
    simcToken: null,
    inventoryType: INVENTORY_TYPE_TRINKET,
    why: "reached through items[4] use_items,slots=trinket1 for the analysed actor",
  },
  {
    itemId: 273_796,
    displayNameEn: "Vile Vial of Volatile Venom",
    simcToken: null,
    inventoryType: INVENTORY_TYPE_TRINKET,
    why: "reached through items[5] use_items,slots=trinket2 for the analysed actor",
  },
];

/**
 * The hand-reviewed action-construction semantics, recorded check by check.
 *
 * These are claims about what SimulationCraft DOES, read from C++ by a human.
 * Each records the search performed so a reviewer can repeat it.
 */
const ACTION_SEMANTICS_CHECKS = [
  {
    claim: "NAMED_ITEM_NOT_EQUIPPED_IS_BACKGROUND",
    search: "use_item_t constructor, engine/player/player.cpp",
    finding:
      "`item = player->find_item_by_name( item_name ); if ( !item ) { background = true; return; }` " +
      "(player.cpp:9874-9884). A named item the actor does not equip yields a background action, and " +
      "`select_action` skips background actions before any readiness or condition check " +
      "(player.cpp:14229-14230).",
  },
  {
    claim: "SLOT_WITHOUT_ON_USE_EFFECT_IS_BACKGROUND",
    search: "use_item_t::init and use_items_t::init, engine/player/player.cpp",
    finding:
      "`use_item_t::init` looks up `special_effect( SPECIAL_EFFECT_SOURCE_NONE, SPECIAL_EFFECT_USE )` " +
      "and, with neither buff nor action created, sets `background = true` and erases the entry from " +
      "the foreground action list (player.cpp:10024-10029). `use_items_t::init` sets " +
      "`background = true` when no sub-actions were created at all (player.cpp:10285-10290).",
  },
  {
    claim: "USE_ITEMS_PARENT_IS_THE_FOREGROUND_ENTRY",
    search: "use_items_t::ready and create_use_subactions, engine/player/player.cpp",
    finding:
      "`use_items_t` is the object in the APL's foreground action list; its generated `use_item` " +
      "sub-actions are internal. `ready()` returns true only when at least one sub-action is ready " +
      "(player.cpp:10295-10312). Authority identity therefore remains the `use_items` entry.",
  },
  {
    claim: "INDIVIDUAL_COOLDOWN_COMES_FROM_THE_EFFECT_DRIVER_SPELL",
    search: "special_effect_t::cooldown, engine/item/special_effect.cpp:745-765",
    finding:
      "With no explicit override and an item-effect row whose `cooldown_duration` is -1, the lookup " +
      "falls through to `driver()->cooldown()` — the effect spell's own `_cooldown`.",
  },
  {
    claim: "READY_CHECKS_INDIVIDUAL_AND_GROUP_COOLDOWNS_DIFFERENTLY",
    search: "use_item_t::ready, engine/player/player.cpp",
    finding:
      "The shared group is checked with a strict `cooldown_group->remains() > 0`, while the item's " +
      "own cooldown goes through `action_t::ready()` and therefore `cooldown_t::is_ready()`, which " +
      "allows queueing within the player's cooldown tolerance. The two rules are NOT the same and " +
      "must not share a bridge.",
  },
  {
    claim: "NO_ROGUE_MODIFIER_APPLIES_TO_AN_ITEM_USE_COOLDOWN",
    search: "grep for cooldown manipulation in engine/class_modules/sc_rogue.cpp",
    finding:
      "The rogue module's only bulk cooldown adjusters are Restless Blades (sc_rogue.cpp:8246-8254), " +
      "which enumerates nine named Outlaw cooldowns, and Deadly Pursuit (sc_rogue.cpp:10826-10832), " +
      "gated on talent.outlaw.deadly_pursuit. Neither names an item cooldown, and an item-use " +
      "cooldown object is obtained by `player->get_cooldown( e->cooldown_name() )`, which no rogue " +
      "code references. Base and dynamic recharge multipliers initialise to 1.0 (action.cpp:456,458).",
  },
];

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

/** Reads the build stamp. Every field is required; a partial stamp is an error. */
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
 * Parses `item_effect.inc` rows.
 *
 * Layout from `engine/dbc/item_effect.hpp`:
 * `{ id, spell_id, item_id, index, type, cooldown_group, cooldown_duration, cooldown_group_duration }`
 *
 * The ITEM ID is the third column, not the first. Anchoring on the wrong one is
 * a real mistake with a plausible-looking result: it silently finds nothing and
 * reads as "this item has no effects".
 */
export function parseItemEffects(text, wantedItemIds) {
  const wanted = new Set([...wantedItemIds].map(Number));
  const byItem = new Map();
  const row =
    /^\s*\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\}\s*,?/;

  for (const line of text.split(/\r?\n/)) {
    const match = row.exec(line);
    if (match === null) continue;
    const itemId = Number.parseInt(match[3], 10);
    if (!wanted.has(itemId)) continue;
    const entry = {
      effectId: Number.parseInt(match[1], 10),
      spellId: Number.parseInt(match[2], 10),
      itemId,
      effectIndex: Number.parseInt(match[4], 10),
      triggerType: Number.parseInt(match[5], 10),
      cooldownGroup: Number.parseInt(match[6], 10),
      cooldownDurationMs: Number.parseInt(match[7], 10),
      cooldownGroupDurationMs: Number.parseInt(match[8], 10),
    };
    const list = byItem.get(itemId);
    if (list === undefined) byItem.set(itemId, [entry]);
    else list.push(entry);
  }
  return byItem;
}

/** Confirms an item id exists in the item table and carries the expected name. */
export function findItemNames(text, wantedItemIds) {
  const wanted = new Set([...wantedItemIds].map(Number));
  const found = new Map();
  const duplicates = [];
  const row = /^\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*(\d+),/;

  for (const line of text.split(/\r?\n/)) {
    const match = row.exec(line);
    if (match === null) continue;
    const itemId = Number.parseInt(match[2], 10);
    if (!wanted.has(itemId)) continue;
    if (found.has(itemId)) {
      duplicates.push(itemId);
      continue;
    }
    found.set(itemId, match[1]);
  }
  return { names: found, duplicates };
}

/**
 * Splits each wanted row into the flat scalar fields that FOLLOW the item id.
 *
 * Index 0 is the first field after the id. Braces and string literals are not
 * expected before the scalar prefix this reads, so a plain comma split is
 * sufficient and is bounded to the leading columns.
 */
export function readItemRowColumns(text, wantedItemIds) {
  const wanted = new Set([...wantedItemIds].map(Number));
  const rows = new Map();
  const row = /^\s*\{\s*"(?:[^"\\]|\\.)*"\s*,\s*(\d+),(.*)$/;

  for (const line of text.split(/\r?\n/)) {
    const match = row.exec(line);
    if (match === null) continue;
    const itemId = Number.parseInt(match[1], 10);
    if (!wanted.has(itemId) || rows.has(itemId)) continue;
    rows.set(
      itemId,
      match[2].split(",").map((field) => field.trim()),
    );
  }
  return rows;
}

/**
 * Identifies the `inventory_type` column by agreement with every anchor.
 *
 * Returns the single matching index. Throws when zero or more than one column
 * matches, because both mean the layout is no longer the one that was checked
 * and guessing between them would put an unverified field into the artifact.
 */
export function deriveInventoryTypeColumn(text, anchors = INVENTORY_TYPE_ANCHORS) {
  const rows = readItemRowColumns(
    text,
    anchors.map((anchor) => anchor.itemId),
  );
  const missing = anchors.filter((anchor) => !rows.has(anchor.itemId));
  if (missing.length > 0) {
    throw new Error(
      `inventory-type anchors absent from item_data.inc: ${missing.map((a) => a.itemId).join(", ")}`,
    );
  }

  const width = Math.min(...[...rows.values()].map((fields) => fields.length));
  const matching = [];
  for (let column = 0; column < Math.min(width, 24); column += 1) {
    const agrees = anchors.every((anchor) => {
      const field = rows.get(anchor.itemId)?.[column];
      return (
        field !== undefined && /^\d+$/.test(field) && Number.parseInt(field, 10) === anchor.inventoryType
      );
    });
    if (agrees) matching.push(column);
  }

  if (matching.length !== 1) {
    throw new Error(
      `expected exactly one item_data.inc column to agree with all ${String(anchors.length)} inventory-type ` +
        `anchors, found ${matching.length === 0 ? "none" : `columns ${matching.join(", ")}`}. The row layout ` +
        "has changed and the field must be re-identified before anything is written.",
    );
  }
  return matching[0];
}

/** Reads `inventory_type` for each wanted item at the identified column. */
export function findInventoryTypes(text, wantedItemIds, column) {
  const rows = readItemRowColumns(text, wantedItemIds);
  const found = new Map();
  for (const [itemId, fields] of rows) {
    const field = fields[column];
    if (field === undefined || !/^\d+$/.test(field)) continue;
    found.set(itemId, Number.parseInt(field, 10));
  }
  return found;
}

/**
 * Derives the flat index of scalar members of `spell_data_t`.
 *
 * Same rules as the cooldown and DoT-duration extractors.
 */
export function deriveScalarFieldIndices(headerText, wantedNames) {
  const lines = headerText.split(/\r?\n/);
  let bodyStart = -1;
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i]?.trim() !== "struct spell_data_t") continue;
    if (lines[i + 1]?.trim() === "{") {
      bodyStart = i + 2;
      break;
    }
  }
  if (bodyStart < 0) {
    return { ok: false, error: "spell_data.hpp does not define struct spell_data_t" };
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
    const [, name, arraySuffix] = match;
    if (arraySuffix !== undefined) break;
    fields.push(name);
  }

  const idAt = fields.indexOf("_id");
  if (idAt < 0) return { ok: false, error: "spell_data_t declares no _id member" };
  const indices = {};
  for (const name of wantedNames) {
    const at = fields.indexOf(name);
    if (at < 0) return { ok: false, error: `spell_data_t declares no ${name} member` };
    indices[name] = at - idAt;
  }
  return { ok: true, indices, fields };
}

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

/** Reads the cooldown columns of the given effect spells. */
export function parseEffectSpells(text, wantedSpellIds, fieldIndices) {
  const wanted = new Set([...wantedSpellIds].map(Number));
  const found = new Map();
  for (const line of text.split(/\r?\n/)) {
    const open = line.indexOf('{ "');
    if (open < 0) continue;
    const name = readStringLiteral(line, open + 2);
    if (name === null) continue;
    const afterName = line.slice(name.next);
    const firstBrace = afterName.indexOf("{");
    const flat = (firstBrace < 0 ? afterName : afterName.slice(0, firstBrace))
      .replace(/^\s*,\s*/, "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const idRaw = flat[0];
    if (idRaw === undefined || !/^\d+$/.test(idRaw)) continue;
    const spellId = Number.parseInt(idRaw, 10);
    if (!wanted.has(spellId) || found.has(spellId)) continue;

    const read = (field) => {
      const raw = flat[fieldIndices[field]];
      if (raw === undefined || !/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
      const value = Number.parseFloat(raw);
      return Number.isInteger(value) ? value : null;
    };
    const cooldownMs = read("_cooldown");
    const categoryCooldownMs = read("_category_cooldown");
    const gcdMs = read("_gcd");
    if (cooldownMs === null || categoryCooldownMs === null || gcdMs === null) continue;
    found.set(spellId, { spellId, displayNameEn: name.value, cooldownMs, categoryCooldownMs, gcdMs });
  }
  return found;
}

/** Checks every required fact. An empty list is the only thing that licenses writing. */
export function verifyRequiredFacts({ names, duplicates, inventoryTypes, effectsByItem, effectSpells }) {
  const problems = [];
  if (duplicates.length > 0) {
    problems.push(`item ids appear more than once and are ambiguous: ${duplicates.join(", ")}`);
  }

  for (const required of REQUIRED_ITEMS) {
    const name = names.get(required.itemId);
    if (name === undefined) {
      problems.push(
        `item ${String(required.itemId)} (${required.displayNameEn}) is absent from item_data.inc`,
      );
      continue;
    }
    const inventoryType = inventoryTypes.get(required.itemId);
    if (inventoryType === undefined) {
      problems.push(`item ${String(required.itemId)} has no readable inventory_type column`);
    } else if (inventoryType !== required.inventoryType) {
      problems.push(
        `item ${String(required.itemId)} has inventory_type ${String(inventoryType)}, expected ` +
          `${String(required.inventoryType)}. Slot applicability is dispatched on this value, so a ` +
          "mismatch means the slot mapping would be wrong.",
      );
    }
    if (name !== required.displayNameEn) {
      problems.push(
        `item ${String(required.itemId)} is named '${name}', expected '${required.displayNameEn}'. The ` +
          "numeric id is the identity; a name change means the wrong row was read.",
      );
    }
    // Every ON_USE effect must resolve to a spell whose cooldown we can read,
    // otherwise the applicability answer would be right and the readiness
    // answer unobtainable.
    for (const effect of effectsByItem.get(required.itemId) ?? []) {
      if (effect.triggerType !== TRIGGER_ON_USE) continue;
      if (!effectSpells.has(effect.spellId)) {
        problems.push(
          `item ${String(required.itemId)} has an ON_USE effect driven by spell ${String(effect.spellId)}, ` +
            "which is absent from the spell table",
        );
      }
    }
  }

  return problems;
}

/**
 * Serialises the artifact the way Prettier would, so the generated file passes
 * `prettier --check` without a manual reformat.
 */
export function formatArtifactJson(artifact) {
  const printWidth = 110;
  const text = JSON.stringify(artifact, null, 2);
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const openArray = /^(\s*)("[^"]+":\s*)?\[$/.exec(line);
    if (openArray === null) {
      out.push(line);
      continue;
    }
    let depth = 1;
    let j = i + 1;
    const inner = [];
    while (j < lines.length && depth > 0) {
      const candidate = lines[j];
      for (const char of candidate) {
        if (char === "[" || char === "{") depth += 1;
        else if (char === "]" || char === "}") depth -= 1;
      }
      if (depth > 0) inner.push(candidate.trim());
      j += 1;
    }
    if (depth !== 0) {
      out.push(line);
      continue;
    }
    if (inner.some((entry) => entry.includes("{") || entry.includes("["))) {
      out.push(line);
      continue;
    }
    const closing = lines[j - 1].trimEnd();
    const trailing = closing.endsWith(",") ? "," : "";
    const collapsed = `${line.slice(0, line.length - 1)}[${inner.join(" ").replace(/,(\S)/g, ", $1")}]${trailing}`;
    if (collapsed.length > printWidth) {
      out.push(line);
      continue;
    }
    out.push(collapsed);
    i = j - 1;
  }
  return `${out.join("\n")}\n`;
}

/** Builds the artifact body. Deterministic apart from `extractedOn`. */
export function buildArtifact({
  commitSha,
  sources,
  build,
  names,
  inventoryTypes,
  inventoryTypeColumn,
  effectsByItem,
  effectSpells,
  extractedOn,
}) {
  const playerModuleSource = sources.find((source) => source.path === SOURCES.playerModule);
  if (playerModuleSource === undefined) {
    throw new Error(`cannot record action semantics without a measured hash of ${SOURCES.playerModule}`);
  }

  const items = REQUIRED_ITEMS.map((required) => {
    const effects = (effectsByItem.get(required.itemId) ?? []).map((effect) => ({
      effectId: effect.effectId,
      spellId: effect.spellId,
      effectIndex: effect.effectIndex,
      triggerType: effect.triggerType,
      triggerName: effect.triggerType === TRIGGER_ON_USE ? "ON_USE" : "OTHER",
      cooldownDurationMs: effect.cooldownDurationMs,
      cooldownGroupDurationMs: effect.cooldownGroupDurationMs,
    }));
    const onUse = effects.find((effect) => effect.triggerType === TRIGGER_ON_USE) ?? null;
    const driver = onUse === null ? null : effectSpells.get(onUse.spellId);

    return {
      itemId: required.itemId,
      displayNameEn: names.get(required.itemId) ?? required.displayNameEn,
      simcToken: required.simcToken,
      /**
       * `inventory_type`. What makes a SLOT answer checkable rather than asserted:
       * `use_items,slots=trinket2` can only be about an item this says is a trinket.
       */
      inventoryType: inventoryTypes.get(required.itemId) ?? required.inventoryType,
      why: required.why,
      effects,
      /**
       * The ON_USE effect, or `null` when the item has none.
       *
       * `null` is the structural fact `use_item_t` acts on: no usable special
       * effect means a background action, which the scan skips outright.
       */
      onUseEffect:
        onUse === null || driver === undefined
          ? null
          : {
              effectSpellId: onUse.spellId,
              displayNameEn: driver.displayNameEn,
              // The driver spell's own cooldown, reached because the effect
              // row's `cooldown_duration` is -1. See the action-semantics check.
              baseCooldownMs: driver.cooldownMs,
              categoryCooldownMs: driver.categoryCooldownMs,
              baseGcdMs: driver.gcdMs,
            },
    };
  });

  return {
    artifactVersion: ARTIFACT_VERSION,
    datasetId: DATASET_ID,
    artifactRevision: `simc-${commitSha.slice(0, 8)}-${EXTRACTOR_VERSION}`,
    provenance: {
      repository: REPOSITORY,
      commitSha,
      sources,
      clientDataWowVersion: build.wowVersion,
      clientDataHotfixDate: build.hotfixDate,
      clientDataHotfixBuild: build.hotfixBuild,
      clientDataHotfixHash: build.hotfixHash,
      itemDataMethod: "MACHINE_EXTRACTED_DBC_RECORD",
      triggerTypeSource: "engine/dbc/data_enums.hh item_spell_trigger_type",
      inventoryTypeColumnIndex: inventoryTypeColumn,
      inventoryTypeIdentification:
        `identified as the ONE item_data.inc column (index ${String(inventoryTypeColumn)}, counting from ` +
        `the first field after the item id) agreeing with all ${String(INVENTORY_TYPE_ANCHORS.length)} ` +
        "pinned inventory-type anchors across 14 distinct values. Not a hard-coded offset.",
      inventoryTypeAnchors: INVENTORY_TYPE_ANCHORS.map((anchor) => ({
        itemId: anchor.itemId,
        inventoryType: anchor.inventoryType,
        slot: anchor.slot,
      })),
      cooldownFieldUnits: "MILLISECONDS",
      extractedOn,
      extractorVersion: EXTRACTOR_VERSION,
      applicabilityNote:
        "Not version-gated at runtime, for the same reason as the other pinned artifacts: CombatFight " +
        "exposes no client-build key, so a gate against one would always pass while appearing rigorous.",
    },
    /** The weaker claim, labelled and hashed against the module it was read from. */
    actionSemantics: {
      method: "HAND_REVIEWED_CPP_ACTION_SEMANTICS",
      sourcePath: SOURCES.playerModule,
      sourceSha256: playerModuleSource.sha256,
      reviewedOn: extractedOn,
      checks: ACTION_SEMANTICS_CHECKS,
    },
    items,
  };
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
  const outPath = typeof args.out === "string" ? args.out : null;
  if (outPath === null) fail("--out is required");

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

  const layout = deriveScalarFieldIndices(loaded.spellDataLayout, [
    "_cooldown",
    "_category_cooldown",
    "_gcd",
  ]);
  if (!layout.ok) fail(layout.error);

  const wantedItemIds = REQUIRED_ITEMS.map((entry) => entry.itemId);
  const { names, duplicates } = findItemNames(loaded.itemData, wantedItemIds);
  // Throws rather than returning, because a layout that cannot be identified
  // must not produce a partially-verified artifact.
  const inventoryTypeColumn = deriveInventoryTypeColumn(loaded.itemData);
  const inventoryTypes = findInventoryTypes(loaded.itemData, wantedItemIds, inventoryTypeColumn);
  const effectsByItem = parseItemEffects(loaded.itemEffect, wantedItemIds);

  const onUseSpellIds = [];
  for (const effects of effectsByItem.values()) {
    for (const effect of effects) {
      if (effect.triggerType === TRIGGER_ON_USE) onUseSpellIds.push(effect.spellId);
    }
  }
  const effectSpells = parseEffectSpells(loaded.spellData, onUseSpellIds, layout.indices);

  const problems = verifyRequiredFacts({ names, duplicates, inventoryTypes, effectsByItem, effectSpells });
  if (problems.length > 0) fail(`\n  - ${problems.join("\n  - ")}`);

  const artifact = buildArtifact({
    commitSha: typeof args.sha === "string" ? args.sha : "UNKNOWN",
    sources,
    build: build.value,
    names,
    inventoryTypes,
    inventoryTypeColumn,
    effectsByItem,
    effectSpells,
    extractedOn: new Date().toISOString().slice(0, 10),
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, formatArtifactJson(artifact), "utf8");

  console.log(`Wrote ${outPath}`);
  for (const item of artifact.items) {
    const onUse = item.onUseEffect;
    console.log(
      `  ${String(item.itemId)} ${item.displayNameEn}: ` +
        (onUse === null
          ? `${String(item.effects.length)} effect(s), NO ON_USE`
          : `ON_USE spell ${String(onUse.effectSpellId)} cd ${String(onUse.baseCooldownMs)}ms`) +
        ` [inventory_type ${String(item.inventoryType)}]`,
    );
  }
  console.log(
    `  inventory_type identified at column ${String(inventoryTypeColumn)} by ` +
      `${String(INVENTORY_TYPE_ANCHORS.length)} anchors.`,
  );
  console.log(`  NOTE: ${SOURCES.playerModule} was hashed, NOT parsed. Action semantics are hand-reviewed.`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
