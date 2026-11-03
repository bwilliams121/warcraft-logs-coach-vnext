/**
 * Discipline Priest's analyzer registration (HEAL-B3, INTERNAL_ONLY).
 *
 * THIS IS WHERE DISCIPLINE PRIEST STATES WHAT IT IS, AND THE ONLY PLACE.
 *
 * One row, owned by the specialization: its identity, its exposure, the three
 * healer families it is asked about and the evidence they consume, the
 * authority it binds (none), and the facade that runs it.
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else
 * from this directory.
 *
 * It follows Restoration Shaman's healer registration (HEAL-A) exactly:
 *
 * - Every declared family is PROVIDER-LESS (`authority-domain.ts`):
 *   COOLDOWN_ASSIGNMENT (its only standard is a caller-supplied raid cooldown
 *   plan, request input and never a pinned binding), HEALING_COOLDOWN
 *   (observational) and HEALING_DECISION (no approved per-cast healer model).
 *   The registration binds nothing, so no result is ever ANALYZED.
 * - AUTHORITY_NOT_AVAILABLE when the evaluator ran; the payload carries the
 *   evaluation and its healer finding set (`healer-finding-projection.ts`).
 *   INSUFFICIENT_EVIDENCE when the subject's identity is not stated or was
 *   refused, or the pinned healing-cooldown or Atonement data is unusable.
 * - ATONEMENT. The evaluation carries the observed Atonement facts
 *   (`./atonement.ts`). They are not a declared family and not a finding: the
 *   finding set is the shared three-category healer set, unchanged. How the
 *   facts are published is HEAL-B3P's.
 * - IDENTITY. The evaluator's gate is fed the normalized fight's own report
 *   code and fight id, the subject's Warcraft Logs-stated class and
 *   specialization (`friendlySpecializations`), and the actor catalog's name.
 *   A subject with no stated specialization is INSUFFICIENT_EVIDENCE, never a
 *   default.
 * - PLAN. `SpecAnalysisInput.raidCooldownPlan`, untouched. Absent is no plan.
 * - SCOPE. Every capability is declared from `DISCIPLINE_PRIEST_REQUIRED_INPUTS`,
 *   so the derived requirement is FULL_RAID by construction.
 *
 * INTERNAL_ONLY. No public description and no healer view: a public request
 * cannot reach this row. Its public shape and promotion are HEAL-B3P's.
 */

import type { SpecAnalysisInput, UnanalyzedEnvelope } from "../../../findings/analysis-envelope.js";
import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import type {
  AuthorityAccess,
  AuthorityDomainBinding,
  AuthorityResolutionOutcome,
  ProviderlessDomain,
} from "../../../findings/authority-domain.js";
import {
  declaredDomainsOf,
  type DecisionCapability,
  type StateRequirements,
} from "../../../findings/decision-capability.js";
import type { HealerFindingSet } from "../../../findings/healer-finding.js";
import { healerFindingSetOf } from "../../../findings/healer-finding-projection.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import {
  statedSpecializationOf,
  type StatedSpecialization,
} from "../../../engine/normalization/friendly-specializations.js";
import {
  evaluateDisciplinePriest,
  type DisciplinePriestEvaluation,
  type DisciplinePriestInput,
} from "./evaluator.js";
import {
  DISCIPLINE_PRIEST_ANALYZER_ID,
  DISCIPLINE_PRIEST_DISPLAY_NAME,
  DISCIPLINE_PRIEST_REQUIRED_INPUTS,
  DISCIPLINE_PRIEST_SPEC_ID,
  DISCIPLINE_PRIEST_WCL_CLASS_NAME,
  DISCIPLINE_PRIEST_WCL_SPEC_NAME,
} from "./spec.js";

// ---------------------------------------------------------------------------
// Capabilities and authority
// ---------------------------------------------------------------------------

const HEALER_REQUIREMENTS: StateRequirements = Object.freeze({
  scope: DISCIPLINE_PRIEST_REQUIRED_INPUTS.scope,
  resources: Object.freeze([]),
  evidenceCategories: Object.freeze([...DISCIPLINE_PRIEST_REQUIRED_INPUTS.categories]),
  // Healer facts are about the subject and its allies, never an enemy target.
  targetModel: "NO_TARGET",
});

export const DISCIPLINE_PRIEST_COOLDOWN_ASSIGNMENT_CAPABILITY_ID = "priest-discipline.cooldown-assignment";
export const DISCIPLINE_PRIEST_HEALING_COOLDOWN_CAPABILITY_ID = "priest-discipline.healing-cooldown";
export const DISCIPLINE_PRIEST_HEALING_DECISION_CAPABILITY_ID = "priest-discipline.healing-decision";

export const DISCIPLINE_PRIEST_CAPABILITIES: readonly DecisionCapability<ProviderlessDomain>[] =
  Object.freeze([
    {
      capabilityId: DISCIPLINE_PRIEST_COOLDOWN_ASSIGNMENT_CAPABILITY_ID,
      domain: "COOLDOWN_ASSIGNMENT",
      requirements: HEALER_REQUIREMENTS,
    },
    {
      capabilityId: DISCIPLINE_PRIEST_HEALING_COOLDOWN_CAPABILITY_ID,
      domain: "HEALING_COOLDOWN",
      requirements: HEALER_REQUIREMENTS,
    },
    {
      capabilityId: DISCIPLINE_PRIEST_HEALING_DECISION_CAPABILITY_ID,
      domain: "HEALING_DECISION",
      requirements: HEALER_REQUIREMENTS,
    },
  ]);

/** None: no provider kind may govern a healer family. */
export const DISCIPLINE_PRIEST_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([]);

export const DISCIPLINE_PRIEST_DECLARED_DOMAINS: readonly ProviderlessDomain[] = Object.freeze(
  declaredDomainsOf(DISCIPLINE_PRIEST_CAPABILITIES),
);

// ---------------------------------------------------------------------------
// The analysis
// ---------------------------------------------------------------------------

/** One declared family and how the registration's own access resolved it. */
export interface DisciplinePriestDomainResult {
  readonly domain: ProviderlessDomain;
  readonly resolution: AuthorityResolutionOutcome;
}

/** The healer findings, or why none were built. Never an empty set standing in for "nothing found". */
export type DisciplinePriestFindingOutcome =
  | { readonly assessment: "ASSESSED"; readonly set: HealerFindingSet }
  | {
      readonly assessment: "NOT_ASSESSED";
      readonly reason: "SUBJECT_SPECIALIZATION_NOT_STATED" | "IDENTITY_REFUSED" | "RUNTIME_DATA_UNAVAILABLE";
    };

export type DisciplinePriestAnalysis = UnanalyzedEnvelope & {
  readonly status: "AUTHORITY_NOT_AVAILABLE" | "INSUFFICIENT_EVIDENCE";
  readonly specId: typeof DISCIPLINE_PRIEST_SPEC_ID;
  readonly domains: readonly DisciplinePriestDomainResult[];
  /** The subject's stated specialization, as the identity gate was fed it. */
  readonly subjectSpecialization: StatedSpecialization;
  /** Whether the input carried a raid cooldown plan. */
  readonly planSupplied: boolean;
  /** The evaluator's result; `null` only when no identity could be fed to it. */
  readonly evaluation: DisciplinePriestEvaluation | null;
  readonly healerFindings: DisciplinePriestFindingOutcome;
};

/** Test seams, passed through to the evaluator. Production passes none. */
export type DisciplinePriestSeams = Pick<
  DisciplinePriestInput,
  "dataset" | "atonementDataset" | "overlapSpanMs"
>;

/** The facade. Pure: reads the normalized fight and the supplied plan, never Warcraft Logs. */
export function analyzeDisciplinePriest(
  input: SpecAnalysisInput,
  authority: AuthorityAccess,
  seams: DisciplinePriestSeams = {},
): DisciplinePriestAnalysis {
  const { fight } = input.state;
  const specId = DISCIPLINE_PRIEST_SPEC_ID;
  const plan = input.raidCooldownPlan ?? null;
  const domains = DISCIPLINE_PRIEST_DECLARED_DOMAINS.map((domain): DisciplinePriestDomainResult => ({
    domain,
    resolution: authority.forDomain(domain).outcome,
  }));
  const subjectSpecialization = statedSpecializationOf(fight.friendlySpecializations, input.actorId);
  const planSupplied = plan !== null;
  if (subjectSpecialization.state !== "STATED") {
    return {
      status: "INSUFFICIENT_EVIDENCE",
      specId,
      detail:
        `Warcraft Logs states no usable specialization for the subject (${subjectSpecialization.reason}), ` +
        `so its identity could not be checked and nothing was evaluated.`,
      domains,
      subjectSpecialization,
      planSupplied,
      evaluation: null,
      healerFindings: { assessment: "NOT_ASSESSED", reason: "SUBJECT_SPECIALIZATION_NOT_STATED" },
    };
  }

  const evaluation = evaluateDisciplinePriest({
    fight,
    identity: {
      report: { code: fight.report.code },
      fight: { id: fight.fight.id },
      player: {
        sourceId: input.actorId,
        className: subjectSpecialization.className,
        specName: subjectSpecialization.specName,
        name: fight.actors.get(input.actorId)?.name ?? null,
      },
    },
    plan,
    ...(seams.dataset === undefined ? {} : { dataset: seams.dataset }),
    ...(seams.atonementDataset === undefined ? {} : { atonementDataset: seams.atonementDataset }),
    ...(seams.overlapSpanMs === undefined ? {} : { overlapSpanMs: seams.overlapSpanMs }),
  });
  const base: Omit<DisciplinePriestAnalysis, "status" | "detail" | "healerFindings"> = {
    specId,
    domains,
    subjectSpecialization,
    planSupplied,
    evaluation,
  };
  switch (evaluation.state) {
    case "IDENTITY_REFUSED":
      return {
        ...base,
        status: "INSUFFICIENT_EVIDENCE",
        detail: `The subject's identity was refused (${evaluation.reason}), so nothing was evaluated.`,
        healerFindings: { assessment: "NOT_ASSESSED", reason: "IDENTITY_REFUSED" },
      };
    case "RUNTIME_DATA_UNAVAILABLE":
      return {
        ...base,
        status: "INSUFFICIENT_EVIDENCE",
        detail:
          "The pinned Discipline Priest healing-cooldown or Atonement data could not be used, so nothing was evaluated.",
        healerFindings: { assessment: "NOT_ASSESSED", reason: "RUNTIME_DATA_UNAVAILABLE" },
      };
    case "EVALUATED":
      return {
        ...base,
        status: "AUTHORITY_NOT_AVAILABLE",
        detail:
          "No pinned decision authority governs Discipline Priest decisions: per-cast healing choice has no " +
          "approved model and healing-cooldown use is reported as observed facts only. Assignment execution is " +
          "judged only against a supplied raid cooldown plan that binds this fight, and each such result cites " +
          "that plan; without one, assignments are not evaluated. Atonement applications and the Atonement " +
          "healing Warcraft Logs reports are listed as observed facts; which damage produced which heal is not " +
          "reported and stays unknown. This is not an assessment of the player.",
        healerFindings: { assessment: "ASSESSED", set: healerFindingSetOf(specId, evaluation, plan) },
      };
  }
}

/**
 * Never called: the registry asks a view only of an ANALYZED result, and this
 * registration produces none. Throws rather than returning an empty view,
 * which would read as "no decision was wrong".
 */
function noObservedDecisionView(analysis: never): ObservedDecisionView {
  void analysis;
  throw new Error(
    "The Discipline Priest registration never produces an ANALYZED result, so it has no observed-decision view.",
  );
}

/** The Discipline Priest specialization module (HEAL-B3, INTERNAL_ONLY). */
export const DISCIPLINE_PRIEST_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: DISCIPLINE_PRIEST_SPEC_ID,
    analyzerId: DISCIPLINE_PRIEST_ANALYZER_ID,
    displayName: DISCIPLINE_PRIEST_DISPLAY_NAME,
    wclClassName: DISCIPLINE_PRIEST_WCL_CLASS_NAME,
    wclSpecName: DISCIPLINE_PRIEST_WCL_SPEC_NAME,
  },
  exposure: "INTERNAL_ONLY",
  capabilities: DISCIPLINE_PRIEST_CAPABILITIES,
  authorityBindings: DISCIPLINE_PRIEST_AUTHORITY_BINDINGS,
  // No public description: INTERNAL_ONLY. The public prose is HEAL-B3P's.
  limitsProse: Object.freeze({ analysis: "", raidNight: "" }),
  supplementalAnalyses: [],
  analyze: (input, authority): DisciplinePriestAnalysis => analyzeDisciplinePriest(input, authority),
  observedDecisionView: noObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const DISCIPLINE_PRIEST_REGISTRATION: AnalyzerRegistration = DISCIPLINE_PRIEST_MODULE.registration;
