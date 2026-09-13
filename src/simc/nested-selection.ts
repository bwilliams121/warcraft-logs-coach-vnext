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
 * provably-empty list does not poison everything beneath it.
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

import type { AplAction, AplAuthority } from "./apl-authority.js";
import type { AplEntryKind } from "./apl-authority.js";
import {
  evaluateCondition,
  outcomeOf,
  truthOfCondition,
  type ActionUsability,
  type ActionUsabilityResolver,
  type LineCondition,
} from "./list-selection.js";
import type { AtomBindings } from "./expression/evaluate.js";

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
  readonly outcome: TraversalStepOutcome;
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
 * - `UNMODELLED_DISPATCH_IN_LIST` — `run_action_list`, whose control flow
 *   differs from `call_action_list` and is not modelled.
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
  | "CALLED_LIST_ABSENT"
  | "CONTROL_FLOW_CYCLE"
  | "UNSUPPORTED_ENTRY_KIND"
  | "INVALID_START_BOUNDARY";

export const TRAVERSAL_BLOCKERS = [
  "UNSUPPORTED_AUTHORITY_EXPRESSION",
  "COMPETING_POSSIBLE_ACTION",
  "NO_DEFINITE_WINNER",
  "UNMODELLED_DISPATCH_IN_LIST",
  "CALLED_LIST_ABSENT",
  "CONTROL_FLOW_CYCLE",
  "UNSUPPORTED_ENTRY_KIND",
  "INVALID_START_BOUNDARY",
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
  readonly usabilityFor: ActionUsabilityResolver;
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
interface Candidate {
  /** The action token. Never a display name — the engine has none. */
  readonly identity: string;
  readonly step: TraversalStep;
  /** True when this is PROVEN to fire, so nothing below it is reachable. */
  readonly definite: boolean;
}

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

/** What a completed scan of one list offers its caller. */
type ScanResolution =
  /** Proven to return no action. The caller continues at its next ordinal. */
  | { readonly kind: "NO_ACTION" }
  /** Proven to return this one action. */
  | { readonly kind: "DEFINITE"; readonly identity: string; readonly step: TraversalStep }
  /** Might return one of these, or might return nothing. */
  | { readonly kind: "MAY_SELECT"; readonly candidates: readonly Candidate[] }
  /** Definitely returns something, but which is undecided. */
  | { readonly kind: "AMBIGUOUS"; readonly candidates: readonly Candidate[] };

type ScanOutcome =
  | { readonly kind: "COMPLETED"; readonly candidates: readonly Candidate[] }
  | {
      readonly kind: "BLOCKED";
      readonly blocker: TraversalBlocker;
      readonly blockedAt: TraversalStep | null;
      readonly detail: string;
    };

/**
 * Turns a completed scan's candidates into what it offers its caller.
 *
 * A DEFINITE result requires a candidate PROVEN to fire. Without one the scan
 * might have fallen off the end and returned nothing, so even a single possible
 * candidate only yields `MAY_SELECT` — "X or nothing", never "X".
 */
function resolveScan(candidates: readonly Candidate[]): ScanResolution {
  if (candidates.length === 0) return { kind: "NO_ACTION" };

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
  // Something fires — the definite candidate guarantees that much — but a higher
  // possible candidate is a different entry, so which one is undecided.
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
): TraversalStep {
  return {
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
  readonly usabilityFor: ActionUsabilityResolver;
  /** Every step visited anywhere, in visit order. Accumulated across recursion. */
  readonly steps: TraversalStep[];
}

function scanList(
  context: ScanContext,
  listName: string,
  startOrdinal: number,
  path: readonly TraversalPathEntry[],
  /** The lists currently ON THE CALL STACK, innermost last. Not "ever visited". */
  callStack: readonly string[],
): ScanOutcome {
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

  for (const action of lookup.actions) {
    if (action.priorityOrdinal < startOrdinal) continue;

    // `run_action_list` does not fall through the way `call_action_list` does,
    // so no result written for one describes the other.
    if (action.isUnmodelledDispatch) {
      const step = stepOf(action, path, { kind: "UNCONDITIONAL" }, "UNKNOWN", "BLOCKED");
      context.steps.push(step);
      return {
        kind: "BLOCKED",
        blocker: "UNMODELLED_DISPATCH_IN_LIST",
        blockedAt: step,
        detail: "run_action_list does not return to its caller the way call_action_list does",
      };
    }

    const gate = evaluateCondition(action, context.bindings);

    // ---- variable: the one execute-and-continue construct ----
    if (action.entryKind === "VARIABLE_ASSIGNMENT") {
      // It is never what a scan returns, so it cannot change control flow, and
      // its GATE cannot either — a variable that does not get assigned still
      // does not end the scan.
      //
      // Its VALUE is a different question, and it is handled a layer down rather
      // than ignored. A later condition reading `variable.single_target` sees an
      // unresolved BOOLEAN atom and enumerates both worlds; a later condition
      // reading a variable with no atom at all fails the whole expression at the
      // parser and blocks there. Either way the value is accounted for
      // conservatively, so there is nothing for this module to add — and
      // demanding a concrete value here would block scans that our own epistemic
      // model is perfectly able to carry forward as unknown.
      context.steps.push(stepOf(action, path, gate, "UNKNOWN", "VARIABLE_EXECUTED_CONTINUE"));
      continue;
    }

    // ---- call_action_list ----
    if (action.entryKind === "LIST_DISPATCH") {
      const target = action.callsListName;
      if (target === null) {
        // `swap_action_list`, or a malformed call carrying no `name=`. Either
        // way this module cannot say where control went.
        const step = stepOf(action, path, gate, "UNKNOWN", "BLOCKED");
        context.steps.push(step);
        return {
          kind: "BLOCKED",
          blocker: "UNSUPPORTED_ENTRY_KIND",
          blockedAt: step,
          detail: "a list-dispatch entry names no callable list this module can follow",
        };
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
      const child = scanList(context, target, 0, callPath, nestedStack);
      if (child.kind === "BLOCKED") {
        // An unresolved callee blocks every entry BELOW this call site. Stepping
        // over it to reach something decidable lower down is precisely the
        // priority short-circuit this project forbids.
        finishCall("BLOCKED");
        return child;
      }

      const childResolution = resolveScan(child.candidates);

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
        return {
          kind: "BLOCKED",
          blocker: "COMPETING_POSSIBLE_ACTION",
          blockedAt,
          detail: "the called list definitely selects an action, but which one is undecided",
        };
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
      finishCall("CALL_MAY_SELECT");
      candidates.push(...contributed);
      continue;
    }

    // ---- an ordinary player action ----
    if (action.entryKind !== "PLAYER_ACTION") {
      const step = stepOf(action, path, gate, "UNKNOWN", "BLOCKED");
      context.steps.push(step);
      return {
        kind: "BLOCKED",
        blocker: "UNSUPPORTED_ENTRY_KIND",
        blockedAt: step,
        detail: "an entry kind this module does not model appeared in the scan",
      };
    }

    if (gate.kind === "UNSUPPORTED") {
      // Never skipped, never read as false. We cannot tell whether it fires, so
      // nothing below it can be reached soundly.
      const step = stepOf(action, path, gate, context.usabilityFor(action), "BLOCKED");
      context.steps.push(step);
      return {
        kind: "BLOCKED",
        blocker: "UNSUPPORTED_AUTHORITY_EXPRESSION",
        blockedAt: step,
        detail: "a player action's condition is outside the supported expression subset",
      };
    }

    const usability = context.usabilityFor(action);
    const outcome = outcomeOf(truthOfCondition(gate), usability);

    if (outcome === "ELIMINATED") {
      context.steps.push(stepOf(action, path, gate, usability, "ELIMINATED_CONTINUE"));
      continue;
    }

    if (outcome === "DEFINITE_WINNER") {
      // Returned whatever its GCD lane. The pinned loop has no `trigger_gcd`
      // branch: a zero-GCD action ends this scan exactly like any other, and
      // merely begins a new one afterwards.
      const step = stepOf(action, path, gate, usability, "SELECTED");
      context.steps.push(step);
      candidates.push({ identity: action.actionToken, step, definite: true });
      break;
    }

    const step = stepOf(action, path, gate, usability, "MAY_SELECT");
    context.steps.push(step);
    candidates.push({ identity: action.actionToken, step, definite: false });
  }

  return { kind: "COMPLETED", candidates };
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

/**
 * Selects across nested action lists, starting in one named list.
 *
 * Returns exactly one structured result. There is no path that returns nothing:
 * a silently skipped decision point is indistinguishable from one that was fine.
 */
export function selectAcrossLists(input: NestedSelectionInput): TraversalResult {
  const boundary = input.startBoundary ?? fromListStart();
  const steps: TraversalStep[] = [];

  // The boundary's proof must cover exactly what it skips. This is the one part
  // of a domain-specific narrowing argument that can be checked structurally,
  // and checking it is what stops a start ordinal from quietly asserting that
  // the entries above it do not fire.
  const required = Array.from({ length: Math.max(0, boundary.startOrdinal) }, (_, index) => index);
  const proven = new Set(boundary.provenExcludedOrdinals);
  const uncovered = required.filter((ordinal) => !proven.has(ordinal));
  if (boundary.startOrdinal < 0 || uncovered.length > 0) {
    return {
      kind: "UNKNOWN",
      blocker: "INVALID_START_BOUNDARY",
      blockedAt: null,
      steps,
      detail:
        "the starting boundary skips ordinals its structural proof does not cover, which would assert that " +
        "they do not fire rather than that they cannot be the answer",
    };
  }

  const context: ScanContext = {
    authority: input.authority,
    bindings: input.bindings,
    usabilityFor: input.usabilityFor,
    steps,
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

  const resolution = resolveScan(outcome.candidates);

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
