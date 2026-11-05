/**
 * Vengeance Demon Hunter's analyzer registration (ONB-X3), INTERNAL_ONLY.
 *
 * THIS IS WHERE THE SPECIALIZATION STATES WHAT IT IS, AND THE ONLY PLACE. One row, owned by the
 * specialization, joining its identity, its exposure, the decision families it declares and the
 * evidence each consumes, the ONE authority it binds and the domain it binds it to, the facade
 * that runs it, and the projection of its result shared code may read.
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY. The public lookup and the identity table refuse it. No decision of it resolves, and no retained capture holds one of its events, so its evidence gap is on ONB-EV (ONB-X3P).
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN. `SIMC_APL_DEMONHUNTER_VENGEANCE` governs OFFENSIVE_ROTATION and nothing
 * else (`authority-bindings.ts`, `domains.ts`).
 *
 * THE VIEW. Internal exclusion reasons project onto the public vocabulary; everything else in the
 * payload stays inside it.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import {
  VENGEANCE_DEMON_HUNTER_AUTHORITY_BINDINGS,
  VENGEANCE_DEMON_HUNTER_CAPABILITIES,
} from "./authority-bindings.js";
import {
  analyzeObservedVengeanceDemonHunterDecisions,
  VENGEANCE_DEMON_HUNTER_EXCLUSION_REASONS,
  type VengeanceDemonHunterExclusionReason,
  type VengeanceDemonHunterAnalysis,
} from "./observed-analysis.js";
import {
  VENGEANCE_DEMON_HUNTER_ANALYZER_ID,
  VENGEANCE_DEMON_HUNTER_DISPLAY_NAME,
  VENGEANCE_DEMON_HUNTER_SPEC_ID,
} from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC vocabulary. Total by
 * construction; every target is already a member of `PUBLIC_EXCLUSION_REASONS`.
 */
export const VENGEANCE_DEMON_HUNTER_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
  OUTSIDE_FIRST_SLICE: "OUTSIDE_SUPPORTED_SLICE",
} as const satisfies Record<VengeanceDemonHunterExclusionReason, string>;

export type VengeanceDemonHunterViewExclusionReason =
  (typeof VENGEANCE_DEMON_HUNTER_EXCLUSION_VIEW_PROJECTION)[VengeanceDemonHunterExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const VENGEANCE_DEMON_HUNTER_VIEW_EXCLUSION_ORDER: readonly VengeanceDemonHunterViewExclusionReason[] =
  Object.freeze(
    VENGEANCE_DEMON_HUNTER_EXCLUSION_REASONS.map(
      (reason) => VENGEANCE_DEMON_HUNTER_EXCLUSION_VIEW_PROJECTION[reason],
    ).filter((reason, index, all) => all.indexOf(reason) === index),
  );

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectVengeanceDemonHunterExclusionTally(
  rows: readonly { readonly key: VengeanceDemonHunterExclusionReason; readonly count: number }[],
): readonly { readonly key: VengeanceDemonHunterViewExclusionReason; readonly count: number }[] {
  const merged = new Map<VengeanceDemonHunterViewExclusionReason, number>();
  for (const row of rows) {
    const key = VENGEANCE_DEMON_HUNTER_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: VengeanceDemonHunterViewExclusionReason; count: number }[] = [];
  for (const key of VENGEANCE_DEMON_HUNTER_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/** The projection shared code reads. Field for field the shape the other adapters produce. */
export function vengeanceDemonHunterObservedDecisionView(
  analysis: Extract<VengeanceDemonHunterAnalysis, { status: "ANALYZED" }>,
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
      reason: VENGEANCE_DEMON_HUNTER_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectVengeanceDemonHunterExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this evaluator refuses to
 * judge. It is NOT published while the row is INTERNAL_ONLY; a reader of it must not mistake an
 * all-UNKNOWN surface for a clean review.
 */
export const VENGEANCE_DEMON_HUNTER_LIMITS = Object.freeze({
  analysis: [
    "Vengeance Demon Hunter analysis compares observed global-cooldown decisions with pinned class/spec rotational authority,",
    "when the necessary state can be established. Every build refuses first at the swing's entry, whose readiness is unobserved, with Disrupt behind it, which reads an enemy cast nothing binds. The Aldrachi Reaver list reads soul fragments, charges and the enemy count, and its time-to-next-glaive variables use a division that does not parse, so no decision currently resolves.",
    "It does NOT evaluate active mitigation, defensive cooldowns, self healing, interrupts or survival, it does not score performance, and it does",
    "not read race, faction, gear use effects or consumables. It reconstructs no Fury between observations, no soul fragment, no cooldown, no",
    "aura and no enemy count. UNKNOWN is expected here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Vengeance Demon Hunter cells count only observed global-cooldown decisions compared against pinned class/spec authority,",
    "and no decision currently resolves. They do NOT evaluate active mitigation, defensive cooldowns, self healing, interrupts or survival, and they do",
    "not score performance. All decisions remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Vengeance Demon Hunter specialization module (ONB-X3), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision.
 */
export const VENGEANCE_DEMON_HUNTER_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: VENGEANCE_DEMON_HUNTER_SPEC_ID,
    analyzerId: VENGEANCE_DEMON_HUNTER_ANALYZER_ID,
    displayName: VENGEANCE_DEMON_HUNTER_DISPLAY_NAME,
    wclClassName: "DemonHunter",
    wclSpecName: "Vengeance",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: VENGEANCE_DEMON_HUNTER_CAPABILITIES,
  authorityBindings: VENGEANCE_DEMON_HUNTER_AUTHORITY_BINDINGS,
  limitsProse: VENGEANCE_DEMON_HUNTER_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedVengeanceDemonHunterDecisions({ ...input, authority }),
  observedDecisionView: vengeanceDemonHunterObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const VENGEANCE_DEMON_HUNTER_REGISTRATION: AnalyzerRegistration =
  VENGEANCE_DEMON_HUNTER_MODULE.registration;
