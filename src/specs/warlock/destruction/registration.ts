/**
 * Destruction Warlock's analyzer registration (ONB-D1), INTERNAL_ONLY.
 *
 * THIS IS WHERE THE SPECIALIZATION STATES WHAT IT IS, AND THE ONLY PLACE. One row, owned by the
 * specialization, joining its identity, its exposure, the decision families it declares and the
 * evidence each consumes, the ONE authority it binds and the domain it binds it to, the facade
 * that runs it, and the projection of its result shared code may read.
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY. The public lookup and the identity table refuse it. On its retained evidence 4 of 220
 * decisions MATCH, all one token, so it cannot pass the rotational gates (agent/architecture.md "ONB-S3R").
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN. `SIMC_APL_WARLOCK_DESTRUCTION` governs OFFENSIVE_ROTATION and nothing
 * else (`authority-bindings.ts`, `domains.ts`).
 *
 * THE VIEW. Internal exclusion reasons project onto the public vocabulary; everything else in the
 * payload stays inside it.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { simcProfileFactsField } from "../../../findings/simc-profile-fallback.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { DESTRUCTION_AUTHORITY_BINDINGS, DESTRUCTION_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedDestructionWarlockDecisions,
  DESTRUCTION_EXCLUSION_REASONS,
  type DestructionExclusionReason,
  type DestructionWarlockAnalysis,
} from "./observed-analysis.js";
import {
  DESTRUCTION_WARLOCK_ANALYZER_ID,
  DESTRUCTION_WARLOCK_DISPLAY_NAME,
  DESTRUCTION_WARLOCK_SPEC_ID,
} from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC vocabulary. Total by
 * construction; every target is already a member of `PUBLIC_EXCLUSION_REASONS`.
 */
export const DESTRUCTION_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
} as const satisfies Record<DestructionExclusionReason, string>;

export type DestructionViewExclusionReason =
  (typeof DESTRUCTION_EXCLUSION_VIEW_PROJECTION)[DestructionExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const DESTRUCTION_VIEW_EXCLUSION_ORDER: readonly DestructionViewExclusionReason[] = Object.freeze(
  DESTRUCTION_EXCLUSION_REASONS.map((reason) => DESTRUCTION_EXCLUSION_VIEW_PROJECTION[reason]).filter(
    (reason, index, all) => all.indexOf(reason) === index,
  ),
);

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectDestructionExclusionTally(
  rows: readonly { readonly key: DestructionExclusionReason; readonly count: number }[],
): readonly { readonly key: DestructionViewExclusionReason; readonly count: number }[] {
  const merged = new Map<DestructionViewExclusionReason, number>();
  for (const row of rows) {
    const key = DESTRUCTION_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: DestructionViewExclusionReason; count: number }[] = [];
  for (const key of DESTRUCTION_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/** The projection shared code reads. Field for field the shape the other adapters produce. */
export function destructionObservedDecisionView(
  analysis: Extract<DestructionWarlockAnalysis, { status: "ANALYZED" }>,
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
      reason: DESTRUCTION_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectDestructionExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this evaluator refuses to
 * judge. It is NOT published while the row is INTERNAL_ONLY; a reader of it must not mistake an
 * all-UNKNOWN surface for a clean review.
 */
export const DESTRUCTION_LIMITS = Object.freeze({
  analysis: [
    "Destruction Warlock analysis compares observed global-cooldown decisions with pinned class/spec rotational authority,",
    "when the necessary state can be established, at the moment each cast began where that is established. Every decision",
    "meets a list that reads the enemy count before any single-target line, and only a press of the first area line resolves.",
    "It does NOT evaluate defensive cooldowns, interrupts or survival, it does not score performance, and it does",
    "not read race, faction, gear use effects or consumables. It reconstructs no Soul Shards, no cooldown, no aura,",
    "and no pet, and the enemy count is a proven lower bound, or the pinned SimC profile's on a proven build. UNKNOWN is expected here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Destruction Warlock cells count only observed global-cooldown decisions compared against pinned class/spec authority,",
    "and only a press of the first area line resolves. They do NOT evaluate defensive cooldowns, interrupts or survival, and they do",
    "not score performance. Nearly every decision remains UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Destruction Warlock specialization module (ONB-D1), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision.
 */
export const DESTRUCTION_WARLOCK_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: DESTRUCTION_WARLOCK_SPEC_ID,
    analyzerId: DESTRUCTION_WARLOCK_ANALYZER_ID,
    displayName: DESTRUCTION_WARLOCK_DISPLAY_NAME,
    wclClassName: "Warlock",
    wclSpecName: "Destruction",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: DESTRUCTION_CAPABILITIES,
  authorityBindings: DESTRUCTION_AUTHORITY_BINDINGS,
  limitsProse: DESTRUCTION_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedDestructionWarlockDecisions({ ...input, authority }),
  observedDecisionView: destructionObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const DESTRUCTION_WARLOCK_REGISTRATION: AnalyzerRegistration = DESTRUCTION_WARLOCK_MODULE.registration;
