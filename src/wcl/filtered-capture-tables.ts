/**
 * M13-D: the Warcraft Logs TABLE surfaces that certify a filtered capture's
 * completeness, decoded fail-closed. Decoding only: what the tables prove is
 * decided by `src/engine/evidence/filtered-capture-certification.ts`.
 *
 * PINNED SEMANTICS (the M13-D request of 2026-11-02, read against the
 * committed M11-G2 tables and the M13-A events):
 *
 *   - `table(dataType: Buffs, hostilityType: Friendlies, abilityID: X)` with
 *     no `sourceID`: `auras[]` is one entry PER TARGET ACTOR (any source),
 *     `id` the report actor id, `totalUses` its applications plus refreshes,
 *     `bands[]` its computed active intervals. Per ACTOR, never per instance:
 *     an actor with several instances has one merged band list.
 *   - `table(dataType: Casts, hostilityType: Friendlies, sourceID: A)`: per
 *     ability `total`, composites flattened; a leaf's `actor` names its source.
 *     It omits whole abilities (melee, some triggered spells, pet casts — M11-G2)
 *     and counts an empowered spell's `cast` AND `empowerend` events.
 *   - Both carry the requested `startTime`/`endTime`, which include events at
 *     exactly `endTime`, like the events surface.
 *
 * The composed response is the sanitized form `scripts/corpus/
 * sanitize-m13d-tables.mjs` writes: `report.code`, `revision`, `fights`,
 * `tableArguments` (each table's request arguments, parsed from the recorded
 * query document: the casts surface does not echo its interval), then
 * `buffs_<abilityId>` and `casts_<actorId>` tables.
 */

import { isFiniteNumber, isRecord, readArray, readRecord } from "./decode.js";

export const FILTERED_CAPTURE_TABLES_REVISION = "filtered-capture-tables/1" as const;

export interface AuraTargetBands {
  readonly targetActorId: number;
  readonly totalUses: number;
  /** Verbatim, in table order. */
  readonly bands: readonly { readonly startTimeMs: number; readonly endTimeMs: number }[];
}

/** The arguments one table was requested with, verbatim from the recorded query. */
export interface TableArguments {
  readonly dataType: "Buffs" | "Casts";
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly hostilityType: "Friendlies";
  /** Set for, and only for, a Buffs table. */
  readonly abilityId: number | null;
  /** Set for, and only for, a Casts table. */
  readonly sourceId: number | null;
}

export interface AuraTargetTable {
  readonly arguments: TableArguments;
  /** The interval the table echoes. */
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly targets: readonly AuraTargetBands[];
}

/** One leaf ability of a Casts table: composite entries are flattened. */
export interface CastTableLeaf {
  readonly abilityGameId: number;
  /** The leaf's stated source; null when the leaf states none. */
  readonly actorId: number | null;
  readonly total: number;
}

export interface CastTable {
  readonly arguments: TableArguments;
  readonly leaves: readonly CastTableLeaf[];
}

/**
 * Flattens one Casts-table entry. A composite must carry subentries; every
 * leaf needs an integer guid and a non-negative integer total. Not the M11-G2
 * decoder: post-hoc comparison code is never imported outside its domain.
 */
function castLeavesOf(entry: unknown, out: CastTableLeaf[]): boolean {
  if (!isRecord(entry) || !isId(entry["guid"])) return false;
  if (entry["composite"] === true) {
    const subentries = entry["subentries"];
    if (!Array.isArray(subentries) || subentries.length === 0) return false;
    return subentries.every((sub) => castLeavesOf(sub, out));
  }
  const total = entry["total"];
  const actor = entry["actor"];
  if (!isId(total) || total < 0) return false;
  if (actor !== undefined && actor !== null && !isId(actor)) return false;
  out.push({ abilityGameId: entry["guid"], actorId: isId(actor) ? actor : null, total });
  return true;
}

function castLeavesOfTable(value: unknown): CastTableLeaf[] | null {
  const data = isRecord(value) ? readRecord(value, "data") : undefined;
  const entries = data === undefined ? undefined : readArray(data, "entries");
  if (entries === undefined) return null;
  const leaves: CastTableLeaf[] = [];
  for (const entry of entries) if (!castLeavesOf(entry, leaves)) return null;
  return leaves;
}

export interface CertificationTables {
  readonly reportCode: string;
  readonly revision: number;
  readonly fight: { readonly id: number; readonly startTimeMs: number; readonly endTimeMs: number };
  /** Keyed by aura ability id. */
  readonly auraTargetTables: ReadonlyMap<number, AuraTargetTable>;
  /** Keyed by source actor id. */
  readonly castTables: ReadonlyMap<number, CastTable>;
}

export type CertificationTablesDecode =
  | { readonly ok: true; readonly tables: CertificationTables }
  | { readonly ok: false; readonly defect: string };

const isId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

function argumentsOf(value: unknown): TableArguments | null {
  if (!isRecord(value)) return null;
  const { dataType, startTime, endTime, hostilityType, abilityID, sourceID } = value;
  if (dataType !== "Buffs" && dataType !== "Casts") return null;
  if (!isFiniteNumber(startTime) || !isFiniteNumber(endTime) || hostilityType !== "Friendlies") return null;
  const abilityId =
    abilityID === null || abilityID === undefined ? null : isId(abilityID) ? abilityID : undefined;
  const sourceId = sourceID === null || sourceID === undefined ? null : isId(sourceID) ? sourceID : undefined;
  if (abilityId === undefined || sourceId === undefined) return null;
  const known = new Set(["dataType", "startTime", "endTime", "hostilityType", "abilityID", "sourceID"]);
  if (Object.keys(value).some((key) => !known.has(key))) return null;
  return { dataType, startTimeMs: startTime, endTimeMs: endTime, hostilityType, abilityId, sourceId };
}

function auraTargetTableOf(value: unknown, args: TableArguments): AuraTargetTable | null {
  const data = isRecord(value) ? readRecord(value, "data") : undefined;
  if (data === undefined) return null;
  const startTime = data["startTime"];
  const endTime = data["endTime"];
  const auras = readArray(data, "auras");
  if (!isFiniteNumber(startTime) || !isFiniteNumber(endTime) || auras === undefined) return null;
  const targets: AuraTargetBands[] = [];
  const seen = new Set<number>();
  for (const aura of auras) {
    if (!isRecord(aura)) return null;
    const id = aura["id"];
    const uses = aura["totalUses"];
    const bands = readArray(aura, "bands");
    // One entry per target actor: a repeated actor would need merging, refused.
    if (!isId(id) || seen.has(id) || !isId(uses) || uses < 0 || bands === undefined) return null;
    seen.add(id);
    const out: { startTimeMs: number; endTimeMs: number }[] = [];
    for (const band of bands) {
      if (!isRecord(band)) return null;
      const from = band["startTime"];
      const to = band["endTime"];
      if (!isFiniteNumber(from) || !isFiniteNumber(to) || to < from) return null;
      out.push({ startTimeMs: from, endTimeMs: to });
    }
    targets.push({ targetActorId: id, totalUses: uses, bands: out });
  }
  return { arguments: args, startTimeMs: startTime, endTimeMs: endTime, targets };
}

/** Decodes the sanitized composed response. Any unreadable part fails the whole decode. */
export function decodeCertificationTables(data: unknown): CertificationTablesDecode {
  const report = isRecord(data) ? readRecord(readRecord(data, "reportData") ?? {}, "report") : undefined;
  if (report === undefined) return { ok: false, defect: "REPORT_MISSING" };
  const code = report["code"];
  if (typeof code !== "string" || code.length === 0) return { ok: false, defect: "REPORT_CODE_UNREADABLE" };
  const revision = report["revision"];
  if (!isId(revision)) return { ok: false, defect: "REVISION_UNREADABLE" };
  const fights = readArray(report, "fights");
  const fight = fights?.length === 1 ? fights[0] : undefined;
  if (
    !isRecord(fight) ||
    !isId(fight["id"]) ||
    !isFiniteNumber(fight["startTime"]) ||
    !isFiniteNumber(fight["endTime"])
  ) {
    return { ok: false, defect: "FIGHT_UNREADABLE" };
  }
  const argumentRecords = readRecord(report, "tableArguments");
  if (argumentRecords === undefined) return { ok: false, defect: "TABLE_ARGUMENTS_MISSING" };
  const auraTargetTables = new Map<number, AuraTargetTable>();
  const castTables = new Map<number, CastTable>();
  for (const [key, value] of Object.entries(report)) {
    const buffs = /^buffs_(\d+)$/.exec(key);
    const casts = /^casts_(\d+)$/.exec(key);
    if (buffs !== null || casts !== null) {
      // Each table must have been requested with exactly the predicate its alias names.
      const args = argumentsOf(argumentRecords[key]);
      const id = Number((buffs ?? casts)?.[1]);
      const consistent =
        args !== null &&
        (buffs !== null
          ? args.dataType === "Buffs" && args.abilityId === id && args.sourceId === null
          : args.dataType === "Casts" && args.sourceId === id && args.abilityId === null);
      if (args === null || !consistent) return { ok: false, defect: `TABLE_ARGUMENTS_UNUSABLE:${key}` };
      if (buffs !== null) {
        const table = auraTargetTableOf(value, args);
        if (table === null) return { ok: false, defect: `TABLE_UNUSABLE:${key}` };
        auraTargetTables.set(id, table);
      } else {
        const leaves = castLeavesOfTable(value);
        if (leaves === null) return { ok: false, defect: `TABLE_UNUSABLE:${key}` };
        castTables.set(id, { arguments: args, leaves });
      }
    } else if (key !== "code" && key !== "revision" && key !== "fights" && key !== "tableArguments") {
      return { ok: false, defect: `UNEXPECTED_FIELD:${key}` };
    }
  }
  // A recorded request with no table in the response is a dropped surface.
  for (const key of Object.keys(argumentRecords)) {
    if (!(key in report)) return { ok: false, defect: `TABLE_MISSING:${key}` };
  }
  return {
    ok: true,
    tables: {
      reportCode: code,
      revision,
      fight: { id: fight["id"], startTimeMs: fight["startTime"], endTimeMs: fight["endTime"] },
      auraTargetTables,
      castTables,
    },
  };
}
