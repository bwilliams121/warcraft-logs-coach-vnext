/**
 * M11-B10: Bone Shield inside the 50 ms pre-decision window — the finite
 * set of EVERY exact count the decision's position among its own stack
 * gains leaves, the presence M4 proves on BOTH sides of that cluster, and
 * the M11-B8 order-invariant floor switched on for the identity.
 *
 * Negative first: a lone refresh, a removal, a plain application, a
 * non-ascending count or an H1 that is not exact refuses; a first
 * application in the track has AMBIGUOUS_INITIAL_STATE before it and
 * refuses every proof (no zero from silence, no set, no presence); a
 * proven removal before a plain Bone Shield application still binds no
 * count (the producer's number is not pinned); presence never comes from a
 * count; no ordering is chosen; no `<6` or `<=1` lives in Blood code — the
 * evaluator decides; Essence's single-gain sets and Blood Debt's exact
 * counts are byte-identical.
 */

import { describe, expect, it } from "vitest";

import {
  BLOOD_AURA_IDENTITIES,
  bloodAuraIdentityFor,
  BLOOD_DEBT_BUFF_SPELL_ID,
  BONE_SHIELD_BUFF_SPELL_ID,
  ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID,
} from "../../src/data/game/deathknight-blood-aura-authority.js";
import { bloodAuraDurationForAtom } from "../../src/data/game/deathknight-blood-aura-durations.js";
import type { HeroTreeResolution, TalentResolution } from "../../src/data/game/talent-selection.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import {
  evaluateSimcExpression,
  type AtomBindings,
  unknownNumber,
} from "../../src/simc/expression/evaluate.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  bindBloodAura,
  bindBloodStack,
  BLOOD_PRE_DECISION_WINDOW_MS,
  bloodBuffBindingsFrom,
  bloodStackBindingsFrom,
} from "../../src/specs/deathknight/blood/aura-bindings.js";
import {
  bindBloodRemains,
  bloodRemainsBindingsFrom,
} from "../../src/specs/deathknight/blood/aura-remains.js";
import { corpusBundleState, corpusState, positionOfCast } from "../support/corpus/fight.js";
import {
  auraEvent,
  castEvent,
  syntheticFight,
  type SyntheticFightOptions,
} from "../support/synthetic-fight.js";

const ACTOR = 14;
const BS = BONE_SHIELD_BUFF_SPELL_ID;
const BS_ATOM = "bone_shield";
const MARROWREND = 195182;
const DEATHS_CARESS = 195292;
const DEATH_STRIKE = 49998;
const VAMPIRIC_STRIKE = 433895;
const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
const OPENER = "wcl-blood-death-knight-gtkb-opener";
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
  decidedByEntryId: 117662,
});
const SANLAYN: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "sanlayn",
  subTreeId: 31,
  decidedByEntryIds: [117630],
};
const TALENTS: Readonly<Record<string, TalentResolution>> = {
  vampiric_strike: selected("vampiric_strike"),
  visceral_strength: selected("visceral_strength"),
  gift_of_the_sanlayn: selected("gift_of_the_sanlayn"),
  frenzied_bloodthirst: selected("frenzied_bloodthirst"),
};

type Operation = "APPLIED" | "REFRESHED" | "REMOVED";
const aura = (
  ordinal: number,
  reportTimeMs: number,
  operation: Operation,
  stacks: number | null = null,
  abilityGameId = BS,
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
const cast = (ordinal: number, reportTimeMs: number, abilityGameId = MARROWREND) =>
  castEvent({
    ordinal,
    reportTimeMs,
    castPhase: "COMPLETE",
    sourceActorId: ACTOR,
    targetActorId: 22,
    abilityGameId,
  });

function stateOf(events: SyntheticFightOptions["events"], options: SyntheticFightOptions = {}) {
  return createCombatState(
    syntheticFight({ observedCategories: ["AURAS", "CASTS"], endTimeMs: 90_000, events, ...options }),
  );
}
const input = (state: CombatState, position: number) => ({
  state,
  actorId: ACTOR,
  position,
  talents: TALENTS,
  heroTree: SANLAYN,
});
const stackAt = (state: CombatState, position: number, atomName = BS_ATOM) =>
  bindBloodStack(input(state, position), atomName);
const upAt = (state: CombatState, position: number, atomName = BS_ATOM) =>
  bindBloodAura(input(state, position), atomName);
const remainsAt = (state: CombatState, position: number, atomName = BS_ATOM) =>
  bindBloodRemains(input(state, position), atomName);

function at(state: CombatState, reportTimeMs: number, abilityGameId: number): number {
  const found = positionOfCast(state, { actorId: ACTOR, reportTimeMs, abilityGameId });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}

/** A Marrowrend's own gains: `count` ascending applybuffstack at `5000 - leadMs`, each after the first with a companion refresh. */
function marrowrendCluster(
  leadMs: number,
  from: number,
  gains: number,
  options: { companions?: boolean } = {},
) {
  const events: (ReturnType<typeof aura> | ReturnType<typeof cast>)[] = [aura(0, 1000, "APPLIED", from)];
  let ordinal = 1;
  for (let index = 1; index <= gains; index += 1) {
    events.push(aura(ordinal++, 5000 - leadMs, "APPLIED", from + index));
    if (index > 1 && options.companions !== false) events.push(aura(ordinal++, 5000 - leadMs, "REFRESHED"));
  }
  events.push(cast(ordinal, 5000));
  return { state: stateOf(events), position: ordinal };
}

const REFUSED = { state: "UNBOUND", reason: "PRE_DECISION_WINDOW_TRANSITION" } as const;

function truthOf(expression: string, atoms: AtomBindings): boolean | "UNRESOLVED" | "UNSUPPORTED" {
  const parsed = parseSimcExpression(expression);
  if (!parsed.ok) throw new Error(parsed.reason);
  const result = evaluateSimcExpression(parsed.ast, expression, atoms);
  return result.outcome === "RESOLVED" ? result.value : result.outcome;
}
function bindingsOf(state: CombatState, position: number): AtomBindings {
  return {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: bloodBuffBindingsFrom([upAt(state, position)]),
    knownBuffStacks: bloodStackBindingsFrom([stackAt(state, position)]),
    knownBuffRemainsSeconds: bloodRemainsBindingsFrom([remainsAt(state, position)]),
  };
}

describe("the Bone Shield identity after M11-B10", () => {
  it("admits the window set, the window presence and the M11-B8 window bound; pins no application count and guards no maximum", () => {
    const identity = bloodAuraIdentityFor(BS_ATOM);
    expect(identity?.abilityGameId).toBe(195181);
    expect(identity?.exactCount).toEqual({
      applicationStack: null,
      maxStackGuard: false,
      windowOrderInvariantSet: true,
    });
    expect(identity?.remainsPolicy).toEqual({
      loneRefresh: "PINNED_TRIGGER_RESET",
      windowOrderInvariantBound: true,
    });
    expect(identity?.presencePolicy).toEqual({ windowOrderInvariant: true });
    expect(bloodAuraDurationForAtom(BS_ATOM)).toMatchObject({ finalDurationMs: 30_000, maxStack: 10 });
    expect(BLOOD_PRE_DECISION_WINDOW_MS).toBe(50);
  });

  it("no other identity admits the window presence", () => {
    for (const identity of BLOOD_AURA_IDENTITIES) {
      expect(identity.presencePolicy.windowOrderInvariant, identity.atomName).toBe(
        identity.atomName === BS_ATOM,
      );
    }
  });
});

describe("the prefix set: every exact count the decision's position among its own gains leaves", () => {
  it.each([
    [1, 0],
    [1, 1],
    [1, 50],
    [2, 0],
    [2, 1],
    [2, 50],
    [3, 0],
    [3, 1],
    [3, 50],
  ])(
    "%d gain(s) at a %d ms lead: { H1, c1, ..., cn }, both ends recorded, no ordering chosen",
    (gains, leadMs) => {
      const { state, position } = marrowrendCluster(leadMs, 5, gains);
      const expected = Array.from({ length: gains + 1 }, (_, index) => 5 + index);
      const binding = stackAt(state, position);
      expect(binding).toMatchObject({
        state: "BOUND_SET",
        proof: "WINDOW_ORDER_INVARIANT_SET",
        possibleStacks: expected,
        anchor: { reportTimeMs: 1000, operation: "APPLIED" },
        windowOrderInvariance: {
          beforeClusterStack: 5,
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: 5 + gains,
        },
      });
      if (binding.state === "BOUND_SET") {
        for (const transition of binding.windowOrderInvariance.cluster)
          expect(transition.leadMs).toBe(leadMs);
        expect(binding.windowOrderInvariance.cluster.filter((t) => t.operation === "APPLIED")).toHaveLength(
          gains,
        );
      }
      // The seam receives the whole set as ONE_OF_NUMBERS.
      expect(bloodStackBindingsFrom([binding])).toEqual([
        {
          name: BS_ATOM,
          stack: { state: "ONE_OF_NUMBERS", values: expected, reason: "STATE_NOT_ESTABLISHED" },
        },
      ]);
    },
  );

  it("three gains: { 7, 8, 9, 10 } — the intermediate worlds 8 and 9 are members, never dropped for { 7, 10 }", () => {
    const { state, position } = marrowrendCluster(0, 7, 3);
    expect(stackAt(state, position)).toMatchObject({ state: "BOUND_SET", possibleStacks: [7, 8, 9, 10] });
  });

  it("at a 51 ms lead the ordinary rule reads the exact count: no set", () => {
    const { state, position } = marrowrendCluster(51, 5, 3);
    expect(stackAt(state, position)).toMatchObject({
      state: "BOUND",
      stack: 8,
      proof: "EXACT_STACK_OBSERVATION",
    });
    expect(upAt(state, position)).toMatchObject({ state: "BOUND", up: true, proof: "OBSERVED" });
    expect(remainsAt(state, position)).toMatchObject({ state: "BOUND", proof: "GAIN_ANCHOR_EXACT" });
  });

  it("gains without companion refreshes bind the same set: the companions are permitted, not required", () => {
    const { state, position } = marrowrendCluster(0, 5, 3, { companions: false });
    expect(stackAt(state, position)).toMatchObject({ state: "BOUND_SET", possibleStacks: [5, 6, 7, 8] });
  });

  it("a Death's Caress gain writes one applybuffstack with the resulting count: { 9, 11 } — no 10 is invented", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", 9),
      aura(1, 5000, "APPLIED", 11),
      aura(2, 5000, "REFRESHED"),
      cast(3, 5000, DEATHS_CARESS),
    ]);
    expect(stackAt(state, 3)).toMatchObject({ state: "BOUND_SET", possibleStacks: [9, 11] });
  });
});

describe("H1: the ordinary exact count at the cluster's first position", () => {
  it("from an applybuffstack, from a removebuffstack, and from a companion-refreshed gain", () => {
    const fromGain = stateOf([aura(0, 1000, "APPLIED", 6), aura(1, 5000, "APPLIED", 7), cast(2, 5000)]);
    expect(stackAt(fromGain, 2)).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [6, 7],
      windowOrderInvariance: { beforeClusterProof: "EXACT_STACK_OBSERVATION" },
      anchor: { reportTimeMs: 1000, operation: "APPLIED", isStackChange: true },
    });
    const fromRemoval = stateOf([
      aura(0, 1000, "APPLIED", 8),
      aura(1, 3000, "REMOVED", 7),
      aura(2, 5000, "APPLIED", 8),
      aura(3, 5000, "APPLIED", 9),
      aura(4, 5000, "REFRESHED"),
      cast(5, 5000),
    ]);
    expect(stackAt(fromRemoval, 5)).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [7, 8, 9],
      anchor: { reportTimeMs: 3000, operation: "REMOVED", isStackChange: true },
    });
    const fromCompanioned = stateOf([
      aura(0, 1000, "APPLIED", 8),
      aura(1, 2000, "APPLIED", 9),
      aura(2, 2000, "REFRESHED"),
      aura(3, 5000, "APPLIED", 11),
      aura(4, 5000, "REFRESHED"),
      cast(5, 5000, DEATHS_CARESS),
    ]);
    expect(stackAt(fromCompanioned, 5)).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [9, 11],
      anchor: { reportTimeMs: 2000 },
    });
  });

  it("H1 ambiguous: a lone refresh before the cluster refuses (the count is not carried across it)", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", 6),
      aura(1, 3000, "REFRESHED"),
      aura(2, 5000, "APPLIED", 7),
      cast(3, 5000),
    ]);
    const binding = stackAt(state, 3);
    expect(binding).toMatchObject(REFUSED);
    expect(binding.state === "UNBOUND" && binding.detail).toContain("COUNT_AMBIGUOUS_SINCE_OBSERVATION");
    expect(bloodStackBindingsFrom([binding])).toEqual([]);
  });

  it("H1 is never read from silence: the cluster's gain as the first transition in the track refuses", () => {
    const state = stateOf([cast(0, 4000, DEATH_STRIKE), aura(1, 5000, "APPLIED", 8), cast(2, 5000)]);
    const binding = stackAt(state, 2);
    expect(binding).toMatchObject(REFUSED);
    expect(binding.state === "UNBOUND" && binding.detail).toContain("AMBIGUOUS_INITIAL_STATE");
  });
});

describe("unsupported clusters refuse", () => {
  it("a non-ascending gain sequence", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", 5),
      aura(1, 5000, "APPLIED", 7),
      aura(2, 5000, "APPLIED", 6),
      cast(3, 5000),
    ]);
    const binding = stackAt(state, 3);
    expect(binding).toMatchObject(REFUSED);
    expect(binding.state === "UNBOUND" && binding.detail).toContain("not ascending");
    expect(upAt(state, 3)).toMatchObject(REFUSED);
  });

  it("a first gain not above the count before the cluster", () => {
    const state = stateOf([aura(0, 1000, "APPLIED", 7), aura(1, 5000, "APPLIED", 7), cast(2, 5000)]);
    const binding = stackAt(state, 2);
    expect(binding).toMatchObject(REFUSED);
    expect(binding.state === "UNBOUND" && binding.detail).toContain("not above the count before the cluster");
  });

  it("a removal in the cluster (plain or stack)", () => {
    const removal = stateOf([aura(0, 1000, "APPLIED", 6), aura(1, 4990, "REMOVED"), cast(2, 5000)]);
    expect(stackAt(removal, 2)).toMatchObject(REFUSED);
    expect(upAt(removal, 2)).toMatchObject(REFUSED);
    expect(remainsAt(removal, 2)).toMatchObject(REFUSED);
    const stackRemoval = stateOf([aura(0, 1000, "APPLIED", 6), aura(1, 4990, "REMOVED", 5), cast(2, 5000)]);
    const binding = stackAt(stackRemoval, 2);
    expect(binding).toMatchObject(REFUSED);
    expect(binding.state === "UNBOUND" && binding.detail).toContain("REMOVED (stack)");
    expect(upAt(stackRemoval, 2)).toMatchObject(REFUSED);
    const mixed = stateOf([
      aura(0, 1000, "APPLIED", 6),
      aura(1, 4990, "REMOVED", 5),
      aura(2, 5000, "APPLIED", 6),
      cast(3, 5000),
    ]);
    expect(stackAt(mixed, 3)).toMatchObject(REFUSED);
    expect(upAt(mixed, 3)).toMatchObject(REFUSED);
  });

  it("a lone refresh in the cluster, and a refresh that is not at a gain's millisecond", () => {
    const lone = stateOf([aura(0, 1000, "APPLIED", 6), aura(1, 5000, "REFRESHED"), cast(2, 5000)]);
    expect(stackAt(lone, 2)).toMatchObject(REFUSED);
    expect(upAt(lone, 2)).toMatchObject(REFUSED);
    const late = stateOf([
      aura(0, 1000, "APPLIED", 6),
      aura(1, 4990, "APPLIED", 7),
      aura(2, 4991, "REFRESHED"),
      cast(3, 5000),
    ]);
    const binding = stackAt(late, 3);
    expect(binding).toMatchObject(REFUSED);
    expect(binding.state === "UNBOUND" && binding.detail).toContain("not the same-millisecond companion");
    expect(upAt(late, 3)).toMatchObject(REFUSED);
  });

  it("a gain with a plain application beside it", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", 6),
      aura(1, 2000, "REMOVED"),
      aura(2, 5000, "APPLIED"),
      aura(3, 5000, "APPLIED", 2),
      cast(4, 5000, DEATHS_CARESS),
    ]);
    expect(stackAt(state, 4)).toMatchObject(REFUSED);
    expect(upAt(state, 4)).toMatchObject(REFUSED);
  });
});

describe("the fresh application stays conservative (no silence, no producer's count)", () => {
  it("the first Bone Shield application in the track inside the window: AMBIGUOUS_INITIAL_STATE before it, nothing bound", () => {
    const state = stateOf([aura(0, 4980, "APPLIED"), cast(1, 5000, DEATHS_CARESS)]);
    const stack = stackAt(state, 1);
    expect(stack).toMatchObject(REFUSED);
    expect(stack.state === "UNBOUND" && stack.detail).toContain("pins no application count");
    const up = upAt(state, 1);
    expect(up).toMatchObject(REFUSED);
    expect(up.state === "UNBOUND" && up.detail).toContain("plain application");
    expect(remainsAt(state, 1)).toMatchObject(REFUSED);
    expect(bloodStackBindingsFrom([stack])).toEqual([]);
    expect(bloodBuffBindingsFrom([up])).toEqual([]);
  });

  it("even after a proven removal, a plain Bone Shield application binds no count: the producer's number is not pinned", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", 6),
      aura(1, 2000, "REMOVED"),
      aura(2, 5000, "APPLIED"),
      cast(3, 5000, DEATHS_CARESS),
    ]);
    const stack = stackAt(state, 3);
    expect(stack).toMatchObject(REFUSED);
    expect(stack.state === "UNBOUND" && stack.detail).toContain("pins no application count");
    expect(upAt(state, 3)).toMatchObject(REFUSED);
  });

  it("outside the window a plain application still binds no positive count (M11-B2 unchanged)", () => {
    const state = stateOf([aura(0, 1000, "APPLIED"), cast(1, 5000)]);
    expect(stackAt(state, 1)).toMatchObject({ state: "UNBOUND", reason: "NO_STACK_OBSERVATION" });
  });
});

describe("order-invariant presence: M4 on both sides of the cluster, never a count", () => {
  it("ACTIVE before and ACTIVE after binds up TRUE with WINDOW_ORDER_INVARIANT_PRESENCE, anchored on the before-side reading", () => {
    const { state, position } = marrowrendCluster(0, 5, 3);
    const up = upAt(state, position);
    expect(up).toMatchObject({
      state: "BOUND",
      up: true,
      proof: "WINDOW_ORDER_INVARIANT_PRESENCE",
      anchorLocator: { reportTimeMs: 1000 },
    });
    expect(up.state === "BOUND" && up.basis).toContain("under every ordering the aura is ACTIVE");
    expect(bloodBuffBindingsFrom([up])).toEqual([{ name: BS_ATOM, up: true }]);
  });

  it("the before side is refused when M4 cannot answer it: a first gain in the track (AMBIGUOUS_INITIAL_STATE)", () => {
    const state = stateOf([aura(0, 5000, "APPLIED", 8), cast(1, 5000)]);
    const up = upAt(state, 1);
    expect(up).toMatchObject({ ...REFUSED, auraReason: "AMBIGUOUS_INITIAL_STATE" });
    expect(up.state === "UNBOUND" && up.detail).toContain("AMBIGUOUS_INITIAL_STATE");
  });

  it("the two orderings disagree: INACTIVE before a plain application is refused, not bound either way", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", 6),
      aura(1, 2000, "REMOVED"),
      aura(2, 5000, "APPLIED"),
      cast(3, 5000, DEATHS_CARESS),
    ]);
    expect(upAt(state, 3)).toMatchObject(REFUSED);
  });

  it("a nested window refuses the before side: the presence is not proven by another window proof", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", 5),
      aura(1, 4960, "APPLIED", 6),
      cast(2, 4970, DEATH_STRIKE),
      aura(3, 5000, "APPLIED", 7),
      cast(4, 5000),
    ]);
    // Cluster at 5,000: the transition at 4,960 is also inside the window
    // ahead of 5,000 (40 ms), so the cluster is 6 then 7 and H1 sits at 4,960.
    expect(stackAt(state, 4)).toMatchObject({ state: "BOUND_SET", possibleStacks: [5, 6, 7] });
    expect(upAt(state, 4)).toMatchObject({
      state: "BOUND",
      up: true,
      proof: "WINDOW_ORDER_INVARIANT_PRESENCE",
    });
    // At 4,970 the 4,960 gain alone is the cluster: { 5, 6 }.
    expect(stackAt(state, 2)).toMatchObject({ state: "BOUND_SET", possibleStacks: [5, 6] });
  });

  it("Essence keeps the M11-B2 refusal for its presence inside the window (the policy is Bone Shield's)", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", null, ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID),
      aura(1, 5000, "APPLIED", 2, ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID),
      cast(2, 5000, VAMPIRIC_STRIKE),
    ]);
    expect(upAt(state, 2, "essence_of_the_blood_queen")).toMatchObject(REFUSED);
    expect(stackAt(state, 2, "essence_of_the_blood_queen")).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [1, 2],
    });
  });
});

describe("the remains floor: the M11-B8 algorithm, switched on for Bone Shield", () => {
  it("binds min(H1 projected, 30,000 - lead) as a lower bound and refuses a plain application or a removal", () => {
    const { state, position } = marrowrendCluster(0, 5, 3);
    expect(remainsAt(state, position)).toMatchObject({
      state: "BOUND",
      proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
      remainsMs: 26_000,
      windowOrderInvariance: {
        beforeClusterMs: 26_000,
        resetInClusterMs: 30_000,
        beforeClusterProof: "GAIN_ANCHOR_EXACT",
      },
    });
    expect(bloodRemainsBindingsFrom([remainsAt(state, position)])).toEqual([
      {
        name: BS_ATOM,
        remainsSeconds: { state: "BOUNDED_NUMBER", atLeast: 26, reason: "STATE_NOT_ESTABLISHED" },
      },
    ]);
    // H1 below the reset: the floor is H1's projection.
    const late = stateOf([aura(0, 1000, "APPLIED", 5), aura(1, 27_000, "APPLIED", 6), cast(2, 27_000)]);
    expect(remainsAt(late, 2)).toMatchObject({ state: "BOUND", remainsMs: 4000 });
  });

  it("the threshold tolerance holds: a floor within 50 ms of 1.5 s or 3 s decides nothing", () => {
    // H1 projected: 31,000 - 29,520 = 1,480 ms, within 50 ms of 1.5 s.
    const state = stateOf([aura(0, 1000, "APPLIED", 5), aura(1, 29_520, "APPLIED", 6), cast(2, 29_520)]);
    expect(remainsAt(state, 2)).toMatchObject({
      state: "UNBOUND",
      reason: "WITHIN_TIMING_TOLERANCE_OF_THRESHOLD",
    });
  });
});

describe("the evaluator decides the reachable predicates over the set; Blood writes no threshold", () => {
  it("{ 7, 8, 9, 10 }: !up FALSE, remains<1.5 FALSE, stack<=1 FALSE, stack<6 FALSE — sanlayn[0], [3] and [4] all FALSE", () => {
    const { state, position } = marrowrendCluster(0, 7, 3);
    const atoms = bindingsOf(state, position);
    expect(
      truthOf("!buff.bone_shield.up|buff.bone_shield.remains<1.5|buff.bone_shield.stack<=1", atoms),
    ).toBe(false);
    expect(truthOf("buff.bone_shield.stack<6", atoms)).toBe(false);
  });

  it("{ 4, 5, 6, 7 }: stack<6 is UNRESOLVED (the worlds disagree) while stack<=1 is FALSE and up is TRUE", () => {
    const { state, position } = marrowrendCluster(0, 4, 3);
    const atoms = bindingsOf(state, position);
    expect(truthOf("buff.bone_shield.stack<6", atoms)).toBe("UNRESOLVED");
    expect(truthOf("buff.bone_shield.stack<=1", atoms)).toBe(false);
    expect(truthOf("buff.bone_shield.up", atoms)).toBe(true);
    expect(
      truthOf("!buff.bone_shield.up|buff.bone_shield.remains<1.5|buff.bone_shield.stack<=1", atoms),
    ).toBe(false);
  });

  it("{ 1, 2 }: stack<=1 is UNRESOLVED and the sanlayn[0] disjunction stays UNRESOLVED", () => {
    const state = stateOf([aura(0, 1000, "APPLIED", 1), aura(1, 5000, "APPLIED", 2), cast(2, 5000)]);
    const atoms = bindingsOf(state, 2);
    expect(truthOf("buff.bone_shield.stack<=1", atoms)).toBe("UNRESOLVED");
    expect(
      truthOf("!buff.bone_shield.up|buff.bone_shield.remains<1.5|buff.bone_shield.stack<=1", atoms),
    ).toBe("UNRESOLVED");
  });
});

describe("Blood Debt is untouched", () => {
  it("a Blood Debt gain inside the window stays refused; outside it the exact count binds as before", () => {
    const inside = stateOf([
      aura(0, 1000, "APPLIED", 6, BLOOD_DEBT_BUFF_SPELL_ID),
      aura(1, 5000, "APPLIED", 7, BLOOD_DEBT_BUFF_SPELL_ID),
      cast(2, 5000, DEATH_STRIKE),
    ]);
    expect(stackAt(inside, 2, "blood_debt")).toMatchObject(REFUSED);
    expect(upAt(inside, 2, "blood_debt")).toMatchObject(REFUSED);
    const outside = stateOf([
      aura(0, 1000, "APPLIED", 6, BLOOD_DEBT_BUFF_SPELL_ID),
      aura(1, 2000, "APPLIED", 7, BLOOD_DEBT_BUFF_SPELL_ID),
      cast(2, 5000, DEATH_STRIKE),
    ]);
    expect(stackAt(outside, 2, "blood_debt")).toMatchObject({ state: "BOUND", stack: 7 });
  });
});

describe("the committed evidence", () => {
  const bundle = corpusBundleState(BUNDLE, []);
  const bs = (reportTimeMs: number, abilityGameId: number, state: CombatState = bundle) => {
    const position = at(state, reportTimeMs, abilityGameId);
    return {
      stack: stackAt(state, position),
      up: upAt(state, position),
      remains: remainsAt(state, position),
    };
  };

  it.each([
    [2_043_209, MARROWREND, [7, 8, 9, 10], 2572, 2_038_654],
    [2_057_622, DEATHS_CARESS, [11, 12], 15_607, 2_044_077],
    [2_085_352, MARROWREND, [8, 9, 10, 11], 2270, 2_082_219],
    [2_124_183, MARROWREND, [8, 9, 10, 11], 5702, 2_120_436],
    [2_151_502, MARROWREND, [6, 7, 8, 9], 2716, 2_147_801],
    [2_164_444, DEATHS_CARESS, [9, 11], 17_058, 2_151_502],
    [2_015_770, MARROWREND, [5, 6, 7, 8], 21_986, 2_013_178],
  ])(
    "bundle %d: set %j, presence order-invariant ACTIVE, floor %d ms, H1 from %d",
    (t, ability, set, floor, anchorMs) => {
      const { stack, up, remains } = bs(t, ability);
      expect(stack).toMatchObject({
        state: "BOUND_SET",
        proof: "WINDOW_ORDER_INVARIANT_SET",
        possibleStacks: set,
        anchor: { reportTimeMs: anchorMs },
        windowOrderInvariance: {
          beforeClusterStack: set[0],
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: set[set.length - 1],
        },
      });
      expect(up).toMatchObject({ state: "BOUND", up: true, proof: "WINDOW_ORDER_INVARIANT_PRESENCE" });
      expect(remains).toMatchObject({
        state: "BOUND",
        proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
        remainsMs: floor,
      });
    },
  );

  it("bundle 2,004,615: the track's first application, 20 ms ahead — refused everywhere, AMBIGUOUS_INITIAL_STATE before it", () => {
    const { stack, up, remains } = bs(2_004_615, DEATHS_CARESS);
    expect(stack).toMatchObject({
      ...REFUSED,
      windowTransition: { leadMs: 20, operation: "APPLIED", isStackChange: false },
    });
    expect(up).toMatchObject(REFUSED);
    expect(remains).toMatchObject(REFUSED);
  });

  it("bundle 2,044,021: the count after the Marrowrend is broken by the lone refreshes at 2,043,229 (the mirror at cap) — not a window case, still ambiguous", () => {
    const { stack, up } = bs(2_044_021, DEATH_STRIKE);
    expect(stack).toMatchObject({ state: "UNBOUND", reason: "COUNT_AMBIGUOUS_SINCE_OBSERVATION" });
    expect(stack.state === "UNBOUND" && stack.detail).toContain("2043229");
    expect(up).toMatchObject({ state: "BOUND", up: true, proof: "OBSERVED" });
  });

  it("no removal ever sits inside a decision's window on either subject: the removal rule is never exercised by the corpus", () => {
    for (const state of [bundle, corpusState(OPENER)]) {
      for (const position of state.positionsBySourceActor(ACTOR)) {
        const event = state.eventAt(position);
        if (event?.kind !== "CAST" || event.castPhase !== "COMPLETE" || event.isMelee === true) continue;
        const binding = stackAt(state, position);
        if (binding.state === "UNBOUND" && binding.reason === "PRE_DECISION_WINDOW_TRANSITION") {
          expect(binding.windowTransition?.operation).not.toBe("REMOVED");
        }
      }
    }
  });

  it("opener 2,427,294: { 7, 9 } from the Death's Caress, presence and floor bound", () => {
    const { stack, up, remains } = bs(2_427_294, DEATHS_CARESS, corpusState(OPENER));
    expect(stack).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [7, 9],
      anchor: { reportTimeMs: 2_417_020 },
    });
    expect(up).toMatchObject({ state: "BOUND", up: true, proof: "WINDOW_ORDER_INVARIANT_PRESENCE" });
    expect(remains).toMatchObject({
      state: "BOUND",
      proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
      remainsMs: 19_726,
    });
  });
});
