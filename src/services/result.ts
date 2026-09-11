/**
 * Application-service result and error envelope.
 *
 * This is the contract every user-facing interface (REST today, MCP or an addon
 * handoff later) returns through. There is exactly one analysis path, so there
 * is exactly one result shape.
 */

/**
 * Outcome states of a completed analysis.
 *
 * These are the states documented in `agent/architecture.md`. Note what is
 * deliberately absent:
 *
 * - `UNKNOWN` and `NO_AUTHORITY_AVAILABLE` are finding-level and decision-level
 *   states. They are not service-result states, and must not be added here.
 * - There is no "not implemented yet" state. Milestone 1's placeholder is a
 *   `ServiceError`, so a scaffold can never masquerade as an analysis outcome.
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
  | "FIGHT_NOT_FOUND"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_NOT_A_PLAYER"
  | "SOURCE_NOT_IN_FIGHT"
  | "IDENTITY_UNRESOLVED"
  | "UPSTREAM_DATA_INVALID"
  | "UPSTREAM_AUTH_FAILED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "ANALYSIS_NOT_IMPLEMENTED"
  | "INTERNAL_ERROR";

export const SERVICE_ERROR_CODES = [
  "INVALID_REQUEST",
  "CONFIGURATION_ERROR",
  "REPORT_NOT_ACCESSIBLE",
  "FIGHT_NOT_FOUND",
  "SOURCE_NOT_FOUND",
  "SOURCE_NOT_A_PLAYER",
  "SOURCE_NOT_IN_FIGHT",
  "IDENTITY_UNRESOLVED",
  "UPSTREAM_DATA_INVALID",
  "UPSTREAM_AUTH_FAILED",
  "UPSTREAM_RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "ANALYSIS_NOT_IMPLEMENTED",
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
  | "INVALID_SOURCE_ID";

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

export type AnalysisServiceResult =
  | { readonly ok: true; readonly state: AnalysisResultState }
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
