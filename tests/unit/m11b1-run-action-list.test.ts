/**
 * M11-B1: generic `run_action_list` control flow in the nested traversal.
 *
 * THE CONTRACT, pinned against the SimulationCraft sources at the project's
 * pinned commit (`33622e9d`):
 *
 *   FALSE gate        the run entry is not ready (player.cpp:14235) — skipped,
 *                     the parent continues at its next ordinal
 *   certain gate      the run entry is RETURNED as the selected action
 *                     (player.cpp:14264-14267: it is not ACTION_CALL, so it is
 *                     "anything else"); it executes at zero time by activating
 *                     the child (action.cpp:4740-4754); the next selection is
 *                     over the CHILD (player.cpp:7376-7377) and the parent is
 *                     restored only afterwards (player.cpp:7382-7386). So the
 *                     parent's later entries are never part of this selection,
 *                     and a child that selects nothing is a selection of NOTHING
 *   undecided gate    fail closed: `UNDECIDED_RUN_GATE`. Neither world was
 *                     explored in M11-B1. Since M11-D3-A both are, and only a
 *                     result every world agrees on replaces the gate; when
 *                     they disagree the stop, the reported trace and the
 *                     blocker are exactly the ones pinned here (see
 *                     `m11d3a-undecided-run-action-list.test.ts`)
 *
 * And the distinction that must never blur: `call_action_list` is
 * ACTION_CALL, whose "callee returned nothing" branch falls through to the
 * caller's next ordinal (player.cpp:14255-14260). A run has no such branch.
 *
 * Every authority here is synthetic and every premise is stated in the case:
 * `combo_points=7` makes one condition definitely TRUE and one definitely
 * FALSE; `fight_remains<15` is supported syntax whose value is never bound;
 * `active_dot.x>1` is syntax the parser refuses whole.
 */

import { describe, expect, it } from "vitest";

import {
  resolveOneForegroundScan,
  selectAcrossLists,
  TRAVERSAL_BLOCKERS,
  type OneForegroundScanResult,
  type TraversalResult,
  type TraversalStep,
} from "../../src/simc/nested-selection.js";
import {
  firstGcdSelectionAcrossRescans,
  type NonGcdTransitionOutcome,
  type RotationalGcdResult,
  type SelectedNonGcdAction,
} from "../../src/simc/first-gcd-selection.js";
import { classifyDecision } from "../../src/simc/decision-coverage.js";
import {
  provenUsable,
  unknownUsability,
  type ActionUsabilityVerdict,
} from "../../src/simc/action-applicability.js";
import { knownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import type { ExecutionLane } from "../../src/data/game/ability-gcd-semantics.js";
import { loadAplAuthority, type AplAction } from "../../src/simc/apl-authority.js";
import { PUBLIC_DECISION_BLOCKER_CLASSES } from "../../src/contracts/analysis-contract.js";
import { defineSpecAtomVocabulary } from "../../src/simc/expression/spec-vocabulary.js";
import { isBuiltinIdentifier } from "../../src/simc/expression/parse.js";
import { syntheticArtifact, syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: knownNumber(0),
  energyPct: knownNumber(100),
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
};

const TRUE_COND = "combo_points>=5";
const FALSE_COND = "combo_points<5";
/** Supported syntax whose VALUE is unknown — an undecided gate, not a refused one. */
const UNKNOWN_COND = "fight_remains<15";
/** Syntax the shared parser refuses whole (target-count family). */
const UNSUPPORTED_COND = "active_dot.garrote>1";

function usabilityByToken(usable: readonly string[]) {
  return (action: AplAction): ActionUsabilityVerdict =>
    usable.includes(action.actionToken) ? provenUsable() : unknownUsability();
}

function traverse(lists: readonly SyntheticListSpec[], usable: readonly string[] = []): TraversalResult {
  const authority = syntheticAuthority({ lists: lists as SyntheticListSpec[] });
  return selectAcrossLists({
    authority,
    entryListName: "default",
    bindings: BINDINGS,
    usabilityFor: usabilityByToken(usable),
  });
}

/** `list[ordinal]` for every visited step, in visit order. */
function visited(result: { readonly steps: readonly TraversalStep[] }): readonly string[] {
  return result.steps.map((step) => `${step.listName}[${String(step.priorityOrdinal)}]`);
}

function outcomeAt(result: { readonly steps: readonly TraversalStep[] }, listName: string, ordinal: number) {
  return result.steps.find((step) => step.listName === listName && step.priorityOrdinal === ordinal)?.outcome;
}

// ==========================================================================
// 1. Basic run semantics
// ==========================================================================

describe("a run_action_list whose gate is proven FALSE is skipped", () => {
  it("does not enter the child and the parent continues at its next ordinal", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${FALSE_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
    expect(visited(result)).toEqual(["default[0]", "default[1]"]);
    expect(outcomeAt(result, "default", 0)).toBe("RUN_GATE_FALSE_SKIPPED");
  });
});

describe("a run_action_list whose gate is certain transfers selection into the child", () => {
  it("TRUE gate: the child's definite entry is the answer, with the run on its path", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${TRUE_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(result.selectingStep.path.map((entry) => entry.listName)).toEqual(["default", "child"]);
    expect(outcomeAt(result, "default", 0)).toBe("RUN_ENTERED_SCAN_ENDS");
    // The parent's later entry was never visited — not eliminated, not a
    // candidate, simply outside this selection.
    expect(visited(result)).toEqual(["default[0]", "child[0]"]);
  });

  it("unconditional run: the same, with an UNCONDITIONAL gate on the step", () => {
    const result = traverse(
      [
        { listName: "default", actions: ["run_action_list,name=child", `mutilate,if=${TRUE_COND}`] },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(result.steps[0]?.gate.kind).toBe("UNCONDITIONAL");
  });

  it("child NO_ACTION: the scan result is NO_ACTION and the parent's later entries are NOT considered", () => {
    // THE critical contract. `mutilate` is TRUE and proven usable; a call
    // would have fallen through to it. A run does not.
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${TRUE_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`envenom,if=${FALSE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("NO_ACTION_SELECTED");
    expect(visited(result)).toEqual(["default[0]", "child[0]"]);
    expect(outcomeAt(result, "default", 0)).toBe("RUN_RETURNED_NO_ACTION_SCAN_ENDS");
    expect(outcomeAt(result, "child", 0)).toBe("ELIMINATED_CONTINUE");
  });

  it("child NO_ACTION with an EMPTY child list is the same NO_ACTION", () => {
    const result = traverse(
      [
        { listName: "default", actions: ["run_action_list,name=child", `mutilate,if=${TRUE_COND}`] },
        { listName: "child", actions: [] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("NO_ACTION_SELECTED");
    expect(visited(result)).toEqual(["default[0]"]);
  });

  it("child BLOCKED: the child's blocker propagates, at the child's entry", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${TRUE_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`envenom,if=${UNSUPPORTED_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
    expect(result.blockedAt?.listName).toBe("child");
    expect(outcomeAt(result, "default", 0)).toBe("BLOCKED");
    expect(visited(result)).toEqual(["default[0]", "child[0]"]);
  });

  it("child MAY_SELECT: the child's possibilities are the ONLY candidates; nothing below the run competes", () => {
    // `envenom` is TRUE but its usability is unknown, so it MIGHT fire. In the
    // world where it does not, the selection is NOTHING — not `mutilate`.
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${TRUE_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("NO_DEFINITE_WINNER");
    expect(result.blockedAt?.listName).toBe("child");
    expect(visited(result)).toEqual(["default[0]", "child[0]"]);
  });
});

describe("a run_action_list whose gate cannot be decided blocks", () => {
  it("undecided gate: UNDECIDED_RUN_GATE at the run entry; later parent entries are not in the reported trace", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${UNKNOWN_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNDECIDED_RUN_GATE");
    expect(result.blockedAt?.listName).toBe("default");
    expect(result.blockedAt?.priorityOrdinal).toBe(0);
    expect(result.blockedAt?.gate.kind).toBe("EVALUATED");
    expect(visited(result)).toEqual(["default[0]"]);
  });

  it("unreadable gate: UNSUPPORTED_AUTHORITY_EXPRESSION at the run entry, never read as false", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${UNSUPPORTED_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
    expect(result.blockedAt?.priorityOrdinal).toBe(0);
    expect(visited(result)).toEqual(["default[0]"]);
  });

  it("an unsupported option on the run entry refuses before the gate is read", () => {
    // Arms' pinned execute dispatch carries `target_if=` on a run entry. No
    // option key was admitted for run entries in M11-B1.
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`run_action_list,name=child,target_if=min:target.health.pct,if=${TRUE_COND}`, "mutilate"],
        },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_ACTION_OPTION");
    expect(result.blockedAt?.targetingRefusal?.kind).toBe("REFUSED");
    expect(visited(result)).toEqual(["default[0]"]);
  });

  it("an undecided run gate is not laundered when a proven entry sits below it", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${UNKNOWN_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [] },
      ],
      ["mutilate"],
    );
    // Even though the child is EMPTY — which for a CALL would make the gate
    // irrelevant (both worlds continue) — a run's TRUE world selects NOTHING
    // and its FALSE world selects mutilate. The worlds disagree; blocked.
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNDECIDED_RUN_GATE");
  });
});

// ==========================================================================
// 2. call_action_list and run_action_list are different constructs
// ==========================================================================

describe("call_action_list and run_action_list differ exactly where the pinned loop differs", () => {
  const parentThenChild = (dispatch: string, child: readonly string[]): readonly SyntheticListSpec[] => [
    { listName: "default", actions: [dispatch, `mutilate,if=${TRUE_COND}`] },
    { listName: "child", actions: child },
  ];

  it("callee returns nothing -> the caller CONTINUES; run child returns nothing -> NOTHING", () => {
    const call = traverse(parentThenChild("call_action_list,name=child", [`envenom,if=${FALSE_COND}`]), [
      "mutilate",
    ]);
    const run = traverse(parentThenChild("run_action_list,name=child", [`envenom,if=${FALSE_COND}`]), [
      "mutilate",
    ]);
    expect(call.kind).toBe("SELECTED");
    if (call.kind === "SELECTED") expect(call.actionToken).toBe("mutilate");
    expect(outcomeAt(call, "default", 0)).toBe("CALL_RETURNED_NO_ACTION_CONTINUE");

    expect(run.kind).toBe("NO_ACTION_SELECTED");
    expect(outcomeAt(run, "default", 0)).toBe("RUN_RETURNED_NO_ACTION_SCAN_ENDS");
  });

  it("callee MIGHT fire -> the caller's later entry competes; run child MIGHT fire -> it does not", () => {
    const call = traverse(parentThenChild("call_action_list,name=child", [`envenom,if=${TRUE_COND}`]), [
      "mutilate",
    ]);
    const run = traverse(parentThenChild("run_action_list,name=child", [`envenom,if=${TRUE_COND}`]), [
      "mutilate",
    ]);
    // Call: envenom (possible) and mutilate (definite) both stand; something
    // fires, which one is undecided.
    expect(call.kind).toBe("UNKNOWN");
    if (call.kind === "UNKNOWN") expect(call.blocker).toBe("COMPETING_POSSIBLE_ACTION");
    expect(visited(call)).toEqual(["default[0]", "child[0]", "default[1]"]);
    // Run: envenom or nothing. mutilate was never visited.
    expect(run.kind).toBe("UNKNOWN");
    if (run.kind === "UNKNOWN") expect(run.blocker).toBe("NO_DEFINITE_WINNER");
    expect(visited(run)).toEqual(["default[0]", "child[0]"]);
  });

  it("both select the callee's definite entry when it fires — the same answer, different outcomes", () => {
    const call = traverse(parentThenChild("call_action_list,name=child", [`envenom,if=${TRUE_COND}`]), [
      "envenom",
      "mutilate",
    ]);
    const run = traverse(parentThenChild("run_action_list,name=child", [`envenom,if=${TRUE_COND}`]), [
      "envenom",
      "mutilate",
    ]);
    expect(call.kind).toBe("SELECTED");
    expect(run.kind).toBe("SELECTED");
    expect(outcomeAt(call, "default", 0)).toBe("CALL_SELECTED");
    expect(outcomeAt(run, "default", 0)).toBe("RUN_ENTERED_SCAN_ENDS");
  });

  it("an undecided gate above an EMPTY callee is harmless for a call and blocking for a run", () => {
    const call = traverse(parentThenChild(`call_action_list,name=child,if=${UNKNOWN_COND}`, []), [
      "mutilate",
    ]);
    const run = traverse(parentThenChild(`run_action_list,name=child,if=${UNKNOWN_COND}`, []), ["mutilate"]);
    expect(call.kind).toBe("SELECTED");
    expect(run.kind).toBe("UNKNOWN");
    if (run.kind === "UNKNOWN") expect(run.blocker).toBe("UNDECIDED_RUN_GATE");
  });
});

// ==========================================================================
// 3. Priority
// ==========================================================================

describe("priority around a run entry", () => {
  it("an entry ABOVE the run still wins normally; the child is never visited", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`envenom,if=${TRUE_COND}`, `run_action_list,name=child,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`mutilate,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(visited(result)).toEqual(["default[0]"]);
  });

  it("a possible entry above a certain run stays AHEAD of the child's candidates", () => {
    // envenom might fire (TRUE, usability unknown); if it did not, the run
    // transfers and the child's proven mutilate fires. Something fires;
    // which is undecided; the earliest obstacle is envenom, not the child.
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`envenom,if=${TRUE_COND}`, `run_action_list,name=child,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`mutilate,if=${TRUE_COND}`] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("COMPETING_POSSIBLE_ACTION");
    expect(result.blockedAt?.listName).toBe("default");
    expect(result.blockedAt?.priorityOrdinal).toBe(0);
  });

  it("a possible entry above a certain run into an EMPTY child is 'that entry or nothing'", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`envenom,if=${TRUE_COND}`, "run_action_list,name=child", "mutilate"],
        },
        { listName: "child", actions: [] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    // NOT COMPETING_POSSIBLE_ACTION: nothing is proven to fire, because in the
    // world where envenom does not, the run transfers into an empty list.
    expect(result.blocker).toBe("NO_DEFINITE_WINNER");
    expect(visited(result)).toEqual(["default[0]", "default[1]"]);
  });

  it("a FALSE run gate preserves the parent's later priority order exactly", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [
            `run_action_list,name=child,if=${FALSE_COND}`,
            `envenom,if=${TRUE_COND}`,
            `mutilate,if=${TRUE_COND}`,
          ],
        },
        { listName: "child", actions: [`garrote,if=${TRUE_COND}`] },
      ],
      ["garrote", "envenom", "mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(visited(result)).toEqual(["default[0]", "default[1]"]);
  });

  it("a TRUE run gate prevents every later parent entry from being considered, even a proven one", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [
            `run_action_list,name=child,if=${TRUE_COND}`,
            `envenom,if=${TRUE_COND}`,
            `mutilate,if=${TRUE_COND}`,
          ],
        },
        { listName: "child", actions: [`garrote,if=${TRUE_COND}`] },
      ],
      ["garrote", "envenom", "mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("garrote");
    expect(visited(result)).toEqual(["default[0]", "child[0]"]);
  });
});

// ==========================================================================
// 4. Nesting: run -> run, call -> run, run -> call
// ==========================================================================

describe("nesting", () => {
  it("run -> run: selection transfers twice; the path keeps both runs", () => {
    const result = traverse(
      [
        { listName: "default", actions: ["run_action_list,name=a", "mutilate"] },
        { listName: "a", actions: ["run_action_list,name=b", "garrote"] },
        { listName: "b", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate", "garrote"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(result.selectingStep.path.map((entry) => entry.listName)).toEqual(["default", "a", "b"]);
    expect(visited(result)).toEqual(["default[0]", "a[0]", "b[0]"]);
  });

  it("run -> run with an empty innermost child: NOTHING, and neither parent resumes", () => {
    const result = traverse(
      [
        { listName: "default", actions: ["run_action_list,name=a", "mutilate"] },
        { listName: "a", actions: ["run_action_list,name=b", "garrote"] },
        { listName: "b", actions: [] },
      ],
      ["mutilate", "garrote"],
    );
    expect(result.kind).toBe("NO_ACTION_SELECTED");
    expect(visited(result)).toEqual(["default[0]", "a[0]"]);
  });

  it("call -> run: a run reached inside a callee ends the WHOLE selection, not just the callee", () => {
    // The call returns the run action (player.cpp:14255-14260 returns whatever
    // the callee selected); the run executes; the next selection is over `b`.
    // The caller's `mutilate` is never part of it.
    const selected = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=a", `mutilate,if=${TRUE_COND}`] },
        { listName: "a", actions: ["run_action_list,name=b"] },
        { listName: "b", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(selected.kind).toBe("SELECTED");
    if (selected.kind === "SELECTED") expect(selected.actionToken).toBe("envenom");
    expect(outcomeAt(selected, "default", 0)).toBe("CALL_TRANSFERRED_SCAN_ENDS");

    const nothing = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=a", `mutilate,if=${TRUE_COND}`] },
        { listName: "a", actions: ["run_action_list,name=b"] },
        { listName: "b", actions: [] },
      ],
      ["mutilate"],
    );
    // A callee that TRANSFERRED and found nothing is not a callee that fell
    // off its end: the caller does not continue to mutilate.
    expect(nothing.kind).toBe("NO_ACTION_SELECTED");
    expect(outcomeAt(nothing, "default", 0)).toBe("CALL_TRANSFERRED_SCAN_ENDS");
    expect(visited(nothing)).toEqual(["default[0]", "a[0]"]);
  });

  it("call -> run under an UNDECIDED call gate keeps the stop at the call gate when the worlds disagree", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`call_action_list,name=a,if=${UNKNOWN_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "a", actions: ["run_action_list,name=b"] },
        { listName: "b", actions: [] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNDECIDED_CALL_GATE_OVER_RUN");
    expect(result.blockedAt?.listName).toBe("default");
    expect(result.blockedAt?.priorityOrdinal).toBe(0);
    expect(visited(result)).toEqual(["default[0]", "a[0]"]);
  });

  it("run -> call: a call inside the run's child behaves as a call within that child", () => {
    // Inside `a`, the call returns nothing and `a` continues to garrote — the
    // call's own fall-through rule, unchanged. The run above still ended
    // `default`'s walk: mutilate is never visited.
    const result = traverse(
      [
        { listName: "default", actions: ["run_action_list,name=a", `mutilate,if=${TRUE_COND}`] },
        { listName: "a", actions: ["call_action_list,name=b", `garrote,if=${TRUE_COND}`] },
        { listName: "b", actions: [`envenom,if=${FALSE_COND}`] },
      ],
      ["garrote", "mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("garrote");
    expect(outcomeAt(result, "a", 0)).toBe("CALL_RETURNED_NO_ACTION_CONTINUE");
    expect(visited(result)).toEqual(["default[0]", "a[0]", "b[0]", "a[1]"]);
  });
});

// ==========================================================================
// 5. Cycle safety — the existing active-stack guard, unchanged
// ==========================================================================

describe("cycles through run lists fail closed under the existing guard", () => {
  it("a self-referential run list", () => {
    const result = traverse([{ listName: "default", actions: ["run_action_list,name=default"] }]);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("CONTROL_FLOW_CYCLE");
  });

  it("mutually recursive run lists", () => {
    const result = traverse([
      { listName: "default", actions: ["run_action_list,name=a"] },
      { listName: "a", actions: ["run_action_list,name=default"] },
    ]);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("CONTROL_FLOW_CYCLE");
  });

  it("a mixed call/run cycle", () => {
    const result = traverse([
      { listName: "default", actions: ["call_action_list,name=a"] },
      { listName: "a", actions: ["run_action_list,name=b"] },
      { listName: "b", actions: ["call_action_list,name=default"] },
    ]);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("CONTROL_FLOW_CYCLE");
  });

  it("two SIBLING runs are not a cycle, and only the first is ever reached", () => {
    const result = traverse(
      [
        { listName: "default", actions: ["run_action_list,name=child", "run_action_list,name=child"] },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom"],
    );
    expect(result.kind).toBe("SELECTED");
    expect(visited(result)).toEqual(["default[0]", "child[0]"]);
  });

  it("a run to a list the artifact does not contain is a hole, not an empty list", () => {
    const result = traverse(
      [{ listName: "default", actions: ["run_action_list,name=missing", "mutilate"] }],
      ["mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("CALLED_LIST_ABSENT");
  });
});

// ==========================================================================
// 6. Trace / provenance
// ==========================================================================

describe("the new outcomes and blockers are internal, deterministic and spec-free", () => {
  it("is deterministic across two identical traversals", () => {
    const lists: readonly SyntheticListSpec[] = [
      { listName: "default", actions: [`run_action_list,name=child,if=${UNKNOWN_COND}`, "mutilate"] },
      { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
    ];
    expect(JSON.stringify(traverse(lists, ["envenom"]))).toBe(JSON.stringify(traverse(lists, ["envenom"])));
  });

  it("names both new blockers in the exported vocabulary, and none of them names a class or spec", () => {
    expect(TRAVERSAL_BLOCKERS).toContain("UNDECIDED_RUN_GATE");
    expect(TRAVERSAL_BLOCKERS).toContain("UNDECIDED_CALL_GATE_OVER_RUN");
    for (const blocker of TRAVERSAL_BLOCKERS) {
      expect(blocker).not.toMatch(/paladin|rogue|death_?knight|blood|warrior|monk|hunter|druid/i);
    }
  });

  it("never becomes a public blocker class: the public enum is unchanged and the classifier is total", () => {
    // The public contract knows classes, not engine blockers. A decision
    // blocked by an undecided run gate classifies like any undecided gate —
    // by the permanent atoms on its line, else as missing observed state —
    // and the public vocabulary did not grow.
    expect([...PUBLIC_DECISION_BLOCKER_CLASSES]).toEqual([
      "OBSERVED_STATE_MISSING",
      "DIVERGENT_WORLDS",
      "TARGET_COUNT",
      "PREDICTIVE_STATE",
      "TARGETING_NOT_MODELLED",
      "USABILITY_NOT_PROVEN",
      "OTHER",
    ]);
    const blockedOnTargetCount = firstGcd({
      lists: [
        { listName: "default", actions: ["run_action_list,name=child,if=active_enemies>=2", "gcd_x"] },
        { listName: "child", actions: ["gcd_y"] },
      ],
      gcdTokens: ["gcd_x", "gcd_y"],
      usableTokens: ["gcd_x", "gcd_y"],
      vocabulary: { active_enemies: "NUMERIC" },
    });
    expect(blockedOnTargetCount.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    const classified = classifyDecision(blockedOnTargetCount);
    expect(classified.coverage).toBe("UNKNOWN");
    expect(classified.rawBlocker).toBe("ONE_SCAN_BLOCKED/UNDECIDED_RUN_GATE");
    expect(classified.blockerClass).toBe("TARGET_COUNT");

    const blockedOnState = firstGcd({
      lists: [
        { listName: "default", actions: [`run_action_list,name=child,if=${UNKNOWN_COND}`, "gcd_x"] },
        { listName: "child", actions: ["gcd_y"] },
      ],
      gcdTokens: ["gcd_x", "gcd_y"],
      usableTokens: ["gcd_x", "gcd_y"],
    });
    expect(classifyDecision(blockedOnState).blockerClass).toBe("PREDICTIVE_STATE");
  });
});

// ==========================================================================
// 7. First-GCD / root restart goes through the same rule
// ==========================================================================

/**
 * A minimal copy of the first-GCD harness shape used by
 * `simc-first-gcd-selection.test.ts`: every scan is the SAME
 * `resolveOneForegroundScan`, so a run list met after a NON_GCD transition and
 * a root restart is read by exactly the code under test above. Nothing here
 * re-interprets a run entry.
 */
interface SyntheticState {
  readonly disabled: readonly string[];
}

function stateKey(state: SyntheticState): string {
  return [...state.disabled].sort().join(",");
}

interface FirstGcdOptions {
  readonly lists: readonly SyntheticListSpec[];
  readonly gcdTokens: readonly string[];
  readonly usableTokens: readonly string[];
  readonly scanLog?: string[];
  /** Extra identifiers admitted through the spec-vocabulary seam, never bound. */
  readonly vocabulary?: Readonly<Record<string, "NUMERIC" | "BOOLEAN">>;
}

function firstGcd(options: FirstGcdOptions): RotationalGcdResult {
  const authority = syntheticAuthority({ lists: options.lists as SyntheticListSpec[] });
  const bindings: AtomBindings =
    options.vocabulary === undefined
      ? BINDINGS
      : {
          ...BINDINGS,
          specAtoms: {
            vocabulary: vocabularyOf(options.vocabulary),
            bound: [],
          },
        };

  const scanFor = (state: SyntheticState): OneForegroundScanResult => {
    options.scanLog?.push(stateKey(state));
    return resolveOneForegroundScan({
      authority,
      entryListName: "default",
      bindings,
      usabilityFor: (action: AplAction): ActionUsabilityVerdict => {
        if (state.disabled.includes(action.actionToken)) {
          return {
            kind: "PROVEN_UNUSABLE",
            reason: "STATIC_READY_FALSE",
            evidence: {
              abilityGameId: null,
              itemId: null,
              provenRemainingAtLeastMs: null,
              cooldownToleranceMs: null,
              detail: "synthetic: disabled by a prior transition",
            },
          };
        }
        return options.usableTokens.includes(action.actionToken) ? provenUsable() : unknownUsability();
      },
    });
  };

  const laneFor = (step: TraversalStep): ExecutionLane =>
    options.gcdTokens.includes(step.actionToken) ? "GCD_CONSUMING" : "NON_GCD";

  const transitionFor = (
    action: SelectedNonGcdAction,
    state: SyntheticState,
  ): NonGcdTransitionOutcome<SyntheticState> => {
    const nextState = { disabled: [...state.disabled, action.actionToken] };
    return {
      kind: "APPLIED",
      nextState,
      timeAdvanceMs: 0,
      evidence: {
        kind: "SYNTHETIC_SELF_DISABLE",
        provenance: "synthetic test",
        stateKeyBefore: stateKey(state),
        stateKeyAfter: stateKey(nextState),
      },
    };
  };

  return firstGcdSelectionAcrossRescans<SyntheticState>({
    rootListName: "default",
    initialState: { disabled: [] },
    stateKey,
    scanFor,
    laneFor,
    transitionFor,
  });
}

function vocabularyOf(declarations: Readonly<Record<string, "NUMERIC" | "BOOLEAN">>) {
  // Built through the real seam so the parser admits the identifier; the value
  // is never bound, which is what leaves the gate undecided.
  return defineSpecAtomVocabulary(
    "synthetic/test",
    Object.entries(declarations).map(([identifier, shape]) => ({
      identifier,
      shape,
      scope: "PLAYER_SCOPED" as const,
      selfAddressing: false,
    })),
    isBuiltinIdentifier,
  );
}

describe("the first-GCD query reads a run list through the one shared rule", () => {
  it("a NON_GCD action selected inside a run child transitions, restarts at the ROOT, and re-enters the run", () => {
    // Scan 1: default[0] run -> child[0] non_gcd_a fires (NON_GCD). Transition
    // disables it. Scan 2 restarts at the ROOT `default`, meets the same run
    // entry, transfers again, and child[1] gcd_x is the rotational GCD. The
    // root's `gcd_z` below the run is never a candidate on either scan.
    const scanLog: string[] = [];
    const result = firstGcd({
      lists: [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${TRUE_COND}`, `gcd_z,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`non_gcd_a,if=${TRUE_COND}`, `gcd_x,if=${TRUE_COND}`] },
      ],
      gcdTokens: ["gcd_x", "gcd_z"],
      usableTokens: ["non_gcd_a", "gcd_x", "gcd_z"],
      scanLog,
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.actionToken).toBe("gcd_x");
    expect(
      result.nonGcdPrefix.possibleActions.map(
        (entry) => `${entry.listName}[${String(entry.priorityOrdinal)}]`,
      ),
    ).toEqual(["child[0]"]);
    expect(scanLog).toEqual(["", "non_gcd_a"]);
  });

  it("a run child that selects nothing after the restart is NO_ACTION for the query, not gcd_z", () => {
    const result = firstGcd({
      lists: [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${TRUE_COND}`, `gcd_z,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`non_gcd_a,if=${TRUE_COND}`] },
      ],
      gcdTokens: ["gcd_z"],
      usableTokens: ["non_gcd_a", "gcd_z"],
    });
    // After non_gcd_a fires and is disabled, the restart's scan transfers into
    // a child with no ready entry. That selection is NOTHING; the root's gcd_z
    // is not fallen through to.
    expect(result.kind).toBe("NO_ROTATIONAL_GCD_SELECTED");
  });

  it("an undecided run gate blocks the query with the engine's own blocker carried verbatim", () => {
    const result = firstGcd({
      lists: [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${UNKNOWN_COND}`, `gcd_z,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`gcd_x,if=${TRUE_COND}`] },
      ],
      gcdTokens: ["gcd_x", "gcd_z"],
      usableTokens: ["gcd_x", "gcd_z"],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("ONE_SCAN_BLOCKED");
    expect(result.scanBlocker).toBe("UNDECIDED_RUN_GATE");
    expect(result.blockedAt?.actionToken).toBe("run_action_list");
  });
});

// ==========================================================================
// 8. The loader still derives a run entry as before
// ==========================================================================

describe("authority derivation is unchanged", () => {
  it("a run entry is LIST_DISPATCH with callsListName set and the run flag on", () => {
    const loaded = loadAplAuthority(
      syntheticArtifact({
        lists: [
          { listName: "default", actions: ["run_action_list,name=child,if=combo_points>=5"] },
          { listName: "child", actions: ["envenom"] },
        ],
      }),
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const run = loaded.authority.actions[0];
    expect(run?.entryKind).toBe("LIST_DISPATCH");
    expect(run?.callsListName).toBe("child");
    expect(run?.isUnmodelledDispatch).toBe(true);
    expect(run?.conditionRaw).toBe("combo_points>=5");
    // The reachability proof stays conservative in M11-B1: an authority with a
    // run entry anywhere is NOT_PROVABLE, exactly as before.
    const proof = loaded.authority.proveSoleGateTo("envenom");
    expect(proof.kind).toBe("NOT_PROVABLE");
    if (proof.kind === "NOT_PROVABLE") expect(proof.reason).toBe("UNMODELLED_DISPATCH");
  });
});
