/**
 * M11-B9: Essence of the Blood Queen's positive stack — the Frenzied
 * Bloodthirst max-stack authority, the exact count from the aura's own
 * transitions, the maximum-consistency guard, the strict lone-refresh rule
 * (Q2 declined), and the finite set of exact counts both orderings of the
 * pre-decision window cluster leave — over synthetic fights and the
 * committed Blood corpus evidence.
 *
 * Negative first: the effective maximum is never read off a count (an
 * observed 6 under an unresolved talent refuses rather than proving the
 * modifier); an exact count never survives a lone refresh; no ordering is
 * chosen inside the window ({6,7} stays a set; a lone-refresh or removal
 * cluster refuses; an H1 the ordinary rule cannot establish refuses); Bone
 * Shield and Blood Debt are unchanged; the window and the tolerance are
 * untouched.
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
import {
  bloodEffectiveMaxStack,
  bloodMaxStackModifiersFor,
  ESSENCE_OF_THE_BLOOD_QUEEN_LABEL,
  FRENZIED_BLOODTHIRST_MAX_STACK_MODIFIER,
  TRAIT_DATA_INC_SHA256,
} from "../../src/data/game/deathknight-blood-stack-authority.js";
import { SC_SPELL_DATA_INC_SHA256 } from "../../src/data/game/deathknight-blood-rune-cost-authority.js";
import {
  bloodModelledTalentNames,
  bloodTalentIdentityFor,
  pinnedBloodDeathKnightTalents,
  resolveBloodHeroTree,
  resolveBloodTalent,
} from "../../src/data/game/deathknight-blood-talents.js";
import type { HeroTreeResolution, TalentResolution } from "../../src/data/game/talent-selection.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import {
  bindBloodAura,
  bindBloodStack,
  bindSupportedBloodStacks,
  BLOOD_PRE_DECISION_WINDOW_MS,
  bloodStackBindingsFrom,
  EXACT_COUNT_ATOMS,
} from "../../src/specs/deathknight/blood/aura-bindings.js";
import { bindBloodRemains } from "../../src/specs/deathknight/blood/aura-remains.js";
import { corpusBundleState, corpusState, positionOfCast } from "../support/corpus/fight.js";
import { committedEventArray } from "../support/corpus/artifacts.js";
import {
  auraEvent,
  castEvent,
  syntheticFight,
  type SyntheticFightOptions,
} from "../support/synthetic-fight.js";

const ACTOR = 14;
const EBQ = ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID;
const EBQ_ATOM = "essence_of_the_blood_queen";
const DEATH_STRIKE = 49998;
const HEART_STRIKE = 206930;
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
const unresolved = (simcName: string): TalentResolution => ({
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
const TREE_UNKNOWN: HeroTreeResolution = { state: "UNKNOWN" };
const BASE_TALENTS: Readonly<Record<string, TalentResolution>> = {
  vampiric_strike: selected("vampiric_strike"),
  visceral_strength: selected("visceral_strength"),
  gift_of_the_sanlayn: selected("gift_of_the_sanlayn"),
};
const WITH_FRENZIED = { ...BASE_TALENTS, frenzied_bloodthirst: selected("frenzied_bloodthirst") };
const FRENZIED_UNKNOWN = { ...BASE_TALENTS, frenzied_bloodthirst: unresolved("frenzied_bloodthirst") };

type Operation = "APPLIED" | "REFRESHED" | "REMOVED";
const aura = (
  ordinal: number,
  reportTimeMs: number,
  operation: Operation,
  stacks: number | null = null,
  abilityGameId = EBQ,
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
const cast = (ordinal: number, reportTimeMs: number, abilityGameId = VAMPIRIC_STRIKE) =>
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
const input = (
  state: CombatState,
  position: number,
  talents: Readonly<Record<string, TalentResolution>> = WITH_FRENZIED,
  heroTree: HeroTreeResolution = SANLAYN,
) => ({ state, actorId: ACTOR, position, talents, heroTree });
const stackAt = (
  state: CombatState,
  position: number,
  talents: Readonly<Record<string, TalentResolution>> = WITH_FRENZIED,
  atomName = EBQ_ATOM,
) => bindBloodStack(input(state, position, talents), atomName);

function at(state: CombatState, reportTimeMs: number, abilityGameId: number): number {
  const found = positionOfCast(state, { actorId: ACTOR, reportTimeMs, abilityGameId });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}

/** The subject's combatantinfo talent tree, as the committed artifact carries it. */
function observedTalentsOf(artifactId: string): readonly { readonly id: number; readonly nodeId: number }[] {
  for (const event of committedEventArray(artifactId)) {
    if (event.type !== "combatantinfo" || event.sourceID !== ACTOR) continue;
    const tree = (event as { talentTree?: readonly { id: number; nodeID: number }[] }).talentTree ?? [];
    return tree.map((entry) => ({ id: entry.id, nodeId: entry.nodeID }));
  }
  throw new Error(`no combatantinfo for actor ${String(ACTOR)} in ${artifactId}`);
}

describe("the Frenzied Bloodthirst authority", () => {
  it("is machine-extracted into the talent artifact at the pinned trait record: entry 117662, node 95065, spell 434075, NORMAL, no alternative", () => {
    expect(pinnedBloodDeathKnightTalents().ok).toBe(true);
    expect(bloodModelledTalentNames()).toContain("frenzied_bloodthirst");
    expect(bloodTalentIdentityFor("frenzied_bloodthirst")).toMatchObject({
      simcName: "frenzied_bloodthirst",
      displayNameEn: "Frenzied Bloodthirst",
      tree: "HERO",
      traitNodeId: 95065,
      traitEntryId: 117662,
      talentSpellId: 434075,
      nodeType: "NORMAL",
      alternativeEntries: [],
    });
    const loaded = pinnedBloodDeathKnightTalents();
    if (!loaded.ok) throw new Error("talents");
    expect(loaded.artifact.provenance.sources.find((s) => s.path.endsWith("trait_data.inc"))?.sha256).toBe(
      TRAIT_DATA_INC_SHA256,
    );
    expect(
      loaded.artifact.heroTrees
        ?.find((tree) => tree.simcName === "sanlayn")
        ?.entries.some((e) => e.traitEntryId === 117662),
    ).toBe(true);
  });

  it("pins the one max-stack modifier: effect 1123818, +2, P_MAX_STACKS by label 3134, one rank, against the hashed client data", () => {
    expect(bloodMaxStackModifiersFor(EBQ_ATOM)).toEqual([FRENZIED_BLOODTHIRST_MAX_STACK_MODIFIER]);
    expect(bloodMaxStackModifiersFor("bone_shield")).toEqual([]);
    expect(bloodMaxStackModifiersFor("blood_debt")).toEqual([]);
    expect(FRENZIED_BLOODTHIRST_MAX_STACK_MODIFIER).toMatchObject({
      talentSimcName: "frenzied_bloodthirst",
      talentSpellId: 434075,
      traitNodeEntryId: 117662,
      traitNodeId: 95065,
      effectId: 1123818,
      flatAdd: 2,
      label: ESSENCE_OF_THE_BLOOD_QUEEN_LABEL,
    });
    expect(ESSENCE_OF_THE_BLOOD_QUEEN_LABEL).toBe(3134);
    const sources = FRENZIED_BLOODTHIRST_MAX_STACK_MODIFIER.claims.map((c) => [c.sourcePath, c.sourceSha256]);
    expect(sources).toContainEqual(["engine/dbc/generated/sc_spell_data.inc", SC_SPELL_DATA_INC_SHA256]);
    expect(sources).toContainEqual(["engine/dbc/generated/trait_data.inc", TRAIT_DATA_INC_SHA256]);
    for (const claim of FRENZIED_BLOODTHIRST_MAX_STACK_MODIFIER.claims) {
      expect(claim.claim.length).toBeGreaterThan(40);
    }
  });

  it("the raw DBC maximum is 5 and is not reinterpreted; the effective maximum is 7 exactly when the talent is SELECTED", () => {
    const duration = bloodAuraDurationForAtom(EBQ_ATOM);
    expect(duration?.maxStack).toBe(5);
    const base = {
      baseMaxStack: 5,
      modifiers: bloodMaxStackModifiersFor(EBQ_ATOM),
      ownedByHeroTree: "sanlayn" as const,
    };
    expect(bloodEffectiveMaxStack({ ...base, talents: WITH_FRENZIED, heroTree: SANLAYN })).toMatchObject({
      state: "RESOLVED",
      maxStack: 7,
      baseMaxStack: 5,
      appliedModifiers: ["frenzied_bloodthirst"],
    });
    expect(bloodEffectiveMaxStack({ ...base, talents: FRENZIED_UNKNOWN, heroTree: SANLAYN })).toMatchObject({
      state: "UNKNOWN",
      baseMaxStack: 5,
      reason: "MODIFIER_TALENT_UNRESOLVED",
    });
    // Not modelled at all is the same refusal.
    expect(bloodEffectiveMaxStack({ ...base, talents: BASE_TALENTS, heroTree: SANLAYN })).toMatchObject({
      state: "UNKNOWN",
      reason: "MODIFIER_TALENT_UNRESOLVED",
    });
    // An unresolved tree with the talent SELECTED still resolves: the entry decides.
    expect(bloodEffectiveMaxStack({ ...base, talents: WITH_FRENZIED, heroTree: TREE_UNKNOWN })).toMatchObject(
      {
        state: "RESOLVED",
        maxStack: 7,
      },
    );
    // A Deathbringer build cannot hold the aura or its modifier: the base stands.
    expect(bloodEffectiveMaxStack({ ...base, talents: BASE_TALENTS, heroTree: DEATHBRINGER })).toMatchObject({
      state: "RESOLVED",
      maxStack: 5,
      appliedModifiers: [],
    });
    // No modifier at all: the base, whatever the build.
    expect(
      bloodEffectiveMaxStack({
        baseMaxStack: 10,
        modifiers: [],
        ownedByHeroTree: null,
        talents: {},
        heroTree: TREE_UNKNOWN,
      }),
    ).toMatchObject({
      state: "RESOLVED",
      maxStack: 10,
    });
  });

  it("both committed subjects prove the talent SELECTED by its own entry — never from a stack observation", () => {
    for (const artifactId of [BLOOD45, OPENER]) {
      const observed = observedTalentsOf(artifactId);
      expect(resolveBloodTalent(observed, "frenzied_bloodthirst")).toMatchObject({
        selection: "SELECTED",
        reason: "OWN_ENTRY_SELECTED",
        decidedByEntryId: 117662,
      });
      expect(resolveBloodHeroTree(observed)).toMatchObject({ state: "RESOLVED", simcName: "sanlayn" });
    }
    // A tree without the node: UNKNOWN (NODE_ABSENT), never NOT_SELECTED — a
    // NORMAL node has no alternative entry to disprove it with.
    expect(resolveBloodTalent([{ id: 117630, nodeId: 95033 }], "frenzied_bloodthirst")).toMatchObject({
      selection: "UNKNOWN",
      reason: "NODE_ABSENT",
    });
  });

  it("Essence is the third exact-count atom; its rule pins the application count 1 and both M11-B9 switches; no other identity's switches are on", () => {
    expect(EXACT_COUNT_ATOMS).toEqual(["bone_shield", "essence_of_the_blood_queen", "blood_debt"]);
    expect(bloodAuraIdentityFor(EBQ_ATOM)?.exactCount).toEqual({
      applicationStack: 1,
      maxStackGuard: true,
      windowOrderInvariantSet: true,
    });
    for (const identity of BLOOD_AURA_IDENTITIES) {
      if (identity.atomName === EBQ_ATOM || identity.exactCount === null) continue;
      expect(identity.exactCount.maxStackGuard, identity.atomName).toBe(false);
      expect(identity.exactCount.windowOrderInvariantSet, identity.atomName).toBe(false);
    }
    expect(BLOOD_PRE_DECISION_WINDOW_MS).toBe(50);
  });
});

describe("the exact count from the aura's own transitions", () => {
  it("a fresh applybuff is exactly 1 (the pinned initial stack), an applybuffstack N is exactly N, a removal is 0", () => {
    const applied = stateOf([aura(0, 1000, "APPLIED"), cast(1, 5000, DEATH_STRIKE)]);
    expect(stackAt(applied, 1)).toMatchObject({ state: "BOUND", stack: 1, proof: "EXACT_STACK_APPLICATION" });
    for (const n of [2, 3, 4, 5, 6, 7]) {
      const state = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 3000, "APPLIED", n),
        aura(2, 3000, "REFRESHED"),
        cast(3, 5000, DEATH_STRIKE),
      ]);
      expect(stackAt(state, 3), String(n)).toMatchObject({
        state: "BOUND",
        stack: n,
        proof: "EXACT_STACK_OBSERVATION",
        anchor: { reportTimeMs: 3000 },
      });
    }
    const removed = stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 3000, "APPLIED", 7),
      aura(2, 4000, "REMOVED"),
      cast(3, 5000, DEATH_STRIKE),
    ]);
    expect(stackAt(removed, 3)).toMatchObject({ state: "BOUND", stack: 0, proof: "PROVEN_INACTIVE" });
  });

  it("an application to an aura already held binds no count (the B6 shape rule, unchanged)", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED", 3),
      aura(1, 3000, "APPLIED"),
      cast(2, 5000, DEATH_STRIKE),
    ]);
    expect(stackAt(state, 2)).toMatchObject({
      state: "UNBOUND",
      reason: "APPLICATION_WHILE_ACTIVE_UNPINNED",
    });
  });

  it("strict lone refresh (Q2 declined): an exact count followed by a lone refreshbuff is COUNT_AMBIGUOUS_SINCE_OBSERVATION, never carried", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 3000, "APPLIED", 3),
      aura(2, 3000, "REFRESHED"),
      aura(3, 10_000, "REFRESHED"),
      cast(4, 20_000, DEATH_STRIKE),
    ]);
    const binding = stackAt(state, 4);
    expect(binding).toMatchObject({ state: "UNBOUND", reason: "COUNT_AMBIGUOUS_SINCE_OBSERVATION" });
    expect(binding.state === "UNBOUND" && binding.detail).toContain("10000");
    // The remainder, by contrast, keeps the earlier expiry as a floor (M11-B8): the two are decoupled.
    expect(bindBloodRemains(input(state, 4), EBQ_ATOM)).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_BOUNDED",
    });
    // The same 0-1 ms before a Vampiric Strike: cast proximity names no cause.
    const nearCast = stateOf([
      aura(0, 1000, "APPLIED", 7),
      aura(1, 9999, "REFRESHED"),
      cast(2, 10_000, VAMPIRIC_STRIKE),
      cast(3, 20_000, DEATH_STRIKE),
    ]);
    expect(stackAt(nearCast, 3)).toMatchObject({
      state: "UNBOUND",
      reason: "COUNT_AMBIGUOUS_SINCE_OBSERVATION",
    });
  });

  describe("the maximum-consistency guard", () => {
    it("6 and 7 bind under a SELECTED Frenzied Bloodthirst; 8 refuses as above the effective maximum", () => {
      for (const n of [6, 7]) {
        const state = stateOf([
          aura(0, 1000, "APPLIED"),
          aura(1, 3000, "APPLIED", n),
          cast(2, 5000, DEATH_STRIKE),
        ]);
        expect(stackAt(state, 2), String(n)).toMatchObject({ state: "BOUND", stack: n });
      }
      const eight = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 3000, "APPLIED", 8),
        cast(2, 5000, DEATH_STRIKE),
      ]);
      const binding = stackAt(eight, 2);
      expect(binding).toMatchObject({ state: "UNBOUND", reason: "COUNT_EXCEEDS_PINNED_MAX" });
      expect(binding.state === "UNBOUND" && binding.detail).toContain("effective maximum 7");
    });

    it("6 under an UNRESOLVED (or unmodelled) talent refuses: the log corroborates a modifier, it does not establish one; 5 still binds", () => {
      const six = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 3000, "APPLIED", 6),
        cast(2, 5000, DEATH_STRIKE),
      ]);
      for (const talents of [FRENZIED_UNKNOWN, BASE_TALENTS]) {
        const binding = stackAt(six, 2, talents);
        expect(binding).toMatchObject({ state: "UNBOUND", reason: "COUNT_EXCEEDS_PINNED_MAX" });
        expect(binding.state === "UNBOUND" && binding.detail).toContain("unproven");
      }
      const five = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 3000, "APPLIED", 5),
        cast(2, 5000, DEATH_STRIKE),
      ]);
      expect(stackAt(five, 2, FRENZIED_UNKNOWN)).toMatchObject({ state: "BOUND", stack: 5 });
    });

    it("the guard does not exist for Bone Shield or Blood Debt: their observed counts above the artifact maximum bind as before", () => {
      const bone = stateOf([
        aura(0, 1000, "APPLIED", 6, BONE_SHIELD_BUFF_SPELL_ID),
        aura(1, 3000, "APPLIED", 12, BONE_SHIELD_BUFF_SPELL_ID),
        cast(2, 5000, DEATH_STRIKE),
      ]);
      expect(stackAt(bone, 2, BASE_TALENTS, "bone_shield")).toMatchObject({ state: "BOUND", stack: 12 });
      const debt = stateOf([
        aura(0, 1000, "APPLIED", null, BLOOD_DEBT_BUFF_SPELL_ID),
        aura(1, 3000, "APPLIED", 11, BLOOD_DEBT_BUFF_SPELL_ID),
        cast(2, 5000, DEATH_STRIKE),
      ]);
      expect(stackAt(debt, 2, BASE_TALENTS, "blood_debt")).toMatchObject({ state: "BOUND", stack: 11 });
    });
  });
});

describe("the finite set inside the 50 ms window", () => {
  /** Applied at 1,000; applybuffstack 2 with its companion refresh `leadMs` before a Vampiric Strike at 5,000. */
  function clusterAtLead(leadMs: number, stackAfter = 2, companion = true) {
    return stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 5000 - leadMs, "APPLIED", stackAfter),
      ...(companion ? [aura(2, 5000 - leadMs, "REFRESHED")] : []),
      cast(companion ? 3 : 2, 5000, VAMPIRIC_STRIKE),
    ]);
  }

  it.each([0, 1, 50])(
    "binds { H1, H2 } at a %d ms lead with both worlds recorded and no ordering chosen; the presence stays refused",
    (leadMs) => {
      const state = clusterAtLead(leadMs);
      const position = state.fight.events.length - 1;
      const binding = stackAt(state, position);
      expect(binding).toMatchObject({
        state: "BOUND_SET",
        proof: "WINDOW_ORDER_INVARIANT_SET",
        possibleStacks: [1, 2],
        anchor: { reportTimeMs: 1000, operation: "APPLIED" },
        windowOrderInvariance: {
          beforeClusterStack: 1,
          beforeClusterProof: "EXACT_STACK_APPLICATION",
          afterClusterStack: 2,
          cluster: [
            { reportTimeMs: 5000 - leadMs, operation: "APPLIED", isStackChange: true, leadMs },
            { reportTimeMs: 5000 - leadMs, operation: "REFRESHED", isStackChange: false, leadMs },
          ],
        },
      });
      expect(bindBloodAura(input(state, position), EBQ_ATOM)).toMatchObject({
        state: "UNBOUND",
        reason: "PRE_DECISION_WINDOW_TRANSITION",
      });
      // The evaluator seam receives the set, never a number.
      expect(bloodStackBindingsFrom([binding])).toEqual([
        {
          name: EBQ_ATOM,
          stack: { state: "ONE_OF_NUMBERS", values: [1, 2], reason: "STATE_NOT_ESTABLISHED" },
        },
      ]);
    },
  );

  it("at a 51 ms lead the window does not apply and the ordinary rule binds the exact count", () => {
    const state = clusterAtLead(51);
    expect(stackAt(state, 3)).toMatchObject({ state: "BOUND", stack: 2, proof: "EXACT_STACK_OBSERVATION" });
  });

  it("{5,6} and {4,5} are what the corpus shapes produce; {6,7} is still a set — the evaluator, not this module, decides `<7`", () => {
    const build = (before: number, after: number) =>
      stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 2000, "APPLIED", before),
        aura(2, 2000, "REFRESHED"),
        aura(3, 5000, "APPLIED", after),
        aura(4, 5000, "REFRESHED"),
        cast(5, 5000, VAMPIRIC_STRIKE),
      ]);
    expect(stackAt(build(5, 6), 5)).toMatchObject({ state: "BOUND_SET", possibleStacks: [5, 6] });
    expect(stackAt(build(4, 5), 5)).toMatchObject({ state: "BOUND_SET", possibleStacks: [4, 5] });
    expect(stackAt(build(6, 7), 5)).toMatchObject({ state: "BOUND_SET", possibleStacks: [6, 7] });
  });

  it("a fresh application in the window after a proven removal is { 0, 1 }, anchored on the removal", () => {
    const reapplied = stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 2000, "APPLIED", 7),
      aura(2, 3000, "REMOVED"),
      aura(3, 4990, "APPLIED"),
      cast(4, 5000, VAMPIRIC_STRIKE),
    ]);
    expect(stackAt(reapplied, 4)).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [0, 1],
      anchor: { reportTimeMs: 3000, operation: "REMOVED" },
      windowOrderInvariance: {
        beforeClusterStack: 0,
        beforeClusterProof: "PROVEN_INACTIVE_BEFORE_APPLICATION",
        afterClusterStack: 1,
      },
    });
    // An application while the aura is held is not the fresh shape.
    const held = stateOf([
      aura(0, 1000, "APPLIED", 3),
      aura(1, 4990, "APPLIED"),
      cast(2, 5000, VAMPIRIC_STRIKE),
    ]);
    expect(stackAt(held, 2)).toMatchObject({ state: "UNBOUND", reason: "PRE_DECISION_WINDOW_TRANSITION" });
  });

  it("the first application in the track inside the window is NOT { 0, 1 }: no prior EBQ transition proves nothing (no aura event != aura inactive), so the initial state stays unknown", () => {
    // The M4 rule the set must not bypass: at the position before the
    // application the presence is AMBIGUOUS_INITIAL_STATE, not INACTIVE.
    const fresh = stateOf([
      cast(0, 4000, HEART_STRIKE),
      aura(1, 5000, "APPLIED"),
      cast(2, 5000, VAMPIRIC_STRIKE),
    ]);
    expect(bindBloodAura(input(fresh, 1), EBQ_ATOM)).toMatchObject({
      state: "UNBOUND",
      reason: "AURA_STATE_UNKNOWN",
      auraReason: "AMBIGUOUS_INITIAL_STATE",
    });
    const binding = stackAt(fresh, 2);
    expect(binding).toMatchObject({ state: "UNBOUND", reason: "PRE_DECISION_WINDOW_TRANSITION" });
    expect(binding.state === "UNBOUND" && binding.detail).toContain("AMBIGUOUS_INITIAL_STATE");
    // No ONE_OF binding reaches the evaluator seam from silence.
    expect(bloodStackBindingsFrom([binding])).toEqual([]);
    // The same at a 1 ms and a 50 ms lead, and with the application as the very first event.
    for (const leadMs of [1, 50]) {
      const state = stateOf([aura(0, 5000 - leadMs, "APPLIED"), cast(1, 5000, VAMPIRIC_STRIKE)]);
      expect(stackAt(state, 1)).toMatchObject({ state: "UNBOUND", reason: "PRE_DECISION_WINDOW_TRANSITION" });
    }
  });

  describe("refusals", () => {
    const refused = { state: "UNBOUND", reason: "PRE_DECISION_WINDOW_TRANSITION" };

    it("a lone refresh in the cluster: its second world is not an exact count", () => {
      const state = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 2000, "APPLIED", 7),
        aura(2, 5000, "REFRESHED"),
        cast(3, 5000, VAMPIRIC_STRIKE),
      ]);
      const binding = stackAt(state, 3);
      expect(binding).toMatchObject(refused);
      expect(binding.state === "UNBOUND" && binding.detail).toContain("0 application(s)");
    });

    it("a refresh 1 ms after the stack gain is not its companion", () => {
      const state = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 4990, "APPLIED", 2),
        aura(2, 4991, "REFRESHED"),
        cast(3, 5000, VAMPIRIC_STRIKE),
      ]);
      const binding = stackAt(state, 3);
      expect(binding).toMatchObject(refused);
      expect(binding.state === "UNBOUND" && binding.detail).toContain("not the same-millisecond companion");
    });

    it("a removal or a stack removal in the cluster", () => {
      const removed = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 4990, "REMOVED"),
        cast(2, 5000, DEATH_STRIKE),
      ]);
      expect(stackAt(removed, 2)).toMatchObject(refused);
      const stackRemoved = stateOf([
        aura(0, 1000, "APPLIED", 3),
        aura(1, 4990, "REMOVED", 2),
        cast(2, 5000, DEATH_STRIKE),
      ]);
      expect(stackAt(stackRemoved, 2)).toMatchObject(refused);
      const mixed = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 4980, "REMOVED"),
        aura(2, 4990, "APPLIED"),
        aura(3, 5000, "APPLIED", 2),
        cast(4, 5000, VAMPIRIC_STRIKE),
      ]);
      expect(stackAt(mixed, 4)).toMatchObject(refused);
    });

    it("two stack gains in one cluster", () => {
      const state = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 4990, "APPLIED", 2),
        aura(2, 5000, "APPLIED", 3),
        cast(3, 5000, VAMPIRIC_STRIKE),
      ]);
      const binding = stackAt(state, 3);
      expect(binding).toMatchObject(refused);
      expect(binding.state === "UNBOUND" && binding.detail).toContain("2 application(s)");
    });

    it("H1 unavailable: the cluster's stack gain is the first observation (no count before it)", () => {
      const state = stateOf([aura(0, 5000, "APPLIED", 2), cast(1, 5000, VAMPIRIC_STRIKE)]);
      const binding = stackAt(state, 1);
      expect(binding).toMatchObject(refused);
      expect(binding.state === "UNBOUND" && binding.detail).toContain("not exact");
    });

    it("H1 unavailable: a lone refresh before the cluster (Q2 declined — the count before the cluster is not carried across it)", () => {
      const state = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 2000, "APPLIED", 3),
        aura(2, 2000, "REFRESHED"),
        aura(3, 3500, "REFRESHED"),
        aura(4, 5000, "APPLIED", 4),
        cast(5, 5000, VAMPIRIC_STRIKE),
      ]);
      const binding = stackAt(state, 5);
      expect(binding).toMatchObject(refused);
      expect(binding.state === "UNBOUND" && binding.detail).toContain("COUNT_AMBIGUOUS_SINCE_OBSERVATION");
    });

    it("inconsistent maximum authority: a world above the effective maximum refuses the whole set", () => {
      const state = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 2000, "APPLIED", 7),
        aura(2, 5000, "APPLIED", 8),
        cast(3, 5000, VAMPIRIC_STRIKE),
      ]);
      expect(stackAt(state, 3)).toMatchObject({ state: "UNBOUND", reason: "COUNT_EXCEEDS_PINNED_MAX" });
      // { 5, 6 } under an unresolved talent: 6 is above the DBC 5 and unproven.
      const six = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 2000, "APPLIED", 5),
        aura(2, 5000, "APPLIED", 6),
        cast(3, 5000, VAMPIRIC_STRIKE),
      ]);
      expect(stackAt(six, 3, FRENZIED_UNKNOWN)).toMatchObject({
        state: "UNBOUND",
        reason: "COUNT_EXCEEDS_PINNED_MAX",
      });
      expect(stackAt(six, 3, WITH_FRENZIED)).toMatchObject({ state: "BOUND_SET", possibleStacks: [5, 6] });
    });

    it("identity isolation: a Bone Shield or Blood Debt cluster inside the window stays refused (no set for them)", () => {
      const bone = stateOf([
        aura(0, 1000, "APPLIED", 6, BONE_SHIELD_BUFF_SPELL_ID),
        aura(1, 5000, "APPLIED", 9, BONE_SHIELD_BUFF_SPELL_ID),
        cast(2, 5000, 195182),
      ]);
      expect(stackAt(bone, 2, BASE_TALENTS, "bone_shield")).toMatchObject({
        ...refused,
        windowTransition: { leadMs: 0 },
      });
      const debt = stateOf([
        aura(0, 1000, "APPLIED", null, BLOOD_DEBT_BUFF_SPELL_ID),
        aura(1, 5000, "APPLIED", 2, BLOOD_DEBT_BUFF_SPELL_ID),
        cast(2, 5000, DEATH_STRIKE),
      ]);
      expect(stackAt(debt, 2, BASE_TALENTS, "blood_debt")).toMatchObject({
        ...refused,
        windowTransition: { leadMs: 0 },
      });
    });
  });
});

describe("over the committed evidence", () => {
  const stackOf = (state: CombatState, reportTimeMs: number, abilityGameId: number) =>
    bindSupportedBloodStacks({
      state,
      actorId: ACTOR,
      position: at(state, reportTimeMs, abilityGameId),
      talents: { frenzied_bloodthirst: selected("frenzied_bloodthirst") },
      heroTree: SANLAYN,
    }).find((binding) => binding.atomName === EBQ_ATOM);

  it("bundle: the three resolving Vampiric Strikes carry { 5,6 }, { 4,5 } and { 5,6 } from their own stack gain and the exact count before it", () => {
    const state = corpusBundleState(BUNDLE, []);
    expect(stackOf(state, 2_015_029, VAMPIRIC_STRIKE)).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [5, 6],
      windowOrderInvariance: {
        beforeClusterStack: 5,
        beforeClusterProof: "EXACT_STACK_OBSERVATION",
        afterClusterStack: 6,
        cluster: [
          { reportTimeMs: 2_015_029, operation: "APPLIED", isStackChange: true, leadMs: 0 },
          { reportTimeMs: 2_015_029, operation: "REFRESHED", isStackChange: false, leadMs: 0 },
        ],
      },
      anchor: { reportTimeMs: 2_012_773 },
    });
    expect(stackOf(state, 2_103_820, VAMPIRIC_STRIKE)).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [4, 5],
      anchor: { reportTimeMs: 2_101_867 },
    });
    expect(stackOf(state, 2_105_703, VAMPIRIC_STRIKE)).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [5, 6],
      windowOrderInvariance: {
        cluster: [
          { reportTimeMs: 2_105_702, operation: "APPLIED", isStackChange: true, leadMs: 1 },
          { reportTimeMs: 2_105_702, operation: "REFRESHED", isStackChange: false, leadMs: 1 },
        ],
      },
    });
  });

  it("bundle: { 6,7 } at 2,017,274 and 2,106,638 is a set the list cannot decide, and stays one", () => {
    const state = corpusBundleState(BUNDLE, []);
    expect(stackOf(state, 2_017_274, VAMPIRIC_STRIKE)).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [6, 7],
    });
    expect(stackOf(state, 2_106_638, VAMPIRIC_STRIKE)).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [6, 7],
    });
  });

  it("bundle: 2,101,867 is refused — its count before the cluster (3 at 2,093,666) lies across the lone refresh at 2,099,885 (Q2 declined)", () => {
    const state = corpusBundleState(BUNDLE, []);
    const binding = stackOf(state, 2_101_867, VAMPIRIC_STRIKE);
    expect(binding).toMatchObject({ state: "UNBOUND", reason: "PRE_DECISION_WINDOW_TRANSITION" });
    expect(binding?.state === "UNBOUND" && binding.detail).toContain("2099885");
  });

  it("bundle: exact counts outside the window — 6 at the Marrowrend 2,015,770, 5 at the Death Strike 2,104,758, 1 at the Death Strike 2,084,304 after the fresh application; a lone refresh breaks the carry at 2,100,867 and 2,111,469", () => {
    const state = corpusBundleState(BUNDLE, []);
    expect(stackOf(state, 2_015_770, 195182)).toMatchObject({
      state: "BOUND",
      stack: 6,
      proof: "EXACT_STACK_OBSERVATION",
    });
    expect(stackOf(state, 2_104_758, DEATH_STRIKE)).toMatchObject({
      state: "BOUND",
      stack: 5,
      proof: "EXACT_STACK_OBSERVATION",
    });
    expect(stackOf(state, 2_084_304, DEATH_STRIKE)).toMatchObject({
      state: "BOUND",
      stack: 1,
      proof: "EXACT_STACK_APPLICATION",
    });
    expect(stackOf(state, 2_100_867, 50842)).toMatchObject({
      state: "UNBOUND",
      reason: "COUNT_AMBIGUOUS_SINCE_OBSERVATION",
    });
    expect(stackOf(state, 2_111_469, 50842)).toMatchObject({
      state: "UNBOUND",
      reason: "COUNT_AMBIGUOUS_SINCE_OBSERVATION",
    });
  });

  it("45 s: the first application in the track at 2,008,597 is refused (AMBIGUOUS_INITIAL_STATE before it, never { 0,1 } from silence); the Heart Strike at 2,020,278 is 7 exact only until the lone refresh at 2,018,024 — so it is ambiguous", () => {
    const state = corpusState(BLOOD45);
    const first = stackOf(state, 2_008_597, VAMPIRIC_STRIKE);
    expect(first).toMatchObject({ state: "UNBOUND", reason: "PRE_DECISION_WINDOW_TRANSITION" });
    expect(first?.state === "UNBOUND" && first.detail).toContain("AMBIGUOUS_INITIAL_STATE");
    expect(stackOf(state, 2_020_278, HEART_STRIKE)).toMatchObject({
      state: "UNBOUND",
      reason: "COUNT_AMBIGUOUS_SINCE_OBSERVATION",
    });
  });

  it("opener: the same shapes on the second subject — { 5,6 } at 2,425,025, the refresh 1 ms after the stack gain at 2,428,096 refused, and the first application in the track at 2,418,659 refused rather than { 0,1 }", () => {
    const state = corpusState(OPENER);
    const first = stackOf(state, 2_418_659, VAMPIRIC_STRIKE);
    expect(first).toMatchObject({ state: "UNBOUND", reason: "PRE_DECISION_WINDOW_TRANSITION" });
    expect(first?.state === "UNBOUND" && first.detail).toContain("AMBIGUOUS_INITIAL_STATE");
    expect(stackOf(state, 2_425_025, VAMPIRIC_STRIKE)).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [5, 6],
    });
    expect(stackOf(state, 2_428_096, VAMPIRIC_STRIKE)).toMatchObject({
      state: "UNBOUND",
      reason: "PRE_DECISION_WINDOW_TRANSITION",
    });
  });
});
