/**
 * One retrieval serves every analysed player in the fight.
 *
 * THE DEFECT THIS PINS
 *
 * Analysing a raid by calling the single-player path once per raider re-fetches
 * the same fight once per raider. The measurement recorded in
 * `retrieval-plan.ts` makes the scale concrete: one full heroic pull was 40
 * pages, 196,366 events and ~54.8 MB. Twenty raiders is that twenty times, for
 * bytes already in hand — and the Warcraft Logs quota it spends is finite, paid
 * and account-wide.
 *
 * `retrieval-plan.ts` has always said the stream is reusable: no `sourceID`, no
 * `targetID`, one chronological `dataType: All` stream per fight. This test is
 * what makes that claim load-bearing rather than aspirational, by counting the
 * requests that actually leave.
 *
 * WHY IT COUNTS AT THE FETCH BOUNDARY
 *
 * The fake sits under the REAL token provider, transport, decoder and paginator,
 * as every other ingestion test does. Stubbing the client instead would count
 * calls to a method nobody is obliged to keep using; counting HTTP requests
 * counts the thing that costs money.
 */

import { describe, expect, it } from "vitest";

import { ingestFight, ingestFightCore } from "../../src/wcl/ingest-fight.js";
import { focusedFightFor } from "../../src/engine/normalization/fight-core.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import {
  createTestGraphqlClient,
  eventPageResponse,
  ingestionResponder,
  queryOf,
  rawEvent,
  variablesOf,
} from "../support/wcl-harness.js";

/** Twenty raiders, the size of a mythic roster. */
const RAIDERS = [0, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73];

const ACTORS = RAIDERS.map((id) => ({ id, name: `Raider${String(id)}`, type: "Player", subType: "Rogue" }));
const BOSS = { id: 900, name: "Test Boss", type: "NPC", subType: "Boss" };

/** Two pages, so the count proves pagination is not being repeated either. */
function responder() {
  return ingestionResponder({
    context: () =>
      // `contextResponse` is not used here: this fight needs its own roster.
      new Response(
        JSON.stringify({
          data: {
            rateLimitData: { limitPerHour: 3600, pointsSpentThisHour: 10, pointsResetIn: 600 },
            reportData: {
              report: {
                code: "aBcDeFgH12345678",
                revision: 3,
                startTime: 1_700_000_000_000,
                endTime: 1_700_000_900_000,
                masterData: { logVersion: 42, gameVersion: 1, actors: [...ACTORS, BOSS], abilities: [] },
                phases: [],
                fights: [
                  {
                    id: 6,
                    name: "Test Boss",
                    encounterID: 2900,
                    difficulty: 5,
                    size: 20,
                    kill: true,
                    inProgress: false,
                    startTime: 1000,
                    endTime: 5000,
                    friendlyPlayers: RAIDERS,
                    friendlySpecs: RAIDERS.map(() => "Assassination"),
                    talentImportCode: "ABCDEF",
                    phaseTransitions: [],
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    pages: [
      () => eventPageResponse([rawEvent(1000, "cast", { sourceID: 19, abilityGameID: 703 })], 3000),
      () => eventPageResponse([rawEvent(3000, "cast", { sourceID: 5, abilityGameID: 703 })], null),
    ],
  });
}

const DEPS = { now: () => 1_000_000 };

describe("one fight ingestion serves twenty players", () => {
  it("issues the same Warcraft Logs requests for twenty players as for one", async () => {
    const { client, fetch } = createTestGraphqlClient(responder());

    const outcome = await ingestFightCore(
      { reportCode: "aBcDeFgH12345678", fightId: 6, talentImportActorId: 19, includeResources: true },
      { client, ...DEPS },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const views = RAIDERS.map((raider) => focusedFightFor(outcome.core, raider, "PLAYER_CONTEXT"));
    expect(views).toHaveLength(20);

    // THE COUNT. One token, one context query, two event pages, one revision
    // recheck — and NOTHING that scales with the number of players, because
    // building a view issues no request at all.
    const graphql = fetch.graphqlCalls();
    const byOperation = graphql.map((request) => {
      const query = queryOf(request.body);
      if (query.includes("CoachFightContext")) return "context";
      if (query.includes("CoachReportRevision")) return "revision";
      return "events";
    });
    expect(byOperation).toEqual(["context", "events", "events", "revision"]);
    expect(graphql).toHaveLength(4);
  });

  it("never sends an actor filter, whatever the player count", async () => {
    const { client, fetch } = createTestGraphqlClient(responder());
    await ingestFightCore(
      { reportCode: "aBcDeFgH12345678", fightId: 6, talentImportActorId: 19, includeResources: true },
      { client, ...DEPS },
    );

    for (const request of fetch.graphqlCalls()) {
      const query = queryOf(request.body);
      if (!query.includes("CoachFightEvents")) continue;
      // The M3 contract, re-asserted at the reuse boundary: a shared stream is
      // only shareable because it was never narrowed to one player.
      expect(query).not.toContain("sourceID");
      expect(query).not.toContain("targetID");
      expect(Object.keys(variablesOf(request.body))).not.toContain("sourceID");
    }
  });
});

describe("the single-player path is the core plus one view", () => {
  it("produces the same fight as focusing the core on that player", async () => {
    const direct = await ingestFight(
      {
        reportCode: "aBcDeFgH12345678",
        fightId: 6,
        sourceId: 19,
        scope: "PLAYER_CONTEXT",
        includeResources: true,
      },
      { client: createTestGraphqlClient(responder()).client, ...DEPS },
    );

    const outcome = await ingestFightCore(
      { reportCode: "aBcDeFgH12345678", fightId: 6, talentImportActorId: 19, includeResources: true },
      { client: createTestGraphqlClient(responder()).client, ...DEPS },
    );

    expect(direct.ok).toBe(true);
    expect(outcome.ok).toBe(true);
    if (!direct.ok || !outcome.ok) return;

    // Two independent retrievals through the real transport, compared whole.
    // This is a consistency check on the composition rather than an independent
    // oracle — the oracle is the unchanged behaviour of every existing M3/M5
    // test over the same code path.
    expect(direct.fight).toEqual(focusedFightFor(outcome.core, 19, "PLAYER_CONTEXT"));
  });

  it("builds state for a focused view exactly as for a directly ingested fight", async () => {
    const outcome = await ingestFightCore(
      { reportCode: "aBcDeFgH12345678", fightId: 6, talentImportActorId: 19, includeResources: true },
      { client: createTestGraphqlClient(responder()).client, ...DEPS },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const first = createCombatState(focusedFightFor(outcome.core, 19, "PLAYER_CONTEXT"));
    const second = createCombatState(focusedFightFor(outcome.core, 5, "PLAYER_CONTEXT"));

    // Each state indexes the WHOLE capture — scope is a declaration about what
    // may be reasoned over, never a filter on what was observed.
    expect(first.positionsBySourceActor(19)).toEqual([0]);
    expect(second.positionsBySourceActor(19)).toEqual([0]);
    expect(first.fight.events).toBe(second.fight.events);
  });
});

describe("talent evidence through the real retrieval path", () => {
  /** The TALENTS coverage of one focused view. */
  function talentCoverage(fight: CombatFight) {
    const evidence = fight.completeness.categories.TALENTS;
    expect(evidence.capability).toBe("OBSERVABLE");
    if (evidence.capability !== "OBSERVABLE") throw new Error("unreachable");
    return evidence.coverage;
  }

  it("CASE 5 — single-player ingestFight still holds complete talent evidence", async () => {
    // The pre-M7 behaviour, unchanged: the analysed player IS the actor the
    // per-actor field was requested for, so nothing is withheld from them.
    const direct = await ingestFight(
      {
        reportCode: "aBcDeFgH12345678",
        fightId: 6,
        sourceId: 19,
        scope: "PLAYER_CONTEXT",
        includeResources: true,
      },
      { client: createTestGraphqlClient(responder()).client, ...DEPS },
    );
    expect(direct.ok).toBe(true);
    if (!direct.ok) return;

    expect(direct.fight.talentImportCode).toBe("ABCDEF");
    expect(talentCoverage(direct.fight).state).toBe("COMPLETE");
    expect(talentCoverage(direct.fight).reason).toBe("COMPLETED_NORMALLY");
  });

  it("withholds it from every OTHER player sharing the same retrieval", async () => {
    const outcome = await ingestFightCore(
      { reportCode: "aBcDeFgH12345678", fightId: 6, talentImportActorId: 19, includeResources: true },
      { client: createTestGraphqlClient(responder()).client, ...DEPS },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    for (const raider of RAIDERS.filter((id) => id !== 19)) {
      const view = focusedFightFor(outcome.core, raider, "PLAYER_CONTEXT");
      // Never another player's build string, and never a claim we looked.
      expect(view.talentImportCode).toBeNull();
      expect(talentCoverage(view).state).toBe("ABSENT");
      expect(talentCoverage(view).reason).toBe("NOT_REQUESTED");
    }
  });

  it("keeps the per-actor retrieval in the shared stream list as a real fact", async () => {
    // The round trip DID happen. It simply vouches for one player. Recording it
    // as retrieved while its category is ABSENT for others is the same
    // separation M3 already draws between "what we fetched" and "what that
    // establishes".
    const outcome = await ingestFightCore(
      { reportCode: "aBcDeFgH12345678", fightId: 6, talentImportActorId: 19, includeResources: true },
      { client: createTestGraphqlClient(responder()).client, ...DEPS },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const perActor = outcome.core.streams.find((stream) => stream.streamId === "context:typed:actor");
    expect(perActor?.state).toBe("COMPLETE");
    // Shared by reference by every view, queried actor or not.
    const other = focusedFightFor(outcome.core, 5, "PLAYER_CONTEXT");
    expect(other.completeness.streams).toBe(outcome.core.streams);
  });
});
