/**
 * What factually changed between two adjacent pulls of one encounter.
 *
 * THIS IS THE MODULE WHERE A PROGRESSION SCORE WOULD BE BORN
 *
 * Two pulls, a pile of numbers on each, and an obvious-looking question — did
 * they get further? Everything below is shaped by refusing to answer it except
 * where the answer is arithmetic over values whose ORDER is established.
 *
 * Exactly two derived directions exist, and both are total orders by
 * construction:
 *
 *     durationChange   milliseconds are ordered; longer is longer
 *     outcomeChange    kill and wipe are two named states, enumerated as four
 *                      named transitions
 *
 * Neither is a judgement. A longer pull is not a worse pull — a guild that
 * survives ninety seconds further has a longer pull, and so does a guild that
 * spent ninety seconds running back. WIPE_TO_KILL is a transition between two
 * observed outcomes, not an achievement, and nothing here or downstream may
 * rename it "improved".
 *
 * WHAT IS DELIBERATELY NOT DERIVED, AND WHY
 *
 * PHASES. M8-C established from the frozen schema that `lastPhase` "counts up
 * from 1 based off the phase type" while `lastPhaseAsAbsoluteIndex" "always
 * increases from 0" across every phase — two different counting bases — and
 * measured them DISAGREEING on one real kill (`1` against `4`). Comparing
 * either across pulls requires knowing that the encounter's phases are ordered
 * the same way in both, and that the field being compared is the one that tracks
 * progress. Neither is established. So the raw values are carried across and no
 * direction field exists for them to be written into.
 *
 * PERCENTAGES. M8-C measured `bossPercentage` and `fightPercentage` BOTH at
 * `0.04` on a fight whose `kill` was `true`. That single observation rules out
 * the naive reading — a completed fight does not score 0.04 on a "how complete"
 * scale — which means the direction of these fields is not merely unproven but
 * actively counter-intuitive. A `DECREASED` here could mean the group got
 * further or that it got nowhere. The raw values are carried; no direction is.
 *
 * There is no placeholder, no `UNKNOWN` direction field and no commented-out
 * enum for either. A field that does not exist cannot be filled in by somebody
 * who assumes the semantics were settled.
 */

import type { PullComparabilityAssessment } from "../comparison/pull-comparability.js";
import type { PullContext, PullOutcome } from "../comparison/pull-identity.js";
import type { EncounterOutcomeFacts } from "../engine/normalization/encounter-facts.js";

/**
 * How the fight duration moved.
 *
 * `UNKNOWN` when either duration is unavailable — never `SAME`, which would
 * assert an equality nobody observed.
 */
export type DurationChange = "INCREASED" | "DECREASED" | "SAME" | "UNKNOWN";

export const DURATION_CHANGES = [
  "INCREASED",
  "DECREASED",
  "SAME",
  "UNKNOWN",
] as const satisfies readonly DurationChange[];

/**
 * How the encounter outcome moved, as four named transitions.
 *
 * FOUR RATHER THAN A `SAME_OUTCOME` COLLAPSE. `KILL_TO_KILL` and `WIPE_TO_WIPE`
 * are different facts, and a reader of a progression sequence cares which one
 * happened. Collapsing them would discard that for no gain, and the merged name
 * would be the kind of summary that later grows a meaning.
 *
 * `UNRESOLVED` when either pull's outcome is UNRESOLVED — Warcraft Logs reported
 * no `kill` value, which is not a wipe.
 */
export type OutcomeChange = "KILL_TO_KILL" | "KILL_TO_WIPE" | "WIPE_TO_KILL" | "WIPE_TO_WIPE" | "UNRESOLVED";

export const OUTCOME_CHANGES = [
  "KILL_TO_KILL",
  "KILL_TO_WIPE",
  "WIPE_TO_KILL",
  "WIPE_TO_WIPE",
  "UNRESOLVED",
] as const satisfies readonly OutcomeChange[];

/**
 * The factual difference between two adjacent pulls of one encounter.
 *
 * "Adjacent" means adjacent WITHIN THE ENCOUNTER SEQUENCE, after canonical
 * chronological ordering — not adjacent in the raid night. See
 * `encounter-progression.ts`.
 *
 * Every `from*`/`to*` pair below is a value carried across unchanged. There is
 * no delta field for any of them except duration, and no field anywhere that
 * could hold a rate, a ratio or a percentage of anything.
 */
export interface AdjacentPullChange {
  readonly fromFightId: number;
  readonly toFightId: number;

  /**
   * M8-B's verdict on whether these two pulls may be compared at all.
   *
   * Carried rather than consulted. Both pulls are in one sequence, so the hard
   * dimensions already agreed — what this adds is the CAVEAT list, which
   * discloses contextual differences such as a changed raid size or a differing
   * outcome. Those never gate anything; they are what an honest comparison says
   * about itself.
   */
  readonly comparability: PullComparabilityAssessment;

  readonly fromDurationMs: number | null;
  readonly toDurationMs: number | null;
  /** Arithmetic over milliseconds. Not a quality measure. */
  readonly durationChange: DurationChange;
  /**
   * Signed difference in milliseconds, `null` when either side is unavailable.
   *
   * A DIFFERENCE, NEVER A RATIO. There is deliberately no percentage-change
   * field: dividing two durations would produce the first number in this domain
   * that reads like a performance measure.
   */
  readonly durationDeltaMs: number | null;

  readonly fromOutcome: PullOutcome;
  readonly toOutcome: PullOutcome;
  readonly outcomeChange: OutcomeChange;

  // ---- raw M8-C facts, carried across with no derived direction ----
  readonly fromLastPhase: number | null;
  readonly toLastPhase: number | null;
  readonly fromLastPhaseAsAbsoluteIndex: number | null;
  readonly toLastPhaseAsAbsoluteIndex: number | null;
  readonly fromLastPhaseIsIntermission: boolean | null;
  readonly toLastPhaseIsIntermission: boolean | null;
  readonly fromBossPercentageRaw: number | null;
  readonly toBossPercentageRaw: number | null;
  readonly fromFightPercentageRaw: number | null;
  readonly toFightPercentageRaw: number | null;
}

function durationChangeOf(from: number | null, to: number | null): DurationChange {
  // Unavailable is tested before inequality, so a missing duration can never
  // emerge as a movement.
  if (from === null || to === null) {
    return "UNKNOWN";
  }
  if (to > from) {
    return "INCREASED";
  }
  return to < from ? "DECREASED" : "SAME";
}

function outcomeChangeOf(from: PullOutcome, to: PullOutcome): OutcomeChange {
  if (from === "UNRESOLVED" || to === "UNRESOLVED") {
    return "UNRESOLVED";
  }
  if (from === "KILL") {
    return to === "KILL" ? "KILL_TO_KILL" : "KILL_TO_WIPE";
  }
  return to === "KILL" ? "WIPE_TO_KILL" : "WIPE_TO_WIPE";
}

export interface AdjacentPullInput {
  readonly context: PullContext;
  /** `null` when no M8-C facts were supplied for this fight. */
  readonly facts: EncounterOutcomeFacts | null;
}

/**
 * The change between two adjacent pulls.
 *
 * `comparability` is supplied by the caller rather than computed here, because
 * the caller already assessed it while grouping and computing it twice would
 * invite the two results to differ.
 */
export function adjacentPullChange(
  from: AdjacentPullInput,
  to: AdjacentPullInput,
  comparability: PullComparabilityAssessment,
): AdjacentPullChange {
  const fromDurationMs = from.context.durationMs;
  const toDurationMs = to.context.durationMs;

  return {
    fromFightId: from.context.identity.fightId,
    toFightId: to.context.identity.fightId,
    comparability,

    fromDurationMs,
    toDurationMs,
    durationChange: durationChangeOf(fromDurationMs, toDurationMs),
    durationDeltaMs: fromDurationMs === null || toDurationMs === null ? null : toDurationMs - fromDurationMs,

    fromOutcome: from.context.outcome,
    toOutcome: to.context.outcome,
    outcomeChange: outcomeChangeOf(from.context.outcome, to.context.outcome),

    // Carried across verbatim. `null` stays `null` — M8-C established that a
    // null here means unavailable and carries no recoverable reason.
    fromLastPhase: from.facts?.lastPhase ?? null,
    toLastPhase: to.facts?.lastPhase ?? null,
    fromLastPhaseAsAbsoluteIndex: from.facts?.lastPhaseAsAbsoluteIndex ?? null,
    toLastPhaseAsAbsoluteIndex: to.facts?.lastPhaseAsAbsoluteIndex ?? null,
    fromLastPhaseIsIntermission: from.facts?.lastPhaseIsIntermission ?? null,
    toLastPhaseIsIntermission: to.facts?.lastPhaseIsIntermission ?? null,
    fromBossPercentageRaw: from.facts?.bossPercentageRaw ?? null,
    toBossPercentageRaw: to.facts?.bossPercentageRaw ?? null,
    fromFightPercentageRaw: from.facts?.fightPercentageRaw ?? null,
    toFightPercentageRaw: to.facts?.fightPercentageRaw ?? null,
  };
}
