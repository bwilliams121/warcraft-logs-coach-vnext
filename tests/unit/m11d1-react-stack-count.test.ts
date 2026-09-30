import { describe, expect, it } from "vitest";

import { atomOf, reactStackAtomKey, type ExpressionNode } from "../../src/simc/expression/ast.js";
import {
  boundedBelowNumber,
  evaluateSimcExpression,
  knownNumber,
  oneOfNumbers,
  unknownNumber,
  type AtomBindings,
  type NumericBinding,
} from "../../src/simc/expression/evaluate.js";
import { isBuiltinIdentifier, parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  SpecVocabularyError,
  type SpecAtomVocabulary,
} from "../../src/simc/expression/spec-vocabulary.js";
import type { AplAction } from "../../src/simc/apl-authority.js";
import { selectWithinList, type ActionUsability } from "../../src/simc/list-selection.js";
import { syntheticAuthority } from "../support/m5a-authority.js";

/**
 * M11-D1-A — `buff.<name>.react` has STACK-COUNT semantics in a magnitude
 * position.
 *
 * THE DEFECT. Until M11-D1 every `.react` was a truth atom whose world value
 * is 0 or 1, so a numeric comparison like `buff.killing_machine.react=2` came
 * out FALSE in EVERY world — not UNKNOWN. A line the authority may well have
 * selected was silently eliminated, a lower line could become the definite
 * winner, and a player who pressed the higher action would be REJECTED.
 *
 * PINNED SEMANTICS (SimulationCraft 33622e9d1662ff0e451691edf85a6b49cc9d11d9):
 * the `react` expression evaluates `buff_t::stack_react()`
 * (engine/buff/buff.cpp:485-511), the current stack minus every stack whose
 * reaction time has not elapsed (buff.cpp:2004-2016). `0 <= react <= stack`.
 *
 * THE REAL EXPRESSION. Frost Death Knight, `single_target[0]`, verbatim from
 * engine/class_modules/apl/apl_death_knight.cpp:292 at the pin (file sha256
 * e381da691875ceecb8357a76e90fef9e01f3a200c67da7024deff1ca7f728df6, recorded in
 * agent/m11-a3-authority-audit.md §3):
 *
 *     obliterate,if=buff.killing_machine.react=2|(buff.killing_machine.react&rune>=3)
 *
 * Frost Death Knight is NOT onboarded. `rune` is not a built-in, so these
 * tests declare it in a TEST-ONLY vocabulary purely so the pinned condition
 * parses whole; nothing here is a Frost specialization binding.
 */

const FROST_OBLITERATE_CONDITION = "buff.killing_machine.react=2|(buff.killing_machine.react&rune>=3)";
const FROST_OBLITERATE_LINE = `obliterate,if=${FROST_OBLITERATE_CONDITION}`;
const REACT_COUNT_KEY = "buff.killing_machine.react#stack_react";
const REACT_TRUTH_KEY = "buff.killing_machine.react";

const TEST_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  "test/m11d1-react",
  [{ identifier: "rune", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false }],
  isBuiltinIdentifier,
);

function bindingsWith(options: {
  readonly killingMachineStack?: number | NumericBinding;
  readonly rune?: NumericBinding;
}): AtomBindings {
  return {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    dotRemainsSecondsByAction: [],
    knownBuffs: [],
    ...(options.killingMachineStack === undefined
      ? {}
      : { knownBuffStacks: [{ name: "killing_machine", stack: options.killingMachineStack }] }),
    specAtoms: {
      vocabulary: TEST_VOCABULARY,
      bound:
        options.rune === undefined
          ? []
          : [{ key: "rune", actionToken: null, value: { kind: "MAGNITUDE", binding: options.rune } }],
    },
  };
}

function astOf(source: string): ExpressionNode {
  const parsed = parseSimcExpression(source, TEST_VOCABULARY);
  if (!parsed.ok) throw new Error(`${source} was refused: ${parsed.reason} at ${parsed.fragment}`);
  return parsed.ast;
}

function evaluate(source: string, bindings: AtomBindings) {
  const result = evaluateSimcExpression(astOf(source), source, bindings);
  if (result.outcome === "UNSUPPORTED") throw new Error(`${source} was refused: ${result.reason}`);
  return result;
}

function truthOf(source: string, bindings: AtomBindings): "TRUE" | "FALSE" | "UNKNOWN_STATE" {
  const result = evaluate(source, bindings);
  if (result.outcome === "UNRESOLVED") return "UNKNOWN_STATE";
  return result.value ? "TRUE" : "FALSE";
}

describe("the pinned Frost DK Killing Machine condition parses into both roles of .react", () => {
  it("reads the comparison operand as a COUNT and the bare disjunct as a TRUTH", () => {
    const ast = astOf(FROST_OBLITERATE_CONDITION);
    expect(ast.kind).toBe("OR");
    if (ast.kind !== "OR") return;
    expect(ast.left.kind).toBe("COMPARISON");
    if (ast.left.kind !== "COMPARISON") return;
    expect(ast.left.left).toEqual({ kind: "BUFF_REACT_STACK", buffName: "killing_machine" });
    expect(atomOf(ast.left.left)).toEqual({ key: REACT_COUNT_KEY, shape: "NUMERIC", scope: "PLAYER_SCOPED" });
    expect(ast.right.kind).toBe("AND");
    if (ast.right.kind !== "AND") return;
    expect(ast.right.left).toEqual({ kind: "BUFF_REACT", buffName: "killing_machine" });
    expect(atomOf(ast.right.left)).toEqual({
      key: REACT_TRUTH_KEY,
      shape: "BOOLEAN",
      scope: "PLAYER_SCOPED",
    });
  });
});

describe("insufficient stack evidence never evaluates the pinned condition FALSE", () => {
  it("the numeric disjunct alone is UNKNOWN without a stack binding — the value that used to be FALSE", () => {
    const bindings = bindingsWith({});
    expect(truthOf("buff.killing_machine.react=2", bindings)).toBe("UNKNOWN_STATE");
    const atom = evaluate("buff.killing_machine.react=2", bindings).trace.atoms.find(
      (entry) => entry.key === REACT_COUNT_KEY,
    );
    expect(atom?.binding).toBe("UNKNOWN_NUMBER");
    expect(atom?.value).toBeNull();
    expect(atom?.unknownNumberReason).toBe("STATE_NOT_ESTABLISHED");
  });

  it("the whole condition is UNKNOWN when runes are short and Killing Machine is unestablished", () => {
    // THE regression. `rune>=3` is FALSE, so the second disjunct is FALSE in
    // every world; the pre-D1 evaluator also made `react=2` FALSE in every
    // world, so the whole line came out FALSE and Obliterate was eliminated.
    // With no stack evidence the count is unknown, and so is the line.
    const bindings = bindingsWith({ rune: knownNumber(2) });
    const result = evaluate(FROST_OBLITERATE_CONDITION, bindings);
    expect(result.outcome).toBe("UNRESOLVED");
    expect(result.trace.worlds.every((world) => world.result !== "TRUE")).toBe(true);
    expect(result.trace.worlds.some((world) => world.result === "UNKNOWN_STATE")).toBe(true);
  });

  it("is UNKNOWN, not TRUE, at exactly two stacks: a stack may not yet be reactable", () => {
    const bindings = bindingsWith({ killingMachineStack: 2, rune: knownNumber(2) });
    expect(truthOf("buff.killing_machine.react=2", bindings)).toBe("UNKNOWN_STATE");
    const atom = evaluate("buff.killing_machine.react=2", bindings).trace.atoms.find(
      (entry) => entry.key === REACT_COUNT_KEY,
    );
    expect(atom?.binding).toBe("ONE_OF");
    expect(atom?.oneOf).toEqual([0, 1, 2]);
    expect(truthOf(FROST_OBLITERATE_CONDITION, bindings)).toBe("UNKNOWN_STATE");
  });

  it("is UNKNOWN whenever two stacks remain possible (a set of stacks, or only a lower bound)", () => {
    expect(
      truthOf(
        "buff.killing_machine.react=2",
        bindingsWith({ killingMachineStack: oneOfNumbers([1, 2], "STATE_NOT_ESTABLISHED") }),
      ),
    ).toBe("UNKNOWN_STATE");
    expect(
      truthOf(
        "buff.killing_machine.react=2",
        bindingsWith({ killingMachineStack: boundedBelowNumber(2, "STATE_NOT_ESTABLISHED") }),
      ),
    ).toBe("UNKNOWN_STATE");
    expect(
      truthOf(
        "buff.killing_machine.react=2",
        bindingsWith({ killingMachineStack: unknownNumber("STATE_NOT_ESTABLISHED") }),
      ),
    ).toBe("UNKNOWN_STATE");
  });
});

describe("proven stack evidence still decides what it proves", () => {
  it("one exact stack proves react is at most one, so react=2 is FALSE", () => {
    const bindings = bindingsWith({ killingMachineStack: 1, rune: knownNumber(2) });
    expect(truthOf("buff.killing_machine.react=2", bindings)).toBe("FALSE");
    // The bare disjunct stays enumerated (react may be 0 or 1), and `rune>=3`
    // is FALSE, so the line is FALSE on evidence.
    expect(truthOf(FROST_OBLITERATE_CONDITION, bindings)).toBe("FALSE");
  });

  it("zero exact stacks is zero react in BOTH roles, whatever the runes", () => {
    const bindings = bindingsWith({ killingMachineStack: 0 });
    expect(truthOf(FROST_OBLITERATE_CONDITION, bindings)).toBe("FALSE");
    const trace = evaluate(FROST_OBLITERATE_CONDITION, bindings).trace;
    expect(trace.atoms.find((entry) => entry.key === REACT_COUNT_KEY)?.binding).toBe("KNOWN");
    expect(trace.atoms.find((entry) => entry.key === REACT_TRUTH_KEY)?.binding).toBe("KNOWN");
    expect(trace.atoms.find((entry) => entry.key === REACT_TRUTH_KEY)?.value).toBe(0);
  });

  it("a comparison every possible count agrees on is decided", () => {
    const bindings = bindingsWith({ killingMachineStack: 2 });
    expect(truthOf("buff.killing_machine.react<=2", bindings)).toBe("TRUE");
    expect(truthOf("buff.killing_machine.react>=3", bindings)).toBe("FALSE");
    expect(truthOf("buff.killing_machine.react>=1", bindings)).toBe("UNKNOWN_STATE");
  });
});

describe("the count is never enumerated and never a truth assignment", () => {
  it("contributes no world, so the only enumerated atom is the bare truth", () => {
    const result = evaluate(FROST_OBLITERATE_CONDITION, bindingsWith({ rune: knownNumber(4) }));
    const count = result.trace.atoms.find((entry) => entry.key === REACT_COUNT_KEY);
    expect(count?.shape).toBe("NUMERIC");
    expect(result.trace.worlds).toHaveLength(2);
    for (const world of result.trace.worlds) {
      expect(world.assignment.map((entry) => entry.atom)).toEqual([REACT_TRUTH_KEY]);
    }
  });

  it("reads .react as a count on either side of every magnitude operator", () => {
    const zero = bindingsWith({ killingMachineStack: 0 });
    expect(truthOf("2=buff.killing_machine.react", zero)).toBe("FALSE");
    expect(truthOf("buff.killing_machine.react*2>=1", zero)).toBe("FALSE");
    expect(truthOf("buff.killing_machine.react+1>=2", zero)).toBe("FALSE");
    expect(truthOf("3-buff.killing_machine.react<=2", zero)).toBe("FALSE");
    // Arithmetic on a set of possible counts refuses, exactly as for any set.
    expect(truthOf("buff.killing_machine.react*2>=1", bindingsWith({ killingMachineStack: 1 }))).toBe(
      "UNKNOWN_STATE",
    );
  });
});

describe("bare .react keeps its truth semantics", () => {
  it("is enumerated without stack evidence, as before M11-D1", () => {
    const result = evaluate("buff.killing_machine.react", bindingsWith({}));
    expect(result.outcome).toBe("UNRESOLVED");
    expect(result.trace.atoms).toEqual([
      expect.objectContaining({ key: REACT_TRUTH_KEY, shape: "BOOLEAN", binding: "UNRESOLVED_BOOLEAN" }),
    ]);
  });

  it("is still enumerated at a known non-zero stack: react may be zero until the reaction time elapses", () => {
    expect(truthOf("buff.killing_machine.react", bindingsWith({ killingMachineStack: 2 }))).toBe(
      "UNKNOWN_STATE",
    );
    expect(truthOf("!buff.killing_machine.react", bindingsWith({ killingMachineStack: 2 }))).toBe(
      "UNKNOWN_STATE",
    );
  });

  it("is FALSE only on an exact zero stack", () => {
    expect(truthOf("buff.killing_machine.react", bindingsWith({ killingMachineStack: 0 }))).toBe("FALSE");
    expect(truthOf("!buff.killing_machine.react", bindingsWith({ killingMachineStack: 0 }))).toBe("TRUE");
  });
});

describe("the count's key cannot be produced by any identifier", () => {
  it("is not a readable identifier", () => {
    expect(reactStackAtomKey("killing_machine")).toBe(REACT_COUNT_KEY);
    expect(parseSimcExpression(REACT_COUNT_KEY).ok).toBe(false);
  });

  it("cannot be declared by a specialization vocabulary", () => {
    expect(() =>
      defineSpecAtomVocabulary(
        "test/m11d1-react",
        [{ identifier: REACT_COUNT_KEY, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false }],
        isBuiltinIdentifier,
      ),
    ).toThrow(SpecVocabularyError);
  });
});

describe("a scan cannot fall through the pinned Obliterate line on missing stack evidence", () => {
  // The consequence that makes the defect dangerous: the pinned Obliterate
  // line sits at `single_target[0]` (apl_death_knight.cpp:292) above Howling
  // Blast (:293). The lower line is reduced to a player-scoped condition here
  // so that, when the higher line is eliminated, it is a definite winner.
  const authority = syntheticAuthority({
    lists: [
      { listName: "default", actions: ["call_action_list,name=single_target"] },
      { listName: "single_target", actions: [FROST_OBLITERATE_LINE, "howling_blast,if=buff.rime.up"] },
    ],
  });
  // Usability is not the question here: both actions are taken as usable, so
  // only the conditions decide the scan.
  const usable = (_action: AplAction): ActionUsability => "PROVEN_USABLE";
  const withRime = (bindings: AtomBindings): AtomBindings => ({
    ...bindings,
    knownBuffs: [{ name: "rime", up: true }],
  });

  it("does NOT select Howling Blast when Killing Machine's stack is unestablished", () => {
    const result = selectWithinList(
      authority,
      "single_target",
      withRime(bindingsWith({ rune: knownNumber(2) })),
      usable,
    );
    expect(result.kind).toBe("INDETERMINATE");
    if (result.kind !== "INDETERMINATE") return;
    expect(result.blocker).toBe("COMPETING_POSSIBLE_ACTION");
    expect(result.lines[0]?.actionToken).toBe("obliterate");
    expect(result.lines[0]?.outcome).toBe("POSSIBLE");
  });

  it("selects Howling Blast only when evidence proves Obliterate's line FALSE", () => {
    const result = selectWithinList(
      authority,
      "single_target",
      withRime(bindingsWith({ killingMachineStack: 1, rune: knownNumber(2) })),
      usable,
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("howling_blast");
    expect(result.lines[0]?.outcome).toBe("ELIMINATED");
  });
});
