/**
 * M11-G4-1 PROVEN DEPLOYMENT INTERVALS: when a region's clients were provably
 * on one client build.
 *
 * Rule (owner decision 2026-10-28): a log counts as build B in region R only
 * after the first regional restart in R that followed B's appearance, and
 * only until the next build could have been available. A restart disconnects
 * every client; reconnecting clients must run the build the version server
 * lists. Every bound below is taken in its conservative direction:
 *
 * - APPEARANCE of B, upper bound: wago's observation is wall-clock time in an
 *   UNDECLARED timezone. It is read in the worst case (UTC-12), so B was
 *   listed no later than `createdAtRaw + 12 h`. The observation is never
 *   promoted to a Blizzard deployment time.
 * - IDENTITY of B: Blizzard's CDN serves B's build config, whose MD5 is its
 *   key and whose `build-name` names B. Otherwise B has no interval, and
 *   neither does the build before it (that build's end bound is unknown).
 * - CONSISTENCY: the config existed on the CDN (`Last-Modified`) no later than
 *   the appearance upper bound. Otherwise the sources conflict and B has no
 *   interval.
 * - CONFLICTS: two restart records in one region whose windows overlap but
 *   differ are conflicting accounts of one maintenance. Neither proves
 *   anything, and no build whose span either touches gets an interval in that
 *   region (RESTART_EVIDENCE_CONFLICT).
 * - RESTART: the first restart in R whose window STARTS at or after B's
 *   appearance upper bound, and whose window ENDS before the next build could
 *   have been available. Its window must be explicit and at most
 *   MAX_RESTART_WINDOW_MS long.
 * - NEXT BUILD, lower bound on availability: its Blizzard CDN `Last-Modified`.
 *   No client could run it before its config existed. The newest observed
 *   build is bounded by the observation retrieval time instead.
 * - MARGIN: the interval is
 *   `[restart end + BOUNDARY_MARGIN_MS, next availability - BOUNDARY_MARGIN_MS)`.
 *   The margin absorbs log-clock and upload-timezone error and maintenance that
 *   overran or started late. A fight inside the margin is NEAR_BOUNDARY,
 *   never resolved.
 *
 * No interval is inferred from a fight date alone, from a SimulationCraft
 * snapshot, or from a generic weekly cadence.
 */

import type { DeployCalendarEvidence, LiveBuildObservation, RegionalRestart } from "./evidence.js";

const HOUR_MS = 3_600_000;

/** Worst-case reading of an undeclared-timezone observation (UTC-12). */
export const OBSERVATION_TIMEZONE_WORST_CASE_MS = 12 * HOUR_MS;
/** Inner margin on both interval edges. */
export const BOUNDARY_MARGIN_MS = 12 * HOUR_MS;
/** A restart window longer than this is not precise enough to bound anything. */
export const MAX_RESTART_WINDOW_MS = 24 * HOUR_MS;

export interface ProvenDeploymentInterval {
  readonly region: string;
  readonly version: string;
  readonly buildId: number;
  /** Inclusive. */
  readonly fromUtc: string;
  /** Exclusive. */
  readonly toUtc: string;
  readonly basis: {
    readonly appearance: {
      readonly wagoCreatedAtRaw: string;
      readonly listedNoLaterThanUtc: string;
      readonly blizzardCdnLastModifiedUtc: string;
      readonly blizzardBuildName: string;
    };
    readonly restart: {
      readonly restartId: string;
      readonly windowFromUtc: string;
      readonly windowToUtc: string;
      readonly evidenceClasses: readonly string[];
      readonly publishers: readonly string[];
    };
    readonly end:
      | {
          readonly kind: "NEXT_BUILD_CDN_AVAILABILITY";
          readonly version: string;
          readonly blizzardCdnLastModifiedUtc: string;
        }
      | { readonly kind: "OBSERVATIONS_RETRIEVED"; readonly retrievedAtUtc: string };
  };
}

export interface ExcludedBuild {
  readonly version: string;
  readonly region: string | null;
  readonly reason:
    | "IDENTITY_UNVERIFIED"
    | "SOURCES_CONFLICT"
    | "NEXT_BUILD_UNBOUNDED"
    | "RESTART_EVIDENCE_CONFLICT"
    | "NO_RESTART_EVIDENCE"
    | "INTERVAL_EMPTY_AFTER_MARGIN";
  /** For region-scoped exclusions: [B listed upper bound, next availability). */
  readonly spanUtc: { readonly fromUtc: string; readonly toUtc: string } | null;
}

export interface DeploymentCalendar {
  readonly intervals: readonly ProvenDeploymentInterval[];
  readonly excluded: readonly ExcludedBuild[];
  /** Regions with any restart evidence at all. */
  readonly regionsWithEvidence: readonly string[];
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** wago's `YYYY-MM-DD hh:mm:ss`, read as if it were UTC (the caller applies the worst case). */
const wallClockMs = (raw: string): number => Date.parse(`${raw.replace(" ", "T")}Z`);

function identityVerified(observation: LiveBuildObservation): boolean {
  const cdn = observation.blizzardCdn;
  return (
    cdn.httpStatus === 200 &&
    cdn.contentMd5MatchesKey &&
    cdn.buildNameMatchesVersion &&
    cdn.buildName !== null &&
    cdn.lastModifiedUtc !== null
  );
}

const windowsOverlap = (a: RegionalRestart, b: RegionalRestart): boolean =>
  Date.parse(a.window.fromUtc) < Date.parse(b.window.toUtc) &&
  Date.parse(b.window.fromUtc) < Date.parse(a.window.toUtc);

const sameWindow = (a: RegionalRestart, b: RegionalRestart): boolean =>
  Date.parse(a.window.fromUtc) === Date.parse(b.window.fromUtc) &&
  Date.parse(a.window.toUtc) === Date.parse(b.window.toUtc);

/** Records in one region that overlap another record with a different window. */
function conflictingRestartIds(restarts: readonly RegionalRestart[]): ReadonlySet<string> {
  const conflicting = new Set<string>();
  for (const a of restarts) {
    for (const b of restarts) {
      if (a !== b && a.region === b.region && windowsOverlap(a, b) && !sameWindow(a, b)) {
        conflicting.add(a.restartId);
        conflicting.add(b.restartId);
      }
    }
  }
  return conflicting;
}

function restartPrecise(restart: RegionalRestart): boolean {
  const from = Date.parse(restart.window.fromUtc);
  const to = Date.parse(restart.window.toUtc);
  return from < to && to - from <= MAX_RESTART_WINDOW_MS;
}

/** Derives every proven interval from the evidence. Pure; deterministic. */
export function deriveDeploymentCalendar(evidence: DeployCalendarEvidence): DeploymentCalendar {
  const observations = [...evidence.observations.observations].sort((a, b) =>
    a.wago.createdAtRaw.localeCompare(b.wago.createdAtRaw),
  );
  const retrievedAtMs = Date.parse(evidence.observations.provenance.appearanceSource.retrievedAtUtc);
  const regions = [...new Set(evidence.restarts.restarts.map((restart) => restart.region))].sort();
  const intervals: ProvenDeploymentInterval[] = [];
  const excluded: ExcludedBuild[] = [];
  const conflicting = conflictingRestartIds(evidence.restarts.restarts);

  observations.forEach((observation, index) => {
    if (!identityVerified(observation)) {
      excluded.push({
        version: observation.version,
        region: null,
        reason: "IDENTITY_UNVERIFIED",
        spanUtc: null,
      });
      return;
    }
    const listedNoLaterThanMs =
      wallClockMs(observation.wago.createdAtRaw) + OBSERVATION_TIMEZONE_WORST_CASE_MS;
    const cdnLastModifiedMs = Date.parse(observation.blizzardCdn.lastModifiedUtc ?? "");
    if (!(cdnLastModifiedMs <= listedNoLaterThanMs)) {
      excluded.push({
        version: observation.version,
        region: null,
        reason: "SOURCES_CONFLICT",
        spanUtc: null,
      });
      return;
    }
    const next = observations[index + 1];
    let end: ProvenDeploymentInterval["basis"]["end"];
    let endMs: number;
    if (next === undefined) {
      end = { kind: "OBSERVATIONS_RETRIEVED", retrievedAtUtc: iso(retrievedAtMs) };
      endMs = retrievedAtMs;
    } else {
      const nextLastModified = next.blizzardCdn.lastModifiedUtc;
      if (!identityVerified(next) || nextLastModified === null) {
        excluded.push({
          version: observation.version,
          region: null,
          reason: "NEXT_BUILD_UNBOUNDED",
          spanUtc: null,
        });
        return;
      }
      end = {
        kind: "NEXT_BUILD_CDN_AVAILABILITY",
        version: next.version,
        blizzardCdnLastModifiedUtc: nextLastModified,
      };
      endMs = Date.parse(nextLastModified);
    }

    const spanUtc = { fromUtc: iso(listedNoLaterThanMs), toUtc: iso(endMs) };
    for (const region of regions) {
      const touchesConflict = evidence.restarts.restarts.some(
        (candidate) =>
          candidate.region === region &&
          conflicting.has(candidate.restartId) &&
          Date.parse(candidate.window.fromUtc) < endMs &&
          Date.parse(candidate.window.toUtc) > listedNoLaterThanMs,
      );
      if (touchesConflict) {
        excluded.push({ version: observation.version, region, reason: "RESTART_EVIDENCE_CONFLICT", spanUtc });
        continue;
      }
      const restart = evidence.restarts.restarts
        .filter(
          (candidate) =>
            candidate.region === region &&
            restartPrecise(candidate) &&
            Date.parse(candidate.window.fromUtc) >= listedNoLaterThanMs &&
            Date.parse(candidate.window.toUtc) < endMs,
        )
        .sort((a, b) => Date.parse(a.window.fromUtc) - Date.parse(b.window.fromUtc))[0];
      if (restart === undefined) {
        excluded.push({ version: observation.version, region, reason: "NO_RESTART_EVIDENCE", spanUtc });
        continue;
      }
      const fromMs = Date.parse(restart.window.toUtc) + BOUNDARY_MARGIN_MS;
      const toMs = endMs - BOUNDARY_MARGIN_MS;
      if (!(fromMs < toMs)) {
        excluded.push({
          version: observation.version,
          region,
          reason: "INTERVAL_EMPTY_AFTER_MARGIN",
          spanUtc,
        });
        continue;
      }
      intervals.push({
        region,
        version: observation.version,
        buildId: observation.buildId,
        fromUtc: iso(fromMs),
        toUtc: iso(toMs),
        basis: {
          appearance: {
            wagoCreatedAtRaw: observation.wago.createdAtRaw,
            listedNoLaterThanUtc: iso(listedNoLaterThanMs),
            blizzardCdnLastModifiedUtc: observation.blizzardCdn.lastModifiedUtc ?? "",
            blizzardBuildName: observation.blizzardCdn.buildName ?? "",
          },
          restart: {
            restartId: restart.restartId,
            windowFromUtc: restart.window.fromUtc,
            windowToUtc: restart.window.toUtc,
            evidenceClasses: [...new Set(restart.sources.map((source) => source.evidenceClass))],
            publishers: [...new Set(restart.sources.map((source) => source.publisher))],
          },
          end,
        },
      });
    }
  });

  return { intervals, excluded, regionsWithEvidence: regions };
}
