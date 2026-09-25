/**
 * Brewmaster Monk's reviewed NON_GCD transition contracts (M11-C2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD
 * entry fire hypothetically and rescans from the root; it does that only
 * under a contract that names what the execution WRITES, in words a reviewer
 * can check against the pinned source. No contract, no branch: the query
 * refuses rather than guessing what the action would have changed.
 *
 * ONE CONTRACT, DELIBERATELY. Under the class/spec authority boundary every
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

export type BrewmasterTransitionWrite = "OWN_PREFIX_AVAILABILITY";

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

export const BREWMASTER_NON_GCD_TRANSITIONS: readonly BrewmasterNonGcdTransitionContract[] = Object.freeze([
  AUTO_ATTACK,
]);

/** The contract for a token, or `null` when this milestone reviewed none. */
export function brewmasterTransitionContractFor(
  simcToken: string,
): BrewmasterNonGcdTransitionContract | null {
  return BREWMASTER_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
