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
 * Preflight deliberately runs even though the route invokes no analyzer.
 * Identity metadata is a prerequisite to selecting an analyzer at all, and it is
 * scope-independent: derived ingestion scope governs how much combat-event
 * breadth is retrieved, which is a later milestone's concern.
 *
 * THE M5-E WIRING DECISION, AND WHY IT WENT THIS WAY
 *
 * Milestone 5 finished an internal Assassination authority analyzer:
 * `analyzeObservedAssassinationDecisions` compares observed rotational decisions
 * against the pinned SimulationCraft APL and discloses its own coverage. It is
 * regression-tested against real Warcraft Logs evidence.
 *
 * This route still does not invoke it. Doing so needs the M2 -> M3 -> M5
 * composition that does not exist yet — event retrieval at the derived scope,
 * normalization, actor and specialization resolution carried from preflight into
 * the analyzer, and a deliberately small public projection of the result. That
 * is an integration milestone, not a line of glue, and shipping a hasty version
 * of it would expose internal trace types as a public contract.
 *
 * So the endpoint keeps returning 501 — but the MESSAGE no longer says no
 * analyzer exists, because that stopped being true. Claiming less capability
 * than exists is a smaller error than claiming more, and both are avoidable.
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
      "Warcraft Logs connectivity and player identity were verified for this request, but no combat events were retrieved because no analyzer is registered to declare an ingestion scope. A Milestone 5 rotational authority analyzer is implemented internally and regression-tested; this endpoint is not yet wired to invoke it, so analysis is not implemented here and nothing is produced.",
    );
  }

  // The remaining wiring: retrieve combat events at `scope.scope`, normalize
  // them, resolve the actor and specialization from preflight, and call
  // `analyzeObservedAssassinationDecisions`. Deliberately not done here — see
  // the M5-E wiring decision above.
  return serviceFailure(
    "ANALYSIS_NOT_IMPLEMENTED",
    "Warcraft Logs connectivity and player identity were verified for this request. A Milestone 5 rotational authority analyzer is implemented internally and regression-tested, but this endpoint is not yet wired to invoke it, so analysis is not implemented here. External exposure is owned by a later integration milestone.",
  );
}
