/**
 * Roster discovery costs one query, and a raid night belongs to one revision.
 *
 * TWO DEFECTS THIS FILE EXISTS TO PREVENT
 *
 * REPEATED DISCOVERY. The single-player path performs one preflight per request.
 * Learning a whole raid night that way is one preflight per player per fight —
 * hundreds of round trips against a finite, paid, account-wide quota, for facts
 * that arrive together in a single response. The counting tests below make the
 * one-query claim load-bearing rather than aspirational.
 *
 * MIXED REVISIONS. A Warcraft Logs report can be re-uploaded at any moment, and
 * `revision` is the only thing that says two pieces of evidence describe the
 * same export. A night assembled from revision 30 and revision 31 is not a
 * partially complete night — it is two different worlds wearing one name, and it
 * is not representable as PARTIAL, UNKNOWN or INSUFFICIENT_EVIDENCE. It has to
 * fail, and it has to fail before anything expensive is spent on it.
 */

import { describe, expect, it } from "vitest";

import { jsonResponse } from "../support/fake-fetch.js";

import { discoverReportRoster } from "../../src/wcl/report-roster.js";
import { checkReportRevision } from "../../src/wcl/report-revision.js";
import { ingestFight, ingestFightCore } from "../../src/wcl/ingest-fight.js";
import {
  contextResponse,
  createTestGraphqlClient,
  eventPageResponse,
  ingestionResponder,
  jsonResponseFor,
  queryOf,
  rawEvent,
  revisionResponse,
  rosterActor,
  rosterFight,
  rosterResponse,
  variablesOf,
} from "../support/wcl-harness.js";

const REPORT = "aBcDeFgH12345678";
const ROGUE = 19;
const HEALER = 7;
const R0 = 30;

const ACTORS = [
  rosterActor({ id: ROGUE, name: "Sneaky", subType: "Rogue" }),
  rosterActor({ id: HEALER, name: "Mendy", subType: "Priest" }),
];

function rosterResponder(response: () => Response) {
  return (request: { readonly body: string | undefined }) => {
    const query = queryOf(request.body);
    if (!query.includes("CoachReportRoster")) {
      throw new Error(`roster discovery issued an unexpected operation: ${query.slice(0, 60)}`);
    }
    return response();
  };
}

describe("one query discovers the whole selected fight set", () => {
  it("issues exactly one GraphQL request for three fights and two players", async () => {
    const { client, fetch } = createTestGraphqlClient(
      rosterResponder(() =>
        rosterResponse({
          revision: R0,
          actors: ACTORS,
          fights: [
            rosterFight({
              id: 1,
              friendlyPlayers: [ROGUE, HEALER],
              friendlySpecs: ["Assassination", "Holy"],
            }),
            rosterFight({ id: 2, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] }),
            rosterFight({ id: 3, friendlyPlayers: [ROGUE, HEALER], friendlySpecs: ["Outlaw", "Holy"] }),
          ],
        }),
      ),
    );

    const result = await discoverReportRoster({ reportCode: REPORT, fightIds: [1, 2, 3] }, { client });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // ONE request, and it is the roster document. Nothing scales with the number
    // of fights or the number of players.
    const graphql = fetch.graphqlCalls();
    expect(graphql).toHaveLength(1);
    expect(queryOf(graphql[0]?.body)).toContain("CoachReportRoster");
    expect(variablesOf(graphql[0]?.body)["fightIDs"]).toEqual([1, 2, 3]);

    expect(result.snapshot.identity.reportRevision).toBe(R0);
    expect(result.snapshot.identity.includedFightIds).toEqual([1, 2, 3]);
    expect(result.snapshot.players.map((player) => player.sourceId)).toEqual([HEALER, ROGUE]);
  });

  it("requests no events, no resources and no pagination", async () => {
    const { client, fetch } = createTestGraphqlClient(
      rosterResponder(() =>
        rosterResponse({
          actors: ACTORS,
          fights: [rosterFight({ id: 1, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] })],
        }),
      ),
    );
    await discoverReportRoster({ reportCode: REPORT, fightIds: [1] }, { client });

    const query = queryOf(fetch.graphqlCalls()[0]?.body);
    // Roster discovery is identity work. A query that could reach the event
    // stream would eventually be asked to.
    for (const forbidden of [
      "events(",
      "dataType",
      "includeResources",
      "nextPageTimestamp",
      "talentImportCode",
      "playerDetails",
      "rankings",
      "table(",
      "graph(",
    ]) {
      expect(query, `roster query must not request ${forbidden}`).not.toContain(forbidden);
    }
    expect(query).toContain("friendlyPlayers");
    expect(query).toContain("friendlySpecs");
  });

  it("spends nothing when the caller selected no fights", async () => {
    const { client, fetch } = createTestGraphqlClient(
      rosterResponder(() => rosterResponse({ actors: ACTORS, fights: [] })),
    );

    const result = await discoverReportRoster({ reportCode: REPORT, fightIds: [] }, { client });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe("NO_FIGHTS_REQUESTED");
    // An empty selection would make Warcraft Logs return the whole report. It is
    // refused before a point is spent learning that the caller asked nothing.
    expect(fetch.graphqlCalls()).toHaveLength(0);
  });

  it("maps an inaccessible report onto the existing vocabulary", async () => {
    const { client } = createTestGraphqlClient(
      rosterResponder(() => jsonResponseFor({ reportData: { report: null } })),
    );
    const result = await discoverReportRoster({ reportCode: REPORT, fightIds: [1] }, { client });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe("REPORT_NOT_ACCESSIBLE");
  });
});

describe("R0 guards every later retrieval", () => {
  /** A fight-context responder that reports whatever revision it is given. */
  function fightResponder(contextRevision: number, finalRevision = contextRevision) {
    return ingestionResponder({
      context: () => contextResponse({ revision: contextRevision }),
      pages: [() => eventPageResponse([rawEvent(1000, "cast", { sourceID: 5, abilityGameID: 703 })], null)],
      revision: () => revisionResponse(finalRevision),
    });
  }

  it("fails a fight whose context revision already moved, BEFORE paginating", async () => {
    const { client, fetch } = createTestGraphqlClient(fightResponder(31));

    const outcome = await ingestFightCore(
      {
        reportCode: REPORT,
        fightId: 6,
        talentImportActorId: 5,
        includeResources: true,
        expectedReportRevision: R0,
      },
      { client, now: () => 1_000_000 },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.reason).toBe("REPORT_REVISION_CHANGED");

    // THE COST PROPERTY. One context query, and then nothing: no event page was
    // requested for a fight whose evidence could never have been used.
    const operations = fetch.graphqlCalls().map((call) => {
      const query = queryOf(call.body);
      if (query.includes("CoachFightContext")) return "context";
      if (query.includes("CoachReportRevision")) return "revision";
      return "events";
    });
    expect(operations).toEqual(["context"]);
    expect(operations).not.toContain("events");
  });

  it("accepts a fight whose context revision matches R0", async () => {
    const { client } = createTestGraphqlClient(fightResponder(R0));

    const outcome = await ingestFightCore(
      {
        reportCode: REPORT,
        fightId: 6,
        talentImportActorId: 5,
        includeResources: true,
        expectedReportRevision: R0,
      },
      { client, now: () => 1_000_000 },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // Checked again on the produced core: the initial query is not trusted alone.
    expect(outcome.core.report.revision).toBe(R0);
  });

  it("leaves the single-player path untouched when no expectation is stated", async () => {
    // No `expectedReportRevision`. A context revision of 31 is simply the
    // report's revision, not a mismatch — there is nothing to mismatch against.
    const { client } = createTestGraphqlClient(fightResponder(31));

    const direct = await ingestFight(
      {
        reportCode: REPORT,
        fightId: 6,
        sourceId: 5,
        scope: "PLAYER_CONTEXT",
        includeResources: true,
      },
      { client, now: () => 1_000_000 },
    );

    expect(direct.ok).toBe(true);
    if (!direct.ok) return;
    expect(direct.fight.report.revision).toBe(31);
  });

  it("still fails a report that moves DURING pagination, expectation or not", async () => {
    // M3's own post-pagination recheck. The pre-pagination gate does not replace
    // it: this one catches a report that had already moved, that one catches a
    // report that moves mid-flight, and neither implies the other.
    for (const expectation of [undefined, R0]) {
      const { client } = createTestGraphqlClient(fightResponder(R0, 31));
      const outcome = await ingestFightCore(
        {
          reportCode: REPORT,
          fightId: 6,
          talentImportActorId: 5,
          includeResources: true,
          ...(expectation === undefined ? {} : { expectedReportRevision: expectation }),
        },
        { client, now: () => 1_000_000 },
      );
      expect(outcome.ok).toBe(false);
      if (outcome.ok) continue;
      expect(outcome.failure.reason).toBe("REPORT_REVISION_CHANGED");
    }
  });
});

describe("the final batch revision guard", () => {
  it("reports MATCHES when the report never moved", async () => {
    const { client } = createTestGraphqlClient(() => revisionResponse(R0));
    expect(await checkReportRevision(client, REPORT, R0)).toEqual({ outcome: "MATCHES", revision: R0 });
  });

  it("reports CHANGED when the report moved after every fight was processed", async () => {
    // R0 = 30, each fight observed at 30, and the report re-exported before the
    // batch finished. Nothing retrieved is individually wrong; the SNAPSHOT is.
    const { client } = createTestGraphqlClient(() => revisionResponse(31));
    expect(await checkReportRevision(client, REPORT, R0)).toEqual({
      outcome: "CHANGED",
      expected: R0,
      observed: 31,
    });
  });

  it("reports UNVERIFIED rather than agreement when the report cannot be read", async () => {
    // A caller that could not ask has not confirmed anything. UNVERIFIED must
    // never be treated as MATCHES, which is why it is its own outcome. Since
    // M11-A5 it also says WHY: here, the request succeeded and the report was
    // not served.
    const { client } = createTestGraphqlClient(() => jsonResponseFor({ reportData: { report: null } }));
    expect(await checkReportRevision(client, REPORT, R0)).toEqual({
      outcome: "UNVERIFIED",
      cause: { kind: "REPORT_NOT_SERVED" },
    });
  });

  it("UNVERIFIED preserves the transport's own failure instead of collapsing it (M11-A5)", async () => {
    // Rate-limited, forbidden, unavailable, invalid, and a thrown fetch — each
    // keeps its reason and fixed-shape diagnostics on the cause, so the layer
    // that refuses to publish can also say what happened.
    for (const [status, reason] of [
      [429, "UPSTREAM_RATE_LIMITED"],
      [403, "UPSTREAM_AUTH_FAILED"],
      [500, "UPSTREAM_UNAVAILABLE"],
    ] as const) {
      const { client } = createTestGraphqlClient(() => jsonResponse(status, {}));
      const check = await checkReportRevision(client, REPORT, R0);
      expect(check).toMatchObject({
        outcome: "UNVERIFIED",
        cause: {
          kind: "UPSTREAM",
          failure: { reason, diagnostics: { stage: "TRANSPORT", httpStatus: status } },
        },
      });
    }
    const errors = createTestGraphqlClient(() => jsonResponse(200, { errors: [{ message: "x" }] }));
    expect(await checkReportRevision(errors.client, REPORT, R0)).toMatchObject({
      outcome: "UNVERIFIED",
      cause: {
        kind: "UPSTREAM",
        failure: { reason: "UPSTREAM_DATA_INVALID", diagnostics: { graphqlErrorCount: 1 } },
      },
    });
    const undecodable = createTestGraphqlClient(() =>
      jsonResponseFor({ reportData: { report: { revision: "thirty" } } }),
    );
    expect(await checkReportRevision(undecodable.client, REPORT, R0)).toMatchObject({
      outcome: "UNVERIFIED",
      cause: {
        kind: "UPSTREAM",
        failure: { reason: "UPSTREAM_DATA_INVALID", diagnostics: { stage: "DECODE" } },
      },
    });
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    const thrown = createTestGraphqlClient(() => {
      throw timeout;
    });
    expect(await checkReportRevision(thrown.client, REPORT, R0)).toMatchObject({
      outcome: "UNVERIFIED",
      cause: {
        kind: "UPSTREAM",
        failure: {
          reason: "UPSTREAM_UNAVAILABLE",
          diagnostics: { errorName: "TimeoutError", isTimeout: true },
        },
      },
    });
    // The public reading of every one of these is still "not confirmed":
    // MATCHES and CHANGED are the only outcomes that establish anything.
  });

  it("costs one cheap request that retrieves nothing else", async () => {
    const { client, fetch } = createTestGraphqlClient(() => revisionResponse(R0));
    await checkReportRevision(client, REPORT, R0);

    const graphql = fetch.graphqlCalls();
    expect(graphql).toHaveLength(1);
    const query = queryOf(graphql[0]?.body);
    expect(query).toContain("CoachReportRevision");
    expect(query).not.toContain("masterData");
    expect(query).not.toContain("events(");
  });
});

describe("a mixed-revision night cannot be assembled", () => {
  it("rejects the second fight when the report moved between fights", async () => {
    // roster R0=30 -> fight 1 at 30 -> fight 2 at 31.
    const first = createTestGraphqlClient(
      ingestionResponder({
        context: () => contextResponse({ revision: R0 }),
        pages: [() => eventPageResponse([rawEvent(1000, "cast", { sourceID: 5 })], null)],
        revision: () => revisionResponse(R0),
      }),
    );
    const second = createTestGraphqlClient(
      ingestionResponder({
        context: () => contextResponse({ revision: 31 }),
        pages: [() => eventPageResponse([rawEvent(1000, "cast", { sourceID: 5 })], null)],
        revision: () => revisionResponse(31),
      }),
    );

    const request = { reportCode: REPORT, talentImportActorId: 5, includeResources: true } as const;
    const deps = { now: () => 1_000_000 };

    const one = await ingestFightCore(
      { ...request, fightId: 6, expectedReportRevision: R0 },
      { client: first.client, ...deps },
    );
    const two = await ingestFightCore(
      { ...request, fightId: 7, expectedReportRevision: R0 },
      { client: second.client, ...deps },
    );

    expect(one.ok).toBe(true);
    expect(two.ok).toBe(false);
    if (two.ok) return;
    expect(two.failure.reason).toBe("REPORT_REVISION_CHANGED");

    // And the rejected fight cost one context query, not a pagination.
    expect(second.fetch.graphqlCalls()).toHaveLength(1);
  });
});
