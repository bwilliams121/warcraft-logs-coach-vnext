/**
 * The ONE place aggregation is allowed to know what a specialization produced.
 *
 * WHY THIS BOUNDARY EXISTS, AND WHY IT IS EXACTLY ONE MODULE
 *
 * `SpecAnalysis` is currently an alias for Assassination's own result type. An
 * aggregator that read it directly would acquire Rogue knowledge in every
 * counting function, and the moment M10 adds a second specialization that type
 * becomes a union — at which point every one of those functions either breaks or
 * grows a `if (spec === ...)` branch. That is the architecture this project
 * rejects, rebuilt by accident one helper at a time.
 *
 * So the spec-aware surface is deliberately a single module with a single job:
 * turn one heavy, spec-shaped analysis into a small, spec-NEUTRAL cell. When
 * M10 landed, this file did NOT have to learn about Protection Paladin: since
 * M10-A it reads the registration-supplied view, so a second specialization
 * changed its own registration and nothing in this domain.
 *
 * WHAT IT DECIDES, WHICH IS MORE THAN IT LOOKS
 *
 * It decides what is SAFE to aggregate. Three kinds of thing are dropped here
 * permanently, and dropping them is the point rather than a side effect:
 *
 *     debugging internals   rawBlocker, the engine's note on where a scan stopped
 *     unpublishable state   observedActionRejected, a boolean over a three-state
 *                           judgement whose `false` means "not proven", not "no"
 *     bulk evidence         every decision and excluded cast, ~456 KB per fight
 *
 * It also validates the count invariants ONCE, here, so no later layer has to
 * trust arithmetic it did not perform.
 *
 * WHAT IT IS NOT
 *
 * It runs nothing. No service, no analyzer, no spec resolution, no state
 * construction. Every fact it reads was already determined by the layer that
 * called it; this module only reshapes.
 */

import type { ConsumableStatus } from "../analysis/preparation/consumable-status.js";
import {
  isSimcProfileRelative,
  simcProfileRelativeCountsOf,
  simcProfileSourcesOf,
} from "../findings/simc-profile-view.js";
import type { FightAnalysis, PreparationOutcome } from "../services/result.js";
import { playerKeyOf } from "../wcl/roster-snapshot.js";
import type {
  AnalysisUnavailableReason,
  CellCounts,
  CellRecurrence,
  CellTally,
  CellConsumableStatus,
  CellPreparation,
  NonAnalyzedStatus,
  PlayerFightResult,
} from "./cell.js";

/**
 * Why a `FightAnalysis` could not be projected into a cell.
 *
 * Exactly one reason, and it is not about the player: the analysis contradicts
 * itself arithmetically. Aggregating numbers that do not reconcile would produce
 * a confident total built on a defect, so this fails closed instead.
 */
export type CellProjectionFailure =
  | "COUNTS_DO_NOT_RECONCILE"
  /** The analysis reported ANALYZED but carried no analyzer or specialization. */
  | "ANALYZED_WITHOUT_ANALYZER"
  /** The analysis reported ANALYZED but its registration supplied no view of it. */
  | "ANALYZED_WITHOUT_VIEW";

export type CellProjection =
  | { readonly ok: true; readonly cell: PlayerFightResult }
  | { readonly ok: false; readonly reason: CellProjectionFailure };

/**
 * What the projection needs beyond the analysis itself.
 *
 * `normalizationRevision` is here because `FightAnalysis` genuinely does not
 * carry it — it lives on the normalized fight the analysis ran over, which the
 * application layer holds and the analysis result does not. Comparability across
 * two pulls needs it, so rather than reaching into a `CombatFight` this module
 * must not touch, the caller that already has one supplies the string.
 */
export interface CellProjectionInput {
  readonly analysis: FightAnalysis;
  readonly normalizationRevision: string;
}

/** A pattern key. Composite and opaque above this module, by design. */
function patternKey(...parts: readonly string[]): string {
  return parts.join("|");
}

/** Counts occurrences of a key, then emits them in a stable lexicographic order. */
function tallyOf(keys: readonly string[]): readonly CellTally[] {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
}

/** Re-shapes an M5 tally into the generic form, preserving its order. */
function genericTally(
  rows: readonly { readonly key: string; readonly count: number }[],
): readonly CellTally[] {
  return rows.map((row) => ({ key: row.key, count: row.count }));
}

/**
 * The arithmetic every ANALYZED cell must satisfy before it may be summed.
 *
 * Each equation below is one M5-E already establishes for a single fight; they
 * are re-checked here because an aggregate multiplies any defect by the number
 * of cells, and a total is exactly the place a reader stops questioning the
 * parts.
 */
function countsReconcile(counts: CellCounts, excludedLength: number, comparisonLength: number): boolean {
  const outcomesPartition = counts.match + counts.rejected + counts.unknown === counts.eligibleDecisions;
  const resolvedIsMatchPlusRejected = counts.resolvedComparisons === counts.match + counts.rejected;
  const precisionPartitionsMatches = counts.exactEntryMatches + counts.tokenConvergedMatches === counts.match;
  const eligibleIsComparisons = counts.eligibleDecisions === comparisonLength;
  const excludedIsExclusions = counts.excludedCastCount === excludedLength;

  return (
    outcomesPartition &&
    resolvedIsMatchPlusRejected &&
    precisionPartitionsMatches &&
    eligibleIsComparisons &&
    excludedIsExclusions
  );
}

/**
 * Projects one completed `FightAnalysis` into a cell.
 *
 * Total over every analysis status. The ANALYZED branch reduces; the other four
 * carry their status and the analyzer's own explanation, and — crucially — no
 * counts object at all. A `SPEC_NOT_SUPPORTED` cell with zeroes would read as a
 * player who did nothing right, and the only reliable defence is that the field
 * does not exist.
 */
export function toPlayerFightCell(input: CellProjectionInput): CellProjection {
  const { analysis: fightAnalysis, normalizationRevision } = input;
  const identity = fightAnalysis.identity;
  const sourceId = identity.player.sourceId;
  const cellIdentity = {
    fightId: identity.fight.id,
    playerKey: playerKeyOf(identity.report.code, sourceId),
    sourceId,
  } as const;

  const result = fightAnalysis.analysis;

  if (result.status !== "ANALYZED") {
    return {
      ok: true,
      cell: {
        kind: "NOT_ANALYZED",
        ...cellIdentity,
        specName: identity.player.specName,
        // The M6 vocabulary, unchanged. The union above is exactly these four.
        status: result.status satisfies NonAnalyzedStatus,
        detail: result.detail,
        preparation: cellPreparationOf(fightAnalysis.preparation),
      },
    };
  }

  // ANALYZED must have produced an analyzer and a recognised specialization.
  // Both are non-null on this path by construction; a null here would mean the
  // service produced a result it could not have produced, and guessing a value
  // for provenance would silently make two incomparable pulls look comparable.
  if (fightAnalysis.analyzerId === null || fightAnalysis.specId === null) {
    return { ok: false, reason: "ANALYZED_WITHOUT_ANALYZER" };
  }

  // The specialization's payload is not read here. Since M10-A this module
  // consumes the VIEW the analyzer's registration produced — the one form in
  // which shared code sees an analysis — so a second specialization changes
  // its own registration and nothing in this domain.
  const view = fightAnalysis.observedDecisions;
  if (view === null) {
    return { ok: false, reason: "ANALYZED_WITHOUT_VIEW" };
  }

  const coverage = view.coverage;
  const counts: CellCounts = {
    eligibleDecisions: coverage.eligibleDecisions,
    match: coverage.match,
    rejected: coverage.rejected,
    unknown: coverage.unknown,
    resolvedComparisons: coverage.resolvedComparisons,
    exactEntryMatches: coverage.exactEntryMatches,
    tokenConvergedMatches: coverage.tokenConvergedMatches,
    excludedCastCount: coverage.excludedCastCount,
    selectionPrecision: genericTally(coverage.selectionPrecision),
    unknownBases: genericTally(coverage.unknownBases),
    unknownBlockerClasses: genericTally(coverage.unknownBlockerClasses),
    exclusions: genericTally(coverage.exclusions),
  };

  if (!countsReconcile(counts, view.exclusions.length, view.decisions.length)) {
    return { ok: false, reason: "COUNTS_DO_NOT_RECONCILE" };
  }

  // ---- recurrence, separated by MEANING at the moment of extraction ----
  //
  // Doing the split here rather than downstream is what makes merging them
  // later impossible: the aggregator never sees a decision, only three
  // already-distinct lists.
  const rejectedKeys: string[] = [];
  const profileRejectedKeys: string[] = [];
  const evidenceKeys: string[] = [];

  for (const decision of view.decisions) {
    if (decision.outcome === "REJECTED") {
      // The ONLY gameplay-incompatibility evidence in this whole model. The
      // observed token is the authority's own vocabulary, which is precisely
      // why it is flattened into an opaque key before it leaves this module.
      // A rejection read under the pinned SimC profile goes in its own list: its
      // encounter state is modeled, and that must not merge with observed state.
      (isSimcProfileRelative(decision) ? profileRejectedKeys : rejectedKeys).push(
        patternKey(decision.observedToken, decision.basis),
      );
      continue;
    }
    if (decision.outcome === "UNKNOWN") {
      // Why the ANALYZER could not prove the comparison. Never a player fault.
      // A decision with no recorded blocker is still an unresolved decision, so
      // it is counted under an explicit sentinel rather than dropped.
      evidenceKeys.push(patternKey(decision.decisiveBlocker ?? "NO_BLOCKER_RECORDED", decision.basis));
    }
    // MATCH contributes to neither. It is authority-compatible, which is not a
    // pattern worth recurring on and is emphatically not "correct".
  }

  const recurrence: CellRecurrence = {
    rejectedPatterns: tallyOf(rejectedKeys),
    evidenceLimitations: tallyOf(evidenceKeys),
    exclusionPatterns: tallyOf(
      view.exclusions.map((cast) => patternKey(cast.reason, String(cast.abilityGameId))),
    ),
    ...(profileRejectedKeys.length === 0
      ? {}
      : { simcProfileRelativeRejectedPatterns: tallyOf(profileRejectedKeys) }),
  };

  const profileCounts = simcProfileRelativeCountsOf(view.decisions);

  return {
    ok: true,
    cell: {
      kind: "ANALYZED",
      ...cellIdentity,
      specName: identity.player.specName,
      provenance: {
        analyzerId: fightAnalysis.analyzerId,
        specId: fightAnalysis.specId,
        normalizationRevision,
        authorityId: result.authority.authorityId,
        authorityArtifactRevision: result.authority.artifactRevision,
        authorityCommitSha: result.authority.commitSha,
      },
      counts,
      recurrence,
      ...(profileCounts === null
        ? {}
        : {
            simcProfileEvaluation: {
              counts: profileCounts,
              sources: simcProfileSourcesOf(view.decisions).sources.map((source) => ({
                datasetRevision: source.datasetRevision,
                simcCommit: source.simcCommit,
                clientBuild: source.clientBuild,
                environmentCommit: source.environmentCommit,
                aplAuthorityId: source.aplAuthorityId,
                profilePath: source.profilePath,
                profileSha256: source.profileSha256,
              })),
            },
          }),
      // Compact: counts or lower bounds and reason codes, never the uses.
      preparation: cellPreparationOf(fightAnalysis.preparation),
      // NOTHING ELSE CROSSES. `result.comparisons` and `result.excluded` end
      // here, along with every `rawBlocker`, every `observedActionRejected`,
      // every evidence locator and the ingestion scope. The heavy analysis is
      // now releasable, which is the memory reason this boundary exists.
    },
  };
}

/**
 * The cell for a player who was on the roster but not in this pull.
 *
 * Takes no analysis, because there is none — that is the whole fact. A caller
 * cannot accidentally hand it counts.
 */
export function absentCell(options: {
  readonly fightId: number;
  readonly reportCode: string;
  readonly sourceId: number;
}): PlayerFightResult {
  return {
    kind: "ABSENT",
    fightId: options.fightId,
    playerKey: playerKeyOf(options.reportCode, options.sourceId),
    sourceId: options.sourceId,
  };
}

/**
 * The cell for a present player no analyzer ran for.
 *
 * Covers BOTH reasons, which are different kinds of fact: the fight's evidence
 * could not be obtained, or no usable specialization identity was available. The
 * caller supplies which; this function never decides.
 *
 * Distinct from ABSENT — they were there — and distinct from every gameplay
 * status, because no analyzer ran. It carries no counts and, in particular, no
 * UNKNOWN decisions: UNKNOWN is a real M5 outcome meaning the authority could
 * not prove a specific comparison, and manufacturing one per cast to represent an
 * analysis that never happened would put a non-gameplay problem into the gameplay
 * vocabulary.
 */
export function analysisUnavailableCell(options: {
  readonly fightId: number;
  readonly reportCode: string;
  readonly sourceId: number;
  /** M7-C's per-fight fact, passed through. `null` when WCL supplied none. */
  readonly specName: string | null;
  readonly reason: AnalysisUnavailableReason;
  /** The player's consumable status: assessed when the fight was retrieved, else NOT_ASSESSED. */
  readonly preparation: PreparationOutcome;
}): PlayerFightResult {
  return {
    kind: "ANALYSIS_UNAVAILABLE",
    fightId: options.fightId,
    playerKey: playerKeyOf(options.reportCode, options.sourceId),
    sourceId: options.sourceId,
    specName: options.specName,
    reason: options.reason,
    preparation: cellPreparationOf(options.preparation),
  };
}

/**
 * The COMPACT cell form of a preparation outcome (PREP-3): per consumable, a
 * complete count, or UNKNOWN with the lower bound and its reason codes (each
 * once, in first-seen order). The uses and their evidence do not cross into the
 * cell; they stay in the single-fight report.
 */
export function cellPreparationOf(outcome: PreparationOutcome): CellPreparation {
  if (outcome.state === "NOT_ASSESSED") return { assessment: "NOT_ASSESSED", reason: outcome.reason };
  const { statuses } = outcome.report;
  return {
    assessment: "ASSESSED",
    statuses: {
      healthPotion: compactStatus(statuses.HEALTH_POTION),
      healthstone: compactStatus(statuses.HEALTHSTONE),
      combatPotion: compactStatus(statuses.COMBAT_POTION),
    },
  };
}

function compactStatus(status: ConsumableStatus): CellConsumableStatus {
  if (status.state === "OBSERVED") return { countState: "OBSERVED", count: status.count };
  return {
    countState: "UNKNOWN",
    observedAtLeast: status.observedAtLeast,
    reasonCodes: [...new Set(status.reasons.map((reason) => reason.code))],
  };
}
