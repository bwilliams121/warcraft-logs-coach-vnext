/**
 * Pinned CONSUMABLE identities (M11-G3-2), machine-extracted from the pinned
 * SimulationCraft data by scripts/authority/extract-simc-consumables.mjs.
 *
 * - temporary enchant id -> the engine's temporary_enchant token and rank;
 * - consumable aura spell id -> kind (FLASK / FOOD / POTION / OTHER) and the
 *   items that apply it. Several items (quality ranks, "Fleeting" variants) may
 *   share one aura, so an aura identifies the consumable, not its rank.
 *
 * - rank options (M11-G3-4): per item level, the engine token that selects it
 *   and whether that selection is unambiguous at the pin.
 *
 * A spell absent from the table is UNKNOWN to the pinned model — never "not a
 * consumable".
 */

import { z } from "zod";

import artifact from "./consumables.json";

const schema = z.object({
  artifactVersion: z.literal(1),
  datasetId: z.literal("SIMC_CONSUMABLES"),
  artifactRevision: z.string(),
  provenance: z.object({
    commitSha: z.literal("33622e9d1662ff0e451691edf85a6b49cc9d11d9"),
    clientDataWowVersion: z.literal("12.1.0.69587"),
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

export type PinnedConsumables = z.infer<typeof schema>;
export type ConsumableAura = PinnedConsumables["consumableAuras"][number];
export type TemporaryEnchantIdentity = PinnedConsumables["temporaryEnchants"][number];

export type ConsumablesLoad =
  { readonly ok: true; readonly data: PinnedConsumables } | { readonly ok: false; readonly detail: string };

let cached: ConsumablesLoad | null = null;

export function pinnedConsumables(): ConsumablesLoad {
  if (cached !== null) return cached;
  const parsed = schema.safeParse(artifact);
  cached = parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, detail: parsed.error.issues[0]?.message ?? "invalid consumables artifact" };
  return cached;
}

export function consumableAuraFor(spellId: number): ConsumableAura | null {
  const loaded = pinnedConsumables();
  return loaded.ok ? (loaded.data.consumableAuras.find((aura) => aura.spellId === spellId) ?? null) : null;
}

export function temporaryEnchantFor(enchantId: number): TemporaryEnchantIdentity | null {
  const loaded = pinnedConsumables();
  return loaded.ok
    ? (loaded.data.temporaryEnchants.find((entry) => entry.enchantId === enchantId) ?? null)
    : null;
}
