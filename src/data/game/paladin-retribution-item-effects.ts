/**
 * Retribution Paladin's pinned item facts (M11-A4): the inventory type of
 * the two subjects' main-hand weapons, because `templars_verdict_t` is
 * background unless the main hand is a two-handed weapon
 * (sc_paladin_retribution.cpp:675-676, INVTYPE_2HWEAPON = 17 in
 * data_enums.hh:403).
 *
 * WHAT IS DELIBERATELY NOT HERE. Item USE effects, trinkets and the
 * `algethar_puzzle_box` token: item use is OUTSIDE the Retribution
 * rotational decision domain, so no `use_item` entry is ever resolved
 * against gear and nothing about on-use effects is pinned.
 */

import artifact from "./paladin-retribution-item-effects.json";
import {
  validateItemEffectArtifact,
  type ItemEffectArtifact,
  type ItemEffectIdentity,
} from "./item-effect-artifact.js";

export const RETRIBUTION_PALADIN_ITEM_DATASET_ID = "SIMC_DBC_PALADIN_RETRIBUTION_ITEM_USE_EFFECTS";

/** `INVTYPE_2HWEAPON`, data_enums.hh:403. */
export const INVENTORY_TYPE_TWO_HAND_WEAPON = 17;

export type ItemEffectDataLoad =
  | { readonly ok: true; readonly artifact: ItemEffectArtifact }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

interface LoadedIndex {
  readonly artifact: ItemEffectArtifact;
  readonly byItemId: ReadonlyMap<number, ItemEffectIdentity>;
}

let cached: { readonly load: ItemEffectDataLoad; readonly index: LoadedIndex | null } | null = null;

function load(): { readonly load: ItemEffectDataLoad; readonly index: LoadedIndex | null } {
  if (cached !== null) return cached;
  const validation = validateItemEffectArtifact(artifact);
  if (!validation.ok) {
    cached = { load: { ok: false, reason: validation.reason, detail: validation.detail }, index: null };
    return cached;
  }
  const byItemId = new Map<number, ItemEffectIdentity>();
  for (const item of validation.artifact.items) byItemId.set(item.itemId, item);
  cached = {
    load: { ok: true, artifact: validation.artifact },
    index: { artifact: validation.artifact, byItemId },
  };
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedRetributionPaladinItemEffects(): ItemEffectDataLoad {
  return load().load;
}

/** Test seam. */
export function resetRetributionPaladinItemEffectsCache(): void {
  cached = null;
}

/** The pinned identity of one item, or `null` when the item is not pinned. */
export function retributionItemForItemId(itemId: number): ItemEffectIdentity | null {
  return load().index?.byItemId.get(itemId) ?? null;
}
