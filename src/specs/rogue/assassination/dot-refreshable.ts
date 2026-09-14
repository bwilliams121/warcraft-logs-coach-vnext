/**
 * `refreshable` — one-sided, and the asymmetry is the whole design.
 *
 * WHAT THE PINNED SOURCE ACTUALLY SAYS, WHICH IS NOT WHAT THE GAME SAYS
 *
 * A reader who knows World of Warcraft will expect the 30 % pandemic rule. That
 * is NOT what the pinned SimulationCraft evaluates for a Rogue DoT, and the
 * difference is a factor of nearly three on Garrote.
 *
 *   dot.cpp:458-479      `refreshable` -> action->dot_refreshable( dot, new_duration )
 *   action.cpp:419       action_t's constructor sets dot_behavior( DOT_REFRESH_DURATION )
 *   sc_rogue.cpp         NEVER assigns dot_behavior — zero occurrences in the module
 *   action.cpp:4621-4637 dot_refreshable:
 *                          DOT_REFRESH_PANDEMIC  -> remains() <= triggered * 0.3
 *                          DOT_REFRESH_DURATION  -> ticks_left() <= 1        <-- ours
 *   dot.hpp:88           int ticks_left() const { return as<int>( std::ceil( ticks_left_fractional() ) ); }
 *   dot.cpp:672-684      ticks_left_fractional():
 *                          !ticking || !end_event            -> 0.0
 *                          tick_event                        -> 1.0 + ( remains() - time_to_next_full_tick() ) / tick_time
 *   dot.cpp:462-466      a dot that is not ticking is refreshable outright
 *
 * So the pinned predicate is `ticks_left() <= 1`, and pandemic is not involved.
 *
 * THE TWO DIRECTIONS THAT CAN BE PROVEN
 *
 * TRUE, when the DoT is proven NOT TICKING. `dot.cpp:462-466` returns `true`
 * before touching any duration at all, so this needs nothing but M4's aura state.
 *
 * FALSE, when the remainder EXCEEDS the BASE tick period. The chain:
 *
 *     ticks_left() <= 1
 *       <=> ceil( 1 + ( remains - ttnft ) / tick_time ) <= 1
 *       <=> remains <= ttnft                     (the fractional part is <= 0)
 *
 *     ttnft is the time to the NEXT scheduled tick, so ttnft <= tick_time
 *     tick_time <= baseTickPeriod                (see below)
 *
 *     therefore   remains > baseTickPeriod   ==>   remains > ttnft
 *                                            ==>   ticks_left() >= 2
 *                                            ==>   refreshable is FALSE
 *
 * WHY `tick_time <= baseTickPeriod` HOLDS, AND WHY IT IS THE ONLY BOUND NEEDED
 *
 * Two things scale a Rogue DoT's tick time, and BOTH only ever shorten it:
 *
 *     haste            tick_time = base / ( 1 + haste ), and haste is >= 0
 *     exsanguination   `tt *= 1.0 / get_exsanguinated_rate()` (sc_rogue.cpp:2619-2626),
 *                      and the rate is >= 1 (it is 1.0 at this commit — the only
 *                      setter sits in a function with no call site)
 *
 * That is what makes the base period a sound UPPER bound, and an upper bound on
 * the tick period is exactly what the FALSE direction needs. No haste model, no
 * exsanguination model, and no tick-schedule reconstruction is required.
 *
 * THE MIDDLE IS UNKNOWN, AND STAYS UNKNOWN
 *
 * Proving refreshable TRUE for a TICKING DoT would need a LOWER bound on the
 * tick period, which needs the player's haste at that instant. This project does
 * not reconstruct haste, so a ticking DoT with a small remainder is honestly
 * undecided — it is neither refreshable nor not.
 *
 * A HASTE DEBUFF WOULD BREAK THE BOUND, AND IS NOT SILENTLY ASSUMED AWAY.
 * `1 + haste` below 1 would lengthen the tick period. No such effect is modelled
 * or observed here, and the claim is recorded rather than buried so that a future
 * encounter mechanic which slows the player is a reason to revisit this file
 * rather than a silent wrong answer.
 */

import { dotDurationForToken } from "../../../data/game/rogue-dot-durations.js";
import type { DotRemainsBinding, DerivedDotState } from "./dot-remains-state.js";

/** Why `refreshable` could not be decided for one DoT. */
export type RefreshableBlocker =
  /** The pinned dataset carries no tick period for this token. */
  | "TICK_PERIOD_NOT_MODELLED"
  /** The DoT's remaining duration is not established, so nothing can be bounded. */
  | "REMAINS_NOT_ESTABLISHED"
  /**
   * The DoT is ticking and the remainder does not exceed the base tick period.
   *
   * NOT "refreshable is TRUE". Deciding that needs a LOWER bound on the tick
   * period, which needs haste. The remedy is a haste model, not more evidence.
   */
  | "WITHIN_ONE_BASE_TICK";

export const REFRESHABLE_BLOCKERS = [
  "TICK_PERIOD_NOT_MODELLED",
  "REMAINS_NOT_ESTABLISHED",
  "WITHIN_ONE_BASE_TICK",
] as const satisfies readonly RefreshableBlocker[];

/** How a decided `refreshable` was established. Never a bare boolean. */
export type RefreshableProof =
  /** `dot.cpp:462-466` — a DoT that is not ticking is refreshable outright. */
  | "NOT_TICKING"
  /** `remains > baseTickPeriod`, so at least two ticks remain. */
  | "REMAINDER_EXCEEDS_ONE_BASE_TICK";

export type RefreshableBinding =
  | {
      readonly state: "KNOWN";
      readonly refreshable: boolean;
      readonly proof: RefreshableProof;
      /** MILLISECONDS. The bound the proof rested on; `null` for `NOT_TICKING`. */
      readonly baseTickPeriodMs: number | null;
      /** SECONDS, as the derivation saw it; `null` for `NOT_TICKING`. */
      readonly remainsSeconds: number | null;
    }
  | { readonly state: "UNKNOWN"; readonly blocker: RefreshableBlocker };

/**
 * Decides `refreshable` for one DoT from its already-derived remaining duration.
 *
 * Takes the `DotRemainsBinding` rather than re-deriving, so the two answers
 * cannot disagree about the same DoT.
 */
export function bindRefreshable(simcToken: string, remains: DotRemainsBinding): RefreshableBinding {
  const identity = dotDurationForToken(simcToken);
  if (identity === null) return { state: "UNKNOWN", blocker: "TICK_PERIOD_NOT_MODELLED" };

  if (remains.state === "UNKNOWN") {
    // ONE refusal is a real answer rather than a gap: a DoT PROVEN not on the
    // target is refreshable, because `dot_t::create_expression` returns true
    // before looking at any duration. Every other refusal is genuinely unknown.
    if (remains.blocker === "DOT_NOT_ACTIVE") {
      return {
        state: "KNOWN",
        refreshable: true,
        proof: "NOT_TICKING",
        baseTickPeriodMs: null,
        remainsSeconds: null,
      };
    }
    return { state: "UNKNOWN", blocker: "REMAINS_NOT_ESTABLISHED" };
  }

  // MILLISECONDS on both sides. The binding is in seconds because
  // SimulationCraft expressions are; the comparison happens in milliseconds so
  // the pinned period is used exactly as extracted.
  const remainsMs = remains.remainsMs;
  if (remainsMs > identity.baseTickPeriodMs) {
    return {
      state: "KNOWN",
      refreshable: false,
      proof: "REMAINDER_EXCEEDS_ONE_BASE_TICK",
      baseTickPeriodMs: identity.baseTickPeriodMs,
      remainsSeconds: remains.remainsSeconds,
    };
  }

  // At or below one base tick. The DoT might have one tick left and might have
  // two, and only haste decides which.
  return { state: "UNKNOWN", blocker: "WITHIN_ONE_BASE_TICK" };
}

/** One decided `refreshable` per supported DoT, keyed by action token. */
export interface DerivedRefreshableState {
  readonly simcToken: string;
  readonly refreshable: RefreshableBinding;
}

/** Decides `refreshable` for every DoT whose remainder was derived. */
export function deriveRefreshableStates(
  states: readonly DerivedDotState[],
): readonly DerivedRefreshableState[] {
  return states.map((entry) => ({
    simcToken: entry.simcToken,
    refreshable: bindRefreshable(entry.simcToken, entry.remains),
  }));
}

/**
 * The expression-binding shape, from the DoTs whose `refreshable` is decided.
 *
 * An UNKNOWN one is OMITTED, so its atom is ENUMERATED across both worlds rather
 * than bound. That is the conservative direction: a verdict then survives only if
 * it holds whether the DoT is refreshable or not.
 */
export function refreshableBindingsFrom(
  states: readonly DerivedRefreshableState[],
): readonly { readonly actionToken: string; readonly refreshable: boolean }[] {
  const bindings: { actionToken: string; refreshable: boolean }[] = [];
  for (const entry of states) {
    if (entry.refreshable.state !== "KNOWN") continue;
    bindings.push({ actionToken: entry.simcToken, refreshable: entry.refreshable.refreshable });
  }
  return bindings;
}
