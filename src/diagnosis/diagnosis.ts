/**
 * THE REVIEWED DIAGNOSIS PROJECTION (M14-F): combines authority-backed
 * findings with M14-E's causal evidence linkage, for publication through the
 * shared application service.
 *
 * It answers one question per damage-delta row and comparison fight: "is
 * there an authority finding about the subject's own play, linked to this
 * proven difference, that a coaching statement may rest on?" Everything else
 * is an observation, labelled with why.
 *
 * WHERE THIS SITS
 *
 *   authority branch (specs, SimulationCraft) -> observed-decision view
 *                                                      |
 *   post-hoc domain (comparison-facts) ------------> diagnosis  -> service -> contract
 *
 * This is the one module that reads both sides (After M14-E). It runs after
 * the analyzer's result is final, takes only the registration's published
 * view, and returns data the service attaches beside that result. Nothing
 * here is passed back into an analyzer, and no analyzer imports it
 * (`tests/contracts/m14f-diagnosis-layering.test.ts`).
 *
 * A COACHING STATEMENT NEEDS ALL OF
 *
 *   1. the pair LINKED by M14-E: a proven direction, the subject's window
 *      placed, and RESOLVED decision evidence in the row's scope;
 *   2. an authority finding among that evidence: an observed decision the
 *      authority REJECTED (a MATCH is authority-compatible evidence, never a
 *      finding);
 *   3. a direction the finding can bear on. A rejected observed cast of
 *      ability X says X was used where the authority selected otherwise. It
 *      can bear on X's figure being HIGHER than a comparison's, never lower.
 *
 * Otherwise the pair is an OBSERVATION with a named cause. A statement still
 * carries every M14-E limit, and it never attributes magnitude: it says the
 * finding and the difference exist together, not how much of the difference
 * the finding accounts for.
 *
 * COMPARISON IS CONTEXT, NEVER AUTHORITY. Comparison fights decide only
 * whether a direction is proven (M14-E). No comparison decision is evaluated,
 * nothing here moves a finding's confidence or suppresses it, and M14-C's
 * named environmental reasons are attached to a statement as context only.
 *
 * WINDOWS. Whole fight only. Which aligned moments to diagnose is a policy
 * nobody has reviewed yet (agent/follow-ups.md "After M14-F").
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";
import { linkCausalEvidence, type LinkLimit } from "../comparison-facts/causal-linkage.js";
import type {
  DeltaComponent,
  DeltaDirection,
  DeltaMeasure,
  DeltaValue,
} from "../comparison-facts/damage-delta.js";
import type { PostHocDefinition } from "../comparison-facts/fight-facts.js";
import {
  attachStrategyContext,
  strategyContext,
  type EnvironmentalReason,
} from "../comparison-facts/strategy-context.js";
import type { AlignmentInput } from "../comparison-facts/timing-alignment.js";
import type { ObservedDecisionView } from "../findings/observed-decision-view.js";
import {
  AUTHORITY_REJECTION_OUTCOME,
  decisionEvidenceIdOf,
  restateDecisionEvidence,
} from "./decision-evidence.js";
import {
  DIAGNOSIS_OBSERVATION_CAUSES,
  type DiagnosisNotAssessedReason,
  type DiagnosisObservationCause,
} from "./vocabulary.js";

/** Re-exported so the public projection reads post-hoc types only through this module. */
export type { DeltaComponent, DeltaValue };

// ---------------------------------------------------------------------------
// The comparison evidence source, as the service sees it
// ---------------------------------------------------------------------------

/** Who the service analyzed; the only thing a comparison source is told. */
export interface ComparisonEvidenceRequest {
  readonly reportCode: string;
  readonly reportRevision: number;
  readonly fightId: number;
  readonly sourceId: number;
  readonly encounterId: number;
  readonly difficulty: number | null;
  readonly specId: string;
}

/** Post-hoc inputs for one subject and its comparison fights, with the specialization's definition. */
export interface ComparisonEvidence {
  readonly input: AlignmentInput;
  readonly definition: PostHocDefinition;
}

/**
 * Supplies comparison evidence for an analyzed fight, or `null` when it holds
 * none. Injected; the deployed composition supplies none (After M14-F).
 */
export type ComparisonEvidencePort = (
  request: ComparisonEvidenceRequest,
) => Promise<ComparisonEvidence | null>;

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

interface DiagnosedPair {
  readonly rowId: string;
  readonly windowId: string;
  readonly measure: DeltaMeasure;
  readonly component: DeltaComponent;
  readonly comparisonFightRef: string;
  readonly direction: DeltaDirection;
  readonly perMinuteDelta: DeltaValue;
  readonly limits: readonly LinkLimit[];
}

export interface CoachingStatement extends DiagnosedPair {
  readonly statementKind: "AUTHORITY_FINDING_LINKED_TO_DELTA";
  /** Only SUBJECT_HIGHER: the direction a rejected observed cast can bear on. */
  readonly direction: "SUBJECT_HIGHER";
  /** The rejected observed decisions in scope, by their evidence locators, in time order. */
  readonly findings: readonly EvidenceLocator[];
  /**
   * Those of `findings` resolved under the pinned SimC profile (SIMC-FB-B). They stay
   * authority-backed, and their encounter state is modeled. Absent when there are none.
   */
  readonly findingsUnderSimcProfile?: readonly EvidenceLocator[];
  /** M14-C named reasons in effect at any finding's moment. Context only. */
  readonly environmentalContext: readonly { readonly itemId: string; readonly reason: EnvironmentalReason }[];
  readonly magnitudeAttribution: "NONE";
}

export interface DiagnosisObservation extends DiagnosedPair {
  readonly cause: DiagnosisObservationCause;
}

export interface Diagnosis {
  readonly encounterId: number;
  readonly difficulty: number;
  readonly subjectFightRef: string;
  readonly comparisonFightRefs: readonly string[];
  readonly windowIds: readonly string[];
  readonly statements: readonly CoachingStatement[];
  readonly observations: readonly DiagnosisObservation[];
  readonly coverage: {
    readonly deltaRows: number;
    /** deltaRows × comparison fights; equals statements + observations. */
    readonly pairs: number;
    readonly statements: number;
    readonly observations: number;
    /** Every cause, in vocabulary order, zero included. */
    readonly observationCauses: readonly {
      readonly key: DiagnosisObservationCause;
      readonly count: number;
    }[];
    readonly decisionEvidence: {
      readonly records: number;
      readonly resolved: number;
      readonly unknown: number;
      /** Records that fall in no delta row's scope and window: listed, never dropped. */
      readonly inNoComponent: number;
    };
  };
  /** Per fight: whether phase transitions are held, so no named reason never reads as "no downtime". */
  readonly encounterStateEvidence: readonly {
    readonly fightRef: string;
    readonly phaseEvidence: "HELD" | "UNKNOWN";
  }[];
  readonly strategyThresholds: { readonly id: string; readonly status: string };
  readonly comparisonCoverage: "AT_LEAST_UNCERTIFIED";
  readonly comparisonRole: "CONTEXT_ONLY";
  readonly decisionEvidenceSide: "SUBJECT_ONLY";
  readonly magnitudeAttribution: "NONE";
  readonly findingEffect: { readonly suppression: "NONE"; readonly confidence: "NONE" };
}

export type DiagnosisOutcome =
  | { readonly state: "ASSESSED"; readonly diagnosis: Diagnosis }
  | { readonly state: "NOT_ASSESSED"; readonly reason: DiagnosisNotAssessedReason };

export const DIAGNOSIS_NOT_RETRIEVED: DiagnosisOutcome = {
  state: "NOT_ASSESSED",
  reason: "COMPARISON_EVIDENCE_NOT_RETRIEVED",
};

/** The analyzed subject, as the service established it. */
export interface DiagnosisSubject {
  readonly reportCode: string;
  readonly reportRevision: number;
  readonly fightId: number;
  readonly sourceId: number;
  readonly fightStartMs: number;
  readonly fightEndMs: number;
  readonly specId: string;
  readonly authorityId: string;
}

const notAssessed = (reason: DiagnosisNotAssessedReason): DiagnosisOutcome => ({
  state: "NOT_ASSESSED",
  reason,
});

function boundTo(subject: DiagnosisSubject, evidence: ComparisonEvidence): boolean {
  const supplied = evidence.input.subject;
  const fight = supplied.fight;
  // Bound by the supplied fight's own identity. `fightRef` is the post-hoc
  // domain's label for it and proves nothing about which fight it is.
  return (
    supplied.focusActorId === subject.sourceId &&
    fight.report.code === subject.reportCode &&
    fight.report.revision === subject.reportRevision &&
    fight.fight.id === subject.fightId &&
    fight.fight.startTimeMs === subject.fightStartMs &&
    fight.fight.endTimeMs === subject.fightEndMs &&
    evidence.definition.specId === subject.specId
  );
}

/**
 * Diagnose one analyzed fight against supplied comparison evidence.
 *
 * `null` evidence is NOT_ASSESSED, never an empty diagnosis: "no statement"
 * must not be readable as "nothing differed".
 */
export function diagnose(
  subject: DiagnosisSubject,
  evidence: ComparisonEvidence | null,
  view: ObservedDecisionView,
): DiagnosisOutcome {
  if (evidence === null) return DIAGNOSIS_NOT_RETRIEVED;
  if (!boundTo(subject, evidence)) return notAssessed("COMPARISON_EVIDENCE_NOT_FOR_THIS_FIGHT");

  const subjectFightRef = evidence.input.subject.fightRef;
  const restated = restateDecisionEvidence(view, subjectFightRef, subject.specId, subject.authorityId);
  if (restated.kind === "REFUSED") return notAssessed("DECISION_EVIDENCE_NOT_USABLE");

  const linkage = linkCausalEvidence(evidence.input, evidence.definition, [], restated.records);
  if (linkage.kind === "REFUSED")
    return notAssessed(
      linkage.reason === "DECOMPOSITION_REFUSED"
        ? "COMPARISON_NOT_COMPARABLE"
        : "DECISION_EVIDENCE_NOT_USABLE",
    );
  const context = strategyContext(evidence.input, evidence.definition);
  if (context.kind === "REFUSED") return notAssessed("COMPARISON_NOT_COMPARABLE");

  const byId = new Map(linkage.evidence.map((record) => [record.evidenceId, record]));
  const underProfile = new Set(
    view.decisions
      .filter((decision) => (decision.simcProfileFacts?.length ?? 0) > 0)
      .map(decisionEvidenceIdOf),
  );
  const statements: CoachingStatement[] = [];
  const observations: DiagnosisObservation[] = [];

  for (const component of linkage.components) {
    // Reading the producer's status is this projection's job (M14-E never does).
    const findings = component.authorityBackedEvidenceIds.flatMap((id) => {
      const record = byId.get(id);
      return record !== undefined && record.producerStatus === AUTHORITY_REJECTION_OUTCOME ? [record] : [];
    });
    for (const pair of component.pairs) {
      const base: DiagnosedPair = {
        rowId: component.rowId,
        windowId: component.windowId,
        measure: component.measure,
        component: component.component,
        comparisonFightRef: pair.comparisonFightRef,
        direction: pair.perMinuteDirection,
        perMinuteDelta: pair.perMinuteDelta,
        limits: pair.limits,
      };
      const cause: DiagnosisObservationCause | null =
        pair.status === "OBSERVATION_ONLY"
          ? (pair.cause ?? "NO_DECISION_EVIDENCE_IN_SCOPE")
          : findings.length === 0
            ? "NO_AUTHORITY_FINDING_IN_LINK"
            : pair.perMinuteDirection !== "SUBJECT_HIGHER"
              ? "FINDINGS_DO_NOT_MATCH_DIRECTION"
              : null;
      if (cause !== null) {
        observations.push({ ...base, cause });
        continue;
      }
      const locators = findings.flatMap((record) => record.locators);
      const profileLocators = findings
        .filter((record) => underProfile.has(record.evidenceId))
        .flatMap((record) => record.locators);
      const attached = attachStrategyContext(
        context,
        findings.map((record) => ({ findingId: record.evidenceId, reportTimeMs: record.interval.startMs })),
      );
      const reasons = new Map<string, { itemId: string; reason: EnvironmentalReason }>();
      for (const entry of attached)
        for (const named of entry.reasonsInEffect) reasons.set(`${named.itemId}|${named.reason}`, named);
      statements.push({
        ...base,
        statementKind: "AUTHORITY_FINDING_LINKED_TO_DELTA",
        direction: "SUBJECT_HIGHER",
        findings: locators,
        ...(profileLocators.length === 0 ? {} : { findingsUnderSimcProfile: profileLocators }),
        environmentalContext: [...reasons.values()],
        magnitudeAttribution: "NONE",
      });
    }
  }

  const unknown = linkage.evidence.filter((record) => record.resolution !== "RESOLVED").length;
  return {
    state: "ASSESSED",
    diagnosis: {
      encounterId: linkage.encounterId,
      difficulty: linkage.difficulty,
      subjectFightRef,
      comparisonFightRefs: linkage.comparisonFightRefs,
      windowIds: [...new Set(linkage.components.map((component) => component.windowId))],
      statements,
      observations,
      coverage: {
        deltaRows: linkage.components.length,
        pairs: statements.length + observations.length,
        statements: statements.length,
        observations: observations.length,
        observationCauses: DIAGNOSIS_OBSERVATION_CAUSES.map((key) => ({
          key,
          count: observations.filter((observation) => observation.cause === key).length,
        })),
        decisionEvidence: {
          records: linkage.evidence.length,
          resolved: linkage.evidence.length - unknown,
          unknown,
          inNoComponent: linkage.evidenceInNoComponent.length,
        },
      },
      encounterStateEvidence: context.encounterStateEvidence.map((entry) => ({
        fightRef: entry.fightRef,
        phaseEvidence: entry.phaseEvidence.kind,
      })),
      strategyThresholds: { id: context.thresholds.id, status: context.thresholds.status },
      comparisonCoverage: "AT_LEAST_UNCERTIFIED",
      comparisonRole: "CONTEXT_ONLY",
      decisionEvidenceSide: "SUBJECT_ONLY",
      magnitudeAttribution: "NONE",
      findingEffect: { suppression: "NONE", confidence: "NONE" },
    },
  };
}
