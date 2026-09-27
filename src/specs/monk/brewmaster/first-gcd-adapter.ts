/**
 * The Brewmaster Monk adapter for the shared first-GCD query (M11-C2).
 *
 * WHAT THIS ANSWERS
 *
 *     Starting at the real decision point, and allowing zero or more NON_GCD
 *     foreground actions to fire and be followed by a fresh scan from the ROOT,
 *     which GCD-consuming action does the pinned Brewmaster authority select
 *     first?
 *
 * THE SAME THREE THINGS EVERY OTHER ADAPTER SUPPLIES, and nothing more:
 *
 *     scanFor        one foreground scan under a hypothetical prefix, with the
 *                    Brewmaster vocabulary and the caller's bindings, the
 *                    Brewmaster applicability rules (domain boundary first)
 *                    and the usability proofs
 *     laneFor        the pinned Brewmaster lane data, per token
 *     transitionFor  the reviewed NON_GCD contracts (`auto_attack`, and since
 *                    M11-C4i `purifying_brew`); every other NON_GCD entry —
 *                    Black Ox Brew and Fortifying Brew — refuses its branch
 *
 * The generic engine owns everything else — including the `run_action_list`
 * control flow the pinned list dispatches its hero trees through — and learns
 * none of this.
 *
 * ONE WORLD, ONE OVERLAY. There is no race hypothesis (the racial entries are
 * non-domain). A branch's bindings are the caller's, with exactly one
 * overlay a contract may write (M11-C4i): a FORGOTTEN buff's binding is
 * dropped unless the caller bound it UP, so the atom is enumerated — Empty
 * Barrel after a hypothetical Purifying Brew. Nothing is ever bound UP by a
 * branch, and the observed cast is never an oracle for an earlier entry.
 *
 * POSITIVE USABILITY (M11-C4i). The caller may supply, per token, a positive
 * usability conclusion from the completeness contract
 * (`src/findings/usability/usability-completeness.ts`). The usability rule
 * reads it only after every hypothetical, observed and negative proof.
 *
 * THE ROOT SCAN'S OWN STOPPING POINT IS KEPT, AND SO ARE ITS DISPATCHES.
 * The shared engine reports a blocked root scan at its EARLIEST unresolved
 * candidate, which is correct for the engine's purpose and useless for a
 * reader asking WHICH authority entry the evidence could not decide. So the
 * adapter also records the root scan's innermost BLOCKED step and its
 * blocker, every dispatch entry the root scan visited with the outcome it
 * recorded (`RUN_GATE_FALSE_SKIPPED`, `RUN_ENTERED_SCAN_ENDS`, a returned
 * call, a BLOCKED run gate, …), and every MAY_SELECT candidate. Diagnostics,
 * never verdicts: nothing downstream reads them as a selection.
 *
 * NO GATE IRRELEVANCE. No Brewmaster entry's unreadable condition may be
 * stepped past; an undecided brew or Energy gate BLOCKS the scan, and the
 * residual population is reported as UNKNOWN.
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
import { brewmasterExecutionLaneForToken } from "../../../data/game/monk-brewmaster-gcd-semantics.js";
import {
  brewmasterTransitionContractFor,
  type BrewmasterNonGcdTransitionContract,
} from "../../../data/game/monk-brewmaster-transition-authority.js";
import {
  NO_READINESS_FACTS,
  resolveBrewmasterApplicability,
  resolveBrewmasterUsability,
  type BrewmasterBuildFacts,
  type BrewmasterReadinessFact,
} from "./action-profile.js";
import { NO_READINESS_AURA_FACTS, type BrewmasterReadinessAuraFact } from "./aura-bindings.js";
import {
  brewmasterStateKey,
  initialBrewmasterState,
  withExecution,
  withForgottenBuffs,
  withSharedCooldown,
  type BrewmasterFirstGcdState,
  type ExecutedEntry,
} from "./first-gcd-state.js";
import type { PositiveUsability } from "../../../findings/usability/usability-completeness.js";

const NO_POSITIVE_USABILITY: ReadonlyMap<string, PositiveUsability> = new Map();

/** The list this query begins in. The ROOT, with nothing skipped. */
export const BREWMASTER_FIRST_GCD_ROOT_LIST = "default";

export interface BrewmasterFirstGcdQueryInput {
  readonly authority: AplAuthority;
  /** The bindings the real decision evaluates against, built by the caller. */
  readonly bindings: AtomBindings;
  readonly buildFacts: BrewmasterBuildFacts;
  /** The spell id observed cast here. Positive usability evidence only. */
  readonly observedAbilityGameId: number;
  /** What is known about cooldown readiness at this decision. Defaults to nothing. */
  readonly readiness?: readonly BrewmasterReadinessFact[];
  /** Every REQUIRES_AURA_ACTIVE readiness gate's state at this decision. Defaults to nothing. */
  readonly readinessAuras?: readonly BrewmasterReadinessAuraFact[];
  /** Per-token positive usability conclusions for this decision (M11-C4i). Defaults to none. */
  readonly positiveUsability?: ReadonlyMap<string, PositiveUsability>;
}

/** The caller's bindings with the branch's forgotten buffs dropped — unless the caller bound them UP. */
export function brewmasterBranchBindings(
  bindings: AtomBindings,
  state: BrewmasterFirstGcdState,
): AtomBindings {
  if (state.forgottenBuffs.length === 0) return bindings;
  return {
    ...bindings,
    knownBuffs: bindings.knownBuffs.filter((buff) => buff.up || !state.forgottenBuffs.includes(buff.name)),
  };
}

/** One dispatch entry the ROOT scan visited, with the outcome the engine recorded. */
export interface BrewmasterDispatchStep {
  /** `list[ordinal]` of the dispatch entry. */
  readonly at: string;
  readonly actionToken: string;
  readonly calleeListName: string | null;
  readonly outcome: TraversalStep["outcome"];
  /** The gate's evaluated truth, `UNCONDITIONAL`, or the refusal, as the step recorded it. */
  readonly gate: string;
}

/**
 * Where one decision's ROOT scan stopped, and on what.
 *
 * `at` is the innermost BLOCKED step (or the engine's `blockedAt` when the
 * scan produced none), as `list[ordinal] token`. `atoms` names what made
 * that entry undecidable: the unresolved atoms of its gate trace, or a
 * tagged reason when the gate was never evaluated (an unsupported
 * expression, an unrecognised action option, unresolved applicability, an
 * unproven usability).
 */
export interface BrewmasterStoppingPoint {
  readonly at: string;
  readonly blocker: string;
  readonly atoms: readonly string[];
}

/** One entry the ROOT scan recorded MAY_SELECT: it might fire, and the evidence could not say. */
export interface BrewmasterUndecidedCandidate {
  readonly at: string;
  readonly actionToken: string;
  readonly lane: ExecutionLane;
  readonly atoms: readonly string[];
}

/** Where the ROOT scan (no hypothetical prefix) stopped, when it did, and how it dispatched. */
export interface BrewmasterRootScanDiagnostics {
  /** The one-scan resolution kind, or `BLOCKED`. */
  readonly kind: string;
  /** The innermost step the root scan recorded as BLOCKED, as `list[ordinal] token`, or null. */
  readonly blockedStep: string | null;
  readonly blocker: string | null;
  /** Every dispatch entry visited, in visit order. */
  readonly dispatches: readonly BrewmasterDispatchStep[];
  /** The stopping point with its atoms, or null when the root scan resolved. */
  readonly stoppingPoint: BrewmasterStoppingPoint | null;
  /** Every MAY_SELECT step of the root scan, in visit order. */
  readonly undecidedCandidates: readonly BrewmasterUndecidedCandidate[];
}

export interface BrewmasterFirstGcdQueryOutcome {
  readonly result: RotationalGcdResult;
  readonly rootScan: BrewmasterRootScanDiagnostics;
}

function entryOf(step: TraversalStep): ExecutedEntry {
  return {
    listName: step.listName,
    priorityOrdinal: step.priorityOrdinal,
    actionToken: step.actionToken,
    sourceLine: step.sourceLine,
  };
}

/** The contract for a selected NON_GCD entry, or the reason there is none. */
export function brewmasterContractForSelected(
  action: SelectedNonGcdAction,
): { readonly contract: BrewmasterNonGcdTransitionContract } | { readonly refusal: string } {
  const contract = brewmasterTransitionContractFor(action.actionToken);
  if (contract === null) {
    return {
      refusal:
        `no reviewed transition contract exists for '${action.actionToken}', so what executing it ` +
        "would change is not established and the branch cannot continue",
    };
  }
  return { contract };
}

/** Runs the first-GCD query in the one world the boundary leaves, and keeps the root scan's stopping point. */
export function brewmasterFirstGcdSelectionAt(
  input: BrewmasterFirstGcdQueryInput,
): BrewmasterFirstGcdQueryOutcome {
  const applicabilityFor = (action: AplAction): ActionApplicability =>
    resolveBrewmasterApplicability(input.buildFacts, action);

  const usabilityFor = (state: BrewmasterFirstGcdState, action: AplAction): ActionUsabilityVerdict =>
    resolveBrewmasterUsability({
      state,
      action,
      observedAbilityGameId: input.observedAbilityGameId,
      buildFacts: input.buildFacts,
      readiness: input.readiness ?? NO_READINESS_FACTS,
      readinessAuras: input.readinessAuras ?? NO_READINESS_AURA_FACTS,
      positiveUsability: input.positiveUsability ?? NO_POSITIVE_USABILITY,
    });

  const scanFor = (state: BrewmasterFirstGcdState): OneForegroundScanResult =>
    resolveOneForegroundScan({
      authority: input.authority,
      entryListName: BREWMASTER_FIRST_GCD_ROOT_LIST,
      bindings: brewmasterBranchBindings(input.bindings, state),
      usabilityFor: (action) => usabilityFor(state, action),
      applicabilityFor,
    });

  const laneFor = (step: TraversalStep): ExecutionLane => brewmasterExecutionLaneForToken(step.actionToken);

  /** What a supported NON_GCD execution does. FAILS CLOSED without a reviewed contract. */
  const transitionFor = (
    action: SelectedNonGcdAction,
    state: BrewmasterFirstGcdState,
  ): NonGcdTransitionOutcome<BrewmasterFirstGcdState> => {
    const resolved = brewmasterContractForSelected(action);
    if ("refusal" in resolved) return { kind: "UNSUPPORTED", detail: resolved.refusal };
    const { contract } = resolved;
    let nextState = withExecution(state, entryOf(action.step));
    if (contract.writes.includes("SHARED_INTERNAL_COOLDOWN")) {
      nextState = withSharedCooldown(nextState, contract.simcToken);
    }
    if (contract.writes.includes("FORGETS_UNOBSERVED_BUFFS")) {
      nextState = withForgottenBuffs(nextState, contract.forgetsBuffsUnlessObservedUp);
    }
    return {
      kind: "APPLIED",
      nextState,
      timeAdvanceMs: contract.timeAdvanceMs,
      evidence: {
        kind: `HYPOTHETICAL_PREFIX_EXECUTION:${contract.simcToken}`,
        provenance: "src/data/game/monk-brewmaster-transition-authority.ts",
        stateKeyBefore: brewmasterStateKey(state),
        stateKeyAfter: brewmasterStateKey(nextState),
      },
    };
  };

  const result = firstGcdSelectionAcrossRescans<BrewmasterFirstGcdState>({
    rootListName: BREWMASTER_FIRST_GCD_ROOT_LIST,
    initialState: initialBrewmasterState(),
    stateKey: brewmasterStateKey,
    scanFor,
    laneFor,
    transitionFor,
  });
  return { result, rootScan: rootScanDiagnosticsOf(scanFor(initialBrewmasterState())) };
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
          (atom.binding === "ONE_OF" && gate.truth === "UNKNOWN_STATE"),
      )
      .map((atom) => atom.key);
    if (unresolved.length > 0) return unresolved;
    return [`USABILITY:${step.actionToken}`];
  }
  if (gate.kind === "NOT_EVALUATED") return [`NOT_EVALUATED:${gate.why}`];
  return [`USABILITY:${step.actionToken}`];
}

function rootScanDiagnosticsOf(scan: OneForegroundScanResult): BrewmasterRootScanDiagnostics {
  // The INNERMOST blocked step: a dispatch whose callee blocked is itself
  // recorded BLOCKED ahead of the callee's steps, so the last BLOCKED step in
  // visit order is the entry the scan actually stopped at.
  const blocked = [...scan.steps].reverse().find((step) => step.outcome === "BLOCKED");
  const blockedStep = blocked === undefined ? null : stepLabel(blocked);
  const dispatches: BrewmasterDispatchStep[] = scan.steps
    .filter((step) => step.entryKind === "LIST_DISPATCH")
    .map((step) => ({
      at: `${step.listName}[${String(step.priorityOrdinal)}]`,
      actionToken: step.actionToken,
      calleeListName: deriveCallsListName(step.actionStringVerbatim),
      outcome: step.outcome,
      gate: gateSummary(step),
    }));
  const undecidedCandidates: BrewmasterUndecidedCandidate[] = scan.steps
    .filter((step) => step.outcome === "MAY_SELECT")
    .map((step) => ({
      at: stepLabel(step),
      actionToken: step.actionToken,
      lane: brewmasterExecutionLaneForToken(step.actionToken),
      atoms: stoppingAtomsOf(step, "MAY_SELECT"),
    }));
  if (scan.kind === "BLOCKED") {
    const stop = blocked ?? scan.blockedAt;
    const stoppingPoint: BrewmasterStoppingPoint =
      stop === null
        ? { at: "(no step)", blocker: scan.blocker, atoms: [] }
        : { at: stepLabel(stop), blocker: scan.blocker, atoms: stoppingAtomsOf(stop, scan.blocker) };
    return {
      kind: "BLOCKED",
      blockedStep,
      blocker: scan.blocker,
      dispatches,
      stoppingPoint,
      undecidedCandidates,
    };
  }
  return {
    kind: scan.resolution.kind,
    blockedStep,
    blocker: null,
    dispatches,
    stoppingPoint: null,
    undecidedCandidates,
  };
}
