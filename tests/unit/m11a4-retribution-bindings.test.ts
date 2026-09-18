/**
 * M11-A4: the Retribution-owned bindings — aura presence, the EXACT-ZERO
 * stack proofs, Holy Power observation, the applicability and usability
 * rules, the resolver — over the committed Retribution corpus evidence and
 * synthetic build facts.
 *
 * The companion test the M5 boundary sweep names for
 * `src/specs/paladin/retribution/aura-bindings.ts`: it pins that the UNKNOWN
 * branch binds nothing, that FALSE comes only from M4's EXACT INACTIVE, and
 * that a stack count is bound only when it is exactly zero under one of the
 * two authorized proofs — never a positive count, never from silence.
 */

import { describe, expect, it } from "vitest";

import {
  ART_OF_WAR_BUFF_SPELL_ID,
  AVENGING_WRATH_BUFF_SPELL_ID,
  DIVINE_ARBITER_DIVINE_STORM_BUFF_SPELL_ID,
  HAMMER_OF_WRATH_READINESS_AURA_SPELL_ID,
  HAMMER_OF_WRATH_READINESS_SIMC_SPELL_ID,
  RETRIBUTION_AURA_IDENTITIES,
  RIGHTEOUS_CAUSE_BUFF_SPELL_ID,
  retributionAuraIdentitiesFor,
  SC_PALADIN_CPP_SHA256,
  SC_PALADIN_HPP_SHA256,
  SC_PALADIN_RETRIBUTION_CPP_SHA256,
} from "../../src/data/game/paladin-retribution-aura-authority.js";
import type { TalentResolution } from "../../src/data/game/talent-selection.js";
import { WCL_GEAR_UI_SEMANTICS_REVISION } from "../../src/engine/normalization/normalized-events.js";
import { unknownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import type { AplAction } from "../../src/simc/apl-authority.js";
import {
  bindRetributionAura,
  bindRetributionStackZero,
  bindSupportedRetributionAuras,
  bindSupportedRetributionStacks,
  retributionBuffBindingsFrom,
  retributionStackBindingsFrom,
  SUPPORTED_RETRIBUTION_AURA_ATOMS,
  SUPPORTED_RETRIBUTION_STACK_ATOMS,
} from "../../src/specs/paladin/retribution/aura-bindings.js";
import {
  foregroundProvenByObservedExecution,
  resolveRetributionApplicability,
  resolveRetributionUsability,
  type RetributionBuildFacts,
} from "../../src/specs/paladin/retribution/action-profile.js";
import {
  RETRIBUTION_FOREGROUND_ONLY_EXECUTIONS,
  retributionForegroundOnlyExecutionFor,
} from "../../src/data/game/paladin-retribution-foreground-execution-authority.js";
import {
  nonDomainCategoryOf,
  RACIAL_ACTION_TOKENS,
} from "../../src/specs/paladin/retribution/domain-boundary.js";
import {
  initialRetributionState,
  withExecution,
} from "../../src/specs/paladin/retribution/first-gcd-state.js";
import {
  holyPowerOn,
  spenderFactsFrom,
  UNKNOWN_SPENDER_FACTS,
} from "../../src/specs/paladin/retribution/holy-power.js";
import { pinnedRetributionPaladinAuthority } from "../../src/specs/paladin/retribution/pinned-authority.js";
import { resolveDsCastable, resolveRetributionAtoms } from "../../src/specs/paladin/retribution/resolver.js";
import { corpusBundleState, corpusState, positionOfCast } from "../support/corpus/fight.js";

const RET45 = "wcl-retribution-paladin-a7r6-rotational-45s";
const BUNDLE = [
  RET45,
  "wcl-retribution-paladin-a7r6-rotational-165s.seg-45-105",
  "wcl-retribution-paladin-a7r6-rotational-165s.seg-105-165",
];
const RET = 6;
const [FINAL_VERDICT, DIVINE_STORM] = [383328, 53385];
const HOLY_POWER_WIRE_TYPE = 9;

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

/** The A7R6 actor-6 build as the resolver reads it, with Radiant Glory UNKNOWN (a NORMAL node absent from the tree). */
const ACTOR6_TALENTS: Readonly<Record<string, TalentResolution>> = {
  art_of_war: selected("art_of_war"),
  righteous_cause: notSelected("righteous_cause"),
  radiant_glory: unknownTalent("radiant_glory"),
  empyrean_legacy: selected("empyrean_legacy"),
  divine_purpose: selected("divine_purpose"),
  avenging_wrath: selected("avenging_wrath"),
  walk_into_light: selected("walk_into_light"),
  crusading_strikes: selected("crusading_strikes"),
  templar_strikes: notSelected("templar_strikes"),
  divine_storm: selected("divine_storm"),
  wake_of_ashes: selected("wake_of_ashes"),
  execution_sentence: selected("execution_sentence"),
  blade_of_justice: selected("blade_of_justice"),
  divine_toll: selected("divine_toll"),
};

function at(state: ReturnType<typeof corpusState>, reportTimeMs: number, abilityGameId: number): number {
  const found = positionOfCast(state, { actorId: RET, reportTimeMs, abilityGameId });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}

function actionNamed(token: string): AplAction {
  const loaded = pinnedRetributionPaladinAuthority();
  if (!loaded.ok) throw new Error("authority did not load");
  const action = loaded.authority.actions.find((entry) => entry.actionToken === token);
  if (action === undefined) throw new Error(`no entry names ${token}`);
  return action;
}

const BASE: Omit<AtomBindings, "specAtoms"> = {
  comboPoints: unknownNumber("STATE_NOT_MODELLED"),
  comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
  energyPct: unknownNumber("STATE_NOT_MODELLED"),
  knownBuffs: [],
};

describe("the pinned aura identities", () => {
  it("name eight atoms with claims against the three reviewed module hashes, and the readiness aura carries both ids", () => {
    expect(RETRIBUTION_AURA_IDENTITIES.map((identity) => identity.atomName)).toEqual([
      "avenging_wrath",
      "empyrean_legacy",
      "divine_arbiter_verdict",
      "divine_arbiter_divine_storm",
      "divine_purpose",
      "hammer_of_wrath",
      "art_of_war",
      "righteous_cause",
    ]);
    const hashes = new Set(
      RETRIBUTION_AURA_IDENTITIES.flatMap((identity) => identity.claims.map((c) => c.sourceSha256)),
    );
    expect(hashes).toEqual(
      new Set([SC_PALADIN_CPP_SHA256, SC_PALADIN_HPP_SHA256, SC_PALADIN_RETRIBUTION_CPP_SHA256]),
    );
    expect(HAMMER_OF_WRATH_READINESS_AURA_SPELL_ID).toBe(1241410);
    expect(HAMMER_OF_WRATH_READINESS_SIMC_SPELL_ID).toBe(1277026);
    expect(retributionAuraIdentitiesFor("avenging_wrath")[0]?.requires).toEqual([
      { simcName: "radiant_glory", selection: "NOT_SELECTED" },
    ]);
    // The two stack atoms name the talent that PRODUCES them; nothing else does.
    expect(retributionAuraIdentitiesFor("art_of_war")[0]?.producedByTalent).toBe("art_of_war");
    expect(retributionAuraIdentitiesFor("righteous_cause")[0]?.producedByTalent).toBe("righteous_cause");
    expect(retributionAuraIdentitiesFor("empyrean_legacy")[0]?.producedByTalent).toBe("empyrean_legacy");
    expect(retributionAuraIdentitiesFor("divine_purpose")[0]?.producedByTalent).toBe("divine_purpose");
    expect(retributionAuraIdentitiesFor("hammer_of_wrath")[0]?.producedByTalent).toBe(null);
    expect(SUPPORTED_RETRIBUTION_STACK_ATOMS).toEqual(["art_of_war", "righteous_cause"]);
    expect(SUPPORTED_RETRIBUTION_AURA_ATOMS).toHaveLength(6);
  });
});

describe("aura presence over the committed evidence", () => {
  const state = corpusState(RET45);

  it("binds nothing before an aura's first observed transition, and never inactive from silence", () => {
    const position = at(state, 2006193, DIVINE_STORM);
    const arbiter = bindRetributionAura(
      { state, actorId: RET, position, talents: ACTOR6_TALENTS },
      "divine_arbiter_verdict",
    );
    expect(arbiter).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN", abilityGameId: 1306161 });
    const legacy = bindRetributionAura(
      { state, actorId: RET, position, talents: ACTOR6_TALENTS },
      "empyrean_legacy",
    );
    expect(legacy).toMatchObject({ state: "BOUND", up: true, abilityGameId: 387178 });
  });

  it("binds FALSE only from an observed removal, anchored on it", () => {
    const position = at(state, 2043066, FINAL_VERDICT);
    const legacy = bindRetributionAura(
      { state, actorId: RET, position, talents: ACTOR6_TALENTS },
      "empyrean_legacy",
    );
    expect(legacy).toMatchObject({ state: "BOUND", up: false, abilityGameId: 387178 });
    if (legacy.state === "BOUND") expect(legacy.anchorLocator.reportTimeMs).toBe(2008783);
  });

  it("refuses an identity whose build gate does not hold (Radiant Glory UNKNOWN), binding nothing", () => {
    const position = at(state, 2043066, FINAL_VERDICT);
    const wings = bindRetributionAura(
      { state, actorId: RET, position, talents: ACTOR6_TALENTS },
      "avenging_wrath",
    );
    expect(wings).toEqual({
      atomName: "avenging_wrath",
      state: "UNBOUND",
      reason: "IDENTITY_NOT_ESTABLISHED_FOR_BUILD",
      abilityGameId: null,
      auraReason: null,
    });
    // With Radiant Glory DISPROVED the identity holds and the aura binds from
    // its observed transitions (the first wings ended at 2,029,314).
    const disproved = { ...ACTOR6_TALENTS, radiant_glory: notSelected("radiant_glory") };
    const bound = bindRetributionAura(
      { state, actorId: RET, position, talents: disproved },
      "avenging_wrath",
    );
    expect(bound).toMatchObject({ state: "BOUND", up: false, abilityGameId: AVENGING_WRATH_BUFF_SPELL_ID });
  });

  it("exports only BOUND atoms as knownBuffs, and never the readiness or free-cast auras", () => {
    const position = at(state, 2043066, FINAL_VERDICT);
    const auras = bindSupportedRetributionAuras({ state, actorId: RET, position, talents: ACTOR6_TALENTS });
    const known = retributionBuffBindingsFrom(auras);
    expect(known.map((entry) => entry.name)).toEqual([
      "empyrean_legacy",
      "divine_arbiter_verdict",
      "divine_arbiter_divine_storm",
    ]);
    expect(known.find((entry) => entry.name === "divine_arbiter_divine_storm")?.up).toBe(true);
  });
});

describe("the exact-zero stack proofs", () => {
  const state = corpusBundleState(BUNDLE, []);

  it("binds art_of_war to exactly zero from an observed removal (PROVEN_INACTIVE) at the MATCH decision", () => {
    const position = at(state, 2108996, FINAL_VERDICT);
    const stack = bindRetributionStackZero(
      { state, actorId: RET, position, talents: ACTOR6_TALENTS },
      "art_of_war",
    );
    expect(stack).toMatchObject({
      state: "BOUND_ZERO",
      proof: "PROVEN_INACTIVE",
      abilityGameId: ART_OF_WAR_BUFF_SPELL_ID,
    });
  });

  it("binds righteous_cause to exactly zero from the choice node (TALENT_NOT_SELECTED) without reading any aura stream", () => {
    const position = at(state, 2006193, DIVINE_STORM);
    const stack = bindRetributionStackZero(
      { state, actorId: RET, position, talents: ACTOR6_TALENTS },
      "righteous_cause",
    );
    expect(stack).toMatchObject({
      state: "BOUND_ZERO",
      proof: "TALENT_NOT_SELECTED",
      abilityGameId: RIGHTEOUS_CAUSE_BUFF_SPELL_ID,
    });
  });

  it("leaves an ACTIVE aura's stack UNBOUND: no positive count is ever bound", () => {
    const position = at(state, 2043066, FINAL_VERDICT);
    const stack = bindRetributionStackZero(
      { state, actorId: RET, position, talents: ACTOR6_TALENTS },
      "art_of_war",
    );
    expect(stack).toEqual({
      atomName: "art_of_war",
      state: "UNBOUND",
      reason: "AURA_ACTIVE",
      abilityGameId: ART_OF_WAR_BUFF_SPELL_ID,
    });
    const known = retributionStackBindingsFrom(
      bindSupportedRetributionStacks({ state, actorId: RET, position, talents: ACTOR6_TALENTS }),
    );
    expect(known).toEqual([{ name: "righteous_cause", stack: 0 }]);
    for (const entry of known) expect(entry.stack).toBe(0);
  });

  it("leaves an aura with no observed transition and a taken talent UNBOUND (TALENT_NOT_DISPROVED)", () => {
    const position = at(state, 2006193, DIVINE_STORM);
    const stack = bindRetributionStackZero(
      { state, actorId: RET, position, talents: ACTOR6_TALENTS },
      "art_of_war",
    );
    expect(stack).toMatchObject({ state: "UNBOUND", reason: "TALENT_NOT_DISPROVED" });
  });

  it("with the producing talent UNKNOWN and the aura state unknown, binds nothing: an absent node is never a disproof", () => {
    const position = at(state, 2006193, DIVINE_STORM);
    const talents = { ...ACTOR6_TALENTS, art_of_war: unknownTalent("art_of_war") };
    const stack = bindRetributionStackZero({ state, actorId: RET, position, talents }, "art_of_war");
    expect(stack).toMatchObject({ state: "UNBOUND", reason: "TALENT_NOT_DISPROVED" });
    // And with the resolution missing altogether, the same refusal under the aura reason.
    const { art_of_war: _dropped, ...withoutTalent } = ACTOR6_TALENTS;
    const missing = bindRetributionStackZero(
      { state, actorId: RET, position, talents: withoutTalent },
      "art_of_war",
    );
    expect(missing).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN" });
  });

  it("refuses an atom with no pinned identity", () => {
    const position = at(state, 2006193, DIVINE_STORM);
    expect(
      bindRetributionStackZero({ state, actorId: RET, position, talents: ACTOR6_TALENTS }, "empyrean_power"),
    ).toEqual({
      atomName: "empyrean_power",
      state: "UNBOUND",
      reason: "IDENTITY_NOT_PINNED",
      abilityGameId: null,
    });
  });
});

describe("Holy Power observation and the spender facts", () => {
  const state = corpusBundleState(BUNDLE, []);

  it("reads the PRE_COST amount on a costed spender and NO_OBSERVATION on a Divine Purpose free cast", () => {
    expect(holyPowerOn(state, at(state, 2108996, FINAL_VERDICT), RET, HOLY_POWER_WIRE_TYPE)).toEqual({
      state: "EXACT_PRE_COST",
      amount: 4,
      max: 5,
      cost: 3,
    });
    expect(holyPowerOn(state, at(state, 2105158, DIVINE_STORM), RET, HOLY_POWER_WIRE_TYPE)).toMatchObject({
      state: "NO_OBSERVATION",
    });
  });

  it("excludes the free route only when Divine Purpose is PROVEN down", () => {
    const position = at(state, 2108996, FINAL_VERDICT);
    const auras = bindSupportedRetributionAuras({ state, actorId: RET, position, talents: ACTOR6_TALENTS });
    const facts = spenderFactsFrom(holyPowerOn(state, position, RET, HOLY_POWER_WIRE_TYPE), auras);
    expect(facts).toEqual({
      holyPower: { state: "KNOWN_NUMBER", value: 4 },
      divinePurposeUp: false,
      freeCastExcluded: true,
    });
    const free = at(state, 2105158, DIVINE_STORM);
    const freeAuras = bindSupportedRetributionAuras({
      state,
      actorId: RET,
      position: free,
      talents: ACTOR6_TALENTS,
    });
    const freeFacts = spenderFactsFrom(holyPowerOn(state, free, RET, HOLY_POWER_WIRE_TYPE), freeAuras);
    expect(freeFacts.divinePurposeUp).toBe(true);
    expect(freeFacts.freeCastExcluded).toBe(false);
    expect(freeFacts.holyPower.state).toBe("UNKNOWN_NUMBER");
    // Unbound Divine Purpose excludes nothing.
    expect(spenderFactsFrom({ state: "NO_OBSERVATION", reason: "x" }, [])).toEqual(UNKNOWN_SPENDER_FACTS);
  });
});

describe("applicability: the domain boundary first, then the constructor readings", () => {
  const facts: RetributionBuildFacts = {
    talents: ACTOR6_TALENTS,
    heroTree: { state: "RESOLVED", simcName: "herald_of_the_sun", subTreeId: 50, decidedByEntryIds: [1] },
    wornGear: [],
    observedCastAbilityIds: new Set([31884]),
  };

  it("classifies every racial, potion, item use and external buff OUTSIDE the domain, generically by token", () => {
    for (const token of RACIAL_ACTION_TOKENS) expect(nonDomainCategoryOf(token)).toBe("RACIAL_ACTION");
    expect(nonDomainCategoryOf("potion")).toBe("CONSUMABLE");
    expect(nonDomainCategoryOf("use_item")).toBe("ITEM_USE");
    expect(nonDomainCategoryOf("invoke_external_buff")).toBe("EXTERNAL_BUFF");
    expect(nonDomainCategoryOf("divine_storm")).toBeNull();
    for (const token of [
      "lights_judgment",
      "fireblood",
      "arcane_torrent",
      "potion",
      "use_item",
      "invoke_external_buff",
    ]) {
      const verdict = resolveRetributionApplicability(facts, actionNamed(token));
      expect(verdict.kind).toBe("NOT_APPLICABLE");
      if (verdict.kind === "NOT_APPLICABLE") expect(verdict.reason).toBe("OUTSIDE_SUPPORTED_DECISION_DOMAIN");
    }
  });

  it("reads the constructor guards: talent-built actions, Crusader Strike under Crusading Strikes, Hammer of Light outside Templar", () => {
    expect(resolveRetributionApplicability(facts, actionNamed("crusader_strike"))).toMatchObject({
      kind: "NOT_APPLICABLE",
      reason: "BACKGROUND_UNDER_PROVEN_BUILD",
    });
    expect(resolveRetributionApplicability(facts, actionNamed("hammer_of_light")).kind).toBe(
      "NOT_APPLICABLE",
    );
    expect(resolveRetributionApplicability(facts, actionNamed("templar_strike")).kind).toBe("NOT_APPLICABLE");
    expect(resolveRetributionApplicability(facts, actionNamed("divine_storm")).kind).toBe("APPLICABLE");
    const noStorm = { ...facts, talents: { ...ACTOR6_TALENTS, divine_storm: notSelected("divine_storm") } };
    expect(resolveRetributionApplicability(noStorm, actionNamed("divine_storm")).kind).toBe("NOT_APPLICABLE");
    const unknownStorm = {
      ...facts,
      talents: { ...ACTOR6_TALENTS, divine_storm: unknownTalent("divine_storm") },
    };
    expect(resolveRetributionApplicability(unknownStorm, actionNamed("divine_storm")).kind).toBe("UNKNOWN");
  });

  it("templars_verdict is UNKNOWN without a pinned two-handed main hand, never background", () => {
    expect(resolveRetributionApplicability(facts, actionNamed("templars_verdict")).kind).toBe("UNKNOWN");
    const twoHander: RetributionBuildFacts = {
      ...facts,
      wornGear: [
        {
          slotIndex: 15,
          itemId: 251230,
          itemLevel: 700,
          quality: 4,
          permanentEnchant: { state: "KNOWN_NONE" as const, contract: WCL_GEAR_UI_SEMANTICS_REVISION },
          temporaryEnchant: { state: "KNOWN_NONE" as const, contract: WCL_GEAR_UI_SEMANTICS_REVISION },
          gems: { state: "KNOWN_NONE" as const, contract: WCL_GEAR_UI_SEMANTICS_REVISION },
          bonusIds: null,
          setId: null,
        },
      ],
    };
    expect(resolveRetributionApplicability(twoHander, actionNamed("templars_verdict")).kind).toBe(
      "APPLICABLE",
    );
  });

  describe("the pinned foreground-only execution fact, and the absence of any generic cast rule", () => {
    it("pins exactly one fact — avenging_wrath: 31884 foreground-only, 454351 the background record — with hashed claims", () => {
      expect(
        RETRIBUTION_FOREGROUND_ONLY_EXECUTIONS.map((fact) => [
          fact.simcToken,
          fact.abilityGameId,
          fact.backgroundAbilityGameId,
        ]),
      ).toEqual([["avenging_wrath", 31884, 454351]]);
      const fact = retributionForegroundOnlyExecutionFor("avenging_wrath");
      expect(fact?.claims.length).toBeGreaterThanOrEqual(4);
      const hashes = new Set(fact?.claims.map((claim) => claim.sourceSha256));
      expect(hashes).toEqual(new Set([SC_PALADIN_CPP_SHA256, SC_PALADIN_RETRIBUTION_CPP_SHA256]));
      expect(fact?.claims.some((claim) => claim.lines === "275-280")).toBe(true);
      expect(fact?.claims.some((claim) => claim.lines === "846-851")).toBe(true);
      for (const token of [
        "divine_storm",
        "wake_of_ashes",
        "hammer_of_wrath",
        "judgment",
        "templars_verdict",
        "auto_attack",
      ]) {
        expect(retributionForegroundOnlyExecutionFor(token), token).toBeNull();
      }
    });

    it("UNKNOWN constructor + an observed cast of the pinned foreground-only record → APPLICABLE", () => {
      expect(resolveRetributionApplicability(facts, actionNamed("avenging_wrath")).kind).toBe("APPLICABLE");
      expect(foregroundProvenByObservedExecution(facts, "avenging_wrath")).toEqual({ abilityGameId: 31884 });
    });

    it("UNKNOWN constructor + no observed cast, or a cast of any OTHER record, stays UNKNOWN", () => {
      const unobserved = { ...facts, observedCastAbilityIds: new Set<number>() };
      expect(resolveRetributionApplicability(unobserved, actionNamed("avenging_wrath")).kind).toBe("UNKNOWN");
      // The background/triggered wings record itself proves nothing about the foreground action.
      const backgroundRecord = { ...facts, observedCastAbilityIds: new Set([454351]) };
      expect(resolveRetributionApplicability(backgroundRecord, actionNamed("avenging_wrath")).kind).toBe(
        "UNKNOWN",
      );
      // Nor does any unrelated cast, however many.
      const unrelated = { ...facts, observedCastAbilityIds: new Set([383328, 53385, 255937, 408385]) };
      expect(resolveRetributionApplicability(unrelated, actionNamed("avenging_wrath")).kind).toBe("UNKNOWN");
      expect(foregroundProvenByObservedExecution(unrelated, "avenging_wrath")).toBeNull();
    });

    it("a known BACKGROUND reading is never converted by an observed cast: contradiction stays UNKNOWN, silence stays BACKGROUND", () => {
      const glory = { ...facts, talents: { ...ACTOR6_TALENTS, radiant_glory: selected("radiant_glory") } };
      const contradicted = resolveRetributionApplicability(glory, actionNamed("avenging_wrath"));
      expect(contradicted.kind).toBe("UNKNOWN");
      if (contradicted.kind === "UNKNOWN") expect(contradicted.detail).toContain("contradict");
      const gloryUnobserved = { ...glory, observedCastAbilityIds: new Set<number>() };
      expect(resolveRetributionApplicability(gloryUnobserved, actionNamed("avenging_wrath")).kind).toBe(
        "NOT_APPLICABLE",
      );
      const untalented = {
        ...facts,
        talents: { ...ACTOR6_TALENTS, avenging_wrath: notSelected("avenging_wrath") },
      };
      expect(resolveRetributionApplicability(untalented, actionNamed("avenging_wrath")).kind).toBe("UNKNOWN");
    });

    it("no universal cast-observed rule: a token without a pinned fact keeps its UNKNOWN reading whatever was cast", () => {
      const stormUnknown = {
        ...facts,
        talents: {
          ...ACTOR6_TALENTS,
          divine_storm: unknownTalent("divine_storm"),
          wake_of_ashes: unknownTalent("wake_of_ashes"),
        },
        observedCastAbilityIds: new Set([53385, 255937, 31884]),
      };
      expect(resolveRetributionApplicability(stormUnknown, actionNamed("divine_storm")).kind).toBe("UNKNOWN");
      expect(resolveRetributionApplicability(stormUnknown, actionNamed("wake_of_ashes")).kind).toBe(
        "UNKNOWN",
      );
      expect(foregroundProvenByObservedExecution(stormUnknown, "divine_storm")).toBeNull();
      // Templar's Verdict: an observed 383328 cast does not stand in for the pinned two-hander.
      const verdictObserved = { ...facts, observedCastAbilityIds: new Set([383328, 85256]) };
      expect(resolveRetributionApplicability(verdictObserved, actionNamed("templars_verdict")).kind).toBe(
        "UNKNOWN",
      );
      // And a BACKGROUND reading of another token is untouched by any cast.
      const observedStrike = { ...facts, observedCastAbilityIds: new Set([35395, 31884]) };
      expect(resolveRetributionApplicability(observedStrike, actionNamed("crusader_strike")).kind).toBe(
        "NOT_APPLICABLE",
      );
    });
  });
});

describe("usability: the proofs and nothing in between", () => {
  const state = initialRetributionState();

  it("the observed cast proves the observed action usable, whichever id the token binds", () => {
    expect(resolveRetributionUsability(state, actionNamed("templars_verdict"), FINAL_VERDICT).kind).toBe(
      "PROVEN_USABLE",
    );
    expect(resolveRetributionUsability(state, actionNamed("templars_verdict"), 85256).kind).toBe(
      "PROVEN_USABLE",
    );
  });

  it("a hypothetical prefix execution is PROVEN_UNUSABLE under its own counterfactual reason", () => {
    const action = actionNamed("auto_attack");
    const executed = withExecution(state, {
      listName: action.listName,
      priorityOrdinal: action.priorityOrdinal,
      actionToken: action.actionToken,
      sourceLine: action.sourceLine,
    });
    expect(resolveRetributionUsability(executed, action, FINAL_VERDICT)).toMatchObject({
      kind: "PROVEN_UNUSABLE",
      reason: "SIMULATED_PREFIX_EXECUTION",
    });
  });

  it("a spender is PROVEN usable when Holy Power is KNOWN at or above every pinned cost, or Divine Purpose is proven up", () => {
    const affordable = {
      holyPower: { state: "KNOWN_NUMBER" as const, value: 3 },
      divinePurposeUp: false,
      freeCastExcluded: true,
    };
    expect(
      resolveRetributionUsability(state, actionNamed("divine_storm"), FINAL_VERDICT, affordable).kind,
    ).toBe("PROVEN_USABLE");
    const free = {
      holyPower: unknownNumber("STATE_NOT_ESTABLISHED"),
      divinePurposeUp: true,
      freeCastExcluded: false,
    };
    expect(resolveRetributionUsability(state, actionNamed("divine_storm"), FINAL_VERDICT, free).kind).toBe(
      "PROVEN_USABLE",
    );
    expect(
      resolveRetributionUsability(state, actionNamed("divine_storm"), FINAL_VERDICT, UNKNOWN_SPENDER_FACTS)
        .kind,
    ).toBe("UNKNOWN");
  });

  it("INSUFFICIENT_RESOURCE needs Holy Power KNOWN below the cost AND Divine Purpose proven down, and is never claimed for Divine Storm", () => {
    const broke = {
      holyPower: { state: "KNOWN_NUMBER" as const, value: 2 },
      divinePurposeUp: false,
      freeCastExcluded: true,
    };
    expect(
      resolveRetributionUsability(state, actionNamed("templars_verdict"), DIVINE_STORM, broke),
    ).toMatchObject({
      kind: "PROVEN_UNUSABLE",
      reason: "INSUFFICIENT_RESOURCE",
    });
    // Divine Storm keeps its second free route (Empyrean Power), which nothing disproves.
    expect(resolveRetributionUsability(state, actionNamed("divine_storm"), FINAL_VERDICT, broke).kind).toBe(
      "UNKNOWN",
    );
    const undisproved = { ...broke, divinePurposeUp: null, freeCastExcluded: false };
    expect(
      resolveRetributionUsability(state, actionNamed("templars_verdict"), DIVINE_STORM, undisproved).kind,
    ).toBe("UNKNOWN");
  });

  it("Hammer of Wrath is unusable only from a supplied aura-gate fact, never from silence", () => {
    expect(resolveRetributionUsability(state, actionNamed("hammer_of_wrath"), FINAL_VERDICT).kind).toBe(
      "UNKNOWN",
    );
    const gated = resolveRetributionUsability(
      state,
      actionNamed("hammer_of_wrath"),
      FINAL_VERDICT,
      UNKNOWN_SPENDER_FACTS,
      [],
      [{ simcToken: "hammer_of_wrath", requiredAuraAbilityGameId: 1241410, anchorReportTimeMs: 1 }],
    );
    expect(gated).toMatchObject({ kind: "PROVEN_UNUSABLE", reason: "REQUIRED_AURA_INACTIVE" });
    // Judgment's complementary readiness is NOT proven in A4.
    expect(resolveRetributionUsability(state, actionNamed("judgment"), FINAL_VERDICT).kind).toBe("UNKNOWN");
  });
});

describe("the resolver", () => {
  it("binds variable.ds_castable only when the shared evaluator resolves the pinned expression in every world", () => {
    const stormUp = { ...BASE, knownBuffs: [{ name: "divine_arbiter_divine_storm", up: true }] };
    expect(resolveDsCastable(stormUp)).toEqual({ state: "BOUND", value: false });
    const verdictUp = {
      ...BASE,
      knownBuffs: [
        { name: "divine_arbiter_verdict", up: true },
        { name: "empyrean_legacy", up: false },
        { name: "divine_arbiter_divine_storm", up: false },
      ],
    };
    expect(resolveDsCastable(verdictUp)).toEqual({ state: "BOUND", value: true });
    // active_enemies is never bound, so with the arbiter verdict DOWN and the
    // rest down the disjunction stays open in one enumeration.
    const verdictDown = {
      ...BASE,
      knownBuffs: [
        { name: "divine_arbiter_verdict", up: false },
        { name: "empyrean_legacy", up: false },
        { name: "divine_arbiter_divine_storm", up: false },
      ],
    };
    expect(resolveDsCastable(verdictDown)).toMatchObject({
      state: "UNBOUND",
      reason: "VALUE_EXPRESSION_UNRESOLVED",
    });
    expect(resolveDsCastable(BASE)).toMatchObject({
      state: "UNBOUND",
      reason: "VALUE_EXPRESSION_UNRESOLVED",
    });
  });

  it("binds holy_power from the observation, pre_es_wake to zero, and states the unmodelled magnitudes as such", () => {
    const resolution = resolveRetributionAtoms({
      holyPower: { state: "EXACT_PRE_COST", amount: 5, max: 5, cost: 3 },
      sharedBindings: BASE,
    });
    const bound = Object.fromEntries(resolution.specAtoms.bound.map((entry) => [entry.key, entry.value]));
    expect(bound["holy_power"]).toEqual({ kind: "MAGNITUDE", binding: { state: "KNOWN_NUMBER", value: 5 } });
    expect(bound["variable.pre_es_wake"]).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "KNOWN_NUMBER", value: 0 },
    });
    expect(bound["variable.ds_castable"]).toBeUndefined();
    expect(bound["active_enemies"]).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "UNKNOWN_NUMBER", reason: "STATE_NOT_MODELLED" },
    });
    expect(bound["cooldown.hammer_of_wrath.charges"]).toMatchObject({ kind: "MAGNITUDE" });
    expect(bound["gcd"]).toMatchObject({ kind: "MAGNITUDE" });
    const none = resolveRetributionAtoms({
      holyPower: { state: "NO_OBSERVATION", reason: "x" },
      sharedBindings: BASE,
    });
    expect(
      Object.fromEntries(none.specAtoms.bound.map((entry) => [entry.key, entry.value]))["holy_power"],
    ).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "UNKNOWN_NUMBER", reason: "STATE_NOT_ESTABLISHED" },
    });
  });

  it("never binds a positive stack: the divine_arbiter_divine_storm identity is not a stack atom", () => {
    expect(DIVINE_ARBITER_DIVINE_STORM_BUFF_SPELL_ID).toBe(1306162);
    expect(
      (SUPPORTED_RETRIBUTION_STACK_ATOMS as readonly string[]).includes("divine_arbiter_divine_storm"),
    ).toBe(false);
  });
});
