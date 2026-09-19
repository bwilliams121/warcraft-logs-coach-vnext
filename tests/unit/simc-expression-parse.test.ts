import { describe, expect, it } from "vitest";

import { collectAtomKeys } from "../../src/simc/expression/ast.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";

/**
 * The supported SimulationCraft expression subset.
 *
 * PRECEDENCE IS THE LOAD-BEARING PART. Getting it wrong does not crash — it
 * silently changes verdicts. The pinned gate is a disjunction of two
 * conjunctions, and reading it as a conjunction of two disjunctions would invert
 * the analyzer's answer at several combo-point values without any visible
 * symptom, so the real string's parse tree is asserted structurally.
 */

const PINNED_GATE = "!buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0";

describe("precedence is unary ! > comparison > & > |", () => {
  it("parses the pinned gate as (!DN & cp>=5) | (DN & deficit=0)", () => {
    const parsed = parseSimcExpression(PINNED_GATE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.ast).toEqual({
      kind: "OR",
      left: {
        kind: "AND",
        left: { kind: "NOT", operand: { kind: "BUFF_UP", buffName: "darkest_night" } },
        right: {
          kind: "COMPARISON",
          operator: ">=",
          left: { kind: "COMBO_POINTS" },
          right: { kind: "NUMBER", value: 5 },
        },
      },
      right: {
        kind: "AND",
        left: { kind: "BUFF_UP", buffName: "darkest_night" },
        right: {
          kind: "COMPARISON",
          operator: "=",
          left: { kind: "COMBO_POINTS_DEFICIT" },
          right: { kind: "NUMBER", value: 0 },
        },
      },
    });
  });

  it("binds & tighter than |", () => {
    const parsed = parseSimcExpression("combo_points=1&combo_points=2|combo_points=3");
    if (!parsed.ok) return;
    expect(parsed.ast.kind).toBe("OR");
  });

  it("binds ! tighter than a comparison", () => {
    const parsed = parseSimcExpression("!buff.x.up=0");
    if (!parsed.ok) return;
    // (!buff.x.up) = 0, not !(buff.x.up = 0)
    expect(parsed.ast).toEqual({
      kind: "COMPARISON",
      operator: "=",
      left: { kind: "NOT", operand: { kind: "BUFF_UP", buffName: "x" } },
      right: { kind: "NUMBER", value: 0 },
    });
  });

  it("honours explicit grouping", () => {
    const parsed = parseSimcExpression("(combo_points=1|combo_points=2)&buff.x.up");
    if (!parsed.ok) return;
    expect(parsed.ast.kind).toBe("AND");
  });

  it("supports repeated negation", () => {
    const parsed = parseSimcExpression("!!buff.x.up");
    if (!parsed.ok) return;
    expect(parsed.ast).toEqual({
      kind: "NOT",
      operand: { kind: "NOT", operand: { kind: "BUFF_UP", buffName: "x" } },
    });
  });
});

describe("the supported atoms, plus integer literals", () => {
  it.each([
    ["combo_points", { kind: "COMBO_POINTS" }],
    ["combo_points.deficit", { kind: "COMBO_POINTS_DEFICIT" }],
    ["buff.darkest_night.up", { kind: "BUFF_UP", buffName: "darkest_night" }],
    // M5-B additions. `energy.pct` and `fight_remains` are exact matches; they
    // do NOT make `energy.` or `fight_` supported namespaces.
    ["energy.pct", { kind: "ENERGY_PCT" }],
    ["fight_remains", { kind: "FIGHT_REMAINS" }],
    ["buff.envenom.remains", { kind: "BUFF_REMAINS", buffName: "envenom" }],
    ["0", { kind: "NUMBER", value: 0 }],
    ["42", { kind: "NUMBER", value: 42 }],
    // M11-B3: a decimal literal is the same NUMBER node an integer is, at its
    // exact value. Only digits '.' digits; see m11b3-decimal-literals.test.ts.
    ["1.5", { kind: "NUMBER", value: 1.5 }],
  ])("parses %s", (source, expected) => {
    const parsed = parseSimcExpression(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.ast).toEqual(expected);
  });

  it("gives every occurrence of one atom the same key", () => {
    const parsed = parseSimcExpression(PINNED_GATE);
    if (!parsed.ok) return;
    expect(collectAtomKeys(parsed.ast)).toEqual([
      "buff.darkest_night.up",
      "combo_points",
      "combo_points.deficit",
    ]);
  });
});

describe("everything outside the subset is refused whole", () => {
  it.each([
    // RE-POINTED for M5-B. `energy.pct` became supported; `energy.regen_combined`
    // (pinned `generate` line 0) did not, and proves `energy.` is not a namespace.
    ["energy.regen_combined>40", "UNSUPPORTED_IDENTIFIER"],
    ["spell_targets.fan_of_knives>1", "UNSUPPORTED_IDENTIFIER"],
    // RE-POINTED for M5-C3c1. `target.time_to_die` is RECOGNISED now — and
    // permanently unbindable, exactly like `fight_remains`. `cooldown.<name>.ready`
    // is a different property of the namespace C3c1 opened by one property, and
    // stays refused.
    ["cooldown.deathmark.ready", "UNSUPPORTED_IDENTIFIER"],
    // RE-POINTED for M5-C2. `talent.<name>` became supported; a talent RANK did
    // not. `talent.x` is truth-shaped and `talent.x.rank` is a magnitude, so the
    // dot-free name in the pattern is what keeps a rank out of the boolean
    // worlds. This line proves `talent.` is not a namespace.
    ["talent.scent_of_blood.rank>=2", "UNSUPPORTED_IDENTIFIER"],
    // RE-POINTED for M5-C2. `variable.single_target` became supported; no other
    // variable did. `variable.trinket_sync_slot` (pinned `items` lines 4-5) is
    // compared against 1 and 2 and is therefore NUMERIC — a generic
    // `variable.<name>` boolean rule would have read it as a truth.
    ["variable.trinket_sync_slot=1", "UNSUPPORTED_IDENTIFIER"],
    ["variable.base_trinket_condition", "UNSUPPORTED_IDENTIFIER"],
    // RE-POINTED for M5-C2. `stealthed.rogue` became supported; the other
    // `stealthed.*` scopes denote DIFFERENT masks and must not fold into it.
    ["stealthed.all", "UNSUPPORTED_IDENTIFIER"],
    ["stealthed.basic", "UNSUPPORTED_IDENTIFIER"],
    ["stealthed.improved_garrote", "UNSUPPORTED_IDENTIFIER"],
    // RE-POINTED for M5-C3c3c. `buff.x.remains` (M5-B), then `buff.x.stack` and
    // `buff.x.react` (C3c3c) became supported. These neighbours did not, and are
    // what still shows `buff.<name>.` is not an open namespace.
    ["buff.scent_of_blood.duration>=2", "UNSUPPORTED_IDENTIFIER"],
    ["buff.scent_of_blood.value>=2", "UNSUPPORTED_IDENTIFIER"],
    // `debuff.<name>.up` became supported at C3c3c; its siblings did not.
    ["debuff.deathmark.remains>=2", "UNSUPPORTED_IDENTIFIER"],
    ["debuff.deathmark.stack>=2", "UNSUPPORTED_IDENTIFIER"],
    ["debuff.deathmark.react", "UNSUPPORTED_IDENTIFIER"],
    // RE-POINTED for M5-C3c1. `dot.<name>.ticking` is recognised; the other
    // `dot.` properties are not, which is what shows the namespace did not open.
    ["dot.rupture.remains", "UNSUPPORTED_IDENTIFIER"],
    ["dot.garrote.pmultiplier", "UNSUPPORTED_IDENTIFIER"],
    // RE-POINTED for M5-B. `>` became supported; SimulationCraft's max operator
    // `>?` did not, and must never decay into its supported one-char prefix.
    ["combo_points>?5", "UNSUPPORTED_OPERATOR"],
    // RE-POINTED for M5-B. `<=` became supported; the min operator `<?` did not.
    ["combo_points<?5", "UNSUPPORTED_OPERATOR"],
    ["combo_points==5", "UNSUPPORTED_OPERATOR"],
    ["combo_points!=5", "UNSUPPORTED_OPERATOR"],
    ["combo_points>=5&&buff.x.up", "UNSUPPORTED_OPERATOR"],
    ["combo_points>=5||buff.x.up", "UNSUPPORTED_OPERATOR"],
    // RE-POINTED for M5-D1. `*`, `+` and now binary `-` are supported at pinned
    // SimC precedence, because `core_dot[0]` needs the first two and
    // `core_dot[1..4]` need the third. Division and modulo did NOT become
    // supported, and prove arithmetic is still opened one operator at a time
    // rather than wholesale.
    ["combo_points>=6/2", "UNSUPPORTED_OPERATOR"],
    ["combo_points>=6%2", "UNSUPPORTED_OPERATOR"],
    // UNARY minus stays refused even though the binary form is supported. A
    // negative literal is a mistake far more often than an authored threshold.
    ["combo_points>=-2", "UNSUPPORTED_OPERATOR"],
    // RE-POINTED for M11-B3. `5.5` now parses (digits '.' digits is the one
    // decimal form the pinned lexer and the pinned lists use); an EMPTY
    // fraction is still refused whole, as is a leading point and an exponent.
    ["combo_points>=5.", "UNSUPPORTED_NUMERIC_LITERAL"],
    ["(combo_points>=5", "UNBALANCED_PARENTHESIS"],
    ["", "EMPTY_EXPRESSION"],
  ])("refuses %s with %s", (source, reason) => {
    const parsed = parseSimcExpression(source);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe(reason);
  });

  it("PARSES the real pinned ambush condition, which M5-C2 added the atoms for", () => {
    // RE-POINTED for M5-C2. This slot held `default[4]` as the last real pinned
    // line that was still refused. M5-C2 adds `stealthed.rogue`, `talent.<name>`
    // and `variable.single_target`, so it now parses — which is the milestone's
    // whole point. It is NOT decidable from syntax alone; see the evaluator
    // tests. The fail-closed invariant moves to `core_dot[0]` below, which is a
    // real pinned line that remains refused.
    const ambush =
      "stealthed.rogue&variable.single_target&talent.blindside&talent.improved_ambush&!talent.shrouded_suffocation";
    const parsed = parseSimcExpression(ambush);
    expect(parsed.ok).toBe(true);
  });

  it("PARSES the real pinned core_dot[0] line, which M5-C3a added the atoms for", () => {
    // RE-POINTED for M5-C3a. This slot held `core_dot[0]` as the last real
    // pinned line that was still refused. C3a adds bare `pmultiplier`, bare
    // `remains`, `*` and `+`, so it now parses — which is the milestone's whole
    // point. Parsing is NOT deciding: `pmultiplier` is permanently unbindable
    // and `talent.razor_wire` is unresolved, so the verdict still comes from
    // convergence across worlds. See the evaluator tests.
    const coreDot =
      "(buff.improved_garrote.up|stealthed.rogue)&(pmultiplier<=1|remains<=14+6*talent.razor_wire+4*!variable.single_target)";
    const parsed = parseSimcExpression(coreDot);
    expect(parsed.ok).toBe(true);
  });

  it("PARSES the real pinned core_dot[1] line, which M5-D1 added the atoms for", () => {
    // RE-POINTED for M5-D1. This slot held `core_dot[1]` as the last real pinned
    // line still refused; `refreshable` and binary `-` now make it parse.
    //
    // Parsing is NOT deciding, and this line is the sharpest example in the
    // authority: `pmultiplier` is permanently unbindable and
    // `target.time_to_die` is PREDICTIVE, so its last conjunct can never be
    // TRUE. What the addition buys is reaching `combo_points.deficit>=1` and
    // `refreshable`, either of which can prove the LINE false.
    const coreDot =
      "combo_points.deficit>=1&(pmultiplier<=1|!variable.single_target)&refreshable&target.time_to_die-remains>12";
    const parsed = parseSimcExpression(coreDot);
    expect(parsed.ok).toBe(true);
  });

  it("still refuses a real pinned line outside the subset", () => {
    // `spend[2]`, verbatim. The fail-closed invariant moves to the family M5-D
    // deliberately does NOT support: `spell_targets.fan_of_knives` counts the
    // simulation's whole enemy roster (action.cpp:1729-1755, 3832-3842), which
    // Warcraft Logs cannot reconstruct, so every target-count line stays refused.
    const spend = "energy.pct>30&(target.time_to_die<12|spell_targets.fan_of_knives>=4)";
    const parsed = parseSimcExpression(spend);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("UNSUPPORTED_IDENTIFIER");
    expect(parsed.fragment).toBe("spell_targets.fan_of_knives");
  });

  it("reports the offending fragment so a finding can disclose it", () => {
    // RE-POINTED for M5-C2. The previous version used `talent.darkest_night`,
    // which now parses. Re-pointed to a talent RANK, which does not — and which
    // keeps this test demonstrating that the `talent.` namespace is not open.
    //
    // The parse failure is asserted FIRST (an M5-B fix) so this can never go
    // vacuous if the fragment ever becomes supported.
    const parsed = parseSimcExpression("combo_points>=5&talent.scent_of_blood.rank");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected a parse failure, not a silent pass");
    expect(parsed.reason).toBe("UNSUPPORTED_IDENTIFIER");
    expect(parsed.fragment).toBe("talent.scent_of_blood.rank");
    expect(parsed.offset).toBeGreaterThan(0);
  });

  it("never throws, whatever it is handed", () => {
    for (const source of ["&&&", "((((", "???", " ", "if=", "1,2,3", "!"]) {
      expect(() => parseSimcExpression(source)).not.toThrow();
      expect(parseSimcExpression(source).ok).toBe(false);
    }
  });

  it("produces no node an unsupported fragment could hide in", () => {
    const parsed = parseSimcExpression(PINNED_GATE);
    if (!parsed.ok) return;
    const kinds = new Set<string>();
    const walk = (node: unknown): void => {
      if (typeof node !== "object" || node === null) return;
      const record = node as Record<string, unknown>;
      if (typeof record["kind"] === "string") kinds.add(record["kind"]);
      for (const value of Object.values(record)) walk(value);
    };
    walk(parsed.ast);
    expect(kinds).not.toContain("UNSUPPORTED");
  });
});

/**
 * The M5-B operator and atom additions, pinned against the REAL authority
 * strings they were added for.
 *
 * Synthetic operator tests would prove the production rules work. These prove
 * the production rules work on the exact text of the pinned commit, which is
 * the only text that actually has to parse.
 */
describe("the M5-B additions, against the pinned authority text", () => {
  it.each([
    ["spend[0]", "buff.envenom.remains<=1|buff.deathmark.up"],
    ["spend[1]", "energy.pct>70|fight_remains<15"],
    [
      "the default[7] generate call condition",
      "!buff.darkest_night.up&combo_points<5|buff.darkest_night.up&combo_points.deficit>0",
    ],
  ])("parses %s", (_label, condition) => {
    const parsed = parseSimcExpression(condition);
    expect(parsed.ok, `${condition} must parse`).toBe(true);
  });

  it("still refuses spend[2], now on its target-count half", () => {
    // M5-B deliberately stops short of the third line. It is refused for an
    // identifier the subset does not contain, NOT for `energy.pct` or `>`.
    const parsed = parseSimcExpression(
      "energy.pct>30&(target.time_to_die<12|spell_targets.fan_of_knives>=4)",
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("UNSUPPORTED_IDENTIFIER");
    // RE-POINTED for M5-C3c1. `target.time_to_die` is recognised now, so what
    // still refuses this real pinned line is the enemy count — which Warcraft
    // Logs supplies no positional state for and which stays out of the subset.
    expect(parsed.fragment).toBe("spell_targets.fan_of_knives");
  });

  it.each([
    [">", "combo_points>5", ">"],
    [">=", "combo_points>=5", ">="],
    ["<", "combo_points<5", "<"],
    ["<=", "combo_points<=5", "<="],
    ["=", "combo_points=5", "="],
  ])("reads %s as its own operator", (_label, source, operator) => {
    const parsed = parseSimcExpression(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.ast).toEqual({
      kind: "COMPARISON",
      operator,
      left: { kind: "COMBO_POINTS" },
      right: { kind: "NUMBER", value: 5 },
    });
  });

  it.each([
    ["combo_points>?5", ">?"],
    ["combo_points<?5", "<?"],
    ["combo_points==5", "=="],
    ["combo_points!=5", "!="],
  ])("refuses %s rather than truncating it to a supported prefix", (source, fragment) => {
    // The failure this prevents: `>?` read as `>` followed by junk would change
    // an authority condition's MEANING while still producing a usable AST.
    const parsed = parseSimcExpression(source);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("UNSUPPORTED_OPERATOR");
    expect(parsed.fragment).toBe(fragment);
  });

  it("keeps buff.<name>.up and buff.<name>.remains as different atoms", () => {
    // Sharing a key would let a boolean world assignment leak into a numeric
    // comparison about the same aura.
    const parsed = parseSimcExpression("buff.envenom.up&buff.envenom.remains<1");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(collectAtomKeys(parsed.ast)).toEqual(["buff.envenom.up", "buff.envenom.remains"]);
  });
});
