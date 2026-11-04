/**
 * Frost Death Knight's reviewed NON_GCD transition contracts (ONB-B2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY SO FEW. No contract here could resolve a decision: the real scans stop on a target_if a contract does not reach. `auto_attack` is the one action whose writes the pinned module settles by itself, and it writes nothing a condition reads. Every other off-GCD entry refuses: agent/follow-ups.md "After ONB-B2".
 */

export type FrostDeathKnightTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface FrostDeathKnightTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface FrostDeathKnightNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly FrostDeathKnightTransitionWrite[];
  readonly claims: readonly FrostDeathKnightTransitionClaim[];
}

const AUTO_ATTACK: FrostDeathKnightNonGcdTransitionContract = {
  simcToken: "auto_attack",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  claims: [
    {
      sourcePath: "engine/class_modules/sc_death_knight.cpp",
      sourceSha256: "beed4d7cffad6a548dc1791eef6f4208c308d53836b46d644e4e9c9c95058d39",
      symbol: "auto_attack_t::auto_attack_t; auto_attack_t::execute; auto_attack_t::ready",
      lines: "7732-7754; 7756-7763; 7765-7771",
      claim:
        "Built with no spell data and trigger_gcd zero: no GCD, no cost, no cooldown. Its execute only schedules the swings, and it is not ready while a swing is scheduled, so it cannot fire again at zero elapsed time. It writes nothing a condition of the pinned list reads.",
    },
  ],
};

export const FROST_DEATH_KNIGHT_NON_GCD_TRANSITIONS: readonly FrostDeathKnightNonGcdTransitionContract[] =
  Object.freeze([AUTO_ATTACK]);

/** The contract for a token, or `null` when none was reviewed. */
export function frostDeathKnightTransitionContractFor(
  simcToken: string,
): FrostDeathKnightNonGcdTransitionContract | null {
  return FROST_DEATH_KNIGHT_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
