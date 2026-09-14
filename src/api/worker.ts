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
import { createProductionAnalysisRunner } from "../runtime/analysis-composition.js";
import { UNAUTHORIZED_MESSAGE, verifyAnalysisBearer } from "../runtime/bearer-auth.js";
import { checkAnalysisRateLimit, type RateLimiterPort } from "../runtime/rate-limit.js";
import type { AnalysisRunner } from "../services/analysis-runner.js";
import { apiErrorResponse, jsonResponse, serviceResultResponse } from "./responses.js";

/** Kept in step with package.json manually; there is no JSON import at the edge. */
const SERVICE_VERSION = "0.1.0";

const HEALTH_PATH = "/health";
const ANALYSIS_PATH = "/v1/analysis";
const MCP_PATH = "/mcp";

export interface WorkerDeps {
  /**
   * The one shared analysis path.
   *
   * REST and MCP both receive THIS function. That is the M6-E invariant: a
   * second composition could disagree with the first about the same fight while
   * both looked correct, and the consistency tests would then be comparing two
   * implementations rather than two renderings of one result.
   *
   * Built per request from `env`, because the production runner binds a
   * per-request OAuth token cache.
   */
  readonly analysisRunner: (env: Env) => AnalysisRunner;
  /**
   * The shared analysis budget.
   *
   * Resolved from `env` so a test can substitute one instance across both
   * transports and prove they charge the same counter.
   */
  readonly rateLimiter: (env: Env) => RateLimiterPort | undefined;
  /**
   * Serves `/mcp`.
   *
   * Injected like every other dependency so a test can substitute it, which is
   * also what proves this layer only dispatches: the API holds no MCP types, no
   * tool definitions and no JSON-RPC knowledge of its own.
   */
  readonly mcp: (request: Request, env: Env, deps: WorkerDeps) => Promise<Response>;
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

/**
 * Serves `/mcp` over the same runner and the same limiter REST uses.
 *
 * The composition happens HERE, at the composition root, not inside `src/mcp/`.
 * That is what lets the MCP layer reach exactly one shared analysis path while
 * importing no Warcraft Logs client and no analyzer — it receives functions,
 * not the machinery behind them.
 */
const defaultMcp: WorkerDeps["mcp"] = async (request, env, deps) =>
  await handleMcpRequest(request, env, {
    analyze: deps.analysisRunner(env),
    rateLimiter: deps.rateLimiter(env),
  });

const DEFAULT_DEPS: WorkerDeps = {
  analysisRunner: createProductionAnalysisRunner,
  rateLimiter: (env) => env.ANALYSIS_RATE_LIMITER,
  mcp: defaultMcp,
  version: SERVICE_VERSION,
};

function methodNotAllowed(allowed: string): Response {
  return apiErrorResponse("METHOD_NOT_ALLOWED", `Method not allowed. Expected ${allowed}.`, {
    headers: { allow: allowed },
  });
}

/**
 * Serves `POST /v1/analysis`.
 *
 * ORDER IS LOAD-BEARING, AND AUTHENTICATION COMES FIRST.
 *
 *   1. Bearer  — who may spend analysis capacity at all.
 *   2. Body    — is this even a request.
 *   3. Meter   — how fast an authorized caller may spend it.
 *   4. Runner  — the one shared analysis path.
 *
 * AUTHENTICATION BEFORE METERING, NOT AFTER. The Cloudflare rate-limit binding
 * is a per-location brake, not an access-control boundary — its counters are
 * local to each Cloudflare location and eventually consistent, so "10 / 60s" is
 * not a global quota. Metering an anonymous caller would still let the open
 * Internet spend a paid Warcraft Logs quota, just more slowly and from more
 * places at once. So an unauthorized request consumes no budget, reaches no
 * runner, and performs no Warcraft Logs work.
 *
 * `/mcp` requires the SAME credential. One private principal, two surfaces —
 * neither is the cheap way in.
 *
 * `/health` is deliberately NOT behind this gate: it discloses nothing and
 * costs nothing, and an unreachable liveness check helps no one.
 *
 * A semantically invalid request DOES consume one attempt, because deciding it
 * is invalid means asking `parseAnalysisRequest`, which lives inside the
 * service. Duplicating the parser out here to avoid the charge would create a
 * second authority on what a valid request is — a far worse trade than one
 * attempt spent by an already-authenticated caller.
 */
async function handleAnalysis(request: Request, env: Env, deps: WorkerDeps): Promise<Response> {
  if ((await verifyAnalysisBearer(request, env.ANALYSIS_AUTH_TOKEN)) === "UNAUTHORIZED") {
    // One fixed answer for every failure — absent header, wrong scheme, wrong
    // token, unconfigured server. A caller learns it is not authorized and
    // nothing else.
    return apiErrorResponse("UNAUTHORIZED", UNAUTHORIZED_MESSAGE, {
      headers: { "www-authenticate": "Bearer" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiErrorResponse("INVALID_REQUEST", "Request body must be valid JSON.");
  }

  const decision = await checkAnalysisRateLimit(deps.rateLimiter(env));
  if (decision === "DENIED") {
    return apiErrorResponse(
      "RATE_LIMITED",
      "Too many analysis requests. Retry later. This limit protects a shared Warcraft Logs API quota.",
    );
  }
  if (decision === "UNAVAILABLE") {
    // Fail closed: an undecided limiter must not become unmetered access to a
    // paid, finite quota.
    return apiErrorResponse(
      "RATE_LIMITER_UNAVAILABLE",
      "The analysis rate limiter is unavailable, so this request was refused rather than run unmetered. Try again later.",
    );
  }

  return serviceResultResponse(await deps.analysisRunner(env)(body));
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
          return await deps.mcp(request, env, deps);
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
