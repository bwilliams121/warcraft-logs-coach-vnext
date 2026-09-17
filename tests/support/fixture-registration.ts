/**
 * A TEST-OWNED registration row for row-level proofs.
 *
 * NOT A GAMEPLAY EVALUATOR. It evaluates nothing, binds no authority by
 * default, and throws if anything ever runs it. It exists so the registration,
 * capability, authority-domain and ownership contracts can be exercised
 * against a row that is NOT one of the two real specializations' — a row a
 * test can bend (a borrowed binding, an orphan domain, a broken capability)
 * without touching production code.
 *
 * HISTORY, AND WHAT CHANGED IN M10-D
 *
 * From M10-A to M10-C this was the INTERNAL-ONLY fixture: an `INTERNAL_ONLY`
 * row under the then internal-only `paladin/protection` id, placed in
 * injected catalogs to prove that an internal registration is invisible to
 * public dispatch. M10-D made `paladin/protection` public and left the
 * internal-only set EMPTY, so that role no longer has a subject: the real
 * Protection row owns the id, and an `INTERNAL_ONLY` row under a public id
 * leaves an injected catalog's public set incomplete, which the registry
 * refuses. The catalog-level proofs moved onto the two real registrations
 * (`tests/support/catalog.ts`, `tests/regression/m10d-*`).
 *
 * WHAT THIS FIXTURE IS FOR NOW
 *
 * ROW-LEVEL use only: `defineAnalyzerRegistration`, `checkAnalysisOwnership`,
 * `validateCapabilities`, `resolveAuthorityForDomain`, `deriveIngestionScopeFor`
 * over a list of rows. Do not put it in a catalog that is then validated —
 * it cannot pass, by design, and a test that wants a catalog with one row
 * replaced uses `productionCatalogWith` instead.
 *
 * It still carries the `paladin/protection` id by default because every id
 * this build knows is now public and a fixture must name a real `SpecId`;
 * its default `INTERNAL_ONLY` exposure is retained so the dormant exposure
 * vocabulary keeps a row-level subject.
 */

import {
  defineAnalyzerRegistration,
  type AnalyzerRegistration,
} from "../../src/findings/analyzer-registration.js";
import type { AnalyzerExposure } from "../../src/findings/analyzer-registration.js";
import type { AuthorityDomainBinding } from "../../src/findings/authority-domain.js";
import type { DecisionCapability } from "../../src/findings/decision-capability.js";
import type { SpecId } from "../../src/findings/spec-id.js";

export const FIXTURE_ANALYZER_ID = "test-fixture-registration";

export const FIXTURE_CAPABILITY: DecisionCapability = {
  capabilityId: "test-fixture.active-mitigation-placeholder",
  // A tank domain with NO binding: resolves NO_PINNED_AUTHORITY_FOR_DOMAIN,
  // which is the truthful state of every tank domain in this build.
  domain: "ACTIVE_MITIGATION",
  requirements: {
    // Deliberately the opposite of Assassination's on both axes, so a test
    // that unions requirements over rows can see this one contribute.
    scope: "FULL_RAID",
    resources: [],
    evidenceCategories: ["CASTS", "AURAS"],
    targetModel: "NO_TARGET",
  },
};

export interface FixtureRegistrationOptions {
  readonly analyzerId?: string;
  readonly specId?: SpecId;
  readonly exposure?: AnalyzerExposure;
  readonly capabilities?: readonly DecisionCapability[];
  readonly authorityBindings?: readonly AuthorityDomainBinding[];
  /** Called if the fixture is ever run. Defaults to throwing. */
  readonly onAnalyze?: () => never;
}

export function fixtureRegistration(options: FixtureRegistrationOptions = {}): AnalyzerRegistration {
  const analyzerId = options.analyzerId ?? FIXTURE_ANALYZER_ID;
  return defineAnalyzerRegistration({
    analyzerId,
    specId: options.specId ?? "paladin/protection",
    exposure: options.exposure ?? "INTERNAL_ONLY",
    capabilities: options.capabilities ?? [FIXTURE_CAPABILITY],
    authorityBindings: options.authorityBindings ?? [],
    analyze: () => {
      if (options.onAnalyze !== undefined) return options.onAnalyze();
      throw new Error(`the fixture registration '${analyzerId}' must never be run`);
    },
    observedDecisionView: () => {
      throw new Error(`the fixture registration '${analyzerId}' has no analysis to view`);
    },
  });
}
