/**
 * M11-C4j: public raid-night orchestration recognizes Brewmaster Monk —
 * alone, and in a roster of REAL gtKb fight-22 participants mixing every
 * supported specialization present in that pull with an unsupported Warrior
 * and a second Monk specialization — over REAL evidence, with no fabrication
 * and NO BREWMASTER BRANCH anywhere in the orchestration.
 *
 * THE COMPOSITION, AND WHY IT IS HONEST
 *
 * The core is the committed Brewmaster opener (gtKb fight 22, pull .. +20 s):
 * every event actor 4 sources or is targeted by, and nothing else. The roster
 * is six real participants of gtKb fight 22 per the committed fight-context
 * artifact:
 *
 *     4   Monk / Brewmaster       ANALYZED — the real M11-C2 … M11-C4i evidence
 *     14  Death Knight / Blood    its analyzer runs and must answer for the
 *                                 absence of its own evidence TRUTHFULLY
 *     23  Paladin / Retribution   likewise
 *     25  Rogue / Assassination   likewise
 *     12  Warrior / Arms          SPEC_NOT_SUPPORTED — internal only since ONB-B1, so no public analyzer
 *     17  Monk / Mistweaver       the same class as the promoted
 *                                 specialization, never routed to it; since
 *                                 HEAL-B1P routed to its OWN healer analyzer,
 *                                 which states nothing for a subject this
 *                                 evidence states no specialization for
 *
 * Nothing is relabelled and no event is manufactured. Until M11-C4j actor 4's
 * cell here was SPEC_NOT_SUPPORTED; that is the one intended raid-night delta
 * of the promotion. Until HEAL-B1P actor 17's cell was SPEC_NOT_SUPPORTED;
 * that is the one intended delta of that promotion.
 */

import { describe, expect, it } from "vitest";

import type { PlayerFightResult } from "../../src/aggregation/cell.js";
import { PublicRaidNightResultSchema } from "../../src/contracts/raid-night-contract.js";
import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import { BLOOD_DEATH_KNIGHT_ANALYZER_ID } from "../../src/specs/deathknight/blood/spec.js";
import { BREWMASTER_MONK_ANALYZER_ID } from "../../src/specs/monk/brewmaster/spec.js";
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

const OPENER = "wcl-brewmaster-monk-gtkb-opener";
/** gtKb fight 22 identities, per `wcl-fight-context-gtkb-fight-22.json`. */
const FIGHT_ID = 22;
const BREWMASTER = 4;
const BLOOD_DK = 14;
const RETRIBUTION = 23;
const ROGUE = 25;
const ARMS = 12;
const MISTWEAVER = 17;

const CLASS_OF: Readonly<Record<number, string>> = {
  [BREWMASTER]: "Monk",
  [BLOOD_DK]: "DeathKnight",
  [RETRIBUTION]: "Paladin",
  [ROGUE]: "Rogue",
  [ARMS]: "Warrior",
  [MISTWEAVER]: "Monk",
};
const SPEC_OF: Readonly<Record<number, string>> = {
  [BREWMASTER]: "Brewmaster",
  [BLOOD_DK]: "Blood",
  [RETRIBUTION]: "Retribution",
  [ROGUE]: "Assassination",
  [ARMS]: "Arms",
  [MISTWEAVER]: "Mistweaver",
};

/** The opener totals the single-fight service publishes for this evidence (M11-C4i). */
const OPENER_COUNTS = {
  eligibleDecisions: 15,
  match: 5,
  rejected: 1,
  unknown: 9,
  resolvedComparisons: 6,
  excludedCastCount: 18,
  exclusions: [
    { key: "NON_GCD_ACTION", count: 10 },
    { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 8 },
  ],
};

function classNameFor(sourceId: number): string {
  const className = CLASS_OF[sourceId];
  if (className === undefined) throw new Error(`no class for ${String(sourceId)}`);
  return className;
}

function portsFor(roster: readonly number[]): {
  readonly ports: FakePorts;
  readonly calls: Readonly<Record<string, number>>;
} {
  const snapshot = assassinationSnapshot({
    fightIds: [FIGHT_ID],
    sourceIds: [...roster],
    classNameFor,
    specNameFor: (_fightId, sourceId) => SPEC_OF[sourceId] ?? null,
    // Sszorak, Heroic, a kill — the gtKb fight 22 facts.
    fightFacts: {
      encounterId: 3420,
      difficulty: 4,
      kill: true,
      startTimeMs: 2_415_041,
      endTimeMs: 2_699_832,
    },
  });
  const counted = countedProductionCatalog();
  const ports = fakePorts({
    snapshot,
    coreFor: (fightId, participants) =>
      corpusArtifactCore(
        OPENER,
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

function expectBrewmasterCell(cell: PlayerFightResult): void {
  expect(cell.kind).toBe("ANALYZED");
  if (cell.kind !== "ANALYZED") return;
  expect(cell.specName).toBe("Brewmaster");
  expect(cell.provenance).toMatchObject({
    analyzerId: BREWMASTER_MONK_ANALYZER_ID,
    specId: "monk/brewmaster",
    authorityId: "SIMC_APL_MONK_BREWMASTER",
    authorityArtifactRevision: "simc-33622e9d-1",
  });
  expect(cell.counts).toMatchObject(OPENER_COUNTS);
  // One REJECTED pattern (the Tiger Palm the authority answers with Keg
  // Smash), the UNKNOWNs carried as evidence limitations.
  expect(cell.recurrence.rejectedPatterns.reduce((sum, row) => sum + row.count, 0)).toBe(1);
  expect(cell.recurrence.evidenceLimitations.reduce((sum, row) => sum + row.count, 0)).toBe(9);
  const json = JSON.stringify(cell);
  for (const internal of [
    "OUTSIDE_FIRST_SLICE",
    "MELEE_SWING",
    "rawBlocker",
    "positiveUsability",
    "PROVEN_USABLE",
    "shado_pan[",
    "empty_barrel",
  ]) {
    expect(json, internal).not.toContain(internal);
  }
}

const NO_CALLS = {
  [ASSASSINATION_ANALYZER_ID]: 0,
  [PROTECTION_PALADIN_ANALYZER_ID]: 0,
  [RETRIBUTION_PALADIN_ANALYZER_ID]: 0,
  [BLOOD_DEATH_KNIGHT_ANALYZER_ID]: 0,
  [BREWMASTER_MONK_ANALYZER_ID]: 0,
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
  "mage-fire-observed-decisions": 0,
  "evoker-devastation-observed-decisions": 0,
  "demonhunter-vengeance-observed-decisions": 0,
  "warlock-demonology-observed-decisions": 0,
  "deathknight-unholy-observed-decisions": 0,
  "monk-windwalker-observed-decisions": 0,
  "druid-guardian-observed-decisions": 0,
  "hunter-beast_mastery-observed-decisions": 0,
  "hunter-survival-observed-decisions": 0,
  "rogue-outlaw-observed-decisions": 0,
};

describe("a Brewmaster Monk alone", () => {
  it("is discovered once, ingested once, analyzed by its own analyzer exactly once, and published", async () => {
    const { ports, calls } = portsFor([BREWMASTER]);
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    expect(run.ok).toBe(true);
    if (!run.ok) return;

    expect(ports.rosterCalls()).toBe(1);
    expect(ports.ingestedFightIds()).toEqual([FIGHT_ID]);
    expect(ports.revisionCalls()).toBe(1);
    expect(calls).toEqual({ ...NO_CALLS, [BREWMASTER_MONK_ANALYZER_ID]: 1 });
    expectBrewmasterCell(cellOf(run.aggregate.cells, BREWMASTER));
    expect(run.aggregate.coverage).toMatchObject({
      cellsTotal: 1,
      cellsAnalyzed: 1,
      cellsSpecNotSupported: 0,
      eligibleDecisionsTotal: 15,
      matchTotal: 5,
    });
    const projected = projectRaidNightResult(run.aggregate);
    expect(PublicRaidNightResultSchema.safeParse(projected).success).toBe(true);
    expect(JSON.stringify(projected)).toContain('"specId":"monk/brewmaster"');
  });
});

describe("a mixed roster of real gtKb fight-22 participants over the Brewmaster opener", () => {
  const ROSTER = [BREWMASTER, BLOOD_DK, RETRIBUTION, ROGUE, ARMS, MISTWEAVER] as const;

  it("discovers once, ingests once, confirms the revision once, and runs each supported analyzer exactly once", async () => {
    const { ports, calls } = portsFor(ROSTER);
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    expect(run.ok).toBe(true);
    if (!run.ok) return;

    expect(ports.rosterCalls()).toBe(1);
    expect(ports.ingestedFightIds()).toEqual([FIGHT_ID]);
    expect(ports.revisionCalls()).toBe(1);
    expect(calls).toEqual({
      ...NO_CALLS,
      [ASSASSINATION_ANALYZER_ID]: 1,
      [RETRIBUTION_PALADIN_ANALYZER_ID]: 1,
      [BLOOD_DEATH_KNIGHT_ANALYZER_ID]: 1,
      [BREWMASTER_MONK_ANALYZER_ID]: 1,
      // HEAL-B1P: the Mistweaver reaches its own healer analyzer, never Brewmaster's.
      "monk-mistweaver-healer-findings": 1,
    });
  });

  it("preserves each player's kind, status and specialization truthfully; the Warrior routes nowhere and the Mistweaver only to its own analyzer", async () => {
    const { ports } = portsFor(ROSTER);
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    if (!run.ok) throw new Error(run.error.code);
    const { cells, coverage } = run.aggregate;

    expectBrewmasterCell(cellOf(cells, BREWMASTER));

    for (const [sourceId, specName] of [
      [BLOOD_DK, "Blood"],
      [RETRIBUTION, "Retribution"],
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
    if (arms.kind === "NOT_ANALYZED") {
      expect(arms.specName).toBe("Arms");
      expect(arms.status).toBe("SPEC_NOT_SUPPORTED");
      expect(arms.detail).toContain("no gameplay analysis was attempted");
    }
    // The opener core states no friendly specialization, so the Mistweaver's
    // own registration refuses to assume one: never SPEC_NOT_SUPPORTED, never
    // ANALYZED, never a healer finding.
    const mistweaver = cellOf(cells, MISTWEAVER);
    expect(mistweaver.kind).toBe("NOT_ANALYZED");
    if (mistweaver.kind === "NOT_ANALYZED") {
      expect(mistweaver.specName).toBe("Mistweaver");
      expect(mistweaver.status).toBe("INSUFFICIENT_EVIDENCE");
    }

    expect(coverage).toMatchObject({
      cellsTotal: 6,
      cellsAnalyzed: 1,
      cellsSpecNotSupported: 1,
      cellsInsufficientEvidence: 1,
      cellsProfileNotResolved: 3,
      eligibleDecisionsTotal: 15,
      matchTotal: 5,
    });
  });

  it("publishes a schema-valid raid-night document carrying the Brewmaster provenance and no internal field", async () => {
    const { ports } = portsFor(ROSTER);
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    if (!run.ok) throw new Error(run.error.code);
    const projected = projectRaidNightResult(run.aggregate);
    expect(PublicRaidNightResultSchema.safeParse(projected).success).toBe(true);
    const json = JSON.stringify(projected);
    expect(json).toContain('"specId":"monk/brewmaster"');
    for (const internal of [
      "OUTSIDE_FIRST_SLICE",
      "MELEE_SWING",
      "rawBlocker",
      "positiveUsability",
      "1262768",
    ]) {
      expect(json, internal).not.toContain(internal);
    }
  });
});

describe("the Brewmaster cell is the single-fight analysis, unchanged by its neighbours and by repetition", () => {
  it("carries identical counts alone, in the mixed roster, and on a second run", async () => {
    const alone = await runNight(
      { reportCode: REPORT_CODE, fightIds: [FIGHT_ID] },
      portsFor([BREWMASTER]).ports,
    );
    const again = await runNight(
      { reportCode: REPORT_CODE, fightIds: [FIGHT_ID] },
      portsFor([BREWMASTER]).ports,
    );
    const mixed = await runNight(
      { reportCode: REPORT_CODE, fightIds: [FIGHT_ID] },
      portsFor([BREWMASTER, BLOOD_DK, RETRIBUTION, ROGUE, ARMS, MISTWEAVER]).ports,
    );
    if (!alone.ok || !again.ok || !mixed.ok) throw new Error("run failed");
    const aloneCell = cellOf(alone.aggregate.cells, BREWMASTER);
    expect(cellOf(mixed.aggregate.cells, BREWMASTER)).toEqual(aloneCell);
    expect(cellOf(again.aggregate.cells, BREWMASTER)).toEqual(aloneCell);
  });
});
