/**
 * The ports raid-night orchestration depends on.
 *
 * Three function types and nothing else from the Warcraft Logs layer, for the
 * same reason `ingestion-port.ts` exists: the service cannot reach the network on
 * its own. It holds no GraphQL shape, no page type, no `unknown` — it depends on
 * the normalized model and the request, and on nothing from the wire format.
 *
 * Declared here rather than imported from `src/wcl/` so the service layer keeps
 * its own vocabulary and a test can substitute all three without a transport.
 */

import type { WclCredentials } from "../config/env.js";
import type { FightCoreIngestionRequest, FightCoreIngestionResult } from "../wcl/ingest-fight.js";
import type { RevisionCheck } from "../wcl/report-revision.js";
import type { ReportRosterRequest, ReportRosterResult } from "../wcl/report-roster.js";

/** M7-C roster discovery. One call per raid-night request. */
export type RosterDiscoveryPort = (
  request: ReportRosterRequest,
  credentials: WclCredentials,
) => Promise<ReportRosterResult>;

/**
 * M7-B actor-independent fight retrieval.
 *
 * At most one call per fight that needs analyzing, and none for a fight that does
 * not. The `expectedReportRevision` on the request is what makes a moved report
 * fail before a single event page is requested.
 */
export type FightCoreIngestionPort = (
  request: FightCoreIngestionRequest,
  credentials: WclCredentials,
) => Promise<FightCoreIngestionResult>;

/**
 * The final report-revision confirmation.
 *
 * Returns what M7-C's guard established, without deciding what it permits —
 * that judgement belongs to the caller that knows what the snapshot is for.
 */
export type ReportRevisionPort = (
  reportCode: string,
  expectedRevision: number,
  credentials: WclCredentials,
) => Promise<RevisionCheck>;
