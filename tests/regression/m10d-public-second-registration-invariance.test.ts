/**
 * M10-D: the PUBLIC Protection Paladin registration moves nothing about
 * Assassination, is reached by every public path for a Protection subject,
 * and leaves the unsupported path intact for the canonical unsupported
 * specialization (Warrior/Arms, A7R6 fight 7 actor 4).
 *
 * SUPERSEDES two files whose premise M10-D removed:
 *
 *   tests/regression/m10a-second-registration-invariance.test.ts
 *       a test-owned INTERNAL_ONLY fixture row next to Assassination
 *   tests/regression/m10c-internal-registration-invariance.test.ts
 *       the real Protection row while it was INTERNAL_ONLY
 *
 * Both proved that a second registration in the catalog changed nothing for
 * Assassination and was unreachable publicly. The first half of that claim is
 * re-proven here over the two REAL public registrations in both catalog
 * orders; the second half is inverted on purpose — the Protection analyzer
 * now runs, exactly once, for exactly a Protection subject — and the
 * "unreachable" role passes to Arms, which has no registration at all.
 *
 * Every public path — the application service, REST, MCP, raid-night
 * orchestration — is run against the production catalog and a reversed one,
 * with both facades counted, for three real subjects.
 */

import { describe, expect, it, vi } from "vitest";

import { createWorker } from "../../src/api/worker.js";
import { PublicAnalysisResultSchema } from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import type { AnalysisRunner } from "../../src/services/analysis-runner.js";
import {
  analyzerForSpec,
  internalAnalyzerForSpec,
  ANALYZER_REGISTRATIONS,
  PRODUCTION_CATALOG,
  type AnalyzerRegistration,
} from "../../src/services/analyzer-registry.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import { resolveSpecIdentity } from "../../src/services/spec-identity.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import { PROTECTION_PALADIN_ANALYZER_ID } from "../../src/specs/paladin/protection/spec.js";
import { ASSASSINATION_ANALYZER_ID } from "../../src/specs/rogue/assassination/registration.js";
import {
  ALLOWING_LIMITER,
  MCP_TEST_ENV,
  authHeaders,
  workerDepsFor,
} from "../support/analysis-transports.js";
import { countedProductionCatalog } from "../support/catalog.js";
import { corpusFight } from "../support/corpus/fight.js";
import {
  M5D2_ACTOR,
  REPORT_CODE,
  assassinationSnapshot,
  fakePorts,
  runNight,
} from "../support/raid-night-orchestration-fixture.js";
import { CURRENT_UNSUPPORTED_SUBJECT, UNSUPPORTED_WCL_IDENTITY } from "../support/unsupported-subject.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m10d-invariance", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

const D2 = "wcl-assassination-d2-decision-corpus";
const GTKB = "wcl-assassination-high-parse-opener";
const PROT_OPENER = "wcl-protection-paladin-a7r6-opener";
const PROT_ACTOR = 7;
/** A7R6 fight 7 actor 4 — Warrior/Arms per the committed fight-context artifact. */
const ARMS_ACTOR = CURRENT_UNSUPPORTED_SUBJECT.sourceId;

interface Subject {
  readonly label: string;
  readonly artifact: string;
  readonly actorId: number;
  readonly className: string;
  readonly specName: string;
  readonly status: "ANALYZED" | "SPEC_NOT_SUPPORTED";
}

const ASSASSINATION_SUBJECT: Subject = {
  label: "Assassination",
  artifact: D2,
  actorId: 19,
  className: "Rogue",
  specName: "Assassination",
  status: "ANALYZED",
};
const PROTECTION_SUBJECT: Subject = {
  label: "the real Protection Paladin",
  artifact: PROT_OPENER,
  actorId: PROT_ACTOR,
  className: "Paladin",
  specName: "Protection",
  status: "ANALYZED",
};
const ARMS_SUBJECT: Subject = {
  label: "the real Arms Warrior",
  artifact: PROT_OPENER,
  actorId: ARMS_ACTOR,
  className: CURRENT_UNSUPPORTED_SUBJECT.expectedClassName,
  specName: CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName,
  status: "SPEC_NOT_SUPPORTED",
};

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
      sourceId: subject.actorId,
      name: "Corpusplayer",
      className: subject.className,
      specName: subject.specName,
    },
  };
}

interface Run {
  readonly deps: AnalysisServiceDeps;
  readonly request: { reportCode: string; fightId: number; sourceId: number };
  readonly ingest: ReturnType<typeof vi.fn<CombatIngestionPort>>;
}

function runFor(subject: Subject, registry: readonly AnalyzerRegistration[]): Run {
  const fight = corpusFight(subject.artifact);
  const identity = identityFor(fight, subject);
  const preflight: PreflightPort = async () => ({ ok: true, identity, rateLimit: undefined });
  const ingest = vi.fn<CombatIngestionPort>(async () => ({ ok: true, fight, rateLimit: undefined }));
  return {
    deps: { env: MCP_TEST_ENV, preflight, ingest, registry },
    request: { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: subject.actorId },
    ingest,
  };
}

/** The complete production catalog, counted, in production and reversed order. */
function catalogs(): readonly {
  readonly label: string;
  readonly registry: readonly AnalyzerRegistration[];
  readonly calls: Readonly<Record<string, number>>;
}[] {
  const production = countedProductionCatalog();
  const reversed = countedProductionCatalog();
  return [
    { label: "production order", registry: production.registry, calls: production.calls },
    { label: "reversed order", registry: [...reversed.registry].reverse(), calls: reversed.calls },
  ];
}

/** Every property name appearing anywhere in a JSON value. */
function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((entry) => keysOf(entry, into));
  else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      into.add(key);
      keysOf(entry, into);
    }
  }
  return into;
}

describe("the production catalog", () => {
  it("is exactly the three PUBLIC registrations (Retribution PUBLIC since M11-A5) plus the INTERNAL_ONLY Blood row (M11-B2), and both lookups answer alike for every public one", () => {
    expect(ANALYZER_REGISTRATIONS).toHaveLength(4);
    expect(ANALYZER_REGISTRATIONS.filter((row) => row.exposure === "PUBLIC")).toHaveLength(3);
    expect(
      ANALYZER_REGISTRATIONS.filter((row) => row.exposure === "INTERNAL_ONLY").map((row) => row.specId),
    ).toEqual(["deathknight/blood"]);
    expect(analyzerForSpec("paladin/retribution", PRODUCTION_CATALOG)?.exposure).toBe("PUBLIC");
    expect(internalAnalyzerForSpec("paladin/retribution", PRODUCTION_CATALOG)).toBe(
      analyzerForSpec("paladin/retribution", PRODUCTION_CATALOG),
    );
    expect(analyzerForSpec("paladin/protection", PRODUCTION_CATALOG)?.analyzerId).toBe(
      PROTECTION_PALADIN_ANALYZER_ID,
    );
    expect(analyzerForSpec("paladin/protection", PRODUCTION_CATALOG)?.exposure).toBe("PUBLIC");
    expect(internalAnalyzerForSpec("paladin/protection", PRODUCTION_CATALOG)).toBe(
      analyzerForSpec("paladin/protection", PRODUCTION_CATALOG),
    );
    expect(analyzerForSpec("rogue/assassination", PRODUCTION_CATALOG)?.exposure).toBe("PUBLIC");
  });

  it("public identity resolution accepts Paladin/Protection and Paladin/Retribution and still rejects Warrior/Arms", () => {
    expect(resolveSpecIdentity({ className: "Paladin", specName: "Protection" })).toEqual({
      ok: true,
      specId: "paladin/protection",
    });
    expect(resolveSpecIdentity({ className: "Paladin", specName: "Retribution" })).toEqual({
      ok: true,
      specId: "paladin/retribution",
    });
    expect(resolveSpecIdentity(UNSUPPORTED_WCL_IDENTITY)).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SPECIALIZATION",
    });
    expect(resolveSpecIdentity({ className: "Rogue", specName: "Assassination" })).toMatchObject({
      ok: true,
      specId: "rogue/assassination",
    });
  });
});

describe("Assassination is unchanged by the public second registration", () => {
  for (const artifact of [D2, GTKB]) {
    const subject: Subject = { ...ASSASSINATION_SUBJECT, artifact, actorId: artifact === D2 ? 19 : 25 };

    it(`${artifact}: FightAnalysis deep-equal, public document byte-identical, ingestion identical, zero Protection runs`, async () => {
      const results = [];
      for (const { registry, calls, label } of catalogs()) {
        const run = runFor(subject, registry);
        const result = await analyzeFight(run.request, run.deps);
        expect(result.ok, label).toBe(true);
        if (!result.ok) return;
        expect(result.analysis.analysis.status, label).toBe("ANALYZED");
        expect(calls[PROTECTION_PALADIN_ANALYZER_ID], label).toBe(0);
        expect(calls[ASSASSINATION_ANALYZER_ID], label).toBe(1);
        results.push({
          label,
          result,
          publicJson: JSON.stringify(projectAnalysisResult(result.analysis)),
          ingestArgs: run.ingest.mock.calls.map((call) => call[0]),
        });
      }
      const [reference, ...others] = results;
      if (reference === undefined) throw new Error("no runs");
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

describe("the REAL Protection Paladin subject through the application service", () => {
  for (const { label, registry, calls } of catalogs()) {
    it(`${label}: ANALYZED, PARTIAL, one ingestion at PLAYER_CONTEXT with resources, the Protection analyzer once`, async () => {
      const run = runFor(PROTECTION_SUBJECT, registry);
      const result = await analyzeFight(run.request, run.deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // The service state is PARTIAL, truthfully: 21 eligible decisions, none resolved.
      expect(result.state).toBe("PARTIAL");
      expect(result.analysis.analysis.status).toBe("ANALYZED");
      expect(result.analysis.specId).toBe("paladin/protection");
      expect(result.analysis.analyzerId).toBe(PROTECTION_PALADIN_ANALYZER_ID);
      expect(result.analysis.scope).toBe("PLAYER_CONTEXT");
      expect(result.analysis.observedDecisions).not.toBeNull();

      expect(run.ingest).toHaveBeenCalledTimes(1);
      expect(run.ingest.mock.calls[0]?.[0]).toMatchObject({
        sourceId: PROT_ACTOR,
        scope: "PLAYER_CONTEXT",
        includeResources: true,
      });
      expect(calls[PROTECTION_PALADIN_ANALYZER_ID]).toBe(1);
      expect(calls[ASSASSINATION_ANALYZER_ID]).toBe(0);
    });
  }

  it("projects publicly, validates, and carries the opener's totals with the projected exclusion tally", async () => {
    const documents: string[] = [];
    for (const { registry, label } of catalogs()) {
      const run = runFor(PROTECTION_SUBJECT, registry);
      const result = await analyzeFight(run.request, run.deps);
      if (!result.ok) throw new Error(label);

      // Until M10-D this threw InternalSpecExposureError.
      const projected = projectAnalysisResult(result.analysis);
      expect(PublicAnalysisResultSchema.safeParse(projected).success, label).toBe(true);
      expect(projected.specialization, label).toEqual({
        specId: "paladin/protection",
        gameplaySupported: true,
      });
      expect(projected.analyzerId, label).toBe(PROTECTION_PALADIN_ANALYZER_ID);
      if (projected.status !== "ANALYZED") throw new Error(projected.status);
      expect(projected.authority, label).toMatchObject({
        authorityId: "SIMC_APL_PALADIN_PROTECTION",
        artifactRevision: "simc-33622e9d-1",
        className: "paladin",
        specName: "protection",
      });
      expect(projected.coverage, label).toMatchObject({
        eligibleDecisions: 21,
        match: 0,
        rejected: 0,
        unknown: 21,
        resolvedComparisons: 0,
        excludedCastCount: 24,
        exclusions: [
          { key: "NON_GCD_ACTION", count: 22 },
          { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 1 },
          { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
        ],
      });
      expect(projected.decisions, label).toHaveLength(21);
      expect(projected.exclusions, label).toHaveLength(24);

      // No internal-only reason and no withheld field reaches the wire.
      const json = JSON.stringify(projected);
      expect(json, label).not.toContain("MELEE_SWING");
      expect(json, label).not.toContain("TRANSITION_UNSUPPORTED");
      expect(json, label).not.toContain("DIVERGENT_GCD_OUTCOMES");
      const keys = keysOf(projected);
      for (const withheld of [
        "rawBlocker",
        "observedActionRejected",
        "actorId",
        "domains",
        "holyPower",
        "build",
        "resolved",
        "diagnostics",
        "scope",
      ]) {
        expect(keys.has(withheld), `${label}: ${withheld}`).toBe(false);
      }
      documents.push(json);
    }
    // Catalog order cannot change the published document.
    expect(new Set(documents).size).toBe(1);
  });
});

describe("the REAL Arms Warrior subject keeps the unsupported path", () => {
  for (const { label, registry, calls } of catalogs()) {
    it(`${label}: SPEC_NOT_SUPPORTED, zero ingestion, neither analyzer runs`, async () => {
      const run = runFor(ARMS_SUBJECT, registry);
      const result = await analyzeFight(run.request, run.deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state).toBe("SPEC_NOT_SUPPORTED");
      expect(result.analysis.analysis.status).toBe("SPEC_NOT_SUPPORTED");
      expect(result.analysis.specId).toBeNull();
      expect(result.analysis.analyzerId).toBeNull();
      expect(result.analysis.scope).toBeNull();
      expect(result.analysis.observedDecisions).toBeNull();
      expect(run.ingest).not.toHaveBeenCalled();
      expect(calls[PROTECTION_PALADIN_ANALYZER_ID]).toBe(0);
      expect(calls[ASSASSINATION_ANALYZER_ID]).toBe(0);
      const projected = projectAnalysisResult(result.analysis);
      expect(projected.status).toBe("SPEC_NOT_SUPPORTED");
      expect(projected.specialization).toEqual({ specId: null, gameplaySupported: false });
      expect(projected.identity.player).toMatchObject(UNSUPPORTED_WCL_IDENTITY);
      if (projected.status === "ANALYZED") return;
      expect(projected.detail).toContain(CURRENT_UNSUPPORTED_SUBJECT.observedSpecId);
      expect(projected.detail).toContain("no gameplay analysis was attempted");
    });
  }
});

describe("REST and MCP agree for every subject, in every catalog order", () => {
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

  for (const subject of [ASSASSINATION_SUBJECT, PROTECTION_SUBJECT, ARMS_SUBJECT]) {
    it(`${subject.label}: identical, schema-valid documents across transports and catalogs`, async () => {
      const documents: string[] = [];
      for (const { registry, label } of catalogs()) {
        const run = runFor(subject, registry);
        const analyze: AnalysisRunner = async (input) => await analyzeFight(input, run.deps);
        const restBody = await rest(run.request, analyze);
        const mcpBody = await mcp(run.request, analyze);
        expect(mcpBody.structured, label).toEqual(restBody);
        expect(mcpBody.text, label).toEqual(restBody);
        expect(PublicAnalysisResultSchema.safeParse(restBody).success, label).toBe(true);
        const document = restBody as {
          status: string;
          specialization: { specId: string | null };
          analyzerId: string | null;
        };
        expect(document.status, label).toBe(subject.status);
        if (subject.status === "ANALYZED") {
          expect(document.specialization.specId, label).toBe(
            subject === PROTECTION_SUBJECT ? "paladin/protection" : "rogue/assassination",
          );
          expect(document.analyzerId, label).toBe(
            subject === PROTECTION_SUBJECT ? PROTECTION_PALADIN_ANALYZER_ID : ASSASSINATION_ANALYZER_ID,
          );
        } else {
          expect(document.specialization.specId, label).toBeNull();
          expect(document.analyzerId, label).toBeNull();
        }
        documents.push(JSON.stringify(restBody));
      }
      expect(new Set(documents).size).toBe(1);
    });
  }
});

describe("raid-night cells over the D2 fixture with an Arms participant", () => {
  const ROGUE_B = 23;

  it("deep-equal aggregate, byte-identical public document, identical ingestion, zero Protection runs", async () => {
    const outputs = [];
    for (const { registry, calls, label } of catalogs()) {
      const snapshot = assassinationSnapshot({
        fightIds: [1, 2],
        sourceIds: [ARMS_ACTOR, M5D2_ACTOR, ROGUE_B],
        classNameFor: (sourceId) => (sourceId === ARMS_ACTOR ? UNSUPPORTED_WCL_IDENTITY.className : "Rogue"),
        specNameFor: (_fightId, sourceId) =>
          sourceId === ARMS_ACTOR ? UNSUPPORTED_WCL_IDENTITY.specName : "Assassination",
        absentOn: new Map([[2, [ROGUE_B]]]),
      });
      const ports = fakePorts({ snapshot });
      const run = await runNight(
        { reportCode: REPORT_CODE, fightIds: [1, 2] },
        { ...ports, deps: { ...ports.deps, registry } },
      );
      expect(run.ok, label).toBe(true);
      if (!run.ok) return;
      expect(calls[PROTECTION_PALADIN_ANALYZER_ID], label).toBe(0);
      expect(calls[ASSASSINATION_ANALYZER_ID], label).toBe(3);
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
    expect(reference.ingested).toEqual([1, 2]);
    for (const other of others) {
      expect(other.aggregate, other.label).toEqual(reference.aggregate);
      expect(other.publicJson, other.label).toBe(reference.publicJson);
      expect(other.ingested, other.label).toEqual(reference.ingested);
    }
  });
});
