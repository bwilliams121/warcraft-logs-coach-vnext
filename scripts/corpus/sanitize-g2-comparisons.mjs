/**
 * M11-G2: deterministic sanitization of the three comparison-fight captures
 * (the G1-selected cohort) into committed evidence-archive artifacts.
 *
 *     node scripts/corpus/sanitize-g2-comparisons.mjs <g2-capture-dir> <g1-capture-dir> <out-dir>
 *
 * Per comparison fight it writes:
 *
 *   wcl-g2-fight-context-<cohort>-fight-<f>.json        the production fight
 *       context: report code -> the G1 COHORT pseudonym; every Player actor ->
 *       its G1 Player<nnnn> pseudonym (refused if G1 never saw it); every other
 *       actor -> Actor<id>; servers null; Player gameIDs null. Ids, petOwner,
 *       game ids of non-players, abilities, fights and phases are kept.
 *   wcl-g2-<cohort>-f<f>-owned-pets.seg-<a>-<b>.json      the E2.1 owned-pet
 *       slice (focus + WCL petOwner actors, source OR target, the 22 retained
 *       families, actorless encounter events) cut into whole-pull-second
 *       segments of at most 500,000 compact bytes, events VERBATIM (they carry
 *       ids, never names).
 *   wcl-g2-tables-<cohort>-fight-<f>.json                 the composed table
 *       response, reduced to ids, counts, totals, uptimes and bands: no names,
 *       icons, sources/targets lists, hit or miss detail breakdowns.
 *
 * Once, for all three fights:
 *
 *   wcl-g2-fight-npcs-comparisons.json                    each fight's
 *       `enemyNPCs` / `enemyPets` / `friendlyPets` (ids, gameIDs, counts,
 *       petOwner — never names), keyed by the G1 comparison identity.
 *
 * Pseudonyms come from `g1PseudonymTables` (scripts/corpus/sanitize-g1-cohort.mjs):
 * there is ONE pseudonym scheme. The sanitizer refuses to write a credential
 * shape, or any real player name, server or report code it saw in the input.
 * Two runs over the same input write byte-identical files.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { deriveOwnedPetScope, extractEvents, ownedPetSlice, serializeSlice } from "../sanitize-probe.mjs";
import { g1PseudonymTables, readG1Capture } from "./sanitize-g1-cohort.mjs";

export const G2_SANITIZER_REVISION = "sanitize-g2-comparisons-1";

/** The three G1-selected comparison fights, in G1 member order. */
export const G2_COMPARISONS = [
  {
    tag: "COHORT246AAAAAAA-33",
    realCodeIndex: 0,
    fightId: 33,
    focusActorId: 7,
    short: "cohort246",
    fileCohort: "cohort246",
  },
  {
    tag: "COHORT116AAAAAAA-64",
    realCodeIndex: 1,
    fightId: 64,
    focusActorId: 332,
    short: "cohort116",
    fileCohort: "cohort116",
  },
  {
    tag: "COHORT261AAAAAAA-31",
    realCodeIndex: 2,
    fightId: 31,
    focusActorId: 6,
    short: "cohort261",
    fileCohort: "cohort261",
  },
];

/** The E2.1 retained families and actorless families, verbatim. */
export const G2_FAMILIES = [
  "cast",
  "begincast",
  "empowerstart",
  "empowerend",
  "damage",
  "extraattacks",
  "summon",
  "applybuff",
  "applydebuff",
  "applybuffstack",
  "applydebuffstack",
  "refreshbuff",
  "refreshdebuff",
  "removebuff",
  "removedebuff",
  "removebuffstack",
  "removedebuffstack",
  "resourcechange",
  "combatantinfo",
  "encounterstart",
  "encounterend",
  "death",
];
export const G2_ACTORLESS_FAMILIES = ["encounterstart", "encounterend"];
export const G2_SEGMENT_BYTE_LIMIT = 500_000;

const FORBIDDEN = ["client_secret", "access_token", "authorization", "bearer ", "wcl_client_secret"];

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export function sanitizeG2Context(raw, pseudoCode, pseudoPlayer) {
  const { rateLimitData: _rate, ...data } = raw;
  const report = data.reportData.report;
  return {
    ...data,
    reportData: {
      ...data.reportData,
      report: {
        ...report,
        code: pseudoCode(report.code),
        masterData: {
          ...report.masterData,
          actors: report.masterData.actors.map((actor) => ({
            ...actor,
            name: actor.type === "Player" ? pseudoPlayer(actor.name) : `Actor${String(actor.id)}`,
            server: null,
            ...(actor.type === "Player" ? { gameID: null } : {}),
          })),
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const pick = (source, keys) => {
  const out = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
};

/** One table entry (ability), recursively through composite subentries. */
function sanitizeEntry(entry) {
  return {
    ...pick(entry, [
      "guid",
      "type",
      "actor",
      "actorType",
      "total",
      "uses",
      "hitCount",
      "tickCount",
      "missCount",
      "tickMissCount",
      "composite",
      "uptime",
    ]),
    ...(Array.isArray(entry.subentries) ? { subentries: entry.subentries.map(sanitizeEntry) } : {}),
  };
}

function sanitizeAbilityTable(table) {
  const data = table.data;
  return { data: { totalTime: data.totalTime, entries: data.entries.map(sanitizeEntry) } };
}

function sanitizeRaidTable(table) {
  const data = table.data;
  return {
    data: {
      totalTime: data.totalTime,
      entries: data.entries.map((entry) => ({
        ...pick(entry, ["id", "type", "total", "itemLevel", "activeTime"]),
        pets: (entry.pets ?? []).map((pet) => pick(pet, ["id", "total", "activeTime"])),
        // Per target TYPE only (Boss / NPC / ...): names are dropped, as in G1.
        targets: (entry.targets ?? []).map((target) => pick(target, ["type", "total"])),
      })),
    },
  };
}

function sanitizeDeathsTable(table) {
  return {
    data: {
      entries: table.data.entries.map((entry) => ({
        ...pick(entry, ["id", "type", "timestamp"]),
        ...(entry.killingBlow?.guid !== undefined
          ? { killingBlowAbilityGameId: entry.killingBlow.guid }
          : {}),
      })),
    },
  };
}

function sanitizeAuraTable(table) {
  return {
    data: {
      totalTime: table.data.totalTime,
      auras: table.data.auras.map((aura) => ({
        ...pick(aura, ["guid", "type", "totalUses", "totalUptime"]),
        bands: (aura.bands ?? []).map((band) => pick(band, ["startTime", "endTime"])),
      })),
    },
  };
}

/**
 * The bounds of each window table, read from the recorded query document
 * (`window<k>_<actor>: table(..., startTime: a, endTime: b, sourceID: actor)`):
 * the response does not echo them. One entry per window, ascending.
 */
export function windowBoundsOf(queryDocument) {
  const bounds = new Map();
  for (const match of queryDocument.matchAll(
    /(window\d+)_\d+: table\(dataType: DamageDone, fightIDs: \$fightIDs, startTime: (\d+), endTime: (\d+), sourceID: \d+\)/g,
  )) {
    const entry = { window: match[1], fromMs: Number(match[2]), toMs: Number(match[3]) };
    const seen = bounds.get(entry.window);
    if (seen !== undefined && (seen.fromMs !== entry.fromMs || seen.toMs !== entry.toMs)) {
      throw new Error(`${entry.window} has two different bounds`);
    }
    bounds.set(entry.window, entry);
  }
  return [...bounds.values()].sort((a, b) => Number(a.window.slice(6)) - Number(b.window.slice(6)));
}

export function sanitizeG2Tables(raw, pseudoCode, queryDocument) {
  const report = raw.reportData.report;
  const out = {
    code: pseudoCode(report.code),
    revision: report.revision,
    windowBounds: windowBoundsOf(queryDocument),
  };
  for (const key of Object.keys(report).sort()) {
    if (key === "code" || key === "revision" || key === "windowBounds") continue;
    const table = report[key];
    if (key === "raidDamageDone") out[key] = sanitizeRaidTable(table);
    else if (key === "deaths") out[key] = sanitizeDeathsTable(table);
    else if (key === "buffs" || key === "debuffs") out[key] = sanitizeAuraTable(table);
    else if (/^(casts|damageDone|damageTaken)_\d+$/.test(key) || /^window\d+_\d+$/.test(key))
      out[key] = sanitizeAbilityTable(table);
    else throw new Error(`unexpected table alias ${key}`);
  }
  return { reportData: { report: out } };
}

// ---------------------------------------------------------------------------
// Segments (the E2.1 method)
// ---------------------------------------------------------------------------

/** Greedy whole-pull-second segments (from, to], each at most `limit` compact bytes. */
export function planSegments(retained, startMs, endMs, limit = G2_SEGMENT_BYTE_LIMIT) {
  const bytesOf = (from, to) =>
    Buffer.byteLength(
      serializeSlice(
        retained.filter((e) => e.timestamp > from && e.timestamp <= to),
        true,
      ),
    );
  const segments = [];
  let from = startMs - 1;
  while (from < endMs) {
    let best = null;
    for (let second = 1; ; second += 1) {
      const to = Math.min(startMs + second * 1000, endMs);
      if (to <= from) continue;
      if (bytesOf(from, to) > limit) break;
      best = to;
      if (to === endMs) break;
    }
    if (best === null) throw new Error(`no whole-second segment fits after ${String(from)}`);
    segments.push({ from, to: best });
    from = best;
  }
  return segments;
}

/** Pull-relative whole seconds of a segment bound, for the artifact name. */
const second = (ms, startMs) => Math.round((ms - (startMs - 1)) / 1000);

export function sliceG2Events(pages, sanitizedContext, focusActorId) {
  const events = extractEvents(pages);
  const scope = deriveOwnedPetScope(sanitizedContext, focusActorId);
  if (!scope.ok) throw new Error(scope.error);
  const retained = ownedPetSlice(events, scope.actorScope, {
    families: G2_FAMILIES,
    actorlessFamilies: G2_ACTORLESS_FAMILIES,
  });
  return { events, scope, retained };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

function assertClean(label, text, needles) {
  const lowered = text.toLowerCase();
  const credential = FORBIDDEN.find((needle) => lowered.includes(needle));
  if (credential !== undefined)
    throw new Error(`refusing to write ${label}: credential-shaped value (${credential})`);
  for (const name of needles.players) {
    if (name.length > 2 && text.includes(JSON.stringify(name))) {
      throw new Error(`refusing to write ${label}: a real player name survived`);
    }
  }
  for (const server of needles.servers) {
    if (text.includes(JSON.stringify(server)))
      throw new Error(`refusing to write ${label}: a real server survived`);
  }
  for (const code of needles.codes) {
    if (text.includes(code)) throw new Error(`refusing to write ${label}: a real report code survived`);
  }
  for (const gameId of needles.playerGameIds) {
    if (new RegExp(`[^0-9]${gameId}[^0-9]`).test(text)) {
      throw new Error(`refusing to write ${label}: a player gameID survived`);
    }
  }
}

/** Every output file, keyed by artifact id, as the exact bytes to write. */
const NPC_KEYS = ["id", "gameID", "instanceCount", "groupCount", "petOwner"];
const NPC_ALIASES = {
  "COHORT246AAAAAAA-33": "c33",
  "COHORT116AAAAAAA-64": "c64",
  "COHORT261AAAAAAA-31": "c31",
};

export function sanitizeG2FightNpcs(raw) {
  return {
    comparisons: G2_COMPARISONS.map((comparison) => {
      const fight = raw[NPC_ALIASES[comparison.tag]].report.fights[0];
      if (fight.id !== comparison.fightId)
        throw new Error(`${comparison.tag}: fight-npcs holds fight ${String(fight.id)}`);
      const list = (key) => fight[key].map((npc) => pick(npc, NPC_KEYS));
      return {
        comparisonRef: comparison.tag.replace("-", "#"),
        fight: {
          id: fight.id,
          enemyNPCs: list("enemyNPCs"),
          enemyPets: list("enemyPets"),
          friendlyPets: list("friendlyPets"),
        },
      };
    }),
  };
}

export function sanitizeG2(g2Dir, g1Capture) {
  const { players, codes } = g1PseudonymTables(g1Capture);
  const files = new Map();
  const needles = { players: new Set(), servers: new Set(), codes: new Set(), playerGameIds: new Set() };
  const segmentsReport = {};
  for (const comparison of G2_COMPARISONS) {
    const read = (suffix) => JSON.parse(readFileSync(join(g2Dir, `${comparison.tag}-${suffix}`), "utf8"));
    const rawContext = read("context.json");
    const realCode = rawContext.reportData.report.code;
    needles.codes.add(realCode);
    for (const actor of rawContext.reportData.report.masterData.actors) {
      if (actor.type === "Player") {
        needles.players.add(actor.name);
        if (typeof actor.gameID === "number" && actor.gameID > 0)
          needles.playerGameIds.add(String(actor.gameID));
      }
      if (typeof actor.server === "string" && actor.server.length > 0) needles.servers.add(actor.server);
    }
    const pseudoCode = (code) => {
      const mapped = codes.get(code);
      if (mapped === undefined) throw new Error(`report ${comparison.tag} was not in the G1 pseudonym table`);
      return mapped;
    };
    const pseudoPlayer = (name) => {
      const mapped = players.get(name);
      if (mapped === undefined)
        throw new Error(`a player of ${comparison.tag} was not in the G1 pseudonym table`);
      return mapped;
    };
    if (`${pseudoCode(realCode)}-${String(comparison.fightId)}` !== comparison.tag) {
      throw new Error(`${comparison.tag}: the G1 pseudonym of its report does not match`);
    }

    const context = sanitizeG2Context(rawContext, pseudoCode, pseudoPlayer);
    const contextId = `wcl-g2-fight-context-${comparison.fileCohort}-fight-${String(comparison.fightId)}`;
    files.set(contextId, `${JSON.stringify(context)}\n`);

    const tables = sanitizeG2Tables(read("tables.json"), pseudoCode, read("tables-query.graphql.json").query);
    files.set(
      `wcl-g2-tables-${comparison.fileCohort}-fight-${String(comparison.fightId)}`,
      `${JSON.stringify(tables)}\n`,
    );

    const fight = context.reportData.report.fights.find((entry) => entry.id === comparison.fightId);
    const pages = read("pages.json");
    const { events, scope, retained } = sliceG2Events(pages, context, comparison.focusActorId);
    const plan = planSegments(retained, fight.startTime, fight.endTime);
    const segments = [];
    for (const segment of plan) {
      const kept = retained.filter(
        (event) => event.timestamp > segment.from && event.timestamp <= segment.to,
      );
      const id = `wcl-g2-${comparison.fileCohort}-f${String(comparison.fightId)}-owned-pets.seg-${String(second(segment.from, fight.startTime))}-${String(second(segment.to, fight.startTime))}`;
      files.set(id, serializeSlice(kept, true));
      segments.push({ id, from: segment.from, to: segment.to, events: kept.length });
    }
    segmentsReport[comparison.tag] = {
      fightStartMs: fight.startTime,
      fightEndMs: fight.endTime,
      capturedEvents: events.length,
      retainedEvents: retained.length,
      actorScope: scope.actorScope,
      ownedActorIds: scope.ownedActorIds,
      contextId,
      segments,
    };
  }
  files.set(
    "wcl-g2-fight-npcs-comparisons",
    `${JSON.stringify(sanitizeG2FightNpcs(JSON.parse(readFileSync(join(g2Dir, "fight-npcs.json"), "utf8"))))}
`,
  );
  const needleLists = {
    players: [...needles.players],
    servers: [...needles.servers],
    codes: [...needles.codes],
    playerGameIds: [...needles.playerGameIds],
  };
  for (const [id, text] of files) assertClean(id, text, needleLists);
  return { files, segmentsReport };
}

function main() {
  const [g2Dir, g1Dir, outDir] = process.argv.slice(2);
  if (g2Dir === undefined || g1Dir === undefined || outDir === undefined) {
    console.error(
      "usage: node scripts/corpus/sanitize-g2-comparisons.mjs <g2-capture-dir> <g1-capture-dir> <out-dir>",
    );
    process.exit(1);
  }
  const { files, segmentsReport } = sanitizeG2(g2Dir, readG1Capture(g1Dir));
  mkdirSync(outDir, { recursive: true });
  for (const [id, text] of files) {
    writeFileSync(join(outDir, `${id}.json`), text, "utf8");
    console.log(`wrote ${id}.json (${String(Buffer.byteLength(text))} bytes) with ${G2_SANITIZER_REVISION}`);
  }
  writeFileSync(join(outDir, "segments-report.json"), `${JSON.stringify(segmentsReport, null, 1)}\n`, "utf8");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
