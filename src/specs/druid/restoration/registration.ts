/**
 * Restoration Druid's analyzer registration (HEAL-B1, INTERNAL_ONLY).
 *
 * THIS IS WHERE RESTORATION DRUID STATES WHAT IT IS, AND THE ONLY PLACE.
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
 *   refused, or the pinned healing-cooldown data is unusable.
 * - IDENTITY. The evaluator's gate is fed the normalized fight's own report
 *   code and fight id, the subject's Warcraft Logs-stated class and
 *   specialization (`friendlySpecializations`), and the actor catalog's name.
 *   A subject with no stated specialization is INSUFFICIENT_EVIDENCE, never a
 *   default.
 * - PLAN. `SpecAnalysisInput.raidCooldownPlan`, untouched. Absent is no plan.
 * - SCOPE. Every capability is declared from `RESTORATION_DRUID_REQUIRED_INPUTS`,
 *   so the derived requirement is FULL_RAID by construction.
 *
 * INTERNAL_ONLY. No public description and no healer view: a public request
 * cannot reach this row. Its public shape and promotion are HEAL-B1P's.
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
  evaluateRestorationDruid,
  type RestorationDruidEvaluation,
  type RestorationDruidInput,
} from "./evaluator.js";
import {
  RESTORATION_DRUID_ANALYZER_ID,
  RESTORATION_DRUID_DISPLAY_NAME,
  RESTORATION_DRUID_REQUIRED_INPUTS,
  RESTORATION_DRUID_SPEC_ID,
  RESTORATION_DRUID_WCL_CLASS_NAME,
  RESTORATION_DRUID_WCL_SPEC_NAME,
} from "./spec.js";

// ---------------------------------------------------------------------------
// Capabilities and authority
// ---------------------------------------------------------------------------

const HEALER_REQUIREMENTS: StateRequirements = Object.freeze({
  scope: RESTORATION_DRUID_REQUIRED_INPUTS.scope,
  resources: Object.freeze([]),
  evidenceCategories: Object.freeze([...RESTORATION_DRUID_REQUIRED_INPUTS.categories]),
  // Healer facts are about the subject and its allies, never an enemy target.
  targetModel: "NO_TARGET",
});

export const RESTORATION_DRUID_COOLDOWN_ASSIGNMENT_CAPABILITY_ID = "druid-restoration.cooldown-assignment";
export const RESTORATION_DRUID_HEALING_COOLDOWN_CAPABILITY_ID = "druid-restoration.healing-cooldown";
export const RESTORATION_DRUID_HEALING_DECISION_CAPABILITY_ID = "druid-restoration.healing-decision";

export const RESTORATION_DRUID_CAPABILITIES: readonly DecisionCapability<ProviderlessDomain>[] =
  Object.freeze([
    {
      capabilityId: RESTORATION_DRUID_COOLDOWN_ASSIGNMENT_CAPABILITY_ID,
      domain: "COOLDOWN_ASSIGNMENT",
      requirements: HEALER_REQUIREMENTS,
    },
    {
      capabilityId: RESTORATION_DRUID_HEALING_COOLDOWN_CAPABILITY_ID,
      domain: "HEALING_COOLDOWN",
      requirements: HEALER_REQUIREMENTS,
    },
    {
      capabilityId: RESTORATION_DRUID_HEALING_DECISION_CAPABILITY_ID,
      domain: "HEALING_DECISION",
      requirements: HEALER_REQUIREMENTS,
    },
  ]);

/** None: no provider kind may govern a healer family. */
export const RESTORATION_DRUID_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([]);

export const RESTORATION_DRUID_DECLARED_DOMAINS: readonly ProviderlessDomain[] = Object.freeze(
  declaredDomainsOf(RESTORATION_DRUID_CAPABILITIES),
);

// ---------------------------------------------------------------------------
// The analysis
// ---------------------------------------------------------------------------

/** One declared family and how the registration's own access resolved it. */
export interface RestorationDruidDomainResult {
  readonly domain: ProviderlessDomain;
  readonly resolution: AuthorityResolutionOutcome;
}

/** The healer findings, or why none were built. Never an empty set standing in for "nothing found". */
export type RestorationDruidFindingOutcome =
  | { readonly assessment: "ASSESSED"; readonly set: HealerFindingSet }
  | {
      readonly assessment: "NOT_ASSESSED";
      readonly reason: "SUBJECT_SPECIALIZATION_NOT_STATED" | "IDENTITY_REFUSED" | "RUNTIME_DATA_UNAVAILABLE";
    };

export type RestorationDruidAnalysis = UnanalyzedEnvelope & {
  readonly status: "AUTHORITY_NOT_AVAILABLE" | "INSUFFICIENT_EVIDENCE";
  readonly specId: typeof RESTORATION_DRUID_SPEC_ID;
  readonly domains: readonly RestorationDruidDomainResult[];
  /** The subject's stated specialization, as the identity gate was fed it. */
  readonly subjectSpecialization: StatedSpecialization;
  /** Whether the input carried a raid cooldown plan. */
  readonly planSupplied: boolean;
  /** The evaluator's result; `null` only when no identity could be fed to it. */
  readonly evaluation: RestorationDruidEvaluation | null;
  readonly healerFindings: RestorationDruidFindingOutcome;
};

/** Test seams, passed through to the evaluator. Production passes none. */
export type RestorationDruidSeams = Pick<RestorationDruidInput, "dataset" | "overlapSpanMs">;

/** The facade. Pure: reads the normalized fight and the supplied plan, never Warcraft Logs. */
export function analyzeRestorationDruid(
  input: SpecAnalysisInput,
  authority: AuthorityAccess,
  seams: RestorationDruidSeams = {},
): RestorationDruidAnalysis {
  const { fight } = input.state;
  const specId = RESTORATION_DRUID_SPEC_ID;
  const plan = input.raidCooldownPlan ?? null;
  const domains = RESTORATION_DRUID_DECLARED_DOMAINS.map((domain): RestorationDruidDomainResult => ({
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

  const evaluation = evaluateRestorationDruid({
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
    ...(seams.overlapSpanMs === undefined ? {} : { overlapSpanMs: seams.overlapSpanMs }),
  });
  const base: Omit<RestorationDruidAnalysis, "status" | "detail" | "healerFindings"> = {
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
          "The pinned Restoration Druid healing-cooldown data could not be used, so nothing was evaluated.",
        healerFindings: { assessment: "NOT_ASSESSED", reason: "RUNTIME_DATA_UNAVAILABLE" },
      };
    case "EVALUATED":
      return {
        ...base,
        status: "AUTHORITY_NOT_AVAILABLE",
        detail:
          "No pinned decision authority governs Restoration Druid decisions: per-cast healing choice has no " +
          "approved model and healing-cooldown use is reported as observed facts only. Assignment execution is " +
          "judged only against a supplied raid cooldown plan that binds this fight, and each such result cites " +
          "that plan; without one, assignments are not evaluated. This is not an assessment of the player.",
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
    "The Restoration Druid registration never produces an ANALYZED result, so it has no observed-decision view.",
  );
}

/** The Restoration Druid specialization module (HEAL-B1, INTERNAL_ONLY). */
export const RESTORATION_DRUID_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: RESTORATION_DRUID_SPEC_ID,
    analyzerId: RESTORATION_DRUID_ANALYZER_ID,
    displayName: RESTORATION_DRUID_DISPLAY_NAME,
    wclClassName: RESTORATION_DRUID_WCL_CLASS_NAME,
    wclSpecName: RESTORATION_DRUID_WCL_SPEC_NAME,
  },
  exposure: "INTERNAL_ONLY",
  capabilities: RESTORATION_DRUID_CAPABILITIES,
  authorityBindings: RESTORATION_DRUID_AUTHORITY_BINDINGS,
  // No public description: INTERNAL_ONLY. The public prose is HEAL-B1P's.
  limitsProse: Object.freeze({ analysis: "", raidNight: "" }),
  supplementalAnalyses: [],
  analyze: (input, authority): RestorationDruidAnalysis => analyzeRestorationDruid(input, authority),
  observedDecisionView: noObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const RESTORATION_DRUID_REGISTRATION: AnalyzerRegistration = RESTORATION_DRUID_MODULE.registration;
