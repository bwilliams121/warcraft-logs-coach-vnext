/**
 * M11-B6: `buff.blood_debt.stack` — the exact Blood Debt count from the
 * aura's own observed transitions, and nothing else.
 *
 * The count is the absolute `stack` of the last stack-bearing transition
 * (EXACT_STACK_OBSERVATION), the pinned 1 of a plain application preceded by
 * a removal or by nothing (EXACT_STACK_APPLICATION), or zero from an
 * observed removal (PROVEN_INACTIVE). Everything else — an application to an
 * aura already held, a refresh after the count, a coverage gap, no prior
 * transition, a transition inside the 50 ms pre-decision window, a
 * zero-valued stack removal — is refused with its reason.
 *
 * NEGATIVE CASES FIRST. No count from a Death Strike cast, no `previous + 1`,
 * no zero from the combatantinfo's silence, no reset to 1 for an application
 * that contradicts the fresh-application shape, and Bone Shield / Essence
 * unchanged.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BLOOD_DEBT_BUFF_SPELL_ID,
  BLOOD_DEBT_MAX_STACK,
  bloodAuraIdentityFor,
  BONE_SHIELD_BUFF_SPELL_ID,
  ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID,
} from "../../src/data/game/deathknight-blood-aura-authority.js";
import type { HeroTreeResolution, TalentResolution } from "../../src/data/game/talent-selection.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import type { CombatState } from "../../src/engine/state/combat-state.js";
import {
  BLOOD_PRE_DECISION_WINDOW_MS,
  bindBloodStack,
  bindSupportedBloodStacks,
  bloodStackBindingsFrom,
  EXACT_COUNT_ATOMS,
  SUPPORTED_BLOOD_STACK_ATOMS,
} from "../../src/specs/deathknight/blood/aura-bindings.js";
import { analyzeObservedBloodDeathKnightDecisions } from "../../src/specs/deathknight/blood/observed-analysis.js";
import { BLOOD_DEATH_KNIGHT_REGISTRATION } from "../../src/specs/deathknight/blood/registration.js";
import { BLOOD_DEATH_KNIGHT_SPEC_ID } from "../../src/specs/deathknight/blood/spec.js";
import { corpusBundleState, corpusState, positionOfCast } from "../support/corpus/fight.js";
import { bloodDebtTransitionCensus } from "../support/m11/blood-debt-census.js";
import {
  auraEvent,
  castEvent,
  observableCategory,
  partialCategory,
  syntheticFight,
  type SyntheticFightOptions,
} from "../support/synthetic-fight.js";

const ACTOR = 14;
const DEATH_STRIKE = 49998;
const HEART_STRIKE = 206930;
const DEATHS_CARESS = 195292;
const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
const BUNDLE = [
  BLOOD45,
  "wcl-blood-death-knight-a7r6-rotational-165s.seg-45-105",
  "wcl-blood-death-knight-a7r6-rotational-165s.seg-105-165",
];
const GTKB = "wcl-blood-death-knight-gtkb-opener";

const selected = (simcName: string): TalentResolution => ({
  simcName,
  selection: "SELECTED",
  reason: "OWN_ENTRY_SELECTED",
  identity: null,
  decidedByEntryId: 1,
});
const SANLAYN: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "sanlayn",
  subTreeId: 31,
  decidedByEntryIds: [117630],
};
const TALENTS: Readonly<Record<string, TalentResolution>> = {
  vampiric_strike: selected("vampiric_strike"),
  gift_of_the_sanlayn: selected("gift_of_the_sanlayn"),
};

type Op = "APPLIED" | "REFRESHED" | "REMOVED";
const aura = (
  ordinal: number,
  reportTimeMs: number,
  operation: Op,
  stacks: number | null,
  abilityGameId = BLOOD_DEBT_BUFF_SPELL_ID,
  isStackChange = stacks !== null,
) =>
  auraEvent({
    ordinal,
    reportTimeMs,
    operation,
    auraClass: "BUFF",
    isStackChange,
    stacks,
    sourceActorId: ACTOR,
    targetActorId: ACTOR,
    abilityGameId,
  });
const cast = (ordinal: number, reportTimeMs: number, abilityGameId = DEATH_STRIKE) =>
  castEvent({
    ordinal,
    reportTimeMs,
    castPhase: "COMPLETE",
    sourceActorId: ACTOR,
    targetActorId: 22,
    abilityGameId,
  });

function stateOf(
  events: ReturnType<typeof auraEvent | typeof castEvent>[],
  extra: Partial<SyntheticFightOptions> = {},
): CombatState {
  return createCombatState(
    syntheticFight({ observedCategories: ["AURAS", "CASTS"], endTimeMs: 60_000, events, ...extra }),
  );
}
const input = (state: CombatState, position: number) => ({
  state,
  actorId: ACTOR,
  position,
  talents: TALENTS,
  heroTree: SANLAYN,
});
const bloodDebt = (state: CombatState, position: number) =>
  bindBloodStack(input(state, position), "blood_debt");

function at(state: CombatState, reportTimeMs: number, abilityGameId: number): number {
  const found = positionOfCast(state, { actorId: ACTOR, reportTimeMs, abilityGameId });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}

function analyzed(state: CombatState) {
  const analysis = analyzeObservedBloodDeathKnightDecisions({
    state,
    actorId: ACTOR,
    specId: BLOOD_DEATH_KNIGHT_SPEC_ID,
    targetActorId: null,
    authority: BLOOD_DEATH_KNIGHT_REGISTRATION.authority,
  });
  if (analysis.status !== "ANALYZED") throw new Error(`expected ANALYZED, got ${analysis.status}`);
  return analysis;
}

describe("the pinned Blood Debt identity", () => {
  it("carries the exact-count rule with an application stack of 1, and is one of the three atoms the rule covers", () => {
    const identity = bloodAuraIdentityFor("blood_debt");
    // M11-B9 added the two switches; both stay off for Blood Debt and Bone Shield.
    expect(identity?.exactCount).toEqual({
      applicationStack: 1,
      maxStackGuard: false,
      windowOrderInvariantSet: false,
    });
    expect(identity?.producedByTalent).toBeNull();
    expect(identity?.ownedByHeroTree).toBeNull();
    expect(BLOOD_DEBT_MAX_STACK).toBe(10);
    expect(EXACT_COUNT_ATOMS).toEqual(["bone_shield", "essence_of_the_blood_queen", "blood_debt"]);
    // RE-POINTED for M11-B10: Bone Shield admits the window set; its
    // application count stays unpinned and its maximum stays unguarded.
    expect(bloodAuraIdentityFor("bone_shield")?.exactCount).toEqual({
      applicationStack: null,
      maxStackGuard: false,
      windowOrderInvariantSet: true,
    });
    expect(bloodAuraIdentityFor("essence_of_the_blood_queen")?.exactCount).toEqual({
      applicationStack: 1,
      maxStackGuard: true,
      windowOrderInvariantSet: true,
    });
    expect([...SUPPORTED_BLOOD_STACK_ATOMS]).toEqual([
      "bone_shield",
      "essence_of_the_blood_queen",
      "blood_debt",
    ]);
  });

  it("pins the producer, the consumer, the initial stack, the maximum and the permanence from the class module", () => {
    const claims = bloodAuraIdentityFor("blood_debt")?.claims.map((claim) => claim.symbol) ?? [];
    expect(claims).toContain("death_strike_t::execute");
    expect(claims).toContain("marrowrend_t::execute");
    expect(claims.some((symbol) => symbol.includes("_resolve_stacks"))).toBe(true);
    expect(claims.some((symbol) => symbol.includes("set_max_stack"))).toBe(true);
  });
});

describe("explicit counts", () => {
  it("binds 2 from an applybuffstack carrying 2, read as the absolute count", () => {
    const state = stateOf([aura(0, 1000, "APPLIED", null), aura(1, 2000, "APPLIED", 2), cast(2, 3000)]);
    const binding = bloodDebt(state, 2);
    expect(binding).toMatchObject({ state: "BOUND", stack: 2, proof: "EXACT_STACK_OBSERVATION" });
    if (binding.state !== "BOUND") return;
    expect(binding.anchor).toMatchObject({ reportTimeMs: 2000, operation: "APPLIED", isStackChange: true });
    expect(binding.anchor?.locator).toBeDefined();
  });

  it("binds an intermediate count and the maximum exactly as written, never previous + 1", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", null),
      aura(1, 2000, "APPLIED", 2),
      // The wire says 7 after a gap the log did not explain: 7 it is, not 3.
      aura(2, 3000, "APPLIED", 7),
      cast(3, 4000),
      aura(4, 5000, "APPLIED", 10),
      cast(5, 6000, HEART_STRIKE),
    ]);
    expect(bloodDebt(state, 3)).toMatchObject({ state: "BOUND", stack: 7 });
    expect(bloodDebt(state, 5)).toMatchObject({
      state: "BOUND",
      stack: 10,
      proof: "EXACT_STACK_OBSERVATION",
    });
  });

  it("does not add a stack for a Death Strike that produced no transition", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", 4),
      cast(1, 2000, DEATH_STRIKE),
      cast(2, 3000, DEATH_STRIKE),
      cast(3, 4000, HEART_STRIKE),
    ]);
    expect(bloodDebt(state, 3)).toMatchObject({ state: "BOUND", stack: 4 });
  });
});

describe("the fresh-application clause", () => {
  it("binds 1 from a plain applybuff that opens the track", () => {
    const state = stateOf([cast(0, 500), aura(1, 1000, "APPLIED", null), cast(2, 2000)]);
    const binding = bloodDebt(state, 2);
    expect(binding).toMatchObject({ state: "BOUND", stack: 1, proof: "EXACT_STACK_APPLICATION" });
    if (binding.state !== "BOUND") return;
    expect(binding.anchor).toMatchObject({ reportTimeMs: 1000, operation: "APPLIED", isStackChange: false });
    expect(binding.basis).toContain("no transition of this identity precedes it");
  });

  it("binds 1 from a plain applybuff that follows an observed removebuff", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", 10),
      aura(1, 2000, "REMOVED", null),
      aura(2, 3000, "APPLIED", null),
      cast(3, 4000),
    ]);
    const binding = bloodDebt(state, 3);
    expect(binding).toMatchObject({ state: "BOUND", stack: 1, proof: "EXACT_STACK_APPLICATION" });
    if (binding.state !== "BOUND") return;
    expect(binding.basis).toContain("the removal at 2000");
  });

  it("refuses a plain applybuff while the aura was already held — no reset, no carry, no increment", () => {
    const state = stateOf([aura(0, 1000, "APPLIED", 4), aura(1, 2000, "APPLIED", null), cast(2, 3000)]);
    const binding = bloodDebt(state, 2);
    expect(binding).toMatchObject({ state: "UNBOUND", reason: "APPLICATION_WHILE_ACTIVE_UNPINNED" });
    if (binding.state !== "UNBOUND") return;
    expect(binding.detail).toContain("already held");
    expect(bloodStackBindingsFrom([binding])).toEqual([]);
  });

  it("refuses a plain applybuff after a positive stack removal, which also shows the aura held", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", 4),
      aura(1, 2000, "REMOVED", 3),
      aura(2, 3000, "APPLIED", null),
      cast(3, 4000),
    ]);
    expect(bloodDebt(state, 3)).toMatchObject({
      state: "UNBOUND",
      reason: "APPLICATION_WHILE_ACTIVE_UNPINNED",
    });
  });

  it("refuses a plain applybuff after another plain applybuff", () => {
    const state = stateOf([aura(0, 1000, "APPLIED", null), aura(1, 2000, "APPLIED", null), cast(2, 3000)]);
    expect(bloodDebt(state, 2)).toMatchObject({
      state: "UNBOUND",
      reason: "APPLICATION_WHILE_ACTIVE_UNPINNED",
    });
  });

  it("is Blood Debt's alone: a Bone Shield plain application after a removal stays ambiguous, as before", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", 6, BONE_SHIELD_BUFF_SPELL_ID),
      aura(1, 2000, "REMOVED", null, BONE_SHIELD_BUFF_SPELL_ID),
      aura(2, 3000, "APPLIED", null, BONE_SHIELD_BUFF_SPELL_ID),
      cast(3, 4000),
    ]);
    expect(bindBloodStack(input(state, 3), "bone_shield")).toMatchObject({
      state: "UNBOUND",
      reason: "COUNT_AMBIGUOUS_SINCE_OBSERVATION",
    });
    const opened = stateOf([aura(0, 1000, "APPLIED", null, BONE_SHIELD_BUFF_SPELL_ID), cast(1, 2000)]);
    expect(bindBloodStack(input(opened, 1), "bone_shield")).toMatchObject({
      state: "UNBOUND",
      reason: "NO_STACK_OBSERVATION",
    });
  });
});

describe("removal and the ambiguous shapes", () => {
  it("binds 0 from an observed removebuff under PROVEN_INACTIVE", () => {
    const state = stateOf([aura(0, 1000, "APPLIED", 10), aura(1, 2000, "REMOVED", null), cast(2, 3000)]);
    const binding = bloodDebt(state, 2);
    expect(binding).toMatchObject({ state: "BOUND", stack: 0, proof: "PROVEN_INACTIVE" });
    if (binding.state !== "BOUND") return;
    expect(binding.anchor).toBeNull();
  });

  it("refuses a refreshbuff after the last count", () => {
    const state = stateOf([aura(0, 1000, "APPLIED", 5), aura(1, 2000, "REFRESHED", null), cast(2, 3000)]);
    expect(bloodDebt(state, 2)).toMatchObject({
      state: "UNBOUND",
      reason: "COUNT_AMBIGUOUS_SINCE_OBSERVATION",
    });
  });

  it("refuses a refreshbuff after a plain application: the anchor is no longer the application", () => {
    const state = stateOf([aura(0, 1000, "APPLIED", null), aura(1, 2000, "REFRESHED", null), cast(2, 3000)]);
    const binding = bloodDebt(state, 2);
    expect(binding.state).toBe("UNBOUND");
    expect(binding.state === "UNBOUND" && binding.reason).not.toBe("APPLICATION_WHILE_ACTIVE_UNPINNED");
    expect(bloodStackBindingsFrom([binding])).toEqual([]);
  });

  it("fails closed on a zero-valued stack removal: neither zero nor a positive count", () => {
    const state = stateOf([aura(0, 1000, "APPLIED", 3), aura(1, 2000, "REMOVED", 0), cast(2, 3000)]);
    const binding = bloodDebt(state, 2);
    expect(binding.state).toBe("UNBOUND");
    expect(bloodStackBindingsFrom([binding])).toEqual([]);
  });

  it("binds a positive stack removal's resulting count under the M4 absolute-stack contract", () => {
    const state = stateOf([aura(0, 1000, "APPLIED", 5), aura(1, 2000, "REMOVED", 3), cast(2, 3000)]);
    expect(bloodDebt(state, 2)).toMatchObject({ state: "BOUND", stack: 3, proof: "EXACT_STACK_OBSERVATION" });
  });
});

describe("coverage and the window", () => {
  it("is UNKNOWN before the first observed transition, and does not read silence as zero", () => {
    const state = stateOf([cast(0, 1000), cast(1, 2000), aura(2, 2040, "APPLIED", null)]);
    expect(bloodDebt(state, 0)).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN" });
    expect(bloodDebt(state, 1)).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN" });
  });

  it("is UNKNOWN across an AURAS coverage gap after the stack anchor", () => {
    const state = stateOf([aura(0, 1000, "APPLIED", 6), cast(1, 5000)], {
      categories: {
        AURAS: partialCategory([inclusiveRange(1000, 2500)]),
        CASTS: observableCategory(inclusiveRange(1000, 60_000)),
      },
    });
    const binding = bloodDebt(state, 1);
    expect(binding).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN" });
    if (binding.state !== "UNBOUND") return;
    expect(binding.detail).toBe("INSUFFICIENT_COVERAGE");
  });

  it("refuses a transition at lead 0 and at lead 50, and accepts one at lead 51 (inclusive Blood window)", () => {
    expect(BLOOD_PRE_DECISION_WINDOW_MS).toBe(50);
    for (const [lead, expected] of [
      [0, "UNBOUND"],
      [50, "UNBOUND"],
      [51, "BOUND"],
    ] as const) {
      const state = stateOf([aura(0, 1000, "APPLIED", 3), aura(1, 5000 - lead, "APPLIED", 4), cast(2, 5000)]);
      const binding = bloodDebt(state, 2);
      expect(binding.state, `lead ${String(lead)}`).toBe(expected);
      if (binding.state === "UNBOUND") {
        expect(binding.reason).toBe("PRE_DECISION_WINDOW_TRANSITION");
        expect(binding.windowTransition?.leadMs).toBe(lead);
      } else {
        expect(binding.state === "BOUND" && binding.stack).toBe(4);
      }
    }
  });
});

describe("isolation", () => {
  it("binds Essence's absolute count beside Blood Debt's, and Bone Shield's count rule as it was (M11-B9 re-pin)", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", 4, ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID),
      aura(1, 1100, "APPLIED", 6, BONE_SHIELD_BUFF_SPELL_ID),
      aura(2, 1100, "REFRESHED", null, BONE_SHIELD_BUFF_SPELL_ID),
      aura(3, 1200, "APPLIED", 5),
      cast(4, 3000),
    ]);
    const bindings = bindSupportedBloodStacks(input(state, 4));
    expect(bloodStackBindingsFrom(bindings)).toEqual([
      { name: "bone_shield", stack: 6 },
      { name: "essence_of_the_blood_queen", stack: 4 },
      { name: "blood_debt", stack: 5 },
    ]);
    expect(bindings.find((b) => b.atomName === "essence_of_the_blood_queen")).toMatchObject({
      state: "BOUND",
      stack: 4,
      proof: "EXACT_STACK_OBSERVATION",
    });
  });

  it("computes nothing: the Blood binding source carries no stack arithmetic, cap or cast-based inference", () => {
    const code = readFileSync("src/specs/deathknight/blood/aura-bindings.ts", "utf8");
    for (const forbidden of [
      "observedStacks + 1",
      "stack + 1",
      "stacks + 1",
      "observedStacks - 1",
      "stack - 1",
      "Math.min(",
      "Math.max(",
      "BLOOD_DEBT_MAX_STACK",
      "DEATH_STRIKE",
      "49998",
      "mid2",
      "combatantInfo",
      "setID",
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });
});

describe("the committed Blood corpus", () => {
  const bundle = corpusBundleState(BUNDLE, []);
  const opener = corpusState(GTKB);

  it("reads 3 at the Heart Strike at 2,050,290 from the applybuffstack at 2,049,345", () => {
    const binding = bloodDebt(bundle, at(bundle, 2050290, HEART_STRIKE));
    expect(binding).toMatchObject({ state: "BOUND", stack: 3, proof: "EXACT_STACK_OBSERVATION" });
    if (binding.state !== "BOUND") return;
    expect(binding.anchor?.reportTimeMs).toBe(2049345);
  });

  it("reads 1 at the Heart Strike at 2,044,779 from the plain applybuff at 2,044,041 after the removal at 2,043,229", () => {
    const binding = bloodDebt(bundle, at(bundle, 2044779, HEART_STRIKE));
    expect(binding).toMatchObject({ state: "BOUND", stack: 1, proof: "EXACT_STACK_APPLICATION" });
    if (binding.state !== "BOUND") return;
    expect(binding.anchor?.reportTimeMs).toBe(2044041);
    expect(binding.basis).toContain("the removal at 2043229");
  });

  it("reads 10 at the Death Strike at 2,035,940, and nothing at the pull's Death's Caress", () => {
    expect(bloodDebt(bundle, at(bundle, 2035940, DEATH_STRIKE))).toMatchObject({ state: "BOUND", stack: 10 });
    expect(bloodDebt(bundle, at(bundle, 2004615, DEATHS_CARESS))).toMatchObject({
      state: "UNBOUND",
      reason: "AURA_STATE_UNKNOWN",
    });
    expect(bloodDebt(bundle, at(bundle, 2044021, DEATH_STRIKE))).toMatchObject({
      state: "BOUND",
      stack: 0,
      proof: "PROVEN_INACTIVE",
    });
  });

  it("reads 6 at the opener's last Heart Strike and nothing at its first Death Strike", () => {
    expect(bloodDebt(opener, at(opener, 2434890, HEART_STRIKE))).toMatchObject({ state: "BOUND", stack: 6 });
    expect(bloodDebt(opener, at(opener, 2421923, DEATH_STRIKE))).toMatchObject({
      state: "UNBOUND",
      reason: "AURA_STATE_UNKNOWN",
    });
  });

  it("takes the transition census: only the shapes the pinned mechanics describe, written after their cause", () => {
    const analysis = analyzed(bundle);
    const census = bloodDebtTransitionCensus(
      bundle,
      ACTOR,
      analysis.comparisons.map((entry) => entry.decision.reportTimeMs),
    );
    expect(census.transitions).toEqual({
      applybuff: 3,
      applybuffstack: 26,
      refreshbuff: 0,
      removebuffstack: 0,
      removebuff: 2,
    });
    expect(census.stackValues.filter((value) => value !== null)).toEqual([
      ...[2, 3, 4, 5, 6, 7, 8, 9, 10],
      ...[2, 3, 4, 5, 6, 7, 8, 9, 10],
      ...[2, 3, 4, 5, 6, 7, 8, 9],
    ]);
    expect(census.sameMillisecondPairs).toBe(0);
    // Every gain follows a Death Strike, every removal a Marrowrend — by 10 to 49 ms.
    expect(census.precedingOwnCast).toEqual({ "49998": 29, "195182": 2 });
    expect(census.lagMs).toEqual({ min: 10, max: 49 });
    expect(census.lagMs.min).toBeGreaterThan(0);
    // The next eligible decision is at least a GCD away: the 50 ms window never sees a Blood Debt transition.
    expect(census.minGapToNextDecisionMs).toBe(702);
    expect(census.minGapToNextDecisionMs).toBeGreaterThan(BLOOD_PRE_DECISION_WINDOW_MS);
    expect(analysis.coverage.preDecisionWindowRefusals.some((row) => row.key.startsWith("blood_debt"))).toBe(
      false,
    );
  });

  it("validates the pinned model retrospectively: every later observation agrees with the state bound before it", () => {
    for (const [state, expectedPoints] of [
      [bundle, 30],
      [opener, 5],
    ] as const) {
      const analysis = analyzed(state);
      const census = bloodDebtTransitionCensus(
        state,
        ACTOR,
        analysis.comparisons.map((entry) => entry.decision.reportTimeMs),
      );
      const transitionCount = Object.values(census.transitions).reduce((sum, count) => sum + count, 0);
      // Derived: one validation point per transition after the first.
      expect(census.validation.points).toBe(transitionCount - 1);
      expect(census.validation.points).toBe(expectedPoints);
      expect(census.validation.consistent).toBe(census.validation.points);
      expect(census.validation.inconsistent).toEqual([]);
    }
  });

  it("distributes the Blood Debt evidence over the 123 bundle decisions and the 21 opener decisions exactly so", () => {
    const rows = (state: CombatState) =>
      Object.fromEntries(
        analyzed(state)
          .coverage.stackEvidence.filter((row) => row.key.startsWith("blood_debt"))
          .map((row) => [row.key, row.count]),
      );
    expect(rows(bundle)).toEqual({
      "blood_debt | EXACT_STACK_OBSERVATION": 107,
      "blood_debt | EXACT_STACK_APPLICATION": 7,
      "blood_debt | PROVEN_INACTIVE": 3,
      "blood_debt | AURA_STATE_UNKNOWN": 6,
    });
    expect(rows(opener)).toEqual({
      "blood_debt | EXACT_STACK_OBSERVATION": 14,
      "blood_debt | EXACT_STACK_APPLICATION": 1,
      "blood_debt | AURA_STATE_UNKNOWN": 6,
    });
  });
});
