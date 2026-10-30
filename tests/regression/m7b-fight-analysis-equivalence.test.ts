/**
 * The reusable core yields the COMPLETE application-domain result, not just a
 * matching analysis.
 *
 * WHY THE ANALYZER-LEVEL COMPARISON WAS NOT ENOUGH
 *
 * `m7b-focused-view-preserves-single-player-analysis.test.ts` proves the
 * ANALYZER agrees: same comparisons, same blockers, same exclusions. That is the
 * gameplay half, and it is necessary. It is not sufficient.
 *
 * `FightAnalysis` is what the application layer actually hands onward, and it
 * carries four fields the analyzer never sees:
 *
 *     identity     who Warcraft Logs said this was
 *     specId       which specialization the engine RECOGNIZED
 *     analyzerId   which registration ran
 *     scope        the evidence breadth that was derived and retrieved
 *
 * M7-C and M7-D will aggregate across many of these objects. A reusable boundary
 * that reproduced `analysis` while dropping or altering `scope` would pass the
 * analyzer-level test and silently corrupt every raid-night summary built on it.
 * So this compares the whole object.
 *
 * WHAT THIS TEST CANNOT PROVE, STATED PLAINLY
 *
 * `ingestFight` is now IMPLEMENTED as `ingestFightCore` + `focusedFightFor`, so
 * both paths below run the same retrieval and projection code. This is a
 * CONSISTENCY test over the composition, not an independent historical oracle.
 *
 * The historical oracle is separate and remains: the entire pre-M7 suite passes
 * unchanged, with no expectation edited. That is what establishes the behaviour
 * did not move. This test establishes something different and still worth
 * pinning — that the raid-night-shaped composition, assembled from the pieces
 * M7-C will assemble them from, produces every field the single-fight service
 * produces.
 *
 * EVIDENCE PREMISE. Both paths ingest the D2 corpus artifact through a FAKE
 * Warcraft Logs transport that serves its 1,083 events as one terminal page of
 * a fabricated report context. The completeness the real ingestor derives from
 * that page is a property of the fake transport, not of the capture: it is a
 * test premise shared by both sides, never a claim about what the artifact
 * retains. The artifact's own coverage lives in tests/corpus/manifest.json and
 * is what `m5d2Fight()` applies.
 */

import { assessConsumableStatus } from "../../src/analysis/preparation/consumable-status.js";
import { PREPARATION_REQUIREMENT } from "../../src/analysis/preparation/requirement.js";
import { describe, expect, it } from "vitest";

import { analyzeFight } from "../../src/services/analysis-service.js";
import {
  analyzerForSpec,
  observedDecisionViewOf,
  PRODUCTION_CATALOG,
} from "../../src/services/analyzer-registry.js";
import { deriveIngestionScope } from "../../src/services/ingestion-scope.js";
import { analyzedAssassinationOf } from "../support/assassination-analysis.js";
import { resolveSpecIdentity } from "../../src/services/spec-identity.js";
import type { FightAnalysis } from "../../src/services/result.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import { ingestFight, ingestFightCore } from "../../src/wcl/ingest-fight.js";
import { focusedFightFor } from "../../src/engine/normalization/fight-core.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import type { Env } from "../../src/config/env.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import { createTestGraphqlClient, eventPageResponse, ingestionResponder } from "../support/wcl-harness.js";
import { M5D2_ACTOR, M5D2_RAW_EVENTS, M5D2_TARGET, m5d2Fight } from "../support/m5d2-fixture.js";

const REPORT_CODE = "A7R6kxPJ1hC8YQ4w";
const FIGHT_ID = 7;
const REVISION = 30;
const SECOND_ENEMY = 22;

/** The fight window the corpus fixture normalizes against. */
const FIXTURE = m5d2Fight();
const FIGHT_START = FIXTURE.fight.startTimeMs;
const FIGHT_END = FIXTURE.fight.endTimeMs;

const ENV: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: "fake-client-id-not-real",
  WCL_CLIENT_SECRET: "fake-client-secret-not-real",
};

const REQUEST = { reportCode: REPORT_CODE, fightId: FIGHT_ID, sourceId: M5D2_ACTOR };

const IDENTITY: FightIdentity = {
  report: { code: REPORT_CODE, revision: REVISION, startTime: 1_700_000_000_000, endTime: 1_700_000_900_000 },
  data: { logVersion: 17, gameVersion: 1 },
  fight: {
    id: FIGHT_ID,
    name: "Fixture Boss",
    encounterId: 2900,
    difficulty: 5,
    startTime: FIGHT_START,
    endTime: FIGHT_END,
  },
  player: {
    sourceId: M5D2_ACTOR,
    name: "Fixtureplayer",
    className: "Rogue",
    specName: "Assassination",
  },
};

const PREFLIGHT: PreflightPort = async () => ({ ok: true, identity: IDENTITY, rateLimit: undefined });

/**
 * The real 1083-event corpus, served offline through the real transport.
 *
 * One page, so retrieval order is the fixture's own order, unmodified.
 */
function responder() {
  return ingestionResponder({
    context: () =>
      new Response(
        JSON.stringify({
          data: {
            rateLimitData: { limitPerHour: 3600, pointsSpentThisHour: 10, pointsResetIn: 600 },
            reportData: {
              report: {
                code: REPORT_CODE,
                revision: REVISION,
                startTime: 1_700_000_000_000,
                endTime: 1_700_000_900_000,
                masterData: {
                  logVersion: 17,
                  gameVersion: 1,
                  actors: [
                    { id: M5D2_ACTOR, name: "Fixtureplayer", type: "Player", subType: "Rogue" },
                    { id: M5D2_TARGET, name: "Fixture Boss", type: "NPC", subType: "Boss" },
                    { id: SECOND_ENEMY, name: "Fixture Add", type: "NPC", subType: "Boss" },
                  ],
                  abilities: [],
                },
                phases: [],
                fights: [
                  {
                    id: FIGHT_ID,
                    name: "Fixture Boss",
                    encounterID: 2900,
                    difficulty: 5,
                    size: 20,
                    kill: true,
                    inProgress: false,
                    startTime: FIGHT_START,
                    endTime: FIGHT_END,
                    friendlyPlayers: [M5D2_ACTOR],
                    friendlySpecs: ["Assassination"],
                    talentImportCode: "FIXTURE-BUILD",
                    phaseTransitions: [],
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    pages: [() => eventPageResponse(M5D2_RAW_EVENTS, null)],
    revision: () =>
      new Response(JSON.stringify({ data: { reportData: { report: { revision: REVISION } } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
}

const DEPS = { now: () => 1_000_000 };

/** PATH A — the existing application service, unchanged, end to end. */
async function viaAnalysisService(): Promise<FightAnalysis> {
  const ingest: CombatIngestionPort = async (request) =>
    await ingestFight(request, { client: createTestGraphqlClient(responder()).client, ...DEPS });

  const result = await analyzeFight(REQUEST, { env: ENV, preflight: PREFLIGHT, ingest });
  if (!result.ok) throw new Error(`analyzeFight failed: ${result.error.code}`);
  return result.analysis;
}

/**
 * PATH B — the raid-night-shaped composition.
 *
 * Ingest a fight ONCE with no analysed player, then focus it on one. Everything
 * gameplay-related still comes from the existing registry and the existing
 * analyzer; nothing here reimplements a rule, a scope or a spec mapping.
 */
async function viaReusableCore(): Promise<FightAnalysis> {
  const identity = IDENTITY;

  const resolved = resolveSpecIdentity(identity.player);
  if (!resolved.ok) throw new Error(`spec not resolved: ${resolved.reason}`);

  const analyzer = analyzerForSpec(resolved.specId);
  if (analyzer === null) throw new Error("no analyzer registered");

  // As the service derives it: the analyzer's requirement and the shared
  // PREPARATION producer's.
  const scope = deriveIngestionScope([analyzer.requirement, PREPARATION_REQUIREMENT]);
  if (!scope.ok) throw new Error(`no scope: ${scope.reason}`);

  const outcome = await ingestFightCore(
    {
      reportCode: REQUEST.reportCode,
      fightId: REQUEST.fightId,
      talentImportActorId: identity.player.sourceId,
      includeResources: analyzer.requirement.includeResources,
    },
    { client: createTestGraphqlClient(responder()).client, ...DEPS },
  );
  if (!outcome.ok) throw new Error(`ingestion failed: ${outcome.failure.reason}`);

  // The same revision reconciliation the service performs between M2 and M3.
  expect(outcome.core.report.revision).toBe(identity.report.revision);

  const fight = focusedFightFor(outcome.core, identity.player.sourceId, scope.scope);
  const state = createCombatState(fight);

  const analysis = analyzer.analyze({
    state,
    actorId: identity.player.sourceId,
    specId: analyzer.specId,
    targetActorId: null,
  });

  return {
    identity,
    specId: analyzer.specId,
    analyzerId: analyzer.analyzerId,
    scope: scope.scope,
    analysis,
    // The shared producer over the same fight, exactly as the service runs it.
    preparation: { state: "ASSESSED", report: assessConsumableStatus(fight, identity.player.sourceId) },
    // The registration's view, attached exactly as the service attaches it.
    observedDecisions:
      analysis.status === "ANALYZED" ? observedDecisionViewOf(PRODUCTION_CATALOG, analysis) : null,
  };
}

describe("the reusable core reproduces the complete FightAnalysis", () => {
  it("did real work on both sides, so the comparison is not vacuous", async () => {
    const viaService = await viaAnalysisService();

    expect(viaService.analysis.status).toBe("ANALYZED");
    const payload = analyzedAssassinationOf(viaService);

    // The real corpus census, through real retrieval and real normalization.
    expect(payload.coverage.eligibleDecisions).toBe(11);
    expect(payload.coverage.match).toBe(1);
    expect(payload.coverage.unknown).toBe(10);
    expect(payload.coverage.excludedCastCount).toBe(120);
    expect(viaService.specId).toBe("rogue/assassination");
    expect(viaService.analyzerId).toBe("rogue-assassination-observed-decisions");
    expect(viaService.scope).toBe("PLAYER_CONTEXT");
  });

  it("produces a deep-equal FightAnalysis — identity, specId, analyzerId, scope and analysis", async () => {
    // THE M7-B GATE. The whole application-domain object, not just `analysis`,
    // and not a projected public payload.
    const [viaService, viaCore] = await Promise.all([viaAnalysisService(), viaReusableCore()]);
    expect(viaCore).toEqual(viaService);
  });

  it("agrees field by field, so a failure names which field moved", async () => {
    const [viaService, viaCore] = await Promise.all([viaAnalysisService(), viaReusableCore()]);

    // Enumerated deliberately. A single `toEqual` on the parent tells you the
    // objects differ; these tell you where, which is what a future regression
    // will actually need.
    expect(viaCore.identity).toEqual(viaService.identity);
    expect(viaCore.specId).toEqual(viaService.specId);
    expect(viaCore.analyzerId).toEqual(viaService.analyzerId);
    expect(viaCore.scope).toEqual(viaService.scope);
    expect(viaCore.analysis).toEqual(viaService.analysis);
    // M10-A: the registration's view of the analysis travels with it.
    expect(viaCore.observedDecisions).toEqual(viaService.observedDecisions);
    // The shared PREPARATION producer, assessed over the same retrieved fight.
    expect(viaCore.preparation).toEqual(viaService.preparation);
    expect(viaService.preparation.state).toBe("ASSESSED");

    // And no field exists on one side that the other does not supply.
    expect(Object.keys(viaCore).sort()).toEqual(Object.keys(viaService).sort());
    expect(Object.keys(viaCore).sort()).toEqual([
      "analysis",
      "analyzerId",
      "identity",
      "observedDecisions",
      "preparation",
      "scope",
      "specId",
    ]);
  });
});
