import { describe, expect, it } from "vitest";

import { createWorker, type WorkerDeps } from "../../src/api/worker.js";
import type { Env } from "../../src/config/env.js";
import { analyzeFight } from "../../src/services/analysis-service.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import { wclFailure, type PreflightPort, type WclFailureReason } from "../../src/wcl/types.js";
import { WCL_FAILURE_REASONS } from "../../src/wcl/types.js";
import { REQUEST } from "../fixtures/wcl/preflight-payloads.js";

/**
 * A Warcraft Logs failure must never be readable as an analysis.
 *
 * The failure mode this guards: a retrieval problem returns a well-formed,
 * empty-looking success, and the player reads "nothing to fix" as confirmation
 * of clean play. Absence of analysis is not evidence of good play.
 */

const ENV: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: "fake-client-id-not-real",
  WCL_CLIENT_SECRET: "fake-client-secret-not-real",
  ANALYSIS_AUTH_TOKEN: "fake-analysis-token-not-real",
};

const VALID_BODY = {
  reportCode: REQUEST.reportCode,
  fightId: REQUEST.fightId,
  sourceId: REQUEST.sourceId,
};

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

function failingPreflight(reason: WclFailureReason): PreflightPort {
  return async () => ({ ok: false, failure: wclFailure(reason, "TRANSPORT", { httpStatus: 500 }) });
}

/** Retrieval that must never run: every probe here fails at preflight. */
const UNREACHABLE_INGEST: CombatIngestionPort = () => {
  throw new Error("ingestion must not run after a preflight failure");
};

function workerWith(preflight: PreflightPort): WorkerDeps {
  return {
    analysisRunner: (env) => async (input) =>
      await analyzeFight(input, { env, preflight, ingest: UNREACHABLE_INGEST }),
    rateLimiter: () => ({ limit: async () => ({ success: true }) }),
    // Every probe here posts to /v1/analysis. Reaching MCP would mean the
    // router sent an analysis request somewhere it does not belong.
    // Not exercised here. Stubbed fail-closed rather than omitted, so a
    // single-fight fixture cannot silently reach the raid-night path.
    raidNightRunner: () => async () => ({
      ok: false as const,
      error: { code: "INTERNAL_ERROR" as const, message: "raid-night runner not bound here" },
    }),
    encounterContextRunner: () => async () => ({
      ok: false as const,
      error: { code: "INTERNAL_ERROR" as const, message: "encounter-context runner not bound here" },
    }),
    mcp: () => {
      throw new Error("the analysis route must not dispatch to MCP");
    },
    version: "0.1.0",
  };
}

function post(body: unknown): Request {
  return new Request("https://coach.test/v1/analysis", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer fake-analysis-token-not-real",
    },
    body: JSON.stringify(body),
  });
}

describe("wcl failure never looks like analysis", () => {
  it("every_wcl_failure_returns_a_non_2xx_status", async () => {
    for (const reason of WCL_FAILURE_REASONS) {
      const response = await createWorker(workerWith(failingPreflight(reason))).fetch(post(VALID_BODY), ENV);

      expect(response.status, reason).toBeGreaterThanOrEqual(400);
      expect(response.status, reason).toBeLessThan(600);

      const body = (await response.json()) as { ok: boolean };
      expect(body.ok, reason).toBe(false);
    }
  });

  it("no_wcl_failure_body_contains_gameplay_keys", async () => {
    for (const reason of WCL_FAILURE_REASONS) {
      const response = await createWorker(workerWith(failingPreflight(reason))).fetch(post(VALID_BODY), ENV);
      const keys = collectKeys(await response.json());

      for (const forbidden of [
        "findings",
        "coaching",
        "score",
        "tldr",
        "summary",
        "dps",
        "uptime",
        "rotation",
        "identity",
        "player",
        "fight",
      ]) {
        expect(keys, `${reason} response must not carry "${forbidden}"`).not.toContain(forbidden);
      }
      expect(keys.sort()).toEqual(["code", "error", "message", "ok"]);
    }
  });

  it("no_response_body_contains_rate_limit_fields", async () => {
    // Rate-limit data is operational metadata about our API client. It is
    // retrieved on the same round trip, kept internal, and never published.
    const preflight: PreflightPort = async () => ({
      ok: true,
      identity: {
        report: { code: REQUEST.reportCode, revision: 1, startTime: 0, endTime: 10 },
        data: { logVersion: 26, gameVersion: 1 },
        fight: { id: 8, name: "Test Encounter", encounterId: 2902, difficulty: 5, startTime: 0, endTime: 10 },
        player: { sourceId: 15, name: "Coachtest", className: "Rogue", specName: "Assassination" },
      },
      rateLimit: { limitPerHour: 3600, pointsSpentThisHour: 12.5, pointsResetIn: 1800 },
    });

    const response = await createWorker(workerWith(preflight)).fetch(post(VALID_BODY), ENV);
    const raw = await response.text();
    const keys = collectKeys(JSON.parse(raw));

    for (const forbidden of ["rateLimit", "limitPerHour", "pointsSpentThisHour", "pointsResetIn"]) {
      expect(keys).not.toContain(forbidden);
    }
    expect(raw).not.toContain("3600");
    expect(response.headers.get("retry-after")).toBeNull();
  });

  it("rate_limited_response_discloses_no_account_usage_details", async () => {
    const response = await createWorker(workerWith(failingPreflight("UPSTREAM_RATE_LIMITED"))).fetch(
      post(VALID_BODY),
      ENV,
    );
    const raw = await response.text();

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeNull();
    for (const forbidden of ["points", "limitPerHour", "quota"]) {
      expect(raw.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("upstream_failure_is_never_reported_as_not_implemented", async () => {
    // "Analysis is not implemented" would hide a real retrieval failure behind
    // a milestone excuse.
    for (const reason of WCL_FAILURE_REASONS) {
      const response = await createWorker(workerWith(failingPreflight(reason))).fetch(post(VALID_BODY), ENV);
      const body = (await response.json()) as { error: { code: string } };

      expect(body.error.code, reason).not.toBe("ANALYSIS_NOT_IMPLEMENTED");
      expect(response.status, reason).not.toBe(501);
    }
  });
});
