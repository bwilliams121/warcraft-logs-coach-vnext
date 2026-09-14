/**
 * The MCP server surface.
 *
 * WHAT THIS LAYER IS
 *
 * Transport. It accepts an HTTP request at `/mcp`, decides whether the caller is
 * allowed to be here, and hands the rest to the MCP SDK. It holds no gameplay
 * logic, and it is structurally prevented from acquiring any: this module and
 * everything under `src/mcp/` import nothing from `src/specs/`, `src/engine/` or
 * the Warcraft Logs client. A regression test asserts that, because "MCP must
 * not become a second analyzer" is only a guarantee if something checks it.
 *
 * M6-A SCOPE
 *
 * The only tool registered is the temporary `ping` probe. The analysis service
 * is NOT wired here — M6-A proves the transport works, and M6-D introduces
 * `analyze_warcraft_log`. Nothing in this file reaches an analyzer today.
 *
 * STATELESS, DELIBERATELY
 *
 * MCP 2026-07-28 is a stateless protocol: requests are self-contained and
 * capabilities are negotiated per request. So there is no session store, no
 * Durable Object, no KV, no event replay and no server-to-client push. The
 * handler is created once at module scope because it holds no request state and
 * no environment — only the FACTORY, which the SDK invokes to build a fresh
 * `McpServer` for every single request. That is the shape the SDK documents for
 * Workers (`export default handler`), and it is why a module-level handler is
 * safe here while a module-level `env` or server instance would not be.
 *
 * OUTSTANDING BEFORE THE REAL TOOL SHIPS — RATE LIMITING
 *
 * The MCP 2026-07-28 tools security requirements state that servers MUST rate
 * limit tool invocations. This endpoint does NOT rate limit today, and M6-A is
 * not deployed, so nothing is currently exposed.
 *
 * That is acceptable only for as long as the sole tool is a constant-returning
 * probe. `analyze_warcraft_log` is a different proposition: each call spends
 * finite Warcraft Logs API points and real Worker CPU, so an unmetered caller
 * can exhaust a shared quota this deployment cannot replenish on demand.
 *
 * THEREFORE: a real rate-limit mechanism is a REQUIRED part of M6-D/M6-E and a
 * precondition for deploying the analysis tool. The leading candidate is
 * Cloudflare's native Worker Rate Limiting binding, which would add the first
 * binding this Worker has needed — so the M6 definition of done must NOT claim
 * that no additional binding can ever be required.
 */

import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  McpServer,
  originValidationResponse,
} from "@modelcontextprotocol/server";

import type { Env } from "../config/env.js";
import { mcpAuthChallenge } from "./auth.js";
import { registerPingTool } from "./tools/ping.js";

/** Advertised in `initialize`. Kept in step with package.json by hand, as the Worker version is. */
export const MCP_SERVER_NAME = "warcraft-logs-coach-vnext";
export const MCP_SERVER_VERSION = "0.1.0";

/** The deployed Worker. Named explicitly rather than derived from the request. */
export const PRODUCTION_MCP_HOSTNAME = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";

/**
 * Hostnames this endpoint will answer to.
 *
 * The production Worker plus the localhost class the SDK defines
 * (`localhost`, `127.0.0.1`, `[::1]`) for `wrangler dev`. Deliberately NOT `*`:
 * the Host check is DNS-rebinding protection, and an allowlist that accepts
 * everything provides none.
 */
export function mcpAllowedHostnames(): readonly string[] {
  return [PRODUCTION_MCP_HOSTNAME, ...localhostAllowedHostnames()];
}

/**
 * Builds one server instance for one request.
 *
 * Exported so a test can inspect the registered surface without driving HTTP.
 * Every call returns a new instance; there is no shared singleton to leak
 * between requests.
 */
export function createMcpServerInstance(): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });
  // M6-A only. Removed in M6-D together with `./tools/ping.ts`.
  registerPingTool(server);
  return server;
}

const handler = createMcpHandler(() => createMcpServerInstance(), {
  // 2025-era clients are served statelessly from the same factory rather than
  // rejected. Stated explicitly even though it is the default, because "which
  // clients can talk to us" is a deployment fact and should not be implied.
  legacy: "stateless",
  // Never stream. This tool emits no progress and no logging notifications
  // before its result, so `auto` could only ever pick JSON anyway — pinning it
  // keeps the response shape one thing instead of two.
  responseMode: "json",
});

export interface McpRequestOptions {
  /** Overridable so a test can prove rejection without weakening the real list. */
  readonly allowedHostnames?: readonly string[];
}

/**
 * Serves one `/mcp` request.
 *
 * ORDER IS LOAD-BEARING.
 *
 *   1. Host    — DNS-rebinding protection. Runs first, and before authorization,
 *                so a request carrying a valid token from a rebound origin is
 *                still refused. Auth-first would let a stolen token bypass the
 *                very check that exists to contain it.
 *   2. Origin  — browser-origin containment. An ABSENT `Origin` passes, which is
 *                correct and not an oversight: ordinary MCP clients are not
 *                browsers and send none. Only a browser's declared origin is
 *                checked, and an unparseable or opaque `null` origin is refused.
 *   3. Bearer  — who may call at all.
 *
 * Each guard answers with its own `Response` or yields. Nothing downstream runs
 * until all three have passed.
 */
export async function handleMcpRequest(
  request: Request,
  env: Env,
  options: McpRequestOptions = {},
): Promise<Response> {
  const allowed = [...(options.allowedHostnames ?? mcpAllowedHostnames())];

  const rejected =
    hostHeaderValidationResponse(request, allowed) ??
    originValidationResponse(request, allowed) ??
    (await mcpAuthChallenge(request, env.MCP_AUTH_TOKEN));

  // `fetch` is called with no `authInfo`: see `./auth.ts` for why the static
  // token is deliberately not surfaced to tools.
  return rejected ?? (await handler.fetch(request));
}
