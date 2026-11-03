import { describe, expect, it, vi } from "vitest";

import type { Env } from "../../src/config/env.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import {
  analyzeFight,
  ENABLED_ANALYSIS_REQUIREMENTS,
  type AnalysisServiceDeps,
} from "../../src/services/analysis-service.js";
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

/**
 * Retrieval that fails.
 *
 * This file is about the stages BEFORE analysis — validation, configuration,
 * identity — so the default ingestion stops the pipeline right after them with
 * a plain upstream failure. Tests that care about real analysis live in
 * `analysis-composition.test.ts`, over a real fixture.
 */
const failingIngest: CombatIngestionPort = async () => ({
  ok: false,
  failure: { reason: "UPSTREAM_UNAVAILABLE" },
});

/** Fails the test if reached: proves an earlier step short-circuited. */
const unreachableIngest: CombatIngestionPort = () => {
  throw new Error("ingestion must not run for this input");
};

function deps(overrides: Partial<AnalysisServiceDeps> = {}): AnalysisServiceDeps {
  return {
    env: configuredEnv,
    preflight: resolvingPreflight,
    ingest: failingIngest,
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

  it("proceeds_past_preflight_into_real_retrieval", async () => {
    // Superseded `analysis_is_not_implemented_after_a_successful_preflight`.
    // M6-E bound real ingestion, so a resolved identity now continues into M3
    // rather than stopping at a placeholder. The failure below is the stubbed
    // retrieval failing, which is the proof it was reached at all.
    const ingest = vi.fn(failingIngest);
    const result = await analyzeFight(validInput, deps({ ingest }));

    expect(ingest).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UPSTREAM_UNAVAILABLE");
    }
  });

  it("never_presents_a_retrieval_failure_as_an_analysis", async () => {
    // A failed retrieval is not an empty fight. It must never become ok: true.
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

  it("invalid_request_is_rejected_before_any_warcraft_logs_work", async () => {
    // Proves validation is real rather than bypassed on the way to retrieval.
    const result = await analyzeFight({ reportCode: REQUEST.reportCode, fightId: 8 }, deps());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_REQUEST");
      expect(result.error.issues?.map((issue) => issue.code)).toEqual(["MISSING_SOURCE_ID"]);
    }
  });

  it("invalid_request_fails_before_any_wcl_call", async () => {
    const result = await analyzeFight(
      { reportCode: "nope" },
      deps({ preflight: unreachablePreflight, ingest: unreachableIngest }),
    );

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

  it("preflight_failure_is_diagnosed_for_its_own_reason", async () => {
    // The ordering that makes a bad report code diagnosable: it must not be
    // masked by a later retrieval failure.
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

  it("enables_exactly_the_seven_public_analyzers", () => {
    // Superseded `milestone_2_enables_no_analyzers`, in M10-D
    // `enables_exactly_the_assassination_analyzer`, in M11-A5
    // `enables_exactly_the_two_public_analyzers`, in M11-B12
    // `enables_exactly_the_three_public_analyzers` and in M11-C4j
    // `enables_exactly_the_four_public_analyzers`, and in M13-F
    // `enables_exactly_the_five_public_analyzers`. Pinned exactly, because
    // this list is build capability metadata and a silent addition would
    // misstate what the deployment supports.
    expect(ENABLED_ANALYSIS_REQUIREMENTS).toEqual([
      {
        analyzerId: "rogue-assassination-observed-decisions",
        requiredScope: "PLAYER_CONTEXT",
        includeResources: true,
      },
      {
        analyzerId: "paladin-protection-observed-decisions",
        requiredScope: "PLAYER_CONTEXT",
        includeResources: true,
      },
      {
        analyzerId: "paladin-retribution-observed-decisions",
        requiredScope: "PLAYER_CONTEXT",
        includeResources: true,
      },
      {
        analyzerId: "deathknight-blood-observed-decisions",
        requiredScope: "PLAYER_CONTEXT",
        includeResources: true,
      },
      {
        analyzerId: "monk-brewmaster-observed-decisions",
        requiredScope: "PLAYER_CONTEXT",
        includeResources: true,
      },
      // M13-F: Augmentation Evoker, FULL_RAID by its declared support inputs, no resources.
      {
        analyzerId: "evoker-augmentation-support-observations",
        requiredScope: "FULL_RAID",
        includeResources: false,
      },
      {
        analyzerId: "shaman-restoration-healer-findings",
        requiredScope: "FULL_RAID",
        includeResources: false,
      },
    ]);
  });

  it("requires_ingestion_rather_than_reporting_it_missing", async () => {
    // Superseded the M6-B/M6-D seam. `ingest` is a required dependency now, so
    // "nobody wired retrieval" cannot be a runtime status — it does not compile.
    // What remains is that a retrieval FAILURE is reported as itself.
    const result = await analyzeFight(validInput, deps());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UPSTREAM_UNAVAILABLE");
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
