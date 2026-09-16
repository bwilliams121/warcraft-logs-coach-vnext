/**
 * Assassination Rogue's analyzer registration.
 *
 * THIS IS WHERE ASSASSINATION STATES WHAT IT IS, AND THE ONLY PLACE.
 *
 * One row, owned by the specialization, joining six facts that must never
 * drift apart: its identity, its exposure, the decision family it evaluates
 * and the evidence that family consumes, the authority it binds for that
 * family, the facade that runs it, and the projection of its result that
 * shared code is allowed to read. `src/services/analyzer-registry.ts` lists
 * this row and reads nothing else from this directory.
 *
 * THE CAPABILITY, STATED HONESTLY
 *
 * Exactly one: observed rotational decisions, in the OFFENSIVE_ROTATION domain,
 * under the pinned SimulationCraft APL. It reads one actor's completed casts,
 * that actor's combo points and energy, the auras on the actor and on the
 * target the cast was about, and the actor's combatant profile (talents, gear).
 * `PLAYER_CONTEXT` is the honest scope: no ally state is read. Widen any of
 * these ONLY when the evaluator actually starts reading more.
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN
 *
 * The pinned APL governs OFFENSIVE_ROTATION and nothing else. There is no
 * binding for any other domain, and the registry would refuse one: a
 * SimulationCraft APL is not compatible with a defensive, healing or interrupt
 * domain by declaration (`PROVIDER_DOMAIN_COMPATIBILITY`), and no artifact
 * exists that could be.
 *
 * WHAT THE VIEW DOES NOT CARRY
 *
 * `rawBlocker` (the engine's note on where a scan stopped), the three-state
 * `observedActionRejected` flag, the per-decision `actorId` and the coverage's
 * `actorId` stay inside the payload. Each was deliberately withheld from the
 * public contract in M6-C, and the view is where that decision now lives.
 */

import { pinnedAssassinationAuthority } from "../../../simc/pinned-authority.js";
import rogueAssassinationArtifact from "../../../simc/data/rogue-assassination.apl.json";
import {
  defineAnalyzerRegistration,
  type AnalyzerRegistration,
} from "../../../findings/analyzer-registration.js";
import type { AuthorityDomainBinding } from "../../../findings/authority-domain.js";
import type { DecisionCapability } from "../../../findings/decision-capability.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { ASSASSINATION_SPEC_ID } from "./evaluator.js";
import {
  analyzeObservedAssassinationDecisions,
  type ObservedAssassinationAnalysis,
} from "./observed-analysis.js";

export const ASSASSINATION_ANALYZER_ID = "rogue-assassination-observed-decisions";

export const ASSASSINATION_ROTATION_CAPABILITY_ID = "rogue-assassination.observed-rotational-decision";

/**
 * The one capability this evaluator has.
 *
 * `includeResources` is DERIVED from the two resources named here, which is
 * why they are listed rather than a boolean: the registration says what it
 * reads, and orchestration works out what to fetch.
 */
export const ASSASSINATION_ROTATION_CAPABILITY: DecisionCapability = {
  capabilityId: ASSASSINATION_ROTATION_CAPABILITY_ID,
  domain: "OFFENSIVE_ROTATION",
  requirements: {
    scope: "PLAYER_CONTEXT",
    resources: ["COMBO_POINTS", "ENERGY"],
    evidenceCategories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO", "GEAR"],
    targetModel: "PER_OBSERVED_CAST",
  },
};

/**
 * The pinned offensive authority.
 *
 * The identity fields are read from the committed artifact so this binding
 * cannot name a revision the artifact does not carry; the registry re-checks
 * them against what `load()` yields anyway, because "read from the same file"
 * is an argument and a check is a proof.
 */
export const ASSASSINATION_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = {
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: rogueAssassinationArtifact.authorityId,
  artifactRevision: rogueAssassinationArtifact.artifactRevision,
  commitSha: rogueAssassinationArtifact.provenance.commitSha,
  load: pinnedAssassinationAuthority,
};

/**
 * The projection shared code reads. Field for field what the public
 * projection built directly from the payload before M10-A, so the published
 * document is unchanged.
 */
export function assassinationObservedDecisionView(
  analysis: Extract<ObservedAssassinationAnalysis, { status: "ANALYZED" }>,
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
      // Tallies are rebuilt element by element rather than passed through, so a
      // future extra field on the internal tally cannot ride along.
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

export const ASSASSINATION_REGISTRATION: AnalyzerRegistration = defineAnalyzerRegistration({
  analyzerId: ASSASSINATION_ANALYZER_ID,
  specId: ASSASSINATION_SPEC_ID,
  exposure: "PUBLIC",
  capabilities: [ASSASSINATION_ROTATION_CAPABILITY],
  authorityBindings: [ASSASSINATION_OFFENSIVE_AUTHORITY],
  analyze: (input, authority) => {
    // The facade accepts `authority: null` to mean "no usable authority" and
    // answers AUTHORITY_NOT_AVAILABLE; every non-available resolution maps to
    // that, and the facade's own detail says what it always said. The facade's
    // self-loading path (`authority` omitted) stays available to direct callers
    // and tests; orchestration never takes it.
    const resolved = authority.forDomain("OFFENSIVE_ROTATION");
    return analyzeObservedAssassinationDecisions({
      ...input,
      authority: resolved.outcome === "AUTHORITY_AVAILABLE" ? resolved.authority : null,
    });
  },
  observedDecisionView: assassinationObservedDecisionView,
});
