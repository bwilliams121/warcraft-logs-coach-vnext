/**
 * M11-B12: a real Blood Death Knight identity resolves PUBLICLY on both
 * transports, through the real Worker and the real MCP handler, over
 * fake-local evidence (the committed sanitized 45 s slice) — no Warcraft Logs
 * request, no credential.
 *
 * WHAT IS PROVEN
 *
 *   REST      /v1/analysis identifies DeathKnight/Blood, dispatches the Blood
 *             analyzer once, returns schema v1 with the slice's scoped
 *             semantics and no internal-only field.
 *   MCP       the analyze tool returns the SAME public document —
 *             `structuredContent` and the JSON in the text block deeply equal
 *             to the REST body (the established parity definition), and the
 *             tool's description communicates the narrow scope and the
 *             validated hero tree.
 *   BEFORE    until M11-B12 the same request answered SPEC_NOT_SUPPORTED on
 *             both transports; the Fire Mage still does, unchanged.
 *   AUTH      the generic bearer behaviour is untouched by the new
 *             specialization: no token, no analysis, and no leak of either
 *             token.
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
import { BLOOD_DEATH_KNIGHT_ANALYZER_ID } from "../../src/specs/deathknight/blood/spec.js";
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
  "io.modelcontextprotocol/clientInfo": { name: "m11b12-transports", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
const BLOOD = 14;

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
  const fight = corpusFight(BLOOD45);
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

const BLOOD_SUBJECT = { sourceId: BLOOD, className: "DeathKnight", specName: "Blood" };

describe("REST: a real Blood Death Knight identity resolves publicly", () => {
  it("identifies DeathKnight/Blood, dispatches the Blood analyzer once, and returns schema v1 with the scoped semantics", async () => {
    const runner = localRunner(BLOOD_SUBJECT);
    const rest = await restResult(runner.ids, runner.analyze);
    expect(rest.status).toBe(200);
    expect(runner.calls).toEqual({
      "rogue-assassination-observed-decisions": 0,
      "paladin-protection-observed-decisions": 0,
      "paladin-retribution-observed-decisions": 0,
      [BLOOD_DEATH_KNIGHT_ANALYZER_ID]: 1,
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
    expect(document.specialization).toEqual({ specId: "deathknight/blood", gameplaySupported: true });
    expect(document.analyzerId).toBe(BLOOD_DEATH_KNIGHT_ANALYZER_ID);
    expect(document.identity.player).toMatchObject({
      className: "DeathKnight",
      specName: "Blood",
      sourceId: BLOOD,
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
    expect(document.authority.authorityId).toBe("SIMC_APL_DEATHKNIGHT_BLOOD");
    expect(document.authority.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    // The 45 s slice's pinned semantics, unchanged by exposure (M11-B10).
    expect(document.coverage).toMatchObject({
      eligibleDecisions: 48,
      match: 17,
      rejected: 3,
      unknown: 28,
    });
    expect(document.coverage.exclusions).toEqual([
      { key: "NON_GCD_ACTION", count: 53 },
      { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
      { key: "OUTSIDE_SUPPORTED_SLICE", count: 5 },
    ]);
    for (const decision of document.decisions) {
      expect(["death_strike", "heart_strike", "blood_boil", "marrowrend", "deaths_caress"]).toContain(
        decision.observedToken,
      );
    }
    // The three REJECTED are the M11-B7 Heart Strikes the authority answers
    // with Marrowrend; a rejection names the authority's token, never a fault.
    const rejected = document.decisions.filter((decision) => decision.outcome === "REJECTED");
    expect(rejected).toHaveLength(3);
    for (const decision of rejected) {
      expect(decision).toMatchObject({
        observedToken: "heart_strike",
        basis: "AUTHORITY_SELECTED_DIFFERENT_TOKEN",
        authorityToken: "marrowrend",
      });
    }
    // A real MATCH and a real UNKNOWN are both published, with UNKNOWN first-class.
    expect(document.decisions.some((decision) => decision.outcome === "MATCH")).toBe(true);
    const unknown = document.decisions.filter((decision) => decision.outcome === "UNKNOWN");
    expect(unknown).toHaveLength(28);
    for (const decision of unknown) {
      expect(decision.basis).toBe("AUTHORITY_SELECTION_UNRESOLVED");
      expect(decision.authorityToken).toBeNull();
    }
    // No internal-only field or vocabulary on the wire.
    const json = JSON.stringify(rest.body);
    for (const internal of [
      "OUTSIDE_FIRST_SLICE",
      "MELEE_SWING",
      "rawBlocker",
      "observedActionRejected",
      "WINDOW_ORDER_INVARIANT_SET",
      "WINDOW_ORDER_INVARIANT_PRESENCE",
      "EXACT_STACK_OBSERVATION",
      "OWN_PRE_COST_AFFORDABLE",
      "bone_shield",
      "blood_debt",
      "essence_of_the_blood_queen",
      "sanlayn[",
      "run_action_list",
      "fight_remains",
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

  it("another Death Knight specialization is still SPEC_NOT_SUPPORTED: promotion named Blood and nothing else", async () => {
    const runner = localRunner({ sourceId: BLOOD, className: "DeathKnight", specName: "Frost" });
    const rest = await restResult(runner.ids, runner.analyze);
    expect(rest.status).toBe(200);
    expect(Object.values(runner.calls).every((count) => count === 0)).toBe(true);
    expect(rest.body).toMatchObject({
      status: "SPEC_NOT_SUPPORTED",
      specialization: { specId: null, gameplaySupported: false },
    });
  });

  it("the generic bearer behaviour is unchanged for the new specialization", async () => {
    const runner = localRunner(BLOOD_SUBJECT);
    const denied = await restResult(runner.ids, runner.analyze, {});
    expect(denied.status).toBe(401);
    expect(Object.values(runner.calls).every((count) => count === 0)).toBe(true);
    const json = JSON.stringify(denied.body);
    expect(json).not.toContain(TOKEN);
    expect(json).not.toContain("deathknight/blood");
  });
});

describe("MCP: the same public semantics as REST", () => {
  it("structuredContent and the JSON in the text block are deeply equal to the REST body, and all three are schema-valid", async () => {
    const runner = localRunner(BLOOD_SUBJECT);
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
      "deathknight/blood",
    );
    // Two transports, two dispatches of the SAME analyzer, and nothing else.
    expect(runner.calls[BLOOD_DEATH_KNIGHT_ANALYZER_ID]).toBe(2);
    expect(runner.calls["paladin-protection-observed-decisions"]).toBe(0);
    expect(runner.calls["paladin-retribution-observed-decisions"]).toBe(0);
    expect(runner.calls["rogue-assassination-observed-decisions"]).toBe(0);
  });

  it("the tool's derived description communicates the Blood slice, the validated hero tree and its limits, without advertising a full rotation", () => {
    // What tools/list publishes is derived from the PUBLIC catalog; the wire
    // form is pinned by m11a-tools-list-supported-specializations.
    const { sentence, limits } = PUBLIC_SPECIALIZATION_DESCRIPTIONS;
    expect(sentence).toBe(
      "Supported specializations: Assassination Rogue, Augmentation Evoker, Blood Death Knight, Brewmaster Monk, Havoc Demon Hunter, Holy Paladin, Holy Priest, Mistweaver Monk, Preservation Evoker, Protection Paladin, Restoration Shaman and Retribution Paladin.",
    );
    const blood = limits.find((entry) => entry.analysis.includes("Blood Death Knight analysis"));
    expect(blood?.analysis).toContain("observed offensive global-cooldown decisions");
    expect(blood?.analysis).toContain("VALIDATED FOR THE SAN'LAYN HERO TREE ONLY");
    expect(blood?.analysis).toContain("OUTSIDE_SUPPORTED_SLICE");
    expect(blood?.analysis).toContain("UNKNOWN is expected here and is not a fault");
    expect(blood?.analysis).toContain("does not score");
    expect(blood?.raidNight).toContain("only observed offensive global-cooldown decisions");
    expect(blood?.raidNight).toContain("San'layn");
    for (const text of [blood?.analysis ?? "", blood?.raidNight ?? ""]) {
      expect(text).not.toMatch(/full (blood )?rotation/i);
      expect(text).not.toMatch(/optimal|grade/i);
      expect(text).not.toMatch(/sanlayn\[|san_gift|run_action_list|rootScan|195181|433925/);
    }
  });
});
