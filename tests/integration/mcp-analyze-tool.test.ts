/**
 * `analyze_warcraft_log`, driven as a real MCP tool call.
 *
 * WHAT IS REAL HERE AND WHAT IS FAKED
 *
 * Real: the MCP handler, the SDK's input-schema validation, the tool, the
 * rate-limit gate, the M6-B application service composing M2 -> M3 -> M4 -> M5,
 * the M5 analyzer, the M6-C projection, and the SDK validating
 * `structuredContent` against the public output schema.
 *
 * Faked: exactly two I/O ports — Warcraft Logs preflight and event ingestion —
 * plus the Cloudflare rate limiter. Nothing else. So a coverage number asserted
 * here travelled the whole engine, and an error code asserted here came from the
 * real mapping rather than from a stub.
 *
 * THE DISTINCTION THIS FILE EXISTS TO PIN
 *
 * An analysis that could not resolve a decision is a SUCCESSFUL tool result. A
 * request that never reached an analysis is a tool ERROR. They are asserted
 * side by side below because collapsing them is the failure that would make the
 * whole engine untrustworthy: an outage reported as gameplay uncertainty, or an
 * honest UNKNOWN reported as a malfunction.
 */

import { describe, expect, it, vi } from "vitest";

import { handleMcpRequest } from "../../src/mcp/server.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { ANALYSIS_RATE_LIMIT_KEY, type RateLimiterPort } from "../../src/runtime/rate-limit.js";
import { SERVICE_ERROR_CODES, type ServiceErrorCode } from "../../src/services/result.js";
import type { AnalysisRunner } from "../../src/mcp/tools/analyze-warcraft-log.js";
import {
  ALLOWING_LIMITER,
  D2_REQUEST,
  DENYING_LIMITER,
  MCP_TEST_ENV,
  THROWING_LIMITER,
  countingLimiter,
  fixtureAnalysisRunner,
  m5aRequest,
} from "../support/analysis-transports.js";
import { UNSUPPORTED_WCL_IDENTITY } from "../support/unsupported-subject.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const TOKEN = "fake-analysis-token-not-real";

const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m6d-test-client", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

let nextId = 1;

function toolCallRequest(args: unknown): Request {
  return new Request(`https://${HOST}/mcp`, {
    method: "POST",
    headers: {
      host: HOST,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${TOKEN}`,
      "mcp-method": "tools/call",
      "mcp-name": ANALYZE_TOOL_NAME,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: { name: ANALYZE_TOOL_NAME, arguments: args, _meta: MODERN_META },
    }),
  });
}

interface CallOptions {
  readonly analyze?: AnalysisRunner;
  readonly rateLimiter?: RateLimiterPort;
}

interface ToolResult {
  readonly isError?: boolean;
  readonly structuredContent?: Record<string, unknown>;
  readonly content?: readonly { readonly type: string; readonly text: string }[];
}

/** Issues one real `tools/call` and returns the tool result. */
async function callTool(args: unknown, options: CallOptions = {}): Promise<ToolResult> {
  const response = await handleMcpRequest(toolCallRequest(args), MCP_TEST_ENV, {
    analyze: options.analyze ?? fixtureAnalysisRunner(),
    rateLimiter: options.rateLimiter ?? ALLOWING_LIMITER,
  });
  const payload = JSON.parse(await response.text()) as {
    result?: ToolResult;
    error?: { message?: string };
  };
  if (payload.result === undefined) {
    throw new Error(`expected a tool result, got: ${JSON.stringify(payload)}`);
  }
  return payload.result;
}

/** The parsed error envelope from a failed tool call. */
function errorBodyOf(result: ToolResult): { code: string; message: string; retryable: boolean } {
  const text = result.content?.[0]?.text ?? "{}";
  return (JSON.parse(text) as { error: { code: string; message: string; retryable: boolean } }).error;
}

const IDS_ARGS = { source: "ids", ...D2_REQUEST } as const;

describe("the D2 fixture analysed through a real MCP tool call", () => {
  it("returns a successful ANALYZED result", async () => {
    const result = await callTool(IDS_ARGS);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.["status"]).toBe("ANALYZED");
  });

  it("preserves M5's pinned coverage end to end", async () => {
    // The same numbers `m5e-coverage-disclosure.test.ts` commits, now carried
    // through the service, the projection and the MCP wire.
    const coverage = (await callTool(IDS_ARGS)).structuredContent?.["coverage"] as Record<string, number>;

    expect({
      eligible: coverage["eligibleDecisions"],
      match: coverage["match"],
      rejected: coverage["rejected"],
      unknown: coverage["unknown"],
      exact: coverage["exactEntryMatches"],
      converged: coverage["tokenConvergedMatches"],
    }).toStrictEqual({ eligible: 11, match: 1, rejected: 0, unknown: 10, exact: 1, converged: 0 });
  });

  it("keeps the real Garrote MATCH exactly as M5 established it", async () => {
    const decisions = (await callTool(IDS_ARGS)).structuredContent?.["decisions"] as readonly Record<
      string,
      unknown
    >[];
    const garrote = decisions.find((decision) => decision["outcome"] === "MATCH");

    expect(garrote?.["observedToken"]).toBe("garrote");
    expect(garrote?.["basis"]).toBe("AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN");
    expect(garrote?.["selectionPrecision"]).toBe("EXACT_ENTRY");
    expect(garrote?.["usabilityProvenance"]).toBe("OBSERVED_EXECUTION");
  });

  it("carries the capability block from the public contract", async () => {
    const capability = (await callTool(IDS_ARGS)).structuredContent?.["capability"] as Record<
      string,
      unknown
    >;

    expect(capability["matchMeaning"]).toBe("AUTHORITY_COMPATIBLE_ONLY");
    expect(capability["predictsArbitraryNextAction"]).toBe(false);
    expect(capability["scoresPerformance"]).toBe(false);
    expect(capability["unknownIsFirstClass"]).toBe(true);
  });

  it("publishes no observedActionRejected and no evidenceScope", async () => {
    // Both were removed from the public contract in M6-C. MCP must not
    // reintroduce them by taking a different route to the wire.
    const serialized = JSON.stringify((await callTool(IDS_ARGS)).structuredContent);

    expect(serialized).not.toContain("observedActionRejected");
    expect(serialized).not.toContain("evidenceScope");
  });

  it("returns text JSON deep-equal to structuredContent", async () => {
    const result = await callTool(IDS_ARGS);

    expect(result.content?.[0]?.type).toBe("text");
    expect(JSON.parse(result.content?.[0]?.text ?? "{}")).toEqual(result.structuredContent);
  });

  it("accepts the URL form and reaches the same analysis", async () => {
    const fromUrl = await callTool({
      source: "url",
      reportUrl: `https://www.warcraftlogs.com/reports/${D2_REQUEST.reportCode}#fight=${String(D2_REQUEST.fightId)}&source=${String(D2_REQUEST.sourceId)}`,
    });

    expect(fromUrl.structuredContent).toEqual((await callTool(IDS_ARGS)).structuredContent);
  });
});

describe("the M5-A rejection survives the MCP boundary", () => {
  it("reports REJECTED through outcome and basis, with no replacement action", async () => {
    const result = await callTool(
      { source: "ids", ...m5aRequest() },
      { analyze: fixtureAnalysisRunner({ fixture: "m5a" }) },
    );
    const decisions = result.structuredContent?.["decisions"] as readonly Record<string, unknown>[];

    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.["observedToken"]).toBe("envenom");
    expect(decisions[0]?.["outcome"]).toBe("REJECTED");
    expect(decisions[0]?.["basis"]).toBe("OBSERVED_ACTION_REJECTED_BY_AUTHORITY");
    // A rejection stands on its own. Nothing names what should have been cast.
    expect(decisions[0]?.["authorityToken"]).toBeNull();
    expect(Object.keys(decisions[0] ?? {})).not.toContain("observedActionRejected");
  });
});

describe("every analysis status is a successful tool result", () => {
  it("treats SPEC_NOT_SUPPORTED as success, not a failed invocation", async () => {
    // A complete, truthful answer. Marking it an error would teach a client to
    // retry or discard it, and would read as "the tool broke" rather than
    // "this build does not analyze that specialization".
    const result = await callTool(IDS_ARGS, {
      analyze: fixtureAnalysisRunner(UNSUPPORTED_WCL_IDENTITY),
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.["status"]).toBe("SPEC_NOT_SUPPORTED");
    expect(result.structuredContent).not.toHaveProperty("decisions");
    expect(result.structuredContent).not.toHaveProperty("coverage");
  });

  it("treats a mostly-UNKNOWN analysis as success", async () => {
    // Ten of eleven decisions do not resolve. That is the analyzer working.
    const result = await callTool(IDS_ARGS);
    const coverage = result.structuredContent?.["coverage"] as Record<string, number>;

    expect(result.isError).toBeUndefined();
    expect(coverage["unknown"]).toBe(10);
  });
});

describe("service failures are tool errors, never analysis", () => {
  /**
   * Every current application error code, with the wire behaviour a caller
   * should see.
   *
   * `satisfies Record<ServiceErrorCode, boolean>` makes this exhaustive: a new
   * service error cannot be added without deciding its retryability here.
   */
  const RETRYABLE = {
    INVALID_REQUEST: false,
    CONFIGURATION_ERROR: false,
    REPORT_NOT_ACCESSIBLE: false,
    REPORT_ARCHIVED_INACCESSIBLE: false,
    REPORT_REVISION_CHANGED: true,
    REPORT_REVISION_UNVERIFIED: true,
    FIGHT_NOT_FOUND: false,
    SOURCE_NOT_FOUND: false,
    SOURCE_NOT_A_PLAYER: false,
    SOURCE_NOT_IN_FIGHT: false,
    IDENTITY_UNRESOLVED: false,
    UPSTREAM_DATA_INVALID: false,
    UPSTREAM_AUTH_FAILED: false,
    UPSTREAM_RATE_LIMITED: true,
    UPSTREAM_UNAVAILABLE: true,
    INTERNAL_ERROR: false,
  } as const satisfies Record<ServiceErrorCode, boolean>;

  it("covers every code the service can produce", () => {
    // Guards the table itself against the service growing a code silently.
    expect(Object.keys(RETRYABLE).sort()).toEqual([...SERVICE_ERROR_CODES].sort());
  });

  for (const code of SERVICE_ERROR_CODES) {
    it(`maps ${code} to an isError result with no analysis payload`, async () => {
      const result = await callTool(IDS_ARGS, {
        analyze: async () => ({ ok: false, error: { code, message: "internal detail" } }),
      });
      const error = errorBodyOf(result);

      expect(result.isError).toBe(true);
      // The declared output schema describes a successful analysis. A failure
      // must not be parseable as one.
      expect(result.structuredContent).toBeUndefined();
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(RETRYABLE[code]);
      expect(error.message.length).toBeGreaterThan(20);
    });
  }

  it("never echoes the service's own message text", async () => {
    // Messages are author-written at the MCP boundary. Passing the service's
    // string through would eventually pass an interpolated upstream one.
    const result = await callTool(IDS_ARGS, {
      analyze: async () => ({
        ok: false,
        error: { code: "UPSTREAM_UNAVAILABLE", message: "SENTINEL_SERVICE_MESSAGE_DO_NOT_LEAK" },
      }),
    });

    expect(JSON.stringify(result)).not.toContain("SENTINEL_SERVICE_MESSAGE_DO_NOT_LEAK");
  });

  it("reports an unexpected throw as a fixed internal error", async () => {
    // Never `String(error)`: a thrown value can carry configuration, a
    // credential, or upstream text. And a bug is reported as a bug — never
    // downgraded into gameplay UNKNOWN.
    const result = await callTool(IDS_ARGS, {
      analyze: async () => {
        throw new Error("SENTINEL_THROWN_DETAIL_DO_NOT_LEAK at src/secret.ts:42");
      },
    });
    const error = errorBodyOf(result);

    expect(result.isError).toBe(true);
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.message).toBe("An unexpected internal error occurred.");
    expect(JSON.stringify(result)).not.toContain("SENTINEL_THROWN_DETAIL_DO_NOT_LEAK");
    expect(JSON.stringify(result)).not.toContain("src/secret.ts");
  });

  it("never fabricates gameplay UNKNOWN from an infrastructure failure", async () => {
    // The failure that would make the engine untrustworthy: an outage reported
    // as "we could not determine this decision".
    for (const code of ["UPSTREAM_UNAVAILABLE", "CONFIGURATION_ERROR"] as const) {
      const result = await callTool(IDS_ARGS, {
        analyze: async () => ({ ok: false, error: { code, message: "x" } }),
      });

      expect(result.structuredContent).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain("ANALYZED");
      expect(JSON.stringify(result)).not.toContain("eligibleDecisions");
    }
  });
});

describe("the analysis tool is metered", () => {
  it("calls the application service once when the limiter allows", async () => {
    const analyze = vi.fn(fixtureAnalysisRunner());
    const limiter = countingLimiter(10);

    await callTool(IDS_ARGS, { analyze, rateLimiter: limiter });

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(limiter.keys).toEqual([ANALYSIS_RATE_LIMIT_KEY]);
  });

  it("meters under a stable non-secret key", async () => {
    // Not the bearer token, not a WCL credential, not the report code, not an
    // IP address — and not transport-prefixed either, because REST charges the
    // same key. Separate keys would let a caller double their spend by
    // alternating protocols.
    const limiter = countingLimiter(10);
    await callTool(IDS_ARGS, { rateLimiter: limiter });

    expect(limiter.keys[0]).toBe("analysis:warcraft_log");
    expect(limiter.keys[0]).not.toContain(TOKEN);
    expect(limiter.keys[0]).not.toContain(D2_REQUEST.reportCode);
  });

  it("does not reach the application service when the limiter denies", async () => {
    const analyze = vi.fn(fixtureAnalysisRunner());
    const result = await callTool(IDS_ARGS, { analyze, rateLimiter: DENYING_LIMITER });
    const error = errorBodyOf(result);

    expect(analyze).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryable).toBe(true);
  });

  it("fails closed when the limiter itself throws", async () => {
    // An undecided limiter must not become unmetered access to a paid quota.
    const analyze = vi.fn(fixtureAnalysisRunner());
    const result = await callTool(IDS_ARGS, { analyze, rateLimiter: THROWING_LIMITER });

    expect(analyze).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(errorBodyOf(result).code).toBe("RATE_LIMITER_UNAVAILABLE");
  });

  it("fails closed when no limiter is bound at all", async () => {
    const analyze = vi.fn(fixtureAnalysisRunner());
    const response = await handleMcpRequest(toolCallRequest(IDS_ARGS), MCP_TEST_ENV, { analyze });
    const payload = JSON.parse(await response.text()) as { result: ToolResult };

    expect(analyze).not.toHaveBeenCalled();
    expect(payload.result.isError).toBe(true);
    expect(errorBodyOf(payload.result).code).toBe("RATE_LIMITER_UNAVAILABLE");
  });

  it("returns no analysis object when rate limited", async () => {
    const result = await callTool(IDS_ARGS, { rateLimiter: DENYING_LIMITER });

    expect(result.structuredContent).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("eligibleDecisions");
    // Infrastructure availability, not analysis uncertainty.
    expect(JSON.stringify(result)).not.toContain("UNKNOWN");
  });

  it("exhausts a real budget after the configured number of calls", async () => {
    const limiter = countingLimiter(2);
    const analyze = vi.fn(fixtureAnalysisRunner());

    const first = await callTool(IDS_ARGS, { analyze, rateLimiter: limiter });
    const second = await callTool(IDS_ARGS, { analyze, rateLimiter: limiter });
    const third = await callTool(IDS_ARGS, { analyze, rateLimiter: limiter });

    expect(first.isError).toBeUndefined();
    expect(second.isError).toBeUndefined();
    expect(third.isError).toBe(true);
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it("counts an unsupported-spec call as a real invocation", async () => {
    // It reached Warcraft Logs and resolved an identity. The work was done even
    // though no gameplay analysis followed.
    const limiter = countingLimiter(10);
    await callTool(IDS_ARGS, {
      analyze: fixtureAnalysisRunner(UNSUPPORTED_WCL_IDENTITY),
      rateLimiter: limiter,
    });

    expect(limiter.keys).toHaveLength(1);
  });
});

describe("cheap traffic does not spend the analysis budget", () => {
  function listRequest(): Request {
    return new Request(`https://${HOST}/mcp`, {
      method: "POST",
      headers: {
        host: HOST,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${TOKEN}`,
        "mcp-method": "tools/list",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId++,
        method: "tools/list",
        params: { _meta: MODERN_META },
      }),
    });
  }

  it("does not meter tools/list", async () => {
    const limiter = countingLimiter(10);
    await handleMcpRequest(listRequest(), MCP_TEST_ENV, {
      analyze: fixtureAnalysisRunner(),
      rateLimiter: limiter,
    });

    expect(limiter.keys).toHaveLength(0);
  });

  it("does not meter a rejected bearer token", async () => {
    const limiter = countingLimiter(10);
    const request = toolCallRequest(IDS_ARGS);
    request.headers.set("authorization", "Bearer wrong");

    const response = await handleMcpRequest(request, MCP_TEST_ENV, {
      analyze: fixtureAnalysisRunner(),
      rateLimiter: limiter,
    });

    expect(response.status).toBe(401);
    expect(limiter.keys).toHaveLength(0);
  });

  it("does not meter a rejected Origin", async () => {
    const limiter = countingLimiter(10);
    const request = toolCallRequest(IDS_ARGS);
    request.headers.set("origin", "https://evil.example.com");

    const response = await handleMcpRequest(request, MCP_TEST_ENV, {
      analyze: fixtureAnalysisRunner(),
      rateLimiter: limiter,
    });

    expect(response.status).toBe(403);
    expect(limiter.keys).toHaveLength(0);
  });

  it("does not meter arguments the input schema rejects", async () => {
    // The SDK validates before the handler runs, so a malformed call never
    // reaches the limiter. That is intentional: a bad argument costs no
    // Warcraft Logs points, so it should cost no quota either.
    const limiter = countingLimiter(10);
    const analyze = vi.fn(fixtureAnalysisRunner());

    await callTool({ source: "ids" }, { analyze, rateLimiter: limiter });

    expect(analyze).not.toHaveBeenCalled();
    expect(limiter.keys).toHaveLength(0);
  });

  it("does not meter an unknown tool name", async () => {
    const limiter = countingLimiter(10);
    const request = new Request(`https://${HOST}/mcp`, {
      method: "POST",
      headers: {
        host: HOST,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${TOKEN}`,
        "mcp-method": "tools/call",
        "mcp-name": "not_a_tool",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId++,
        method: "tools/call",
        params: { name: "not_a_tool", arguments: {}, _meta: MODERN_META },
      }),
    });

    await handleMcpRequest(request, MCP_TEST_ENV, {
      analyze: fixtureAnalysisRunner(),
      rateLimiter: limiter,
    });

    expect(limiter.keys).toHaveLength(0);
  });
});

describe("the input contract makes mixed forms impossible", () => {
  async function rejects(args: unknown): Promise<boolean> {
    const analyze = vi.fn(fixtureAnalysisRunner());
    const result = await callTool(args, { analyze });
    // Either the SDK refuses it, or it never reached the application.
    return result.isError === true && analyze.mock.calls.length === 0;
  }

  it("accepts the two valid forms", async () => {
    expect(await rejects(IDS_ARGS)).toBe(false);
    expect(
      await rejects({
        source: "url",
        reportUrl: `https://www.warcraftlogs.com/reports/${D2_REQUEST.reportCode}#fight=${String(D2_REQUEST.fightId)}&source=${String(D2_REQUEST.sourceId)}`,
      }),
    ).toBe(false);
  });

  const invalid: readonly { readonly name: string; readonly args: unknown }[] = [
    {
      name: "url form carrying a fight id",
      args: { source: "url", reportUrl: "https://x.test/a", fightId: 6 },
    },
    {
      name: "ids form carrying a report url",
      args: { source: "ids", ...D2_REQUEST, reportUrl: "https://x.test/a" },
    },
    { name: "no discriminant", args: { reportUrl: "https://x.test/a" } },
    { name: "an unknown discriminant", args: { source: "both", reportUrl: "https://x.test/a" } },
    { name: "a caller-selected scope", args: { source: "ids", ...D2_REQUEST, scope: "FULL_RAID" } },
    {
      name: "caller-selected resources",
      args: { source: "ids", ...D2_REQUEST, includeResources: false },
    },
    { name: "a caller-selected target", args: { source: "ids", ...D2_REQUEST, targetActorId: 21 } },
    { name: "a caller-selected analyzer", args: { source: "ids", ...D2_REQUEST, analyzerId: "x" } },
    { name: "a missing fight id", args: { source: "ids", reportCode: "aBcDeFgH12345678", sourceId: 1 } },
    { name: "a negative fight id", args: { source: "ids", ...D2_REQUEST, fightId: -1 } },
    { name: "a fractional fight id", args: { source: "ids", ...D2_REQUEST, fightId: 1.5 } },
    { name: "a negative source id", args: { source: "ids", ...D2_REQUEST, sourceId: -1 } },
    { name: "a fractional source id", args: { source: "ids", ...D2_REQUEST, sourceId: 2.5 } },
    { name: "a non-string report code", args: { source: "ids", ...D2_REQUEST, reportCode: 12345678 } },
    { name: "a malformed url", args: { source: "url", reportUrl: "not-a-url" } },
  ];

  for (const testCase of invalid) {
    it(`refuses ${testCase.name}`, async () => {
      expect(await rejects(testCase.args)).toBe(true);
    });
  }
});

describe("Warcraft Logs semantics stay with the application parser", () => {
  // MCP validates only the shape needed to call the tool. Whether a URL is a
  // Warcraft Logs URL naming one fight and one player is the existing parser's
  // job, and duplicating those rules in Zod would create two parsers that drift.
  const applicationRejected: readonly { readonly name: string; readonly url: string }[] = [
    { name: "a syntactically valid non-Warcraft-Logs URL", url: "https://example.com/reports/abc" },
    {
      name: "a Warcraft Logs URL with no fight",
      url: "https://www.warcraftlogs.com/reports/aBcDeFgH12345678#source=15",
    },
    {
      name: "a Warcraft Logs URL with no source",
      url: "https://www.warcraftlogs.com/reports/aBcDeFgH12345678#fight=8",
    },
    {
      name: "fight=last",
      url: "https://www.warcraftlogs.com/reports/aBcDeFgH12345678#fight=last&source=15",
    },
  ];

  for (const testCase of applicationRejected) {
    it(`passes ${testCase.name} to the parser, which refuses it`, async () => {
      const result = await callTool({ source: "url", reportUrl: testCase.url });

      expect(result.isError).toBe(true);
      // INVALID_REQUEST is the application's answer, not a schema rejection —
      // proving the call reached the parser rather than being stopped early.
      expect(errorBodyOf(result).code).toBe("INVALID_REQUEST");
    });
  }

  it("accepts query-string selectors as well as fragment selectors", async () => {
    const result = await callTool({
      source: "url",
      reportUrl: `https://www.warcraftlogs.com/reports/${D2_REQUEST.reportCode}?fight=${String(D2_REQUEST.fightId)}&source=${String(D2_REQUEST.sourceId)}`,
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.["status"]).toBe("ANALYZED");
  });
});

describe("no secret leaves through the analysis tool", () => {
  const SENTINELS = [
    "fake-client-id-not-real",
    "fake-client-secret-not-real",
    "fake-analysis-token-not-real",
  ] as const;

  const probes: readonly { readonly name: string; readonly run: () => Promise<ToolResult> }[] = [
    { name: "a successful analysis", run: async () => await callTool(IDS_ARGS) },
    {
      name: "an unsupported spec",
      run: async () =>
        await callTool(IDS_ARGS, {
          analyze: fixtureAnalysisRunner(UNSUPPORTED_WCL_IDENTITY),
        }),
    },
    {
      name: "a service failure",
      run: async () =>
        await callTool(IDS_ARGS, {
          analyze: async () => ({ ok: false, error: { code: "UPSTREAM_AUTH_FAILED", message: "x" } }),
        }),
    },
    {
      name: "a rate-limit denial",
      run: async () => await callTool(IDS_ARGS, { rateLimiter: DENYING_LIMITER }),
    },
    {
      name: "a limiter outage",
      run: async () => await callTool(IDS_ARGS, { rateLimiter: THROWING_LIMITER }),
    },
    {
      name: "an exception naming every secret",
      run: async () =>
        await callTool(IDS_ARGS, {
          analyze: async () => {
            // The worst case: a thrown value that literally contains all three.
            throw new Error(`boom ${SENTINELS.join(" ")}`);
          },
        }),
    },
    { name: "a schema rejection", run: async () => await callTool({ source: "ids" }) },
  ];

  for (const probe of probes) {
    it(`leaks nothing on ${probe.name}`, async () => {
      const serialized = JSON.stringify(await probe.run());

      for (const secret of SENTINELS) {
        expect(serialized, `${probe.name} leaked ${secret}`).not.toContain(secret);
      }
    });
  }
});
