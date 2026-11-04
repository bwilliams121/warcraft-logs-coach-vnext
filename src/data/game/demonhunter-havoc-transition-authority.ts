/**
 * Havoc Demon Hunter's reviewed NON_GCD transition contracts (ONB-A1).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry
 * fire hypothetically and rescans from the root; it does that only under a contract
 * that names what the execution WRITES, in words a reviewer can check against the
 * pinned source. No contract, no branch.
 *
 * WHAT A CONTRACT DOES NOT SAY: that the entry was USABLE. It says what firing it
 * would change, so the query can explore the world in which it fires beside the one
 * in which it does not.
 *
 * WHY TWO CONTRACTS FORGET FURY AND BUFFS. Vengeful Retreat and a soul fragment
 * pick-up both consume souls. Consumption grants Fury under Demonic Appetite and
 * builds Art of the Glaive, whose stack target raises Reaver's Glaive
 * (sc_demon_hunter.cpp:10125-10145), so after either branch `fury` and
 * `buff.reavers_glaive.up` are not what the decision's evidence said. The branch
 * FORGETS them: a buff bound UP stays up (nothing here removes it), anything else
 * is enumerated, and nothing is ever bound UP by a branch.
 */

import { SC_DEMON_HUNTER_CPP_SHA256 } from "./demonhunter-havoc-aura-authority.js";

/**
 * What a hypothetical execution writes:
 *
 *   OWN_PREFIX_AVAILABILITY    the executed entry cannot fire again at zero elapsed time
 *   SHARED_INTERNAL_COOLDOWN   EVERY entry naming the token cannot fire again at zero elapsed time
 *   FORGETS_UNOBSERVED_BUFFS   each buff in `forgetsBuffsUnlessObservedUp` becomes unknown unless bound UP
 *   FORGETS_FURY               `fury` becomes unknown
 */
export type HavocTransitionWrite =
  "OWN_PREFIX_AVAILABILITY" | "SHARED_INTERNAL_COOLDOWN" | "FORGETS_UNOBSERVED_BUFFS" | "FORGETS_FURY";

export interface HavocTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface HavocNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly HavocTransitionWrite[];
  /** The `buff.<name>.up` atoms FORGETS_UNOBSERVED_BUFFS forgets. Empty unless that write is named. */
  readonly forgetsBuffsUnlessObservedUp: readonly string[];
  readonly claims: readonly HavocTransitionClaim[];
}

const MODULE = "engine/class_modules/sc_demon_hunter.cpp";

const claim = (symbol: string, lines: string, text: string): HavocTransitionClaim => ({
  sourcePath: MODULE,
  sourceSha256: SC_DEMON_HUNTER_CPP_SHA256,
  symbol,
  lines,
  claim: text,
});

/** The soul-consumption writes both Vengeful Retreat and a fragment pick-up carry. */
const SOUL_CONSUMPTION_FORGETS = ["reavers_glaive"] as const;

const AUTO_ATTACK: HavocNonGcdTransitionContract = {
  simcToken: "auto_attack",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  forgetsBuffsUnlessObservedUp: [],
  claims: [
    claim(
      "auto_attack_t::auto_attack_t; auto_attack_t::execute; auto_attack_t::ready",
      "7002-7006; 7016-7029; 7031-7041",
      "Built on spell_data_t::nil() with trigger_gcd zero: no GCD, no cost, no cooldown. Its execute only schedules the swings, and it is not ready while a swing is scheduled, so it cannot fire again at zero elapsed time. No APL atom the pinned list reads is written; the swing is a later event.",
    ),
  ],
};

const VENGEFUL_RETREAT: HavocNonGcdTransitionContract = {
  simcToken: "vengeful_retreat",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY", "SHARED_INTERNAL_COOLDOWN", "FORGETS_UNOBSERVED_BUFFS", "FORGETS_FURY"],
  forgetsBuffsUnlessObservedUp: ["initiative", "inertia_trigger", ...SOUL_CONSUMPTION_FORGETS],
  claims: [
    claim(
      "vengeful_retreat_t::execute",
      "8606-8633",
      "Starts its own charge cooldown and the shared movement cooldown (so no entry naming it can fire again at zero elapsed time), triggers the inertia trigger through its base, consumes nearby lesser soul fragments for Havoc, and under Unhindered Assault resets Felblade, whose readiness no bound here claims.",
    ),
    claim(
      "trigger_initiative; vengeful_retreat_damage_t",
      "2608-2619; 8572-8576",
      "Vengeful Retreat's damage expires the initiative tracker and so can trigger buff.initiative. The pinned list reads it only in Vengeful Retreat's own gate and the non-domain items list.",
    ),
    claim(
      "buff.art_of_the_glaive stack change callback",
      "10125-10145",
      "Soul consumption builds Art of the Glaive, whose stack target raises buff.reavers_glaive, and may grant Fury. Both are forgotten.",
    ),
  ],
};

const PICK_UP_FRAGMENT: HavocNonGcdTransitionContract = {
  simcToken: "pick_up_fragment",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY", "SHARED_INTERNAL_COOLDOWN", "FORGETS_UNOBSERVED_BUFFS", "FORGETS_FURY"],
  forgetsBuffsUnlessObservedUp: [...SOUL_CONSUMPTION_FORGETS],
  claims: [
    claim(
      "pick_up_fragment_t::execute; pick_up_fragment_t::ready",
      "5304-5314; 5316-5345",
      "Schedules a pick-up event at the movement time (:5313) and is not ready while one is pending (:5318), so it cannot fire again at zero elapsed time. It has no cooldown, cost or log event of its own.",
    ),
    claim(
      "buff.art_of_the_glaive stack change callback",
      "10125-10145",
      "The pick-up consumes a soul, which builds Art of the Glaive, whose stack target raises buff.reavers_glaive, and may grant Fury. Both are forgotten.",
    ),
  ],
};

export const HAVOC_NON_GCD_TRANSITIONS: readonly HavocNonGcdTransitionContract[] = Object.freeze([
  AUTO_ATTACK,
  VENGEFUL_RETREAT,
  PICK_UP_FRAGMENT,
]);

/** The contract for a token, or `null` when none was reviewed. */
export function havocTransitionContractFor(simcToken: string): HavocNonGcdTransitionContract | null {
  return HAVOC_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
