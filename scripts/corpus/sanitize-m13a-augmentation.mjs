/**
 * M13-A: deterministic sanitization of the ONE Augmentation Evoker capture
 * (owner grant 2026-11-01, agent/autopilot-queue.md "M13-A") into committed
 * evidence-archive artifacts.
 *
 *     node scripts/corpus/sanitize-m13a-augmentation.mjs <m13a-capture-dir> <out-dir>
 *
 * It writes:
 *
 *   wcl-graphql/wcl-m13a-fight-context-aug1-fight-1.json   the production
 *       fight context: report code -> M13A_PSEUDONYM_CODE; every actor name ->
 *       Actor<id>; servers null; Player gameIDs null. Ids, types, subTypes,
 *       petOwner, non-player gameIDs, abilities, fights, phases and the
 *       subject's talentImportCode are kept.
 *   wcl-events/wcl-m13a-aug1-fight-1-support.seg-<a>-<b>.json   the three
 *       captured event streams (Casts, the three-aura Buffs filter, Deaths),
 *       each VERBATIM (events carry ids, never names), merged by timestamp.
 *       Equal timestamps keep stream order Casts, Buffs, Deaths and each
 *       stream's own order: the relative order of events from DIFFERENT
 *       streams at one millisecond is the merge's, never Warcraft Logs'. Cut
 *       at fight start + SPLIT_SECONDS into two segments (`a` exclusive, `b`
 *       inclusive, in fight seconds).
 *
 * The sanitizer refuses to write a credential shape, or the real report code,
 * or any player name or server it saw in the input. Two runs over the same
 * input write byte-identical files.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const M13A_SANITIZER_REVISION = "sanitize-m13a-augmentation-1";
export const M13A_PSEUDONYM_CODE = "M13AAUGAAAAAAAAA";
export const M13A_SPLIT_SECONDS = 75;
const FORBIDDEN = ["client_secret", "access_token", "authorization", "bearer ", "wcl_client_secret"];
const STREAM_ORDER = ["casts.json", "auras.json", "deaths.json"];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** One stream's events, pages concatenated in page order. */
function streamEvents(stream) {
  return stream.pages.flatMap((page) => page.data.reportData.report.events.data);
}

/** Stable merge by timestamp; ties keep stream order, then in-stream order. */
export function mergeStreams(streams) {
  const tagged = streams.flatMap((events, streamIndex) =>
    events.map((event, index) => ({ event, streamIndex, index })),
  );
  tagged.sort(
    (left, right) =>
      left.event.timestamp - right.event.timestamp ||
      left.streamIndex - right.streamIndex ||
      left.index - right.index,
  );
  return tagged.map((entry) => entry.event);
}

export function sanitizeContext(context) {
  const report = context.reportData.report;
  const actors = report.masterData.actors.map((actor) => ({
    ...actor,
    name: `Actor${String(actor.id)}`,
    server: null,
    gameID: actor.type === "Player" ? null : actor.gameID,
  }));
  return {
    ...context,
    reportData: {
      ...context.reportData,
      report: { ...report, code: M13A_PSEUDONYM_CODE, masterData: { ...report.masterData, actors } },
    },
  };
}

function assertClean(label, text, needles) {
  const lower = text.toLowerCase();
  for (const needle of FORBIDDEN) {
    if (lower.includes(needle)) throw new Error(`${label}: credential shape "${needle}"`);
  }
  for (const needle of needles) {
    if (needle.length >= 3 && text.includes(`"${needle}"`))
      throw new Error(`${label}: identifying string "${needle}"`);
  }
}

export function sanitizeM13a(captureDir) {
  const context = readJson(join(captureDir, "context.json"));
  const report = context.reportData.report;
  const fight = report.fights[0];
  const needles = [
    report.code,
    ...report.masterData.actors.filter((actor) => actor.type === "Player").map((actor) => actor.name),
    ...report.masterData.actors.map((actor) => actor.server).filter((server) => typeof server === "string"),
  ];
  const events = mergeStreams(STREAM_ORDER.map((name) => streamEvents(readJson(join(captureDir, name)))));
  const split = fight.startTime + M13A_SPLIT_SECONDS * 1000;
  const lastSecond = Math.ceil((fight.endTime - fight.startTime) / 1000);
  const files = new Map();
  const contextText = `${JSON.stringify(sanitizeContext(context))}\n`;
  files.set(`wcl-graphql/wcl-m13a-fight-context-aug1-fight-${String(fight.id)}.json`, contextText);
  const segments = [
    [0, M13A_SPLIT_SECONDS, events.filter((event) => event.timestamp <= split)],
    [M13A_SPLIT_SECONDS, lastSecond, events.filter((event) => event.timestamp > split)],
  ];
  for (const [from, to, slice] of segments) {
    files.set(
      `wcl-events/wcl-m13a-aug1-fight-${String(fight.id)}-support.seg-${String(from)}-${String(to)}.json`,
      `${JSON.stringify(slice)}\n`,
    );
  }
  for (const [name, text] of files) assertClean(name, text, needles);
  return { files, split, events: events.length };
}

function main() {
  const [captureDir, outDir] = process.argv.slice(2);
  if (captureDir === undefined || outDir === undefined) {
    process.stderr.write(
      "usage: node scripts/corpus/sanitize-m13a-augmentation.mjs <m13a-capture-dir> <out-dir>\n",
    );
    process.exit(2);
  }
  const { files, split, events } = sanitizeM13a(captureDir);
  for (const [name, text] of files) {
    const path = join(outDir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text, "utf8");
    process.stdout.write(`${name}\t${String(Buffer.byteLength(text))} bytes\n`);
  }
  process.stdout.write(`events ${String(events)}, split at ${String(split)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
