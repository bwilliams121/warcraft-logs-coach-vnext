#!/usr/bin/env node
/**
 * Deterministic PREPARATION consumable identity extractor.
 *
 * Classifies the spells a player casts to use a health potion, a healthstone
 * or a combat potion, from the client data of one pinned SimulationCraft
 * commit. It judges nothing about the player; it only names spells.
 *
 * The client's own SHARED COOLDOWN CATEGORIES are the classification, not
 * spell names:
 *
 *   HEALTH_POTION  every spell on the shared health-potion cooldown
 *                  (category 30), except healthstones.
 *   COMBAT_POTION  every spell on the shared combat-potion cooldown
 *                  (category 4).
 *   HEALTHSTONE    a spell whose name ends in "Healthstone", that heals
 *                  directly (effect HEAL 10 or HEAL_PCT 136), and that has a
 *                  cooldown category of its own. This excludes the warlock
 *                  talent modifiers named "Empowered Healthstone", which are
 *                  auras, not uses.
 *
 * A category is a SLOT: anything on the health-potion cooldown is a use of
 * the player's health-potion slot (old potions and injectors included), and
 * each use keeps its own spell identity, so reporting can name it.
 *
 * Fail-closed guards:
 * - the spell row's field order is checked against anchors before any
 *   classification: Healthstone 6262 must read category 1711 and heal
 *   percent, Silvermoon Health Potion 1234768 category 30 and HEAL, Potion of
 *   Recklessness 1236994 category 4 and an aura. A shifted column, or a
 *   client that moved those categories, stops the extraction;
 * - racial abilities are never classified: a spell with a race mask, or one
 *   listed in racial_spells.inc, stops the extraction if it lands in a class.
 *
 * Local pinned copies only, each SHA-256 recorded:
 *
 *   node scripts/authority/extract-preparation-consumables.mjs \
 *     --sha <40-hex commit> --file-spellData <sc_spell_data.inc> \
 *     --file-racialSpells <racial_spells.inc> --file-clientDataVersion <client_data_version.inc> \
 *     --out src/data/game/preparation-consumables.json
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { format, resolveConfig } from "prettier";

import { parseArgs, parseClientDataVersion, sourceHashProblem } from "./extract-simc-talents.mjs";

const REPOSITORY = "https://github.com/simulationcraft/simc";
export const EXTRACTOR_VERSION = 1;

const SOURCES = {
  spellData: "engine/dbc/generated/sc_spell_data.inc",
  racialSpells: "engine/dbc/generated/racial_spells.inc",
  clientDataVersion: "engine/dbc/generated/client_data_version.inc",
};

/** The client's shared cooldown categories this extractor classifies by. */
export const SHARED_COOLDOWN_CATEGORIES = { HEALTH_POTION: 30, COMBAT_POTION: 4 };

/** Spell effect types read (SpellEffect.dbc). */
const EFFECT_HEAL = 10;
const EFFECT_APPLY_AURA = 6;
const EFFECT_HEAL_PCT = 136;

/**
 * spell_data_t field indexes AFTER the name and id (engine/dbc/spell_data.hpp
 * member order at the pinned commits). Verified by the anchors below.
 */
const FIELD = { raceMask: 4, cooldownMs: 14, categoryCooldownMs: 16, category: 21, durationMs: 26 };

/** Rows the column guard checks before anything is classified. */
export const ANCHORS = [
  { spellId: 6262, name: "Healthstone", category: 1711, effect: EFFECT_HEAL_PCT, kind: "HEALTHSTONE" },
  {
    spellId: 1234768,
    name: "Silvermoon Health Potion",
    category: 30,
    effect: EFFECT_HEAL,
    kind: "HEALTH_POTION",
  },
  {
    spellId: 1236994,
    name: "Potion of Recklessness",
    category: 4,
    effect: EFFECT_APPLY_AURA,
    kind: "COMBAT_POTION",
  },
];

function fail(message) {
  console.error(`EXTRACTION FAILED: ${message}`);
  process.exit(1);
}

/** Spell rows and their effect types from sc_spell_data.inc. */
export function parseSpellData(text) {
  const spells = new Map();
  const effectTypes = new Map();
  for (const line of text.split(/\r?\n/)) {
    const spell = /^\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*(\d+),(.*)$/.exec(line);
    if (spell !== null) {
      const fields = spell[3].split(",").map((field) => field.trim());
      spells.set(Number(spell[2]), {
        spellId: Number(spell[2]),
        name: spell[1],
        raceMask: fields[FIELD.raceMask] ?? "",
        cooldownMs: Number(fields[FIELD.cooldownMs]),
        categoryCooldownMs: Number(fields[FIELD.categoryCooldownMs]),
        category: Number(fields[FIELD.category]),
        durationMs: Number(fields[FIELD.durationMs]),
      });
      continue;
    }
    // Effect rows: { effect id, spell id, index, type, subtype, ... } with no string.
    const effect = /^\s*\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),/.exec(line);
    if (effect !== null && !line.includes('"')) {
      const list = effectTypes.get(Number(effect[2])) ?? [];
      list.push(Number(effect[4]));
      effectTypes.set(Number(effect[2]), list);
    }
  }
  return { spells, effectTypes };
}

/** Spell ids of racial abilities (racial_spells.inc). */
export function parseRacialSpellIds(text) {
  const ids = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*\{\s*0x[0-9a-f]+,\s*0x[0-9a-f]+,\s*(\d+),\s*"/i.exec(line);
    if (m !== null) ids.add(Number(m[1]));
  }
  return ids;
}

const hasRace = (spell) => !/^0x0+$/i.test(spell.raceMask);

/** Returns the anchor problems, or [] when every column reads as expected. */
export function anchorProblems(parsed) {
  const problems = [];
  for (const anchor of ANCHORS) {
    const spell = parsed.spells.get(anchor.spellId);
    if (spell === undefined) {
      problems.push(`anchor ${String(anchor.spellId)} ${anchor.name} is missing`);
      continue;
    }
    if (spell.name !== anchor.name)
      problems.push(`anchor ${String(anchor.spellId)} is named "${spell.name}"`);
    if (spell.category !== anchor.category) {
      problems.push(
        `anchor ${String(anchor.spellId)} reads category ${String(spell.category)}, not ${String(anchor.category)}`,
      );
    }
    if (!(parsed.effectTypes.get(anchor.spellId) ?? []).includes(anchor.effect)) {
      problems.push(`anchor ${String(anchor.spellId)} has no effect ${String(anchor.effect)}`);
    }
  }
  return problems;
}

/**
 * Classifies every spell. Returns the consumables, sorted by spell id, or
 * throws when a racial ability would be classified.
 */
export function classifyConsumables(parsed, racialIds) {
  const consumables = [];
  for (const spell of parsed.spells.values()) {
    const effects = parsed.effectTypes.get(spell.spellId) ?? [];
    let kind = null;
    if (
      /Healthstone$/.test(spell.name) &&
      (effects.includes(EFFECT_HEAL) || effects.includes(EFFECT_HEAL_PCT)) &&
      spell.category !== 0
    ) {
      kind = "HEALTHSTONE";
    } else if (spell.category === SHARED_COOLDOWN_CATEGORIES.HEALTH_POTION) {
      kind = "HEALTH_POTION";
    } else if (spell.category === SHARED_COOLDOWN_CATEGORIES.COMBAT_POTION) {
      kind = "COMBAT_POTION";
    }
    if (kind === null) continue;
    if (hasRace(spell) || racialIds.has(spell.spellId)) {
      throw new Error(`racial ability ${String(spell.spellId)} ${spell.name} would be classified ${kind}`);
    }
    consumables.push({
      spellId: spell.spellId,
      name: spell.name,
      kind,
      cooldownCategory: spell.category,
      appliesAura: effects.includes(EFFECT_APPLY_AURA),
      auraDurationMs: effects.includes(EFFECT_APPLY_AURA) && spell.durationMs > 0 ? spell.durationMs : null,
    });
  }
  return consumables.sort((a, b) => a.spellId - b.spellId);
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
  const clientDataWowVersion = parseClientDataVersion(loaded.clientDataVersion);
  if (clientDataWowVersion === null) fail("client_data_version.inc has no CLIENT_DATA_WOW_VERSION");
  const parsed = parseSpellData(loaded.spellData);
  const problems = anchorProblems(parsed);
  if (problems.length > 0) fail(`spell row columns do not read as expected:\n  ${problems.join("\n  ")}`);
  const racialIds = parseRacialSpellIds(loaded.racialSpells);
  if (racialIds.size === 0) fail("racial_spells.inc: no racial spells parsed (wrong or truncated source)");
  let consumables;
  try {
    consumables = classifyConsumables(parsed, racialIds);
  } catch (error) {
    fail(error.message);
  }
  for (const anchor of ANCHORS) {
    if (consumables.find((entry) => entry.spellId === anchor.spellId)?.kind !== anchor.kind) {
      fail(`anchor ${String(anchor.spellId)} is not classified ${anchor.kind}`);
    }
  }
  const artifact = {
    artifactVersion: 1,
    datasetId: "PREPARATION_CONSUMABLES",
    artifactRevision: `simc-${args.sha.slice(0, 8)}-${String(EXTRACTOR_VERSION)}`,
    provenance: {
      repository: REPOSITORY,
      commitSha: args.sha,
      sources,
      clientDataWowVersion,
      method: "MACHINE_EXTRACTED_SHARED_COOLDOWN_CLASSIFICATION",
      extractorVersion: EXTRACTOR_VERSION,
      rules: {
        HEALTH_POTION: `every spell on shared cooldown category ${String(SHARED_COOLDOWN_CATEGORIES.HEALTH_POTION)}, except healthstones`,
        COMBAT_POTION: `every spell on shared cooldown category ${String(SHARED_COOLDOWN_CATEGORIES.COMBAT_POTION)}`,
        HEALTHSTONE: "name ends in 'Healthstone', heals directly (effect 10 or 136), has a cooldown category",
        racialAbilities: "never classified: a race mask or a racial_spells.inc entry stops the extraction",
      },
    },
    anchors: ANCHORS.map(({ spellId, name, kind }) => ({ spellId, name, kind })),
    consumables,
  };
  const out = typeof args.out === "string" ? args.out : "src/data/game/preparation-consumables.json";
  mkdirSync(dirname(out), { recursive: true });
  const options = (await resolveConfig(out)) ?? {};
  writeFileSync(out, await format(JSON.stringify(artifact), { ...options, filepath: out }), "utf8");
  const counts = consumables.reduce(
    (acc, entry) => ({ ...acc, [entry.kind]: (acc[entry.kind] ?? 0) + 1 }),
    {},
  );
  console.log(`Wrote ${out}: ${JSON.stringify(counts)}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
