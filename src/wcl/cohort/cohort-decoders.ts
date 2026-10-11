/**
 * Fail-closed decoders for the M11-G1 surfaces (see `cohort-queries.ts`).
 *
 * All three are Warcraft Logs JSON surfaces documented as "not considered
 * frozen". Every field read here was observed in the committed G1 capture
 * (`tests/evidence/artifacts/wcl-graphql/wcl-g1-*`), and anything else is
 * refused with a named defect rather than guessed. What a value MEANS is
 * pinned by that capture and recorded beside each field; nothing is inferred
 * from a field name.
 *
 * SEPARATE FROM M8. `RankedCohortRow` carries the ranked `amount`, which the
 * M8 behavioural-context type (`rankings-decoder.ts`) is deliberately unable
 * to carry. The two never mix: this type exists only for the G cohort domain.
 */

import {
  isFiniteNumber,
  isRecord,
  isSafeInteger,
  readArray,
  readInteger,
  readRecord,
  readString,
} from "../decode.js";
import { normalizeGear } from "../../engine/normalization/combatant-info.js";
import type { GearPiece } from "../../engine/normalization/normalized-events.js";

export const COHORT_DECODER_REVISION = "g1-cohort-decoders-1";

export type CohortDecodeDefect =
  | "REPORT_DATA_MISSING"
  | "FIGHTS_MISSING"
  | "FIGHT_FIELD_UNUSABLE"
  | "TABLE_MISSING"
  | "TABLE_FIELD_UNUSABLE"
  | "TABLE_ENTRY_UNUSABLE"
  | "RANKINGS_UNUSABLE"
  | "RANKING_CHARACTER_UNUSABLE"
  | "RANKINGS_PAGE_UNUSABLE"
  | "RANKING_ROW_UNUSABLE"
  | "ACTORS_UNUSABLE"
  | "PLAYER_DETAILS_UNUSABLE"
  | "DEATHS_UNUSABLE";

export interface DecodedFightHeader {
  readonly fightId: number;
  readonly encounterId: number;
  readonly difficulty: number | null;
  /** `kill`, verbatim; `null` when Warcraft Logs supplied none. Never defaulted. */
  readonly kill: boolean | null;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
}

/** One character row of a report's own rankings for one fight. */
export interface ReportRankingCharacter {
  readonly name: string;
  readonly serverName: string | null;
  readonly className: string;
  readonly specName: string;
  /** The ranked dps `amount` (pinned: = DamageDone `total` / fight seconds). */
  readonly amount: number;
  /** Warcraft Logs' item level for the character (pinned: = DamageDone `itemLevel`). */
  readonly bracketData: number | null;
}

export interface ReportRankingsFight {
  readonly partition: number | null;
  readonly characters: readonly ReportRankingCharacter[];
}

export interface DamageDoneEntry {
  /** The report actor id. */
  readonly actorId: number;
  readonly total: number;
  readonly itemLevel: number | null;
  /** Pets listed on the entry with their own totals. Whether `total` includes them is NOT pinned. */
  readonly pets: readonly { readonly actorId: number; readonly total: number }[];
}

export interface DamageDoneTable {
  readonly totalTimeMs: number;
  readonly entries: readonly DamageDoneEntry[];
}

export type DecodeOutcome<T> =
  | { readonly outcome: "DECODED"; readonly value: T }
  | { readonly outcome: "REPORT_NOT_ACCESSIBLE" }
  | { readonly outcome: "FIGHT_NOT_FOUND" }
  | { readonly outcome: "PAYLOAD_UNRECOGNISED"; readonly defect: CohortDecodeDefect };

const unrecognised = (defect: CohortDecodeDefect) => ({ outcome: "PAYLOAD_UNRECOGNISED" as const, defect });

function reportOf(data: unknown): Record<string, unknown> | null | undefined {
  if (!isRecord(data)) return undefined;
  const reportData = readRecord(data, "reportData");
  if (reportData === undefined || !("report" in reportData)) return undefined;
  const report = reportData["report"];
  if (report === null) return null;
  return isRecord(report) ? report : undefined;
}

function fightHeader(
  report: Record<string, unknown>,
  fightId: number,
): DecodedFightHeader | CohortDecodeDefect | null {
  const fights = readArray(report, "fights");
  if (fights === undefined) return "FIGHTS_MISSING";
  const raw = fights.find((entry) => isRecord(entry) && entry["id"] === fightId);
  if (raw === undefined) return null;
  if (!isRecord(raw)) return "FIGHT_FIELD_UNUSABLE";
  const encounterId = readInteger(raw, "encounterID");
  const startTimeMs = raw["startTime"];
  const endTimeMs = raw["endTime"];
  const kill = raw["kill"];
  const difficulty = raw["difficulty"];
  if (
    encounterId === undefined ||
    !isSafeInteger(startTimeMs) ||
    !isSafeInteger(endTimeMs) ||
    endTimeMs <= startTimeMs
  ) {
    return "FIGHT_FIELD_UNUSABLE";
  }
  if (kill !== true && kill !== false && kill !== null && kill !== undefined) return "FIGHT_FIELD_UNUSABLE";
  return {
    fightId,
    encounterId,
    difficulty: isSafeInteger(difficulty) ? difficulty : null,
    kill: kill === true || kill === false ? kill : null,
    startTimeMs,
    endTimeMs,
  };
}

/** The report's own rankings for the fight; `null` when that fight has no ranking data. */
function reportRankings(
  report: Record<string, unknown>,
  fightId: number,
): ReportRankingsFight | null | CohortDecodeDefect {
  const rankings = readRecord(report, "rankings");
  if (rankings === undefined) return "RANKINGS_UNUSABLE";
  const data = readArray(rankings, "data");
  if (data === undefined) return "RANKINGS_UNUSABLE";
  const fight = data.find((entry) => isRecord(entry) && entry["fightID"] === fightId);
  if (fight === undefined) return null;
  if (!isRecord(fight)) return "RANKINGS_UNUSABLE";
  const roles = readRecord(fight, "roles");
  if (roles === undefined) return "RANKINGS_UNUSABLE";
  const characters: ReportRankingCharacter[] = [];
  for (const role of Object.values(roles)) {
    if (!isRecord(role)) return "RANKINGS_UNUSABLE";
    const list = readArray(role, "characters");
    if (list === undefined) return "RANKINGS_UNUSABLE";
    for (const raw of list) {
      if (!isRecord(raw)) return "RANKING_CHARACTER_UNUSABLE";
      const name = readString(raw, "name");
      const className = readString(raw, "class");
      const specName = readString(raw, "spec");
      const amount = raw["amount"];
      if (
        name === undefined ||
        className === undefined ||
        specName === undefined ||
        !isFiniteNumber(amount)
      ) {
        return "RANKING_CHARACTER_UNUSABLE";
      }
      const server = readRecord(raw, "server");
      characters.push({
        name,
        serverName: server === undefined ? null : (readString(server, "name") ?? null),
        className,
        specName,
        amount,
        bracketData: isSafeInteger(raw["bracketData"]) ? raw["bracketData"] : null,
      });
    }
  }
  return { partition: isSafeInteger(fight["partition"]) ? fight["partition"] : null, characters };
}

function damageDoneTable(report: Record<string, unknown>): DamageDoneTable | CohortDecodeDefect {
  const table = readRecord(report, "damageDone");
  if (table === undefined) return "TABLE_MISSING";
  const data = readRecord(table, "data");
  if (data === undefined) return "TABLE_MISSING";
  const totalTimeMs = data["totalTime"];
  const entries = readArray(data, "entries");
  if (!isSafeInteger(totalTimeMs) || totalTimeMs <= 0 || entries === undefined) return "TABLE_FIELD_UNUSABLE";
  const decoded: DamageDoneEntry[] = [];
  for (const raw of entries) {
    if (!isRecord(raw)) return "TABLE_ENTRY_UNUSABLE";
    const actorId = readInteger(raw, "id");
    const total = raw["total"];
    if (actorId === undefined || !isFiniteNumber(total) || total < 0) return "TABLE_ENTRY_UNUSABLE";
    const pets: { actorId: number; total: number }[] = [];
    for (const pet of readArray(raw, "pets") ?? []) {
      if (!isRecord(pet) || !isSafeInteger(pet["id"]) || !isFiniteNumber(pet["total"]))
        return "TABLE_ENTRY_UNUSABLE";
      pets.push({ actorId: pet["id"], total: pet["total"] });
    }
    decoded.push({
      actorId,
      total,
      itemLevel: isSafeInteger(raw["itemLevel"]) ? raw["itemLevel"] : null,
      pets,
    });
  }
  return { totalTimeMs, entries: decoded };
}

// ---------------------------------------------------------------------------
// The subject's surfaces
// ---------------------------------------------------------------------------

export interface SubjectPerformanceSurfaces {
  readonly fight: DecodedFightHeader;
  readonly damageDone: DamageDoneTable;
  /** `null` when the report has no ranking data for the fight. Never required. */
  readonly rankings: ReportRankingsFight | null;
}

export function decodeSubjectPerformance(
  data: unknown,
  fightId: number,
): DecodeOutcome<SubjectPerformanceSurfaces> {
  const report = reportOf(data);
  if (report === undefined) return unrecognised("REPORT_DATA_MISSING");
  if (report === null) return { outcome: "REPORT_NOT_ACCESSIBLE" };
  const fight = fightHeader(report, fightId);
  if (fight === null) return { outcome: "FIGHT_NOT_FOUND" };
  if (typeof fight === "string") return unrecognised(fight);
  const damageDone = damageDoneTable(report);
  if (typeof damageDone === "string") return unrecognised(damageDone);
  const rankings = reportRankings(report, fightId);
  if (typeof rankings === "string") return unrecognised(rankings);
  return { outcome: "DECODED", value: { fight, damageDone, rankings } };
}

// ---------------------------------------------------------------------------
// Cohort ranking pages
// ---------------------------------------------------------------------------

/** One characterRankings row, for the G cohort domain only. */
export interface RankedCohortRow {
  readonly name: string;
  readonly serverName: string | null;
  readonly className: string;
  readonly specName: string;
  /** The ranked dps `amount`: the ranking basis, also the subject's ACTUAL_DPS basis (pinned). */
  readonly amount: number;
  readonly durationMs: number;
  /** Warcraft Logs' item level for the character (pinned on the subject report). */
  readonly bracketData: number | null;
  readonly hidden: boolean;
  readonly reportCode: string;
  readonly fightId: number;
}

export interface RankedCohortPage {
  readonly rows: readonly RankedCohortRow[];
  readonly hasMorePages: boolean;
}

export function decodeCohortRankingPage(data: unknown): DecodeOutcome<RankedCohortPage> {
  if (!isRecord(data)) return unrecognised("RANKINGS_PAGE_UNUSABLE");
  const encounter = readRecord(readRecord(data, "worldData") ?? {}, "encounter");
  if (encounter === undefined) return unrecognised("RANKINGS_PAGE_UNUSABLE");
  const page = readRecord(encounter, "characterRankings");
  if (page === undefined) return unrecognised("RANKINGS_PAGE_UNUSABLE");
  const rankings = readArray(page, "rankings");
  if (rankings === undefined || typeof page["hasMorePages"] !== "boolean")
    return unrecognised("RANKINGS_PAGE_UNUSABLE");
  const rows: RankedCohortRow[] = [];
  for (const raw of rankings) {
    if (!isRecord(raw)) return unrecognised("RANKING_ROW_UNUSABLE");
    const report = readRecord(raw, "report");
    const name = readString(raw, "name");
    const className = readString(raw, "class");
    const specName = readString(raw, "spec");
    const amount = raw["amount"];
    const durationMs = raw["duration"];
    const reportCode = report === undefined ? undefined : readString(report, "code");
    const fightId = report === undefined ? undefined : readInteger(report, "fightID");
    if (
      name === undefined ||
      className === undefined ||
      specName === undefined ||
      !isFiniteNumber(amount) ||
      !isSafeInteger(durationMs) ||
      durationMs <= 0 ||
      reportCode === undefined ||
      fightId === undefined
    ) {
      return unrecognised("RANKING_ROW_UNUSABLE");
    }
    const server = readRecord(raw, "server");
    rows.push({
      name,
      serverName: server === undefined ? null : (readString(server, "name") ?? null),
      className,
      specName,
      amount,
      durationMs,
      bracketData: isSafeInteger(raw["bracketData"]) ? raw["bracketData"] : null,
      hidden: raw["hidden"] === true,
      reportCode,
      fightId,
    });
  }
  return { outcome: "DECODED", value: { rows, hasMorePages: page["hasMorePages"] } };
}

// ---------------------------------------------------------------------------
// Candidate context
// ---------------------------------------------------------------------------

export interface CandidatePlayer {
  readonly actorId: number;
  readonly name: string;
  readonly serverName: string | null;
}

export interface CandidatePlayerDetail {
  readonly actorId: number;
  readonly specs: readonly string[];
  /** Through the shared gear adapter: enchants and gems keep KNOWN / KNOWN_NONE / UNKNOWN. */
  readonly gear: readonly GearPiece[] | null;
  readonly talentTree: readonly { readonly id: number; readonly nodeId: number | null }[] | null;
}

export interface CandidateContext {
  readonly fight: DecodedFightHeader;
  readonly players: readonly CandidatePlayer[];
  readonly rankings: ReportRankingsFight | null;
  readonly playerDetails: readonly CandidatePlayerDetail[];
  /** Deaths-table entries: who has a death event in the fight, and when. Positive facts only. */
  readonly deaths: readonly { readonly actorId: number; readonly timestampMs: number }[];
}

function players(report: Record<string, unknown>): CandidatePlayer[] | CohortDecodeDefect {
  const masterData = readRecord(report, "masterData");
  const actors = masterData === undefined ? undefined : readArray(masterData, "actors");
  if (actors === undefined) return "ACTORS_UNUSABLE";
  const result: CandidatePlayer[] = [];
  for (const raw of actors) {
    if (!isRecord(raw)) return "ACTORS_UNUSABLE";
    if (raw["type"] !== "Player") continue;
    const actorId = readInteger(raw, "id");
    const name = readString(raw, "name");
    if (actorId === undefined || name === undefined) return "ACTORS_UNUSABLE";
    const server = raw["server"];
    result.push({
      actorId,
      name,
      serverName: typeof server === "string" && server.length > 0 ? server : null,
    });
  }
  return result;
}

function playerDetails(report: Record<string, unknown>): CandidatePlayerDetail[] | CohortDecodeDefect {
  const root = readRecord(report, "playerDetails");
  const data = root === undefined ? undefined : readRecord(root, "data");
  const byRole = data === undefined ? undefined : readRecord(data, "playerDetails");
  if (byRole === undefined) return "PLAYER_DETAILS_UNUSABLE";
  const result: CandidatePlayerDetail[] = [];
  for (const role of Object.values(byRole)) {
    if (!Array.isArray(role)) return "PLAYER_DETAILS_UNUSABLE";
    for (const raw of role as unknown[]) {
      if (!isRecord(raw)) return "PLAYER_DETAILS_UNUSABLE";
      const actorId = readInteger(raw, "id");
      const specs = readArray(raw, "specs");
      if (actorId === undefined || specs === undefined) return "PLAYER_DETAILS_UNUSABLE";
      const specNames: string[] = [];
      for (const spec of specs) {
        if (!isRecord(spec) || typeof spec["spec"] !== "string") return "PLAYER_DETAILS_UNUSABLE";
        specNames.push(spec["spec"]);
      }
      const info = readRecord(raw, "combatantInfo");
      let gear: readonly GearPiece[] | null = null;
      let talentTree: { id: number; nodeId: number | null }[] | null = null;
      if (info !== undefined) {
        const rawGear = readArray(info, "gear");
        if (rawGear !== undefined) {
          const normalized = normalizeGear(rawGear);
          if (normalized.malformedRows.length > 0) return "PLAYER_DETAILS_UNUSABLE";
          gear = normalized.pieces;
        }
        const rawTree = readArray(info, "talentTree");
        if (rawTree !== undefined) {
          talentTree = [];
          for (const entry of rawTree) {
            if (!isRecord(entry) || !isSafeInteger(entry["id"])) return "PLAYER_DETAILS_UNUSABLE";
            talentTree.push({
              id: entry["id"],
              nodeId: isSafeInteger(entry["nodeID"]) ? entry["nodeID"] : null,
            });
          }
        }
      }
      result.push({ actorId, specs: specNames, gear, talentTree });
    }
  }
  return result;
}

function deaths(
  report: Record<string, unknown>,
): { actorId: number; timestampMs: number }[] | CohortDecodeDefect {
  const table = readRecord(report, "deaths");
  const data = table === undefined ? undefined : readRecord(table, "data");
  const entries = data === undefined ? undefined : readArray(data, "entries");
  if (entries === undefined) return "DEATHS_UNUSABLE";
  const result: { actorId: number; timestampMs: number }[] = [];
  for (const raw of entries) {
    if (!isRecord(raw) || !isSafeInteger(raw["id"]) || !isSafeInteger(raw["timestamp"]))
      return "DEATHS_UNUSABLE";
    result.push({ actorId: raw["id"], timestampMs: raw["timestamp"] });
  }
  return result;
}

export function decodeCandidateContext(data: unknown, fightId: number): DecodeOutcome<CandidateContext> {
  const report = reportOf(data);
  if (report === undefined) return unrecognised("REPORT_DATA_MISSING");
  if (report === null) return { outcome: "REPORT_NOT_ACCESSIBLE" };
  const fight = fightHeader(report, fightId);
  if (fight === null) return { outcome: "FIGHT_NOT_FOUND" };
  if (typeof fight === "string") return unrecognised(fight);
  const roster = players(report);
  if (typeof roster === "string") return unrecognised(roster);
  const rankings = reportRankings(report, fightId);
  if (typeof rankings === "string") return unrecognised(rankings);
  const details = playerDetails(report);
  if (typeof details === "string") return unrecognised(details);
  const deathEntries = deaths(report);
  if (typeof deathEntries === "string") return unrecognised(deathEntries);
  return {
    outcome: "DECODED",
    value: { fight, players: roster, rankings, playerDetails: details, deaths: deathEntries },
  };
}
