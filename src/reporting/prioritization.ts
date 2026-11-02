/**
 * FINDING AGGREGATION AND PRIORITIZATION (M15-A).
 *
 * The question: "given the structured findings the producers already made,
 * which deserve a reader's attention first, and which repeat often enough to
 * be one pattern?" It reads `ReportableFinding` records only. It queries
 * nothing, re-evaluates nothing and creates no finding: every output item is
 * one input record or a group of them, and every input record appears in
 * exactly one output item or in `refused`.
 *
 * THREE SECTIONS, NEVER MIXED
 *
 *   prioritized    AUTHORITY_DIVERGENCE records with PROVEN state and at
 *                  least one evidence locator. The only ranked section.
 *   informational  AUTHORITY_CONSISTENT and OBSERVED_FACT. Never failures.
 *   carried        SUPPRESSED, UNKNOWN, NO_AUTHORITY_AVAILABLE and
 *                  UNSUPPORTED, each labelled with its reason. Never
 *                  ranked, never failures, never counted as assessed.
 *
 * HOW THE PRIORITIZED SECTION IS ORDERED
 *
 * By evidence quality, then actionability, and only then by deterministic
 * tie-breaks:
 *
 *   1. state evidence: PROVEN (the only kind admitted to the section)
 *   2. actionability standing, strongest first:
 *        ACTIONABLE_AUTHORITY_DIVERGENCE              decision proven possible
 *        DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN observed action executed
 *        DIVERGENCE_ACTIONABILITY_NOT_ESTABLISHED      not evaluated / unknown
 *   3. occurrences, more first (a pattern before a one-off)
 *   4. category, in REPORTING_CATEGORIES order
 *   5. earliest fight time, whole-fight items last
 *   6. item id
 *
 * No magnitude, damage delta, comparison behavior, confidence or score is
 * read, because none is a record field. Only the first standing is
 * actionable; the other two are authority divergences whose actionability is
 * not proven, and say so in their standing.
 *
 * AGGREGATION NEVER INFLATES
 *
 * Records group only when EVERYTHING that decides their standing is equal:
 * producer, category, specialization, disposition, authority, reason code,
 * suppression reason, state evidence, actionability and the producer's
 * aggregation key. So a pattern has exactly its members' standing, a proven
 * member is never diluted by an unproven one, and an UNKNOWN never pools
 * with a divergence. A group at or above its category threshold is reported
 * as one PATTERN item; below it, every member stays a SINGLE item.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";
import {
  type AggregationConfig,
  type AggregationConfigProblem,
  thresholdFor,
  validateAggregationConfig,
} from "./aggregation-config.js";
import {
  ACTIONABILITY_LEVELS,
  type ActionabilityLevel,
  FINDING_DISPOSITIONS,
  type FindingDisposition,
  NO_AUTHORITY,
  NON_ASSESSMENT_DISPOSITIONS,
  REPORTING_CATEGORIES,
  type ReportableFinding,
  type ReportingCategory,
  STATE_EVIDENCE_STATES,
  type StateEvidenceState,
  SUPPRESSION_REASONS,
  type SuppressionReason,
} from "./finding-record.js";

export const PRIORITIZATION_REVISION = "finding-prioritization/1" as const;

export type ReportSection = "PRIORITIZED" | "INFORMATIONAL" | "CARRIED";

export const DIVERGENCE_STANDINGS = [
  "ACTIONABLE_AUTHORITY_DIVERGENCE",
  "DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN",
  "DIVERGENCE_ACTIONABILITY_NOT_ESTABLISHED",
] as const;
export type DivergenceStanding = (typeof DIVERGENCE_STANDINGS)[number];

/** A divergence's standing; every other disposition stands as itself. */
export type ItemStanding = DivergenceStanding | Exclude<FindingDisposition, "AUTHORITY_DIVERGENCE">;

export const RECORD_PROBLEMS = [
  "EMPTY_FINDING_ID",
  "DUPLICATE_FINDING_ID",
  "UNKNOWN_CATEGORY",
  "UNKNOWN_DISPOSITION",
  "UNKNOWN_STATE_EVIDENCE",
  "UNKNOWN_ACTIONABILITY",
  "MISSING_PRODUCER",
  "MISSING_AUTHORITY",
  "AUTHORITY_DISPOSITION_MISMATCH",
  "MISSING_REASON_CODE",
  "SUPPRESSION_REASON_MISMATCH",
  "DIVERGENCE_WITHOUT_PROVEN_STATE",
  "DIVERGENCE_WITHOUT_EVIDENCE",
  "INVALID_FIGHT_TIME",
  "EMPTY_AGGREGATION_KEY",
] as const;
export type RecordProblem = (typeof RECORD_PROBLEMS)[number];

export interface RefusedRecord {
  readonly findingId: string;
  readonly problems: readonly RecordProblem[];
}

export interface ReportItem {
  readonly itemKind: "SINGLE" | "PATTERN";
  readonly itemId: string;
  readonly section: ReportSection;
  readonly standing: ItemStanding;
  readonly producer: string;
  readonly category: ReportingCategory;
  readonly specId: string | null;
  readonly disposition: FindingDisposition;
  readonly authority: string;
  readonly reasonCode: string | null;
  readonly suppressionReason: SuppressionReason | null;
  readonly stateEvidence: StateEvidenceState;
  readonly actionability: ActionabilityLevel;
  readonly aggregationKey: string | null;
  /** Members by fight time, then id. One for a SINGLE. */
  readonly findingIds: readonly string[];
  readonly occurrences: number;
  readonly firstFightTimeMs: number | null;
  readonly lastFightTimeMs: number | null;
  /** Union of the members' locators, deduplicated, in member order. References only. */
  readonly evidence: readonly EvidenceLocator[];
}

export interface RankedItem extends ReportItem {
  readonly section: "PRIORITIZED";
  readonly standing: DivergenceStanding;
  /** 1-based position in the prioritized section. */
  readonly rank: number;
}

export interface PrioritizationSummary {
  readonly inputRecords: number;
  readonly refusedRecords: number;
  /** Valid records per disposition; every disposition listed, zero included. */
  readonly recordsByDisposition: readonly {
    readonly disposition: FindingDisposition;
    readonly count: number;
  }[];
  readonly prioritizedRecords: number;
  readonly actionableDivergenceRecords: number;
  readonly informationalRecords: number;
  readonly nonAssessmentRecords: number;
  readonly patterns: number;
  /** True when any record is a non-assessment or refused: the set is not a complete assessment. */
  readonly includesNonAssessments: boolean;
}

export type FindingPrioritization =
  | {
      readonly kind: "PRIORITIZED";
      readonly revision: typeof PRIORITIZATION_REVISION;
      readonly config: AggregationConfig;
      readonly orderedBy: readonly [
        "STATE_EVIDENCE",
        "ACTIONABILITY",
        "OCCURRENCES",
        "CATEGORY",
        "FIRST_FIGHT_TIME",
        "ITEM_ID",
      ];
      /** Stated so no consumer reads rank as impact: nothing numeric about outcome is used. */
      readonly magnitude: "NOT_USED";
      readonly findingEffect: {
        readonly confidence: "NONE";
        readonly suppression: "NONE";
        readonly score: "NONE";
      };
      readonly prioritized: readonly RankedItem[];
      readonly informational: readonly ReportItem[];
      readonly carried: readonly ReportItem[];
      readonly refused: readonly RefusedRecord[];
      readonly summary: PrioritizationSummary;
    }
  | {
      readonly kind: "REFUSED";
      readonly reason: "INVALID_AGGREGATION_CONFIG";
      readonly problems: readonly AggregationConfigProblem[];
    };

const includes = (list: readonly string[], value: unknown): boolean =>
  typeof value === "string" && list.includes(value);
const nonEmpty = (value: unknown): boolean => typeof value === "string" && value.length > 0;

function problemsOf(record: ReportableFinding): RecordProblem[] {
  const problems: RecordProblem[] = [];
  if (!nonEmpty(record.findingId)) problems.push("EMPTY_FINDING_ID");
  if (!nonEmpty(record.producer)) problems.push("MISSING_PRODUCER");
  if (!includes(REPORTING_CATEGORIES, record.category)) problems.push("UNKNOWN_CATEGORY");
  const dispositionKnown = includes(FINDING_DISPOSITIONS, record.disposition);
  if (!dispositionKnown) problems.push("UNKNOWN_DISPOSITION");
  if (!includes(STATE_EVIDENCE_STATES, record.stateEvidence)) problems.push("UNKNOWN_STATE_EVIDENCE");
  if (!includes(ACTIONABILITY_LEVELS, record.actionability)) problems.push("UNKNOWN_ACTIONABILITY");
  if (!nonEmpty(record.authority)) problems.push("MISSING_AUTHORITY");
  else if ((record.authority === NO_AUTHORITY) !== (record.disposition === "NO_AUTHORITY_AVAILABLE"))
    problems.push("AUTHORITY_DISPOSITION_MISMATCH");
  if (
    dispositionKnown &&
    includes(NON_ASSESSMENT_DISPOSITIONS, record.disposition) &&
    !nonEmpty(record.reasonCode)
  )
    problems.push("MISSING_REASON_CODE");
  const suppressed = record.disposition === "SUPPRESSED";
  if (
    suppressed ? !includes(SUPPRESSION_REASONS, record.suppressionReason) : record.suppressionReason !== null
  )
    problems.push("SUPPRESSION_REASON_MISMATCH");
  if (record.disposition === "AUTHORITY_DIVERGENCE") {
    if (record.stateEvidence !== "PROVEN") problems.push("DIVERGENCE_WITHOUT_PROVEN_STATE");
    if (!Array.isArray(record.evidence) || record.evidence.length === 0)
      problems.push("DIVERGENCE_WITHOUT_EVIDENCE");
  }
  if (record.fightTimeMs !== null && !Number.isFinite(record.fightTimeMs))
    problems.push("INVALID_FIGHT_TIME");
  if (record.aggregationKey !== null && !nonEmpty(record.aggregationKey))
    problems.push("EMPTY_AGGREGATION_KEY");
  return problems;
}

function standingOf(record: ReportableFinding): { section: ReportSection; standing: ItemStanding } {
  const { disposition } = record;
  if (disposition === "AUTHORITY_DIVERGENCE") {
    const standing: DivergenceStanding =
      record.actionability === "DECISION_PROVEN_ACTIONABLE"
        ? "ACTIONABLE_AUTHORITY_DIVERGENCE"
        : record.actionability === "OBSERVED_EXECUTION_ONLY"
          ? "DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN"
          : "DIVERGENCE_ACTIONABILITY_NOT_ESTABLISHED";
    return { section: "PRIORITIZED", standing };
  }
  if (disposition === "AUTHORITY_CONSISTENT" || disposition === "OBSERVED_FACT")
    return { section: "INFORMATIONAL", standing: disposition };
  return { section: "CARRIED", standing: disposition };
}

const byTimeThenId = (a: ReportableFinding, b: ReportableFinding): number =>
  compareTime(a.fightTimeMs, b.fightTimeMs) || compareText(a.findingId, b.findingId);

function compareTime(a: number | null, b: number | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return a - b;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function locatorKey(locator: EvidenceLocator): string {
  return `${locator.streamId}#${locator.pageOrdinal}#${locator.indexInPage}#${locator.ingestionOrdinal}`;
}

function groupKeyOf(record: ReportableFinding): string {
  return JSON.stringify([
    record.producer,
    record.category,
    record.specId,
    record.disposition,
    record.authority,
    record.reasonCode,
    record.suppressionReason,
    record.stateEvidence,
    record.actionability,
    record.aggregationKey,
  ]);
}

function itemOf(members: readonly ReportableFinding[], itemKind: ReportItem["itemKind"]): ReportItem {
  const first = members[0] as ReportableFinding;
  const { section, standing } = standingOf(first);
  const evidence: EvidenceLocator[] = [];
  const seen = new Set<string>();
  for (const member of members)
    for (const locator of member.evidence) {
      const key = locatorKey(locator);
      if (seen.has(key)) continue;
      seen.add(key);
      evidence.push(locator);
    }
  const times = members.map((member) => member.fightTimeMs).filter((time): time is number => time !== null);
  return {
    itemKind,
    itemId:
      itemKind === "SINGLE"
        ? `finding:${first.findingId}`
        : `pattern:${first.findingId}+${members.length - 1}`,
    section,
    standing,
    producer: first.producer,
    category: first.category,
    specId: first.specId,
    disposition: first.disposition,
    authority: first.authority,
    reasonCode: first.reasonCode,
    suppressionReason: first.suppressionReason,
    stateEvidence: first.stateEvidence,
    actionability: first.actionability,
    aggregationKey: first.aggregationKey,
    findingIds: members.map((member) => member.findingId),
    occurrences: members.length,
    firstFightTimeMs: times.length === 0 ? null : Math.min(...times),
    lastFightTimeMs: times.length === 0 ? null : Math.max(...times),
    evidence,
  };
}

const indexIn = (list: readonly string[], value: string): number => list.indexOf(value);

function compareCommon(a: ReportItem, b: ReportItem): number {
  return (
    indexIn(REPORTING_CATEGORIES, a.category) - indexIn(REPORTING_CATEGORIES, b.category) ||
    compareTime(a.firstFightTimeMs, b.firstFightTimeMs) ||
    compareText(a.itemId, b.itemId)
  );
}

function comparePrioritized(a: ReportItem, b: ReportItem): number {
  return (
    indexIn(STATE_EVIDENCE_STATES, a.stateEvidence) - indexIn(STATE_EVIDENCE_STATES, b.stateEvidence) ||
    indexIn(DIVERGENCE_STANDINGS, a.standing) - indexIn(DIVERGENCE_STANDINGS, b.standing) ||
    b.occurrences - a.occurrences ||
    compareCommon(a, b)
  );
}

function compareUnranked(a: ReportItem, b: ReportItem): number {
  return (
    indexIn(FINDING_DISPOSITIONS, a.disposition) - indexIn(FINDING_DISPOSITIONS, b.disposition) ||
    compareCommon(a, b)
  );
}

export function prioritizeFindings(
  records: readonly ReportableFinding[],
  config: AggregationConfig,
): FindingPrioritization {
  const configProblems = validateAggregationConfig(config);
  if (configProblems.length > 0)
    return { kind: "REFUSED", reason: "INVALID_AGGREGATION_CONFIG", problems: configProblems };

  const idCounts = new Map<string, number>();
  for (const record of records) idCounts.set(record.findingId, (idCounts.get(record.findingId) ?? 0) + 1);

  const refused: RefusedRecord[] = [];
  const valid: ReportableFinding[] = [];
  for (const record of records) {
    const problems = problemsOf(record);
    if ((idCounts.get(record.findingId) ?? 0) > 1) problems.unshift("DUPLICATE_FINDING_ID");
    if (problems.length > 0) refused.push({ findingId: String(record.findingId), problems });
    else valid.push(record);
  }
  valid.sort(byTimeThenId);

  const groups = new Map<string, ReportableFinding[]>();
  const items: ReportItem[] = [];
  for (const record of valid) {
    if (record.aggregationKey === null) {
      items.push(itemOf([record], "SINGLE"));
      continue;
    }
    const key = groupKeyOf(record);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [record]);
    else group.push(record);
  }
  let patterns = 0;
  for (const group of groups.values()) {
    const first = group[0] as ReportableFinding;
    if (group.length >= thresholdFor(config, first.category)) {
      items.push(itemOf(group, "PATTERN"));
      patterns += 1;
    } else for (const record of group) items.push(itemOf([record], "SINGLE"));
  }

  const prioritized = items
    .filter((item) => item.section === "PRIORITIZED")
    .sort(comparePrioritized)
    .map((item, index): RankedItem => ({
      ...item,
      section: "PRIORITIZED",
      standing: item.standing as DivergenceStanding,
      rank: index + 1,
    }));
  const informational = items.filter((item) => item.section === "INFORMATIONAL").sort(compareUnranked);
  const carried = items.filter((item) => item.section === "CARRIED").sort(compareUnranked);
  refused.sort((a, b) => compareText(a.findingId, b.findingId));

  const countOf = (disposition: FindingDisposition) =>
    valid.filter((record) => record.disposition === disposition).length;
  const recordsIn = (list: readonly ReportItem[]) => list.reduce((sum, item) => sum + item.occurrences, 0);
  const nonAssessmentRecords = recordsIn(carried);
  return {
    kind: "PRIORITIZED",
    revision: PRIORITIZATION_REVISION,
    config,
    orderedBy: ["STATE_EVIDENCE", "ACTIONABILITY", "OCCURRENCES", "CATEGORY", "FIRST_FIGHT_TIME", "ITEM_ID"],
    magnitude: "NOT_USED",
    findingEffect: { confidence: "NONE", suppression: "NONE", score: "NONE" },
    prioritized,
    informational,
    carried,
    refused,
    summary: {
      inputRecords: records.length,
      refusedRecords: refused.length,
      recordsByDisposition: FINDING_DISPOSITIONS.map((disposition) => ({
        disposition,
        count: countOf(disposition),
      })),
      prioritizedRecords: recordsIn(prioritized),
      actionableDivergenceRecords: recordsIn(
        prioritized.filter((item) => item.standing === "ACTIONABLE_AUTHORITY_DIVERGENCE"),
      ),
      informationalRecords: recordsIn(informational),
      nonAssessmentRecords,
      patterns,
      includesNonAssessments: nonAssessmentRecords > 0 || refused.length > 0,
    },
  };
}
