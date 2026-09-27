/**
 * Brewmaster Monk's reviewed NON_GCD transition contracts (M11-C2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD
 * entry fire hypothetically and rescans from the root; it does that only
 * under a contract that names what the execution WRITES, in words a reviewer
 * can check against the pinned source. No contract, no branch: the query
 * refuses rather than guessing what the action would have changed.
 *
 * M11-C4i ADDS `purifying_brew`, reopening the M11-C3b decision
 * (KEEP_PURIFYING_BREW_UNKNOWN) only to model the DETERMINISTIC part of its
 * transition, now that the audit shows it useful downstream: its own shared
 * internal cooldown (both of its entries unusable at zero elapsed time) and
 * the one probabilistic write, Empty Barrel, FORGOTTEN — never bound up. See
 * the contract below. Black Ox Brew and Fortifying Brew still refuse.
 *
 * ONE CONTRACT, DELIBERATELY (M11-C2). Under the class/spec authority boundary every
 * racial, potion and item-use entry of the pinned list is OUTSIDE the
 * rotational decision domain and is classified non-applicable BEFORE
 * selection (`src/specs/monk/brewmaster/domain-boundary.ts`), so none of
 * them needs one. Of the in-domain entries, four tokens are `_gcd` 0 in the
 * pinned dataset — `auto_attack` (default[0]) and the three NON_GCD brews,
 * `purifying_brew`, `black_ox_brew` and `fortifying_brew`. Only
 * `auto_attack` is reviewed here, because only its execution writes nothing
 * any pinned entry reads.
 *
 * THE BREWS HAVE NO CONTRACT, AND THAT IS A MEASURED GAP, NOT AN OVERSIGHT.
 * Each brew executes through `brew_t` and writes state the pinned list reads
 * elsewhere: Black Ox Brew resets the Purifying and Celestial brew cooldowns
 * and gains Energy (sc_monk.cpp:3118-3133), which
 * `cooldown.celestial_brew.charges_fractional` and `energy` read on the very
 * next root scan; Purifying Brew triggers Ox Stance and Aspect of Harmony and
 * purifies Stagger (:3505-3518), and a successful brew
 * cast MAY proc Empty Barrel, which `buff.empty_barrel.up` reads in six
 * Shado-Pan gates. MAY, not does: the Bring Me Another callback (:6911-6919)
 * is built by `create_proc_callback`, which copies the driver's DBC proc
 * chance (:6630ff), and the pinned driver 1265129 carries `_proc_chance` 20
 * with no override — a 20% chance per brew cast, so the value after a
 * hypothetical brew is one of two, never known. The committed capture agrees:
 * of three Purifying Brews (+8,084, +13,179, +16,263) only the last is
 * followed by an Empty Barrel application. A contract claiming "writes
 * nothing later read" would be false for all three, and modelling what they
 * DO write is the brew container this milestone does not build. A branch that
 * selects one
 * therefore refuses, and the decision is UNKNOWN with the brew named.
 *
 * WHAT THE CONTRACT DOES NOT SAY: that the entry was USABLE. It says what
 * firing it would change, so the query can explore the world in which it
 * fires beside the world in which it does not.
 */

import { SC_MONK_CPP_SHA256 } from "./monk-brewmaster-readiness-authority.js";

/**
 * What a hypothetical execution writes, named so the adapter applies exactly
 * these and nothing else:
 *
 *   OWN_PREFIX_AVAILABILITY    the executed entry cannot fire again at zero elapsed time
 *   SHARED_INTERNAL_COOLDOWN   EVERY entry naming the token cannot fire again at zero
 *                              elapsed time (a cooldown shared by name across entries)
 *   FORGETS_UNOBSERVED_BUFFS   each buff in `forgetsBuffsUnlessObservedUp` becomes unknown
 *                              unless the decision's own evidence already binds it UP: the
 *                              execution MAY make it up, and nothing says it did
 */
export type BrewmasterTransitionWrite =
  "OWN_PREFIX_AVAILABILITY" | "SHARED_INTERNAL_COOLDOWN" | "FORGETS_UNOBSERVED_BUFFS";

export interface BrewmasterTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface BrewmasterNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly BrewmasterTransitionWrite[];
  /** The `buff.<name>.up` atoms FORGETS_UNOBSERVED_BUFFS forgets. Empty unless that write is named. */
  readonly forgetsBuffsUnlessObservedUp: readonly string[];
  readonly claims: readonly BrewmasterTransitionClaim[];
}

const MODULE = "engine/class_modules/monk/sc_monk.cpp";

const claim = (symbol: string, lines: string, text: string): BrewmasterTransitionClaim => ({
  sourcePath: MODULE,
  sourceSha256: SC_MONK_CPP_SHA256,
  symbol,
  lines,
  claim: text,
});

const AUTO_ATTACK: BrewmasterNonGcdTransitionContract = {
  simcToken: "auto_attack",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  forgetsBuffsUnlessObservedUp: [],
  claims: [
    claim(
      "auto_attack_t::auto_attack_t",
      "2293-2305",
      'Built with no spell record (monk_melee_attack_t( player, "auto_attack" )) and trigger_gcd = 0_ms: no ' +
        "GCD, no cost, no cooldown. The constructor only registers the swing actions.",
    ),
    claim(
      "auto_attack_t::execute; monk_action_t<Base>::execute",
      "2317-2325; 427-435",
      "Schedules main_hand_attack->schedule_execute() (and the off-hand's) and calls the base execute, whose " +
        "only Monk addition is Combo Strikes for a WINDWALKER. No buff is triggered, no resource is gained, no " +
        "cooldown is started, and no APL atom the pinned Brewmaster list reads is written. The swing itself is " +
        "a later event the log reports separately, never a write of this entry.",
    ),
    claim(
      "auto_attack_t::ready",
      "2307-2315",
      "Ready only while within 5 yards of movement and no swing is scheduled. Once executed in a branch the " +
        "swing IS scheduled, so the entry cannot be selected again at zero elapsed time — " +
        "SIMULATED_PREFIX_EXECUTION.",
    ),
  ],
};

/**
 * `purifying_brew` (M11-C4i). What a hypothetical Purifying Brew writes that
 * the pinned list reads, and nothing it does not:
 *
 *   - its OWN availability, across BOTH of its entries (`shado_pan[2]`,
 *     `shado_pan[8]`, and the Master of Harmony entry): the DBC `_cooldown`
 *     of 1,000 ms on a two-charge spell is an INTERNAL cooldown shared by name
 *     (M11-C3b), so no entry can fire again at zero elapsed time;
 *   - `buff.empty_barrel`: a brew cast MAY proc it (Bring Me Another, a 20%
 *     proc — M11-C3b), so after the branch it is UNKNOWN unless the decision's
 *     own evidence already binds it UP. It is NEVER bound up because the proc
 *     could occur.
 *
 * Everything else it writes is read by no pinned gate of either list:
 * Ox Stance, the Stagger purify, Elixir of Determination and the Gai Plin's
 * heal, and `brew_t::execute`'s Swift as a Coursing River, Pretense of
 * Instability and Special Delivery; Aspect of Harmony is read only through
 * Master of Harmony atoms no binding supplies (they stay unknown). It costs no
 * resource (no `__spellpower_data` row). The Empty Barrel proc can reset Keg
 * Smash under Bring Me Another tier 2 — which only makes Keg Smash MORE ready,
 * so no positive readiness proof is invalidated, and no NOT_READY fact for Keg
 * Smash exists to invalidate.
 *
 * WHAT IT DOES NOT SAY: that Purifying Brew was usable. Its `ready()` needs
 * Stagger ticking, which is not modelled; the query explores the world in
 * which it fires beside the one in which it does not.
 */
const PURIFYING_BREW: BrewmasterNonGcdTransitionContract = {
  simcToken: "purifying_brew",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY", "SHARED_INTERNAL_COOLDOWN", "FORGETS_UNOBSERVED_BUFFS"],
  forgetsBuffsUnlessObservedUp: ["empty_barrel"],
  claims: [
    claim(
      "purifying_brew_t::purifying_brew_t; purifying_brew_t::execute",
      "3487-3496; 3505-3527",
      "Built as brew_t<monk_spell_t>( player, \"purifying_brew\", talent.brewmaster.purifying_brew ) with use_off_gcd; execute calls brew_t::execute, then triggers ox_stance, adds to aspect_of_harmony, purifies Stagger, sets elixir_of_determination's value and may execute the Gai Plin's heal. No pinned gate of either hero-tree list reads any of those.",
    ),
    claim(
      "brew_t<base_action_t>::execute",
      "4158-4166",
      "base execute, then swift_as_a_coursing_river, pretense_of_instability and action.special_delivery. No pinned gate reads any of them.",
    ),
    claim(
      "Bring Me Another proc callback (M11-C3b)",
      "6630ff; 6911-6919",
      "A brew cast triggers buff.empty_barrel through a proc callback that copies the pinned driver's 20% proc chance: MAY, not does. After a hypothetical brew, buff.empty_barrel.up is one of two values and is never bound up; it is forgotten unless already observed up. Under Bring Me Another tier 2 the proc resets Keg Smash (:4508-4516), which only makes Keg Smash more ready.",
    ),
    claim(
      "DBC _cooldown on a charge spell (M11-C3b)",
      "action.cpp:710-720; player.cpp:8659",
      "Purifying Brew carries _charges 2, _charge_cooldown 20000 and _cooldown 1000; the 1000 ms becomes an internal cooldown obtained by NAME, so it is shared by every APL entry naming purifying_brew and neither can fire again at zero elapsed time.",
    ),
  ],
};

export const BREWMASTER_NON_GCD_TRANSITIONS: readonly BrewmasterNonGcdTransitionContract[] = Object.freeze([
  AUTO_ATTACK,
  PURIFYING_BREW,
]);

/** The contract for a token, or `null` when this milestone reviewed none. */
export function brewmasterTransitionContractFor(
  simcToken: string,
): BrewmasterNonGcdTransitionContract | null {
  return BREWMASTER_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
