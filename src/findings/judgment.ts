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
 * THERE IS NO POSITIVE VERDICT, AND THAT IS DELIBERATE.
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

/**
 * Why a judgment could not reach a verdict.
 *
 * Every member is a DIFFERENT remedy, which is the test for earning a place:
 *
 * - `EXACT_RESOURCE_UNAVAILABLE` — no same-event exact observation. Remedy: a
 *   capture whose snapshot carries it. Never means the resource was zero.
 * - `RESOURCE_MAX_UNKNOWN` — an amount without a usable maximum, so the deficit
 *   expression cannot be resolved.
 * - `UNRESOLVED_AUTHORITY_STATE` — the condition's value genuinely depends on
 *   state we could not establish; worlds disagreed.
 * - `UNSUPPORTED_AUTHORITY_EXPRESSION` — the authority string uses syntax
 *   outside the supported subset. Remedy: widen the subset, with tests.
 * - `ANALYZER_SURFACE_INCOMPLETE` — the gate is satisfiable, and we evaluate too
 *   little of the APL to say what would actually be selected.
 * - `ACTION_REACHABILITY_NOT_PROVABLE` — the call graph does not establish that
 *   the evaluated gate governs every path to this action.
 */
export type JudgmentBlocker =
  | "EXACT_RESOURCE_UNAVAILABLE"
  | "RESOURCE_MAX_UNKNOWN"
  | "UNRESOLVED_AUTHORITY_STATE"
  | "UNSUPPORTED_AUTHORITY_EXPRESSION"
  | "ANALYZER_SURFACE_INCOMPLETE"
  | "ACTION_REACHABILITY_NOT_PROVABLE";

export const JUDGMENT_BLOCKERS = [
  "EXACT_RESOURCE_UNAVAILABLE",
  "RESOURCE_MAX_UNKNOWN",
  "UNRESOLVED_AUTHORITY_STATE",
  "UNSUPPORTED_AUTHORITY_EXPRESSION",
  "ANALYZER_SURFACE_INCOMPLETE",
  "ACTION_REACHABILITY_NOT_PROVABLE",
] as const satisfies readonly JudgmentBlocker[];

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
      readonly status: "REJECTED_BY_AUTHORITY";
      readonly authority: ResolvedAuthority;
      /** Proof: every enumerated world evaluated the gate FALSE. */
      readonly trace: ExpressionTrace;
      readonly observedState: ObservedResourceState;
      readonly stateEvidence: readonly EvidenceLocator[];
    }
  | {
      readonly status: "UNKNOWN";
      readonly blocker: JudgmentBlocker;
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
      readonly status: "NO_AUTHORITY_AVAILABLE";
      readonly reason: NoAuthorityReason;
      readonly detail: string;
    };
