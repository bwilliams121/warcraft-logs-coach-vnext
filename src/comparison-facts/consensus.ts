/**
 * MULTI-LOG CONSENSUS (M14-B): whether the COMPARISON fights of a timing
 * alignment agree on when a landmark happened, as one of three explicit
 * outcomes. Post-hoc, like the alignment it reads.
 *
 *   CONSENSUS     enough comparison fights, each with an EXACT anchor, fall
 *                 inside one tolerance-wide group, and that group is a large
 *                 enough share of ALL comparison fights
 *   SPLIT         the decisive anchors already prove no such group can exist,
 *                 whatever the undecided fights would show; no claim is made
 *   INSUFFICIENT  too few decisive anchors, or the undecided fights could
 *                 still decide the outcome; no claim is made
 *
 * WHO VOTES
 *
 *   Only comparison fights. The subject is what consensus gives context to,
 *   never one of its voters. Only an EXACT anchor is a value. A NO_LATER_THAN
 *   anchor (an uncertified capture) and an UNKNOWN anchor abstain. An
 *   abstaining fight still counts in the share's denominator: it might
 *   disagree. It never counts as agreeing.
 *
 * NEVER FROM ONE PARSE
 *
 *   A threshold set whose minimum sample is below 2 is refused, so a single
 *   comparison fight can never be consensus.
 *
 * THRESHOLDS ARE NAMED DATA
 *
 *   Minimum sample, agreement share and timing tolerance live in one named,
 *   versioned threshold set. The shipped set is CANDIDATE: its values are not
 *   yet validated on enough real logs (agent/follow-ups.md "After M14-B").
 *
 * CONTEXT ONLY
 *
 *   An outcome never suppresses a finding and never moves confidence. Mapping
 *   a consensus on an encounter-state landmark to a named environmental reason
 *   (INTERMISSION, PHASE_TRANSITION, ...) is strategy context's job, and only
 *   with the subject's own encounter evidence. A consensus on a focus-behavior
 *   landmark (a cooldown window, a first damage event) says what comparison
 *   players did, never what was right.
 */

import type { LandmarkAnchor, LandmarkKey, TimingAlignment } from "./timing-alignment.js";

export interface ConsensusThresholds {
  /** A stable name, cited by every outcome computed under it. */
  readonly id: string;
  /** CANDIDATE until validated on more real logs. */
  readonly status: "CANDIDATE";
  /** The fewest decisive comparison fights an agreeing group needs. At least 2. */
  readonly minimumSample: number;
  /** The share of ALL comparison fights the agreeing group needs: a strict majority or more. */
  readonly agreement: { readonly numerator: number; readonly denominator: number };
  /** Two anchors agree when they are at most this far apart, in ms. */
  readonly timingToleranceMs: number;
  /** Why these values, in plain words. */
  readonly basis: string;
}

/**
 * The initial values (CANDIDATE). Three comparison fights is the smallest
 * group in which one outlier cannot fake agreement and the M11-G2 cohort can
 * reach; two of three is the smallest strict majority of it; five seconds is
 * coarser than any encounter-state transition a human reacts to and finer
 * than the spacing of distinct encounter events.
 */
export const COMPARISON_CONSENSUS_THRESHOLDS_V1: ConsensusThresholds = {
  id: "M14B_COMPARISON_CONSENSUS_V1",
  status: "CANDIDATE",
  minimumSample: 3,
  agreement: { numerator: 2, denominator: 3 },
  timingToleranceMs: 5000,
  basis:
    "Initial values, not validated on real logs: 3 decisive comparison fights, 2 of 3 of all comparison fights in one group, anchors within 5 s.",
};

export type ThresholdRefusal =
  | "EMPTY_ID"
  | "MINIMUM_SAMPLE_BELOW_TWO"
  | "AGREEMENT_NOT_A_FRACTION"
  | "AGREEMENT_NOT_A_STRICT_MAJORITY"
  | "TOLERANCE_INVALID";

/** Every rule a threshold set must meet before any outcome is computed under it. */
export function validateThresholds(thresholds: ConsensusThresholds): ThresholdRefusal | null {
  if (thresholds.id.trim() === "") return "EMPTY_ID";
  if (!Number.isSafeInteger(thresholds.minimumSample) || thresholds.minimumSample < 2)
    return "MINIMUM_SAMPLE_BELOW_TWO";
  const { numerator, denominator } = thresholds.agreement;
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    numerator < 1 ||
    denominator < 1 ||
    numerator > denominator
  )
    return "AGREEMENT_NOT_A_FRACTION";
  if (2 * numerator <= denominator) return "AGREEMENT_NOT_A_STRICT_MAJORITY";
  if (!Number.isSafeInteger(thresholds.timingToleranceMs) || thresholds.timingToleranceMs < 0)
    return "TOLERANCE_INVALID";
  return null;
}

// ---------------------------------------------------------------------------
// The outcome over one set of votes
// ---------------------------------------------------------------------------

export type AbstentionReason =
  | { readonly kind: "ANCHOR_IS_BOUND" }
  | { readonly kind: "ANCHOR_UNKNOWN"; readonly anchor: Extract<LandmarkAnchor, { kind: "UNKNOWN" }> };

export type ConsensusVote =
  | { readonly fightRef: string; readonly kind: "VALUE"; readonly valueMs: number; readonly evidence: string }
  | { readonly fightRef: string; readonly kind: "ABSTAIN"; readonly reason: AbstentionReason };

export interface ConsensusSample {
  /** Every comparison fight: the share's denominator. */
  readonly comparisons: number;
  readonly decisive: number;
  readonly abstaining: number;
  /** The largest set of decisive values within the tolerance. */
  readonly largestAgreeingGroup: number;
}

export type ConsensusOutcome =
  | {
      readonly kind: "CONSENSUS";
      readonly sample: ConsensusSample;
      readonly agreeingFightRefs: readonly string[];
      /** The agreeing values themselves: never a mean, never widened. */
      readonly range: { readonly minMs: number; readonly maxMs: number };
    }
  | {
      readonly kind: "SPLIT";
      readonly sample: ConsensusSample;
      readonly reason: "DISAGREEMENT_PROVEN" | "NO_UNIQUE_AGREEING_GROUP";
    }
  | {
      readonly kind: "INSUFFICIENT";
      readonly sample: ConsensusSample;
      readonly reason: "BELOW_MINIMUM_SAMPLE" | "ABSTENTIONS_COULD_DECIDE";
    };

/**
 * The outcome over one landmark's votes, under thresholds already validated.
 *
 * A group may count only decisive values. An abstaining fight counts against
 * the share (it might disagree), and could at most join the group, so "no
 * group can exist" is proven only when even the largest group plus every
 * abstention misses the minimum sample or the share.
 */
export function consensusOf(
  votes: readonly ConsensusVote[],
  thresholds: ConsensusThresholds,
): ConsensusOutcome {
  const values = votes
    .flatMap((vote) => (vote.kind === "VALUE" ? [vote] : []))
    .sort((left, right) =>
      left.valueMs !== right.valueMs ? left.valueMs - right.valueMs : left.fightRef < right.fightRef ? -1 : 1,
    );
  const comparisons = votes.length;
  const abstaining = comparisons - values.length;

  // Every maximal tolerance-wide run of sorted values; the largest wins.
  let largest = 0;
  let starts: number[] = [];
  let end = 0;
  for (let start = 0; start < values.length; start += 1) {
    if (end < start) end = start;
    while (
      end + 1 < values.length &&
      (values[end + 1] as (typeof values)[number]).valueMs -
        (values[start] as (typeof values)[number]).valueMs <=
        thresholds.timingToleranceMs
    )
      end += 1;
    const size = end - start + 1;
    if (size > largest) {
      largest = size;
      starts = [start];
    } else if (size === largest) starts.push(start);
  }

  const sample: ConsensusSample = {
    comparisons,
    decisive: values.length,
    abstaining,
    largestAgreeingGroup: largest,
  };
  const { numerator, denominator } = thresholds.agreement;
  const reachesShare = (count: number) => count * denominator >= numerator * comparisons;

  if (values.length < thresholds.minimumSample)
    return { kind: "INSUFFICIENT", sample, reason: "BELOW_MINIMUM_SAMPLE" };
  if (largest >= thresholds.minimumSample && reachesShare(largest)) {
    if (starts.length !== 1) return { kind: "SPLIT", sample, reason: "NO_UNIQUE_AGREEING_GROUP" };
    const group = values.slice(starts[0], (starts[0] as number) + largest);
    return {
      kind: "CONSENSUS",
      sample,
      agreeingFightRefs: group.map((vote) => vote.fightRef),
      range: {
        minMs: (group[0] as (typeof group)[number]).valueMs,
        maxMs: (group[group.length - 1] as (typeof group)[number]).valueMs,
      },
    };
  }
  const bestPossible = largest + abstaining;
  if (bestPossible < thresholds.minimumSample || !reachesShare(bestPossible))
    return { kind: "SPLIT", sample, reason: "DISAGREEMENT_PROVEN" };
  return { kind: "INSUFFICIENT", sample, reason: "ABSTENTIONS_COULD_DECIDE" };
}

// ---------------------------------------------------------------------------
// Consensus over an alignment's landmarks
// ---------------------------------------------------------------------------

/**
 * What a landmark is about. Only ENCOUNTER_STATE can ever describe the
 * encounter itself; FOCUS_BEHAVIOR is what each comparison player did.
 */
export type LandmarkNature = "ENCOUNTER_STATE" | "FOCUS_BEHAVIOR" | "FIGHT_RECORD";

export function natureOf(key: LandmarkKey): LandmarkNature {
  switch (key.kind) {
    case "PHASE_START":
    case "INTERMISSION_START":
      return "ENCOUNTER_STATE";
    case "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC":
    case "COOLDOWN_WINDOW_START":
      return "FOCUS_BEHAVIOR";
    case "PULL":
    case "RECORDED_FIGHT_END":
      return "FIGHT_RECORD";
  }
}

export interface LandmarkConsensus {
  readonly landmarkId: string;
  readonly key: LandmarkKey;
  readonly nature: LandmarkNature;
  /** One per comparison fight, in the alignment's order. */
  readonly votes: readonly ConsensusVote[];
  readonly outcome: ConsensusOutcome;
}

export type AlignmentConsensus =
  | {
      readonly kind: "EVALUATED";
      readonly thresholds: { readonly id: string; readonly status: ConsensusThresholds["status"] };
      /** Every landmark of the alignment except PULL, which is offset 0 by definition. */
      readonly landmarks: readonly LandmarkConsensus[];
      readonly comparisonCoverage: "AT_LEAST_UNCERTIFIED";
      readonly use: "CONTEXT_ONLY";
      readonly findingEffect: { readonly suppression: "NONE"; readonly confidence: "NONE" };
    }
  | { readonly kind: "REFUSED"; readonly reason: "ALIGNMENT_REFUSED" | ThresholdRefusal };

function voteOf(fightRef: string, anchor: LandmarkAnchor): ConsensusVote {
  switch (anchor.kind) {
    case "EXACT":
      return { fightRef, kind: "VALUE", valueMs: anchor.fightTimeMs, evidence: anchor.evidence };
    case "NO_LATER_THAN":
      return { fightRef, kind: "ABSTAIN", reason: { kind: "ANCHOR_IS_BOUND" } };
    case "UNKNOWN":
      return { fightRef, kind: "ABSTAIN", reason: { kind: "ANCHOR_UNKNOWN", anchor } };
  }
}

/**
 * Whether the comparison fights agree on when each landmark happened, in fight
 * time. It reads only the alignment's anchors and slices no fight.
 */
export function landmarkConsensus(
  alignment: TimingAlignment,
  thresholds: ConsensusThresholds = COMPARISON_CONSENSUS_THRESHOLDS_V1,
): AlignmentConsensus {
  const refusal = validateThresholds(thresholds);
  if (refusal !== null) return { kind: "REFUSED", reason: refusal };
  if (alignment.kind === "REFUSED") return { kind: "REFUSED", reason: "ALIGNMENT_REFUSED" };
  const comparisonRefs = new Set(
    alignment.fights.filter((fight) => fight.role === "COMPARISON").map((fight) => fight.fightRef),
  );
  return {
    kind: "EVALUATED",
    thresholds: { id: thresholds.id, status: thresholds.status },
    landmarks: alignment.landmarks
      .filter((row) => row.key.kind !== "PULL")
      .map((row) => {
        const votes = row.anchors
          .filter(({ fightRef }) => comparisonRefs.has(fightRef))
          .map(({ fightRef, anchor }) => voteOf(fightRef, anchor));
        return {
          landmarkId: row.landmarkId,
          key: row.key,
          nature: natureOf(row.key),
          votes,
          outcome: consensusOf(votes, thresholds),
        };
      }),
    comparisonCoverage: "AT_LEAST_UNCERTIFIED",
    use: "CONTEXT_ONLY",
    findingEffect: { suppression: "NONE", confidence: "NONE" },
  };
}
