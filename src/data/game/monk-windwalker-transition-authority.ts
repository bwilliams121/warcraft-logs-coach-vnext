/**
 * Windwalker Monk's reviewed NON_GCD transition contracts (ONB-T1).
 *
 * WHAT A CONTRACT IS. The shared first-GCD query lets a selectable NON_GCD entry fire
 * hypothetically and rescans from the root; it does that only under a contract that
 * names what the execution WRITES, in words a reviewer can check against the pinned
 * source. No contract, no branch, and the decision stays UNKNOWN.
 *
 * WHY SO FEW. `auto_attack` is the one action reviewed here, because it writes nothing a condition reads. Touch of Karma and Zenith are proven off the GCD and have no contract: Touch of Karma's execution starts its buff and
 * Zenith's starts its own buff, Stomp and resources, all of which later lines read, so asking for either fails closed with TRANSITION_UNSUPPORTED. Every other proven one is a racial, a potion, an item or an external buff, which the domain boundary refuses before a lane is read.
 */

export type WindwalkerMonkTransitionWrite = "OWN_PREFIX_AVAILABILITY";

export interface WindwalkerMonkTransitionClaim {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly symbol: string;
  readonly lines: string;
  readonly claim: string;
}

export interface WindwalkerMonkNonGcdTransitionContract {
  readonly simcToken: string;
  /** Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  /** Named, never defaulted. */
  readonly writes: readonly WindwalkerMonkTransitionWrite[];
  readonly claims: readonly WindwalkerMonkTransitionClaim[];
}

const MODULE = "engine/class_modules/monk/sc_monk.cpp";
const SC_MONK_CPP_SHA256 = "61dae19dac3135925bafac351bd624a60fb710d01ff1a37802f43a9c68484aad";

const claim = (symbol: string, lines: string, text: string): WindwalkerMonkTransitionClaim => ({
  sourcePath: MODULE,
  sourceSha256: SC_MONK_CPP_SHA256,
  symbol,
  lines,
  claim: text,
});

const AUTO_ATTACK: WindwalkerMonkNonGcdTransitionContract = {
  simcToken: "auto_attack",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  writes: ["OWN_PREFIX_AVAILABILITY"],
  claims: [
    claim(
      "auto_attack_t::auto_attack_t",
      "2293-2305",
      'Built with no spell record (monk_melee_attack_t( player, "auto_attack" )) and trigger_gcd = 0_ms: no GCD, no cost, no cooldown. The constructor only registers the swing actions.',
    ),
    claim(
      "auto_attack_t::execute; monk_action_t<Base>::execute; monk_action_t<Base>::monk_action_t",
      "2317-2325; 427-435; 81",
      "Schedules the swings and calls the base execute. For a WINDWALKER the base triggers Combo Strikes only when may_combo_strike is set, the member defaults to false, and this constructor never sets it, so the entry does not write the history `combo_strike` reads. No buff is triggered, no resource is gained and no cooldown is started.",
    ),
    claim(
      "auto_attack_t::ready",
      "2307-2315",
      "Ready only within 5 yards of movement and while no swing is scheduled. Once executed in a branch the swing IS scheduled, so the entry cannot be selected again at zero elapsed time.",
    ),
  ],
};

export const WINDWALKER_MONK_NON_GCD_TRANSITIONS: readonly WindwalkerMonkNonGcdTransitionContract[] =
  Object.freeze([AUTO_ATTACK]);

/** The contract for a token, or `null` when none was reviewed. */
export function windwalkerMonkTransitionContractFor(
  simcToken: string,
): WindwalkerMonkNonGcdTransitionContract | null {
  return WINDWALKER_MONK_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
