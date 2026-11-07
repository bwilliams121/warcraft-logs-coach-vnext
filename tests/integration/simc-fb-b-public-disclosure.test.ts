/**
 * SIMC-FB-B over the integrated public surfaces.
 *
 * BYTE-IDENTICAL. The digests below are of documents REST returned from the commit before this tranche
 * (fd0892d), measured before any edit. Findings on a specialization that does not read the fallback are
 * pinned to those bytes. Today that is every specialization.
 *
 * DISCLOSED ON EVERY TRANSPORT. No PUBLIC specialization reads the fallback yet (SIMC-FB-R wires it), so the
 * Assassination registration's view is wrapped here with real tier-3 facts from the committed record. The
 * rest is the production service, projection and both transports. This proves the disclosure, and says
 * nothing about how those decisions would really evaluate under the profile.
 */

import { describe, expect, it } from "vitest";

import { createWorker } from "../../src/api/worker.js";
import { PublicAnalysisResultSchema } from "../../src/contracts/analysis-contract.js";
import { PublicRaidNightResultSchema } from "../../src/contracts/raid-night-contract.js";
import type { AnalyzedEnvelope } from "../../src/findings/analysis-envelope.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { RAID_NIGHT_TOOL_NAME } from "../../src/mcp/tools/analyze-raid-night.js";
import { renderReportMarkdown } from "../../src/reporting/fight-report.js";
import type { AnalysisRunner } from "../../src/services/analysis-runner.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import type { AnalysisServiceResult } from "../../src/services/result.js";
import {
  ALLOWING_LIMITER,
  D2_REQUEST,
  MCP_TEST_ENV,
  authHeaders,
  fixedRaidNightRunner,
  fixtureAnalysisRunner,
  m5aRequest,
  workerDepsFor,
} from "../support/analysis-transports.js";
import { productionCatalogWith, productionRegistrationFor } from "../support/catalog.js";
import { ASSASSINATION_ACTOR_B, m5aFight } from "../support/m5a-fixture.js";
import {
  aggregateOf,
  cellOf,
  hundredCellAggregate,
  rosterFightFor,
  rosterPlayerFor,
} from "../support/raid-night-fixture.js";
import { everyDecisionProfileRelative, realProfileFacts } from "../support/simc-profile-facts.js";
import { UNSUPPORTED_WCL_IDENTITY } from "../support/unsupported-subject.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const TOKEN = "fake-analysis-token-not-real";
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "simc-fb-b", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;
const NIGHT_REQUEST = { reportCode: "aBcDeFgH12345678", fightIds: [1, 2] };

let nextId = 1;

async function restText(path: string, body: object, deps: Parameters<typeof workerDepsFor>[0]) {
  const response = await createWorker(workerDepsFor({ rateLimiter: ALLOWING_LIMITER, ...deps })).fetch(
    new Request(`https://${HOST}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }),
    MCP_TEST_ENV,
  );
  expect(response.status).toBe(200);
  return await response.text();
}

async function mcpStructured(tool: string, args: object, deps: object): Promise<unknown> {
  const response = await handleMcpRequest(
    new Request(`https://${HOST}/mcp`, {
      method: "POST",
      headers: {
        host: HOST,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${TOKEN}`,
        "mcp-method": "tools/call",
        "mcp-name": tool,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId++,
        method: "tools/call",
        params: { name: tool, arguments: args, _meta: MODERN_META },
      }),
    }),
    MCP_TEST_ENV,
    { analyze: fixtureAnalysisRunner(), rateLimiter: ALLOWING_LIMITER, ...deps },
  );
  const payload = JSON.parse(await response.text()) as {
    result: { isError?: boolean; structuredContent?: unknown };
  };
  expect(payload.result.isError ?? false).toBe(false);
  return payload.result.structuredContent;
}

const sha256 = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

describe("a specialization that does not read the fallback is byte-identical", () => {
  it.each([
    [
      "M5-A rejections",
      "/v1/analysis",
      () => m5aRequest(),
      () => ({ analyze: fixtureAnalysisRunner({ fixture: "m5a" }) }),
      "37cc7d2dc3fd686bf5987e718d2e57e94428606a1a9879262be0ba895ede3249",
    ],
    [
      "M5-D2 partial",
      "/v1/analysis",
      () => D2_REQUEST,
      () => ({ analyze: fixtureAnalysisRunner() }),
      "09f5e8c2c2ea642406e2aae0ac12a2094c0eedd3c536b29b7848faf3f04d1707",
    ],
    [
      "unsupported specialization",
      "/v1/analysis",
      () => D2_REQUEST,
      () => ({ analyze: fixtureAnalysisRunner(UNSUPPORTED_WCL_IDENTITY) }),
      "955b0effd1b3824f3a7f21bdc682373c552229df71c0a7365cd6aef4eefabde2",
    ],
    [
      "mixed raid night",
      "/v1/raid-night",
      () => NIGHT_REQUEST,
      () => ({ raidNight: fixedRaidNightRunner(hundredCellAggregate()).runner }),
      "d902fa4e33cbb9ad456c55c15c15612f5f94ca5bcf58070d7db79f17accab5ec",
    ],
  ] as const)("%s", async (_name, path, request, deps, digest) => {
    const text = await restText(path, request(), deps());
    expect(await sha256(text)).toBe(digest);
    expect(text).not.toMatch(/simc_?profile|encounterState|encounterStateBasis/i);
  });
});

/** The production service over the M5-A rejection fixture, with its view carrying real tier-3 facts. */
function taggedRunner(): AnalysisRunner {
  const facts = realProfileFacts();
  const production = productionRegistrationFor("rogue/assassination");
  const registry = productionCatalogWith({
    ...production,
    observedDecisionView: (analysis: AnalyzedEnvelope) =>
      everyDecisionProfileRelative(production.observedDecisionView(analysis), facts),
  } as typeof production);
  const fight = m5aFight();
  const deps: AnalysisServiceDeps = {
    env: MCP_TEST_ENV,
    preflight: async () => ({
      ok: true,
      identity: {
        report: { code: fight.report.code, revision: fight.report.revision, startTime: 0, endTime: 0 },
        data: fight.data,
        fight: {
          id: fight.fight.id,
          name: fight.fight.name,
          encounterId: fight.fight.encounterId,
          difficulty: fight.fight.difficulty,
          startTime: fight.fight.startTimeMs,
          endTime: fight.fight.endTimeMs,
        },
        player: {
          sourceId: ASSASSINATION_ACTOR_B,
          name: "Fixtureplayer",
          className: "Rogue",
          specName: "Assassination",
        },
      },
      rateLimit: undefined,
    }),
    ingest: async () => ({ ok: true, fight: m5aFight(), rateLimit: undefined }),
    registry,
  };
  return async (input: unknown): Promise<AnalysisServiceResult> => await analyzeFight(input, deps);
}

describe("the disclosure on REST and MCP alike", () => {
  it("the single-fight document marks each decision, states the coverage and carries the provenance", async () => {
    const analyze = taggedRunner();
    const rest = JSON.parse(await restText("/v1/analysis", m5aRequest(), { analyze })) as unknown;
    const mcp = await mcpStructured(ANALYZE_TOOL_NAME, { source: "ids", ...m5aRequest() }, { analyze });
    expect(mcp).toEqual(rest);
    const document = PublicAnalysisResultSchema.parse(rest);
    if (document.status !== "ANALYZED") throw new Error(document.status);

    expect(document.decisions.length).toBeGreaterThan(0);
    expect(document.decisions.every((decision) => decision.encounterState !== undefined)).toBe(true);
    const counts = {
      decisions: document.coverage.eligibleDecisions,
      match: document.coverage.match,
      rejected: document.coverage.rejected,
      unknown: document.coverage.unknown,
    };
    expect(document.simcProfileEvaluation?.coverage).toEqual(counts);
    expect(counts.rejected).toBeGreaterThan(0);
    expect(document.simcProfileEvaluation?.encounterStateObserved).toBe(false);
    expect(document.simcProfileEvaluation?.sources[0]).toMatchObject({
      category: "SIMC_PROFILE_FALLBACK",
      clientBuild: "12.1.0.69933",
      aplAuthorityId: "SIMC_APL_ROGUE_ASSASSINATION",
    });

    // The TLDR and the report say the same, and neither calls the state proven.
    if (document.tldr?.assessment !== "ASSESSED") throw new Error("no TLDR");
    expect(document.tldr.gameplay).toMatchObject({ simcProfileRelative: counts });
    expect(document.tldr.disclosures).toContain("DECISIONS_EVALUATED_UNDER_SIMC_PROFILE");
    expect(
      document.tldr.highlights.every((item) => item.encounterStateBasis === "SIMC_PROFILE_RELATIVE"),
    ).toBe(true);
    expect(document.tldr.lines.join("\n")).not.toMatch(/in the proven state/);
    expect(document.tldr.lines.join("\n")).toMatch(
      /under the pinned SimC profile assumptions, the priority would/i,
    );

    if (document.report?.assessment !== "ASSESSED") throw new Error("no report");
    const entries = document.report.categories.flatMap((section) => section.prioritized);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.stateEvidence === "SIMC_PROFILE_RELATIVE")).toBe(true);
    expect(document.report.markdown).not.toMatch(/in the proven state/);
    expect(renderReportMarkdown(document.report)).toBe(document.report.markdown);

    // Modeled state moves no actionability.
    expect(entries.some((entry) => entry.actionability === "DECISION_PROVEN_ACTIONABLE")).toBe(false);
  });

  it("the raid night carries it per cell, in coverage, in recurrence and in the disclosure", async () => {
    const runnerResult = await taggedRunner()(m5aRequest());
    if (!runnerResult.ok) throw new Error("no analysis");
    const { analysis } = runnerResult;
    const cell = cellOf(analysis);
    const fightId = analysis.identity.fight.id;
    const sourceId = analysis.identity.player.sourceId;
    const aggregate = aggregateOf({
      players: [rosterPlayerFor({ sourceId })],
      fights: [rosterFightFor({ fightId, participants: [{ sourceId, specName: "Assassination" }] })],
      cells: [cell],
    });
    const raidNight = fixedRaidNightRunner(aggregate).runner;
    const request = { reportCode: "aBcDeFgH12345678", fightIds: [fightId] };
    const rest = JSON.parse(await restText("/v1/raid-night", request, { raidNight })) as unknown;
    const mcp = await mcpStructured(
      RAID_NIGHT_TOOL_NAME,
      { source: "ids", ...request },
      { analyzeRaidNight: raidNight },
    );
    expect(mcp).toEqual(rest);
    const night = PublicRaidNightResultSchema.parse(rest);

    const [published] = night.cells;
    if (published?.kind !== "ANALYZED") throw new Error("no analyzed cell");
    expect(published.simcProfileEvaluation?.encounterStateObserved).toBe(false);
    expect(published.simcProfileEvaluation?.sources[0]?.clientBuild).toBe("12.1.0.69933");
    expect(night.coverage.simcProfileRelative?.rejected).toBe(night.coverage.rejectedTotal);
    expect(night.coverage.rejectedTotal).toBeGreaterThan(0);
    expect(night.recurrence.rejectedPatterns).toEqual([]);
    expect(night.recurrence.simcProfileRelativeRejectedPatterns?.length).toBeGreaterThan(0);
    expect(night.coverageDisclosure?.disclosures).toContain("DECISIONS_EVALUATED_UNDER_SIMC_PROFILE");
    expect(night.coverageDisclosure?.lines[0]).toMatch(/^Partial analysis: /);
  });
});
