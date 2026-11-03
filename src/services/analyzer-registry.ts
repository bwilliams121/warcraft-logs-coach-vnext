/**
 * The analyzer catalog, its integrity rules, and the public dispatch set.
 *
 * WHAT A REGISTRATION IS
 *
 * One row, written by the specialization (`src/specs/<class>/<spec>/
 * registration.ts`), joining the facts that must never drift apart: which
 * specialization it analyzes, whether it is exposed publicly, which decision
 * families it evaluates and the evidence they need, which pinned authority it
 * binds for each, how to run it, and how shared code may view its result.
 * This module LISTS those rows and validates that they cohere. It contains no
 * gameplay rule, no APL concept, no ability, no resource and no talent.
 *
 * VALIDATED MEANS IMMUTABLE
 *
 * `validateAnalyzerCatalog` does not judge the array it is handed. It takes a
 * deeply frozen SNAPSHOT of every row (`snapshotRegistration`), judges the
 * snapshot, and — only when it coheres — returns it as a branded
 * `ValidatedAnalyzerCatalog`. Every lookup in this module accepts nothing
 * else. So there is no sequence of "validate, mutate, look up": the thing that
 * was validated cannot be mutated (it is frozen), and the thing that can be
 * mutated (the caller's array) was never what the lookup reads. There is no
 * cache to go stale, because nothing is cached: a registry is a handful of
 * rows and the check is cheap.
 *
 * TWO COLLECTIONS, ONE SOURCE
 *
 *     ANALYZER_REGISTRATIONS   every registration this build carries (raw rows)
 *     PRODUCTION_CATALOG       those rows, validated and frozen at module load
 *     ENABLED_ANALYZERS        the PUBLIC subset of the production catalog
 *
 * A corrupt production catalog fails at module load — the loudest possible
 * fail-closed for a build constant — and an injected catalog fails per request
 * as an INTERNAL_ERROR. Neither is ever `SPEC_NOT_SUPPORTED`: that status is a
 * truthful statement about coverage, and a corrupt registry is a defect.
 *
 * The application service, raid-night orchestration, REST and MCP dispatch
 * only through the public set (`analyzerForSpec`). Internal lookup
 * (`internalAnalyzerForSpec`) exists for tests and internal evaluation, and it
 * is what lets a specialization be registered, exercised and proven without
 * becoming reachable by a public request — as Protection Paladin was from
 * M10-C until M10-D made it public, Retribution Paladin from M11-A4 until
 * M11-A5, Blood Death Knight from M11-B2 until M11-B12, and Brewmaster Monk
 * from M11-C2 until M11-C4j. From M11-C4j every registration was PUBLIC and
 * the internal-only machinery dormant, until Augmentation Evoker arrived
 * through it in M13-E (public since M13-F). Restoration Shaman arrived through
 * it in HEAL-A.
 *
 * INJECTED CATALOGS MUST BE COMPLETE. The public-set equality below applies to
 * an injected catalog exactly as to the production one: a test that wants to
 * observe or replace one registration must still hand the service every
 * public row (`tests/support/catalog.ts`), or a request for the missing
 * specialization would read `SPEC_NOT_SUPPORTED` off an incomplete table.
 */

import {
  AnalyzerResultOwnershipError,
  assertAnalysisOwnership,
  checkAnalysisOwnership,
  snapshotRegistration,
  type AnalyzerRegistration,
} from "../findings/analyzer-registration.js";
import type {
  AnalyzedEnvelope,
  SpecAnalysisEnvelope,
  SpecAnalysisInput,
  UnanalyzedEnvelope,
} from "../findings/analysis-envelope.js";
import type { HealerViewOutcome } from "../findings/healer-view.js";
import type { SupportObservationOutcome } from "../findings/support-observation-view.js";
import { providerMayGovern } from "../findings/authority-domain.js";
import { validateCapabilities, type CapabilityDefectRecord } from "../findings/decision-capability.js";
import type { ObservedDecisionView } from "../findings/observed-decision-view.js";
import { isPublicSpecId, isSpecId, PUBLIC_SPEC_IDS, type SpecId } from "../findings/spec-id.js";
import { BLOOD_DEATH_KNIGHT_REGISTRATION } from "../specs/deathknight/blood/registration.js";
import { AUGMENTATION_EVOKER_REGISTRATION } from "../specs/evoker/augmentation/registration.js";
import { PRESERVATION_EVOKER_REGISTRATION } from "../specs/evoker/preservation/registration.js";
import { RESTORATION_DRUID_REGISTRATION } from "../specs/druid/restoration/registration.js";
import { BREWMASTER_MONK_REGISTRATION } from "../specs/monk/brewmaster/registration.js";
import { MISTWEAVER_MONK_REGISTRATION } from "../specs/monk/mistweaver/registration.js";
import { HOLY_PALADIN_REGISTRATION } from "../specs/paladin/holy/registration.js";
import { PROTECTION_PALADIN_REGISTRATION } from "../specs/paladin/protection/registration.js";
import { RETRIBUTION_PALADIN_REGISTRATION } from "../specs/paladin/retribution/registration.js";
import { DISCIPLINE_PRIEST_REGISTRATION } from "../specs/priest/discipline/registration.js";
import { HAVOC_DEMON_HUNTER_REGISTRATION } from "../specs/demonhunter/havoc/registration.js";
import { HOLY_PRIEST_REGISTRATION } from "../specs/priest/holy/registration.js";
import { ASSASSINATION_REGISTRATION } from "../specs/rogue/assassination/registration.js";
import { RESTORATION_SHAMAN_REGISTRATION } from "../specs/shaman/restoration/registration.js";
import type { AnalyzerRequirement } from "./ingestion-scope.js";
import { SUPPORTED_SPEC_IDENTITIES } from "./spec-identity.js";

export type { AnalyzerExposure, AnalyzerRegistration } from "../findings/analyzer-registration.js";
export {
  AnalyzerResultOwnershipError,
  assertAnalysisOwnership,
  checkAnalysisOwnership,
} from "../findings/analyzer-registration.js";
export type { ObservedDecisionView } from "../findings/observed-decision-view.js";

/**
 * The result any registered analyzer produces, as orchestration sees it: the
 * spec-neutral envelope. The specialization's payload rides inside the
 * analyzed variant and is read only through the registration's view.
 */
export type SpecAnalysis = SpecAnalysisEnvelope;

export type { SpecAnalysisInput };

/** The pre-M10-A name for a registration row. Same type. */
export type RegisteredAnalyzer = AnalyzerRegistration;

// ---------------------------------------------------------------------------
// The validated catalog
// ---------------------------------------------------------------------------

const VALIDATED = Symbol("validated-analyzer-catalog");

/**
 * A catalog that passed integrity validation, as a frozen snapshot.
 *
 * The brand is a runtime symbol as well as a type, so a value that merely
 * LOOKS like a catalog cannot be handed to a lookup by a cast:
 * `isValidatedCatalog` checks for it and every lookup refuses anything else.
 */
export interface ValidatedAnalyzerCatalog {
  readonly [VALIDATED]: true;
  readonly registrations: readonly AnalyzerRegistration[];
}

export function isValidatedCatalog(value: unknown): value is ValidatedAnalyzerCatalog {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { readonly [VALIDATED]?: unknown })[VALIDATED] === true &&
    Object.isFrozen(value)
  );
}

function requireValidated(catalog: ValidatedAnalyzerCatalog): readonly AnalyzerRegistration[] {
  if (!isValidatedCatalog(catalog)) {
    throw new AnalyzerCatalogIntegrityError([
      {
        defect: "UNVALIDATED_CATALOG",
        analyzerId: null,
        detail: "a lookup was handed a value that is not a validated analyzer catalog",
      },
    ]);
  }
  return catalog.registrations;
}

// ---------------------------------------------------------------------------
// Integrity
// ---------------------------------------------------------------------------

export type CatalogDefect =
  | "DUPLICATE_SPEC_ID"
  | "DUPLICATE_ANALYZER_ID"
  | "UNKNOWN_SPEC_ID"
  | "PUBLIC_EXPOSURE_OF_INTERNAL_SPEC"
  | "INVALID_CAPABILITY"
  | "DUPLICATE_AUTHORITY_BINDING"
  | "ORPHAN_AUTHORITY_BINDING"
  | "PROVIDER_DOMAIN_INCOMPATIBLE"
  | "AUTHORITY_ARTIFACT_MISMATCH"
  | "PUBLIC_SET_DISAGREES_WITH_IDENTITY_TABLE"
  | "PUBLIC_SET_DISAGREES_WITH_PARTITION"
  /** A lookup was handed something other than a validated catalog. */
  | "UNVALIDATED_CATALOG"
  /** A registration's human-readable name is blank (M11-A1). */
  | "INVALID_DISPLAY_NAME"
  /**
   * Two registrations bind the SAME decision authority to the SAME domain
   * (M11-A2). A decision authority — an APL artifact identified by its
   * `authorityId` — is owned by exactly one analyzer for the domain it
   * governs; it is what `RESULT_CITES_FOREIGN_AUTHORITY` keys on, so sharing
   * it would let two analyzers' results pass each other's ownership check.
   * This is NOT a ban on shared provenance: two specializations may cite the
   * same SimulationCraft commit, the same upstream source file (two regions
   * of one `apl_paladin.cpp`), the same client build, or the same
   * class-level mechanics dataset. Only the decision-authority IDENTITY per
   * domain is unique.
   */
  | "DUPLICATE_DECISION_AUTHORITY_BINDING";

export const CATALOG_DEFECTS = Object.freeze([
  "DUPLICATE_SPEC_ID",
  "DUPLICATE_ANALYZER_ID",
  "UNKNOWN_SPEC_ID",
  "PUBLIC_EXPOSURE_OF_INTERNAL_SPEC",
  "INVALID_CAPABILITY",
  "DUPLICATE_AUTHORITY_BINDING",
  "ORPHAN_AUTHORITY_BINDING",
  "PROVIDER_DOMAIN_INCOMPATIBLE",
  "AUTHORITY_ARTIFACT_MISMATCH",
  "PUBLIC_SET_DISAGREES_WITH_IDENTITY_TABLE",
  "PUBLIC_SET_DISAGREES_WITH_PARTITION",
  "UNVALIDATED_CATALOG",
  "INVALID_DISPLAY_NAME",
  "DUPLICATE_DECISION_AUTHORITY_BINDING",
] as const satisfies readonly CatalogDefect[]);

export interface CatalogDefectRecord {
  readonly defect: CatalogDefect;
  /** The registration at fault, or `null` for a catalog-level defect. */
  readonly analyzerId: string | null;
  /** Author-written. Names ids and vocabulary constants, never upstream data. */
  readonly detail: string;
  readonly capability?: CapabilityDefectRecord;
}

export type CatalogValidation =
  | { readonly ok: true; readonly catalog: ValidatedAnalyzerCatalog }
  | { readonly ok: false; readonly defects: readonly CatalogDefectRecord[] };

/**
 * Author-written message for a catalog that failed integrity validation.
 *
 * Names the defect codes — internal vocabulary constants — and nothing from
 * upstream. Deliberately reported as INTERNAL_ERROR by every service: a corrupt
 * registry is a defect in the deployment, and reporting it as
 * SPEC_NOT_SUPPORTED would dress a malfunction as a truthful coverage limit.
 */
export function describeCatalogDefects(defects: readonly CatalogDefectRecord[]): string {
  const codes = [...new Set(defects.map((defect) => defect.defect))].join(", ");
  return `The analyzer registry failed integrity validation (${codes}), so no analysis was attempted.`;
}

/** Raised when a catalog is required valid and is not. Deterministic; names defect codes only. */
export class AnalyzerCatalogIntegrityError extends Error {
  readonly defects: readonly CatalogDefectRecord[];

  constructor(defects: readonly CatalogDefectRecord[]) {
    super(describeCatalogDefects(defects));
    this.name = "AnalyzerCatalogIntegrityError";
    this.defects = defects;
  }
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function validateRegistration(registration: AnalyzerRegistration, defects: CatalogDefectRecord[]): void {
  const { analyzerId } = registration;

  if (!isSpecId(registration.specId)) {
    defects.push({
      defect: "UNKNOWN_SPEC_ID",
      analyzerId,
      detail: `'${String(registration.specId)}' is not a specialization this build knows`,
    });
  } else if (registration.exposure === "PUBLIC" && !isPublicSpecId(registration.specId)) {
    defects.push({
      defect: "PUBLIC_EXPOSURE_OF_INTERNAL_SPEC",
      analyzerId,
      detail: `'${registration.specId}' is internal-only and cannot carry a PUBLIC registration`,
    });
  }

  if (typeof registration.displayName !== "string" || registration.displayName.trim().length === 0) {
    defects.push({
      defect: "INVALID_DISPLAY_NAME",
      analyzerId,
      detail: `'${analyzerId}' has no human-readable specialization name`,
    });
  }

  for (const capability of validateCapabilities(registration.capabilities)) {
    defects.push({
      defect: "INVALID_CAPABILITY",
      analyzerId,
      detail: `${capability.defect}: ${capability.detail}`,
      capability,
    });
  }

  const declaredDomains = new Set(registration.capabilities.map((capability) => capability.domain));
  const boundDomains = new Set<string>();
  for (const binding of registration.authorityBindings) {
    if (boundDomains.has(binding.domain)) {
      defects.push({
        defect: "DUPLICATE_AUTHORITY_BINDING",
        analyzerId,
        detail: `two bindings claim the ${binding.domain} domain`,
      });
    }
    boundDomains.add(binding.domain);

    if (!declaredDomains.has(binding.domain)) {
      defects.push({
        defect: "ORPHAN_AUTHORITY_BINDING",
        analyzerId,
        detail: `a binding names the ${binding.domain} domain, which no declared capability evaluates`,
      });
    }
    if (!providerMayGovern(binding.kind, binding.domain)) {
      defects.push({
        defect: "PROVIDER_DOMAIN_INCOMPATIBLE",
        analyzerId,
        detail: `${binding.kind} is not declared compatible with the ${binding.domain} domain`,
      });
    }

    // The artifact is the truth; the binding repeats its identity so the two
    // can be compared. A failed load is NOT an integrity defect: it is an
    // authority condition the analyzer reports at evaluation time as
    // AUTHORITY_NOT_AVAILABLE, exactly as it did before M10-A.
    const loaded = binding.load();
    if (!loaded.ok) continue;
    const { artifact } = loaded.authority;
    const artifactSpecId = `${artifact.spec.className}/${artifact.spec.specName}`;
    const mismatches: string[] = [];
    if (artifact.authorityId !== binding.authorityId) mismatches.push("authorityId");
    if (artifact.artifactRevision !== binding.artifactRevision) mismatches.push("artifactRevision");
    if (artifact.provenance.commitSha !== binding.commitSha) mismatches.push("commitSha");
    if (artifactSpecId !== registration.specId) mismatches.push("specialization");
    if (mismatches.length > 0) {
      defects.push({
        defect: "AUTHORITY_ARTIFACT_MISMATCH",
        analyzerId,
        detail: `the loaded artifact disagrees with the ${binding.domain} binding on: ${mismatches.join(", ")}`,
      });
    }
  }
}

/**
 * Validates a catalog. Total and deterministic; nothing is cached.
 *
 * Snapshots first, judges the snapshot, and returns the snapshot. The caller's
 * array and objects are read once and never retained, so mutating them
 * afterwards cannot reach the validated value.
 */
export function validateAnalyzerCatalog(registrations: readonly AnalyzerRegistration[]): CatalogValidation {
  const snapshot = Object.freeze(registrations.map(snapshotRegistration));

  const defects: CatalogDefectRecord[] = [];
  const specIds = new Set<string>();
  const analyzerIds = new Set<string>();

  // ---- decision-authority ownership across registrations (M11-A2) ----
  //
  // Keyed by (authorityId, domain). Two rows binding one artifact for one
  // domain is a defect whichever spec ids they carry; the same artifact
  // bound for two DIFFERENT domains by one row is already refused by
  // `PROVIDER_DOMAIN_COMPATIBILITY` for a SimulationCraft APL, and would be a
  // deliberate design for a provider kind that may govern several domains.
  const decisionAuthorityOwners: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const registration of snapshot) {
    for (const binding of registration.authorityBindings) {
      const key = `${binding.authorityId} @ ${binding.domain}`;
      const owner: string | undefined = decisionAuthorityOwners[key];
      if (owner !== undefined && owner !== registration.analyzerId) {
        defects.push({
          defect: "DUPLICATE_DECISION_AUTHORITY_BINDING",
          analyzerId: registration.analyzerId,
          detail: `'${binding.authorityId}' for ${binding.domain} is already bound by '${owner}'`,
        });
      }
      decisionAuthorityOwners[key] = registration.analyzerId;
    }
  }

  for (const registration of snapshot) {
    if (specIds.has(registration.specId)) {
      defects.push({
        defect: "DUPLICATE_SPEC_ID",
        analyzerId: registration.analyzerId,
        detail: `'${registration.specId}' is registered more than once`,
      });
    }
    specIds.add(registration.specId);
    if (analyzerIds.has(registration.analyzerId)) {
      defects.push({
        defect: "DUPLICATE_ANALYZER_ID",
        analyzerId: registration.analyzerId,
        detail: `'${registration.analyzerId}' is registered more than once`,
      });
    }
    analyzerIds.add(registration.analyzerId);
    validateRegistration(registration, defects);
  }

  // ---- the three public promises must be one promise ----
  //
  // The spec partition says which ids MAY be public, the identity table says
  // which Warcraft Logs identities RESOLVE, and the catalog says which
  // analyzers a public request SELECTS. If any two disagree, a request can
  // resolve to a specialization nothing will analyze, or an analyzer can be
  // selected for an identity the partition forbids publishing.
  const publicSpecIds = snapshot
    .filter((registration) => registration.exposure === "PUBLIC")
    .map((registration) => registration.specId);
  if (!sameSet(publicSpecIds, PUBLIC_SPEC_IDS)) {
    defects.push({
      defect: "PUBLIC_SET_DISAGREES_WITH_PARTITION",
      analyzerId: null,
      detail: `public registrations [${publicSpecIds.join(", ")}] do not match the public spec partition [${PUBLIC_SPEC_IDS.join(", ")}]`,
    });
  }
  const identityResolvable = Object.values(SUPPORTED_SPEC_IDENTITIES);
  if (!sameSet(publicSpecIds, identityResolvable)) {
    defects.push({
      defect: "PUBLIC_SET_DISAGREES_WITH_IDENTITY_TABLE",
      analyzerId: null,
      detail: `public registrations [${publicSpecIds.join(", ")}] do not match the identity table [${identityResolvable.join(", ")}]`,
    });
  }

  if (defects.length > 0) return { ok: false, defects };
  const catalog: ValidatedAnalyzerCatalog = Object.freeze({
    [VALIDATED]: true as const,
    registrations: snapshot,
  });
  return { ok: true, catalog };
}

/** Validates, or throws `AnalyzerCatalogIntegrityError`. For build constants and tests. */
export function requireValidatedCatalog(
  registrations: readonly AnalyzerRegistration[],
): ValidatedAnalyzerCatalog {
  const validation = validateAnalyzerCatalog(registrations);
  if (!validation.ok) throw new AnalyzerCatalogIntegrityError(validation.defects);
  return validation.catalog;
}

// ---------------------------------------------------------------------------
// The production catalog
// ---------------------------------------------------------------------------

/**
 * Every registration this build carries, as written by the specializations.
 *
 * Fourteen rows: eleven PUBLIC (Augmentation Evoker was INTERNAL_ONLY in M13-E,
 * Restoration Shaman in HEAL-A, Holy Paladin and Mistweaver Monk in HEAL-B1,
 * Holy Priest in HEAL-B2, Preservation Evoker in HEAL-B4) and three INTERNAL_ONLY:
 * since HEAL-B1, Restoration Druid, which HEAL-B1P did not promote, since HEAL-B3,
 * Discipline Priest, which HEAL-B3P could not promote, and since ONB-A1, Havoc Demon
 * Hunter, whose public promotion is ONB-A1P.
 * A publicly unsupported
 * specialization is represented by ABSENCE from the PUBLIC set — an
 * INTERNAL_ONLY row, when one exists, is in the catalog and reachable by
 * internal lookup and tests, and is never selected for a public request —
 * which is why there is no "unsupported" placeholder entry: a row that cannot
 * analyze anything would still be something a lookup could select.
 */
export const ANALYZER_REGISTRATIONS: readonly AnalyzerRegistration[] = Object.freeze([
  ASSASSINATION_REGISTRATION,
  // INTERNAL_ONLY from M10-C; PUBLIC since M10-D.
  PROTECTION_PALADIN_REGISTRATION,
  // INTERNAL_ONLY from M11-A4; PUBLIC since M11-A5.
  RETRIBUTION_PALADIN_REGISTRATION,
  // INTERNAL_ONLY from M11-B2; PUBLIC since M11-B12.
  BLOOD_DEATH_KNIGHT_REGISTRATION,
  // INTERNAL_ONLY from M11-C2; PUBLIC since M11-C4j.
  BREWMASTER_MONK_REGISTRATION,
  // INTERNAL_ONLY from M13-E; PUBLIC since M13-F. Binds no authority: never ANALYZED, publishes support observations.
  AUGMENTATION_EVOKER_REGISTRATION,
  // INTERNAL_ONLY from HEAL-A; PUBLIC since HEAL-AP. The first healer row: binds no pinned authority, publishes healer findings.
  RESTORATION_SHAMAN_REGISTRATION,
  // Healer rows on Restoration Shaman's architecture, from HEAL-B1. Holy Paladin and Mistweaver Monk PUBLIC since
  // HEAL-B1P; Restoration Druid INTERNAL_ONLY (not yet gated; agent/follow-ups.md "After HEAL-B4P").
  HOLY_PALADIN_REGISTRATION,
  RESTORATION_DRUID_REGISTRATION,
  MISTWEAVER_MONK_REGISTRATION,
  // INTERNAL_ONLY from HEAL-B2; PUBLIC since HEAL-B2P. A fourth healer row on the same architecture.
  HOLY_PRIEST_REGISTRATION,
  // INTERNAL_ONLY since HEAL-B3: a healer row on the same architecture that also reports observed Atonement. No
  // public shape yet (HEAL-B3P).
  DISCIPLINE_PRIEST_REGISTRATION,
  // INTERNAL_ONLY from HEAL-B4; PUBLIC since HEAL-B4P. A healer row on the same architecture whose identified
  // cooldowns are checked against empowered casts.
  PRESERVATION_EVOKER_REGISTRATION,
  // INTERNAL_ONLY since ONB-A1: Cohort A's representative, an observed-decision row bound to the pinned Havoc
  // list. No public shape yet (ONB-A1P).
  HAVOC_DEMON_HUNTER_REGISTRATION,
]);

/**
 * The production catalog, validated at module load.
 *
 * A build whose registrations do not cohere does not start. That is the
 * intended failure: a deployment constant that is wrong has no request to
 * report itself on.
 */
export const PRODUCTION_CATALOG: ValidatedAnalyzerCatalog = requireValidatedCatalog(ANALYZER_REGISTRATIONS);

/** The registrations a public request may select. Derived, never listed. */
export function publicAnalyzers(catalog: ValidatedAnalyzerCatalog): readonly AnalyzerRegistration[] {
  return requireValidated(catalog).filter((registration) => registration.exposure === "PUBLIC");
}

/**
 * The public dispatch set of this build.
 *
 * The name predates the catalog: "enabled" has always meant "a public request
 * may select it", and that is still exactly what it means.
 */
export const ENABLED_ANALYZERS: readonly AnalyzerRegistration[] = publicAnalyzers(PRODUCTION_CATALOG);

/**
 * The ingestion requirements of the public analyzers.
 *
 * DERIVED from the registrations, which derive theirs from declared
 * capabilities, so a registration cannot declare one scope while scope
 * derivation reads another.
 */
export const ENABLED_ANALYSIS_REQUIREMENTS: readonly AnalyzerRequirement[] = ENABLED_ANALYZERS.map(
  (registration) => registration.requirement,
);

/**
 * The human-readable list of publicly supported specializations, DERIVED
 * from the PUBLIC registrations of a validated catalog (M11-A1).
 *
 * This is the one source of the "Supported specializations: …" wording the
 * MCP tool descriptions publish. Before M11-A1 each tool module hand-listed
 * the names, which is a partial-publication hazard: a specialization could be
 * made public in the catalog and forgotten in one description, or named in a
 * description before its registration existed. Deriving the sentence from
 * the same set the dispatcher uses makes the two agree by construction.
 *
 * Ordering is code-point order of the display names, so the wording is a
 * pure function of the catalog and identical on every build. INTERNAL_ONLY
 * registrations are excluded exactly as `analyzerForSpec` excludes them —
 * through `publicAnalyzers` — so a dormant or in-progress specialization can
 * never be advertised. The joining grammar ("A", "A and B", "A, B and C") is
 * the only prose here.
 */
export function supportedSpecializationsSentence(
  catalog: ValidatedAnalyzerCatalog = PRODUCTION_CATALOG,
): string {
  const names = publicAnalyzers(catalog)
    .map((registration) => registration.displayName)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const list =
    names.length <= 1
      ? (names[0] ?? "none")
      : `${names.slice(0, -1).join(", ")} and ${String(names[names.length - 1])}`;
  return `Supported specializations: ${list}.`;
}

/** The production wording, fixed at module load from the production catalog. */
export const SUPPORTED_SPECIALIZATIONS_SENTENCE: string =
  supportedSpecializationsSentence(PRODUCTION_CATALOG);

/**
 * Everything the public tool descriptions say ABOUT specializations, derived
 * from the PUBLIC registrations of a validated catalog (M11-A2).
 *
 * `sentence` is `supportedSpecializationsSentence`. `limits` is each PUBLIC
 * registration's author-written limitation prose, in the SAME order the
 * sentence names them (code-point order of display names), one entry per
 * registration whether or not its prose is empty — a consumer skips empty
 * entries and never reorders. INTERNAL_ONLY registrations contribute nothing
 * to either, through the same `publicAnalyzers` filter dispatch uses.
 */
export interface PublicSpecializationDescriptions {
  readonly sentence: string;
  readonly limits: readonly { readonly analysis: string; readonly raidNight: string }[];
}

export function publicSpecializationDescriptions(
  catalog: ValidatedAnalyzerCatalog = PRODUCTION_CATALOG,
): PublicSpecializationDescriptions {
  const ordered = [...publicAnalyzers(catalog)].sort((left, right) =>
    left.displayName < right.displayName ? -1 : left.displayName > right.displayName ? 1 : 0,
  );
  return Object.freeze({
    sentence: supportedSpecializationsSentence(catalog),
    limits: Object.freeze(
      ordered.map((registration) =>
        Object.freeze({
          analysis: registration.publicLimits.analysis,
          raidNight: registration.publicLimits.raidNight,
        }),
      ),
    ),
  });
}

/** The production descriptions, fixed at module load from the production catalog. */
export const PUBLIC_SPECIALIZATION_DESCRIPTIONS: PublicSpecializationDescriptions =
  publicSpecializationDescriptions(PRODUCTION_CATALOG);

/**
 * The catalog a service dispatches through: the injected rows validated per
 * request, or the production catalog. Never an unvalidated array.
 */
export function catalogFor(registry: readonly AnalyzerRegistration[] | undefined): CatalogValidation {
  return registry === undefined
    ? { ok: true, catalog: PRODUCTION_CATALOG }
    : validateAnalyzerCatalog(registry);
}

// ---------------------------------------------------------------------------
// Lookup — validated catalogs only
// ---------------------------------------------------------------------------

/**
 * Finds the PUBLIC analyzer for a specialization, or `null` when none exists.
 *
 * Internal-only registrations are invisible here whatever catalog is passed:
 * this is the lookup every public path uses, and an internal-only row must be
 * unreachable from it by construction rather than by the caller remembering
 * to filter. Specialization ids are unique in a validated catalog, so there is
 * no "first match" to speak of.
 *
 * `null` means exactly "no public analyzer is registered for this spec". It is
 * never a judgement about the player and never an invitation to try a
 * different analyzer.
 */
export function analyzerForSpec(
  specId: SpecId,
  catalog: ValidatedAnalyzerCatalog = PRODUCTION_CATALOG,
): AnalyzerRegistration | null {
  return publicAnalyzers(catalog).find((registration) => registration.specId === specId) ?? null;
}

/**
 * Finds any registration for a specialization, public or internal-only.
 *
 * For internal evaluation and tests. Nothing on a public path may call this;
 * `tests/contracts/m10a-cross-spec-isolation.test.ts` pins that.
 */
export function internalAnalyzerForSpec(
  specId: SpecId,
  catalog: ValidatedAnalyzerCatalog = PRODUCTION_CATALOG,
): AnalyzerRegistration | null {
  return requireValidated(catalog).find((registration) => registration.specId === specId) ?? null;
}

/**
 * The owning registration's view of an analyzed result.
 *
 * The registration is FOUND, not supplied: the analysis names a
 * specialization, the validated catalog holds at most one registration for
 * it, and the ownership check confirms the pairing before the adapter runs.
 * An analysis owned by no registration in this catalog, or one that fails the
 * ownership check, throws — it is never adapted by a neighbour's view.
 */
export function observedDecisionViewOf(
  catalog: ValidatedAnalyzerCatalog,
  analysis: AnalyzedEnvelope,
): ObservedDecisionView {
  const registration = requireValidated(catalog).find((candidate) => candidate.specId === analysis.specId);
  if (registration === undefined) {
    throw new AnalyzerCatalogIntegrityError([
      {
        defect: "UNKNOWN_SPEC_ID",
        analyzerId: null,
        detail: `an analysis for '${String(analysis.specId)}' has no registration in this catalog`,
      },
    ]);
  }
  assertAnalysisOwnership(registration, analysis);
  return registration.observedDecisionView(analysis);
}

/**
 * The owning registration's support-observation view of an UNANALYZED result
 * (M13-F), or `null` when that registration publishes none.
 *
 * Found and ownership-checked exactly as `observedDecisionViewOf` is: never
 * adapted by a neighbour's view. `null` means only "this registration has no
 * support observations to publish" — it is never an empty observation set.
 */
export function supportObservationViewOf(
  catalog: ValidatedAnalyzerCatalog,
  analysis: UnanalyzedEnvelope,
): SupportObservationOutcome | null {
  const registration = requireValidated(catalog).find((candidate) => candidate.specId === analysis.specId);
  if (registration === undefined) {
    throw new AnalyzerCatalogIntegrityError([
      {
        defect: "UNKNOWN_SPEC_ID",
        analyzerId: null,
        detail: `an analysis for '${String(analysis.specId)}' has no registration in this catalog`,
      },
    ]);
  }
  assertAnalysisOwnership(registration, analysis);
  return registration.supportObservationView === undefined
    ? null
    : registration.supportObservationView(analysis);
}

/**
 * The owning registration's healer view of an UNANALYZED result (HEAL-AP), or
 * `null` when that registration publishes none.
 *
 * Found and ownership-checked exactly as `supportObservationViewOf` is. `null`
 * means only "this registration has no healer findings to publish" — it is
 * never an empty finding set.
 */
export function healerViewOf(
  catalog: ValidatedAnalyzerCatalog,
  analysis: UnanalyzedEnvelope,
): HealerViewOutcome | null {
  const registration = requireValidated(catalog).find((candidate) => candidate.specId === analysis.specId);
  if (registration === undefined) {
    throw new AnalyzerCatalogIntegrityError([
      {
        defect: "UNKNOWN_SPEC_ID",
        analyzerId: null,
        detail: `an analysis for '${String(analysis.specId)}' has no registration in this catalog`,
      },
    ]);
  }
  assertAnalysisOwnership(registration, analysis);
  return registration.healerView === undefined ? null : registration.healerView(analysis);
}

export type AnalyzerRun =
  | { readonly ok: true; readonly analysis: SpecAnalysisEnvelope }
  | { readonly ok: false; readonly detail: string };

/**
 * Runs a registration's facade and checks the result is its own.
 *
 * The services call THIS rather than `registration.analyze` directly, so a
 * registration built without `defineAnalyzerRegistration` — whose `analyze`
 * carries no wrapper — is still held to ownership. Returns the check rather
 * than throwing so a service can report a typed INTERNAL_ERROR; a wrapper
 * that throws first is caught and reported the same way.
 */
export function runAnalyzer(registration: AnalyzerRegistration, input: SpecAnalysisInput): AnalyzerRun {
  if (input.specId !== registration.specId) {
    return {
      ok: false,
      detail: `the '${registration.analyzerId}' registration was asked about '${input.specId}' but owns '${registration.specId}'`,
    };
  }
  let analysis: SpecAnalysisEnvelope;
  try {
    analysis = registration.analyze(input);
  } catch (error: unknown) {
    if (error instanceof AnalyzerResultOwnershipError) return { ok: false, detail: error.message };
    throw error;
  }
  const ownership = checkAnalysisOwnership(registration, analysis);
  if (!ownership.ok) {
    return {
      ok: false,
      detail: `the '${registration.analyzerId}' registration returned a result it does not own (${ownership.defect}): ${ownership.detail}`,
    };
  }
  return { ok: true, analysis };
}

/**
 * The analysis result for a specialization no public analyzer covers.
 *
 * Built HERE rather than in the application service because this module is what
 * determines support: the answer and the list it is derived from stay together.
 *
 * It is a real analysis-domain result, not an error. The status is the same one
 * an evaluator produces when handed the wrong spec, so a consumer sees one
 * vocabulary regardless of whether the gate fired before or inside an analyzer.
 *
 * WHAT THE DETAIL HAS TO SAY, AND WHY
 *
 * That no analysis was ATTEMPTED. The failure this guards against is a reader
 * seeing a well-formed result with no findings and concluding the player did
 * nothing wrong. Absence of analysis is not evidence of good play, and the only
 * place that can be said is here.
 */
export function specNotSupported(observedSpecId: string): SpecAnalysis {
  return {
    status: "SPEC_NOT_SUPPORTED",
    specId: observedSpecId,
    detail:
      `No gameplay analyzer is registered for '${observedSpecId}', so no rotational decision was evaluated ` +
      `and no gameplay analysis was attempted. This is a limit of the analyzer's current coverage, not a ` +
      `statement about how the fight was played.`,
  };
}
