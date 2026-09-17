/**
 * Complete injected catalogs for tests (M10-D).
 *
 * WHY THIS EXISTS
 *
 * Since M10-D both known specializations are PUBLIC, and the registry
 * requires an injected catalog's public set to EQUAL the public partition and
 * the identity table — for an injected catalog exactly as for the production
 * one. A test that hands the service `registry: [onlyAssassination]` is no
 * longer observing one analyzer; it is handing the service an incomplete
 * dispatch table, and the service refuses it as INTERNAL_ERROR. That refusal
 * is correct (a Protection request over that table would otherwise read
 * `SPEC_NOT_SUPPORTED` off a table that merely forgot the row), and the
 * registry's equality rule must not be weakened for tests' convenience.
 *
 * So a test that wants to observe, wrap or replace ONE registration builds
 * the whole production catalog with that one row swapped, here, and never
 * assembles a partial list by hand.
 *
 * WHAT IT REFUSES
 *
 * A replacement naming a specialization the production catalog does not carry
 * (there is nothing to replace), two replacements for one specialization, and
 * any result the registry would not validate. Each throws at the call site,
 * so a test cannot proceed on a catalog the service would refuse.
 */

import {
  ANALYZER_REGISTRATIONS,
  requireValidatedCatalog,
  type AnalyzerRegistration,
} from "../../src/services/analyzer-registry.js";
import type { SpecAnalysisEnvelope, SpecAnalysisInput } from "../../src/findings/analysis-envelope.js";
import type { SpecId } from "../../src/findings/spec-id.js";

/**
 * The production registrations, in production order, with each replacement
 * substituted for the production row of the same specialization.
 *
 * Returned as raw rows (what `AnalysisServiceDeps.registry` and
 * `RaidNightServiceDeps.registry` take), already proven to validate.
 */
export function productionCatalogWith(
  ...replacements: readonly AnalyzerRegistration[]
): readonly AnalyzerRegistration[] {
  const bySpec = new Map<SpecId, AnalyzerRegistration>();
  for (const replacement of replacements) {
    if (!ANALYZER_REGISTRATIONS.some((row) => row.specId === replacement.specId)) {
      throw new Error(
        `productionCatalogWith: '${replacement.specId}' has no production registration to replace`,
      );
    }
    if (bySpec.has(replacement.specId)) {
      throw new Error(`productionCatalogWith: '${replacement.specId}' is replaced twice`);
    }
    bySpec.set(replacement.specId, replacement);
  }
  const rows = ANALYZER_REGISTRATIONS.map((row) => bySpec.get(row.specId) ?? row);
  // Fail here, at the test, rather than inside the service as INTERNAL_ERROR.
  requireValidatedCatalog(rows);
  return rows;
}

/** The production registration for a specialization, or a thrown error. */
export function productionRegistrationFor(specId: SpecId): AnalyzerRegistration {
  const row = ANALYZER_REGISTRATIONS.find((registration) => registration.specId === specId);
  if (row === undefined) throw new Error(`no production registration for '${specId}'`);
  return row;
}

export interface CountedCatalog {
  /** Every production row, each facade wrapped to count and then run for real. */
  readonly registry: readonly AnalyzerRegistration[];
  /** Invocations per analyzer id, all keys present from the start. */
  readonly calls: Readonly<Record<string, number>>;
}

/**
 * The complete production catalog with every facade counted.
 *
 * The wrapper runs the REAL facade and returns its result untouched, so the
 * analysis is exactly the production analysis; only the count is added.
 * Complete by construction, so it validates.
 */
export function countedProductionCatalog(): CountedCatalog {
  const calls: Record<string, number> = {};
  const registry = ANALYZER_REGISTRATIONS.map((registration) => {
    calls[registration.analyzerId] = 0;
    return {
      ...registration,
      analyze: (input: SpecAnalysisInput): SpecAnalysisEnvelope => {
        calls[registration.analyzerId] = (calls[registration.analyzerId] ?? 0) + 1;
        return registration.analyze(input);
      },
    };
  });
  return { registry, calls };
}
