/**
 * Turns raw probe output into a reviewable fixture slice.
 *
 * Two steps exist on purpose. Raw capture under `.probe/` is disposable and
 * gitignored; only a small, reviewed slice enters the regression corpus under
 * `tests/corpus/artifacts/`. That keeps the repository free of a large raw-log
 * corpus while preserving the exact structures under test. The slice is not
 * evidence until `tests/corpus/manifest.json` records its provenance, digest
 * and retained coverage — see `scripts/corpus/build-manifest.mjs`.
 *
 * Usage:
 *
 *     node scripts/sanitize-probe.mjs <input.json> <output-name> --head <N>
 *     node scripts/sanitize-probe.mjs <input.json> <output-name> --per-type <N>
 *     node scripts/sanitize-probe.mjs <input.json> <output-name> --where <key>=<value> <N>
 *     node scripts/sanitize-probe.mjs <input.json> <output-name> --indices <i,j,k>
 *     node scripts/sanitize-probe.mjs <input.json> <output-name> --decision-slice <subject> <target,target>
 *     node scripts/sanitize-probe.mjs <input.json> <output-name> --actor-slice <subject> [<toReportTimeMs>] [--families <type,type,...>]
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
 * `--indices` keeps exactly the listed capture positions, in the order listed.
 * The other three modes select by PROPERTY, which cannot express "this specific
 * chain of events". An evidence contract about a SEQUENCE — a stack climbing
 * 1, 2, 3 and then being removed — needs the actual chain, and picking it by
 * ability id would also drag in every other actor's copy of the same aura.
 *
 * It fails rather than trims: a requested index outside the capture is an error,
 * not an event to skip, because silently producing a shorter fixture than asked
 * for would quietly weaken the evidence a contract rests on.
 *
 * `--decision-slice` is the M5-D2 predicate, made a recorded mode: EVERY cast
 * by the subject, EVERY aura event whose target is the subject or one of the
 * listed targets, and the subject's combatantinfo — in capture order, nothing
 * else. Because it is a predicate over the whole capture rather than a count
 * or an index list, a slice cut with it can carry a coverage grant for
 * exactly those categories and actors over the capture window; the other
 * modes select by property or position and carry none.
 *
 * `--actor-slice` is the M10-B predicate, made a recorded mode: EVERY event
 * whose `sourceID` OR `targetID` is the subject — casts, resource changes,
 * auras applied to or by the subject, damage taken and dealt, healing given
 * and received, absorbs, summons, the subject's combatantinfo — in capture
 * order, nothing else, optionally bounded to timestamps at or before
 * `toReportTimeMs`. A tank's evidence is what happens TO the actor as much as
 * what the actor does, which the decision-slice predicate cannot express.
 * Because it is a predicate over the whole capture, a slice cut with it can
 * carry a grant for every capture-vouched category with actor scope
 * [subject] over [window start, bound]; the bound exists so a retained slice
 * stays under the corpus artifact size limit, and the grant must end there.
 *
 * `--families` (M10-C5, `--actor-slice` only) additionally keeps ONLY events
 * whose raw `type` is in the list — a generic family filter, recorded in the
 * invocation, so a longer window fits under the artifact limit by dropping
 * families a question does not need rather than by shortening the window.
 * The retained families are still complete over the window by the same
 * predicate; a family that was filtered out is NOT retained, and a slice cut
 * this way must grant coverage only to the categories its retained families
 * vouch for. Nothing within a retained family is trimmed.
 *
 * Accepts a full GraphQL envelope, a bare event array, or an ARRAY OF PAGE
 * ENVELOPES (a paginated capture, concatenated in page order), and always
 * writes a bare event array plus a small provenance header alongside it.
 *
 * It is plain JavaScript with no `src/` imports, so plain `node` runs it — no
 * TypeScript runner and no new dependency.
 *
 * This script refuses to write anything containing a credential-shaped value.
 * That is a backstop, not the primary control: the probe never writes headers
 * or tokens in the first place.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const FORBIDDEN = ["client_secret", "access_token", "authorization", "bearer ", "wcl_client_secret"];

/**
 * The slicer's own revision, for a corpus artifact's `tooling.revision`.
 *
 * Bump it when the selection semantics change. Every slice committed before
 * M9-B predates this field, and their manifest entries record UNAVAILABLE —
 * a fact about those captures, not something to backfill.
 */
export const SANITIZER_REVISION = "sanitize-probe-5";

/** Where a reviewed slice lands: the regression corpus, never a loose fixture directory. */
export const OUTPUT_ROOT = "tests/corpus/artifacts/wcl-events";

/**
 * Parses an `--indices` argument against a capture of `eventCount` events.
 *
 * Exported for tests. Returns a discriminated result rather than throwing or
 * calling `process.exit`, so the validation rules can be exercised directly.
 *
 * Every rejection is explicit. Nothing is coerced, rounded, deduplicated,
 * reordered or dropped: each of those would turn an operator's typo into a
 * quietly different fixture, and a fixture is evidence.
 */
export function parseIndexSelection(spec, eventCount) {
  if (typeof spec !== "string" || spec.trim().length === 0) {
    return { ok: false, error: "--indices requires a comma-separated list, e.g. --indices 12,40,41" };
  }

  const indices = [];
  const seen = new Set();
  for (const field of spec.split(",")) {
    const text = field.trim();
    if (text.length === 0) {
      return { ok: false, error: `--indices has an empty entry in "${spec}"` };
    }
    // `Number` alone would accept "1e3", " 12 " and "0x10". An index is decimal
    // digits, so the shape is checked before the value.
    if (!/^\d+$/.test(text)) {
      return { ok: false, error: `--indices entry "${text}" is not a non-negative integer` };
    }
    const index = Number(text);
    if (index >= eventCount) {
      return {
        ok: false,
        error: `--indices entry ${index} is outside the capture, which holds ${eventCount} events (0-${eventCount - 1})`,
      };
    }
    if (seen.has(index)) {
      return { ok: false, error: `--indices entry ${index} is listed more than once` };
    }
    seen.add(index);
    indices.push(index);
  }
  return { ok: true, indices };
}

/** Pulls the event array out of whichever shape the probe wrote. */
export function extractEvents(value) {
  if (Array.isArray(value)) {
    // A paginated capture: every element is a page envelope. Concatenated in
    // page order, which is retrieval order. Anything else is a bare array.
    if (value.length > 0 && value.every((page) => Array.isArray(page?.reportData?.report?.events?.data))) {
      return value.flatMap((page) => page.reportData.report.events.data);
    }
    return value;
  }
  const data = value?.reportData?.report?.events?.data;
  if (Array.isArray(data)) {
    return data;
  }
  throw new Error("could not find an event array in the input");
}

/** The aura event families, as Warcraft Logs names them. */
const AURA_TYPES = new Set([
  "applybuff",
  "refreshbuff",
  "removebuff",
  "applybuffstack",
  "removebuffstack",
  "applydebuff",
  "refreshdebuff",
  "removedebuff",
  "applydebuffstack",
  "removedebuffstack",
]);

/**
 * The `--decision-slice` predicate. Exported for tests.
 *
 * Keeps, in capture order: every `cast` sourced by `subject`; every aura event
 * whose `targetID` is `subject` or in `targets`; the subject's `combatantinfo`.
 * Nothing is reordered, deduplicated or synthesised.
 */
export function decisionSlice(events, subject, targets) {
  const auraTargets = new Set([subject, ...targets]);
  return events.filter((event) => {
    if (typeof event !== "object" || event === null) return false;
    if (event.type === "cast" && event.sourceID === subject) return true;
    if (event.type === "combatantinfo" && event.sourceID === subject) return true;
    return AURA_TYPES.has(event.type) && auraTargets.has(event.targetID);
  });
}

/**
 * The `--actor-slice` predicate. Exported for tests.
 *
 * Keeps, in capture order, every event whose `sourceID` or `targetID` is
 * `subject`, and — when `untilMs` is a number — only those with `timestamp`
 * at or before it, and — when `families` is a list — only those whose raw
 * `type` is in it. Nothing is reordered, deduplicated or synthesised.
 */
export function actorSlice(events, subject, untilMs = null, families = null) {
  const kept = families === null ? null : new Set(families);
  return events.filter((event) => {
    if (typeof event !== "object" || event === null) return false;
    if (event.sourceID !== subject && event.targetID !== subject) return false;
    if (kept !== null && !kept.has(event.type)) return false;
    return untilMs === null || (typeof event.timestamp === "number" && event.timestamp <= untilMs);
  });
}

/**
 * Parses a `--families` list: raw Warcraft Logs type strings, comma-separated,
 * each non-empty and listed once. Exported for tests. Refuses rather than
 * trims, for the same reason `parseIndexSelection` does.
 */
export function parseFamilySelection(spec) {
  if (typeof spec !== "string" || spec.trim().length === 0) {
    return {
      ok: false,
      error: "--families requires a comma-separated list of raw event types, e.g. --families cast,applybuff",
    };
  }
  const families = [];
  for (const field of spec.split(",")) {
    const type = field.trim();
    if (type.length === 0) return { ok: false, error: `--families has an empty entry in "${spec}"` };
    if (!/^[a-z]+$/.test(type))
      return { ok: false, error: `--families entry "${type}" is not a raw Warcraft Logs event type` };
    if (families.includes(type))
      return { ok: false, error: `--families entry "${type}" is listed more than once` };
    families.push(type);
  }
  return { ok: true, families };
}

function main() {
  const [inputPath, outputName, mode, countRaw] = process.argv.slice(2);

  if (inputPath === undefined || outputName === undefined) {
    console.error(
      "usage: node scripts/sanitize-probe.mjs <input.json> <output-name> [--head N | --per-type N | --where key=value N | --indices i,j,k | --decision-slice subject target,target | --actor-slice subject [toReportTimeMs] [--families type,type]]",
    );
    process.exit(1);
  }

  const count = Number(countRaw ?? 3);
  const payload = JSON.parse(readFileSync(inputPath, "utf8"));

  const events = extractEvents(payload);

  let sliced;
  if (mode === "--actor-slice") {
    const subject = Number(countRaw);
    const rest = process.argv.slice(6);
    const familiesAt = rest.indexOf("--families");
    const positional = familiesAt === -1 ? rest : rest.slice(0, familiesAt);
    const untilRaw = positional[0];
    const untilMs = untilRaw === undefined ? null : Number(untilRaw);
    if (
      !Number.isSafeInteger(subject) ||
      (untilMs !== null && !Number.isSafeInteger(untilMs)) ||
      positional.length > 1 ||
      (familiesAt !== -1 && rest.length !== familiesAt + 2)
    ) {
      console.error(
        "usage: --actor-slice <subject actor id> [<toReportTimeMs>] [--families <type,type,...>]",
      );
      process.exit(1);
    }
    let families = null;
    if (familiesAt !== -1) {
      const selection = parseFamilySelection(rest[familiesAt + 1]);
      if (!selection.ok) {
        console.error(selection.error);
        process.exit(1);
      }
      families = selection.families;
    }
    sliced = actorSlice(events, subject, untilMs, families);
  } else if (mode === "--decision-slice") {
    const subject = Number(countRaw);
    const targets = String(process.argv[6] ?? "")
      .split(",")
      .filter((entry) => entry.trim() !== "")
      .map(Number);
    if (!Number.isSafeInteger(subject) || targets.some((id) => !Number.isSafeInteger(id))) {
      console.error("usage: --decision-slice <subject actor id> <target actor id,...>");
      process.exit(1);
    }
    sliced = decisionSlice(events, subject, targets);
  } else if (mode === "--indices") {
    const selection = parseIndexSelection(countRaw, events.length);
    if (!selection.ok) {
      console.error(selection.error);
      process.exit(1);
    }
    sliced = selection.indices.map((index) => events[index]);
  } else if (mode === "--where") {
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

  const outputPath = `${OUTPUT_ROOT}/${outputName}`;
  mkdirSync(dirname(outputPath), { recursive: true });
  const bytes = `${serialized}\n`;
  writeFileSync(outputPath, bytes, "utf8");

  // The corpus digest policy: SHA-256 over the bytes with CRLF folded to LF.
  const canonical = Buffer.from(bytes.replaceAll("\r\n", "\n"), "utf8");
  console.log(`wrote ${outputPath}`);
  console.log(`  events:     ${sliced.length} of ${events.length}`);
  console.log(`  types:      ${JSON.stringify(typeCounts)}`);
  console.log(`  sha256:     ${createHash("sha256").update(canonical).digest("hex")}`);
  console.log(`  byteLength: ${canonical.length}`);
  console.log(
    `  tooling:    { name: "scripts/sanitize-probe.mjs", revision: "${SANITIZER_REVISION}", invocation: "${process.argv.slice(2).join(" ")}" }`,
  );
  console.log(
    "Review it, then add an artifact record to scripts/corpus/build-manifest.mjs with its source capture,",
  );
  console.log(
    "transformations and retained coverage, regenerate tests/corpus/manifest.json, and run the corpus tests.",
  );
  console.log(
    "Only after that may a raw type string from this slice be cited as evidence in supported-families.ts.",
  );
}

// Runs only when invoked as a script. Importing the module — which is how the
// selection rules are tested — must not read argv or write a file.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
