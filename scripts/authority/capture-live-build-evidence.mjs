/**
 * M11-G4-1: captures LIVE (product `wow`) client-build observations for the
 * SimulationContextResolver deploy calendar, with provenance.
 *
 * Two sources, never conflated:
 *
 * - wago.tools `/api/builds` — a THIRD-PARTY recorder of Blizzard's version
 *   server. `created_at` is WAGO'S OBSERVATION time, recorded with no
 *   timezone. It is kept verbatim and is never relabelled as a Blizzard
 *   deployment time (owner decision 2026-10-28).
 * - Blizzard's CDN (`level3.blizzard.com/tpr/wow/config/...`) — the build
 *   config each wago row names. Fetching it verifies the build IDENTITY from
 *   Blizzard-origin data: the bytes hash (MD5) to the key, and the config's
 *   `build-name` names the build. Its `Last-Modified` header is the
 *   Blizzard-origin time the config existed on the CDN.
 *
 * Network: wago.tools and Blizzard's CDN only (never Warcraft Logs). No
 * credentials. Writes the observation set sorted by first observation.
 *
 *   node scripts/authority/capture-live-build-evidence.mjs \
 *     --min-version 12.0.7 --out src/data/simulation-context/build-observations.json \n *     --raw-out .probe/g4/wago-builds-raw.json
 *
 * `--raw-out` keeps the exact wago response bytes (hash recorded in the
 * artifact) outside the repository.
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const WAGO_URL = "https://wago.tools/api/builds";
const CDN_HOST = "level3.blizzard.com";
const CDN_PATH = "tpr/wow";
const GENERATOR_REVISION = 1;

function fail(message) {
  console.error(`capture-live-build-evidence: ${message}`);
  process.exit(1);
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const versionKey = (version) =>
  version
    .split(".")
    .map((part) => part.padStart(6, "0"))
    .join(".");

async function main() {
  const minVersion = arg("min-version");
  const out = arg("out");
  if (minVersion === undefined || out === undefined) fail("pass --min-version <x.y.z> and --out <path>");

  const wagoRetrievedAtUtc = new Date().toISOString();
  const wagoResponse = await fetch(WAGO_URL);
  if (!wagoResponse.ok) fail(`wago.tools answered ${String(wagoResponse.status)}`);
  const wagoBytes = Buffer.from(await wagoResponse.arrayBuffer());
  const rawOut = arg("raw-out");
  if (rawOut !== undefined) writeFileSync(rawOut, wagoBytes);
  const wago = JSON.parse(wagoBytes.toString("utf8"));
  const rows = (wago.wow ?? []).filter(
    (row) =>
      row.product === "wow" && row.is_bgdl === false && versionKey(row.version) >= versionKey(minVersion),
  );
  if (rows.length === 0) fail("no product `wow` rows at or above --min-version");

  const observations = [];
  for (const row of rows) {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(row.version)) fail(`unexpected version ${row.version}`);
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.created_at))
      fail(`unexpected created_at ${row.created_at}`);
    if (!/^[0-9a-f]{32}$/.test(row.build_config)) fail(`unexpected build_config ${row.build_config}`);
    const url = `http://${CDN_HOST}/${CDN_PATH}/config/${row.build_config.slice(0, 2)}/${row.build_config.slice(2, 4)}/${row.build_config}`;
    const retrievedAtUtc = new Date().toISOString();
    const response = await fetch(url);
    const body = Buffer.from(await response.arrayBuffer());
    const lastModified = response.headers.get("last-modified");
    const buildName = /^build-name = (.*)$/m.exec(body.toString("utf8"))?.[1]?.trim() ?? null;
    const [major, minor, patch, build] = row.version.split(".");
    observations.push({
      version: row.version,
      buildId: Number(build),
      wago: {
        createdAtRaw: row.created_at,
        buildConfig: row.build_config,
        cdnConfig: row.cdn_config,
        productConfig: row.product_config,
      },
      blizzardCdn: {
        url,
        retrievedAtUtc,
        httpStatus: response.status,
        lastModifiedUtc: lastModified === null ? null : new Date(lastModified).toISOString(),
        contentMd5MatchesKey:
          response.ok && createHash("md5").update(body).digest("hex") === row.build_config,
        buildName,
        buildNameMatchesVersion: buildName === `WOW-${build}patch${major}.${minor}.${patch}_Retail`,
      },
    });
  }
  observations.sort((a, b) => a.wago.createdAtRaw.localeCompare(b.wago.createdAtRaw));

  const artifact = {
    artifactVersion: 1,
    datasetId: "LIVE_BUILD_OBSERVATIONS",
    generatorRevision: GENERATOR_REVISION,
    provenance: {
      appearanceSource: {
        kind: "THIRD_PARTY_VERSION_SERVER_RECORDER",
        publisher: "wago.tools",
        url: WAGO_URL,
        retrievedAtUtc: wagoRetrievedAtUtc,
        responseSha256: createHash("sha256").update(wagoBytes).digest("hex"),
        product: "wow",
        createdAtSemantics: "WAGO_OBSERVATION_TIME_TIMEZONE_UNDECLARED",
        regionRecorded: false,
      },
      identitySource: {
        kind: "BLIZZARD_CDN_BUILD_CONFIG",
        host: CDN_HOST,
        path: CDN_PATH,
        lastModifiedSemantics: "BLIZZARD_CDN_OBJECT_LAST_MODIFIED",
      },
      minVersion,
      generator: "scripts/authority/capture-live-build-evidence.mjs",
    },
    observations,
  };
  writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`Wrote ${out}: ${String(observations.length)} observations`);
}

await main();
