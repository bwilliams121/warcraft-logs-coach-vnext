/**
 * The real Warcraft Logs transport behind M8-F's two external ports.
 *
 * NO SECOND WCL ARCHITECTURE. Both adapters build their client from the same
 * `createTokenProvider` + `createGraphqlClient` pair every other port uses, bound
 * to the same `fetch` and sharing the caller's token cache. So external discovery
 * inherits M2's retry policy, timeout and failure classification rather than
 * acquiring its own.
 *
 * METADATA ONLY. Neither adapter can reach an event page: one issues the ranking
 * document, the other issues `CANDIDATE_METADATA_QUERY`, and that query selects
 * no event surface at all. There is no third adapter.
 *
 * A TRANSPORT FAILURE BECOMES THE DOMAIN'S OWN UNKNOWN. A network error on the
 * ranking request is reported as `PAYLOAD_UNRECOGNISED` rather than thrown: from
 * the domain's point of view both mean the candidate pool is not known, and an
 * exception escaping here would turn one third-party outage into a failed
 * encounter-context request whose LOCAL half was perfectly good.
 */

import { createGraphqlClient } from "../graphql-client.js";
import { createTokenProvider, type TokenCache } from "../token-provider.js";
import type { FetchLike } from "../types.js";
import type { CandidateMetadataPort, RankingPagePort } from "../../external-context/external-discovery.js";
import type { WclCredentials } from "../../config/env.js";
import { decodeRankingPayload } from "./rankings-decoder.js";
import {
  decodeEncounterRankings,
  encounterRankingsQuery,
  encounterRankingsVariables,
} from "./rankings-query.js";
import {
  CANDIDATE_METADATA_QUERY,
  candidateMetadataVariables,
  decodeCandidateMetadata,
} from "./candidate-metadata-query.js";

export interface ExternalPortDeps {
  readonly fetch: FetchLike;
  readonly now?: (() => number) | undefined;
  readonly tokenCache?: TokenCache | undefined;
}

function clientFor(deps: ExternalPortDeps, credentials: WclCredentials) {
  const tokens = createTokenProvider({
    credentials,
    fetch: deps.fetch,
    now: deps.now ?? Date.now,
    cache: deps.tokenCache,
  });
  return createGraphqlClient({ tokens, fetch: deps.fetch });
}

/**
 * One ranking page. Exactly one request, with no pagination follow-up.
 *
 * The decode happens in two stages on purpose: `decodeEncounterRankings`
 * establishes the GraphQL envelope, and `decodeRankingPayload` then interprets
 * the untyped, explicitly non-frozen JSON inside it. A malformed envelope and an
 * unrecognised payload are different failures and stay so.
 */
export function createRankingPagePort(deps: ExternalPortDeps): RankingPagePort {
  return async (request, credentials) => {
    const outcome = await clientFor(deps, credentials).execute({
      query: encounterRankingsQuery(request.metric),
      variables: encounterRankingsVariables(request),
      decode: decodeEncounterRankings,
    });
    if (!outcome.ok) {
      // We did not obtain a pool. Never an empty one.
      return { outcome: "PAYLOAD_UNRECOGNISED", defect: "RANKINGS_NOT_A_RECORD" };
    }
    return decodeRankingPayload(outcome.data.rankings);
  };
}

/**
 * Typed metadata for one candidate pull. Exactly one request. No events.
 *
 * `null` covers both "Warcraft Logs served no report" and a transport failure.
 * M8-F treats both as `REPORT_NOT_ACCESSIBLE`, which is candidate-local and
 * leaves every other candidate and the whole local result untouched.
 */
export function createCandidateMetadataPort(deps: ExternalPortDeps): CandidateMetadataPort {
  return async (reportCode, fightId, credentials) => {
    const outcome = await clientFor(deps, credentials).execute({
      query: CANDIDATE_METADATA_QUERY,
      variables: candidateMetadataVariables(reportCode, fightId),
      decode: decodeCandidateMetadata,
    });
    return outcome.ok ? outcome.data.report : null;
  };
}
