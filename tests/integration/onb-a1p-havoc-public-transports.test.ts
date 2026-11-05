/**
 * ONB-A1P: a real Havoc Demon Hunter identity resolves PUBLICLY on both transports,
 * through the real Worker and the real MCP handler, over fake-local evidence (the
 * committed first 90 s of b1Pm fight 48, actor 18). No Warcraft Logs request and no
 * credential.
 *
 *   REST    /v1/analysis identifies DemonHunter/Havoc, dispatches the Havoc analyzer
 *           once and returns schema v1 carrying the ONB-A1 outcomes unchanged.
 *   MCP     the analyze tool returns the SAME public document, and its derived
 *           description names the validated hero tree and how narrow the slice is.
 *   BEFORE  Vengeance and the Devastation Evoker sentinel are still SPEC_NOT_SUPPORTED:
 *           promotion named Havoc and nothing else.
 *   REPEAT  the same request twice produces the identical document.
 *   AUTH    no token, no analysis, and no leak.
 */

import { describe, expect, it } from "vitest";

import { createWorker } from "../../src/api/worker.js";
import { PublicAnalysisResultSchema } from "../../src/contracts/analysis-contract.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import type { AnalysisRunner } from "../../src/services/analysis-runner.js";
import { PUBLIC_SPECIALIZATION_DESCRIPTIONS } from "../../src/services/analyzer-registry.js";
import { HAVOC_DEMON_HUNTER_ANALYZER_ID } from "../../src/specs/demonhunter/havoc/spec.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import {
  ALLOWING_LIMITER,
  MCP_TEST_ENV,
  authHeaders,
  workerDepsFor,
} from "../support/analysis-transports.js";
import { countedProductionCatalog } from "../support/catalog.js";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";
import { stateOf } from "../support/corpus/fight.js";
import { committedCorpusFiles, validateEvidenceArchive } from "../support/corpus/loader.js";
import { CURRENT_UNSUPPORTED_SUBJECT } from "../support/unsupported-subject.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const TOKEN = "fake-analysis-token-not-real";
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "onb-a1p-transports", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

const ACTOR = 18;
const SEGMENT = "wcl-b1pm-fight-48-havoc-demon-hunter-18-decisions.seg-0-90";

let nextId = 1;

interface Subject {
  readonly sourceId: number;
  readonly className: string;
  readonly specName: string;
}

const havoc: Subject = { sourceId: ACTOR, className: "DemonHunter", specName: "Havoc" };

async function realFight(): Promise<CombatFight> {
  const loaded = await validateEvidenceArchive(committedEvidenceArchiveFiles(), committedCorpusFiles());
  if (!loaded.ok) throw new Error("the evidence archive does not validate");
  const artifact = loaded.archive.artifacts.find((entry) => entry.record.artifactId === SEGMENT);
  if (artifact === undefined) throw new Error("the Havoc segment is not in the archive");
  return stateOf(loaded.archive, artifact).fight;
}

function identityFor(fight: CombatFight, subject: Subject): FightIdentity {
  return {
    report: {
      code: fight.report.code,
      revision: fight.report.revision,
      startTime: fight.report.startTimeUnixMs,
      endTime: fight.report.endTimeUnixMs,
    },
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
      sourceId: subject.sourceId,
      name: "Corpusplayer",
      className: subject.className,
      specName: subject.specName,
    },
  };
}

function localRunner(fight: CombatFight, subject: Subject) {
  const counted = countedProductionCatalog();
  const deps: AnalysisServiceDeps = {
    env: MCP_TEST_ENV,
    preflight: async () => ({ ok: true, identity: identityFor(fight, subject), rateLimit: undefined }),
    ingest: async () => ({ ok: true, fight, rateLimit: undefined }),
    registry: counted.registry,
  };
  const analyze: AnalysisRunner = async (input) => await analyzeFight(input, deps);
  return {
    analyze,
    ids: { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: subject.sourceId },
    calls: counted.calls,
  };
}

type Ids = ReturnType<typeof localRunner>["ids"];

async function restResult(
  ids: Ids,
  analyze: AnalysisRunner,
  headers: Record<string, string> = authHeaders(),
): Promise<{ status: number; body: unknown }> {
  const response = await createWorker(workerDepsFor({ analyze, rateLimiter: ALLOWING_LIMITER })).fetch(
    new Request(`https://${HOST}/v1/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
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
        params: { name: ANALYZE_TOOL_NAME, arguments: { source: "ids", ...ids }, _meta: MODERN_META },
      }),
    }),
    MCP_TEST_ENV,
    { analyze, rateLimiter: ALLOWING_LIMITER },
  );
  const payload = JSON.parse(await response.text()) as { result: McpToolResult };
  return payload.result;
}

describe("REST: a real Havoc Demon Hunter identity resolves publicly", () => {
  it("identifies DemonHunter/Havoc, dispatches only its analyzer, once, and publishes the ONB-A1 outcomes", async () => {
    const runner = localRunner(await realFight(), havoc);
    const rest = await restResult(runner.ids, runner.analyze);
    expect(rest.status).toBe(200);
    for (const [analyzerId, count] of Object.entries(runner.calls)) {
      expect(count, analyzerId).toBe(analyzerId === HAVOC_DEMON_HUNTER_ANALYZER_ID ? 1 : 0);
    }
    const parsed = PublicAnalysisResultSchema.safeParse(rest.body);
    expect(parsed.success).toBe(true);
    if (!parsed.success || parsed.data.status !== "ANALYZED") throw new Error("not analyzed");
    const document = parsed.data;
    expect(document.schemaVersion).toBe("warcraft-logs-coach.analysis/1");
    expect(document.specialization).toEqual({ specId: "demonhunter/havoc", gameplaySupported: true });
    expect(document.identity.player).toMatchObject({
      className: "DemonHunter",
      specName: "Havoc",
      sourceId: ACTOR,
    });
    expect(document.capability).toMatchObject({
      analysisKind: "OBSERVED_DECISION_AUTHORITY_VERIFICATION",
      matchMeaning: "AUTHORITY_COMPATIBLE_ONLY",
      scoresPerformance: false,
      unknownIsFirstClass: true,
      partialCoverageIsExpected: true,
    });
    expect(document.authority.authorityId).toBe("SIMC_APL_DEMONHUNTER_HAVOC");
    expect(document.coverage).toMatchObject({ eligibleDecisions: 76, match: 7, rejected: 4, unknown: 65 });
    const unknown = document.decisions.filter((decision) => decision.outcome === "UNKNOWN");
    expect(unknown).toHaveLength(65);
    for (const decision of unknown) expect(decision.authorityToken).toBeNull();
  });

  it("the same request twice produces the identical document", async () => {
    const fight = await realFight();
    const first = localRunner(fight, havoc);
    const second = localRunner(fight, havoc);
    expect(await restResult(second.ids, second.analyze)).toEqual(await restResult(first.ids, first.analyze));
  });

  it("promotion named Havoc and nothing else: Vengeance and the unsupported sentinel run no analyzer", async () => {
    const fight = await realFight();
    for (const subject of [
      { sourceId: ACTOR, className: "DemonHunter", specName: "Vengeance" },
      {
        sourceId: CURRENT_UNSUPPORTED_SUBJECT.sourceId,
        className: CURRENT_UNSUPPORTED_SUBJECT.expectedClassName,
        specName: CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName,
      },
    ]) {
      const runner = localRunner(fight, subject);
      const rest = await restResult(runner.ids, runner.analyze);
      expect(rest.status, subject.specName).toBe(200);
      expect(
        Object.values(runner.calls).every((count) => count === 0),
        subject.specName,
      ).toBe(true);
      expect(rest.body, subject.specName).toMatchObject({
        status: "SPEC_NOT_SUPPORTED",
        specialization: { specId: null, gameplaySupported: false },
        analyzerId: null,
      });
    }
  });

  it("the generic bearer behaviour is unchanged for the new specialization", async () => {
    const runner = localRunner(await realFight(), havoc);
    const denied = await restResult(runner.ids, runner.analyze, {});
    expect(denied.status).toBe(401);
    expect(Object.values(runner.calls).every((count) => count === 0)).toBe(true);
    const json = JSON.stringify(denied.body);
    expect(json).not.toContain(TOKEN);
    expect(json).not.toContain("demonhunter/havoc");
  });
});

describe("MCP: the same public semantics as REST", () => {
  it("structuredContent and the JSON in the text block are deeply equal to the REST body", async () => {
    const runner = localRunner(await realFight(), havoc);
    const rest = await restResult(runner.ids, runner.analyze);
    const mcp = await mcpResult(runner.ids, runner.analyze);
    expect(rest.status).toBe(200);
    expect(mcp.isError).toBeUndefined();
    expect(mcp.structuredContent).toEqual(rest.body);
    expect(JSON.parse(mcp.content?.[0]?.text ?? "{}")).toEqual(mcp.structuredContent);
    expect(PublicAnalysisResultSchema.safeParse(mcp.structuredContent).success).toBe(true);
    expect(runner.calls[HAVOC_DEMON_HUNTER_ANALYZER_ID]).toBe(2);
  });

  it("the tool's derived description names the validated hero tree and the narrow slice, without advertising a rotation review", () => {
    const { sentence, limits } = PUBLIC_SPECIALIZATION_DESCRIPTIONS;
    expect(sentence).toContain("Havoc Demon Hunter");
    const entry = limits.find((candidate) => candidate.analysis.includes("Havoc Demon Hunter analysis"));
    expect(entry?.analysis).toContain("VALIDATED FOR THE ALDRACHI REAVER HERO TREE ONLY");
    expect(entry?.analysis).toContain("Reaver's Glaive priority");
    expect(entry?.analysis).toContain("not a rotation review");
    expect(entry?.analysis).toContain("OUTSIDE_SUPPORTED_SLICE");
    expect(entry?.analysis).toContain("UNKNOWN is expected");
    expect(entry?.analysis).toContain("does not score performance");
    expect(entry?.raidNight).toContain("only for Aldrachi Reaver builds");
    for (const text of [entry?.analysis ?? "", entry?.raidNight ?? ""]) {
      expect(text).not.toMatch(/full (havoc )?rotation/i);
      expect(text).not.toMatch(/optimal|grade/i);
      expect(text).not.toMatch(/run_action_list|demonsurge_available|OUTSIDE_FIRST_SLICE/);
    }
  });
});
