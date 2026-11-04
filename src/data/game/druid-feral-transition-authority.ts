/**
 * Feral Druid's reviewed NON_GCD transition contracts (ONB-C1).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY SO FEW. `tigers_fury`, `prowl` and `berserk` each write state the list reads, and no real scan could get past the enemy count behind them, so none is contracted. `auto_attack` is the one action whose writes the pinned module settles by itself, and it writes nothing a condition reads. Every other off-GCD entry refuses: agent/follow-ups.md "After ONB-C1".
 */

export type FeralDruidTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface FeralDruidTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface FeralDruidNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly FeralDruidTransitionWrite[];
  readonly claims: readonly FeralDruidTransitionClaim[];
}

const AUTO_ATTACK: FeralDruidNonGcdTransitionContract = {
  simcToken: "auto_attack",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  claims: [
    {
      sourcePath: "engine/class_modules/sc_druid.cpp",
      sourceSha256: "59227a2f687a9fe5229964f797fa2623040e3915dd6daec18b434ca4730a8fb0",
      symbol: "auto_attack_t::auto_attack_t; auto_attack_t::execute; auto_attack_t::ready",
      lines: "9883-9889; 9891-9896; 9898-9906",
      claim:
        "Built with spell_data_t::nil() and trigger_gcd zero: no GCD, no cost, no cooldown. Its execute only schedules the swing, and it is not ready while a swing is scheduled, so it cannot fire again at zero elapsed time. It writes nothing a condition of the pinned list reads.",
    },
  ],
};

export const FERAL_DRUID_NON_GCD_TRANSITIONS: readonly FeralDruidNonGcdTransitionContract[] = Object.freeze([
  AUTO_ATTACK,
]);

/** The contract for a token, or `null` when none was reviewed. */
export function feralDruidTransitionContractFor(
  simcToken: string,
): FeralDruidNonGcdTransitionContract | null {
  return FERAL_DRUID_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
