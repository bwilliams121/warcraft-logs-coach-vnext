/**
 * The specialization module factory (M11-A2).
 *
 * WHAT A SPEC MODULE IS
 *
 * The one object a specialization tree exports to say what it is: a
 * canonical IDENTITY, an EXPOSURE, the decision CAPABILITIES it declares, the
 * pinned AUTHORITY it binds per domain, its FACADE and VIEW, and the public
 * LIMITS prose the tool descriptions publish for it. `defineSpecModule`
 * checks that these cohere and builds the analyzer REGISTRATION the
 * production catalog lists — through `defineAnalyzerRegistration`, so every
 * ownership rule that existed before this factory still applies unchanged.
 *
 * WHAT THE FACTORY OWNS, AND WHAT IT REFUSES TO
 *
 * It owns PLUMBING: identity coherence, roster membership, exposure typing,
 * and the registration row. It generates or infers NOTHING about gameplay:
 * no APL, no authority pin or hash, no vocabulary, no state binding, no
 * resource, aura, cooldown or transition semantics, no eligibility or
 * exclusion meaning, no decision, no public projection mapping. Each of
 * those is a per-specialization reading of pinned sources and stays in the
 * specialization's own modules; the factory only receives the functions and
 * bindings that embody them and passes them to the registration untouched.
 * This is a factory for the row, not a generic analyzer.
 *
 * IDENTITY, IN ONE PLACE
 *
 *   specId          the internal id, `<class>/<spec>`, partitioned PUBLIC or
 *                   INTERNAL_ONLY by `spec-id.ts`
 *   analyzerId      the registration's stable analyzer name
 *   displayName     what the public surfaces call it
 *   wclClassName    the class string Warcraft Logs reports (`subType`), as
 *   wclSpecName     ... and the spec string (`friendlySpecs`). These are
 *                   WARCRAFT LOGS facts supplied by the specialization from
 *                   committed capture evidence and pinned by the conformance
 *                   suite against that evidence. The factory never derives
 *                   them from a SimulationCraft name.
 *   simcSpecId      the SimulationCraft specialization id, and
 *   role            the DBC-pinned role (or UNKNOWN), both READ from the
 *                   committed roster artifact rather than typed here — so
 *                   the module cannot state a spec id or role the pinned
 *                   game data does not carry, and a `specId` that names no
 *                   real specialization at the pin cannot be defined at all.
 *
 * SUPPLEMENTAL ANALYSES — THE SEAM, NOT THE SEMANTICS (M11-A2)
 *
 * A specialization may own zero or more SUPPLEMENTAL analyses: deep-dive
 * questions beyond observed-decision authority verification — a temporal
 * window, a mechanic clip or overlap, resource waste, cooldown alignment, a
 * proc window, an uptime — each operating over the same normalized combat
 * state and producing FINDINGS the specialization defines. The factory
 * establishes the seam and nothing else: it checks each analysis has a
 * unique id under the specialization's own prefix, an author-written
 * question, and a declared evidence requirement in the shared vocabulary;
 * it freezes the list on the module; and it never reads, generates or
 * branches on what an analysis means. There is no `if rogue` here and
 * there will not be one. In M11-A2 no analysis is registered by either
 * specialization, no transport, service or projection invokes one, and no
 * public field carries a supplemental finding — the seam exists so a later
 * specialization milestone can register evidence-backed analyses without
 * touching the factory.
 *
 * NO TEST OR CORPUS CONCEPT LIVES HERE. A module carries no case id, no
 * artifact id, no grant, no layer and no readiness. Promotion is decided by
 * a test-time gate that reads the catalog and the corpus separately; the
 * only promotion-relevant production fact is `exposure`.
 */

import { rosterSpecialization, type RosterRole } from "../data/game/spec-roster.js";
import type { SpecAnalysisEnvelope, SpecAnalysisInput } from "./analysis-envelope.js";
import {
  defineAnalyzerRegistration,
  type AnalyzerExposure,
  type AnalyzerRegistration,
} from "./analyzer-registration.js";
import type { CombatState } from "../engine/state/combat-state.js";
import type { AuthorityAccess, AuthorityDomainBinding, DecisionDomain } from "./authority-domain.js";
import {
  validateCapabilities,
  type DecisionCapability,
  type StateRequirements,
} from "./decision-capability.js";
import type { ObservedDecisionView } from "./observed-decision-view.js";
import { isSpecId, type SpecId } from "./spec-id.js";

/** What a specialization writes down about who it is. */
export interface SpecIdentityDefinition {
  readonly specId: SpecId;
  readonly analyzerId: string;
  readonly displayName: string;
  /** The class string Warcraft Logs reports for this specialization, e.g. `Paladin`. */
  readonly wclClassName: string;
  /** The specialization string Warcraft Logs reports, e.g. `Protection`. */
  readonly wclSpecName: string;
}

/** The identity as the module carries it: what was written, plus what the roster pins. */
export interface SpecIdentity extends SpecIdentityDefinition {
  readonly simcSpecId: number;
  readonly role: RosterRole;
}

/**
 * The author-written public limitation prose for a specialization, by
 * surface. Empty means the specialization publishes no limitation
 * paragraph beyond the generic description on that surface. Composed into
 * the MCP tool descriptions in public-registration order; never generated.
 */
export interface PublicLimitsProse {
  readonly analysis: string;
  readonly raidNight: string;
}

/** What a supplemental analysis is handed: facts only, never an authority and never a verdict. */
export interface SupplementalAnalysisInput {
  readonly state: CombatState;
  readonly actorId: number;
  readonly specId: SpecId;
}

/**
 * What a supplemental analysis returns. The three statuses are the shared
 * epistemic vocabulary and nothing more: `ANALYZED` carries findings whose
 * type the specialization defines; `UNKNOWN` says the evidence could not
 * establish the answer; `NO_AUTHORITY_AVAILABLE` says no trustworthy standard
 * exists for the question. The two refusals are distinct and neither may
 * stand in for the other (`CLAUDE.md`).
 */
export type SupplementalAnalysisResult<TFinding> =
  | { readonly status: "ANALYZED"; readonly findings: readonly TFinding[] }
  | { readonly status: "UNKNOWN"; readonly reason: string; readonly detail: string }
  | { readonly status: "NO_AUTHORITY_AVAILABLE"; readonly detail: string };

/**
 * One spec-owned supplemental analysis.
 *
 * The factory validates the SHAPE — id, question, requirements — and freezes
 * the definition. The function is the specialization's, opaque to everything
 * outside its tree, and in M11-A2 is invoked by nothing in production.
 */
export interface SupplementalAnalysisDefinition<TFinding = unknown> {
  /** Stable id, unique within the module, of the form `<specId>.<name>`. */
  readonly supplementalId: string;
  /** The one question this analysis answers. Author-written; never generated. */
  readonly question: string;
  /** The evidence the analysis consumes, in the same vocabulary a capability declares. */
  readonly requirements: StateRequirements;
  readonly analyze: (input: SupplementalAnalysisInput) => SupplementalAnalysisResult<TFinding>;
}

export interface SpecModuleDefinition<TAnalysis extends SpecAnalysisEnvelope> {
  readonly identity: SpecIdentityDefinition;
  readonly exposure: AnalyzerExposure;
  readonly capabilities: readonly DecisionCapability<DecisionDomain>[];
  readonly authorityBindings: readonly AuthorityDomainBinding[];
  readonly analyze: (input: SpecAnalysisInput, authority: AuthorityAccess) => TAnalysis;
  readonly observedDecisionView: (
    analysis: Extract<TAnalysis, { status: "ANALYZED" }>,
  ) => ObservedDecisionView;
  readonly limitsProse: PublicLimitsProse;
  /**
   * Spec-owned supplemental analyses. Optional; omitted means none. See the
   * module header: the factory keeps the seam and refuses the semantics.
   */
  readonly supplementalAnalyses?: readonly SupplementalAnalysisDefinition[] | undefined;
}

export interface SpecModule {
  readonly identity: SpecIdentity;
  readonly exposure: AnalyzerExposure;
  readonly limitsProse: PublicLimitsProse;
  /** The row the production catalog lists. Built by `defineAnalyzerRegistration`; owned by this module. */
  readonly registration: AnalyzerRegistration;
  /** The spec-owned supplemental analyses, frozen, in declaration order. Empty for both M11-A2 modules. */
  readonly supplementalAnalyses: readonly SupplementalAnalysisDefinition[];
}

export type SpecModuleDefect =
  | "SPEC_ID_UNKNOWN"
  | "SPEC_ID_NOT_IN_ROSTER"
  | "IDENTITY_FIELD_BLANK"
  | "DISPLAY_NAME_DISAGREES_WITH_ROSTER"
  | "SUPPLEMENTAL_ID_INVALID"
  | "SUPPLEMENTAL_ID_DUPLICATE"
  | "SUPPLEMENTAL_QUESTION_BLANK"
  | "SUPPLEMENTAL_REQUIREMENTS_INVALID";

/**
 * Raised at definition time — a module is a build constant, and a module
 * that does not cohere must fail to load rather than register less than it
 * claims. Author-written; names ids and vocabulary constants only.
 */
export class SpecModuleDefinitionError extends Error {
  readonly defect: SpecModuleDefect;

  constructor(defect: SpecModuleDefect, detail: string) {
    super(`Specialization module rejected (${defect}): ${detail}`);
    this.name = "SpecModuleDefinitionError";
    this.defect = defect;
  }
}

function requireNonBlank(field: keyof SpecIdentityDefinition, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw new SpecModuleDefinitionError(
      "IDENTITY_FIELD_BLANK",
      `identity.${field} must be a non-blank, trimmed string`,
    );
  }
}

/**
 * Builds a specialization module and its registration.
 *
 * Coherence checked here, at load: the `specId` is one this build knows and
 * one the pinned roster carries; every identity string is non-blank; and
 * the display name is the roster's display name for that specialization,
 * so the public surfaces and the pinned game data cannot disagree about
 * what the specialization is called. Everything else is handed to
 * `defineAnalyzerRegistration` unchanged.
 */
export function defineSpecModule<TAnalysis extends SpecAnalysisEnvelope>(
  definition: SpecModuleDefinition<TAnalysis>,
): SpecModule {
  const { identity } = definition;
  if (!isSpecId(identity.specId)) {
    throw new SpecModuleDefinitionError(
      "SPEC_ID_UNKNOWN",
      `'${String(identity.specId)}' is not a SpecId this build knows`,
    );
  }
  for (const field of ["analyzerId", "displayName", "wclClassName", "wclSpecName"] as const) {
    requireNonBlank(field, identity[field]);
  }
  const roster = rosterSpecialization(identity.specId);
  if (roster === null) {
    throw new SpecModuleDefinitionError(
      "SPEC_ID_NOT_IN_ROSTER",
      `'${identity.specId}' is not a playable specialization in the pinned roster`,
    );
  }
  if (roster.displayName !== identity.displayName) {
    throw new SpecModuleDefinitionError(
      "DISPLAY_NAME_DISAGREES_WITH_ROSTER",
      `'${identity.specId}' is '${roster.displayName}' in the pinned roster, not '${identity.displayName}'`,
    );
  }

  const supplementalAnalyses = freezeSupplementalAnalyses(
    identity.specId,
    definition.supplementalAnalyses ?? [],
  );

  const registration = defineAnalyzerRegistration<TAnalysis>({
    analyzerId: identity.analyzerId,
    specId: identity.specId,
    displayName: identity.displayName,
    exposure: definition.exposure,
    capabilities: definition.capabilities,
    authorityBindings: definition.authorityBindings,
    publicLimits: Object.freeze({
      analysis: definition.limitsProse.analysis,
      raidNight: definition.limitsProse.raidNight,
    }),
    analyze: definition.analyze,
    observedDecisionView: definition.observedDecisionView,
  });

  return Object.freeze({
    identity: Object.freeze({
      specId: identity.specId,
      analyzerId: identity.analyzerId,
      displayName: identity.displayName,
      wclClassName: identity.wclClassName,
      wclSpecName: identity.wclSpecName,
      simcSpecId: roster.simcSpecId,
      role: roster.role,
    }),
    exposure: definition.exposure,
    limitsProse: Object.freeze({
      analysis: definition.limitsProse.analysis,
      raidNight: definition.limitsProse.raidNight,
    }),
    registration,
    supplementalAnalyses,
  });
}

/**
 * Validates the SHAPE of a module's supplemental analyses and freezes them.
 *
 * Ids are `<specId>.<name>` so an analysis cannot be mistaken for another
 * specialization's; questions are non-blank; requirements are validated with
 * the capability validator over a throwaway capability wrapper, so the
 * evidence vocabulary is the one orchestration already understands. The
 * `analyze` function is never called here.
 */
function freezeSupplementalAnalyses(
  specId: SpecId,
  definitions: readonly SupplementalAnalysisDefinition[],
): readonly SupplementalAnalysisDefinition[] {
  const seen = new Set<string>();
  const frozen = definitions.map((definition) => {
    const id = definition.supplementalId;
    const prefix = `${specId}.`;
    if (typeof id !== "string" || !id.startsWith(prefix) || !/^[a-z0-9_-]+$/.test(id.slice(prefix.length))) {
      throw new SpecModuleDefinitionError(
        "SUPPLEMENTAL_ID_INVALID",
        `'${String(id)}' is not of the form '${prefix}<name>' with a lower-case name`,
      );
    }
    if (seen.has(id))
      throw new SpecModuleDefinitionError("SUPPLEMENTAL_ID_DUPLICATE", `'${id}' is declared twice`);
    seen.add(id);
    if (typeof definition.question !== "string" || definition.question.trim().length === 0) {
      throw new SpecModuleDefinitionError("SUPPLEMENTAL_QUESTION_BLANK", `'${id}' states no question`);
    }
    const defects = validateCapabilities([
      { capabilityId: id, domain: "OFFENSIVE_ROTATION", requirements: definition.requirements },
    ]);
    if (defects.length > 0) {
      throw new SpecModuleDefinitionError(
        "SUPPLEMENTAL_REQUIREMENTS_INVALID",
        `'${id}': ${defects.map((defect) => `${defect.defect} (${defect.detail})`).join("; ")}`,
      );
    }
    return Object.freeze({
      supplementalId: id,
      question: definition.question,
      requirements: Object.freeze({
        scope: definition.requirements.scope,
        resources: Object.freeze([...definition.requirements.resources]),
        evidenceCategories: Object.freeze([...definition.requirements.evidenceCategories]),
        targetModel: definition.requirements.targetModel,
      }),
      analyze: definition.analyze,
    });
  });
  return Object.freeze(frozen);
}

/** Whether a value is a module this factory built. Structural; used by test discovery. */
export function isSpecModule(value: unknown): value is SpecModule {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const identity = record["identity"];
  return (
    typeof identity === "object" &&
    identity !== null &&
    typeof (identity as Record<string, unknown>)["specId"] === "string" &&
    typeof record["exposure"] === "string" &&
    typeof record["registration"] === "object" &&
    record["registration"] !== null &&
    Array.isArray(record["supplementalAnalyses"])
  );
}
