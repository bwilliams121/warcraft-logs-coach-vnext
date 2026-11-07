/**
 * Enhancement Shaman's analyzer registration (ONB-B2), INTERNAL_ONLY.
 *
 * THIS IS WHERE THE SPECIALIZATION STATES WHAT IT IS, AND THE ONLY PLACE. One row, owned by the
 * specialization, joining its identity, its exposure, the decision families it declares and the
 * evidence each consumes, the ONE authority it binds and the domain it binds it to, the facade
 * that runs it, and the projection of its result shared code may read.
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY. The public lookup and the identity table refuse it. No retained capture can validate it, so its promotion needs evidence first (ONB-EV, ONB-B2P).
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN. `SIMC_APL_SHAMAN_ENHANCEMENT` governs OFFENSIVE_ROTATION and nothing
 * else (`authority-bindings.ts`, `domains.ts`).
 *
 * THE VIEW. Internal exclusion reasons project onto the public vocabulary; everything else in the
 * payload stays inside it.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { simcProfileFactsField } from "../../../findings/simc-profile-fallback.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import {
  ENHANCEMENT_SHAMAN_AUTHORITY_BINDINGS,
  ENHANCEMENT_SHAMAN_CAPABILITIES,
} from "./authority-bindings.js";
import {
  analyzeObservedEnhancementShamanDecisions,
  ENHANCEMENT_SHAMAN_EXCLUSION_REASONS,
  type EnhancementShamanExclusionReason,
  type EnhancementShamanAnalysis,
} from "./observed-analysis.js";
import {
  ENHANCEMENT_SHAMAN_ANALYZER_ID,
  ENHANCEMENT_SHAMAN_DISPLAY_NAME,
  ENHANCEMENT_SHAMAN_SPEC_ID,
} from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC vocabulary. Total by
 * construction; every target is already a member of `PUBLIC_EXCLUSION_REASONS`.
 */
export const ENHANCEMENT_SHAMAN_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
  OUTSIDE_FIRST_SLICE: "OUTSIDE_SUPPORTED_SLICE",
} as const satisfies Record<EnhancementShamanExclusionReason, string>;

export type EnhancementShamanViewExclusionReason =
  (typeof ENHANCEMENT_SHAMAN_EXCLUSION_VIEW_PROJECTION)[EnhancementShamanExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const ENHANCEMENT_SHAMAN_VIEW_EXCLUSION_ORDER: readonly EnhancementShamanViewExclusionReason[] =
  Object.freeze(
    ENHANCEMENT_SHAMAN_EXCLUSION_REASONS.map(
      (reason) => ENHANCEMENT_SHAMAN_EXCLUSION_VIEW_PROJECTION[reason],
    ).filter((reason, index, all) => all.indexOf(reason) === index),
  );

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectEnhancementShamanExclusionTally(
  rows: readonly { readonly key: EnhancementShamanExclusionReason; readonly count: number }[],
): readonly { readonly key: EnhancementShamanViewExclusionReason; readonly count: number }[] {
  const merged = new Map<EnhancementShamanViewExclusionReason, number>();
  for (const row of rows) {
    const key = ENHANCEMENT_SHAMAN_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: EnhancementShamanViewExclusionReason; count: number }[] = [];
  for (const key of ENHANCEMENT_SHAMAN_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/** The projection shared code reads. Field for field the shape the other adapters produce. */
export function enhancementShamanObservedDecisionView(
  analysis: Extract<EnhancementShamanAnalysis, { status: "ANALYZED" }>,
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
      reason: ENHANCEMENT_SHAMAN_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectEnhancementShamanExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this evaluator refuses to
 * judge. It is NOT published while the row is INTERNAL_ONLY; a reader of it must not mistake an
 * all-UNKNOWN surface for a clean review.
 */
export const ENHANCEMENT_SHAMAN_LIMITS = Object.freeze({
  analysis: [
    "Enhancement Shaman analysis compares observed global-cooldown decisions with pinned class/spec rotational authority,",
    "when the necessary state can be established. Every decision first meets Bloodlust, an off-GCD action on a line timer no log can read and with no reviewed contract, and every list behind it is gated on the enemy count, which events can only bound from below, so no decision currently resolves.",
    "It does NOT evaluate defensive cooldowns, interrupts or survival, it does not score performance, and it does",
    "not read race, faction, gear use effects or consumables. It reconstructs no Maelstrom Weapon stack, no cooldown, no",
    "aura and no enemy count of its own. UNKNOWN is expected here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Enhancement Shaman cells count only observed global-cooldown decisions compared against pinned class/spec authority,",
    "and no decision currently resolves. They do NOT evaluate defensive cooldowns, interrupts or survival, and they do",
    "not score performance. All decisions remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Enhancement Shaman specialization module (ONB-B2), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision.
 */
export const ENHANCEMENT_SHAMAN_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: ENHANCEMENT_SHAMAN_SPEC_ID,
    analyzerId: ENHANCEMENT_SHAMAN_ANALYZER_ID,
    displayName: ENHANCEMENT_SHAMAN_DISPLAY_NAME,
    wclClassName: "Shaman",
    wclSpecName: "Enhancement",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: ENHANCEMENT_SHAMAN_CAPABILITIES,
  authorityBindings: ENHANCEMENT_SHAMAN_AUTHORITY_BINDINGS,
  limitsProse: ENHANCEMENT_SHAMAN_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedEnhancementShamanDecisions({ ...input, authority }),
  observedDecisionView: enhancementShamanObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const ENHANCEMENT_SHAMAN_REGISTRATION: AnalyzerRegistration = ENHANCEMENT_SHAMAN_MODULE.registration;
