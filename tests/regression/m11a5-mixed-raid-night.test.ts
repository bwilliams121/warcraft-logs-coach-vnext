/**
 * M11-A5: public raid-night orchestration recognizes Retribution Paladin —
 * alone, in a roster mixing all three supported specializations, and beside
 * the canonical unsupported subject — over REAL evidence, with no fabrication
 * and no Retribution branch in the orchestration.
 *
 * THE COMPOSITION, AND WHY IT IS HONEST
 *
 * The core is the committed Retribution 45 s slice: every event actor 6 (the
 * Retribution Paladin) sources or is targeted by, and nothing else. The
 * roster is five real participants of A7R6 fight 7 per the committed
 * fight-context artifact:
 *
 *     6   Paladin / Retribution   ANALYZED — the real M11-A4 evidence
 *     7   Paladin / Protection    the analyzer runs and must answer for the
 *                                 absence of its own evidence TRUTHFULLY
 *     19  Rogue / Assassination   likewise
 *     4   Warrior / Arms          SPEC_NOT_SUPPORTED — no analyzer exists
 *     14  Death Knight / Blood    absent from the pull
 *
 * Nothing is relabelled and no Protection or Rogue event is manufactured:
 * their cells are their analyzers' own PROFILE_NOT_RESOLVED, never ANALYZED
 * cells built from nothing. Until M11-A5 actor 6's cell here was
 * SPEC_NOT_SUPPORTED, exactly like actor 4's; that is the one intended
 * raid-night delta of the promotion, and every other participant's cell is
 * unchanged.
 *
 * WHAT IS PROVEN
 *
 * Roster discovery once, ingestion once for the one fight, revision confirmed
 * once, each supported player's analyzer exactly once and the right one, no
 * analyzer for Arms, every cell's kind/status/spec preserved, the Retribution
 * cell carrying the same totals the single-fight service publishes for the
 * same evidence with the exclusion tally already projected onto the public
 * vocabulary (OUTSIDE_SUPPORTED_SLICE, never the internal name), and the
 * public raid-night document schema-valid with no internal field.
 */

import { describe, expect, it } from "vitest";

import { PublicRaidNightResultSchema } from "../../src/contracts/raid-night-contract.js";
import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import type { PlayerFightResult } from "../../src/aggregation/cell.js";
import { PROTECTION_PALADIN_ANALYZER_ID } from "../../src/specs/paladin/protection/spec.js";
import { RETRIBUTION_PALADIN_ANALYZER_ID } from "../../src/specs/paladin/retribution/spec.js";
import { ASSASSINATION_ANALYZER_ID } from "../../src/specs/rogue/assassination/registration.js";
import { countedProductionCatalog } from "../support/catalog.js";
import {
  REPORT_CODE,
  assassinationSnapshot,
  corpusArtifactCore,
  fakePorts,
  runNight,
  type FakePorts,
} from "../support/raid-night-orchestration-fixture.js";
import { CURRENT_UNSUPPORTED_SUBJECT } from "../support/unsupported-subject.js";

const RET45 = "wcl-retribution-paladin-a7r6-rotational-45s";
/** A7R6 fight 7 identities, per `wcl-fight-context-a7r6-fight-7.json`. */
const FIGHT_ID = 7;
const RETRIBUTION = 6;
const PROTECTION = 7;
const ROGUE = 19;
const ARMS = CURRENT_UNSUPPORTED_SUBJECT.sourceId;
const BLOOD_DK = 14;

const CLASS_OF: Readonly<Record<number, string>> = {
  [RETRIBUTION]: "Paladin",
  [PROTECTION]: "Paladin",
  [ROGUE]: "Rogue",
  [ARMS]: CURRENT_UNSUPPORTED_SUBJECT.expectedClassName,
  [BLOOD_DK]: "DeathKnight",
};
const SPEC_OF: Readonly<Record<number, string>> = {
  [RETRIBUTION]: "Retribution",
  [PROTECTION]: "Protection",
  [ROGUE]: "Assassination",
  [ARMS]: CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName,
  [BLOOD_DK]: "Blood",
};

/** The Retribution 45 s totals the single-fight service publishes for this evidence. */
const RET45_COUNTS = {
  eligibleDecisions: 26,
  match: 0,
  rejected: 1,
  unknown: 25,
  resolvedComparisons: 1,
  excludedCastCount: 58,
  exclusions: [
    { key: "NON_GCD_ACTION", count: 38 },
    { key: "OUTSIDE_SUPPORTED_SLICE", count: 20 },
  ],
};

function classNameFor(sourceId: number): string {
  return CLASS_OF[sourceId] ?? "Rogue";
}

function portsFor(
  roster: readonly number[],
  absent: readonly number[] = [],
): { readonly ports: FakePorts; readonly calls: Readonly<Record<string, number>> } {
  const snapshot = assassinationSnapshot({
    fightIds: [FIGHT_ID],
    sourceIds: [...roster],
    classNameFor,
    specNameFor: (_fightId, sourceId) => SPEC_OF[sourceId] ?? null,
    ...(absent.length === 0 ? {} : { absentOn: new Map([[FIGHT_ID, [...absent]]]) }),
    // Entombed Sentinels, Mythic, a kill — the A7R6 fight 7 facts.
    fightFacts: { encounterId: 3445, difficulty: 5, kill: true, startTimeMs: 1_000, endTimeMs: 400_000 },
  });
  const counted = countedProductionCatalog();
  const ports = fakePorts({
    snapshot,
    coreFor: (fightId, participants) =>
      corpusArtifactCore(
        RET45,
        fightId,
        participants.map((sourceId) => ({ sourceId, className: classNameFor(sourceId) })),
      ),
  });
  return {
    ports: { ...ports, deps: { ...ports.deps, registry: counted.registry } },
    calls: counted.calls,
  };
}

function cellOf(cells: readonly PlayerFightResult[], sourceId: number): PlayerFightResult {
  const cell = cells.find((candidate) => candidate.fightId === FIGHT_ID && candidate.sourceId === sourceId);
  if (cell === undefined) throw new Error(`no cell for ${String(sourceId)}`);
  return cell;
}

function expectRetributionCell(cell: PlayerFightResult): void {
  expect(cell.kind).toBe("ANALYZED");
  if (cell.kind !== "ANALYZED") return;
  expect(cell.specName).toBe("Retribution");
  expect(cell.provenance).toMatchObject({
    analyzerId: RETRIBUTION_PALADIN_ANALYZER_ID,
    specId: "paladin/retribution",
    authorityId: "SIMC_APL_PALADIN_RETRIBUTION",
    authorityArtifactRevision: "simc-33622e9d-1",
  });
  expect(cell.counts).toMatchObject(RET45_COUNTS);
  // One REJECTED pattern (the first Divine Storm), no recommendation, the
  // UNKNOWNs carried as evidence limitations, the slice boundary as an
  // exclusion pattern under its PUBLIC name.
  expect(cell.recurrence.rejectedPatterns.reduce((sum, row) => sum + row.count, 0)).toBe(1);
  expect(cell.recurrence.evidenceLimitations.reduce((sum, row) => sum + row.count, 0)).toBe(25);
  expect(cell.recurrence.exclusionPatterns.some((row) => row.key.includes("OUTSIDE_SUPPORTED_SLICE"))).toBe(
    true,
  );
  const json = JSON.stringify(cell);
  for (const internal of ["OUTSIDE_FIRST_SLICE", "MELEE_SWING", "rawBlocker", "rootScanBlockedAt"]) {
    expect(json, internal).not.toContain(internal);
  }
}

describe("a Retribution Paladin alone", () => {
  it("is discovered once, ingested once, analyzed by its own analyzer exactly once, and published", async () => {
    const { ports, calls } = portsFor([RETRIBUTION]);
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    expect(run.ok).toBe(true);
    if (!run.ok) return;

    expect(ports.rosterCalls()).toBe(1);
    expect(ports.ingestedFightIds()).toEqual([FIGHT_ID]);
    expect(ports.revisionCalls()).toBe(1);
    expect(calls).toEqual({
      [ASSASSINATION_ANALYZER_ID]: 0,
      [PROTECTION_PALADIN_ANALYZER_ID]: 0,
      [RETRIBUTION_PALADIN_ANALYZER_ID]: 1,
      "deathknight-blood-observed-decisions": 0,
      "monk-brewmaster-observed-decisions": 0,
      "evoker-augmentation-support-observations": 0,
      "shaman-restoration-healer-findings": 0,
      "paladin-holy-healer-findings": 0,
      "druid-restoration-healer-findings": 0,
      "monk-mistweaver-healer-findings": 0,
    });
    expectRetributionCell(cellOf(run.aggregate.cells, RETRIBUTION));
    expect(run.aggregate.coverage).toMatchObject({
      cellsTotal: 1,
      cellsAnalyzed: 1,
      cellsSpecNotSupported: 0,
      eligibleDecisionsTotal: 26,
      matchTotal: 0,
    });
    const projected = projectRaidNightResult(run.aggregate);
    expect(PublicRaidNightResultSchema.safeParse(projected).success).toBe(true);
    expect(JSON.stringify(projected)).toContain('"specId":"paladin/retribution"');
  });
});

describe("a mixed roster — Assassination, Protection, Retribution, Arms and an absent player — over the Retribution slice", () => {
  const ROSTER = [RETRIBUTION, PROTECTION, ROGUE, ARMS, BLOOD_DK] as const;

  it("discovers once, ingests once, confirms the revision once, and runs each supported analyzer exactly once", async () => {
    const { ports, calls } = portsFor(ROSTER, [BLOOD_DK]);
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    expect(run.ok).toBe(true);
    if (!run.ok) return;

    expect(ports.rosterCalls()).toBe(1);
    expect(ports.ingestedFightIds()).toEqual([FIGHT_ID]);
    expect(ports.revisionCalls()).toBe(1);
    expect(calls).toEqual({
      [ASSASSINATION_ANALYZER_ID]: 1,
      [PROTECTION_PALADIN_ANALYZER_ID]: 1,
      [RETRIBUTION_PALADIN_ANALYZER_ID]: 1,
      "deathknight-blood-observed-decisions": 0,
      "monk-brewmaster-observed-decisions": 0,
      "evoker-augmentation-support-observations": 0,
      "shaman-restoration-healer-findings": 0,
      "paladin-holy-healer-findings": 0,
      "druid-restoration-healer-findings": 0,
      "monk-mistweaver-healer-findings": 0,
    });
  });

  it("preserves each player's kind, status and specialization truthfully", async () => {
    const { ports } = portsFor(ROSTER, [BLOOD_DK]);
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    if (!run.ok) throw new Error(run.error.code);
    const { cells, coverage } = run.aggregate;

    expectRetributionCell(cellOf(cells, RETRIBUTION));

    // The two other supported analyzers ran over a slice holding none of
    // their players' evidence. The truthful answer is their own no-profile
    // outcome — never an ANALYZED cell built from nothing.
    for (const [sourceId, specName] of [
      [PROTECTION, "Protection"],
      [ROGUE, "Assassination"],
    ] as const) {
      const cell = cellOf(cells, sourceId);
      expect(cell.kind).toBe("NOT_ANALYZED");
      if (cell.kind !== "NOT_ANALYZED") continue;
      expect(cell.specName).toBe(specName);
      expect(cell.status).toBe("PROFILE_NOT_RESOLVED");
    }

    const arms = cellOf(cells, ARMS);
    expect(arms.kind).toBe("NOT_ANALYZED");
    if (arms.kind !== "NOT_ANALYZED") return;
    expect(arms.specName).toBe(CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName);
    expect(arms.status).toBe("SPEC_NOT_SUPPORTED");
    expect(arms.detail).toContain("no gameplay analysis was attempted");

    expect(cellOf(cells, BLOOD_DK).kind).toBe("ABSENT");

    expect(coverage).toMatchObject({
      cellsTotal: 5,
      cellsAnalyzed: 1,
      cellsAbsent: 1,
      cellsSpecNotSupported: 1,
      cellsProfileNotResolved: 2,
      eligibleDecisionsTotal: 26,
      matchTotal: 0,
    });
  });

  it("publishes a schema-valid raid-night document carrying the Retribution provenance and no internal field", async () => {
    const { ports } = portsFor(ROSTER, [BLOOD_DK]);
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    if (!run.ok) throw new Error(run.error.code);
    const projected = projectRaidNightResult(run.aggregate);
    expect(PublicRaidNightResultSchema.safeParse(projected).success).toBe(true);
    const json = JSON.stringify(projected);
    expect(json).toContain('"specId":"paladin/retribution"');
    expect(json).toContain("OUTSIDE_SUPPORTED_SLICE");
    for (const internal of [
      "OUTSIDE_FIRST_SLICE",
      "MELEE_SWING",
      "rawBlocker",
      "rootScanBlockedAt",
      "holyPower",
    ]) {
      expect(json, internal).not.toContain(internal);
    }
  });
});

describe("the Retribution cell is the single-fight analysis, unchanged by its neighbours", () => {
  it("carries identical counts alone and in the mixed roster", async () => {
    const alone = await runNight(
      { reportCode: REPORT_CODE, fightIds: [FIGHT_ID] },
      portsFor([RETRIBUTION]).ports,
    );
    const mixed = await runNight(
      { reportCode: REPORT_CODE, fightIds: [FIGHT_ID] },
      portsFor([RETRIBUTION, PROTECTION, ROGUE, ARMS, BLOOD_DK], [BLOOD_DK]).ports,
    );
    if (!alone.ok || !mixed.ok) throw new Error("run failed");
    const aloneCell = cellOf(alone.aggregate.cells, RETRIBUTION);
    const mixedCell = cellOf(mixed.aggregate.cells, RETRIBUTION);
    expect(mixedCell).toEqual(aloneCell);
  });
});
