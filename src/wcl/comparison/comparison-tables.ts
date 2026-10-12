/**
 * M11-G2: the comparison fights' Warcraft Logs TABLE surfaces — fail-closed
 * decoders, and the certificates that decide whether a server-filtered event
 * capture may earn a coverage grant.
 *
 * WHAT A TABLE IS HERE
 *
 * A Warcraft Logs-COMPUTED aggregate over the same fight interval as the event
 * capture, for one source actor (`sourceID`), read with its own pinned
 * semantics. Pinned from the G2 capture (2026-10-11):
 *
 *   - Casts: `entries[].total` per ability. It omits melee swings (ability 1),
 *     some triggered spells, and every pet cast — so it cannot certify the
 *     CASTS family as the slice predicate retains it.
 *   - DamageDone for a PLAYER is an owner rollup: its leaves include the
 *     player's pets' abilities (under the summoning spell's guid), each leaf
 *     naming its true source in `actor`. A certificate reads only the leaves
 *     of the actor it certifies.
 *   - DamageDone: an entry may be COMPOSITE (several abilities merged under
 *     one guid, with per-ability `subentries`), and some abilities are
 *     reported under another guid (e.g. Death and Decay damage 52212 under
 *     43265). Per LEAF entry, `hitCount + tickCount + missCount +
 *     tickMissCount` counts damage events, misses included.
 *   - DamageTaken: omits some sources (e.g. Spirit Link 98021) and is empty
 *     for pets.
 *
 * A certificate compares the filtered events with ONE table: same interval,
 * same actor, same direction. It MATCHES only if every ability's count is
 * equal. A category is CERTIFIED only if every certificate feeding it, for
 * every actor in the slice's scope, MATCHES; a part of the predicate no table
 * can express (e.g. casts TARGETING the actor) makes the category
 * UNAVAILABLE. Owner decision: only a CERTIFIED category may be granted.
 */

import { isFiniteNumber, isRecord, readArray, readRecord } from "../decode.js";

export const COMPARISON_TABLES_REVISION = "g2-comparison-tables-1";

// ---------------------------------------------------------------------------
// Decoded shapes
// ---------------------------------------------------------------------------

/** One leaf ability of a per-actor table: composite entries are flattened. */
export interface AbilityTableLeaf {
  readonly abilityGameId: number;
  /** The composite entry's guid this leaf was reported under, or its own. */
  readonly reportedUnderGuid: number;
  readonly actorId: number | null;
  readonly total: number;
  readonly hitCount: number;
  readonly tickCount: number;
  readonly missCount: number;
  readonly tickMissCount: number;
  readonly uses: number | null;
}

export interface AbilityTable {
  readonly totalTimeMs: number;
  readonly leaves: readonly AbilityTableLeaf[];
}

export interface RaidDamageEntry {
  readonly actorId: number;
  readonly total: number;
  readonly itemLevel: number | null;
  readonly pets: readonly { readonly actorId: number; readonly total: number }[];
  /** Per target TYPE (`Boss`, `NPC`, ...), verbatim; empty when the surface did not carry it. */
  readonly targetTypes: readonly { readonly type: string; readonly total: number }[];
}

export interface RaidDamageTable {
  readonly totalTimeMs: number;
  readonly entries: readonly RaidDamageEntry[];
}

export interface DeathsTableEntry {
  readonly actorId: number;
  readonly timestampMs: number;
}

export interface ComparisonTables {
  readonly revision: number;
  readonly raidDamageDone: RaidDamageTable;
  readonly deaths: readonly DeathsTableEntry[];
  /** Keyed by source actor id. */
  readonly casts: ReadonlyMap<number, AbilityTable>;
  readonly damageDone: ReadonlyMap<number, AbilityTable>;
  readonly damageTaken: ReadonlyMap<number, AbilityTable>;
  /** DamageDone over each requested window, keyed by window index (`window<k>`). */
  readonly windows: ReadonlyMap<number, WindowTables>;
}

/** The window tables of one requested window, with the bounds they were requested over. */
export interface WindowTables {
  readonly fromMs: number;
  /** The requested `endTime`; Warcraft Logs includes events at exactly this instant. */
  readonly toMs: number;
  /** Keyed by source actor id. */
  readonly byActor: ReadonlyMap<number, AbilityTable>;
}

export type ComparisonTablesDecode =
  { readonly ok: true; readonly tables: ComparisonTables } | { readonly ok: false; readonly defect: string };

const count = (entry: Record<string, unknown>, key: string): number | null => {
  const value = entry[key];
  if (value === undefined) return 0;
  return isFiniteNumber(value) && Number.isSafeInteger(value) && value >= 0 ? value : null;
};

function leavesOf(entry: unknown, reportedUnder: number | null, out: AbilityTableLeaf[]): boolean {
  if (!isRecord(entry)) return false;
  const guid = entry["guid"];
  if (typeof guid !== "number" || !Number.isSafeInteger(guid)) return false;
  const subentries = entry["subentries"];
  if (entry["composite"] === true) {
    if (!Array.isArray(subentries) || subentries.length === 0) return false;
    return subentries.every((sub) => leavesOf(sub, reportedUnder ?? guid, out));
  }
  const total = entry["total"];
  const hit = count(entry, "hitCount");
  const tick = count(entry, "tickCount");
  const miss = count(entry, "missCount");
  const tickMiss = count(entry, "tickMissCount");
  if (!isFiniteNumber(total) || hit === null || tick === null || miss === null || tickMiss === null)
    return false;
  const actor = entry["actor"];
  const uses = entry["uses"];
  out.push({
    abilityGameId: guid,
    reportedUnderGuid: reportedUnder ?? guid,
    actorId: typeof actor === "number" && Number.isSafeInteger(actor) ? actor : null,
    total,
    hitCount: hit,
    tickCount: tick,
    missCount: miss,
    tickMissCount: tickMiss,
    uses: typeof uses === "number" && Number.isSafeInteger(uses) ? uses : null,
  });
  return true;
}

function abilityTableOf(value: unknown): AbilityTable | null {
  const data = isRecord(value) ? readRecord(value, "data") : undefined;
  if (data === undefined) return null;
  const totalTime = data["totalTime"];
  const entries = readArray(data, "entries");
  if (!isFiniteNumber(totalTime) || entries === undefined) return null;
  const leaves: AbilityTableLeaf[] = [];
  for (const entry of entries) if (!leavesOf(entry, null, leaves)) return null;
  return { totalTimeMs: totalTime, leaves };
}

/** A raid-wide DamageDone table (`{ data: { totalTime, entries } }`), also G1's subject surface. */
export function decodeRaidDamageTable(value: unknown): RaidDamageTable | null {
  const data = isRecord(value) ? readRecord(value, "data") : undefined;
  if (data === undefined) return null;
  const totalTime = data["totalTime"];
  const entries = readArray(data, "entries");
  if (!isFiniteNumber(totalTime) || entries === undefined) return null;
  const out: RaidDamageEntry[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) return null;
    const id = entry["id"];
    const total = entry["total"];
    if (typeof id !== "number" || !Number.isSafeInteger(id) || !isFiniteNumber(total)) return null;
    const pets: { actorId: number; total: number }[] = [];
    for (const pet of readArray(entry, "pets") ?? []) {
      if (!isRecord(pet) || typeof pet["id"] !== "number" || !isFiniteNumber(pet["total"])) return null;
      pets.push({ actorId: pet["id"], total: pet["total"] });
    }
    const targetTypes: { type: string; total: number }[] = [];
    for (const target of readArray(entry, "targets") ?? []) {
      if (!isRecord(target) || typeof target["type"] !== "string" || !isFiniteNumber(target["total"]))
        return null;
      targetTypes.push({ type: target["type"], total: target["total"] });
    }
    const itemLevel = entry["itemLevel"];
    out.push({
      actorId: id,
      total,
      itemLevel: isFiniteNumber(itemLevel) ? itemLevel : null,
      pets,
      targetTypes,
    });
  }
  return { totalTimeMs: totalTime, entries: out };
}

function deathsOf(value: unknown): DeathsTableEntry[] | null {
  const data = isRecord(value) ? readRecord(value, "data") : undefined;
  const entries = data === undefined ? undefined : readArray(data, "entries");
  if (entries === undefined) return null;
  const out: DeathsTableEntry[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry["id"] !== "number" || !isFiniteNumber(entry["timestamp"]))
      return null;
    out.push({ actorId: entry["id"], timestampMs: entry["timestamp"] });
  }
  return out;
}

/** Decodes the composed table response. Any unreadable table fails the whole decode. */
export function decodeComparisonTables(data: unknown): ComparisonTablesDecode {
  const report = isRecord(data) ? readRecord(readRecord(data, "reportData") ?? {}, "report") : undefined;
  if (report === undefined) return { ok: false, defect: "REPORT_MISSING" };
  const revision = report["revision"];
  if (typeof revision !== "number" || !Number.isSafeInteger(revision))
    return { ok: false, defect: "REVISION_UNREADABLE" };
  const raid = decodeRaidDamageTable(report["raidDamageDone"]);
  if (raid === null) return { ok: false, defect: "RAID_DAMAGE_DONE_UNUSABLE" };
  const deaths = deathsOf(report["deaths"]);
  if (deaths === null) return { ok: false, defect: "DEATHS_UNUSABLE" };
  const casts = new Map<number, AbilityTable>();
  const damageDone = new Map<number, AbilityTable>();
  const damageTaken = new Map<number, AbilityTable>();
  const bounds = new Map<number, { fromMs: number; toMs: number }>();
  for (const entry of readArray(report, "windowBounds") ?? []) {
    const window = isRecord(entry) ? entry["window"] : undefined;
    const index = typeof window === "string" ? /^window(\d+)$/.exec(window) : null;
    const from = isRecord(entry) ? entry["fromMs"] : undefined;
    const to = isRecord(entry) ? entry["toMs"] : undefined;
    if (index === null || !isFiniteNumber(from) || !isFiniteNumber(to) || to < from) {
      return { ok: false, defect: "WINDOW_BOUNDS_UNUSABLE" };
    }
    bounds.set(Number(index[1]), { fromMs: from, toMs: to });
  }
  const windowTables = new Map<number, Map<number, AbilityTable>>();
  for (const [key, value] of Object.entries(report)) {
    const perActor = /^(casts|damageDone|damageTaken)_(\d+)$/.exec(key);
    const perWindow = /^window(\d+)_(\d+)$/.exec(key);
    if (perActor === null && perWindow === null) continue;
    const table = abilityTableOf(value);
    if (table === null) return { ok: false, defect: `TABLE_UNUSABLE:${key}` };
    if (perActor !== null) {
      const actorId = Number(perActor[2]);
      const target =
        perActor[1] === "casts" ? casts : perActor[1] === "damageDone" ? damageDone : damageTaken;
      target.set(actorId, table);
    } else if (perWindow !== null) {
      const index = Number(perWindow[1]);
      const byActor = windowTables.get(index) ?? new Map<number, AbilityTable>();
      byActor.set(Number(perWindow[2]), table);
      windowTables.set(index, byActor);
    }
  }
  // A window table with no recorded bounds cannot be placed in time: refused.
  const windows = new Map<number, WindowTables>();
  for (const [index, byActor] of windowTables) {
    const bound = bounds.get(index);
    if (bound === undefined) return { ok: false, defect: `WINDOW_BOUNDS_MISSING:window${String(index)}` };
    windows.set(index, { ...bound, byActor });
  }
  return {
    ok: true,
    tables: { revision, raidDamageDone: raid, deaths, casts, damageDone, damageTaken, windows },
  };
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export type CertificateCheck = "CASTS_SOURCED_BY" | "DAMAGE_SOURCED_BY" | "DAMAGE_TARGETING";

export interface AbilityCountDifference {
  readonly abilityGameId: number;
  readonly eventCount: number;
  readonly tableCount: number;
}

export interface Certificate {
  readonly check: CertificateCheck;
  readonly actorId: number;
  readonly status: "MATCH" | "MISMATCH" | "TABLE_UNAVAILABLE";
  readonly eventCount: number;
  /** Sum over the certified actor's leaves; `null` when the table is unavailable. */
  readonly tableCount: number | null;
  /** Whether the totals agree even where per-ability counts do not (e.g. a remapped guid). Informational. */
  readonly totalsAgree: boolean | null;
  /** Every ability whose counts differ, ascending; empty on MATCH. */
  readonly differences: readonly AbilityCountDifference[];
}

export type CertifiableCategory =
  "CASTS" | "AURAS" | "RESOURCES" | "DAMAGE" | "SUMMONS" | "COMBATANT_INFO" | "GEAR";

export interface CategoryCertification {
  readonly category: CertifiableCategory;
  readonly status: "CERTIFIED" | "NOT_CERTIFIED" | "UNAVAILABLE";
  /** Why, in words, when not CERTIFIED. */
  readonly reason: string | null;
}

export interface CaptureCertification {
  readonly revision: typeof COMPARISON_TABLES_REVISION;
  readonly certificates: readonly Certificate[];
  readonly categories: readonly CategoryCertification[];
  /** The categories that may be granted: CERTIFIED ones only. */
  readonly grantable: readonly CertifiableCategory[];
}

interface RawEventView {
  readonly type?: unknown;
  readonly sourceID?: unknown;
  readonly targetID?: unknown;
  readonly abilityGameID?: unknown;
}

const tableCountOf = (leaf: AbilityTableLeaf, check: CertificateCheck): number =>
  check === "CASTS_SOURCED_BY"
    ? leaf.total
    : leaf.hitCount + leaf.tickCount + leaf.missCount + leaf.tickMissCount;

function certificate(
  check: CertificateCheck,
  actorId: number,
  events: readonly RawEventView[],
  table: AbilityTable | undefined,
): Certificate {
  const type = check === "CASTS_SOURCED_BY" ? "cast" : "damage";
  const side = check === "DAMAGE_TARGETING" ? "targetID" : "sourceID";
  const fromEvents = new Map<number, number>();
  let eventCount = 0;
  for (const event of events) {
    if (event.type !== type || event[side] !== actorId) continue;
    const ability = typeof event.abilityGameID === "number" ? event.abilityGameID : -1;
    fromEvents.set(ability, (fromEvents.get(ability) ?? 0) + 1);
    eventCount += 1;
  }
  if (table === undefined) {
    return {
      check,
      actorId,
      status: "TABLE_UNAVAILABLE",
      eventCount,
      tableCount: null,
      totalsAgree: null,
      differences: [],
    };
  }
  const fromTable = new Map<number, number>();
  let tableCount = 0;
  for (const leaf of table.leaves) {
    // In a sourced-by table a leaf naming another actor (a pet in its owner's
    // table) is not this actor's. In DamageTaken, `actor` is the ATTACKER, so
    // every leaf is damage taken by the queried actor.
    if (check !== "DAMAGE_TARGETING" && leaf.actorId !== null && leaf.actorId !== actorId) continue;
    const value = tableCountOf(leaf, check);
    fromTable.set(leaf.abilityGameId, (fromTable.get(leaf.abilityGameId) ?? 0) + value);
    tableCount += value;
  }
  const abilities = [...new Set([...fromEvents.keys(), ...fromTable.keys()])].sort((a, b) => a - b);
  const differences = abilities
    .map((abilityGameId) => ({
      abilityGameId,
      eventCount: fromEvents.get(abilityGameId) ?? 0,
      tableCount: fromTable.get(abilityGameId) ?? 0,
    }))
    .filter((entry) => entry.eventCount !== entry.tableCount);
  return {
    check,
    actorId,
    status: differences.length === 0 ? "MATCH" : "MISMATCH",
    eventCount,
    tableCount,
    totalsAgree: eventCount === tableCount,
    differences,
  };
}

const UNEXPRESSIBLE: Record<Exclude<CertifiableCategory, "DAMAGE">, string> = {
  CASTS:
    "No table certifies cast events TARGETING an actor, which the slice predicate retains; the Casts table also omits melee, some triggered spells and pet casts.",
  AURAS: "No table certifies aura events per actor and direction with event-level counts.",
  RESOURCES: "No table certifies resourcechange events.",
  SUMMONS: "No table certifies summon events.",
  COMBATANT_INFO: "No table certifies combatantinfo events.",
  GEAR: "No table certifies combatantinfo events.",
};

/**
 * Certifies a filtered capture's retained events against its tables, for
 * every actor of the slice's scope. Pure; ordering is deterministic.
 */
export function certifyComparisonCapture(
  events: readonly RawEventView[],
  tables: ComparisonTables,
  actorScope: readonly number[],
): CaptureCertification {
  const scope = [...new Set(actorScope)].sort((a, b) => a - b);
  const certificates: Certificate[] = [];
  for (const actorId of scope) {
    certificates.push(certificate("CASTS_SOURCED_BY", actorId, events, tables.casts.get(actorId)));
    certificates.push(certificate("DAMAGE_SOURCED_BY", actorId, events, tables.damageDone.get(actorId)));
    certificates.push(certificate("DAMAGE_TARGETING", actorId, events, tables.damageTaken.get(actorId)));
  }
  const damage = certificates.filter((entry) => entry.check !== "CASTS_SOURCED_BY");
  const failing = damage.filter((entry) => entry.status !== "MATCH");
  const unexpressible = (Object.keys(UNEXPRESSIBLE) as (keyof typeof UNEXPRESSIBLE)[]).map(
    (category): CategoryCertification => ({
      category,
      status: "UNAVAILABLE",
      reason: UNEXPRESSIBLE[category],
    }),
  );
  const damageCertification: CategoryCertification = {
    category: "DAMAGE",
    status: failing.length === 0 ? "CERTIFIED" : "NOT_CERTIFIED",
    reason:
      failing.length === 0
        ? null
        : `${String(failing.length)} of ${String(damage.length)} damage certificates do not match: ${failing
            .map((entry) => `${entry.check}(${String(entry.actorId)})=${entry.status}`)
            .join(", ")}`,
  };
  const categories: CategoryCertification[] = [damageCertification, ...unexpressible].sort((left, right) =>
    left.category < right.category ? -1 : left.category > right.category ? 1 : 0,
  );
  return {
    revision: COMPARISON_TABLES_REVISION,
    certificates,
    categories,
    grantable: categories.filter((entry) => entry.status === "CERTIFIED").map((entry) => entry.category),
  };
}
