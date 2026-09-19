#!/usr/bin/env node
/**
 * Deterministic SimulationCraft aura-duration extractor for the Blood Death
 * Knight `buff.<name>.remains` slice (M11-B4).
 *
 * Reads the generated spell tables from ONE pinned SimulationCraft commit and
 * emits, for each aura the pinned Blood list reads as `buff.<name>.remains`,
 * the facts a remaining-duration derivation needs and NOTHING it must guess:
 *
 *     the base `_duration` (MILLISECONDS)
 *     every duration MODIFIER that affects the aura, with the spell it comes
 *       from, whether that spell is an UNCONDITIONAL specialization passive,
 *       and therefore the FINAL Blood duration
 *     the spell attributes that would change the REFRESH behaviour
 *     whether any effect makes the buff TICK (which also changes it)
 *     `_max_stack` and `_internal_cooldown`, recorded for traceability
 *     the REMAINS MODEL the derivation may apply
 *
 * WHY MECHANICALLY, AND WHY FROM THESE FILES
 *
 * SimulationCraft does not use the DBC duration as written. `buff_t`'s
 * constructor calls `set_duration( timespan_t::min() )` (buff.cpp:719), which
 * resolves `base_buff_duration = source->get_passive_value( data(), "duration" )`
 * (buff.cpp:852-880): the DBC value AS MODIFIED by every parsed passive —
 * `parse_all_class_passives()` walks `specialization_spells.inc` for the
 * actor's spec and parses every SX_PASSIVE spell (player.cpp:16363-16388), and
 * the Death Knight module calls it (sc_death_knight.cpp:15162). Essence of the
 * Blood Queen is the case that makes this matter: its DBC `_duration` is
 * 20,000 ms, and the Blood specialization aura adds 5,000 ms by label. Typing
 * "20 s" from the table would understate every remainder by five seconds.
 *
 * A modifier from a TALENT is build-dependent. This extractor refuses to write
 * an aura that carries one: the analyzer has no per-decision duration model
 * for a conditional modifier, and a duration that is right for one build and
 * wrong for another is exactly the fabricated state this project exists to
 * prevent. Only a modifier whose source is an SX_PASSIVE entry of the Blood
 * specialization in `specialization_spells.inc` — active for every Blood
 * actor by construction — is applied.
 *
 * THE REMAINS MODELS, AND WHY ONLY TWO
 *
 *     FIXED_DURATION_RESET_ON_GAIN   `_duration > 0`; no SX_REFRESH_EXTENDS_DURATION
 *                                    (pandemic) and no SX_AURA_DOES_NOT_REFRESH
 *                                    flag; no periodic effect (a ticking buff
 *                                    refreshes by TICK or PANDEMIC,
 *                                    buff.cpp:1204-1243). Every `trigger`
 *                                    while active is then a DURATION refresh:
 *                                    the expiry is rescheduled to the FULL
 *                                    duration (buff.cpp:1900-1906, 2532-2578).
 *                                    A stack loss (`decrement`, buff.cpp:2246-
 *                                    2290) never touches the expiry.
 *     PERMANENT                      `_duration <= 0`: clamped to zero
 *                                    (buff.cpp:876-879), no expiration event
 *                                    is scheduled (buff.cpp:2456-2458), and
 *                                    `remains()` reports `timespan_t::min()`
 *                                    while active (buff.cpp:2018-2029).
 *
 * PANDEMIC, EXTEND, TICK, MAX and CUSTOM exist in the engine and are NOT
 * emitted: no aura this slice reads uses one, and a model nobody needs is a
 * model nobody has validated. An aura that would need one fails extraction.
 *
 * THE ONE THING IT MUST GET RIGHT: UNITS. `_duration` is DBC MILLISECONDS;
 * SimulationCraft expressions are SECONDS. The unit is in every field name, the
 * artifact records it, and the validator refuses any other.
 *
 *   node scripts/authority/extract-simc-blood-aura-durations.mjs \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --out src/data/game/deathknight-blood-aura-durations.json
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import {
  deriveScalarFieldIndices,
  parseArgs,
  parseClientDataVersion,
  readMillisecondColumn,
  sourceHashProblem,
} from "./extract-simc-dot-durations.mjs";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;
const DATASET_ID = "SIMC_DBC_DEATHKNIGHT_BLOOD_AURA_DURATIONS";

const DEATH_KNIGHT_CLASS_ID = 6;
const BLOOD_SPEC_ID = 250;

const SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  specializationSpells: "engine/dbc/generated/specialization_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  dataEnums: "engine/dbc/data_enums.hh",
  deathKnightModule: "engine/class_modules/sc_death_knight.cpp",
  buffEngine: "engine/buff/buff.cpp",
};

/**
 * The auras the pinned Blood list reads as `buff.<name>.remains`.
 *
 * `atomName` is the name after `buff.` in the APL. `abilityGameId` is the
 * spell id `deathknight-blood-aura-authority.ts` already pins for the atom —
 * the SAME number a Warcraft Logs aura event carries — and `displayNameEn` is
 * required to match the table row so a transposed id is caught. The
 * `creation` and `producers` strings are the hand-reviewed readings of the
 * Death Knight module; that file is hashed and the lines recorded so the
 * review can be repeated. Entries appear because a reachable pinned line
 * reads them, never speculatively.
 */
const REQUIRED_AURAS = [
  {
    atomName: "bone_shield",
    abilityGameId: 195181,
    displayNameEn: "Bone Shield",
    creation:
      'sc_death_knight.cpp:15905-15935 buffs.bone_shield = make_buff( this, "bone_shield", spell.bone_shield ) — ' +
      "no set_duration, no set_refresh_behavior; ->set_cooldown( 0_ms ) (the spell's internal cooldown governs STACK LOSS, not the buff)",
    producers:
      "marrowrend_t::impact :11720 trigger( effectN( 3 ) ); deaths_caress_t::execute :9770 trigger( stacks ); " +
      "dancing_rune_weapon_t::execute :9498 trigger( bone_shield_stack_gain ); Bone Collector :8611/:11182 trigger(); " +
      "Grim Reaper :8536; Blood Debt 4-piece :11709; rune-weapon pet copies :4206/:4258. Every one is buff_t::trigger, " +
      "so every one is a start (full duration) or a DURATION refresh (full duration).",
    consumers:
      "death_knight_t::bone_shield_handler :16629-16643 — buffs.bone_shield->decrement() on a successful auto-attack " +
      "taken under the 2,500 ms bone_shield_icd. buff_t::decrement (buff.cpp:2246-2290) changes current_stack only; " +
      "the expiration event is not touched.",
  },
  {
    atomName: "essence_of_the_blood_queen",
    abilityGameId: 433925,
    displayNameEn: "Essence of the Blood Queen",
    creation:
      "sc_death_knight.cpp:15876-15877 make_fallback<essence_of_the_blood_queen_buff_t>( talent.sanlayn.vampiric_strike.ok(), " +
      '"essence_of_the_blood_queen", spell.essence_of_the_blood_queen_buff ); the class (:7382-7411) overrides value() ' +
      "and check_value() only — no duration, no refresh behaviour",
    producers:
      "death_knight_t::trigger_sanlayn_execute_talents :13804-13808 — buffs.essence_of_the_blood_queen->trigger() on every " +
      "Vampiric Strike execution: +1 stack (or a refresh at max stacks) and a DURATION refresh to the full duration.",
    consumers: "None: the aura expires whole. No decrement call site exists in the pinned module.",
  },
  {
    atomName: "vampiric_strike",
    abilityGameId: 433899,
    displayNameEn: "Vampiric Strike",
    creation:
      'sc_death_knight.cpp:15882-15883 make_fallback( talent.sanlayn.vampiric_strike.ok(), this, "vampiric_strike", ' +
      "spell.vampiric_strike_buff ) — no duration override, so the DBC -1 clamps to zero and no expiration is scheduled",
    producers:
      "death_knight_t::trigger_vampiric_strike_proc :13782-13800 — buffs.vampiric_strike->trigger() on a proc roll.",
    consumers:
      "death_knight_t::trigger_sanlayn_execute_talents :13810-13811 — buffs.vampiric_strike->expire() on a Vampiric Strike " +
      "execution unless Gift of the San'layn is up.",
  },
  {
    atomName: "crimson_scourge",
    abilityGameId: 81141,
    displayNameEn: "Crimson Scourge",
    creation:
      'sc_death_knight.cpp:15963-15964 make_buff( this, "crimson_scourge", spell.crimson_scourge_buff )' +
      "->set_trigger_spell( spec.crimson_scourge ) — no duration override, no refresh behaviour override",
    producers:
      "blood_plague_t tick :7710-7716 — buffs.crimson_scourge->trigger() when Blood Plague ticks with no Death and Decay " +
      "active; a trigger while up is a DURATION refresh.",
    consumers:
      "death_and_decay_base_t::execute :9695 — buffs.crimson_scourge->decrement() (single stack: expires).",
  },
  {
    atomName: "visceral_strength",
    abilityGameId: 461130,
    displayNameEn: "Visceral Strength",
    creation:
      "sc_death_knight.cpp:15885-15889 make_fallback( talent.sanlayn.visceral_strength.ok(), this, " +
      '"visceral_strength", spell.visceral_strength_buff ) — the Blood id (461130) chosen at :15383-15384; ' +
      "no duration override, no refresh behaviour override",
    producers:
      "death_and_decay_base_t::execute :9701 — buffs.visceral_strength->trigger() when the cast consumed Crimson " +
      "Scourge; sudden_doom_execute_effects :13473-13476 (Unholy only).",
    consumers: "None: the aura expires whole.",
  },
];

/**
 * The flat field indices this parser reads, counted from `_id`, for the two
 * structs. NOT trusted: re-derived from `spell_data.hpp` on every run and
 * compared, so a layout shift is reported as a shift.
 */
const EXPECTED_SPELL_FIELD_INDICES = { _duration: 27, _max_stack: 28, _internal_cooldown: 32 };
const EXPECTED_EFFECT_FIELD_INDICES = {
  _spell_id: 1,
  _index: 2,
  _type: 3,
  _subtype: 4,
  _base_value: 15,
  _misc_value: 16,
  _misc_value_2: 17,
};

/**
 * Cross-artifact anchors: `_duration` values the DoT artifact already pinned
 * from these SAME bytes (rogue-dot-durations.json). A wrong column index yields
 * a plausible number; re-reading these at the derived index ties the row
 * layout to a result verified once already.
 */
const DURATION_ANCHORS = [
  { abilityGameId: 703, displayNameEn: "Garrote", baseDurationMs: 18000 },
  { abilityGameId: 1943, displayNameEn: "Rupture", baseDurationMs: 4000 },
];

/**
 * The enumerators this extractor needs, READ from `data_enums.hh` rather than
 * typed: the spell-attribute bit positions that change refresh behaviour, the
 * modifier subtypes and the DURATION property, and the periodic subtypes
 * `buff_t::set_period` treats as ticking (buff.cpp:1216-1223).
 */
const ATTRIBUTE_ENUMS = ["SX_REFRESH_EXTENDS_DURATION", "SX_AURA_DOES_NOT_REFRESH", "SX_PASSIVE"];
const EFFECT_ENUMS = [
  "E_APPLY_AURA",
  "E_APPLY_AREA_AURA_PET",
  "A_ADD_FLAT_MODIFIER",
  "A_ADD_PCT_MODIFIER",
  "A_ADD_PCT_LABEL_MODIFIER",
  "A_ADD_FLAT_LABEL_MODIFIER",
  "P_DURATION",
];
const PERIODIC_SUBTYPE_ENUMS = [
  "A_PERIODIC_ENERGIZE",
  "A_PERIODIC_TRIGGER_SPELL_WITH_VALUE",
  "A_PERIODIC_HEALTH_FUNNEL",
  "A_PERIODIC_MANA_LEECH",
  "A_PERIODIC_DAMAGE_PERCENT",
  "A_PERIODIC_DUMMY",
  "A_PERIODIC_TRIGGER_SPELL",
];

function fail(message) {
  console.error(`EXTRACTION FAILED: ${message}`);
  process.exit(1);
}

/** Reads `NAME = 123` / `NAME = 123u` enumerators. Every requested name must resolve. */
export function parseEnumerators(text, names) {
  const values = {};
  for (const name of names) {
    const match = new RegExp(`^\\s*${name}\\s*=\\s*(\\d+)u?\\s*,?`, "m").exec(text);
    if (match === null) return { ok: false, error: `data_enums.hh declares no ${name}` };
    values[name] = Number.parseInt(match[1], 10);
  }
  return { ok: true, values };
}

/** Splits one generated row body at top-level commas, keeping `{ ... }` groups whole. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim().length > 0) parts.push(current.trim());
  return parts;
}

function readIntList(group) {
  const inner = group.replace(/^\{/, "").replace(/\}$/, "");
  return inner
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 10));
}

/** The line range of one generated table, so a scan cannot wander into a neighbour. */
function tableBounds(text, declaration) {
  const start = text.indexOf(declaration);
  if (start < 0) return null;
  const bodyStart = text.indexOf("{", start);
  const bodyEnd = text.indexOf("\n};", bodyStart);
  const bodyEndAlt = text.indexOf("\n} };", bodyStart);
  const end = bodyEnd < 0 ? bodyEndAlt : bodyEndAlt < 0 ? bodyEnd : Math.min(bodyEnd, bodyEndAlt);
  if (bodyStart < 0 || end < 0) return null;
  return text.slice(bodyStart, end);
}

/**
 * Parses the `__spell_data` rows this extractor needs.
 *
 * Each row is `{ "Name", id, <scalars...>, { attributes }, { class_flags }, family, ... }`.
 * The scalar prefix is read at the DERIVED indices; the attribute and class-flag
 * groups and the family are read positionally after it, and the row's effect
 * ids come from its trailing `/* ... *\/` comment.
 */
export function parseSpellRows(text, wantedIds, fieldIndices, attributeCount, classFlagCount) {
  const wanted = new Set([...wantedIds].map(Number));
  const found = new Map();
  const duplicates = [];
  const body = tableBounds(text, "__spell_data[");
  if (body === null) return { ok: false, error: "sc_spell_data.inc declares no __spell_data table" };

  for (const line of body.split(/\r?\n/)) {
    const open = line.indexOf('{ "');
    if (open < 0) continue;
    const close = line.indexOf('"', open + 3);
    if (close < 0) continue;
    const displayNameEn = line.slice(open + 3, close);
    const rest = line.slice(close + 1);
    const commentAt = rest.indexOf("/*");
    const rowBody = (commentAt < 0 ? rest : rest.slice(0, commentAt)).replace(/\}\s*,?\s*$/, "");
    const parts = splitTopLevel(rowBody.replace(/^\s*,\s*/, ""));
    const idRaw = parts[0];
    if (idRaw === undefined || !/^\d+$/.test(idRaw)) continue;
    const abilityGameId = Number.parseInt(idRaw, 10);
    if (!wanted.has(abilityGameId)) continue;

    const columns = {};
    for (const [fieldName, index] of Object.entries(fieldIndices)) {
      const read = readMillisecondColumn(parts[index], fieldName, abilityGameId);
      if (!read.ok) return read;
      columns[fieldName] = read.value;
    }
    const groupIndex = parts.findIndex((part) => part.startsWith("{"));
    if (groupIndex < 0) return { ok: false, error: `spell ${abilityGameId} row has no attribute group` };
    const attributes = readIntList(parts[groupIndex]);
    const classFlags = readIntList(parts[groupIndex + 1] ?? "{}");
    const familyRaw = parts[groupIndex + 2];
    if (attributes.length !== attributeCount || classFlags.length !== classFlagCount) {
      return {
        ok: false,
        error: `spell ${abilityGameId} row carries ${attributes.length} attribute words and ${classFlags.length} class-flag words; expected ${attributeCount} and ${classFlagCount}`,
      };
    }
    if (familyRaw === undefined || !/^\d+$/.test(familyRaw)) {
      return { ok: false, error: `spell ${abilityGameId} row has no readable class family` };
    }
    const effectIds =
      commentAt < 0
        ? []
        : (
            rest
              .slice(commentAt + 2)
              .replace(/\*\/.*$/, "")
              .match(/\d+/g) ?? []
          ).map((value) => Number.parseInt(value, 10));

    const record = {
      abilityGameId,
      displayNameEn,
      baseDurationMs: columns._duration,
      maxStack: columns._max_stack,
      internalCooldownMs: columns._internal_cooldown,
      attributes,
      classFlags,
      classFamily: Number.parseInt(familyRaw, 10),
      effectIds,
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
  return { ok: true, records: found };
}

/** Whether attribute bit `attr` (a spell_attribute enumerator) is set — `spell_data_t::flags`, spell_data.hpp:773-781. */
export function hasAttribute(attributes, attr) {
  const word = attributes[Math.floor(attr / 32)];
  if (word === undefined) return false;
  return ((word >>> (attr % 32)) & 1) === 1;
}

/**
 * Parses every `__spelleffect_data` row into the columns this extractor reads.
 *
 * All rows, not only the wanted spells': a duration MODIFIER lives on the
 * modifying spell's effect, whose `_spell_id` is that spell, so the scan must
 * see everything and match by class flags or label afterwards.
 */
export function parseEffectRows(text, fieldIndices, classFlagCount) {
  const body = tableBounds(text, "__spelleffect_data[");
  if (body === null) return { ok: false, error: "sc_spell_data.inc declares no __spelleffect_data table" };
  const rows = [];
  for (const line of body.split(/\r?\n/)) {
    const open = line.indexOf("{");
    if (open < 0) continue;
    const parts = splitTopLevel(line.slice(open + 1).replace(/\}\s*,?\s*$/, ""));
    const idRaw = parts[0];
    if (idRaw === undefined || !/^\d+$/.test(idRaw)) continue;
    const groupIndex = parts.findIndex((part) => part.startsWith("{"));
    if (groupIndex < 0) continue;
    const classFlags = readIntList(parts[groupIndex]);
    if (classFlags.length !== classFlagCount) continue;
    const int = (index) => {
      const raw = parts[index];
      return raw !== undefined && /^-?\d+$/.test(raw) ? Number.parseInt(raw, 10) : null;
    };
    const baseRaw = parts[fieldIndices._base_value];
    rows.push({
      effectId: Number.parseInt(idRaw, 10),
      spellId: int(fieldIndices._spell_id),
      index: int(fieldIndices._index),
      type: int(fieldIndices._type),
      subtype: int(fieldIndices._subtype),
      baseValue:
        baseRaw !== undefined && /^-?\d+(?:\.\d+)?$/.test(baseRaw) ? Number.parseFloat(baseRaw) : null,
      miscValue: int(fieldIndices._misc_value),
      miscValue2: int(fieldIndices._misc_value_2),
      classFlags,
    });
  }
  return { ok: true, rows };
}

/** Parses `__spelllabel_data` rows `{ spellId, label }` into spellId -> labels. */
export function parseLabelRows(text) {
  const body = tableBounds(text, "__spelllabel_data");
  if (body === null) return { ok: false, error: "sc_spell_data.inc declares no __spelllabel_data table" };
  const labels = new Map();
  for (const match of body.matchAll(/\{\s*(\d+),\s*(-?\d+)\s*\}/g)) {
    const spellId = Number.parseInt(match[1], 10);
    const label = Number.parseInt(match[2], 10);
    const list = labels.get(spellId) ?? [];
    list.push(label);
    labels.set(spellId, list);
  }
  return { ok: true, labels };
}

/** Parses `specialization_spells.inc` rows `{ classId, specId, spellId, replaces, "Name", flags }`. */
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
      displayNameEn: match[5],
    });
  }
  return rows;
}

/**
 * Every duration modifier affecting one aura, matched the way SimulationCraft's
 * `parse_passive_effects` matches: a class-flag modifier applies when the
 * modifying spell shares the aura's class family and at least one class-flag
 * word overlaps (`spell_data_t::affected_by`); a label modifier applies when
 * the aura carries the effect's `_misc_value_2` label (`affected_by_label`).
 */
export function durationModifiersFor(aura, effects, spells, labels, enums) {
  const found = [];
  const auraLabels = new Set(labels.get(aura.abilityGameId) ?? []);
  for (const effect of effects) {
    if (effect.type !== enums.E_APPLY_AURA || effect.miscValue !== enums.P_DURATION) continue;
    const flat =
      effect.subtype === enums.A_ADD_FLAT_MODIFIER || effect.subtype === enums.A_ADD_FLAT_LABEL_MODIFIER;
    const pct =
      effect.subtype === enums.A_ADD_PCT_MODIFIER || effect.subtype === enums.A_ADD_PCT_LABEL_MODIFIER;
    if (!flat && !pct) continue;
    const byLabel =
      effect.subtype === enums.A_ADD_FLAT_LABEL_MODIFIER || effect.subtype === enums.A_ADD_PCT_LABEL_MODIFIER;
    let matchedBy = null;
    if (byLabel) {
      if (auraLabels.has(effect.miscValue2)) matchedBy = "LABEL";
    } else {
      const parent = spells.get(effect.spellId);
      if (
        parent !== undefined &&
        parent.classFamily === aura.classFamily &&
        aura.classFlags.some((word, index) => (word & (effect.classFlags[index] ?? 0)) !== 0)
      ) {
        matchedBy = "CLASS_FLAGS";
      }
    }
    if (matchedBy === null) continue;
    found.push({
      effectId: effect.effectId,
      spellId: effect.spellId,
      effectIndex: effect.index,
      effectSubtype: effect.subtype,
      kind: flat ? "FLAT_MS" : "PCT",
      value: effect.baseValue,
      matchedBy,
      label: byLabel ? effect.miscValue2 : null,
    });
  }
  return found;
}

function formatArtifactJson(artifact) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
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

export function buildArtifact({ sha, build, sources, auras, extractedOn, enums }) {
  return {
    artifactVersion: ARTIFACT_VERSION,
    datasetId: DATASET_ID,
    artifactRevision: `simc-${sha.slice(0, 8)}-${String(EXTRACTOR_VERSION)}`,
    provenance: {
      repository: REPOSITORY,
      commitSha: sha,
      sources,
      clientDataWowVersion: build.wowVersion,
      clientDataHotfixDate: build.hotfixDate,
      clientDataHotfixBuild: build.hotfixBuild,
      clientDataHotfixHash: build.hotfixHash,
      durationFieldName: "_duration",
      durationFieldUnits: "MILLISECONDS",
      extractedOn,
      extractorVersion: EXTRACTOR_VERSION,
      enumerators: enums,
      durationSemanticsNote:
        "finalDurationMs is spell_data_t::_duration plus every duration modifier from an SX_PASSIVE spell of the Blood " +
        "specialization (specialization_spells.inc, class 6 spec 250), which SimulationCraft applies through " +
        "parse_all_class_passives (player.cpp:16363-16388) before buff_t::set_duration reads " +
        'get_passive_value( data(), "duration" ) (buff.cpp:852-880). Not haste-scaled (no SX_DURATION_HASTED ' +
        "aura is modelled), not build-dependent: an aura carrying a modifier from any other spell fails extraction.",
      remainsModelNote:
        "FIXED_DURATION_RESET_ON_GAIN: buff_t::increment starts the buff with the full duration when inactive " +
        "(buff.cpp:2428-2470) and otherwise calls refresh, whose DURATION behaviour reschedules the expiry to the " +
        "full duration (buff.cpp:1900-1906, 2532-2578); decrement never touches the expiry (buff.cpp:2246-2290). " +
        "The behaviour is DURATION when the spell carries neither SX_REFRESH_EXTENDS_DURATION nor " +
        "SX_AURA_DOES_NOT_REFRESH (buff.cpp:725-757, 1635-1660) and no periodic effect makes it tick " +
        "(buff.cpp:1204-1243). PERMANENT: a non-positive _duration clamps to zero (buff.cpp:876-879), no expiration " +
        "is scheduled (buff.cpp:2456-2458) and remains() is timespan_t::min() while active (buff.cpp:2018-2029).",
      applicabilityNote:
        "Not version-gated at runtime: CombatFight exposes no client-build key. The build is recorded for " +
        "traceability; a client build moving is a regeneration trigger for a human.",
    },
    auras,
  };
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

  const enumsRead = parseEnumerators(loaded.dataEnums, [
    ...ATTRIBUTE_ENUMS,
    ...EFFECT_ENUMS,
    ...PERIODIC_SUBTYPE_ENUMS,
  ]);
  if (!enumsRead.ok) fail(enumsRead.error);
  const enums = enumsRead.values;

  const spellLayout = deriveScalarFieldIndices(
    loaded.spellDataLayout,
    Object.keys(EXPECTED_SPELL_FIELD_INDICES),
  );
  if (!spellLayout.ok) fail(spellLayout.error);
  for (const [name, expected] of Object.entries(EXPECTED_SPELL_FIELD_INDICES)) {
    if (spellLayout.indices[name] !== expected) {
      fail(
        `${name} is at flat field index ${String(spellLayout.indices[name])}; this parser was written against ${String(expected)}`,
      );
    }
  }
  const effectLayout = deriveScalarFieldIndices(
    loaded.spellDataLayout,
    Object.keys(EXPECTED_EFFECT_FIELD_INDICES),
    "spelleffect_data_t",
  );
  if (!effectLayout.ok) fail(effectLayout.error);
  for (const [name, expected] of Object.entries(EXPECTED_EFFECT_FIELD_INDICES)) {
    if (effectLayout.indices[name] !== expected) {
      fail(
        `effect ${name} is at flat field index ${String(effectLayout.indices[name])}; this parser was written against ${String(expected)}`,
      );
    }
  }
  const attributeCount = Number.parseInt(
    /NUM_SPELL_FLAGS\s*=\s*(\d+)/.exec(loaded.spellDataLayout)?.[1] ?? "",
    10,
  );
  const classFlagCount = Number.parseInt(
    /NUM_CLASS_FAMILY_FLAGS\s*=\s*(\d+)/.exec(loaded.spellDataLayout)?.[1] ?? "",
    10,
  );
  if (!Number.isInteger(attributeCount) || !Number.isInteger(classFlagCount)) {
    fail("spell_data.hpp declares no NUM_SPELL_FLAGS / NUM_CLASS_FAMILY_FLAGS");
  }

  const effectsRead = parseEffectRows(loaded.spellData, effectLayout.indices, classFlagCount);
  if (!effectsRead.ok) fail(effectsRead.error);
  const labelsRead = parseLabelRows(loaded.spellData);
  if (!labelsRead.ok) fail(labelsRead.error);

  // Every spell that a candidate modifier could come from must be readable, so
  // the wanted set is the auras, the anchors, and every modifier's parent.
  const modifierParents = new Set(
    effectsRead.rows
      .filter((effect) => effect.type === enums.E_APPLY_AURA && effect.miscValue === enums.P_DURATION)
      .map((effect) => effect.spellId),
  );
  const wantedIds = new Set([
    ...REQUIRED_AURAS.map((aura) => aura.abilityGameId),
    ...DURATION_ANCHORS.map((anchor) => anchor.abilityGameId),
    ...modifierParents,
  ]);
  const spellsRead = parseSpellRows(
    loaded.spellData,
    wantedIds,
    spellLayout.indices,
    attributeCount,
    classFlagCount,
  );
  if (!spellsRead.ok) fail(spellsRead.error);
  const spells = spellsRead.records;

  for (const anchor of DURATION_ANCHORS) {
    const record = spells.get(anchor.abilityGameId);
    if (
      record === undefined ||
      record.displayNameEn !== anchor.displayNameEn ||
      record.baseDurationMs !== anchor.baseDurationMs
    ) {
      fail(
        `duration anchor ${anchor.displayNameEn} (${String(anchor.abilityGameId)}) did not read back as ${String(anchor.baseDurationMs)} ms; the column layout is suspect`,
      );
    }
  }

  const specRows = parseSpecializationSpells(loaded.specializationSpells);
  const bloodPassives = new Map();
  for (const row of specRows) {
    if (row.classId !== DEATH_KNIGHT_CLASS_ID || row.specId !== BLOOD_SPEC_ID) continue;
    const spell = spells.get(row.spellId);
    if (spell !== undefined && hasAttribute(spell.attributes, enums.SX_PASSIVE)) {
      bloodPassives.set(row.spellId, row.displayNameEn);
    }
  }

  const periodicSubtypes = new Set(PERIODIC_SUBTYPE_ENUMS.map((name) => enums[name]));
  const effectsBySpell = new Map();
  for (const effect of effectsRead.rows) {
    const list = effectsBySpell.get(effect.spellId) ?? [];
    list.push(effect);
    effectsBySpell.set(effect.spellId, list);
  }

  const auras = [];
  for (const required of REQUIRED_AURAS) {
    const record = spells.get(required.abilityGameId);
    if (record === undefined)
      fail(`spell ${String(required.abilityGameId)} (${required.atomName}) is not in the pinned table`);
    if (record.displayNameEn !== required.displayNameEn) {
      fail(
        `spell ${String(required.abilityGameId)} is named '${record.displayNameEn}', not '${required.displayNameEn}'`,
      );
    }
    const refreshExtends = hasAttribute(record.attributes, enums.SX_REFRESH_EXTENDS_DURATION);
    const doesNotRefresh = hasAttribute(record.attributes, enums.SX_AURA_DOES_NOT_REFRESH);
    const ownEffects = effectsBySpell.get(required.abilityGameId) ?? [];
    const periodic = ownEffects.filter(
      (effect) =>
        (effect.type === enums.E_APPLY_AURA || effect.type === enums.E_APPLY_AREA_AURA_PET) &&
        periodicSubtypes.has(effect.subtype),
    );
    const modifiers = durationModifiersFor(record, effectsRead.rows, spells, labelsRead.labels, enums).map(
      (modifier) => ({
        ...modifier,
        spellDisplayNameEn: spells.get(modifier.spellId)?.displayNameEn ?? null,
        applicability: bloodPassives.has(modifier.spellId)
          ? "BLOOD_SPECIALIZATION_PASSIVE"
          : "BUILD_DEPENDENT",
      }),
    );

    let remainsModel;
    let finalDurationMs;
    if (record.baseDurationMs <= 0) {
      remainsModel = "PERMANENT";
      finalDurationMs = 0;
      if (modifiers.length > 0) {
        fail(
          `${required.atomName} is PERMANENT (_duration ${String(record.baseDurationMs)}) yet carries duration modifiers; not modelled`,
        );
      }
    } else {
      if (refreshExtends)
        fail(`${required.atomName} carries SX_REFRESH_EXTENDS_DURATION (pandemic refresh); not modelled`);
      if (doesNotRefresh) fail(`${required.atomName} carries SX_AURA_DOES_NOT_REFRESH; not modelled`);
      if (periodic.length > 0) {
        fail(
          `${required.atomName} has a periodic effect (subtype ${periodic.map((e) => e.subtype).join(",")}) and would refresh by TICK; not modelled`,
        );
      }
      for (const modifier of modifiers) {
        if (modifier.applicability !== "BLOOD_SPECIALIZATION_PASSIVE") {
          fail(
            `${required.atomName} carries a BUILD_DEPENDENT duration modifier from spell ${String(modifier.spellId)} (${modifier.spellDisplayNameEn ?? "?"}); not modelled`,
          );
        }
        if (modifier.kind !== "FLAT_MS") {
          fail(
            `${required.atomName} carries a percentage duration modifier from spell ${String(modifier.spellId)}; not modelled`,
          );
        }
        if (!Number.isInteger(modifier.value)) {
          fail(
            `${required.atomName} modifier from spell ${String(modifier.spellId)} has a fractional value ${String(modifier.value)}`,
          );
        }
      }
      remainsModel = "FIXED_DURATION_RESET_ON_GAIN";
      finalDurationMs = record.baseDurationMs + modifiers.reduce((sum, modifier) => sum + modifier.value, 0);
    }

    auras.push({
      atomName: required.atomName,
      abilityGameId: required.abilityGameId,
      displayNameEn: record.displayNameEn,
      baseDurationMs: record.baseDurationMs,
      durationModifiers: modifiers.map((modifier) => ({
        effectId: modifier.effectId,
        spellId: modifier.spellId,
        spellDisplayNameEn: modifier.spellDisplayNameEn,
        effectIndex: modifier.effectIndex,
        effectSubtype: modifier.effectSubtype,
        kind: modifier.kind,
        valueMs: modifier.value,
        matchedBy: modifier.matchedBy,
        label: modifier.label,
        applicability: modifier.applicability,
        applicabilityBasis:
          modifier.applicability === "BLOOD_SPECIALIZATION_PASSIVE"
            ? `specialization_spells.inc { ${String(DEATH_KNIGHT_CLASS_ID)}, ${String(BLOOD_SPEC_ID)}, ${String(modifier.spellId)}, .. } with SX_PASSIVE; parsed by parse_all_class_passives (player.cpp:16363-16388)`
            : "not an SX_PASSIVE entry of the Blood specialization",
      })),
      finalDurationMs,
      maxStack: record.maxStack,
      internalCooldownMs: record.internalCooldownMs,
      refreshAttributes: {
        refreshExtendsDuration: refreshExtends,
        auraDoesNotRefresh: doesNotRefresh,
        periodicEffectSubtypes: periodic.map((effect) => effect.subtype),
      },
      refreshBehavior: remainsModel === "PERMANENT" ? "NONE" : "DURATION",
      remainsModel,
      review: {
        sourcePath: SOURCES.deathKnightModule,
        sourceSha256: sources.find((source) => source.path === SOURCES.deathKnightModule)?.sha256,
        creation: required.creation,
        producers: required.producers,
        consumers: required.consumers,
      },
    });
  }

  const artifact = buildArtifact({
    sha: args.sha ?? "local",
    build: build.value,
    sources,
    auras,
    extractedOn: new Date().toISOString().slice(0, 10),
    enums,
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, formatArtifactJson(artifact), "utf8");

  console.log(`Wrote ${outPath}`);
  console.log(`  spell field indices  ${JSON.stringify(spellLayout.indices)}`);
  console.log(`  effect field indices ${JSON.stringify(effectLayout.indices)}`);
  console.log(`  effect rows          ${String(effectsRead.rows.length)}`);
  console.log(
    `  Blood SX_PASSIVE specialization spells among candidate modifier sources: ${[...bloodPassives.entries()].map(([id, name]) => `${String(id)} ${name}`).join("; ")}`,
  );
  for (const aura of auras) {
    console.log(
      `  ${aura.atomName} -> ${String(aura.abilityGameId)} base ${String(aura.baseDurationMs)}ms ` +
        `modifiers ${aura.durationModifiers.map((m) => `${String(m.spellId)}:${String(m.valueMs)}ms`).join(",") || "none"} ` +
        `final ${String(aura.finalDurationMs)}ms model ${aura.remainsModel} max_stack ${String(aura.maxStack)}`,
    );
  }
  console.log(
    `  NOTE: ${SOURCES.deathKnightModule} and ${SOURCES.buffEngine} were hashed, NOT parsed. Producer/consumer readings are hand-reviewed.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
