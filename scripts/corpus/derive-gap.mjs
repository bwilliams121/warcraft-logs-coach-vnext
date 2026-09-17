/**
 * Derives a GAP artifact from a committed corpus slice: the parent's parsed
 * event array with every event strictly inside an open interval removed, and
 * nothing else changed.
 *
 *     node scripts/corpus/derive-gap.mjs <parent-file> <output-file> --remove-between <fromMs> <toMs>
 *
 * Both names are files under `tests/corpus/artifacts/wcl-events/`. Events
 * with `fromMs < timestamp < toMs` are dropped; every other event is kept in
 * the parent's order, byte-for-byte as the parent serializes it (the same
 * `JSON.stringify(events, null, 2)` the slicer writes). A `combatantinfo` at
 * the fight start therefore survives a gap that begins at the fight start,
 * which is what makes the derivative a window whose coverage does not begin
 * where the window begins — the truncated-evidence condition the corpus keeps
 * a real example of.
 *
 * The M10-B gap derivative (`…opener.gap-before-2010000`) was cut by this
 * exact expression by hand; this script is that derivation made a committed,
 * re-runnable tool. Run over the opener with `--remove-between 2004589
 * 2010000` it reproduces the committed derivative byte for byte, and a test
 * checks that it does.
 *
 * The boundary is an INPUT, chosen and recorded in the manifest before any
 * evaluator runs over the result; nothing here reads an analysis outcome.
 *
 * Plain JavaScript with no `src/` imports, like the slicer.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DERIVE_GAP_REVISION = "derive-gap-1";

export const ARTIFACT_ROOT = "tests/corpus/artifacts/wcl-events";

/** The derivation, exported for tests: every event strictly inside (fromMs, toMs) removed. */
export function removeBetween(events, fromMs, toMs) {
  return events.filter(
    (event) =>
      typeof event !== "object" ||
      event === null ||
      typeof event.timestamp !== "number" ||
      !(event.timestamp > fromMs && event.timestamp < toMs),
  );
}

/** The artifact byte form: the slicer's serialization plus a trailing newline. */
export function serializeArtifact(events) {
  return `${JSON.stringify(events, null, 2)}\n`;
}

function main() {
  const [parentFile, outputFile, flag, fromRaw, toRaw] = process.argv.slice(2);
  const fromMs = Number(fromRaw);
  const toMs = Number(toRaw);
  if (
    parentFile === undefined ||
    outputFile === undefined ||
    flag !== "--remove-between" ||
    !Number.isSafeInteger(fromMs) ||
    !Number.isSafeInteger(toMs) ||
    !(fromMs < toMs) ||
    process.argv.length !== 7
  ) {
    console.error(
      "usage: node scripts/corpus/derive-gap.mjs <parent-file> <output-file> --remove-between <fromMs> <toMs>  (fromMs < toMs)",
    );
    process.exit(1);
  }
  const parentPath = `${ARTIFACT_ROOT}/${parentFile}`;
  const events = JSON.parse(readFileSync(parentPath, "utf8"));
  if (!Array.isArray(events)) {
    console.error(`${parentPath} is not an event array`);
    process.exit(1);
  }
  const kept = removeBetween(events, fromMs, toMs);
  const bytes = serializeArtifact(kept);
  const outputPath = `${ARTIFACT_ROOT}/${outputFile}`;
  writeFileSync(outputPath, bytes, "utf8");
  const canonical = Buffer.from(bytes.replaceAll("\r\n", "\n"), "utf8");
  console.log(`wrote ${outputPath}`);
  console.log(
    `  kept:       ${kept.length} of ${events.length} (removed ${events.length - kept.length} with ${fromMs} < timestamp < ${toMs})`,
  );
  console.log(`  sha256:     ${createHash("sha256").update(canonical).digest("hex")}`);
  console.log(`  byteLength: ${canonical.length}`);
  console.log(
    `  tooling:    { name: "scripts/corpus/derive-gap.mjs", revision: "${DERIVE_GAP_REVISION}", invocation: "${process.argv.slice(2).join(" ")}" }`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
