/**
 * The pure raid-night aggregator.
 *
 * WHAT THESE TESTS DEFEND
 *
 * An aggregate is where individually-honest facts get a chance to become a
 * dishonest summary, and the ways that happens are specific:
 *
 *   a pull nobody analyzed contributes zeroes, which read as "did nothing right"
 *   an UNKNOWN gets folded into a miss, or quietly dropped
 *   the analyzer's own limits get summed alongside a player's rejections
 *   a night with no analysis at all reads as a clean night
 *   two pulls that shared nothing get compared anyway
 *
 * Every one produces a well-formed result, so every one needs a test rather than
 * review. The aggregator's job is counting and ordering; these prove it counts
 * only what it was given and orders by facts rather than by caller whim.
 */

import { describe, expect, it } from "vitest";

import {
  absentCell,
  analysisUnavailableCell,
  toPlayerFightCell,
} from "../../src/aggregation/cell-projection.js";
import { aggregateRaidNight } from "../../src/aggregation/roster-aggregator.js";
import {
  verifyRaidNightInput,
  type FightProcessingRecord,
  type RaidNightAnalysis,
} from "../../src/aggregation/raid-night.js";
import type { PlayerFightResult } from "../../src/aggregation/cell.js";
import type { RevisionCheck } from "../../src/wcl/report-revision.js";
import type { ReportRosterSnapshot } from "../../src/wcl/roster-snapshot.js";
import {
  analyzedFightAnalysis,
  comparison,
  excludedCast,
  nonAnalyzedFightAnalysis,
  NORMALIZATION_REVISION,
  REPORT_CODE,
  REVISION,
  rosterFightFor,
  rosterPlayerFor,
  snapshotFor,
} from "../support/aggregation-fixture.js";

const ROGUE = 19;
const PALADIN = 7;
/** Actor id `0` is a real id in this data, never a falsy placeholder. */
const ZERO_ID = 0;

const MATCHES: RevisionCheck = { outcome: "MATCHES", revision: REVISION };

function cellOf(analysis: Parameters<typeof toPlayerFightCell>[0]["analysis"]): PlayerFightResult {
  const projection = toPlayerFightCell({ analysis, normalizationRevision: NORMALIZATION_REVISION });
  if (!projection.ok) throw new Error(`projection failed: ${projection.reason}`);
  return projection.cell;
}

/** Aggregates through the verification gate, as every real caller must. */
function aggregate(options: {
  readonly snapshot: ReportRosterSnapshot;
  readonly cells: readonly PlayerFightResult[];
  readonly fightOutcomes?: readonly FightProcessingRecord[];
  readonly revisionCheck?: RevisionCheck;
}): RaidNightAnalysis {
  const fightOutcomes =
    options.fightOutcomes ??
    options.snapshot.identity.includedFightIds.map((fightId): FightProcessingRecord => ({
      fightId,
      outcome: "INGESTED",
    }));
  const verification = verifyRaidNightInput(options.revisionCheck ?? MATCHES, {
    snapshot: options.snapshot,
    fightOutcomes,
    cells: options.cells,
  });
  if (!verification.ok) throw new Error(`verification refused: ${verification.reason}`);
  return aggregateRaidNight(verification.verified);
}

// ---------------------------------------------------------------------------

describe("a mixed roster keeps every status distinct", () => {
  const snapshot = snapshotFor({
    players: [
      rosterPlayerFor({ sourceId: ROGUE, name: "Sneaky" }),
      rosterPlayerFor({ sourceId: PALADIN, name: "Blocky", className: "Paladin" }),
    ],
    fights: [
      rosterFightFor({
        fightId: 1,
        participants: [
          { sourceId: ROGUE, specName: "Assassination" },
          { sourceId: PALADIN, specName: "Protection" },
        ],
      }),
      rosterFightFor({ fightId: 2, participants: [{ sourceId: ROGUE, specName: "Assassination" }] }),
    ],
  });

  const result = aggregate({
    snapshot,
    cells: [
      cellOf(
        analyzedFightAnalysis({
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
        }),
      ),
      cellOf(
        nonAnalyzedFightAnalysis({
          fightId: 1,
          sourceId: PALADIN,
          status: "SPEC_NOT_SUPPORTED",
          specName: "Protection",
          className: "Paladin",
        }),
      ),
      cellOf(
        analyzedFightAnalysis({
          fightId: 2,
          sourceId: ROGUE,
          comparisons: [
            comparison({
              outcome: "MATCH",
              basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
              observedToken: "rupture",
              selectionPrecision: "EXACT_ENTRY",
            }),
          ],
        }),
      ),
      // The Paladin sat out pull 2. A FACT, not a performance.
      absentCell({ fightId: 2, reportCode: REPORT_CODE, sourceId: PALADIN }),
    ],
  });

  it("counts each cell kind separately without flattening", () => {
    expect(result.coverage.cellsTotal).toBe(4);
    expect(result.coverage.cellsAnalyzed).toBe(2);
    expect(result.coverage.cellsSpecNotSupported).toBe(1);
    expect(result.coverage.cellsAbsent).toBe(1);
  });

  it("does not let an unsupported spec or an absence contribute decision totals", () => {
    // The two analyzed cells contribute 1 eligible decision each, and nothing
    // else contributes a zero that could be read as an observation.
    expect(result.coverage.eligibleDecisionsTotal).toBe(2);
    expect(result.coverage.matchTotal).toBe(2);
    expect(result.coverage.rejectedTotal).toBe(0);
  });

  it("records the Paladin as one roster player who was present once and absent once", () => {
    const paladin = result.roster.find((player) => player.sourceId === PALADIN);
    expect(paladin?.fightsPresent).toBe(1);
    expect(paladin?.fightsAbsent).toBe(1);
    expect(paladin?.observedSpecNames).toEqual(["Protection"]);
  });

  it("is ANALYZED because at least one cell was", () => {
    expect(result.status).toBe("ANALYZED");
  });
});

describe("UNKNOWN stays first-class", () => {
  const snapshot = snapshotFor({
    players: [rosterPlayerFor({ sourceId: ROGUE })],
    fights: [rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] })],
  });

  const unknownHeavy = aggregate({
    snapshot,
    cells: [
      cellOf(
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
      ),
    ],
  });

  it("counts ten UNKNOWNs as ten UNKNOWNs and zero rejections", () => {
    expect(unknownHeavy.coverage.unknownTotal).toBe(10);
    expect(unknownHeavy.coverage.rejectedTotal).toBe(0);
    expect(unknownHeavy.coverage.matchTotal).toBe(1);
    expect(unknownHeavy.coverage.eligibleDecisionsTotal).toBe(11);
    // Never folded into a miss, never dropped, never neutral.
    expect(unknownHeavy.coverage.resolvedComparisonsTotal).toBe(1);
  });

  it("routes every UNKNOWN to evidence limitations, never to rejected patterns", () => {
    expect(unknownHeavy.recurrence.rejectedPatterns).toEqual([]);
    expect(unknownHeavy.recurrence.evidenceLimitations).toEqual([
      {
        key: "OBSERVED_STATE_MISSING|AUTHORITY_SELECTION_UNRESOLVED",
        occurrenceCount: 10,
        fightIds: [1],
        fightCount: 1,
        playerKeys: [`${REPORT_CODE}:19`],
      },
    ]);
  });
});

describe("the three recurrence collections never cross-contaminate", () => {
  const snapshot = snapshotFor({
    players: [rosterPlayerFor({ sourceId: ROGUE })],
    fights: [rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] })],
  });

  const result = aggregate({
    snapshot,
    cells: [
      cellOf(
        analyzedFightAnalysis({
          fightId: 1,
          sourceId: ROGUE,
          comparisons: [
            comparison({
              ordinal: 0,
              outcome: "REJECTED",
              basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
              observedToken: "envenom",
            }),
            comparison({
              ordinal: 1,
              outcome: "UNKNOWN",
              basis: "AUTHORITY_SELECTION_UNRESOLVED",
              observedToken: "deathmark",
              decisiveBlocker: "DIVERGENT_WORLDS",
            }),
          ],
          excluded: [excludedCast({ reason: "NON_GCD_ACTION", abilityGameId: 5512 })],
        }),
      ),
    ],
  });

  it("puts one item in each collection and nothing anywhere else", () => {
    // THE EPISTEMIC GATE. Only `rejectedPatterns` carries evidence about the
    // player; the other two report the analyzer's own limits. Summing them would
    // turn "we could not look" into "they played badly".
    expect(result.recurrence.rejectedPatterns).toHaveLength(1);
    expect(result.recurrence.evidenceLimitations).toHaveLength(1);
    expect(result.recurrence.exclusionPatterns).toHaveLength(1);

    expect(result.recurrence.rejectedPatterns[0]?.key).toBe("envenom|OBSERVED_ACTION_REJECTED_BY_AUTHORITY");
    expect(result.recurrence.evidenceLimitations[0]?.key).toBe(
      "DIVERGENT_WORLDS|AUTHORITY_SELECTION_UNRESOLVED",
    );
    expect(result.recurrence.exclusionPatterns[0]?.key).toBe("NON_GCD_ACTION|5512");
  });

  it("cannot let an UNKNOWN increment a rejected pattern", () => {
    const rejectedOccurrences = result.recurrence.rejectedPatterns.reduce(
      (total, group) => total + group.occurrenceCount,
      0,
    );
    expect(rejectedOccurrences).toBe(1);
    expect(result.coverage.rejectedTotal).toBe(1);
    expect(result.coverage.unknownTotal).toBe(1);
  });
});

describe("recurrence grouping across fights and players", () => {
  const snapshot = snapshotFor({
    players: [rosterPlayerFor({ sourceId: ROGUE }), rosterPlayerFor({ sourceId: ZERO_ID })],
    fights: [
      rosterFightFor({
        fightId: 1,
        participants: [
          { sourceId: ZERO_ID, specName: "Assassination" },
          { sourceId: ROGUE, specName: "Assassination" },
        ],
      }),
      rosterFightFor({ fightId: 2, participants: [{ sourceId: ROGUE, specName: "Assassination" }] }),
    ],
  });

  function rejection(fightId: number, sourceId: number, count: number) {
    return cellOf(
      analyzedFightAnalysis({
        fightId,
        sourceId,
        comparisons: Array.from({ length: count }, (_, index) =>
          comparison({
            ordinal: index,
            outcome: "REJECTED",
            basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
            observedToken: "envenom",
          }),
        ),
      }),
    );
  }

  const result = aggregate({
    snapshot,
    cells: [
      rejection(1, ROGUE, 2),
      rejection(1, ZERO_ID, 1),
      rejection(2, ROGUE, 3),
      // The matrix must be complete: actor 0 was not in pull 2.
      absentCell({ fightId: 2, reportCode: REPORT_CODE, sourceId: ZERO_ID }),
    ],
  });

  it("sums occurrences and records distinct ascending fight ids and player keys", () => {
    expect(result.recurrence.rejectedPatterns).toEqual([
      {
        key: "envenom|OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
        occurrenceCount: 6,
        fightIds: [1, 2],
        fightCount: 2,
        // Ascending by source id. Actor 0 sorts first because it is a real id.
        playerKeys: [`${REPORT_CODE}:0`, `${REPORT_CODE}:19`],
      },
    ]);
  });

  it("emits no threshold, severity or ranking field", () => {
    const group = result.recurrence.rejectedPatterns[0];
    expect(Object.keys(group ?? {}).sort()).toEqual([
      "fightCount",
      "fightIds",
      "key",
      "occurrenceCount",
      "playerKeys",
    ]);
  });
});

describe("missing requested fights fabricate nothing", () => {
  const snapshot = snapshotFor({
    players: [rosterPlayerFor({ sourceId: ROGUE })],
    fights: [rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] })],
    requestedFightIds: [1, 2, 3],
  });

  const result = aggregate({
    snapshot,
    cells: [
      cellOf(
        analyzedFightAnalysis({
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
        }),
      ),
    ],
  });

  it("records a fight-level failure for each missing id", () => {
    expect(result.partialFailures).toEqual([
      { fightId: 2, reason: "FIGHT_NOT_FOUND" },
      { fightId: 3, reason: "FIGHT_NOT_FOUND" },
    ]);
  });

  it("creates no fight summary and no player cell for a fight that does not exist", () => {
    expect(result.fights.map((fight) => fight.fightId)).toEqual([1]);
    expect(result.cells.map((cell) => cell.fightId)).toEqual([1]);
    // Not turned into an absence for everyone, and not zero-filled.
    expect(result.coverage.cellsAbsent).toBe(0);
  });

  it("keeps requested, included and missing visible and lets the rest aggregate", () => {
    expect(result.coverage.fightsRequested).toBe(3);
    expect(result.coverage.fightsIncluded).toBe(1);
    expect(result.coverage.fightsMissing).toBe(2);
    expect(result.coverage.cellsAnalyzed).toBe(1);
    expect(result.status).toBe("ANALYZED");
  });
});

describe("an ingestion failure invents no analysis", () => {
  const snapshot = snapshotFor({
    players: [rosterPlayerFor({ sourceId: ROGUE }), rosterPlayerFor({ sourceId: PALADIN })],
    fights: [
      rosterFightFor({
        fightId: 1,
        participants: [
          { sourceId: PALADIN, specName: "Protection" },
          { sourceId: ROGUE, specName: "Assassination" },
        ],
      }),
    ],
  });

  const result = aggregate({
    snapshot,
    fightOutcomes: [{ fightId: 1, outcome: "INGESTION_FAILED" }],
    cells: [
      analysisUnavailableCell({
        fightId: 1,
        reportCode: REPORT_CODE,
        sourceId: ROGUE,
        specName: "Assassination",
        reason: "FIGHT_INGESTION_FAILED",
      }),
      analysisUnavailableCell({
        fightId: 1,
        reportCode: REPORT_CODE,
        sourceId: PALADIN,
        specName: "Protection",
        reason: "FIGHT_INGESTION_FAILED",
      }),
    ],
  });

  it("creates an explicit fight-level failure, not player-level ones", () => {
    expect(result.partialFailures).toEqual([{ fightId: 1, reason: "FIGHT_INGESTION_FAILED" }]);
    expect(result.fights[0]?.processingOutcome).toBe("INGESTION_FAILED");
  });

  it("manufactures no UNKNOWN decisions and no zero-count analyzed cells", () => {
    // UNKNOWN is a real M5 outcome meaning the authority could not prove a
    // specific comparison. Using it to represent a retrieval failure would put
    // an infrastructure problem into the gameplay vocabulary.
    expect(result.coverage.cellsAnalyzed).toBe(0);
    expect(result.coverage.cellsAnalysisUnavailable).toBe(2);
    expect(result.coverage.unknownTotal).toBe(0);
    expect(result.coverage.eligibleDecisionsTotal).toBe(0);
  });

  it("preserves the factual fight and roster information", () => {
    expect(result.fights[0]?.participantCount).toBe(2);
    expect(result.fights[0]?.analyzedCount).toBe(0);
    expect(result.roster.map((player) => player.sourceId)).toEqual([PALADIN, ROGUE]);
  });

  it("does not read as a clean night", () => {
    expect(result.status).toBe("NO_ANALYZED_CELLS");
  });
});

describe("zero analyzed cells is a disclosed outcome", () => {
  it("reports NO_ANALYZED_CELLS when every spec is unsupported", () => {
    const snapshot = snapshotFor({
      players: [rosterPlayerFor({ sourceId: PALADIN, className: "Paladin" })],
      fights: [rosterFightFor({ fightId: 1, participants: [{ sourceId: PALADIN, specName: "Protection" }] })],
    });

    const result = aggregate({
      snapshot,
      cells: [
        cellOf(
          nonAnalyzedFightAnalysis({
            fightId: 1,
            sourceId: PALADIN,
            status: "SPEC_NOT_SUPPORTED",
            specName: "Protection",
            className: "Paladin",
          }),
        ),
      ],
    });

    // Absence of analysis is not evidence of good play, and a reader must be
    // able to tell this apart from "we looked and found nothing".
    expect(result.status).toBe("NO_ANALYZED_CELLS");
    expect(result.coverage.cellsAnalyzed).toBe(0);
    expect(result.coverage.cellsSpecNotSupported).toBe(1);
    expect(result.coverage.matchTotal).toBe(0);
    expect(result.recurrence.rejectedPatterns).toEqual([]);
  });
});

describe("a specialization change stays one player", () => {
  const snapshot = snapshotFor({
    players: [rosterPlayerFor({ sourceId: ROGUE })],
    fights: [
      rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] }),
      rosterFightFor({ fightId: 2, participants: [{ sourceId: ROGUE, specName: "Outlaw" }] }),
    ],
  });

  const result = aggregate({
    snapshot,
    cells: [
      cellOf(
        analyzedFightAnalysis({
          fightId: 1,
          sourceId: ROGUE,
          specName: "Assassination",
          comparisons: [
            comparison({
              outcome: "MATCH",
              basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
              observedToken: "garrote",
              selectionPrecision: "EXACT_ENTRY",
            }),
          ],
        }),
      ),
      cellOf(
        nonAnalyzedFightAnalysis({
          fightId: 2,
          sourceId: ROGUE,
          specName: "Outlaw",
          status: "SPEC_NOT_SUPPORTED",
        }),
      ),
    ],
  });

  it("keeps one roster player carrying both observed specializations", () => {
    expect(result.roster).toHaveLength(1);
    expect(result.roster[0]?.observedSpecNames).toEqual(["Assassination", "Outlaw"]);
    expect(result.roster[0]?.specChanged).toBe(true);
  });

  it("marks the specialization boundary DIFFERENT and labels nothing", () => {
    const comparability = result.trendEvidence.series[0]?.comparability[0];
    expect(comparability?.sameSpec).toBe("DIFFERENT");
    // No improvement, no regression, no direction anywhere in the object.
    expect(JSON.stringify(result.trendEvidence)).not.toMatch(/improv|regress|better|worse/i);
  });
});

describe("comparability is epistemically honest", () => {
  function twoPointSeries(secondCell: PlayerFightResult) {
    const snapshot = snapshotFor({
      players: [rosterPlayerFor({ sourceId: ROGUE })],
      fights: [
        rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] }),
        rosterFightFor({
          fightId: 2,
          participants: secondCell.kind === "ABSENT" ? [] : [{ sourceId: ROGUE, specName: "Assassination" }],
          encounterId: 2900,
          difficulty: 5,
        }),
      ],
    });
    const first = cellOf(
      analyzedFightAnalysis({
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
      }),
    );
    return aggregate({ snapshot, cells: [first, secondCell] }).trendEvidence.series[0]?.comparability[0];
  }

  it("reports SAME when two analyzed points share everything", () => {
    const comparability = twoPointSeries(
      cellOf(
        analyzedFightAnalysis({
          fightId: 2,
          sourceId: ROGUE,
          comparisons: [
            comparison({
              outcome: "MATCH",
              basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
              observedToken: "rupture",
              selectionPrecision: "EXACT_ENTRY",
            }),
          ],
        }),
      ),
    );
    expect(comparability?.sameSpec).toBe("SAME");
    expect(comparability?.sameAnalyzerId).toBe("SAME");
    expect(comparability?.sameAuthorityRevision).toBe("SAME");
    expect(comparability?.sameNormalizationRevision).toBe("SAME");
    expect(comparability?.sameEncounter).toBe("SAME");
  });

  it("reports DIFFERENT when two analyzed points used different authority artifacts", () => {
    const comparability = twoPointSeries(
      cellOf(
        analyzedFightAnalysis({
          fightId: 2,
          sourceId: ROGUE,
          artifactRevision: "r2",
          comparisons: [
            comparison({
              outcome: "MATCH",
              basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
              observedToken: "rupture",
              selectionPrecision: "EXACT_ENTRY",
            }),
          ],
        }),
      ),
    );
    expect(comparability?.sameAuthorityRevision).toBe("DIFFERENT");
  });

  it("reports UNKNOWN — not false — when one point was ABSENT", () => {
    const comparability = twoPointSeries(
      absentCell({ fightId: 2, reportCode: REPORT_CODE, sourceId: ROGUE }),
    );
    // THE CORRECTION TO THE EARLY BOOLEAN SKETCH. An absent pull had no
    // analyzer, so "did both use the same analyzer?" has no answer. `false`
    // would assert they used DIFFERENT ones — a claim about a comparison that
    // was never possible.
    expect(comparability?.sameAnalyzerId).toBe("UNKNOWN");
    expect(comparability?.sameAuthorityRevision).toBe("UNKNOWN");
    expect(comparability?.sameNormalizationRevision).toBe("UNKNOWN");
    expect(comparability?.sameSpec).toBe("UNKNOWN");
    // Encounter identity is a fight fact and is knowable regardless.
    expect(comparability?.sameEncounter).toBe("SAME");
  });

  it("reports UNKNOWN when analysis provenance is simply missing", () => {
    const comparability = twoPointSeries(
      cellOf(nonAnalyzedFightAnalysis({ fightId: 2, sourceId: ROGUE, status: "AUTHORITY_NOT_AVAILABLE" })),
    );
    expect(comparability?.sameAnalyzerId).toBe("UNKNOWN");
    expect(comparability?.sameAuthorityRevision).toBe("UNKNOWN");
    // The player WAS there and their spec is known, so this one is answerable.
    expect(comparability?.sameSpec).toBe("SAME");
  });
});

describe("identity survives the aggregate", () => {
  const snapshot = snapshotFor({
    players: [
      rosterPlayerFor({ sourceId: ZERO_ID, name: "SameName" }),
      rosterPlayerFor({ sourceId: ROGUE, name: "SameName" }),
    ],
    fights: [
      rosterFightFor({
        fightId: 1,
        participants: [
          { sourceId: ZERO_ID, specName: "Assassination" },
          { sourceId: ROGUE, specName: "Assassination" },
        ],
      }),
    ],
  });

  const result = aggregate({
    snapshot,
    cells: [ZERO_ID, ROGUE].map((sourceId) =>
      cellOf(
        analyzedFightAnalysis({
          fightId: 1,
          sourceId,
          name: "SameName",
          comparisons: [
            comparison({
              outcome: "REJECTED",
              basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
              observedToken: "envenom",
            }),
          ],
        }),
      ),
    ),
  });

  it("keeps actor 0 present everywhere it should be", () => {
    // A truthiness test anywhere on this path would erase this player.
    expect(result.cells.map((cell) => cell.sourceId)).toEqual([ZERO_ID, ROGUE]);
    expect(result.roster.map((player) => player.sourceId)).toEqual([ZERO_ID, ROGUE]);
    expect(result.trendEvidence.series.map((entry) => entry.sourceId)).toEqual([ZERO_ID, ROGUE]);
    expect(result.recurrence.rejectedPatterns[0]?.playerKeys).toContain(`${REPORT_CODE}:0`);
  });

  it("keeps two players sharing a name distinct throughout", () => {
    expect(result.roster.every((player) => player.name === "SameName")).toBe(true);
    expect(result.roster.map((player) => player.playerKey)).toEqual([
      `${REPORT_CODE}:0`,
      `${REPORT_CODE}:19`,
    ]);
    expect(result.recurrence.rejectedPatterns[0]?.playerKeys).toEqual([
      `${REPORT_CODE}:0`,
      `${REPORT_CODE}:19`,
    ]);
    expect(result.coverage.cellsAnalyzed).toBe(2);
  });
});

describe("coverage totals reconcile with their contributing cells", () => {
  it("equals the exact sum of ANALYZED cells and nothing else", () => {
    const snapshot = snapshotFor({
      players: [rosterPlayerFor({ sourceId: ROGUE }), rosterPlayerFor({ sourceId: PALADIN })],
      fights: [
        rosterFightFor({
          fightId: 1,
          participants: [
            { sourceId: PALADIN, specName: "Protection" },
            { sourceId: ROGUE, specName: "Assassination" },
          ],
        }),
      ],
    });

    const analyzed = cellOf(
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
          }),
          comparison({
            ordinal: 1,
            outcome: "REJECTED",
            basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
            observedToken: "envenom",
          }),
        ],
        excluded: [excludedCast({ reason: "NON_GCD_ACTION", abilityGameId: 5512 })],
      }),
    );

    const result = aggregate({
      snapshot,
      cells: [
        analyzed,
        cellOf(
          nonAnalyzedFightAnalysis({
            fightId: 1,
            sourceId: PALADIN,
            status: "SPEC_NOT_SUPPORTED",
            specName: "Protection",
          }),
        ),
      ],
    });

    if (analyzed.kind !== "ANALYZED") throw new Error("expected ANALYZED");
    expect(result.coverage.eligibleDecisionsTotal).toBe(analyzed.counts.eligibleDecisions);
    expect(result.coverage.matchTotal).toBe(analyzed.counts.match);
    expect(result.coverage.rejectedTotal).toBe(analyzed.counts.rejected);
    expect(result.coverage.unknownTotal).toBe(analyzed.counts.unknown);
    expect(result.coverage.excludedCastCountTotal).toBe(analyzed.counts.excludedCastCount);
    expect(result.coverage.matchTotal + result.coverage.rejectedTotal + result.coverage.unknownTotal).toBe(
      result.coverage.eligibleDecisionsTotal,
    );
  });
});

describe("the revision gate admits only a verified snapshot", () => {
  // A COMPLETE matrix, so these tests isolate the revision outcome rather than
  // tripping the topology validator for an unrelated reason.
  const facts = {
    snapshot: snapshotFor({
      players: [rosterPlayerFor({ sourceId: ROGUE })],
      fights: [
        rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] }),
      ],
    }),
    fightOutcomes: [{ fightId: 1, outcome: "INGESTED" }] as const,
    cells: [
      cellOf(
        analyzedFightAnalysis({
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
        }),
      ),
    ] as readonly PlayerFightResult[],
  };

  it("accepts MATCHES on the snapshot's own revision", () => {
    const verification = verifyRaidNightInput({ outcome: "MATCHES", revision: REVISION }, facts);
    expect(verification.ok).toBe(true);
    if (!verification.ok) return;
    expect(aggregateRaidNight(verification.verified).identity.reportRevision).toBe(REVISION);
  });

  it("refuses CHANGED", () => {
    const verification = verifyRaidNightInput(
      { outcome: "CHANGED", expected: REVISION, observed: 31 },
      facts,
    );
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.reason).toBe("REPORT_REVISION_CHANGED");
  });

  it("refuses UNVERIFIED rather than treating it as probably fine", () => {
    // A check that returned no answer establishes nothing. Accepting on
    // "probably unchanged" is exactly how a mixed-revision aggregate is built.
    const verification = verifyRaidNightInput(
      { outcome: "UNVERIFIED", cause: { kind: "REPORT_NOT_SERVED" } },
      facts,
    );
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.reason).toBe("REPORT_REVISION_UNVERIFIED");
  });

  it("refuses a MATCHES that confirmed some OTHER revision", () => {
    const verification = verifyRaidNightInput({ outcome: "MATCHES", revision: 99 }, facts);
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.reason).toBe("REPORT_REVISION_UNVERIFIED");
  });
});

describe("determinism", () => {
  it("produces byte-identical output from shuffled equivalent inputs", () => {
    const players = [
      rosterPlayerFor({ sourceId: ROGUE }),
      rosterPlayerFor({ sourceId: PALADIN }),
      rosterPlayerFor({ sourceId: ZERO_ID }),
    ];
    const fights = [
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
        participants: [{ sourceId: ROGUE, specName: "Assassination" }],
      }),
    ];

    const cells: readonly PlayerFightResult[] = [
      cellOf(
        analyzedFightAnalysis({
          fightId: 1,
          sourceId: ROGUE,
          comparisons: [
            comparison({
              ordinal: 0,
              outcome: "REJECTED",
              basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
              observedToken: "envenom",
            }),
            comparison({
              ordinal: 1,
              outcome: "UNKNOWN",
              basis: "AUTHORITY_SELECTION_UNRESOLVED",
              observedToken: "deathmark",
              decisiveBlocker: "OBSERVED_STATE_MISSING",
            }),
          ],
          excluded: [excludedCast({ reason: "NON_GCD_ACTION", abilityGameId: 5512 })],
        }),
      ),
      cellOf(
        analyzedFightAnalysis({
          fightId: 1,
          sourceId: ZERO_ID,
          comparisons: [
            comparison({
              outcome: "REJECTED",
              basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
              observedToken: "envenom",
            }),
          ],
        }),
      ),
      cellOf(
        nonAnalyzedFightAnalysis({
          fightId: 1,
          sourceId: PALADIN,
          status: "SPEC_NOT_SUPPORTED",
          specName: "Protection",
        }),
      ),
      cellOf(
        analyzedFightAnalysis({
          fightId: 2,
          sourceId: ROGUE,
          comparisons: [
            comparison({
              outcome: "UNKNOWN",
              basis: "AUTHORITY_SELECTION_UNRESOLVED",
              observedToken: "kingsbane",
              decisiveBlocker: "DIVERGENT_WORLDS",
            }),
          ],
        }),
      ),
      absentCell({ fightId: 2, reportCode: REPORT_CODE, sourceId: PALADIN }),
      absentCell({ fightId: 2, reportCode: REPORT_CODE, sourceId: ZERO_ID }),
    ];

    const outcomes: readonly FightProcessingRecord[] = [
      { fightId: 1, outcome: "INGESTED" },
      { fightId: 2, outcome: "INGESTED" },
    ];

    const ordered = aggregate({
      snapshot: snapshotFor({ players, fights, requestedFightIds: [1, 2, 3] }),
      cells,
      fightOutcomes: outcomes,
    });
    const shuffled = aggregate({
      // Same facts, every input array reversed. Nothing in the aggregate may
      // depend on the order a caller happened to assemble them in.
      snapshot: snapshotFor({
        players: [...players].reverse(),
        fights: [...fights].reverse(),
        requestedFightIds: [3, 2, 1],
      }),
      cells: [...cells].reverse(),
      fightOutcomes: [...outcomes].reverse(),
    });

    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(ordered));
  });

  it("orders cells by fight then source id", () => {
    // Each raider played one pull and sat the other out, so every cell below is
    // the kind M7-C's participation actually requires.
    const result = aggregate({
      snapshot: snapshotFor({
        players: [rosterPlayerFor({ sourceId: ROGUE }), rosterPlayerFor({ sourceId: PALADIN })],
        fights: [
          rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] }),
          rosterFightFor({ fightId: 2, participants: [{ sourceId: PALADIN, specName: "Protection" }] }),
        ],
      }),
      cells: [
        // Supplied in a deliberately wrong order.
        cellOf(
          nonAnalyzedFightAnalysis({
            fightId: 2,
            sourceId: PALADIN,
            status: "SPEC_NOT_SUPPORTED",
            specName: "Protection",
          }),
        ),
        absentCell({ fightId: 2, reportCode: REPORT_CODE, sourceId: ROGUE }),
        cellOf(
          analyzedFightAnalysis({
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
          }),
        ),
        absentCell({ fightId: 1, reportCode: REPORT_CODE, sourceId: PALADIN }),
      ],
      fightOutcomes: [
        { fightId: 1, outcome: "INGESTED" },
        { fightId: 2, outcome: "INGESTED" },
      ],
    });

    expect(result.cells.map((cell) => [cell.fightId, cell.sourceId])).toEqual([
      [1, PALADIN],
      [1, ROGUE],
      [2, PALADIN],
      [2, ROGUE],
    ]);
  });
});
