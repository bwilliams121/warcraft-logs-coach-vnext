/**
 * The structured finding.
 *
 * All coaching would eventually originate here. M5 produces findings and stops:
 * there is no ranking, no prose, no scoring and no reporting layer.
 *
 * ONE FINDING TYPE, TWO QUESTIONS.
 *
 * `judgment` is a union discriminated on `kind`:
 *
 *     OBSERVED_ACTION_JUDGMENT   can the authority select this observed cast?
 *     SCOPED_ACTION_SELECTION    what does this authority sub-list select?
 *
 * They share the finding envelope — decision point, evidence roll-up,
 * actionability — because those are the same in both cases. They do not share a
 * status vocabulary, a blocker vocabulary or a positive verdict, because the two
 * questions have different answers and conflating them would let a selection be
 * read as an endorsement of what the player did.
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
 * ACTIONABILITY IS EVIDENCE, AND IT HAS EXACTLY ONE HOME.
 *
 * `Finding.actionability` is the canonical record of what was proved usable and
 * where. It is never defaulted: `createFinding` requires it, so "fine by
 * omission" is not reachable. M5-A findings state `NOT_EVALUATED` explicitly,
 * because M5-A gathers no environmental evidence and the absence of an observed
 * restriction is not evidence of availability.
 *
 * A `REJECTED_BY_AUTHORITY` finding therefore means exactly one thing: the
 * pinned APL cannot select this observed action under every supported resolution
 * of the evaluated authority state. It does not mean the player erred.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { ActionabilityEvidence } from "./actionability.js";
import type { DecisionCategory } from "./authority.js";
import type { ObservedActionDecisionPoint, ObservedActionJudgment } from "./judgment.js";
import type { ScopedActionSelection } from "./scoped-selection.js";
import type { SpecId } from "./spec-id.js";

/**
 * The specialization that produced a finding.
 *
 * Declared in `spec-id.ts` since M10-A, where the internal/public partition
 * lives; re-exported here so every existing import of `SpecId` keeps working
 * and the public contract's pinned import list is unchanged.
 */
export type { PublicSpecId, SpecId } from "./spec-id.js";

/** Either question's answer. Discriminated on `kind`, never on `status`. */
export type FindingJudgment = ObservedActionJudgment | ScopedActionSelection;

export interface Finding {
  /** Stable within one run. See `createFinding` and `createScopedSelectionFinding`. */
  readonly findingId: string;
  readonly category: DecisionCategory;
  readonly spec: SpecId;
  readonly decisionPoint: ObservedActionDecisionPoint;
  readonly judgment: FindingJudgment;
  /**
   * Every locator the finding rests on, in canonical order, deduplicated.
   *
   * A convenience roll-up for consumers, built by the constructors from the
   * decision point and the judgment so the two cannot drift. REFERENCES ONLY —
   * no normalized event is ever copied into a finding.
   */
  readonly evidence: readonly EvidenceLocator[];
  /** The canonical actionability record. Required, never defaulted. */
  readonly actionability: ActionabilityEvidence;
}

function locatorKey(locator: EvidenceLocator): string {
  return `${locator.streamId}#${locator.pageOrdinal}#${locator.indexInPage}#${locator.ingestionOrdinal}`;
}

function stateEvidenceOf(judgment: FindingJudgment): readonly EvidenceLocator[] {
  return judgment.status === "NO_AUTHORITY_AVAILABLE" ? [] : judgment.stateEvidence;
}

function evidenceRollUp(
  decisionPoint: ObservedActionDecisionPoint,
  judgment: FindingJudgment,
): readonly EvidenceLocator[] {
  const evidence: EvidenceLocator[] = [];
  const seen = new Set<string>();
  for (const locator of [decisionPoint.locator, ...stateEvidenceOf(judgment)]) {
    const key = locatorKey(locator);
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push(locator);
  }
  return evidence;
}

/**
 * A finding carrying an observed-action judgment.
 *
 * THE ID FORMAT IS UNCHANGED FROM M5-A, DELIBERATELY. Inserting a judgment
 * family into it would renumber every already-committed M5-A finding for no
 * behavioural gain. M5-B's findings get their own format instead, so the two
 * cannot collide without either one churning.
 */
export function createFinding(input: {
  readonly spec: SpecId;
  readonly category: DecisionCategory;
  readonly decisionPoint: ObservedActionDecisionPoint;
  readonly judgment: ObservedActionJudgment;
  /** Required. M5-A passes `NOT_EVALUATED` explicitly rather than by omission. */
  readonly actionability: ActionabilityEvidence;
}): Finding {
  return {
    findingId: `${input.spec}:${input.category}:${input.decisionPoint.position}`,
    category: input.category,
    spec: input.spec,
    decisionPoint: input.decisionPoint,
    judgment: input.judgment,
    evidence: evidenceRollUp(input.decisionPoint, input.judgment),
    actionability: input.actionability,
  };
}

/**
 * A finding carrying a scoped action selection.
 *
 * The id names the family and the sub-list, which is what keeps it distinct from
 * the M5-A id at the same canonical position AND distinct from a future scoped
 * result about a different list at that position.
 */
export function createScopedSelectionFinding(input: {
  readonly spec: SpecId;
  readonly category: DecisionCategory;
  readonly listName: string;
  readonly decisionPoint: ObservedActionDecisionPoint;
  readonly judgment: ScopedActionSelection;
  readonly actionability: ActionabilityEvidence;
}): Finding {
  return {
    findingId: `${input.spec}:${input.category}:SCOPED_ACTION_SELECTION:${input.listName}:${input.decisionPoint.position}`,
    category: input.category,
    spec: input.spec,
    decisionPoint: input.decisionPoint,
    judgment: input.judgment,
    evidence: evidenceRollUp(input.decisionPoint, input.judgment),
    actionability: input.actionability,
  };
}
