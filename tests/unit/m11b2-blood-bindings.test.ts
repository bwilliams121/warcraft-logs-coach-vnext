/**
 * M11-B2: the Blood-owned bindings — aura presence with the hero-tree
 * exclusion proof, the EXACT Bone Shield count rule and its refusals, the
 * Rune / Runic Power observations and their one conversion, the domain
 * boundary, the applicability and usability rules, the resolver — over
 * synthetic fights and the committed Blood corpus evidence.
 *
 * The companion test the boundary sweep names for
 * `src/specs/deathknight/blood/aura-bindings.ts` and `resources.ts`. It pins
 * the NEGATIVE cases first: no count from silence, no count across a lone
 * refresh, no count when the decision's own effects precede it at the same
 * millisecond, no affordability claim from the wire's cost field, no
 * `up: false` from an unobserved aura unless a build proof excludes it.
 */

import { describe, expect, it } from "vitest";

import {
  BLOOD_AURA_IDENTITIES,
  bloodAuraIdentityFor,
  BONE_SHIELD_BUFF_SPELL_ID,
  EXTERMINATE_BUFF_SPELL_ID,
  GIFT_OF_THE_SANLAYN_BUFF_SPELL_ID,
  REAPERS_MARK_DEBUFF_SPELL_ID,
  SC_DEATH_KNIGHT_CPP_SHA256,
  VAMPIRIC_BLOOD_BUFF_SPELL_ID,
} from "../../src/data/game/deathknight-blood-aura-authority.js";
import type { HeroTreeResolution, TalentResolution } from "../../src/data/game/talent-selection.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import type { AplAction } from "../../src/simc/apl-authority.js";
import { nonDomainCategoryOf } from "../../src/simc/non-domain-tokens.js";
import {
  resolveBloodApplicability,
  resolveBloodUsability,
  TALENT_BUILT_TOKENS,
  type BloodBuildFacts,
} from "../../src/specs/deathknight/blood/action-profile.js";
import {
  bindBloodAura,
  bindBloodStack,
  bindSupportedBloodAuras,
  bindSupportedBloodStacks,
  bloodBuffBindingsFrom,
  bloodStackBindingsFrom,
  EXACT_COUNT_ATOMS,
  SUPPORTED_BLOOD_AURA_ATOMS,
  SUPPORTED_BLOOD_STACK_ATOMS,
} from "../../src/specs/deathknight/blood/aura-bindings.js";
import { bloodNonDomainApplicabilityFor } from "../../src/specs/deathknight/blood/domain-boundary.js";
import { initialBloodState, withExecution } from "../../src/specs/deathknight/blood/first-gcd-state.js";
import { pinnedBloodDeathKnightAuthority } from "../../src/specs/deathknight/blood/pinned-authority.js";
import { resolveBloodAtoms } from "../../src/specs/deathknight/blood/resolver.js";
import {
  bloodResourceOn,
  bloodResourceWireTypes,
  runeCount,
  runicPowerDeficitPoints,
  RUNIC_POWER_WIRE_DIVISOR,
} from "../../src/specs/deathknight/blood/resources.js";
import { corpusBundleState, corpusState, positionOfCast } from "../support/corpus/fight.js";
import { auraEvent, castEvent, syntheticFight } from "../support/synthetic-fight.js";

const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
const BUNDLE = [
  BLOOD45,
  "wcl-blood-death-knight-a7r6-rotational-165s.seg-45-105",
  "wcl-blood-death-knight-a7r6-rotational-165s.seg-105-165",
];
const ACTOR = 14;
const [DEATH_STRIKE, HEART_STRIKE, VAMPIRIC_STRIKE, MARROWREND, DEATHS_CARESS, BLOOD_BOIL] = [
  49998, 206930, 433895, 195182, 195292, 50842,
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
const unknownTalent = (simcName: string): TalentResolution => ({
  simcName,
  selection: "UNKNOWN",
  reason: "NODE_ABSENT",
  identity: null,
  decidedByEntryId: null,
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
const NO_TREE: HeroTreeResolution = { state: "UNKNOWN" };

/** The A7R6 actor-14 build as the resolver reads it. */
const ACTOR14_TALENTS: Readonly<Record<string, TalentResolution>> = {
  blood_boil: selected("blood_boil"),
  consumption: unknownTalent("consumption"),
  dancing_rune_weapon: selected("dancing_rune_weapon"),
  death_strike: selected("death_strike"),
  exterminate: unknownTalent("exterminate"),
  gift_of_the_sanlayn: selected("gift_of_the_sanlayn"),
  heart_strike: selected("heart_strike"),
  marrowrend: selected("marrowrend"),
  raise_dead: selected("raise_dead"),
  reapers_mark: unknownTalent("reapers_mark"),
  vampiric_blood: selected("vampiric_blood"),
  vampiric_strike: selected("vampiric_strike"),
  visceral_strength: selected("visceral_strength"),
};
const FACTS: BloodBuildFacts = { talents: ACTOR14_TALENTS, heroTree: SANLAYN };

function at(state: ReturnType<typeof corpusState>, reportTimeMs: number, abilityGameId: number): number {
  const found = positionOfCast(state, { actorId: ACTOR, reportTimeMs, abilityGameId });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}

function actionAt(listName: string, ordinal: number): AplAction {
  const loaded = pinnedBloodDeathKnightAuthority();
  if (!loaded.ok) throw new Error("authority did not load");
  const action = loaded.authority.actions.find(
    (entry) => entry.listName === listName && entry.priorityOrdinal === ordinal,
  );
  if (action === undefined) throw new Error(`no entry ${listName}[${String(ordinal)}]`);
  return action;
}

// ---------------------------------------------------------------------------
// Synthetic fights for the Bone Shield rule and the same-millisecond hazard
// ---------------------------------------------------------------------------

const bs = (
  ordinal: number,
  reportTimeMs: number,
  operation: "APPLIED" | "REFRESHED" | "REMOVED",
  stacks: number | null,
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
    abilityGameId: BONE_SHIELD_BUFF_SPELL_ID,
  });
const cast = (ordinal: number, reportTimeMs: number, abilityGameId: number) =>
  castEvent({
    ordinal,
    reportTimeMs,
    castPhase: "COMPLETE",
    sourceActorId: ACTOR,
    targetActorId: 22,
    abilityGameId,
  });

function stateOf(events: ReturnType<typeof auraEvent | typeof castEvent>[]) {
  return createCombatState(syntheticFight({ observedCategories: ["AURAS", "CASTS"], events }));
}

const input = (state: ReturnType<typeof stateOf>, position: number) => ({
  state,
  actorId: ACTOR,
  position,
  talents: ACTOR14_TALENTS,
  heroTree: SANLAYN,
});

describe("the Bone Shield exact-count rule", () => {
  it("binds the last observed count when only same-millisecond refresh companions follow", () => {
    const state = stateOf([
      bs(0, 1100, "APPLIED", null),
      bs(1, 1200, "APPLIED", 6),
      bs(2, 1200, "REFRESHED", null),
      cast(3, 1900, DEATH_STRIKE),
    ]);
    const binding = bindBloodStack(input(state, 3), "bone_shield");
    expect(binding.state).toBe("BOUND");
    if (binding.state !== "BOUND") return;
    expect(binding.stack).toBe(6);
    expect(binding.proof).toBe("EXACT_STACK_OBSERVATION");
  });

  it("binds a count reported by a stack REMOVAL too — the number is the resulting count", () => {
    const state = stateOf([
      bs(0, 1100, "APPLIED", 8),
      bs(1, 1300, "REMOVED", 7),
      cast(2, 1900, DEATH_STRIKE),
    ]);
    const binding = bindBloodStack(input(state, 2), "bone_shield");
    expect(binding.state === "BOUND" && binding.stack).toBe(7);
  });

  it("refuses across a LONE refresh, whose effect on the count is not pinned", () => {
    const state = stateOf([
      bs(0, 1100, "APPLIED", 6),
      bs(1, 1500, "REFRESHED", null),
      cast(2, 1900, DEATH_STRIKE),
    ]);
    const binding = bindBloodStack(input(state, 2), "bone_shield");
    expect(binding.state).toBe("UNBOUND");
    if (binding.state !== "UNBOUND") return;
    expect(binding.reason).toBe("COUNT_AMBIGUOUS_SINCE_OBSERVATION");
  });

  it("refuses when no transition carrying a count precedes the decision (an initial application carries none)", () => {
    const state = stateOf([bs(0, 1100, "APPLIED", null), cast(1, 1900, DEATH_STRIKE)]);
    const binding = bindBloodStack(input(state, 1), "bone_shield");
    expect(binding.state === "UNBOUND" && binding.reason).toBe("NO_STACK_OBSERVATION");
    // The PRESENCE is still proven: an application is a known-ACTIVE anchor.
    expect(bindBloodAura(input(state, 1), "bone_shield")).toMatchObject({ state: "BOUND", up: true });
  });

  it("refuses when the decision's own effects precede it at the same millisecond (the measured WCL ordering)", () => {
    // A Marrowrend's stack gains are written BEFORE the cast in the log.
    const state = stateOf([
      bs(0, 1100, "APPLIED", 5),
      bs(1, 1900, "APPLIED", 6),
      bs(2, 1900, "APPLIED", 7),
      bs(3, 1900, "REFRESHED", null),
      cast(4, 1900, MARROWREND),
    ]);
    // RE-POINTED for M11-B4: the 0 ms rule is the 0 ms case of the 50 ms
    // pre-decision window. RE-POINTED for M11-B10: the exact count stays
    // refused inside the window; what binds is the finite set of EVERY
    // exact count the decision's position among its own gains leaves —
    // never the post-cast 7 alone, never the pre-cast 5 alone.
    const stack = bindBloodStack(input(state, 4), "bone_shield");
    expect(stack).toMatchObject({
      state: "BOUND_SET",
      proof: "WINDOW_ORDER_INVARIANT_SET",
      possibleStacks: [5, 6, 7],
      windowOrderInvariance: {
        beforeClusterStack: 5,
        afterClusterStack: 7,
        cluster: [{ leadMs: 0, reportTimeMs: 1900 }, { leadMs: 0 }, { leadMs: 0 }],
      },
    });
    // The presence is M4's reading on both sides of the cluster, not a count.
    const presence = bindBloodAura(input(state, 4), "bone_shield");
    expect(presence).toMatchObject({ state: "BOUND", up: true, proof: "WINDOW_ORDER_INVARIANT_PRESENCE" });
    // The evaluator seam receives the set, never a number.
    expect(bloodStackBindingsFrom([stack])).toEqual([
      {
        name: "bone_shield",
        stack: { state: "ONE_OF_NUMBERS", values: [5, 6, 7], reason: "STATE_NOT_ESTABLISHED" },
      },
    ]);
  });

  it("binds nothing from silence: no transition at all is UNKNOWN presence, not zero stacks", () => {
    const state = stateOf([cast(0, 1900, DEATH_STRIKE)]);
    const stack = bindBloodStack(input(state, 0), "bone_shield");
    expect(stack.state).toBe("UNBOUND");
    expect(stack.state === "UNBOUND" && stack.reason).toBe("AURA_STATE_UNKNOWN");
    expect(bindBloodAura(input(state, 0), "bone_shield")).toMatchObject({
      state: "UNBOUND",
      reason: "AURA_STATE_UNKNOWN",
    });
  });

  it("binds exactly zero from an observed full removal (PROVEN_INACTIVE)", () => {
    const state = stateOf([
      bs(0, 1100, "APPLIED", 6),
      bs(1, 1500, "REMOVED", null),
      cast(2, 1900, DEATH_STRIKE),
    ]);
    const stack = bindBloodStack(input(state, 2), "bone_shield");
    expect(stack).toMatchObject({ state: "BOUND", stack: 0, proof: "PROVEN_INACTIVE" });
  });

  it("reconstructs a positive count for the atoms with an exact-count rule; an ACTIVE Essence binds its absolute count since M11-B9", () => {
    // RE-POINTED for M11-B6 (Blood Debt joined Bone Shield) and M11-B9 (Essence
    // joined, tests/unit/m11b9-blood-ebq-stack.test.ts): the identity order is the authority's.
    expect(EXACT_COUNT_ATOMS).toEqual(["bone_shield", "essence_of_the_blood_queen", "blood_debt"]);
    const state = stateOf([
      auraEvent({
        ordinal: 0,
        reportTimeMs: 1100,
        operation: "APPLIED",
        auraClass: "BUFF",
        isStackChange: true,
        stacks: 4,
        sourceActorId: ACTOR,
        targetActorId: ACTOR,
        abilityGameId: 433925,
      }),
      cast(1, 1900, DEATH_STRIKE),
    ]);
    const stack = bindBloodStack(input(state, 1), "essence_of_the_blood_queen");
    // The wire's absolute count, 4, under the DBC maximum 5: bound whatever the
    // modifier talent's state (the synthetic build models no talents at all).
    expect(stack).toMatchObject({ state: "BOUND", stack: 4, proof: "EXACT_STACK_OBSERVATION" });
  });
});

describe("aura presence and the build proofs", () => {
  it("binds a Deathbringer aura DOWN for a resolved San'layn build without any aura stream", () => {
    const state = stateOf([cast(0, 1900, DEATH_STRIKE)]);
    const exterminate = bindBloodAura(input(state, 0), "exterminate");
    expect(exterminate).toMatchObject({
      state: "BOUND",
      up: false,
      proof: "HERO_TREE_EXCLUDED",
      abilityGameId: EXTERMINATE_BUFF_SPELL_ID,
    });
    // And to exactly zero stacks by the same proof.
    expect(bindBloodStack(input(state, 0), "bone_shield")).not.toMatchObject({ proof: "HERO_TREE_EXCLUDED" });
  });

  it("does NOT exclude a Deathbringer aura when the hero tree is UNKNOWN or resolved to Deathbringer", () => {
    const state = stateOf([cast(0, 1900, DEATH_STRIKE)]);
    for (const heroTree of [NO_TREE, DEATHBRINGER]) {
      const binding = bindBloodAura({ ...input(state, 0), heroTree }, "exterminate");
      expect(binding).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN" });
    }
  });

  it("binds an aura DOWN when its producing talent is disproved at its choice node, and not when UNKNOWN", () => {
    const state = stateOf([cast(0, 1900, DEATH_STRIKE)]);
    const disproved = bindBloodAura(
      { ...input(state, 0), talents: { ...ACTOR14_TALENTS, vampiric_blood: notSelected("vampiric_blood") } },
      "vampiric_blood",
    );
    expect(disproved).toMatchObject({
      state: "BOUND",
      up: false,
      proof: "TALENT_NOT_SELECTED",
      abilityGameId: VAMPIRIC_BLOOD_BUFF_SPELL_ID,
    });
    const open = bindBloodAura(input(state, 0), "vampiric_blood");
    expect(open).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN" });
  });

  it("never binds a DEBUFF atom: the shared evaluator has no debuff binding field", () => {
    const state = stateOf([cast(0, 1900, DEATH_STRIKE)]);
    const identity = bloodAuraIdentityFor("reapers_mark_debuff");
    expect(identity?.auraClass).toBe("DEBUFF");
    expect(identity?.abilityGameId).toBe(REAPERS_MARK_DEBUFF_SPELL_ID);
    expect(bindBloodAura(input(state, 0), "reapers_mark_debuff")).toMatchObject({
      state: "UNBOUND",
      reason: "DEBUFF_NOT_BINDABLE",
    });
    expect(SUPPORTED_BLOOD_AURA_ATOMS).not.toContain("reapers_mark_debuff");
  });

  it("binds UP from an application and DOWN from a removal strictly before the decision, never from a later one", () => {
    const state = stateOf([
      auraEvent({
        ordinal: 0,
        reportTimeMs: 1100,
        operation: "APPLIED",
        auraClass: "BUFF",
        sourceActorId: ACTOR,
        targetActorId: ACTOR,
        abilityGameId: GIFT_OF_THE_SANLAYN_BUFF_SPELL_ID,
      }),
      cast(1, 1500, HEART_STRIKE),
      auraEvent({
        ordinal: 2,
        reportTimeMs: 1700,
        operation: "REMOVED",
        auraClass: "BUFF",
        sourceActorId: ACTOR,
        targetActorId: ACTOR,
        abilityGameId: GIFT_OF_THE_SANLAYN_BUFF_SPELL_ID,
      }),
      cast(3, 1900, HEART_STRIKE),
    ]);
    expect(bindBloodAura(input(state, 1), "gift_of_the_sanlayn")).toMatchObject({
      state: "BOUND",
      up: true,
      proof: "OBSERVED",
    });
    expect(bindBloodAura(input(state, 3), "gift_of_the_sanlayn")).toMatchObject({
      state: "BOUND",
      up: false,
      proof: "OBSERVED",
    });
  });

  it("carries every pinned identity with the measured module hash and a self-applied direction for buffs", () => {
    expect(SC_DEATH_KNIGHT_CPP_SHA256).toMatch(/^[0-9a-f]{64}$/);
    for (const identity of BLOOD_AURA_IDENTITIES) {
      expect(identity.claims.length).toBeGreaterThan(0);
      for (const claim of identity.claims) expect(claim.sourceSha256).toBe(SC_DEATH_KNIGHT_CPP_SHA256);
      expect(identity.selfApplied).toBe(identity.auraClass === "BUFF");
    }
    for (const atom of [...SUPPORTED_BLOOD_AURA_ATOMS, ...SUPPORTED_BLOOD_STACK_ATOMS]) {
      expect(bloodAuraIdentityFor(atom), atom).not.toBeNull();
    }
  });
});

describe("the resource observations", () => {
  const state = corpusState(BLOOD45);
  const wire = bloodResourceWireTypes();
  if (wire === null) throw new Error("the Rune / Runic Power wire contracts must be pinned");

  it("reads Runic Power PRE_COST on a Death Strike and converts the deficit to points exactly once", () => {
    const position = at(state, 2012014, DEATH_STRIKE);
    const rp = bloodResourceOn(state, position, ACTOR, wire.runicPower);
    expect(rp).toEqual({ state: "EXACT_PRE_COST", amount: 990, max: 1250, cost: 450 });
    expect(RUNIC_POWER_WIRE_DIVISOR).toBe(10);
    expect(runicPowerDeficitPoints(rp)).toBe(26);
    // A Death Strike costs no Runes: the Runes entry is absent, and absent is not zero.
    const runes = bloodResourceOn(state, position, ACTOR, wire.runes);
    expect(runes.state).toBe("NO_OBSERVATION");
    expect(runeCount(runes)).toBeNull();
  });

  it("reads Runes PRE_COST on a Rune-costed cast, which carries no Runic Power entry at all", () => {
    const position = at(state, 2015770, MARROWREND);
    expect(bloodResourceOn(state, position, ACTOR, wire.runes)).toEqual({
      state: "EXACT_PRE_COST",
      amount: 3,
      max: 6,
      cost: 2,
    });
    const rp = bloodResourceOn(state, position, ACTOR, wire.runicPower);
    expect(rp).toEqual({ state: "NO_OBSERVATION", reason: "NO_OBSERVATION" });
  });

  it("refuses the UNCOSTED Runic Power entry an uncosted cast carries (EVENT_ASSOCIATED, never a pre-cast amount)", () => {
    const position = at(state, 2021775, BLOOD_BOIL);
    const rp = bloodResourceOn(state, position, ACTOR, wire.runicPower);
    expect(rp.state).toBe("NO_OBSERVATION");
    expect(rp.state === "NO_OBSERVATION" && rp.reason).toContain("EVENT_ASSOCIATED");
    expect(runicPowerDeficitPoints(rp)).toBeNull();
  });

  it("never reads the wire's cost field as the cost paid: the gtKb subject cast Death Strike below it", () => {
    const opener = corpusState("wcl-blood-death-knight-gtkb-opener");
    const position = at(opener, 2425794, DEATH_STRIKE);
    const rp = bloodResourceOn(opener, position, ACTOR, wire.runicPower);
    expect(rp).toEqual({ state: "EXACT_PRE_COST", amount: 440, max: 1250, cost: 450 });
    // The usability rule makes no affordability claim in either direction.
    const verdict = resolveBloodUsability(initialBloodState(), actionAt("sanlayn", 2), HEART_STRIKE);
    expect(verdict.kind).toBe("UNKNOWN");
  });
});

describe("the domain boundary and applicability", () => {
  it("classifies the item, racial and potion entries by the shared token categories, before any build fact", () => {
    for (const [ordinal, category] of [
      [1, "ITEM_USE"],
      [2, "ITEM_USE"],
      [7, "RACIAL_ACTION"],
      [11, "CONSUMABLE"],
    ] as const) {
      const action = actionAt("default", ordinal);
      expect(nonDomainCategoryOf(action.actionToken)).toBe(category);
      expect(bloodNonDomainApplicabilityFor(action)).toMatchObject({
        kind: "NOT_APPLICABLE",
        reason: "OUTSIDE_SUPPORTED_DECISION_DOMAIN",
      });
      expect(resolveBloodApplicability({ talents: {}, heroTree: NO_TREE }, action).kind).toBe(
        "NOT_APPLICABLE",
      );
    }
    expect(bloodNonDomainApplicabilityFor(actionAt("sanlayn", 2))).toBeNull();
  });

  it("reads a talent-built entry APPLICABLE when SELECTED, background when NOT_SELECTED, UNKNOWN when unresolved", () => {
    const consumption = actionAt("sanlayn", 10);
    expect(TALENT_BUILT_TOKENS[consumption.actionToken]).toBe("consumption");
    expect(resolveBloodApplicability(FACTS, consumption).kind).toBe("UNKNOWN");
    expect(
      resolveBloodApplicability(
        { ...FACTS, talents: { ...ACTOR14_TALENTS, consumption: selected("consumption") } },
        consumption,
      ).kind,
    ).toBe("APPLICABLE");
    expect(
      resolveBloodApplicability(
        { ...FACTS, talents: { ...ACTOR14_TALENTS, consumption: notSelected("consumption") } },
        consumption,
      ),
    ).toMatchObject({ kind: "NOT_APPLICABLE", reason: "BACKGROUND_UNDER_PROVEN_BUILD" });
  });

  it("reads Reaper's Mark background for a resolved San'layn build even though its own node is UNKNOWN", () => {
    const reapersMark = actionAt("deathbringer", 2);
    expect(resolveBloodApplicability(FACTS, reapersMark)).toMatchObject({
      kind: "NOT_APPLICABLE",
      reason: "BACKGROUND_UNDER_PROVEN_BUILD",
    });
    expect(resolveBloodApplicability({ ...FACTS, heroTree: NO_TREE }, reapersMark).kind).toBe("UNKNOWN");
    expect(resolveBloodApplicability({ ...FACTS, heroTree: DEATHBRINGER }, reapersMark).kind).toBe("UNKNOWN");
  });

  it("leaves the specialization spells and the alias applicable with no build fact at all", () => {
    for (const [list, ordinal] of [
      ["sanlayn", 0],
      ["sanlayn", 5],
      ["default", 0],
    ] as const) {
      expect(
        resolveBloodApplicability({ talents: {}, heroTree: NO_TREE }, actionAt(list, ordinal)).kind,
      ).toBe("APPLICABLE");
    }
  });

  it("proves usable only the observed cast itself, and unusable only a hypothetical prefix or a derived cooldown", () => {
    const heartStrike = actionAt("sanlayn", 13);
    expect(resolveBloodUsability(initialBloodState(), heartStrike, VAMPIRIC_STRIKE).kind).toBe(
      "PROVEN_USABLE",
    );
    expect(resolveBloodUsability(initialBloodState(), heartStrike, DEATH_STRIKE).kind).toBe("UNKNOWN");
    const fired = withExecution(initialBloodState(), {
      listName: heartStrike.listName,
      priorityOrdinal: heartStrike.priorityOrdinal,
      actionToken: heartStrike.actionToken,
      sourceLine: heartStrike.sourceLine,
    });
    expect(resolveBloodUsability(fired, heartStrike, VAMPIRIC_STRIKE)).toMatchObject({
      kind: "PROVEN_UNUSABLE",
      reason: "SIMULATED_PREFIX_EXECUTION",
    });
  });
});

describe("the resolver", () => {
  it("binds both hero-tree atoms from a resolved tree and neither from an unresolved one", () => {
    const resolved = resolveBloodAtoms({
      runes: { state: "NO_OBSERVATION", reason: "x" },
      runicPower: { state: "NO_OBSERVATION", reason: "x" },
      heroTree: SANLAYN,
      fightTimeMs: 93207,
    });
    const bound = Object.fromEntries(resolved.specAtoms.bound.map((entry) => [entry.key, entry.value]));
    expect(bound["hero_tree.sanlayn"]).toEqual({ kind: "TRUTH", value: true });
    expect(bound["hero_tree.deathbringer"]).toEqual({ kind: "TRUTH", value: false });
    expect(bound["time"]).toEqual({ kind: "MAGNITUDE", binding: { state: "KNOWN_NUMBER", value: 93.207 } });
    expect(bound["rune"]).toMatchObject({ kind: "MAGNITUDE", binding: { state: "UNKNOWN_NUMBER" } });
    expect(resolved.diagnostics.heroTreeBound).toBe("sanlayn");

    const open = resolveBloodAtoms({
      ...{
        runes: { state: "NO_OBSERVATION", reason: "x" },
        runicPower: { state: "NO_OBSERVATION", reason: "x" },
      },
      heroTree: NO_TREE,
      fightTimeMs: 0,
    });
    expect(open.specAtoms.bound.some((entry) => entry.key.startsWith("hero_tree."))).toBe(false);
    expect(open.diagnostics.heroTreeBound).toBeNull();
  });

  it("binds runic_power.deficit in points and rune in whole runes from PRE_COST observations only", () => {
    const resolved = resolveBloodAtoms({
      runes: { state: "EXACT_PRE_COST", amount: 4, max: 6, cost: 1 },
      runicPower: { state: "EXACT_PRE_COST", amount: 901, max: 1250, cost: 450 },
      heroTree: SANLAYN,
      fightTimeMs: 0,
    });
    expect(resolved.diagnostics.runicPowerDeficit).toBeCloseTo(34.9, 9);
    expect(resolved.diagnostics.rune).toBe(4);
  });
});

describe("over the committed evidence", () => {
  it("binds the supported atoms at the Death Strike inside the first Gift window exactly as the corpus pins", () => {
    const state = corpusState(BLOOD45);
    const position = at(state, 2012014, DEATH_STRIKE);
    const auras = bindSupportedBloodAuras(input(state, position));
    const known = Object.fromEntries(bloodBuffBindingsFrom(auras).map((row) => [row.name, row.up]));
    expect(known).toMatchObject({
      gift_of_the_sanlayn: true,
      exterminate: false,
      dancing_rune_weapon: true,
      bone_shield: true,
      death_and_decay: true,
    });
    expect(known).not.toHaveProperty("vampiric_blood");
    const stacks = bloodStackBindingsFrom(bindSupportedBloodStacks(input(state, position)));
    // M11-B9: Essence's absolute count (applybuffstack 4 at 2,011,141, its companion refresh, nothing since) joins.
    expect(stacks).toEqual([
      { name: "bone_shield", stack: 6 },
      { name: "essence_of_the_blood_queen", stack: 4 },
    ]);
  });

  it("binds Vampiric Blood UP inside its window and DOWN after its removal over the bundle, never before its first transition", () => {
    const state = corpusBundleState(BUNDLE, []);
    expect(bindBloodAura(input(state, at(state, 2012014, DEATH_STRIKE)), "vampiric_blood")).toMatchObject({
      state: "UNBOUND",
      reason: "AURA_STATE_UNKNOWN",
      auraReason: "AMBIGUOUS_INITIAL_STATE",
    });
    expect(bindBloodAura(input(state, at(state, 2087470, VAMPIRIC_STRIKE)), "vampiric_blood")).toMatchObject({
      state: "BOUND",
      up: true,
    });
    expect(bindBloodAura(input(state, at(state, 2097796, HEART_STRIKE)), "vampiric_blood")).toMatchObject({
      state: "BOUND",
      up: false,
    });
  });

  it("refuses the Bone Shield count at a Death's Caress whose own stack gain precedes it in the log", () => {
    const state = corpusState(BLOOD45);
    const position = at(state, 2004615, DEATHS_CARESS);
    // RE-POINTED for M11-B4. Under the 0 ms rule the application at 2,004,595
    // read as a pre-pull application with no count (NO_STACK_OBSERVATION); the
    // M11-B4 audit showed it is this cast's OWN application, logged 20 ms
    // ahead of it (Bone Shield is absent from the combatantinfo aura
    // snapshot), and the 50 ms window refuses it with the lead recorded.
    expect(bindBloodStack(input(state, position), "bone_shield")).toMatchObject({
      state: "UNBOUND",
      reason: "PRE_DECISION_WINDOW_TRANSITION",
      windowTransition: { leadMs: 20, reportTimeMs: 2004595, operation: "APPLIED" },
    });
  });
});
