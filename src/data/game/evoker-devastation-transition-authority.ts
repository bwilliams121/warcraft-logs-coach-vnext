/**
 * Devastation Evoker's reviewed NON_GCD transition contracts (ONB-X2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. Quell, Hover and Tip the Scales are the class tokens off the GCD, and no contract is reviewed. Quell writes a lockout nothing here reads, Hover writes a buff the list reads as
 * `buff.hover.up`, and Tip the Scales writes the buff that makes the next empowered spell instant, which `fs[4]` and `fs[5]` read. No contract is written for state nothing here binds.
 */

export type DevastationTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface DevastationTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface DevastationNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly DevastationTransitionWrite[];
  readonly claims: readonly DevastationTransitionClaim[];
}

export const DEVASTATION_NON_GCD_TRANSITIONS: readonly DevastationNonGcdTransitionContract[] = Object.freeze(
  [],
);

/** The contract for a token, or `null` when none was reviewed. */
export function devastationTransitionContractFor(
  simcToken: string,
): DevastationNonGcdTransitionContract | null {
  return DEVASTATION_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
