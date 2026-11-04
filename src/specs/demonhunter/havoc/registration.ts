/**
 * Havoc Demon Hunter's analyzer registration (ONB-A1; PUBLIC since ONB-A1P).
 *
 * THIS IS WHERE HAVOC STATES WHAT IT IS, AND THE ONLY PLACE. One row, owned by the
 * specialization, joining its identity, its exposure, the four decision families it
 * declares and the evidence each consumes, the ONE authority it binds and the domain
 * it binds it to, the facade that runs it, and the projection of its result shared
 * code may read. `src/services/analyzer-registry.ts` lists this row and reads nothing
 * else from this directory.
 *
 * PUBLIC since ONB-A1P, by the same five-site edit as every earlier promotion: the
 * application service, raid-night orchestration, REST and MCP select it for a Demon
 * Hunter whose stated specialization is Havoc. Its answers are validated for Aldrachi
 * Reaver builds only (`supported-profile.ts`); another build is refused, not judged.
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN. `SIMC_APL_DEMONHUNTER_HAVOC` governs
 * OFFENSIVE_ROTATION and nothing else (`authority-bindings.ts`, `domains.ts`).
 *
 * THE VIEW. Two internal exclusion reasons are projected and the rest carried
 * verbatim: `MELEE_SWING` to `NON_GCD_ACTION`, and `OUTSIDE_FIRST_SLICE` to the public
 * `OUTSIDE_SUPPORTED_SLICE`. Everything else in the payload stays inside it.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { HAVOC_AUTHORITY_BINDINGS, HAVOC_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedHavocDemonHunterDecisions,
  HAVOC_EXCLUSION_REASONS,
  type HavocExclusionReason,
  type HavocDemonHunterAnalysis,
} from "./observed-analysis.js";
import {
  HAVOC_DEMON_HUNTER_ANALYZER_ID,
  HAVOC_DEMON_HUNTER_DISPLAY_NAME,
  HAVOC_DEMON_HUNTER_SPEC_ID,
} from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC
 * vocabulary. Total by construction; every target is already a member of
 * `PUBLIC_EXCLUSION_REASONS`.
 */
export const HAVOC_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
  OUTSIDE_FIRST_SLICE: "OUTSIDE_SUPPORTED_SLICE",
} as const satisfies Record<HavocExclusionReason, string>;

export type HavocViewExclusionReason = (typeof HAVOC_EXCLUSION_VIEW_PROJECTION)[HavocExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const HAVOC_VIEW_EXCLUSION_ORDER: readonly HavocViewExclusionReason[] = Object.freeze(
  HAVOC_EXCLUSION_REASONS.map((reason) => HAVOC_EXCLUSION_VIEW_PROJECTION[reason]).filter(
    (reason, index, all) => all.indexOf(reason) === index,
  ),
);

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectHavocExclusionTally(
  rows: readonly { readonly key: HavocExclusionReason; readonly count: number }[],
): readonly { readonly key: HavocViewExclusionReason; readonly count: number }[] {
  const merged = new Map<HavocViewExclusionReason, number>();
  for (const row of rows) {
    const key = HAVOC_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: HavocViewExclusionReason; count: number }[] = [];
  for (const key of HAVOC_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/**
 * The projection shared code reads. Field for field the shape the other
 * adapters produce; the measurement fields stay INSIDE the payload.
 */
export function havocObservedDecisionView(
  analysis: Extract<HavocDemonHunterAnalysis, { status: "ANALYZED" }>,
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
      reason: HAVOC_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectHavocExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this evaluator
 * refuses to judge, and PUBLISHED since ONB-A1P: the MCP tool descriptions compose it
 * through `publicSpecializationDescriptions`, by the same mechanism as every other
 * public specialization. It names the validated hero tree and how narrow the slice is,
 * so a reader cannot mistake a one-decision surface for a rotation review, or an
 * UNKNOWN for a fault.
 */
export const HAVOC_LIMITS = Object.freeze({
  analysis: [
    "Havoc Demon Hunter analysis evaluates observed global-cooldown decisions against pinned class/spec rotational",
    "authority, when the necessary state can be established. It is VALIDATED FOR THE ALDRACHI REAVER HERO TREE ONLY: a",
    "build whose observed talent tree resolves to Fel-Scarred, to no hero tree, or to more than one is refused rather",
    "than judged. On current evidence what it can decide is the Reaver's Glaive priority and little else, so it is a",
    "narrow check and not a rotation review. Throw Glaive and The Hunt are reported as excluded",
    "OUTSIDE_SUPPORTED_SLICE: observed, not judged. It does NOT evaluate defensive cooldowns, interrupts or survival, it",
    "does not score performance, and it does not read race, faction, gear use effects or consumables. It does not",
    "reconstruct Fury between observations, Eye Beam, Blade Dance, Essence Break or The Hunt cooldowns, or the enemy",
    "count. Decisions needing unproven state remain UNKNOWN, including most decisions in most fights. UNKNOWN is expected",
    "here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Havoc Demon Hunter cells count only observed global-cooldown decisions compared against pinned class/spec",
    "authority, and only for Aldrachi Reaver builds; Throw Glaive and The Hunt are excluded as OUTSIDE_SUPPORTED_SLICE,",
    "not judged. They do NOT evaluate defensive cooldowns, interrupts or survival, and they do not score performance.",
    "Most decisions typically remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Havoc Demon Hunter specialization module (ONB-A1), PUBLIC since ONB-A1P.
 *
 * `supplementalAnalyses` is EMPTY by decision. The WCL identity strings are the ones
 * the committed b1Pm fight-48 context reports for actor 18 (`subType` DemonHunter,
 * `friendlySpecs` Havoc).
 */
export const HAVOC_DEMON_HUNTER_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: HAVOC_DEMON_HUNTER_SPEC_ID,
    analyzerId: HAVOC_DEMON_HUNTER_ANALYZER_ID,
    displayName: HAVOC_DEMON_HUNTER_DISPLAY_NAME,
    wclClassName: "DemonHunter",
    wclSpecName: "Havoc",
  },
  exposure: "PUBLIC",
  capabilities: HAVOC_CAPABILITIES,
  authorityBindings: HAVOC_AUTHORITY_BINDINGS,
  limitsProse: HAVOC_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedHavocDemonHunterDecisions({ ...input, authority }),
  observedDecisionView: havocObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const HAVOC_DEMON_HUNTER_REGISTRATION: AnalyzerRegistration = HAVOC_DEMON_HUNTER_MODULE.registration;
