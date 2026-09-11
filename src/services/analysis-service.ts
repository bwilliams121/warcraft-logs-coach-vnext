/**
 * Application service — the single analysis entry point.
 *
 * Every interface (REST today, MCP later) calls this. None of them may contain
 * a separate analyzer.
 *
 * This module is use-case orchestration only. It contains no gameplay rules, no
 * Warcraft Logs GraphQL shapes, and no Cloudflare-specific types, so it runs
 * under a plain Node test project with no Workers runtime present.
 *
 * Milestone 2 proves the retrieval path end to end: authenticate, query, and
 * establish factual identity for the requested player in the requested fight.
 * Gameplay analysis is still not implemented, and this service says so
 * explicitly rather than returning an empty-looking success.
 */

import { loadConfig, type Env } from "../config/env.js";
import type { PreflightPort, WclFailureReason } from "../wcl/types.js";
import { parseAnalysisRequest } from "./analysis-request.js";
import { deriveIngestionScope, type AnalyzerRequirement } from "./ingestion-scope.js";
import { assertNever, serviceFailure, type AnalysisServiceResult, type ServiceErrorCode } from "./result.js";

/**
 * Analysis requirements currently enabled.
 *
 * Empty in Milestone 2: no analyzer exists yet. This is the honest registry, not
 * a placeholder — scope derivation reads it, and it grows as analyzers land.
 */
export const ENABLED_ANALYSIS_REQUIREMENTS: readonly AnalyzerRequirement[] = [];

export interface AnalysisServiceDeps {
  readonly env: Env;
  readonly analyzers: readonly AnalyzerRequirement[];
  /**
   * Warcraft Logs identity preflight, injected as a port. The service holds no
   * transport of its own and cannot reach the network without it.
   */
  readonly preflight: PreflightPort;
}

/**
 * Author-written messages for every preflight outcome.
 *
 * Nothing upstream is interpolated: not a GraphQL error string, not a caught
 * exception, not an environment value. Any of those can carry a credential or
 * text we have not vetted.
 */
function describePreflightFailure(reason: WclFailureReason): {
  readonly code: ServiceErrorCode;
  readonly message: string;
} {
  switch (reason) {
    case "REPORT_NOT_ACCESSIBLE":
      return {
        code: "REPORT_NOT_ACCESSIBLE",
        message:
          "Warcraft Logs did not return that report. It may not exist, or it may be private. Only public and unlisted reports can be analyzed.",
      };
    case "FIGHT_NOT_FOUND":
      return { code: "FIGHT_NOT_FOUND", message: "That report does not contain the requested fight." };
    case "SOURCE_NOT_FOUND":
      return {
        code: "SOURCE_NOT_FOUND",
        message: "That report does not contain an actor with the requested source ID.",
      };
    case "SOURCE_NOT_A_PLAYER":
      return {
        code: "SOURCE_NOT_A_PLAYER",
        message:
          "The requested source ID belongs to a pet or NPC, not a player. Select the player on Warcraft Logs and copy the URL again.",
      };
    case "SOURCE_NOT_IN_FIGHT":
      return {
        code: "SOURCE_NOT_IN_FIGHT",
        message: "That player is in the report but did not participate in the requested fight.",
      };
    case "IDENTITY_UNRESOLVED":
      return {
        code: "IDENTITY_UNRESOLVED",
        message:
          "Warcraft Logs did not supply a complete identity (name, class and specialization) for that player, so the fight cannot be analyzed.",
      };
    case "UPSTREAM_DATA_INVALID":
      return {
        code: "UPSTREAM_DATA_INVALID",
        message: "Warcraft Logs returned a response that could not be trusted.",
      };
    case "UPSTREAM_AUTH_FAILED":
      return {
        code: "UPSTREAM_AUTH_FAILED",
        message: "Warcraft Logs rejected this deployment's API credentials.",
      };
    case "UPSTREAM_RATE_LIMITED":
      return {
        code: "UPSTREAM_RATE_LIMITED",
        message: "Warcraft Logs rate limit reached. Try again later.",
      };
    case "UPSTREAM_UNAVAILABLE":
      return { code: "UPSTREAM_UNAVAILABLE", message: "Warcraft Logs could not be reached." };
    case "CREDENTIALS_NOT_ENCODABLE":
      // A deployment problem, not an upstream one. Names no value.
      return {
        code: "CONFIGURATION_ERROR",
        message:
          "The service is not configured correctly. The configured Warcraft Logs credentials are unusable.",
      };
    default:
      return assertNever(reason);
  }
}

/**
 * Validates a request, resolves configuration, establishes factual Warcraft Logs
 * identity, and would then run analysis.
 *
 * The ordering is load-bearing. A malformed request or a misconfigured
 * deployment is diagnosed for its own reason rather than being masked by a
 * later failure — and preflight runs before the not-implemented boundary so a
 * bad report, fight or source ID is reported as such rather than as "analysis
 * is not implemented".
 *
 * Preflight deliberately runs even though no analyzer is enabled. Identity
 * metadata is a prerequisite to selecting an analyzer at all, and it is
 * scope-independent: derived ingestion scope governs how much combat-event
 * breadth is retrieved, which is a later milestone's concern.
 */
export async function analyzeFight(
  input: unknown,
  deps: AnalysisServiceDeps,
): Promise<AnalysisServiceResult> {
  const parsed = parseAnalysisRequest(input);
  if (!parsed.ok) {
    return serviceFailure("INVALID_REQUEST", "The analysis request was not valid.", parsed.issues);
  }

  const config = loadConfig(deps.env);
  if (!config.ok) {
    // Names only. Never the values, and never an indication of what was present.
    return serviceFailure(
      "CONFIGURATION_ERROR",
      `The service is not configured. Missing required configuration: ${config.missing.join(", ")}.`,
    );
  }

  const preflight = await deps.preflight(parsed.request, config.config.wcl);
  if (!preflight.ok) {
    const { code, message } = describePreflightFailure(preflight.failure.reason);
    return serviceFailure(code, message);
  }

  // Identity is established and available here for the analysis boundary that
  // later milestones add. It is deliberately not returned to the caller: M2
  // produces no analysis output, and an identity echo would be the first step
  // toward a report that reads as one.
  const scope = deriveIngestionScope(deps.analyzers);
  if (!scope.ok) {
    return serviceFailure(
      "ANALYSIS_NOT_IMPLEMENTED",
      "Warcraft Logs connectivity and player identity were verified for this request, but gameplay analysis is not implemented yet. This deployment is a Milestone 2 foundation: no analyzer is enabled, so no combat events are retrieved and no coaching is produced.",
    );
  }

  // Milestone 3 onwards: retrieve combat events at `scope.scope`, normalize,
  // evaluate.
  return serviceFailure(
    "ANALYSIS_NOT_IMPLEMENTED",
    "Warcraft Logs connectivity and player identity were verified for this request, but gameplay analysis is not implemented yet. This deployment is a Milestone 2 foundation.",
  );
}
