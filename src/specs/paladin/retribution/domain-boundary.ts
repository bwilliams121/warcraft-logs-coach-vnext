/**
 * The class/spec authority boundary of the Retribution analyzer (M11-A4).
 *
 * THE POLICY, adopted by the product owner on 2026-09-18: the analyzer
 * evaluates class/spec/hero-talent ROTATIONAL gameplay. Entries of the pinned
 * list that are not class/spec actions — racial actions, potions, item uses,
 * profession actions, externally supplied buffs, other non-class/spec
 * preparation entries — are OUTSIDE THE ROTATIONAL DECISION DOMAIN and
 * cannot preempt a supported class/spec action. They stay in the pinned
 * artifact for provenance and are classified non-domain BEFORE rotational
 * authority selection.
 *
 * WHAT THIS IS, AND IS NOT
 *
 * A DOMAIN-BOUNDARY DECISION. It is not a claim that the player could not
 * have used a potion or that the trinket was on cooldown; nothing here reads
 * race, faction, gear or consumables, and nothing here infers any of them.
 * The scan skips a non-domain entry exactly as it skips a background action
 * (`OUTSIDE_SUPPORTED_DECISION_DOMAIN`, recorded on the step), and the
 * meaning of MATCH follows: the observed class/spec action is compatible
 * with the pinned class/spec rotational authority AFTER the non-domain
 * entries are excluded — never "the exact next action the complete
 * SimulationCraft profile would execute including racials, items and
 * consumables".
 *
 * GENERIC BY CONSTRUCTION. The classification is by TOKEN CATEGORY, read off
 * the pinned sources: the racial tokens are `player_t::get_racial_actions()`
 * (player.cpp:2407-2420), the item and consumable meta-actions are the
 * spell-less tokens the pinned lane dataset records under their player.cpp /
 * consumable.cpp constructors, and `invoke_external_buff` is the external
 * pool action. No race, no actor and no item is special-cased.
 */

import type { AplAction } from "../../../simc/apl-authority.js";
import { notApplicable, type ActionApplicability } from "../../../simc/action-applicability.js";

export type NonDomainCategory =
  "RACIAL_ACTION" | "CONSUMABLE" | "ITEM_USE" | "PROFESSION_ACTION" | "EXTERNAL_BUFF";

/**
 * `player_t::get_racial_actions()` at the pin (player.cpp:2407-2420): every
 * token the shared action factory dispatches to a `racial_spell_t`.
 */
export const RACIAL_ACTION_TOKENS = Object.freeze([
  "blood_fury",
  "berserking",
  "arcane_torrent",
  "lights_judgment",
  "fireblood",
  "ancestral_call",
  "bag_of_tricks",
  "thorn_bloom",
] as const);

/** Consumable meta-actions (consumable.cpp): potions and their kin. */
export const CONSUMABLE_TOKENS = Object.freeze([
  "potion",
  "flask",
  "food",
  "augmentation",
  "healthstone",
] as const);

/** Item-use meta-actions (player.cpp use_item_t / use_items_t). */
export const ITEM_USE_TOKENS = Object.freeze(["use_item", "use_items", "cancel_buff"] as const);

/** `player_t::get_profession_actions()` is empty at the pin (player.cpp:2400-2405); kept as a named, empty category. */
export const PROFESSION_ACTION_TOKENS = Object.freeze([] as const);

/** The externally supplied buff action (player.cpp:10889). */
export const EXTERNAL_BUFF_TOKENS = Object.freeze(["invoke_external_buff"] as const);

const CATEGORY_OF: ReadonlyMap<string, NonDomainCategory> = new Map<string, NonDomainCategory>([
  ...RACIAL_ACTION_TOKENS.map((token): [string, NonDomainCategory] => [token, "RACIAL_ACTION"]),
  ...CONSUMABLE_TOKENS.map((token): [string, NonDomainCategory] => [token, "CONSUMABLE"]),
  ...ITEM_USE_TOKENS.map((token): [string, NonDomainCategory] => [token, "ITEM_USE"]),
  ...PROFESSION_ACTION_TOKENS.map((token): [string, NonDomainCategory] => [token, "PROFESSION_ACTION"]),
  ...EXTERNAL_BUFF_TOKENS.map((token): [string, NonDomainCategory] => [token, "EXTERNAL_BUFF"]),
]);

/** The non-domain category of a token, or `null` when the token is a class/spec action. */
export function nonDomainCategoryOf(actionToken: string): NonDomainCategory | null {
  return CATEGORY_OF.get(actionToken) ?? null;
}

const POLICY =
  "M11-A4 class/spec authority boundary (2026-09-18): the Retribution analyzer evaluates class/spec " +
  "rotational gameplay, and an entry of this category cannot preempt a class/spec action. This is a " +
  "domain-boundary decision, not an availability claim: the entry may have been usable, and nothing about " +
  "race, faction, gear or consumables was read or inferred.";

/**
 * The applicability verdict for a non-domain entry, or `null` for a
 * class/spec entry (which the ordinary rules then decide).
 */
export function nonDomainApplicabilityFor(action: AplAction): ActionApplicability | null {
  const category = nonDomainCategoryOf(action.actionToken);
  if (category === null) return null;
  return notApplicable("OUTSIDE_SUPPORTED_DECISION_DOMAIN", {
    itemId: null,
    slot: null,
    pinnedBehaviour: `${category}: '${action.actionToken}' is outside the rotational decision domain. ${POLICY}`,
  });
}
