import { describe, expect, it } from "vitest";

import type { WclCredentials } from "../../src/config/env.js";
import { createGraphqlClient, type DecodeOutcome } from "../../src/wcl/graphql-client.js";
import { createTokenCache, createTokenProvider } from "../../src/wcl/token-provider.js";
import { countOutbound, THROWN_ERROR_NAMES } from "../../src/wcl/types.js";
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

  // ---- M11-A5 diagnostics: fixed-shape facts about a failed attempt ----
  //
  // These exist because a production raid night failed at its final revision
  // read with every distinction below already known to this client and then
  // discarded. The rules: a thrown fetch keeps its closed-vocabulary NAME and a
  // timeout flag, never its message; every failure keeps the outbound ordinal
  // when the bound fetch counts; existing classifications do not move.

  function thrower(error: unknown): FakeFetch {
    return createWclFetch({
      graphql: () => {
        throw error;
      },
    });
  }

  it("a_timeout_of_the_clients_own_abort_signal_is_distinguishable_from_a_generic_fetch_failure", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    const timedOut = await execute(thrower(timeout));
    expect(timedOut.ok).toBe(false);
    if (timedOut.ok) return;
    expect(timedOut.failure.reason).toBe("UPSTREAM_UNAVAILABLE");
    expect(timedOut.failure.diagnostics).toMatchObject({
      stage: "TRANSPORT",
      httpStatus: undefined,
      errorName: "TimeoutError",
      isTimeout: true,
    });

    const network = await execute(thrower(new TypeError("network failure (simulated)")));
    expect(network.ok).toBe(false);
    if (network.ok) return;
    expect(network.failure.reason).toBe("UPSTREAM_UNAVAILABLE");
    expect(network.failure.diagnostics).toMatchObject({ errorName: "TypeError", isTimeout: false });

    // The older AbortError spelling of a timeout is a timeout too.
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    const abortedOutcome = await execute(thrower(aborted));
    expect(abortedOutcome.ok === false && abortedOutcome.failure.diagnostics.isTimeout).toBe(true);
  });

  it("a_thrown_error_keeps_only_a_closed_vocabulary_name_and_never_its_message", async () => {
    // An error whose NAME and MESSAGE both carry secret-shaped text: the name
    // is outside the vocabulary and becomes OTHER; the message is never read.
    const hostile = new Error(`leaked ${SENTINEL_SECRET} ${SENTINEL_TOKEN}`);
    hostile.name = `Bearer ${SENTINEL_TOKEN}`;
    const outcome = await execute(thrower(hostile));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.diagnostics.errorName).toBe("OTHER");
    expect(outcome.failure.diagnostics.isTimeout).toBe(false);
    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain(SENTINEL_SECRET);
    expect(serialized).not.toContain(SENTINEL_TOKEN);
    expect(serialized).not.toContain("leaked");
    expect(serialized).not.toContain("Bearer");
    // Non-Error throws are OTHER as well, and the thrown value never rides along.
    const primitive = await execute(thrower(`thrown string ${SENTINEL_SECRET}`));
    expect(primitive.ok === false && primitive.failure.diagnostics.errorName).toBe("OTHER");
    expect(JSON.stringify(primitive)).not.toContain(SENTINEL_SECRET);
    // Every recordable name is a member of the closed list.
    for (const name of THROWN_ERROR_NAMES) expect(name).toMatch(/^[A-Za-z]+$/);
  });

  it("http_403_429_and_other_statuses_keep_their_classification_and_gain_the_outbound_ordinal", async () => {
    for (const [status, reason] of [
      [403, "UPSTREAM_AUTH_FAILED"],
      [429, "UPSTREAM_RATE_LIMITED"],
      [500, "UPSTREAM_UNAVAILABLE"],
      [502, "UPSTREAM_UNAVAILABLE"],
    ] as const) {
      const fake = createWclFetch({ graphql: () => jsonResponse(status, {}) });
      const counting = countOutbound(fake.fetch);
      const tokens = createTokenProvider({
        credentials,
        fetch: counting,
        now: () => 1_000_000,
        cache: createTokenCache(),
      });
      const outcome = await createGraphqlClient({ tokens, fetch: counting }).execute({
        query: "query {}",
        variables: { code: "abc" },
        decode: passthrough,
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) continue;
      expect(outcome.failure.reason).toBe(reason);
      expect(outcome.failure.diagnostics.httpStatus).toBe(status);
      // Token request first (1), then this GraphQL request (2).
      expect(outcome.failure.diagnostics.outboundIndex).toBe(2);
      expect(outcome.failure.diagnostics.errorName).toBeUndefined();
      expect(outcome.failure.diagnostics.isTimeout).toBeUndefined();
      expect(fake.graphqlCalls()).toHaveLength(1);
    }
  });

  it("graphql_errors_and_decode_failures_keep_their_classification_and_stage", async () => {
    const errors = await execute(
      createWclFetch({ graphql: () => jsonResponse(200, { errors: [{ message: "x" }, { message: "y" }] }) }),
    );
    expect(errors.ok === false && errors.failure.reason).toBe("UPSTREAM_DATA_INVALID");
    expect(errors.ok === false && errors.failure.diagnostics).toMatchObject({
      stage: "TRANSPORT",
      httpStatus: 200,
      graphqlErrorCount: 2,
      errorName: undefined,
      isTimeout: undefined,
    });
    const decode = await execute(createWclFetch({ graphql: () => jsonResponse(200, { data: {} }) }), () => ({
      ok: false,
    }));
    expect(decode.ok === false && decode.failure.reason).toBe("UPSTREAM_DATA_INVALID");
    expect(decode.ok === false && decode.failure.diagnostics.stage).toBe("DECODE");
    const malformed = await execute(createWclFetch({ graphql: () => rawResponse(200, "{ not json") }));
    expect(malformed.ok === false && malformed.failure.reason).toBe("UPSTREAM_DATA_INVALID");
  });

  it("the_outbound_ordinal_is_absent_when_the_bound_fetch_does_not_count_and_counts_every_request_when_it_does", async () => {
    const plain = await execute(thrower(new TypeError("no")));
    expect(plain.ok === false && plain.failure.diagnostics.outboundIndex).toBeUndefined();

    const fake = createWclFetch({ graphql: networkFailure });
    const counting = countOutbound(fake.fetch);
    const tokens = createTokenProvider({
      credentials,
      fetch: counting,
      now: () => 1_000_000,
      cache: createTokenCache(),
    });
    const client = createGraphqlClient({ tokens, fetch: counting });
    const first = await client.execute({ query: "query {}", variables: {}, decode: passthrough });
    const second = await client.execute({ query: "query {}", variables: {}, decode: passthrough });
    // Token (1), GraphQL (2), GraphQL (3): the cached token is not re-minted.
    expect(first.ok === false && first.failure.diagnostics.outboundIndex).toBe(2);
    expect(second.ok === false && second.failure.diagnostics.outboundIndex).toBe(3);
    expect(counting.outboundCount()).toBe(3);
    // Counting changes nothing about what was sent.
    expect(fake.calls.map((call) => call.url)).toEqual(fake.calls.map((call) => call.url));
    expect(fake.tokenCalls()).toHaveLength(1);
    expect(fake.graphqlCalls()).toHaveLength(2);
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
