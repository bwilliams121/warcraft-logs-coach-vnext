/**
 * M11-D3-C1: SimulationCraft's `<?` and `>?` operators.
 *
 * PINNED SEMANTICS (SimulationCraft 33622e9d, engine/sim/expressions.cpp):
 *
 *     a<?b   std::max( a, b )   — `<?` tokenizes as TOK_MAX (132-139)
 *     a>?b   std::min( a, b )   — `>?` tokenizes as TOK_MIN (140-147)
 *
 * The REVERSE of what the glyphs suggest: `spell_targets>?3` caps a count at
 * three. Precedence 5 — tighter than comparison (4), looser than `+`/`-` (6)
 * — left-associative, both operands evaluated (1081-1110, 1311-1324, 384-387).
 *
 * Evaluated over the project's world values, claiming only what holds in every
 * world: exact results where both sides are exact, member-wise over a finite
 * set against an exact value, a dominating set outright, a proven lower bound
 * where only that follows, and UNKNOWN whenever an operand is unknown.
 */

import { describe, expect, it } from "vitest";

import { collectAtomKeys, extremumOf, isPlayerScoped } from "../../src/simc/expression/ast.js";
import {
  actingAction,
  boundedBelowNumber,
  evaluateSimcExpression,
  knownNumber,
  oneOfNumbers,
  unknownNumber,
  type AtomBindings,
  type NumericBinding,
} from "../../src/simc/expression/evaluate.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import { loadAplAuthority, type AplAction } from "../../src/simc/apl-authority.js";
import { provenUsable } from "../../src/simc/action-applicability.js";
import { selectAcrossLists } from "../../src/simc/nested-selection.js";
import { scoreFinitenessOf, targetIfVerdict } from "../../src/simc/target-if.js";
import { syntheticArtifact, syntheticAuthority } from "../support/m5a-authority.js";

const ACTING = "x";

interface Operands {
  /** `remains` — the acting action's own DoT remainder. */
  readonly a?: NumericBinding;
  /** `cooldown.c.remains`. */
  readonly b?: NumericBinding;
}

function bindings({ a, b }: Operands = {}, extra: Partial<AtomBindings> = {}): AtomBindings {
  return {
    comboPoints: knownNumber(7),
    comboPointsDeficit: knownNumber(0),
    energyPct: knownNumber(100),
    dotRemainsSecondsByAction: a === undefined ? [] : [{ actionToken: ACTING, remainsSeconds: a }],
    knownBuffs: [],
    ...(b === undefined ? {} : { knownCooldownRemainsSeconds: [{ name: "c", remainsSeconds: b }] }),
    ...extra,
  };
}

/** TRUE / FALSE / UNRESOLVED for one condition. */
function truth(condition: string, operands: Operands = {}, extra: Partial<AtomBindings> = {}): string {
  const parsed = parseSimcExpression(condition);
  if (!parsed.ok) throw new Error(`${condition}: ${parsed.reason} at ${parsed.fragment}`);
  const result = evaluateSimcExpression(
    parsed.ast,
    condition,
    bindings(operands, extra),
    actingAction(ACTING),
  );
  if (result.outcome === "RESOLVED") return result.value ? "TRUE" : "FALSE";
  return result.outcome;
}

const A = "remains";
const B = "cooldown.c.remains";

// ---------------------------------------------------------------------------
// The pinned direction and the AST
// ---------------------------------------------------------------------------

describe("the pinned meaning: <? is MAX, >? is MIN", () => {
  it("maps the written operator to its pinned extremum in one place", () => {
    expect(extremumOf("<?")).toBe("MAX");
    expect(extremumOf(">?")).toBe("MIN");
  });

  it("evaluates exact operands to the pinned std::max / std::min", () => {
    expect(truth("9<?4=9")).toBe("TRUE");
    expect(truth("9>?4=4")).toBe("TRUE");
    expect(truth("4<?9=9")).toBe("TRUE");
    expect(truth("4>?9=4")).toBe("TRUE");
    // The trap, stated as a test: `x>?3` CAPS at three.
    expect(truth("combo_points>?3=3")).toBe("TRUE");
    expect(truth("combo_points<?3=7")).toBe("TRUE");
  });

  it("handles equal operands, zero and negative values", () => {
    expect(truth("5<?5=5")).toBe("TRUE");
    expect(truth("5>?5=5")).toBe("TRUE");
    expect(truth("0<?0=0")).toBe("TRUE");
    // No negative literal exists; a negative value arrives through subtraction.
    expect(truth("1-5<?0=0")).toBe("TRUE");
    expect(truth("(1-5>?0)<0")).toBe("TRUE");
    expect(truth("(1-5>?2-9)+7=0")).toBe("TRUE");
  });

  it("consumes a structurally 0/1 truth numerically, as SimulationCraft does", () => {
    const talents = { knownTalents: [{ name: "t", taken: true }] };
    expect(truth("talent.t<?0=1", {}, talents)).toBe("TRUE");
    expect(truth("talent.t>?0=0", {}, talents)).toBe("TRUE");
    expect(truth("(combo_points>=5)<?0=1")).toBe("TRUE");
  });
});

describe("the parser builds an explicit node at pinned precedence", () => {
  const ast = (source: string) => {
    const parsed = parseSimcExpression(source);
    if (!parsed.ok) throw new Error(`${source}: ${parsed.reason}`);
    return parsed.ast;
  };

  it("is tighter than comparison and looser than arithmetic", () => {
    expect(ast("1+2<?3")).toEqual({
      kind: "EXTREMUM",
      operator: "<?",
      left: { kind: "ADD", left: { kind: "NUMBER", value: 1 }, right: { kind: "NUMBER", value: 2 } },
      right: { kind: "NUMBER", value: 3 },
    });
    expect(ast("2*3>?5")).toMatchObject({ kind: "EXTREMUM", operator: ">?", left: { kind: "MULTIPLY" } });
    expect(ast("combo_points>=energy.pct>?3")).toEqual({
      kind: "COMPARISON",
      operator: ">=",
      left: { kind: "COMBO_POINTS" },
      right: {
        kind: "EXTREMUM",
        operator: ">?",
        left: { kind: "ENERGY_PCT" },
        right: { kind: "NUMBER", value: 3 },
      },
    });
  });

  it("is left-associative, and parentheses override", () => {
    expect(ast("1>?2<?3")).toEqual({
      kind: "EXTREMUM",
      operator: "<?",
      left: {
        kind: "EXTREMUM",
        operator: ">?",
        left: { kind: "NUMBER", value: 1 },
        right: { kind: "NUMBER", value: 2 },
      },
      right: { kind: "NUMBER", value: 3 },
    });
    expect(ast("1>?(2<?3)")).toMatchObject({
      kind: "EXTREMUM",
      operator: ">?",
      right: { kind: "EXTREMUM", operator: "<?" },
    });
    // (1>?2)<?3 = max(min(1,2),3) = 3; 1>?(2<?3) = min(1, max(2,3)) = 1.
    expect(truth("1>?2<?3=3")).toBe("TRUE");
    expect(truth("1>?(2<?3)=1")).toBe("TRUE");
  });

  it("sits below the logical operators and above unary !", () => {
    expect(ast("buff.a.up&combo_points>?3")).toMatchObject({ kind: "AND", right: { kind: "EXTREMUM" } });
    expect(ast("!buff.a.up<?combo_points")).toMatchObject({ kind: "EXTREMUM", left: { kind: "NOT" } });
  });

  it("reads an operand as a MAGNITUDE: `.react` is a stack count there, not a truth", () => {
    expect(ast("buff.r.react<?2")).toMatchObject({ left: { kind: "BUFF_REACT_STACK", buffName: "r" } });
    // Three stacks proven: react is one of 0..3, so max(react, 2) is one of { 2, 3 }.
    const stacks = { knownBuffStacks: [{ name: "r", stack: 3 }] };
    expect(truth("buff.r.react<?2>=2", {}, stacks)).toBe("TRUE");
    expect(truth("buff.r.react<?2=3", {}, stacks)).toBe("UNRESOLVED");
    // Never collapsed to 0/1: react can be 3 here, so this is not FALSE.
    expect(truth("buff.r.react<?0>=2", {}, stacks)).toBe("UNRESOLVED");
  });

  it("fails closed on malformed uses", () => {
    for (const source of [
      "combo_points>?",
      ">?5",
      "combo_points>?>?5",
      "combo_points<?<?5",
      "(combo_points<?5",
      "combo_points<?5)",
      "combo_points>??5",
      "combo_points<?-1",
    ]) {
      expect(parseSimcExpression(source).ok, source).toBe(false);
    }
  });

  it("leaves everything outside C1 refused", () => {
    for (const source of [
      "combo_points/2",
      "combo_points%2",
      "combo_points%%2",
      "combo_points>=-1",
      "combo_points!=5",
      "floor(combo_points)",
    ]) {
      expect(parseSimcExpression(source).ok, source).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Numeric worlds
// ---------------------------------------------------------------------------

describe("over values nobody fully established, only what holds in every world", () => {
  it("A one of { 1, 3 }, B = 2: MAX is one of { 2, 3 }, MIN one of { 1, 2 }", () => {
    const a = oneOfNumbers([1, 3], "STATE_NOT_MODELLED");
    const b = knownNumber(2);
    expect(truth(`${A}<?${B}>=2`, { a, b })).toBe("TRUE");
    expect(truth(`${A}<?${B}<=3`, { a, b })).toBe("TRUE");
    expect(truth(`${A}<?${B}=2`, { a, b })).toBe("UNRESOLVED");
    expect(truth(`${A}>?${B}<=2`, { a, b })).toBe("TRUE");
    expect(truth(`${A}>?${B}>=1`, { a, b })).toBe("TRUE");
    expect(truth(`${A}>?${B}=1`, { a, b })).toBe("UNRESOLVED");
  });

  it("A one of { 1, 2 }, B one of { 5, 7 }: B dominates, so MAX is B and MIN is A exactly", () => {
    const a = oneOfNumbers([1, 2], "STATE_NOT_MODELLED");
    const b = oneOfNumbers([5, 7], "STATE_NOT_MODELLED");
    expect(truth(`${A}<?${B}>=5`, { a, b })).toBe("TRUE");
    expect(truth(`${A}<?${B}<=7`, { a, b })).toBe("TRUE");
    expect(truth(`${A}<?${B}=6`, { a, b })).toBe("FALSE");
    expect(truth(`${A}>?${B}<=2`, { a, b })).toBe("TRUE");
    expect(truth(`${A}>?${B}=1`, { a, b })).toBe("UNRESOLVED");
  });

  it("overlapping sets keep only the proven lower bound: no pairing is invented", () => {
    const a = oneOfNumbers([1, 5], "STATE_NOT_MODELLED");
    const b = oneOfNumbers([3, 7], "STATE_NOT_MODELLED");
    expect(truth(`${A}<?${B}>=3`, { a, b })).toBe("TRUE");
    // Truly at most 7 — but the lower-bound domain cannot say so: UNRESOLVED.
    expect(truth(`${A}<?${B}<=7`, { a, b })).toBe("UNRESOLVED");
    expect(truth(`${A}>?${B}>=1`, { a, b })).toBe("TRUE");
    expect(truth(`${A}>?${B}<=5`, { a, b })).toBe("UNRESOLVED");
  });

  it("a proven lower bound: MAX keeps the larger bound; MIN is exact once the bound clears the other side", () => {
    const high = boundedBelowNumber(10, "STATE_NOT_ESTABLISHED");
    const five = knownNumber(5);
    expect(truth(`${A}<?${B}>=10`, { a: high, b: five })).toBe("TRUE");
    expect(truth(`${A}>?${B}=5`, { a: high, b: five })).toBe("TRUE");
    const low = boundedBelowNumber(2, "STATE_NOT_ESTABLISHED");
    expect(truth(`${A}<?${B}>=5`, { a: low, b: five })).toBe("TRUE");
    expect(truth(`${A}>?${B}>=2`, { a: low, b: five })).toBe("TRUE");
    expect(truth(`${A}>?${B}=5`, { a: low, b: five })).toBe("UNRESOLVED");
    // Both bounded.
    const other = boundedBelowNumber(4, "STATE_NOT_ESTABLISHED");
    expect(truth(`${A}<?${B}>=10`, { a: high, b: other })).toBe("TRUE");
    expect(truth(`${A}>?${B}>=4`, { a: high, b: other })).toBe("TRUE");
    expect(truth(`${A}>?${B}>=5`, { a: high, b: other })).toBe("UNRESOLVED");
    // Bounded against a set: MIN is the set outright when the bound clears it.
    const set = oneOfNumbers([3, 6], "STATE_NOT_MODELLED");
    expect(truth(`${A}>?${B}=6`, { a: high, b: set })).toBe("UNRESOLVED");
    expect(truth(`${A}>?${B}<=6`, { a: high, b: set })).toBe("TRUE");
    expect(truth(`${A}<?${B}>=10`, { a: high, b: set })).toBe("TRUE");
  });

  it("an unknown operand makes the result UNKNOWN — never zero, never dominated", () => {
    const five = knownNumber(5);
    const unknown = unknownNumber("STATE_NOT_ESTABLISHED");
    // max(x, 5) >= 5 is true for every REAL x, but the pinned std::max returns
    // a NaN first operand, and nothing proves this atom is never one: refused.
    expect(truth(`${A}<?${B}>=5`, { a: unknown, b: five })).toBe("UNRESOLVED");
    expect(truth(`${A}>?${B}<=5`, { a: unknown, b: five })).toBe("UNRESOLVED");
    expect(truth(`${A}<?${B}=0`, { a: unknown, b: five })).toBe("UNRESOLVED");
    expect(truth(`${A}>?0=0`, { a: unknown })).toBe("UNRESOLVED");
    // Absent bindings are unknown too.
    expect(truth(`${A}<?3>=3`)).toBe("UNRESOLVED");
  });
});

// ---------------------------------------------------------------------------
// B1 interaction: scope and finiteness
// ---------------------------------------------------------------------------

describe("scope is the join of the operands' scopes", () => {
  const scoped = (source: string): boolean => {
    const parsed = parseSimcExpression(source);
    if (!parsed.ok) throw new Error(source);
    return isPlayerScoped(parsed.ast);
  };

  it("is target-dependent if either operand is, whatever their values", () => {
    expect(scoped("combo_points<?talent.t")).toBe(true);
    expect(scoped("debuff.d.up<?combo_points")).toBe(false);
    expect(scoped("combo_points>?remains")).toBe(false);
    expect(scoped("(combo_points<?5)>=(1>?target.time_to_die)")).toBe(false);
  });

  it("collects both operands' atoms", () => {
    const parsed = parseSimcExpression("combo_points<?debuff.d.up>?cooldown.c.remains");
    if (!parsed.ok) throw new Error("parse");
    expect(collectAtomKeys(parsed.ast)).toEqual(["combo_points", "debuff.d.up", "cooldown.c.remains"]);
  });

  it("a target-dependent extremum in if= keeps a MIN/MAX target_if refused", () => {
    expect(
      targetIfVerdict(
        actionOf("y,target_if=min:target.time_to_die,if=combo_points<?debuff.d.up>=1"),
        bindings(),
      ),
    ).toMatchObject({ kind: "REFUSED", reason: "CONDITION_TARGET_DEPENDENT" });
    expect(
      targetIfVerdict(
        actionOf("y,target_if=min:target.time_to_die,if=combo_points<?talent.t>=1"),
        bindings(),
      ),
    ).toMatchObject({ kind: "TARGET_SELECTION_IGNORABLE" });
  });
});

describe("finiteness: proven only when both operands are", () => {
  it("is PROVEN_FINITE with bound max(|a|, |b|) over proven operands", () => {
    expect(scoreFinitenessOf("target.time_to_die<?30")).toEqual({
      kind: "PROVEN_FINITE",
      bound: 2 ** 63 / 1000,
    });
    expect(scoreFinitenessOf("talent.t>?2")).toEqual({ kind: "PROVEN_FINITE", bound: 2 });
    expect(scoreFinitenessOf("(debuff.d.up<?3)*2")).toEqual({ kind: "PROVEN_FINITE", bound: 6 });
  });

  it("is NOT proven when either operand is not — neither side rescues the other", () => {
    expect(scoreFinitenessOf("remains<?1")).toMatchObject({ kind: "NOT_PROVEN_FINITE", at: "remains" });
    expect(scoreFinitenessOf("1>?remains")).toMatchObject({ kind: "NOT_PROVEN_FINITE", at: "remains" });
    expect(scoreFinitenessOf("target.time_to_die>?buff.b.remains")).toMatchObject({
      kind: "NOT_PROVEN_FINITE",
      at: "buff.b.remains",
    });
  });

  it("an extremum score now lets B1 ignore MIN/MAX target choice when it is proven finite", () => {
    expect(
      targetIfVerdict(actionOf("y,target_if=max:target.time_to_die>?30,if=combo_points>=5"), bindings()),
    ).toMatchObject({ kind: "TARGET_SELECTION_IGNORABLE" });
    expect(
      targetIfVerdict(actionOf("y,target_if=max:remains>?30,if=combo_points>=5"), bindings()),
    ).toMatchObject({ kind: "REFUSED", reason: "SCORE_NOT_PROVEN_FINITE" });
  });
});

describe("in the selector", () => {
  it("decides a line through an extremum, and keeps an unknown operand UNKNOWN", () => {
    const run = (line: string) =>
      selectAcrossLists({
        authority: syntheticAuthority({ lists: [{ listName: "default", actions: [line, "z"] }] }),
        entryListName: "default",
        bindings: bindings(),
        usabilityFor: () => provenUsable(),
      });
    // min(7, 3) = 3, so `>=5` is FALSE and z is selected; max(7, 3) = 7 >= 5 selects y.
    expect(run("y,if=combo_points>?3>=5")).toMatchObject({ kind: "SELECTED", actionToken: "z" });
    expect(run("y,if=combo_points<?3>=5")).toMatchObject({ kind: "SELECTED", actionToken: "y" });
    expect(run("y,if=fight_remains<?3>=5")).toMatchObject({ kind: "UNKNOWN" });
  });
});

function actionOf(line: string): AplAction {
  const loaded = loadAplAuthority(syntheticArtifact({ lists: [{ listName: "default", actions: [line] }] }));
  if (!loaded.ok) throw new Error(loaded.detail);
  const lookup = loaded.authority.actionsInList("default");
  const [action] = lookup.found ? lookup.actions : [];
  if (action === undefined) throw new Error("no action");
  return action;
}
