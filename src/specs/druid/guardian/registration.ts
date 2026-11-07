/**
 * Guardian Druid's analyzer registration (ONB-T2), INTERNAL_ONLY.
 *
 * THIS IS WHERE THE SPECIALIZATION STATES WHAT IT IS, AND THE ONLY PLACE. One row, owned by the
 * specialization, joining its identity, its exposure, the decision families it declares and the
 * evidence each consumes, the ONE authority it binds and the domain it binds it to, the facade
 * that runs it, and the projection of its result shared code may read.
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY. The public lookup and the identity table refuse it. No decision of it resolves on its
 * retained evidence, because no Guardian Druid subject is retained: on a synthetic build the engine refuses at `default[0] auto_attack`, off the GCD with no contract, and the root scan stops in `cooldowns` at Heart of the Wild's unresolved talent, before any `bear` line and before any enemy count.
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN. `SIMC_APL_DRUID_GUARDIAN` governs OFFENSIVE_ROTATION and nothing
 * else (`authority-bindings.ts`, `domains.ts`).
 *
 * THE VIEW. Internal exclusion reasons project onto the public vocabulary; everything else in the
 * payload stays inside it.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { simcProfileFactsField } from "../../../findings/simc-profile-fallback.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { GUARDIAN_AUTHORITY_BINDINGS, GUARDIAN_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedGuardianDruidDecisions,
  GUARDIAN_EXCLUSION_REASONS,
  type GuardianExclusionReason,
  type GuardianDruidAnalysis,
} from "./observed-analysis.js";
import { GUARDIAN_DRUID_ANALYZER_ID, GUARDIAN_DRUID_DISPLAY_NAME, GUARDIAN_DRUID_SPEC_ID } from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC vocabulary. Total by
 * construction; every target is already a member of `PUBLIC_EXCLUSION_REASONS`.
 */
export const GUARDIAN_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
} as const satisfies Record<GuardianExclusionReason, string>;

export type GuardianViewExclusionReason =
  (typeof GUARDIAN_EXCLUSION_VIEW_PROJECTION)[GuardianExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const GUARDIAN_VIEW_EXCLUSION_ORDER: readonly GuardianViewExclusionReason[] = Object.freeze(
  GUARDIAN_EXCLUSION_REASONS.map((reason) => GUARDIAN_EXCLUSION_VIEW_PROJECTION[reason]).filter(
    (reason, index, all) => all.indexOf(reason) === index,
  ),
);

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectGuardianExclusionTally(
  rows: readonly { readonly key: GuardianExclusionReason; readonly count: number }[],
): readonly { readonly key: GuardianViewExclusionReason; readonly count: number }[] {
  const merged = new Map<GuardianViewExclusionReason, number>();
  for (const row of rows) {
    const key = GUARDIAN_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: GuardianViewExclusionReason; count: number }[] = [];
  for (const key of GUARDIAN_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/** The projection shared code reads. Field for field the shape the other adapters produce. */
export function guardianObservedDecisionView(
  analysis: Extract<GuardianDruidAnalysis, { status: "ANALYZED" }>,
): ObservedDecisionView {
  const { coverage } = analysis;
  return {
    decisions: analysis.comparisons.map((comparison, index) => ({
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
      ...simcProfileFactsField({ profileFacts: analysis.resolved[index]?.profileFacts ?? [] }),
    })),
    exclusions: analysis.excluded.map((cast) => ({
      locator: cast.locator,
      position: cast.position,
      abilityGameId: cast.abilityGameId,
      reportTimeMs: cast.reportTimeMs,
      reason: GUARDIAN_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectGuardianExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this evaluator refuses to
 * judge. It is NOT published while the row is INTERNAL_ONLY; a reader of it must not mistake an
 * all-UNKNOWN surface for a clean review.
 */
export const GUARDIAN_LIMITS = Object.freeze({
  analysis: [
    "Guardian Druid analysis compares observed global-cooldown decisions with pinned class/spec rotational authority,",
    "when the necessary state can be established, at the moment each cast began where that is established.",
    "No decision currently resolves.",
    "It does NOT evaluate defensive cooldowns, interrupts or survival, it does not score performance, and it does",
    "not read race, faction, gear use effects or consumables. It reconstructs no Rage, no cooldown, no aura,",
    "no pet and no enemy count of its own. UNKNOWN is expected here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Guardian Druid cells count only observed global-cooldown decisions compared against pinned class/spec authority,",
    "and no decision currently resolves. They do NOT evaluate defensive cooldowns, interrupts or survival, and they do",
    "not score performance. All decisions remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Guardian Druid specialization module (ONB-T2), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision.
 */
export const GUARDIAN_DRUID_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: GUARDIAN_DRUID_SPEC_ID,
    analyzerId: GUARDIAN_DRUID_ANALYZER_ID,
    displayName: GUARDIAN_DRUID_DISPLAY_NAME,
    wclClassName: "Druid",
    wclSpecName: "Guardian",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: GUARDIAN_CAPABILITIES,
  authorityBindings: GUARDIAN_AUTHORITY_BINDINGS,
  limitsProse: GUARDIAN_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedGuardianDruidDecisions({ ...input, authority }),
  observedDecisionView: guardianObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const GUARDIAN_DRUID_REGISTRATION: AnalyzerRegistration = GUARDIAN_DRUID_MODULE.registration;
