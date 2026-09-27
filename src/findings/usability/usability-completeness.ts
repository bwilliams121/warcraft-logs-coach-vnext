/**
 * The POSITIVE usability completeness contract (M11-C4i).
 *
 * WHAT THIS IS FOR
 *
 * A usability verdict of PROVEN_USABLE for an action the player did NOT cast
 * is a strong claim: it lets the first-GCD scan select that action
 * definitely, and so lets the analyzer say "the authority would have chosen
 * X here" about an alternative. Until M11-C4i the only PROVEN_USABLE any
 * specialization produced was the decision's own observed cast. This module
 * is the one place a positive verdict for an UNOBSERVED action may be built.
 *
 * PROVEN_READY IS NOT PROVEN_USABLE
 *
 * A cooldown proven ready says one thing. SimulationCraft's
 * `action_t::ready()` (action.cpp) also requires the cost to be affordable
 * and the player not to be moving when the action cannot be used on the
 * move; a class module may add a `ready()` override; the encounter requires
 * the target in range. A proof of one dimension says nothing about the
 * others. So the verdict is concluded here from EVERY dimension at once:
 *
 *     BUILD_APPLICABILITY     the action is a foreground action for the proven build
 *     READY_OVERRIDE          no class-module ready() override gates it (hand-reviewed)
 *     COOLDOWN_READINESS      its cooldown / a charge is proven available
 *     RESOURCE_AFFORDABILITY  its cost is proven affordable, or it has none
 *     GCD                     a GCD action may start at this decision
 *     RANGE_TARGET            its target and range requirement is proven met, or it has none
 *     MOVEMENT_CAST           a movement / cast restriction cannot bite, or it has none
 *     ACTION_SPECIFIC         any further obligation the specialization registered
 *
 * Each resolves PROVEN or NOT_APPLICABLE through mechanically established
 * authority, or UNKNOWN. ONE UNKNOWN AND THE ACTION IS NOT PROVEN_USABLE.
 *
 * WHY A TOTAL RECORD
 *
 * `UsabilityObligations` maps EVERY dimension to a resolution, so a
 * specialization cannot compile a positive proof that forgot one: adding a
 * cooldown proof for a new action does not inherit usability — it has to
 * state all eight, and the runtime guard in `concludePositiveUsability`
 * refuses a record that is missing one (or names one that does not exist)
 * even when the type system was bypassed.
 *
 * WHAT IT IS NOT
 *
 * Not a negative verdict. An UNKNOWN dimension, a base cost above the
 * observed resource, an untargeted action: none of these ever becomes
 * PROVEN_UNUSABLE here. Negative proofs keep their own reasons and their own
 * precedence in the specialization's usability rule.
 */

import type { EvidenceLocator } from "../../engine/evidence/locator.js";

export const USABILITY_DIMENSIONS = [
  "BUILD_APPLICABILITY",
  "READY_OVERRIDE",
  "COOLDOWN_READINESS",
  "RESOURCE_AFFORDABILITY",
  "GCD",
  "RANGE_TARGET",
  "MOVEMENT_CAST",
  "ACTION_SPECIFIC",
] as const;
export type UsabilityDimension = (typeof USABILITY_DIMENSIONS)[number];

/** A fact value a later coaching layer may quote. Plain data only. */
export type UsabilityFact = string | number | boolean | null;

/** Why a dimension is PROVEN or NOT_APPLICABLE: the authority, the evidence, and the facts. */
export interface DimensionEvidence {
  /** A stable tag naming the proof method (e.g. `COOLDOWN_UPPER_BOUND_ELAPSED`). */
  readonly basis: string;
  /** Author-written; never interpolated from upstream data. */
  readonly detail: string;
  /** The observed events the proof rests on. May be empty (a pinned-data fact needs none). */
  readonly locators: readonly EvidenceLocator[];
  /** The numbers and ids a coaching layer needs to explain the proof. */
  readonly facts: Readonly<Record<string, UsabilityFact>>;
}

export type DimensionResolution =
  | { readonly state: "PROVEN"; readonly evidence: DimensionEvidence }
  | { readonly state: "NOT_APPLICABLE"; readonly evidence: DimensionEvidence }
  | { readonly state: "UNKNOWN"; readonly reason: string; readonly detail: string };

/** Every dimension, resolved. A TOTAL record: a missing dimension is a compile error. */
export type UsabilityObligations = { readonly [D in UsabilityDimension]: DimensionResolution };

export type PositiveUsability =
  | {
      readonly kind: "PROVEN_USABLE";
      readonly simcToken: string;
      readonly dimensions: UsabilityObligations;
    }
  | {
      readonly kind: "NOT_PROVEN";
      readonly simcToken: string;
      readonly dimensions: UsabilityObligations;
      /** The dimensions that did not resolve, in contract order. Never empty. */
      readonly unresolved: readonly UsabilityDimension[];
    };

export function provenDimension(
  basis: string,
  detail: string,
  facts: Readonly<Record<string, UsabilityFact>> = {},
  locators: readonly EvidenceLocator[] = [],
): DimensionResolution {
  return { state: "PROVEN", evidence: { basis, detail, locators, facts } };
}

export function notApplicableDimension(
  basis: string,
  detail: string,
  facts: Readonly<Record<string, UsabilityFact>> = {},
): DimensionResolution {
  return { state: "NOT_APPLICABLE", evidence: { basis, detail, locators: [], facts } };
}

export function unknownDimension(reason: string, detail: string): DimensionResolution {
  return { state: "UNKNOWN", reason, detail };
}

/** Raised when a caller hands the contract a record that is not total. A programming error, never a verdict. */
export class UsabilityObligationsIncomplete extends Error {
  constructor(detail: string) {
    super(`Positive usability obligations are incomplete: ${detail}`);
    this.name = "UsabilityObligationsIncomplete";
  }
}

const STATES = new Set(["PROVEN", "NOT_APPLICABLE", "UNKNOWN"]);

/**
 * Concludes the verdict from every dimension. PROVEN_USABLE only when all
 * eight are PROVEN or NOT_APPLICABLE; otherwise NOT_PROVEN with the
 * unresolved dimensions named.
 *
 * Throws `UsabilityObligationsIncomplete` for a record that omits a
 * dimension, names an unknown one, or carries an unknown state — the type
 * forbids all three, and the guard keeps a bypass from turning into a
 * silent PROVEN_USABLE.
 */
export function concludePositiveUsability(
  simcToken: string,
  dimensions: UsabilityObligations,
): PositiveUsability {
  const record = dimensions as Readonly<Record<string, DimensionResolution | undefined>>;
  const keys = Object.keys(record);
  const extra = keys.filter((key) => !(USABILITY_DIMENSIONS as readonly string[]).includes(key));
  if (extra.length > 0) throw new UsabilityObligationsIncomplete(`unknown dimension(s) ${extra.join(", ")}`);
  for (const dimension of USABILITY_DIMENSIONS) {
    const resolution = record[dimension];
    if (resolution === undefined) {
      throw new UsabilityObligationsIncomplete(`${simcToken} does not resolve ${dimension}`);
    }
    if (!STATES.has(resolution.state)) {
      throw new UsabilityObligationsIncomplete(`${simcToken} resolves ${dimension} to an unknown state`);
    }
  }
  const unresolved = USABILITY_DIMENSIONS.filter((dimension) => record[dimension]?.state === "UNKNOWN");
  if (unresolved.length === 0) return { kind: "PROVEN_USABLE", simcToken, dimensions };
  return { kind: "NOT_PROVEN", simcToken, dimensions, unresolved };
}
