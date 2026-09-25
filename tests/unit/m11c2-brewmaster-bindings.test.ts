/**
 * M11-C2: the Brewmaster Monk bindings, one rule at a time.
 *
 *   resolver         the six build-static truths from the resolved build —
 *                    the resolved hero tree TRUE and the other FALSE, NEITHER
 *                    when the tree is unresolved or contradictory — and the six
 *                    magnitudes always refused as STATE_NOT_MODELLED
 *   adapter          an unresolved hero tree leaves both run gates undecided
 *                    and the query UNKNOWN, never a guessed list
 *   applicability    the domain boundary first; talent-built actions
 *                    background only under a disproof; the celestial_brew
 *                    token over its two alternatives; empty_the_cellar
 *                    applicable (built on a driver spell)
 *   usability        the observed cast; STATIC_READY_FALSE for Tiger Palm
 *                    under Press the Advantage; ACTIVE_COOLDOWN from a derived
 *                    readiness; REQUIRED_AURA_INACTIVE only under a
 *                    corroborated, observed removal — which the Empty the
 *                    Cellar gate cannot have while its wire id is uncorroborated
 *   auras            presence from an observed transition or a talent
 *                    disproof, never from silence
 *   contracts        exactly one NON_GCD transition contract (auto_attack)
 */

import { describe, expect, it } from "vitest";

import type { AplAction } from "../../src/simc/apl-authority.js";
import type { HeroTreeResolution, TalentResolution } from "../../src/data/game/talent-selection.js";
import { talentNotModelled } from "../../src/data/game/talent-selection.js";
import {
  BREWMASTER_READINESS_FACTS,
  EMPTY_THE_CELLAR_BUFF_SIMC_SPELL_ID,
} from "../../src/data/game/monk-brewmaster-readiness-authority.js";
import {
  BLACKOUT_COMBO_BUFF_SPELL_ID,
  BREWMASTER_AURA_IDENTITIES,
  EMPTY_BARREL_BUFF_SPELL_ID,
  INVOKE_NIUZAO_BUFF_SPELL_ID,
} from "../../src/data/game/monk-brewmaster-aura-authority.js";
import {
  BREWMASTER_NON_GCD_TRANSITIONS,
  brewmasterTransitionContractFor,
} from "../../src/data/game/monk-brewmaster-transition-authority.js";
import {
  brewmasterExecutionLaneForToken,
  brewmasterTokenBinding,
  brewmasterTokenByAbilityId,
} from "../../src/data/game/monk-brewmaster-gcd-semantics.js";
import {
  brewmasterModelledTalentNames,
  resolveBrewmasterTalent,
} from "../../src/data/game/monk-brewmaster-talents.js";
import { unknownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import {
  resolveBrewmasterApplicability,
  resolveBrewmasterUsability,
  type BrewmasterBuildFacts,
} from "../../src/specs/monk/brewmaster/action-profile.js";
import {
  bindBrewmasterAura,
  corroboratedWireAuraIdFor,
  resolveReadinessAuraFact,
} from "../../src/specs/monk/brewmaster/aura-bindings.js";
import { brewmasterNonDomainApplicabilityFor } from "../../src/specs/monk/brewmaster/domain-boundary.js";
import { brewmasterFirstGcdSelectionAt } from "../../src/specs/monk/brewmaster/first-gcd-adapter.js";
import { initialBrewmasterState, withExecution } from "../../src/specs/monk/brewmaster/first-gcd-state.js";
import { pinnedBrewmasterMonkAuthority } from "../../src/specs/monk/brewmaster/pinned-authority.js";
import { resolveBrewmasterAtoms } from "../../src/specs/monk/brewmaster/resolver.js";
import { corpusState, positionOfCast } from "../support/corpus/fight.js";

const GTKB = "wcl-brewmaster-monk-gtkb-opener";
const ACTOR = 4;

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
const unknownTalent = (simcName: string): TalentResolution => talentNotModelled(simcName);

const SHADOPAN: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "shadopan",
  subTreeId: 65,
  decidedByEntryIds: [125063],
};
const MASTER_OF_HARMONY: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "master_of_harmony",
  subTreeId: 66,
  decidedByEntryIds: [125080],
};
const NO_TREE: HeroTreeResolution = { state: "UNKNOWN" };

function authority() {
  const loaded = pinnedBrewmasterMonkAuthority();
  if (!loaded.ok) throw new Error("the pinned Brewmaster authority did not load");
  return loaded.authority;
}

function entry(listName: string, priorityOrdinal: number): AplAction {
  const found = authority().actions.find(
    (action) => action.listName === listName && action.priorityOrdinal === priorityOrdinal,
  );
  if (found === undefined) throw new Error(`no ${listName}[${String(priorityOrdinal)}]`);
  return found;
}

function facts(
  talents: Readonly<Record<string, TalentResolution>>,
  heroTree = SHADOPAN,
): BrewmasterBuildFacts {
  return { talents, heroTree };
}

function bindingsFor(heroTree: HeroTreeResolution): AtomBindings {
  return {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: [],
    knownTalents: [],
    knownCooldownRemainsSeconds: [],
    specAtoms: resolveBrewmasterAtoms({
      heroTree,
      blackoutCombo: selected("blackout_combo"),
      salsalabimsStrength: selected("salsalabims_strength"),
      apex1: selected("apex.1"),
      apex3: selected("apex.3"),
    }).specAtoms,
  };
}

describe("the resolver", () => {
  it("binds the resolved hero tree TRUE and the other FALSE", () => {
    const shado = resolveBrewmasterAtoms({
      heroTree: SHADOPAN,
      blackoutCombo: selected("blackout_combo"),
      salsalabimsStrength: notSelected("salsalabims_strength"),
      apex1: selected("apex.1"),
      apex3: notSelected("apex.3"),
    });
    expect(shado.diagnostics.heroTreeBound).toBe("shadopan");
    expect(shado.diagnostics.buildStatic).toEqual({
      "hero_tree.master_of_harmony": false,
      "hero_tree.shadopan": true,
      "talent.blackout_combo.enabled": true,
      "talent.salsalabims_strength.enabled": false,
      "apex.1": true,
      "apex.3": false,
    });
    const harmony = resolveBrewmasterAtoms({
      heroTree: MASTER_OF_HARMONY,
      blackoutCombo: selected("blackout_combo"),
      salsalabimsStrength: selected("salsalabims_strength"),
      apex1: selected("apex.1"),
      apex3: selected("apex.3"),
    });
    expect(harmony.diagnostics.heroTreeBound).toBe("master_of_harmony");
    expect(harmony.diagnostics.buildStatic["hero_tree.master_of_harmony"]).toBe(true);
    expect(harmony.diagnostics.buildStatic["hero_tree.shadopan"]).toBe(false);
  });

  it("binds NEITHER hero tree when the tree is unresolved or contradictory, and nothing for an UNKNOWN talent", () => {
    for (const heroTree of [
      NO_TREE,
      { state: "CONTRADICTORY", subTreeIds: [65, 66] } as HeroTreeResolution,
    ]) {
      const resolution = resolveBrewmasterAtoms({
        heroTree,
        blackoutCombo: unknownTalent("blackout_combo"),
        salsalabimsStrength: unknownTalent("salsalabims_strength"),
        apex1: unknownTalent("apex.1"),
        apex3: unknownTalent("apex.3"),
      });
      expect(resolution.diagnostics.heroTreeBound).toBeNull();
      expect(Object.values(resolution.diagnostics.buildStatic).every((value) => value === null)).toBe(true);
      const truths = resolution.specAtoms.bound.filter((binding) => binding.value.kind === "TRUTH");
      expect(truths).toEqual([]);
    }
  });

  it("refuses all six magnitudes as STATE_NOT_MODELLED, whatever the build", () => {
    const resolution = resolveBrewmasterAtoms({
      heroTree: SHADOPAN,
      blackoutCombo: selected("blackout_combo"),
      salsalabimsStrength: selected("salsalabims_strength"),
      apex1: selected("apex.1"),
      apex3: selected("apex.3"),
    });
    const magnitudes = resolution.specAtoms.bound.filter((binding) => binding.value.kind === "MAGNITUDE");
    expect(magnitudes.map((binding) => binding.key)).toEqual([
      "cooldown.celestial_brew.charges_fractional",
      "cooldown.keg_smash.charges_fractional",
      "buff.aspect_of_harmony_accumulator.value",
      "health.max",
      "energy",
      "energy.regen",
    ]);
    for (const binding of magnitudes) {
      expect(binding.value).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") });
    }
  });
});

describe("the adapter over the real authority", () => {
  it("an unresolved hero tree leaves both run gates undecided: the query is UNKNOWN and no list is guessed", () => {
    const outcome = brewmasterFirstGcdSelectionAt({
      authority: authority(),
      bindings: bindingsFor(NO_TREE),
      buildFacts: facts({}, NO_TREE),
      observedAbilityGameId: 121253,
    });
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(outcome.rootScan.kind).toBe("BLOCKED");
    expect(outcome.rootScan.stoppingPoint?.at).toBe("default[4] run_action_list");
    expect(outcome.rootScan.stoppingPoint?.atoms).toEqual(["hero_tree.master_of_harmony"]);
    expect(outcome.rootScan.dispatches.map((step) => [step.at, step.outcome])).toContainEqual([
      "default[4]",
      "BLOCKED",
    ]);
  });

  it("a resolved Shado-Pan tree skips the Master of Harmony list and passes the Shado-Pan gate", () => {
    // No aura, cooldown or talent fact is supplied here, so the Shado-Pan list
    // itself cannot decide its first entry and the dispatch records the callee
    // as BLOCKED — but its GATE is TRUE, and the other tree's list is skipped.
    const outcome = brewmasterFirstGcdSelectionAt({
      authority: authority(),
      bindings: bindingsFor(SHADOPAN),
      buildFacts: facts({}, SHADOPAN),
      observedAbilityGameId: 121253,
    });
    expect(
      outcome.rootScan.dispatches.map((step) => [step.at, step.calleeListName, step.outcome, step.gate]),
    ).toEqual([
      ["default[2]", "race_actions", "CALL_RETURNED_NO_ACTION_CONTINUE", "UNCONDITIONAL"],
      ["default[3]", "item_actions", "CALL_RETURNED_NO_ACTION_CONTINUE", "UNCONDITIONAL"],
      ["default[4]", "master_of_harmony", "RUN_GATE_FALSE_SKIPPED", "FALSE"],
      ["default[5]", "shado_pan", "BLOCKED", "TRUE"],
    ]);
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
  });
});

describe("applicability", () => {
  it("classifies the potions, the item use and every racial OUTSIDE the domain before any build fact", () => {
    for (const [list, ordinal] of [
      ["precombat", 1],
      ["default", 1],
      ["item_actions", 0],
      ["race_actions", 0],
      ["race_actions", 2],
      ["race_actions", 6],
    ] as const) {
      const verdict = resolveBrewmasterApplicability(facts({}), entry(list, ordinal));
      expect(verdict).toMatchObject({ kind: "NOT_APPLICABLE", reason: "OUTSIDE_SUPPORTED_DECISION_DOMAIN" });
    }
    expect(brewmasterNonDomainApplicabilityFor(entry("shado_pan", 14))).toBeNull();
  });

  it("a talent-built action is background only under a disproof, UNKNOWN when unresolved, applicable when taken", () => {
    const rjw = entry("shado_pan", 19);
    expect(rjw.actionToken).toBe("rushing_jade_wind");
    expect(
      resolveBrewmasterApplicability(facts({ rushing_jade_wind: notSelected("rushing_jade_wind") }), rjw),
    ).toMatchObject({
      kind: "NOT_APPLICABLE",
      reason: "BACKGROUND_UNDER_PROVEN_BUILD",
    });
    expect(resolveBrewmasterApplicability(facts({}), rjw).kind).toBe("UNKNOWN");
    expect(
      resolveBrewmasterApplicability(facts({ rushing_jade_wind: selected("rushing_jade_wind") }), rjw).kind,
    ).toBe("APPLICABLE");
    // invoke_niuzao is built on the invoke_niuzao_the_black_ox talent.
    const niuzao = entry("shado_pan", 9);
    expect(niuzao.actionToken).toBe("invoke_niuzao");
    expect(
      resolveBrewmasterApplicability(
        facts({ invoke_niuzao_the_black_ox: notSelected("invoke_niuzao_the_black_ox") }),
        niuzao,
      ).kind,
    ).toBe("NOT_APPLICABLE");
  });

  it("the celestial_brew token is applicable under either alternative, background only when both are disproved", () => {
    const brew = entry("shado_pan", 16);
    expect(brew.actionToken).toBe("celestial_brew");
    expect(
      resolveBrewmasterApplicability(
        facts({
          celestial_infusion: selected("celestial_infusion"),
          celestial_brew: notSelected("celestial_brew"),
        }),
        brew,
      ).kind,
    ).toBe("APPLICABLE");
    expect(
      resolveBrewmasterApplicability(
        facts({
          celestial_infusion: notSelected("celestial_infusion"),
          celestial_brew: notSelected("celestial_brew"),
        }),
        brew,
      ),
    ).toMatchObject({ kind: "NOT_APPLICABLE", reason: "BACKGROUND_UNDER_PROVEN_BUILD" });
    expect(resolveBrewmasterApplicability(facts({}), brew).kind).toBe("UNKNOWN");
  });

  it("empty_the_cellar, tiger_palm, blackout_kick and expel_harm carry no talent guard", () => {
    for (const [list, ordinal, token] of [
      ["shado_pan", 11, "empty_the_cellar"],
      ["shado_pan", 12, "tiger_palm"],
      ["shado_pan", 20, "blackout_kick"],
      ["shado_pan", 22, "expel_harm"],
    ] as const) {
      const action = entry(list, ordinal);
      expect(action.actionToken).toBe(token);
      expect(resolveBrewmasterApplicability(facts({}), action).kind).toBe("APPLICABLE");
    }
  });
});

describe("usability", () => {
  const base = {
    state: initialBrewmasterState(),
    buildFacts: facts({ press_the_advantage: notSelected("press_the_advantage") }),
    readiness: [],
    readinessAuras: [],
  };

  it("the observed cast proves its own entry usable — the celestial_brew token by either record", () => {
    expect(
      resolveBrewmasterUsability({ ...base, action: entry("shado_pan", 14), observedAbilityGameId: 121253 }),
    ).toEqual({ kind: "PROVEN_USABLE" });
    expect(brewmasterTokenBinding("celestial_brew")).toMatchObject({ kind: "KNOWN_SET" });
    expect(
      resolveBrewmasterUsability({ ...base, action: entry("shado_pan", 16), observedAbilityGameId: 1241059 }),
    ).toEqual({ kind: "PROVEN_USABLE" });
    // Anything else observed proves nothing about this entry.
    expect(
      resolveBrewmasterUsability({ ...base, action: entry("shado_pan", 14), observedAbilityGameId: 205523 }),
    ).toEqual({ kind: "UNKNOWN" });
  });

  it("Tiger Palm is STATIC_READY_FALSE while Press the Advantage is SELECTED, and nothing while it is not", () => {
    const tigerPalm = entry("shado_pan", 12);
    const underPressTheAdvantage = resolveBrewmasterUsability({
      ...base,
      buildFacts: facts({ press_the_advantage: selected("press_the_advantage") }),
      action: tigerPalm,
      observedAbilityGameId: 121253,
    });
    expect(underPressTheAdvantage).toMatchObject({ kind: "PROVEN_UNUSABLE", reason: "STATIC_READY_FALSE" });
    expect(resolveBrewmasterUsability({ ...base, action: tigerPalm, observedAbilityGameId: 121253 })).toEqual(
      {
        kind: "UNKNOWN",
      },
    );
    expect(
      resolveBrewmasterUsability({
        ...base,
        buildFacts: facts({}),
        action: tigerPalm,
        observedAbilityGameId: 121253,
      }),
    ).toEqual({ kind: "UNKNOWN" });
  });

  it("a derived PROVEN_NOT_READY cooldown is ACTIVE_COOLDOWN; any other readiness proves nothing", () => {
    const niuzao = entry("shado_pan", 9);
    expect(
      resolveBrewmasterUsability({
        ...base,
        action: niuzao,
        observedAbilityGameId: 121253,
        readiness: [
          {
            simcToken: "invoke_niuzao",
            readiness: {
              state: "PROVEN_NOT_READY",
              provenRemainingAtLeastMs: 90000,
              cooldownToleranceMs: 250,
            },
            abilityGameId: 132578,
          },
        ],
      }),
    ).toMatchObject({ kind: "PROVEN_UNUSABLE", reason: "ACTIVE_COOLDOWN" });
    expect(
      resolveBrewmasterUsability({
        ...base,
        action: niuzao,
        observedAbilityGameId: 121253,
        readiness: [
          {
            simcToken: "invoke_niuzao",
            readiness: { state: "UNKNOWN", reason: "COOLDOWN_STATE_UNKNOWN" },
            abilityGameId: null,
          },
        ],
      }),
    ).toEqual({ kind: "UNKNOWN" });
  });

  it("REQUIRED_AURA_INACTIVE is made only from a PROVEN_INACTIVE readiness fact, never from NOT_ESTABLISHED", () => {
    const cellar = entry("shado_pan", 17);
    expect(cellar.actionToken).toBe("empty_the_cellar");
    expect(
      resolveBrewmasterUsability({
        ...base,
        action: cellar,
        observedAbilityGameId: 121253,
        readinessAuras: [
          {
            simcToken: "empty_the_cellar",
            state: "NOT_ESTABLISHED",
            reason: "WIRE_AURA_IDENTITY_NOT_CORROBORATED",
            wireAuraId: null,
            auraReason: null,
          },
        ],
      }),
    ).toEqual({ kind: "UNKNOWN" });
    expect(
      resolveBrewmasterUsability({
        ...base,
        action: cellar,
        observedAbilityGameId: 121253,
        readinessAuras: [
          {
            simcToken: "empty_the_cellar",
            state: "PROVEN_INACTIVE",
            wireAuraId: 999999,
            anchorReportTimeMs: 1,
          },
        ],
      }),
    ).toMatchObject({ kind: "PROVEN_UNUSABLE", reason: "REQUIRED_AURA_INACTIVE" });
  });

  it("a hypothetical prefix execution is its own counterfactual reason", () => {
    const action = entry("default", 0);
    const state = withExecution(initialBrewmasterState(), {
      listName: action.listName,
      priorityOrdinal: action.priorityOrdinal,
      actionToken: action.actionToken,
      sourceLine: action.sourceLine,
    });
    expect(
      resolveBrewmasterUsability({ ...base, state, action, observedAbilityGameId: 121253 }),
    ).toMatchObject({
      kind: "PROVEN_UNUSABLE",
      reason: "SIMULATED_PREFIX_EXECUTION",
    });
  });
});

describe("the Empty the Cellar readiness gate fails closed", () => {
  const gate = BREWMASTER_READINESS_FACTS.find((fact) => fact.simcToken === "empty_the_cellar")?.gate;

  it("its wire identity is uncorroborated, so no wire id is ever queried — least of all the SimC buff id", () => {
    expect(gate).toMatchObject({
      kind: "REQUIRES_AURA_ACTIVE",
      simcBuffSpellId: EMPTY_THE_CELLAR_BUFF_SIMC_SPELL_ID,
      wireAuraIdentity: "NOT_YET_CORROBORATED",
    });
    if (gate?.kind !== "REQUIRES_AURA_ACTIVE") return;
    expect(corroboratedWireAuraIdFor(gate)).toBeNull();
  });

  it("with no corroborated id the fact is NOT_ESTABLISHED, and silence under a supplied id is never INACTIVE", () => {
    const state = corpusState(GTKB);
    const found = positionOfCast(state, { actorId: ACTOR, reportTimeMs: 2425704, abilityGameId: 121253 });
    if (!found.ok) throw new Error(found.detail);
    expect(
      resolveReadinessAuraFact({
        state,
        actorId: ACTOR,
        position: found.position,
        simcToken: "empty_the_cellar",
        wireAuraId: null,
      }),
    ).toMatchObject({ state: "NOT_ESTABLISHED", reason: "WIRE_AURA_IDENTITY_NOT_CORROBORATED" });
    // Even the SimC buff id, were it (wrongly) supplied: the capture holds no transition of it, so M4 cannot prove it down.
    expect(
      resolveReadinessAuraFact({
        state,
        actorId: ACTOR,
        position: found.position,
        simcToken: "empty_the_cellar",
        wireAuraId: EMPTY_THE_CELLAR_BUFF_SIMC_SPELL_ID,
      }),
    ).toMatchObject({ state: "NOT_ESTABLISHED", reason: "AURA_STATE_UNKNOWN" });
  });

  it("the machinery reads an OBSERVED removal as PROVEN_INACTIVE (demonstrated under a stand-in id with one)", () => {
    // STAND-IN, NOT A CLAIM ABOUT EMPTY THE CELLAR: Blackout Combo (228563) is
    // removed at 2,424,688 and not reapplied before the Keg Smash at 2,425,704,
    // so under that id the same function proves the aura down from the removal.
    const state = corpusState(GTKB);
    const found = positionOfCast(state, { actorId: ACTOR, reportTimeMs: 2425704, abilityGameId: 121253 });
    if (!found.ok) throw new Error(found.detail);
    expect(
      resolveReadinessAuraFact({
        state,
        actorId: ACTOR,
        position: found.position,
        simcToken: "empty_the_cellar",
        wireAuraId: BLACKOUT_COMBO_BUFF_SPELL_ID,
      }),
    ).toEqual({
      simcToken: "empty_the_cellar",
      state: "PROVEN_INACTIVE",
      wireAuraId: BLACKOUT_COMBO_BUFF_SPELL_ID,
      anchorReportTimeMs: 2424688,
    });
  });
});

describe("aura bindings", () => {
  const state = corpusState(GTKB);
  const at = (reportTimeMs: number, abilityGameId: number): number => {
    const found = positionOfCast(state, { actorId: ACTOR, reportTimeMs, abilityGameId });
    if (!found.ok) throw new Error(found.detail);
    return found.position;
  };

  it("an aura consumed by the decision's own cast is still UP to it (Blackout Combo at the Tiger Palm that removes it)", () => {
    expect(
      bindBrewmasterAura(
        { state, actorId: ACTOR, position: at(2424688, 100780), talents: {} },
        "blackout_combo",
      ),
    ).toMatchObject({ state: "BOUND", up: true, proof: "OBSERVED" });
  });

  it("a disproved producing talent binds the buff DOWN without reading the stream", () => {
    expect(
      bindBrewmasterAura(
        {
          state,
          actorId: ACTOR,
          position: at(2415223, 121253),
          talents: { blackout_combo: notSelected("blackout_combo") },
        },
        "blackout_combo",
      ),
    ).toMatchObject({ state: "BOUND", up: false, proof: "TALENT_NOT_SELECTED" });
  });

  it("an unpinned atom is refused, never guessed", () => {
    expect(
      bindBrewmasterAura(
        { state, actorId: ACTOR, position: at(2415223, 121253), talents: {} },
        "aspect_of_harmony_spender",
      ),
    ).toMatchObject({ state: "UNBOUND", reason: "IDENTITY_NOT_PINNED" });
  });

  it("pins exactly three wire-corroborated identities", () => {
    expect(BREWMASTER_AURA_IDENTITIES.map((identity) => [identity.atomName, identity.abilityGameId])).toEqual(
      [
        ["blackout_combo", BLACKOUT_COMBO_BUFF_SPELL_ID],
        ["empty_barrel", EMPTY_BARREL_BUFF_SPELL_ID],
        ["invoke_niuzao_the_black_ox", INVOKE_NIUZAO_BUFF_SPELL_ID],
      ],
    );
    expect([BLACKOUT_COMBO_BUFF_SPELL_ID, EMPTY_BARREL_BUFF_SPELL_ID, INVOKE_NIUZAO_BUFF_SPELL_ID]).toEqual([
      228563, 1265307, 132578,
    ]);
  });
});

describe("pinned lanes, tokens, talents and contracts", () => {
  it("exactly one NON_GCD transition contract exists — auto_attack — and the three NON_GCD brews have none", () => {
    expect(BREWMASTER_NON_GCD_TRANSITIONS.map((contract) => contract.simcToken)).toEqual(["auto_attack"]);
    for (const brew of ["purifying_brew", "black_ox_brew", "fortifying_brew"]) {
      expect(brewmasterExecutionLaneForToken(brew)).toBe("NON_GCD");
      expect(brewmasterTransitionContractFor(brew)).toBeNull();
    }
    expect(brewmasterExecutionLaneForToken("celestial_brew")).toBe("GCD_CONSUMING");
  });

  it("the inverse token map names each supported spell by its token and binds no racial as a class token", () => {
    const tokens = brewmasterTokenByAbilityId();
    expect(tokens.get(121253)).toBe("keg_smash");
    expect(tokens.get(205523)).toBe("blackout_kick");
    expect(tokens.get(100780)).toBe("tiger_palm");
    expect(tokens.get(115181)).toBe("breath_of_fire");
    expect(tokens.get(132578)).toBe("invoke_niuzao");
    expect(tokens.get(1241059)).toBe("celestial_brew");
    // Observed-only abilities have no token and no lane record.
    expect(tokens.get(115546)).toBeUndefined();
    expect(tokens.get(124506)).toBeUndefined();
  });

  it("Empty the Cellar's talent is not modelled: its duplicate display name is never resolved here", () => {
    expect(brewmasterModelledTalentNames()).not.toContain("empty_the_cellar");
    expect(resolveBrewmasterTalent([{ id: 125002, nodeId: 101711 }], "empty_the_cellar")).toMatchObject({
      selection: "UNKNOWN",
    });
  });
});
