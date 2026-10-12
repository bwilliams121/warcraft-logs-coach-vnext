/**
 * M11-G2 post-hoc comparison facts: the EVIDENCE BASIS of one fight's facts.
 *
 * WHAT THIS DOMAIN IS
 *
 * "What factually happened differently between the subject and the cohort?"
 * — counts, sequences, windows, targets, sub-actors, Warcraft Logs-computed
 * amounts. Never what anyone did wrong, what was lost, what should change, or
 * which player played better. It is POST-HOC: it may read the completed fight,
 * so the authority branch (`src/simc`, `src/specs`) must never read it
 * (contract test), and nothing here becomes a MATCH/REJECTED input.
 *
 * TWO BASES, NEVER MIXED
 *
 *   COVERAGE_VOUCHED                the fight's own coverage grants decide
 *                                   (E1 semantics): COMPLETE -> EXACT counts
 *                                   and EXHAUSTIVE collections. The subject's
 *                                   M11-E2 fixture.
 *   UNCERTIFIED_FILTERED_CAPTURE    a server-filtered capture whose grants were
 *                                   withheld (no table certificate). Every
 *                                   observed event is real and more may exist:
 *                                   E1's PARTIAL semantics — counts AT_LEAST
 *                                   (never "at least 0"), raw-field sums
 *                                   UNKNOWN, collections OBSERVED_ONLY. The
 *                                   three comparison fights.
 *
 * Neither basis ever turns an absence into zero.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { EvidenceCategory } from "../wcl/evidence-capability.js";
import {
  catalogCoverage,
  combineCoverage,
  eventCategoryCoverage,
  provenCount,
  type FactCoverage,
  type FactCoverageState,
  type FactWindow,
  type Proven,
} from "../combat-facts/coverage.js";
import type { RawFieldSum } from "../combat-facts/window-query.js";

export type EvidenceBasis =
  | { readonly kind: "COVERAGE_VOUCHED" }
  | { readonly kind: "UNCERTIFIED_FILTERED_CAPTURE"; readonly reason: string };

export interface FactState {
  readonly basis: EvidenceBasis["kind"];
  readonly state: FactCoverageState;
  /** The E1 coverage behind a COVERAGE_VOUCHED state; `null` for an uncertified capture. */
  readonly coverage: FactCoverage | null;
}

/** The state of a fact about `sourceActorIds` over `window`, from these categories. */
export function factStateOf(
  fight: CombatFight,
  basis: EvidenceBasis,
  categories: readonly EvidenceCategory[],
  window: FactWindow,
  sourceActorIds: readonly number[],
  needsCatalog = false,
): FactState {
  if (basis.kind === "UNCERTIFIED_FILTERED_CAPTURE") {
    return { basis: basis.kind, state: "PARTIAL", coverage: null };
  }
  const coverage = combineCoverage([
    ...categories.map((category) => eventCategoryCoverage(fight, category, window, sourceActorIds)),
    ...(needsCatalog ? [catalogCoverage(fight)] : []),
  ]);
  return { basis: basis.kind, state: coverage.state, coverage };
}

/** A count under a fact state: EXACT / AT_LEAST (never "at least 0") / UNKNOWN. */
export function countUnder(state: FactState, observed: number): Proven<number> {
  return provenCount(state.state, observed);
}

export type FactCollectionClaim = "EXHAUSTIVE" | "OBSERVED_ONLY";

/** Items observed, and exactly what is claimed about the rest. */
export interface FactCollection<T> {
  readonly items: readonly T[];
  readonly claim: FactCollectionClaim;
}

export function collectionUnder<T>(state: FactState, items: readonly T[]): FactCollection<T> {
  return { items, claim: state.state === "COMPLETE" ? "EXHAUSTIVE" : "OBSERVED_ONLY" };
}

/**
 * The sum of the raw `amount` field — RAW_AMOUNT_FIELD_SUM, never "damage".
 * EXACT only under COMPLETE coverage; under PARTIAL no bound exists because no
 * raw field's sign is proven (M1 NOT_YET_PROVEN).
 */
export function rawAmountFieldSumUnder(state: FactState, amounts: readonly number[]): Proven<RawFieldSum> {
  if (state.state === "PARTIAL") return { kind: "UNKNOWN", reason: "FIELD_DOMAIN_NOT_PROVEN" };
  if (state.state !== "COMPLETE") return { kind: "UNKNOWN", reason: "COVERAGE_INSUFFICIENT" };
  let total = 0;
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount)) return { kind: "UNKNOWN", reason: "UNSAFE_INTEGER_ARITHMETIC" };
    total += amount;
    if (!Number.isSafeInteger(total)) return { kind: "UNKNOWN", reason: "UNSAFE_INTEGER_ARITHMETIC" };
  }
  return {
    kind: "EXACT",
    value: { sumOfSuppliedValues: total, eventsSupplyingField: amounts.length, eventsNotSupplyingField: 0 },
  };
}

/** M1: the meaning of raw `amount` is not established. Every raw sum carries this. */
export const RAW_AMOUNT_MEANING = "NOT_YET_PROVEN" as const;
