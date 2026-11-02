/**
 * Fight ingestion — the composition root for Milestone 3.
 *
 * TWO FUNCTIONS, SPLIT ALONG THE LINE BETWEEN COST AND CLAIM.
 *
 *     ingestFightCore    retrieves and normalizes — no analysed player
 *       context query
 *         -> archive gate      (before spending any event request)
 *         -> fight/phase/catalog normalization
 *         -> paginate, normalizing each page as it arrives
 *         -> revision recheck
 *       -> NormalizedFightCore
 *
 *     ingestFight        the core, plus the view for ONE player
 *       -> focusedFightFor(core, sourceId, scope)
 *       -> CombatFight
 *
 * Every expensive step is in the first function and none of it is per player:
 * the plan carries no `sourceID`/`targetID` and requests one unfiltered
 * `dataType: All` stream, so the same bytes serve every raider in the fight. The
 * second function adds only the evidence projection — whose absence claims this
 * evidence supports — which is a property of an analysis rather than of a fetch.
 * See `../engine/normalization/fight-core.ts`.
 *
 * `ingestFight` is unchanged for callers. Same request, same result, same
 * failures.
 *
 * The archive gate comes first on purpose. The schema documents
 * `ReportArchiveStatus.isAccessible` as always false without user
 * authentication, and this deployment uses client credentials, so an archived
 * report's events are unreachable. Without the gate we would spend points
 * producing empty or erroring pages that must never be read as an empty fight.
 */

import type { IngestionScope } from "../services/ingestion-scope.js";
import type { WclCredentials } from "../config/env.js";
import { NORMALIZATION_REVISION, type CombatFight } from "../engine/normalization/combat-fight.js";
import { focusedFightFor, type NormalizedFightCore } from "../engine/normalization/fight-core.js";
import { createNormalizer } from "../engine/normalization/event-normalizer.js";
import { normalizeFightContext } from "../engine/normalization/fight-context.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
  type SupportedTypeContract,
} from "../engine/normalization/supported-families.js";
import {
  VERIFIED_DIRECTION_FIELDS,
  type DirectionFieldNames,
} from "../engine/normalization/raw-event-fields.js";
import type { TimeRangeMs } from "../engine/evidence/coverage.js";
import type { RetrievalSource } from "./evidence-capability.js";
import { decodeFightContext, FIGHT_CONTEXT_QUERY, fightContextVariables } from "./fight-context-query.js";
import { decodeReportRevision, REPORT_REVISION_QUERY, reportRevisionVariables } from "./report-revision.js";
import { createGraphqlClient, type WclGraphqlClient } from "./graphql-client.js";
import { paginateEventStream } from "./paginator.js";
import {
  createEventRetrievalPlan,
  EVENTS_END_TIME_BOUND,
  streamIdFor,
  summarizePlan,
  type HostilitySelector,
} from "./retrieval-plan.js";
import type { StreamCompleteness, StreamProvenance } from "./retrieval-types.js";
import { createTokenProvider, type TokenCache } from "./token-provider.js";
import type { FetchLike, RateLimitSnapshot, WclFailureReason } from "./types.js";

export type IngestionFailureReason =
  | "REPORT_NOT_ACCESSIBLE"
  | "REPORT_ARCHIVED_INACCESSIBLE"
  | "REPORT_REVISION_CHANGED"
  | "FIGHT_NOT_FOUND"
  | "FIGHT_RANGE_INVALID"
  | "EVENT_RETRIEVAL_ABSENT"
  | "UPSTREAM_DATA_INVALID"
  | "UPSTREAM_AUTH_FAILED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE";

export interface IngestionFailure {
  readonly reason: IngestionFailureReason;
}

/**
 * `ok: true` covers COMPLETE and PARTIAL alike.
 *
 * A fight whose later pages failed still returns a usable `CombatFight` with
 * accurate covered ranges, because discarding successfully retrieved evidence
 * is itself a way of turning a retrieval failure into "nothing happened".
 *
 * `ok: false` is reserved for cases where no trustworthy fight object exists:
 * no page at all, an inaccessible archive, or a mixed-revision dataset.
 */
export type FightIngestionResult =
  | { readonly ok: true; readonly fight: CombatFight; readonly rateLimit: RateLimitSnapshot | undefined }
  | { readonly ok: false; readonly failure: IngestionFailure };

/** The same outcomes, carrying the actor-independent core instead of one view. */
export type FightCoreIngestionResult =
  | {
      readonly ok: true;
      readonly core: NormalizedFightCore;
      readonly rateLimit: RateLimitSnapshot | undefined;
    }
  | { readonly ok: false; readonly failure: IngestionFailure };

/**
 * What retrieving one fight needs, with no analysed player in it.
 *
 * NOTE WHAT IS ABSENT: `scope`. Ingestion scope declares how much FRIENDLY RAID
 * state an analysis is permitted to reason about, which is a property of the
 * analysis, not of the fetch — the plan requests one unfiltered stream either
 * way. It belongs to `focusedFightFor`, and putting it here would invite a
 * shared retrieval to decide it once on everybody's behalf.
 */
export interface FightCoreIngestionRequest {
  readonly reportCode: string;
  readonly fightId: number;
  /**
   * The one actor `ReportFight.talentImportCode(actorID:)` is requested for.
   *
   * It is NOT a focus actor and it does not narrow anything. The context query
   * takes an `actorID` because that single field is per-actor; no event, actor,
   * ability, phase or completeness fact in the result depends on it. The name
   * says so, so a reader cannot mistake it for a retrieval filter.
   *
   * The retrieved code is returned paired with this id, and a focused view hands
   * it only to the player it actually describes.
   */
  readonly talentImportActorId: number;
  readonly includeResources: boolean;
  /**
   * The report revision every fight in a batch must belong to.
   *
   * OPTIONAL, AND ABSENT MEANS "NO EXPECTATION" — never "expect zero". The
   * single-player path supplies nothing and behaves exactly as it always has:
   * M3's own post-pagination recheck still guards one fight against a report
   * that moved underneath it.
   *
   * A raid-night batch supplies the revision its roster discovery established.
   * The check then runs on the CONTEXT RESPONSE, before the retrieval plan is
   * built and before a single event page is requested — so a report that was
   * re-exported between roster discovery and this fight costs one cheap query
   * rather than a full pagination whose result would have to be thrown away.
   *
   * It does not replace the post-pagination recheck. This one catches a report
   * that had already moved; that one catches a report that moves mid-flight.
   * Both are needed, and neither implies the other.
   */
  readonly expectedReportRevision?: number;
  readonly hostility?: readonly HostilitySelector[];
  readonly limit?: number;
}

export interface FightIngestionRequest {
  readonly reportCode: string;
  readonly fightId: number;
  readonly sourceId: number;
  readonly scope: IngestionScope;
  readonly includeResources: boolean;
  /** Derived, never chosen (M11-E1): the focus player's own pets are evidence. */
  readonly ownedPetEvidence?: true;
  readonly hostility?: readonly HostilitySelector[];
  readonly limit?: number;
}

export interface IngestFightDeps {
  readonly client: WclGraphqlClient;
  readonly now: () => number;
  /** Overridable so tests can exercise the machinery with verified-shaped inputs. */
  readonly contracts?: readonly SupportedTypeContract[];
  readonly directionFields?: DirectionFieldNames | null;
}

function mapUpstreamFailure(reason: WclFailureReason): IngestionFailureReason {
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

const CONTEXT_TYPED_STREAM = "context:typed";
const CONTEXT_MASTER_DATA_STREAM = "context:masterData";
/**
 * The typed evidence obtained for ONE actor.
 *
 * Separate from `context:typed` because it vouches for one player rather than
 * for the fight. Both arrive on the same round trip, so splitting them costs
 * nothing and buys the ability to say which player a per-actor answer describes
 * — see `TYPED_GRAPHQL_FIELD_PER_ACTOR` in `evidence-capability.ts`.
 */
const CONTEXT_TALENT_IMPORT_STREAM = "context:typed:actor";

/**
 * The context query succeeded, so typed evidence covers the whole fight.
 *
 * Typed GraphQL fields carry no pagination cursor, so there is no boundary
 * subtlety here: the range is simply the fight.
 */
function contextStream(streamId: string, range: TimeRangeMs, degraded: boolean): StreamCompleteness {
  return {
    streamId,
    state: degraded ? "PARTIAL" : "COMPLETE",
    reason: degraded ? "MALFORMED_EVENT_CONTENT" : "COMPLETED_NORMALLY",
    requestedRange: range,
    coveredRanges: [range],
    pagesRequested: 1,
    pagesRetrieved: 1,
    eventsRetrieved: 0,
  };
}

/**
 * Retrieves and normalizes one fight, with no analysed player.
 *
 * THIS IS WHERE EVERY EXPENSIVE THING HAPPENS, AND NONE OF IT IS PER PLAYER.
 * The context query, the archive gate, the whole `dataType: All` pagination, the
 * normalization pass and the revision recheck all produce identical results
 * regardless of who is later analysed — because the plan is not parameterised by
 * actor and never was. Splitting the function is what lets a caller SPEND that
 * cost once and then ask `focusedFightFor` for as many player views as it needs.
 *
 * Nothing about retrieval changed. Same query, same plan, same cursor handling,
 * same ordering, same safety limits, same failure mapping. The only thing lifted
 * out is the projection at the end that decided whose absence claims the
 * evidence supports.
 */
export async function ingestFightCore(
  request: FightCoreIngestionRequest,
  deps: IngestFightDeps,
): Promise<FightCoreIngestionResult> {
  const context = await deps.client.execute({
    query: FIGHT_CONTEXT_QUERY,
    variables: fightContextVariables(request.reportCode, request.fightId, request.talentImportActorId),
    decode: decodeFightContext,
  });

  if (!context.ok) {
    return { ok: false, failure: { reason: mapUpstreamFailure(context.failure.reason) } };
  }
  const report = context.data.report;
  if (report === null) {
    return { ok: false, failure: { reason: "REPORT_NOT_ACCESSIBLE" } };
  }

  // Archive gate, before any event request is issued.
  if (
    report.archiveStatus !== null &&
    report.archiveStatus.isArchived &&
    !report.archiveStatus.isAccessible
  ) {
    return { ok: false, failure: { reason: "REPORT_ARCHIVED_INACCESSIBLE" } };
  }

  // Batch revision gate, also before any event request is issued.
  //
  // Only a caller that stated an expectation is checked, so the single-player
  // path is untouched. `undefined` is compared explicitly rather than by
  // truthiness — revision 0 is a number like any other, and a truthiness test
  // would silently skip the check for it.
  if (request.expectedReportRevision !== undefined && report.revision !== request.expectedReportRevision) {
    return { ok: false, failure: { reason: "REPORT_REVISION_CHANGED" } };
  }

  const normalizedContext = normalizeFightContext(report, request.fightId);
  if (!normalizedContext.ok) {
    return { ok: false, failure: { reason: normalizedContext.reason } };
  }
  const { fight, phases, actors, abilities } = normalizedContext;

  const plan = createEventRetrievalPlan({
    reportCode: request.reportCode,
    fightId: request.fightId,
    startTimeMs: fight.startTimeMs,
    endTimeMs: fight.endTimeMs,
    includeResources: request.includeResources,
    ...(request.hostility === undefined ? {} : { hostility: request.hostility }),
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  });
  // Closed at the top: Warcraft Logs returns events at exactly `endTime`.
  const requestedRange: TimeRangeMs = {
    fromReportTimeMs: fight.startTimeMs,
    toReportTimeMs: fight.endTimeMs,
    upperBound: EVENTS_END_TIME_BOUND,
  };

  const normalizer = createNormalizer({
    fightStartTimeMs: fight.startTimeMs,
    requestedRange,
    contracts: indexContracts(deps.contracts ?? SUPPORTED_TYPE_CONTRACTS),
    directionFields: deps.directionFields === undefined ? VERIFIED_DIRECTION_FIELDS : deps.directionFields,
  });

  const eventStreams: StreamCompleteness[] = [];
  const streamProvenance: StreamProvenance[] = [];
  for (const hostility of plan.hostility) {
    const outcome = await paginateEventStream(
      { plan, hostility, onPage: (page) => normalizer.accept(page) },
      { client: deps.client, now: deps.now },
    );
    eventStreams.push(outcome.completeness);
    streamProvenance.push(outcome.provenance);
  }

  // No page at all means there is no fight object to hand back honestly.
  if (eventStreams.every((stream) => stream.state === "ABSENT")) {
    return { ok: false, failure: { reason: "EVENT_RETRIEVAL_ABSENT" } };
  }

  const revisionCheck = await deps.client.execute({
    query: REPORT_REVISION_QUERY,
    variables: reportRevisionVariables(request.reportCode),
    decode: decodeReportRevision,
  });
  if (revisionCheck.ok && revisionCheck.data !== null && revisionCheck.data !== report.revision) {
    return { ok: false, failure: { reason: "REPORT_REVISION_CHANGED" } };
  }

  const normalized = normalizer.finish();

  const streams: StreamCompleteness[] = [
    ...eventStreams,
    contextStream(CONTEXT_TYPED_STREAM, requestedRange, false),
    // Retrieved, and retrieved for exactly one actor. It stays in the shared
    // stream list because it is a real retrieval fact; which players it VOUCHES
    // for is decided per view, by whether the view's focus actor is the one it
    // was requested for.
    contextStream(CONTEXT_TALENT_IMPORT_STREAM, requestedRange, false),
    contextStream(
      CONTEXT_MASTER_DATA_STREAM,
      requestedRange,
      actors.unusableEntryCount > 0 || abilities.unusableEntryCount > 0,
    ),
  ];

  const streamIdsBySource: Record<RetrievalSource, readonly string[]> = {
    EVENTS_ALL_STREAM: plan.hostility.map(streamIdFor),
    TYPED_GRAPHQL_FIELD: [CONTEXT_TYPED_STREAM],
    TYPED_GRAPHQL_FIELD_PER_ACTOR: [CONTEXT_TALENT_IMPORT_STREAM],
    REPORT_MASTER_DATA: [CONTEXT_MASTER_DATA_STREAM],
  };

  return {
    ok: true,
    rateLimit: context.rateLimit,
    core: {
      provenance: {
        normalizationRevision: NORMALIZATION_REVISION,
        reportCode: report.code,
        reportRevision: report.revision,
        reportStartTimeUnixMs: report.startTimeUnixMs,
        fightId: fight.id,
        logVersion: report.logVersion,
        gameVersion: report.gameVersion,
        retrievedAtUnixMs: deps.now(),
        plan: summarizePlan(plan),
        streams: streamProvenance,
        source: "WARCRAFT_LOGS_V2_CLIENT",
        unsupportedEventTypes: normalized.unsupportedTypeCounts,
        malformedEventTypes: normalized.malformedFamilyCountsByType,
        malformedEnvelopeCount: normalized.malformedEnvelopeCount,
        hostilityStreams: plan.hostility,
      },
      // Retrieval evidence only. Which actors it VOUCHES for is decided per
      // analysed player by `focusedFightFor`, not once here on everybody's
      // behalf — see `fight-core.ts`.
      streams,
      streamIdsBySource,
      degradedCategories: normalized.degradedCategories,
      streamsWithUntypedDefects: normalized.streamsWithUntypedDefects,
      friendlyPlayers: fight.friendlyPlayers,
      report: {
        code: report.code,
        revision: report.revision,
        startTimeUnixMs: report.startTimeUnixMs,
        endTimeUnixMs: report.endTimeUnixMs,
        region: report.region,
      },
      data: { logVersion: report.logVersion, gameVersion: report.gameVersion },
      fight: {
        id: fight.id,
        name: fight.name,
        encounterId: fight.encounterId,
        difficulty: fight.difficulty,
        size: fight.size,
        kill: fight.kill,
        startTimeMs: fight.startTimeMs,
        endTimeMs: fight.endTimeMs,
        durationMs: fight.durationMs,
        finality: fight.finality,
        inProgressRaw: fight.inProgressRaw,
      },
      actors: actors.actors,
      abilities: abilities.abilities,
      friendlySpecializations: fight.friendlySpecializations,
      talentImport: { actorId: request.talentImportActorId, code: fight.talentImportCode },
      // M8 context, from the SAME context response as everything above — no
      // second round trip, and therefore the same report snapshot and the same
      // revision gate. Carried on the core only; `focusedFightFor` does not put
      // either on a `CombatFight`, so gameplay analysis never sees them.
      encounterOutcome: fight.outcome,
      zone: normalizedContext.zone,
      phases,
      events: normalized.events,
      malformedObservations: normalized.malformedObservations,
    },
  };
}

/**
 * Retrieves one fight and returns the view for one analysed player.
 *
 * UNCHANGED FOR EVERY EXISTING CALLER. Same request, same result, same failure
 * reasons, same `CombatFight`. It is now composed from the two halves rather
 * than being one function, which is the only difference a reader should be able
 * to find — the single-player path retrieves exactly what it always did, and the
 * evidence scope it ends up with is derived from `sourceId` exactly as before.
 *
 * `sourceId` therefore plays both roles here, and legitimately: it is the actor
 * the talent import code is requested for AND the analysed player. A raid-night
 * caller that wants several players calls `ingestFightCore` once and
 * `focusedFightFor` per player instead.
 */
export async function ingestFight(
  request: FightIngestionRequest,
  deps: IngestFightDeps,
): Promise<FightIngestionResult> {
  const outcome = await ingestFightCore(
    {
      reportCode: request.reportCode,
      fightId: request.fightId,
      talentImportActorId: request.sourceId,
      includeResources: request.includeResources,
      ...(request.hostility === undefined ? {} : { hostility: request.hostility }),
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    },
    deps,
  );
  if (!outcome.ok) {
    return { ok: false, failure: outcome.failure };
  }
  return {
    ok: true,
    rateLimit: outcome.rateLimit,
    fight: focusedFightFor(
      outcome.core,
      request.sourceId,
      request.scope,
      request.ownedPetEvidence === true ? { ownedPetEvidence: true } : undefined,
    ),
  };
}

export interface CreateIngestorDeps {
  readonly fetch: FetchLike;
  readonly now?: (() => number) | undefined;
  readonly tokenCache?: TokenCache | undefined;
}

/**
 * Builds a single-player ingestor over the real transport.
 *
 * Bound at the production composition root in `runtime/analysis-composition.ts`,
 * where it shares one OAuth token cache with preflight.
 *
 * It returns one player's view, because that is what `CombatIngestionPort` and
 * the single-fight application service ask for. A caller wanting several players
 * from one retrieval uses `ingestFightCore` and `focusedFightFor` directly
 * rather than calling this repeatedly.
 */
export function createFightIngestor(deps: CreateIngestorDeps) {
  return async (
    request: FightIngestionRequest,
    credentials: WclCredentials,
  ): Promise<FightIngestionResult> => {
    const now = deps.now ?? Date.now;
    const tokens = createTokenProvider({
      credentials,
      fetch: deps.fetch,
      now,
      cache: deps.tokenCache,
    });
    return await ingestFight(request, {
      client: createGraphqlClient({ tokens, fetch: deps.fetch }),
      now,
    });
  };
}

/**
 * Builds an actor-independent fight-core ingestor over the real transport.
 *
 * The raid-night counterpart to `createFightIngestor`. It returns the CORE rather
 * than one player's view, because a raid night reuses the same retrieval across
 * every analyzed player in the fight — which is the whole reason M7-B split the
 * two. Same transport, same token cache, same failure mapping.
 */
export function createFightCoreIngestor(deps: CreateIngestorDeps) {
  return async (
    request: FightCoreIngestionRequest,
    credentials: WclCredentials,
  ): Promise<FightCoreIngestionResult> => {
    const now = deps.now ?? Date.now;
    const tokens = createTokenProvider({ credentials, fetch: deps.fetch, now, cache: deps.tokenCache });
    return await ingestFightCore(request, {
      client: createGraphqlClient({ tokens, fetch: deps.fetch }),
      now,
    });
  };
}
