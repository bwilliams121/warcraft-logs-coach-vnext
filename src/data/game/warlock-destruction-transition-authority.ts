/**
 * Destruction Warlock's reviewed NON_GCD transition contracts (ONB-D1).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. No Destruction action is off the GCD at the pin, so nothing but a non-domain line could
 * fire before a GCD action, and the first GCD question is the enemy count. A contract could not move a
 * decision past it.
 */

export type DestructionTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface DestructionTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface DestructionNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly DestructionTransitionWrite[];
  readonly claims: readonly DestructionTransitionClaim[];
}

export const DESTRUCTION_NON_GCD_TRANSITIONS: readonly DestructionNonGcdTransitionContract[] = Object.freeze(
  [],
);

/** The contract for a token, or `null` when none was reviewed. */
export function destructionTransitionContractFor(
  simcToken: string,
): DestructionNonGcdTransitionContract | null {
  return DESTRUCTION_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
