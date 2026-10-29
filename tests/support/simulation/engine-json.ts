/**
 * M11-G4-6: compare two raw SimulationCraft JSON reports as ENGINE OUTPUT
 * (scripts/bench/m11g46-functional-reproduction.bench.ts).
 *
 * `engineView` removes only what is not an engine result:
 * - `timestamp`;
 * - `build_date`/`build_time` (simc-build/1 and /2 take them from the build
 *   host's clock);
 * - `sim.statistics` (wall-clock and CPU time).
 *
 * `differingPaths` is a full structural comparison. Container kinds (object,
 * array, null, primitive), array lengths, object key sets, empty containers
 * and every primitive (`Object.is`) must agree. It returns the differing
 * paths; empty means identical.
 */

type Json = unknown;

export function engineView(raw: string): Record<string, unknown> {
  const json = JSON.parse(raw) as Record<string, unknown>;
  delete json["timestamp"];
  delete json["build_date"];
  delete json["build_time"];
  const sim = json["sim"];
  if (sim !== null && typeof sim === "object" && !Array.isArray(sim)) {
    delete (sim as Record<string, unknown>)["statistics"];
  }
  return json;
}

const kind = (value: Json): string =>
  value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : typeof value === "object"
        ? "object"
        : "primitive";

export function differingPaths(a: Json, b: Json, path = "$", out: string[] = []): string[] {
  const kindA = kind(a);
  if (kindA !== kind(b)) {
    out.push(`${path} (${kindA} vs ${kind(b)})`);
    return out;
  }
  if (kindA === "array") {
    const left = a as Json[];
    const right = b as Json[];
    if (left.length !== right.length) out.push(`${path}.length (${left.length} vs ${right.length})`);
    for (let i = 0; i < Math.min(left.length, right.length); i++)
      differingPaths(left[i], right[i], `${path}[${i}]`, out);
    return out;
  }
  if (kindA === "object") {
    const left = a as Record<string, Json>;
    const right = b as Record<string, Json>;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key))
        out.push(`${path}.${key} (missing on ${Object.hasOwn(left, key) ? "b" : "a"})`);
      else differingPaths(left[key], right[key], `${path}.${key}`, out);
    }
    return out;
  }
  if (!Object.is(a, b)) out.push(path);
  return out;
}

/** Number of primitive leaves (for reporting the size of a comparison). */
export function primitiveLeafCount(value: Json): number {
  const k = kind(value);
  if (k === "array") return (value as Json[]).reduce<number>((n, child) => n + primitiveLeafCount(child), 0);
  if (k === "object") {
    return Object.values(value as Record<string, Json>).reduce<number>(
      (n, child) => n + primitiveLeafCount(child),
      0,
    );
  }
  return 1;
}
