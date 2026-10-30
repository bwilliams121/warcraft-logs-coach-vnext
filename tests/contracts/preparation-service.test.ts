/**
 * The shared PREPARATION producer inside the application service.
 *
 * - It runs in PARALLEL with the specialization analyzer, from the retrieved
 *   fight alone: its report is the same whether the analyzer analyzes or not.
 * - Its declared requirement is unioned into ingestion and never widens it:
 *   PLAYER_CONTEXT, and no resources the analyzer did not already ask for.
 * - An unsupported specialization's fight is retrieved for the producer alone
 *   (owner decision PREP-2), so its report carries the status too. A failed
 *   retrieval keeps the unsupported answer and discloses NOT_ASSESSED.
 */

import { describe, expect, it, vi } from "vitest";

import { assessConsumableStatus } from "../../src/analysis/preparation/consumable-status.js";
import { PREPARATION_REQUIREMENT } from "../../src/analysis/preparation/requirement.js";
import type { AnalyzerRegistration } from "../../src/findings/analyzer-registration.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import { ANALYZER_REGISTRATIONS } from "../../src/services/analyzer-registry.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import { ASSASSINATION_REGISTRATION } from "../../src/specs/rogue/assassination/registration.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { productionCatalogWith } from "../support/catalog.js";
import { M5D2_ACTOR, m5d2Fight } from "../support/m5d2-fixture.js";

const fight = m5d2Fight();
const identityFor = (specName: string, className = "Rogue"): FightIdentity => ({
  report: { code: fight.report.code, revision: fight.report.revision, startTime: 0, endTime: 1 },
  data: fight.data,
  fight: {
    id: fight.fight.id,
    name: fight.fight.name,
    encounterId: fight.fight.encounterId,
    difficulty: fight.fight.difficulty,
    startTime: fight.fight.startTimeMs,
    endTime: fight.fight.endTimeMs,
  },
  player: { sourceId: M5D2_ACTOR, name: "Fixtureplayer", className, specName },
});
const request = { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: M5D2_ACTOR };

function deps(registry: readonly AnalyzerRegistration[], identity = identityFor("Assassination")) {
  const preflight = vi.fn<PreflightPort>(async () => ({ ok: true, identity, rateLimit: undefined }));
  const ingest = vi.fn<CombatIngestionPort>(async () => ({ ok: true, fight, rateLimit: undefined }));
  const serviceDeps: AnalysisServiceDeps = { env: MCP_TEST_ENV, preflight, ingest, registry };
  return { serviceDeps, ingest };
}

describe("preparation runs with every analyzed request", () => {
  it("is ASSESSED over the retrieved fight, for the requested player, with all three statuses", async () => {
    const { serviceDeps } = deps(ANALYZER_REGISTRATIONS);
    const result = await analyzeFight(request, serviceDeps);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.analysis.preparation).toEqual({
      state: "ASSESSED",
      report: assessConsumableStatus(fight, M5D2_ACTOR),
    });
    if (result.analysis.preparation.state !== "ASSESSED") return;
    expect(Object.keys(result.analysis.preparation.report.statuses).sort()).toEqual([
      "COMBAT_POTION",
      "HEALTHSTONE",
      "HEALTH_POTION",
    ]);
  });

  it("does not depend on the specialization analyzer: the same report when the analyzer does not analyze", async () => {
    const declining: AnalyzerRegistration = {
      ...ASSASSINATION_REGISTRATION,
      analyze: () => ({ status: "AUTHORITY_NOT_AVAILABLE", specId: "rogue/assassination", detail: "test" }),
    };
    const analyzed = await analyzeFight(request, deps(ANALYZER_REGISTRATIONS).serviceDeps);
    const declined = await analyzeFight(request, deps(productionCatalogWith(declining)).serviceDeps);
    if (!analyzed.ok || !declined.ok) throw new Error("service failed");
    expect(declined.analysis.analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(declined.analysis.preparation).toEqual(analyzed.analysis.preparation);
    expect(declined.analysis.preparation.state).toBe("ASSESSED");
  });

  it("its requirement is unioned into ingestion and widens nothing", async () => {
    expect(PREPARATION_REQUIREMENT).toMatchObject({
      requiredScope: "PLAYER_CONTEXT",
      includeResources: false,
    });
    const { serviceDeps, ingest } = deps(ANALYZER_REGISTRATIONS);
    await analyzeFight(request, serviceDeps);
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0]?.[0]).toMatchObject({
      scope: "PLAYER_CONTEXT",
      includeResources: ASSASSINATION_REGISTRATION.requirement.includeResources,
    });
  });
});

describe("an unsupported specialization (PREP-2: retrieved for preparation alone)", () => {
  const mage = identityFor("Fire", "Mage");

  it("retrieves the fight once with the producer's own requirement, assesses it, and runs no analyzer", async () => {
    const { serviceDeps, ingest } = deps(ANALYZER_REGISTRATIONS, mage);
    const result = await analyzeFight(request, serviceDeps);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.analysis.analysis.status).toBe("SPEC_NOT_SUPPORTED");
    expect(result.analysis.analyzerId).toBeNull();
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0]?.[0]).toMatchObject({ scope: "PLAYER_CONTEXT", includeResources: false });
    expect(result.analysis.scope).toBe("PLAYER_CONTEXT");
    expect(result.analysis.preparation).toEqual({
      state: "ASSESSED",
      report: assessConsumableStatus(fight, M5D2_ACTOR),
    });
  });

  it("a retrieval failure keeps the unsupported answer and discloses NOT_ASSESSED (RETRIEVAL_FAILED)", async () => {
    const { serviceDeps, ingest } = deps(ANALYZER_REGISTRATIONS, mage);
    ingest.mockImplementation(
      async () => ({ ok: false, failure: { reason: "UPSTREAM_UNAVAILABLE" } }) as never,
    );
    const result = await analyzeFight(request, serviceDeps);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state).toBe("SPEC_NOT_SUPPORTED");
    expect(result.analysis.scope).toBeNull();
    expect(result.analysis.preparation).toEqual({ state: "NOT_ASSESSED", reason: "RETRIEVAL_FAILED" });
  });

  it("a report replaced between preflight and retrieval is not assessed", async () => {
    const { serviceDeps, ingest } = deps(ANALYZER_REGISTRATIONS, mage);
    const replaced = { ...fight, report: { ...fight.report, revision: fight.report.revision + 1 } };
    ingest.mockImplementation(async () => ({ ok: true, fight: replaced, rateLimit: undefined }));
    const result = await analyzeFight(request, serviceDeps);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.analysis.preparation).toEqual({ state: "NOT_ASSESSED", reason: "RETRIEVAL_FAILED" });
  });
});
