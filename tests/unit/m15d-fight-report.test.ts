import { beforeAll, describe, expect, it } from "vitest";

import type { ConsumableStatusReport } from "../../src/analysis/preparation/consumable-status.js";
import type { ComparisonFightInput } from "../../src/comparison-facts/fight-facts.js";
import { PublicAnalysisResultSchema } from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import type { EvidenceLocator } from "../../src/engine/evidence/locator.js";
import type {
  ObservedDecisionRecord,
  ObservedDecisionView,
} from "../../src/findings/observed-decision-view.js";
import { DEFAULT_AGGREGATION_CONFIG } from "../../src/reporting/aggregation-config.js";
import {
  buildFightReport,
  DEFAULT_REPORT_CONFIG,
  renderReportMarkdown,
  reportFindings,
  type FightReport,
  type ReportBody,
} from "../../src/reporting/fight-report.js";
import type { ReportableFinding } from "../../src/reporting/finding-record.js";
import { buildFightTldr, type TldrContext, type TldrInput } from "../../src/reporting/tldr.js";
import { analyzeFight } from "../../src/services/analysis-service.js";
import type { FightAnalysis } from "../../src/services/result.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { subjectInput } from "../support/m11/g2-four-fights.js";

/**
 * M15-D: the fight report, every restated finding grouped by decision
 * category with its evidence and actionability, the suppressions with their
 * reasons and a coverage section, as structure and as markdown. Synthetic
 * views and records for every rule, and the committed M11-G2 subject fight
 * (the real Blood analysis) through the application service. No Warcraft
 * Logs request is made.
 */

const loc = (index: number): EvidenceLocator => ({
  streamId: "s",
  pageOrdinal: 0,
  indexInPage: index,
  ingestionOrdinal: index,
  rawType: "cast",
  reportTimeMs: 1000 + index,
});

function decision(position: number, fields: Partial<ObservedDecisionRecord> = {}): ObservedDecisionRecord {
  return {
    locator: loc(position),
    position,
    fightTimeMs: position * 1000,
    targetActorId: 2,
    observedAbilityGameId: 100,
    observedToken: "heart_strike",
    outcome: "REJECTED",
    basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
    authorityCoverage: "EXACT_ENTRY",
    authorityToken: "marrowrend",
    selectionPrecision: "EXACT_ENTRY",
    decisiveBlocker: null,
    usabilityProvenance: "OBSERVED_EXECUTION",
    ...fields,
  };
}

const match = (position: number, fields: Partial<ObservedDecisionRecord> = {}) =>
  decision(position, { outcome: "MATCH", basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN", ...fields });
const unknown = (position: number, observedToken = "marrowrend") =>
  decision(position, {
    outcome: "UNKNOWN",
    basis: "AUTHORITY_SELECTION_UNRESOLVED",
    decisiveBlocker: "OBSERVED_STATE_MISSING",
    observedToken,
  });

/** A view whose coverage is counted from its own decisions, as a registration builds it. */
function viewOf(decisions: ObservedDecisionRecord[], excludedCastCount = 0): ObservedDecisionView {
  const count = (outcome: string) => decisions.filter((entry) => entry.outcome === outcome).length;
  return {
    decisions,
    exclusions: [],
    coverage: {
      eligibleDecisions: decisions.length,
      match: count("MATCH"),
      rejected: count("REJECTED"),
      unknown: count("UNKNOWN"),
      resolvedComparisons: count("MATCH") + count("REJECTED"),
      exactEntryMatches: 0,
      tokenConvergedMatches: 0,
      selectionPrecision: [],
      unknownBases: [],
      unknownBlockerClasses: [],
      exclusions: [],
      excludedCastCount,
    },
  };
}

const UNKNOWN_POTION = {
  state: "UNKNOWN",
  reasons: [{ code: "CAST_COVERAGE", gate: "INSUFFICIENT_COVERAGE" }],
  observedAtLeast: 1,
  uses: [],
} as unknown as ConsumableStatusReport["statuses"]["COMBAT_POTION"];

function consumables(
  combatPotion: ConsumableStatusReport["statuses"]["COMBAT_POTION"] = UNKNOWN_POTION,
): ConsumableStatusReport {
  return {
    revision: "preparation-consumable-status/1",
    category: "PREPARATION",
    authority: "WCL_OBSERVED_FACT",
    identityData: null,
    actorId: 5,
    statuses: {
      HEALTH_POTION: { state: "OBSERVED", count: 0, uses: [] },
      HEALTHSTONE: { state: "OBSERVED", count: 1, uses: [{ evidence: loc(90) }] },
      COMBAT_POTION: combatPotion,
    },
  } as unknown as ConsumableStatusReport;
}

const NOT_RETRIEVED = { assessment: "NOT_ASSESSED", reason: "COMPARISON_EVIDENCE_NOT_RETRIEVED" } as const;

function analyzed(view: ObservedDecisionView, fields: Partial<TldrInput> = {}): TldrInput {
  return {
    gameplay: { status: "ANALYZED", specId: "deathknight/blood", authorityId: "BLOOD_APL", view },
    preparation: { state: "ASSESSED", report: consumables() },
    diagnosis: NOT_RETRIEVED,
    ...fields,
  };
}

type Assessed = Extract<FightReport, { assessment: "ASSESSED" }>;
function assessed(report: FightReport | undefined): Assessed {
  if (report?.assessment !== "ASSESSED") throw new Error(JSON.stringify(report));
  return report;
}

const bodyOf = (report: Assessed): ReportBody => ({
  coverage: report.coverage,
  categories: report.categories,
  suppressions: report.suppressions,
});

const entriesOf = (report: Assessed) =>
  report.categories.flatMap((section) => [
    ...section.prioritized,
    ...section.informational,
    ...section.carried,
  ]);

/** Correctness, blame and score vocabulary the report never uses. */
const BANNED_PROSE =
  /\b(correct|incorrect|mistake|optimal|ideal|best|score|grade|should|failed|failure|wrong|perfect|recommend\w*|coaching|severity)\b/i;
/** The one sanctioned use of "clean play" is its denial. */
const proseOf = (markdown: string) => markdown.replaceAll("this is not evidence of clean play", "");

const MIXED = viewOf(
  [
    decision(1),
    decision(2),
    decision(3),
    decision(4, { observedToken: "death_strike" }),
    match(5, { observedToken: "blood_boil" }),
    unknown(6),
    unknown(7),
    unknown(8),
    unknown(9, "soul_reaper"),
  ],
  4,
);

describe("coverage comes first, on every status", () => {
  const cases: [string, TldrInput][] = [
    ["divergences", analyzed(MIXED)],
    ["no divergence", analyzed(viewOf([match(1), unknown(2)]))],
    ["nothing resolved", analyzed(viewOf([unknown(1)]))],
    ["no decisions", analyzed(viewOf([]))],
    [
      "spec not supported",
      {
        gameplay: { status: "SPEC_NOT_SUPPORTED" },
        preparation: { state: "ASSESSED", report: consumables() },
        diagnosis: null,
      },
    ],
    [
      "nothing retrieved",
      {
        gameplay: { status: "AUTHORITY_NOT_AVAILABLE" },
        preparation: { state: "NOT_ASSESSED", reason: "RETRIEVAL_FAILED" },
        diagnosis: null,
      },
    ],
  ];

  it.each(cases)("%s: PARTIAL, disclosures, and the coverage section before any finding", (_label, input) => {
    const report = assessed(buildFightReport(input));
    expect(report.assessmentScope).toBe("PARTIAL");
    expect(report.coverage.disclosures.length).toBeGreaterThan(0);
    expect(report.magnitude).toBe("NOT_USED");
    expect(report.findingEffect).toEqual({ confidence: "NONE", suppression: "NONE" });
    const { markdown } = report;
    expect(markdown.startsWith("# Fight report\n\n**Partial analysis.**")).toBe(true);
    expect(markdown).toContain("It is not a complete assessment.");
    expect(markdown.indexOf("## Coverage")).toBeLessThan(
      markdown.indexOf("## Findings by decision category"),
    );
    expect(markdown.indexOf("## Findings by decision category")).toBeLessThan(
      markdown.indexOf("## Suppressions"),
    );
    expect(proseOf(markdown)).not.toMatch(BANNED_PROSE);
  });

  it("an unsupported specialization reports only its facts and says it is not clean play", () => {
    const report = assessed(
      buildFightReport({
        gameplay: { status: "SPEC_NOT_SUPPORTED" },
        preparation: { state: "ASSESSED", report: consumables() },
        diagnosis: null,
      }),
    );
    expect(report.coverage.gameplay).toEqual({ status: "SPEC_NOT_SUPPORTED" });
    expect(report.coverage.disclosures).toContain("GAMEPLAY_NOT_ANALYZED");
    expect(report.categories.map((section) => section.category)).toEqual(["PREPARATION"]);
    expect(report.markdown).toContain(
      "- Gameplay: not analyzed (`SPEC_NOT_SUPPORTED`). Only specialization-independent facts are reported; this is not evidence of clean play.",
    );
    expect(report.markdown).toContain(
      "- Damage diagnosis: not run, because gameplay was not analyzed; nothing is claimed about damage.",
    );
  });

  it("nothing retrieved: no category, and the report says nothing is claimed", () => {
    const report = assessed(
      buildFightReport({
        gameplay: { status: "AUTHORITY_NOT_AVAILABLE" },
        preparation: { state: "NOT_ASSESSED", reason: "RETRIEVAL_FAILED" },
        diagnosis: null,
      }),
    );
    expect(report.categories).toEqual([]);
    expect(report.coverage.disclosures).toEqual(["GAMEPLAY_NOT_ANALYZED", "PREPARATION_NOT_ASSESSED"]);
    expect(report.markdown).toContain("No finding was restated.");
    expect(report.markdown).toContain(
      "- Preparation: not assessed (`RETRIEVAL_FAILED`); nothing is claimed about consumables.",
    );
  });

  it("states the view's coverage and every disposition's count, zero included", () => {
    const report = assessed(buildFightReport(analyzed(MIXED)));
    expect(report.coverage.gameplay).toEqual({
      status: "ANALYZED",
      eligibleDecisions: 9,
      resolvedDecisions: 5,
      unknownDecisions: 4,
      excludedCasts: 4,
    });
    expect(report.coverage.recordsByDisposition).toEqual([
      { disposition: "AUTHORITY_DIVERGENCE", records: 4 },
      { disposition: "AUTHORITY_CONSISTENT", records: 1 },
      { disposition: "OBSERVED_FACT", records: 2 },
      { disposition: "SUPPRESSED", records: 0 },
      { disposition: "UNKNOWN", records: 5 },
      { disposition: "NO_AUTHORITY_AVAILABLE", records: 0 },
      { disposition: "UNSUPPORTED", records: 0 },
    ]);
    expect(report.coverage.disclosures).toEqual([
      "ONLY_OBSERVED_DECISIONS_VERIFIED",
      "DECISIONS_UNKNOWN",
      "CASTS_EXCLUDED",
      "DIVERGENCE_ACTIONABILITY_UNPROVEN",
      "CONSUMABLE_COUNT_UNKNOWN",
      "DAMAGE_DIAGNOSIS_NOT_ASSESSED",
    ]);
    expect(report.markdown).toContain(
      "- Gameplay: 5 of 9 eligible observed decisions resolved against the authority; 4 UNKNOWN; 4 casts excluded.",
    );
    expect(report.markdown).toContain(
      "- Preparation: health potion 0, healthstone 1, combat potion UNKNOWN (not zero). Observed facts, not a judgment.",
    );
  });
});

describe("findings are grouped by decision category, in the three sections, never mixed", () => {
  const report = assessed(buildFightReport(analyzed(MIXED)));

  it("one section per category with a finding, in category order", () => {
    expect(report.categories.map((section) => section.category)).toEqual(["ROTATION", "PREPARATION"]);
  });

  it("divergences are prioritized in order; UNKNOWN is carried with its reason, never a divergence", () => {
    const rotation = report.categories[0];
    if (rotation === undefined) throw new Error("no rotation");
    expect(
      rotation.prioritized.map((entry) => [
        entry.position,
        entry.itemKind,
        entry.subjectToken,
        entry.occurrences,
      ]),
    ).toEqual([
      [1, "PATTERN", "heart_strike", 3],
      [2, "SINGLE", "death_strike", 1],
    ]);
    expect(rotation.prioritized[0]).toMatchObject({
      section: "PRIORITIZED",
      disposition: "AUTHORITY_DIVERGENCE",
      standing: "DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN",
      actionability: "OBSERVED_EXECUTION_ONLY",
      stateEvidence: "PROVEN",
      producer: "OBSERVED_DECISION_VIEW",
      authority: "BLOOD_APL",
      firstFightTimeMs: 1000,
      lastFightTimeMs: 3000,
      evidence: [loc(1), loc(2), loc(3)],
    });
    expect(
      rotation.informational.map((entry) => [entry.disposition, entry.subjectToken, entry.position]),
    ).toEqual([["AUTHORITY_CONSISTENT", "blood_boil", null]]);
    expect(
      rotation.carried.map((entry) => [
        entry.disposition,
        entry.itemKind,
        entry.subjectToken,
        entry.reasonCode,
        entry.occurrences,
      ]),
    ).toEqual([
      ["UNKNOWN", "PATTERN", "marrowrend", "OBSERVED_STATE_MISSING", 3],
      ["UNKNOWN", "SINGLE", "soul_reaper", "OBSERVED_STATE_MISSING", 1],
    ]);
    for (const entry of rotation.carried) expect(entry.position).toBeNull();
  });

  it("preparation facts are informational; an UNKNOWN count is carried, never a zero", () => {
    const preparation = report.categories[1];
    if (preparation === undefined) throw new Error("no preparation");
    expect(preparation.prioritized).toEqual([]);
    expect(
      preparation.informational.map((entry) => [entry.subjectToken, entry.disposition, entry.authority]),
    ).toEqual([
      ["HEALTHSTONE", "OBSERVED_FACT", "WCL_OBSERVED_FACT"],
      ["HEALTH_POTION", "OBSERVED_FACT", "WCL_OBSERVED_FACT"],
    ]);
    expect(preparation.informational[0]?.evidence).toEqual([loc(90)]);
    expect(
      preparation.carried.map((entry) => [entry.subjectToken, entry.disposition, entry.reasonCode]),
    ).toEqual([["COMBAT_POTION", "UNKNOWN", "CAST_COVERAGE"]]);
  });

  it("lists every restated record exactly once, and its prioritized head is the TLDR's highlights", () => {
    const total = entriesOf(report).reduce((sum, entry) => sum + entry.occurrences, 0);
    expect(total).toBe(MIXED.decisions.length + 3);
    expect(total).toBe(report.coverage.recordsByDisposition.reduce((sum, row) => sum + row.records, 0));
    const tldr = buildFightTldr(analyzed(MIXED));
    if (tldr.assessment !== "ASSESSED") throw new Error("tldr");
    const prioritized = report.categories.flatMap((section) => section.prioritized);
    expect(
      prioritized
        .slice(0, tldr.highlights.length)
        .map((entry) => [entry.position, entry.subjectToken, entry.evidence]),
    ).toEqual(
      tldr.highlights.map((highlight) => [highlight.position, highlight.subjectToken, highlight.evidence]),
    );
  });

  it("each markdown entry says why, its actionability and its evidence", () => {
    expect(report.markdown).toContain(
      "1. **`heart_strike`**: 3 occurrences (pattern), from 0:01 to 0:03; `AUTHORITY_DIVERGENCE`, the authority rejected the observed action in the proven state.\n" +
        "   - Why: producer `OBSERVED_DECISION_VIEW`, authority `BLOOD_APL`, state evidence `PROVEN`.\n" +
        "   - Actionability: `OBSERVED_EXECUTION_ONLY`, standing `DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN`. Whether the authority's alternative was possible is not proven.\n" +
        "   - Evidence: 3 events; first at report time 1001 ms (`cast` in stream `s`, page 0, index 1).",
    );
    expect(report.markdown).toContain(
      "- **`marrowrend`**: 3 occurrences (pattern), from 0:06 to 0:08; `UNKNOWN`, UNKNOWN: an authority exists but the evidence could not establish the result; not a fault.\n" +
        "   - Why: producer `OBSERVED_DECISION_VIEW`, authority `BLOOD_APL`, state evidence `INCOMPLETE`, reason `OBSERVED_STATE_MISSING`.",
    );
    expect(report.markdown).toContain(
      "- **`blood_boil`**: 1 occurrence, at 0:05; `AUTHORITY_CONSISTENT`, consistent with the authority; compatible only, not an endorsement.",
    );
    expect(report.markdown).toContain(
      "- **`HEALTH_POTION`**: 1 occurrence, whole fight; `OBSERVED_FACT`, an observed fact with no verdict.",
    );
    expect(report.markdown).toContain("   - Evidence: none located.");
    expect(report.markdown).toContain("## Suppressions\n\nNone.");
  });

  it("is independent of input order", () => {
    const reversed = viewOf([...MIXED.decisions].reverse(), 4);
    expect(buildFightReport(analyzed(reversed))).toEqual(report);
  });

  it("the markdown is a pure function of the structure beside it", () => {
    expect(renderReportMarkdown(bodyOf(report))).toBe(report.markdown);
  });
});

describe("SUPPRESSED is kept with its machine-readable reason, never a failure", () => {
  const context: TldrContext = {
    gameplay: {
      status: "ANALYZED",
      eligibleDecisions: 3,
      resolvedDecisions: 2,
      unknownDecisions: 0,
      excludedCasts: 0,
    },
    preparation: { assessment: "NOT_ASSESSED", reason: "NO_FIGHT_RETRIEVED" },
    diagnosis: null,
  };
  const record = (fields: Partial<ReportableFinding>): ReportableFinding => ({
    findingId: "f1",
    producer: "TEST",
    category: "COOLDOWN",
    specId: "test/spec",
    disposition: "SUPPRESSED",
    authority: "TEST_APL",
    producerStatus: "REJECTED",
    reasonCode: "TARGET_GONE",
    suppressionReason: "INTERMISSION",
    stateEvidence: "PROVEN",
    actionability: "NOT_EVALUATED",
    fightTimeMs: 61_000,
    evidence: [loc(1)],
    aggregationKey: null,
    subjectToken: "deathmark",
    ...fields,
  });
  const records = [
    record({}),
    record({
      findingId: "f2",
      category: "ROTATION",
      disposition: "AUTHORITY_DIVERGENCE",
      reasonCode: null,
      suppressionReason: null,
      actionability: "DECISION_PROVEN_ACTIONABLE",
      subjectToken: "mutilate",
    }),
    record({
      findingId: "f3",
      category: "ASSIGNMENT",
      disposition: "NO_AUTHORITY_AVAILABLE",
      authority: "NO_AUTHORITY_AVAILABLE",
      reasonCode: "NO_RAID_PLAN",
      suppressionReason: null,
      stateEvidence: "INCOMPLETE",
      fightTimeMs: null,
      evidence: [],
      subjectToken: null,
    }),
  ];

  it("a suppressed record is carried and listed under suppressions, never prioritized", () => {
    const report = assessed(reportFindings(records, context));
    expect(report.categories.map((section) => section.category)).toEqual([
      "ROTATION",
      "COOLDOWN",
      "ASSIGNMENT",
    ]);
    const cooldown = report.categories[1];
    expect(cooldown?.prioritized).toEqual([]);
    expect(cooldown?.carried).toMatchObject([
      {
        disposition: "SUPPRESSED",
        suppressionReason: "INTERMISSION",
        reasonCode: "TARGET_GONE",
        position: null,
      },
    ]);
    expect(report.suppressions).toEqual([
      {
        category: "COOLDOWN",
        suppressionReason: "INTERMISSION",
        reasonCode: "TARGET_GONE",
        subjectToken: "deathmark",
        records: 1,
      },
    ]);
    expect(report.markdown).toContain(
      "- `deathmark` in COOLDOWN: 1 record, `INTERMISSION` (reason `TARGET_GONE`). Kept, not counted against the player.",
    );
    expect(report.markdown).toContain("suppression reason `INTERMISSION`");
    expect(proseOf(report.markdown)).not.toMatch(BANNED_PROSE);
  });

  it("an actionable divergence says so; NO_AUTHORITY_AVAILABLE is carried, distinct from UNKNOWN", () => {
    const report = assessed(reportFindings(records, context));
    expect(report.categories[0]?.prioritized[0]).toMatchObject({
      position: 1,
      standing: "ACTIONABLE_AUTHORITY_DIVERGENCE",
      actionability: "DECISION_PROVEN_ACTIONABLE",
    });
    expect(report.coverage.disclosures).not.toContain("DIVERGENCE_ACTIONABILITY_UNPROVEN");
    expect(report.markdown).toContain("The authority's alternative was proven possible.");
    expect(report.categories[2]?.carried).toMatchObject([
      { disposition: "NO_AUTHORITY_AVAILABLE", reasonCode: "NO_RAID_PLAN", subjectToken: null },
    ]);
    expect(report.markdown).toContain(
      "- **(no subject)**: 1 occurrence, whole fight; `NO_AUTHORITY_AVAILABLE`, no trustworthy authority exists for this question; nothing is claimed.",
    );
  });

  it("a producer string cannot break out of its code span", () => {
    const report = assessed(reportFindings([record({ subjectToken: "a`b", reasonCode: "x`y" })], context));
    expect(report.markdown).toContain("`a'b`");
    expect(report.markdown).toContain("`x'y`");
    expect(report.suppressions[0]?.subjectToken).toBe("a`b");
  });
});

describe("fail closed: never part of a report", () => {
  const context: TldrContext = {
    gameplay: { status: "SPEC_NOT_SUPPORTED" },
    preparation: { assessment: "NOT_ASSESSED", reason: "NO_FIGHT_RETRIEVED" },
    diagnosis: null,
  };

  it("an invalid config reports nothing", () => {
    expect(
      buildFightReport(analyzed(MIXED), {
        ...DEFAULT_REPORT_CONFIG,
        revision: "fight-report-config/0" as never,
      }),
    ).toEqual({
      assessment: "NOT_ASSESSED",
      revision: "fight-report/1",
      reason: "INVALID_REPORT_CONFIG",
    });
    expect(
      buildFightReport(analyzed(MIXED), {
        ...DEFAULT_REPORT_CONFIG,
        aggregation: { ...DEFAULT_AGGREGATION_CONFIG, defaultMinOccurrencesForPattern: 1 },
      }),
    ).toMatchObject({ assessment: "NOT_ASSESSED", reason: "INVALID_REPORT_CONFIG" });
  });

  it("an outcome word the adapter was not reviewed for reports nothing", () => {
    expect(buildFightReport(analyzed(viewOf([decision(1, { outcome: "CORRECT" })])))).toMatchObject({
      assessment: "NOT_ASSESSED",
      reason: "FINDINGS_NOT_RESTATABLE",
    });
  });

  it("coverage counts that disagree with the decisions are never reported", () => {
    const view = viewOf([decision(1), unknown(2)]);
    expect(buildFightReport(analyzed({ ...view, coverage: { ...view.coverage, unknown: 0 } }))).toMatchObject(
      {
        assessment: "NOT_ASSESSED",
        reason: "COVERAGE_INCONSISTENT",
      },
    );
  });

  it("a refused record, or a divergence with no analyzed gameplay, reports nothing", () => {
    const divergence: ReportableFinding = {
      findingId: "d",
      producer: "TEST",
      category: "ROTATION",
      specId: "test/spec",
      disposition: "AUTHORITY_DIVERGENCE",
      authority: "TEST_APL",
      producerStatus: "REJECTED",
      reasonCode: null,
      suppressionReason: null,
      stateEvidence: "PROVEN",
      actionability: "OBSERVED_EXECUTION_ONLY",
      fightTimeMs: 1,
      evidence: [loc(1)],
      aggregationKey: null,
      subjectToken: "x",
    };
    expect(reportFindings([{ ...divergence, evidence: [] }], context)).toMatchObject({
      assessment: "NOT_ASSESSED",
      reason: "FINDINGS_REFUSED",
    });
    expect(reportFindings([divergence], context)).toMatchObject({
      assessment: "NOT_ASSESSED",
      reason: "COVERAGE_INCONSISTENT",
    });
  });
});

// ---------------------------------------------------------------------------
// The committed subject fight (real Blood analysis), through the service
// ---------------------------------------------------------------------------

function identityOf(fight: CombatFight, sourceId: number, specName: string): FightIdentity {
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
      sourceId,
      name: "Subject",
      className: specName === "Blood" ? "DeathKnight" : "Warrior",
      specName,
    },
  };
}

async function viaService(subject: ComparisonFightInput, specName: string): Promise<FightAnalysis> {
  const result = await analyzeFight(
    {
      reportCode: subject.fight.report.code,
      fightId: subject.fight.fight.id,
      sourceId: subject.focusActorId,
    },
    {
      env: MCP_TEST_ENV,
      preflight: async () => ({
        ok: true,
        identity: identityOf(subject.fight, subject.focusActorId, specName),
        rateLimit: undefined,
      }),
      ingest: async () => ({ ok: true, fight: subject.fight, rateLimit: undefined }),
    },
  );
  if (!result.ok) throw new Error(result.error.code);
  return result.analysis;
}

let blood: FightAnalysis;
let unsupported: FightAnalysis;

beforeAll(async () => {
  const subject = await subjectInput();
  blood = await viaService(subject, "Blood");
  unsupported = await viaService(subject, "Fire");
}, 180_000);

describe("the committed Blood fight, through the service", () => {
  it("reports the real analysis: every decision once, in its category, with the view's counts", () => {
    const view = blood.observedDecisions;
    if (view === null) throw new Error("no view");
    const report = assessed(blood.report);
    const rotation = report.categories.find((section) => section.category === "ROTATION");
    if (rotation === undefined) throw new Error("no rotation");
    const records = (entries: readonly { occurrences: number }[]) =>
      entries.reduce((sum, entry) => sum + entry.occurrences, 0);
    expect(records(rotation.prioritized)).toBe(view.coverage.rejected);
    expect(records(rotation.informational)).toBe(view.coverage.match);
    expect(records(rotation.carried)).toBe(view.coverage.unknown);
    expect(rotation.carried.every((entry) => entry.disposition === "UNKNOWN")).toBe(true);
    // Pinned real shape (M15-A/B): 224 UNKNOWN, the 45 Heart Strike rejections lead, none actionable.
    expect(view.coverage.unknown).toBe(224);
    expect(rotation.prioritized[0]).toMatchObject({
      position: 1,
      itemKind: "PATTERN",
      subjectToken: "heart_strike",
      occurrences: 45,
      standing: "DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN",
    });
    expect(rotation.prioritized.some((entry) => entry.standing === "ACTIONABLE_AUTHORITY_DIVERGENCE")).toBe(
      false,
    );
    expect(report.suppressions).toEqual([]);
    expect(report.coverage.disclosures).toContain("DECISIONS_UNKNOWN");
    expect(report.coverage.disclosures).toContain("DAMAGE_DIAGNOSIS_NOT_ASSESSED");
    expect(proseOf(report.markdown)).not.toMatch(BANNED_PROSE);
  });

  it("projects to a schema-valid document whose markdown is rendered from the published fields, every entry locating a published decision", () => {
    const document = projectAnalysisResult(blood);
    expect(PublicAnalysisResultSchema.safeParse(document).success).toBe(true);
    expect(document.report).toEqual(JSON.parse(JSON.stringify(blood.report)));
    if (document.status !== "ANALYZED" || document.report?.assessment !== "ASSESSED")
      throw new Error("shape");
    const published = document.report;
    expect(renderReportMarkdown(published as unknown as ReportBody)).toBe(published.markdown);
    const decisions = new Set(document.decisions.map((entry) => JSON.stringify(entry.locator)));
    for (const entry of published.categories.find((section) => section.category === "ROTATION")
      ?.prioritized ?? [])
      for (const locator of entry.evidence) expect(decisions.has(JSON.stringify(locator))).toBe(true);
  });

  it("changes nothing it reports", () => {
    const document = projectAnalysisResult(blood);
    const { report: _report, ...untouched } = blood;
    const withoutReport = projectAnalysisResult(untouched);
    if (document.status !== "ANALYZED" || withoutReport.status !== "ANALYZED")
      throw new Error("not analyzed");
    const { report: _published, ...rest } = document;
    expect(rest).toEqual(withoutReport);
    expect("report" in withoutReport).toBe(false);
  });

  it("an unsupported specialization's document carries a report of its facts only", () => {
    const report = assessed(unsupported.report);
    expect(unsupported.analysis.status).toBe("SPEC_NOT_SUPPORTED");
    expect(report.coverage.gameplay).toEqual({ status: "SPEC_NOT_SUPPORTED" });
    expect(report.coverage.damageDiagnosis).toBeNull();
    expect(report.categories.map((section) => section.category)).toEqual(["PREPARATION"]);
    expect(report.markdown).toContain("this is not evidence of clean play");
    const document = projectAnalysisResult(unsupported);
    expect(PublicAnalysisResultSchema.safeParse(document).success).toBe(true);
    expect(document.report).toEqual(JSON.parse(JSON.stringify(unsupported.report)));
  });
});
