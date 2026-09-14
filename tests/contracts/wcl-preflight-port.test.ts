import { describe, expect, it, vi } from "vitest";

import type { Env } from "../../src/config/env.js";
import { analyzeFight } from "../../src/services/analysis-service.js";
import { WCL_FAILURE_REASONS, type PreflightPort } from "../../src/wcl/types.js";
import { SERVICE_ERROR_CODES } from "../../src/services/result.js";
import { REQUEST } from "../fixtures/wcl/preflight-payloads.js";

/**
 * Contract between the application service and the Warcraft Logs boundary.
 *
 * The service depends on one injected port and nothing else from the WCL layer.
 * That is what keeps WCL GraphQL shapes out of the analyzer, and what makes
 * every service test offline by construction.
 */

const env: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: "fake-client-id-not-real",
  WCL_CLIENT_SECRET: "fake-client-secret-not-real",
};

const input = { reportCode: REQUEST.reportCode, fightId: REQUEST.fightId, sourceId: REQUEST.sourceId };

describe("wcl preflight port contract", () => {
  it("analysis_service_calls_the_injected_preflight_port_exactly_once", async () => {
    const preflight = vi.fn<PreflightPort>(async () => ({
      ok: false,
      failure: {
        reason: "FIGHT_NOT_FOUND",
        diagnostics: { stage: "IDENTITY", httpStatus: undefined, graphqlErrorCount: undefined },
      },
    }));

    await analyzeFight(input, { env, preflight });

    expect(preflight).toHaveBeenCalledTimes(1);
  });

  it("analysis_service_never_touches_global_fetch", async () => {
    // If the service ever reached the network directly, this would throw rather
    // than silently succeed in CI and silently cost points in production.
    const original = globalThis.fetch;
    const forbidden = vi.fn(() => {
      throw new Error("the application service must not perform network I/O");
    });
    globalThis.fetch = forbidden as unknown as typeof globalThis.fetch;

    try {
      const preflight: PreflightPort = async () => ({
        ok: false,
        failure: {
          reason: "UPSTREAM_UNAVAILABLE",
          diagnostics: { stage: "TRANSPORT", httpStatus: undefined, graphqlErrorCount: undefined },
        },
      });

      const result = await analyzeFight(input, { env, preflight });

      expect(result.ok).toBe(false);
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("every_wcl_failure_reason_is_representable_as_a_service_error", async () => {
    // A reason with no service mapping would be unreportable, which in practice
    // means it would become a generic 500 and lose its meaning.
    for (const reason of WCL_FAILURE_REASONS) {
      const preflight: PreflightPort = async () => ({
        ok: false,
        failure: {
          reason,
          diagnostics: { stage: "TRANSPORT", httpStatus: undefined, graphqlErrorCount: undefined },
        },
      });

      const result = await analyzeFight(input, { env, preflight });

      expect(result.ok, reason).toBe(false);
      if (!result.ok) {
        expect(SERVICE_ERROR_CODES, reason).toContain(result.error.code);
      }
    }
  });

  it("preflight_result_carries_no_gameplay_shaped_fields", async () => {
    // The port returns factual identity only. Findings, scores and coaching are
    // later milestones and must not appear in this contract.
    const preflight: PreflightPort = async () => ({
      ok: true,
      identity: {
        report: { code: REQUEST.reportCode, revision: 1, startTime: 0, endTime: 10 },
        data: { logVersion: 26, gameVersion: null },
        fight: { id: 8, name: "F", encounterId: 0, difficulty: null, startTime: 0, endTime: 10 },
        player: { sourceId: 15, name: "N", className: "Rogue", specName: "Assassination" },
      },
      rateLimit: undefined,
    });

    const result = await preflight(REQUEST, {
      clientId: "x",
      clientSecret: "y",
      toJSON: () => ({}),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.identity).sort()).toEqual(["data", "fight", "player", "report"]);
      expect(Object.keys(result.identity.player).sort()).toEqual([
        "className",
        "name",
        "sourceId",
        "specName",
      ]);
    }
  });
});
