/**
 * Same-report progression: the pulls of one encounter, in order, with what
 * factually changed between them.
 *
 * WHAT M7 ALREADY ANSWERS, AND IS NOT REPEATED HERE
 *
 * Who was present, which fights were analyzed, per-cell MATCH/REJECTED/UNKNOWN
 * counts, recurrence keys, fight summaries, and a per-player series across the
 * whole night. None of that is recomputed. Gameplay analysis is not re-run, not
 * re-read and not reinterpreted: every count this module publishes arrived
 * inside a `PlayerFightResult` that M7 produced.
 *
 * WHAT IS ACTUALLY NEW
 *
 * M7's series is ordered by fight id across the entire night, which mixes
 * encounters together. "Pull 2 of Sszorak" is not a concept it has. This module
 * adds exactly that: encounter-scoped grouping, encounter-scoped recurrence, and
 * adjacent-pull facts computed WITHIN an encounter rather than across the night.
 *
 * GROUPING IS BY ENCOUNTER IDENTITY, NOT BY CONTIGUOUS RUN
 *
 * A raid night of A, B, A is two encounters and three pulls, and the two A pulls
 * belong together. Guilds genuinely do pull a boss, switch to another, and come
 * back — because of a reset, a break, or a composition change — and those later
 * pulls are still progression on the first boss. Contiguity would split them for
 * a reason that is about the schedule rather than about the encounter.
 *
 * The cost is stated plainly: an adjacent pair may straddle a gap of an hour and
 * another encounter. That is why every `AdjacentPullChange` carries the full
 * M8-B comparability assessment including its caveats, rather than implying the
 * two pulls were back to back.
 *
 * ELIGIBILITY AND GROUPING BOTH DEFER TO M8-B
 *
 * Not one encounter, difficulty or version rule is restated in this file. A pull
 * is eligible when M8-B, asked to compare it WITH ITSELF, resolves every hard
 * dimension; a pull joins a sequence when M8-B resolves every hard dimension
 * between it and EVERY pull already there. Self-comparison is the whole
 * eligibility test, and it is not a trick — a pull whose encounter id is null,
 * or is the trash sentinel `0`, or whose difficulty Warcraft Logs never
 * supplied, is genuinely not comparable even to itself, and M8-B says so with
 * its own reason attached.
 *
 * Membership is against every member rather than against a representative
 * because hard compatibility is not transitive; `canJoinSequence` carries the
 * worked example. A pull that is self-resolvable but fits no existing sequence
 * starts a new one — it is not unresolved, and two sequences may legitimately
 * carry the same apparent encounter and difficulty when the evidence about them
 * disagrees.
 *
 * That is what keeps the trash rule, the null rule and the version rule in one
 * place. When M8-B strengthens — when partition semantics are finally proven —
 * this module inherits it without an edit.
 */

import type { PlayerFightResult } from "../aggregation/cell.js";
import type { FightProcessingOutcome, FightSummary, RecurrenceSummary } from "../aggregation/raid-night.js";
import type { RaidNightAnalysis } from "../aggregation/raid-night.js";
import { summarizeRecurrence } from "../aggregation/roster-aggregator.js";
import {
  assessAnalysisComparability,
  type AnalysisComparabilityAssessment,
} from "../comparison/analysis-comparability.js";
import {
  assessPullComparability,
  type PullComparabilityAssessment,
} from "../comparison/pull-comparability.js";
import type { PullContext, PullOutcome } from "../comparison/pull-identity.js";
import type { EncounterOutcomeFacts, ZoneMetadata } from "../engine/normalization/encounter-facts.js";
import type { RaidNightIdentity } from "../wcl/roster-snapshot.js";
import { adjacentPullChange, type AdjacentPullChange } from "./adjacent-change.js";
import { pullContextOf, type FightEncounterFacts } from "./pull-projection.js";

const ASCENDING = (left: number, right: number): number => left - right;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

/** One pull of one encounter. Facts only. */
export interface ProgressionPull {
  readonly fightId: number;
  /** Report-relative. The canonical ordering key. */
  readonly startTimeMs: number;
  readonly durationMs: number;
  readonly outcome: PullOutcome;
  readonly raidSize: number | null;
  /** M7's fact about what processing this fight received. Never a judgement. */
  readonly processingOutcome: FightProcessingOutcome;
  /**
   * M8-C's typed pull metadata, or `null` when none was supplied for this fight.
   *
   * `null` here means the caller had no facts to give — for an un-ingested fight
   * there is no normalized core to read them from, and `processingOutcome` is
   * what explains that. It is distinct from facts that arrived with null fields.
   */
  readonly encounterFacts: EncounterOutcomeFacts | null;
  readonly zone: ZoneMetadata | null;
  /** `null` for the first pull of the sequence. There is nothing before it. */
  readonly changeFromPrevious: AdjacentPullChange | null;
}

/**
 * The encounter a sequence is about.
 *
 * `encounterId` and `difficulty` are typed nullable and are NEVER null on a
 * formed sequence — M8-B eligibility requires both resolved, so a group cannot
 * exist without them. They are typed this way rather than narrowed because
 * narrowing here would mean restating M8-B's identity rules in a second place,
 * which is the one thing this module refuses to do. A test asserts the
 * behavioural guarantee instead.
 */
export interface EncounterProgressionIdentity {
  readonly encounterId: number | null;
  readonly difficulty: number | null;
  /** From the first pull that carried one. Context only, never an identity key. */
  readonly zone: ZoneMetadata | null;
}

/** One player across the pulls of one encounter. */
export interface PlayerProgression {
  readonly playerKey: string;
  readonly sourceId: number;
  /** One per pull that has a cell for this player, in sequence order. */
  readonly points: readonly PlayerProgressionPoint[];
  readonly fightsPresent: number;
  readonly fightsAbsent: number;
  /**
   * Pulls in this sequence for which the input carried no cell at all.
   *
   * Ascending. Normally empty: M7 emits a cell for every roster player in every
   * included fight, ABSENT included. It exists so that a short `points` list is
   * visible as a missing input rather than read as a shorter sequence — and so
   * that nothing here fabricates an ABSENT to fill the hole.
   */
  readonly pullsWithoutCell: readonly number[];
}

export interface PlayerProgressionPoint {
  readonly fightId: number;
  /** M7's cell, carried unchanged. All four kinds are preserved. */
  readonly cell: PlayerFightResult;
  /**
   * M8-B's verdict on whether this point's analysis may be compared with the
   * previous point's. `null` for the first point.
   *
   * Carried, never acted on. A consumer that wants to place two sets of M7
   * counts side by side must require COMPATIBLE first; NOT_APPLICABLE and
   * UNKNOWN are both refusals, for different reasons, and neither is a statement
   * about how anybody played.
   */
  readonly analysisComparabilityToPrevious: AnalysisComparabilityAssessment | null;
}

export interface EncounterProgression {
  readonly identity: EncounterProgressionIdentity;
  /** Canonical chronological order. */
  readonly pulls: readonly ProgressionPull[];
  /** Ascending by source id. Every roster player, including never-present ones. */
  readonly players: readonly PlayerProgression[];
  /**
   * M7's three recurrence collections, scoped to THIS encounter's pulls.
   *
   * Produced by M7's own `summarizeRecurrence` over a filtered cell list, so the
   * key vocabulary, the ordering and the treatment of non-analyzed cells are
   * M7's and cannot drift. The three collections stay separate here for the same
   * reason they are separate there: only `rejectedPatterns` is evidence about a
   * player at all.
   */
  readonly recurrence: RecurrenceSummary;
}

/**
 * A pull that could not be placed in any encounter sequence.
 *
 * NOT AN ERROR AND NOT A FAILURE. Trash lands here, and so does a fight whose
 * difficulty Warcraft Logs did not report. The pull happened; what is missing is
 * an encounter identity strong enough to group it by, and forcing it into a
 * sequence would silently compare two things nobody established were alike.
 */
export interface UnresolvedPull {
  readonly fightId: number;
  readonly startTimeMs: number;
  /**
   * M8-B's assessment of this pull against ITSELF.
   *
   * The complete reason, in M8-B's own vocabulary: `encounter.reason` says
   * whether the id was absent or the trash sentinel, `difficulty.reason` says
   * whether one was supplied, and `unresolvedDimensions` lists what blocked it.
   * No reason vocabulary is invented here.
   */
  readonly selfComparability: PullComparabilityAssessment;
}

export interface RaidNightProgression {
  /** M7's factual snapshot identity, reused unchanged. */
  readonly identity: RaidNightIdentity;
  /** Ordered by each sequence's first pull, chronologically. */
  readonly encounters: readonly EncounterProgression[];
  /** Canonical chronological order. */
  readonly unresolvedPulls: readonly UnresolvedPull[];
}

export interface RaidNightProgressionInput {
  readonly aggregate: RaidNightAnalysis;
  /** M8-C facts per fight. A fight with no entry simply has none. */
  readonly encounterFacts: readonly FightEncounterFacts[];
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * Canonical chronology: fight start time, then fight id.
 *
 * START TIME IS THE PRIMARY KEY, AND FIGHT ID IS ONLY THE TIE-BREAK. Ordering by
 * id alone would assume ids ascend with time. That is very likely true and it is
 * not PROVEN anywhere in this repository, so it is not relied on — Warcraft Logs
 * documents `startTime` as report-relative milliseconds, which is an ordering
 * this codebase already trusts for every event it normalizes.
 *
 * The tie-break is required rather than decorative: two fights can share a start
 * time in a malformed or overlapping report, and a comparator that returned 0
 * would leave their order to the input array. Fight id is unique within a
 * report, so the combined comparator is a total order.
 *
 * No wall clock is read. Both values are report-relative facts from one snapshot.
 */
function compareChronologically(left: FightSummary, right: FightSummary): number {
  return left.startTimeMs === right.startTimeMs
    ? ASCENDING(left.fightId, right.fightId)
    : ASCENDING(left.startTimeMs, right.startTimeMs);
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

interface CandidatePull {
  readonly fight: FightSummary;
  readonly context: PullContext;
  readonly facts: EncounterOutcomeFacts | null;
  readonly zone: ZoneMetadata | null;
}

/**
 * Whether M8-B resolved every hard dimension between two pulls.
 *
 * Reads only `incompatibleDimensions` and `unresolvedDimensions`, never the
 * headline verdict. That matters: two identical pulls whose `kill` is UNRESOLVED
 * produce an `ENCOUNTER_OUTCOME_UNRESOLVED` caveat and therefore the verdict
 * COMPARABLE_WITH_CAVEATS. Caveats are contextual disclosure and must not gate
 * grouping — keying on the verdict string would have split a sequence over a
 * missing kill flag.
 */
export function hardDimensionsResolved(assessment: PullComparabilityAssessment): boolean {
  return assessment.incompatibleDimensions.length === 0 && assessment.unresolvedDimensions.length === 0;
}

/**
 * Whether a candidate may join a sequence: compatible with EVERY member.
 *
 * WHY NOT JUST THE FIRST MEMBER
 *
 * Because hard compatibility is not transitive, and M8-B declines to pretend it
 * is. A version field that only one side holds is recorded as unresolved and
 * contradicts nothing; two held values that differ is an EVIDENCE_CONTRADICTION.
 * So for three pulls of one encounter in one report revision:
 *
 *     A logVersion null, B logVersion 17   ->  COMPATIBLE  (nothing disagrees)
 *     A logVersion null, C logVersion 18   ->  COMPATIBLE  (nothing disagrees)
 *     B logVersion 17,   C logVersion 18   ->  UNKNOWN     (they disagree)
 *
 * Testing a candidate only against A would admit both B and C, merging two pulls
 * whose evidence positively contradicts, with A's MISSING value acting as the
 * bridge. Missing evidence must never bridge observed contradictory evidence.
 *
 * EXPORTED BECAUSE IT IS THE RULE, NOT AN IMPLEMENTATION DETAIL. With today's
 * adapter the bridge is not reachable — `pullContextOf` derives version evidence
 * from the report-level `RaidNightIdentity`, so every pull in one raid night
 * carries byte-identical version fields and grouping happens to be transitive.
 * That is an accident of the current input, not a property of the domain: the
 * moment a later checkpoint supplies per-pull version evidence (M8-A found
 * `partition` only on ranking payloads, which are per-pull), the bridge becomes
 * reachable. The rule is therefore enforced structurally and tested directly
 * here, rather than resting on a coincidence that a future input can remove.
 *
 * Caveats never gate. Only `incompatibleDimensions` and `unresolvedDimensions`
 * are consulted, so two pulls differing in raid size or outcome still group.
 */
export function canJoinSequence(members: readonly PullContext[], candidate: PullContext): boolean {
  return members.every((member) => hardDimensionsResolved(assessPullComparability(member, candidate)));
}

interface MutableGroup {
  /**
   * The first pull of the sequence, chronologically.
   *
   * USED FOR THE SEQUENCE'S IDENTITY AND NOTHING ELSE. It is emphatically NOT
   * the thing candidates are tested against — see `buildRaidNightProgression`
   * for why representative-only membership is unsound.
   */
  readonly representative: CandidatePull;
  readonly members: CandidatePull[];
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

function playerProgressionFor(
  player: { readonly playerKey: string; readonly sourceId: number },
  pulls: readonly CandidatePull[],
  cellsByFightAndPlayer: ReadonlyMap<string, PlayerFightResult>,
): PlayerProgression {
  const points: PlayerProgressionPoint[] = [];
  const pullsWithoutCell: number[] = [];
  let fightsPresent = 0;
  let fightsAbsent = 0;
  let previous: PlayerFightResult | null = null;

  for (const pull of pulls) {
    const cell = cellsByFightAndPlayer.get(`${String(pull.fight.fightId)}:${player.playerKey}`);
    if (cell === undefined) {
      // No cell was supplied. Recorded as a hole rather than filled with an
      // ABSENT, which would be a participation claim nobody made.
      pullsWithoutCell.push(pull.fight.fightId);
      continue;
    }

    if (cell.kind === "ABSENT") {
      fightsAbsent += 1;
    } else {
      fightsPresent += 1;
    }

    points.push({
      fightId: pull.fight.fightId,
      cell,
      analysisComparabilityToPrevious: previous === null ? null : assessAnalysisComparability(previous, cell),
    });
    previous = cell;
  }

  return {
    playerKey: player.playerKey,
    sourceId: player.sourceId,
    points,
    fightsPresent,
    fightsAbsent,
    pullsWithoutCell,
  };
}

// ---------------------------------------------------------------------------
// The aggregation
// ---------------------------------------------------------------------------

/**
 * Builds the encounter progression view of one raid night.
 *
 * PURE AND TOTAL. It reads its input, allocates its own output and mutates
 * nothing it was given — every sort operates on a copy. It performs no
 * retrieval: every fact it publishes was already retrieved by M7 and M8-C, so
 * calling it costs zero Warcraft Logs requests and zero API points.
 */
export function buildRaidNightProgression(input: RaidNightProgressionInput): RaidNightProgression {
  const { aggregate } = input;
  const identity = aggregate.identity;

  const factsByFightId = new Map(input.encounterFacts.map((entry) => [entry.fightId, entry]));

  const cellsByFightAndPlayer = new Map(
    aggregate.cells.map((cell) => [`${String(cell.fightId)}:${cell.playerKey}`, cell]),
  );

  // Copy before sorting. The caller's array is not ours to reorder.
  const chronological = [...aggregate.fights].sort(compareChronologically);

  const groups: MutableGroup[] = [];
  const unresolvedPulls: UnresolvedPull[] = [];

  for (const fight of chronological) {
    const facts = factsByFightId.get(fight.fightId);
    const candidate: CandidatePull = {
      fight,
      context: pullContextOf(identity, fight),
      facts: facts?.outcome ?? null,
      zone: facts?.zone ?? null,
    };

    // Eligibility: can M8-B resolve this pull against itself?
    const self = assessPullComparability(candidate.context, candidate.context);
    if (!hardDimensionsResolved(self)) {
      unresolvedPulls.push({
        fightId: fight.fightId,
        startTimeMs: fight.startTimeMs,
        selfComparability: self,
      });
      continue;
    }

    // The first group that accepts this pull against EVERY member — see
    // `canJoinSequence` for why a representative is not enough.
    //
    // Groups are created in chronological order of their first pull and members
    // are appended in chronological order, so "first group that accepts" is
    // deterministic and independent of the caller's array order.
    const existing = groups.find((group) =>
      canJoinSequence(
        group.members.map((member) => member.context),
        candidate.context,
      ),
    );
    if (existing === undefined) {
      // Rejected by every existing sequence, yet self-resolvable. Its own
      // identity is fine, so it is NOT an unresolved pull — it starts a new
      // sequence.
      //
      // That can legitimately produce two sequences carrying the same apparent
      // encounter and difficulty. That is the truthful outcome: the evidence says
      // these pulls cannot all be compared, and nothing here is in a position to
      // decide which pull is the wrong one.
      groups.push({ representative: candidate, members: [candidate] });
      continue;
    }
    existing.members.push(candidate);
  }

  const encounters = groups.map((group) => buildEncounter(group, aggregate, cellsByFightAndPlayer));

  return { identity, encounters, unresolvedPulls };
}

function buildEncounter(
  group: MutableGroup,
  aggregate: RaidNightAnalysis,
  cellsByFightAndPlayer: ReadonlyMap<string, PlayerFightResult>,
): EncounterProgression {
  // Members were appended in chronological order, but the sort is applied again
  // rather than assumed: it is cheap, and it makes the ordering a property of
  // this function rather than of how the loop above happened to run.
  const members = [...group.members].sort((left, right) => compareChronologically(left.fight, right.fight));

  const pulls: ProgressionPull[] = members.map((member, index) => {
    const previous = index === 0 ? undefined : members[index - 1];
    const changeFromPrevious =
      previous === undefined
        ? null
        : adjacentPullChange(
            { context: previous.context, facts: previous.facts },
            { context: member.context, facts: member.facts },
            // Assessed between the two ADJACENT pulls, not against the group
            // representative, so the caveats describe this specific pair.
            assessPullComparability(previous.context, member.context),
          );

    return {
      fightId: member.fight.fightId,
      startTimeMs: member.fight.startTimeMs,
      durationMs: member.fight.durationMs,
      outcome: member.context.outcome,
      raidSize: member.fight.size,
      processingOutcome: member.fight.processingOutcome,
      encounterFacts: member.facts,
      zone: member.zone,
      changeFromPrevious,
    };
  });

  const fightIds = new Set(members.map((member) => member.fight.fightId));
  const scopedCells = aggregate.cells.filter((cell) => fightIds.has(cell.fightId));

  const players = [...aggregate.roster]
    .sort((left, right) =>
      left.sourceId === right.sourceId
        ? compareStrings(left.playerKey, right.playerKey)
        : ASCENDING(left.sourceId, right.sourceId),
    )
    .map((player) => playerProgressionFor(player, members, cellsByFightAndPlayer));

  const representative = group.representative;

  return {
    identity: {
      encounterId: representative.fight.encounterId,
      difficulty: representative.fight.difficulty,
      // The first pull in the sequence that carried a zone. Context only.
      zone: members.find((member) => member.zone !== null)?.zone ?? null,
    },
    pulls,
    players,
    // M7's own tally, over this encounter's cells only.
    recurrence: summarizeRecurrence(scopedCells),
  };
}
