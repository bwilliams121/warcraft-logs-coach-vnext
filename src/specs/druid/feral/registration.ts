/**
 * Feral Druid's analyzer registration (ONB-C1), INTERNAL_ONLY.
 *
 * THIS IS WHERE THE SPECIALIZATION STATES WHAT IT IS, AND THE ONLY PLACE. One row, owned by the
 * specialization, joining its identity, its exposure, the decision families it declares and the
 * evidence each consumes, the ONE authority it binds and the domain it binds it to, the facade
 * that runs it, and the projection of its result shared code may read.
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY. The public lookup and the identity table refuse it. No decision of it resolves on its retained subjects, so its promotion needs ONB-S3 and the inputs its README lists (ONB-C1P).
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN. `SIMC_APL_DRUID_FERAL` governs OFFENSIVE_ROTATION and nothing
 * else (`authority-bindings.ts`, `domains.ts`).
 *
 * THE VIEW. Internal exclusion reasons project onto the public vocabulary; everything else in the
 * payload stays inside it.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { FERAL_DRUID_AUTHORITY_BINDINGS, FERAL_DRUID_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedFeralDruidDecisions,
  FERAL_DRUID_EXCLUSION_REASONS,
  type FeralDruidExclusionReason,
  type FeralDruidAnalysis,
} from "./observed-analysis.js";
import { FERAL_DRUID_ANALYZER_ID, FERAL_DRUID_DISPLAY_NAME, FERAL_DRUID_SPEC_ID } from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC vocabulary. Total by
 * construction; every target is already a member of `PUBLIC_EXCLUSION_REASONS`.
 */
export const FERAL_DRUID_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
  OUTSIDE_FIRST_SLICE: "OUTSIDE_SUPPORTED_SLICE",
} as const satisfies Record<FeralDruidExclusionReason, string>;

export type FeralDruidViewExclusionReason =
  (typeof FERAL_DRUID_EXCLUSION_VIEW_PROJECTION)[FeralDruidExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const FERAL_DRUID_VIEW_EXCLUSION_ORDER: readonly FeralDruidViewExclusionReason[] = Object.freeze(
  FERAL_DRUID_EXCLUSION_REASONS.map((reason) => FERAL_DRUID_EXCLUSION_VIEW_PROJECTION[reason]).filter(
    (reason, index, all) => all.indexOf(reason) === index,
  ),
);

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectFeralDruidExclusionTally(
  rows: readonly { readonly key: FeralDruidExclusionReason; readonly count: number }[],
): readonly { readonly key: FeralDruidViewExclusionReason; readonly count: number }[] {
  const merged = new Map<FeralDruidViewExclusionReason, number>();
  for (const row of rows) {
    const key = FERAL_DRUID_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: FeralDruidViewExclusionReason; count: number }[] = [];
  for (const key of FERAL_DRUID_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/** The projection shared code reads. Field for field the shape the other adapters produce. */
export function feralDruidObservedDecisionView(
  analysis: Extract<FeralDruidAnalysis, { status: "ANALYZED" }>,
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
      reason: FERAL_DRUID_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectFeralDruidExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this evaluator refuses to
 * judge. It is NOT published while the row is INTERNAL_ONLY; a reader of it must not mistake an
 * all-UNKNOWN surface for a clean review.
 */
export const FERAL_DRUID_LIMITS = Object.freeze({
  analysis: [
    "Feral Druid analysis compares observed global-cooldown decisions with pinned class/spec rotational authority,",
    "when the necessary state can be established. On every retained subject the first GCD query stays UNKNOWN: Prowl is open on an Incarnation build once it has been pressed, Tiger's Fury has no contract, and every finisher and builder sits behind the enemy count, which has no authority (ONB-S3). The pool line is modelled and can only be reached past that count, so no decision currently resolves.",
    "It does NOT evaluate defensive cooldowns, interrupts or survival, it does not score performance, and it does",
    "not read race, faction, gear use effects or consumables. It reconstructs no Energy and Combo Points between observations, no cooldown, no",
    "DoT on the target and no enemy count. UNKNOWN is expected here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Feral Druid cells count only observed global-cooldown decisions compared against pinned class/spec authority,",
    "and no decision currently resolves. They do NOT evaluate defensive cooldowns, interrupts or survival, and they do",
    "not score performance. All decisions remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Feral Druid specialization module (ONB-C1), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision.
 */
export const FERAL_DRUID_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: FERAL_DRUID_SPEC_ID,
    analyzerId: FERAL_DRUID_ANALYZER_ID,
    displayName: FERAL_DRUID_DISPLAY_NAME,
    wclClassName: "Druid",
    wclSpecName: "Feral",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: FERAL_DRUID_CAPABILITIES,
  authorityBindings: FERAL_DRUID_AUTHORITY_BINDINGS,
  limitsProse: FERAL_DRUID_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedFeralDruidDecisions({ ...input, authority }),
  observedDecisionView: feralDruidObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const FERAL_DRUID_REGISTRATION: AnalyzerRegistration = FERAL_DRUID_MODULE.registration;
