/**
 * HTTP response construction.
 *
 * This is the ONLY module that builds a response body, which makes it the single
 * place to audit what can leave the backend. Bodies are built from fixed,
 * author-written shapes — never from a caught exception, and never from the
 * environment — because either can carry a credential.
 */

import {
  assertNever,
  type AnalysisServiceResult,
  type ServiceError,
  type ServiceErrorCode,
} from "../services/result.js";

export type ApiErrorCode = ServiceErrorCode | "NOT_FOUND" | "METHOD_NOT_ALLOWED";

export const API_ERROR_CODES = [
  "INVALID_REQUEST",
  "CONFIGURATION_ERROR",
  "REPORT_NOT_ACCESSIBLE",
  "REPORT_ARCHIVED_INACCESSIBLE",
  "REPORT_REVISION_CHANGED",
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
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
] as const satisfies readonly ApiErrorCode[];

/**
 * Maps every error code to an explicit status. The exhaustive switch means a new
 * code cannot default into a 2xx.
 */
export function statusForErrorCode(code: ApiErrorCode): number {
  switch (code) {
    case "INVALID_REQUEST":
      return 400;
    case "NOT_FOUND":
    // The requested report, fight or actor does not exist as specified.
    case "REPORT_NOT_ACCESSIBLE":
    case "FIGHT_NOT_FOUND":
    case "SOURCE_NOT_FOUND":
      return 404;
    case "METHOD_NOT_ALLOWED":
      return 405;
    // The report was replaced while we were reading it. A conflict between two
    // versions of the same resource, and the one retrieval failure whose correct
    // response is simply to retry.
    case "REPORT_REVISION_CHANGED":
      return 409;
    // The identifiers exist but do not describe an analyzable player in that
    // fight, or name a report whose events cannot be reached. Well-formed,
    // understood, and not processable.
    case "REPORT_ARCHIVED_INACCESSIBLE":
    case "SOURCE_NOT_A_PLAYER":
    case "SOURCE_NOT_IN_FIGHT":
      return 422;
    case "UPSTREAM_RATE_LIMITED":
      return 429;
    case "INTERNAL_ERROR":
      return 500;
    case "ANALYSIS_NOT_IMPLEMENTED":
      return 501;
    // Warcraft Logs answered, but with data we cannot trust or use.
    case "IDENTITY_UNRESOLVED":
    case "UPSTREAM_DATA_INVALID":
      return 502;
    case "CONFIGURATION_ERROR":
    case "UPSTREAM_AUTH_FAILED":
    case "UPSTREAM_UNAVAILABLE":
      return 503;
    default:
      return assertNever(code);
  }
}

export function jsonResponse(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function apiErrorResponse(
  code: ApiErrorCode,
  message: string,
  extra?: { readonly issues?: ServiceError["issues"]; readonly headers?: HeadersInit },
): Response {
  const error = extra?.issues === undefined ? { code, message } : { code, message, issues: extra.issues };
  return jsonResponse(statusForErrorCode(code), { ok: false, error }, extra?.headers);
}

/**
 * Renders an application-service result.
 *
 * A failure is never rendered as 2xx, so the Milestone 1 placeholder cannot read
 * as a successful analysis.
 */
export function serviceResultResponse(result: AnalysisServiceResult): Response {
  if (result.ok) {
    return jsonResponse(200, { ok: true, state: result.state });
  }
  const { code, message, issues } = result.error;
  return apiErrorResponse(code, message, issues === undefined ? undefined : { issues });
}
