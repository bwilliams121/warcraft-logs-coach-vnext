/**
 * The Havoc Demon Hunter adapter for the shared first-GCD query (ONB-A1).
 *
 * WHAT THIS ANSWERS
 *
 *     Starting at the real decision point, and allowing zero or more NON_GCD
 *     foreground actions to fire and be followed by a fresh scan from the ROOT,
 *     which GCD-consuming action does the pinned Havoc authority select first?
 *
 * THE SAME THREE THINGS EVERY OTHER ADAPTER SUPPLIES, and nothing more:
 *
 *     scanFor        one foreground scan under a hypothetical prefix, with the Havoc
 *                    vocabulary and the caller's bindings, the Havoc applicability
 *                    rules (domain boundary first) and the usability proofs
 *     laneFor        the pinned Havoc lane data, per token
 *     transitionFor  the reviewed NON_GCD contracts (`auto_attack`,
 *                    `vengeful_retreat`, `pick_up_fragment`); anything else refuses
 *
 * ONE WORLD, TWO OVERLAYS. A branch's bindings are the caller's, with what a contract
 * forgot dropped: a FORGOTTEN buff's binding unless the caller bound it UP, and `fury`
 * replaced by an unknown. Nothing is ever bound UP by a branch, and the observed cast
 * is never an oracle for an earlier entry.
 *
 * THE ROOT SCAN'S OWN STOPPING POINT IS KEPT, AND SO ARE ITS DISPATCHES: diagnostics,
 * never verdicts. Nothing downstream reads them as a selection.
 *
 * NO GATE IRRELEVANCE. No Havoc entry's unreadable condition may be stepped past.
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
import { unknownNumber, type AtomBindings } from "../../../simc/expression/evaluate.js";
import type { ExecutionLane } from "../../../data/game/gcd-semantics-index.js";
import { havocExecutionLaneForToken } from "../../../data/game/demonhunter-havoc-gcd-semantics.js";
import {
  havocTransitionContractFor,
  type HavocNonGcdTransitionContract,
} from "../../../data/game/demonhunter-havoc-transition-authority.js";
import {
  NO_READINESS_FACTS,
  resolveHavocApplicability,
  resolveHavocUsability,
  type HavocBuildFacts,
  type HavocReadinessFact,
} from "./action-profile.js";
import type { ReaversGlaiveReadinessFact } from "./aura-bindings.js";
import { FURY } from "./vocabulary.js";
import {
  havocStateKey,
  initialHavocState,
  withExecution,
  withForgottenBuffs,
  withFuryForgotten,
  withSharedCooldown,
  type HavocFirstGcdState,
  type ExecutedEntry,
} from "./first-gcd-state.js";
import type { PositiveUsability } from "../../../findings/usability/usability-completeness.js";

const NO_POSITIVE_USABILITY: ReadonlyMap<string, PositiveUsability> = new Map();

/** The list this query begins in. The ROOT, with nothing skipped. */
export const HAVOC_FIRST_GCD_ROOT_LIST = "default";

export interface HavocFirstGcdQueryInput {
  readonly authority: AplAuthority;
  /** The bindings the real decision evaluates against, built by the caller. */
  readonly bindings: AtomBindings;
  readonly buildFacts: HavocBuildFacts;
  /** The spell id observed cast here. Positive usability evidence only. */
  readonly observedAbilityGameId: number;
  /** What is known about cooldown readiness at this decision. Defaults to nothing. */
  readonly readiness?: readonly HavocReadinessFact[];
  /** Reaver's Glaive's `ready()` buff at this decision. */
  readonly reaversGlaive: ReaversGlaiveReadinessFact;
  /** Per-token positive usability conclusions for this decision. Defaults to none. */
  readonly positiveUsability?: ReadonlyMap<string, PositiveUsability>;
}

/** The caller's bindings with what the branch forgot dropped: never bound UP by a branch. */
export function havocBranchBindings(bindings: AtomBindings, state: HavocFirstGcdState): AtomBindings {
  if (state.forgottenBuffs.length === 0 && !state.furyForgotten) return bindings;
  const { specAtoms } = bindings;
  return {
    ...bindings,
    knownBuffs: bindings.knownBuffs.filter((buff) => buff.up || !state.forgottenBuffs.includes(buff.name)),
    ...(state.furyForgotten && specAtoms !== undefined
      ? {
          specAtoms: {
            vocabulary: specAtoms.vocabulary,
            bound: specAtoms.bound.map((entry) =>
              entry.key === FURY
                ? {
                    ...entry,
                    value: { kind: "MAGNITUDE" as const, binding: unknownNumber("STATE_NOT_ESTABLISHED") },
                  }
                : entry,
            ),
          },
        }
      : {}),
  };
}

/** One dispatch entry the ROOT scan visited, with the outcome the engine recorded. */
export interface HavocDispatchStep {
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
export interface HavocStoppingPoint {
  readonly at: string;
  readonly blocker: string;
  readonly atoms: readonly string[];
}

/** One entry the ROOT scan recorded MAY_SELECT: it might fire, and the evidence could not say. */
export interface HavocUndecidedCandidate {
  readonly at: string;
  readonly actionToken: string;
  readonly lane: ExecutionLane;
  readonly atoms: readonly string[];
}

/** Where the ROOT scan (no hypothetical prefix) stopped, when it did, and how it dispatched. */
export interface HavocRootScanDiagnostics {
  /** The one-scan resolution kind, or `BLOCKED`. */
  readonly kind: string;
  /** The innermost step the root scan recorded as BLOCKED, as `list[ordinal] token`, or null. */
  readonly blockedStep: string | null;
  readonly blocker: string | null;
  /** Every dispatch entry visited, in visit order. */
  readonly dispatches: readonly HavocDispatchStep[];
  /** The stopping point with its atoms, or null when the root scan resolved. */
  readonly stoppingPoint: HavocStoppingPoint | null;
  /** Every MAY_SELECT step of the root scan, in visit order. */
  readonly undecidedCandidates: readonly HavocUndecidedCandidate[];
}

export interface HavocFirstGcdQueryOutcome {
  readonly result: RotationalGcdResult;
  readonly rootScan: HavocRootScanDiagnostics;
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
export function havocContractForSelected(
  action: SelectedNonGcdAction,
): { readonly contract: HavocNonGcdTransitionContract } | { readonly refusal: string } {
  const contract = havocTransitionContractFor(action.actionToken);
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
export function havocFirstGcdSelectionAt(input: HavocFirstGcdQueryInput): HavocFirstGcdQueryOutcome {
  const applicabilityFor = (action: AplAction): ActionApplicability =>
    resolveHavocApplicability(input.buildFacts, action);

  const usabilityFor = (state: HavocFirstGcdState, action: AplAction): ActionUsabilityVerdict =>
    resolveHavocUsability({
      state,
      action,
      observedAbilityGameId: input.observedAbilityGameId,
      readiness: input.readiness ?? NO_READINESS_FACTS,
      reaversGlaive: input.reaversGlaive,
      positiveUsability: input.positiveUsability ?? NO_POSITIVE_USABILITY,
    });

  const scanFor = (state: HavocFirstGcdState): OneForegroundScanResult =>
    resolveOneForegroundScan({
      authority: input.authority,
      entryListName: HAVOC_FIRST_GCD_ROOT_LIST,
      bindings: havocBranchBindings(input.bindings, state),
      usabilityFor: (action) => usabilityFor(state, action),
      applicabilityFor,
    });

  const laneFor = (step: TraversalStep): ExecutionLane => havocExecutionLaneForToken(step.actionToken);

  /** What a supported NON_GCD execution does. FAILS CLOSED without a reviewed contract. */
  const transitionFor = (
    action: SelectedNonGcdAction,
    state: HavocFirstGcdState,
  ): NonGcdTransitionOutcome<HavocFirstGcdState> => {
    const resolved = havocContractForSelected(action);
    if ("refusal" in resolved) return { kind: "UNSUPPORTED", detail: resolved.refusal };
    const { contract } = resolved;
    let nextState = withExecution(state, entryOf(action.step));
    if (contract.writes.includes("SHARED_INTERNAL_COOLDOWN")) {
      nextState = withSharedCooldown(nextState, contract.simcToken);
    }
    if (contract.writes.includes("FORGETS_UNOBSERVED_BUFFS")) {
      nextState = withForgottenBuffs(nextState, contract.forgetsBuffsUnlessObservedUp);
    }
    if (contract.writes.includes("FORGETS_FURY")) nextState = withFuryForgotten(nextState);
    return {
      kind: "APPLIED",
      nextState,
      timeAdvanceMs: contract.timeAdvanceMs,
      evidence: {
        kind: `HYPOTHETICAL_PREFIX_EXECUTION:${contract.simcToken}`,
        provenance: "src/data/game/demonhunter-havoc-transition-authority.ts",
        stateKeyBefore: havocStateKey(state),
        stateKeyAfter: havocStateKey(nextState),
      },
    };
  };

  const result = firstGcdSelectionAcrossRescans<HavocFirstGcdState>({
    rootListName: HAVOC_FIRST_GCD_ROOT_LIST,
    initialState: initialHavocState(),
    stateKey: havocStateKey,
    scanFor,
    laneFor,
    transitionFor,
  });
  return { result, rootScan: rootScanDiagnosticsOf(scanFor(initialHavocState())) };
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

function rootScanDiagnosticsOf(scan: OneForegroundScanResult): HavocRootScanDiagnostics {
  // The INNERMOST blocked step: a dispatch whose callee blocked is itself
  // recorded BLOCKED ahead of the callee's steps, so the last BLOCKED step in
  // visit order is the entry the scan actually stopped at.
  const blocked = [...scan.steps].reverse().find((step) => step.outcome === "BLOCKED");
  const blockedStep = blocked === undefined ? null : stepLabel(blocked);
  const dispatches: HavocDispatchStep[] = scan.steps
    .filter((step) => step.entryKind === "LIST_DISPATCH")
    .map((step) => ({
      at: `${step.listName}[${String(step.priorityOrdinal)}]`,
      actionToken: step.actionToken,
      calleeListName: deriveCallsListName(step.actionStringVerbatim),
      outcome: step.outcome,
      gate: gateSummary(step),
    }));
  const undecidedCandidates: HavocUndecidedCandidate[] = scan.steps
    .filter((step) => step.outcome === "MAY_SELECT")
    .map((step) => ({
      at: stepLabel(step),
      actionToken: step.actionToken,
      lane: havocExecutionLaneForToken(step.actionToken),
      atoms: stoppingAtomsOf(step, "MAY_SELECT"),
    }));
  if (scan.kind === "BLOCKED") {
    const stop = blocked ?? scan.blockedAt;
    const stoppingPoint: HavocStoppingPoint =
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
