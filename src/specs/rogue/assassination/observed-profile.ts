/**
 * Building an `AuthorityPlayerProfile` out of what the log actually showed.
 *
 * THE ONE HARD PART IS SLOTS
 *
 * Warcraft Logs supplies no slot key on `combatantinfo.gear`. The normalizer
 * says so in as many words — "GEAR SLOT IS POSITIONAL... the slot is the array
 * index and nothing else" — and preserves the index rather than inventing a
 * name for it. Somewhere the index has to become `trinket1`, and this is that
 * place.
 *
 * IT IS DONE BY CHECKING, NOT BY ASSUMING
 *
 * The pinned item artifact carries each item's DBC `inventory_type`. So a gear
 * entry is a trinket when its own pinned row says INVTYPE_TRINKET, not because
 * of where it sits. Position then supplies only the ORDER between the two:
 * SimulationCraft's slot enum puts `SLOT_TRINKET_1` before `SLOT_TRINKET_2`, and
 * the array is in slot order, so the earlier index is `trinket1`.
 *
 * The extractor made that order checkable rather than asserted: it located the
 * inventory-type column by requiring agreement with sixteen anchors spanning
 * fourteen distinct values, drawn from this very gear array. A shirt at index 3
 * and a tabard at index 17 are not where they are by chance.
 *
 * EVERY WAY THIS CAN FAIL, FAILS CLOSED
 *
 * Slots resolve only when EXACTLY two trinkets are found and the artifact
 * carries a row for each. Anything else — one trinket, three, an item the
 * dataset does not know — resolves NO slots at all. `resolvedSlots` is then
 * empty, `slotOccupancy` answers `NOT_RESOLVED` rather than `EMPTY`, and every
 * `use_items` entry becomes UNKNOWN applicability instead of being skipped.
 *
 * Note what is NOT conditional on any of that: `equippedItems` still carries
 * every observed item id. `use_item,name=<token>` asks "is this id equipped
 * anywhere", which needs no slot, so a slot failure cannot silently weaken the
 * named-item answers.
 *
 * RACE IS ALWAYS UNKNOWN, AND THAT IS A FINDING
 *
 * Not a gap to fill later from somewhere convenient. Warcraft Logs exposes race
 * on no queried field: not `ReportActor`, not `Character`, not `playerDetails`,
 * not `combatantinfo`. The racials in `misc_cds` therefore cannot be resolved,
 * and this profile says so instead of guessing.
 */

import type { CombatantSnapshot } from "../../../engine/normalization/normalized-events.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import {
  unknownRace,
  type AuthorityPlayerProfile,
  type AuthoritySimulationProfile,
  type EquippedItem,
  type ObservedPlayerProfile,
} from "../../../simc/authority-profile.js";
import { itemEffectForItemId } from "../../../data/game/rogue-item-effects.js";
import { INVENTORY_TYPE_TRINKET } from "../../../data/game/item-effect-artifact.js";
import { PINNED_DEFAULT_COOLDOWN_TOLERANCE_MS } from "../../../data/game/external-buff-authority.js";

/** The slot tokens the pinned `items` list addresses, in slot order. */
export const TRINKET_SLOT_TOKENS = ["trinket1", "trinket2"] as const;

/** Warcraft Logs exposes no race on any queried field. Stated once, here. */
export const RACE_UNAVAILABLE_DETAIL =
  "Warcraft Logs exposes no race field on ReportActor, Character, playerDetails or combatantinfo, so " +
  "race-dependent applicability cannot be established from this report";

/**
 * Resolves `trinket1`/`trinket2` from a positional gear array, or resolves none.
 *
 * Returns the slot token for each gear index it could name. An index absent from
 * the result is NOT a claim that its slot is empty.
 */
export function resolveTrinketSlots(
  gear: readonly { readonly itemId: number }[],
): ReadonlyMap<number, string> {
  const trinketIndices: number[] = [];
  for (let index = 0; index < gear.length; index += 1) {
    const entry = gear[index];
    if (entry === undefined) continue;
    const identity = itemEffectForItemId(entry.itemId);
    // An item the pinned dataset does not carry cannot be confirmed a trinket.
    // It is not counted, and its presence is why the count check below can fail.
    if (identity === null) continue;
    if (identity.inventoryType === INVENTORY_TYPE_TRINKET) trinketIndices.push(index);
  }

  // Exactly two, or nothing. A player wearing one known and one unknown trinket
  // would otherwise have the known one named `trinket1` on no evidence at all.
  if (trinketIndices.length !== TRINKET_SLOT_TOKENS.length) return new Map();

  const resolved = new Map<number, string>();
  for (let position = 0; position < trinketIndices.length; position += 1) {
    const index = trinketIndices[position];
    const token = TRINKET_SLOT_TOKENS[position];
    if (index === undefined || token === undefined) return new Map();
    resolved.set(index, token);
  }
  return resolved;
}

/** The observed half of the profile, from one `combatantinfo` snapshot. */
export function observedProfileFrom(snapshot: CombatantSnapshot): ObservedPlayerProfile {
  const gear = snapshot.gear;
  const slotByIndex = resolveTrinketSlots(gear);

  const equippedItems: EquippedItem[] = [];
  for (let index = 0; index < gear.length; index += 1) {
    const entry = gear[index];
    if (entry === undefined) continue;
    equippedItems.push({ slot: slotByIndex.get(index) ?? null, itemId: entry.itemId });
  }

  return {
    actorId: snapshot.actorId,
    equippedItems,
    equippedItemsSource: "WCL_OBSERVED",
    // Only the slots actually named. Empty when resolution failed, which makes
    // every slot query NOT_RESOLVED rather than EMPTY.
    resolvedSlots: [...slotByIndex.values()],
    race: unknownRace(RACE_UNAVAILABLE_DETAIL),
  };
}

/**
 * The simulation half, under the pinned configuration with no overrides.
 *
 * The empty external-buff pool is the AUTHORITY'S OWN DEFAULT, which is why its
 * source is `PINNED_SIMC_DEFAULT` and not `UNAVAILABLE`. It is a value, not a
 * gap — and that distinction is exactly what licenses the negative usability
 * verdict on `invoke_external_buff`.
 */
export function pinnedSimulationProfile(): AuthoritySimulationProfile {
  return {
    externalBuffPool: [],
    externalBuffPoolSource: "PINNED_SIMC_DEFAULT",
    cooldownToleranceMs: PINNED_DEFAULT_COOLDOWN_TOLERANCE_MS,
    cooldownToleranceSource: "PINNED_SIMC_DEFAULT",
  };
}

/**
 * Both halves for one actor, or `null` when the log carries no `combatantinfo`.
 *
 * `null` rather than an empty profile: an empty one would report every item as
 * unequipped, turning absent gear data into a pile of NOT_APPLICABLE verdicts.
 * A caller with no profile omits it, and the traversal then makes no
 * applicability claim at all.
 */
export function authorityProfileFor(state: CombatState, actorId: number): AuthorityPlayerProfile | null {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "COMBATANT_INFO") continue;
    if (event.snapshot.actorId !== actorId) continue;
    return { observed: observedProfileFrom(event.snapshot), simulation: pinnedSimulationProfile() };
  }
  return null;
}
