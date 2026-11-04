/**
 * Shadow Priest's analyzer registration (ONB-D2), INTERNAL_ONLY.
 *
 * THIS IS WHERE THE SPECIALIZATION STATES WHAT IT IS, AND THE ONLY PLACE. One row, owned by the
 * specialization, joining its identity, its exposure, the decision families it declares and the
 * evidence each consumes, the ONE authority it binds and the domain it binds it to, the facade
 * that runs it, and the projection of its result shared code may read.
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY. The public lookup and the identity table refuse it. No decision of it resolves on its
 * retained evidence: the root scan stops at `target_if` on `main[3] shadow_word_madness` or at the gate of `main[1]`, and the engine refuses at `cds[7] power_infusion`, off the GCD with no contract.
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN. `SIMC_APL_PRIEST_SHADOW` governs OFFENSIVE_ROTATION and nothing
 * else (`authority-bindings.ts`, `domains.ts`).
 *
 * THE VIEW. Internal exclusion reasons project onto the public vocabulary; everything else in the
 * payload stays inside it.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { SHADOW_AUTHORITY_BINDINGS, SHADOW_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedShadowPriestDecisions,
  SHADOW_EXCLUSION_REASONS,
  type ShadowExclusionReason,
  type ShadowPriestAnalysis,
} from "./observed-analysis.js";
import { SHADOW_PRIEST_ANALYZER_ID, SHADOW_PRIEST_DISPLAY_NAME, SHADOW_PRIEST_SPEC_ID } from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC vocabulary. Total by
 * construction; every target is already a member of `PUBLIC_EXCLUSION_REASONS`.
 */
export const SHADOW_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
} as const satisfies Record<ShadowExclusionReason, string>;

export type ShadowViewExclusionReason = (typeof SHADOW_EXCLUSION_VIEW_PROJECTION)[ShadowExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const SHADOW_VIEW_EXCLUSION_ORDER: readonly ShadowViewExclusionReason[] = Object.freeze(
  SHADOW_EXCLUSION_REASONS.map((reason) => SHADOW_EXCLUSION_VIEW_PROJECTION[reason]).filter(
    (reason, index, all) => all.indexOf(reason) === index,
  ),
);

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectShadowExclusionTally(
  rows: readonly { readonly key: ShadowExclusionReason; readonly count: number }[],
): readonly { readonly key: ShadowViewExclusionReason; readonly count: number }[] {
  const merged = new Map<ShadowViewExclusionReason, number>();
  for (const row of rows) {
    const key = SHADOW_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: ShadowViewExclusionReason; count: number }[] = [];
  for (const key of SHADOW_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/** The projection shared code reads. Field for field the shape the other adapters produce. */
export function shadowObservedDecisionView(
  analysis: Extract<ShadowPriestAnalysis, { status: "ANALYZED" }>,
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
      reason: SHADOW_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectShadowExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this evaluator refuses to
 * judge. It is NOT published while the row is INTERNAL_ONLY; a reader of it must not mistake an
 * all-UNKNOWN surface for a clean review.
 */
export const SHADOW_LIMITS = Object.freeze({
  analysis: [
    "Shadow Priest analysis compares observed global-cooldown decisions with pinned class/spec rotational authority,",
    "when the necessary state can be established, at the moment each cast began where that is established.",
    "No decision currently resolves.",
    "It does NOT evaluate defensive cooldowns, interrupts or survival, it does not score performance, and it does",
    "not read race, faction, gear use effects or consumables. It reconstructs no Insanity, no cooldown, no aura,",
    "no pet and no enemy count. UNKNOWN is expected here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Shadow Priest cells count only observed global-cooldown decisions compared against pinned class/spec authority,",
    "and no decision currently resolves. They do NOT evaluate defensive cooldowns, interrupts or survival, and they do",
    "not score performance. All decisions remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Shadow Priest specialization module (ONB-D2), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision.
 */
export const SHADOW_PRIEST_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: SHADOW_PRIEST_SPEC_ID,
    analyzerId: SHADOW_PRIEST_ANALYZER_ID,
    displayName: SHADOW_PRIEST_DISPLAY_NAME,
    wclClassName: "Priest",
    wclSpecName: "Shadow",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: SHADOW_CAPABILITIES,
  authorityBindings: SHADOW_AUTHORITY_BINDINGS,
  limitsProse: SHADOW_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedShadowPriestDecisions({ ...input, authority }),
  observedDecisionView: shadowObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const SHADOW_PRIEST_REGISTRATION: AnalyzerRegistration = SHADOW_PRIEST_MODULE.registration;
