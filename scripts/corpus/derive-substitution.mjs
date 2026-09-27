/**
 * Derives a NEGATIVE-CONTROL artifact from a committed corpus slice (M11-C4h):
 * the parent's parsed event array with exactly ONE field of exactly ONE event
 * changed — the `abilityGameID` of one cast — and nothing else.
 *
 *     node scripts/corpus/derive-substitution.mjs <parent-file> <output-file> --substitute <eventIndex> <fromAbilityGameId> <toAbilityGameId>
 *
 * Both names are files under `tests/corpus/artifacts/wcl-events/`. The event
 * at `eventIndex` must be a `cast` whose `abilityGameID` is `fromAbilityGameId`;
 * anything else is refused. Every other event, and every other field of that
 * event, is kept byte-for-byte as the parent serializes it (the same
 * `JSON.stringify(events, null, 2)` the slicer writes).
 *
 * The result is DERIVED_FROM_CAPTURE with one VALUE_MUTATION: it describes a
 * cast that was NOT observed. It is a discrimination control — "would the
 * analyzer disagree with this action, on this real state?" — and never
 * evidence of what the player did. The loader re-derives the one-field diff
 * from the committed parent and child and refuses any other difference
 * (`tests/support/corpus/loader.ts`, the substitution rule).
 *
 * The substitution is an INPUT, recorded in the manifest before the case is
 * executed; nothing here reads an analysis outcome.
 *
 * Plain JavaScript with no `src/` imports, like the slicer.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DERIVE_SUBSTITUTION_REVISION = "derive-substitution-1";

export const ARTIFACT_ROOT = "tests/corpus/artifacts/wcl-events";

/**
 * The derivation, exported for tests: a copy of `events` whose event at
 * `index` has `abilityGameID` changed from `from` to `to`. Throws unless that
 * event is a `cast` carrying `from`, and unless `from !== to`.
 */
export function substituteCastAbility(events, index, from, to) {
  if (!Array.isArray(events)) throw new Error("the parent is not an event array");
  if (!Number.isSafeInteger(index) || index < 0 || index >= events.length) {
    throw new Error(`event index ${String(index)} is outside the parent's ${String(events.length)} events`);
  }
  if (from === to) throw new Error("a substitution must change the ability id");
  const event = events[index];
  if (typeof event !== "object" || event === null || event.type !== "cast") {
    throw new Error(`event ${String(index)} is not a cast`);
  }
  if (event.abilityGameID !== from) {
    throw new Error(
      `event ${String(index)} carries abilityGameID ${String(event.abilityGameID)}, not ${String(from)}`,
    );
  }
  // Rebuilt key by key so the substituted event keeps the parent's key order.
  const substituted = Object.fromEntries(
    Object.entries(event).map(([key, value]) => [key, key === "abilityGameID" ? to : value]),
  );
  return events.map((entry, position) => (position === index ? substituted : entry));
}

/** The artifact byte form: the slicer's serialization plus a trailing newline. */
export function serializeArtifact(events) {
  return `${JSON.stringify(events, null, 2)}\n`;
}

function main() {
  const [parentFile, outputFile, flag, indexRaw, fromRaw, toRaw] = process.argv.slice(2);
  const index = Number(indexRaw);
  const from = Number(fromRaw);
  const to = Number(toRaw);
  if (
    parentFile === undefined ||
    outputFile === undefined ||
    flag !== "--substitute" ||
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    process.argv.length !== 8
  ) {
    console.error(
      "usage: node scripts/corpus/derive-substitution.mjs <parent-file> <output-file> --substitute <eventIndex> <fromAbilityGameId> <toAbilityGameId>",
    );
    process.exit(1);
  }
  const parentPath = `${ARTIFACT_ROOT}/${parentFile}`;
  const events = JSON.parse(readFileSync(parentPath, "utf8"));
  let derived;
  try {
    derived = substituteCastAbility(events, index, from, to);
  } catch (error) {
    console.error(`${parentPath}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const bytes = serializeArtifact(derived);
  const outputPath = `${ARTIFACT_ROOT}/${outputFile}`;
  writeFileSync(outputPath, bytes, "utf8");
  const canonical = Buffer.from(bytes.replaceAll("\r\n", "\n"), "utf8");
  const event = derived[index];
  console.log(`wrote ${outputPath}`);
  console.log(
    `  substituted: event ${String(index)} (cast by ${String(event.sourceID)} at ${String(event.timestamp)}) abilityGameID ${String(from)} -> ${String(to)}`,
  );
  console.log(`  sha256:      ${createHash("sha256").update(canonical).digest("hex")}`);
  console.log(`  byteLength:  ${canonical.length}`);
  console.log(
    `  tooling:     { name: "scripts/corpus/derive-substitution.mjs", revision: "${DERIVE_SUBSTITUTION_REVISION}", invocation: "${process.argv.slice(2).join(" ")}" }`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
