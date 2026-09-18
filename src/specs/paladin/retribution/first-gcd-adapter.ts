/**
 * The Retribution Paladin adapter for the shared first-GCD query (M11-A4).
 *
 * WHAT THIS ANSWERS
 *
 *     Starting at the real decision point, and allowing zero or more NON_GCD
 *     foreground actions to fire and be followed by a fresh scan from the ROOT,
 *     which GCD-consuming action does the pinned Retribution authority select
 *     first?
 *
 * THE SAME THREE THINGS THE PROTECTION ADAPTER SUPPLIES, and nothing more:
 *
 *     scanFor        one foreground scan under a hypothetical prefix, with the
 *                    Retribution vocabulary and the caller's bindings, the
 *                    Retribution applicability rules (domain boundary first)
 *                    and the usability proofs
 *     laneFor        the pinned Retribution lane data, per token
 *     transitionFor  the two reviewed NON_GCD contracts (`auto_attack`,
 *                    `rebuke`); every other NON_GCD entry refuses its branch
 *
 * The generic engine owns everything else and learns none of this.
 *
 * ONE WORLD. There is no race hypothesis (the racial entries are non-domain)
 * and no overlay: neither reviewed contract writes an atom the pinned list
 * reads, so every scan in every branch runs against the caller's bindings
 * untouched. The observed cast is never an oracle for an earlier entry.
 *
 * THE ROOT SCAN'S OWN STOPPING POINT IS KEPT. The shared engine reports a
 * blocked root scan at its EARLIEST unresolved candidate — here always
 * `default[0] auto_attack`, a NON_GCD entry the engine would have stepped
 * through had the scan not aborted later — which is correct for the
 * engine's purpose and useless for a reader asking WHICH authority entry the
 * evidence could not decide. So the adapter also records the root scan's
 * innermost BLOCKED step and its blocker, verbatim from the same scan. A
 * diagnostic, never a verdict: nothing downstream reads it as a selection.
 *
 * NO GATE IRRELEVANCE. No Retribution entry's unreadable condition may be
 * stepped past. The in-domain lines carrying `raid_event.*`, `fight_remains`
 * or `trinket.*` (Wake of Ashes, Divine Toll, Execution Sentence, Avenging
 * Wrath) are eliminated by a proven cooldown or they BLOCK the scan; that is
 * the honest outcome, and the residual population is reported as UNKNOWN.
 */

import type { AplAction, AplAuthority } from "../../../simc/apl-authority.js";
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
import { retributionExecutionLaneForToken } from "../../../data/game/paladin-retribution-gcd-semantics.js";
import {
  retributionTransitionContractFor,
  type RetributionNonGcdTransitionContract,
} from "../../../data/game/paladin-retribution-transition-authority.js";
import {
  NO_AURA_GATE_FACTS,
  NO_READINESS_FACTS,
  resolveRetributionApplicability,
  resolveRetributionUsability,
  type RetributionAuraGateFact,
  type RetributionBuildFacts,
  type RetributionReadinessFact,
} from "./action-profile.js";
import { UNKNOWN_SPENDER_FACTS, type RetributionSpenderFacts } from "./holy-power.js";
import {
  initialRetributionState,
  retributionStateKey,
  withExecution,
  type ExecutedEntry,
  type RetributionFirstGcdState,
} from "./first-gcd-state.js";

/** The list this query begins in. The ROOT, with nothing skipped. */
export const RETRIBUTION_FIRST_GCD_ROOT_LIST = "default";

export interface RetributionFirstGcdQueryInput {
  readonly authority: AplAuthority;
  /** The bindings the real decision evaluates against, built by the caller. */
  readonly bindings: AtomBindings;
  readonly buildFacts: RetributionBuildFacts;
  /** The spell id observed cast here. Positive usability evidence only. */
  readonly observedAbilityGameId: number;
  /** What is known about Holy Power spending at this decision. Defaults to nothing. */
  readonly spender?: RetributionSpenderFacts;
  /** What is known about cooldown readiness at this decision. Defaults to nothing. */
  readonly readiness?: readonly RetributionReadinessFact[];
  /** Actions whose required aura is PROVEN inactive at this decision. Defaults to nothing. */
  readonly auraGates?: readonly RetributionAuraGateFact[];
}

/** Where the ROOT scan (no hypothetical prefix) stopped, when it did. */
export interface RetributionRootScanDiagnostics {
  /** The one-scan resolution kind, or `BLOCKED`. */
  readonly kind: string;
  /** The innermost step the root scan recorded as BLOCKED, as `list[ordinal] token`, or null. */
  readonly blockedStep: string | null;
  readonly blocker: string | null;
}

export interface RetributionFirstGcdQueryOutcome {
  readonly result: RotationalGcdResult;
  readonly rootScan: RetributionRootScanDiagnostics;
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
export function retributionContractForSelected(
  action: SelectedNonGcdAction,
): { readonly contract: RetributionNonGcdTransitionContract } | { readonly refusal: string } {
  const contract = retributionTransitionContractFor(action.actionToken);
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
export function retributionFirstGcdSelectionAt(
  input: RetributionFirstGcdQueryInput,
): RetributionFirstGcdQueryOutcome {
  const applicabilityFor = (action: AplAction): ActionApplicability =>
    resolveRetributionApplicability(input.buildFacts, action);

  const usabilityFor = (state: RetributionFirstGcdState, action: AplAction): ActionUsabilityVerdict =>
    resolveRetributionUsability(
      state,
      action,
      input.observedAbilityGameId,
      input.spender ?? UNKNOWN_SPENDER_FACTS,
      input.readiness ?? NO_READINESS_FACTS,
      input.auraGates ?? NO_AURA_GATE_FACTS,
    );

  const scanFor = (state: RetributionFirstGcdState): OneForegroundScanResult =>
    resolveOneForegroundScan({
      authority: input.authority,
      entryListName: RETRIBUTION_FIRST_GCD_ROOT_LIST,
      bindings: input.bindings,
      usabilityFor: (action) => usabilityFor(state, action),
      applicabilityFor,
    });

  const laneFor = (step: TraversalStep): ExecutionLane => retributionExecutionLaneForToken(step.actionToken);

  /** What a supported NON_GCD execution does. FAILS CLOSED without a reviewed contract. */
  const transitionFor = (
    action: SelectedNonGcdAction,
    state: RetributionFirstGcdState,
  ): NonGcdTransitionOutcome<RetributionFirstGcdState> => {
    const resolved = retributionContractForSelected(action);
    if ("refusal" in resolved) return { kind: "UNSUPPORTED", detail: resolved.refusal };
    const { contract } = resolved;
    const nextState = withExecution(state, entryOf(action.step));
    return {
      kind: "APPLIED",
      nextState,
      timeAdvanceMs: contract.timeAdvanceMs,
      evidence: {
        kind: `HYPOTHETICAL_PREFIX_EXECUTION:${contract.simcToken}`,
        provenance: "src/data/game/paladin-retribution-transition-authority.ts",
        stateKeyBefore: retributionStateKey(state),
        stateKeyAfter: retributionStateKey(nextState),
      },
    };
  };

  const result = firstGcdSelectionAcrossRescans<RetributionFirstGcdState>({
    rootListName: RETRIBUTION_FIRST_GCD_ROOT_LIST,
    initialState: initialRetributionState(),
    stateKey: retributionStateKey,
    scanFor,
    laneFor,
    transitionFor,
  });
  return { result, rootScan: rootScanDiagnosticsOf(scanFor(initialRetributionState())) };
}

function rootScanDiagnosticsOf(scan: OneForegroundScanResult): RetributionRootScanDiagnostics {
  // The INNERMOST blocked step: a `call_action_list` whose callee blocked is
  // itself recorded BLOCKED ahead of the callee's steps, so the last BLOCKED
  // step in visit order is the entry the scan actually stopped at.
  const blocked = [...scan.steps].reverse().find((step) => step.outcome === "BLOCKED");
  const blockedStep =
    blocked === undefined
      ? null
      : `${blocked.listName}[${String(blocked.priorityOrdinal)}] ${blocked.actionToken}`;
  if (scan.kind === "BLOCKED") return { kind: "BLOCKED", blockedStep, blocker: scan.blocker };
  return { kind: scan.resolution.kind, blockedStep, blocker: null };
}
