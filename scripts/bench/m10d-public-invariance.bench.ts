/**
 * M10-D invariance capture and report-only timing, OFFLINE, over committed
 * corpus evidence.
 *
 * WHAT IT DOES
 *
 * Runs the REAL application service (both Warcraft Logs ports faked from the
 * artifact), the real public projection, the real Protection registration
 * and the real raid-night service over the committed corpus, and writes what
 * they produced to a capture directory:
 *
 *     <subject>.internal.json   the application-domain FightAnalysis
 *     <subject>.public.json     the projected public document
 *     <subject>.ingest.json     every ingestion request the service issued
 *     raid-night.public.json    a single-Assassination raid night
 *     raid-night-mixed.public.json  the mixed A7R6 roster (post-M10-D only)
 *     raid-night-mixed-ret.public.json  the same roster with the Retribution
 *                               actor over the Protection opener (M11-A4+)
 *     raid-night-mixed-ret-45s.public.json  all three supported specs plus
 *                               Beast Mastery over the Retribution 45 s slice (M11-A5+)
 *     timings.json              wall-clock and CPU per request, invocation
 *                               counts — REPORT ONLY, nothing is asserted
 *
 * Run it once at a baseline commit and once after a change; byte-compare the
 * two directories. That is how M10-D proves Assassination did not move when
 * Protection Paladin became public, how M11-A5 proves neither Assassination
 * nor Protection moved when Retribution Paladin became public, and how each
 * internal outcome is shown unchanged by exposure.
 *
 * WHY THE TIMINGS ASSERT NOTHING
 *
 * A wall-clock threshold in CI fails on a slow runner and teaches the team to
 * ignore it. The numbers are written to the capture directory and read by a
 * person; the only assertions here are that each request completed.
 *
 * Run it deliberately (see `scripts/bench/vitest.config.ts`):
 *
 *     $env:M10D_CAPTURE_DIR = "$env:TEMP\m10d-baseline"
 *     npx vitest run --config scripts/bench/vitest.config.ts scripts/bench/m10d-public-invariance.bench.ts
 *
 * No network, no credential, no Warcraft Logs access.
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import { ANALYZER_REGISTRATIONS, type AnalyzerRegistration } from "../../src/services/analyzer-registry.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import { PROTECTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/protection/registration.js";
import { RETRIBUTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/retribution/registration.js";
import { MCP_TEST_ENV } from "../../tests/support/analysis-transports.js";
import { CURRENT_UNSUPPORTED_SUBJECT } from "../../tests/support/unsupported-subject.js";
import {
  corpusBundleState,
  corpusFight,
  corpusState,
  type BundleHole,
} from "../../tests/support/corpus/fight.js";
import {
  REPORT_CODE,
  assassinationSnapshot,
  corpusArtifactCore,
  fakePorts,
  runNight,
} from "../../tests/support/raid-night-orchestration-fixture.js";

/** Required. There is no default so two runs cannot silently share one directory. */
const CAPTURE_DIR = process.env["M10D_CAPTURE_DIR"] ?? "";

const D2 = "wcl-assassination-d2-decision-corpus";
const GTKB = "wcl-assassination-high-parse-opener";
const PROT_OPENER = "wcl-protection-paladin-a7r6-opener";
const PROT_45S = "wcl-protection-paladin-a7r6-rotational-45s";
const SEG = "wcl-protection-paladin-a7r6-rotational-165s";
const PROT_BUNDLE = [
  PROT_45S,
  `${SEG}.seg-45-60`,
  `${SEG}.seg-60-90`,
  `${SEG}.seg-90-120`,
  `${SEG}.seg-120-165`,
];
const RET_45S = "wcl-retribution-paladin-a7r6-rotational-45s";
const RET_SEG = "wcl-retribution-paladin-a7r6-rotational-165s";
const RET_BUNDLE = [RET_45S, `${RET_SEG}.seg-45-105`, `${RET_SEG}.seg-105-165`];

interface Subject {
  readonly label: string;
  readonly artifactId: string;
  readonly actorId: number;
  readonly className: string;
  readonly specName: string;
}

/** The subjects, all real identities of the committed captures. */
const UNSUPPORTED = CURRENT_UNSUPPORTED_SUBJECT;

const SUBJECTS: readonly Subject[] = [
  { label: "d2", artifactId: D2, actorId: 19, className: "Rogue", specName: "Assassination" },
  { label: "gtkb", artifactId: GTKB, actorId: 25, className: "Rogue", specName: "Assassination" },
  { label: "prot-opener", artifactId: PROT_OPENER, actorId: 7, className: "Paladin", specName: "Protection" },
  { label: "prot-45s", artifactId: PROT_45S, actorId: 7, className: "Paladin", specName: "Protection" },
  // The current unsupported subject, proven from the committed fight-context artifact. It moves when a
  // specialization is onboarded, so compare this subject's files only across captures with the same one.
  {
    label: "unsupported",
    artifactId: PROT_OPENER,
    actorId: UNSUPPORTED.sourceId,
    className: UNSUPPORTED.expectedClassName,
    specName: UNSUPPORTED.expectedSpecName,
  },
  // A7R6 fight 7 actor 6 (Paladin/Retribution), per the committed fight-context
  // artifact, over the PROTECTION opener slice (which holds none of actor 6's
  // evidence). Added at M11-A4 as the public-unsupported baseline
  // (SPEC_NOT_SUPPORTED); since M11-A5 the public service dispatches the
  // Retribution analyzer, which truthfully answers PROFILE_NOT_RESOLVED over
  // this slice. An EXPECTED promotion delta between the A5 captures.
  { label: "ret", artifactId: PROT_OPENER, actorId: 6, className: "Paladin", specName: "Retribution" },
  // The same actor over its OWN committed 45 s slice: SPEC_NOT_SUPPORTED
  // before M11-A5, a real ANALYZED public document after. Added at M11-A5.
  { label: "ret-45s", artifactId: RET_45S, actorId: 6, className: "Paladin", specName: "Retribution" },
];

interface Timing {
  readonly label: string;
  readonly wallMs: number;
  readonly cpuUserMs: number;
  readonly cpuSystemMs: number;
  readonly analyzerCalls: Readonly<Record<string, number>>;
  readonly note?: string;
}

const timings: Timing[] = [];

function identityFor(fight: CombatFight, subject: Subject): FightIdentity {
  return {
    report: {
      code: fight.report.code,
      revision: fight.report.revision,
      startTime: fight.report.startTimeUnixMs,
      endTime: fight.report.endTimeUnixMs,
    },
    data: fight.data,
    fight: {
      id: fight.fight.id,
      name: fight.fight.name,
      encounterId: fight.fight.encounterId,
      difficulty: fight.fight.difficulty,
      startTime: fight.fight.startTimeMs,
      endTime: fight.fight.endTimeMs,
    },
    player: {
      sourceId: subject.actorId,
      name: "Corpusplayer",
      className: subject.className,
      specName: subject.specName,
    },
  };
}

/** The production catalog with every registration's facade counted. */
function countingCatalog(): {
  readonly registry: readonly AnalyzerRegistration[];
  readonly calls: Record<string, number>;
} {
  const calls: Record<string, number> = {};
  const registry = ANALYZER_REGISTRATIONS.map((registration) => {
    calls[registration.analyzerId] = 0;
    return {
      ...registration,
      analyze: (input: Parameters<AnalyzerRegistration["analyze"]>[0]) => {
        calls[registration.analyzerId] = (calls[registration.analyzerId] ?? 0) + 1;
        return registration.analyze(input);
      },
    };
  });
  return { registry, calls };
}

async function timed<T>(
  label: string,
  calls: Readonly<Record<string, number>>,
  work: () => Promise<T> | T,
  note?: string,
): Promise<T> {
  const cpuBefore = process.cpuUsage();
  const wallBefore = performance.now();
  const result = await work();
  const wallMs = performance.now() - wallBefore;
  const cpu = process.cpuUsage(cpuBefore);
  timings.push({
    label,
    wallMs: Math.round(wallMs * 10) / 10,
    cpuUserMs: Math.round(cpu.user / 100) / 10,
    cpuSystemMs: Math.round(cpu.system / 100) / 10,
    analyzerCalls: { ...calls },
    ...(note === undefined ? {} : { note }),
  });
  return result;
}

function write(name: string, value: unknown): void {
  if (CAPTURE_DIR.length === 0) {
    throw new Error("set M10D_CAPTURE_DIR to the directory the capture should be written to");
  }
  mkdirSync(CAPTURE_DIR, { recursive: true });
  writeFileSync(`${CAPTURE_DIR}/${name}`, JSON.stringify(value, null, 2) + "\n", "utf8");
}

describe(`M10-D invariance capture -> ${CAPTURE_DIR}`, () => {
  for (const subject of SUBJECTS) {
    it(`${subject.label}: application service + public projection`, async () => {
      const fight = corpusFight(subject.artifactId);
      const identity = identityFor(fight, subject);
      const ingestRequests: unknown[] = [];
      const preflight: PreflightPort = async () => ({ ok: true, identity, rateLimit: undefined });
      const ingest: CombatIngestionPort = async (request) => {
        ingestRequests.push(request);
        return { ok: true, fight, rateLimit: undefined };
      };
      const catalog = countingCatalog();
      const deps: AnalysisServiceDeps = { env: MCP_TEST_ENV, preflight, ingest, registry: catalog.registry };
      const request = { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: subject.actorId };

      const result = await timed(`analyzeFight:${subject.label}`, catalog.calls, () =>
        analyzeFight(request, deps),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const projected = projectAnalysisResult(result.analysis);

      write(`${subject.label}.internal.json`, result);
      write(`${subject.label}.public.json`, projected);
      write(`${subject.label}.ingest.json`, ingestRequests);
    });
  }

  /** The Protection registration directly over each internal evidence input, as the corpus runs it. */
  const INTERNAL_INPUTS: readonly {
    readonly label: string;
    readonly parts: readonly string[];
    readonly holes: readonly BundleHole[];
  }[] = [
    { label: "prot-opener", parts: [PROT_OPENER], holes: [] },
    { label: "prot-opener-gap", parts: [`${PROT_OPENER}.gap-before-2010000`], holes: [] },
    { label: "prot-45s", parts: [PROT_45S], holes: [] },
    { label: "prot-45s-gap", parts: [`${PROT_45S}.gap-before-2026589`], holes: [] },
    { label: "prot-bundle", parts: PROT_BUNDLE, holes: [] },
    {
      label: "prot-bundle-gap",
      parts: [PROT_45S, `${SEG}.seg-45-60`, `${SEG}.seg-120-165`],
      holes: [{ fromReportTimeMs: 2_064_590, toReportTimeMs: 2_124_589 }],
    },
  ];

  /** The Retribution registration directly over each internal evidence input (M11-A5). */
  const RET_INTERNAL_INPUTS: readonly {
    readonly label: string;
    readonly parts: readonly string[];
    readonly holes: readonly BundleHole[];
  }[] = [
    { label: "ret-45s", parts: [RET_45S], holes: [] },
    { label: "ret-bundle", parts: RET_BUNDLE, holes: [] },
  ];

  for (const input of RET_INTERNAL_INPUTS) {
    it(`${input.label}: the Retribution registration's own analysis`, async () => {
      const state =
        input.parts.length === 1
          ? corpusState(input.parts[0] ?? "")
          : corpusBundleState(input.parts, input.holes);
      const analysis = await timed(
        `registration.analyze:${input.label}`,
        {},
        () =>
          RETRIBUTION_PALADIN_REGISTRATION.analyze({
            state,
            actorId: 6,
            specId: "paladin/retribution",
            targetActorId: null,
          }),
        "state construction excluded",
      );
      expect(analysis.status).toBe("ANALYZED");
      write(`${input.label}.registration.json`, analysis);
    });
  }

  for (const input of INTERNAL_INPUTS) {
    it(`${input.label}: the Protection registration's own analysis`, async () => {
      const state =
        input.parts.length === 1
          ? corpusState(input.parts[0] ?? "")
          : corpusBundleState(input.parts, input.holes);
      const analysis = await timed(
        `registration.analyze:${input.label}`,
        {},
        () =>
          PROTECTION_PALADIN_REGISTRATION.analyze({
            state,
            actorId: 7,
            specId: "paladin/protection",
            targetActorId: null,
          }),
        "state construction excluded",
      );
      expect(analysis.status).toBe("ANALYZED");
      write(`${input.label}.registration.json`, analysis);
    });
  }

  it("raid-night: one Assassination participant over the D2 fixture", async () => {
    const ports = fakePorts({ snapshot: assassinationSnapshot({ fightIds: [1], sourceIds: [19] }) });
    const run = await timed("raidNight:d2-assassination", {}, () =>
      runNight({ reportCode: REPORT_CODE, fightIds: [1] }, ports),
    );
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    write("raid-night.public.json", projectRaidNightResult(run.aggregate));
  });

  it("raid-night: the mixed A7R6 roster over the opener served as one core (M10-D)", async () => {
    // Actors 7 (Paladin/Protection), 19 (Rogue/Assassination), the unsupported subject
    // and 14 (Death Knight/Blood, absent), per the committed fight-context
    // artifact. Not present in a pre-M10-D baseline: the composition needs the
    // public Protection registration, so compare this file across post-M10-D
    // captures only.
    const CLASS_OF: Readonly<Record<number, string>> = {
      7: "Paladin",
      19: "Rogue",
      [UNSUPPORTED.sourceId]: UNSUPPORTED.expectedClassName,
      14: "DeathKnight",
    };
    const SPEC_OF: Readonly<Record<number, string>> = {
      7: "Protection",
      19: "Assassination",
      [UNSUPPORTED.sourceId]: UNSUPPORTED.expectedSpecName,
      14: "Blood",
    };
    const catalog = countingCatalog();
    const ports = fakePorts({
      snapshot: assassinationSnapshot({
        fightIds: [7],
        sourceIds: [7, 19, UNSUPPORTED.sourceId, 14],
        classNameFor: (sourceId) => CLASS_OF[sourceId] ?? "Rogue",
        specNameFor: (_fightId, sourceId) => SPEC_OF[sourceId] ?? null,
        absentOn: new Map([[7, [14]]]),
      }),
      coreFor: (fightId, participants) =>
        corpusArtifactCore(
          PROT_OPENER,
          fightId,
          participants.map((sourceId) => ({ sourceId, className: CLASS_OF[sourceId] ?? "Rogue" })),
        ),
    });
    const run = await timed("raidNight:a7r6-mixed", catalog.calls, () =>
      runNight(
        { reportCode: REPORT_CODE, fightIds: [7] },
        { ...ports, deps: { ...ports.deps, registry: catalog.registry } },
      ),
    );
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    write("raid-night-mixed.public.json", projectRaidNightResult(run.aggregate));
  });

  it("raid-night: the mixed A7R6 roster with the Retribution actor (M11-A4 public-unsupported baseline)", async () => {
    // Actors 7 (Paladin/Protection), 19 (Rogue/Assassination), 6
    // (Paladin/Retribution) per the committed fight-context artifact. A
    // separate file from `raid-night-mixed.public.json` so that capture stays
    // comparable with pre-M11-A4 baselines. Retribution is INTERNAL_ONLY and
    // must appear here exactly as any unsupported participant does.
    const CLASS_OF: Readonly<Record<number, string>> = { 7: "Paladin", 19: "Rogue", 6: "Paladin" };
    const SPEC_OF: Readonly<Record<number, string>> = {
      7: "Protection",
      19: "Assassination",
      6: "Retribution",
    };
    const catalog = countingCatalog();
    const ports = fakePorts({
      snapshot: assassinationSnapshot({
        fightIds: [7],
        sourceIds: [7, 19, 6],
        classNameFor: (sourceId) => CLASS_OF[sourceId] ?? "Rogue",
        specNameFor: (_fightId, sourceId) => SPEC_OF[sourceId] ?? null,
      }),
      coreFor: (fightId, participants) =>
        corpusArtifactCore(
          PROT_OPENER,
          fightId,
          participants.map((sourceId) => ({ sourceId, className: CLASS_OF[sourceId] ?? "Rogue" })),
        ),
    });
    const run = await timed("raidNight:a7r6-mixed-ret", catalog.calls, () =>
      runNight(
        { reportCode: REPORT_CODE, fightIds: [7] },
        { ...ports, deps: { ...ports.deps, registry: catalog.registry } },
      ),
    );
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    write("raid-night-mixed-ret.public.json", projectRaidNightResult(run.aggregate));
  });

  it("raid-night: all three supported specializations plus Beast Mastery over the Retribution 45 s slice (M11-A5)", async () => {
    // Actors 6 (Paladin/Retribution), 7 (Paladin/Protection), 19
    // (Rogue/Assassination) and the unsupported subject per the committed
    // fight-context artifact, over the slice that describes actor 6 only: the
    // Retribution cell is ANALYZED, the other two supported players answer
    // PROFILE_NOT_RESOLVED truthfully, Beast Mastery is SPEC_NOT_SUPPORTED. Not
    // present in a pre-M11-A5 baseline.
    const CLASS_OF: Readonly<Record<number, string>> = {
      6: "Paladin",
      7: "Paladin",
      19: "Rogue",
      [UNSUPPORTED.sourceId]: UNSUPPORTED.expectedClassName,
    };
    const SPEC_OF: Readonly<Record<number, string>> = {
      6: "Retribution",
      7: "Protection",
      19: "Assassination",
      [UNSUPPORTED.sourceId]: UNSUPPORTED.expectedSpecName,
    };
    const catalog = countingCatalog();
    const ports = fakePorts({
      snapshot: assassinationSnapshot({
        fightIds: [7],
        sourceIds: [6, 7, 19, UNSUPPORTED.sourceId],
        classNameFor: (sourceId) => CLASS_OF[sourceId] ?? "Rogue",
        specNameFor: (_fightId, sourceId) => SPEC_OF[sourceId] ?? null,
      }),
      coreFor: (fightId, participants) =>
        corpusArtifactCore(
          RET_45S,
          fightId,
          participants.map((sourceId) => ({ sourceId, className: CLASS_OF[sourceId] ?? "Rogue" })),
        ),
    });
    const run = await timed("raidNight:a7r6-mixed-ret-45s", catalog.calls, () =>
      runNight(
        { reportCode: REPORT_CODE, fightIds: [7] },
        { ...ports, deps: { ...ports.deps, registry: catalog.registry } },
      ),
    );
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    write("raid-night-mixed-ret-45s.public.json", projectRaidNightResult(run.aggregate));
  });

  it("writes the report-only timings", () => {
    write("timings.json", {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      capturedAt: new Date().toISOString(),
      timings,
    });
    expect(timings.length).toBeGreaterThan(0);
  });
});
