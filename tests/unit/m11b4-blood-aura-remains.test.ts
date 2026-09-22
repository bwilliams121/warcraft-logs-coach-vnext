/**
 * M11-B4: the Blood-owned `buff.<name>.remains` derivation, the widened
 * pre-decision window across `.up` / `.stack` / `.remains`, and the threshold
 * tolerance — over synthetic fights and the committed Blood corpus evidence.
 *
 * Negative first: no value from silence; no value through a coverage gap
 * between the gain and the decision; no value from a transition inside the
 * window ahead of the decision (0, 1, 20 and 50 ms leads all refused; 51
 * accepted); no clamping of an expired remainder to zero; no choice between
 * the two readings of a refresh beside a stack removal — only the bound both
 * agree on, and UNKNOWN once that bound has run out; no exact verdict within
 * 50 ms of a pinned threshold; no later removal consulted.
 *
 * RE-PINNED for M11-B8 in two places: a lone Essence of the Blood Queen
 * refresh is of unproven cause (a floor from the earlier gain, never an
 * exact reset), and inside the window Essence's `.remains` binds the floor
 * both orderings share while `.stack` stays refused. Everything else here —
 * Bone Shield, Crimson Scourge, Visceral Strength, the window on `.up` and
 * `.stack`, the tolerance — is unchanged; `m11b8-blood-ebq-remains.test.ts`
 * carries the B8 cases.
 */

import { describe, expect, it } from "vitest";

import {
  BONE_SHIELD_BUFF_SPELL_ID,
  CRIMSON_SCOURGE_BUFF_SPELL_ID,
  ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID,
  VAMPIRIC_STRIKE_BUFF_SPELL_ID,
  VISCERAL_STRENGTH_BUFF_SPELL_ID,
} from "../../src/data/game/deathknight-blood-aura-authority.js";
import { bloodAuraDurationForAtom } from "../../src/data/game/deathknight-blood-aura-durations.js";
import type { HeroTreeResolution, TalentResolution } from "../../src/data/game/talent-selection.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { fromSource } from "../../src/engine/auras/aura-state.js";
import { sourceRef, targetRef } from "../../src/engine/normalization/normalized-events.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import { beforeEvent } from "../../src/engine/state/temporal.js";
import { SIMC_PERMANENT_BUFF_REMAINS_SECONDS } from "../../src/simc/expression/evaluate.js";
import {
  bindBloodAura,
  bindBloodStack,
  BLOOD_PRE_DECISION_WINDOW_MS,
} from "../../src/specs/deathknight/blood/aura-bindings.js";
import {
  bindBloodRemains,
  bindSupportedBloodRemains,
  BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS,
  bloodRemainsBindingsFrom,
  SUPPORTED_BLOOD_REMAINS_ATOMS,
} from "../../src/specs/deathknight/blood/aura-remains.js";
import {
  pinnedBloodRemainsThresholds,
  pinnedRemainsThresholdSecondsFor,
} from "../../src/specs/deathknight/blood/remains-thresholds.js";
import { corpusBundleState, corpusState, positionOfCast } from "../support/corpus/fight.js";
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
const MARROWREND = 195182;
const DEATHS_CARESS = 195292;
const VAMPIRIC_STRIKE = 433895;
const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
const BUNDLE = [
  BLOOD45,
  "wcl-blood-death-knight-a7r6-rotational-165s.seg-45-105",
  "wcl-blood-death-knight-a7r6-rotational-165s.seg-105-165",
];

const selected = (simcName: string): TalentResolution => ({
  simcName,
  selection: "SELECTED",
  reason: "OWN_ENTRY_SELECTED",
  identity: null,
  decidedByEntryId: 1,
});
const notSelected = (simcName: string): TalentResolution => ({
  simcName,
  selection: "NOT_SELECTED",
  reason: "ALTERNATIVE_ENTRY_SELECTED",
  identity: null,
  decidedByEntryId: 2,
});
const SANLAYN: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "sanlayn",
  subTreeId: 31,
  decidedByEntryIds: [117630],
};
const DEATHBRINGER: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "deathbringer",
  subTreeId: 33,
  decidedByEntryIds: [1],
};
const TALENTS: Readonly<Record<string, TalentResolution>> = {
  vampiric_strike: selected("vampiric_strike"),
  visceral_strength: selected("visceral_strength"),
  gift_of_the_sanlayn: selected("gift_of_the_sanlayn"),
  dancing_rune_weapon: selected("dancing_rune_weapon"),
  vampiric_blood: selected("vampiric_blood"),
};

const aura = (
  ordinal: number,
  reportTimeMs: number,
  abilityGameId: number,
  operation: "APPLIED" | "REFRESHED" | "REMOVED",
  stacks: number | null = null,
) =>
  auraEvent({
    ordinal,
    reportTimeMs,
    operation,
    auraClass: "BUFF",
    isStackChange: stacks !== null,
    stacks,
    sourceActorId: ACTOR,
    targetActorId: ACTOR,
    abilityGameId,
  });
const bs = (
  ordinal: number,
  reportTimeMs: number,
  operation: "APPLIED" | "REFRESHED" | "REMOVED",
  stacks: number | null = null,
) => aura(ordinal, reportTimeMs, BONE_SHIELD_BUFF_SPELL_ID, operation, stacks);
const cast = (ordinal: number, reportTimeMs: number, abilityGameId = DEATH_STRIKE) =>
  castEvent({
    ordinal,
    reportTimeMs,
    castPhase: "COMPLETE",
    sourceActorId: ACTOR,
    targetActorId: 22,
    abilityGameId,
  });

/** A synthetic fight long enough for a 30 s aura: complete AURAS and CASTS over [1,000 .. 60,000] ms. */
function stateOf(events: SyntheticFightOptions["events"], options: SyntheticFightOptions = {}) {
  return createCombatState(
    syntheticFight({ observedCategories: ["AURAS", "CASTS"], endTimeMs: 60_000, events, ...options }),
  );
}
const input = (state: CombatState, position: number, heroTree = SANLAYN, talents = TALENTS) => ({
  state,
  actorId: ACTOR,
  position,
  talents,
  heroTree,
});

function at(state: CombatState, reportTimeMs: number, abilityGameId: number): number {
  const found = positionOfCast(state, { actorId: ACTOR, reportTimeMs, abilityGameId });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}

describe("the pinned constants", () => {
  it("keeps the window and the tolerance as two separate 50 ms facts", () => {
    expect(BLOOD_PRE_DECISION_WINDOW_MS).toBe(50);
    expect(BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS).toBe(50);
  });

  it("reads the thresholds off the parsed pinned list: 1.5 and 3 for Bone Shield, 1.5 and 8 for Essence, none for the truth-only atoms", () => {
    expect(pinnedRemainsThresholdSecondsFor("bone_shield")).toEqual([1.5, 3]);
    expect(pinnedRemainsThresholdSecondsFor("essence_of_the_blood_queen")).toEqual([1.5, 8]);
    for (const atom of ["vampiric_strike", "crimson_scourge", "visceral_strength"]) {
      expect(pinnedRemainsThresholdSecondsFor(atom)).toEqual([]);
    }
    expect(
      pinnedBloodRemainsThresholds().map(
        (t) => `${t.at} ${t.atomName} ${t.operator} ${String(t.thresholdSeconds)}`,
      ),
    ).toEqual([
      "deathbringer[4] bone_shield < 3",
      "deathbringer[5] bone_shield < 3",
      "san_gift[0] essence_of_the_blood_queen < 1.5",
      "sanlayn[0] bone_shield < 1.5",
      "sanlayn[1] essence_of_the_blood_queen < 1.5",
      "sanlayn[9] essence_of_the_blood_queen < 8",
    ]);
  });

  it("uses buff.vampiric_strike.remains as a BARE TRUTH only at the pinned revision — the sentinel's comparison semantics are never exercised", () => {
    expect(pinnedBloodRemainsThresholds().some((t) => t.atomName === "vampiric_strike")).toBe(false);
  });
});

describe("exact remains under the FIXED_DURATION_RESET_ON_GAIN model", () => {
  it("Bone Shield: from an application, 30 s minus the elapsed time, in seconds, once", () => {
    const state = stateOf([bs(0, 1000, "APPLIED"), cast(1, 5000)]);
    const binding = bindBloodRemains(input(state, 1), "bone_shield");
    expect(binding).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_EXACT",
      remainsMs: 26_000,
      durationMs: 30_000,
      binding: { state: "KNOWN_NUMBER", value: 26 },
      walkedThrough: 0,
    });
  });

  it("Bone Shield: a stack gain is a full reset; stack losses are walked through without moving the expiry", () => {
    const state = stateOf([
      bs(0, 1000, "APPLIED"),
      bs(1, 4000, "APPLIED", 6),
      bs(2, 4000, "REFRESHED"),
      bs(3, 9000, "REMOVED", 5),
      bs(4, 12_000, "REMOVED", 4),
      cast(5, 20_000),
    ]);
    const binding = bindBloodRemains(input(state, 5), "bone_shield");
    expect(binding).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_EXACT",
      remainsMs: 14_000,
      binding: { state: "KNOWN_NUMBER", value: 14 },
      walkedThrough: 2,
      anchor: { reportTimeMs: 4000 },
    });
  });

  it("Bone Shield: a lone refresh is a full reset", () => {
    const state = stateOf([bs(0, 1000, "APPLIED", 6), bs(1, 10_000, "REFRESHED"), cast(2, 20_000)]);
    expect(bindBloodRemains(input(state, 2), "bone_shield")).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_EXACT",
      remainsMs: 20_000,
      anchor: { reportTimeMs: 10_000, operation: "REFRESHED" },
    });
  });

  it("Essence of the Blood Queen: 25 s (20 s + the 5 s specialization modifier), from apply and stack gain; a lone refresh is not an anchor (M11-B8)", () => {
    const EBQ = ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID;
    const applied = stateOf([aura(0, 1000, EBQ, "APPLIED"), cast(1, 5000)]);
    expect(bindBloodRemains(input(applied, 1), "essence_of_the_blood_queen")).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_EXACT",
      remainsMs: 21_000,
      durationMs: 25_000,
    });
    const gained = stateOf([aura(0, 1000, EBQ, "APPLIED"), aura(1, 3000, EBQ, "APPLIED", 2), cast(2, 5000)]);
    expect(bindBloodRemains(input(gained, 2), "essence_of_the_blood_queen")).toMatchObject({
      proof: "GAIN_ANCHOR_EXACT",
      remainsMs: 23_000,
    });
    // A lone refresh is of unproven cause for this identity: the exact expiry
    // stays the application's, and the refresh can only keep it as a floor.
    const refreshed = stateOf([
      aura(0, 1000, EBQ, "APPLIED"),
      aura(1, 4000, EBQ, "REFRESHED"),
      cast(2, 5000),
    ]);
    expect(bindBloodRemains(input(refreshed, 2), "essence_of_the_blood_queen")).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_BOUNDED",
      remainsMs: 21_000,
      anchor: { reportTimeMs: 1000, operation: "APPLIED" },
      binding: { state: "BOUNDED_NUMBER", atLeast: 21 },
    });
  });

  it("Crimson Scourge: 15 s; Visceral Strength: 12 s", () => {
    const state = stateOf([
      aura(0, 1000, CRIMSON_SCOURGE_BUFF_SPELL_ID, "APPLIED"),
      aura(1, 2000, VISCERAL_STRENGTH_BUFF_SPELL_ID, "APPLIED"),
      cast(2, 5000),
    ]);
    expect(bindBloodRemains(input(state, 2), "crimson_scourge")).toMatchObject({
      remainsMs: 11_000,
      durationMs: 15_000,
    });
    expect(bindBloodRemains(input(state, 2), "visceral_strength")).toMatchObject({
      remainsMs: 9_000,
      durationMs: 12_000,
    });
  });

  it("refuses an expired remainder while M4 says ACTIVE rather than clamping it to zero", () => {
    const state = stateOf([bs(0, 1000, "APPLIED"), cast(1, 40_000)]);
    const binding = bindBloodRemains(input(state, 1), "bone_shield");
    expect(binding).toMatchObject({ state: "UNBOUND", reason: "DURATION_MODEL_CONTRADICTS_EVIDENCE" });
    expect(bloodRemainsBindingsFrom([binding])).toEqual([
      { name: "bone_shield", remainsSeconds: { state: "UNKNOWN_NUMBER", reason: "STATE_NOT_ESTABLISHED" } },
    ]);
  });
});

describe("zero, permanent, and the build proofs", () => {
  it("binds exactly zero from an observed full removal", () => {
    const state = stateOf([bs(0, 1000, "APPLIED", 6), bs(1, 3000, "REMOVED"), cast(2, 5000)]);
    expect(bindBloodRemains(input(state, 2), "bone_shield")).toMatchObject({
      state: "BOUND",
      proof: "PROVEN_INACTIVE",
      binding: { state: "KNOWN_NUMBER", value: 0 },
      anchor: { reportTimeMs: 3000, operation: "REMOVED" },
    });
  });

  it("Vampiric Strike: ACTIVE binds SimulationCraft's permanent sentinel; INACTIVE binds zero", () => {
    const VS = VAMPIRIC_STRIKE_BUFF_SPELL_ID;
    const up = stateOf([aura(0, 1000, VS, "APPLIED"), cast(1, 5000)]);
    expect(bindBloodRemains(input(up, 1), "vampiric_strike")).toMatchObject({
      state: "BOUND",
      proof: "PERMANENT_ACTIVE",
      binding: { state: "KNOWN_NUMBER", value: SIMC_PERMANENT_BUFF_REMAINS_SECONDS },
      durationMs: 0,
    });
    const down = stateOf([aura(0, 1000, VS, "APPLIED"), aura(1, 2000, VS, "REMOVED"), cast(2, 5000)]);
    expect(bindBloodRemains(input(down, 2), "vampiric_strike")).toMatchObject({
      state: "BOUND",
      proof: "PROVEN_INACTIVE",
      binding: { state: "KNOWN_NUMBER", value: 0 },
    });
  });

  it("binds zero from a build proof without any aura stream: talent NOT_SELECTED, or the other hero tree", () => {
    const state = stateOf([cast(0, 5000)]);
    expect(
      bindBloodRemains(
        input(state, 0, SANLAYN, { ...TALENTS, vampiric_strike: notSelected("vampiric_strike") }),
        "vampiric_strike",
      ),
    ).toMatchObject({ state: "BOUND", proof: "TALENT_NOT_SELECTED", binding: { value: 0 } });
    expect(bindBloodRemains(input(state, 0, DEATHBRINGER), "essence_of_the_blood_queen")).toMatchObject({
      state: "BOUND",
      proof: "HERO_TREE_EXCLUDED",
      binding: { value: 0 },
    });
    // Bone Shield has no producing talent and no owning tree: silence is UNKNOWN, never zero.
    expect(bindBloodRemains(input(state, 0), "bone_shield")).toMatchObject({
      state: "UNBOUND",
      reason: "AURA_STATE_UNKNOWN",
    });
  });

  it("binds nothing from silence, and omits unmodelled atoms from the binding list", () => {
    const state = stateOf([cast(0, 5000)]);
    const bindings = bindSupportedBloodRemains(input(state, 0));
    expect(bindings.map((b) => b.atomName)).toEqual([...SUPPORTED_BLOOD_REMAINS_ATOMS]);
    for (const binding of bindings)
      expect(binding).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN" });
    // Every modelled-but-unestablished atom is an EXPLICIT unknown, never absent, never zero.
    expect(bloodRemainsBindingsFrom(bindings).map((b) => b.remainsSeconds.state)).toEqual(
      SUPPORTED_BLOOD_REMAINS_ATOMS.map(() => "UNKNOWN_NUMBER"),
    );
    expect(bindBloodRemains(input(state, 0), "exterminate")).toMatchObject({
      state: "UNBOUND",
      reason: "DURATION_NOT_MODELLED",
    });
    expect(bindBloodRemains(input(state, 0), "not_an_atom")).toMatchObject({
      state: "UNBOUND",
      reason: "IDENTITY_NOT_PINNED",
    });
    expect(bloodRemainsBindingsFrom([bindBloodRemains(input(state, 0), "exterminate")])).toEqual([]);
  });
});

describe("the Bone Shield ambiguous refresh", () => {
  // The corpus shape: a charge consumed at a melee hit, with a refreshbuff beside it.
  const events = [
    bs(0, 1000, "APPLIED"),
    bs(1, 2000, "APPLIED", 7), // the last unambiguous gain
    bs(2, 2000, "REFRESHED"),
    bs(3, 10_000, "REMOVED", 6),
    bs(4, 10_000, "REFRESHED"), // unpinned cause
    bs(5, 15_000, "REMOVED", 5),
  ];

  it("yields only the lower bound both readings agree on", () => {
    const state = stateOf([...events, cast(6, 20_000)]);
    const binding = bindBloodRemains(input(state, 6), "bone_shield");
    expect(binding).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_BOUNDED",
      remainsMs: 12_000,
      binding: { state: "BOUNDED_NUMBER", atLeast: 12, reason: "STATE_NOT_ESTABLISHED" },
      anchor: { reportTimeMs: 2000 },
    });
    // Never the exact 20 s a "reset" reading would give, never the exact 12 s a "no reset" reading would give.
    expect(binding.state === "BOUND" && binding.binding.state).not.toBe("KNOWN_NUMBER");
  });

  it("the bound can still decide the pinned `<1.5` and `<3` FALSE", () => {
    const state = stateOf([...events, cast(6, 28_000)]);
    const binding = bindBloodRemains(input(state, 6), "bone_shield");
    expect(binding).toMatchObject({ state: "BOUND", proof: "GAIN_ANCHOR_BOUNDED", remainsMs: 4000 });
  });

  it("is UNKNOWN once the bound has run out — no inference from the aura still being active", () => {
    const state = stateOf([...events, bs(6, 31_000, "REMOVED", 4), cast(7, 33_000)]);
    const binding = bindBloodRemains(input(state, 7), "bone_shield");
    expect(binding).toMatchObject({ state: "UNBOUND", reason: "AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION" });
    expect(bindBloodAura(input(state, 7), "bone_shield")).toMatchObject({ state: "BOUND", up: true });
  });

  it("is UNKNOWN when the refresh of unpinned cause has no earlier gain to bound from", () => {
    const state = stateOf([bs(0, 10_000, "REMOVED", 6), bs(1, 10_000, "REFRESHED"), cast(2, 20_000)]);
    expect(bindBloodRemains(input(state, 2), "bone_shield")).toMatchObject({
      state: "UNBOUND",
      reason: "NO_GAIN_OBSERVED",
    });
  });

  it("a refresh beside a stack GAIN is not ambiguous: the ordinary companion of a trigger", () => {
    const state = stateOf([
      bs(0, 1000, "APPLIED"),
      bs(1, 10_000, "APPLIED", 8),
      bs(2, 10_000, "REFRESHED"),
      cast(3, 20_000),
    ]);
    expect(bindBloodRemains(input(state, 3), "bone_shield")).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_EXACT",
      remainsMs: 20_000,
    });
  });
});

describe("coverage from the gain", () => {
  it("is UNKNOWN through an AURAS gap between the gain and a later stack loss, though presence is ACTIVE", () => {
    const state = stateOf([bs(0, 1000, "APPLIED", 6), bs(1, 3000, "REMOVED", 5), cast(2, 5000)], {
      categories: {
        AURAS: partialCategory([inclusiveRange(2500, 60_000)]),
        CASTS: observableCategory(inclusiveRange(1000, 60_000)),
      },
    });
    expect(bindBloodAura(input(state, 2), "bone_shield")).toMatchObject({ state: "BOUND", up: true });
    expect(bindBloodRemains(input(state, 2), "bone_shield")).toMatchObject({
      state: "UNBOUND",
      reason: "CONTINUITY_FROM_GAIN_UNKNOWN",
      auraReason: "INSUFFICIENT_COVERAGE",
    });
  });

  it("is UNKNOWN across a transition of unknown ownership", () => {
    const state = stateOf([
      bs(0, 1000, "APPLIED", 6),
      auraEvent({
        ordinal: 1,
        reportTimeMs: 2000,
        operation: "REFRESHED",
        auraClass: "BUFF",
        sourceActorId: null,
        targetActorId: ACTOR,
        abilityGameId: BONE_SHIELD_BUFF_SPELL_ID,
      }),
      cast(2, 5000),
    ]);
    // Presence itself refuses first (M4 will not carry an anchor through an
    // unowned transition); the gain history's own refusal is pinned in
    // m11b4-aura-gain-history.
    expect(bindBloodRemains(input(state, 2), "bone_shield")).toMatchObject({
      state: "UNBOUND",
      reason: "AURA_STATE_UNKNOWN",
      auraReason: "UNSUPPORTED_DERIVATION",
    });
  });

  it("never consults a removal after the decision", () => {
    const state = stateOf([bs(0, 1000, "APPLIED"), cast(1, 5000), bs(2, 5000, "REMOVED")]);
    expect(bindBloodRemains(input(state, 1), "bone_shield")).toMatchObject({
      state: "BOUND",
      remainsMs: 26_000,
    });
  });
});

describe("the pre-decision window, applied to .up, .stack and .remains alike", () => {
  function withLead(leadMs: number) {
    return stateOf([
      bs(0, 1000, "APPLIED", 5),
      bs(1, 5000 - leadMs, "APPLIED", 6),
      bs(2, 5000 - leadMs, "REFRESHED"),
      cast(3, 5000, MARROWREND),
    ]);
  }

  // RE-POINTED for M11-B10: inside the window every EXACT reading stays
  // refused; what binds for Bone Shield is what BOTH orderings leave — the
  // presence M4 proves on both sides, the finite set of exact counts, and
  // the M11-B8 floor — each recording the cluster and its lead.
  it.each([0, 1, 20, 50])(
    "binds only order-invariant state at a %d ms lead, recording the lead",
    (leadMs) => {
      const state = withLead(leadMs);
      expect(bindBloodAura(input(state, 3), "bone_shield")).toMatchObject({
        state: "BOUND",
        up: true,
        proof: "WINDOW_ORDER_INVARIANT_PRESENCE",
      });
      expect(bindBloodStack(input(state, 3), "bone_shield")).toMatchObject({
        state: "BOUND_SET",
        proof: "WINDOW_ORDER_INVARIANT_SET",
        possibleStacks: [5, 6],
        windowOrderInvariance: { cluster: [{ leadMs }, { leadMs }] },
      });
      expect(bindBloodRemains(input(state, 3), "bone_shield")).toMatchObject({
        state: "BOUND",
        proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
        remainsMs: 26_000,
        windowOrderInvariance: {
          cluster: [{ leadMs }, { leadMs }],
          beforeClusterMs: 26_000,
          resetInClusterMs: 30_000 - leadMs,
        },
      });
      expect(bloodRemainsBindingsFrom([bindBloodRemains(input(state, 3), "bone_shield")])).toEqual([
        {
          name: "bone_shield",
          remainsSeconds: { state: "BOUNDED_NUMBER", atLeast: 26, reason: "STATE_NOT_ESTABLISHED" },
        },
      ]);
    },
  );

  it("accepts a 51 ms lead when otherwise valid", () => {
    const state = withLead(51);
    expect(bindBloodAura(input(state, 3), "bone_shield")).toMatchObject({ state: "BOUND", up: true });
    expect(bindBloodStack(input(state, 3), "bone_shield")).toMatchObject({ state: "BOUND", stack: 6 });
    expect(bindBloodRemains(input(state, 3), "bone_shield")).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_EXACT",
      remainsMs: 30_000 - 51,
    });
  });

  it("refuses a REMOVAL inside the window too — the policy is about ordering, not about gains", () => {
    const state = stateOf([bs(0, 1000, "APPLIED", 6), bs(1, 4990, "REMOVED"), cast(2, 5000)]);
    expect(bindBloodRemains(input(state, 2), "bone_shield")).toMatchObject({
      state: "UNBOUND",
      reason: "PRE_DECISION_WINDOW_TRANSITION",
      windowTransition: { leadMs: 10, operation: "REMOVED" },
    });
  });

  it("refuses before the build proofs are consulted only for observed auras: a build-excluded aura binds zero regardless", () => {
    const EBQ = ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID;
    const state = stateOf([aura(0, 5000, EBQ, "APPLIED"), cast(1, 5000, VAMPIRIC_STRIKE)]);
    expect(bindBloodRemains(input(state, 1), "essence_of_the_blood_queen")).toMatchObject({
      state: "UNBOUND",
      reason: "PRE_DECISION_WINDOW_TRANSITION",
    });
    expect(bindBloodRemains(input(state, 1, DEATHBRINGER), "essence_of_the_blood_queen")).toMatchObject({
      state: "BOUND",
      proof: "HERO_TREE_EXCLUDED",
    });
  });
});

describe("the threshold tolerance, for exact remainders only", () => {
  // Bone Shield thresholds 1.5 s and 3 s; a gain at t puts the remainder at 30,000 - (decision - t).
  function boneShieldRemains(remainsMs: number) {
    const gain = 1000;
    return stateOf([bs(0, gain, "APPLIED"), cast(1, gain + 30_000 - remainsMs)]);
  }

  it.each([
    [1500 - 49, 1.5],
    [1500, 1.5],
    [1500 + 49, 1.5],
    [1500 - 50, 1.5],
    [1500 + 50, 1.5],
    [3000 - 49, 3],
    [3000, 3],
    [3000 + 49, 3],
  ])(
    "refuses an exact %d ms remainder as within tolerance of the %d s threshold",
    (remainsMs, thresholdSeconds) => {
      const state = boneShieldRemains(remainsMs);
      const binding = bindBloodRemains(input(state, 1), "bone_shield");
      expect(binding).toMatchObject({
        state: "UNBOUND",
        reason: "WITHIN_TIMING_TOLERANCE_OF_THRESHOLD",
        thresholdMargin: {
          thresholdSeconds,
          remainsMs,
          marginMs: Math.abs(remainsMs - thresholdSeconds * 1000),
        },
      });
    },
  );

  it.each([1500 - 51, 1500 + 51, 3000 - 51, 3000 + 51, 8000])(
    "binds an exact %d ms remainder that is 51 ms or more from every threshold",
    (remainsMs) => {
      const state = boneShieldRemains(remainsMs);
      expect(bindBloodRemains(input(state, 1), "bone_shield")).toMatchObject({
        state: "BOUND",
        proof: "GAIN_ANCHOR_EXACT",
        remainsMs,
      });
    },
  );

  it("does not apply to an atom the list never compares: an 8 s Essence value is within tolerance, a 1.5 s Visceral value is not", () => {
    const EBQ = ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID;
    const essence = stateOf([aura(0, 1000, EBQ, "APPLIED"), cast(1, 1000 + 25_000 - 8000)]);
    expect(bindBloodRemains(input(essence, 1), "essence_of_the_blood_queen")).toMatchObject({
      state: "UNBOUND",
      reason: "WITHIN_TIMING_TOLERANCE_OF_THRESHOLD",
    });
    const visceral = stateOf([
      aura(0, 1000, VISCERAL_STRENGTH_BUFF_SPELL_ID, "APPLIED"),
      cast(1, 1000 + 12_000 - 1500),
    ]);
    expect(bindBloodRemains(input(visceral, 1), "visceral_strength")).toMatchObject({
      state: "BOUND",
      remainsMs: 1500,
    });
  });

  it("does not apply to a bound: a lower bound of exactly 1.5 s is still a bound", () => {
    const state = stateOf([
      bs(0, 1000, "APPLIED", 7),
      bs(1, 10_000, "REMOVED", 6),
      bs(2, 10_000, "REFRESHED"),
      cast(3, 1000 + 30_000 - 1500),
    ]);
    expect(bindBloodRemains(input(state, 3), "bone_shield")).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_BOUNDED",
      remainsMs: 1500,
    });
  });
});

describe("over the committed evidence", () => {
  it("refuses everything about Bone Shield at the pull Death's Caress, whose application is logged 20 ms BEFORE its cast", () => {
    const state = corpusState(BLOOD45);
    const position = at(state, 2_004_615, DEATHS_CARESS);
    const expected = {
      state: "UNBOUND",
      reason: "PRE_DECISION_WINDOW_TRANSITION",
      windowTransition: { leadMs: 20, reportTimeMs: 2_004_595, operation: "APPLIED" },
    };
    expect(bindBloodAura(input(state, position), "bone_shield")).toMatchObject(expected);
    expect(bindBloodStack(input(state, position), "bone_shield")).toMatchObject(expected);
    expect(bindBloodRemains(input(state, position), "bone_shield")).toMatchObject(expected);
  });

  it("refuses every EXACT reading of Essence at a Vampiric Strike whose own Essence transition precedes it, and binds only the floor both orderings share (M11-B8)", () => {
    const state = corpusState(BLOOD45);
    const position = at(state, 2_010_375, VAMPIRIC_STRIKE);
    // The corpus writes `applybuffstack 3` + `refreshbuff` at 2,010,375, lead 0.
    // The count and presence stay refused; the remainder is the minimum of the
    // chain before the cluster (the stack gain at 2,009,578 + 25,000 - 2,010,375
    // = 24,203 ms) and a reset inside it (25,000 ms) — never a KNOWN value.
    // The count is never exact inside the window: since M11-B9 it is the set
    // { 2, 3 } both orderings leave (tests/unit/m11b9-blood-ebq-stack.test.ts).
    expect(bindBloodStack(input(state, position), "essence_of_the_blood_queen")).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [2, 3],
    });
    expect(bindBloodRemains(input(state, position), "essence_of_the_blood_queen")).toMatchObject({
      state: "BOUND",
      proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
      remainsMs: 24_203,
      binding: { state: "BOUNDED_NUMBER", atLeast: 24.203 },
      anchor: { reportTimeMs: 2_009_578, operation: "APPLIED", isStackChange: true },
      windowOrderInvariance: {
        beforeClusterMs: 24_203,
        beforeClusterProof: "GAIN_ANCHOR_EXACT",
        resetInClusterMs: 25_000,
        cluster: [
          { reportTimeMs: 2_010_375, operation: "APPLIED", isStackChange: true, leadMs: 0 },
          { reportTimeMs: 2_010_375, operation: "REFRESHED", isStackChange: false, leadMs: 0 },
        ],
      },
    });
  });

  it("binds the Death Strike at 2,012,014: Essence exact 24,127 ms from the refresh at 2,011,141; Bone Shield a 25,742 ms bound past the refresh of unpinned cause at 2,010,192", () => {
    const state = corpusState(BLOOD45);
    const position = at(state, 2_012_014, DEATH_STRIKE);
    expect(bindBloodRemains(input(state, position), "essence_of_the_blood_queen")).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_EXACT",
      remainsMs: 24_127,
      anchor: { reportTimeMs: 2_011_141 },
      binding: { state: "KNOWN_NUMBER", value: 24.127 },
    });
    expect(bindBloodRemains(input(state, position), "bone_shield")).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_BOUNDED",
      remainsMs: 25_742,
      anchor: { reportTimeMs: 2_007_756 },
      binding: { state: "BOUNDED_NUMBER", atLeast: 25.742 },
    });
  });

  it("binds the exact Bone Shield remainder at the Death Strike at 2,016,527 after the Marrowrend refresh at 2,015,781", () => {
    const state = corpusState(BLOOD45);
    const position = at(state, 2_016_527, DEATH_STRIKE);
    expect(bindBloodRemains(input(state, position), "bone_shield")).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_EXACT",
      remainsMs: 29_254,
      anchor: { reportTimeMs: 2_015_781 },
    });
  });

  it("expiry-consistency audit (validation only): every natural expiry of a modelled aura in the bundle falls within 50 ms of the pinned duration after its last gain", () => {
    // VALIDATION, NOT EVIDENCE. The removal is a FUTURE event relative to every
    // decision the derivation binds; it is read here only to check the pinned
    // duration against what the game did, never to build a decision-time value.
    const state = corpusBundleState(BUNDLE, []);
    const audited: { atom: string; removalMs: number; predictedMs: number; errorMs: number }[] = [];
    // Auras that expire whole and have NO consumer in the pinned module: Essence, Visceral Strength.
    for (const atom of ["essence_of_the_blood_queen", "visceral_strength"] as const) {
      const duration = bloodAuraDurationForAtom(atom);
      if (duration === null) throw new Error(`no duration for ${atom}`);
      const identity = {
        target: targetRef(ACTOR, null),
        abilityGameId: duration.abilityGameId,
        auraClass: "BUFF" as const,
        source: fromSource(sourceRef(ACTOR, null)),
      };
      const track = state.auras.trackFor(identity);
      if (track === null) throw new Error(`no track for ${atom}`);
      for (const position of track.positions) {
        const observation = state.auras.observationAt(position);
        if (observation === null || observation.operation !== "REMOVED" || observation.isStackChange)
          continue;
        const history = state.auras.gainHistoryAt({ ...identity, at: beforeEvent(position) });
        if (history.certainty !== "EXACT") continue;
        const predictedMs = history.value.gain.reportTimeMs + duration.finalDurationMs;
        audited.push({
          atom,
          removalMs: observation.reportTimeMs,
          predictedMs,
          errorMs: observation.reportTimeMs - predictedMs,
        });
      }
    }
    expect(audited.map((row) => [row.atom, row.removalMs, row.errorMs])).toEqual([
      ["essence_of_the_blood_queen", 2_071_379, 6],
      ["visceral_strength", 2_025_543, 12],
      ["visceral_strength", 2_049_534, 11],
      ["visceral_strength", 2_084_467, 8],
      ["visceral_strength", 2_108_764, 1],
      ["visceral_strength", 2_121_645, -7],
      ["visceral_strength", 2_145_407, -1],
    ]);
    for (const row of audited)
      expect(Math.abs(row.errorMs)).toBeLessThanOrEqual(BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS);
  });
});
