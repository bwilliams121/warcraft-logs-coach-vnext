/**
 * Enhancement Shaman's reviewed NON_GCD transition contracts (ONB-B2).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY SO FEW. No retained capture holds this specialization's combatant info, so nothing could
 * check a contract's effect against a real build. `auto_attack` is the one action whose writes the pinned module settles by itself, and it writes nothing a condition reads. Every other off-GCD entry refuses: agent/follow-ups.md "After ONB-B2".
 */

export type EnhancementShamanTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface EnhancementShamanTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface EnhancementShamanNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly EnhancementShamanTransitionWrite[];
  readonly claims: readonly EnhancementShamanTransitionClaim[];
}

const AUTO_ATTACK: EnhancementShamanNonGcdTransitionContract = {
  simcToken: "auto_attack",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  claims: [
    {
      sourcePath: "engine/class_modules/sc_shaman.cpp",
      sourceSha256: "0ca278a862eb9ceb8aba2255bceb534955a9e5ed83c9b81ec35b2a0f86763bd0",
      symbol: "auto_attack_t::auto_attack_t; auto_attack_t::execute; auto_attack_t::ready",
      lines: "5081-5126; 5128-5133; 5135-5140",
      claim:
        "Built on spell_data_t::nil() with trigger_gcd zero: no GCD, no cost, no cooldown. Its execute only schedules the swings, and it is not ready while a swing is scheduled, so it cannot fire again at zero elapsed time. It writes nothing a condition of the pinned list reads.",
    },
  ],
};

export const ENHANCEMENT_SHAMAN_NON_GCD_TRANSITIONS: readonly EnhancementShamanNonGcdTransitionContract[] =
  Object.freeze([AUTO_ATTACK]);

/** The contract for a token, or `null` when none was reviewed. */
export function enhancementShamanTransitionContractFor(
  simcToken: string,
): EnhancementShamanNonGcdTransitionContract | null {
  return ENHANCEMENT_SHAMAN_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
