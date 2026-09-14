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
import type { AtomBindings } from "./expression/evaluate.js";
import {
  proveTargetIndependentFalsehood,
  type TargetIndependenceFailure,
  type TargetIndependentElimination,
} from "./target-independence.js";

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
    };

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
   */
  | "UNSUPPORTED_ACTION_OPTION";

export const TRAVERSAL_BLOCKERS = [
  "UNSUPPORTED_AUTHORITY_EXPRESSION",
  "COMPETING_POSSIBLE_ACTION",
  "NO_DEFINITE_WINNER",
  "UNMODELLED_DISPATCH_IN_LIST",
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
  } = {},
): TraversalStep {
  return {
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
}

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
 */
function earliestObstacle(candidates: readonly Candidate[], blocked: ScanOutcome): ScanOutcome {
  const earliest = candidates[0];
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
      return earliestObstacle(candidates, {
        kind: "BLOCKED",
        blocker: "UNMODELLED_DISPATCH_IN_LIST",
        blockedAt: step,
        detail: "run_action_list does not return to its caller the way call_action_list does",
      });
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
        return earliestObstacle(candidates, {
          kind: "BLOCKED",
          blocker: "UNSUPPORTED_ENTRY_KIND",
          blockedAt: step,
          detail: "a list-dispatch entry names no callable list this module can follow",
        });
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
        return earliestObstacle(candidates, child);
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
    if (action.unsupportedOptions.length > 0) {
      const optionKeys = action.unsupportedOptions.map((option) => option.optionKey);
      // `target_if` is refused OUTRIGHT and is never routed through the
      // target-independent rule. Cycling re-runs the SAME condition per
      // candidate, so a conjunct that is false for all of them settles it;
      // `target_if` instead SCORES candidates and RETARGETS the action
      // (action.cpp:2429-2461), which changes what every later atom in the scan
      // reads. One conjunct cannot settle that, and pretending otherwise would
      // be modelling target scoring by the back door.
      const retargets = optionKeys.includes("target_if");
      const elimination = retargets
        ? ({ kind: "NOT_PROVEN", failure: "NO_TARGET_INDEPENDENT_CONJUNCT" } as const)
        : proveTargetIndependentFalsehood(action, context.bindings);

      if (elimination.kind === "ELIMINATED_FOR_EVERY_TARGET") {
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

      const step = stepOf(
        action,
        path,
        { kind: "NOT_EVALUATED", why: "UNSUPPORTED_TARGETING" },
        "UNKNOWN",
        "BLOCKED",
        {
          applicability,
          targetingRefusal: { kind: "REFUSED", optionKeys, failure: elimination.failure },
        },
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
          { applicability, usabilityVerdict: verdict },
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
        });
        context.steps.push(step);
        candidates.push({ identity: action.actionToken, step, definite: false });
        continue;
      }

      const step = stepOf(action, path, gate, usability, "BLOCKED", {
        applicability,
        usabilityVerdict: verdict,
        gateIrrelevance: irrelevance,
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
        }),
      );
      continue;
    }

    if (outcome === "DEFINITE_WINNER") {
      // Returned whatever its GCD lane. The pinned loop has no `trigger_gcd`
      // branch: a zero-GCD action ends this scan exactly like any other, and
      // merely begins a new one afterwards.
      const step = stepOf(action, path, gate, usability, "SELECTED", {
        applicability,
        usabilityVerdict: verdict,
      });
      context.steps.push(step);
      candidates.push({ identity: action.actionToken, step, definite: true });
      break;
    }

    const step = stepOf(action, path, gate, usability, "MAY_SELECT", {
      applicability,
      usabilityVerdict: verdict,
    });
    context.steps.push(step);
    candidates.push({ identity: action.actionToken, step, definite: false });
  }

  return { kind: "COMPLETED", candidates };
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
    };

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
  return { kind: "RESOLVED", resolution: resolveScan(outcome.candidates), steps };
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
