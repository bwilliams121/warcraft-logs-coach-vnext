import { describe, expect, it } from "vitest";

import type { WclCredentials } from "../../src/config/env.js";
import { createGraphqlClient, type DecodeOutcome } from "../../src/wcl/graphql-client.js";
import { createTokenCache, createTokenProvider } from "../../src/wcl/token-provider.js";
import { preflightBody } from "../fixtures/wcl/preflight-payloads.js";
import {
  createWclFetch,
  GRAPHQL_URL,
  jsonResponse,
  networkFailure,
  rawResponse,
  respondInSequence,
  type FakeFetch,
  type FakeResponder,
} from "../support/fake-fetch.js";

const SENTINEL_SECRET = "SENTINEL_CLIENT_SECRET_DO_NOT_LEAK";
const SENTINEL_TOKEN = "SENTINEL_ACCESS_TOKEN_DO_NOT_LEAK";

const credentials: WclCredentials = {
  clientId: "SENTINEL_CLIENT_ID_DO_NOT_LEAK",
  clientSecret: SENTINEL_SECRET,
  toJSON: () => ({ clientId: "[redacted]", clientSecret: "[redacted]" }),
};

/** Accepts anything: these tests are about transport, not schema. */
const passthrough = (data: unknown): DecodeOutcome<unknown> => ({ ok: true, value: data });

/** A client over a fresh token cache, so no test depends on another's token. */
function clientOver(fake: FakeFetch) {
  const tokens = createTokenProvider({
    credentials,
    fetch: fake.fetch,
    now: () => 1_000_000,
    cache: createTokenCache(),
  });
  return createGraphqlClient({ tokens, fetch: fake.fetch });
}

async function execute(fake: FakeFetch, decode = passthrough) {
  return await clientOver(fake).execute({ query: "query {}", variables: { code: "abc" }, decode });
}

describe("wcl graphql client", () => {
  it("sends_bearer_authorization_and_json_body", async () => {
    const fake = createWclFetch({
      accessToken: SENTINEL_TOKEN,
      graphql: () => jsonResponse(200, preflightBody()),
    });

    const outcome = await execute(fake);

    expect(outcome.ok).toBe(true);
    const request = fake.graphqlCalls()[0];
    expect(request?.url).toBe(GRAPHQL_URL);
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("authorization")).toBe(`Bearer ${SENTINEL_TOKEN}`);
    expect(request?.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(request?.body ?? "{}")).toEqual({ query: "query {}", variables: { code: "abc" } });
  });

  it("extracts_rate_limit_metadata_without_an_extra_round_trip", async () => {
    const fake = createWclFetch({ graphql: () => jsonResponse(200, preflightBody()) });

    const outcome = await execute(fake);

    expect(fake.graphqlCalls()).toHaveLength(1);
    expect(outcome.ok && outcome.rateLimit).toEqual({
      limitPerHour: 3600,
      pointsSpentThisHour: 12.5,
      pointsResetIn: 1800,
    });
  });

  it("graphql_errors_with_http_200_are_not_success", async () => {
    // HTTP-level success is not data success. An errors[] response must never
    // reach a decoder as though it were a report.
    const fake = createWclFetch({
      graphql: () => jsonResponse(200, { errors: [{ message: "boom" }, { message: "boom" }], data: null }),
    });

    const outcome = await execute(fake);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.reason).toBe("UPSTREAM_DATA_INVALID");
      expect(outcome.failure.diagnostics.graphqlErrorCount).toBe(2);
    }
  });

  it("graphql_error_text_is_never_used_to_classify_a_failure", async () => {
    // No permission-error contract is invented from prose. A message that says
    // "private" must not become REPORT_NOT_ACCESSIBLE.
    const fake = createWclFetch({
      graphql: () =>
        jsonResponse(200, {
          errors: [{ message: "You do not have permission to view this private report." }],
          data: null,
        }),
    });

    const outcome = await execute(fake);

    expect(outcome.ok === false && outcome.failure.reason).toBe("UPSTREAM_DATA_INVALID");
  });

  it("http_500_is_upstream_unavailable", async () => {
    const fake = createWclFetch({ graphql: () => jsonResponse(500, {}) });
    const outcome = await execute(fake);

    expect(outcome.ok === false && outcome.failure.reason).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("http_429_is_rate_limited_and_is_not_retried", async () => {
    const fake = createWclFetch({ graphql: () => jsonResponse(429, {}) });
    const outcome = await execute(fake);

    expect(outcome.ok === false && outcome.failure.reason).toBe("UPSTREAM_RATE_LIMITED");
    expect(fake.graphqlCalls()).toHaveLength(1);
  });

  it("malformed_json_body_fails_closed", async () => {
    const fake = createWclFetch({ graphql: () => rawResponse(200, "{ not json") });
    const outcome = await execute(fake);

    expect(outcome.ok === false && outcome.failure.reason).toBe("UPSTREAM_DATA_INVALID");
  });

  it("network_rejection_is_upstream_unavailable", async () => {
    const fake = createWclFetch({ graphql: networkFailure });
    const outcome = await execute(fake);

    expect(outcome.ok === false && outcome.failure.reason).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("decode_failure_is_upstream_data_invalid", async () => {
    const fake = createWclFetch({ graphql: () => jsonResponse(200, { data: { unexpected: true } }) });
    const outcome = await execute(fake, () => ({ ok: false }));

    expect(outcome.ok === false && outcome.failure.reason).toBe("UPSTREAM_DATA_INVALID");
    expect(outcome.ok === false && outcome.failure.diagnostics.stage).toBe("DECODE");
  });

  it("http_401_on_a_cached_token_refreshes_once_and_retries_once", async () => {
    const graphql: FakeResponder = respondInSequence([
      () => jsonResponse(401, {}),
      () => jsonResponse(200, preflightBody()),
    ]);
    const fake = createWclFetch({ graphql });
    const cache = createTokenCache();
    const tokens = createTokenProvider({ credentials, fetch: fake.fetch, now: () => 1_000_000, cache });
    const client = createGraphqlClient({ tokens, fetch: fake.fetch });

    // Prime the cache so the next execute() uses a CACHED token.
    await tokens.getToken();
    expect(fake.tokenCalls()).toHaveLength(1);

    const outcome = await client.execute({ query: "q", variables: {}, decode: passthrough });

    expect(outcome.ok).toBe(true);
    // Exactly one refresh and exactly one retry.
    expect(fake.tokenCalls()).toHaveLength(2);
    expect(fake.graphqlCalls()).toHaveLength(2);
  });

  it("http_401_on_a_freshly_minted_token_does_not_retry", async () => {
    // A token minted moments ago and rejected means the credentials are
    // rejected. Retrying would only double the failure.
    const fake = createWclFetch({ graphql: () => jsonResponse(401, {}) });
    const outcome = await execute(fake);

    expect(outcome.ok === false && outcome.failure.reason).toBe("UPSTREAM_AUTH_FAILED");
    expect(fake.tokenCalls()).toHaveLength(1);
    expect(fake.graphqlCalls()).toHaveLength(1);
  });

  it("http_403_does_not_trigger_a_token_refresh_or_retry", async () => {
    const fake = createWclFetch({ graphql: () => jsonResponse(403, {}) });
    const cache = createTokenCache();
    const tokens = createTokenProvider({ credentials, fetch: fake.fetch, now: () => 1_000_000, cache });
    const client = createGraphqlClient({ tokens, fetch: fake.fetch });

    await tokens.getToken();
    const outcome = await client.execute({ query: "q", variables: {}, decode: passthrough });

    expect(outcome.ok === false && outcome.failure.reason).toBe("UPSTREAM_AUTH_FAILED");
    // The token was never re-minted: a 403 is not a stale-token signal.
    expect(fake.tokenCalls()).toHaveLength(1);
    expect(fake.graphqlCalls()).toHaveLength(1);
  });

  it("a_second_401_after_refresh_stops_rather_than_looping", async () => {
    const fake = createWclFetch({ graphql: () => jsonResponse(401, {}) });
    const cache = createTokenCache();
    const tokens = createTokenProvider({ credentials, fetch: fake.fetch, now: () => 1_000_000, cache });
    const client = createGraphqlClient({ tokens, fetch: fake.fetch });

    await tokens.getToken();
    const outcome = await client.execute({ query: "q", variables: {}, decode: passthrough });

    expect(outcome.ok === false && outcome.failure.reason).toBe("UPSTREAM_AUTH_FAILED");
    expect(fake.graphqlCalls()).toHaveLength(2);
    expect(fake.tokenCalls()).toHaveLength(2);
  });

  it("token_failure_short_circuits_the_query", async () => {
    const fake = createWclFetch({
      token: () => jsonResponse(401, {}),
      graphql: () => jsonResponse(200, preflightBody()),
    });

    const outcome = await execute(fake);

    expect(outcome.ok === false && outcome.failure.reason).toBe("UPSTREAM_AUTH_FAILED");
    expect(fake.graphqlCalls()).toHaveLength(0);
  });

  it("upstream_text_and_credentials_never_appear_in_a_failure", async () => {
    const fake = createWclFetch({
      accessToken: SENTINEL_TOKEN,
      graphql: () => jsonResponse(200, { errors: [{ message: `leaked ${SENTINEL_SECRET}` }] }),
    });

    const outcome = await execute(fake);
    const serialized = JSON.stringify(outcome);

    expect(serialized).not.toContain(SENTINEL_SECRET);
    expect(serialized).not.toContain(SENTINEL_TOKEN);
    expect(serialized).not.toContain("leaked");
  });
});
