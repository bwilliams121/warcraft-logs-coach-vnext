/**
 * HEAL-AP: public Restoration Shaman healer findings.
 *
 * What must hold:
 * - a public request for the real M12-D Restoration Shaman is dispatched to the
 *   Restoration registration exactly once per transport, at the FULL_RAID
 *   scope its declared requirement derives, through the ONE application
 *   service: REST and MCP publish the identical document;
 * - the document is AUTHORITY_NOT_AVAILABLE (never ANALYZED), and its
 *   `healerFindings` restate the registration's view field for field;
 * - with a plan bound to the fight, the plan disclosure says
 *   EVALUATED_IN_HEALER_FINDINGS and the TLDR and report disclose that they do
 *   not summarize the healer findings or the evaluated plan.
 *
 * What must NOT happen:
 * - the document reading as a complete assessment of the healer;
 * - the TLDR or report claiming the plan "was not evaluated" when it was;
 * - another specialization's document carrying healer findings;
 * - a view that cannot be published producing a quieter document;
 * - the schema admitting an outcome the evaluator cannot prove (a miss, a
 *   MET without its cast, assignment results without a plan, a quality flag).
 */

import { beforeAll, describe, expect, it } from "vitest";

import { createWorker } from "../../src/api/worker.js";
import {
  HealerFindingsSchema,
  PUBLIC_HEALER_EVIDENCE_REASONS,
  PublicAnalysisResultSchema,
  type PublicAnalysisResult,
} from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import { UNKNOWN_REASONS } from "../../src/engine/state/state-result.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { analyzeFight } from "../../src/services/analysis-service.js";
import type { AnalysisRunner } from "../../src/services/analysis-runner.js";
import { RESTORATION_SHAMAN_ANALYZER_ID } from "../../src/specs/shaman/restoration/spec.js";
import { restorationShamanHealerViewOf } from "../../src/specs/shaman/restoration/registration.js";
import type { RestorationShamanAnalysis } from "../../src/specs/shaman/restoration/registration.js";
import {
  ALLOWING_LIMITER,
  MCP_TEST_ENV,
  authHeaders,
  workerDepsFor,
} from "../support/analysis-transports.js";
import { productionCatalogWith, productionRegistrationFor } from "../support/catalog.js";
import {
  loadRestorationSubject,
  requestPlan,
  RESTORATION_SUBJECT_ACTOR,
  restorationIdentityFor,
  restorationRunner,
  SPIRIT_LINK_TOTEM,
  type RestorationSubject,
} from "../support/heal-ap-restoration-subject.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const TOKEN = "fake-analysis-token-not-real";
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "heal-ap-restoration", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

let subject: RestorationSubject;

beforeAll(async () => {
  subject = await loadRestorationSubject();
});

const identity = () =>
  restorationIdentityFor(subject.rostered, RESTORATION_SUBJECT_ACTOR, {
    name: subject.name,
    className: "Shaman",
    specName: "Restoration",
  });

const plan = () =>
  requestPlan(subject.encounter, subject.fight.fight.startTimeMs, [
    { name: subject.name, abilityId: SPIRIT_LINK_TOTEM, atReportTimeMs: 7_544_000, toleranceMs: 2_000 },
    { name: subject.name, abilityId: SPIRIT_LINK_TOTEM, atReportTimeMs: 7_790_000, toleranceMs: 2_000 },
  ]);

async function restDocument(
  body: object,
  analyze: AnalysisRunner,
): Promise<{ status: number; body: unknown }> {
  const response = await createWorker(workerDepsFor({ analyze, rateLimiter: ALLOWING_LIMITER })).fetch(
    new Request(`https://${HOST}/v1/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }),
    MCP_TEST_ENV,
  );
  return { status: response.status, body: await response.json() };
}

async function mcpDocument(body: object, analyze: AnalysisRunner): Promise<unknown> {
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
        params: { name: ANALYZE_TOOL_NAME, arguments: { source: "ids", ...body }, _meta: MODERN_META },
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

function healerOf(document: PublicAnalysisResult) {
  if (document.status !== "AUTHORITY_NOT_AVAILABLE" && document.status !== "INSUFFICIENT_EVIDENCE") {
    throw new Error(`expected an unanalyzed healer document, got ${document.status}`);
  }
  if (document.healerFindings === undefined) throw new Error("no healerFindings");
  return document.healerFindings;
}

describe("the real Restoration Shaman through the one application service", () => {
  it("dispatches the Restoration registration once per transport, at FULL_RAID, and REST and MCP publish the identical document", async () => {
    const runner = restorationRunner(subject.rostered, identity());
    const body = { ...runner.ids, raidCooldownPlan: plan() };
    const rest = await restDocument(body, runner.analyze);
    const mcp = await mcpDocument(body, runner.analyze);
    expect(rest.status).toBe(200);
    expect(mcp).toEqual(rest.body);
    for (const [analyzerId, calls] of Object.entries(runner.calls)) {
      expect(calls, analyzerId).toBe(analyzerId === RESTORATION_SHAMAN_ANALYZER_ID ? 2 : 0);
    }
    expect(runner.scopes).toEqual(["FULL_RAID", "FULL_RAID"]);

    const document = PublicAnalysisResultSchema.parse(rest.body);
    expect(document.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(document.specialization).toEqual({ specId: "shaman/restoration", gameplaySupported: true });
    expect(document.analyzerId).toBe(RESTORATION_SHAMAN_ANALYZER_ID);
    expect("decisions" in document).toBe(false);
    expect("coverage" in document).toBe(false);
    expect("supportObservations" in document).toBe(false);
  });

  it("restates the registration's view field for field", async () => {
    const runner = restorationRunner(subject.rostered, identity());
    const result = await runner.analyze({ ...runner.ids, raidCooldownPlan: plan() });
    if (!result.ok) throw new Error("the service failed");
    const healer = healerOf(projectAnalysisResult(result.analysis));
    if (healer.assessment !== "ASSESSED") throw new Error("not assessed");
    const view = restorationShamanHealerViewOf(
      result.analysis.analysis as unknown as RestorationShamanAnalysis,
    );
    expect(result.analysis.healerFindings).toEqual(view);
    if (view.assessment !== "ASSESSED") throw new Error("view not assessed");
    expect(healer.identityData).toEqual({ authority: "RUNTIME_GAME_DATA", ...view.view.identityData });
    expect(healer.assignments.map((entry) => [entry.assignmentId, entry.result.resolution])).toEqual(
      view.view.assignments.map((entry) => [entry.assignmentId, entry.result.resolution]),
    );
    expect(healer.assignments.map((entry) => "outcome" in entry.result && entry.result.outcome)).toEqual([
      "ASSIGNMENT_MET",
      "ASSIGNMENT_NOT_ACTIONABLE",
    ]);
    expect(healer.cooldownUses.map((use) => [use.abilityGameId, use.reportTimeMs])).toEqual(
      view.view.cooldownUses.map((use) => [use.abilityGameId, use.reportTimeMs]),
    );
  });

  it("discloses coverage: GAMEPLAY_NOT_ANALYZED, and the healer findings and evaluated plan as not summarized", async () => {
    const runner = restorationRunner(subject.rostered, identity());
    const result = await runner.analyze({ ...runner.ids, raidCooldownPlan: plan() });
    if (!result.ok) throw new Error("the service failed");
    expect(result.state).toBe("PARTIAL");
    const document = projectAnalysisResult(result.analysis);
    if (document.status !== "AUTHORITY_NOT_AVAILABLE") throw new Error("unexpected status");
    expect(document.detail).toContain("not an assessment of the player");
    expect(document.raidCooldownPlan?.assignmentEvaluation).toEqual({
      state: "EVALUATED_IN_HEALER_FINDINGS",
    });
    expect(document.capability.partialCoverageIsExpected).toBe(true);
    expect(document.capability.scoresPerformance).toBe(false);
    if (document.tldr?.assessment !== "ASSESSED") throw new Error("no TLDR");
    expect(document.tldr.headline).toBe("GAMEPLAY_NOT_ANALYZED");
    expect(document.tldr.disclosures).toEqual(
      expect.arrayContaining([
        "GAMEPLAY_NOT_ANALYZED",
        "HEALER_FINDINGS_NOT_SUMMARIZED",
        "RAID_COOLDOWN_PLAN_NOT_SUMMARIZED",
      ]),
    );
    // Never "the plan was not evaluated" when it was.
    expect(document.tldr.disclosures).not.toContain("RAID_COOLDOWN_PLAN_NOT_EVALUATED");
    if (document.report?.assessment === "ASSESSED") {
      expect(document.report.coverage.disclosures).toEqual(
        expect.arrayContaining(["HEALER_FINDINGS_NOT_SUMMARIZED", "RAID_COOLDOWN_PLAN_NOT_SUMMARIZED"]),
      );
      expect(document.report.markdown).toContain("Healer findings are published separately");
    }
  });

  it("without a plan: no assignment result, and the TLDR discloses only the healer findings", async () => {
    const runner = restorationRunner(subject.rostered, identity());
    const result = await runner.analyze(runner.ids);
    if (!result.ok) throw new Error("the service failed");
    const document = projectAnalysisResult(result.analysis);
    const healer = healerOf(document);
    if (healer.assessment !== "ASSESSED") throw new Error("not assessed");
    expect(healer.assignments).toEqual([]);
    expect("raidCooldownPlan" in document).toBe(false);
    if (document.tldr?.assessment !== "ASSESSED") throw new Error("no TLDR");
    expect(document.tldr.disclosures).toContain("HEALER_FINDINGS_NOT_SUMMARIZED");
    expect(document.tldr.disclosures).not.toContain("RAID_COOLDOWN_PLAN_NOT_SUMMARIZED");
  });
});

describe("what fails closed", () => {
  it("a view that cannot publish is an internal error, never a quieter document", async () => {
    const real = productionRegistrationFor("shaman/restoration");
    const refusing = {
      ...real,
      healerView: () => {
        throw new Error("no public shape");
      },
    };
    const result = await analyzeFight(
      { ...restorationRunner(subject.rostered, identity()).ids },
      {
        env: MCP_TEST_ENV,
        registry: productionCatalogWith(refusing),
        preflight: async () => ({ ok: true, identity: identity(), rateLimit: undefined }),
        ingest: async () => ({ ok: true, fight: subject.rostered, rateLimit: undefined }),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INTERNAL_ERROR");
  });

  it("a healer view that contradicts the plan disclosure is an internal error", async () => {
    const real = productionRegistrationFor("shaman/restoration");
    const contradicting = {
      ...real,
      healerView: (analysis: Parameters<NonNullable<typeof real.healerView>>[0]) => {
        const outcome = real.healerView?.(analysis);
        if (outcome?.assessment !== "ASSESSED") throw new Error("not assessed");
        // Claims no plan was supplied while the request carried one bound to the fight.
        return {
          ...outcome,
          view: {
            ...outcome.view,
            categories: [
              {
                category: "ASSIGNMENT",
                resolution: "NO_AUTHORITY_AVAILABLE",
                reason: "NO_RAID_COOLDOWN_PLAN",
              },
              ...outcome.view.categories.slice(1),
            ],
            assignments: [],
          },
        } as typeof outcome;
      },
    };
    const runner = restorationRunner(subject.rostered, identity());
    const result = await analyzeFight(
      { ...runner.ids, raidCooldownPlan: plan() },
      {
        env: MCP_TEST_ENV,
        registry: productionCatalogWith(contradicting),
        preflight: async () => ({ ok: true, identity: identity(), rateLimit: undefined }),
        ingest: async () => ({ ok: true, fight: subject.rostered, rateLimit: undefined }),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INTERNAL_ERROR");
  });
});

describe("the schema cannot express what the evaluator cannot prove", () => {
  const categories = [
    {
      category: "ASSIGNMENT",
      resolution: "EVALUATED_AGAINST_PLAN",
      authority: { kind: "USER_PROVIDED_RAID_PLAN", format: "STRUCTURED", label: null },
      assignmentsForOtherPlayers: 0,
    },
    {
      category: "COOLDOWN",
      resolution: "OBSERVED",
      authority: "WCL_OBSERVED_FACT",
      listing: { completeness: "COMPLETE" },
    },
    {
      category: "HEALING_DECISION",
      resolution: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_APPROVED_PER_CAST_HEALER_MODEL",
    },
  ];
  const locator = {
    streamId: "s",
    pageOrdinal: 0,
    indexInPage: 0,
    ingestionOrdinal: 0,
    rawType: "cast",
    reportTimeMs: 1,
  };
  const block = (assignments: unknown[], overrides: object = {}) => ({
    assessment: "ASSESSED",
    revision: "healer-view/1",
    identityData: { authority: "RUNTIME_GAME_DATA", datasetId: "d", artifactRevision: "r" },
    evaluatesHealingQuality: false,
    evaluatesPlanQuality: false,
    categories,
    assignments,
    cooldownUses: [],
    ...overrides,
  });
  const entry = (result: unknown) => ({
    findingId: "f",
    assignmentId: "a",
    abilityGameId: 98008,
    result,
    evidence: [],
  });
  const window = { fromReportTimeMs: 0, toReportTimeMs: 10 };

  it("accepts the evaluator's outcomes with exactly their actionability", () => {
    const met = {
      resolution: "OUTCOME",
      outcome: "ASSIGNMENT_MET",
      window,
      actionability: {
        actionability: "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION",
        abilityGameId: 98008,
        position: 3,
        evidence: locator,
      },
    };
    expect(HealerFindingsSchema.safeParse(block([entry(met)])).success).toBe(true);
    // MET without its proof, and the encounter-ended outcome claiming one, are refused.
    expect(
      HealerFindingsSchema.safeParse(
        block([entry({ ...met, actionability: { actionability: "NOT_EVALUATED" } })]),
      ).success,
    ).toBe(false);
    expect(
      HealerFindingsSchema.safeParse(block([entry({ ...met, outcome: "ASSIGNMENT_NOT_ACTIONABLE" })]))
        .success,
    ).toBe(false);
  });

  it("refuses a miss, an early or late claim, a quality flag, and results without a plan", () => {
    for (const outcome of [
      "ASSIGNMENT_MISSED",
      "ASSIGNMENT_EARLY",
      "ASSIGNMENT_LATE",
      "PLAN_MAY_NEED_REVIEW",
    ]) {
      const verdict = entry({
        resolution: "OUTCOME",
        outcome,
        window,
        actionability: { actionability: "NOT_EVALUATED" },
      });
      expect(HealerFindingsSchema.safeParse(block([verdict])).success, outcome).toBe(false);
    }
    expect(HealerFindingsSchema.safeParse(block([], { evaluatesHealingQuality: true })).success).toBe(false);
    expect(HealerFindingsSchema.safeParse(block([], { evaluatesPlanQuality: true })).success).toBe(false);
    const unknown = entry({ resolution: "UNKNOWN", reason: "READINESS_NOT_ESTABLISHED" });
    const noPlan = [
      { category: "ASSIGNMENT", resolution: "NO_AUTHORITY_AVAILABLE", reason: "NO_RAID_COOLDOWN_PLAN" },
      ...categories.slice(1),
    ];
    expect(HealerFindingsSchema.safeParse(block([unknown])).success).toBe(true);
    expect(HealerFindingsSchema.safeParse(block([unknown], { categories: noPlan })).success).toBe(false);
    // A cooldown use has no verdict field.
    expect(
      HealerFindingsSchema.safeParse(
        block([], {
          cooldownUses: [
            {
              findingId: "c",
              abilityGameId: 98008,
              reportTimeMs: 1,
              position: 3,
              evidence: [locator],
              healingContext: { context: "ROSTER_NOT_IN_SCOPE" },
              outcome: "LATE",
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it("only the two unanalyzed statuses may carry the block", () => {
    for (const status of ["SPEC_NOT_SUPPORTED", "PROFILE_NOT_RESOLVED", "ANALYZED"] as const) {
      const shape = PublicAnalysisResultSchema.options.find((option) => option.shape.status.value === status);
      expect(shape?.shape, status).not.toHaveProperty("healerFindings");
    }
    for (const status of ["AUTHORITY_NOT_AVAILABLE", "INSUFFICIENT_EVIDENCE"] as const) {
      const shape = PublicAnalysisResultSchema.options.find((option) => option.shape.status.value === status);
      expect(shape?.shape, status).toHaveProperty("healerFindings");
    }
  });

  it("the public evidence reasons equal their internal counterpart", () => {
    expect([...PUBLIC_HEALER_EVIDENCE_REASONS]).toEqual([...UNKNOWN_REASONS]);
  });
});
