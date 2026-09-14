/**
 * What the tool ADVERTISES, as opposed to what it returns.
 *
 * A client reads `tools/list` once and decides from it how to call the tool and
 * how to parse the answer. If the advertised schema drifts from the schema the
 * projection actually satisfies, every consumer is wrong in a way no successful
 * call reveals — so the advertised JSON Schema is checked against the M6-C
 * contract here rather than assumed.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED
 *
 * Property ordering, and the exact JSON Schema dialect the SDK emits. Both are
 * the SDK's business and neither is semantic. The assertions below are about
 * meaning: the five statuses exist, the version is pinned, the capability
 * literals survive conversion, and a successful analysis carries decisions and
 * coverage.
 */

import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  AnalyzeWarcraftLogInputSchema,
  ANALYZE_TOOL_DESCRIPTION,
  ANALYZE_TOOL_NAME,
  ANALYZE_TOOL_TITLE,
} from "../../src/mcp/tools/analyze-warcraft-log.js";
import {
  PUBLIC_ANALYSIS_SCHEMA_VERSION,
  PublicAnalysisResultSchema,
} from "../../src/contracts/analysis-contract.js";

describe("the tool identity", () => {
  it("is named for the goal, not the machinery", () => {
    expect(ANALYZE_TOOL_NAME).toBe("analyze_warcraft_log");
    // Specification naming rules: 1-128 chars, no spaces or special characters.
    expect(ANALYZE_TOOL_NAME).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
  });

  it("has a human-readable title", () => {
    expect(ANALYZE_TOOL_TITLE).toBe("Analyze Warcraft Logs observed rotational decisions");
  });
});

describe("the description carries the epistemic boundary", () => {
  // Pinned phrase by phrase. A tidy-up that shortened this would remove the
  // only documentation a model reads before deciding what MATCH means.
  const required: readonly { readonly claim: string; readonly phrase: string }[] = [
    { claim: "verifies decisions already made", phrase: "ACTUALLY MADE" },
    { claim: "compares against pinned SimulationCraft", phrase: "SimulationCraft action priority list" },
    { claim: "only one spec is supported", phrase: "Only Assassination Rogue is currently supported" },
    { claim: "unsupported is not clean play", phrase: "not evidence of clean play" },
    { claim: "the three outcomes", phrase: "MATCH, REJECTED or UNKNOWN" },
    { claim: "MATCH is authority-compatible only", phrase: "MATCH means authority-compatible only" },
    {
      claim: "MATCH is not a verdict",
      phrase: "does NOT mean correct, optimal, ideal, best, recommended or mistake-free",
    },
    { claim: "REJECTED names no alternative", phrase: "does not name what should have been done instead" },
    { claim: "UNKNOWN is legitimate", phrase: "UNKNOWN is a" },
    { claim: "no next-action prediction", phrase: "does NOT predict an arbitrary next action" },
    { claim: "no should-have-pressed", phrase: "should\nhave pressed" },
    { claim: "no scoring", phrase: "does NOT score performance" },
    { claim: "no rating anywhere", phrase: "no\nrating, grade or accuracy" },
    { claim: "partial coverage is expected", phrase: "Partial coverage is expected" },
    { claim: "read the coverage disclosure", phrase: "Read the coverage" },
    { claim: "no correctness percentage", phrase: "do not compute a correctness percentage" },
  ];

  for (const requirement of required) {
    it(`states that it ${requirement.claim}`, () => {
      expect(ANALYZE_TOOL_DESCRIPTION).toContain(requirement.phrase);
    });
  }

  it("never claims to say what should have been pressed", () => {
    const flattened = ANALYZE_TOOL_DESCRIPTION.replace(/\s+/g, " ");

    expect(flattened).toContain("does NOT tell the player what they should have pressed");
  });
});

describe("the input contract", () => {
  it("accepts the URL form", () => {
    const parsed = AnalyzeWarcraftLogInputSchema.safeParse({
      source: "url",
      reportUrl: "https://www.warcraftlogs.com/reports/aBcDeFgH12345678#fight=8&source=15",
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts the identifier form", () => {
    const parsed = AnalyzeWarcraftLogInputSchema.safeParse({
      source: "ids",
      reportCode: "aBcDeFgH12345678",
      fightId: 8,
      sourceId: 15,
    });

    expect(parsed.success).toBe(true);
  });

  it("makes the two forms structurally exclusive", () => {
    // The tagged union is what turns "do not mix these" from a rule a model has
    // to infer into a shape it cannot express.
    expect(
      AnalyzeWarcraftLogInputSchema.safeParse({
        source: "url",
        reportUrl: "https://x.test/a",
        fightId: 8,
      }).success,
    ).toBe(false);
  });

  it("rejects a caller-selected evidence scope", () => {
    // Scope is derived from the selected analyzer's requirement. A caller that
    // could choose it could silently under-fetch.
    expect(
      AnalyzeWarcraftLogInputSchema.safeParse({
        source: "ids",
        reportCode: "aBcDeFgH12345678",
        fightId: 8,
        sourceId: 15,
        scope: "FULL_RAID",
      }).success,
    ).toBe(false);
  });

  it("checks only shape, leaving Warcraft Logs semantics to the parser", () => {
    // A syntactically valid non-Warcraft-Logs URL passes the SCHEMA and is
    // refused later by `parseAnalysisRequest`. Duplicating that rule here would
    // create a second parser that drifts from the first.
    expect(
      AnalyzeWarcraftLogInputSchema.safeParse({ source: "url", reportUrl: "https://example.com/x" }).success,
    ).toBe(true);
  });
});

describe("the advertised output schema is the public contract", () => {
  // Converted the way the SDK converts it for `tools/list`, then inspected for
  // meaning rather than for layout.
  const json = JSON.stringify(z.toJSONSchema(PublicAnalysisResultSchema, { io: "output" }));

  it("advertises all five analysis statuses", () => {
    for (const status of [
      "ANALYZED",
      "SPEC_NOT_SUPPORTED",
      "AUTHORITY_NOT_AVAILABLE",
      "PROFILE_NOT_RESOLVED",
      "INSUFFICIENT_EVIDENCE",
    ]) {
      expect(json).toContain(status);
    }
  });

  it("pins the schema version", () => {
    expect(json).toContain(PUBLIC_ANALYSIS_SCHEMA_VERSION);
  });

  it("carries the capability literals through conversion", () => {
    for (const literal of [
      "OBSERVED_DECISION_AUTHORITY_VERIFICATION",
      "AUTHORITY_COMPATIBLE_ONLY",
      "predictsArbitraryNextAction",
      "scoresPerformance",
      "unknownIsFirstClass",
    ]) {
      expect(json).toContain(literal);
    }
  });

  it("describes the ANALYZED decision and coverage shape", () => {
    for (const field of [
      "decisions",
      "coverage",
      "eligibleDecisions",
      "authorityCoverage",
      "selectionPrecision",
      "decisiveBlocker",
      "usabilityProvenance",
      "exclusions",
      "authority",
      "commitSha",
    ]) {
      expect(json).toContain(field);
    }
  });

  it("advertises no removed or invented field", () => {
    // The two M6-C removals, and the performance concepts that never existed.
    for (const banned of [
      "observedActionRejected",
      "evidenceScope",
      "rawBlocker",
      "coveragePercent",
      "accuracy",
      "parseQuality",
    ]) {
      expect(json).not.toContain(banned);
    }
  });

  it("keeps objects closed where conversion preserves it", () => {
    // `.strict()` becomes `additionalProperties: false`. That is what stops an
    // internal field riding along into a consumer's parsed result.
    expect(json).toContain("additionalProperties");
  });
});
