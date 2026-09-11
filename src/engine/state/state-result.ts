/**
 * The shared state-result vocabulary.
 *
 * Every M4 query answers with a `StateResult`. The type exists to make one
 * failure impossible: an UNKNOWN that gets read as a value.
 *
 * Three separations carry the weight here:
 *
 * 1. CERTAINTY IS SEPARATE FROM DERIVATION ORIGIN. "How sure are we?" and
 *    "where did this come from?" are different questions. An exact value that
 *    was directly observed and an exact value that was mathematically derived
 *    are both EXACT, and a later finding must still be able to tell them apart.
 *
 * 2. UNKNOWN CARRIES NO VALUE FIELD. Not by convention — the UNKNOWN branch of
 *    the union simply has no `value`, so `result.value` does not compile until
 *    the caller has narrowed away the UNKNOWN case. That is the structural
 *    version of "UNKNOWN must not silently collapse into false / 0 / empty".
 *
 * 3. UNKNOWN CARRIES A REASON. "We could not establish this" is not actionable;
 *    "Warcraft Logs capability for this category is UNVERIFIED" is. The reasons
 *    stay distinct so a later report can explain itself.
 *
 * There is deliberately NO top-level UNAVAILABLE state. A capability or
 * coverage failure is a reason we do not know something, not a fifth kind of
 * knowing. Collapsing the two would also invite the mapping this layer must
 * never make: nothing here is `NO_AUTHORITY_AVAILABLE`. That state means "no
 * trustworthy standard exists for this question", which is a decision-authority
 * judgement M5 owns. Everything in this file is an EVIDENCE condition, and
 * evidence conditions resolve to UNKNOWN.
 */

import type { EvidenceCategory } from "../../wcl/evidence-capability.js";
import { classifyCoverage, intersectRangeLists, type TimeRangeMs } from "../evidence/coverage.js";
import type { EvidenceLocator } from "../evidence/locator.js";
import type { FightCompleteness } from "../normalization/completeness.js";

/** How sure the analyzer is of a value. */
export type StateCertainty = "EXACT" | "BOUNDED" | "STALE" | "UNKNOWN";

export const STATE_CERTAINTIES = [
  "EXACT",
  "BOUNDED",
  "STALE",
  "UNKNOWN",
] as const satisfies readonly StateCertainty[];

/**
 * Where a known value came from.
 *
 * Orthogonal to certainty, and kept so a later finding can distinguish "we saw
 * this" from "we calculated this" even when both are EXACT.
 */
export type StateDerivation = "OBSERVED" | "DERIVED_EXACT" | "DERIVED_BOUNDED";

export const STATE_DERIVATIONS = [
  "OBSERVED",
  "DERIVED_EXACT",
  "DERIVED_BOUNDED",
] as const satisfies readonly StateDerivation[];

/**
 * Why a state could not be established.
 *
 * Each value is a DIFFERENT remedy, which is the test for whether a reason
 * earns its place:
 *
 * - `CAPABILITY_UNVERIFIED` — we do not know whether Warcraft Logs can supply
 *   this category. Remedy: a capture that settles it.
 * - `CAPABILITY_NOT_OBSERVABLE` — Warcraft Logs authoritatively cannot supply
 *   it. Remedy: none from this source. Never interchangeable with the above:
 *   one is ignorance, the other is knowledge.
 * - `INSUFFICIENT_COVERAGE` — the category is obtainable and we did not obtain
 *   all of the interval in question. Remedy: retrieve the missing pages.
 * - `INSUFFICIENT_SCOPE` — the evidence does not vouch for this actor. Remedy:
 *   a wider derived ingestion scope.
 * - `NO_OBSERVATION` — coverage was complete and nothing was observed, in a
 *   context where absence is not itself a usable answer.
 * - `UNSUPPORTED_DERIVATION` — the query asked for something this layer does
 *   not model, or referenced a position that does not exist.
 * - `AMBIGUOUS_INITIAL_STATE` — state before the first observation cannot be
 *   established, so no anchor exists to derive from.
 * - `NON_MONOTONIC_TIME` — the canonical event order is not ordered by time, so
 *   a timestamp-addressed question has no sound answer over it.
 */
export type UnknownReason =
  | "CAPABILITY_UNVERIFIED"
  | "CAPABILITY_NOT_OBSERVABLE"
  | "INSUFFICIENT_COVERAGE"
  | "INSUFFICIENT_SCOPE"
  | "NO_OBSERVATION"
  | "UNSUPPORTED_DERIVATION"
  | "AMBIGUOUS_INITIAL_STATE"
  | "NON_MONOTONIC_TIME";

export const UNKNOWN_REASONS = [
  "CAPABILITY_UNVERIFIED",
  "CAPABILITY_NOT_OBSERVABLE",
  "INSUFFICIENT_COVERAGE",
  "INSUFFICIENT_SCOPE",
  "NO_OBSERVATION",
  "UNSUPPORTED_DERIVATION",
  "AMBIGUOUS_INITIAL_STATE",
  "NON_MONOTONIC_TIME",
] as const satisfies readonly UnknownReason[];

/**
 * What justified a result.
 *
 * `locators` are REFERENCES into the normalized fight, never copies of events.
 * A result that rests on several observations carries several locators, in
 * canonical order.
 *
 * `category` records which evidence category governed the answer, so a later
 * finding can walk back from a conclusion to the capability and coverage that
 * permitted it. `null` means no single category governed it.
 */
export interface StateProvenance {
  readonly locators: readonly EvidenceLocator[];
  readonly category: EvidenceCategory | null;
}

/**
 * The result of one state query.
 *
 * Note what the UNKNOWN branch does not have: no `value`, no `lowerBound`, no
 * `derivation`. Nothing was derived and nothing is known, so there is no field
 * a caller could read a default out of.
 */
export type StateResult<T> =
  | {
      readonly certainty: "EXACT";
      readonly derivation: "OBSERVED" | "DERIVED_EXACT";
      readonly value: T;
      readonly provenance: StateProvenance;
    }
  | {
      readonly certainty: "BOUNDED";
      readonly derivation: "DERIVED_BOUNDED";
      readonly lowerBound: T;
      readonly upperBound: T;
      readonly provenance: StateProvenance;
    }
  | {
      readonly certainty: "STALE";
      readonly derivation: "OBSERVED";
      readonly value: T;
      /** When the observation was made. */
      readonly observedAtReportTimeMs: number;
      /** The instant the caller asked about. Later than the observation. */
      readonly asOfReportTimeMs: number;
      readonly provenance: StateProvenance;
    }
  | {
      readonly certainty: "UNKNOWN";
      readonly reason: UnknownReason;
      readonly provenance: StateProvenance;
    };

function provenanceOf(
  locators: readonly EvidenceLocator[],
  category: EvidenceCategory | null,
): StateProvenance {
  return { locators, category };
}

/** A value read directly off an observation. */
export function exactObserved<T>(
  value: T,
  locators: readonly EvidenceLocator[],
  category: EvidenceCategory | null = null,
): StateResult<T> {
  return { certainty: "EXACT", derivation: "OBSERVED", value, provenance: provenanceOf(locators, category) };
}

/** A value calculated from observations plus authoritative rules, with no residual uncertainty. */
export function exactDerived<T>(
  value: T,
  locators: readonly EvidenceLocator[],
  category: EvidenceCategory | null = null,
): StateResult<T> {
  return {
    certainty: "EXACT",
    derivation: "DERIVED_EXACT",
    value,
    provenance: provenanceOf(locators, category),
  };
}

/**
 * A value known only to lie within proven bounds.
 *
 * Both bounds are required. A single point estimate is not a defensible answer
 * to a bounded question.
 */
export function boundedDerived<T>(
  lowerBound: T,
  upperBound: T,
  locators: readonly EvidenceLocator[],
  category: EvidenceCategory | null = null,
): StateResult<T> {
  return {
    certainty: "BOUNDED",
    derivation: "DERIVED_BOUNDED",
    lowerBound,
    upperBound,
    provenance: provenanceOf(locators, category),
  };
}

/**
 * A prior observation carried forward, NOT proven still current.
 *
 * Distinct from EXACT on purpose. The value is real and was really observed;
 * what is unproven is that it still held at `asOfReportTimeMs`.
 */
export function staleObservation<T>(
  value: T,
  observedAtReportTimeMs: number,
  asOfReportTimeMs: number,
  locators: readonly EvidenceLocator[],
  category: EvidenceCategory | null = null,
): StateResult<T> {
  return {
    certainty: "STALE",
    derivation: "OBSERVED",
    value,
    observedAtReportTimeMs,
    asOfReportTimeMs,
    provenance: provenanceOf(locators, category),
  };
}

export function unknownState<T>(
  reason: UnknownReason,
  locators: readonly EvidenceLocator[] = [],
  category: EvidenceCategory | null = null,
): StateResult<T> {
  return { certainty: "UNKNOWN", reason, provenance: provenanceOf(locators, category) };
}

export function isUnknown<T>(
  result: StateResult<T>,
): result is Extract<StateResult<T>, { certainty: "UNKNOWN" }> {
  return result.certainty === "UNKNOWN";
}

/**
 * Whether a result carries a single known value.
 *
 * BOUNDED is deliberately excluded: it has two bounds and no single value, and
 * a helper that handed back one of them would be the point-estimate fabrication
 * `boundedDerived` exists to prevent.
 */
export function hasSingleValue<T>(
  result: StateResult<T>,
): result is Extract<StateResult<T>, { certainty: "EXACT" | "STALE" }> {
  return result.certainty === "EXACT" || result.certainty === "STALE";
}

// --------------------------------------------------------------------------
// Absence gating
// --------------------------------------------------------------------------

/**
 * Whether evidence permits claiming that something did NOT happen.
 *
 * A POSITIVE observation needs no gate: we saw it, so it happened, whatever the
 * coverage around it. An ABSENCE claim is the opposite — it rests entirely on
 * having looked everywhere it could have been. This asymmetry is the whole
 * reason the type exists, and conflating the two is how a failed page becomes
 * "you were idle for 30 seconds".
 */
export type AbsenceGate = { readonly ok: true } | { readonly ok: false; readonly reason: UnknownReason };

export interface AbsenceGateInput {
  readonly completeness: FightCompleteness;
  readonly category: EvidenceCategory;
  /** The interval over which absence would be asserted. Must be FULLY covered. */
  readonly range: TimeRangeMs;
  /** The actor the claim is about, or `null` when the claim is not actor-specific. */
  readonly actorId: number | null;
}

/**
 * Decides whether an absence claim is supportable.
 *
 * Checked in order of specificity, so the reason reported is the most useful
 * one available:
 *
 * 1. capability — is this category obtainable at all?
 * 2. actor scope — does the evidence vouch for THIS actor?
 * 3. coverage — did we retrieve the whole interval?
 *
 * Coverage is tested by reusing the M3 primitives rather than by a new
 * containment rule: intersecting the covered ranges with the interval and
 * asking `classifyCoverage` whether the result still equals the interval. That
 * keeps inclusive/exclusive bound handling in exactly one place.
 */
export function gateAbsenceClaim(input: AbsenceGateInput): AbsenceGate {
  const evidence = input.completeness.categories[input.category];

  // UNVERIFIED carries no coverage field at all, so there is nothing here to
  // read optimistically. It is NOT "not observable": we do not know.
  if (evidence.capability === "UNVERIFIED") {
    return { ok: false, reason: "CAPABILITY_UNVERIFIED" };
  }
  if (evidence.capability === "NOT_OBSERVABLE") {
    return { ok: false, reason: "CAPABILITY_NOT_OBSERVABLE" };
  }

  const { coverage } = evidence;

  // `null` scope means the coverage vouches for every actor in the stream. A
  // listed scope vouches for those actors and no others — an ally under
  // PLAYER_CONTEXT is out of scope even though the bytes may be present.
  if (
    input.actorId !== null &&
    coverage.actorScope !== null &&
    !coverage.actorScope.includes(input.actorId)
  ) {
    return { ok: false, reason: "INSUFFICIENT_SCOPE" };
  }

  const covered = intersectRangeLists(coverage.coveredRanges, [input.range]);
  if (classifyCoverage(covered, input.range) !== "COMPLETE") {
    return { ok: false, reason: "INSUFFICIENT_COVERAGE" };
  }

  return { ok: true };
}
