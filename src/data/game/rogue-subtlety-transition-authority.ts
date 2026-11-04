/**
 * Subtlety Rogue's reviewed NON_GCD transition contracts (ONB-A2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY SO FEW. No retained capture holds this specialization's events, so nothing could
 * measure a contract's effect or check it against the wire. The pinned list has no `auto_attack`, and every other off-GCD action writes state its conditions read, so none is contracted. Every other off-GCD entry refuses: agent/follow-ups.md "After ONB-A2".
 */

export type SubtletyTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface SubtletyTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface SubtletyNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly SubtletyTransitionWrite[];
  readonly claims: readonly SubtletyTransitionClaim[];
}

export const SUBTLETY_NON_GCD_TRANSITIONS: readonly SubtletyNonGcdTransitionContract[] = Object.freeze([]);

/** The contract for a token, or `null` when none was reviewed. */
export function subtletyTransitionContractFor(simcToken: string): SubtletyNonGcdTransitionContract | null {
  return SUBTLETY_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
