/**
 * Fight completeness: capability and coverage, kept apart.
 *
 * The type below is the enforcement mechanism for the distinction. Coverage
 * exists ONLY on the OBSERVABLE branch, so this cannot compile:
 *
 *     completeness.categories.TARGETABILITY.coverage   // error unless narrowed
 *
 * A fully retrieved All stream with zero targetability events therefore cannot
 * be reported as "TARGETABILITY: COMPLETE" — not by convention, but because
 * there is no such field to set while capability is UNVERIFIED.
 */

import {
  EVIDENCE_CATEGORIES,
  type CapabilityRecord,
  type EvidenceCategory,
  type RetrievalSource,
} from "../../wcl/evidence-capability.js";
import type { StreamCompleteness } from "../../wcl/retrieval-types.js";
import type { CertifiedCoverage } from "../evidence/certified-coverage.js";
import {
  classifyCoverage,
  intersectRangeLists,
  type CoverageState,
  type RetrievalOutcomeReason,
  type TimeRangeMs,
} from "../evidence/coverage.js";

export interface CategoryCoverage {
  readonly state: CoverageState;
  readonly reason: RetrievalOutcomeReason;
  readonly coveredRanges: readonly TimeRangeMs[];
  readonly sourceStreamIds: readonly string[];
  /** Actors this coverage vouches for. `null` means every actor in the stream. */
  readonly actorScope: readonly number[] | null;
}

/**
 * What we know about one evidence category.
 *
 * Note what each branch does NOT carry. UNVERIFIED carries no coverage and no
 * source, because we do not know whether the category is obtainable at all —
 * and a coverage value there would be a claim we cannot support.
 */
export type CategoryEvidence =
  | {
      readonly capability: "OBSERVABLE";
      readonly source: CapabilityRecord;
      readonly coverage: CategoryCoverage;
    }
  | { readonly capability: "NOT_OBSERVABLE"; readonly source: CapabilityRecord }
  | { readonly capability: "UNVERIFIED" };

export interface FightCompleteness {
  readonly streams: readonly StreamCompleteness[];
  /** Every category is always present. A category never simply goes missing. */
  readonly categories: Readonly<Record<EvidenceCategory, CategoryEvidence>>;
  /**
   * M13-D: coverage a filtered capture earned by an exact table certificate,
   * for its stated predicate only (`certified-coverage.ts`). Absent means none.
   * Read only by a claim that states a predicate inside it; it never changes
   * a category above.
   */
  readonly certifiedCoverage?: readonly CertifiedCoverage[];
}

const STATE_SEVERITY: Record<CoverageState, number> = { COMPLETE: 0, PARTIAL: 1, ABSENT: 2 };

function worstState(left: CoverageState, right: CoverageState): CoverageState {
  return STATE_SEVERITY[right] > STATE_SEVERITY[left] ? right : left;
}

export interface CategoryProjectionInput {
  readonly registry: Readonly<Record<EvidenceCategory, CapabilityRecord>>;
  readonly streams: readonly StreamCompleteness[];
  /** Which stream ids serve each retrieval source. */
  readonly streamIdsBySource: Readonly<Record<RetrievalSource, readonly string[]>>;
  /** Categories whose family decoding failed on a valid envelope. */
  readonly degradedCategories: ReadonlySet<EvidenceCategory>;
  /** Streams that produced an untyped, untimed defect. */
  readonly streamsWithUntypedDefects: ReadonlySet<string>;
  readonly actorScope: readonly number[] | null;
}

function combineStreams(streams: readonly StreamCompleteness[]): {
  state: CoverageState;
  reason: RetrievalOutcomeReason;
  coveredRanges: readonly TimeRangeMs[];
} {
  const first = streams[0];
  if (first === undefined) {
    // No stream serves this category, so no evidence was obtained for it.
    // ABSENT — never COMPLETE by default, and never "not observable".
    return { state: "ABSENT", reason: "NOT_REQUESTED", coveredRanges: [] };
  }

  let state = first.state;
  let reason = first.reason;
  let coveredRanges = first.coveredRanges;

  for (const stream of streams.slice(1)) {
    const combined = worstState(state, stream.state);
    if (combined !== state) {
      reason = stream.reason;
    }
    state = combined;
    coveredRanges = intersectRangeLists(coveredRanges, stream.coveredRanges);
  }

  return { state, reason, coveredRanges };
}

/**
 * Projects per-stream retrieval facts onto per-category evidence.
 *
 * Per-stream is the primitive because that is where evidence is actually
 * produced. Per-category is what later analysis asks for. Deriving the second
 * from the first means the two can never disagree.
 */
export function projectCategoryEvidence(
  input: CategoryProjectionInput,
): Readonly<Record<EvidenceCategory, CategoryEvidence>> {
  const byId = new Map(input.streams.map((stream) => [stream.streamId, stream] as const));
  const projected: Partial<Record<EvidenceCategory, CategoryEvidence>> = {};

  for (const category of EVIDENCE_CATEGORIES) {
    const record = input.registry[category];

    if (record.capability === "UNVERIFIED") {
      projected[category] = { capability: "UNVERIFIED" };
      continue;
    }
    if (record.capability === "NOT_OBSERVABLE") {
      projected[category] = { capability: "NOT_OBSERVABLE", source: record };
      continue;
    }

    const streamIds = input.streamIdsBySource[record.retrievalSource];
    const streams = streamIds
      .map((streamId) => byId.get(streamId))
      .filter((stream): stream is StreamCompleteness => stream !== undefined);

    const combined = combineStreams(streams);
    let { state, reason } = combined;

    // Malformed content degrades COMPLETE to PARTIAL. It never upgrades ABSENT:
    // failing to decode something we never retrieved is not partial coverage.
    const untypedDefect = streamIds.some((streamId) => input.streamsWithUntypedDefects.has(streamId));
    if ((input.degradedCategories.has(category) || untypedDefect) && state === "COMPLETE") {
      state = "PARTIAL";
      reason = "MALFORMED_EVENT_CONTENT";
    }

    projected[category] = {
      capability: "OBSERVABLE",
      source: record,
      coverage: {
        state,
        reason,
        coveredRanges: combined.coveredRanges,
        sourceStreamIds: streams.map((stream) => stream.streamId),
        actorScope: input.actorScope,
      },
    };
  }

  return projected as Record<EvidenceCategory, CategoryEvidence>;
}

/** Re-exported so callers do not need two imports to classify a range list. */
export { classifyCoverage };
