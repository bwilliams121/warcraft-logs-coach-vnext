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
      candidateAbilityGameIds: [381623, 469779],
      crossCheck: "NONE_TALENT_BOUND",
      symbol: "rogue_t::init_spells",
      startLine: 10237,
      endLine: 10238,
      sourceNote:
        "spell.thistle_tea = talent.rogue.thistle_tea_auto->ok() " +
        "? talent.rogue.thistle_tea_auto->effectN( 1 ).trigger() " +
        ": ( talent.rogue.thistle_tea_ability->ok() ? talent.rogue.thistle_tea_ability : not_found() ). " +
        "Both reachable records are recorded because the branch depends on talent state this build does not resolve.",
    },
  ],
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
export function verifyRequiredFacts({ build, records, classSpells, gcdFieldIndex, expectedGcdFieldIndex }) {
  const problems = [];

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
    if (binding.crossCheck !== "CLASS_SPELLS") continue;

    for (const candidate of binding.candidateAbilityGameIds) {
      const match = classSpells.find(
        (entry) => entry.classId === ROGUE_CLASS_ID && entry.spellId === candidate,
      );
      if (match === undefined) {
        problems.push(
          `token '${binding.simcToken}' claims spell ${candidate} is a Rogue class ability, but class_spells.inc has no such row`,
        );
      }
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

export function buildArtifact({ commitSha, sources, build, records, extractedOn, rogueModuleSha256 }) {
  const rogueModuleSource = sources.find((source) => source.path === SOURCES.rogueModule);
  const bindingSourceSha256 = rogueModuleSha256 ?? rogueModuleSource?.sha256 ?? null;
  if (bindingSourceSha256 === null) {
    throw new Error(
      `cannot record hand-reviewed token bindings without a measured hash of ${SOURCES.rogueModule}`,
    );
  }

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
        sourcePath: SOURCES.rogueModule,
        sourceSha256: bindingSourceSha256,
        symbol: binding.symbol,
        startLine: binding.startLine,
        endLine: binding.endLine,
        sourceNote: binding.sourceNote,
        crossCheck: binding.crossCheck,
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
  });
  if (problems.length > 0) {
    console.error("EXTRACTION FAILED: the pinned data does not exhibit the required facts.\n");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("\nDo not rewrite expectations to match. Report the discrepancy.");
    process.exit(1);
  }

  // The sanity anchors prove the column; they are not part of the runtime slice.
  const anchorIds = new Set(REQUIRED_FACTS.sanityAnchors.map((entry) => entry.abilityGameId));
  const slice = new Map([...parsed.records].filter(([id]) => !anchorIds.has(id)));

  const artifact = buildArtifact({
    commitSha: typeof args.sha === "string" ? args.sha : "UNKNOWN",
    sources,
    build: build.value,
    records: slice,
    extractedOn:
      typeof args["extracted-on"] === "string" ? args["extracted-on"] : new Date().toISOString().slice(0, 10),
  });

  const outPath = typeof args.out === "string" ? args.out : "src/data/game/rogue-gcd-semantics.json";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, formatArtifactJson(artifact), "utf8");

  console.log(`Wrote ${outPath}`);
  console.log(`  commit        ${artifact.provenance.commitSha}`);
  console.log(`  client build  ${artifact.provenance.clientDataWowVersion}`);
  console.log(`  _gcd index    ${fieldIndex.index} (derived from spell_data.hpp)`);
  console.log(`  rows scanned  ${parsed.rowsScanned}`);
  console.log(`  abilities     ${artifact.abilities.length} (${artifact.provenance.abilityDataMethod})`);
  console.log(`  tokens        ${artifact.tokenBindings.length} (${HAND_REVIEWED_BINDING_METHOD})`);
  console.log("  required facts: VERIFIED");
  console.log(`  NOTE: ${SOURCES.rogueModule} was hashed, NOT parsed. Token bindings are hand-reviewed.`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
