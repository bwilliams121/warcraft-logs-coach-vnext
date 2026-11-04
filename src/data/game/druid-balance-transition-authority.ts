/**
 * Balance Druid's reviewed NON_GCD transition contracts (ONB-D2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. Celestial Alignment and Incarnation are the one class token off the GCD, and no contract is reviewed: what either writes is a buff every
 * later line reads, which is state nothing here binds. No contract could move a decision past the lines before it.
 */

export type BalanceTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface BalanceTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface BalanceNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly BalanceTransitionWrite[];
  readonly claims: readonly BalanceTransitionClaim[];
}

export const BALANCE_NON_GCD_TRANSITIONS: readonly BalanceNonGcdTransitionContract[] = Object.freeze([]);

/** The contract for a token, or `null` when none was reviewed. */
export function balanceTransitionContractFor(simcToken: string): BalanceNonGcdTransitionContract | null {
  return BALANCE_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
