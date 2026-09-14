/**
 * Who may spend analysis capacity.
 *
 * WHY THIS FILE EXISTS
 *
 * Until this correction, `/v1/analysis` was anonymous and its only protection
 * was the Cloudflare rate-limit binding. That was not enough: Cloudflare's
 * Worker Rate Limiting counters are local to each Cloudflare location and
 * eventually consistent, so "10 / 60s" is a per-location brake rather than a
 * global quota — and a brake is not a door. An anonymous caller could still
 * spend someone else's paid Warcraft Logs quota, just from more places at once.
 *
 * So both analysis surfaces now require the same bearer credential, and this
 * file proves three things:
 *
 *   1. the gate rejects everything it should, identically
 *   2. an unauthorized request costs nothing — no limiter charge, no runner,
 *      no Warcraft Logs work
 *   3. ONE credential authorizes both transports, so neither is the cheap way in
 *
 * WHAT THIS IS NOT
 *
 * Not OAuth, not multi-user identity, not the final public authorization
 * design. A single shared static secret for a single-tenant private deployment.
 */

import { describe, expect, it, vi } from "vitest";

import { createWorker } from "../../src/api/worker.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { analyzeFight } from "../../src/services/analysis-service.js";
import type { AnalysisRunner } from "../../src/services/analysis-runner.js";
import type { Env } from "../../src/config/env.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import type { PreflightPort } from "../../src/wcl/types.js";
import {
  ANALYSIS_TEST_TOKEN,
  D2_REQUEST,
  MCP_TEST_ENV,
  countingLimiter,
  fixtureAnalysisRunner,
  workerDepsFor,
} from "../support/analysis-transports.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";

const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "auth-test", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

let nextId = 1;

/** A REST analysis request carrying whatever authorization the case supplies. */
function restRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://coach.test/v1/analysis", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(D2_REQUEST),
  });
}

/** An MCP tool call carrying whatever authorization the case supplies. */
function mcpRequest(headers: Record<string, string> = {}): Request {
  return new Request(`https://${HOST}/mcp`, {
    method: "POST",
    headers: {
      host: HOST,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-method": "tools/call",
      "mcp-name": ANALYZE_TOOL_NAME,
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: { name: ANALYZE_TOOL_NAME, arguments: { source: "ids", ...D2_REQUEST }, _meta: MODERN_META },
    }),
  });
}

/**
 * The rejections the gate must produce, and produce identically.
 *
 * Every one returns the same status and the same body: a caller learns it is
 * not authorized and nothing else — not whether a secret is configured, not how
 * long the real one is, not how close it came.
 */
const REJECTED: readonly { readonly name: string; readonly headers: Record<string, string> }[] = [
  { name: "no Authorization header at all", headers: {} },
  { name: "an empty bearer token", headers: { authorization: "Bearer " } },
  { name: "a wrong bearer token", headers: { authorization: "Bearer not-the-configured-token" } },
  { name: "a prefix of the real token", headers: { authorization: "Bearer fake-analysis" } },
  {
    name: "the right token under the wrong scheme",
    headers: { authorization: `Basic ${ANALYSIS_TEST_TOKEN}` },
  },
  { name: "a bare token with no scheme", headers: { authorization: ANALYSIS_TEST_TOKEN } },
];

describe("REST analysis requires the bearer credential", () => {
  for (const testCase of REJECTED) {
    it(`rejects ${testCase.name} with 401`, async () => {
      const response = await createWorker(workerDepsFor({ analyze: fixtureAnalysisRunner() })).fetch(
        restRequest(testCase.headers),
        MCP_TEST_ENV,
      );

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
    });
  }

  it("accepts the configured credential", async () => {
    const response = await createWorker(workerDepsFor({ analyze: fixtureAnalysisRunner() })).fetch(
      restRequest({ authorization: `Bearer ${ANALYSIS_TEST_TOKEN}` }),
      MCP_TEST_ENV,
    );

    expect(response.status).toBe(200);
  });

  it("rejects every request when no credential is configured, rather than opening up", async () => {
    // The deploy-time failure mode: the secret is missing and the expensive
    // endpoint silently becomes public. An unset token must close the door, not
    // remove it.
    const unconfigured: Env = { ENVIRONMENT: "test", WCL_CLIENT_ID: "id", WCL_CLIENT_SECRET: "secret" };
    const response = await createWorker(workerDepsFor({ analyze: fixtureAnalysisRunner() })).fetch(
      restRequest({ authorization: `Bearer ${ANALYSIS_TEST_TOKEN}` }),
      unconfigured,
    );

    expect(response.status).toBe(401);
  });

  it("gives an identical answer for a wrong token and an unconfigured server", async () => {
    // Differing responses would tell a prober whether the deployment has a
    // credential set at all — information they have no other way to obtain.
    const worker = createWorker(workerDepsFor({ analyze: fixtureAnalysisRunner() }));

    const wrongToken = await worker.fetch(
      restRequest({ authorization: "Bearer definitely-not-the-token" }),
      MCP_TEST_ENV,
    );
    const unconfigured = await worker.fetch(restRequest({ authorization: `Bearer ${ANALYSIS_TEST_TOKEN}` }), {
      ENVIRONMENT: "test",
    });

    expect(wrongToken.status).toBe(unconfigured.status);
    expect(await wrongToken.text()).toBe(await unconfigured.text());
  });

  it("discloses neither the supplied nor the configured token", async () => {
    const response = await createWorker(workerDepsFor({ analyze: fixtureAnalysisRunner() })).fetch(
      restRequest({ authorization: "Bearer SENTINEL_SUPPLIED_TOKEN_DO_NOT_ECHO" }),
      MCP_TEST_ENV,
    );
    const raw = await response.text();

    expect(raw).not.toContain("SENTINEL_SUPPLIED_TOKEN_DO_NOT_ECHO");
    expect(raw).not.toContain(ANALYSIS_TEST_TOKEN);
    // The challenge header names the scheme, never the credential.
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });
});

describe("an unauthorized request costs nothing", () => {
  it("does not charge the analysis budget", async () => {
    // The point of authenticating BEFORE metering. Charging an anonymous caller
    // would still let the open Internet spend the quota, just more slowly.
    const limiter = countingLimiter(10);
    const response = await createWorker(
      workerDepsFor({ analyze: fixtureAnalysisRunner(), rateLimiter: limiter }),
    ).fetch(restRequest(), MCP_TEST_ENV);

    expect(response.status).toBe(401);
    expect(limiter.keys).toHaveLength(0);
  });

  it("does not invoke the shared analysis runner", async () => {
    const analyze = vi.fn<AnalysisRunner>(fixtureAnalysisRunner());
    await createWorker(workerDepsFor({ analyze })).fetch(restRequest(), MCP_TEST_ENV);

    expect(analyze).not.toHaveBeenCalled();
  });

  it("performs no Warcraft Logs preflight or ingestion", async () => {
    // Proven at the ports themselves: both throw if reached, so an unauthorized
    // request that got past the gate would fail loudly rather than quietly
    // spending quota.
    const preflight = vi.fn<PreflightPort>(() => {
      throw new Error("preflight must not run for an unauthorized request");
    });
    const ingest = vi.fn<CombatIngestionPort>(() => {
      throw new Error("ingestion must not run for an unauthorized request");
    });

    // The REAL application service over throwing ports, so the assertion is
    // about the production composition rather than about a stub.
    const response = await createWorker(
      workerDepsFor({
        analyze: async (input) => await analyzeFight(input, { env: MCP_TEST_ENV, preflight, ingest }),
      }),
    ).fetch(restRequest(), MCP_TEST_ENV);

    expect(response.status).toBe(401);
    expect(preflight).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });
});

describe("one credential authorizes both transports", () => {
  async function restStatus(headers: Record<string, string>): Promise<number> {
    return (
      await createWorker(workerDepsFor({ analyze: fixtureAnalysisRunner() })).fetch(
        restRequest(headers),
        MCP_TEST_ENV,
      )
    ).status;
  }

  async function mcpStatus(headers: Record<string, string>): Promise<number> {
    return (await handleMcpRequest(mcpRequest(headers), MCP_TEST_ENV, { analyze: fixtureAnalysisRunner() }))
      .status;
  }

  it("the valid credential opens both", async () => {
    // ONE PRIVATE PRINCIPAL, two surfaces. Separate per-transport credentials
    // would mean two doors to keep in step, and one of them would eventually
    // become the cheap way in.
    const headers = { authorization: `Bearer ${ANALYSIS_TEST_TOKEN}` };

    expect(await restStatus(headers)).toBe(200);
    expect(await mcpStatus(headers)).toBe(200);
  });

  it("an invalid credential opens neither", async () => {
    const headers = { authorization: "Bearer wrong-credential" };

    expect(await restStatus(headers)).toBe(401);
    expect(await mcpStatus(headers)).toBe(401);
  });

  it("no credential opens neither", async () => {
    expect(await restStatus({})).toBe(401);
    expect(await mcpStatus({})).toBe(401);
  });

  it("both challenge with the Bearer scheme", async () => {
    const rest = await createWorker(workerDepsFor({ analyze: fixtureAnalysisRunner() })).fetch(
      restRequest(),
      MCP_TEST_ENV,
    );
    const mcp = await handleMcpRequest(mcpRequest(), MCP_TEST_ENV, { analyze: fixtureAnalysisRunner() });

    expect(rest.headers.get("www-authenticate")).toContain("Bearer");
    expect(mcp.headers.get("www-authenticate")).toContain("Bearer");
    // The scheme, never the secret.
    expect(rest.headers.get("www-authenticate")).not.toContain(ANALYSIS_TEST_TOKEN);
    expect(mcp.headers.get("www-authenticate")).not.toContain(ANALYSIS_TEST_TOKEN);
  });
});

describe("only authorized calls spend the shared budget", () => {
  const AUTH = { authorization: `Bearer ${ANALYSIS_TEST_TOKEN}` };

  async function rest(worker: ReturnType<typeof createWorker>, headers: Record<string, string>) {
    return (await worker.fetch(restRequest(headers), MCP_TEST_ENV)).status;
  }

  async function mcp(
    analyze: AnalysisRunner,
    limiter: ReturnType<typeof countingLimiter>,
    headers: Record<string, string>,
  ): Promise<boolean> {
    const response = await handleMcpRequest(mcpRequest(headers), MCP_TEST_ENV, {
      analyze,
      rateLimiter: limiter,
    });
    if (response.status !== 200) return true;
    const payload = JSON.parse(await response.text()) as { result: { isError?: boolean } };
    return payload.result.isError === true;
  }

  it("skips unauthorized calls, then exhausts across transports", async () => {
    const limiter = countingLimiter(2);
    const analyze = fixtureAnalysisRunner();
    const worker = createWorker(workerDepsFor({ analyze, rateLimiter: limiter }));

    // An anonymous attempt must not touch the counter at all.
    expect(await rest(worker, {})).toBe(401);
    expect(limiter.keys).toHaveLength(0);

    // Then the budget is spent by authorized callers, across both transports.
    expect(await rest(worker, AUTH)).toBe(200);
    expect(await mcp(analyze, limiter, AUTH)).toBe(false);
    expect(await rest(worker, AUTH)).toBe(429);

    expect(limiter.keys).toEqual(["analysis:warcraft_log", "analysis:warcraft_log", "analysis:warcraft_log"]);
  });

  it("exhausts in the reverse transport order too", async () => {
    const limiter = countingLimiter(2);
    const analyze = fixtureAnalysisRunner();
    const worker = createWorker(workerDepsFor({ analyze, rateLimiter: limiter }));

    expect(await mcp(analyze, limiter, {})).toBe(true);
    expect(limiter.keys).toHaveLength(0);

    expect(await mcp(analyze, limiter, AUTH)).toBe(false);
    expect(await mcp(analyze, limiter, AUTH)).toBe(false);
    expect(await rest(worker, AUTH)).toBe(429);
  });
});
