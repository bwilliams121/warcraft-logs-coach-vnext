/**
 * M13-D: deterministic sanitization of the ONE certification table request
 * (owner grant 2026-11-02, agent/autopilot-queue.md "M13-D") into a committed
 * evidence-archive artifact.
 *
 *     node scripts/corpus/sanitize-m13d-tables.mjs <m13d-dir> <m13a-dir> <out-dir>
 *
 * It writes wcl-graphql/wcl-m13d-certification-tables-aug1-fight-1.json, the
 * shape `src/wcl/filtered-capture-tables.ts` decodes:
 *
 *   reportData.report.code            -> M13AAUGAAAAAAAAA (the M13-A pseudonym)
 *   reportData.report.revision        verbatim
 *   reportData.report.fights          verbatim ({ id, startTime, endTime })
 *   reportData.report.tableArguments  each table's request arguments, PARSED
 *                                     from the recorded query document (the
 *                                     Casts surface does not echo its interval)
 *   reportData.report.buffs_<id>      startTime, endTime, totalTime; per target
 *                                     aura: id, type, totalUses, totalUptime,
 *                                     bands. Names, icons and the per-target
 *                                     guid (a stable character id) dropped.
 *   reportData.report.casts_<id>      totalTime; per entry (subentries kept):
 *                                     guid, type, actor, total, hit/tick/miss/
 *                                     tickMiss counts, composite. Names, icons,
 *                                     source lists and detail breakdowns dropped.
 *
 * rateLimitData is dropped. It refuses to write a credential shape, the real
 * report code, or any player name or server it saw in the M13-A context. Two
 * runs over the same input write byte-identical files.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const M13D_SANITIZER_REVISION = "sanitize-m13d-tables-1";
const PSEUDONYM_CODE = "M13AAUGAAAAAAAAA";
const OUT_NAME = "wcl-graphql/wcl-m13d-certification-tables-aug1-fight-1.json";
const FORBIDDEN = ["client_secret", "access_token", "authorization", "bearer ", "wcl_client_secret"];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const pick = (entry, keys) =>
  Object.fromEntries(keys.filter((key) => key in entry).map((key) => [key, entry[key]]));

/** `alias: table(dataType: X, fightIDs: $fightIDs, startTime: a, endTime: b, hostilityType: H, abilityID|sourceID: n)`. */
export function tableArgumentsOf(queryDocument) {
  const out = {};
  const pattern =
    /(\w+): table\(dataType: (Buffs|Casts), fightIDs: \$fightIDs, startTime: (\d+), endTime: (\d+), hostilityType: (Friendlies), (abilityID|sourceID): (\d+)\)/g;
  for (const match of queryDocument.matchAll(pattern)) {
    const [, alias, dataType, start, end, hostilityType, key, id] = match;
    if (alias in out) throw new Error(`alias ${alias} requested twice`);
    out[alias] = {
      dataType,
      startTime: Number(start),
      endTime: Number(end),
      hostilityType,
      abilityID: key === "abilityID" ? Number(id) : null,
      sourceID: key === "sourceID" ? Number(id) : null,
    };
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function sanitizeCastEntry(entry) {
  return {
    ...pick(entry, [
      "guid",
      "type",
      "actor",
      "total",
      "hitCount",
      "tickCount",
      "missCount",
      "tickMissCount",
      "composite",
    ]),
    ...(Array.isArray(entry.subentries) ? { subentries: entry.subentries.map(sanitizeCastEntry) } : {}),
  };
}

function sanitizeBuffs(table) {
  const data = table.data;
  return {
    data: {
      startTime: data.startTime,
      endTime: data.endTime,
      totalTime: data.totalTime,
      auras: data.auras.map((aura) => ({
        ...pick(aura, ["id", "type", "totalUses", "totalUptime"]),
        bands: aura.bands.map((band) => pick(band, ["startTime", "endTime"])),
      })),
    },
  };
}

export function sanitizeM13d(m13dDir, m13aDir) {
  const raw = readJson(join(m13dDir, "tables-T1.json"));
  const queryDocument = readFileSync(join(m13dDir, "query-T1.graphql"), "utf8");
  const context = readJson(join(m13aDir, "context.json")).reportData.report;
  const summary = readJson(join(m13aDir, "summary.json"));
  const needles = [
    summary.code,
    ...context.masterData.actors.filter((actor) => actor.type === "Player").map((actor) => actor.name),
    ...context.masterData.actors.map((actor) => actor.server).filter((server) => typeof server === "string"),
  ];
  const report = raw.reportData.report;
  const tableArguments = tableArgumentsOf(queryDocument);
  const out = {
    code: PSEUDONYM_CODE,
    revision: report.revision,
    fights: report.fights.map((fight) => pick(fight, ["id", "startTime", "endTime"])),
    tableArguments,
  };
  for (const key of Object.keys(report).sort()) {
    if (key === "revision" || key === "fights") continue;
    if (!(key in tableArguments)) throw new Error(`table ${key} has no recorded arguments`);
    if (/^buffs_\d+$/.test(key)) out[key] = sanitizeBuffs(report[key]);
    else if (/^casts_\d+$/.test(key))
      out[key] = {
        data: {
          totalTime: report[key].data.totalTime,
          entries: report[key].data.entries.map(sanitizeCastEntry),
        },
      };
    else throw new Error(`unexpected field ${key}`);
  }
  const text = `${JSON.stringify({ reportData: { report: out } })}\n`;
  const lower = text.toLowerCase();
  for (const needle of FORBIDDEN) if (lower.includes(needle)) throw new Error(`credential shape "${needle}"`);
  for (const needle of needles) {
    if (needle.length >= 3 && text.includes(needle)) throw new Error(`identifying string "${needle}"`);
  }
  return new Map([[OUT_NAME, text]]);
}

function main() {
  const [m13dDir, m13aDir, outDir] = process.argv.slice(2);
  if (m13dDir === undefined || m13aDir === undefined || outDir === undefined) {
    process.stderr.write(
      "usage: node scripts/corpus/sanitize-m13d-tables.mjs <m13d-dir> <m13a-dir> <out-dir>\n",
    );
    process.exit(2);
  }
  for (const [name, text] of sanitizeM13d(m13dDir, m13aDir)) {
    const path = join(outDir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text, "utf8");
    process.stdout.write(`${name}\t${String(Buffer.byteLength(text))} bytes\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
