/**
 * Marksmanship Hunter's reviewed NON_GCD transition contracts (ONB-D4).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. Trueshot and `auto_shot` are the class tokens off the GCD, and no contract is reviewed. Trueshot writes a buff later lines read, and `auto_shot` sits behind the `retarget` line, where the scan already stops. No contract is written for state nothing here binds.
 */

export type MarksmanshipTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface MarksmanshipTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface MarksmanshipNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly MarksmanshipTransitionWrite[];
  readonly claims: readonly MarksmanshipTransitionClaim[];
}

export const MARKSMANSHIP_NON_GCD_TRANSITIONS: readonly MarksmanshipNonGcdTransitionContract[] =
  Object.freeze([]);

/** The contract for a token, or `null` when none was reviewed. */
export function marksmanshipTransitionContractFor(
  simcToken: string,
): MarksmanshipNonGcdTransitionContract | null {
  return MARKSMANSHIP_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
