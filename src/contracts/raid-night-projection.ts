/**
 * Projecting the internal raid-night aggregate into the public contract.
 *
 * ONE DIRECTION, ENFORCED BY POSITION IN THE TREE:
 *
 *     src/aggregation        (the pure domain — knows nothing of this file)
 *          ^
 *     src/contracts          (you are here: reads the domain, publishes a shape)
 *          ^
 *     MCP / REST             (M7-F: consumes the published shape)
 *
 * EVERY FIELD IS COPIED BY NAME. No spreads from internal objects, no
 * `as PublicThing` casts over an internal shape, and no `parse(aggregate)` over
 * the domain object itself. It is tedious on purpose: a field reaches the public
 * contract because somebody wrote it here, not because it happened to exist
 * upstream. That is the difference between publishing a result and leaking one.
 *
 * The distinction matters concretely. The internal `SeriesPoint` carries a whole
 * `PlayerFightResult`, and an internal cell carries a `recurrence` breakdown
 * that is already aggregated into the night's three collections. Neither is
 * published. A spread would have published both.
 *
 * IT HAS NO ACCESS TO ANYTHING DANGEROUS. The projection takes an aggregate and
 * returns data. It receives no `Env`, cannot read a credential, performs no I/O,
 * and reads no clock — so there is no path by which a secret, a request id or a
 * timestamp could reach the public payload.
 */

import type {
  CellAnalysisProvenance,
  CellConsumableStatus,
  CellCounts,
  CellPreparation,
  CellSimcProfileEvaluation,
  SimcProfileRelativeCounts,
  PlayerFightResult,
} from "../aggregation/cell.js";
import type {
  BatchFailure,
  CoverageSummary,
  FightSummary,
  PlayerSeries,
  PlayerSummary,
  PointComparability,
  RaidNightAnalysis,
  RecurrenceGroup,
  RecurrenceSummary,
  SeriesPoint,
} from "../aggregation/raid-night.js";
import {
  discloseRaidNightCoverage,
  type RaidNightCoverageDisclosure,
} from "../aggregation/raid-night-disclosure.js";
import { CAPABILITY } from "./analysis-contract.js";
import {
  PublicRaidNightResultSchema,
  PUBLIC_RAID_NIGHT_SCHEMA_VERSION,
  type PublicAnalysisRef,
  type PublicCell,
  type PublicCellCounts,
  type PublicCellPreparation,
  type PublicCoverageSummary,
  type PublicFightSummary,
  type PublicPlayerSummary,
  type PublicRaidNightCoverageDisclosure,
  type PublicRaidNightResult,
  type PublicRecurrenceGroup,
} from "./raid-night-contract.js";

/** Tally rows are rebuilt element by element so a future extra field cannot ride along. */
function projectTallies(
  rows: readonly { readonly key: string; readonly count: number }[],
): { key: string; count: number }[] {
  return rows.map((row) => ({ key: row.key, count: row.count }));
}

function projectCounts(counts: CellCounts): PublicCellCounts {
  return {
    eligibleDecisions: counts.eligibleDecisions,
    match: counts.match,
    rejected: counts.rejected,
    unknown: counts.unknown,
    resolvedComparisons: counts.resolvedComparisons,
    exactEntryMatches: counts.exactEntryMatches,
    tokenConvergedMatches: counts.tokenConvergedMatches,
    excludedCastCount: counts.excludedCastCount,
    selectionPrecision: projectTallies(counts.selectionPrecision),
    unknownBases: projectTallies(counts.unknownBases),
    unknownBlockerClasses: projectTallies(counts.unknownBlockerClasses),
    exclusions: projectTallies(counts.exclusions),
  };
}

function projectProfileCounts(counts: SimcProfileRelativeCounts) {
  return {
    decisions: counts.decisions,
    match: counts.match,
    rejected: counts.rejected,
    unknown: counts.unknown,
  };
}

function projectCellSimcProfile(evaluation: CellSimcProfileEvaluation) {
  return {
    basis: "SIMC_PROFILE_RELATIVE" as const,
    encounterStateObserved: false as const,
    coverage: projectProfileCounts(evaluation.counts),
    sources: evaluation.sources.map((source) => ({
      datasetRevision: source.datasetRevision,
      simcCommit: source.simcCommit,
      clientBuild: source.clientBuild,
      environmentCommit: source.environmentCommit,
      aplAuthorityId: source.aplAuthorityId,
      profilePath: source.profilePath,
      profileSha256: source.profileSha256,
    })),
  };
}

function projectProvenance(provenance: CellAnalysisProvenance) {
  return {
    analyzerId: provenance.analyzerId,
    specId: provenance.specId,
    normalizationRevision: provenance.normalizationRevision,
    authorityId: provenance.authorityId,
    authorityArtifactRevision: provenance.authorityArtifactRevision,
    authorityCommitSha: provenance.authorityCommitSha,
  };
}

/**
 * Builds the retrieval coordinate for a cell.
 *
 * CONSTRUCTED HERE, NEVER ACCEPTED FROM THE DOMAIN. The internal cell carries no
 * reference, and it should not: a caller-supplied coordinate could disagree with
 * the cell it sits on, sending a reader to a different player's fight. The three
 * parts come from the aggregate's own identity and the cell's own ids, so they
 * cannot drift from what they describe.
 */
function analysisRefFor(reportCode: string, cell: PlayerFightResult): PublicAnalysisRef {
  return { reportCode, fightId: cell.fightId, sourceId: cell.sourceId };
}

/**
 * Projects one cell, preserving the variant it actually is.
 *
 * The switch is exhaustive, so adding a cell kind to the domain becomes a
 * compile error here. A new kind cannot reach the wire without somebody deciding
 * what it should look like.
 *
 * `analysisRef` appears on exactly the two variants a completed single-fight
 * analysis exists for. ABSENT has none because the player was not in the fight;
 * ANALYSIS_UNAVAILABLE has none because nothing was ever analyzed — publishing
 * one would imply a document that does not exist.
 */
/**
 * One cell, projected.
 *
 * EXPORTED IN M8-G so the encounter-context document can reuse M7's compact cell
 * rather than restate its four-variant union. The behaviour is unchanged and the
 * raid-night document still calls it identically; a second implementation would
 * be a second place for a variant to drift.
 */
/** The cell's compact consumable status, copied field for field (never aliased). */
function projectCellPreparation(preparation: CellPreparation): PublicCellPreparation {
  if (preparation.assessment === "NOT_ASSESSED") {
    return { assessment: "NOT_ASSESSED", reason: preparation.reason };
  }
  type PublicStatus = Extract<PublicCellPreparation, { assessment: "ASSESSED" }>["statuses"]["healthPotion"];
  const status = (entry: CellConsumableStatus): PublicStatus =>
    entry.countState === "OBSERVED"
      ? { countState: "OBSERVED", count: entry.count }
      : {
          countState: "UNKNOWN",
          observedAtLeast: entry.observedAtLeast,
          reasonCodes: [...entry.reasonCodes],
        };
  return {
    assessment: "ASSESSED",
    statuses: {
      healthPotion: status(preparation.statuses.healthPotion),
      healthstone: status(preparation.statuses.healthstone),
      combatPotion: status(preparation.statuses.combatPotion),
    },
  };
}

export function projectCell(reportCode: string, cell: PlayerFightResult): PublicCell {
  switch (cell.kind) {
    case "ABSENT":
      // Identity only. No spec, no status, no counts, no reference.
      return {
        kind: "ABSENT",
        fightId: cell.fightId,
        playerKey: cell.playerKey,
        sourceId: cell.sourceId,
      };
    case "ANALYZED":
      return {
        kind: "ANALYZED",
        fightId: cell.fightId,
        playerKey: cell.playerKey,
        sourceId: cell.sourceId,
        specName: cell.specName,
        provenance: projectProvenance(cell.provenance),
        counts: projectCounts(cell.counts),
        ...(cell.simcProfileEvaluation === undefined
          ? {}
          : { simcProfileEvaluation: projectCellSimcProfile(cell.simcProfileEvaluation) }),
        analysisRef: analysisRefFor(reportCode, cell),
        preparation: projectCellPreparation(cell.preparation),
        // `cell.recurrence` is NOT projected. Its patterns are already summed
        // into the night's three collections, and publishing them twice would
        // put two copies of one fact on the wire.
      };
    case "NOT_ANALYZED":
      return {
        kind: "NOT_ANALYZED",
        fightId: cell.fightId,
        playerKey: cell.playerKey,
        sourceId: cell.sourceId,
        specName: cell.specName,
        status: cell.status,
        detail: cell.detail,
        analysisRef: analysisRefFor(reportCode, cell),
        preparation: projectCellPreparation(cell.preparation),
      };
    case "ANALYSIS_UNAVAILABLE":
      return {
        kind: "ANALYSIS_UNAVAILABLE",
        fightId: cell.fightId,
        playerKey: cell.playerKey,
        sourceId: cell.sourceId,
        specName: cell.specName,
        reason: cell.reason,
        // Assessed when the fight was retrieved; NOT_ASSESSED when it failed.
        preparation: projectCellPreparation(cell.preparation),
      };
  }
}

function projectFight(fight: FightSummary): PublicFightSummary {
  return {
    fightId: fight.fightId,
    name: fight.name,
    encounterId: fight.encounterId,
    difficulty: fight.difficulty,
    size: fight.size,
    kill: fight.kill,
    startTimeMs: fight.startTimeMs,
    endTimeMs: fight.endTimeMs,
    durationMs: fight.durationMs,
    participantCount: fight.participantCount,
    analyzedCount: fight.analyzedCount,
    processingOutcome: fight.processingOutcome,
  };
}

function projectPlayer(player: PlayerSummary): PublicPlayerSummary {
  return {
    playerKey: player.playerKey,
    sourceId: player.sourceId,
    name: player.name,
    className: player.className,
    server: player.server,
    observedSpecNames: [...player.observedSpecNames],
    specChanged: player.specChanged,
    fightsPresent: player.fightsPresent,
    fightsAbsent: player.fightsAbsent,
  };
}

function projectCoverage(coverage: CoverageSummary): PublicCoverageSummary {
  return {
    cellsTotal: coverage.cellsTotal,
    cellsAnalyzed: coverage.cellsAnalyzed,
    cellsAbsent: coverage.cellsAbsent,
    cellsSpecNotSupported: coverage.cellsSpecNotSupported,
    cellsAuthorityNotAvailable: coverage.cellsAuthorityNotAvailable,
    cellsProfileNotResolved: coverage.cellsProfileNotResolved,
    cellsInsufficientEvidence: coverage.cellsInsufficientEvidence,
    cellsAnalysisUnavailable: coverage.cellsAnalysisUnavailable,
    eligibleDecisionsTotal: coverage.eligibleDecisionsTotal,
    matchTotal: coverage.matchTotal,
    rejectedTotal: coverage.rejectedTotal,
    unknownTotal: coverage.unknownTotal,
    resolvedComparisonsTotal: coverage.resolvedComparisonsTotal,
    excludedCastCountTotal: coverage.excludedCastCountTotal,
    ...(coverage.simcProfileRelative === undefined
      ? {}
      : { simcProfileRelative: projectProfileCounts(coverage.simcProfileRelative) }),
    fightsRequested: coverage.fightsRequested,
    fightsIncluded: coverage.fightsIncluded,
    fightsMissing: coverage.fightsMissing,
    fightsIngested: coverage.fightsIngested,
    fightsNotIngested: coverage.fightsNotIngested,
    fightsFailed: coverage.fightsFailed,
  };
}

function projectRecurrenceGroup(group: RecurrenceGroup): PublicRecurrenceGroup {
  return {
    key: group.key,
    occurrenceCount: group.occurrenceCount,
    fightIds: [...group.fightIds],
    fightCount: group.fightCount,
    playerKeys: [...group.playerKeys],
  };
}

/**
 * The three collections stay three collections.
 *
 * Projected separately rather than through a loop over a merged structure,
 * because the separation is the contract: only `rejectedPatterns` carries
 * evidence about a player.
 */
/** The three recurrence collections, projected. Exported for M8-G's reuse. */
export function projectRecurrence(recurrence: RecurrenceSummary) {
  return {
    rejectedPatterns: recurrence.rejectedPatterns.map(projectRecurrenceGroup),
    evidenceLimitations: recurrence.evidenceLimitations.map(projectRecurrenceGroup),
    exclusionPatterns: recurrence.exclusionPatterns.map(projectRecurrenceGroup),
    ...(recurrence.simcProfileRelativeRejectedPatterns === undefined
      ? {}
      : {
          simcProfileRelativeRejectedPatterns:
            recurrence.simcProfileRelativeRejectedPatterns.map(projectRecurrenceGroup),
        }),
  };
}

/**
 * Projects one series point.
 *
 * The internal point carries the whole cell. Only its DISCRIMINANT is published:
 * the counts and provenance live once in `cells`, and a consumer joins on
 * `(fightId, sourceId)` using the series' own `sourceId`. Publishing the cell
 * again would double the payload and create two copies of one fact that a future
 * projection bug could make disagree.
 */
function projectSeriesPoint(point: SeriesPoint) {
  return {
    fightId: point.fightId,
    encounterId: point.encounterId,
    difficulty: point.difficulty,
    durationMs: point.durationMs,
    kill: point.kill,
    cellKind: point.cell.kind,
  };
}

function projectComparability(comparability: PointComparability) {
  return {
    fromFightId: comparability.fromFightId,
    toFightId: comparability.toFightId,
    sameEncounter: comparability.sameEncounter,
    sameDifficulty: comparability.sameDifficulty,
    sameSpec: comparability.sameSpec,
    sameAnalyzerId: comparability.sameAnalyzerId,
    sameAuthorityRevision: comparability.sameAuthorityRevision,
    sameNormalizationRevision: comparability.sameNormalizationRevision,
  };
}

function projectSeries(series: PlayerSeries) {
  return {
    playerKey: series.playerKey,
    sourceId: series.sourceId,
    points: series.points.map(projectSeriesPoint),
    comparability: series.comparability.map(projectComparability),
  };
}

/**
 * The night's coverage disclosure (M15-F), copied field by field. Derived by
 * the aggregation domain's pure function from this same aggregate's coverage
 * and cells, so it cannot describe a different night; nothing is computed here.
 */
function projectCoverageDisclosure(
  disclosure: RaidNightCoverageDisclosure,
): PublicRaidNightCoverageDisclosure {
  return {
    revision: disclosure.revision,
    assessmentScope: disclosure.assessmentScope,
    disclosures: [...disclosure.disclosures],
    lines: [...disclosure.lines],
  };
}

function projectBatchFailure(failure: BatchFailure) {
  return { fightId: failure.fightId, reason: failure.reason };
}

/**
 * Projects one internal raid-night aggregate into the public contract.
 *
 * ORDERING IS INHERITED, NOT RECOMPUTED. The aggregate is already canonically
 * ordered — fights by id, roster and series by source id, cells by (fight,
 * source), recurrence groups by key — and re-sorting here would create a second
 * definition of "canonical" that could disagree with the first.
 *
 * THE RESULT IS VALIDATED BEFORE IT IS RETURNED. Not as input sanitisation — the
 * input is trusted domain data — but because a projection bug is otherwise
 * invisible until a consumer chokes on it. The schema is `.strict()` throughout,
 * so a field this function accidentally added would be rejected here rather than
 * published. `parse` throws on mismatch, and that throw is correct: an invalid
 * public shape is an internal defect, not a condition to downgrade into a
 * plausible-looking answer. How a transport reports such a defect is M7-F's
 * decision, not this layer's.
 */
export function projectRaidNightResult(aggregate: RaidNightAnalysis): PublicRaidNightResult {
  const reportCode = aggregate.identity.reportCode;

  const result = {
    schemaVersion: PUBLIC_RAID_NIGHT_SCHEMA_VERSION,
    status: aggregate.status,
    // The SAME object the single-fight contract publishes, imported rather than
    // restated. A second literal would be a second promise that could drift.
    capability: CAPABILITY,
    identity: {
      reportCode: aggregate.identity.reportCode,
      reportRevision: aggregate.identity.reportRevision,
      logVersion: aggregate.identity.logVersion,
      gameVersion: aggregate.identity.gameVersion,
      reportStartTimeUnixMs: aggregate.identity.reportStartTimeUnixMs,
      reportEndTimeUnixMs: aggregate.identity.reportEndTimeUnixMs,
      includedFightIds: [...aggregate.identity.includedFightIds],
    },
    fights: aggregate.fights.map(projectFight),
    roster: aggregate.roster.map(projectPlayer),
    cells: aggregate.cells.map((cell) => projectCell(reportCode, cell)),
    coverage: projectCoverage(aggregate.coverage),
    coverageDisclosure: projectCoverageDisclosure(discloseRaidNightCoverage(aggregate)),
    recurrence: projectRecurrence(aggregate.recurrence),
    trendEvidence: { series: aggregate.trendEvidence.series.map(projectSeries) },
    partialFailures: aggregate.partialFailures.map(projectBatchFailure),
  };

  return PublicRaidNightResultSchema.parse(result);
}
