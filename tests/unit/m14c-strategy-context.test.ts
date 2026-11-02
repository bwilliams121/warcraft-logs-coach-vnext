import { beforeAll, describe, expect, it } from "vitest";

import type { CombatActor } from "../../src/engine/normalization/actors.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import type { CombatPhase } from "../../src/engine/normalization/combat-fight.js";
import type { ComparisonFightInput, PostHocDefinition } from "../../src/comparison-facts/fight-facts.js";
import type { AlignmentInput } from "../../src/comparison-facts/timing-alignment.js";
import {
  COMPARISON_CONSENSUS_THRESHOLDS_V1,
  type ConsensusThresholds,
} from "../../src/comparison-facts/consensus.js";
import {
  attachStrategyContext,
  strategyContext,
  type StrategyContext,
  type StrategyContextItem,
} from "../../src/comparison-facts/strategy-context.js";
import { BLOOD_POST_HOC_DEFINITION } from "../../src/specs/deathknight/blood/post-hoc-definition.js";
import { auraEvent, phase, syntheticFight } from "../support/synthetic-fight.js";
import { COMPARISONS, comparisonInput, subjectInput } from "../support/m11/g2-four-fights.js";

/**
 * M14-C strategy context over the four committed M11-G2 fights, plus
 * synthetic phased fights. No Warcraft Logs request is made.
 */

const BLOOD = BLOOD_POST_HOC_DEFINITION as unknown as PostHocDefinition;
const V1 = COMPARISON_CONSENSUS_THRESHOLDS_V1;

const represented = (result: StrategyContext) => {
  if (result.kind !== "REPRESENTED") throw new Error(`strategy context refused: ${result.reason}`);
  return result;
};
const itemOf = (result: StrategyContext, id: string): StrategyContextItem => {
  const found = represented(result).items.find((item) => item.itemId === id);
  if (found === undefined) throw new Error(`no item ${id}`);
  return found;
};

// ---------------------------------------------------------------------------
// The committed fights
// ---------------------------------------------------------------------------

let real: AlignmentInput;

beforeAll(async () => {
  const comparisons: ComparisonFightInput[] = [];
  for (const fixture of COMPARISONS) comparisons.push(await comparisonInput(fixture));
  real = { subject: await subjectInput(), comparisons };
}, 120_000);

describe("the committed fights: no named reason, and honest about why", () => {
  it("declares itself context only, with no rotational authority and no finding effect", () => {
    const result = represented(strategyContext(real, BLOOD));
    expect(result.encounterId).toBe(2900);
    expect(result.subjectFightRef).toBe("b1PmaKrd6CDfzngc#48");
    expect(result.thresholds).toEqual({ id: "M14B_COMPARISON_CONSENSUS_V1", status: "CANDIDATE" });
    expect(result.comparisonCoverage).toBe("AT_LEAST_UNCERTIFIED");
    expect(result.use).toBe("CONTEXT_ONLY");
    expect(result.rotationalAuthority).toBe("NONE");
    expect(result.findingEffect).toEqual({ suppression: "NONE", confidence: "NONE" });
  });

  it("3 target transitions and 19 cooldown windows, all INSUFFICIENT, none naming a reason", () => {
    const result = represented(strategyContext(real, BLOOD));
    expect(result.items.filter((item) => item.kind === "TARGET_TRANSITION")).toHaveLength(3);
    expect(result.items.filter((item) => item.kind === "COOLDOWN_TIMING")).toHaveLength(19);
    expect(result.items).toHaveLength(22);
    for (const item of result.items) {
      expect(item.nature).toBe("FOCUS_BEHAVIOR");
      expect(item.consensus.kind).toBe("INSUFFICIENT");
      expect(item.environmentalReason).toEqual({ kind: "NONE", cause: "FOCUS_BEHAVIOR_NAMES_NO_REASON" });
    }
    expect(itemOf(result, "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:259181").subjectAnchor).toMatchObject({
      kind: "EXACT",
      fightTimeMs: 649,
    });
  });

  it("no phase or downtime item exists, and every fight says its phase evidence is not held (never 'no downtime')", () => {
    const result = represented(strategyContext(real, BLOOD));
    expect(result.items.filter((item) => item.nature === "ENCOUNTER_STATE")).toEqual([]);
    expect(result.encounterStateEvidence).toHaveLength(4);
    for (const entry of result.encounterStateEvidence) {
      expect(entry.phaseEvidence).toEqual({
        kind: "UNKNOWN",
        reason: { phaseEvidenceGate: "CAPABILITY_UNVERIFIED" },
      });
    }
  });

  it("the recorded end and the pull are not strategy items", () => {
    const ids = represented(strategyContext(real, BLOOD)).items.map((item) => item.itemId);
    expect(ids).not.toContain("RECORDED_FIGHT_END");
    expect(ids).not.toContain("PULL");
  });

  it("attaching to any finding moment adds no reason and changes nothing", () => {
    const result = represented(strategyContext(real, BLOOD));
    const start = real.subject.fight.fight.startTimeMs;
    const attached = attachStrategyContext(result, [
      { findingId: "f1", reportTimeMs: start + 649 },
      { findingId: "f2", reportTimeMs: start + 60_000 },
    ]);
    expect(attached).toEqual([
      {
        findingId: "f1",
        reasonsInEffect: [],
        use: "CONTEXT_ONLY",
        findingEffect: { suppression: "NONE", confidence: "NONE" },
      },
      {
        findingId: "f2",
        reasonsInEffect: [],
        use: "CONTEXT_ONLY",
        findingEffect: { suppression: "NONE", confidence: "NONE" },
      },
    ]);
  });

  it("is deterministic over the committed bytes", () => {
    expect(JSON.stringify(strategyContext(real, BLOOD))).toBe(JSON.stringify(strategyContext(real, BLOOD)));
  });
});

// ---------------------------------------------------------------------------
// Synthetic phased fights
// ---------------------------------------------------------------------------

const FOCUS = 5;
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
]);

function input(
  fightRef: string,
  options: {
    phases?: CombatPhase[];
    phaseEvidence?: boolean;
    events?: CombatEvent[];
    encounterId?: number;
  } = {},
): ComparisonFightInput {
  const base = syntheticFight({
    focusActorId: FOCUS,
    actors,
    events: options.events ?? [],
    phases: options.phases ?? [],
    finality: "COMPLETED",
    observedCategories: [
      "DAMAGE",
      "CASTS",
      "AURAS",
      "ACTORS",
      ...(options.phaseEvidence === false ? [] : (["ENCOUNTER_PHASES"] as const)),
    ],
  });
  return {
    fightRef,
    fight: { ...base, fight: { ...base.fight, difficulty: 5, encounterId: options.encounterId ?? 2900 } },
    focusActorId: FOCUS,
    basis: { kind: "COVERAGE_VOUCHED" },
    enemyNpcs: { kind: "NOT_RETRIEVED", reason: "synthetic" },
    enemyEntries: null,
    wcl: { raidEntry: null, raidTotalTimeMs: null, tables: null },
  };
}

/** Phase 1 at pull, an intermission (phase 2) at `intermissionAt`, phase 3 a second later. */
const phased = (intermissionAt: number, intermissionFlag: boolean | null = true) => [
  phase({ phaseId: 1, startTimeMs: 1000, isIntermission: false }),
  phase({ phaseId: 2, startTimeMs: intermissionAt, isIntermission: intermissionFlag }),
  phase({ phaseId: 3, startTimeMs: intermissionAt + 1000, isIntermission: false }),
];

const comparisonsAt = (...intermissionAts: number[]) =>
  intermissionAts.map((at, index) => input(`C${String(index + 1)}`, { phases: phased(at) }));

const TIGHT: ConsensusThresholds = { ...V1, id: "TEST_TIGHT", timingToleranceMs: 200 };
const NAMED_REASONS_EVER = (result: StrategyContext) =>
  represented(result).items.flatMap((item) =>
    item.environmentalReason.kind === "NAMED" ? [item.environmentalReason.reason] : [],
  );

describe("an encounter-state consensus the subject's own evidence agrees with names a reason", () => {
  const context = () =>
    strategyContext(
      { subject: input("S", { phases: phased(2000) }), comparisons: comparisonsAt(2050, 1950, 2100) },
      WINDOWS,
    );

  it("INTERMISSION over the subject's own intermission interval, corroborated by the agreeing comparisons", () => {
    expect(itemOf(context(), "INTERMISSION_START#1")).toMatchObject({
      kind: "COMMON_DOWNTIME",
      nature: "ENCOUNTER_STATE",
      consensus: { kind: "CONSENSUS", range: { minMs: 950, maxMs: 1100 } },
      subjectAnchor: { kind: "EXACT", fightTimeMs: 1000 },
      environmentalReason: {
        kind: "NAMED",
        reason: "INTERMISSION",
        subjectWindow: { fromReportTimeMs: 2000, toReportTimeMs: 3000, upperBound: "EXCLUSIVE" },
        subjectEvidence: "fight.phases[1]",
        corroboratingFightRefs: ["C2", "C1", "C3"],
      },
    });
  });

  it("PHASE_TRANSITION at the subject's own transition instant, with no invented duration", () => {
    expect(itemOf(context(), "PHASE_START:3")).toMatchObject({
      kind: "PHASE_BEHAVIOR",
      environmentalReason: {
        kind: "NAMED",
        reason: "PHASE_TRANSITION",
        subjectWindow: { fromReportTimeMs: 3000, toReportTimeMs: 3000, upperBound: "INCLUSIVE" },
      },
    });
  });

  it("attaching lists the reasons in effect at each moment and never touches the finding", () => {
    const attached = attachStrategyContext(represented(context()), [
      { findingId: "during", reportTimeMs: 2500 },
      { findingId: "transition", reportTimeMs: 3000 },
      { findingId: "after", reportTimeMs: 3500 },
    ]);
    expect(attached.map((entry) => [entry.findingId, entry.reasonsInEffect])).toEqual([
      ["during", [{ itemId: "INTERMISSION_START#1", reason: "INTERMISSION" }]],
      // The intermission interval's upper bound is exclusive.
      ["transition", [{ itemId: "PHASE_START:3", reason: "PHASE_TRANSITION" }]],
      ["after", []],
    ]);
    for (const entry of attached) {
      expect(entry.findingEffect).toEqual({ suppression: "NONE", confidence: "NONE" });
      expect(entry.use).toBe("CONTEXT_ONLY");
    }
  });

  it("TARGET_UNAVAILABLE and FORCED_DOWNTIME have no evidence source and are never named", () => {
    expect(new Set(NAMED_REASONS_EVER(context()))).toEqual(new Set(["INTERMISSION", "PHASE_TRANSITION"]));
  });
});

describe("comparisons never supply a missing subject fact", () => {
  it("subject phase evidence not held: comparisons agree, yet no reason is named", () => {
    const result = strategyContext(
      {
        subject: input("S", { phases: phased(2000), phaseEvidence: false }),
        comparisons: comparisonsAt(2050, 1950, 2100),
      },
      WINDOWS,
    );
    const item = itemOf(result, "INTERMISSION_START#1");
    expect(item.consensus.kind).toBe("CONSENSUS");
    expect(item.subjectAnchor).toEqual({
      kind: "UNKNOWN",
      reason: { phaseEvidenceGate: "CAPABILITY_UNVERIFIED" },
    });
    expect(item.environmentalReason).toEqual({ kind: "NONE", cause: "SUBJECT_ANCHOR_NOT_EXACT" });
    expect(NAMED_REASONS_EVER(result)).toEqual([]);
    expect(
      attachStrategyContext(represented(result), [{ findingId: "f", reportTimeMs: 2500 }])[0]
        ?.reasonsInEffect,
    ).toEqual([]);
  });

  it("an unstated subject intermission flag is UNKNOWN, never borrowed from the comparisons", () => {
    const result = strategyContext(
      { subject: input("S", { phases: phased(2000, null) }), comparisons: comparisonsAt(2050, 1950, 2100) },
      WINDOWS,
    );
    expect(itemOf(result, "INTERMISSION_START#1").environmentalReason).toEqual({
      kind: "NONE",
      cause: "SUBJECT_ANCHOR_NOT_EXACT",
    });
    // The phase transitions themselves do not depend on the flag.
    expect(itemOf(result, "PHASE_START:2").environmentalReason.kind).toBe("NAMED");
  });

  it("a subject outside the agreeing range is a fact, not a fault: no reason, no direction", () => {
    const result = strategyContext(
      { subject: input("S", { phases: phased(2000) }), comparisons: comparisonsAt(3000, 3050, 3100) },
      WINDOWS,
      TIGHT,
    );
    const item = itemOf(result, "INTERMISSION_START#1");
    expect(item.consensus.kind).toBe("CONSENSUS");
    expect(item.environmentalReason).toEqual({ kind: "NONE", cause: "SUBJECT_OUTSIDE_CONSENSUS_RANGE" });
    expect(Object.keys(item).sort()).toEqual(
      ["consensus", "environmentalReason", "itemId", "key", "kind", "nature", "subjectAnchor"].sort(),
    );
  });
});

describe("no consensus, no reason", () => {
  it("two comparison fights are below the minimum sample: INSUFFICIENT, nothing named", () => {
    const result = strategyContext(
      { subject: input("S", { phases: phased(2000) }), comparisons: comparisonsAt(2000, 2000) },
      WINDOWS,
    );
    expect(itemOf(result, "INTERMISSION_START#1")).toMatchObject({
      consensus: { kind: "INSUFFICIENT", reason: "BELOW_MINIMUM_SAMPLE" },
      environmentalReason: { kind: "NONE", cause: "NO_COMPARISON_CONSENSUS" },
    });
    expect(NAMED_REASONS_EVER(result)).toEqual([]);
  });

  it("comparisons that disagree are SPLIT: the item stays, with no reason", () => {
    const result = strategyContext(
      { subject: input("S", { phases: phased(2000) }), comparisons: comparisonsAt(1500, 2500, 3500) },
      WINDOWS,
      TIGHT,
    );
    expect(itemOf(result, "INTERMISSION_START#1")).toMatchObject({
      consensus: { kind: "SPLIT" },
      environmentalReason: { kind: "NONE", cause: "NO_COMPARISON_CONSENSUS" },
    });
  });
});

describe("focus behavior is never a reason and never correctness", () => {
  const aura = (ordinal: number, at: number, operation: "APPLIED" | "REMOVED") =>
    auraEvent({
      ordinal,
      reportTimeMs: at,
      sourceActorId: FOCUS,
      targetActorId: FOCUS,
      abilityGameId: AURA,
      operation,
      auraClass: "BUFF",
    });
  const windowAt = (at: number) => [aura(0, at, "APPLIED"), aura(1, at + 300, "REMOVED")];

  it("a cooldown window every comparison opened at the same moment is CONSENSUS, but names nothing", () => {
    const result = strategyContext(
      {
        subject: input("S", { events: windowAt(4000) }),
        comparisons: [
          input("C1", { events: windowAt(1500) }),
          input("C2", { events: windowAt(1500) }),
          input("C3", { events: windowAt(1600) }),
        ],
      },
      WINDOWS,
      TIGHT,
    );
    expect(itemOf(result, "COOLDOWN_WINDOW_START:SYNTHETIC_WINDOW#1")).toMatchObject({
      kind: "COOLDOWN_TIMING",
      nature: "FOCUS_BEHAVIOR",
      consensus: { kind: "CONSENSUS" },
      subjectAnchor: { kind: "EXACT", fightTimeMs: 3000 },
      environmentalReason: { kind: "NONE", cause: "FOCUS_BEHAVIOR_NAMES_NO_REASON" },
    });
    expect(represented(result).rotationalAuthority).toBe("NONE");
  });
});

describe("refusals", () => {
  it("refuses an invalid threshold set and a refused alignment", () => {
    const subject = input("S", { phases: phased(2000) });
    expect(
      strategyContext({ subject, comparisons: comparisonsAt(2000) }, WINDOWS, { ...V1, minimumSample: 1 }),
    ).toEqual({ kind: "REFUSED", reason: "MINIMUM_SAMPLE_BELOW_TWO" });
    expect(strategyContext({ subject, comparisons: [input("C1", { encounterId: 1 })] }, WINDOWS)).toEqual({
      kind: "REFUSED",
      reason: "ALIGNMENT_REFUSED",
    });
  });
});
