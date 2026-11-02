import { beforeAll, describe, expect, it } from "vitest";

import type { ComparisonFightInput, PostHocDefinition } from "../../src/comparison-facts/fight-facts.js";
import {
  alignFights,
  landmarkIdOf,
  type LandmarkAnchor,
  type LandmarkKey,
  type TimingAlignment,
} from "../../src/comparison-facts/timing-alignment.js";
import {
  COMPARISON_CONSENSUS_THRESHOLDS_V1,
  consensusOf,
  landmarkConsensus,
  natureOf,
  validateThresholds,
  type AlignmentConsensus,
  type ConsensusThresholds,
  type ConsensusVote,
} from "../../src/comparison-facts/consensus.js";
import { BLOOD_POST_HOC_DEFINITION } from "../../src/specs/deathknight/blood/post-hoc-definition.js";
import { COMPARISONS, comparisonInput, subjectInput } from "../support/m11/g2-four-fights.js";

/**
 * M14-B multi-log consensus over the M14-A alignment of the four committed
 * M11-G2 fights, plus synthetic alignments. No Warcraft Logs request is made.
 */

const BLOOD = BLOOD_POST_HOC_DEFINITION as unknown as PostHocDefinition;
const V1 = COMPARISON_CONSENSUS_THRESHOLDS_V1;
let realAlignment: Extract<TimingAlignment, { kind: "ALIGNED" }>;

beforeAll(async () => {
  const comparisons: ComparisonFightInput[] = [];
  for (const fixture of COMPARISONS) comparisons.push(await comparisonInput(fixture));
  const result = alignFights({ subject: await subjectInput(), comparisons }, BLOOD);
  if (result.kind !== "ALIGNED") throw new Error(`alignment refused: ${result.reason}`);
  realAlignment = result;
}, 120_000);

const evaluated = (result: AlignmentConsensus) => {
  if (result.kind !== "EVALUATED") throw new Error(`consensus refused: ${result.reason}`);
  return result;
};
const outcomeAt = (result: AlignmentConsensus, id: string) => {
  const found = evaluated(result).landmarks.find((entry) => entry.landmarkId === id);
  if (found === undefined) throw new Error(`no landmark ${id}`);
  return found.outcome;
};

describe("the committed fights: consensus is rare, and honest about why", () => {
  it("uses the named CANDIDATE thresholds and declares itself context only", () => {
    const result = evaluated(landmarkConsensus(realAlignment));
    expect(result.thresholds).toEqual({ id: "M14B_COMPARISON_CONSENSUS_V1", status: "CANDIDATE" });
    expect(result.comparisonCoverage).toBe("AT_LEAST_UNCERTIFIED");
    expect(result.use).toBe("CONTEXT_ONLY");
    expect(result.findingEffect).toEqual({ suppression: "NONE", confidence: "NONE" });
  });

  it("the subject never votes: three comparison votes per landmark, and PULL is not a row", () => {
    const result = evaluated(landmarkConsensus(realAlignment));
    expect(result.landmarks.map((entry) => entry.landmarkId)).not.toContain("PULL");
    for (const entry of result.landmarks) {
      expect(entry.votes.map((vote) => vote.fightRef)).toEqual([
        "COHORT246AAAAAAA#33",
        "COHORT116AAAAAAA#64",
        "COHORT261AAAAAAA#31",
      ]);
    }
  });

  it("recorded ends 329.4 / 336.3 / 359.9 s are SPLIT under a 5 s tolerance: no claim", () => {
    expect(outcomeAt(landmarkConsensus(realAlignment), "RECORDED_FIGHT_END")).toEqual({
      kind: "SPLIT",
      sample: { comparisons: 3, decisive: 3, abstaining: 0, largestAgreeingGroup: 1 },
      reason: "DISAGREEMENT_PROVEN",
    });
  });

  it("every uncertified target transition and cooldown window abstains: INSUFFICIENT, never consensus from bounds", () => {
    const result = evaluated(landmarkConsensus(realAlignment));
    const behavior = result.landmarks.filter((entry) => entry.nature === "FOCUS_BEHAVIOR");
    expect(behavior).toHaveLength(3 + 19);
    for (const entry of behavior) {
      expect(entry.outcome).toMatchObject({
        kind: "INSUFFICIENT",
        reason: "BELOW_MINIMUM_SAMPLE",
        sample: { comparisons: 3, decisive: 0 },
      });
      expect(entry.votes.every((vote) => vote.kind === "ABSTAIN")).toBe(true);
    }
    expect(
      evaluated(landmarkConsensus(realAlignment)).landmarks.find(
        (entry) => entry.landmarkId === "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:259181",
      )?.votes,
    ).toEqual([
      { fightRef: "COHORT246AAAAAAA#33", kind: "ABSTAIN", reason: { kind: "ANCHOR_IS_BOUND" } },
      { fightRef: "COHORT116AAAAAAA#64", kind: "ABSTAIN", reason: { kind: "ANCHOR_IS_BOUND" } },
      { fightRef: "COHORT261AAAAAAA#31", kind: "ABSTAIN", reason: { kind: "ANCHOR_IS_BOUND" } },
    ]);
  });

  it("no encounter-state row exists, because no fight holds phase evidence", () => {
    const result = evaluated(landmarkConsensus(realAlignment));
    expect(result.landmarks.filter((entry) => entry.nature === "ENCOUNTER_STATE")).toEqual([]);
  });

  it("thresholds are configurable: a 31 s tolerance turns the recorded ends into CONSENSUS over their own range", () => {
    const wide: ConsensusThresholds = { ...V1, id: "TEST_WIDE", timingToleranceMs: 31_000 };
    expect(outcomeAt(landmarkConsensus(realAlignment, wide), "RECORDED_FIGHT_END")).toEqual({
      kind: "CONSENSUS",
      sample: { comparisons: 3, decisive: 3, abstaining: 0, largestAgreeingGroup: 3 },
      agreeingFightRefs: ["COHORT246AAAAAAA#33", "COHORT116AAAAAAA#64", "COHORT261AAAAAAA#31"],
      range: { minMs: 329_430, maxMs: 359_887 },
    });
    // Two of three agreeing is short of the minimum sample of 3: SPLIT, not consensus.
    const seven: ConsensusThresholds = { ...V1, id: "TEST_SEVEN", timingToleranceMs: 7_000 };
    expect(outcomeAt(landmarkConsensus(realAlignment, seven), "RECORDED_FIGHT_END")).toMatchObject({
      kind: "SPLIT",
      reason: "DISAGREEMENT_PROVEN",
      sample: { largestAgreeingGroup: 2 },
    });
  });

  it("is deterministic over the committed bytes", () => {
    expect(JSON.stringify(landmarkConsensus(realAlignment))).toBe(
      JSON.stringify(landmarkConsensus(realAlignment)),
    );
  });
});

// ---------------------------------------------------------------------------
// Synthetic outcomes
// ---------------------------------------------------------------------------

const value = (fightRef: string, valueMs: number): ConsensusVote => ({
  fightRef,
  kind: "VALUE",
  valueMs,
  evidence: "synthetic",
});
const bound = (fightRef: string): ConsensusVote => ({
  fightRef,
  kind: "ABSTAIN",
  reason: { kind: "ANCHOR_IS_BOUND" },
});
const unknown = (fightRef: string): ConsensusVote => ({
  fightRef,
  kind: "ABSTAIN",
  reason: { kind: "ANCHOR_UNKNOWN", anchor: { kind: "UNKNOWN", reason: "NOT_OBSERVED_IN_FIGHT" } },
});
const MIN2: ConsensusThresholds = { ...V1, id: "TEST_MIN2", minimumSample: 2 };

describe("a single parse is never consensus", () => {
  it("one comparison fight is INSUFFICIENT under the shipped thresholds and under a minimum of 2", () => {
    expect(consensusOf([value("A", 1000)], V1)).toMatchObject({
      kind: "INSUFFICIENT",
      reason: "BELOW_MINIMUM_SAMPLE",
    });
    expect(consensusOf([value("A", 1000)], MIN2)).toMatchObject({
      kind: "INSUFFICIENT",
      reason: "BELOW_MINIMUM_SAMPLE",
    });
  });

  it("a threshold set that would let one parse be consensus is refused before anything is computed", () => {
    expect(validateThresholds({ ...V1, minimumSample: 1 })).toBe("MINIMUM_SAMPLE_BELOW_TWO");
    expect(validateThresholds({ ...V1, minimumSample: 0 })).toBe("MINIMUM_SAMPLE_BELOW_TWO");
    expect(validateThresholds({ ...V1, minimumSample: 2.5 })).toBe("MINIMUM_SAMPLE_BELOW_TWO");
    expect(landmarkConsensus(syntheticAlignment([]), { ...V1, minimumSample: 1 })).toEqual({
      kind: "REFUSED",
      reason: "MINIMUM_SAMPLE_BELOW_TWO",
    });
  });

  it("refuses an agreement share that is not a strict majority, and other malformed thresholds", () => {
    expect(validateThresholds(V1)).toBeNull();
    expect(validateThresholds({ ...V1, agreement: { numerator: 1, denominator: 2 } })).toBe(
      "AGREEMENT_NOT_A_STRICT_MAJORITY",
    );
    expect(validateThresholds({ ...V1, agreement: { numerator: 4, denominator: 3 } })).toBe(
      "AGREEMENT_NOT_A_FRACTION",
    );
    expect(validateThresholds({ ...V1, agreement: { numerator: 0, denominator: 3 } })).toBe(
      "AGREEMENT_NOT_A_FRACTION",
    );
    expect(validateThresholds({ ...V1, timingToleranceMs: -1 })).toBe("TOLERANCE_INVALID");
    expect(validateThresholds({ ...V1, timingToleranceMs: 0.5 })).toBe("TOLERANCE_INVALID");
    expect(validateThresholds({ ...V1, id: " " })).toBe("EMPTY_ID");
  });
});

describe("CONSENSUS, SPLIT and INSUFFICIENT", () => {
  it("three EXACT anchors within the tolerance (inclusive) are CONSENSUS over their own values", () => {
    expect(consensusOf([value("A", 10_000), value("B", 15_000), value("C", 12_000)], V1)).toEqual({
      kind: "CONSENSUS",
      sample: { comparisons: 3, decisive: 3, abstaining: 0, largestAgreeingGroup: 3 },
      agreeingFightRefs: ["A", "C", "B"],
      range: { minMs: 10_000, maxMs: 15_000 },
    });
  });

  it("abstentions count against the share and never as agreeing: 3 agree + 2 bounds is INSUFFICIENT", () => {
    expect(
      consensusOf([value("A", 1000), value("B", 1000), value("C", 1000), bound("D"), unknown("E")], V1),
    ).toEqual({
      kind: "INSUFFICIENT",
      sample: { comparisons: 5, decisive: 3, abstaining: 2, largestAgreeingGroup: 3 },
      reason: "ABSTENTIONS_COULD_DECIDE",
    });
  });

  it("an outlier among enough agreeing fights does not prevent CONSENSUS (3 of 4 >= 2/3)", () => {
    expect(
      consensusOf([value("A", 1000), value("B", 2000), value("C", 3000), value("D", 90_000)], V1),
    ).toMatchObject({ kind: "CONSENSUS", agreeingFightRefs: ["A", "B", "C"] });
  });

  it("decisive anchors that already rule out any group are SPLIT, whatever the abstentions show", () => {
    expect(
      consensusOf(
        [value("A", 0), value("B", 10_000), value("C", 20_000), value("D", 30_000), bound("E")],
        V1,
      ),
    ).toEqual({
      kind: "SPLIT",
      sample: { comparisons: 5, decisive: 4, abstaining: 1, largestAgreeingGroup: 1 },
      reason: "DISAGREEMENT_PROVEN",
    });
  });

  it("two overlapping groups of the same size are SPLIT, never a picked winner", () => {
    expect(consensusOf([value("A", 0), value("B", 5000), value("C", 10_000)], MIN2)).toEqual({
      kind: "SPLIT",
      sample: { comparisons: 3, decisive: 3, abstaining: 0, largestAgreeingGroup: 2 },
      reason: "NO_UNIQUE_AGREEING_GROUP",
    });
  });

  it("SPLIT and INSUFFICIENT carry no value: no agreeing fights, no range", () => {
    const outcomes = [
      consensusOf([value("A", 0), value("B", 10_000), value("C", 20_000)], V1),
      consensusOf([value("A", 0), bound("B")], V1),
      consensusOf([], V1),
    ];
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(["SPLIT", "INSUFFICIENT", "INSUFFICIENT"]);
    for (const outcome of outcomes) {
      expect(outcome).not.toHaveProperty("range");
      expect(outcome).not.toHaveProperty("agreeingFightRefs");
    }
  });

  it("does not depend on vote order", () => {
    const votes = [value("A", 0), value("B", 4000), value("C", 4500), bound("D"), value("E", 60_000)];
    const reference = JSON.stringify(consensusOf(votes, V1));
    for (const order of [
      [4, 3, 2, 1, 0],
      [2, 0, 4, 1, 3],
      [1, 3, 0, 4, 2],
    ]) {
      expect(
        JSON.stringify(
          consensusOf(
            order.map((index) => votes[index] as ConsensusVote),
            V1,
          ),
        ),
      ).toBe(reference);
    }
  });
});

// ---------------------------------------------------------------------------
// Over a synthetic alignment
// ---------------------------------------------------------------------------

const exact = (fightTimeMs: number): LandmarkAnchor => ({
  kind: "EXACT",
  reportTimeMs: fightTimeMs,
  fightTimeMs,
  evidence: "synthetic",
});

function syntheticAlignment(
  rows: readonly { key: LandmarkKey; anchors: readonly LandmarkAnchor[] }[],
): TimingAlignment {
  const refs = ["S", "C1", "C2", "C3"];
  return {
    kind: "ALIGNED",
    encounterId: 1,
    difficulty: 5,
    fights: refs.map((fightRef, index) => ({
      fightRef,
      role: index === 0 ? "SUBJECT" : "COMPARISON",
      basis: "COVERAGE_VOUCHED",
      focusActorId: 1,
      fightStartMs: 0,
      fightEndMs: 100_000,
      finality: "COMPLETED",
      phaseEvidence: { kind: "HELD", transitions: 1 },
    })),
    landmarks: rows.map((row) => ({
      landmarkId: landmarkIdOf(row.key),
      key: row.key,
      anchors: row.anchors.map((anchor, index) => ({ fightRef: refs[index] as string, anchor })),
    })),
    comparisonCoverage: "AT_LEAST_UNCERTIFIED",
    interpolation: "NONE",
  };
}

describe("consensus over an alignment", () => {
  it("an intermission all three comparisons hold within 5 s is CONSENSUS, still context only", () => {
    const result = evaluated(
      landmarkConsensus(
        syntheticAlignment([
          { key: { kind: "PULL" }, anchors: [exact(0), exact(0), exact(0), exact(0)] },
          {
            key: { kind: "INTERMISSION_START", ordinal: 1 },
            anchors: [exact(90_000), exact(60_000), exact(61_000), exact(63_500)],
          },
        ]),
      ),
    );
    expect(result.landmarks).toHaveLength(1);
    expect(result.landmarks[0]).toMatchObject({
      landmarkId: "INTERMISSION_START#1",
      nature: "ENCOUNTER_STATE",
      // The subject's own 90 s anchor neither joins nor breaks the comparisons' agreement.
      outcome: { kind: "CONSENSUS", range: { minMs: 60_000, maxMs: 63_500 } },
    });
    expect(result.findingEffect).toEqual({ suppression: "NONE", confidence: "NONE" });
  });

  it("the subject's anchor never makes up a missing comparison vote", () => {
    const result = evaluated(
      landmarkConsensus(
        syntheticAlignment([
          {
            key: { kind: "PHASE_START", phaseId: 2 },
            anchors: [
              exact(60_000),
              exact(60_000),
              exact(60_500),
              { kind: "UNKNOWN", reason: { phaseEvidenceGate: "CAPABILITY_UNVERIFIED" } },
            ],
          },
        ]),
      ),
    );
    expect(result.landmarks[0]?.outcome).toEqual({
      kind: "INSUFFICIENT",
      sample: { comparisons: 3, decisive: 2, abstaining: 1, largestAgreeingGroup: 2 },
      reason: "BELOW_MINIMUM_SAMPLE",
    });
  });

  it("refuses a refused alignment", () => {
    expect(landmarkConsensus({ kind: "REFUSED", reason: "ENCOUNTER_MISMATCH" })).toEqual({
      kind: "REFUSED",
      reason: "ALIGNMENT_REFUSED",
    });
  });

  it("names what each landmark is about: only phases and intermissions are encounter state", () => {
    expect(natureOf({ kind: "PHASE_START", phaseId: 1 })).toBe("ENCOUNTER_STATE");
    expect(natureOf({ kind: "INTERMISSION_START", ordinal: 1 })).toBe("ENCOUNTER_STATE");
    expect(natureOf({ kind: "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC", gameId: 1 })).toBe("FOCUS_BEHAVIOR");
    expect(natureOf({ kind: "COOLDOWN_WINDOW_START", windowKind: "X", ordinal: 1 })).toBe("FOCUS_BEHAVIOR");
    expect(natureOf({ kind: "RECORDED_FIGHT_END" })).toBe("FIGHT_RECORD");
  });
});
