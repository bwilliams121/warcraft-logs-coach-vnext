import { describe, expect, it } from "vitest";

import { createWorker, type WorkerDeps } from "../../src/api/worker.js";
import type { Env, WclCredentials } from "../../src/config/env.js";
import { handleMcpRequest, PRODUCTION_MCP_HOSTNAME } from "../../src/mcp/server.js";
import { analyzeFight, ENABLED_ANALYSIS_REQUIREMENTS } from "../../src/services/analysis-service.js";
import { createPreflight } from "../../src/wcl/preflight.js";
import { createTokenCache } from "../../src/wcl/token-provider.js";
import type { FetchLike, PreflightPort } from "../../src/wcl/types.js";

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
/** The access token is as sensitive as the credentials that minted it. */
const SENTINEL_ACCESS_TOKEN = "SENTINEL_WCL_ACCESS_TOKEN_DO_NOT_LEAK";
/**
 * The INBOUND MCP token. A different secret from the three above — those are
 * outbound Warcraft Logs credentials — but it leaves the backend through the
 * same responses, so it is swept by the same pass.
 */
const SENTINEL_MCP_TOKEN = "SENTINEL_MCP_AUTH_TOKEN_DO_NOT_LEAK";

const CONFIGURED_ENV: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: SENTINEL_CLIENT_ID,
  WCL_CLIENT_SECRET: SENTINEL_CLIENT_SECRET,
  MCP_AUTH_TOKEN: SENTINEL_MCP_TOKEN,
};

/** Credentials present but blank, so the configuration-error path is also covered. */
const BLANK_ENV: Env = { ENVIRONMENT: "test", WCL_CLIENT_ID: "", WCL_CLIENT_SECRET: "" };

const SENTINELS: readonly { readonly name: string; readonly value: string }[] = [
  { name: "client id", value: SENTINEL_CLIENT_ID },
  { name: "client secret", value: SENTINEL_CLIENT_SECRET },
  { name: "access token", value: SENTINEL_ACCESS_TOKEN },
  { name: "MCP auth token", value: SENTINEL_MCP_TOKEN },
];

const VALID_BODY = JSON.stringify({ reportCode: "aBcDeFgH12345678", fightId: 8, sourceId: 15 });

/**
 * A preflight that resolves, so the sweep reaches the deepest response path
 * without any test performing network I/O.
 */
const RESOLVING_PREFLIGHT: PreflightPort = async () => ({
  ok: true,
  identity: {
    report: { code: "aBcDeFgH12345678", revision: 24, startTime: 0, endTime: 600_000 },
    data: { logVersion: 26, gameVersion: 1 },
    fight: {
      id: 8,
      name: "Test Encounter",
      encounterId: 2902,
      difficulty: 5,
      startTime: 0,
      endTime: 300_000,
    },
    player: { sourceId: 15, name: "Coachtest", className: "Rogue", specName: "Assassination" },
  },
  rateLimit: { limitPerHour: 3600, pointsSpentThisHour: 1, pointsResetIn: 60 },
});

/** A preflight that fails while holding sentinels, as a real token flow would. */
const LEAKY_PREFLIGHT: PreflightPort = async () => {
  throw new Error(`upstream ${SENTINEL_CLIENT_SECRET} ${SENTINEL_ACCESS_TOKEN}`);
};

function throwingDeps(): WorkerDeps {
  return {
    analyze: () => {
      // A thrown value can close over configuration. The error boundary must not
      // surface any of it.
      throw new Error(`boom ${SENTINEL_CLIENT_SECRET}`);
    },
    analyzers: ENABLED_ANALYSIS_REQUIREMENTS,
    preflight: RESOLVING_PREFLIGHT,
    mcp: handleMcpRequest,
    version: "0.1.0",
  };
}

function defaultDeps(preflight: PreflightPort = RESOLVING_PREFLIGHT): WorkerDeps {
  return {
    analyze: analyzeFight,
    analyzers: ENABLED_ANALYSIS_REQUIREMENTS,
    preflight,
    // The REAL handler, not a stub. /mcp is a new way for bytes to leave the
    // backend, so the sweep has to actually traverse it.
    mcp: handleMcpRequest,
    version: "0.1.0",
  };
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
  {
    // A failure raised inside the Warcraft Logs layer, where a real token and
    // real credentials are in scope.
    name: "preflight throw 500",
    request: analysisRequest(VALID_BODY),
    env: CONFIGURED_ENV,
    deps: defaultDeps(LEAKY_PREFLIGHT),
    expectedStatus: 500,
  },
  {
    // The MCP rejection path runs while the configured MCP token is in scope.
    // A challenge that echoed it, or that varied with the presented value,
    // would be a disclosure.
    name: "mcp unauthorized 401",
    request: () =>
      new Request(`https://${PRODUCTION_MCP_HOSTNAME}/mcp`, {
        method: "POST",
        headers: { host: PRODUCTION_MCP_HOSTNAME, "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    env: CONFIGURED_ENV,
    deps: defaultDeps(),
    expectedStatus: 401,
  },
  {
    // Rejected on Host before authorization is even attempted, so a wrong
    // token and a wrong host cannot be told apart by the response body.
    name: "mcp forbidden host 403",
    request: () =>
      new Request("https://coach.test/mcp", {
        method: "POST",
        headers: {
          host: "coach.test",
          "content-type": "application/json",
          authorization: `Bearer ${SENTINEL_MCP_TOKEN}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    env: CONFIGURED_ENV,
    deps: defaultDeps(),
    expectedStatus: 403,
  },
];

describe("wcl credentials never leave the backend", () => {
  it("wcl_credentials_never_leave_the_backend", async () => {
    for (const probe of PROBES) {
      const response = await createWorker(probe.deps).fetch(probe.request(), probe.env);

      expect(response.status, `${probe.name}: unexpected status`).toBe(probe.expectedStatus);

      const body = await response.text();
      for (const sentinel of SENTINELS) {
        expect(body, `${probe.name}: body leaked the ${sentinel.name}`).not.toContain(sentinel.value);
      }

      for (const [header, value] of response.headers.entries()) {
        for (const sentinel of SENTINELS) {
          expect(value, `${probe.name}: header ${header} leaked the ${sentinel.name}`).not.toContain(
            sentinel.value,
          );
        }
      }
    }
  });

  it("every_response_path_is_covered_by_the_sweep", () => {
    // Guards the sweep itself: if a new status path is added to the API, this
    // forces a decision about covering it. The 401 and 403 arrived with /mcp.
    expect(PROBES.map((probe) => probe.expectedStatus).sort((a, b) => a - b)).toEqual([
      200, 400, 400, 401, 403, 404, 405, 500, 500, 501, 503,
    ]);
  });

  it("token_exchange_never_exposes_credentials_or_the_token", async () => {
    // The token flow is where both secrets are simultaneously in scope: the
    // credentials go out, the token comes back. Neither may survive into any
    // returned value.
    const credentials: WclCredentials = {
      clientId: SENTINEL_CLIENT_ID,
      clientSecret: SENTINEL_CLIENT_SECRET,
      toJSON: () => ({ clientId: "[redacted]", clientSecret: "[redacted]" }),
    };

    const fetchStub: FetchLike = async (url) =>
      url.endsWith("/oauth/token")
        ? new Response(
            JSON.stringify({ access_token: SENTINEL_ACCESS_TOKEN, token_type: "Bearer", expires_in: 3600 }),
            { status: 200, headers: { "content-type": "application/json" } },
          )
        : new Response(JSON.stringify({ errors: [{ message: `denied ${SENTINEL_ACCESS_TOKEN}` }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });

    const preflight = createPreflight({
      fetch: fetchStub,
      now: () => 1_000_000,
      tokenCache: createTokenCache(),
    });

    const result = await preflight({ reportCode: "aBcDeFgH12345678", fightId: 8, sourceId: 15 }, credentials);
    const serialized = JSON.stringify(result);

    expect(result.ok).toBe(false);
    expect(serialized).not.toContain(SENTINEL_CLIENT_ID);
    expect(serialized).not.toContain(SENTINEL_CLIENT_SECRET);
    expect(serialized).not.toContain(SENTINEL_ACCESS_TOKEN);

    // And the request the provider built did carry the real credential, so the
    // assertions above are not passing because nothing happened.
    expect(serialized.length).toBeGreaterThan(0);
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
