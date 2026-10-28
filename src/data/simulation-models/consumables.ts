/**
 * CONSUMABLE identities of ONE simulation model (M11-G3-2; per model since the
 * M11 model registry), machine-extracted from that model's SimulationCraft
 * data by scripts/authority/extract-simc-consumables.mjs.
 *
 * - temporary enchant id -> the engine's temporary_enchant token and rank;
 * - consumable aura spell id -> kind (FLASK / FOOD / POTION / OTHER) and the
 *   items that apply it. Several items (quality ranks, "Fleeting" variants) may
 *   share one aura, so an aura identifies the consumable, not its rank.
 * - rank options (M11-G3-4): per item level, the engine token that selects it
 *   and whether that selection is unambiguous in that model's data.
 *
 * A spell absent from the table is UNKNOWN to that model — never "not a
 * consumable".
 */

import { z } from "zod";

const commit = z.string().regex(/^[0-9a-f]{40}$/);

export const consumablesSchema = z.object({
  artifactVersion: z.literal(1),
  datasetId: z.literal("SIMC_CONSUMABLES"),
  artifactRevision: z.string(),
  provenance: z.object({
    commitSha: commit,
    clientDataWowVersion: z.string(),
    sources: z
      .array(
        z.object({
          path: z.string().regex(/^engine\//),
          sha256: z.string().regex(/^[0-9a-f]{64}$/),
          byteLength: z.number().int().positive(),
        }),
      )
      .min(1),
    extractorVersion: z.number().int().positive(),
  }),
  temporaryEnchants: z.array(
    z.object({
      enchantId: z.number().int().positive(),
      rank: z.number().int().nonnegative(),
      spellId: z.number().int().nonnegative(),
      baseToken: z.string(),
      token: z.string().regex(/^[a-z][a-z0-9_]*$/),
    }),
  ),
  consumableAuras: z.array(
    z.object({
      spellId: z.number().int().positive(),
      kind: z.enum(["FLASK", "FOOD", "POTION", "OTHER", "AMBIGUOUS"]),
      items: z.array(
        z.object({
          itemId: z.number().int().positive(),
          name: z.string(),
          itemLevel: z.number(),
          quality: z.number(),
          craftingQuality: z.number().int().nonnegative(),
        }),
      ),
      /**
       * M11-G3-4: per distinct item level, an engine token and every item the
       * engine's match predicate could resolve it to. UNAMBIGUOUS only when all
       * candidates apply this aura at this item level.
       */
      rankOptions: z.array(
        z.object({
          itemLevel: z.number(),
          token: z.string().regex(/^[a-z0-9_+.%]+$/),
          candidateItemIds: z.array(z.number().int().positive()),
          unambiguous: z.boolean(),
        }),
      ),
    }),
  ),
});

export type PinnedConsumables = z.infer<typeof consumablesSchema>;
export type ConsumableAura = PinnedConsumables["consumableAuras"][number];
export type TemporaryEnchantIdentity = PinnedConsumables["temporaryEnchants"][number];
