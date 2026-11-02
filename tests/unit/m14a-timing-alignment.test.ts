import { beforeAll, describe, expect, it } from "vitest";

import type { CombatActor } from "../../src/engine/normalization/actors.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import type { CombatPhase } from "../../src/engine/normalization/combat-fight.js";
import type { ComparisonFightInput, PostHocDefinition } from "../../src/comparison-facts/fight-facts.js";
import {
  alignFights,
  factsAtAlignedMoment,
  type AlignmentInput,
  type LandmarkAnchor,
  type TimingAlignment,
} from "../../src/comparison-facts/timing-alignment.js";
import { BLOOD_POST_HOC_DEFINITION } from "../../src/specs/deathknight/blood/post-hoc-definition.js";
import { auraEvent, damageEvent, phase, syntheticFight } from "../support/synthetic-fight.js";
import { COMPARISONS, comparisonInput, subjectInput } from "../support/m11/g2-four-fights.js";

/**
 * M14-A timing alignment over the four committed M11-G2 fights (the subject:
 * COVERAGE_VOUCHED; three comparisons: UNCERTIFIED_FILTERED_CAPTURE), plus
 * synthetic negatives. Every pinned number was observed in the committed
 * bytes; none is a judgement. No Warcraft Logs request is made.
 */

const BLOOD = BLOOD_POST_HOC_DEFINITION as unknown as PostHocDefinition;
let real: AlignmentInput;
let aligned: Extract<TimingAlignment, { kind: "ALIGNED" }>;

beforeAll(async () => {
  const comparisons: ComparisonFightInput[] = [];
  for (const fixture of COMPARISONS) comparisons.push(await comparisonInput(fixture));
  real = { subject: await subjectInput(), comparisons };
  const result = alignFights(real, BLOOD);
  if (result.kind !== "ALIGNED") throw new Error(`alignment refused: ${result.reason}`);
  aligned = result;
}, 120_000);

const row = (id: string) => {
  const found = aligned.landmarks.find((entry) => entry.landmarkId === id);
  if (found === undefined) throw new Error(`no landmark ${id}`);
  return found;
};
const brief = (anchor: LandmarkAnchor) =>
  anchor.kind === "UNKNOWN"
    ? { kind: "UNKNOWN", reason: anchor.reason }
    : { kind: anchor.kind, at: anchor.fightTimeMs };

describe("the four committed fights on shared landmarks", () => {
  it("aligns the subject and the three G1 comparisons on one encounter and difficulty", () => {
    expect(aligned.encounterId).toBe(2900);
    expect(aligned.difficulty).toBe(5);
    expect(aligned.fights.map((fight) => [fight.fightRef, fight.role, fight.basis])).toEqual([
      ["b1PmaKrd6CDfzngc#48", "SUBJECT", "COVERAGE_VOUCHED"],
      ["COHORT246AAAAAAA#33", "COMPARISON", "UNCERTIFIED_FILTERED_CAPTURE"],
      ["COHORT116AAAAAAA#64", "COMPARISON", "UNCERTIFIED_FILTERED_CAPTURE"],
      ["COHORT261AAAAAAA#31", "COMPARISON", "UNCERTIFIED_FILTERED_CAPTURE"],
    ]);
    expect(aligned.comparisonCoverage).toBe("AT_LEAST_UNCERTIFIED");
    expect(aligned.interpolation).toBe("NONE");
  });

  it("pull is offset 0 everywhere and the recorded end is EXACT for completed kills", () => {
    expect(row("PULL").anchors.map(({ anchor }) => brief(anchor))).toEqual(
      Array(4).fill({ kind: "EXACT", at: 0 }),
    );
    expect(row("RECORDED_FIGHT_END").anchors.map(({ anchor }) => brief(anchor))).toEqual([
      { kind: "EXACT", at: 345_177 },
      { kind: "EXACT", at: 329_430 },
      { kind: "EXACT", at: 336_303 },
      { kind: "EXACT", at: 359_887 },
    ]);
  });

  it("no fight holds phase evidence: there is no phase row, and each fight says why (never 'no phases')", () => {
    expect(aligned.landmarks.filter((entry) => /PHASE|INTERMISSION/.test(entry.landmarkId))).toEqual([]);
    for (const fight of aligned.fights) {
      expect(fight.phaseEvidence).toEqual({
        kind: "UNKNOWN",
        reason: { phaseEvidenceGate: "CAPABILITY_UNVERIFIED" },
      });
    }
  });

  it("target transitions: EXACT for the vouched subject, NO_LATER_THAN for every uncertified comparison", () => {
    expect(
      aligned.landmarks
        .filter((entry) => entry.key.kind === "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC")
        .map((entry) => [entry.landmarkId, entry.anchors.map(({ anchor }) => brief(anchor))]),
    ).toEqual([
      [
        "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:259181",
        [
          { kind: "EXACT", at: 649 },
          { kind: "NO_LATER_THAN", at: 1851 },
          { kind: "NO_LATER_THAN", at: 1140 },
          { kind: "NO_LATER_THAN", at: 17 },
        ],
      ],
      [
        "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:260895",
        [
          { kind: "EXACT", at: 26_935 },
          { kind: "NO_LATER_THAN", at: 24_162 },
          { kind: "NO_LATER_THAN", at: 24_236 },
          { kind: "NO_LATER_THAN", at: 24_052 },
        ],
      ],
      [
        "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:260905",
        [
          { kind: "EXACT", at: 28_603 },
          { kind: "NO_LATER_THAN", at: 32_057 },
          { kind: "NO_LATER_THAN", at: 34_011 },
          { kind: "NO_LATER_THAN", at: 30_342 },
        ],
      ],
    ]);
  });

  it("a player target is never a landmark (the subject's damage on actor 3 is not a target transition)", () => {
    const ids = aligned.landmarks.map((entry) => entry.landmarkId);
    expect(ids.filter((id) => id.startsWith("FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:"))).toHaveLength(3);
  });

  it("cooldown windows: ordinals align, and a window a fight did not observe is UNKNOWN, never interpolated", () => {
    const windows = aligned.landmarks.filter((entry) => entry.key.kind === "COOLDOWN_WINDOW_START");
    expect(windows).toHaveLength(19);
    expect(
      row("COOLDOWN_WINDOW_START:DANCING_RUNE_WEAPON#1").anchors.map(({ anchor }) => brief(anchor)),
    ).toEqual([
      { kind: "EXACT", at: 2488 },
      { kind: "NO_LATER_THAN", at: 2530 },
      { kind: "NO_LATER_THAN", at: 3242 },
      { kind: "NO_LATER_THAN", at: 2976 },
    ]);
    expect(
      row("COOLDOWN_WINDOW_START:DANCING_RUNE_WEAPON#19").anchors.map(({ anchor }) => brief(anchor)),
    ).toEqual([
      { kind: "UNKNOWN", reason: "NOT_OBSERVED_IN_FIGHT" },
      { kind: "NO_LATER_THAN", at: 322_172 },
      { kind: "UNKNOWN", reason: "NOT_OBSERVED_IN_FIGHT" },
      { kind: "NO_LATER_THAN", at: 348_511 },
    ]);
  });

  it("is deterministic over the committed bytes", () => {
    expect(JSON.stringify(alignFights(real, BLOOD))).toBe(JSON.stringify(aligned));
  });
});

describe("what each fight showed at the same encounter moment", () => {
  it("the first 30 s after pull: EXACT counts for the subject, AT_LEAST for the comparisons", () => {
    const moment = factsAtAlignedMoment(real, BLOOD, "PULL", { fromMs: 0, toMs: 30_000 });
    if (moment.kind !== "MOMENT") throw new Error(moment.reason);
    expect(
      moment.fights.map((fight) =>
        fight.kind === "SLICED"
          ? [fight.fightRef, fight.focusCasts.completeEventCount, fight.focusDamage.damageEventCount]
          : [fight.fightRef, fight.reason],
      ),
    ).toEqual([
      ["b1PmaKrd6CDfzngc#48", { kind: "EXACT", value: 78 }, { kind: "EXACT", value: 172 }],
      ["COHORT246AAAAAAA#33", { kind: "AT_LEAST", value: 68 }, { kind: "AT_LEAST", value: 244 }],
      ["COHORT116AAAAAAA#64", { kind: "AT_LEAST", value: 84 }, { kind: "AT_LEAST", value: 299 }],
      ["COHORT261AAAAAAA#31", { kind: "AT_LEAST", value: 78 }, { kind: "AT_LEAST", value: 210 }],
    ]);
    for (const fight of moment.fights) {
      if (fight.kind !== "SLICED") continue;
      // Raw sums stay UNKNOWN for an uncertified capture: never a point estimate.
      if (fight.fightRef !== "b1PmaKrd6CDfzngc#48")
        expect(fight.focusDamage.rawAmountFieldSum.kind).toBe("UNKNOWN");
    }
  });

  it("a NO_LATER_THAN anchor places no window: only the subject is sliced at a target transition", () => {
    const moment = factsAtAlignedMoment(real, BLOOD, "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:260895", {
      fromMs: 0,
      toMs: 10_000,
    });
    if (moment.kind !== "MOMENT") throw new Error(moment.reason);
    expect(
      moment.fights.map((fight) => [fight.fightRef, fight.kind === "SLICED" ? "SLICED" : fight.reason]),
    ).toEqual([
      ["b1PmaKrd6CDfzngc#48", "SLICED"],
      ["COHORT246AAAAAAA#33", "ANCHOR_NOT_EXACT"],
      ["COHORT116AAAAAAA#64", "ANCHOR_NOT_EXACT"],
      ["COHORT261AAAAAAA#31", "ANCHOR_NOT_EXACT"],
    ]);
  });

  it("a window reaching past the recorded fight is UNKNOWN, never clipped", () => {
    const moment = factsAtAlignedMoment(real, BLOOD, "RECORDED_FIGHT_END", { fromMs: -5_000, toMs: 1 });
    if (moment.kind !== "MOMENT") throw new Error(moment.reason);
    expect(
      moment.fights.every(
        (fight) => fight.kind === "UNKNOWN" && fight.reason === "WINDOW_OUTSIDE_RECORDED_FIGHT",
      ),
    ).toBe(true);
  });

  it("refuses unknown landmarks and invalid offsets", () => {
    expect(factsAtAlignedMoment(real, BLOOD, "PHASE_START:2", { fromMs: 0, toMs: 1 })).toEqual({
      kind: "REFUSED",
      reason: "UNKNOWN_LANDMARK",
    });
    expect(factsAtAlignedMoment(real, BLOOD, "PULL", { fromMs: 5, toMs: 5 })).toEqual({
      kind: "REFUSED",
      reason: "INVALID_OFFSETS",
    });
    expect(factsAtAlignedMoment(real, BLOOD, "PULL", { fromMs: 0.5, toMs: 5 })).toEqual({
      kind: "REFUSED",
      reason: "INVALID_OFFSETS",
    });
  });

  it("the same fight ref with another focus gets that focus's anchors, never the original's", () => {
    // Actor 3 is a player the subject's focus hit; it never hit NPC 260895 itself.
    const otherFocus: AlignmentInput = {
      subject: { ...real.subject, focusActorId: 3 },
      comparisons: real.comparisons,
    };
    const moment = factsAtAlignedMoment(otherFocus, BLOOD, "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:260895", {
      fromMs: 0,
      toMs: 10_000,
    });
    if (moment.kind !== "MOMENT") throw new Error(moment.reason);
    expect(moment.fights[0]).toMatchObject({
      fightRef: "b1PmaKrd6CDfzngc#48",
      kind: "UNKNOWN",
      reason: "ANCHOR_UNKNOWN",
    });
  });
});

// ---------------------------------------------------------------------------
// Synthetic negatives
// ---------------------------------------------------------------------------

const FOCUS = 5;
const BOSS = 50;
const AURA = 9000;
const WINDOWS: PostHocDefinition = {
  specId: "synthetic/spec",
  cooldownWindows: [
    {
      windowKind: "SYNTHETIC_WINDOW",
      triggerCastAbilityGameIds: [9001],
      activeAuraAbilityGameId: AURA,
      auraClass: "BUFF",
      triggerAssociationToleranceMs: 5,
      provenance: "synthetic",
    },
  ],
  subActorKinds: [],
};

const actors = new Map<number, CombatActor>([
  [
    FOCUS,
    {
      actorId: FOCUS,
      gameId: null,
      name: null,
      server: null,
      actorType: "PLAYER",
      rawType: "DeathKnight",
      subType: null,
      petOwnerActorId: null,
    },
  ],
  [
    BOSS,
    {
      actorId: BOSS,
      gameId: 7777,
      name: null,
      server: null,
      actorType: "NPC",
      rawType: "NPC",
      subType: "Boss",
      petOwnerActorId: null,
    },
  ],
]);

function input(
  fightRef: string,
  options: {
    events?: CombatEvent[];
    phases?: CombatPhase[];
    phaseEvidence?: boolean;
    vouched?: boolean;
    difficulty?: number | null;
    encounterId?: number;
    finality?: "COMPLETED" | "IN_PROGRESS" | "UNKNOWN";
  } = {},
): ComparisonFightInput {
  const base = syntheticFight({
    focusActorId: FOCUS,
    actors,
    events: options.events ?? [],
    phases: options.phases ?? [],
    finality: options.finality,
    observedCategories: [
      "DAMAGE",
      "CASTS",
      "AURAS",
      "ACTORS",
      ...(options.phaseEvidence === true ? (["ENCOUNTER_PHASES"] as const) : []),
    ],
  });
  const fight = {
    ...base,
    fight: {
      ...base.fight,
      difficulty: options.difficulty === undefined ? 5 : options.difficulty,
      encounterId: options.encounterId ?? 2900,
    },
  };
  return {
    fightRef,
    fight,
    focusActorId: FOCUS,
    basis:
      options.vouched === false
        ? { kind: "UNCERTIFIED_FILTERED_CAPTURE", reason: "synthetic" }
        : { kind: "COVERAGE_VOUCHED" },
    enemyNpcs: { kind: "NOT_RETRIEVED", reason: "synthetic" },
    enemyEntries: null,
    wcl: { raidEntry: null, raidTotalTimeMs: null, tables: null },
  };
}

const hit = (ordinal: number, at: number) =>
  damageEvent({ ordinal, reportTimeMs: at, sourceActorId: FOCUS, targetActorId: BOSS });
const aura = (ordinal: number, at: number, operation: "APPLIED" | "REFRESHED" | "REMOVED") =>
  auraEvent({
    ordinal,
    reportTimeMs: at,
    sourceActorId: FOCUS,
    targetActorId: FOCUS,
    abilityGameId: AURA,
    operation,
    auraClass: "BUFF",
  });

const aligns = (subject: ComparisonFightInput, ...comparisons: ComparisonFightInput[]) => {
  const result = alignFights({ subject, comparisons }, WINDOWS);
  if (result.kind !== "ALIGNED") throw new Error(result.reason);
  return result;
};
const anchorsOf = (alignment: Extract<TimingAlignment, { kind: "ALIGNED" }>, id: string) =>
  alignment.landmarks.find((entry) => entry.landmarkId === id)?.anchors.map(({ anchor }) => brief(anchor));

describe("synthetic negatives: absence is never a landmark, a bound is never exact", () => {
  it("a landmark only one fight observed is UNKNOWN in the other, never shifted from the first", () => {
    const result = aligns(input("S", { events: [hit(0, 1500)] }), input("C", {}));
    expect(anchorsOf(result, "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:7777")).toEqual([
      { kind: "EXACT", at: 500 },
      { kind: "UNKNOWN", reason: "NOT_OBSERVED_IN_FIGHT" },
    ]);
  });

  it("the same observation under an uncertified basis is NO_LATER_THAN, never EXACT", () => {
    const result = aligns(
      input("S", { events: [hit(0, 1500)] }),
      input("C", { events: [hit(0, 1500)], vouched: false }),
    );
    expect(anchorsOf(result, "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:7777")).toEqual([
      { kind: "EXACT", at: 500 },
      { kind: "NO_LATER_THAN", at: 500 },
    ]);
  });

  it("phases behind an unverified capability are UNKNOWN, never phase 1 and never 'no phases'", () => {
    const phases = [phase({ phaseId: 1, startTimeMs: 1000, isIntermission: false })];
    const result = aligns(
      input("S", { phases, phaseEvidence: true }),
      input("C", { phases }), // the same transitions, but the category is UNVERIFIED
    );
    expect(anchorsOf(result, "PHASE_START:1")).toEqual([
      { kind: "EXACT", at: 0 },
      { kind: "UNKNOWN", reason: { phaseEvidenceGate: "CAPABILITY_UNVERIFIED" } },
    ]);
    expect(result.fights.map((fight) => fight.phaseEvidence.kind)).toEqual(["HELD", "UNKNOWN"]);
  });

  it("an unordered transition list is UNKNOWN, never sorted into a timeline", () => {
    const result = aligns(
      input("S", {
        phaseEvidence: true,
        phases: [
          phase({ phaseId: 1, startTimeMs: 1000, isIntermission: false }),
          phase({ phaseId: 2, startTimeMs: 3000, isIntermission: false }),
        ],
      }),
      input("C", {
        phaseEvidence: true,
        phases: [
          phase({ phaseId: 2, startTimeMs: 3000, isIntermission: false }),
          phase({ phaseId: 1, startTimeMs: 1000, isIntermission: false }),
        ],
      }),
    );
    expect(anchorsOf(result, "PHASE_START:2")).toEqual([
      { kind: "EXACT", at: 2000 },
      { kind: "UNKNOWN", reason: "PHASE_TIMELINE_UNORDERED" },
    ]);
  });

  it("an unstated intermission flag makes every later intermission ordinal UNKNOWN, but not later phase starts", () => {
    const result = aligns(
      input("S", {
        phaseEvidence: true,
        phases: [
          phase({ phaseId: 1, startTimeMs: 1000, isIntermission: false }),
          phase({ phaseId: 2, startTimeMs: 2000, isIntermission: true }),
          phase({ phaseId: 3, startTimeMs: 3000, isIntermission: false }),
        ],
      }),
      input("C", {
        phaseEvidence: true,
        phases: [
          phase({ phaseId: 1, startTimeMs: 1000, isIntermission: null }),
          phase({ phaseId: 2, startTimeMs: 2500, isIntermission: true }),
          phase({ phaseId: 3, startTimeMs: 3500, isIntermission: false }),
        ],
      }),
    );
    expect(anchorsOf(result, "INTERMISSION_START#1")).toEqual([
      { kind: "EXACT", at: 1000 },
      { kind: "UNKNOWN", reason: "INTERMISSION_FLAG_NOT_STATED_BEFORE_ORDINAL" },
    ]);
    expect(anchorsOf(result, "PHASE_START:3")).toEqual([
      { kind: "EXACT", at: 2000 },
      { kind: "EXACT", at: 2500 },
    ]);
  });

  it("a window whose start was not observed blocks its own and every later ordinal; no nominal duration fills it", () => {
    const result = aligns(
      input("S", { events: [aura(0, 1200, "APPLIED"), aura(1, 1300, "REMOVED"), aura(2, 2000, "APPLIED")] }),
      input("C", { events: [aura(0, 1250, "REMOVED"), aura(1, 2100, "APPLIED"), aura(2, 2200, "REMOVED")] }),
    );
    expect(anchorsOf(result, "COOLDOWN_WINDOW_START:SYNTHETIC_WINDOW#1")).toEqual([
      { kind: "EXACT", at: 200 },
      { kind: "UNKNOWN", reason: "WINDOW_START_NOT_OBSERVED_BEFORE_ORDINAL" },
    ]);
    expect(anchorsOf(result, "COOLDOWN_WINDOW_START:SYNTHETIC_WINDOW#2")).toEqual([
      { kind: "EXACT", at: 1000 },
      { kind: "UNKNOWN", reason: "WINDOW_START_NOT_OBSERVED_BEFORE_ORDINAL" },
    ]);
  });

  it("an unfinished fight's recorded end is UNKNOWN, never the fight end", () => {
    const result = aligns(input("S", {}), input("C", { finality: "IN_PROGRESS" }));
    expect(anchorsOf(result, "RECORDED_FIGHT_END")).toEqual([
      { kind: "EXACT", at: 4000 },
      { kind: "UNKNOWN", reason: "FIGHT_NOT_COMPLETED" },
    ]);
  });

  it("refuses fights that are not the same encounter moment space", () => {
    expect(
      alignFights({ subject: input("S"), comparisons: [input("C", { encounterId: 1 })] }, WINDOWS),
    ).toEqual({
      kind: "REFUSED",
      reason: "ENCOUNTER_MISMATCH",
    });
    expect(
      alignFights({ subject: input("S"), comparisons: [input("C", { difficulty: 4 })] }, WINDOWS),
    ).toEqual({
      kind: "REFUSED",
      reason: "DIFFICULTY_MISMATCH",
    });
    expect(
      alignFights({ subject: input("S"), comparisons: [input("C", { difficulty: null })] }, WINDOWS),
    ).toEqual({
      kind: "REFUSED",
      reason: "DIFFICULTY_NOT_ESTABLISHED",
    });
    expect(alignFights({ subject: input("S"), comparisons: [input("S")] }, WINDOWS)).toEqual({
      kind: "REFUSED",
      reason: "DUPLICATE_FIGHT_REF",
    });
  });

  it("a moment is always sliced from anchors of the inputs it is given, under an unchanged fight ref", () => {
    const original = { subject: input("S", { events: [hit(0, 1500)] }), comparisons: [input("C")] };
    const id = "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:7777";
    const window = { fromMs: 0, toMs: 100 };
    expect(factsAtAlignedMoment(original, WINDOWS, id, window)).toMatchObject({
      kind: "MOMENT",
      fights: [
        { fightRef: "S", kind: "SLICED" },
        { fightRef: "C", kind: "UNKNOWN" },
      ],
    });
    // Another focus: the landmark no longer exists anywhere.
    const otherFocus = { ...original, subject: { ...original.subject, focusActorId: 6 } };
    expect(factsAtAlignedMoment(otherFocus, WINDOWS, id, window)).toEqual({
      kind: "REFUSED",
      reason: "UNKNOWN_LANDMARK",
    });
    // Other evidence: the hit moved, and so does the window.
    const moved = { ...original, subject: input("S", { events: [hit(0, 2500)] }) };
    const result = factsAtAlignedMoment(moved, WINDOWS, id, window);
    if (result.kind !== "MOMENT") throw new Error(result.reason);
    expect(result.fights[0]).toMatchObject({ kind: "SLICED", window: { startMs: 2500, endMs: 2600 } });
  });
});
