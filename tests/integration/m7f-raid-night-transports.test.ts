/**
 * The raid night, reached through both real transports.
 *
 * WHAT IS REAL HERE AND WHAT IS FAKED
 *
 * Real: the Worker's routing, its bearer check, the shared request parser, the
 * cost-aware rate-limit gate, the MCP handler with the SDK's own input-schema
 * validation, the M7-E projection, the SDK validating `structuredContent` against
 * the published output schema, and the whole HTTP status mapping.
 *
 * Faked: the runner and the Cloudflare rate limiter. That is deliberate and it is
 * the point — this file is about what the TRANSPORTS do. The orchestration below
 * the runner is proven separately in `m7f-raid-night-orchestration.test.ts`, with
 * the real engine, and duplicating it here would only slow these tests down while
 * making a transport defect harder to see.
 *
 * THE TWO CLAIMS THAT MATTER MOST
 *
 * One runner. Both adapters receive the same function instance, so neither can
 * assemble its own pipeline — asserted by counting entries into a single runner
 * rather than by inspecting imports.
 *
 * One budget. A raid night attempts one limiter call per fight on the SAME key a
 * single-fight analysis charges, so a caller cannot buy Warcraft Logs capacity by
 * bundling fights, nor get a second allowance by switching protocol.
 *
 * WHAT "BUDGET" MEANS HERE, PRECISELY
 *
 * Cloudflare's Worker Rate Limiting API is permissive and eventually consistent:
 * its counters are per-location and it promises no globally serialized
 * accounting. So these tests assert OUR behaviour, which is deterministic — how
 * many times we call `limit()`, under which key, and what we do with the answer —
 * and never claim an exact global cap. The counting limiter below is a test
 * double for that binding, not a model of it.
 */

import { describe, expect, it } from "vitest";

import { createWorker, type WorkerDeps } from "../../src/api/worker.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import { PublicRaidNightResultSchema } from "../../src/contracts/raid-night-contract.js";
import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { RAID_NIGHT_TOOL_NAME } from "../../src/mcp/tools/analyze-raid-night.js";
import { ANALYSIS_RATE_LIMIT_KEY, type RateLimiterPort } from "../../src/runtime/rate-limit.js";
import { serviceFailure, type ServiceErrorCode } from "../../src/services/result.js";
import type { RaidNightRunner } from "../../src/services/raid-night-runner.js";
import { hundredCellAggregate, REPORT_CODE } from "../support/raid-night-fixture.js";
import {
  ALLOWING_LIMITER,
  authHeaders,
  countingLimiter,
  D2_REQUEST,
  DENYING_LIMITER,
  fixedRaidNightRunner,
  fixtureAnalysisRunner,
  FORBIDDEN_RAID_NIGHT_RUNNER,
  MCP_TEST_ENV,
  THROWING_LIMITER,
  workerDepsFor,
  type CountingRaidNightRunner,
} from "../support/analysis-transports.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const TOKEN = "fake-analysis-token-not-real";
const PATH = "/v1/raid-night";

const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m7f-test-client", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

let nextId = 1;

/** A non-trivial mixed night: every cell kind, a spec swap, a failed fight. */
const AGGREGATE = hundredCellAggregate();
const PUBLISHED = projectRaidNightResult(AGGREGATE);

const REST_ARGS = { reportCode: REPORT_CODE, fightIds: [2, 1] } as const;
const MCP_ARGS = { source: "ids", reportCode: REPORT_CODE, fightIds: [2, 1] } as const;

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

interface Wiring {
  readonly raidNight?: RaidNightRunner;
  readonly rateLimiter?: RateLimiterPort | undefined;
  readonly headers?: Record<string, string>;
  readonly method?: string;
}

async function rest(body: unknown, wiring: Wiring = {}): Promise<Response> {
  const deps = workerDepsFor({
    analyze: fixtureAnalysisRunner(),
    ...(wiring.raidNight === undefined ? {} : { raidNight: wiring.raidNight }),
    rateLimiter: "rateLimiter" in wiring ? wiring.rateLimiter : ALLOWING_LIMITER,
  });
  return await createWorker(deps).fetch(
    new Request(`https://${HOST}${PATH}`, {
      method: wiring.method ?? "POST",
      headers: { "content-type": "application/json", ...(wiring.headers ?? authHeaders()) },
      ...(wiring.method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    }),
    MCP_TEST_ENV,
  );
}

interface ToolResult {
  readonly isError?: boolean;
  readonly structuredContent?: Record<string, unknown>;
  readonly content?: readonly { readonly type: string; readonly text: string }[];
}

function mcpRequest(method: string, params: unknown): Request {
  return new Request(`https://${HOST}/mcp`, {
    method: "POST",
    headers: {
      host: HOST,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${TOKEN}`,
      "mcp-method": method,
      ...(method === "tools/call" ? { "mcp-name": RAID_NIGHT_TOOL_NAME } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
}

async function mcpCall(args: unknown, wiring: Wiring = {}): Promise<ToolResult> {
  const response = await handleMcpRequest(
    mcpRequest("tools/call", {
      name: RAID_NIGHT_TOOL_NAME,
      arguments: args,
      _meta: MODERN_META,
    }),
    MCP_TEST_ENV,
    {
      analyze: fixtureAnalysisRunner(),
      ...(wiring.raidNight === undefined ? {} : { analyzeRaidNight: wiring.raidNight }),
      rateLimiter: "rateLimiter" in wiring ? wiring.rateLimiter : ALLOWING_LIMITER,
    },
  );
  const body = await response.text();
  const payload = JSON.parse(body) as { result?: ToolResult };
  if (payload.result === undefined) {
    throw new Error(`expected a tool result, got: ${body}`);
  }
  return payload.result;
}

function toolErrorOf(result: ToolResult): { code: string; message: string; retryable: boolean } {
  const text = result.content?.[0]?.text ?? "{}";
  return (JSON.parse(text) as { error: { code: string; message: string; retryable: boolean } }).error;
}

function failing(code: ServiceErrorCode): RaidNightRunner {
  const failure = serviceFailure(code, "the run failed");
  if (failure.ok) throw new Error("unreachable");
  return async () => ({ ok: false, error: failure.error });
}

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

describe("POST /v1/raid-night", () => {
  it("returns the M7-E public document, unwrapped, at 200", async () => {
    const runner = fixedRaidNightRunner(AGGREGATE);
    const response = await rest(REST_ARGS, { raidNight: runner.runner });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    // Not "looks like": the same document the published contract defines.
    expect(body).toEqual(PUBLISHED);
    expect(PublicRaidNightResultSchema.safeParse(body).success).toBe(true);
    expect(runner.calls()).toBe(1);
  });

  it("hands the runner the CANONICAL request, deduplicated and ascending", async () => {
    const runner = fixedRaidNightRunner(AGGREGATE);
    await rest({ reportCode: REPORT_CODE, fightIds: [3, 1, 3] }, { raidNight: runner.runner });

    // The transport parses and passes through; it does not reinterpret.
    expect(runner.requests()).toEqual([{ reportCode: REPORT_CODE, fightIds: [1, 3] }]);
  });

  it("accepts a report URL and resolves it to the same report code", async () => {
    const runner = fixedRaidNightRunner(AGGREGATE);
    await rest(
      { reportUrl: `https://www.warcraftlogs.com/reports/${REPORT_CODE}`, fightIds: [1] },
      { raidNight: runner.runner },
    );

    expect(runner.requests()[0]?.reportCode).toBe(REPORT_CODE);
  });

  it("refuses anything but POST without entering the runner", async () => {
    const response = await rest(undefined, {
      method: "GET",
      raidNight: FORBIDDEN_RAID_NIGHT_RUNNER,
    });
    expect(response.status).toBe(405);
  });

  it("refuses an unauthenticated call before parsing or metering", async () => {
    const limiter = countingLimiter(100);
    const response = await rest(REST_ARGS, {
      headers: {},
      rateLimiter: limiter,
      raidNight: FORBIDDEN_RAID_NIGHT_RUNNER,
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    // An anonymous caller cannot drain a shared budget.
    expect(limiter.keys).toEqual([]);
  });

  it("refuses a malformed body as a request error", async () => {
    const response = await rest("{not json", { raidNight: FORBIDDEN_RAID_NIGHT_RUNNER });
    expect(response.status).toBe(400);
  });

  it("reports WHICH rule refused a bad request, and charges nothing", async () => {
    const limiter = countingLimiter(100);
    const response = await rest(
      { reportCode: REPORT_CODE },
      { rateLimiter: limiter, raidNight: FORBIDDEN_RAID_NIGHT_RUNNER },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string; issues?: readonly { code: string; field: string }[] };
    };
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.issues?.some((issue) => issue.field === "fightIds")).toBe(true);
    // Refused before metering: it could spend no Warcraft Logs quota, so charging
    // for it would charge for work that cannot happen.
    expect(limiter.keys).toEqual([]);
  });

  it("refuses more fights than the documented maximum", async () => {
    const limiter = countingLimiter(100);
    const response = await rest(
      { reportCode: REPORT_CODE, fightIds: [1, 2, 3, 4, 5] },
      { rateLimiter: limiter, raidNight: FORBIDDEN_RAID_NIGHT_RUNNER },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { issues?: readonly { code: string }[] };
    };
    expect(body.error.issues?.some((issue) => issue.code === "REQUEST_LIMIT_EXCEEDED")).toBe(true);
    expect(limiter.keys).toEqual([]);
  });

  it.each([
    ["INVALID_REQUEST", 400],
    ["REPORT_NOT_ACCESSIBLE", 404],
    ["REPORT_REVISION_CHANGED", 409],
    ["UPSTREAM_RATE_LIMITED", 429],
    ["UPSTREAM_DATA_INVALID", 502],
    ["UPSTREAM_UNAVAILABLE", 503],
    ["REPORT_REVISION_UNVERIFIED", 503],
    ["INTERNAL_ERROR", 500],
  ] as const)("maps a %s run failure to %i", async (code, status) => {
    const response = await rest(REST_ARGS, { raidNight: failing(code) });
    expect(response.status).toBe(status);

    const body = (await response.json()) as { ok?: boolean; error?: { code: string } };
    expect(body.error?.code).toBe(code);
    // A failure must never be parseable as a raid night.
    expect(PublicRaidNightResultSchema.safeParse(body).success).toBe(false);
  });

  it("leaks no credential in a successful response", async () => {
    const response = await rest(REST_ARGS, { raidNight: fixedRaidNightRunner(AGGREGATE).runner });
    const serialized = `${await response.text()} ${JSON.stringify([...response.headers])}`;

    for (const sentinel of [MCP_TEST_ENV.WCL_CLIENT_ID, MCP_TEST_ENV.WCL_CLIENT_SECRET, TOKEN]) {
      expect(serialized).not.toContain(sentinel);
    }
  });
});

// ---------------------------------------------------------------------------
// The shared, cost-aware budget
// ---------------------------------------------------------------------------

describe("one limiter call per fight, on the one shared key", () => {
  it.each([1, 2, 3, 4])("attempts %i charge(s) for %i fight(s)", async (fights) => {
    const limiter = countingLimiter(100);
    const fightIds = Array.from({ length: fights }, (_, index) => index + 1);
    const response = await rest(
      { reportCode: REPORT_CODE, fightIds },
      { rateLimiter: limiter, raidNight: fixedRaidNightRunner(AGGREGATE).runner },
    );

    expect(response.status).toBe(200);
    // Exactly N calls, all against the one key — a property of this code, not a
    // claim about what Cloudflare's distributed counter ultimately admits. A
    // per-transport or per-report key would hand a caller a second allowance.
    expect(limiter.keys).toEqual(Array.from({ length: fights }, () => ANALYSIS_RATE_LIMIT_KEY));
  });

  it("denies the whole request when a mid-sequence charge is refused", async () => {
    // Two units left, four wanted. The third call fails.
    const limiter = countingLimiter(2);
    const runner = fixedRaidNightRunner(AGGREGATE);
    const response = await rest(
      { reportCode: REPORT_CODE, fightIds: [1, 2, 3, 4] },
      { rateLimiter: limiter, raidNight: runner.runner },
    );

    expect(response.status).toBe(429);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
    // THE PROPERTY THAT MATTERS: nothing ran. No partial night, and no Warcraft
    // Logs spend from a request that was refused.
    expect(runner.calls()).toBe(0);
    // Three attempts: two allowed, the third refused, and the remaining one never
    // made. The two are NOT reversed — crediting back a shared,
    // eventually-consistent counter would let a denied caller restore capacity
    // for everyone.
    expect(limiter.keys).toHaveLength(3);
  });

  it("refuses rather than running unmetered when the limiter cannot decide", async () => {
    const runner = fixedRaidNightRunner(AGGREGATE);
    const response = await rest(REST_ARGS, { rateLimiter: THROWING_LIMITER, raidNight: runner.runner });

    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "RATE_LIMITER_UNAVAILABLE",
    );
    expect(runner.calls()).toBe(0);
  });

  it("refuses when no limiter is bound at all", async () => {
    // A deployment missing the binding is unmetered, which is the condition the
    // meter exists to prevent. Built inline because the shared helper always
    // supplies one — an absent binding is exactly what is under test.
    const runner = fixedRaidNightRunner(AGGREGATE);
    const deps: WorkerDeps = {
      ...workerDepsFor({ analyze: fixtureAnalysisRunner(), raidNight: runner.runner }),
      rateLimiter: () => undefined,
    };
    const response = await createWorker(deps).fetch(
      new Request(`https://${HOST}${PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(REST_ARGS),
      }),
      MCP_TEST_ENV,
    );

    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "RATE_LIMITER_UNAVAILABLE",
    );
    expect(runner.calls()).toBe(0);
  });

  it("leaves the single-fight route making exactly one limiter call", async () => {
    // M7-F made the meter cost-aware. The existing endpoint must not have become
    // more expensive as a side effect.
    const limiter = countingLimiter(10);
    const worker = createWorker(workerDepsFor({ analyze: fixtureAnalysisRunner(), rateLimiter: limiter }));
    const response = await worker.fetch(
      new Request(`https://${HOST}/v1/analysis`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(D2_REQUEST),
      }),
      MCP_TEST_ENV,
    );

    expect(response.status).toBe(200);
    expect(limiter.keys).toEqual([ANALYSIS_RATE_LIMIT_KEY]);
  });

  it("shares ONE budget with the single-fight route", async () => {
    // Three units. A two-fight raid night spends two; the single-fight analysis
    // spends the third; the next raid night has nothing left.
    const limiter = countingLimiter(3);
    const deps = workerDepsFor({
      analyze: fixtureAnalysisRunner(),
      raidNight: fixedRaidNightRunner(AGGREGATE).runner,
      rateLimiter: limiter,
    });
    const worker = createWorker(deps);

    const night = async (fightIds: readonly number[]): Promise<number> =>
      (
        await worker.fetch(
          new Request(`https://${HOST}${PATH}`, {
            method: "POST",
            headers: { "content-type": "application/json", ...authHeaders() },
            body: JSON.stringify({ reportCode: REPORT_CODE, fightIds }),
          }),
          MCP_TEST_ENV,
        )
      ).status;

    expect(await night([1, 2])).toBe(200);

    const single = await worker.fetch(
      new Request(`https://${HOST}/v1/analysis`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(D2_REQUEST),
      }),
      MCP_TEST_ENV,
    );
    expect(single.status).toBe(200);

    // The budget is gone, and it was the raid night's own spend that drained it.
    expect(await night([3])).toBe(429);
  });

  it("shares ONE budget across REST and MCP", async () => {
    const limiter = countingLimiter(2);
    const runner = fixedRaidNightRunner(AGGREGATE);

    const viaMcp = await mcpCall(
      { source: "ids", reportCode: REPORT_CODE, fightIds: [1, 2] },
      { rateLimiter: limiter, raidNight: runner.runner },
    );
    expect(viaMcp.isError).toBeUndefined();

    // Switching protocol does not buy a second allowance.
    const viaRest = await rest(
      { reportCode: REPORT_CODE, fightIds: [1] },
      { rateLimiter: limiter, raidNight: runner.runner },
    );
    expect(viaRest.status).toBe(429);
    expect(limiter.keys.every((key) => key === ANALYSIS_RATE_LIMIT_KEY)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

describe("the analyze_raid_night tool", () => {
  it("is published alongside the single-fight tool", async () => {
    const response = await handleMcpRequest(mcpRequest("tools/list", { _meta: MODERN_META }), MCP_TEST_ENV, {
      analyze: fixtureAnalysisRunner(),
      rateLimiter: ALLOWING_LIMITER,
    });
    const payload = JSON.parse(await response.text()) as {
      result: { tools: readonly { name: string }[] };
    };

    // Sorted on both sides: `tools/list` promises no ordering, so asserting the
    // SDK's registration order would pin an implementation detail.
    expect(payload.result.tools.map((tool) => tool.name).sort()).toEqual(
      [ANALYZE_TOOL_NAME, RAID_NIGHT_TOOL_NAME].sort(),
    );
  });

  it("returns the public document as structuredContent AND as text", async () => {
    const runner = fixedRaidNightRunner(AGGREGATE);
    const result = await mcpCall(MCP_ARGS, { raidNight: runner.runner });

    expect(result.isError).toBeUndefined();
    // The SDK validated this against the declared output schema before it left
    // the server, so reaching here proves the projection satisfies the contract.
    expect(result.structuredContent).toEqual(PUBLISHED);
    expect(JSON.parse(result.content?.[0]?.text ?? "null")).toEqual(PUBLISHED);
    expect(runner.calls()).toBe(1);
  });

  it("drops the MCP-only discriminator before the application sees it", async () => {
    const runner = fixedRaidNightRunner(AGGREGATE);
    await mcpCall(MCP_ARGS, { raidNight: runner.runner });

    // `source` is tool ergonomics, not Warcraft Logs vocabulary.
    expect(runner.requests()).toEqual([{ reportCode: REPORT_CODE, fightIds: [1, 2] }]);
  });

  it("accepts the url variant and resolves it to the same request", async () => {
    const runner = fixedRaidNightRunner(AGGREGATE);
    const result = await mcpCall(
      {
        source: "url",
        reportUrl: `https://www.warcraftlogs.com/reports/${REPORT_CODE}?fight=9&source=4`,
        fightIds: [2, 1],
      },
      { raidNight: runner.runner },
    );

    expect(result.isError).toBeUndefined();
    // Selectors in the URL are ignored in favour of the explicit list, exactly as
    // the tool description promises.
    expect(runner.requests()).toEqual([{ reportCode: REPORT_CODE, fightIds: [1, 2] }]);
  });

  it("enforces the fight cap in the published input schema", async () => {
    // Refused by the SDK's own validation, so an over-large call never reaches
    // metering and cannot spend a unit.
    const limiter = countingLimiter(100);
    const result = await mcpCall(
      { source: "ids", reportCode: REPORT_CODE, fightIds: [1, 2, 3, 4, 5] },
      { rateLimiter: limiter, raidNight: FORBIDDEN_RAID_NIGHT_RUNNER },
    );

    expect(result.isError).toBe(true);
    expect(limiter.keys).toEqual([]);
  });

  it("enforces the explicit player cap in the published input schema", async () => {
    const result = await mcpCall(
      {
        source: "ids",
        reportCode: REPORT_CODE,
        fightIds: [1],
        sourceIds: Array.from({ length: 26 }, (_, index) => index),
      },
      { raidNight: FORBIDDEN_RAID_NIGHT_RUNNER },
    );
    expect(result.isError).toBe(true);
  });

  it("accepts exactly the documented maximum of each", async () => {
    // The caps are boundaries, not approximations: the largest legal call works.
    const runner = fixedRaidNightRunner(AGGREGATE);
    const result = await mcpCall(
      {
        source: "ids",
        reportCode: REPORT_CODE,
        fightIds: [1, 2, 3, 4],
        sourceIds: Array.from({ length: 25 }, (_, index) => index),
      },
      { raidNight: runner.runner },
    );

    expect(result.isError).toBeUndefined();
    expect(runner.requests()[0]?.sourceIds).toHaveLength(25);
  });

  it("rejects a call that supplies BOTH a URL and a report code", async () => {
    // The tagged union makes the two forms visibly exclusive, so this fails at
    // schema validation rather than arriving as a semantic conflict.
    const result = await mcpCall(
      {
        source: "ids",
        reportCode: REPORT_CODE,
        reportUrl: "https://www.warcraftlogs.com/reports/x",
        fightIds: [1],
      },
      { raidNight: FORBIDDEN_RAID_NIGHT_RUNNER },
    );
    expect(result.isError).toBe(true);
  });

  it("rejects an unknown argument rather than ignoring it", async () => {
    const result = await mcpCall(
      { source: "ids", reportCode: REPORT_CODE, fightIds: [1], scope: "FULL_RAID" },
      { raidNight: FORBIDDEN_RAID_NIGHT_RUNNER },
    );
    // A caller must not be able to widen ingestion scope, and a silently dropped
    // argument would look like it worked.
    expect(result.isError).toBe(true);
  });

  it("rejects the -1 no-actor sentinel as a requested player", async () => {
    const result = await mcpCall(
      { source: "ids", reportCode: REPORT_CODE, fightIds: [1], sourceIds: [-1] },
      { raidNight: FORBIDDEN_RAID_NIGHT_RUNNER },
    );
    expect(result.isError).toBe(true);
  });

  it.each([
    ["REPORT_REVISION_CHANGED", true],
    ["REPORT_REVISION_UNVERIFIED", true],
    ["UPSTREAM_UNAVAILABLE", true],
    ["REPORT_NOT_ACCESSIBLE", false],
    ["INVALID_REQUEST", false],
  ] as const)("reports a %s run failure as a tool error", async (code, retryable) => {
    const result = await mcpCall(MCP_ARGS, { raidNight: failing(code) });

    expect(result.isError).toBe(true);
    const error = toolErrorOf(result);
    expect(error.code).toBe(code);
    expect(error.retryable).toBe(retryable);
    // No structuredContent on a failure: the declared output schema describes a
    // successful raid night, and a failure must not be parseable as one.
    expect(result.structuredContent).toBeUndefined();
  });

  it("reports a refused budget as a tool error without running", async () => {
    const runner = fixedRaidNightRunner(AGGREGATE);
    const result = await mcpCall(MCP_ARGS, { rateLimiter: DENYING_LIMITER, raidNight: runner.runner });

    expect(toolErrorOf(result).code).toBe("RATE_LIMITED");
    expect(runner.calls()).toBe(0);
  });

  it("refuses rather than running unmetered when the limiter throws", async () => {
    const runner = fixedRaidNightRunner(AGGREGATE);
    const result = await mcpCall(MCP_ARGS, { rateLimiter: THROWING_LIMITER, raidNight: runner.runner });

    expect(toolErrorOf(result).code).toBe("RATE_LIMITER_UNAVAILABLE");
    expect(runner.calls()).toBe(0);
  });

  it("refuses when the composition root bound no runner", async () => {
    // The unbound default. A deployment that forgot to wire the tool must fail
    // closed rather than reach for a pipeline of its own.
    const result = await mcpCall(MCP_ARGS);
    expect(result.isError).toBe(true);
    expect(toolErrorOf(result).code).toBe("INTERNAL_ERROR");
  });
});

// ---------------------------------------------------------------------------
// One runner, one truth
// ---------------------------------------------------------------------------

describe("REST and MCP are two doors to one analysis", () => {
  async function bothTransports(): Promise<{
    readonly restBody: unknown;
    readonly structured: unknown;
    readonly text: unknown;
    readonly runner: CountingRaidNightRunner;
  }> {
    // ONE instance, handed to both adapters.
    const runner = fixedRaidNightRunner(AGGREGATE);

    const restResponse = await rest(REST_ARGS, { raidNight: runner.runner });
    const result = await mcpCall(MCP_ARGS, { raidNight: runner.runner });

    return {
      restBody: await restResponse.json(),
      structured: result.structuredContent,
      text: JSON.parse(result.content?.[0]?.text ?? "null"),
      runner,
    };
  }

  it("enters the same runner from both transports", async () => {
    const { runner } = await bothTransports();
    // Two calls into one function. Neither adapter built a pipeline.
    expect(runner.calls()).toBe(2);
    expect(runner.requests()[0]).toEqual(runner.requests()[1]);
  });

  it("produces deeply equal documents on both, and in both MCP channels", async () => {
    const { restBody, structured, text } = await bothTransports();

    // Parsed then compared, never byte-compared: property order is a serialiser
    // detail and pinning it would make an irrelevant change look like a break.
    expect(restBody).toEqual(structured);
    expect(text).toEqual(restBody);
  });

  it("agrees on a non-trivial mixed night rather than a degenerate one", async () => {
    // A parity test over an empty or single-cell document would pass while the
    // two transports disagreed about everything interesting.
    const { restBody } = await bothTransports();
    const body = restBody as {
      cells: readonly { kind: string }[];
      coverage: Record<string, number>;
      roster: readonly unknown[];
      trendEvidence: { series: readonly unknown[] };
    };

    expect(body.cells).toHaveLength(100);
    expect(new Set(body.cells.map((cell) => cell.kind)).size).toBeGreaterThan(2);
    expect(body.roster).toHaveLength(10);
    expect(body.trendEvidence.series.length).toBeGreaterThan(0);
    expect(body.coverage["cellsAnalyzed"]).toBeGreaterThan(0);
    expect(body.coverage["fightsFailed"]).toBeGreaterThan(0);
  });
});
