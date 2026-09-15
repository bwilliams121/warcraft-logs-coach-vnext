/**
 * The two questions a player-level comparison must ask, kept apart.
 *
 * WHY THERE IS NO SINGLE MERGED VERDICT
 *
 * The obvious convenience would be one `PullComparability` covering both the
 * pull and the analysis. It is not written here because there is no honest merge
 * rule, and inventing one would lose the fact that matters most.
 *
 * Consider a player absent from the reference pull. The two pulls may be
 * perfectly comparable — same encounter, same difficulty, one report — while the
 * player-analysis question has no subject at all. Collapsing that into UNKNOWN
 * would say "we could not tell", which is false; we can tell, and the answer is
 * that there is nothing there to compare. Collapsing it into NOT_COMPARABLE
 * would be worse: it asserts an incompatibility nobody observed, and it would
 * quietly discard a pull-level comparison that was entirely valid.
 *
 * So both verdicts are returned, each in its own vocabulary, and the consumer
 * states which one it is acting on. A consumer comparing encounter facts reads
 * `pull`. A consumer that wants to put two sets of M7 counts side by side must
 * read `analysis` and must require COMPATIBLE before doing so — NOT_APPLICABLE
 * and UNKNOWN are both refusals, for different reasons.
 *
 * This type exists so that requirement has one home. Without it the first
 * caller would write its own merge, and the second would write a different one.
 */

import type { PlayerFightResult } from "../aggregation/cell.js";
import {
  assessAnalysisComparability,
  type AnalysisComparabilityAssessment,
} from "./analysis-comparability.js";
import { COMPARISON_EVIDENCE_CLASS, type ComparisonEvidence } from "./evidence-class.js";
import { assessPullComparability, type PullComparabilityAssessment } from "./pull-comparability.js";
import type { PullContext } from "./pull-identity.js";

export interface PlayerPullComparison extends ComparisonEvidence {
  /** Whether the two PULLS may be compared. Independent of any player. */
  readonly pull: PullComparabilityAssessment;
  /**
   * Whether the two players' M7 analysis results describe one analysis world.
   *
   * Required to be COMPATIBLE before any M7 count from one cell is placed
   * beside a count from the other.
   */
  readonly analysis: AnalysisComparabilityAssessment;
}

export interface PlayerPullComparisonInput {
  readonly subjectPull: PullContext;
  readonly referencePull: PullContext;
  readonly subjectCell: PlayerFightResult;
  readonly referenceCell: PlayerFightResult;
}

export function comparePlayerPulls(input: PlayerPullComparisonInput): PlayerPullComparison {
  return {
    evidenceClass: COMPARISON_EVIDENCE_CLASS,
    pull: assessPullComparability(input.subjectPull, input.referencePull),
    analysis: assessAnalysisComparability(input.subjectCell, input.referenceCell),
  };
}
