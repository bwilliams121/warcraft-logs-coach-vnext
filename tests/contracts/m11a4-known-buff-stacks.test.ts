/**
 * M11-A4: the shared evaluator's EXACT-KNOWN `buff.<x>.stack` binding seam.
 *
 * WHAT WAS ADDED, AND WHAT WAS NOT
 *
 * `AtomBindings.knownBuffStacks` lets a caller state a stack count it has
 * PROVEN exactly. The evaluator reads it through the same lookup shape as
 * `knownCooldownRemainsSeconds` and compares it with the existing
 * `compareWithBounds` semantics. Nothing else moved: an unbound stack atom is
 * still UNKNOWN_NUMBER (never zero), no count is inferred from any other
 * binding, no arithmetic or enumeration rule changed, and the parser's
 * built-in surface is untouched (`m11a-parser-builtins-frozen` still pins it).
 *
 * WHY THE FIRST CONSUMER BINDS ONLY ZERO
 *
 * The pinned Retribution line `blade_of_justice,if=(buff.art_of_war.stack=2|
 * buff.righteous_cause.stack=2)&…` was UNKNOWN for every decision because
 * neither stack could be bound. An aura M4 proves INACTIVE holds zero stacks;
 * an aura whose producing talent the pinned build proves absent holds zero
 * stacks. Those two proofs are what the Retribution tree emits; positive
 * counts are out of scope and this test pins that an absent binding never
 * becomes one.
 */

import { describe, expect, it } from "vitest";

import {
  evaluateSimcExpression,
  unknownNumber,
  type AtomBindings,
} from "../../src/simc/expression/evaluate.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";

const BASE: AtomBindings = {
  comboPoints: unknownNumber("STATE_NOT_MODELLED"),
  comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
  energyPct: unknownNumber("STATE_NOT_MODELLED"),
  knownBuffs: [],
};

function evaluate(expression: string, bindings: AtomBindings) {
  const parsed = parseSimcExpression(expression);
  if (!parsed.ok) throw new Error(`did not parse: ${expression}`);
  const result = evaluateSimcExpression(parsed.ast, expression, bindings);
  if (result.outcome === "UNSUPPORTED") throw new Error(`${expression} was refused: ${result.reason}`);
  return result;
}

function truthOf(expression: string, bindings: AtomBindings): "TRUE" | "FALSE" | "UNKNOWN_STATE" {
  const result = evaluate(expression, bindings);
  if (result.outcome === "UNRESOLVED") return "UNKNOWN_STATE";
  return result.value ? "TRUE" : "FALSE";
}

describe("unbound: exactly what it was before", () => {
  it("buff.foo.stack with no binding is UNKNOWN_NUMBER, never zero", () => {
    expect(truthOf("buff.foo.stack=2", BASE)).toBe("UNKNOWN_STATE");
    expect(truthOf("buff.foo.stack=0", BASE)).toBe("UNKNOWN_STATE");
    expect(truthOf("buff.foo.stack>=1", BASE)).toBe("UNKNOWN_STATE");
    const atom = evaluate("buff.foo.stack=2", BASE).trace.atoms.find(
      (entry) => entry.key === "buff.foo.stack",
    );
    expect(atom?.binding).toBe("UNKNOWN_NUMBER");
    expect(atom?.value).toBeNull();
  });

  it("an empty list binds nothing, and a binding for ANOTHER aura binds nothing for this one", () => {
    expect(truthOf("buff.foo.stack=2", { ...BASE, knownBuffStacks: [] })).toBe("UNKNOWN_STATE");
    expect(truthOf("buff.foo.stack=2", { ...BASE, knownBuffStacks: [{ name: "bar", stack: 0 }] })).toBe(
      "UNKNOWN_STATE",
    );
  });

  it("a known buff PRESENCE does not become a stack count in either direction", () => {
    // `knownBuffs` says up/down; it says nothing about how many stacks. The
    // seam is a separate field so that a down aura is not silently read as
    // zero stacks by the evaluator — the SPECIALIZATION makes that claim,
    // with its own proof, by binding the stack field explicitly.
    const down: AtomBindings = { ...BASE, knownBuffs: [{ name: "foo", up: false }] };
    const up: AtomBindings = { ...BASE, knownBuffs: [{ name: "foo", up: true }] };
    expect(truthOf("buff.foo.stack=2", down)).toBe("UNKNOWN_STATE");
    expect(truthOf("buff.foo.stack=0", down)).toBe("UNKNOWN_STATE");
    expect(truthOf("buff.foo.stack>=1", up)).toBe("UNKNOWN_STATE");
  });
});

describe("bound to exact zero", () => {
  const zero: AtomBindings = { ...BASE, knownBuffStacks: [{ name: "foo", stack: 0 }] };

  it("evaluates comparisons against the exact value with the existing semantics", () => {
    expect(truthOf("buff.foo.stack=2", zero)).toBe("FALSE");
    expect(truthOf("buff.foo.stack=0", zero)).toBe("TRUE");
    expect(truthOf("buff.foo.stack>=1", zero)).toBe("FALSE");
    expect(truthOf("buff.foo.stack<1", zero)).toBe("TRUE");
    expect(truthOf("buff.foo.stack>=0", zero)).toBe("TRUE");
  });

  it("carries the bound value in the trace as KNOWN", () => {
    const atom = evaluate("buff.foo.stack=2", zero).trace.atoms.find(
      (entry) => entry.key === "buff.foo.stack",
    );
    expect(atom?.binding).toBe("KNOWN");
    expect(atom?.value).toBe(0);
    expect(atom?.atLeast).toBeNull();
  });

  it("composes through the existing Kleene rules: a FALSE disjunct does not decide an UNKNOWN sibling", () => {
    // Only foo is bound. The disjunction stays UNKNOWN because bar is unknown,
    // and the conjunction with a bound TRUE talent stays UNKNOWN too.
    const talents: AtomBindings = { ...zero, knownTalents: [{ name: "x", taken: true }] };
    expect(truthOf("buff.foo.stack=2|buff.bar.stack=2", talents)).toBe("UNKNOWN_STATE");
    expect(truthOf("(buff.foo.stack=2|buff.bar.stack=2)&talent.x", talents)).toBe("UNKNOWN_STATE");
  });

  it("composes through the existing Kleene rules: both disjuncts bound zero makes the disjunction FALSE", () => {
    const both: AtomBindings = {
      ...BASE,
      knownBuffStacks: [
        { name: "foo", stack: 0 },
        { name: "bar", stack: 0 },
      ],
      knownTalents: [{ name: "x", taken: true }],
      knownBuffs: [{ name: "wings", up: false }],
    };
    // The exact shape of the pinned Retribution Blade of Justice gate, with
    // neutral names: FALSE & (anything) is FALSE without reading the rest.
    expect(truthOf("(buff.foo.stack=2|buff.bar.stack=2)&(!talent.x|!buff.wings.up)", both)).toBe("FALSE");
    expect(truthOf("buff.foo.stack=2|buff.bar.stack=2", both)).toBe("FALSE");
  });

  it("does not enumerate a magnitude: one world whether bound or not", () => {
    expect(evaluate("buff.foo.stack=2", zero).trace.worlds).toHaveLength(1);
    expect(evaluate("buff.foo.stack=2", BASE).trace.worlds).toHaveLength(1);
  });
});

describe("no positive value is invented", () => {
  it("a stack atom never resolves to a number unless that exact number was bound", () => {
    for (const expression of ["buff.foo.stack=1", "buff.foo.stack=2", "buff.foo.stack>0"]) {
      const result = evaluate(expression, BASE);
      expect(result.outcome).toBe("UNRESOLVED");
      const atom = result.trace.atoms.find((entry) => entry.key === "buff.foo.stack");
      expect(atom?.value).toBeNull();
      expect(atom?.atLeast).toBeNull();
    }
  });

  it("a bound positive value, if a caller ever supplies one, is read as exactly that value and nothing else", () => {
    // The seam is generic; the Retribution consumer binds only zero. This pins
    // that the evaluator neither rounds, clamps nor coerces.
    const three: AtomBindings = { ...BASE, knownBuffStacks: [{ name: "foo", stack: 3 }] };
    expect(truthOf("buff.foo.stack=3", three)).toBe("TRUE");
    expect(truthOf("buff.foo.stack=2", three)).toBe("FALSE");
    expect(truthOf("buff.foo.stack>=2", three)).toBe("TRUE");
  });
});
