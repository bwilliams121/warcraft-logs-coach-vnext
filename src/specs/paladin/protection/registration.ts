/**
 * Protection Paladin's analyzer registration (M10-C).
 *
 * THIS IS WHERE PROTECTION STATES WHAT IT IS, AND THE ONLY PLACE.
 *
 * One row, owned by the specialization, joining the facts that must never
 * drift apart: its identity, its exposure, the six decision families it
 * declares and the evidence each consumes, the ONE authority it binds and the
 * domain it binds it to, the facade that runs it, and the projection of its
 * result shared code may read. `src/services/analyzer-registry.ts` lists this
 * row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY, AND WHAT THAT MEANS
 *
 * The row is in the production catalog. `internalAnalyzerForSpec` resolves
 * it; the corpus executor and the tests run it. `analyzerForSpec` does NOT:
 * the application service, raid-night orchestration, REST and MCP select
 * from the PUBLIC subset only, and `paladin/protection` is not in
 * `PUBLIC_SPEC_IDS`, not in the identity table, and not exposed here. The
 * registry validates all three agree, so promoting this analyzer is a
 * reviewed edit to three places at once — M10-D's, not this milestone's.
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN
 *
 * `SIMC_APL_PALADIN_PROTECTION` governs OFFENSIVE_ROTATION and nothing else.
 * Five more domains are declared and bound to nothing; see
 * `authority-bindings.ts`. The registry would refuse a SimulationCraft
 * binding on any of them.
 *
 * SCHEMA-V1 PROJECTION PLAN (M10-D; NOTHING HERE PROJECTS PUBLICLY TODAY)
 *
 * Two internal vocabularies of this tree have no name in the public schema.
 * Neither requires a schema change, and the plan for each is recorded here so
 * M10-D promotes what this milestone decided rather than deciding under
 * pressure. `PROTECTION_EXCLUSION_PUBLIC_PROJECTION` is the executable form;
 * a contract test pins that it is total over the internal reasons and lands
 * inside `PUBLIC_EXCLUSION_REASONS`.
 *
 *     MELEE_SWING → NON_GCD_ACTION
 *         A swing is POSITIVELY identified (`isMelee` on the normalized cast),
 *         and a swing is off the global cooldown: it is scheduled by the
 *         background `auto_attack` action, which the pinned lane data records
 *         at `_gcd` 0. Projecting it as an unknown execution lane
 *         (`EXECUTION_LANE_NOT_ESTABLISHED`) would be untruthful — the lane is
 *         not unestablished, it is known and off-GCD — so the M10-C2 pass
 *         corrected the plan to NON_GCD_ACTION. The public reader loses one
 *         bit of precision (swing versus pressed NON_GCD action); the internal
 *         reason keeps it. If the product owner wants that bit public, it is
 *         a NEW public reason and therefore a schema-v2 decision — an M10-D
 *         design gate, not taken here.
 *
 *     TRANSITION_UNSUPPORTED (an engine raw blocker) → class OTHER, raw withheld
 *         Already the public shape: `decisiveBlocker` is the public class and
 *         `rawBlocker` is withheld from the shared view exactly as the Rogue
 *         adapter withholds it. No mapping is needed and none is added.
 */

import {
  defineAnalyzerRegistration,
  type AnalyzerRegistration,
} from "../../../findings/analyzer-registration.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { PROTECTION_AUTHORITY_BINDINGS, PROTECTION_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedProtectionPaladinDecisions,
  type ProtectionExclusionReason,
  type ProtectionPaladinAnalysis,
} from "./observed-analysis.js";
import { PROTECTION_PALADIN_ANALYZER_ID, PROTECTION_PALADIN_SPEC_ID } from "./spec.js";

/**
 * The projection shared code reads.
 *
 * Field for field the shape Assassination's adapter produces, built from the
 * Protection payload's comparisons and exclusions. The domain results, the
 * Holy Power observations, the build resolution and the resolver diagnostics
 * stay INSIDE the payload: the shared view has no field for them, and this
 * adapter adds none. `rawBlocker`, `observedActionRejected` and the per-record
 * `actorId` are withheld exactly as the Rogue adapter withholds them.
 */
/**
 * The planned public projection of every internal exclusion reason. Total by
 * construction (`satisfies Record<...>`); the public side is pinned by test
 * because this tree does not import the public contract.
 */
export const PROTECTION_EXCLUSION_PUBLIC_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
} as const satisfies Record<ProtectionExclusionReason, string>;

export function protectionObservedDecisionView(
  analysis: Extract<ProtectionPaladinAnalysis, { status: "ANALYZED" }>,
): ObservedDecisionView {
  const { coverage } = analysis;
  return {
    decisions: analysis.comparisons.map((comparison) => ({
      locator: comparison.decision.locator,
      position: comparison.decision.position,
      fightTimeMs: comparison.decision.fightTimeMs,
      targetActorId: comparison.decision.targetActorId,
      observedAbilityGameId: comparison.decision.abilityGameId,
      observedToken: comparison.decision.observedToken,
      outcome: comparison.outcome,
      basis: comparison.basis,
      authorityCoverage: comparison.authorityCoverage,
      authorityToken: comparison.authorityToken,
      selectionPrecision: comparison.selectionPrecision,
      decisiveBlocker: comparison.decisiveBlocker,
      usabilityProvenance: comparison.usabilityProvenance,
    })),
    exclusions: analysis.excluded.map((cast) => ({
      locator: cast.locator,
      position: cast.position,
      abilityGameId: cast.abilityGameId,
      reportTimeMs: cast.reportTimeMs,
      reason: cast.reason,
    })),
    coverage: {
      eligibleDecisions: coverage.eligibleDecisions,
      match: coverage.match,
      rejected: coverage.rejected,
      unknown: coverage.unknown,
      resolvedComparisons: coverage.resolvedComparisons,
      exactEntryMatches: coverage.exactEntryMatches,
      tokenConvergedMatches: coverage.tokenConvergedMatches,
      selectionPrecision: coverage.selectionPrecision.map((row) => ({ key: row.key, count: row.count })),
      unknownBases: coverage.unknownBases.map((row) => ({ key: row.key, count: row.count })),
      unknownBlockerClasses: coverage.unknownBlockerClasses.map((row) => ({
        key: row.key,
        count: row.count,
      })),
      exclusions: coverage.exclusions.map((row) => ({ key: row.key, count: row.count })),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

export const PROTECTION_PALADIN_REGISTRATION: AnalyzerRegistration = defineAnalyzerRegistration({
  analyzerId: PROTECTION_PALADIN_ANALYZER_ID,
  specId: PROTECTION_PALADIN_SPEC_ID,
  exposure: "INTERNAL_ONLY",
  capabilities: PROTECTION_CAPABILITIES,
  authorityBindings: PROTECTION_AUTHORITY_BINDINGS,
  // The facade receives the registration's OWN authority access and asks it
  // per domain. There is no argument through which another specialization's
  // binding could arrive.
  analyze: (input, authority) => analyzeObservedProtectionPaladinDecisions({ ...input, authority }),
  observedDecisionView: protectionObservedDecisionView,
});
