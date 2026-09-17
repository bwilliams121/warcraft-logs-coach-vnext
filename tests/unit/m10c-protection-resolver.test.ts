/**
 * M10-C: the Protection Paladin resolver and action profile.
 *
 * Each newly supported identifier gets its positive, negative and unknown
 * case. Real-evidence cases run over the committed M10-B opener; every other
 * premise is SYNTHETIC and says so.
 */

import { describe, expect, it } from "vitest";

import type { CombatState } from "../../src/engine/state/combat-state.js";
import { corpusState, positionOfCast } from "../support/corpus/fight.js";
import {
  APEX_TIER_TWO_TREE,
  BLESSED_HAMMER,
  DIVINE_TOLL,
  HAND_OF_RECKONING,
  JUDGMENT,
  LIGHTSMITH_TREE,
  NO_HERO_TREE,
  PROT_ACTOR,
  SHIELD_OF_THE_RIGHTEOUS,
  TEMPLAR_TREE,
  protCast,
  protCombatantInfo,
  protState,
  syntheticProtectionAuthority,
} from "../support/protection-paladin-fixture.js";
import { pinnedProtectionPaladinAuthority } from "../../src/specs/paladin/protection/pinned-authority.js";
import {
  previousGcdCastAt,
  resolveProtectionAtoms,
  NEXT_ARMAMENT_WHEN_NOT_LIGHTSMITH,
} from "../../src/specs/paladin/protection/resolver.js";
import {
  APEX_3,
  CHARGES,
  CONSECRATION_UP,
  FULL_RECHARGE_TIME,
  GCD,
  HERO_TREE_LIGHTSMITH,
  HOLY_BULWARK,
  NEXT_ARMAMENT,
  PREV_GCD_1_DIVINE_TOLL,
  PROTECTION_ATOM_VOCABULARY,
  SACRED_WEAPON,
  TALENT_RIGHTEOUS_PROTECTOR_ENABLED,
} from "../../src/specs/paladin/protection/vocabulary.js";
import { protectionExecutionLaneForAbility } from "../../src/data/game/paladin-protection-gcd-semantics.js";
import {
  resolveProtectionApplicability,
  resolveProtectionUsability,
  type ProtectionBuildFacts,
} from "../../src/specs/paladin/protection/action-profile.js";
import { initialProtectionState, withExecution } from "../../src/specs/paladin/protection/first-gcd-state.js";
import {
  resolveProtectionHeroTree,
  resolveProtectionTalent,
} from "../../src/data/game/paladin-protection-talents.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import { deriveConditionRaw } from "../../src/simc/apl-authority.js";
import paladinArtifact from "../../src/simc/data/paladin-protection.apl.json";
import type { SpecAtomBinding } from "../../src/simc/expression/spec-vocabulary.js";

const OPENER = "wcl-protection-paladin-a7r6-opener";
const GAP = "wcl-protection-paladin-a7r6-opener.gap-before-2010000";

const ACTION_TOKENS = ["judgment", "shield_of_the_righteous", "blessed_hammer"];

/** The canonical position of one COMPLETE cast by the subject, or a thrown error. */
function castAt(state: CombatState, reportTimeMs: number, abilityGameId: number): number {
  const found = positionOfCast(state, { actorId: PROT_ACTOR, reportTimeMs, abilityGameId });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}

function valueOf(bound: readonly SpecAtomBinding[], key: string, actionToken: string | null = null) {
  return bound.find((entry) => entry.key === key && entry.actionToken === actionToken)?.value;
}

function realTalents(artifactId: string) {
  const state = corpusState(artifactId);
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event?.kind === "COMBATANT_INFO" && event.snapshot.actorId === PROT_ACTOR) {
      return { state, talents: event.snapshot.talentTree.map((e) => ({ id: e.id, nodeId: e.nodeId })) };
    }
  }
  throw new Error("no combatant info for actor 7");
}

describe("the vocabulary admits every identifier the M10-B census refused, and nothing else", () => {
  it("every conditional line of the pinned Protection APL now parses with the vocabulary", () => {
    const conditions = paladinArtifact.lists.flatMap((list) =>
      list.actions.map((action) => deriveConditionRaw(action.actionStringVerbatim)),
    );
    for (const condition of conditions) {
      if (condition === null) continue;
      const withVocabulary = parseSimcExpression(condition, PROTECTION_ATOM_VOCABULARY);
      expect(withVocabulary.ok, condition).toBe(true);
    }
    // Without it, the M10-B census is unchanged: ten refusals, all UNSUPPORTED_IDENTIFIER.
    const refused = conditions.filter((c) => c !== null && !parseSimcExpression(c).ok);
    expect(refused).toHaveLength(10);
  });

  it("declares exactly the eleven identifiers, with pinned shapes", () => {
    expect(
      PROTECTION_ATOM_VOCABULARY.declarations.map((d) => [d.identifier, d.shape, d.selfAddressing]),
    ).toEqual([
      [TALENT_RIGHTEOUS_PROTECTOR_ENABLED, "BOOLEAN", false],
      [HERO_TREE_LIGHTSMITH, "BOOLEAN", false],
      [APEX_3, "BOOLEAN", false],
      [PREV_GCD_1_DIVINE_TOLL, "BOOLEAN", false],
      [NEXT_ARMAMENT, "NUMERIC", false],
      [SACRED_WEAPON, "NUMERIC", false],
      [HOLY_BULWARK, "NUMERIC", false],
      [CONSECRATION_UP, "BOOLEAN", false],
      [FULL_RECHARGE_TIME, "NUMERIC", true],
      [CHARGES, "NUMERIC", true],
      [GCD, "NUMERIC", false],
    ]);
    expect(PROTECTION_ATOM_VOCABULARY.ownerSpecId).toBe("paladin/protection");
  });
});

describe("the resolver over the REAL M10-B opener", () => {
  const { state, talents } = realTalents(OPENER);

  it("binds the talent, hero tree and apex facts the real tree proves", () => {
    const position = castAt(state, 2005436, JUDGMENT);
    const { specAtoms, diagnostics } = resolveProtectionAtoms({
      state,
      actorId: PROT_ACTOR,
      position,
      observedTalents: talents,
      actionTokens: ACTION_TOKENS,
    });
    expect(valueOf(specAtoms.bound, TALENT_RIGHTEOUS_PROTECTOR_ENABLED)).toEqual({
      kind: "TRUTH",
      value: true,
    });
    expect(valueOf(specAtoms.bound, HERO_TREE_LIGHTSMITH)).toEqual({ kind: "TRUTH", value: true });
    expect(valueOf(specAtoms.bound, APEX_3)).toEqual({ kind: "TRUTH", value: true });
    expect(diagnostics.heroTree).toMatchObject({ state: "RESOLVED", simcName: "lightsmith", subTreeId: 49 });
    expect(diagnostics.righteousProtector.reason).toBe("OWN_ENTRY_SELECTED");
    expect(diagnostics.apex3.decidedByEntryId).toBe(137020);
    // Under Lightsmith the armament alternation is modelled (M10-C5 Phase B)
    // but at the first Judgment no hardcast precedes the decision: a refusal
    // with the state machine's reason, not the constructor's default.
    expect(valueOf(specAtoms.bound, NEXT_ARMAMENT)).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "UNKNOWN_NUMBER", reason: "STATE_NOT_ESTABLISHED" },
    });
    expect(diagnostics.armament).toEqual({
      state: "UNKNOWN",
      reason: "NO_HARDCAST_IN_EVIDENCE",
      stoppedAtPosition: null,
    });
    expect(valueOf(specAtoms.bound, SACRED_WEAPON)).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "KNOWN_NUMBER", value: 1 },
    });
    expect(valueOf(specAtoms.bound, HOLY_BULWARK)).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "KNOWN_NUMBER", value: 0 },
    });
    // `consecration.up` is never bound: enumerated, never false.
    expect(valueOf(specAtoms.bound, CONSECRATION_UP)).toBeUndefined();
    // The magnitudes this build models nothing of are stated as such, per action.
    expect(valueOf(specAtoms.bound, GCD)).toMatchObject({ binding: { reason: "STATE_NOT_MODELLED" } });
    expect(valueOf(specAtoms.bound, CHARGES, "judgment")).toMatchObject({
      binding: { reason: "STATE_NOT_MODELLED" },
    });
    expect(valueOf(specAtoms.bound, FULL_RECHARGE_TIME, "blessed_hammer")).toMatchObject({
      binding: { reason: "STATE_NOT_MODELLED" },
    });
    expect(valueOf(specAtoms.bound, CHARGES)).toBeUndefined();
  });

  it("prev_gcd.1.divine_toll is unbound at the first press and FALSE once a GCD cast precedes it", () => {
    const first = castAt(state, 2005436, JUDGMENT);
    const atFirst = resolveProtectionAtoms({
      state,
      actorId: PROT_ACTOR,
      position: first,
      observedTalents: talents,
      actionTokens: ACTION_TOKENS,
    });
    expect(atFirst.diagnostics.previousGcdCast).toEqual({
      state: "UNKNOWN",
      reason: "NO_PRIOR_GCD_CAST_IN_EVIDENCE",
      stoppedAtPosition: null,
    });
    expect(valueOf(atFirst.specAtoms.bound, PREV_GCD_1_DIVINE_TOLL)).toBeUndefined();

    // The second press: the Judgment at 2,005,436 is the previous GCD action.
    // The Hand of Reckoning (NON_GCD) at 2,004,929 and the melee swings are
    // stepped over, not stopped at.
    const second = castAt(state, 2006478, BLESSED_HAMMER);
    const atSecond = resolveProtectionAtoms({
      state,
      actorId: PROT_ACTOR,
      position: second,
      observedTalents: talents,
      actionTokens: ACTION_TOKENS,
    });
    expect(atSecond.diagnostics.previousGcdCast).toMatchObject({
      state: "ESTABLISHED",
      abilityGameId: JUDGMENT,
      reportTimeMs: 2005436,
    });
    expect(valueOf(atSecond.specAtoms.bound, PREV_GCD_1_DIVINE_TOLL)).toEqual({
      kind: "TRUTH",
      value: false,
    });

    // After a Shield of the Righteous (NON_GCD) and a melee swing, the previous
    // GCD press is still the last GCD one, not the last cast.
    const afterSpender = castAt(state, 2009535, JUDGMENT);
    const walk = previousGcdCastAt(state, PROT_ACTOR, afterSpender, protectionExecutionLaneForAbility);
    expect(walk).toMatchObject({ state: "ESTABLISHED", abilityGameId: JUDGMENT, reportTimeMs: 2008720 });
  });

  it("over the gap derivation the walk finds nothing before the boundary and says so", () => {
    const gap = realTalents(GAP);
    const first = castAt(gap.state, 2010338, BLESSED_HAMMER);
    const resolved = resolveProtectionAtoms({
      state: gap.state,
      actorId: PROT_ACTOR,
      position: first,
      observedTalents: gap.talents,
      actionTokens: ACTION_TOKENS,
    });
    expect(resolved.diagnostics.previousGcdCast).toEqual({
      state: "UNKNOWN",
      reason: "NO_PRIOR_GCD_CAST_IN_EVIDENCE",
      stoppedAtPosition: null,
    });
    expect(valueOf(resolved.specAtoms.bound, PREV_GCD_1_DIVINE_TOLL)).toBeUndefined();
  });
});

describe("the resolver over SYNTHETIC trees and fights (no captured coverage)", () => {
  const info = (talentTree: typeof LIGHTSMITH_TREE) =>
    protCombatantInfo({ ordinal: 0, reportTimeMs: 1000, talentTree });

  it("a Templar tree makes hero_tree.lightsmith FALSE and next_armament a KNOWN -1", () => {
    const state = protState([
      info(TEMPLAR_TREE),
      protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: JUDGMENT }),
    ]);
    const position = castAt(state, 2000, JUDGMENT);
    const { specAtoms } = resolveProtectionAtoms({
      state,
      actorId: PROT_ACTOR,
      position,
      observedTalents: TEMPLAR_TREE,
      actionTokens: ACTION_TOKENS,
    });
    expect(valueOf(specAtoms.bound, HERO_TREE_LIGHTSMITH)).toEqual({ kind: "TRUTH", value: false });
    expect(valueOf(specAtoms.bound, NEXT_ARMAMENT)).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "KNOWN_NUMBER", value: NEXT_ARMAMENT_WHEN_NOT_LIGHTSMITH },
    });
  });

  it("no pinned hero entry leaves hero_tree.lightsmith unbound and next_armament unmodelled", () => {
    const state = protState([
      info(NO_HERO_TREE),
      protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: JUDGMENT }),
    ]);
    const position = castAt(state, 2000, JUDGMENT);
    const { specAtoms, diagnostics } = resolveProtectionAtoms({
      state,
      actorId: PROT_ACTOR,
      position,
      observedTalents: NO_HERO_TREE,
      actionTokens: ACTION_TOKENS,
    });
    expect(diagnostics.heroTree).toEqual({ state: "UNKNOWN" });
    expect(valueOf(specAtoms.bound, HERO_TREE_LIGHTSMITH)).toBeUndefined();
    expect(valueOf(specAtoms.bound, NEXT_ARMAMENT)).toMatchObject({
      binding: { reason: "STATE_NOT_MODELLED" },
    });
  });

  it("apex.3 is FALSE when the tree stopped at tier two, and talent.righteous_protector.enabled unbound when its node is absent", () => {
    const tree = APEX_TIER_TWO_TREE.filter((e) => e.id !== 102440);
    const state = protState([
      info(tree),
      protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: JUDGMENT }),
    ]);
    const position = castAt(state, 2000, JUDGMENT);
    const { specAtoms } = resolveProtectionAtoms({
      state,
      actorId: PROT_ACTOR,
      position,
      observedTalents: tree,
      actionTokens: ACTION_TOKENS,
    });
    expect(valueOf(specAtoms.bound, APEX_3)).toEqual({ kind: "TRUTH", value: false });
    expect(valueOf(specAtoms.bound, TALENT_RIGHTEOUS_PROTECTOR_ENABLED)).toBeUndefined();
  });

  it("prev_gcd.1.divine_toll is TRUE when the previous GCD press was Divine Toll, across a NON_GCD spender and a swing", () => {
    const state = protState([
      info(LIGHTSMITH_TREE),
      protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: DIVINE_TOLL }),
      protCast({
        ordinal: 2,
        reportTimeMs: 2100,
        abilityGameId: SHIELD_OF_THE_RIGHTEOUS,
        targetActorId: null,
        holyPower: { amount: 3, max: 5, cost: 3 },
      }),
      protCast({ ordinal: 3, reportTimeMs: 2200, abilityGameId: 1, melee: true }),
      protCast({ ordinal: 4, reportTimeMs: 2500, abilityGameId: JUDGMENT }),
    ]);
    const position = castAt(state, 2500, JUDGMENT);
    const { specAtoms, diagnostics } = resolveProtectionAtoms({
      state,
      actorId: PROT_ACTOR,
      position,
      observedTalents: LIGHTSMITH_TREE,
      actionTokens: ACTION_TOKENS,
    });
    expect(diagnostics.previousGcdCast).toMatchObject({ state: "ESTABLISHED", abilityGameId: DIVINE_TOLL });
    expect(valueOf(specAtoms.bound, PREV_GCD_1_DIVINE_TOLL)).toEqual({ kind: "TRUTH", value: true });
  });

  it("a foreground cast with no pinned lane stops the walk unbound", () => {
    const state = protState([
      info(LIGHTSMITH_TREE),
      protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: DIVINE_TOLL }),
      protCast({ ordinal: 2, reportTimeMs: 2100, abilityGameId: 1297761, targetActorId: null }),
      protCast({ ordinal: 3, reportTimeMs: 2500, abilityGameId: JUDGMENT }),
    ]);
    const position = castAt(state, 2500, JUDGMENT);
    const { specAtoms, diagnostics } = resolveProtectionAtoms({
      state,
      actorId: PROT_ACTOR,
      position,
      observedTalents: LIGHTSMITH_TREE,
      actionTokens: ACTION_TOKENS,
    });
    expect(diagnostics.previousGcdCast).toMatchObject({ state: "UNKNOWN", reason: "LANE_NOT_ESTABLISHED" });
    expect(valueOf(specAtoms.bound, PREV_GCD_1_DIVINE_TOLL)).toBeUndefined();
  });

  it("a cast-coverage gap between the found press and the decision refuses the claim", () => {
    const events = [
      info(LIGHTSMITH_TREE),
      protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: DIVINE_TOLL }),
      protCast({ ordinal: 2, reportTimeMs: 2500, abilityGameId: JUDGMENT }),
    ];
    // CASTS not vouched at all: the walk still finds the cast in evidence, but
    // cannot claim nothing was pressed in between.
    const state = protState(events, { observedCategories: ["RESOURCES", "COMBATANT_INFO"] });
    const position = castAt(state, 2500, JUDGMENT);
    const walk = previousGcdCastAt(state, PROT_ACTOR, position, protectionExecutionLaneForAbility);
    expect(walk).toMatchObject({ state: "UNKNOWN", reason: "INSUFFICIENT_COVERAGE" });
  });
});

describe("the action profile (SYNTHETIC build facts)", () => {
  const authority = pinnedProtectionPaladinAuthority();
  if (!authority.ok) throw new Error("pinned authority");
  const action = (token: string) => {
    const found = authority.authority.actions.find((a) => a.actionToken === token);
    if (found === undefined) throw new Error(`no ${token} in the pinned list`);
    return found;
  };
  const facts = (tree: typeof LIGHTSMITH_TREE): ProtectionBuildFacts => ({
    blessedHammer: resolveProtectionTalent(tree, "blessed_hammer"),
    sentinel: resolveProtectionTalent(tree, "sentinel"),
    avengingWrath: resolveProtectionTalent(tree, "avenging_wrath"),
    heroTree: resolveProtectionHeroTree(tree),
    wornGear: [],
    malformedGearRows: [],
    divineInspiration: "UNKNOWN",
  });
  const neutral = initialProtectionState("OTHER");

  it("hammer_of_the_righteous is background under Blessed Hammer, applicable otherwise", () => {
    expect(
      resolveProtectionApplicability(facts(LIGHTSMITH_TREE), neutral, action("hammer_of_the_righteous")),
    ).toMatchObject({
      kind: "NOT_APPLICABLE",
      reason: "BACKGROUND_UNDER_PROVEN_BUILD",
    });
    const hotrBuild = LIGHTSMITH_TREE.map((e) => (e.id === 102430 ? { ...e, id: 102431 } : e));
    expect(
      resolveProtectionApplicability(facts(hotrBuild), neutral, action("hammer_of_the_righteous")).kind,
    ).toBe("APPLICABLE");
  });

  it("holy_armaments and hammer_of_light follow the hero tree, and stay UNKNOWN without one", () => {
    expect(
      resolveProtectionApplicability(facts(LIGHTSMITH_TREE), neutral, action("holy_armaments")).kind,
    ).toBe("APPLICABLE");
    expect(
      resolveProtectionApplicability(facts(LIGHTSMITH_TREE), neutral, action("hammer_of_light")).kind,
    ).toBe("NOT_APPLICABLE");
    expect(resolveProtectionApplicability(facts(TEMPLAR_TREE), neutral, action("holy_armaments")).kind).toBe(
      "NOT_APPLICABLE",
    );
    expect(resolveProtectionApplicability(facts(TEMPLAR_TREE), neutral, action("hammer_of_light")).kind).toBe(
      "APPLICABLE",
    );
    expect(resolveProtectionApplicability(facts(NO_HERO_TREE), neutral, action("holy_armaments")).kind).toBe(
      "UNKNOWN",
    );
    expect(resolveProtectionApplicability(facts(NO_HERO_TREE), neutral, action("hammer_of_light")).kind).toBe(
      "UNKNOWN",
    );
  });

  it("avenging_wrath is applicable under Sentinel, background with neither talent, unknown in between", () => {
    expect(
      resolveProtectionApplicability(facts(LIGHTSMITH_TREE), neutral, action("avenging_wrath")).kind,
    ).toBe("APPLICABLE");
    const neither = LIGHTSMITH_TREE.filter((e) => e.id !== 102466 && e.id !== 102448);
    // Both nodes absent: UNKNOWN, not background — absence proves nothing.
    expect(resolveProtectionApplicability(facts(neither), neutral, action("avenging_wrath")).kind).toBe(
      "UNKNOWN",
    );
  });

  it("racials apply only in their race world", () => {
    expect(
      resolveProtectionApplicability(
        facts(LIGHTSMITH_TREE),
        initialProtectionState("DARK_IRON_DWARF"),
        action("fireblood"),
      ).kind,
    ).toBe("APPLICABLE");
    expect(
      resolveProtectionApplicability(
        facts(LIGHTSMITH_TREE),
        initialProtectionState("BLOOD_ELF"),
        action("fireblood"),
      ),
    ).toMatchObject({
      kind: "NOT_APPLICABLE",
      reason: "RACIAL_NOT_AVAILABLE_TO_RACE",
    });
    expect(
      resolveProtectionApplicability(
        facts(LIGHTSMITH_TREE),
        initialProtectionState("BLOOD_ELF"),
        action("arcane_torrent"),
      ).kind,
    ).toBe("APPLICABLE");
    expect(
      resolveProtectionApplicability(facts(LIGHTSMITH_TREE), neutral, action("arcane_torrent")).kind,
    ).toBe("NOT_APPLICABLE");
  });

  it("usability: the observed cast is proven usable; a prefix execution is proven unusable; everything else unknown", () => {
    expect(resolveProtectionUsability(neutral, action("judgment"), JUDGMENT)).toEqual({
      kind: "PROVEN_USABLE",
    });
    // Sentinel's id proves the `avenging_wrath` token usable, because the token IS sentinel_t under the talent.
    expect(resolveProtectionUsability(neutral, action("avenging_wrath"), 389539)).toEqual({
      kind: "PROVEN_USABLE",
    });
    expect(resolveProtectionUsability(neutral, action("blessed_hammer"), JUDGMENT).kind).toBe("UNKNOWN");
    expect(resolveProtectionUsability(neutral, action("shield_of_the_righteous"), JUDGMENT).kind).toBe(
      "UNKNOWN",
    );
    const executed = withExecution(neutral, {
      listName: "default",
      priorityOrdinal: action("auto_attack").priorityOrdinal,
      actionToken: "auto_attack",
      sourceLine: action("auto_attack").sourceLine,
    });
    expect(resolveProtectionUsability(executed, action("auto_attack"), JUDGMENT)).toMatchObject({
      kind: "PROVEN_UNUSABLE",
      reason: "SIMULATED_PREFIX_EXECUTION",
    });
    expect(resolveProtectionUsability(neutral, action("auto_attack"), JUDGMENT).kind).toBe("UNKNOWN");
    // Hand of Reckoning is observed-only: no token names it, so no entry is proven usable by it.
    expect(resolveProtectionUsability(neutral, action("judgment"), HAND_OF_RECKONING).kind).toBe("UNKNOWN");
  });

  it("the synthetic authority helper is labelled synthetic and never the pinned id", () => {
    const synthetic = syntheticProtectionAuthority(["auto_attack", "judgment"]);
    expect(synthetic.artifact.authorityId).toContain("SYNTHETIC");
    expect(synthetic.artifact.authorityId).not.toBe(authority.authority.artifact.authorityId);
  });
});
