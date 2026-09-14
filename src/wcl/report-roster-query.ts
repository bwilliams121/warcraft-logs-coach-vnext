/**
 * The roster-discovery query and its envelope decoder.
 *
 * ONE ROUND TRIP FOR THE WHOLE RAID NIGHT'S FACTUAL ROSTER.
 *
 * `ReportFight` accepts a `fightIDs: [Int]` argument, so every selected fight
 * comes back from a single request — the same mechanism the M2 preflight already
 * uses with a one-element list. That is what makes roster discovery cost one
 * query rather than one per fight, and it is why nothing here loops.
 *
 * WHAT IT RETRIEVES, AND WHY EACH FIELD EARNS ITS PLACE
 *
 *     report.revision          R0 — the snapshot every later fact must belong to
 *     report.code/start/end    report identity and its wall-clock window
 *     masterData.logVersion    data-version provenance
 *     masterData.gameVersion   likewise; nullable upstream, recorded honestly
 *     masterData.actors        the REPORT-LEVEL identity space roster ids resolve against
 *     fights.friendlyPlayers   who participated, per fight
 *     fights.friendlySpecs     what they played, per fight, index-aligned
 *     fights.<metadata>        factual fight identity a later summary will need
 *
 * WHAT IT DELIBERATELY DOES NOT RETRIEVE
 *
 * Events, of any kind. No `events` paginator, no `dataType`, no resources, no
 * pagination cursor. Roster discovery is identity work, and a query that could
 * reach the event stream would eventually be asked to.
 *
 * Also absent, each for its own reason:
 *
 * - `talentImportCode(actorID:)` — per-actor, and roster discovery has no actor
 *   to ask about. Adding it would force this query to pick one player, which is
 *   exactly the coupling M7-B removed. See `fight-core.ts`.
 * - `archiveStatus` — an archived report's EVENTS are unreachable, which matters
 *   to ingestion. Roster facts come from typed fields that are served anyway, so
 *   gating discovery on it would refuse a snapshot we can actually produce.
 * - `phases`, `phaseTransitions`, `abilities`, `petOwner`, `inProgress` — all
 *   real ingestion needs, none of them roster facts.
 * - `playerDetails`, `rankings`, `table`, `graph` — non-frozen JSON surfaces
 *   costing extra points for data reachable from typed fields.
 *
 * `allowUnlisted: true` matches every other query in this repository: the caller
 * supplies the report code and the code is itself the capability.
 */

import { isRecord, readArray, readInteger, readNullableInteger, readRecord, readString } from "./decode.js";
import type { DecodeOutcome } from "./graphql-client.js";

export const REPORT_ROSTER_QUERY = `query CoachReportRoster($code: String!, $fightIDs: [Int]) {
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
          server
          type
          subType
        }
      }
      fights(fightIDs: $fightIDs) {
        id
        name
        encounterID
        difficulty
        size
        kill
        startTime
        endTime
        friendlyPlayers
        friendlySpecs
      }
    }
  }
}`;

/**
 * Builds the variables for one roster read.
 *
 * The caller's selected fight ids are passed through verbatim. This function
 * does NOT default an empty list to "all fights": omitting `fightIDs` makes
 * Warcraft Logs return every fight in the report, which would silently discover
 * a different set than the one requested. Rejecting an empty selection is the
 * port's job, and it does so before reaching here.
 */
export function reportRosterVariables(
  reportCode: string,
  fightIds: readonly number[],
): Record<string, unknown> {
  return { code: reportCode, fightIDs: [...fightIds] };
}

/**
 * The report envelope, validated.
 *
 * `actors` and `fights` stay `unknown[]` on purpose, exactly as the preflight
 * decoder leaves them. Their elements are interpreted in `roster-snapshot.ts`,
 * where the ordered per-element rules live: an unrelated malformed actor must
 * not fail a request that does not concern it.
 */
export interface RosterReport {
  readonly code: string;
  readonly revision: number;
  readonly startTimeUnixMs: number;
  readonly endTimeUnixMs: number;
  readonly logVersion: number;
  /** Nullable in the WCL schema. Null is recorded, never inferred, never fatal. */
  readonly gameVersion: number | null;
  readonly actors: readonly unknown[];
  readonly fights: readonly unknown[];
}

export interface RosterPayload {
  /** `null` means Warcraft Logs did not serve the report — missing, or private. */
  readonly report: RosterReport | null;
}

export function decodeReportRoster(data: unknown): DecodeOutcome<RosterPayload> {
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
  const fights = readArray(report, "fights");
  if (logVersion === undefined || gameVersion === undefined || actors === undefined || fights === undefined) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      report: { code, revision, startTimeUnixMs, endTimeUnixMs, logVersion, gameVersion, actors, fights },
    },
  };
}
