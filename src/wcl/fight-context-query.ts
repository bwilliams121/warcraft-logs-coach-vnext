/**
 * The ingestion context query.
 *
 * One round trip for everything event retrieval needs but cannot get from
 * events: master data, fight boundaries, archive status, and — importantly —
 * encounter phases.
 *
 * Phases come from TYPED GraphQL fields (`ReportFight.phaseTransitions` and
 * `Report.phases`), not from the non-frozen events JSON. That is a deliberate
 * preference: `PhaseTransition.startTime` is a report-relative timestamp and
 * `PhaseMetadata.isIntermission` is a boolean, both part of the frozen schema,
 * so intermission evidence does not depend on parsing an unstable payload. The
 * schema also documents that loading phases does not double-charge API points
 * when fights are already being loaded.
 *
 * This document is a superset of the Milestone 2 preflight query. It is used
 * ONLY by the ingestion path, which is not wired into `/v1/analysis`, so the
 * two never both run for one request. When ingestion becomes live, the live
 * preflight collapses into this document rather than both being issued.
 */

import { isRecord, readArray, readInteger, readNullableInteger, readRecord, readString } from "./decode.js";
import type { DecodeOutcome } from "./graphql-client.js";

export const FIGHT_CONTEXT_QUERY = `query CoachFightContext($code: String!, $fightIDs: [Int], $actorID: Int!) {
  rateLimitData {
    limitPerHour
    pointsSpentThisHour
    pointsResetIn
  }
  reportData {
    report(code: $code, allowUnlisted: true) {
      code
      revision
      startTime
      endTime
      archiveStatus {
        isArchived
        isAccessible
        archiveDate
      }
      masterData {
        logVersion
        gameVersion
        actors {
          id
          gameID
          name
          server
          type
          subType
          petOwner
        }
        abilities {
          gameID
          name
          type
        }
      }
      phases {
        encounterID
        separatesWipes
        phases {
          id
          name
          isIntermission
        }
      }
      fights(fightIDs: $fightIDs) {
        id
        name
        encounterID
        difficulty
        size
        kill
        inProgress
        startTime
        endTime
        friendlyPlayers
        friendlySpecs
        talentImportCode(actorID: $actorID)
        phaseTransitions {
          id
          startTime
        }
      }
    }
  }
}`;

export function fightContextVariables(
  reportCode: string,
  fightId: number,
  actorId: number,
): Record<string, unknown> {
  return { code: reportCode, fightIDs: [fightId], actorID: actorId };
}

/**
 * The post-pagination revision check.
 *
 * `revision` increases when a report is re-exported. If it changed while a
 * multi-page fight was being ingested, the pages may straddle two exports and
 * the dataset mixes revisions — which is NOT representable as PARTIAL, because
 * PARTIAL means "less evidence than requested", not "evidence from two
 * different worlds".
 *
 * Checked once at the end rather than per page: a mid-pagination change fails
 * the whole ingestion either way, so detecting it at the end is equally correct
 * and costs one request instead of doubling them.
 */
export const REPORT_REVISION_QUERY = `query CoachReportRevision($code: String!) {
  reportData {
    report(code: $code, allowUnlisted: true) {
      revision
    }
  }
}`;

export function reportRevisionVariables(reportCode: string): Record<string, unknown> {
  return { code: reportCode };
}

export function decodeReportRevision(data: unknown): DecodeOutcome<number | null> {
  if (!isRecord(data)) {
    return { ok: false };
  }
  const reportData = readRecord(data, "reportData");
  if (reportData === undefined || !("report" in reportData)) {
    return { ok: false };
  }
  const report = reportData["report"];
  if (report === null) {
    return { ok: true, value: null };
  }
  if (!isRecord(report)) {
    return { ok: false };
  }
  const revision = readInteger(report, "revision");
  return revision === undefined ? { ok: false } : { ok: true, value: revision };
}

export interface RawArchiveStatus {
  readonly isArchived: boolean;
  readonly isAccessible: boolean;
  readonly archiveDate: number | null;
}

export interface RawFightContextReport {
  readonly code: string;
  readonly revision: number;
  readonly startTimeUnixMs: number;
  readonly endTimeUnixMs: number;
  readonly logVersion: number;
  readonly gameVersion: number | null;
  /** Interpreted in the normalization layer, where per-element rules live. */
  readonly actors: readonly unknown[];
  readonly abilities: readonly unknown[];
  readonly phases: readonly unknown[];
  readonly fights: readonly unknown[];
  /**
   * `null` when Warcraft Logs did not supply it.
   *
   * The schema documents `isAccessible` as always false without user
   * authentication, so an archived report is inaccessible to this deployment's
   * client-credentials token. Absent status is NOT treated as "not archived".
   */
  readonly archiveStatus: RawArchiveStatus | null;
}

export interface FightContextPayload {
  readonly report: RawFightContextReport | null;
}

function decodeArchiveStatus(report: Record<string, unknown>): RawArchiveStatus | null {
  const raw = readRecord(report, "archiveStatus");
  if (raw === undefined) {
    return null;
  }
  const isArchived = raw["isArchived"];
  const isAccessible = raw["isAccessible"];
  if (typeof isArchived !== "boolean" || typeof isAccessible !== "boolean") {
    return null;
  }
  return { isArchived, isAccessible, archiveDate: readNullableInteger(raw, "archiveDate") ?? null };
}

export function decodeFightContext(data: unknown): DecodeOutcome<FightContextPayload> {
  if (!isRecord(data)) {
    return { ok: false };
  }

  const reportData = readRecord(data, "reportData");
  if (reportData === undefined || !("report" in reportData)) {
    return { ok: false };
  }

  const report = reportData["report"];
  if (report === null) {
    return { ok: true, value: { report: null } };
  }
  if (!isRecord(report)) {
    return { ok: false };
  }

  const code = readString(report, "code");
  const revision = readInteger(report, "revision");
  const startTimeUnixMs = readInteger(report, "startTime");
  const endTimeUnixMs = readInteger(report, "endTime");
  const masterData = readRecord(report, "masterData");
  if (
    code === undefined ||
    revision === undefined ||
    startTimeUnixMs === undefined ||
    endTimeUnixMs === undefined ||
    masterData === undefined
  ) {
    return { ok: false };
  }

  const logVersion = readInteger(masterData, "logVersion");
  const gameVersion = readNullableInteger(masterData, "gameVersion");
  const actors = readArray(masterData, "actors");
  const abilities = readArray(masterData, "abilities");
  const fights = readArray(report, "fights");
  if (
    logVersion === undefined ||
    gameVersion === undefined ||
    actors === undefined ||
    abilities === undefined ||
    fights === undefined
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      report: {
        code,
        revision,
        startTimeUnixMs,
        endTimeUnixMs,
        logVersion,
        gameVersion,
        actors,
        abilities,
        // Phases are optional upstream; an absent list is an empty list of
        // observations, not a decode failure.
        phases: readArray(report, "phases") ?? [],
        fights,
        archiveStatus: decodeArchiveStatus(report),
      },
    },
  };
}
