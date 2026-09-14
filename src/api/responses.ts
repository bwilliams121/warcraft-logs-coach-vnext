/**
 * HTTP response construction.
 *
 * This is the ONLY module that builds a response body, which makes it the single
 * place to audit what can leave the backend. Bodies are built from fixed,
 * author-written shapes — never from a caught exception, and never from the
 * environment — because either can carry a credential.
 */

import { projectAnalysisResult } from "../contracts/analysis-projection.js";
import {
  assertNever,
  type AnalysisServiceResult,
  type ServiceError,
  type ServiceErrorCode,
} from "../services/result.js";

/**
 * Every code the HTTP layer can emit.
 *
 * The service's own codes, plus routing faults and the three the exposure layer
 * owns. `UNAUTHORIZED`, `RATE_LIMITED` and `RATE_LIMITER_UNAVAILABLE` are NOT
 * service errors: the application never learns a request was refused, because
 * refusing it is what stops the application from running.
 */
export type ApiErrorCode =
  | ServiceErrorCode
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "RATE_LIMITER_UNAVAILABLE";

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
  "INTERNAL_ERROR",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "RATE_LIMITER_UNAVAILABLE",
] as const satisfies readonly ApiErrorCode[];

/**
 * Maps every error code to an explicit status. The exhaustive switch means a new
 * code cannot default into a 2xx.
 */
export function statusForErrorCode(code: ApiErrorCode): number {
  switch (code) {
    case "INVALID_REQUEST":
      return 400;
    // No credential, or the wrong one. Analysis spends a paid quota and is not
    // publicly callable; the rate limiter is a brake, not a door.
    case "UNAUTHORIZED":
      return 401;
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
    // Both rate-limit families are 429: one is Warcraft Logs refusing us, the
    // other is us refusing the caller, and a client's correct response to
    // either is to slow down.
    case "UPSTREAM_RATE_LIMITED":
    case "RATE_LIMITED":
      return 429;
    case "INTERNAL_ERROR":
      return 500;
    // Warcraft Logs answered, but with data we cannot trust or use.
    case "IDENTITY_UNRESOLVED":
    case "UPSTREAM_DATA_INVALID":
      return 502;
    case "CONFIGURATION_ERROR":
    case "UPSTREAM_AUTH_FAILED":
    case "UPSTREAM_UNAVAILABLE":
    // The limiter could not decide, so the expensive path was refused rather
    // than run unmetered. A temporary unavailability, not a caller fault.
    case "RATE_LIMITER_UNAVAILABLE":
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
 * A SUCCESSFUL BODY IS THE PUBLIC ANALYSIS RESULT ITSELF, with no wrapper.
 *
 * That is a deliberate choice over `{ ok: true, analysis: ... }`. The invariant
 * M6 has to guarantee is that gameplay truth cannot differ by transport, and
 * the sharpest form of it is that the REST body and MCP's `structuredContent`
 * are the same object. A wrapper would add a field that exists on one transport
 * and not the other, for no information — the result already carries `status`
 * and `schemaVersion`, and HTTP already carries success.
 *
 * Failures keep the established `{ ok: false, error }` envelope and their
 * non-2xx statuses. A transport failure is not an analysis and must never be
 * parseable as one.
 *
 * ALL FIVE ANALYSIS STATUSES ARE 200. `SPEC_NOT_SUPPORTED` and the three
 * evidence statuses are truthful answers to a question that was successfully
 * asked. Returning 404 for an unsupported spec, or 422 for an analysis that
 * resolved nothing, would tell a client the request failed when the engine
 * worked exactly as designed.
 */
export function serviceResultResponse(result: AnalysisServiceResult): Response {
  if (result.ok) {
    return jsonResponse(200, projectAnalysisResult(result.analysis));
  }
  const { code, message, issues } = result.error;
  return apiErrorResponse(code, message, issues === undefined ? undefined : { issues });
}
