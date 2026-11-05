/**
 * Fire Mage's reviewed NON_GCD transition contracts (ONB-X1).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. Combustion and Fire Blast are the class tokens off the GCD, and no contract is reviewed. Combustion writes the buff its own dispatch reads, and resets Fire Blast
 * charges by talent (sc_mage.cpp:3522). Fire Blast writes the Heating Up and Hot Streak chain, by a crit no log predicts. No contract is written for state
 * nothing here binds.
 */

export type FireTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface FireTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface FireNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly FireTransitionWrite[];
  readonly claims: readonly FireTransitionClaim[];
}

export const FIRE_NON_GCD_TRANSITIONS: readonly FireNonGcdTransitionContract[] = Object.freeze([]);

/** The contract for a token, or `null` when none was reviewed. */
export function fireTransitionContractFor(simcToken: string): FireNonGcdTransitionContract | null {
  return FIRE_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
