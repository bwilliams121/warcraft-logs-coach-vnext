/**
 * Environment MATERIALITY (M11-G3-4): whether an unresolved environment field
 * can move a current-setup result enough to block publication.
 *
 * Spec knowledge supplies MEASUREMENTS (pinned-engine runs that change one
 * field at a time); this module owns the policy and never redefines a
 * measurement. The policy is fail-closed:
 *
 *   no measurement for the field          -> PUBLISHABILITY_BLOCKING
 *   bit-identical result (inert at pin)   -> NON_BLOCKING
 *   |relative change| >= threshold        -> PUBLISHABILITY_BLOCKING
 *   below threshold, and the comparison
 *   bounds every plausible actual value   -> NON_BLOCKING
 *   below threshold, but the comparison
 *   is one example of an open set         -> PUBLISHABILITY_BLOCKING
 *                                            (semantic ambiguity: one example
 *                                            does not bound the unknown)
 */

import type { RaidBuffName } from "./model.js";

export const ENVIRONMENT_MATERIALITY_POLICY = {
  id: "ENVIRONMENT_MATERIALITY_V1",
  version: 1,
  relativeDpsThreshold: 0.005,
} as const;

export type MaterialityField =
  | `RAID_BUFF:${RaidBuffName}`
  | "FLASK_PRESENCE"
  | "FLASK_RANK"
  | "FOOD_PRESENCE"
  | "AUGMENTATION_PRESENCE"
  | "POTION_PRESENCE"
  | "POTION_RANK"
  | "BLOODLUST_PRESENCE"
  | "BLOODLUST_WHOLE_SECOND";

export interface EnvironmentMeasurement {
  readonly field: MaterialityField;
  /** What two values were compared, e.g. "flask rank 2 vs rank 1". */
  readonly comparison: string;
  /** Signed relative mean-DPS change of the variant against the baseline. */
  readonly relativeChange: number;
  /** True only when the variant's result was bit-identical to the baseline's. */
  readonly identicalResult: boolean;
  /**
   * BOUNDS_ALL_PLAUSIBLE: the compared values span every plausible actual
   * value (on/off; the only two ranks). EXAMPLE_ONLY: one member of an open
   * set (an unknown food), which bounds nothing.
   */
  readonly coverage: "BOUNDS_ALL_PLAUSIBLE" | "EXAMPLE_ONLY";
  readonly simulationPolicy: string;
}

/** What a specialization supplies: measurements on its development character at the pin. */
export interface EnvironmentSpecFacts {
  readonly specKey: string;
  readonly basis: {
    readonly bench: string;
    readonly character: string;
    readonly executionProfile: string;
    readonly baseline: string;
  };
  readonly measurements: readonly EnvironmentMeasurement[];
  /** Spec-worded disclosures the internal report must carry (e.g. the tank-load statement). */
  readonly disclosures: readonly string[];
  /** Whether the spec's built-in APL owns potion timing, with the line(s) verbatim. */
  readonly potionTiming: { readonly owner: "BUILT_IN_APL"; readonly aplLines: readonly string[] };
}

export interface FieldMateriality {
  readonly field: MaterialityField;
  readonly classification: "PUBLISHABILITY_BLOCKING" | "NON_BLOCKING";
  readonly inert: boolean;
  readonly rationale: string;
  readonly measurement: EnvironmentMeasurement | null;
}

export function classifyMateriality(field: MaterialityField, facts: EnvironmentSpecFacts): FieldMateriality {
  const threshold = ENVIRONMENT_MATERIALITY_POLICY.relativeDpsThreshold;
  const measurement = facts.measurements.find((entry) => entry.field === field) ?? null;
  if (measurement === null) {
    return {
      field,
      classification: "PUBLISHABILITY_BLOCKING",
      inert: false,
      rationale: `no ${facts.specKey} measurement for ${field}: materiality unknown, fail closed`,
      measurement,
    };
  }
  const size = Math.abs(measurement.relativeChange);
  const percent = `${(measurement.relativeChange * 100).toFixed(2)}%`;
  if (measurement.identicalResult) {
    return {
      field,
      classification: "NON_BLOCKING",
      inert: true,
      rationale: `inert at the pin: ${measurement.comparison} is bit-identical`,
      measurement,
    };
  }
  if (size >= threshold) {
    return {
      field,
      classification: "PUBLISHABILITY_BLOCKING",
      inert: false,
      rationale: `${measurement.comparison}: ${percent} >= ${String(threshold * 100)}%`,
      measurement,
    };
  }
  if (measurement.coverage === "EXAMPLE_ONLY") {
    return {
      field,
      classification: "PUBLISHABILITY_BLOCKING",
      inert: false,
      rationale: `${measurement.comparison}: ${percent}, but one example does not bound the unknown value (semantic ambiguity)`,
      measurement,
    };
  }
  return {
    field,
    classification: "NON_BLOCKING",
    inert: false,
    rationale: `${measurement.comparison}: ${percent} < ${String(threshold * 100)}% across every plausible value`,
    measurement,
  };
}
