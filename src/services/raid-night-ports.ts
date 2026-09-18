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
import type { ThrownErrorName, WclFailureReason, WclFailureStage } from "../wcl/types.js";

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

/**
 * The one structured diagnostic a raid night may emit (M11-A5).
 *
 * FIXED VOCABULARY ONLY. Every field is an enum member, an integer, a boolean
 * or null. There is no free-text field, so no upstream message, exception text,
 * header, token or evidence can be carried by construction. It exists because
 * the public `REPORT_REVISION_UNVERIFIED` document is deliberately opaque, and
 * production needed one sanctioned place to say WHY the final revision read
 * failed.
 */
export interface RaidNightDiagnosticRecord {
  readonly event: "RAID_NIGHT_REVISION_UNVERIFIED";
  readonly stage: "FINAL_REVISION_CHECK";
  /** Which side failed: the transport, the report not being served, or a MATCHES for some other revision. */
  readonly cause: "UPSTREAM" | "REPORT_NOT_SERVED" | "REVISION_MISMATCH";
  readonly reason: WclFailureReason | null;
  readonly wclStage: WclFailureStage | null;
  readonly httpStatus: number | null;
  readonly graphqlErrorCount: number | null;
  readonly errorName: ThrownErrorName | null;
  readonly isTimeout: boolean | null;
  readonly outboundIndex: number | null;
}

/** Receives the diagnostic record. Production writes it to the Worker log; tests capture it. */
export type RaidNightDiagnosticsPort = (record: RaidNightDiagnosticRecord) => void;
