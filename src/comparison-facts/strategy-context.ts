/**
 * STRATEGY CONTEXT (M14-C): the encounter strategy the comparison fights have
 * in common, as structured items, each mapped to a named environmental reason
 * only where the evidence supports one. Post-hoc, like the consensus it reads.
 *
 * ONE ITEM PER CONSENSUS ROW, WHATEVER THE OUTCOME
 *
 *   PHASE_BEHAVIOR     PHASE_START:<id>                  encounter state
 *   COMMON_DOWNTIME    INTERMISSION_START#k              encounter state
 *   TARGET_TRANSITION  FIRST_FOCUS_DAMAGE_EVENT_ON_NPC   focus behavior
 *   COOLDOWN_TIMING    COOLDOWN_WINDOW_START:<kind>#k    focus behavior
 *
 *   A SPLIT or INSUFFICIENT row stays an item, so "nothing in common was
 *   shown" is never confused with "no row". RECORDED_FIGHT_END is a fight
 *   record, not strategy, and PULL is offset 0 by definition: neither is an
 *   item. A cooldown item is the k-th observed window start the comparisons
 *   share; whether a cooldown was HELD (available but withheld) needs
 *   availability, which no landmark carries, so no item claims a hold.
 *
 * A NAMED REASON NEEDS THREE THINGS
 *
 *   1. an ENCOUNTER_STATE row: focus behavior says what comparison players
 *      did, never what the encounter did, so it never names a reason;
 *   2. a CONSENSUS outcome among the comparison fights;
 *   3. the subject's OWN anchor, EXACT, inside the agreeing range widened by
 *      the threshold tolerance. Warcraft Logs is authoritative for the
 *      subject's fight: comparisons only corroborate what the subject's own
 *      encounter evidence shows, and never supply a missing subject fact.
 *
 *   INTERMISSION_START#k names INTERMISSION over the subject's own k-th
 *   intermission interval. PHASE_START:<id> names PHASE_TRANSITION at the
 *   subject's own transition instant; no duration is invented around it.
 *   TARGET_UNAVAILABLE and FORCED_DOWNTIME have no evidence source here
 *   (targetability is unverified and carries no events), so they are never
 *   named.
 *
 * CONTEXT, NEVER AUTHORITY
 *
 *   Items carry no direction: more casts, more uptime, more damage or a
 *   higher parse is never truth, and the subject's divergence from a
 *   consensus is reported as a fact, not a fault. Attaching context to a
 *   finding moment lists the named reasons in effect there and changes
 *   nothing about the finding: no suppression, no confidence. Using a named
 *   reason to suppress is the reviewed projection's job (M14-F).
 *
 * POST-HOC. Nothing on the authority branch imports it
 * (tests/contracts/m11g2-comparison-facts-layering.test.ts).
 */

import { inclusiveRange, rangeContains, type TimeRangeMs } from "../engine/evidence/coverage.js";
import { derivePhaseIntervals } from "../engine/state/encounter-state.js";
import {
  COMPARISON_CONSENSUS_THRESHOLDS_V1,
  landmarkConsensus,
  type ConsensusOutcome,
  type ConsensusThresholds,
  type LandmarkNature,
  type ThresholdRefusal,
} from "./consensus.js";
import type { PostHocDefinition } from "./fight-facts.js";
import {
  alignFights,
  type AlignedFight,
  type AlignmentInput,
  type LandmarkAnchor,
  type LandmarkKey,
} from "./timing-alignment.js";

export type StrategyContextKind =
  "PHASE_BEHAVIOR" | "COMMON_DOWNTIME" | "TARGET_TRANSITION" | "COOLDOWN_TIMING";

/** The named environmental reasons of CLAUDE.md "Top Logs Cannot Suppress Findings Merely by Similarity". */
export type EnvironmentalReason =
  "INTERMISSION" | "TARGET_UNAVAILABLE" | "FORCED_DOWNTIME" | "PHASE_TRANSITION";

export type NoReasonCause =
  | "FOCUS_BEHAVIOR_NAMES_NO_REASON"
  | "NO_COMPARISON_CONSENSUS"
  | "SUBJECT_ANCHOR_NOT_EXACT"
  | "SUBJECT_OUTSIDE_CONSENSUS_RANGE";

export type ReasonMapping =
  | {
      readonly kind: "NAMED";
      readonly reason: EnvironmentalReason;
      /** Where the reason applies in the subject's fight, from its own evidence. */
      readonly subjectWindow: TimeRangeMs;
      readonly subjectEvidence: string;
      readonly corroboratingFightRefs: readonly string[];
    }
  | { readonly kind: "NONE"; readonly cause: NoReasonCause };

export interface StrategyContextItem {
  /** The landmark id it was derived from. */
  readonly itemId: string;
  readonly kind: StrategyContextKind;
  readonly key: LandmarkKey;
  readonly nature: LandmarkNature;
  readonly consensus: ConsensusOutcome;
  /** The subject's own anchor, as the alignment holds it. */
  readonly subjectAnchor: LandmarkAnchor;
  readonly environmentalReason: ReasonMapping;
}

export type StrategyContext =
  | {
      readonly kind: "REPRESENTED";
      readonly encounterId: number;
      readonly difficulty: number;
      readonly subjectFightRef: string;
      readonly thresholds: { readonly id: string; readonly status: ConsensusThresholds["status"] };
      readonly items: readonly StrategyContextItem[];
      /**
       * Per fight, whether phase transitions are held at all. Without them no
       * phase or downtime item can exist, and that absence is not "no
       * downtime".
       */
      readonly encounterStateEvidence: readonly {
        readonly fightRef: string;
        readonly phaseEvidence: AlignedFight["phaseEvidence"];
      }[];
      readonly comparisonCoverage: "AT_LEAST_UNCERTIFIED";
      readonly use: "CONTEXT_ONLY";
      readonly rotationalAuthority: "NONE";
      readonly findingEffect: { readonly suppression: "NONE"; readonly confidence: "NONE" };
    }
  | { readonly kind: "REFUSED"; readonly reason: "ALIGNMENT_REFUSED" | ThresholdRefusal };

function kindOf(key: LandmarkKey): StrategyContextKind | null {
  switch (key.kind) {
    case "PHASE_START":
      return "PHASE_BEHAVIOR";
    case "INTERMISSION_START":
      return "COMMON_DOWNTIME";
    case "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC":
      return "TARGET_TRANSITION";
    case "COOLDOWN_WINDOW_START":
      return "COOLDOWN_TIMING";
    case "PULL":
    case "RECORDED_FIGHT_END":
      return null;
  }
}

/**
 * The encounter strategy the comparison fights share, with named reasons
 * where the subject's own evidence agrees. The alignment and consensus are
 * recomputed from exactly these inputs, never accepted from the caller, so an
 * item's subject anchor is always the subject's own.
 */
export function strategyContext(
  input: AlignmentInput,
  definition: PostHocDefinition,
  thresholds: ConsensusThresholds = COMPARISON_CONSENSUS_THRESHOLDS_V1,
): StrategyContext {
  const alignment = alignFights(input, definition);
  const consensus = landmarkConsensus(alignment, thresholds);
  if (consensus.kind === "REFUSED") return { kind: "REFUSED", reason: consensus.reason };
  if (alignment.kind === "REFUSED") return { kind: "REFUSED", reason: "ALIGNMENT_REFUSED" };

  const subjectRef = input.subject.fightRef;
  const subjectIntermissions = derivePhaseIntervals(input.subject.fight).filter(
    (interval) => interval.intermission === "INTERMISSION",
  );

  const reasonOf = (
    key: LandmarkKey,
    nature: LandmarkNature,
    outcome: ConsensusOutcome,
    subject: LandmarkAnchor,
  ): ReasonMapping => {
    if (nature !== "ENCOUNTER_STATE") return { kind: "NONE", cause: "FOCUS_BEHAVIOR_NAMES_NO_REASON" };
    if (outcome.kind !== "CONSENSUS") return { kind: "NONE", cause: "NO_COMPARISON_CONSENSUS" };
    if (subject.kind !== "EXACT") return { kind: "NONE", cause: "SUBJECT_ANCHOR_NOT_EXACT" };
    if (
      subject.fightTimeMs < outcome.range.minMs - thresholds.timingToleranceMs ||
      subject.fightTimeMs > outcome.range.maxMs + thresholds.timingToleranceMs
    )
      return { kind: "NONE", cause: "SUBJECT_OUTSIDE_CONSENSUS_RANGE" };
    if (key.kind === "INTERMISSION_START") {
      // An EXACT k-th intermission anchor means the subject's k-th INTERMISSION
      // interval exists and starts there.
      const interval = subjectIntermissions[key.ordinal - 1];
      if (interval === undefined || interval.startTimeMs !== subject.reportTimeMs)
        return { kind: "NONE", cause: "SUBJECT_ANCHOR_NOT_EXACT" };
      return {
        kind: "NAMED",
        reason: "INTERMISSION",
        subjectWindow: interval.range,
        subjectEvidence: subject.evidence,
        corroboratingFightRefs: outcome.agreeingFightRefs,
      };
    }
    return {
      kind: "NAMED",
      reason: "PHASE_TRANSITION",
      subjectWindow: inclusiveRange(subject.reportTimeMs, subject.reportTimeMs),
      subjectEvidence: subject.evidence,
      corroboratingFightRefs: outcome.agreeingFightRefs,
    };
  };

  const items: StrategyContextItem[] = [];
  for (const row of consensus.landmarks) {
    const kind = kindOf(row.key);
    if (kind === null) continue;
    const aligned = alignment.landmarks.find((entry) => entry.landmarkId === row.landmarkId);
    const subjectAnchor = aligned?.anchors.find((entry) => entry.fightRef === subjectRef)?.anchor;
    if (subjectAnchor === undefined) continue;
    items.push({
      itemId: row.landmarkId,
      kind,
      key: row.key,
      nature: row.nature,
      consensus: row.outcome,
      subjectAnchor,
      environmentalReason: reasonOf(row.key, row.nature, row.outcome, subjectAnchor),
    });
  }

  return {
    kind: "REPRESENTED",
    encounterId: alignment.encounterId,
    difficulty: alignment.difficulty,
    subjectFightRef: subjectRef,
    thresholds: consensus.thresholds,
    items,
    encounterStateEvidence: alignment.fights.map((fight) => ({
      fightRef: fight.fightRef,
      phaseEvidence: fight.phaseEvidence,
    })),
    comparisonCoverage: "AT_LEAST_UNCERTIFIED",
    use: "CONTEXT_ONLY",
    rotationalAuthority: "NONE",
    findingEffect: { suppression: "NONE", confidence: "NONE" },
  };
}

// ---------------------------------------------------------------------------
// Attaching context to finding moments
// ---------------------------------------------------------------------------

/** The only thing attachment reads from a finding: its id and its instant in the subject's fight. */
export interface FindingMoment {
  readonly findingId: string;
  readonly reportTimeMs: number;
}

export interface AttachedStrategyContext {
  readonly findingId: string;
  /** Named reasons whose subject window contains the moment, in item order. */
  readonly reasonsInEffect: readonly { readonly itemId: string; readonly reason: EnvironmentalReason }[];
  readonly use: "CONTEXT_ONLY";
  readonly findingEffect: { readonly suppression: "NONE"; readonly confidence: "NONE" };
}

/**
 * The strategy context in effect at each finding moment. It reads the moment
 * and returns context beside it; the finding itself is never changed, and a
 * moment with no named reason in effect is just that, never a verdict.
 */
export function attachStrategyContext(
  context: Extract<StrategyContext, { kind: "REPRESENTED" }>,
  moments: readonly FindingMoment[],
): readonly AttachedStrategyContext[] {
  return moments.map((moment) => ({
    findingId: moment.findingId,
    reasonsInEffect: context.items.flatMap((item) =>
      item.environmentalReason.kind === "NAMED" &&
      rangeContains(item.environmentalReason.subjectWindow, moment.reportTimeMs)
        ? [{ itemId: item.itemId, reason: item.environmentalReason.reason }]
        : [],
    ),
    use: "CONTEXT_ONLY",
    findingEffect: { suppression: "NONE", confidence: "NONE" },
  }));
}
