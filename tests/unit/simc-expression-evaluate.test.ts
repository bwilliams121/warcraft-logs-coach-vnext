import { describe, expect, it } from "vitest";

import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  MAX_UNRESOLVED_ATOMS,
  evaluateSimcExpression,
  unknownNumber,
  type AtomBindings,
} from "../../src/simc/expression/evaluate.js";

/**
 * World enumeration over correlated unresolved BOOLEAN atoms.
 *
 * The contract in one line: every occurrence of one boolean atom takes the SAME
 * value within a world, and a value is only reported when every world agrees.
 *
 * Enumeration applies to boolean atoms only. An unavailable MAGNITUDE is
 * UNKNOWN_NUMBER and is never enumerated — see
 * `simc-expression-unknown-state.test.ts`, which owns that half of the
 * contract. Everything in this file uses conditions with no magnitude gaps, so
 * every world here reaches a definite TRUE or FALSE and the aggregate is
 * decided by whether the worlds agree.
 */

const GATE = "!buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0";

function evaluate(expression: string, bindings: AtomBindings) {
  const parsed = parseSimcExpression(expression);
  if (!parsed.ok) throw new Error(`expected ${expression} to parse`);
  return evaluateSimcExpression(parsed.ast, expression, bindings);
}

/** Energy is irrelevant to every condition here, and says so explicitly. */
const NO_ENERGY = unknownNumber("STATE_NOT_ESTABLISHED");
/** So is DoT remaining duration. Same discipline: stated, not omitted. */
const NO_DOT = unknownNumber("STATE_NOT_ESTABLISHED");

function gate(comboPoints: number, max: number) {
  return evaluate(GATE, {
    comboPoints,
    comboPointsDeficit: max - comboPoints,
    energyPct: NO_ENERGY,
    dotRemainsSeconds: NO_DOT,
    knownBuffs: [],
  });
}

describe("the pinned gate across real combo-point states", () => {
  it.each([
    [0, 7, "RESOLVED", false],
    [3, 7, "RESOLVED", false],
    [4, 7, "RESOLVED", false],
    [5, 7, "UNRESOLVED", null],
    [6, 7, "UNRESOLVED", null],
    [7, 7, "RESOLVED", true],
    [5, 5, "RESOLVED", true],
  ])("at %i of %i is %s", (comboPoints, max, outcome, value) => {
    const result = gate(comboPoints, max);
    expect(result.outcome).toBe(outcome);
    if (result.outcome === "RESOLVED") expect(result.value).toBe(value);
  });

  it("proves FALSE below 5 because both disjuncts fail on the numbers alone", () => {
    const result = gate(3, 7);
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(false);
    expect(result.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
    expect(result.trace.worlds.map((world) => world.result)).toEqual(["FALSE", "FALSE"]);
  });

  it("proves TRUE at full resource because the gate is a tautology in the atom", () => {
    // At cp == max both comparisons hold, so the gate reduces to `!A | A`.
    // Correlation is what makes that provable; two independent unknowns could
    // not establish it.
    const result = gate(7, 7);
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(true);
    expect(result.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
  });

  it("declines between 5 and max, where the atom genuinely decides", () => {
    const result = gate(6, 7);
    if (result.outcome !== "UNRESOLVED") return;
    expect(result.trace.aggregateRule).toBe("WORLDS_DISAGREE");
    const byAssignment = result.trace.worlds.map((world) => ({
      up: world.assignment[0]?.up,
      result: world.result,
    }));
    expect(byAssignment).toEqual([
      { up: false, result: "TRUE" },
      { up: true, result: "FALSE" },
    ]);
  });
});

describe("atom correlation", () => {
  it("binds every occurrence of one atom together", () => {
    const result = gate(7, 7);
    if (result.outcome !== "RESOLVED") return;
    const unresolved = result.trace.atoms.filter((atom) => atom.binding === "UNRESOLVED_BOOLEAN");
    expect(unresolved).toHaveLength(1);
    expect(result.trace.worlds).toHaveLength(2);
  });

  it("enumerates 2^k worlds for k distinct atoms", () => {
    const result = evaluate("buff.a.up&buff.b.up|buff.c.up", {
      comboPoints: 0,
      comboPointsDeficit: 0,
      energyPct: NO_ENERGY,
      dotRemainsSeconds: NO_DOT,
      knownBuffs: [],
    });
    if (result.outcome !== "UNRESOLVED") return;
    expect(result.trace.worlds).toHaveLength(8);
  });

  it("stops enumerating past the supported limit rather than growing", () => {
    const expression = "buff.a.up|buff.b.up|buff.c.up|buff.d.up|buff.e.up";
    const result = evaluate(expression, {
      comboPoints: 0,
      comboPointsDeficit: 0,
      energyPct: NO_ENERGY,
      dotRemainsSeconds: NO_DOT,
      knownBuffs: [],
    });
    expect(result.outcome).toBe("UNSUPPORTED");
    if (result.outcome !== "UNSUPPORTED") return;
    expect(result.reason).toBe("TOO_MANY_UNRESOLVED_ATOMS");
    expect(result.unresolvedAtomCount).toBe(5);
    expect(MAX_UNRESOLVED_ATOMS).toBe(4);
  });

  it("treats a known buff as known, with no world to enumerate", () => {
    const result = evaluate(GATE, {
      comboPoints: 6,
      comboPointsDeficit: 1,
      energyPct: NO_ENERGY,
      dotRemainsSeconds: NO_DOT,
      knownBuffs: [{ name: "darkest_night", up: false }],
    });
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(true);
    expect(result.trace.aggregateRule).toBe("NO_UNRESOLVED_ATOMS");
    expect(result.trace.worlds).toHaveLength(1);
    expect(result.trace.atoms.find((a) => a.key === "buff.darkest_night.up")?.binding).toBe("KNOWN");
  });
});

describe("SimulationCraft numeric semantics", () => {
  it.each([
    ["combo_points", 3, true],
    ["combo_points", 0, false],
    ["!combo_points", 0, true],
    ["!combo_points", 3, false],
  ])("%s with combo_points=%i is %s", (expression, comboPoints, expected) => {
    const result = evaluate(expression, {
      comboPoints,
      comboPointsDeficit: 0,
      energyPct: NO_ENERGY,
      dotRemainsSeconds: NO_DOT,
      knownBuffs: [],
    });
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(expected);
  });

  it.each([
    ["combo_points>=5", 5, true],
    ["combo_points>=5", 4, false],
    ["combo_points<5", 4, true],
    ["combo_points<5", 5, false],
    ["combo_points=5", 5, true],
    ["combo_points=5", 6, false],
  ])("%s with combo_points=%i is %s", (expression, comboPoints, expected) => {
    const result = evaluate(expression, {
      comboPoints,
      comboPointsDeficit: 0,
      energyPct: NO_ENERGY,
      dotRemainsSeconds: NO_DOT,
      knownBuffs: [],
    });
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(expected);
  });
});

describe("the trace is JSON-safe and self-describing", () => {
  it("round-trips through JSON unchanged", () => {
    const result = gate(3, 7);
    if (result.outcome !== "RESOLVED") return;
    expect(JSON.parse(JSON.stringify(result.trace))).toEqual(result.trace);
  });

  it("exposes no Map anywhere", () => {
    const result = gate(3, 7);
    if (result.outcome !== "RESOLVED") return;
    const walk = (value: unknown): void => {
      expect(value).not.toBeInstanceOf(Map);
      expect(value).not.toBeInstanceOf(Set);
      if (Array.isArray(value)) value.forEach(walk);
      else if (typeof value === "object" && value !== null) Object.values(value).forEach(walk);
    };
    walk(result.trace);
  });

  it("records the raw expression and every atom's binding", () => {
    const result = gate(3, 7);
    if (result.outcome !== "RESOLVED") return;
    expect(result.trace.expressionRaw).toBe(GATE);
    expect(result.trace.atoms).toEqual([
      {
        key: "buff.darkest_night.up",
        shape: "BOOLEAN",
        binding: "UNRESOLVED_BOOLEAN",
        value: null,
        unknownNumberReason: null,
      },
      { key: "combo_points", shape: "NUMERIC", binding: "KNOWN", value: 3, unknownNumberReason: null },
      {
        key: "combo_points.deficit",
        shape: "NUMERIC",
        binding: "KNOWN",
        value: 4,
        unknownNumberReason: null,
      },
    ]);
  });
});
