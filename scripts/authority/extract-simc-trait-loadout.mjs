#!/usr/bin/env node
/**
 * Deterministic SimulationCraft TALENT-LOADOUT node table extractor (M11-G3-2).
 *
 * A Blizzard talent import string ("loadout") is a bit stream walked over EVERY
 * trait node of the class, in a fixed order. SimulationCraft's pinned decoder
 * (engine/player/player.cpp `generate_tree_nodes` + `parse_traits_hash`)
 * builds that order as:
 *
 *   for tree in INVALID(0) .. SELECTION(4):            // talent_tree enum order
 *     for row in trait_data_t::data(class, tree):      // table order
 *       nodes[row.id_node].push(row)                   // std::map: ascending node id
 *
 * so the walk is ascending node id, and a choice index selects among a node's
 * entries IN THAT INSERTION ORDER. This extractor emits exactly that table for
 * each listed class, keyed by class id — nothing selected, nothing judged — so the import string can be
 * decoded offline and reconciled with Warcraft Logs' `talentTree`.
 *
 * Reuses the row parser and field-order guard of extract-simc-talents.mjs.
 *
 *   node scripts/authority/extract-simc-trait-loadout.mjs --classes 6 \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --file-traitData <pinned trait_data.inc> --expect-traitData-sha256 <sha> \
 *     --file-traitLayout <pinned trait_data.hpp> --expect-traitLayout-sha256 <sha> \
 *     --file-clientDataVersion <pinned client_data_version.inc> \
 *     --out src/data/game/trait-loadout-tables.json
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { format, resolveConfig } from "prettier";

import {
  parseArgs,
  parseClientDataVersion,
  parseTraitRows,
  sourceHashProblem,
  verifyTraitFieldOrder,
} from "./extract-simc-talents.mjs";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;

const SOURCES = {
  traitData: "engine/dbc/generated/trait_data.inc",
  traitLayout: "engine/dbc/trait_data.hpp",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
};

/** talent_tree enum (sc_enums.hpp): the decoder walks INVALID..SELECTION. */
const WALKED_TREES = [0, 1, 2, 3, 4];
const TREE_NAMES = { 0: "INVALID", 1: "CLASS", 2: "SPECIALIZATION", 3: "HERO", 4: "SELECTION" };
const NODE_TYPES = { 0: "NORMAL", 1: "TIERED", 2: "CHOICE", 3: "SELECTION" };
/** Classes the table currently carries; adding one is a reviewed extraction. */
const SUPPORTED_CLASS_IDS = new Set([6]);

function fail(message) {
  console.error(`EXTRACTION FAILED: ${message}`);
  process.exit(1);
}

/**
 * The loadout walk for one class: nodes ascending by id, each node's entries in
 * the order the pinned decoder inserts them (tree order, then table order).
 */
export function buildLoadoutNodes(rows, classId) {
  const byNode = new Map();
  for (const tree of WALKED_TREES) {
    for (const row of rows) {
      if (row.treeIndex !== tree || row.classId !== classId) continue;
      if (!byNode.has(row.traitNodeId)) byNode.set(row.traitNodeId, []);
      byNode.get(row.traitNodeId).push(row);
    }
  }
  return [...byNode.keys()]
    .sort((a, b) => a - b)
    .map((nodeId) => {
      const entries = byNode.get(nodeId);
      return {
        nodeId,
        entries: entries.map((row) => ({
          entryId: row.traitEntryId,
          tree: TREE_NAMES[row.treeIndex],
          nodeType: NODE_TYPES[row.nodeType] ?? `UNKNOWN_${String(row.nodeType)}`,
          maxRanks: row.maxRanks,
          specIds: row.specIds,
          subTreeId: row.idSubTree,
          spellId: row.talentSpellId,
          displayNameEn: row.displayNameEn,
        })),
      };
    });
}

async function loadSource(args, key, path) {
  const localFlag = `file-${key}`;
  if (typeof args[localFlag] !== "string")
    fail(`pass --${localFlag}: this extractor reads pinned local copies only`);
  return readFileSync(args[localFlag]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const classIds = String(args.classes ?? "")
    .split(",")
    .map((value) => Number.parseInt(value, 10));
  if (classIds.length === 0 || classIds.some((id) => !SUPPORTED_CLASS_IDS.has(id))) {
    fail(`--classes must list supported class ids (${[...SUPPORTED_CLASS_IDS].join(",")})`);
  }
  if (typeof args.sha !== "string" || !/^[0-9a-f]{40}$/.test(args.sha))
    fail("--sha must be the full pinned commit");

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
  const declared = /std::array<trait_data_t,\s*(\d+)>\s*__trait_data_data/.exec(loaded.traitData);
  if (declared === null || Number(declared[1]) !== rows.length) {
    fail(`parsed ${String(rows.length)} rows but the table declares ${declared?.[1] ?? "?"}`);
  }
  const tables = [...classIds]
    .sort((a, b) => a - b)
    .map((classId) => {
      const nodes = buildLoadoutNodes(rows, classId);
      if (nodes.length === 0) fail(`no trait rows for class ${String(classId)}`);
      return { classId, nodes };
    });

  const artifact = {
    artifactVersion: ARTIFACT_VERSION,
    datasetId: "SIMC_TRAIT_LOADOUT_TABLES",
    artifactRevision: `simc-${args.sha.slice(0, 8)}-1`,
    provenance: {
      repository: REPOSITORY,
      commitSha: args.sha,
      sources,
      clientDataWowVersion,
      method: "MACHINE_EXTRACTED_LOADOUT_WALK",
      extractorVersion: EXTRACTOR_VERSION,
      decoderReference:
        "engine/player/player.cpp generate_tree_nodes (trees INVALID..SELECTION, std::map by id_node) and parse_traits_hash",
    },
    tables,
  };
  const out = typeof args.out === "string" ? args.out : "src/data/game/trait-loadout-tables.json";
  mkdirSync(dirname(out), { recursive: true });
  // Written in the repository's own Prettier style, so the committed file is
  // byte-identical to a fresh extraction and passes the format check.
  const options = (await resolveConfig(out)) ?? {};
  writeFileSync(out, await format(JSON.stringify(artifact), { ...options, filepath: out }), "utf8");
  for (const table of tables) {
    console.log(
      `Wrote ${out}: class ${String(table.classId)}: ${String(table.nodes.length)} nodes, ${String(table.nodes.reduce((n, x) => n + x.entries.length, 0))} entries`,
    );
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
