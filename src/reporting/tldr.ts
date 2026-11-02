/**
 * THE FIGHT TLDR (M15-B): a short summary from the prioritized trustworthy
 * findings and the analysis coverage.
 *
 * The question: "in a few lines, what did this analysis establish about the
 * fight, and how much of the fight could it examine?" It restates the
 * producers' outputs (`restatement.ts`), prioritizes them (`prioritization.ts`)
 * and summarizes the result. It queries nothing, re-evaluates nothing and
 * creates no finding: every highlight is one prioritized item, every count is
 * read from a producer's own coverage or report.
 *
 * COVERAGE COMES FIRST, ALWAYS
 *
 * The TLDR states `assessmentScope: PARTIAL` and opens with a coverage line on
 * every status. No analysis this build performs examines a whole fight (only
 * observed decisions are verified; moments of inaction are not), so a reader
 * must be able to tell
 *
 *   "we could only analyze part of this fight"   (the coverage line), from
 *   "found little to fix"                        (the headline)
 *
 * and the headline is phrased about the ANALYZED decisions only:
 *
 *   GAMEPLAY_NOT_ANALYZED                       no analyzer ran or it could
 *                                               not analyze; not clean play
 *   NO_DECISION_RESOLVED                        analyzed, nothing resolved:
 *                                               nothing is claimed
 *   AUTHORITY_DIVERGENCES_IN_ANALYZED_DECISIONS at least one prioritized item
 *   NO_AUTHORITY_DIVERGENCE_IN_ANALYZED_DECISIONS resolved decisions exist and
 *                                               none diverged; about them only
 *
 * WHAT IT NEVER DOES
 *
 * - UNKNOWN never becomes certainty: unknown decisions are counted and
 *   disclosed, carried records are tallied by disposition, and a consumable
 *   whose count is UNKNOWN has no count (never zero).
 * - SUPPRESSED never becomes failure: suppressed records are carried, never
 *   highlighted.
 * - Nothing is ranked by magnitude, damage, comparison behavior or
 *   confidence (`magnitude: NOT_USED`, `findingEffect` NONE): the highlights
 *   are the prioritized section's first items, in its order.
 * - A divergence's actionability is never overstated: each highlight carries
 *   its standing, and its line says when the authority's alternative was not
 *   proven possible.
 *
 * FAIL CLOSED
 *
 * A producer output its adapter refuses, a record prioritization refuses, a
 * view whose coverage counts disagree with its own decisions, or an invalid
 * config produces `NOT_ASSESSED` with the reason, never a TLDR built from
 * part of the findings or stating counts its findings do not support.
 */

import type { ConsumableStatus, ConsumableStatusReport } from "../analysis/preparation/consumable-status.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { ObservedDecisionView } from "../findings/observed-decision-view.js";
import { DEFAULT_AGGREGATION_CONFIG, type AggregationConfig } from "./aggregation-config.js";
import {
  FINDING_DISPOSITIONS,
  REPORTING_CATEGORIES,
  type FindingDisposition,
  type ReportableFinding,
  type ReportingCategory,
} from "./finding-record.js";
import { prioritizeFindings, type DivergenceStanding, type RankedItem } from "./prioritization.js";
import { restateConsumableStatus, restateObservedDecisions } from "./restatement.js";

export const TLDR_REVISION = "fight-tldr/1" as const;
export const TLDR_CONFIG_REVISION = "fight-tldr-config/1" as const;

/**
 * How many prioritized items the TLDR lists. Configurable and documented:
 * the rest are counted (`notListedItems`) and disclosed, never dropped
 * silently. 3 keeps the summary short; it is a presentation choice, not a
 * validated threshold, and it changes no finding.
 */
export interface TldrConfig {
  readonly revision: typeof TLDR_CONFIG_REVISION;
  readonly maxHighlights: number;
  readonly aggregation: AggregationConfig;
}

export const MAX_HIGHLIGHTS_LIMIT = 10;

export const DEFAULT_TLDR_CONFIG: TldrConfig = {
  revision: TLDR_CONFIG_REVISION,
  maxHighlights: 3,
  aggregation: DEFAULT_AGGREGATION_CONFIG,
};

/** The analysis statuses (pinned equal to the public `PUBLIC_ANALYSIS_STATUSES` by test). */
export const TLDR_GAMEPLAY_STATUSES = [
  "ANALYZED",
  "SPEC_NOT_SUPPORTED",
  "AUTHORITY_NOT_AVAILABLE",
  "PROFILE_NOT_RESOLVED",
  "INSUFFICIENT_EVIDENCE",
] as const;
export type TldrGameplayStatus = (typeof TLDR_GAMEPLAY_STATUSES)[number];

export const TLDR_HEADLINES = [
  "GAMEPLAY_NOT_ANALYZED",
  "NO_DECISION_RESOLVED",
  "AUTHORITY_DIVERGENCES_IN_ANALYZED_DECISIONS",
  "NO_AUTHORITY_DIVERGENCE_IN_ANALYZED_DECISIONS",
] as const;
export type TldrHeadline = (typeof TLDR_HEADLINES)[number];

/** What the TLDR does not cover, machine-readable. Never empty. */
export const TLDR_DISCLOSURES = [
  "GAMEPLAY_NOT_ANALYZED",
  "ONLY_OBSERVED_DECISIONS_VERIFIED",
  "DECISIONS_UNKNOWN",
  "CASTS_EXCLUDED",
  "DIVERGENCE_ACTIONABILITY_UNPROVEN",
  "DIVERGENCES_NOT_LISTED",
  "CONSUMABLE_COUNT_UNKNOWN",
  "PREPARATION_NOT_ASSESSED",
  "DAMAGE_DIAGNOSIS_NOT_ASSESSED",
] as const;
export type TldrDisclosure = (typeof TLDR_DISCLOSURES)[number];

export const TLDR_NOT_ASSESSED_REASONS = [
  "INVALID_TLDR_CONFIG",
  "FINDINGS_NOT_RESTATABLE",
  "FINDINGS_REFUSED",
  "COVERAGE_INCONSISTENT",
] as const;
export type TldrNotAssessedReason = (typeof TLDR_NOT_ASSESSED_REASONS)[number];

/** The diagnosis state, restated by the caller: this module never reads the diagnosis domain. */
export type TldrDiagnosisInput =
  | { readonly assessment: "ASSESSED"; readonly statements: number }
  | { readonly assessment: "NOT_ASSESSED"; readonly reason: string };

export interface TldrInput {
  readonly gameplay:
    | {
        readonly status: "ANALYZED";
        readonly specId: string;
        readonly authorityId: string;
        readonly view: ObservedDecisionView;
      }
    | { readonly status: Exclude<TldrGameplayStatus, "ANALYZED"> };
  readonly preparation:
    | { readonly state: "ASSESSED"; readonly report: ConsumableStatusReport }
    | { readonly state: "NOT_ASSESSED"; readonly reason: string };
  /** Null exactly when gameplay was not analyzed: no diagnosis runs then. */
  readonly diagnosis: TldrDiagnosisInput | null;
}

export interface TldrHighlight {
  /** 1-based position in the prioritized section. */
  readonly position: number;
  readonly itemKind: "SINGLE" | "PATTERN";
  readonly category: ReportingCategory;
  readonly standing: DivergenceStanding;
  readonly subjectToken: string | null;
  readonly occurrences: number;
  readonly firstFightTimeMs: number | null;
  readonly lastFightTimeMs: number | null;
  /** The members' decision locators: references into the result, never copies. */
  readonly evidence: readonly EvidenceLocator[];
}

export type TldrConsumable =
  { readonly countState: "OBSERVED"; readonly count: number } | { readonly countState: "UNKNOWN" };

export type TldrGameplay =
  | {
      readonly status: "ANALYZED";
      readonly eligibleDecisions: number;
      readonly resolvedDecisions: number;
      readonly unknownDecisions: number;
      readonly excludedCasts: number;
    }
  | { readonly status: Exclude<TldrGameplayStatus, "ANALYZED"> };

export type TldrPreparation =
  | {
      readonly assessment: "ASSESSED";
      readonly healthPotion: TldrConsumable;
      readonly healthstone: TldrConsumable;
      readonly combatPotion: TldrConsumable;
    }
  | { readonly assessment: "NOT_ASSESSED"; readonly reason: string };

/** What the summary is told about coverage, beside the records it summarizes. */
export interface TldrContext {
  readonly gameplay: TldrGameplay;
  readonly preparation: TldrPreparation;
  readonly diagnosis: TldrDiagnosisInput | null;
}

export type FightTldr =
  | {
      readonly assessment: "ASSESSED";
      readonly revision: typeof TLDR_REVISION;
      readonly assessmentScope: "PARTIAL";
      readonly headline: TldrHeadline;
      readonly gameplay: TldrGameplay;
      readonly highlights: readonly TldrHighlight[];
      readonly divergences: {
        readonly items: number;
        readonly records: number;
        readonly actionableRecords: number;
        readonly notListedItems: number;
      };
      /** Carried (non-assessment) records by category and disposition; zero rows omitted. */
      readonly notAssessed: readonly {
        readonly category: ReportingCategory;
        readonly disposition: FindingDisposition;
        readonly records: number;
      }[];
      readonly preparation: TldrPreparation;
      readonly damageDiagnosis: TldrDiagnosisInput | null;
      readonly disclosures: readonly TldrDisclosure[];
      /** Author-templated sentences from the fields above. The coverage sentence is always first. */
      readonly lines: readonly string[];
      readonly magnitude: "NOT_USED";
      readonly findingEffect: { readonly confidence: "NONE"; readonly suppression: "NONE" };
    }
  | {
      readonly assessment: "NOT_ASSESSED";
      readonly revision: typeof TLDR_REVISION;
      readonly reason: TldrNotAssessedReason;
    };

const notAssessed = (reason: TldrNotAssessedReason): FightTldr => ({
  assessment: "NOT_ASSESSED",
  revision: TLDR_REVISION,
  reason,
});

function validConfig(config: TldrConfig): boolean {
  return (
    config.revision === TLDR_CONFIG_REVISION &&
    Number.isInteger(config.maxHighlights) &&
    config.maxHighlights >= 1 &&
    config.maxHighlights <= MAX_HIGHLIGHTS_LIMIT
  );
}

function consumableOf(status: ConsumableStatus): TldrConsumable {
  return status.state === "OBSERVED"
    ? { countState: "OBSERVED", count: status.count }
    : { countState: "UNKNOWN" };
}

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

function spanOf(highlight: TldrHighlight): string {
  const { firstFightTimeMs: first, lastFightTimeMs: last } = highlight;
  if (first === null || last === null) return "whole fight";
  return first === last ? `at ${clock(first)}` : `from ${clock(first)} to ${clock(last)}`;
}

const STANDING_SENTENCES: Readonly<Record<DivergenceStanding, string>> = {
  ACTIONABLE_AUTHORITY_DIVERGENCE: "The authority's alternative was proven possible.",
  DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN:
    "Whether the authority's alternative was possible is not proven.",
  DIVERGENCE_ACTIONABILITY_NOT_ESTABLISHED: "Whether any alternative was possible was not established.",
};

const consumableText = (consumable: TldrConsumable): string =>
  consumable.countState === "OBSERVED" ? String(consumable.count) : "UNKNOWN (not zero)";

/**
 * The TLDR of one analyzed fight: restates the view's decisions and the
 * preparation report through their reviewed adapters, checks that the
 * restated decisions agree with the view's own coverage, and summarizes.
 */
export function buildFightTldr(input: TldrInput, config: TldrConfig = DEFAULT_TLDR_CONFIG): FightTldr {
  if (!validConfig(config)) return notAssessed("INVALID_TLDR_CONFIG");

  const records: ReportableFinding[] = [];
  const { gameplay } = input;
  if (gameplay.status === "ANALYZED") {
    const restated = restateObservedDecisions(gameplay.view, {
      specId: gameplay.specId,
      authorityId: gameplay.authorityId,
    });
    if (restated.kind === "REFUSED") return notAssessed("FINDINGS_NOT_RESTATABLE");
    // The counts the TLDR states and the findings it summarizes must describe
    // one result. A view whose coverage disagrees with its own decisions is
    // never summarized.
    const { coverage } = gameplay.view;
    const count = (disposition: FindingDisposition) =>
      restated.records.filter((record) => record.disposition === disposition).length;
    if (
      restated.records.length !== coverage.eligibleDecisions ||
      count("AUTHORITY_DIVERGENCE") !== coverage.rejected ||
      count("AUTHORITY_CONSISTENT") !== coverage.match ||
      count("UNKNOWN") !== coverage.unknown ||
      coverage.resolvedComparisons !== coverage.match + coverage.rejected
    )
      return notAssessed("COVERAGE_INCONSISTENT");
    records.push(...restated.records);
  }
  if (input.preparation.state === "ASSESSED") {
    const restated = restateConsumableStatus(input.preparation.report);
    if (restated.kind === "REFUSED") return notAssessed("FINDINGS_NOT_RESTATABLE");
    records.push(...restated.records);
  }

  return summarizeFindings(
    records,
    {
      gameplay:
        gameplay.status === "ANALYZED"
          ? {
              status: "ANALYZED",
              eligibleDecisions: gameplay.view.coverage.eligibleDecisions,
              resolvedDecisions: gameplay.view.coverage.resolvedComparisons,
              unknownDecisions: gameplay.view.coverage.unknown,
              excludedCasts: gameplay.view.coverage.excludedCastCount,
            }
          : { status: gameplay.status },
      preparation:
        input.preparation.state === "ASSESSED"
          ? {
              assessment: "ASSESSED",
              healthPotion: consumableOf(input.preparation.report.statuses.HEALTH_POTION),
              healthstone: consumableOf(input.preparation.report.statuses.HEALTHSTONE),
              combatPotion: consumableOf(input.preparation.report.statuses.COMBAT_POTION),
            }
          : { assessment: "NOT_ASSESSED", reason: input.preparation.reason },
      diagnosis: input.diagnosis,
    },
    config,
  );
}

/**
 * The summary over already-restated records. Every record is prioritized;
 * only the prioritized section is highlighted, and every carried record is
 * tallied. A refused record makes the whole summary NOT_ASSESSED.
 */
export function summarizeFindings(
  records: readonly ReportableFinding[],
  context: TldrContext,
  config: TldrConfig = DEFAULT_TLDR_CONFIG,
): FightTldr {
  if (!validConfig(config)) return notAssessed("INVALID_TLDR_CONFIG");
  const prioritization = prioritizeFindings(records, config.aggregation);
  if (prioritization.kind === "REFUSED") return notAssessed("INVALID_TLDR_CONFIG");
  // Part of the findings is never summarized as though it were all of them.
  if (prioritization.refused.length > 0) return notAssessed("FINDINGS_REFUSED");

  const { prioritized, carried } = prioritization;
  const highlights = prioritized.slice(0, config.maxHighlights).map((item: RankedItem): TldrHighlight => ({
    position: item.rank,
    itemKind: item.itemKind,
    category: item.category,
    standing: item.standing,
    subjectToken: item.subjectToken,
    occurrences: item.occurrences,
    firstFightTimeMs: item.firstFightTimeMs,
    lastFightTimeMs: item.lastFightTimeMs,
    evidence: item.evidence,
  }));
  const divergences = {
    items: prioritized.length,
    records: prioritization.summary.prioritizedRecords,
    actionableRecords: prioritization.summary.actionableDivergenceRecords,
    notListedItems: prioritized.length - highlights.length,
  };

  const notAssessedRows = REPORTING_CATEGORIES.flatMap((category) =>
    FINDING_DISPOSITIONS.map((disposition) => ({
      category,
      disposition,
      records: carried
        .filter((item) => item.category === category && item.disposition === disposition)
        .reduce((sum, item) => sum + item.occurrences, 0),
    })).filter((row) => row.records > 0),
  );

  const { gameplay: coverage, preparation } = context;
  const diagnosisState = context.diagnosis;
  // A divergence with no analyzed gameplay to belong to describes no result.
  if (coverage.status !== "ANALYZED" && prioritized.length > 0) return notAssessed("COVERAGE_INCONSISTENT");

  const headline: TldrHeadline =
    coverage.status !== "ANALYZED"
      ? "GAMEPLAY_NOT_ANALYZED"
      : divergences.items > 0
        ? "AUTHORITY_DIVERGENCES_IN_ANALYZED_DECISIONS"
        : coverage.resolvedDecisions === 0
          ? "NO_DECISION_RESOLVED"
          : "NO_AUTHORITY_DIVERGENCE_IN_ANALYZED_DECISIONS";

  const held = new Set<TldrDisclosure>();
  if (coverage.status !== "ANALYZED") held.add("GAMEPLAY_NOT_ANALYZED");
  else {
    held.add("ONLY_OBSERVED_DECISIONS_VERIFIED");
    if (coverage.unknownDecisions > 0) held.add("DECISIONS_UNKNOWN");
    if (coverage.excludedCasts > 0) held.add("CASTS_EXCLUDED");
  }
  if (prioritized.some((item) => item.standing !== "ACTIONABLE_AUTHORITY_DIVERGENCE"))
    held.add("DIVERGENCE_ACTIONABILITY_UNPROVEN");
  if (divergences.notListedItems > 0) held.add("DIVERGENCES_NOT_LISTED");
  if (preparation.assessment === "NOT_ASSESSED") held.add("PREPARATION_NOT_ASSESSED");
  else if (
    [preparation.healthPotion, preparation.healthstone, preparation.combatPotion].some(
      (c) => c.countState === "UNKNOWN",
    )
  )
    held.add("CONSUMABLE_COUNT_UNKNOWN");
  if (diagnosisState?.assessment === "NOT_ASSESSED") held.add("DAMAGE_DIAGNOSIS_NOT_ASSESSED");
  const disclosures = TLDR_DISCLOSURES.filter((disclosure) => held.has(disclosure));

  // ---- the sentences, templated from the fields above and nothing else ----
  const lines: string[] = [];
  if (coverage.status !== "ANALYZED")
    lines.push(
      `Gameplay was not analyzed (${coverage.status}). Only specialization-independent facts are summarized; this is not evidence of clean play.`,
    );
  else
    lines.push(
      `Partial analysis: ${String(coverage.resolvedDecisions)} of ${plural(coverage.eligibleDecisions, "eligible observed decision", "eligible observed decisions")} resolved against the authority and ${String(coverage.unknownDecisions)} are UNKNOWN` +
        (coverage.excludedCasts > 0
          ? `; ${plural(coverage.excludedCasts, "cast was", "casts were")} excluded`
          : "") +
        ". Only observed decisions were verified, not moments of inaction.",
    );
  if (headline === "NO_DECISION_RESOLVED")
    lines.push("No observed decision could be resolved, so nothing is claimed about rotational play.");
  if (headline === "NO_AUTHORITY_DIVERGENCE_IN_ANALYZED_DECISIONS")
    lines.push(
      "No resolved decision diverged from the authority. This describes the resolved decisions only, not the whole fight.",
    );
  if (headline === "AUTHORITY_DIVERGENCES_IN_ANALYZED_DECISIONS")
    lines.push(
      `The authority rejected ${plural(divergences.records, "observed decision", "observed decisions")} in the proven state, in ${plural(divergences.items, "item", "items")}.`,
    );
  for (const highlight of highlights)
    lines.push(
      `#${String(highlight.position)} ${highlight.subjectToken ?? highlight.category}: ${plural(highlight.occurrences, "decision", "decisions")} the authority rejected${highlight.itemKind === "PATTERN" ? " (pattern)" : ""}, ${spanOf(highlight)}. ${STANDING_SENTENCES[highlight.standing]}`,
    );
  if (divergences.notListedItems > 0)
    lines.push(
      `${plural(divergences.notListedItems, "more divergence item is", "more divergence items are")} not listed here.`,
    );
  if (preparation.assessment === "ASSESSED")
    lines.push(
      `Consumables used: health potion ${consumableText(preparation.healthPotion)}, healthstone ${consumableText(preparation.healthstone)}, combat potion ${consumableText(preparation.combatPotion)}. These are observed facts, not a judgment.`,
    );
  else lines.push(`Consumable use was not assessed (${preparation.reason}); nothing is claimed about it.`);
  if (diagnosisState?.assessment === "NOT_ASSESSED")
    lines.push(
      `Damage diagnosis was not assessed (${diagnosisState.reason}); nothing is claimed about damage.`,
    );
  if (diagnosisState?.assessment === "ASSESSED")
    lines.push(
      `Damage diagnosis: ${plural(diagnosisState.statements, "statement links", "statements link")} rejected decisions to a proven difference; see diagnosis.`,
    );

  return {
    assessment: "ASSESSED",
    revision: TLDR_REVISION,
    assessmentScope: "PARTIAL",
    headline,
    gameplay: coverage,
    highlights,
    divergences,
    notAssessed: notAssessedRows,
    preparation,
    damageDiagnosis: diagnosisState,
    disclosures,
    lines,
    magnitude: "NOT_USED",
    findingEffect: { confidence: "NONE", suppression: "NONE" },
  };
}
