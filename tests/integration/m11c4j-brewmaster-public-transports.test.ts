/**
 * M11-C4j: a real Brewmaster Monk identity resolves PUBLICLY on both
 * transports, through the real Worker and the real MCP handler, over
 * fake-local evidence (the committed sanitized captures of both independent
 * subjects) — no Warcraft Logs request, no credential.
 *
 * WHAT IS PROVEN
 *
 *   REST      /v1/analysis identifies Monk/Brewmaster, dispatches the
 *             Brewmaster analyzer once, and returns schema v1 carrying the
 *             M11-C4i outcomes unchanged — including BOTH real REJECTED
 *             decisions, one per subject — with no internal-only field.
 *   MCP       the analyze tool returns the SAME public document —
 *             `structuredContent` and the JSON in the text block deeply equal
 *             to the REST body — and the tool's derived description names the
 *             narrow slice, the validated hero tree and the retained UNKNOWN
 *             areas.
 *   BEFORE    until M11-C4j the same request answered SPEC_NOT_SUPPORTED; the
 *             Fire Mage sentinel still does, and so does another Monk
 *             specialization: promotion named Brewmaster and nothing else.
 *   REPEAT    the same request twice produces the identical document.
 *   AUTH      the generic bearer behaviour is untouched: no token, no
 *             analysis, and no leak of either token.
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
import { BREWMASTER_MONK_ANALYZER_ID } from "../../src/specs/monk/brewmaster/spec.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import {
  ALLOWING_LIMITER,
  MCP_TEST_ENV,
  authHeaders,
  workerDepsFor,
} from "../support/analysis-transports.js";
import { countedProductionCatalog } from "../support/catalog.js";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";
import { stateOfBundle } from "../support/corpus/fight.js";
import { committedCorpusFiles, validateEvidenceArchive } from "../support/corpus/loader.js";
import { CURRENT_UNSUPPORTED_SUBJECT } from "../support/unsupported-subject.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const TOKEN = "fake-analysis-token-not-real";
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m11c4j-transports", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

/** Subject 1 (gtKb fight 22 actor 4) over its composed 165 s window — both parts in the corpus. */
const SUBJECT_1 = {
  actor: 4,
  parts: ["wcl-brewmaster-monk-gtkb-opener", "wcl-brewmaster-monk-gtkb-rotational-165s.seg-20-165"],
};
/** Subject 2 (rXAf fight 13 actor 11) over its fixed 165 s window — the second part archived. */
const SUBJECT_2 = {
  actor: 11,
  parts: ["wcl-brewmaster-monk-rxaf-opener", "wcl-brewmaster-monk-rxaf-rotational-165s.seg-20-165"],
};

const EVERY_ANALYZER = [
  "rogue-assassination-observed-decisions",
  "paladin-protection-observed-decisions",
  "paladin-retribution-observed-decisions",
  "deathknight-blood-observed-decisions",
  BREWMASTER_MONK_ANALYZER_ID,
  "evoker-augmentation-support-observations",
  // HEAL-A; PUBLIC since HEAL-AP.
  "shaman-restoration-healer-findings",
  // HEAL-B1: Holy Paladin and Mistweaver Monk PUBLIC since HEAL-B1P; Restoration Druid INTERNAL_ONLY.
  "paladin-holy-healer-findings",
  "druid-restoration-healer-findings",
  "monk-mistweaver-healer-findings",
  // HEAL-B2: Holy Priest INTERNAL_ONLY; PUBLIC since HEAL-B2P.
  "priest-holy-healer-findings",
  "evoker-preservation-healer-findings",
  "demonhunter-havoc-observed-decisions",
  "rogue-subtlety-observed-decisions",
  "warrior-fury-observed-decisions",
  "warrior-protection-observed-decisions",
  "warrior-arms-observed-decisions",
  "deathknight-frost-observed-decisions",
  "shaman-enhancement-observed-decisions",
  "demonhunter-devourer-observed-decisions",
  "druid-feral-observed-decisions",
  "rogue-outlaw-observed-decisions",
  // HEAL-B3: Discipline Priest INTERNAL_ONLY.
  "priest-discipline-healer-findings",
  // HEAL-B4: Preservation Evoker INTERNAL_ONLY.
  "evoker-preservation-healer-findings",
] as const;

let nextId = 1;

interface Ids {
  readonly reportCode: string;
  readonly fightId: number;
  readonly sourceId: number;
}

interface Subject {
  readonly sourceId: number;
  readonly className: string;
  readonly specName: string;
}

async function fightOf(subject: { actor: number; parts: string[] }): Promise<CombatFight> {
  const loaded = await validateEvidenceArchive(committedEvidenceArchiveFiles(), committedCorpusFiles());
  if (!loaded.ok) throw new Error("the evidence archive does not validate");
  return stateOfBundle(loaded.archive, subject.parts, []).fight;
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

/** The REAL application service over committed evidence, with every Warcraft Logs port faked. */
function localRunner(
  fight: CombatFight,
  subject: Subject,
): {
  readonly analyze: AnalysisRunner;
  readonly ids: Ids;
  readonly calls: Readonly<Record<string, number>>;
} {
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

const brewmaster = (sourceId: number): Subject => ({ sourceId, className: "Monk", specName: "Brewmaster" });

/** Internal-only vocabulary and payload names; none may reach a public document. */
const INTERNAL_STRINGS = [
  "OUTSIDE_FIRST_SLICE",
  "MELEE_SWING",
  "rawBlocker",
  "observedActionRejected",
  "positiveUsability",
  "PROVEN_USABLE",
  "COOLDOWN_UPPER_BOUND",
  "PRE_COST_AT_LEAST_BASE_COST",
  "SAME_TARGET_RANGE_CONTAINED",
  "CANDIDATE_UNTARGETED",
  "readinessAuras",
  "shado_pan[",
  "master_of_harmony",
  "run_action_list",
  "empty_barrel",
  "blackout_combo",
  "1262768",
];

describe("REST: a real Brewmaster Monk identity resolves publicly", () => {
  it("subject 1: identifies Monk/Brewmaster, dispatches the Brewmaster analyzer once, and publishes the C4i outcomes with the real REJECTED", async () => {
    const runner = localRunner(await fightOf(SUBJECT_1), brewmaster(SUBJECT_1.actor));
    const rest = await restResult(runner.ids, runner.analyze);
    expect(rest.status).toBe(200);
    expect(runner.calls).toEqual(
      Object.fromEntries(EVERY_ANALYZER.map((id) => [id, id === BREWMASTER_MONK_ANALYZER_ID ? 1 : 0])),
    );
    const parsed = PublicAnalysisResultSchema.safeParse(rest.body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const document = parsed.data;
    expect(document.schemaVersion).toBe("warcraft-logs-coach.analysis/1");
    expect(document.status).toBe("ANALYZED");
    expect(document.specialization).toEqual({ specId: "monk/brewmaster", gameplaySupported: true });
    expect(document.analyzerId).toBe(BREWMASTER_MONK_ANALYZER_ID);
    expect(document.identity.player).toMatchObject({
      className: "Monk",
      specName: "Brewmaster",
      sourceId: SUBJECT_1.actor,
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
    expect(document.authority.authorityId).toBe("SIMC_APL_MONK_BREWMASTER");
    expect(document.authority.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    // The composed 165 s window's M11-C4i semantics, unchanged by exposure.
    expect(document.coverage).toMatchObject({ eligibleDecisions: 113, match: 71, rejected: 1, unknown: 41 });
    expect(document.coverage.exclusions).toEqual([
      { key: "NON_GCD_ACTION", count: 72 },
      { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 38 },
      { key: "OUTSIDE_SUPPORTED_SLICE", count: 7 },
    ]);
    for (const decision of document.decisions) {
      expect(["keg_smash", "blackout_kick", "tiger_palm", "breath_of_fire", "invoke_niuzao"]).toContain(
        decision.observedToken,
      );
    }
    // The one REJECTED is the Tiger Palm at 2,424,688 against Keg Smash.
    const rejected = document.decisions.filter((decision) => decision.outcome === "REJECTED");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      observedToken: "tiger_palm",
      basis: "AUTHORITY_SELECTED_DIFFERENT_TOKEN",
      authorityToken: "keg_smash",
      locator: { reportTimeMs: 2424688 },
    });
    // UNKNOWN is first-class and never carries an authority token.
    const unknown = document.decisions.filter((decision) => decision.outcome === "UNKNOWN");
    expect(unknown).toHaveLength(41);
    for (const decision of unknown) {
      expect(decision.basis).toBe("AUTHORITY_SELECTION_UNRESOLVED");
      expect(decision.authorityToken).toBeNull();
    }
    const json = JSON.stringify(rest.body);
    for (const internal of INTERNAL_STRINGS) expect(json, internal).not.toContain(internal);
  });

  it("subject 2: the independent subject's real REJECTED is published too (the Tiger Palm at 2,573,516 against Blackout Kick)", async () => {
    const runner = localRunner(await fightOf(SUBJECT_2), brewmaster(SUBJECT_2.actor));
    const rest = await restResult(runner.ids, runner.analyze);
    expect(rest.status).toBe(200);
    expect(runner.calls[BREWMASTER_MONK_ANALYZER_ID]).toBe(1);
    const parsed = PublicAnalysisResultSchema.safeParse(rest.body);
    expect(parsed.success).toBe(true);
    if (!parsed.success || parsed.data.status !== "ANALYZED") throw new Error("not analyzed");
    expect(parsed.data.coverage).toMatchObject({
      eligibleDecisions: 139,
      match: 47,
      rejected: 1,
      unknown: 91,
    });
    const rejected = parsed.data.decisions.filter((decision) => decision.outcome === "REJECTED");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      observedToken: "tiger_palm",
      basis: "AUTHORITY_SELECTED_DIFFERENT_TOKEN",
      authorityToken: "blackout_kick",
      locator: { reportTimeMs: 2573516 },
    });
    const json = JSON.stringify(rest.body);
    for (const internal of INTERNAL_STRINGS) expect(json, internal).not.toContain(internal);
  });

  it("the same request twice produces the identical document", async () => {
    const fight = await fightOf(SUBJECT_1);
    const first = await restResult(
      localRunner(fight, brewmaster(SUBJECT_1.actor)).ids,
      localRunner(fight, brewmaster(SUBJECT_1.actor)).analyze,
    );
    const second = await restResult(
      localRunner(fight, brewmaster(SUBJECT_1.actor)).ids,
      localRunner(fight, brewmaster(SUBJECT_1.actor)).analyze,
    );
    expect(second).toEqual(first);
  });

  it("the Fire Mage sentinel over the same evidence is still SPEC_NOT_SUPPORTED, and runs no analyzer", async () => {
    const runner = localRunner(await fightOf(SUBJECT_1), {
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

  it("another Monk specialization never reaches Brewmaster: Windwalker is SPEC_NOT_SUPPORTED, Mistweaver only its own analyzer", async () => {
    // HEAL-B1P: a stated Mistweaver dispatches its own healer row, once, and
    // never Brewmaster's. The subject's identity is not established as a
    // Mistweaver by this evidence, so nothing is evaluated and nothing is
    // ANALYZED.
    const mistweaver = localRunner(await fightOf(SUBJECT_1), {
      sourceId: SUBJECT_1.actor,
      className: "Monk",
      specName: "Mistweaver",
    });
    const asMistweaver = await restResult(mistweaver.ids, mistweaver.analyze);
    expect(asMistweaver.status).toBe(200);
    for (const [analyzerId, count] of Object.entries(mistweaver.calls)) {
      expect(count, analyzerId).toBe(analyzerId === "monk-mistweaver-healer-findings" ? 1 : 0);
    }
    expect(asMistweaver.body).toMatchObject({
      status: "INSUFFICIENT_EVIDENCE",
      specialization: { specId: "monk/mistweaver" },
      healerFindings: { assessment: "NOT_ASSESSED" },
    });

    for (const specName of ["Windwalker"]) {
      const runner = localRunner(await fightOf(SUBJECT_1), {
        sourceId: SUBJECT_1.actor,
        className: "Monk",
        specName,
      });
      const rest = await restResult(runner.ids, runner.analyze);
      expect(rest.status).toBe(200);
      expect(
        Object.values(runner.calls).every((count) => count === 0),
        specName,
      ).toBe(true);
      expect(rest.body, specName).toMatchObject({
        status: "SPEC_NOT_SUPPORTED",
        specialization: { specId: null, gameplaySupported: false },
      });
    }
  });

  it("the generic bearer behaviour is unchanged for the new specialization", async () => {
    const runner = localRunner(await fightOf(SUBJECT_1), brewmaster(SUBJECT_1.actor));
    const denied = await restResult(runner.ids, runner.analyze, {});
    expect(denied.status).toBe(401);
    expect(Object.values(runner.calls).every((count) => count === 0)).toBe(true);
    const json = JSON.stringify(denied.body);
    expect(json).not.toContain(TOKEN);
    expect(json).not.toContain("monk/brewmaster");
  });
});

describe("MCP: the same public semantics as REST", () => {
  it("structuredContent and the JSON in the text block are deeply equal to the REST body, and all three are schema-valid", async () => {
    for (const subject of [SUBJECT_1, SUBJECT_2]) {
      const runner = localRunner(await fightOf(subject), brewmaster(subject.actor));
      const rest = await restResult(runner.ids, runner.analyze);
      const mcp = await mcpResult(runner.ids, runner.analyze);
      expect(rest.status).toBe(200);
      expect(mcp.isError).toBeUndefined();
      const fromText: unknown = JSON.parse(mcp.content?.[0]?.text ?? "{}");
      expect(mcp.structuredContent).toEqual(rest.body);
      expect(fromText).toEqual(mcp.structuredContent);
      expect(PublicAnalysisResultSchema.safeParse(mcp.structuredContent).success).toBe(true);
      expect((mcp.structuredContent as { specialization: { specId: string } }).specialization.specId).toBe(
        "monk/brewmaster",
      );
      // Two transports, two dispatches of the SAME analyzer, and nothing else.
      expect(runner.calls).toEqual(
        Object.fromEntries(EVERY_ANALYZER.map((id) => [id, id === BREWMASTER_MONK_ANALYZER_ID ? 2 : 0])),
      );
    }
  });

  it("the tool's derived description names the Brewmaster slice, the validated hero tree and the retained UNKNOWN areas, without advertising a full rotation", () => {
    const { sentence, limits } = PUBLIC_SPECIALIZATION_DESCRIPTIONS;
    expect(sentence).toContain("Brewmaster Monk");
    const entry = limits.find((candidate) => candidate.analysis.includes("Brewmaster Monk analysis"));
    expect(entry?.analysis).toContain("observed offensive global-cooldown decisions");
    expect(entry?.analysis).toContain("VALIDATED FOR THE SHADO-PAN HERO TREE ONLY");
    expect(entry?.analysis).toContain("OUTSIDE_SUPPORTED_SLICE");
    expect(entry?.analysis).toContain("Black Ox Brew");
    expect(entry?.analysis).toContain("Keg Smash charges or its hasted");
    expect(entry?.analysis).toContain("Empty the");
    expect(entry?.analysis).toContain("every");
    expect(entry?.analysis).toContain("UNKNOWN is expected here and is");
    expect(entry?.analysis).toContain("does not score performance");
    expect(entry?.raidNight).toContain("only observed offensive global-cooldown decisions");
    expect(entry?.raidNight).toContain("Shado-Pan");
    for (const text of [entry?.analysis ?? "", entry?.raidNight ?? ""]) {
      expect(text).not.toMatch(/full (brewmaster )?rotation/i);
      expect(text).not.toMatch(/optimal|grade/i);
      expect(text).not.toMatch(/shado_pan\[|run_action_list|rootScan|1262768/);
    }
  });
});
