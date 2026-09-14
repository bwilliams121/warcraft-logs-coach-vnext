/**
 * Cloudflare Worker entry point.
 *
 * The API layer handles transport only: routing, JSON decoding, and response
 * formatting. It holds no gameplay logic and performs no validation of meaning —
 * semantic validation belongs to the application service, so every interface
 * gets identical answers.
 */

import type { Env } from "../config/env.js";
import { handleMcpRequest } from "../mcp/server.js";
import { analyzeFight, type AnalysisServiceDeps } from "../services/analysis-service.js";
import type { AnalysisServiceResult } from "../services/result.js";
import { wclPreflight } from "../wcl/preflight.js";
import type { PreflightPort } from "../wcl/types.js";
import { apiErrorResponse, jsonResponse, serviceResultResponse } from "./responses.js";

/** Kept in step with package.json manually; there is no JSON import at the edge. */
const SERVICE_VERSION = "0.1.0";

const HEALTH_PATH = "/health";
const ANALYSIS_PATH = "/v1/analysis";
const MCP_PATH = "/mcp";

export interface WorkerDeps {
  readonly analyze: (input: unknown, deps: AnalysisServiceDeps) => Promise<AnalysisServiceResult>;
  /**
   * Passed through to the service untouched. The API layer never calls it: it
   * holds the port only so tests can substitute one, which is also what proves
   * the route issues no Warcraft Logs queries of its own.
   */
  readonly preflight: PreflightPort;
  /**
   * Serves `/mcp`.
   *
   * Injected like every other dependency so a test can substitute it, which is
   * also what proves this layer only dispatches: the API holds no MCP types, no
   * tool definitions and no JSON-RPC knowledge of its own.
   */
  readonly mcp: (request: Request, env: Env) => Promise<Response>;
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
  preflight: wclPreflight,
  mcp: handleMcpRequest,
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

  const result = await deps.analyze(body, {
    env,
    preflight: deps.preflight,
  });
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

        if (pathname === MCP_PATH) {
          // No method gate here on purpose. Streamable HTTP assigns its own
          // meaning to GET and DELETE, and the MCP handler answers them
          // correctly for a stateless endpoint. A gate of ours would either
          // duplicate that or contradict it.
          return await deps.mcp(request, env);
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
