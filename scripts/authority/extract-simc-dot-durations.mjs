#!/usr/bin/env node
/**
 * Deterministic SimulationCraft DoT base-duration extractor.
 *
 * Reads the generated spell table from ONE pinned SimulationCraft commit and
 * emits the narrow slice M5-C3a needs. Run manually; never at runtime.
 *
 * WHY THIS EXISTS
 *
 * The pinned `core_dot[0]` condition asks `remains<=...`. `remains` is the
 * acting action's own DoT remaining duration, and Warcraft Logs does not report
 * it: WCL reports that a debuff was APPLIED at a time. Turning an application
 * into a remaining duration needs the DoT's base duration, which is a game fact
 * and therefore belongs in runtime data with provenance rather than in a
 * comment, a prompt or model memory.
 *
 * WHY IT IS SEPARATE FROM THE GCD ARTIFACT
 *
 * `rogue-gcd-semantics.json` answers a different question (which execution lane
 * an action occupies) and is pinned by M5-C1's contract tests. Widening it would
 * change a milestone that is meant to stay semantically fixed. This artifact
 * reads the SAME bytes — the recorded `sc_spell_data.inc` hash is identical — so
 * the two cannot drift apart while both are pinned to one commit.
 *
 * THE PROVENANCE CHAIN, END TO END
 *
 *   sc_rogue.cpp:9472            name == "garrote" -> new garrote_t(..., spec.garrote, ...)
 *   sc_rogue.cpp:9934            spec.garrote = find_specialization_spell( "Garrote" )
 *   specialization_spells.inc    { 4, 259, 703, 0, "Garrote", 0 }
 *   sc_spell_data.inc            { "Garrote", 703, ... _duration ... }
 *
 * Every link is machine-readable, so the APL token is bound to a spell id by
 * parsing rather than by assertion. The two `sc_rogue.cpp` lines are the one
 * hand-reviewed step; that file is hashed and the lines are recorded so the
 * review can be repeated.
 *
 * WHAT `_duration` IS, AND IS NOT
 *
 *     spell_data.hpp:476   double _duration;   // Spell duration in milliseconds
 *
 * It is the BASE duration in MILLISECONDS. It is not haste-scaled, not pandemic
 * extended, and not modified by talents or snapshots. A consumer that needs any
 * of those must model them explicitly; this artifact deliberately supplies only
 * the base fact, so a missing model shows up as a missing model.
 *
 *   node scripts/authority/extract-simc-dot-durations.mjs \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --out src/data/game/rogue-dot-durations.json
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;
const DATASET_ID = "SIMC_DBC_ROGUE_DOT_DURATIONS";

const ROGUE_CLASS_ID = 4;
const ASSASSINATION_SPEC_ID = 259;

const SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  specializationSpells: "engine/dbc/generated/specialization_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  rogueModule: "engine/class_modules/sc_rogue.cpp",
};

/**
 * The DoTs M5-C3a requires.
 *
 * `simcToken` is the APL action token. `displayNameEn` is the name
 * `find_specialization_spell` looks up, and is what binds the token to an id
 * through `specialization_spells.inc` rather than through a typed-in number.
 *
 * Entries appear when a supported decision needs them, never speculatively —
 * the same rule `rogue-abilities.ts` and the GCD artifact follow.
 */
const REQUIRED_DOTS = [
  {
    simcToken: "garrote",
    displayNameEn: "Garrote",
    createAction:
      'sc_rogue.cpp:9472 if ( name == "garrote" ) return new garrote_t( name, this, spec.garrote, options_str )',
    specBinding: 'sc_rogue.cpp:9934 spec.garrote = find_specialization_spell( "Garrote" )',
    durationModel: {
      kind: "FIXED",
      startLine: 4501,
      endLine: 4506,
      finding:
        "garrote_t::composite_dot_duration returns rogue_attack_t::composite_dot_duration( s ) scaled only by " +
        "1 / get_exsanguinated_rate(). That rate never leaves 1.0 at this commit — do_exsanguinate is " +
        "[[maybe_unused]] with no call site (sc_rogue.cpp:7759) and the field is constructed and reset to 1.0 " +
        "(sc_rogue.cpp:1479) — so the applied duration is the base _duration unchanged.",
    },
  },
  {
    simcToken: "rupture",
    displayNameEn: "Rupture",
    createAction:
      'sc_rogue.cpp:9486 if ( name == "rupture" ) return new rupture_t( name, this, spec.rupture, options_str )',
    specBinding: 'sc_rogue.cpp:9937 spec.rupture = find_specialization_spell( "Rupture" )',
    durationModel: {
      kind: "COMBO_POINT_SCALED",
      startLine: 5161,
      endLine: 5167,
      finding:
        "rupture_t::composite_dot_duration computes data().duration() * ( 1 + rs->get_combo_points() ), then " +
        "divides by get_exsanguinated_rate(), which never leaves 1.0 at this commit. The applied duration is " +
        "therefore baseDurationMs * ( 1 + combo points spent by the applying cast ).",
    },
  },
];

/**
 * The effect that carries a DoT's tick period.
 *
 * `_amplitude` appears on every effect and means different things on each; only
 * a PERIODIC DAMAGE aura's amplitude is the tick period. So the search is by
 * `_type` and `_subtype`, and a spell with no such effect — or with more than one
 * — is refused rather than resolved to whichever came first.
 *
 *     data_enums.hh:685   E_APPLY_AURA        = 6
 *     data_enums.hh:1043  A_PERIODIC_DAMAGE   = 3
 */
const PERIODIC_DAMAGE_EFFECT_TYPE = 6;
const PERIODIC_DAMAGE_EFFECT_SUBTYPE = 3;

/**
 * The flat effect-row indices this parser reads, counted from `_id`.
 *
 * Re-derived from `struct spelleffect_data_t` on every run and compared against
 * these, exactly like the spell-row indices.
 */
const EXPECTED_EFFECT_FIELD_INDICES = { _spell_id: 1, _index: 2, _type: 3, _subtype: 4, _amplitude: 12 };

/**
 * Cross-artifact anchors: `_gcd` values M5-C1 already pinned from these same
 * bytes.
 *
 * These exist to catch a column shift. This extractor reads `_duration` and
 * `_cooldown`, and nothing about those columns is self-validating — a wrong
 * index yields a plausible number. Re-reading `_gcd` at ITS derived index and
 * requiring the values M5-C1 independently recorded ties the whole row layout
 * to a result that was verified once already.
 */
const GCD_ANCHORS = [
  { abilityGameId: 8676, displayNameEn: "Ambush", baseGcdMs: 1000 },
  { abilityGameId: 1784, displayNameEn: "Stealth", baseGcdMs: 0 },
  { abilityGameId: 32645, displayNameEn: "Envenom", baseGcdMs: 1000 },
];

/**
 * The flat field indices this parser reads, counted from `_id`.
 *
 * NOT trusted. They are re-derived from the struct declaration on every run and
 * compared against these; the constants exist only so a shift is reported as a
 * shift rather than absorbed.
 */
const EXPECTED_FIELD_INDICES = { _cooldown: 15, _gcd: 16, _duration: 27 };

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

/**
 * Reads the build stamp. Every field is required; a partial stamp is an error.
 *
 * Deliberately identical to the GCD extractor's parser, including naming each
 * missing macro rather than reporting a single opaque failure.
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
 * Derives the flat index of every requested scalar member of `spell_data_t`.
 *
 * Generalised from M5-C1's `deriveGcdFieldIndex`, and keeps both of its
 * hard-won rules: start at the DEFINITION rather than the forward declaration,
 * and strip trailing comments before testing for a method, because
 * `const char* _name; // ... (enGB)` otherwise reads as one.
 *
 * Counting stops at the first ARRAY member, which is where a generated row stops
 * being flat comma-separated scalars.
 */
export function deriveScalarFieldIndices(headerText, wantedNames, structName = "spell_data_t") {
  const lines = headerText.split(/\r?\n/);

  let bodyStart = -1;
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i]?.trim() !== `struct ${structName}`) continue;
    if (lines[i + 1]?.trim() === "{") {
      bodyStart = i + 2;
      break;
    }
  }
  if (bodyStart < 0) {
    return {
      ok: false,
      error: `spell_data.hpp does not define struct ${structName} (only a forward declaration?)`,
    };
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
    if (at < 0) {
      return { ok: false, error: `spell_data_t declares no ${name} member before its first array member` };
    }
    if (at < idAt) {
      return { ok: false, error: `${name} is declared before _id, which the row parser cannot handle` };
    }
    indices[name] = at - idAt;
  }
  return { ok: true, indices, fields };
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
 * Reads a millisecond column that the struct declares as `double`.
 *
 * `_duration` is a double and the generator prints it either as `18000` or as
 * `18000.000000`, so both forms are accepted.
 *
 * NEGATIVE VALUES ARE READ, NOT REFUSED. `-1` is the DBC sentinel for an aura
 * with no duration — Stealth (1784) carries it, because Stealth lasts until
 * something breaks it rather than until a timer expires. Refusing to PARSE the
 * sentinel would be the wrong layer: the parser's job is to report the column
 * faithfully, and `verifyRequiredFacts` is where a DoT that needs a real
 * duration rejects one it cannot use. Collapsing those two steps is how a
 * sentinel becomes a magnitude.
 *
 * A FRACTIONAL millisecond is refused outright: rounding one silently would
 * invent precision the data did not carry, and no supported DoT has one.
 */
export function readMillisecondColumn(raw, fieldName, abilityGameId) {
  if (raw === undefined || !/^-?\d+(?:\.\d+)?$/.test(raw)) {
    return { ok: false, error: `spell ${abilityGameId} has no readable ${fieldName} (saw '${String(raw)}')` };
  }
  const value = Number.parseFloat(raw);
  if (!Number.isInteger(value)) {
    return {
      ok: false,
      error: `spell ${abilityGameId} has a fractional ${fieldName} of ${raw}ms, which this extractor will not round`,
    };
  }
  return { ok: true, value };
}

/**
 * Extracts `{ displayNameEn, baseDurationMs, baseCooldownMs, baseGcdMs }` for
 * each wanted id.
 *
 * Scans the flat comma-separated scalar prefix of each row only. A wanted id
 * seen twice is reported rather than resolved — an ambiguous record cannot be
 * silently reduced to one reading. A repeated NAME is fine and expected: the
 * pinned table holds two rows named "Garrote" (703 and 360830), which is exactly
 * why the binding runs through ids rather than names.
 */
export function parseSpellRecords(text, wantedIds, fieldIndices) {
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

    const columns = {};
    for (const [fieldName, index] of Object.entries(fieldIndices)) {
      const read = readMillisecondColumn(flat[index], fieldName, abilityGameId);
      if (!read.ok) return read;
      columns[fieldName] = read.value;
    }

    const record = {
      abilityGameId,
      displayNameEn: name.value,
      baseDurationMs: columns._duration,
      baseCooldownMs: columns._cooldown,
      baseGcdMs: columns._gcd,
    };
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
 * Extracts the PERIODIC DAMAGE effect's `_amplitude` for each wanted spell.
 *
 * SCOPED TO ONE TABLE, DELIMITED BY ITS OWN DECLARATION. The generated file
 * holds several arrays whose rows begin with a bare integer — the power table's
 * rows are the dangerous neighbour, since they also start `{ <id>, <spell_id>,`
 * and would parse into plausible nonsense. So the scan starts at
 * `__spelleffect_data[` and stops at that array's closing brace, rather than
 * trying to tell rows apart by shape.
 *
 * A spell with NO periodic-damage effect, or with MORE THAN ONE, is refused
 * rather than resolved. `_amplitude` means "tick period" only on this effect
 * type, and picking one of two would be a guess about which aura is the DoT.
 */
export function parseEffectTickPeriods(text, wantedSpellIds, fieldIndices) {
  const wanted = new Set([...wantedSpellIds].map(Number));
  const found = new Map();
  const ambiguous = [];

  const start = text.indexOf("__spelleffect_data[");
  if (start < 0) {
    return { ok: false, error: "sc_spell_data.inc declares no __spelleffect_data table" };
  }
  const bodyStart = text.indexOf("{", start);
  const bodyEnd = text.indexOf("\n};", bodyStart);
  if (bodyStart < 0 || bodyEnd < 0) {
    return { ok: false, error: "the __spelleffect_data table has no readable body" };
  }

  let rowsScanned = 0;
  for (const line of text.slice(bodyStart, bodyEnd).split(/\r?\n/)) {
    const open = line.indexOf("{");
    if (open < 0) continue;
    const afterOpen = line.slice(open + 1);
    const firstNested = afterOpen.indexOf("{");
    // Every effect row carries the `_class_flags` array, so a row with no nested
    // brace is not one and is skipped rather than half-read.
    if (firstNested < 0) continue;
    const flat = afterOpen
      .slice(0, firstNested)
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    rowsScanned += 1;

    const spellIdRaw = flat[fieldIndices._spell_id];
    if (spellIdRaw === undefined || !/^\d+$/.test(spellIdRaw)) continue;
    const spellId = Number.parseInt(spellIdRaw, 10);
    if (!wanted.has(spellId)) continue;

    const typeRaw = flat[fieldIndices._type];
    const subtypeRaw = flat[fieldIndices._subtype];
    if (typeRaw === undefined || subtypeRaw === undefined) continue;
    if (Number.parseInt(typeRaw, 10) !== PERIODIC_DAMAGE_EFFECT_TYPE) continue;
    if (Number.parseInt(subtypeRaw, 10) !== PERIODIC_DAMAGE_EFFECT_SUBTYPE) continue;

    const amplitude = readMillisecondColumn(flat[fieldIndices._amplitude], "_amplitude", spellId);
    if (!amplitude.ok) return amplitude;
    const indexRaw = flat[fieldIndices._index];
    if (indexRaw === undefined || !/^\d+$/.test(indexRaw)) continue;

    if (found.has(spellId)) {
      ambiguous.push(spellId);
      continue;
    }
    found.set(spellId, {
      spellId,
      effectIndex: Number.parseInt(indexRaw, 10),
      effectType: PERIODIC_DAMAGE_EFFECT_TYPE,
      effectSubtype: PERIODIC_DAMAGE_EFFECT_SUBTYPE,
      baseTickPeriodMs: amplitude.value,
    });
  }

  if (ambiguous.length > 0) {
    return {
      ok: false,
      error:
        `spell ids carry more than one periodic-damage effect and their tick period is ambiguous: ` +
        ambiguous.join(", "),
    };
  }
  return { ok: true, effects: found, rowsScanned };
}

/**
 * Parses `specialization_spells.inc` rows:
 * `{ classId, specId, spellId, replacesSpellId, "Name", flags }`.
 *
 * This is the BINDING source, not a cross-check. `find_specialization_spell`
 * resolves a name against exactly this table for the acting class and spec.
 */
export function parseSpecializationSpells(text) {
  const rows = [];
  const row =
    /^\s*\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*"((?:[^"\\]|\\.)*)"\s*(?:,\s*(\d+)\s*)?\}\s*,?\s*$/;
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
 * Resolves one `find_specialization_spell( name )` for Assassination Rogue.
 *
 * A name matching more than one row is an error rather than a pick. So is a
 * name matching none: absence must never become a guessed id.
 */
export function resolveSpecializationSpell(rows, displayNameEn) {
  const matches = rows.filter(
    (candidate) =>
      candidate.classId === ROGUE_CLASS_ID &&
      candidate.specId === ASSASSINATION_SPEC_ID &&
      candidate.displayNameEn === displayNameEn,
  );
  if (matches.length === 0) {
    return {
      ok: false,
      error: `specialization_spells.inc has no '${displayNameEn}' for class ${String(ROGUE_CLASS_ID)} spec ${String(ASSASSINATION_SPEC_ID)}`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: `'${displayNameEn}' resolves to ${String(matches.length)} specialization spells (${matches.map((m) => m.spellId).join(", ")})`,
    };
  }
  return { ok: true, row: matches[0] };
}

/** Checks every required fact. An empty list is the only thing that licenses writing. */
export function verifyRequiredFacts({
  build,
  records,
  bindings,
  fieldIndices,
  gcdAnchorRecords,
  effectFieldIndices,
  effects,
}) {
  const problems = [];

  for (const [fieldName, expected] of Object.entries(EXPECTED_FIELD_INDICES)) {
    const actual = fieldIndices[fieldName];
    if (actual !== expected) {
      problems.push(
        `${fieldName} is at flat field index ${String(actual)} in the pinned spell_data.hpp, but this parser was ` +
          `written against index ${String(expected)}. The struct layout moved; re-verify every value before changing this.`,
      );
    }
  }

  for (const [fieldName, expected] of Object.entries(EXPECTED_EFFECT_FIELD_INDICES)) {
    const actual = effectFieldIndices?.[fieldName];
    if (actual !== expected) {
      problems.push(
        `spelleffect_data_t.${fieldName} is at flat field index ${String(actual)} in the pinned spell_data.hpp, but ` +
          `this parser was written against index ${String(expected)}. The effect row layout moved.`,
      );
    }
  }

  // The cross-artifact anchor. A wrong column yields a plausible duration, so
  // the layout is proved against values M5-C1 recorded from these same bytes.
  for (const anchor of GCD_ANCHORS) {
    const record = gcdAnchorRecords.get(anchor.abilityGameId);
    if (record === undefined) {
      problems.push(
        `GCD anchor ${String(anchor.abilityGameId)} (${anchor.displayNameEn}) is absent from the spell table`,
      );
      continue;
    }
    if (record.displayNameEn !== anchor.displayNameEn) {
      problems.push(
        `GCD anchor ${String(anchor.abilityGameId)} is named '${record.displayNameEn}', expected '${anchor.displayNameEn}'`,
      );
    }
    if (record.baseGcdMs !== anchor.baseGcdMs) {
      problems.push(
        `GCD anchor ${String(anchor.abilityGameId)} (${anchor.displayNameEn}) reads _gcd ${String(record.baseGcdMs)}ms, ` +
          `but M5-C1 pinned ${String(anchor.baseGcdMs)}ms from the same file. The row layout has shifted.`,
      );
    }
  }

  for (const required of REQUIRED_DOTS) {
    const binding = bindings.get(required.simcToken);
    if (binding === undefined) {
      problems.push(`'${required.simcToken}' did not resolve to a specialization spell`);
      continue;
    }
    const record = records.get(binding.spellId);
    if (record === undefined) {
      problems.push(
        `spell ${String(binding.spellId)} (${required.displayNameEn}) is absent from the spell table`,
      );
      continue;
    }
    if (record.displayNameEn !== required.displayNameEn) {
      problems.push(
        `spell ${String(binding.spellId)} is named '${record.displayNameEn}', expected '${required.displayNameEn}'`,
      );
    }
    // A DoT with no duration is not a DoT. This catches the case where the
    // binding resolved to a driver or a passive rather than the applied aura.
    if (!(record.baseDurationMs > 0)) {
      problems.push(
        `spell ${String(binding.spellId)} (${required.displayNameEn}) has _duration ${String(record.baseDurationMs)}ms, ` +
          "which cannot anchor a remaining-duration derivation",
      );
    }

    // A DoT with no periodic-damage effect has no tick period, and the one-sided
    // `refreshable` proof has nothing to bound. Refused rather than defaulted:
    // a zero period would make `remains > 0` the test, which is true for every
    // live DoT and would prove `refreshable` FALSE always.
    const effect = effects?.get(binding.spellId);
    if (effect === undefined) {
      problems.push(
        `spell ${String(binding.spellId)} (${required.displayNameEn}) has no E_APPLY_AURA/A_PERIODIC_DAMAGE ` +
          "effect, so it carries no tick period",
      );
    } else if (!(effect.baseTickPeriodMs > 0)) {
      problems.push(
        `spell ${String(binding.spellId)} (${required.displayNameEn}) has _amplitude ` +
          `${String(effect.baseTickPeriodMs)}ms on its periodic-damage effect, which cannot bound refreshable`,
      );
    }
  }

  if (build.hotfixBuild <= 0) problems.push("client_data_version.inc reports a non-positive hotfix build");

  return problems;
}

/**
 * Serialises the artifact the way Prettier would, so the generated file passes
 * `prettier --check` without a manual reformat.
 *
 * Same rule as the GCD extractor: only arrays that would fit are collapsed, and
 * a long STRING is left alone because Prettier does not break one either.
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
  records,
  bindings,
  effects,
  extractedOn,
  rogueModuleSha256,
}) {
  const rogueModuleSource = sources.find((source) => source.path === SOURCES.rogueModule);
  const bindingSourceSha256 = rogueModuleSha256 ?? rogueModuleSource?.sha256 ?? null;
  if (bindingSourceSha256 === null) {
    throw new Error(
      `cannot record the action-token bindings without a measured hash of ${SOURCES.rogueModule}`,
    );
  }

  const dots = REQUIRED_DOTS.map((required) => {
    const binding = bindings.get(required.simcToken);
    if (binding === undefined) throw new Error(`'${required.simcToken}' has no binding to emit`);
    const record = records.get(binding.spellId);
    if (record === undefined) throw new Error(`spell ${String(binding.spellId)} has no record to emit`);
    const effect = effects.get(binding.spellId);
    if (effect === undefined) {
      throw new Error(`spell ${String(binding.spellId)} has no periodic-damage effect to emit`);
    }
    return {
      simcToken: required.simcToken,
      abilityGameId: record.abilityGameId,
      displayNameEn: record.displayNameEn,
      baseDurationMs: record.baseDurationMs,
      baseCooldownMs: record.baseCooldownMs,
      baseTickPeriodMs: effect.baseTickPeriodMs,
      tickPeriodBinding: {
        effectIndex: effect.effectIndex,
        effectType: effect.effectType,
        effectSubtype: effect.effectSubtype,
        sourcePath: SOURCES.spellData,
      },
      durationModel: {
        kind: required.durationModel.kind,
        sourcePath: SOURCES.rogueModule,
        sourceSha256: bindingSourceSha256,
        startLine: required.durationModel.startLine,
        endLine: required.durationModel.endLine,
        finding: required.durationModel.finding,
      },
      binding: {
        method: "SPECIALIZATION_SPELL_TABLE",
        classId: ROGUE_CLASS_ID,
        specId: ASSASSINATION_SPEC_ID,
        sourcePath: SOURCES.specializationSpells,
        createAction: required.createAction,
        specBinding: required.specBinding,
        bindingSourcePath: SOURCES.rogueModule,
        bindingSourceSha256,
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
      // Flattened to match `rogue-gcd-semantics.json`. Both artifacts are pinned
      // to one commit, so a divergence between these four values across the two
      // files is itself evidence one of them was regenerated alone.
      clientDataWowVersion: build.wowVersion,
      clientDataHotfixDate: build.hotfixDate,
      clientDataHotfixBuild: build.hotfixBuild,
      clientDataHotfixHash: build.hotfixHash,
      durationFieldName: "_duration",
      durationFieldUnits: "MILLISECONDS",
      dotDataMethod: "MACHINE_EXTRACTED_DBC_RECORD",
      extractedOn,
      extractorVersion: EXTRACTOR_VERSION,
      durationSemanticsNote:
        "Base values only. NOT haste-scaled, NOT pandemic-extended, NOT talent-modified and NOT snapshotted. " +
        "A consumer needing any of those must model it explicitly, so that a missing model presents as a missing model.",
      applicabilityNote:
        "Not version-gated at runtime, for the same reason as the GCD artifact: CombatFight exposes no client-build " +
        "key, so comparing anything against 12.1.0.69587 would be a gate that always passes while appearing rigorous. " +
        "The build is recorded for traceability; a client build moving is a regeneration trigger for a human.",
    },
    dots,
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

  const layout = deriveScalarFieldIndices(loaded.spellDataLayout, ["_duration", "_cooldown", "_gcd"]);
  if (!layout.ok) fail(layout.error);

  const effectLayout = deriveScalarFieldIndices(
    loaded.spellDataLayout,
    Object.keys(EXPECTED_EFFECT_FIELD_INDICES),
    "spelleffect_data_t",
  );
  if (!effectLayout.ok) fail(effectLayout.error);

  const specSpells = parseSpecializationSpells(loaded.specializationSpells);
  const bindings = new Map();
  for (const required of REQUIRED_DOTS) {
    const resolved = resolveSpecializationSpell(specSpells, required.displayNameEn);
    if (!resolved.ok) fail(resolved.error);
    bindings.set(required.simcToken, resolved.row);
  }

  const wantedIds = [
    ...[...bindings.values()].map((row) => row.spellId),
    ...GCD_ANCHORS.map((a) => a.abilityGameId),
  ];
  const parsed = parseSpellRecords(loaded.spellData, wantedIds, layout.indices);
  if (!parsed.ok) fail(parsed.error);

  const dotSpellIds = [...bindings.values()].map((row) => row.spellId);
  const parsedEffects = parseEffectTickPeriods(loaded.spellData, dotSpellIds, effectLayout.indices);
  if (!parsedEffects.ok) fail(parsedEffects.error);

  const problems = verifyRequiredFacts({
    build: build.value,
    records: parsed.records,
    bindings,
    fieldIndices: layout.indices,
    gcdAnchorRecords: parsed.records,
    effectFieldIndices: effectLayout.indices,
    effects: parsedEffects.effects,
  });
  if (problems.length > 0) fail(`\n  - ${problems.join("\n  - ")}`);

  const artifact = buildArtifact({
    commitSha: typeof args.sha === "string" ? args.sha : "UNKNOWN",
    sources,
    build: build.value,
    records: parsed.records,
    bindings,
    effects: parsedEffects.effects,
    extractedOn: new Date().toISOString().slice(0, 10),
    rogueModuleSha256: sources.find((source) => source.path === SOURCES.rogueModule)?.sha256,
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, formatArtifactJson(artifact), "utf8");

  console.log(`Wrote ${outPath}`);
  console.log(`  rows scanned  ${String(parsed.rowsScanned)}`);
  console.log(`  field indices ${JSON.stringify(layout.indices)} (derived from spell_data.hpp)`);
  console.log(`  effect field indices ${JSON.stringify(effectLayout.indices)}`);
  console.log(`  effect rows scanned ${String(parsedEffects.rowsScanned)}`);
  for (const dot of artifact.dots) {
    console.log(
      `  ${dot.simcToken} -> ${String(dot.abilityGameId)} duration ${String(dot.baseDurationMs)}ms ` +
        `tick ${String(dot.baseTickPeriodMs)}ms model ${dot.durationModel.kind}`,
    );
  }
  console.log(
    `  NOTE: ${SOURCES.rogueModule} was hashed, NOT parsed. Action-token bindings are hand-reviewed.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
