/**
 * Sanitizes decoded GraphQL payloads from `.probe/` into corpus artifacts.
 *
 * `scripts/sanitize-probe.mjs` slices EVENT arrays. This handles the other
 * payload shapes the corpus holds — page envelopes, a fight context with master
 * data, a ranking page — where sanitization is redaction and remapping rather
 * than selection. Each mode is one documented, deterministic transformation so
 * a manifest entry can name it verbatim:
 *
 *     node scripts/corpus/sanitize-payloads.mjs pages     <in.json> <out-path>
 *     node scripts/corpus/sanitize-payloads.mjs context   <in.json> <out-path>
 *     node scripts/corpus/sanitize-payloads.mjs rankings  <in.json> <out-path> <data-key>
 *
 *   pages     an array of decoded `data` objects (one per page): `rateLimitData`
 *             is removed from each; events and cursors are untouched.
 *   context   a decoded fight-context `data`: `rateLimitData` removed; every
 *             `masterData.actors[].name` becomes `Actor<id>`, every `server`
 *             becomes null, and every PLAYER's `gameID` becomes null — it is a
 *             stable character identifier, and no case reads it. Report-local
 *             actor ids, types, subTypes and petOwner links are untouched, as
 *             are NPC and pet `gameID`s (creature taxonomy the cases pin) and
 *             the typed fight fields. Revision 2 added the gameID rule.
 *   rankings  a probe result object holding a `worldData.encounter.characterRankings`
 *             page under `<data-key>`: every row's `name` becomes `Candidate<n>`
 *             (n = 1-based row position), `server` becomes null, `guild` is
 *             removed, and every `report.code` is remapped to a deterministic
 *             16-character code that preserves equality between rows. Every
 *             other row field is untouched, `hidden` included.
 *
 * Refuses to write output containing a credential-shaped value. Never writes
 * a real player name, server, guild or third-party report code.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

export const SANITIZE_PAYLOADS_REVISION = "sanitize-payloads-2";

const FORBIDDEN = ["client_secret", "access_token", "authorization", "bearer ", "wcl_client_secret"];

function stripRateLimit(data) {
  if (typeof data !== "object" || data === null) return data;
  const { rateLimitData: _dropped, ...rest } = data;
  return rest;
}

export function sanitizePages(pages) {
  if (!Array.isArray(pages)) throw new Error("pages mode expects a JSON array of decoded data objects");
  return pages.map(stripRateLimit);
}

export function sanitizeContext(data) {
  const stripped = stripRateLimit(data);
  const report = stripped?.reportData?.report;
  const actors = report?.masterData?.actors;
  if (!Array.isArray(actors)) throw new Error("context mode expects reportData.report.masterData.actors");
  return {
    ...stripped,
    reportData: {
      ...stripped.reportData,
      report: {
        ...report,
        masterData: {
          ...report.masterData,
          actors: actors.map((actor) => ({
            ...actor,
            name: `Actor${String(actor.id)}`,
            server: null,
            ...(actor.type === "Player" ? { gameID: null } : {}),
          })),
        },
      },
    },
  };
}

/** A deterministic 16-character report code for the n-th distinct real code. */
function remappedCode(ordinal) {
  return `RANK${String(ordinal).padStart(4, "0")}AAAAAAAA`;
}

export function sanitizeRankings(probe, dataKey) {
  const data = probe?.[dataKey];
  const rankings = data?.worldData?.encounter?.characterRankings;
  if (!Array.isArray(rankings?.rankings))
    throw new Error(`rankings mode expects ${dataKey}.worldData.encounter.characterRankings.rankings`);
  const codes = new Map();
  const rows = rankings.rankings.map((row, index) => {
    const { guild: _guild, server: _server, ...rest } = row;
    const code = row?.report?.code;
    if (typeof code === "string" && !codes.has(code)) codes.set(code, remappedCode(codes.size + 1));
    return {
      ...rest,
      name: `Candidate${String(index + 1)}`,
      server: null,
      report: { ...row.report, code: typeof code === "string" ? codes.get(code) : row?.report?.code },
    };
  });
  const stripped = stripRateLimit(data);
  return {
    ...stripped,
    worldData: {
      ...stripped.worldData,
      encounter: { ...stripped.worldData.encounter, characterRankings: { ...rankings, rankings: rows } },
    },
  };
}

function main() {
  const [mode, inputPath, outputPath, dataKey] = process.argv.slice(2);
  if (mode === undefined || inputPath === undefined || outputPath === undefined) {
    console.error(
      "usage: node scripts/corpus/sanitize-payloads.mjs <pages|context|rankings> <in.json> <out-path> [data-key]",
    );
    process.exit(1);
  }
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  let output;
  if (mode === "pages") output = sanitizePages(input);
  else if (mode === "context") output = sanitizeContext(input);
  else if (mode === "rankings") output = sanitizeRankings(input, dataKey ?? "");
  else {
    console.error(`unknown mode ${mode}`);
    process.exit(1);
  }
  const serialized = JSON.stringify(output, null, 2);
  const lowered = serialized.toLowerCase();
  const offender = FORBIDDEN.find((needle) => lowered.includes(needle));
  if (offender !== undefined) {
    console.error(`refusing to write: output contains a credential-shaped value (${offender})`);
    process.exit(1);
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${serialized}\n`, "utf8");
  console.log(
    `wrote ${outputPath} (${String(serialized.length + 1)} bytes) with ${SANITIZE_PAYLOADS_REVISION} mode ${mode}`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
