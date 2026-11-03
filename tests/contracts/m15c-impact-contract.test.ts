import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { PublicAnalysisResultSchema } from "../../src/contracts/analysis-contract.js";
import { PublicRaidNightResultSchema } from "../../src/contracts/raid-night-contract.js";
import { DEFAULT_AGGREGATION_CONFIG } from "../../src/reporting/aggregation-config.js";
import { IMPACT_ESTIMATORS } from "../../src/reporting/impact-estimators.js";
import { prioritizeFindings } from "../../src/reporting/prioritization.js";
import { labelPriorities, PRIORITY_LABELS } from "../../src/reporting/priority-labels.js";

/**
 * M15-C contract (owner decision 2026-11-02): impact is non-numeric
 * prioritization only.
 *
 *   - No public document schema has a numeric-impact key: no DPS, HPS,
 *     damage, healing or performance lost, no ranking gain, no output
 *     recovered, no impact or estimate key.
 *   - The priority labelling has none either, and its labels are the four
 *     qualitative words.
 *   - The labelling never reads the numeric estimator extension point, and
 *     no estimator is registered.
 *   - Nothing in M15-C is published: this tranche declares no public
 *     contract change.
 */

const NUMERIC_IMPACT_KEY =
  /impact|estimat|(dps|hps|damage|healing|performance|output|percent|throughput)_?(lost|loss|gain|recovered)|lost_?(dps|hps|damage|healing|output)|rank(ing)?_?(gain|improvement)|recovered|potential_?(dps|gain)/i;

function schemaKeys(schema: z.ZodType, into = new Set<string>(), depth = 0): Set<string> {
  if (depth > 14) return into;
  const inner = (
    schema as unknown as {
      def?: {
        shape?: Record<string, z.ZodType>;
        options?: z.ZodType[];
        element?: z.ZodType;
        innerType?: z.ZodType;
        in?: z.ZodType;
        out?: z.ZodType;
        valueType?: z.ZodType;
        left?: z.ZodType;
        right?: z.ZodType;
      };
    }
  ).def;
  if (inner === undefined) return into;
  if (inner.shape !== undefined)
    for (const [key, value] of Object.entries(inner.shape)) {
      into.add(key);
      schemaKeys(value, into, depth + 1);
    }
  for (const option of inner.options ?? []) schemaKeys(option, into, depth + 1);
  for (const child of [
    inner.element,
    inner.innerType,
    inner.in,
    inner.out,
    inner.valueType,
    inner.left,
    inner.right,
  ])
    if (child !== undefined) schemaKeys(child, into, depth + 1);
  return into;
}

function valueKeys(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) valueKeys(item, into);
  else if (value !== null && typeof value === "object")
    for (const [key, nested] of Object.entries(value)) {
      into.push(key);
      valueKeys(nested, into);
    }
  return into;
}

const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});
const sourceOf = (path: string): string => SOURCES[`../../${path}`] ?? "";

describe("M15-C: impact is non-numeric prioritization", () => {
  it("the walker sees the public schemas (guards against a vacuous sweep)", () => {
    const analysis = schemaKeys(PublicAnalysisResultSchema);
    const night = schemaKeys(PublicRaidNightResultSchema);
    for (const key of ["status", "tldr", "report", "coverage", "magnitude", "findingEffect"])
      expect(analysis.has(key), key).toBe(true);
    expect(night.has("coverageDisclosure")).toBe(true);
    expect(analysis.size).toBeGreaterThan(100);
  });

  it("no public document schema carries a numeric-impact key", () => {
    for (const schema of [PublicAnalysisResultSchema, PublicRaidNightResultSchema]) {
      const offending = [...schemaKeys(schema)].filter((key) => NUMERIC_IMPACT_KEY.test(key));
      expect(offending).toEqual([]);
    }
  });

  it("the key pattern catches the meanings the owner excluded", () => {
    for (const key of [
      "dpsLost",
      "damage_lost",
      "performanceLoss",
      "percentLost",
      "rankingGain",
      "outputRecovered",
      "estimatedDps",
      "impact",
      "lostDamage",
    ])
      expect(NUMERIC_IMPACT_KEY.test(key), key).toBe(true);
  });

  it("the priority labelling carries no numeric-impact key and only qualitative labels", () => {
    const result = prioritizeFindings(
      [
        {
          findingId: "a",
          producer: "TEST",
          category: "ROTATION",
          specId: "test/spec",
          disposition: "AUTHORITY_DIVERGENCE",
          authority: "TEST_APL",
          producerStatus: "REJECTED",
          reasonCode: null,
          suppressionReason: null,
          stateEvidence: "PROVEN",
          actionability: "DECISION_PROVEN_ACTIONABLE",
          fightTimeMs: 1,
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
          aggregationKey: null,
          subjectToken: null,
        },
      ],
      DEFAULT_AGGREGATION_CONFIG,
    );
    const labelling = labelPriorities(result);
    expect(labelling.kind).toBe("LABELLED");
    // `numericEstimate` is the one key naming an estimate: the literal NOT_PRODUCED that denies one.
    const keys = valueKeys(labelling).filter((key) => key !== "numericEstimate");
    expect(keys.filter((key) => NUMERIC_IMPACT_KEY.test(key))).toEqual([]);
    expect(labelling.kind === "LABELLED" && labelling.numericEstimate).toBe("NOT_PRODUCED");
    expect(PRIORITY_LABELS).toEqual(["HIGH_PRIORITY", "MEDIUM_PRIORITY", "LOW_PRIORITY", "NOT_PRIORITIZED"]);
  });

  it("the labelling never reads the estimator extension point, and none is registered", () => {
    expect(sourceOf("src/reporting/priority-labels.ts")).not.toMatch(/impact-estimators/);
    expect(sourceOf("src/reporting/prioritization.ts")).not.toMatch(/impact-estimators|priority-labels/);
    expect(IMPACT_ESTIMATORS).toEqual([]);
  });

  it("nothing in M15-C is published or reachable from a public surface", () => {
    for (const [key, source] of Object.entries(SOURCES)) {
      if (key.includes("/src/reporting/")) continue;
      expect(source, key).not.toMatch(/reporting\/(priority-labels|impact-estimators)/);
    }
  });
});
