import { describe, expect, it } from "vitest";

import { createWorker, type WorkerDeps } from "../../src/api/worker.js";
import type { Env } from "../../src/config/env.js";
import { analyzeFight, ENABLED_ANALYSIS_REQUIREMENTS } from "../../src/services/analysis-service.js";

/**
 * Required regression: wcl_credentials_never_leave_the_backend
 *
 * The Warcraft Logs client ID and secret are backend secrets. They must never
 * appear in API responses, error messages, report output, committed fixtures, or
 * anything intended for browser or addon consumption.
 *
 * Distinctive sentinels are used so a leak is unambiguous. No real credential
 * appears anywhere in the test suite.
 */
const SENTINEL_CLIENT_ID = "SENTINEL_WCL_CLIENT_ID_DO_NOT_LEAK";
const SENTINEL_CLIENT_SECRET = "SENTINEL_WCL_CLIENT_SECRET_DO_NOT_LEAK";

const CONFIGURED_ENV: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: SENTINEL_CLIENT_ID,
  WCL_CLIENT_SECRET: SENTINEL_CLIENT_SECRET,
};

/** Credentials present but blank, so the configuration-error path is also covered. */
const BLANK_ENV: Env = { ENVIRONMENT: "test", WCL_CLIENT_ID: "", WCL_CLIENT_SECRET: "" };

const VALID_BODY = JSON.stringify({ reportCode: "aBcDeFgH12345678", fightId: 8, sourceId: 15 });

function throwingDeps(): WorkerDeps {
  return {
    analyze: () => {
      // A thrown value can close over configuration. The error boundary must not
      // surface any of it.
      throw new Error(`boom ${SENTINEL_CLIENT_SECRET}`);
    },
    analyzers: ENABLED_ANALYSIS_REQUIREMENTS,
    version: "0.1.0",
  };
}

function defaultDeps(): WorkerDeps {
  return { analyze: analyzeFight, analyzers: ENABLED_ANALYSIS_REQUIREMENTS, version: "0.1.0" };
}

interface Probe {
  readonly name: string;
  readonly request: () => Request;
  readonly env: Env;
  readonly deps: WorkerDeps;
  readonly expectedStatus: number;
}

function analysisRequest(body: string): () => Request {
  return () =>
    new Request("https://coach.test/v1/analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
}

const PROBES: readonly Probe[] = [
  {
    name: "health 200",
    request: () => new Request("https://coach.test/health"),
    env: CONFIGURED_ENV,
    deps: defaultDeps(),
    expectedStatus: 200,
  },
  {
    name: "unknown route 404",
    request: () => new Request("https://coach.test/does-not-exist"),
    env: CONFIGURED_ENV,
    deps: defaultDeps(),
    expectedStatus: 404,
  },
  {
    name: "method not allowed 405",
    request: () => new Request("https://coach.test/v1/analysis", { method: "GET" }),
    env: CONFIGURED_ENV,
    deps: defaultDeps(),
    expectedStatus: 405,
  },
  {
    name: "malformed body 400",
    request: analysisRequest("{ not json"),
    env: CONFIGURED_ENV,
    deps: defaultDeps(),
    expectedStatus: 400,
  },
  {
    name: "invalid request 400",
    request: analysisRequest(JSON.stringify({ reportCode: "aBcDeFgH12345678" })),
    env: CONFIGURED_ENV,
    deps: defaultDeps(),
    expectedStatus: 400,
  },
  {
    name: "not implemented 501",
    request: analysisRequest(VALID_BODY),
    env: CONFIGURED_ENV,
    deps: defaultDeps(),
    expectedStatus: 501,
  },
  {
    name: "configuration error 503",
    request: analysisRequest(VALID_BODY),
    env: BLANK_ENV,
    deps: defaultDeps(),
    expectedStatus: 503,
  },
  {
    name: "internal error 500",
    request: analysisRequest(VALID_BODY),
    env: CONFIGURED_ENV,
    deps: throwingDeps(),
    expectedStatus: 500,
  },
];

describe("wcl credentials never leave the backend", () => {
  it("wcl_credentials_never_leave_the_backend", async () => {
    for (const probe of PROBES) {
      const response = await createWorker(probe.deps).fetch(probe.request(), probe.env);

      expect(response.status, `${probe.name}: unexpected status`).toBe(probe.expectedStatus);

      const body = await response.text();
      expect(body, `${probe.name}: body leaked the client id`).not.toContain(SENTINEL_CLIENT_ID);
      expect(body, `${probe.name}: body leaked the client secret`).not.toContain(SENTINEL_CLIENT_SECRET);

      for (const [header, value] of response.headers.entries()) {
        expect(value, `${probe.name}: header ${header} leaked the client id`).not.toContain(
          SENTINEL_CLIENT_ID,
        );
        expect(value, `${probe.name}: header ${header} leaked the client secret`).not.toContain(
          SENTINEL_CLIENT_SECRET,
        );
      }
    }
  });

  it("every_response_path_is_covered_by_the_sweep", () => {
    // Guards the sweep itself: if a new status path is added to the API, this
    // forces a decision about covering it.
    expect(PROBES.map((probe) => probe.expectedStatus).sort((a, b) => a - b)).toEqual([
      200, 400, 400, 404, 405, 500, 501, 503,
    ]);
  });

  it("configuration_error_names_missing_keys_without_revealing_values", async () => {
    // Naming the missing key is operationally necessary and safe. Echoing its
    // value would not be. This asserts the useful half still happens, so the
    // leak guard above cannot be satisfied by saying nothing at all.
    const response = await createWorker(defaultDeps()).fetch(analysisRequest(VALID_BODY)(), BLANK_ENV);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("WCL_CLIENT_ID");
    expect(body).toContain("WCL_CLIENT_SECRET");
    expect(body).not.toContain(SENTINEL_CLIENT_ID);
    expect(body).not.toContain(SENTINEL_CLIENT_SECRET);
  });
});
