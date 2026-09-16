/**
 * A TEST-OWNED internal-only registration under the `paladin/protection` id.
 *
 * NOT A GAMEPLAY EVALUATOR. It evaluates nothing, binds no authority, and
 * throws if a public path ever runs it. It exists so the M10-A architecture can
 * be proven against a real second `SpecId`: that an internal-only row in the
 * catalog is invisible to public dispatch, changes nothing about Assassination,
 * cannot reach a public projection, and cannot see Assassination's private
 * authority binding.
 *
 * Its requirement is deliberately the opposite of Assassination's on both axes
 * — `FULL_RAID`, no resources — so any bleed into an Assassination request
 * would change the observed ingestion arguments.
 *
 * Lives under `tests/`. No production module imports it; the cross-spec
 * isolation guard pins that no `src/specs/paladin/**` tree exists in M10-A.
 */

import {
  defineAnalyzerRegistration,
  type AnalyzerRegistration,
} from "../../src/findings/analyzer-registration.js";
import type { AnalyzerExposure } from "../../src/findings/analyzer-registration.js";
import type { AuthorityDomainBinding } from "../../src/findings/authority-domain.js";
import type { DecisionCapability } from "../../src/findings/decision-capability.js";
import type { SpecId } from "../../src/findings/spec-id.js";

export const INTERNAL_FIXTURE_ANALYZER_ID = "test-internal-fixture-protection-paladin";

export const INTERNAL_FIXTURE_CAPABILITY: DecisionCapability = {
  capabilityId: "test-internal-fixture.active-mitigation-placeholder",
  // A tank domain with NO binding: resolves NO_PINNED_AUTHORITY_FOR_DOMAIN,
  // which is the truthful state of every tank domain in M10-A.
  domain: "ACTIVE_MITIGATION",
  requirements: {
    scope: "FULL_RAID",
    resources: [],
    evidenceCategories: ["CASTS", "AURAS"],
    targetModel: "NO_TARGET",
  },
};

export interface InternalFixtureOptions {
  readonly analyzerId?: string;
  readonly specId?: SpecId;
  readonly exposure?: AnalyzerExposure;
  readonly capabilities?: readonly DecisionCapability[];
  readonly authorityBindings?: readonly AuthorityDomainBinding[];
  /** Called if the fixture is ever run. Defaults to throwing. */
  readonly onAnalyze?: () => never;
}

export function internalFixtureRegistration(options: InternalFixtureOptions = {}): AnalyzerRegistration {
  const analyzerId = options.analyzerId ?? INTERNAL_FIXTURE_ANALYZER_ID;
  return defineAnalyzerRegistration({
    analyzerId,
    specId: options.specId ?? "paladin/protection",
    exposure: options.exposure ?? "INTERNAL_ONLY",
    capabilities: options.capabilities ?? [INTERNAL_FIXTURE_CAPABILITY],
    authorityBindings: options.authorityBindings ?? [],
    analyze: () => {
      if (options.onAnalyze !== undefined) return options.onAnalyze();
      throw new Error(`the internal fixture registration '${analyzerId}' must never be run by a public path`);
    },
    observedDecisionView: () => {
      throw new Error(`the internal fixture registration '${analyzerId}' has no analysis to view`);
    },
  });
}
