/**
 * Application service — the single analysis entry point.
 *
 * Every interface (REST today, MCP or an addon handoff later) calls this. None
 * of them may contain a separate analyzer.
 *
 * This module is use-case orchestration only. It contains no gameplay rules and
 * no Cloudflare-specific types, so it runs under a plain Node test project with
 * no Workers runtime present.
 *
 * Milestone 1 is foundation only. Gameplay analysis is not implemented, and this
 * service says so explicitly rather than returning an empty-looking success.
 */

import { loadConfig, type Env } from "../config/env.js";
import { parseAnalysisRequest } from "./analysis-request.js";
import { deriveIngestionScope, type AnalyzerRequirement } from "./ingestion-scope.js";
import { serviceFailure, type AnalysisServiceResult } from "./result.js";

/**
 * Analysis requirements currently enabled.
 *
 * Empty in Milestone 1: no analyzer exists yet. This is the honest registry, not
 * a placeholder — scope derivation reads it, and it grows as analyzers land.
 */
export const ENABLED_ANALYSIS_REQUIREMENTS: readonly AnalyzerRequirement[] = [];

export interface AnalysisServiceDeps {
  readonly env: Env;
  readonly analyzers: readonly AnalyzerRequirement[];
}

/**
 * Validates a request, resolves configuration, derives the required ingestion
 * scope, and would then run analysis.
 *
 * The ordering is itself load-bearing: a genuinely malformed request is rejected
 * for the right reason rather than being masked by the Milestone 1 placeholder.
 */
export function analyzeFight(input: unknown, deps: AnalysisServiceDeps): AnalysisServiceResult {
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

  const scope = deriveIngestionScope(deps.analyzers);
  if (!scope.ok) {
    return serviceFailure(
      "ANALYSIS_NOT_IMPLEMENTED",
      "Gameplay analysis is not implemented yet. This deployment is a Milestone 1 foundation: no analyzer is enabled, so no fight data is retrieved and no coaching is produced.",
    );
  }

  // Milestone 2 onwards: retrieve at `scope.scope`, normalize, evaluate.
  return serviceFailure(
    "ANALYSIS_NOT_IMPLEMENTED",
    "Gameplay analysis is not implemented yet. This deployment is a Milestone 1 foundation.",
  );
}
