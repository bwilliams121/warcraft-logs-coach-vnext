/**
 * Which pinned consumable engine tokens the APPROVED engine accepts
 * (M11-G3-4), recorded by scripts/bench/m11g34-consumable-tokens.bench.ts on
 * the approved binary: each unambiguous rank-option token of
 * consumables.json, set alone, ACCEPTED when engine initialization completes.
 *
 * A token that matches an item is not proof the engine can build its effect,
 * so an unrecorded or refused token is NOT representable — never assumed to
 * be.
 */

import { z } from "zod";

import artifact from "./consumable-token-acceptance.json";

const schema = z.object({
  artifactVersion: z.literal(1),
  datasetId: z.literal("SIMC_CONSUMABLE_TOKEN_ACCEPTANCE"),
  artifactRevision: z.string(),
  provenance: z.object({
    commitSha: z.literal("33622e9d1662ff0e451691edf85a6b49cc9d11d9"),
    clientDataWowVersion: z.literal("12.1.0.69587"),
    binarySha256: z.string().regex(/^[0-9a-f]{64}$/),
    consumablesRevision: z.string(),
    method: z.literal("ENGINE_RUN_PER_TOKEN"),
    bench: z.string(),
  }),
  tokens: z.array(
    z.object({
      kind: z.enum(["FLASK", "FOOD", "POTION", "OTHER", "AMBIGUOUS"]),
      spellId: z.number().int().positive(),
      itemLevel: z.number(),
      token: z.string(),
      accepted: z.boolean(),
      detail: z.string().nullable(),
    }),
  ),
});

export type ConsumableTokenAcceptance = z.infer<typeof schema>;

let cached:
  | { readonly ok: true; readonly data: ConsumableTokenAcceptance }
  | { readonly ok: false; readonly detail: string }
  | null = null;

export function pinnedTokenAcceptance():
  | { readonly ok: true; readonly data: ConsumableTokenAcceptance }
  | { readonly ok: false; readonly detail: string } {
  if (cached !== null) return cached;
  const parsed = schema.safeParse(artifact);
  cached = parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, detail: parsed.error.issues[0]?.message ?? "invalid token-acceptance artifact" };
  return cached;
}

/** True only when the approved engine accepted this token for this consumable aura; otherwise false. */
export function engineAcceptsToken(spellId: number, token: string): boolean {
  const loaded = pinnedTokenAcceptance();
  return (
    loaded.ok &&
    loaded.data.tokens.some((entry) => entry.spellId === spellId && entry.token === token && entry.accepted)
  );
}
