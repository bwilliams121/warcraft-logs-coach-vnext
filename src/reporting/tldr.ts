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
 * A DECISION READ UNDER THE PINNED SIMC PROFILE (SIMC-FB-B)
 *
 * Its encounter state is the profile's model, so its sentences say "under the
 * pinned SimC profile assumptions, the priority would select X here", in the
 * structure as well (`encounterStateBasis`, `gameplay.simcProfileRelative`, the
 * DECISIONS_EVALUATED_UNDER_SIMC_PROFILE disclosure). They never state an
 * enemy or target count as something that happened. A document with no such
 * decision gains nothing: no key, no code, no sentence.
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
import {
  restateConsumableStatus,
  restateObservedDecisions,
  simcProfileRelativeCountsOf,
  type SimcProfileRelativeCounts,
} from "./restatement.js";

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
  "DECISIONS_EVALUATED_UNDER_SIMC_PROFILE",
  "SUPPORT_OBSERVATIONS_NOT_SUMMARIZED",
  "RAID_COOLDOWN_PLAN_NOT_EVALUATED",
  "HEALER_FINDINGS_NOT_SUMMARIZED",
  "RAID_COOLDOWN_PLAN_NOT_SUMMARIZED",
] as const;
export type TldrDisclosure = (typeof TLDR_DISCLOSURES)[number];

/**
 * Blocks the same document publishes that no reviewed adapter restates
 * (M15-F). The TLDR and the report do not summarize them, and say so, so a
 * reader never takes the summary for everything the document carries:
 *
 *   SUPPORT_OBSERVATIONS           observed support facts (M13-F); no verdict exists
 *   RAID_COOLDOWN_PLAN             the supplied plan (M12-E), not evaluated
 *   HEALER_FINDINGS                healer findings (HEAL-AP): plan execution and
 *                                  observed cooldown use, no healing-quality verdict
 *   RAID_COOLDOWN_PLAN_EVALUATED   the supplied plan, whose assignments the
 *                                  healer findings judged (HEAL-AP)
 */
export const UNSUMMARIZED_BLOCKS = [
  "SUPPORT_OBSERVATIONS",
  "RAID_COOLDOWN_PLAN",
  "HEALER_FINDINGS",
  "RAID_COOLDOWN_PLAN_EVALUATED",
] as const;
export type UnsummarizedBlock = (typeof UNSUMMARIZED_BLOCKS)[number];

const UNSUMMARIZED_DISCLOSURES: Readonly<Record<UnsummarizedBlock, UnsummarizedDisclosure>> = {
  SUPPORT_OBSERVATIONS: "SUPPORT_OBSERVATIONS_NOT_SUMMARIZED",
  RAID_COOLDOWN_PLAN: "RAID_COOLDOWN_PLAN_NOT_EVALUATED",
  HEALER_FINDINGS: "HEALER_FINDINGS_NOT_SUMMARIZED",
  RAID_COOLDOWN_PLAN_EVALUATED: "RAID_COOLDOWN_PLAN_NOT_SUMMARIZED",
};

/** The unsummarized-block disclosures, in `TLDR_DISCLOSURES` order. */
export const UNSUMMARIZED_DISCLOSURE_ORDER = [
  "SUPPORT_OBSERVATIONS_NOT_SUMMARIZED",
  "RAID_COOLDOWN_PLAN_NOT_EVALUATED",
  "HEALER_FINDINGS_NOT_SUMMARIZED",
  "RAID_COOLDOWN_PLAN_NOT_SUMMARIZED",
] as const satisfies readonly TldrDisclosure[];
export type UnsummarizedDisclosure = (typeof UNSUMMARIZED_DISCLOSURE_ORDER)[number];

/** The sentence each unsummarized-block disclosure adds, shared by the TLDR lines and the report markdown. */
export const UNSUMMARIZED_SENTENCES: Readonly<Record<UnsummarizedDisclosure, string>> = {
  SUPPORT_OBSERVATIONS_NOT_SUMMARIZED:
    "Support observations are published separately as observed facts and are not summarized here; they judge no recipient and no timing.",
  RAID_COOLDOWN_PLAN_NOT_EVALUATED:
    "The supplied raid cooldown plan was not evaluated; nothing is claimed about any assignment.",
  HEALER_FINDINGS_NOT_SUMMARIZED:
    "Healer findings are published separately and are not summarized here; they rank no healing and judge no cooldown choice.",
  RAID_COOLDOWN_PLAN_NOT_SUMMARIZED:
    "The supplied raid cooldown plan's assignments were judged in the healer findings, which are not summarized here.",
};

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
  /** The blocks the document publishes beside this summary that it does not restate (M15-F). */
  readonly unsummarized?: readonly UnsummarizedBlock[];
}

export interface TldrHighlight {
  /** 1-based position in the prioritized section. */
  readonly position: number;
  readonly itemKind: "SINGLE" | "PATTERN";
  readonly category: ReportingCategory;
  readonly standing: DivergenceStanding;
  readonly subjectToken: string | null;
  /** Present only on an item resolved under the pinned SimC profile. */
  readonly encounterStateBasis?: "SIMC_PROFILE_RELATIVE";
  /** With `encounterStateBasis`: the token selected under the profile, or null. */
  readonly profileSelectedToken?: string | null;
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
      /** How much of the above was evaluated under the pinned SimC profile. Absent means none. */
      readonly simcProfileRelative?: SimcProfileRelativeCounts | undefined;
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
  /** Absent means none (M15-F). */
  readonly unsummarized?: readonly UnsummarizedBlock[];
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

export const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

export function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

function spanOf(highlight: TldrHighlight): string {
  const { firstFightTimeMs: first, lastFightTimeMs: last } = highlight;
  if (first === null || last === null) return "whole fight";
  return first === last ? `at ${clock(first)}` : `from ${clock(first)} to ${clock(last)}`;
}

export const STANDING_SENTENCES: Readonly<Record<DivergenceStanding, string>> = {
  ACTIONABLE_AUTHORITY_DIVERGENCE: "The authority's alternative was proven possible.",
  DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN:
    "Whether the authority's alternative was possible is not proven.",
  DIVERGENCE_ACTIONABILITY_NOT_ESTABLISHED: "Whether any alternative was possible was not established.",
};

/** How many decisions rest on the profile. States a model's use, never what the fight held. */
export function simcProfileCoverageSentence(counts: SimcProfileRelativeCounts): string {
  return (
    `${plural(counts.decisions, "eligible observed decision was", "eligible observed decisions were")} evaluated under the pinned SimC profile assumptions ` +
    `(${String(counts.match)} MATCH, ${String(counts.rejected)} REJECTED, ${String(counts.unknown)} UNKNOWN). ` +
    "Their encounter state is the profile's model, not something this fight was observed to hold."
  );
}

/** "Under the pinned SimC profile assumptions, the priority would select X here", in substance. */
export function simcProfileSelection(
  disposition: "AUTHORITY_DIVERGENCE" | "AUTHORITY_CONSISTENT",
  token: string | null,
): string {
  const lead = "under the pinned SimC profile assumptions, the priority would";
  if (disposition === "AUTHORITY_CONSISTENT")
    return token === null ? `${lead} select the observed action here` : `${lead} select ${token} here`;
  return token === null
    ? `${lead} not select the observed action here`
    : `${lead} select ${token} here, not the observed action`;
}

export const consumableText = (consumable: TldrConsumable): string =>
  consumable.countState === "OBSERVED" ? String(consumable.count) : "UNKNOWN (not zero)";

/**
 * One fight's findings, restated through the reviewed adapters, with the
 * coverage context they are summarized against (M15-B; shared with the M15-D
 * report so both describe the same records).
 */
export type RestatedFight =
  | {
      readonly kind: "RESTATED";
      readonly records: readonly ReportableFinding[];
      readonly context: TldrContext;
    }
  | { readonly kind: "NOT_ASSESSED"; readonly reason: "FINDINGS_NOT_RESTATABLE" | "COVERAGE_INCONSISTENT" };

/**
 * Restates the view's decisions and the preparation report through their
 * reviewed adapters and checks that the restated decisions agree with the
 * view's own coverage.
 */
export function restateFight(input: TldrInput): RestatedFight {
  const records: ReportableFinding[] = [];
  const { gameplay } = input;
  const profileCounts =
    gameplay.status === "ANALYZED" ? simcProfileRelativeCountsOf(gameplay.view.decisions) : null;
  if (gameplay.status === "ANALYZED") {
    const restated = restateObservedDecisions(gameplay.view, {
      specId: gameplay.specId,
      authorityId: gameplay.authorityId,
    });
    if (restated.kind === "REFUSED") return { kind: "NOT_ASSESSED", reason: "FINDINGS_NOT_RESTATABLE" };
    // The counts stated and the findings summarized must describe one
    // result. A view whose coverage disagrees with its own decisions is
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
      return { kind: "NOT_ASSESSED", reason: "COVERAGE_INCONSISTENT" };
    records.push(...restated.records);
  }
  if (input.preparation.state === "ASSESSED") {
    const restated = restateConsumableStatus(input.preparation.report);
    if (restated.kind === "REFUSED") return { kind: "NOT_ASSESSED", reason: "FINDINGS_NOT_RESTATABLE" };
    records.push(...restated.records);
  }

  return {
    kind: "RESTATED",
    records,
    context: {
      gameplay:
        gameplay.status === "ANALYZED"
          ? {
              status: "ANALYZED",
              eligibleDecisions: gameplay.view.coverage.eligibleDecisions,
              resolvedDecisions: gameplay.view.coverage.resolvedComparisons,
              unknownDecisions: gameplay.view.coverage.unknown,
              excludedCasts: gameplay.view.coverage.excludedCastCount,
              ...(profileCounts === null ? {} : { simcProfileRelative: profileCounts }),
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
      unsummarized: input.unsummarized ?? [],
    },
  };
}

/**
 * The TLDR of one analyzed fight: the restated findings and their coverage,
 * summarized.
 */
export function buildFightTldr(input: TldrInput, config: TldrConfig = DEFAULT_TLDR_CONFIG): FightTldr {
  if (!validConfig(config)) return notAssessed("INVALID_TLDR_CONFIG");
  const restated = restateFight(input);
  if (restated.kind === "NOT_ASSESSED") return notAssessed(restated.reason);
  return summarizeFindings(restated.records, restated.context, config);
}

/**
 * What the coverage context and the prioritized section do not establish,
 * shared by the TLDR and the report (M15-D). `DIVERGENCES_NOT_LISTED` is the
 * TLDR's own: the report lists every item.
 */
export function coverageDisclosures(
  context: TldrContext,
  prioritized: readonly RankedItem[],
): ReadonlySet<TldrDisclosure> {
  const { gameplay: coverage, preparation, diagnosis } = context;
  const held = new Set<TldrDisclosure>();
  if (coverage.status !== "ANALYZED") held.add("GAMEPLAY_NOT_ANALYZED");
  else {
    held.add("ONLY_OBSERVED_DECISIONS_VERIFIED");
    if (coverage.unknownDecisions > 0) held.add("DECISIONS_UNKNOWN");
    if (coverage.excludedCasts > 0) held.add("CASTS_EXCLUDED");
    if (coverage.simcProfileRelative !== undefined) held.add("DECISIONS_EVALUATED_UNDER_SIMC_PROFILE");
  }
  if (prioritized.some((item) => item.standing !== "ACTIONABLE_AUTHORITY_DIVERGENCE"))
    held.add("DIVERGENCE_ACTIONABILITY_UNPROVEN");
  if (preparation.assessment === "NOT_ASSESSED") held.add("PREPARATION_NOT_ASSESSED");
  else if (
    [preparation.healthPotion, preparation.healthstone, preparation.combatPotion].some(
      (c) => c.countState === "UNKNOWN",
    )
  )
    held.add("CONSUMABLE_COUNT_UNKNOWN");
  if (diagnosis?.assessment === "NOT_ASSESSED") held.add("DAMAGE_DIAGNOSIS_NOT_ASSESSED");
  for (const block of context.unsummarized ?? []) held.add(UNSUMMARIZED_DISCLOSURES[block]);
  return held;
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
    ...(item.stateEvidence === "SIMC_PROFILE_RELATIVE"
      ? {
          encounterStateBasis: "SIMC_PROFILE_RELATIVE" as const,
          profileSelectedToken: item.profileSelectedToken ?? null,
        }
      : {}),
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

  const held = new Set(coverageDisclosures(context, prioritized));
  if (divergences.notListedItems > 0) held.add("DIVERGENCES_NOT_LISTED");
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
  if (coverage.status === "ANALYZED" && coverage.simcProfileRelative !== undefined)
    lines.push(simcProfileCoverageSentence(coverage.simcProfileRelative));
  if (headline === "NO_DECISION_RESOLVED")
    lines.push("No observed decision could be resolved, so nothing is claimed about rotational play.");
  if (headline === "NO_AUTHORITY_DIVERGENCE_IN_ANALYZED_DECISIONS")
    lines.push(
      "No resolved decision diverged from the authority. This describes the resolved decisions only, not the whole fight.",
    );
  if (headline === "AUTHORITY_DIVERGENCES_IN_ANALYZED_DECISIONS") {
    const profileItems = prioritized.filter((item) => item.stateEvidence === "SIMC_PROFILE_RELATIVE");
    const profileRecords = profileItems.reduce((sum, item) => sum + item.occurrences, 0);
    if (profileItems.length < prioritized.length)
      lines.push(
        `The authority rejected ${plural(divergences.records - profileRecords, "observed decision", "observed decisions")} in the proven state, in ${plural(divergences.items - profileItems.length, "item", "items")}.`,
      );
    if (profileItems.length > 0)
      lines.push(
        `Under the pinned SimC profile assumptions, the priority would not select ${plural(profileRecords, "observed decision", "observed decisions")}, in ${plural(profileItems.length, "item", "items")}.`,
      );
  }
  for (const highlight of highlights)
    lines.push(
      highlight.encounterStateBasis === undefined
        ? `#${String(highlight.position)} ${highlight.subjectToken ?? highlight.category}: ${plural(highlight.occurrences, "decision", "decisions")} the authority rejected${highlight.itemKind === "PATTERN" ? " (pattern)" : ""}, ${spanOf(highlight)}. ${STANDING_SENTENCES[highlight.standing]}`
        : `#${String(highlight.position)} ${highlight.subjectToken ?? highlight.category}: ${simcProfileSelection("AUTHORITY_DIVERGENCE", highlight.profileSelectedToken ?? null)}, in ${plural(highlight.occurrences, "decision", "decisions")}${highlight.itemKind === "PATTERN" ? " (pattern)" : ""}, ${spanOf(highlight)}. ${STANDING_SENTENCES[highlight.standing]}`,
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
  for (const disclosure of UNSUMMARIZED_DISCLOSURE_ORDER)
    if (held.has(disclosure)) lines.push(UNSUMMARIZED_SENTENCES[disclosure]);

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
