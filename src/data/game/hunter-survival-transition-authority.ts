/**
 * Survival Hunter's reviewed NON_GCD transition contracts (ONB-T2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. Muzzle, Aspect of the Eagle and `auto_attack` are the bound tokens off the GCD, and no contract is reviewed. Each sits behind the `retarget` line, where the scan already stops, and Aspect of the Eagle writes a buff. No contract is written for state nothing here binds.
 */

export type SurvivalTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface SurvivalTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface SurvivalNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly SurvivalTransitionWrite[];
  readonly claims: readonly SurvivalTransitionClaim[];
}

export const SURVIVAL_NON_GCD_TRANSITIONS: readonly SurvivalNonGcdTransitionContract[] = Object.freeze([]);

/** The contract for a token, or `null` when none was reviewed. */
export function survivalTransitionContractFor(simcToken: string): SurvivalNonGcdTransitionContract | null {
  return SURVIVAL_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
