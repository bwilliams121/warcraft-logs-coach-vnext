/**
 * `line_cd=` from observed execution history (M11-D3-C3).
 *
 * THE PINNED SEMANTICS (SimulationCraft 33622e9d1662ff0e451691edf85a6b49cc9d11d9)
 *
 *   owner        every APL LINE is its own `action_t` (one `create_action` per
 *                line, player.cpp:4213-4243), and every action owns a private
 *                `cooldown_t( "line_cd" )` (action.cpp:502) — not one shared
 *                through `get_cooldown`. Two lines with the same token, in the
 *                same list or in different ones, keep independent timers
 *   option       `line_cd=<seconds>` (action.cpp:567) parsed by
 *                `util::to_double`, then `timespan_t::from_seconds`, which
 *                TRUNCATES `seconds * 1000` to whole milliseconds
 *                (option.cpp:157-162, timespan.hpp:74-77)
 *   start        `line_cooldown->start()` with no action, so no haste and no
 *                recharge multiplier: ready = now + duration
 *                (cooldown.cpp:428-511). A duration of 0 returns at once and
 *                never starts — `line_cd=0` is no restriction
 *     foreground at SELECTION, in `player_t::execute_action`, before the
 *                action is even queued (player.cpp:7388-7391): it starts even
 *                if the queued execution is later dropped or the cast fails
 *     off-GCD    after `execute()`, in `do_execute`, and only when the queued
 *                action still had a valid target (action.cpp:62-85)
 *     variable   NEVER. A variable line executes inline in `select_action`
 *                (player.cpp:14235-14241) through `variable_t::execute`, which
 *                does nothing a real action does (variable.cpp:258-330); its
 *                `action_ready` reads a timer nothing starts (variable.cpp:360)
 *     call       NEVER. `call_action_list` is recursed into, never returned
 *                as the action (player.cpp:14243-14262), so `execute_action`
 *                never sees it; its `action_ready` reads the same idle timer
 *                (action.cpp:4677)
 *     run / pseudo-actions  returned as the action, so at selection
 *   readiness    `action_ready` returns false while `line_cooldown->down()`,
 *                i.e. while `ready > now` (cooldown.cpp:422-423), checked
 *                before `if_expr` (action.cpp:2601-2611). So a line started at
 *                S is ready again at D exactly when D - S >= duration: AT the
 *                boundary it is ready. No queue window, no latency, no GCD.
 *   zero time    a line with a positive duration selected at t is NOT ready on
 *                a rescan at the same t (ready = t + duration > t)
 *   lifetime     `action_t::reset` calls `line_cooldown->reset_init()`
 *                (action.cpp:3037) from `player_t::reset` (player.cpp:6699)
 *                at every iteration: ready = -3600 s, so every line is ready at
 *                combat start. Precombat actions run through `execute()`
 *                directly (player.cpp:6153-6178), so nothing before the pull
 *                starts a line's timer
 *
 * WHAT THIS MODULE IS
 *
 * The readiness of one line's timer at one decision, from a history of LINE
 * SELECTIONS an evidence owner derived beforehand — never from a Warcraft Logs
 * call, never from the spell's own cooldown, never from simulated future
 * timing. The nested selector consumes the answer as a `LineCooldownResolver`.
 *
 * THE EVIDENCE BOUNDARY (revised in review). The timer's start event is the
 * line's SELECTION. A successful cast is evidence that a selection happened
 * at or before it, and nothing more:
 *
 *   - not WHEN: the selection may precede the cast by any queue delay or cast,
 *     so a cast gives an UPPER bound on its selection and no lower bound;
 *   - not ALL: a line may be selected and then dropped or fail, restarting its
 *     timer with no cast at all. Complete cast coverage is not complete
 *     selection coverage.
 *
 * So, from observed casts alone, a timer can be proven neither running nor
 * idle: e.g. line_cd=10, an attributed cast at t=0, a decision at t=15 — in
 * one world nothing was selected since and the line is ready; in another it
 * was selected again at t=12, dropped, cast nothing, and is not. Both worlds
 * have the same casts. Readiness from history needs SELECTION evidence:
 * proven selection coverage for READY, a proven lower bound on a selection
 * for NOT_READY. Ordinary cast history supplies neither, and is UNKNOWN.
 *
 * THE ATTRIBUTION PREMISE (approved): an observed cast of token X is evidence
 * about line L only when L is the SOLE in-combat player-action entry that can
 * produce X. Any other cast of X is AMBIGUOUS for every entry that could have
 * produced it: never proof of a specific line's selection, and inside the
 * window it prevents proving that line idle.
 */

import { aplLineKey, parseAplLine, type AplAction, type AplAuthority } from "./apl-authority.js";

export { aplLineKey };

// ---------------------------------------------------------------------------
// The option
// ---------------------------------------------------------------------------

/** What a line's `line_cd=` option says. */
export type LineCooldownOption =
  | { readonly kind: "ABSENT" }
  /** Whole milliseconds, truncated exactly as `timespan_t::from_seconds` does. */
  | { readonly kind: "DURATION"; readonly durationMs: number; readonly written: string }
  /** Not a plain non-negative decimal, or written more than once: refused. */
  | { readonly kind: "MALFORMED"; readonly written: string };

const ABSENT: LineCooldownOption = { kind: "ABSENT" };

const DECIMAL_SECONDS = /^[0-9]+(?:\.[0-9]+)?$/;

/** Reads `line_cd=` from a line's own top-level options. */
export function lineCooldownOptionOf(action: AplAction): LineCooldownOption {
  // Read for every line of every scan: the precomputed keys answer the common case.
  if (!action.actionOptionKeys.includes("line_cd")) return ABSENT;
  const structure = parseAplLine(action.actionStringVerbatim);
  const written = structure.options
    .filter((option) => option.key === "line_cd")
    .map((option) => option.value);
  if (written.length === 0) return ABSENT;
  const [text] = written;
  if (written.length > 1 || !structure.balanced || text === undefined || !isDecimalSeconds(text)) {
    return { kind: "MALFORMED", written: written.join(",") };
  }
  return { kind: "DURATION", durationMs: Math.trunc(Number(text) * 1000), written: text };
}

function isDecimalSeconds(text: string): boolean {
  return DECIMAL_SECONDS.test(text) && Number.isFinite(Number(text));
}

/** `action` without its `line_cd` option, for the readers that judge everything else on the line. */
export function withoutLineCooldownOption(action: AplAction): AplAction {
  return {
    ...action,
    unsupportedOptions: action.unsupportedOptions.filter((option) => option.optionKey !== "line_cd"),
  };
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

/** Whether one line's timer allows it at the decision being evaluated. */
export type LineCooldownReadiness =
  | {
      readonly kind: "READY";
      /**
       *   NO_RESTRICTION         a duration of 0: the timer never starts
       *   NO_SELECTION_IN_WINDOW PROVEN selection coverage shows no selection
       *                          of this line in the window that could still
       *                          hold its timer
       */
      readonly basis: "NO_RESTRICTION" | "NO_SELECTION_IN_WINDOW";
    }
  | {
      readonly kind: "NOT_READY";
      /**
       *   PROVEN_SELECTION       a selection of this line whose LOWER bound
       *                          proves it recent enough
       *   STARTED_THIS_DECISION  the line fired earlier in THIS decision's own
       *                          zero-time prefix, in the world being explored
       *                          — a selection this analyzer made itself, a
       *                          branch fact, never evidence about the log
       */
      readonly basis: "PROVEN_SELECTION" | "STARTED_THIS_DECISION";
      /** The least time the timer provably still runs. */
      readonly remainingAtLeastMs: number;
    }
  | {
      readonly kind: "UNKNOWN";
      /**
       *   NO_HISTORY_SUPPLIED            the caller supplied no history
       *   COMBAT_START_UNKNOWN           when this combat began is not established
       *   DECISION_BEFORE_COMBAT         the decision precedes the known pull
       *   SELECTION_COVERAGE_NOT_PROVEN  nothing proves every selection is known —
       *                                  a hidden selection may have restarted
       *                                  the timer (ordinary cast history)
       *   SELECTION_COVERAGE_INCOMPLETE  selection coverage is proven, but not
       *                                  over the whole window
       *   AMBIGUOUS_SELECTION            a selection that may have been this
       *                                  line's may lie in the window
       *   SELECTION_TIME_NOT_BOUNDED     a selection of this line may lie in the
       *                                  window, and may not
       */
      readonly reason:
        | "NO_HISTORY_SUPPLIED"
        | "COMBAT_START_UNKNOWN"
        | "DECISION_BEFORE_COMBAT"
        | "SELECTION_COVERAGE_NOT_PROVEN"
        | "SELECTION_COVERAGE_INCOMPLETE"
        | "AMBIGUOUS_SELECTION"
        | "SELECTION_TIME_NOT_BOUNDED";
    };

/** Supplies a line's readiness. Consulted only for a line with a positive duration. */
export type LineCooldownResolver = (action: AplAction, durationMs: number) => LineCooldownReadiness;

/** The default when a caller supplies none: never READY, never NOT_READY. */
export const NO_LINE_COOLDOWN_HISTORY: LineCooldownResolver = () => ({
  kind: "UNKNOWN",
  reason: "NO_HISTORY_SUPPLIED",
});

// ---------------------------------------------------------------------------
// The history contract
// ---------------------------------------------------------------------------

/**
 * When one SELECTION of a line happened, as far as evidence establishes it.
 *
 * `selectedAtMostMs`: the selection happened at or before this instant. An
 * observed cast establishes it — the line was selected before its action
 * executed (player.cpp:7390 precedes `queue_execute`).
 *
 * `selectedAtLeastMs`: the selection happened at or after this instant, or
 * `null` when nothing establishes one. An observed cast does NOT: the
 * selection precedes it by any queue delay and, for a cast-time spell, by the
 * cast, and nothing in the cast bounds either. Only a selection evidenced at
 * its own instant — such as one this analyzer made in its own modelled scan —
 * has a lower bound.
 */
export interface SelectionBound {
  readonly selectedAtLeastMs: number | null;
  readonly selectedAtMostMs: number;
}

/** What is known about one line's SELECTIONS in this fight. */
export interface LineSelections {
  /** Selections that were this line's (sole-entry attribution). */
  readonly attributed: readonly SelectionBound[];
  /** Selections that may have been this line's or another entry's. */
  readonly ambiguous: readonly SelectionBound[];
}

/**
 * Whether EVERY selection of every line in an interval is in this history.
 *
 *   SELECTION_COVERAGE_PROVEN  over `[fromMs, toMs]`, a selection absent from
 *                              this history did not happen. The only thing that
 *                              can make a timer provably idle.
 *   NOT_PROVEN                 what is complete, if anything, is something else
 *                              — `observedCastCoverage` records the interval
 *                              over which successful casts were fully
 *                              retrieved, which says nothing about selections
 *                              that cast nothing.
 */
export type SelectionCoverage =
  | { readonly kind: "SELECTION_COVERAGE_PROVEN"; readonly fromMs: number; readonly toMs: number }
  | {
      readonly kind: "NOT_PROVEN";
      readonly observedCastCoverage: { readonly fromMs: number; readonly toMs: number } | null;
    };

/** A line-selection history, already derived from evidence. */
export interface LineSelectionHistory {
  /** The known start of THIS combat, or `null` when it is not established. */
  readonly combatStartMs: number | null;
  readonly selectionCoverage: SelectionCoverage;
  selectionsOf(lineKey: string): LineSelections;
}

/** One observed successful cast of the player's, by the token the evidence owner mapped it to. */
export interface ObservedCast {
  readonly actionToken: string;
  /** The earliest observed timestamp of this execution (its begin-cast, else its cast). */
  readonly observedAtMs: number;
}

/**
 * Builds a selection history from OBSERVED CASTS, by sole-entry attribution.
 *
 * Each cast becomes a selection bounded ABOVE by the cast and not below. The
 * coverage is never `SELECTION_COVERAGE_PROVEN`, however complete the cast
 * retrieval: a selection that cast nothing is not in any cast log. So this
 * history can prove a timer neither running nor idle — it carries the
 * attribution and the evidence, and the rule below answers UNKNOWN.
 *
 * A token producible by exactly one in-combat player-action entry is
 * attributed to it; one producible by several is ambiguous for each of them.
 * `precombat` entries do not count: precombat starts no line's timer.
 * Variables, dispatches and pseudo-actions are not casts and are never
 * attributed anything.
 */
export function lineSelectionHistoryFromObservedCasts(input: {
  readonly authority: AplAuthority;
  readonly combatStartMs: number | null;
  /** The interval over which the player's successful casts were fully retrieved, if any. */
  readonly observedCastCoverage: { readonly fromMs: number; readonly toMs: number } | null;
  readonly casts: readonly ObservedCast[];
}): LineSelectionHistory {
  const entriesByToken = new Map<string, string[]>();
  for (const action of input.authority.actions) {
    if (action.listName === "precombat" || action.entryKind !== "PLAYER_ACTION") continue;
    const keys = entriesByToken.get(action.actionToken) ?? [];
    keys.push(aplLineKey(action));
    entriesByToken.set(action.actionToken, keys);
  }
  const attributed = new Map<string, SelectionBound[]>();
  const ambiguous = new Map<string, SelectionBound[]>();
  for (const cast of input.casts) {
    const keys = entriesByToken.get(cast.actionToken) ?? [];
    const into = keys.length === 1 ? attributed : ambiguous;
    const selection: SelectionBound = { selectedAtLeastMs: null, selectedAtMostMs: cast.observedAtMs };
    for (const key of keys) into.set(key, [...(into.get(key) ?? []), selection]);
  }
  return {
    combatStartMs: input.combatStartMs,
    selectionCoverage: { kind: "NOT_PROVEN", observedCastCoverage: input.observedCastCoverage },
    selectionsOf: (lineKey) => ({
      attributed: attributed.get(lineKey) ?? [],
      ambiguous: ambiguous.get(lineKey) ?? [],
    }),
  };
}

/**
 * The readiness of one line's timer at decision D, for duration N > 0.
 *
 *   NOT_READY  some ATTRIBUTED selection is proven in [pull, D) with a LOWER
 *              bound S_lo > D - N: then D - S < N for every S it allows (a
 *              selection before the pull would not count — the timer is reset
 *              there — so S_lo >= pull is required too). A later selection,
 *              seen or not, only keeps the timer running longer.
 *   READY      SELECTION coverage is proven over [max(pull, D - N), D), and no
 *              attributed or ambiguous selection may lie in (D - N, D) at or
 *              after the pull. At the boundary (S = D - N) the line is ready.
 *   UNKNOWN    everything else — including every history built from casts.
 */
export function lineCooldownReadinessAt(input: {
  readonly durationMs: number;
  readonly decisionTimeMs: number;
  readonly lineKey: string;
  readonly history: LineSelectionHistory;
}): LineCooldownReadiness {
  const { durationMs, decisionTimeMs: decision, history } = input;
  if (durationMs <= 0) return { kind: "READY", basis: "NO_RESTRICTION" };
  const combatStart = history.combatStartMs;
  if (combatStart === null) return { kind: "UNKNOWN", reason: "COMBAT_START_UNKNOWN" };
  if (decision < combatStart) return { kind: "UNKNOWN", reason: "DECISION_BEFORE_COMBAT" };

  const { attributed, ambiguous } = history.selectionsOf(input.lineKey);

  // NOT_READY: a selection proven in this combat, before the decision, and
  // proven recent — by its LOWER bound, never by its cast.
  let remainingAtLeastMs = 0;
  for (const selection of attributed) {
    const lo = selection.selectedAtLeastMs;
    if (lo === null || lo < combatStart || selection.selectedAtMostMs >= decision) continue;
    if (lo <= decision - durationMs) continue;
    const remaining = durationMs - (decision - lo);
    if (remaining > remainingAtLeastMs) remainingAtLeastMs = remaining;
  }
  if (remainingAtLeastMs > 0) return { kind: "NOT_READY", basis: "PROVEN_SELECTION", remainingAtLeastMs };

  // READY: every selection in the window is known...
  const coverage = history.selectionCoverage;
  if (coverage.kind !== "SELECTION_COVERAGE_PROVEN") {
    return { kind: "UNKNOWN", reason: "SELECTION_COVERAGE_NOT_PROVEN" };
  }
  const windowStart = Math.max(combatStart, decision - durationMs);
  if (coverage.fromMs > windowStart || coverage.toMs < decision) {
    return { kind: "UNKNOWN", reason: "SELECTION_COVERAGE_INCOMPLETE" };
  }
  // ...and none that could be this line's may lie inside it.
  const mayLieInWindow = (selection: SelectionBound) =>
    selection.selectedAtMostMs > decision - durationMs &&
    selection.selectedAtMostMs >= combatStart &&
    (selection.selectedAtLeastMs === null || selection.selectedAtLeastMs < decision);
  if (attributed.some(mayLieInWindow)) return { kind: "UNKNOWN", reason: "SELECTION_TIME_NOT_BOUNDED" };
  if (ambiguous.some(mayLieInWindow)) return { kind: "UNKNOWN", reason: "AMBIGUOUS_SELECTION" };
  return { kind: "READY", basis: "NO_SELECTION_IN_WINDOW" };
}

/**
 * The resolver a scan at one decision consumes.
 *
 * `linesStartedThisDecision` are the lines that fired earlier in the zero-time
 * prefix of the world being explored: each is NOT_READY for the rest of that
 * world (ready = D + duration > D). It is branch state, so it never reaches
 * `history`, which holds only the observed past.
 */
export function lineCooldownResolverFor(input: {
  readonly history: LineSelectionHistory | null;
  readonly decisionTimeMs: number;
  readonly linesStartedThisDecision: readonly string[];
}): LineCooldownResolver {
  return (action, durationMs) => {
    const lineKey = aplLineKey(action);
    if (durationMs > 0 && input.linesStartedThisDecision.includes(lineKey)) {
      return { kind: "NOT_READY", basis: "STARTED_THIS_DECISION", remainingAtLeastMs: durationMs };
    }
    if (input.history === null) {
      return durationMs <= 0
        ? { kind: "READY", basis: "NO_RESTRICTION" }
        : { kind: "UNKNOWN", reason: "NO_HISTORY_SUPPLIED" };
    }
    return lineCooldownReadinessAt({
      durationMs,
      decisionTimeMs: input.decisionTimeMs,
      lineKey,
      history: input.history,
    });
  };
}

/** What a step records about the line's timer. ABSENT on every step whose line carries none. */
export interface LineCooldownRecord {
  readonly durationMs: number;
  readonly readiness: LineCooldownReadiness;
}
