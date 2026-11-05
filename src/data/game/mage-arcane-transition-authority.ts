/**
 * Arcane Mage's reviewed NON_GCD transition contracts (ONB-D3).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. Counterspell, Touch of the Magi and Presence of Mind are the class tokens off the GCD, and no contract is reviewed. Counterspell is the list's first
 * line, with no condition, and what it writes is a lockout nothing here reads, and Touch of the Magi and Presence of Mind write a debuff and a buff later lines read. No
 * contract is written for state nothing here binds.
 */

export type ArcaneTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface ArcaneTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface ArcaneNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly ArcaneTransitionWrite[];
  readonly claims: readonly ArcaneTransitionClaim[];
}

export const ARCANE_NON_GCD_TRANSITIONS: readonly ArcaneNonGcdTransitionContract[] = Object.freeze([]);

/** The contract for a token, or `null` when none was reviewed. */
export function arcaneTransitionContractFor(simcToken: string): ArcaneNonGcdTransitionContract | null {
  return ARCANE_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
