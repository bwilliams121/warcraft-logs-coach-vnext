/**
 * External discovery stays bounded, metadata-only, and unable to touch anything
 * that already works.
 *
 * THE THREE PROPERTIES, AND WHY EACH IS A REGRESSION RISK
 *
 *   COST       one ranking page plus at most five metadata lookups. The failure
 *              mode is a pagination loop or a per-candidate retry appearing in a
 *              later edit, and neither shows up in a unit test of the pure
 *              functions — so the count is asserted through a real
 *              `WclGraphqlClient` over a recording fetch.
 *
 *   NO EVENTS  M8-A measured one external full-event ingestion at 202
 *              subrequests against a four-pull raid night already spending 810.
 *              This asserts no event query is ever issued, by inspecting what
 *              was actually sent.
 *
 *   LOCAL      M8-D progression must be byte-identical whether discovery
 *              succeeds, returns an empty pool, partly fails, wholly fails, or
 *              is never called at all.
 */

import { describe, expect, it } from "vitest";

import { createGraphqlClient } from "../../src/wcl/graphql-client.js";
import { createTokenProvider } from "../../src/wcl/token-provider.js";
import { createWclFetch } from "../support/fake-fetch.js";
import { TEST_CREDENTIALS, queryOf } from "../support/wcl-harness.js";
import {
  decodeEncounterRankings,
  encounterRankingsQuery,
  encounterRankingsVariables,
  type EncounterRankingsRequest,
} from "../../src/wcl/rankings/rankings-query.js";
import { decodeRankingPayload } from "../../src/wcl/rankings/rankings-decoder.js";
import {
  candidateMetadataVariables,
  decodeCandidateMetadata,
  CANDIDATE_METADATA_QUERY,
} from "../../src/wcl/rankings/candidate-metadata-query.js";
import { discoverExternalReferences } from "../../src/external-context/external-discovery.js";
import { MAX_QUALIFIED_CANDIDATES } from "../../src/external-context/candidate-pool.js";
import { buildRaidNightProgression } from "../../src/progression/encounter-progression.js";
import { aggregateOf, analyzedCell, rosterFightFor, rosterPlayerFor } from "../support/raid-night-fixture.js";
import {
  candidateReport,
  DIFFICULTY,
  ENCOUNTER_ID,
  rankingPayload,
  rankingRow,
  subjectPull,
} from "../support/m8f-fixture.js";

const RANKINGS_REQUEST: EncounterRankingsRequest = {
  encounterId: ENCOUNTER_ID,
  difficulty: DIFFICULTY,
  className: "Rogue",
  specName: "Assassination",
  metric: "dps",
  partition: { kind: "EXPLICIT", partition: 1 },
};

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Eight eligible rows, so the five-candidate cap actually bites. */
function eightRows() {
  return Array.from({ length: 8 }, (_, index) =>
    rankingRow({
      code: `REPORT${String(index).padStart(2, "0")}`,
      fightID: index + 1,
      durationMs: 300_000 + index * 1_000,
    }),
  );
}

/**
 * A discovery driven through the REAL GraphQL client and a recording fetch.
 *
 * The ports are thin adapters over that client, which is what makes the
 * recorded request list the true cost of one discovery rather than a count this
 * test maintains by hand.
 */
async function runDiscovery(
  options: {
    readonly rankings: unknown;
    readonly metadataFor?: (code: string, fightId: number) => unknown;
  } = { rankings: jsonResponse(null) },
) {
  const fetchLike = createWclFetch({
    graphql: (request) => {
      const query = queryOf(request.body);
      if (query.includes("CoachEncounterRankings")) {
        return jsonResponse({
          worldData: { encounter: { id: ENCOUNTER_ID, characterRankings: options.rankings } },
        });
      }
      if (query.includes("CoachExternalCandidateMetadata")) {
        const body = JSON.parse(request.body ?? "{}") as { variables?: Record<string, unknown> };
        const code = String(body.variables?.["code"]);
        const fightIds = body.variables?.["fightIDs"] as number[] | undefined;
        const fightId = fightIds?.[0] ?? 0;
        // `??` would swallow a deliberate null, which is exactly the
        // inaccessible-report case these tests need to express.
        const report =
          options.metadataFor === undefined
            ? candidateReportFor(code, fightId)
            : options.metadataFor(code, fightId);
        return jsonResponse({ reportData: { report } });
      }
      throw new Error(`unexpected query: ${query.slice(0, 60)}`);
    },
  });

  const client = createGraphqlClient({
    tokens: createTokenProvider({ credentials: TEST_CREDENTIALS, fetch: fetchLike.fetch, now: () => 1_000 }),
    fetch: fetchLike.fetch,
  });

  const discovery = await discoverExternalReferences(
    { rankings: RANKINGS_REQUEST, subject: subjectPull(), credentials: TEST_CREDENTIALS },
    {
      rankingPage: async (request) => {
        const outcome = await client.execute({
          query: encounterRankingsQuery(request.metric),
          variables: encounterRankingsVariables(request),
          decode: decodeEncounterRankings,
        });
        return outcome.ok
          ? decodeRankingPayload(outcome.data.rankings)
          : { outcome: "PAYLOAD_UNRECOGNISED", defect: "RANKINGS_NOT_A_RECORD" };
      },
      candidateMetadata: async (reportCode, fightId) => {
        const outcome = await client.execute({
          query: CANDIDATE_METADATA_QUERY,
          variables: candidateMetadataVariables(reportCode, fightId),
          decode: decodeCandidateMetadata,
        });
        return outcome.ok ? outcome.data.report : null;
      },
    },
  );

  return { discovery, fetchLike };
}

/** The raw metadata a candidate report would return, in wire shape. */
function candidateReportFor(code: string, fightId: number): Record<string, unknown> {
  const report = candidateReport({ code, fightId });
  return {
    code: report.code,
    revision: report.revision,
    startTime: report.startTimeUnixMs,
    endTime: report.endTimeUnixMs,
    archiveStatus: report.archiveStatus,
    zone: report.zone,
    masterData: { logVersion: report.logVersion, gameVersion: report.gameVersion, actors: report.actors },
    fights: report.fights,
  };
}

describe("one discovery issues at most one ranking page and five metadata lookups", () => {
  it("issues exactly 1 + 5 GraphQL requests for an eight-row pool", async () => {
    const { discovery, fetchLike } = await runDiscovery({ rankings: rankingPayload(eightRows()) });

    const graphql = fetchLike.graphqlCalls();
    const rankingCalls = graphql.filter((call) => String(call.body).includes("CoachEncounterRankings"));
    const metadataCalls = graphql.filter((call) =>
      String(call.body).includes("CoachExternalCandidateMetadata"),
    );

    expect(rankingCalls).toHaveLength(1);
    expect(metadataCalls).toHaveLength(MAX_QUALIFIED_CANDIDATES);
    expect(graphql).toHaveLength(1 + MAX_QUALIFIED_CANDIDATES);

    // And the domain's own accounting agrees with what was actually sent.
    expect(discovery.requestCount).toBe(6);
  });

  it("issues no second ranking page even when WCL says more exist", async () => {
    const { fetchLike } = await runDiscovery({
      rankings: rankingPayload(eightRows(), { hasMorePages: true, count: 5_000 }),
    });
    expect(
      fetchLike.graphqlCalls().filter((call) => String(call.body).includes("CoachEncounterRankings")),
    ).toHaveLength(1);
  });

  it("issues exactly one ranking request and no metadata request for an empty pool", async () => {
    const { discovery, fetchLike } = await runDiscovery({ rankings: rankingPayload([]) });
    expect(fetchLike.graphqlCalls()).toHaveLength(1);
    expect(discovery.outcome).toBe("DISCOVERED");
    if (discovery.outcome !== "DISCOVERED") return;
    // A decoded page with zero rows is a FACT about the query, not a failure.
    expect(discovery.qualified).toEqual([]);
    expect(discovery.selection.provenance.rowsDecoded).toBe(0);
  });

  it("stops after the ranking request when the payload is rejected", async () => {
    const { discovery, fetchLike } = await runDiscovery({
      rankings: { error: "You cannot specify a size for a flexibly-sized raid zone." },
    });
    expect(fetchLike.graphqlCalls()).toHaveLength(1);
    expect(discovery.outcome).toBe("POOL_UNKNOWN");
    if (discovery.outcome !== "POOL_UNKNOWN") return;
    expect(discovery.reason).toBe("RANKING_REQUEST_REJECTED");
  });

  it("never issues an event query", async () => {
    const { fetchLike } = await runDiscovery({ rankings: rankingPayload(eightRows()) });
    for (const call of fetchLike.graphqlCalls()) {
      const body = String(call.body);
      for (const banned of ["ReportEventPaginator", '"events"', "events(", "CoachFightContext"]) {
        expect(body, `discovery issued ${banned}`).not.toContain(banned);
      }
    }
  });
});

describe("candidate failures stay candidate-local", () => {
  it("keeps the other candidates when one report is inaccessible", async () => {
    // REPORT07 has the duration nearest the subject, so it is definitely among
    // the five selected. REPORT00 is the furthest and is not selected at all.
    const { discovery } = await runDiscovery({
      rankings: rankingPayload(eightRows()),
      metadataFor: (code, fightId) => (code === "REPORT07" ? null : candidateReportFor(code, fightId)),
    });
    expect(discovery.outcome).toBe("DISCOVERED");
    if (discovery.outcome !== "DISCOVERED") return;
    expect(discovery.qualified).toHaveLength(4);
    expect(discovery.failures).toHaveLength(1);
    expect(discovery.failures[0]?.reason).toBe("REPORT_NOT_ACCESSIBLE");
  });

  it("reports a wholly failed discovery as zero qualified references, not as an empty world", async () => {
    const { discovery } = await runDiscovery({
      rankings: rankingPayload(eightRows()),
      metadataFor: () => null,
    });
    expect(discovery.outcome).toBe("DISCOVERED");
    if (discovery.outcome !== "DISCOVERED") return;
    expect(discovery.qualified).toEqual([]);
    // The distinction that matters: five preserved reasons, not "none exist".
    expect(discovery.failures).toHaveLength(5);
    expect(discovery.selection.selected).toHaveLength(5);
  });
});

describe("local progression is independent of external discovery", () => {
  function localProgression() {
    const aggregate = aggregateOf({
      players: [rosterPlayerFor({ sourceId: 5 })],
      fights: [1, 2, 3].map((fightId) =>
        rosterFightFor({
          fightId,
          participants: [{ sourceId: 5, specName: "Assassination" }],
          encounterId: ENCOUNTER_ID,
          difficulty: DIFFICULTY,
          startTimeMs: fightId * 10_000,
          endTimeMs: fightId * 10_000 + 5_000,
        }),
      ),
      cells: [1, 2, 3].map((fightId) => analyzedCell({ fightId, sourceId: 5 })),
    });
    return JSON.stringify(buildRaidNightProgression({ aggregate, encounterFacts: [] }));
  }

  it("is byte-identical across every external discovery outcome", async () => {
    const baseline = localProgression();

    // Omitted entirely.
    expect(localProgression()).toBe(baseline);

    for (const scenario of [
      { rankings: rankingPayload(eightRows()) },
      { rankings: rankingPayload([]) },
      { rankings: { error: "rejected" } },
      { rankings: { nonsense: true } },
      {
        rankings: rankingPayload(eightRows()),
        metadataFor: (code: string, fightId: number) =>
          code === "REPORT07" ? null : candidateReportFor(code, fightId),
      },
      { rankings: rankingPayload(eightRows()), metadataFor: () => null },
    ]) {
      await runDiscovery(scenario);
      expect(localProgression(), JSON.stringify(scenario.rankings).slice(0, 40)).toBe(baseline);
    }
  });
});

describe("discovery output is deterministic", () => {
  it("produces identical output for identical evidence", async () => {
    const first = await runDiscovery({ rankings: rankingPayload(eightRows()) });
    const second = await runDiscovery({ rankings: rankingPayload(eightRows()) });
    expect(JSON.stringify(second.discovery)).toBe(JSON.stringify(first.discovery));
  });

  it("is unaffected by the order of ranking rows", async () => {
    const forward = await runDiscovery({ rankings: rankingPayload(eightRows()) });
    const reversed = await runDiscovery({ rankings: rankingPayload([...eightRows()].reverse()) });
    expect(JSON.stringify(reversed.discovery)).toBe(JSON.stringify(forward.discovery));
  });

  it("carries no wall clock, random id or parse metric in its output", async () => {
    const { discovery } = await runDiscovery({ rankings: rankingPayload(eightRows()) });
    const serialized = JSON.stringify(discovery).toLowerCase();
    for (const banned of ["retrievedat", "uuid", "requestid", "wallclock", "amount", "percentile", "parse"]) {
      expect(serialized, `discovery carried ${banned}`).not.toContain(banned);
    }
  });

  it("returns every qualified reference as still-UNKNOWN comparability", async () => {
    const { discovery } = await runDiscovery({ rankings: rankingPayload(eightRows()) });
    expect(discovery.outcome).toBe("DISCOVERED");
    if (discovery.outcome !== "DISCOVERED") return;
    expect(discovery.qualified).toHaveLength(5);
    for (const reference of discovery.qualified) {
      expect(reference.comparability.comparability).toBe("UNKNOWN");
      expect(reference.comparability.unresolvedDimensions).toEqual(["version"]);
    }
  });
});
