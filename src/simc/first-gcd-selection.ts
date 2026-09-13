/**
 * The first ROTATIONAL-GCD selection, across zero or more NON_GCD rescans.
 *
 * A DIFFERENT QUESTION FROM ONE SCAN, AND THE DIFFERENCE IS THE WHOLE POINT
 *
 *     selectAcrossLists            which action does THIS foreground scan return?
 *     firstGcdSelectionAcrossRescans
 *                                  allowing zero or more NON_GCD actions to be
 *                                  selected, executed, and followed by a fresh
 *                                  scan from the ROOT, which GCD-consuming
 *                                  action is selected first?
 *
 * The second is built ON the first. It never re-implements APL traversal, never
 * filters the APL down to GCD actions, and never skips a NON_GCD entry: a
 * zero-GCD action that fires genuinely ENDS its scan, executes, and is followed
 * by a new scan — so it is a step on the path to the answer, not noise to drop.
 *
 * WHY THE RESTART IS AT THE ROOT
 *
 * `player_t::execute_action` resets `visited_apls_` and calls
 * `select_action( *active_action_list, FOREGROUND )` (player.cpp:7377). Not the
 * child list a nested action was found in, not the next ordinal, not the call
 * stack. So an action selected three lists deep is followed by a scan that
 * begins again at the top of the root list, and an entry ABOVE the previous
 * selection can become the next one. This engine reproduces exactly that.
 *
 * ONLY Δt = 0 IS SUPPORTED, AND UNSUPPORTED IS NOT IGNORED
 *
 * A NON_GCD foreground action schedules its next ready event with zero delay:
 * `start_gcd()` early-returns when `gcd()` is zero so `gcd_ready` is untouched,
 * and `schedule_ready` takes the `gcd() == 0 && !add_queue_lag` branch to
 * `lag = 0` (player.cpp:6963). The rescan is at the SAME simulation timestamp.
 *
 * The transition contract can express a non-zero advance, and this engine
 * REFUSES it rather than applying or ignoring it. Time advancement is not
 * modelled here, and a transition that needs it must say so and be told no.
 *
 * THE OFF_GCD PASS IS OUT OF SCOPE, STRUCTURALLY
 *
 * `use_off_gcd=1` adds an action to a second list polled through
 * `execute_type::OFF_GCD`, which is set in exactly one place: when a GCD is
 * already running (action.cpp:301-306). This query BEGINS at a ready foreground
 * selection point, where that pass is unreachable, and TERMINATES at the first
 * GCD-consuming selection, which is the moment it first becomes reachable. So
 * the entire off-GCD pass falls outside the query by construction, and this
 * engine models none of it.
 *
 * WHAT THIS ENGINE DOES NOT KNOW
 *
 * Anything about the game. State is opaque, supplied by the caller, keyed by the
 * caller, and transitioned by the caller. This module reads no resource, no
 * cooldown, no aura, no talent and no spell id. It is loop, branch, converge and
 * cycle detection over a scan it does not perform and a state it cannot inspect.
 */

import type { ExecutionLane } from "../data/game/ability-gcd-semantics.js";
import type {
  OneForegroundScanResult,
  ScanCandidate,
  TraversalBlocker,
  TraversalPathEntry,
  TraversalStep,
} from "./nested-selection.js";

// --------------------------------------------------------------------------
// The transition contract
// --------------------------------------------------------------------------

/**
 * Why a state changed, for a reader asking how a prefix was arrived at.
 *
 * Deliberately three strings and nothing structured. A richer evidence type
 * would have to name concepts — cooldowns, resources, auras — that this layer
 * must not learn, and the trace already carries the authority coordinates.
 */
export interface NonGcdTransitionEvidence {
  /** Author-written label for what happened, e.g. "potion consumed". */
  readonly kind: string;
  /** Where the claim comes from. A pinned source reference, a dataset id. */
  readonly provenance: string;
  readonly stateKeyBefore: string;
  readonly stateKeyAfter: string;
}

/**
 * What executing one selected NON_GCD action does to the caller's state.
 *
 * `UNSUPPORTED` and `UNKNOWN` are kept apart because they mean different things
 * to whoever reads the refusal: the first says this project does not model the
 * action, the second says it does but the evidence here is insufficient. Both
 * stop the branch, and neither may be read as "nothing happened".
 */
export type NonGcdTransitionOutcome<TState> =
  | {
      readonly kind: "APPLIED";
      readonly nextState: TState;
      /** MILLISECONDS. Only 0 is supported; anything else is refused, not ignored. */
      readonly timeAdvanceMs: number;
      readonly evidence: NonGcdTransitionEvidence;
    }
  | { readonly kind: "UNSUPPORTED"; readonly detail: string }
  | { readonly kind: "UNKNOWN"; readonly detail: string };

/** The action a transition is being asked about. Coordinates only. */
export interface SelectedNonGcdAction {
  readonly actionToken: string;
  readonly step: TraversalStep;
}

export type NonGcdTransitionResolver<TState> = (
  action: SelectedNonGcdAction,
  state: TState,
) => NonGcdTransitionOutcome<TState>;

// --------------------------------------------------------------------------
// Result vocabulary
// --------------------------------------------------------------------------

export type RotationalGcdBlocker =
  /** The underlying foreground scan refused; its own blocker is carried. */
  | "ONE_SCAN_BLOCKED"
  /** A selectable action has no established lane, so it cannot be classified. */
  | "UNKNOWN_EXECUTION_LANE"
  /** A NON_GCD action fired and this project does not model what it does. */
  | "TRANSITION_UNSUPPORTED"
  /** It is modelled, but the evidence could not establish the new state. */
  | "TRANSITION_UNKNOWN"
  /** A transition needs simulated time to pass. Not modelled; refused. */
  | "UNSUPPORTED_TIME_ADVANCE"
  /** The same abstract state was reached again before any GCD was selected. */
  | "NO_PROGRESS_CYCLE"
  /** Supported worlds disagree about which authority entry fires first. */
  | "DIVERGENT_GCD_OUTCOMES";

export const ROTATIONAL_GCD_BLOCKERS = [
  "ONE_SCAN_BLOCKED",
  "UNKNOWN_EXECUTION_LANE",
  "TRANSITION_UNSUPPORTED",
  "TRANSITION_UNKNOWN",
  "UNSUPPORTED_TIME_ADVANCE",
  "NO_PROGRESS_CYCLE",
  "DIVERGENT_GCD_OUTCOMES",
] as const satisfies readonly RotationalGcdBlocker[];

/**
 * What is known about the NON_GCD actions executed before the answer.
 *
 * `possibleActions` is a UNION across worlds, not a sequence. Different worlds
 * can reach the same first GCD through different prefixes, and reporting one of
 * them as though it were the prefix would invent a history no evidence supports.
 * `exactSequenceKnown` is true only when every converging world took the
 * identical path, and `sequence` is populated only then.
 */
export interface NonGcdPrefixSummary {
  readonly possibleActions: readonly TraversalPathEntry[];
  readonly exactSequenceKnown: boolean;
  /** Populated only when `exactSequenceKnown`. Never a representative sample. */
  readonly sequence: readonly TraversalPathEntry[] | null;
}

/** One explored world, kept so "why is X first?" has an answer. */
export interface RotationalTraceNode {
  readonly stateKey: string;
  readonly rootListName: string;
  /** The one-scan resolution kind, or `BLOCKED`. */
  readonly scan: string;
  readonly branches: readonly RotationalTraceBranch[];
  /** How this node resolved, after its branches converged. */
  readonly outcome: string;
}

export interface RotationalTraceBranch {
  /** Author-written: which world this is. Never interpolated from upstream data. */
  readonly label: string;
  readonly entry: TraversalPathEntry | null;
  readonly node: RotationalTraceNode | null;
  readonly outcome: string;
}

export type RotationalGcdResult =
  | {
      /**
       * Across EVERY supported finite world from the initial state, after zero
       * or more NON_GCD executions and root rescans, the first GCD-consuming
       * selection is this same authority entry.
       *
       * It does NOT mean "this is the literal next action". Actions may fire
       * before it, and `nonGcdPrefix` says what is known about them.
       */
      readonly kind: "ROTATIONAL_GCD_SELECTED";
      readonly actionToken: string;
      readonly selectingEntry: readonly TraversalPathEntry[];
      readonly selectingStep: TraversalStep;
      readonly nonGcdPrefix: NonGcdPrefixSummary;
      readonly trace: RotationalTraceNode;
    }
  | {
      readonly kind: "ROTATIONAL_GCD_UNKNOWN";
      readonly blocker: RotationalGcdBlocker;
      /** The underlying scan's blocker, when `ONE_SCAN_BLOCKED`. */
      readonly scanBlocker: TraversalBlocker | null;
      readonly blockedAt: TraversalStep | null;
      readonly detail: string;
      readonly trace: RotationalTraceNode;
    }
  | {
      /** Every world proves the foreground scan returns nothing at all. */
      readonly kind: "NO_ROTATIONAL_GCD_SELECTED";
      readonly trace: RotationalTraceNode;
    };

/**
 * Converges several completed first-GCD results into one.
 *
 * ADDITIVE, and exported so a caller exploring worlds the engine cannot see —
 * correlated profile worlds, for instance — converges them with the SAME rule
 * the engine uses internally rather than a second one that drifts.
 *
 * The rule is C3b's identity rule: unanimity on the authority ENTRY, not on the
 * token. Any refusal, any disagreement, and any mixture of "fires" with "returns
 * nothing" collapses to UNKNOWN. A refusal is reported in preference to a
 * divergence, because a world that was never explored is not a world that
 * disagreed.
 */
export function convergeRotationalResults(results: readonly RotationalGcdResult[]): RotationalGcdResult {
  const first = results[0];
  if (first === undefined) {
    throw new Error("convergeRotationalResults needs at least one result");
  }
  if (results.length === 1) return first;

  const refused = results.find((result) => result.kind === "ROTATIONAL_GCD_UNKNOWN");
  if (refused !== undefined) return refused;

  const selected = results.filter((result) => result.kind === "ROTATIONAL_GCD_SELECTED");
  if (selected.length === 0) {
    // Every world proves the scan returns nothing at all.
    return first;
  }
  if (selected.length !== results.length) {
    const head = selected[0];
    return {
      kind: "ROTATIONAL_GCD_UNKNOWN",
      blocker: "DIVERGENT_GCD_OUTCOMES",
      scanBlocker: null,
      blockedAt: head?.kind === "ROTATIONAL_GCD_SELECTED" ? head.selectingStep : null,
      detail:
        "some explored worlds select a first GCD action and others prove the scan returns nothing, so " +
        "there is no action every world agrees fires first",
      trace: first.trace,
    };
  }

  const head = selected[0];
  if (head?.kind !== "ROTATIONAL_GCD_SELECTED") return first;
  let prefix = head.nonGcdPrefix;

  for (const candidate of selected.slice(1)) {
    if (candidate.kind !== "ROTATIONAL_GCD_SELECTED") continue;
    if (
      !sameTerminalIdentity(
        head.selectingStep,
        candidate.selectingStep,
        head.actionToken,
        candidate.actionToken,
      )
    ) {
      return {
        kind: "ROTATIONAL_GCD_UNKNOWN",
        blocker: "DIVERGENT_GCD_OUTCOMES",
        scanBlocker: null,
        blockedAt: head.selectingStep,
        detail:
          "explored worlds select different first GCD entries: " +
          `${entryKey(candidateEntryOfStep(head.selectingStep, head.actionToken))} and ` +
          `${entryKey(candidateEntryOfStep(candidate.selectingStep, candidate.actionToken))}`,
        trace: head.trace,
      };
    }
    prefix = mergeSummaries(prefix, candidate.nonGcdPrefix);
  }

  return { ...head, nonGcdPrefix: prefix };
}

function candidateEntryOfStep(step: TraversalStep, actionToken: string): TraversalPathEntry {
  return { listName: step.listName, priorityOrdinal: step.priorityOrdinal, actionToken };
}

/** Merges two prefix summaries. Uniqueness survives only if both agree. */
function mergeSummaries(left: NonGcdPrefixSummary, right: NonGcdPrefixSummary): NonGcdPrefixSummary {
  const merged = mergePrefixes(
    { actions: left.possibleActions, uniqueSequence: left.sequence },
    { actions: right.possibleActions, uniqueSequence: right.sequence },
  );
  return {
    possibleActions: merged.actions,
    exactSequenceKnown: merged.uniqueSequence !== null,
    sequence: merged.uniqueSequence,
  };
}

export interface FirstGcdSelectionInput<TState> {
  /** Named for the cycle key and the trace. The scan itself is the caller's. */
  readonly rootListName: string;
  readonly initialState: TState;
  /**
   * A stable, serializable identity for an abstract state.
   *
   * Cycle detection compares these, never object references. Two states with the
   * same key are treated as the same state, so a key that omits a distinction
   * the scan can see would make progress look like a cycle — and one that
   * includes irrelevant noise would make a cycle look like progress.
   */
  readonly stateKey: (state: TState) => string;
  /**
   * ONE foreground scan from the root, under this state.
   *
   * A function rather than bindings, so this engine never learns how a state
   * becomes an expression binding or a usability verdict. The caller closes over
   * the authority and its resolvers.
   */
  readonly scanFor: (state: TState) => OneForegroundScanResult;
  /** The lane of a selectable action. `UNKNOWN_LANE` refuses; it never defaults. */
  readonly laneFor: (step: TraversalStep) => ExecutionLane;
  readonly transitionFor: NonGcdTransitionResolver<TState>;
}

// --------------------------------------------------------------------------
// Internals
// --------------------------------------------------------------------------

/** A prefix accumulator that stays bounded while tracking uniqueness honestly. */
interface PrefixFacts {
  readonly actions: readonly TraversalPathEntry[];
  /** `null` once two worlds disagree about the order, or about the set. */
  readonly uniqueSequence: readonly TraversalPathEntry[] | null;
}

const EMPTY_PREFIX: PrefixFacts = { actions: [], uniqueSequence: [] };

function entryKey(entry: TraversalPathEntry): string {
  return `${entry.listName}[${String(entry.priorityOrdinal)}] ${entry.actionToken}`;
}

function sequenceKey(entries: readonly TraversalPathEntry[]): string {
  return entries.map(entryKey).join(" -> ");
}

function withAction(prefix: PrefixFacts, entry: TraversalPathEntry): PrefixFacts {
  const seen = new Set(prefix.actions.map(entryKey));
  return {
    actions: seen.has(entryKey(entry)) ? prefix.actions : [...prefix.actions, entry],
    uniqueSequence: prefix.uniqueSequence === null ? null : [...prefix.uniqueSequence, entry],
  };
}

function mergePrefixes(left: PrefixFacts, right: PrefixFacts): PrefixFacts {
  const actions = [...left.actions];
  const seen = new Set(actions.map(entryKey));
  for (const entry of right.actions) {
    if (seen.has(entryKey(entry))) continue;
    seen.add(entryKey(entry));
    actions.push(entry);
  }
  const same =
    left.uniqueSequence !== null &&
    right.uniqueSequence !== null &&
    sequenceKey(left.uniqueSequence) === sequenceKey(right.uniqueSequence);
  return { actions, uniqueSequence: same ? left.uniqueSequence : null };
}

/** One world's terminal, before convergence. Carries the prefix that reached it. */
type BranchResult =
  | {
      readonly kind: "SELECTED";
      readonly actionToken: string;
      readonly step: TraversalStep;
      readonly prefix: PrefixFacts;
      readonly trace: RotationalTraceNode;
    }
  | { readonly kind: "NO_ACTION"; readonly trace: RotationalTraceNode }
  | {
      readonly kind: "UNKNOWN";
      readonly blocker: RotationalGcdBlocker;
      readonly scanBlocker: TraversalBlocker | null;
      readonly blockedAt: TraversalStep | null;
      readonly detail: string;
      readonly trace: RotationalTraceNode;
    };

/**
 * Whether two terminals are the same selection.
 *
 * THE SAME RULE C3b USES, deliberately. A `SELECTED` result names a concrete
 * authority entry — list, ordinal, verbatim string, source line — and two worlds
 * that reach the same TOKEN through different entries have not agreed about what
 * was selected. Converging them would fabricate a provenance only one of them
 * supports.
 */
function sameTerminalIdentity(
  left: TraversalStep,
  right: TraversalStep,
  leftToken: string,
  rightToken: string,
): boolean {
  return (
    leftToken === rightToken &&
    left.listName === right.listName &&
    left.priorityOrdinal === right.priorityOrdinal &&
    left.actionStringVerbatim === right.actionStringVerbatim &&
    left.sourceLine === right.sourceLine
  );
}

function shortOutcome(result: BranchResult): string {
  switch (result.kind) {
    case "SELECTED":
      return `SELECTED ${entryKey({ listName: result.step.listName, priorityOrdinal: result.step.priorityOrdinal, actionToken: result.actionToken })}`;
    case "NO_ACTION":
      return "NO_ACTION";
    case "UNKNOWN":
      return `UNKNOWN ${result.blocker}`;
  }
}

/**
 * Converges the terminals of several worlds.
 *
 * Exactness requires unanimity on the authority ENTRY. Any disagreement, any
 * refusal, and any mixture of "fires" with "returns nothing" collapses to
 * UNKNOWN — the last of those because a world where the scan returns nothing is
 * a world where the claimed action did not fire first, which contradicts the
 * claim outright.
 *
 * A refusal is reported in preference to divergence, because a blocked world is
 * evidence we did not gather rather than evidence of disagreement, and telling a
 * reader "these worlds disagree" when one of them was never explored would
 * overstate what is known.
 */
function convergeBranches(results: readonly BranchResult[], trace: RotationalTraceNode): BranchResult {
  const firstUnknown = results.find((result) => result.kind === "UNKNOWN");
  if (firstUnknown !== undefined && firstUnknown.kind === "UNKNOWN") {
    return { ...firstUnknown, trace };
  }

  const selected = results.filter((result) => result.kind === "SELECTED");
  if (selected.length === 0) {
    // Every world proves the scan returns nothing. That is an answer, not a gap.
    return { kind: "NO_ACTION", trace };
  }

  if (selected.length !== results.length) {
    return {
      kind: "UNKNOWN",
      blocker: "DIVERGENT_GCD_OUTCOMES",
      scanBlocker: null,
      blockedAt: selected[0]?.kind === "SELECTED" ? selected[0].step : null,
      detail:
        "some supported worlds select a first GCD action and others prove the scan returns nothing, so " +
        "there is no action every world agrees fires first",
      trace,
    };
  }

  const first = selected[0];
  if (first?.kind !== "SELECTED") return { kind: "NO_ACTION", trace };
  for (const candidate of selected) {
    if (candidate.kind !== "SELECTED") continue;
    if (sameTerminalIdentity(first.step, candidate.step, first.actionToken, candidate.actionToken)) continue;
    return {
      kind: "UNKNOWN",
      blocker: "DIVERGENT_GCD_OUTCOMES",
      scanBlocker: null,
      blockedAt: first.step,
      detail: `supported worlds select different first GCD entries: ${shortOutcome(first)} and ${shortOutcome(candidate)}`,
      trace,
    };
  }

  let prefix = first.prefix;
  for (const candidate of selected.slice(1)) {
    if (candidate.kind !== "SELECTED") continue;
    prefix = mergePrefixes(prefix, candidate.prefix);
  }
  return { kind: "SELECTED", actionToken: first.actionToken, step: first.step, prefix, trace };
}

function candidateEntry(candidate: ScanCandidate): TraversalPathEntry {
  return {
    listName: candidate.step.listName,
    priorityOrdinal: candidate.step.priorityOrdinal,
    actionToken: candidate.step.actionToken,
  };
}

// --------------------------------------------------------------------------
// The engine
// --------------------------------------------------------------------------

/**
 * The first GCD-consuming selection reachable from `initialState`.
 *
 * Explores every supported world, applies caller-owned transitions to
 * caller-owned state, restarts each scan at the root, and converges the
 * terminals. Returns exactly one structured result.
 */
export function firstGcdSelectionAcrossRescans<TState>(
  input: FirstGcdSelectionInput<TState>,
): RotationalGcdResult {
  const memo = new Map<string, BranchResult>();

  /** Explores one abstract state. `onPath` is the cycle guard for THIS branch. */
  function explore(state: TState, prefix: PrefixFacts, onPath: readonly string[]): BranchResult {
    const key = `${input.rootListName}::${input.stateKey(state)}`;

    // CYCLE FIRST, memo second. A state already on this path has produced no
    // progress, and that is true regardless of what a completed exploration of
    // the same state concluded elsewhere.
    if (onPath.includes(key)) {
      const trace: RotationalTraceNode = {
        stateKey: key,
        rootListName: input.rootListName,
        scan: "NOT_SCANNED",
        branches: [],
        outcome: "UNKNOWN NO_PROGRESS_CYCLE",
      };
      return {
        kind: "UNKNOWN",
        blocker: "NO_PROGRESS_CYCLE",
        scanBlocker: null,
        blockedAt: null,
        detail:
          "the same abstract rotational state was reached again before any GCD-consuming action was " +
          "selected, so no sequence of transitions from here can make progress",
        trace,
      };
    }

    const memoized = memo.get(key);
    // The prefix is path-dependent and the terminal is not, so a memo hit reuses
    // the verdict and re-bases the prefix onto the path that reached it.
    if (memoized !== undefined) return rebase(memoized, prefix);

    const nextOnPath = [...onPath, key];
    const scan = input.scanFor(state);

    if (scan.kind === "BLOCKED") {
      const trace: RotationalTraceNode = {
        stateKey: key,
        rootListName: input.rootListName,
        scan: `BLOCKED ${scan.blocker}`,
        branches: [],
        outcome: "UNKNOWN ONE_SCAN_BLOCKED",
      };
      const result: BranchResult = {
        kind: "UNKNOWN",
        blocker: "ONE_SCAN_BLOCKED",
        scanBlocker: scan.blocker,
        blockedAt: scan.blockedAt,
        detail: scan.detail,
        trace,
      };
      memo.set(key, result);
      return result;
    }

    const resolution = scan.resolution;

    if (resolution.kind === "NO_ACTION") {
      const trace: RotationalTraceNode = {
        stateKey: key,
        rootListName: input.rootListName,
        scan: "NO_ACTION",
        branches: [],
        outcome: "NO_ACTION",
      };
      const result: BranchResult = { kind: "NO_ACTION", trace };
      memo.set(key, result);
      return result;
    }

    if (resolution.kind === "DEFINITE") {
      const branch = takeCandidate(
        { identity: resolution.identity, step: resolution.step, definite: true },
        state,
        prefix,
        nextOnPath,
      );
      const trace: RotationalTraceNode = {
        stateKey: key,
        rootListName: input.rootListName,
        scan: "DEFINITE",
        branches: [
          {
            label: "the scan proves this entry fires",
            entry: candidateEntry({ identity: resolution.identity, step: resolution.step, definite: true }),
            node: branch.kind === "UNKNOWN" || branch.kind === "NO_ACTION" ? branch.trace : branch.trace,
            outcome: shortOutcome(branch),
          },
        ],
        outcome: shortOutcome(branch),
      };
      const result = retrace(branch, trace);
      memo.set(key, stripPrefix(result));
      return result;
    }

    // ---- MAY_SELECT and AMBIGUOUS: several worlds ----
    //
    // Candidates arrive in literal APL priority order and are explored in it.
    // The ONLY difference between the two is whether a world exists in which
    // nothing fires: `AMBIGUOUS` carries a candidate proven to fire, so it does
    // not, and inventing one would manufacture a world the scan disproved.
    const branches: RotationalTraceBranch[] = [];
    const results: BranchResult[] = [];

    for (const candidate of resolution.candidates) {
      const branch = takeCandidate(candidate, state, prefix, nextOnPath);
      results.push(branch);
      branches.push({
        label: "this entry is the one that fires",
        entry: candidateEntry(candidate),
        node: branch.trace,
        outcome: shortOutcome(branch),
      });
    }

    if (resolution.kind === "MAY_SELECT") {
      // The world the resolution genuinely proves: no candidate's conditions
      // hold, the walk already reached the end of the list, and the scan returns
      // nothing. Not a fabricated continuation — the scan did this work.
      const noneTrace: RotationalTraceNode = {
        stateKey: key,
        rootListName: input.rootListName,
        scan: "MAY_SELECT",
        branches: [],
        outcome: "NO_ACTION",
      };
      results.push({ kind: "NO_ACTION", trace: noneTrace });
      branches.push({
        label: "no candidate fires, and the scan returns nothing",
        entry: null,
        node: null,
        outcome: "NO_ACTION",
      });
    }

    const trace: RotationalTraceNode = {
      stateKey: key,
      rootListName: input.rootListName,
      scan: resolution.kind,
      branches,
      outcome: "",
    };
    const converged = convergeBranches(results, trace);
    const withOutcome: RotationalTraceNode = { ...trace, outcome: shortOutcome(converged) };
    const result = retrace(converged, withOutcome);
    memo.set(key, stripPrefix(result));
    return result;
  }

  /** One world in which `candidate` is the action this scan returns. */
  function takeCandidate(
    candidate: ScanCandidate,
    state: TState,
    prefix: PrefixFacts,
    onPath: readonly string[],
  ): BranchResult {
    const emptyTrace: RotationalTraceNode = {
      stateKey: `${input.rootListName}::${input.stateKey(state)}`,
      rootListName: input.rootListName,
      scan: "SELECTION",
      branches: [],
      outcome: "",
    };
    const lane = input.laneFor(candidate.step);

    if (lane === "UNKNOWN_LANE") {
      // Never assumed NON_GCD. Without a lane we cannot tell whether this is the
      // answer or a step towards it, and guessing either way would be a claim.
      return {
        kind: "UNKNOWN",
        blocker: "UNKNOWN_EXECUTION_LANE",
        scanBlocker: null,
        blockedAt: candidate.step,
        detail:
          "a selectable action has no established execution lane, so whether it terminates the query or " +
          "merely precedes the answer cannot be decided",
        trace: { ...emptyTrace, outcome: "UNKNOWN UNKNOWN_EXECUTION_LANE" },
      };
    }

    if (lane === "GCD_CONSUMING") {
      // TERMINAL. The action is NOT executed and no transition is asked for: the
      // query ends at the SELECTION of the first GCD action, and everything
      // after it — including the OFF_GCD pass during its GCD — is out of scope.
      return {
        kind: "SELECTED",
        actionToken: candidate.identity,
        step: candidate.step,
        prefix,
        trace: {
          ...emptyTrace,
          outcome: `SELECTED ${entryKey(candidateEntry(candidate))}`,
        },
      };
    }

    // ---- NON_GCD: it fires, it executes, and a new scan begins at the root ----
    const outcome = input.transitionFor({ actionToken: candidate.identity, step: candidate.step }, state);

    if (outcome.kind === "UNSUPPORTED") {
      return {
        kind: "UNKNOWN",
        blocker: "TRANSITION_UNSUPPORTED",
        scanBlocker: null,
        blockedAt: candidate.step,
        detail: outcome.detail,
        trace: { ...emptyTrace, outcome: "UNKNOWN TRANSITION_UNSUPPORTED" },
      };
    }
    if (outcome.kind === "UNKNOWN") {
      return {
        kind: "UNKNOWN",
        blocker: "TRANSITION_UNKNOWN",
        scanBlocker: null,
        blockedAt: candidate.step,
        detail: outcome.detail,
        trace: { ...emptyTrace, outcome: "UNKNOWN TRANSITION_UNKNOWN" },
      };
    }
    if (outcome.timeAdvanceMs !== 0) {
      // Refused, not ignored. A non-zero advance would move every cooldown,
      // resource and aura the caller's state models, and this engine has no way
      // to make that happen or to check that the caller did.
      return {
        kind: "UNKNOWN",
        blocker: "UNSUPPORTED_TIME_ADVANCE",
        scanBlocker: null,
        blockedAt: candidate.step,
        detail:
          "a transition reports that simulated time advances, which this engine does not model. Only a " +
          "zero-millisecond advance is supported.",
        trace: { ...emptyTrace, outcome: "UNKNOWN UNSUPPORTED_TIME_ADVANCE" },
      };
    }

    // PROGRESS IS STATE CHANGE, NOT A COUNTER. With Δt = 0 the only thing that
    // can differ on the next scan is the abstract state, so a transition that
    // returns an equivalent state is caught by the cycle guard rather than by a
    // depth limit.
    return explore(outcome.nextState, withAction(prefix, candidateEntry(candidate)), onPath);
  }

  /** Replaces a branch's trace without touching its verdict. */
  function retrace(result: BranchResult, trace: RotationalTraceNode): BranchResult {
    return { ...result, trace };
  }

  /** A memo entry holds the verdict; the prefix belongs to the path that asked. */
  function stripPrefix(result: BranchResult): BranchResult {
    return result.kind === "SELECTED" ? { ...result, prefix: EMPTY_PREFIX } : result;
  }

  function rebase(result: BranchResult, prefix: PrefixFacts): BranchResult {
    if (result.kind !== "SELECTED") return result;
    return { ...result, prefix: mergePrefixes(prefix, result.prefix) };
  }

  const explored = explore(input.initialState, EMPTY_PREFIX, []);

  switch (explored.kind) {
    case "SELECTED":
      return {
        kind: "ROTATIONAL_GCD_SELECTED",
        actionToken: explored.actionToken,
        selectingEntry: explored.step.path,
        selectingStep: explored.step,
        nonGcdPrefix: {
          possibleActions: explored.prefix.actions,
          exactSequenceKnown: explored.prefix.uniqueSequence !== null,
          sequence: explored.prefix.uniqueSequence,
        },
        trace: explored.trace,
      };
    case "NO_ACTION":
      return { kind: "NO_ROTATIONAL_GCD_SELECTED", trace: explored.trace };
    case "UNKNOWN":
      return {
        kind: "ROTATIONAL_GCD_UNKNOWN",
        blocker: explored.blocker,
        scanBlocker: explored.scanBlocker,
        blockedAt: explored.blockedAt,
        detail: explored.detail,
        trace: explored.trace,
      };
  }
}
