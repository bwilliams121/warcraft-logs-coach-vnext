/**
 * THE REVIEWED DECISION-EVIDENCE ADAPTER (M14-F): restates a registration's
 * observed-decision view as M14-E `DecisionEvidenceRecord`s.
 *
 * M14-E's linkage never imports the authority branch; the caller restates
 * each decision result as plain data (After M14-E, "No production adapter
 * yet"). This is that restatement, and the only one. It reads the
 * spec-neutral view the registration already publishes, never a
 * specialization payload, and it re-evaluates nothing.
 *
 * ONE RECORD PER COMPARED OBSERVED DECISION
 *
 *   kind          APL_DECISION_OUTCOME
 *   basis         AUTHORITY_BACKED (the view is the authority comparison)
 *   resolution    MATCH, REJECTED -> RESOLVED; UNKNOWN -> UNKNOWN. Any other
 *                 outcome word REFUSES the whole restatement: an outcome this
 *                 adapter was not reviewed for is never guessed into one
 *   interval      the observed cast's instant, report time
 *   scope         ABILITY, FOCUS, exactly the observed ability game id. A
 *                 decision is linked only to damage events carrying that same
 *                 id; cast-to-damage id relationships are never guessed
 *                 (After M14-E "Ability identity is exact"), so a row under
 *                 another id finds no evidence rather than a borrowed one.
 *
 * Excluded casts are not decisions and are not restated.
 */

import type { DecisionEvidenceRecord } from "../comparison-facts/causal-linkage.js";
import type { ObservedDecisionRecord, ObservedDecisionView } from "../findings/observed-decision-view.js";

/** The view outcomes this adapter was reviewed for (public `PUBLIC_COMPARISON_OUTCOMES`). */
const RESOLVED_OUTCOMES: readonly string[] = ["MATCH", "REJECTED"];
const UNKNOWN_OUTCOME = "UNKNOWN";

/** The view's authority rejection; the only outcome a coaching statement rests on. */
export const AUTHORITY_REJECTION_OUTCOME = "REJECTED";

/** Stable per decision: the canonical position in the normalized fight. */
export function decisionEvidenceIdOf(decision: Pick<ObservedDecisionRecord, "position">): string {
  return `decision:${String(decision.position)}`;
}

export type DecisionEvidenceRestatement =
  | { readonly kind: "RESTATED"; readonly records: readonly DecisionEvidenceRecord[] }
  | { readonly kind: "REFUSED"; readonly reason: "UNREVIEWED_DECISION_OUTCOME"; readonly position: number };

export function restateDecisionEvidence(
  view: ObservedDecisionView,
  subjectFightRef: string,
  producer: string,
  authorityId: string,
): DecisionEvidenceRestatement {
  const records: DecisionEvidenceRecord[] = [];
  for (const decision of view.decisions) {
    const resolved = RESOLVED_OUTCOMES.includes(decision.outcome);
    if (!resolved && decision.outcome !== UNKNOWN_OUTCOME)
      return { kind: "REFUSED", reason: "UNREVIEWED_DECISION_OUTCOME", position: decision.position };
    const at = decision.locator.reportTimeMs;
    records.push({
      evidenceId: decisionEvidenceIdOf(decision),
      fightRef: subjectFightRef,
      kind: "APL_DECISION_OUTCOME",
      basis: "AUTHORITY_BACKED",
      authority: authorityId,
      producer,
      producerStatus: decision.outcome,
      resolution: resolved ? "RESOLVED" : "UNKNOWN",
      interval: { startMs: at, endMs: at },
      scope: { kind: "ABILITY", sourceKind: "FOCUS", abilityGameIds: [decision.observedAbilityGameId] },
      locators: [decision.locator],
    });
  }
  return { kind: "RESTATED", records };
}
