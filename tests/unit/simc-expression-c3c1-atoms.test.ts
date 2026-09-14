/**
 * The three atoms M5-C3c1 added, and the boundaries around them.
 *
 *     dot.<name>.ticking          TRUTH      enumerable, bindable
 *     cooldown.<name>.remains     MAGNITUDE  bindable, derived
 *     target.time_to_die          MAGNITUDE  PREDICTIVE, never bindable
 *
 * RECOGNITION IS NOT KNOWLEDGE, and most of this file is about that. Each atom
 * had to become parseable so the pinned `cds[0]` line could parse WHOLE — the
 * fail-closed parser refuses an expression containing any unsupported fragment,
 * so a single unrecognised identifier there would have blocked the milestone.
 *
 * Parsing them gives them no value. An unbound `dot.x.ticking` is enumerated,
 * not `false`. An unbound `cooldown.x.remains` is UNKNOWN_NUMBER, not `0` — and
 * zero is the dangerous one, because it reads as "ready now" to every
 * `remains<=` comparison in the pinned APL.
 */

import { describe, expect, it } from "vitest";

import { atomOf, collectAtomKeys } from "../../src/simc/expression/ast.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  boundedBelowNumber,
  evaluateSimcExpression,
  knownNumber,
  unknownNumber,
  type AtomBindings,
} from "../../src/simc/expression/evaluate.js";

const NO_STATE = unknownNumber("STATE_NOT_ESTABLISHED");

function bindings(overrides: Partial<AtomBindings> = {}): AtomBindings {
  return {
    comboPoints: NO_STATE,
    comboPointsDeficit: NO_STATE,
    energyPct: NO_STATE,
    // No action's own DoT is established here. An empty per-action map is the
    // M5-D1 shape of that, and an unkeyed `remains` resolves UNKNOWN_NUMBER.
    dotRemainsSecondsByAction: [],
    knownBuffs: [],
    ...overrides,
  };
}

function parse(source: string) {
  const parsed = parseSimcExpression(source);
  if (!parsed.ok) throw new Error(`expected ${source} to parse, got ${parsed.reason}: ${parsed.fragment}`);
  return parsed.ast;
}

function evaluate(source: string, overrides: Partial<AtomBindings> = {}) {
  return evaluateSimcExpression(parse(source), source, bindings(overrides));
}

describe("the new atoms parse with the right SHAPE", () => {
  it.each([
    ["dot.garrote.ticking", "dot.garrote.ticking", "BOOLEAN"],
    ["dot.rupture.ticking", "dot.rupture.ticking", "BOOLEAN"],
    ["cooldown.kingsbane.remains", "cooldown.kingsbane.remains", "NUMERIC"],
    ["cooldown.deathmark.remains", "cooldown.deathmark.remains", "NUMERIC"],
    ["buff.envenom.remains", "buff.envenom.remains", "NUMERIC"],
    ["target.time_to_die", "target.time_to_die", "NUMERIC"],
  ])("%s is %s / %s", (source, key, shape) => {
    const atom = atomOf(parse(source));
    expect(atom?.key).toBe(key);
    expect(atom?.shape).toBe(shape);
  });

  it("keys each DoT and cooldown by NAME, so two abilities stay independent", () => {
    const keys = collectAtomKeys(
      parse("dot.garrote.ticking&dot.rupture.ticking&cooldown.kingsbane.remains<=cooldown.deathmark.remains"),
    );
    expect(keys).toEqual([
      "dot.garrote.ticking",
      "dot.rupture.ticking",
      "cooldown.kingsbane.remains",
      "cooldown.deathmark.remains",
    ]);
  });

  it("correlates repeated occurrences of the same atom", () => {
    // One atom, referenced twice — the correlation contract that makes
    // `!x | x` provable.
    expect(collectAtomKeys(parse("dot.garrote.ticking|!dot.garrote.ticking"))).toEqual([
      "dot.garrote.ticking",
    ]);
  });
});

describe("one property does NOT open a namespace", () => {
  it.each([
    // `dot.` was opened by `.ticking` only.
    "dot.garrote.remains",
    "dot.garrote.pmultiplier",
    "dot.garrote.duration",
    "dot.garrote.up",
    // `cooldown.` was opened by `.remains` only.
    "cooldown.kingsbane.ready",
    "cooldown.kingsbane.duration",
    "cooldown.kingsbane.charges",
    // `target.` was opened by ONE exact identifier.
    "target.health.pct",
    "target.distance",
    // Degenerate forms.
    "dot..ticking",
    "cooldown..remains",
    "dot.ticking",
    "cooldown.remains",
  ])("still refuses %s", (source) => {
    expect(parseSimcExpression(source).ok, `${source} should be refused`).toBe(false);
  });

  it("refuses the whole expression when one conjunct is an unopened property", () => {
    const parsed = parseSimcExpression("dot.garrote.ticking&cooldown.kingsbane.ready");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("UNSUPPORTED_IDENTIFIER");
    expect(parsed.fragment).toBe("cooldown.kingsbane.ready");
  });
});

describe("an unbound dot.x.ticking is enumerated, never false", () => {
  it("stays UNRESOLVED with no binding", () => {
    const result = evaluate("dot.garrote.ticking");
    expect(result.outcome).toBe("UNRESOLVED");
    if (result.outcome !== "UNRESOLVED") return;
    expect(result.trace.atoms[0]?.binding).toBe("UNRESOLVED_BOOLEAN");
    // Two worlds, and they disagree — which is what "we do not know" looks like.
    expect(result.trace.worlds).toHaveLength(2);
  });

  it("is bindable in both directions when the state IS established", () => {
    const ticking = evaluate("dot.garrote.ticking", {
      knownDotsTicking: [{ name: "garrote", ticking: true }],
    });
    const notTicking = evaluate("dot.garrote.ticking", {
      knownDotsTicking: [{ name: "garrote", ticking: false }],
    });
    expect(ticking.outcome === "RESOLVED" && ticking.value).toBe(true);
    expect(notTicking.outcome === "RESOLVED" && notTicking.value).toBe(false);
  });

  it("binds by NAME, so one DoT does not answer for another", () => {
    const result = evaluate("dot.rupture.ticking", {
      knownDotsTicking: [{ name: "garrote", ticking: true }],
    });
    expect(result.outcome).toBe("UNRESOLVED");
  });
});

describe("an unbound cooldown.x.remains is UNKNOWN_NUMBER, never zero", () => {
  it("reports STATE_NOT_ESTABLISHED rather than a value", () => {
    const result = evaluate("cooldown.kingsbane.remains<=2");
    expect(result.outcome).toBe("UNRESOLVED");
    if (result.outcome !== "UNRESOLVED") return;
    const atom = result.trace.atoms.find((entry) => entry.key === "cooldown.kingsbane.remains");
    expect(atom?.binding).toBe("UNKNOWN_NUMBER");
    expect(atom?.value).toBeNull();
    // A model DOES exist; the remedy is evidence, not a new model.
    expect(atom?.unknownNumberReason).toBe("STATE_NOT_ESTABLISHED");
  });

  it("does NOT come out TRUE, which a zero would have made it", () => {
    // The single most dangerous default. `0 <= 2` is TRUE, so an absent cooldown
    // silently becoming zero would report the ability as ready.
    const result = evaluate("cooldown.kingsbane.remains<=2");
    expect(result.outcome).not.toBe("RESOLVED");
  });

  it("is never enumerated, because a magnitude has no two-valued world", () => {
    const result = evaluate("cooldown.kingsbane.remains<=2");
    if (result.outcome !== "UNRESOLVED") throw new Error("expected UNRESOLVED");
    expect(result.trace.worlds).toHaveLength(1);
    expect(result.trace.worlds[0]?.result).toBe("UNKNOWN_STATE");
  });

  it("binds an exact value by name", () => {
    const result = evaluate("cooldown.kingsbane.remains<=2", {
      knownCooldownRemainsSeconds: [{ name: "kingsbane", remainsSeconds: knownNumber(57.198) }],
    });
    expect(result.outcome).toBe("RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(false);
  });

  it("binds by NAME, so one cooldown does not answer for another", () => {
    // The reason the binding is a keyed list rather than one scalar: a
    // derivation about Kingsbane must not answer a question about Deathmark.
    const result = evaluate("cooldown.deathmark.remains<=2", {
      knownCooldownRemainsSeconds: [{ name: "kingsbane", remainsSeconds: knownNumber(57.198) }],
    });
    expect(result.outcome).toBe("UNRESOLVED");
  });

  it("resolves TRUE when the cooldown genuinely is short", () => {
    // The comparison is real arithmetic, not a rubber stamp.
    const result = evaluate("cooldown.kingsbane.remains<=2", {
      knownCooldownRemainsSeconds: [{ name: "kingsbane", remainsSeconds: knownNumber(1.5) }],
    });
    expect(result.outcome === "RESOLVED" && result.value).toBe(true);
  });
});

describe("target.time_to_die is predictive and unbindable", () => {
  it("has no binding field at all", () => {
    // Structural, matching `fight_remains`: if a field is ever added, this fails
    // and whoever adds it has to justify admitting hindsight.
    const surface: AtomBindings = bindings();
    expect(surface).not.toHaveProperty("targetTimeToDie");
    expect(surface).not.toHaveProperty("timeToDie");
  });

  it("resolves UNKNOWN with the predictive reason", () => {
    const result = evaluate("target.time_to_die>10");
    expect(result.outcome).toBe("UNRESOLVED");
    if (result.outcome !== "UNRESOLVED") return;
    const atom = result.trace.atoms[0];
    expect(atom?.binding).toBe("UNKNOWN_NUMBER");
    expect(atom?.unknownNumberReason).toBe("PREDICTIVE_NOT_PLAYER_KNOWABLE");
  });
});

describe("UNKNOWN & FALSE collapses to FALSE", () => {
  it("resolves the whole conjunction from one false operand", () => {
    // The Kleene rule the milestone rests on. Without it, C3c1 would have needed
    // DoT state, buff durations and predictive values as well.
    const result = evaluate("dot.garrote.ticking&cooldown.kingsbane.remains<=2", {
      knownCooldownRemainsSeconds: [{ name: "kingsbane", remainsSeconds: knownNumber(57.198) }],
    });
    expect(result.outcome).toBe("RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(false);
    expect(result.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
  });

  it("holds whichever side the false operand is on", () => {
    const result = evaluate("cooldown.kingsbane.remains<=2&dot.garrote.ticking", {
      knownCooldownRemainsSeconds: [{ name: "kingsbane", remainsSeconds: knownNumber(57.198) }],
    });
    expect(result.outcome === "RESOLVED" && result.value).toBe(false);
  });

  it("does NOT collapse an OR the same way", () => {
    // `FALSE | UNKNOWN` is UNKNOWN, not FALSE. The asymmetry is the point.
    const result = evaluate("cooldown.kingsbane.remains<=2|dot.garrote.ticking", {
      knownCooldownRemainsSeconds: [{ name: "kingsbane", remainsSeconds: knownNumber(57.198) }],
    });
    expect(result.outcome).toBe("UNRESOLVED");
  });
});

describe("the full pinned cds[0] Deathmark condition", () => {
  const CONDITION =
    "dot.garrote.ticking&dot.rupture.ticking&cooldown.kingsbane.remains<=2&buff.envenom.remains>2&" +
    "(target.time_to_die>10|fight_remains<20)";

  it("parses whole, with six distinct atoms", () => {
    expect(collectAtomKeys(parse(CONDITION))).toEqual([
      "dot.garrote.ticking",
      "dot.rupture.ticking",
      "cooldown.kingsbane.remains",
      "buff.envenom.remains",
      "target.time_to_die",
      "fight_remains",
    ]);
  });

  it("resolves FALSE from the cooldown alone", () => {
    const result = evaluate(CONDITION, {
      knownCooldownRemainsSeconds: [{ name: "kingsbane", remainsSeconds: knownNumber(57.198) }],
    });
    expect(result.outcome).toBe("RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(false);
    // Two unresolved booleans -> four worlds, all FALSE.
    expect(result.trace.worlds).toHaveLength(4);
    expect(result.trace.worlds.every((world) => world.result === "FALSE")).toBe(true);
  });

  it("stays UNRESOLVED without the cooldown, however the other atoms fall", () => {
    // The cooldown is doing all the work. Removing it must remove the answer.
    expect(evaluate(CONDITION).outcome).toBe("UNRESOLVED");
  });

  it("stays UNRESOLVED when the cooldown is short", () => {
    // With `remains<=2` TRUE, the verdict genuinely depends on the DoT and buff
    // state C3c1 does not model — and it says so rather than guessing.
    const result = evaluate(CONDITION, {
      knownCooldownRemainsSeconds: [{ name: "kingsbane", remainsSeconds: knownNumber(1) }],
    });
    expect(result.outcome).toBe("UNRESOLVED");
  });
});

describe("a BOUNDED magnitude decides only what the bound settles", () => {
  /**
   * M5-C3c1's correction pass added this state because a cast-anchored cooldown
   * is a proven LOWER BOUND, not a value: SimulationCraft starts a cooldown with
   * a sampled, non-negative lag delay (action.cpp:2350-2360).
   *
   * The rules below are the only ones that follow from a lower bound alone. This
   * is deliberately not an interval algebra.
   */
  const atLeast = (value: number) => ({
    knownCooldownRemainsSeconds: [
      { name: "kingsbane", remainsSeconds: boundedBelowNumber(value, "STATE_NOT_ESTABLISHED") },
    ],
  });

  it("proves remains<=2 FALSE when the bound clears the threshold", () => {
    // "at least 57.198" already exceeds 2, so no exact value could satisfy `<=2`.
    const result = evaluate("cooldown.kingsbane.remains<=2", atLeast(57.198));
    expect(result.outcome).toBe("RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(false);
  });

  it("leaves remains<=2 UNKNOWN when the bound does NOT clear the threshold", () => {
    // "at least 1" is consistent with 1 and with 90. The bound decides nothing,
    // and inventing an answer from it is exactly what must not happen.
    expect(evaluate("cooldown.kingsbane.remains<=2", atLeast(1)).outcome).toBe("UNRESOLVED");
  });

  it("leaves remains<=2 UNKNOWN at the boundary itself", () => {
    // "at least 2" permits exactly 2, which satisfies `<=2`, and permits 50,
    // which does not. Strictly greater is required.
    expect(evaluate("cooldown.kingsbane.remains<=2", atLeast(2)).outcome).toBe("UNRESOLVED");
  });

  it("proves remains>2 TRUE when the bound clears the threshold", () => {
    const result = evaluate("cooldown.kingsbane.remains>2", atLeast(57.198));
    expect(result.outcome === "RESOLVED" && result.value).toBe(true);
  });

  it("never reports the bound as an exact value in the trace", () => {
    // THE rule this state exists for. `value` stays null; the bound lives in
    // `atLeast`, so a reader cannot take a proven minimum for the magnitude.
    const result = evaluate("cooldown.kingsbane.remains<=2", atLeast(57.198));
    if (result.outcome !== "RESOLVED") throw new Error("expected RESOLVED");
    const atom = result.trace.atoms.find((entry) => entry.key === "cooldown.kingsbane.remains");
    expect(atom?.binding).toBe("BOUNDED");
    expect(atom?.value).toBeNull();
    expect(atom?.atLeast).toBe(57.198);
  });

  it("refuses ARITHMETIC on a bound rather than propagating it", () => {
    // `L + k` would be a valid lower bound and `L * k` would not be for negative
    // `k`. Propagating bounds through arithmetic needs sign reasoning this
    // evaluator does not do, and no pinned expression requires it.
    expect(evaluate("cooldown.kingsbane.remains+1<=2", atLeast(57.198)).outcome).toBe("UNRESOLVED");
  });

  it("refuses to read a bound as a bare truth", () => {
    // SimulationCraft's zero-is-false coercion applies to a VALUE. "At least
    // 57.198, therefore non-zero, therefore TRUE" is not a deduction this makes.
    expect(evaluate("cooldown.kingsbane.remains", atLeast(57.198)).outcome).toBe("UNRESOLVED");
  });

  it("still collapses the whole Deathmark AND from the bounded operand", () => {
    const CONDITION =
      "dot.garrote.ticking&dot.rupture.ticking&cooldown.kingsbane.remains<=2&buff.envenom.remains>2&" +
      "(target.time_to_die>10|fight_remains<20)";
    const result = evaluate(CONDITION, atLeast(57.198));
    expect(result.outcome).toBe("RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(false);
    expect(result.trace.worlds.every((world) => world.result === "FALSE")).toBe(true);
  });

  it("keeps EXACT bindings comparing exactly as before", () => {
    // M5-B's exact resource semantics are untouched by the new state.
    const exact = {
      knownCooldownRemainsSeconds: [{ name: "kingsbane", remainsSeconds: knownNumber(1.5) }],
    };
    const result = evaluate("cooldown.kingsbane.remains<=2", exact);
    expect(result.outcome === "RESOLVED" && result.value).toBe(true);
    const atom =
      result.outcome === "RESOLVED"
        ? result.trace.atoms.find((entry) => entry.key === "cooldown.kingsbane.remains")
        : undefined;
    expect(atom?.binding).toBe("KNOWN");
    expect(atom?.value).toBe(1.5);
    expect(atom?.atLeast).toBeNull();
  });
});
