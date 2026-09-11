import { describe, expect, it } from "vitest";

import type { WclCredentials } from "../../src/config/env.js";
import { createTokenCache, createTokenProvider, TOKEN_EXPIRY_SKEW_MS } from "../../src/wcl/token-provider.js";
import {
  createFakeFetch,
  jsonResponse,
  networkFailure,
  rawResponse,
  TOKEN_URL,
} from "../support/fake-fetch.js";

/** Obvious sentinels. No real Warcraft Logs credential exists in this repository. */
const SENTINEL_ID = "SENTINEL_CLIENT_ID_DO_NOT_LEAK";
const SENTINEL_SECRET = "SENTINEL_CLIENT_SECRET_DO_NOT_LEAK";
const SENTINEL_TOKEN = "SENTINEL_ACCESS_TOKEN_DO_NOT_LEAK";

function credentials(id = SENTINEL_ID, secret = SENTINEL_SECRET): WclCredentials {
  return {
    clientId: id,
    clientSecret: secret,
    toJSON: () => ({ clientId: "[redacted]", clientSecret: "[redacted]" }),
  };
}

function clock(startMs = 1_000_000) {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    advance(ms: number) {
      nowMs += ms;
    },
  };
}

function grant(expiresIn: number | string | undefined, token: string = SENTINEL_TOKEN): Response {
  const body: Record<string, unknown> = { access_token: token, token_type: "Bearer" };
  if (expiresIn !== undefined) {
    body["expires_in"] = expiresIn;
  }
  return jsonResponse(200, body);
}

describe("wcl token provider", () => {
  it("token_acquired_with_client_credentials_grant", async () => {
    const fake = createFakeFetch(() => grant(3600));
    const provider = createTokenProvider({
      credentials: credentials(),
      fetch: fake.fetch,
      now: clock().now,
      cache: createTokenCache(),
    });

    const result = await provider.getToken();

    expect(result.ok).toBe(true);
    expect(fake.tokenCalls()).toHaveLength(1);

    const request = fake.calls[0];
    expect(request?.url).toBe(TOKEN_URL);
    expect(request?.method).toBe("POST");
    expect(request?.body).toBe("grant_type=client_credentials");
    // Basic auth per the documented flow: client_id as user, client_secret as password.
    expect(request?.headers.get("authorization")).toBe(`Basic ${btoa(`${SENTINEL_ID}:${SENTINEL_SECRET}`)}`);
    expect(request?.headers.get("content-type")).toBe("application/x-www-form-urlencoded");

    if (result.ok) {
      expect(result.fromCache).toBe(false);
      expect(result.token.authorizationHeader()).toBe(`Bearer ${SENTINEL_TOKEN}`);
    }
  });

  it("cached_unexpired_token_is_reused_without_a_second_request", async () => {
    const fake = createFakeFetch(() => grant(3600));
    const time = clock();
    const provider = createTokenProvider({
      credentials: credentials(),
      fetch: fake.fetch,
      now: time.now,
      cache: createTokenCache(),
    });

    const first = await provider.getToken();
    time.advance(60_000);
    const second = await provider.getToken();

    expect(fake.tokenCalls()).toHaveLength(1);
    expect(first.ok && first.fromCache).toBe(false);
    expect(second.ok && second.fromCache).toBe(true);
  });

  it("token_is_cached_until_wcl_expiry_minus_skew", async () => {
    const fake = createFakeFetch(() => grant(3600));
    const time = clock();
    const provider = createTokenProvider({
      credentials: credentials(),
      fetch: fake.fetch,
      now: time.now,
      cache: createTokenCache(),
    });

    await provider.getToken();

    // One millisecond inside the usable window.
    time.advance(3_600_000 - TOKEN_EXPIRY_SKEW_MS - 1);
    const stillCached = await provider.getToken();
    expect(stillCached.ok && stillCached.fromCache).toBe(true);
    expect(fake.tokenCalls()).toHaveLength(1);

    // Crossing into the skew window refreshes, even though WCL's stated expiry
    // has not passed.
    time.advance(2);
    const refreshed = await provider.getToken();
    expect(refreshed.ok && refreshed.fromCache).toBe(false);
    expect(fake.tokenCalls()).toHaveLength(2);
  });

  it("expired_token_is_refreshed", async () => {
    const fake = createFakeFetch(() => grant(120));
    const time = clock();
    const provider = createTokenProvider({
      credentials: credentials(),
      fetch: fake.fetch,
      now: time.now,
      cache: createTokenCache(),
    });

    await provider.getToken();
    time.advance(200_000);
    const result = await provider.getToken();

    expect(fake.tokenCalls()).toHaveLength(2);
    expect(result.ok && result.fromCache).toBe(false);
  });

  it("token_response_without_valid_expires_in_fails_closed", async () => {
    // A token with an unknown lifetime is rejected outright. Using it once and
    // hoping would be inventing state we were not given.
    for (const expiresIn of [undefined, 0, -60, "3600"] as const) {
      const fake = createFakeFetch(() => grant(expiresIn));
      const provider = createTokenProvider({
        credentials: credentials(),
        fetch: fake.fetch,
        now: clock().now,
        cache: createTokenCache(),
      });

      const result = await provider.getToken();

      expect(result.ok, `expires_in=${String(expiresIn)} must fail closed`).toBe(false);
      if (!result.ok) {
        expect(result.failure.reason).toBe("UPSTREAM_DATA_INVALID");
      }
    }
  });

  it("token_response_with_wrong_token_type_fails_closed", async () => {
    const fake = createFakeFetch(() =>
      jsonResponse(200, { access_token: SENTINEL_TOKEN, token_type: "mac", expires_in: 3600 }),
    );
    const provider = createTokenProvider({
      credentials: credentials(),
      fetch: fake.fetch,
      now: clock().now,
      cache: createTokenCache(),
    });

    const result = await provider.getToken();
    expect(result.ok).toBe(false);
  });

  it("malformed_token_json_fails_closed", async () => {
    const fake = createFakeFetch(() => rawResponse(200, "{ not json"));
    const provider = createTokenProvider({
      credentials: credentials(),
      fetch: fake.fetch,
      now: clock().now,
      cache: createTokenCache(),
    });

    const result = await provider.getToken();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("UPSTREAM_DATA_INVALID");
    }
  });

  it("credential_rejection_is_reported_as_auth_failure", async () => {
    for (const status of [400, 401, 403]) {
      const fake = createFakeFetch(() => jsonResponse(status, { error: "invalid_client" }));
      const provider = createTokenProvider({
        credentials: credentials(),
        fetch: fake.fetch,
        now: clock().now,
        cache: createTokenCache(),
      });

      const result = await provider.getToken();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.reason, `status ${status}`).toBe("UPSTREAM_AUTH_FAILED");
        expect(result.failure.diagnostics.httpStatus).toBe(status);
      }
    }
  });

  it("token_endpoint_rate_limit_is_not_an_auth_failure", async () => {
    const fake = createFakeFetch(() => jsonResponse(429, {}));
    const provider = createTokenProvider({
      credentials: credentials(),
      fetch: fake.fetch,
      now: clock().now,
      cache: createTokenCache(),
    });

    const result = await provider.getToken();
    expect(result.ok === false && result.failure.reason).toBe("UPSTREAM_RATE_LIMITED");
  });

  it("network_failure_is_reported_as_unavailable_not_as_missing_data", async () => {
    const fake = createFakeFetch(networkFailure);
    const provider = createTokenProvider({
      credentials: credentials(),
      fetch: fake.fetch,
      now: clock().now,
      cache: createTokenCache(),
    });

    const result = await provider.getToken();
    expect(result.ok === false && result.failure.reason).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("different_credentials_do_not_share_a_cached_token", async () => {
    const cache = createTokenCache();
    const fake = createFakeFetch((request) =>
      grant(3600, request.headers.get("authorization") === null ? "none" : "token-for-caller"),
    );
    const time = clock();

    const first = createTokenProvider({
      credentials: credentials("client-one", "secret-one"),
      fetch: fake.fetch,
      now: time.now,
      cache,
    });
    const second = createTokenProvider({
      credentials: credentials("client-two", "secret-two"),
      fetch: fake.fetch,
      now: time.now,
      cache,
    });

    await first.getToken();
    const result = await second.getToken();

    // The second caller must mint its own token rather than inherit one issued
    // for different credentials.
    expect(fake.tokenCalls()).toHaveLength(2);
    expect(result.ok && result.fromCache).toBe(false);
  });

  it("concurrent_requests_mint_only_one_token", async () => {
    const fake = createFakeFetch(() => grant(3600));
    const provider = createTokenProvider({
      credentials: credentials(),
      fetch: fake.fetch,
      now: clock().now,
      cache: createTokenCache(),
    });

    const results = await Promise.all([provider.getToken(), provider.getToken(), provider.getToken()]);

    expect(fake.tokenCalls()).toHaveLength(1);
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("unencodable_credentials_fail_as_configuration_not_as_a_crash", async () => {
    const fake = createFakeFetch(() => grant(3600));
    const provider = createTokenProvider({
      // Above Latin-1: btoa would throw.
      credentials: credentials("clieŁnt", "secret"),
      fetch: fake.fetch,
      now: clock().now,
      cache: createTokenCache(),
    });

    const result = await provider.getToken();

    expect(result.ok === false && result.failure.reason).toBe("CREDENTIALS_NOT_ENCODABLE");
    expect(fake.calls).toHaveLength(0);
  });

  it("token_value_never_appears_in_a_serialized_token_or_failure", async () => {
    const fake = createFakeFetch(() => grant(3600));
    const provider = createTokenProvider({
      credentials: credentials(),
      fetch: fake.fetch,
      now: clock().now,
      cache: createTokenCache(),
    });

    const result = await provider.getToken();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Serialization and interpolation are the two ways a token escapes by
    // accident. Both are redacted.
    expect(JSON.stringify(result.token)).not.toContain(SENTINEL_TOKEN);
    expect(`${String(result.token)}`).not.toContain(SENTINEL_TOKEN);
    expect(JSON.stringify(result)).not.toContain(SENTINEL_TOKEN);
    expect(JSON.stringify(result)).not.toContain(SENTINEL_SECRET);
  });

  it("failures_never_carry_upstream_text_or_credentials", async () => {
    const fake = createFakeFetch(() =>
      jsonResponse(401, { error: "invalid_client", hint: SENTINEL_SECRET, token: SENTINEL_TOKEN }),
    );
    const provider = createTokenProvider({
      credentials: credentials(),
      fetch: fake.fetch,
      now: clock().now,
      cache: createTokenCache(),
    });

    const result = await provider.getToken();
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(SENTINEL_SECRET);
    expect(serialized).not.toContain(SENTINEL_TOKEN);
    expect(serialized).not.toContain("invalid_client");
  });
});
