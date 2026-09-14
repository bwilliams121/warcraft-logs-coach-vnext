/**
 * The two arithmetic operators M5-C3a added, and the convergence they enable.
 *
 * `*` and `+` exist here for ONE reason: the pinned `core_dot[0]` threshold is
 * `14+6*talent.razor_wire+4*!variable.single_target`. They were added at the
 * precedence SimulationCraft itself uses, read from `engine/sim/expressions.cpp`
 * `precedence()` at the pinned commit:
 *
 *     FLOOR / CEIL      9
 *     NOT / unary +-    8
 *     MULT / DIV / MOD  7
 *     ADD / SUB         6
 *     MAX / MIN         5
 *     comparisons       4
 *     AND               3
 *     XOR               2
 *     OR                1
 *
 * Getting this wrong is not a parse error, it is a WRONG NUMBER. If `+` bound
 * tighter than `*`, the threshold would be `14+6 = 20` times something, and the
 * comparison would still evaluate and still look reasonable.
 */

import { describe, expect, it } from "vitest";

import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import { collectAtomKeys } from "../../src/simc/expression/ast.js";
import {
  actingAction,
  evaluateSimcExpression,
  knownNumber,
  unknownNumber,
  type AtomBindings,
  type NumericBinding,
} from "../../src/simc/expression/evaluate.js";

const NO_STATE = unknownNumber("STATE_NOT_ESTABLISHED");

/**
 * The action these cases pretend to be evaluating.
 *
 * M5-D1 keyed `remains` by acting action, so a bare `remains` needs a context to
 * resolve against. These cases are about ARITHMETIC PRECEDENCE and not about
 * which DoT is being asked after, so one token is used throughout and the
 * `dotRemainsSeconds` override below is translated onto it. Every assertion in
 * this file is therefore unchanged from M5-C3a.
 */
const ACTING_TOKEN = "garrote";

/**
 * `dotRemainsSeconds` is no longer a field on `AtomBindings`; it is a per-action
 * map. The override is kept in the old shape here so the 18 precedence cases
 * below read exactly as they did before, and translated in one place.
 */
type Overrides = Partial<AtomBindings> & { readonly dotRemainsSeconds?: NumericBinding };

function bindings({ dotRemainsSeconds, ...rest }: Overrides = {}): AtomBindings {
  return {
    comboPoints: knownNumber(0),
    comboPointsDeficit: knownNumber(7),
    energyPct: NO_STATE,
    dotRemainsSecondsByAction:
      dotRemainsSeconds === undefined
        ? []
        : [{ actionToken: ACTING_TOKEN, remainsSeconds: dotRemainsSeconds }],
    knownBuffs: [],
    ...rest,
  };
}

function parse(source: string) {
  const parsed = parseSimcExpression(source);
  if (!parsed.ok) throw new Error(`expected ${source} to parse, got ${parsed.reason}: ${parsed.fragment}`);
  return parsed.ast;
}

function evaluate(source: string, overrides: Overrides = {}) {
  return evaluateSimcExpression(parse(source), source, bindings(overrides), actingAction(ACTING_TOKEN));
}

function soleValue(source: string, overrides: Overrides = {}): boolean | null {
  const result = evaluate(source, overrides);
  if (result.outcome !== "RESOLVED") return null;
  return result.value;
}

describe("multiplication binds tighter than addition", () => {
  it.each([
    // remains, expected — threshold is 14 + 6*1 = 20 if `*` binds tighter,
    // and (14+6)*1 = 20 too, so the discriminating case needs a 0.
    ["remains<=14+6*0", 14, true],
    ["remains<=14+6*0", 15, false],
  ])("%s with remains=%d is %s", (source, remains, expected) => {
    // If `+` bound tighter, this would be (14+6)*0 = 0, and 14<=0 is FALSE.
    // With SimC precedence it is 14 + (6*0) = 14, and 14<=14 is TRUE.
    expect(soleValue(source, { dotRemainsSeconds: knownNumber(remains) })).toBe(expected);
  });

  it("evaluates 14+6*0+4*0 as 14, not as 24 or 0", () => {
    expect(soleValue("remains<=14+6*0+4*0", { dotRemainsSeconds: knownNumber(14) })).toBe(true);
    expect(soleValue("remains<=14+6*0+4*0", { dotRemainsSeconds: knownNumber(14.001) })).toBe(false);
  });

  it("evaluates 14+6*1+4*1 as 24", () => {
    expect(soleValue("remains<=14+6*1+4*1", { dotRemainsSeconds: knownNumber(24) })).toBe(true);
    expect(soleValue("remains<=14+6*1+4*1", { dotRemainsSeconds: knownNumber(24.001) })).toBe(false);
  });
});

describe("unary NOT binds tighter than multiplication", () => {
  it("reads 4*!x as 4*(!x), never as !(4*x)", () => {
    // SimC gives NOT precedence 8 and MULT 7, so the `!` takes only the operand
    // immediately after it. Literals pin both sides: `!0` is 1 and `!1` is 0.
    //
    // Under the WRONG reading, `!(4*0)` would be `!0` = 1 and `!(4*1)` would be
    // `!4` = 0 — the two cases would swap, and both boundaries below would move.
    expect(soleValue("remains<=14+4*!0", { dotRemainsSeconds: knownNumber(18) })).toBe(true);
    expect(soleValue("remains<=14+4*!0", { dotRemainsSeconds: knownNumber(18.001) })).toBe(false);
    expect(soleValue("remains<=14+4*!1", { dotRemainsSeconds: knownNumber(14) })).toBe(true);
    expect(soleValue("remains<=14+4*!1", { dotRemainsSeconds: knownNumber(14.001) })).toBe(false);
  });
});

describe("comparison binds looser than arithmetic", () => {
  it("reads remains<=14+6 as remains<=(14+6)", () => {
    // Precedence 4 vs 6. If the comparison bound tighter, this would be
    // `(remains<=14)+6`, which is a magnitude and not a truth at all.
    expect(soleValue("remains<=14+6", { dotRemainsSeconds: knownNumber(20) })).toBe(true);
    expect(soleValue("remains<=14+6", { dotRemainsSeconds: knownNumber(20.001) })).toBe(false);
  });

  it("reads the whole pinned threshold as one comparison", () => {
    const source = "remains<=14+6*talent.razor_wire+4*!variable.single_target";
    // Three atoms: the magnitude and the two enumerable truths.
    expect(collectAtomKeys(parse(source))).toEqual([
      "remains",
      "talent.razor_wire",
      "variable.single_target",
    ]);
  });
});

describe("the pinned threshold converges, which is why C3a is answerable", () => {
  const THRESHOLD = "remains<=14+6*talent.razor_wire+4*!variable.single_target";

  it("is TRUE in all four worlds when remains is below the MINIMUM threshold", () => {
    // The four worlds are:
    //   razor_wire=0 single_target=0 -> 14 + 0 + 4 = 18
    //   razor_wire=0 single_target=1 -> 14 + 0 + 0 = 14   <- the minimum
    //   razor_wire=1 single_target=0 -> 14 + 6 + 4 = 24
    //   razor_wire=1 single_target=1 -> 14 + 6 + 0 = 20
    //
    // So any `remains` at or below 14 is TRUE regardless, and the two unresolved
    // talents never have to be decided. That is exactly the real case: 5.746s.
    const result = evaluate(THRESHOLD, { dotRemainsSeconds: knownNumber(5.746) });
    expect(result.outcome).toBe("RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(true);
    expect(result.trace.worlds).toHaveLength(4);
    expect(result.trace.worlds.every((world) => world.result === "TRUE")).toBe(true);
    expect(result.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
  });

  it("is FALSE in all four worlds when remains is above the MAXIMUM threshold", () => {
    // The mirror. Above 24 no world can satisfy it, so the answer is exact in
    // the other direction — and this is what proves the convergence is real
    // rather than an artifact of everything coming out TRUE.
    const result = evaluate(THRESHOLD, { dotRemainsSeconds: knownNumber(24.5) });
    expect(result.outcome).toBe("RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(false);
    expect(result.trace.worlds.every((world) => world.result === "FALSE")).toBe(true);
  });

  it("stays UNRESOLVED between the minimum and maximum thresholds", () => {
    // 17 is above the 14 world and below the 18, 20 and 24 worlds. The talents
    // genuinely decide it, so the answer must not be manufactured.
    const result = evaluate(THRESHOLD, { dotRemainsSeconds: knownNumber(17) });
    expect(result.outcome).toBe("UNRESOLVED");
    if (result.outcome !== "UNRESOLVED") return;
    const results = result.trace.worlds.map((world) => world.result);
    expect(results).toContain("TRUE");
    expect(results).toContain("FALSE");
  });

  it("stays UNRESOLVED when remains itself is unknown, however the talents fall", () => {
    // A magnitude is NEVER enumerated. Without a derived duration there is no
    // answer here, and the four talent worlds cannot supply one.
    const result = evaluate(THRESHOLD, { dotRemainsSeconds: NO_STATE });
    expect(result.outcome).toBe("UNRESOLVED");
    if (result.outcome !== "UNRESOLVED") return;
    expect(result.trace.worlds.every((world) => world.result === "UNKNOWN_STATE")).toBe(true);
  });
});

describe("the full pinned core_dot[0] line", () => {
  const LINE =
    "(buff.improved_garrote.up|stealthed.rogue)&(pmultiplier<=1|remains<=14+6*talent.razor_wire+4*!variable.single_target)";

  it("parses whole, with six distinct atoms", () => {
    expect(collectAtomKeys(parse(LINE))).toEqual([
      "buff.improved_garrote.up",
      "stealthed.rogue",
      "pmultiplier",
      "remains",
      "talent.razor_wire",
      "variable.single_target",
    ]);
  });

  it("resolves TRUE from stealth plus a short remainder, with pmultiplier unknown", () => {
    // The real shape at Q. `pmultiplier` is UNKNOWN and stays UNKNOWN; the OR's
    // other side is TRUE in every world, so Kleene OR gives TRUE anyway.
    const result = evaluate(LINE, {
      dotRemainsSeconds: knownNumber(5.746),
      stealthedRogue: true,
    });
    expect(result.outcome).toBe("RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(true);
    expect(result.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");

    const pmultiplier = result.trace.atoms.find((atom) => atom.key === "pmultiplier");
    expect(pmultiplier?.binding).toBe("UNKNOWN_NUMBER");
    expect(pmultiplier?.unknownNumberReason).toBe("STATE_NOT_MODELLED");
  });

  it("does NOT resolve when the remainder is in the undecidable band", () => {
    // Same stealth proof, same everything else — only the magnitude moves. The
    // headline must depend on the derived duration, not on stealth alone.
    const result = evaluate(LINE, {
      dotRemainsSeconds: knownNumber(17),
      stealthedRogue: true,
    });
    expect(result.outcome).toBe("UNRESOLVED");
  });

  it("does NOT resolve from stealth alone when the remainder is unknown", () => {
    const result = evaluate(LINE, { stealthedRogue: true });
    expect(result.outcome).toBe("UNRESOLVED");
  });
});

describe("arithmetic was opened by the operator, not wholesale", () => {
  it.each([
    ["remains<=14/2", "UNSUPPORTED_OPERATOR"],
    ["remains<=14%2", "UNSUPPORTED_OPERATOR"],
    ["remains<=14^2", "UNSUPPORTED_OPERATOR"],
    // SimulationCraft's max/min. `>?` must never decay into the supported `>`.
    ["remains>?14", "UNSUPPORTED_OPERATOR"],
    ["remains<?14", "UNSUPPORTED_OPERATOR"],
  ])("still refuses %s", (source, reason) => {
    const parsed = parseSimcExpression(source);
    expect(parsed.ok, `${source} should be refused`).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe(reason);
  });

  it("refuses a UNARY +, - or * where an operand belongs", () => {
    // Binary use is consumed before primary position is ever reached, so these
    // reach the operand path and are refused there.
    //
    // `-` IS IN THIS LIST EVEN THOUGH BINARY SUBTRACTION IS SUPPORTED from
    // M5-D1, and that is the whole shape of the addition: `14-6` parses,
    // `remains<=-1` does not. A negative literal is far likelier to be a mistake
    // than an authored value, and admitting one would let a threshold nobody
    // wrote slip past the parser.
    for (const source of [
      "+remains",
      "-remains",
      "*remains",
      "remains<=+14",
      "remains<=-14",
      "remains<=*14",
    ]) {
      expect(parseSimcExpression(source).ok, `${source} should be refused`).toBe(false);
    }
  });

  it("parses target.time_to_die-remains, and it is still not evaluable", () => {
    // `core_dot[1..4]` all end in this. M5-D1 added binary `-` so those lines
    // PARSE — and the verdict on the subtraction itself is unchanged, because
    // `target.time_to_die` is PREDICTIVE and permanently unbindable.
    //
    // The point of the addition was never to evaluate this comparison. It was to
    // stop the whole-expression refusal from hiding the OTHER conjuncts on those
    // lines, one of which can prove the line FALSE.
    const parsed = parseSimcExpression("target.time_to_die-remains>12");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = evaluateSimcExpression(
      parsed.ast,
      "target.time_to_die-remains>12",
      bindings({ dotRemainsSeconds: knownNumber(5) }),
      actingAction(ACTING_TOKEN),
    );
    // Even with the remainder KNOWN, hindsight is not admitted, so the whole
    // comparison stays undecided.
    expect(result.outcome).toBe("UNRESOLVED");
    if (result.outcome !== "UNRESOLVED") return;
    expect(result.trace.aggregateRule).toBe("UNKNOWN_STATE_IN_EVERY_WORLD");
    const predictive = result.trace.atoms.find((atom) => atom.key === "target.time_to_die");
    expect(predictive?.unknownNumberReason).toBe("PREDICTIVE_NOT_PLAYER_KNOWABLE");
  });

  it("subtracts, at the pinned precedence and associativity", () => {
    // Precedence 6, same level as `+`, looser than `*` (7) and tighter than a
    // comparison (4). Left-associative.
    expect(soleValue("remains<=20-6", { dotRemainsSeconds: knownNumber(14) })).toBe(true);
    expect(soleValue("remains<=20-6", { dotRemainsSeconds: knownNumber(14.001) })).toBe(false);
    // `20-2*3` is 14 under SimC precedence, and 54 if `-` bound tighter than `*`.
    expect(soleValue("remains<=20-2*3", { dotRemainsSeconds: knownNumber(14) })).toBe(true);
    expect(soleValue("remains<=20-2*3", { dotRemainsSeconds: knownNumber(14.001) })).toBe(false);
    // Left-associative: `20-6-4` is 10, not 18.
    expect(soleValue("remains<=20-6-4", { dotRemainsSeconds: knownNumber(10) })).toBe(true);
    expect(soleValue("remains<=20-6-4", { dotRemainsSeconds: knownNumber(10.001) })).toBe(false);
    // Mixed with `+`, still left to right: `20-6+4` is 18, not 10.
    expect(soleValue("remains<=20-6+4", { dotRemainsSeconds: knownNumber(18) })).toBe(true);
    expect(soleValue("remains<=20-6+4", { dotRemainsSeconds: knownNumber(18.001) })).toBe(false);
  });

  it("propagates an unknown through a subtraction rather than dropping it", () => {
    // The same rule `+` and `*` follow. An unestablished magnitude does not
    // become zero just because something was subtracted from it.
    const result = evaluate("remains<=20-6");
    expect(result.outcome).toBe("UNRESOLVED");
  });
});
