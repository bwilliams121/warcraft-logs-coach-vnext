/**
 * THE NUMERIC IMPACT ESTIMATOR EXTENSION POINT (M15-C). NONE IS REGISTERED.
 *
 * The owner decision of 2026-11-02 (agent/architecture.md "impact is
 * non-numeric prioritization") makes v1 impact a qualitative label
 * (`priority-labels.ts`) and keeps an explicit hook for a FUTURE
 * authority-backed numeric estimator. This file is that hook, and only that.
 *
 * WHAT A FUTURE ESTIMATOR MUST DECLARE
 *
 *   authority             what it rests on; never NO_AUTHORITY_AVAILABLE
 *   supports              the specialization ids, builds and decision
 *                         categories it is valid for; each non-empty
 *   evidenceRequirements  the evidence it needs, named
 *   uncertainty           BOUNDED_INTERVAL: an estimate is always a
 *                         [lower, upper] interval, never a bare point
 *   units                 what the numbers measure
 *   provenance            source, revision and generation date
 *
 * HOW AN ESTIMATE RESOLVES
 *
 *   not a PRIORITIZED divergence  NOT_AVAILABLE: an UNKNOWN, SUPPRESSED,
 *                                 NO_AUTHORITY_AVAILABLE, unsupported or
 *                                 informational item never has an impact,
 *                                 so it can never carry a penalty
 *   no estimator registered       NOT_AVAILABLE (today, every item)
 *   none supports the item, or
 *   the build is not declared     NOT_AVAILABLE: no standard for it
 *   some support the spec and
 *   category, build unknown       UNKNOWN (no estimator named): a standard
 *                                 may apply, the evidence to select it does
 *                                 not
 *
 * Selection matches spec, category and build together; the registry forbids
 * overlapping cells, so registration order never decides.
 *   the estimator cannot decide   UNKNOWN with its reason code
 *   a malformed interval          UNKNOWN: never repaired into a number
 *   otherwise                     ESTIMATED with the declaration restated
 *
 * An estimate never changes a label, a rank, a disposition, a confidence or
 * a suppression: `priority-labels.ts` does not import this file
 * (`tests/contracts/m15c-impact-contract.test.ts`). Nothing here is
 * published; publishing an estimate is a public contract change and a
 * separately reviewed tranche.
 */

import { NO_AUTHORITY, REPORTING_CATEGORIES, type ReportingCategory } from "./finding-record.js";
import type { ReportItem } from "./prioritization.js";

export const IMPACT_ESTIMATOR_REGISTRY_REVISION = "impact-estimator-registry/1" as const;

export interface ImpactEstimatorDeclaration {
  readonly estimatorId: string;
  readonly authority: string;
  readonly supports: {
    readonly specIds: readonly string[];
    readonly builds: readonly string[];
    readonly categories: readonly ReportingCategory[];
  };
  readonly evidenceRequirements: readonly string[];
  readonly uncertainty: "BOUNDED_INTERVAL";
  readonly units: string;
  readonly provenance: {
    readonly source: string;
    readonly revision: string;
    readonly generatedAt: string;
  };
}

export type EstimatorOutcome =
  | { readonly kind: "BOUNDED"; readonly lower: number; readonly upper: number }
  | { readonly kind: "UNKNOWN"; readonly reasonCode: string };

export interface ImpactEstimator extends ImpactEstimatorDeclaration {
  /** Called only for a PRIORITIZED item the declaration supports, with an established build. */
  readonly estimate: (item: ReportItem, build: string) => EstimatorOutcome;
}

/** The registered estimators. Empty by owner decision (2026-11-02). */
export const IMPACT_ESTIMATORS: readonly ImpactEstimator[] = [];

export type EstimatorProblem =
  | "EMPTY_ESTIMATOR_ID"
  | "DUPLICATE_ESTIMATOR_ID"
  | "MISSING_AUTHORITY"
  | "NO_AUTHORITY_ESTIMATOR"
  | "EMPTY_SUPPORTED_SPECS"
  | "EMPTY_SUPPORTED_BUILDS"
  | "EMPTY_SUPPORTED_CATEGORIES"
  | "UNKNOWN_CATEGORY"
  | "EMPTY_EVIDENCE_REQUIREMENTS"
  | "UNSUPPORTED_UNCERTAINTY"
  | "MISSING_UNITS"
  | "MISSING_PROVENANCE"
  | "OVERLAPPING_SUPPORT";

export interface RefusedEstimator {
  readonly estimatorId: string;
  readonly problems: readonly EstimatorProblem[];
}

export type ImpactEstimatorRegistry =
  | {
      readonly kind: "REGISTRY";
      readonly revision: typeof IMPACT_ESTIMATOR_REGISTRY_REVISION;
      readonly estimators: readonly ImpactEstimator[];
    }
  | { readonly kind: "REFUSED"; readonly refused: readonly RefusedEstimator[] };

export const IMPACT_NOT_AVAILABLE_REASONS = [
  "NOT_A_PRIORITIZED_DIVERGENCE",
  "NO_ESTIMATOR_REGISTERED",
  "NO_ESTIMATOR_SUPPORTS_ITEM",
  "REGISTRY_REFUSED",
] as const;
export type ImpactNotAvailableReason = (typeof IMPACT_NOT_AVAILABLE_REASONS)[number];

export type ImpactEstimate =
  | { readonly kind: "NOT_AVAILABLE"; readonly reason: ImpactNotAvailableReason }
  | {
      readonly kind: "UNKNOWN";
      /** The estimator that could not decide; null when none could be selected (no established build). */
      readonly estimatorId: string | null;
      readonly reasonCode: string;
    }
  | {
      readonly kind: "ESTIMATED";
      readonly estimatorId: string;
      readonly authority: string;
      readonly units: string;
      readonly uncertainty: "BOUNDED_INTERVAL";
      readonly lower: number;
      readonly upper: number;
      readonly provenance: ImpactEstimatorDeclaration["provenance"];
    };

const nonEmpty = (value: unknown): boolean => typeof value === "string" && value.length > 0;
const nonEmptyList = (value: unknown): boolean =>
  Array.isArray(value) && value.length > 0 && value.every(nonEmpty);

function problemsOf(estimator: ImpactEstimatorDeclaration): EstimatorProblem[] {
  const problems: EstimatorProblem[] = [];
  if (!nonEmpty(estimator.estimatorId)) problems.push("EMPTY_ESTIMATOR_ID");
  if (!nonEmpty(estimator.authority)) problems.push("MISSING_AUTHORITY");
  else if (estimator.authority === NO_AUTHORITY) problems.push("NO_AUTHORITY_ESTIMATOR");
  if (!nonEmptyList(estimator.supports?.specIds)) problems.push("EMPTY_SUPPORTED_SPECS");
  if (!nonEmptyList(estimator.supports?.builds)) problems.push("EMPTY_SUPPORTED_BUILDS");
  const categories: readonly unknown[] = estimator.supports?.categories ?? [];
  if (categories.length === 0) problems.push("EMPTY_SUPPORTED_CATEGORIES");
  else if (!categories.every((category) => (REPORTING_CATEGORIES as readonly unknown[]).includes(category)))
    problems.push("UNKNOWN_CATEGORY");
  if (!nonEmptyList(estimator.evidenceRequirements)) problems.push("EMPTY_EVIDENCE_REQUIREMENTS");
  if (estimator.uncertainty !== "BOUNDED_INTERVAL") problems.push("UNSUPPORTED_UNCERTAINTY");
  if (!nonEmpty(estimator.units)) problems.push("MISSING_UNITS");
  const { provenance } = estimator;
  if (
    provenance === undefined ||
    !nonEmpty(provenance.source) ||
    !nonEmpty(provenance.revision) ||
    !nonEmpty(provenance.generatedAt)
  )
    problems.push("MISSING_PROVENANCE");
  return problems;
}

/** Every spec × build × category cell an estimator claims. */
const cellsOf = (estimator: ImpactEstimatorDeclaration): string[] =>
  estimator.supports.specIds.flatMap((specId) =>
    estimator.supports.builds.flatMap((build) =>
      estimator.supports.categories.map((category) => JSON.stringify([specId, build, category])),
    ),
  );

/**
 * Validates a list of estimators. Any problem refuses the WHOLE registry, so a
 * half-declared estimator is never applied, and two estimators may never claim
 * the same spec, build and category: authority is resolved per decision, never
 * by whichever was registered first.
 */
export function buildImpactEstimatorRegistry(
  estimators: readonly ImpactEstimator[],
): ImpactEstimatorRegistry {
  const ids = new Map<string, number>();
  for (const estimator of estimators)
    ids.set(estimator.estimatorId, (ids.get(estimator.estimatorId) ?? 0) + 1);
  const owners = new Map<string, number>();
  const declared = estimators.map((estimator) => {
    const problems = problemsOf(estimator);
    if ((ids.get(estimator.estimatorId) ?? 0) > 1) problems.unshift("DUPLICATE_ESTIMATOR_ID");
    const cells = problems.length === 0 ? cellsOf(estimator) : [];
    for (const cell of cells) owners.set(cell, (owners.get(cell) ?? 0) + 1);
    return { estimator, problems, cells };
  });
  const refused: RefusedEstimator[] = [];
  for (const { estimator, problems, cells } of declared) {
    if (cells.some((cell) => (owners.get(cell) ?? 0) > 1)) problems.push("OVERLAPPING_SUPPORT");
    if (problems.length > 0) refused.push({ estimatorId: String(estimator.estimatorId), problems });
  }
  if (refused.length > 0) return { kind: "REFUSED", refused };
  return { kind: "REGISTRY", revision: IMPACT_ESTIMATOR_REGISTRY_REVISION, estimators };
}

export const DEFAULT_IMPACT_ESTIMATOR_REGISTRY: ImpactEstimatorRegistry =
  buildImpactEstimatorRegistry(IMPACT_ESTIMATORS);

/**
 * The estimate for one report item. `build` is the established build of the
 * analyzed fight, or null when none is established.
 */
export function estimateImpact(
  item: ReportItem,
  build: string | null,
  registry: ImpactEstimatorRegistry = DEFAULT_IMPACT_ESTIMATOR_REGISTRY,
): ImpactEstimate {
  if (item.section !== "PRIORITIZED" || item.disposition !== "AUTHORITY_DIVERGENCE")
    return { kind: "NOT_AVAILABLE", reason: "NOT_A_PRIORITIZED_DIVERGENCE" };
  if (registry.kind === "REFUSED") return { kind: "NOT_AVAILABLE", reason: "REGISTRY_REFUSED" };
  if (registry.estimators.length === 0) return { kind: "NOT_AVAILABLE", reason: "NO_ESTIMATOR_REGISTERED" };
  const { specId } = item;
  const candidates =
    specId === null
      ? []
      : registry.estimators.filter(
          (candidate) =>
            candidate.supports.specIds.includes(specId) &&
            candidate.supports.categories.includes(item.category),
        );
  if (candidates.length === 0) return { kind: "NOT_AVAILABLE", reason: "NO_ESTIMATOR_SUPPORTS_ITEM" };
  // Several estimators may cover one spec and category with disjoint builds,
  // so with no established build no single estimator can be named.
  if (build === null) return { kind: "UNKNOWN", estimatorId: null, reasonCode: "BUILD_NOT_ESTABLISHED" };
  // Selection uses spec, category AND build: the registry forbids overlapping
  // cells, so at most one matches and registration order never decides. A
  // build no estimator declares has no standard: not available, never
  // UNKNOWN (CLAUDE.md "UNKNOWN vs NO_AUTHORITY_AVAILABLE").
  const estimator = candidates.find((candidate) => candidate.supports.builds.includes(build));
  if (estimator === undefined) return { kind: "NOT_AVAILABLE", reason: "NO_ESTIMATOR_SUPPORTS_ITEM" };
  let outcome: EstimatorOutcome;
  try {
    outcome = estimator.estimate(item, build);
  } catch {
    return { kind: "UNKNOWN", estimatorId: estimator.estimatorId, reasonCode: "ESTIMATOR_FAILED" };
  }
  if (outcome?.kind === "UNKNOWN")
    return {
      kind: "UNKNOWN",
      estimatorId: estimator.estimatorId,
      reasonCode: nonEmpty(outcome.reasonCode) ? outcome.reasonCode : "ESTIMATOR_UNKNOWN_WITHOUT_REASON",
    };
  if (
    outcome?.kind !== "BOUNDED" ||
    !Number.isFinite(outcome.lower) ||
    !Number.isFinite(outcome.upper) ||
    outcome.lower > outcome.upper
  )
    return { kind: "UNKNOWN", estimatorId: estimator.estimatorId, reasonCode: "ESTIMATE_MALFORMED" };
  return {
    kind: "ESTIMATED",
    estimatorId: estimator.estimatorId,
    authority: estimator.authority,
    units: estimator.units,
    uncertainty: "BOUNDED_INTERVAL",
    lower: outcome.lower,
    upper: outcome.upper,
    provenance: estimator.provenance,
  };
}
