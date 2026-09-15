/**
 * Builders for M8-F external discovery.
 *
 * The ranking row builder reproduces the EXACT key set M8-A observed in a live
 * page of 100 rows — including `amount`, `faction` and `guild`, which the
 * decoder deliberately ignores. Keeping them here is the point: a test row that
 * omitted them would not prove the decoder refuses to carry a parse metric.
 *
 * Real player names, report codes and servers from the capture are NOT
 * committed. The shape is the evidence; the identities are third parties'.
 */

import type { RawFightContextReport } from "../../src/wcl/fight-context-query.js";
import type { ExternalCandidateDescriptor } from "../../src/external-context/candidate-pool.js";
import type { PullContext } from "../../src/comparison/pull-identity.js";

export const SUBJECT_REPORT = "aBcDeFgH12345678";
export const SUBJECT_REVISION = 30;
export const ENCOUNTER_ID = 3420;
export const DIFFICULTY = 4;

/** One raw ranking row, in the observed shape. */
export function rankingRow(options: {
  readonly code: string;
  readonly fightID: number;
  readonly durationMs: number;
  readonly name?: string;
  readonly server?: { readonly id: number; readonly name: string; readonly region: string } | null;
  readonly hidden?: boolean;
  readonly spec?: string;
}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    name: options.name ?? "Refplayer",
    class: "Rogue",
    spec: options.spec ?? "Assassination",
    // The ranked metric. Observed, and deliberately never decoded.
    amount: 244075.07961979,
    hardModeLevel: 0,
    duration: options.durationMs,
    startTime: 1_789_341_185_411,
    report: { code: options.code, fightID: options.fightID, startTime: 1_789_338_770_370 },
    bracketData: 325,
    faction: 1,
    size: 25,
    guild: { id: 1, name: "Someguild", faction: 1 },
  };
  if (options.hidden === true) {
    row["hidden"] = true;
  } else if (options.server !== null) {
    row["server"] = options.server ?? { id: 340, name: "Testrealm", region: "EU" };
  }
  return row;
}

/** A well-formed `characterRankings` payload. */
export function rankingPayload(
  rows: readonly Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { page: 1, hasMorePages: true, count: rows.length, rankings: rows, ...overrides };
}

/** A raw metadata report for one external candidate. */
export function candidateReport(options: {
  readonly code: string;
  readonly fightId: number;
  readonly encounterId?: number;
  readonly difficulty?: number | null;
  readonly revision?: number;
  readonly startTimeMs?: number;
  readonly endTimeMs?: number;
  readonly kill?: boolean | null;
  readonly actors?: readonly unknown[];
  readonly archiveStatus?: { isArchived: boolean; isAccessible: boolean; archiveDate: number | null } | null;
  readonly fights?: readonly unknown[];
  readonly gameVersion?: number | null;
  readonly logVersion?: number;
}): RawFightContextReport {
  const startTimeMs = options.startTimeMs ?? 1_000;
  const endTimeMs = options.endTimeMs ?? 285_791;
  return {
    code: options.code,
    revision: options.revision ?? 22,
    startTimeUnixMs: 1_700_000_000_000,
    endTimeUnixMs: 1_700_000_900_000,
    logVersion: options.logVersion ?? 17,
    gameVersion: options.gameVersion === undefined ? 1 : options.gameVersion,
    actors: options.actors ?? [
      { id: 25, name: "Refplayer", server: "Testrealm", type: "Player", subType: "Rogue" },
      { id: 90, name: "Sszorak", type: "NPC", subType: "Boss" },
    ],
    abilities: [],
    phases: [],
    fights: options.fights ?? [
      {
        id: options.fightId,
        name: "Sszorak",
        encounterID: options.encounterId ?? ENCOUNTER_ID,
        difficulty: options.difficulty === undefined ? DIFFICULTY : options.difficulty,
        size: 25,
        kill: options.kill === undefined ? true : options.kill,
        inProgress: false,
        startTime: startTimeMs,
        endTime: endTimeMs,
        friendlyPlayers: [25],
        friendlySpecs: ["Assassination"],
        lastPhase: 1,
        lastPhaseAsAbsoluteIndex: 4,
        lastPhaseIsIntermission: false,
        bossPercentage: 0.04,
        fightPercentage: 0.04,
        wipeCalledTime: null,
      },
    ],
    archiveStatus: options.archiveStatus === undefined ? null : options.archiveStatus,
    zone: { id: 53, name: "The Venomous Abyss", frozen: false, expansion: { id: 7, name: "Midnight" } },
  };
}

export function descriptorFor(options: {
  readonly code: string;
  readonly fightId: number;
  readonly durationMs?: number;
  readonly playerName?: string;
  readonly serverName?: string | null;
}): ExternalCandidateDescriptor {
  return {
    reportCode: options.code,
    fightId: options.fightId,
    playerName: options.playerName ?? "Refplayer",
    className: "Rogue",
    specName: "Assassination",
    durationMs: options.durationMs ?? 284_791,
    startTimeUnixMs: 1_789_341_185_411,
    reportStartTimeUnixMs: 1_789_338_770_370,
    serverName: options.serverName === undefined ? "Testrealm" : options.serverName,
    serverRegion: "EU",
    bracketData: 325,
    raidSize: 25,
    hardModeLevel: 0,
  };
}

/** The subject pull external references are gathered for. */
export function subjectPull(overrides: Partial<PullContext> = {}): PullContext {
  return {
    identity: {
      reportCode: SUBJECT_REPORT,
      reportRevision: SUBJECT_REVISION,
      fightId: 6,
      encounterId: ENCOUNTER_ID,
      difficulty: DIFFICULTY,
      version: { gameVersion: 1, logVersion: 17, partition: null },
    },
    outcome: "KILL",
    durationMs: 307_910,
    raidSize: 24,
    ...overrides,
  };
}
