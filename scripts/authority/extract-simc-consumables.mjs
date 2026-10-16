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
 *
 * Local pinned copies only, each SHA-256 recorded.
 *
 *   node scripts/authority/extract-simc-consumables.mjs \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --file-temporaryEnchant <temporary_enchant.inc> --file-itemData <item_data.inc> \
 *     --file-itemEffect <item_effect.inc> --file-clientDataVersion <client_data_version.inc> \
 *     --out src/data/game/consumables.json
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { format, resolveConfig } from "prettier";

import { parseArgs, parseClientDataVersion, sourceHashProblem } from "./extract-simc-talents.mjs";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const MIN_REQUIRED_LEVEL = 80;

const SOURCES = {
  temporaryEnchant: "engine/dbc/generated/temporary_enchant.inc",
  itemData: "engine/dbc/generated/item_data.inc",
  itemEffect: "engine/dbc/generated/item_effect.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
};

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
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const problem = sourceHashProblem(path, args[`expect-${key}-sha256`], sha256);
    if (problem !== null) fail(problem);
    loaded[key] = buffer.toString("utf8");
    sources.push({ path, sha256, byteLength: buffer.length });
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
  const consumableAuras = joinConsumableAuras(items, parseItemEffects(loaded.itemEffect));
  const artifact = {
    artifactVersion: 1,
    datasetId: "SIMC_CONSUMABLES",
    artifactRevision: `simc-${args.sha.slice(0, 8)}-1`,
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
