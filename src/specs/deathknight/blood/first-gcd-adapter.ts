/**
 * The Blood Death Knight adapter for the shared first-GCD query (M11-B2).
 *
 * WHAT THIS ANSWERS
 *
 *     Starting at the real decision point, and allowing zero or more NON_GCD
 *     foreground actions to fire and be followed by a fresh scan from the ROOT,
 *     which GCD-consuming action does the pinned Blood authority select first?
 *
 * THE SAME THREE THINGS THE PALADIN ADAPTERS SUPPLY, and nothing more:
 *
 *     scanFor        one foreground scan under a hypothetical prefix, with the
 *                    Blood vocabulary and the caller's bindings, the Blood
 *                    applicability rules (domain boundary first) and the
 *                    usability proofs
 *     laneFor        the pinned Blood lane data, per token
 *     transitionFor  the three reviewed NON_GCD contracts (`auto_attack`,
 *                    `vampiric_blood`, `raise_dead`); every other NON_GCD
 *                    entry refuses its branch
 *
 * The generic engine owns everything else — including, since M11-B1, the
 * `run_action_list` control flow the pinned Blood list is built on — and
 * learns none of this.
 *
 * ONE WORLD. There is no race hypothesis (the racial entries are non-domain)
 * and no overlay: no reviewed contract writes an atom a LATER pinned entry
 * reads, so every scan in every branch runs against the caller's bindings
 * untouched. The observed cast is never an oracle for an earlier entry.
 *
 * THE ROOT SCAN'S OWN STOPPING POINT IS KEPT, AND SO ARE ITS DISPATCHES.
 * The shared engine reports a blocked root scan at its EARLIEST unresolved
 * candidate — here always `default[0] auto_attack`, a NON_GCD entry the
 * engine would have stepped through — which is correct for the engine's
 * purpose and useless for a reader asking WHICH authority entry the
 * evidence could not decide. So the adapter also records the root scan's
 * innermost BLOCKED step and its blocker, and — because this milestone
 * exists to measure the B1 dispatch semantics on a real list — every
 * dispatch entry the root scan visited with the outcome it recorded
 * (`RUN_GATE_FALSE_SKIPPED`, `RUN_ENTERED_SCAN_ENDS`, `CALL_MAY_SELECT`, a
 * BLOCKED run gate, …). Diagnostics, never verdicts: nothing downstream
 * reads them as a selection.
 *
 * NO GATE IRRELEVANCE. No Blood entry's unreadable condition may be stepped
 * past. The Dancing Rune Weapon gate carrying `fight_remains` is eliminated
 * by a proven cooldown or it BLOCKS the scan; that is the honest outcome,
 * and the residual population is reported as UNKNOWN.
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
import { bloodExecutionLaneForToken } from "../../../data/game/deathknight-blood-gcd-semantics.js";
import {
  bloodTransitionContractFor,
  type BloodNonGcdTransitionContract,
} from "../../../data/game/deathknight-blood-transition-authority.js";
import {
  NO_READINESS_FACTS,
  resolveBloodApplicability,
  resolveBloodUsability,
  type BloodBuildFacts,
  type BloodReadinessFact,
} from "./action-profile.js";
import {
  bloodStateKey,
  initialBloodState,
  withExecution,
  type BloodFirstGcdState,
  type ExecutedEntry,
} from "./first-gcd-state.js";
import { NO_RUNE_AFFORDABILITY, type BloodRuneAffordability } from "./rune-affordability.js";

/** The list this query begins in. The ROOT, with nothing skipped. */
export const BLOOD_FIRST_GCD_ROOT_LIST = "default";

export interface BloodFirstGcdQueryInput {
  readonly authority: AplAuthority;
  /** The bindings the real decision evaluates against, built by the caller. */
  readonly bindings: AtomBindings;
  readonly buildFacts: BloodBuildFacts;
  /** The spell id observed cast here. Positive usability evidence only. */
  readonly observedAbilityGameId: number;
  /** What is known about cooldown readiness at this decision. Defaults to nothing. */
  readonly readiness?: readonly BloodReadinessFact[];
  /**
   * Marrowrend's Rune affordability at this decision, from the decision
   * cast's own PRE_COST Rune entry and the pinned authority (M11-B7).
   * Defaults to no fact, which proves nothing.
   */
  readonly runeAffordability?: BloodRuneAffordability;
}

/** One dispatch entry the ROOT scan visited, with the outcome the engine recorded. */
export interface BloodDispatchStep {
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
 * unproven usability). This is the measurement M11-B2 exists to take.
 */
export interface BloodStoppingPoint {
  readonly at: string;
  readonly blocker: string;
  readonly atoms: readonly string[];
}

/**
 * One entry the ROOT scan recorded MAY_SELECT: it might fire, and the
 * evidence could not say. A NON_GCD one with a reviewed contract is
 * branched over by the engine; a GCD_CONSUMING one is a competing
 * candidate that alone keeps the answer UNKNOWN even when everything after
 * it resolves — the Dancing Rune Weapon gate at a decision where its
 * cooldown is not proven is the case this exists to name.
 */
export interface BloodUndecidedCandidate {
  readonly at: string;
  readonly actionToken: string;
  readonly lane: ExecutionLane;
  readonly atoms: readonly string[];
}

/** Where the ROOT scan (no hypothetical prefix) stopped, when it did, and how it dispatched. */
export interface BloodRootScanDiagnostics {
  /** The one-scan resolution kind, or `BLOCKED`. */
  readonly kind: string;
  /** The innermost step the root scan recorded as BLOCKED, as `list[ordinal] token`, or null. */
  readonly blockedStep: string | null;
  readonly blocker: string | null;
  /** Every dispatch entry visited, in visit order. */
  readonly dispatches: readonly BloodDispatchStep[];
  /** The stopping point with its atoms, or null when the root scan resolved. */
  readonly stoppingPoint: BloodStoppingPoint | null;
  /** Every MAY_SELECT step of the root scan, in visit order. */
  readonly undecidedCandidates: readonly BloodUndecidedCandidate[];
}

export interface BloodFirstGcdQueryOutcome {
  readonly result: RotationalGcdResult;
  readonly rootScan: BloodRootScanDiagnostics;
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
export function bloodContractForSelected(
  action: SelectedNonGcdAction,
): { readonly contract: BloodNonGcdTransitionContract } | { readonly refusal: string } {
  const contract = bloodTransitionContractFor(action.actionToken);
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
export function bloodFirstGcdSelectionAt(input: BloodFirstGcdQueryInput): BloodFirstGcdQueryOutcome {
  const applicabilityFor = (action: AplAction): ActionApplicability =>
    resolveBloodApplicability(input.buildFacts, action);

  const usabilityFor = (state: BloodFirstGcdState, action: AplAction): ActionUsabilityVerdict =>
    resolveBloodUsability(
      state,
      action,
      input.observedAbilityGameId,
      input.readiness ?? NO_READINESS_FACTS,
      input.runeAffordability ?? NO_RUNE_AFFORDABILITY,
    );

  const scanFor = (state: BloodFirstGcdState): OneForegroundScanResult =>
    resolveOneForegroundScan({
      authority: input.authority,
      entryListName: BLOOD_FIRST_GCD_ROOT_LIST,
      bindings: input.bindings,
      usabilityFor: (action) => usabilityFor(state, action),
      applicabilityFor,
    });

  const laneFor = (step: TraversalStep): ExecutionLane => bloodExecutionLaneForToken(step.actionToken);

  /** What a supported NON_GCD execution does. FAILS CLOSED without a reviewed contract. */
  const transitionFor = (
    action: SelectedNonGcdAction,
    state: BloodFirstGcdState,
  ): NonGcdTransitionOutcome<BloodFirstGcdState> => {
    const resolved = bloodContractForSelected(action);
    if ("refusal" in resolved) return { kind: "UNSUPPORTED", detail: resolved.refusal };
    const { contract } = resolved;
    const nextState = withExecution(state, entryOf(action.step));
    return {
      kind: "APPLIED",
      nextState,
      timeAdvanceMs: contract.timeAdvanceMs,
      evidence: {
        kind: `HYPOTHETICAL_PREFIX_EXECUTION:${contract.simcToken}`,
        provenance: "src/data/game/deathknight-blood-transition-authority.ts",
        stateKeyBefore: bloodStateKey(state),
        stateKeyAfter: bloodStateKey(nextState),
      },
    };
  };

  const result = firstGcdSelectionAcrossRescans<BloodFirstGcdState>({
    rootListName: BLOOD_FIRST_GCD_ROOT_LIST,
    initialState: initialBloodState(),
    stateKey: bloodStateKey,
    scanFor,
    laneFor,
    transitionFor,
  });
  return { result, rootScan: rootScanDiagnosticsOf(scanFor(initialBloodState())) };
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
  // An entry whose applicability could not be established is tagged by that
  // fact whatever the SCAN's blocker says: when earlier candidates exist the
  // engine reports NO_DEFINITE_WINNER for the scan, and the engine records the
  // step's own gate as NOT_EVALUATED — which names the consequence, not the
  // cause. (M11-B3 diagnostic labelling; the measurement is unchanged.)
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
      .filter((atom) => atom.binding === "UNRESOLVED_BOOLEAN" || atom.binding === "UNKNOWN_NUMBER")
      .map((atom) => atom.key);
    if (unresolved.length > 0) return unresolved;
    return [`USABILITY:${step.actionToken}`];
  }
  if (gate.kind === "NOT_EVALUATED") return [`NOT_EVALUATED:${gate.why}`];
  return [`USABILITY:${step.actionToken}`];
}

function rootScanDiagnosticsOf(scan: OneForegroundScanResult): BloodRootScanDiagnostics {
  // The INNERMOST blocked step: a dispatch whose callee blocked is itself
  // recorded BLOCKED ahead of the callee's steps, so the last BLOCKED step in
  // visit order is the entry the scan actually stopped at.
  const blocked = [...scan.steps].reverse().find((step) => step.outcome === "BLOCKED");
  const blockedStep =
    blocked === undefined
      ? null
      : `${blocked.listName}[${String(blocked.priorityOrdinal)}] ${blocked.actionToken}`;
  const dispatches: BloodDispatchStep[] = scan.steps
    .filter((step) => step.entryKind === "LIST_DISPATCH")
    .map((step) => ({
      at: `${step.listName}[${String(step.priorityOrdinal)}]`,
      actionToken: step.actionToken,
      calleeListName: calleeOf(step),
      outcome: step.outcome,
      gate: gateSummary(step),
    }));
  const undecidedCandidates: BloodUndecidedCandidate[] = scan.steps
    .filter((step) => step.outcome === "MAY_SELECT")
    .map((step) => ({
      at: stepLabel(step),
      actionToken: step.actionToken,
      lane: bloodExecutionLaneForToken(step.actionToken),
      atoms: stoppingAtomsOf(step, "MAY_SELECT"),
    }));
  if (scan.kind === "BLOCKED") {
    const stop = blocked ?? scan.blockedAt;
    const stoppingPoint: BloodStoppingPoint | null =
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

/** The `name=` target of a dispatch entry, by the loader's own derivation. */
function calleeOf(step: TraversalStep): string | null {
  return deriveCallsListName(step.actionStringVerbatim);
}
