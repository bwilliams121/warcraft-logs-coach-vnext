/**
 * Action selection ACROSS nested SimulationCraft action lists.
 *
 * `list-selection.ts` answers "which action does THIS list select", and refuses
 * outright when it meets a `call_action_list`. This module follows the call.
 *
 * THE PINNED CONTRACT, AND IT IS SHORTER THAN IT LOOKS
 *
 * `player_t::select_action` (player.cpp:14180-14271) walks a list in order and,
 * for each entry whose `action_ready()` holds, does exactly one of three things:
 *
 *     ACTION_VARIABLE   execute, then CONTINUE the same scan
 *     ACTION_CALL       recurse; if the callee returns an action, RETURN it;
 *                       otherwise fall through and CONTINUE the same scan
 *     anything else     RETURN it — the scan is over
 *
 * `run_action_list` IS "anything else" (M11-B1). It is not `ACTION_CALL` —
 * `call_action_list_t` is the only `ACTION_CALL` — so a ready `run_action_list`
 * entry is RETURNED by the loop (player.cpp:14264-14267) and executes at zero
 * time: it remembers the list to restore and activates its child
 * (action.cpp:4740-4754). The very next `execute_action` selects from the
 * CHILD (player.cpp:7376-7377) and restores the parent only after that
 * selection (player.cpp:7382-7386). Two consequences, both modelled below:
 *
 *     the parent's entries BELOW a fired run entry are never reached — the
 *     selection that follows starts in the child, not at the next ordinal
 *
 *     a child that selects nothing yields NO action for this selection: there
 *     is no fall-through back into the parent, unlike a call that returns
 *     nothing
 *
 * A run entry whose gate is proven FALSE is skipped like any other not-ready
 * entry (player.cpp:14235). A run entry whose gate cannot be decided has two
 * worlds — the parent continues, or the child replaces the parent — and since
 * M11-D3-A both are explored (M11-B1 blocked with `UNDECIDED_RUN_GATE` without
 * exploring). The child's selections join as possible candidates; a child that
 * may select nothing is a world in which the whole selection is NOTHING, which
 * no later candidate can overrule. Exploration may CONVERGE the gate — a
 * result every world agrees on replaces it — but never MOVES the stop: when
 * the worlds disagree, or either is unresolved, the scan stops at the gate
 * with `UNDECIDED_RUN_GATE`, exactly as an unexplored gate did. See
 * `scanRunDispatch` and `Collapse`.
 *
 * Three consequences this module is built around:
 *
 * 1. THE GCD LANE IS NOT CONSULTED. There is no branch on `trigger_gcd` in the
 *    selection loop at all. A zero-GCD action is returned and ENDS the scan
 *    exactly like any other; it simply does not advance `gcd_ready`, so a NEW
 *    scan follows it later. "Zero GCD" and "executes and continues" are
 *    different things, and only `variable` is the second.
 *
 * 2. A CALL THAT RETURNS NOTHING IS NOT AN ERROR. It falls out of the `if` and
 *    the parent keeps scanning at the next ordinal. That is what makes the
 *    empty-child convergence rule below sound rather than clever.
 *
 * 3. THE CYCLE GUARD IS THE ACTIVE CALL STACK, not a set of every list ever
 *    visited. `visited_apls_` is saved before the loop and RESTORED at the top
 *    of every iteration (14180-14202), so two sibling calls to the same list are
 *    perfectly legal; only re-entering a list that is still on the stack is the
 *    infinite loop SimulationCraft throws on.
 *
 * REASONING UNDER UNCERTAINTY, WHICH SIMULATIONCRAFT NEVER HAS TO DO
 *
 * SimulationCraft knows every condition's value. We often do not, and the whole
 * difficulty of this module is in what an undecided gate means for control flow.
 *
 * A call whose gate is undecided has TWO worlds:
 *
 *     gate FALSE  ->  child not entered  ->  parent continues at the next ordinal
 *     gate TRUE   ->  child entered      ->  whatever the child returns
 *
 * If the child is PROVEN to return no action, the TRUE world ALSO continues the
 * parent at the next ordinal. Both worlds agree on the continuation, so the
 * undecided gate is not a blocker at all and the scan proceeds. This is the
 * single most valuable rule here, and it is why an unparseable gate above a
 * provably-empty list does not poison everything beneath it. (One exception,
 * since M11-B1: a callee that reached a certain `run_action_list` did NOT fall
 * off its end — it transferred the selection — so that rule does not apply to
 * it, and an undecided gate above such a callee blocks instead.)
 *
 * If instead the child might return an action, the two worlds disagree, and the
 * child's action becomes a POSSIBLE candidate while the scan continues to see
 * what the FALSE world would have reached. An exact answer then survives only if
 * every candidate names the same action — the same convergence rule
 * `list-selection.ts` applies within one list, extended across the call.
 *
 * WHAT PRIORITY MEANS ACROSS A CALL
 *
 * A child's action outranks every LATER entry of the caller, because in the
 * pinned loop the call returns before those entries are ever reached. So an
 * unresolved child blocks the entries below its call site — it cannot be stepped
 * over on the grounds that something lower is decidable. That is the
 * priority short-circuit rule from `CLAUDE.md`, applied to control flow rather
 * than to a single list.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * It models control flow and nothing else. It has no cooldown model, no
 * readiness engine, and no notion of which actions matter. Usability arrives as
 * the caller's `ActionUsability` callback and is never inferred — in particular,
 * observing that a LOWER-priority action was cast is not evidence that a higher
 * one was unusable, and there is no code path here that could express that.
 *
 * LAYERING
 *
 * Generic. No spell ids, no list names, no specialization vocabulary, no
 * Warcraft Logs. A spec adapter supplies the authority, the bindings, the
 * usability evidence and the starting boundary.
 */

import { isMalformedAuthorityLine, type AplAction, type AplAuthority } from "./apl-authority.js";
import type { AplEntryKind } from "./apl-authority.js";
import {
  evaluateCondition,
  outcomeOf,
  truthOfCondition,
  type ActionUsability,
  type LineCondition,
} from "./list-selection.js";
import {
  allApplicable,
  noGateIrrelevance,
  type ActionApplicability,
  type ActionApplicabilityResolver,
  type ActionUsabilityVerdict,
  type ActionUsabilityVerdictResolver,
  type GateIrrelevance,
  type GateIrrelevanceResolver,
} from "./action-applicability.js";
import {
  initialScanVariables,
  joinScanVariables,
  type AtomBindings,
  type ScanVariables,
} from "./expression/evaluate.js";
import type { TargetIndependenceFailure, TargetIndependentElimination } from "./target-independence.js";
import { targetingOutcomeFor, type TargetIfVerdict, type TargetingOutcome } from "./target-if.js";
import { firstGcdPseudoEffectOf, pseudoActionOf, type PseudoActionRecord } from "./pseudo-actions.js";
import { executeVariableLine, type VariableExecutionRecord } from "./variable-execution.js";

// --------------------------------------------------------------------------
// Path and trace
// --------------------------------------------------------------------------

/**
 * One entry on the control-flow path, in SimulationCraft-native coordinates.
 *
 * The caller is never flattened away: a path of `default[5] -> cds[0]` says
 * something a bare `cds[0]` does not, namely how we got there.
 */
export interface TraversalPathEntry {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionToken: string;
}

/**
 * What the traversal did at one entry.
 *
 * Named for the CONTROL-FLOW decision rather than the entry's truth value, since
 * that is what a reader reconstructing an UNKNOWN needs to follow.
 */
export type TraversalStepOutcome =
  /** Condition proven FALSE. Skipped; the scan continues. */
  | "ELIMINATED_CONTINUE"
  /** `variable`: executes and the scan continues. Never a selected action. */
  | "VARIABLE_EXECUTED_CONTINUE"
  /** A call whose gate is proven FALSE. NOT recursed into. */
  | "CALL_GATE_FALSE_SKIPPED"
  /** A call whose callee is proven to return nothing. The parent continues. */
  | "CALL_RETURNED_NO_ACTION_CONTINUE"
  /** A call whose callee might return an action. Contributes candidates. */
  | "CALL_MAY_SELECT"
  /** A call whose callee definitely returns an action, under a certain gate. */
  | "CALL_SELECTED"
  /**
   * A call whose gate is certain and whose callee TRANSFERRED selection through
   * a `run_action_list` (M11-B1). The callee's candidates are carried verbatim
   * and the caller's walk ends here — the run inside the callee was the action
   * the call returned, so nothing below this call site is part of the
   * selection. Distinct from `CALL_RETURNED_NO_ACTION_CONTINUE`: a callee that
   * merely fell off its end lets the caller continue; one that transferred
   * does not, even when it offers no candidate.
   */
  | "CALL_TRANSFERRED_SCAN_ENDS"
  /**
   * A `run_action_list` whose gate is proven FALSE (M11-B1). NOT entered; the
   * parent continues at its next ordinal, exactly as for a not-ready entry.
   */
  | "RUN_GATE_FALSE_SKIPPED"
  /**
   * A `run_action_list` whose gate is certain and whose child offered at least
   * one candidate (M11-B1). The child's candidates ARE this scan's remaining
   * candidates, and the parent's later entries were never visited — the run
   * transfers selection into the child for this scan and does not resume the
   * parent. Distinct from `CALL_SELECTED`: a call returns to its caller, a run
   * does not.
   */
  | "RUN_ENTERED_SCAN_ENDS"
  /**
   * A `run_action_list` whose gate is certain and whose child is PROVEN to
   * select nothing (M11-B1). The scan ENDS here with no contribution: in the
   * pinned loop the child list is the active list for the selection that
   * follows the run, so a child that selects nothing is a selection of nothing.
   * The parent's later entries are NOT consulted. Distinct from
   * `CALL_RETURNED_NO_ACTION_CONTINUE`, which continues the caller.
   */
  | "RUN_RETURNED_NO_ACTION_SCAN_ENDS"
  /**
   * A `run_action_list` whose gate is UNDECIDED (M11-D3-A). Both worlds are
   * explored: the child was scanned for the TRUE world (its candidates become
   * POSSIBLE candidates, and a child that may select nothing records a world
   * in which this selection is NOTHING), and the parent continues at its next
   * ordinal for the FALSE world. Distinct from `CALL_MAY_SELECT`: the TRUE
   * world never returns to the parent.
   */
  | "RUN_GATE_UNDECIDED_MAY_TRANSFER"
  /**
   * A `call_action_list` whose gate is UNDECIDED and whose callee TRANSFERRED
   * selection through a `run_action_list` (M11-D3-A). The same two worlds as
   * `RUN_GATE_UNDECIDED_MAY_TRANSFER`, one level up: the TRUE world ended in
   * the callee's run, the FALSE world continues here.
   */
  | "CALL_GATE_UNDECIDED_MAY_TRANSFER"
  /**
   * The entry is not a selectable action for this player at all.
   *
   * Mirrors `if (a->background) continue;`. Its condition was NEVER evaluated.
   */
  | "NOT_APPLICABLE_CONTINUE"
  /**
   * The entry applies but is proven unable to fire. Its condition was NEVER
   * evaluated, because SimulationCraft checks readiness before `if_expr`.
   *
   * Distinct from `ELIMINATED_CONTINUE`, which means the CONDITION was proven
   * false. Both continue the scan; they are not the same fact.
   */
  | "PROVEN_UNUSABLE_CONTINUE"
  /**
   * The entry cycles or retargets, and a TARGET-INDEPENDENT conjunct of its
   * condition is proven FALSE (M5-D1).
   *
   * A distinct outcome from `ELIMINATED_CONTINUE`, because the claim is
   * different: that one says "this condition is false here", and this one says
   * "this condition is false for every candidate target, so the cycle loop finds
   * none ready". Same control flow, different evidence, and a reader auditing a
   * multi-target refusal needs to be able to tell them apart.
   */
  | "TARGET_INDEPENDENT_ELIMINATION_CONTINUE"
  /** A player action that might fire: true condition with unknown usability, or an undecided condition. */
  | "MAY_SELECT"
  /** A player action proven to fire. The scan is over. */
  | "SELECTED"
  /** The traversal could go no further here. */
  | "BLOCKED";

/** One visited entry, with everything needed to explain the final result. */
export interface TraversalStep {
  /** The full path to this entry, INCLUDING it. Never just the leaf. */
  readonly path: readonly TraversalPathEntry[];
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionToken: string;
  readonly actionStringVerbatim: string;
  readonly sourceLine: number;
  readonly entryKind: AplEntryKind;
  /**
   * The entry's own `,if=`.
   *
   * For a `call_action_list` this IS the entry-gate proof, and it already
   * distinguishes the two cases C3a needed: `UNCONDITIONAL` for a call carrying
   * no `if=` at all, `EVALUATED` for one whose condition was decided. No trace
   * is fabricated for an unconditional entry, because `UNCONDITIONAL` carries
   * none — it is a different member of the union, not a trace of `true`.
   */
  readonly gate: LineCondition;
  readonly usability: ActionUsability;
  /**
   * Whether the entry is a selectable action for this player.
   *
   * `APPLICABLE` for every entry when the caller models no applicability, which
   * is the default and preserves pre-M5-C3c2 behaviour exactly.
   */
  readonly applicability: ActionApplicability;
  /** The evidence behind a negative usability verdict. `null` when there is none. */
  readonly usabilityVerdict: ActionUsabilityVerdict | null;
  /**
   * What was decided about an entry carrying unsupported targeting options.
   *
   * `null` for the overwhelming majority of entries, which carry none. Non-null
   * says the entry cycles or retargets, and records whether a target-independent
   * conjunct settled it.
   */
  readonly targetingRefusal: TargetingRefusal | null;
  /**
   * The retarget pseudo-action this entry is, and what its firing means for
   * the first GCD (M11-D3-B2; see `pseudo-actions.ts`). ABSENT — not `null` —
   * for every other entry, so no existing step changes shape.
   */
  readonly pseudoAction?: PseudoActionRecord;
  /**
   * What a `variable` line did to the scan's variables (M11-D3-C2; see
   * `variable-execution.ts`). ABSENT for every other entry.
   */
  readonly variableExecution?: VariableExecutionRecord;
  /**
   * The gate-irrelevance claim, when one carried this entry past an unreadable
   * condition (M5-D1).
   *
   * `null` for every other entry. Non-null is the ONLY way a step can have an
   * `UNSUPPORTED` gate and still be a candidate, so a reader auditing such a step
   * always finds the evidence that licensed it.
   */
  readonly gateIrrelevance: GateIrrelevance | null;
  readonly outcome: TraversalStepOutcome;
}

/**
 * The verdict on an entry whose options redirect its condition to targets this
 * project does not enumerate.
 *
 * Both members carry the option keys, so a reader always learns WHY the entry was
 * treated specially rather than having to re-derive it from the verbatim string.
 */
export type TargetingRefusal =
  | {
      /** A target-independent conjunct is FALSE, so no candidate can be ready. */
      readonly kind: "ELIMINATED_FOR_EVERY_TARGET";
      readonly optionKeys: readonly string[];
      readonly elimination: TargetIndependentElimination & { readonly kind: "ELIMINATED_FOR_EVERY_TARGET" };
    }
  | {
      /** Not eliminated, so the scan cannot get past it. */
      readonly kind: "REFUSED";
      readonly optionKeys: readonly string[];
      readonly failure: TargetIndependenceFailure;
      /**
       * Why a `target_if` line could not be read past (M11-D3-B1), when B1
       * applied to it: its structure and the refusal reason. Absent otherwise.
       */
      readonly targetIf?: Extract<TargetIfVerdict, { kind: "REFUSED" }>;
    }
  | {
      /**
       * NOT a refusal (M11-D3-B1): the line's `target_if` is MIN/MAX with a
       * score POSITIVELY PROVEN finite — so a target is always chosen — and an
       * `if=` that is absent or reads only player state, so whichever enemy
       * wins, the line is ready exactly when the same line
       * without `target_if` would be. The line was evaluated as an ordinary
       * one; this records that target identity was ignored, and why that was
       * sound. See `target-if.ts`.
       */
      readonly kind: "TARGET_SELECTION_IGNORABLE";
      readonly optionKeys: readonly string[];
      readonly targetIf: Extract<TargetIfVerdict, { kind: "TARGET_SELECTION_IGNORABLE" }>;
    };

/** The step record for a refused targeting option, carrying the `target_if` reason when B1 applied. */
function refusalOf(
  optionKeys: readonly string[],
  targeting: Extract<TargetingOutcome, { kind: "REFUSED" }>,
): TargetingRefusal {
  return targeting.targetIf === null
    ? { kind: "REFUSED", optionKeys, failure: targeting.failure }
    : { kind: "REFUSED", optionKeys, failure: targeting.failure, targetIf: targeting.targetIf };
}

// --------------------------------------------------------------------------
// Result
// --------------------------------------------------------------------------

/**
 * Why a nested traversal could not name an action.
 *
 * The first four names are shared VERBATIM with `ListSelectionBlocker` and the
 * scoped-selection vocabulary. They are the same reasons, not synonyms.
 *
 * - `UNSUPPORTED_AUTHORITY_EXPRESSION` — a player action's condition is outside
 *   the supported subset, so we cannot tell whether it fires.
 * - `COMPETING_POSSIBLE_ACTION` — something definitely fires, but two different
 *   actions remain possible.
 * - `NO_DEFINITE_WINNER` — actions might fire, none is proven to, and the scan
 *   might equally have returned nothing.
 * - `UNMODELLED_DISPATCH_IN_LIST` — `run_action_list` in the SINGLE-LIST walker
 *   (`list-selection.ts`), which models no dispatch at all. Retained in this
 *   vocabulary because the two share it verbatim; since M11-B1 this module no
 *   longer produces it — a run entry is modelled here (see the header).
 * - `UNDECIDED_RUN_GATE` — a `run_action_list` gate that is neither proven TRUE
 *   nor proven FALSE (M11-B1). Since M11-D3-A it means: the gate's two worlds
 *   were explored and did not establish one definite result (they disagree,
 *   or one is unresolved). Reported AT the gate, never at an obstacle inside
 *   its speculative child.
 * - `UNDECIDED_CALL_GATE_OVER_RUN` — a `call_action_list` whose gate is
 *   undecided and whose callee transferred selection through a
 *   `run_action_list` (M11-B1). Same meaning since M11-D3-A, one level up.
 * - `CALLED_LIST_ABSENT` — a call names a list the artifact does not contain.
 *   A hole in the model, never an empty list.
 * - `CONTROL_FLOW_CYCLE` — a list was re-entered while still on the call stack.
 * - `UNSUPPORTED_ENTRY_KIND` — a control construct this module cannot model,
 *   including `swap_action_list` and a malformed call with no `name=`.
 * - `INVALID_START_BOUNDARY` — the caller's starting boundary did not carry a
 *   proof covering every ordinal it skips.
 */
export type TraversalBlocker =
  | "UNSUPPORTED_AUTHORITY_EXPRESSION"
  | "COMPETING_POSSIBLE_ACTION"
  | "NO_DEFINITE_WINNER"
  | "UNMODELLED_DISPATCH_IN_LIST"
  | "UNDECIDED_RUN_GATE"
  | "UNDECIDED_CALL_GATE_OVER_RUN"
  | "CALLED_LIST_ABSENT"
  | "CONTROL_FLOW_CYCLE"
  | "UNSUPPORTED_ENTRY_KIND"
  | "INVALID_START_BOUNDARY"
  /** Whether an entry applies to this player could not be established. */
  | "APPLICABILITY_NOT_ESTABLISHED"
  /**
   * The entry carries an action option this project does not model (M5-D1).
   *
   * DISTINCT FROM `UNSUPPORTED_AUTHORITY_EXPRESSION`, and the distinction is the
   * remedy. That one says the condition's SYNTAX was refused and points at the
   * parser. This one says the syntax was fine and the entry addresses targets we
   * cannot enumerate — widening the parser would not help, and a reader told to
   * widen it would be sent the wrong way.
   *
   * Since M11-D1 it also covers an entry whose option STRUCTURE is malformed
   * (`MALFORMED_STRUCTURE`: a second `if=`, a non-`key=value` segment,
   * unbalanced grouping) — on a player, run or call entry alike.
   */
  | "UNSUPPORTED_ACTION_OPTION";

export const TRAVERSAL_BLOCKERS = [
  "UNSUPPORTED_AUTHORITY_EXPRESSION",
  "COMPETING_POSSIBLE_ACTION",
  "NO_DEFINITE_WINNER",
  "UNMODELLED_DISPATCH_IN_LIST",
  "UNDECIDED_RUN_GATE",
  "UNDECIDED_CALL_GATE_OVER_RUN",
  "CALLED_LIST_ABSENT",
  "CONTROL_FLOW_CYCLE",
  "UNSUPPORTED_ENTRY_KIND",
  "INVALID_START_BOUNDARY",
  "APPLICABILITY_NOT_ESTABLISHED",
  "UNSUPPORTED_ACTION_OPTION",
] as const satisfies readonly TraversalBlocker[];

export type TraversalResult =
  | {
      readonly kind: "SELECTED";
      readonly actionToken: string;
      /** The entry that fires, with its full path. */
      readonly selectingStep: TraversalStep;
      /** Every entry that might still have fired, including the selecting one. */
      readonly convergedOver: readonly TraversalStep[];
      readonly steps: readonly TraversalStep[];
    }
  | {
      /**
       * EXACT. Every reachable entry was proven not to fire, so this traversal
       * returns no player action.
       *
       * This is a PROOF, not an absence of findings: it means the scan was
       * carried to completion and every entry was either eliminated or a call
       * whose callee was itself proven to return nothing. It is emphatically not
       * "we found nothing we support".
       */
      readonly kind: "NO_ACTION_SELECTED";
      readonly steps: readonly TraversalStep[];
    }
  | {
      /**
       * EVERY candidate names the same TOKEN, from DIFFERENT authority entries
       * (M5-D1).
       *
       * A DISTINCT MEMBER, never a variant of `SELECTED`, and the distinction is
       * the whole reason it exists. `SELECTED` names one concrete entry — list,
       * ordinal, verbatim string, source line — and a consumer is entitled to
       * quote it. Here the entry is genuinely unresolved and only the ACTION is
       * established, so there is no `selectingStep` to read and no way to
       * mistake one for the other.
       */
      readonly kind: "TOKEN_CONVERGED";
      readonly actionToken: string;
      /** Every entry that might be the one, in literal priority order. */
      readonly candidateEntries: readonly TraversalStep[];
      readonly steps: readonly TraversalStep[];
    }
  | {
      readonly kind: "UNKNOWN";
      readonly blocker: TraversalBlocker;
      /**
       * The EARLIEST entry, in literal SimulationCraft priority order, that the
       * traversal could not get past. A child's entry is earlier than any entry
       * below its call site in the caller.
       */
      readonly blockedAt: TraversalStep | null;
      readonly steps: readonly TraversalStep[];
      /** Safe, author-written detail. Never interpolated from upstream data. */
      readonly detail: string;
    };

// --------------------------------------------------------------------------
// Starting boundary
// --------------------------------------------------------------------------

/**
 * Where in the entry list the traversal is permitted to begin.
 *
 * A traversal that silently started partway down a list would be claiming the
 * skipped entries do not fire, which is a gameplay claim this module has no
 * business making. So a non-zero start must arrive with a PROOF, and the
 * traversal validates it: `provenExcludedOrdinals` must cover exactly every
 * ordinal being skipped. A caller that proved four entries ineligible cannot
 * start at the fifth.
 *
 * The engine does not evaluate the proof's reasoning — it cannot, since the
 * reasoning is domain-specific — but it does refuse a boundary whose proof does
 * not cover what it skips, which is the part that can be checked structurally.
 */
export interface ScanStartBoundary {
  readonly startOrdinal: number;
  /** Every ordinal the caller has structurally proven cannot be the answer. */
  readonly provenExcludedOrdinals: readonly number[];
  /** Author-written justification, carried into the result for auditing. */
  readonly justification: string;
}

/** Start at the top. The only boundary that needs no proof. */
export function fromListStart(): ScanStartBoundary {
  return { startOrdinal: 0, provenExcludedOrdinals: [], justification: "the whole list" };
}

export interface NestedSelectionInput {
  readonly authority: AplAuthority;
  /** The list the scan begins in. */
  readonly entryListName: string;
  readonly bindings: AtomBindings;
  readonly usabilityFor: ActionUsabilityVerdictResolver;
  /**
   * Whether each entry is a selectable action for this player.
   *
   * OPTIONAL, defaulting to "everything applies". A caller that models no
   * profile gets exactly the pre-M5-C3c2 behaviour.
   */
  readonly applicabilityFor?: ActionApplicabilityResolver;
  /**
   * Whether an entry's unreadable condition can be stepped past (M5-D1).
   *
   * OPTIONAL, defaulting to "never". A caller that models no gate irrelevance
   * gets exactly the pre-M5-D1 behaviour: every unparseable player-action
   * condition blocks the scan.
   */
  readonly gateIrrelevanceFor?: GateIrrelevanceResolver;
  /** Defaults to the top of the entry list. */
  readonly startBoundary?: ScanStartBoundary;
}

// --------------------------------------------------------------------------
// Internals
// --------------------------------------------------------------------------

/**
 * Something that might be what a scan returns.
 *
 * CONVERGENCE IDENTITY IS THE AUTHORITY ENTRY, NOT THE ACTION TOKEN.
 *
 * An earlier version compared tokens alone, reasoning that SimulationCraft
 * dispatches actions by name so one token cannot denote two actions for one
 * actor. That is true and still not sufficient, because of what a `SELECTED`
 * result actually claims. It names a concrete list, ordinal, verbatim string and
 * control-flow path — a specific authority ENTRY. Two worlds that reach
 *
 *     world A   list_one[2] -> garrote
 *     world B   list_two[5] -> garrote
 *
 * agree on the spell and disagree on the entry, and this result type cannot
 * honestly report one path for both. Converging them would fabricate a provenance
 * that only one world supports.
 *
 * So convergence requires the SAME ENTRY: same list, same ordinal, same verbatim
 * string, same source line. Token equality is implied by entry equality and is
 * compared too, so a token mismatch can never slip through a coordinate clash.
 *
 * This is deliberately conservative. "Every authority path recommends the same
 * spell" is a real and useful claim, but it is a DIFFERENT claim from "this
 * authority entry was selected", and only the second is what `SELECTED` means
 * here. Representing the first needs a result model that can carry several
 * convergent paths, which C3b does not add.
 */
export interface ScanCandidate {
  /** The action token. Never a display name — the engine has none. */
  readonly identity: string;
  readonly step: TraversalStep;
  /** True when this is PROVEN to fire, so nothing below it is reachable. */
  readonly definite: boolean;
}

/** Internal alias, kept so the existing body reads unchanged. */
type Candidate = ScanCandidate;

/**
 * Whether two candidates are the same supported selection.
 *
 * Compares the authority entry's full SimulationCraft-native coordinates. The
 * verbatim string and source line are included so two entries that merely share
 * a list and ordinal — which a malformed artifact could produce — still fail to
 * converge.
 */
function sameSelectionIdentity(left: Candidate, right: Candidate): boolean {
  return (
    left.identity === right.identity &&
    left.step.listName === right.step.listName &&
    left.step.priorityOrdinal === right.step.priorityOrdinal &&
    left.step.actionStringVerbatim === right.step.actionStringVerbatim &&
    left.step.sourceLine === right.step.sourceLine
  );
}

/**
 * What a completed scan of one list offers its caller.
 *
 * WHAT `candidates` IS, AND WHY THE "NOTHING FIRES" WORLD NEEDS NO EXTRA FIELD
 *
 * `scanList` only STOPS early on a candidate proven to fire. An entry that
 * merely MIGHT fire is recorded and the walk CONTINUES to the next ordinal. So
 * by the time a scan completes, `candidates` holds every entry that could be
 * what this scan returns, in literal APL priority order, and everything below
 * each of them has already been visited.
 *
 * That is what makes the two multi-candidate members mean different things:
 *
 *     MAY_SELECT [c0..cn]   world_i: c_i is the first whose conditions hold
 *                           world_none: none of them holds, and the scan
 *                             genuinely returns NOTHING — the walk already
 *                             reached the end of the list in that world, so
 *                             there is no "resume here" to record
 *
 *     AMBIGUOUS  [c0..cn]   one of them definitely fires, so world_none does
 *                           NOT exist
 *
 * A consumer exploring worlds therefore adds a no-selection branch for
 * `MAY_SELECT` and must not add one for `AMBIGUOUS`.
 */
export type ScanResolution =
  /** Proven to return no action. The caller continues at its next ordinal. */
  | { readonly kind: "NO_ACTION" }
  /** Proven to return this one action. */
  | { readonly kind: "DEFINITE"; readonly identity: string; readonly step: TraversalStep }
  /** Might return one of these, or might return nothing. */
  | { readonly kind: "MAY_SELECT"; readonly candidates: readonly Candidate[] }
  /**
   * Definitely returns an action, and every candidate names the SAME TOKEN —
   * but from different authority entries (M5-D1).
   *
   * WEAKER THAN `DEFINITE` AND STRONGER THAN `AMBIGUOUS`, and it exists because
   * the pinned `spend` list makes that distinction real: at maximum combo points
   * `spend[0]` might fire and `spend[1]` definitely does, and both are Envenom.
   * "The authority selects Envenom" is true and useful; "the authority selects
   * spend[1]" is not established, because spend[0] may have fired first.
   *
   * M5-B's scoped walk has always converged on the token — `selectWithinList`
   * compares `actionToken` — so this is not a new epistemic standard. It is that
   * standard finally becoming expressible in the nested engine, which until now
   * had to collapse it into `AMBIGUOUS`.
   */
  | {
      readonly kind: "TOKEN_CONVERGED";
      /** The token every candidate names. */
      readonly identity: string;
      /** Every entry that might be the one. The exact one is NOT established. */
      readonly candidates: readonly Candidate[];
    }
  /** Definitely returns something, but which ACTION is undecided. */
  | { readonly kind: "AMBIGUOUS"; readonly candidates: readonly Candidate[] };

type ScanOutcome =
  | {
      readonly kind: "COMPLETED";
      readonly candidates: readonly Candidate[];
      /**
       * Whether this walk ended because a `run_action_list` TRANSFERRED the
       * selection (M11-B1) — directly, or inside a certainly-entered callee.
       *
       * The flag is what stops a run from being undone by the list that called
       * it. A callee that completes WITHOUT transferring and offers nothing
       * lets its caller continue (`CALL_RETURNED_NO_ACTION_CONTINUE`); a callee
       * that transferred and offers nothing is a selection of NOTHING, and its
       * caller ends too. `candidates` is complete either way: nothing below the
       * transfer point in any enclosing list was visited.
       */
      readonly transferred: boolean;
      /**
       * Whether an explored world ended this SELECTION with no action at a
       * `run_action_list` transfer while the walk went on for another world
       * (M11-D3-A) — an undecided run gate whose child may select nothing, or
       * the same one level up, in this list or a callee.
       *
       * A run child that selects nothing is a selection of NOTHING; it does not
       * fall through to the parent. So once the walk has continued past such a
       * world, a definite candidate found later does NOT make the scan
       * definite: some world still selects nothing. `resolveScan` reads this.
       */
      readonly mayEndEmpty: boolean;
      /**
       * The undecided gate this walk explored past, if any (M11-D3-A) — the
       * EARLIEST one, in this list or a callee. `null` when every gate the walk
       * passed was decided.
       *
       * Exploration is allowed to CONVERGE, never to MOVE the stop. If the
       * worlds do not agree on one result, the scan stops at this gate exactly
       * as it did before the worlds were explored. See `Collapse`.
       */
      readonly collapse: Collapse | null;
    }
  | BlockedScan;

type BlockedScan = {
  readonly kind: "BLOCKED";
  readonly blocker: TraversalBlocker;
  readonly blockedAt: TraversalStep | null;
  readonly detail: string;
};

/**
 * Where a scan stops when the worlds of an undecided gate do not converge
 * (M11-D3-A).
 *
 * WHY THE GATE, AND NOT WHAT THE WORLDS FOUND
 *
 * An undecided `run_action_list` gate is explored in both worlds, but the TRUE
 * world is SPECULATIVE: the child is reached only if the gate holds, and that
 * is exactly what is not known. An obstacle met inside it — an applicability
 * gap, a competing candidate, a blocked callee — is real only in a world that
 * may never have happened, so it cannot be what stopped the selection. What
 * stopped the selection is the unresolved gate predicate itself. So unless
 * every world agrees on one result, the stop stays at the gate, and its
 * classification comes from the gate's own predicate (target count, a buff, a
 * hero tree, a talent), never from a world.
 *
 * The record captures that stop BEFORE the child is visited:
 *
 *   outcome       the blocked outcome the scan reports — `UNDECIDED_RUN_GATE`
 *                 (or `UNDECIDED_CALL_GATE_OVER_RUN` one level up) at the
 *                 gate's own step, through the same earliest-obstacle rule any
 *                 abort uses
 *   stepsLength   how much of the trace precedes and includes the gate; the
 *                 speculative worlds' steps beyond it are dropped from the
 *                 reported trace
 *   blockedSlots  the gate's step, and every enclosing call or run step that
 *                 was still open over it, restored to `BLOCKED`
 *
 * Applied, it reproduces the stop and trace an unexplored gate produced.
 * A gate PROVEN TRUE never creates one: its child is real, and an obstacle
 * there is the stop.
 */
interface Collapse {
  readonly outcome: BlockedScan;
  readonly stepsLength: number;
  readonly blockedSlots: readonly { readonly index: number; readonly step: TraversalStep }[];
}

/** Restores the trace to the collapse point and returns the gate's stop. */
function applyCollapse(context: ScanContext, collapse: Collapse): BlockedScan {
  context.steps.length = Math.min(context.steps.length, collapse.stepsLength);
  for (const slot of collapse.blockedSlots) {
    if (slot.index < context.steps.length) context.steps[slot.index] = slot.step;
  }
  return collapse.outcome;
}

/**
 * The collapse a caller inherits from a completed child walk: the same stop,
 * seen from one level up. The enclosing call or run step that was open over
 * the gate is restored to `BLOCKED`, and the caller's own earlier candidates
 * take precedence through the earliest-obstacle rule.
 */
function inheritedCollapse(
  candidates: readonly Candidate[],
  child: Collapse,
  enclosingIndex: number,
  enclosingStep: TraversalStep,
): Collapse {
  return {
    outcome: earliestObstacle(candidates, child.outcome),
    stepsLength: child.stepsLength,
    blockedSlots: [...child.blockedSlots, { index: enclosingIndex, step: enclosingStep }],
  };
}

/**
 * Turns a completed scan's candidates into what it offers its caller.
 *
 * A DEFINITE result requires a candidate PROVEN to fire. Without one the scan
 * might have fallen off the end and returned nothing, so even a single possible
 * candidate only yields `MAY_SELECT` — "X or nothing", never "X".
 *
 * `mayEndEmpty` (M11-D3-A) is the same "or nothing" arriving from a different
 * place: a world in which an undecided `run_action_list` transferred into a
 * child that selected nothing. With candidates present the scan can only be
 * `MAY_SELECT`, whatever their `definite` flags say; with none, every world
 * selects nothing and the scan is `NO_ACTION`.
 */
function resolveScan(candidates: readonly Candidate[], mayEndEmpty = false): ScanResolution {
  if (candidates.length === 0) return { kind: "NO_ACTION" };
  if (mayEndEmpty) {
    return {
      kind: "MAY_SELECT",
      candidates: candidates.map((candidate) => ({ ...candidate, definite: false })),
    };
  }

  const definite = candidates.find((candidate) => candidate.definite);

  if (definite === undefined) {
    return { kind: "MAY_SELECT", candidates };
  }
  // Every candidate must be the SAME authority entry. A candidate naming the
  // same action at a different entry is still a disagreement about what was
  // selected, because that is what this result reports.
  if (candidates.every((candidate) => sameSelectionIdentity(candidate, definite))) {
    return { kind: "DEFINITE", identity: definite.identity, step: definite.step };
  }
  // Something fires — the definite candidate guarantees that much — and if every
  // candidate names the same TOKEN then which action fires IS established even
  // though which entry selects it is not. That is a real, weaker answer, and
  // collapsing it into AMBIGUOUS would throw away the useful half.
  if (candidates.every((candidate) => candidate.identity === definite.identity)) {
    return { kind: "TOKEN_CONVERGED", identity: definite.identity, candidates };
  }
  // Different tokens. Nothing is established beyond "something fires".
  return { kind: "AMBIGUOUS", candidates };
}

function pathEntryOf(action: AplAction): TraversalPathEntry {
  return {
    listName: action.listName,
    priorityOrdinal: action.priorityOrdinal,
    actionToken: action.actionToken,
  };
}

function stepOf(
  action: AplAction,
  path: readonly TraversalPathEntry[],
  gate: LineCondition,
  usability: ActionUsability,
  outcome: TraversalStepOutcome,
  verdicts: {
    readonly applicability?: ActionApplicability;
    readonly usabilityVerdict?: ActionUsabilityVerdict | null;
    readonly targetingRefusal?: TargetingRefusal | null;
    readonly gateIrrelevance?: GateIrrelevance | null;
    readonly pseudoAction?: PseudoActionRecord | undefined;
    readonly variableExecution?: VariableExecutionRecord | undefined;
  } = {},
): TraversalStep {
  return {
    ...(verdicts.pseudoAction === undefined ? {} : { pseudoAction: verdicts.pseudoAction }),
    ...(verdicts.variableExecution === undefined ? {} : { variableExecution: verdicts.variableExecution }),
    applicability: verdicts.applicability ?? { kind: "APPLICABLE" },
    usabilityVerdict: verdicts.usabilityVerdict ?? null,
    targetingRefusal: verdicts.targetingRefusal ?? null,
    gateIrrelevance: verdicts.gateIrrelevance ?? null,
    path: [...path, pathEntryOf(action)],
    listName: action.listName,
    priorityOrdinal: action.priorityOrdinal,
    actionToken: action.actionToken,
    actionStringVerbatim: action.actionStringVerbatim,
    sourceLine: action.sourceLine,
    entryKind: action.entryKind,
    gate,
    usability,
    outcome,
  };
}

/**
 * Whether a gate is CERTAIN to admit entry.
 *
 * Only two things qualify: no condition at all, and a condition proven TRUE. An
 * undecided condition and an unsupported one are both "we cannot say", and this
 * module treats them identically — see `scanList`.
 */
function gateIsCertainlyEntered(gate: LineCondition): boolean {
  if (gate.kind === "UNCONDITIONAL") return true;
  return gate.kind === "EVALUATED" && gate.truth === "TRUE";
}

/** Whether a gate is PROVEN to refuse entry. Only an evaluated FALSE qualifies. */
function gateIsCertainlyNotEntered(gate: LineCondition): boolean {
  return gate.kind === "EVALUATED" && gate.truth === "FALSE";
}

// --------------------------------------------------------------------------
// The scan
// --------------------------------------------------------------------------

interface ScanContext {
  readonly authority: AplAuthority;
  readonly bindings: AtomBindings;
  readonly usabilityFor: ActionUsabilityVerdictResolver;
  readonly applicabilityFor: ActionApplicabilityResolver;
  readonly gateIrrelevanceFor: GateIrrelevanceResolver;
  /** Every step visited anywhere, in visit order. Accumulated across recursion. */
  readonly steps: TraversalStep[];
  /**
   * The generic variables this walk has assigned so far (M11-D3-C2). The ONE
   * mutable field: every value is immutable, and the walk REASSIGNS it as it
   * executes `variable` lines and as branches rejoin — so a speculative world
   * that restores the value it started from leaks nothing into its sibling.
   */
  variables: ScanVariables;
}

/**
 * The bindings every condition and value in the walk is evaluated under: the
 * caller's, plus the variables the walk has assigned so far (M11-D3-C2).
 */
function bindingsOf(context: ScanContext): AtomBindings {
  const cached = boundVariables.get(context);
  if (cached !== undefined && cached.variables === context.variables) return cached.bindings;
  const bindings: AtomBindings = { ...context.bindings, scanVariables: context.variables };
  boundVariables.set(context, { variables: context.variables, bindings });
  return bindings;
}

/** `bindingsOf`, built once per variable state rather than once per line. */
const boundVariables = new WeakMap<
  ScanContext,
  { readonly variables: ScanVariables; readonly bindings: AtomBindings }
>();

/**
 * Chooses which obstacle to report when a scan aborts with candidates already
 * collected.
 *
 * A scan can stop for two different reasons at two different priorities. Suppose
 * `cds[1]` MIGHT fire and we cannot tell, and then `items[2]` carries syntax we
 * cannot parse at all. Both stop us. But `cds[1]` is EARLIER, and in the pinned
 * loop an entry that might fire is reached first — so `items[2]` only matters in
 * the world where `cds[1]` did not fire.
 *
 * Reporting the later one would tell a reader to widen the parser, when widening
 * it would not produce an answer: `cds[1]` would still be unresolved. So when a
 * scan aborts and it has already collected candidates, the EARLIEST candidate is
 * the earliest obstacle and is what gets reported.
 *
 * Nothing is lost: the abort is still in `steps` with its own BLOCKED outcome,
 * so a reader can see both.
 *
 * This is `list-selection`'s earliest-blocker rule applied across an abort
 * boundary rather than only within a completed scan.
 *
 * One kind of candidate is never the obstacle (M11-D3-B2): a
 * `retarget_auto_attack` proven to have no first-GCD effect. Whether it fires
 * changes nothing the first GCD depends on (`pseudo-actions.ts`), so naming it
 * would send a reader to a line that resolving cannot help; the obstacle is
 * the next candidate, or the abort itself.
 */
function earliestObstacle(candidates: readonly Candidate[], blocked: BlockedScan): BlockedScan {
  const earliest = candidates.find(
    (candidate) => candidate.step.pseudoAction?.firstGcdEffect.kind !== "NO_FIRST_GCD_EFFECT",
  );
  if (earliest === undefined) return blocked;
  return {
    kind: "BLOCKED",
    blocker: "NO_DEFINITE_WINNER",
    blockedAt: earliest.step,
    detail:
      "an earlier entry might fire and could not be resolved; a later entry also could not be " +
      "evaluated, but it is only reachable in the world where the earlier one did not fire",
  };
}

/**
 * What a `run_action_list` entry did to the scan that reached it (M11-B1).
 *
 *     CONTINUE     the gate is proven FALSE; the parent scans its next ordinal
 *     SCAN_ENDS    the gate is certain; the child was scanned and `contributed`
 *                  is everything it offered (possibly nothing). The parent's
 *                  later entries are NOT visited — the run replaced the parent
 *                  for this selection and never returns to it
 *     BLOCKED      the gate is undecided or unreadable, the entry carries an
 *                  option this project does not model, or the child blocked
 */
type RunDispatchOutcome =
  | { readonly kind: "CONTINUE" }
  | {
      readonly kind: "SCAN_ENDS";
      readonly contributed: readonly Candidate[];
      readonly mayEndEmpty: boolean;
      /** An undecided gate the certainly-entered child explored past, seen from here. */
      readonly collapse: Collapse | null;
    }
  /**
   * The gate is undecided (M11-D3-A): the child's candidates are POSSIBLE, the
   * parent continues for the FALSE world, and `mayEndEmpty` records whether the
   * TRUE world may select nothing at all. `collapse` is this gate's own stop,
   * reported if the worlds do not converge.
   */
  | {
      readonly kind: "MAY_TRANSFER";
      readonly contributed: readonly Candidate[];
      readonly mayEndEmpty: boolean;
      readonly collapse: Collapse;
    }
  | { readonly kind: "BLOCKED"; readonly outcome: BlockedScan };

/**
 * The TRUE world of an undecided gate whose child TRANSFERS selection
 * (M11-D3-A): what the child offers the parent's continuing walk.
 *
 * The child's candidates become POSSIBLE — the gate may be FALSE — and keep
 * their priority order. If the child may select nothing, that is a world in
 * which this whole selection is nothing (a run never falls back into its
 * parent), so `mayEndEmpty` is set. A child that definitely selects an action
 * but cannot say which is `AMBIGUOUS`: that world cannot agree with any other,
 * so the caller stops at its undecided gate.
 */
function undecidedTransferWorld(child: Extract<ScanOutcome, { kind: "COMPLETED" }>):
  | {
      readonly kind: "MAY_TRANSFER";
      readonly contributed: readonly Candidate[];
      readonly mayEndEmpty: boolean;
    }
  | { readonly kind: "AMBIGUOUS"; readonly blockedAt: TraversalStep | null } {
  const resolution = resolveScan(child.candidates, child.mayEndEmpty);
  if (resolution.kind === "AMBIGUOUS")
    return { kind: "AMBIGUOUS", blockedAt: resolution.candidates[0]?.step ?? null };
  return {
    kind: "MAY_TRANSFER",
    contributed: child.candidates.map((candidate) => ({ ...candidate, definite: false })),
    mayEndEmpty: resolution.kind === "NO_ACTION" || resolution.kind === "MAY_SELECT",
  };
}

/**
 * Models one `run_action_list` entry at its own priority position.
 *
 * THE PINNED SEMANTICS, AND WHY THEY ARE NOT THE CALL'S
 *
 * `run_action_list_t` is not `ACTION_CALL`, so `select_action` RETURNS it as
 * the selected action once `action_ready()` holds (player.cpp:14235,
 * 14264-14267). It executes at zero time, remembering the parent and
 * activating the child (action.cpp:4740-4754); the next `execute_action`
 * selects from the child (player.cpp:7376-7377) and only then restores the
 * parent (player.cpp:7382-7386). So for the selection this scan models:
 *
 *   - a FALSE gate skips the entry and the parent continues — the same
 *     `action_ready()` check every entry passes through;
 *   - a certain gate ENDS the parent's walk here. Whatever the child selects
 *     is what this selection selects, and a child that selects nothing is a
 *     selection of NOTHING. There is no fall-through into the parent's later
 *     entries; `call_action_list`'s "returns nothing, keep scanning" rule
 *     (player.cpp:14255-14260) belongs to `ACTION_CALL` alone;
 *   - an undecided gate explores BOTH worlds (M11-D3-A; M11-B1 blocked here
 *     with `UNDECIDED_RUN_GATE`). TRUE: the child is scanned and whatever it
 *     selects — or nothing — is this selection's. FALSE: the parent continues
 *     at its next ordinal. Neither world is preferred, and the gate is never
 *     read as TRUE, FALSE or absent: the child's candidates join as POSSIBLE
 *     candidates, a child that may select nothing records a world in which
 *     this selection is NOTHING (`mayEndEmpty`), and only a resolution every
 *     world agrees on can be definite. When they do not agree — or the child
 *     is blocked, or definitely selects but not one action — the stop is THIS
 *     entry, `UNDECIDED_RUN_GATE`, with the trace cut back to it: the child is
 *     speculative, so nothing met inside it is the stop (`Collapse`).
 *
 * WHAT STAYS CONSERVATIVE, ON PURPOSE
 *
 *   - Options. A run entry carrying an option outside the supported set is
 *     refused with `UNSUPPORTED_ACTION_OPTION` before its gate is read; the
 *     existing classification applies. The one exception is a sole
 *     `target_if` (M11-D3-B1): read past when `target-if.ts` can, eliminated
 *     by a FALSE player-only conjunct, and otherwise — when well-formed with a
 *     readable `if=` — explored as an undecided gate whose stop stays at this
 *     line as `UNSUPPORTED_ACTION_OPTION`.
 *   - Cycles. The child is scanned under the same active-stack guard as a
 *     callee, so `run X` inside X, or X ⇄ Y through runs, calls or a mix,
 *     blocks with `CONTROL_FLOW_CYCLE`. The pinned `swap_action_list_t::ready`
 *     (action.cpp:4725-4731) would instead make a run into the ALREADY ACTIVE
 *     list not ready; blocking is the conservative reading of that and claims
 *     nothing the pinned loop would not also refuse to select.
 *   - Prior candidates. If entries above the run MIGHT fire, the run is
 *     reached only in the world where none did. The child's candidates are
 *     appended verbatim — their own `definite` flags intact — exactly as a
 *     certain call's are, and the parent's earlier possibilities stay ahead of
 *     them in priority order.
 */
function scanRunDispatch(
  context: ScanContext,
  action: AplAction,
  target: string,
  gate: LineCondition,
  path: readonly TraversalPathEntry[],
  nestedStack: readonly string[],
  candidates: readonly Candidate[],
): RunDispatchOutcome {
  const blocked = (step: TraversalStep, blocker: TraversalBlocker, detail: string): RunDispatchOutcome => ({
    kind: "BLOCKED",
    outcome: earliestObstacle(candidates, { kind: "BLOCKED", blocker, blockedAt: step, detail }),
  });

  // ---- target_if on a run entry (M11-D3-B1) ----
  //
  // A run is an ordinary `action_t` for readiness (it does not override
  // `action_ready`), so `select_target()` applies before its `if=`
  // (action.cpp:2567-2629). Target selection only decides whether the run is
  // READY: the run's own target is not read by its child, whose entries keep
  // their own targets. So a `target_if` the shared rule can read past is
  // read past; one it cannot read past, on an otherwise well-formed line
  // with a readable `if=`, leaves exactly two worlds — ready or not — and is
  // explored like any undecided gate, with the stop held at this line.
  // Every other unsupported option is refused before the gate is read, as
  // before.
  const soleTargetIf =
    action.targetIf !== null && action.unsupportedOptions.every((option) => option.optionKey === "target_if");
  const targeting = soleTargetIf ? targetingOutcomeFor(action, bindingsOf(context)) : null;
  const optionKeys = action.unsupportedOptions.map((option) => option.optionKey);

  if (targeting?.kind === "ELIMINATED_FOR_EVERY_TARGET") {
    // Not ready whatever target selection does: the parent continues.
    context.steps.push(
      stepOf(
        action,
        path,
        { kind: "NOT_EVALUATED", why: "UNSUPPORTED_TARGETING" },
        "UNKNOWN",
        "TARGET_INDEPENDENT_ELIMINATION_CONTINUE",
        {
          targetingRefusal: {
            kind: "ELIMINATED_FOR_EVERY_TARGET",
            optionKeys,
            elimination: targeting.elimination,
          },
        },
      ),
    );
    return { kind: "CONTINUE" };
  }

  const explorableRefusal =
    targeting?.kind === "REFUSED" &&
    targeting.targetIf !== null &&
    targeting.targetIf.reason !== "TARGET_IF_MALFORMED" &&
    targeting.targetIf.reason !== "CONDITION_UNSUPPORTED" &&
    gate.kind !== "UNSUPPORTED";

  if (action.unsupportedOptions.length > 0 && targeting?.kind !== "ORDINARY_LINE" && !explorableRefusal) {
    const step = stepOf(
      action,
      path,
      { kind: "NOT_EVALUATED", why: "UNSUPPORTED_TARGETING" },
      "UNKNOWN",
      "BLOCKED",
      {
        targetingRefusal:
          targeting?.kind === "REFUSED"
            ? refusalOf(optionKeys, targeting)
            : { kind: "REFUSED", optionKeys, failure: "NO_TARGET_INDEPENDENT_CONJUNCT" },
      },
    );
    context.steps.push(step);
    return blocked(
      step,
      "UNSUPPORTED_ACTION_OPTION",
      "the run_action_list entry carries an action option this project does not model, so " +
        "whether it transfers selection cannot be established",
    );
  }

  // What the run entry's steps record about target selection, if anything.
  const targetingRecord: TargetingRefusal | null =
    targeting?.kind === "ORDINARY_LINE"
      ? { kind: "TARGET_SELECTION_IGNORABLE", optionKeys, targetIf: targeting.targetIf }
      : targeting?.kind === "REFUSED"
        ? refusalOf(optionKeys, targeting)
        : null;
  // A refused `target_if` is read on an enemy this project cannot name, so its
  // `if=` is not evaluated and the gate is undecided by construction.
  const runGate: LineCondition = explorableRefusal
    ? { kind: "NOT_EVALUATED", why: "UNSUPPORTED_TARGETING" }
    : gate;
  const runStep = (outcome: TraversalStepOutcome): TraversalStep =>
    stepOf(action, path, runGate, "UNKNOWN", outcome, { targetingRefusal: targetingRecord });

  if (gate.kind === "UNSUPPORTED") {
    const step = runStep("BLOCKED");
    context.steps.push(step);
    return blocked(
      step,
      "UNSUPPORTED_AUTHORITY_EXPRESSION",
      "the run_action_list gate is outside the supported expression subset, so whether it " +
        "transfers selection cannot be established",
    );
  }

  if (!explorableRefusal && gateIsCertainlyNotEntered(gate)) {
    // Proven FALSE: not ready, not returned, not entered. The parent continues.
    context.steps.push(runStep("RUN_GATE_FALSE_SKIPPED"));
    return { kind: "CONTINUE" };
  }

  // The run entry's own step is recorded BEFORE the child so the trace reads
  // in visit order; its outcome is known once the child returns.
  const runStepIndex = context.steps.length;
  const blockedRunStep = runStep("BLOCKED");
  context.steps.push(blockedRunStep);
  const finishRun = (outcome: TraversalStepOutcome): void => {
    context.steps[runStepIndex] = runStep(outcome);
  };

  // An undecided gate's stop is fixed BEFORE its child is visited (M11-D3-A):
  // whatever the speculative TRUE world meets, this is where the selection
  // stops unless the worlds converge. See `Collapse`. When what is undecided
  // is TARGET SELECTION (M11-D3-B1), the stop is the same line, named for
  // what is actually missing.
  const gateCollapse: Collapse | null =
    !explorableRefusal && gateIsCertainlyEntered(gate)
      ? null
      : {
          outcome: earliestObstacle(
            candidates,
            explorableRefusal
              ? {
                  kind: "BLOCKED",
                  blocker: "UNSUPPORTED_ACTION_OPTION",
                  blockedAt: blockedRunStep,
                  detail:
                    "the run_action_list entry's target_if decides whether it is ready on enemies this " +
                    "project does not enumerate; the parent-continues and child-replaces-parent worlds were " +
                    "explored and did not establish one definite result",
                }
              : {
                  kind: "BLOCKED",
                  blocker: "UNDECIDED_RUN_GATE",
                  blockedAt: blockedRunStep,
                  detail:
                    "the run_action_list gate is neither proven TRUE nor proven FALSE; the parent-continues and " +
                    "child-replaces-parent worlds were explored and did not establish one definite result",
                },
          ),
          stepsLength: runStepIndex + 1,
          blockedSlots: [{ index: runStepIndex, step: blockedRunStep }],
        };

  const runPath = [...path, pathEntryOf(action)];
  // The child's assignments belong to the TRUE world, which never returns to
  // the parent (M11-D3-C2). Only the FALSE world continues, with the variables
  // as they stood before the child ran.
  const variablesBeforeChild = context.variables;
  const child = scanList(context, target, 0, runPath, nestedStack);
  if (child.kind === "BLOCKED") {
    finishRun("BLOCKED");
    // Undecided gate: the TRUE world is unresolved, so the worlds cannot
    // converge — and the child's obstacle is only real in that world. The gate
    // is the stop.
    if (gateCollapse !== null) return { kind: "BLOCKED", outcome: applyCollapse(context, gateCollapse) };
    // Certain gate: the child is real, and so is its obstacle.
    return { kind: "BLOCKED", outcome: earliestObstacle(candidates, child) };
  }

  if (gateCollapse !== null) {
    // ---- undecided gate: both worlds (M11-D3-A) ----
    const world = undecidedTransferWorld(child);
    if (world.kind === "AMBIGUOUS") {
      // The TRUE world definitely selects, but not one action: it cannot agree
      // with anything. The gate is the stop.
      finishRun("BLOCKED");
      return { kind: "BLOCKED", outcome: applyCollapse(context, gateCollapse) };
    }
    finishRun("RUN_GATE_UNDECIDED_MAY_TRANSFER");
    context.variables = variablesBeforeChild;
    return { ...world, collapse: gateCollapse };
  }

  const collapse =
    child.collapse === null
      ? null
      : inheritedCollapse(candidates, child.collapse, runStepIndex, blockedRunStep);
  if (child.candidates.length === 0) {
    // PROVEN to select nothing. This selection selects nothing: the pinned
    // loop's next `select_action` ran over the child and found no ready entry,
    // and the parent's later ordinals were never part of that selection.
    finishRun("RUN_RETURNED_NO_ACTION_SCAN_ENDS");
    return { kind: "SCAN_ENDS", contributed: [], mayEndEmpty: child.mayEndEmpty, collapse };
  }
  finishRun("RUN_ENTERED_SCAN_ENDS");
  return { kind: "SCAN_ENDS", contributed: child.candidates, mayEndEmpty: child.mayEndEmpty, collapse };
}

/**
 * Walks one list. Any stop reached AFTER the walk explored past an undecided
 * gate is reported as that gate's stop (M11-D3-A): the later obstacle is real
 * only in a world the gate may not have produced, or comes after a gate whose
 * worlds were never shown to agree. See `Collapse`.
 */
function scanList(
  context: ScanContext,
  listName: string,
  startOrdinal: number,
  path: readonly TraversalPathEntry[],
  /** The lists currently ON THE CALL STACK, innermost last. Not "ever visited". */
  callStack: readonly string[],
): ScanOutcome {
  const pending: PendingCollapse = { collapse: null };
  const outcome = walkList(context, listName, startOrdinal, path, callStack, pending);
  if (outcome.kind === "BLOCKED" && pending.collapse !== null)
    return applyCollapse(context, pending.collapse);
  return outcome;
}

/** The earliest undecided gate a walk has explored past. The first one recorded wins. */
interface PendingCollapse {
  collapse: Collapse | null;
}

function walkList(
  context: ScanContext,
  listName: string,
  startOrdinal: number,
  path: readonly TraversalPathEntry[],
  callStack: readonly string[],
  pending: PendingCollapse,
): ScanOutcome {
  /** Records `collapse` unless an earlier gate already holds the stop. */
  const explorePast = (collapse: Collapse | null): void => {
    if (pending.collapse === null) pending.collapse = collapse;
  };

  // The cycle guard, mirroring `visited_apls_`. Checked on ENTRY, before any
  // entry is read, because the loop below would otherwise recurse first.
  if (callStack.includes(listName)) {
    return {
      kind: "BLOCKED",
      blocker: "CONTROL_FLOW_CYCLE",
      blockedAt: null,
      detail: "an action list was re-entered while still on the call stack",
    };
  }

  const lookup = context.authority.actionsInList(listName);
  if (!lookup.found) {
    return {
      kind: "BLOCKED",
      blocker: "CALLED_LIST_ABSENT",
      blockedAt: null,
      detail:
        "the authority contains no list by that name, which is a gap in the model and not an empty list",
    };
  }

  const nestedStack = [...callStack, listName];
  const candidates: Candidate[] = [];
  /** Set when a run entry — here or in a certainly-entered callee — ended the walk. */
  let transferred = false;
  /** Set when a world explored here or in a callee ended the selection with nothing (M11-D3-A). */
  let mayEndEmpty = false;

  for (const action of lookup.actions) {
    if (action.priorityOrdinal < startOrdinal) continue;

    const gate = evaluateCondition(action, bindingsOf(context));

    // ---- variable: the one execute-and-continue construct ----
    if (action.entryKind === "VARIABLE_ASSIGNMENT") {
      // It is never what a scan returns, so it cannot change control flow, and
      // its GATE cannot either — a variable that does not get assigned still
      // does not end the scan.
      //
      // Its VALUE is executed since M11-D3-C2 (`variable-execution.ts`): a
      // modelled assignment updates the walk's variables, which every later
      // condition in this walk reads; an unmodelled one makes the variable
      // UNKNOWN — never a refusal, because SimulationCraft still executes it.
      // Every executed assignment writes, whoever else reads or seeds the
      // variable: the later write wins (`scanAssignedBinding`).
      //
      // `cycling_variable` takes this branch too (M11-D1). Its value is a fold
      // over every enemy (variable.cpp:369-391), which nothing here computes,
      // so it writes UNKNOWN.
      const execution = executeVariableLine(action, gate, bindingsOf(context), context.variables);
      context.variables = execution.state;
      context.steps.push(
        stepOf(action, path, gate, "UNKNOWN", "VARIABLE_EXECUTED_CONTINUE", {
          variableExecution: execution.record,
        }),
      );
      continue;
    }

    // ---- call_action_list ----
    if (action.entryKind === "LIST_DISPATCH") {
      // A dispatch whose option STRUCTURE is malformed — a second `if=`, a
      // non-`key=value` segment, unbalanced grouping — is refused before its
      // gate is read (M11-D1C): no reading of a malformed gate may make the
      // callee entered, certainly or otherwise. A run entry is refused the same
      // way by `scanRunDispatch`, which refuses every unsupported option.
      if (isMalformedAuthorityLine(action)) {
        const optionKeys = action.unsupportedOptions.map((option) => option.optionKey);
        const step = stepOf(
          action,
          path,
          { kind: "NOT_EVALUATED", why: "UNSUPPORTED_TARGETING" },
          "UNKNOWN",
          "BLOCKED",
          { targetingRefusal: { kind: "REFUSED", optionKeys, failure: "NO_TARGET_INDEPENDENT_CONJUNCT" } },
        );
        context.steps.push(step);
        return earliestObstacle(candidates, {
          kind: "BLOCKED",
          blocker: "UNSUPPORTED_ACTION_OPTION",
          blockedAt: step,
          detail:
            "the list-dispatch entry's option structure is malformed, so whether its list is entered " +
            "cannot be established",
        });
      }

      // A call's `target_if` has no effect on readiness: `call_action_list_t`
      // overrides `action_ready` and never calls `select_target()`
      // (action.cpp:4672-4685), so a call's gate is read without its options.
      // A MALFORMED one is different — an invalid APL at the pinned commit —
      // and is refused rather than ignored (M11-D3-B1). A run's `target_if` is
      // decided in `scanRunDispatch`.
      if (!action.isUnmodelledDispatch && action.targetIf?.kind === "MALFORMED") {
        const optionKeys = action.unsupportedOptions.map((option) => option.optionKey);
        const step = stepOf(
          action,
          path,
          { kind: "NOT_EVALUATED", why: "UNSUPPORTED_TARGETING" },
          "UNKNOWN",
          "BLOCKED",
          { targetingRefusal: { kind: "REFUSED", optionKeys, failure: "PROOF_NOT_ATTEMPTED" } },
        );
        context.steps.push(step);
        return earliestObstacle(candidates, {
          kind: "BLOCKED",
          blocker: "UNSUPPORTED_ACTION_OPTION",
          blockedAt: step,
          detail:
            "the list-dispatch entry's target_if option is malformed, so the line is not a valid APL entry",
        });
      }

      const target = action.callsListName;
      if (target === null) {
        // `swap_action_list`, or a malformed call carrying no `name=`. Either
        // way this module cannot say where control went.
        const step = stepOf(action, path, gate, "UNKNOWN", "BLOCKED");
        context.steps.push(step);
        return earliestObstacle(candidates, {
          kind: "BLOCKED",
          blocker: "UNSUPPORTED_ENTRY_KIND",
          blockedAt: step,
          detail: "a list-dispatch entry names no callable list this module can follow",
        });
      }

      // ---- run_action_list: transfers selection, never returns (M11-B1) ----
      if (action.isUnmodelledDispatch) {
        const run = scanRunDispatch(context, action, target, gate, path, nestedStack, candidates);
        if (run.kind === "CONTINUE") continue;
        if (run.kind === "SCAN_ENDS") {
          explorePast(run.collapse);
          candidates.push(...run.contributed);
          if (run.mayEndEmpty) mayEndEmpty = true;
          transferred = true;
          break;
        }
        if (run.kind === "MAY_TRANSFER") {
          // The TRUE world's possible selections; the walk goes on for the FALSE world.
          explorePast(run.collapse);
          candidates.push(...run.contributed);
          if (run.mayEndEmpty) mayEndEmpty = true;
          continue;
        }
        return run.outcome;
      }

      if (gateIsCertainlyNotEntered(gate)) {
        // Proven FALSE: the callee is not entered, so it is not recursed into at
        // all. Recursing anyway would put its entries in the trace as though
        // they had been considered.
        context.steps.push(stepOf(action, path, gate, "UNKNOWN", "CALL_GATE_FALSE_SKIPPED"));
        continue;
      }

      // The call's own step is recorded BEFORE the recursion, so the trace reads
      // in visit order: a caller's entry precedes the callee's entries rather
      // than appearing after them. Its outcome is not known until the callee
      // returns, so the slot is reserved and rewritten below.
      const callStepIndex = context.steps.length;
      context.steps.push(stepOf(action, path, gate, "UNKNOWN", "BLOCKED"));
      const finishCall = (outcome: TraversalStepOutcome): void => {
        context.steps[callStepIndex] = stepOf(action, path, gate, "UNKNOWN", outcome);
      };

      const callPath = [...path, pathEntryOf(action)];
      const variablesBeforeCall = context.variables;
      const child = scanList(context, target, 0, callPath, nestedStack);
      // Variables are the PLAYER's, so a callee's assignments are still there
      // when the caller continues (M11-D3-C2). Under an undecided gate the
      // continuation is either world — entered, or not — so it reads their join.
      // A continuation exists only where the callee returned nothing, and the
      // callee's final state is exactly that world's.
      if (child.kind === "COMPLETED" && !gateIsCertainlyEntered(gate)) {
        context.variables = joinScanVariables(variablesBeforeCall, context.variables, context.bindings);
      }
      if (child.kind === "BLOCKED") {
        // An unresolved callee blocks every entry BELOW this call site. Stepping
        // over it to reach something decidable lower down is precisely the
        // priority short-circuit this project forbids.
        finishCall("BLOCKED");
        return earliestObstacle(candidates, child);
      }
      // A world the callee explored that ended the selection with nothing is
      // still such a world here, whatever this caller does next (M11-D3-A).
      if (child.mayEndEmpty) mayEndEmpty = true;
      // So is an undecided gate the callee explored past: it holds the stop
      // here too, ahead of anything this caller meets later.
      if (child.collapse !== null) {
        explorePast(
          inheritedCollapse(
            candidates,
            child.collapse,
            callStepIndex,
            stepOf(action, path, gate, "UNKNOWN", "BLOCKED"),
          ),
        );
      }

      if (child.transferred) {
        // ---- the callee reached a run_action_list (M11-B1) ----
        //
        // The run was RETURNED as the selected action from inside the call
        // (player.cpp:14255-14260 returns whatever the callee returns), so the
        // selection that follows is the run's child's — not this caller's next
        // ordinal. "Returned nothing, keep scanning" does not apply: the callee
        // did return something, and what it returned ended the walk.
        if (gateIsCertainlyEntered(gate)) {
          finishCall("CALL_TRANSFERRED_SCAN_ENDS");
          candidates.push(...child.candidates);
          transferred = true;
          break;
        }
        // Undecided call gate over a transferring callee (M11-D3-A; M11-B1
        // blocked here without exploring): the TRUE world ended in the
        // callee's run, the FALSE world continues here — the undecided run
        // gate's two worlds, one level up, under the same rule. This gate
        // holds the stop unless the worlds converge; the callee's own stops
        // stay as they were, because the callee was always going to be walked.
        const blockedCallStep = stepOf(action, path, gate, "UNKNOWN", "BLOCKED");
        const callCollapse: Collapse = {
          outcome: earliestObstacle(candidates, {
            kind: "BLOCKED",
            blocker: "UNDECIDED_CALL_GATE_OVER_RUN",
            blockedAt: blockedCallStep,
            detail:
              "the called list transfers selection through run_action_list, but the call's own gate is " +
              "neither proven TRUE nor proven FALSE; the parent-continues and child-replaces-parent " +
              "worlds were explored and did not establish one definite result",
          }),
          stepsLength: context.steps.length,
          blockedSlots: [{ index: callStepIndex, step: blockedCallStep }],
        };
        explorePast(callCollapse);
        const world = undecidedTransferWorld(child);
        if (world.kind === "AMBIGUOUS") {
          // The TRUE world cannot agree with anything; `scanList` reports the
          // earliest recorded gate — this one, or one the callee explored past.
          finishCall("BLOCKED");
          return callCollapse.outcome;
        }
        finishCall("CALL_GATE_UNDECIDED_MAY_TRANSFER");
        context.variables = variablesBeforeCall;
        candidates.push(...world.contributed);
        if (world.mayEndEmpty) mayEndEmpty = true;
        continue;
      }

      // A callee that explored a nothing-selecting run world cannot be definite
      // to its caller either (M11-D3-A).
      const childResolution = resolveScan(child.candidates, child.mayEndEmpty);

      if (childResolution.kind === "NO_ACTION") {
        // THE CONVERGENCE RULE. The callee is PROVEN to return nothing, so the
        // gate's two worlds agree: not entered means continue here, and entered
        // means the callee falls through to here as well. An undecided or even
        // unparseable gate above a provably-empty list is therefore not a
        // blocker — nothing about it can change where control goes next.
        finishCall("CALL_RETURNED_NO_ACTION_CONTINUE");
        continue;
      }

      if (childResolution.kind === "AMBIGUOUS") {
        const blockedAt = childResolution.candidates[0]?.step ?? null;
        finishCall("BLOCKED");
        return earliestObstacle(candidates, {
          kind: "BLOCKED",
          blocker: "COMPETING_POSSIBLE_ACTION",
          blockedAt,
          detail: "the called list definitely selects an action, but which one is undecided",
        });
      }

      if (childResolution.kind === "TOKEN_CONVERGED" && gateIsCertainlyEntered(gate)) {
        // Entered for certain, and the callee definitely returns THIS TOKEN. The
        // call returns an action, so every later entry of this list is
        // unreachable — the same conclusion the DEFINITE branch reaches, from a
        // weaker premise.
        //
        // The candidates are carried through VERBATIM, `definite` flags included,
        // so the parent's own resolution sees exactly what the callee saw and
        // reaches the same token-convergent answer rather than a fabricated
        // single entry.
        finishCall("CALL_SELECTED");
        candidates.push(...childResolution.candidates);
        break;
      }

      if (childResolution.kind === "DEFINITE" && gateIsCertainlyEntered(gate)) {
        // Entered for certain, and the callee fires for certain. The call
        // returns that action and the scan is over — every later entry of this
        // list is unreachable.
        finishCall("CALL_SELECTED");
        candidates.push({ identity: childResolution.identity, step: childResolution.step, definite: true });
        break;
      }

      // Either the gate is undecided, or the callee only MIGHT fire. The callee's
      // actions become possible candidates and the scan continues, so that the
      // world where the callee returns nothing is explored too.
      const contributed =
        childResolution.kind === "DEFINITE"
          ? [{ identity: childResolution.identity, step: childResolution.step, definite: false }]
          : childResolution.candidates.map((candidate) => ({ ...candidate, definite: false }));
      // An uncertain gate means the callee might not be entered at all, so
      // nothing it offers is definite — including a token-convergent set.
      finishCall("CALL_MAY_SELECT");
      candidates.push(...contributed);
      continue;
    }

    // ---- an ordinary player action ----
    if (action.entryKind !== "PLAYER_ACTION") {
      const step = stepOf(action, path, gate, "UNKNOWN", "BLOCKED");
      context.steps.push(step);
      return earliestObstacle(candidates, {
        kind: "BLOCKED",
        blocker: "UNSUPPORTED_ENTRY_KIND",
        blockedAt: step,
        detail: "an entry kind this module does not model appeared in the scan",
      });
    }

    // ---- retarget pseudo-actions (M11-D3-B2) ----
    //
    // `retarget` and `retarget_auto_attack` are core SimulationCraft actions
    // with their own pinned semantics (`pseudo-actions.ts`). Both are walked
    // as the ordinary entries they are for this ONE scan — the scan answers
    // which action it returns — and carry a record of what their firing means
    // for the first GCD, which `firstGcdSelectionAcrossRescans` acts on.
    const pseudoKind = pseudoActionOf(action.actionToken);
    const pseudoAction: PseudoActionRecord | undefined =
      pseudoKind === null
        ? undefined
        : { kind: pseudoKind, firstGcdEffect: firstGcdPseudoEffectOf(action, pseudoKind, context.bindings) };

    if (
      pseudoAction?.kind === "RETARGET_AUTO_ATTACK" &&
      pseudoAction.firstGcdEffect.kind === "NO_FIRST_GCD_EFFECT" &&
      !isMalformedAuthorityLine(action) &&
      action.targetIf?.kind !== "MALFORMED"
    ) {
      // Its readiness ends with "an auto attack's target differs from the one
      // this action chose" — auto-attack state and target identity this
      // project never has — so it is POSSIBLE at most, never proven to fire.
      // And since its firing cannot change the first GCD, nothing about its
      // readiness needs to be read: its applicability, usability, `line_cd`
      // and an unreadable condition change nothing. Only a PROVEN-false
      // condition is used, to record that it cannot fire.
      const soleTargetIf =
        action.unsupportedOptions.length > 0 &&
        action.unsupportedOptions.every((option) => option.optionKey === "target_if");
      const targeting = soleTargetIf ? targetingOutcomeFor(action, bindingsOf(context)) : null;
      const optionKeys = action.unsupportedOptions.map((option) => option.optionKey);
      if (targeting?.kind === "ELIMINATED_FOR_EVERY_TARGET") {
        context.steps.push(
          stepOf(
            action,
            path,
            { kind: "NOT_EVALUATED", why: "UNSUPPORTED_TARGETING" },
            "UNKNOWN",
            "TARGET_INDEPENDENT_ELIMINATION_CONTINUE",
            {
              targetingRefusal: {
                kind: "ELIMINATED_FOR_EVERY_TARGET",
                optionKeys,
                elimination: targeting.elimination,
              },
              pseudoAction,
            },
          ),
        );
        continue;
      }
      const readGate = action.unsupportedOptions.length === 0;
      if (readGate && gateIsCertainlyNotEntered(gate)) {
        context.steps.push(stepOf(action, path, gate, "UNKNOWN", "ELIMINATED_CONTINUE", { pseudoAction }));
        continue;
      }
      const step = stepOf(
        action,
        path,
        readGate ? gate : { kind: "NOT_EVALUATED", why: "UNSUPPORTED_TARGETING" },
        "UNKNOWN",
        "MAY_SELECT",
        { pseudoAction },
      );
      context.steps.push(step);
      candidates.push({ identity: action.actionToken, step, definite: false });
      continue;
    }

    // ---- applicability, then usability, then the condition ----
    //
    // This ORDER is the pinned one, not a convenience. `select_action` skips a
    // background action before anything else, and `action_ready()` checks
    // readiness before `if_expr`. So an entry decided by either never reaches
    // its condition — which is why several pinned `items` and `misc_cds` lines
    // can carry unsupported syntax without blocking the scan.

    const applicability = context.applicabilityFor(action);

    if (applicability.kind === "NOT_APPLICABLE") {
      // Mirrors `if (a->background) continue;`. The condition is NOT evaluated,
      // and usability is not even asked for: there is no action to be ready.
      context.steps.push(
        stepOf(
          action,
          path,
          { kind: "NOT_EVALUATED", why: "NOT_APPLICABLE" },
          "UNKNOWN",
          "NOT_APPLICABLE_CONTINUE",
          {
            applicability,
          },
        ),
      );
      continue;
    }

    if (applicability.kind === "UNKNOWN") {
      // There is a world in which this action exists and fires, so it cannot be
      // stepped over. Conservative by construction: UNKNOWN applicability is
      // never read as NOT_APPLICABLE.
      const step = stepOf(
        action,
        path,
        { kind: "NOT_EVALUATED", why: "NOT_APPLICABLE" },
        "UNKNOWN",
        "BLOCKED",
        {
          applicability,
        },
      );
      context.steps.push(step);
      return earliestObstacle(candidates, {
        kind: "BLOCKED",
        blocker: "APPLICABILITY_NOT_ESTABLISHED",
        blockedAt: step,
        detail: "whether this entry is a selectable action for this player could not be established",
      });
    }

    // ---- unsupported targeting options, checked BEFORE the condition ----
    //
    // Placed here, after applicability and before usability, for a reason that
    // matches the pinned order rather than fighting it. Applicability is about
    // whether the action EXISTS, which no targeting option changes. Everything
    // below — readiness and the condition — is evaluated PER CANDIDATE TARGET
    // inside the cycle loop, so this project cannot answer any of it, and asking
    // would produce a single-target answer to a multi-target question.
    //
    // Since M11-D3-B1 a `target_if` line is read through `targetingOutcomeFor`,
    // the one rule both selectors share. Cycling re-runs the SAME condition
    // per candidate, so a player-scoped conjunct that is false settles it; a
    // `target_if` line is settled the same way, and a MIN/MAX one whose `if=`
    // reads only player state is ready exactly when the line without
    // `target_if` would be — so it is evaluated as an ordinary line below.
    // Everything else is refused, as before.
    let targetSelection: TargetingRefusal | null = null;
    if (action.unsupportedOptions.length > 0) {
      const optionKeys = action.unsupportedOptions.map((option) => option.optionKey);
      const targeting = targetingOutcomeFor(action, bindingsOf(context));

      if (targeting.kind === "ELIMINATED_FOR_EVERY_TARGET") {
        const elimination = targeting.elimination;
        // A conjunct reading only PLAYER state is FALSE. `FALSE & anything` is
        // FALSE for every candidate, so the loop finds none ready. No target was
        // enumerated to establish this.
        context.steps.push(
          stepOf(
            action,
            path,
            { kind: "NOT_EVALUATED", why: "UNSUPPORTED_TARGETING" },
            "UNKNOWN",
            "TARGET_INDEPENDENT_ELIMINATION_CONTINUE",
            {
              applicability,
              targetingRefusal: { kind: "ELIMINATED_FOR_EVERY_TARGET", optionKeys, elimination },
            },
          ),
        );
        continue;
      }

      if (targeting.kind === "ORDINARY_LINE") {
        targetSelection = { kind: "TARGET_SELECTION_IGNORABLE", optionKeys, targetIf: targeting.targetIf };
      } else {
        const step = stepOf(
          action,
          path,
          { kind: "NOT_EVALUATED", why: "UNSUPPORTED_TARGETING" },
          "UNKNOWN",
          "BLOCKED",
          { applicability, targetingRefusal: refusalOf(optionKeys, targeting) },
        );
        context.steps.push(step);
        return earliestObstacle(candidates, {
          kind: "BLOCKED",
          blocker: "UNSUPPORTED_ACTION_OPTION",
          blockedAt: step,
          detail:
            "the entry carries an action option that redirects its condition onto targets this project " +
            "does not enumerate, and no target-independent conjunct proves it cannot select",
        });
      }
    }

    const verdict = context.usabilityFor(action);

    if (verdict.kind === "PROVEN_UNUSABLE") {
      // Positive evidence that `ready()` could not have succeeded. The condition
      // is irrelevant and is NOT evaluated — which is exactly what SimulationCraft
      // does, and is recorded as a readiness elimination rather than a false
      // condition so the two stay distinguishable in the trace.
      context.steps.push(
        stepOf(
          action,
          path,
          { kind: "NOT_EVALUATED", why: "PROVEN_UNUSABLE" },
          "PROVEN_UNUSABLE",
          "PROVEN_UNUSABLE_CONTINUE",
          { applicability, usabilityVerdict: verdict, targetingRefusal: targetSelection, pseudoAction },
        ),
      );
      continue;
    }

    const usability: ActionUsability = verdict.kind === "PROVEN_USABLE" ? "PROVEN_USABLE" : "UNKNOWN";

    if (gate.kind === "UNSUPPORTED") {
      // Never skipped, never read as false. We cannot tell whether it fires, so
      // nothing below it can be reached soundly — UNLESS the caller can prove
      // that both worlds converge. See `GateIrrelevanceEvidence`.
      const irrelevance = context.gateIrrelevanceFor(action);
      if (irrelevance.kind === "GATE_IRRELEVANT") {
        // A POSSIBLE candidate, never a definite one. The gate stays UNSUPPORTED
        // on the step, so nothing downstream can read this as "the condition was
        // true" — only as "the condition was not read, and this entry may fire".
        const step = stepOf(action, path, gate, usability, "MAY_SELECT", {
          applicability,
          usabilityVerdict: verdict,
          gateIrrelevance: irrelevance,
          targetingRefusal: targetSelection,
          pseudoAction,
        });
        context.steps.push(step);
        candidates.push({ identity: action.actionToken, step, definite: false });
        continue;
      }

      const step = stepOf(action, path, gate, usability, "BLOCKED", {
        applicability,
        usabilityVerdict: verdict,
        gateIrrelevance: irrelevance,
        targetingRefusal: targetSelection,
        pseudoAction,
      });
      context.steps.push(step);
      return earliestObstacle(candidates, {
        kind: "BLOCKED",
        blocker: "UNSUPPORTED_AUTHORITY_EXPRESSION",
        blockedAt: step,
        detail: "a player action's condition is outside the supported expression subset",
      });
    }

    const outcome = outcomeOf(truthOfCondition(gate), usability);

    if (outcome === "ELIMINATED") {
      context.steps.push(
        stepOf(action, path, gate, usability, "ELIMINATED_CONTINUE", {
          applicability,
          usabilityVerdict: verdict,
          targetingRefusal: targetSelection,
          pseudoAction,
        }),
      );
      continue;
    }

    // A `retarget_auto_attack` is never proven to fire: its readiness also
    // needs an auto attack aimed elsewhere, which nothing here can know (M11-D3-B2).
    if (outcome === "DEFINITE_WINNER" && pseudoKind !== "RETARGET_AUTO_ATTACK") {
      // Returned whatever its GCD lane. The pinned loop has no `trigger_gcd`
      // branch: a zero-GCD action ends this scan exactly like any other, and
      // merely begins a new one afterwards.
      const step = stepOf(action, path, gate, usability, "SELECTED", {
        applicability,
        usabilityVerdict: verdict,
        targetingRefusal: targetSelection,
        pseudoAction,
      });
      context.steps.push(step);
      candidates.push({ identity: action.actionToken, step, definite: true });
      break;
    }

    const step = stepOf(action, path, gate, usability, "MAY_SELECT", {
      applicability,
      usabilityVerdict: verdict,
      targetingRefusal: targetSelection,
      pseudoAction,
    });
    context.steps.push(step);
    candidates.push({ identity: action.actionToken, step, definite: false });
  }

  return { kind: "COMPLETED", candidates, transferred, mayEndEmpty, collapse: pending.collapse };
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

/**
 * The result of ONE foreground scan, before it is collapsed into a verdict.
 *
 * `selectAcrossLists` flattens a resolution into a single `TraversalResult`,
 * which answers "what does this scan select" and is the right shape for every
 * caller that asks only that. A caller exploring WORLDS needs the resolution
 * itself — the ordered candidates and whether one of them is guaranteed — and
 * that information is destroyed by the flattening.
 *
 * So this is additive: same scan, same internals, one step earlier.
 */
export type OneForegroundScanResult =
  | {
      readonly kind: "RESOLVED";
      readonly resolution: ScanResolution;
      readonly steps: readonly TraversalStep[];
    }
  | {
      readonly kind: "BLOCKED";
      readonly blocker: TraversalBlocker;
      readonly blockedAt: TraversalStep | null;
      readonly detail: string;
      readonly steps: readonly TraversalStep[];
      /**
       * Present only when the scan stopped at an undecided gate whose worlds
       * WERE explored and did not converge within this scan (M11-D3-A): what
       * they offered, and the full trace of the walk. Internal evidence for a
       * caller that can converge worlds further — the first-GCD engine, across
       * rescans. The stop above is the gate's, and is what a caller reports
       * unless it converges these worlds into one result.
       */
      readonly explored?: {
        readonly resolution: ScanResolution;
        readonly steps: readonly TraversalStep[];
      };
    };

/**
 * The resolution of a completed root walk, or the collapse it falls back to.
 *
 * Every world agreeing — one definite entry, one token, or nothing at all — is
 * the only thing that replaces an undecided gate's stop. A result that still
 * leaves "X, or something else, or nothing" open, or names two actions, is not
 * agreement, so the walk reports the gate (M11-D3-A).
 */
function convergedOrCollapsed(
  context: ScanContext,
  outcome: Extract<ScanOutcome, { kind: "COMPLETED" }>,
):
  | { readonly kind: "RESOLVED"; readonly resolution: ScanResolution }
  | {
      readonly kind: "COLLAPSED";
      readonly stop: BlockedScan;
      readonly resolution: ScanResolution;
      readonly exploredSteps: readonly TraversalStep[];
    } {
  const resolution = resolveScan(outcome.candidates, outcome.mayEndEmpty);
  const agreed =
    resolution.kind === "DEFINITE" ||
    resolution.kind === "TOKEN_CONVERGED" ||
    resolution.kind === "NO_ACTION";
  if (outcome.collapse === null || agreed) return { kind: "RESOLVED", resolution };
  const exploredSteps = [...context.steps];
  return { kind: "COLLAPSED", stop: applyCollapse(context, outcome.collapse), resolution, exploredSteps };
}

/**
 * Runs one foreground scan and returns its resolution unflattened.
 *
 * EXACTLY the scan `selectAcrossLists` runs — the same `scanList`, the same
 * boundary check, the same context. Nothing here re-implements traversal, and
 * nothing here changes it: the two entry points share every line that decides
 * control flow, so they cannot drift.
 */
export function resolveOneForegroundScan(input: NestedSelectionInput): OneForegroundScanResult {
  const boundary = input.startBoundary ?? fromListStart();
  const steps: TraversalStep[] = [];

  const invalid = invalidBoundaryDetail(boundary);
  if (invalid !== null) {
    return { kind: "BLOCKED", blocker: "INVALID_START_BOUNDARY", blockedAt: null, detail: invalid, steps };
  }

  const context: ScanContext = {
    authority: input.authority,
    bindings: input.bindings,
    usabilityFor: input.usabilityFor,
    applicabilityFor: input.applicabilityFor ?? allApplicable(),
    gateIrrelevanceFor: input.gateIrrelevanceFor ?? noGateIrrelevance(),
    steps,
    // Every variable starts at its INCOMING value: the previous scan's, which
    // this project does not have (M11-D3-C2).
    variables: initialScanVariables(),
  };

  const outcome = scanList(context, input.entryListName, boundary.startOrdinal, [], []);
  if (outcome.kind === "BLOCKED") {
    return {
      kind: "BLOCKED",
      blocker: outcome.blocker,
      blockedAt: outcome.blockedAt,
      detail: outcome.detail,
      steps,
    };
  }
  const settled = convergedOrCollapsed(context, outcome);
  if (settled.kind === "COLLAPSED") {
    return {
      kind: "BLOCKED",
      blocker: settled.stop.blocker,
      blockedAt: settled.stop.blockedAt,
      detail: settled.stop.detail,
      steps,
      explored: { resolution: settled.resolution, steps: settled.exploredSteps },
    };
  }
  return { kind: "RESOLVED", resolution: settled.resolution, steps };
}

/**
 * Why a starting boundary is unusable, or `null` when it is fine.
 *
 * The boundary's proof must cover exactly what it skips. This is the one part of
 * a domain-specific narrowing argument that can be checked structurally, and
 * checking it is what stops a start ordinal from quietly asserting that the
 * entries above it do not fire.
 */
function invalidBoundaryDetail(boundary: ScanStartBoundary): string | null {
  const required = Array.from({ length: Math.max(0, boundary.startOrdinal) }, (_, index) => index);
  const proven = new Set(boundary.provenExcludedOrdinals);
  const uncovered = required.filter((ordinal) => !proven.has(ordinal));
  if (boundary.startOrdinal < 0 || uncovered.length > 0) {
    return (
      "the starting boundary skips ordinals its structural proof does not cover, which would assert that " +
      "they do not fire rather than that they cannot be the answer"
    );
  }
  return null;
}

/**
 * Selects across nested action lists, starting in one named list.
 *
 * ONE FOREGROUND SCAN, and deliberately only that. It answers SimulationCraft's
 * own `select_action` question — which action does this scan return — and it
 * does NOT rescan, execute anything, or model what happens after a zero-GCD
 * action fires. The query that does is `firstGcdSelectionAcrossRescans`, which
 * is built ON this one rather than replacing it.
 *
 * Returns exactly one structured result. There is no path that returns nothing:
 * a silently skipped decision point is indistinguishable from one that was fine.
 */
export function selectAcrossLists(input: NestedSelectionInput): TraversalResult {
  const boundary = input.startBoundary ?? fromListStart();
  const steps: TraversalStep[] = [];

  const invalid = invalidBoundaryDetail(boundary);
  if (invalid !== null) {
    return { kind: "UNKNOWN", blocker: "INVALID_START_BOUNDARY", blockedAt: null, steps, detail: invalid };
  }

  const context: ScanContext = {
    authority: input.authority,
    bindings: input.bindings,
    usabilityFor: input.usabilityFor,
    applicabilityFor: input.applicabilityFor ?? allApplicable(),
    gateIrrelevanceFor: input.gateIrrelevanceFor ?? noGateIrrelevance(),
    steps,
    // Every variable starts at its INCOMING value: the previous scan's, which
    // this project does not have (M11-D3-C2).
    variables: initialScanVariables(),
  };

  const outcome = scanList(context, input.entryListName, boundary.startOrdinal, [], []);

  if (outcome.kind === "BLOCKED") {
    return {
      kind: "UNKNOWN",
      blocker: outcome.blocker,
      blockedAt: outcome.blockedAt,
      steps,
      detail: outcome.detail,
    };
  }

  const settled = convergedOrCollapsed(context, outcome);
  if (settled.kind === "COLLAPSED") {
    return {
      kind: "UNKNOWN",
      blocker: settled.stop.blocker,
      blockedAt: settled.stop.blockedAt,
      steps,
      detail: settled.stop.detail,
    };
  }
  const resolution = settled.resolution;

  switch (resolution.kind) {
    case "NO_ACTION":
      return { kind: "NO_ACTION_SELECTED", steps };
    case "DEFINITE":
      return {
        kind: "SELECTED",
        actionToken: resolution.identity,
        selectingStep: resolution.step,
        convergedOver: outcome.candidates.map((candidate) => candidate.step),
        steps,
      };
    case "MAY_SELECT":
      return {
        kind: "UNKNOWN",
        blocker: "NO_DEFINITE_WINNER",
        // Earliest in literal priority order, which is the order candidates were
        // pushed — a callee's entry before any entry below its call site.
        blockedAt: resolution.candidates[0]?.step ?? null,
        steps,
        detail: "entries might fire, none is proven to, and the scan might equally have returned nothing",
      };
    case "TOKEN_CONVERGED":
      return {
        kind: "TOKEN_CONVERGED",
        actionToken: resolution.identity,
        candidateEntries: resolution.candidates.map((candidate) => candidate.step),
        steps,
      };
    case "AMBIGUOUS":
      return {
        kind: "UNKNOWN",
        blocker: "COMPETING_POSSIBLE_ACTION",
        blockedAt: resolution.candidates[0]?.step ?? null,
        steps,
        detail: "an action definitely fires, but a higher-priority possibility names a different one",
      };
  }
}
