/**
 * Preservation Evoker's analyzer registration (HEAL-B4; PUBLIC since HEAL-B4P).
 *
 * THIS IS WHERE PRESERVATION EVOKER STATES WHAT IT IS, AND THE ONLY PLACE.
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
 *   refused, the pinned healing-cooldown data is unusable, or the evidence
 *   contradicts it (an identified ability observed empowered).
 * - ROLE. The module identity carries the pinned roster's role, UNKNOWN for
 *   Preservation, as is. The healer families are declared here, not derived
 *   from a role, and no role is guessed.
 * - IDENTITY. The evaluator's gate is fed the normalized fight's own report
 *   code and fight id, the subject's Warcraft Logs-stated class and
 *   specialization (`friendlySpecializations`), and the actor catalog's name.
 *   A subject with no stated specialization is INSUFFICIENT_EVIDENCE, never a
 *   default.
 * - PLAN. `SpecAnalysisInput.raidCooldownPlan`, untouched. Absent is no plan.
 * - SCOPE. Every capability is declared from
 *   `PRESERVATION_EVOKER_REQUIRED_INPUTS`, so the derived requirement is
 *   FULL_RAID by construction.
 *
 * PUBLIC SINCE HEAL-B4P, AND WHAT THAT CHANGED. The five-site edit (the
 * partition, the public contract's `specId` enum, the identity table, the
 * `satisfies PublicSpecId` on `spec.ts`, and `exposure` below) plus the
 * HEALER VIEW this registration builds from its own result (the shared
 * `healer-view-projection.ts`), published as `healerFindings` exactly as
 * Restoration Shaman's is (HEAL-AP). Reachability, not analysis: a public
 * request for this identity dispatches this row, derives FULL_RAID from its
 * declared requirement, and receives exactly the result the internal lookup
 * produced. Its one addition to the public vocabulary is the NOT_ASSESSED
 * reason RUNTIME_DATA_CONTRADICTED. It passed the healer promotion gate
 * (`tests/contracts/heal-ap-healer-promotion-gate.test.ts`) first, on the
 * Preservation Evoker of gtKb2xHn87pNcFfW fight 22 (actor 15).
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
import type { HealerViewOutcome } from "../../../findings/healer-view.js";
import { healerViewOfEvaluation } from "../../../findings/healer-view-projection.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import {
  statedSpecializationOf,
  type StatedSpecialization,
} from "../../../engine/normalization/friendly-specializations.js";
import {
  evaluatePreservationEvoker,
  type PreservationEvokerEvaluation,
  type PreservationEvokerInput,
} from "./evaluator.js";
import {
  PRESERVATION_EVOKER_ANALYZER_ID,
  PRESERVATION_EVOKER_DISPLAY_NAME,
  PRESERVATION_EVOKER_REQUIRED_INPUTS,
  PRESERVATION_EVOKER_SPEC_ID,
  PRESERVATION_EVOKER_WCL_CLASS_NAME,
  PRESERVATION_EVOKER_WCL_SPEC_NAME,
} from "./spec.js";

// ---------------------------------------------------------------------------
// Capabilities and authority
// ---------------------------------------------------------------------------

const HEALER_REQUIREMENTS: StateRequirements = Object.freeze({
  scope: PRESERVATION_EVOKER_REQUIRED_INPUTS.scope,
  resources: Object.freeze([]),
  evidenceCategories: Object.freeze([...PRESERVATION_EVOKER_REQUIRED_INPUTS.categories]),
  // Healer facts are about the subject and its allies, never an enemy target.
  targetModel: "NO_TARGET",
});

export const PRESERVATION_EVOKER_COOLDOWN_ASSIGNMENT_CAPABILITY_ID =
  "evoker-preservation.cooldown-assignment";
export const PRESERVATION_EVOKER_HEALING_COOLDOWN_CAPABILITY_ID = "evoker-preservation.healing-cooldown";
export const PRESERVATION_EVOKER_HEALING_DECISION_CAPABILITY_ID = "evoker-preservation.healing-decision";

export const PRESERVATION_EVOKER_CAPABILITIES: readonly DecisionCapability<ProviderlessDomain>[] =
  Object.freeze([
    {
      capabilityId: PRESERVATION_EVOKER_COOLDOWN_ASSIGNMENT_CAPABILITY_ID,
      domain: "COOLDOWN_ASSIGNMENT",
      requirements: HEALER_REQUIREMENTS,
    },
    {
      capabilityId: PRESERVATION_EVOKER_HEALING_COOLDOWN_CAPABILITY_ID,
      domain: "HEALING_COOLDOWN",
      requirements: HEALER_REQUIREMENTS,
    },
    {
      capabilityId: PRESERVATION_EVOKER_HEALING_DECISION_CAPABILITY_ID,
      domain: "HEALING_DECISION",
      requirements: HEALER_REQUIREMENTS,
    },
  ]);

/** None: no provider kind may govern a healer family. */
export const PRESERVATION_EVOKER_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([]);

export const PRESERVATION_EVOKER_DECLARED_DOMAINS: readonly ProviderlessDomain[] = Object.freeze(
  declaredDomainsOf(PRESERVATION_EVOKER_CAPABILITIES),
);

// ---------------------------------------------------------------------------
// The analysis
// ---------------------------------------------------------------------------

/** One declared family and how the registration's own access resolved it. */
export interface PreservationEvokerDomainResult {
  readonly domain: ProviderlessDomain;
  readonly resolution: AuthorityResolutionOutcome;
}

/** The healer findings, or why none were built. Never an empty set standing in for "nothing found". */
export type PreservationEvokerFindingOutcome =
  | { readonly assessment: "ASSESSED"; readonly set: HealerFindingSet }
  | {
      readonly assessment: "NOT_ASSESSED";
      readonly reason:
        | "SUBJECT_SPECIALIZATION_NOT_STATED"
        | "IDENTITY_REFUSED"
        | "RUNTIME_DATA_UNAVAILABLE"
        | "RUNTIME_DATA_CONTRADICTED";
    };

export type PreservationEvokerAnalysis = UnanalyzedEnvelope & {
  readonly status: "AUTHORITY_NOT_AVAILABLE" | "INSUFFICIENT_EVIDENCE";
  readonly specId: typeof PRESERVATION_EVOKER_SPEC_ID;
  readonly domains: readonly PreservationEvokerDomainResult[];
  /** The subject's stated specialization, as the identity gate was fed it. */
  readonly subjectSpecialization: StatedSpecialization;
  /** Whether the input carried a raid cooldown plan. */
  readonly planSupplied: boolean;
  /** The evaluator's result; `null` only when no identity could be fed to it. */
  readonly evaluation: PreservationEvokerEvaluation | null;
  readonly healerFindings: PreservationEvokerFindingOutcome;
};

/** Test seams, passed through to the evaluator. Production passes none. */
export type PreservationEvokerSeams = Pick<PreservationEvokerInput, "dataset" | "overlapSpanMs">;

/** The facade. Pure: reads the normalized fight and the supplied plan, never Warcraft Logs. */
export function analyzePreservationEvoker(
  input: SpecAnalysisInput,
  authority: AuthorityAccess,
  seams: PreservationEvokerSeams = {},
): PreservationEvokerAnalysis {
  const { fight } = input.state;
  const specId = PRESERVATION_EVOKER_SPEC_ID;
  const plan = input.raidCooldownPlan ?? null;
  const domains = PRESERVATION_EVOKER_DECLARED_DOMAINS.map((domain): PreservationEvokerDomainResult => ({
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

  const evaluation = evaluatePreservationEvoker({
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
  const base: Omit<PreservationEvokerAnalysis, "status" | "detail" | "healerFindings"> = {
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
          "The pinned Preservation Evoker healing-cooldown data could not be used, so nothing was evaluated.",
        healerFindings: { assessment: "NOT_ASSESSED", reason: "RUNTIME_DATA_UNAVAILABLE" },
      };
    case "RUNTIME_DATA_CONTRADICTED":
      return {
        ...base,
        status: "INSUFFICIENT_EVIDENCE",
        detail:
          "The player cast an ability the pinned data names as a non-empowered healing cooldown as an empowered " +
          "spell, so its cast events cannot be read as uses and nothing was evaluated.",
        healerFindings: { assessment: "NOT_ASSESSED", reason: "RUNTIME_DATA_CONTRADICTED" },
      };
    case "EVALUATED":
      return {
        ...base,
        status: "AUTHORITY_NOT_AVAILABLE",
        detail:
          "No pinned decision authority governs Preservation Evoker decisions: per-cast healing choice has no " +
          "approved model and healing-cooldown use is reported as observed facts only. Assignment execution is " +
          "judged only against a supplied raid cooldown plan that binds this fight, and each such result cites " +
          "that plan; without one, assignments are not evaluated. Empowered spells are not healing cooldowns " +
          "here and are not judged. The results are reported in healerFindings; this is not an assessment of the player.",
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
    "The Preservation Evoker registration never produces an ANALYZED result, so it has no observed-decision view.",
  );
}

/**
 * The view of this registration's own result (HEAL-B4P): the finding set and
 * the facts each finding rests on. Shared code reads nothing else of the
 * payload. NOT_ASSESSED passes through with its reason, never as an empty set.
 */
export function preservationEvokerHealerViewOf(analysis: PreservationEvokerAnalysis): HealerViewOutcome {
  const outcome = analysis.healerFindings;
  if (outcome.assessment === "NOT_ASSESSED") return { assessment: "NOT_ASSESSED", reason: outcome.reason };
  if (analysis.evaluation?.state !== "EVALUATED") {
    throw new Error("A Preservation Evoker finding set exists without an evaluated result.");
  }
  return { assessment: "ASSESSED", view: healerViewOfEvaluation(analysis.evaluation, outcome.set) };
}

/**
 * What the public tool descriptions say about Preservation Evoker (HEAL-B4P).
 * It is observation and plan-execution only, and the prose says so first.
 */
export const PRESERVATION_EVOKER_LIMITS = Object.freeze({
  analysis: [
    "Preservation Evoker analysis reports HEALER FINDINGS ONLY, in healerFindings. ASSIGNMENT: with a supplied",
    "raidCooldownPlan that binds this fight, each of the player's plan entries for an identified healing cooldown",
    "(Rewind, Dream Flight, Stasis) is ASSIGNMENT_MET when the player's own cast lies in",
    "the planned window, an outcome naming the encounter's end when the completed encounter ended before the window opened, and",
    "UNKNOWN otherwise, with the reason: with no cast in the window, readiness is not established.",
    "Without a plan, ASSIGNMENT is NO_AUTHORITY_AVAILABLE and no assignment is inferred. COOLDOWN: each observed",
    "healing-cooldown use, with the damage episodes overlapping it and their coverage, as facts with no verdict.",
    "Empowered spells are not identified healing cooldowns and no empowered cast is judged. Stasis's release is not a use.",
    "HEALING_DECISION: per-cast spell choice has no approved model and is NO_AUTHORITY_AVAILABLE. The status is",
    "AUTHORITY_NOT_AVAILABLE (no pinned decision authority). It does not rank healing, report HPS, judge whether a",
    "cooldown should have been used, or judge the plan. A fact the evidence cannot establish is UNKNOWN.",
  ].join("\n"),
  raidNight: [
    "Preservation Evoker cells evaluate no gameplay decision (AUTHORITY_NOT_AVAILABLE): a raid night carries no",
    "raid cooldown plan, and the cells carry no healer findings.",
  ].join("\n"),
});

/** The Preservation Evoker specialization module (HEAL-B4; PUBLIC since HEAL-B4P). */
export const PRESERVATION_EVOKER_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: PRESERVATION_EVOKER_SPEC_ID,
    analyzerId: PRESERVATION_EVOKER_ANALYZER_ID,
    displayName: PRESERVATION_EVOKER_DISPLAY_NAME,
    wclClassName: PRESERVATION_EVOKER_WCL_CLASS_NAME,
    wclSpecName: PRESERVATION_EVOKER_WCL_SPEC_NAME,
  },
  exposure: "PUBLIC",
  capabilities: PRESERVATION_EVOKER_CAPABILITIES,
  authorityBindings: PRESERVATION_EVOKER_AUTHORITY_BINDINGS,
  limitsProse: PRESERVATION_EVOKER_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority): PreservationEvokerAnalysis => analyzePreservationEvoker(input, authority),
  observedDecisionView: noObservedDecisionView,
  healerView: (analysis) => preservationEvokerHealerViewOf(analysis),
});

/** The row the production catalog lists. The module owns it. */
export const PRESERVATION_EVOKER_REGISTRATION: AnalyzerRegistration = PRESERVATION_EVOKER_MODULE.registration;
