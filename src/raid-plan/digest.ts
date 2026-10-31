/**
 * The digest of a normalized raid cooldown plan (M12-E).
 *
 * SHA-256 (hex) of the plan's canonical JSON: object keys sorted by code unit,
 * no whitespace, arrays in order. Two requests carrying the same plan input,
 * through REST or MCP, have the same digest, so a result traces back to
 * exactly the plan it was given. The normalized plan records its format and
 * source lines, so a note and its structured transcription differ.
 *
 * Kept here rather than imported from `src/simulation/canonical.ts`: no
 * analysis path may import the simulation layer
 * (`tests/contracts/m11g3-simulation-layering.test.ts`).
 */

import type { RaidCooldownPlan } from "./raid-cooldown-plan.js";

function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("raid plan digest: non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  throw new TypeError(`raid plan digest: unsupported value of type ${typeof value}`);
}

export async function raidCooldownPlanDigest(plan: RaidCooldownPlan): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(plan)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
