import { describe, expect, it } from "vitest";

import { fail, pass } from "../support/corpus/executors/outcome.js";
import { runCorpusHarness, type AssertionExecutor } from "../support/corpus/harness.js";
import { loadConfig } from "../../src/config/env.js";
import { wclPreflight } from "../../src/wcl/preflight.js";

/**
 * NETWORK ISOLATION OF THE CORPUS BOUNDARY, PROVEN BY ATTEMPTING TO CROSS IT.
 *
 * The layering guard proves statically that no corpus module imports a live
 * transport. This file proves dynamically what happens if one did anyway: an
 * outbound call made from INSIDE a corpus execution — through the harness,
 * inside real workerd, exactly where every corpus case runs — does not reach
 * Warcraft Logs. It is answered locally, and the harness reports the attempt
 * as a FAILED assertion naming the case, so a corpus that has quietly started
 * depending on the network cannot pass by accident.
 *
 * Absence of credentials is deliberately NOT what this relies on. The Env the
 * corpus runs under carries sentinel credentials, so a call that could reach
 * the network would be made with something in the Authorization header. The
 * proof is that the call cannot get out at all.
 *
 * Runs in the workers project and is part of `npm run test:corpus`.
 */

const CASE = "normalization.no-actor-sentinel.source-absence";
const WCL_TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
const WCL_API_URL = "https://www.warcraftlogs.com/api/v2/client";

describe("nothing executed inside the corpus boundary can reach the network", { timeout: 30_000 }, () => {
  it("an executor that fetches Warcraft Logs is answered locally and reported as a FAILED assertion", async () => {
    let status: number | null = null;
    let body = "";
    const leaking: AssertionExecutor = async () => {
      const response = await fetch(WCL_API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer not-a-real-token" },
        body: JSON.stringify({ query: "{ rateLimitData { limitPerHour } }" }),
      });
      status = response.status;
      body = await response.text();
      if (response.ok) return pass();
      return fail(
        `outbound request left the corpus boundary and was refused: HTTP ${String(response.status)}`,
        {
          expected: "no outbound request",
          actual: { status: response.status, body },
        },
      );
    };

    const result = await runCorpusHarness(
      { kind: "CASE", caseId: CASE },
      { runtime: "WORKERD", execute: leaking },
    );
    if (!result.ok) throw new Error(result.stage);

    // The request never reached Warcraft Logs: workerd's outbound service
    // answered it with the test configuration's 503, not with anything upstream
    // could have said.
    expect(status).toBe(503);
    expect(body).toBe("outbound network is blocked in tests");
    // And the harness says so, actionably: which case, which assertion, what
    // was expected and what happened.
    expect(result.summary.failed).toBe(result.summary.assertions);
    expect(result.summary.passed).toBe(0);
    const first = result.results[0];
    expect(first?.caseId).toBe(CASE);
    expect(first?.status).toBe("FAILED");
    expect(first?.detail).toContain("outbound request left the corpus boundary");
    expect(first?.actual).toEqual({ status: 503, body: "outbound network is blocked in tests" });
  });

  it("the real live preflight port, invoked with sentinel credentials, fails closed as UPSTREAM_UNAVAILABLE", async () => {
    // The production transport composition itself, driven the way the deployed
    // Worker drives it. Its token request goes to the same outbound service,
    // so it cannot succeed here — and the failure is classified, never an
    // exception and never mistaken for a report that does not exist.
    const config = loadConfig({
      ENVIRONMENT: "test",
      WCL_CLIENT_ID: "fake-client-id-not-real",
      WCL_CLIENT_SECRET: "fake-client-secret-not-real",
      ANALYSIS_AUTH_TOKEN: "fake-analysis-token-not-real",
    });
    if (!config.ok) throw new Error("sentinel configuration did not load");
    const outcome = await wclPreflight(
      { reportCode: "aBcDeFgH12345678", fightId: 1, sourceId: 1 },
      config.config.wcl,
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.reason).toBe("UPSTREAM_UNAVAILABLE");
    expect(outcome.failure.diagnostics.stage).toBe("TOKEN");
    expect(outcome.failure.diagnostics.httpStatus).toBe(503);
  });

  it("the token endpoint itself is unreachable from workerd under test", async () => {
    const response = await fetch(WCL_TOKEN_URL, { method: "POST", body: "grant_type=client_credentials" });
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("outbound network is blocked in tests");
  });
});
