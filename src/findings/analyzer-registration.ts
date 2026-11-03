/**
 * An analyzer registration — the one row that joins a specialization's
 * identity, exposure, declared capabilities, bound authority, implementation
 * and projection adapter, so none of them can drift apart.
 *
 * TWO STATES THAT USED TO BE ONE
 *
 * Before M10-A, "registered" meant "publicly supported": the registry list was
 * the dispatch list. That collapses a distinction a second specialization
 * needs. An evaluator has to exist, be registered and be exercised by tests
 * BEFORE it is safe to expose, so exposure is a field a registration states:
 *
 *     INTERNAL_ONLY   in the catalog; reachable by internal lookup and tests;
 *                     never selected by the application service, raid-night
 *                     orchestration, REST or MCP
 *     PUBLIC          all of the above, and selected for public requests
 *
 * A PUBLIC registration must name a public `SpecId`; the registry validates
 * that (`src/services/analyzer-registry.ts`), together with the identity table,
 * so the three cannot disagree.
 *
 * A REGISTRATION IS IMMUTABLE DATA
 *
 * `defineAnalyzerRegistration` returns a DEEPLY FROZEN snapshot: the row, its
 * capability list, each capability, each requirements block and its two
 * vocabulary arrays, the binding list and each binding. `snapshotRegistration`
 * produces the same shape from any registration-shaped value, and the registry
 * validates only such snapshots. TypeScript `readonly` is a compile-time
 * courtesy; the freeze is what makes "validated" mean something after the
 * fact — a caller cannot flip an exposure or append a binding to a row that
 * has already been checked.
 *
 * THE ADAPTER IS SPEC-OWNED, AND IT IS THE ONLY WAY OUT
 *
 * `observedDecisionView` is how a specialization decides what its analysis
 * looks like to shared projectors. Shared code never reads the payload; it
 * reads the view the registration produced. See `observed-decision-view.ts`.
 *
 * AUTHORITY IS DELIVERED, NOT FETCHED
 *
 * `defineAnalyzerRegistration` closes the specialization's `analyze` over an
 * `AuthorityAccess` built from that registration's OWN frozen bindings.
 * Orchestration calls `registration.analyze(input)` and never touches an
 * authority; the evaluator asks its access object for a domain and receives a
 * typed resolution. There is no argument through which another
 * specialization's binding could arrive.
 *
 * A RESULT IS OWNED, AND OWNERSHIP IS CHECKED AT RUNTIME
 *
 * Types say a registration returns an analysis about its own specialization.
 * Types are not a trust boundary at runtime, so `assertAnalysisOwnership`
 * checks it: the input names this registration's spec, and every result —
 * analyzed or not — carries exactly this registration's `specId`. A mismatch
 * is an `AnalyzerResultOwnershipError`, an internal integrity failure. It is
 * never rewritten as `SPEC_NOT_SUPPORTED`, `specId: null` or an evidence
 * UNKNOWN, and the services refuse it before any projection or aggregation.
 */

import type {
  AnalyzedEnvelope,
  SpecAnalysisEnvelope,
  SpecAnalysisInput,
  UnanalyzedEnvelope,
} from "./analysis-envelope.js";
import {
  resolveAuthorityForDomain,
  type AuthorityAccess,
  type AuthorityDomainBinding,
  type DecisionDomain,
} from "./authority-domain.js";
import {
  declaredDomainsOf,
  requirementFromCapabilities,
  type DecisionCapability,
  type StateRequirements,
} from "./decision-capability.js";
import type { ObservedDecisionView } from "./observed-decision-view.js";
import type { SpecId } from "./spec-id.js";
import type { HealerViewOutcome } from "./healer-view.js";
import type { SupportObservationOutcome } from "./support-observation-view.js";
import type { AnalyzerRequirement } from "../services/ingestion-scope.js";

export type AnalyzerExposure = "INTERNAL_ONLY" | "PUBLIC";

/** Public limitation prose per surface. See `AnalyzerDefinition.publicLimits`. */
export interface PublicLimitsProse {
  readonly analysis: string;
  readonly raidNight: string;
}

export const NO_PUBLIC_LIMITS: PublicLimitsProse = Object.freeze({ analysis: "", raidNight: "" });

function snapshotLimits(limits: PublicLimitsProse | undefined): PublicLimitsProse {
  return Object.freeze({ analysis: limits?.analysis ?? "", raidNight: limits?.raidNight ?? "" });
}

export const ANALYZER_EXPOSURES = Object.freeze([
  "INTERNAL_ONLY",
  "PUBLIC",
] as const satisfies readonly AnalyzerExposure[]);

/**
 * What a specialization writes down. Typed against ITS analysis, so the adapter
 * receives the payload it knows and the registry sees only the envelope.
 */
export interface AnalyzerDefinition<TAnalysis extends SpecAnalysisEnvelope> {
  readonly analyzerId: string;
  readonly specId: SpecId;
  /**
   * The specialization's human-readable name, e.g. `"Protection Paladin"`.
   *
   * Presentation data, not gameplay data: it is read by nothing that analyzes
   * a fight. It exists so the public surfaces derive their "supported
   * specializations" wording from the PUBLIC registrations (M11-A1,
   * `supportedSpecializationsSentence`) instead of hand-listing names in
   * several tool modules that could disagree. The registry refuses a blank
   * one (`INVALID_DISPLAY_NAME`).
   */
  readonly displayName: string;
  readonly exposure: AnalyzerExposure;
  readonly capabilities: readonly DecisionCapability<DecisionDomain>[];
  readonly authorityBindings: readonly AuthorityDomainBinding[];
  /**
   * Author-written public limitation prose per surface (M11-A2), composed
   * into the MCP tool descriptions for PUBLIC registrations. Presentation
   * data like `displayName`; empty strings mean "no limitation paragraph on
   * that surface". Optional here so a hand-assembled registration defaults
   * to none; the snapshot always carries both strings.
   */
  readonly publicLimits?: PublicLimitsProse | undefined;
  /** The facade, handed the registration's own authority access. */
  readonly analyze: (input: SpecAnalysisInput, authority: AuthorityAccess) => TAnalysis;
  /** The spec-owned projection of an analyzed result. */
  readonly observedDecisionView: (
    analysis: Extract<TAnalysis, { status: "ANALYZED" }>,
  ) => ObservedDecisionView;
  /**
   * The spec-owned projection of an UNANALYZED result's support observations
   * (M13-F). Optional; omitted means the registration publishes none. Only a
   * registration whose support decisions have no authority supplies one, and
   * it is the only way shared code reads that payload.
   */
  readonly supportObservationView?:
    ((analysis: Exclude<TAnalysis, { status: "ANALYZED" }>) => SupportObservationOutcome) | undefined;
  /**
   * The spec-owned projection of an UNANALYZED result's healer findings
   * (HEAL-AP). Optional; omitted means the registration publishes none. Only a
   * healer registration supplies one, and it is the only way shared code reads
   * that payload.
   */
  readonly healerView?:
    ((analysis: Exclude<TAnalysis, { status: "ANALYZED" }>) => HealerViewOutcome) | undefined;
}

/** The registration as orchestration holds it: envelope-typed, authority-closed, frozen. */
export interface AnalyzerRegistration {
  readonly analyzerId: string;
  readonly specId: SpecId;
  /** See `AnalyzerDefinition.displayName`. Copied by the snapshot like every other datum. */
  readonly displayName: string;
  readonly exposure: AnalyzerExposure;
  /** See `AnalyzerDefinition.publicLimits`. Always present on a row. */
  readonly publicLimits: PublicLimitsProse;
  readonly capabilities: readonly DecisionCapability<DecisionDomain>[];
  readonly authorityBindings: readonly AuthorityDomainBinding[];
  /**
   * The ingestion requirement, DERIVED from `capabilities`.
   *
   * Always recomputed by `snapshotRegistration`, so a registration cannot
   * carry a requirement that disagrees with what it declares.
   */
  readonly requirement: AnalyzerRequirement;
  /** Resolves this registration's own bindings. Exposed for tests and integrity checks. */
  readonly authority: AuthorityAccess;
  /** Runs the facade with this registration's authority. Never a lower-level evaluator. */
  readonly analyze: (input: SpecAnalysisInput) => SpecAnalysisEnvelope;
  readonly observedDecisionView: (analysis: AnalyzedEnvelope) => ObservedDecisionView;
  /** See `AnalyzerDefinition.supportObservationView`. Absent when the registration publishes none. */
  readonly supportObservationView?: ((analysis: UnanalyzedEnvelope) => SupportObservationOutcome) | undefined;
  /** See `AnalyzerDefinition.healerView`. Absent when the registration publishes none. */
  readonly healerView?: ((analysis: UnanalyzedEnvelope) => HealerViewOutcome) | undefined;
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

export type OwnershipDefect =
  | "INPUT_NAMES_ANOTHER_SPEC"
  | "RESULT_NAMES_ANOTHER_SPEC"
  | "ANALYZED_WITHOUT_SPEC_ID"
  /**
   * An ANALYZED result names this registration's spec but cites an authority
   * this registration does not bind (M10-C).
   *
   * The forgery the id check alone cannot catch once TWO registrations exist:
   * another specialization's analysis relabelled with this spec id carries a
   * matching `specId` and a shape-compatible payload, and would flow into this
   * registration's view adapter unnoticed. The authority metadata every
   * analyzed envelope carries is what the relabelling cannot fake — it names
   * the artifact the decisions were actually evaluated against.
   */
  | "RESULT_CITES_FOREIGN_AUTHORITY";

/**
 * Raised when an analyzer is asked about, or answers about, a specialization
 * that is not its own. Deterministic and author-written; names ids only.
 */
export class AnalyzerResultOwnershipError extends Error {
  readonly analyzerId: string;
  readonly defect: OwnershipDefect;

  constructor(analyzerId: string, defect: OwnershipDefect, detail: string) {
    super(`Analyzer '${analyzerId}' violated result ownership (${defect}): ${detail}`);
    this.name = "AnalyzerResultOwnershipError";
    this.analyzerId = analyzerId;
    this.defect = defect;
  }
}

export type OwnershipCheck =
  { readonly ok: true } | { readonly ok: false; readonly defect: OwnershipDefect; readonly detail: string };

/**
 * Whether an analysis is one this registration may have produced.
 *
 * Every envelope carries a `specId` string; there is no unanalyzed status
 * whose `specId` is legitimately null, so the rule is uniform: it must equal
 * the registration's id exactly. `null` on an ANALYZED result gets its own
 * defect code because it is the specific forgery that would otherwise read as
 * "no public analyzer".
 */
export function checkAnalysisOwnership(
  registration: AnalyzerRegistration,
  analysis: unknown,
): OwnershipCheck {
  const record = analysis as { readonly status?: unknown; readonly specId?: unknown };
  const specId = record.specId;
  if (record.status === "ANALYZED" && (specId === null || specId === undefined)) {
    return {
      ok: false,
      defect: "ANALYZED_WITHOUT_SPEC_ID",
      detail: `an ANALYZED result must name '${registration.specId}'; it named nothing`,
    };
  }
  if (specId !== registration.specId) {
    return {
      ok: false,
      defect: "RESULT_NAMES_ANOTHER_SPEC",
      detail: `the result names '${String(specId)}' but the registration owns '${registration.specId}'`,
    };
  }
  if (record.status === "ANALYZED") {
    // An analyzed result cites the authority it was evaluated against. It must
    // be one this registration binds; a registration binding nothing (an
    // evaluator with no pinned authority) could not have produced an ANALYZED
    // result citing one at all.
    const cited = (record as { readonly authority?: { readonly authorityId?: unknown } }).authority
      ?.authorityId;
    const bound = registration.authorityBindings.map((binding) => binding.authorityId);
    if (typeof cited !== "string" || !bound.includes(cited)) {
      return {
        ok: false,
        defect: "RESULT_CITES_FOREIGN_AUTHORITY",
        detail:
          `the result cites authority '${String(cited)}' but the registration binds ` +
          `[${bound.join(", ")}]`,
      };
    }
  }
  return { ok: true };
}

/** Throws `AnalyzerResultOwnershipError` when the analysis is not this registration's. */
export function assertAnalysisOwnership(registration: AnalyzerRegistration, analysis: unknown): void {
  const check = checkAnalysisOwnership(registration, analysis);
  if (!check.ok) throw new AnalyzerResultOwnershipError(registration.analyzerId, check.defect, check.detail);
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

function freezeStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function snapshotCapability(
  capability: DecisionCapability<DecisionDomain>,
): DecisionCapability<DecisionDomain> {
  const { requirements } = capability;
  return Object.freeze({
    capabilityId: capability.capabilityId,
    domain: capability.domain,
    requirements: Object.freeze({
      scope: requirements.scope,
      resources: freezeStrings(requirements.resources) as StateRequirements["resources"],
      evidenceCategories: freezeStrings(
        requirements.evidenceCategories,
      ) as StateRequirements["evidenceCategories"],
      targetModel: requirements.targetModel,
      ...(requirements.ownedPetEvidence === true ? { ownedPetEvidence: true as const } : {}),
    }),
  });
}

function snapshotBinding(binding: AuthorityDomainBinding): AuthorityDomainBinding {
  return Object.freeze({
    kind: binding.kind,
    domain: binding.domain,
    authorityId: binding.authorityId,
    artifactRevision: binding.artifactRevision,
    commitSha: binding.commitSha,
    load: binding.load,
  });
}

/**
 * A deeply frozen copy of a registration.
 *
 * Every validation-relevant value is COPIED and FROZEN: the row, the
 * capability list and each capability down to its vocabulary arrays, the
 * binding list and each binding, and the derived requirement. The three
 * functions (`analyze`, `observedDecisionView`, each binding's `load`) are
 * retained by reference — they are the specialization's code, not data the
 * registry judges — and `authority` is rebuilt over the frozen bindings so the
 * exposed access object resolves exactly what the snapshot declares.
 *
 * Mutating the ORIGINAL after snapshotting changes nothing about the
 * snapshot; mutating the snapshot throws (modules are strict).
 */
export function snapshotRegistration(registration: AnalyzerRegistration): AnalyzerRegistration {
  const capabilities = Object.freeze(registration.capabilities.map(snapshotCapability));
  const authorityBindings = Object.freeze(registration.authorityBindings.map(snapshotBinding));
  const declaredDomains = Object.freeze(declaredDomainsOf(capabilities));
  const authority: AuthorityAccess = Object.freeze({
    forDomain: (domain: Parameters<AuthorityAccess["forDomain"]>[0]) =>
      resolveAuthorityForDomain(declaredDomains, authorityBindings, domain),
  });
  return Object.freeze({
    analyzerId: registration.analyzerId,
    specId: registration.specId,
    displayName: registration.displayName,
    exposure: registration.exposure,
    publicLimits: snapshotLimits(registration.publicLimits),
    capabilities,
    authorityBindings,
    requirement: Object.freeze(requirementFromCapabilities(registration.analyzerId, capabilities)),
    authority,
    analyze: registration.analyze,
    observedDecisionView: registration.observedDecisionView,
    ...(registration.supportObservationView === undefined
      ? {}
      : { supportObservationView: registration.supportObservationView }),
    ...(registration.healerView === undefined ? {} : { healerView: registration.healerView }),
  });
}

/**
 * Builds a frozen registration from a definition.
 *
 * The `analyze` wrapper enforces ownership in both directions before and
 * after the facade runs: the input must name this specialization, and the
 * result must name it too. A registration built any other way is still
 * checked by the services through `assertAnalysisOwnership`.
 *
 * The one cast in the adapter is the registration boundary: an analyzed
 * envelope handed to this registration's view has, by the ownership check and
 * the registry's unique-spec rule, this registration's payload.
 */
export function defineAnalyzerRegistration<TAnalysis extends SpecAnalysisEnvelope>(
  definition: AnalyzerDefinition<TAnalysis>,
): AnalyzerRegistration {
  const capabilities = Object.freeze(definition.capabilities.map(snapshotCapability));
  const bindings = Object.freeze(definition.authorityBindings.map(snapshotBinding));
  const declaredDomains = Object.freeze(declaredDomainsOf(capabilities));
  const authority: AuthorityAccess = Object.freeze({
    forDomain: (domain: Parameters<AuthorityAccess["forDomain"]>[0]) =>
      resolveAuthorityForDomain(declaredDomains, bindings, domain),
  });
  const supportView = definition.supportObservationView;
  const healerView = definition.healerView;

  const registration: AnalyzerRegistration = Object.freeze({
    analyzerId: definition.analyzerId,
    specId: definition.specId,
    displayName: definition.displayName,
    exposure: definition.exposure,
    publicLimits: snapshotLimits(definition.publicLimits),
    capabilities,
    authorityBindings: bindings,
    requirement: Object.freeze(requirementFromCapabilities(definition.analyzerId, capabilities)),
    authority,
    analyze: (input: SpecAnalysisInput): SpecAnalysisEnvelope => {
      if (input.specId !== definition.specId) {
        throw new AnalyzerResultOwnershipError(
          definition.analyzerId,
          "INPUT_NAMES_ANOTHER_SPEC",
          `asked about '${input.specId}' but the registration owns '${definition.specId}'`,
        );
      }
      const analysis = definition.analyze(input, authority);
      assertAnalysisOwnership(registration, analysis);
      return analysis;
    },
    observedDecisionView: (analysis: AnalyzedEnvelope): ObservedDecisionView => {
      assertAnalysisOwnership(registration, analysis);
      return definition.observedDecisionView(analysis as Extract<TAnalysis, { status: "ANALYZED" }>);
    },
    ...(supportView === undefined
      ? {}
      : {
          // The same boundary as the decision view: ownership first, then the
          // registration's own adapter over its own unanalyzed payload.
          supportObservationView: (analysis: UnanalyzedEnvelope): SupportObservationOutcome => {
            assertAnalysisOwnership(registration, analysis);
            return supportView(analysis as Exclude<TAnalysis, { status: "ANALYZED" }>);
          },
        }),
    ...(healerView === undefined
      ? {}
      : {
          // HEAL-AP: the same boundary again, for a healer's unanalyzed payload.
          healerView: (analysis: UnanalyzedEnvelope): HealerViewOutcome => {
            assertAnalysisOwnership(registration, analysis);
            return healerView(analysis as Exclude<TAnalysis, { status: "ANALYZED" }>);
          },
        }),
  });
  return registration;
}
