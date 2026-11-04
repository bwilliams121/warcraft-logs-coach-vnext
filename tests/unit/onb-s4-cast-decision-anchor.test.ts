/**
 * ONB-S4: the shared cast and channel decision anchor.
 *
 * A cast-time action is decided when its cast BEGINS; a channel when it
 * starts; an instant when it lands. These tests pin when each anchor is
 * established, when it is UNKNOWN instead, and that no instant inside a cast
 * or channel ever reads as idle.
 *
 * The profiles below are TEST profiles. They state which ids execute how for
 * the purpose of exercising the shared plumbing; they are not reviewed game
 * data and no specialization reads them.
 */

import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import {
  buildCastTimeline,
  hastedCastTime,
  type CastAnchorProfile,
  type CastDurationFact,
  type CastExecution,
  type CastTimeline,
  type ChannelDurationFact,
} from "../../src/engine/game-state/casting/cast-decision-anchor.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import { loadCommittedEvidenceArchive } from "../support/corpus/evidence-archive.js";
import { bundleOf, corpusState } from "../support/corpus/fight.js";
import {
  FIGHT_END_MS,
  FIGHT_START_MS,
  castEvent,
  observableCategory,
  partialCategory,
  syntheticFight,
} from "../support/synthetic-fight.js";

const ACTOR = 7;
const OTHER = 8;
const BOLT = 100; // a cast-time ability
const BLAST = 101; // another cast-time ability
const STRIKE = 200; // an instant
const MISSILES = 300; // a channel
const UNREVIEWED = 400;

type Step = readonly [time: number, phase: "BEGIN" | "COMPLETE", ability: number, source?: number];

function eventsOf(steps: readonly Step[]): CombatEvent[] {
  return steps.map(([reportTimeMs, castPhase, abilityGameId, source], ordinal) =>
    castEvent({ ordinal, reportTimeMs, castPhase, abilityGameId, sourceActorId: source ?? ACTOR }),
  );
}

function stateOf(
  steps: readonly Step[],
  casts: "COMPLETE" | "PARTIAL" | "UNVERIFIED" = "COMPLETE",
): CombatState {
  const whole = inclusiveRange(FIGHT_START_MS, FIGHT_END_MS);
  return createCombatState(
    syntheticFight({
      events: eventsOf(steps),
      categories:
        casts === "COMPLETE"
          ? { CASTS: observableCategory(whole, [ACTOR]) }
          : casts === "PARTIAL"
            ? // A missing page between 2000 and 3000.
              {
                CASTS: partialCategory(
                  [inclusiveRange(FIGHT_START_MS, 1_999), inclusiveRange(3_001, FIGHT_END_MS)],
                  [ACTOR],
                ),
              }
            : {},
    }),
  );
}

const EXECUTIONS: Readonly<Record<number, CastExecution>> = {
  [BOLT]: "CAST_TIME",
  [BLAST]: "CAST_TIME",
  [STRIKE]: "INSTANT",
  [MISSILES]: "CHANNEL",
};

function profileOf(
  castTime: CastDurationFact | ((reportTimeMs: number) => CastDurationFact) = {
    kind: "POSITIVE",
    exactMs: null,
  },
  channel: ChannelDurationFact = { kind: "UNKNOWN", reason: "TEST" },
): CastAnchorProfile {
  return {
    executionOf: (abilityGameId) => EXECUTIONS[abilityGameId] ?? null,
    castTimeAt: (completion) =>
      typeof castTime === "function" ? castTime(completion.reportTimeMs) : castTime,
    channelDurationAt: () => channel,
  };
}

function timelineOf(
  steps: readonly Step[],
  profile: CastAnchorProfile = profileOf(),
  casts: "COMPLETE" | "PARTIAL" | "UNVERIFIED" = "COMPLETE",
): CastTimeline {
  return buildCastTimeline({ state: stateOf(steps, casts), actorId: ACTOR, profile });
}

/** Each completion's anchor as `source@time` or `UNKNOWN:reason`, in canonical order. */
function anchorsOf(timeline: CastTimeline): string[] {
  return timeline.anchors.map(({ anchor }) =>
    anchor.state === "ESTABLISHED" ? `${anchor.source}@${anchor.reportTimeMs}` : `UNKNOWN:${anchor.reason}`,
  );
}

describe("hasted cast time (shared arithmetic)", () => {
  it("a zero base is INSTANT and a positive base is POSITIVE whatever the haste", () => {
    expect(hastedCastTime(0, { state: "UNKNOWN" })).toEqual({ kind: "INSTANT" });
    expect(hastedCastTime(2_000, { state: "UNKNOWN" })).toEqual({ kind: "POSITIVE", exactMs: null });
    expect(hastedCastTime(2_000, { state: "KNOWN", multiplier: 0.8 })).toEqual({
      kind: "POSITIVE",
      exactMs: 1_600,
    });
  });

  it("an invalid base or multiplier is UNKNOWN, never clamped", () => {
    for (const [base, multiplier] of [
      [-1, 1],
      [Number.NaN, 1],
      [2_000, 0],
      [2_000, -0.5],
      [2_000, Number.POSITIVE_INFINITY],
    ] as const) {
      expect(hastedCastTime(base, { state: "KNOWN", multiplier }).kind).toBe("UNKNOWN");
    }
  });
});

describe("instant actions", () => {
  it("are decided when they land and occupy no cast span", () => {
    const timeline = timelineOf([
      [1_500, "COMPLETE", STRIKE],
      [2_500, "COMPLETE", STRIKE],
    ]);
    expect(anchorsOf(timeline)).toEqual(["INSTANT_COMPLETION@1500", "INSTANT_COMPLETION@2500"]);
    expect(timeline.spans).toEqual([]);
    expect(timeline.occupancyAt(2_000)).toEqual({ state: "NOT_CASTING" });
  });

  it("a missing page is never idle time: NOT_CASTING needs complete coverage up to the instant", () => {
    const timeline = timelineOf([[1_500, "COMPLETE", STRIKE]], profileOf(), "PARTIAL");
    expect(timeline.occupancyAt(1_800)).toEqual({ state: "NOT_CASTING" });
    expect(timeline.occupancyAt(2_500)).toMatchObject({
      state: "UNKNOWN",
      evidenceReason: "INSUFFICIENT_COVERAGE",
    });
    // Past the gap, too: a cast begun in the missing page could still be running.
    expect(timeline.occupancyAt(3_500)).toMatchObject({
      state: "UNKNOWN",
      evidenceReason: "INSUFFICIENT_COVERAGE",
    });
    expect(
      timelineOf([[1_500, "COMPLETE", STRIKE]], profileOf(), "UNVERIFIED").occupancyAt(1_800),
    ).toMatchObject({
      state: "UNKNOWN",
      evidenceReason: "CAPABILITY_UNVERIFIED",
    });
  });

  it("melee swings, id-less casts and other actors' casts are not this actor's decisions", () => {
    const events = eventsOf([
      [1_200, "COMPLETE", STRIKE],
      [1_300, "BEGIN", BOLT, OTHER],
      [1_900, "COMPLETE", BOLT, OTHER],
    ]);
    const melee = {
      ...castEvent({
        ordinal: 3,
        reportTimeMs: 2_000,
        castPhase: "COMPLETE",
        abilityGameId: 1,
        sourceActorId: ACTOR,
      }),
      isMelee: true,
    };
    const idless = castEvent({
      ordinal: 4,
      reportTimeMs: 2_100,
      castPhase: "COMPLETE",
      abilityGameId: null,
      sourceActorId: ACTOR,
    });
    const state = createCombatState(
      syntheticFight({
        events: [...events, melee, idless],
        categories: { CASTS: observableCategory(inclusiveRange(FIGHT_START_MS, FIGHT_END_MS), [ACTOR]) },
      }),
    );
    const timeline = buildCastTimeline({ state, actorId: ACTOR, profile: profileOf() });
    expect(anchorsOf(timeline)).toEqual(["INSTANT_COMPLETION@1200"]);
    expect(timeline.unpairedBegins).toEqual([]);
    expect(timeline.occupancyAt(2_200)).toEqual({ state: "NOT_CASTING" });
  });
});

describe("hard casts", () => {
  it("are anchored at the observed begin, and the cast is in progress until it completes", () => {
    const timeline = timelineOf([
      [1_000, "BEGIN", BOLT],
      [2_000, "COMPLETE", BOLT],
    ]);
    expect(anchorsOf(timeline)).toEqual(["OBSERVED_BEGINCAST@1000"]);
    const [anchor] = timeline.anchors;
    expect(anchor?.anchor).toMatchObject({ beginPosition: 0, beginLocator: { rawType: "begincast" } });
    expect(timeline.anchorAt(1)).toBe(anchor);
    expect(timeline.anchorAt(0)).toBeNull();
    // No fake idle during the cast.
    expect(timeline.occupancyAt(1_000)).toMatchObject({ state: "CASTING", span: { completionPosition: 1 } });
    expect(timeline.occupancyAt(1_999).state).toBe("CASTING");
    expect(timeline.occupancyAt(2_000)).toEqual({ state: "NOT_CASTING" });
  });

  it("an interrupted begin is superseded by the re-begin and reported, and its own end is UNKNOWN", () => {
    const timeline = timelineOf([
      [1_100, "BEGIN", BOLT],
      [1_600, "BEGIN", BOLT],
      [2_600, "COMPLETE", BOLT],
    ]);
    expect(anchorsOf(timeline)).toEqual(["OBSERVED_BEGINCAST@1600"]);
    expect(timeline.unpairedBegins).toEqual([
      expect.objectContaining({ position: 0, reportTimeMs: 1_100, outcome: { state: "INTERRUPTED" } }),
    ]);
    expect(timeline.occupancyAt(1_300)).toMatchObject({
      state: "UNKNOWN",
      reason: "UNPAIRED_BEGIN_END_UNKNOWN",
    });
    expect(timeline.occupancyAt(2_000).state).toBe("CASTING");
  });

  it("an interrupted begin with nothing after it stays UNKNOWN to the end of the fight", () => {
    const timeline = timelineOf([[1_500, "BEGIN", BLAST]]);
    expect(timeline.anchors).toEqual([]);
    expect(timeline.unpairedBegins).toEqual([expect.objectContaining({ outcome: { state: "INTERRUPTED" } })]);
    expect(timeline.occupancyAt(4_900)).toMatchObject({
      state: "UNKNOWN",
      reason: "UNPAIRED_BEGIN_END_UNKNOWN",
    });
  });

  it("an unpaired begin whose follow-up may sit in a missing page is not called interrupted", () => {
    const timeline = timelineOf([[1_900, "BEGIN", BLAST]], profileOf(), "PARTIAL");
    expect(timeline.unpairedBegins).toEqual([
      expect.objectContaining({ outcome: { state: "UNKNOWN", reason: "INSUFFICIENT_COVERAGE" } }),
    ]);
  });

  it("another cast starting between a begin and the completion contradicts the pairing", () => {
    const timeline = timelineOf([
      [1_100, "BEGIN", BOLT],
      [1_400, "BEGIN", BLAST],
      [2_100, "COMPLETE", BOLT],
    ]);
    expect(anchorsOf(timeline)).toEqual(["UNKNOWN:CAST_EVIDENCE_CONFLICT"]);
    expect(timeline.occupancyAt(1_800).state).toBe("UNKNOWN");
  });

  it("two hard casts begun in one millisecond cannot both have run, in either order", () => {
    const steps: Step[] = [
      [1_000, "BEGIN", BOLT],
      [1_000, "BEGIN", BLAST],
      [2_000, "COMPLETE", BOLT],
      [3_000, "COMPLETE", BLAST],
    ];
    for (const ordered of [steps, [steps[1]!, steps[0]!, steps[2]!, steps[3]!]]) {
      const timeline = timelineOf(ordered);
      expect(anchorsOf(timeline)).toEqual([
        "UNKNOWN:CAST_EVIDENCE_CONFLICT",
        "UNKNOWN:CAST_EVIDENCE_CONFLICT",
      ]);
      expect(timeline.spans.filter((span) => span.kind === "CASTING")).toEqual([]);
      for (const t of [1_500, 2_500, 3_500]) expect(timeline.occupancyAt(t).state).toBe("UNKNOWN");
    }
  });

  it("two observed hard casts that would overlap are both conflicts, and their begins may still be running", () => {
    // Blast [1500, 2500) overlaps Bolt [1000, 2000): Blast's begin interleaves
    // Bolt, and Bolt's span overlaps Blast's.
    const timeline = timelineOf([
      [1_000, "BEGIN", BOLT],
      [1_500, "BEGIN", BLAST],
      [2_000, "COMPLETE", BOLT],
      [2_500, "COMPLETE", BLAST],
    ]);
    expect(anchorsOf(timeline)).toEqual(["UNKNOWN:CAST_EVIDENCE_CONFLICT", "UNKNOWN:CAST_EVIDENCE_CONFLICT"]);
    expect(timeline.spans.filter((span) => span.kind === "CASTING")).toEqual([]);
    expect(timeline.occupancyAt(1_200).state).toBe("UNKNOWN");
    expect(timeline.occupancyAt(4_000).state).toBe("UNKNOWN");
  });

  it("an off-GCD instant while casting does not break the pairing", () => {
    const timeline = timelineOf([
      [1_100, "BEGIN", BOLT],
      [1_400, "COMPLETE", STRIKE],
      [2_100, "COMPLETE", BOLT],
    ]);
    expect(anchorsOf(timeline)).toEqual(["INSTANT_COMPLETION@1400", "OBSERVED_BEGINCAST@1100"]);
  });
});

describe("a missing begincast", () => {
  it("under complete coverage is UNKNOWN, never inferred instant", () => {
    const timeline = timelineOf([
      [1_100, "COMPLETE", STRIKE],
      [1_500, "BEGIN", BOLT],
      [2_500, "COMPLETE", BOLT],
      [3_600, "COMPLETE", BOLT],
    ]);
    expect(anchorsOf(timeline)).toEqual([
      "INSTANT_COMPLETION@1100",
      "OBSERVED_BEGINCAST@1500",
      "UNKNOWN:BEGINCAST_NOT_OBSERVED",
    ]);
    // Its start is unknown, so the time before it is not idle either.
    expect(timeline.occupancyAt(3_000)).toMatchObject({ state: "UNKNOWN", reason: "CAST_START_UNKNOWN" });
  });

  it("is derived from the completion only with an exact reviewed cast time, when coverage cannot exclude a begin", () => {
    const steps: Step[] = [
      [1_200, "BEGIN", BOLT],
      [1_700, "COMPLETE", BOLT],
      [2_800, "COMPLETE", BOLT], // its begin would sit in the missing page
    ];
    const exact = timelineOf(steps, profileOf({ kind: "POSITIVE", exactMs: 1_000 }), "PARTIAL");
    expect(anchorsOf(exact)).toEqual(["OBSERVED_BEGINCAST@1200", "DERIVED_FROM_COMPLETION@1800"]);
    expect(exact.occupancyAt(2_000)).toMatchObject({
      state: "CASTING",
      span: { basis: "DERIVED_FROM_COMPLETION", fromReportTimeMs: 1_800, toReportTimeMs: 2_800 },
    });
    expect(exact.occupancyAt(1_750)).toEqual({ state: "NOT_CASTING" });

    // Haste unknown: the cast time is positive but not exact, so no anchor.
    const hasteUnknown = timelineOf(steps, profileOf(hastedCastTime(1_500, { state: "UNKNOWN" })), "PARTIAL");
    expect(hasteUnknown.anchors[1]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "CAST_TIME_UNKNOWN",
      evidenceReason: "INSUFFICIENT_COVERAGE",
    });

    // A cast time that may have been made instant is not derived from either.
    const mayBeInstant = timelineOf(steps, profileOf({ kind: "UNKNOWN", reason: "PROC" }), "PARTIAL");
    expect(mayBeInstant.anchors[1]?.anchor).toMatchObject({ state: "UNKNOWN", reason: "CAST_TIME_UNKNOWN" });
  });

  it("a derived start that contradicts observed evidence is a conflict, never an anchor", () => {
    // It would start before the previous Bolt completed (1550 < 1700).
    const overlapsPrevious = timelineOf(
      [
        [1_200, "BEGIN", BOLT],
        [1_700, "COMPLETE", BOLT],
        [2_800, "COMPLETE", BOLT],
      ],
      profileOf({ kind: "POSITIVE", exactMs: 1_250 }),
      "PARTIAL",
    );
    expect(anchorsOf(overlapsPrevious)).toEqual([
      "OBSERVED_BEGINCAST@1200",
      "UNKNOWN:CAST_EVIDENCE_CONFLICT",
    ]);
    expect(overlapsPrevious.spans.filter((span) => span.kind === "CASTING")).toHaveLength(1);
    expect(overlapsPrevious.occupancyAt(2_000).state).toBe("UNKNOWN");

    // Another cast starts inside it (Blast begins at 3100, inside [2800, 3800)).
    const otherStart = timelineOf(
      [
        [1_200, "BEGIN", BOLT],
        [1_700, "COMPLETE", BOLT],
        [3_100, "BEGIN", BLAST],
        [3_800, "COMPLETE", BOLT],
      ],
      profileOf({ kind: "POSITIVE", exactMs: 1_000 }),
      "PARTIAL",
    );
    expect(otherStart.anchors[1]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "CAST_EVIDENCE_CONFLICT",
    });

    // Two derived hard casts that would overlap: both completions in one
    // millisecond inside the missing page, so neither is inside the other.
    const overlapsDerived = timelineOf(
      [
        [2_800, "COMPLETE", BOLT],
        [2_800, "COMPLETE", BLAST],
      ],
      profileOf({ kind: "POSITIVE", exactMs: 500 }),
      "PARTIAL",
    );
    expect(anchorsOf(overlapsDerived)).toEqual([
      "UNKNOWN:CAST_EVIDENCE_CONFLICT",
      "UNKNOWN:CAST_EVIDENCE_CONFLICT",
    ]);
    expect(overlapsDerived.spans.every((span) => span.kind === "POSSIBLE")).toBe(true);
  });

  it("a start in the derived start's own millisecond is a conflict, as for an observed begin", () => {
    // Unverified CASTS: no absence is ever proven, so a derivation would be allowed.
    const exact = profileOf({ kind: "POSITIVE", exactMs: 2_000 });
    for (const start of [
      [1_000, "COMPLETE", MISSILES],
      [1_000, "BEGIN", BLAST],
    ] as const satisfies readonly Step[]) {
      const timeline = timelineOf([start, [3_000, "COMPLETE", BOLT]], exact, "UNVERIFIED");
      expect(timeline.anchorAt(1)?.anchor).toMatchObject({
        state: "UNKNOWN",
        reason: "CAST_EVIDENCE_CONFLICT",
      });
      expect(timeline.spans.filter((span) => span.kind === "CASTING")).toEqual([]);
      expect(timeline.occupancyAt(1_500).state).toBe("UNKNOWN");
    }
    // One millisecond later it is strictly inside the derived cast: a conflict too.
    const inside = timelineOf(
      [
        [1_001, "BEGIN", BLAST],
        [3_000, "COMPLETE", BOLT],
      ],
      exact,
      "UNVERIFIED",
    );
    expect(inside.anchorAt(1)?.anchor).toMatchObject({ reason: "CAST_EVIDENCE_CONFLICT" });
    // One millisecond earlier it is outside, and the derivation stands.
    const outside = timelineOf(
      [
        [999, "COMPLETE", STRIKE],
        [3_000, "COMPLETE", BOLT],
      ],
      exact,
      "UNVERIFIED",
    );
    expect(outside.anchorAt(1)?.anchor).toMatchObject({
      source: "DERIVED_FROM_COMPLETION",
      reportTimeMs: 1_000,
    });
  });

  it("a derived cast that was itself fully covered is a missing begin, not a derivation", () => {
    // The previous Bolt's window holds the missing page, but [3300, 3800] is covered.
    const timeline = timelineOf(
      [
        [1_200, "BEGIN", BOLT],
        [1_700, "COMPLETE", BOLT],
        [3_800, "COMPLETE", BOLT],
      ],
      profileOf({ kind: "POSITIVE", exactMs: 500 }),
      "PARTIAL",
    );
    expect(anchorsOf(timeline)).toEqual(["OBSERVED_BEGINCAST@1200", "UNKNOWN:BEGINCAST_NOT_OBSERVED"]);
  });

  it("an observed begin whose window touches a missing page is not trusted as the latest begin", () => {
    const timeline = timelineOf(
      [
        [1_800, "BEGIN", BOLT],
        [3_200, "COMPLETE", BOLT],
      ],
      profileOf({ kind: "POSITIVE", exactMs: 1_000 }),
      "PARTIAL",
    );
    expect(timeline.anchors[0]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "CAST_TIME_UNKNOWN",
      evidenceReason: "INSUFFICIENT_COVERAGE",
    });
  });

  it("the first completion with no begin is never proven begin-less: its window opens before the pull", () => {
    const timeline = timelineOf([[1_400, "COMPLETE", BOLT]]);
    expect(timeline.anchors[0]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "CAST_TIME_UNKNOWN",
      evidenceReason: "INSUFFICIENT_COVERAGE",
    });
  });
});

describe("same-millisecond pairing is order-invariant", () => {
  // Back-to-back casting: the next begin shares the completion's millisecond.
  const chain: Step[] = [
    [1_000, "BEGIN", BOLT],
    [2_000, "COMPLETE", BOLT],
    [2_000, "BEGIN", BOLT],
    [3_000, "COMPLETE", BOLT],
  ];
  const swapped: Step[] = [chain[0]!, chain[2]!, chain[1]!, chain[3]!];

  it("with positive cast times the only consistent placement pairs each completion with its own begin", () => {
    for (const steps of [chain, swapped]) {
      const timeline = timelineOf(steps);
      expect(anchorsOf(timeline)).toEqual(["OBSERVED_BEGINCAST@1000", "OBSERVED_BEGINCAST@2000"]);
      // Every placement pairs both begins, so nothing may still be running.
      expect(timeline.unpairedBegins).toEqual([]);
      expect(timeline.occupancyAt(2_000).state).toBe("CASTING");
      expect(timeline.occupancyAt(3_500)).toEqual({ state: "NOT_CASTING" });
    }
  });

  it("when either cast may have been instant, the placements disagree and the anchor is UNKNOWN", () => {
    for (const steps of [chain, swapped]) {
      const timeline = timelineOf(steps, profileOf({ kind: "UNKNOWN", reason: "PROC" }));
      expect(timeline.anchors.map((entry) => entry.anchor)).toEqual([
        expect.objectContaining({
          reason: "BEGINCAST_PAIRING_AMBIGUOUS",
          candidateReportTimesMs: [1_000, 2_000],
        }),
        // The second cast may have been instant whichever way the bits fall, so its own completion is a candidate too.
        expect.objectContaining({
          reason: "BEGINCAST_PAIRING_AMBIGUOUS",
          candidateReportTimesMs: [2_000, 3_000],
        }),
      ]);
      // An ambiguous cast is never read as idle.
      expect(timeline.occupancyAt(1_500).state).toBe("UNKNOWN");
      expect(timeline.occupancyAt(2_500).state).toBe("UNKNOWN");
    }
  });

  it("a cast that may have been instant is never anchored at an earlier begin (ONB-D2)", () => {
    const timeline = timelineOf(
      [
        [1_000, "BEGIN", BOLT],
        [2_000, "COMPLETE", BOLT],
      ],
      profileOf({ kind: "UNKNOWN", reason: "PROC" }),
    );
    expect(timeline.anchors[0]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "BEGINCAST_PAIRING_AMBIGUOUS",
      candidateReportTimesMs: [1_000, 2_000],
    });
    // Neither a proven cast nor proven idle: the begin may have been abandoned, and may still have been running after.
    expect(timeline.occupancyAt(1_500).state).toBe("UNKNOWN");
    expect(timeline.occupancyAt(2_500)).toMatchObject({
      state: "UNKNOWN",
      reason: "UNPAIRED_BEGIN_END_UNKNOWN",
    });
    expect(timeline.spans.some((span) => span.kind === "CASTING")).toBe(false);
    expect(timeline.unpairedBegins).toEqual([
      expect.objectContaining({
        reportTimeMs: 1_000,
        outcome: { state: "UNKNOWN", reason: "PAIRING_NOT_PROVEN" },
      }),
    ]);
  });

  it("back to back, no begin is consumed by a cast that may have been instant, in both orders (ONB-D2)", () => {
    for (const steps of [chain, swapped]) {
      const timeline = timelineOf(steps, profileOf({ kind: "UNKNOWN", reason: "PROC" }));
      expect(timeline.unpairedBegins.map((begin) => [begin.reportTimeMs, begin.outcome])).toEqual([
        [1_000, { state: "UNKNOWN", reason: "PAIRING_NOT_PROVEN" }],
        [2_000, { state: "UNKNOWN", reason: "PAIRING_NOT_PROVEN" }],
      ]);
      // The last begin may still be running after the last completion: never idle, to the next start.
      expect(timeline.occupancyAt(3_500)).toMatchObject({
        state: "UNKNOWN",
        reason: "UNPAIRED_BEGIN_END_UNKNOWN",
      });
    }
  });

  it("the same shape with a proven cast time stays a cast, so only the unknown fact is refused (ONB-D2)", () => {
    const timeline = timelineOf([
      [1_000, "BEGIN", BOLT],
      [2_000, "COMPLETE", BOLT],
    ]);
    expect(anchorsOf(timeline)).toEqual(["OBSERVED_BEGINCAST@1000"]);
    expect(timeline.occupancyAt(1_500).state).toBe("CASTING");
    expect(timeline.unpairedBegins).toEqual([]);
  });

  it("a proven instant is decided at completion, but a begin in its millisecond may be a new attempt", () => {
    const instantAt = (time: number): CastDurationFact =>
      time === 2_000 ? { kind: "INSTANT" } : { kind: "POSITIVE", exactMs: null };
    const steps: Step[] = [
      [1_100, "COMPLETE", STRIKE],
      [2_000, "BEGIN", BOLT],
      [2_000, "COMPLETE", BOLT],
    ];
    for (const ordered of [steps, [steps[0]!, steps[2]!, steps[1]!]]) {
      const timeline = timelineOf(ordered, profileOf(instantAt));
      expect(anchorsOf(timeline)).toEqual(["INSTANT_COMPLETION@1100", "INSTANT_COMPLETION@2000"]);
      // Not every placement consumes the begin, so it is never named as the pair...
      expect(timeline.anchors[1]?.anchor).toMatchObject({ beginPosition: null });
      // ...and it may have started a cast that is still running.
      expect(timeline.unpairedBegins).toEqual([
        expect.objectContaining({
          reportTimeMs: 2_000,
          outcome: { state: "UNKNOWN", reason: "PAIRING_NOT_PROVEN" },
        }),
      ]);
      expect(timeline.occupancyAt(2_500)).toMatchObject({
        state: "UNKNOWN",
        reason: "UNPAIRED_BEGIN_END_UNKNOWN",
      });
    }
  });

  it("a placement with no paired begin keeps the start unknown back to the previous completion, in both orders", () => {
    // A begin and its completion in one millisecond, cast time unknown: either
    // a zero-length cast, or a completion whose begin was not observed.
    const steps: Step[] = [
      [1_000, "BEGIN", BOLT],
      [1_200, "COMPLETE", BOLT],
      [2_000, "BEGIN", BOLT],
      [2_000, "COMPLETE", BOLT],
    ];
    const swappedPair: Step[] = [steps[0]!, steps[1]!, steps[3]!, steps[2]!];
    for (const ordered of [steps, swappedPair]) {
      const timeline = timelineOf(ordered, profileOf({ kind: "UNKNOWN", reason: "PROC" }));
      expect(timeline.anchors[1]?.anchor).toMatchObject({
        reason: "BEGINCAST_PAIRING_AMBIGUOUS",
        candidateReportTimesMs: [2_000],
      });
      // The first begin is not consumed either, so the time after the first completion is its possible span.
      expect(timeline.occupancyAt(1_500)).toMatchObject({
        state: "UNKNOWN",
        reason: "UNPAIRED_BEGIN_END_UNKNOWN",
      });
      expect(timeline.occupancyAt(1_999).state).toBe("UNKNOWN");
    }
    // With no earlier completion the window is unbounded below.
    const first = timelineOf(
      [
        [2_000, "BEGIN", BOLT],
        [2_000, "COMPLETE", BOLT],
      ],
      profileOf({ kind: "UNKNOWN", reason: "PROC" }),
    );
    expect(first.occupancyAt(1_100)).toMatchObject({ state: "UNKNOWN", reason: "CAST_START_UNKNOWN" });
  });

  it("a begin only some placements pair keeps the actor possibly casting after the completion, in both orders", () => {
    // The reviewer's case: begins at 1000 and 2000, a completion at 2000, cast time unknown.
    const steps: Step[] = [
      [1_000, "BEGIN", BOLT],
      [2_000, "BEGIN", BOLT],
      [2_000, "COMPLETE", BOLT],
    ];
    for (const ordered of [steps, [steps[0]!, steps[2]!, steps[1]!]]) {
      const timeline = timelineOf(ordered, profileOf({ kind: "UNKNOWN", reason: "PROC" }));
      expect(anchorsOf(timeline)).toEqual(["UNKNOWN:BEGINCAST_PAIRING_AMBIGUOUS"]);
      expect(timeline.occupancyAt(2_500)).toMatchObject({
        state: "UNKNOWN",
        reason: "UNPAIRED_BEGIN_END_UNKNOWN",
      });
      expect(timeline.occupancyAt(4_900).state).toBe("UNKNOWN");
      expect(timeline.unpairedBegins.map((begin) => [begin.reportTimeMs, begin.outcome])).toEqual([
        [1_000, { state: "UNKNOWN", reason: "PAIRING_NOT_PROVEN" }],
        [2_000, { state: "UNKNOWN", reason: "PAIRING_NOT_PROVEN" }],
      ]);
    }
    // A next begin bounds the possible attempt.
    const bounded = timelineOf(
      [...steps, [3_000, "BEGIN", BLAST], [4_000, "COMPLETE", BLAST]],
      profileOf((time) =>
        time === 2_000 ? { kind: "UNKNOWN", reason: "PROC" } : { kind: "POSITIVE", exactMs: null },
      ),
    );
    expect(bounded.occupancyAt(2_500).state).toBe("UNKNOWN");
    expect(bounded.occupancyAt(3_500).state).toBe("CASTING");
    expect(bounded.occupancyAt(4_500)).toEqual({ state: "NOT_CASTING" });
  });

  it("a proven instant does not consume a begin from before its millisecond: that attempt was abandoned", () => {
    const timeline = timelineOf(
      [
        [1_200, "BEGIN", BOLT],
        [2_000, "COMPLETE", BOLT],
      ],
      profileOf({ kind: "INSTANT" }),
    );
    expect(anchorsOf(timeline)).toEqual(["INSTANT_COMPLETION@2000"]);
    expect(timeline.unpairedBegins).toEqual([expect.objectContaining({ reportTimeMs: 1_200 })]);
  });

  it("two begins, or two completions, of one ability in one millisecond are ambiguous outright", () => {
    expect(
      anchorsOf(
        timelineOf([
          [1_000, "BEGIN", BOLT],
          [1_000, "BEGIN", BOLT],
          [1_000, "COMPLETE", BOLT],
          [2_000, "COMPLETE", BOLT],
        ]),
      ),
    ).toEqual(["UNKNOWN:BEGINCAST_PAIRING_AMBIGUOUS", "UNKNOWN:BEGINCAST_PAIRING_AMBIGUOUS"]);
    expect(
      anchorsOf(
        timelineOf([
          [1_000, "BEGIN", BOLT],
          [2_000, "COMPLETE", BOLT],
          [2_000, "COMPLETE", BOLT],
        ]),
      ),
    ).toEqual(["UNKNOWN:BEGINCAST_PAIRING_AMBIGUOUS", "UNKNOWN:BEGINCAST_PAIRING_AMBIGUOUS"]);
  });

  it("two begins in one millisecond strictly inside a window are ambiguous too, in either retrieval order", () => {
    const steps: Step[] = [
      [1_000, "BEGIN", BOLT],
      [1_000, "BEGIN", BOLT],
      [2_000, "COMPLETE", BOLT],
    ];
    // Distinct locators, so a reversed retrieval order really reverses them.
    for (const ordered of [steps, [steps[1]!, steps[0]!, steps[2]!]]) {
      const timeline = timelineOf(ordered);
      expect(anchorsOf(timeline)).toEqual(["UNKNOWN:BEGINCAST_PAIRING_AMBIGUOUS"]);
      expect(timeline.spans.filter((span) => span.kind === "CASTING")).toEqual([]);
      // Neither begin is named the pair, and each may still be running.
      expect(timeline.unpairedBegins.map((begin) => begin.outcome)).toEqual([
        { state: "UNKNOWN", reason: "PAIRING_NOT_PROVEN" },
        { state: "UNKNOWN", reason: "PAIRING_NOT_PROVEN" },
      ]);
      expect(timeline.occupancyAt(1_500).state).toBe("UNKNOWN");
      expect(timeline.occupancyAt(2_500).state).toBe("UNKNOWN");
    }
    // An earlier duplicate is superseded by a later single begin and decides nothing.
    const superseded = timelineOf([...steps.slice(0, 2), [1_500, "BEGIN", BOLT], steps[2]!]);
    expect(anchorsOf(superseded)).toEqual(["OBSERVED_BEGINCAST@1500"]);
  });
});

describe("channels", () => {
  it("are anchored at their cast, and no instant inside one is CASTING or NOT_CASTING", () => {
    const timeline = timelineOf([
      [1_000, "COMPLETE", MISSILES],
      [3_500, "COMPLETE", STRIKE],
    ]);
    expect(anchorsOf(timeline)).toEqual(["CHANNEL_START@1000", "INSTANT_COMPLETION@3500"]);
    // A channel can be cancelled, and nothing bounds this one.
    for (const t of [1_000, 2_000, 4_000]) {
      expect(timeline.occupancyAt(t)).toMatchObject({ state: "UNKNOWN", reason: "CHANNEL_END_UNKNOWN" });
    }
  });

  it("end by their proven bound, or by the next cast start, whichever is first", () => {
    const bounded = timelineOf(
      [[1_000, "COMPLETE", MISSILES]],
      profileOf(undefined, { kind: "AT_MOST", maxMs: 2_000 }),
    );
    expect(bounded.occupancyAt(2_999).state).toBe("UNKNOWN");
    expect(bounded.occupancyAt(3_000)).toEqual({ state: "NOT_CASTING" });

    const clipped = timelineOf(
      [
        [1_000, "COMPLETE", MISSILES],
        [1_800, "BEGIN", BOLT],
        [2_800, "COMPLETE", BOLT],
      ],
      profileOf(undefined, { kind: "AT_MOST", maxMs: 2_500 }),
    );
    expect(clipped.occupancyAt(1_700).state).toBe("UNKNOWN");
    expect(clipped.occupancyAt(2_000).state).toBe("CASTING");
    expect(clipped.occupancyAt(3_000)).toEqual({ state: "NOT_CASTING" });
  });

  it("a channel whose review a begin contradicts may still be channelling after its cast, in both orders", () => {
    // A begin strictly before the channel's cast.
    const before = timelineOf(
      [
        [1_000, "BEGIN", MISSILES],
        [2_000, "COMPLETE", MISSILES],
      ],
      profileOf(undefined, { kind: "AT_MOST", maxMs: 500 }),
    );
    expect(anchorsOf(before)).toEqual(["UNKNOWN:CAST_EVIDENCE_CONFLICT"]);
    for (const t of [1_500, 2_000, 2_500, 4_900]) {
      // The contradicted review's 500 ms bound is not relied on.
      expect(before.occupancyAt(t).state).toBe("UNKNOWN");
    }
    // A begin in the cast's millisecond, either order.
    const steps: Step[] = [
      [2_000, "BEGIN", MISSILES],
      [2_000, "COMPLETE", MISSILES],
    ];
    for (const ordered of [steps, [steps[1]!, steps[0]!]]) {
      const timeline = timelineOf(ordered);
      expect(anchorsOf(timeline)).toEqual(["UNKNOWN:CAST_EVIDENCE_CONFLICT"]);
      expect(timeline.occupancyAt(1_500).state).toBe("UNKNOWN");
      expect(timeline.occupancyAt(2_500)).toMatchObject({ state: "UNKNOWN" });
    }
    // A later cast start still ends it.
    const ended = timelineOf([
      [1_000, "BEGIN", MISSILES],
      [2_000, "COMPLETE", MISSILES],
      [3_000, "BEGIN", BOLT],
      [4_000, "COMPLETE", BOLT],
    ]);
    expect(ended.occupancyAt(2_500).state).toBe("UNKNOWN");
    expect(ended.occupancyAt(3_500).state).toBe("CASTING");
  });

  it("a channel starting inside a hard cast contradicts that cast's pairing", () => {
    expect(
      anchorsOf(
        timelineOf([
          [1_000, "BEGIN", BOLT],
          [1_500, "COMPLETE", MISSILES],
          [2_000, "COMPLETE", BOLT],
        ]),
      ),
    ).toEqual(["CHANNEL_START@1500", "UNKNOWN:CAST_EVIDENCE_CONFLICT"]);
  });
});

describe("fail-closed execution", () => {
  it("a begin observed for a reviewed instant or channel contradicts the review", () => {
    expect(
      anchorsOf(
        timelineOf([
          [1_000, "BEGIN", STRIKE],
          [1_500, "COMPLETE", STRIKE],
          [2_000, "BEGIN", MISSILES],
          [2_000, "COMPLETE", MISSILES],
        ]),
      ),
    ).toEqual(["UNKNOWN:CAST_EVIDENCE_CONFLICT", "UNKNOWN:CAST_EVIDENCE_CONFLICT"]);
    // A contradicted "instant" may really be a channel: not idle after it until the next start.
    const instant = timelineOf([
      [1_000, "BEGIN", STRIKE],
      [1_500, "COMPLETE", STRIKE],
      [3_000, "BEGIN", BOLT],
      [4_000, "COMPLETE", BOLT],
    ]);
    expect(instant.occupancyAt(1_200).state).toBe("UNKNOWN");
    expect(instant.occupancyAt(2_000).state).toBe("UNKNOWN");
    expect(instant.spans).toContainEqual(
      expect.objectContaining({
        kind: "POSSIBLE",
        fromReportTimeMs: 1_500,
        toReportTimeMs: 3_000,
        reason: "CHANNEL_END_UNKNOWN",
      }),
    );
    expect(instant.occupancyAt(4_500)).toEqual({ state: "NOT_CASTING" });
  });

  it("an unreviewed ability has no anchor, and the time around it is not idle", () => {
    const timeline = timelineOf([
      [1_200, "COMPLETE", STRIKE],
      [2_500, "COMPLETE", UNREVIEWED],
    ]);
    expect(anchorsOf(timeline)).toEqual(["INSTANT_COMPLETION@1200", "UNKNOWN:EXECUTION_NOT_REVIEWED"]);
    expect(timeline.anchors[1]?.execution).toBeNull();
    expect(timeline.occupancyAt(1_500)).toMatchObject({ state: "UNKNOWN", reason: "EXECUTION_NOT_REVIEWED" });
    // It may have been a channel, so after it is not idle either...
    expect(timeline.occupancyAt(2_600)).toMatchObject({ state: "UNKNOWN", reason: "EXECUTION_NOT_REVIEWED" });
    // ...until a later cast start ends it.
    const ended = timelineOf([
      [1_200, "COMPLETE", STRIKE],
      [2_500, "COMPLETE", UNREVIEWED],
      [3_000, "BEGIN", BOLT],
      [4_000, "COMPLETE", BOLT],
    ]);
    expect(ended.occupancyAt(2_600).state).toBe("UNKNOWN");
    expect(ended.occupancyAt(4_500)).toEqual({ state: "NOT_CASTING" });
  });

  it("a non-monotonic canonical order establishes nothing", () => {
    const timeline = timelineOf([
      [2_000, "BEGIN", BOLT],
      [1_500, "COMPLETE", STRIKE],
      [3_000, "COMPLETE", BOLT],
    ]);
    expect(anchorsOf(timeline)).toEqual(["UNKNOWN:NON_MONOTONIC_TIME", "UNKNOWN:NON_MONOTONIC_TIME"]);
    expect(timeline.occupancyAt(2_500)).toMatchObject({
      state: "UNKNOWN",
      evidenceReason: "NON_MONOTONIC_TIME",
    });
  });

  it("is shared engine plumbing: it imports no specialization, SimulationCraft or data module", () => {
    const source = readFileSync("src/engine/game-state/casting/cast-decision-anchor.ts", "utf8");
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
    expect(imports.every((path) => path?.startsWith("../../"))).toBe(true);
    expect(imports.filter((path) => /specs|simc|data|findings|services/.test(path ?? ""))).toEqual([]);
  });
});

describe("retained real evidence (b1PmaKrd6CDfzngc fight 48, no new request)", () => {
  /** Tallies anchors as `ability:source-or-reason`. */
  function tally(timeline: CastTimeline): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const { abilityGameId, anchor } of timeline.anchors) {
      const key = `${abilityGameId}:${anchor.state === "ESTABLISHED" ? anchor.source : anchor.reason}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  describe("the Mage slice (actor 121)", () => {
    // Test profile: the two ids the slice records with begincasts are cast-time,
    // Arcane Missiles (5143) is a channel, everything else is instant.
    const profile = (castTime: CastDurationFact): CastAnchorProfile => ({
      executionOf: (id) =>
        id === 30_451 || id === 1_295_924 ? "CAST_TIME" : id === 5_143 ? "CHANNEL" : "INSTANT",
      castTimeAt: () => castTime,
      channelDurationAt: () => ({ kind: "UNKNOWN", reason: "TEST" }),
    });
    let state: CombatState;
    beforeAll(() => {
      state = corpusState("wcl-b1pm-fight-48-mage-121-prepull-65s");
    });

    it("records Arcane Missiles as a cast with no begincast, so a channel anchors on its cast", () => {
      const missiles = state
        .positionsByAbility(5_143)
        .map((position) => state.eventAt(position))
        .filter((event) => event?.kind === "CAST" && event.source?.actorId === 121);
      expect(missiles.length).toBe(20);
      expect(missiles.every((event) => event?.kind === "CAST" && event.castPhase === "COMPLETE")).toBe(true);
    });

    it("pairs every hard cast with its begin when the cast times are proven positive", () => {
      const timeline = buildCastTimeline({
        state,
        actorId: 121,
        profile: profile({ kind: "POSITIVE", exactMs: null }),
      });
      expect(tally(timeline)).toEqual({
        "5143:CHANNEL_START": 20,
        "44425:INSTANT_COMPLETION": 19,
        "321507:INSTANT_COMPLETION": 2,
        "30451:OBSERVED_BEGINCAST": 6,
        "153626:INSTANT_COMPLETION": 2,
        "1295924:OBSERVED_BEGINCAST": 4,
        "212653:INSTANT_COMPLETION": 1,
        "235450:INSTANT_COMPLETION": 1,
      });
      expect(timeline.unpairedBegins).toEqual([
        expect.objectContaining({
          abilityGameId: 1_295_924,
          reportTimeMs: 7_489_806,
          outcome: { state: "INTERRUPTED" },
        }),
      ]);
    });

    it("leaves every hard cast UNKNOWN when an instant cast cannot be excluded (ONB-D2)", () => {
      const timeline = buildCastTimeline({
        state,
        actorId: 121,
        profile: profile({ kind: "UNKNOWN", reason: "TEST" }),
      });
      expect(tally(timeline)).toMatchObject({
        "30451:BEGINCAST_PAIRING_AMBIGUOUS": 6,
        "1295924:BEGINCAST_PAIRING_AMBIGUOUS": 4,
      });
      expect(Object.keys(tally(timeline)).filter((key) => key.endsWith("OBSERVED_BEGINCAST"))).toEqual([]);
    });
  });

  describe("the Restoration Shaman (actor 122, whole fight, CASTS complete)", () => {
    let state: CombatState;
    beforeAll(async () => {
      const loaded = await loadCommittedEvidenceArchive();
      if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
      const composed = bundleOf(
        loaded.archive,
        [
          "wcl-b1pm-fight-48-restoration-shaman-122-casts.seg-0-180",
          "wcl-b1pm-fight-48-restoration-shaman-122-casts.seg-180-345",
        ],
        [],
        { catalogArtifactId: "wcl-fight-context-b1pm-fight-48" },
      );
      state = createCombatState(composed.fight);
    });
    // Test profile: the two ids with begincasts (Chain Heal 1064, Healing Wave
    // 77472) are cast-time and may have been made instant; the rest instant.
    const profile: CastAnchorProfile = {
      executionOf: (id) => (id === 1_064 || id === 77_472 ? "CAST_TIME" : "INSTANT"),
      castTimeAt: () => ({ kind: "UNKNOWN", reason: "INSTANT_PROC_NOT_EXCLUDED" }),
      channelDurationAt: () => ({ kind: "UNKNOWN", reason: "TEST" }),
    };

    it("records both same-millisecond shapes the pairing must not read order from", () => {
      const casts = state
        .positionsBySourceActor(122)
        .map((position) => state.eventAt(position))
        .flatMap((event) => (event?.kind === "CAST" ? [event] : []));
      const sameMs = (first: "BEGIN" | "COMPLETE") =>
        casts.filter(
          (event, index) =>
            index > 0 &&
            event.abilityGameId === casts[index - 1]?.abilityGameId &&
            event.reportTimeMs === casts[index - 1]?.reportTimeMs &&
            casts[index - 1]?.castPhase === first &&
            event.castPhase !== first,
        ).length;
      expect(sameMs("BEGIN")).toBeGreaterThan(0); // begin + its own completion in one ms
      expect(sameMs("COMPLETE")).toBeGreaterThan(0); // completion + the next begin in one ms
    });

    it("establishes no hard cast that may have been instant, and leaves each one a candidate (ONB-D2)", () => {
      const timeline = buildCastTimeline({ state, actorId: 122, profile });
      const counts = tally(timeline);
      expect([counts["1064:OBSERVED_BEGINCAST"], counts["1064:BEGINCAST_PAIRING_AMBIGUOUS"]]).toEqual([
        undefined,
        85,
      ]);
      expect([counts["77472:OBSERVED_BEGINCAST"], counts["77472:BEGINCAST_PAIRING_AMBIGUOUS"]]).toEqual([
        undefined,
        32,
      ]);
      expect(Object.keys(counts).filter((key) => key.endsWith("CAST_EVIDENCE_CONFLICT"))).toEqual([]);
      expect(
        timeline.unpairedBegins
          .filter((begin) => begin.outcome.state === "INTERRUPTED")
          .map((begin) => [begin.abilityGameId, begin.reportTimeMs]),
      ).toEqual([
        [1_064, 7_529_147],
        [77_472, 7_678_585],
        [77_472, 7_748_802],
      ]);
      // Every other unpaired begin is one some placement pairs: possibly still running, never "interrupted".
      const notProven = timeline.unpairedBegins.filter((begin) => begin.outcome.state === "UNKNOWN");
      expect(
        notProven.every(
          (begin) => begin.outcome.state === "UNKNOWN" && begin.outcome.reason === "PAIRING_NOT_PROVEN",
        ),
      ).toBe(true);
      expect(notProven.length).toBe(117);
      // The first Healing Wave's begin is observed, but under this profile it may have been instant: never a proven cast.
      expect(timeline.occupancyAt(7_445_000).state).toBe("UNKNOWN");
      // With its cast time proven positive, the same instant is a cast in progress.
      const proven = buildCastTimeline({
        state,
        actorId: 122,
        profile: { ...profile, castTimeAt: () => ({ kind: "POSITIVE", exactMs: null }) },
      });
      expect(proven.occupancyAt(7_445_000)).toMatchObject({
        state: "CASTING",
        span: { fromReportTimeMs: 7_444_822, toReportTimeMs: 7_445_429, basis: "OBSERVED_BEGINCAST" },
      });
    });
  });
});
