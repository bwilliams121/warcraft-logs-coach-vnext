/**
 * Typed metadata for ONE external candidate pull. No events, ever.
 *
 * WHY THIS IS NOT `FIGHT_CONTEXT_QUERY`
 *
 * Two reasons, and the second is the important one.
 *
 * First, `talentImportCode(actorID:)` needs an actor id, and for an external
 * candidate we do not have one yet — a ranking row carries no source id. Sending
 * an arbitrary id would request per-actor data about a player we have not
 * identified, for a field nothing in M8-F reads.
 *
 * Second and structurally: the ingestion path exists to be followed by event
 * retrieval. `ingestFightCore` issues the context query and then paginates
 * events. Reusing it and "just not using the events" would put the expensive
 * call one edit away from an external report. A separate, smaller document that
 * physically cannot page events is the version of that rule nobody can
 * accidentally break.
 *
 * ONE REQUEST PER CANDIDATE. This document is issued at most
 * `MAX_QUALIFIED_CANDIDATES` times per discovery, and there is no second round
 * trip: master data, fight facts, archive status and the M8-C outcome fields all
 * arrive together, exactly as they do for a local fight.
 */

import { isRecord, readArray, readInteger, readNullableInteger, readRecord, readString } from "../decode.js";
import type { DecodeOutcome } from "../graphql-client.js";
import type { RawArchiveStatus, RawFightContextReport } from "../fight-context-query.js";

/**
 * The document.
 *
 * A near-subset of `FIGHT_CONTEXT_QUERY`: the same typed fields, minus
 * `talentImportCode`, minus `phases`/`phaseTransitions` (phase TIMELINE is
 * event-adjacent analysis this checkpoint does not do), and minus `abilities`
 * (nothing here reads an ability).
 *
 * `masterData.actors` IS selected, because source-id resolution needs the actor
 * catalog and there is no cheaper way to obtain one. M8-A measured this shape at
 * roughly 1-3 API points per candidate, scaling with actor-catalog size rather
 * than with fight length.
 */
export const CANDIDATE_METADATA_QUERY = `query CoachExternalCandidateMetadata($code: String!, $fightIDs: [Int]) {
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
        lastPhase
        lastPhaseAsAbsoluteIndex
        lastPhaseIsIntermission
        bossPercentage
        fightPercentage
        wipeCalledTime
      }
    }
  }
}`;

export function candidateMetadataVariables(reportCode: string, fightId: number): Record<string, unknown> {
  return { code: reportCode, fightIDs: [fightId] };
}

/**
 * The decoded report, in the SAME shape M3 normalization already consumes.
 *
 * Reusing `RawFightContextReport` is deliberate: `normalizeFightContext` and
 * `normalizeZone` then apply unchanged, so external candidates get M3's decoding
 * rules and M8-C's outcome facts rather than a parallel implementation that
 * could disagree about a null.
 *
 * `abilities` and `phases` are supplied empty because the document does not
 * select them. That is honest for this path: no phase claim is made about an
 * external candidate anywhere in M8-F, and M8-C outcome facts are fight-level
 * scalars that need no timeline.
 */
export interface CandidateMetadataPayload {
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

export function decodeCandidateMetadata(data: unknown): DecodeOutcome<CandidateMetadataPayload> {
  if (!isRecord(data)) {
    return { ok: false };
  }
  const reportData = readRecord(data, "reportData");
  if (reportData === undefined || !("report" in reportData)) {
    return { ok: false };
  }
  const report = reportData["report"];
  if (report === null) {
    // Warcraft Logs knows no such report, or will not serve it to this token.
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
      report: {
        code,
        revision,
        startTimeUnixMs,
        endTimeUnixMs,
        logVersion,
        gameVersion,
        actors,
        // Not selected by this document. Empty is accurate rather than a gap:
        // nothing in external qualification reads an ability or a phase.
        abilities: [],
        phases: [],
        fights,
        archiveStatus: decodeArchiveStatus(report),
        zone: report["zone"],
        // Not selected by this document.
        region: { state: "NOT_RETRIEVED" },
      },
    },
  };
}
