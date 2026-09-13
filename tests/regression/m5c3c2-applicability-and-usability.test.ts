/**
 * M5-C3c2 on real data: the blocker moves from `cds[1]` to `misc_cds[0]`.
 *
 * WHAT THIS MILESTONE ACTUALLY CHANGED
 *
 * Before C3c2 the traversal stopped at `cds[1] invoke_external_buff` and said
 * UNKNOWN. Not because the evidence was thin — because the analyzer had no way
 * to express two facts it could already have proven:
 *
 *     an entry can be inapplicable  (the item is not equipped; the slot holds
 *                                    a trinket with no on-use effect)
 *     an entry can be unusable      (the external-buff pool is empty; the
 *                                    item's own cooldown exceeds the tolerance)
 *
 * With both, the scan walks past four items, one external buff and one
 * on-cooldown trinket, and comes to rest on the first entry whose answer really
 * is unknown: `misc_cds[0] potion`.
 *
 * THE ORDER IS WHY THE UNSUPPORTED SYNTAX DOES NOT MATTER
 *
 * `items[4]` and `items[5]` are gated on `variable.trinket_sync_slot`, which the
 * pinned APL never assigns. Under the pinned evaluation order — applicability,
 * then usability, then `if_expr` — neither condition is reached: one entry is
 * inapplicable and the other proven unusable before SimulationCraft would have
 * looked. That is asserted directly below, because it is the single most
 * load-bearing consequence of getting the order right.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED HERE
 *
 * That Garrote was correct. That the potion should have been used. That the
 * player erred. The result is still UNKNOWN, and the only thing that improved is
 * how far the evidence carries — which is the honest measure of this milestone.
 */

import { describe, expect, it } from "vitest";

import {
  M5C3C1_ACTOR,
  M5C3C1_IDS,
  M5C3C1_TARGET,
  garroteDecisionPosition,
  m5c3c1State,
  observedTalentEntries,
} from "../support/m5c3c1-fixture.js";
import { RESOURCE_WIRE_CONTRACTS } from "../../src/data/wcl-wire/resource-types.js";
import { resolveTalentSelection } from "../../src/data/game/rogue-talents.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import {
  ROTATIONAL_ENTRY_LIST,
  traverseRotationalAuthority,
} from "../../src/specs/rogue/assassination/rotational-traversal.js";
import {
  RACE_UNAVAILABLE_DETAIL,
  authorityProfileFor,
  observedProfileFrom,
  pinnedSimulationProfile,
  resolveTrinketSlots,
} from "../../src/specs/rogue/assassination/observed-profile.js";
import { slotOccupancy } from "../../src/simc/authority-profile.js";
import { itemEffectForItemId } from "../../src/data/game/rogue-item-effects.js";

/** The two trinkets actor 19 actually wore, and what the pinned data says. */
const TRINKET_1 = 270_173;
const TRINKET_2 = 273_796;
/** Vile Vial of Volatile Venom's on-use driver, observed cast 3854 ms before Q. */
const TRINKET_2_EFFECT = 1_293_316;
const TRINKET_2_COOLDOWN_MS = 120_000;
const TRINKET_2_ELAPSED_MS = 3_854;

function authorityOrThrow() {
  const loaded = pinnedAssassinationAuthority();
  if (!loaded.ok) throw new Error(`pinned authority unavailable: ${loaded.reason}`);
  return loaded.authority;
}

function wireTypeFor(resourceId: string): number {
  const contract = RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === resourceId);
  if (contract === undefined) throw new Error(`no wire contract for ${resourceId}`);
  return contract.wireType;
}

function knownTalentsFrom(state: ReturnType<typeof m5c3c1State>) {
  return ["improved_garrote", "shrouded_suffocation", "blindside", "improved_ambush"]
    .map((name) => resolveTalentSelection(observedTalentEntries(state), name))
    .filter((resolution) => resolution.selection !== "UNKNOWN")
    .map((resolution) => ({ name: resolution.simcName, taken: resolution.selection === "SELECTED" }));
}

/** The C3c2 traversal: identical to C3c1's apart from the profile. */
function traverseWithProfile() {
  const state = m5c3c1State();
  const profile = authorityProfileFor(state, M5C3C1_ACTOR);
  if (profile === null) throw new Error("the fixture must carry combatantinfo for actor 19");
  const traversal = traverseRotationalAuthority({
    state,
    actorId: M5C3C1_ACTOR,
    targetActorId: M5C3C1_TARGET,
    position: garroteDecisionPosition(state),
    observedAbilityGameId: M5C3C1_IDS.garrote,
    authority: authorityOrThrow(),
    comboPointWireType: wireTypeFor("COMBO_POINTS"),
    energyWireType: wireTypeFor("ENERGY"),
    comboPointResourceId: "COMBO_POINTS",
    energyResourceId: "ENERGY",
    knownTalents: knownTalentsFrom(state),
    profile,
  });
  if (traversal.status !== "TRAVERSED") throw new Error(`expected a traversal, got ${traversal.blocker}`);
  return traversal;
}

function stepAt(
  traversal: ReturnType<typeof traverseWithProfile>,
  listName: string,
  priorityOrdinal: number,
) {
  const step = traversal.result.steps.find(
    (entry) => entry.listName === listName && entry.priorityOrdinal === priorityOrdinal,
  );
  if (step === undefined) throw new Error(`traversal never visited ${listName}[${String(priorityOrdinal)}]`);
  return step;
}

describe("the observed profile is read from the log, and says what it cannot know", () => {
  it("resolves both trinket slots from pinned inventory types", () => {
    const state = m5c3c1State();
    const profile = authorityProfileFor(state, M5C3C1_ACTOR);
    expect(profile).not.toBeNull();
    if (profile === null) return;

    const trinket1 = slotOccupancy(profile.observed, "trinket1");
    const trinket2 = slotOccupancy(profile.observed, "trinket2");
    expect(trinket1.state).toBe("OCCUPIED");
    expect(trinket2.state).toBe("OCCUPIED");
    if (trinket1.state !== "OCCUPIED" || trinket2.state !== "OCCUPIED") return;
    expect(trinket1.item.itemId).toBe(TRINKET_1);
    expect(trinket2.item.itemId).toBe(TRINKET_2);
  });

  it("reports race UNKNOWN, because Warcraft Logs has no race field", () => {
    // NOT a gap left for later convenience. Verified across every queried
    // shape: ReportActor, Character, playerDetails, combatantinfo.
    const state = m5c3c1State();
    const profile = authorityProfileFor(state, M5C3C1_ACTOR);
    expect(profile?.observed.race.state).toBe("UNKNOWN");
    if (profile?.observed.race.state !== "UNKNOWN") return;
    expect(profile.observed.race.detail).toBe(RACE_UNAVAILABLE_DETAIL);
  });

  it("carries every equipped item id, slot or no slot", () => {
    // `use_item,name=<token>` asks whether an id is worn ANYWHERE. That answer
    // must not depend on slot resolution having succeeded.
    const state = m5c3c1State();
    const profile = authorityProfileFor(state, M5C3C1_ACTOR);
    if (profile === null) throw new Error("expected a profile");
    expect(profile.observed.equippedItems).toHaveLength(18);
    expect(profile.observed.equippedItems.filter((item) => item.slot !== null)).toHaveLength(2);
    expect(profile.observed.equippedItems.map((item) => item.itemId)).toContain(TRINKET_1);
  });

  it("resolves NO slots rather than a guess when the trinket count is wrong", () => {
    // One known trinket and one unmodelled item: naming the known one
    // `trinket1` would be position talking, with no evidence behind it.
    expect([...resolveTrinketSlots([{ itemId: TRINKET_1 }, { itemId: 42_360 }]).values()]).toEqual([]);
    expect([...resolveTrinketSlots([{ itemId: TRINKET_1 }]).values()]).toEqual([]);
    expect([...resolveTrinketSlots([]).values()]).toEqual([]);
  });

  it("answers NOT_RESOLVED, never EMPTY, for a slot it cannot read", () => {
    // THE fail-open this three-state design exists to prevent. An unreadable
    // slot must not read as an unequipped one.
    const unresolved = observedProfileFrom({
      actorId: M5C3C1_ACTOR,
      specId: null,
      gear: [],
      talentTree: [],
    });
    expect(slotOccupancy(unresolved, "trinket1").state).toBe("NOT_RESOLVED");
    expect(slotOccupancy(unresolved, "main_hand").state).toBe("NOT_RESOLVED");
  });

  it("treats the empty external-buff pool as a VALUE, not a gap", () => {
    const simulation = pinnedSimulationProfile();
    expect(simulation.externalBuffPool).toEqual([]);
    // If this were UNAVAILABLE, the negative usability verdict below would be
    // unlicensed: an unknown pool cannot prove ready() false.
    expect(simulation.externalBuffPoolSource).toBe("PINNED_SIMC_DEFAULT");
    expect(simulation.cooldownToleranceMs).toBe(250);
    expect(simulation.cooldownToleranceSource).toBe("PINNED_SIMC_DEFAULT");
  });
});

describe("the blocker moves from cds[1] to misc_cds[0]", () => {
  it("is UNKNOWN at default[5] -> cds[3] -> misc_cds[0] potion", () => {
    const traversal = traverseWithProfile();
    expect(traversal.result.kind).toBe("UNKNOWN");
    if (traversal.result.kind !== "UNKNOWN") return;

    expect(traversal.result.blockedAt?.listName).toBe("misc_cds");
    expect(traversal.result.blockedAt?.priorityOrdinal).toBe(0);
    expect(traversal.result.blockedAt?.actionToken).toBe("potion");
    expect(
      traversal.result.blockedAt?.path.map((entry) => `${entry.listName}[${String(entry.priorityOrdinal)}]`),
    ).toEqual(["default[5]", "cds[3]", "misc_cds[0]"]);
  });

  it("walks the whole items list on the way", () => {
    const traversal = traverseWithProfile();
    const labels = traversal.result.steps.map(
      (step) => `${step.listName}[${String(step.priorityOrdinal)}] ${step.actionToken} ${step.outcome}`,
    );
    expect(labels).toEqual([
      "default[4] ambush ELIMINATED_CONTINUE",
      "default[5] call_action_list BLOCKED",
      "cds[0] deathmark ELIMINATED_CONTINUE",
      "cds[1] invoke_external_buff PROVEN_UNUSABLE_CONTINUE",
      // The items list ran to the end without producing an action, so the scan
      // RESUMES in `cds` rather than stopping. Every one of its six entries was
      // decided; none was refused.
      "cds[2] call_action_list CALL_RETURNED_NO_ACTION_CONTINUE",
      "items[0] variable VARIABLE_EXECUTED_CONTINUE",
      "items[1] use_item NOT_APPLICABLE_CONTINUE",
      "items[2] use_item NOT_APPLICABLE_CONTINUE",
      "items[3] use_item NOT_APPLICABLE_CONTINUE",
      "items[4] use_items NOT_APPLICABLE_CONTINUE",
      "items[5] use_items PROVEN_UNUSABLE_CONTINUE",
      "cds[3] call_action_list BLOCKED",
      "misc_cds[0] potion BLOCKED",
    ]);
  });

  it("stops on a condition it cannot evaluate, not on a missing profile", () => {
    // The new resting place is an HONEST refusal: `potion` is gated on
    // `buff.bloodlust.react`, which is outside the supported expression subset.
    // Worth asserting, because "we ran out of profile" and "we ran out of
    // supported syntax" are different kinds of incompleteness and only the
    // second is a coverage gap this milestone did not set out to close.
    const traversal = traverseWithProfile();
    if (traversal.result.kind !== "UNKNOWN") throw new Error("expected UNKNOWN");
    expect(traversal.result.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
    const potion = stepAt(traversal, "misc_cds", 0);
    expect(potion.applicability.kind).toBe("APPLICABLE");
    expect(potion.gate.kind).toBe("UNSUPPORTED");
  });

  it("still never reaches core_dot, and still selects nothing", () => {
    const traversal = traverseWithProfile();
    expect(traversal.result.kind).not.toBe("SELECTED");
    expect(traversal.result.steps.some((step) => step.listName === "core_dot")).toBe(false);
  });
});

describe("each negative verdict carries the evidence that established it", () => {
  it("skips three named items because the actor does not equip them", () => {
    const traversal = traverseWithProfile();
    for (const ordinal of [1, 2, 3]) {
      const step = stepAt(traversal, "items", ordinal);
      expect(step.applicability.kind).toBe("NOT_APPLICABLE");
      if (step.applicability.kind !== "NOT_APPLICABLE") continue;
      expect(step.applicability.reason).toBe("ITEM_NOT_EQUIPPED");
      expect(step.applicability.evidence.pinnedBehaviour).toContain("background = true");
      // A NUMBER, and one the actor demonstrably does not wear.
      expect(step.applicability.evidence.itemId).toBeGreaterThan(0);
    }
  });

  it("skips trinket1 because its equipped item has no ON_USE effect at all", () => {
    // The distinction the milestone turns on: Zul'jin's Guillotine Technique is
    // equipped and is NOT on cooldown. SimulationCraft builds no usable action
    // for it, so there is nothing to be ready.
    const traversal = traverseWithProfile();
    const step = stepAt(traversal, "items", 4);
    expect(step.applicability.kind).toBe("NOT_APPLICABLE");
    if (step.applicability.kind !== "NOT_APPLICABLE") return;
    expect(step.applicability.reason).toBe("NO_ON_USE_EFFECT");
    expect(step.applicability.evidence.slot).toBe("trinket1");
    expect(step.applicability.evidence.itemId).toBe(TRINKET_1);
    expect(itemEffectForItemId(TRINKET_1)?.onUseEffect).toBeNull();
    // And it is NOT reported as a cooldown. Checked, because reporting gear as
    // timing is the specific wrong answer here.
    expect(step.usabilityVerdict).toBeNull();
  });

  it("proves trinket2 unusable from its own cooldown, past the queueing tolerance", () => {
    const traversal = traverseWithProfile();
    const step = stepAt(traversal, "items", 5);
    expect(step.applicability.kind).toBe("APPLICABLE");
    expect(step.usabilityVerdict?.kind).toBe("PROVEN_UNUSABLE");
    if (step.usabilityVerdict?.kind !== "PROVEN_UNUSABLE") return;
    expect(step.usabilityVerdict.reason).toBe("ACTIVE_COOLDOWN");

    const evidence = step.usabilityVerdict.evidence;
    expect(evidence.itemId).toBe(TRINKET_2);
    expect(evidence.abilityGameId).toBe(TRINKET_2_EFFECT);
    expect(evidence.provenRemainingAtLeastMs).toBe(TRINKET_2_COOLDOWN_MS - TRINKET_2_ELAPSED_MS);
    // The comparison threshold is an INPUT from the simulation profile, not a
    // constant inside the bridge. 116146 > 250 by a wide margin, which is why
    // the bound suffices even though it is only a lower bound.
    expect(evidence.cooldownToleranceMs).toBe(250);
    expect(evidence.provenRemainingAtLeastMs ?? 0).toBeGreaterThan(evidence.cooldownToleranceMs ?? 0);
  });

  it("proves the external buff unusable from the pool, not from the log", () => {
    // Emphatically not "no Power Infusion was observed" and not "no Priest was
    // present". Those are facts about a fight; this is a fact about the pinned
    // authority's configuration.
    const traversal = traverseWithProfile();
    const step = stepAt(traversal, "cds", 1);
    expect(step.usabilityVerdict?.kind).toBe("PROVEN_UNUSABLE");
    if (step.usabilityVerdict?.kind !== "PROVEN_UNUSABLE") return;
    expect(step.usabilityVerdict.reason).toBe("STATIC_READY_FALSE");
    expect(step.usabilityVerdict.evidence.detail).toContain("external-buff source");
    expect(step.usabilityVerdict.evidence.detail).toContain("ready() returns false");
    // No cooldown numbers: this is not a timing claim.
    expect(step.usabilityVerdict.evidence.provenRemainingAtLeastMs).toBeNull();
    expect(step.usabilityVerdict.evidence.cooldownToleranceMs).toBeNull();
  });
});

describe("a decided entry never has its condition evaluated", () => {
  it("leaves items[4] and items[5] conditions unevaluated, unsupported syntax and all", () => {
    // BOTH are gated on `variable.trinket_sync_slot`, which the pinned APL never
    // assigns. Under SimulationCraft's real order those conditions are never
    // reached. Had this been implemented condition-first, the scan would have
    // blocked here on syntax that cannot affect the answer.
    const traversal = traverseWithProfile();
    for (const ordinal of [4, 5]) {
      const step = stepAt(traversal, "items", ordinal);
      expect(step.gate.kind).toBe("NOT_EVALUATED");
    }
    expect(stepAt(traversal, "items", 4).gate).toEqual({
      kind: "NOT_EVALUATED",
      why: "NOT_APPLICABLE",
    });
    expect(stepAt(traversal, "items", 5).gate).toEqual({
      kind: "NOT_EVALUATED",
      why: "PROVEN_UNUSABLE",
    });
  });

  it("keeps a readiness elimination distinguishable from a false condition", () => {
    // `cds[0] deathmark` was ELIMINATED because its CONDITION is false.
    // `cds[1]` was eliminated because it could not FIRE. Same effect on the
    // scan, different facts, and a report that conflated them would tell the
    // player the wrong thing about both.
    const traversal = traverseWithProfile();
    expect(stepAt(traversal, "cds", 0).outcome).toBe("ELIMINATED_CONTINUE");
    expect(stepAt(traversal, "cds", 0).gate.kind).toBe("EVALUATED");
    expect(stepAt(traversal, "cds", 1).outcome).toBe("PROVEN_UNUSABLE_CONTINUE");
    expect(stepAt(traversal, "cds", 1).gate.kind).toBe("NOT_EVALUATED");
  });
});

describe("without a profile, nothing about applicability is claimed", () => {
  it("leaves every entry APPLICABLE and blocks where C3c1 blocked", () => {
    // The C3c1 regression asserts this same result in full. Re-asserted from
    // here so the dependency is explicit: the profile is what licenses the new
    // verdicts, and its absence must remove them rather than default them.
    const state = m5c3c1State();
    const traversal = traverseRotationalAuthority({
      state,
      actorId: M5C3C1_ACTOR,
      targetActorId: M5C3C1_TARGET,
      position: garroteDecisionPosition(state),
      observedAbilityGameId: M5C3C1_IDS.garrote,
      authority: authorityOrThrow(),
      comboPointWireType: wireTypeFor("COMBO_POINTS"),
      energyWireType: wireTypeFor("ENERGY"),
      comboPointResourceId: "COMBO_POINTS",
      energyResourceId: "ENERGY",
      knownTalents: knownTalentsFrom(state),
    });
    if (traversal.status !== "TRAVERSED") throw new Error("expected a traversal");
    expect(traversal.result.kind).toBe("UNKNOWN");
    if (traversal.result.kind !== "UNKNOWN") return;
    expect(traversal.result.blockedAt?.listName).toBe("cds");
    expect(traversal.result.blockedAt?.priorityOrdinal).toBe(1);
    for (const step of traversal.result.steps) {
      expect(step.applicability.kind).toBe("APPLICABLE");
      expect(step.usability).not.toBe("PROVEN_UNUSABLE");
    }
  });

  it("starts from the same C1 boundary either way", () => {
    const withProfile = traverseWithProfile();
    expect(withProfile.boundary.startOrdinal).toBe(4);
    expect([...withProfile.boundary.provenExcludedOrdinals].sort()).toEqual([0, 1, 2, 3]);
    expect(
      withProfile.result.steps
        .filter((step) => step.listName === ROTATIONAL_ENTRY_LIST)
        .every((step) => step.priorityOrdinal >= 4),
    ).toBe(true);
  });
});
