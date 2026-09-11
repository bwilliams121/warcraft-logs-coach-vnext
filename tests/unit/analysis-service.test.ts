import { describe, expect, it, vi } from "vitest";

import type { Env } from "../../src/config/env.js";
import {
  analyzeFight,
  ENABLED_ANALYSIS_REQUIREMENTS,
  type AnalysisServiceDeps,
} from "../../src/services/analysis-service.js";
import type { AnalyzerRequirement } from "../../src/services/ingestion-scope.js";
import type { ServiceErrorCode } from "../../src/services/result.js";
import { wclFailure, type PreflightPort, type WclFailureReason } from "../../src/wcl/types.js";
import { REQUEST } from "../fixtures/wcl/preflight-payloads.js";

const configuredEnv: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: "fake-client-id-not-real",
  WCL_CLIENT_SECRET: "fake-client-secret-not-real",
};

const validInput = { reportCode: REQUEST.reportCode, fightId: REQUEST.fightId, sourceId: REQUEST.sourceId };

const identity = {
  report: {
    code: REQUEST.reportCode,
    revision: 24,
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_600_000,
  },
  data: { logVersion: 26, gameVersion: 1 },
  fight: {
    id: 8,
    name: "Test Encounter",
    encounterId: 2902,
    difficulty: 5,
    startTime: 120_000,
    endTime: 420_000,
  },
  player: { sourceId: 15, name: "Coachtest", className: "Rogue", specName: "Assassination" },
} as const;

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

const resolvingPreflight: PreflightPort = async () => ({ ok: true, identity, rateLimit: undefined });

function failingPreflight(reason: WclFailureReason): PreflightPort {
  return async () => ({ ok: false, failure: wclFailure(reason, "TRANSPORT") });
}

/** Fails the test if reached: proves an earlier step short-circuited. */
const unreachablePreflight: PreflightPort = async () => {
  throw new Error("preflight must not run for this input");
};

function deps(overrides: Partial<AnalysisServiceDeps> = {}): AnalysisServiceDeps {
  return {
    env: configuredEnv,
    analyzers: ENABLED_ANALYSIS_REQUIREMENTS,
    preflight: resolvingPreflight,
    ...overrides,
  };
}

describe("analyzeFight", () => {
  it("service_runs_without_cloudflare_runtime_objects", async () => {
    // This test file runs in the `node` project, with no Workers runtime and no
    // Miniflare. Reaching this assertion at all is the proof: the application
    // service and everything it imports are Cloudflare-independent.
    expect(typeof analyzeFight).toBe("function");
    expect((await analyzeFight(validInput, deps())).ok).toBe(false);
  });

  it("analysis_is_not_implemented_after_a_successful_preflight", async () => {
    const result = await analyzeFight(validInput, deps());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ANALYSIS_NOT_IMPLEMENTED");
    }
  });

  it("does_not_return_a_successful_analysis", async () => {
    // Nothing in Milestone 2 may produce ok: true. Absence of analysis must never
    // be presentable as analysis.
    const inputs: unknown[] = [
      validInput,
      { reportUrl: `https://www.warcraftlogs.com/reports/${REQUEST.reportCode}#fight=8&source=15` },
      {},
      null,
    ];

    for (const input of inputs) {
      expect((await analyzeFight(input, deps())).ok).toBe(false);
    }
  });

  it("invalid_request_is_rejected_before_not_implemented", async () => {
    // Proves validation is real rather than bypassed by the placeholder.
    const result = await analyzeFight({ reportCode: REQUEST.reportCode, fightId: 8 }, deps());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_REQUEST");
      expect(result.error.issues?.map((issue) => issue.code)).toEqual(["MISSING_SOURCE_ID"]);
    }
  });

  it("invalid_request_fails_before_any_wcl_call", async () => {
    const result = await analyzeFight({ reportCode: "nope" }, deps({ preflight: unreachablePreflight }));

    expect(result.ok === false && result.error.code).toBe("INVALID_REQUEST");
  });

  it("absent_credentials_return_configuration_error", async () => {
    const result = await analyzeFight(validInput, deps({ env: { ENVIRONMENT: "test" } }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFIGURATION_ERROR");
      expect(result.error.message).toContain("WCL_CLIENT_ID");
      expect(result.error.message).toContain("WCL_CLIENT_SECRET");
    }
  });

  it("missing_configuration_fails_before_any_wcl_call", async () => {
    const result = await analyzeFight(validInput, deps({ env: {}, preflight: unreachablePreflight }));

    expect(result.ok === false && result.error.code).toBe("CONFIGURATION_ERROR");
  });

  it("preflight_runs_before_the_not_implemented_boundary", async () => {
    // The ordering that makes a bad report code diagnosable: it must not be
    // masked by "analysis is not implemented".
    const preflight = vi.fn<PreflightPort>(failingPreflight("REPORT_NOT_ACCESSIBLE"));

    const result = await analyzeFight(validInput, deps({ preflight }));

    expect(preflight).toHaveBeenCalledTimes(1);
    expect(result.ok === false && result.error.code).toBe("REPORT_NOT_ACCESSIBLE");
  });

  it("preflight_receives_the_canonical_request_and_credentials", async () => {
    const preflight = vi.fn<PreflightPort>(resolvingPreflight);

    await analyzeFight(
      { reportUrl: `https://www.warcraftlogs.com/reports/${REQUEST.reportCode}#fight=8&source=15` },
      deps({ preflight }),
    );

    expect(preflight.mock.calls[0]?.[0]).toEqual({
      reportCode: REQUEST.reportCode,
      fightId: 8,
      sourceId: 15,
    });
    // Credentials reach the WCL boundary and nowhere else.
    expect(preflight.mock.calls[0]?.[1]?.clientId).toBe("fake-client-id-not-real");
  });

  it("every_preflight_failure_maps_to_its_documented_service_code", async () => {
    const expected: Record<WclFailureReason, ServiceErrorCode> = {
      REPORT_NOT_ACCESSIBLE: "REPORT_NOT_ACCESSIBLE",
      FIGHT_NOT_FOUND: "FIGHT_NOT_FOUND",
      SOURCE_NOT_FOUND: "SOURCE_NOT_FOUND",
      SOURCE_NOT_A_PLAYER: "SOURCE_NOT_A_PLAYER",
      SOURCE_NOT_IN_FIGHT: "SOURCE_NOT_IN_FIGHT",
      IDENTITY_UNRESOLVED: "IDENTITY_UNRESOLVED",
      UPSTREAM_DATA_INVALID: "UPSTREAM_DATA_INVALID",
      UPSTREAM_AUTH_FAILED: "UPSTREAM_AUTH_FAILED",
      UPSTREAM_RATE_LIMITED: "UPSTREAM_RATE_LIMITED",
      UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
      CREDENTIALS_NOT_ENCODABLE: "CONFIGURATION_ERROR",
    };

    for (const [reason, code] of Object.entries(expected) as [WclFailureReason, ServiceErrorCode][]) {
      const result = await analyzeFight(validInput, deps({ preflight: failingPreflight(reason) }));

      expect(result.ok, reason).toBe(false);
      if (!result.ok) {
        expect(result.error.code, reason).toBe(code);
        // Never "not implemented": a retrieval or identity failure is its own
        // answer, not a milestone excuse.
        expect(result.error.code, reason).not.toBe("ANALYSIS_NOT_IMPLEMENTED");
      }
    }
  });

  it("preflight_failure_messages_are_author_written", async () => {
    for (const reason of ["UPSTREAM_DATA_INVALID", "UPSTREAM_UNAVAILABLE"] as const) {
      const result = await analyzeFight(validInput, deps({ preflight: failingPreflight(reason) }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message.length).toBeGreaterThan(0);
        // No diagnostics, no upstream prose, no status codes leaking through.
        expect(result.error.message).not.toContain("stage");
        expect(result.error.message).not.toContain("httpStatus");
      }
    }
  });

  it("milestone_2_enables_no_analyzers", () => {
    expect(ENABLED_ANALYSIS_REQUIREMENTS).toEqual([]);
  });

  it("an_enabled_analyzer_does_not_make_analysis_available", async () => {
    // Even with a requirement declared, no evaluator exists. The service must
    // still refuse rather than invent a result.
    const analyzers: readonly AnalyzerRequirement[] = [{ analyzerId: "example", requiredScope: "FULL_RAID" }];
    const result = await analyzeFight(validInput, deps({ analyzers }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ANALYSIS_NOT_IMPLEMENTED");
    }
  });

  it("service_result_never_contains_coaching_shaped_fields", async () => {
    // Structural, not a substring sweep: the refusal message is allowed to
    // explain in prose that no coaching was produced. What must not exist is a
    // field a client could read as analysis output.
    const result = await analyzeFight(validInput, deps());
    const keys = collectKeys(JSON.parse(JSON.stringify(result)));

    for (const key of ["findings", "tldr", "coaching", "score"]) {
      expect(keys, `result must not carry a "${key}" field`).not.toContain(key);
    }
  });

  it("resolved_identity_is_not_echoed_to_the_caller", async () => {
    // Identity is established for the analysis boundary, not for the response.
    // Echoing it would be the first step toward a payload that reads as a report.
    const result = await analyzeFight(validInput, deps());
    const serialized = JSON.stringify(result);

    for (const value of ["Coachtest", "Rogue", "Assassination", "Test Encounter"]) {
      expect(serialized, `result must not echo "${value}"`).not.toContain(value);
    }
  });
});
