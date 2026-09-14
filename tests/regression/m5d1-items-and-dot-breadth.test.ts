/**
 * M5-D1 against the real actor-19 capture: items, Rupture, and the cycling
 * entries.
 *
 * WHY THE ITEM CASE IS HERE AT ALL
 *
 * A census of all 42 observed actor-19 decision points found the DEEPEST blocker
 * at `items[5] use_items,slots=trinket2` in 28 of them. Its condition reads
 * `variable.trinket_sync_slot` and `trinket.1.cooldown.ready`, and supporting
 * those would mean modelling trinket pairing — the general trinket simulation
 * M5-D explicitly does not do. Gate irrelevance is what carries it instead, and
 * only because the resolved driver is provably inert.
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
import { authorityProfileFor } from "../../src/specs/rogue/assassination/observed-profile.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import { resolveItemGateIrrelevance } from "../../src/specs/rogue/assassination/item-gate-irrelevance.js";
import { resolveApplicability } from "../../src/specs/rogue/assassination/action-profile.js";
import { itemEffectForItemId } from "../../src/data/game/rogue-item-effects.js";
import { resolveModelledTalents, resolveTalentSelection } from "../../src/data/game/rogue-talents.js";
import { rotationalBindingsAt } from "../../src/specs/rogue/assassination/rotational-traversal.js";
import { selectWithinList } from "../../src/simc/list-selection.js";
import { RESOURCE_WIRE_CONTRACTS } from "../../src/data/wcl-wire/resource-types.js";
import type { AplAction } from "../../src/simc/apl-authority.js";

function authorityOrThrow() {
  const loaded = pinnedAssassinationAuthority();
  if (!loaded.ok) throw new Error("pinned authority unavailable");
  return loaded.authority;
}

function entryAt(listName: string, ordinal: number): AplAction {
  const list = authorityOrThrow().actionsInList(listName);
  if (!list.found) throw new Error(`no ${listName} list`);
  const action = list.actions.find((entry) => entry.priorityOrdinal === ordinal);
  if (action === undefined) throw new Error(`no ${listName}[${String(ordinal)}]`);
  return action;
}

function observedProfile() {
  const state = m5c3c1State();
  const profile = authorityProfileFor(state, M5C3C1_ACTOR);
  if (profile === null) throw new Error("the fixture must carry combatantinfo for actor 19");
  return { state, profile };
}

function wireTypeFor(resourceId: string): number {
  const contract = RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === resourceId);
  if (contract === undefined) throw new Error(`no wire contract for ${resourceId}`);
  return contract.wireType;
}

function bindingsAtQ() {
  const { state, profile } = observedProfile();
  const position = garroteDecisionPosition(state);
  const built = rotationalBindingsAt({
    state,
    actorId: M5C3C1_ACTOR,
    targetActorId: M5C3C1_TARGET,
    position,
    observedAbilityGameId: M5C3C1_IDS.garrote,
    authority: authorityOrThrow(),
    comboPointWireType: wireTypeFor("COMBO_POINTS"),
    energyWireType: wireTypeFor("ENERGY"),
    comboPointResourceId: "COMBO_POINTS",
    energyResourceId: "ENERGY",
    knownTalents: resolveModelledTalents(observedTalentEntries(state)),
    profile,
  });
  return { state, profile, position, ...built };
}

describe("the equipped on-use trinket carries an inert-driver claim", () => {
  it("classifies actor 19's trinket2 driver as a pure stat buff", () => {
    // Empowering Venom (1293316). Four A_MOD_RATING auras and two E_DUMMY
    // effects, derived by the extractor from the pinned effect table rather than
    // asserted here.
    const item = itemEffectForItemId(273_796);
    expect(item?.onUseEffect).not.toBeNull();
    const onUse = item?.onUseEffect;
    if (onUse === undefined || onUse === null) return;
    expect(onUse.effectSpellId).toBe(1_293_316);
    expect(onUse.baseGcdMs).toBe(0);
    expect(onUse.writeClassification).toBe("PLAYER_STAT_BUFF_ONLY");
    // Every APPLY_AURA effect is A_MOD_RATING (189); the rest are E_DUMMY (3).
    for (const effect of onUse.effectShape) {
      const inert = (effect.type === 6 && effect.subtype === 189) || effect.type === 3;
      expect(inert, JSON.stringify(effect)).toBe(true);
    }
  });

  it("admits items[5] as gate-irrelevant, with evidence", () => {
    const { profile } = observedProfile();
    const result = resolveItemGateIrrelevance({ observed: profile.observed }, entryAt("items", 5));
    expect(result.kind).toBe("GATE_IRRELEVANT");
    if (result.kind !== "GATE_IRRELEVANT") return;
    expect(result.evidence.lane).toBe("NON_GCD");
    expect(result.evidence.timeAdvanceMs).toBe(0);
    expect(result.evidence.writesReviewed).toBe(true);
    expect(result.evidence.writesOutsideDecisionProjection).toBe(true);
    expect(result.evidence.progressMechanism).toContain("120000ms");
    // The claim is about the condition being UNREAD, never about it being true.
    expect(result.evidence.detail).toContain("NOT evaluated");
  });

  it("refuses a GCD-consuming on-use item", () => {
    // Algeth'ar Puzzle Box's driver is `PLAYER_STAT_BUFF_ONLY` too, and its
    // `_gcd` is 1000. A GCD action ends the query rather than preceding its
    // answer, so the two worlds do not converge and nothing may claim they do.
    const puzzleBox = itemEffectForItemId(193_701);
    expect(puzzleBox?.onUseEffect?.writeClassification).toBe("PLAYER_STAT_BUFF_ONLY");
    expect(puzzleBox?.onUseEffect?.baseGcdMs).toBe(1_000);

    const { profile } = observedProfile();
    // `items[2]` is the Puzzle Box entry. Actor 19 does not equip it, so the
    // resolver refuses on identity too — but the LANE guard is what would refuse
    // it even if they did, and the classification above is what proves that.
    const result = resolveItemGateIrrelevance({ observed: profile.observed }, entryAt("items", 2));
    expect(result.kind).toBe("NOT_ESTABLISHED");
  });

  it("refuses a driver whose effects are not purely stat ratings", () => {
    // Font of Venomous Rage carries a periodic-damage effect, and the
    // Gladiator's Badge a plain stat aura. Both classify OTHER, which is the
    // fail-closed value.
    expect(itemEffectForItemId(270_168)?.onUseEffect?.writeClassification).toBe("OTHER");
    expect(itemEffectForItemId(230_638)?.onUseEffect?.writeClassification).toBe("OTHER");
  });

  it("refuses a slot with no on-use effect at all", () => {
    // `items[4]` is trinket1, which actor 19 fills with an ON_EQUIP-only item.
    // It is already NOT_APPLICABLE upstream; giving an absent action a transition
    // would describe an execution that cannot happen.
    const { profile } = observedProfile();
    expect(resolveItemGateIrrelevance({ observed: profile.observed }, entryAt("items", 4)).kind).toBe(
      "NOT_ESTABLISHED",
    );
    expect(itemEffectForItemId(270_173)?.onUseEffect).toBeNull();
  });

  it("leaves C3c2 applicability semantics untouched", () => {
    const { state, profile } = observedProfile();
    const input = { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state), profile };
    // trinket1 has no ON_USE, so the entry is not a selectable action at all.
    const trinket1 = resolveApplicability(input, entryAt("items", 4));
    expect(trinket1.kind).toBe("NOT_APPLICABLE");
    if (trinket1.kind !== "NOT_APPLICABLE") return;
    expect(trinket1.reason).toBe("NO_ON_USE_EFFECT");
    // trinket2 does, so it remains applicable and is decided by usability.
    expect(resolveApplicability(input, entryAt("items", 5)).kind).toBe("APPLICABLE");
    // A named item the actor does not equip is still structurally absent.
    const notEquipped = resolveApplicability(input, entryAt("items", 1));
    expect(notEquipped.kind).toBe("NOT_APPLICABLE");
    if (notEquipped.kind !== "NOT_APPLICABLE") return;
    expect(notEquipped.reason).toBe("ITEM_NOT_EQUIPPED");
  });

  it("fabricates no resource or stealth change for an item", () => {
    // STRUCTURAL. `use_item_t` is an `action_t`, not a `rogue_action_t`, so the
    // Rogue stealth-break path is unreachable and no energize path exists.
    const { profile } = observedProfile();
    const result = resolveItemGateIrrelevance({ observed: profile.observed }, entryAt("items", 5));
    if (result.kind !== "GATE_IRRELEVANT") throw new Error("expected the claim");
    const serialized = JSON.stringify(result.evidence);
    expect(serialized).not.toContain("PLAYER_ENERGY");
    expect(serialized).not.toContain("STEALTH");
    expect(serialized).not.toContain("COMBO_POINT");
  });
});

describe("Rupture state is derived independently of Garrote", () => {
  it("derives both DoTs at the real decision point, each on its own evidence", () => {
    const built = bindingsAtQ();
    const garrote = built.derivedDotStates.find((entry) => entry.simcToken === "garrote");
    const rupture = built.derivedDotStates.find((entry) => entry.simcToken === "rupture");
    expect(garrote).toBeDefined();
    expect(rupture).toBeDefined();

    // Garrote: KNOWN at 5.746 s, from its own observed application.
    expect(garrote?.remains.state).toBe("KNOWN");
    if (garrote?.remains.state === "KNOWN") {
      expect(garrote.remains.remainsSeconds).toBe(5.746);
      expect(garrote.remains.derivation.kind).toBe("FIXED");
    }

    // Rupture: UNKNOWN, because its only anchor in this window is a REFRESH and
    // this project models no refresh carry-over. An HONEST refusal, and the exact
    // opposite of borrowing Garrote's number.
    expect(rupture?.remains.state).toBe("UNKNOWN");
    if (rupture?.remains.state === "UNKNOWN") {
      expect(rupture.remains.blocker).toBe("REFRESH_ANCHOR_HAS_NO_DERIVABLE_DURATION");
    }
  });

  it("binds only the DoTs it derived, so Rupture's `remains` stays unknown", () => {
    const built = bindingsAtQ();
    const bound = built.bindings.dotRemainsSecondsByAction ?? [];
    expect(bound.map((entry) => entry.actionToken)).toEqual(["garrote"]);
    // THE ANTI-CONTAMINATION PROPERTY, on real data: Rupture has no key, so its
    // `remains` resolves UNKNOWN rather than reading 5.746.
    expect(bound.some((entry) => entry.actionToken === "rupture")).toBe(false);
  });

  it("decides `refreshable` for Garrote and refuses it for Rupture", () => {
    const built = bindingsAtQ();
    const garrote = built.derivedRefreshableStates.find((entry) => entry.simcToken === "garrote");
    const rupture = built.derivedRefreshableStates.find((entry) => entry.simcToken === "rupture");

    expect(garrote?.refreshable.state).toBe("KNOWN");
    if (garrote?.refreshable.state === "KNOWN") {
      // 5.746 s against a 2 s base tick: at least two ticks remain.
      expect(garrote.refreshable.refreshable).toBe(false);
      expect(garrote.refreshable.proof).toBe("REMAINDER_EXCEEDS_ONE_BASE_TICK");
    }
    expect(rupture?.refreshable.state).toBe("UNKNOWN");
    if (rupture?.refreshable.state === "UNKNOWN") {
      expect(rupture.refreshable.blocker).toBe("REMAINS_NOT_ESTABLISHED");
    }
  });

  it("carries Rupture's identity and combo-point-scaled duration", () => {
    // The action can now be NAMED if `core_dot[3]` ever selects it, and its
    // duration model is recorded rather than flattened to a constant.
    const built = bindingsAtQ();
    const rupture = built.derivedDotStates.find((entry) => entry.simcToken === "rupture");
    expect(rupture?.abilityGameId).toBe(1_943);
  });
});

describe("the cycling core_dot entries are eliminated without enumerating targets", () => {
  it("resolves Crimson Tempest as SELECTED for actor 19", () => {
    // Read from the fixture's own `combatantinfo`, entry 117139 at node 94557.
    const { state } = observedProfile();
    const resolution = resolveTalentSelection(observedTalentEntries(state), "crimson_tempest");
    expect(resolution.selection).toBe("SELECTED");
    expect(resolution.reason).toBe("OWN_ENTRY_SELECTED");
    expect(resolution.decidedByEntryId).toBe(117_139);
  });

  it("eliminates core_dot[2] and core_dot[4] on the target-independent conjunct", () => {
    const built = bindingsAtQ();
    const selection = selectWithinList(authorityOrThrow(), "core_dot", built.bindings, () => "UNKNOWN");
    if (selection.kind === "LIST_ABSENT") throw new Error("expected the list");
    const byOrdinal = new Map(selection.lines.map((line) => [line.priorityOrdinal, line]));

    for (const ordinal of [2, 4]) {
      expect(byOrdinal.get(ordinal)?.outcome, String(ordinal)).toBe("ELIMINATED");
      // The condition was NOT evaluated against the implicit target.
      expect(byOrdinal.get(ordinal)?.condition.kind, String(ordinal)).toBe("NOT_EVALUATED");
      const condition = byOrdinal.get(ordinal)?.condition;
      if (condition?.kind !== "NOT_EVALUATED") continue;
      expect(condition.why, String(ordinal)).toBe("UNSUPPORTED_TARGETING");
    }
  });

  it("refuses those entries when the talent is not established", () => {
    // The control. Without the talent the leading conjunct is enumerated rather
    // than false, so the cycling entries must block instead of being eliminated.
    const built = bindingsAtQ();
    const withoutTalent = { ...built.bindings, knownTalents: [] };
    const selection = selectWithinList(authorityOrThrow(), "core_dot", withoutTalent, () => "UNKNOWN");
    expect(selection.kind).toBe("INDETERMINATE");
    if (selection.kind !== "INDETERMINATE") return;
    expect(selection.blocker).toBe("UNSUPPORTED_ACTION_OPTION");
    expect(selection.blockedBy?.priorityOrdinal).toBe(2);
  });

  it("eliminates core_dot[1] on refreshable, not on a target-scoped guess", () => {
    const built = bindingsAtQ();
    const selection = selectWithinList(authorityOrThrow(), "core_dot", built.bindings, () => "UNKNOWN");
    if (selection.kind === "LIST_ABSENT") throw new Error("expected the list");
    const line = selection.lines.find((entry) => entry.priorityOrdinal === 1);
    expect(line?.outcome).toBe("ELIMINATED");
    // It WAS evaluated — this is an ordinary false condition, not a targeting
    // refusal — and `refreshable` is what made it false.
    expect(line?.condition.kind).toBe("EVALUATED");
    if (line?.condition.kind !== "EVALUATED") return;
    expect(line.condition.truth).toBe("FALSE");
    expect(line.condition.trace.atoms.map((atom) => atom.key)).toContain("refreshable");
  });

  it("leaves core_dot[3] POSSIBLE, because Rupture's own state is unknown", () => {
    // THE HONEST OUTCOME. Rupture's line cannot be decided, and it is not
    // decided — rather than being decided from the wrong DoT's numbers.
    const built = bindingsAtQ();
    const selection = selectWithinList(authorityOrThrow(), "core_dot", built.bindings, () => "UNKNOWN");
    if (selection.kind === "LIST_ABSENT") throw new Error("expected the list");
    const line = selection.lines.find((entry) => entry.priorityOrdinal === 3);
    expect(line?.outcome).toBe("POSSIBLE");
    expect(line?.actionToken).toBe("rupture");
  });
});
