import { describe, expect, it } from "vitest";

import {
  AnalyzedResultSchema,
  PUBLIC_ANALYSIS_SCHEMA_VERSION,
  PUBLIC_ANALYSIS_STATUSES,
  PUBLIC_TLDR_CATEGORIES,
  PUBLIC_TLDR_DISCLOSURES,
  PUBLIC_TLDR_DIVERGENCE_STANDINGS,
  PUBLIC_TLDR_HEADLINES,
  PUBLIC_TLDR_NOT_ASSESSED_DISPOSITIONS,
  PUBLIC_TLDR_NOT_ASSESSED_REASONS,
  SpecNotSupportedResultSchema,
  TldrSchema,
} from "../../src/contracts/analysis-contract.js";
import { NON_ASSESSMENT_DISPOSITIONS, REPORTING_CATEGORIES } from "../../src/reporting/finding-record.js";
import { DIVERGENCE_STANDINGS } from "../../src/reporting/prioritization.js";
import {
  TLDR_DISCLOSURES,
  TLDR_GAMEPLAY_STATUSES,
  TLDR_HEADLINES,
  TLDR_NOT_ASSESSED_REASONS,
  TLDR_REVISION,
} from "../../src/reporting/tldr.js";
import { analyzeToolDescription } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { PUBLIC_SPECIALIZATION_DESCRIPTIONS } from "../../src/services/analyzer-registry.js";

/**
 * M15-B public contract: the TLDR is an additive, optional field on every
 * status under `analysis/1`; every TLDR vocabulary is declared independently
 * and pinned equal to the reporting module's own; and the shape cannot carry
 * a complete-assessment claim, a magnitude, a confidence, a suppression or a
 * count for an UNKNOWN consumable.
 */

describe("the TLDR vocabularies are declared independently and pinned to the reporting module's", () => {
  it.each([
    ["headlines", PUBLIC_TLDR_HEADLINES, TLDR_HEADLINES],
    ["disclosures", PUBLIC_TLDR_DISCLOSURES, TLDR_DISCLOSURES],
    ["not-assessed reasons", PUBLIC_TLDR_NOT_ASSESSED_REASONS, TLDR_NOT_ASSESSED_REASONS],
    ["categories", PUBLIC_TLDR_CATEGORIES, REPORTING_CATEGORIES],
    ["non-assessment dispositions", PUBLIC_TLDR_NOT_ASSESSED_DISPOSITIONS, NON_ASSESSMENT_DISPOSITIONS],
    ["divergence standings", PUBLIC_TLDR_DIVERGENCE_STANDINGS, DIVERGENCE_STANDINGS],
    ["gameplay statuses", PUBLIC_ANALYSIS_STATUSES, TLDR_GAMEPLAY_STATUSES],
  ])("%s", (_label, published, internal) => {
    expect([...published]).toEqual([...internal]);
  });

  it("the revision literal is the reporting module's", () => {
    expect(TldrSchema.options[0].shape.revision.value).toBe(TLDR_REVISION);
    expect(TldrSchema.options[1].shape.revision.value).toBe(TLDR_REVISION);
  });
});

const ASSESSED = {
  assessment: "ASSESSED",
  revision: "fight-tldr/1",
  assessmentScope: "PARTIAL",
  headline: "NO_DECISION_RESOLVED",
  gameplay: {
    status: "ANALYZED",
    eligibleDecisions: 2,
    resolvedDecisions: 0,
    unknownDecisions: 2,
    excludedCasts: 0,
  },
  highlights: [],
  divergences: { items: 0, records: 0, actionableRecords: 0, notListedItems: 0 },
  notAssessed: [{ category: "ROTATION", disposition: "UNKNOWN", records: 2 }],
  preparation: {
    assessment: "ASSESSED",
    healthPotion: { countState: "OBSERVED", count: 0 },
    healthstone: { countState: "UNKNOWN" },
    combatPotion: { countState: "OBSERVED", count: 1 },
  },
  damageDiagnosis: { assessment: "NOT_ASSESSED", reason: "COMPARISON_EVIDENCE_NOT_RETRIEVED" },
  disclosures: ["ONLY_OBSERVED_DECISIONS_VERIFIED", "DECISIONS_UNKNOWN"],
  lines: [
    "Partial analysis: 0 of 2 eligible observed decisions resolved against the authority and 2 are UNKNOWN.",
  ],
  magnitude: "NOT_USED",
  findingEffect: { confidence: "NONE", suppression: "NONE" },
};

describe("the block is additive under analysis/1", () => {
  it("the version string is unchanged", () => {
    expect(PUBLIC_ANALYSIS_SCHEMA_VERSION).toBe("warcraft-logs-coach.analysis/1");
  });

  it("is optional on every status, unsupported specializations included", () => {
    expect(AnalyzedResultSchema.shape.tldr.isOptional()).toBe(true);
    expect(SpecNotSupportedResultSchema.shape.tldr.isOptional()).toBe(true);
  });

  it("accepts a well-formed TLDR", () => {
    expect(TldrSchema.safeParse(ASSESSED).success).toBe(true);
  });

  it("can never claim a complete assessment, omit its disclosures or its coverage line", () => {
    expect(TldrSchema.safeParse({ ...ASSESSED, assessmentScope: "COMPLETE" }).success).toBe(false);
    expect(TldrSchema.safeParse({ ...ASSESSED, disclosures: [] }).success).toBe(false);
    expect(TldrSchema.safeParse({ ...ASSESSED, lines: [] }).success).toBe(false);
    expect(TldrSchema.safeParse({ ...ASSESSED, headline: "CLEAN_FIGHT" }).success).toBe(false);
  });

  it("an UNKNOWN consumable cannot carry a count", () => {
    expect(
      TldrSchema.safeParse({
        ...ASSESSED,
        preparation: { ...ASSESSED.preparation, healthstone: { countState: "UNKNOWN", count: 0 } },
      }).success,
    ).toBe(false);
  });

  it("cannot carry a magnitude, a confidence, a suppression or a score", () => {
    expect(TldrSchema.safeParse({ ...ASSESSED, magnitude: "DPS_LOSS" }).success).toBe(false);
    expect(TldrSchema.safeParse({ ...ASSESSED, confidence: "HIGH" }).success).toBe(false);
    expect(TldrSchema.safeParse({ ...ASSESSED, score: 80 }).success).toBe(false);
    expect(
      TldrSchema.safeParse({ ...ASSESSED, findingEffect: { confidence: "LOWERED", suppression: "NONE" } })
        .success,
    ).toBe(false);
    expect(
      TldrSchema.safeParse({ ...ASSESSED, findingEffect: { confidence: "NONE", suppression: "SUPPRESSED" } })
        .success,
    ).toBe(false);
  });

  it("a highlight is only ever a divergence standing with evidence", () => {
    const highlight = {
      position: 1,
      itemKind: "SINGLE",
      category: "ROTATION",
      standing: "DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN",
      subjectToken: "heart_strike",
      occurrences: 1,
      firstFightTimeMs: 10,
      lastFightTimeMs: 10,
      evidence: [
        {
          streamId: "s",
          pageOrdinal: 0,
          indexInPage: 0,
          ingestionOrdinal: 0,
          rawType: "cast",
          reportTimeMs: 1,
        },
      ],
    };
    const shape = TldrSchema.options[0].shape.highlights.element;
    expect(shape.safeParse(highlight).success).toBe(true);
    expect(shape.safeParse({ ...highlight, standing: "UNKNOWN" }).success).toBe(false);
    expect(shape.safeParse({ ...highlight, standing: "SUPPRESSED" }).success).toBe(false);
    expect(shape.safeParse({ ...highlight, evidence: [] }).success).toBe(false);
    expect(shape.safeParse({ ...highlight, impact: 3 }).success).toBe(false);
  });

  it("the not-assessed tally names only non-assessments", () => {
    const row = TldrSchema.options[0].shape.notAssessed.element;
    expect(row.safeParse({ category: "ROTATION", disposition: "SUPPRESSED", records: 1 }).success).toBe(true);
    expect(
      row.safeParse({ category: "ROTATION", disposition: "AUTHORITY_DIVERGENCE", records: 1 }).success,
    ).toBe(false);
    expect(row.safeParse({ category: "ROTATION", disposition: "UNKNOWN", records: 0 }).success).toBe(false);
  });

  it("NOT_ASSESSED carries a reason and nothing else", () => {
    expect(
      TldrSchema.safeParse({
        assessment: "NOT_ASSESSED",
        revision: "fight-tldr/1",
        reason: "FINDINGS_REFUSED",
      }).success,
    ).toBe(true);
    expect(
      TldrSchema.safeParse({
        assessment: "NOT_ASSESSED",
        revision: "fight-tldr/1",
        reason: "FINDINGS_REFUSED",
        highlights: [],
      }).success,
    ).toBe(false);
  });
});

describe("the MCP tool says what the TLDR is, and what it is not", () => {
  const description = analyzeToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS);
  it.each([
    "carries tldr",
    "assessmentScope is always PARTIAL",
    "is NOT the same as",
    "not an endorsement",
    "GAMEPLAY_NOT_ANALYZED is not evidence of clean play",
    "never by damage or impact",
    "never treated as a finding or as zero",
  ])("mentions %s", (text) => {
    expect(description).toContain(text);
  });
});
