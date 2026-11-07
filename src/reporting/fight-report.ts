/**
 * THE FIGHT REPORT (M15-D): every restated finding, grouped by decision
 * category, with its evidence and actionability, the suppressions with their
 * machine-readable reasons, and a coverage section; as structure (the JSON
 * report) and as markdown rendered from that structure.
 *
 * The question: "what did this analysis find, in which decision category, and
 * why did it tell me this?" The TLDR (M15-B) answers it in a few lines; this
 * answers it in full. It restates the same producers' outputs through the same
 * reviewed adapters (`restateFight`), prioritizes them with the same function
 * (`prioritizeFindings`) and lays the result out. It queries nothing,
 * re-evaluates nothing and creates no finding: every entry is one prioritized,
 * informational or carried item, every count is a producer's own or a count of
 * those items, and the markdown is a pure function of the structure beside it.
 *
 * WHAT IT CARRIES
 *
 *   coverage      FIRST, always: gameplay coverage, preparation, the damage
 *                 diagnosis state, records per disposition and the
 *                 disclosures (never empty). `assessmentScope` is PARTIAL.
 *   categories    one section per decision category that has an entry, in
 *                 REPORTING_CATEGORIES order, each split into the M15-A
 *                 sections: prioritized (authority divergences, in the
 *                 evidence-then-actionability order), informational
 *                 (authority-consistent results and observed facts) and
 *                 carried (SUPPRESSED, UNKNOWN, NO_AUTHORITY_AVAILABLE,
 *                 UNSUPPORTED, each with its reason code).
 *   suppressions  every SUPPRESSED item with its named environmental reason.
 *                 Kept structurally; never a failure.
 *   markdown      the same, as text.
 *
 * Each entry states who concluded it (producer, authority), on what state
 * (stateEvidence), what evidence there is that the decision was possible
 * (actionability, and for a divergence its standing), when (fight-time span)
 * and where (evidence locators into the published result).
 *
 * An entry whose `stateEvidence` is SIMC_PROFILE_RELATIVE (SIMC-FB-B) reads
 * "under the pinned SimC profile assumptions, the priority would select X here",
 * and the coverage section says how many decisions rest on the profile. No
 * sentence states an enemy or target count as something that happened.
 *
 * WHAT IT NEVER DOES
 *
 * - UNKNOWN never becomes certainty and SUPPRESSED never becomes failure:
 *   both are carried entries with their reasons, never in a divergence list.
 * - Nothing is ordered by magnitude, damage, comparison behavior or
 *   confidence (`magnitude: NOT_USED`, `findingEffect` NONE).
 * - Nothing is dropped: every item is listed. Fail closed like the TLDR: a
 *   refused restatement, a refused record, an inconsistent coverage or an
 *   invalid config produce NOT_ASSESSED with the reason, never part of a report.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";
import { DEFAULT_AGGREGATION_CONFIG, type AggregationConfig } from "./aggregation-config.js";
import {
  FINDING_DISPOSITIONS,
  REPORTING_CATEGORIES,
  type ActionabilityLevel,
  type FindingDisposition,
  type ReportingCategory,
  type StateEvidenceState,
  type SuppressionReason,
} from "./finding-record.js";
import {
  prioritizeFindings,
  type DivergenceStanding,
  type ItemStanding,
  type ReportItem,
  type ReportSection,
} from "./prioritization.js";
import {
  clock,
  consumableText,
  coverageDisclosures,
  plural,
  restateFight,
  simcProfileCoverageSentence,
  simcProfileSelection,
  STANDING_SENTENCES,
  TLDR_DISCLOSURES,
  UNSUMMARIZED_DISCLOSURE_ORDER,
  UNSUMMARIZED_SENTENCES,
  type TldrContext,
  type TldrDiagnosisInput,
  type TldrDisclosure,
  type TldrGameplay,
  type TldrInput,
  type TldrPreparation,
} from "./tldr.js";

export const REPORT_REVISION = "fight-report/1" as const;
export const REPORT_CONFIG_REVISION = "fight-report-config/1" as const;

/** The report lists every item, so its only setting is the M15-A aggregation. */
export interface ReportConfig {
  readonly revision: typeof REPORT_CONFIG_REVISION;
  readonly aggregation: AggregationConfig;
}

export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  revision: REPORT_CONFIG_REVISION,
  aggregation: DEFAULT_AGGREGATION_CONFIG,
};

export const REPORT_NOT_ASSESSED_REASONS = [
  "INVALID_REPORT_CONFIG",
  "FINDINGS_NOT_RESTATABLE",
  "FINDINGS_REFUSED",
  "COVERAGE_INCONSISTENT",
] as const;
export type ReportNotAssessedReason = (typeof REPORT_NOT_ASSESSED_REASONS)[number];

/** One prioritized, informational or carried item, as the report lists it. */
export interface ReportEntry {
  readonly section: ReportSection;
  /** 1-based place in the prioritized order; null outside that section. */
  readonly position: number | null;
  readonly itemKind: "SINGLE" | "PATTERN";
  readonly disposition: FindingDisposition;
  readonly standing: ItemStanding;
  readonly producer: string;
  readonly authority: string;
  readonly stateEvidence: StateEvidenceState;
  readonly actionability: ActionabilityLevel;
  readonly reasonCode: string | null;
  readonly suppressionReason: SuppressionReason | null;
  readonly subjectToken: string | null;
  /** SIMC_PROFILE_RELATIVE state only: the token selected under the profile, or null. */
  readonly profileSelectedToken?: string | null | undefined;
  readonly occurrences: number;
  readonly firstFightTimeMs: number | null;
  readonly lastFightTimeMs: number | null;
  /** References into the result, never copies. */
  readonly evidence: readonly EvidenceLocator[];
}

export interface ReportCategorySection {
  readonly category: ReportingCategory;
  readonly prioritized: readonly ReportEntry[];
  readonly informational: readonly ReportEntry[];
  readonly carried: readonly ReportEntry[];
}

export interface ReportSuppression {
  readonly category: ReportingCategory;
  readonly suppressionReason: SuppressionReason;
  readonly reasonCode: string;
  readonly subjectToken: string | null;
  readonly records: number;
}

export interface ReportCoverage {
  readonly gameplay: TldrGameplay;
  readonly preparation: TldrPreparation;
  readonly damageDiagnosis: TldrDiagnosisInput | null;
  /** Every disposition, zero included. */
  readonly recordsByDisposition: readonly {
    readonly disposition: FindingDisposition;
    readonly records: number;
  }[];
  /** Never empty. */
  readonly disclosures: readonly TldrDisclosure[];
}

/** The structure the markdown is rendered from. */
export interface ReportBody {
  readonly coverage: ReportCoverage;
  readonly categories: readonly ReportCategorySection[];
  readonly suppressions: readonly ReportSuppression[];
}

export type FightReport =
  | (ReportBody & {
      readonly assessment: "ASSESSED";
      readonly revision: typeof REPORT_REVISION;
      readonly assessmentScope: "PARTIAL";
      readonly markdown: string;
      readonly magnitude: "NOT_USED";
      readonly findingEffect: { readonly confidence: "NONE"; readonly suppression: "NONE" };
    })
  | {
      readonly assessment: "NOT_ASSESSED";
      readonly revision: typeof REPORT_REVISION;
      readonly reason: ReportNotAssessedReason;
    };

const notAssessed = (reason: ReportNotAssessedReason): FightReport => ({
  assessment: "NOT_ASSESSED",
  revision: REPORT_REVISION,
  reason,
});

function entryOf(item: ReportItem, position: number | null): ReportEntry {
  return {
    section: item.section,
    position,
    itemKind: item.itemKind,
    disposition: item.disposition,
    standing: item.standing,
    producer: item.producer,
    authority: item.authority,
    stateEvidence: item.stateEvidence,
    actionability: item.actionability,
    reasonCode: item.reasonCode,
    suppressionReason: item.suppressionReason,
    subjectToken: item.subjectToken,
    ...(item.profileSelectedToken === undefined ? {} : { profileSelectedToken: item.profileSelectedToken }),
    occurrences: item.occurrences,
    firstFightTimeMs: item.firstFightTimeMs,
    lastFightTimeMs: item.lastFightTimeMs,
    evidence: item.evidence,
  };
}

/** The report of one analyzed fight, from the same restatement the TLDR summarizes. */
export function buildFightReport(
  input: TldrInput,
  config: ReportConfig = DEFAULT_REPORT_CONFIG,
): FightReport {
  if (config.revision !== REPORT_CONFIG_REVISION) return notAssessed("INVALID_REPORT_CONFIG");
  const restated = restateFight(input);
  if (restated.kind === "NOT_ASSESSED") return notAssessed(restated.reason);
  return reportFindings(restated.records, restated.context, config);
}

/** The report over already-restated records. A refused record makes the whole report NOT_ASSESSED. */
export function reportFindings(
  records: Parameters<typeof prioritizeFindings>[0],
  context: TldrContext,
  config: ReportConfig = DEFAULT_REPORT_CONFIG,
): FightReport {
  if (config.revision !== REPORT_CONFIG_REVISION) return notAssessed("INVALID_REPORT_CONFIG");
  const prioritization = prioritizeFindings(records, config.aggregation);
  if (prioritization.kind === "REFUSED") return notAssessed("INVALID_REPORT_CONFIG");
  // Part of the findings is never reported as though it were all of them.
  if (prioritization.refused.length > 0) return notAssessed("FINDINGS_REFUSED");
  const { prioritized, informational, carried, summary } = prioritization;
  // A divergence with no analyzed gameplay to belong to describes no result.
  if (context.gameplay.status !== "ANALYZED" && prioritized.length > 0)
    return notAssessed("COVERAGE_INCONSISTENT");

  const categories = REPORTING_CATEGORIES.map((category): ReportCategorySection => ({
    category,
    prioritized: prioritized
      .filter((item) => item.category === category)
      .map((item) => entryOf(item, item.rank)),
    informational: informational
      .filter((item) => item.category === category)
      .map((item) => entryOf(item, null)),
    carried: carried.filter((item) => item.category === category).map((item) => entryOf(item, null)),
  })).filter(
    (section) => section.prioritized.length + section.informational.length + section.carried.length > 0,
  );

  const suppressions = carried.flatMap((item): ReportSuppression[] =>
    item.disposition === "SUPPRESSED" && item.suppressionReason !== null && item.reasonCode !== null
      ? [
          {
            category: item.category,
            suppressionReason: item.suppressionReason,
            reasonCode: item.reasonCode,
            subjectToken: item.subjectToken,
            records: item.occurrences,
          },
        ]
      : [],
  );

  const held = coverageDisclosures(context, prioritized);
  const body: ReportBody = {
    coverage: {
      gameplay: context.gameplay,
      preparation: context.preparation,
      damageDiagnosis: context.diagnosis,
      recordsByDisposition: FINDING_DISPOSITIONS.map((disposition) => ({
        disposition,
        records: summary.recordsByDisposition.find((row) => row.disposition === disposition)?.count ?? 0,
      })),
      disclosures: TLDR_DISCLOSURES.filter((disclosure) => held.has(disclosure)),
    },
    categories,
    suppressions,
  };

  return {
    assessment: "ASSESSED",
    revision: REPORT_REVISION,
    assessmentScope: "PARTIAL",
    ...body,
    markdown: renderReportMarkdown(body),
    magnitude: "NOT_USED",
    findingEffect: { confidence: "NONE", suppression: "NONE" },
  };
}

// ---------------------------------------------------------------------------
// The markdown: templated from the structure above and nothing else
// ---------------------------------------------------------------------------

/** A producer string inside a code span; a backtick in it cannot end the span. */
const code = (text: string): string => `\`${text.replaceAll("`", "'")}\``;

function spanOf(entry: ReportEntry): string {
  const { firstFightTimeMs: first, lastFightTimeMs: last } = entry;
  if (first === null || last === null) return "whole fight";
  return first === last ? `at ${clock(first)}` : `from ${clock(first)} to ${clock(last)}`;
}

const DISPOSITION_PHRASES: Readonly<Record<FindingDisposition, string>> = {
  AUTHORITY_DIVERGENCE: "the authority rejected the observed action in the proven state",
  AUTHORITY_CONSISTENT: "consistent with the authority; compatible only, not an endorsement",
  OBSERVED_FACT: "an observed fact with no verdict",
  SUPPRESSED: "kept but suppressed for a named environmental reason; not counted against the player",
  UNKNOWN: "UNKNOWN: an authority exists but the evidence could not establish the result; not a fault",
  NO_AUTHORITY_AVAILABLE: "no trustworthy authority exists for this question; nothing is claimed",
  UNSUPPORTED: "the analyzer does not support this decision; nothing is claimed",
};

/** What an entry concluded. A profile-relative result says so, and never reads as observed. */
function dispositionPhrase(entry: ReportEntry): string {
  if (entry.stateEvidence === "SIMC_PROFILE_RELATIVE") {
    const token = entry.profileSelectedToken ?? null;
    const selected = token === null ? null : code(token);
    if (entry.disposition === "AUTHORITY_DIVERGENCE")
      return `${simcProfileSelection(entry.disposition, selected)}; the encounter state is modeled, not observed`;
    if (entry.disposition === "AUTHORITY_CONSISTENT")
      return `${simcProfileSelection(entry.disposition, selected)}; compatible only, not an endorsement, and the encounter state is modeled, not observed`;
  }
  return DISPOSITION_PHRASES[entry.disposition];
}

function evidenceText(evidence: readonly EvidenceLocator[]): string {
  const first = evidence[0];
  if (first === undefined) return "Evidence: none located.";
  return (
    `Evidence: ${plural(evidence.length, "event", "events")}; first at report time ${String(first.reportTimeMs)} ms` +
    ` (${code(first.rawType)} in stream ${code(first.streamId)}, page ${String(first.pageOrdinal)}, index ${String(first.indexInPage)}).`
  );
}

function entryLines(entry: ReportEntry): string[] {
  const subject = entry.subjectToken === null ? "(no subject)" : code(entry.subjectToken);
  const head =
    `${entry.position === null ? "-" : `${String(entry.position)}.`} **${subject}**: ` +
    `${plural(entry.occurrences, "occurrence", "occurrences")}${entry.itemKind === "PATTERN" ? " (pattern)" : ""}, ${spanOf(entry)}; ` +
    `${code(entry.disposition)}, ${dispositionPhrase(entry)}.`;
  const why =
    `Why: producer ${code(entry.producer)}, authority ${code(entry.authority)}, state evidence ${code(entry.stateEvidence)}` +
    (entry.reasonCode === null ? "" : `, reason ${code(entry.reasonCode)}`) +
    (entry.suppressionReason === null ? "" : `, suppression reason ${code(entry.suppressionReason)}`) +
    ".";
  const standing = Object.hasOwn(STANDING_SENTENCES, entry.standing)
    ? (entry.standing as DivergenceStanding)
    : null;
  const actionability =
    `Actionability: ${code(entry.actionability)}` +
    (standing === null ? "." : `, standing ${code(standing)}. ${STANDING_SENTENCES[standing]}`);
  return [head, `   - ${why}`, `   - ${actionability}`, `   - ${evidenceText(entry.evidence)}`];
}

function gameplayText(gameplay: TldrGameplay): string {
  if (gameplay.status !== "ANALYZED")
    return `not analyzed (${code(gameplay.status)}). Only specialization-independent facts are reported; this is not evidence of clean play.`;
  return (
    `${String(gameplay.resolvedDecisions)} of ${plural(gameplay.eligibleDecisions, "eligible observed decision", "eligible observed decisions")} resolved against the authority; ` +
    `${String(gameplay.unknownDecisions)} UNKNOWN; ${plural(gameplay.excludedCasts, "cast", "casts")} excluded. ` +
    "Only observed decisions were verified, not moments of inaction."
  );
}

function preparationText(preparation: TldrPreparation): string {
  if (preparation.assessment === "NOT_ASSESSED")
    return `not assessed (${code(preparation.reason)}); nothing is claimed about consumables.`;
  return (
    `health potion ${consumableText(preparation.healthPotion)}, healthstone ${consumableText(preparation.healthstone)}, ` +
    `combat potion ${consumableText(preparation.combatPotion)}. Observed facts, not a judgment.`
  );
}

function diagnosisText(diagnosis: TldrDiagnosisInput | null): string {
  if (diagnosis === null)
    return "not run, because gameplay was not analyzed; nothing is claimed about damage.";
  return diagnosis.assessment === "ASSESSED"
    ? `${plural(diagnosis.statements, "statement links", "statements link")} rejected decisions to a proven difference; see diagnosis.`
    : `not assessed (${code(diagnosis.reason)}); nothing is claimed about damage.`;
}

const SECTION_HEADINGS = {
  prioritized: "Authority divergences (evidence, then actionability order)",
  informational: "Authority-consistent results and observed facts",
  carried: "Not assessed",
} as const;

/**
 * The markdown of a report body. A pure function of its argument: the public
 * projection's `markdown` equals this function over the projected structure.
 */
export function renderReportMarkdown(body: ReportBody): string {
  const { coverage } = body;
  const lines: string[] = [
    "# Fight report",
    "",
    "**Partial analysis.** This report covers only part of the fight. It is not a complete assessment.",
    "",
    "## Coverage",
    "",
    `- Gameplay: ${gameplayText(coverage.gameplay)}`,
    ...(coverage.gameplay.status === "ANALYZED" && coverage.gameplay.simcProfileRelative !== undefined
      ? [`- SimC profile: ${simcProfileCoverageSentence(coverage.gameplay.simcProfileRelative)}`]
      : []),
    `- Preparation: ${preparationText(coverage.preparation)}`,
    `- Damage diagnosis: ${diagnosisText(coverage.damageDiagnosis)}`,
    `- Records by disposition: ${coverage.recordsByDisposition.map((row) => `${code(row.disposition)} ${String(row.records)}`).join(", ")}.`,
    `- Not established: ${coverage.disclosures.map(code).join(", ")}.`,
    // M15-F: blocks the document publishes that this report does not restate.
    ...UNSUMMARIZED_DISCLOSURE_ORDER.filter((disclosure) => coverage.disclosures.includes(disclosure)).map(
      (disclosure) => `- Not in this report: ${UNSUMMARIZED_SENTENCES[disclosure]}`,
    ),
    "",
    "## Findings by decision category",
    "",
  ];
  if (body.categories.length === 0) lines.push("No finding was restated.", "");
  for (const section of body.categories) {
    lines.push(`### ${section.category}`, "");
    for (const key of ["prioritized", "informational", "carried"] as const) {
      const entries = section[key];
      if (entries.length === 0) continue;
      lines.push(`#### ${SECTION_HEADINGS[key]}`, "");
      for (const entry of entries) lines.push(...entryLines(entry));
      lines.push("");
    }
  }
  lines.push("## Suppressions", "");
  if (body.suppressions.length === 0) lines.push("None.");
  for (const row of body.suppressions)
    lines.push(
      `- ${row.subjectToken === null ? "(no subject)" : code(row.subjectToken)} in ${row.category}: ` +
        `${plural(row.records, "record", "records")}, ${code(row.suppressionReason)} (reason ${code(row.reasonCode)}). ` +
        "Kept, not counted against the player.",
    );
  return `${lines.join("\n")}\n`;
}
