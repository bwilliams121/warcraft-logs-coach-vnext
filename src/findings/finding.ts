/**
 * The structured finding.
 *
 * All coaching would eventually originate here. M5-A produces findings and
 * stops: there is no ranking, no prose, no scoring and no reporting layer.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * - NO CONFIDENCE SCALE. There is no HIGH/MEDIUM/LOW. This evaluator is
 *   deterministic: the judgment status plus the proof trace IS the certainty
 *   contract, and a subjective adjective layered on top of a proof would add
 *   nothing and invite the "lowering confidence is suppression by another name"
 *   failure.
 * - NO SUPPRESSION FRAMEWORK. Nothing suppresses anything yet.
 * - NO SEVERITY OR SCORE. A judgment is not a penalty.
 * - NO PARALLEL STATUS/BLOCKER FIELDS. The judgment union is the single source
 *   of the verdict; mirroring it onto the finding would let the two disagree.
 *
 * ACTIONABILITY IS `NOT_EVALUATED`, AND IT IS A REAL VALUE
 *
 * Not `ACTIONABLE`, not `null`, not absent. `ACTIONABLE` requires positive
 * environmental evidence that M5-A never gathers, and a missing field would be
 * read as "fine". A single-member union makes the state explicit at every call
 * site and makes widening it later a deliberate, type-checked act.
 *
 * A `REJECTED_BY_AUTHORITY` finding therefore means exactly one thing: the
 * pinned APL cannot select this observed action under every supported resolution
 * of the evaluated authority state. It does not mean the player erred.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { DecisionCategory } from "./authority.js";
import type { ObservedActionDecisionPoint, ObservedActionJudgment } from "./judgment.js";

/**
 * Whether the action was actually possible in the encounter.
 *
 * One member. M5-A evaluates no actionability, and the absence of an observed
 * restriction is not evidence of availability.
 */
export type ActionabilityState = "NOT_EVALUATED";

/** The specialization that produced a finding. */
export type SpecId = "rogue/assassination";

export interface Finding {
  /** Stable within one run. Derived from spec, category and canonical position. */
  readonly findingId: string;
  readonly category: DecisionCategory;
  readonly spec: SpecId;
  readonly decisionPoint: ObservedActionDecisionPoint;
  readonly judgment: ObservedActionJudgment;
  /**
   * Every locator the finding rests on, in canonical order, deduplicated.
   *
   * A convenience roll-up for consumers, built by `createFinding` from the
   * decision point and the judgment so the two cannot drift. REFERENCES ONLY —
   * no normalized event is ever copied into a finding.
   */
  readonly evidence: readonly EvidenceLocator[];
  readonly actionability: ActionabilityState;
}

function locatorKey(locator: EvidenceLocator): string {
  return `${locator.streamId}#${locator.pageOrdinal}#${locator.indexInPage}#${locator.ingestionOrdinal}`;
}

function stateEvidenceOf(judgment: ObservedActionJudgment): readonly EvidenceLocator[] {
  return judgment.status === "NO_AUTHORITY_AVAILABLE" ? [] : judgment.stateEvidence;
}

export function createFinding(input: {
  readonly spec: SpecId;
  readonly category: DecisionCategory;
  readonly decisionPoint: ObservedActionDecisionPoint;
  readonly judgment: ObservedActionJudgment;
}): Finding {
  const evidence: EvidenceLocator[] = [];
  const seen = new Set<string>();
  for (const locator of [input.decisionPoint.locator, ...stateEvidenceOf(input.judgment)]) {
    const key = locatorKey(locator);
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push(locator);
  }

  return {
    findingId: `${input.spec}:${input.category}:${input.decisionPoint.position}`,
    category: input.category,
    spec: input.spec,
    decisionPoint: input.decisionPoint,
    judgment: input.judgment,
    evidence,
    actionability: "NOT_EVALUATED",
  };
}
