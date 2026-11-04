/**
 * Devourer Demon Hunter's reviewed NON_GCD transition contracts (ONB-B3).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY SO FEW. No contract here could resolve a decision: the real scans stop on the enemy count, which a contract does not reach. The pinned list has no `auto_attack`, and every other off-GCD action writes state its conditions read, so none is contracted. Every other off-GCD entry refuses: agent/follow-ups.md "After ONB-B3".
 */

export type DevourerDemonHunterTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface DevourerDemonHunterTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface DevourerDemonHunterNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly DevourerDemonHunterTransitionWrite[];
  readonly claims: readonly DevourerDemonHunterTransitionClaim[];
}

export const DEVOURER_DEMON_HUNTER_NON_GCD_TRANSITIONS: readonly DevourerDemonHunterNonGcdTransitionContract[] =
  Object.freeze([]);

/** The contract for a token, or `null` when none was reviewed. */
export function devourerDemonHunterTransitionContractFor(
  simcToken: string,
): DevourerDemonHunterNonGcdTransitionContract | null {
  return DEVOURER_DEMON_HUNTER_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
