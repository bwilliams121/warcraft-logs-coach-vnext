/**
 * M11-G4-1 SimulationContextResolver: a log -> the `SimulationGameContext`
 * that `selectSimulationModel` consumes. Prerequisite of G4 publication and
 * deliberately separate from it: no ceiling, statistic or simulation here.
 *
 * - Fight start is an observed Warcraft Logs fact: report start plus fight
 *   start. Non-finite values leave it null.
 * - Region is the report's Warcraft Logs region (`Report.region.slug`).
 *   NOT_RETRIEVED and NOT_SUPPLIED are not regions.
 * - Game build comes ONLY from a proven deployment interval
 *   (`intervals.ts`) in that region containing the fight start. Otherwise it
 *   is null, which selection turns into SIMULATION_MODEL_CONTEXT_UNRESOLVED.
 *   There is no nearest-build, newest-build, date-only or snapshot fallback.
 */

import type { ReportRegion } from "../wcl/fight-context-query.js";
import type { SimulationGameContext } from "../simulation/model-registry.js";
import type { DeployCalendarEvidenceLoad } from "./evidence.js";
import {
  BOUNDARY_MARGIN_MS,
  deriveDeploymentCalendar,
  type DeploymentCalendar,
  type ProvenDeploymentInterval,
} from "./intervals.js";

export const SIMULATION_CONTEXT_RESOLVER_REVISION = "simulation-context-resolver/1";

export type SimulationContextUnresolvedReason =
  | "FIGHT_TIME_UNRESOLVED"
  | "REGION_UNRESOLVED"
  | "REGION_NOT_COVERED"
  | "DEPLOY_EVIDENCE_INVALID"
  | "NEAR_DEPLOYMENT_BOUNDARY"
  | "NO_PROVEN_DEPLOYMENT_INTERVAL"
  | "DEPLOYMENT_EVIDENCE_CONFLICT";

/** The observed facts the resolver reads. A `CombatFight` satisfies it. */
export interface SimulationContextFight {
  readonly report: { readonly startTimeUnixMs: number; readonly region: ReportRegion };
  readonly fight: { readonly startTimeMs: number };
}

export interface SimulationContextResolution {
  readonly revision: typeof SIMULATION_CONTEXT_RESOLVER_REVISION;
  /** `gameBuild` is non-null only when `status` is RESOLVED. */
  readonly context: SimulationGameContext;
  readonly status: "RESOLVED" | "UNRESOLVED";
  readonly reason: SimulationContextUnresolvedReason | null;
  readonly detail: string;
  readonly region: ReportRegion;
  /** The proven interval the build came from; null when unresolved. */
  readonly interval: ProvenDeploymentInterval | null;
}

/** Normalizes a Warcraft Logs region slug to the calendar's region key. */
export const calendarRegionOf = (region: ReportRegion): string | null =>
  region.state === "KNOWN" ? region.slug.trim().toUpperCase() : null;

export function resolveSimulationContext(
  input: { readonly specKey: string; readonly fight: SimulationContextFight },
  evidence: DeployCalendarEvidenceLoad,
): SimulationContextResolution {
  const startMs = input.fight.report.startTimeUnixMs + input.fight.fight.startTimeMs;
  // A Date represents only +-8.64e15 ms; a finite sum outside that range is not a time.
  const startDate = new Date(startMs);
  const fightStartUtc = Number.isFinite(startDate.getTime()) ? startDate.toISOString() : null;
  const region = input.fight.report.region;
  const unresolved = (
    reason: SimulationContextUnresolvedReason,
    detail: string,
  ): SimulationContextResolution => ({
    revision: SIMULATION_CONTEXT_RESOLVER_REVISION,
    context: { specKey: input.specKey, gameBuild: null, fightStartUtc },
    status: "UNRESOLVED",
    reason,
    detail,
    region,
    interval: null,
  });

  if (fightStartUtc === null)
    return unresolved("FIGHT_TIME_UNRESOLVED", "report or fight start is not a finite time");
  const regionKey = calendarRegionOf(region);
  if (regionKey === null) {
    return unresolved("REGION_UNRESOLVED", `the report's region is ${region.state}, not a region`);
  }
  if (!evidence.ok) return unresolved("DEPLOY_EVIDENCE_INVALID", evidence.detail);

  const calendar: DeploymentCalendar = deriveDeploymentCalendar(evidence.evidence);
  if (!calendar.regionsWithEvidence.includes(regionKey)) {
    return unresolved("REGION_NOT_COVERED", `no restart evidence exists for region ${regionKey}`);
  }
  const inRegion = calendar.intervals.filter((interval) => interval.region === regionKey);
  const containing = inRegion.filter(
    (interval) => Date.parse(interval.fromUtc) <= startMs && startMs < Date.parse(interval.toUtc),
  );
  if (containing.length > 1) {
    return unresolved(
      "DEPLOYMENT_EVIDENCE_CONFLICT",
      `${String(containing.length)} proven intervals contain ${fightStartUtc} in ${regionKey}`,
    );
  }
  const interval = containing[0];
  if (interval === undefined) {
    const conflict = calendar.excluded.find(
      (entry) =>
        entry.region === regionKey &&
        entry.reason === "RESTART_EVIDENCE_CONFLICT" &&
        entry.spanUtc !== null &&
        Date.parse(entry.spanUtc.fromUtc) <= startMs &&
        startMs < Date.parse(entry.spanUtc.toUtc),
    );
    if (conflict !== undefined) {
      return unresolved(
        "DEPLOYMENT_EVIDENCE_CONFLICT",
        `conflicting ${regionKey} restart accounts span ${fightStartUtc} (build ${conflict.version})`,
      );
    }
    const near = inRegion.some(
      (candidate) =>
        Date.parse(candidate.fromUtc) - BOUNDARY_MARGIN_MS <= startMs &&
        startMs < Date.parse(candidate.toUtc) + BOUNDARY_MARGIN_MS,
    );
    return near
      ? unresolved(
          "NEAR_DEPLOYMENT_BOUNDARY",
          `${fightStartUtc} is within the boundary margin of a proven ${regionKey} interval`,
        )
      : unresolved(
          "NO_PROVEN_DEPLOYMENT_INTERVAL",
          `no proven ${regionKey} interval contains ${fightStartUtc}`,
        );
  }
  return {
    revision: SIMULATION_CONTEXT_RESOLVER_REVISION,
    context: { specKey: input.specKey, gameBuild: interval.version, fightStartUtc },
    status: "RESOLVED",
    reason: null,
    detail: `${regionKey} ${interval.version} proven over [${interval.fromUtc}, ${interval.toUtc}) by restart ${interval.basis.restart.restartId}`,
    region,
    interval,
  };
}
