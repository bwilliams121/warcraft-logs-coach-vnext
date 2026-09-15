/**
 * The public raid-night contract.
 *
 * WHAT THESE TESTS DEFEND
 *
 * A public contract is where internal honesty either survives or quietly stops
 * mattering. The specific ways it stops mattering here:
 *
 *   a cell kind is flattened into one nullable-everything object, and ABSENT
 *     becomes indistinguishable from "analyzed, found nothing"
 *   the three recurrence collections merge into `issues[]`, turning the
 *     analyzer's own limits into somebody's mistakes
 *   `capability` is retyped as a second literal that can drift from M6's
 *   a percentage appears, because two integers were sitting right there
 *   single-fight documents get nested, and a summary becomes tens of megabytes
 *
 * Every one produces a well-formed payload. So each is a test.
 */

import { describe, expect, it } from "vitest";

import {
  PublicRaidNightResultSchema,
  PUBLIC_ANALYSIS_UNAVAILABLE_REASONS,
  PUBLIC_BATCH_FAILURE_REASONS,
  PUBLIC_CELL_KINDS,
  PUBLIC_COMPARABILITY_VALUES,
  PUBLIC_FIGHT_PROCESSING_OUTCOMES,
  PUBLIC_NON_ANALYZED_STATUSES,
  PUBLIC_RAID_NIGHT_SCHEMA_VERSION,
  PUBLIC_RAID_NIGHT_STATUSES,
  type PublicRaidNightResult,
} from "../../src/contracts/raid-night-contract.js";
import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import { CAPABILITY } from "../../src/contracts/analysis-contract.js";
import {
  ANALYSIS_UNAVAILABLE_REASONS,
  NON_ANALYZED_STATUSES,
  PLAYER_FIGHT_RESULT_KINDS,
} from "../../src/aggregation/cell.js";
import {
  BATCH_FAILURE_REASONS,
  COMPARABILITY_VALUES,
  FIGHT_PROCESSING_OUTCOMES,
  RAID_NIGHT_STATUSES,
} from "../../src/aggregation/raid-night.js";
import {
  absent,
  aggregateOf,
  analyzedCell,
  comparison,
  excludedCast,
  hundredCellAggregate,
  notAnalyzedCell,
  REPORT_CODE,
  rosterFightFor,
  rosterPlayerFor,
  unavailable,
} from "../support/raid-night-fixture.js";

const ROGUE = 19;
const PALADIN = 7;
/** Actor id `0` is a real id in this data, never a falsy placeholder. */
const ZERO_ID = 0;

/** A mixed night: every cell kind, a spec change, a missing fight, a failed fight. */
function mixedNight(): PublicRaidNightResult {
  const aggregate = aggregateOf({
    players: [
      rosterPlayerFor({ sourceId: ZERO_ID, name: "SameName" }),
      rosterPlayerFor({ sourceId: PALADIN, name: "SameName", className: "Paladin" }),
      rosterPlayerFor({ sourceId: ROGUE, name: "Sneaky" }),
    ],
    fights: [
      rosterFightFor({
        fightId: 1,
        participants: [
          { sourceId: ZERO_ID, specName: "Assassination" },
          { sourceId: PALADIN, specName: "Protection" },
          { sourceId: ROGUE, specName: "Assassination" },
        ],
      }),
      rosterFightFor({
        fightId: 2,
        participants: [
          { sourceId: ZERO_ID, specName: "Assassination" },
          { sourceId: ROGUE, specName: "Outlaw" },
        ],
      }),
    ],
    requestedFightIds: [1, 2, 3],
    fightOutcomes: [
      { fightId: 1, outcome: "INGESTED" },
      { fightId: 2, outcome: "INGESTION_FAILED" },
    ],
    cells: [
      analyzedCell({
        fightId: 1,
        sourceId: ZERO_ID,
        comparisons: [
          comparison({
            ordinal: 0,
            outcome: "MATCH",
            basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
            observedToken: "garrote",
            selectionPrecision: "EXACT_ENTRY",
          }),
          comparison({
            ordinal: 1,
            outcome: "REJECTED",
            basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
            observedToken: "envenom",
          }),
          comparison({
            ordinal: 2,
            outcome: "UNKNOWN",
            basis: "AUTHORITY_SELECTION_UNRESOLVED",
            observedToken: "deathmark",
            decisiveBlocker: "OBSERVED_STATE_MISSING",
          }),
        ],
        excluded: [excludedCast({ reason: "NON_GCD_ACTION", abilityGameId: 5512 })],
      }),
      notAnalyzedCell({
        fightId: 1,
        sourceId: PALADIN,
        status: "SPEC_NOT_SUPPORTED",
        specName: "Protection",
      }),
      analyzedCell({ fightId: 1, sourceId: ROGUE }),
      unavailable(2, ZERO_ID),
      absent(2, PALADIN),
      unavailable(2, ROGUE, "Outlaw"),
    ],
  });
  return projectRaidNightResult(aggregate);
}

const MIXED = mixedNight();

function cellFor(result: PublicRaidNightResult, fightId: number, sourceId: number) {
  const cell = result.cells.find((entry) => entry.fightId === fightId && entry.sourceId === sourceId);
  if (cell === undefined) throw new Error(`no cell for ${String(fightId)}/${String(sourceId)}`);
  return cell;
}

// ---------------------------------------------------------------------------

describe("the projection produces a valid v1 raid-night document", () => {
  it("validates through the public schema", () => {
    expect(() => PublicRaidNightResultSchema.parse(MIXED)).not.toThrow();
  });

  it("carries exactly the canonical schema version", () => {
    expect(MIXED.schemaVersion).toBe("warcraft-logs-coach.raid-night/1");
    expect(PUBLIC_RAID_NIGHT_SCHEMA_VERSION).toBe("warcraft-logs-coach.raid-night/1");
  });

  it.each(["warcraft-logs-coach.raid-night/0", "warcraft-logs-coach.raid-night/2", "latest", ""])(
    "rejects schemaVersion %s",
    (version) => {
      expect(() => PublicRaidNightResultSchema.parse({ ...MIXED, schemaVersion: version })).toThrow();
    },
  );

  it("rejects a document with no schema version at all", () => {
    const { schemaVersion: _omitted, ...withoutVersion } = MIXED;
    expect(() => PublicRaidNightResultSchema.parse(withoutVersion)).toThrow();
  });

  it("rejects unknown top-level fields", () => {
    expect(() => PublicRaidNightResultSchema.parse({ ...MIXED, score: 42 })).toThrow();
  });

  it("publishes exactly the agreed top-level keys", () => {
    expect(Object.keys(MIXED).sort()).toEqual([
      "capability",
      "cells",
      "coverage",
      "fights",
      "identity",
      "partialFailures",
      "recurrence",
      "roster",
      "schemaVersion",
      "status",
      "trendEvidence",
    ]);
  });
});

describe("capability is M6's, not a second promise", () => {
  it("deep-equals the single-fight capability object", () => {
    // Imported, never retyped. A second literal could drift, and a raid night
    // would then promise something the single-fight product does not.
    expect(MIXED.capability).toEqual(CAPABILITY);
  });

  it("carries no raid-night-only capability field", () => {
    // The schema version identifies the aggregate contract. Bolting
    // `aggregatesRaidNight` onto the shared object would change what M6
    // publishes too.
    expect(Object.keys(MIXED.capability).sort()).toEqual(Object.keys(CAPABILITY).sort());
    expect(MIXED.capability.scoresPerformance).toBe(false);
    expect(MIXED.capability.matchMeaning).toBe("AUTHORITY_COMPATIBLE_ONLY");
    expect(MIXED.capability.unknownIsFirstClass).toBe(true);
  });
});

describe("public vocabularies match the internal domain exactly", () => {
  it.each([
    ["raid-night status", PUBLIC_RAID_NIGHT_STATUSES, RAID_NIGHT_STATUSES],
    ["cell kind", PUBLIC_CELL_KINDS, PLAYER_FIGHT_RESULT_KINDS],
    ["non-analyzed status", PUBLIC_NON_ANALYZED_STATUSES, NON_ANALYZED_STATUSES],
    ["analysis-unavailable reason", PUBLIC_ANALYSIS_UNAVAILABLE_REASONS, ANALYSIS_UNAVAILABLE_REASONS],
    ["fight processing outcome", PUBLIC_FIGHT_PROCESSING_OUTCOMES, FIGHT_PROCESSING_OUTCOMES],
    ["batch failure reason", PUBLIC_BATCH_FAILURE_REASONS, BATCH_FAILURE_REASONS],
    ["comparability", PUBLIC_COMPARABILITY_VALUES, COMPARABILITY_VALUES],
  ])("%s vocabulary has no missing or extra value", (_name, publicValues, internalValues) => {
    expect([...publicValues]).toEqual([...internalValues]);
  });

  it("uses the M6 analysis-status words rather than inventing failure vocabulary", () => {
    expect([...PUBLIC_NON_ANALYZED_STATUSES]).toEqual([
      "SPEC_NOT_SUPPORTED",
      "AUTHORITY_NOT_AVAILABLE",
      "PROFILE_NOT_RESOLVED",
      "INSUFFICIENT_EVIDENCE",
    ]);
  });
});

describe("cells stay discriminated on the wire", () => {
  it("publishes an ANALYZED cell with counts, provenance and a reference", () => {
    const cell = cellFor(MIXED, 1, ZERO_ID);
    expect(cell.kind).toBe("ANALYZED");
    if (cell.kind !== "ANALYZED") return;

    expect(cell.counts.eligibleDecisions).toBe(3);
    expect(cell.counts.match).toBe(1);
    expect(cell.counts.rejected).toBe(1);
    expect(cell.counts.unknown).toBe(1);
    expect(cell.provenance.analyzerId).toBe("rogue-assassination-observed-decisions");
    expect(cell.analysisRef).toEqual({ reportCode: REPORT_CODE, fightId: 1, sourceId: ZERO_ID });
  });

  it("publishes no decision or excluded-cast evidence inside a cell", () => {
    const cell = cellFor(MIXED, 1, ZERO_ID);
    const serialized = JSON.stringify(cell);
    for (const key of ["comparisons", "excluded", "decisions", "recurrence", "locator"]) {
      expect(serialized, `cell leaked key ${key}`).not.toContain(`"${key}":`);
    }
    // The counts that SHOULD survive did.
    expect(serialized).toContain('"excludedCastCount":1');
  });

  it.each([
    "SPEC_NOT_SUPPORTED",
    "AUTHORITY_NOT_AVAILABLE",
    "PROFILE_NOT_RESOLVED",
    "INSUFFICIENT_EVIDENCE",
  ] as const)(
    "publishes a NOT_ANALYZED cell for %s with status, detail and a reference but no counts",
    (status) => {
      const result = projectRaidNightResult(
        aggregateOf({
          players: [rosterPlayerFor({ sourceId: ROGUE })],
          fights: [
            rosterFightFor({
              fightId: 1,
              participants: [{ sourceId: ROGUE, specName: "Assassination" }],
            }),
          ],
          cells: [notAnalyzedCell({ fightId: 1, sourceId: ROGUE, status })],
        }),
      );

      const cell = cellFor(result, 1, ROGUE);
      expect(cell.kind).toBe("NOT_ANALYZED");
      if (cell.kind !== "NOT_ANALYZED") return;
      expect(cell.status).toBe(status);
      expect(cell.detail.length).toBeGreaterThan(0);
      expect(cell.analysisRef).toEqual({ reportCode: REPORT_CODE, fightId: 1, sourceId: ROGUE });
      // A zeroed counts object would read as "did nothing right".
      expect(cell).not.toHaveProperty("counts");
      expect(cell).not.toHaveProperty("provenance");
    },
  );

  it("publishes an ABSENT cell as identity only", () => {
    const cell = cellFor(MIXED, 2, PALADIN);
    expect(cell.kind).toBe("ABSENT");
    expect(Object.keys(cell).sort()).toEqual(["fightId", "kind", "playerKey", "sourceId"]);
    // No spec — a player who was not there played nothing. No reference — there
    // is no single-fight analysis to point at.
    expect(cell).not.toHaveProperty("specName");
    expect(cell).not.toHaveProperty("counts");
    expect(cell).not.toHaveProperty("status");
    expect(cell).not.toHaveProperty("analysisRef");
  });

  it("publishes ANALYSIS_UNAVAILABLE for a failed pull with its reason and nothing else", () => {
    const cell = cellFor(MIXED, 2, ROGUE);
    expect(cell.kind).toBe("ANALYSIS_UNAVAILABLE");
    if (cell.kind !== "ANALYSIS_UNAVAILABLE") return;

    expect(cell.reason).toBe("FIGHT_INGESTION_FAILED");
    expect(cell.specName).toBe("Outlaw");
    expect(cell).not.toHaveProperty("counts");
    // No reference: nothing was analyzed, so pointing at a document would imply
    // one that does not exist.
    expect(cell).not.toHaveProperty("analysisRef");
    // And never mapped onto a gameplay word.
    expect(JSON.stringify(cell)).not.toContain("UNKNOWN");
    expect(JSON.stringify(cell)).not.toContain("INSUFFICIENT_EVIDENCE");
  });

  it("publishes ANALYSIS_UNAVAILABLE for an unresolved specialization the same way", () => {
    // THE POINT OF THIS TEST. The two reasons are different kinds of fact — one
    // is a retrieval failure, the other is missing upstream identity — and the
    // cell kind is deliberately NOT infrastructure-only. What must be identical
    // is the STRUCTURE: whichever reason applies, no analyzer ran, so there is
    // nothing to say about gameplay.
    const result = projectRaidNightResult(
      aggregateOf({
        players: [rosterPlayerFor({ sourceId: ROGUE })],
        fights: [rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: null }] })],
        cells: [unavailable(1, ROGUE, null, "SPECIALIZATION_UNRESOLVED")],
      }),
    );

    const cell = cellFor(result, 1, ROGUE);
    expect(cell.kind).toBe("ANALYSIS_UNAVAILABLE");
    if (cell.kind !== "ANALYSIS_UNAVAILABLE") return;

    expect(cell.reason).toBe("SPECIALIZATION_UNRESOLVED");
    // Null, faithfully. A specialization that was never identified must not be
    // invented here, and must not become SPEC_NOT_SUPPORTED — that would assert
    // we knew what they played and lacked an analyzer for it.
    expect(cell.specName).toBeNull();
    expect(cell).not.toHaveProperty("counts");
    expect(cell).not.toHaveProperty("provenance");
    expect(cell).not.toHaveProperty("status");
    expect(cell).not.toHaveProperty("analysisRef");
    expect(JSON.stringify(cell)).not.toContain("UNKNOWN");
    expect(JSON.stringify(cell)).not.toContain("SPEC_NOT_SUPPORTED");
  });

  it("contributes no gameplay counts for an unresolved specialization", () => {
    const result = projectRaidNightResult(
      aggregateOf({
        players: [rosterPlayerFor({ sourceId: ROGUE })],
        fights: [rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: null }] })],
        cells: [unavailable(1, ROGUE, null, "SPECIALIZATION_UNRESOLVED")],
      }),
    );

    // Counted as what it is, and as nothing else. In particular it does not
    // become a SPEC_NOT_SUPPORTED coverage number, and it adds no denominator a
    // reader could compute a rate against.
    expect(result.coverage.cellsAnalysisUnavailable).toBe(1);
    expect(result.coverage.cellsSpecNotSupported).toBe(0);
    expect(result.coverage.cellsAbsent).toBe(0);
    expect(result.coverage.cellsAnalyzed).toBe(0);
    expect(result.coverage.eligibleDecisionsTotal).toBe(0);
    expect(result.coverage.unknownTotal).toBe(0);
    expect(result.coverage.matchTotal).toBe(0);
    expect(result.coverage.rejectedTotal).toBe(0);
    expect(result.status).toBe("NO_ANALYZED_CELLS");
  });
});

describe("invalid cell combinations are rejected by the schema", () => {
  function withCell(cell: unknown): unknown {
    return { ...MIXED, cells: [cell] };
  }

  const ABSENT = { kind: "ABSENT", fightId: 1, playerKey: `${REPORT_CODE}:19`, sourceId: 19 };
  const REF = { reportCode: REPORT_CODE, fightId: 1, sourceId: 19 };

  it("rejects ABSENT carrying counts", () => {
    expect(() =>
      PublicRaidNightResultSchema.parse(withCell({ ...ABSENT, counts: { eligibleDecisions: 0 } })),
    ).toThrow();
  });

  it("rejects ABSENT carrying a specialization", () => {
    expect(() =>
      PublicRaidNightResultSchema.parse(withCell({ ...ABSENT, specName: "Assassination" })),
    ).toThrow();
  });

  it("rejects ABSENT carrying an analysisRef", () => {
    expect(() => PublicRaidNightResultSchema.parse(withCell({ ...ABSENT, analysisRef: REF }))).toThrow();
  });

  it("rejects NOT_ANALYZED carrying counts", () => {
    const cell = cellFor(MIXED, 1, PALADIN);
    expect(() =>
      PublicRaidNightResultSchema.parse(withCell({ ...cell, counts: { eligibleDecisions: 0 } })),
    ).toThrow();
  });

  it("rejects ANALYSIS_UNAVAILABLE carrying counts or a reference", () => {
    const cell = cellFor(MIXED, 2, ROGUE);
    expect(() =>
      PublicRaidNightResultSchema.parse(withCell({ ...cell, counts: { eligibleDecisions: 0 } })),
    ).toThrow();
    expect(() => PublicRaidNightResultSchema.parse(withCell({ ...cell, analysisRef: REF }))).toThrow();
  });

  it("rejects ANALYZED without counts or without provenance", () => {
    const cell = cellFor(MIXED, 1, ZERO_ID);
    if (cell.kind !== "ANALYZED") throw new Error("fixture");
    const { counts: _counts, ...withoutCounts } = cell;
    const { provenance: _provenance, ...withoutProvenance } = cell;
    expect(() => PublicRaidNightResultSchema.parse(withCell(withoutCounts))).toThrow();
    expect(() => PublicRaidNightResultSchema.parse(withCell(withoutProvenance))).toThrow();
  });

  it("rejects an arbitrary extra field on any cell", () => {
    expect(() => PublicRaidNightResultSchema.parse(withCell({ ...ABSENT, rawBlocker: "leak" }))).toThrow();
  });

  it("rejects an unknown cell kind", () => {
    expect(() => PublicRaidNightResultSchema.parse(withCell({ ...ABSENT, kind: "PERFECT" }))).toThrow();
  });
});

describe("analysisRef is a truthful retrieval coordinate", () => {
  it("appears on exactly the variants a single-fight analysis exists for", () => {
    for (const cell of MIXED.cells) {
      const hasRef = Object.prototype.hasOwnProperty.call(cell, "analysisRef");
      const shouldHaveRef = cell.kind === "ANALYZED" || cell.kind === "NOT_ANALYZED";
      expect(hasRef, `${cell.kind} ref presence`).toBe(shouldHaveRef);
    }
  });

  it("is built from the aggregate's own identity and the cell's own ids", () => {
    for (const cell of MIXED.cells) {
      if (cell.kind !== "ANALYZED" && cell.kind !== "NOT_ANALYZED") continue;
      expect(cell.analysisRef.reportCode).toBe(MIXED.identity.reportCode);
      expect(cell.analysisRef.fightId).toBe(cell.fightId);
      expect(cell.analysisRef.sourceId).toBe(cell.sourceId);
    }
  });

  it("carries exactly the identifier triple and nothing more", () => {
    const cell = cellFor(MIXED, 1, ZERO_ID);
    if (cell.kind !== "ANALYZED") throw new Error("fixture");
    expect(Object.keys(cell.analysisRef).sort()).toEqual(["fightId", "reportCode", "sourceId"]);
    // Deliberately NOT a content hash or a pinned snapshot id: the single-fight
    // API cannot enforce immutable replay, so the contract does not claim it.
    expect(cell.analysisRef).not.toHaveProperty("reportRevision");
  });
});

describe("identity is the factual snapshot", () => {
  it("publishes the report revision and no invented identity", () => {
    expect(MIXED.identity.reportCode).toBe(REPORT_CODE);
    expect(MIXED.identity.reportRevision).toBe(30);
    expect(Object.keys(MIXED.identity).sort()).toEqual([
      "gameVersion",
      "includedFightIds",
      "logVersion",
      "reportCode",
      "reportEndTimeUnixMs",
      "reportRevision",
      "reportStartTimeUnixMs",
    ]);
  });

  it("carries no generated id, clock reading or single global provenance", () => {
    for (const forbidden of ["raidNightId", "requestId", "generatedAt", "authorityCommitSha"]) {
      expect(MIXED.identity).not.toHaveProperty(forbidden);
    }
    // Authority provenance lives per analyzed cell, because different specs may
    // use different artifacts.
    const cell = cellFor(MIXED, 1, ZERO_ID);
    if (cell.kind !== "ANALYZED") throw new Error("fixture");
    expect(cell.provenance.authorityCommitSha.length).toBeGreaterThan(0);
  });
});

describe("coverage stays integers", () => {
  it("publishes the proven complete matrix and its parts", () => {
    // 2 included fights x 3 roster players.
    expect(MIXED.coverage.cellsTotal).toBe(6);
    expect(MIXED.coverage.cellsAnalyzed).toBe(2);
    expect(MIXED.coverage.cellsSpecNotSupported).toBe(1);
    expect(MIXED.coverage.cellsAbsent).toBe(1);
    expect(MIXED.coverage.cellsAnalysisUnavailable).toBe(2);
    expect(MIXED.coverage.fightsRequested).toBe(3);
    expect(MIXED.coverage.fightsIncluded).toBe(2);
    expect(MIXED.coverage.fightsMissing).toBe(1);
    expect(MIXED.coverage.fightsFailed).toBe(1);
  });

  it("contains no fractional value anywhere in the document", () => {
    // A rate would have to be non-integer. Sweeping the whole payload catches
    // one appearing anywhere, not just where a reviewer thought to look.
    const walk = (value: unknown): void => {
      if (typeof value === "number") {
        expect(Number.isInteger(value), `non-integer ${String(value)}`).toBe(true);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value !== null && typeof value === "object") {
        Object.values(value).forEach(walk);
      }
    };
    walk(MIXED);
  });
});

describe("UNKNOWN stays first-class", () => {
  const result = projectRaidNightResult(
    aggregateOf({
      players: [rosterPlayerFor({ sourceId: ROGUE })],
      fights: [
        rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] }),
      ],
      cells: [
        analyzedCell({
          fightId: 1,
          sourceId: ROGUE,
          comparisons: [
            comparison({
              ordinal: 0,
              outcome: "MATCH",
              basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
              observedToken: "garrote",
              selectionPrecision: "EXACT_ENTRY",
            }),
            ...Array.from({ length: 10 }, (_, index) =>
              comparison({
                ordinal: index + 1,
                outcome: "UNKNOWN",
                basis: "AUTHORITY_SELECTION_UNRESOLVED",
                observedToken: "deathmark",
                decisiveBlocker: "OBSERVED_STATE_MISSING",
              }),
            ),
          ],
        }),
      ],
    }),
  );

  it("publishes ten UNKNOWNs as ten UNKNOWNs and zero rejections", () => {
    expect(result.coverage.unknownTotal).toBe(10);
    expect(result.coverage.rejectedTotal).toBe(0);
    expect(result.coverage.matchTotal).toBe(1);
    expect(result.coverage.resolvedComparisonsTotal).toBe(1);
  });

  it("routes them all to evidenceLimitations and leaves rejectedPatterns empty", () => {
    expect(result.recurrence.rejectedPatterns).toEqual([]);
    expect(result.recurrence.evidenceLimitations).toHaveLength(1);
    expect(result.recurrence.evidenceLimitations[0]?.occurrenceCount).toBe(10);
  });
});

describe("the three recurrence collections stay separate on the wire", () => {
  it("keeps REJECTED, UNKNOWN and exclusions apart", () => {
    expect(MIXED.recurrence.rejectedPatterns).toHaveLength(1);
    expect(MIXED.recurrence.evidenceLimitations).toHaveLength(1);
    expect(MIXED.recurrence.exclusionPatterns).toHaveLength(1);

    expect(MIXED.recurrence.rejectedPatterns[0]?.key).toBe("envenom|OBSERVED_ACTION_REJECTED_BY_AUTHORITY");
    expect(MIXED.recurrence.evidenceLimitations[0]?.key).toBe(
      "OBSERVED_STATE_MISSING|AUTHORITY_SELECTION_UNRESOLVED",
    );
    expect(MIXED.recurrence.exclusionPatterns[0]?.key).toBe("NON_GCD_ACTION|5512");
  });

  it("offers no merged issues collection", () => {
    expect(Object.keys(MIXED.recurrence).sort()).toEqual([
      "evidenceLimitations",
      "exclusionPatterns",
      "rejectedPatterns",
    ]);
  });

  it("publishes group facts with no severity, priority or threshold", () => {
    expect(Object.keys(MIXED.recurrence.rejectedPatterns[0] ?? {}).sort()).toEqual([
      "fightCount",
      "fightIds",
      "key",
      "occurrenceCount",
      "playerKeys",
    ]);
  });
});

describe("trend evidence is evidence, not a conclusion", () => {
  const result = projectRaidNightResult(
    aggregateOf({
      players: [rosterPlayerFor({ sourceId: ROGUE })],
      fights: [
        rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] }),
        rosterFightFor({ fightId: 2, participants: [{ sourceId: ROGUE, specName: "Outlaw" }] }),
      ],
      cells: [
        analyzedCell({ fightId: 1, sourceId: ROGUE }),
        notAnalyzedCell({
          fightId: 2,
          sourceId: ROGUE,
          status: "SPEC_NOT_SUPPORTED",
          specName: "Outlaw",
        }),
      ],
    }),
  );

  it("preserves a specialization change as DIFFERENT", () => {
    const comparability = result.trendEvidence.series[0]?.comparability[0];
    expect(comparability?.sameSpec).toBe("DIFFERENT");
  });

  it("reports UNKNOWN rather than false where provenance is missing", () => {
    // The second pull had no analyzer, so "same analyzer?" has no answer.
    const comparability = result.trendEvidence.series[0]?.comparability[0];
    expect(comparability?.sameAnalyzerId).toBe("UNKNOWN");
    expect(comparability?.sameAuthorityRevision).toBe("UNKNOWN");
    expect(comparability?.sameEncounter).toBe("SAME");
  });

  it("carries no direction label anywhere", () => {
    expect(JSON.stringify(result.trendEvidence)).not.toMatch(/improv|regress|better|worse|trendScore/i);
  });

  it("publishes the cell discriminant and joins for the rest", () => {
    // Counts live once, in `cells`. Publishing them again here would put two
    // copies of one fact on the wire.
    const point = result.trendEvidence.series[0]?.points[0];
    expect(point?.cellKind).toBe("ANALYZED");
    expect(point).not.toHaveProperty("cell");
    expect(point).not.toHaveProperty("counts");
  });
});

describe("a night with no analyzed cell discloses that", () => {
  const result = projectRaidNightResult(
    aggregateOf({
      players: [rosterPlayerFor({ sourceId: PALADIN, className: "Paladin" })],
      fights: [rosterFightFor({ fightId: 1, participants: [{ sourceId: PALADIN, specName: "Protection" }] })],
      cells: [
        notAnalyzedCell({
          fightId: 1,
          sourceId: PALADIN,
          status: "SPEC_NOT_SUPPORTED",
          specName: "Protection",
        }),
      ],
    }),
  );

  it("publishes NO_ANALYZED_CELLS with coverage explaining why", () => {
    expect(result.status).toBe("NO_ANALYZED_CELLS");
    expect(result.coverage.cellsAnalyzed).toBe(0);
    expect(result.coverage.cellsSpecNotSupported).toBe(1);
    expect(result.coverage.eligibleDecisionsTotal).toBe(0);
  });

  it("says nothing resembling clean play", () => {
    // Absence of analysis is not evidence of good play.
    expect(JSON.stringify(result)).not.toMatch(/clean|perfect|flawless|success|no mistakes/i);
  });
});

describe("identity survives the public projection", () => {
  it("keeps actor 0 throughout", () => {
    expect(MIXED.roster.map((player) => player.sourceId)).toEqual([ZERO_ID, PALADIN, ROGUE]);
    expect(cellFor(MIXED, 1, ZERO_ID).sourceId).toBe(ZERO_ID);
    expect(MIXED.trendEvidence.series.map((series) => series.sourceId)).toContain(ZERO_ID);
    const cell = cellFor(MIXED, 1, ZERO_ID);
    if (cell.kind !== "ANALYZED") throw new Error("fixture");
    expect(cell.analysisRef.sourceId).toBe(ZERO_ID);
  });

  it("keeps two players sharing a name distinct", () => {
    const sameName = MIXED.roster.filter((player) => player.name === "SameName");
    expect(sameName).toHaveLength(2);
    expect(sameName.map((player) => player.playerKey)).toEqual([`${REPORT_CODE}:0`, `${REPORT_CODE}:7`]);
  });
});

describe("partial failures stay fight-level and diagnostic-free", () => {
  it("publishes a missing requested fight and a failed ingestion", () => {
    expect(MIXED.partialFailures).toEqual([
      { fightId: 2, reason: "FIGHT_INGESTION_FAILED" },
      { fightId: 3, reason: "FIGHT_NOT_FOUND" },
    ]);
  });

  it("fabricates no fight summary or cell for the missing fight", () => {
    expect(MIXED.fights.map((fight) => fight.fightId)).toEqual([1, 2]);
    expect(MIXED.cells.every((cell) => cell.fightId !== 3)).toBe(true);
  });

  it("publishes no transport diagnostics", () => {
    const serialized = JSON.stringify(MIXED.partialFailures);
    for (const banned of ["httpStatus", "graphqlErrorCount", "stack", "message"]) {
      expect(serialized).not.toContain(banned);
    }
  });
});

describe("no internal or private field reaches the wire", () => {
  /**
   * Walks every key in the document.
   *
   * Exact key names, matched as whole tokens — not substrings. A naive
   * `/ratio/i` sweep would flag `durationMs`, which contains that letter
   * sequence and means nothing of the kind. The test protects semantics, not
   * spelling.
   */
  function everyKey(value: unknown, keys: Set<string> = new Set()): Set<string> {
    if (Array.isArray(value)) {
      value.forEach((entry) => everyKey(entry, keys));
      return keys;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        keys.add(key);
        everyKey(nested, keys);
      }
    }
    return keys;
  }

  const PUBLISHED_KEYS = everyKey(MIXED);

  const FORBIDDEN_KEYS = [
    // M6's permanent exclusions.
    "observedActionRejected",
    "rawBlocker",
    "blockedAt",
    "evidenceScope",
    "actorScope",
    "coveredRanges",
    "events",
    "malformedObservations",
    "httpStatus",
    "graphqlErrorCount",
    "rateLimit",
    "pointsSpentThisHour",
    "limitPerHour",
    "clientId",
    "clientSecret",
    "accessToken",
    // Internal structures that must not be republished.
    "comparisons",
    "excluded",
    "decisions",
    "recurrenceObservations",
    "cell",
    "scope",
    // Scoring vocabulary M15 owns.
    "score",
    "grade",
    "rank",
    "rating",
    "accuracy",
    "performanceScore",
    "parseQuality",
    "percentageCorrect",
    "successRate",
    "mistakeRate",
    "severity",
    "priority",
    "isRecurring",
    "improving",
    "regressing",
    "better",
    "worse",
    // Interpretive renames of the canonical counts.
    "correct",
    "correctCount",
    "mistakes",
    "neutral",
    "goodDecisions",
  ];

  it.each(FORBIDDEN_KEYS)("publishes no field named `%s`", (key) => {
    expect(PUBLISHED_KEYS.has(key)).toBe(false);
  });

  it("does not publish ingestion scope as gameplay meaning", () => {
    const serialized = JSON.stringify(MIXED);
    expect(serialized).not.toContain("PLAYER_CONTEXT");
    expect(serialized).not.toContain("FULL_RAID");
  });

  it("keeps the canonical count names", () => {
    // MATCH is authority-compatible only. Renaming it `correct` would assert
    // something the engine never said.
    expect(PUBLISHED_KEYS.has("match")).toBe(true);
    expect(PUBLISHED_KEYS.has("rejected")).toBe(true);
    expect(PUBLISHED_KEYS.has("unknown")).toBe(true);
  });
});

describe("the projection is deterministic and preserves canonical order", () => {
  it("produces byte-identical output from two equivalent aggregates", () => {
    expect(JSON.stringify(mixedNight())).toBe(JSON.stringify(MIXED));
  });

  it("inherits the aggregate's ordering rather than re-sorting", () => {
    expect(MIXED.fights.map((fight) => fight.fightId)).toEqual([1, 2]);
    expect(MIXED.roster.map((player) => player.sourceId)).toEqual([ZERO_ID, PALADIN, ROGUE]);
    expect(MIXED.cells.map((cell) => [cell.fightId, cell.sourceId])).toEqual([
      [1, ZERO_ID],
      [1, PALADIN],
      [1, ROGUE],
      [2, ZERO_ID],
      [2, PALADIN],
      [2, ROGUE],
    ]);
  });
});

describe("payload size stays in the architecture's intended range", () => {
  const result = projectRaidNightResult(hundredCellAggregate());
  const serialized = JSON.stringify(result);
  const bytes = new TextEncoder().encode(serialized).length;

  it("builds a representative 100-cell night", () => {
    expect(result.coverage.cellsTotal).toBe(100);
    expect(result.cells).toHaveLength(100);
    // A real mix, so the measurement is not of an empty document.
    expect(result.coverage.cellsAnalyzed).toBeGreaterThan(0);
    expect(result.coverage.cellsAbsent).toBeGreaterThan(0);
    expect(result.coverage.cellsSpecNotSupported).toBeGreaterThan(0);
    expect(result.coverage.cellsAnalysisUnavailable).toBeGreaterThan(0);
    expect(result.recurrence.rejectedPatterns.length).toBeGreaterThan(0);
    expect(result.trendEvidence.series).toHaveLength(10);
  });

  it("serializes well under the 1 MiB regression ceiling", () => {
    // A REGRESSION TRIPWIRE for this fixture, not a platform limit and not a
    // promise about every possible request. Nesting single-fight documents
    // instead of references would put this in the tens of megabytes.
    // eslint-disable-next-line no-console
    console.log(`  100-cell public raid-night payload: ${String(bytes)} bytes`);
    expect(bytes).toBeLessThan(1024 * 1024);
  });

  it("nests no single-fight document in any cell", () => {
    for (const key of ["comparisons", "excluded", "decisions", 'exclusions":[{"locator']) {
      expect(serialized, `payload leaked ${key}`).not.toContain(`"${key}":`);
    }
    // And no nested single-fight schema version.
    expect(serialized).not.toContain("warcraft-logs-coach.analysis/1");
  });
});
