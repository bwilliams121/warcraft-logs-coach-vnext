/**
 * M11-G4-1 SimulationContextResolver (owner decisions 2026-10-28):
 *
 * - the build comes ONLY from a proven, region-aware deployment interval:
 *   wago-observed appearance (worst-case timezone) whose identity Blizzard's
 *   CDN verifies, then the region's first evidenced restart, then the next
 *   build's Blizzard CDN availability, with a boundary margin;
 * - region unresolved, region without restart evidence, a fight near a
 *   boundary or outside every interval, invalid or conflicting evidence:
 *   gameBuild null, so selection is SIMULATION_MODEL_CONTEXT_UNRESOLVED;
 * - never a date-only, nearest-build or SimC-snapshot inference;
 * - the canonical fight (US, 2026-10-01T03:05Z) resolves to 12.1.0.69933 and
 *   selects 0a72e6a7.
 */

import { describe, expect, it } from "vitest";

import { RUNNER_MODEL_VALIDATIONS } from "../../../runner/spec-bindings.js";
import { selectSimulationModel } from "../../../src/simulation/model-registry.js";
import {
  COMMITTED_DEPLOY_CALENDAR_EVIDENCE,
  loadDeployCalendarEvidence,
  type DeployCalendarEvidence,
} from "../../../src/simulation-context/evidence.js";
import {
  BOUNDARY_MARGIN_MS,
  deriveDeploymentCalendar,
  OBSERVATION_TIMEZONE_WORST_CASE_MS,
} from "../../../src/simulation-context/intervals.js";
import {
  resolveSimulationContext,
  type SimulationContextFight,
} from "../../../src/simulation-context/resolve.js";
import type { ReportRegion } from "../../../src/wcl/fight-context-query.js";
import { subjectContextResolution, subjectRegion } from "../../support/environment/subject-environment.js";

type Json = Record<string, any>;
const BLOOD = "deathknight/blood";
const US: ReportRegion = { state: "KNOWN", slug: "US" };
const HOUR = 3_600_000;

function committed(): DeployCalendarEvidence {
  if (!COMMITTED_DEPLOY_CALENDAR_EVIDENCE.ok) throw new Error(COMMITTED_DEPLOY_CALENDAR_EVIDENCE.detail);
  return structuredClone(COMMITTED_DEPLOY_CALENDAR_EVIDENCE.evidence);
}
const asLoad = (evidence: DeployCalendarEvidence) => loadDeployCalendarEvidence(evidence);
const fightAt = (utc: string, region: ReportRegion = US): SimulationContextFight => ({
  report: { startTimeUnixMs: Date.parse(utc), region },
  fight: { startTimeMs: 0 },
});
const resolveAt = (utc: string, region: ReportRegion = US, evidence = COMMITTED_DEPLOY_CALENDAR_EVIDENCE) =>
  resolveSimulationContext({ specKey: BLOOD, fight: fightAt(utc, region) }, evidence);

describe("committed deploy-calendar evidence", () => {
  it("loads; every observed build's identity is verified on Blizzard's CDN; sources keep their classes", () => {
    const evidence = committed();
    expect(evidence.observations.provenance.appearanceSource).toMatchObject({
      kind: "THIRD_PARTY_VERSION_SERVER_RECORDER",
      publisher: "wago.tools",
      createdAtSemantics: "WAGO_OBSERVATION_TIME_TIMEZONE_UNDECLARED",
      regionRecorded: false,
    });
    for (const observation of evidence.observations.observations) {
      expect(observation.blizzardCdn, observation.version).toMatchObject({
        httpStatus: 200,
        contentMd5MatchesKey: true,
        buildNameMatchesVersion: true,
      });
    }
    // Third-party timing is never labelled Blizzard-authored.
    for (const restart of evidence.restarts.restarts) {
      for (const source of restart.sources) {
        expect(source.evidenceClass, restart.restartId).toBe("THIRD_PARTY_NEWS_REPORT");
        expect(source.publisher).toBe("Blizzard Watch");
        expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
    expect(evidence.restarts.restarts.map((restart) => restart.region)).toEqual(["US", "US", "US", "US"]);
  });

  it("derives exactly the proven US intervals, each with its basis", () => {
    const calendar = deriveDeploymentCalendar(committed());
    expect(calendar.regionsWithEvidence).toEqual(["US"]);
    expect(
      calendar.intervals.map((interval) => [
        interval.region,
        interval.version,
        interval.fromUtc,
        interval.toUtc,
        interval.basis.restart.restartId,
      ]),
    ).toEqual([
      ["US", "12.1.0.69587", "2026-09-09T04:00:00.000Z", "2026-09-12T06:45:21.000Z", "US-2026-09-08"],
      ["US", "12.1.0.69933", "2026-09-30T03:00:00.000Z", "2026-10-12T04:18:14.000Z", "US-2026-09-29"],
      // M11-G4-5: Live 12.1.5.70575 after the 2026-10-27 US restart. It is the
      // newest observed build, so the interval ends 12 h before the
      // observations were retrieved (no next build is known).
      ["US", "12.1.5.70575", "2026-10-28T03:00:00.000Z", "2026-10-29T01:28:51.141Z", "US-2026-10-27"],
    ]);
    expect(calendar.intervals[2]?.basis.end).toEqual({
      kind: "OBSERVATIONS_RETRIEVED",
      retrievedAtUtc: "2026-10-29T13:28:51.141Z",
    });
    const promoted = calendar.intervals[1];
    expect(promoted?.basis.appearance).toEqual({
      wagoCreatedAtRaw: "2026-09-22 14:18:01",
      // Worst-case timezone: the observation is never read as UTC.
      listedNoLaterThanUtc: "2026-09-23T02:18:01.000Z",
      blizzardCdnLastModifiedUtc: "2026-09-21T22:48:13.000Z",
      blizzardBuildName: "WOW-69933patch12.1.0_Retail",
    });
    expect(promoted?.basis.end).toEqual({
      kind: "NEXT_BUILD_CDN_AVAILABILITY",
      version: "12.1.5.70340",
      blizzardCdnLastModifiedUtc: "2026-10-12T16:18:14.000Z",
    });
  });

  it("the 2026-09-22 US restart does NOT prove 69933: it may precede the worst-case appearance", () => {
    const promoted = deriveDeploymentCalendar(committed()).intervals.find(
      (i) => i.version === "12.1.0.69933",
    );
    expect(promoted?.basis.restart.restartId).toBe("US-2026-09-29");
    expect(Date.parse("2026-09-22T14:00:00Z")).toBeLessThan(
      Date.parse("2026-09-22T14:18:01Z") + OBSERVATION_TIMEZONE_WORST_CASE_MS,
    );
  });
});

describe("canonical fight (committed evidence only)", () => {
  it("the archived region is US and describes the committed context's report state", () => {
    expect(subjectRegion()).toEqual({ state: "KNOWN", slug: "US" });
  });

  it("resolves to 12.1.0.69933 and selects the 0a72e6a7 model", () => {
    const resolution = subjectContextResolution();
    expect(resolution).toMatchObject({
      status: "RESOLVED",
      reason: null,
      context: { specKey: BLOOD, gameBuild: "12.1.0.69933", fightStartUtc: "2026-10-01T03:05:22.921Z" },
    });
    expect(resolution.interval?.basis.restart.evidenceClasses).toEqual(["THIRD_PARTY_NEWS_REPORT"]);
    const selected = selectSimulationModel(resolution.context, RUNNER_MODEL_VALIDATIONS);
    expect(selected.ok && selected.value.model.id).toBe("SIMC_0A72E6A7_LIVE_12_1_0_69933");
  });

  it("the same fight with an unretrieved, unsupplied or EU region does not resolve", () => {
    for (const [region, reason] of [
      [{ state: "NOT_RETRIEVED" }, "REGION_UNRESOLVED"],
      [{ state: "NOT_SUPPLIED" }, "REGION_UNRESOLVED"],
      [{ state: "KNOWN", slug: "EU" }, "REGION_NOT_COVERED"],
    ] as const) {
      const resolution = resolveAt("2026-10-01T03:05:22.921Z", region);
      expect(resolution, region.state).toMatchObject({
        status: "UNRESOLVED",
        reason,
        context: { gameBuild: null },
      });
      const selected = selectSimulationModel(resolution.context, RUNNER_MODEL_VALIDATIONS);
      expect(selected.ok ? "OK" : selected.failure.code).toBe("SIMULATION_MODEL_CONTEXT_UNRESOLVED");
    }
  });
});

describe("fail-closed resolution", () => {
  it("a region slug is case-insensitive; the fight start is report start + fight start", () => {
    const resolution = resolveSimulationContext(
      {
        specKey: BLOOD,
        fight: {
          report: {
            startTimeUnixMs: Date.parse("2026-10-01T00:00:00Z"),
            region: { state: "KNOWN", slug: "us" },
          },
          fight: { startTimeMs: 3 * HOUR },
        },
      },
      COMMITTED_DEPLOY_CALENDAR_EVIDENCE,
    );
    expect(resolution.context).toEqual({
      specKey: BLOOD,
      gameBuild: "12.1.0.69933",
      fightStartUtc: "2026-10-01T03:00:00.000Z",
    });
  });

  it("interval edges: inclusive start, exclusive end; inside the margin is NEAR_DEPLOYMENT_BOUNDARY", () => {
    expect(resolveAt("2026-09-30T03:00:00.000Z").context.gameBuild).toBe("12.1.0.69933");
    expect(resolveAt("2026-09-30T02:59:59.999Z").reason).toBe("NEAR_DEPLOYMENT_BOUNDARY");
    expect(resolveAt("2026-10-12T04:18:13.999Z").context.gameBuild).toBe("12.1.0.69933");
    expect(resolveAt("2026-10-12T04:18:14.000Z").reason).toBe("NEAR_DEPLOYMENT_BOUNDARY");
    // Right after the restart window, before the margin: a log clock error could straddle it.
    expect(resolveAt("2026-09-29T15:30:00Z").reason).toBe("NEAR_DEPLOYMENT_BOUNDARY");
    expect(BOUNDARY_MARGIN_MS).toBe(12 * HOUR);
  });

  it("never a date-only or nearest-build inference: 69933 was listed on 09-22, but 09-25 is unproven", () => {
    // Between the 69587 interval's end and the 69933 interval's start: 69814,
    // 69875 and 69933 were all listed in this span, and no restart proves one.
    for (const utc of ["2026-09-14T12:00:00Z", "2026-09-25T12:00:00Z"]) {
      expect(resolveAt(utc), utc).toMatchObject({
        status: "UNRESOLVED",
        reason: "NO_PROVEN_DEPLOYMENT_INTERVAL",
        context: { gameBuild: null },
      });
    }
    // Early 12.1.5 builds (70340..70529) have no restart proof: no model, and no fallback either way.
    expect(resolveAt("2026-10-20T12:00:00Z").reason).toBe("NO_PROVEN_DEPLOYMENT_INTERVAL");
  });

  it("the historical model resolves only inside its own proven interval and validation window", () => {
    const inside = resolveAt("2026-09-11T12:00:00Z");
    expect(inside.context.gameBuild).toBe("12.1.0.69587");
    const selected = selectSimulationModel(inside.context, RUNNER_MODEL_VALIDATIONS);
    expect(selected.ok && selected.value.model.id).toBe("SIMC_33622E9D_LIVE_12_1_0_69587");
    // Proven 69587 but before Blood's validated window: NOT_AVAILABLE, never the other model.
    const early = selectSimulationModel(resolveAt("2026-09-09T12:00:00Z").context, RUNNER_MODEL_VALIDATIONS);
    expect(early.ok ? "OK" : early.failure.code).toBe("SIMULATION_MODEL_NOT_AVAILABLE");
  });

  it("M11-G4-5: a proven 12.1.5.70575 fight has no Blood model and never falls back to 69933", () => {
    const resolution = resolveAt("2026-10-28T12:00:00Z");
    expect(resolution).toMatchObject({ status: "RESOLVED", context: { gameBuild: "12.1.5.70575" } });
    const selected = selectSimulationModel(resolution.context, RUNNER_MODEL_VALIDATIONS);
    expect(selected.ok ? selected.value.model.id : selected.failure.code).toBe(
      "SIMULATION_MODEL_NOT_AVAILABLE",
    );
    // The restart day itself is inside the boundary margin.
    expect(resolveAt("2026-10-27T20:00:00Z").reason).toBe("NEAR_DEPLOYMENT_BOUNDARY");
  });

  it("a non-finite fight time is FIGHT_TIME_UNRESOLVED with no fight start", () => {
    const resolution = resolveSimulationContext(
      {
        specKey: BLOOD,
        fight: { report: { startTimeUnixMs: Number.NaN, region: US }, fight: { startTimeMs: 0 } },
      },
      COMMITTED_DEPLOY_CALENDAR_EVIDENCE,
    );
    expect(resolution).toMatchObject({
      reason: "FIGHT_TIME_UNRESOLVED",
      context: { fightStartUtc: null, gameBuild: null },
    });
  });

  it("an unrepresentable fight time (outside Date's range, either sign) is FIGHT_TIME_UNRESOLVED, never a throw", () => {
    for (const [startTimeUnixMs, startTimeMs] of [
      [8_640_000_000_000_001, 0],
      [-8_640_000_000_000_001, 0],
      [8_640_000_000_000_000, 1],
      [-8_640_000_000_000_000, -1],
      [Number.POSITIVE_INFINITY, 0],
    ] as const) {
      const run = () =>
        resolveSimulationContext(
          { specKey: BLOOD, fight: { report: { startTimeUnixMs, region: US }, fight: { startTimeMs } } },
          COMMITTED_DEPLOY_CALENDAR_EVIDENCE,
        );
      expect(run, String(startTimeUnixMs)).not.toThrow();
      expect(run(), String(startTimeUnixMs)).toMatchObject({
        status: "UNRESOLVED",
        reason: "FIGHT_TIME_UNRESOLVED",
        context: { gameBuild: null, fightStartUtc: null },
      });
    }
  });

  it("evidence timestamps outside years 2000-2999 are refused at load (derived bounds stay representable)", () => {
    for (const raw of ["1999-12-31 23:59:59", "3000-01-01 00:00:00", "+275760-09-13 00:00:00"]) {
      const evidence = committed() as Json;
      evidence["observations"]["observations"][0]["wago"]["createdAtRaw"] = raw;
      const load = loadDeployCalendarEvidence(evidence as never);
      expect(load.ok, raw).toBe(false);
      expect(() => resolveAt("2026-10-01T03:05:22.921Z", US, load), raw).not.toThrow();
    }
  });

  it("invalid evidence resolves nothing", () => {
    const broken = committed() as Json;
    broken["observations"]["observations"][0]["blizzardCdn"]["httpStatus"] = "200";
    const load = loadDeployCalendarEvidence(broken as never);
    expect(load.ok).toBe(false);
    expect(resolveAt("2026-10-01T03:05:22.921Z", US, load).reason).toBe("DEPLOY_EVIDENCE_INVALID");
    const duplicate = committed() as Json;
    duplicate["restarts"]["restarts"].push(duplicate["restarts"]["restarts"][0]);
    expect(loadDeployCalendarEvidence(duplicate as never)).toEqual({
      ok: false,
      detail: "duplicate restartId",
    });
  });
});

describe("evidence rules", () => {
  const promotedWith = (mutate: (evidence: Json) => void) => {
    const evidence = committed() as Json;
    mutate(evidence);
    return resolveAt("2026-10-01T03:05:22.921Z", US, asLoad(evidence as DeployCalendarEvidence));
  };
  const observation = (evidence: Json, version: string): Json =>
    evidence["observations"]["observations"].find((entry: Json) => entry["version"] === version);

  it("an identity Blizzard's CDN did not verify proves nothing, and unbounds the build before it", () => {
    for (const field of ["contentMd5MatchesKey", "buildNameMatchesVersion"]) {
      expect(
        promotedWith((evidence) => (observation(evidence, "12.1.0.69933")["blizzardCdn"][field] = false))
          .reason,
      ).toBe("NO_PROVEN_DEPLOYMENT_INTERVAL");
    }
    const calendar = deriveDeploymentCalendar(
      (() => {
        const evidence = committed() as Json;
        observation(evidence, "12.1.5.70340")["blizzardCdn"]["httpStatus"] = 404;
        return evidence as DeployCalendarEvidence;
      })(),
    );
    expect(calendar.excluded).toContainEqual({
      version: "12.1.0.69933",
      region: null,
      reason: "NEXT_BUILD_UNBOUNDED",
      spanUtc: null,
    });
    // 70575 rests on its own identity and restart, not on 70340's.
    expect(calendar.intervals.map((interval) => interval.version)).toEqual(["12.1.0.69587", "12.1.5.70575"]);
  });

  it("an observation that precedes the build's own CDN config (even in the worst case) is a source conflict", () => {
    const calendar = deriveDeploymentCalendar(
      (() => {
        const evidence = committed() as Json;
        observation(evidence, "12.1.0.69933")["blizzardCdn"]["lastModifiedUtc"] = "2026-09-23T03:00:00.000Z";
        return evidence as DeployCalendarEvidence;
      })(),
    );
    expect(calendar.excluded).toContainEqual({
      version: "12.1.0.69933",
      region: null,
      reason: "SOURCES_CONFLICT",
      spanUtc: null,
    });
  });

  it("restart evidence: imprecise windows and restarts after the next build's availability prove nothing", () => {
    const imprecise = promotedWith((evidence) => {
      const restart = evidence["restarts"]["restarts"].find(
        (entry: Json) => entry["restartId"] === "US-2026-09-29",
      );
      restart["window"] = { fromUtc: "2026-09-29T00:00:00Z", toUtc: "2026-09-30T06:00:00Z" };
    });
    expect(imprecise.reason).toBe("NO_PROVEN_DEPLOYMENT_INTERVAL");
    const withoutRestart = promotedWith((evidence) => {
      evidence["restarts"]["restarts"] = evidence["restarts"]["restarts"].filter(
        (entry: Json) => entry["restartId"] !== "US-2026-09-29",
      );
    });
    expect(withoutRestart.reason).toBe("NO_PROVEN_DEPLOYMENT_INTERVAL");
  });

  it("a restart in another region proves nothing for this one", () => {
    const evidence = committed() as Json;
    for (const restart of evidence["restarts"]["restarts"]) restart["region"] = "EU";
    expect(resolveAt("2026-10-01T03:05:22.921Z", US, asLoad(evidence as DeployCalendarEvidence)).reason).toBe(
      "REGION_NOT_COVERED",
    );
    expect(
      resolveAt(
        "2026-10-01T03:05:22.921Z",
        { state: "KNOWN", slug: "EU" },
        asLoad(evidence as DeployCalendarEvidence),
      ).context.gameBuild,
    ).toBe("12.1.0.69933");
  });
  it("conflicting accounts of one maintenance resolve nothing they touch (DEPLOYMENT_EVIDENCE_CONFLICT)", () => {
    // A second, overlapping but different account of the 09-29 US maintenance.
    const evidence = committed() as Json;
    const original = evidence["restarts"]["restarts"].find(
      (entry: Json) => entry["restartId"] === "US-2026-09-29",
    );
    evidence["restarts"]["restarts"].push({
      ...structuredClone(original),
      restartId: "US-2026-09-29-b",
      window: { fromUtc: "2026-09-29T14:30:00Z", toUtc: "2026-09-30T13:00:00Z" },
    });
    const load = asLoad(evidence as DeployCalendarEvidence);
    expect(load.ok).toBe(true);
    for (const utc of ["2026-09-30T04:00:00Z", "2026-10-01T03:05:22.921Z"]) {
      expect(resolveAt(utc, US, load), utc).toMatchObject({
        status: "UNRESOLVED",
        reason: "DEPLOYMENT_EVIDENCE_CONFLICT",
        context: { gameBuild: null },
      });
    }
    // A build whose span the conflict does not touch is unaffected.
    expect(resolveAt("2026-09-11T12:00:00Z", US, load).context.gameBuild).toBe("12.1.0.69587");
    // An identical second account corroborates rather than conflicts.
    const corroborated = committed() as Json;
    corroborated["restarts"]["restarts"].push({ ...structuredClone(original), restartId: "US-2026-09-29-c" });
    expect(
      resolveAt("2026-10-01T03:05:22.921Z", US, asLoad(corroborated as DeployCalendarEvidence)).context
        .gameBuild,
    ).toBe("12.1.0.69933");
  });

  it("unreal calendar timestamps are refused at load and resolve as DEPLOY_EVIDENCE_INVALID without throwing", () => {
    const cases: [string, (evidence: Json) => void][] = [
      [
        "retrieval time",
        (evidence) =>
          (evidence["observations"]["provenance"]["appearanceSource"]["retrievedAtUtc"] =
            "2026-99-99T14:49:19Z"),
      ],
      [
        "wago observation",
        (evidence) => (observation(evidence, "12.1.0.69933")["wago"]["createdAtRaw"] = "2026-02-30 14:18:01"),
      ],
      [
        "CDN Last-Modified",
        (evidence) =>
          (observation(evidence, "12.1.0.69933")["blizzardCdn"]["lastModifiedUtc"] =
            "2026-09-21T25:48:13.000Z"),
      ],
      [
        "restart window",
        (evidence) => (evidence["restarts"]["restarts"][0]["window"]["toUtc"] = "2026-13-01T00:00:00Z"),
      ],
    ];
    for (const [label, mutate] of cases) {
      const evidence = committed() as Json;
      mutate(evidence);
      const load = asLoad(evidence as DeployCalendarEvidence);
      expect(load.ok, label).toBe(false);
      expect(() => resolveAt("2026-10-01T03:05:22.921Z", US, load), label).not.toThrow();
      expect(resolveAt("2026-10-01T03:05:22.921Z", US, load).reason, label).toBe("DEPLOY_EVIDENCE_INVALID");
    }
  });
});
