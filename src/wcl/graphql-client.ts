/**
 * Warcraft Logs public GraphQL transport.
 *
 * One POST to the public client endpoint, with deliberate handling for every
 * upstream outcome. An upstream failure is never converted into missing data —
 * that conversion is how "we could not retrieve your casts" silently becomes
 * "you did not cast anything".
 *
 * This module knows nothing about fights, actors or gameplay. It takes a query,
 * variables and a decoder, so later event retrieval reuses it unchanged.
 */

import { isFiniteNumber, isRecord } from "./decode.js";
import type { WclAccessToken, WclTokenProvider } from "./token-provider.js";
import { wclFailure, type FetchLike, type RateLimitSnapshot, type WclFailure } from "./types.js";

const GRAPHQL_ENDPOINT = "https://www.warcraftlogs.com/api/v2/client";
const GRAPHQL_TIMEOUT_MS = 20_000;

export type DecodeOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

export interface GraphqlOperation<T> {
  readonly query: string;
  readonly variables: Record<string, unknown>;
  readonly decode: (data: unknown) => DecodeOutcome<T>;
}

export type GraphqlOutcome<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly rateLimit: RateLimitSnapshot | undefined;
    }
  | { readonly ok: false; readonly failure: WclFailure };

export interface WclGraphqlClient {
  execute<T>(operation: GraphqlOperation<T>): Promise<GraphqlOutcome<T>>;
}

export interface GraphqlClientDeps {
  readonly tokens: WclTokenProvider;
  readonly fetch: FetchLike;
}

/**
 * Outcome of one HTTP attempt.
 *
 * `AUTH_RETRYABLE` exists only for a 401, and only the caller decides whether a
 * retry is allowed — which keeps the retry bound structural rather than a
 * counter that someone can later increment.
 */
type Attempt<T> =
  | { readonly kind: "OK"; readonly data: T; readonly rateLimit: RateLimitSnapshot | undefined }
  | { readonly kind: "AUTH_RETRYABLE"; readonly httpStatus: number }
  | { readonly kind: "FAILURE"; readonly failure: WclFailure };

/**
 * Rate-limit metadata rides along on the same round trip.
 *
 * Read leniently and never allowed to fail a request: it is operational
 * metadata about our API client, not analysis input.
 */
function readRateLimit(data: unknown): RateLimitSnapshot | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  const raw = data["rateLimitData"];
  if (!isRecord(raw)) {
    return undefined;
  }
  const limitPerHour = raw["limitPerHour"];
  const pointsSpentThisHour = raw["pointsSpentThisHour"];
  const pointsResetIn = raw["pointsResetIn"];
  if (
    !isFiniteNumber(limitPerHour) ||
    !isFiniteNumber(pointsSpentThisHour) ||
    !isFiniteNumber(pointsResetIn)
  ) {
    return undefined;
  }
  return { limitPerHour, pointsSpentThisHour, pointsResetIn };
}

function classifyGraphqlStatus(status: number): WclFailure {
  if (status === 403) {
    // Authorized-but-forbidden. Minting a new token cannot change this, so it
    // is never retried.
    return wclFailure("UPSTREAM_AUTH_FAILED", "TRANSPORT", { httpStatus: status });
  }
  if (status === 429) {
    // Retrying a rate limit just spends more points.
    return wclFailure("UPSTREAM_RATE_LIMITED", "TRANSPORT", { httpStatus: status });
  }
  return wclFailure("UPSTREAM_UNAVAILABLE", "TRANSPORT", { httpStatus: status });
}

export function createGraphqlClient(deps: GraphqlClientDeps): WclGraphqlClient {
  async function send<T>(operation: GraphqlOperation<T>, token: WclAccessToken): Promise<Attempt<T>> {
    let response: Response;
    try {
      response = await deps.fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: token.authorizationHeader(),
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ query: operation.query, variables: operation.variables }),
        signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
      });
    } catch {
      return { kind: "FAILURE", failure: wclFailure("UPSTREAM_UNAVAILABLE", "TRANSPORT") };
    }

    if (response.status === 401) {
      return { kind: "AUTH_RETRYABLE", httpStatus: response.status };
    }

    if (!response.ok) {
      return { kind: "FAILURE", failure: classifyGraphqlStatus(response.status) };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return {
        kind: "FAILURE",
        failure: wclFailure("UPSTREAM_DATA_INVALID", "TRANSPORT", { httpStatus: response.status }),
      };
    }

    if (!isRecord(body)) {
      return {
        kind: "FAILURE",
        failure: wclFailure("UPSTREAM_DATA_INVALID", "TRANSPORT", { httpStatus: response.status }),
      };
    }

    const errors = body["errors"];
    if (Array.isArray(errors) && errors.length > 0) {
      // HTTP 200 with GraphQL errors is a failure, not data.
      //
      // These are NOT classified by reading the human-readable message. There
      // is no verified machine-readable code for "report is private" in the
      // public schema, and inventing one from error prose would be a contract
      // we cannot defend. So this fails closed as invalid upstream data, and an
      // inaccessible report is recognised only by `report: null`.
      return {
        kind: "FAILURE",
        failure: wclFailure("UPSTREAM_DATA_INVALID", "TRANSPORT", {
          httpStatus: response.status,
          graphqlErrorCount: errors.length,
        }),
      };
    }

    const decoded = operation.decode(body["data"]);
    if (!decoded.ok) {
      return {
        kind: "FAILURE",
        failure: wclFailure("UPSTREAM_DATA_INVALID", "DECODE", { httpStatus: response.status }),
      };
    }

    return { kind: "OK", data: decoded.value, rateLimit: readRateLimit(body["data"]) };
  }

  return {
    async execute<T>(operation: GraphqlOperation<T>): Promise<GraphqlOutcome<T>> {
      const first = await deps.tokens.getToken();
      if (!first.ok) {
        return { ok: false, failure: first.failure };
      }

      let attempt = await send(operation, first.token);

      // The only retry in the transport: a 401 against a CACHED token means the
      // token went stale, so mint once and try once. A 401 against a token we
      // just minted means the credentials are rejected, and retrying would only
      // double the failure.
      if (attempt.kind === "AUTH_RETRYABLE" && first.fromCache) {
        const refreshed = await deps.tokens.getToken({ forceRefresh: true });
        if (!refreshed.ok) {
          return { ok: false, failure: refreshed.failure };
        }
        attempt = await send(operation, refreshed.token);
      }

      switch (attempt.kind) {
        case "OK":
          return { ok: true, data: attempt.data, rateLimit: attempt.rateLimit };
        case "AUTH_RETRYABLE":
          return {
            ok: false,
            failure: wclFailure("UPSTREAM_AUTH_FAILED", "TRANSPORT", { httpStatus: attempt.httpStatus }),
          };
        case "FAILURE":
          return { ok: false, failure: attempt.failure };
      }
    },
  };
}
