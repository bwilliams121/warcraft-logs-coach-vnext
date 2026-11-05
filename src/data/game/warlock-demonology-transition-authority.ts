/**
 * Demonology Warlock's reviewed NON_GCD transition contracts (ONB-X4).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. Every bound token of the list is on the GCD, so there is nothing to review. The racial, potion, item and external-buff lines are taken out by the domain boundary.
 */

export type DemonologyTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface DemonologyTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface DemonologyNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly DemonologyTransitionWrite[];
  readonly claims: readonly DemonologyTransitionClaim[];
}

export const DEMONOLOGY_NON_GCD_TRANSITIONS: readonly DemonologyNonGcdTransitionContract[] = Object.freeze(
  [],
);

/** The contract for a token, or `null` when none was reviewed. */
export function demonologyTransitionContractFor(
  simcToken: string,
): DemonologyNonGcdTransitionContract | null {
  return DEMONOLOGY_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
