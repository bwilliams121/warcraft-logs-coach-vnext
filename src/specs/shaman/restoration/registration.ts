/**
 * Restoration Shaman's analyzer registration (HEAL-A; PUBLIC since HEAL-AP).
 *
 * THIS IS WHERE RESTORATION SHAMAN STATES WHAT IT IS, AND THE ONLY PLACE.
 *
 * One row, owned by the specialization: its identity, its exposure, the three
 * healer families it is asked about and the evidence they consume, the
 * authority it binds (none), and the facade that runs it.
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else
 * from this directory.
 *
 * THE FIRST HEALER REGISTRATION
 *
 * Every declared family is PROVIDER-LESS (`authority-domain.ts`):
 * COOLDOWN_ASSIGNMENT (its only standard is a caller-supplied raid cooldown
 * plan, request input and never a pinned binding), HEALING_COOLDOWN
 * (observational) and HEALING_DECISION (no approved per-cast healer model).
 * The registration binds nothing, and the facade reads each family's
 * resolution from its own authority access (`NO_PINNED_AUTHORITY_FOR_DOMAIN`).
 * So no result is ever ANALYZED: an ANALYZED envelope cites a pinned decision
 * artifact (`AnalysisAuthorityMetadata`), and a request's plan is not one.
 *
 * WHAT A RESULT IS
 *
 *     AUTHORITY_NOT_AVAILABLE   the evaluator ran; no PINNED decision authority
 *                               governs any family. The payload carries the
 *                               evaluation and its healer finding set
 *                               (`healer-finding.ts`). With a supplied plan
 *                               that binds this fight, the ASSIGNMENT findings
 *                               there are judged against THAT plan and cite
 *                               it; the envelope status does not summarize
 *                               them. Without one, ASSIGNMENT is
 *                               NO_AUTHORITY_AVAILABLE. COOLDOWN is facts,
 *                               HEALING_DECISION is NO_AUTHORITY_AVAILABLE.
 *     INSUFFICIENT_EVIDENCE     the subject's identity is not stated or was
 *                               refused, or the pinned healing-cooldown data is
 *                               unusable: nothing was evaluated.
 *
 * The payload rides on an unanalyzed envelope. Shared orchestration reads only
 * `status`, `specId` and `detail` of it, plus — since HEAL-AP — the HEALER
 * VIEW this registration builds from it (`healer-view.ts`): the finding set
 * and the facts each finding rests on, its reviewed public shape
 * (`healerFindings`).
 *
 * PUBLIC SINCE HEAL-AP, AND WHAT THAT CHANGED. The five-site edit (the
 * partition, the public contract's `specId` enum, the identity table, the
 * `satisfies PublicSpecId` on `spec.ts`, and `exposure` below) plus the view.
 * Reachability, not analysis: a public request for a Shaman/Restoration
 * identity dispatches this row, derives FULL_RAID from its declared
 * requirement, and receives exactly the result the internal lookup produced.
 * It passed the healer promotion gate
 * (`tests/contracts/heal-ap-healer-promotion-gate.test.ts`) first.
 *
 * ENVELOPE STATUS, PUBLICLY (HEAL-AP). AUTHORITY_NOT_AVAILABLE keeps its one
 * meaning, "no PINNED decision authority", including when assignment findings
 * were judged against a supplied plan: those findings cite the plan in
 * `healerFindings`, and the plan disclosure says EVALUATED_IN_HEALER_FINDINGS.
 *
 * IDENTITY. The facade is handed `SpecAnalysisInput`, which carries no
 * preflight identity. The evaluator's gate is fed the normalized fight's own
 * report code and fight id, the subject's Warcraft Logs-stated class and
 * specialization (`friendlySpecializations`, M13-B, the same `friendlySpecs`
 * entry preflight reads), and the actor catalog's name for the subject. A
 * subject with no stated specialization is INSUFFICIENT_EVIDENCE, never a
 * default; a stated specialization other than Restoration is refused by the
 * evaluator's own gate. A subject with no stated name keeps every unresolved
 * plan entry as possibly its own.
 *
 * PLAN. `SpecAnalysisInput.raidCooldownPlan`, untouched. Absent is no plan.
 *
 * SCOPE. Every capability is declared from `RESTORATION_SHAMAN_REQUIRED_INPUTS`,
 * so the registration's derived requirement is FULL_RAID by construction
 * (CLAUDE.md "Ingestion Scope Derivation").
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
import type { HealerViewOutcome } from "../../../findings/healer-view.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import {
  statedSpecializationOf,
  type StatedSpecialization,
} from "../../../engine/normalization/friendly-specializations.js";
import {
  evaluateRestorationShaman,
  type RestorationShamanEvaluation,
  type RestorationShamanInput,
} from "./evaluator.js";
import { restorationShamanHealerFindings } from "./healer-findings.js";
import { restorationShamanHealerView } from "./healer-view.js";
import {
  RESTORATION_SHAMAN_ANALYZER_ID,
  RESTORATION_SHAMAN_DISPLAY_NAME,
  RESTORATION_SHAMAN_REQUIRED_INPUTS,
  RESTORATION_SHAMAN_SPEC_ID,
  RESTORATION_SHAMAN_WCL_CLASS_NAME,
  RESTORATION_SHAMAN_WCL_SPEC_NAME,
} from "./spec.js";

// ---------------------------------------------------------------------------
// Capabilities and authority
// ---------------------------------------------------------------------------

const HEALER_REQUIREMENTS: StateRequirements = Object.freeze({
  scope: RESTORATION_SHAMAN_REQUIRED_INPUTS.scope,
  resources: Object.freeze([]),
  evidenceCategories: Object.freeze([...RESTORATION_SHAMAN_REQUIRED_INPUTS.categories]),
  // Healer facts are about the subject and its allies, never an enemy target.
  targetModel: "NO_TARGET",
});

export const RESTORATION_COOLDOWN_ASSIGNMENT_CAPABILITY_ID = "shaman-restoration.cooldown-assignment";
export const RESTORATION_HEALING_COOLDOWN_CAPABILITY_ID = "shaman-restoration.healing-cooldown";
export const RESTORATION_HEALING_DECISION_CAPABILITY_ID = "shaman-restoration.healing-decision";

export const RESTORATION_SHAMAN_CAPABILITIES: readonly DecisionCapability<ProviderlessDomain>[] =
  Object.freeze([
    {
      capabilityId: RESTORATION_COOLDOWN_ASSIGNMENT_CAPABILITY_ID,
      domain: "COOLDOWN_ASSIGNMENT",
      requirements: HEALER_REQUIREMENTS,
    },
    {
      capabilityId: RESTORATION_HEALING_COOLDOWN_CAPABILITY_ID,
      domain: "HEALING_COOLDOWN",
      requirements: HEALER_REQUIREMENTS,
    },
    {
      capabilityId: RESTORATION_HEALING_DECISION_CAPABILITY_ID,
      domain: "HEALING_DECISION",
      requirements: HEALER_REQUIREMENTS,
    },
  ]);

/** None: no provider kind may govern a healer family. */
export const RESTORATION_SHAMAN_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([]);

export const RESTORATION_SHAMAN_DECLARED_DOMAINS: readonly ProviderlessDomain[] = Object.freeze(
  declaredDomainsOf(RESTORATION_SHAMAN_CAPABILITIES),
);

// ---------------------------------------------------------------------------
// The analysis
// ---------------------------------------------------------------------------

/** One declared family and how the registration's own access resolved it. */
export interface RestorationShamanDomainResult {
  readonly domain: ProviderlessDomain;
  readonly resolution: AuthorityResolutionOutcome;
}

/** The healer findings, or why none were built. Never an empty set standing in for "nothing found". */
export type RestorationShamanFindingOutcome =
  | { readonly assessment: "ASSESSED"; readonly set: HealerFindingSet }
  | {
      readonly assessment: "NOT_ASSESSED";
      readonly reason: "SUBJECT_SPECIALIZATION_NOT_STATED" | "IDENTITY_REFUSED" | "RUNTIME_DATA_UNAVAILABLE";
    };

export type RestorationShamanAnalysis = UnanalyzedEnvelope & {
  readonly status: "AUTHORITY_NOT_AVAILABLE" | "INSUFFICIENT_EVIDENCE";
  readonly specId: typeof RESTORATION_SHAMAN_SPEC_ID;
  readonly domains: readonly RestorationShamanDomainResult[];
  /** The subject's stated specialization, as the identity gate was fed it. */
  readonly subjectSpecialization: StatedSpecialization;
  /** Whether the input carried a raid cooldown plan. */
  readonly planSupplied: boolean;
  /** The evaluator's result; `null` only when no identity could be fed to it. */
  readonly evaluation: RestorationShamanEvaluation | null;
  readonly healerFindings: RestorationShamanFindingOutcome;
};

/** Test seams, passed through to the evaluator. Production passes none. */
export type RestorationShamanSeams = Pick<RestorationShamanInput, "dataset" | "overlapSpanMs">;

/**
 * The facade. Pure: reads the normalized fight and the supplied plan, never
 * Warcraft Logs.
 */
export function analyzeRestorationShaman(
  input: SpecAnalysisInput,
  authority: AuthorityAccess,
  seams: RestorationShamanSeams = {},
): RestorationShamanAnalysis {
  const { fight } = input.state;
  const specId = RESTORATION_SHAMAN_SPEC_ID;
  const plan = input.raidCooldownPlan ?? null;
  const domains = RESTORATION_SHAMAN_DECLARED_DOMAINS.map((domain): RestorationShamanDomainResult => ({
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

  const evaluation = evaluateRestorationShaman({
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
  const base: Omit<RestorationShamanAnalysis, "status" | "detail" | "healerFindings"> = {
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
          "The pinned Restoration Shaman healing-cooldown data could not be used, so nothing was evaluated.",
        healerFindings: { assessment: "NOT_ASSESSED", reason: "RUNTIME_DATA_UNAVAILABLE" },
      };
    case "EVALUATED":
      return {
        ...base,
        status: "AUTHORITY_NOT_AVAILABLE",
        detail:
          "No pinned decision authority governs Restoration Shaman decisions: per-cast healing choice has no " +
          "approved model and healing-cooldown use is reported as observed facts only. Assignment execution is " +
          "judged only against a supplied raid cooldown plan that binds this fight, and each such result cites " +
          "that plan; without one, assignments are not evaluated. The results are reported in healerFindings; " +
          "this is not an assessment of the player.",
        healerFindings: { assessment: "ASSESSED", set: restorationShamanHealerFindings(evaluation, plan) },
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
    "The Restoration Shaman registration never produces an ANALYZED result, so it has no observed-decision view.",
  );
}

/**
 * The view of this registration's own result (HEAL-AP): the finding set and
 * the facts each finding rests on. Shared code reads nothing else of the
 * payload. NOT_ASSESSED passes through with its reason, never as an empty set.
 */
export function restorationShamanHealerViewOf(analysis: RestorationShamanAnalysis): HealerViewOutcome {
  const outcome = analysis.healerFindings;
  if (outcome.assessment === "NOT_ASSESSED") return { assessment: "NOT_ASSESSED", reason: outcome.reason };
  if (analysis.evaluation?.state !== "EVALUATED") {
    throw new Error("A Restoration Shaman finding set exists without an evaluated result.");
  }
  return { assessment: "ASSESSED", view: restorationShamanHealerView(analysis.evaluation, outcome.set) };
}

/**
 * What the public tool descriptions say about Restoration Shaman (HEAL-AP).
 * It is observation and plan-execution only, and the prose says so first.
 */
export const RESTORATION_SHAMAN_LIMITS = Object.freeze({
  analysis: [
    "Restoration Shaman analysis reports HEALER FINDINGS ONLY, in healerFindings. ASSIGNMENT: with a supplied",
    "raidCooldownPlan that binds this fight, each of the player's plan entries for an identified healing cooldown",
    "(Spirit Link Totem, Ascendance, Healing Tide Totem) is ASSIGNMENT_MET when the player's own cast lies in",
    "the planned window, an outcome naming the encounter's end when the completed encounter ended before the window opened, and",
    "UNKNOWN otherwise, with the reason: with no cast in the window, readiness is not established.",
    "Without a plan, ASSIGNMENT is NO_AUTHORITY_AVAILABLE and no assignment is inferred. COOLDOWN: each observed",
    "healing-cooldown use, with the damage episodes overlapping it and their coverage, as facts with no verdict.",
    "HEALING_DECISION: per-cast spell choice has no approved model and is NO_AUTHORITY_AVAILABLE. The status is",
    "AUTHORITY_NOT_AVAILABLE (no pinned decision authority). It does not rank healing, report HPS, judge whether a",
    "cooldown should have been used, or judge the plan. A fact the evidence cannot establish is UNKNOWN.",
  ].join("\n"),
  raidNight: [
    "Restoration Shaman cells evaluate no gameplay decision (AUTHORITY_NOT_AVAILABLE): a raid night carries no",
    "raid cooldown plan, and the cells carry no healer findings.",
  ].join("\n"),
});

/**
 * The Restoration Shaman specialization module (HEAL-A; PUBLIC since HEAL-AP).
 */
export const RESTORATION_SHAMAN_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: RESTORATION_SHAMAN_SPEC_ID,
    analyzerId: RESTORATION_SHAMAN_ANALYZER_ID,
    displayName: RESTORATION_SHAMAN_DISPLAY_NAME,
    wclClassName: RESTORATION_SHAMAN_WCL_CLASS_NAME,
    wclSpecName: RESTORATION_SHAMAN_WCL_SPEC_NAME,
  },
  exposure: "PUBLIC",
  capabilities: RESTORATION_SHAMAN_CAPABILITIES,
  authorityBindings: RESTORATION_SHAMAN_AUTHORITY_BINDINGS,
  limitsProse: RESTORATION_SHAMAN_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority): RestorationShamanAnalysis => analyzeRestorationShaman(input, authority),
  observedDecisionView: noObservedDecisionView,
  healerView: (analysis) => restorationShamanHealerViewOf(analysis),
});

/** The row the production catalog lists. The module owns it. */
export const RESTORATION_SHAMAN_REGISTRATION: AnalyzerRegistration = RESTORATION_SHAMAN_MODULE.registration;
