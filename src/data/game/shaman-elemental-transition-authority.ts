/**
 * Elemental Shaman's reviewed NON_GCD transition contracts (ONB-D2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. Spiritwalker's Grace, Wind Shear, Nature's Swiftness and Ancestral Swiftness are off the GCD, and no contract is reviewed for any of them:
 * what each writes (a free-cast buff, a movement buff, an interrupt) is state nothing here reads, and Spiritwalker's Grace carries an option
 * (`moving=1`) the shared scan refuses first. No contract could move a decision past that line.
 */

export type ElementalTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface ElementalTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface ElementalNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly ElementalTransitionWrite[];
  readonly claims: readonly ElementalTransitionClaim[];
}

export const ELEMENTAL_NON_GCD_TRANSITIONS: readonly ElementalNonGcdTransitionContract[] = Object.freeze([]);

/** The contract for a token, or `null` when none was reviewed. */
export function elementalTransitionContractFor(simcToken: string): ElementalNonGcdTransitionContract | null {
  return ELEMENTAL_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
