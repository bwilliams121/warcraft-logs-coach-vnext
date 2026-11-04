/**
 * Shadow Priest's reviewed NON_GCD transition contracts (ONB-D2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY NONE. Power Infusion and Desperate Prayer are the class tokens off the GCD, and no contract is reviewed. Both sit inside the cooldown list, behind
 * `main[1]`'s gate, and the first is where the engine's own refusal lands. A contract would move that refusal only as far as `main[3]`'s `target_if`.
 */

export type ShadowTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface ShadowTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface ShadowNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly ShadowTransitionWrite[];
  readonly claims: readonly ShadowTransitionClaim[];
}

export const SHADOW_NON_GCD_TRANSITIONS: readonly ShadowNonGcdTransitionContract[] = Object.freeze([]);

/** The contract for a token, or `null` when none was reviewed. */
export function shadowTransitionContractFor(simcToken: string): ShadowNonGcdTransitionContract | null {
  return SHADOW_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
