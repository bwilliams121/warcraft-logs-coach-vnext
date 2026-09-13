/**
 * The two profiles an authority decision rests on, kept apart on purpose.
 *
 * SimulationCraft answers "what should this player do" from more than the APL.
 * It also reads the player's GEAR and RACE, and the SIMULATION's configuration —
 * which external buffs are available, how much cooldown queueing is tolerated.
 * Those come from different authorities and can be unknown independently, so
 * merging them into one object would hide which one a verdict actually used.
 *
 *     ObservedPlayerProfile       what the LOG says about the player
 *     AuthoritySimulationProfile  what the pinned AUTHORITY says about the sim
 *
 * WHY THE SPLIT IS LOAD-BEARING AND NOT TIDINESS
 *
 * Two of the facts C3c2 needs are not knowable from the same place:
 *
 *     equipped items   Warcraft Logs `combatantinfo`. Real, per fight.
 *     race             Warcraft Logs does not expose it AT ALL — not on
 *                      `ReportActor`, not on `Character`, not in
 *                      `playerDetails`, not in `combatantinfo`.
 *     external pool    Not a log fact in any form. It is a SimulationCraft
 *                      option with an empty default.
 *     cooldown tolerance  Likewise: a sim option, default 250 ms.
 *
 * A single "profile known" flag over that mixture would be false comfort. So
 * every field carries its own source, and `race` has an explicit UNKNOWN that
 * needs no placeholder — a caller must never be forced to invent a race to
 * construct a profile.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * Talents and spec stay where M5-C2 put them. Moving them would be churn for
 * appearance, and nothing in C3c2 reads them through this type.
 */

/** Where a profile fact came from. Recorded per field, never per object. */
export type ProfileFactSource =
  /** Observed in the analysed Warcraft Logs report. */
  | "WCL_OBSERVED"
  /** The pinned SimulationCraft configuration default, with no override supplied. */
  | "PINNED_SIMC_DEFAULT"
  /** Neither source establishes it. */
  | "UNAVAILABLE";

export const PROFILE_FACT_SOURCES = [
  "WCL_OBSERVED",
  "PINNED_SIMC_DEFAULT",
  "UNAVAILABLE",
] as const satisfies readonly ProfileFactSource[];

/** One equipped item, addressed the way SimulationCraft addresses it. */
export interface EquippedItem {
  /**
   * The SimulationCraft slot token, e.g. `trinket1`, or `null`.
   *
   * `null` means the item IS equipped but which slot it occupies was not
   * established. That is a third state, and collapsing it into "absent" would
   * let an unresolved slot read as an empty one — the exact
   * missing-data-becomes-negative-evidence failure this project exists to
   * prevent. `slotOccupancy` is what keeps the three apart.
   */
  readonly slot: string | null;
  /** The numeric item id. THE identity; display names are never compared. */
  readonly itemId: number;
}

/**
 * The player's race, when it is known.
 *
 * A union rather than `string | null` so `UNKNOWN` is a state a caller writes
 * down. Warcraft Logs supplies no race, so `UNKNOWN` is the honest value for
 * every log-derived profile today — and an action whose existence depends on
 * race must report UNKNOWN applicability rather than being quietly dropped.
 */
export type ProfileRace =
  | { readonly state: "KNOWN"; readonly raceToken: string; readonly source: ProfileFactSource }
  | { readonly state: "UNKNOWN"; readonly detail: string };

/**
 * What the log establishes about the player.
 *
 * `equippedItems` is a LIST of slot/id pairs rather than a map so it stays
 * JSON-safe and order-stable, and so an absent slot is genuinely absent rather
 * than a key holding `undefined`.
 */
export interface ObservedPlayerProfile {
  readonly actorId: number;
  readonly equippedItems: readonly EquippedItem[];
  readonly equippedItemsSource: ProfileFactSource;
  /**
   * The slot tokens this profile is able to speak about at all.
   *
   * A token absent from this list yields `NOT_RESOLVED`, never `EMPTY`. The two
   * are different facts with different consequences: an empty slot makes a
   * `use_items` entry inapplicable, while an unresolved one makes it UNKNOWN.
   */
  readonly resolvedSlots: readonly string[];
  readonly race: ProfileRace;
}

/**
 * A configured external-buff source, as SimulationCraft's `external_buffs.pool`
 * would express it.
 *
 * The pinned default is an EMPTY pool, and that emptiness is what makes
 * `invoke_external_buff` permanently unready. An empty array is therefore a
 * meaningful authoritative value, not a missing one — which is why the pool has
 * its own source field rather than being inferred from length.
 */
export interface ExternalBuffPoolEntry {
  readonly buffName: string;
  readonly cooldownSeconds: number;
  readonly count: number;
}

export interface AuthoritySimulationProfile {
  /**
   * `external_buffs.pool`, parsed.
   *
   * EMPTY under the pinned default. See `external-buff-authority.ts` for the
   * initialization sequence that makes an empty pool decisive.
   */
  readonly externalBuffPool: readonly ExternalBuffPoolEntry[];
  readonly externalBuffPoolSource: ProfileFactSource;
  /**
   * `cooldown_tolerance`, in MILLISECONDS.
   *
   * SimulationCraft treats a cooldown as ready once it is within this much of
   * expiring (`cooldown_t::is_ready` -> `queueable()`), so it is an INPUT to any
   * readiness claim, never a constant inside one. `null` means unestablished,
   * and a bridge handed `null` must return UNKNOWN rather than picking a value.
   */
  readonly cooldownToleranceMs: number | null;
  readonly cooldownToleranceSource: ProfileFactSource;
}

/** Both halves, as one argument. Neither is optional: a caller states both. */
export interface AuthorityPlayerProfile {
  readonly observed: ObservedPlayerProfile;
  readonly simulation: AuthoritySimulationProfile;
}

/**
 * What a profile can say about one slot. THREE answers, never two.
 *
 * `EMPTY` is a positive claim — this profile resolves the slot and nothing is
 * in it. `NOT_RESOLVED` is the absence of a claim. A caller that treated them
 * alike would report an unequipped trinket for a slot it simply could not read.
 */
export type SlotOccupancy =
  | { readonly state: "OCCUPIED"; readonly item: EquippedItem }
  | { readonly state: "EMPTY" }
  | { readonly state: "NOT_RESOLVED"; readonly detail: string };

export function slotOccupancy(profile: ObservedPlayerProfile, slot: string): SlotOccupancy {
  const item = profile.equippedItems.find((entry) => entry.slot === slot);
  if (item !== undefined) return { state: "OCCUPIED", item };
  if (profile.resolvedSlots.includes(slot)) return { state: "EMPTY" };
  return {
    state: "NOT_RESOLVED",
    detail: "the observed profile does not resolve this slot, which is not the same as the slot being empty",
  };
}

/** Whether a specific item id is equipped anywhere. Numeric comparison only. */
export function isItemEquipped(profile: ObservedPlayerProfile, itemId: number): boolean {
  return profile.equippedItems.some((item) => item.itemId === itemId);
}

/**
 * A race nobody established.
 *
 * Provided as a constructor so the honest value is the easy one to write, and a
 * caller is never tempted to pass a plausible-looking token instead.
 */
export function unknownRace(detail: string): ProfileRace {
  return { state: "UNKNOWN", detail };
}
