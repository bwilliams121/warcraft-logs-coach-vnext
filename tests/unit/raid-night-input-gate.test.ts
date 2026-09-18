/**
 * The gate between raw facts and an aggregate.
 *
 * TWO THINGS MUST BE PROVEN BEFORE ANYTHING IS COUNTED, AND NEITHER IS OPTIONAL.
 *
 * REVISION INTEGRITY says the facts describe one export of the report. The
 * private brand records that proof, and the aggregator re-reads it at RUNTIME —
 * because TypeScript permits `facts as unknown as VerifiedRaidNightInput`, so a
 * compile-time-only guard would let a deliberate cast straight through.
 *
 * TOPOLOGY INTEGRITY says the facts describe that export COMPLETELY. Coverage is
 * read against `cellsTotal`, so an orchestration bug that omitted one cell would
 * turn an incomplete 79 into a confident, wrong 79-of-79. The matrix is proven
 * by KEYS rather than by length, because one duplicate plus one omission has
 * exactly the right length.
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
  type FightProcessingOutcome,
  type FightProcessingRecord,
  type RaidNightVerification,
  type VerifiedRaidNightInput,
} from "../../src/aggregation/raid-night.js";
import type { PlayerFightResult } from "../../src/aggregation/cell.js";
import type { ReportRosterSnapshot } from "../../src/wcl/roster-snapshot.js";
import {
  analyzedFightAnalysis,
  comparison,
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

function cellOf(analysis: Parameters<typeof toPlayerFightCell>[0]["analysis"]): PlayerFightResult {
  const projection = toPlayerFightCell({ analysis, normalizationRevision: NORMALIZATION_REVISION });
  if (!projection.ok) throw new Error(`projection failed: ${projection.reason}`);
  return projection.cell;
}

function matchCell(fightId: number, sourceId: number, specName = "Assassination"): PlayerFightResult {
  return cellOf(
    analyzedFightAnalysis({
      fightId,
      sourceId,
      specName,
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
}

function verified(revision = REVISION) {
  return { outcome: "MATCHES", revision } as const;
}

function defectOf(verification: RaidNightVerification): string {
  if (verification.ok) throw new Error("expected the input to be refused");
  expect(verification.reason).toBe("RAID_NIGHT_INPUT_INVALID");
  return String(verification.defect);
}

// ---------------------------------------------------------------------------

describe("the private revision brand is enforced at runtime", () => {
  const snapshot = snapshotFor({
    players: [rosterPlayerFor({ sourceId: ROGUE })],
    fights: [rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] })],
  });

  const rawFacts = {
    snapshot,
    fightOutcomes: [{ fightId: 1, outcome: "INGESTED" }] as readonly FightProcessingRecord[],
    cells: [matchCell(1, ROGUE)] as readonly PlayerFightResult[],
  };

  it("refuses a forged type assertion that never passed through verification", () => {
    // Exactly the escape hatch TypeScript allows. These facts happen to be
    // valid; the point is that NOTHING checked them, and the aggregator must not
    // take a caller's word for it.
    const forged = rawFacts as unknown as VerifiedRaidNightInput;
    expect(() => aggregateRaidNight(forged)).toThrow(/verifyRaidNightInput/);
  });

  it("refuses a forged assertion over facts that would have failed verification", () => {
    // The case that actually matters: a cast past the gate carrying an
    // incomplete matrix. Without the runtime brand this would aggregate happily
    // and report a shrunken denominator.
    const incomplete = { ...rawFacts, cells: [] as readonly PlayerFightResult[] };
    expect(() => aggregateRaidNight(incomplete as unknown as VerifiedRaidNightInput)).toThrow();
  });

  it("still aggregates a legitimately verified input", () => {
    const verification = verifyRaidNightInput(verified(), rawFacts);
    expect(verification.ok).toBe(true);
    if (!verification.ok) return;

    const result = aggregateRaidNight(verification.verified);
    expect(result.status).toBe("ANALYZED");
    expect(result.coverage.cellsTotal).toBe(1);
  });
});

describe("the gate proves the input topology before branding it", () => {
  const ROSTER = [
    rosterPlayerFor({ sourceId: ZERO_ID }),
    rosterPlayerFor({ sourceId: PALADIN }),
    rosterPlayerFor({ sourceId: ROGUE }),
  ];

  /** Two fights, three players, everybody in every fight. */
  function fullSnapshot(): ReportRosterSnapshot {
    const participants = [ZERO_ID, PALADIN, ROGUE].map((sourceId) => ({
      sourceId,
      specName: "Assassination",
    }));
    return snapshotFor({
      players: ROSTER,
      fights: [rosterFightFor({ fightId: 1, participants }), rosterFightFor({ fightId: 2, participants })],
    });
  }

  const FULL_CELLS: readonly PlayerFightResult[] = [1, 2].flatMap((fightId) =>
    [ZERO_ID, PALADIN, ROGUE].map((sourceId) => matchCell(fightId, sourceId)),
  );

  const FULL_OUTCOMES: readonly FightProcessingRecord[] = [
    { fightId: 1, outcome: "INGESTED" },
    { fightId: 2, outcome: "INGESTED" },
  ];

  function verify(options: {
    readonly cells?: readonly PlayerFightResult[];
    readonly fightOutcomes?: readonly FightProcessingRecord[];
  }): RaidNightVerification {
    return verifyRaidNightInput(verified(), {
      snapshot: fullSnapshot(),
      fightOutcomes: options.fightOutcomes ?? FULL_OUTCOMES,
      cells: options.cells ?? FULL_CELLS,
    });
  }

  it("accepts an exact 2 x 3 matrix and proves the denominator", () => {
    const verification = verify({});
    expect(verification.ok).toBe(true);
    if (!verification.ok) return;
    // 2 included fights x 3 roster players — proven, not merely counted.
    expect(aggregateRaidNight(verification.verified).coverage.cellsTotal).toBe(6);
  });

  it("refuses a missing cell", () => {
    expect(defectOf(verify({ cells: FULL_CELLS.slice(0, 5) }))).toBe("CELL_MISSING");
  });

  it("refuses a duplicate cell even when the array length is right", () => {
    // ONE duplicate plus ONE omission has exactly the expected length. Comparing
    // lengths would pass this; comparing keys does not.
    const withDuplicate = [...FULL_CELLS.slice(0, 5), matchCell(1, ROGUE)];
    expect(withDuplicate).toHaveLength(FULL_CELLS.length);
    expect(defectOf(verify({ cells: withDuplicate }))).toBe("CELL_DUPLICATE");
  });

  it("refuses a cell for a player who is not on the roster", () => {
    expect(defectOf(verify({ cells: [...FULL_CELLS, matchCell(1, 999)] }))).toBe("CELL_FOREIGN_PLAYER");
  });

  it("refuses a cell for a fight the snapshot does not include", () => {
    expect(defectOf(verify({ cells: [...FULL_CELLS, matchCell(99, ROGUE)] }))).toBe("CELL_FOREIGN_FIGHT");
  });

  it("refuses a cell whose playerKey disagrees with its own source id", () => {
    // A mismatched key would make one player appear as two in recurrence groups
    // and in every later projection.
    const first = FULL_CELLS[0];
    if (first === undefined) throw new Error("fixture");
    const forgedKey = { ...first, playerKey: `${REPORT_CODE}:999` } as PlayerFightResult;
    expect(defectOf(verify({ cells: [forgedKey, ...FULL_CELLS.slice(1)] }))).toBe("PLAYER_KEY_MISMATCH");
  });

  it("refuses a missing processing record", () => {
    expect(defectOf(verify({ fightOutcomes: FULL_OUTCOMES.slice(0, 1) }))).toBe("PROCESSING_RECORD_MISSING");
  });

  it("refuses a duplicate processing record", () => {
    const duplicated: readonly FightProcessingRecord[] = [
      ...FULL_OUTCOMES,
      { fightId: 1, outcome: "INGESTED" },
    ];
    expect(defectOf(verify({ fightOutcomes: duplicated }))).toBe("PROCESSING_RECORD_DUPLICATE");
  });

  it("refuses a processing record for a fight that is not included", () => {
    const foreign: readonly FightProcessingRecord[] = [
      ...FULL_OUTCOMES,
      { fightId: 99, outcome: "INGESTED" },
    ];
    expect(defectOf(verify({ fightOutcomes: foreign }))).toBe("PROCESSING_RECORD_FOREIGN_FIGHT");
  });

  it("validates the whole matrix with actor id 0 in it", () => {
    // Actor 0 is a real id. A truthiness test in key building, the roster set or
    // duplicate detection would silently drop it.
    const verification = verify({});
    expect(verification.ok).toBe(true);
    if (!verification.ok) return;
    expect(
      aggregateRaidNight(verification.verified).cells.filter((cell) => cell.sourceId === ZERO_ID),
    ).toHaveLength(2);

    // And omitting exactly actor 0's cells is caught rather than ignored.
    expect(defectOf(verify({ cells: FULL_CELLS.filter((cell) => cell.sourceId !== ZERO_ID) }))).toBe(
      "CELL_MISSING",
    );
  });
});

describe("the gate proves cells agree with the factual snapshot", () => {
  /** Fight 1: both present. Fight 2: only the Rogue. */
  function snapshot(): ReportRosterSnapshot {
    return snapshotFor({
      players: [rosterPlayerFor({ sourceId: PALADIN }), rosterPlayerFor({ sourceId: ROGUE })],
      fights: [
        rosterFightFor({
          fightId: 1,
          participants: [
            { sourceId: PALADIN, specName: "Protection" },
            { sourceId: ROGUE, specName: "Assassination" },
          ],
        }),
        rosterFightFor({ fightId: 2, participants: [{ sourceId: ROGUE, specName: "Assassination" }] }),
      ],
    });
  }

  const OUTCOMES: readonly FightProcessingRecord[] = [
    { fightId: 1, outcome: "INGESTED" },
    { fightId: 2, outcome: "INGESTED" },
  ];

  const PALADIN_PRESENT = cellOf(
    nonAnalyzedFightAnalysis({
      fightId: 1,
      sourceId: PALADIN,
      status: "SPEC_NOT_SUPPORTED",
      specName: "Protection",
    }),
  );
  const PALADIN_ABSENT = absentCell({ fightId: 2, reportCode: REPORT_CODE, sourceId: PALADIN });

  function verify(
    cells: readonly PlayerFightResult[],
    fightOutcomes: readonly FightProcessingRecord[] = OUTCOMES,
  ): RaidNightVerification {
    return verifyRaidNightInput(verified(), { snapshot: snapshot(), fightOutcomes, cells });
  }

  it("accepts cells that agree with participation and specialization", () => {
    expect(verify([PALADIN_PRESENT, matchCell(1, ROGUE), PALADIN_ABSENT, matchCell(2, ROGUE)]).ok).toBe(true);
  });

  it("refuses ANALYZED for a player the snapshot says was ABSENT", () => {
    // Laundering a fabricated analysis as participation.
    const fabricated = matchCell(2, PALADIN, "Protection");
    expect(defectOf(verify([PALADIN_PRESENT, matchCell(1, ROGUE), fabricated, matchCell(2, ROGUE)]))).toBe(
      "PARTICIPATION_MISMATCH",
    );
  });

  it("refuses ABSENT for a player the snapshot says was PRESENT", () => {
    // The other direction: laundering a missing analysis as an absence.
    const laundered = absentCell({ fightId: 1, reportCode: REPORT_CODE, sourceId: PALADIN });
    expect(defectOf(verify([laundered, matchCell(1, ROGUE), PALADIN_ABSENT, matchCell(2, ROGUE)]))).toBe(
      "PARTICIPATION_MISMATCH",
    );
  });

  it("refuses a specialization that disagrees with the snapshot", () => {
    expect(
      defectOf(verify([PALADIN_PRESENT, matchCell(1, ROGUE, "Outlaw"), PALADIN_ABSENT, matchCell(2, ROGUE)])),
    ).toBe("SPEC_MISMATCH");
  });

  it("refuses a non-null specialization where the snapshot supplied none", () => {
    // WCL reported no usable spec for this participant. A cell may not invent
    // one — that would attribute play to a build nobody observed.
    const unknownSpec = snapshotFor({
      players: [rosterPlayerFor({ sourceId: ROGUE })],
      fights: [rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: null }] })],
    });
    const verification = verifyRaidNightInput(verified(), {
      snapshot: unknownSpec,
      fightOutcomes: [{ fightId: 1, outcome: "INGESTED" }],
      cells: [matchCell(1, ROGUE, "Assassination")],
    });
    expect(defectOf(verification)).toBe("SPEC_MISMATCH");
  });

  it("refuses a null specialization where the snapshot knows one", () => {
    const nulled = analysisUnavailableCell({
      fightId: 1,
      reportCode: REPORT_CODE,
      sourceId: PALADIN,
      specName: null,
      reason: "FIGHT_INGESTION_FAILED",
    });
    const outcomes: readonly FightProcessingRecord[] = [
      { fightId: 1, outcome: "INGESTION_FAILED" },
      { fightId: 2, outcome: "INGESTED" },
    ];
    const unavailableRogue = analysisUnavailableCell({
      fightId: 1,
      reportCode: REPORT_CODE,
      sourceId: ROGUE,
      specName: "Assassination",
      reason: "FIGHT_INGESTION_FAILED",
    });
    expect(defectOf(verify([nulled, unavailableRogue, PALADIN_ABSENT, matchCell(2, ROGUE)], outcomes))).toBe(
      "SPEC_MISMATCH",
    );
  });
});

describe("the gate proves cells agree with what happened to the fight", () => {
  function snapshot(): ReportRosterSnapshot {
    return snapshotFor({
      players: [rosterPlayerFor({ sourceId: ROGUE })],
      fights: [
        rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] }),
      ],
    });
  }

  const UNAVAILABLE = analysisUnavailableCell({
    fightId: 1,
    reportCode: REPORT_CODE,
    sourceId: ROGUE,
    specName: "Assassination",
    reason: "FIGHT_INGESTION_FAILED",
  });

  function verify(cell: PlayerFightResult, outcome: FightProcessingOutcome): RaidNightVerification {
    return verifyRaidNightInput(verified(), {
      snapshot: snapshot(),
      fightOutcomes: [{ fightId: 1, outcome }],
      cells: [cell],
    });
  }

  it("refuses ANALYZED on a fight whose evidence never arrived", () => {
    // Fabricated analysis over a fight nobody retrieved.
    expect(defectOf(verify(matchCell(1, ROGUE), "INGESTION_FAILED"))).toBe("PROCESSING_CELL_MISMATCH");
  });

  it("accepts ANALYSIS_UNAVAILABLE on a fight whose evidence never arrived", () => {
    expect(verify(UNAVAILABLE, "INGESTION_FAILED").ok).toBe(true);
  });

  it("refuses FIGHT_INGESTION_FAILED on a fight that WAS ingested", () => {
    // The other direction: a real analysis hidden behind an infrastructure
    // excuse that contradicts the fight fact.
    expect(defectOf(verify(UNAVAILABLE, "INGESTED"))).toBe("PROCESSING_CELL_MISMATCH");
  });

  it("accepts ANALYZED on a fight that was ingested", () => {
    expect(verify(matchCell(1, ROGUE), "INGESTED").ok).toBe(true);
  });

  it("refuses NOT_ANALYZED on a fight whose evidence never arrived", () => {
    // A gameplay status implies an analyzer ran. None did.
    const notAnalyzed = cellOf(
      nonAnalyzedFightAnalysis({ fightId: 1, sourceId: ROGUE, status: "SPEC_NOT_SUPPORTED" }),
    );
    expect(defectOf(verify(notAnalyzed, "INGESTION_FAILED"))).toBe("PROCESSING_CELL_MISMATCH");
  });

  it("leaves absence unaffected by what happened to the fight", () => {
    // Absence is a roster fact. A failed ingestion does not make an absent
    // player present, or vice versa.
    const absentSnapshot = snapshotFor({
      players: [rosterPlayerFor({ sourceId: ROGUE })],
      fights: [rosterFightFor({ fightId: 1, participants: [] })],
    });
    for (const outcome of ["INGESTED", "INGESTION_FAILED"] as const) {
      const verification = verifyRaidNightInput(verified(), {
        snapshot: absentSnapshot,
        fightOutcomes: [{ fightId: 1, outcome }],
        cells: [absentCell({ fightId: 1, reportCode: REPORT_CODE, sourceId: ROGUE })],
      });
      expect(verification.ok).toBe(true);
    }
  });
});

describe("topology validation respects the missing-fight policy", () => {
  it("expects the matrix over INCLUDED fights only", () => {
    // Fight 2 was requested and is not in the report. The validator must not
    // demand cells for it — that would force exactly the fabrication the
    // missing-fight policy forbids.
    const snapshot = snapshotFor({
      players: [rosterPlayerFor({ sourceId: ROGUE })],
      fights: [
        rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] }),
      ],
      requestedFightIds: [1, 2],
    });

    const verification = verifyRaidNightInput(verified(), {
      snapshot,
      fightOutcomes: [{ fightId: 1, outcome: "INGESTED" }],
      cells: [matchCell(1, ROGUE)],
    });

    expect(verification.ok).toBe(true);
    if (!verification.ok) return;
    const result = aggregateRaidNight(verification.verified);
    expect(result.coverage.cellsTotal).toBe(1);
    expect(result.partialFailures).toEqual([{ fightId: 2, reason: "FIGHT_NOT_FOUND" }]);
  });
});

describe("revision integrity is reported before topology", () => {
  it("names the revision outcome, not a topology defect, when both are wrong", () => {
    // If the evidence describes the wrong export of the report, whether it is
    // internally consistent does not matter — and reporting a topology defect
    // would send a reader looking for an orchestration bug that is not there.
    const snapshot = snapshotFor({
      players: [rosterPlayerFor({ sourceId: ROGUE })],
      fights: [
        rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] }),
      ],
    });

    const verification = verifyRaidNightInput(
      { outcome: "CHANGED", expected: REVISION, observed: 31 },
      { snapshot, fightOutcomes: [], cells: [] },
    );

    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.reason).toBe("REPORT_REVISION_CHANGED");
    expect(verification.defect).toBeUndefined();
  });

  it("reports UNVERIFIED ahead of topology too", () => {
    const snapshot = snapshotFor({
      players: [rosterPlayerFor({ sourceId: ROGUE })],
      fights: [
        rosterFightFor({ fightId: 1, participants: [{ sourceId: ROGUE, specName: "Assassination" }] }),
      ],
    });
    const verification = verifyRaidNightInput(
      { outcome: "UNVERIFIED", cause: { kind: "REPORT_NOT_SERVED" } },
      {
        snapshot,
        fightOutcomes: [],
        cells: [],
      },
    );
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.reason).toBe("REPORT_REVISION_UNVERIFIED");
  });
});
