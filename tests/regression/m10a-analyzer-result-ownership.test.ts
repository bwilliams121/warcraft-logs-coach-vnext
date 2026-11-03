/**
 * M10-A: an analyzer's result is owned by its registration, and ownership is
 * checked at runtime — types are not a trust boundary.
 *
 * Every malicious registration below is either built through
 * `defineAnalyzerRegistration` (whose wrapper throws) or hand-assembled to
 * bypass it (so the services' `runAnalyzer` check is what catches it). In
 * both cases the forged result never reaches a public projection, a raid-night
 * cell, REST or MCP as a valid analysis, and is never rewritten as
 * SPEC_NOT_SUPPORTED, `specId: null` or an evidence UNKNOWN.
 */

import { describe, expect, it, vi } from "vitest";

import { createWorker } from "../../src/api/worker.js";
import { defineAnalyzerRegistration } from "../../src/findings/analyzer-registration.js";
import type { SpecAnalysisEnvelope } from "../../src/findings/analysis-envelope.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import type { AnalysisRunner } from "../../src/services/analysis-runner.js";
import {
  AnalyzerCatalogIntegrityError,
  AnalyzerResultOwnershipError,
  checkAnalysisOwnership,
  observedDecisionViewOf,
  PRODUCTION_CATALOG,
  requireValidatedCatalog,
  runAnalyzer,
  type AnalyzerRegistration,
} from "../../src/services/analyzer-registry.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import { ASSASSINATION_REGISTRATION } from "../../src/specs/rogue/assassination/registration.js";
import { PROTECTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/protection/registration.js";
import { RETRIBUTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/retribution/registration.js";
import { BLOOD_DEATH_KNIGHT_REGISTRATION } from "../../src/specs/deathknight/blood/registration.js";
import { BREWMASTER_MONK_REGISTRATION } from "../../src/specs/monk/brewmaster/registration.js";
import { AUGMENTATION_EVOKER_REGISTRATION } from "../../src/specs/evoker/augmentation/registration.js";
import { RESTORATION_SHAMAN_REGISTRATION } from "../../src/specs/shaman/restoration/registration.js";
import { analyzeObservedProtectionPaladinDecisions } from "../../src/specs/paladin/protection/observed-analysis.js";
import { analyzeObservedAssassinationDecisions } from "../../src/specs/rogue/assassination/observed-analysis.js";
import {
  ALLOWING_LIMITER,
  MCP_TEST_ENV,
  authHeaders,
  workerDepsFor,
} from "../support/analysis-transports.js";
import { corpusFight, corpusState } from "../support/corpus/fight.js";
import { productionCatalogWith } from "../support/catalog.js";
import { fixtureRegistration } from "../support/fixture-registration.js";
import {
  M5D2_ACTOR,
  REPORT_CODE,
  assassinationSnapshot,
  fakePorts,
  runNight,
} from "../support/raid-night-orchestration-fixture.js";

const D2 = "wcl-assassination-d2-decision-corpus";
const PROT_OPENER = "wcl-protection-paladin-a7r6-opener";
const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m10a-ownership", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

/** The real Assassination analysis of the D2 corpus: a genuine, well-formed ANALYZED result. */
function realAssassinationAnalysis(): SpecAnalysisEnvelope {
  return analyzeObservedAssassinationDecisions({
    state: corpusState(D2),
    actorId: 19,
    specId: "rogue/assassination",
    targetActorId: null,
  });
}

/** A hand-assembled PUBLIC Assassination registration whose facade returns whatever it is told. */
function forgedAssassination(produce: () => SpecAnalysisEnvelope): AnalyzerRegistration {
  return {
    ...ASSASSINATION_REGISTRATION,
    analyze: produce,
  };
}

const INPUT = () => ({
  state: corpusState(D2),
  actorId: 19,
  specId: "rogue/assassination",
  targetActorId: null,
});

describe("the ownership rule, directly", () => {
  it("accepts only a result naming the registration's own spec", () => {
    const real = realAssassinationAnalysis();
    expect(checkAnalysisOwnership(ASSASSINATION_REGISTRATION, real)).toEqual({ ok: true });
    expect(
      checkAnalysisOwnership(ASSASSINATION_REGISTRATION, { ...real, specId: "paladin/protection" }).ok,
    ).toBe(false);
    expect(checkAnalysisOwnership(ASSASSINATION_REGISTRATION, { ...real, specId: null })).toMatchObject({
      ok: false,
      defect: "ANALYZED_WITHOUT_SPEC_ID",
    });
    expect(
      checkAnalysisOwnership(ASSASSINATION_REGISTRATION, {
        status: "INSUFFICIENT_EVIDENCE",
        specId: "paladin/protection",
        detail: "x",
      }),
    ).toMatchObject({ ok: false, defect: "RESULT_NAMES_ANOTHER_SPEC" });
  });
});

describe("a registration built through defineAnalyzerRegistration refuses forged results", () => {
  it("a Paladin registration (row-level fixture exposure) cannot return an Assassination-owned analysis", () => {
    const impostor = defineAnalyzerRegistration({
      analyzerId: "impostor-paladin",
      displayName: "Impostor Paladin",
      specId: "paladin/protection",
      exposure: "INTERNAL_ONLY",
      capabilities: fixtureRegistration().capabilities,
      authorityBindings: [],
      analyze: () => realAssassinationAnalysis(),
      observedDecisionView: () => {
        throw new Error("unreachable");
      },
    });
    expect(() =>
      impostor.analyze({
        state: corpusState(D2),
        actorId: 19,
        specId: "paladin/protection",
        targetActorId: null,
      }),
    ).toThrow(AnalyzerResultOwnershipError);
  });

  it("a public Assassination registration cannot return 'paladin/protection'", () => {
    const rogueLying = defineAnalyzerRegistration({
      analyzerId: "rogue-lying",
      displayName: "Rogue Lying",
      specId: "rogue/assassination",
      exposure: "PUBLIC",
      capabilities: ASSASSINATION_REGISTRATION.capabilities,
      authorityBindings: ASSASSINATION_REGISTRATION.authorityBindings,
      analyze: () =>
        ({ ...realAssassinationAnalysis(), specId: "paladin/protection" }) as SpecAnalysisEnvelope,
      observedDecisionView: () => {
        throw new Error("unreachable");
      },
    });
    expect(() => rogueLying.analyze(INPUT())).toThrow(AnalyzerResultOwnershipError);
  });

  it("refuses an input naming another specialization before the facade runs", () => {
    const facade = vi.fn(() => realAssassinationAnalysis());
    const registration = defineAnalyzerRegistration({
      analyzerId: "rogue-guarded",
      displayName: "Rogue Guarded",
      specId: "rogue/assassination",
      exposure: "PUBLIC",
      capabilities: ASSASSINATION_REGISTRATION.capabilities,
      authorityBindings: ASSASSINATION_REGISTRATION.authorityBindings,
      analyze: facade,
      observedDecisionView: ASSASSINATION_REGISTRATION.observedDecisionView,
    });
    expect(() => registration.analyze({ ...INPUT(), specId: "paladin/protection" })).toThrow(
      AnalyzerResultOwnershipError,
    );
    expect(facade).not.toHaveBeenCalled();
  });

  it("refuses to view an analysis it does not own", () => {
    const registration = defineAnalyzerRegistration({
      analyzerId: "rogue-guarded",
      displayName: "Rogue Guarded",
      specId: "rogue/assassination",
      exposure: "PUBLIC",
      capabilities: ASSASSINATION_REGISTRATION.capabilities,
      authorityBindings: ASSASSINATION_REGISTRATION.authorityBindings,
      analyze: () => realAssassinationAnalysis(),
      observedDecisionView: ASSASSINATION_REGISTRATION.observedDecisionView,
    });
    const real = realAssassinationAnalysis();
    if (real.status !== "ANALYZED") throw new Error("expected ANALYZED");
    expect(() => registration.observedDecisionView({ ...real, specId: "paladin/protection" })).toThrow(
      AnalyzerResultOwnershipError,
    );
  });
});

describe("runAnalyzer holds hand-assembled registrations to the same rule", () => {
  const forgeries: readonly [string, () => SpecAnalysisEnvelope][] = [
    [
      "the other specialization's id",
      () => ({ ...realAssassinationAnalysis(), specId: "paladin/protection" }) as SpecAnalysisEnvelope,
    ],
    [
      "ANALYZED with specId null",
      () => ({ ...realAssassinationAnalysis(), specId: null }) as unknown as SpecAnalysisEnvelope,
    ],
    [
      "an unanalyzed status naming another spec",
      () => ({ status: "INSUFFICIENT_EVIDENCE", specId: "paladin/protection", detail: "forged" }),
    ],
  ];

  it.each(forgeries)("%s is refused, and the refusal names the defect", (_label, produce) => {
    const run = runAnalyzer(forgedAssassination(produce), INPUT());
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.detail).toMatch(/RESULT_NAMES_ANOTHER_SPEC|ANALYZED_WITHOUT_SPEC_ID/);
  });

  it("a mismatched input is refused without running the facade", () => {
    const facade = vi.fn(() => realAssassinationAnalysis());
    const run = runAnalyzer(forgedAssassination(facade), { ...INPUT(), specId: "paladin/protection" });
    expect(run.ok).toBe(false);
    expect(facade).not.toHaveBeenCalled();
  });

  it("a genuine result passes", () => {
    const run = runAnalyzer(ASSASSINATION_REGISTRATION, INPUT());
    expect(run.ok).toBe(true);
  });
});

describe("a mismatched result cannot reach observedDecisionViewOf", () => {
  it("an analysis owned by no registration in the catalog throws before any adapter runs", () => {
    const real = realAssassinationAnalysis();
    if (real.status !== "ANALYZED") throw new Error("expected ANALYZED");
    // No registration carries this id. (Since M10-C `paladin/protection` DOES,
    // so the unregistered case needs an id outside the build's vocabulary.)
    const foreign = { ...real, specId: "warrior/protection" as unknown as "rogue/assassination" };
    expect(() => observedDecisionViewOf(PRODUCTION_CATALOG, foreign)).toThrow(AnalyzerCatalogIntegrityError);
  });

  it("a Rogue analysis relabelled with the REGISTERED Paladin id is refused by ownership, not adapted (M10-C)", () => {
    // The forgery the id check alone cannot catch once two registrations
    // exist: the relabelled result names a real registration and carries a
    // shape-compatible payload. What it cannot fake is the authority it cites.
    const real = realAssassinationAnalysis();
    if (real.status !== "ANALYZED") throw new Error("expected ANALYZED");
    const relabelled = { ...real, specId: "paladin/protection" as const };
    expect(() => observedDecisionViewOf(PRODUCTION_CATALOG, relabelled)).toThrow(
      AnalyzerResultOwnershipError,
    );
    expect(() => observedDecisionViewOf(PRODUCTION_CATALOG, relabelled)).toThrow(
      /RESULT_CITES_FOREIGN_AUTHORITY/,
    );
  });

  it("is adapted only by its owner, never by a neighbour's view", () => {
    // UPDATED AT M10-C. The neighbour is now the REAL Protection registration
    // with a genuine Protection analysis over the M10-B evidence; a relabelled
    // Rogue analysis no longer reaches any view at all (the previous test).
    const rogueView = vi.fn(ASSASSINATION_REGISTRATION.observedDecisionView);
    const paladinView = vi.fn(PROTECTION_PALADIN_REGISTRATION.observedDecisionView);
    // M11-A5: the third public row completes the catalog; M11-B12 the
    // fourth; M11-C4j the fifth. No view may be reached by any neighbour's
    // analysis.
    const retributionView = vi.fn(RETRIBUTION_PALADIN_REGISTRATION.observedDecisionView);
    const bloodView = vi.fn(BLOOD_DEATH_KNIGHT_REGISTRATION.observedDecisionView);
    const brewmasterView = vi.fn(BREWMASTER_MONK_REGISTRATION.observedDecisionView);
    const catalog = requireValidatedCatalog([
      { ...ASSASSINATION_REGISTRATION, observedDecisionView: rogueView },
      { ...PROTECTION_PALADIN_REGISTRATION, observedDecisionView: paladinView },
      { ...RETRIBUTION_PALADIN_REGISTRATION, observedDecisionView: retributionView },
      { ...BLOOD_DEATH_KNIGHT_REGISTRATION, observedDecisionView: bloodView },
      { ...BREWMASTER_MONK_REGISTRATION, observedDecisionView: brewmasterView },
      // M13-F: the sixth public row; it has no decision view to reach.
      AUGMENTATION_EVOKER_REGISTRATION,
      // HEAL-AP: the seventh public row; it has a healer view, no decision view.
      RESTORATION_SHAMAN_REGISTRATION,
    ]);
    const real = realAssassinationAnalysis();
    if (real.status !== "ANALYZED") throw new Error("expected ANALYZED");
    const paladin = analyzeObservedProtectionPaladinDecisions({
      state: corpusState(PROT_OPENER),
      actorId: 7,
      specId: "paladin/protection",
      targetActorId: null,
    });
    if (paladin.status !== "ANALYZED") throw new Error("expected ANALYZED");

    expect(observedDecisionViewOf(catalog, paladin).decisions.length).toBeGreaterThan(0);
    expect(rogueView).not.toHaveBeenCalled();
    expect(bloodView).not.toHaveBeenCalled();
    expect(paladinView).toHaveBeenCalledTimes(1);

    expect(observedDecisionViewOf(catalog, real).decisions.length).toBeGreaterThan(0);
    expect(rogueView).toHaveBeenCalledTimes(1);
    expect(paladinView).toHaveBeenCalledTimes(1);
    expect(retributionView).not.toHaveBeenCalled();
    expect(brewmasterView).not.toHaveBeenCalled();
  });
});

describe("a forged result never reaches the public surfaces", () => {
  const fight = corpusFight(D2);
  const identity: FightIdentity = {
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
    player: { sourceId: 19, name: "Corpusplayer", className: "Rogue", specName: "Assassination" },
  };
  const request = { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: 19 };

  function depsWith(registration: AnalyzerRegistration): AnalysisServiceDeps {
    const preflight: PreflightPort = async () => ({ ok: true, identity, rateLimit: undefined });
    const ingest: CombatIngestionPort = async () => ({ ok: true, fight, rateLimit: undefined });
    // COMPLETE catalog (M10-D): the forged Assassination row replaces the real
    // one and the real Protection row stays, so the refusal below is the
    // OWNERSHIP refusal and not the registry refusing an incomplete table.
    return { env: MCP_TEST_ENV, preflight, ingest, registry: productionCatalogWith(registration) };
  }

  const FORGED = forgedAssassination(
    () => ({ ...realAssassinationAnalysis(), specId: "paladin/protection" }) as SpecAnalysisEnvelope,
  );
  const NULLED = forgedAssassination(
    () => ({ ...realAssassinationAnalysis(), specId: null }) as unknown as SpecAnalysisEnvelope,
  );

  for (const [label, registration] of [
    ["another spec's id", FORGED],
    ["specId null", NULLED],
  ] as const) {
    it(`${label}: the service answers INTERNAL_ERROR, not an analysis`, async () => {
      const result = await analyzeFight(request, depsWith(registration));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INTERNAL_ERROR");
      expect(result.error.message).not.toContain("SPEC_NOT_SUPPORTED");
      // The ownership refusal, by name — never the catalog-integrity one.
      expect(result.error.message).toContain("does not own");
      expect(result.error.message).not.toContain("integrity validation");
    });

    it(`${label}: REST answers 500 INTERNAL_ERROR and MCP a tool error`, async () => {
      const analyze: AnalysisRunner = async (input) => await analyzeFight(input, depsWith(registration));

      const rest = await createWorker(workerDepsFor({ analyze, rateLimiter: ALLOWING_LIMITER })).fetch(
        new Request(`https://${HOST}/v1/analysis`, {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders() },
          body: JSON.stringify(request),
        }),
        MCP_TEST_ENV,
      );
      expect(rest.status).toBe(500);
      const restBody = (await rest.json()) as {
        error?: { code?: string };
        status?: string;
        specialization?: unknown;
      };
      expect(restBody.error?.code).toBe("INTERNAL_ERROR");
      expect(restBody.status).toBeUndefined();
      expect(restBody.specialization).toBeUndefined();

      const mcp = await handleMcpRequest(
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
            params: { name: ANALYZE_TOOL_NAME, arguments: { source: "ids", ...request }, _meta: MODERN_META },
          }),
        }),
        MCP_TEST_ENV,
        { analyze, rateLimiter: ALLOWING_LIMITER },
      );
      const payload = JSON.parse(await mcp.text()) as {
        result: { isError?: boolean; structuredContent?: unknown; content?: readonly { text: string }[] };
      };
      expect(payload.result.isError).toBe(true);
      expect(payload.result.structuredContent).toBeUndefined();
      expect(payload.result.content?.[0]?.text).not.toContain("SPEC_NOT_SUPPORTED");
    });
  }

  it("a forged result fails the raid night rather than becoming a cell", async () => {
    const snapshot = assassinationSnapshot({ fightIds: [1], sourceIds: [M5D2_ACTOR] });
    const ports = fakePorts({ snapshot });
    const run = await runNight(
      { reportCode: REPORT_CODE, fightIds: [1] },
      { ...ports, deps: { ...ports.deps, registry: productionCatalogWith(FORGED) } },
    );
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.error.code).toBe("INTERNAL_ERROR");
    expect(run.error.message).not.toContain("SPEC_NOT_SUPPORTED");
    expect(run.error.message).toContain("does not own");
  });
});
