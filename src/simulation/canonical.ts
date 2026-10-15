/**
 * Canonical JSON and SHA-256 for simulation identity (M11-G3-1).
 *
 * Canonical form: object keys sorted by code unit, no whitespace, arrays in
 * order, only JSON-safe values (finite numbers, strings, booleans, null,
 * arrays, plain objects). Anything else throws — an identity hash must never
 * silently drop or coerce a field.
 *
 * Hashing uses WebCrypto (`crypto.subtle`), available in Workers and Node, so
 * the same identity is computed wherever the job is built.
 */

import type { SimulationJob } from "./job.js";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonicalJson: non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  throw new TypeError(`canonicalJson: unsupported value of type ${typeof value}`);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The PROFILE hash covers what the character IS (spec, level, race, talents,
 * gear, consumables). The job carries no name, report code, actor id or path,
 * so none can enter it.
 */
export async function profileHash(character: SimulationJob["character"]): Promise<string> {
  return await sha256Hex(canonicalJson({ kind: "simulation-profile/1", character }));
}

/** The ENVIRONMENT hash covers duration, targets, tank model, raid buffs and Bloodlust. */
export async function environmentHash(environment: SimulationJob["environment"]): Promise<string> {
  return await sha256Hex(canonicalJson({ kind: "simulation-environment/1", environment }));
}
