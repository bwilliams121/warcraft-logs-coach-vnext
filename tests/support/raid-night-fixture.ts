/**
 * Deterministic raid-night aggregates for contract tests.
 *
 * Built by running the REAL M7-D gate and aggregator over synthetic facts, so a
 * projection test stands on an aggregate the domain would actually produce —
 * including its canonical ordering and its topology guarantees — rather than on
 * a hand-written object that might not be reachable.
 *
 * Nothing here reaches Warcraft Logs, constructs combat state, or runs an
 * analyzer.
 */

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
  type RaidNightAnalysis,
} from "../../src/aggregation/raid-night.js";
import type { AnalysisUnavailableReason, PlayerFightResult } from "../../src/aggregation/cell.js";
import type { ObservedActionComparison } from "../../src/specs/rogue/assassination/observed-comparison.js";
import type { ExcludedObservedCast } from "../../src/specs/rogue/assassination/observed-analysis.js";
import type { RosterFight, RosterPlayer } from "../../src/wcl/roster-snapshot.js";
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
} from "./aggregation-fixture.js";

export { NORMALIZATION_REVISION, REPORT_CODE, REVISION } from "./aggregation-fixture.js";

/** Projects one analysis into a cell, failing loudly if the domain refuses it. */
export function cellOf(analysis: Parameters<typeof toPlayerFightCell>[0]["analysis"]): PlayerFightResult {
  const projection = toPlayerFightCell({ analysis, normalizationRevision: NORMALIZATION_REVISION });
  if (!projection.ok) throw new Error(`cell projection failed: ${projection.reason}`);
  return projection.cell;
}

export function analyzedCell(options: {
  readonly fightId: number;
  readonly sourceId: number;
  readonly specName?: string;
  readonly comparisons?: readonly ObservedActionComparison[];
  readonly excluded?: readonly ExcludedObservedCast[];
  readonly artifactRevision?: string;
}): PlayerFightResult {
  return cellOf(
    analyzedFightAnalysis({
      fightId: options.fightId,
      sourceId: options.sourceId,
      specName: options.specName ?? "Assassination",
      comparisons: options.comparisons ?? [
        comparison({
          outcome: "MATCH",
          basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
          observedToken: "garrote",
          selectionPrecision: "EXACT_ENTRY",
        }),
      ],
      ...(options.excluded === undefined ? {} : { excluded: options.excluded }),
      ...(options.artifactRevision === undefined ? {} : { artifactRevision: options.artifactRevision }),
    }),
  );
}

export function notAnalyzedCell(options: {
  readonly fightId: number;
  readonly sourceId: number;
  readonly status: Parameters<typeof nonAnalyzedFightAnalysis>[0]["status"];
  readonly specName?: string;
}): PlayerFightResult {
  return cellOf(
    nonAnalyzedFightAnalysis({
      fightId: options.fightId,
      sourceId: options.sourceId,
      status: options.status,
      specName: options.specName ?? "Assassination",
    }),
  );
}

export function absent(fightId: number, sourceId: number): PlayerFightResult {
  return absentCell({ fightId, reportCode: REPORT_CODE, sourceId });
}

export function unavailable(
  fightId: number,
  sourceId: number,
  specName: string | null = "Assassination",
  reason: AnalysisUnavailableReason = "FIGHT_INGESTION_FAILED",
): PlayerFightResult {
  return analysisUnavailableCell({
    fightId,
    reportCode: REPORT_CODE,
    sourceId,
    specName,
    reason,
    preparation: { state: "NOT_ASSESSED", reason: "NO_FIGHT_RETRIEVED" },
  });
}

/** Runs the real gate and aggregator. Throws if the facts are not coherent. */
export function aggregateOf(options: {
  readonly players: readonly RosterPlayer[];
  readonly fights: readonly RosterFight[];
  readonly cells: readonly PlayerFightResult[];
  readonly requestedFightIds?: readonly number[];
  readonly fightOutcomes?: readonly FightProcessingRecord[];
}): RaidNightAnalysis {
  const snapshot = snapshotFor({
    players: options.players,
    fights: options.fights,
    ...(options.requestedFightIds === undefined ? {} : { requestedFightIds: options.requestedFightIds }),
  });
  const fightOutcomes =
    options.fightOutcomes ??
    snapshot.identity.includedFightIds.map((fightId): FightProcessingRecord => ({
      fightId,
      outcome: "INGESTED",
    }));

  const verification = verifyRaidNightInput(
    { outcome: "MATCHES", revision: REVISION },
    { snapshot, fightOutcomes, cells: options.cells },
  );
  if (!verification.ok) {
    throw new Error(`fixture refused: ${verification.reason}/${String(verification.defect)}`);
  }
  return aggregateRaidNight(verification.verified);
}

export { comparison, excludedCast, rosterFightFor, rosterPlayerFor };

/**
 * A representative 100-cell raid night.
 *
 * DELIBERATELY REPRESENTATIVE RATHER THAN MINIMAL: 10 fights x 10 roster
 * players, mixing every cell kind, with enough distinct recurrence keys and a
 * full trend series per player. This is the payload-size tripwire's subject —
 * the shape a real raid night would have, at a scale that would be tens of
 * megabytes if cells nested single-fight documents.
 *
 * Every value is derived arithmetically from the indices, so two runs build the
 * same aggregate.
 */
export function hundredCellAggregate(): RaidNightAnalysis {
  const fightIds = Array.from({ length: 10 }, (_, index) => index + 1);
  const sourceIds = Array.from({ length: 10 }, (_, index) => index * 3);

  const players = sourceIds.map((sourceId) =>
    rosterPlayerFor({ sourceId, name: `Raider${String(sourceId)}` }),
  );

  /** Player 27 sits out fight 5; everybody else plays every pull. */
  const isAbsent = (fightId: number, sourceId: number): boolean => fightId === 5 && sourceId === 27;
  /** Fight 8's evidence never arrived. */
  const failedFight = 8;

  const fights = fightIds.map((fightId) =>
    rosterFightFor({
      fightId,
      participants: sourceIds
        .filter((sourceId) => !isAbsent(fightId, sourceId))
        .map((sourceId) => ({
          sourceId,
          // One player swaps specialization halfway through the night.
          specName: sourceId === 3 && fightId > 5 ? "Outlaw" : "Assassination",
        })),
      kill: fightId === 10,
      startTimeMs: 1000 + fightId * 10_000,
      endTimeMs: 1000 + fightId * 10_000 + 300_000,
    }),
  );

  const cells: PlayerFightResult[] = [];
  for (const fightId of fightIds) {
    for (const sourceId of sourceIds) {
      const specName = sourceId === 3 && fightId > 5 ? "Outlaw" : "Assassination";

      if (isAbsent(fightId, sourceId)) {
        cells.push(absent(fightId, sourceId));
        continue;
      }
      if (fightId === failedFight) {
        cells.push(unavailable(fightId, sourceId, specName));
        continue;
      }
      // Two raiders this build cannot analyze, and the spec-swapper after the
      // swap: a realistic mixed roster.
      if (sourceId === 6 || sourceId === 9 || specName === "Outlaw") {
        cells.push(notAnalyzedCell({ fightId, sourceId, status: "SPEC_NOT_SUPPORTED", specName }));
        continue;
      }

      cells.push(
        analyzedCell({
          fightId,
          sourceId,
          specName,
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
              observedToken: sourceId % 2 === 0 ? "envenom" : "rupture",
            }),
            ...Array.from({ length: 8 }, (_, index) =>
              comparison({
                ordinal: index + 2,
                outcome: "UNKNOWN",
                basis: "AUTHORITY_SELECTION_UNRESOLVED",
                observedToken: "deathmark",
                decisiveBlocker: index % 2 === 0 ? "OBSERVED_STATE_MISSING" : "DIVERGENT_WORLDS",
              }),
            ),
          ],
          excluded: Array.from({ length: 6 }, (_, index) =>
            excludedCast({
              ordinal: index,
              reason: "EXECUTION_LANE_NOT_ESTABLISHED",
              abilityGameId: 1000 + index,
            }),
          ),
        }),
      );
    }
  }

  const fightOutcomes: readonly FightProcessingRecord[] = fightIds.map((fightId) => ({
    fightId,
    outcome: (fightId === failedFight ? "INGESTION_FAILED" : "INGESTED") satisfies FightProcessingOutcome,
  }));

  return aggregateOf({
    players,
    fights,
    cells,
    // One requested pull is not in the report.
    requestedFightIds: [...fightIds, 99],
    fightOutcomes,
  });
}
