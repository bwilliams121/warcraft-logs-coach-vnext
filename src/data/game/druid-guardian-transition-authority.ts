/**
 * Guardian Druid's reviewed NON_GCD transition contracts (ONB-T2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. Ironfur, Barkskin, Berserk, Heart of the Wild and `auto_attack` are the class tokens off the GCD, and no contract is reviewed. Each of the first four writes a buff or a resource later lines read, and `auto_attack` sits on the list's first line, where the engine already refuses. No contract is written for state nothing here binds.
 */

export type GuardianTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface GuardianTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface GuardianNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly GuardianTransitionWrite[];
  readonly claims: readonly GuardianTransitionClaim[];
}

export const GUARDIAN_NON_GCD_TRANSITIONS: readonly GuardianNonGcdTransitionContract[] = Object.freeze([]);

/** The contract for a token, or `null` when none was reviewed. */
export function guardianTransitionContractFor(simcToken: string): GuardianNonGcdTransitionContract | null {
  return GUARDIAN_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
