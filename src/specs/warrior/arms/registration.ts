/**
 * Arms Warrior's analyzer registration (ONB-B1), INTERNAL_ONLY.
 *
 * THIS IS WHERE THE SPECIALIZATION STATES WHAT IT IS, AND THE ONLY PLACE. One row, owned by the
 * specialization, joining its identity, its exposure, the decision families it declares and the
 * evidence each consumes, the ONE authority it binds and the domain it binds it to, the facade
 * that runs it, and the projection of its result shared code may read.
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY. The public lookup and the identity table refuse it. No decision of it resolves,
 * because every GCD action of its list sits behind the enemy count (ONB-S3, ONB-B1P).
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN. `SIMC_APL_WARRIOR_ARMS` governs OFFENSIVE_ROTATION and nothing
 * else (`authority-bindings.ts`, `domains.ts`).
 *
 * THE VIEW. Internal exclusion reasons project onto the public vocabulary; everything else in the
 * payload stays inside it.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { simcProfileFactsField } from "../../../findings/simc-profile-fallback.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { ARMS_WARRIOR_AUTHORITY_BINDINGS, ARMS_WARRIOR_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedArmsWarriorDecisions,
  ARMS_WARRIOR_EXCLUSION_REASONS,
  type ArmsWarriorExclusionReason,
  type ArmsWarriorAnalysis,
} from "./observed-analysis.js";
import { ARMS_WARRIOR_ANALYZER_ID, ARMS_WARRIOR_DISPLAY_NAME, ARMS_WARRIOR_SPEC_ID } from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC vocabulary. Total by
 * construction; every target is already a member of `PUBLIC_EXCLUSION_REASONS`.
 */
export const ARMS_WARRIOR_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
  OUTSIDE_FIRST_SLICE: "OUTSIDE_SUPPORTED_SLICE",
} as const satisfies Record<ArmsWarriorExclusionReason, string>;

export type ArmsWarriorViewExclusionReason =
  (typeof ARMS_WARRIOR_EXCLUSION_VIEW_PROJECTION)[ArmsWarriorExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const ARMS_WARRIOR_VIEW_EXCLUSION_ORDER: readonly ArmsWarriorViewExclusionReason[] = Object.freeze(
  ARMS_WARRIOR_EXCLUSION_REASONS.map((reason) => ARMS_WARRIOR_EXCLUSION_VIEW_PROJECTION[reason]).filter(
    (reason, index, all) => all.indexOf(reason) === index,
  ),
);

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectArmsWarriorExclusionTally(
  rows: readonly { readonly key: ArmsWarriorExclusionReason; readonly count: number }[],
): readonly { readonly key: ArmsWarriorViewExclusionReason; readonly count: number }[] {
  const merged = new Map<ArmsWarriorViewExclusionReason, number>();
  for (const row of rows) {
    const key = ARMS_WARRIOR_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: ArmsWarriorViewExclusionReason; count: number }[] = [];
  for (const key of ARMS_WARRIOR_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/** The projection shared code reads. Field for field the shape the other adapters produce. */
export function armsWarriorObservedDecisionView(
  analysis: Extract<ArmsWarriorAnalysis, { status: "ANALYZED" }>,
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
      reason: ARMS_WARRIOR_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectArmsWarriorExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this evaluator refuses to
 * judge. It is NOT published while the row is INTERNAL_ONLY; a reader of it must not mistake an
 * all-UNKNOWN surface for a clean review.
 */
export const ARMS_WARRIOR_LIMITS = Object.freeze({
  analysis: [
    "Arms Warrior analysis compares observed global-cooldown decisions with pinned class/spec rotational authority,",
    "when the necessary state can be established. Every decision first meets Charge, an off-GCD action whose effect has no reviewed contract, and then a hero-talent list dispatch gated on the enemy count, which events can only bound from below, so no decision currently resolves.",
    "It does NOT evaluate defensive cooldowns, interrupts or survival, it does not score performance, and it does",
    "not read race, faction, gear use effects or consumables. It reconstructs no Rage between observations, no cooldown, no",
    "aura and no enemy count of its own. UNKNOWN is expected here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Arms Warrior cells count only observed global-cooldown decisions compared against pinned class/spec authority,",
    "and no decision currently resolves. They do NOT evaluate defensive cooldowns, interrupts or survival, and they do",
    "not score performance. All decisions remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Arms Warrior specialization module (ONB-B1), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision.
 */
export const ARMS_WARRIOR_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: ARMS_WARRIOR_SPEC_ID,
    analyzerId: ARMS_WARRIOR_ANALYZER_ID,
    displayName: ARMS_WARRIOR_DISPLAY_NAME,
    wclClassName: "Warrior",
    wclSpecName: "Arms",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: ARMS_WARRIOR_CAPABILITIES,
  authorityBindings: ARMS_WARRIOR_AUTHORITY_BINDINGS,
  limitsProse: ARMS_WARRIOR_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedArmsWarriorDecisions({ ...input, authority }),
  observedDecisionView: armsWarriorObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const ARMS_WARRIOR_REGISTRATION: AnalyzerRegistration = ARMS_WARRIOR_MODULE.registration;
