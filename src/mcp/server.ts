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
 * THE TOOL SURFACE IS ONE TOOL
 *
 * `analyze_warcraft_log`, and nothing else. No aura lookup, no resource query,
 * no APL evaluator, no state inspector. Those would hand a model the raw
 * materials to assemble its own verdict, which is exactly the free-form
 * gameplay interpretation this milestone exists to replace. The composed,
 * coverage-disclosed analysis is the product.
 *
 * STATELESS, DELIBERATELY
 *
 * MCP 2026-07-28 is a stateless protocol: requests are self-contained and
 * capabilities are negotiated per request. So there is no session store, no
 * Durable Object, no KV, no event replay and no server-to-client push.
 *
 * WHY THE HANDLER IS NOW BUILT PER REQUEST
 *
 * M6-A could hold one module-level handler because its probe read nothing. The
 * real tool needs request-scoped dependencies — the application runner and the
 * rate limiter binding both come from `env` — and putting `env` in module scope
 * would share one request's environment with every later request. So the
 * handler is constructed per request over an explicitly injected dependency
 * object. The SDK still builds a fresh `McpServer` per request from the factory,
 * and nothing is cached between calls.
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
import type { RateLimiterPort } from "../runtime/rate-limit.js";
import {
  registerAnalyzeWarcraftLogTool,
  type AnalysisRunner,
  type AnalyzeToolDeps,
  type PublicSpecializationDescriptions,
} from "./tools/analyze-warcraft-log.js";
import { registerAnalyzeRaidNightTool, type RaidNightToolDeps } from "./tools/analyze-raid-night.js";
import {
  registerAnalyzeEncounterContextTool,
  type EncounterContextToolDeps,
} from "./tools/analyze-encounter-context.js";
import type { RaidNightRunner } from "../services/raid-night-runner.js";
import type { EncounterContextRunner } from "../services/encounter-context-runner.js";

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
 * The runner used when no composition has been supplied.
 *
 * FAIL-CLOSED, AND NOW UNREACHABLE IN PRODUCTION. The Worker binds the shared
 * production runner at its composition root, so this exists only for a caller
 * that constructs the handler without one. It reports an internal error rather
 * than analysing, because a handler with no analysis path is a wiring defect —
 * not a condition a user should be asked to interpret.
 */
const UNBOUND_ANALYSIS_RUNNER: AnalysisRunner = async () => ({
  ok: false,
  error: {
    code: "INTERNAL_ERROR",
    message: "No analysis runner is bound to this MCP handler.",
  },
});

/** The same fail-closed sentinel for the raid-night path, for the same reason. */
const UNBOUND_RAID_NIGHT_RUNNER: RaidNightRunner = async () => ({
  ok: false,
  error: {
    code: "INTERNAL_ERROR",
    message: "No raid-night runner is bound to this MCP handler.",
  },
});

const UNBOUND_ENCOUNTER_CONTEXT_RUNNER: EncounterContextRunner = async () => ({
  ok: false,
  error: {
    code: "INTERNAL_ERROR",
    message: "No encounter-context runner is bound to this MCP handler.",
  },
});

/**
 * The same fail-closed sentinel for the tool descriptions' supported-
 * specialization sentence (M11-A1).
 *
 * The real sentence is DERIVED from the production analyzer catalog and
 * bound at the composition root, like the runners: this layer imports no
 * registry and cannot compute it. A handler constructed without one gets a
 * sentence that says so, rather than a hand-written list that could name a
 * specialization the dispatcher does not select. The production `tools/list`
 * is pinned by test to carry the derived sentence, so a composition root that
 * forgot to bind it fails there, not in a client.
 */
const UNBOUND_PUBLIC_SPECIALIZATIONS: PublicSpecializationDescriptions = Object.freeze({
  sentence: "Supported specializations: none are bound to this MCP handler (composition defect).",
  limits: Object.freeze([]),
});

export interface McpRequestOptions {
  /** Overridable so a test can prove rejection without weakening the real list. */
  readonly allowedHostnames?: readonly string[];
  /**
   * The application entry point.
   *
   * Injected by the composition root rather than imported here, which is what
   * keeps this layer free of the Warcraft Logs client and the analyzer while
   * still reaching exactly one shared analysis path.
   */
  readonly analyze?: AnalysisRunner | undefined;
  /**
   * The raid-night entry point.
   *
   * Injected the same way and for the same reason. REST receives this identical
   * function from the same composition root, which is what makes the REST/MCP
   * equality proof meaningful.
   */
  readonly analyzeRaidNight?: RaidNightRunner | undefined;
  /**
   * The encounter-context entry point.
   *
   * Bound at the composition root exactly like the other two, so all three tools
   * reach runners this layer cannot build for itself.
   */
  readonly analyzeEncounterContext?: EncounterContextRunner | undefined;
  /** Overridable so a test can drive allow/deny/throw deterministically. */
  readonly rateLimiter?: RateLimiterPort | undefined;
  /**
   * The derived "Supported specializations: …" sentence for the tool
   * descriptions. Bound at the composition root from the production catalog;
   * absent only in tests that do not read descriptions.
   */
  readonly publicSpecializations?: PublicSpecializationDescriptions | undefined;
}

/** Everything the registered tools need. One object, both tools. */
export type McpToolDeps = AnalyzeToolDeps & RaidNightToolDeps & EncounterContextToolDeps;

/**
 * Builds one server instance for one request.
 *
 * Exported so a test can inspect the registered surface without driving HTTP.
 * Every call returns a new instance; there is no shared singleton to leak
 * between requests.
 */
export function createMcpServerInstance(deps: McpToolDeps): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });
  // Exactly three real analysis tools. No ping, no primitive state queries, no
  // rankings search: a tool that exposed an M4 query or a raw ranking board would
  // invite a client to assemble its own analysis from parts, which is a second
  // analyzer wearing a client's clothes.
  registerAnalyzeWarcraftLogTool(server, deps);
  registerAnalyzeRaidNightTool(server, deps);
  registerAnalyzeEncounterContextTool(server, deps);
  return server;
}

function createHandler(deps: McpToolDeps) {
  return createMcpHandler(() => createMcpServerInstance(deps), {
    // 2025-era clients are served statelessly from the same factory rather than
    // rejected. Stated explicitly even though it is the default, because "which
    // clients can talk to us" is a deployment fact and should not be implied.
    legacy: "stateless",
    // Never stream. This tool emits no progress and no logging notifications
    // before its result, so `auto` could only ever pick JSON anyway — pinning it
    // keeps the response shape one thing instead of two.
    responseMode: "json",
  });
}

/**
 * Media types this transport always emits as UTF-8.
 *
 * JSON is UTF-8 by definition (RFC 8259 §8.1) and Server-Sent Events are UTF-8
 * by definition too. Matching on the media type alone — never on the body —
 * because this function may only describe bytes, never change them.
 */
const UTF8_MEDIA_TYPES = /^(?:text\/|application\/json\b|application\/[\w.+-]+\+json\b)/i;

/**
 * Declares `charset=utf-8` on the way out, when the response has not already.
 *
 * WHY THIS EXISTS — A REAL PRODUCTION DEFECT, NOT A TIDY-UP
 *
 * The M7-F production smoke found the roster name `Dìssar` arriving through MCP
 * as `DÃ¬ssar`, while REST delivered it intact. The Worker was never at fault for
 * the bytes: both transports emit the same correct UTF-8 (`44 c3 ac …`). The
 * difference was one header. REST answers `application/json; charset=utf-8`; the
 * MCP SDK answers `application/json` with no charset parameter.
 *
 * JSON without a charset parameter IS UTF-8, but HTTP's own legacy default for a
 * text response is ISO-8859-1, and real clients still apply it — PowerShell 5.1's
 * `Invoke-WebRequest`/`Invoke-RestMethod` among them. Such a client decodes
 * `c3 ac` as two Latin-1 characters and renders `Ã¬`. That is classic mojibake,
 * and the server is what failed to prevent it: we knew the encoding and did not
 * say so.
 *
 * WHAT THIS FUNCTION IS CAREFUL NOT TO DO
 *
 * It does not touch the body. `response.body` is passed through by reference, so
 * no re-encoding, no buffering and no decode/encode round trip happens here —
 * which is important, because a round trip is exactly the kind of operation that
 * CAUSES this class of bug. It adds no charset to a media type it has no business
 * claiming is UTF-8, and it never overwrites a charset the SDK chose.
 *
 * Applied at the one exit from this module, so tool results, protocol errors,
 * host/origin rejections and auth challenges are all covered by one rule.
 */
function withDeclaredCharset(response: Response): Response {
  const contentType = response.headers.get("content-type");
  if (contentType === null) return response;
  if (!UTF8_MEDIA_TYPES.test(contentType.trim())) return response;
  if (/;\s*charset=/i.test(contentType)) return response;

  const headers = new Headers(response.headers);
  headers.set("content-type", `${contentType}; charset=utf-8`);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
 * THE RATE LIMITER IS NOT IN THIS LIST, ON PURPOSE. It guards the expensive
 * tool, not the endpoint, so it runs inside the tool call after the SDK has
 * validated arguments. Metering here instead would spend analysis quota on
 * `tools/list`, on discovery, and on calls the SDK is about to reject — none of
 * which cost a Warcraft Logs API point.
 *
 * Each guard answers with its own `Response` or yields. Nothing downstream runs
 * until all three have passed.
 *
 * Every response leaving here — guard or tool result — passes through
 * `withDeclaredCharset`, so the encoding is declared exactly once, in one place.
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
    (await mcpAuthChallenge(request, env.ANALYSIS_AUTH_TOKEN));
  if (rejected !== undefined) return withDeclaredCharset(rejected);

  const handler = createHandler({
    analyze: options.analyze ?? UNBOUND_ANALYSIS_RUNNER,
    analyzeRaidNight: options.analyzeRaidNight ?? UNBOUND_RAID_NIGHT_RUNNER,
    analyzeEncounterContext: options.analyzeEncounterContext ?? UNBOUND_ENCOUNTER_CONTEXT_RUNNER,
    // A deployment missing the binding is unmetered, and the tool treats that
    // as a refusal rather than as permission.
    rateLimiter: options.rateLimiter ?? env.ANALYSIS_RATE_LIMITER,
    publicSpecializations: options.publicSpecializations ?? UNBOUND_PUBLIC_SPECIALIZATIONS,
  });

  // `fetch` is called with no `authInfo`: see `./auth.ts` for why the static
  // token is deliberately not surfaced to tools.
  return withDeclaredCharset(await handler.fetch(request));
}
