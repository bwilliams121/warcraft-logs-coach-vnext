#!/usr/bin/env node
/**
 * Deterministic SimulationCraft CONSUMABLE identity extractor (M11-G3-2).
 *
 * Emits two pinned facts tables, nothing judged:
 *
 * 1. TEMPORARY ENCHANTS — `temporary_enchant.inc`: enchant id -> the engine's
 *    temporary_enchant token and rank (e.g. 8052 -> thalassian_phoenix_oil
 *    rank 2 -> `thalassian_phoenix_oil_2`). A Warcraft Logs gear row carries the
 *    enchant id; this is how it becomes an engine identity.
 * 2. CONSUMABLE AURAS — consumable items (`item_data.inc`, item class 0) of the
 *    current content (required level >= MIN_REQUIRED_LEVEL), joined to the
 *    spells they apply (`item_effect.inc`): aura spell id -> kind + item ids.
 *    An aura observed on a player at pull can then be named a flask, food,
 *    potion or augment rune from pinned data — or stays UNKNOWN when the spell
 *    is not in the table. Several items (quality ranks) may share one aura, so
 *    an aura identifies the consumable, not necessarily its rank.
 * 3. RANK OPTIONS (M11-G3-4) — for each aura, every distinct item level of the
 *    items applying it, with an engine token (`tokenize(name)_<crafting
 *    quality>`) and that token's CANDIDATES: every consumable item of the same
 *    subclass the engine's match predicate could select (consumable.cpp
 *    find_consumable: the tokenized item name contains the token's name part,
 *    and crafting quality equals the suffix, or is 1 for an unsuffixed token).
 *    A token is UNAMBIGUOUS only when every candidate applies the same aura at
 *    the same item level — so the result does not depend on the engine's
 *    iteration order, which the local pinned sources do not include.
 *    AUGMENT RUNES (kind OTHER) are not looked up by item name: the engine's
 *    augmentation_t::driver() (consumable.cpp) maps a keyword to a spell with
 *    an ordered str_in_str_ci chain. A rune's token is the first keyword for its
 *    spell; it is unambiguous only when no earlier keyword in the chain is a
 *    substring of it and the rune's items share one item level.
 *
 * Local pinned copies only, each SHA-256 recorded.
 *
 *   node scripts/authority/extract-simc-consumables.mjs \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --file-temporaryEnchant <temporary_enchant.inc> --file-itemData <item_data.inc> \
 *     --file-itemEffect <item_effect.inc> --file-clientDataVersion <client_data_version.inc> \
 *     --file-consumableCpp <consumable.cpp> \
 *     --out src/data/simulation-models/<model>/consumables.json
 *
 * Version history:
 *   3  the consumable.cpp source was LABELLED engine/item/consumable.cpp, a
 *      path that does not exist at the pinned commits; the hash recorded was
 *      of the real file (engine/player/consumable.cpp).
 *   4  M11 model registry: the label is the real path, and an empty or
 *      keyword-chain-less consumable.cpp fails closed. Extraction semantics
 *      are unchanged: v3 and v4 artifacts from the same sources differ only in
 *      provenance (path label, extractor version, artifact revision).
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { format, resolveConfig } from "prettier";

import { parseArgs, parseClientDataVersion, sourceHashProblem } from "./extract-simc-talents.mjs";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 4;
const MIN_REQUIRED_LEVEL = 80;

const SOURCES = {
  temporaryEnchant: "engine/dbc/generated/temporary_enchant.inc",
  itemData: "engine/dbc/generated/item_data.inc",
  itemEffect: "engine/dbc/generated/item_effect.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  consumableCpp: "engine/player/consumable.cpp",
};

/** The ordered augmentation keyword chain: [keyword, spell id] in source order. */
export function parseAugmentationDrivers(text) {
  const start = text.indexOf("struct augmentation_t");
  const end = text.indexOf("void init() override", start);
  if (start < 0 || end < 0) return [];
  const body = text.slice(start, end);
  return [
    ...body.matchAll(
      /str_in_str_ci\(\s*consumable_name,\s*"([a-z_]+)"\s*\)\s*\)\s*return player->find_spell\(\s*(\d+)\s*\)/g,
    ),
  ].map((m) => [m[1], Number(m[2])]);
}

/** Rune options from the keyword chain (see the header). */
export function runeOptions(entry, drivers) {
  const levels = [...new Set(entry.items.map((item) => item.itemLevel))];
  const index = drivers.findIndex(([, spellId]) => spellId === entry.spellId);
  if (index < 0)
    return levels.map((itemLevel) => ({ itemLevel, token: "", candidateItemIds: [], unambiguous: false }));
  const keyword = drivers[index][0];
  const shadowed = drivers.slice(0, index).some(([earlier]) => keyword.includes(earlier));
  return levels.map((itemLevel) => ({
    itemLevel,
    token: keyword,
    candidateItemIds: entry.items.map((item) => item.itemId).sort((a, b) => a - b),
    unambiguous: !shadowed && levels.length === 1,
  }));
}

/** Item class 0 (consumable) subclasses, from the client's ItemSubClass table. */
const CONSUMABLE_KINDS = { 1: "POTION", 3: "FLASK", 5: "FOOD", 8: "OTHER" };

function fail(message) {
  console.error(`EXTRACTION FAILED: ${message}`);
  process.exit(1);
}

export function parseTemporaryEnchants(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*\{\s*(\d+),\s*(\d+),\s*(\d+),\s*"([a-z0-9_]+)"\s*\}/.exec(line);
    if (m === null) continue;
    const rank = Number(m[2]);
    rows.push({
      enchantId: Number(m[1]),
      rank,
      spellId: Number(m[3]),
      baseToken: m[4],
      token: rank > 0 ? `${m[4]}_${String(rank)}` : m[4],
    });
  }
  return rows;
}

/** The engine's util::tokenize (util.cpp:3234): leading _/+ dropped, non-ASCII dropped, lowercase, space -> _, keep [a-z0-9_+.%]. */
export function engineTokenize(name) {
  let out = "";
  for (const ch of name.replace(/^[_+]+/, "")) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x80) continue;
    if (/[A-Za-z]/.test(ch)) out += ch.toLowerCase();
    else if (ch === " ") out += "_";
    else if (ch === "_" || ch === "+" || ch === "." || ch === "%" || /[0-9]/.test(ch)) out += ch;
  }
  return out;
}

/** Every class-0 (consumable) item row, any level: name, id, level, subclass, crafting quality (last field). */
export function parseAllConsumableRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const m =
      /^\s*\{\s*"((?:[^"\\]|\\.)*)",\s*(\d+),\s*0x[0-9a-f]+,\s*0x[0-9a-f]+,\s*0x[0-9a-f]+,\s*(-?\d+),\s*(-?\d+),\s*-?\d+,\s*-?\d+,\s*(-?\d+),\s*-?\d+,\s*(-?\d+),\s*(-?\d+),.*,\s*(-?\d+)\s*\},?\s*$/i.exec(
        line,
      );
    if (m === null) continue;
    const [, name, id, level, , , itemClass, itemSubclass, craftingQuality] = m;
    if (Number(itemClass) !== 0) continue;
    rows.push({
      itemId: Number(id),
      name,
      itemLevel: Number(level),
      subclass: Number(itemSubclass),
      craftingQuality: Number(craftingQuality),
    });
  }
  return rows;
}

/**
 * Rank options for one aura: per distinct item level, the lowest-id item's
 * engine token and every item the engine predicate could resolve it to.
 */
export function rankOptions(entry, allRows, auraOfItem) {
  const byLevel = new Map();
  for (const item of entry.items) {
    const list = byLevel.get(item.itemLevel) ?? [];
    list.push(item);
    byLevel.set(item.itemLevel, list);
  }
  return [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([itemLevel, items]) => {
      const chosen = [...items].sort((a, b) => a.itemId - b.itemId)[0];
      const base = engineTokenize(chosen.name);
      const quality = chosen.craftingQuality;
      const token = quality > 0 ? `${base}_${String(quality)}` : base;
      const subclass = allRows.find((row) => row.itemId === chosen.itemId)?.subclass ?? -1;
      const candidates = allRows
        .filter(
          (row) =>
            row.subclass === subclass &&
            engineTokenize(row.name).includes(base) &&
            (quality > 0
              ? row.craftingQuality === quality
              : row.craftingQuality === 1 || row.craftingQuality === 0),
        )
        .map((row) => row.itemId)
        .sort((a, b) => a - b);
      const unambiguous =
        candidates.length > 0 &&
        candidates.every((itemId) => {
          const row = allRows.find((candidate) => candidate.itemId === itemId);
          return auraOfItem.get(itemId)?.has(entry.spellId) === true && row?.itemLevel === itemLevel;
        });
      return { itemLevel, token, candidateItemIds: candidates, unambiguous };
    });
}

/** `{ "name", id, flags1, flags2, type_flags, level, req_level, req_skill, req_skill_level, quality, inventory_type, item_class, item_subclass, ...` */
export function parseConsumableItems(text) {
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    const m =
      /^\s*\{\s*"((?:[^"\\]|\\.)*)",\s*(\d+),\s*0x[0-9a-f]+,\s*0x[0-9a-f]+,\s*0x[0-9a-f]+,\s*(-?\d+),\s*(-?\d+),\s*-?\d+,\s*-?\d+,\s*(-?\d+),\s*-?\d+,\s*(-?\d+),\s*(-?\d+),/i.exec(
        line,
      );
    if (m === null) continue;
    const [, name, id, level, reqLevel, quality, itemClass, itemSubclass] = m;
    if (Number(itemClass) !== 0 || Number(reqLevel) < MIN_REQUIRED_LEVEL) continue;
    const kind = CONSUMABLE_KINDS[Number(itemSubclass)];
    if (kind === undefined) continue;
    items.push({ itemId: Number(id), name, itemLevel: Number(level), quality: Number(quality), kind });
  }
  return items;
}

/** `{ id, spell_id, item_id, index, trigger, ... }` */
export function parseItemEffects(text) {
  const effects = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*\{\s*(\d+),\s*(\d+),\s*(\d+),/.exec(line);
    if (m === null) continue;
    effects.push({ spellId: Number(m[2]), itemId: Number(m[3]) });
  }
  return effects;
}

export function joinConsumableAuras(items, effects) {
  const byItem = new Map(items.map((item) => [item.itemId, item]));
  const bySpell = new Map();
  for (const effect of effects) {
    const item = byItem.get(effect.itemId);
    if (item === undefined || effect.spellId === 0) continue;
    const entry = bySpell.get(effect.spellId) ?? { spellId: effect.spellId, kinds: new Set(), items: [] };
    entry.kinds.add(item.kind);
    entry.items.push({
      itemId: item.itemId,
      name: item.name,
      itemLevel: item.itemLevel,
      quality: item.quality,
      craftingQuality: item.craftingQuality,
    });
    bySpell.set(effect.spellId, entry);
  }
  return [...bySpell.values()]
    .map((entry) => ({
      spellId: entry.spellId,
      kind: entry.kinds.size === 1 ? [...entry.kinds][0] : "AMBIGUOUS",
      items: entry.items.sort((a, b) => a.itemId - b.itemId),
    }))
    .sort((a, b) => a.spellId - b.spellId);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.sha !== "string" || !/^[0-9a-f]{40}$/.test(args.sha))
    fail("--sha must be the full pinned commit");
  const loaded = {};
  const sources = [];
  for (const [key, path] of Object.entries(SOURCES)) {
    if (typeof args[`file-${key}`] !== "string") fail(`pass --file-${key}: local pinned copies only`);
    const buffer = readFileSync(args[`file-${key}`]);
    if (buffer.length === 0) fail(`--file-${key} is empty: ${path}`);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const problem = sourceHashProblem(path, args[`expect-${key}-sha256`], sha256);
    if (problem !== null) fail(problem);
    loaded[key] = buffer.toString("utf8");
    sources.push({ path, sha256, byteLength: buffer.length });
  }
  if (parseAugmentationDrivers(loaded.consumableCpp).length === 0) {
    fail("consumable.cpp: no augmentation_t keyword chain found (wrong or truncated source)");
  }
  const clientDataWowVersion = parseClientDataVersion(loaded.clientDataVersion);
  if (clientDataWowVersion === null) fail("client_data_version.inc has no CLIENT_DATA_WOW_VERSION");
  const temporaryEnchants = parseTemporaryEnchants(loaded.temporaryEnchant);
  const declared = /std::array<temporary_enchant_entry_t,\s*(\d+)>/.exec(loaded.temporaryEnchant);
  if (declared === null || Number(declared[1]) !== temporaryEnchants.length) {
    fail(
      `parsed ${String(temporaryEnchants.length)} temporary enchants, table declares ${declared?.[1] ?? "?"}`,
    );
  }
  const items = parseConsumableItems(loaded.itemData);
  if (items.length === 0) fail("no consumable items parsed; item_data layout changed");
  const effects = parseItemEffects(loaded.itemEffect);
  const allRows = parseAllConsumableRows(loaded.itemData);
  const quality = new Map(allRows.map((row) => [row.itemId, row.craftingQuality]));
  const auraOfItem = new Map();
  for (const effect of effects) {
    const set = auraOfItem.get(effect.itemId) ?? new Set();
    set.add(effect.spellId);
    auraOfItem.set(effect.itemId, set);
  }
  const consumableAuras = joinConsumableAuras(
    items.map((item) => ({ ...item, craftingQuality: quality.get(item.itemId) ?? 0 })),
    effects,
  ).map((entry) => ({
    ...entry,
    rankOptions:
      entry.kind === "OTHER"
        ? runeOptions(entry, parseAugmentationDrivers(loaded.consumableCpp))
        : rankOptions(entry, allRows, auraOfItem),
  }));
  const artifact = {
    artifactVersion: 1,
    datasetId: "SIMC_CONSUMABLES",
    artifactRevision: `simc-${args.sha.slice(0, 8)}-${String(EXTRACTOR_VERSION)}`,
    provenance: {
      repository: REPOSITORY,
      commitSha: args.sha,
      sources,
      clientDataWowVersion,
      method: "MACHINE_EXTRACTED_CONSUMABLE_JOIN",
      extractorVersion: EXTRACTOR_VERSION,
      scope: `item class 0 subclasses ${JSON.stringify(CONSUMABLE_KINDS)} with required level >= ${String(MIN_REQUIRED_LEVEL)}`,
    },
    temporaryEnchants,
    consumableAuras,
  };
  const out = typeof args.out === "string" ? args.out : "src/data/game/consumables.json";
  mkdirSync(dirname(out), { recursive: true });
  // Written in the repository's own Prettier style, so the committed file is
  // byte-identical to a fresh extraction and passes the format check.
  const options = (await resolveConfig(out)) ?? {};
  writeFileSync(out, await format(JSON.stringify(artifact), { ...options, filepath: out }), "utf8");
  console.log(
    `Wrote ${out}: ${String(temporaryEnchants.length)} temporary enchants, ${String(consumableAuras.length)} consumable auras`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
