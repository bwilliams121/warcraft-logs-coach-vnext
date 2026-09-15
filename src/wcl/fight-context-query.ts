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
      zone {
        id
        name
        frozen
        expansion {
          id
          name
        }
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
        lastPhase
        lastPhaseAsAbsoluteIndex
        lastPhaseIsIntermission
        bossPercentage
        fightPercentage
        wipeCalledTime
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
 * The post-pagination revision check lives in `report-revision.ts`.
 *
 * It was defined here while ingestion was its only caller. Roster discovery and
 * a future raid-night batch now ask the same question, and three copies of
 * "read the revision" would eventually disagree about what an inaccessible
 * report means — so the query, its variables and its decoder moved to one home.
 *
 * Why M3 still checks after pagination is unchanged and worth restating: if the
 * revision moved while a multi-page fight was being retrieved, the pages may
 * straddle two exports and the dataset mixes revisions. That is NOT representable
 * as PARTIAL, because PARTIAL means "less evidence than requested", not "evidence
 * from two different worlds".
 */

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
   * `Report.zone`, carried raw.
   *
   * Interpreted by `normalizeZone`, alongside every other per-element rule. The
   * schema documents the null case — "null if no supported zone exists" — so an
   * absent zone is a fact about the report rather than a decode failure, and it
   * must never fail an otherwise sound ingestion.
   */
  readonly zone: unknown;
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
        // Passed through untouched. A report with no supported zone is normal.
        zone: report["zone"],
      },
    },
  };
}
