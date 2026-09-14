/**
 * The enabled analyzers.
 *
 * WHAT A REGISTRATION IS
 *
 * One row joining three facts that must never drift apart:
 *
 *     which specialization it analyzes
 *     what evidence it needs        (its ingestion requirement)
 *     how to run it                 (its facade)
 *
 * Keeping them on one row is the point. The failure this prevents is an
 * analyzer whose evidence requirement is declared somewhere else — a transport
 * that "knows" Rogue needs `PLAYER_CONTEXT`, a hand-maintained scope constant,
 * a request field a caller can set. Every one of those lets the analyzer and the
 * data it runs on be changed independently, and silent under-fetching is what
 * you get when they disagree.
 *
 * So the direction is fixed:
 *
 *     analyzer capability -> required evidence -> ingestion scope
 *
 * and never:
 *
 *     transport -> hand-maintained request
 *
 * WHY THIS IS NOT A PLUGIN FRAMEWORK
 *
 * There is one analyzer. This is a typed list and a lookup, because that is
 * what one analyzer needs. The shape matters more than the machinery: M10 and
 * M11 add rows, and a row is the only thing they should have to add. Generalising
 * further now would mean designing for evaluators whose requirements nobody has
 * met yet.
 *
 * WHAT LIVES HERE AND WHAT DOES NOT
 *
 * This module names a facade and calls it. It contains no gameplay rule, no APL
 * concept, no ability, no resource and no talent. The application service depends
 * on this file precisely so it never has to import a specialization evaluator
 * itself.
 */

import type { SpecId } from "../findings/finding.js";
import {
  analyzeObservedAssassinationDecisions,
  type ObservedAnalysisInput,
  type ObservedAssassinationAnalysis,
} from "../specs/rogue/assassination/observed-analysis.js";
import type { AnalyzerRequirement } from "./ingestion-scope.js";

/**
 * The result any registered analyzer produces.
 *
 * Aliased rather than referenced directly so the application service is typed
 * against "an analysis", not against the Rogue module. The alias is Rogue's
 * type today because there is one analyzer; when a second lands, this becomes
 * the union and the service does not change.
 */
export type SpecAnalysis = ObservedAssassinationAnalysis;

/** What a registered analyzer is handed. Facts only — no gameplay interpretation. */
export type SpecAnalysisInput = ObservedAnalysisInput;

export interface RegisteredAnalyzer {
  /** Stable id for scope derivation and disclosure. Not a display name. */
  readonly analyzerId: string;
  readonly specId: SpecId;
  /** The evidence this analyzer needs. Read by scope derivation, never by a caller. */
  readonly requirement: AnalyzerRequirement;
  /** The facade. The service invokes exactly this and never a lower-level evaluator. */
  readonly analyze: (input: SpecAnalysisInput) => SpecAnalysis;
}

const ASSASSINATION_ANALYZER_ID = "rogue-assassination-observed-decisions";

/**
 * Assassination Rogue observed-decision analysis.
 *
 * THIS IS WHERE ASSASSINATION'S EVIDENCE NEEDS ARE STATED, AND THE ONLY PLACE.
 *
 * `PLAYER_CONTEXT` is the honest requirement, not a conservative guess. The
 * analyzer reads one actor's observed casts, that actor's own resources and
 * auras, and the enemy/encounter state a decision was made against. It reads no
 * ally state at all — no other player's cooldowns, buffs or health — so
 * `FULL_RAID` would retrieve raid-wide evidence nothing in this analyzer can
 * consume, at real Warcraft Logs cost.
 *
 * `includeResources: true` because this analyzer reads combo points and energy.
 * That sentence is gameplay knowledge, which is exactly why it lives on the
 * registration rather than in the application service: the service builds the
 * ingestion request without ever learning which resources a Rogue has, or that
 * it is looking at a Rogue at all.
 *
 * Widen either field ONLY when the analyzer actually starts reading more.
 */
const ASSASSINATION_ANALYZER: RegisteredAnalyzer = {
  analyzerId: ASSASSINATION_ANALYZER_ID,
  specId: "rogue/assassination",
  requirement: {
    analyzerId: ASSASSINATION_ANALYZER_ID,
    requiredScope: "PLAYER_CONTEXT",
    includeResources: true,
  },
  analyze: analyzeObservedAssassinationDecisions,
};

/**
 * Every analyzer this build can run.
 *
 * One row. An unsupported specialization is represented by ABSENCE from this
 * list, which is why there is no "unsupported" placeholder entry: a row that
 * cannot analyze anything would still be something the service could select.
 */
export const ENABLED_ANALYZERS: readonly RegisteredAnalyzer[] = [ASSASSINATION_ANALYZER];

/**
 * The ingestion requirements of the enabled analyzers.
 *
 * DERIVED from the registrations rather than listed separately, so a
 * registration cannot declare one scope while scope derivation reads another.
 */
export const ENABLED_ANALYSIS_REQUIREMENTS: readonly AnalyzerRequirement[] = ENABLED_ANALYZERS.map(
  (analyzer) => analyzer.requirement,
);

/**
 * Finds the analyzer for a specialization, or `null` when none exists.
 *
 * `null` means exactly "no analyzer is registered for this spec". It is never a
 * judgement about the player and never an invitation to try a different
 * analyzer.
 */
export function analyzerForSpec(
  specId: SpecId,
  analyzers: readonly RegisteredAnalyzer[] = ENABLED_ANALYZERS,
): RegisteredAnalyzer | null {
  return analyzers.find((analyzer) => analyzer.specId === specId) ?? null;
}

/**
 * The analysis result for a specialization no registered analyzer covers.
 *
 * Built HERE rather than in the application service because this module is what
 * determines support: the answer and the list it is derived from stay together.
 *
 * It is a real analysis-domain result, not an error. The status is the same one
 * an evaluator produces when handed the wrong spec, so a consumer sees one
 * vocabulary regardless of whether the gate fired before or inside an analyzer.
 *
 * WHAT THE DETAIL HAS TO SAY, AND WHY
 *
 * That no analysis was ATTEMPTED. The failure this guards against is a reader
 * seeing a well-formed result with no findings and concluding the player did
 * nothing wrong. Absence of analysis is not evidence of good play, and the only
 * place that can be said is here.
 */
export function specNotSupported(observedSpecId: string): SpecAnalysis {
  return {
    status: "SPEC_NOT_SUPPORTED",
    specId: observedSpecId,
    detail:
      `No gameplay analyzer is registered for '${observedSpecId}', so no rotational decision was evaluated ` +
      `and no gameplay analysis was attempted. This is a limit of the analyzer's current coverage, not a ` +
      `statement about how the fight was played.`,
  };
}
