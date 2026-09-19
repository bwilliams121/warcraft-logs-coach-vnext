/**
 * The class-neutral token categories OUTSIDE the rotational decision domain.
 *
 * THE POLICY, adopted by the product owner on 2026-09-18 (M11-A4): the
 * analyzer evaluates class/spec/hero-talent ROTATIONAL gameplay. Entries of a
 * pinned list that are not class/spec actions — racial actions, potions,
 * item uses, profession actions, externally supplied buffs — are outside
 * the rotational decision domain and cannot preempt a supported class/spec
 * action. They stay in the pinned artifact for provenance and are
 * classified non-domain BEFORE rotational authority selection.
 *
 * WHAT THIS MODULE HOLDS, AND WHAT IT DOES NOT
 *
 * The TABLES only, promoted here verbatim from the first consumer's
 * specialization module in M11-B2 when a second specialization needed the
 * identical classification.
 * They are readings of the pinned SHARED sources, not of any class module:
 * the racial tokens are `player_t::get_racial_actions()` (player.cpp:
 * 2407-2420), the item and consumable meta-actions are the spell-less
 * tokens the shared action factory constructs (player.cpp / consumable.cpp),
 * and `invoke_external_buff` is the external pool action (player.cpp:10889).
 * No race, no actor, no item and no specialization is named.
 *
 * Each specialization still OWNS the verdict it issues for a non-domain
 * entry (`src/specs/<class>/<spec>/domain-boundary.ts`): that verdict states
 * the policy in the specialization's own words and is what its scan
 * records. This module says which tokens; the specialization says what it
 * does about them.
 */

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
