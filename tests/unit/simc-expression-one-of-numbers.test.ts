/**
 * M11-B9: `ONE_OF_NUMBERS` — a magnitude that is exactly one of a finite set
 * of established exact values, the shape unresolved event ordering produces.
 *
 * Negative first: a comparison resolves only when EVERY member resolves it
 * the same way ({6,7} < 7 is UNRESOLVED, not "probably"); a truth only when
 * every member is zero or every member is non-zero ({0,1} is UNRESOLVED);
 * arithmetic over a set refuses; a set is never collapsed to its minimum or
 * maximum; a single distinct value is not a set; duplicates and order do not
 * change meaning; the trace reports the members and nothing else; a plain
 * number in `knownBuffStacks` is read exactly as it always was.
 */

import { describe, expect, it } from "vitest";

import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  evaluateSimcExpression,
  knownNumber,
  oneOfNumbers,
  unknownNumber,
  type AtomBindings,
} from "../../src/simc/expression/evaluate.js";

const NOT_MODELLED = unknownNumber("STATE_NOT_MODELLED");

function bindings(stacks: NonNullable<AtomBindings["knownBuffStacks"]>): AtomBindings {
  return {
    comboPoints: NOT_MODELLED,
    comboPointsDeficit: NOT_MODELLED,
    energyPct: NOT_MODELLED,
    knownBuffs: [],
    knownBuffStacks: stacks,
  };
}

function evaluate(expression: string, atoms: AtomBindings) {
  const parsed = parseSimcExpression(expression);
  if (!parsed.ok) throw new Error(`expected ${expression} to parse, got ${parsed.reason}`);
  return evaluateSimcExpression(parsed.ast, expression, atoms);
}

function truthOf(expression: string, atoms: AtomBindings): boolean | "UNRESOLVED" | "UNSUPPORTED" {
  const result = evaluate(expression, atoms);
  return result.outcome === "RESOLVED" ? result.value : result.outcome;
}

const set = (values: readonly number[]) =>
  bindings([{ name: "essence_of_the_blood_queen", stack: oneOfNumbers(values, "STATE_NOT_ESTABLISHED") }]);
const STACK = "buff.essence_of_the_blood_queen.stack";

describe("constructing a set", () => {
  it("sorts and deduplicates, so two sets with the same content are one representation", () => {
    expect(oneOfNumbers([6, 5, 6], "STATE_NOT_ESTABLISHED")).toEqual({
      state: "ONE_OF_NUMBERS",
      values: [5, 6],
      reason: "STATE_NOT_ESTABLISHED",
    });
    expect(oneOfNumbers([5, 6], "STATE_NOT_ESTABLISHED")).toEqual(
      oneOfNumbers([6, 5, 5], "STATE_NOT_ESTABLISHED"),
    );
  });

  it("a single distinct value is not a set: it is that value, KNOWN", () => {
    expect(oneOfNumbers([7, 7], "STATE_NOT_ESTABLISHED")).toEqual(knownNumber(7));
    expect(oneOfNumbers([3], "STATE_NOT_ESTABLISHED")).toEqual(knownNumber(3));
  });

  it("an empty set is a programming error, not an unknown", () => {
    expect(() => oneOfNumbers([], "STATE_NOT_ESTABLISHED")).toThrow();
  });
});

describe("comparisons decide only when every member agrees", () => {
  it.each([
    ["{5,6} < 7", [5, 6], `${STACK}<7`, true],
    ["{4,5} < 7", [4, 5], `${STACK}<7`, true],
    ["{6,7} < 7", [6, 7], `${STACK}<7`, "UNRESOLVED"],
    ["{7,8} < 7", [7, 8], `${STACK}<7`, false],
    ["{1,2} >= 1", [1, 2], `${STACK}>=1`, true],
    ["{0,1} >= 1", [0, 1], `${STACK}>=1`, "UNRESOLVED"],
    ["{5,6} <= 6", [5, 6], `${STACK}<=6`, true],
    ["{5,6} <= 5", [5, 6], `${STACK}<=5`, "UNRESOLVED"],
    ["{5,6} > 4", [5, 6], `${STACK}>4`, true],
    ["{5,6} > 5", [5, 6], `${STACK}>5`, "UNRESOLVED"],
    ["{5,6} = 5", [5, 6], `${STACK}=5`, "UNRESOLVED"],
    ["{5,6} = 9", [5, 6], `${STACK}=9`, false],
    ["{0,1} = 0 negated", [0, 1], `!(${STACK}=0)`, "UNRESOLVED"],
    ["{2,3} = 1 negated (the != the parser does not accept)", [2, 3], `!(${STACK}=1)`, true],
  ])("%s", (_label, values, expression, expected) => {
    expect(truthOf(expression, set(values))).toBe(expected);
  });

  it("the mirror operand order decides the same: 7 > {5,6} is TRUE, 7 > {6,7} is UNRESOLVED", () => {
    expect(truthOf(`7>${STACK}`, set([5, 6]))).toBe(true);
    expect(truthOf(`7>${STACK}`, set([6, 7]))).toBe("UNRESOLVED");
    expect(truthOf(`6<=${STACK}`, set([6, 7]))).toBe(true);
  });

  it("never collapses to the minimum or the maximum: {5,7} < 6 is UNRESOLVED although both a lower and an upper bound would each decide something", () => {
    expect(truthOf(`${STACK}<6`, set([5, 7]))).toBe("UNRESOLVED");
    expect(truthOf(`${STACK}>6`, set([5, 7]))).toBe("UNRESOLVED");
    // And nothing between the members is admitted: {5,7} = 6 is FALSE for every member.
    expect(truthOf(`${STACK}=6`, set([5, 7]))).toBe(false);
  });

  it("a set against a set, or against a bound, is UNRESOLVED", () => {
    const two = bindings([
      { name: "a", stack: oneOfNumbers([1, 2], "STATE_NOT_ESTABLISHED") },
      { name: "b", stack: oneOfNumbers([3, 4], "STATE_NOT_ESTABLISHED") },
    ]);
    // Every member of a is below every member of b, and still UNRESOLVED: no
    // set-against-set rule exists, because no pinned expression needs one.
    expect(truthOf("buff.a.stack<buff.b.stack", two)).toBe("UNRESOLVED");
  });
});

describe("truthiness", () => {
  it("{1,2} is TRUE, {0,1} is UNRESOLVED, and a set is never read as a bare zero", () => {
    expect(truthOf(STACK, set([1, 2]))).toBe(true);
    expect(truthOf(STACK, set([0, 1]))).toBe("UNRESOLVED");
    expect(truthOf(`!${STACK}`, set([0, 1]))).toBe("UNRESOLVED");
  });

  it("Kleene logic composes with it: FALSE & {0,1} is FALSE, TRUE | {0,1} is TRUE", () => {
    const withBuff = { ...set([0, 1]), knownBuffs: [{ name: "gift", up: false }] };
    expect(truthOf(`buff.gift.up&${STACK}`, withBuff)).toBe(false);
    expect(truthOf(`!buff.gift.up|${STACK}`, withBuff)).toBe(true);
  });
});

describe("arithmetic refuses", () => {
  it.each([`${STACK}+1<8`, `${STACK}*2<14`, `8-${STACK}>0`, `${STACK}+${STACK}<12`])(
    "%s is UNRESOLVED",
    (expression) => {
      expect(truthOf(expression, set([5, 6]))).toBe("UNRESOLVED");
    },
  );
});

describe("the trace", () => {
  it("reports the members, sorted, in their own field, with no value and no bound", () => {
    const result = evaluate(`${STACK}<7`, set([6, 5]));
    expect(result.outcome).toBe("RESOLVED");
    if (result.outcome === "UNSUPPORTED") throw new Error("unsupported");
    expect(result.trace.atoms).toEqual([
      {
        key: STACK,
        shape: "NUMERIC",
        binding: "ONE_OF",
        value: null,
        atLeast: null,
        unknownNumberReason: "STATE_NOT_ESTABLISHED",
        oneOf: [5, 6],
      },
    ]);
  });

  it("a plain-number stack traces exactly as before, with no set field at all", () => {
    const result = evaluate(`${STACK}<7`, bindings([{ name: "essence_of_the_blood_queen", stack: 6 }]));
    if (result.outcome === "UNSUPPORTED") throw new Error("unsupported");
    expect(result.outcome).toBe("RESOLVED");
    expect(result.trace.atoms).toEqual([
      {
        key: STACK,
        shape: "NUMERIC",
        binding: "KNOWN",
        value: 6,
        atLeast: null,
        unknownNumberReason: null,
      },
    ]);
    expect(JSON.stringify(result.trace.atoms[0])).not.toContain("oneOf");
  });

  it("a KNOWN_NUMBER binding in the stack seam is read as the number", () => {
    expect(
      truthOf(`${STACK}<7`, bindings([{ name: "essence_of_the_blood_queen", stack: knownNumber(6) }])),
    ).toBe(true);
    expect(
      truthOf(`${STACK}<7`, bindings([{ name: "essence_of_the_blood_queen", stack: knownNumber(7) }])),
    ).toBe(false);
  });

  it("an absent stack is still UNRESOLVED and never zero", () => {
    expect(truthOf(`${STACK}<7`, bindings([]))).toBe("UNRESOLVED");
  });
});
