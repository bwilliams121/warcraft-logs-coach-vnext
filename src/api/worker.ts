/**
 * Cloudflare Worker entry point.
 *
 * The API layer handles transport only: routing, JSON decoding, and response
 * formatting. It holds no gameplay logic and performs no validation of meaning —
 * semantic validation belongs to the application service, so every interface
 * gets identical answers.
 */

import type { Env } from "../config/env.js";
import {
  analyzeFight,
  ENABLED_ANALYSIS_REQUIREMENTS,
  type AnalysisServiceDeps,
} from "../services/analysis-service.js";
import type { AnalysisServiceResult } from "../services/result.js";
import type { AnalyzerRequirement } from "../services/ingestion-scope.js";
import { apiErrorResponse, jsonResponse, serviceResultResponse } from "./responses.js";

/** Kept in step with package.json manually; there is no JSON import at the edge. */
const SERVICE_VERSION = "0.1.0";

const HEALTH_PATH = "/health";
const ANALYSIS_PATH = "/v1/analysis";

export interface WorkerDeps {
  readonly analyze: (input: unknown, deps: AnalysisServiceDeps) => AnalysisServiceResult;
  readonly analyzers: readonly AnalyzerRequirement[];
  readonly version: string;
}

/**
 * The handler contract.
 *
 * Declared over a plain `Request` rather than `ExportedHandler<Env>`'s inbound
 * request type, because this layer reads only `url`, `method` and the body. It
 * never touches `request.cf`, and widening the parameter lets tests drive the
 * handler with an ordinary `new Request(...)`. The `satisfies` check on the
 * default export still proves the module is a valid Worker entrypoint.
 */
export interface WorkerHandler {
  readonly fetch: (request: Request, env: Env) => Promise<Response>;
}

const DEFAULT_DEPS: WorkerDeps = {
  analyze: analyzeFight,
  analyzers: ENABLED_ANALYSIS_REQUIREMENTS,
  version: SERVICE_VERSION,
};

function methodNotAllowed(allowed: string): Response {
  return apiErrorResponse("METHOD_NOT_ALLOWED", `Method not allowed. Expected ${allowed}.`, {
    headers: { allow: allowed },
  });
}

async function handleAnalysis(request: Request, env: Env, deps: WorkerDeps): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiErrorResponse("INVALID_REQUEST", "Request body must be valid JSON.");
  }

  const result = deps.analyze(body, { env, analyzers: deps.analyzers });
  return serviceResultResponse(result);
}

/**
 * Builds a Worker handler. Dependencies are injected as one plain object, which
 * is what lets a test prove the API delegates rather than computes.
 */
export function createWorker(deps: WorkerDeps = DEFAULT_DEPS): WorkerHandler {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      try {
        const { pathname } = new URL(request.url);

        if (pathname === HEALTH_PATH) {
          if (request.method !== "GET" && request.method !== "HEAD") {
            return methodNotAllowed("GET");
          }
          // Liveness only. Deliberately discloses nothing about configuration.
          return jsonResponse(200, {
            status: "ok",
            version: deps.version,
            environment: env.ENVIRONMENT ?? "unknown",
          });
        }

        if (pathname === ANALYSIS_PATH) {
          if (request.method !== "POST") {
            return methodNotAllowed("POST");
          }
          return await handleAnalysis(request, env, deps);
        }

        return apiErrorResponse("NOT_FOUND", "No such endpoint.");
      } catch {
        // Never surface the thrown value: it can carry configuration or
        // credential data that must not leave the backend.
        return apiErrorResponse("INTERNAL_ERROR", "An unexpected internal error occurred.");
      }
    },
  };
}

export default createWorker() satisfies ExportedHandler<Env>;
