/**
 * Protection Warrior's analyzer registration (ONB-A2), INTERNAL_ONLY.
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
 * THE AUTHORITY, BOUND TO ONE DOMAIN. `SIMC_APL_WARRIOR_PROTECTION` governs OFFENSIVE_ROTATION and nothing
 * else (`authority-bindings.ts`, `domains.ts`).
 *
 * THE VIEW. Internal exclusion reasons project onto the public vocabulary; everything else in the
 * payload stays inside it.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import {
  PROTECTION_WARRIOR_AUTHORITY_BINDINGS,
  PROTECTION_WARRIOR_CAPABILITIES,
} from "./authority-bindings.js";
import {
  analyzeObservedProtectionWarriorDecisions,
  PROTECTION_WARRIOR_EXCLUSION_REASONS,
  type ProtectionWarriorExclusionReason,
  type ProtectionWarriorAnalysis,
} from "./observed-analysis.js";
import {
  PROTECTION_WARRIOR_ANALYZER_ID,
  PROTECTION_WARRIOR_DISPLAY_NAME,
  PROTECTION_WARRIOR_SPEC_ID,
} from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC vocabulary. Total by
 * construction; every target is already a member of `PUBLIC_EXCLUSION_REASONS`.
 */
export const PROTECTION_WARRIOR_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
  OUTSIDE_FIRST_SLICE: "OUTSIDE_SUPPORTED_SLICE",
} as const satisfies Record<ProtectionWarriorExclusionReason, string>;

export type ProtectionWarriorViewExclusionReason =
  (typeof PROTECTION_WARRIOR_EXCLUSION_VIEW_PROJECTION)[ProtectionWarriorExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const PROTECTION_WARRIOR_VIEW_EXCLUSION_ORDER: readonly ProtectionWarriorViewExclusionReason[] =
  Object.freeze(
    PROTECTION_WARRIOR_EXCLUSION_REASONS.map(
      (reason) => PROTECTION_WARRIOR_EXCLUSION_VIEW_PROJECTION[reason],
    ).filter((reason, index, all) => all.indexOf(reason) === index),
  );

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectProtectionWarriorExclusionTally(
  rows: readonly { readonly key: ProtectionWarriorExclusionReason; readonly count: number }[],
): readonly { readonly key: ProtectionWarriorViewExclusionReason; readonly count: number }[] {
  const merged = new Map<ProtectionWarriorViewExclusionReason, number>();
  for (const row of rows) {
    const key = PROTECTION_WARRIOR_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: ProtectionWarriorViewExclusionReason; count: number }[] = [];
  for (const key of PROTECTION_WARRIOR_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/** The projection shared code reads. Field for field the shape the other adapters produce. */
export function protectionWarriorObservedDecisionView(
  analysis: Extract<ProtectionWarriorAnalysis, { status: "ANALYZED" }>,
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
      reason: PROTECTION_WARRIOR_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectProtectionWarriorExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this evaluator refuses to
 * judge. It is NOT published while the row is INTERNAL_ONLY; a reader of it must not mistake an
 * all-UNKNOWN surface for a clean review.
 */
export const PROTECTION_WARRIOR_LIMITS = Object.freeze({
  analysis: [
    "Protection Warrior analysis compares observed global-cooldown decisions with pinned class/spec rotational authority,",
    "when the necessary state can be established. Every decision first meets off-GCD actions whose effects have no reviewed contract, and a mitigation line whose condition exceeds what the evaluator enumerates, and the list dispatches behind them read the enemy count, which no action registers yet, so no decision currently resolves.",
    "It does NOT evaluate defensive cooldowns, active mitigation, interrupts or survival, it does not score performance, and it does",
    "not read race, faction, gear use effects or consumables. It reconstructs no Rage between observations, no cooldown, no",
    "aura and no enemy count. UNKNOWN is expected here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Protection Warrior cells count only observed global-cooldown decisions compared against pinned class/spec authority,",
    "and no decision currently resolves. They do NOT evaluate defensive cooldowns, active mitigation, interrupts or survival, and they do",
    "not score performance. All decisions remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Protection Warrior specialization module (ONB-A2), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision.
 */
export const PROTECTION_WARRIOR_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: PROTECTION_WARRIOR_SPEC_ID,
    analyzerId: PROTECTION_WARRIOR_ANALYZER_ID,
    displayName: PROTECTION_WARRIOR_DISPLAY_NAME,
    wclClassName: "Warrior",
    wclSpecName: "Protection",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: PROTECTION_WARRIOR_CAPABILITIES,
  authorityBindings: PROTECTION_WARRIOR_AUTHORITY_BINDINGS,
  limitsProse: PROTECTION_WARRIOR_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedProtectionWarriorDecisions({ ...input, authority }),
  observedDecisionView: protectionWarriorObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const PROTECTION_WARRIOR_REGISTRATION: AnalyzerRegistration = PROTECTION_WARRIOR_MODULE.registration;
