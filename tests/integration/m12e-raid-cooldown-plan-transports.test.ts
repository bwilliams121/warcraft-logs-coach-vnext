/**
 * M12-E: REST and MCP feed the same application-service input with the same
 * plan semantics.
 *
 * The same `raidCooldownPlan`, sent as a REST body field and as an MCP tool
 * argument, reaches the one shared parser and comes back as the same public
 * document: same disclosure, same digest. Neither transport interprets the
 * plan. No Warcraft Logs request: the real service over the committed D2
 * fixture, with only the I/O ports faked.
 */

import { describe, expect, it } from "vitest";

import { createWorker } from "../../src/api/worker.js";
import { PublicAnalysisResultSchema } from "../../src/contracts/analysis-contract.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import {
  ALLOWING_LIMITER,
  D2_REQUEST,
  MCP_TEST_ENV,
  authHeaders,
  fixtureAnalysisRunner,
  workerDepsFor,
} from "../support/analysis-transports.js";
import { m5d2Fight } from "../support/m5d2-fixture.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m12e-transports", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

const FIGHT = m5d2Fight();
const PLAN = {
  format: "TIMELINE_NOTE",
  encounterId: FIGHT.fight.encounterId,
  difficulty: FIGHT.fight.difficulty ?? 0,
  defaultToleranceMs: 3_000,
  text: "time:3;ph:2;tag:Jymblú;spellid:98008;\ntime:10;ph:2;tag:everyone;text:Soak;",
};

async function rest(body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await createWorker(
    workerDepsFor({ analyze: fixtureAnalysisRunner(), rateLimiter: ALLOWING_LIMITER }),
  ).fetch(
    new Request(`https://${HOST}/v1/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }),
    MCP_TEST_ENV,
  );
  return { status: response.status, body: await response.json() };
}

async function mcp(args: unknown): Promise<{ isError?: boolean; structuredContent?: unknown }> {
  const response = await handleMcpRequest(
    new Request(`https://${HOST}/mcp`, {
      method: "POST",
      headers: {
        host: HOST,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...authHeaders(),
        "mcp-method": "tools/call",
        "mcp-name": ANALYZE_TOOL_NAME,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: ANALYZE_TOOL_NAME, arguments: args, _meta: MODERN_META },
      }),
    }),
    MCP_TEST_ENV,
    { analyze: fixtureAnalysisRunner(), rateLimiter: ALLOWING_LIMITER },
  );
  const payload = JSON.parse(await response.text()) as {
    result: { isError?: boolean; structuredContent?: unknown };
  };
  return payload.result;
}

describe("the same plan through REST and MCP", () => {
  it("produces the identical public document, disclosure and digest included", async () => {
    const viaRest = await rest({ ...D2_REQUEST, raidCooldownPlan: PLAN });
    const viaMcp = await mcp({ source: "ids", ...D2_REQUEST, raidCooldownPlan: PLAN });
    expect(viaRest.status).toBe(200);
    expect(viaMcp.isError).not.toBe(true);
    expect(viaMcp.structuredContent).toEqual(viaRest.body);
    const parsed = PublicAnalysisResultSchema.safeParse(viaRest.body);
    if (!parsed.success) throw new Error("not a public document");
    expect(parsed.data.raidCooldownPlan).toMatchObject({
      format: "TIMELINE_NOTE",
      assignmentCount: 1,
      importDiagnostics: [{ key: "NO_SPELL_ID", count: 1 }],
      assignmentEvaluation: { state: "NOT_EVALUATED", reason: "NO_PUBLIC_ASSIGNMENT_EVALUATOR" },
    });
  });

  it("without a plan, neither transport's document carries the key", async () => {
    const viaRest = await rest(D2_REQUEST);
    const viaMcp = await mcp({ source: "ids", ...D2_REQUEST });
    expect(viaMcp.structuredContent).toEqual(viaRest.body);
    expect(Object.keys(viaRest.body as object)).not.toContain("raidCooldownPlan");
  });

  it("an invalid plan is refused on both, never analyzed as 'no plan'", async () => {
    const bad = { ...PLAN, defaultToleranceMs: undefined };
    const viaRest = await rest({ ...D2_REQUEST, raidCooldownPlan: bad });
    expect(viaRest.status).toBe(400);
    const viaMcp = await mcp({ source: "ids", ...D2_REQUEST, raidCooldownPlan: bad });
    expect(viaMcp.isError).toBe(true);
    expect(viaMcp.structuredContent).toBeUndefined();
  });
});
