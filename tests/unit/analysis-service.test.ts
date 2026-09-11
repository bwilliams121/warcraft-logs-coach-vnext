import { describe, expect, it } from "vitest";

import type { Env } from "../../src/config/env.js";
import {
  analyzeFight,
  ENABLED_ANALYSIS_REQUIREMENTS,
  type AnalysisServiceDeps,
} from "../../src/services/analysis-service.js";
import type { AnalyzerRequirement } from "../../src/services/ingestion-scope.js";

const configuredEnv: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: "fake-client-id-not-real",
  WCL_CLIENT_SECRET: "fake-client-secret-not-real",
};

const validInput = { reportCode: "aBcDeFgH12345678", fightId: 8, sourceId: 15 };

/** Every property name appearing anywhere in a JSON value. */
function collectKeys(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
  } else if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      into.push(key);
      collectKeys(nested, into);
    }
  }
  return into;
}

function deps(overrides: Partial<AnalysisServiceDeps> = {}): AnalysisServiceDeps {
  return {
    env: configuredEnv,
    analyzers: ENABLED_ANALYSIS_REQUIREMENTS,
    ...overrides,
  };
}

describe("analyzeFight", () => {
  it("service_runs_without_cloudflare_runtime_objects", () => {
    // This test file runs in the `node` project, with no Workers runtime and no
    // Miniflare. Reaching this assertion at all is the proof: the application
    // service and everything it imports are Cloudflare-independent.
    expect(typeof analyzeFight).toBe("function");
    expect(analyzeFight(validInput, deps()).ok).toBe(false);
  });

  it("analysis_is_not_implemented_in_milestone_1", () => {
    const result = analyzeFight(validInput, deps());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ANALYSIS_NOT_IMPLEMENTED");
    }
  });

  it("does_not_return_a_successful_analysis", () => {
    // Nothing in Milestone 1 may produce ok: true. Absence of analysis must never
    // be presentable as analysis.
    const inputs: unknown[] = [
      validInput,
      { reportUrl: "https://www.warcraftlogs.com/reports/aBcDeFgH12345678#fight=8&source=15" },
      {},
      null,
    ];

    for (const input of inputs) {
      expect(analyzeFight(input, deps()).ok).toBe(false);
    }
  });

  it("invalid_request_is_rejected_before_not_implemented", () => {
    // Proves validation is real rather than bypassed by the placeholder.
    const result = analyzeFight({ reportCode: "aBcDeFgH12345678", fightId: 8 }, deps());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_REQUEST");
      expect(result.error.issues?.map((issue) => issue.code)).toEqual(["MISSING_SOURCE_ID"]);
    }
  });

  it("absent_credentials_return_configuration_error", () => {
    const result = analyzeFight(validInput, deps({ env: { ENVIRONMENT: "test" } }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFIGURATION_ERROR");
      expect(result.error.message).toContain("WCL_CLIENT_ID");
      expect(result.error.message).toContain("WCL_CLIENT_SECRET");
    }
  });

  it("configuration_error_precedes_not_implemented", () => {
    // Ordering matters: a misconfigured deployment must be diagnosable even
    // though analysis is not built yet.
    const result = analyzeFight(validInput, deps({ env: {} }));

    expect(result.ok === false && result.error.code).toBe("CONFIGURATION_ERROR");
  });

  it("milestone_1_enables_no_analyzers", () => {
    expect(ENABLED_ANALYSIS_REQUIREMENTS).toEqual([]);
  });

  it("an_enabled_analyzer_does_not_make_analysis_available", () => {
    // Even with a requirement declared, no evaluator exists. The service must
    // still refuse rather than invent a result.
    const analyzers: readonly AnalyzerRequirement[] = [{ analyzerId: "example", requiredScope: "FULL_RAID" }];
    const result = analyzeFight(validInput, deps({ analyzers }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ANALYSIS_NOT_IMPLEMENTED");
    }
  });

  it("service_result_never_contains_coaching_shaped_fields", () => {
    // Structural, not a substring sweep: the refusal message is allowed to
    // explain in prose that no coaching was produced. What must not exist is a
    // field a client could read as analysis output.
    const keys = collectKeys(JSON.parse(JSON.stringify(analyzeFight(validInput, deps()))));

    for (const key of ["findings", "tldr", "coaching", "score"]) {
      expect(keys, `result must not carry a "${key}" field`).not.toContain(key);
    }
  });
});
