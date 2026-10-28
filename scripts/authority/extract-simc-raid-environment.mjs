#!/usr/bin/env node
/**
 * Deterministic RAID-ENVIRONMENT identity extractor (M11-G3-4).
 *
 * Emits pinned facts, nothing judged:
 *
 * 1. BLOODLUST FAMILY. The engine models every lust as its own Bloodlust
 *    buff (spell 2825, engine/sim/sim.cpp bloodlust_check_t). A logged lust
 *    spell is EQUIVALENT only when its duration and every aura-effect row
 *    (type, subtype, values, coefficients — everything but the row and spell
 *    ids) are identical to 2825 at the pin. Names are never compared.
 * 2. SATED-FAMILY debuffs the pinned data carries (lust lockouts).
 * 3. RAID-BUFF OVERRIDES: each engine `override.<name>` and the spell id the
 *    pinned engine binds it to (sim.cpp:2719-2730 player auras;
 *    player.cpp:2203 skyfury, :16437 blessing of the bronze, :4872-4888
 *    target debuffs), with the side it lives on, and the aura spell ids that
 *    show it on a player. Blessing of the Bronze is one aura per class: the
 *    engine reads `effectN( player_e )` of 364342, so every APPLY_AURA trigger
 *    row is recorded with its effect index.
 *
 * 4. DEFENSIVE ALLY AURAS (owner decision, M11-G3-4): the ally auras the
 *    environment may exclude under STANDARD_TANK_LOAD_V1, keyed by spell id.
 *    Each is recorded with every effect row (and its linked/triggered spells'
 *    rows); extraction FAILS unless every row is a defensive aura effect —
 *    damage taken (87), school absorb (69), dummy (4) or a link (285) to a
 *    spell whose rows are themselves defensive. An offensive data effect can
 *    therefore never be excluded under this rule.
 * 5. SPELL PRESENCE AUDIT: for audited spell ids, whether the pinned spell
 *    data contains them at all (an absent spell cannot be represented).
 *
 * Local pinned copies only; source SHA-256 recorded.
 *
 * Extractor v3 (M11 model registry): the client-data build is READ from the
 * commit's own client_data_version.inc (--file-clientDataVersion) instead of
 * being a literal, so a second simulation model cannot be mislabelled. v2
 * artifacts (33622e9d) are unchanged; this only affects artifacts emitted by v3.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { format, resolveConfig } from "prettier";

import { parseArgs, parseClientDataVersion, sourceHashProblem } from "./extract-simc-talents.mjs";

const ENGINE_BLOODLUST = 2825;
const LUST_CANDIDATES = [2825, 32182, 80353, 264667, 390386];
const SATED_CANDIDATES = [57723, 57724, 80354, 264689, 390435];
const DEFENSIVE_ALLY_AURAS = [465, 1246768, 41635];
/** Effect types APPLY_AURA (6) / APPLY_AREA_AURA_RAID (65); defensive subtypes. */
const AURA_EFFECT_TYPES = new Set([6, 65]);
const DEFENSIVE_SUBTYPES = new Map([
  [87, "MOD_DAMAGE_PERCENT_TAKEN"],
  [69, "SCHOOL_ABSORB"],
  [4, "DUMMY"],
  [285, "LINKED_SPELL_WITH_VALUE"],
]);
/** Spell ids audited for presence in the pinned spell data (the canonical subject's unidentified pull auras). */
const PRESENCE_AUDIT = [1285644, 1296934, 1303171, 1303184];
const OVERRIDES = [
  { override: "arcane_intellect", spellId: 1459, side: "PLAYER_AURA", citation: "sim.cpp:2719" },
  { override: "battle_shout", spellId: 6673, side: "PLAYER_AURA", citation: "sim.cpp:2723" },
  { override: "mark_of_the_wild", spellId: 1126, side: "PLAYER_AURA", citation: "sim.cpp:2727" },
  { override: "power_word_fortitude", spellId: 21562, side: "PLAYER_AURA", citation: "sim.cpp:2730" },
  { override: "skyfury", spellId: 462854, side: "PLAYER_AURA", citation: "player.cpp:2203" },
  {
    override: "blessing_of_the_bronze",
    spellId: 364342,
    side: "PLAYER_AURA",
    citation: "player.cpp:16437 (per-class trigger of 364342: effect N = class, alphabetical)",
  },
  { override: "chaos_brand", spellId: 1490, side: "TARGET_DEBUFF", citation: "player.cpp:4880" },
  { override: "mystic_touch", spellId: 113746, side: "TARGET_DEBUFF", citation: "player.cpp:4883" },
  { override: "hunters_mark", spellId: 259556, side: "TARGET_DEBUFF", citation: "player.cpp:4888" },
  { override: "mortal_wounds", spellId: 115804, side: "TARGET_DEBUFF", citation: "player.cpp:4876" },
  {
    override: "bleeding",
    spellId: null,
    side: "TARGET_DEBUFF",
    citation: "player.cpp:4872 (generic, no spell)",
  },
];

function fail(message) {
  console.error(`EXTRACTION FAILED: ${message}`);
  process.exit(1);
}

/** Spell rows: `{ "Name" , id, ...` — returns name and the raw duration field. */
export function spellRow(text, id) {
  const re = new RegExp(`^  \\{ "((?:[^"\\\\]|\\\\.)*)"\\s*,\\s*${String(id)},(.*)$`, "m");
  const m = re.exec(text);
  if (m === null) return null;
  const fields = m[2].split(",").map((part) => part.trim());
  return { name: m[1], durationMs: Number(fields[26]) };
}

/**
 * Per-class trigger spells of an aura that the engine selects by class
 * (`effectN( player_e )` — effect index = class enum - 1). Only APPLY_AURA
 * trigger rows (effect type 64) are class rows.
 */
export function classTriggers(text, id) {
  const re = new RegExp(
    `^  \{ *[0-9]+, *${String(id)}, *([0-9]+), *([0-9]+),.*?\{ [0-9, ]+\}, *([0-9]+),`,
    "gm",
  );
  return [...text.matchAll(re)]
    .filter((m) => m[2] === "64")
    .map((m) => ({ effectIndex: Number(m[1]), triggerSpellId: Number(m[3]) }));
}

/** Effect rows parsed: index, type, subtype, base value, trigger spell. */
export function effectRows(text, id) {
  const re = new RegExp(`^  \{ *[0-9]+, *${String(id)}, *([0-9]+), *([0-9]+), *([0-9]+),(.*)$`, "gm");
  return [...text.matchAll(re)].map((m) => {
    const tail = m[4];
    const trigger = /}, *([0-9]+),/.exec(tail);
    const fields = tail.split(",").map((field) => field.trim());
    return {
      effectIndex: Number(m[1]),
      type: Number(m[2]),
      subtype: Number(m[3]),
      baseValue: Number(fields[10]),
      triggerSpellId: trigger === null ? 0 : Number(trigger[1]),
    };
  });
}

/** Effect rows for one spell, with the row id and spell id removed (the semantic signature). */
export function effectSignature(text, id) {
  const re = new RegExp(`^  \\{ *[0-9]+, *${String(id)}, (.*)$`, "gm");
  return [...text.matchAll(re)].map((m) => m[1].replace(/\s+/g, " ").trim());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.sha !== "string" || !/^[0-9a-f]{40}$/.test(args.sha))
    fail("--sha must be the full pinned commit");
  if (typeof args["file-spellData"] !== "string")
    fail("pass --file-spellData (local pinned sc_spell_data.inc)");
  const buffer = readFileSync(args["file-spellData"]);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const problem = sourceHashProblem(
    "engine/dbc/generated/sc_spell_data.inc",
    args["expect-spellData-sha256"],
    sha256,
  );
  if (problem !== null) fail(problem);
  const text = buffer.toString("utf8");
  if (typeof args["file-clientDataVersion"] !== "string")
    fail("pass --file-clientDataVersion (local pinned client_data_version.inc)");
  const versionBuffer = readFileSync(args["file-clientDataVersion"]);
  const versionSha256 = createHash("sha256").update(versionBuffer).digest("hex");
  const clientDataWowVersion = parseClientDataVersion(versionBuffer.toString("utf8"));
  if (clientDataWowVersion === null) fail("client_data_version.inc has no CLIENT_DATA_WOW_VERSION");

  const engine = spellRow(text, ENGINE_BLOODLUST);
  const engineEffects = effectSignature(text, ENGINE_BLOODLUST);
  if (engine === null || engineEffects.length === 0) fail("engine Bloodlust 2825 missing from pinned data");
  const lustFamily = LUST_CANDIDATES.map((spellId) => {
    const row = spellRow(text, spellId);
    if (row === null) return { spellId, inPinnedData: false, equivalentToEngineBloodlust: false };
    const effects = effectSignature(text, spellId);
    const identical =
      row.durationMs === engine.durationMs &&
      effects.length === engineEffects.length &&
      effects.every((effect, index) => effect === engineEffects[index]);
    return {
      spellId,
      name: row.name,
      inPinnedData: true,
      durationMs: row.durationMs,
      equivalentToEngineBloodlust: identical,
    };
  });
  const satedFamily = SATED_CANDIDATES.map((spellId) => {
    const row = spellRow(text, spellId);
    return row === null
      ? { spellId, inPinnedData: false }
      : { spellId, name: row.name, inPinnedData: true, durationMs: row.durationMs };
  });
  const overrides = OVERRIDES.map((entry) => {
    if (entry.spellId === null) return { ...entry, name: null, auraSpellIds: [] };
    const row = spellRow(text, entry.spellId);
    if (row === null)
      fail(`override ${entry.override}: spell ${String(entry.spellId)} missing from pinned data`);
    if (entry.override !== "blessing_of_the_bronze")
      return { ...entry, name: row.name, auraSpellIds: [entry.spellId] };
    const triggers = classTriggers(text, entry.spellId);
    if (triggers.length === 0) fail("blessing_of_the_bronze: no class trigger rows");
    return {
      ...entry,
      name: row.name,
      auraSpellIds: [entry.spellId, ...triggers.map((t) => t.triggerSpellId)],
      classTriggers: triggers,
    };
  });

  const defensiveAllyAuras = DEFENSIVE_ALLY_AURAS.map((spellId) => {
    const row = spellRow(text, spellId);
    if (row === null) fail(`defensive ally aura ${String(spellId)} missing from pinned data`);
    const rows = [];
    const visit = (id, depth) => {
      for (const effect of effectRows(text, id)) {
        if (!AURA_EFFECT_TYPES.has(effect.type) || !DEFENSIVE_SUBTYPES.has(effect.subtype)) {
          fail(
            `${String(spellId)} (via ${String(id)}): effect #${String(effect.effectIndex)} type ${String(effect.type)} subtype ${String(effect.subtype)} is not a defensive aura effect`,
          );
        }
        rows.push({ spellId: id, ...effect, subtypeName: DEFENSIVE_SUBTYPES.get(effect.subtype) });
        if (effect.triggerSpellId > 0 && depth < 2) visit(effect.triggerSpellId, depth + 1);
      }
    };
    visit(spellId, 0);
    if (rows.length === 0) fail(`defensive ally aura ${String(spellId)} has no effect rows`);
    return { spellId, name: row.name, effects: rows };
  });
  const spellPresenceAudit = PRESENCE_AUDIT.map((spellId) => {
    const row = spellRow(text, spellId);
    return { spellId, inPinnedData: row !== null, name: row?.name ?? null };
  });
  const artifact = {
    artifactVersion: 1,
    datasetId: "SIMC_RAID_ENVIRONMENT",
    artifactRevision: `simc-${args.sha.slice(0, 8)}-2`,
    provenance: {
      repository: "https://github.com/simulationcraft/simc",
      commitSha: args.sha,
      sources: [
        { path: "engine/dbc/generated/sc_spell_data.inc", sha256, byteLength: buffer.length },
        {
          path: "engine/dbc/generated/client_data_version.inc",
          sha256: versionSha256,
          byteLength: versionBuffer.length,
        },
      ],
      clientDataWowVersion,
      method: "MACHINE_EXTRACTED_SPELL_EQUIVALENCE",
      extractorVersion: 3,
    },
    engineBloodlust: { spellId: ENGINE_BLOODLUST, durationMs: engine.durationMs },
    lustFamily,
    satedFamily,
    raidBuffOverrides: overrides,
    defensiveAllyAuras,
    spellPresenceAudit,
  };
  const out = typeof args.out === "string" ? args.out : "src/data/game/raid-environment.json";
  mkdirSync(dirname(out), { recursive: true });
  const options = (await resolveConfig(out)) ?? {};
  writeFileSync(out, await format(JSON.stringify(artifact), { ...options, filepath: out }), "utf8");
  console.log(`Wrote ${out}`);
  for (const l of lustFamily)
    console.log(
      `  lust ${String(l.spellId)} ${l.name ?? "?"} equivalent=${String(l.equivalentToEngineBloodlust)}`,
    );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
