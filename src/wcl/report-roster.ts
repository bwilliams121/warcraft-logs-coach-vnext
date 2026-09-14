/**
 * Roster discovery — one query, one snapshot, one revision.
 *
 * The M7-C entry point. It composes authentication, transport, decoding and
 * factual resolution into a single question:
 *
 *     who was in these fights, playing what, at which report revision?
 *
 * It stops there. No events are retrieved, nothing is paginated, no state is
 * derived and no gameplay conclusion is drawn — a roster is identity work, and
 * a port that could reach the event stream would eventually be asked to.
 *
 * WHY IT MIRRORS `preflight.ts` RATHER THAN INVENTING A SHAPE
 *
 * M2 already established what a WCL entry point looks like here: a factory that
 * takes injected `fetch`, binds the real transport at exactly one place, and
 * returns a port the application layer can hold without being able to reach the
 * network on its own. Roster discovery is the same kind of thing for a different
 * question, so it is the same shape.
 *
 * ONE ROUND TRIP, AND THAT IS THE POINT. `ReportFight` takes a `fightIDs: [Int]`
 * argument, so the whole selected fight set comes back together. A future
 * raid-night service therefore pays one query to learn the entire roster,
 * instead of one preflight per player per fight.
 */

import type { WclCredentials } from "../config/env.js";
import { createGraphqlClient, type WclGraphqlClient } from "./graphql-client.js";
import { decodeReportRoster, REPORT_ROSTER_QUERY, reportRosterVariables } from "./report-roster-query.js";
import {
  resolveReportRoster,
  type ReportRosterSnapshot,
  type RosterFailure,
  type RosterFailureReason,
} from "./roster-snapshot.js";
import { createTokenProvider, type TokenCache } from "./token-provider.js";
import type { FetchLike, RateLimitSnapshot, WclFailureReason } from "./types.js";

export interface ReportRosterRequest {
  readonly reportCode: string;
  /**
   * The fights to discover. REQUIRED and non-empty.
   *
   * Duplicates are harmless — resolution works from a set — but an empty list is
   * refused rather than defaulted, because omitting the argument upstream returns
   * every fight in the report.
   */
  readonly fightIds: readonly number[];
}

/**
 * Why roster discovery did not produce a snapshot.
 *
 * The transport reasons are M2's own vocabulary, unchanged: a roster query
 * fails upstream for exactly the reasons every other query does, and inventing
 * parallel names for them would give one condition two spellings.
 */
export type ReportRosterFailureReason =
  | RosterFailureReason
  | Extract<
      WclFailureReason,
      "UPSTREAM_DATA_INVALID" | "UPSTREAM_AUTH_FAILED" | "UPSTREAM_RATE_LIMITED" | "UPSTREAM_UNAVAILABLE"
    >;

export interface ReportRosterFailure extends Omit<RosterFailure, "reason"> {
  readonly reason: ReportRosterFailureReason;
}

export type ReportRosterResult =
  | {
      readonly ok: true;
      readonly snapshot: ReportRosterSnapshot;
      readonly rateLimit: RateLimitSnapshot | undefined;
    }
  | { readonly ok: false; readonly failure: ReportRosterFailure };

/** The port the application layer depends on. It holds nothing else from WCL. */
export type ReportRosterPort = (
  request: ReportRosterRequest,
  credentials: WclCredentials,
) => Promise<ReportRosterResult>;

/**
 * Maps a transport failure onto this port's vocabulary.
 *
 * `CREDENTIALS_NOT_ENCODABLE` folds into `UPSTREAM_AUTH_FAILED` exactly as M3
 * ingestion folds it: both mean this deployment could not authenticate, and the
 * caller's response to either is identical.
 */
function mapUpstreamFailure(reason: WclFailureReason): ReportRosterFailureReason {
  switch (reason) {
    case "UPSTREAM_RATE_LIMITED":
      return "UPSTREAM_RATE_LIMITED";
    case "UPSTREAM_AUTH_FAILED":
    case "CREDENTIALS_NOT_ENCODABLE":
      return "UPSTREAM_AUTH_FAILED";
    case "UPSTREAM_UNAVAILABLE":
      return "UPSTREAM_UNAVAILABLE";
    default:
      return "UPSTREAM_DATA_INVALID";
  }
}

export interface DiscoverRosterDeps {
  readonly client: WclGraphqlClient;
}

/**
 * Discovers the roster for one report and one selected fight set.
 *
 * Issues EXACTLY ONE GraphQL request on the success path, and zero when the
 * request is refused before it — an empty selection costs nothing, because
 * spending a Warcraft Logs point to learn that the caller asked for nothing
 * would be spending it for no answer.
 */
export async function discoverReportRoster(
  request: ReportRosterRequest,
  deps: DiscoverRosterDeps,
): Promise<ReportRosterResult> {
  if (request.fightIds.length === 0) {
    return { ok: false, failure: { reason: "NO_FIGHTS_REQUESTED" } };
  }

  const outcome = await deps.client.execute({
    query: REPORT_ROSTER_QUERY,
    variables: reportRosterVariables(request.reportCode, request.fightIds),
    decode: decodeReportRoster,
  });

  if (!outcome.ok) {
    return { ok: false, failure: { reason: mapUpstreamFailure(outcome.failure.reason) } };
  }

  const resolution = resolveReportRoster(outcome.data, request.fightIds);
  if (!resolution.ok) {
    return { ok: false, failure: resolution.failure };
  }

  return { ok: true, snapshot: resolution.snapshot, rateLimit: outcome.rateLimit };
}

export interface CreateReportRosterDeps {
  readonly fetch: FetchLike;
  readonly now?: (() => number) | undefined;
  readonly tokenCache?: TokenCache | undefined;
}

/**
 * Builds a roster port over the real transport.
 *
 * Takes a `tokenCache` for the same reason the ingestor does: a raid-night
 * request performs roster discovery and then several fight retrievals against
 * the same API with the same credentials, and one shared cache means one OAuth
 * exchange rather than one per step.
 *
 * NOT bound at any production composition root. Nothing in `/v1/analysis` or the
 * MCP tool calls it, which is deliberate — M7-C builds the capability, and the
 * service that needs it arrives with M7-D/M7-F. A port with no caller cannot
 * make a live route behave differently or spend a point nobody asked for.
 */
export function createReportRoster(deps: CreateReportRosterDeps): ReportRosterPort {
  return async (request, credentials) => {
    const tokens = createTokenProvider({
      credentials,
      fetch: deps.fetch,
      now: deps.now ?? Date.now,
      cache: deps.tokenCache,
    });
    return await discoverReportRoster(request, {
      client: createGraphqlClient({ tokens, fetch: deps.fetch }),
    });
  };
}
