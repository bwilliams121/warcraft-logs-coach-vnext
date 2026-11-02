import { describe, expect, it } from "vitest";

import {
  AnalyzedResultSchema,
  DiagnosisSchema,
  PUBLIC_ANALYSIS_SCHEMA_VERSION,
  PUBLIC_DIAGNOSIS_DELTA_BOUND_KINDS,
  PUBLIC_DIAGNOSIS_DELTA_UNKNOWN_REASONS,
  PUBLIC_DIAGNOSIS_DIMENSIONS,
  PUBLIC_DIAGNOSIS_DIRECTIONS,
  PUBLIC_DIAGNOSIS_ENVIRONMENTAL_REASONS,
  PUBLIC_DIAGNOSIS_LIMITS,
  PUBLIC_DIAGNOSIS_MEASURES,
  PUBLIC_DIAGNOSIS_NOT_ASSESSED_REASONS,
  PUBLIC_DIAGNOSIS_OBSERVATION_CAUSES,
  PUBLIC_DIAGNOSIS_TARGET_CLASSES,
  SpecNotSupportedResultSchema,
} from "../../src/contracts/analysis-contract.js";
import {
  DIAGNOSIS_DELTA_BOUND_KINDS,
  DIAGNOSIS_DELTA_UNKNOWN_REASONS,
  DIAGNOSIS_DELTA_DIMENSIONS,
  DIAGNOSIS_DIRECTIONS,
  DIAGNOSIS_ENVIRONMENTAL_REASONS,
  DIAGNOSIS_LINK_LIMITS,
  DIAGNOSIS_DELTA_MEASURES,
  DIAGNOSIS_NOT_ASSESSED_REASONS,
  DIAGNOSIS_OBSERVATION_CAUSES,
  DIAGNOSIS_TARGET_CLASSES,
} from "../../src/diagnosis/vocabulary.js";
import { analyzeToolDescription } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { PUBLIC_SPECIALIZATION_DESCRIPTIONS } from "../../src/services/analyzer-registry.js";

/**
 * M14-F public contract: the diagnosis block is an additive, optional field
 * of ANALYZED results under `analysis/1`, every public diagnosis vocabulary
 * is declared independently and pinned equal to the projection's own, and
 * nothing in it can carry a cause, a magnitude, a score or a confidence.
 */

describe("the diagnosis vocabularies are declared independently and pinned to the projection's", () => {
  it.each([
    ["not-assessed reasons", PUBLIC_DIAGNOSIS_NOT_ASSESSED_REASONS, DIAGNOSIS_NOT_ASSESSED_REASONS],
    ["measures", PUBLIC_DIAGNOSIS_MEASURES, DIAGNOSIS_DELTA_MEASURES],
    ["dimensions", PUBLIC_DIAGNOSIS_DIMENSIONS, DIAGNOSIS_DELTA_DIMENSIONS],
    ["target classes", PUBLIC_DIAGNOSIS_TARGET_CLASSES, DIAGNOSIS_TARGET_CLASSES],
    ["delta bound kinds", PUBLIC_DIAGNOSIS_DELTA_BOUND_KINDS, DIAGNOSIS_DELTA_BOUND_KINDS],
    ["delta unknown reasons", PUBLIC_DIAGNOSIS_DELTA_UNKNOWN_REASONS, DIAGNOSIS_DELTA_UNKNOWN_REASONS],
    ["directions", PUBLIC_DIAGNOSIS_DIRECTIONS, DIAGNOSIS_DIRECTIONS],
    ["limits", PUBLIC_DIAGNOSIS_LIMITS, DIAGNOSIS_LINK_LIMITS],
    ["observation causes", PUBLIC_DIAGNOSIS_OBSERVATION_CAUSES, DIAGNOSIS_OBSERVATION_CAUSES],
    ["environmental reasons", PUBLIC_DIAGNOSIS_ENVIRONMENTAL_REASONS, DIAGNOSIS_ENVIRONMENTAL_REASONS],
  ])("%s", (_label, published, internal) => {
    expect([...published]).toEqual([...internal]);
  });
});

describe("the block is additive under analysis/1", () => {
  it("the version string is unchanged", () => {
    expect(PUBLIC_ANALYSIS_SCHEMA_VERSION).toBe("warcraft-logs-coach.analysis/1");
  });

  it("is optional on ANALYZED and absent from every non-analyzed status", () => {
    expect(AnalyzedResultSchema.shape.diagnosis.isOptional()).toBe(true);
    expect(Object.keys(SpecNotSupportedResultSchema.shape)).not.toContain("diagnosis");
  });

  it("NOT_ASSESSED carries a reason and nothing else", () => {
    expect(
      DiagnosisSchema.safeParse({ assessment: "NOT_ASSESSED", reason: "COMPARISON_EVIDENCE_NOT_RETRIEVED" })
        .success,
    ).toBe(true);
    expect(
      DiagnosisSchema.safeParse({
        assessment: "NOT_ASSESSED",
        reason: "COMPARISON_EVIDENCE_NOT_RETRIEVED",
        statements: [],
      }).success,
    ).toBe(false);
    expect(
      DiagnosisSchema.safeParse({ assessment: "NOT_ASSESSED", reason: "NOTHING_DIFFERED" }).success,
    ).toBe(false);
  });

  it("a statement is only ever SUBJECT_HIGHER, rests on at least one finding, and attributes no magnitude", () => {
    const statement = {
      statementKind: "AUTHORITY_FINDING_LINKED_TO_DELTA",
      rowId: "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:1",
      windowId: "WHOLE_FIGHT",
      measure: "DAMAGE_EVENT_COUNT",
      component: { dimension: "BY_ABILITY", sourceKind: "FOCUS", abilityGameId: 1 },
      comparisonFightRef: "C#1",
      perMinuteDelta: { kind: "EXACT", value: 3 },
      limits: [],
      direction: "SUBJECT_HIGHER",
      findings: [
        {
          streamId: "s",
          pageOrdinal: 0,
          indexInPage: 0,
          ingestionOrdinal: 0,
          rawType: "cast",
          reportTimeMs: 10,
        },
      ],
      environmentalContext: [],
      magnitudeAttribution: "NONE",
    };
    const shape = DiagnosisSchema.options[0].shape.statements.element;
    expect(shape.safeParse(statement).success).toBe(true);
    expect(shape.safeParse({ ...statement, direction: "SUBJECT_LOWER" }).success).toBe(false);
    expect(shape.safeParse({ ...statement, findings: [] }).success).toBe(false);
    expect(shape.safeParse({ ...statement, magnitudeAttribution: "PARTIAL" }).success).toBe(false);
    expect(shape.safeParse({ ...statement, confidence: "HIGH" }).success).toBe(false);
    expect(shape.safeParse({ ...statement, cause: "ROTATION" }).success).toBe(false);
  });

  it("an assessed block cannot carry a confidence, a suppression or a score", () => {
    const assessed = DiagnosisSchema.options[0].shape;
    expect(Object.keys(assessed)).not.toContain("confidence");
    expect(Object.keys(assessed)).not.toContain("score");
    expect(assessed.findingEffect.safeParse({ suppression: "SUPPRESSED", confidence: "NONE" }).success).toBe(
      false,
    );
    expect(assessed.findingEffect.safeParse({ suppression: "NONE", confidence: "LOWERED" }).success).toBe(
      false,
    );
  });
});

describe("the MCP tool says what diagnosis is, and what it is not", () => {
  const description = analyzeToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS);
  it.each([
    "carries diagnosis",
    "NOT_ASSESSED",
    "COMPARISON_EVIDENCE_NOT_RETRIEVED",
    "An observation is not a cause",
    "does NOT say how much",
    "context, never authority",
  ])("mentions %s", (text) => {
    expect(description).toContain(text);
  });
});
