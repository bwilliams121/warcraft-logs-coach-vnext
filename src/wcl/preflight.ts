/**
 * Warcraft Logs preflight — the only entry point the application service sees.
 *
 * Composes authentication, transport, decoding and identity resolution into one
 * question: does this report/fight/player exist, belong together, and come back
 * with a complete identity?
 *
 * Milestone 2 stops there. No events are retrieved, nothing is paginated, and
 * no gameplay conclusion is drawn.
 */

import { createGraphqlClient } from "./graphql-client.js";
import { resolveFightIdentity } from "./identity.js";
import { decodePreflight, PREFLIGHT_QUERY, preflightVariables } from "./preflight-query.js";
import { createTokenProvider, type TokenCache } from "./token-provider.js";
import { wclFailure, type FetchLike, type PreflightPort } from "./types.js";

export interface PreflightDeps {
  readonly fetch: FetchLike;
  readonly now?: (() => number) | undefined;
  readonly tokenCache?: TokenCache | undefined;
}

export function createPreflight(deps: PreflightDeps): PreflightPort {
  return async (request, credentials) => {
    const tokens = createTokenProvider({
      credentials,
      fetch: deps.fetch,
      now: deps.now ?? Date.now,
      cache: deps.tokenCache,
    });

    const outcome = await createGraphqlClient({ tokens, fetch: deps.fetch }).execute({
      query: PREFLIGHT_QUERY,
      variables: preflightVariables(request),
      decode: decodePreflight,
    });

    if (!outcome.ok) {
      return { ok: false, failure: outcome.failure };
    }

    const resolution = resolveFightIdentity(outcome.data, request);
    if (!resolution.ok) {
      return { ok: false, failure: wclFailure(resolution.reason, "IDENTITY") };
    }

    return { ok: true, identity: resolution.identity, rateLimit: outcome.rateLimit };
  };
}

/**
 * The production port. This is the one place the global `fetch` is bound, which
 * is what keeps every other module offline-testable.
 */
export const wclPreflight: PreflightPort = createPreflight({
  fetch: (input, init) => fetch(input, init),
});
