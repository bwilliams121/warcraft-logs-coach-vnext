/**
 * M11-B12: public raid-night orchestration recognizes Blood Death Knight —
 * alone, in a roster mixing all four supported specializations, and beside
 * the canonical unsupported subject — over REAL evidence, with no fabrication
 * and NO BLOOD BRANCH anywhere in the orchestration.
 *
 * THE COMPOSITION, AND WHY IT IS HONEST
 *
 * The core is the committed Blood 45 s slice: every event actor 14 (the Blood
 * Death Knight) sources or is targeted by, and nothing else. The roster is
 * five real participants of A7R6 fight 7 per the committed fight-context
 * artifact:
 *
 *     14  Death Knight / Blood    ANALYZED — the real M11-B2 … M11-B10 evidence
 *     7   Paladin / Protection    the analyzer runs and must answer for the
 *                                 absence of its own evidence TRUTHFULLY
 *     6   Paladin / Retribution   likewise
 *     19  Rogue / Assassination   likewise
 *     17  Mage / Fire             SPEC_NOT_SUPPORTED — no analyzer exists
 *
 * Nothing is relabelled and no Paladin or Rogue event is manufactured: their
 * cells are their analyzers' own PROFILE_NOT_RESOLVED, never ANALYZED cells
 * built from nothing. Until M11-B12 actor 14's cell here was
 * SPEC_NOT_SUPPORTED, exactly like actor 4's; that is the one intended
 * raid-night delta of the promotion, and every other participant's cell is
 * unchanged.
 *
 * WHAT IS PROVEN
 *
 * Roster discovery once, ingestion once for the one fight, revision confirmed
 * once, each supported player's analyzer exactly once and the right one, no
 * analyzer for Fire, every cell's kind/status/spec preserved, the Blood cell
 * carrying the same totals the single-fight service publishes for the same
 * evidence with the exclusion tally already projected onto the public
 * vocabulary (OUTSIDE_SUPPORTED_SLICE, never the internal name), the public
 * raid-night document schema-valid with no internal field, and the Blood cell
 * identical alone and in company — the neighbours annotate nothing.
 */

import { describe, expect, it } from "vitest";

import { PublicRaidNightResultSchema } from "../../src/contracts/raid-night-contract.js";
import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import type { PlayerFightResult } from "../../src/aggregation/cell.js";
import { BLOOD_DEATH_KNIGHT_ANALYZER_ID } from "../../src/specs/deathknight/blood/spec.js";
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

const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
/** A7R6 fight 7 identities, per `wcl-fight-context-a7r6-fight-7.json`. */
const FIGHT_ID = 7;
const BLOOD_DK = 14;
const RETRIBUTION = 6;
const PROTECTION = 7;
const ROGUE = 19;
const FIRE_MAGE = CURRENT_UNSUPPORTED_SUBJECT.sourceId;

const CLASS_OF: Readonly<Record<number, string>> = {
  [BLOOD_DK]: "DeathKnight",
  [RETRIBUTION]: "Paladin",
  [PROTECTION]: "Paladin",
  [ROGUE]: "Rogue",
  [FIRE_MAGE]: CURRENT_UNSUPPORTED_SUBJECT.expectedClassName,
};
const SPEC_OF: Readonly<Record<number, string>> = {
  [BLOOD_DK]: "Blood",
  [RETRIBUTION]: "Retribution",
  [PROTECTION]: "Protection",
  [ROGUE]: "Assassination",
  [FIRE_MAGE]: CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName,
};

/** The Blood 45 s totals the single-fight service publishes for this evidence (M11-B10). */
const BLOOD45_COUNTS = {
  eligibleDecisions: 48,
  match: 17,
  rejected: 3,
  unknown: 28,
  resolvedComparisons: 20,
  excludedCastCount: 59,
  exclusions: [
    { key: "NON_GCD_ACTION", count: 53 },
    { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
    { key: "OUTSIDE_SUPPORTED_SLICE", count: 5 },
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
        BLOOD45,
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

function expectBloodCell(cell: PlayerFightResult): void {
  expect(cell.kind).toBe("ANALYZED");
  if (cell.kind !== "ANALYZED") return;
  expect(cell.specName).toBe("Blood");
  expect(cell.provenance).toMatchObject({
    analyzerId: BLOOD_DEATH_KNIGHT_ANALYZER_ID,
    specId: "deathknight/blood",
    authorityId: "SIMC_APL_DEATHKNIGHT_BLOOD",
    authorityArtifactRevision: "simc-33622e9d-1",
  });
  expect(cell.counts).toMatchObject(BLOOD45_COUNTS);
  // Three REJECTED patterns (the Heart Strikes the authority answers with
  // Marrowrend), no recommendation, the UNKNOWNs carried as evidence
  // limitations, the slice boundary as an exclusion pattern under its PUBLIC
  // name.
  expect(cell.recurrence.rejectedPatterns.reduce((sum, row) => sum + row.count, 0)).toBe(3);
  expect(cell.recurrence.evidenceLimitations.reduce((sum, row) => sum + row.count, 0)).toBe(28);
  expect(cell.recurrence.exclusionPatterns.some((row) => row.key.includes("OUTSIDE_SUPPORTED_SLICE"))).toBe(
    true,
  );
  const json = JSON.stringify(cell);
  for (const internal of [
    "OUTSIDE_FIRST_SLICE",
    "MELEE_SWING",
    "rawBlocker",
    "WINDOW_ORDER_INVARIANT_SET",
    "EXACT_STACK_OBSERVATION",
    "bone_shield",
    "essence_of_the_blood_queen",
  ]) {
    expect(json, internal).not.toContain(internal);
  }
}

describe("a Blood Death Knight alone", () => {
  it("is discovered once, ingested once, analyzed by its own analyzer exactly once, and published", async () => {
    const { ports, calls } = portsFor([BLOOD_DK]);
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    expect(run.ok).toBe(true);
    if (!run.ok) return;

    expect(ports.rosterCalls()).toBe(1);
    expect(ports.ingestedFightIds()).toEqual([FIGHT_ID]);
    expect(ports.revisionCalls()).toBe(1);
    expect(calls).toEqual({
      [ASSASSINATION_ANALYZER_ID]: 0,
      [PROTECTION_PALADIN_ANALYZER_ID]: 0,
      [RETRIBUTION_PALADIN_ANALYZER_ID]: 0,
      [BLOOD_DEATH_KNIGHT_ANALYZER_ID]: 1,
      "monk-brewmaster-observed-decisions": 0,
      "evoker-augmentation-support-observations": 0,
      "shaman-restoration-healer-findings": 0,
      "paladin-holy-healer-findings": 0,
      "druid-restoration-healer-findings": 0,
      "monk-mistweaver-healer-findings": 0,
      "priest-holy-healer-findings": 0,
      "priest-discipline-healer-findings": 0,
      "evoker-preservation-healer-findings": 0,
      "demonhunter-havoc-observed-decisions": 0,
      "rogue-subtlety-observed-decisions": 0,
      "warrior-fury-observed-decisions": 0,
      "warrior-protection-observed-decisions": 0,
      "warrior-arms-observed-decisions": 0,
      "deathknight-frost-observed-decisions": 0,
      "shaman-enhancement-observed-decisions": 0,
      "demonhunter-devourer-observed-decisions": 0,
      "druid-feral-observed-decisions": 0,
      "warlock-destruction-observed-decisions": 0,
      "shaman-elemental-observed-decisions": 0,
      "druid-balance-observed-decisions": 0,
      "priest-shadow-observed-decisions": 0,
      "mage-arcane-observed-decisions": 0,
      "mage-frost-observed-decisions": 0,
      "warlock-affliction-observed-decisions": 0,
      "hunter-marksmanship-observed-decisions": 0,
      "rogue-outlaw-observed-decisions": 0,
    });
    expectBloodCell(cellOf(run.aggregate.cells, BLOOD_DK));
    expect(run.aggregate.coverage).toMatchObject({
      cellsTotal: 1,
      cellsAnalyzed: 1,
      cellsSpecNotSupported: 0,
      eligibleDecisionsTotal: 48,
      matchTotal: 17,
    });
    const projected = projectRaidNightResult(run.aggregate);
    expect(PublicRaidNightResultSchema.safeParse(projected).success).toBe(true);
    expect(JSON.stringify(projected)).toContain('"specId":"deathknight/blood"');
  });
});

describe("a mixed roster — all four supported specializations plus Fire — over the Blood slice", () => {
  const ROSTER = [BLOOD_DK, PROTECTION, RETRIBUTION, ROGUE, FIRE_MAGE] as const;

  it("discovers once, ingests once, confirms the revision once, and runs each supported analyzer exactly once", async () => {
    const { ports, calls } = portsFor(ROSTER);
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
      [BLOOD_DEATH_KNIGHT_ANALYZER_ID]: 1,
      "monk-brewmaster-observed-decisions": 0,
      "evoker-augmentation-support-observations": 0,
      "shaman-restoration-healer-findings": 0,
      "paladin-holy-healer-findings": 0,
      "druid-restoration-healer-findings": 0,
      "monk-mistweaver-healer-findings": 0,
      "priest-holy-healer-findings": 0,
      "priest-discipline-healer-findings": 0,
      "evoker-preservation-healer-findings": 0,
      "demonhunter-havoc-observed-decisions": 0,
      "rogue-subtlety-observed-decisions": 0,
      "warrior-fury-observed-decisions": 0,
      "warrior-protection-observed-decisions": 0,
      "warrior-arms-observed-decisions": 0,
      "deathknight-frost-observed-decisions": 0,
      "shaman-enhancement-observed-decisions": 0,
      "demonhunter-devourer-observed-decisions": 0,
      "druid-feral-observed-decisions": 0,
      "warlock-destruction-observed-decisions": 0,
      "shaman-elemental-observed-decisions": 0,
      "druid-balance-observed-decisions": 0,
      "priest-shadow-observed-decisions": 0,
      "mage-arcane-observed-decisions": 0,
      "mage-frost-observed-decisions": 0,
      "warlock-affliction-observed-decisions": 0,
      "hunter-marksmanship-observed-decisions": 0,
      "rogue-outlaw-observed-decisions": 0,
    });
  });

  it("preserves each player's kind, status and specialization truthfully", async () => {
    const { ports } = portsFor(ROSTER);
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    if (!run.ok) throw new Error(run.error.code);
    const { cells, coverage } = run.aggregate;

    expectBloodCell(cellOf(cells, BLOOD_DK));

    // The three other supported analyzers ran over a slice holding none of
    // their players' evidence. The truthful answer is their own no-profile
    // outcome — never an ANALYZED cell built from nothing.
    for (const [sourceId, specName] of [
      [PROTECTION, "Protection"],
      [RETRIBUTION, "Retribution"],
      [ROGUE, "Assassination"],
    ] as const) {
      const cell = cellOf(cells, sourceId);
      expect(cell.kind).toBe("NOT_ANALYZED");
      if (cell.kind !== "NOT_ANALYZED") continue;
      expect(cell.specName).toBe(specName);
      expect(cell.status).toBe("PROFILE_NOT_RESOLVED");
    }

    const fire = cellOf(cells, FIRE_MAGE);
    expect(fire.kind).toBe("NOT_ANALYZED");
    if (fire.kind !== "NOT_ANALYZED") return;
    expect(fire.specName).toBe(CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName);
    expect(fire.status).toBe("SPEC_NOT_SUPPORTED");
    expect(fire.detail).toContain("no gameplay analysis was attempted");

    expect(coverage).toMatchObject({
      cellsTotal: 5,
      cellsAnalyzed: 1,
      cellsSpecNotSupported: 1,
      cellsProfileNotResolved: 3,
      eligibleDecisionsTotal: 48,
      matchTotal: 17,
    });
  });

  it("publishes a schema-valid raid-night document carrying the Blood provenance and no internal field", async () => {
    const { ports } = portsFor(ROSTER);
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    if (!run.ok) throw new Error(run.error.code);
    const projected = projectRaidNightResult(run.aggregate);
    expect(PublicRaidNightResultSchema.safeParse(projected).success).toBe(true);
    const json = JSON.stringify(projected);
    expect(json).toContain('"specId":"deathknight/blood"');
    expect(json).toContain("OUTSIDE_SUPPORTED_SLICE");
    for (const internal of [
      "OUTSIDE_FIRST_SLICE",
      "MELEE_SWING",
      "rawBlocker",
      "WINDOW_ORDER_INVARIANT_BOUNDED",
      "runeAffordability",
      "blood_debt",
    ]) {
      expect(json, internal).not.toContain(internal);
    }
  });
});

describe("the Blood cell is the single-fight analysis, unchanged by its neighbours", () => {
  it("carries identical counts alone and in the mixed roster", async () => {
    const alone = await runNight(
      { reportCode: REPORT_CODE, fightIds: [FIGHT_ID] },
      portsFor([BLOOD_DK]).ports,
    );
    const mixed = await runNight(
      { reportCode: REPORT_CODE, fightIds: [FIGHT_ID] },
      portsFor([BLOOD_DK, PROTECTION, RETRIBUTION, ROGUE, FIRE_MAGE]).ports,
    );
    if (!alone.ok || !mixed.ok) throw new Error("run failed");
    const aloneCell = cellOf(alone.aggregate.cells, BLOOD_DK);
    const mixedCell = cellOf(mixed.aggregate.cells, BLOOD_DK);
    expect(mixedCell).toEqual(aloneCell);
  });
});
