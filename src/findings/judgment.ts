/**
 * Judgments about one observed action.
 *
 * KEPT STRICTLY SEPARATE FROM M4's `StateResult`.
 *
 * M4 answers "what was the state, and how sure are we?" — EXACT / BOUNDED /
 * STALE / UNKNOWN. M5 answers "what does the authority say about this observed
 * action?" The two vocabularies never mix: a judgment carries no `certainty`, no
 * `derivation` and no `value`, and a `StateResult` carries no verdict. M4 facts
 * are inputs to M5 judgments, and the type system keeps the direction one-way.
 *
 * THIS FILE ANSWERS ONE QUESTION, AND ONLY ONE:
 *
 *     can the pinned APL select THIS OBSERVED CAST at the proven state?
 *
 * The subject is the observation. A different question — "what does the
 * authority select inside this sub-list?" — has the authority as its subject and
 * an action token as its answer, and it lives in `scoped-selection.ts`. Both are
 * carried by `Finding.judgment`, discriminated on `kind`, and neither can be
 * read as the other.
 *
 * THERE IS NO POSITIVE VERDICT HERE, AND THAT IS DELIBERATE.
 *
 * `REJECTED_BY_AUTHORITY` is sound because a false gate makes a sub-list
 * unreachable regardless of anything above it in the priority list. The mirror
 * claim is NOT sound: a gate being satisfiable does not establish that the APL
 * reaches that line, nor that the action's own conditions hold, nor that the
 * action is the one that would be selected. So there is no `CORRECT`, no
 * `MATCH`, no `OPTIMAL`. A satisfiable gate resolves to UNKNOWN with
 * `ANALYZER_SURFACE_INCOMPLETE`, which is the honest statement: the standard
 * exists, and we have not evaluated enough of it.
 *
 * WHAT REJECTED_BY_AUTHORITY MEANS, EXACTLY:
 *
 *     the pinned APL cannot select this observed action under EVERY supported
 *     resolution of the evaluated authority state
 *
 * It is not "the player made a mistake". Actionability is not evaluated, the
 * replacement action is not identified, and nothing here is scored.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { NoAuthorityReason, ResolvedAuthority } from "./authority.js";
import type { ExpressionTrace } from "../simc/expression/evaluate.js";

/**
 * Which question a judgment answers.
 *
 * A direct discriminant on each judgment type rather than a wrapper object: the
 * two are alternatives in one field, and TypeScript narrows a union on a literal
 * member without an extra layer. A wrapper would add a level of nesting to every
 * consumer for no additional guarantee.
 */
export type JudgmentFamily = "OBSERVED_ACTION_JUDGMENT" | "SCOPED_ACTION_SELECTION";

export const JUDGMENT_FAMILIES = [
  "OBSERVED_ACTION_JUDGMENT",
  "SCOPED_ACTION_SELECTION",
] as const satisfies readonly JudgmentFamily[];

/**
 * One observed action that the authority could be asked about.
 *
 * Holds a locator and a canonical position — references into the normalized
 * fight, never a copy of the event.
 */
export interface ObservedActionDecisionPoint {
  /** Canonical index into `CombatFight.events`. Never an ingestion ordinal. */
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly actorId: number;
  /** Matched numerically. Display names are never used for identity. */
  readonly abilityGameId: number;
  readonly castPhase: "COMPLETE";
  readonly reportTimeMs: number;
  readonly fightTimeMs: number;
}

/** The exact combat state a judgment consumed, recorded so it is auditable. */
export interface ObservedResourceState {
  readonly resourceId: string;
  readonly wireType: number;
  readonly observedAmount: number;
  readonly observedMax: number;
  readonly derivedDeficit: number;
  /** Always `PRE_COST` — nothing else is accepted as exact decision state. */
  readonly timing: "PRE_COST";
}

// --------------------------------------------------------------------------
// Blocker vocabulary, split by family
// --------------------------------------------------------------------------

/**
 * Reasons that mean the SAME thing to both judgment families.
 *
 * Shared by name because a name must mean one thing. Inventing
 * `SCOPED_UNSUPPORTED_EXPRESSION` alongside `UNSUPPORTED_AUTHORITY_EXPRESSION`
 * would be synonym drift: two reasons a reader has to learn are identical, and
 * two places a future fix has to be applied.
 *
 * - `EXACT_RESOURCE_UNAVAILABLE` — no same-event exact observation. Remedy: a
 *   capture whose snapshot carries it. Never means the resource was zero.
 * - `RESOURCE_MAX_UNKNOWN` — an amount without a usable maximum, so a deficit or
 *   a percentage cannot be derived from it.
 * - `UNRESOLVED_AUTHORITY_STATE` — the condition's value genuinely depends on
 *   state we could not establish. Supported syntax, missing state.
 * - `UNSUPPORTED_AUTHORITY_EXPRESSION` — the authority string uses syntax
 *   outside the supported subset. Nothing was evaluated. Remedy: widen the
 *   subset, with tests.
 * - `ACTION_REACHABILITY_NOT_PROVABLE` — the call graph does not establish that
 *   the evaluated gate governs every path to this action.
 */
export type CommonEvaluationBlocker =
  | "EXACT_RESOURCE_UNAVAILABLE"
  | "RESOURCE_MAX_UNKNOWN"
  | "UNRESOLVED_AUTHORITY_STATE"
  | "UNSUPPORTED_AUTHORITY_EXPRESSION"
  | "ACTION_REACHABILITY_NOT_PROVABLE";

export const COMMON_EVALUATION_BLOCKERS = [
  "EXACT_RESOURCE_UNAVAILABLE",
  "RESOURCE_MAX_UNKNOWN",
  "UNRESOLVED_AUTHORITY_STATE",
  "UNSUPPORTED_AUTHORITY_EXPRESSION",
  "ACTION_REACHABILITY_NOT_PROVABLE",
] as const satisfies readonly CommonEvaluationBlocker[];

/**
 * Why an OBSERVED-ACTION judgment could not reach a verdict.
 *
 * `ANALYZER_SURFACE_INCOMPLETE` is specific to this family and meaningless in
 * the other one: it says the gate is satisfiable and we evaluate too little of
 * the APL to say what would be selected. A scoped selection DOES evaluate its
 * sub-list, so it can never be blocked for that reason — and the type stops it
 * from claiming to be.
 */
export type ObservedActionBlocker = CommonEvaluationBlocker | "ANALYZER_SURFACE_INCOMPLETE";

export const OBSERVED_ACTION_BLOCKERS = [
  ...COMMON_EVALUATION_BLOCKERS,
  "ANALYZER_SURFACE_INCOMPLETE",
] as const satisfies readonly ObservedActionBlocker[];

export type ObservedActionJudgmentStatus = "REJECTED_BY_AUTHORITY" | "UNKNOWN" | "NO_AUTHORITY_AVAILABLE";

export const OBSERVED_ACTION_JUDGMENT_STATUSES = [
  "REJECTED_BY_AUTHORITY",
  "UNKNOWN",
  "NO_AUTHORITY_AVAILABLE",
] as const satisfies readonly ObservedActionJudgmentStatus[];

/**
 * A judgment, as a discriminated union.
 *
 * The shape makes impossible combinations unrepresentable rather than merely
 * discouraged. A rejection cannot exist without a resolved authority, a proof
 * trace and the exact state it rested on; a no-authority result cannot carry a
 * blocker, because no evaluation was attempted.
 */
export type ObservedActionJudgment =
  | {
      readonly kind: "OBSERVED_ACTION_JUDGMENT";
      readonly status: "REJECTED_BY_AUTHORITY";
      readonly authority: ResolvedAuthority;
      /** Proof: every enumerated world evaluated the gate FALSE. */
      readonly trace: ExpressionTrace;
      readonly observedState: ObservedResourceState;
      readonly stateEvidence: readonly EvidenceLocator[];
    }
  | {
      readonly kind: "OBSERVED_ACTION_JUDGMENT";
      readonly status: "UNKNOWN";
      readonly blocker: ObservedActionBlocker;
      /** Present when authority resolution got far enough to identify a line. */
      readonly authority: ResolvedAuthority | null;
      /** Present when an expression was actually evaluated. */
      readonly trace: ExpressionTrace | null;
      readonly observedState: ObservedResourceState | null;
      readonly stateEvidence: readonly EvidenceLocator[];
      /** Safe, author-written detail. Never interpolated from upstream data. */
      readonly detail: string;
    }
  | {
      readonly kind: "OBSERVED_ACTION_JUDGMENT";
      readonly status: "NO_AUTHORITY_AVAILABLE";
      readonly reason: NoAuthorityReason;
      readonly detail: string;
    };
