/**
 * Survival Hunter's analyzer registration (ONB-T2), INTERNAL_ONLY.
 *
 * THIS IS WHERE THE SPECIALIZATION STATES WHAT IT IS, AND THE ONLY PLACE. One row, owned by the
 * specialization, joining its identity, its exposure, the decision families it declares and the
 * evidence each consumes, the ONE authority it binds and the domain it binds it to, the facade
 * that runs it, and the projection of its result shared code may read.
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY. The public lookup and the identity table refuse it. No decision of it resolves on its
 * retained evidence, because no Survival Hunter subject is retained: on a synthetic build every scan stops at `default[0] retarget`, on its `target_if`, a line gated on a simulation fight style, before any rotation line.
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN. `SIMC_APL_HUNTER_SURVIVAL` governs OFFENSIVE_ROTATION and nothing
 * else (`authority-bindings.ts`, `domains.ts`).
 *
 * THE VIEW. Internal exclusion reasons project onto the public vocabulary; everything else in the
 * payload stays inside it.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { simcProfileFactsField } from "../../../findings/simc-profile-fallback.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { SURVIVAL_AUTHORITY_BINDINGS, SURVIVAL_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedSurvivalHunterDecisions,
  SURVIVAL_EXCLUSION_REASONS,
  type SurvivalExclusionReason,
  type SurvivalHunterAnalysis,
} from "./observed-analysis.js";
import {
  SURVIVAL_HUNTER_ANALYZER_ID,
  SURVIVAL_HUNTER_DISPLAY_NAME,
  SURVIVAL_HUNTER_SPEC_ID,
} from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC vocabulary. Total by
 * construction; every target is already a member of `PUBLIC_EXCLUSION_REASONS`.
 */
export const SURVIVAL_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
} as const satisfies Record<SurvivalExclusionReason, string>;

export type SurvivalViewExclusionReason =
  (typeof SURVIVAL_EXCLUSION_VIEW_PROJECTION)[SurvivalExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const SURVIVAL_VIEW_EXCLUSION_ORDER: readonly SurvivalViewExclusionReason[] = Object.freeze(
  SURVIVAL_EXCLUSION_REASONS.map((reason) => SURVIVAL_EXCLUSION_VIEW_PROJECTION[reason]).filter(
    (reason, index, all) => all.indexOf(reason) === index,
  ),
);

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectSurvivalExclusionTally(
  rows: readonly { readonly key: SurvivalExclusionReason; readonly count: number }[],
): readonly { readonly key: SurvivalViewExclusionReason; readonly count: number }[] {
  const merged = new Map<SurvivalViewExclusionReason, number>();
  for (const row of rows) {
    const key = SURVIVAL_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: SurvivalViewExclusionReason; count: number }[] = [];
  for (const key of SURVIVAL_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/** The projection shared code reads. Field for field the shape the other adapters produce. */
export function survivalObservedDecisionView(
  analysis: Extract<SurvivalHunterAnalysis, { status: "ANALYZED" }>,
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
      reason: SURVIVAL_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectSurvivalExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this evaluator refuses to
 * judge. It is NOT published while the row is INTERNAL_ONLY; a reader of it must not mistake an
 * all-UNKNOWN surface for a clean review.
 */
export const SURVIVAL_LIMITS = Object.freeze({
  analysis: [
    "Survival Hunter analysis compares observed global-cooldown decisions with pinned class/spec rotational authority,",
    "when the necessary state can be established, at the moment each cast began where that is established.",
    "No decision currently resolves.",
    "It does NOT evaluate defensive cooldowns, interrupts or survival, it does not score performance, and it does",
    "not read race, faction, gear use effects or consumables. It reconstructs no Focus, no cooldown, no aura,",
    "no pet and no enemy count of its own. UNKNOWN is expected here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Survival Hunter cells count only observed global-cooldown decisions compared against pinned class/spec authority,",
    "and no decision currently resolves. They do NOT evaluate defensive cooldowns, interrupts or survival, and they do",
    "not score performance. All decisions remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Survival Hunter specialization module (ONB-T2), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision.
 */
export const SURVIVAL_HUNTER_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: SURVIVAL_HUNTER_SPEC_ID,
    analyzerId: SURVIVAL_HUNTER_ANALYZER_ID,
    displayName: SURVIVAL_HUNTER_DISPLAY_NAME,
    wclClassName: "Hunter",
    wclSpecName: "Survival",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: SURVIVAL_CAPABILITIES,
  authorityBindings: SURVIVAL_AUTHORITY_BINDINGS,
  limitsProse: SURVIVAL_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedSurvivalHunterDecisions({ ...input, authority }),
  observedDecisionView: survivalObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const SURVIVAL_HUNTER_REGISTRATION: AnalyzerRegistration = SURVIVAL_HUNTER_MODULE.registration;
