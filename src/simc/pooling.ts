/**
 * SimulationCraft's waiting actions — `pool_resource`, `wait`,
 * `wait_until_ready` and `wait_for_cooldown` — and what each means for a
 * foreground scan (ONB-S5).
 *
 * All four are CORE actions (engine/player/player.cpp:11115-11126), not
 * specialization abilities, so their semantics belong to the shared engine.
 * There is no `wait_for` token at the pinned commit: an APL line naming one
 * is not built as any of these, and this module does not recognise it.
 *
 * THE PINNED SEMANTICS (SimulationCraft 33622e9d1662ff0e451691edf85a6b49cc9d11d9)
 *
 * `pool_resource` (`pool_resource_t`, player.cpp:10640-10816):
 *
 *   type        ACTION_OTHER, foreground, `quiet`; no spell, so no cost, no
 *               cooldown and no cast time — its own `action_t::ready()`
 *               (action.cpp:2631-2667) cannot fail, and it is usable while
 *               moving (action.cpp:2381-2396)
 *   options     `wait=` (a timespan), `for_next=` and `force_wait=` (bools),
 *               `resource=`, `extra_amount=` (an expression)
 *   for_next    `reset()` binds `next_action` to the NEXT entry of the same
 *               list's `foreground_action_list` (player.cpp:10715-10742).
 *               With no such entry the line becomes `background`. And when the
 *               entry written after it is itself background, `init()` prunes
 *               the pool line with it (action.cpp:2856-2865) — so the guarded
 *               line is always the very next line, or there is none
 *   readiness   with `next_action` (player.cpp:10765-10811), against the pooled
 *               resource (`resource=`, else the player's primary resource):
 *                 current < extra                   NOT ready
 *                 next ready at current − extra     NOT ready (no need to pool)
 *                 next NOT ready even at max        NOT ready (not resource
 *                                                   limited)
 *                 otherwise                         READY: it pools
 *               where "next ready" is `next_action->action_ready()` — its
 *               whole readiness, `if=` included. Without `next_action` it is
 *               ready whenever its own `if=` holds. `action_ready()` evaluates
 *               the pool line's own `if=` after `ready()` (action.cpp:2567-2621)
 *   execute     nothing but bookkeeping (player.cpp:10744-10751). `gcd()` is
 *               the wait: `wait=` plus `player->available()`, a ~100 ms draw
 *               (player.cpp:7130-7133), or with `force_wait=1` the time to
 *               afford the next action. `force_wait` and `wait=` change only
 *               that duration, never readiness
 *
 * `wait` / `wait_until_ready` / `wait_for_cooldown` (`wait_action_base_t` and
 * its children, player.cpp:9706-9840):
 *
 *   type        ACTION_OTHER, foreground, `quiet`, `trigger_gcd = 0`, targets
 *               the player. Executing it spends `execute_time()`: `sec=`
 *               (default 1.0 s), the earliest earlier-line cooldown or DoT
 *               for `wait_until_ready`, or the named cooldown's remains for
 *               `wait_for_cooldown`
 *   readiness   the base `action_ready()`, plus for `wait_for_cooldown` "the
 *               named cooldown is NOT ready". Because `execute_time() > 0`, the
 *               base readiness also fails while the player moves
 *               (action.cpp:2640-2641, 2386-2387), and when the previous
 *               foreground action was this same wait (action.cpp:2613-2618).
 *               Movement and that history are never established here, so a
 *               wait line whose `if=` holds is POSSIBLE at most
 *
 * WHAT THE SCAN RETURNS WHILE POOLING. A ready waiting line is RETURNED by the
 * foreground scan exactly like any action (player.cpp:14235-14264): the scan
 * ends, nothing below it is reached, and NO ability is cast. Simulated time
 * then passes before the next scan. So a waiting selection never names a GCD
 * action, and the first-GCD query (which supports only zero-time steps) refuses
 * it as `APL_WAIT_SELECTED` rather than reading past it.
 *
 * HOW AN OBSERVED CAST COMPARES. Against a decision whose authority selection
 * is a wait or a pool, an observed cast is never `MATCH` (no action was
 * selected) and, in this build, never `REJECTED` either: the comparison
 * vocabulary is public and has no pooling basis, so it is UNKNOWN
 * (`AUTHORITY_SELECTION_UNRESOLVED`) with the pooling step preserved as the
 * blocking evidence. See `agent/follow-ups.md` "After ONB-S5".
 *
 * WHAT STAYS SPEC-OWNED. Which atoms read the pooled resource, and what the
 * guarded line's readiness is with that resource at its maximum. The engine
 * asks a `PoolingResolver`; without one the answer is UNKNOWN, never assumed.
 */

import type { ActionUsabilityVerdict, UnusableReason } from "./action-applicability.js";
import { parseAplLine, type AplAction } from "./apl-authority.js";
import type { AtomBindings } from "./expression/evaluate.js";
import { evaluateCondition, outcomeOf, truthOfCondition } from "./list-selection.js";
import type { WaitActionKind } from "./wait-actions.js";

export { WAIT_ACTION_KINDS, waitActionOf, type WaitActionKind } from "./wait-actions.js";

/**
 * The option keys each waiting action may carry and still be modelled.
 *
 *   `if`          its own condition
 *   `sec`         a wait's DURATION; selection never reads it
 *   `name`        `wait_for_cooldown`'s cooldown; readiness is never proven
 *                 from it (charges make "remains > 0" differ from "not ready")
 *   `for_next`    whether the pool line guards the next line
 *   `wait`, `force_wait`  the pool's DURATION only (player.cpp:10792-10813)
 *   `resource`    which resource is pooled; handed to the resolver verbatim
 *
 * Everything else refuses, notably `extra_amount` (it moves the readiness test
 * by an evaluated amount) and `line_cd`.
 */
const MODELLED_OPTION_KEYS: Readonly<Record<WaitActionKind, readonly string[]>> = {
  POOL_RESOURCE: ["if", "for_next", "wait", "force_wait", "resource"],
  WAIT: ["if", "sec"],
  WAIT_UNTIL_READY: ["if", "sec"],
  WAIT_FOR_COOLDOWN: ["if", "name"],
};

const BOOLEAN_OPTION_KEYS = ["for_next", "force_wait"];

/**
 * A waiting line, read structurally.
 *
 *   MODELLED      every option is one this module models
 *   UNMODELLED    an option it does not model, a malformed structure, a
 *                 boolean that is not `0` or `1`, or an empty `sec=` (which
 *                 makes SimulationCraft background the line)
 *
 * `guardsNext` is true only for a pool line with `for_next=1`.
 */
export type WaitLineStructure =
  | {
      readonly kind: "MODELLED";
      readonly waitKind: WaitActionKind;
      readonly guardsNext: boolean;
      /** The `resource=` text verbatim, or `null` for the player's primary resource. */
      readonly resourceOption: string | null;
    }
  | {
      readonly kind: "UNMODELLED";
      readonly waitKind: WaitActionKind;
      readonly optionKeys: readonly string[];
    };

export function waitLineStructureOf(action: AplAction, waitKind: WaitActionKind): WaitLineStructure {
  const structure = parseAplLine(action.actionStringVerbatim);
  const modelled = MODELLED_OPTION_KEYS[waitKind];
  const refused: string[] = [...structure.malformedSegments];
  if (!structure.balanced) refused.push("(unbalanced quote or parenthesis)");
  const seen = new Set<string>();
  for (const option of structure.options) {
    const repeated = seen.has(option.key);
    seen.add(option.key);
    if (!modelled.includes(option.key) || repeated) refused.push(option.key);
    else if (BOOLEAN_OPTION_KEYS.includes(option.key) && option.value !== "0" && option.value !== "1") {
      refused.push(option.key);
    } else if (option.key === "sec" && option.value.trim().length === 0) refused.push(option.key);
  }
  if (refused.length > 0) return { kind: "UNMODELLED", waitKind, optionKeys: refused };
  const valueOf = (key: string): string | null =>
    structure.options.find((option) => option.key === key)?.value ?? null;
  return {
    kind: "MODELLED",
    waitKind,
    guardsNext: waitKind === "POOL_RESOURCE" && valueOf("for_next") === "1",
    resourceOption: waitKind === "POOL_RESOURCE" ? valueOf("resource") : null,
  };
}

/**
 * The guarded line's readiness with the pooled resource at its maximum, every
 * other piece of state — scan variables included — exactly as the scan has
 * it. That is what `next_action->action_ready()` sees after
 * `resources.current[ resource ] = resources.max[ resource ]`
 * (player.cpp:10783-10786): variables are not re-executed.
 */
export type GuardedReadinessAtMax =
  | { readonly kind: "READY_AT_MAX"; readonly basis: string }
  | { readonly kind: "NOT_READY_AT_MAX"; readonly basis: string }
  | { readonly kind: "UNKNOWN"; readonly detail: string };

export interface PoolingQuery {
  readonly poolLine: AplAction;
  readonly guardedLine: AplAction;
  /** The `resource=` text verbatim, or `null` for the player's primary resource. */
  readonly resourceOption: string | null;
  /** The scan's bindings at this line, assigned scan variables included. */
  readonly bindings: AtomBindings;
}

/** A specialization's answer to the at-maximum question. */
export type PoolingResolver = (query: PoolingQuery) => GuardedReadinessAtMax;

/** The default: no specialization model, so the at-maximum readiness is never assumed. */
export function noPoolingModel(): PoolingResolver {
  return () => ({
    kind: "UNKNOWN",
    detail: "no specialization model of the pooled resource at its maximum was supplied",
  });
}

/**
 * Proven-unusable reasons that raising the pooled resource cannot change:
 * cooldowns, static readiness, stealth and aura requirements. A guarded line
 * unusable for one of these is not ready at the maximum either, so the pool
 * line is not resource limited.
 *
 * `INSUFFICIENT_RESOURCE` is the opposite case and is never here.
 * `SIMULATED_PREFIX_EXECUTION` is a claim about a hypothetical branch, not
 * about a mechanic, so it is not here either: the resolver is asked.
 */
export const RESOURCE_INDEPENDENT_UNUSABLE_REASONS = [
  "ACTIVE_COOLDOWN",
  "STATIC_READY_FALSE",
  "ALREADY_STEALTHED",
  "RESTEALTH_NOT_PERMITTED_IN_COMBAT",
  "VANISH_BUFF_ALREADY_ACTIVE",
  "REQUIRED_AURA_INACTIVE",
] as const satisfies readonly UnusableReason[];

/**
 * What a `for_next` pool line decides, from its guarded line's readiness now
 * and at the maximum.
 *
 *   GUARDED_READY             the guarded line is ready now: no pooling, the
 *                             scan continues to it
 *   POOLS                     not ready now, ready at the maximum: the pool
 *                             line is ready (and fires if its `if=` holds)
 *   NOT_RESOURCE_LIMITED      not ready even at the maximum: no pooling
 *   PRUNED_WITH_GUARDED_LINE  the guarded line is background, or there is
 *                             none, so the pool line is background too
 *   UNDECIDED                 one of the two readings is not established
 *   PENDING                   the guarded line has not been read: the scan
 *                             stopped at or before it
 */
export type PoolDecision =
  "GUARDED_READY" | "POOLS" | "NOT_RESOURCE_LIMITED" | "PRUNED_WITH_GUARDED_LINE" | "UNDECIDED" | "PENDING";

export const POOL_DECISIONS = [
  "GUARDED_READY",
  "POOLS",
  "NOT_RESOURCE_LIMITED",
  "PRUNED_WITH_GUARDED_LINE",
  "UNDECIDED",
  "PENDING",
] as const satisfies readonly PoolDecision[];

/** The guarded line's readiness at the CURRENT resource, as the scan established it. */
export type GuardedReadinessNow = "READY" | "NOT_READY" | "UNDECIDED";

/** The pinned three-way rule, with `extra_amount` absent (it is refused). */
export function poolDecisionOf(now: GuardedReadinessNow, atMax: GuardedReadinessAtMax | null): PoolDecision {
  if (now === "READY") return "GUARDED_READY";
  if (now === "UNDECIDED") return "UNDECIDED";
  if (atMax === null || atMax.kind === "UNKNOWN") return "UNDECIDED";
  return atMax.kind === "READY_AT_MAX" ? "POOLS" : "NOT_RESOURCE_LIMITED";
}

/** What a traversal step records about a waiting line. */
export interface WaitActionRecord {
  readonly kind: WaitActionKind;
  /** Present only for a pool line with `for_next=1`. */
  readonly pooling?: {
    /** The guarded line, or `null` when the list has none after the pool line. */
    readonly guarded: {
      readonly listName: string;
      readonly priorityOrdinal: number;
      readonly actionToken: string;
    } | null;
    readonly resourceOption: string | null;
    readonly decision: PoolDecision;
    /** The at-maximum reading, when one was needed and taken. */
    readonly atMax?: GuardedReadinessAtMax;
  };
}

/**
 * A helper for a specialization's resolver: the guarded line's readiness
 * evaluated under bindings the specialization has rewritten so the pooled
 * resource reads its maximum, and a usability verdict for that same world.
 *
 * Deliberately narrow. A guarded line with any option this helper would have
 * to interpret (targeting, `line_cd`, anything unrecognised) is UNKNOWN; so is
 * an unsupported condition, and a TRUE condition without proven usability.
 */
export function guardedReadinessUnder(
  guardedLine: AplAction,
  bindingsAtMax: AtomBindings,
  usabilityAtMax: ActionUsabilityVerdict,
): GuardedReadinessAtMax {
  if (guardedLine.unsupportedOptions.length > 0) {
    return { kind: "UNKNOWN", detail: "the guarded line carries an option this helper does not interpret" };
  }
  if (usabilityAtMax.kind === "PROVEN_UNUSABLE") {
    return {
      kind: "NOT_READY_AT_MAX",
      basis: `guarded line unusable at the maximum: ${usabilityAtMax.reason}`,
    };
  }
  const gate = evaluateCondition(guardedLine, bindingsAtMax);
  if (gate.kind === "UNSUPPORTED") {
    return { kind: "UNKNOWN", detail: "the guarded line's condition is outside the supported subset" };
  }
  const usability = usabilityAtMax.kind === "PROVEN_USABLE" ? "PROVEN_USABLE" : "UNKNOWN";
  const outcome = outcomeOf(truthOfCondition(gate), usability);
  if (outcome === "ELIMINATED")
    return { kind: "NOT_READY_AT_MAX", basis: "guarded condition FALSE at the maximum" };
  if (outcome === "DEFINITE_WINNER") {
    return { kind: "READY_AT_MAX", basis: "guarded condition TRUE and usable at the maximum" };
  }
  return { kind: "UNKNOWN", detail: "the guarded line's readiness at the maximum is not established" };
}
