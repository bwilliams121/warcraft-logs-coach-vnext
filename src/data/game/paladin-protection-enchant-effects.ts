/**
 * Protection Paladin's pinned enchant and gem use-effect facts (M10-C,
 * correction 1).
 *
 * THE PALADIN BINDING OF THE SHARED ENCHANT-EFFECT ARTIFACT: every permanent
 * enchant, temporary enchant and gem the M10-B subject's combatant info
 * reports, pinned as use / no-use from the same commit as the item facts.
 * This module imports no Rogue data and knows no Paladin ability.
 *
 * WHY IT IS NEEDED AT ALL. `use_items` without `slots=` creates a sub-action
 * for a worn slot when the item, a gem, OR an enchant carries a use effect.
 * The item artifact pins the first; without this one the claim "exactly one
 * worn slot produces a sub-action" would rest on two of three sources, and
 * the transition contract for `use_items` could not honestly be admitted.
 *
 * FAIL CLOSED. An enchant or gem id that is not pinned here is not "no use
 * effect"; the caller must treat it as unresolved.
 */

import artifact from "./paladin-protection-enchant-effects.json";
import {
  omittedKeyVerdictsOf,
  validateEnchantEffectArtifact,
  type EnchantEffectArtifact,
  type EnchantEffectRow,
  type OmittedKeyVerdicts,
} from "./enchant-effect-artifact.js";

export const PROTECTION_PALADIN_ENCHANT_DATASET_ID = "SIMC_DBC_PALADIN_PROTECTION_ENCHANT_USE_EFFECTS";

export type EnchantEffectDataLoad =
  | { readonly ok: true; readonly artifact: EnchantEffectArtifact }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

interface LoadedIndex {
  readonly byEnchantId: ReadonlyMap<number, EnchantEffectRow>;
  readonly byGemItemId: ReadonlyMap<number, EnchantEffectRow>;
}

let cached: { readonly load: EnchantEffectDataLoad; readonly index: LoadedIndex | null } | null = null;

function load(): { readonly load: EnchantEffectDataLoad; readonly index: LoadedIndex | null } {
  if (cached !== null) return cached;
  const validation = validateEnchantEffectArtifact(artifact);
  if (!validation.ok) {
    cached = { load: { ok: false, reason: validation.reason, detail: validation.detail }, index: null };
    return cached;
  }
  const byEnchantId = new Map<number, EnchantEffectRow>();
  const byGemItemId = new Map<number, EnchantEffectRow>();
  for (const row of validation.artifact.enchants) byEnchantId.set(row.enchantId, row);
  for (const gem of validation.artifact.gems) byGemItemId.set(gem.itemId, gem.enchant);
  cached = { load: { ok: true, artifact: validation.artifact }, index: { byEnchantId, byGemItemId } };
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedProtectionPaladinEnchantEffects(): EnchantEffectDataLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetProtectionPaladinEnchantEffectsCache(): void {
  cached = null;
}

/** Whether an enchant id creates a use sub-action; `null` when the id is not pinned. */
export function protectionEnchantCreatesUseEffect(enchantId: number): boolean | null {
  return load().index?.byEnchantId.get(enchantId)?.createsUseEffect ?? null;
}

/**
 * The pinned universe's verdicts on OMITTED gear keys, or `null` when the
 * artifact did not load. A `null` closes nothing.
 */
export function protectionOmittedKeyVerdicts(): OmittedKeyVerdicts | null {
  const loaded = load().load;
  return loaded.ok ? omittedKeyVerdictsOf(loaded.artifact.useEffectUniverse) : null;
}

/** Whether a gem ITEM id creates a use sub-action; `null` when the gem is not pinned. */
export function protectionGemCreatesUseEffect(gemItemId: number): boolean | null {
  return load().index?.byGemItemId.get(gemItemId)?.createsUseEffect ?? null;
}
