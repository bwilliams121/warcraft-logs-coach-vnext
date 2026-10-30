/**
 * M8-D: encounter progression, and everything it refuses to conclude.
 *
 * The aggregation itself is small. Most of what is asserted below is that the
 * obvious next step was NOT taken — that a phase number did not acquire a
 * direction, that a boss percentage did not become progress, that a wipe
 * becoming a kill is a named transition rather than an improvement, and that a
 * player who sat out a pull did not arrive in the output holding zeroes.
 */

import { describe, expect, it } from "vitest";

import type { PlayerFightResult } from "../../src/aggregation/cell.js";
import type { FightProcessingOutcome, RaidNightAnalysis } from "../../src/aggregation/raid-night.js";
import {
  buildRaidNightProgression,
  canJoinSequence,
  hardDimensionsResolved,
  type EncounterProgression,
  type RaidNightProgression,
} from "../../src/progression/encounter-progression.js";
import { assessPullComparability } from "../../src/comparison/pull-comparability.js";
import type { PullContext } from "../../src/comparison/pull-identity.js";
import { pullContextOf, type FightEncounterFacts } from "../../src/progression/pull-projection.js";
import type { EncounterOutcomeFacts } from "../../src/engine/normalization/encounter-facts.js";
import {
  absent,
  aggregateOf,
  analyzedCell,
  comparison,
  notAnalyzedCell,
  rosterFightFor,
  rosterPlayerFor,
  unavailable,
} from "../support/raid-night-fixture.js";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

interface FightSpec {
  readonly fightId: number;
  readonly encounterId?: number;
  readonly difficulty?: number | null;
  readonly kill?: boolean | null;
  readonly startTimeMs?: number;
  readonly endTimeMs?: number;
  /**
   * Source ids NOT in this pull.
   *
   * Drives BOTH the snapshot participation and the cell kind, because M7's input
   * gate refuses any other combination: an ABSENT cell for a listed participant
   * is a contradiction, and so is an analysis of somebody who was not there.
   */
  readonly absentSourceIds?: readonly number[];
  /** Fight-level processing outcome, when it is not the ordinary INGESTED. */
  readonly processing?: FightProcessingOutcome;
}

const PLAYER = 5;
const OTHER_PLAYER = 9;

/**
 * A raid night built through the REAL M7 gate and aggregator.
 *
 * Nothing here hand-writes a `RaidNightAnalysis`; if M7 would refuse these facts
 * the fixture throws, so the progression tests always run on an aggregate M7
 * actually produces.
 */
function night(
  fights: readonly FightSpec[],
  cellFor: (fightId: number, sourceId: number) => PlayerFightResult,
  sourceIds: readonly number[] = [PLAYER],
): RaidNightAnalysis {
  const presentIn = (fight: FightSpec): readonly number[] =>
    sourceIds.filter((sourceId) => !(fight.absentSourceIds ?? []).includes(sourceId));

  const rosterFights = fights.map((fight) =>
    rosterFightFor({
      fightId: fight.fightId,
      participants: presentIn(fight).map((sourceId) => ({ sourceId, specName: "Assassination" })),
      encounterId: fight.encounterId ?? 2900,
      difficulty: fight.difficulty === undefined ? 5 : fight.difficulty,
      kill: fight.kill === undefined ? false : fight.kill,
      startTimeMs: fight.startTimeMs ?? fight.fightId * 10_000,
      endTimeMs: fight.endTimeMs ?? fight.fightId * 10_000 + 5_000,
    }),
  );

  const cells = fights.flatMap((fight) =>
    sourceIds.map((sourceId) =>
      (fight.absentSourceIds ?? []).includes(sourceId)
        ? absent(fight.fightId, sourceId)
        : cellFor(fight.fightId, sourceId),
    ),
  );

  return aggregateOf({
    players: sourceIds.map((sourceId) => rosterPlayerFor({ sourceId })),
    fights: rosterFights,
    cells,
    fightOutcomes: fights.map((fight) => ({
      fightId: fight.fightId,
      outcome: fight.processing ?? "INGESTED",
    })),
  });
}

const analyzed = (fightId: number, sourceId: number): PlayerFightResult =>
  analyzedCell({ fightId, sourceId });

function facts(overrides: Partial<EncounterOutcomeFacts> = {}): EncounterOutcomeFacts {
  return {
    lastPhase: null,
    lastPhaseAsAbsoluteIndex: null,
    lastPhaseIsIntermission: null,
    bossPercentageRaw: null,
    fightPercentageRaw: null,
    wipeCalledReportTimeMs: null,
    ...overrides,
  };
}

function factsFor(entries: Record<number, Partial<EncounterOutcomeFacts>>): readonly FightEncounterFacts[] {
  return Object.entries(entries).map(([fightId, overrides]) => ({
    fightId: Number(fightId),
    outcome: facts(overrides),
    zone: null,
  }));
}

function build(
  aggregate: RaidNightAnalysis,
  encounterFacts: readonly FightEncounterFacts[] = [],
): RaidNightProgression {
  return buildRaidNightProgression({ aggregate, encounterFacts });
}

function only(progression: RaidNightProgression): EncounterProgression {
  expect(progression.encounters).toHaveLength(1);
  const first = progression.encounters[0];
  if (first === undefined) throw new Error("no encounter");
  return first;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

describe("grouping pulls into encounter sequences", () => {
  it("groups four pulls of one encounter and difficulty into one sequence", () => {
    const progression = build(
      night([{ fightId: 1 }, { fightId: 2 }, { fightId: 3 }, { fightId: 4 }], analyzed),
    );
    const encounter = only(progression);
    expect(encounter.pulls.map((pull) => pull.fightId)).toEqual([1, 2, 3, 4]);
    expect(progression.unresolvedPulls).toEqual([]);
  });

  it("separates different encounters", () => {
    const progression = build(
      night(
        [
          { fightId: 1, encounterId: 2900 },
          { fightId: 2, encounterId: 3420 },
        ],
        analyzed,
      ),
    );
    expect(progression.encounters).toHaveLength(2);
    expect(progression.encounters.map((entry) => entry.identity.encounterId)).toEqual([2900, 3420]);
  });

  it("separates different difficulties of the same encounter", () => {
    const progression = build(
      night(
        [
          { fightId: 1, difficulty: 4 },
          { fightId: 2, difficulty: 5 },
        ],
        analyzed,
      ),
    );
    expect(progression.encounters).toHaveLength(2);
    expect(progression.encounters.map((entry) => entry.identity.difficulty)).toEqual([4, 5]);
  });

  it("does not group trash as a boss progression", () => {
    // encounterId 0 is the trash sentinel. `0 === 0` would group every trash
    // segment in the report into one bogus "encounter".
    const progression = build(
      night(
        [
          { fightId: 1, encounterId: 0 },
          { fightId: 2, encounterId: 0 },
        ],
        analyzed,
      ),
    );
    expect(progression.encounters).toEqual([]);
    expect(progression.unresolvedPulls.map((pull) => pull.fightId)).toEqual([1, 2]);
    for (const pull of progression.unresolvedPulls) {
      expect(pull.selfComparability.encounter.reason).toBe("NOT_AN_ENCOUNTER");
    }
  });

  it("leaves a pull with an unresolved difficulty out of every sequence", () => {
    const progression = build(night([{ fightId: 1 }, { fightId: 2, difficulty: null }], analyzed));
    expect(only(progression).pulls.map((pull) => pull.fightId)).toEqual([1]);
    expect(progression.unresolvedPulls).toHaveLength(1);
    expect(progression.unresolvedPulls[0]?.selfComparability.difficulty.reason).toBe("DIFFICULTY_UNRESOLVED");
    expect(progression.unresolvedPulls[0]?.selfComparability.unresolvedDimensions).toContain("difficulty");
  });

  it("never forms a sequence without a resolved encounter and difficulty", () => {
    // The behavioural half of the guarantee the identity type does not narrow.
    const progression = build(
      night(
        [{ fightId: 1 }, { fightId: 2, encounterId: 0 }, { fightId: 3, difficulty: null }, { fightId: 4 }],
        analyzed,
      ),
    );
    for (const encounter of progression.encounters) {
      expect(encounter.identity.encounterId).not.toBeNull();
      expect(encounter.identity.encounterId).not.toBe(0);
      expect(encounter.identity.difficulty).not.toBeNull();
    }
    expect(progression.unresolvedPulls.map((pull) => pull.fightId)).toEqual([2, 3]);
  });

  it("groups a returned-to encounter with its earlier pulls, not by contiguity", () => {
    // A, B, A. The two A pulls are progression on A even though another
    // encounter happened in between.
    const progression = build(
      night(
        [
          { fightId: 1, encounterId: 2900 },
          { fightId: 2, encounterId: 3420 },
          { fightId: 3, encounterId: 2900 },
        ],
        analyzed,
      ),
    );

    expect(progression.encounters).toHaveLength(2);
    const bossA = progression.encounters.find((entry) => entry.identity.encounterId === 2900);
    expect(bossA?.pulls.map((pull) => pull.fightId)).toEqual([1, 3]);
  });

  it("compares a returned-to pull with the previous pull of ITS encounter", () => {
    const progression = build(
      night(
        [
          { fightId: 1, encounterId: 2900 },
          { fightId: 2, encounterId: 3420 },
          { fightId: 3, encounterId: 2900 },
        ],
        analyzed,
      ),
    );
    const bossA = progression.encounters.find((entry) => entry.identity.encounterId === 2900);
    // Fight 3 compares to fight 1 — NOT to fight 2, which is a different boss.
    expect(bossA?.pulls[1]?.changeFromPrevious?.fromFightId).toBe(1);
    expect(bossA?.pulls[1]?.changeFromPrevious?.toFightId).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Chronology
// ---------------------------------------------------------------------------

describe("canonical chronology", () => {
  it("orders pulls by start time, not by fight id", () => {
    // Fight ids deliberately disagree with chronology, so an id-only sort would
    // produce a different answer and this test would catch it.
    const progression = build(
      night(
        [
          { fightId: 9, startTimeMs: 1_000, endTimeMs: 2_000 },
          { fightId: 3, startTimeMs: 5_000, endTimeMs: 6_000 },
          { fightId: 7, startTimeMs: 9_000, endTimeMs: 9_500 },
        ],
        analyzed,
      ),
    );
    expect(only(progression).pulls.map((pull) => pull.fightId)).toEqual([9, 3, 7]);
  });

  it("breaks a start-time tie by fight id", () => {
    const progression = build(
      night(
        [
          { fightId: 8, startTimeMs: 1_000, endTimeMs: 2_000 },
          { fightId: 2, startTimeMs: 1_000, endTimeMs: 3_000 },
        ],
        analyzed,
      ),
    );
    expect(only(progression).pulls.map((pull) => pull.fightId)).toEqual([2, 8]);
  });

  it("orders unresolved pulls chronologically too", () => {
    const progression = build(
      night(
        [
          { fightId: 4, encounterId: 0, startTimeMs: 9_000, endTimeMs: 9_500 },
          { fightId: 6, encounterId: 0, startTimeMs: 1_000, endTimeMs: 2_000 },
        ],
        analyzed,
      ),
    );
    expect(progression.unresolvedPulls.map((pull) => pull.fightId)).toEqual([6, 4]);
  });
});

// ---------------------------------------------------------------------------
// Adjacent-pull facts
// ---------------------------------------------------------------------------

describe("adjacent pull facts", () => {
  function changeBetween(
    first: FightSpec,
    second: FightSpec,
    encounterFacts?: readonly FightEncounterFacts[],
  ) {
    const progression = build(night([first, second], analyzed), encounterFacts ?? []);
    const change = only(progression).pulls[1]?.changeFromPrevious;
    if (change === undefined || change === null) throw new Error("no change");
    return change;
  }

  it.each([
    ["INCREASED", 5_000, 9_000],
    ["DECREASED", 9_000, 5_000],
    ["SAME", 5_000, 5_000],
  ])("reports duration %s", (expected, firstDuration, secondDuration) => {
    const change = changeBetween(
      { fightId: 1, startTimeMs: 1_000, endTimeMs: 1_000 + firstDuration },
      { fightId: 2, startTimeMs: 50_000, endTimeMs: 50_000 + secondDuration },
    );
    expect(change.durationChange).toBe(expected);
    expect(change.fromDurationMs).toBe(firstDuration);
    expect(change.toDurationMs).toBe(secondDuration);
    expect(change.durationDeltaMs).toBe(secondDuration - firstDuration);
  });

  it.each([
    ["WIPE_TO_KILL", false, true],
    ["KILL_TO_WIPE", true, false],
    ["WIPE_TO_WIPE", false, false],
    ["KILL_TO_KILL", true, true],
  ])("reports outcome transition %s", (expected, firstKill, secondKill) => {
    const change = changeBetween({ fightId: 1, kill: firstKill }, { fightId: 2, kill: secondKill });
    expect(change.outcomeChange).toBe(expected);
  });

  it.each([
    ["the first", null, true],
    ["the second", false, null],
    ["both", null, null],
  ])("reports UNRESOLVED when %s outcome is unavailable", (_label, firstKill, secondKill) => {
    const change = changeBetween({ fightId: 1, kill: firstKill }, { fightId: 2, kill: secondKill });
    // Never WIPE_TO_KILL by treating a missing kill flag as a wipe.
    expect(change.outcomeChange).toBe("UNRESOLVED");
  });

  it("carries the M8-B comparability assessment for the pair", () => {
    const change = changeBetween({ fightId: 1, kill: false }, { fightId: 2, kill: true });
    expect(change.comparability.comparability).toBe("COMPARABLE_WITH_CAVEATS");
    expect(change.comparability.caveats).toContain("DIFFERENT_ENCOUNTER_OUTCOME");
    // Caveats disclose; they never gate. The two pulls are still one sequence.
    expect(change.comparability.incompatibleDimensions).toEqual([]);
  });

  it("gives the first pull of a sequence no change object", () => {
    const progression = build(night([{ fightId: 1 }, { fightId: 2 }], analyzed));
    expect(only(progression).pulls[0]?.changeFromPrevious).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Raw context: nothing acquires a direction
// ---------------------------------------------------------------------------

describe("raw encounter facts carry across without interpretation", () => {
  const RICH = factsFor({
    1: { lastPhase: 1, lastPhaseAsAbsoluteIndex: 4, bossPercentageRaw: 0.04, fightPercentageRaw: 0.04 },
    2: { lastPhase: 3, lastPhaseAsAbsoluteIndex: 0, bossPercentageRaw: 87.5, fightPercentageRaw: 91.25 },
  });

  it("preserves both phase fields separately, including when they disagree", () => {
    const progression = build(night([{ fightId: 1 }, { fightId: 2 }], analyzed), RICH);
    const change = only(progression).pulls[1]?.changeFromPrevious;
    expect(change?.fromLastPhase).toBe(1);
    expect(change?.fromLastPhaseAsAbsoluteIndex).toBe(4);
    expect(change?.toLastPhase).toBe(3);
    expect(change?.toLastPhaseAsAbsoluteIndex).toBe(0);
  });

  it("preserves raw percentages unscaled", () => {
    const progression = build(night([{ fightId: 1 }, { fightId: 2 }], analyzed), RICH);
    const change = only(progression).pulls[1]?.changeFromPrevious;
    expect(change?.fromBossPercentageRaw).toBe(0.04);
    expect(change?.toBossPercentageRaw).toBe(87.5);
    expect(change?.fromFightPercentageRaw).toBe(0.04);
    expect(change?.toFightPercentageRaw).toBe(91.25);
  });

  it("derives NO direction for phases or percentages", () => {
    // The exact key set of the change object. A future `phaseChange` or
    // `bossPercentageDirection` field fails here, which is the point: the
    // semantics of those fields are unproven, so there is nowhere to put one.
    const progression = build(night([{ fightId: 1 }, { fightId: 2 }], analyzed), RICH);
    const change = only(progression).pulls[1]?.changeFromPrevious;
    expect(Object.keys(change ?? {}).sort()).toEqual(
      [
        "comparability",
        "durationChange",
        "durationDeltaMs",
        "fromBossPercentageRaw",
        "fromDurationMs",
        "fromFightId",
        "fromFightPercentageRaw",
        "fromLastPhase",
        "fromLastPhaseAsAbsoluteIndex",
        "fromLastPhaseIsIntermission",
        "fromOutcome",
        "outcomeChange",
        "toBossPercentageRaw",
        "toDurationMs",
        "toFightId",
        "toFightPercentageRaw",
        "toLastPhase",
        "toLastPhaseAsAbsoluteIndex",
        "toLastPhaseIsIntermission",
        "toOutcome",
      ].sort(),
    );
  });

  it("keeps a null fact null rather than inferring why it is missing", () => {
    const progression = build(
      night([{ fightId: 1 }, { fightId: 2 }], analyzed),
      factsFor({ 1: { lastPhase: 2 }, 2: {} }),
    );
    const change = only(progression).pulls[1]?.changeFromPrevious;
    expect(change?.fromLastPhase).toBe(2);
    expect(change?.toLastPhase).toBeNull();
    expect(change?.toBossPercentageRaw).toBeNull();
  });

  it("records no encounter facts at all when none were supplied for a fight", () => {
    const progression = build(night([{ fightId: 1 }, { fightId: 2 }], analyzed), factsFor({ 1: {} }));
    const pulls = only(progression).pulls;
    expect(pulls[0]?.encounterFacts).not.toBeNull();
    // Distinct from "facts arrived with null fields".
    expect(pulls[1]?.encounterFacts).toBeNull();
  });

  it("carries M7's processing outcome as a fact", () => {
    const progression = build(night([{ fightId: 1 }], analyzed));
    expect(only(progression).pulls[0]?.processingOutcome).toBe("INGESTED");
  });
});

// ---------------------------------------------------------------------------
// Encounter-scoped recurrence
// ---------------------------------------------------------------------------

describe("recurrence is scoped to one encounter", () => {
  function cellWithToken(token: string) {
    return (fightId: number, sourceId: number): PlayerFightResult =>
      analyzedCell({
        fightId,
        sourceId,
        comparisons: [
          comparison({
            outcome: "REJECTED",
            basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
            observedToken: token,
            selectionPrecision: "EXACT_ENTRY",
          }),
        ],
      });
  }

  it("counts a key only within its own encounter", () => {
    const aggregate = night(
      [
        { fightId: 1, encounterId: 2900 },
        { fightId: 2, encounterId: 2900 },
        { fightId: 3, encounterId: 3420 },
      ],
      (fightId, sourceId) =>
        (fightId === 3 ? cellWithToken("kingsbane") : cellWithToken("garrote"))(fightId, sourceId),
    );
    const progression = build(aggregate);

    const bossA = progression.encounters.find((entry) => entry.identity.encounterId === 2900);
    const bossB = progression.encounters.find((entry) => entry.identity.encounterId === 3420);

    const keysOf = (encounter: EncounterProgression | undefined) =>
      encounter?.recurrence.rejectedPatterns.map((group) => group.key) ?? [];

    expect(keysOf(bossA).join()).toContain("garrote");
    expect(keysOf(bossA).join()).not.toContain("kingsbane");
    expect(keysOf(bossB).join()).toContain("kingsbane");
    expect(keysOf(bossB).join()).not.toContain("garrote");
  });

  it("reports the fight count within the encounter", () => {
    const progression = build(
      night([{ fightId: 1 }, { fightId: 2 }, { fightId: 3 }], (fightId, sourceId) =>
        cellWithToken("garrote")(fightId, sourceId),
      ),
    );
    const group = only(progression).recurrence.rejectedPatterns[0];
    expect(group?.fightCount).toBe(3);
    expect(group?.fightIds).toEqual([1, 2, 3]);
  });

  it("keeps the three collections separate", () => {
    const progression = build(night([{ fightId: 1 }], analyzed));
    const recurrence = only(progression).recurrence;
    expect(Object.keys(recurrence).sort()).toEqual([
      "evidenceLimitations",
      "exclusionPatterns",
      "rejectedPatterns",
    ]);
  });

  it("gives an absent player no recurrence and no counts", () => {
    const progression = build(
      night([{ fightId: 1 }, { fightId: 2, absentSourceIds: [PLAYER] }], (fightId, sourceId) =>
        cellWithToken("garrote")(fightId, sourceId),
      ),
    );
    const group = only(progression).recurrence.rejectedPatterns[0];
    // Fight 2 contributed nothing at all — not a zero, not an empty group.
    expect(group?.fightIds).toEqual([1]);
    expect(group?.fightCount).toBe(1);
  });

  it("gives an unsupported specialization no gameplay recurrence", () => {
    const progression = build(
      night([{ fightId: 1 }, { fightId: 2 }], (fightId, sourceId) =>
        fightId === 2
          ? notAnalyzedCell({ fightId, sourceId, status: "SPEC_NOT_SUPPORTED" })
          : cellWithToken("garrote")(fightId, sourceId),
      ),
    );
    expect(only(progression).recurrence.rejectedPatterns[0]?.fightIds).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// Player progression
// ---------------------------------------------------------------------------

describe("player progression", () => {
  it("records a player present across every pull", () => {
    const progression = build(night([{ fightId: 1 }, { fightId: 2 }, { fightId: 3 }], analyzed));
    const player = only(progression).players[0];
    expect(player?.points.map((point) => point.fightId)).toEqual([1, 2, 3]);
    expect(player?.fightsPresent).toBe(3);
    expect(player?.fightsAbsent).toBe(0);
    expect(player?.pullsWithoutCell).toEqual([]);
  });

  it("records an absence as a fact and never as zero counts", () => {
    const progression = build(night([{ fightId: 1 }, { fightId: 2, absentSourceIds: [PLAYER] }], analyzed));
    const player = only(progression).players[0];
    expect(player?.fightsPresent).toBe(1);
    expect(player?.fightsAbsent).toBe(1);

    const absentPoint = player?.points[1];
    expect(absentPoint?.cell.kind).toBe("ABSENT");
    // Structurally incapable of carrying a count. Not zero — absent.
    expect(absentPoint?.cell).not.toHaveProperty("counts");
  });

  it.each([
    ["an unsupported specialization", "NOT_ANALYZED"],
    ["an unavailable analysis", "ANALYSIS_UNAVAILABLE"],
  ])("preserves %s without gameplay counts", (_label, kind) => {
    // An ANALYSIS_UNAVAILABLE/FIGHT_INGESTION_FAILED cell is only coherent on a
    // fight whose evidence really did fail to arrive, so the fight outcome says
    // so too. M7's gate refuses any other pairing.
    const progression = build(
      night(
        [
          { fightId: 1 },
          ...(kind === "NOT_ANALYZED"
            ? [{ fightId: 2 }]
            : [{ fightId: 2, processing: "INGESTION_FAILED" as FightProcessingOutcome }]),
        ],
        (fightId, sourceId) => {
          if (fightId === 1) return analyzed(fightId, sourceId);
          return kind === "NOT_ANALYZED"
            ? notAnalyzedCell({ fightId, sourceId, status: "SPEC_NOT_SUPPORTED" })
            : unavailable(fightId, sourceId);
        },
      ),
    );
    const point = only(progression).players[0]?.points[1];
    expect(point?.cell.kind).toBe(kind);
    expect(point?.cell).not.toHaveProperty("counts");
    // Present, so it is not counted as an absence.
    expect(only(progression).players[0]?.fightsAbsent).toBe(0);
  });

  it("attaches M8-B analysis comparability between adjacent points", () => {
    const progression = build(night([{ fightId: 1 }, { fightId: 2 }], analyzed));
    const points = only(progression).players[0]?.points;
    expect(points?.[0]?.analysisComparabilityToPrevious).toBeNull();
    expect(points?.[1]?.analysisComparabilityToPrevious?.comparability).toBe("COMPATIBLE");
  });

  it("reports NOT_APPLICABLE rather than a comparison when a player was absent", () => {
    const progression = build(night([{ fightId: 1 }, { fightId: 2, absentSourceIds: [PLAYER] }], analyzed));
    const assessment = only(progression).players[0]?.points[1]?.analysisComparabilityToPrevious;
    expect(assessment?.comparability).toBe("NOT_APPLICABLE");
    expect(assessment?.reason).toBe("PLAYER_ABSENT_FROM_PULL");
  });

  it("reports NOT_COMPATIBLE when the authority artifact changed between pulls", () => {
    const progression = build(
      night([{ fightId: 1 }, { fightId: 2 }], (fightId, sourceId) =>
        analyzedCell({
          fightId,
          sourceId,
          ...(fightId === 2 ? { artifactRevision: "r2" } : {}),
        }),
      ),
    );
    const assessment = only(progression).players[0]?.points[1]?.analysisComparabilityToPrevious;
    expect(assessment?.comparability).toBe("NOT_COMPATIBLE");
    expect(assessment?.differingFields).toContain("authorityArtifactRevision");
  });

  it("lists every roster player, ascending by source id", () => {
    const progression = build(night([{ fightId: 1 }], analyzed, [OTHER_PLAYER, PLAYER]));
    expect(only(progression).players.map((player) => player.sourceId)).toEqual([PLAYER, OTHER_PLAYER]);
  });

  it("computes no rate, ratio or percentage for a player", () => {
    const progression = build(night([{ fightId: 1 }, { fightId: 2 }], analyzed));
    const serialized = JSON.stringify(only(progression).players[0]);
    // Checked as WORDS (split on non-letters and camelCase), each refused as a
    // word or a word prefix: \`matchRate\`, \`passRatio\` and \`percentage\` all
    // fail. A substring check would also refuse \`preparation\` (PREP-3), which
    // contains "ratio" and is no ratio.
    const words = serialized
      .split(/[^A-Za-z]+/)
      .flatMap((token) => token.split(/(?=[A-Z])/))
      .map((word) => word.toLowerCase());
    for (const banned of ["rate", "ratio", "percent", "accuracy", "score", "grade"]) {
      expect(
        words.filter((word) => word.startsWith(banned)),
        banned,
      ).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

describe("the output contains no improvement vocabulary", () => {
  it("never says improved, regressed, better or worse anywhere", () => {
    const progression = build(
      night(
        [
          { fightId: 1, kill: false },
          { fightId: 2, kill: true },
        ],
        analyzed,
      ),
      factsFor({ 1: { bossPercentageRaw: 87.5 }, 2: { bossPercentageRaw: 0 } }),
    );
    const serialized = JSON.stringify(progression).toLowerCase();
    for (const banned of [
      "improv",
      "regress",
      "better",
      "worse",
      "optimal",
      "accuracy",
      "score",
      "grade",
      "success",
      "failed",
    ]) {
      expect(serialized, `output says ${banned}`).not.toContain(banned);
    }
    // A wipe becoming a kill is a named transition and nothing more.
    expect(only(progression).pulls[1]?.changeFromPrevious?.outcomeChange).toBe("WIPE_TO_KILL");
  });
});

// ---------------------------------------------------------------------------
// Determinism and purity
// ---------------------------------------------------------------------------

describe("determinism and purity", () => {
  const SPECS: readonly FightSpec[] = [
    { fightId: 3, encounterId: 3420, startTimeMs: 20_000, endTimeMs: 25_000 },
    { fightId: 1, encounterId: 2900, startTimeMs: 1_000, endTimeMs: 9_000, kill: false },
    { fightId: 2, encounterId: 2900, startTimeMs: 10_000, endTimeMs: 14_000, kill: true },
    { fightId: 4, encounterId: 0, startTimeMs: 30_000, endTimeMs: 31_000 },
  ];

  it("produces identical output for repeated calls on one input", () => {
    const aggregate = night(SPECS, analyzed);
    const first = build(aggregate, factsFor({ 1: { lastPhase: 2 }, 2: { lastPhase: 3 } }));
    const second = build(aggregate, factsFor({ 1: { lastPhase: 2 }, 2: { lastPhase: 3 } }));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("produces canonical output regardless of encounter-facts input order", () => {
    const aggregate = night(SPECS, analyzed);
    const ordered = factsFor({ 1: { lastPhase: 2 }, 2: { lastPhase: 3 } });
    const reversed = [...ordered].reverse();
    expect(JSON.stringify(build(aggregate, reversed))).toBe(JSON.stringify(build(aggregate, ordered)));
  });

  it("does not mutate the aggregate or the encounter facts", () => {
    const aggregate = deepFreeze(night(SPECS, analyzed));
    const encounterFacts = deepFreeze(factsFor({ 1: { lastPhase: 2 }, 2: { lastPhase: 3 } }));

    const before = JSON.stringify([aggregate, encounterFacts]);
    buildRaidNightProgression({ aggregate, encounterFacts });
    expect(JSON.stringify([aggregate, encounterFacts])).toBe(before);
  });

  it("keeps M7 cells byte-identical in the output", () => {
    const aggregate = night(SPECS, analyzed);
    const progression = build(aggregate);
    for (const encounter of progression.encounters) {
      for (const player of encounter.players) {
        for (const point of player.points) {
          const source = aggregate.cells.find(
            (cell) => cell.fightId === point.fightId && cell.playerKey === player.playerKey,
          );
          // Same object, not a reshaped copy.
          expect(point.cell).toBe(source);
        }
      }
    }
  });

  it("reuses M7's snapshot identity unchanged", () => {
    const aggregate = night(SPECS, analyzed);
    expect(build(aggregate).identity).toBe(aggregate.identity);
  });
});

// ---------------------------------------------------------------------------
// Sequence membership: hard compatibility is not transitive
// ---------------------------------------------------------------------------

/**
 * A `PullContext` with hand-controlled version evidence.
 *
 * Built directly rather than through `pullContextOf`, and that is the point of
 * these cases. The adapter derives version evidence from the report-level
 * `RaidNightIdentity`, so every pull of one raid night currently carries
 * byte-identical version fields and grouping happens to be transitive.
 *
 * That is an accident of today's input, not a property of the domain. M8-A found
 * `partition` only on ranking payloads, which are per-pull, so the moment a
 * later checkpoint supplies per-pull version evidence the bridge below becomes
 * reachable through the composed path. The rule is therefore tested where the
 * rule lives.
 */
function contextWith(options: {
  readonly fightId: number;
  readonly logVersion?: number | null;
  readonly encounterId?: number;
  readonly difficulty?: number | null;
  readonly raidSize?: number | null;
  readonly outcome?: PullContext["outcome"];
}): PullContext {
  return {
    identity: {
      reportCode: "aBcDeFgH12345678",
      reportRevision: 30,
      fightId: options.fightId,
      encounterId: options.encounterId ?? 3420,
      difficulty: options.difficulty === undefined ? 4 : options.difficulty,
      version: {
        gameVersion: 1,
        logVersion: options.logVersion === undefined ? 17 : options.logVersion,
        partition: null,
      },
    },
    outcome: options.outcome ?? "WIPE",
    durationMs: 100_000,
    raidSize: options.raidSize ?? 24,
  };
}

describe("sequence membership tests every member, not a representative", () => {
  it("reproduces the M8-B pairwise facts the bridge case depends on", () => {
    // Non-vacuity for everything below: these are the three assessments that
    // make representative-only membership unsound, asserted directly.
    const a = contextWith({ fightId: 1, logVersion: null });
    const b = contextWith({ fightId: 2, logVersion: 17 });
    const c = contextWith({ fightId: 3, logVersion: 18 });

    expect(assessPullComparability(a, b).version.compatibility).toBe("COMPATIBLE");
    expect(assessPullComparability(a, c).version.compatibility).toBe("COMPATIBLE");

    const contradiction = assessPullComparability(b, c);
    expect(contradiction.version.compatibility).toBe("UNKNOWN");
    expect(contradiction.version.basis).toBe("EVIDENCE_CONTRADICTION");
    expect(contradiction.unresolvedDimensions).toContain("version");
  });

  it("refuses a candidate whose missing-value bridge hides a contradiction", () => {
    // A(null) then B(17) then C(18). C compares cleanly with A, so a
    // representative-only test would admit it.
    const a = contextWith({ fightId: 1, logVersion: null });
    const b = contextWith({ fightId: 2, logVersion: 17 });
    const c = contextWith({ fightId: 3, logVersion: 18 });

    expect(canJoinSequence([a], b)).toBe(true);
    expect(canJoinSequence([a], c)).toBe(true);
    // The correction: against the WHOLE sequence, C is refused.
    expect(canJoinSequence([a, b], c)).toBe(false);
  });

  it("refuses the inverse bridge, where the missing value arrives second", () => {
    // A(17) then B(null) then C(18). B individually compares cleanly with both,
    // and must not let A and C coexist in one sequence.
    const a = contextWith({ fightId: 1, logVersion: 17 });
    const b = contextWith({ fightId: 2, logVersion: null });
    const c = contextWith({ fightId: 3, logVersion: 18 });

    expect(canJoinSequence([a], b)).toBe(true);
    expect(canJoinSequence([b], c)).toBe(true);
    expect(canJoinSequence([a, b], c)).toBe(false);
    // The discriminating form. With the members the other way round, a
    // representative-only rule would consult only B — which holds no logVersion
    // and therefore contradicts nothing — and admit C. The whole-sequence rule
    // still reaches A and refuses.
    expect(canJoinSequence([b, a], c)).toBe(false);
  });

  it("admits a candidate compatible with every member", () => {
    const a = contextWith({ fightId: 1, logVersion: 17 });
    const b = contextWith({ fightId: 2, logVersion: 17 });
    expect(canJoinSequence([a, b], contextWith({ fightId: 3, logVersion: 17 }))).toBe(true);
  });

  it("admits a candidate differing from a member only in soft caveats", () => {
    // Raid size and outcome are contextual. They produce caveats and must never
    // gate membership — M8-A measured comparable pulls at 24, 25, 27 and 30.
    const a = contextWith({ fightId: 1, raidSize: 24 });
    const candidate = contextWith({ fightId: 2, raidSize: 30, outcome: "KILL" });

    const assessment = assessPullComparability(a, candidate);
    expect(assessment.comparability).toBe("COMPARABLE_WITH_CAVEATS");
    expect(assessment.caveats.length).toBeGreaterThan(0);
    expect(canJoinSequence([a], candidate)).toBe(true);
  });

  it("refuses a candidate with a known encounter incompatibility against any member", () => {
    const a = contextWith({ fightId: 1, encounterId: 3420 });
    const b = contextWith({ fightId: 2, encounterId: 3420 });
    expect(canJoinSequence([a, b], contextWith({ fightId: 3, encounterId: 2900 }))).toBe(false);
  });

  it("is unaffected by the order of the existing members", () => {
    const a = contextWith({ fightId: 1, logVersion: null });
    const b = contextWith({ fightId: 2, logVersion: 17 });
    const c = contextWith({ fightId: 3, logVersion: 18 });
    expect(canJoinSequence([a, b], c)).toBe(canJoinSequence([b, a], c));
  });

  it("starts a new sequence rather than calling a self-resolvable pull unresolved", () => {
    // Composed path. With today's adapter the version bridge is unreachable, so
    // this exercises the "rejected by an existing sequence" branch through a
    // known encounter incompatibility instead.
    const progression = build(
      night(
        [
          { fightId: 1, encounterId: 3420 },
          { fightId: 2, encounterId: 2900 },
          { fightId: 3, encounterId: 3420 },
        ],
        analyzed,
      ),
    );
    expect(progression.unresolvedPulls).toEqual([]);
    expect(progression.encounters).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

describe("every emitted sequence is pairwise hard-compatible", () => {
  /**
   * The strongest property M8-D owes: no two pulls in one sequence may have an
   * incompatible or unresolved hard dimension between them.
   *
   * Checked over every UNORDERED PAIR rather than adjacent ones. An
   * adjacent-only check passes happily while a representative-only membership
   * rule merges contradictory pulls, which is the defect this correction fixes.
   */
  function assertPairwiseCompatible(progression: RaidNightProgression, aggregate: RaidNightAnalysis): void {
    const summaryById = new Map(aggregate.fights.map((fight) => [fight.fightId, fight]));

    for (const encounter of progression.encounters) {
      const contexts = encounter.pulls.map((pull) => {
        const summary = summaryById.get(pull.fightId);
        if (summary === undefined) throw new Error(`no summary for fight ${String(pull.fightId)}`);
        return pullContextOf(aggregate.identity, summary);
      });

      for (let left = 0; left < contexts.length; left += 1) {
        for (let right = left + 1; right < contexts.length; right += 1) {
          const one = contexts[left];
          const other = contexts[right];
          if (one === undefined || other === undefined) throw new Error("missing context");
          expect(
            hardDimensionsResolved(assessPullComparability(one, other)),
            `fights ${String(encounter.pulls[left]?.fightId)} and ${String(encounter.pulls[right]?.fightId)} share a sequence but are not hard-compatible`,
          ).toBe(true);
        }
      }
    }
  }

  const FIXTURES: readonly (readonly FightSpec[])[] = [
    [{ fightId: 1 }, { fightId: 2 }, { fightId: 3 }, { fightId: 4 }],
    [
      { fightId: 1, encounterId: 3420 },
      { fightId: 2, encounterId: 2900 },
      { fightId: 3, encounterId: 3420 },
      { fightId: 4, encounterId: 2900 },
    ],
    [
      { fightId: 1, difficulty: 4 },
      { fightId: 2, difficulty: 5 },
      { fightId: 3, difficulty: 4 },
    ],
    [
      { fightId: 1 },
      { fightId: 2, encounterId: 0 },
      { fightId: 3, difficulty: null },
      { fightId: 4 },
      { fightId: 5, encounterId: 2900 },
    ],
    [
      { fightId: 9, startTimeMs: 1_000, endTimeMs: 4_000 },
      { fightId: 3, startTimeMs: 5_000, endTimeMs: 9_000, encounterId: 2900 },
      { fightId: 7, startTimeMs: 12_000, endTimeMs: 15_000 },
    ],
  ];

  it.each(FIXTURES.map((specs, index) => [index, specs] as const))(
    "fixture %i produces only pairwise-compatible sequences",
    (_index, specs) => {
      const aggregate = night(specs, analyzed);
      assertPairwiseCompatible(build(aggregate), aggregate);
    },
  );

  it("did real grouping work, so the invariant is not vacuous", () => {
    const aggregate = night(FIXTURES[1] ?? [], analyzed);
    const progression = build(aggregate);
    expect(progression.encounters).toHaveLength(2);
    expect(progression.encounters.every((encounter) => encounter.pulls.length === 2)).toBe(true);
  });

  it.each(FIXTURES.map((specs, index) => [index, specs] as const))(
    "fixture %i is invariant under input permutation",
    (_index, specs) => {
      const forward = build(night(specs, analyzed));
      const reversed = build(night([...specs].reverse(), analyzed));
      expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
    },
  );
});
