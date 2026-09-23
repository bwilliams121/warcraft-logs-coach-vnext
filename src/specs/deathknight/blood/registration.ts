/**
 * Blood Death Knight's analyzer registration (M11-B2; PUBLIC since M11-B12).
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
 * PUBLIC SINCE M11-B12, AND WHAT THAT CHANGED
 *
 * The row was INTERNAL_ONLY from M11-B2 through M11-B10: in the production
 * catalog, reachable by the internal lookup, the corpus and tests, never
 * selected by the application service, raid-night orchestration, REST or
 * MCP. Ten measurement slices built the decision surface; M11-B11 audited it
 * against the promotion gates; M11-B12 moved the id by the reviewed five-site
 * edit (the partition, the public contract's `specId` enum, the identity
 * table, the `satisfies PublicSpecId` on `spec.ts`, and `exposure` below).
 * Promotion changed REACHABILITY and two things that guard it, both here in
 * the specialization: the VALIDATED-PROFILE gate (`supported-profile.ts` —
 * San'layn only, owner decision T2) and the version-scoped resource wire
 * resolution (`resources.ts`). No gameplay rule, binding, authority reading
 * or verdict moved: a public request for a DeathKnight/Blood identity now
 * dispatches this row and receives exactly the analysis the internal lookup
 * always produced, projected through the shared public contract.
 *
 * WHAT IS VALIDATED, AND WHAT IS ONLY MODELLED. The pinned authority carries
 * both hero lists and the engine dispatches both; the EVIDENCE is San'layn
 * (two sanitized captures). A Deathbringer build therefore fails closed as
 * AUTHORITY_NOT_AVAILABLE rather than being judged against a list no
 * measurement ever reviewed. That refusal is the honest answer, not a defect.
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
 * evaluator refuses to judge, and PUBLISHED since M11-B12: the MCP tool
 * descriptions compose it through `publicSpecializationDescriptions`, in the
 * same position and by the same mechanism as the Paladins'. It names the
 * validated hero tree and the slice, says what is not evaluated, and says
 * that UNKNOWN is the expected answer where evidence cannot establish state,
 * so a reader cannot mistake a narrow denominator for a full rotation review
 * or an UNKNOWN for a fault. NOT published: the row is INTERNAL_ONLY, so
 * no MCP description composes it and no public document carries it. It
 * exists so the row is complete and so promotion, if it ever comes, has the
 * text to review.
 */
export const BLOOD_LIMITS = Object.freeze({
  analysis: [
    "Blood Death Knight analysis evaluates observed offensive global-cooldown decisions — Death Strike,",
    "Heart Strike (including its Vampiric Strike execution), Blood Boil, Marrowrend and Death's Caress —",
    "against pinned class/spec rotational authority, when the necessary state can be established. It is",
    "VALIDATED FOR THE SAN'LAYN HERO TREE ONLY: a build whose observed talent tree resolves to",
    "Deathbringer, to no hero tree, or to more than one is refused rather than judged. Death and Decay,",
    "Dancing Rune Weapon and Consumption are reported as excluded OUTSIDE_SUPPORTED_SLICE: observed, not",
    "judged. It does NOT evaluate active mitigation, self-healing, defensive cooldowns, interrupts or",
    "survival — Death Strike is judged only as the offensive list's spender — it does not score",
    "performance, and it does not read race, faction, gear use effects or consumables. It does not model",
    "fight_remains, does not reconstruct Rune regeneration, and does not reconstruct Runic Power across a",
    "spend it did not observe; decisions needing that state, or needing cooldown, charge, proc or talent",
    "evidence the log does not carry, remain UNKNOWN. UNKNOWN is expected here and is not a fault.",
  ].join("\n"),
  raidNight: [
    "Blood Death Knight cells count only observed offensive global-cooldown decisions (Death Strike, Heart",
    "Strike, Blood Boil, Marrowrend, Death's Caress) compared against pinned class/spec authority, and only",
    "for San'layn builds; other rotational decisions are excluded as OUTSIDE_SUPPORTED_SLICE, not judged.",
    "They do NOT evaluate mitigation, self-healing, defensive cooldowns, interrupts or survival, and they",
    "do not score performance. Most decisions typically remain UNKNOWN, which is expected.",
  ].join("\n"),
});

/**
 * The Blood Death Knight specialization module (M11-B2), PUBLIC since M11-B12.
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
  exposure: "PUBLIC",
  capabilities: BLOOD_CAPABILITIES,
  authorityBindings: BLOOD_AUTHORITY_BINDINGS,
  limitsProse: BLOOD_LIMITS,
  supplementalAnalyses: [],
  analyze: (input, authority) => analyzeObservedBloodDeathKnightDecisions({ ...input, authority }),
  observedDecisionView: bloodObservedDecisionView,
});

/** The row the production catalog lists. The module owns it. */
export const BLOOD_DEATH_KNIGHT_REGISTRATION: AnalyzerRegistration = BLOOD_DEATH_KNIGHT_MODULE.registration;
