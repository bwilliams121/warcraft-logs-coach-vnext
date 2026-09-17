#!/usr/bin/env node
/**
 * Pins the resource COST rows of named spells from one exact SimulationCraft
 * commit (M10-C4): the `SpellPower` records SimulationCraft's `spell_data_t::
 * cost( power_e )` reads, verbatim — every power type, every aura-conditioned
 * variant — plus the spell's own cooldown, charge and GCD scalars.
 *
 * WHY. A Holy Power spender's cost is what decides whether it is affordable,
 * and a hypothetical prefix execution of it must spend exactly what the
 * authority spends. Neither is ever typed from memory; both come from here.
 *
 * WHAT IS NOT DONE. No cost modifier (a free-cast buff, a talent discount)
 * is applied: the artifact records the base rows and the specialization's
 * transition contract cites the source for any modifier it models.
 *
 * CLASS-NEUTRAL. A target names spells; the parsing knows no class.
 *
 * SOURCES (fetched at --sha, or supplied with --local-<key>):
 *   engine/dbc/generated/sc_spell_data.inc         machine-parsed
 *   engine/dbc/generated/client_data_version.inc   machine-parsed
 *   engine/dbc/spell_data.hpp                      layout check
 *   engine/sc_enums.hpp                            power_e values
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseArgs,
  parseClientDataVersion,
  readEnumerator,
  readSpellRows,
  sourceHashProblem,
  structMembers,
  tokenizeRow,
} from "./extract-simc-enchant-effects.mjs";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;

const SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  enums: "engine/sc_enums.hpp",
};

/** The `power_e` enumerators recorded with their pinned values. */
const POWER_ENUMERATORS = ["POWER_MANA", "POWER_HOLY_POWER"];

export const TARGETS = {
  "paladin-protection": {
    datasetId: "SIMC_DBC_PALADIN_PROTECTION_SPENDER_COSTS",
    defaultOut: "src/data/game/paladin-protection-spender-costs.json",
    spells: [
      {
        simcToken: "shield_of_the_righteous",
        spellId: 53_600,
        why: "default[8]: the NON_GCD Holy Power spender",
      },
      {
        simcToken: "word_of_glory",
        spellId: 85_673,
        why: "default[28]: the Holy Power heal, free under Shining Light",
      },
    ],
  },
};

function fail(message) {
  console.error(`EXTRACTION FAILED: ${message}`);
  process.exit(1);
}

/** Every `__spellpower_data` row of the wanted spells, in table order. */
export function readPowerRows(text, wantedSpellIds, members) {
  const wanted = new Set([...wantedSpellIds].map(Number));
  const at = (name) => members.indexOf(name);
  const start = text.indexOf("__spellpower_data {");
  if (start < 0) return null;
  const end = text.indexOf("\n}", start);
  const rows = new Map();
  for (const line of text.slice(start, end).split(/\r?\n/)) {
    const tokens = tokenizeRow(line);
    if (tokens === null) continue;
    const num = (name) => {
      const raw = tokens[at(name)];
      return raw !== undefined && /^-?\d+(?:\.\d+)?$/.test(raw) ? Number.parseFloat(raw) : null;
    };
    const spellId = num("_spell_id");
    if (spellId === null || !wanted.has(spellId)) continue;
    const row = {
      powerRowId: num("_id"),
      auraSpellId: num("_aura_id"),
      powerType: num("_power_type"),
      cost: num("_cost"),
      costMax: num("_cost_max"),
      costPerTick: num("_cost_per_tick"),
      pctCost: num("_pct_cost"),
      pctCostMax: num("_pct_cost_max"),
      pctCostPerTick: num("_pct_cost_per_tick"),
    };
    if (Object.values(row).some((value) => value === null)) continue;
    rows.set(spellId, [...(rows.get(spellId) ?? []), row]);
  }
  return rows;
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

  const powerMembers = structMembers(loaded.spellDataLayout, "spellpower_data_t");
  const spellMembers = structMembers(loaded.spellDataLayout, "spell_data_t");
  if (powerMembers === null || spellMembers === null) fail("spell_data.hpp layouts not found");
  const expectedPower = [
    "_id",
    "_spell_id",
    "_aura_id",
    "_power_type",
    "_cost",
    "_cost_max",
    "_cost_per_tick",
    "_pct_cost",
    "_pct_cost_max",
    "_pct_cost_per_tick",
  ];
  expectedPower.forEach((name, index) => {
    if (powerMembers[index] !== name)
      fail(`spellpower_data_t member ${String(index)} is ${powerMembers[index]}, expected ${name}`);
  });
  const powerTypes = {};
  for (const name of POWER_ENUMERATORS) {
    const value = readEnumerator(loaded.enums, name);
    if (value === null) fail(`sc_enums.hpp does not define ${name}`);
    powerTypes[name] = value;
  }

  const spellIds = target.spells.map((spell) => spell.spellId);
  const spellRead = readSpellRows(loaded.spellData, spellIds, spellMembers, [
    "_cooldown",
    "_gcd",
    "_category_cooldown",
    "_charges",
    "_charge_cooldown",
    "_internal_cooldown",
    "_cast_time",
  ]);
  if (!spellRead.ok) fail(spellRead.error);
  const powerRows = readPowerRows(loaded.spellData, spellIds, powerMembers);
  if (powerRows === null) fail("sc_spell_data.inc declares no __spellpower_data table");
  const problems = [];
  for (const spell of target.spells) {
    if (!spellRead.rows.has(spell.spellId)) problems.push(`spell ${String(spell.spellId)} not found`);
    if (!powerRows.has(spell.spellId)) problems.push(`spell ${String(spell.spellId)} has no power rows`);
  }
  if (problems.length > 0) fail(`\n  - ${problems.join("\n  - ")}`);

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
      extractor: "scripts/authority/extract-simc-power-costs.mjs",
      extractorVersion: EXTRACTOR_VERSION,
      extractedOn:
        typeof args["extracted-on"] === "string"
          ? args["extracted-on"]
          : new Date().toISOString().slice(0, 10),
      method: "MACHINE_EXTRACTED_DBC_RECORD",
      powerTypes,
      /**
       * `spell_data_t::cost( pt )` returns the FIRST power row of that type, in
       * table order (spell_data.hpp). Recorded so a consumer applies the same rule.
       */
      costRule: "FIRST_ROW_OF_POWER_TYPE_IN_TABLE_ORDER",
    },
    spells: target.spells.map((spell) => {
      const row = spellRead.rows.get(spell.spellId);
      return {
        simcToken: spell.simcToken,
        spellId: spell.spellId,
        displayNameEn: row.nameEn,
        why: spell.why,
        cooldownMs: row._cooldown,
        gcdMs: row._gcd,
        categoryCooldownMs: row._category_cooldown,
        charges: row._charges,
        chargeCooldownMs: row._charge_cooldown,
        internalCooldownMs: row._internal_cooldown,
        castTimeMs: row._cast_time,
        powerRows: powerRows.get(spell.spellId),
      };
    }),
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath}`);
  for (const spell of artifact.spells) {
    console.log(
      `  ${spell.simcToken} (${String(spell.spellId)}) cd ${String(spell.cooldownMs)} gcd ${String(spell.gcdMs)} ` +
        `power rows: ${spell.powerRows.map((r) => `type ${String(r.powerType)} cost ${String(r.cost)}${r.auraSpellId ? ` aura ${String(r.auraSpellId)}` : ""}`).join("; ")}`,
    );
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
