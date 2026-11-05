/**
 * Frost Mage's reviewed NON_GCD transition contracts (ONB-D3).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. Every bound token of the list is on the GCD, so there is nothing to review. The racial, potion, item and external-buff lines are taken out by the domain boundary, and `any_blink`, which builds Shimmer off the GCD or Blink on it, has no binding.
 */

export type FrostTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface FrostTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface FrostNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly FrostTransitionWrite[];
  readonly claims: readonly FrostTransitionClaim[];
}

export const FROST_NON_GCD_TRANSITIONS: readonly FrostNonGcdTransitionContract[] = Object.freeze([]);

/** The contract for a token, or `null` when none was reviewed. */
export function frostTransitionContractFor(simcToken: string): FrostNonGcdTransitionContract | null {
  return FROST_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
