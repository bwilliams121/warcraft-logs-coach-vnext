/**
 * Retribution Paladin's analyzer registration (M11-A4; PUBLIC since M11-A5).
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
 * PUBLIC SINCE M11-A5, AND WHAT THAT CHANGED
 *
 * The row was INTERNAL_ONLY from M11-A4: in the production catalog, reachable
 * by the internal lookup, the corpus and tests, never selected by the
 * application service, raid-night orchestration, REST or MCP. M11-A5 moved
 * it to PUBLIC by the five-site edit (the partition, the public contract's
 * `specId` enum, the identity table, the `satisfies PublicSpecId` on
 * `spec.ts`, and `exposure` below) after the test-owned promotion evidence
 * gate reported real MATCH and REJECTED evidence for it. Promotion changed
 * REACHABILITY and nothing else: the facade, its slice, its proofs and its
 * fail-closed edges are exactly M11-A4's, and a public request for a
 * Paladin/Retribution identity now dispatches this row and receives the
 * same analysis the internal lookup always produced, projected through the
 * shared public contract.
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
 * Retribution's projects two internal exclusion reasons and carries the rest
 * verbatim: `MELEE_SWING` → `NON_GCD_ACTION` (as Protection does, for the
 * reason recorded there), and `OUTSIDE_FIRST_SLICE` → the public
 * `OUTSIDE_SUPPORTED_SLICE`. The internal name says what it is to this
 * evaluator — the first slice is spender decisions, and the in-domain,
 * authority-bound GCD casts it does not judge (Judgment, Blade of Justice,
 * Hammer of Wrath, Wake of Ashes, Divine Toll, Execution Sentence, the
 * strikes, Hammer of Light) are named under it — and the public name says
 * what it is to a reader: intentionally outside the supported decision
 * slice, not judged, not a mistake, not an UNKNOWN. That public value was
 * the one schema decision M11-A5 took (one additive `analysis/1` widening;
 * see `PUBLIC_EXCLUSION_REASONS`). Everything else in the payload — the
 * domain results, the Holy Power observations, the build resolution, the
 * resolver diagnostics, the root-scan stopping entries — stays INSIDE the
 * payload and never reaches the view.
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
 * The view projection of every internal exclusion reason onto the PUBLIC
 * vocabulary. Total by construction, and pinned inside
 * `PUBLIC_EXCLUSION_REASONS` by `m11a5-retribution-public-projection`.
 * `OUTSIDE_FIRST_SLICE` → `OUTSIDE_SUPPORTED_SLICE` is the one M11-A5
 * projection decision; see the module header.
 */
export const RETRIBUTION_EXCLUSION_VIEW_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
  OUTSIDE_FIRST_SLICE: "OUTSIDE_SUPPORTED_SLICE",
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
 * evaluator refuses to judge, and PUBLISHED since M11-A5: the MCP tool
 * descriptions compose it through `publicSpecializationDescriptions`, in the
 * same position and by the same mechanism as Protection's. It names the
 * slice, says what is not evaluated, and says that the in-domain decisions
 * outside the slice are reported as excluded — observed, not judged — so a
 * reader cannot mistake a narrow denominator for a full rotation review or
 * an UNKNOWN for a fault. No implementation detail (list indexes,
 * constructor facts, stack bindings) belongs here.
 */
export const RETRIBUTION_LIMITS = Object.freeze({
  analysis: [
    "Retribution Paladin analysis currently evaluates only observed Holy Power SPENDER decisions (Divine",
    "Storm versus Templar's/Final Verdict) against pinned class/spec rotational authority, when the",
    "necessary state can be established. Other rotational decisions — generators, Wake of Ashes, Divine",
    "Toll, Execution Sentence and the other cooldown branches — are reported as excluded",
    "OUTSIDE_SUPPORTED_SLICE: observed, not judged. It does NOT evaluate defensive cooldowns, interrupts,",
    "or survival, and it does not read race, faction, gear use effects or consumables; racial, potion,",
    "item-use and external-buff entries are outside the rotational decision domain. A spender decision",
    "whose required state cannot be reconstructed remains UNKNOWN, which is expected and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Retribution Paladin cells count only observed Holy Power SPENDER decisions compared against pinned",
    "class/spec authority; other rotational decisions are excluded as OUTSIDE_SUPPORTED_SLICE, not judged.",
    "They do NOT evaluate generators, cooldown usage, defensive cooldowns, interrupts, or survival.",
  ].join("\n"),
});

/**
 * The Retribution Paladin specialization module (M11-A4), PUBLIC since M11-A5.
 *
 * `supplementalAnalyses` is EMPTY by decision: the seam's first exercise is
 * not this milestone's (`agent/m11-a4-first-spec-contract.md` §8), and
 * M11-A5 is exposure only. The WCL identity strings are the ones the local
 * A7R6 fight-7 capture reports for actor 6 (`subType` Paladin,
 * `friendlySpecs` Retribution), and they are the canonical identity the
 * public table resolves.
 */
export const RETRIBUTION_PALADIN_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: RETRIBUTION_PALADIN_SPEC_ID,
    analyzerId: RETRIBUTION_PALADIN_ANALYZER_ID,
    displayName: RETRIBUTION_PALADIN_DISPLAY_NAME,
    wclClassName: "Paladin",
    wclSpecName: "Retribution",
  },
  exposure: "PUBLIC",
  capabilities: RETRIBUTION_CAPABILITIES,
  authorityBindings: RETRIBUTION_AUTHORITY_BINDINGS,
  limitsProse: RETRIBUTION_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedRetributionPaladinDecisions({ ...input, authority }),
  observedDecisionView: retributionObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const RETRIBUTION_PALADIN_REGISTRATION: AnalyzerRegistration = RETRIBUTION_PALADIN_MODULE.registration;
