/**
 * Finding aggregation thresholds (M15-A), configurable and documented.
 *
 * CLAUDE.md "Timing Tolerance": tiny repeated differences should be
 * aggregated into a pattern rather than emitted as dozens of individual
 * findings, and the rule is configurable by finding category rather than one
 * hard-coded global value.
 *
 * `minOccurrencesForPattern` is the number of records sharing one
 * aggregation group (see `prioritization.ts`) at which they are reported as
 * ONE pattern instead of individually. Below it, each record stays a single
 * item. The default of 3 is a starting point, not a validated value: it is
 * to be revisited against real logs (agent/follow-ups.md "After M15-A").
 *
 * A threshold only changes how many items a reader sees. It never changes a
 * record's disposition, standing, actionability or evidence quality, so no
 * threshold can turn a non-assessment into a failure or raise a standing.
 */

import { REPORTING_CATEGORIES, type ReportingCategory } from "./finding-record.js";

export const AGGREGATION_CONFIG_REVISION = "finding-aggregation/1" as const;

export interface AggregationConfig {
  readonly revision: typeof AGGREGATION_CONFIG_REVISION;
  readonly defaultMinOccurrencesForPattern: number;
  readonly minOccurrencesForPatternByCategory: Readonly<Partial<Record<ReportingCategory, number>>>;
}

export const DEFAULT_AGGREGATION_CONFIG: AggregationConfig = {
  revision: AGGREGATION_CONFIG_REVISION,
  defaultMinOccurrencesForPattern: 3,
  minOccurrencesForPatternByCategory: {},
};

/** The smallest meaningful pattern: one repetition. A threshold of 1 would relabel every single finding. */
export const MIN_PATTERN_THRESHOLD = 2;

export type AggregationConfigProblem =
  | { readonly kind: "UNKNOWN_REVISION"; readonly revision: string }
  | {
      readonly kind: "INVALID_THRESHOLD";
      readonly category: ReportingCategory | "DEFAULT";
      readonly value: number;
    }
  | { readonly kind: "UNKNOWN_CATEGORY"; readonly category: string };

/** Every problem with a config; empty means usable. A config with a problem is never applied. */
export function validateAggregationConfig(config: AggregationConfig): readonly AggregationConfigProblem[] {
  const problems: AggregationConfigProblem[] = [];
  if (config.revision !== AGGREGATION_CONFIG_REVISION)
    problems.push({ kind: "UNKNOWN_REVISION", revision: String(config.revision) });
  const valid = (value: number) => Number.isInteger(value) && value >= MIN_PATTERN_THRESHOLD;
  if (!valid(config.defaultMinOccurrencesForPattern))
    problems.push({
      kind: "INVALID_THRESHOLD",
      category: "DEFAULT",
      value: config.defaultMinOccurrencesForPattern,
    });
  for (const [category, value] of Object.entries(config.minOccurrencesForPatternByCategory)) {
    if (!(REPORTING_CATEGORIES as readonly string[]).includes(category)) {
      problems.push({ kind: "UNKNOWN_CATEGORY", category });
      continue;
    }
    if (value === undefined || !valid(value))
      problems.push({
        kind: "INVALID_THRESHOLD",
        category: category as ReportingCategory,
        value: Number(value),
      });
  }
  return problems;
}

export function thresholdFor(config: AggregationConfig, category: ReportingCategory): number {
  return config.minOccurrencesForPatternByCategory[category] ?? config.defaultMinOccurrencesForPattern;
}
