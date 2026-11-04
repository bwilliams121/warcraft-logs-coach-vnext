/**
 * Arms Warrior's reviewed NON_GCD transition contracts (ONB-B1).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY SO FEW. Every GCD action of the list sits behind a dispatch on the enemy count (ONB-S3), so
 * a contract for Charge or Pummel would move the query's refusal to that dispatch and decide nothing. `auto_attack` is the one action whose writes the pinned module settles by itself, and it writes nothing a condition reads. Every other off-GCD entry refuses: agent/follow-ups.md "After ONB-B1".
 */

export type ArmsWarriorTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface ArmsWarriorTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface ArmsWarriorNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly ArmsWarriorTransitionWrite[];
  readonly claims: readonly ArmsWarriorTransitionClaim[];
}

const AUTO_ATTACK: ArmsWarriorNonGcdTransitionContract = {
  simcToken: "auto_attack",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  claims: [
    {
      sourcePath: "engine/class_modules/sc_warrior.cpp",
      sourceSha256: "ba492ee43e62e01d6921cb40b5269d692d8edb64bebc26de9f722ee76a632d8e",
      symbol: "auto_attack_t::auto_attack_t; auto_attack_t::execute; auto_attack_t::ready",
      lines: "2181-2209; 2211-2221; 2223-2239",
      claim:
        "Built with no spell data and trigger_gcd zero: no GCD, no cost, no cooldown. Its execute only schedules the swings, and it is not ready while a swing is scheduled, so it cannot fire again at zero elapsed time. It writes nothing a condition of the pinned list reads.",
    },
  ],
};

export const ARMS_WARRIOR_NON_GCD_TRANSITIONS: readonly ArmsWarriorNonGcdTransitionContract[] = Object.freeze(
  [AUTO_ATTACK],
);

/** The contract for a token, or `null` when none was reviewed. */
export function armsWarriorTransitionContractFor(
  simcToken: string,
): ArmsWarriorNonGcdTransitionContract | null {
  return ARMS_WARRIOR_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
