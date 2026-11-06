/**
 * Beast Mastery Hunter's reviewed NON_GCD transition contracts (ONB-T2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. `auto_shot` is the one bound token off the GCD, and it sits behind the `retarget` line, where the scan already stops. No contract is written for state nothing here binds.
 */

export type BeastMasteryTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface BeastMasteryTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface BeastMasteryNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly BeastMasteryTransitionWrite[];
  readonly claims: readonly BeastMasteryTransitionClaim[];
}

export const BEAST_MASTERY_NON_GCD_TRANSITIONS: readonly BeastMasteryNonGcdTransitionContract[] =
  Object.freeze([]);

/** The contract for a token, or `null` when none was reviewed. */
export function beastMasteryTransitionContractFor(
  simcToken: string,
): BeastMasteryNonGcdTransitionContract | null {
  return BEAST_MASTERY_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
