/**
 * Retribution Paladin's pinned FOREGROUND-ONLY execution facts (M11-A4
 * review correction) — hand-reviewed against the pinned SimulationCraft
 * commit, with the measured hashes of the files each reading was made
 * against.
 *
 * THE PROBLEM THIS ANSWERS, AND ONLY THIS
 *
 * `cooldowns[10] avenging_wrath` is background under Radiant Glory
 * (sc_paladin.cpp:292-293). Radiant Glory is a NORMAL talent node, and the
 * three-way talent rule leaves a NORMAL node absent from the observed tree
 * UNKNOWN — never NOT_SELECTED — so the constructor reading is UNKNOWN and
 * the scan blocks before the entry's proven cooldown is even consulted.
 *
 * WHAT DOES NOT SETTLE IT. "The actor was observed casting an ability the
 * token binds to" is NOT, in general, proof that the bound action is
 * foreground: a background or triggered action executes too, and the game
 * can emit a cast event for it (Crusading Strikes 408385 is exactly such a
 * cast in this very evidence). No universal "cast observed ⇒ selectable"
 * rule exists anywhere in this project.
 *
 * WHAT DOES SETTLE IT, FOR THIS ONE ACTION. The pinned module builds the
 * Paladin wings action through TWO constructors on TWO different spell
 * records:
 *
 *     avenging_wrath_t( paladin_t* )                   find_spell( 454351 ), background = true
 *                                                      — the ONLY background wings action,
 *                                                      `active.background_avenging_wrath`
 *                                                      (:3304-3307), executed by Wake of
 *                                                      Ashes under Radiant Glory
 *                                                      (sc_paladin_retribution.cpp:846-851)
 *     avenging_wrath_t( paladin_t*, options_str )      find_spell( 31884 ) — the APL action
 *                                                      `create_action` returns (:3381-3382),
 *                                                      background under the four guards
 *
 * So under EVERY pinned configuration, spell 31884 is executed by the
 * foreground constructor and by nothing else: the triggered wings of a
 * Radiant Glory build is a different spell record (454351), and no other
 * site in the pinned Paladin module constructs or executes a 31884 action.
 * An observed COMPLETE cast of 31884 by the actor is therefore a foreground
 * execution under the pinned mechanics, and a foreground execution is
 * impossible while the action is background — so the four constructor
 * guards were false for this actor, and the entry is APPLICABLE. The
 * inference rests on the same pinned spell-record identity the token
 * binding already rests on (`paladin-retribution-gcd-semantics.json` binds
 * `avenging_wrath` to 31884); it is a fact about THIS action, recorded with
 * its claims, and it authorizes nothing about any other token.
 */

import {
  SC_PALADIN_CPP_SHA256,
  SC_PALADIN_RETRIBUTION_CPP_SHA256,
} from "./paladin-retribution-aura-authority.js";
import type { RetributionAuraClaim } from "./paladin-retribution-aura-authority.js";

export interface RetributionForegroundOnlyExecution {
  /** The APL token whose constructor reading this fact may settle. */
  readonly simcToken: string;
  /** The spell record ONLY the foreground constructor executes. */
  readonly abilityGameId: number;
  /** The spell record the background/triggered execution uses instead, for the record. */
  readonly backgroundAbilityGameId: number;
  readonly claims: readonly RetributionAuraClaim[];
}

const CLASS = "engine/class_modules/paladin/sc_paladin.cpp";
const SPEC = "engine/class_modules/paladin/sc_paladin_retribution.cpp";

const AVENGING_WRATH_FOREGROUND_ONLY: RetributionForegroundOnlyExecution = {
  simcToken: "avenging_wrath",
  abilityGameId: 31884,
  backgroundAbilityGameId: 454351,
  claims: [
    {
      sourcePath: CLASS,
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "avenging_wrath_t::avenging_wrath_t( paladin_t* )",
      lines: "275-280",
      claim:
        "The no-options constructor is built on find_spell( 454351 ) with background = true. It is the only " +
        "background wings action.",
    },
    {
      sourcePath: CLASS,
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "avenging_wrath_t::avenging_wrath_t( paladin_t*, util::string_view )",
      lines: "282-294",
      claim:
        "The APL constructor is built on find_spell( 31884 ) and is background only under the four guards " +
        "(no Avenging Wrath talent, Avenging Crusader, Sentinel, Radiant Glory). No other constructor exists " +
        "(sc_paladin.hpp:1816-1817).",
    },
    {
      sourcePath: CLASS,
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "paladin_t::create_actions / paladin_t::create_action",
      lines: "3304-3307; 3381-3382",
      claim:
        "`active.background_avenging_wrath = new avenging_wrath_t( this )` (454351) and " +
        '`create_action( "avenging_wrath" )` returning `new avenging_wrath_t( this, options_str )` (31884) are ' +
        "the only two constructions in the pinned class module; the Protection and Retribution spec modules " +
        "construct none (create_action_retribution names no avenging_wrath, sc_paladin_retribution.cpp:1131-1140).",
    },
    {
      sourcePath: SPEC,
      sourceSha256: SC_PALADIN_RETRIBUTION_CPP_SHA256,
      symbol: "wake_of_ashes_t::execute",
      lines: "846-851",
      claim:
        "Under Radiant Glory with the Avenging Wrath talent, Wake of Ashes executes " +
        "`active.background_avenging_wrath` — the 454351 record — on the actor. This is the only triggered " +
        "wings execution in the pinned Retribution module; it never executes a 31884 record.",
    },
    {
      sourcePath: CLASS,
      sourceSha256: SC_PALADIN_CPP_SHA256,
      symbol: "avenging_wrath_state_t::cast_proc_type2",
      lines: "263-273",
      claim:
        "The background action may trigger on-cast procs (PROC2_CAST_GENERIC) even while backgrounded — a " +
        "reminder that background executions ARE executions with observable consequences; the proof above " +
        "rests on the spell-record identity (454351 versus 31884), not on background actions being silent.",
    },
  ],
};

export const RETRIBUTION_FOREGROUND_ONLY_EXECUTIONS: readonly RetributionForegroundOnlyExecution[] = [
  AVENGING_WRATH_FOREGROUND_ONLY,
];

/** The pinned foreground-only fact for a token, or `null` when none is reviewed. */
export function retributionForegroundOnlyExecutionFor(
  simcToken: string,
): RetributionForegroundOnlyExecution | null {
  return RETRIBUTION_FOREGROUND_ONLY_EXECUTIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}
