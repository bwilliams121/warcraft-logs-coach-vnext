/**
 * Counting fake ports for raid-night orchestration.
 *
 * FAKED AT THE PORT, NOT AT THE SERVICE. The service under test runs for real:
 * real spec resolution, the real analyzer registry, the real focused-view
 * projection, real `CombatState` construction, the real M5 facade, the real M7-D
 * gate and aggregator. Only the three Warcraft Logs ports are substituted.
 *
 * Every port counts its calls, because the cost properties M7-F is responsible
 * for — one roster query, one ingestion per NEEDED fight, zero for the rest — are
 * only provable by counting.
 */

import { analyzeRaidNight, type RaidNightServiceDeps } from "../../src/services/raid-night-service.js";
import type { RaidNightRequest } from "../../src/services/raid-night-request.js";
import type { RaidNightRunResult } from "../../src/services/raid-night-runner.js";
import type { Env } from "../../src/config/env.js";
import type { FightCoreIngestionResult, IngestionFailureReason } from "../../src/wcl/ingest-fight.js";
import type { NormalizedFightCore } from "../../src/engine/normalization/fight-core.js";
import { NO_ENCOUNTER_OUTCOME_FACTS } from "./synthetic-fight.js";
import type { RevisionCheck } from "../../src/wcl/report-revision.js";
import type { ReportRosterResult } from "../../src/wcl/report-roster.js";
import type { ReportRosterSnapshot, RosterFight, RosterPlayer } from "../../src/wcl/roster-snapshot.js";
import { M5D2_ACTOR, M5D2_RAW_EVENTS, m5d2FightFrom } from "./m5d2-fixture.js";
import {
  REPORT_CODE,
  REVISION,
  rosterFightFor,
  rosterPlayerFor,
  snapshotFor,
} from "./aggregation-fixture.js";

export { M5D2_ACTOR, REPORT_CODE, REVISION, rosterFightFor, rosterPlayerFor };

export const ENV: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: "fake-client-id-not-real",
  WCL_CLIENT_SECRET: "fake-client-secret-not-real",
};

/**
 * The M5-D2 corpus fanned out across several actors.
 *
 * WHY THIS EXISTS. The corpus describes ONE Assassination Rogue, actor 19. A
 * fight core built from it directly can yield exactly one analyzed player, so
 * "one ingestion served twenty analyses" would be unprovable — every extra player
 * would fail closed with no combatant profile, and the test would pass while
 * proving nothing.
 *
 * So each raw event is cloned once per requested actor with `sourceID` and
 * `targetID` remapped, and the clones are emitted ADJACENT to the original. Two
 * properties of the real pipeline survive that, and both matter: the events stay
 * in timestamp order, and within each actor a cast still precedes its own
 * consequences — which is the ordering M4's state engine depends on.
 *
 * The events are then normalized by the REAL normalizer under the real contracts.
 * Nothing here fabricates a normalized event.
 */
function fannedRawEvents(actorIds: readonly number[]): readonly Record<string, unknown>[] {
  const fanned: Record<string, unknown>[] = [];
  for (const event of M5D2_RAW_EVENTS) {
    for (const actorId of actorIds) {
      if (actorId === M5D2_ACTOR) {
        fanned.push(event as Record<string, unknown>);
        continue;
      }
      const clone: Record<string, unknown> = { ...event };
      if (clone["sourceID"] === M5D2_ACTOR) clone["sourceID"] = actorId;
      if (clone["targetID"] === M5D2_ACTOR) clone["targetID"] = actorId;
      fanned.push(clone);
    }
  }
  return fanned;
}

/**
 * A `NormalizedFightCore` carrying the real M5-D2 corpus.
 *
 * `participants` are every player in the pull; `eventActorIds` are the ones the
 * corpus actually describes. A participant outside that set is a player whose
 * combatant profile the report never supplied — which real reports do, and which
 * the analyzer must fail closed on rather than analyze.
 */
export function corpusCore(
  fightId: number,
  participants: readonly number[],
  eventActorIds: readonly number[],
): NormalizedFightCore {
  // The fan-out is a TEST PREMISE, and the corpus interpreter applies it to the
  // D2 grants: every grant that vouches for actor 19 vouches for each clone,
  // because a clone set is complete exactly where the original's events are.
  const fixture = m5d2FightFrom(fannedRawEvents(eventActorIds), {
    kind: "FANNED_ACTORS",
    sourceActorId: M5D2_ACTOR,
    actorIds: eventActorIds,
  });
  const enemies = [21, 22];
  const actors = new Map(
    [...participants, ...enemies].map((actorId) => {
      const enemy = enemies.includes(actorId);
      return [
        actorId,
        {
          actorId,
          gameId: null,
          name: `Raider${String(actorId)}`,
          server: null,
          actorType: (enemy ? "NPC" : "PLAYER") as "NPC" | "PLAYER",
          rawType: enemy ? "NPC" : "Player",
          subType: enemy ? "Boss" : "Rogue",
          petOwnerActorId: null,
        },
      ] as const;
    }),
  );

  return {
    provenance: { ...fixture.provenance, fightId },
    report: fixture.report,
    data: fixture.data,
    fight: { ...fixture.fight, id: fightId },
    actors,
    abilities: fixture.abilities,
    phases: fixture.phases,
    events: fixture.events,
    malformedObservations: fixture.malformedObservations,
    streams: fixture.completeness.streams,
    streamIdsBySource: {
      EVENTS_ALL_STREAM: ["all"],
      TYPED_GRAPHQL_FIELD: ["all"],
      TYPED_GRAPHQL_FIELD_PER_ACTOR: ["all"],
      REPORT_MASTER_DATA: ["all"],
    },
    degradedCategories: new Set(),
    streamsWithUntypedDefects: new Set(),
    friendlyPlayers: [...participants],
    // Queried for one actor and genuinely absent, which is M7-B's
    // queried-but-null case rather than never-queried.
    // M8-C context. This fixture carries the real M5-D2 corpus, and its purpose
    // is authority output; the encounter facts are deliberately unresolved so
    // nothing here can depend on them.
    encounterOutcome: NO_ENCOUNTER_OUTCOME_FACTS,
    zone: null,
    talentImport: { actorId: participants[0] ?? 0, code: null },
  };
}

export interface FakePorts {
  readonly deps: RaidNightServiceDeps;
  /** How many times roster discovery was called. Must be 1 per request. */
  rosterCalls(): number;
  /** Which fights were ingested, in order. Length is the ingestion count. */
  ingestedFightIds(): readonly number[];
  /** The expected revision each ingestion was pinned to. */
  ingestedExpectations(): readonly (number | undefined)[];
  revisionCalls(): number;
}

export interface FakePortOptions {
  readonly snapshot: ReportRosterSnapshot;
  /**
   * Which actors the ingested corpus describes. Defaults to every participant,
   * so every present supported player is genuinely analyzable.
   */
  readonly eventActorIds?: readonly number[];
  /** Per-fight ingestion failure, keyed by fight id. */
  readonly ingestionFailures?: ReadonlyMap<number, IngestionFailureReason>;
  /** The revision each fight's context reports. Defaults to the snapshot's R0. */
  readonly contextRevisions?: ReadonlyMap<number, number>;
  /** What the final revision confirmation returns. Defaults to MATCHES at R0. */
  readonly finalRevision?: RevisionCheck;
  readonly rosterFailure?: ReportRosterResult;
}

export function fakePorts(options: FakePortOptions): FakePorts {
  const snapshot = options.snapshot;
  let rosterCalls = 0;
  let revisionCalls = 0;
  const ingested: number[] = [];
  const expectations: (number | undefined)[] = [];

  const deps: RaidNightServiceDeps = {
    env: ENV,
    discoverRoster: async () => {
      rosterCalls += 1;
      return options.rosterFailure ?? { ok: true, snapshot, rateLimit: undefined };
    },
    ingestFightCore: async (request) => {
      ingested.push(request.fightId);
      expectations.push(request.expectedReportRevision);

      const failure = options.ingestionFailures?.get(request.fightId);
      if (failure !== undefined) {
        return { ok: false, failure: { reason: failure } } satisfies FightCoreIngestionResult;
      }

      // The pre-pagination revision gate, as the real ingestor applies it.
      const contextRevision =
        options.contextRevisions?.get(request.fightId) ?? snapshot.identity.reportRevision;
      if (
        request.expectedReportRevision !== undefined &&
        contextRevision !== request.expectedReportRevision
      ) {
        return { ok: false, failure: { reason: "REPORT_REVISION_CHANGED" } };
      }

      const participants =
        snapshot.fights
          .find((fight) => fight.fightId === request.fightId)
          ?.participants.map((entry) => entry.sourceId) ?? [];
      const core = corpusCore(request.fightId, participants, options.eventActorIds ?? participants);
      return {
        ok: true,
        core: { ...core, report: { ...core.report, revision: contextRevision } },
        rateLimit: undefined,
      };
    },
    checkRevision: async (_code, expected) => {
      revisionCalls += 1;
      return options.finalRevision ?? { outcome: "MATCHES", revision: expected };
    },
  };

  return {
    deps,
    rosterCalls: () => rosterCalls,
    ingestedFightIds: () => [...ingested],
    ingestedExpectations: () => [...expectations],
    revisionCalls: () => revisionCalls,
  };
}

export async function runNight(request: RaidNightRequest, ports: FakePorts): Promise<RaidNightRunResult> {
  return await analyzeRaidNight(request, ports.deps);
}

/** A snapshot whose participants all play the analysed Assassination Rogue. */
export function assassinationSnapshot(options: {
  readonly fightIds: readonly number[];
  readonly sourceIds: readonly number[];
  readonly requestedFightIds?: readonly number[];
  readonly specNameFor?: (fightId: number, sourceId: number) => string | null;
  readonly absentOn?: ReadonlyMap<number, readonly number[]>;
}): ReportRosterSnapshot {
  const players: readonly RosterPlayer[] = options.sourceIds.map((sourceId) =>
    rosterPlayerFor({ sourceId, name: `Raider${String(sourceId)}` }),
  );
  const fights: readonly RosterFight[] = options.fightIds.map((fightId) => {
    const absent = new Set(options.absentOn?.get(fightId) ?? []);
    return rosterFightFor({
      fightId,
      participants: options.sourceIds
        .filter((sourceId) => !absent.has(sourceId))
        .map((sourceId) => ({
          sourceId,
          // Not `?? "Assassination"`: `specNameFor` returning null is the case
          // where Warcraft Logs supplied no usable specialization, and collapsing
          // it into the default would silently delete that test.
          specName:
            options.specNameFor === undefined ? "Assassination" : options.specNameFor(fightId, sourceId),
        })),
    });
  });
  return snapshotFor({
    players,
    fights,
    ...(options.requestedFightIds === undefined ? {} : { requestedFightIds: options.requestedFightIds }),
  });
}
