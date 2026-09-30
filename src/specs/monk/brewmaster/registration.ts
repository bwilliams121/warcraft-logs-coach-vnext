/**
 * Brewmaster Monk's analyzer registration (M11-C2; PUBLIC since M11-C4j).
 *
 * THIS IS WHERE BREWMASTER STATES WHAT IT IS, AND THE ONLY PLACE.
 *
 * One row, owned by the specialization, joining the facts that must never
 * drift apart: its identity, its exposure, the six decision families it
 * declares and the evidence each consumes, the ONE authority it binds and
 * the domain it binds it to, the facade that runs it, and the projection of
 * its result shared code may read. `src/services/analyzer-registry.ts` lists
 * this row and reads nothing else from this directory.
 *
 * PUBLIC SINCE M11-C4j, AND WHAT THAT CHANGED
 *
 * The row was INTERNAL_ONLY from M11-C2 through M11-C4i: in the production
 * catalog, reachable by the internal lookup, the corpus and tests, never
 * selected by the application service, raid-night orchestration, REST or
 * MCP. The measurement slices built the decision surface over two independent
 * Shado-Pan subjects; M11-C4i reached real REJECTED evidence in both; M11-C4j
 * moved the id by the reviewed five-site edit (the partition, the public
 * contract's `specId` enum, the identity table, the `satisfies PublicSpecId`
 * on `spec.ts`, and `exposure` below). Promotion changed REACHABILITY and two
 * things that guard it, both in the specialization (owner decisions): the
 * VALIDATED-PROFILE gate (`supported-profile.ts` — Shado-Pan only) and the
 * version-scoped Energy wire resolution in `positive-usability.ts`. No
 * gameplay rule, binding, authority reading or verdict moved.
 *
 * WHAT IS VALIDATED, AND WHAT IS ONLY MODELLED. The pinned authority carries
 * both hero lists and the engine dispatches both; the EVIDENCE is Shado-Pan.
 * A Master of Harmony build therefore fails closed as AUTHORITY_NOT_AVAILABLE
 * rather than being judged against a list no measurement ever reviewed.
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN
 *
 * `SIMC_APL_MONK_BREWMASTER` governs OFFENSIVE_ROTATION and nothing else.
 * Five more domains are declared and bound to nothing; see
 * `authority-bindings.ts` and `domains.ts` for what that says about the brews.
 *
 * THE VIEW, AND WHAT IT KEEPS INTERNAL
 *
 * The registration must supply an observed-decision view for shared code.
 * Brewmaster's projects two internal exclusion reasons and carries the rest
 * verbatim, exactly as the others do: `MELEE_SWING` → `NON_GCD_ACTION`, and
 * `OUTSIDE_FIRST_SLICE` → the public `OUTSIDE_SUPPORTED_SLICE` (already in
 * `PUBLIC_EXCLUSION_REASONS`; no new public reason is introduced). Everything
 * else in the payload — the domain results, the build resolution, the
 * resolver diagnostics, the stopping points and the dispatch trace — stays
 * INSIDE the payload and never reaches the view.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { BREWMASTER_AUTHORITY_BINDINGS, BREWMASTER_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedBrewmasterMonkDecisions,
  BREWMASTER_EXCLUSION_REASONS,
  type BrewmasterExclusionReason,
  type BrewmasterMonkAnalysis,
} from "./observed-analysis.js";
import {
  BREWMASTER_MONK_ANALYZER_ID,
  BREWMASTER_MONK_DISPLAY_NAME,
  BREWMASTER_MONK_SPEC_ID,
} from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC
 * vocabulary. Total by construction; every target is already a member of
 * `PUBLIC_EXCLUSION_REASONS`.
 */
export const BREWMASTER_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
  OUTSIDE_FIRST_SLICE: "OUTSIDE_SUPPORTED_SLICE",
} as const satisfies Record<BrewmasterExclusionReason, string>;

export type BrewmasterViewExclusionReason =
  (typeof BREWMASTER_EXCLUSION_VIEW_PROJECTION)[BrewmasterExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const BREWMASTER_VIEW_EXCLUSION_ORDER: readonly BrewmasterViewExclusionReason[] = Object.freeze(
  BREWMASTER_EXCLUSION_REASONS.map((reason) => BREWMASTER_EXCLUSION_VIEW_PROJECTION[reason]).filter(
    (reason, index, all) => all.indexOf(reason) === index,
  ),
);

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectBrewmasterExclusionTally(
  rows: readonly { readonly key: BrewmasterExclusionReason; readonly count: number }[],
): readonly { readonly key: BrewmasterViewExclusionReason; readonly count: number }[] {
  const merged = new Map<BrewmasterViewExclusionReason, number>();
  for (const row of rows) {
    const key = BREWMASTER_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: BrewmasterViewExclusionReason; count: number }[] = [];
  for (const key of BREWMASTER_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/**
 * The projection shared code reads. Field for field the shape the other
 * adapters produce; the measurement fields stay INSIDE the payload.
 */
export function brewmasterObservedDecisionView(
  analysis: Extract<BrewmasterMonkAnalysis, { status: "ANALYZED" }>,
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
      reason: BREWMASTER_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectBrewmasterExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this
 * evaluator refuses to judge, and PUBLISHED since M11-C4j: the MCP tool
 * descriptions compose it through `publicSpecializationDescriptions`, by the
 * same mechanism as every other public specialization. It names the validated
 * hero tree, the slice, what is not evaluated and the UNKNOWN areas the slice
 * retains, so a reader cannot mistake a narrow denominator for a full rotation
 * review or an UNKNOWN for a fault.
 */
export const BREWMASTER_LIMITS = Object.freeze({
  analysis: [
    "Brewmaster Monk analysis evaluates observed offensive global-cooldown decisions — Keg Smash, Blackout",
    "Kick, Tiger Palm, Breath of Fire and Invoke Niuzao — against pinned class/spec rotational authority,",
    "when the necessary state can be established. It is VALIDATED FOR THE SHADO-PAN HERO TREE ONLY: a build",
    "whose observed talent tree resolves to Master of Harmony, to no hero tree, or to more than one is",
    "refused rather than judged. Celestial Brew, Expel Harm, Chi Burst, Exploding Keg, Empty the Cellar and",
    "Rushing Jade Wind are reported as excluded OUTSIDE_SUPPORTED_SLICE: observed, not judged. It does NOT",
    "evaluate brews, Stagger, active mitigation, self-healing, defensive cooldowns, interrupts or survival,",
    "it does not score performance, and it does not read race, faction, gear use effects or consumables.",
    "It does not reconstruct Energy between observations, brew charges, Keg Smash charges or its hasted",
    "recharge, or what Black Ox Brew changes; an alternative action counts as available only when every",
    "usability condition is proven from the log. Decisions needing unproven state — including Empty the",
    "Cellar's buff when no transition of it was observed — remain UNKNOWN. UNKNOWN is expected here and is",
    "not a fault.",
  ].join("\n"),
  raidNight: [
    "Brewmaster Monk cells count only observed offensive global-cooldown decisions (Keg Smash, Blackout Kick,",
    "Tiger Palm, Breath of Fire, Invoke Niuzao) compared against pinned class/spec authority, and only for",
    "Shado-Pan builds; other rotational decisions are excluded as OUTSIDE_SUPPORTED_SLICE, not judged. They",
    "do NOT evaluate brews, mitigation, self-healing, defensive cooldowns, interrupts or survival, and they",
    "do not score performance. Most decisions typically remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Brewmaster Monk specialization module (M11-C2), PUBLIC since M11-C4j.
 *
 * `supplementalAnalyses` is EMPTY by decision. The WCL identity strings are
 * the ones the committed gtKb fight-22 context reports for actor 4
 * (`subType` Monk, `friendlySpecs` Brewmaster).
 */
export const BREWMASTER_MONK_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: BREWMASTER_MONK_SPEC_ID,
    analyzerId: BREWMASTER_MONK_ANALYZER_ID,
    displayName: BREWMASTER_MONK_DISPLAY_NAME,
    wclClassName: "Monk",
    wclSpecName: "Brewmaster",
  },
  exposure: "PUBLIC",
  capabilities: BREWMASTER_CAPABILITIES,
  authorityBindings: BREWMASTER_AUTHORITY_BINDINGS,
  limitsProse: BREWMASTER_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedBrewmasterMonkDecisions({ ...input, authority }),
  observedDecisionView: brewmasterObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const BREWMASTER_MONK_REGISTRATION: AnalyzerRegistration = BREWMASTER_MONK_MODULE.registration;
