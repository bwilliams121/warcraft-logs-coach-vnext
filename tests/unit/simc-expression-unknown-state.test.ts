import { describe, expect, it } from "vitest";

import { collectAtoms } from "../../src/simc/expression/ast.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  evaluateSimcExpression,
  knownNumber,
  unknownNumber,
  type AtomBindings,
  type TruthValue,
} from "../../src/simc/expression/evaluate.js";

/**
 * UNKNOWN NUMBERS, AND THE THREE-VALUED LOGIC THEY PRODUCE.
 *
 * This file owns the half of the evaluator contract that
 * `simc-expression-evaluate.test.ts` does not: what happens when a MAGNITUDE is
 * unavailable rather than a truth-shaped fact.
 *
 * The one failure everything here guards against: enumerating a magnitude over
 * {0, 1}. `buff.envenom.remains<=1` has a definite answer under both of those
 * assignments, so an evaluator that enumerated it would report a confident
 * result computed from two durations nobody observed. Magnitudes therefore
 * become UNKNOWN_NUMBER, comparisons touching them become UNKNOWN_STATE, and
 * neither ever contributes a world.
 */

const NO_ENERGY = unknownNumber("STATE_NOT_ESTABLISHED");

function evaluate(expression: string, bindings?: Partial<AtomBindings>) {
  const parsed = parseSimcExpression(expression);
  if (!parsed.ok) throw new Error(`expected ${expression} to parse, got ${parsed.reason}`);
  return evaluateSimcExpression(parsed.ast, expression, {
    comboPoints: 7,
    comboPointsDeficit: 0,
    energyPct: NO_ENERGY,
    knownBuffs: [],
    ...bindings,
  });
}

/** The single world's truth value, for expressions with no boolean atoms. */
function soleWorld(expression: string, bindings?: Partial<AtomBindings>): TruthValue {
  const result = evaluate(expression, bindings);
  if (result.outcome === "UNSUPPORTED") throw new Error("expected an evaluation, not a refusal");
  expect(result.trace.worlds).toHaveLength(1);
  const world = result.trace.worlds[0];
  if (world === undefined) throw new Error("expected one world");
  return world.result;
}

describe("a comparison touching an unknown magnitude is UNKNOWN_STATE", () => {
  it.each([
    ["fight_remains<15", "fight_remains"],
    ["fight_remains>15", "fight_remains"],
    ["buff.envenom.remains<=1", "buff.envenom.remains"],
    ["buff.deathmark.remains>=3", "buff.deathmark.remains"],
    ["energy.pct>70", "energy.pct"],
  ])("%s is undecided while %s is unknown", (expression) => {
    expect(soleWorld(expression)).toBe("UNKNOWN_STATE");
  });

  it("is undecided with the unknown on either side of the operator", () => {
    // A comparison is not symmetric, but its UNKNOWN handling must be: an
    // implementation that only checked the left operand would pass one of these
    // and silently decide the other.
    expect(soleWorld("fight_remains<15")).toBe("UNKNOWN_STATE");
    expect(soleWorld("15<fight_remains")).toBe("UNKNOWN_STATE");
  });

  it("decides normally once the magnitude IS supplied", () => {
    expect(soleWorld("energy.pct>70", { energyPct: knownNumber(93.2) })).toBe("TRUE");
    expect(soleWorld("energy.pct>70", { energyPct: knownNumber(58.8) })).toBe("FALSE");
    // Exactly at the threshold. `>` is strict, and must stay strict.
    expect(soleWorld("energy.pct>70", { energyPct: knownNumber(70) })).toBe("FALSE");
  });
});

describe("Kleene OR, in both operand orders", () => {
  it("TRUE | UNKNOWN_STATE is TRUE", () => {
    // The identity M5-B's first exact result depends on: at 100% energy the
    // fight's remaining duration cannot change the answer, so not knowing it
    // costs nothing.
    expect(soleWorld("energy.pct>70|fight_remains<15", { energyPct: knownNumber(100) })).toBe("TRUE");
  });

  it("UNKNOWN_STATE | TRUE is TRUE", () => {
    expect(soleWorld("fight_remains<15|energy.pct>70", { energyPct: knownNumber(100) })).toBe("TRUE");
  });

  it("FALSE | UNKNOWN_STATE is UNKNOWN_STATE, in both orders", () => {
    // Not FALSE. The unknown side could still be true, and collapsing it would
    // be the short-circuit that manufactures confident answers.
    expect(soleWorld("energy.pct>70|fight_remains<15", { energyPct: knownNumber(58.8) })).toBe(
      "UNKNOWN_STATE",
    );
    expect(soleWorld("fight_remains<15|energy.pct>70", { energyPct: knownNumber(58.8) })).toBe(
      "UNKNOWN_STATE",
    );
  });
});

describe("Kleene AND, in both operand orders", () => {
  it("FALSE & UNKNOWN_STATE is FALSE, in both orders", () => {
    expect(soleWorld("energy.pct>70&fight_remains<15", { energyPct: knownNumber(58.8) })).toBe("FALSE");
    expect(soleWorld("fight_remains<15&energy.pct>70", { energyPct: knownNumber(58.8) })).toBe("FALSE");
  });

  it("TRUE & UNKNOWN_STATE is UNKNOWN_STATE, in both orders", () => {
    expect(soleWorld("energy.pct>70&fight_remains<15", { energyPct: knownNumber(100) })).toBe(
      "UNKNOWN_STATE",
    );
    expect(soleWorld("fight_remains<15&energy.pct>70", { energyPct: knownNumber(100) })).toBe(
      "UNKNOWN_STATE",
    );
  });
});

describe("negation of an unknown stays unknown", () => {
  it("!UNKNOWN_STATE is UNKNOWN_STATE", () => {
    expect(soleWorld("!fight_remains")).toBe("UNKNOWN_STATE");
    expect(soleWorld("!(fight_remains<15)")).toBe("UNKNOWN_STATE");
  });

  it("does not turn an unknown into a decided negation", () => {
    // `!x` where x is unknown is NOT true. The naive reading — "we did not
    // establish it, so it is not the case" — is the missing-data-becomes-false
    // failure in miniature.
    expect(soleWorld("!fight_remains")).not.toBe("TRUE");
    expect(soleWorld("!fight_remains")).not.toBe("FALSE");
  });
});

describe("an unknown magnitude is NEVER enumerated", () => {
  it("adds no world of its own", () => {
    // Two magnitudes unknown, zero boolean atoms: exactly one world.
    const result = evaluate("fight_remains<15|buff.envenom.remains<=1");
    if (result.outcome === "UNSUPPORTED") throw new Error("expected an evaluation");
    expect(result.trace.worlds).toHaveLength(1);
    expect(result.outcome).toBe("UNRESOLVED");
  });

  it("binds as UNKNOWN_NUMBER, never as an unresolved boolean", () => {
    const result = evaluate("buff.envenom.remains<=1");
    if (result.outcome === "UNSUPPORTED") throw new Error("expected an evaluation");
    const atom = result.trace.atoms.find((entry) => entry.key === "buff.envenom.remains");
    expect(atom?.binding).toBe("UNKNOWN_NUMBER");
    expect(atom?.shape).toBe("NUMERIC");
    expect(atom?.value).toBeNull();
    expect(result.trace.atoms.filter((entry) => entry.binding === "UNRESOLVED_BOOLEAN")).toEqual([]);
  });

  it("does not let a magnitude decide a comparison it cannot decide", () => {
    // THE MUTATION: enumerate `buff.envenom.remains` over {0, 1} like a boolean.
    // Under 0 the condition is TRUE; under 1 it is also TRUE; the worlds would
    // agree, and the evaluator would report a confident TRUE from two invented
    // durations. The real answer is that we do not know.
    const mutatedWorlds = [0, 1].map((value) => value <= 1);
    expect(new Set(mutatedWorlds).size).toBe(1);
    expect(mutatedWorlds[0]).toBe(true);

    const honest = evaluate("buff.envenom.remains<=1");
    expect(honest.outcome).toBe("UNRESOLVED");
  });

  it("leaves the boolean world count untouched when both kinds are present", () => {
    // One boolean atom, one unknown magnitude: two worlds, not four.
    const result = evaluate("buff.deathmark.up|buff.envenom.remains<=1");
    if (result.outcome === "UNSUPPORTED") throw new Error("expected an evaluation");
    expect(result.trace.worlds).toHaveLength(2);
    expect(result.trace.atoms.filter((entry) => entry.binding === "UNRESOLVED_BOOLEAN")).toHaveLength(1);
    expect(result.trace.atoms.filter((entry) => entry.binding === "UNKNOWN_NUMBER")).toHaveLength(1);
  });

  it("resolves the real spend[0] line to worlds that disagree, not to a value", () => {
    // `buff.envenom.remains<=1|buff.deathmark.up`: the magnitude is unknown, so
    // the DN-false world is UNKNOWN_STATE and the DN-true world is TRUE. Mixed,
    // therefore unresolved — and the rule says which mixture it was.
    const result = evaluate("buff.envenom.remains<=1|buff.deathmark.up");
    if (result.outcome === "UNSUPPORTED") throw new Error("expected an evaluation");
    expect(result.outcome).toBe("UNRESOLVED");
    expect(result.trace.worlds.map((world) => world.result)).toEqual(["UNKNOWN_STATE", "TRUE"]);
    expect(result.trace.aggregateRule).toBe("WORLDS_MIXED_WITH_UNKNOWN_STATE");
  });
});

describe("fight_remains is predictive, and has no binding path at all", () => {
  it("reports why it is unknown, and the reason is not an evidence gap", () => {
    const result = evaluate("fight_remains<15");
    if (result.outcome === "UNSUPPORTED") throw new Error("expected an evaluation");
    const atom = result.trace.atoms.find((entry) => entry.key === "fight_remains");
    expect(atom?.unknownNumberReason).toBe("PREDICTIVE_NOT_PLAYER_KNOWABLE");
  });

  it("cannot be supplied through the bindings, structurally", () => {
    // There is no `fightRemains` field to set. If one is ever added, this test
    // fails and the person adding it has to justify admitting hindsight into a
    // judgment about a decision the player made earlier.
    const bindings: AtomBindings = {
      comboPoints: 7,
      comboPointsDeficit: 0,
      energyPct: NO_ENERGY,
      knownBuffs: [],
    };
    expect(Object.keys(bindings).sort()).toEqual([
      "comboPoints",
      "comboPointsDeficit",
      "energyPct",
      "knownBuffs",
    ]);
    expect(bindings).not.toHaveProperty("fightRemains");
    expect(bindings).not.toHaveProperty("observedFightEndDelta");
  });

  it("stays unknown even when every other atom is supplied", () => {
    expect(
      soleWorld("fight_remains<15", {
        energyPct: knownNumber(100),
        knownBuffs: [{ name: "deathmark", up: true }],
      }),
    ).toBe("UNKNOWN_STATE");
  });
});

describe("atom shape is declared by syntax, not by what happened to be bound", () => {
  it.each([
    ["combo_points", "NUMERIC"],
    ["combo_points.deficit", "NUMERIC"],
    ["energy.pct", "NUMERIC"],
    ["fight_remains", "NUMERIC"],
    ["buff.envenom.remains", "NUMERIC"],
    ["buff.envenom.up", "BOOLEAN"],
  ])("classifies %s as %s", (source, shape) => {
    const parsed = parseSimcExpression(source);
    if (!parsed.ok) throw new Error(`expected ${source} to parse`);
    expect(collectAtoms(parsed.ast)).toEqual([{ key: source, shape }]);
  });

  it("keeps .up and .remains on the same aura as separate atoms", () => {
    const parsed = parseSimcExpression("buff.envenom.up|buff.envenom.remains<=1");
    if (!parsed.ok) throw new Error("expected the expression to parse");
    expect(collectAtoms(parsed.ast)).toEqual([
      { key: "buff.envenom.up", shape: "BOOLEAN" },
      { key: "buff.envenom.remains", shape: "NUMERIC" },
    ]);

    // And the boolean one alone is enumerated.
    const result = evaluateSimcExpression(parsed.ast, "buff.envenom.up|buff.envenom.remains<=1", {
      comboPoints: 7,
      comboPointsDeficit: 0,
      energyPct: NO_ENERGY,
      knownBuffs: [],
    });
    if (result.outcome === "UNSUPPORTED") throw new Error("expected an evaluation");
    expect(result.trace.worlds).toHaveLength(2);
  });
});

describe("unsupported syntax never enters the truth domain", () => {
  it.each([
    "talent.darkest_night",
    "target.time_to_die<12",
    "spell_targets.fan_of_knives>=4",
    "dot.rupture.ticking",
    "variable.single_target",
    "buff.darkest_night.stack>=2",
    "energy.regen_combined>40",
    "combo_points>?5",
    "combo_points<?5",
    "combo_points!=5",
    "combo_points>=5-2",
    "combo_points>=5.5",
  ])("%s produces no AST, so it cannot become UNKNOWN_STATE", (source) => {
    const parsed = parseSimcExpression(source);
    expect(parsed.ok, `${source} must be refused`).toBe(false);
    if (parsed.ok) return;
    // No `ast` field exists on a failure. There is nothing to evaluate, so
    // there is no path by which an unparsed fragment reaches a world.
    expect(parsed).not.toHaveProperty("ast");
  });

  it("keeps the two reasons for not knowing structurally distinct", () => {
    // Supported syntax with missing state: evaluated, with a trace and an atom.
    const supported = evaluate("fight_remains<15");
    if (supported.outcome === "UNSUPPORTED") throw new Error("expected an evaluation");
    expect(supported.outcome).toBe("UNRESOLVED");
    expect(supported.trace.atoms).toHaveLength(1);

    // Unsupported syntax: no evaluation happens at all.
    const refused = parseSimcExpression("talent.darkest_night");
    expect(refused.ok).toBe(false);
  });
});
