/**
 * Unholy Death Knight's analyzer registration (ONB-X5), INTERNAL_ONLY.
 *
 * THIS IS WHERE THE SPECIALIZATION STATES WHAT IT IS, AND THE ONLY PLACE. One row, owned by the
 * specialization, joining its identity, its exposure, the decision families it declares and the
 * evidence each consumes, the ONE authority it binds and the domain it binds it to, the facade
 * that runs it, and the projection of its result shared code may read.
 * `src/services/analyzer-registry.ts` lists this row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY. The public lookup and the identity table refuse it. No decision of it resolves: all 147 eligible decisions of its one retained subject stay UNKNOWN, refused at `default[0] auto_attack` with Outbreak, Army of the Dead and Dark Transformation open behind it.
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN. `SIMC_APL_DEATHKNIGHT_UNHOLY` governs OFFENSIVE_ROTATION and nothing
 * else (`authority-bindings.ts`, `domains.ts`).
 *
 * THE VIEW. Internal exclusion reasons project onto the public vocabulary; everything else in the
 * payload stays inside it.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import {
  UNHOLY_DEATH_KNIGHT_AUTHORITY_BINDINGS,
  UNHOLY_DEATH_KNIGHT_CAPABILITIES,
} from "./authority-bindings.js";
import {
  analyzeObservedUnholyDeathKnightDecisions,
  UNHOLY_DEATH_KNIGHT_EXCLUSION_REASONS,
  type UnholyDeathKnightExclusionReason,
  type UnholyDeathKnightAnalysis,
} from "./observed-analysis.js";
import {
  UNHOLY_DEATH_KNIGHT_ANALYZER_ID,
  UNHOLY_DEATH_KNIGHT_DISPLAY_NAME,
  UNHOLY_DEATH_KNIGHT_SPEC_ID,
} from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC vocabulary. Total by
 * construction; every target is already a member of `PUBLIC_EXCLUSION_REASONS`.
 */
export const UNHOLY_DEATH_KNIGHT_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
} as const satisfies Record<UnholyDeathKnightExclusionReason, string>;

export type UnholyDeathKnightViewExclusionReason =
  (typeof UNHOLY_DEATH_KNIGHT_EXCLUSION_VIEW_PROJECTION)[UnholyDeathKnightExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const UNHOLY_DEATH_KNIGHT_VIEW_EXCLUSION_ORDER: readonly UnholyDeathKnightViewExclusionReason[] =
  Object.freeze(
    UNHOLY_DEATH_KNIGHT_EXCLUSION_REASONS.map(
      (reason) => UNHOLY_DEATH_KNIGHT_EXCLUSION_VIEW_PROJECTION[reason],
    ).filter((reason, index, all) => all.indexOf(reason) === index),
  );

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectUnholyDeathKnightExclusionTally(
  rows: readonly { readonly key: UnholyDeathKnightExclusionReason; readonly count: number }[],
): readonly { readonly key: UnholyDeathKnightViewExclusionReason; readonly count: number }[] {
  const merged = new Map<UnholyDeathKnightViewExclusionReason, number>();
  for (const row of rows) {
    const key = UNHOLY_DEATH_KNIGHT_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: UnholyDeathKnightViewExclusionReason; count: number }[] = [];
  for (const key of UNHOLY_DEATH_KNIGHT_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/** The projection shared code reads. Field for field the shape the other adapters produce. */
export function unholyDeathKnightObservedDecisionView(
  analysis: Extract<UnholyDeathKnightAnalysis, { status: "ANALYZED" }>,
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
      reason: UNHOLY_DEATH_KNIGHT_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectUnholyDeathKnightExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this evaluator refuses to
 * judge. It is NOT published while the row is INTERNAL_ONLY; a reader of it must not mistake an
 * all-UNKNOWN surface for a clean review.
 */
export const UNHOLY_DEATH_KNIGHT_LIMITS = Object.freeze({
  analysis: [
    "Unholy Death Knight analysis compares observed global-cooldown decisions with pinned class/spec rotational authority,",
    "when the necessary state can be established. Every decision first meets the swing's entry, whose readiness is unobserved, then cooldown lines that read plagues, simulated raid events and the enemy count, and behind them a list dispatch on the enemy count, which has no authority, so no decision currently resolves.",
    "It does NOT evaluate defensive cooldowns, interrupts or survival, it does not score performance, and it does",
    "not read race, faction, gear use effects or consumables. It reconstructs no Runes or Runic Power between observations, no cooldown, no",
    "aura and no enemy count. Pet presence comes only from summons it can attribute, and no pet is proven up or gone today. UNKNOWN is expected here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Unholy Death Knight cells count only observed global-cooldown decisions compared against pinned class/spec authority,",
    "and no decision currently resolves. They do NOT evaluate defensive cooldowns, interrupts or survival, and they do",
    "not score performance. All decisions remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Unholy Death Knight specialization module (ONB-X5), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision.
 */
export const UNHOLY_DEATH_KNIGHT_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: UNHOLY_DEATH_KNIGHT_SPEC_ID,
    analyzerId: UNHOLY_DEATH_KNIGHT_ANALYZER_ID,
    displayName: UNHOLY_DEATH_KNIGHT_DISPLAY_NAME,
    wclClassName: "DeathKnight",
    wclSpecName: "Unholy",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: UNHOLY_DEATH_KNIGHT_CAPABILITIES,
  authorityBindings: UNHOLY_DEATH_KNIGHT_AUTHORITY_BINDINGS,
  limitsProse: UNHOLY_DEATH_KNIGHT_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedUnholyDeathKnightDecisions({ ...input, authority }),
  observedDecisionView: unholyDeathKnightObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const UNHOLY_DEATH_KNIGHT_REGISTRATION: AnalyzerRegistration = UNHOLY_DEATH_KNIGHT_MODULE.registration;
