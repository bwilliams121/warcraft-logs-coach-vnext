/**
 * Protection Paladin's pinned item facts (M10-C, correction 1).
 *
 * THE PALADIN BINDING OF THE SHARED ITEM-EFFECT ARTIFACT. Produced by the
 * same extractor as the Rogue dataset under a `paladin-protection` target,
 * from the same pinned commit and DBC tables, validated by the same
 * `item-effect-artifact.ts`. This module imports no Rogue data.
 *
 * WHAT IS PINNED, AND WHY EVERY WORN ITEM IS
 *
 * The M10-B subject's complete worn equipment (seventeen items; the shirt
 * slot is empty) plus `algethar_puzzle_box`, the one item the pinned APL
 * names by token. `use_items` with no `slots=` builds a sub-action for EVERY
 * worn item with an on-use effect (player.cpp:10331-10357), so the fact the
 * evaluator needs — "exactly this item is the on-use one" — is a claim over
 * the whole equipment. A worn item the dataset did not carry would leave that
 * claim unprovable, and the action profile says so rather than assuming.
 *
 * Exactly one worn item carries an on-use effect: Voracious Heart of Ula'tek
 * (270175), driver 1297761, base cooldown 90,000 ms, base GCD 0. Its
 * machine classification is `OTHER`: the driver applies two `A_MOD_STAT` auras
 * (data_enums.hh:1069) and one `E_DUMMY` effect, and the shared classifier
 * admits only `A_MOD_RATING` as inert. Whether that is inert FOR THE PINNED
 * PROTECTION LIST is a specialization reading, made in
 * `paladin-protection-transition-authority.ts`, not here.
 *
 * NO COOLDOWN-MODIFIER CLAIM. The Rogue artifact carries a reviewed
 * "no Rogue modifier applies to an item cooldown" finding; this one does not,
 * because no such review of the Paladin module was made. An item-use
 * cooldown derived for a Paladin is therefore MODIFIERS_POSSIBLE, i.e.
 * UNKNOWN, until someone reads `sc_paladin*.cpp` for it.
 */

import artifact from "./paladin-protection-item-effects.json";
import {
  validateItemEffectArtifact,
  type ItemEffectArtifact,
  type ItemEffectIdentity,
} from "./item-effect-artifact.js";

export const PROTECTION_PALADIN_ITEM_DATASET_ID = "SIMC_DBC_PALADIN_PROTECTION_ITEM_USE_EFFECTS";

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

/** The pinned dataset, or the reason it could not be used. */
export function pinnedProtectionPaladinItemEffects(): ItemEffectDataLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetProtectionPaladinItemEffectsCache(): void {
  cached = null;
}

/** The identity an APL `use_item,name=<token>` names, or `null` when not pinned. */
export function protectionItemEffectForToken(simcToken: string): ItemEffectIdentity | null {
  return load().index?.byToken.get(simcToken) ?? null;
}

/** The identity of a worn item by NUMBER, or `null` when not pinned. */
export function protectionItemEffectForItemId(itemId: number): ItemEffectIdentity | null {
  return load().index?.byItemId.get(itemId) ?? null;
}
