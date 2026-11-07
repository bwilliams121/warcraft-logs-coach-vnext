/**
 * The raid-night aggregator.
 *
 * ONE PURE FUNCTION over facts somebody else established. No network, no clock,
 * no randomness, no storage, no Cloudflare binding, and nothing from
 * `src/specs/`, `src/simc/` or the state engine. It cannot retrieve a fight,
 * cannot run an analyzer, and cannot construct combat state — a layering test
 * enforces every one of those.
 *
 * WHY THAT MATTERS RATHER THAN BEING TIDY
 *
 * An aggregator that could reach the analyzer would eventually be asked to fill
 * a gap by re-deriving something, and a second gameplay evaluator would exist
 * with a smaller vocabulary and no tests. Everything here counts, groups and
 * orders what it was handed. If a fact is not in the cells, this module cannot
 * produce it.
 *
 * IT IS ALSO SPEC-NEUTRAL, AND STAYS THAT WAY
 *
 * Nothing below knows what a Rogue is. Recurrence keys are opaque strings
 * composed by `cell-projection.ts`, which is the single module allowed to read a
 * specialization's own result type. When M10 adds Protection Paladin, that file
 * changes and this one does not.
 *
 * WHAT IT REFUSES TO SAY
 *
 * No score, no grade, no rate, no percentage, no "improving". UNKNOWN is carried
 * as UNKNOWN and never folded into a miss or a neutral. A pull nobody analyzed
 * contributes to participation and coverage counts and contributes no zeroes to
 * any decision total, because a zero read as an observation is a claim that
 * something was looked at and found empty.
 */

import type { CellTally, PlayerFightResult } from "./cell.js";
import type {
  BatchFailure,
  BatchFailureReason,
  Comparability,
  CoverageSummary,
  FightProcessingOutcome,
  FightSummary,
  PlayerSeries,
  PlayerSummary,
  PointComparability,
  RaidNightAnalysis,
  RecurrenceGroup,
  RecurrenceSummary,
  SeriesPoint,
  VerifiedRaidNightInput,
} from "./raid-night.js";
import { BATCH_FAILURE_REASONS, isVerifiedRaidNightInput } from "./raid-night.js";

const ASCENDING = (left: number, right: number): number => left - right;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

interface PatternAccumulator {
  occurrenceCount: number;
  readonly fightIds: Set<number>;
  /** Kept with its source id so the published order can be numeric. */
  readonly players: Map<string, number>;
}

/**
 * Collects one recurrence collection across every analyzed cell.
 *
 * `select` names WHICH of the three lists on a cell this accumulation is about.
 * The three are never combined — that separation was already made in the
 * projection, and this function only preserves it.
 */
function collectPatterns(
  cells: readonly PlayerFightResult[],
  select: (cell: Extract<PlayerFightResult, { kind: "ANALYZED" }>) => readonly CellTally[],
): readonly RecurrenceGroup[] {
  const byKey = new Map<string, PatternAccumulator>();

  for (const cell of cells) {
    if (cell.kind !== "ANALYZED") {
      // A cell with no analysis contributes no patterns. It does NOT contribute
      // an empty pattern, which would be a group nobody observed.
      continue;
    }
    for (const tally of select(cell)) {
      const existing = byKey.get(tally.key) ?? {
        occurrenceCount: 0,
        fightIds: new Set<number>(),
        players: new Map<string, number>(),
      };
      existing.occurrenceCount += tally.count;
      existing.fightIds.add(cell.fightId);
      existing.players.set(cell.playerKey, cell.sourceId);
      byKey.set(tally.key, existing);
    }
  }

  return (
    [...byKey.entries()]
      .map(([key, accumulated]) => ({
        key,
        occurrenceCount: accumulated.occurrenceCount,
        fightIds: [...accumulated.fightIds].sort(ASCENDING),
        fightCount: accumulated.fightIds.size,
        playerKeys: [...accumulated.players.entries()]
          .sort(([leftKey, leftId], [rightKey, rightId]) =>
            leftId === rightId ? compareStrings(leftKey, rightKey) : ASCENDING(leftId, rightId),
          )
          .map(([playerKey]) => playerKey),
      }))
      // Lexicographic by key. The aggregator cannot know a specialization's token
      // vocabulary — that is the price of staying spec-neutral — so the order is
      // the key itself, which is total, stable and derived from the facts.
      .sort((left, right) => compareStrings(left.key, right.key))
  );
}

/**
 * The three recurrence collections over whatever cells it is given.
 *
 * EXPORTED IN M8-D, AND ONLY BECAUSE IT IS ALREADY A PURE FUNCTION OF `cells`.
 * Encounter-scoped progression needs the same three collections over a SUBSET of
 * the night — the pulls of one encounter — and the honest way to get that is to
 * call this with a filtered list rather than to write a second tally that could
 * drift in its ordering, its key handling or its treatment of non-analyzed cells.
 *
 * Nothing about the night-level behaviour changes: `aggregateRaidNight` still
 * calls it with every cell, and the output for that call is identical.
 */
export function summarizeRecurrence(cells: readonly PlayerFightResult[]): RecurrenceSummary {
  const profileRejected = collectPatterns(
    cells,
    (cell) => cell.recurrence.simcProfileRelativeRejectedPatterns ?? [],
  );
  return {
    rejectedPatterns: collectPatterns(cells, (cell) => cell.recurrence.rejectedPatterns),
    evidenceLimitations: collectPatterns(cells, (cell) => cell.recurrence.evidenceLimitations),
    exclusionPatterns: collectPatterns(cells, (cell) => cell.recurrence.exclusionPatterns),
    ...(profileRejected.length === 0 ? {} : { simcProfileRelativeRejectedPatterns: profileRejected }),
  };
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

function summarizeCoverage(
  cells: readonly PlayerFightResult[],
  snapshot: VerifiedRaidNightInput["snapshot"],
  outcomes: readonly { readonly outcome: FightProcessingOutcome }[],
): CoverageSummary {
  let cellsAnalyzed = 0;
  let cellsAbsent = 0;
  let cellsSpecNotSupported = 0;
  let cellsAuthorityNotAvailable = 0;
  let cellsProfileNotResolved = 0;
  let cellsInsufficientEvidence = 0;
  let cellsAnalysisUnavailable = 0;

  let eligibleDecisionsTotal = 0;
  let matchTotal = 0;
  let rejectedTotal = 0;
  let unknownTotal = 0;
  let resolvedComparisonsTotal = 0;
  let excludedCastCountTotal = 0;
  const profile = { decisions: 0, match: 0, rejected: 0, unknown: 0 };

  for (const cell of cells) {
    switch (cell.kind) {
      case "ANALYZED":
        cellsAnalyzed += 1;
        // ONLY analyzed cells contribute decision totals. Every other kind adds
        // nothing — not even zero — because a zero here would be indistinguishable
        // from a pull that was examined and found empty.
        eligibleDecisionsTotal += cell.counts.eligibleDecisions;
        matchTotal += cell.counts.match;
        rejectedTotal += cell.counts.rejected;
        unknownTotal += cell.counts.unknown;
        resolvedComparisonsTotal += cell.counts.resolvedComparisons;
        excludedCastCountTotal += cell.counts.excludedCastCount;
        if (cell.simcProfileEvaluation !== undefined) {
          profile.decisions += cell.simcProfileEvaluation.counts.decisions;
          profile.match += cell.simcProfileEvaluation.counts.match;
          profile.rejected += cell.simcProfileEvaluation.counts.rejected;
          profile.unknown += cell.simcProfileEvaluation.counts.unknown;
        }
        break;
      case "ABSENT":
        cellsAbsent += 1;
        break;
      case "ANALYSIS_UNAVAILABLE":
        cellsAnalysisUnavailable += 1;
        break;
      case "NOT_ANALYZED":
        switch (cell.status) {
          case "SPEC_NOT_SUPPORTED":
            cellsSpecNotSupported += 1;
            break;
          case "AUTHORITY_NOT_AVAILABLE":
            cellsAuthorityNotAvailable += 1;
            break;
          case "PROFILE_NOT_RESOLVED":
            cellsProfileNotResolved += 1;
            break;
          case "INSUFFICIENT_EVIDENCE":
            cellsInsufficientEvidence += 1;
            break;
        }
        break;
    }
  }

  return {
    cellsTotal: cells.length,
    cellsAnalyzed,
    cellsAbsent,
    cellsSpecNotSupported,
    cellsAuthorityNotAvailable,
    cellsProfileNotResolved,
    cellsInsufficientEvidence,
    cellsAnalysisUnavailable,
    eligibleDecisionsTotal,
    matchTotal,
    rejectedTotal,
    unknownTotal,
    resolvedComparisonsTotal,
    excludedCastCountTotal,
    ...(profile.decisions === 0 ? {} : { simcProfileRelative: profile }),
    fightsRequested: snapshot.requestedFightIds.length,
    fightsIncluded: snapshot.identity.includedFightIds.length,
    fightsMissing: snapshot.missingRequestedFightIds.length,
    fightsIngested: outcomes.filter((record) => record.outcome === "INGESTED").length,
    // Its own count, so `fightsIncluded === ingested + notIngested + failed`
    // holds and a small `fightsIngested` reads as a deliberate saving rather
    // than a retrieval problem.
    fightsNotIngested: outcomes.filter((record) => record.outcome === "NOT_INGESTED").length,
    fightsFailed: outcomes.filter((record) => record.outcome === "INGESTION_FAILED").length,
  };
}

// ---------------------------------------------------------------------------
// Comparability
// ---------------------------------------------------------------------------

/**
 * Compares one property of two adjacent points.
 *
 * `undefined` on either side means the property does not exist there — an absent
 * pull has no analyzer, an unsupported spec has no authority revision. That is
 * NOT evidence the two differ, so it yields UNKNOWN. Returning `DIFFERENT` would
 * assert a comparison that was never possible.
 */
function compare<T>(left: T | undefined, right: T | undefined): Comparability {
  if (left === undefined || right === undefined) {
    return "UNKNOWN";
  }
  return left === right ? "SAME" : "DIFFERENT";
}

/**
 * The specialization a point observed, when it is actually known.
 *
 * `undefined` for an ABSENT cell — they played nothing — and ALSO for a present
 * cell whose `specName` is `null`, because Warcraft Logs supplied none. Two
 * pulls whose specializations are both unknown are not thereby the SAME
 * specialization, so this collapses both cases to "not knowable" and lets
 * `compare` answer UNKNOWN.
 */
function specNameOf(cell: PlayerFightResult): string | undefined {
  return cell.kind === "ABSENT" ? undefined : (cell.specName ?? undefined);
}

function provenanceOf(cell: PlayerFightResult) {
  return cell.kind === "ANALYZED" ? cell.provenance : undefined;
}

function comparabilityBetween(from: SeriesPoint, to: SeriesPoint): PointComparability {
  const fromProvenance = provenanceOf(from.cell);
  const toProvenance = provenanceOf(to.cell);

  return {
    fromFightId: from.fightId,
    toFightId: to.fightId,
    // Encounter identity is a fight fact and is always known for an included
    // fight, so these two are genuinely comparable whatever the cell holds.
    sameEncounter: compare(from.encounterId, to.encounterId),
    sameDifficulty: compare(from.difficulty ?? undefined, to.difficulty ?? undefined),
    sameSpec: compare(specNameOf(from.cell), specNameOf(to.cell)),
    sameAnalyzerId: compare(fromProvenance?.analyzerId, toProvenance?.analyzerId),
    sameAuthorityRevision: compare(
      fromProvenance?.authorityArtifactRevision,
      toProvenance?.authorityArtifactRevision,
    ),
    sameNormalizationRevision: compare(
      fromProvenance?.normalizationRevision,
      toProvenance?.normalizationRevision,
    ),
  };
}

// ---------------------------------------------------------------------------
// The aggregation
// ---------------------------------------------------------------------------

/**
 * Builds one deterministic raid-night aggregate.
 *
 * ACCEPTS ONLY A VERIFIED INPUT, AND CHECKS THAT AT RUNTIME.
 *
 * The parameter type stops a caller from passing raw facts by accident.
 * TypeScript alone is not enough — `facts as unknown as VerifiedRaidNightInput`
 * compiles — so the private brand is re-read here before anything is counted. A
 * forged assertion that never passed through `verifyRaidNightInput` therefore
 * fails closed rather than producing an aggregate over facts whose revision and
 * topology were never proven.
 *
 * It THROWS rather than returning a result, because reaching this line with an
 * unverified input is an internal defect and not a condition a caller can
 * meaningfully handle. That is the same judgement `projectAnalysisResult` makes
 * about an invalid public shape: a defect must not be downgraded into a
 * plausible-looking answer.
 *
 * ORDERING IS DERIVED FROM FACTS, NEVER FROM THE CALLER. Nothing below depends
 * on the order cells, fights or outcomes arrived in; every collection is sorted
 * by a factual key. Two callers assembling the same facts in different orders
 * get byte-identical output.
 */
export function aggregateRaidNight(input: VerifiedRaidNightInput): RaidNightAnalysis {
  if (!isVerifiedRaidNightInput(input)) {
    throw new Error("aggregateRaidNight received an input that did not pass through verifyRaidNightInput");
  }

  const { snapshot, fightOutcomes, cells } = input;

  const outcomeByFightId = new Map(fightOutcomes.map((record) => [record.fightId, record.outcome]));
  const includedFights = [...snapshot.fights].sort((left, right) => ASCENDING(left.fightId, right.fightId));

  const orderedCells = [...cells].sort((left, right) =>
    left.fightId === right.fightId
      ? ASCENDING(left.sourceId, right.sourceId)
      : ASCENDING(left.fightId, right.fightId),
  );

  // ---- fight summaries, for INCLUDED fights only ----
  //
  // A requested fight the report does not contain gets no summary. There is no
  // metadata to describe and inventing one would create a pull that never
  // happened; it appears as a batch failure instead.
  const fights: readonly FightSummary[] = includedFights.map((fight) => {
    const fightCells = orderedCells.filter((cell) => cell.fightId === fight.fightId);
    return {
      fightId: fight.fightId,
      name: fight.name,
      encounterId: fight.encounterId,
      difficulty: fight.difficulty,
      size: fight.size,
      kill: fight.kill,
      startTimeMs: fight.startTimeMs,
      endTimeMs: fight.endTimeMs,
      durationMs: fight.endTimeMs - fight.startTimeMs,
      participantCount: fight.participants.length,
      analyzedCount: fightCells.filter((cell) => cell.kind === "ANALYZED").length,
      // Unreachable: the input gate proves one record per included fight. Kept
      // as INGESTION_FAILED rather than INGESTED so a hypothetical gap fails
      // conservatively instead of claiming evidence that was never retrieved.
      processingOutcome: outcomeByFightId.get(fight.fightId) ?? "INGESTION_FAILED",
    };
  });

  // ---- roster summaries ----
  const roster: readonly PlayerSummary[] = [...snapshot.players]
    .sort((left, right) => ASCENDING(left.sourceId, right.sourceId))
    .map((player) => {
      const playerCells = orderedCells.filter((cell) => cell.sourceId === player.sourceId);
      // First appearance by ascending fight id, which `orderedCells` already is.
      const observedSpecNames: string[] = [];
      for (const cell of playerCells) {
        const specName = specNameOf(cell);
        if (specName !== undefined && !observedSpecNames.includes(specName)) {
          observedSpecNames.push(specName);
        }
      }
      const fightsAbsent = playerCells.filter((cell) => cell.kind === "ABSENT").length;
      return {
        playerKey: playerCells[0]?.playerKey ?? `${snapshot.identity.reportCode}:${String(player.sourceId)}`,
        sourceId: player.sourceId,
        name: player.name,
        className: player.className,
        server: player.server,
        observedSpecNames,
        // A fact, not a regression. Raiders change specialization.
        specChanged: observedSpecNames.length > 1,
        fightsPresent: playerCells.length - fightsAbsent,
        fightsAbsent,
      };
    });

  // ---- trend evidence: an ordered factual series, and nothing more ----
  const fightById = new Map(includedFights.map((fight) => [fight.fightId, fight]));
  const series: readonly PlayerSeries[] = roster.map((player) => {
    const points: SeriesPoint[] = [];
    for (const cell of orderedCells) {
      if (cell.sourceId !== player.sourceId) continue;
      const fight = fightById.get(cell.fightId);
      if (fight === undefined) continue;
      points.push({
        fightId: fight.fightId,
        encounterId: fight.encounterId,
        difficulty: fight.difficulty,
        durationMs: fight.endTimeMs - fight.startTimeMs,
        kill: fight.kill,
        cell,
      });
    }

    const comparability: PointComparability[] = [];
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      if (from === undefined || to === undefined) continue;
      comparability.push(comparabilityBetween(from, to));
    }

    return { playerKey: player.playerKey, sourceId: player.sourceId, points, comparability };
  });

  // ---- partial failures: fight-level only ----
  const partialFailures: BatchFailure[] = [
    ...snapshot.missingRequestedFightIds.map((fightId): BatchFailure => ({
      fightId,
      reason: "FIGHT_NOT_FOUND",
    })),
    ...fightOutcomes
      .filter((record) => record.outcome === "INGESTION_FAILED")
      .map((record): BatchFailure => ({ fightId: record.fightId, reason: "FIGHT_INGESTION_FAILED" })),
  ].sort((left, right) =>
    left.fightId === right.fightId
      ? ASCENDING(reasonOrder(left.reason), reasonOrder(right.reason))
      : ASCENDING(left.fightId, right.fightId),
  );

  const coverage = summarizeCoverage(orderedCells, snapshot, fightOutcomes);

  return {
    identity: snapshot.identity,
    // A night with no analyzed cell is a complete, truthful result — and it must
    // not read as a clean one. Absence of analysis is not evidence of good play.
    status: coverage.cellsAnalyzed > 0 ? "ANALYZED" : "NO_ANALYZED_CELLS",
    fights,
    roster,
    cells: orderedCells,
    coverage,
    recurrence: summarizeRecurrence(orderedCells),
    trendEvidence: { series },
    partialFailures,
  };
}

/** Fixed vocabulary order, so equal fight ids still sort deterministically. */
function reasonOrder(reason: BatchFailureReason): number {
  return BATCH_FAILURE_REASONS.indexOf(reason);
}
