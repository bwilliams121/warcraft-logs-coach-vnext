/**
 * M13-F: public Augmentation support observations.
 *
 * What must hold:
 * - a public request for the real M13-A Augmentation Evoker is dispatched to
 *   the Augmentation registration exactly once, at the FULL_RAID scope its
 *   declared requirement derives, through the ONE application service: REST
 *   and MCP publish the identical document;
 * - the document is AUTHORITY_NOT_AVAILABLE (never ANALYZED), and its
 *   `supportObservations` restate the registration's view field for field,
 *   with every listing's completeness, every UNKNOWN, and both support
 *   families NO_AUTHORITY_AVAILABLE.
 *
 * What must NOT happen:
 * - a recipient-quality or timing conclusion on the wire (the schema has no
 *   field for one, and a model that could produce one fails closed);
 * - UNKNOWN and NO_AUTHORITY_AVAILABLE standing in for each other;
 * - an UNKNOWN amount carrying a number;
 * - the document reading as a complete assessment of the Evoker;
 * - another specialization's document carrying support observations;
 * - an unestablished subject producing an empty fact list instead of
 *   NOT_ASSESSED.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { createWorker } from "../../src/api/worker.js";
import {
  PUBLIC_SUPPORT_EVIDENCE_CATEGORIES,
  PUBLIC_SUPPORT_EVIDENCE_REASONS,
  PublicAnalysisResultSchema,
  SupportDecisionSchema,
  SupportObservationsSchema,
  type PublicAnalysisResult,
} from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { UNKNOWN_REASONS } from "../../src/engine/state/state-result.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import type { AnalysisRunner } from "../../src/services/analysis-runner.js";
import { productionRegistrationFor } from "../support/catalog.js";
import { EVIDENCE_CATEGORIES } from "../../src/wcl/evidence-capability.js";
import {
  evaluateAugmentationEvoker,
  supportTargetingStatus,
} from "../../src/specs/evoker/augmentation/evaluator.js";
import { augmentationSupportObservations } from "../../src/specs/evoker/augmentation/support-observation-view.js";
import { AUGMENTATION_EVOKER_ANALYZER_ID } from "../../src/specs/evoker/augmentation/spec.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import {
  ALLOWING_LIMITER,
  MCP_TEST_ENV,
  authHeaders,
  workerDepsFor,
} from "../support/analysis-transports.js";
import { countedProductionCatalog, productionCatalogWith } from "../support/catalog.js";
import { loadCommittedEvidenceArchive } from "../support/corpus/evidence-archive.js";
import { bundleOf } from "../support/corpus/fight.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const TOKEN = "fake-analysis-token-not-real";
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m13f-augmentation", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

const EVOKER = 1;
const SEGMENTS = ["wcl-m13a-aug1-fight-1-support.seg-0-75", "wcl-m13a-aug1-fight-1-support.seg-75-151"];
const CONTEXT = "wcl-m13a-fight-context-aug1-fight-1";

let fight: CombatFight;
/** The same capture without its fight context: no subject has a stated specialization. */
let contextless: CombatFight;

beforeAll(async () => {
  const loaded = await loadCommittedEvidenceArchive();
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
  fight = bundleOf(loaded.archive, SEGMENTS, [], { catalogArtifactId: CONTEXT }).fight;
  contextless = bundleOf(loaded.archive, SEGMENTS, []).fight;
});

function identityFor(of: CombatFight): FightIdentity {
  return {
    report: { code: of.report.code, revision: of.report.revision, startTime: 0, endTime: 0 },
    data: of.data,
    fight: {
      id: of.fight.id,
      name: of.fight.name,
      encounterId: of.fight.encounterId,
      difficulty: of.fight.difficulty,
      startTime: of.fight.startTimeMs,
      endTime: of.fight.endTimeMs,
    },
    player: { sourceId: EVOKER, name: "Subject", className: "Evoker", specName: "Augmentation" },
  };
}

function runnerFor(of: CombatFight, registry = countedProductionCatalog()) {
  const scopes: string[] = [];
  const deps: AnalysisServiceDeps = {
    env: MCP_TEST_ENV,
    preflight: async () => ({ ok: true, identity: identityFor(of), rateLimit: undefined }),
    ingest: async (request) => {
      scopes.push(request.scope);
      return { ok: true, fight: of, rateLimit: undefined };
    },
    registry: registry.registry,
  };
  const analyze: AnalysisRunner = async (input) => await analyzeFight(input, deps);
  return {
    analyze,
    deps,
    scopes,
    calls: registry.calls,
    ids: { reportCode: of.report.code, fightId: of.fight.id, sourceId: EVOKER },
  };
}

async function restDocument(
  ids: object,
  analyze: AnalysisRunner,
): Promise<{ status: number; body: unknown }> {
  const response = await createWorker(workerDepsFor({ analyze, rateLimiter: ALLOWING_LIMITER })).fetch(
    new Request(`https://${HOST}/v1/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(ids),
    }),
    MCP_TEST_ENV,
  );
  return { status: response.status, body: await response.json() };
}

async function mcpDocument(ids: object, analyze: AnalysisRunner): Promise<unknown> {
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
        id: 1,
        method: "tools/call",
        params: { name: ANALYZE_TOOL_NAME, arguments: { source: "ids", ...ids }, _meta: MODERN_META },
      }),
    }),
    MCP_TEST_ENV,
    { analyze, rateLimiter: ALLOWING_LIMITER },
  );
  const payload = JSON.parse(await response.text()) as {
    result: { isError?: boolean; structuredContent?: unknown };
  };
  expect(payload.result.isError ?? false).toBe(false);
  return payload.result.structuredContent;
}

/** Every property name anywhere in a JSON value. */
function keysOf(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) keysOf(item, into);
  else if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      into.push(key);
      keysOf(nested, into);
    }
  }
  return into;
}

function supportOf(document: PublicAnalysisResult) {
  if (document.status !== "AUTHORITY_NOT_AVAILABLE" && document.status !== "INSUFFICIENT_EVIDENCE") {
    throw new Error(`expected an unanalyzed support document, got ${document.status}`);
  }
  if (document.supportObservations === undefined) throw new Error("no supportObservations");
  return document.supportObservations;
}

describe("the real Augmentation Evoker through the one application service", () => {
  it("dispatches the Augmentation registration once, at the derived FULL_RAID scope, and REST and MCP publish the identical document", async () => {
    const runner = runnerFor(fight);
    const rest = await restDocument(runner.ids, runner.analyze);
    const mcp = await mcpDocument(runner.ids, runner.analyze);
    expect(rest.status).toBe(200);
    expect(mcp).toEqual(rest.body);
    // Two transports, two dispatches of the same registration, nothing else.
    for (const [analyzerId, calls] of Object.entries(runner.calls)) {
      expect(calls, analyzerId).toBe(analyzerId === AUGMENTATION_EVOKER_ANALYZER_ID ? 2 : 0);
    }
    expect(runner.scopes).toEqual(["FULL_RAID", "FULL_RAID"]);

    const document = PublicAnalysisResultSchema.parse(rest.body);
    expect(document.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(document.specialization).toEqual({ specId: "evoker/augmentation", gameplaySupported: true });
    expect(document.analyzerId).toBe(AUGMENTATION_EVOKER_ANALYZER_ID);
    expect("decisions" in document).toBe(false);
    expect("coverage" in document).toBe(false);
  });

  it("restates the registration's facts field for field, with both support families NO_AUTHORITY_AVAILABLE", async () => {
    const runner = runnerFor(fight);
    const result = await runner.analyze(runner.ids);
    if (!result.ok) throw new Error("the service failed");
    const support = supportOf(projectAnalysisResult(result.analysis));
    expect(support.assessment).toBe("ASSESSED");
    if (support.assessment !== "ASSESSED") return;

    expect(support.authority).toBe("WCL_OBSERVED_FACT");
    expect(support.identityData.authority).toBe("RUNTIME_GAME_DATA");
    expect(support.evaluatesSupportQuality).toBe(false);
    expect(support.supportDecisions).toEqual([
      {
        category: "SUPPORT_TARGETING",
        authorityStatus: "NO_AUTHORITY_AVAILABLE",
        reason: "NO_APPROVED_RECIPIENT_QUALITY_MODEL",
      },
      {
        category: "SUPPORT_TIMING",
        authorityStatus: "NO_AUTHORITY_AVAILABLE",
        reason: "NO_APPROVED_SUPPORT_TIMING_STANDARD",
      },
    ]);

    // The evaluator's own result under the preflight identity, counted against the wire.
    const evaluation = evaluateAugmentationEvoker({ fight, identity: identityFor(fight) });
    if (evaluation.state !== "EVALUATED") throw new Error("not evaluated");
    expect(support.identityData.datasetId).toBe(evaluation.dataset.datasetId);
    expect(
      support.allyBuffs.map((buff) => [buff.ability, buff.auraAbilityGameId, buff.windows.length]),
    ).toEqual(
      evaluation.allyBuffs.map((buff) => [buff.ability, buff.auraAbilityGameId, buff.windows.length]),
    );
    expect(support.selfBuffs.map((buff) => buff.windows.length)).toEqual(
      evaluation.selfBuffs.map((buff) => buff.windows.windows.length),
    );
    expect(support.supportCasts.casts.map((cast) => [cast.abilityGameId, cast.reportTimeMs])).toEqual(
      evaluation.supportTiming.casts.map((cast) => [cast.abilityGameId, cast.reportTimeMs]),
    );
    expect(support.allyBuffs.some((buff) => buff.windows.length > 0)).toBe(true);
    // The real capture has no certified coverage on this path: every ally-buff
    // list is OBSERVED_ONLY, and the wire says so.
    expect(support.allyBuffs.map((buff) => buff.listing.completeness)).toEqual(
      support.allyBuffs.map(() => "OBSERVED_ONLY"),
    );
    // And the whole block is exactly the registration's view, projected.
    const fromView = projectAnalysisResult({
      ...result.analysis,
      supportObservations: augmentationSupportObservations(evaluation),
    });
    expect(support).toEqual(supportOf(fromView));
  });

  it("preserves completeness on the wire: an incomplete list never claims COMPLETE, and an UNKNOWN amount carries no number", async () => {
    const runner = runnerFor(fight);
    const result = await runner.analyze(runner.ids);
    if (!result.ok) throw new Error("the service failed");
    const support = supportOf(projectAnalysisResult(result.analysis));
    if (support.assessment !== "ASSESSED") throw new Error("not assessed");
    const evaluation = evaluateAugmentationEvoker({ fight, identity: identityFor(fight) });
    if (evaluation.state !== "EVALUATED") throw new Error("not evaluated");
    support.allyBuffs.forEach((buff, index) => {
      expect(buff.listing.completeness).toBe(evaluation.allyBuffs[index]?.listing.state);
      for (const amount of [
        buff.supportTime.anyRecipient,
        ...buff.supportTime.byRecipient.map((row) => row.proven),
      ]) {
        // Never exact: a carried-in buff is never excluded.
        expect(amount.caveats).toContain("INITIAL_STATE_NOT_RESOLVED");
        if (amount.bound === "UNKNOWN") expect("ms" in amount).toBe(false);
      }
      for (const window of buff.windows) {
        // Positive-only survival, and an active span only with continuity.
        expect(["DEATH_OBSERVED_IN_SPAN", "NO_DEATH_OBSERVED"]).toContain(window.survival.inSpan.observation);
        if (window.continuity.continuity !== "ESTABLISHED") expect(window.activeSpan).toBeNull();
        if (window.recipientCooldownIdentity.identification === "IDENTIFIED") {
          expect(window.recipientCooldownIdentity.coverage).toBe("REVIEWED_SUBSET");
        }
      }
    });
    expect(support.supportCasts.listing.completeness).toBe(
      evaluation.supportTiming.listing.state === "COMPLETE" ? "COMPLETE" : "UNKNOWN",
    );
  });

  it("does not read as a complete assessment: the TLDR and report say gameplay was not analyzed", async () => {
    const runner = runnerFor(fight);
    const result = await runner.analyze(runner.ids);
    if (!result.ok) throw new Error("the service failed");
    expect(result.state).toBe("PARTIAL");
    const document = projectAnalysisResult(result.analysis);
    expect(document.tldr?.assessment).toBe("ASSESSED");
    if (document.tldr?.assessment !== "ASSESSED") return;
    expect(document.tldr.headline).toBe("GAMEPLAY_NOT_ANALYZED");
    expect(document.tldr.disclosures).toContain("GAMEPLAY_NOT_ANALYZED");
    expect(document.tldr.gameplay).toEqual({ status: "AUTHORITY_NOT_AVAILABLE" });
    if (document.report?.assessment === "ASSESSED") {
      expect(document.report.coverage.gameplay).toEqual({ status: "AUTHORITY_NOT_AVAILABLE" });
      expect(document.report.coverage.disclosures).toContain("GAMEPLAY_NOT_ANALYZED");
    }
    expect(document.capability.partialCoverageIsExpected).toBe(true);
    expect(document.capability.scoresPerformance).toBe(false);
    if (document.status !== "AUTHORITY_NOT_AVAILABLE") throw new Error("unexpected status");
    expect(document.detail).toContain("not an assessment of the player");
  });

  it("carries no verdict vocabulary, no reserved `state` key and no internal machinery", async () => {
    const runner = runnerFor(fight);
    const result = await runner.analyze(runner.ids);
    if (!result.ok) throw new Error("the service failed");
    const document = projectAnalysisResult(result.analysis);
    const support = supportOf(document);
    const keys = new Set(keysOf(support));
    for (const banned of ["state", "events", "diagnostics", "trace", "steps", "excluded", "comparisons"]) {
      expect([...keys], banned).not.toContain(banned);
    }
    const text = JSON.stringify(support);
    for (const word of [
      "wrong",
      "incorrect",
      "mistake",
      "optimal",
      "recommend",
      "score",
      "severity",
      "coaching",
    ]) {
      expect(text.toLowerCase(), word).not.toContain(word);
    }
    for (const internal of [
      "support-aura-windows/1",
      "support-recipient-facts/1",
      "augmentation-evoker-evaluator/",
    ]) {
      expect(text).not.toContain(internal);
    }
  });
});

describe("what fails closed", () => {
  it("a subject with no stated specialization is NOT_ASSESSED, never an empty fact list", async () => {
    const runner = runnerFor(contextless);
    const result = await runner.analyze(runner.ids);
    if (!result.ok) throw new Error("the service failed");
    const document = projectAnalysisResult(result.analysis);
    expect(document.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(supportOf(document)).toEqual({
      assessment: "NOT_ASSESSED",
      revision: "support-observations/1",
      reason: "SUBJECT_SPECIALIZATION_NOT_STATED",
    });
    expect(runner.scopes).toEqual(["FULL_RAID"]);
  });

  it("a recipient-quality model that could be applied has no public form: the adapter throws and the service reports an internal error", async () => {
    const evaluation = evaluateAugmentationEvoker({ fight, identity: identityFor(fight) });
    if (evaluation.state !== "EVALUATED") throw new Error("not evaluated");
    const applied = {
      ...evaluation,
      supportTargeting: { category: "SUPPORT_TARGETING", status: "ALLY_STATE_SUFFICIENT", modelId: "probe" },
    } as const;
    expect(() => augmentationSupportObservations(applied)).toThrow(/no public shape/);

    const real = productionRegistrationFor("evoker/augmentation");
    const refusing = {
      ...real,
      supportObservationView: () => {
        throw new Error("no public shape");
      },
    };
    const runner = runnerFor(fight, {
      registry: productionCatalogWith(refusing),
      calls: {} as Record<string, number>,
    });
    const result = await runner.analyze(runner.ids);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INTERNAL_ERROR");
  });

  it("UNKNOWN and NO_AUTHORITY_AVAILABLE are distinct on the wire: a declared model without its ally state is UNKNOWN with what is missing", () => {
    const evaluation = evaluateAugmentationEvoker({ fight, identity: identityFor(fight) });
    if (evaluation.state !== "EVALUATED") throw new Error("not evaluated");
    const windows = evaluation.allyBuffs.flatMap((buff) => buff.windows.map((facts) => facts.window));
    const status = supportTargetingStatus(fight, windows, {
      modelId: "probe-model",
      requiredAllyCategories: ["HEALING"],
    });
    expect(status.status).toBe("UNKNOWN");
    const outcome = augmentationSupportObservations({ ...evaluation, supportTargeting: status });
    if (outcome.assessment !== "ASSESSED") throw new Error("not assessed");
    const [targeting] = outcome.view.supportDecisions;
    expect(SupportDecisionSchema.parse(targeting)).toMatchObject({
      category: "SUPPORT_TARGETING",
      authorityStatus: "UNKNOWN",
      modelId: "probe-model",
      missing: { evidenceCategory: "HEALING" },
    });
    // The two refusals never share a shape.
    expect(
      SupportDecisionSchema.safeParse({
        category: "SUPPORT_TARGETING",
        authorityStatus: "UNKNOWN",
        reason: "NO_APPROVED_RECIPIENT_QUALITY_MODEL",
      }).success,
    ).toBe(false);
    expect(
      SupportDecisionSchema.safeParse({
        category: "SUPPORT_TARGETING",
        authorityStatus: "NO_AUTHORITY_AVAILABLE",
        modelId: "probe-model",
      }).success,
    ).toBe(false);
  });
});

describe("the schema cannot express a verdict", () => {
  it("refuses an evaluated or quality-bearing support decision, and a quality flag set true", () => {
    for (const verdict of [
      { category: "SUPPORT_TARGETING", authorityStatus: "ALLY_STATE_SUFFICIENT", modelId: "m" },
      {
        category: "SUPPORT_TARGETING",
        authorityStatus: "EVALUATED",
        reason: "NO_APPROVED_RECIPIENT_QUALITY_MODEL",
      },
      {
        category: "SUPPORT_TIMING",
        authorityStatus: "NO_AUTHORITY_AVAILABLE",
        reason: "NO_APPROVED_RECIPIENT_QUALITY_MODEL",
      },
      {
        category: "SUPPORT_TARGETING",
        authorityStatus: "NO_AUTHORITY_AVAILABLE",
        reason: "NO_APPROVED_RECIPIENT_QUALITY_MODEL",
        recipientQuality: "WRONG",
      },
    ]) {
      expect(SupportDecisionSchema.safeParse(verdict).success, JSON.stringify(verdict)).toBe(false);
    }
    const minimal = {
      assessment: "ASSESSED",
      revision: "support-observations/1",
      authority: "WCL_OBSERVED_FACT",
      identityData: { authority: "RUNTIME_GAME_DATA", datasetId: "d", artifactRevision: "r" },
      evaluatesSupportQuality: false,
      supportDecisions: [
        {
          category: "SUPPORT_TIMING",
          authorityStatus: "NO_AUTHORITY_AVAILABLE",
          reason: "NO_APPROVED_SUPPORT_TIMING_STANDARD",
        },
      ],
      allyBuffs: [],
      selfBuffs: [],
      supportCasts: { listing: { completeness: "COMPLETE" }, casts: [] },
    };
    expect(SupportObservationsSchema.safeParse(minimal).success).toBe(true);
    expect(SupportObservationsSchema.safeParse({ ...minimal, evaluatesSupportQuality: true }).success).toBe(
      false,
    );
    expect(SupportObservationsSchema.safeParse({ ...minimal, supportDecisions: [] }).success).toBe(false);
  });

  it("an UNKNOWN support time carries no number, and an AT_LEAST one always carries its caveats", () => {
    const buff = (anyRecipient: unknown) => ({
      ability: "EBON_MIGHT",
      auraAbilityGameId: 395152,
      listing: { completeness: "OBSERVED_ONLY", reason: "CAPABILITY_UNVERIFIED" },
      ambiguousTransitions: 0,
      windows: [],
      supportTime: { anyRecipient, byRecipient: [], peakConcurrentWindows: { bound: "UNKNOWN" } },
    });
    const base = {
      assessment: "ASSESSED",
      revision: "support-observations/1",
      authority: "WCL_OBSERVED_FACT",
      identityData: { authority: "RUNTIME_GAME_DATA", datasetId: "d", artifactRevision: "r" },
      evaluatesSupportQuality: false,
      supportDecisions: [
        {
          category: "SUPPORT_TIMING",
          authorityStatus: "NO_AUTHORITY_AVAILABLE",
          reason: "NO_APPROVED_SUPPORT_TIMING_STANDARD",
        },
      ],
      selfBuffs: [],
      supportCasts: { listing: { completeness: "COMPLETE" }, casts: [] },
    };
    const parse = (anyRecipient: unknown) =>
      SupportObservationsSchema.safeParse({ ...base, allyBuffs: [buff(anyRecipient)] }).success;
    expect(parse({ bound: "UNKNOWN", caveats: ["INITIAL_STATE_NOT_RESOLVED"] })).toBe(true);
    expect(parse({ bound: "UNKNOWN", ms: 0, caveats: ["INITIAL_STATE_NOT_RESOLVED"] })).toBe(false);
    expect(parse({ bound: "AT_LEAST", ms: 1000, caveats: [] })).toBe(false);
    expect(parse({ bound: "EXACT", ms: 1000, caveats: ["INITIAL_STATE_NOT_RESOLVED"] })).toBe(false);
  });

  it("only the two support statuses may carry the block: an unsupported or analyzed document refuses it", () => {
    const block = {
      assessment: "NOT_ASSESSED",
      revision: "support-observations/1",
      reason: "IDENTITY_REFUSED",
    };
    for (const status of ["SPEC_NOT_SUPPORTED", "PROFILE_NOT_RESOLVED"] as const) {
      const shape = PublicAnalysisResultSchema.options.find((option) => option.shape.status.value === status);
      expect(shape?.shape).not.toHaveProperty("supportObservations");
    }
    for (const status of ["AUTHORITY_NOT_AVAILABLE", "INSUFFICIENT_EVIDENCE"] as const) {
      const shape = PublicAnalysisResultSchema.options.find((option) => option.shape.status.value === status);
      expect(shape?.shape).toHaveProperty("supportObservations");
    }
    expect(SupportObservationsSchema.safeParse(block).success).toBe(true);
  });

  it("the public vocabularies equal their internal counterparts", () => {
    expect([...PUBLIC_SUPPORT_EVIDENCE_REASONS]).toEqual([...UNKNOWN_REASONS]);
    expect([...PUBLIC_SUPPORT_EVIDENCE_CATEGORIES]).toEqual([...EVIDENCE_CATEGORIES]);
  });
});
