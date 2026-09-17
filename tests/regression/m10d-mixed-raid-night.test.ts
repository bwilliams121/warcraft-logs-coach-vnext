/**
 * M10-D: a raid night whose roster mixes both supported specializations, the
 * canonical unsupported one, and an absent player — over REAL evidence, with
 * no fabrication.
 *
 * THE COMPOSITION, AND WHY IT IS HONEST
 *
 * The core is the committed A7R6 opener slice: every event actor 7 (the
 * Protection Paladin) sources or is targeted by, and nothing else. The roster
 * is four real participants of that same fight per the committed fight-context
 * artifact:
 *
 *     7   Paladin / Protection    ANALYZED — the real M10-C evidence
 *     19  Rogue / Assassination   the analyzer runs and must answer for the
 *                                 absence of its own evidence TRUTHFULLY
 *     4   Warrior / Arms          SPEC_NOT_SUPPORTED — no analyzer exists
 *     14  Death Knight / Blood    absent from the pull
 *
 * Nothing is relabelled and no Rogue event is manufactured. Actor 19's cell is
 * therefore NOT an analyzed cell: the slice carries no combatant profile and no
 * cast of theirs, and the honest outcome is the analyzer's own
 * PROFILE_NOT_RESOLVED. If that ever became ANALYZED the test must fail —
 * that would mean an analysis was produced from no evidence.
 *
 * WHAT IS PROVEN
 *
 * Roster discovery once, ingestion once for the one fight, revision confirmed
 * once, each supported player's analyzer exactly once and the right one, no
 * analyzer for Arms, every cell's kind/status/spec preserved, the Protection
 * cell carrying the same totals the single-fight service publishes for the
 * same evidence, and encounter/comparison context changing none of it.
 */

import { describe, expect, it } from "vitest";

import { PublicEncounterContextResultSchema } from "../../src/contracts/encounter-context-contract.js";
import { projectEncounterContextResult } from "../../src/contracts/encounter-context-projection.js";
import { PublicRaidNightResultSchema } from "../../src/contracts/raid-night-contract.js";
import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import type { PlayerFightResult } from "../../src/aggregation/cell.js";
import type { ExternalDiscoveryPorts } from "../../src/external-context/external-discovery.js";
import { parseEncounterContextRequest } from "../../src/services/encounter-context-request.js";
import { analyzeEncounterContext } from "../../src/services/encounter-context-service.js";
import { PROTECTION_PALADIN_ANALYZER_ID } from "../../src/specs/paladin/protection/spec.js";
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

const PROT_OPENER = "wcl-protection-paladin-a7r6-opener";
/** A7R6 fight 7 identities, per `wcl-fight-context-a7r6-fight-7.json`. */
const FIGHT_ID = 7;
const PALADIN = 7;
const ROGUE = 19;
const ARMS = 4;
const BLOOD_DK = 14;
const ROSTER = [PALADIN, ROGUE, ARMS, BLOOD_DK] as const;

const CLASS_OF: Readonly<Record<number, string>> = {
  [PALADIN]: "Paladin",
  [ROGUE]: "Rogue",
  [ARMS]: "Warrior",
  [BLOOD_DK]: "DeathKnight",
};
const SPEC_OF: Readonly<Record<number, string>> = {
  [PALADIN]: "Protection",
  [ROGUE]: "Assassination",
  [ARMS]: "Arms",
  [BLOOD_DK]: "Blood",
};

function classNameFor(sourceId: number): string {
  return CLASS_OF[sourceId] ?? "Rogue";
}

function mixedPorts(): { readonly ports: FakePorts; readonly calls: Readonly<Record<string, number>> } {
  const snapshot = assassinationSnapshot({
    fightIds: [FIGHT_ID],
    sourceIds: [...ROSTER],
    classNameFor,
    specNameFor: (_fightId, sourceId) => SPEC_OF[sourceId] ?? null,
    absentOn: new Map([[FIGHT_ID, [BLOOD_DK]]]),
    // Entombed Sentinels, Mythic, a kill — the A7R6 fight 7 facts.
    fightFacts: { encounterId: 3445, difficulty: 5, kill: true, startTimeMs: 1_000, endTimeMs: 400_000 },
  });
  const counted = countedProductionCatalog();
  const ports = fakePorts({
    snapshot,
    coreFor: (fightId, participants) =>
      corpusArtifactCore(
        PROT_OPENER,
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

describe("a mixed roster over the real A7R6 opener", () => {
  it("discovers once, ingests once, confirms the revision once, and runs each analyzer exactly once", async () => {
    const { ports, calls } = mixedPorts();
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    expect(run.ok).toBe(true);
    if (!run.ok) return;

    expect(ports.rosterCalls()).toBe(1);
    expect(ports.ingestedFightIds()).toEqual([FIGHT_ID]);
    expect(ports.revisionCalls()).toBe(1);
    expect(calls[PROTECTION_PALADIN_ANALYZER_ID]).toBe(1);
    expect(calls[ASSASSINATION_ANALYZER_ID]).toBe(1);
  });

  it("preserves each player's kind, status and specialization truthfully", async () => {
    const { ports } = mixedPorts();
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    if (!run.ok) throw new Error(run.error.code);
    const { cells, coverage } = run.aggregate;

    const paladin = cellOf(cells, PALADIN);
    expect(paladin.kind).toBe("ANALYZED");
    if (paladin.kind !== "ANALYZED") return;
    expect(paladin.specName).toBe("Protection");
    expect(paladin.provenance).toMatchObject({
      analyzerId: PROTECTION_PALADIN_ANALYZER_ID,
      specId: "paladin/protection",
      authorityId: "SIMC_APL_PALADIN_PROTECTION",
      authorityArtifactRevision: "simc-33622e9d-1",
    });
    // The same totals the single-fight service publishes for this evidence,
    // with the exclusion tally already projected by the registration's view.
    expect(paladin.counts).toMatchObject({
      eligibleDecisions: 21,
      match: 0,
      rejected: 0,
      unknown: 21,
      resolvedComparisons: 0,
      excludedCastCount: 24,
      exclusions: [
        { key: "NON_GCD_ACTION", count: 22 },
        { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 1 },
        { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
      ],
    });
    // UNKNOWN-heavy is UNKNOWN-heavy: no rejected pattern, no recommendation.
    expect(paladin.recurrence.rejectedPatterns).toEqual([]);
    expect(paladin.recurrence.evidenceLimitations.reduce((sum, row) => sum + row.count, 0)).toBe(21);
    expect(JSON.stringify(paladin)).not.toContain("MELEE_SWING");

    // The Rogue's analyzer ran over a slice holding none of the Rogue's
    // evidence. The truthful answer is its own no-profile outcome — never an
    // ANALYZED cell built from nothing.
    const rogue = cellOf(cells, ROGUE);
    expect(rogue.kind).toBe("NOT_ANALYZED");
    if (rogue.kind !== "NOT_ANALYZED") return;
    expect(rogue.specName).toBe("Assassination");
    expect(rogue.status).toBe("PROFILE_NOT_RESOLVED");

    const arms = cellOf(cells, ARMS);
    expect(arms.kind).toBe("NOT_ANALYZED");
    if (arms.kind !== "NOT_ANALYZED") return;
    expect(arms.specName).toBe("Arms");
    expect(arms.status).toBe("SPEC_NOT_SUPPORTED");
    expect(arms.detail).toContain("no gameplay analysis was attempted");

    expect(cellOf(cells, BLOOD_DK).kind).toBe("ABSENT");

    expect(coverage).toMatchObject({
      cellsTotal: 4,
      cellsAnalyzed: 1,
      cellsAbsent: 1,
      cellsSpecNotSupported: 1,
      cellsProfileNotResolved: 1,
      eligibleDecisionsTotal: 21,
      matchTotal: 0,
    });
  });

  it("publishes a schema-valid raid-night document carrying the Protection provenance", async () => {
    const { ports } = mixedPorts();
    const run = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, ports);
    if (!run.ok) throw new Error(run.error.code);
    const projected = projectRaidNightResult(run.aggregate);
    expect(PublicRaidNightResultSchema.safeParse(projected).success).toBe(true);
    const json = JSON.stringify(projected);
    expect(json).toContain('"specId":"paladin/protection"');
    expect(json).not.toContain("MELEE_SWING");
    expect(json).not.toContain("rawBlocker");
  });
});

describe("encounter and comparison context cannot move a Protection authority result", () => {
  /** M8-F ports that fail at the ranking board, so the external half runs and yields nothing. */
  const FAILING_EXTERNAL: ExternalDiscoveryPorts = {
    rankingPage: async () => ({ outcome: "PAYLOAD_UNRECOGNISED", defect: "RANKINGS_NOT_A_RECORD" }),
    candidateMetadata: async () => null,
  };

  function requestOf(external: boolean) {
    const parsed = parseEncounterContextRequest({
      reportCode: REPORT_CODE,
      fightIds: [FIGHT_ID],
      ...(external
        ? {
            externalReferences: {
              mode: "ENABLED",
              subjectFightId: FIGHT_ID,
              className: "Paladin",
              specName: "Protection",
              metric: "dps",
              partition: { mode: "PINNED", partition: 1 },
            },
          }
        : {}),
    });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    return parsed.request;
  }

  for (const external of [false, true]) {
    it(`external references ${external ? "enabled" : "not requested"}: the Protection cell is the raid night's, unchanged`, async () => {
      const night = mixedPorts();
      const reference = await runNight({ reportCode: REPORT_CODE, fightIds: [FIGHT_ID] }, night.ports);
      if (!reference.ok) throw new Error(reference.error.code);
      const referenceCell = cellOf(reference.aggregate.cells, PALADIN);

      const context = mixedPorts();
      const { env, ...raidNightDeps } = context.ports.deps;
      const result = await analyzeEncounterContext(requestOf(external), {
        env,
        raidNight: raidNightDeps,
        ...(external ? { external: FAILING_EXTERNAL } : {}),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Same work, once: the context service composes the raid night rather
      // than re-running anything.
      expect(context.ports.rosterCalls()).toBe(1);
      expect(context.ports.ingestedFightIds()).toEqual([FIGHT_ID]);
      expect(context.calls[PROTECTION_PALADIN_ANALYZER_ID]).toBe(1);
      expect(context.calls[ASSASSINATION_ANALYZER_ID]).toBe(1);

      const points = result.analysis.progression.encounters
        .flatMap((encounter) => encounter.players)
        .filter((player) => player.sourceId === PALADIN)
        .flatMap((player) => player.points);
      expect(points).toHaveLength(1);
      expect(points[0]?.cell).toEqual(referenceCell);

      const projected = projectEncounterContextResult(result.analysis);
      expect(PublicEncounterContextResultSchema.safeParse(projected).success).toBe(true);
      expect(projected.externalReferences.status).toBe(external ? "PAYLOAD_UNRECOGNISED" : "NOT_REQUESTED");
    });
  }
});
