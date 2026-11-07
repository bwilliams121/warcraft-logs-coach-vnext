/**
 * NON-NUMERIC PRIORITY LABELS (M15-C).
 *
 * The question: "among the trustworthy findings, where should the player look
 * first?" It is NOT "how much did this cost". The owner decision of
 * 2026-11-02 (agent/architecture.md "impact is non-numeric prioritization")
 * fixes v1 impact to a qualitative label over the M15-A ranking. No DPS lost,
 * percent performance lost, damage lost, ranking gain or output recovered is
 * produced, read or implied here: current evidence cannot support any of
 * those meanings consistently across specs, roles and builds.
 *
 * WHAT A LABEL READS
 *
 * Only structured fields M15-A already established on each item:
 *
 *   section / standing  authority-backed divergence or not, and whether the
 *                       authority's decision was PROVEN actionable
 *   stateEvidence       evidence quality (only PROVEN and SIMC_PROFILE_RELATIVE
 *                       reach PRIORITIZED)
 *   itemKind            a PATTERN is a demonstrated repetition at or above the
 *                       category's configured threshold; a SINGLE is one record
 *
 * Nothing numeric about outcome, no comparison behavior, no confidence and no
 * estimator result is read. No producer declares a severity, so severity is
 * stated as not declared rather than invented. The occurrence count orders
 * items inside a label (that is M15-A's rank); it never crosses a label.
 *
 * THE RULE
 *
 *   HIGH_PRIORITY    a PATTERN of ACTIONABLE_AUTHORITY_DIVERGENCE: the
 *                    authority's decision was proven possible, repeatedly
 *   MEDIUM_PRIORITY  a SINGLE ACTIONABLE_AUTHORITY_DIVERGENCE
 *   LOW_PRIORITY     a divergence whose actionability is not proven (the
 *                    other two M15-A standings), single or pattern: a reader
 *                    may look, but nothing establishes the alternative was
 *                    possible, so it never outranks a proven one. Also every
 *                    SIMC_PROFILE_RELATIVE divergence, whatever its standing:
 *                    its encounter state is modeled, and M15-A ranks it last
 *   NOT_PRIORITIZED  everything informational (AUTHORITY_CONSISTENT,
 *                    OBSERVED_FACT) and every non-assessment (SUPPRESSED,
 *                    UNKNOWN, NO_AUTHORITY_AVAILABLE, UNSUPPORTED). This is
 *                    the absence of a priority, never a penalty or a failure.
 *
 * Because M15-A orders by standing first and a PATTERN always has more
 * occurrences than a SINGLE, labels never increase down the ranking: a label
 * restates the ranking coarsely and never reorders it.
 *
 * A refused prioritization labels nothing. Records M15-A refused are listed
 * by id, unlabelled: a refusal is not a priority either way.
 */

import type { ReportingCategory } from "./finding-record.js";
import type { FindingPrioritization, ItemStanding, ReportItem, ReportSection } from "./prioritization.js";

export const PRIORITY_LABEL_REVISION = "finding-priority-label/1" as const;

/** Strongest first. Means "where to look first", never "how much it cost". */
export const PRIORITY_LABELS = [
  "HIGH_PRIORITY",
  "MEDIUM_PRIORITY",
  "LOW_PRIORITY",
  "NOT_PRIORITIZED",
] as const;
export type PriorityLabel = (typeof PRIORITY_LABELS)[number];

/** Why an item has its label, one basis per rule line. */
export const PRIORITY_BASES = [
  "REPEATED_ACTIONABLE_DIVERGENCE",
  "SINGLE_ACTIONABLE_DIVERGENCE",
  "DIVERGENCE_ACTIONABILITY_UNPROVEN",
  "SIMC_PROFILE_RELATIVE_DIVERGENCE",
  "INFORMATIONAL",
  "NON_ASSESSMENT",
] as const;
export type PriorityBasis = (typeof PRIORITY_BASES)[number];

export const PRIORITY_LABEL_OF_BASIS: Readonly<Record<PriorityBasis, PriorityLabel>> = {
  REPEATED_ACTIONABLE_DIVERGENCE: "HIGH_PRIORITY",
  SINGLE_ACTIONABLE_DIVERGENCE: "MEDIUM_PRIORITY",
  DIVERGENCE_ACTIONABILITY_UNPROVEN: "LOW_PRIORITY",
  SIMC_PROFILE_RELATIVE_DIVERGENCE: "LOW_PRIORITY",
  INFORMATIONAL: "NOT_PRIORITIZED",
  NON_ASSESSMENT: "NOT_PRIORITIZED",
};

/** The item fields a label is allowed to read, stated so a consumer can audit it. */
export const PRIORITY_INPUTS = ["SECTION", "STANDING", "STATE_EVIDENCE", "ITEM_KIND"] as const;

export interface LabelledItem {
  readonly itemId: string;
  readonly section: ReportSection;
  readonly standing: ItemStanding;
  readonly category: ReportingCategory;
  readonly itemKind: ReportItem["itemKind"];
  readonly occurrences: number;
  /** M15-A's 1-based position for a PRIORITIZED item, null otherwise. */
  readonly rank: number | null;
  readonly label: PriorityLabel;
  readonly basis: PriorityBasis;
}

export type PriorityLabelling =
  | {
      readonly kind: "LABELLED";
      readonly revision: typeof PRIORITY_LABEL_REVISION;
      readonly prioritizationRevision: string;
      readonly meaning: "WHERE_TO_LOOK_FIRST";
      /** Stated so no consumer reads a label as a cost. */
      readonly numericEstimate: "NOT_PRODUCED";
      readonly inputs: typeof PRIORITY_INPUTS;
      readonly producerSeverity: "NOT_DECLARED";
      readonly findingEffect: {
        readonly confidence: "NONE";
        readonly suppression: "NONE";
        readonly score: "NONE";
      };
      /** Prioritized items in rank order, then informational, then carried, each in M15-A order. */
      readonly items: readonly LabelledItem[];
      /** Finding ids M15-A refused. Never labelled. */
      readonly unlabelledRefused: readonly string[];
      /** Items per label; every label listed, zero included. */
      readonly itemsByLabel: readonly { readonly label: PriorityLabel; readonly items: number }[];
    }
  | { readonly kind: "NOT_LABELLED"; readonly reason: "PRIORITIZATION_REFUSED" };

export function basisOf(item: ReportItem): PriorityBasis {
  if (item.section === "INFORMATIONAL") return "INFORMATIONAL";
  if (item.section === "CARRIED") return "NON_ASSESSMENT";
  // A PRIORITIZED item is a PROVEN or profile-relative divergence (M15-A refuses
  // any other); the check is restated so an item built any other way never gains
  // a priority.
  if (item.disposition !== "AUTHORITY_DIVERGENCE") return "NON_ASSESSMENT";
  if (item.stateEvidence === "SIMC_PROFILE_RELATIVE") return "SIMC_PROFILE_RELATIVE_DIVERGENCE";
  if (item.stateEvidence !== "PROVEN") return "NON_ASSESSMENT";
  if (item.standing !== "ACTIONABLE_AUTHORITY_DIVERGENCE") return "DIVERGENCE_ACTIONABILITY_UNPROVEN";
  return item.itemKind === "PATTERN" ? "REPEATED_ACTIONABLE_DIVERGENCE" : "SINGLE_ACTIONABLE_DIVERGENCE";
}

function labelled(item: ReportItem, rank: number | null): LabelledItem {
  const basis = basisOf(item);
  return {
    itemId: item.itemId,
    section: item.section,
    standing: item.standing,
    category: item.category,
    itemKind: item.itemKind,
    occurrences: item.occurrences,
    rank,
    label: PRIORITY_LABEL_OF_BASIS[basis],
    basis,
  };
}

export function labelPriorities(prioritization: FindingPrioritization): PriorityLabelling {
  if (prioritization.kind !== "PRIORITIZED")
    return { kind: "NOT_LABELLED", reason: "PRIORITIZATION_REFUSED" };
  const items = [
    ...prioritization.prioritized.map((item) => labelled(item, item.rank)),
    ...prioritization.informational.map((item) => labelled(item, null)),
    ...prioritization.carried.map((item) => labelled(item, null)),
  ];
  return {
    kind: "LABELLED",
    revision: PRIORITY_LABEL_REVISION,
    prioritizationRevision: prioritization.revision,
    meaning: "WHERE_TO_LOOK_FIRST",
    numericEstimate: "NOT_PRODUCED",
    inputs: PRIORITY_INPUTS,
    producerSeverity: "NOT_DECLARED",
    findingEffect: { confidence: "NONE", suppression: "NONE", score: "NONE" },
    items,
    unlabelledRefused: prioritization.refused.map((record) => record.findingId),
    itemsByLabel: PRIORITY_LABELS.map((label) => ({
      label,
      items: items.filter((item) => item.label === label).length,
    })),
  };
}
