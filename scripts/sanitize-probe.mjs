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
 *     node scripts/sanitize-probe.mjs <input.json> <output-name> --actor-slice <subject> [<toReportTimeMs>] [--from <exclusiveFromMs>] [--families <type,type,...>]
 *     node scripts/sanitize-probe.mjs <input.json> <output-name> --actor-slice-with-owned-pets <focus> [<toReportTimeMs>] --catalog <context.json> [--from <exclusiveFromMs>] [--families <type,type,...>] [--actorless-families <type,type,...>]
 *
 * Any mode accepts a trailing `--compact`.
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
 * `--from` (M10-C5 Phase B, `--actor-slice` only) keeps only events with
 * `timestamp` STRICTLY AFTER the given millisecond, so a long capture can be
 * committed as chronological SEGMENTS that share no event: segment k keeps
 * (from_k, to_k] and the next begins at to_k. The grant of such a segment
 * starts at from + 1; the composer that joins segments requires adjacency
 * and refuses overlaps or holes it was not told about.
 *
 * `--actor-slice-with-owned-pets` (M11-E2.1) is the `--actor-slice` predicate
 * over a DERIVED actor set rather than one subject: the focus actor plus every
 * actor whose Warcraft Logs master-data `petOwner` is exactly the focus, read
 * from the fight context named by `--catalog`. The set is never typed on the
 * command line. No recursion (a pet's pet is not included), no inference from
 * summon events, no other player's pets, and an actor with a null owner is not
 * owned. A stated owner is not combat relevance: an owned actor with no event
 * is still in the set, and the slicer reports which members have none.
 * Derivation fails closed — nothing is written — when the focus is absent or
 * listed twice, an actor id is listed twice, a `petOwner` is neither an
 * integer nor null, or an actor naming the focus as owner is itself a Player
 * or the focus. `--from`, the bound and `--families` behave exactly as for
 * `--actor-slice`.
 *
 * `--actorless-families` (that mode only) additionally keeps events of the
 * listed raw types that carry NEITHER a `sourceID` NOR a `targetID` key —
 * `encounterstart` / `encounterend`, which no actor predicate can select. It
 * is an explicit, recorded structural inclusion: an actorless event of an
 * unlisted type is dropped, and a listed type's events that DO carry an actor
 * are subject to the actor predicate like any other. Every listed type must
 * also be in `--families`.
 *
 * `--compact` (M11-E2.1) writes the slice as compact JSON — no whitespace
 * between tokens — instead of the default two-space indentation. It changes
 * bytes, never content: the same events, the same order, each event's keys in
 * the order the capture held them, one trailing newline. Without the flag the
 * output is byte-identical to every earlier revision's, so no committed
 * artifact changes. It exists for the evidence archive, where a full-fight
 * slice would otherwise be mostly indentation.
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
export const SANITIZER_REVISION = "sanitize-probe-7";

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
    // A paginated capture whose pages are recorded with their request facts
    // (`{ requestedStartTime, data }`, the M11-E2 probe's shape): the same
    // concatenation over each record's `data` envelope, in record order.
    if (
      value.length > 0 &&
      value.every((page) => Array.isArray(page?.data?.reportData?.report?.events?.data))
    ) {
      return value.flatMap((page) => page.data.reportData.report.events.data);
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
 * `type` is in it, and — when `fromMs` is a number — only those with
 * `timestamp` strictly after it. Nothing is reordered, deduplicated or
 * synthesised.
 */
export function actorSlice(events, subject, untilMs = null, families = null, fromMs = null) {
  const kept = families === null ? null : new Set(families);
  return events.filter((event) => {
    if (typeof event !== "object" || event === null) return false;
    if (event.sourceID !== subject && event.targetID !== subject) return false;
    if (kept !== null && !kept.has(event.type)) return false;
    if (fromMs !== null && !(typeof event.timestamp === "number" && event.timestamp > fromMs)) return false;
    return untilMs === null || (typeof event.timestamp === "number" && event.timestamp <= untilMs);
  });
}

/**
 * The actor set of an owned-pet slice, DERIVED from a fight context's master
 * data: `focusActorId` plus every actor whose `petOwner` is exactly it.
 * Exported for tests. Returns a discriminated result; every refusal names the
 * fact that made the catalog unusable.
 */
export function deriveOwnedPetScope(context, focusActorId) {
  const actors = context?.reportData?.report?.masterData?.actors;
  if (!Array.isArray(actors)) {
    return { ok: false, error: "the catalog holds no reportData.report.masterData.actors array" };
  }
  if (!Number.isSafeInteger(focusActorId)) {
    return { ok: false, error: `focus actor ${String(focusActorId)} is not an integer actor id` };
  }
  const seen = new Set();
  for (const actor of actors) {
    const id = actor?.id;
    if (!Number.isSafeInteger(id))
      return { ok: false, error: "the catalog holds an actor without an integer id" };
    if (seen.has(id)) return { ok: false, error: `actor ${id} is listed more than once in the catalog` };
    seen.add(id);
    const owner = actor.petOwner;
    if (owner !== null && owner !== undefined && !Number.isSafeInteger(owner)) {
      return { ok: false, error: `actor ${id} has a petOwner that is neither an integer nor null` };
    }
  }
  if (!seen.has(focusActorId)) {
    return { ok: false, error: `focus actor ${focusActorId} is not in the catalog` };
  }
  const owned = actors.filter((actor) => actor.petOwner === focusActorId);
  for (const actor of owned) {
    if (actor.id === focusActorId) {
      return { ok: false, error: `focus actor ${focusActorId} names itself as its own petOwner` };
    }
    if (actor.type === "Player") {
      return { ok: false, error: `actor ${actor.id} is a Player but names ${focusActorId} as its petOwner` };
    }
  }
  const ownedActorIds = owned.map((actor) => actor.id).sort((a, b) => a - b);
  return {
    ok: true,
    focusActorId,
    ownedActorIds,
    actorScope: [focusActorId, ...ownedActorIds].sort((a, b) => a - b),
  };
}

/**
 * The `--actor-slice-with-owned-pets` predicate. Exported for tests.
 *
 * Keeps, in capture order, every event whose `sourceID` or `targetID` is in
 * `actorScope`, plus every event of an `actorlessFamilies` type carrying
 * neither key; then the same `families`, `fromMs` (exclusive) and `untilMs`
 * (inclusive) restrictions as `actorSlice`. Nothing is reordered,
 * deduplicated or synthesised.
 */
export function ownedPetSlice(events, actorScope, options = {}) {
  const scope = new Set(actorScope);
  const families = options.families ?? null;
  const kept = families === null ? null : new Set(families);
  const actorless = new Set(options.actorlessFamilies ?? []);
  const fromMs = options.fromMs ?? null;
  const untilMs = options.untilMs ?? null;
  return events.filter((event) => {
    if (typeof event !== "object" || event === null) return false;
    const inScope = scope.has(event.sourceID) || scope.has(event.targetID);
    const structural = actorless.has(event.type) && !("sourceID" in event) && !("targetID" in event);
    if (!inScope && !structural) return false;
    if (kept !== null && !kept.has(event.type)) return false;
    if (fromMs !== null && !(typeof event.timestamp === "number" && event.timestamp > fromMs)) return false;
    return untilMs === null || (typeof event.timestamp === "number" && event.timestamp <= untilMs);
  });
}

/** Members of `actorScope` that appear as `sourceID` or `targetID` of a retained event, ascending. */
export function actorsWithRetainedEvents(events, actorScope) {
  const scope = new Set(actorScope);
  const active = new Set();
  for (const event of events) {
    if (scope.has(event?.sourceID)) active.add(event.sourceID);
    if (scope.has(event?.targetID)) active.add(event.targetID);
  }
  return [...active].sort((a, b) => a - b);
}

/**
 * The slice's bytes: two-space indentation by default (every earlier
 * revision's output, unchanged), or compact JSON under `--compact`. Always one
 * trailing newline. Exported for tests.
 */
export function serializeSlice(sliced, compact = false) {
  return `${compact ? JSON.stringify(sliced) : JSON.stringify(sliced, null, 2)}\n`;
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
  // `--compact` is a serialization flag valid with every mode; it is removed
  // before the mode's own arguments are read, and recorded in the invocation.
  const argv = process.argv.slice(2);
  if (argv.filter((token) => token === "--compact").length > 1) {
    console.error("--compact given more than once");
    process.exit(1);
  }
  const compact = argv.includes("--compact");
  const args = argv.filter((token) => token !== "--compact");
  const [inputPath, outputName, mode, countRaw] = args;

  if (inputPath === undefined || outputName === undefined) {
    console.error(
      "usage: node scripts/sanitize-probe.mjs <input.json> <output-name> [--head N | --per-type N | --where key=value N | --indices i,j,k | --decision-slice subject target,target | --actor-slice subject [toReportTimeMs] [--from exclusiveFromMs] [--families type,type] | --actor-slice-with-owned-pets focus [toReportTimeMs] --catalog context.json [--from exclusiveFromMs] [--families type,type] [--actorless-families type,type]] [--compact]",
    );
    process.exit(1);
  }

  const count = Number(countRaw ?? 3);
  const payload = JSON.parse(readFileSync(inputPath, "utf8"));

  const events = extractEvents(payload);

  let sliced;
  let ownedPetReport = null;
  if (mode === "--actor-slice-with-owned-pets") {
    const focus = Number(countRaw);
    const rest = args.slice(4);
    const valued = ["--catalog", "--from", "--families", "--actorless-families"];
    const options = new Map();
    const positional = [];
    for (let i = 0; i < rest.length; i += 1) {
      const token = rest[i];
      if (valued.includes(token)) {
        if (options.has(token) || rest[i + 1] === undefined) {
          console.error(`usage: --actor-slice-with-owned-pets: ${token} given twice or without a value`);
          process.exit(1);
        }
        options.set(token, rest[i + 1]);
        i += 1;
      } else positional.push(token);
    }
    const untilMs = positional[0] === undefined ? null : Number(positional[0]);
    const fromMs = options.has("--from") ? Number(options.get("--from")) : null;
    if (
      !Number.isSafeInteger(focus) ||
      !options.has("--catalog") ||
      (untilMs !== null && !Number.isSafeInteger(untilMs)) ||
      (fromMs !== null && !Number.isSafeInteger(fromMs)) ||
      (fromMs !== null && untilMs !== null && !(fromMs < untilMs)) ||
      positional.length > 1
    ) {
      console.error(
        "usage: --actor-slice-with-owned-pets <focus actor id> [<toReportTimeMs>] --catalog <context.json> [--from <exclusiveFromMs>] [--families <type,...>] [--actorless-families <type,...>]  (from < to)",
      );
      process.exit(1);
    }
    const derived = deriveOwnedPetScope(JSON.parse(readFileSync(options.get("--catalog"), "utf8")), focus);
    if (!derived.ok) {
      console.error(`refusing to slice: ${derived.error}`);
      process.exit(1);
    }
    let families = null;
    if (options.has("--families")) {
      const selection = parseFamilySelection(options.get("--families"));
      if (!selection.ok) {
        console.error(selection.error);
        process.exit(1);
      }
      families = selection.families;
    }
    let actorlessFamilies = [];
    if (options.has("--actorless-families")) {
      const selection = parseFamilySelection(options.get("--actorless-families"));
      if (!selection.ok) {
        console.error(selection.error.replaceAll("--families", "--actorless-families"));
        process.exit(1);
      }
      if (families !== null && selection.families.some((type) => !families.includes(type))) {
        console.error("every --actorless-families type must also be listed in --families");
        process.exit(1);
      }
      actorlessFamilies = selection.families;
    }
    sliced = ownedPetSlice(events, derived.actorScope, { untilMs, fromMs, families, actorlessFamilies });
    const active = actorsWithRetainedEvents(sliced, derived.actorScope);
    ownedPetReport = {
      focusActorId: derived.focusActorId,
      ownedActorIds: derived.ownedActorIds,
      ownershipAuthority: "WCL_PET_OWNER",
      actorsWithRetainedEvents: active,
      actorsWithoutRetainedEvents: derived.actorScope.filter((id) => !active.includes(id)),
      actorlessEventsRetained: sliced.filter((event) => !("sourceID" in event) && !("targetID" in event))
        .length,
    };
  } else if (mode === "--actor-slice") {
    const subject = Number(countRaw);
    const rest = args.slice(4);
    // Options may follow the optional bound in any order; each takes one value.
    const options = new Map();
    const positional = [];
    for (let i = 0; i < rest.length; i += 1) {
      const token = rest[i];
      if (token === "--families" || token === "--from") {
        if (options.has(token) || rest[i + 1] === undefined) {
          console.error(
            `usage: --actor-slice <subject actor id> [<toReportTimeMs>] [--from <exclusiveFromMs>] [--families <type,type,...>] (${token} given twice or without a value)`,
          );
          process.exit(1);
        }
        options.set(token, rest[i + 1]);
        i += 1;
      } else positional.push(token);
    }
    const familiesAt = options.has("--families") ? 0 : -1;
    const untilRaw = positional[0];
    const untilMs = untilRaw === undefined ? null : Number(untilRaw);
    const fromMs = options.has("--from") ? Number(options.get("--from")) : null;
    if (
      !Number.isSafeInteger(subject) ||
      (untilMs !== null && !Number.isSafeInteger(untilMs)) ||
      (fromMs !== null && !Number.isSafeInteger(fromMs)) ||
      (fromMs !== null && untilMs !== null && !(fromMs < untilMs)) ||
      positional.length > 1
    ) {
      console.error(
        "usage: --actor-slice <subject actor id> [<toReportTimeMs>] [--from <exclusiveFromMs>] [--families <type,type,...>]  (from < to)",
      );
      process.exit(1);
    }
    let families = null;
    if (familiesAt !== -1) {
      const selection = parseFamilySelection(options.get("--families"));
      if (!selection.ok) {
        console.error(selection.error);
        process.exit(1);
      }
      families = selection.families;
    }
    sliced = actorSlice(events, subject, untilMs, families, fromMs);
  } else if (mode === "--decision-slice") {
    const subject = Number(countRaw);
    const targets = String(args[4] ?? "")
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
    const limit = Number(args[4] ?? 3);
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

  const bytes = serializeSlice(sliced, compact);

  const lowered = bytes.toLowerCase();
  const offender = FORBIDDEN.find((needle) => lowered.includes(needle));
  if (offender !== undefined) {
    console.error(`refusing to write: output contains a credential-shaped value (${offender})`);
    process.exit(1);
  }

  const outputPath = `${OUTPUT_ROOT}/${outputName}`;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, bytes, "utf8");

  // The corpus digest policy: SHA-256 over the bytes with CRLF folded to LF.
  const canonical = Buffer.from(bytes.replaceAll("\r\n", "\n"), "utf8");
  console.log(`wrote ${outputPath}`);
  console.log(`  events:     ${sliced.length} of ${events.length}`);
  console.log(`  types:      ${JSON.stringify(typeCounts)}`);
  console.log(`  sha256:     ${createHash("sha256").update(canonical).digest("hex")}`);
  console.log(`  byteLength: ${canonical.length}`);
  if (ownedPetReport !== null) console.log(`  ownedPets:  ${JSON.stringify(ownedPetReport)}`);
  console.log(
    `  tooling:    { name: "scripts/sanitize-probe.mjs", revision: "${SANITIZER_REVISION}", invocation: "${argv.join(" ")}" }`,
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
