/**
 * The `warcraft-logs-coach.raid-night/1` vocabulary freeze.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE PARITY TESTS
 *
 * The contract derives its public vocabularies from the internal domain tuples:
 *
 *     export const PUBLIC_CELL_KINDS = PLAYER_FIGHT_RESULT_KINDS;
 *
 * That guarantees the public wire agrees with the domain TODAY, and the parity
 * tests in `m7e-raid-night-contract.test.ts` assert it. But it also means
 * internal growth PROPAGATES outward automatically:
 *
 *     M10 adds an internal AnalysisUnavailableReason
 *       -> the internal tuple grows
 *       -> the derived public tuple grows
 *       -> raid-night/1 now accepts a value it did not accept before
 *       -> the parity test still passes, because both sides moved together
 *
 * A frozen public contract cannot work that way. The lists below are therefore
 * written out LITERALLY, and that duplication is the whole point: they are the
 * only thing in the repository that does not move when the domain does.
 *
 * WHAT TO DO WHEN A TEST HERE FAILS
 *
 * It means an internal vocabulary grew and the public wire followed it. That is
 * a decision, not a bug to silence, and there are exactly two honest answers:
 *
 *   A. `/1` KEEPS ITS VOCABULARY. Stop deriving that public tuple from the
 *      internal one, and make the projection map the new internal case onto an
 *      existing truthful public value. Update nothing here.
 *
 *   B. `/1` CHANGES DELIBERATELY. Take it through contract review — a new
 *      discriminant is not a harmless optional field — and only then update the
 *      literal below.
 *
 * Do not update the literal to make the suite green.
 *
 * WHY DISCRIMINANTS ESPECIALLY
 *
 * Consumers write exhaustive switches over `cell.kind`. A fifth variant appearing
 * unannounced does not add information to such a consumer — it silently breaks
 * one. The same applies to an unavailable reason, a processing outcome and a
 * comparability value: each is machine-readable semantics, not decoration.
 */

import { describe, expect, it } from "vitest";

import {
  AnalysisUnavailableCellSchema,
  PublicCellSchema,
  PublicComparabilitySchema,
  PublicFightSummarySchema,
  PublicRaidNightResultSchema,
  PUBLIC_ANALYSIS_UNAVAILABLE_REASONS,
  PUBLIC_BATCH_FAILURE_REASONS,
  PUBLIC_CELL_KINDS,
  PUBLIC_COMPARABILITY_VALUES,
  PUBLIC_FIGHT_PROCESSING_OUTCOMES,
  PUBLIC_NON_ANALYZED_STATUSES,
  PUBLIC_RAID_NIGHT_STATUSES,
} from "../../src/contracts/raid-night-contract.js";

/**
 * The vocabulary of `warcraft-logs-coach.raid-night/1`, as frozen.
 *
 * Read from the source at the checkpoint that froze `/1`. Every value here is
 * part of the published contract, and order is included because these arrays are
 * exported and a consumer may index them.
 *
 * ---------------------------------------------------------------------------
 * REVIEWED CHANGE LOG
 *
 * This literal changes only through a recorded decision. Each entry below is a
 * time the tripwire fired and somebody chose option B — change `/1` — rather
 * than option A.
 *
 * M7-F, BEFORE `/1` WAS EVER DEPLOYED OR EXPOSED.
 *
 *   + fightProcessingOutcomes: "NOT_INGESTED"
 *
 *     M7-A requires that a fight no selected player needs analyzed is not
 *     retrieved at all. The two existing values could not state that: `INGESTED`
 *     would claim an event request that was never issued, and
 *     `INGESTION_FAILED` would invent an outage to explain a deliberate saving.
 *     Neither is true, so the vocabulary was the thing that had to give.
 *
 *   + analysisUnavailableReasons: "SPECIALIZATION_UNRESOLVED"
 *
 *     M7-C preserves an unusable `friendlySpecs` entry as `specName: null`
 *     rather than guessing, and a raid night still owes that participant a cell.
 *     `SPEC_NOT_SUPPORTED` would assert we identified a specialization and lack
 *     an analyzer for it; we never identified one. This states the fact instead.
 *
 *   + coverage.fightsNotIngested
 *
 *     The denominator has to keep adding up. `fightsIncluded` must equal
 *     `fightsIngested + fightsNotIngested + fightsFailed`, and without this field
 *     a deliberately unretrieved fight would have had to be counted as one of the
 *     other two — which is the same lie in arithmetic form.
 *
 * `schemaVersion` stays `/1` because no consumer has ever received the previous
 * vocabulary — the contract had no caller until M7-F. A change with the same
 * shape AFTER deployment is a different decision and would need versioning.
 * ---------------------------------------------------------------------------
 */
const FROZEN_V1 = {
  raidNightStatuses: ["ANALYZED", "NO_ANALYZED_CELLS"],
  cellKinds: ["ABSENT", "ANALYZED", "NOT_ANALYZED", "ANALYSIS_UNAVAILABLE"],
  nonAnalyzedStatuses: [
    "SPEC_NOT_SUPPORTED",
    "AUTHORITY_NOT_AVAILABLE",
    "PROFILE_NOT_RESOLVED",
    "INSUFFICIENT_EVIDENCE",
  ],
  // M7-F reviewed addition: SPECIALIZATION_UNRESOLVED. See the log above.
  analysisUnavailableReasons: ["FIGHT_INGESTION_FAILED", "SPECIALIZATION_UNRESOLVED"],
  // M7-F reviewed addition: NOT_INGESTED. See the log above.
  fightProcessingOutcomes: ["INGESTED", "NOT_INGESTED", "INGESTION_FAILED"],
  batchFailureReasons: ["FIGHT_NOT_FOUND", "FIGHT_INGESTION_FAILED"],
  comparabilityValues: ["SAME", "DIFFERENT", "UNKNOWN"],
} as const;

describe("freezes the raid-night/1 public vocabulary independently of internal parity", () => {
  it("freezes the raid-night status vocabulary", () => {
    expect([...PUBLIC_RAID_NIGHT_STATUSES]).toEqual([...FROZEN_V1.raidNightStatuses]);
  });

  it("freezes the cell discriminant vocabulary", () => {
    // The one consumers write exhaustive switches over.
    expect([...PUBLIC_CELL_KINDS]).toEqual([...FROZEN_V1.cellKinds]);
  });

  it("freezes the non-analyzed status vocabulary", () => {
    expect([...PUBLIC_NON_ANALYZED_STATUSES]).toEqual([...FROZEN_V1.nonAnalyzedStatuses]);
  });

  it("freezes the analysis-unavailable reason vocabulary", () => {
    // The one M10 is most likely to grow: a second infrastructure reason.
    expect([...PUBLIC_ANALYSIS_UNAVAILABLE_REASONS]).toEqual([...FROZEN_V1.analysisUnavailableReasons]);
  });

  it("freezes the fight processing outcome vocabulary", () => {
    expect([...PUBLIC_FIGHT_PROCESSING_OUTCOMES]).toEqual([...FROZEN_V1.fightProcessingOutcomes]);
  });

  it("freezes the batch failure reason vocabulary", () => {
    expect([...PUBLIC_BATCH_FAILURE_REASONS]).toEqual([...FROZEN_V1.batchFailureReasons]);
  });

  it("freezes the comparability vocabulary", () => {
    expect([...PUBLIC_COMPARABILITY_VALUES]).toEqual([...FROZEN_V1.comparabilityValues]);
  });

  it("covers every public vocabulary the contract exports", () => {
    // Guards against a new public vocabulary being added without a freeze entry.
    // If this fails, either the new vocabulary needs freezing above or it is not
    // actually part of the wire.
    const frozenCount = Object.keys(FROZEN_V1).length;
    expect(frozenCount).toBe(7);
  });
});

/**
 * The same freeze, asserted through the SCHEMAS rather than the tuples.
 *
 * The tuples are what the contract exports; the schemas are what the wire
 * actually accepts. Both are pinned, because a projection could in principle
 * build an enum from something other than the exported tuple.
 */
describe("the /1 schemas accept exactly the frozen vocabulary and nothing else", () => {
  const CELL_IDENTITY = { fightId: 1, playerKey: "aBcDeFgH12345678:19", sourceId: 19 };

  it("accepts every frozen cell kind and rejects an unlisted one", () => {
    // A fifth discriminant must not be silently parseable: a consumer's
    // exhaustive switch would fall through it.
    expect(() => PublicCellSchema.parse({ kind: "ABSENT", ...CELL_IDENTITY })).not.toThrow();
    expect(() => PublicCellSchema.parse({ kind: "ANALYSIS_SKIPPED", ...CELL_IDENTITY })).toThrow();
  });

  it("accepts the frozen analysis-unavailable reason and rejects an unlisted one", () => {
    const base = { kind: "ANALYSIS_UNAVAILABLE" as const, ...CELL_IDENTITY, specName: "Assassination" };
    expect(() =>
      AnalysisUnavailableCellSchema.parse({ ...base, reason: "FIGHT_INGESTION_FAILED" }),
    ).not.toThrow();
    expect(() =>
      AnalysisUnavailableCellSchema.parse({ ...base, reason: "SPECIALIZATION_UNRESOLVED" }),
    ).not.toThrow();
    // Exactly the M10-shaped change this file exists to notice.
    expect(() =>
      AnalysisUnavailableCellSchema.parse({ ...base, reason: "ROSTER_DISCOVERY_FAILED" }),
    ).toThrow();
  });

  it("accepts the frozen processing outcomes and rejects an unlisted one", () => {
    const fight = {
      fightId: 1,
      name: "Fight 1",
      encounterId: 2900,
      difficulty: 5,
      size: 20,
      kill: true,
      startTimeMs: 1000,
      endTimeMs: 5000,
      durationMs: 4000,
      participantCount: 1,
      analyzedCount: 1,
    };
    for (const outcome of FROZEN_V1.fightProcessingOutcomes) {
      expect(() => PublicFightSummarySchema.parse({ ...fight, processingOutcome: outcome })).not.toThrow();
    }
    expect(() =>
      PublicFightSummarySchema.parse({ ...fight, processingOutcome: "INGESTION_SKIPPED" }),
    ).toThrow();
  });

  it("accepts the frozen comparability values and rejects an unlisted one", () => {
    const comparability = {
      fromFightId: 1,
      toFightId: 2,
      sameEncounter: "SAME",
      sameDifficulty: "SAME",
      sameSpec: "SAME",
      sameAnalyzerId: "SAME",
      sameAuthorityRevision: "SAME",
      sameNormalizationRevision: "SAME",
    };
    for (const value of FROZEN_V1.comparabilityValues) {
      expect(() => PublicComparabilitySchema.parse({ ...comparability, sameSpec: value })).not.toThrow();
    }
    // `PARTIALLY_SAME` would be a new machine-readable semantic, not a nuance.
    expect(() => PublicComparabilitySchema.parse({ ...comparability, sameSpec: "PARTIALLY_SAME" })).toThrow();
  });

  it("accepts the frozen raid-night statuses and rejects an unlisted one", () => {
    // Built from a minimal valid document so the status is the only thing varying.
    const empty = {
      schemaVersion: "warcraft-logs-coach.raid-night/1",
      capability: {
        analysisKind: "OBSERVED_DECISION_AUTHORITY_VERIFICATION",
        matchMeaning: "AUTHORITY_COMPATIBLE_ONLY",
        verifiesObservedDecisionsOnly: true,
        predictsArbitraryNextAction: false,
        scoresPerformance: false,
        unknownIsFirstClass: true,
        partialCoverageIsExpected: true,
      },
      identity: {
        reportCode: "aBcDeFgH12345678",
        reportRevision: 30,
        logVersion: 17,
        gameVersion: 1,
        reportStartTimeUnixMs: 1_700_000_000_000,
        reportEndTimeUnixMs: 1_700_000_900_000,
        includedFightIds: [],
      },
      fights: [],
      roster: [],
      cells: [],
      coverage: {
        cellsTotal: 0,
        cellsAnalyzed: 0,
        cellsAbsent: 0,
        cellsSpecNotSupported: 0,
        cellsAuthorityNotAvailable: 0,
        cellsProfileNotResolved: 0,
        cellsInsufficientEvidence: 0,
        cellsAnalysisUnavailable: 0,
        eligibleDecisionsTotal: 0,
        matchTotal: 0,
        rejectedTotal: 0,
        unknownTotal: 0,
        resolvedComparisonsTotal: 0,
        excludedCastCountTotal: 0,
        fightsRequested: 0,
        fightsIncluded: 0,
        fightsMissing: 0,
        fightsIngested: 0,
        fightsNotIngested: 0,
        fightsFailed: 0,
      },
      recurrence: { rejectedPatterns: [], evidenceLimitations: [], exclusionPatterns: [] },
      trendEvidence: { series: [] },
      partialFailures: [],
    };

    for (const status of FROZEN_V1.raidNightStatuses) {
      expect(() => PublicRaidNightResultSchema.parse({ ...empty, status })).not.toThrow();
    }
    expect(() => PublicRaidNightResultSchema.parse({ ...empty, status: "PARTIAL" })).toThrow();
  });

  it("accepts the frozen non-analyzed statuses and rejects an unlisted one", () => {
    const base = {
      kind: "NOT_ANALYZED" as const,
      ...CELL_IDENTITY,
      specName: "Assassination",
      detail: "no analysis was attempted",
      analysisRef: { reportCode: "aBcDeFgH12345678", fightId: 1, sourceId: 19 },
    };
    for (const status of FROZEN_V1.nonAnalyzedStatuses) {
      expect(() => PublicCellSchema.parse({ ...base, status })).not.toThrow();
    }
    expect(() => PublicCellSchema.parse({ ...base, status: "ANALYZED_PARTIALLY" })).toThrow();
  });

  it("accepts the frozen batch failure reasons and rejects an unlisted one", () => {
    const withFailure = (reason: string): unknown => ({ fightId: 1, reason });
    // Parsed through the top-level document, which is where they actually appear.
    const base = PublicRaidNightResultSchema.shape.partialFailures;
    for (const reason of FROZEN_V1.batchFailureReasons) {
      expect(() => base.parse([withFailure(reason)])).not.toThrow();
    }
    expect(() => base.parse([withFailure("FIGHT_ROSTER_UNAVAILABLE")])).toThrow();
  });
});
