/**
 * M10-A: a second, internal-only registration changes nothing about
 * Assassination, and nothing about the unsupported Protection Paladin path.
 *
 * The fixture registration (`tests/support/internal-fixture-registration.ts`)
 * is registered under the internal `paladin/protection` id with the opposite
 * ingestion requirement to Assassination's. Everything below is measured with
 * the production catalog alone and with the fixture added — in both orders —
 * over the real regression-corpus fixtures.
 */

import { describe, expect, it, vi } from "vitest";

import { createWorker } from "../../src/api/worker.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import type { AnalysisRunner } from "../../src/services/analysis-runner.js";
import { ANALYZER_REGISTRATIONS, type AnalyzerRegistration } from "../../src/services/analyzer-registry.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import {
  ALLOWING_LIMITER,
  MCP_TEST_ENV,
  authHeaders,
  workerDepsFor,
} from "../support/analysis-transports.js";
import { corpusFight } from "../support/corpus/fight.js";
import { internalFixtureRegistration } from "../support/internal-fixture-registration.js";
import {
  M5D2_ACTOR,
  REPORT_CODE,
  assassinationSnapshot,
  fakePorts,
  runNight,
} from "../support/raid-night-orchestration-fixture.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m10a-invariance", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

const D2 = "wcl-assassination-d2-decision-corpus";
const GTKB = "wcl-assassination-high-parse-opener";

function identityFor(
  fight: CombatFight,
  actorId: number,
  className: string,
  specName: string,
): FightIdentity {
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
    player: { sourceId: actorId, name: "Corpusplayer", className, specName },
  };
}

interface Run {
  readonly deps: AnalysisServiceDeps;
  readonly request: { reportCode: string; fightId: number; sourceId: number };
  readonly ingest: ReturnType<typeof vi.fn<CombatIngestionPort>>;
  readonly fixtureRuns: () => number;
}

function runFor(
  artifactId: string,
  actorId: number,
  className: string,
  specName: string,
  registry: readonly AnalyzerRegistration[],
  fixtureRuns: () => number,
): Run {
  const fight = corpusFight(artifactId);
  const identity = identityFor(fight, actorId, className, specName);
  const preflight: PreflightPort = async () => ({ ok: true, identity, rateLimit: undefined });
  const ingest = vi.fn<CombatIngestionPort>(async () => ({ ok: true, fight, rateLimit: undefined }));
  return {
    deps: { env: MCP_TEST_ENV, preflight, ingest, registry },
    request: { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: actorId },
    ingest,
    fixtureRuns,
  };
}

/** A counting fixture: any invocation is recorded AND still throws. */
function countingFixture(): { readonly registration: AnalyzerRegistration; runs: () => number } {
  let runs = 0;
  const registration = internalFixtureRegistration({
    onAnalyze: () => {
      runs += 1;
      throw new Error("the internal fixture must never run");
    },
  });
  return { registration, runs: () => runs };
}

function productionRegistration(): AnalyzerRegistration {
  const registration = ANALYZER_REGISTRATIONS[0];
  if (registration === undefined) throw new Error("the production catalog is empty");
  return registration;
}
const ASSASSINATION = productionRegistration();

function catalogs(): readonly {
  readonly label: string;
  readonly registry: readonly AnalyzerRegistration[];
  runs: () => number;
}[] {
  const after = countingFixture();
  const before = countingFixture();
  return [
    { label: "production alone", registry: [ASSASSINATION], runs: () => 0 },
    { label: "fixture after", registry: [ASSASSINATION, after.registration], runs: after.runs },
    { label: "fixture before", registry: [before.registration, ASSASSINATION], runs: before.runs },
  ];
}

describe("an internal-only second registration does not move Assassination", () => {
  for (const artifact of [D2, GTKB]) {
    const actorId = artifact === D2 ? 19 : 25;

    it(`${artifact}: FightAnalysis is deep-equal, the public document byte-identical, ingestion identical`, async () => {
      const results = [];
      for (const { registry, runs, label } of catalogs()) {
        const run = runFor(artifact, actorId, "Rogue", "Assassination", registry, runs);
        const result = await analyzeFight(run.request, run.deps);
        expect(result.ok, label).toBe(true);
        if (!result.ok) return;
        expect(result.analysis.analysis.status, label).toBe("ANALYZED");
        expect(run.fixtureRuns(), label).toBe(0);
        results.push({
          label,
          result,
          publicJson: JSON.stringify(projectAnalysisResult(result.analysis)),
          ingestArgs: run.ingest.mock.calls.map((call) => call[0]),
        });
      }
      const [reference, ...others] = results;
      if (reference === undefined) throw new Error("no runs");
      // Non-vacuous: real decisions were compared.
      expect(
        reference.result.ok && reference.result.analysis.observedDecisions?.decisions.length,
      ).toBeGreaterThan(0);
      for (const other of others) {
        expect(other.result, other.label).toEqual(reference.result);
        expect(other.publicJson, other.label).toBe(reference.publicJson);
        expect(other.ingestArgs, other.label).toEqual(reference.ingestArgs);
        expect(other.ingestArgs[0], other.label).toMatchObject({
          scope: "PLAYER_CONTEXT",
          includeResources: true,
        });
      }
    });
  }
});

describe("the unsupported Protection Paladin path is unchanged by the fixture", () => {
  for (const { label, registry, runs } of catalogs()) {
    it(`${label}: SPEC_NOT_SUPPORTED, no ingestion, the fixture never runs`, async () => {
      const run = runFor(D2, 19, "Paladin", "Protection", registry, runs);
      const result = await analyzeFight(run.request, run.deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state).toBe("SPEC_NOT_SUPPORTED");
      expect(result.analysis.analysis.status).toBe("SPEC_NOT_SUPPORTED");
      expect(result.analysis.specId).toBeNull();
      expect(result.analysis.analyzerId).toBeNull();
      expect(result.analysis.observedDecisions).toBeNull();
      expect(run.ingest).not.toHaveBeenCalled();
      expect(run.fixtureRuns()).toBe(0);
      // It still projects, as the ordinary unsupported document.
      const projected = projectAnalysisResult(result.analysis);
      expect(projected.status).toBe("SPEC_NOT_SUPPORTED");
      expect(projected.specialization).toEqual({ specId: null, gameplaySupported: false });
    });
  }
});

describe("REST and MCP agree, with and without the fixture", () => {
  async function rest(ids: Run["request"], analyze: AnalysisRunner): Promise<unknown> {
    const response = await createWorker(workerDepsFor({ analyze, rateLimiter: ALLOWING_LIMITER })).fetch(
      new Request(`https://${HOST}/v1/analysis`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(ids),
      }),
      MCP_TEST_ENV,
    );
    expect(response.status).toBe(200);
    return await response.json();
  }

  let nextId = 1;
  async function mcp(
    ids: Run["request"],
    analyze: AnalysisRunner,
  ): Promise<{ structured: unknown; text: unknown }> {
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
          id: nextId++,
          method: "tools/call",
          params: { name: ANALYZE_TOOL_NAME, arguments: { source: "ids", ...ids }, _meta: MODERN_META },
        }),
      }),
      MCP_TEST_ENV,
      { analyze, rateLimiter: ALLOWING_LIMITER },
    );
    const payload = JSON.parse(await response.text()) as {
      result: { structuredContent?: unknown; content?: readonly { text: string }[]; isError?: boolean };
    };
    expect(payload.result.isError).toBeUndefined();
    return {
      structured: payload.result.structuredContent,
      text: JSON.parse(payload.result.content?.[0]?.text ?? "null") as unknown,
    };
  }

  for (const subject of [
    { label: "Assassination", className: "Rogue", specName: "Assassination", status: "ANALYZED" },
    {
      label: "Protection Paladin",
      className: "Paladin",
      specName: "Protection",
      status: "SPEC_NOT_SUPPORTED",
    },
  ]) {
    it(`${subject.label}: identical documents across transports and catalogs`, async () => {
      const documents: string[] = [];
      for (const { registry, runs, label } of catalogs()) {
        const run = runFor(D2, 19, subject.className, subject.specName, registry, runs);
        const analyze: AnalysisRunner = async (input) => await analyzeFight(input, run.deps);
        const restBody = await rest(run.request, analyze);
        const mcpBody = await mcp(run.request, analyze);
        expect(mcpBody.structured, label).toEqual(restBody);
        expect(mcpBody.text, label).toEqual(restBody);
        expect((restBody as { status: string }).status, label).toBe(subject.status);
        expect(run.fixtureRuns(), label).toBe(0);
        documents.push(JSON.stringify(restBody));
      }
      expect(new Set(documents).size).toBe(1);
    });
  }
});

describe("raid-night cells are unchanged by the fixture", () => {
  const PALADIN = 7;
  const ROGUE_B = 23;

  it("deep-equal aggregate, byte-identical public document, identical ingestion", async () => {
    const outputs = [];
    for (const { registry, runs, label } of catalogs()) {
      const snapshot = assassinationSnapshot({
        fightIds: [1, 2],
        sourceIds: [PALADIN, M5D2_ACTOR, ROGUE_B],
        specNameFor: (_fightId, sourceId) => (sourceId === PALADIN ? "Protection" : "Assassination"),
        absentOn: new Map([[2, [ROGUE_B]]]),
      });
      const ports = fakePorts({ snapshot });
      const run = await runNight(
        { reportCode: REPORT_CODE, fightIds: [1, 2] },
        { ...ports, deps: { ...ports.deps, registry } },
      );
      expect(run.ok, label).toBe(true);
      if (!run.ok) return;
      expect(runs(), label).toBe(0);
      outputs.push({
        label,
        aggregate: run.aggregate,
        publicJson: JSON.stringify(projectRaidNightResult(run.aggregate)),
        ingested: ports.ingestedFightIds(),
      });
    }
    const [reference, ...others] = outputs;
    if (reference === undefined) throw new Error("no runs");
    expect(reference.aggregate.coverage.cellsAnalyzed).toBe(3);
    expect(reference.aggregate.coverage.cellsSpecNotSupported).toBe(2);
    for (const other of others) {
      expect(other.aggregate, other.label).toEqual(reference.aggregate);
      expect(other.publicJson, other.label).toBe(reference.publicJson);
      expect(other.ingested, other.label).toEqual(reference.ingested);
    }
  });
});
