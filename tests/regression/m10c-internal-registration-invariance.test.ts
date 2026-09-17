/**
 * M10-C: the REAL internal Protection Paladin registration moves nothing
 * public and is reachable through no public path.
 *
 * The M10-A invariance test proved this for a throwing FIXTURE registration.
 * This test proves it for the production one: a registration that, if it
 * were ever selected, would genuinely analyze. Every public path — the
 * application service, REST, MCP, raid-night orchestration — is run against
 * the production catalog, the Assassination-only catalog and a reversed
 * catalog, for an Assassination subject and for the REAL Protection Paladin
 * subject of the M10-B capture. The Protection analyzer is counted, and the
 * count is zero on every public path.
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
import {
  analyzerForSpec,
  internalAnalyzerForSpec,
  requireValidatedCatalog,
  runAnalyzer,
  ANALYZER_REGISTRATIONS,
  PRODUCTION_CATALOG,
  type AnalyzerRegistration,
} from "../../src/services/analyzer-registry.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import { resolveSpecIdentity } from "../../src/services/spec-identity.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import {
  PROTECTION_EXCLUSION_PUBLIC_PROJECTION,
  PROTECTION_PALADIN_REGISTRATION,
} from "../../src/specs/paladin/protection/registration.js";
import {
  PROTECTION_EXCLUSION_REASONS,
  analyzeObservedProtectionPaladinDecisions,
} from "../../src/specs/paladin/protection/observed-analysis.js";
import {
  protectionExecutionLaneForAbility,
  protectionExecutionLaneForToken,
} from "../../src/data/game/paladin-protection-gcd-semantics.js";
import {
  PUBLIC_EXCLUSION_REASONS,
  PUBLIC_DECISION_BLOCKER_CLASSES,
} from "../../src/contracts/analysis-contract.js";
import { DECISION_BLOCKER_CLASSES } from "../../src/simc/decision-coverage.js";
import { ASSASSINATION_REGISTRATION } from "../../src/specs/rogue/assassination/registration.js";
import {
  ALLOWING_LIMITER,
  MCP_TEST_ENV,
  authHeaders,
  workerDepsFor,
} from "../support/analysis-transports.js";
import { corpusFight, corpusState } from "../support/corpus/fight.js";
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
  "io.modelcontextprotocol/clientInfo": { name: "m10c-invariance", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

const D2 = "wcl-assassination-d2-decision-corpus";
const GTKB = "wcl-assassination-high-parse-opener";
const PROT_OPENER = "wcl-protection-paladin-a7r6-opener";
const PROT_ACTOR = 7;

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
}

function runFor(
  artifactId: string,
  actorId: number,
  className: string,
  specName: string,
  registry: readonly AnalyzerRegistration[],
): Run {
  const fight = corpusFight(artifactId);
  const identity = identityFor(fight, actorId, className, specName);
  const preflight: PreflightPort = async () => ({ ok: true, identity, rateLimit: undefined });
  const ingest = vi.fn<CombatIngestionPort>(async () => ({ ok: true, fight, rateLimit: undefined }));
  return {
    deps: { env: MCP_TEST_ENV, preflight, ingest, registry },
    request: { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: actorId },
    ingest,
  };
}

/** The REAL Protection registration, with every invocation of its facade counted. */
function countingProtection(): { readonly registration: AnalyzerRegistration; runs: () => number } {
  let runs = 0;
  const registration: AnalyzerRegistration = {
    ...PROTECTION_PALADIN_REGISTRATION,
    analyze: (input) => {
      runs += 1;
      return PROTECTION_PALADIN_REGISTRATION.analyze(input);
    },
  };
  return { registration, runs: () => runs };
}

function catalogs(): readonly {
  readonly label: string;
  readonly registry: readonly AnalyzerRegistration[];
  runs: () => number;
}[] {
  const after = countingProtection();
  const before = countingProtection();
  return [
    { label: "Assassination alone", registry: [ASSASSINATION_REGISTRATION], runs: () => 0 },
    {
      label: "production order",
      registry: [ASSASSINATION_REGISTRATION, after.registration],
      runs: after.runs,
    },
    {
      label: "reversed order",
      registry: [before.registration, ASSASSINATION_REGISTRATION],
      runs: before.runs,
    },
  ];
}

describe("the production catalog", () => {
  it("is exactly the two registrations, and both lookups answer as M10-C states", () => {
    expect(ANALYZER_REGISTRATIONS).toHaveLength(2);
    expect(internalAnalyzerForSpec("paladin/protection", PRODUCTION_CATALOG)?.analyzerId).toBe(
      "paladin-protection-observed-decisions",
    );
    expect(analyzerForSpec("paladin/protection", PRODUCTION_CATALOG)).toBeNull();
    expect(analyzerForSpec("rogue/assassination", PRODUCTION_CATALOG)?.exposure).toBe("PUBLIC");
    // Ordering changes nothing about the lookups.
    const reversed = requireValidatedCatalog([PROTECTION_PALADIN_REGISTRATION, ASSASSINATION_REGISTRATION]);
    expect(analyzerForSpec("paladin/protection", reversed)).toBeNull();
    expect(internalAnalyzerForSpec("paladin/protection", reversed)?.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("rogue/assassination", reversed)?.analyzerId).toBe(
      ASSASSINATION_REGISTRATION.analyzerId,
    );
  });

  it("public identity resolution still rejects Paladin/Protection", () => {
    expect(resolveSpecIdentity({ className: "Paladin", specName: "Protection" })).toMatchObject({
      ok: false,
    });
    expect(resolveSpecIdentity({ className: "Rogue", specName: "Assassination" })).toMatchObject({
      ok: true,
      specId: "rogue/assassination",
    });
  });

  it("the internal registration genuinely analyzes when reached directly, and owns its result", () => {
    const run = runAnalyzer(PROTECTION_PALADIN_REGISTRATION, {
      state: corpusState(PROT_OPENER),
      actorId: PROT_ACTOR,
      specId: "paladin/protection",
      targetActorId: null,
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.analysis.status).toBe("ANALYZED");
    expect(run.analysis.specId).toBe("paladin/protection");
  });
});

describe("Assassination is unchanged by the real second registration", () => {
  for (const artifact of [D2, GTKB]) {
    const actorId = artifact === D2 ? 19 : 25;

    it(`${artifact}: FightAnalysis deep-equal, public document byte-identical, ingestion identical`, async () => {
      const results = [];
      for (const { registry, runs, label } of catalogs()) {
        const run = runFor(artifact, actorId, "Rogue", "Assassination", registry);
        const result = await analyzeFight(run.request, run.deps);
        expect(result.ok, label).toBe(true);
        if (!result.ok) return;
        expect(result.analysis.analysis.status, label).toBe("ANALYZED");
        expect(runs(), label).toBe(0);
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

describe("the schema-v1 projection plan for M10-D (documented, not yet projected)", () => {
  it("maps every internal exclusion reason onto an existing public reason; no public vocabulary changes", () => {
    // Correction 3 (M10-C). Total over the internal reasons by construction,
    // and every target already public: promoting Protection needs no schema change.
    expect(Object.keys(PROTECTION_EXCLUSION_PUBLIC_PROJECTION).sort()).toEqual(
      [...PROTECTION_EXCLUSION_REASONS].sort(),
    );
    for (const target of Object.values(PROTECTION_EXCLUSION_PUBLIC_PROJECTION)) {
      expect(PUBLIC_EXCLUSION_REASONS as readonly string[]).toContain(target);
    }
    // The public vocabularies are exactly as before M10-C.
    expect(PUBLIC_EXCLUSION_REASONS).toEqual([
      "NON_GCD_ACTION",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "NO_AUTHORITY_TOKEN_BINDING",
    ]);
    expect(PUBLIC_DECISION_BLOCKER_CLASSES).toEqual([
      "OBSERVED_STATE_MISSING",
      "DIVERGENT_WORLDS",
      "TARGET_COUNT",
      "PREDICTIVE_STATE",
      "TARGETING_NOT_MODELLED",
      "USABILITY_NOT_PROVEN",
      "OTHER",
    ]);
  });

  it("MELEE_SWING → NON_GCD_ACTION: a positively identified swing is off-GCD, not an unknown lane", () => {
    expect(PROTECTION_EXCLUSION_PUBLIC_PROJECTION.MELEE_SWING).toBe("NON_GCD_ACTION");
    expect(PROTECTION_EXCLUSION_PUBLIC_PROJECTION.MELEE_SWING).not.toBe("EXECUTION_LANE_NOT_ESTABLISHED");
    // Ability 1 has no pinned lane RECORD — which is exactly why projecting the swing as
    // "lane not established" would have been the lazy, untruthful reading: the swing is
    // identified by `isMelee`, and the action that schedules it is the pinned NON_GCD
    // `auto_attack` token.
    expect(protectionExecutionLaneForAbility(1)).toBe("UNKNOWN_LANE");
    expect(protectionExecutionLaneForToken("auto_attack")).toBe("NON_GCD");
    // Every real melee swing in the opener is excluded internally as MELEE_SWING and would
    // project as NON_GCD_ACTION; the internal reason is retained on the payload.
    const analysis = analyzeObservedProtectionPaladinDecisions({
      state: corpusState(PROT_OPENER),
      actorId: PROT_ACTOR,
      specId: "paladin/protection",
      targetActorId: null,
    });
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    const swings = analysis.excluded.filter((cast) => cast.abilityGameId === 1);
    expect(swings).toHaveLength(11);
    for (const swing of swings) {
      expect(swing.reason).toBe("MELEE_SWING");
      expect(PROTECTION_EXCLUSION_PUBLIC_PROJECTION[swing.reason]).toBe("NON_GCD_ACTION");
    }
  });

  it("an engine raw blocker needs no mapping: its public class is already public and the raw string is withheld", () => {
    // The engine's raw blocker string (TRANSITION_UNSUPPORTED, DIVERGENT_GCD_OUTCOMES, ...)
    // is not a public class; the class it is filed under is, and the shared view carries
    // no rawBlocker field. After M10-C4 the real decisions file under DIVERGENT_WORLDS.
    expect(DECISION_BLOCKER_CLASSES as readonly string[]).toContain("OTHER");
    expect(DECISION_BLOCKER_CLASSES as readonly string[]).toContain("DIVERGENT_WORLDS");
    expect(PUBLIC_DECISION_BLOCKER_CLASSES as readonly string[]).not.toContain("TRANSITION_UNSUPPORTED");
    expect(PUBLIC_DECISION_BLOCKER_CLASSES as readonly string[]).not.toContain("DIVERGENT_GCD_OUTCOMES");
    const analysis = PROTECTION_PALADIN_REGISTRATION.analyze({
      state: corpusState(PROT_OPENER),
      actorId: PROT_ACTOR,
      specId: "paladin/protection",
      targetActorId: null,
    });
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    const view = PROTECTION_PALADIN_REGISTRATION.observedDecisionView(analysis);
    expect(view.decisions.every((d) => d.decisiveBlocker === "DIVERGENT_WORLDS")).toBe(true);
    expect(view.decisions.some((d) => "rawBlocker" in d)).toBe(false);
  });
});

describe("the REAL Protection Paladin subject through every public path", () => {
  for (const { label, registry, runs } of catalogs()) {
    it(`${label}: SPEC_NOT_SUPPORTED, zero ingestion, the internal analyzer never runs`, async () => {
      const run = runFor(PROT_OPENER, PROT_ACTOR, "Paladin", "Protection", registry);
      const result = await analyzeFight(run.request, run.deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state).toBe("SPEC_NOT_SUPPORTED");
      expect(result.analysis.analysis.status).toBe("SPEC_NOT_SUPPORTED");
      expect(result.analysis.specId).toBeNull();
      expect(result.analysis.analyzerId).toBeNull();
      expect(result.analysis.observedDecisions).toBeNull();
      expect(run.ingest).not.toHaveBeenCalled();
      expect(runs()).toBe(0);
      const projected = projectAnalysisResult(result.analysis);
      expect(projected.status).toBe("SPEC_NOT_SUPPORTED");
      expect(projected.specialization).toEqual({ specId: null, gameplaySupported: false });
    });
  }
});

describe("REST and MCP agree, with and without the real registration", () => {
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
    {
      label: "Assassination",
      artifact: D2,
      actorId: 19,
      className: "Rogue",
      specName: "Assassination",
      status: "ANALYZED",
    },
    {
      label: "the real Protection Paladin",
      artifact: PROT_OPENER,
      actorId: PROT_ACTOR,
      className: "Paladin",
      specName: "Protection",
      status: "SPEC_NOT_SUPPORTED",
    },
  ]) {
    it(`${subject.label}: identical documents across transports and catalogs`, async () => {
      const documents: string[] = [];
      for (const { registry, runs, label } of catalogs()) {
        const run = runFor(subject.artifact, subject.actorId, subject.className, subject.specName, registry);
        const analyze: AnalysisRunner = async (input) => await analyzeFight(input, run.deps);
        const restBody = await rest(run.request, analyze);
        const mcpBody = await mcp(run.request, analyze);
        expect(mcpBody.structured, label).toEqual(restBody);
        expect(mcpBody.text, label).toEqual(restBody);
        expect((restBody as { status: string }).status, label).toBe(subject.status);
        expect(runs(), label).toBe(0);
        documents.push(JSON.stringify(restBody));
      }
      expect(new Set(documents).size).toBe(1);
    });
  }
});

describe("raid-night cells are unchanged by the real registration", () => {
  const PALADIN = 7;
  const ROGUE_B = 23;

  it("deep-equal aggregate, byte-identical public document, identical ingestion, zero internal runs", async () => {
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
