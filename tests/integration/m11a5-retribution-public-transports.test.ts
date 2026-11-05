/**
 * M11-A5: a real Retribution Paladin identity resolves PUBLICLY on both
 * transports, through the real Worker and the real MCP handler, over
 * fake-local evidence (the committed sanitized 45 s slice) — no Warcraft Logs
 * request, no credential.
 *
 * WHAT IS PROVEN
 *
 *   REST      /v1/analysis identifies Paladin/Retribution, dispatches the
 *             Retribution analyzer, returns schema v1 with the slice's scoped
 *             semantics and no internal-only field.
 *   MCP       the analyze tool returns the SAME public document —
 *             `structuredContent` and the JSON in the text block deeply equal
 *             to the REST body (the established parity definition), and the
 *             tool's description communicates the narrow scope.
 *   BEFORE    until M11-A5 the same request answered SPEC_NOT_SUPPORTED on
 *             both transports; the Fire Mage still does, unchanged.
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
import { RETRIBUTION_PALADIN_ANALYZER_ID } from "../../src/specs/paladin/retribution/spec.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import {
  ALLOWING_LIMITER,
  MCP_TEST_ENV,
  authHeaders,
  workerDepsFor,
} from "../support/analysis-transports.js";
import { countedProductionCatalog } from "../support/catalog.js";
import { corpusFight } from "../support/corpus/fight.js";
import { CURRENT_UNSUPPORTED_SUBJECT } from "../support/unsupported-subject.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const TOKEN = "fake-analysis-token-not-real";
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m11a5-transports", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

const RET45 = "wcl-retribution-paladin-a7r6-rotational-45s";
const RET = 6;

let nextId = 1;

interface Ids {
  readonly reportCode: string;
  readonly fightId: number;
  readonly sourceId: number;
}

function identityFor(
  fight: CombatFight,
  subject: { sourceId: number; className: string; specName: string },
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
    player: {
      sourceId: subject.sourceId,
      name: "Corpusplayer",
      className: subject.className,
      specName: subject.specName,
    },
  };
}

/** The REAL application service over the committed slice, with every Warcraft Logs port faked. */
function localRunner(subject: { sourceId: number; className: string; specName: string }): {
  readonly analyze: AnalysisRunner;
  readonly ids: Ids;
  readonly calls: Readonly<Record<string, number>>;
} {
  const fight = corpusFight(RET45);
  const counted = countedProductionCatalog();
  const deps: AnalysisServiceDeps = {
    env: MCP_TEST_ENV,
    preflight: async () => ({ ok: true, identity: identityFor(fight, subject), rateLimit: undefined }),
    ingest: async () => ({ ok: true, fight, rateLimit: undefined }),
    registry: counted.registry,
  };
  return {
    analyze: async (input) => await analyzeFight(input, deps),
    ids: { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: subject.sourceId },
    calls: counted.calls,
  };
}

async function restResult(ids: Ids, analyze: AnalysisRunner): Promise<{ status: number; body: unknown }> {
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

const RETRIBUTION_SUBJECT = { sourceId: RET, className: "Paladin", specName: "Retribution" };

describe("REST: a real Retribution Paladin identity resolves publicly", () => {
  it("identifies Paladin/Retribution, dispatches the Retribution analyzer once, and returns schema v1 with the scoped semantics", async () => {
    const runner = localRunner(RETRIBUTION_SUBJECT);
    const rest = await restResult(runner.ids, runner.analyze);
    expect(rest.status).toBe(200);
    expect(runner.calls).toEqual({
      "rogue-assassination-observed-decisions": 0,
      "paladin-protection-observed-decisions": 0,
      [RETRIBUTION_PALADIN_ANALYZER_ID]: 1,
      "deathknight-blood-observed-decisions": 0,
      "monk-brewmaster-observed-decisions": 0,
      "evoker-augmentation-support-observations": 0,
      "shaman-restoration-healer-findings": 0,
      "paladin-holy-healer-findings": 0,
      "druid-restoration-healer-findings": 0,
      "monk-mistweaver-healer-findings": 0,
      "priest-holy-healer-findings": 0,
      "priest-discipline-healer-findings": 0,
      "evoker-preservation-healer-findings": 0,
      "demonhunter-havoc-observed-decisions": 0,
      "rogue-subtlety-observed-decisions": 0,
      "warrior-fury-observed-decisions": 0,
      "warrior-protection-observed-decisions": 0,
      "warrior-arms-observed-decisions": 0,
      "deathknight-frost-observed-decisions": 0,
      "shaman-enhancement-observed-decisions": 0,
      "demonhunter-devourer-observed-decisions": 0,
      "druid-feral-observed-decisions": 0,
      "warlock-destruction-observed-decisions": 0,
      "shaman-elemental-observed-decisions": 0,
      "druid-balance-observed-decisions": 0,
      "priest-shadow-observed-decisions": 0,
      "mage-arcane-observed-decisions": 0,
      "mage-frost-observed-decisions": 0,
      "warlock-affliction-observed-decisions": 0,
      "hunter-marksmanship-observed-decisions": 0,
      "rogue-outlaw-observed-decisions": 0,
    });
    const parsed = PublicAnalysisResultSchema.safeParse(rest.body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    expect(document.schemaVersion).toBe("warcraft-logs-coach.analysis/1");
    expect(document.status).toBe("ANALYZED");
    expect(document.specialization).toEqual({ specId: "paladin/retribution", gameplaySupported: true });
    expect(document.analyzerId).toBe(RETRIBUTION_PALADIN_ANALYZER_ID);
    expect(document.identity.player).toMatchObject({
      className: "Paladin",
      specName: "Retribution",
      sourceId: RET,
    });
    expect(document.capability).toMatchObject({
      analysisKind: "OBSERVED_DECISION_AUTHORITY_VERIFICATION",
      matchMeaning: "AUTHORITY_COMPATIBLE_ONLY",
      scoresPerformance: false,
      predictsArbitraryNextAction: false,
      unknownIsFirstClass: true,
      partialCoverageIsExpected: true,
    });
    if (document.status !== "ANALYZED") return;
    expect(document.authority.authorityId).toBe("SIMC_APL_PALADIN_RETRIBUTION");
    expect(document.authority.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    // The slice's scoped semantics: spender decisions only, the rest excluded
    // under the public slice-boundary reason, the real REJECTED carried.
    expect(document.coverage).toMatchObject({ eligibleDecisions: 26, match: 0, rejected: 1, unknown: 25 });
    expect(document.coverage.exclusions).toEqual([
      { key: "NON_GCD_ACTION", count: 38 },
      { key: "OUTSIDE_SUPPORTED_SLICE", count: 20 },
    ]);
    for (const decision of document.decisions) {
      expect(["divine_storm", "templars_verdict"]).toContain(decision.observedToken);
    }
    const rejected = document.decisions.filter((decision) => decision.outcome === "REJECTED");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      observedToken: "divine_storm",
      basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
      authorityToken: null,
      locator: { reportTimeMs: 2_006_193 },
    });
    // No internal-only field or vocabulary on the wire.
    const json = JSON.stringify(rest.body);
    for (const internal of [
      "OUTSIDE_FIRST_SLICE",
      "MELEE_SWING",
      "rawBlocker",
      "rootScanBlockedAt",
      "observedActionRejected",
      "holyPower",
      "domains",
      "foregroundProvenByObservedExecution",
      "call_action_list",
    ]) {
      expect(json, internal).not.toContain(internal);
    }
  });

  it("the Fire Mage over the same evidence is still SPEC_NOT_SUPPORTED, and runs no analyzer", async () => {
    const runner = localRunner({
      sourceId: CURRENT_UNSUPPORTED_SUBJECT.sourceId,
      className: CURRENT_UNSUPPORTED_SUBJECT.expectedClassName,
      specName: CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName,
    });
    const rest = await restResult(runner.ids, runner.analyze);
    expect(rest.status).toBe(200);
    expect(Object.values(runner.calls).every((count) => count === 0)).toBe(true);
    expect(rest.body).toMatchObject({
      status: "SPEC_NOT_SUPPORTED",
      specialization: { specId: null, gameplaySupported: false },
      analyzerId: null,
    });
  });
});

describe("MCP: the same public semantics as REST", () => {
  it("structuredContent and the JSON in the text block are deeply equal to the REST body, and all three are schema-valid", async () => {
    const runner = localRunner(RETRIBUTION_SUBJECT);
    const rest = await restResult(runner.ids, runner.analyze);
    const mcp = await mcpResult(runner.ids, runner.analyze);
    expect(rest.status).toBe(200);
    expect(mcp.isError).toBeUndefined();
    const fromText: unknown = JSON.parse(mcp.content?.[0]?.text ?? "{}");
    expect(mcp.structuredContent).toEqual(rest.body);
    expect(fromText).toEqual(mcp.structuredContent);
    expect(fromText).toEqual(rest.body);
    expect(PublicAnalysisResultSchema.safeParse(rest.body).success).toBe(true);
    expect(PublicAnalysisResultSchema.safeParse(mcp.structuredContent).success).toBe(true);
    expect(PublicAnalysisResultSchema.safeParse(fromText).success).toBe(true);
    expect((mcp.structuredContent as { specialization: { specId: string } }).specialization.specId).toBe(
      "paladin/retribution",
    );
    // Two transports, two dispatches of the SAME analyzer, and nothing else.
    expect(runner.calls[RETRIBUTION_PALADIN_ANALYZER_ID]).toBe(2);
    expect(runner.calls["paladin-protection-observed-decisions"]).toBe(0);
    expect(runner.calls["rogue-assassination-observed-decisions"]).toBe(0);
  });

  it("the tool's derived description communicates the Retribution slice and its limits, without advertising a full rotation", () => {
    // What tools/list publishes is derived from the PUBLIC catalog; the wire
    // form is pinned by m11a-tools-list-supported-specializations.
    const { sentence, limits } = PUBLIC_SPECIALIZATION_DESCRIPTIONS;
    // M11-B12 added the fourth public specialization; the sentence is derived
    // and the limits are ordered by the catalog, so Retribution is found by
    // its own content rather than by a position this file would have to chase.
    expect(sentence).toBe(
      "Supported specializations: Assassination Rogue, Augmentation Evoker, Blood Death Knight, Brewmaster Monk, Havoc Demon Hunter, Holy Paladin, Holy Priest, Mistweaver Monk, Preservation Evoker, Protection Paladin, Restoration Shaman and Retribution Paladin.",
    );
    const retribution = limits.find((entry) => entry.analysis.includes("Retribution Paladin analysis"));
    expect(retribution?.analysis).toContain("only observed Holy Power SPENDER decisions");
    expect(retribution?.analysis).toContain("OUTSIDE_SUPPORTED_SLICE");
    expect(retribution?.analysis).toContain("remains UNKNOWN, which is expected and is not a fault");
    expect(retribution?.raidNight).toContain("only observed Holy Power SPENDER decisions");
    for (const text of [retribution?.analysis ?? "", retribution?.raidNight ?? ""]) {
      expect(text).not.toMatch(/full Retribution rotation/i);
      expect(text).not.toMatch(/optimal|score|grade/i);
      expect(text).not.toMatch(/cooldowns\[|generators\[|finishers\[|31884|454351|rootScan/);
    }
  });
});
