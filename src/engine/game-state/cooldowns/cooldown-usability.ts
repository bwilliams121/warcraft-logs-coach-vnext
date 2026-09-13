/**
 * Turning a derived cooldown into a readiness claim.
 *
 * `cooldown-state.ts` answers a FACTUAL question — how much time remains. This
 * file answers an INTERPRETIVE one — whether SimulationCraft's `ready()` could
 * have succeeded. They are kept in separate files because they fail for
 * different reasons and belong to different layers: the first is derived game
 * state, the second is actionability.
 *
 * THE RULE IS NOT `remaining > 0`, AND THAT IS THE WHOLE POINT
 *
 * SimulationCraft does not require a cooldown to have expired:
 *
 *     bool cooldown_t::is_ready() const {
 *       if ( up() ) return true;
 *       if ( !action || !player ) return up();
 *       return queueable() <= sim.current_time();     // cooldown.cpp:684-703
 *     }
 *
 *     timespan_t cooldown_t::queueable() const {
 *       return ready - player->cooldown_tolerance();  // cooldown.cpp:655-658
 *     }
 *
 * So an action whose cooldown has 100 ms left IS ready, because the player is
 * assumed to queue it. A bridge built on `remaining > 0` would therefore call
 * ready actions unusable — a false negative that silently removes a real
 * candidate from the priority scan.
 *
 * The sound rule is:
 *
 *     provenRemaining > cooldownTolerance   ->  PROVEN_UNUSABLE
 *
 * and nothing weaker.
 *
 * THE TOLERANCE IS AN INPUT, NEVER A CONSTANT
 *
 * `player_t::cooldown_tolerance()` (player.cpp:14335) returns the per-player
 * override when one is set and `sim->default_cooldown_tolerance` otherwise; that
 * default is 250 ms (sim.cpp:1426) and BOTH are configurable options
 * (player.cpp:13247, sim.cpp:3846). A profile that cannot establish the
 * tolerance gets UNKNOWN rather than a baked-in guess.
 *
 * WHAT THIS NEVER CONCLUDES
 *
 * It never concludes an action IS ready. A bound at or below the tolerance means
 * the cooldown MIGHT be queueable and might not — and readiness also depends on
 * resources, range and stance, none of which this project models. Only the
 * negative direction is claimed.
 *
 * THIS BRIDGE IS FOR THE ORDINARY ACTION COOLDOWN ONLY. An item's shared
 * category cooldown is checked with a strict `remains() > 0` and no tolerance
 * (`use_item_t::ready`), so it obeys a different rule and must not be routed
 * through here.
 */

import { guaranteedRemainingMs, type CooldownState } from "./cooldown-state.js";

/**
 * The result of interpreting a cooldown as readiness.
 *
 * Deliberately NOT `ActionUsabilityVerdict`: that type lives in `src/simc` and
 * carries authority-layer vocabulary, and this module is engine-side. The
 * spec adapter translates. Keeping the dependency pointing one way is what
 * stops the engine from growing an opinion about authority actions.
 */
export type CooldownReadiness =
  | {
      /** Proven: the cooldown exceeds the tolerance, so `ready()` cannot succeed. */
      readonly state: "PROVEN_NOT_READY";
      readonly provenRemainingAtLeastMs: number;
      readonly cooldownToleranceMs: number;
    }
  | {
      readonly state: "UNKNOWN";
      readonly reason: CooldownReadinessUnknownReason;
    };

export type CooldownReadinessUnknownReason =
  /** The cooldown itself could not be derived. */
  | "COOLDOWN_STATE_UNKNOWN"
  /** No tolerance was established, so the comparison has no threshold. */
  | "COOLDOWN_TOLERANCE_NOT_ESTABLISHED"
  /**
   * The remainder does not clear the tolerance.
   *
   * NOT a readiness claim: SimulationCraft might queue it, and might not.
   */
  | "WITHIN_QUEUEING_TOLERANCE";

export interface CooldownReadinessInput {
  readonly cooldown: CooldownState;
  /** MILLISECONDS, from the authority simulation profile. `null` when unestablished. */
  readonly cooldownToleranceMs: number | null;
}

/**
 * Decides whether a derived cooldown proves the action could not fire.
 *
 * Strictly greater than the tolerance. At exactly the tolerance SimulationCraft
 * would queue the action — `queueable() <= now` is inclusive — so equality is
 * UNKNOWN, not proven.
 */
export function cooldownReadinessAt(input: CooldownReadinessInput): CooldownReadiness {
  const { cooldown, cooldownToleranceMs } = input;

  if (cooldownToleranceMs === null || !Number.isFinite(cooldownToleranceMs) || cooldownToleranceMs < 0) {
    return { state: "UNKNOWN", reason: "COOLDOWN_TOLERANCE_NOT_ESTABLISHED" };
  }

  const remaining = guaranteedRemainingMs(cooldown);
  if (remaining === null) {
    return { state: "UNKNOWN", reason: "COOLDOWN_STATE_UNKNOWN" };
  }

  if (remaining > cooldownToleranceMs) {
    return {
      state: "PROVEN_NOT_READY",
      provenRemainingAtLeastMs: remaining,
      cooldownToleranceMs,
    };
  }

  // At or below the tolerance. The action may well be ready, and this module
  // does not claim either way.
  return { state: "UNKNOWN", reason: "WITHIN_QUEUEING_TOLERANCE" };
}
