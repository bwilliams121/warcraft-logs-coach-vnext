#!/usr/bin/env node
/**
 * Pins the canonical PLAYABLE SPECIALIZATION ROSTER from one exact
 * SimulationCraft commit (M11-A2).
 *
 * WHY. M11 onboards specializations one at a time and must be able to prove
 * that nothing was omitted from the inventory — without a remembered spec
 * count, and without a fact that lives only in a gitignored probe directory.
 * The roster is REFERENCE DATA about the game at the pinned build. It is not
 * analyzer registration: a roster row says a specialization EXISTS, never
 * that this project analyzes it.
 *
 * WHAT IS MECHANICALLY ESTABLISHED, AND FROM WHERE
 *
 *   specialization_spells.inc   every (class id, spec id) pair the generated
 *                               DBC table carries, with the spells each spec
 *                               receives. Three kinds of row group exist and
 *                               the extractor tells them apart STRUCTURALLY:
 *                                 class id 0            hunter-pet families
 *                                                       (no class); excluded
 *                                 "Initial <Class>"     the level-1 placeholder
 *                                                       spec of a class; the
 *                                                       group's ONLY class-
 *                                                       named spell is that
 *                                                       placeholder; excluded
 *                                 everything else       a playable spec, whose
 *                                                       group carries exactly
 *                                                       one spell named as a
 *                                                       `spec_map` display name
 *   util.cpp                    `spec_map[]`: enumerator <-> display name
 *                               ("Arms Warrior"); `translate_class_id`: DBC
 *                               class id -> player_e; `player_type_string` and
 *                               `player_type_string_long`: player_e -> token
 *                               ("deathknight") and long name ("Death Knight")
 *   client_data_version.inc     the client build and hotfix identity
 *
 * ROLE is pinned only where the spec's own passive says it: the DBC names a
 * "Stat Negation Aura - <Stat> <DPS|Tank|Healer>" spell for most specs, and
 * that word is recorded with the spell that carries it. A spec whose group
 * has no such spell gets `role: "UNKNOWN"` with `roleEvidence: null`. The
 * extractor never fills a role from anywhere else — not from a mastery name,
 * not from general knowledge.
 *
 * FAIL-CLOSED. Every structural assumption is asserted: the declared array
 * length equals the parsed row count, the row shape is exactly six fields,
 * every non-placeholder class group resolves exactly one display name, every
 * display name resolves exactly one enumerator, every class id resolves a
 * player_e with both strings, and no two playable rows share a spec id or a
 * (class, spec key). A source that breaks any of these aborts with a message
 * rather than emitting a roster that looks complete.
 *
 * DETERMINISTIC. Rows are emitted in ascending SimC spec id order; the only
 * non-source input is `--extracted-on`. Identical source bytes yield a
 * byte-identical artifact.
 *
 * SOURCES (fetched at --sha, or supplied with --local-<key>):
 *   engine/dbc/generated/specialization_spells.inc
 *   engine/util/util.cpp
 *   engine/dbc/generated/client_data_version.inc
 *
 * Reproduce (from a local checkout of the pinned commit):
 *
 *   node scripts/authority/extract-simc-roster.mjs \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-18 \
 *     --local-specializationSpells <path>/specialization_spells.inc \
 *     --local-util <path>/util.cpp \
 *     --local-clientDataVersion <path>/client_data_version.inc
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, parseClientDataVersion, sourceHashProblem } from "./extract-simc-enchant-effects.mjs";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;
export const DATASET_ID = "SIMC_SPECIALIZATION_ROSTER";
export const DEFAULT_OUT = "src/data/game/spec-roster.json";

export const SOURCES = {
  specializationSpells: "engine/dbc/generated/specialization_spells.inc",
  util: "engine/util/util.cpp",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
};

const ROLE_PASSIVE = /^Stat Negation Aura - (?:[A-Za-z]+) (DPS|Tank|Healer)$/;

function fail(message) {
  console.error(`EXTRACTION FAILED: ${message}`);
  process.exit(1);
}

/**
 * Parses `__specialization_spell_data`: the declared row count and every row
 * as `{ classId, specId, spellId, overrideSpellId, name, rank }` — the sixth
 * field is a rank string (`"Rank 3"`) or the literal `0`.
 */
export function readSpecializationSpells(text) {
  const header =
    /std::array<specialization_spell_entry_t,\s*(\d+)>\s*__specialization_spell_data\s*\{\s*\{/.exec(text);
  if (header === null)
    return { ok: false, error: "specialization_spells.inc declares no __specialization_spell_data" };
  const declaredCount = Number.parseInt(header[1], 10);
  const build = /wow build (\d+\.\d+\.\d+\.\d+)/.exec(text);
  const rows = [];
  const pattern =
    /^\s*\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*"((?:[^"\\]|\\.)*)"\s*,\s*(0|"(?:[^"\\]|\\.)*")\s*\}\s*,?\s*$/;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    if (/^\s*\{\s*\{/.test(line)) continue; // the array opener
    const match = pattern.exec(line);
    if (match === null)
      return { ok: false, error: `unrecognised specialization_spells.inc row: ${line.trim()}` };
    rows.push({
      classId: Number.parseInt(match[1], 10),
      specId: Number.parseInt(match[2], 10),
      spellId: Number.parseInt(match[3], 10),
      overrideSpellId: Number.parseInt(match[4], 10),
      name: match[5],
      rank: match[6] === "0" ? null : match[6].slice(1, -1),
    });
  }
  if (rows.length !== declaredCount) {
    return {
      ok: false,
      error: `specialization_spells.inc declares ${String(declaredCount)} rows but ${String(rows.length)} parsed`,
    };
  }
  return { ok: true, declaredCount, buildInHeader: build === null ? null : build[1], rows };
}

/** `spec_map[]`: enumerator -> display names (the first is the default), and display name -> enumerator. */
export function readSpecMap(text) {
  const start = text.indexOf("const spec_map_t spec_map[] =");
  if (start < 0) return { ok: false, error: "util.cpp declares no spec_map[]" };
  const end = text.indexOf("};", start);
  const byName = new Map();
  const byEnumerator = new Map();
  for (const line of text.slice(start, end).split(/\r?\n/)) {
    const match = /^\s*\{\s*([A-Z_]+),\s*"([^"]+)"\s*\}/.exec(line);
    if (match === null) continue;
    const [, enumerator, name] = match;
    if (byName.has(name) && byName.get(name) !== enumerator) {
      return { ok: false, error: `spec_map names "${name}" for two enumerators` };
    }
    byName.set(name, enumerator);
    byEnumerator.set(enumerator, [...(byEnumerator.get(enumerator) ?? []), name]);
  }
  if (byName.size === 0) return { ok: false, error: "spec_map[] parsed to zero entries" };
  return { ok: true, byName, byEnumerator };
}

/** `translate_class_id`: DBC class id -> player_e enumerator. */
export function readClassIds(text) {
  const start = text.indexOf("player_e util::translate_class_id( int cid )");
  if (start < 0) return { ok: false, error: "util.cpp declares no translate_class_id" };
  const end = text.indexOf("}", text.indexOf("switch", start));
  const map = new Map();
  for (const match of text.slice(start, end).matchAll(/case\s+(\d+):\s*return\s+([A-Z_]+);/g)) {
    map.set(Number.parseInt(match[1], 10), match[2]);
  }
  if (map.size === 0) return { ok: false, error: "translate_class_id parsed to zero cases" };
  return { ok: true, map };
}

/** One `case X: return "y";` switch of `util.cpp` as enumerator -> string. */
export function readStringSwitch(text, functionSignature) {
  const start = text.indexOf(functionSignature);
  if (start < 0) return { ok: false, error: `util.cpp declares no ${functionSignature}` };
  const end = text.indexOf("\n}", start);
  const map = new Map();
  for (const match of text.slice(start, end).matchAll(/case\s+([A-Z_]+):\s*return\s+"([^"]*)";/g)) {
    map.set(match[1], match[2]);
  }
  if (map.size === 0) return { ok: false, error: `${functionSignature} parsed to zero cases` };
  return { ok: true, map };
}

/** `"Beast Mastery Hunter"` with class `"Hunter"` -> `"beast_mastery"`. */
export function specKeyOf(displayName, classLongName) {
  if (!displayName.endsWith(` ${classLongName}`)) return null;
  const spec = displayName.slice(0, displayName.length - classLongName.length - 1);
  return spec.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/**
 * Classifies every (class, spec) row group and builds the playable roster.
 * Pure: takes the parsed sources, returns the rows plus the exclusion
 * census, or a list of structural problems.
 */
export function buildRoster(spells, specMap, classIds, classTokens, classLongNames) {
  const problems = [];
  const groups = new Map();
  for (const row of spells.rows) {
    const key = `${String(row.classId)}/${String(row.specId)}`;
    if (!groups.has(key)) groups.set(key, { classId: row.classId, specId: row.specId, rows: [] });
    groups.get(key).rows.push(row);
  }

  const excluded = { petFamilies: [], initialPlaceholders: [] };
  const playable = [];
  for (const group of [...groups.values()].sort((a, b) => a.specId - b.specId)) {
    if (group.classId === 0) {
      excluded.petFamilies.push({
        specId: group.specId,
        spellNames: [...new Set(group.rows.map((r) => r.name))],
      });
      continue;
    }
    const playerType = classIds.map.get(group.classId);
    if (playerType === undefined) {
      problems.push(`class id ${String(group.classId)} has no translate_class_id case`);
      continue;
    }
    const classToken = classTokens.map.get(playerType);
    const classLongName = classLongNames.map.get(playerType);
    if (classToken === undefined || classLongName === undefined) {
      problems.push(`${playerType} has no player_type_string / player_type_string_long`);
      continue;
    }
    const names = [...new Set(group.rows.map((r) => r.name))];
    const initial = names.filter((name) => name === `Initial ${classLongName}`);
    const displayNames = names.filter((name) => specMap.byName.has(name));
    if (initial.length > 0) {
      if (displayNames.length > 0) {
        problems.push(`spec ${String(group.specId)} is both a placeholder and a spec_map name`);
      }
      excluded.initialPlaceholders.push({ specId: group.specId, classToken, name: initial[0] });
      continue;
    }
    if (displayNames.length !== 1) {
      problems.push(
        `spec ${String(group.specId)} (${classLongName}) resolves ${String(displayNames.length)} spec_map names: [${displayNames.join(", ")}]`,
      );
      continue;
    }
    const displayName = displayNames[0];
    const enumerator = specMap.byName.get(displayName);
    const specKey = specKeyOf(displayName, classLongName);
    if (specKey === null) {
      problems.push(
        `spec_map name "${displayName}" does not end with its class long name "${classLongName}"`,
      );
      continue;
    }
    const roleRows = group.rows.filter((r) => ROLE_PASSIVE.test(r.name));
    const roles = [...new Set(roleRows.map((r) => ROLE_PASSIVE.exec(r.name)[1].toUpperCase()))];
    if (roles.length > 1) {
      problems.push(
        `spec ${String(group.specId)} carries ${String(roles.length)} role passives: [${roles.join(", ")}]`,
      );
      continue;
    }
    const roleRow = roleRows[0];
    playable.push({
      simcSpecId: group.specId,
      simcEnumerator: enumerator,
      classId: group.classId,
      classToken,
      className: classLongName,
      specKey,
      rosterKey: `${classToken}/${specKey}`,
      displayName,
      role: roles.length === 1 ? roles[0] : "UNKNOWN",
      roleEvidence:
        roleRow === undefined
          ? null
          : { method: "MACHINE_EXTRACTED_DBC_RECORD", spellId: roleRow.spellId, spellName: roleRow.name },
      specPassiveSpellIds: group.rows.filter((r) => r.name === displayName).map((r) => r.spellId),
    });
  }

  const seenSpec = new Set();
  const seenKey = new Set();
  for (const row of playable) {
    if (seenSpec.has(row.simcSpecId)) problems.push(`duplicate SimC spec id ${String(row.simcSpecId)}`);
    seenSpec.add(row.simcSpecId);
    if (seenKey.has(row.rosterKey)) problems.push(`duplicate roster key ${row.rosterKey}`);
    seenKey.add(row.rosterKey);
  }
  // Every spec_map default name must have been claimed by exactly one row.
  const claimed = new Set(playable.map((row) => row.displayName));
  for (const [enumerator, names] of specMap.byEnumerator) {
    if (!names.some((name) => claimed.has(name))) {
      problems.push(
        `spec_map enumerator ${enumerator} (${names[0]}) matched no specialization_spells.inc group`,
      );
    }
  }
  return { problems, playable, excluded };
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
  if (typeof args.sha !== "string" || !/^[0-9a-f]{40}$/.test(args.sha)) {
    fail("--sha must be a full 40-character commit SHA");
  }
  const outPath = typeof args.out === "string" ? args.out : DEFAULT_OUT;

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

  const spells = readSpecializationSpells(loaded.specializationSpells);
  if (!spells.ok) fail(spells.error);
  if (spells.buildInHeader !== null && spells.buildInHeader !== build.value.wowVersion) {
    fail(
      `specialization_spells.inc header names build ${spells.buildInHeader} but client_data_version.inc names ${build.value.wowVersion}`,
    );
  }
  const specMap = readSpecMap(loaded.util);
  if (!specMap.ok) fail(specMap.error);
  const classIds = readClassIds(loaded.util);
  if (!classIds.ok) fail(classIds.error);
  const classTokens = readStringSwitch(loaded.util, "const char* util::player_type_string( player_e type )");
  if (!classTokens.ok) fail(classTokens.error);
  const classLongNames = readStringSwitch(
    loaded.util,
    "const char* util::player_type_string_long( player_e type )",
  );
  if (!classLongNames.ok) fail(classLongNames.error);

  const roster = buildRoster(spells, specMap, classIds, classTokens, classLongNames);
  if (roster.problems.length > 0) fail(`\n  - ${roster.problems.join("\n  - ")}`);

  const artifact = {
    artifactVersion: ARTIFACT_VERSION,
    datasetId: DATASET_ID,
    artifactRevision: `simc-${args.sha.slice(0, 8)}-${String(EXTRACTOR_VERSION)}`,
    provenance: {
      repository: REPOSITORY,
      commitSha: args.sha,
      sources,
      clientDataWowVersion: build.value.wowVersion,
      clientDataHotfixDate: build.value.hotfixDate,
      clientDataHotfixBuild: build.value.hotfixBuild,
      clientDataHotfixHash: build.value.hotfixHash,
      extractor: "scripts/authority/extract-simc-roster.mjs",
      extractorVersion: EXTRACTOR_VERSION,
      extractedOn:
        typeof args["extracted-on"] === "string"
          ? args["extracted-on"]
          : new Date().toISOString().slice(0, 10),
      method: "MACHINE_EXTRACTED_DBC_RECORD",
      /** How a row was decided playable, stated so a reader need not re-derive it. */
      playableRule:
        "class id != 0; the group's spell names include no 'Initial <Class>' placeholder; exactly one spell name is a util.cpp spec_map display name",
      roleRule:
        "role is the <DPS|Tank|Healer> word of the group's 'Stat Negation Aura - <Stat> <Role>' spell; UNKNOWN when the group carries none",
      specKeyRule:
        "displayName with the trailing player_type_string_long class name removed, lower-cased, non-alphanumerics folded to '_'",
      declaredRowCount: spells.declaredCount,
      excluded: roster.excluded,
    },
    playableSpecializationCount: roster.playable.length,
    specializations: roster.playable,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath}: ${String(roster.playable.length)} playable specializations`);
  for (const row of roster.playable) {
    console.log(
      `  ${String(row.simcSpecId).padStart(4)}  ${row.rosterKey.padEnd(28)} ${row.role.padEnd(8)} ${row.displayName}`,
    );
  }
  console.log(
    `  excluded: ${String(roster.excluded.petFamilies.length)} pet families, ${String(roster.excluded.initialPlaceholders.length)} Initial placeholders`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
