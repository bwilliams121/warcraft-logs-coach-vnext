/**
 * The Demonology Warlock adapter for the shared first-GCD query (ONB-X4).
 *
 * WHAT THIS ANSWERS
 *
 *     Starting at the real decision point, and allowing zero or more NON_GCD foreground
 *     actions to fire and be followed by a fresh scan from the ROOT, which GCD-consuming
 *     action does the pinned Demonology Warlock authority select first?
 *
 * THE SAME THREE THINGS EVERY OTHER ADAPTER SUPPLIES, and nothing more:
 *
 *     scanFor        one foreground scan under a hypothetical prefix
 *     laneFor        the pinned lane data, per token
 *     transitionFor  the reviewed NON_GCD contracts; anything else refuses
 *
 * THE ROOT SCAN'S OWN STOPPING POINT IS KEPT, AND SO ARE ITS DISPATCHES: diagnostics, never
 * verdicts. Nothing downstream reads them as a selection.
 *
 * NO GATE IRRELEVANCE. No entry's unreadable condition may be stepped past.
 */

import { deriveCallsListName, type AplAction, type AplAuthority } from "../../../simc/apl-authority.js";
import {
  firstGcdSelectionAcrossRescans,
  type NonGcdTransitionOutcome,
  type RotationalGcdResult,
  type SelectedNonGcdAction,
} from "../../../simc/first-gcd-selection.js";
import {
  resolveOneForegroundScan,
  type OneForegroundScanResult,
  type TraversalStep,
} from "../../../simc/nested-selection.js";
import type { ActionApplicability, ActionUsabilityVerdict } from "../../../simc/action-applicability.js";
import type { AtomBindings } from "../../../simc/expression/evaluate.js";
import type { ExecutionLane } from "../../../data/game/gcd-semantics-index.js";
import { demonologyExecutionLaneForToken } from "../../../data/game/warlock-demonology-gcd-semantics.js";
import { demonologyTransitionContractFor } from "../../../data/game/warlock-demonology-transition-authority.js";
import {
  resolveDemonologyApplicability,
  resolveDemonologyUsability,
  type DemonologyBuildFacts,
} from "./action-profile.js";
import {
  demonologyStateKey,
  initialDemonologyState,
  withExecution,
  type DemonologyFirstGcdState,
  type ExecutedEntry,
} from "./first-gcd-state.js";

/** The list this query begins in. The ROOT, with nothing skipped. */
export const DEMONOLOGY_FIRST_GCD_ROOT_LIST = "default";

export interface DemonologyFirstGcdQueryInput {
  readonly authority: AplAuthority;
  /** The bindings the real decision evaluates against, built by the caller. */
  readonly bindings: AtomBindings;
  readonly buildFacts: DemonologyBuildFacts;
  /** The spell id observed cast here. Positive usability evidence only. */
  readonly observedAbilityGameId: number;
}

/** One dispatch entry the ROOT scan visited, with the outcome the engine recorded. */
export interface DemonologyDispatchStep {
  /** `list[ordinal]` of the dispatch entry. */
  readonly at: string;
  readonly actionToken: string;
  readonly calleeListName: string | null;
  readonly outcome: TraversalStep["outcome"];
  /** The gate's evaluated truth, `UNCONDITIONAL`, or the refusal, as the step recorded it. */
  readonly gate: string;
}

/**
 * Where one decision's ROOT scan stopped, and on what: the innermost BLOCKED step (or the
 * engine's `blockedAt` when the scan produced none), as `list[ordinal] token`, and what made
 * that entry undecidable.
 */
export interface DemonologyStoppingPoint {
  readonly at: string;
  readonly blocker: string;
  readonly atoms: readonly string[];
}

/** One entry the ROOT scan recorded MAY_SELECT: it might fire, and the evidence could not say. */
export interface DemonologyUndecidedCandidate {
  readonly at: string;
  readonly actionToken: string;
  readonly lane: ExecutionLane;
  readonly atoms: readonly string[];
}

/** Where the ROOT scan (no hypothetical prefix) stopped, when it did, and how it dispatched. */
export interface DemonologyRootScanDiagnostics {
  /** The one-scan resolution kind, or `BLOCKED`. */
  readonly kind: string;
  readonly dispatches: readonly DemonologyDispatchStep[];
  /** The stopping point with its atoms, or null when the root scan resolved. */
  readonly stoppingPoint: DemonologyStoppingPoint | null;
  /** Every MAY_SELECT step of the root scan, in visit order. */
  readonly undecidedCandidates: readonly DemonologyUndecidedCandidate[];
}

export interface DemonologyFirstGcdQueryOutcome {
  readonly result: RotationalGcdResult;
  readonly rootScan: DemonologyRootScanDiagnostics;
}

function entryOf(step: TraversalStep): ExecutedEntry {
  return {
    listName: step.listName,
    priorityOrdinal: step.priorityOrdinal,
    actionToken: step.actionToken,
    sourceLine: step.sourceLine,
  };
}

/** Runs the first-GCD query in the one world the boundary leaves, and keeps the root scan's stopping point. */
export function demonologyFirstGcdSelectionAt(
  input: DemonologyFirstGcdQueryInput,
): DemonologyFirstGcdQueryOutcome {
  const applicabilityFor = (action: AplAction): ActionApplicability =>
    resolveDemonologyApplicability(input.buildFacts, action);

  const usabilityFor = (state: DemonologyFirstGcdState, action: AplAction): ActionUsabilityVerdict =>
    resolveDemonologyUsability({
      state,
      action,
      observedAbilityGameId: input.observedAbilityGameId,
    });

  const scanFor = (state: DemonologyFirstGcdState): OneForegroundScanResult =>
    resolveOneForegroundScan({
      authority: input.authority,
      entryListName: DEMONOLOGY_FIRST_GCD_ROOT_LIST,
      bindings: input.bindings,
      usabilityFor: (action) => usabilityFor(state, action),
      applicabilityFor,
    });

  const laneFor = (step: TraversalStep): ExecutionLane => demonologyExecutionLaneForToken(step.actionToken);

  /** What a supported NON_GCD execution does. FAILS CLOSED without a reviewed contract. */
  const transitionFor = (
    action: SelectedNonGcdAction,
    state: DemonologyFirstGcdState,
  ): NonGcdTransitionOutcome<DemonologyFirstGcdState> => {
    const contract = demonologyTransitionContractFor(action.actionToken);
    if (contract === null) {
      return {
        kind: "UNSUPPORTED",
        detail:
          `no reviewed transition contract exists for '${action.actionToken}', so what executing it ` +
          "would change is not established and the branch cannot continue",
      };
    }
    const nextState = withExecution(state, entryOf(action.step));
    return {
      kind: "APPLIED",
      nextState,
      timeAdvanceMs: contract.timeAdvanceMs,
      evidence: {
        kind: `HYPOTHETICAL_PREFIX_EXECUTION:${contract.simcToken}`,
        provenance: "src/data/game/warlock-demonology-transition-authority.ts",
        stateKeyBefore: demonologyStateKey(state),
        stateKeyAfter: demonologyStateKey(nextState),
      },
    };
  };

  const result = firstGcdSelectionAcrossRescans<DemonologyFirstGcdState>({
    rootListName: DEMONOLOGY_FIRST_GCD_ROOT_LIST,
    initialState: initialDemonologyState(),
    stateKey: demonologyStateKey,
    scanFor,
    laneFor,
    transitionFor,
  });
  return { result, rootScan: rootScanDiagnosticsOf(scanFor(initialDemonologyState())) };
}

function gateSummary(step: TraversalStep): string {
  const { gate } = step;
  if (gate.kind === "UNCONDITIONAL") return "UNCONDITIONAL";
  if (gate.kind === "EVALUATED") return gate.truth;
  if (gate.kind === "UNSUPPORTED") return `UNSUPPORTED:${gate.reason}`;
  return gate.kind;
}

function stepLabel(step: TraversalStep): string {
  return `${step.listName}[${String(step.priorityOrdinal)}] ${step.actionToken}`;
}

/** What made one step undecidable, from the step's own record. Tagged so a reader knows which layer to look at. */
export function stoppingAtomsOf(step: TraversalStep, blocker: string): readonly string[] {
  if (blocker === "APPLICABILITY_NOT_ESTABLISHED" || step.applicability.kind === "UNKNOWN") {
    return [`APPLICABILITY:${step.actionToken}`];
  }
  if (blocker === "UNSUPPORTED_ACTION_OPTION") {
    const keys = step.targetingRefusal === null ? "?" : step.targetingRefusal.optionKeys.join(",");
    return [`ACTION_OPTION:${keys}`];
  }
  const { gate } = step;
  if (gate.kind === "UNSUPPORTED") return [`UNSUPPORTED_EXPRESSION:${gate.reason}:${gate.fragment}`];
  if (gate.kind === "EVALUATED") {
    const unresolved = gate.trace.atoms
      .filter(
        (atom) =>
          atom.binding === "UNRESOLVED_BOOLEAN" ||
          atom.binding === "UNKNOWN_NUMBER" ||
          ((atom.binding === "ONE_OF" || atom.binding === "BOUNDED") && gate.truth === "UNKNOWN_STATE"),
      )
      .map((atom) => atom.key);
    if (unresolved.length > 0) return unresolved;
    return [`USABILITY:${step.actionToken}`];
  }
  if (gate.kind === "NOT_EVALUATED") return [`NOT_EVALUATED:${gate.why}`];
  return [`USABILITY:${step.actionToken}`];
}

function rootScanDiagnosticsOf(scan: OneForegroundScanResult): DemonologyRootScanDiagnostics {
  // The INNERMOST blocked step: a dispatch whose callee blocked is itself recorded BLOCKED ahead
  // of the callee's steps, so the last BLOCKED step in visit order is where the scan stopped.
  const blocked = [...scan.steps].reverse().find((step) => step.outcome === "BLOCKED");
  const dispatches: DemonologyDispatchStep[] = scan.steps
    .filter((step) => step.entryKind === "LIST_DISPATCH")
    .map((step) => ({
      at: `${step.listName}[${String(step.priorityOrdinal)}]`,
      actionToken: step.actionToken,
      calleeListName: deriveCallsListName(step.actionStringVerbatim),
      outcome: step.outcome,
      gate: gateSummary(step),
    }));
  const undecidedCandidates: DemonologyUndecidedCandidate[] = scan.steps
    .filter((step) => step.outcome === "MAY_SELECT")
    .map((step) => ({
      at: stepLabel(step),
      actionToken: step.actionToken,
      lane: demonologyExecutionLaneForToken(step.actionToken),
      atoms: stoppingAtomsOf(step, "MAY_SELECT"),
    }));
  if (scan.kind === "BLOCKED") {
    const stop = blocked ?? scan.blockedAt;
    const stoppingPoint: DemonologyStoppingPoint =
      stop === null
        ? { at: "(no step)", blocker: scan.blocker, atoms: [] }
        : { at: stepLabel(stop), blocker: scan.blocker, atoms: stoppingAtomsOf(stop, scan.blocker) };
    return { kind: "BLOCKED", dispatches, stoppingPoint, undecidedCandidates };
  }
  return { kind: scan.resolution.kind, dispatches, stoppingPoint: null, undecidedCandidates };
}
