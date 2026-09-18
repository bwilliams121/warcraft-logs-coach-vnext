/**
 * Protection Paladin's analyzer registration (M10-C).
 *
 * THIS IS WHERE PROTECTION STATES WHAT IT IS, AND THE ONLY PLACE.
 *
 * One row, owned by the specialization, joining the facts that must never
 * drift apart: its identity, its exposure, the six decision families it
 * declares and the evidence each consumes, the ONE authority it binds and the
 * domain it binds it to, the facade that runs it, and the projection of its
 * result shared code may read. `src/services/analyzer-registry.ts` lists this
 * row and reads nothing else from this directory.
 *
 * PUBLIC SINCE M10-D
 *
 * The row is in the production catalog with PUBLIC exposure: the application
 * service, raid-night orchestration, REST and MCP select it for a resolved
 * `Paladin/Protection` identity. Promotion was one reviewed edit to five
 * places that the registry and the compiler require to agree — the public
 * spec partition (`src/findings/spec-id.ts`), the public contract's own
 * `specId` enum (`src/contracts/analysis-contract.ts`), the identity table
 * (`src/services/spec-identity.ts`), the `satisfies` on `spec.ts`, and the
 * exposure below. Moving any one of them alone fails at compile time or at
 * catalog validation.
 *
 * WHAT PUBLIC DOES NOT CHANGE
 *
 * Nothing about what this evaluator concludes. The payload, the decision
 * population, the authority binding and every internal outcome are exactly
 * what M10-C proved internally; only the view below is read by the public
 * projection, and the view's one transformation is the exclusion-reason map.
 *
 * THE AUTHORITY, BOUND TO ONE DOMAIN
 *
 * `SIMC_APL_PALADIN_PROTECTION` governs OFFENSIVE_ROTATION and nothing else.
 * Five more domains are declared and bound to nothing; see
 * `authority-bindings.ts`. The registry would refuse a SimulationCraft
 * binding on any of them.
 *
 * SCHEMA-V1 PROJECTION (decided in M10-C, APPLIED by the view since M10-D)
 *
 * Two internal vocabularies of this tree have no name in the public schema.
 * Neither requires a schema change. `PROTECTION_EXCLUSION_PUBLIC_PROJECTION`
 * is the executable form and `protectionObservedDecisionView` applies it to
 * every excluded cast AND to the coverage tally; a contract test pins that it
 * is total over the internal reasons, lands inside `PUBLIC_EXCLUSION_REASONS`,
 * and that no internal-only reason string reaches a public document.
 *
 *     MELEE_SWING → NON_GCD_ACTION
 *         A swing is POSITIVELY identified (`isMelee` on the normalized cast),
 *         and a swing is off the global cooldown: it is scheduled by the
 *         background `auto_attack` action, which the pinned lane data records
 *         at `_gcd` 0. Projecting it as an unknown execution lane
 *         (`EXECUTION_LANE_NOT_ESTABLISHED`) would be untruthful — the lane is
 *         not unestablished, it is known and off-GCD — so the M10-C2 pass
 *         corrected the plan to NON_GCD_ACTION. The public reader loses one
 *         bit of precision (swing versus pressed NON_GCD action); the internal
 *         reason keeps it. Publishing that bit would be a NEW public reason
 *         and therefore a schema decision, deliberately not taken in M10-D.
 *
 *     TRANSITION_UNSUPPORTED (an engine raw blocker) → class OTHER, raw withheld
 *         Already the public shape: `decisiveBlocker` is the public class and
 *         `rawBlocker` is withheld from the shared view exactly as the Rogue
 *         adapter withholds it. No mapping is needed and none is added.
 */

import type { AnalyzerRegistration } from "../../../findings/analyzer-registration.js";
import { defineSpecModule, type SpecModule } from "../../../findings/spec-module.js";
import type { ObservedDecisionView } from "../../../findings/observed-decision-view.js";
import { PROTECTION_AUTHORITY_BINDINGS, PROTECTION_CAPABILITIES } from "./authority-bindings.js";
import {
  analyzeObservedProtectionPaladinDecisions,
  PROTECTION_EXCLUSION_REASONS,
  type ProtectionExclusionReason,
  type ProtectionPaladinAnalysis,
} from "./observed-analysis.js";
import {
  PROTECTION_PALADIN_ANALYZER_ID,
  PROTECTION_PALADIN_DISPLAY_NAME,
  PROTECTION_PALADIN_SPEC_ID,
} from "./spec.js";

/**
 * The public projection of every internal exclusion reason. Total by
 * construction (`satisfies Record<...>`); the public side is pinned by test
 * because this tree does not import the public contract.
 */
export const PROTECTION_EXCLUSION_PUBLIC_PROJECTION = {
  MELEE_SWING: "NON_GCD_ACTION",
  NON_GCD_ACTION: "NON_GCD_ACTION",
  EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
  NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
} as const satisfies Record<ProtectionExclusionReason, string>;

export type ProtectionPublicExclusionReason =
  (typeof PROTECTION_EXCLUSION_PUBLIC_PROJECTION)[ProtectionExclusionReason];

/**
 * The distinct public reasons, in the order the internal vocabulary first
 * names them. This is the order the projected tally is emitted in, so two
 * analyses with the same counts produce the same rows in the same order.
 */
export const PROTECTION_PUBLIC_EXCLUSION_ORDER: readonly ProtectionPublicExclusionReason[] = Object.freeze(
  PROTECTION_EXCLUSION_REASONS.map((reason) => PROTECTION_EXCLUSION_PUBLIC_PROJECTION[reason]).filter(
    (reason, index, all) => all.indexOf(reason) === index,
  ),
);

/**
 * Projects the internal exclusion tally onto the public vocabulary.
 *
 * Rows whose reasons share one public reason are MERGED by summing their
 * counts (the opener's 11 melee swings and 11 NON_GCD presses become one
 * `NON_GCD_ACTION` row of 22). The total is preserved by construction, so
 * `excludedCastCount` — the length of the exclusion list — still reconciles
 * with it, and a zero row is omitted exactly as the internal tally omits one.
 */
export function projectProtectionExclusionTally(
  rows: readonly { readonly key: ProtectionExclusionReason; readonly count: number }[],
): readonly { readonly key: ProtectionPublicExclusionReason; readonly count: number }[] {
  const merged = new Map<ProtectionPublicExclusionReason, number>();
  for (const row of rows) {
    const key = PROTECTION_EXCLUSION_PUBLIC_PROJECTION[row.key];
    merged.set(key, (merged.get(key) ?? 0) + row.count);
  }
  const projected: { key: ProtectionPublicExclusionReason; count: number }[] = [];
  for (const key of PROTECTION_PUBLIC_EXCLUSION_ORDER) {
    const count = merged.get(key) ?? 0;
    if (count > 0) projected.push({ key, count });
  }
  return projected;
}

/**
 * The projection shared code reads.
 *
 * Field for field the shape Assassination's adapter produces, built from the
 * Protection payload's comparisons and exclusions. The domain results, the
 * Holy Power observations, the build resolution and the resolver diagnostics
 * stay INSIDE the payload: the shared view has no field for them, and this
 * adapter adds none. `rawBlocker`, `observedActionRejected` and the per-record
 * `actorId` are withheld exactly as the Rogue adapter withholds them.
 *
 * THE ONE TRANSFORMATION. Each excluded cast's reason and the exclusion tally
 * pass through `PROTECTION_EXCLUSION_PUBLIC_PROJECTION`. Every other field is
 * copied by name; the internal payload keeps `MELEE_SWING`.
 */
export function protectionObservedDecisionView(
  analysis: Extract<ProtectionPaladinAnalysis, { status: "ANALYZED" }>,
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
      reason: PROTECTION_EXCLUSION_PUBLIC_PROJECTION[cast.reason],
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
      exclusions: projectProtectionExclusionTally(coverage.exclusions),
      excludedCastCount: coverage.excludedCastCount,
    },
  };
}

/**
 * The public limitation prose the tool descriptions publish for Protection
 * (M11-A2). Owned HERE, by the specialization, because it is a claim about
 * what this evaluator refuses to judge — which no registry field can
 * generate. Two surfaces, two grammars, one meaning; the M10-D wording is
 * preserved byte for byte and composed into the descriptions in
 * public-registration order.
 */
export const PROTECTION_PUBLIC_LIMITS = Object.freeze({
  analysis: [
    "Protection Paladin analysis compares only observed OFFENSIVE global-cooldown decisions against",
    "pinned authority. It does NOT evaluate defensive cooldowns, active mitigation, self-healing,",
    "interrupts, or survival. Off-global-cooldown actions such as Shield of the Righteous are excluded,",
    "not judged.",
  ].join("\n"),
  raidNight: [
    "Protection Paladin cells count only observed OFFENSIVE global-cooldown decisions compared against",
    "pinned authority. They do NOT evaluate defensive cooldowns, active mitigation, self-healing,",
    "interrupts, or survival; off-global-cooldown actions such as Shield of the Righteous are excluded,",
    "not judged.",
  ].join("\n"),
});

/**
 * The Protection Paladin specialization module (M11-A2).
 *
 * Built through the specialization module factory, which checks the identity
 * coheres with the pinned roster and builds the registration row through
 * `defineAnalyzerRegistration` exactly as before — the facade, the view, the
 * six capabilities and the one binding are the same objects M10-C
 * registered and M10-D made public. The WCL identity strings are the ones
 * the committed A7R6 fight-context capture reports for actor 7 (`subType`
 * Paladin, `friendlySpecs` Protection); the conformance suite pins them
 * against that artifact.
 */
export const PROTECTION_PALADIN_MODULE: SpecModule = defineSpecModule({
  identity: {
    specId: PROTECTION_PALADIN_SPEC_ID,
    analyzerId: PROTECTION_PALADIN_ANALYZER_ID,
    displayName: PROTECTION_PALADIN_DISPLAY_NAME,
    wclClassName: "Paladin",
    wclSpecName: "Protection",
  },
  exposure: "PUBLIC",
  capabilities: PROTECTION_CAPABILITIES,
  authorityBindings: PROTECTION_AUTHORITY_BINDINGS,
  limitsProse: PROTECTION_PUBLIC_LIMITS,
  // The facade receives the registration's OWN authority access and asks it
  // per domain. There is no argument through which another specialization's
  // binding could arrive.
  analyze: (input, authority) => analyzeObservedProtectionPaladinDecisions({ ...input, authority }),
  observedDecisionView: protectionObservedDecisionView,
});

/** The row the production catalog lists. The module owns it; this name is the M10 export, unchanged. */
export const PROTECTION_PALADIN_REGISTRATION: AnalyzerRegistration = PROTECTION_PALADIN_MODULE.registration;
