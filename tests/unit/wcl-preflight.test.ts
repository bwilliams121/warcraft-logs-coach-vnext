import { describe, expect, it } from "vitest";

import type { WclCredentials } from "../../src/config/env.js";
import { createPreflight } from "../../src/wcl/preflight.js";
import { createTokenCache } from "../../src/wcl/token-provider.js";
import {
  graphqlErrorBody,
  preflightBody,
  REQUEST,
  reportWithFight,
} from "../fixtures/wcl/preflight-payloads.js";
import { createWclFetch, jsonResponse, networkFailure, type FakeResponder } from "../support/fake-fetch.js";

const credentials: WclCredentials = {
  clientId: "SENTINEL_CLIENT_ID_DO_NOT_LEAK",
  clientSecret: "SENTINEL_CLIENT_SECRET_DO_NOT_LEAK",
  toJSON: () => ({ clientId: "[redacted]", clientSecret: "[redacted]" }),
};

function preflightOver(graphql: FakeResponder) {
  const fake = createWclFetch({ graphql });
  const port = createPreflight({
    fetch: fake.fetch,
    now: () => 1_000_000,
    // A fresh cache per test: the shared module-level cache is opportunistic
    // and must never be what makes a test pass.
    tokenCache: createTokenCache(),
  });
  return { fake, port };
}

describe("wcl preflight", () => {
  it("authenticates_then_queries_in_one_round_trip_each", async () => {
    const { fake, port } = preflightOver(() => jsonResponse(200, preflightBody()));

    const result = await port(REQUEST, credentials);

    expect(result.ok).toBe(true);
    expect(fake.tokenCalls()).toHaveLength(1);
    expect(fake.graphqlCalls()).toHaveLength(1);
    if (result.ok) {
      expect(result.identity.player.specName).toBe("Assassination");
      expect(result.rateLimit?.limitPerHour).toBe(3600);
    }
  });

  it("null_report_becomes_report_not_accessible", async () => {
    const { port } = preflightOver(() => jsonResponse(200, preflightBody(null)));

    const result = await port(REQUEST, credentials);

    expect(result.ok === false && result.failure.reason).toBe("REPORT_NOT_ACCESSIBLE");
  });

  it("identity_failures_are_reported_from_the_identity_stage", async () => {
    const { port } = preflightOver(() =>
      jsonResponse(
        200,
        preflightBody(reportWithFight({ friendlyPlayers: [16], friendlySpecs: ["Protection"] })),
      ),
    );

    const result = await port(REQUEST, credentials);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("SOURCE_NOT_IN_FIGHT");
      expect(result.failure.diagnostics.stage).toBe("IDENTITY");
    }
  });

  it("graphql_errors_never_become_an_absent_report", async () => {
    // The distinction that matters: "we could not retrieve it" must not read as
    // "it is not there".
    const { port } = preflightOver(() => jsonResponse(200, graphqlErrorBody()));

    const result = await port(REQUEST, credentials);

    expect(result.ok === false && result.failure.reason).toBe("UPSTREAM_DATA_INVALID");
  });

  it("network_failure_never_becomes_an_absent_report", async () => {
    const { port } = preflightOver(networkFailure);

    const result = await port(REQUEST, credentials);

    expect(result.ok === false && result.failure.reason).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("no_credential_or_token_appears_in_a_preflight_failure", async () => {
    const { port } = preflightOver(() => jsonResponse(500, { detail: "upstream detail" }));

    const result = await port(REQUEST, credentials);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("SENTINEL_CLIENT_SECRET_DO_NOT_LEAK");
    expect(serialized).not.toContain("SENTINEL_CLIENT_ID_DO_NOT_LEAK");
    expect(serialized).not.toContain("fake-access-token-not-real");
    expect(serialized).not.toContain("upstream detail");
  });
});
