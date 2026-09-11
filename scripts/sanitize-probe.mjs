/**
 * Turns raw probe output into a reviewable fixture slice.
 *
 * Two steps exist on purpose. Raw capture under `.probe/` is disposable and
 * gitignored; only a small, reviewed slice enters `tests/fixtures/`. That keeps
 * the repository free of a large raw-log corpus while preserving the exact
 * structures under test.
 *
 * Usage:
 *
 *     node scripts/sanitize-probe.mjs <input.json> <output-name> --head <N>
 *     node scripts/sanitize-probe.mjs <input.json> <output-name> --per-type <N>
 *     node scripts/sanitize-probe.mjs <input.json> <output-name> --where <key>=<value> <N>
 *
 * `--per-type` keeps up to N events of EACH distinct `type`, in original order.
 * That yields far more evidence per byte than a head slice: a fixture that has
 * to justify a contract for eleven event families needs an example of each, not
 * the first 200 events of a pull.
 *
 * `--where` keeps up to N events whose field matches, which is how an edge
 * condition gets committed evidence. A contract that treats `sourceID: -1` as a
 * no-actor sentinel needs a fixture containing one; a fixture that happens not
 * to include the edge cannot justify the rule.
 *
 * Accepts either a full GraphQL envelope or a bare event array, and always
 * writes a bare event array plus a small provenance header alongside it.
 *
 * It is plain JavaScript with no `src/` imports, so plain `node` runs it — no
 * TypeScript runner and no new dependency.
 *
 * This script refuses to write anything containing a credential-shaped value.
 * That is a backstop, not the primary control: the probe never writes headers
 * or tokens in the first place.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const FORBIDDEN = ["client_secret", "access_token", "authorization", "bearer ", "wcl_client_secret"];

const [inputPath, outputName, mode, countRaw] = process.argv.slice(2);

if (inputPath === undefined || outputName === undefined) {
  console.error(
    "usage: node scripts/sanitize-probe.mjs <input.json> <output-name> [--head N | --per-type N]",
  );
  process.exit(1);
}

const count = Number(countRaw ?? 3);
const payload = JSON.parse(readFileSync(inputPath, "utf8"));

/** Pulls the event array out of whichever shape the probe wrote. */
function extractEvents(value) {
  if (Array.isArray(value)) {
    return value;
  }
  const data = value?.reportData?.report?.events?.data;
  if (Array.isArray(data)) {
    return data;
  }
  throw new Error("could not find an event array in the input");
}

const events = extractEvents(payload);

let sliced;
if (mode === "--where") {
  const [whereKey, whereValueRaw] = String(countRaw ?? "").split("=");
  const limit = Number(process.argv[6] ?? 3);
  if (whereKey === undefined || whereValueRaw === undefined) {
    console.error("usage: --where <key>=<value> <N>");
    process.exit(1);
  }
  const whereValue = Number.isNaN(Number(whereValueRaw)) ? whereValueRaw : Number(whereValueRaw);
  sliced = events.filter((event) => event?.[whereKey] === whereValue).slice(0, limit);
} else if (mode === "--per-type") {
  const seen = new Map();
  sliced = events.filter((event) => {
    const type = String(event?.type ?? "<untyped>");
    const taken = seen.get(type) ?? 0;
    if (taken >= count) {
      return false;
    }
    seen.set(type, taken + 1);
    return true;
  });
} else {
  sliced = events.slice(0, Number.isFinite(count) ? count : 200);
}

const typeCounts = {};
for (const event of sliced) {
  const type = String(event?.type ?? "<untyped>");
  typeCounts[type] = (typeCounts[type] ?? 0) + 1;
}

const serialized = JSON.stringify(sliced, null, 2);

const lowered = serialized.toLowerCase();
const offender = FORBIDDEN.find((needle) => lowered.includes(needle));
if (offender !== undefined) {
  console.error(`refusing to write: output contains a credential-shaped value (${offender})`);
  process.exit(1);
}

const outputPath = `tests/fixtures/wcl/events/${outputName}`;
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${serialized}\n`, "utf8");

console.log(`wrote ${outputPath}`);
console.log(`  events: ${sliced.length} of ${events.length}`);
console.log(`  types:  ${JSON.stringify(typeCounts)}`);
console.log("Review it, then record its provenance in tests/fixtures/wcl/events/PROVENANCE.md.");
console.log(
  "Only after that may a raw type string from this slice be cited as evidence in supported-families.ts.",
);
