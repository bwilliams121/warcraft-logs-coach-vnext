/**
 * The Milestone 2 preflight query and its envelope decoder.
 *
 * One round trip, no over-fetch. Only what is needed to establish that the
 * requested report, fight and player exist and belong together, plus the report
 * provenance a later milestone needs to judge data compatibility.
 *
 * Deliberately absent: events, tables, graphs, rankings, playerDetails,
 * combatantInfo, talents, gear. Those belong to event ingestion, not identity.
 *
 * `allowUnlisted: true` is explicit. The caller supplies the report code
 * directly and the code is itself the capability, so this widens nobody's
 * access: we never enumerate, publish or cache report codes. Private reports
 * remain out of reach — they need user-authorized OAuth, which is deferred.
 *
 * `actors` is NOT filtered by `type: "Player"`. Fetching every actor is what
 * lets a supplied pet or NPC ID be reported as SOURCE_NOT_A_PLAYER instead of
 * being indistinguishable from a source ID that does not exist at all.
 */

import type { DecodeOutcome } from "./graphql-client.js";
import { isRecord, readArray, readInteger, readNullableInteger, readRecord, readString } from "./decode.js";
import type { PreflightRequest } from "./types.js";

export const PREFLIGHT_QUERY = `query CoachPreflight($code: String!, $fightIDs: [Int]) {
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
      masterData {
        logVersion
        gameVersion
        actors {
          id
          name
          type
          subType
        }
      }
      fights(fightIDs: $fightIDs) {
        id
        name
        encounterID
        difficulty
        startTime
        endTime
        friendlyPlayers
        friendlySpecs
      }
    }
  }
}`;

export function preflightVariables(request: PreflightRequest): Record<string, unknown> {
  return { code: request.reportCode, fightIDs: [request.fightId] };
}

/**
 * The report envelope, validated.
 *
 * `actors` and `fights` stay `unknown[]` on purpose. Their elements are
 * interpreted in `identity.ts`, where the ordered per-element rules live: an
 * unrelated malformed actor must not fail a request that does not concern it.
 */
export interface PreflightReport {
  readonly code: string;
  readonly revision: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly logVersion: number;
  /** Nullable in the WCL schema. Null is recorded, never inferred, never fatal. */
  readonly gameVersion: number | null;
  readonly actors: readonly unknown[];
  readonly fights: readonly unknown[];
}

export interface PreflightPayload {
  /** `null` means Warcraft Logs did not serve the report — it may not exist, or may be private. */
  readonly report: PreflightReport | null;
}

export function decodePreflight(data: unknown): DecodeOutcome<PreflightPayload> {
  if (!isRecord(data)) {
    return { ok: false };
  }

  const reportData = readRecord(data, "reportData");
  if (reportData === undefined) {
    return { ok: false };
  }

  if (!("report" in reportData)) {
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
  const startTime = readInteger(report, "startTime");
  const endTime = readInteger(report, "endTime");
  const masterData = readRecord(report, "masterData");
  if (
    code === undefined ||
    revision === undefined ||
    startTime === undefined ||
    endTime === undefined ||
    masterData === undefined
  ) {
    return { ok: false };
  }

  const logVersion = readInteger(masterData, "logVersion");
  const gameVersion = readNullableInteger(masterData, "gameVersion");
  const actors = readArray(masterData, "actors");
  const fights = readArray(report, "fights");
  if (logVersion === undefined || gameVersion === undefined || actors === undefined || fights === undefined) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      report: { code, revision, startTime, endTime, logVersion, gameVersion, actors, fights },
    },
  };
}
