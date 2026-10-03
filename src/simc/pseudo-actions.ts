/**
 * SimulationCraft's two retarget pseudo-actions, and what each means for the
 * first-GCD query (M11-D3-B2).
 *
 * Both are CORE actions (engine/player/player.cpp:11127-11130), not
 * specialization abilities, so their semantics belong to the shared engine.
 * They are different actions with different side effects and are NOT one
 * abstraction.
 *
 * THE PINNED SEMANTICS (SimulationCraft 33622e9d1662ff0e451691edf85a6b49cc9d11d9)
 *
 * `retarget_auto_attack` (`retarget_auto_attack_t`, player.cpp:10820-10858):
 *
 *   type        ACTION_OTHER, foreground, `quiet`, `use_off_gcd`,
 *               `trigger_gcd = 0`; no cast time, no cost, no cooldown
 *   readiness   OVERRIDES `action_ready`: the base readiness — `ready()`,
 *               then `select_target()` (so `target_if` participates), then
 *               `if=` — AND a main- or off-hand attack whose target differs
 *               from the target this action chose. That last clause reads
 *               auto-attack state and target identity this project never has,
 *               so the line is at most POSSIBLE, never proven to fire
 *   execute     OVERRIDES `execute` and never calls the base: it only
 *               `set_target()`s the main- and off-hand attacks. No damage,
 *               resource, buff, debuff, cooldown or GCD
 *   unchanged   `player->target`, every other action's target, pets
 *
 * `retarget` (`retarget_t`, player.cpp:10862-10883):
 *
 *   type        ACTION_OTHER, foreground, `quiet`, `trigger_gcd = 0`
 *   readiness   NOT overridden: `ready()`, `select_target()`, `if=`
 *   execute     `player->target = target`; every player action and every pet
 *               action `acquire_target( SELF_RETARGET, … )`, which assigns the
 *               new target outright for that event (action.cpp:5105-5149);
 *               every pet's `target` too
 *
 * So `retarget` changes the enemy EVERY later target-scoped atom reads:
 * subsequent `select_target()` calls reset to the new `player->target`
 * (action.cpp:2431-2432), and ordinary actions read their reassigned
 * `target`. `retarget_auto_attack` changes only where auto attacks land.
 *
 * TIMING, both. `player_t::execute_action` starts the line cooldown and
 * `queue_execute`s the action (player.cpp:7390-7391), which posts a zero-delay
 * execute event (action.cpp:2161-2181, 2234-2246). After `execute()` a
 * foreground action calls `schedule_ready( 0 )` (action.cpp:286-294); with
 * `gcd() == 0`, the default `ability_lag` of zero and the default
 * `add_queue_lag` of false (action.cpp:375, 420), the lag is zero
 * (player.cpp:6946-6969), so the next selection is a ready event at the SAME
 * timestamp. Events are ordered by `(time, id)` with ids assigned on first
 * insertion (engine/sim/event_manager.cpp:114-178): every event already queued
 * at that timestamp fires before the execute event, and nothing is inserted
 * between the execute event and the ready event it creates. No swing, regen
 * tick or proc can observe the change before the next selection.
 *
 * WHAT CAN OBSERVE `retarget_auto_attack` BEFORE THE NEXT SELECTION. Its
 * execution writes the auto-attack targets, `last_foreground_action`
 * (player.cpp:7380) and its own line cooldown. Across every pinned core
 * source and class module, the only reader of either that runs at the
 * zero-time decision is the `prev.<action>` expression (action.cpp:3705-3724);
 * auto-attack targets are read only by time-driven events (a Monk channel's
 * last tick), `last_foreground_action` otherwise only inside a GCD
 * (Evoker `hover`), by lag scheduling, or by this action's own readiness.
 * It is `quiet`, so `prev_gcd` and `prev_off_gcd` histories are untouched
 * (player.cpp:7392-7402).
 */

import type { AtomBindings } from "./expression/evaluate.js";
import type { AplAction } from "./apl-authority.js";

export type PseudoActionKind = "RETARGET" | "RETARGET_AUTO_ATTACK";

export const PSEUDO_ACTION_KINDS = [
  "RETARGET",
  "RETARGET_AUTO_ATTACK",
] as const satisfies readonly PseudoActionKind[];

/** The pseudo-action an APL token denotes, or `null`. Keyed on the token alone, as SimulationCraft builds it. */
export function pseudoActionOf(actionToken: string): PseudoActionKind | null {
  if (actionToken === "retarget") return "RETARGET";
  if (actionToken === "retarget_auto_attack") return "RETARGET_AUTO_ATTACK";
  return null;
}

/**
 * What a pseudo-action line's firing means for the first GCD.
 *
 *   NO_FIRST_GCD_EFFECT        `retarget_auto_attack` whose firing nothing
 *                              before the next selection can observe: the
 *                              world in which it fires converges with the
 *                              world in which it does not
 *   TARGET_IDENTITY_REQUIRED   `retarget`: firing moves every later
 *                              target-scoped read to an enemy nobody named
 *   NOT_PROVEN                 `retarget_auto_attack` on a line, or under a
 *                              vocabulary, where that proof does not hold
 */
export type FirstGcdPseudoEffect =
  | { readonly kind: "NO_FIRST_GCD_EFFECT" }
  | { readonly kind: "TARGET_IDENTITY_REQUIRED" }
  | {
      readonly kind: "NOT_PROVEN";
      /**
       *   PREV_ATOM_DECLARED   the vocabulary declares a `prev.` identifier, which
       *                        reads `last_foreground_action` — the one thing a
       *                        zero-time scan can see this action change
       *   UNMODELLED_OPTION    an option beyond `if`, `target_if` and `line_cd`
       *                        (`add_queue_lag=`, for one, adds lag before the
       *                        next selection, in which a swing could land)
       */
      readonly reason: "PREV_ATOM_DECLARED" | "UNMODELLED_OPTION";
    };

/** The pseudo-action record a traversal step carries. */
export interface PseudoActionRecord {
  readonly kind: PseudoActionKind;
  readonly firstGcdEffect: FirstGcdPseudoEffect;
}

/**
 * The option keys a `retarget_auto_attack` line may carry and still be
 * proven irrelevant to the first GCD. `if` and `target_if` only decide
 * readiness, which does not matter when firing does not; `line_cd` only
 * makes the line LESS ready (`line_cooldown->down()` in `action_ready`,
 * action.cpp:2601-2602) and starts its own cooldown when selected
 * (player.cpp:7390). No `line_cd` semantics are modelled — the line's
 * readiness is never evaluated at all.
 */
const IRRELEVANCE_OPTION_KEYS: readonly string[] = ["if", "target_if", "line_cd"];

/** The first-GCD effect of one pseudo-action line, under the scan's bindings. */
export function firstGcdPseudoEffectOf(
  action: AplAction,
  kind: PseudoActionKind,
  bindings: AtomBindings,
): FirstGcdPseudoEffect {
  if (kind === "RETARGET") return { kind: "TARGET_IDENTITY_REQUIRED" };
  if (action.actionOptionKeys.some((key) => !IRRELEVANCE_OPTION_KEYS.includes(key))) {
    return { kind: "NOT_PROVEN", reason: "UNMODELLED_OPTION" };
  }
  const declarations = bindings.specAtoms?.vocabulary.declarations ?? [];
  if (declarations.some((declaration) => declaration.identifier.startsWith("prev."))) {
    return { kind: "NOT_PROVEN", reason: "PREV_ATOM_DECLARED" };
  }
  return { kind: "NO_FIRST_GCD_EFFECT" };
}
