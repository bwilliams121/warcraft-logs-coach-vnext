/**
 * Outlaw Rogue's reviewed NON_GCD transition contracts (ONB-C2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY SO FEW. No retained capture holds this specialization's events, so nothing could
 * measure a contract's effect or check it against the wire. The pinned list has no `auto_attack`. Stealth and Vanish write the stealth state Ambush's readiness reads, Adrenaline Rush writes its buff and Energy, Keep It Rolling writes the Roll the Bones buffs, and Kick is declared under another domain, so none is contracted. Every off-GCD entry refuses: agent/follow-ups.md "After ONB-C2".
 */

export type OutlawTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface OutlawTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface OutlawNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly OutlawTransitionWrite[];
  readonly claims: readonly OutlawTransitionClaim[];
}

export const OUTLAW_NON_GCD_TRANSITIONS: readonly OutlawNonGcdTransitionContract[] = Object.freeze([]);

/** The contract for a token, or `null` when none was reviewed. */
export function outlawTransitionContractFor(simcToken: string): OutlawNonGcdTransitionContract | null {
  return OUTLAW_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
