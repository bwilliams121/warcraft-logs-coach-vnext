/**
 * Ordered action selection WITHIN one named SimulationCraft action list.
 *
 * WHAT THIS ANSWERS, AND WHAT IT REFUSES TO ANSWER
 *
 * An APL list is an ordered priority list. This module answers:
 *
 *     given this state, which action token does THIS LIST select?
 *
 * It says nothing about whether the list is entered — that is the caller's gate
 * — and nothing about the globally ideal action, which would require every
 * higher-priority list and action in the whole APL.
 *
 * A TRUE CONDITION IS NOT A FIRING ACTION.
 *
 * SimulationCraft selects an action when its condition holds AND the action is
 * actually usable: off cooldown, in range, affordable, legal in the current
 * stance or stealth state. This project models none of that, and pretending a
 * true condition means the action fires would silently assert every one of those
 * things. So each line is combined with an `ActionUsability`, and a line becomes
 * a DEFINITE winner only when both halves are established.
 *
 * THE THREE OUTCOMES A LINE CAN HAVE
 *
 *     ELIMINATED       condition is definitely FALSE — it cannot win, whatever
 *                      its usability, so it is discarded soundly
 *     DEFINITE_WINNER  condition definitely TRUE and the action PROVEN_USABLE —
 *                      it fires, and every lower line is unreachable
 *     POSSIBLE         anything else. A true condition whose usability is
 *                      unknown, or an undecided condition. It MIGHT win.
 *
 * `POSSIBLE` is never converted into "did not fire". Absence of usability
 * evidence is not evidence of unusability, so there is no negative usability
 * state in this file at all.
 *
 * HOW AN EXACT ANSWER SURVIVES UNCERTAINTY
 *
 * Uncertainty about WHICH line fires does not have to mean uncertainty about
 * WHAT fires. If every line that might still win names the same action token,
 * the token is determined even though the line is not:
 *
 *     spend[0]  envenom, condition UNKNOWN_STATE  -> POSSIBLE
 *     spend[1]  envenom, condition TRUE + usable  -> DEFINITE_WINNER
 *
 * Either spend[0] fires or spend[1] does. Both are Envenom. The selected token
 * is Envenom under every legitimate resolution, so it is exact.
 *
 * If a higher POSSIBLE line named a DIFFERENT token, that reasoning collapses
 * and the result is indeterminate. This is the priority short-circuit rule from
 * `CLAUDE.md` made structural: an uncertain higher-priority line must never be
 * fallen through to reach a confident lower-priority answer.
 *
 * FAIL-CLOSED ON SYNTAX, ALWAYS.
 *
 * An unparseable condition ends the scan immediately. It is not skipped, not
 * treated as false, and not treated as UNKNOWN_STATE — the whole point of the
 * parser's whole-expression refusal is that unsupported syntax never reaches a
 * truth domain where a short-circuit could make it vanish.
 *
 * LAYERING
 *
 * This module knows nothing about Warcraft Logs, ability ids, findings or
 * specializations. Usability arrives as a callback over `AplAction`, so a caller
 * can decide per LINE rather than per token if line-specific semantics ever
 * matter. Lines are identified by their SimulationCraft-native coordinates —
 * list name, priority ordinal, verbatim string, source line — and the finding
 * layer converts those into an `AuthorityRef`. That keeps the dependency
 * one-way: findings may read SimC, SimC never reads findings.
 */

import type { AplAction, AplAuthority } from "./apl-authority.js";
import { parseSimcExpression, type ParseFailureReason } from "./expression/parse.js";
import { targetingOutcomeFor } from "./target-if.js";
import {
  actingAction,
  evaluateSimcExpression,
  type AtomBindings,
  type ExpressionTrace,
  type TruthValue,
} from "./expression/evaluate.js";

/**
 * Whether an action is known to have been usable at this decision point.
 *
 * `UNKNOWN` means we have no usability evidence; it does NOT mean unusable, and
 * no caller may read it that way.
 *
 * `PROVEN_UNUSABLE` was added in M5-C3c2 and means the opposite of UNKNOWN:
 * POSITIVE evidence that SimulationCraft's `ready()` could not have succeeded —
 * a cooldown proven to exceed the queueing tolerance, or an action whose
 * `ready()` is statically false. It is produced only by callers that model
 * readiness; `selectWithinList`'s existing callers never return it, so M5-B
 * behaviour is unchanged.
 *
 * The evidence behind a negative verdict lives in `ActionUsabilityVerdict`
 * (`action-applicability.ts`). This string is the decision input; that union is
 * the audit trail.
 */
export type ActionUsability = "PROVEN_USABLE" | "PROVEN_UNUSABLE" | "UNKNOWN";

export const ACTION_USABILITIES = [
  "PROVEN_USABLE",
  "PROVEN_UNUSABLE",
  "UNKNOWN",
] as const satisfies readonly ActionUsability[];

/** Supplies usability for one line. Takes the whole action, not just its token. */
export type ActionUsabilityResolver = (action: AplAction) => ActionUsability;

/** How a line's condition turned out. An unsupported condition has no truth value. */
export type LineCondition =
  | { readonly kind: "UNCONDITIONAL" }
  | { readonly kind: "EVALUATED"; readonly truth: TruthValue; readonly trace: ExpressionTrace }
  | {
      readonly kind: "UNSUPPORTED";
      readonly reason: ParseFailureReason | "TOO_MANY_UNRESOLVED_ATOMS";
      readonly fragment: string;
    }
  | {
      /**
       * The condition was never looked at, and SimulationCraft would not have
       * looked at it either.
       *
       * Added in M5-C3c2. `select_action` skips a background action before any
       * readiness check, and `action_ready()` checks readiness before `if_expr`
       * — so an inapplicable or proven-unusable entry never reaches its
       * condition. Recording that as UNCONDITIONAL would claim the line has no
       * condition; recording it as UNSUPPORTED would blame the parser for
       * something it was never asked to do.
       *
       * `selectWithinList` never produces this: it models no applicability and
       * no negative usability.
       */
      readonly kind: "NOT_EVALUATED";
      /**
       * `UNSUPPORTED_TARGETING` was added in M5-D1 and is a THIRD reason a
       * condition goes unevaluated, distinct from the two readiness ones.
       *
       * The entry carries `cycle_targets=` or `target_if=`, so its condition is
       * about a target this project does not enumerate. Evaluating it against the
       * implicit target would answer a different question, so the whole condition
       * is left alone. A target-INDEPENDENT conjunct may still have been proven
       * false; that proof lives in `TraversalStep.targetingRefusal`, not here,
       * because it is a claim about one fragment rather than about the line.
       */
      readonly why: "NOT_APPLICABLE" | "PROVEN_UNUSABLE" | "UNSUPPORTED_TARGETING";
    };

export type LineOutcome = "ELIMINATED" | "POSSIBLE" | "DEFINITE_WINNER";

/**
 * One evaluated line, in SimulationCraft-native coordinates.
 *
 * Carries no ability id, no locator and no finding evidence. The finding layer
 * owns all of that; duplicating it here would create a second copy of a fact
 * that could disagree with the canonical one.
 */
export interface LineEvaluation {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionStringVerbatim: string;
  readonly sourceLine: number;
  readonly actionToken: string;
  readonly condition: LineCondition;
  readonly usability: ActionUsability;
  readonly outcome: LineOutcome;
}

/**
 * Why a list's selection could not be determined.
 *
 * These names are shared verbatim with the scoped-selection blocker vocabulary
 * in `src/findings`. They are not synonyms of anything there — they are the same
 * reasons, and duplicating them under different spellings would mean a reader
 * has to learn that two words mean one thing.
 */
export type ListSelectionBlocker =
  | "UNSUPPORTED_AUTHORITY_EXPRESSION"
  | "COMPETING_POSSIBLE_ACTION"
  | "NO_DEFINITE_WINNER"
  | "NESTED_CALL_NOT_MODELLED"
  | "UNMODELLED_DISPATCH_IN_LIST"
  /**
   * The entry carries a targeting option this project does not model (M5-D1).
   *
   * Shares its name with `TraversalBlocker`'s member deliberately: it is the same
   * reason, and the two walkers must not spell one fact two ways.
   */
  | "UNSUPPORTED_ACTION_OPTION";

export const LIST_SELECTION_BLOCKERS = [
  "UNSUPPORTED_AUTHORITY_EXPRESSION",
  "COMPETING_POSSIBLE_ACTION",
  "NO_DEFINITE_WINNER",
  "NESTED_CALL_NOT_MODELLED",
  "UNMODELLED_DISPATCH_IN_LIST",
  "UNSUPPORTED_ACTION_OPTION",
] as const satisfies readonly ListSelectionBlocker[];

export type ListSelection =
  | {
      readonly kind: "SELECTED";
      readonly actionToken: string;
      /** The definitely-firing line. */
      readonly selectingLine: LineEvaluation;
      /** Every line that might still have won, including the selecting one. */
      readonly convergedOver: readonly LineEvaluation[];
      readonly lines: readonly LineEvaluation[];
    }
  | {
      /**
       * EXACT. Every line was definitively eliminated, so the list selects
       * nothing and `call_action_list` returns to its caller.
       *
       * Also the outcome for an authoritative list holding zero actions: there
       * is nothing that could have been selected. That is NOT the same as a list
       * absent from the authority, which is `LIST_ABSENT`.
       */
      readonly kind: "NO_ACTION_SELECTED";
      readonly lines: readonly LineEvaluation[];
    }
  | {
      readonly kind: "INDETERMINATE";
      readonly blocker: ListSelectionBlocker;
      /** The line responsible, when one can be named. */
      readonly blockedBy: LineEvaluation | null;
      readonly lines: readonly LineEvaluation[];
    }
  | {
      /** No such list in the authority. A hole in our model, not an empty list. */
      readonly kind: "LIST_ABSENT";
      readonly listName: string;
    };

/**
 * Evaluates one entry's `,if=` condition.
 *
 * EXPORTED so `nested-selection.ts` uses the SAME notion of a condition rather
 * than a second implementation of it. Two walkers with independently-written
 * ideas of when a condition is FALSE is a correctness hazard, not a style one:
 * they would disagree about which lines are soundly eliminated. Behaviour is
 * unchanged — this is the `export` keyword and nothing else.
 */
export function evaluateCondition(action: AplAction, bindings: AtomBindings): LineCondition {
  if (action.conditionRaw === null) {
    return { kind: "UNCONDITIONAL" };
  }
  // Parsed with the specialization vocabulary the bindings carry (M10-C), or
  // with none. The vocabulary rides on the bindings so the parser and the
  // evaluator read one declaration for one expression.
  const parsed = parseSimcExpression(action.conditionRaw, bindings.specAtoms?.vocabulary);
  if (!parsed.ok) {
    return { kind: "UNSUPPORTED", reason: parsed.reason, fragment: parsed.fragment };
  }
  // THE ACTING ACTION IS THIS ENTRY'S OWN TOKEN, and supplying it here is what
  // makes `remains` and `refreshable` mean what SimulationCraft means by them.
  // Both walkers route through this function, so neither can drift into reading
  // another action's DoT.
  const evaluation = evaluateSimcExpression(
    parsed.ast,
    action.conditionRaw,
    bindings,
    actingAction(action.actionToken),
  );
  if (evaluation.outcome === "UNSUPPORTED") {
    return { kind: "UNSUPPORTED", reason: evaluation.reason, fragment: action.conditionRaw };
  }
  const truth: TruthValue =
    evaluation.outcome === "RESOLVED" ? (evaluation.value ? "TRUE" : "FALSE") : "UNKNOWN_STATE";
  return { kind: "EVALUATED", truth, trace: evaluation.trace };
}

/** The truth an evaluated condition carries. Exported alongside `evaluateCondition`. */
export function truthOfCondition(condition: LineCondition): TruthValue {
  if (condition.kind === "UNCONDITIONAL") return "TRUE";
  if (condition.kind === "EVALUATED") return condition.truth;
  // UNSUPPORTED is unreachable here: it ends the scan before being combined.
  // NOT_EVALUATED is reachable only for entries already decided by applicability
  // or usability, whose outcome does not depend on this value.
  return "UNKNOWN_STATE";
}

/**
 * Combines a condition's truth with usability into a line outcome.
 *
 * Exported for the same reason as `evaluateCondition`: the nested walker must
 * eliminate exactly the lines this one eliminates, and no others.
 */
export function outcomeOf(truth: TruthValue, usability: ActionUsability): LineOutcome {
  // A definitely-false condition cannot win whatever its usability, so it is
  // discarded. This is the one sound elimination available: the asymmetry
  // between proving a line cannot fire and proving that it does.
  if (truth === "FALSE") return "ELIMINATED";
  // A proven-unusable action cannot win whatever its condition says — which is
  // why the condition need not be known. Added in M5-C3c2; no M5-B caller
  // produces this usability, so their behaviour is unchanged.
  if (usability === "PROVEN_UNUSABLE") return "ELIMINATED";
  if (truth === "TRUE" && usability === "PROVEN_USABLE") return "DEFINITE_WINNER";
  // TRUE with unknown usability, or UNKNOWN_STATE with unknown usability. Might win.
  return "POSSIBLE";
}

/**
 * Selects within one named list, in strict priority order.
 *
 * The scan stops at the first DEFINITE winner: lower lines are unreachable once
 * a higher line is known to fire, and evaluating them anyway would invite
 * reporting one of them.
 */
export function selectWithinList(
  authority: AplAuthority,
  listName: string,
  bindings: AtomBindings,
  usabilityFor: ActionUsabilityResolver,
): ListSelection {
  const lookup = authority.actionsInList(listName);
  if (!lookup.found) {
    return { kind: "LIST_ABSENT", listName };
  }

  const lines: LineEvaluation[] = [];

  for (const action of lookup.actions) {
    // `variable` / `cycling_variable`: SimulationCraft executes the entry and
    // CONTINUES the scan (player.cpp:14238), so it is never what a list returns
    // (M11-D1C). Stepped over exactly as the nested walker steps over it. Its
    // value is not computed here: a later condition reading it is refused or
    // unresolved at the expression layer, never decided by this skip.
    if (action.executesAndContinues) continue;

    // Control-flow constructs THIS single-list walker does not follow. Both
    // fail closed: a dispatch anywhere in the list could change which action
    // is reached, so no selection conclusion is available here. The nested
    // traversal models both (`call_action_list` since M5-C3b, `run_action_list`
    // since M11-B1); this walker deliberately models neither.
    if (action.isUnmodelledDispatch) {
      return {
        kind: "INDETERMINATE",
        blocker: "UNMODELLED_DISPATCH_IN_LIST",
        blockedBy: null,
        lines,
      };
    }
    if (action.callsListName !== null) {
      return {
        kind: "INDETERMINATE",
        blocker: "NESTED_CALL_NOT_MODELLED",
        blockedBy: null,
        lines,
      };
    }

    // ---- unsupported targeting options (M5-D1) ----
    //
    // The same rule the nested walker applies, and it must be here too: `core_dot`
    // is walked by BOTH, and its entries 2 and 4 carry `cycle_targets=1`. Before
    // M5-D1 those lines were unreachable because `refreshable` failed the parser;
    // now that it parses, an unguarded walk here would evaluate a cycling entry
    // against the one implicit target.
    // Since M11-D3-B1 the ONE rule both selectors share (`targetingOutcomeFor`):
    // a target-independent FALSE conjunct eliminates the line, a MIN/MAX
    // `target_if` whose `if=` reads only player state is evaluated as an
    // ordinary line below, and everything else is refused.
    const targeting = action.unsupportedOptions.length > 0 ? targetingOutcomeFor(action, bindings) : null;
    if (targeting !== null && targeting.kind !== "ORDINARY_LINE") {
      const elimination = targeting;
      const condition: LineCondition = { kind: "NOT_EVALUATED", why: "UNSUPPORTED_TARGETING" };
      const line: LineEvaluation = {
        listName: action.listName,
        priorityOrdinal: action.priorityOrdinal,
        actionStringVerbatim: action.actionStringVerbatim,
        sourceLine: action.sourceLine,
        actionToken: action.actionToken,
        condition,
        usability: usabilityFor(action),
        outcome: elimination.kind === "ELIMINATED_FOR_EVERY_TARGET" ? "ELIMINATED" : "POSSIBLE",
      };
      lines.push(line);
      if (elimination.kind === "ELIMINATED_FOR_EVERY_TARGET") continue;
      return {
        kind: "INDETERMINATE",
        blocker: "UNSUPPORTED_ACTION_OPTION",
        blockedBy: line,
        lines,
      };
    }

    const condition = evaluateCondition(action, bindings);

    if (condition.kind === "UNSUPPORTED") {
      // Recorded, then the scan ends. Never skipped, never read as false, and
      // never allowed to become UNKNOWN_STATE.
      const line: LineEvaluation = {
        listName: action.listName,
        priorityOrdinal: action.priorityOrdinal,
        actionStringVerbatim: action.actionStringVerbatim,
        sourceLine: action.sourceLine,
        actionToken: action.actionToken,
        condition,
        usability: usabilityFor(action),
        outcome: "POSSIBLE",
      };
      lines.push(line);
      return {
        kind: "INDETERMINATE",
        blocker: "UNSUPPORTED_AUTHORITY_EXPRESSION",
        blockedBy: line,
        lines,
      };
    }

    const usability = usabilityFor(action);
    const outcome = outcomeOf(truthOfCondition(condition), usability);
    const line: LineEvaluation = {
      listName: action.listName,
      priorityOrdinal: action.priorityOrdinal,
      actionStringVerbatim: action.actionStringVerbatim,
      sourceLine: action.sourceLine,
      actionToken: action.actionToken,
      condition,
      usability,
      outcome,
    };
    lines.push(line);

    if (outcome === "DEFINITE_WINNER") break;
  }

  const possible = lines.filter((line) => line.outcome !== "ELIMINATED");
  const definite = possible.find((line) => line.outcome === "DEFINITE_WINNER");

  if (definite === undefined) {
    if (possible.length === 0) {
      // Every line definitively eliminated — including the case of no lines at
      // all, where an authoritative empty list selects nothing, exactly.
      return { kind: "NO_ACTION_SELECTED", lines };
    }
    const first = possible[0];
    return {
      kind: "INDETERMINATE",
      blocker: "NO_DEFINITE_WINNER",
      blockedBy: first ?? null,
      lines,
    };
  }

  const competing = possible.find((line) => line.actionToken !== definite.actionToken);
  if (competing !== undefined) {
    return {
      kind: "INDETERMINATE",
      blocker: "COMPETING_POSSIBLE_ACTION",
      blockedBy: competing,
      lines,
    };
  }

  return {
    kind: "SELECTED",
    actionToken: definite.actionToken,
    selectingLine: definite,
    convergedOver: possible,
    lines,
  };
}
