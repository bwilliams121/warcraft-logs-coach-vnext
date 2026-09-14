/**
 * The ONE place M5-D1 claims an unreadable APL condition does not matter.
 *
 * WHY THIS EXISTS, MEASURED RATHER THAN GUESSED
 *
 * A census of all 42 observed actor-19 decision points in the committed C3c1
 * fixture found the deepest blocker at `items[5] use_items,slots=trinket2` in 28
 * of them. That line's condition reads `variable.trinket_sync_slot` and
 * `trinket.1.cooldown.ready`, neither of which this project supports — and
 * supporting them would mean modelling trinket pairing, which is the general
 * trinket simulation M5-D explicitly does not do.
 *
 * But the condition does not have to be READ for the answer to be known. The
 * entry is NON_GCD, so whether it fires or not the query continues; and if the
 * action it fires writes nothing the scan reads, both worlds reach the same
 * first GCD. The first-GCD engine PROVES that by exploring both branches. All
 * this module has to supply is the evidence that exploring them is sound.
 *
 * FOUR FACTS, ALL FROM PINNED DATA, NONE ASSERTED
 *
 *     LANE          `onUseEffect.baseGcdMs === 0`, machine-extracted from the
 *                   driver spell's `_gcd`. A GCD-consuming item — Algeth'ar
 *                   Puzzle Box is one — is REFUSED here and refused again
 *                   structurally by the first-GCD engine.
 *     WRITES        `onUseEffect.writeClassification === "PLAYER_STAT_BUFF_ONLY"`,
 *                   derived from the effect table: every APPLY_AURA effect is
 *                   `A_MOD_RATING` and every other is `E_DUMMY`. Anything else
 *                   is `OTHER` and is refused.
 *     PROGRESS      the driver's own cooldown, which is minutes, plus the
 *                   prefix model recording the entry as executed. It cannot
 *                   re-fire inside one zero-time query.
 *     TIME          zero. A zero-GCD foreground action schedules its next ready
 *                   event at delta 0; the same reading the potion contract
 *                   rests on.
 *
 * WHY A STAT BUFF CANNOT MATTER HERE
 *
 * Stat ratings move haste, crit, mastery and versatility. Every quantity those
 * change is a rate over ELAPSED TIME — regeneration, tick period, cooldown
 * recovery — and this query advances no time at all. The one snapshot a stat
 * change could touch, `pmultiplier`, is permanently UNKNOWN and is never what
 * decides a supported line. `PLAYER_STAT_BUFF` is for the same reason absent
 * from `PROJECTION_RELEVANT_WRITES` in the transition authority.
 *
 * WHAT THIS DOES NOT COVER, DELIBERATELY
 *
 * `use_item,name=<x>` entries for items the actor does not equip never reach
 * this rule: they are NOT_APPLICABLE and the scan skips them before any
 * condition is considered. Giving an absent action a transition contract would
 * be describing an execution that cannot happen.
 */

import type { AplAction } from "../../../simc/apl-authority.js";
import {
  gateIrrelevant,
  gateIrrelevanceNotEstablished,
  type GateIrrelevance,
} from "../../../simc/action-applicability.js";
import { itemEffectForItemId, itemEffectForToken } from "../../../data/game/rogue-item-effects.js";
import type { ItemOnUseEffect } from "../../../data/game/item-effect-artifact.js";
import { slotOccupancy, type ObservedPlayerProfile } from "../../../simc/authority-profile.js";

/** The two APL shapes that can reach an equipped on-use item. */
const USE_ITEM_TOKEN = "use_item";
const USE_ITEMS_TOKEN = "use_items";

/** `name=` and `slots=` parameters, read from the verbatim action string. */
function namedParameter(actionStringVerbatim: string, key: string): string | null {
  const match = new RegExp(`(?:^|,)${key}=([A-Za-z0-9_]+)`).exec(actionStringVerbatim);
  return match?.[1] ?? null;
}

/** The on-use effect an entry would fire, or `null` when it cannot be resolved. */
function onUseEffectFor(profile: ObservedPlayerProfile, action: AplAction): ItemOnUseEffect | null {
  if (action.actionToken === USE_ITEM_TOKEN) {
    const token = namedParameter(action.actionStringVerbatim, "name");
    if (token === null) return null;
    return itemEffectForToken(token)?.onUseEffect ?? null;
  }
  if (action.actionToken === USE_ITEMS_TOKEN) {
    const slot = namedParameter(action.actionStringVerbatim, "slots");
    if (slot === null) return null;
    const occupancy = slotOccupancy(profile, slot);
    // An EMPTY or unresolved slot yields no effect. Both are correctly refusals
    // here: an empty slot is already NOT_APPLICABLE upstream, and an unresolved
    // one is a gap in the profile rather than an inert action.
    if (occupancy.state !== "OCCUPIED") return null;
    return itemEffectForItemId(occupancy.item.itemId)?.onUseEffect ?? null;
  }
  return null;
}

export interface ItemGateIrrelevanceInput {
  readonly observed: ObservedPlayerProfile;
}

/**
 * Whether this entry's unreadable condition can be stepped past.
 *
 * Returns `NOT_ESTABLISHED` for everything it cannot fully establish, which is
 * the default and the safe direction: the scan then blocks exactly as it did
 * before M5-D1.
 */
export function resolveItemGateIrrelevance(
  input: ItemGateIrrelevanceInput,
  action: AplAction,
): GateIrrelevance {
  const onUse = onUseEffectFor(input.observed, action);
  if (onUse === null) return gateIrrelevanceNotEstablished();

  // LANE. A GCD-consuming item ends the query rather than preceding its answer,
  // so the two worlds do not converge and nothing here may claim they do.
  if (onUse.baseGcdMs !== 0) return gateIrrelevanceNotEstablished();

  // WRITES. Anything but a pure stat buff is unreviewed, and unreviewed is a
  // refusal rather than an optimistic default.
  if (onUse.writeClassification !== "PLAYER_STAT_BUFF_ONLY") return gateIrrelevanceNotEstablished();

  // PROGRESS. A cooldown measured in minutes, so the entry cannot re-fire inside
  // one zero-elapsed-time query even before the prefix model records it.
  if (!(onUse.baseCooldownMs > 0)) return gateIrrelevanceNotEstablished();

  return gateIrrelevant({
    lane: "NON_GCD",
    transitionProvenance: "src/data/game/assassination-transition-authority.ts itemUseTransition",
    timeAdvanceMs: 0,
    progressMechanism: `COOLDOWN:${String(onUse.baseCooldownMs)}ms on driver spell ${String(onUse.effectSpellId)}`,
    writesReviewed: true,
    writesOutsideDecisionProjection: true,
    detail:
      `the on-use driver ${String(onUse.effectSpellId)} carries _gcd 0 and only A_MOD_RATING / E_DUMMY ` +
      "effects, so executing it puts stat ratings on the player and does nothing else. Every quantity a " +
      "stat rating moves is a rate over elapsed time, and this query advances none, so neither world " +
      "reaches a different first GCD. The condition itself is NOT evaluated and is NOT claimed true.",
  });
}
