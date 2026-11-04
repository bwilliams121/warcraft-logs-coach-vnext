/**
 * Subtlety Rogue's analyzer registration (ONB-A2), INTERNAL_ONLY.
 *
 * THIS IS WHERE THE SPECIALIZATION STATES WHAT IT IS, AND THE ONLY PLACE. One row, owned by the
 * specialization, joining its identity, its exposure, the decision families it declares and the
 * evidence each consumes, the ONE authority it binds and the domain it binds it to, the facade
 * that runs it, and the projection of its result shared code may read.
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY. The public lookup and the identity table refuse it. No retained capture can
 * validate it, so its promotion needs evidence first (ONB-EV, ONB-A2P).
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN. `SIMC_APL_ROGUE_SUBTLETY` governs OFFENSIVE_ROTATION and nothing
 * else (`authority-bindings.ts`, `domains.ts`).
 *
 * THE VIEW. Internal exclusion reasons project onto the public vocabulary; everything else in the
 * payload stays inside it.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { SUBTLETY_AUTHORITY_BINDINGS, SUBTLETY_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedSubtletyRogueDecisions,
  SUBTLETY_EXCLUSION_REASONS,
  type SubtletyExclusionReason,
  type SubtletyRogueAnalysis,
} from "./observed-analysis.js";
import { SUBTLETY_ROGUE_ANALYZER_ID, SUBTLETY_ROGUE_DISPLAY_NAME, SUBTLETY_ROGUE_SPEC_ID } from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC vocabulary. Total by
 * construction; every target is already a member of `PUBLIC_EXCLUSION_REASONS`.
 */
export const SUBTLETY_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
} as const satisfies Record<SubtletyExclusionReason, string>;

export type SubtletyViewExclusionReason =
  (typeof SUBTLETY_EXCLUSION_VIEW_PROJECTION)[SubtletyExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const SUBTLETY_VIEW_EXCLUSION_ORDER: readonly SubtletyViewExclusionReason[] = Object.freeze(
  SUBTLETY_EXCLUSION_REASONS.map((reason) => SUBTLETY_EXCLUSION_VIEW_PROJECTION[reason]).filter(
    (reason, index, all) => all.indexOf(reason) === index,
  ),
);

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectSubtletyExclusionTally(
  rows: readonly { readonly key: SubtletyExclusionReason; readonly count: number }[],
): readonly { readonly key: SubtletyViewExclusionReason; readonly count: number }[] {
  const merged = new Map<SubtletyViewExclusionReason, number>();
  for (const row of rows) {
    const key = SUBTLETY_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: SubtletyViewExclusionReason; count: number }[] = [];
  for (const key of SUBTLETY_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/** The projection shared code reads. Field for field the shape the other adapters produce. */
export function subtletyObservedDecisionView(
  analysis: Extract<SubtletyRogueAnalysis, { status: "ANALYZED" }>,
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
      reason: SUBTLETY_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectSubtletyExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this evaluator refuses to
 * judge. It is NOT published while the row is INTERNAL_ONLY; a reader of it must not mistake an
 * all-UNKNOWN surface for a clean review.
 */
export const SUBTLETY_LIMITS = Object.freeze({
  analysis: [
    "Subtlety Rogue analysis compares observed global-cooldown decisions with pinned class/spec rotational authority,",
    "when the necessary state can be established. Every decision first meets Stealth, an off-GCD action whose effect has no reviewed contract, and most of the list reads the enemy count, through variable.targets, which has no authority, so no decision currently resolves.",
    "It does NOT evaluate defensive cooldowns, interrupts or survival, it does not score performance, and it does",
    "not read race, faction, gear use effects or consumables. It reconstructs no Energy and Combo Points between observations, no cooldown, no",
    "aura and no enemy count. UNKNOWN is expected here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Subtlety Rogue cells count only observed global-cooldown decisions compared against pinned class/spec authority,",
    "and no decision currently resolves. They do NOT evaluate defensive cooldowns, interrupts or survival, and they do",
    "not score performance. All decisions remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Subtlety Rogue specialization module (ONB-A2), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision.
 */
export const SUBTLETY_ROGUE_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: SUBTLETY_ROGUE_SPEC_ID,
    analyzerId: SUBTLETY_ROGUE_ANALYZER_ID,
    displayName: SUBTLETY_ROGUE_DISPLAY_NAME,
    wclClassName: "Rogue",
    wclSpecName: "Subtlety",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: SUBTLETY_CAPABILITIES,
  authorityBindings: SUBTLETY_AUTHORITY_BINDINGS,
  limitsProse: SUBTLETY_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedSubtletyRogueDecisions({ ...input, authority }),
  observedDecisionView: subtletyObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const SUBTLETY_ROGUE_REGISTRATION: AnalyzerRegistration = SUBTLETY_ROGUE_MODULE.registration;
