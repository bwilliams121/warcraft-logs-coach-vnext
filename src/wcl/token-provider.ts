/**
 * Warcraft Logs OAuth 2.0 Client Credentials token provider.
 *
 * Public-report access only. The client ID and secret are backend secrets: they
 * are exchanged server-side for a Bearer token, and neither the credentials nor
 * the token ever appear in an API response, an error, a log line, or a fixture.
 *
 * User-authorized OAuth (Authorization Code / PKCE) for private reports is
 * deliberately absent — not stubbed, not branched for.
 */

import { REDACTED, type WclCredentials } from "../config/env.js";
import { isFiniteNumber, isRecord, isUsableString } from "./decode.js";
import { wclFailure, type FetchLike, type WclFailure } from "./types.js";

const TOKEN_ENDPOINT = "https://www.warcraftlogs.com/oauth/token";

/**
 * Refresh this far before the stated expiry, covering clock drift and request
 * flight time. A token is never used inside this window.
 */
export const TOKEN_EXPIRY_SKEW_MS = 60_000;

const TOKEN_TIMEOUT_MS = 8_000;

/**
 * An access token whose value cannot be read back.
 *
 * `toJSON` and `toString` are both redacted: the first stops a serialized error
 * leaking it, the second stops template interpolation (`${token}`) leaking it.
 * Only `authorizationHeader()` produces the real value, and only the transport
 * calls that.
 */
export interface WclAccessToken {
  authorizationHeader(): string;
  toJSON(): string;
  toString(): string;
}

export function createAccessToken(value: string): WclAccessToken {
  return {
    authorizationHeader: () => `Bearer ${value}`,
    toJSON: () => REDACTED,
    toString: () => REDACTED,
  };
}

export type TokenResult =
  | {
      readonly ok: true;
      readonly token: WclAccessToken;
      /**
       * Whether this token came from the in-isolate cache.
       *
       * Load-bearing: it bounds the authentication retry. A 401 is retried only
       * for a cached token, so the retry cannot loop.
       */
      readonly fromCache: boolean;
    }
  | { readonly ok: false; readonly failure: WclFailure };

export interface WclTokenProvider {
  getToken(options?: { readonly forceRefresh?: boolean | undefined }): Promise<TokenResult>;
}

/**
 * Opportunistic in-isolate cache.
 *
 * Correctness never depends on it: a cold isolate simply mints a fresh token.
 * It is deliberately not backed by KV/D1/DO/R2 — persisting an OAuth token is
 * not worth a storage dependency, and would widen where a secret can live.
 *
 * Entries are keyed by a SHA-256 digest of the credential pair, so a token
 * minted from one credential set can never be served for another.
 */
export interface TokenCache {
  read(key: string, nowMs: number): WclAccessToken | undefined;
  write(key: string, token: WclAccessToken, expiresAtMs: number): void;
  invalidate(key: string): void;
  readInflight(key: string): Promise<TokenResult> | undefined;
  writeInflight(key: string, pending: Promise<TokenResult> | undefined): void;
}

export function createTokenCache(): TokenCache {
  let slot: { key: string; token: WclAccessToken; expiresAtMs: number } | undefined;
  let inflight: { key: string; pending: Promise<TokenResult> } | undefined;

  return {
    read(key, nowMs) {
      if (slot === undefined || slot.key !== key) {
        return undefined;
      }
      // Cached until WCL's stated expiry, less the skew.
      return nowMs < slot.expiresAtMs - TOKEN_EXPIRY_SKEW_MS ? slot.token : undefined;
    },
    write(key, token, expiresAtMs) {
      slot = { key, token, expiresAtMs };
    },
    invalidate(key) {
      if (slot?.key === key) {
        slot = undefined;
      }
    },
    readInflight(key) {
      return inflight?.key === key ? inflight.pending : undefined;
    },
    writeInflight(key, pending) {
      inflight = pending === undefined ? undefined : { key, pending };
    },
  };
}

/** Shared across requests in one isolate. Never shared across credentials. */
const sharedTokenCache = createTokenCache();

export interface TokenProviderDeps {
  readonly credentials: WclCredentials;
  readonly fetch: FetchLike;
  readonly now: () => number;
  readonly cache?: TokenCache | undefined;
}

/**
 * OAuth error statuses at the token endpoint.
 *
 * 400 is included: OAuth reports `invalid_client` that way, and calling a
 * credential rejection "upstream unavailable" would send an operator looking
 * for a Warcraft Logs outage that is not happening.
 */
function classifyTokenStatus(status: number): WclFailure {
  if (status === 400 || status === 401 || status === 403) {
    return wclFailure("UPSTREAM_AUTH_FAILED", "TOKEN", { httpStatus: status });
  }
  if (status === 429) {
    return wclFailure("UPSTREAM_RATE_LIMITED", "TOKEN", { httpStatus: status });
  }
  return wclFailure("UPSTREAM_UNAVAILABLE", "TOKEN", { httpStatus: status });
}

/**
 * Basic credential per the Warcraft Logs docs: client_id as user, client_secret
 * as password.
 *
 * `btoa` throws above Latin-1, so the guard turns a would-be crash into a typed
 * configuration failure.
 */
function toBasicCredential(credentials: WclCredentials): string | undefined {
  const raw = `${credentials.clientId}:${credentials.clientSecret}`;
  for (let index = 0; index < raw.length; index += 1) {
    if (raw.charCodeAt(index) > 0xff) {
      return undefined;
    }
  }
  return btoa(raw);
}

async function credentialDigest(credentials: WclCredentials): Promise<string> {
  const encoded = new TextEncoder().encode(`${credentials.clientId}:${credentials.clientSecret}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface DecodedToken {
  readonly token: WclAccessToken;
  readonly expiresInMs: number;
}

/**
 * Strict decode of the token response.
 *
 * `expires_in` must be a positive finite number. A token with an unknown
 * lifetime is rejected outright rather than used once: inventing or ignoring a
 * lifetime is exactly the kind of "plausible but unsupported" state this
 * project fails closed on.
 */
function decodeTokenResponse(payload: unknown): DecodedToken | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const accessToken = payload["access_token"];
  if (!isUsableString(accessToken)) {
    return undefined;
  }

  const tokenType = payload["token_type"];
  if (!isUsableString(tokenType) || tokenType.toLowerCase() !== "bearer") {
    return undefined;
  }

  const expiresIn = payload["expires_in"];
  if (!isFiniteNumber(expiresIn) || expiresIn <= 0) {
    return undefined;
  }

  return { token: createAccessToken(accessToken), expiresInMs: expiresIn * 1000 };
}

export function createTokenProvider(deps: TokenProviderDeps): WclTokenProvider {
  const cache = deps.cache ?? sharedTokenCache;

  async function mint(key: string): Promise<TokenResult> {
    const basic = toBasicCredential(deps.credentials);
    if (basic === undefined) {
      return { ok: false, failure: wclFailure("CREDENTIALS_NOT_ENCODABLE", "TOKEN") };
    }

    let response: Response;
    try {
      response = await deps.fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Basic ${basic}`,
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
        signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      });
    } catch {
      // Timeout, DNS, TLS, connection reset. The thrown value is discarded
      // rather than propagated: it can carry request details including headers.
      return { ok: false, failure: wclFailure("UPSTREAM_UNAVAILABLE", "TOKEN") };
    }

    if (!response.ok) {
      return { ok: false, failure: classifyTokenStatus(response.status) };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return {
        ok: false,
        failure: wclFailure("UPSTREAM_DATA_INVALID", "TOKEN", { httpStatus: response.status }),
      };
    }

    const decoded = decodeTokenResponse(payload);
    if (decoded === undefined) {
      // Never include the token-endpoint body in a diagnostic: it holds the
      // access token itself.
      return {
        ok: false,
        failure: wclFailure("UPSTREAM_DATA_INVALID", "TOKEN", { httpStatus: response.status }),
      };
    }

    const nowMs = deps.now();
    const expiresAtMs = nowMs + decoded.expiresInMs;
    if (expiresAtMs - TOKEN_EXPIRY_SKEW_MS > nowMs) {
      cache.write(key, decoded.token, expiresAtMs);
    }

    return { ok: true, token: decoded.token, fromCache: false };
  }

  return {
    async getToken(options): Promise<TokenResult> {
      const forceRefresh = options?.forceRefresh === true;
      const key = await credentialDigest(deps.credentials);

      if (forceRefresh) {
        cache.invalidate(key);
      } else {
        const cached = cache.read(key, deps.now());
        if (cached !== undefined) {
          return { ok: true, token: cached, fromCache: true };
        }

        // Single flight: a cold isolate taking several concurrent requests
        // mints one token, not one per request.
        const pending = cache.readInflight(key);
        if (pending !== undefined) {
          return await pending;
        }
      }

      const pending = mint(key);
      cache.writeInflight(key, pending);
      try {
        return await pending;
      } finally {
        cache.writeInflight(key, undefined);
      }
    },
  };
}
