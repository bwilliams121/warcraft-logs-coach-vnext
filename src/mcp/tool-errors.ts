/**
 * Turning an application failure into an MCP tool error.
 *
 * THE DISTINCTION THIS FILE DEFENDS
 *
 * An analysis that could not resolve a decision is a RESULT. A request that
 * never reached an analysis is a FAILURE. They look similar from a distance and
 * they mean opposite things:
 *
 *     UNKNOWN                the engine looked and honestly could not tell
 *     UPSTREAM_UNAVAILABLE   the engine never got to look
 *
 * Collapsing the second into the first would manufacture gameplay uncertainty
 * out of an outage — a player would read "we could not determine this decision"
 * when the truth is "Warcraft Logs was down". So every code here becomes
 * `isError: true` with no `structuredContent`, and nothing in this file can
 * produce an analysis shape.
 *
 * EVERY MESSAGE IS AUTHOR-WRITTEN
 *
 * Nothing upstream is interpolated: no thrown value, no GraphQL text, no OAuth
 * response, no environment value. The table is exhaustive over
 * `ServiceErrorCode` via `satisfies`, so a new code is a compile error rather
 * than a silent fall-through into a generic message.
 */

import type { ServiceErrorCode } from "../services/result.js";

/** The error codes this tool can emit. A superset of the service's own. */
export type McpToolErrorCode =
  | ServiceErrorCode
  /** The analysis limiter refused this invocation. */
  | "RATE_LIMITED"
  /** The limiter could not decide, so the expensive path was not taken. */
  | "RATE_LIMITER_UNAVAILABLE"
  /** An unexpected throw anywhere under the tool. */
  | "INTERNAL_ERROR";

export interface McpToolError {
  readonly code: McpToolErrorCode;
  readonly message: string;
  /**
   * Whether retrying the identical call could plausibly succeed without the
   * caller changing anything.
   *
   * Stated only where the service's own semantics make it decidable. It is a
   * hint for an agent deciding whether to back off or to stop and ask a human —
   * so a wrong `true` is worse than an omission, because it invites a loop
   * against a condition that will never clear.
   */
  readonly retryable: boolean;
}

interface ErrorDescription {
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Every application failure, mapped deliberately.
 *
 * `satisfies Record<ServiceErrorCode, …>` is what makes this exhaustive: adding
 * a service error without deciding what a tool caller should be told will not
 * compile.
 */
const SERVICE_ERRORS = {
  INVALID_REQUEST: {
    message:
      "The analysis request was not valid. Check the report URL or the report code, fight ID and source ID.",
    // The caller must change the arguments. Retrying the same ones cannot help.
    retryable: false,
  },
  CONFIGURATION_ERROR: {
    message:
      "This deployment is not configured to reach Warcraft Logs. This is a server-side problem and cannot be fixed by the caller.",
    // Needs an operator, not a retry.
    retryable: false,
  },
  REPORT_NOT_ACCESSIBLE: {
    message:
      "Warcraft Logs did not return that report. It may not exist, or it may be private. Only public and unlisted reports can be analyzed.",
    retryable: false,
  },
  REPORT_ARCHIVED_INACCESSIBLE: {
    message:
      "That report is archived on Warcraft Logs, so its combat events cannot be retrieved by this service.",
    // Archival does not reverse on its own.
    retryable: false,
  },
  REPORT_REVISION_CHANGED: {
    message:
      "That report was re-uploaded while its combat events were being retrieved, so the evidence could not be read from a single consistent version.",
    // The one failure whose correct response really is to try again: the next
    // attempt reads one settled revision.
    retryable: true,
  },
  FIGHT_NOT_FOUND: {
    message: "That report does not contain the requested fight.",
    retryable: false,
  },
  SOURCE_NOT_FOUND: {
    message: "That report does not contain an actor with the requested source ID.",
    retryable: false,
  },
  SOURCE_NOT_A_PLAYER: {
    message:
      "The requested source ID belongs to a pet or NPC, not a player. Select the player on Warcraft Logs and copy the URL again.",
    retryable: false,
  },
  SOURCE_NOT_IN_FIGHT: {
    message: "That player is in the report but did not participate in the requested fight.",
    retryable: false,
  },
  IDENTITY_UNRESOLVED: {
    message:
      "Warcraft Logs did not supply a complete identity (name, class and specialization) for that player, so the fight cannot be analyzed.",
    // A property of the uploaded log, not a transient condition.
    retryable: false,
  },
  REPORT_REVISION_UNVERIFIED: {
    message:
      "The Warcraft Logs report revision could not be confirmed, so the result was refused rather than assembled from evidence that might span two versions of the report. Try again later.",
    // A later attempt can complete the check. Distinct from a revision that
    // demonstrably CHANGED, which also clears but for a different reason.
    retryable: true,
  },
  UPSTREAM_DATA_INVALID: {
    message: "Warcraft Logs returned data that could not be trusted, so no analysis was produced.",
    retryable: false,
  },
  UPSTREAM_AUTH_FAILED: {
    message:
      "Warcraft Logs rejected this deployment's API credentials. This is a server-side problem and cannot be fixed by the caller.",
    retryable: false,
  },
  UPSTREAM_RATE_LIMITED: {
    message: "Warcraft Logs rate limit reached. Try again later.",
    // Clears with time, by definition.
    retryable: true,
  },
  UPSTREAM_UNAVAILABLE: {
    message: "Warcraft Logs could not be reached, so no analysis was produced.",
    retryable: true,
  },
  INTERNAL_ERROR: {
    message: "An unexpected internal error occurred.",
    retryable: false,
  },
} as const satisfies Record<ServiceErrorCode, ErrorDescription>;

/** Failures that originate in this transport rather than in the application. */
const TRANSPORT_ERRORS = {
  RATE_LIMITED: {
    message: "Too many analysis requests. Retry later. This limit protects a shared Warcraft Logs API quota.",
    // True, and deliberately without a duration: the binding reports no reset
    // time, and inventing one would invite a client to retry at exactly the
    // wrong moment.
    retryable: true,
  },
  RATE_LIMITER_UNAVAILABLE: {
    message:
      "The analysis rate limiter is unavailable, so this request was refused rather than run unmetered. Try again later.",
    retryable: true,
  },
} as const satisfies Record<Exclude<McpToolErrorCode, ServiceErrorCode>, ErrorDescription>;

/** Builds the tool error for one application failure code. */
export function toolErrorForServiceCode(code: ServiceErrorCode): McpToolError {
  const description = SERVICE_ERRORS[code];
  return { code, message: description.message, retryable: description.retryable };
}

/** Builds the tool error for one transport failure. */
export function transportToolError(code: Exclude<McpToolErrorCode, ServiceErrorCode>): McpToolError {
  const description = TRANSPORT_ERRORS[code];
  return { code, message: description.message, retryable: description.retryable };
}

/**
 * The error envelope sent as the tool result's text block.
 *
 * A SEPARATE SHAPE FROM THE ANALYSIS, ON PURPOSE. The tool's declared
 * `outputSchema` is the successful public analysis result; a failure carries no
 * `structuredContent` at all, so there is no union on the wire mixing gameplay
 * truth with transport faults, and no consumer can parse an outage as a
 * finding.
 */
export function toolErrorBody(error: McpToolError): string {
  return JSON.stringify({ ok: false, error });
}
