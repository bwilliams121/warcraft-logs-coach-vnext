/**
 * Vengeance Demon Hunter's reviewed NON_GCD transition contracts (ONB-X3).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY ONE. `auto_attack` writes nothing the list reads, the same reading as Havoc's and at the same lines. Every other off-GCD action writes state its conditions read, and none has a capture to be checked against.
 * Disrupt is declared under the interrupt domain, and nothing shows when an enemy casts. Infernal Strike writes its charges, Demon Spikes
 * the buff `default[20]` asks about, Metamorphosis the buff the list reads, and Vengeful Retreat what `ar[47] felblade` asks through `prev_off_gcd`. No contract is written for state nothing here binds.
 */

export type VengeanceDemonHunterTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface VengeanceDemonHunterTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface VengeanceDemonHunterNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly VengeanceDemonHunterTransitionWrite[];
  readonly claims: readonly VengeanceDemonHunterTransitionClaim[];
}

const AUTO_ATTACK: VengeanceDemonHunterNonGcdTransitionContract = {
  simcToken: "auto_attack",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  claims: [
    {
      sourcePath: "engine/class_modules/sc_demon_hunter.cpp",
      sourceSha256: "62a1b4ace1d7e658ad293023fbb67c2b669a3c52415ee2d5a1c08d5b63c867b0",
      symbol: "auto_attack_t::auto_attack_t; auto_attack_t::execute; auto_attack_t::ready",
      lines: "7002-7006; 7016-7029; 7031-7041",
      claim:
        "Built on spell_data_t::nil() with trigger_gcd zero: no GCD, no cost, no cooldown. Its execute only schedules the swings, and it is not ready while a swing is scheduled, so it cannot fire again at zero elapsed time. No APL atom the pinned list reads is written by it.",
    },
  ],
};

export const VENGEANCE_DEMON_HUNTER_NON_GCD_TRANSITIONS: readonly VengeanceDemonHunterNonGcdTransitionContract[] =
  Object.freeze([AUTO_ATTACK]);

/** The contract for a token, or `null` when none was reviewed. */
export function vengeanceDemonHunterTransitionContractFor(
  simcToken: string,
): VengeanceDemonHunterNonGcdTransitionContract | null {
  return VENGEANCE_DEMON_HUNTER_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
