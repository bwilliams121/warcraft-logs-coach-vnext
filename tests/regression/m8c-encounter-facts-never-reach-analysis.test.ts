/**
 * M8-C context is retrieved for free, and gameplay analysis cannot see it.
 *
 * TWO PROPERTIES, AND THEY FAIL IN DIFFERENT DIRECTIONS
 *
 * COST. The six outcome fields and the zone were added to a query that was
 * already being issued. M8-A measured the enlarged document at the same one API
 * point as the original, and the invariant that must hold in code is stricter
 * and cheaper to check: the number of `CoachFightContext` round trips per
 * ingestion is unchanged. A later edit that fetched the zone separately would
 * still pass every parsing test in the suite while doubling a metered call and
 * — worse — reading metadata from a report snapshot the revision gate never
 * vouched for.
 *
 * ISOLATION. `bossPercentage` is exactly the kind of number that ends up in a
 * gameplay verdict by accident. The guarantee here is structural rather than
 * conventional: `focusedFightFor` does not copy either field onto a
 * `CombatFight`, so an analyzer holds no reference to them at all. The test
 * proves it twice — once by checking the view has no such property, and once by
 * running the real M5-D2 corpus through the real analyzer under two wildly
 * different sets of encounter metadata and deep-comparing the authority output.
 *
 * EVIDENCE PREMISE. The corpus artifact is served by a FAKE Warcraft Logs
 * transport as one terminal page of a fabricated report; the completeness the
 * real ingestor derives from that is a property of the fake, shared by both
 * sides of the comparison, and is never a claim about what the artifact
 * retains (that lives in tests/corpus/manifest.json).
 */

import { describe, expect, it } from "vitest";
import { analyzedAssassinationOf } from "../support/assassination-analysis.js";

import {
  PUBLIC_ANALYSIS_SCHEMA_VERSION,
  PublicAnalysisResultSchema,
} from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import { analyzeFight } from "../../src/services/analysis-service.js";
import type { FightAnalysis } from "../../src/services/result.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import { ingestFight, ingestFightCore } from "../../src/wcl/ingest-fight.js";
import { focusedFightFor } from "../../src/engine/normalization/fight-core.js";
import type { Env } from "../../src/config/env.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import { createTestGraphqlClient, eventPageResponse, ingestionResponder } from "../support/wcl-harness.js";
import { M5D2_ACTOR, M5D2_RAW_EVENTS, M5D2_TARGET, m5d2Fight } from "../support/m5d2-fixture.js";

const REPORT_CODE = "A7R6kxPJ1hC8YQ4w";
const FIGHT_ID = 7;
const REVISION = 30;

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
  player: { sourceId: M5D2_ACTOR, name: "Fixtureplayer", className: "Rogue", specName: "Assassination" },
};

const PREFLIGHT: PreflightPort = async () => ({ ok: true, identity: IDENTITY, rateLimit: undefined });

/** A pull that was killed cleanly, in a frozen zone. */
const KILL_METADATA = {
  fight: {
    kill: true,
    lastPhase: 1,
    lastPhaseAsAbsoluteIndex: 4,
    lastPhaseIsIntermission: false,
    bossPercentage: 0.04,
    fightPercentage: 0.04,
    wipeCalledTime: null,
  },
  zone: { id: 53, name: "The Venomous Abyss", frozen: true, expansion: { id: 7, name: "Midnight" } },
};

/** The same combat evidence, described as an early wipe in an unknown zone. */
const WIPE_METADATA = {
  fight: {
    kill: true,
    lastPhase: 3,
    lastPhaseAsAbsoluteIndex: 0,
    lastPhaseIsIntermission: true,
    bossPercentage: 87.5,
    fightPercentage: 91.25,
    wipeCalledTime: 123_456,
  },
  zone: null,
};

function responder(metadata: { fight: Record<string, unknown>; zone: unknown }) {
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
                zone: metadata.zone,
                masterData: {
                  logVersion: 17,
                  gameVersion: 1,
                  actors: [
                    { id: M5D2_ACTOR, name: "Fixtureplayer", type: "Player", subType: "Rogue" },
                    { id: M5D2_TARGET, name: "Fixture Boss", type: "NPC", subType: "Boss" },
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
                    inProgress: false,
                    startTime: FIGHT_START,
                    endTime: FIGHT_END,
                    friendlyPlayers: [M5D2_ACTOR],
                    friendlySpecs: ["Assassination"],
                    talentImportCode: "FIXTURE-BUILD",
                    phaseTransitions: [],
                    ...metadata.fight,
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

async function coreWith(metadata: { fight: Record<string, unknown>; zone: unknown }) {
  const harness = createTestGraphqlClient(responder(metadata));
  const outcome = await ingestFightCore(
    {
      reportCode: REPORT_CODE,
      fightId: FIGHT_ID,
      talentImportActorId: M5D2_ACTOR,
      includeResources: true,
    },
    { client: harness.client, ...DEPS },
  );
  if (!outcome.ok) throw new Error(`ingestion failed: ${outcome.failure.reason}`);
  return { core: outcome.core, harness };
}

async function analysisWith(metadata: {
  fight: Record<string, unknown>;
  zone: unknown;
}): Promise<FightAnalysis> {
  const ingest: CombatIngestionPort = async (request) =>
    await ingestFight(request, { client: createTestGraphqlClient(responder(metadata)).client, ...DEPS });
  const result = await analyzeFight(REQUEST, { env: ENV, preflight: PREFLIGHT, ingest });
  if (!result.ok) throw new Error(`analyzeFight failed: ${result.error.code}`);
  return result.analysis;
}

function contextRequestCount(harness: ReturnType<typeof createTestGraphqlClient>): number {
  return harness.fetch.graphqlCalls().filter((call) => String(call.body).includes("CoachFightContext"))
    .length;
}

describe("the encounter facts arrive on the core", () => {
  it("carries the outcome facts and zone from the one context response", async () => {
    const { core } = await coreWith(KILL_METADATA);

    expect(core.encounterOutcome).toEqual({
      lastPhase: 1,
      lastPhaseAsAbsoluteIndex: 4,
      lastPhaseIsIntermission: false,
      bossPercentageRaw: 0.04,
      fightPercentageRaw: 0.04,
      wipeCalledReportTimeMs: null,
    });
    expect(core.zone).toEqual({
      id: 53,
      name: "The Venomous Abyss",
      frozen: true,
      expansion: { id: 7, name: "Midnight" },
    });
  });

  it("still reports no zone when the report has none", async () => {
    const { core } = await coreWith(WIPE_METADATA);
    expect(core.zone).toBeNull();
    expect(core.encounterOutcome.wipeCalledReportTimeMs).toBe(123_456);
  });
});

describe("no additional Warcraft Logs request was introduced", () => {
  it("issues exactly one fight-context request per ingestion", async () => {
    const { harness } = await coreWith(KILL_METADATA);
    // The whole point: the new fields ride the query that was already issued.
    expect(contextRequestCount(harness)).toBe(1);
  });

  it("issues exactly one fight-context request through the full analysis path", async () => {
    const harness = createTestGraphqlClient(responder(KILL_METADATA));
    const ingest: CombatIngestionPort = async (request) =>
      await ingestFight(request, { client: harness.client, ...DEPS });
    const result = await analyzeFight(REQUEST, { env: ENV, preflight: PREFLIGHT, ingest });

    expect(result.ok).toBe(true);
    expect(contextRequestCount(harness)).toBe(1);
  });

  it("still enforces the batch revision gate, which the metadata now shares", async () => {
    // The facts come from the SAME snapshot the gate vouches for. If a caller
    // states an expected revision and the report has moved, nothing is returned
    // — including the new metadata.
    const outcome = await ingestFightCore(
      {
        reportCode: REPORT_CODE,
        fightId: FIGHT_ID,
        talentImportActorId: M5D2_ACTOR,
        includeResources: true,
        expectedReportRevision: REVISION + 1,
      },
      { client: createTestGraphqlClient(responder(KILL_METADATA)).client, ...DEPS },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.reason).toBe("REPORT_REVISION_CHANGED");
  });

  it("carries the same report revision on the core as the gate checked", async () => {
    const { core } = await coreWith(KILL_METADATA);
    expect(core.report.revision).toBe(REVISION);
    expect(core.provenance.reportRevision).toBe(REVISION);
  });
});

describe("gameplay analysis cannot see the encounter facts", () => {
  it("does not put them on the focused CombatFight at all", async () => {
    const { core } = await coreWith(KILL_METADATA);
    const view = focusedFightFor(core, M5D2_ACTOR, "PLAYER_CONTEXT");

    // Not "is null" — ABSENT. The analyzer's type has no such property, so no
    // amount of optional chaining reaches a boss percentage.
    expect(Object.hasOwn(view, "encounterOutcome")).toBe(false);
    expect(Object.hasOwn(view, "zone")).toBe(false);
    expect(Object.hasOwn(view.fight, "bossPercentage")).toBe(false);
    expect(Object.hasOwn(view.fight, "lastPhase")).toBe(false);
    expect(JSON.stringify(view.fight)).not.toContain("Percentage");
  });

  it("leaves the pre-existing fight view otherwise identical", async () => {
    const { core } = await coreWith(KILL_METADATA);
    const view = focusedFightFor(core, M5D2_ACTOR, "PLAYER_CONTEXT");
    expect(view.fight).toEqual(core.fight);
    expect(view.fight.encounterId).toBe(2900);
  });

  it("produces byte-identical authority output under opposite encounter metadata", async () => {
    // Same combat evidence, described once as a clean kill and once as an early
    // wipe. Every M5 comparison, blocker, exclusion and count must be identical,
    // because none of that metadata is an input to any of them.
    const [fromKill, fromWipe] = await Promise.all([
      analysisWith(KILL_METADATA),
      analysisWith(WIPE_METADATA),
    ]);

    expect(fromKill.analysis.status).toBe("ANALYZED");
    const killPayload = analyzedAssassinationOf(fromKill);

    // Non-vacuous: the corpus really was analysed on both sides.
    expect(killPayload.coverage.eligibleDecisions).toBeGreaterThan(0);
    expect(killPayload.coverage.excludedCastCount).toBeGreaterThan(0);

    expect(fromWipe).toEqual(fromKill);
    expect(JSON.stringify(fromWipe)).toBe(JSON.stringify(fromKill));
  });

  it("publishes a byte-identical analysis/1 document under opposite metadata", async () => {
    // The frozen wire contract, projected from a real analysis. M8-G owns the
    // public surface for these facts; until then the document must not move,
    // and must not move BECAUSE of them either.
    const [fromKill, fromWipe] = await Promise.all([
      analysisWith(KILL_METADATA),
      analysisWith(WIPE_METADATA),
    ]);

    const killDocument = projectAnalysisResult(fromKill);
    const wipeDocument = projectAnalysisResult(fromWipe);

    expect(killDocument.schemaVersion).toBe(PUBLIC_ANALYSIS_SCHEMA_VERSION);
    expect(killDocument.schemaVersion).toBe("warcraft-logs-coach.analysis/1");
    // Still valid against the frozen schema, which is strict about its shape.
    expect(PublicAnalysisResultSchema.safeParse(killDocument).success).toBe(true);
    expect(JSON.stringify(wipeDocument)).toBe(JSON.stringify(killDocument));
  });

  it("carries no encounter metadata into the analysis result", async () => {
    const analysis = await analysisWith(KILL_METADATA);
    const serialized = JSON.stringify(analysis);
    for (const banned of [
      "bossPercentage",
      "fightPercentage",
      "lastPhase",
      "wipeCalled",
      "encounterOutcome",
      "Venomous",
      "frozen",
    ]) {
      expect(serialized, `analysis leaked ${banned}`).not.toContain(banned);
    }
  });
});
