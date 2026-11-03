/**
 * ONB-S2: the variable combining operations in the shared engine.
 *
 * PINNED SEMANTICS (SimulationCraft 33622e9d; see `src/simc/variable-execution.ts`
 * `combineVariableValue`):
 *
 *     variable.cpp:269-311  add, sub, mul: `current op= v`; div and mod by zero
 *                           set 0, else `current /= v` and `std::fmod`; pow is
 *                           `std::pow`; min / max are `std::min` / `std::max`;
 *                           floor / ceil are `util::floor` / `util::ceil`
 *     util.hpp:308-309      `decplaces` defaults to 0, so those are `::floor`
 *     util.cpp:3131-3136,   and `::ceil`
 *       3161-3166
 *     variable.cpp:369-391  `cycling_variable` repeats the operation once per
 *                           enemy in the target list (action.cpp:1729-1770)
 *
 * The central invariants:
 *   - an operand of unknown value — the current value or `value=` — yields
 *     UNKNOWN, never a guessed value, never the default, never zero;
 *   - a known result is the double SimulationCraft computes, or UNKNOWN;
 *   - `cycling_variable` stays UNKNOWN: it depends on the enemy set;
 *   - no public authority's decision changes: none uses a combining line.
 */

import { describe, expect, it } from "vitest";

import deathknightBloodArtifact from "../../src/simc/data/deathknight-blood.apl.json";
import monkBrewmasterArtifact from "../../src/simc/data/monk-brewmaster.apl.json";
import paladinProtectionArtifact from "../../src/simc/data/paladin-protection.apl.json";
import paladinRetributionArtifact from "../../src/simc/data/paladin-retribution.apl.json";
import rogueAssassinationArtifact from "../../src/simc/data/rogue-assassination.apl.json";
import { provenUsable } from "../../src/simc/action-applicability.js";
import { loadAplAuthority, parseAplLine, type AplAction } from "../../src/simc/apl-authority.js";
import {
  boundedBelowNumber,
  initialScanVariables,
  knownNumber,
  oneOfNumbers,
  unknownNumber,
  withScanVariable,
  type AtomBindings,
  type NumericBinding,
  type ScanVariables,
} from "../../src/simc/expression/evaluate.js";
import { evaluateCondition } from "../../src/simc/list-selection.js";
import { selectAcrossLists, type TraversalResult } from "../../src/simc/nested-selection.js";
import { executePrecombatVariables, type PrecombatCarry } from "../../src/simc/precombat-variables.js";
import {
  combineVariableValue,
  executeVariableLine,
  neverFoldedVariables,
  type CombiningOperation,
} from "../../src/simc/variable-execution.js";
import { syntheticArtifact, syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: knownNumber(0),
  energyPct: knownNumber(100),
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
};

/** Supported syntax, never bound: an undecided condition. */
const UNDECIDED = "buff.foo.up";
/** Supported syntax whose MAGNITUDE is never known. */
const UNKNOWN_VALUE = "fight_remains";

function actionOf(line: string): AplAction {
  const loaded = loadAplAuthority(syntheticArtifact({ lists: [{ listName: "default", actions: [line] }] }));
  if (!loaded.ok) throw new Error(loaded.detail);
  const lookup = loaded.authority.actionsInList("default");
  const [action] = lookup.found ? lookup.actions : [];
  if (action === undefined) throw new Error("no action");
  return action;
}

/**
 * As if the authority also had a never-constant line (dd to max) on x,
 * so SimulationCraft never folds it and loor / ceil execute. Tests of the
 * folding gate pass their own set.
 */
const X_NEVER_FOLDED: ReadonlySet<string> = new Set(["x"]);

function execute(
  line: string,
  state: ScanVariables = initialScanVariables(),
  bindings: AtomBindings = BINDINGS,
  neverFolded: ReadonlySet<string> = X_NEVER_FOLDED,
) {
  const action = actionOf(line);
  const withState: AtomBindings = { ...bindings, scanVariables: state };
  return executeVariableLine(
    action,
    evaluateCondition(action, withState),
    withState,
    state,
    undefined,
    neverFolded,
  );
}

const holding = (value: NumericBinding): ScanVariables =>
  withScanVariable(initialScanVariables(), "x", value);
const after = (line: string, prior: NumericBinding) => execute(line, holding(prior)).state.values.get("x");

const scan = (lists: readonly SyntheticListSpec[], bindings: AtomBindings = BINDINGS): TraversalResult =>
  selectAcrossLists({
    authority: syntheticAuthority({ lists: lists as SyntheticListSpec[] }),
    entryListName: "default",
    bindings,
    usabilityFor: () => provenUsable(),
  });
const one = (actions: readonly string[]) => [{ listName: "default", actions }];
const selected = (result: TraversalResult) => (result.kind === "SELECTED" ? result.actionToken : result.kind);

const carryOf = (lists: readonly SyntheticListSpec[]): PrecombatCarry =>
  executePrecombatVariables(syntheticAuthority({ lists: lists as SyntheticListSpec[] }), BINDINGS).carry;
const carried = (carry: PrecombatCarry, name: string): NumericBinding | undefined => {
  if (carry.kind !== "CARRIED") throw new Error(`not carried: ${JSON.stringify(carry)}`);
  return carry.values.get(name);
};

// ---------------------------------------------------------------------------
// The pinned arithmetic
// ---------------------------------------------------------------------------

describe("ONB-S2 pinned arithmetic over a known value", () => {
  it("each operation combines with the CURRENT value and records which it was", () => {
    const cases: readonly (readonly [string, number, number, CombiningOperation])[] = [
      ["add,value=3", 5, 8, "ADD"],
      ["sub,value=3", 5, 2, "SUB"],
      ["mul,value=3", 5, 15, "MUL"],
      ["div,value=4", 5, 1.25, "DIV"],
      ["pow,value=3", 5, 125, "POW"],
      ["mod,value=3", 5, 2, "MOD"],
      ["min,value=3", 5, 3, "MIN"],
      ["max,value=3", 5, 5, "MAX"],
      ["floor", 5.5, 5, "FLOOR"],
      ["ceil", 5.5, 6, "CEIL"],
    ];
    for (const [options, prior, expected, operation] of cases) {
      const line = `variable,name=x,op=${options}`;
      expect(execute(line, holding(knownNumber(prior))).record, line).toEqual({
        kind: "ASSIGNED",
        name: "x",
        operation,
        executed: "PROVEN",
        value: knownNumber(expected),
      });
    }
  });

  it("div and mod by zero set the value to 0 (variable.cpp:281-283, 294-296)", () => {
    expect(after("variable,name=x,op=div,value=0", knownNumber(5))).toEqual(knownNumber(0));
    expect(after("variable,name=x,op=mod,value=0", knownNumber(5))).toEqual(knownNumber(0));
    expect(after("variable,name=x,op=div,value=combo_points-7", knownNumber(5))).toEqual(knownNumber(0));
  });

  it("mod is fmod: the sign of the dividend, fractional operands exact", () => {
    expect(after("variable,name=x,op=mod,value=3", knownNumber(-7))).toEqual(knownNumber(-1));
    expect(after("variable,name=x,op=mod,value=0-3", knownNumber(7))).toEqual(knownNumber(1));
    expect(after("variable,name=x,op=mod,value=2", knownNumber(7.5))).toEqual(knownNumber(1.5));
  });

  it("floor and ceil round toward -inf and +inf, and read no value=", () => {
    expect(after("variable,name=x,op=floor", knownNumber(-2.5))).toEqual(knownNumber(-3));
    expect(after("variable,name=x,op=ceil", knownNumber(-2.5))).toEqual(knownNumber(-2));
    expect(after("variable,name=x,op=ceil", knownNumber(4))).toEqual(knownNumber(4));
    // The constructor never parses `value=` for floor or ceil (variable.cpp:135-136).
    expect(after(`variable,name=x,op=floor,value=${UNKNOWN_VALUE}`, knownNumber(2.7))).toEqual(
      knownNumber(2),
    );
  });

  it("min and max keep the current value on a tie and take the operand only when strictly beyond", () => {
    expect(after("variable,name=x,op=min,value=5", knownNumber(5))).toEqual(knownNumber(5));
    expect(after("variable,name=x,op=max,value=9", knownNumber(5))).toEqual(knownNumber(9));
    expect(after("variable,name=x,op=min,value=0-1", knownNumber(5))).toEqual(knownNumber(-1));
  });

  it("pow is computed only where the exact result is a safe integer", () => {
    expect(after("variable,name=x,op=pow,value=10", knownNumber(2))).toEqual(knownNumber(1024));
    expect(after("variable,name=x,op=pow,value=0", knownNumber(0))).toEqual(knownNumber(1));
    expect(after("variable,name=x,op=pow,value=3", knownNumber(-2))).toEqual(knownNumber(-8));
    expect(combineVariableValue("POW", knownNumber(-1), knownNumber(1001))).toEqual(knownNumber(-1));
    // A libm-dependent double is not reproduced: UNKNOWN, never an approximation.
    for (const [base, exponent] of [
      [2, 0.5],
      [2, -1],
      [1.5, 2],
      [3, 40],
    ] as const) {
      expect(
        combineVariableValue("POW", knownNumber(base), knownNumber(exponent)),
        `${base}^${exponent}`,
      ).toEqual(unknownNumber("STATE_NOT_MODELLED"));
    }
  });

  it("a non-finite result is UNKNOWN, never Infinity", () => {
    expect(combineVariableValue("MUL", knownNumber(1e308), knownNumber(10))).toEqual(
      unknownNumber("STATE_NOT_MODELLED"),
    );
  });

  it("the operand is evaluated under the line's own bindings", () => {
    expect(after("variable,name=x,op=add,value=combo_points*2", knownNumber(1))).toEqual(knownNumber(15));
    expect(after("variable,name=x,op=add,value=variable.x", knownNumber(4))).toEqual(knownNumber(8));
  });
});

// ---------------------------------------------------------------------------
// Unknown operands
// ---------------------------------------------------------------------------

describe("ONB-S2 an operand of unknown value yields UNKNOWN", () => {
  it("the unknown incoming value: never the default, never zero", () => {
    for (const line of [
      "variable,name=x,op=add,value=1",
      "variable,name=x,op=mul,value=0",
      "variable,name=x,op=max,value=3",
      "variable,name=x,op=ceil",
      "variable,name=x,op=add,value=1,default=4",
    ]) {
      const result = execute(line);
      expect(result.record, line).toMatchObject({ kind: "ASSIGNED", executed: "PROVEN" });
      expect(result.state.values.get("x")?.state, line).toBe("UNKNOWN_NUMBER");
    }
  });

  it("an unknown or unsupported value= over a known current value", () => {
    expect(after(`variable,name=x,op=add,value=${UNKNOWN_VALUE}`, knownNumber(1))?.state).toBe(
      "UNKNOWN_NUMBER",
    );
    expect(after("variable,name=x,op=add,value=combo_points%2", knownNumber(1))?.state).toBe(
      "UNKNOWN_NUMBER",
    );
    expect(after("variable,name=x,op=add,value=trinket.1.has_use_buff", knownNumber(1))?.state).toBe(
      "UNKNOWN_NUMBER",
    );
  });

  it("a missing value= is not modelled, as for set", () => {
    expect(execute("variable,name=x,op=add", holding(knownNumber(1))).record).toEqual({
      kind: "NOT_MODELLED",
      name: "x",
      reason: "MISSING_EXPRESSION",
    });
  });

  it("a proven lower bound is not carried through combining arithmetic", () => {
    const bounded = boundedBelowNumber(3, "STATE_NOT_ESTABLISHED");
    expect(after("variable,name=x,op=add,value=1", bounded)).toEqual(unknownNumber("STATE_NOT_MODELLED"));
    expect(combineVariableValue("ADD", knownNumber(1), bounded)).toEqual(unknownNumber("STATE_NOT_MODELLED"));
  });

  it("a finite set maps member by member against an exact operand", () => {
    const set = oneOfNumbers([1, 2], "STATE_NOT_ESTABLISHED");
    expect(after("variable,name=x,op=add,value=1", set)).toEqual(
      oneOfNumbers([2, 3], "STATE_NOT_ESTABLISHED"),
    );
    expect(after("variable,name=x,op=min,value=1.5", set)).toEqual(
      oneOfNumbers([1, 1.5], "STATE_NOT_ESTABLISHED"),
    );
    expect(after("variable,name=x,op=mul,value=0", set)).toEqual(knownNumber(0));
    expect(combineVariableValue("SUB", knownNumber(10), set)).toEqual(
      oneOfNumbers([8, 9], "STATE_NOT_ESTABLISHED"),
    );
  });

  it("two sets are never paired: the same unresolved value read twice manufactures nothing", () => {
    const set = oneOfNumbers([1, 2], "STATE_NOT_ESTABLISHED");
    // Pairing would claim { 2, 3, 4 }; SimulationCraft can only leave 2 or 4.
    expect(after("variable,name=x,op=add,value=variable.x", set)).toEqual(
      unknownNumber("STATE_NOT_MODELLED"),
    );
  });

  it("if= FALSE leaves the value; if= undecided joins it with the combination", () => {
    expect(
      execute("variable,name=x,op=add,value=1,if=combo_points<5", holding(knownNumber(2))).record,
    ).toEqual({
      kind: "CONDITION_FALSE",
      name: "x",
    });
    expect(after(`variable,name=x,op=add,value=1,if=${UNDECIDED}`, knownNumber(2))).toEqual(
      oneOfNumbers([2, 3], "STATE_NOT_ESTABLISHED"),
    );
  });
});

// ---------------------------------------------------------------------------
// Constant folding: floor and ceil
// ---------------------------------------------------------------------------

describe("ONB-S2 floor and ceil execute only on a variable SimulationCraft never folds", () => {
  it("neverFoldedVariables: a named add..max line with a value= proves it; floor, ceil, reset, set do not", () => {
    const authority = syntheticAuthority({
      lists: [
        {
          listName: "default",
          actions: [
            "variable,name=a,op=add,value=1",
            "variable,name=B,op=max,value=combo_points",
            "cycling_variable,name=c,op=min,value=1",
            "variable,name=d,op=floor",
            "variable,name=e,op=ceil",
            "variable,name=f,op=reset",
            "variable,name=g,value=1",
            "variable,name=h,op=setif,condition=1,value=1,value_else=0",
            // The constructor makes these background: they prove nothing.
            "variable,name=i,op=add",
            "variable,op=add,value=1",
            // A repeated option is not used as proof.
            "variable,name=j,op=add,op=set,value=1",
            "z",
          ],
        },
      ],
    });
    expect([...neverFoldedVariables(authority)].sort()).toEqual(["a", "b", "c"]);
  });

  it("without the proof, floor and ceil write UNKNOWN, never the rounded value", () => {
    for (const line of ["variable,name=x,op=floor", "variable,name=x,op=ceil"]) {
      const result = execute(line, holding(knownNumber(1.5)), BINDINGS, new Set());
      expect(result.record, line).toEqual({ kind: "NOT_MODELLED", name: "x", reason: "CONSTANT_FOLDING" });
      expect(result.state.values.get("x")?.state, line).toBe("UNKNOWN_NUMBER");
    }
  });

  it("two constant writes with a read between them: no confident answer (the review's case)", () => {
    // From iteration 1 SimulationCraft folds x to its end-of-iteration-0 value
    // (2), so `y` would be selected; the in-scan value at the read is 1.
    for (const op of ["floor", "ceil"]) {
      const result = scan(
        one([
          "variable,name=x,value=1.5",
          `variable,name=x,op=${op}`,
          `y,if=variable.x=${op === "floor" ? 1 : 2}`,
          "variable,name=x,value=2",
          "z",
        ]),
      );
      expect(result.kind, op).toBe("UNKNOWN");
    }
  });

  it("with an add..max line on the variable anywhere in the authority, they execute in the scan", () => {
    const listsWith = (op: string) => [
      {
        listName: "default",
        actions: ["variable,name=x,value=1.5", `variable,name=x,op=${op}`, "y,if=variable.x=1", "z"],
      },
      { listName: "other", actions: ["variable,name=x,op=add,value=1"] },
    ];
    expect(selected(scan(listsWith("floor")))).toBe("y");
    expect(selected(scan(listsWith("ceil")))).toBe("z");
  });
});

// ---------------------------------------------------------------------------
// cycling_variable
// ---------------------------------------------------------------------------

describe("ONB-S2 cycling_variable stays UNKNOWN: it depends on the enemy set", () => {
  it("every operation, the pinned Vengeance and Affliction lines included", () => {
    for (const line of [
      "cycling_variable,name=x,op=add,value=1",
      "cycling_variable,name=x,op=reset",
      "cycling_variable,name=x,op=max,value=3",
      "cycling_variable,name=x,value=1",
      "cycling_variable,name=dung_pull_ttd,op=max,value=target.time_to_die",
      "cycling_variable,name=min_agony,op=min,value=dot.agony.remains+(99*!dot.agony.remains)",
    ]) {
      const name = parseAplLine(line).options.find((option) => option.key === "name")?.value ?? "x";
      const result = execute(line, withScanVariable(initialScanVariables(), name, knownNumber(1)));
      expect(result.record, line).toEqual({ kind: "NOT_MODELLED", name, reason: "CYCLING_VARIABLE" });
      expect(result.state.values.get(name)?.state, line).toBe("UNKNOWN_NUMBER");
    }
  });
});

// ---------------------------------------------------------------------------
// In the scan and in precombat
// ---------------------------------------------------------------------------

describe("ONB-S2 in the scan", () => {
  it("a reset-then-combine chain decides a later condition", () => {
    expect(
      selected(
        scan(
          one([
            "variable,name=x,op=reset",
            "variable,name=x,op=add,value=combo_points",
            "variable,name=x,op=div,value=2",
            "variable,name=x,op=floor",
            "y,if=variable.x=3",
            "z",
          ]),
        ),
      ),
    ).toBe("y");
  });

  it("the Devourer void_ray_count shape: metamorphosis proven down resets it to an exact 0", () => {
    const lines = [
      "variable,name=void_ray_count,op=reset,if=!buff.metamorphosis.up",
      `variable,name=void_ray_count,op=add,value=1,if=buff.metamorphosis.up&${UNDECIDED}`,
      "y,if=variable.void_ray_count=0",
      "z",
    ];
    expect(
      selected(scan(one(lines), { ...BINDINGS, knownBuffs: [{ name: "metamorphosis", up: false }] })),
    ).toBe("y");
    // Metamorphosis up: no reset, and the add over the unknown incoming value is UNKNOWN.
    expect(scan(one(lines), { ...BINDINGS, knownBuffs: [{ name: "metamorphosis", up: true }] }).kind).toBe(
      "UNKNOWN",
    );
  });

  it("a combination over the unknown incoming value never selects confidently", () => {
    expect(scan(one(["variable,name=x,op=max,value=3", "y,if=variable.x>2", "z"])).kind).toBe("UNKNOWN");
    expect(scan(one(["variable,name=x,op=floor", "y,if=variable.x>=0", "z"])).kind).toBe("UNKNOWN");
  });

  it("the Vengeance ceil shape: UNKNOWN twice over — % does not parse, and nothing proves f unfolded", () => {
    expect(
      scan(one(["variable,name=f,value=7%2", "variable,name=f,op=ceil", "y,if=variable.f=4", "z"])).kind,
    ).toBe("UNKNOWN");
    // Even with the folding proof, the unparsed % keeps it UNKNOWN.
    expect(
      scan([
        ...one(["variable,name=f,value=7%2", "variable,name=f,op=ceil", "y,if=variable.f=4", "z"]),
        { listName: "other", actions: ["variable,name=f,op=add,value=0"] },
      ]).kind,
    ).toBe("UNKNOWN");
  });
});

describe("ONB-S2 in precombat", () => {
  it("a constant or talent-derived combination carries", () => {
    const carry = carryOf([
      {
        listName: "precombat",
        actions: [
          "variable,name=x,value=1",
          "variable,name=x,op=add,value=talent.foo*2",
          "variable,name=x,op=mul,value=3",
        ],
      },
      { listName: "default", actions: ["z"] },
    ]);
    // talent.foo unresolved: 1 + {0, 2} = {1, 3}, times 3.
    expect(carried(carry, "x")).toEqual(oneOfNumbers([3, 9], "STATE_NOT_ESTABLISHED"));
  });

  it("the Balance on_use_trinket shape: trinket.* does not parse, so the sum is UNKNOWN", () => {
    const carry = carryOf([
      {
        listName: "precombat",
        actions: [
          "variable,name=on_use_trinket,value=0",
          "variable,name=on_use_trinket,op=add,value=trinket.1.has_use_buff",
          "variable,name=on_use_trinket,op=add,value=(trinket.2.has_use_buff)*2",
        ],
      },
      { listName: "default", actions: ["z"] },
    ]);
    expect(carried(carry, "on_use_trinket")?.state).toBe("UNKNOWN_NUMBER");
  });

  it("a combination over the established default resolves from it", () => {
    const carry = carryOf([
      { listName: "precombat", actions: ["variable,name=x,op=add,value=2,default=5"] },
      { listName: "default", actions: ["z"] },
    ]);
    expect(carried(carry, "x")).toEqual(knownNumber(7));
  });
});

// ---------------------------------------------------------------------------
// The public authorities
// ---------------------------------------------------------------------------

describe("ONB-S2 on the pinned public authorities", () => {
  it("no public authority has a combining or cycling_variable line, so no public decision changes", () => {
    const combining = /(?:^|,)op=(?:add|sub|mul|div|pow|mod|min|max|floor|ceil)(?:,|$)/i;
    for (const artifact of [
      deathknightBloodArtifact,
      monkBrewmasterArtifact,
      paladinProtectionArtifact,
      paladinRetributionArtifact,
      rogueAssassinationArtifact,
    ]) {
      const loaded = loadAplAuthority(artifact);
      if (!loaded.ok) throw new Error(loaded.detail);
      for (const action of loaded.authority.actions) {
        if (action.entryKind !== "VARIABLE_ASSIGNMENT") continue;
        expect(action.actionToken, action.actionStringVerbatim).toBe("variable");
        expect(combining.test(action.actionStringVerbatim), action.actionStringVerbatim).toBe(false);
      }
    }
  });
});
