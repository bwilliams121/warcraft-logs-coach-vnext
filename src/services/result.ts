/**
 * Application-service result and error envelope.
 *
 * This is the contract every user-facing interface (REST today, MCP or an addon
 * handoff later) returns through. There is exactly one analysis path, so there
 * is exactly one result shape.
 */

import {
  PREPARATION_NOT_ASSESSED_REASONS,
  type ConsumableStatusReport,
} from "../analysis/preparation/consumable-status.js";
import type { SpecAnalysisEnvelope } from "../findings/analysis-envelope.js";
import type { SpecId } from "../findings/finding.js";
import type { ObservedDecisionView } from "../findings/observed-decision-view.js";
import type { FightIdentity } from "../wcl/types.js";
import type { IngestionScope } from "./ingestion-scope.js";

/**
 * Outcome states of a completed analysis.
 *
 * These are the states documented in `agent/architecture.md`. Note what is
 * deliberately absent:
 *
 * - `UNKNOWN` and `NO_AUTHORITY_AVAILABLE` are finding-level and decision-level
 *   states. They are not service-result states, and must not be added here.
 * - There is no "not implemented yet" state, and as of M6-E no such error code
 *   either. Ingestion is a required dependency, so an unwired composition is a
 *   compile error rather than a status a caller has to interpret.
 *
 * `INSUFFICIENT_SCOPE` means retrieved data could not satisfy the internally
 * derived ingestion requirement. External callers do not select scope, so it can
 * never originate from a request parameter.
 */
export type AnalysisResultState =
  | "COMPLETE"
  | "PARTIAL"
  | "SPEC_NOT_SUPPORTED"
  | "INSUFFICIENT_SCOPE"
  | "INCOMPATIBLE_DATA_VERSION"
  | "IDENTITY_CONFLICT";

export const ANALYSIS_RESULT_STATES = [
  "COMPLETE",
  "PARTIAL",
  "SPEC_NOT_SUPPORTED",
  "INSUFFICIENT_SCOPE",
  "INCOMPATIBLE_DATA_VERSION",
  "IDENTITY_CONFLICT",
] as const satisfies readonly AnalysisResultState[];

/**
 * Why a request did not produce an analysis.
 *
 * The `REPORT_*`/`FIGHT_*`/`SOURCE_*`/`IDENTITY_*` codes are factual preflight
 * outcomes: the request named something that does not exist, or Warcraft Logs
 * could not supply a trustworthy identity for it. The `UPSTREAM_*` codes are
 * retrieval failures. Neither family is a gameplay judgement, and none of them
 * may be returned as a successful-looking analysis.
 */
export type ServiceErrorCode =
  | "INVALID_REQUEST"
  | "CONFIGURATION_ERROR"
  | "REPORT_NOT_ACCESSIBLE"
  /**
   * The report exists but its combat events are archived out of reach.
   *
   * Kept apart from `REPORT_NOT_ACCESSIBLE` because the two need different
   * things from the reader: a missing or private report is a wrong link, while
   * an archived one is a real report this deployment cannot read with
   * client-credentials access.
   */
  | "REPORT_ARCHIVED_INACCESSIBLE"
  /**
   * The report was re-uploaded while we were reading it.
   *
   * Its own code because it is the one retrieval failure that is neither the
   * caller's fault nor ours, and the one whose correct response is simply to
   * try again. Folding it into `UPSTREAM_DATA_INVALID` would tell a caller the
   * data cannot be trusted when in fact a later attempt is expected to succeed.
   */
  | "REPORT_REVISION_CHANGED"
  /**
   * The report revision could not be confirmed.
   *
   * NOT a softer `REPORT_REVISION_CHANGED`. That one means the report demonstrably
   * moved; this means the check itself could not be completed, so nothing was
   * established. Accepting a raid night on "probably unchanged" is precisely how
   * a mixed-revision aggregate gets built, so the two stay apart.
   *
   * Reachable only from the raid-night path: a single-fight analysis is pinned by
   * M3's own recheck and never needs a separate confirmation.
   */
  | "REPORT_REVISION_UNVERIFIED"
  | "FIGHT_NOT_FOUND"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_NOT_A_PLAYER"
  | "SOURCE_NOT_IN_FIGHT"
  | "IDENTITY_UNRESOLVED"
  | "UPSTREAM_DATA_INVALID"
  | "UPSTREAM_AUTH_FAILED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL_ERROR";

export const SERVICE_ERROR_CODES = [
  "INVALID_REQUEST",
  "CONFIGURATION_ERROR",
  "REPORT_NOT_ACCESSIBLE",
  "REPORT_ARCHIVED_INACCESSIBLE",
  "REPORT_REVISION_CHANGED",
  "REPORT_REVISION_UNVERIFIED",
  "FIGHT_NOT_FOUND",
  "SOURCE_NOT_FOUND",
  "SOURCE_NOT_A_PLAYER",
  "SOURCE_NOT_IN_FIGHT",
  "IDENTITY_UNRESOLVED",
  "UPSTREAM_DATA_INVALID",
  "UPSTREAM_AUTH_FAILED",
  "UPSTREAM_RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const satisfies readonly ServiceErrorCode[];

/** Field-level reasons a request was rejected. */
export type RequestIssueCode =
  | "MISSING_REQUEST_INPUT"
  | "CONFLICTING_REQUEST_FIELDS"
  | "CLIENT_SCOPE_NOT_ACCEPTED"
  | "NOT_AN_OBJECT"
  | "NOT_A_WARCRAFT_LOGS_URL"
  | "INVALID_REPORT_URL"
  | "MISSING_REPORT_CODE"
  | "INVALID_REPORT_CODE"
  | "MISSING_FIGHT_ID"
  | "INVALID_FIGHT_ID"
  | "UNSUPPORTED_FIGHT_SELECTOR"
  | "MISSING_SOURCE_ID"
  | "INVALID_SOURCE_ID"
  /** A list field was not an array, or held a value no id could be. */
  | "INVALID_REQUEST_SHAPE"
  /** A bounded request field exceeded its documented maximum. */
  | "REQUEST_LIMIT_EXCEEDED";

export interface RequestIssue {
  readonly code: RequestIssueCode;
  /** Request field or URL parameter the issue refers to. */
  readonly field: string;
  /** Safe, author-written explanation. Never derived from secrets or exceptions. */
  readonly message: string;
}

export interface ServiceError {
  readonly code: ServiceErrorCode;
  /**
   * Safe, author-written message. Never interpolated from the environment or
   * from a caught exception, because either can carry a credential.
   */
  readonly message: string;
  readonly issues?: readonly RequestIssue[];
}

/**
 * A completed analysis, as the application layer holds it.
 *
 * A THIN WRAPPER, DELIBERATELY. It carries the analyzer's own result unchanged
 * plus the identity the analysis was run against. It does not reshape, rank,
 * summarise or reinterpret anything the analyzer said — an application layer
 * that edited a gameplay result would be a second analyzer with a smaller
 * vocabulary.
 *
 * THIS IS NOT A WIRE CONTRACT. `analysis` is the analyzer's internal type, and
 * it may contain more structure than any interface should publish. Projecting a
 * stable public shape is a later milestone's job; nothing here is frozen.
 */
export interface FightAnalysis {
  /** Warcraft Logs identity, exactly as preflight established it. */
  readonly identity: FightIdentity;
  /**
   * The internal specialization an analyzer was selected for.
   *
   * `null` when the player's specialization maps to no registered analyzer. Null
   * rather than a placeholder id, so "we did not analyze this" cannot be read as
   * "we analyzed it as something".
   */
  readonly specId: SpecId | null;
  /** Which registered analyzer ran, or `null` when none did. Disclosure, not dispatch. */
  readonly analyzerId: string | null;
  /**
   * The evidence breadth actually retrieved, derived from the analyzer's
   * requirement — or `null` when no analyzer ran and nothing was retrieved.
   */
  readonly scope: IngestionScope | null;
  /**
   * The analyzer's own result, unmodified.
   *
   * Typed as the spec-neutral ENVELOPE. The specialization's payload is inside
   * the analyzed variant, and this layer never reads it.
   */
  readonly analysis: SpecAnalysisEnvelope;
  /**
   * The registration's own projection of an analyzed result, or `null` when
   * nothing was analyzed.
   *
   * The only form in which the public and raid-night projectors read an
   * analysis. Produced by the registration that produced `analysis`, at the
   * same place, so the two describe one result.
   */
  readonly observedDecisions: ObservedDecisionView | null;
  /**
   * The shared PREPARATION producer's consumable status (health potion,
   * healthstone, combat potion), produced in parallel with — and never from —
   * the specialization result. Always present: ASSESSED over the retrieved
   * fight, or NOT_ASSESSED with the reason, never omitted.
   */
  readonly preparation: PreparationOutcome;
}

/**
 * Whether the preparation producer ran. NOT_ASSESSED is a disclosed gap, not a
 * status, and nothing is claimed:
 *
 *   NO_FIGHT_RETRIEVED  no fight was retrieved for this player (raid night's
 *                       unanalyzable players; constructed test analyses).
 *   RETRIEVAL_FAILED    the fight was requested for preparation alone (an
 *                       unsupported specialization, PREP-2) and retrieval
 *                       failed or the report changed. The unsupported answer
 *                       itself still stands.
 */
export { PREPARATION_NOT_ASSESSED_REASONS };

export type PreparationOutcome =
  | { readonly state: "ASSESSED"; readonly report: ConsumableStatusReport }
  | {
      readonly state: "NOT_ASSESSED";
      readonly reason: (typeof PREPARATION_NOT_ASSESSED_REASONS)[number];
    };

export const PREPARATION_NOT_ASSESSED: PreparationOutcome = {
  state: "NOT_ASSESSED",
  reason: "NO_FIGHT_RETRIEVED",
};

export type AnalysisServiceResult =
  | { readonly ok: true; readonly state: AnalysisResultState; readonly analysis: FightAnalysis }
  | { readonly ok: false; readonly error: ServiceError };

export function serviceFailure(
  code: ServiceErrorCode,
  message: string,
  issues?: readonly RequestIssue[],
): AnalysisServiceResult {
  return {
    ok: false,
    error: issues === undefined ? { code, message } : { code, message, issues },
  };
}

/**
 * Compile-time exhaustiveness guard. Adding a state or error code without
 * handling it everywhere becomes a type error rather than a silent fall-through.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${String(value)}`);
}
