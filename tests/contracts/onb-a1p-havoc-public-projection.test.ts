/**
 * ONB-A1P: the public projection of a Havoc Demon Hunter analysis is TOTAL over its
 * internal vocabulary, applies exactly the two transformations that already existed,
 * leaks nothing internal, is the same analysis the registration produced, and says
 * how little it covered.
 *
 *   MELEE_SWING          -> NON_GCD_ACTION
 *   OUTSIDE_FIRST_SLICE  -> OUTSIDE_SUPPORTED_SLICE
 *
 * THE ONE SCHEMA DECISION: `demonhunter/havoc` joins the `specId` enum, by the additive
 * widening precedent. No outcome, basis, blocker class, exclusion reason, status,
 * capability value or field moved.
 *
 * THE SURFACE IS NARROW, AND THE DOCUMENT MUST NOT READ OTHERWISE. Over the committed
 * first 90 s, 65 of 76 decisions are UNKNOWN. The coverage block and the report's
 * disclosures are what carry that to the reader.
 */

import { describe, expect, it } from "vitest";

import { toPlayerFightCell } from "../../src/aggregation/cell-projection.js";
import {
  PUBLIC_ANALYSIS_SCHEMA_VERSION,
  PUBLIC_COMPARISON_BASES,
  PUBLIC_COMPARISON_OUTCOMES,
  PUBLIC_EXCLUSION_REASONS,
  PUBLIC_SPEC_IDS,
  PublicAnalysisResultSchema,
} from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import { internalAnalyzerForSpec, PRODUCTION_CATALOG } from "../../src/services/analyzer-registry.js";
import talents from "../../src/data/game/demonhunter-havoc-talents.json";
import {
  HAVOC_EXCLUSION_REASONS,
  type HavocDemonHunterAnalysis,
} from "../../src/specs/demonhunter/havoc/observed-analysis.js";
import {
  HAVOC_DEMON_HUNTER_REGISTRATION,
  HAVOC_EXCLUSION_VIEW_PROJECTION,
} from "../../src/specs/demonhunter/havoc/registration.js";
import { HAVOC_DEMON_HUNTER_ANALYZER_ID } from "../../src/specs/demonhunter/havoc/spec.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { countedProductionCatalog } from "../support/catalog.js";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";
import { stateOf } from "../support/corpus/fight.js";
import { committedCorpusFiles, validateEvidenceArchive } from "../support/corpus/loader.js";

const ACTOR = 18;
const SEGMENT = "wcl-b1pm-fight-48-havoc-demon-hunter-18-decisions.seg-0-90";

async function realFight(): Promise<CombatFight> {
  const loaded = await validateEvidenceArchive(committedEvidenceArchiveFiles(), committedCorpusFiles());
  if (!loaded.ok) throw new Error("the evidence archive does not validate");
  const artifact = loaded.archive.artifacts.find((entry) => entry.record.artifactId === SEGMENT);
  if (artifact === undefined) throw new Error("the Havoc segment is not in the archive");
  return stateOf(loaded.archive, artifact).fight;
}

function identityFor(fight: CombatFight, specName = "Havoc"): FightIdentity {
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
    player: { sourceId: ACTOR, name: "Corpusplayer", className: "DemonHunter", specName },
  };
}

async function publicAnalysis(fight: CombatFight) {
  const counted = countedProductionCatalog();
  const deps: AnalysisServiceDeps = {
    env: MCP_TEST_ENV,
    preflight: async () => ({ ok: true, identity: identityFor(fight), rateLimit: undefined }),
    ingest: async () => ({ ok: true, fight, rateLimit: undefined }),
    registry: counted.registry,
  };
  const result = await analyzeFight(
    { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: ACTOR },
    deps,
  );
  if (!result.ok) throw new Error("the service refused the request");
  return { analysis: result.analysis, calls: counted.calls };
}

/** The same fight, with the subject's talent tree replaced by the pinned entries of one hero tree. */
function withHeroTree(fight: CombatFight, simcName: string): CombatFight {
  const tree = talents.heroTrees.find((candidate) => candidate.simcName === simcName);
  if (tree === undefined) throw new Error(`no pinned hero tree ${simcName}`);
  const talentTree = tree.entries.map((entry) => ({
    id: entry.traitEntryId,
    rank: 1,
    nodeId: entry.traitNodeId,
  }));
  return {
    ...fight,
    events: fight.events.map((event): CombatEvent => {
      if (event.kind !== "COMBATANT_INFO" || event.snapshot.actorId !== ACTOR) return event;
      return { ...event, snapshot: { ...event.snapshot, talentTree } };
    }),
  };
}

describe("the schema is analysis/1, widened by exactly one specId", () => {
  it("the version string is unchanged and demonhunter/havoc is appended", () => {
    expect(PUBLIC_ANALYSIS_SCHEMA_VERSION).toBe("warcraft-logs-coach.analysis/1");
    expect(PUBLIC_SPEC_IDS.at(-1)).toBe("demonhunter/havoc");
  });

  it("Havoc introduces no public value of its own: its projection lands entirely inside the existing enum", () => {
    expect(Object.keys(HAVOC_EXCLUSION_VIEW_PROJECTION).sort()).toEqual([...HAVOC_EXCLUSION_REASONS].sort());
    expect(HAVOC_EXCLUSION_VIEW_PROJECTION).toEqual({
      MELEE_SWING: "NON_GCD_ACTION",
      NON_GCD_ACTION: "NON_GCD_ACTION",
      EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
      NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
      OUTSIDE_FIRST_SLICE: "OUTSIDE_SUPPORTED_SLICE",
    });
    for (const target of Object.values(HAVOC_EXCLUSION_VIEW_PROJECTION)) {
      expect(PUBLIC_EXCLUSION_REASONS as readonly string[]).toContain(target);
    }
  });
});

describe("the committed first 90 s projects to a valid document carrying the ONB-A1 outcomes", () => {
  /** Internal payload names and vocabulary; none may reach a public document. */
  const INTERNAL = [
    "OUTSIDE_FIRST_SLICE",
    "MELEE_SWING",
    "rawBlocker",
    "observedActionRejected",
    "positiveUsability",
    "PROVEN_USABLE",
    "NOT_PROVEN",
    "talentsProvenAbsent",
    "reaversGlaiveEvidence",
    "demonsurge_available",
    "felscarred",
    "stoppingPoint",
    "undecidedCandidates",
    "unresolvedAt",
  ];

  it("through the public service: dispatched once, schema valid, the pinned counts, nothing internal", async () => {
    const fight = await realFight();
    const { analysis, calls } = await publicAnalysis(fight);
    expect(analysis.specId).toBe("demonhunter/havoc");
    expect(analysis.analyzerId).toBe(HAVOC_DEMON_HUNTER_ANALYZER_ID);
    expect(analysis.scope).toBe("PLAYER_CONTEXT");
    expect(calls[HAVOC_DEMON_HUNTER_ANALYZER_ID]).toBe(1);

    const projected = projectAnalysisResult(analysis);
    expect(PublicAnalysisResultSchema.safeParse(projected).success).toBe(true);
    if (projected.status !== "ANALYZED") throw new Error(projected.status);
    expect(projected.specialization).toEqual({ specId: "demonhunter/havoc", gameplaySupported: true });
    expect(projected.capability).toMatchObject({
      scoresPerformance: false,
      matchMeaning: "AUTHORITY_COMPATIBLE_ONLY",
      unknownIsFirstClass: true,
      partialCoverageIsExpected: true,
    });
    expect(projected.authority.authorityId).toBe("SIMC_APL_DEMONHUNTER_HAVOC");
    expect(projected.coverage).toMatchObject({ eligibleDecisions: 76, match: 7, rejected: 4, unknown: 65 });
    expect(projected.coverage.exclusions).toEqual([
      { key: "NON_GCD_ACTION", count: 115 },
      { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 121 },
      { key: "OUTSIDE_SUPPORTED_SLICE", count: 16 },
    ]);

    const rejected = projected.decisions.filter((decision) => decision.outcome === "REJECTED");
    expect(rejected.map((decision) => [decision.locator.reportTimeMs, decision.observedToken])).toEqual([
      [7473830, "annihilation"],
      [7491427, "annihilation"],
      [7513346, "chaos_strike"],
      [7525056, "felblade"],
    ]);
    for (const decision of rejected) expect(decision.authorityToken).toBe("reavers_glaive");

    for (const decision of projected.decisions) {
      expect(PUBLIC_COMPARISON_OUTCOMES as readonly string[]).toContain(decision.outcome);
      expect(PUBLIC_COMPARISON_BASES as readonly string[]).toContain(decision.basis);
      expect(["throw_glaive", "the_hunt"]).not.toContain(decision.observedToken);
      if (decision.outcome === "UNKNOWN") expect(decision.authorityToken).toBeNull();
    }
    const json = JSON.stringify(projected);
    for (const name of INTERNAL) expect(json, name).not.toContain(name);
  });

  it("the document is the registration's analysis, decision for decision", async () => {
    const fight = await realFight();
    const { analysis: service } = await publicAnalysis(fight);
    const direct = HAVOC_DEMON_HUNTER_REGISTRATION.analyze({
      state: createCombatState(fight),
      actorId: ACTOR,
      specId: "demonhunter/havoc",
      targetActorId: null,
    }) as HavocDemonHunterAnalysis;
    if (direct.status !== "ANALYZED") throw new Error(direct.status);
    const projected = projectAnalysisResult(service);
    if (projected.status !== "ANALYZED") throw new Error(projected.status);
    expect(projected.decisions).toHaveLength(direct.comparisons.length);
    for (const [index, comparison] of direct.comparisons.entries()) {
      const decision = projected.decisions[index];
      expect(decision?.outcome).toBe(comparison.outcome);
      expect(decision?.authorityToken).toBe(comparison.authorityToken);
      expect(decision?.observedToken).toBe(comparison.decision.observedToken);
    }
    expect(internalAnalyzerForSpec("demonhunter/havoc", PRODUCTION_CATALOG)?.analyzerId).toBe(
      HAVOC_DEMON_HUNTER_ANALYZER_ID,
    );
  });

  it("a low-coverage analysis does not present itself as a complete assessment", async () => {
    const { analysis } = await publicAnalysis(await realFight());
    const projected = projectAnalysisResult(analysis);
    if (projected.status !== "ANALYZED") throw new Error(projected.status);
    if (projected.tldr?.assessment !== "ASSESSED") throw new Error("no TLDR");
    expect(projected.tldr.disclosures).toEqual(
      expect.arrayContaining(["ONLY_OBSERVED_DECISIONS_VERIFIED", "DECISIONS_UNKNOWN", "CASTS_EXCLUDED"]),
    );
    if (projected.report?.assessment !== "ASSESSED") throw new Error("no report");
    expect(projected.report.assessmentScope).toBe("PARTIAL");
    // A REJECTED is a disagreement with the list, and its actionability is not claimed.
    expect(projected.tldr.disclosures).toContain("DIVERGENCE_ACTIONABILITY_UNPROVEN");
    expect(projected.report.coverage.disclosures).toEqual(
      expect.arrayContaining(["ONLY_OBSERVED_DECISIONS_VERIFIED", "DECISIONS_UNKNOWN", "CASTS_EXCLUDED"]),
    );
  });

  it("the raid-night cell reconciles and names the slice boundary publicly", async () => {
    const fight = await realFight();
    const { analysis } = await publicAnalysis(fight);
    const projection = toPlayerFightCell({
      analysis,
      normalizationRevision: fight.provenance.normalizationRevision,
    });
    if (!projection.ok || projection.cell.kind !== "ANALYZED") throw new Error("cell");
    expect(projection.cell.counts).toMatchObject({
      eligibleDecisions: 76,
      match: 7,
      rejected: 4,
      unknown: 65,
    });
    const patterns = projection.cell.recurrence.exclusionPatterns.map((row) => row.key);
    expect(patterns.some((key) => key.includes("OUTSIDE_SUPPORTED_SLICE"))).toBe(true);
    expect(patterns.some((key) => key.includes("OUTSIDE_FIRST_SLICE"))).toBe(false);
  });

  it("consumable status is reported whatever the gameplay surface", async () => {
    const projected = projectAnalysisResult((await publicAnalysis(await realFight())).analysis);
    expect(projected.preparation).toBeDefined();
  });
});

describe("the refusal documents are public and carry no decisions", () => {
  it("a Fel-Scarred build is AUTHORITY_NOT_AVAILABLE on the public path, never a smaller ANALYZED document", async () => {
    const { analysis, calls } = await publicAnalysis(withHeroTree(await realFight(), "felscarred"));
    expect(calls[HAVOC_DEMON_HUNTER_ANALYZER_ID]).toBe(1);
    const projected = projectAnalysisResult(analysis);
    expect(PublicAnalysisResultSchema.safeParse(projected).success).toBe(true);
    expect(projected.status).toBe("AUTHORITY_NOT_AVAILABLE");
    if (projected.status === "ANALYZED") return;
    expect(projected.detail).toContain("no decision was judged");
    expect(Object.keys(projected)).not.toContain("decisions");
    expect(Object.keys(projected)).not.toContain("coverage");
    // Preparation runs in parallel with the evaluator: refusing the gameplay does not refuse it.
    expect(projected.preparation).toBeDefined();
  });

  it("the swapped tree is the only difference: the Aldrachi Reaver entries still analyze the same fight", async () => {
    const { analysis } = await publicAnalysis(withHeroTree(await realFight(), "aldrachi_reaver"));
    expect(projectAnalysisResult(analysis).status).toBe("ANALYZED");
  });
});
