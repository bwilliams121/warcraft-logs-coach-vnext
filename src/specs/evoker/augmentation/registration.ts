/**
 * Augmentation Evoker's analyzer registration (M13-E; PUBLIC since M13-F).
 *
 * THIS IS WHERE AUGMENTATION STATES WHAT IT IS, AND THE ONLY PLACE.
 *
 * One row, owned by the specialization: its identity, its exposure, the two
 * decision families it is asked about and the evidence they consume, the
 * authority it binds (none), the facade that runs it, and the view shared
 * code may read (none: it never analyzes a decision).
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else
 * from this directory.
 *
 * THE FIRST REGISTRATION WITH NO AUTHORITY
 *
 * Both declared families are PROVIDER-LESS (`authority-domain.ts`):
 * SUPPORT_TARGETING (no approved recipient-quality model) and SUPPORT_TIMING
 * (no approved support-timing standard). The registration binds nothing, and
 * the facade reads each family's resolution from its own authority access
 * (`NO_PINNED_AUTHORITY_FOR_DOMAIN`), never a hard-coded answer. So no result
 * is ever ANALYZED: an ANALYZED envelope cites the decision authority it was
 * evaluated against, and there is none to cite. Runtime game data (the pinned
 * support-ability identities) is identity data, not decision authority, and is
 * never put in that place.
 *
 * WHAT A RESULT IS
 *
 *     AUTHORITY_NOT_AVAILABLE   the evaluator ran; no support decision has a
 *                               standard, so none was evaluated. The payload
 *                               carries the observable support facts
 *                               (`evaluation`, WCL_OBSERVED_FACT). Nothing in
 *                               it is a finding.
 *     INSUFFICIENT_EVIDENCE     the subject's identity is not stated or was
 *                               refused, or the pinned support data is
 *                               unusable: no fact was reconstructed.
 *
 * The payload rides on an unanalyzed envelope. Shared orchestration reads only
 * `status`, `specId` and `detail` of such an envelope, plus — since M13-F —
 * the SUPPORT-OBSERVATION VIEW this registration builds from it
 * (`support-observation-view.ts`). That view is the facts' reviewed public
 * shape: field for field, with every listing's completeness, every UNKNOWN and
 * both NO_AUTHORITY_AVAILABLE families, and no recipient-quality conclusion.
 *
 * PUBLIC SINCE M13-F, AND WHAT THAT CHANGED. The five-site edit (the
 * partition, the public contract's `specId` enum, the identity table, the
 * `satisfies PublicSpecId` on `spec.ts`, and `exposure` below) plus the
 * view. Reachability, not analysis: a public request for an Evoker/Augmentation
 * identity now dispatches this row, derives FULL_RAID from its declared
 * requirement, and receives exactly the result the internal lookup always
 * produced. It is never ANALYZED, so the promotion-evidence gates (which
 * measure observed DECISIONS) do not apply to it: it publishes none.
 *
 * IDENTITY. The facade is handed `SpecAnalysisInput`, which carries no
 * preflight identity. The evaluator's gate is fed the normalized fight's own
 * report code and fight id and the subject's Warcraft Logs-stated class and
 * specialization (`friendlySpecializations`, M13-B), which reads the same
 * `friendlySpecs` entry, by the same roster rules, as preflight does. A
 * subject with no stated specialization is INSUFFICIENT_EVIDENCE, never a
 * default; a stated specialization other than Augmentation is refused by the
 * evaluator's own gate.
 *
 * SCOPE. Both capabilities are declared from `AUGMENTATION_EVOKER_REQUIRED_INPUTS`,
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
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import type { SupportObservationOutcome } from "../../../findings/support-observation-view.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import {
  statedSpecializationOf,
  type StatedSpecialization,
} from "../../../engine/normalization/friendly-specializations.js";
import {
  evaluateAugmentationEvoker,
  type AugmentationEvokerEvaluation,
  type AugmentationEvokerInput,
} from "./evaluator.js";
import {
  AUGMENTATION_EVOKER_ANALYZER_ID,
  AUGMENTATION_EVOKER_DISPLAY_NAME,
  AUGMENTATION_EVOKER_REQUIRED_INPUTS,
  AUGMENTATION_EVOKER_SPEC_ID,
  AUGMENTATION_EVOKER_WCL_CLASS_NAME,
  AUGMENTATION_EVOKER_WCL_SPEC_NAME,
} from "./spec.js";
import { augmentationSupportObservations } from "./support-observation-view.js";

// ---------------------------------------------------------------------------
// Capabilities and authority
// ---------------------------------------------------------------------------

const SUPPORT_REQUIREMENTS: StateRequirements = Object.freeze({
  scope: AUGMENTATION_EVOKER_REQUIRED_INPUTS.scope,
  resources: Object.freeze([]),
  evidenceCategories: Object.freeze([...AUGMENTATION_EVOKER_REQUIRED_INPUTS.categories]),
  // Support facts are about allies, never about an enemy target.
  targetModel: "NO_TARGET",
});

export const AUGMENTATION_SUPPORT_TARGETING_CAPABILITY_ID = "evoker-augmentation.support-targeting";
export const AUGMENTATION_SUPPORT_TIMING_CAPABILITY_ID = "evoker-augmentation.support-timing";

export const AUGMENTATION_CAPABILITIES: readonly DecisionCapability<ProviderlessDomain>[] = Object.freeze([
  {
    capabilityId: AUGMENTATION_SUPPORT_TARGETING_CAPABILITY_ID,
    domain: "SUPPORT_TARGETING",
    requirements: SUPPORT_REQUIREMENTS,
  },
  {
    capabilityId: AUGMENTATION_SUPPORT_TIMING_CAPABILITY_ID,
    domain: "SUPPORT_TIMING",
    requirements: SUPPORT_REQUIREMENTS,
  },
]);

/** None: no provider kind may govern a support family. */
export const AUGMENTATION_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([]);

export const AUGMENTATION_DECLARED_DOMAINS: readonly ProviderlessDomain[] = Object.freeze(
  declaredDomainsOf(AUGMENTATION_CAPABILITIES),
);

// ---------------------------------------------------------------------------
// The analysis
// ---------------------------------------------------------------------------

/** One declared family and how the registration's own access resolved it. */
export interface AugmentationDomainResult {
  readonly domain: ProviderlessDomain;
  readonly resolution: AuthorityResolutionOutcome;
}

export type AugmentationEvokerAnalysis = UnanalyzedEnvelope & {
  readonly status: "AUTHORITY_NOT_AVAILABLE" | "INSUFFICIENT_EVIDENCE";
  readonly specId: typeof AUGMENTATION_EVOKER_SPEC_ID;
  readonly domains: readonly AugmentationDomainResult[];
  /** The subject's stated specialization, as the identity gate was fed it. */
  readonly subjectSpecialization: StatedSpecialization;
  /** The evaluator's result; `null` only when no identity could be fed to it. */
  readonly evaluation: AugmentationEvokerEvaluation | null;
};

/** Test seams, passed through to the evaluator. Production passes none. */
export type AugmentationEvokerSeams = Pick<AugmentationEvokerInput, "dataset" | "cooldownRegistry">;

/**
 * The facade. Pure: reads the normalized fight, never Warcraft Logs, and
 * returns facts, never a verdict.
 */
export function analyzeAugmentationEvoker(
  input: SpecAnalysisInput,
  authority: AuthorityAccess,
  seams: AugmentationEvokerSeams = {},
): AugmentationEvokerAnalysis {
  const { fight } = input.state;
  const specId = AUGMENTATION_EVOKER_SPEC_ID;
  const domains = AUGMENTATION_DECLARED_DOMAINS.map((domain): AugmentationDomainResult => ({
    domain,
    resolution: authority.forDomain(domain).outcome,
  }));
  const subjectSpecialization = statedSpecializationOf(fight.friendlySpecializations, input.actorId);
  if (subjectSpecialization.state !== "STATED") {
    return {
      status: "INSUFFICIENT_EVIDENCE",
      specId,
      detail:
        `Warcraft Logs states no usable specialization for the subject (${subjectSpecialization.reason}), ` +
        `so its identity could not be checked and no support fact was reconstructed.`,
      domains,
      subjectSpecialization,
      evaluation: null,
    };
  }

  const evaluation = evaluateAugmentationEvoker({
    fight,
    identity: {
      report: { code: fight.report.code },
      fight: { id: fight.fight.id },
      player: {
        sourceId: input.actorId,
        className: subjectSpecialization.className,
        specName: subjectSpecialization.specName,
      },
    },
    ...(seams.dataset === undefined ? {} : { dataset: seams.dataset }),
    ...(seams.cooldownRegistry === undefined ? {} : { cooldownRegistry: seams.cooldownRegistry }),
  });
  const base: Omit<AugmentationEvokerAnalysis, "status" | "detail"> = {
    specId,
    domains,
    subjectSpecialization,
    evaluation,
  };
  switch (evaluation.state) {
    case "IDENTITY_REFUSED":
      return {
        ...base,
        status: "INSUFFICIENT_EVIDENCE",
        detail: `The subject's identity was refused (${evaluation.reason}), so no support fact was reconstructed.`,
      };
    case "RUNTIME_DATA_UNAVAILABLE":
      return {
        ...base,
        status: "INSUFFICIENT_EVIDENCE",
        detail:
          "The pinned Augmentation support-ability data could not be used, so no support fact was reconstructed.",
      };
    case "EVALUATED":
      return {
        ...base,
        status: "AUTHORITY_NOT_AVAILABLE",
        detail:
          "No approved authority governs Augmentation support targeting or support timing, so no support " +
          "decision was evaluated and nothing here is a finding. Only the observable support facts are " +
          "reported (supportObservations); this is not an assessment of the player.",
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
    "The Augmentation Evoker registration never produces an ANALYZED result, so it has no observed-decision view.",
  );
}

/** The view of this registration's own result (M13-F). Shared code reads nothing else of the payload. */
export function augmentationSupportObservationView(
  analysis: AugmentationEvokerAnalysis,
): SupportObservationOutcome {
  return augmentationSupportObservations(analysis.evaluation);
}

/**
 * What the public tool descriptions say about Augmentation (M13-F). It is
 * observation-only, and the prose says so before anything else.
 */
export const AUGMENTATION_LIMITS = Object.freeze({
  analysis: [
    "Augmentation Evoker analysis reports OBSERVED SUPPORT FACTS ONLY, in supportObservations: Ebon Might",
    "and Prescience windows on each recipient with the recipient's identity, stated specialization, observed",
    "deaths and observed casts of a reviewed subset of its cooldowns, proven support time (a lower bound),",
    "the Evoker's own Ebon Might windows, and every support-ability cast, each with its listing completeness.",
    "No gameplay decision is evaluated: support targeting and support timing have no approved standard and",
    "are NO_AUTHORITY_AVAILABLE, so the status is AUTHORITY_NOT_AVAILABLE. It never says whether a recipient",
    "or a timing was good or wrong, it does not evaluate the Evoker's own damage rotation, and it does not",
    "score performance. A fact the evidence cannot establish is UNKNOWN, never zero or absent.",
  ].join("\n"),
  raidNight: [
    "Augmentation Evoker cells evaluate no gameplay decision (AUTHORITY_NOT_AVAILABLE): support targeting and",
    "timing have no approved standard, and the cells carry no support observations.",
  ].join("\n"),
});

/**
 * The Augmentation Evoker specialization module (M13-E; PUBLIC since M13-F).
 */
export const AUGMENTATION_EVOKER_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: AUGMENTATION_EVOKER_SPEC_ID,
    analyzerId: AUGMENTATION_EVOKER_ANALYZER_ID,
    displayName: AUGMENTATION_EVOKER_DISPLAY_NAME,
    wclClassName: AUGMENTATION_EVOKER_WCL_CLASS_NAME,
    wclSpecName: AUGMENTATION_EVOKER_WCL_SPEC_NAME,
  },
  exposure: "PUBLIC",
  capabilities: AUGMENTATION_CAPABILITIES,
  authorityBindings: AUGMENTATION_AUTHORITY_BINDINGS,
  limitsProse: AUGMENTATION_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority): AugmentationEvokerAnalysis => analyzeAugmentationEvoker(input, authority),
  observedDecisionView: noObservedDecisionView,
  supportObservationView: (analysis) => augmentationSupportObservationView(analysis),
});

/** The row the production catalog lists. The module owns it. */
export const AUGMENTATION_EVOKER_REGISTRATION: AnalyzerRegistration = AUGMENTATION_EVOKER_MODULE.registration;
