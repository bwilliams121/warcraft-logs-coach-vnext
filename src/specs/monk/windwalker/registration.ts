/**
 * Windwalker Monk's analyzer registration (ONB-T1), INTERNAL_ONLY.
 *
 * THIS IS WHERE THE SPECIALIZATION STATES WHAT IT IS, AND THE ONLY PLACE. One row, owned by the
 * specialization, joining its identity, its exposure, the decision families it declares and the
 * evidence each consumes, the ONE authority it binds and the domain it binds it to, the facade
 * that runs it, and the projection of its result shared code may read.
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY. The public lookup and the identity table refuse it. No decision of it resolves: all 239 eligible decisions of its one retained subject stay UNKNOWN, refused at `default[0] auto_attack`, and the root scan stops at `zenith[3]` on a refused `target_if`.
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN. `SIMC_APL_MONK_WINDWALKER` governs OFFENSIVE_ROTATION and nothing
 * else (`authority-bindings.ts`, `domains.ts`).
 *
 * THE VIEW. Internal exclusion reasons project onto the public vocabulary; everything else in the
 * payload stays inside it.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { simcProfileFactsField } from "../../../findings/simc-profile-fallback.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { WINDWALKER_MONK_AUTHORITY_BINDINGS, WINDWALKER_MONK_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedWindwalkerMonkDecisions,
  WINDWALKER_MONK_EXCLUSION_REASONS,
  type WindwalkerMonkExclusionReason,
  type WindwalkerMonkAnalysis,
} from "./observed-analysis.js";
import {
  WINDWALKER_MONK_ANALYZER_ID,
  WINDWALKER_MONK_DISPLAY_NAME,
  WINDWALKER_MONK_SPEC_ID,
} from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC vocabulary. Total by
 * construction; every target is already a member of `PUBLIC_EXCLUSION_REASONS`.
 */
export const WINDWALKER_MONK_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
} as const satisfies Record<WindwalkerMonkExclusionReason, string>;

export type WindwalkerMonkViewExclusionReason =
  (typeof WINDWALKER_MONK_EXCLUSION_VIEW_PROJECTION)[WindwalkerMonkExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const WINDWALKER_MONK_VIEW_EXCLUSION_ORDER: readonly WindwalkerMonkViewExclusionReason[] =
  Object.freeze(
    WINDWALKER_MONK_EXCLUSION_REASONS.map(
      (reason) => WINDWALKER_MONK_EXCLUSION_VIEW_PROJECTION[reason],
    ).filter((reason, index, all) => all.indexOf(reason) === index),
  );

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectWindwalkerMonkExclusionTally(
  rows: readonly { readonly key: WindwalkerMonkExclusionReason; readonly count: number }[],
): readonly { readonly key: WindwalkerMonkViewExclusionReason; readonly count: number }[] {
  const merged = new Map<WindwalkerMonkViewExclusionReason, number>();
  for (const row of rows) {
    const key = WINDWALKER_MONK_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: WindwalkerMonkViewExclusionReason; count: number }[] = [];
  for (const key of WINDWALKER_MONK_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/** The projection shared code reads. Field for field the shape the other adapters produce. */
export function windwalkerMonkObservedDecisionView(
  analysis: Extract<WindwalkerMonkAnalysis, { status: "ANALYZED" }>,
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
      reason: WINDWALKER_MONK_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectWindwalkerMonkExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this evaluator refuses to
 * judge. It is NOT published while the row is INTERNAL_ONLY; a reader of it must not mistake an
 * all-UNKNOWN surface for a clean review.
 */
export const WINDWALKER_MONK_LIMITS = Object.freeze({
  analysis: [
    "Windwalker Monk analysis compares observed global-cooldown decisions with pinned class/spec rotational authority,",
    "when the necessary state can be established. Every decision first meets the swing's entry, whose readiness is unobserved, then Touch of Karma, the opener and Zenith lines that read auras, cooldowns, Chi and a chosen enemy, and behind them a list dispatch on the enemy count, which has no upper bound, so no decision currently resolves.",
    "It does NOT evaluate defensive cooldowns, interrupts or survival, it does not score performance, and it does",
    "not read race, faction, gear use effects or consumables. It reads no Chi at all and no Energy between observations, and it reconstructs no cooldown, no",
    "aura and no Combo Strikes history. UNKNOWN is expected here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Windwalker Monk cells count only observed global-cooldown decisions compared against pinned class/spec authority,",
    "and no decision currently resolves. They do NOT evaluate defensive cooldowns, interrupts or survival, and they do",
    "not score performance. All decisions remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Windwalker Monk specialization module (ONB-T1), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision.
 */
export const WINDWALKER_MONK_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: WINDWALKER_MONK_SPEC_ID,
    analyzerId: WINDWALKER_MONK_ANALYZER_ID,
    displayName: WINDWALKER_MONK_DISPLAY_NAME,
    wclClassName: "Monk",
    wclSpecName: "Windwalker",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: WINDWALKER_MONK_CAPABILITIES,
  authorityBindings: WINDWALKER_MONK_AUTHORITY_BINDINGS,
  limitsProse: WINDWALKER_MONK_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedWindwalkerMonkDecisions({ ...input, authority }),
  observedDecisionView: windwalkerMonkObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const WINDWALKER_MONK_REGISTRATION: AnalyzerRegistration = WINDWALKER_MONK_MODULE.registration;
