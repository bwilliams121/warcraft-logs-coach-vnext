/**
 * Fury Warrior's reviewed NON_GCD transition contracts (ONB-A2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY SO FEW. No retained capture holds this specialization's events, so nothing could
 * measure a contract's effect or check it against the wire. `auto_attack` is the one action whose writes the pinned module settles by itself, and it writes nothing a condition reads. Every other off-GCD entry refuses: agent/follow-ups.md "After ONB-A2".
 */

export type FuryWarriorTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface FuryWarriorTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface FuryWarriorNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly FuryWarriorTransitionWrite[];
  readonly claims: readonly FuryWarriorTransitionClaim[];
}

const AUTO_ATTACK: FuryWarriorNonGcdTransitionContract = {
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

export const FURY_WARRIOR_NON_GCD_TRANSITIONS: readonly FuryWarriorNonGcdTransitionContract[] = Object.freeze(
  [AUTO_ATTACK],
);

/** The contract for a token, or `null` when none was reviewed. */
export function furyWarriorTransitionContractFor(
  simcToken: string,
): FuryWarriorNonGcdTransitionContract | null {
  return FURY_WARRIOR_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
