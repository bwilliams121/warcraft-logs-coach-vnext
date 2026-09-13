#!/usr/bin/env node
/**
 * Deterministic SimulationCraft ability-cooldown extractor.
 *
 * Reads the generated spell table from ONE pinned SimulationCraft commit and
 * emits the narrow slice M5-C3c1 needs. Run manually; never at runtime.
 *
 * WHY THIS EXISTS
 *
 * The pinned `cds[0]` condition asks `cooldown.kingsbane.remains<=2`. Answering
 * it needs the ability's base cooldown, which is a game fact and so belongs in
 * runtime data with provenance rather than in a comment or model memory.
 *
 * TWO KINDS OF PROVENANCE, DELIBERATELY KEPT APART
 *
 * This artifact carries facts of two different epistemic grades, and conflating
 * them would be the whole failure:
 *
 *   MACHINE_EXTRACTED_DBC_RECORD   base cooldown, charges, GCD, name.
 *                                  Parsed from a hashed generated table. A
 *                                  future re-run reproduces them byte for byte.
 *
 *   HAND_REVIEWED_CPP_ABSENCE_PROOF   "nothing modifies this cooldown". That is
 *                                  a claim about the ABSENCE of code across a
 *                                  436 KB C++ module. No parser establishes it.
 *                                  A human read the module and recorded what
 *                                  they checked, against a measured file hash.
 *
 * An absence proof is the weaker of the two and is labelled as such. It is also
 * the one that silently rots: a future commit adding a Kingsbane cooldown reset
 * changes no DBC row, so only the recorded hash catches it. That is why the
 * hash travels with the claim and why the loader refuses a policy whose hash no
 * longer matches the module it was reviewed against.
 *
 * WHAT A BASE COOLDOWN IS NOT
 *
 * It is not haste-scaled, not charge-aware beyond the recorded charge count,
 * and not reduced by anything. A consumer needing any of those must model it;
 * this artifact supplies the base fact so that a missing model presents as a
 * missing model.
 *
 *   node scripts/authority/extract-simc-cooldowns.mjs \
 *     --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
 *     --out src/data/game/rogue-cooldowns.json
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const REPOSITORY = "https://github.com/simulationcraft/simc";
const EXTRACTOR_VERSION = 1;
const ARTIFACT_VERSION = 1;
const DATASET_ID = "SIMC_DBC_ROGUE_ABILITY_COOLDOWNS";

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
 * The cooldowns M5-C3c1 requires.
 *
 * ONE entry. Entries appear when a supported decision needs them, never
 * speculatively — the same rule the ability, talent and DoT-duration datasets
 * follow. `cds[0]` is the only line that reads a cooldown this milestone
 * answers, and it reads exactly one.
 *
 * Kingsbane is a TALENT spell, so the binding runs through the trait table's
 * spell rather than a class or specialization spell. `talentSpellId` is checked
 * against the DBC row and against the pinned `init_spells` line below.
 */
const REQUIRED_COOLDOWNS = [
  {
    simcToken: "kingsbane",
    displayNameEn: "Kingsbane",
    abilityGameId: 385_627,
    createAction:
      'sc_rogue.cpp:9480 if ( name == "kingsbane" ) return new kingsbane_t( name, this, options_str )',
    specBinding:
      'sc_rogue.cpp:10045 talent.assassination.kingsbane = find_talent_spell( talent_tree::SPECIALIZATION, "Kingsbane" )',
  },
];

/**
 * The hand-reviewed absence proof, recorded check by check.
 *
 * Each entry is something a human looked for and did not find, with the search
 * that was performed. Listing the SEARCH rather than only the conclusion is the
 * point: a reviewer can repeat it, and a reader can see exactly how wide the
 * claim is.
 *
 * `appliesTo` names the cooldown the claim is about. A claim recorded here is
 * NOT a claim about any other ability.
 */
const MODIFIER_POLICY_CHECKS = [
  {
    claim: "NO_DIRECT_COOLDOWN_ADJUSTMENT",
    search: "grep 'cooldowns.kingsbane' and 'cooldowns.kingsbane->' in engine/class_modules/sc_rogue.cpp",
    finding:
      "Exactly ONE occurrence of 'cooldowns.kingsbane' (line 1169, the assignment in the constructor) and " +
      "ZERO occurrences of 'cooldowns.kingsbane->'. The member declaration at line 475 reads " +
      "'cooldown_t* kingsbane;' inside the cooldowns_t struct and so does not contain the qualified name. " +
      "Every mutation — adjust(), reset(), duration assignment, charge change — would have to go through " +
      "the arrow form, and none exists.",
  },
  {
    claim: "NO_CHARGES",
    search: "spell_data.inc row for 385627, _charges column",
    finding: "_charges is 0, so there is no charge system and no recharge behaviour to model.",
  },
  {
    claim: "NO_ROGUE_WIDE_CDR_APPLIES",
    search: "grep for the rogue module's bulk cooldown-adjustment sites",
    finding:
      "Restless Blades (sc_rogue.cpp:8246-8254) adjusts nine Outlaw cooldowns and does not include " +
      "kingsbane. Deadly Pursuit (sc_rogue.cpp:10826-10832) calls adjust_recharge_multiplier over " +
      "deadly_pursuit_cooldowns and is gated on talent.outlaw.deadly_pursuit. Both are Outlaw-only; " +
      "the analysed specialization is Assassination.",
  },
  {
    claim: "NO_RECHARGE_MULTIPLIER_CHANGE",
    search: "action_t base_recharge_multiplier / dynamic_recharge_multiplier initialisation",
    finding:
      "Both initialise to 1.0 (action.cpp:456,458) and the only rogue-module call to " +
      "adjust_recharge_multiplier is the Outlaw Deadly Pursuit site above.",
  },
  {
    claim: "NO_ACTION_LEVEL_COOLDOWN_OVERRIDE",
    search: "kingsbane_t body (sc_rogue.cpp:4783-4910) for update_ready / cooldown overrides",
    finding:
      "kingsbane_t declares neither. The base rogue_action_t::update_ready (line 2287) zeroes the " +
      "cooldown only when secondary_trigger_type != NONE, which is false for a player-cast action.",
  },
];

/**
 * Where a cooldown begins, and the pinned lines that establish it.
 *
 * Recorded in the artifact because the derivation is worthless without it: a
 * remaining duration measured from the wrong instant is still a number.
 */
const COOLDOWN_START_CONTRACT = {
  anchor: "ACTION_EXECUTE",
  evidence: [
    "action.cpp:1914 action_t::execute() calls update_ready()",
    "action.cpp:2360 action_t::update_ready() calls cooldown->start( this, cd_duration, delay )",
    "action.cpp:2342-2358 the only start-time adjustment is a non-negative world-lag delay, which can " +
      "only move the ready time LATER, never earlier",
  ],
  note:
    "For an instant, non-channelled ability, execution coincides with the observed cast. A cast with a " +
    "cast time or a channel would need its own anchor and is not covered by this contract.",
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

export function sourceHashProblem(path, expectedSha256, actualSha256) {
  if (typeof expectedSha256 !== "string") return null;
  if (expectedSha256 === actualSha256) return null;
  return `${path} SHA-256 mismatch\n  expected ${expectedSha256}\n  actual   ${actualSha256}`;
}

/** Reads the build stamp. Every field is required; a partial stamp is an error. */
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
 * Same rules as the DoT-duration extractor: start at the DEFINITION rather than
 * the forward declaration, strip trailing comments before testing for a method,
 * and stop at the first ARRAY member.
 */
export function deriveScalarFieldIndices(headerText, wantedNames) {
  const lines = headerText.split(/\r?\n/);

  let bodyStart = -1;
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i]?.trim() !== "struct spell_data_t") continue;
    if (lines[i + 1]?.trim() === "{") {
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
 * Reads a non-negative integer column.
 *
 * Cooldowns and charge counts are counts, not sentinels: unlike `_duration`
 * there is no negative form to carry through, so a negative value here is a
 * parse problem rather than a fact and is refused.
 */
export function readCountColumn(raw, fieldName, abilityGameId) {
  if (raw === undefined || !/^\d+(?:\.\d+)?$/.test(raw)) {
    return { ok: false, error: `spell ${abilityGameId} has no readable ${fieldName} (saw '${String(raw)}')` };
  }
  const value = Number.parseFloat(raw);
  if (!Number.isInteger(value)) {
    return {
      ok: false,
      error: `spell ${abilityGameId} has a fractional ${fieldName} of ${raw}, which this extractor will not round`,
    };
  }
  return { ok: true, value };
}

/** Extracts the cooldown-relevant columns for each wanted id. */
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
      const read = readCountColumn(flat[index], fieldName, abilityGameId);
      if (!read.ok) return read;
      columns[fieldName] = read.value;
    }

    const record = {
      abilityGameId,
      displayNameEn: name.value,
      baseCooldownMs: columns._cooldown,
      charges: columns._charges,
      chargeCooldownMs: columns._charge_cooldown,
      categoryCooldownMs: columns._category_cooldown,
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

/** Checks every required fact. An empty list is the only thing that licenses writing. */
export function verifyRequiredFacts({ build, records, fieldIndices, expectedFieldIndices, rogueModuleText }) {
  const problems = [];

  for (const [fieldName, expected] of Object.entries(expectedFieldIndices)) {
    const actual = fieldIndices[fieldName];
    if (actual !== expected) {
      problems.push(
        `${fieldName} is at flat field index ${String(actual)} in the pinned spell_data.hpp, but this parser was ` +
          `written against index ${String(expected)}. The struct layout moved; re-verify every value first.`,
      );
    }
  }

  for (const required of REQUIRED_COOLDOWNS) {
    const record = records.get(required.abilityGameId);
    if (record === undefined) {
      problems.push(
        `spell ${String(required.abilityGameId)} (${required.displayNameEn}) is absent from the table`,
      );
      continue;
    }
    if (record.displayNameEn !== required.displayNameEn) {
      problems.push(
        `spell ${String(required.abilityGameId)} is named '${record.displayNameEn}', expected '${required.displayNameEn}'`,
      );
    }
    // A cooldown of zero cannot anchor a remaining-duration derivation, and
    // would make `cooldown.x.remains` meaningless rather than merely unknown.
    if (!(record.baseCooldownMs > 0)) {
      problems.push(
        `spell ${String(required.abilityGameId)} has _cooldown ${String(record.baseCooldownMs)}ms, which cannot ` +
          "anchor a remaining-cooldown derivation",
      );
    }
    // The absence proof recorded below is written for a chargeless cooldown. If
    // charges ever appear, the proof no longer describes the ability.
    if (record.charges !== 0) {
      problems.push(
        `spell ${String(required.abilityGameId)} now has ${String(record.charges)} charges; the recorded ` +
          "modifier policy was reviewed for a chargeless cooldown and must be re-reviewed",
      );
    }
  }

  // The absence proof is re-checked mechanically here, so a pinned-source change
  // that invalidates it fails the extraction rather than silently ageing.
  //
  // The decisive form is the ARROW: every mutation of a cooldown object is
  // written `cooldowns.kingsbane->something(...)`. Counting bare occurrences
  // would also match the harmless constructor assignment, so both are checked.
  for (const required of REQUIRED_COOLDOWNS) {
    const qualified = `cooldowns.${required.simcToken}`;
    const bare = rogueModuleText.split(qualified).length - 1;
    const mutations = rogueModuleText.split(`${qualified}->`).length - 1;
    if (bare !== 1) {
      problems.push(
        `sc_rogue.cpp mentions '${qualified}' ${String(bare)} times, expected exactly 1 (the constructor ` +
          "assignment). The recorded absence proof was written against a single occurrence and is now stale.",
      );
    }
    if (mutations !== 0) {
      problems.push(
        `sc_rogue.cpp contains ${String(mutations)} '${qualified}->' call(s). Something now mutates this ` +
          "cooldown, so the recorded absence proof is false and the cooldown can no longer be derived from " +
          "a base duration alone.",
      );
    }
  }

  if (build.hotfixBuild <= 0) problems.push("client_data_version.inc reports a non-positive hotfix build");

  return problems;
}

/**
 * Serialises the artifact the way Prettier would, so the generated file passes
 * `prettier --check` without a manual reformat.
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
export function buildArtifact({ commitSha, sources, build, records, extractedOn }) {
  const rogueModuleSource = sources.find((source) => source.path === SOURCES.rogueModule);
  if (rogueModuleSource === undefined) {
    throw new Error(`cannot record the modifier policy without a measured hash of ${SOURCES.rogueModule}`);
  }

  const cooldowns = REQUIRED_COOLDOWNS.map((required) => {
    const record = records.get(required.abilityGameId);
    if (record === undefined)
      throw new Error(`spell ${String(required.abilityGameId)} has no record to emit`);
    return {
      simcToken: required.simcToken,
      abilityGameId: record.abilityGameId,
      displayNameEn: record.displayNameEn,
      baseCooldownMs: record.baseCooldownMs,
      charges: record.charges,
      chargeCooldownMs: record.chargeCooldownMs,
      categoryCooldownMs: record.categoryCooldownMs,
      baseGcdMs: record.baseGcdMs,
      classId: ROGUE_CLASS_ID,
      specId: ASSASSINATION_SPEC_ID,
      binding: {
        method: "MACHINE_EXTRACTED_DBC_RECORD",
        sourcePath: SOURCES.spellData,
        createAction: required.createAction,
        specBinding: required.specBinding,
      },
      // The weaker claim, labelled as such and hashed against the module it was
      // read from. See the module header.
      modifierPolicy: {
        method: "HAND_REVIEWED_CPP_ABSENCE_PROOF",
        appliesTo: required.simcToken,
        sourcePath: SOURCES.rogueModule,
        sourceSha256: rogueModuleSource.sha256,
        reviewedOn: extractedOn,
        checks: MODIFIER_POLICY_CHECKS,
      },
      cooldownStart: COOLDOWN_START_CONTRACT,
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
      clientDataWowVersion: build.wowVersion,
      clientDataHotfixDate: build.hotfixDate,
      clientDataHotfixBuild: build.hotfixBuild,
      clientDataHotfixHash: build.hotfixHash,
      cooldownFieldName: "_cooldown",
      cooldownFieldUnits: "MILLISECONDS",
      extractedOn,
      extractorVersion: EXTRACTOR_VERSION,
      applicabilityNote:
        "Not version-gated at runtime, for the same reason as the GCD and DoT-duration artifacts: CombatFight " +
        "exposes no client-build key, so comparing anything against a recorded build would be a gate that always " +
        "passes while appearing rigorous. The build is recorded for traceability.",
    },
    cooldowns,
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

const EXPECTED_FIELD_INDICES = {
  _cooldown: 15,
  _gcd: 16,
  _category_cooldown: 17,
  _charges: 19,
  _charge_cooldown: 20,
};

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

  const layout = deriveScalarFieldIndices(loaded.spellDataLayout, Object.keys(EXPECTED_FIELD_INDICES));
  if (!layout.ok) fail(layout.error);

  const wantedIds = REQUIRED_COOLDOWNS.map((entry) => entry.abilityGameId);
  const parsed = parseSpellRecords(loaded.spellData, wantedIds, layout.indices);
  if (!parsed.ok) fail(parsed.error);

  const problems = verifyRequiredFacts({
    build: build.value,
    records: parsed.records,
    fieldIndices: layout.indices,
    expectedFieldIndices: EXPECTED_FIELD_INDICES,
    rogueModuleText: loaded.rogueModule,
  });
  if (problems.length > 0) fail(`\n  - ${problems.join("\n  - ")}`);

  const artifact = buildArtifact({
    commitSha: typeof args.sha === "string" ? args.sha : "UNKNOWN",
    sources,
    build: build.value,
    records: parsed.records,
    extractedOn: new Date().toISOString().slice(0, 10),
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, formatArtifactJson(artifact), "utf8");

  console.log(`Wrote ${outPath}`);
  console.log(`  rows scanned  ${String(parsed.rowsScanned)}`);
  console.log(`  field indices ${JSON.stringify(layout.indices)} (derived from spell_data.hpp)`);
  for (const entry of artifact.cooldowns) {
    console.log(
      `  ${entry.simcToken} -> ${String(entry.abilityGameId)} cooldown ${String(entry.baseCooldownMs)}ms ` +
        `charges ${String(entry.charges)}`,
    );
  }
  console.log(`  NOTE: the modifier policy is HAND REVIEWED against ${SOURCES.rogueModule}, not parsed.`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
