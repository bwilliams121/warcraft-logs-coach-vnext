/**
 * Fight ingestion — the composition root for Milestone 3.
 *
 * Order:
 *
 *     context query
 *       -> archive gate        (before spending any event request)
 *       -> fight/phase/catalog normalization
 *       -> paginate, normalizing each page as it arrives
 *       -> revision recheck
 *       -> project category evidence
 *
 * The archive gate comes first on purpose. The schema documents
 * `ReportArchiveStatus.isAccessible` as always false without user
 * authentication, and this deployment uses client credentials, so an archived
 * report's events are unreachable. Without the gate we would spend points
 * producing empty or erroring pages that must never be read as an empty fight.
 *
 * This module is NOT wired into `/v1/analysis`. Nothing calls it in production
 * yet, which is the point: an ingestion path with no caller cannot make the
 * live route lie or spend points on evidence no analyzer asked for.
 */

import type { IngestionScope } from "../services/ingestion-scope.js";
import type { WclCredentials } from "../config/env.js";
import { NORMALIZATION_REVISION, type CombatFight } from "../engine/normalization/combat-fight.js";
import { projectCategoryEvidence } from "../engine/normalization/completeness.js";
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
import { EVIDENCE_CAPABILITY_REGISTRY, type RetrievalSource } from "./evidence-capability.js";
import {
  decodeFightContext,
  decodeReportRevision,
  FIGHT_CONTEXT_QUERY,
  fightContextVariables,
  REPORT_REVISION_QUERY,
  reportRevisionVariables,
} from "./fight-context-query.js";
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

export interface FightIngestionRequest {
  readonly reportCode: string;
  readonly fightId: number;
  readonly sourceId: number;
  readonly scope: IngestionScope;
  readonly includeResources: boolean;
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

export async function ingestFight(
  request: FightIngestionRequest,
  deps: IngestFightDeps,
): Promise<FightIngestionResult> {
  const context = await deps.client.execute({
    query: FIGHT_CONTEXT_QUERY,
    variables: fightContextVariables(request.reportCode, request.fightId, request.sourceId),
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
    contextStream(
      CONTEXT_MASTER_DATA_STREAM,
      requestedRange,
      actors.unusableEntryCount > 0 || abilities.unusableEntryCount > 0,
    ),
  ];

  const streamIdsBySource: Record<RetrievalSource, readonly string[]> = {
    EVENTS_ALL_STREAM: plan.hostility.map(streamIdFor),
    TYPED_GRAPHQL_FIELD: [CONTEXT_TYPED_STREAM],
    REPORT_MASTER_DATA: [CONTEXT_MASTER_DATA_STREAM],
  };

  const friendlyActorsInScope = request.scope === "FULL_RAID" ? fight.friendlyPlayers : [];

  return {
    ok: true,
    rateLimit: context.rateLimit,
    fight: {
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
      breadth: {
        scope: request.scope,
        focusActorIds: [request.sourceId],
        friendlyActorsInScope,
      },
      completeness: {
        streams,
        categories: projectCategoryEvidence({
          registry: EVIDENCE_CAPABILITY_REGISTRY,
          streams,
          streamIdsBySource,
          degradedCategories: normalized.degradedCategories,
          streamsWithUntypedDefects: normalized.streamsWithUntypedDefects,
          actorScope: request.scope === "FULL_RAID" ? null : [request.sourceId],
        }),
      },
      report: {
        code: report.code,
        revision: report.revision,
        startTimeUnixMs: report.startTimeUnixMs,
        endTimeUnixMs: report.endTimeUnixMs,
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
      focusActorId: request.sourceId,
      talentImportCode: fight.talentImportCode,
      phases,
      events: normalized.events,
      malformedObservations: normalized.malformedObservations,
    },
  };
}

export interface CreateIngestorDeps {
  readonly fetch: FetchLike;
  readonly now?: (() => number) | undefined;
  readonly tokenCache?: TokenCache | undefined;
}

/**
 * Builds an ingestor over the real transport.
 *
 * Deliberately NOT bound at any production composition root. Milestone 5 wires
 * it in when an analyzer actually declares requirements.
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
