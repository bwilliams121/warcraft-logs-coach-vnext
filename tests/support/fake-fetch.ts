/**
 * Deterministic fetch doubles.
 *
 * Every Warcraft Logs test drives this rather than the network. No test in this
 * repository performs real HTTP, and none requires a Warcraft Logs credential:
 * the values used here are obvious sentinels.
 */

import type { FetchLike } from "../../src/wcl/types.js";

export const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
export const GRAPHQL_URL = "https://www.warcraftlogs.com/api/v2/client";

export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: string | undefined;
}

export type FakeResponder = (request: RecordedRequest, callIndex: number) => Response | Promise<Response>;

export interface FakeFetch {
  readonly fetch: FetchLike;
  readonly calls: readonly RecordedRequest[];
  tokenCalls(): readonly RecordedRequest[];
  graphqlCalls(): readonly RecordedRequest[];
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function rawResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

export function createFakeFetch(responder: FakeResponder): FakeFetch {
  const calls: RecordedRequest[] = [];

  const fetch: FetchLike = async (input, init) => {
    const recorded: RecordedRequest = {
      url: input,
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? init.body : undefined,
    };
    calls.push(recorded);
    return await responder(recorded, calls.length - 1);
  };

  return {
    fetch,
    calls,
    tokenCalls: () => calls.filter((call) => call.url === TOKEN_URL),
    graphqlCalls: () => calls.filter((call) => call.url === GRAPHQL_URL),
  };
}

/** Answers the token endpoint with a valid grant, and GraphQL with `graphql`. */
export function createWclFetch(options: {
  readonly graphql: FakeResponder;
  readonly accessToken?: string;
  readonly expiresIn?: number;
  readonly token?: FakeResponder;
}): FakeFetch {
  const accessToken = options.accessToken ?? "fake-access-token-not-real";
  const expiresIn = options.expiresIn ?? 3600;

  // Per-endpoint indexes, so a GraphQL sequence is not shifted by the token
  // request that necessarily precedes it.
  let tokenIndex = 0;
  let graphqlIndex = 0;

  return createFakeFetch((request) => {
    if (request.url === TOKEN_URL) {
      const index = tokenIndex;
      tokenIndex += 1;
      return options.token === undefined
        ? jsonResponse(200, { access_token: accessToken, token_type: "Bearer", expires_in: expiresIn })
        : options.token(request, index);
    }
    const index = graphqlIndex;
    graphqlIndex += 1;
    return options.graphql(request, index);
  });
}

/** Returns each response in turn; reusing the last once the list is exhausted. */
export function respondInSequence(responses: readonly (() => Response)[]): FakeResponder {
  return (_request, index) => {
    const next = responses[Math.min(index, responses.length - 1)];
    if (next === undefined) {
      throw new Error("respondInSequence was given no responses");
    }
    return next();
  };
}

/** Simulates DNS failure, TLS failure, connection reset or timeout. */
export const networkFailure: FakeResponder = () => {
  throw new TypeError("network failure (simulated)");
};
