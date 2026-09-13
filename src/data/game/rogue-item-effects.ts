/**
 * Item use-effects — can this item produce a selectable action at all?
 *
 * The pinned dataset, loaded and validated once. Two lookups, because the APL
 * reaches items two different ways: `use_item,name=<token>` names one, and
 * `use_items,slots=<slot>` names whatever the actor happens to equip.
 *
 * `onUseEffect === null` is the structurally decisive fact: SimulationCraft
 * constructs no usable action for such an item and marks the entry background,
 * so the scan skips it before any readiness or condition check. That is NOT the
 * same as the item being on cooldown, and this module deliberately exposes no
 * accessor that would let a caller blur the two.
 */

import artifact from "./rogue-item-effects.json";
import {
  validateItemEffectArtifact,
  type ItemEffectArtifact,
  type ItemEffectIdentity,
} from "./item-effect-artifact.js";

export type ItemEffectDataLoad =
  | { readonly ok: true; readonly artifact: ItemEffectArtifact }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

interface LoadedIndex {
  readonly artifact: ItemEffectArtifact;
  readonly byItemId: ReadonlyMap<number, ItemEffectIdentity>;
  readonly byToken: ReadonlyMap<string, ItemEffectIdentity>;
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
  const byToken = new Map<string, ItemEffectIdentity>();
  for (const item of validation.artifact.items) {
    byItemId.set(item.itemId, item);
    if (item.simcToken !== null) byToken.set(item.simcToken, item);
  }
  cached = {
    load: { ok: true, artifact: validation.artifact },
    index: { artifact: validation.artifact, byItemId, byToken },
  };
  return cached;
}

/** The pinned item-effect dataset, or the reason it could not be used. */
export function pinnedRogueItemEffects(): ItemEffectDataLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetItemEffectDataCache(): void {
  cached = null;
}

/**
 * The item a `use_item,name=<token>` refers to, or `null` when not modelled.
 *
 * This is what turns an APL token into a NUMBER, so the equipped-gear check can
 * compare ids rather than display names.
 */
export function itemEffectForToken(simcToken: string): ItemEffectIdentity | null {
  return load().index?.byToken.get(simcToken) ?? null;
}

/**
 * The effect record for an equipped item id, or `null` when not modelled.
 *
 * `null` means this dataset carries no entry — never "the item has no on-use
 * effect". A caller must treat it as missing data, which is why applicability
 * reports UNKNOWN rather than NOT_APPLICABLE for an unmodelled item.
 */
export function itemEffectForItemId(itemId: number): ItemEffectIdentity | null {
  return load().index?.byItemId.get(itemId) ?? null;
}
