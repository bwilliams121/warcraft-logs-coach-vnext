/**
 * M15-F: product hardening and final coverage disclosure, over the integrated
 * public reports.
 *
 * Every report shape a caller can receive, produced by the real application
 * service (only preflight and ingestion are doubles) and published through
 * BOTH transports:
 *
 *   ANALYZED with divergences   the M5-A rejection fixture (Assassination)
 *   ANALYZED, partial           the M5-D2 fixture (Assassination)
 *   ANALYZED + raid plan        the M5-D2 fixture with a supplied plan
 *   SPEC_NOT_SUPPORTED          the canonical unsupported subject (Devastation)
 *   support observations        the real M13-A Augmentation Evoker
 *   raid night                  a mixed 100-cell night and a night with no
 *                               analyzed cell
 *
 * What must hold, on every shape:
 * - REST and MCP publish the identical document, and it validates;
 * - the coverage disclosure is present, PARTIAL, never empty, and stated
 *   before anything else ("we could only analyze part of this" is never
 *   left for the reader to infer);
 * - the three consumables are always present, and an UNKNOWN count is never
 *   a number;
 * - whatever the document carries that the summary does not restate is
 *   disclosed by name.
 *
 * And the CLAUDE.md "Mandatory Negative-Test Philosophy" cases that reach a
 * published report, asserted on these integrated documents (not on units):
 * an unsupported specialization never reads as clean play; a low-coverage
 * analysis never presents itself as complete; UNKNOWN is never highlighted,
 * never a failure and never zero; UNKNOWN and NO_AUTHORITY_AVAILABLE never
 * stand in for each other; a missing healer plan never becomes an assignment;
 * nothing is proven actionable without evidence; no score exists anywhere;
 * consumable categories are never omitted; racial abilities never appear in a
 * finding.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  RAID_NIGHT_DISCLOSURES,
  discloseRaidNightCoverage,
} from "../../src/aggregation/raid-night-disclosure.js";
import { createWorker } from "../../src/api/worker.js";
import {
  PUBLIC_TLDR_DISCLOSURES,
  PublicAnalysisResultSchema,
  type PublicAnalysisResult,
} from "../../src/contracts/analysis-contract.js";
import {
  PUBLIC_RAID_NIGHT_DISCLOSURES,
  PublicRaidNightResultSchema,
  type PublicRaidNightResult,
} from "../../src/contracts/raid-night-contract.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { RAID_NIGHT_TOOL_NAME } from "../../src/mcp/tools/analyze-raid-night.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import type { AnalysisRunner } from "../../src/services/analysis-runner.js";
import type { RaidNightRunner } from "../../src/services/raid-night-runner.js";
import { renderReportMarkdown } from "../../src/reporting/fight-report.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import {
  ALLOWING_LIMITER,
  D2_REQUEST,
  MCP_TEST_ENV,
  authHeaders,
  fixedRaidNightRunner,
  fixtureAnalysisRunner,
  m5aRequest,
  workerDepsFor,
} from "../support/analysis-transports.js";
import { countedProductionCatalog } from "../support/catalog.js";
import { loadCommittedEvidenceArchive } from "../support/corpus/evidence-archive.js";
import { bundleOf } from "../support/corpus/fight.js";
import { m5d2Fight } from "../support/m5d2-fixture.js";
import {
  aggregateOf,
  hundredCellAggregate,
  notAnalyzedCell,
  rosterFightFor,
  rosterPlayerFor,
} from "../support/raid-night-fixture.js";
import { UNSUPPORTED_WCL_IDENTITY } from "../support/unsupported-subject.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const TOKEN = "fake-analysis-token-not-real";
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m15f-hardening", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

let nextId = 1;

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

async function restBody(path: string, body: object, deps: Parameters<typeof workerDepsFor>[0]) {
  const response = await createWorker(workerDepsFor({ rateLimiter: ALLOWING_LIMITER, ...deps })).fetch(
    new Request(`https://${HOST}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }),
    MCP_TEST_ENV,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as unknown;
}

async function mcpStructured(
  tool: string,
  args: object,
  deps: { analyze?: AnalysisRunner; analyzeRaidNight?: RaidNightRunner },
): Promise<unknown> {
  const response = await handleMcpRequest(
    new Request(`https://${HOST}/mcp`, {
      method: "POST",
      headers: {
        host: HOST,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${TOKEN}`,
        "mcp-method": "tools/call",
        "mcp-name": tool,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId++,
        method: "tools/call",
        params: { name: tool, arguments: args, _meta: MODERN_META },
      }),
    }),
    MCP_TEST_ENV,
    { analyze: deps.analyze ?? fixtureAnalysisRunner(), rateLimiter: ALLOWING_LIMITER, ...deps },
  );
  const payload = JSON.parse(await response.text()) as {
    result: { isError?: boolean; structuredContent?: unknown; content?: { text: string }[] };
  };
  expect(payload.result.isError ?? false).toBe(false);
  // The text block carries the same document as the structured content.
  expect(JSON.parse(payload.result.content?.[0]?.text ?? "null")).toEqual(payload.result.structuredContent);
  return payload.result.structuredContent;
}

/** One analysis through both transports: identical, schema-valid, and returned once. */
async function publishedAnalysis(request: object, analyze: AnalysisRunner): Promise<PublicAnalysisResult> {
  const rest = await restBody("/v1/analysis", request, { analyze });
  const mcp = await mcpStructured(ANALYZE_TOOL_NAME, { source: "ids", ...request }, { analyze });
  expect(mcp).toEqual(rest);
  return PublicAnalysisResultSchema.parse(rest);
}

async function publishedNight(fightIds: readonly number[], runner: RaidNightRunner) {
  const request = { reportCode: "aBcDeFgH12345678", fightIds };
  const rest = await restBody("/v1/raid-night", request, { raidNight: runner });
  const mcp = await mcpStructured(
    RAID_NIGHT_TOOL_NAME,
    { source: "ids", ...request },
    { analyzeRaidNight: runner },
  );
  expect(mcp).toEqual(rest);
  return PublicRaidNightResultSchema.parse(rest);
}

// ---------------------------------------------------------------------------
// The shapes
// ---------------------------------------------------------------------------

const D2 = m5d2Fight();
const PLAN = {
  format: "TIMELINE_NOTE",
  encounterId: D2.fight.encounterId,
  difficulty: D2.fight.difficulty ?? 0,
  defaultToleranceMs: 3_000,
  label: "healer CDs",
  text: "time:3;ph:2;tag:Jymblu;spellid:98008;",
} as const;

const EVOKER = 1;
let evokerFight: CombatFight;

function evokerRunner(): { analyze: AnalysisRunner; ids: object } {
  const fight = evokerFight;
  const identity: FightIdentity = {
    report: { code: fight.report.code, revision: fight.report.revision, startTime: 0, endTime: 0 },
    data: fight.data,
    fight: {
      id: fight.fight.id,
      name: fight.fight.name,
      encounterId: fight.fight.encounterId,
      difficulty: fight.fight.difficulty,
      startTime: fight.fight.startTimeMs,
      endTime: fight.fight.endTimeMs,
    },
    player: { sourceId: EVOKER, name: "Subject", className: "Evoker", specName: "Augmentation" },
  };
  const deps: AnalysisServiceDeps = {
    env: MCP_TEST_ENV,
    preflight: async () => ({ ok: true, identity, rateLimit: undefined }),
    ingest: async () => ({ ok: true, fight, rateLimit: undefined }),
    registry: countedProductionCatalog().registry,
  };
  return {
    analyze: async (input) => await analyzeFight(input, deps),
    ids: { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: EVOKER },
  };
}

interface Shape {
  readonly name: string;
  readonly document: PublicAnalysisResult;
}

const shapes: Shape[] = [];
const byName = (name: string): PublicAnalysisResult => {
  const shape = shapes.find((candidate) => candidate.name === name);
  if (shape === undefined) throw new Error(`no shape ${name}`);
  return shape.document;
};

let mixedNight: PublicRaidNightResult;
let emptyNight: PublicRaidNightResult;
const MIXED_AGGREGATE = hundredCellAggregate();
const EMPTY_AGGREGATE = aggregateOf({
  players: [rosterPlayerFor({ sourceId: 7, name: "Player7" })],
  fights: [rosterFightFor({ fightId: 1, participants: [{ sourceId: 7, specName: "Devastation" }] })],
  cells: [
    notAnalyzedCell({ fightId: 1, sourceId: 7, status: "SPEC_NOT_SUPPORTED", specName: "Devastation" }),
  ],
});

beforeAll(async () => {
  const loaded = await loadCommittedEvidenceArchive();
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
  evokerFight = bundleOf(
    loaded.archive,
    ["wcl-m13a-aug1-fight-1-support.seg-0-75", "wcl-m13a-aug1-fight-1-support.seg-75-151"],
    [],
    { catalogArtifactId: "wcl-m13a-fight-context-aug1-fight-1" },
  ).fight;

  const evoker = evokerRunner();
  shapes.push(
    {
      name: "divergences",
      document: await publishedAnalysis(m5aRequest(), fixtureAnalysisRunner({ fixture: "m5a" })),
    },
    { name: "partial", document: await publishedAnalysis(D2_REQUEST, fixtureAnalysisRunner()) },
    {
      name: "plan",
      document: await publishedAnalysis({ ...D2_REQUEST, raidCooldownPlan: PLAN }, fixtureAnalysisRunner()),
    },
    {
      name: "unsupported",
      document: await publishedAnalysis(D2_REQUEST, fixtureAnalysisRunner(UNSUPPORTED_WCL_IDENTITY)),
    },
    { name: "support", document: await publishedAnalysis(evoker.ids, evoker.analyze) },
  );
  mixedNight = await publishedNight([1, 2], fixedRaidNightRunner(MIXED_AGGREGATE).runner);
  emptyNight = await publishedNight([1], fixedRaidNightRunner(EMPTY_AGGREGATE).runner);
}, 180_000);

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

function assessedTldr(document: PublicAnalysisResult) {
  if (document.tldr?.assessment !== "ASSESSED") throw new Error("the TLDR was not assessed");
  return document.tldr;
}

function assessedReport(document: PublicAnalysisResult) {
  if (document.report?.assessment !== "ASSESSED") throw new Error("the report was not assessed");
  return document.report;
}

// ---------------------------------------------------------------------------
// Coverage disclosure on every single-fight shape
// ---------------------------------------------------------------------------

describe("every single-fight shape discloses its coverage first, and the same way", () => {
  it("produced every shape it claims to cover, with the expected status", () => {
    expect(shapes.map((shape) => [shape.name, shape.document.status])).toEqual([
      ["divergences", "ANALYZED"],
      ["partial", "ANALYZED"],
      ["plan", "ANALYZED"],
      ["unsupported", "SPEC_NOT_SUPPORTED"],
      ["support", "AUTHORITY_NOT_AVAILABLE"],
    ]);
  });

  it("the TLDR and the report are PARTIAL, never-empty, agree on gameplay and preparation, and open with coverage", () => {
    for (const { name, document } of shapes) {
      const tldr = assessedTldr(document);
      const report = assessedReport(document);
      expect(tldr.assessmentScope, name).toBe("PARTIAL");
      expect(report.assessmentScope, name).toBe("PARTIAL");
      expect(document.capability.partialCoverageIsExpected, name).toBe(true);
      expect(tldr.disclosures.length, name).toBeGreaterThan(0);
      expect(report.coverage.disclosures.length, name).toBeGreaterThan(0);
      // One coverage story: the report holds the TLDR's disclosures except the
      // TLDR-only "not listed" (the report lists every item).
      expect(report.coverage.disclosures, name).toEqual(
        tldr.disclosures.filter((code) => code !== "DIVERGENCES_NOT_LISTED"),
      );
      expect(report.coverage.gameplay, name).toEqual(tldr.gameplay);
      expect(report.coverage.preparation, name).toEqual(tldr.preparation);
      // The coverage sentence comes first, before any headline.
      expect(tldr.lines[0], name).toMatch(/^(Partial analysis: |Gameplay was not analyzed )/);
      expect(report.markdown.split("\n").slice(0, 3).join("\n"), name).toContain(
        "**Partial analysis.** This report covers only part of the fight. It is not a complete assessment.",
      );
      // The published markdown is the published structure, rendered.
      expect(report.markdown, name).toBe(renderReportMarkdown(report));
      // Codes come from the published vocabulary, in its order.
      expect(tldr.disclosures, name).toEqual(
        PUBLIC_TLDR_DISCLOSURES.filter((code) => tldr.disclosures.includes(code)),
      );
    }
  });

  it("an analyzed document's coverage counts agree across coverage, TLDR and report", () => {
    for (const name of ["divergences", "partial", "plan"]) {
      const document = byName(name);
      if (document.status !== "ANALYZED") throw new Error("not analyzed");
      const tldr = assessedTldr(document);
      expect(tldr.gameplay, name).toEqual({
        status: "ANALYZED",
        eligibleDecisions: document.coverage.eligibleDecisions,
        resolvedDecisions: document.coverage.resolvedComparisons,
        unknownDecisions: document.coverage.unknown,
        excludedCasts: document.coverage.excludedCastCount,
      });
      expect(tldr.disclosures, name).toContain("ONLY_OBSERVED_DECISIONS_VERIFIED");
      if (document.coverage.unknown > 0) expect(tldr.disclosures, name).toContain("DECISIONS_UNKNOWN");
    }
  });

  it("names what the document carries that the summary does not restate, and nothing it does not carry", () => {
    for (const { name, document } of shapes) {
      const tldr = assessedTldr(document);
      const carriesSupport = "supportObservations" in document && document.supportObservations !== undefined;
      const carriesPlan = document.raidCooldownPlan !== undefined;
      expect(tldr.disclosures.includes("SUPPORT_OBSERVATIONS_NOT_SUMMARIZED"), name).toBe(carriesSupport);
      expect(tldr.disclosures.includes("RAID_COOLDOWN_PLAN_NOT_EVALUATED"), name).toBe(carriesPlan);
      expect(
        tldr.lines.some((line) => line.startsWith("Support observations are published separately")),
        name,
      ).toBe(carriesSupport);
      expect(report(document).markdown.includes("- Not in this report: "), name).toBe(
        carriesSupport || carriesPlan,
      );
    }
    expect(byName("support").raidCooldownPlan).toBeUndefined();
    expect(byName("plan").raidCooldownPlan?.assignmentEvaluation.state).toBe("NOT_EVALUATED");
  });
});

const report = assessedReport;

// ---------------------------------------------------------------------------
// The mandatory negative cases, on the integrated documents
// ---------------------------------------------------------------------------

describe("negative cases over the integrated reports", () => {
  it("an unsupported specialization never reads as clean play", () => {
    const document = byName("unsupported");
    expect(document.specialization.gameplaySupported).toBe(false);
    for (const absent of ["decisions", "coverage", "exclusions", "authority", "diagnosis"]) {
      expect(absent in document, absent).toBe(false);
    }
    const tldr = assessedTldr(document);
    expect(tldr.headline).toBe("GAMEPLAY_NOT_ANALYZED");
    expect(tldr.disclosures).toContain("GAMEPLAY_NOT_ANALYZED");
    expect(tldr.lines[0]).toContain("this is not evidence of clean play");
    expect(tldr.highlights).toEqual([]);
    expect(report(document).coverage.disclosures).toContain("GAMEPLAY_NOT_ANALYZED");
    expect(report(document).categories.flatMap((section) => section.prioritized)).toEqual([]);
  });

  it("a support-observation document never reads as an assessment of the player", () => {
    const document = byName("support");
    const tldr = assessedTldr(document);
    expect(tldr.headline).toBe("GAMEPLAY_NOT_ANALYZED");
    expect(tldr.disclosures).toEqual(
      expect.arrayContaining(["GAMEPLAY_NOT_ANALYZED", "SUPPORT_OBSERVATIONS_NOT_SUMMARIZED"]),
    );
    expect(tldr.highlights).toEqual([]);
  });

  it("a low-coverage analysis never presents itself as complete", () => {
    for (const name of ["divergences", "partial", "plan"]) {
      const tldr = assessedTldr(byName(name));
      expect(tldr.lines[0], name).toMatch(
        /^Partial analysis: \d+ of \d+ eligible observed decisions? resolved/,
      );
      expect(tldr.lines[0], name).toContain(
        "Only observed decisions were verified, not moments of inaction.",
      );
      for (const line of tldr.lines) expect(line, name).not.toMatch(/\bcomplete assessment\b(?! )/);
    }
  });

  it("UNKNOWN is never highlighted, never a divergence and never counted as a failure", () => {
    for (const { name, document } of shapes) {
      const tldr = assessedTldr(document);
      const entries = report(document).categories;
      // Highlights are prioritized items only: REJECTED divergences with evidence.
      for (const highlight of tldr.highlights) expect(highlight.evidence.length, name).toBeGreaterThan(0);
      for (const section of entries) {
        for (const entry of section.prioritized) expect(entry.disposition, name).toBe("AUTHORITY_DIVERGENCE");
        for (const entry of section.carried) expect(entry.section, name).toBe("CARRIED");
      }
      if (document.status === "ANALYZED") {
        const rejected = document.decisions.filter((decision) => decision.outcome === "REJECTED").length;
        expect(tldr.divergences.records, name).toBe(rejected);
        const unknownTallied = tldr.notAssessed
          .filter((row) => row.disposition === "UNKNOWN" && row.category === "ROTATION")
          .reduce((sum, row) => sum + row.records, 0);
        expect(unknownTallied, name).toBe(document.coverage.unknown);
      }
    }
    // The divergence fixture really exercises the prioritized path.
    expect(assessedTldr(byName("divergences")).highlights.length).toBeGreaterThan(0);
  });

  it("nothing is proven actionable without evidence: no fixture establishes an alternative as possible", () => {
    for (const { name, document } of shapes) {
      const tldr = assessedTldr(document);
      expect(tldr.divergences.actionableRecords, name).toBe(0);
      for (const highlight of tldr.highlights)
        expect(highlight.standing, name).not.toBe("ACTIONABLE_AUTHORITY_DIVERGENCE");
      for (const section of report(document).categories)
        for (const entry of [...section.prioritized, ...section.informational, ...section.carried])
          expect(entry.actionability, name).not.toBe("DECISION_PROVEN_ACTIONABLE");
      if (tldr.highlights.length > 0)
        expect(tldr.disclosures, name).toContain("DIVERGENCE_ACTIONABILITY_UNPROVEN");
    }
  });

  it("the three consumables are never omitted, and an UNKNOWN count is never a number", () => {
    for (const { name, document } of shapes) {
      expect(document.preparation, name).toBeDefined();
      const tldr = assessedTldr(document);
      if (tldr.preparation.assessment !== "ASSESSED") throw new Error(`${name}: preparation not assessed`);
      for (const kind of ["healthPotion", "healthstone", "combatPotion"] as const) {
        const status = tldr.preparation[kind];
        if (status.countState === "UNKNOWN") expect("count" in status, `${name} ${kind}`).toBe(false);
      }
      const prep = report(document).categories.find((section) => section.category === "PREPARATION");
      const entries = [...(prep?.informational ?? []), ...(prep?.carried ?? [])];
      expect(entries.map((entry) => entry.subjectToken).sort(), name).toEqual([
        "COMBAT_POTION",
        "HEALTHSTONE",
        "HEALTH_POTION",
      ]);
    }
  });

  it("a missing healer plan never becomes an assignment, and a supplied one is never evaluated", () => {
    for (const { name, document } of shapes) {
      const assignment = report(document).categories.find((section) => section.category === "ASSIGNMENT");
      expect(assignment, name).toBeUndefined();
      if (name !== "plan") expect(document.raidCooldownPlan, name).toBeUndefined();
    }
    expect(byName("plan").raidCooldownPlan?.assignmentEvaluation).toEqual({
      state: "NOT_EVALUATED",
      reason: "NO_PUBLIC_ASSIGNMENT_EVALUATOR",
    });
  });

  it("UNKNOWN and NO_AUTHORITY_AVAILABLE never stand in for each other on the support document", () => {
    const document = byName("support");
    if (
      document.status !== "AUTHORITY_NOT_AVAILABLE" ||
      document.supportObservations?.assessment !== "ASSESSED"
    )
      throw new Error("no assessed support observations");
    for (const decision of document.supportObservations.supportDecisions) {
      expect(decision.authorityStatus).toBe("NO_AUTHORITY_AVAILABLE");
      expect("modelId" in decision).toBe(false);
    }
  });

  it("no score, grade, rank, rating, percentage or accuracy exists in any published document", () => {
    const documents: unknown[] = [...shapes.map((shape) => shape.document), mixedNight, emptyNight];
    for (const document of documents) {
      // `capability.scoresPerformance` is the one exception: the literal `false` that denies scoring.
      for (const key of keysOf(document).filter((key) => key !== "scoresPerformance"))
        expect(key).not.toMatch(/score|grade|rank|rating|percent|accuracy|severity|impact/i);
    }
    for (const { document } of shapes) expect(document.capability.scoresPerformance).toBe(false);
  });

  it("racial abilities never appear in a finding while excluded", () => {
    const RACIALS =
      /^(blood_fury|berserking|fireblood|ancestral_call|arcane_torrent|bag_of_tricks|lights_judgment|arcane_pulse|war_stomp|shadowmeld|rocket_barrage|stoneform|gift_of_the_naaru|will_to_survive|every_man_for_himself|haymaker|azerite_surge|hyper_organic_light_originator)$/;
    for (const { name, document } of shapes) {
      for (const highlight of assessedTldr(document).highlights)
        expect(highlight.subjectToken ?? "", name).not.toMatch(RACIALS);
      for (const section of report(document).categories)
        for (const entry of [...section.prioritized, ...section.informational, ...section.carried])
          expect(entry.subjectToken ?? "", name).not.toMatch(RACIALS);
    }
    for (const night of [mixedNight, emptyNight])
      for (const group of night.recurrence.rejectedPatterns)
        expect(group.key).not.toMatch(/blood_fury|berserking|fireblood|ancestral_call|arcane_torrent/);
  });
});

// ---------------------------------------------------------------------------
// The raid night
// ---------------------------------------------------------------------------

describe("the raid night discloses its coverage like a single fight does", () => {
  it("carries a PARTIAL, never-empty disclosure equal to the domain's own, on both transports", () => {
    for (const [night, aggregate] of [
      [mixedNight, MIXED_AGGREGATE],
      [emptyNight, EMPTY_AGGREGATE],
    ] as const) {
      expect(night.coverageDisclosure).toEqual(discloseRaidNightCoverage(aggregate));
      expect(night.coverageDisclosure?.assessmentScope).toBe("PARTIAL");
      expect(night.coverageDisclosure?.disclosures.length).toBeGreaterThan(0);
      expect(night.coverageDisclosure?.disclosures).toContain("PER_FIGHT_PRESENTATION_NOT_INCLUDED");
    }
    expect([...PUBLIC_RAID_NIGHT_DISCLOSURES]).toEqual([...RAID_NIGHT_DISCLOSURES]);
  });

  it("each code is held exactly when the night's own coverage says so", () => {
    for (const night of [mixedNight, emptyNight]) {
      const held = new Set(night.coverageDisclosure?.disclosures);
      const { coverage } = night;
      expect(held.has("NO_CELL_ANALYZED")).toBe(coverage.cellsAnalyzed === 0);
      expect(held.has("ONLY_OBSERVED_DECISIONS_VERIFIED")).toBe(coverage.cellsAnalyzed > 0);
      expect(held.has("DECISIONS_UNKNOWN")).toBe(coverage.unknownTotal > 0);
      expect(held.has("CASTS_EXCLUDED")).toBe(coverage.excludedCastCountTotal > 0);
      expect(held.has("CELLS_SPEC_NOT_SUPPORTED")).toBe(coverage.cellsSpecNotSupported > 0);
      expect(held.has("CELLS_ANALYSIS_UNAVAILABLE")).toBe(coverage.cellsAnalysisUnavailable > 0);
      expect(held.has("FIGHTS_FAILED")).toBe(coverage.fightsFailed > 0);
      expect(held.has("FIGHTS_MISSING")).toBe(coverage.fightsMissing > 0);
      const preparations = night.cells.flatMap((cell) =>
        cell.kind === "ABSENT" || cell.preparation === undefined ? [] : [cell.preparation],
      );
      expect(held.has("PREPARATION_NOT_ASSESSED")).toBe(
        preparations.some((p) => p.assessment === "NOT_ASSESSED"),
      );
    }
  });

  it("a mixed night states its partial coverage first; a night with no analyzed cell never reads as clean play", () => {
    const mixed = mixedNight.coverageDisclosure?.lines ?? [];
    expect(mixed[0]).toMatch(
      new RegExp(
        `^Partial analysis: ${String(mixedNight.coverage.cellsAnalyzed)} of \\d+ present player-fight cells were analyzed`,
      ),
    );
    expect(mixed).toContain("A cell that was not analyzed is a coverage limit, not a statement about play.");

    expect(emptyNight.status).toBe("NO_ANALYZED_CELLS");
    const empty = emptyNight.coverageDisclosure?.lines ?? [];
    expect(empty[0]).toContain(
      "No gameplay analysis was produced, so nothing is claimed about how anyone played.",
    );
    expect(emptyNight.coverageDisclosure?.disclosures).toEqual(
      expect.arrayContaining(["NO_CELL_ANALYZED", "CELLS_SPEC_NOT_SUPPORTED"]),
    );
    expect(JSON.stringify(emptyNight)).not.toMatch(/clean|perfect|flawless|success|no mistakes/i);
    // Integer facts only: no number in a line that the coverage block does not state.
    for (const line of [...mixed, ...empty]) expect(line).not.toMatch(/%/);
  });
});
