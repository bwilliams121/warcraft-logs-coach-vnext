/**
 * Blood Death Knight's analyzer registration (M11-B2, INTERNAL_ONLY).
 *
 * THIS IS WHERE BLOOD STATES WHAT IT IS, AND THE ONLY PLACE.
 *
 * One row, owned by the specialization, joining the facts that must never
 * drift apart: its identity, its exposure, the six decision families it
 * declares and the evidence each consumes, the ONE authority it binds and
 * the domain it binds it to, the facade that runs it, and the projection of
 * its result shared code may read. `src/services/analyzer-registry.ts` lists
 * this row and reads nothing else from this directory.
 *
 * INTERNAL_ONLY, AND WHAT THAT MEANS. The row is in the production catalog,
 * reachable by the internal lookup, the corpus and tests, and NEVER
 * selected by the application service, raid-night orchestration, REST or
 * MCP: `src/findings/spec-id.ts` lists the id in `INTERNAL_ONLY_SPEC_IDS`,
 * and `spec.ts` says so at compile time. Promotion is the reviewed
 * five-site edit `agent/architecture.md` describes and is NOT part of
 * M11-B2, whose deliverable is a measurement, not a public analyzer.
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN
 *
 * `SIMC_APL_DEATHKNIGHT_BLOOD` governs OFFENSIVE_ROTATION and nothing else.
 * Five more domains are declared and bound to nothing; see
 * `authority-bindings.ts` and `domains.ts` for what that says about Death
 * Strike.
 *
 * THE VIEW, AND WHAT IT KEEPS INTERNAL
 *
 * The registration must supply an observed-decision view for shared code.
 * Blood's projects two internal exclusion reasons and carries the rest
 * verbatim, exactly as the Paladin ones do: `MELEE_SWING` → `NON_GCD_ACTION`,
 * and `OUTSIDE_FIRST_SLICE` → the public `OUTSIDE_SUPPORTED_SLICE` (already
 * in `PUBLIC_EXCLUSION_REASONS` since M11-A5; no new public reason is
 * introduced). Everything else in the payload — the domain results, the
 * resource observations, the build resolution, the resolver diagnostics,
 * the stopping points and the dispatch trace — stays INSIDE the payload and
 * never reaches the view.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { BLOOD_AUTHORITY_BINDINGS, BLOOD_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedBloodDeathKnightDecisions,
  BLOOD_EXCLUSION_REASONS,
  type BloodDeathKnightAnalysis,
  type BloodExclusionReason,
} from "./observed-analysis.js";
import {
  BLOOD_DEATH_KNIGHT_ANALYZER_ID,
  BLOOD_DEATH_KNIGHT_DISPLAY_NAME,
  BLOOD_DEATH_KNIGHT_SPEC_ID,
} from "./spec.js";

/**
 * The view projection of every internal exclusion reason onto the PUBLIC
 * vocabulary. Total by construction; every target is already a member of
 * `PUBLIC_EXCLUSION_REASONS`.
 */
export const BLOOD_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
  OUTSIDE_FIRST_SLICE: "OUTSIDE_SUPPORTED_SLICE",
} as const satisfies Record<BloodExclusionReason, string>;

export type BloodViewExclusionReason = (typeof BLOOD_EXCLUSION_VIEW_PROJECTION)[BloodExclusionReason];

/** The distinct view reasons, in the order the internal vocabulary first names them. */
export const BLOOD_VIEW_EXCLUSION_ORDER: readonly BloodViewExclusionReason[] = Object.freeze(
  BLOOD_EXCLUSION_REASONS.map((reason) => BLOOD_EXCLUSION_VIEW_PROJECTION[reason]).filter(
    (reason, index, all) => all.indexOf(reason) === index,
  ),
);

/** Projects the internal exclusion tally onto the view vocabulary, merging rows that share a reason. */
export function projectBloodExclusionTally(
  rows: readonly { readonly key: BloodExclusionReason; readonly count: number }[],
): readonly { readonly key: BloodViewExclusionReason; readonly count: number }[] {
  const merged = new Map<BloodViewExclusionReason, number>();
  for (const row of rows) {
    const key = BLOOD_EXCLUSION_VIEW_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: BloodViewExclusionReason; count: number }[] = [];
  for (const key of BLOOD_VIEW_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/**
 * The projection shared code reads. Field for field the shape the other
 * adapters produce; the measurement fields stay INSIDE the payload.
 */
export function bloodObservedDecisionView(
  analysis: Extract<BloodDeathKnightAnalysis, { status: "ANALYZED" }>,
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
      reason: BLOOD_EXCLUSION_VIEW_PROJECTION[cast.reason],
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
      exclusions: projectBloodExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The limitation prose. Owned here because it is a claim about what this
 * evaluator refuses to judge. NOT published: the row is INTERNAL_ONLY, so
 * no MCP description composes it and no public document carries it. It
 * exists so the row is complete and so promotion, if it ever comes, has the
 * text to review.
 */
export const BLOOD_LIMITS = Object.freeze({
  analysis: [
    "Blood Death Knight analysis is an INTERNAL measurement slice. It evaluates observed casts of Death",
    "Strike, Heart Strike (including its Vampiric Strike execution), Blood Boil, Marrowrend and Death's",
    "Caress against pinned class/spec rotational authority when the necessary state can be established,",
    "and records where the authority traversal stops when it cannot. Death and Decay, Dancing Rune Weapon",
    "and Consumption are reported as excluded OUTSIDE_SUPPORTED_SLICE: observed, not judged. It does NOT",
    "evaluate active mitigation, self healing, defensive cooldowns, interrupts or survival — Death Strike",
    "is judged only as the offensive list's spender — and it does not read race, faction, gear use effects",
    "or consumables. A decision whose required state cannot be reconstructed remains UNKNOWN, which is",
    "expected and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Blood Death Knight cells are not produced: the analyzer is INTERNAL_ONLY and raid-night orchestration",
    "does not select it.",
  ].join("\n"),
});

/**
 * The Blood Death Knight specialization module (M11-B2), INTERNAL_ONLY.
 *
 * `supplementalAnalyses` is EMPTY by decision. The WCL identity strings are
 * the ones the local A7R6 fight-7 and gtKb fight-22 captures report for
 * actor 14 (`subType` DeathKnight, `friendlySpecs` Blood).
 */
export const BLOOD_DEATH_KNIGHT_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: BLOOD_DEATH_KNIGHT_SPEC_ID,
    analyzerId: BLOOD_DEATH_KNIGHT_ANALYZER_ID,
    displayName: BLOOD_DEATH_KNIGHT_DISPLAY_NAME,
    wclClassName: "DeathKnight",
    wclSpecName: "Blood",
  },
  exposure: "INTERNAL_ONLY",
  capabilities: BLOOD_CAPABILITIES,
  authorityBindings: BLOOD_AUTHORITY_BINDINGS,
  limitsProse: BLOOD_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedBloodDeathKnightDecisions({ ...input, authority }),
  observedDecisionView: bloodObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const BLOOD_DEATH_KNIGHT_REGISTRATION: AnalyzerRegistration = BLOOD_DEATH_KNIGHT_MODULE.registration;
