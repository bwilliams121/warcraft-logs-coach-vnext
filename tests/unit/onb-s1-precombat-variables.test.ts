/**
 * ONB-S1: the precombat list executed for VARIABLE assignment only.
 *
 * PINNED SEMANTICS (SimulationCraft 33622e9d; see `src/simc/precombat-variables.ts`):
 *
 *     every variable starts each iteration at the `default=` of the first
 *     variable action constructed for its name (player.cpp:6727-6728,
 *     variable.cpp:108-125; construction order precombat, default, then
 *     alphabetical, player.cpp:526-559); `combat_begin` then executes every
 *     ready precombat action in order (player.cpp:6150-6183) and stops after a
 *     harmful action enters combat (player.cpp:6180-6181); a value persists
 *     until a variable action writes it
 *
 * The central invariants:
 *   - a value that depends on PRE-PULL state (buffs, resources) stays
 *     UNKNOWN, even when the combat decision knows that state;
 *   - talent-, constant- and default-derived values resolve and carry;
 *   - a variable any combat list writes is never carried;
 *   - uncertainty is UNKNOWN, never a guessed value.
 */

import { describe, expect, it } from "vitest";

import paladinRetributionArtifact from "../../src/simc/data/paladin-retribution.apl.json";
import rogueAssassinationArtifact from "../../src/simc/data/rogue-assassination.apl.json";
import deathknightBloodArtifact from "../../src/simc/data/deathknight-blood.apl.json";
import monkBrewmasterArtifact from "../../src/simc/data/monk-brewmaster.apl.json";
import paladinProtectionArtifact from "../../src/simc/data/paladin-protection.apl.json";
import { provenUsable } from "../../src/simc/action-applicability.js";
import { loadAplAuthority, type AplAuthority } from "../../src/simc/apl-authority.js";
import {
  knownNumber,
  oneOfNumbers,
  unknownNumber,
  type AtomBindings,
  type NumericBinding,
} from "../../src/simc/expression/evaluate.js";
import { selectAcrossLists, type TraversalResult } from "../../src/simc/nested-selection.js";
import {
  executePrecombatVariables,
  incomingScanVariables,
  precombatBindings,
  type PrecombatCarry,
} from "../../src/simc/precombat-variables.js";
import { establishedVariableDefaults } from "../../src/simc/variable-execution.js";
import { syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: knownNumber(0),
  energyPct: knownNumber(100),
  dotRemainsSecondsByAction: [],
  knownBuffs: [{ name: "foo", up: true }],
};

const withTalents = (talents: readonly { name: string; taken: boolean }[]): AtomBindings => ({
  ...BINDINGS,
  knownTalents: talents,
});

const authorityOf = (lists: readonly SyntheticListSpec[]): AplAuthority =>
  syntheticAuthority({ lists: lists as SyntheticListSpec[] });

const carryOf = (lists: readonly SyntheticListSpec[], bindings: AtomBindings = BINDINGS): PrecombatCarry =>
  executePrecombatVariables(authorityOf(lists), bindings).carry;

const carriedValue = (carry: PrecombatCarry, name: string): NumericBinding | undefined => {
  if (carry.kind !== "CARRIED") throw new Error(`not carried: ${JSON.stringify(carry)}`);
  return carry.values.get(name);
};

const scan = (lists: readonly SyntheticListSpec[], bindings: AtomBindings = BINDINGS): TraversalResult =>
  selectAcrossLists({
    authority: authorityOf(lists),
    entryListName: "default",
    bindings,
    usabilityFor: () => provenUsable(),
  });

const selected = (result: TraversalResult): string | null =>
  result.kind === "SELECTED" ? result.actionToken : null;

function pinned(artifact: unknown): AplAuthority {
  const loaded = loadAplAuthority(artifact);
  if (!loaded.ok) throw new Error(loaded.detail);
  return loaded.authority;
}

describe("ONB-S1 established defaults", () => {
  it("takes the default of the FIRST constructed line: precombat, then default, then alphabetical", () => {
    const defaults = establishedVariableDefaults(
      authorityOf([
        {
          listName: "default",
          actions: ["variable,name=a,value=1,default=2", "variable,name=b,value=1,default=5"],
        },
        {
          listName: "aaa",
          actions: ["variable,name=b,value=1,default=6", "variable,name=c,value=1,default=7"],
        },
        { listName: "precombat", actions: ["variable,name=a,value=1,default=3"] },
      ]),
    );
    expect(defaults.get("a")).toEqual(knownNumber(3));
    expect(defaults.get("b")).toEqual(knownNumber(5));
    expect(defaults.get("c")).toEqual(knownNumber(7));
  });

  it("skips a line the constructor makes background, and reads 0 with no default=", () => {
    const defaults = establishedVariableDefaults(
      authorityOf([
        {
          listName: "precombat",
          actions: [
            "variable,name=x,default=9",
            "variable,name=x,op=bogus,value=1,default=8",
            "variable,name=x,op=setif,value=1,default=7",
            "variable,name=x,value=1",
            "variable,name=y,op=reset,default=-2",
          ],
        },
        { listName: "default", actions: ["z"] },
      ]),
    );
    expect(defaults.get("x")).toEqual(knownNumber(0));
    expect(defaults.get("y")).toEqual(knownNumber(-2));
  });

  it("an unreadable default= is UNKNOWN, and a malformed line leaves every default unestablished", () => {
    const unreadable = establishedVariableDefaults(
      authorityOf([
        { listName: "precombat", actions: ["variable,name=x,value=1,default=talent.foo"] },
        { listName: "default", actions: ["z"] },
      ]),
    );
    expect(unreadable.get("x")?.state).toBe("UNKNOWN_NUMBER");
    const malformed = establishedVariableDefaults(
      authorityOf([
        { listName: "precombat", actions: ["variable,name=x,value=1,default=3"] },
        { listName: "default", actions: ["variable,name=y,name=z,value=1"] },
      ]),
    );
    expect(malformed.size).toBe(0);
  });
});

describe("ONB-S1 precombat execution", () => {
  it("a constant assignment carries into every combat scan", () => {
    const lists = [
      { listName: "precombat", actions: ["snapshot_stats", "variable,name=x,value=2"] },
      { listName: "default", actions: ["y,if=variable.x=2", "z"] },
    ];
    expect(carriedValue(carryOf(lists), "x")).toEqual(knownNumber(2));
    expect(selected(scan(lists))).toBe("y");
  });

  it("a talent-derived value resolves from the build, both ways", () => {
    const lists = [
      { listName: "precombat", actions: ["variable,name=x,value=1,if=talent.foo"] },
      { listName: "default", actions: ["y,if=variable.x=1", "z"] },
    ];
    expect(selected(scan(lists, withTalents([{ name: "foo", taken: true }])))).toBe("y");
    // Not taken: the line does not run and x keeps its default, 0.
    expect(selected(scan(lists, withTalents([{ name: "foo", taken: false }])))).toBe("z");
  });

  it("an unknown talent leaves both outcomes open and the combat read UNKNOWN", () => {
    const lists = [
      { listName: "precombat", actions: ["variable,name=x,value=1,if=talent.foo"] },
      { listName: "default", actions: ["y,if=variable.x=1", "z"] },
    ];
    expect(carriedValue(carryOf(lists), "x")).toEqual(oneOfNumbers([0, 1], "STATE_NOT_ESTABLISHED"));
    expect(scan(lists).kind).toBe("UNKNOWN");
  });

  it("NEVER reads the combat decision's resources: a pre-pull resource stays UNKNOWN", () => {
    const lists = [
      { listName: "precombat", actions: ["variable,name=x,value=combo_points"] },
      { listName: "default", actions: ["y,if=variable.x>=5", "z"] },
    ];
    // The decision knows combo_points = 7; the pull did not.
    expect(carriedValue(carryOf(lists), "x")?.state).toBe("UNKNOWN_NUMBER");
    expect(scan(lists).kind).toBe("UNKNOWN");
  });

  it("NEVER reads the combat decision's buffs: a pre-pull buff gate stays undecided", () => {
    const lists = [
      { listName: "precombat", actions: ["variable,name=x,value=1,if=buff.foo.up"] },
      { listName: "default", actions: ["y,if=variable.x=1", "z"] },
    ];
    expect(carriedValue(carryOf(lists), "x")).toEqual(oneOfNumbers([0, 1], "STATE_NOT_ESTABLISHED"));
    expect(scan(lists).kind).toBe("UNKNOWN");
  });

  it("precombat bindings keep the build and the vocabulary, and nothing observed", () => {
    const bindings = precombatBindings({
      ...withTalents([{ name: "foo", taken: true }]),
      knownCooldownRemainsSeconds: [{ name: "bar", remainsSeconds: knownNumber(0) }],
      stealthedRogue: true,
    });
    expect(bindings).toEqual({
      comboPoints: unknownNumber("STATE_NOT_ESTABLISHED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_ESTABLISHED"),
      energyPct: unknownNumber("STATE_NOT_ESTABLISHED"),
      knownBuffs: [],
      knownTalents: [{ name: "foo", taken: true }],
    });
  });

  it("a precombat read before assignment sees the default, and reset restores the ESTABLISHED default", () => {
    const lists = [
      {
        listName: "precombat",
        actions: [
          "variable,name=a,value=variable.b+0",
          "variable,name=b,value=5,default=3",
          "variable,name=b,op=reset,default=9",
        ],
      },
      { listName: "default", actions: ["z"] },
    ];
    const carry = carryOf(lists);
    expect(carriedValue(carry, "a")).toEqual(knownNumber(3));
    expect(carriedValue(carry, "b")).toEqual(knownNumber(3));
  });

  it("a line after an action that may be harmful may never have run: its effect is joined", () => {
    const after = (action: string) => [
      { listName: "precombat", actions: [action, "variable,name=x,value=1"] },
      { listName: "default", actions: ["y,if=variable.x=1", "z"] },
    ];
    expect(carriedValue(carryOf(after("frostbolt")), "x")).toEqual(
      oneOfNumbers([0, 1], "STATE_NOT_ESTABLISHED"),
    );
    expect(scan(after("frostbolt")).kind).toBe("UNKNOWN");
    for (const proven of ["snapshot_stats", "flask", "food", "augmentation", "potion"]) {
      expect(carriedValue(carryOf(after(proven)), "x")).toEqual(knownNumber(1));
    }
  });

  it("a variable any combat list writes is never carried: its read before the combat write is UNKNOWN", () => {
    const lists = [
      { listName: "precombat", actions: ["variable,name=x,value=1"] },
      { listName: "default", actions: ["y,if=variable.x=1", "call_action_list,name=later", "z"] },
      { listName: "later", actions: ["variable,name=x,value=2,if=buff.bar.up"] },
    ];
    const carry = carryOf(lists);
    expect(carry).toMatchObject({ kind: "CARRIED", writtenInCombat: ["x"] });
    expect(carriedValue(carry, "x")).toBeUndefined();
    expect(scan(lists).kind).toBe("UNKNOWN");
  });

  it("refuses to carry anything across a malformed line or a precombat dispatch", () => {
    expect(
      carryOf([
        { listName: "precombat", actions: ["variable,name=x,value=1", "variable,name=y,name=z,value=1"] },
        { listName: "default", actions: ["z"] },
      ]),
    ).toEqual({ kind: "NOT_CARRIED", reason: "PRECOMBAT_TAINTED" });
    expect(
      carryOf([
        { listName: "precombat", actions: ["variable,name=x,value=1"] },
        { listName: "default", actions: ["variable,name=q,name=r,value=1", "z"] },
      ]),
    ).toEqual({ kind: "NOT_CARRIED", reason: "UNATTRIBUTED_COMBAT_WRITE" });
    expect(
      carryOf([
        { listName: "precombat", actions: ["variable,name=x,value=1", "call_action_list,name=more"] },
        { listName: "more", actions: ["variable,name=x,value=2"] },
        { listName: "default", actions: ["z"] },
      ]),
    ).toEqual({ kind: "NOT_CARRIED", reason: "PRECOMBAT_LIST_DISPATCH" });
  });

  it("an unmodelled precombat operation is UNKNOWN, never the default", () => {
    const lists = [
      { listName: "precombat", actions: ["variable,name=x,value=1", "variable,name=x,op=add,value=1"] },
      { listName: "default", actions: ["y,if=variable.x>=1", "z"] },
    ];
    expect(carriedValue(carryOf(lists), "x")?.state).toBe("UNKNOWN_NUMBER");
    expect(scan(lists).kind).toBe("UNKNOWN");
  });

  it("an authority with no precombat variable starts every scan at the unknown incoming value", () => {
    const authority = authorityOf([
      { listName: "precombat", actions: ["snapshot_stats"] },
      { listName: "default", actions: ["z"] },
    ]);
    expect(executePrecombatVariables(authority, BINDINGS).carry).toEqual({ kind: "NO_PRECOMBAT_VARIABLES" });
    expect(incomingScanVariables(authority, BINDINGS).values.size).toBe(0);
  });
});

describe("ONB-S1 on the pinned public authorities", () => {
  it("Retribution: pre_es_wake carries KNOWN 0; the trinket variables (unparsed trinket.*) resolve no further", () => {
    const carry = executePrecombatVariables(pinned(paladinRetributionArtifact), BINDINGS).carry;
    expect(carry.kind).toBe("CARRIED");
    if (carry.kind !== "CARRIED") return;
    expect(carry.values.get("pre_es_wake")).toEqual(knownNumber(0));
    expect(carry.values.get("trinket_1_buffs")?.state).toBe("UNKNOWN_NUMBER");
    expect(carry.values.get("trinket_2_buffs")?.state).toBe("UNKNOWN_NUMBER");
    // `setif` always assigns one of its two values; the condition decides neither.
    expect(carry.values.get("trinket_1_sync")).toEqual(oneOfNumbers([0.5, 1], "STATE_NOT_ESTABLISHED"));
    expect(carry.values.get("trinket_2_sync")).toEqual(oneOfNumbers([0.5, 1], "STATE_NOT_ESTABLISHED"));
    expect(carry.values.get("trinket_priority")).toEqual(oneOfNumbers([1, 2], "STATE_NOT_ESTABLISHED"));
    expect(carry.writtenInCombat).toEqual([]);
  });

  it("Assassination: trinket_sync_slot is one of 0, 1, 2 — its gates do not parse, so no slot is picked", () => {
    const carry = executePrecombatVariables(pinned(rogueAssassinationArtifact), BINDINGS).carry;
    expect(carry.kind).toBe("CARRIED");
    if (carry.kind !== "CARRIED") return;
    expect([...carry.values.keys()]).toEqual(["trinket_sync_slot"]);
    expect(carry.values.get("trinket_sync_slot")).toEqual(oneOfNumbers([0, 1, 2], "STATE_NOT_ESTABLISHED"));
  });

  it("Blood, Brewmaster and Protection have no precombat variable", () => {
    for (const artifact of [deathknightBloodArtifact, monkBrewmasterArtifact, paladinProtectionArtifact]) {
      expect(executePrecombatVariables(pinned(artifact), BINDINGS).carry).toEqual({
        kind: "NO_PRECOMBAT_VARIABLES",
      });
    }
  });
});
