/**
 * M8-F: bounded external discovery, and the claims it refuses to make.
 *
 * The decoder cases all circle one failure: a rejected or unreadable ranking
 * payload becoming an empty list, and an empty list being read as "no comparable
 * logs exist". M8-A produced exactly that response from the live API — HTTP 200,
 * no GraphQL errors, `{"error": "You cannot specify a size for a flexibly-sized
 * raid zone."}` — so this is a measured hazard rather than a hypothetical one.
 *
 * The selection cases circle a second: rank leaking back in as an ordering.
 */

import { describe, expect, it } from "vitest";

import { decodeRankingPayload } from "../../src/wcl/rankings/rankings-decoder.js";
import {
  decodeEncounterRankings,
  encounterRankingsQuery,
  encounterRankingsVariables,
  MAX_CANDIDATE_PAGES,
} from "../../src/wcl/rankings/rankings-query.js";
import { CANDIDATE_METADATA_QUERY } from "../../src/wcl/rankings/candidate-metadata-query.js";
import {
  MAX_QUALIFIED_CANDIDATES,
  RANKINGS_DERIVED_REFERENCE_POOL,
  selectCandidates,
  type CandidatePoolProvenance,
} from "../../src/external-context/candidate-pool.js";
import { qualifyCandidate, resolveSourceActor } from "../../src/external-context/candidate-qualification.js";
import { normalizeActors } from "../../src/engine/normalization/actors.js";
import {
  candidateReport,
  descriptorFor,
  DIFFICULTY,
  ENCOUNTER_ID,
  rankingPayload,
  rankingRow,
  subjectPull,
} from "../support/m8f-fixture.js";

const POOL_PROVENANCE: Omit<CandidatePoolProvenance, "rowsDecoded" | "rowsEligible"> = {
  source: RANKINGS_DERIVED_REFERENCE_POOL,
  encounterId: ENCOUNTER_ID,
  difficulty: DIFFICULTY,
  className: "Rogue",
  specName: "Assassination",
  metric: "dps",
  partition: { kind: "EXPLICIT", partition: 1 },
  page: 1,
  reportedCount: 100,
  hasMorePages: true,
};

function decodedRows(payload: unknown) {
  const result = decodeRankingPayload(payload);
  if (result.outcome !== "DECODED") throw new Error(`not decoded: ${result.outcome}`);
  return result.page;
}

// ---------------------------------------------------------------------------
// The query
// ---------------------------------------------------------------------------

describe("the ranking query is bounded and sends no forbidden argument", () => {
  const QUERY = encounterRankingsQuery("dps");

  it("requests exactly one page", () => {
    expect(MAX_CANDIDATE_PAGES).toBe(1);
    expect(
      encounterRankingsVariables({
        encounterId: ENCOUNTER_ID,
        difficulty: DIFFICULTY,
        className: "Rogue",
        specName: "Assassination",
        metric: "dps",
        partition: { kind: "EXPLICIT", partition: 3 },
      }),
    ).toEqual({
      encounterId: ENCOUNTER_ID,
      difficulty: DIFFICULTY,
      className: "Rogue",
      specName: "Assassination",
      partition: 3,
      page: 1,
    });
  });

  it("maps the WCL default partition to 0 rather than omitting the argument", () => {
    const variables = encounterRankingsVariables({
      encounterId: ENCOUNTER_ID,
      difficulty: DIFFICULTY,
      className: "Rogue",
      specName: "Assassination",
      metric: "dps",
      partition: { kind: "WCL_DEFAULT_LATEST" },
    });
    expect(variables["partition"]).toBe(0);
  });

  it("sends no size argument", () => {
    // M8-A: WCL answered a size filter on a flex zone with an in-payload error.
    expect(QUERY).not.toContain("size:");
  });

  it("sends includeCombatantInfo: false explicitly", () => {
    // 34,666 bytes against 650,882 for one page, measured in M8-A.
    expect(QUERY).toContain("includeCombatantInfo: false");
  });

  it("requests no talents, gear or parse surface", () => {
    for (const banned of ["talents", "gear", "rankPercent", "bracketPercent", "fightRankings"]) {
      expect(QUERY, `query requests ${banned}`).not.toContain(banned);
    }
  });

  it("carries the metric as a closed literal, never a caller string", () => {
    expect(encounterRankingsQuery("dps")).toContain("metric: dps");
    expect(encounterRankingsQuery("hps")).toContain("metric: hps");
  });

  it("treats a null encounter as an absent payload rather than a decode failure", () => {
    const outcome = decodeEncounterRankings({ worldData: { encounter: null } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(decodeRankingPayload(outcome.value.rankings).outcome).toBe("ENCOUNTER_NOT_FOUND");
  });
});

describe("the candidate metadata query retrieves no events", () => {
  it("selects no event or phase surface and no per-actor talent field", () => {
    for (const banned of ["events(", "ReportEventPaginator", "phaseTransitions", "talentImportCode"]) {
      expect(CANDIDATE_METADATA_QUERY, `metadata query selects ${banned}`).not.toContain(banned);
    }
  });

  it("selects the actor catalog source resolution needs", () => {
    expect(CANDIDATE_METADATA_QUERY).toContain("actors {");
    expect(CANDIDATE_METADATA_QUERY).toContain("server");
  });
});

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

describe("the ranking decoder fails closed", () => {
  it("decodes the observed payload shape", () => {
    const page = decodedRows(
      rankingPayload([rankingRow({ code: "AAAAAAAAAAAAAAAA", fightID: 22, durationMs: 284_791 })]),
    );
    expect(page.page).toBe(1);
    expect(page.hasMorePages).toBe(true);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]?.reportCode).toBe("AAAAAAAAAAAAAAAA");
    expect(page.rows[0]?.fightId).toBe(22);
    expect(page.rows[0]?.durationMs).toBe(284_791);
    expect(page.rows[0]?.serverName).toBe("Testrealm");
  });

  it("carries no parse metric out of a payload that contains one", () => {
    // `amount` is present in the fixture, as it is in the live payload.
    const page = decodedRows(rankingPayload([rankingRow({ code: "A", fightID: 1, durationMs: 1000 })]));
    const serialized = JSON.stringify(page.rows[0]);
    for (const banned of ["amount", "rank", "percent", "parse", "faction", "guild"]) {
      expect(serialized.toLowerCase(), `row carried ${banned}`).not.toContain(banned);
    }
  });

  it("reports an in-payload WCL error as a rejection, never as an empty pool", () => {
    // The measured case, verbatim.
    const result = decodeRankingPayload({
      error: "You cannot specify a size for a flexibly-sized raid zone.",
    });
    expect(result.outcome).toBe("REQUEST_REJECTED");
    if (result.outcome !== "REQUEST_REJECTED") return;
    expect(result.message).toContain("flexibly-sized");
  });

  it.each([
    ["missing rankings key", { page: 1, hasMorePages: false }, "RANKINGS_KEY_MISSING"],
    ["rankings wrong type", { page: 1, hasMorePages: false, rankings: {} }, "RANKINGS_NOT_AN_ARRAY"],
    ["payload not a record", 7, "RANKINGS_NOT_A_RECORD"],
    ["pagination missing", { rankings: [] }, "PAGINATION_MISSING"],
    ["hasMorePages missing", { page: 1, rankings: [] }, "PAGINATION_MISSING"],
  ])("reports %s as unrecognised", (_label, payload, defect) => {
    const result = decodeRankingPayload(payload);
    expect(result.outcome).toBe("PAYLOAD_UNRECOGNISED");
    if (result.outcome !== "PAYLOAD_UNRECOGNISED") return;
    expect(result.defect).toBe(defect);
  });

  it.each([
    ["row not a record", 7, "ROW_NOT_A_RECORD"],
    [
      "report missing",
      { name: "X", class: "Rogue", spec: "Assassination", duration: 1, startTime: 1 },
      "ROW_REPORT_MISSING",
    ],
  ])("refuses the whole page when a %s", (_label, row, defect) => {
    const result = decodeRankingPayload(rankingPayload([row as Record<string, unknown>]));
    expect(result.outcome).toBe("PAYLOAD_UNRECOGNISED");
    if (result.outcome !== "PAYLOAD_UNRECOGNISED") return;
    expect(result.defect).toBe(defect);
  });

  it.each([
    ["fight id", { fightID: "22" }],
    ["duration", { duration: null }],
    ["zero duration", { duration: 0 }],
    ["negative duration", { duration: -5 }],
    ["player name", { name: "" }],
  ])("refuses the whole page when a row has an unusable %s", (_label, patch) => {
    const base = rankingRow({ code: "A", fightID: 22, durationMs: 1000 });
    const row =
      "fightID" in patch
        ? { ...base, report: { ...(base["report"] as object), ...patch } }
        : { ...base, ...patch };
    const result = decodeRankingPayload(rankingPayload([row]));
    expect(result.outcome).toBe("PAYLOAD_UNRECOGNISED");
    if (result.outcome !== "PAYLOAD_UNRECOGNISED") return;
    expect(result.defect).toBe("ROW_FIELD_UNUSABLE");
  });

  it("keeps a decoded page with zero rows as a FACT, not a failure", () => {
    const result = decodeRankingPayload(rankingPayload([]));
    expect(result.outcome).toBe("DECODED");
    if (result.outcome !== "DECODED") return;
    expect(result.page.rows).toEqual([]);
  });

  it("preserves a row with no server rather than failing it", () => {
    const page = decodedRows(
      rankingPayload([rankingRow({ code: "A", fightID: 1, durationMs: 1000, hidden: true })]),
    );
    expect(page.rows[0]?.serverName).toBeNull();
    expect(page.rows[0]?.hidden).toBe(true);
  });

  it("treats an absent hidden key as not hidden", () => {
    const page = decodedRows(rankingPayload([rankingRow({ code: "A", fightID: 1, durationMs: 1000 })]));
    expect(page.rows[0]?.hidden).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

describe("candidate selection is deterministic and rank-independent", () => {
  function rowsFor(entries: readonly (readonly [string, number, number])[]) {
    return decodedRows(
      rankingPayload(entries.map(([code, fightID, durationMs]) => rankingRow({ code, fightID, durationMs }))),
    ).rows;
  }

  function selectFrom(entries: readonly (readonly [string, number, number])[], subjectDurationMs = 300_000) {
    return selectCandidates({ rows: rowsFor(entries), provenance: POOL_PROVENANCE, subjectDurationMs });
  }

  it("selects at most five", () => {
    const entries = Array.from({ length: 12 }, (_, index) => [`R${String(index)}`, 1, 300_000] as const);
    expect(selectFrom(entries).selected).toHaveLength(MAX_QUALIFIED_CANDIDATES);
  });

  it("selects by nearest absolute duration, not by input position", () => {
    // Six candidates for five slots. The FURTHEST is first in the input, so a
    // top-N-by-position rule would keep it and drop a nearer one.
    const selection = selectFrom(
      [
        ["FAR", 1, 900_000],
        ["N1", 1, 300_100],
        ["N2", 1, 300_200],
        ["N3", 1, 300_300],
        ["N4", 1, 300_400],
        ["N5", 1, 300_500],
      ],
      300_000,
    );
    expect(selection.selected).toHaveLength(5);
    expect(selection.selected.map((entry) => entry.reportCode)).not.toContain("FAR");
  });

  it("keeps a distant candidate when there is room for it", () => {
    // The cap is what excludes, not the distance. Under five candidates, a far
    // one is still a factual reference and is not filtered out for being far.
    const selection = selectFrom(
      [
        ["FAR", 1, 900_000],
        ["NEAR", 1, 300_100],
      ],
      300_000,
    );
    expect(selection.selected.map((entry) => entry.reportCode)).toEqual(["FAR", "NEAR"]);
  });

  it("breaks a duration tie by reportCode then fightId", () => {
    const selection = selectFrom(
      [
        ["BBBB", 9, 310_000],
        ["AAAA", 2, 310_000],
        ["AAAA", 1, 310_000],
      ],
      300_000,
    );
    expect(selection.selected.map((entry) => `${entry.reportCode}:${String(entry.fightId)}`)).toEqual([
      "AAAA:1",
      "AAAA:2",
      "BBBB:9",
    ]);
  });

  it("returns candidates in canonical coordinate order, never distance order", () => {
    const selection = selectFrom(
      [
        ["ZZZZ", 1, 300_001],
        ["AAAA", 1, 350_000],
      ],
      300_000,
    );
    // ZZZZ is nearest; AAAA still comes first, because output order is identity.
    expect(selection.selected.map((entry) => entry.reportCode)).toEqual(["AAAA", "ZZZZ"]);
  });

  it("is unchanged by permuting the input rows", () => {
    const entries = [
      ["CCCC", 3, 320_000],
      ["AAAA", 1, 305_000],
      ["BBBB", 2, 299_000],
      ["DDDD", 4, 700_000],
    ] as const;
    const forward = selectFrom(entries);
    const reversed = selectFrom([...entries].reverse());
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it("exposes no ranking position anywhere in a selected descriptor", () => {
    // The descriptors only. The provenance legitimately names the pool
    // `RANKINGS_DERIVED_REFERENCE_POOL`, and that string contains "rank" — which
    // is honest labelling of the source, not a leaked position.
    const serialized = JSON.stringify(selectFrom([["AAAA", 1, 300_000]]).selected).toLowerCase();
    for (const banned of ["rank", "position", "index", "amount", "percent", "parse"]) {
      expect(serialized, `selection exposed ${banned}`).not.toContain(banned);
    }
  });

  it("drops hidden rows as structurally unresolvable", () => {
    const rows = decodedRows(
      rankingPayload([
        rankingRow({ code: "AAAA", fightID: 1, durationMs: 300_000, hidden: true, name: "Anonymous" }),
        rankingRow({ code: "BBBB", fightID: 1, durationMs: 300_000 }),
      ]),
    ).rows;
    const selection = selectCandidates({ rows, provenance: POOL_PROVENANCE, subjectDurationMs: 300_000 });
    expect(selection.selected.map((entry) => entry.reportCode)).toEqual(["BBBB"]);
    expect(selection.ineligible).toEqual([{ reportCode: "AAAA", fightId: 1, reason: "HIDDEN_CHARACTER" }]);
  });

  it("does not let duplicate pull coordinates consume multiple slots", () => {
    // Two players in ONE pull: one coordinate, one qualification request.
    const rows = decodedRows(
      rankingPayload([
        rankingRow({ code: "SAME", fightID: 7, durationMs: 300_000, name: "Alpha" }),
        rankingRow({ code: "SAME", fightID: 7, durationMs: 300_000, name: "Bravo" }),
        rankingRow({ code: "OTHR", fightID: 1, durationMs: 300_000 }),
      ]),
    ).rows;
    const selection = selectCandidates({ rows, provenance: POOL_PROVENANCE, subjectDurationMs: 300_000 });
    expect(selection.selected.map((entry) => entry.reportCode)).toEqual(["OTHR", "SAME"]);
    expect(selection.ineligible).toEqual([
      { reportCode: "SAME", fightId: 7, reason: "DUPLICATE_PULL_COORDINATE" },
    ]);
  });

  it("deduplicates by coordinate rather than by player name", () => {
    // Same player name, two DIFFERENT pulls. Both survive.
    const rows = decodedRows(
      rankingPayload([
        rankingRow({ code: "AAAA", fightID: 1, durationMs: 300_000, name: "Samename" }),
        rankingRow({ code: "BBBB", fightID: 2, durationMs: 300_000, name: "Samename" }),
      ]),
    ).rows;
    const selection = selectCandidates({ rows, provenance: POOL_PROVENANCE, subjectDurationMs: 300_000 });
    expect(selection.selected).toHaveLength(2);
    expect(selection.ineligible).toEqual([]);
  });

  it("keeps a valid empty pool distinct from a decoder failure", () => {
    const selection = selectCandidates({ rows: [], provenance: POOL_PROVENANCE, subjectDurationMs: 1 });
    expect(selection.selected).toEqual([]);
    expect(selection.provenance.rowsDecoded).toBe(0);
    // And the provenance still records what was asked, so "empty" is legible.
    expect(selection.provenance.source).toBe(RANKINGS_DERIVED_REFERENCE_POOL);
  });

  it("names the pool without claiming representativeness", () => {
    const serialized = JSON.stringify(selectFrom([["AAAA", 1, 300_000]]).provenance).toLowerCase();
    for (const banned of [
      "representative",
      "typical",
      "average",
      "consensus",
      "normal",
      "expected",
      "peer",
    ]) {
      expect(serialized, `provenance claims ${banned}`).not.toContain(banned);
    }
    expect(serialized).toContain("rankings_derived_reference_pool");
  });
});

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

describe("source resolution requires a unique match", () => {
  function actorsOf(entries: readonly Record<string, unknown>[]) {
    return normalizeActors(entries).actors;
  }

  it("resolves exactly one name-and-server match", () => {
    const actors = actorsOf([
      { id: 25, name: "Refplayer", server: "Testrealm", type: "Player", subType: "Rogue" },
      { id: 26, name: "Other", server: "Testrealm", type: "Player", subType: "Mage" },
    ]);
    const result = resolveSourceActor(actors, descriptorFor({ code: "A", fightId: 1 }));
    expect(result).toEqual({ kind: "RESOLVED", sourceId: 25, basis: "NAME_AND_SERVER" });
  });

  it("disambiguates two same-named players by server", () => {
    const actors = actorsOf([
      { id: 25, name: "Refplayer", server: "Testrealm", type: "Player", subType: "Rogue" },
      { id: 31, name: "Refplayer", server: "Otherrealm", type: "Player", subType: "Rogue" },
    ]);
    const result = resolveSourceActor(actors, descriptorFor({ code: "A", fightId: 1 }));
    expect(result).toEqual({ kind: "RESOLVED", sourceId: 25, basis: "NAME_AND_SERVER" });
  });

  it("reports zero matches as UNRESOLVED", () => {
    const actors = actorsOf([{ id: 25, name: "Someoneelse", type: "Player", subType: "Rogue" }]);
    expect(resolveSourceActor(actors, descriptorFor({ code: "A", fightId: 1 })).kind).toBe("UNRESOLVED");
  });

  it("reports multiple same-name same-server matches as AMBIGUOUS, never the first", () => {
    const actors = actorsOf([
      { id: 25, name: "Refplayer", server: "Testrealm", type: "Player", subType: "Rogue" },
      { id: 31, name: "Refplayer", server: "Testrealm", type: "Player", subType: "Rogue" },
    ]);
    const result = resolveSourceActor(actors, descriptorFor({ code: "A", fightId: 1 }));
    expect(result).toEqual({ kind: "AMBIGUOUS", matchCount: 2 });
  });

  it("falls back to a unique name-only match when the row carried no server", () => {
    const actors = actorsOf([
      { id: 25, name: "Refplayer", server: "Testrealm", type: "Player", subType: "Rogue" },
    ]);
    const result = resolveSourceActor(actors, descriptorFor({ code: "A", fightId: 1, serverName: null }));
    expect(result).toEqual({ kind: "RESOLVED", sourceId: 25, basis: "NAME_ONLY" });
  });

  it("reports ambiguity rather than guessing when only a name is available", () => {
    const actors = actorsOf([
      { id: 25, name: "Refplayer", server: "A", type: "Player", subType: "Rogue" },
      { id: 31, name: "Refplayer", server: "B", type: "Player", subType: "Rogue" },
    ]);
    const result = resolveSourceActor(actors, descriptorFor({ code: "A", fightId: 1, serverName: null }));
    expect(result).toEqual({ kind: "AMBIGUOUS", matchCount: 2 });
  });

  it("never matches a pet or NPC sharing the name", () => {
    const actors = actorsOf([
      { id: 90, name: "Refplayer", server: "Testrealm", type: "NPC", subType: "Boss" },
      { id: 91, name: "Refplayer", server: "Testrealm", type: "Pet", subType: "Pet", petOwner: 25 },
    ]);
    expect(resolveSourceActor(actors, descriptorFor({ code: "A", fightId: 1 })).kind).toBe("UNRESOLVED");
  });
});

// ---------------------------------------------------------------------------
// Qualification
// ---------------------------------------------------------------------------

describe("candidate qualification establishes identity, not comparability", () => {
  function qualify(options: Parameters<typeof candidateReport>[0] | null, descriptorOverrides = {}) {
    return qualifyCandidate({
      descriptor: descriptorFor({ code: "AAAA", fightId: 22, ...descriptorOverrides }),
      report: options === null ? null : candidateReport(options),
      expectedEncounterId: ENCOUNTER_ID,
      expectedDifficulty: DIFFICULTY,
      subject: subjectPull(),
    });
  }

  it("qualifies an accessible candidate and preserves its typed facts", () => {
    const result = qualify({ code: "AAAA", fightId: 22 });
    expect(result.outcome).toBe("QUALIFIED");
    if (result.outcome !== "QUALIFIED") return;
    expect(result.reference.provenance.reportRevision).toBe(22);
    expect(result.reference.provenance.sourceId).toBe(25);
    expect(result.reference.encounterId).toBe(ENCOUNTER_ID);
    // M8-C outcome facts, carried raw and unscaled.
    expect(result.reference.encounterFacts.bossPercentageRaw).toBe(0.04);
    expect(result.reference.encounterFacts.lastPhase).toBe(1);
    expect(result.reference.encounterFacts.lastPhaseAsAbsoluteIndex).toBe(4);
    expect(result.reference.zone?.id).toBe(53);
  });

  it.each([
    ["an inaccessible report", null, "REPORT_NOT_ACCESSIBLE"],
    [
      "an archived inaccessible report",
      { code: "AAAA", fightId: 22, archiveStatus: { isArchived: true, isAccessible: false, archiveDate: 1 } },
      "REPORT_ARCHIVED_INACCESSIBLE",
    ],
    ["a missing fight", { code: "AAAA", fightId: 22, fights: [] }, "FIGHT_NOT_FOUND"],
    ["an encounter mismatch", { code: "AAAA", fightId: 22, encounterId: 2900 }, "ENCOUNTER_MISMATCH"],
    ["a difficulty mismatch", { code: "AAAA", fightId: 22, difficulty: 5 }, "DIFFICULTY_MISMATCH"],
    [
      "an unresolvable source",
      { code: "AAAA", fightId: 22, actors: [{ id: 9, name: "Nobody", type: "Player", subType: "Rogue" }] },
      "SOURCE_UNRESOLVED",
    ],
    [
      "an ambiguous source",
      {
        code: "AAAA",
        fightId: 22,
        actors: [
          { id: 25, name: "Refplayer", server: "Testrealm", type: "Player", subType: "Rogue" },
          { id: 26, name: "Refplayer", server: "Testrealm", type: "Player", subType: "Rogue" },
        ],
      },
      "SOURCE_AMBIGUOUS",
    ],
  ])("fails a candidate with %s", (_label, options, reason) => {
    const result = qualify(options as Parameters<typeof candidateReport>[0] | null);
    expect(result.outcome).toBe("FAILED");
    if (result.outcome !== "FAILED") return;
    expect(result.reason).toBe(reason);
    expect(result.reportCode).toBe("AAAA");
    expect(result.fightId).toBe(22);
  });

  it("never carries a source id without a unique match", () => {
    const result = qualify({
      code: "AAAA",
      fightId: 22,
      actors: [{ id: 9, name: "Nobody", type: "Player", subType: "Rogue" }],
    });
    expect(JSON.stringify(result)).not.toContain("sourceId");
  });

  it("records no wall clock or generated identifier", () => {
    const result = qualify({ code: "AAAA", fightId: 22 });
    const serialized = JSON.stringify(result).toLowerCase();
    for (const banned of ["retrievedat", "timestamp", "uuid", "requestid", "wallclock"]) {
      expect(serialized, `provenance carried ${banned}`).not.toContain(banned);
    }
  });
});

// ---------------------------------------------------------------------------
// Comparability stays fail-closed
// ---------------------------------------------------------------------------

describe("a qualified external reference is still not proven comparable", () => {
  function comparabilityOf(overrides: Parameters<typeof candidateReport>[0]) {
    const result = qualifyCandidate({
      descriptor: descriptorFor({ code: "AAAA", fightId: 22 }),
      report: candidateReport(overrides),
      expectedEncounterId: ENCOUNTER_ID,
      expectedDifficulty: DIFFICULTY,
      subject: subjectPull(),
    });
    if (result.outcome !== "QUALIFIED") throw new Error(`not qualified: ${result.reason}`);
    return result.reference.comparability;
  }

  it("returns UNKNOWN across reports even when everything else matches", () => {
    // Same encounter, same difficulty, same gameVersion and logVersion, source
    // resolved, duration nearby, partition requested. Still UNKNOWN, because
    // cross-report version semantics remain unproven in M8-B.
    const assessment = comparabilityOf({ code: "AAAA", fightId: 22 });
    expect(assessment.comparability).toBe("UNKNOWN");
    expect(assessment.unresolvedDimensions).toEqual(["version"]);
    expect(assessment.version.basis).toBe("FIELD_SEMANTICS_UNPROVEN");
  });

  it("still returns UNKNOWN when encounter and difficulty are identical", () => {
    expect(comparabilityOf({ code: "AAAA", fightId: 22 }).encounter.compatibility).toBe("COMPATIBLE");
    expect(comparabilityOf({ code: "AAAA", fightId: 22 }).difficulty.compatibility).toBe("COMPATIBLE");
    expect(comparabilityOf({ code: "AAAA", fightId: 22 }).comparability).toBe("UNKNOWN");
  });

  it("discloses the external report as a caveat", () => {
    expect(comparabilityOf({ code: "AAAA", fightId: 22 }).caveats).toContain("EXTERNAL_REPORT");
  });

  it("has no external-specific compatibility bypass", () => {
    // The only COMPATIBLE basis is SAME_REPORT_REVISION, which by definition
    // cannot apply to an external report.
    const assessment = comparabilityOf({ code: "AAAA", fightId: 22 });
    expect(assessment.version.compatibility).not.toBe("COMPATIBLE");
  });
});
