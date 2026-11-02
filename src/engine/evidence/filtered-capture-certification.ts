/**
 * FILTERED-CAPTURE CERTIFICATION (M13-D): whether a server-filtered capture's
 * events are COMPLETE for a stated predicate, proven against trusted Warcraft
 * Logs tables over the same report, revision, fight and interval.
 *
 * Owner decision (2026-11-02, agent/autopilot-queue.md "M13-D"): the reviewed
 * completeness-certificate path. A certificate is evidence about COMPLETENESS
 * only — never about recipient quality, targets, timing or play — and it may
 * only upgrade factual observation coverage where the predicate and interval
 * are proven. The M11-G2 rule is never weakened: no approximate counts, no
 * similar predicate, no "totals agree", no absence of discrepancy taken as
 * proof, no belief that a filter is exhaustive.
 *
 * WHAT IS COMPARED
 *
 * The fight's OWN normalized events (so the certificate is of exactly what the
 * analysis reads) against the decoded tables (`src/wcl/filtered-capture-
 * tables.ts`). Binding first: the tables must be of the fight's report code,
 * report revision, fight id and exact fight bounds, and every table must have
 * been requested over exactly those bounds. Any binding failure refuses the
 * whole certification.
 *
 * AURA_WINDOWS (one buff ability X). The Buffs table without `sourceID` lists
 * every friendly TARGET actor holding X, any source. For every target in the
 * union of table targets and event targets:
 *   - its X events, in retrieval order, must form strict windows: applied
 *     opens, refreshed only inside, removed closes, nothing open at the end;
 *   - no event may state a target instance (the table is per actor, so it
 *     cannot tell instances apart), and no event may be a stack change (what
 *     the table's uses count for stacks is not pinned);
 *   - the windows must EQUAL the table's bands, element for element, and
 *     applications plus refreshes must EQUAL the table's uses.
 * A target failing any rule is EXCLUDED; every other friendly target is proven
 * (one that holds X nowhere is proven to hold it nowhere, by the table over
 * every friendly target). A buff event of no stated ability or no stated
 * target could be any track: X is then refused outright.
 *
 * COMPLETED_CASTS (one source actor A). The Casts table of A. For each ability:
 * the table total (A's own leaves) must EQUAL A's completed `cast` events of
 * it. Only an ability the table LISTS with a positive total can be proven,
 * so a zero is never certified (a listed zero is ZERO_TOTAL). A completed cast with no ability id from A, or any instanced
 * cast of A, refuses A outright; a completed cast with no stated source
 * refuses its ability (or every ability, when it has none) for every A.
 *
 * Deterministic and pure. Output order: aura certificates by ability id, cast
 * certificates by actor id, targets and abilities ascending.
 */

import type { CombatFight } from "../normalization/combat-fight.js";
import type { AuraEvent, CastEvent } from "../normalization/normalized-events.js";
import type { AuraTargetTable, CastTable, CertificationTables } from "../../wcl/filtered-capture-tables.js";
import type { CertifiedCoverage } from "./certified-coverage.js";
import { inclusiveRange, type TimeRangeMs } from "./coverage.js";

export const FILTERED_CAPTURE_CERTIFICATION_REVISION = "filtered-capture-certification/1" as const;

export interface CertificationRequest {
  readonly auraAbilityGameIds: readonly number[];
  readonly castSourceActorIds: readonly number[];
}

export type BindingRefusal =
  "REPORT_CODE_DIFFERS" | "REPORT_REVISION_DIFFERS" | "FIGHT_DIFFERS" | "FIGHT_BOUNDS_DIFFER";

export type AuraTargetStatus =
  "MATCH" | "INSTANCE_STATED" | "STACK_CHANGE_PRESENT" | "WINDOW_NOT_STRICT" | "BANDS_DIFFER" | "USES_DIFFER";

export interface AuraTargetComparison {
  readonly targetActorId: number;
  readonly status: AuraTargetStatus;
  /** `[applied, removed]` per strict window; empty when the windows are not strict. */
  readonly eventWindows: readonly (readonly [number, number])[];
  readonly eventApplications: number;
  readonly eventRefreshes: number;
  /** The table's bands and uses; empty / null when the table lists no such target. */
  readonly tableBands: readonly (readonly [number, number])[];
  readonly tableUses: number | null;
}

export interface AuraWindowsCertificate {
  readonly certificateId: string;
  readonly abilityGameId: number;
  readonly outcome: "CERTIFIED" | "CERTIFIED_EXCEPT_TARGETS" | "REFUSED";
  readonly refusal: "TABLE_MISSING" | "TABLE_INTERVAL_DIFFERS" | "AMBIGUOUS_EVENT" | null;
  readonly targets: readonly AuraTargetComparison[];
  readonly excludedTargetActorIds: readonly number[];
  /** MATCH targets the table lists: friendly by the Friendlies table itself. */
  readonly provenTargetActorIds: readonly number[];
}

export interface CastAbilityComparison {
  readonly abilityGameId: number;
  readonly eventCount: number;
  /** Null when the table does not list the ability. */
  readonly tableCount: number | null;
  readonly status:
    "MATCH" | "COUNT_DIFFERS" | "NOT_LISTED_BY_TABLE" | "ZERO_TOTAL" | "SOURCELESS_CAST_PRESENT";
}

export interface CompletedCastsCertificate {
  readonly certificateId: string;
  readonly sourceActorId: number;
  readonly outcome: "CERTIFIED_ABILITIES" | "REFUSED";
  readonly refusal:
    | "TABLE_MISSING"
    | "TABLE_INTERVAL_DIFFERS"
    | "UNIDENTIFIED_CAST"
    | "INSTANCED_CAST"
    | "SOURCELESS_UNIDENTIFIED_CAST"
    | null;
  readonly abilities: readonly CastAbilityComparison[];
  readonly certifiedAbilityGameIds: readonly number[];
}

export interface FilteredCaptureCertification {
  readonly revision: typeof FILTERED_CAPTURE_CERTIFICATION_REVISION;
  readonly binding: {
    readonly reportCode: string;
    readonly reportRevision: number;
    readonly fightId: number;
    readonly range: TimeRangeMs;
  };
  readonly refusal: BindingRefusal | null;
  readonly auraWindows: readonly AuraWindowsCertificate[];
  readonly completedCasts: readonly CompletedCastsCertificate[];
  /** What may be attached: proven predicates only. Empty on a binding refusal. */
  readonly coverage: readonly CertifiedCoverage[];
}

const ascending = (a: number, b: number): number => a - b;

function sameInterval(
  args: { readonly startTimeMs: number; readonly endTimeMs: number },
  fight: CombatFight,
): boolean {
  return args.startTimeMs === fight.fight.startTimeMs && args.endTimeMs === fight.fight.endTimeMs;
}

function bindingRefusal(fight: CombatFight, tables: CertificationTables): BindingRefusal | null {
  if (tables.reportCode !== fight.report.code) return "REPORT_CODE_DIFFERS";
  if (tables.revision !== fight.report.revision) return "REPORT_REVISION_DIFFERS";
  if (tables.fight.id !== fight.fight.id) return "FIGHT_DIFFERS";
  if (!sameInterval(tables.fight, fight)) return "FIGHT_BOUNDS_DIFFER";
  return null;
}

function inFight(fight: CombatFight, time: number): boolean {
  return time >= fight.fight.startTimeMs && time <= fight.fight.endTimeMs;
}

function compareTarget(
  targetActorId: number,
  events: readonly AuraEvent[],
  table: AuraTargetTable,
): AuraTargetComparison {
  const listed = table.targets.find((entry) => entry.targetActorId === targetActorId);
  const tableBands = (listed?.bands ?? []).map((band) => [band.startTimeMs, band.endTimeMs] as const);
  const tableUses = listed?.totalUses ?? null;
  const applications = events.filter((event) => event.operation === "APPLIED").length;
  const refreshes = events.filter((event) => event.operation === "REFRESHED").length;
  const base = {
    targetActorId,
    eventApplications: applications,
    eventRefreshes: refreshes,
    tableBands,
    tableUses,
  };
  if (events.some((event) => event.target?.instanceId !== null)) {
    return { ...base, status: "INSTANCE_STATED", eventWindows: [] };
  }
  if (events.some((event) => event.isStackChange)) {
    return { ...base, status: "STACK_CHANGE_PRESENT", eventWindows: [] };
  }
  const windows: (readonly [number, number])[] = [];
  let open: number | null = null;
  for (const event of events) {
    if (event.operation === "APPLIED") {
      if (open !== null) return { ...base, status: "WINDOW_NOT_STRICT", eventWindows: [] };
      open = event.reportTimeMs;
    } else if (event.operation === "REFRESHED") {
      if (open === null) return { ...base, status: "WINDOW_NOT_STRICT", eventWindows: [] };
    } else {
      if (open === null) return { ...base, status: "WINDOW_NOT_STRICT", eventWindows: [] };
      windows.push([open, event.reportTimeMs]);
      open = null;
    }
  }
  if (open !== null) return { ...base, status: "WINDOW_NOT_STRICT", eventWindows: [] };
  const bandsEqual =
    windows.length === tableBands.length &&
    windows.every(
      (window, index) => window[0] === tableBands[index]?.[0] && window[1] === tableBands[index]?.[1],
    );
  if (!bandsEqual) return { ...base, status: "BANDS_DIFFER", eventWindows: windows };
  if ((tableUses ?? 0) !== applications + refreshes)
    return { ...base, status: "USES_DIFFER", eventWindows: windows };
  return { ...base, status: "MATCH", eventWindows: windows };
}

function certifyAura(
  fight: CombatFight,
  abilityGameId: number,
  table: AuraTargetTable | undefined,
): AuraWindowsCertificate {
  const certificateId = `aura-windows:${String(abilityGameId)}`;
  const refused = (refusal: AuraWindowsCertificate["refusal"]): AuraWindowsCertificate => ({
    certificateId,
    abilityGameId,
    outcome: "REFUSED",
    refusal,
    targets: [],
    excludedTargetActorIds: [],
    provenTargetActorIds: [],
  });
  if (table === undefined) return refused("TABLE_MISSING");
  if (!sameInterval(table.arguments, fight) || !sameInterval(table, fight))
    return refused("TABLE_INTERVAL_DIFFERS");
  const buffs = fight.events.filter(
    (event): event is AuraEvent =>
      event.kind === "AURA" && event.auraClass === "BUFF" && inFight(fight, event.reportTimeMs),
  );
  // A buff transition of no stated ability, or of X with no stated target, could be any track.
  if (
    buffs.some(
      (event) =>
        event.abilityGameId === null || (event.abilityGameId === abilityGameId && event.target === null),
    )
  ) {
    return refused("AMBIGUOUS_EVENT");
  }
  const byTarget = new Map<number, AuraEvent[]>();
  for (const event of buffs) {
    if (event.abilityGameId !== abilityGameId || event.target === null) continue;
    const list = byTarget.get(event.target.actorId) ?? [];
    list.push(event);
    byTarget.set(event.target.actorId, list);
  }
  const targetIds = [
    ...new Set([...byTarget.keys(), ...table.targets.map((entry) => entry.targetActorId)]),
  ].sort(ascending);
  const targets = targetIds.map((id) => compareTarget(id, byTarget.get(id) ?? [], table));
  const excluded = targets.filter((entry) => entry.status !== "MATCH").map((entry) => entry.targetActorId);
  // Friendly membership is the Friendlies table's own listing, never inferred
  // from an event: only a matched target the table lists may be named alone.
  const listed = new Set(table.targets.map((entry) => entry.targetActorId));
  const proven = targets
    .filter((entry) => entry.status === "MATCH" && listed.has(entry.targetActorId))
    .map((entry) => entry.targetActorId);
  return {
    certificateId,
    abilityGameId,
    outcome: excluded.length === 0 ? "CERTIFIED" : "CERTIFIED_EXCEPT_TARGETS",
    refusal: null,
    targets,
    excludedTargetActorIds: excluded,
    provenTargetActorIds: proven,
  };
}

function certifyCasts(
  fight: CombatFight,
  sourceActorId: number,
  cast: CastTable | undefined,
  completed: readonly CastEvent[],
): CompletedCastsCertificate {
  const certificateId = `completed-casts:${String(sourceActorId)}`;
  const refused = (refusal: CompletedCastsCertificate["refusal"]): CompletedCastsCertificate => ({
    certificateId,
    sourceActorId,
    outcome: "REFUSED",
    refusal,
    abilities: [],
    certifiedAbilityGameIds: [],
  });
  if (cast === undefined) return refused("TABLE_MISSING");
  if (!sameInterval(cast.arguments, fight)) return refused("TABLE_INTERVAL_DIFFERS");
  const sourceless = completed.filter((event) => event.source === null);
  if (sourceless.some((event) => event.abilityGameId === null))
    return refused("SOURCELESS_UNIDENTIFIED_CAST");
  const own = completed.filter((event) => event.source?.actorId === sourceActorId);
  if (own.some((event) => event.source?.instanceId !== null)) return refused("INSTANCED_CAST");
  if (own.some((event) => event.abilityGameId === null)) return refused("UNIDENTIFIED_CAST");
  const sourcelessAbilities = new Set(sourceless.map((event) => event.abilityGameId));
  const fromEvents = new Map<number, number>();
  for (const event of own) {
    const id = event.abilityGameId as number;
    fromEvents.set(id, (fromEvents.get(id) ?? 0) + 1);
  }
  const fromTable = new Map<number, number>();
  for (const leaf of cast.leaves) {
    // A leaf naming another actor is not this actor's (M11-G2).
    if (leaf.actorId !== null && leaf.actorId !== sourceActorId) continue;
    fromTable.set(leaf.abilityGameId, (fromTable.get(leaf.abilityGameId) ?? 0) + leaf.total);
  }
  const abilities = [...new Set([...fromEvents.keys(), ...fromTable.keys()])]
    .sort(ascending)
    .map((abilityGameId): CastAbilityComparison => {
      const eventCount = fromEvents.get(abilityGameId) ?? 0;
      const tableCount = fromTable.get(abilityGameId) ?? null;
      const status: CastAbilityComparison["status"] = sourcelessAbilities.has(abilityGameId)
        ? "SOURCELESS_CAST_PRESENT"
        : tableCount === null
          ? "NOT_LISTED_BY_TABLE"
          : tableCount === 0
            ? "ZERO_TOTAL"
            : tableCount === eventCount
              ? "MATCH"
              : "COUNT_DIFFERS";
      return { abilityGameId, eventCount, tableCount, status };
    });
  return {
    certificateId,
    sourceActorId,
    outcome: "CERTIFIED_ABILITIES",
    refusal: null,
    abilities,
    certifiedAbilityGameIds: abilities
      .filter((entry) => entry.status === "MATCH")
      .map((entry) => entry.abilityGameId),
  };
}

/** Certifies the fight's filtered events against the tables. Pure. */
export function certifyFilteredCapture(
  fight: CombatFight,
  tables: CertificationTables,
  request: CertificationRequest,
): FilteredCaptureCertification {
  const range = inclusiveRange(fight.fight.startTimeMs, fight.fight.endTimeMs);
  const binding = {
    reportCode: fight.report.code,
    reportRevision: fight.report.revision,
    fightId: fight.fight.id,
    range,
  };
  const refusal = bindingRefusal(fight, tables);
  if (refusal !== null) {
    return {
      revision: FILTERED_CAPTURE_CERTIFICATION_REVISION,
      binding,
      refusal,
      auraWindows: [],
      completedCasts: [],
      coverage: [],
    };
  }
  const auraWindows = [...new Set(request.auraAbilityGameIds)]
    .sort(ascending)
    .map((id) => certifyAura(fight, id, tables.auraTargetTables.get(id)));
  const completed = fight.events.filter(
    (event): event is CastEvent =>
      event.kind === "CAST" && event.castPhase === "COMPLETE" && inFight(fight, event.reportTimeMs),
  );
  const completedCasts = [...new Set(request.castSourceActorIds)]
    .sort(ascending)
    .map((id) => certifyCasts(fight, id, tables.castTables.get(id), completed));
  const coverage: CertifiedCoverage[] = [
    ...auraWindows
      .filter((entry) => entry.outcome !== "REFUSED")
      .map((entry): CertifiedCoverage => ({
        kind: "AURA_WINDOWS",
        abilityGameId: entry.abilityGameId,
        targetHostility: "FRIENDLIES",
        excludedTargetActorIds: entry.excludedTargetActorIds,
        provenTargetActorIds: entry.provenTargetActorIds,
        range,
        certificateId: entry.certificateId,
      })),
    ...completedCasts
      .filter((entry) => entry.certifiedAbilityGameIds.length > 0)
      .map((entry): CertifiedCoverage => ({
        kind: "COMPLETED_CASTS",
        sourceActorId: entry.sourceActorId,
        abilityGameIds: entry.certifiedAbilityGameIds,
        range,
        certificateId: entry.certificateId,
      })),
  ];
  return {
    revision: FILTERED_CAPTURE_CERTIFICATION_REVISION,
    binding,
    refusal: null,
    auraWindows,
    completedCasts,
    coverage,
  };
}

/**
 * Certifies the fight and attaches exactly the proven coverage. The
 * certification is always recomputed from the fight it is attached to, so a
 * certificate of other events can never be carried onto this one. Any
 * certified coverage the fight already carries is DISCARDED, never merged:
 * coverage inherited from a copy whose events have since changed would
 * otherwise outlive the certificate that refuses it.
 */
export function withCertifiedCoverage(
  fight: CombatFight,
  tables: CertificationTables,
  request: CertificationRequest,
): { readonly fight: CombatFight; readonly certification: FilteredCaptureCertification } {
  const certification = certifyFilteredCapture(fight, tables, request);
  return {
    certification,
    fight: {
      ...fight,
      completeness: {
        ...fight.completeness,
        certifiedCoverage: certification.coverage,
      },
    },
  };
}
