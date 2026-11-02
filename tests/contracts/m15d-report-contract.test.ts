import { describe, expect, it } from "vitest";

import {
  AnalyzedResultSchema,
  PUBLIC_ANALYSIS_SCHEMA_VERSION,
  PUBLIC_REPORT_ACTIONABILITY,
  PUBLIC_REPORT_DISPOSITIONS,
  PUBLIC_REPORT_NOT_ASSESSED_REASONS,
  PUBLIC_REPORT_STATE_EVIDENCE,
  PUBLIC_REPORT_SUPPRESSION_REASONS,
  ReportEntrySchema,
  ReportSchema,
  SpecNotSupportedResultSchema,
} from "../../src/contracts/analysis-contract.js";
import { analyzeToolDescription } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { REPORT_NOT_ASSESSED_REASONS, REPORT_REVISION } from "../../src/reporting/fight-report.js";
import {
  ACTIONABILITY_LEVELS,
  FINDING_DISPOSITIONS,
  STATE_EVIDENCE_STATES,
  SUPPRESSION_REASONS,
} from "../../src/reporting/finding-record.js";
import { PUBLIC_SPECIALIZATION_DESCRIPTIONS } from "../../src/services/analyzer-registry.js";

/**
 * M15-D public contract: the report is an additive, optional field on every
 * status under `analysis/1`; its vocabularies are declared independently and
 * pinned equal to the reporting module's; and its shape cannot carry a
 * complete-assessment claim, a magnitude, a confidence, an UNKNOWN or
 * SUPPRESSED divergence, or an entry without its section's evidence.
 */

describe("the report vocabularies are declared independently and pinned to the reporting module's", () => {
  it.each([
    ["not-assessed reasons", PUBLIC_REPORT_NOT_ASSESSED_REASONS, REPORT_NOT_ASSESSED_REASONS],
    ["dispositions", PUBLIC_REPORT_DISPOSITIONS, FINDING_DISPOSITIONS],
    ["state evidence", PUBLIC_REPORT_STATE_EVIDENCE, STATE_EVIDENCE_STATES],
    ["actionability", PUBLIC_REPORT_ACTIONABILITY, ACTIONABILITY_LEVELS],
    ["suppression reasons", PUBLIC_REPORT_SUPPRESSION_REASONS, SUPPRESSION_REASONS],
  ])("%s", (_label, published, internal) => {
    expect([...published]).toEqual([...internal]);
  });

  it("the revision literal is the reporting module's", () => {
    expect(ReportSchema.options[0].shape.revision.value).toBe(REPORT_REVISION);
    expect(ReportSchema.options[1].shape.revision.value).toBe(REPORT_REVISION);
  });
});

const LOCATOR = {
  streamId: "s",
  pageOrdinal: 0,
  indexInPage: 0,
  ingestionOrdinal: 0,
  rawType: "cast",
  reportTimeMs: 1,
};

const DIVERGENCE = {
  section: "PRIORITIZED",
  position: 1,
  itemKind: "PATTERN",
  disposition: "AUTHORITY_DIVERGENCE",
  standing: "DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN",
  producer: "OBSERVED_DECISION_VIEW",
  authority: "SIMC_APL",
  stateEvidence: "PROVEN",
  actionability: "OBSERVED_EXECUTION_ONLY",
  reasonCode: null,
  suppressionReason: null,
  subjectToken: "heart_strike",
  occurrences: 3,
  firstFightTimeMs: 1000,
  lastFightTimeMs: 3000,
  evidence: [LOCATOR],
};

const CARRIED = {
  ...DIVERGENCE,
  section: "CARRIED",
  position: null,
  disposition: "UNKNOWN",
  standing: "UNKNOWN",
  stateEvidence: "INCOMPLETE",
  reasonCode: "OBSERVED_STATE_MISSING",
};

const ASSESSED = {
  assessment: "ASSESSED",
  revision: "fight-report/1",
  assessmentScope: "PARTIAL",
  coverage: {
    gameplay: {
      status: "ANALYZED",
      eligibleDecisions: 6,
      resolvedDecisions: 3,
      unknownDecisions: 3,
      excludedCasts: 0,
    },
    preparation: { assessment: "NOT_ASSESSED", reason: "RETRIEVAL_FAILED" },
    damageDiagnosis: { assessment: "NOT_ASSESSED", reason: "COMPARISON_EVIDENCE_NOT_RETRIEVED" },
    recordsByDisposition: PUBLIC_REPORT_DISPOSITIONS.map((disposition) => ({ disposition, records: 0 })),
    disclosures: ["ONLY_OBSERVED_DECISIONS_VERIFIED"],
  },
  categories: [{ category: "ROTATION", prioritized: [DIVERGENCE], informational: [], carried: [CARRIED] }],
  suppressions: [],
  markdown: "# Fight report\n",
  magnitude: "NOT_USED",
  findingEffect: { confidence: "NONE", suppression: "NONE" },
};

describe("the block is additive under analysis/1", () => {
  it("the version string is unchanged", () => {
    expect(PUBLIC_ANALYSIS_SCHEMA_VERSION).toBe("warcraft-logs-coach.analysis/1");
  });

  it("is optional on every status, unsupported specializations included", () => {
    expect(AnalyzedResultSchema.shape.report.isOptional()).toBe(true);
    expect(SpecNotSupportedResultSchema.shape.report.isOptional()).toBe(true);
  });

  it("accepts a well-formed report", () => {
    expect(ReportSchema.safeParse(ASSESSED).success).toBe(true);
  });

  it("can never claim a complete assessment, omit its disclosures, a disposition count or its markdown", () => {
    expect(ReportSchema.safeParse({ ...ASSESSED, assessmentScope: "COMPLETE" }).success).toBe(false);
    expect(
      ReportSchema.safeParse({ ...ASSESSED, coverage: { ...ASSESSED.coverage, disclosures: [] } }).success,
    ).toBe(false);
    expect(
      ReportSchema.safeParse({
        ...ASSESSED,
        coverage: {
          ...ASSESSED.coverage,
          recordsByDisposition: ASSESSED.coverage.recordsByDisposition.slice(1),
        },
      }).success,
    ).toBe(false);
    expect(ReportSchema.safeParse({ ...ASSESSED, markdown: "" }).success).toBe(false);
  });

  it("cannot carry a magnitude, a confidence, a score or a moved confidence", () => {
    expect(ReportSchema.safeParse({ ...ASSESSED, magnitude: "DPS_LOSS" }).success).toBe(false);
    expect(ReportSchema.safeParse({ ...ASSESSED, confidence: "HIGH" }).success).toBe(false);
    expect(ReportSchema.safeParse({ ...ASSESSED, score: 80 }).success).toBe(false);
    expect(
      ReportSchema.safeParse({ ...ASSESSED, findingEffect: { confidence: "LOWERED", suppression: "NONE" } })
        .success,
    ).toBe(false);
  });

  it("a prioritized entry is only ever a proven divergence with evidence and a position", () => {
    expect(ReportEntrySchema.safeParse(DIVERGENCE).success).toBe(true);
    for (const broken of [
      { disposition: "UNKNOWN" },
      { disposition: "SUPPRESSED" },
      { standing: "UNKNOWN" },
      { stateEvidence: "INCOMPLETE" },
      { evidence: [] },
      { position: null },
      { reasonCode: "X" },
      { impact: 3 },
    ])
      expect(ReportEntrySchema.safeParse({ ...DIVERGENCE, ...broken }).success, JSON.stringify(broken)).toBe(
        false,
      );
  });

  it("a carried entry is a non-assessment with its reason, never ranked", () => {
    expect(ReportEntrySchema.safeParse(CARRIED).success).toBe(true);
    expect(
      ReportEntrySchema.safeParse({
        ...CARRIED,
        disposition: "SUPPRESSED",
        standing: "SUPPRESSED",
        suppressionReason: "INTERMISSION",
      }).success,
    ).toBe(true);
    for (const broken of [
      { disposition: "AUTHORITY_DIVERGENCE" },
      { reasonCode: null },
      { position: 1 },
      { suppressionReason: "MOVEMENT" },
    ])
      expect(ReportEntrySchema.safeParse({ ...CARRIED, ...broken }).success, JSON.stringify(broken)).toBe(
        false,
      );
  });

  it("an informational entry is authority-consistent or an observed fact, never a failure", () => {
    const informational = {
      ...CARRIED,
      section: "INFORMATIONAL",
      disposition: "AUTHORITY_CONSISTENT",
      standing: "AUTHORITY_CONSISTENT",
      reasonCode: null,
    };
    expect(ReportEntrySchema.safeParse(informational).success).toBe(true);
    expect(
      ReportEntrySchema.safeParse({ ...informational, disposition: "AUTHORITY_DIVERGENCE" }).success,
    ).toBe(false);
    expect(ReportEntrySchema.safeParse({ ...informational, disposition: "UNKNOWN" }).success).toBe(false);
    expect(ReportEntrySchema.safeParse({ ...informational, standing: "OBSERVED_FACT" }).success).toBe(false);
  });

  it("SUPPRESSED needs a named environmental reason, and no other disposition may carry one", () => {
    const suppressed = { ...CARRIED, disposition: "SUPPRESSED", standing: "SUPPRESSED" };
    expect(ReportEntrySchema.safeParse({ ...suppressed, suppressionReason: "INTERMISSION" }).success).toBe(
      true,
    );
    expect(ReportEntrySchema.safeParse({ ...suppressed, suppressionReason: null }).success).toBe(false);
    for (const disposition of ["UNKNOWN", "NO_AUTHORITY_AVAILABLE", "UNSUPPORTED"])
      expect(
        ReportEntrySchema.safeParse({
          ...CARRIED,
          disposition,
          standing: disposition,
          suppressionReason: "INTERMISSION",
        }).success,
        disposition,
      ).toBe(false);
    // A carried entry's standing is its own disposition.
    expect(ReportEntrySchema.safeParse({ ...CARRIED, standing: "SUPPRESSED" }).success).toBe(false);
  });

  it("each category array admits only its own section's entries", () => {
    const informational = {
      ...CARRIED,
      section: "INFORMATIONAL",
      disposition: "AUTHORITY_CONSISTENT",
      standing: "AUTHORITY_CONSISTENT",
      reasonCode: null,
    };
    const section = (fields: object) =>
      ReportSchema.safeParse({
        ...ASSESSED,
        categories: [{ category: "ROTATION", prioritized: [], informational: [], carried: [], ...fields }],
      }).success;
    expect(section({ prioritized: [DIVERGENCE], informational: [informational], carried: [CARRIED] })).toBe(
      true,
    );
    for (const [key, entry] of [
      ["prioritized", CARRIED],
      ["prioritized", informational],
      ["informational", DIVERGENCE],
      ["informational", CARRIED],
      ["carried", DIVERGENCE],
      ["carried", informational],
    ] as const)
      expect(section({ [key]: [entry] }), `${key} <- ${entry.section}`).toBe(false);
  });

  it("a suppression always names its environmental reason", () => {
    const row = ReportSchema.options[0].shape.suppressions.element;
    const ok = {
      category: "COOLDOWN",
      suppressionReason: "INTERMISSION",
      reasonCode: "X",
      subjectToken: null,
      records: 1,
    };
    expect(row.safeParse(ok).success).toBe(true);
    expect(row.safeParse({ ...ok, suppressionReason: "SIMILAR_TO_TOP_LOGS" }).success).toBe(false);
    expect(row.safeParse({ ...ok, suppressionReason: null }).success).toBe(false);
    expect(row.safeParse({ ...ok, records: 0 }).success).toBe(false);
  });

  it("NOT_ASSESSED carries a reason and nothing else", () => {
    const refused = { assessment: "NOT_ASSESSED", revision: "fight-report/1", reason: "FINDINGS_REFUSED" };
    expect(ReportSchema.safeParse(refused).success).toBe(true);
    expect(ReportSchema.safeParse({ ...refused, categories: [] }).success).toBe(false);
  });
});

describe("the MCP tool says what the report is, and what it is not", () => {
  const description = analyzeToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS);
  it.each([
    "carries report",
    "grouped by decision category",
    "suppression with its named environmental reason",
    "coverage section that comes first",
    "never by damage or impact",
    "never an endorsement",
    "never a fault",
    "rendered only from those fields",
  ])("mentions %s", (text) => {
    expect(description).toContain(text);
  });
});
