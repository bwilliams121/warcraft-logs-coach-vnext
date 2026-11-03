/**
 * THE RAID-NIGHT COVERAGE DISCLOSURE (M15-F): what a raid night does not
 * establish, stated from its own coverage and cells.
 *
 * The single-fight document opens its TLDR and report with a coverage line and
 * a never-empty disclosure list (M15-B, M15-D). The raid night carried the same
 * facts only as integer counts, which a summariser can turn into "the raid
 * played cleanly". This is the night's counterpart: `assessmentScope` PARTIAL,
 * machine-readable disclosure codes, and author-templated lines whose first
 * line is always the coverage sentence.
 *
 * A PURE FUNCTION OF THE AGGREGATE. It reads the night's own `coverage` totals,
 * its cells' preparation status and nothing else: no finding is created, no
 * count is recomputed from anything the aggregate does not already state, and
 * there is no score, rate, percentage or ranking anywhere in it.
 *
 * WHAT IT NEVER SAYS
 *
 * - That the night was played well: NO_CELL_ANALYZED says no gameplay analysis
 *   was produced, so nothing is claimed about how anyone played. (The
 *   published text never names clean play at all: the M7-E contract test
 *   forbids the word on a raid night.)
 * - That an UNKNOWN consumable count is zero.
 * - That a cell kind other than ANALYZED is a statement about play.
 */

import type { CellPreparation, PlayerFightResult } from "./cell.js";
import type { RaidNightAnalysis } from "./raid-night.js";

export const RAID_NIGHT_DISCLOSURE_REVISION = "raid-night-coverage-disclosure/1" as const;

/** What a raid night does not establish, machine-readable, in this order. Never empty. */
export const RAID_NIGHT_DISCLOSURES = [
  /** No cell was analyzed: no gameplay analysis exists in this night. */
  "NO_CELL_ANALYZED",
  /** Analyzed cells verify observed decisions only, never moments of inaction. */
  "ONLY_OBSERVED_DECISIONS_VERIFIED",
  "DECISIONS_UNKNOWN",
  "CASTS_EXCLUDED",
  "CELLS_SPEC_NOT_SUPPORTED",
  /** AUTHORITY_NOT_AVAILABLE, PROFILE_NOT_RESOLVED or INSUFFICIENT_EVIDENCE cells. */
  "CELLS_NOT_ANALYZED",
  "CELLS_ANALYSIS_UNAVAILABLE",
  "FIGHTS_MISSING",
  "FIGHTS_FAILED",
  "CONSUMABLE_COUNT_UNKNOWN",
  "PREPARATION_NOT_ASSESSED",
  /**
   * Always held: cells carry counts only. Each fight's TLDR, report, diagnosis
   * and support observations are in its single-fight analysis (`analysisRef`).
   */
  "PER_FIGHT_PRESENTATION_NOT_INCLUDED",
] as const;
export type RaidNightDisclosure = (typeof RAID_NIGHT_DISCLOSURES)[number];

export interface RaidNightCoverageDisclosure {
  readonly revision: typeof RAID_NIGHT_DISCLOSURE_REVISION;
  readonly assessmentScope: "PARTIAL";
  readonly disclosures: readonly RaidNightDisclosure[];
  /** Author-templated sentences over the night's coverage. The coverage sentence is always first. */
  readonly lines: readonly string[];
}

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

function preparationOf(cell: PlayerFightResult): CellPreparation | null {
  return cell.kind === "ABSENT" ? null : cell.preparation;
}

/** The disclosure of one raid night, from its own coverage and cells. */
export function discloseRaidNightCoverage(night: RaidNightAnalysis): RaidNightCoverageDisclosure {
  const { coverage } = night;
  const cellsNotAnalyzed =
    coverage.cellsAuthorityNotAvailable +
    coverage.cellsProfileNotResolved +
    coverage.cellsInsufficientEvidence;
  const preparations = night.cells.map(preparationOf).filter((p): p is CellPreparation => p !== null);
  const preparationNotAssessed = preparations.filter((p) => p.assessment === "NOT_ASSESSED").length;
  const consumableUnknown = preparations.filter(
    (p) =>
      p.assessment === "ASSESSED" &&
      [p.statuses.healthPotion, p.statuses.healthstone, p.statuses.combatPotion].some(
        (status) => status.countState === "UNKNOWN",
      ),
  ).length;

  const held = new Set<RaidNightDisclosure>(["PER_FIGHT_PRESENTATION_NOT_INCLUDED"]);
  if (coverage.cellsAnalyzed === 0) held.add("NO_CELL_ANALYZED");
  else held.add("ONLY_OBSERVED_DECISIONS_VERIFIED");
  if (coverage.unknownTotal > 0) held.add("DECISIONS_UNKNOWN");
  if (coverage.excludedCastCountTotal > 0) held.add("CASTS_EXCLUDED");
  if (coverage.cellsSpecNotSupported > 0) held.add("CELLS_SPEC_NOT_SUPPORTED");
  if (cellsNotAnalyzed > 0) held.add("CELLS_NOT_ANALYZED");
  if (coverage.cellsAnalysisUnavailable > 0) held.add("CELLS_ANALYSIS_UNAVAILABLE");
  if (coverage.fightsMissing > 0) held.add("FIGHTS_MISSING");
  if (coverage.fightsFailed > 0) held.add("FIGHTS_FAILED");
  if (consumableUnknown > 0) held.add("CONSUMABLE_COUNT_UNKNOWN");
  if (preparationNotAssessed > 0) held.add("PREPARATION_NOT_ASSESSED");

  // ---- the sentences, templated from the counts above and nothing else ----
  const present = coverage.cellsTotal - coverage.cellsAbsent;
  const lines: string[] = [
    coverage.cellsAnalyzed === 0
      ? `No player-fight cell was analyzed (${plural(present, "present cell", "present cells")}, ${String(coverage.cellsAbsent)} absent). No gameplay analysis was produced, so nothing is claimed about how anyone played.`
      : `Partial analysis: ${String(coverage.cellsAnalyzed)} of ${plural(present, "present player-fight cell was", "present player-fight cells were")} analyzed (${String(coverage.cellsSpecNotSupported)} specialization not supported, ${String(cellsNotAnalyzed)} not analyzed, ${String(coverage.cellsAnalysisUnavailable)} analysis unavailable; ${String(coverage.cellsAbsent)} absent).`,
  ];
  if (coverage.cellsAnalyzed > 0)
    lines.push(
      `In the analyzed cells, ${String(coverage.resolvedComparisonsTotal)} of ${plural(coverage.eligibleDecisionsTotal, "eligible observed decision", "eligible observed decisions")} resolved against the authority and ${String(coverage.unknownTotal)} are UNKNOWN` +
        (coverage.excludedCastCountTotal > 0
          ? `; ${plural(coverage.excludedCastCountTotal, "cast was", "casts were")} excluded`
          : "") +
        ". Only observed decisions were verified, not moments of inaction.",
    );
  if (coverage.cellsSpecNotSupported + cellsNotAnalyzed + coverage.cellsAnalysisUnavailable > 0)
    lines.push("A cell that was not analyzed is a coverage limit, not a statement about play.");
  if (coverage.fightsMissing + coverage.fightsFailed > 0)
    lines.push(
      `${String(coverage.fightsMissing)} requested ${coverage.fightsMissing === 1 ? "fight was" : "fights were"} not in the report and ${String(coverage.fightsFailed)} could not be retrieved; nothing is claimed about them.`,
    );
  if (consumableUnknown > 0)
    lines.push(
      `${plural(consumableUnknown, "cell has", "cells have")} a consumable count that is UNKNOWN, which is not zero.`,
    );
  if (preparationNotAssessed > 0)
    lines.push(
      `${plural(preparationNotAssessed, "cell's", "cells'")} consumable use was not assessed; nothing is claimed about it.`,
    );
  lines.push(
    "Each fight's summary, report, damage diagnosis and support observations are in its single-fight analysis (analysisRef), not in this night.",
  );

  return {
    revision: RAID_NIGHT_DISCLOSURE_REVISION,
    assessmentScope: "PARTIAL",
    disclosures: RAID_NIGHT_DISCLOSURES.filter((code) => held.has(code)),
    lines,
  };
}
