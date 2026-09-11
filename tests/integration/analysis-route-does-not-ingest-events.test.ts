import { describe, expect, it } from "vitest";

import { createWorker } from "../../src/api/worker.js";
import type { Env } from "../../src/config/env.js";
import { analyzeFight, ENABLED_ANALYSIS_REQUIREMENTS } from "../../src/services/analysis-service.js";
import { createPreflight } from "../../src/wcl/preflight.js";
import { createWclFetch, jsonResponse } from "../support/fake-fetch.js";
import { queryOf } from "../support/wcl-harness.js";

/**
 * Milestone 3 builds the ingestion capability and deliberately does not switch
 * it on.
 *
 * This is the test that keeps that promise honest. A future change that wires
 * ingestion into the live route — behind a flag, a conditional, or by accident
 * — makes `/v1/analysis` spend Warcraft Logs points retrieving evidence that no
 * analyzer asked for and nothing would read. Worse, it would do so while still
 * returning "analysis is not implemented", which is the route lying about what
 * it did.
 */

const FAKE_ENV: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: "fake-client-id-not-real",
  WCL_CLIENT_SECRET: "fake-client-secret-not-real",
};

const VALID_BODY = { reportCode: "aBcDeFgH12345678", fightId: 8, sourceId: 15 };

/** A preflight response that resolves a complete identity. */
function preflightResponse(): Response {
  return jsonResponse(200, {
    data: {
      rateLimitData: { limitPerHour: 3600, pointsSpentThisHour: 5, pointsResetIn: 600 },
      reportData: {
        report: {
          code: "aBcDeFgH12345678",
          revision: 24,
          startTime: 0,
          endTime: 600_000,
          masterData: {
            logVersion: 26,
            gameVersion: 1,
            actors: [{ id: 15, name: "Coachtest", type: "Player", subType: "Rogue" }],
          },
          fights: [
            {
              id: 8,
              name: "Test Encounter",
              encounterID: 2902,
              difficulty: 5,
              startTime: 0,
              endTime: 300_000,
              friendlyPlayers: [15],
              friendlySpecs: ["Assassination"],
            },
          ],
        },
      },
    },
  });
}

async function callRoute() {
  const fetch = createWclFetch({ graphql: () => preflightResponse() });
  const worker = createWorker({
    analyze: analyzeFight,
    analyzers: ENABLED_ANALYSIS_REQUIREMENTS,
    preflight: createPreflight({ fetch: fetch.fetch, now: () => 1_000_000 }),
    // Not the real constant: this test asserts routing behaviour, not the
    // version string, and worker.ts keeps SERVICE_VERSION private.
    version: "test",
  });

  const response = await worker.fetch(
    new Request("https://coach.test/v1/analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    }),
    FAKE_ENV,
  );

  return { response, fetch };
}

describe("the live analysis route retrieves no combat events", () => {
  it("issues exactly one GraphQL request for a valid analysis request", async () => {
    const { fetch } = await callRoute();

    // One preflight query. Not two, and certainly not a paginated stream.
    expect(fetch.graphqlCalls()).toHaveLength(1);
  });

  it("never sends an events query", async () => {
    const { fetch } = await callRoute();

    for (const call of fetch.graphqlCalls()) {
      const query = queryOf(call.body);
      expect(query).not.toContain("events(");
      expect(query).not.toContain("CoachFightEvents");
      expect(query).not.toContain("nextPageTimestamp");
    }
  });

  it("never sends the ingestion context query either", async () => {
    const { fetch } = await callRoute();

    for (const call of fetch.graphqlCalls()) {
      expect(queryOf(call.body)).not.toContain("CoachFightContext");
    }
  });

  it("still answers ANALYSIS_NOT_IMPLEMENTED rather than an empty-looking report", async () => {
    const { response } = await callRoute();
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(501);
    expect(body.error?.code).toBe("ANALYSIS_NOT_IMPLEMENTED");
  });

  it("keeps the enabled analyzer registry empty", async () => {
    // Scope derivation reads this. While it is empty there is nothing to
    // analyze, so there is nothing to ingest for — and ingestion acquires a
    // caller and a reason on the same commit, in Milestone 5.
    expect(ENABLED_ANALYSIS_REQUIREMENTS).toHaveLength(0);
  });
});
