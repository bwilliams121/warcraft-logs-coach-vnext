/**
 * THE REVIEWED RESTATEMENTS (M15-A): producer outputs as `ReportableFinding`s.
 *
 * Prioritization reads only restated records, so each producer gets exactly
 * one reviewed adapter here. An adapter maps the producer's own status words
 * onto a disposition and copies everything else; it re-evaluates nothing.
 * A status word an adapter was not reviewed for REFUSES the whole
 * restatement: an unreviewed word is never guessed into a disposition.
 *
 * OBSERVED-DECISION VIEW (one record per compared observed decision)
 *
 *   outcome        REJECTED -> AUTHORITY_DIVERGENCE, state PROVEN
 *                  MATCH    -> AUTHORITY_CONSISTENT, state PROVEN
 *                  UNKNOWN  -> UNKNOWN, state INCOMPLETE, reason = the
 *                              decisive blocker class, else the basis
 *   usability      OBSERVED_EXECUTION -> OBSERVED_EXECUTION_ONLY: the cast
 *                  that happened proves the OBSERVED ability usable, never
 *                  the authority's alternative, so no view record is ever
 *                  DECISION_PROVEN_ACTIONABLE. NOT_ESTABLISHED -> NOT_EVALUATED
 *   category       ROTATION (the view is the rotational APL comparison)
 *   aggregation    outcome + observed token + reason: the same observed
 *                  ability with the same outcome for the same reason. Opaque
 *                  to shared code; compared for equality only.
 *
 * Excluded casts are not decisions and are not restated (as in M14-F).
 *
 * PREPARATION CONSUMABLE STATUS (one record per kind, all three, always)
 *
 *   OBSERVED -> OBSERVED_FACT, authority WCL_OBSERVED_FACT, state PROVEN.
 *               A zero count under COMPLETE coverage is a fact, never a
 *               failure: no preparation rule says a use was required.
 *   UNKNOWN  -> UNKNOWN, reason = the producer's unknown codes, sorted and
 *               joined. Never a zero.
 *   Whole-fight facts: no fight time, never aggregated, NOT_EVALUATED
 *   actionability (there is no decision to be possible).
 */

import type { ConsumableStatusReport } from "../analysis/preparation/consumable-status.js";
import { PREPARATION_CONSUMABLE_KINDS } from "../data/game/preparation-consumables.js";
import type { ObservedDecisionView } from "../findings/observed-decision-view.js";
import type {
  ActionabilityLevel,
  FindingDisposition,
  ReportableFinding,
  StateEvidenceState,
} from "./finding-record.js";

export const OBSERVED_DECISION_PRODUCER = "OBSERVED_DECISION_VIEW" as const;
export const PREPARATION_PRODUCER = "PREPARATION_CONSUMABLE_STATUS" as const;

/** The view outcomes this adapter was reviewed for (public `PUBLIC_COMPARISON_OUTCOMES`). */
const OUTCOME_DISPOSITIONS: Readonly<
  Record<string, { disposition: FindingDisposition; state: StateEvidenceState }>
> = {
  REJECTED: { disposition: "AUTHORITY_DIVERGENCE", state: "PROVEN" },
  MATCH: { disposition: "AUTHORITY_CONSISTENT", state: "PROVEN" },
  UNKNOWN: { disposition: "UNKNOWN", state: "INCOMPLETE" },
};

/** The usability provenances this adapter was reviewed for (public `PUBLIC_USABILITY_PROVENANCES`). */
const USABILITY_ACTIONABILITY: Readonly<Record<string, ActionabilityLevel>> = {
  OBSERVED_EXECUTION: "OBSERVED_EXECUTION_ONLY",
  NOT_ESTABLISHED: "NOT_EVALUATED",
};

export type FindingRestatement =
  | { readonly kind: "RESTATED"; readonly records: readonly ReportableFinding[] }
  | {
      readonly kind: "REFUSED";
      readonly reason:
        "UNREVIEWED_DECISION_OUTCOME" | "UNREVIEWED_USABILITY_PROVENANCE" | "MISSING_AUTHORITY";
      readonly position: number | null;
    };

export function restateObservedDecisions(
  view: ObservedDecisionView,
  identity: { readonly specId: string; readonly authorityId: string },
): FindingRestatement {
  if (identity.authorityId.length === 0)
    return { kind: "REFUSED", reason: "MISSING_AUTHORITY", position: null };
  const records: ReportableFinding[] = [];
  for (const decision of view.decisions) {
    const mapped = Object.hasOwn(OUTCOME_DISPOSITIONS, decision.outcome)
      ? OUTCOME_DISPOSITIONS[decision.outcome]
      : undefined;
    if (mapped === undefined)
      return { kind: "REFUSED", reason: "UNREVIEWED_DECISION_OUTCOME", position: decision.position };
    const actionability = Object.hasOwn(USABILITY_ACTIONABILITY, decision.usabilityProvenance)
      ? USABILITY_ACTIONABILITY[decision.usabilityProvenance]
      : undefined;
    if (actionability === undefined)
      return { kind: "REFUSED", reason: "UNREVIEWED_USABILITY_PROVENANCE", position: decision.position };
    const reasonCode = mapped.disposition === "UNKNOWN" ? (decision.decisiveBlocker ?? decision.basis) : null;
    records.push({
      findingId: `${identity.specId}:decision:${String(decision.position)}`,
      producer: OBSERVED_DECISION_PRODUCER,
      category: "ROTATION",
      specId: identity.specId,
      disposition: mapped.disposition,
      authority: identity.authorityId,
      producerStatus: decision.outcome,
      reasonCode,
      suppressionReason: null,
      stateEvidence: mapped.state,
      actionability,
      fightTimeMs: decision.fightTimeMs,
      evidence: [decision.locator],
      aggregationKey: JSON.stringify([decision.outcome, decision.observedToken, reasonCode]),
      subjectToken: decision.observedToken,
    });
  }
  return { kind: "RESTATED", records };
}

export function restateConsumableStatus(report: ConsumableStatusReport): FindingRestatement {
  const records = PREPARATION_CONSUMABLE_KINDS.map((kind): ReportableFinding => {
    const status = report.statuses[kind];
    const observed = status.state === "OBSERVED";
    return {
      findingId: `preparation:${String(report.actorId)}:${kind}`,
      producer: PREPARATION_PRODUCER,
      category: "PREPARATION",
      specId: null,
      disposition: observed ? "OBSERVED_FACT" : "UNKNOWN",
      authority: report.authority,
      producerStatus: status.state,
      reasonCode: observed
        ? null
        : [...new Set(status.reasons.map((reason) => reason.code))].sort().join("+"),
      suppressionReason: null,
      stateEvidence: observed ? "PROVEN" : "INCOMPLETE",
      actionability: "NOT_EVALUATED",
      fightTimeMs: null,
      evidence: status.uses.map((use) => use.evidence),
      aggregationKey: null,
      subjectToken: null,
    };
  });
  return { kind: "RESTATED", records };
}
