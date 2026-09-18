/**
 * Retribution Paladin's reviewed NON_GCD transition contracts (M11-A4).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD
 * entry fire hypothetically and rescans from the root; it does that only
 * under a contract that names what the execution WRITES, in words a reviewer
 * can check against the pinned source. No contract, no branch: the query
 * refuses rather than guessing what the action would have changed.
 *
 * WHY ONLY TWO. Under the M11-A4 class/spec authority boundary every racial,
 * potion, item-use and external-buff entry of the pinned list is OUTSIDE the
 * rotational decision domain and is classified non-applicable BEFORE
 * selection (`domain-boundary.ts`), so none of them ever needs a contract.
 * Avenging Wrath — the one in-domain NON_GCD entry that writes atoms the
 * spender path reads — is gated on `raid_event.adds.up`, which the shared
 * parser refuses; a scan that reaches it while it is not proven unusable
 * BLOCKS, so no hypothetical wings execution is ever explored and no
 * contract is written for it here. That leaves `auto_attack` and `rebuke`,
 * the two entries above the `cooldowns` call.
 */

import {
  SC_PALADIN_CPP_SHA256,
  SC_PALADIN_HPP_SHA256,
  type RetributionAuraClaim,
} from "./paladin-retribution-aura-authority.js";

export type RetributionTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface RetributionNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly RetributionTransitionWrite[];
  readonly claims: readonly RetributionAuraClaim[];
}

const CLASS = "engine/class_modules/paladin/sc_paladin.cpp";
const HEADER = "engine/class_modules/paladin/sc_paladin.hpp";

const AUTO_ATTACK: RetributionNonGcdTransitionContract = {
  simcToken: "auto_attack",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  claims: [
    {
      sourcePath: CLASS,
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "auto_melee_attack_t::auto_melee_attack_t",
      lines: "1026-1036",
      claim:
        "Built on spell_data_t::nil() with trigger_gcd = 0_ms: no spell record, no GCD, no cost, no cooldown.",
    },
    {
      sourcePath: CLASS,
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "auto_melee_attack_t::execute",
      lines: "1038-1044",
      claim:
        "Schedules main_hand_attack->schedule_execute() when no swing is scheduled and does nothing else: " +
        "no buff is triggered, no resource is gained, no cooldown is started, and no APL atom the pinned " +
        "Retribution list reads is written. (The swing ITSELF may later proc Art of War — that is the swing's " +
        "execute at 1005-1015, an event the log reports as an aura, never a write of this entry.)",
    },
    {
      sourcePath: CLASS,
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "auto_melee_attack_t::ready",
      lines: "1046-1052",
      claim:
        "Ready only while not moving and no swing is scheduled. Once executed in a branch the swing IS " +
        "scheduled, so the entry cannot be selected again at zero elapsed time — SIMULATED_PREFIX_EXECUTION.",
    },
  ],
};

const REBUKE: RetributionNonGcdTransitionContract = {
  simcToken: "rebuke",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  claims: [
    {
      sourcePath: CLASS,
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "rebuke_t::rebuke_t / rebuke_t::target_ready",
      lines: "1942-1962",
      claim:
        'paladin_melee_attack_t( "rebuke", p, p->find_class_spell( "Rebuke" ) ) — spell 96231, `_gcd` 0, ' +
        "cooldown 15,000 ms — with weapon_multiplier 0 and every hit/crit flag cleared. target_ready requires " +
        "the target to be casting, which Warcraft Logs targetability evidence does not establish here: the " +
        "entry's usability is UNKNOWN in both directions, and the query explores the world in which it fires " +
        "and the world in which it does not.",
    },
    {
      sourcePath: HEADER,
      sourceSha256: SC_PALADIN_HPP_SHA256,
      symbol: "paladin_action_t::execute / impact (the base rebuke_t inherits unchanged)",
      lines: "1217-1250",
      claim:
        "rebuke_t overrides no execute or impact. The base execute extends Shake the Heavens only under " +
        "triggers_higher_calling (false for rebuke_t) and refunds Holy Power only for a Holy Power-costing " +
        "action (rebuke costs none); the base impact decrements the Judgment debuff only under clears_judgment " +
        "(false by default) and triggers Rush of Light only on a Holy Power energize (rebuke has none). Nothing " +
        "the spender path reads — Holy Power, the arbiter and legacy auras, wings, the readiness aura, any " +
        "cooldown the list gates on — is written.",
    },
    {
      sourcePath: CLASS,
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "Rebuke DBC record",
      lines: "sc_spell_data.inc row 96231",
      claim:
        "cooldown 15,000 ms, far longer than the queueing tolerance, so a fired Rebuke is not selectable " +
        "again at zero elapsed time.",
    },
  ],
};

export const RETRIBUTION_NON_GCD_TRANSITIONS: readonly RetributionNonGcdTransitionContract[] = Object.freeze([
  AUTO_ATTACK,
  REBUKE,
]);

/** The contract for a token, or `null` when this milestone reviewed none. */
export function retributionTransitionContractFor(
  simcToken: string,
): RetributionNonGcdTransitionContract | null {
  return RETRIBUTION_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
