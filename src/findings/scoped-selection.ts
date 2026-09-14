/**
 * SCOPED action selection — the first POSITIVE conclusion this analyzer makes.
 *
 * THE QUESTION, STATED AS NARROWLY AS IT IS ANSWERED
 *
 *     within the authoritative `spend` sub-list, at this decision point, which
 *     action does the pinned SimulationCraft APL select?
 *
 * That is a different question from the one `ObservedActionJudgment` answers.
 * There the subject is an observed cast, and the answer is a verdict about it.
 * Here the subject is the AUTHORITY, and the answer is an action token. The two
 * are kept as separate types, discriminated on `kind`, because merging them
 * would make it possible to read "the authority selects Envenom here" as "the
 * player's Envenom was correct" — which does not follow and is not claimed.
 *
 * WHAT A SELECTION IS NOT
 *
 * `SELECTED_BY_AUTHORITY` scoped to `APL_SUBLIST("spend")` means the sub-list
 * selects Envenom. It does NOT mean:
 *
 *   - Envenom was the globally ideal action. Higher-priority default entries are
 *     unevaluated, and several are unevaluable — an unconditional `stealth`, an
 *     unconditional `kick`, a `variable` assignment, and an unconditional call to
 *     `core_dot` whose own conditions are entirely outside the supported subset.
 *   - any other action was unavailable
 *   - the player played correctly
 *
 * There is therefore no `CORRECT`, no `OPTIMAL`, no `IDEAL` and no `MATCH` in
 * this file, and `DecisionScope` has exactly one member so that "this is a
 * sub-list result" is an active statement rather than the absence of an
 * alternative. Global selection is a later milestone and gets its own
 * vocabulary when it can actually be supported.
 *
 * APPLICABILITY IS NOT UNCERTAINTY
 *
 * A provably FALSE entry gate is knowledge, not a gap. The sub-list was not
 * entered, so it selected nothing, and asking what it selected is a question
 * with no subject. That is `NOT_APPLICABLE` with reason `ENTRY_GATE_FALSE` — an
 * exact result. Reporting it as UNKNOWN would present a proof as a shortfall,
 * which is the same conflation `NO_AUTHORITY_AVAILABLE` and `UNKNOWN` exist to
 * prevent one level up.
 *
 * ACTIONABILITY LIVES ON THE FINDING, NOT HERE
 *
 * This result names the selected action; `Finding.actionability` carries the
 * evidence that the action was usable. Together they say exactly what was proved
 * and about which ability. Storing a second evidence-bearing copy here would
 * create two records of one fact that could drift apart, so `LineEvaluation`
 * carries only the selector's minimal `PROVEN_USABLE` / `UNKNOWN` status.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { AuthorityRef, NoAuthorityReason, ResolvedAuthority } from "./authority.js";
import type { CommonEvaluationBlocker, ObservedResourceState } from "./judgment.js";
import type { ExpressionTrace } from "../simc/expression/evaluate.js";
import type { LineEvaluation } from "../simc/list-selection.js";

/**
 * The scope a selection claim is made within.
 *
 * ONE member. `GLOBAL_APL` is deliberately absent: M5-B cannot produce a global
 * verdict, and declaring the vocabulary before the capability exists would let a
 * result be widened by a one-word edit.
 */
export interface DecisionScope {
  readonly kind: "APL_SUBLIST";
  readonly listName: string;
  /** The authority line whose condition admits entry to that list. */
  readonly entryGate: AuthorityRef;
}

export const DECISION_SCOPE_KINDS = ["APL_SUBLIST"] as const satisfies readonly DecisionScope["kind"][];

/**
 * The action an authority selected.
 *
 * Two fields from two different sources, on purpose. `simcToken` is the
 * authority's own word for the action, read from the pinned text. `abilityGameId`
 * is runtime game data, resolved through `abilityIdentityFor`. The numeric
 * identity is never inferred from the SimulationCraft string, and the string is
 * never used to match an observed event.
 */
export interface SelectedAction {
  readonly simcToken: string;
  readonly abilityGameId: number;
}

/**
 * Why a scoped question does not apply.
 *
 * Exact knowledge, not a gap. One member today.
 */
export type NotApplicableReason = "ENTRY_GATE_FALSE";

export const NOT_APPLICABLE_REASONS = ["ENTRY_GATE_FALSE"] as const satisfies readonly NotApplicableReason[];

/**
 * Why a SCOPED selection could not be determined.
 *
 * Extends the shared vocabulary with four reasons specific to walking an ordered
 * list. `ANALYZER_SURFACE_INCOMPLETE` is NOT here: it means "the gate is
 * satisfiable and we evaluate too little to say what fires", which is exactly
 * what this family does evaluate, so it cannot apply.
 *
 * - `COMPETING_POSSIBLE_ACTION` — a higher-priority line that might still win
 *   names a different action. Remedy: state or usability evidence that settles
 *   that line.
 * - `NO_DEFINITE_WINNER` — lines might win but none is proven to. Remedy:
 *   usability evidence, or state that decides a condition.
 * - `NESTED_CALL_NOT_MODELLED` — the list calls another list, whose control flow
 *   this scoped walk does not follow.
 * - `UNMODELLED_DISPATCH_IN_LIST` — `run_action_list`, whose control flow
 *   differs from `call_action_list` and is not modelled.
 * - `SELECTED_ACTION_IDENTITY_UNAVAILABLE` — the list selects a token this
 *   project has no numeric spell id for. The authority answered; we cannot name
 *   what it named, and a token string is not an ability identity. Remedy: a
 *   runtime game-data entry for that token.
 * - `UNSUPPORTED_ACTION_OPTION` (M5-D1) — the line carries `cycle_targets=` or
 *   `target_if=`, so its condition is about targets this project does not
 *   enumerate, and no target-independent conjunct proved it cannot select.
 *   Deliberately NOT `UNSUPPORTED_AUTHORITY_EXPRESSION`: the syntax was fine, so
 *   widening the parser would not help.
 */
export type ScopedSelectionBlocker =
  | CommonEvaluationBlocker
  | "COMPETING_POSSIBLE_ACTION"
  | "NO_DEFINITE_WINNER"
  | "NESTED_CALL_NOT_MODELLED"
  | "UNMODELLED_DISPATCH_IN_LIST"
  | "SELECTED_ACTION_IDENTITY_UNAVAILABLE"
  | "UNSUPPORTED_ACTION_OPTION";

export const SCOPED_SELECTION_BLOCKERS = [
  "EXACT_RESOURCE_UNAVAILABLE",
  "RESOURCE_MAX_UNKNOWN",
  "UNRESOLVED_AUTHORITY_STATE",
  "UNSUPPORTED_AUTHORITY_EXPRESSION",
  "ACTION_REACHABILITY_NOT_PROVABLE",
  "COMPETING_POSSIBLE_ACTION",
  "NO_DEFINITE_WINNER",
  "NESTED_CALL_NOT_MODELLED",
  "UNMODELLED_DISPATCH_IN_LIST",
  "SELECTED_ACTION_IDENTITY_UNAVAILABLE",
  "UNSUPPORTED_ACTION_OPTION",
] as const satisfies readonly ScopedSelectionBlocker[];

export type ScopedSelectionStatus =
  "SELECTED_BY_AUTHORITY" | "NO_ACTION_SELECTED" | "NOT_APPLICABLE" | "UNKNOWN" | "NO_AUTHORITY_AVAILABLE";

export const SCOPED_SELECTION_STATUSES = [
  "SELECTED_BY_AUTHORITY",
  "NO_ACTION_SELECTED",
  "NOT_APPLICABLE",
  "UNKNOWN",
  "NO_AUTHORITY_AVAILABLE",
] as const satisfies readonly ScopedSelectionStatus[];

/**
 * A scoped selection, as a discriminated union.
 *
 * The three exact outcomes — selected, nothing selected, not applicable — each
 * carry the gate trace that established the list WAS or WAS NOT entered, because
 * every one of them is a claim about an entered or unentered list and is
 * worthless without that proof.
 */
export type ScopedActionSelection =
  | {
      readonly kind: "SCOPED_ACTION_SELECTION";
      readonly status: "SELECTED_BY_AUTHORITY";
      readonly scope: DecisionScope;
      readonly selectedAction: SelectedAction;
      /** The definitely-firing line. */
      readonly selectingLine: AuthorityRef;
      /**
       * Every line that might still have won, including the selecting one.
       *
       * All of them name the same action token — that is what makes the answer
       * exact despite the line being uncertain.
       */
      readonly convergedOver: readonly AuthorityRef[];
      readonly authority: ResolvedAuthority;
      /** Proof the gate admitted entry: TRUE under every enumerated resolution. */
      readonly gateTrace: ExpressionTrace;
      readonly lines: readonly LineEvaluation[];
      readonly observedState: readonly ObservedResourceState[];
      readonly stateEvidence: readonly EvidenceLocator[];
    }
  | {
      readonly kind: "SCOPED_ACTION_SELECTION";
      readonly status: "NO_ACTION_SELECTED";
      readonly scope: DecisionScope;
      readonly authority: ResolvedAuthority;
      readonly gateTrace: ExpressionTrace;
      readonly lines: readonly LineEvaluation[];
      readonly observedState: readonly ObservedResourceState[];
      readonly stateEvidence: readonly EvidenceLocator[];
    }
  | {
      readonly kind: "SCOPED_ACTION_SELECTION";
      readonly status: "NOT_APPLICABLE";
      readonly reason: NotApplicableReason;
      readonly scope: DecisionScope;
      readonly authority: ResolvedAuthority;
      /** Proof the gate was FALSE under every enumerated resolution. */
      readonly gateTrace: ExpressionTrace;
      readonly observedState: readonly ObservedResourceState[];
      readonly stateEvidence: readonly EvidenceLocator[];
    }
  | {
      readonly kind: "SCOPED_ACTION_SELECTION";
      readonly status: "UNKNOWN";
      readonly blocker: ScopedSelectionBlocker;
      readonly scope: DecisionScope | null;
      /** The authority line responsible, when one can be named. */
      readonly blockedBy: AuthorityRef | null;
      readonly authority: ResolvedAuthority | null;
      /** Present when the gate was actually evaluated. */
      readonly gateTrace: ExpressionTrace | null;
      readonly lines: readonly LineEvaluation[];
      readonly observedState: readonly ObservedResourceState[];
      readonly stateEvidence: readonly EvidenceLocator[];
      /** Safe, author-written detail. Never interpolated from upstream data. */
      readonly detail: string;
    }
  | {
      readonly kind: "SCOPED_ACTION_SELECTION";
      readonly status: "NO_AUTHORITY_AVAILABLE";
      readonly reason: NoAuthorityReason;
      readonly detail: string;
    };
