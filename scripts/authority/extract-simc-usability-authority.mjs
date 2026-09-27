#!/usr/bin/env node
/**
 * Deterministic SimulationCraft POSITIVE-USABILITY authority extractor
 * (M11-C4i).
 *
 * A positive usability proof for an action the player did NOT cast needs
 * facts a negative proof never did: what range and target mode the action
 * requires, whether it can be cast while moving, and whether anything can
 * make it cost MORE than its DBC base cost. This extractor reads ONE pinned
 * SimulationCraft commit and emits, per target spell:
 *
 *   MACHINE_EXTRACTED_DBC_RECORD      SpellRange min/max, cone, cast time, the
 *                                     channel attributes, every effect's
 *                                     implicit targeting, the spell category
 *                                     and every other spell sharing it, and
 *                                     the spell's __spellpower_data rows.
 *
 *   TARGET_MODE                       derived from the pinned `effect_targeting`
 *                                     enumerators (data_enums.hh), never from
 *                                     memory: ENEMY_UNIT_TARGET when an effect
 *                                     targets T_UNIT_TARGET_ENEMY and the spell
 *                                     has a positive max range;
 *                                     ENEMY_TARGET_DESTINATION when none does
 *                                     but one targets T_DESTINATION_TARGET_ENEMY
 *                                     with a positive max range; UNTARGETED
 *                                     otherwise (a cone, a caster-centred
 *                                     area, a max range of 0).
 *
 *   MOVEMENT_RESTRICTION              action.cpp `action_t::usable_moving()`:
 *                                     an action with a cast time, a channel, or
 *                                     a range in (0, 5] is not usable while the
 *                                     player moves; anything else is.
 *
 *   MACHINE_CENSUS_OF_COST_MODIFIERS  a SUPERSET census: every effect row of
 *                                     EVERY spell in the pinned table that the
 *                                     passive parser or the action-effect parser
 *                                     could turn into a modifier of this spell's
 *                                     resource cost — A_ADD_FLAT/PCT_MODIFIER
 *                                     (107/108) with misc_value1 P_RESOURCE_COST_1/2/3
 *                                     (14/34/39) and a class-family flag match,
 *                                     and the LABEL variants (218/219) with a
 *                                     label match — with its DIRECTION. A
 *                                     consumer may treat the base cost as an
 *                                     upper bound on the real cost only when no
 *                                     census row can INCREASE it.
 *
 *   COST_FORMULA_CHECKS               re-run on every extraction and FATAL when
 *                                     they stop holding: `action_t::cost()` is
 *                                     (base + flat_add + cost_flat_modifier) *
 *                                     pct_mul * cost_pct_multiplier; the base
 *                                     `cost_flat_modifier` only subtracts a
 *                                     resource reduction, and a reduction is
 *                                     only ever gained or lost in non-negative
 *                                     amounts; `cost_pct_multiplier` is 1.0; the
 *                                     class module overrides none of them.
 *
 *     node scripts/authority/extract-simc-usability-authority.mjs --target monk-brewmaster \
 *       --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-27 [--local-<key> <path> ...]
 *
 * Plain JavaScript with no `src/` imports, like every extractor here.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseClientDataVersion,
  readEnumerator,
  structMembers,
  tokenizeRow,
} from "./extract-simc-enchant-effects.mjs";
import {
  formatArtifactJson,
  parseArgs,
  readSpellLabels,
  readSpellRecords,
} from "./extract-simc-ability-cooldowns.mjs";
import { readPowerRows } from "./extract-simc-power-costs.mjs";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;

const SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  spellDataLayout: "engine/dbc/spell_data.hpp",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
  dataEnums: "engine/dbc/data_enums.hh",
  playerModule: "engine/player/player.cpp",
  actionModule: "engine/action/action.cpp",
  classModule: "engine/class_modules/monk/sc_monk.cpp",
  classHeader: "engine/class_modules/monk/sc_monk.hpp",
};

/** The resource-cost properties, keyed to the power-row index they modify (player.cpp:15873-15884). */
const COST_PROPERTIES = { 14: 0, 34: 1, 39: 2 };
const COST_SUBTYPES = {
  107: { name: "A_ADD_FLAT_MODIFIER", match: "CLASS_FLAGS", kind: "FLAT" },
  108: { name: "A_ADD_PCT_MODIFIER", match: "CLASS_FLAGS", kind: "PCT" },
  218: { name: "A_ADD_PCT_LABEL_MODIFIER", match: "LABEL", kind: "PCT" },
  219: { name: "A_ADD_FLAT_LABEL_MODIFIER", match: "LABEL", kind: "FLAT" },
};

const MONK_BREWMASTER_TARGET = {
  datasetId: "SIMC_DBC_MONK_BREWMASTER_USABILITY_AUTHORITY",
  classId: 10,
  className: "Monk",
  specId: 268,
  defaultOut: "src/data/game/monk-brewmaster-usability-authority.json",
  spells: [
    { simcToken: "tiger_palm", spellId: 100780 },
    { simcToken: "blackout_kick", spellId: 205523 },
    { simcToken: "keg_smash", spellId: 121253 },
    { simcToken: "breath_of_fire", spellId: 115181 },
    { simcToken: "invoke_niuzao", spellId: 132578 },
  ],
};

export const TARGETS = { "monk-brewmaster": MONK_BREWMASTER_TARGET };

function fail(message) {
  console.error(`EXTRACTION FAILED: ${message}`);
  process.exit(1);
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

const num = (raw) =>
  raw !== undefined && /^-?\d+(?:\.\d+)?$/.test(raw.trim()) ? Number.parseFloat(raw) : null;
const arr = (raw) =>
  raw === undefined || !raw.trim().startsWith("{")
    ? null
    : raw
        .replace(/[{}]/g, "")
        .split(",")
        .map((v) => num(v));

/** The fields a usability proof reads, for the wanted spells, plus every spell's category (for siblings). */
export function readUsabilitySpells(text, wantedIds, members) {
  const at = (name) => members.indexOf(name);
  const wanted = new Set(wantedIds);
  const found = new Map();
  const byCategory = new Map();
  const start = text.indexOf("__spell_data[");
  const end = text.indexOf("\n};", start);
  for (const line of text.slice(start, end).split(/\r?\n/)) {
    if (!line.includes('{ "')) continue;
    const tokens = tokenizeRow(line);
    if (tokens === null) continue;
    const id = num(tokens[at("_id")]);
    const category = num(tokens[at("_category")]);
    if (id === null) continue;
    if (category !== null && category !== 0)
      byCategory.set(category, [...(byCategory.get(category) ?? []), id]);
    if (!wanted.has(id) || found.has(id)) continue;
    found.set(id, {
      spellId: id,
      nameEn: tokens[0].replace(/^"|"$/g, "").trim(),
      minRangeYd: num(tokens[at("_min_range")]),
      maxRangeYd: num(tokens[at("_max_range")]),
      coneDegrees: num(tokens[at("_cone_degrees")]),
      castTimeMs: num(tokens[at("_cast_time")]),
      gcdMs: num(tokens[at("_gcd")]),
      category,
      attributes: arr(tokens[at("_attributes")]),
    });
  }
  return { found, byCategory };
}

/** Every effect row of the wanted spells (all effects, not only auras), with its implicit targeting. */
export function readEffectTargeting(text, wantedIds, members) {
  const at = (name) => members.indexOf(name);
  const wanted = new Set(wantedIds);
  const rows = new Map();
  const start = text.indexOf("__spelleffect_data[");
  const end = text.indexOf("\n};", start);
  for (const line of text.slice(start, end).split(/\r?\n/)) {
    const tokens = tokenizeRow(line);
    if (tokens === null) continue;
    const spellId = num(tokens[at("_spell_id")]);
    if (spellId === null || !wanted.has(spellId)) continue;
    rows.set(spellId, [
      ...(rows.get(spellId) ?? []),
      {
        index: num(tokens[at("_index")]),
        type: num(tokens[at("_type")]),
        subtype: num(tokens[at("_subtype")]),
        targeting1: num(tokens[at("_targeting_1")]),
        targeting2: num(tokens[at("_targeting_2")]),
      },
    ]);
  }
  for (const list of rows.values()) list.sort((a, b) => a.index - b.index);
  return rows;
}

/** Every effect row in the whole table that could be a resource-cost modifier, by subtype and property. */
export function readCostModifierEffects(text, members) {
  const at = (name) => members.indexOf(name);
  const effects = [];
  let examined = 0;
  const start = text.indexOf("__spelleffect_data[");
  const end = text.indexOf("\n};", start);
  for (const line of text.slice(start, end).split(/\r?\n/)) {
    const tokens = tokenizeRow(line);
    if (tokens === null) continue;
    examined += 1;
    const subtype = num(tokens[at("_subtype")]);
    const misc1 = num(tokens[at("_misc_value")]);
    if (subtype === null || !(subtype in COST_SUBTYPES) || misc1 === null || !(misc1 in COST_PROPERTIES))
      continue;
    effects.push({
      effectId: num(tokens[at("_id")]),
      spellId: num(tokens[at("_spell_id")]),
      index: num(tokens[at("_index")]),
      type: num(tokens[at("_type")]),
      subtype,
      baseValue: num(tokens[at("_base_value")]),
      miscValue1: misc1,
      miscValue2: num(tokens[at("_misc_value_2")]),
      classFlags: arr(tokens[at("_class_flags")]),
    });
  }
  return { effects, examined };
}

function bitSet(attributes, bit) {
  return (((attributes[Math.floor(bit / 32)] ?? 0) >>> (bit % 32)) & 1) === 1;
}

function directionOf(value) {
  if (value < 0) return "DECREASES";
  if (value > 0) return "INCREASES";
  return "NONE";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetName = typeof args.target === "string" ? args.target : null;
  const target = targetName === null ? undefined : TARGETS[targetName];
  if (target === undefined) fail(`--target must be one of ${Object.keys(TARGETS).join(", ")}`);
  const extractedOn = typeof args["extracted-on"] === "string" ? args["extracted-on"] : null;
  if (extractedOn === null || !/^\d{4}-\d{2}-\d{2}$/.test(extractedOn))
    fail("--extracted-on YYYY-MM-DD is required");
  const outPath = typeof args.out === "string" ? args.out : target.defaultOut;

  const loaded = {};
  const sources = [];
  for (const [key, path] of Object.entries(SOURCES)) {
    const buffer = await loadSource(args, key, path);
    loaded[key] = buffer.toString("utf8");
    sources.push({
      path,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      byteLength: buffer.length,
    });
  }
  const build = parseClientDataVersion(loaded.clientDataVersion);
  if (!build.ok) fail(build.error);

  const spellMembers = structMembers(loaded.spellDataLayout, "spell_data_t");
  const effectMembers = structMembers(loaded.spellDataLayout, "spelleffect_data_t");
  const powerMembers = structMembers(loaded.spellDataLayout, "spellpower_data_t");
  for (const [name, members, required] of [
    [
      "spell_data_t",
      spellMembers,
      ["_id", "_min_range", "_max_range", "_cone_degrees", "_cast_time", "_gcd", "_category", "_attributes"],
    ],
    [
      "spelleffect_data_t",
      effectMembers,
      [
        "_id",
        "_spell_id",
        "_index",
        "_type",
        "_subtype",
        "_targeting_1",
        "_targeting_2",
        "_base_value",
        "_misc_value",
        "_misc_value_2",
        "_class_flags",
      ],
    ],
    [
      "spellpower_data_t",
      powerMembers,
      ["_id", "_spell_id", "_aura_id", "_power_type", "_cost", "_cost_max"],
    ],
  ]) {
    if (members === null) fail(`spell_data.hpp does not define struct ${name}`);
    for (const field of required) if (!members.includes(field)) fail(`${name} has no member ${field}`);
  }

  // The pinned enumerators this reading rests on.
  const enums = {};
  for (const name of [
    "T_UNIT_CASTER",
    "T_UNIT_TARGET_ENEMY",
    "T_DESTINATION_TARGET_ENEMY",
    "T_UNIT_CONE_CASTER_TO_DESTINATION_ENEMY",
    "SX_CHANNELED",
    "SX_CHANNELED_2",
    "P_RESOURCE_COST_1",
    "P_RESOURCE_COST_2",
    "P_RESOURCE_COST_3",
  ]) {
    const value = readEnumerator(loaded.dataEnums, name);
    if (value === null) fail(`data_enums.hh declares no ${name}`);
    enums[name] = value;
  }
  if (enums.P_RESOURCE_COST_1 !== 14 || enums.P_RESOURCE_COST_2 !== 34 || enums.P_RESOURCE_COST_3 !== 39) {
    fail("the resource-cost properties are no longer 14/34/39");
  }

  const ids = target.spells.map((spell) => spell.spellId);
  const { found, byCategory } = readUsabilitySpells(loaded.spellData, ids, spellMembers);
  const targeting = readEffectTargeting(loaded.spellData, ids, effectMembers);
  const powerRows = readPowerRows(loaded.spellData, ids, powerMembers);
  if (powerRows === null) fail("sc_spell_data.inc declares no __spellpower_data table");
  const labels = readSpellLabels(loaded.spellData);
  if (labels === null) fail("sc_spell_data.inc has no __spelllabel_data table");

  // Cost-modifier candidates across the WHOLE table, and the owner records the class-flag match needs.
  const { effects: costEffects, examined: costRowsExamined } = readCostModifierEffects(
    loaded.spellData,
    effectMembers,
  );
  const ownerIds = [...new Set([...costEffects.map((effect) => effect.spellId), ...ids])];
  const ownerRead = readSpellRecords(loaded.spellData, ownerIds, spellMembers);
  if (!ownerRead.ok) fail(ownerRead.error);

  // ---- mechanical cost-formula checks ----
  const checks = [];
  const require = (claim, source, holds, finding) => {
    checks.push({ claim, source, finding });
    if (!holds) fail(`${claim} does not hold — ${finding}`);
  };
  const action = loaded.actionModule;
  require("ACTION_COST_FORMULA", SOURCES.actionModule, /double action_t::cost\(\) const[\s\S]{0,600}auto mul = bc\.pct_mul \* cost_pct_multiplier\(\);[\s\S]{0,200}auto add = bc\.flat_add \+ cost_flat_modifier\(\);\s*double c = \( base \+ add \) \* mul;/.test(
    action,
  ), "action_t::cost() computes ( base + bc.flat_add + cost_flat_modifier() ) * bc.pct_mul * cost_pct_multiplier(), and clamps a negative result to 0");
  require("BASE_COST_FLAT_MODIFIER_ONLY_SUBTRACTS_A_REDUCTION", SOURCES.actionModule, /double action_t::cost_flat_modifier\(\) const\s*\{\s*return -player->current\.resource_reduction\[ get_school\(\) \];\s*\}/.test(
    action,
  ), "action_t::cost_flat_modifier() returns -player->current.resource_reduction[ school ]");
  require("BASE_COST_PCT_MULTIPLIER_IS_ONE", SOURCES.actionModule, /double action_t::cost_pct_multiplier\(\) const\s*\{\s*return 1\.0;\s*\}/.test(
    action,
  ), "action_t::cost_pct_multiplier() returns 1.0");
  const player = loaded.playerModule;
  require("RESOURCE_REDUCTION_CHANGES_ONLY_IN_NON_NEGATIVE_AMOUNTS", SOURCES.playerModule, /void player_t::cost_reduction_gain\([^)]*\)\s*\{\s*if \( amount <= 0 \)\s*return;/.test(
    player,
  ) &&
    /void player_t::cost_reduction_loss\([^)]*\)\s*\{\s*if \( amount <= 0 \)\s*return;/.test(player) &&
    (player.match(/resource_reduction\[[^\]]*\]\s*[-+]?=/g) ?? []).length ===
      4, "player_t::cost_reduction_gain / cost_reduction_loss return early on a non-positive amount, and they are the only four writes to current.resource_reduction");
  const module = `${loaded.classModule}\n${loaded.classHeader}`;
  for (const [claim, needle] of [
    ["CLASS_MODULE_OVERRIDES_NO_COST", "cost() const override"],
    ["CLASS_MODULE_OVERRIDES_NO_COST_FLAT_MODIFIER", "cost_flat_modifier"],
    ["CLASS_MODULE_OVERRIDES_NO_COST_PCT_MULTIPLIER", "cost_pct_multiplier"],
    ["CLASS_MODULE_CALLS_NO_APPLY_AFFECTING_AURA", "apply_affecting_aura"],
  ]) {
    const hits = module.split(needle).length - 1;
    require(claim, `${SOURCES.classModule}, ${SOURCES.classHeader}`, hits ===
      0, `${String(hits)} occurrence(s) of '${needle}'`);
  }
  require("USABLE_MOVING_RULE", SOURCES.actionModule, /bool action_t::usable_moving\(\) const[\s\S]{0,300}if \( execute_time\(\) > 0_ms \)\s*return false;\s*if \( channeled \)\s*return false;\s*if \( range > 0 && range <= 5 \)\s*return false;\s*return true;/.test(
    action,
  ), "action_t::usable_moving() is false for a cast time, a channel, or a range in (0, 5], and true otherwise (the norgannons_sagacity exception only widens it)");

  // ---- per spell ----
  const spells = [];
  for (const spell of target.spells) {
    const record = found.get(spell.spellId);
    if (record === undefined) fail(`spell ${String(spell.spellId)} is not in the pinned spell table`);
    for (const [key, value] of Object.entries(record)) {
      if (value === null) fail(`spell ${String(spell.spellId)}: ${key} is not readable`);
    }
    const effects = targeting.get(spell.spellId) ?? [];
    const channeled =
      bitSet(record.attributes, enums.SX_CHANNELED) || bitSet(record.attributes, enums.SX_CHANNELED_2);
    const unitEnemy = effects.some((effect) => effect.targeting1 === enums.T_UNIT_TARGET_ENEMY);
    const destEnemy = effects.some((effect) => effect.targeting1 === enums.T_DESTINATION_TARGET_ENEMY);
    const targetMode =
      record.maxRangeYd > 0 && unitEnemy
        ? "ENEMY_UNIT_TARGET"
        : record.maxRangeYd > 0 && destEnemy
          ? "ENEMY_TARGET_DESTINATION"
          : "UNTARGETED";
    const movementRestriction =
      record.castTimeMs > 0 || channeled || (record.maxRangeYd > 0 && record.maxRangeYd <= 5)
        ? "NOT_USABLE_WHILE_MOVING"
        : "USABLE_WHILE_MOVING";
    const rows = (powerRows.get(spell.spellId) ?? []).map((row, index) => ({ powerRowIndex: index, ...row }));
    const owner = ownerRead.records.get(spell.spellId);
    if (owner === undefined) fail(`spell ${String(spell.spellId)} has no owner record`);
    const targetLabels = labels.get(spell.spellId) ?? [];
    const modifiers = [];
    for (const effect of costEffects) {
      const rule = COST_SUBTYPES[effect.subtype];
      const rowIndex = COST_PROPERTIES[effect.miscValue1];
      if (!rows.some((row) => row.powerRowIndex === rowIndex)) continue;
      let matchedBy = null;
      if (rule.match === "CLASS_FLAGS") {
        const source = ownerRead.records.get(effect.spellId);
        if (source === undefined || effect.classFlags === null) continue;
        if (source.classFamily !== owner.classFamily) continue;
        if (effect.classFlags.some((word, i) => (word & (owner.classFlags[i] ?? 0)) !== 0))
          matchedBy = "CLASS_FLAGS";
      } else if (targetLabels.includes(effect.miscValue2)) {
        matchedBy = `LABEL:${String(effect.miscValue2)}`;
      }
      if (matchedBy === null) continue;
      const source = ownerRead.records.get(effect.spellId);
      modifiers.push({
        spellId: effect.spellId,
        displayNameEn: source?.nameEn ?? null,
        effectId: effect.effectId,
        effectIndex: effect.index,
        subtype: effect.subtype,
        subtypeName: rule.name,
        property: effect.miscValue1,
        powerRowIndex: rowIndex,
        kind: rule.kind,
        value: effect.baseValue,
        matchedBy,
        direction: directionOf(effect.baseValue),
      });
    }
    modifiers.sort((a, b) => a.spellId - b.spellId || a.effectIndex - b.effectIndex);
    spells.push({
      simcToken: spell.simcToken,
      spellId: spell.spellId,
      displayNameEn: record.nameEn,
      minRangeYd: record.minRangeYd,
      maxRangeYd: record.maxRangeYd,
      coneDegrees: record.coneDegrees,
      castTimeMs: record.castTimeMs,
      channeled,
      gcdMs: record.gcdMs,
      effectTargeting: effects,
      targetMode,
      movementRestriction,
      category: record.category,
      categorySiblingSpellIds:
        record.category === 0
          ? []
          : (byCategory.get(record.category) ?? []).filter((id) => id !== spell.spellId),
      powerRows: rows.map((row) => ({
        powerRowIndex: row.powerRowIndex,
        powerType: row.powerType,
        cost: row.cost,
        costMax: row.costMax,
        auraSpellId: row.auraSpellId,
      })),
      costModifierCensus: {
        method: "MACHINE_CENSUS_OF_COST_MODIFIERS",
        effectRowsExamined: costRowsExamined,
        subtypesChecked: Object.entries(COST_SUBTYPES).map(([id, rule]) => `${id}:${rule.name}`),
        propertiesChecked: ["14:P_RESOURCE_COST_1", "34:P_RESOURCE_COST_2", "39:P_RESOURCE_COST_3"],
        rule: "Every effect row of every spell in the pinned table: A_ADD_FLAT/PCT_MODIFIER (107/108) whose misc_value1 is the resource-cost property of one of this spell's power rows, owned by a spell of the same class family whose effect class flags intersect this spell's; and the LABEL variants (218/219) whose misc_value2 is one of this spell's labels. A superset of what the passive parser and the action-effect parser can apply, so a row absent here cannot modify the cost.",
        modifiers,
      },
    });
  }

  const artifact = {
    artifactVersion: ARTIFACT_VERSION,
    datasetId: target.datasetId,
    artifactRevision: `simc-${(typeof args.sha === "string" ? args.sha : "local").slice(0, 8)}-1`,
    provenance: {
      repository: REPOSITORY,
      commitSha: typeof args.sha === "string" ? args.sha : null,
      sources,
      clientDataWowVersion: build.value.wowVersion,
      clientDataHotfixDate: build.value.hotfixDate,
      clientDataHotfixBuild: build.value.hotfixBuild,
      clientDataHotfixHash: build.value.hotfixHash,
      classId: target.classId,
      className: target.className,
      specId: target.specId,
      extractedOn,
      extractorVersion: EXTRACTOR_VERSION,
      method: "MACHINE_EXTRACTED_DBC_RECORD",
      effectTargetingEnumerators: {
        T_UNIT_CASTER: enums.T_UNIT_CASTER,
        T_UNIT_TARGET_ENEMY: enums.T_UNIT_TARGET_ENEMY,
        T_DESTINATION_TARGET_ENEMY: enums.T_DESTINATION_TARGET_ENEMY,
        T_UNIT_CONE_CASTER_TO_DESTINATION_ENEMY: enums.T_UNIT_CONE_CASTER_TO_DESTINATION_ENEMY,
      },
      channelAttributeBits: { SX_CHANNELED: enums.SX_CHANNELED, SX_CHANNELED_2: enums.SX_CHANNELED_2 },
      targetModeRule:
        "ENEMY_UNIT_TARGET: max range > 0 and some effect's targeting_1 is T_UNIT_TARGET_ENEMY. ENEMY_TARGET_DESTINATION: max range > 0, no effect targets T_UNIT_TARGET_ENEMY, and some effect's targeting_1 is T_DESTINATION_TARGET_ENEMY. UNTARGETED: anything else (a cone, a caster-centred area, max range 0).",
      applicabilityNote:
        "Not version-gated at runtime, for the same reason as the other pinned datasets: CombatFight exposes no client-build key. The build is recorded for traceability.",
    },
    costFormulaChecks: checks,
    spells,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, formatArtifactJson(artifact), "utf8");
  console.log(`Wrote ${outPath}`);
  for (const spell of spells) {
    console.log(
      `  ${spell.simcToken} ${String(spell.spellId)}: range ${String(spell.minRangeYd)}-${String(spell.maxRangeYd)} ${spell.targetMode} ${spell.movementRestriction} cast ${String(spell.castTimeMs)} channeled ${String(spell.channeled)} category ${String(spell.category)} [${spell.categorySiblingSpellIds.join(",")}] power rows ${String(spell.powerRows.length)} cost modifiers ${String(spell.costModifierCensus.modifiers.length)}`,
    );
    for (const modifier of spell.costModifierCensus.modifiers) {
      console.log(
        `    ${String(modifier.spellId)} ${String(modifier.displayNameEn)} ${modifier.subtypeName} ${String(modifier.value)} ${modifier.direction} via ${modifier.matchedBy}`,
      );
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
