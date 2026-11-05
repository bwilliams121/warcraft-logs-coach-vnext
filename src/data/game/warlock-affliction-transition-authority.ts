/**
 * Affliction Warlock's reviewed NON_GCD transition contracts (ONB-D4).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. Every bound token of the list is on the GCD, so there is nothing to review. The racial, potion, item and external-buff lines are taken out by the domain boundary.
 */

export type AfflictionTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface AfflictionTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface AfflictionNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly AfflictionTransitionWrite[];
  readonly claims: readonly AfflictionTransitionClaim[];
}

export const AFFLICTION_NON_GCD_TRANSITIONS: readonly AfflictionNonGcdTransitionContract[] = Object.freeze(
  [],
);

/** The contract for a token, or `null` when none was reviewed. */
export function afflictionTransitionContractFor(
  simcToken: string,
): AfflictionNonGcdTransitionContract | null {
  return AFFLICTION_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
