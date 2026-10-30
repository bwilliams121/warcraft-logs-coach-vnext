/**
 * PREPARATION consumable identities: which spells are a use of the player's
 * health-potion slot, a healthstone, or the combat-potion slot.
 *
 * Machine-extracted from one pinned SimulationCraft commit's client data by
 * scripts/authority/extract-preparation-consumables.mjs. The classification is
 * the client's own shared cooldown categories (health potion 30, combat potion
 * 4), not spell names; healthstones are the direct heals named "Healthstone".
 * Racial abilities are excluded by the extractor and checked again here.
 *
 * A spell absent from the table is NOT known to be a non-consumable: it is
 * outside this data. Callers that would turn absence into a count must say
 * what the table covers (its provenance) and fail closed on a candidate it
 * cannot classify.
 */

import { z } from "zod";

import artifact from "./preparation-consumables.json";

export const PREPARATION_CONSUMABLE_KINDS = ["HEALTH_POTION", "HEALTHSTONE", "COMBAT_POTION"] as const;
export type PreparationConsumableKind = (typeof PREPARATION_CONSUMABLE_KINDS)[number];

const commit = z.string().regex(/^[0-9a-f]{40}$/);

const preparationConsumablesSchema = z
  .object({
    artifactVersion: z.literal(1),
    datasetId: z.literal("PREPARATION_CONSUMABLES"),
    artifactRevision: z.string().min(1),
    provenance: z.object({
      repository: z.literal("https://github.com/simulationcraft/simc"),
      commitSha: commit,
      sources: z
        .array(
          z.object({
            path: z.string().regex(/^engine\//),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
            byteLength: z.number().int().positive(),
          }),
        )
        .length(3),
      clientDataWowVersion: z.string().regex(/^\d+\.\d+\.\d+\.\d+$/),
      method: z.literal("MACHINE_EXTRACTED_SHARED_COOLDOWN_CLASSIFICATION"),
      extractorVersion: z.number().int().positive(),
      rules: z.record(z.string(), z.string()),
    }),
    anchors: z
      .array(
        z.object({
          spellId: z.number().int().positive(),
          name: z.string(),
          kind: z.enum(PREPARATION_CONSUMABLE_KINDS),
        }),
      )
      .min(3),
    consumables: z
      .array(
        z.object({
          spellId: z.number().int().positive(),
          name: z.string().min(1),
          kind: z.enum(PREPARATION_CONSUMABLE_KINDS),
          cooldownCategory: z.number().int().nonnegative(),
          appliesAura: z.boolean(),
          auraDurationMs: z.number().int().positive().nullable(),
        }),
      )
      .min(1),
  })
  .strict();

export type PreparationConsumables = z.infer<typeof preparationConsumablesSchema>;
export type PreparationConsumable = PreparationConsumables["consumables"][number];

export type PreparationConsumablesLoad =
  | {
      readonly ok: true;
      readonly data: PreparationConsumables;
      readonly bySpellId: ReadonlyMap<number, PreparationConsumable>;
      /**
       * The longest combat-potion buff. A combat potion taken before the pull
       * is visible only through its removal; a fight at least this long must
       * contain that removal.
       */
      readonly maxCombatPotionAuraDurationMs: number;
    }
  | { readonly ok: false; readonly detail: string };

let cached: PreparationConsumablesLoad | null = null;

/** Validates the committed artifact once. A malformed artifact is a load failure, never an empty table. */
export function loadPreparationConsumables(raw: unknown = artifact): PreparationConsumablesLoad {
  if (raw === artifact && cached !== null) return cached;
  const parsed = preparationConsumablesSchema.safeParse(raw);
  let result: PreparationConsumablesLoad;
  if (!parsed.success) {
    result = { ok: false, detail: parsed.error.issues.map((issue) => issue.message).join("; ") };
  } else {
    const bySpellId = new Map(parsed.data.consumables.map((entry) => [entry.spellId, entry]));
    const missingAnchor = parsed.data.anchors.find(
      (anchor) => bySpellId.get(anchor.spellId)?.kind !== anchor.kind,
    );
    const kindsPresent = new Set(parsed.data.consumables.map((entry) => entry.kind));
    const combatAuraDurations = parsed.data.consumables
      .filter((entry) => entry.kind === "COMBAT_POTION")
      .map((entry) => entry.auraDurationMs ?? 0);
    if (bySpellId.size !== parsed.data.consumables.length) {
      result = { ok: false, detail: "a spell id is listed twice" };
    } else if (missingAnchor !== undefined) {
      result = {
        ok: false,
        detail: `anchor ${String(missingAnchor.spellId)} is not classified ${missingAnchor.kind}`,
      };
    } else if (PREPARATION_CONSUMABLE_KINDS.some((kind) => !kindsPresent.has(kind))) {
      result = { ok: false, detail: "a consumable kind has no spells" };
    } else {
      result = {
        ok: true,
        data: parsed.data,
        bySpellId,
        maxCombatPotionAuraDurationMs: Math.max(...combatAuraDurations),
      };
    }
  }
  if (raw === artifact) cached = result;
  return result;
}
