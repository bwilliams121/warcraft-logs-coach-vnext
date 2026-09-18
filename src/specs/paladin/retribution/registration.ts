/**
 * Retribution Paladin's analyzer registration (M11-A4).
 *
 * THIS IS WHERE RETRIBUTION STATES WHAT IT IS, AND THE ONLY PLACE.
 *
 * One row, owned by the specialization, joining the facts that must never
 * drift apart: its identity, its exposure, the four decision families it
 * declares and the evidence each consumes, the ONE authority it binds and
 * the domain it binds it to, the facade that runs it, and the projection of
 * its result shared code may read. `src/services/analyzer-registry.ts` lists
 * this row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY, ON PURPOSE
 *
 * The row is in the production catalog with INTERNAL_ONLY exposure: the
 * application service, raid-night orchestration, REST and MCP never select
 * it, `paladin/retribution` stays outside `PUBLIC_SPEC_IDS`, the public
 * contract's `specId` enum and the public identity table, and a public
 * request for a Retribution Paladin still receives SPEC_NOT_SUPPORTED. The
 * `satisfies InternalOnlySpecId` on `spec.ts` is the compile-time side of
 * that: promoting the id without touching every one of the five public
 * sites fails to build. Promotion is a SEPARATE, reviewed milestone with its
 * own evidence gate; nothing in this file does it.
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN
 *
 * `SIMC_APL_PALADIN_RETRIBUTION` governs OFFENSIVE_ROTATION and nothing
 * else. Three more domains are declared and bound to nothing; see
 * `authority-bindings.ts`.
 *
 * THE VIEW, AND WHAT IT KEEPS INTERNAL
 *
 * The registration must supply an observed-decision view for shared code.
 * Retribution's carries every internal exclusion reason VERBATIM except the
 * one Protection also projects (`MELEE_SWING` → `NON_GCD_ACTION`, for the
 * reason recorded there). `OUTSIDE_FIRST_SLICE` is NOT a public reason: it
 * has no name in the public schema, and giving it one is a schema decision
 * this milestone does not take. While the module is INTERNAL_ONLY the view
 * is read by nothing public; a future promotion would first have to decide
 * that projection, and a contract test pins that today the reason never
 * reaches a public document.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { RETRIBUTION_AUTHORITY_BINDINGS, RETRIBUTION_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedRetributionPaladinDecisions,
  RETRIBUTION_EXCLUSION_REASONS,
  type RetributionExclusionReason,
  type RetributionPaladinAnalysis,
} from "./observed-analysis.js";
import {
  RETRIBUTION_PALADIN_ANALYZER_ID,
  RETRIBUTION_PALADIN_DISPLAY_NAME,
  RETRIBUTION_PALADIN_SPEC_ID,
} from "./spec.js";

/**
 * The view projection of every internal exclusion reason. Total by
 * construction. `OUTSIDE_FIRST_SLICE` is carried verbatim and is NOT a
 * public schema reason — see the module header.
 */
export const RETRIBUTION_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
  OUTSIDE_FIRST_SLICE: "OUTSIDE_FIRST_SLICE",
} as const satisfies Record<RetributionExclusionReason, string>;

export type RetributionViewExclusionReason =
  (typeof RETRIBUTION_EXCLUSION_VIEW_PROJECTION)[RetributionExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const RETRIBUTION_VIEW_EXCLUSION_ORDER: readonly RetributionViewExclusionReason[] = Object.freeze(
  RETRIBUTION_EXCLUSION_REASONS.map((reason) => RETRIBUTION_EXCLUSION_VIEW_PROJECTION[reason]).filter(
    (reason, index, all) => all.indexOf(reason) === index,
  ),
);

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectRetributionExclusionTally(
  rows: readonly { readonly key: RetributionExclusionReason; readonly count: number }[],
): readonly { readonly key: RetributionViewExclusionReason; readonly count: number }[] {
  const merged = new Map<RetributionViewExclusionReason, number>();
  for (const row of rows) {
    const key = RETRIBUTION_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: RetributionViewExclusionReason; count: number }[] = [];
  for (const key of RETRIBUTION_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/**
 * The projection shared code reads. Field for field the shape the other
 * adapters produce; the domain results, the Holy Power observations, the
 * build resolution and the resolver diagnostics stay INSIDE the payload.
 */
export function retributionObservedDecisionView(
  analysis: Extract<RetributionPaladinAnalysis, { status: "ANALYZED" }>,
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
      reason: RETRIBUTION_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectRetributionExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this
 * evaluator refuses to judge. NOT PUBLISHED: the module is INTERNAL_ONLY, so
 * the tool descriptions never compose it; it is kept so the row is whole and
 * so a promotion could not ship without reviewed wording.
 */
export const RETRIBUTION_LIMITS = Object.freeze({
  analysis: [
    "Retribution Paladin analysis compares only observed Holy Power SPENDER decisions (Divine Storm versus",
    "Templar's/Final Verdict) against pinned class/spec authority, after excluding racial, potion, item-use",
    "and external-buff entries as outside the rotational decision domain. It does NOT evaluate generators,",
    "cooldown usage, defensive cooldowns, interrupts, or survival, and it does not read race, faction, gear",
    "use effects or consumables.",
  ].join("\n"),
  raidNight: [
    "Retribution Paladin cells count only observed Holy Power SPENDER decisions compared against pinned",
    "class/spec authority. They do NOT evaluate generators, cooldown usage, defensive cooldowns, interrupts,",
    "or survival.",
  ].join("\n"),
});

/**
 * The Retribution Paladin specialization module (M11-A4), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision: the seam's first exercise is
 * not this milestone's (`agent/m11-a4-first-spec-contract.md` §8). The WCL
 * identity strings are the ones the local A7R6 fight-7 capture reports for
 * actor 6 (`subType` Paladin, `friendlySpecs` Retribution).
 */
export const RETRIBUTION_PALADIN_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: RETRIBUTION_PALADIN_SPEC_ID,
    analyzerId: RETRIBUTION_PALADIN_ANALYZER_ID,
    displayName: RETRIBUTION_PALADIN_DISPLAY_NAME,
    wclClassName: "Paladin",
    wclSpecName: "Retribution",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: RETRIBUTION_CAPABILITIES,
  authorityBindings: RETRIBUTION_AUTHORITY_BINDINGS,
  limitsProse: RETRIBUTION_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedRetributionPaladinDecisions({ ...input, authority }),
  observedDecisionView: retributionObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const RETRIBUTION_PALADIN_REGISTRATION: AnalyzerRegistration = RETRIBUTION_PALADIN_MODULE.registration;
