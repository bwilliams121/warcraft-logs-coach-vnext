/**
 * Whether two players' M7 analysis results describe the same analysis world.
 *
 * WHAT THIS FUNCTION IS ALLOWED TO SEE
 *
 * `PlayerFightResult` and nothing else. That type is M7's projection: four
 * variants, integer counts, opaque tally keys, and no decision, no evidence
 * locator, no authority token, no `ObservedActionComparison`. The heavy analysis
 * was already released by the time a cell exists.
 *
 * So this module could not mint a rotational verdict if it tried. It holds no
 * action, no APL, no authority and no state — only provenance strings and a
 * discriminant. That is the structural half of the authority boundary, and it is
 * the half that actually holds; the `evidenceClass` brand is the reminder, not
 * the mechanism.
 *
 * AND WHAT IT DOES NOT READ
 *
 * `counts`. Not once. This function answers "may these two be compared" and
 * returns before anything would compare them. A reader can confirm that by
 * searching this file for the word: it appears in this comment and nowhere else.
 *
 * NOT_APPLICABLE IS NOT A FAILURE, AND NOT A JUDGEMENT
 *
 * Three of the four `PlayerFightResult` variants carry no analysis at all, for
 * three honest reasons M7 was careful to keep apart: the player was not in the
 * pull, no analyzer could be selected, or an analyzer ran and truthfully
 * concluded nothing. None of those is poor play, and none is an error.
 *
 * They resolve to NOT_APPLICABLE rather than UNKNOWN because the distinction is
 * real and worth keeping. UNKNOWN means a comparison was possible in principle
 * and the evidence would not settle it. NOT_APPLICABLE means there is no second
 * analysis in existence to compare against — a complete answer, not a gap. An
 * unsupported specialization must never read as zero, as worse, or as failed,
 * and this is where that promise is kept.
 */

import type { CellAnalysisProvenance, PlayerFightResult } from "../aggregation/cell.js";
import { COMPARISON_EVIDENCE_CLASS, type ComparisonEvidence } from "./evidence-class.js";

/**
 * The fields that must agree before two analysis results describe one world.
 *
 * Six are `CellAnalysisProvenance` verbatim — M7 already decided that set and
 * deliberately carries it PER CELL rather than once per night, precisely so two
 * points can be checked against each other. Re-deciding it here would be a
 * second definition that could drift.
 *
 * `specName` is the seventh and comes from the cell rather than its provenance.
 * It is Warcraft Logs' observed specialization, which is a different fact from
 * `specId`, the internal identity of the analyzer that ran. Both are checked:
 * they can disagree, and if they ever do, that disagreement is exactly what a
 * comparison must refuse to paper over.
 *
 * DECLARATION ORDER IS THE CANONICAL ORDER of `differingFields`.
 */
export const ANALYSIS_PROVENANCE_FIELDS = [
  "analyzerId",
  "authorityArtifactRevision",
  "authorityCommitSha",
  "authorityId",
  "normalizationRevision",
  "specId",
  "specName",
] as const;

export type AnalysisProvenanceField = (typeof ANALYSIS_PROVENANCE_FIELDS)[number];

export type AnalysisComparability = "COMPATIBLE" | "NOT_COMPATIBLE" | "NOT_APPLICABLE" | "UNKNOWN";

export const ANALYSIS_COMPARABILITY_VALUES = [
  "COMPATIBLE",
  "NOT_COMPATIBLE",
  "NOT_APPLICABLE",
  "UNKNOWN",
] as const satisfies readonly AnalysisComparability[];

export type AnalysisComparabilityReason =
  /** Both analyzed, and all seven fields agree. */
  | "PROVENANCE_EQUAL"
  /** Both analyzed, and at least one field was observed to differ. */
  | "PROVENANCE_DIFFERS"
  /**
   * Both analyzed, and at least one carries no specialization.
   *
   * M7 records `specName: null` when Warcraft Logs supplied nothing usable. That
   * is an absence, so it cannot establish agreement, and it is not a difference,
   * so it cannot establish the opposite.
   */
  | "SPECIALIZATION_UNRESOLVED"
  /** At least one player was on the roster and not in this pull. */
  | "PLAYER_ABSENT_FROM_PULL"
  /** At least one cell had no analyzer run at all. Never an outage claim. */
  | "NO_ANALYSIS_PERFORMED"
  /** At least one analyzer ran or was selected and produced no gameplay result. */
  | "GAMEPLAY_ANALYSIS_NOT_PRODUCED";

export const ANALYSIS_COMPARABILITY_REASONS = [
  "PROVENANCE_EQUAL",
  "PROVENANCE_DIFFERS",
  "SPECIALIZATION_UNRESOLVED",
  "PLAYER_ABSENT_FROM_PULL",
  "NO_ANALYSIS_PERFORMED",
  "GAMEPLAY_ANALYSIS_NOT_PRODUCED",
] as const satisfies readonly AnalysisComparabilityReason[];

export interface AnalysisComparabilityAssessment extends ComparisonEvidence {
  readonly comparability: AnalysisComparability;
  readonly reason: AnalysisComparabilityReason;
  /** Canonical order. Non-empty only when `comparability` is NOT_COMPATIBLE. */
  readonly differingFields: readonly AnalysisProvenanceField[];
}

function fieldValueOf(
  field: AnalysisProvenanceField,
  provenance: CellAnalysisProvenance,
  specName: string | null,
): string | null {
  return field === "specName" ? specName : provenance[field];
}

function assessment(
  comparability: AnalysisComparability,
  reason: AnalysisComparabilityReason,
  differingFields: readonly AnalysisProvenanceField[] = [],
): AnalysisComparabilityAssessment {
  return { evidenceClass: COMPARISON_EVIDENCE_CLASS, comparability, reason, differingFields };
}

/**
 * Whether two cells may have their analysis compared.
 *
 * Symmetric in its arguments. The non-analyzed branches test "either side", in a
 * fixed precedence rather than by looking at the subject first, so swapping the
 * two arguments cannot change the answer.
 */
export function assessAnalysisComparability(
  subject: PlayerFightResult,
  reference: PlayerFightResult,
): AnalysisComparabilityAssessment {
  // Fixed precedence over the SET of kinds present, so the result is symmetric.
  // Absence is the most specific fact available and is reported first.
  if (subject.kind === "ABSENT" || reference.kind === "ABSENT") {
    return assessment("NOT_APPLICABLE", "PLAYER_ABSENT_FROM_PULL");
  }
  if (subject.kind === "ANALYSIS_UNAVAILABLE" || reference.kind === "ANALYSIS_UNAVAILABLE") {
    return assessment("NOT_APPLICABLE", "NO_ANALYSIS_PERFORMED");
  }
  if (subject.kind === "NOT_ANALYZED" || reference.kind === "NOT_ANALYZED") {
    return assessment("NOT_APPLICABLE", "GAMEPLAY_ANALYSIS_NOT_PRODUCED");
  }

  // Both ANALYZED. Unresolved BEFORE unequal, so a missing specialization can
  // never emerge as an observed difference.
  if (subject.specName === null || reference.specName === null) {
    return assessment("UNKNOWN", "SPECIALIZATION_UNRESOLVED");
  }

  // Filtering the canonical list keeps `differingFields` canonically ordered
  // without a sort, and independently of object-key iteration order.
  const differingFields = ANALYSIS_PROVENANCE_FIELDS.filter(
    (field) =>
      fieldValueOf(field, subject.provenance, subject.specName) !==
      fieldValueOf(field, reference.provenance, reference.specName),
  );

  if (differingFields.length > 0) {
    return assessment("NOT_COMPATIBLE", "PROVENANCE_DIFFERS", differingFields);
  }
  return assessment("COMPATIBLE", "PROVENANCE_EQUAL");
}
