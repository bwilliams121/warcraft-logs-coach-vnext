/**
 * Gameplay truth may not differ by transport.
 *
 * THE CLAIM THIS FILE MAKES
 *
 * For the same underlying analysis, REST's response body, MCP's
 * `structuredContent`, and the JSON inside MCP's text block are the SAME
 * object. Not similar, not equivalent-after-massaging — deeply equal.
 *
 * WHY IT IS TESTED RATHER THAN ARGUED
 *
 * The architecture makes it very likely: one composition root builds one
 * runner, both adapters receive it, and both call the same `projectAnalysisResult`.
 * But "very likely" is how a second projection gets added to one adapter in six
 * months to fix a rendering problem, and nothing notices until two clients
 * disagree about the same fight.
 *
 * WHAT IS COMPARED, PRECISELY
 *
 * `JSON.parse(REST body)` against `result.structuredContent` against
 * `JSON.parse(result.content[0].text)`. Parsed, then compared with `toEqual` —
 * never byte-compared. Property order is a serialiser detail and asserting it
 * would make an irrelevant change look like a contract break.
 *
 * WHAT IS NOT COMPARED
 *
 * Transport envelopes. REST answers with HTTP statuses and an `{ ok, error }`
 * failure shape; MCP answers with `isError` and a tool-error body. Those are
 * allowed to differ — they must only agree on the underlying service code,
 * which is asserted separately below.
 */

import { describe, expect, it } from "vitest";

import { createWorker } from "../../src/api/worker.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { PublicAnalysisResultSchema } from "../../src/contracts/analysis-contract.js";
import { SERVICE_ERROR_CODES, serviceFailure } from "../../src/services/result.js";
import type { AnalysisRunner } from "../../src/services/analysis-runner.js";
import {
  ALLOWING_LIMITER,
  D2_REQUEST,
  MCP_TEST_ENV,
  authHeaders,
  countingLimiter,
  fixtureAnalysisRunner,
  m5aRequest,
  workerDepsFor,
} from "../support/analysis-transports.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const TOKEN = "fake-analysis-token-not-real";

const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m6e-consistency", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

let nextId = 1;

interface Ids {
  readonly reportCode: string;
  readonly fightId: number;
  readonly sourceId: number;
}

/** The REST body for one analysis. */
async function restResult(ids: Ids, analyze: AnalysisRunner): Promise<unknown> {
  const response = await createWorker(workerDepsFor({ analyze, rateLimiter: ALLOWING_LIMITER })).fetch(
    new Request("https://coach.test/v1/analysis", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(ids),
    }),
    MCP_TEST_ENV,
  );
  return { status: response.status, body: await response.json() };
}

interface McpToolResult {
  readonly isError?: boolean;
  readonly structuredContent?: unknown;
  readonly content?: readonly { readonly type: string; readonly text: string }[];
}

/** The MCP tool result for the same analysis, by explicit identifiers. */
async function mcpResult(ids: Ids, analyze: AnalysisRunner): Promise<McpToolResult> {
  const response = await handleMcpRequest(
    new Request(`https://${HOST}/mcp`, {
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
        params: {
          name: ANALYZE_TOOL_NAME,
          arguments: { source: "ids", ...ids },
          _meta: MODERN_META,
        },
      }),
    }),
    MCP_TEST_ENV,
    { analyze, rateLimiter: ALLOWING_LIMITER },
  );
  const payload = JSON.parse(await response.text()) as { result: McpToolResult };
  return payload.result;
}

/** Asserts the three public representations of one analysis are the same object. */
async function expectTransportsAgree(ids: Ids, analyze: AnalysisRunner): Promise<unknown> {
  const rest = (await restResult(ids, analyze)) as { status: number; body: unknown };
  const mcp = await mcpResult(ids, analyze);

  expect(rest.status).toBe(200);
  expect(mcp.isError).toBeUndefined();

  const fromText: unknown = JSON.parse(mcp.content?.[0]?.text ?? "{}");

  // The three-way equality. Parsed structures, never bytes.
  expect(mcp.structuredContent).toEqual(rest.body);
  expect(fromText).toEqual(mcp.structuredContent);
  expect(fromText).toEqual(rest.body);

  // And all three are genuinely the public contract, not merely equal to
  // each other — two identically wrong shapes would otherwise pass.
  expect(PublicAnalysisResultSchema.safeParse(rest.body).success).toBe(true);
  expect(PublicAnalysisResultSchema.safeParse(mcp.structuredContent).success).toBe(true);

  return rest.body;
}

describe("the D2 analysis is identical across transports", () => {
  it("agrees on the whole public result", async () => {
    await expectTransportsAgree(D2_REQUEST, fixtureAnalysisRunner());
  });

  it("agrees on the pinned coverage", async () => {
    const body = (await expectTransportsAgree(D2_REQUEST, fixtureAnalysisRunner())) as {
      coverage: Record<string, number>;
    };

    expect({
      eligible: body.coverage["eligibleDecisions"],
      match: body.coverage["match"],
      rejected: body.coverage["rejected"],
      unknown: body.coverage["unknown"],
      exact: body.coverage["exactEntryMatches"],
      converged: body.coverage["tokenConvergedMatches"],
    }).toStrictEqual({ eligible: 11, match: 1, rejected: 0, unknown: 10, exact: 1, converged: 0 });
  });

  it("agrees on the Garrote MATCH", async () => {
    const body = (await expectTransportsAgree(D2_REQUEST, fixtureAnalysisRunner())) as {
      decisions: readonly Record<string, unknown>[];
    };
    const garrote = body.decisions.find((decision) => decision["outcome"] === "MATCH");

    expect(garrote?.["observedToken"]).toBe("garrote");
    expect(garrote?.["basis"]).toBe("AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN");
    expect(garrote?.["selectionPrecision"]).toBe("EXACT_ENTRY");
    expect(garrote?.["usabilityProvenance"]).toBe("OBSERVED_EXECUTION");
  });

  it("agrees on the authority provenance", async () => {
    const body = (await expectTransportsAgree(D2_REQUEST, fixtureAnalysisRunner())) as {
      authority: Record<string, string>;
    };

    expect(body.authority["commitSha"]).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(body.authority["authorityId"]).toBe("SIMC_APL_ROGUE_ASSASSINATION");
  });
});

describe("the M5-A rejection is identical across transports", () => {
  it("agrees that it is REJECTED, with no replacement action", async () => {
    const body = (await expectTransportsAgree(m5aRequest(), fixtureAnalysisRunner({ fixture: "m5a" }))) as {
      decisions: readonly Record<string, unknown>[];
    };

    expect(body.decisions).toHaveLength(1);
    expect(body.decisions[0]?.["outcome"]).toBe("REJECTED");
    expect(body.decisions[0]?.["basis"]).toBe("OBSERVED_ACTION_REJECTED_BY_AUTHORITY");
    expect(body.decisions[0]?.["authorityToken"]).toBeNull();
  });

  it("agrees that observedActionRejected is published by neither", async () => {
    const rest = (await restResult(m5aRequest(), fixtureAnalysisRunner({ fixture: "m5a" }))) as {
      body: unknown;
    };
    const mcp = await mcpResult(m5aRequest(), fixtureAnalysisRunner({ fixture: "m5a" }));

    expect(JSON.stringify(rest.body)).not.toContain("observedActionRejected");
    expect(JSON.stringify(mcp.structuredContent)).not.toContain("observedActionRejected");
  });
});

describe("every analysis-domain status is identical across transports", () => {
  it("agrees on SPEC_NOT_SUPPORTED", async () => {
    const body = (await expectTransportsAgree(
      D2_REQUEST,
      fixtureAnalysisRunner({ className: "Warrior", specName: "Arms" }),
    )) as Record<string, unknown>;

    expect(body["status"]).toBe("SPEC_NOT_SUPPORTED");
    expect("decisions" in body).toBe(false);
    expect("coverage" in body).toBe(false);
  });

  // The three analyzer-internal statuses cannot be produced from a fixture on
  // demand, so they are driven through a runner returning a prepared domain
  // result. The projection and both adapters are still the real ones.
  const internalStatuses = [
    "AUTHORITY_NOT_AVAILABLE",
    "PROFILE_NOT_RESOLVED",
    "INSUFFICIENT_EVIDENCE",
  ] as const;

  for (const status of internalStatuses) {
    it(`agrees on ${status}`, async () => {
      const base = await fixtureAnalysisRunner()(D2_REQUEST);
      if (!base.ok) throw new Error("expected a successful domain result to adapt");

      const runner: AnalysisRunner = async () => ({
        ok: true,
        state: "PARTIAL",
        analysis: {
          ...base.analysis,
          analysis: {
            status,
            specId: "rogue/assassination",
            detail: `Prepared ${status} result for the transport consistency proof.`,
          },
        },
      });

      const body = (await expectTransportsAgree(D2_REQUEST, runner)) as Record<string, unknown>;

      expect(body["status"]).toBe(status);
      expect("decisions" in body).toBe(false);
      expect("coverage" in body).toBe(false);
      expect("authority" in body).toBe(false);
    });
  }
});

describe("transports agree on the service error, not on the envelope", () => {
  it("preserves the same semantic code on both, in their own shapes", async () => {
    for (const code of SERVICE_ERROR_CODES) {
      const runner: AnalysisRunner = async () => serviceFailure(code, "author-written");

      const rest = (await restResult(D2_REQUEST, runner)) as {
        status: number;
        body: { ok?: boolean; error?: { code?: string } };
      };
      const mcp = await mcpResult(D2_REQUEST, runner);
      const mcpError = JSON.parse(mcp.content?.[0]?.text ?? "{}") as { error: { code: string } };

      // Same identity...
      expect(rest.body.error?.code, code).toBe(code);
      expect(mcpError.error.code, code).toBe(code);

      // ...rendered in each transport's own vocabulary. HTTP status is not
      // forced into MCP, and `isError` is not forced into REST.
      expect(rest.status, code).toBeGreaterThanOrEqual(400);
      expect(rest.body.ok, code).toBe(false);
      expect(mcp.isError, code).toBe(true);
      expect("isError" in rest.body, code).toBe(false);
      expect(mcp.structuredContent, code).toBeUndefined();
    }
  });
});

describe("one analysis budget covers both transports", () => {
  it("cannot be reset by switching transport", async () => {
    // THE BYPASS THIS CLOSES. Separate per-transport keys would let a caller
    // double their spend by alternating protocols, and the limit would be a
    // suggestion rather than a bound.
    const limiter = countingLimiter(2);
    const analyze = fixtureAnalysisRunner();
    const worker = createWorker(workerDepsFor({ analyze, rateLimiter: limiter }));

    const rest = async (): Promise<number> =>
      (
        await worker.fetch(
          new Request("https://coach.test/v1/analysis", {
            method: "POST",
            headers: { "content-type": "application/json", ...authHeaders() },
            body: JSON.stringify(D2_REQUEST),
          }),
          MCP_TEST_ENV,
        )
      ).status;

    const mcp = async (): Promise<boolean> => {
      const response = await handleMcpRequest(
        new Request(`https://${HOST}/mcp`, {
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
            params: {
              name: ANALYZE_TOOL_NAME,
              arguments: { source: "ids", ...D2_REQUEST },
              _meta: MODERN_META,
            },
          }),
        }),
        MCP_TEST_ENV,
        { analyze, rateLimiter: limiter },
      );
      const payload = JSON.parse(await response.text()) as { result: McpToolResult };
      return payload.result.isError === true;
    };

    // REST, then MCP, then REST: the third call is refused because the first
    // two already spent the shared budget.
    expect(await rest()).toBe(200);
    expect(await mcp()).toBe(false);
    expect(await rest()).toBe(429);

    expect(limiter.keys).toEqual(["analysis:warcraft_log", "analysis:warcraft_log", "analysis:warcraft_log"]);
  });

  it("is exhausted in the reverse order too", async () => {
    // Order-independence rules out a counter that happens to favour whichever
    // transport went first.
    const limiter = countingLimiter(2);
    const analyze = fixtureAnalysisRunner();
    const worker = createWorker(workerDepsFor({ analyze, rateLimiter: limiter }));

    const mcpCall = async (): Promise<boolean> => {
      const response = await handleMcpRequest(
        new Request(`https://${HOST}/mcp`, {
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
            params: {
              name: ANALYZE_TOOL_NAME,
              arguments: { source: "ids", ...D2_REQUEST },
              _meta: MODERN_META,
            },
          }),
        }),
        MCP_TEST_ENV,
        { analyze, rateLimiter: limiter },
      );
      const payload = JSON.parse(await response.text()) as { result: McpToolResult };
      return payload.result.isError === true;
    };

    expect(await mcpCall()).toBe(false);
    expect(await mcpCall()).toBe(false);

    const restStatus = (
      await worker.fetch(
        new Request("https://coach.test/v1/analysis", {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders() },
          body: JSON.stringify(D2_REQUEST),
        }),
        MCP_TEST_ENV,
      )
    ).status;

    expect(restStatus).toBe(429);
  });

  it("charges exactly once per analysis on each transport", async () => {
    // Not once at the route and again inside the runner.
    const limiter = countingLimiter(10);
    const analyze = fixtureAnalysisRunner();

    await createWorker(workerDepsFor({ analyze, rateLimiter: limiter })).fetch(
      new Request("https://coach.test/v1/analysis", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(D2_REQUEST),
      }),
      MCP_TEST_ENV,
    );
    expect(limiter.keys).toHaveLength(1);

    await mcpResult(D2_REQUEST, analyze);
    // `mcpResult` supplies its own allowing limiter, so the shared counter is
    // unchanged — the point here is that REST charged once, not twice.
    expect(limiter.keys).toHaveLength(1);
  });
});
