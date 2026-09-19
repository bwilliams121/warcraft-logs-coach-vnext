/**
 * M11-B3: decimal numeric literals — the one syntax limitation the Blood
 * measurement (M11-B2) showed to be unjustified, removed and nothing more.
 *
 * WHAT IS PINNED HERE
 *
 * The literal grammar is digits '.' digits, exactly the form the pinned
 * SimulationCraft lexer reads and the pinned lists write (`1.5`, `0.5`); a
 * decimal is the same `NUMBER` node an integer is, at its exact `number`
 * value, compared by the ordinary comparison rule. Every other decimal shape
 * fails closed under the parser's EXISTING reasons — no new reason, no new
 * node kind, no new operator, no built-in identifier, no vocabulary seam
 * change. The parser-freeze contract (`m11a-parser-builtins-frozen`) is
 * unchanged in what it pins and gains a literal-grammar pin.
 *
 * Negative first: a literal that is not digits '.' digits is refused WHOLE,
 * never truncated to its integer prefix, never read as two tokens that
 * happen to parse.
 */

import { describe, expect, it } from "vitest";

import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  boundedBelowNumber,
  evaluateSimcExpression,
  knownNumber,
  unknownNumber,
  type AtomBindings,
} from "../../src/simc/expression/evaluate.js";
import { pinnedBloodDeathKnightAuthority } from "../../src/specs/deathknight/blood/pinned-authority.js";
import { BLOOD_ATOM_VOCABULARY } from "../../src/specs/deathknight/blood/vocabulary.js";

const NOT_MODELLED = unknownNumber("STATE_NOT_MODELLED");

/** Bindings with one cooldown remainder, the shape every pinned `<x>.remains < C` line takes. */
function withRemains(
  binding: ReturnType<typeof knownNumber> | ReturnType<typeof boundedBelowNumber>,
): AtomBindings {
  return {
    comboPoints: NOT_MODELLED,
    comboPointsDeficit: NOT_MODELLED,
    energyPct: NOT_MODELLED,
    knownBuffs: [],
    knownCooldownRemainsSeconds: [{ name: "probe", remainsSeconds: binding }],
  };
}

function evaluate(expression: string, bindings: AtomBindings) {
  const parsed = parseSimcExpression(expression);
  if (!parsed.ok) throw new Error(`expected ${expression} to parse, got ${parsed.reason}`);
  return evaluateSimcExpression(parsed.ast, expression, bindings);
}

function truthOf(expression: string, bindings: AtomBindings): boolean | "UNRESOLVED" | "UNSUPPORTED" {
  const result = evaluate(expression, bindings);
  if (result.outcome === "RESOLVED") return result.value;
  return result.outcome;
}

describe("parsing: digits '.' digits is a NUMBER at its exact value", () => {
  it.each([
    ["1.5", 1.5],
    ["0.5", 0.5],
    ["12.10", 12.1],
    ["007.50", 7.5],
    ["1000.001", 1000.001],
  ])("parses %s to NUMBER %d", (source, value) => {
    const parsed = parseSimcExpression(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.ast).toEqual({ kind: "NUMBER", value });
  });

  it("parses integer literals exactly as before — no truncation, no float path", () => {
    for (const [source, value] of [
      ["0", 0],
      ["7", 7],
      ["42", 42],
      ["300", 300],
    ] as const) {
      const parsed = parseSimcExpression(source);
      expect(parsed.ok && parsed.ast).toEqual({ kind: "NUMBER", value });
      expect(parsed.ok && parsed.ast.kind === "NUMBER" && Number.isSafeInteger(parsed.ast.value)).toBe(true);
    }
  });

  it("parses a decimal inside a comparison, inside arithmetic, and inside a real pinned Blood condition", () => {
    const comparison = parseSimcExpression("cooldown.probe.remains<1.5");
    expect(comparison.ok && comparison.ast).toEqual({
      kind: "COMPARISON",
      operator: "<",
      left: { kind: "COOLDOWN_REMAINS", cooldownName: "probe" },
      right: { kind: "NUMBER", value: 1.5 },
    });
    // The grammar already admits binary + - * ; a decimal is an ordinary operand.
    const arithmetic = parseSimcExpression("cooldown.probe.remains+0.5<2");
    expect(arithmetic.ok && arithmetic.ast.kind).toBe("COMPARISON");
    // sanlayn[0] verbatim, the entry 98 of 123 Blood decisions stopped at before B3.
    const sanlayn0 = parseSimcExpression(
      "!buff.bone_shield.up|buff.bone_shield.remains<1.5|buff.bone_shield.stack<=1",
      BLOOD_ATOM_VOCABULARY,
    );
    expect(sanlayn0.ok).toBe(true);
  });

  it("refuses every other decimal shape WHOLE, under the parser's existing reasons", () => {
    for (const [source, reason] of [
      // An empty fraction: the pinned lexer would read it, no pinned list writes it, and it is far more often a typo.
      ["1.", "UNSUPPORTED_NUMERIC_LITERAL"],
      ["combo_points>=5.", "UNSUPPORTED_NUMERIC_LITERAL"],
      ["buff.bone_shield.remains<1.&buff.bone_shield.up", "UNSUPPORTED_NUMERIC_LITERAL"],
      // A second point.
      ["1.5.5", "UNSUPPORTED_NUMERIC_LITERAL"],
      ["combo_points>=1.5.5", "UNSUPPORTED_NUMERIC_LITERAL"],
      // A leading point is not a number to the pinned lexer either.
      [".5", "UNEXPECTED_CHARACTER"],
      ["combo_points>=.5", "UNEXPECTED_CHARACTER"],
      // An exponent is a number followed by an identifier to the pinned lexer; here it is trailing input.
      ["1e3", "TRAILING_INPUT"],
      ["combo_points>=1.5e3", "TRAILING_INPUT"],
      // A literal followed by letters, as before.
      ["1.5abc", "TRAILING_INPUT"],
      // Unary minus is still not part of this grammar; a negative literal is not a token.
      ["-1.5", "UNSUPPORTED_OPERATOR"],
      ["combo_points>=-1.5", "UNSUPPORTED_OPERATOR"],
    ] as const) {
      const parsed = parseSimcExpression(source);
      expect(parsed.ok, source).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.reason, source).toBe(reason);
    }
  });
});

describe("evaluation: a decimal threshold compares exactly", () => {
  it("1.5 evaluates to 1.5 — not 1, not 2, not a string, not an atom", () => {
    const parsed = parseSimcExpression("1.5=1.5");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.ast).toEqual({
      kind: "COMPARISON",
      operator: "=",
      left: { kind: "NUMBER", value: 1.5 },
      right: { kind: "NUMBER", value: 1.5 },
    });
    expect(truthOf("1.5=1.5", withRemains(NOT_MODELLED))).toBe(true);
    expect(truthOf("1.5=1", withRemains(NOT_MODELLED))).toBe(false);
    expect(truthOf("1.5=2", withRemains(NOT_MODELLED))).toBe(false);
    expect(truthOf("1.5>1", withRemains(NOT_MODELLED))).toBe(true);
    expect(truthOf("1.5<2", withRemains(NOT_MODELLED))).toBe(true);
  });

  it.each([
    // [remains, <1.5, <=1.5, >1.5, >=1.5, =1.5]
    [1.4, true, true, false, false, false],
    [1.5, false, true, false, true, true],
    [1.6, false, false, true, true, false],
    [0, true, true, false, false, false],
    [2, false, false, true, true, false],
  ])("with remains KNOWN %d the five comparisons against 1.5 are exact", (remains, lt, le, gt, ge, eq) => {
    const bindings = withRemains(knownNumber(remains));
    expect(truthOf("cooldown.probe.remains<1.5", bindings)).toBe(lt);
    expect(truthOf("cooldown.probe.remains<=1.5", bindings)).toBe(le);
    expect(truthOf("cooldown.probe.remains>1.5", bindings)).toBe(gt);
    expect(truthOf("cooldown.probe.remains>=1.5", bindings)).toBe(ge);
    expect(truthOf("cooldown.probe.remains=1.5", bindings)).toBe(eq);
  });

  it("a fractional KNOWN value that is not representable exactly still compares by the ordinary rule", () => {
    // 0.1 + 0.2 is the classic non-exact double; the evaluator uses the same
    // `number` representation for literals and bindings, so the comparison is
    // whatever IEEE-754 says — consistently on both sides, never rounded by us.
    const bindings = withRemains(knownNumber(0.1 + 0.2));
    expect(truthOf("cooldown.probe.remains=0.3", bindings)).toBe(0.1 + 0.2 === 0.3);
    expect(truthOf("cooldown.probe.remains<0.31", bindings)).toBe(true);
    expect(truthOf("cooldown.probe.remains>0.29", bindings)).toBe(true);
  });

  it("a BOUNDED remainder against a decimal threshold decides only in the proven direction, as with an integer", () => {
    const bindings = withRemains(boundedBelowNumber(2, "STATE_NOT_ESTABLISHED"));
    expect(truthOf("cooldown.probe.remains<1.5", bindings)).toBe(false);
    expect(truthOf("cooldown.probe.remains>1.5", bindings)).toBe(true);
    expect(truthOf("cooldown.probe.remains>2.5", bindings)).toBe("UNRESOLVED");
    // Integer thresholds behave exactly as they did.
    expect(truthOf("cooldown.probe.remains<1", bindings)).toBe(false);
    expect(truthOf("cooldown.probe.remains>3", bindings)).toBe("UNRESOLVED");
  });

  it("an UNKNOWN magnitude against a decimal threshold stays UNRESOLVED — the literal decides nothing by itself", () => {
    expect(truthOf("cooldown.probe.remains<1.5", withRemains(NOT_MODELLED))).toBe("UNRESOLVED");
  });

  it("existing integer comparisons are unchanged", () => {
    const bindings = withRemains(knownNumber(5));
    expect(truthOf("cooldown.probe.remains>=5", bindings)).toBe(true);
    expect(truthOf("cooldown.probe.remains>5", bindings)).toBe(false);
    expect(truthOf("cooldown.probe.remains=5", bindings)).toBe(true);
    expect(truthOf("cooldown.probe.remains<5", bindings)).toBe(false);
  });
});

describe("the Blood authority after B3", () => {
  it("every pinned Blood condition now parses under the Blood vocabulary — the decimal refusal is gone", () => {
    const loaded = pinnedBloodDeathKnightAuthority();
    if (!loaded.ok) throw new Error("authority did not load");
    const refused: string[] = [];
    for (const action of loaded.authority.actions) {
      if (action.conditionRaw === null) continue;
      const parsed = parseSimcExpression(action.conditionRaw, BLOOD_ATOM_VOCABULARY);
      if (!parsed.ok) refused.push(`${action.listName}[${String(action.priorityOrdinal)}] ${parsed.reason}`);
    }
    expect(refused).toEqual([]);
    // The three entries M11-B2 pinned as refused, by name, now carry the exact threshold.
    for (const [listName, ordinal] of [
      ["san_gift", 0],
      ["sanlayn", 0],
      ["sanlayn", 1],
    ] as const) {
      const action = loaded.authority.actions.find(
        (entry) => entry.listName === listName && entry.priorityOrdinal === ordinal,
      );
      expect(action?.conditionRaw).toContain("1.5");
      const parsed = parseSimcExpression(action?.conditionRaw ?? "", BLOOD_ATOM_VOCABULARY);
      expect(parsed.ok).toBe(true);
      expect(JSON.stringify(parsed.ok ? parsed.ast : null)).toContain('"value":1.5');
    }
  });
});
