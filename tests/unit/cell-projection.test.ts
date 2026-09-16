/**
 * The one spec-aware boundary: turning a single-fight analysis into a cell.
 *
 * WHAT THIS FILE DEFENDS
 *
 * Two things, and they pull in opposite directions.
 *
 * WHAT SURVIVES must be enough to aggregate honestly — counts that reconcile,
 * provenance that makes two pulls comparable, and recurrence patterns already
 * separated by what they mean.
 *
 * WHAT DIES must include every debugging internal and every piece of bulk
 * evidence. `rawBlocker` is the engine's note about where a scan stopped;
 * `observedActionRejected` is a boolean over a three-state judgement whose
 * `false` means "not proven", not "no". Either one surfacing in an aggregate
 * would let an internal become a claim.
 *
 * And the projection must never manufacture a zero. A player whose spec this
 * build cannot analyze has no counts — not `match: 0` — because a zero read as
 * an observation says somebody looked.
 */

import { describe, expect, it } from "vitest";

import {
  absentCell,
  analysisUnavailableCell,
  toPlayerFightCell,
} from "../../src/aggregation/cell-projection.js";
import {
  analyzedFightAnalysis,
  comparison,
  excludedCast,
  nonAnalyzedFightAnalysis,
  NORMALIZATION_REVISION,
  REPORT_CODE,
} from "../support/aggregation-fixture.js";

const ROGUE = 19;

function project(analysis: Parameters<typeof toPlayerFightCell>[0]["analysis"]) {
  const projection = toPlayerFightCell({ analysis, normalizationRevision: NORMALIZATION_REVISION });
  if (!projection.ok) throw new Error(`projection failed: ${projection.reason}`);
  return projection.cell;
}

describe("projecting an ANALYZED analysis", () => {
  const cell = project(
    analyzedFightAnalysis({
      fightId: 1,
      sourceId: ROGUE,
      comparisons: [
        comparison({
          ordinal: 0,
          outcome: "MATCH",
          basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
          observedToken: "garrote",
          selectionPrecision: "EXACT_ENTRY",
          authorityCoverage: "EXACT_ENTRY",
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
          decisiveBlocker: "PREDICTIVE_STATE",
        }),
      ],
      excluded: [excludedCast({ reason: "EXECUTION_LANE_NOT_ESTABLISHED", abilityGameId: 1329 })],
    }),
  );

  it("carries identity keyed by source id, never by name", () => {
    expect(cell.kind).toBe("ANALYZED");
    expect(cell.fightId).toBe(1);
    expect(cell.sourceId).toBe(ROGUE);
    expect(cell.playerKey).toBe(`${REPORT_CODE}:19`);
  });

  it("carries integer counts that reconcile", () => {
    if (cell.kind !== "ANALYZED") throw new Error("expected ANALYZED");
    expect(cell.counts.eligibleDecisions).toBe(3);
    expect(cell.counts.match).toBe(1);
    expect(cell.counts.rejected).toBe(1);
    expect(cell.counts.unknown).toBe(1);
    expect(cell.counts.resolvedComparisons).toBe(2);
    expect(cell.counts.excludedCastCount).toBe(1);
    expect(cell.counts.match + cell.counts.rejected + cell.counts.unknown).toBe(
      cell.counts.eligibleDecisions,
    );
  });

  it("carries the provenance that makes two pulls comparable", () => {
    if (cell.kind !== "ANALYZED") throw new Error("expected ANALYZED");
    expect(cell.provenance).toEqual({
      analyzerId: "rogue-assassination-observed-decisions",
      specId: "rogue/assassination",
      normalizationRevision: NORMALIZATION_REVISION,
      authorityId: "simc-rogue-assassination",
      authorityArtifactRevision: "r1",
      authorityCommitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
    });
  });

  it("separates the three recurrence collections at the moment of extraction", () => {
    if (cell.kind !== "ANALYZED") throw new Error("expected ANALYZED");
    // Doing the split here is what makes merging them impossible downstream:
    // the aggregator never sees a decision, only three already-distinct lists.
    expect(cell.recurrence.rejectedPatterns).toEqual([
      { key: "envenom|OBSERVED_ACTION_REJECTED_BY_AUTHORITY", count: 1 },
    ]);
    expect(cell.recurrence.evidenceLimitations).toEqual([
      { key: "PREDICTIVE_STATE|AUTHORITY_SELECTION_UNRESOLVED", count: 1 },
    ]);
    expect(cell.recurrence.exclusionPatterns).toEqual([
      { key: "EXECUTION_LANE_NOT_ESTABLISHED|1329", count: 1 },
    ]);
  });

  it("gives MATCH no recurrence entry at all", () => {
    if (cell.kind !== "ANALYZED") throw new Error("expected ANALYZED");
    // Authority-compatible is not a pattern worth recurring on, and it is
    // emphatically not "correct".
    const everyKey = [
      ...cell.recurrence.rejectedPatterns,
      ...cell.recurrence.evidenceLimitations,
      ...cell.recurrence.exclusionPatterns,
    ].map((entry) => entry.key);
    expect(everyKey.some((key) => key.startsWith("garrote"))).toBe(false);
  });

  it("counts an UNKNOWN with no recorded blocker rather than dropping it", () => {
    const withoutBlocker = project(
      analyzedFightAnalysis({
        fightId: 1,
        sourceId: ROGUE,
        comparisons: [
          comparison({
            outcome: "UNKNOWN",
            basis: "AUTHORITY_SELECTION_UNRESOLVED",
            observedToken: "rupture",
            decisiveBlocker: null,
          }),
        ],
      }),
    );
    if (withoutBlocker.kind !== "ANALYZED") throw new Error("expected ANALYZED");
    expect(withoutBlocker.counts.unknown).toBe(1);
    expect(withoutBlocker.recurrence.evidenceLimitations).toEqual([
      { key: "NO_BLOCKER_RECORDED|AUTHORITY_SELECTION_UNRESOLVED", count: 1 },
    ]);
  });

  it("strips every internal that must never reach an aggregate", () => {
    // Serialized and swept, so a field added to the cell later is caught even if
    // nobody remembers to assert it by name.
    const serialized = JSON.stringify(cell);

    // Values that must never appear anywhere, at any depth.
    for (const forbidden of [
      "LEAKED_RAW_BLOCKER",
      "OBSERVED_EXECUTION",
      "PLAYER_CONTEXT",
      "ingestionOrdinal",
      "coveredRanges",
      "actorScope",
    ]) {
      expect(serialized, `cell leaked ${forbidden}`).not.toContain(forbidden);
    }

    // Keys matched as JSON keys rather than substrings: `excludedCastCount` and
    // `exclusions` are the aggregated FACTS and must survive, while the arrays
    // they were counted from must not.
    for (const key of [
      "rawBlocker",
      "observedActionRejected",
      "usabilityProvenance",
      "locator",
      "streamId",
      "targetActorId",
      "comparisons",
      "excluded",
      "scope",
      "authorityCoverage",
      "decisiveBlocker",
    ]) {
      expect(serialized, `cell leaked key ${key}`).not.toContain(`"${key}":`);
    }

    // And the counts that SHOULD have survived did.
    expect(serialized).toContain('"excludedCastCount":1');
    expect(serialized).toContain('"exclusions":');
  });

  it("retains no decision or excluded-cast arrays, so the analysis can be released", () => {
    // The memory reason this boundary exists: 456 KB per fight collapses to a
    // few dozen integers and a handful of short keys.
    expect(JSON.stringify(cell).length).toBeLessThan(2000);
  });
});

describe("projecting a valid non-ANALYZED status", () => {
  it.each([
    "SPEC_NOT_SUPPORTED",
    "AUTHORITY_NOT_AVAILABLE",
    "PROFILE_NOT_RESOLVED",
    "INSUFFICIENT_EVIDENCE",
  ] as const)("%s carries its status and detail but NO counts", (status) => {
    const cell = project(nonAnalyzedFightAnalysis({ fightId: 1, sourceId: ROGUE, status }));

    expect(cell.kind).toBe("NOT_ANALYZED");
    if (cell.kind !== "NOT_ANALYZED") return;
    expect(cell.status).toBe(status);
    expect(cell.detail.length).toBeGreaterThan(0);

    // THE REGRESSION. A zeroed counts object reads as "did nothing right",
    // which is a claim nobody made. The field does not exist.
    expect(cell).not.toHaveProperty("counts");
    expect(cell).not.toHaveProperty("recurrence");
    expect(JSON.stringify(cell)).not.toContain("match");
  });

  it("keeps the M6 vocabulary rather than inventing a failure word", () => {
    const cell = project(
      nonAnalyzedFightAnalysis({ fightId: 1, sourceId: ROGUE, status: "SPEC_NOT_SUPPORTED" }),
    );
    const serialized = JSON.stringify(cell);
    for (const invented of ["FAILED", "BAD", "CLEAN", "SUCCESSFUL"]) {
      expect(serialized).not.toContain(invented);
    }
  });
});

describe("cells that have no analysis object at all", () => {
  it("ABSENT carries no spec, no status and no counts", () => {
    const cell = absentCell({ fightId: 2, reportCode: REPORT_CODE, sourceId: ROGUE });

    expect(cell.kind).toBe("ABSENT");
    expect(cell.playerKey).toBe(`${REPORT_CODE}:19`);
    // A player who was not there played nothing. Recording a specialization
    // would invent participation.
    expect(cell).not.toHaveProperty("specName");
    expect(cell).not.toHaveProperty("counts");
    expect(cell).not.toHaveProperty("status");
  });

  it("ANALYSIS_UNAVAILABLE keeps the player present but manufactures no decisions", () => {
    const cell = analysisUnavailableCell({
      fightId: 3,
      reportCode: REPORT_CODE,
      sourceId: ROGUE,
      specName: "Assassination",
      reason: "FIGHT_INGESTION_FAILED",
    });

    expect(cell.kind).toBe("ANALYSIS_UNAVAILABLE");
    if (cell.kind !== "ANALYSIS_UNAVAILABLE") return;
    expect(cell.reason).toBe("FIGHT_INGESTION_FAILED");
    // They WERE in the pull — that is why this is not ABSENT — and no analyzer
    // ran, which is why there are no counts and, crucially, no UNKNOWN
    // decisions standing in for a retrieval failure.
    expect(cell.specName).toBe("Assassination");
    expect(cell).not.toHaveProperty("counts");
    expect(JSON.stringify(cell)).not.toContain("UNKNOWN");
  });
});

describe("the projection fails closed rather than aggregating nonsense", () => {
  it("refuses counts that do not reconcile", () => {
    const analysis = analyzedFightAnalysis({
      fightId: 1,
      sourceId: ROGUE,
      comparisons: [
        comparison({
          outcome: "MATCH",
          basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
          observedToken: "garrote",
          selectionPrecision: "EXACT_ENTRY",
        }),
      ],
    });
    // Corrupt one number in the VIEW the projection reads. An aggregate
    // multiplies any defect by the number of cells, and a total is exactly
    // where a reader stops questioning the parts.
    if (analysis.observedDecisions === null) throw new Error("expected a view");
    const corrupted = {
      ...analysis,
      observedDecisions: {
        ...analysis.observedDecisions,
        coverage: { ...analysis.observedDecisions.coverage, match: 5 },
      },
    } satisfies typeof analysis;

    const projection = toPlayerFightCell({
      analysis: corrupted,
      normalizationRevision: NORMALIZATION_REVISION,
    });
    expect(projection.ok).toBe(false);
    if (projection.ok) return;
    expect(projection.reason).toBe("COUNTS_DO_NOT_RECONCILE");
  });

  it("refuses an ANALYZED result that names no analyzer", () => {
    const analysis = analyzedFightAnalysis({ fightId: 1, sourceId: ROGUE, comparisons: [] });
    const projection = toPlayerFightCell({
      analysis: { ...analysis, analyzerId: null },
      normalizationRevision: NORMALIZATION_REVISION,
    });
    // Guessing provenance would silently make two incomparable pulls look
    // comparable.
    expect(projection.ok).toBe(false);
    if (projection.ok) return;
    expect(projection.reason).toBe("ANALYZED_WITHOUT_ANALYZER");
  });
});
