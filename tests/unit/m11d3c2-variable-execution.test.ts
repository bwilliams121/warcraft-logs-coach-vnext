/**
 * M11-D3-C2: generic `variable` execution inside the authority scan.
 *
 * PINNED SEMANTICS (SimulationCraft 33622e9d; see `src/simc/variable-execution.ts`):
 *
 *     a ready variable line executes inline and the scan CONTINUES
 *     (player.cpp:14235-14241); a FALSE `if=` skips it; values live on the
 *     PLAYER and persist between scans — only an iteration reset restores the
 *     default — so a read before this scan's assignment sees an earlier scan's
 *     value, which this project does not have: UNKNOWN, never 0
 *
 * Modelled: `set`, `setif`, `reset`. Anything else that changes a value makes
 * it UNKNOWN; nothing about an unknown value refuses the scan.
 *
 * The central invariant, as before: uncertainty is UNKNOWN, never REJECTED.
 */

import { describe, expect, it } from "vitest";

import type { ExecutionLane } from "../../src/data/game/ability-gcd-semantics.js";
import {
  compareObservedAction,
  type ComparisonOutcome,
  type ObservedRotationalDecision,
} from "../../src/findings/observed-comparison.js";
import { provenUsable, type ActionUsabilityVerdict } from "../../src/simc/action-applicability.js";
import { loadAplAuthority, type AplAction } from "../../src/simc/apl-authority.js";
import {
  initialScanVariables,
  joinNumericBindings,
  knownNumber,
  oneOfNumbers,
  unknownNumber,
  withScanVariable,
  type AtomBindings,
  type NumericBinding,
  type ScanVariables,
} from "../../src/simc/expression/evaluate.js";
import { isBuiltinIdentifier, parseSimcExpression } from "../../src/simc/expression/parse.js";
import { defineSpecAtomVocabulary, type SpecAtomValue } from "../../src/simc/expression/spec-vocabulary.js";
import {
  firstGcdSelectionAcrossRescans,
  type NonGcdTransitionOutcome,
  type RotationalGcdResult,
} from "../../src/simc/first-gcd-selection.js";
import { evaluateCondition } from "../../src/simc/list-selection.js";
import {
  resolveOneForegroundScan,
  selectAcrossLists,
  type TraversalResult,
  type TraversalStep,
} from "../../src/simc/nested-selection.js";
import { executeVariableLine } from "../../src/simc/variable-execution.js";
import { syntheticArtifact, syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: knownNumber(0),
  energyPct: knownNumber(100),
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
};

const P_TRUE = "combo_points>=5";
const P_FALSE = "combo_points<5";
/** Supported syntax, never bound: an undecided condition. */
const UNDECIDED = "buff.foo.up";
/** Supported syntax whose MAGNITUDE is never known. */
const UNKNOWN_VALUE = "fight_remains";

const GCD = ["y", "z", "w"];

function actionOf(line: string): AplAction {
  const loaded = loadAplAuthority(syntheticArtifact({ lists: [{ listName: "default", actions: [line] }] }));
  if (!loaded.ok) throw new Error(loaded.detail);
  const lookup = loaded.authority.actionsInList("default");
  const [action] = lookup.found ? lookup.actions : [];
  if (action === undefined) throw new Error("no action");
  return action;
}

/** Executes one line the way the traversal does: its own `if=` under the same bindings. */
function execute(
  line: string,
  state: ScanVariables = initialScanVariables(),
  bindings: AtomBindings = BINDINGS,
) {
  const action = actionOf(line);
  const withState: AtomBindings = { ...bindings, scanVariables: state };
  return executeVariableLine(action, evaluateCondition(action, withState), withState, state);
}

const scan = (lists: readonly SyntheticListSpec[], bindings: AtomBindings = BINDINGS): TraversalResult =>
  selectAcrossLists({
    authority: syntheticAuthority({ lists: lists as SyntheticListSpec[] }),
    entryListName: "default",
    bindings,
    usabilityFor: () => provenUsable(),
  });
const one = (actions: readonly string[]) => [{ listName: "default", actions }];

function firstGcd(
  lists: readonly SyntheticListSpec[],
  bindings: AtomBindings = BINDINGS,
): RotationalGcdResult {
  const authority = syntheticAuthority({ lists: lists as SyntheticListSpec[] });
  const usability =
    (disabled: readonly string[]) =>
    (action: AplAction): ActionUsabilityVerdict =>
      disabled.includes(action.actionToken)
        ? {
            kind: "PROVEN_UNUSABLE",
            reason: "SIMULATED_PREFIX_EXECUTION",
            evidence: {
              abilityGameId: null,
              itemId: null,
              provenRemainingAtLeastMs: null,
              cooldownToleranceMs: null,
              detail: "synthetic: fired earlier in this branch",
            },
          }
        : provenUsable();
  return firstGcdSelectionAcrossRescans<readonly string[]>({
    rootListName: "default",
    initialState: [],
    stateKey: (state) => [...state].sort().join(","),
    scanFor: (state) =>
      resolveOneForegroundScan({
        authority,
        entryListName: "default",
        bindings,
        usabilityFor: usability(state),
      }),
    laneFor: (step: TraversalStep): ExecutionLane =>
      GCD.includes(step.actionToken) ? "GCD_CONSUMING" : "NON_GCD",
    transitionFor: (action, state): NonGcdTransitionOutcome<readonly string[]> => ({
      kind: "APPLIED",
      nextState: [...state, action.actionToken],
      timeAdvanceMs: 0,
      evidence: { kind: "SYNTHETIC", provenance: "synthetic test", stateKeyBefore: "", stateKeyAfter: "" },
    }),
  });
}

function compared(result: RotationalGcdResult, observedToken: string): ComparisonOutcome {
  const decision: ObservedRotationalDecision = {
    position: 0,
    locator: {} as ObservedRotationalDecision["locator"],
    actorId: 1,
    abilityGameId: 1,
    observedToken,
    reportTimeMs: 0,
    fightTimeMs: 0,
    targetActorId: null,
  };
  return compareObservedAction({
    decision,
    authorityResult: result,
    observedActionJudgment: null,
    usabilityProvenance: "OBSERVED_EXECUTION",
  }).outcome;
}

const selected = (result: TraversalResult) => (result.kind === "SELECTED" ? result.actionToken : result.kind);
const at = (step: { readonly listName: string; readonly priorityOrdinal: number } | null | undefined) =>
  step === null || step === undefined ? null : `${step.listName}[${String(step.priorityOrdinal)}]`;
const stepAt = (result: { readonly steps: readonly TraversalStep[] }, label: string) =>
  result.steps.find((step) => at(step) === label);

function expectNeverConfident(result: RotationalGcdResult, label: string): void {
  expect(result.kind, label).toBe("ROTATIONAL_GCD_UNKNOWN");
  for (const observed of ["y", "z", "w", "variable"])
    expect(compared(result, observed), `${label} ${observed}`).toBe("UNKNOWN");
}

/** A specialization vocabulary declaring one `variable.<name>`. */
const vocabularyOf = (identifier: string, shape: "NUMERIC" | "BOOLEAN") =>
  defineSpecAtomVocabulary(
    "test/c2",
    [{ identifier, shape, scope: "PLAYER_SCOPED", selfAddressing: false }],
    isBuiltinIdentifier,
  );

/** Bindings whose spec declared `identifier` and seeded it with `value` (`null`: declared, never bound). */
const seeded = (
  identifier: string,
  shape: "NUMERIC" | "BOOLEAN",
  value: SpecAtomValue | null,
): AtomBindings => ({
  ...BINDINGS,
  specAtoms: {
    vocabulary: vocabularyOf(identifier, shape),
    bound: value === null ? [] : [{ key: identifier, actionToken: null, value }],
  },
});
const initialMagnitude = (binding: NumericBinding): SpecAtomValue => ({ kind: "MAGNITUDE", binding });

// ---------------------------------------------------------------------------
// One line, executed
// ---------------------------------------------------------------------------

describe("executing one variable line", () => {
  it("set: the value expression's magnitude, under the line's own if=", () => {
    expect(execute("variable,name=x,value=3").record).toEqual({
      kind: "ASSIGNED",
      name: "x",
      operation: "SET",
      executed: "PROVEN",
      value: knownNumber(3),
    });
    expect(execute("variable,name=x,op=set,value=combo_points+1").state.values.get("x")).toEqual(
      knownNumber(8),
    );
    // A truth stays the number SimulationCraft stores: 0 or 1.
    expect(execute(`variable,name=x,value=${P_TRUE}`).state.values.get("x")).toEqual(knownNumber(1));
    // An unresolved truth is either: one of { 0, 1 }, never a guess.
    expect(execute(`variable,name=x,value=${UNDECIDED}`).state.values.get("x")).toEqual(
      oneOfNumbers([0, 1], "STATE_NOT_ESTABLISHED"),
    );
  });

  it("an unsupported or unknown value is UNKNOWN — a value, not a refusal", () => {
    expect(execute(`variable,name=x,value=${UNKNOWN_VALUE}`).state.values.get("x")?.state).toBe(
      "UNKNOWN_NUMBER",
    );
    expect(execute("variable,name=x,value=spell_targets.fan_of_knives").state.values.get("x")?.state).toBe(
      "UNKNOWN_NUMBER",
    );
    expect(execute("variable,name=x,value=combo_points%2").state.values.get("x")?.state).toBe(
      "UNKNOWN_NUMBER",
    );
  });

  it("setif: value or value_else by the condition, and their join when it is undecided", () => {
    expect(
      execute(`variable,name=x,op=setif,value=1,value_else=0,condition=${P_TRUE}`).state.values.get("x"),
    ).toEqual(knownNumber(1));
    expect(
      execute(`variable,name=x,op=setif,value=1,value_else=0,condition=${P_FALSE}`).state.values.get("x"),
    ).toEqual(knownNumber(0));
    expect(
      execute(`variable,name=x,op=setif,value=1,value_else=0,condition=${UNDECIDED}`).state.values.get("x"),
    ).toEqual(oneOfNumbers([0, 1], "STATE_NOT_ESTABLISHED"));
  });

  it("reset: the line's default=, else 0", () => {
    expect(execute("variable,name=x,op=reset").state.values.get("x")).toEqual(knownNumber(0));
    expect(execute("variable,name=x,op=reset,default=3").state.values.get("x")).toEqual(knownNumber(3));
  });

  it("if= FALSE leaves the value as it was; if= undecided joins it with the assignment", () => {
    const prior = withScanVariable(initialScanVariables(), "x", knownNumber(1));
    expect(execute(`variable,name=x,value=3,if=${P_FALSE}`, prior)).toMatchObject({
      record: { kind: "CONDITION_FALSE", name: "x" },
      state: { values: new Map([["x", knownNumber(1)]]) },
    });
    expect(execute(`variable,name=x,value=3,if=${UNDECIDED}`, prior).state.values.get("x")).toEqual(
      oneOfNumbers([1, 3], "STATE_NOT_ESTABLISHED"),
    );
    // Undecided over the UNKNOWN incoming value: UNKNOWN.
    expect(execute(`variable,name=x,value=3,if=${UNDECIDED}`).state.values.get("x")?.state).toBe(
      "UNKNOWN_NUMBER",
    );
  });

  it("every operation not modelled makes the variable UNKNOWN, never a refusal", () => {
    const prior = withScanVariable(initialScanVariables(), "x", knownNumber(1));
    for (const line of [
      "variable,name=x,op=add,value=1",
      "variable,name=x,op=sub,value=1",
      "variable,name=x,op=max,value=4",
      "variable,name=x,op=floor",
      "cycling_variable,name=x,op=add,value=1",
      "variable,name=x,value=3,delay=2",
      // RE-POINTED at M11-D3-C3: `line_cd=` on a variable is pinned to change
      // nothing (the timer is never started), so it executes; a MALFORMED one
      // is still not modelled. See tests/unit/m11d3c3-line-cd.test.ts.
      "variable,name=x,value=3,line_cd=soon",
    ]) {
      const result = execute(line, prior);
      expect(result.record.kind, line).toBe("NOT_MODELLED");
      expect(result.state.values.get("x")?.state, line).toBe("UNKNOWN_NUMBER");
    }
  });

  it("pinned inert lines change nothing; a malformed one taints every variable", () => {
    expect(execute("variable,value=3").record).toEqual({ kind: "INERT", reason: "NO_NAME" });
    expect(execute("variable,name=x,op=print").record).toEqual({ kind: "INERT", reason: "PRINT" });
    const malformed = execute("variable,name=x,value=3,name=y");
    expect(malformed.record).toMatchObject({ kind: "NOT_MODELLED", reason: "MALFORMED_LINE" });
    expect(malformed.state.tainted).toBe(true);
  });

  it("writes every variable, whoever else reads it: the built-in single_target, or a spec-declared one", () => {
    // REVISED at the C2 review: a declaration or a built-in is a way of
    // READING the variable, never a suppression of the APL's write.
    const builtIn = execute("variable,name=single_target,value=1");
    expect(builtIn.record).toEqual({
      kind: "ASSIGNED",
      name: "single_target",
      operation: "SET",
      executed: "PROVEN",
      value: knownNumber(1),
    });
    expect(builtIn.state.values.get("single_target")).toEqual(knownNumber(1));
    const declared = execute("variable,name=declared,value=1", initialScanVariables(), {
      ...BINDINGS,
      specAtoms: {
        vocabulary: vocabularyOf("variable.declared", "BOOLEAN"),
        bound: [{ key: "variable.declared", actionToken: null, value: { kind: "TRUTH", value: false } }],
      },
    });
    expect(declared.record).toMatchObject({ kind: "ASSIGNED", name: "declared", executed: "PROVEN" });
    expect(declared.state.values.get("declared")).toEqual(knownNumber(1));
  });

  it("matches names case-insensitively, as SimulationCraft does", () => {
    expect(execute("variable,name=X,value=3").state.values.get("x")).toEqual(knownNumber(3));
    const parsed = parseSimcExpression("variable.X>2");
    expect(parsed.ok && parsed.ast).toMatchObject({ left: { kind: "VARIABLE_READ", name: "x" } });
  });
});

describe("joining two worlds' values", () => {
  it("keeps only what holds in both", () => {
    expect(joinNumericBindings(knownNumber(3), knownNumber(3))).toEqual(knownNumber(3));
    expect(joinNumericBindings(knownNumber(1), knownNumber(3))).toEqual(
      oneOfNumbers([1, 3], "STATE_NOT_ESTABLISHED"),
    );
    expect(joinNumericBindings(knownNumber(1), unknownNumber("STATE_NOT_ESTABLISHED")).state).toBe(
      "UNKNOWN_NUMBER",
    );
  });
});

// ---------------------------------------------------------------------------
// Reads in the scan
// ---------------------------------------------------------------------------

describe("reads see the walk's own assignments", () => {
  it("assignment then read: the exact value decides the line", () => {
    expect(selected(scan(one(["variable,name=x,value=3", "y,if=variable.x>2", "z"])))).toBe("y");
    expect(selected(scan(one(["variable,name=x,value=1", "y,if=variable.x>2", "z"])))).toBe("z");
  });

  it("read before the first assignment: the incoming value is an earlier scan's — UNKNOWN, not 0", () => {
    const result = scan(one(["y,if=variable.x>2", "variable,name=x,value=3", "z"]));
    expect(result.kind).toBe("UNKNOWN");
    expect(stepAt(result, "default[0]")?.outcome).toBe("MAY_SELECT");
    // Not read as zero: `variable.x=0` is not TRUE either.
    expect(scan(one(["y,if=variable.x=0", "z"])).kind).toBe("UNKNOWN");
  });

  it("a conditional assignment not taken keeps the prior value — known only if this scan set it", () => {
    expect(
      selected(
        scan(
          one(["variable,name=x,value=1", `variable,name=x,value=3,if=${P_FALSE}`, "y,if=variable.x>2", "z"]),
        ),
      ),
    ).toBe("z");
    expect(scan(one([`variable,name=x,value=3,if=${P_FALSE}`, "y,if=variable.x>2", "z"])).kind).toBe(
      "UNKNOWN",
    );
  });

  it("repeated assignment: the last one is read", () => {
    expect(
      selected(scan(one(["variable,name=x,value=1", "variable,name=x,value=3", "y,if=variable.x>2", "z"]))),
    ).toBe("y");
    expect(
      selected(scan(one(["variable,name=x,value=3", "variable,name=x,value=1", "y,if=variable.x>2", "z"]))),
    ).toBe("z");
  });

  it("G: an unknown value overwritten by an exact one reads exact", () => {
    expect(
      selected(
        scan(
          one([
            `variable,name=x,value=${UNKNOWN_VALUE}`,
            "variable,name=x,value=3",
            "y,if=variable.x>2",
            "z",
          ]),
        ),
      ),
    ).toBe("y");
  });

  it("H: an exact value overwritten by an unknown one reads UNKNOWN", () => {
    const lists = one([
      "variable,name=x,value=3",
      `variable,name=x,value=${UNKNOWN_VALUE}`,
      "y,if=variable.x>2",
      "z",
    ]);
    expect(scan(lists).kind).toBe("UNKNOWN");
    expectNeverConfident(firstGcd(lists), "H");
  });

  it("a variable line is never the selection, and the scan continues past it", () => {
    const result = scan(one(["variable,name=x,value=3", "y"]));
    expect(selected(result)).toBe("y");
    expect(stepAt(result, "default[0]")).toMatchObject({
      outcome: "VARIABLE_EXECUTED_CONTINUE",
      variableExecution: { kind: "ASSIGNED", name: "x" },
    });
  });

  it("a spec's binding of a variable it declared is only its initial value: the APL's later write wins", () => {
    // REVISED at the C2 review (this asserted `y` — the binding over the write).
    const bindings = seeded("variable.declared", "BOOLEAN", { kind: "TRUTH", value: true });
    // Before any write, the initial value is read.
    expect(selected(scan(one(["y,if=variable.declared", "z"]), bindings))).toBe("y");
    // After the write, the write.
    expect(
      selected(scan(one(["variable,name=declared,value=0", "y,if=variable.declared", "z"]), bindings)),
    ).toBe("z");
  });
});

// ---------------------------------------------------------------------------
// Worlds: A–F
// ---------------------------------------------------------------------------

describe("variable state is branch-local", () => {
  it("A: an assignment in a run's speculative TRUE world never reaches the FALSE world", () => {
    const lists = [
      {
        listName: "default",
        actions: [
          "variable,name=x,value=1",
          `run_action_list,name=child,if=${UNDECIDED}`,
          "y,if=variable.x>2",
          "z",
        ],
      },
      { listName: "child", actions: ["variable,name=x,value=3", "w,if=variable.x>2"] },
    ];
    const raw = resolveOneForegroundScan({
      authority: syntheticAuthority({ lists }),
      entryListName: "default",
      bindings: BINDINGS,
      usabilityFor: () => provenUsable(),
    });
    // The TRUE world reads its own 3; the FALSE world still reads 1.
    const explored = raw.kind === "BLOCKED" ? raw.explored?.steps : raw.steps;
    expect(explored?.find((step) => at(step) === "child[1]")?.outcome).toBe("SELECTED");
    expect(explored?.find((step) => at(step) === "default[2]")?.outcome).toBe("ELIMINATED_CONTINUE");
    // And the two worlds (w, z) disagree: UNKNOWN at the gate, never REJECTED.
    expectNeverConfident(firstGcd(lists), "A");
  });

  it("B: conditional-assignment worlds that agree converge on one token", () => {
    const lists = one([
      "variable,name=x,value=5",
      `variable,name=x,value=3,if=${UNDECIDED}`,
      "y,if=variable.x>2",
      "z",
    ]);
    expect(selected(scan(lists))).toBe("y");
    const query = firstGcd(lists);
    expect(query.kind === "ROTATIONAL_GCD_SELECTED" && query.actionToken).toBe("y");
    expect(compared(query, "y")).toBe("MATCH");
  });

  it("C: conditional-assignment worlds that disagree stay UNKNOWN", () => {
    const lists = one([
      "variable,name=x,value=1",
      `variable,name=x,value=3,if=${UNDECIDED}`,
      "y,if=variable.x>2",
      "z",
    ]);
    expect(scan(lists).kind).toBe("UNKNOWN");
    expectNeverConfident(firstGcd(lists), "C");
  });

  it("D: a call's assignments carry on to the caller; under an undecided gate the caller reads both worlds", () => {
    const callee = { listName: "a", actions: ["variable,name=x,value=3"] };
    expect(
      selected(
        scan([
          { listName: "default", actions: ["call_action_list,name=a", "y,if=variable.x>2", "z"] },
          callee,
        ]),
      ),
    ).toBe("y");
    // Undecided call over the UNKNOWN incoming value: UNKNOWN.
    expect(
      scan([
        {
          listName: "default",
          actions: [`call_action_list,name=a,if=${UNDECIDED}`, "y,if=variable.x>2", "z"],
        },
        callee,
      ]).kind,
    ).toBe("UNKNOWN");
    // Undecided call where both worlds agree: { 5, 3 } is > 2 either way.
    expect(
      selected(
        scan([
          {
            listName: "default",
            actions: [
              "variable,name=x,value=5",
              `call_action_list,name=a,if=${UNDECIDED}`,
              "y,if=variable.x>2",
              "z",
            ],
          },
          callee,
        ]),
      ),
    ).toBe("y");
  });

  it("E: a run's child reads its own assignments; a skipped run writes nothing", () => {
    const child = { listName: "child", actions: ["variable,name=x,value=3", "w,if=variable.x>2"] };
    expect(
      selected(scan([{ listName: "default", actions: ["run_action_list,name=child", "y"] }, child])),
    ).toBe("w");
    expect(
      selected(
        scan([
          {
            listName: "default",
            actions: [
              "variable,name=x,value=1",
              `run_action_list,name=child,if=${P_FALSE}`,
              "y,if=variable.x>2",
              "z",
            ],
          },
          child,
        ]),
      ),
    ).toBe("z");
  });

  it("F: no variable state crosses a rescan, so no two variable states can be confused as one", () => {
    // Every scan starts from the UNKNOWN incoming value; the first-GCD state
    // key is the spec's alone. Here the assignment precedes the read, so each
    // rescan re-establishes it and the answer is exact.
    const assigned = firstGcd(one(["variable,name=x,value=3", "non_gcd_a", "y,if=variable.x>2", "z"]));
    expect(assigned.kind === "ROTATIONAL_GCD_SELECTED" && assigned.actionToken).toBe("y");
    // Here the read precedes the assignment. SimulationCraft's rescan would see
    // the earlier scan's 3; this project does not carry it, so the answer is
    // UNKNOWN — conservative, never a wrong token.
    const readFirst = firstGcd(one(["y,if=variable.x>2", "variable,name=x,value=3", "non_gcd_a", "z"]));
    expectNeverConfident(readFirst, "F");
    // The list-cycle guard is unchanged by variable lines.
    expect(
      scan([
        { listName: "default", actions: ["variable,name=x,value=1", "call_action_list,name=a"] },
        { listName: "a", actions: ["variable,name=x,value=2", "call_action_list,name=default"] },
      ]),
    ).toMatchObject({ kind: "UNKNOWN", blocker: "CONTROL_FLOW_CYCLE" });
  });
});

// ---------------------------------------------------------------------------
// Read precedence (C2 review): this scan's assignment, else the initial value,
// else UNKNOWN. One value per name; the later write wins.
// ---------------------------------------------------------------------------

describe("read precedence: the scan's assignment, else the spec's initial value, else UNKNOWN", () => {
  const seededX = (value: SpecAtomValue | null) => seeded("variable.x", "NUMERIC", value);

  it("A: initial 1, then set x=5: the read is 5", () => {
    const bindings = seededX(initialMagnitude(knownNumber(1)));
    // The initial value alone.
    expect(selected(scan(one(["y,if=variable.x>2", "z"]), bindings))).toBe("z");
    const lists = one(["variable,name=x,value=5", "y,if=variable.x>2", "z"]);
    expect(selected(scan(lists, bindings))).toBe("y");
    const query = firstGcd(lists, bindings);
    expect(query.kind === "ROTATIONAL_GCD_SELECTED" && query.actionToken).toBe("y");
    expect(compared(query, "y")).toBe("MATCH");
    // The same for a truth-shaped declaration.
    const truth = seeded("variable.x", "BOOLEAN", { kind: "TRUTH", value: false });
    expect(selected(scan(one(["variable,name=x,value=1", "y,if=variable.x", "z"]), truth))).toBe("y");
  });

  it("B: initial 5, then an UNKNOWN assignment: the read is UNKNOWN, never the stale 5", () => {
    const bindings = seededX(initialMagnitude(knownNumber(5)));
    expect(selected(scan(one(["y,if=variable.x>2", "z"]), bindings))).toBe("y");
    const lists = one([`variable,name=x,value=${UNKNOWN_VALUE}`, "y,if=variable.x>2", "z"]);
    expect(scan(lists, bindings).kind).toBe("UNKNOWN");
    expectNeverConfident(firstGcd(lists, bindings), "B");
    const truth = seeded("variable.x", "BOOLEAN", { kind: "TRUTH", value: true });
    const truthLists = one([`variable,name=x,value=${UNKNOWN_VALUE}`, "y,if=variable.x", "z"]);
    expect(scan(truthLists, truth).kind).toBe("UNKNOWN");
    expectNeverConfident(firstGcd(truthLists, truth), "B truth");
  });

  it("C: initial UNKNOWN, then exact 3: the read is 3", () => {
    for (const bindings of [seededX(null), seededX(initialMagnitude(unknownNumber("STATE_NOT_MODELLED")))]) {
      expect(scan(one(["y,if=variable.x>2", "z"]), bindings).kind).toBe("UNKNOWN");
      expect(selected(scan(one(["variable,name=x,value=3", "y,if=variable.x>2", "z"]), bindings))).toBe("y");
    }
  });

  it("D: an assignment before a branch, a branch-local overwrite: the sibling keeps the pre-branch value", () => {
    const bindings = seededX(initialMagnitude(knownNumber(1)));
    const lists = [
      {
        listName: "default",
        actions: [
          "variable,name=x,value=5",
          `run_action_list,name=child,if=${UNDECIDED}`,
          "y,if=variable.x>2",
          "z",
        ],
      },
      { listName: "child", actions: ["variable,name=x,value=0", "y,if=variable.x<1"] },
    ];
    // Both worlds choose y ONLY if the FALSE world reads the pre-branch 5:
    // not the child's 0, not the initial 1.
    const query = firstGcd(lists, bindings);
    expect(query.kind === "ROTATIONAL_GCD_TOKEN_CONVERGED" && query.actionToken).toBe("y");
    expect(compared(query, "y")).toBe("MATCH");
    // The control: with no pre-branch assignment the sibling reads the initial 1.
    const control = [
      {
        listName: "default",
        actions: [`run_action_list,name=child,if=${UNDECIDED}`, "y,if=variable.x>2", "z"],
      },
      { listName: "child", actions: ["variable,name=x,value=0", "y,if=variable.x<1"] },
    ];
    expectNeverConfident(firstGcd(control, bindings), "D control");
  });

  it("E: a certain call's write is what the caller reads", () => {
    const bindings = seededX(initialMagnitude(knownNumber(1)));
    const lists = [
      { listName: "default", actions: ["call_action_list,name=a", "y,if=variable.x>2", "z"] },
      { listName: "a", actions: ["variable,name=x,value=3"] },
    ];
    expect(selected(scan(lists, bindings))).toBe("y");
  });

  it("F: an undecided call joins the callee's write with the caller's initial value", () => {
    const callee = (value: number) => ({
      listName: "a",
      actions: [`variable,name=x,value=${String(value)}`],
    });
    const caller = {
      listName: "default",
      actions: [`call_action_list,name=a,if=${UNDECIDED}`, "y,if=variable.x>2", "z"],
    };
    // { 1, 3 } straddles 2: UNKNOWN, never the initial 1 alone (z), never 3 alone (y).
    const straddling = [caller, callee(3)];
    const initialOne = seededX(initialMagnitude(knownNumber(1)));
    expect(scan(straddling, initialOne).kind).toBe("UNKNOWN");
    expectNeverConfident(firstGcd(straddling, initialOne), "F");
    // { 5, 3 } agree.
    expect(selected(scan(straddling, seededX(initialMagnitude(knownNumber(5)))))).toBe("y");
    // { 5, 0 } straddle again.
    expect(scan([caller, callee(0)], seededX(initialMagnitude(knownNumber(5)))).kind).toBe("UNKNOWN");
  });

  it("G: a run's TRUE child write is not seen by the FALSE continuation", () => {
    const bindings = seededX(initialMagnitude(knownNumber(1)));
    const lists = [
      {
        listName: "default",
        actions: [`run_action_list,name=child,if=${UNDECIDED}`, "y,if=variable.x>2", "z"],
      },
      { listName: "child", actions: ["variable,name=x,value=3", "w,if=variable.x>2"] },
    ];
    const raw = resolveOneForegroundScan({
      authority: syntheticAuthority({ lists }),
      entryListName: "default",
      bindings,
      usabilityFor: () => provenUsable(),
    });
    const explored = raw.kind === "BLOCKED" ? raw.explored?.steps : raw.steps;
    expect(explored?.find((step) => at(step) === "child[1]")?.outcome).toBe("SELECTED");
    // The FALSE continuation reads the initial 1, not the child's 3.
    expect(explored?.find((step) => at(step) === "default[1]")?.outcome).toBe("ELIMINATED_CONTINUE");
    expectNeverConfident(firstGcd(lists, bindings), "G");
  });

  it("H: reset restores the line's default= (0 when absent), as pinned, whatever the initial value", () => {
    const bindings = seededX(initialMagnitude(knownNumber(5)));
    expect(execute("variable,name=x,op=reset", initialScanVariables(), bindings).record).toMatchObject({
      kind: "ASSIGNED",
      operation: "RESET",
      value: knownNumber(0),
    });
    expect(selected(scan(one(["variable,name=x,op=reset", "y,if=variable.x=0", "z"]), bindings))).toBe("y");
    expect(
      selected(scan(one(["variable,name=x,op=reset,default=4", "y,if=variable.x=4", "z"]), bindings)),
    ).toBe("y");
    // An undecided reset leaves both worlds: the initial 5, or 0.
    const undecided = execute(`variable,name=x,op=reset,if=${UNDECIDED}`, initialScanVariables(), bindings);
    expect(undecided.state.values.get("x")).toEqual(oneOfNumbers([0, 5], "STATE_NOT_ESTABLISHED"));
  });

  it("no declaration disables a write: every shape and initial value yields to the executed assignment", () => {
    const initials: readonly (SpecAtomValue | null)[] = [
      null,
      { kind: "TRUTH", value: true },
      { kind: "TRUTH", value: false },
      initialMagnitude(knownNumber(9)),
      initialMagnitude(unknownNumber("STATE_NOT_MODELLED")),
    ];
    for (const shape of ["NUMERIC", "BOOLEAN"] as const) {
      for (const initial of initials) {
        if (shape === "NUMERIC" && initial?.kind === "TRUTH") continue;
        const bindings = seeded("variable.x", shape, initial);
        const read = shape === "NUMERIC" ? "variable.x>2" : "variable.x";
        const label = `${shape} ${JSON.stringify(initial)}`;
        expect(selected(scan(one(["variable,name=x,value=3", `y,if=${read}`, "z"]), bindings)), label).toBe(
          "y",
        );
        expect(selected(scan(one(["variable,name=x,value=0", `y,if=${read}`, "z"]), bindings)), label).toBe(
          "z",
        );
      }
    }
  });
});

describe("the built-in variable.single_target is the same variable the APL writes", () => {
  it("an exact write decides it; no write, or a write that does not decide its truth, stays enumerated", () => {
    expect(
      selected(scan(one(["variable,name=single_target,value=1", "y,if=variable.single_target", "z"]))),
    ).toBe("y");
    expect(
      selected(scan(one(["variable,name=single_target,value=0", "y,if=variable.single_target", "z"]))),
    ).toBe("z");
    expect(scan(one(["y,if=variable.single_target", "z"])).kind).toBe("UNKNOWN");
    expect(
      scan(one([`variable,name=single_target,value=${UNKNOWN_VALUE}`, "y,if=variable.single_target", "z"]))
        .kind,
    ).toBe("UNKNOWN");
    // { 0, 1 } does not decide the truth; { 2, 3 } does.
    expect(
      scan(
        one([
          "variable,name=single_target,value=0",
          `variable,name=single_target,value=1,if=${UNDECIDED}`,
          "y,if=variable.single_target",
          "z",
        ]),
      ).kind,
    ).toBe("UNKNOWN");
    expect(
      selected(
        scan(
          one([
            "variable,name=single_target,value=2",
            `variable,name=single_target,value=3,if=${UNDECIDED}`,
            "y,if=variable.single_target",
            "z",
          ]),
        ),
      ),
    ).toBe("y");
  });

  it("in a magnitude position it is the generic number read", () => {
    expect(
      selected(scan(one(["variable,name=single_target,value=1", "y,if=variable.single_target*2>1", "z"]))),
    ).toBe("y");
    expect(scan(one(["y,if=variable.single_target*2>1", "z"])).kind).toBe("UNKNOWN");
  });
});

describe("no false REJECTED", () => {
  it("an undecided variable condition, an unknown value, divergent worlds and an unmodelled operation never REJECT", () => {
    const cases: readonly (readonly [string, readonly string[]])[] = [
      ["undecided if=", [`variable,name=x,value=3,if=${UNDECIDED}`, "y,if=variable.x>2", "z"]],
      ["unknown value", [`variable,name=x,value=${UNKNOWN_VALUE}`, "y,if=variable.x>2", "z"]],
      [
        "divergent worlds",
        ["variable,name=x,value=1", `variable,name=x,value=3,if=${UNDECIDED}`, "y,if=variable.x>2", "z"],
      ],
      [
        "unmodelled operation",
        ["variable,name=x,value=3", "variable,name=x,op=add,value=1", "y,if=variable.x>2", "z"],
      ],
      ["unsupported value syntax", ["variable,name=x,value=combo_points%2", "y,if=variable.x>2", "z"]],
    ];
    for (const [label, actions] of cases) expectNeverConfident(firstGcd(one(actions)), label);
  });
});
