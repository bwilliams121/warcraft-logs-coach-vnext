/**
 * Which consumable engine tokens ONE simulation model's engine accepts
 * (M11-G3-4; per model since the M11 model registry), recorded by
 * scripts/bench/m11g34-consumable-tokens.bench.ts on that model's approved
 * binary: each unambiguous rank-option token of the model's consumables, set
 * alone, ACCEPTED when engine initialization completes.
 *
 * A token that matches an item is not proof the engine can build its effect,
 * so an unrecorded or refused token is NOT representable — never assumed to be.
 */

import { z } from "zod";

export const tokenAcceptanceSchema = z.object({
  artifactVersion: z.literal(1),
  datasetId: z.literal("SIMC_CONSUMABLE_TOKEN_ACCEPTANCE"),
  artifactRevision: z.string(),
  provenance: z.object({
    commitSha: z.string().regex(/^[0-9a-f]{40}$/),
    clientDataWowVersion: z.string(),
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

export type ConsumableTokenAcceptance = z.infer<typeof tokenAcceptanceSchema>;
