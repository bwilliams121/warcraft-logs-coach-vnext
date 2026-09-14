/**
 * Nested traversal across `call_action_list`, over deliberately-shaped lists.
 *
 * The pinned authority contains one nesting shape. These synthetic lists supply
 * the ones it does not: an empty callee, a cycle, a missing target, a callee
 * that definitely fires under an undecided gate, and the convergences that make
 * an exact answer survive an unresolved gate.
 *
 * The property under test throughout: control flow follows the pinned
 * `player_t::select_action` loop, and an exact answer is produced only when
 * every legitimate resolution of every undecided gate reaches the same action.
 */

import { describe, expect, it } from "vitest";

import {
  selectAcrossLists,
  fromListStart,
  type ScanStartBoundary,
  type TraversalResult,
} from "../../src/simc/nested-selection.js";
import {
  provenUsable,
  unknownUsability,
  type ActionUsabilityVerdict,
} from "../../src/simc/action-applicability.js";
import { knownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import type { AplAction } from "../../src/simc/apl-authority.js";
import { syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

/**
 * Bindings that make `combo_points` decidable and everything else unknown.
 *
 * `combo_points=7` gives the tests a condition that is definitely TRUE
 * (`combo_points>=5`) and one definitely FALSE (`combo_points<5`) without any
 * combat state, so each case isolates control flow rather than evaluation.
 */
const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: knownNumber(0),
  energyPct: knownNumber(100),
  // No action's own DoT is established here. An empty per-action map is the
  // M5-D1 shape of that, and an unkeyed `remains` resolves UNKNOWN_NUMBER.
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
};

/** Conditions used throughout, so a reader does not have to decode them each time. */
const TRUE_COND = "combo_points>=5";
const FALSE_COND = "combo_points<5";
/** Supported syntax whose VALUE is unknown — an undecided condition, not a refused one. */
const UNKNOWN_COND = "fight_remains<15";
/** Real pinned syntax that remains outside the supported subset. */
// RE-POINTED for M5-D1, which made `refreshable` a recognised atom. The new
// stand-in is `active_dot.<name>` from the pinned `generate[0]` line: it counts
// DoTs across the whole enemy list, so it belongs to the target-count family
// M5-D deliberately does not support and will stay refused.
const UNSUPPORTED_COND = "active_dot.garrote>1";

function usabilityByToken(usable: readonly string[]) {
  return (action: AplAction): ActionUsabilityVerdict =>
    usable.includes(action.actionToken) ? provenUsable() : unknownUsability();
}

function traverse(
  lists: readonly SyntheticListSpec[],
  usable: readonly string[] = [],
  startBoundary?: ScanStartBoundary,
): TraversalResult {
  const authority = syntheticAuthority({ lists: lists as SyntheticListSpec[] });
  return selectAcrossLists({
    authority,
    entryListName: "default",
    bindings: BINDINGS,
    usabilityFor: usabilityByToken(usable),
    ...(startBoundary === undefined ? {} : { startBoundary }),
  });
}

/** The path of the step a result blocked at, as `list[ordinal]` strings. */
function blockedPath(result: TraversalResult): readonly string[] {
  if (result.kind !== "UNKNOWN" || result.blockedAt === null) return [];
  return result.blockedAt.path.map((entry) => `${entry.listName}[${String(entry.priorityOrdinal)}]`);
}

describe("a call whose callee fires returns the callee's action", () => {
  it("unconditional call + callee selects -> the callee's action wins", () => {
    const result = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=child", "mutilate"] },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    // The selecting step is the CALLEE's entry, and its path keeps the caller.
    expect(result.selectingStep.listName).toBe("child");
    expect(result.selectingStep.path.map((entry) => entry.listName)).toEqual(["default", "child"]);
  });

  it("TRUE call gate + callee selects -> the callee's action wins", () => {
    const result = traverse(
      [
        { listName: "default", actions: [`call_action_list,name=child,if=${TRUE_COND}`, "mutilate"] },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
  });

  it("stops evaluating lower caller entries once the callee fires", () => {
    // Priority: the call RETURNS in the pinned loop, so entries below it are
    // never reached. `mutilate` must not appear as a competing possibility.
    const result = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=child", `mutilate,if=${TRUE_COND}`] },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(result.steps.some((step) => step.actionToken === "mutilate")).toBe(false);
  });

  it("follows a grandchild: default -> child -> grandchild", () => {
    const result = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=child"] },
        { listName: "child", actions: ["call_action_list,name=grandchild"] },
        { listName: "grandchild", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(result.selectingStep.path.map((entry) => entry.listName)).toEqual([
      "default",
      "child",
      "grandchild",
    ]);
  });
});

describe("a call whose callee returns nothing continues the caller", () => {
  it("unconditional call + empty callee -> caller continues", () => {
    const result = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=child", `mutilate,if=${TRUE_COND}`] },
        { listName: "child", actions: [] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
  });

  it("TRUE call gate + empty callee -> caller continues", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`call_action_list,name=child,if=${TRUE_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
  });

  it("callee whose every entry is eliminated also continues the caller", () => {
    // A present list that provably selects nothing is NOT the same as a missing
    // one, and it behaves exactly like an empty one.
    const result = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=child", `mutilate,if=${TRUE_COND}`] },
        { listName: "child", actions: [`envenom,if=${FALSE_COND}`] },
      ],
      ["mutilate", "envenom"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
  });
});

describe("a FALSE call gate is not recursed into", () => {
  it("continues the caller without visiting the callee at all", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`call_action_list,name=child,if=${FALSE_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        // The callee would BLOCK if it were ever entered. It must not be.
        { listName: "child", actions: [`envenom,if=${UNSUPPORTED_COND}`] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
    // Structural proof it was never entered: no step from the callee exists.
    expect(result.steps.some((step) => step.listName === "child")).toBe(false);
  });
});

describe("THE CONVERGENCE RULE: an undecided gate above an empty callee", () => {
  it("continues the caller, because both gate worlds continue it", () => {
    // gate FALSE -> callee not entered -> continue here
    // gate TRUE  -> callee entered, returns nothing -> continue here
    // The gate's value cannot change where control goes, so it is not a blocker.
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`call_action_list,name=child,if=${UNKNOWN_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
  });

  it("applies to an UNPARSEABLE gate too, not merely an undecided one", () => {
    // This is what stops an unsupported gate from poisoning everything beneath
    // it. We cannot evaluate the gate at all — and it still cannot matter,
    // because the callee is proven to return nothing under every reading of it.
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`call_action_list,name=child,if=${UNSUPPORTED_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
  });

  it("records the call as entered-and-returned-nothing rather than skipped", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`call_action_list,name=child,if=${UNKNOWN_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [] },
      ],
      ["mutilate"],
    );
    const callStep = result.steps.find((step) => step.actionToken === "call_action_list");
    expect(callStep?.outcome).toBe("CALL_RETURNED_NO_ACTION_CONTINUE");
  });
});

describe("an undecided gate above a callee that MIGHT fire", () => {
  it("does not select the callee's action outright", () => {
    // World FALSE continues the caller and reaches nothing; world TRUE fires
    // envenom. The two disagree, so neither answer is exact.
    const result = traverse(
      [
        { listName: "default", actions: [`call_action_list,name=child,if=${UNKNOWN_COND}`] },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("NO_DEFINITE_WINNER");
  });

  it("blocks when the callee names a different action from the caller's lower entry", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`call_action_list,name=child,if=${UNKNOWN_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("COMPETING_POSSIBLE_ACTION");
    // The EARLIEST blocker is the callee's entry, not the caller's lower one.
    expect(blockedPath(result)).toEqual(["default[0]", "child[0]"]);
  });

  it("reports the same token at a DIFFERENT entry as TOKEN_CONVERGED, never as SELECTED", () => {
    // World TRUE  -> child[0] fires envenom
    // World FALSE -> caller continues and default[1] fires envenom
    //
    // RE-BASELINED AT M5-D1. Before it, this collapsed to UNKNOWN, because the
    // only positive member available reported a concrete list, ordinal, verbatim
    // string and control-flow path — and the two worlds disagree about every one
    // of those. That reasoning is unchanged and is exactly why this must NOT be
    // `SELECTED`.
    //
    // What changed is that "every authority path recommends envenom" is now
    // SAYABLE. It was always a true and useful statement, and M5-B's scoped walk
    // has always made it; the nested engine simply had nowhere to put it. It is
    // a DIFFERENT statement from "this authority entry was selected", so it gets
    // a different member with no `selectingStep` at all.
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`call_action_list,name=child,if=${UNKNOWN_COND}`, `envenom,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom"],
    );
    expect(result.kind).toBe("TOKEN_CONVERGED");
    if (result.kind !== "TOKEN_CONVERGED") return;
    expect(result.actionToken).toBe("envenom");
    // Both entries are carried, and neither is singled out.
    expect(
      result.candidateEntries.map((step) => `${step.listName}[${String(step.priorityOrdinal)}]`).sort(),
    ).toEqual(["child[0]", "default[1]"]);
    // THE CONSUMER GUARD: there is no field a caller could read as the entry.
    expect(result).not.toHaveProperty("selectingStep");
    expect(result).not.toHaveProperty("selectingLine");
    expect(result).not.toHaveProperty("convergedOver");
  });

  it("DOES converge when both gate worlds reach the SAME entry", () => {
    // World FALSE -> callee not entered  -> default[1] fires
    // World TRUE  -> callee returns none -> default[1] fires
    //
    // One entry, reached identically in both worlds. This is the convergence
    // that survives the tightened identity rule, and it is the shape the real
    // traversal relies on.
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`call_action_list,name=child,if=${UNKNOWN_COND}`, `envenom,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [] },
      ],
      ["envenom"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(result.selectingStep.listName).toBe("default");
    expect(result.selectingStep.priorityOrdinal).toBe(1);
    // Exactly one candidate: the single entry both worlds reach.
    expect(result.convergedOver).toHaveLength(1);
  });

  it("converges two DIFFERENT entries of one list that share a token, on the TOKEN only", () => {
    // Two envenom lines, one undecided and one definite. This is the pinned
    // `spend` shape exactly, and `selectWithinList` has always converged it —
    // M5-B's result names a sub-list rather than a single entry, so the
    // distinction never arose there.
    //
    // M5-C3b's hardening pass made the nested walker refuse this outright,
    // because its only positive member named ONE entry. M5-D1 gives it the
    // weaker member instead, which is what the two walkers were always saying
    // in different words. `SELECTED` still requires entry unanimity.
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`envenom,if=${UNKNOWN_COND}`, `envenom,if=${TRUE_COND}`],
        },
      ],
      ["envenom"],
    );
    expect(result.kind).toBe("TOKEN_CONVERGED");
    if (result.kind !== "TOKEN_CONVERGED") return;
    expect(result.actionToken).toBe("envenom");
    expect(result.candidateEntries.map((step) => step.priorityOrdinal)).toEqual([0, 1]);
  });

  it("does NOT converge when the undecided entry names a different action", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`mutilate,if=${UNKNOWN_COND}`, `envenom,if=${TRUE_COND}`],
        },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("COMPETING_POSSIBLE_ACTION");
  });

  it("compares the authority ENTRY, not a name — the engine has no names at all", () => {
    // Guards against the failure §31 warns about: two entries that look alike by
    // name converging into one exact claim. Entry coordinates are what is
    // compared, and a step carries no display name to compare instead.
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`envenom,if=${UNKNOWN_COND}`, `envenom,if=${TRUE_COND}`],
        },
      ],
      ["envenom"],
    );
    // TOKEN_CONVERGED since M5-D1; the property under test — that coordinates
    // rather than names are what convergence compares — is unchanged.
    if (result.kind !== "TOKEN_CONVERGED") throw new Error("expected TOKEN_CONVERGED");
    for (const step of result.steps) {
      expect(step).not.toHaveProperty("displayName");
      expect(step).not.toHaveProperty("displayNameEn");
      expect(step).not.toHaveProperty("abilityGameId");
      // The coordinates convergence actually uses are all present.
      expect(step.listName).toBeTypeOf("string");
      expect(step.priorityOrdinal).toBeTypeOf("number");
      expect(step.actionStringVerbatim).toBeTypeOf("string");
      expect(step.sourceLine).toBeTypeOf("number");
    }
  });

  it("converges a lone definite entry, which is the only shape that can", () => {
    // With entry identity required, an exact selection means exactly one
    // candidate survived. Stated directly so the rule is visible rather than
    // implied by the cases above.
    const result = traverse(
      [{ listName: "default", actions: [`envenom,if=${FALSE_COND}`, `envenom,if=${TRUE_COND}`] }],
      ["envenom"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    // The eliminated line is not a candidate at all, so one remains.
    expect(result.convergedOver).toHaveLength(1);
    expect(result.selectingStep.priorityOrdinal).toBe(1);
  });

  it("blocks when the callee is itself unresolved", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`call_action_list,name=child,if=${UNKNOWN_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`envenom,if=${UNSUPPORTED_COND}`] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
    expect(blockedPath(result)).toEqual(["default[0]", "child[0]"]);
  });
});

describe("an unresolved callee blocks the caller's lower entries", () => {
  it("does not fall through to a decidable lower entry", () => {
    // THE fail-closed rule. `mutilate` is definitely usable and its condition is
    // definitely true, and it still must not be reported — the callee above it
    // might have fired first.
    const result = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=child", `mutilate,if=${TRUE_COND}`] },
        { listName: "child", actions: [`envenom,if=${UNSUPPORTED_COND}`] },
      ],
      ["mutilate", "envenom"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blockedAt?.listName).toBe("child");
    expect(result.steps.some((step) => step.actionToken === "mutilate")).toBe(false);
  });

  it("blocks on a TRUE gate with an unresolved callee", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`call_action_list,name=child,if=${TRUE_COND}`, `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`envenom,if=${UNSUPPORTED_COND}`] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
  });

  it("does not let an observed lower action prove a higher callee unusable", () => {
    // Usability evidence for `mutilate` says nothing about `envenom`. Proving
    // the higher one unusable is the observation inversion this project bans,
    // and there is no state here that could express it.
    const result = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=child", "mutilate"] },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    // envenom is POSSIBLE, never ELIMINATED.
    const envenom = result.steps.find((step) => step.actionToken === "envenom");
    expect(envenom?.outcome).toBe("MAY_SELECT");
    expect(envenom?.usability).toBe("UNKNOWN");
  });
});

describe("variable executes and the scan continues", () => {
  it("is never the selected action, and does not end the scan", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: ["variable,name=single_target,value=1", `mutilate,if=${TRUE_COND}`],
        },
      ],
      ["mutilate", "variable"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
    const variableStep = result.steps.find((step) => step.entryKind === "VARIABLE_ASSIGNMENT");
    expect(variableStep?.outcome).toBe("VARIABLE_EXECUTED_CONTINUE");
  });

  it("continues even when its assigned VALUE is not reconstructible", () => {
    // The real `default[2]`: `value=spell_targets.fan_of_knives=1`, which we
    // cannot evaluate. The scan continues anyway, because the variable never
    // returns an action — and its value is accounted for a layer down, where a
    // later `variable.single_target` becomes an enumerated unresolved atom.
    const result = traverse(
      [
        {
          listName: "default",
          actions: [
            "variable,name=single_target,value=spell_targets.fan_of_knives=1",
            `mutilate,if=${TRUE_COND}`,
          ],
        },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
  });

  it("continues even when its own gate is undecided", () => {
    // Whether the assignment happens cannot change control flow: an unassigned
    // variable still does not end the scan.
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`variable,name=x,value=1,if=${UNKNOWN_COND}`, `mutilate,if=${TRUE_COND}`],
        },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
  });

  it("leaves a later read of that variable unresolved rather than assumed", () => {
    // The epistemic model, end to end: the assignment executes, the value stays
    // unknown, and the later condition reading it enumerates both worlds. Here
    // the two worlds disagree, so the result is honestly unresolved.
    const result = traverse(
      [
        {
          listName: "default",
          actions: ["variable,name=single_target,value=1", "mutilate,if=variable.single_target"],
        },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("NO_DEFINITE_WINNER");
    const step = result.steps.find((entry) => entry.actionToken === "mutilate");
    expect(step?.gate.kind).toBe("EVALUATED");
    if (step?.gate.kind !== "EVALUATED") return;
    expect(step.gate.truth).toBe("UNKNOWN_STATE");
  });
});

describe("the GCD lane does not decide whether the scan stops", () => {
  it("a zero-GCD player action still RETURNS and ends the scan", () => {
    // `stealth` is NON_GCD per the pinned DBC, and the pinned selection loop has
    // no `trigger_gcd` branch at all. It returns exactly like any other action.
    const result = traverse(
      [{ listName: "default", actions: [`stealth,if=${TRUE_COND}`, `mutilate,if=${TRUE_COND}`] }],
      ["stealth", "mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("stealth");
    // The lower entry was never reached.
    expect(result.steps.some((step) => step.actionToken === "mutilate")).toBe(false);
  });

  it("a GCD player action returns in exactly the same way", () => {
    const result = traverse(
      [{ listName: "default", actions: [`mutilate,if=${TRUE_COND}`, `envenom,if=${TRUE_COND}`] }],
      ["mutilate", "envenom"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
  });

  it("the traversal reads no execution lane at all", () => {
    // Structural: a lane field on a step would be a place for a future reader to
    // branch on GCD, which the pinned loop never does.
    const result = traverse([{ listName: "default", actions: [`stealth,if=${TRUE_COND}`] }], ["stealth"]);
    if (result.kind !== "SELECTED") throw new Error("expected a selection");
    expect(Object.keys(result.selectingStep)).not.toContain("executionLane");
  });
});

describe("control flow this module refuses to model", () => {
  it("fails closed on a recursion cycle rather than looping", () => {
    const result = traverse([
      { listName: "default", actions: ["call_action_list,name=b"] },
      { listName: "b", actions: ["call_action_list,name=default"] },
    ]);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("CONTROL_FLOW_CYCLE");
  });

  it("fails closed on a self-call", () => {
    const result = traverse([{ listName: "default", actions: ["call_action_list,name=default"] }]);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("CONTROL_FLOW_CYCLE");
  });

  it("allows two SIBLING calls to the same list, which is not a cycle", () => {
    // The pinned guard restores `visited_apls_` at the top of each iteration, so
    // calling one list twice from one caller is legal. Treating it as a cycle
    // would refuse a perfectly ordinary APL shape.
    const result = traverse(
      [
        {
          listName: "default",
          actions: ["call_action_list,name=child", "call_action_list,name=child", `mutilate,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [] },
      ],
      ["mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
  });

  it("fails closed on a call to a list the artifact does not contain", () => {
    // A missing list is a hole in the model. Treating it as empty would let the
    // caller continue as though the callee had been proven to select nothing.
    const result = traverse([{ listName: "default", actions: ["call_action_list,name=missing"] }]);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("CALLED_LIST_ABSENT");
  });

  it("distinguishes a missing list from a present empty one", () => {
    // Same caller shape, and the two outcomes must not be the same.
    const missing = traverse([{ listName: "default", actions: ["call_action_list,name=nope"] }]);
    const empty = traverse([
      { listName: "default", actions: ["call_action_list,name=child"] },
      { listName: "child", actions: [] },
    ]);
    expect(missing.kind).toBe("UNKNOWN");
    expect(empty.kind).toBe("NO_ACTION_SELECTED");
  });

  it("fails closed on run_action_list rather than treating it as a call", () => {
    const result = traverse([
      { listName: "default", actions: ["run_action_list,name=child"] },
      { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
    ]);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNMODELLED_DISPATCH_IN_LIST");
  });

  it("fails closed on swap_action_list", () => {
    const result = traverse([{ listName: "default", actions: ["swap_action_list,name=child"] }]);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_ENTRY_KIND");
  });

  it("fails closed on a call carrying no name at all", () => {
    const result = traverse([{ listName: "default", actions: ["call_action_list"] }]);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_ENTRY_KIND");
  });
});

describe("NO_ACTION_SELECTED is a proof, not an absence of findings", () => {
  it("is produced when every reachable entry is definitively eliminated", () => {
    const result = traverse([
      { listName: "default", actions: [`envenom,if=${FALSE_COND}`, "call_action_list,name=child"] },
      { listName: "child", actions: [`mutilate,if=${FALSE_COND}`] },
    ]);
    expect(result.kind).toBe("NO_ACTION_SELECTED");
  });

  it("is NOT produced when an entry merely could not be evaluated", () => {
    const result = traverse([{ listName: "default", actions: [`envenom,if=${UNSUPPORTED_COND}`] }]);
    expect(result.kind).not.toBe("NO_ACTION_SELECTED");
  });

  it("is NOT produced when a possible winner remains through usability uncertainty", () => {
    const result = traverse([{ listName: "default", actions: [`envenom,if=${TRUE_COND}`] }], []);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("NO_DEFINITE_WINNER");
  });
});

describe("the entry-gate proof distinguishes unconditional from evaluated", () => {
  it("records UNCONDITIONAL with no fabricated trace", () => {
    const result = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=child"] },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom"],
    );
    const call = result.steps.find((step) => step.actionToken === "call_action_list");
    expect(call?.gate.kind).toBe("UNCONDITIONAL");
    // An unconditional gate has no trace. There is no `true` expression to trace,
    // and inventing one would misrepresent a stronger fact as a weaker one.
    expect(call?.gate).not.toHaveProperty("trace");
    expect(call?.gate).not.toHaveProperty("truth");
  });

  it("records an evaluated gate WITH its trace", () => {
    const result = traverse(
      [
        { listName: "default", actions: [`call_action_list,name=child,if=${TRUE_COND}`] },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom"],
    );
    const call = result.steps.find((step) => step.actionToken === "call_action_list");
    expect(call?.gate.kind).toBe("EVALUATED");
    if (call?.gate.kind !== "EVALUATED") return;
    expect(call.gate.truth).toBe("TRUE");
    expect(call.gate.trace.expressionRaw).toBe(TRUE_COND);
  });
});

describe("the starting boundary must carry a proof of what it skips", () => {
  it("starts at the top by default", () => {
    const result = traverse([{ listName: "default", actions: [`envenom,if=${TRUE_COND}`] }], ["envenom"]);
    expect(result.kind).toBe("SELECTED");
    expect(fromListStart().startOrdinal).toBe(0);
  });

  it("honours a boundary whose proof covers every skipped ordinal", () => {
    const result = traverse(
      [{ listName: "default", actions: [`envenom,if=${TRUE_COND}`, `mutilate,if=${TRUE_COND}`] }],
      ["envenom", "mutilate"],
      { startOrdinal: 1, provenExcludedOrdinals: [0], justification: "test" },
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
  });

  it("REFUSES a boundary whose proof does not cover what it skips", () => {
    // Without this, a start ordinal would silently assert that the entries above
    // it do not fire — a gameplay claim the traversal has no basis for.
    const result = traverse(
      [{ listName: "default", actions: [`envenom,if=${TRUE_COND}`, `mutilate,if=${TRUE_COND}`] }],
      ["envenom", "mutilate"],
      { startOrdinal: 1, provenExcludedOrdinals: [], justification: "unproven" },
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("INVALID_START_BOUNDARY");
  });

  it("REFUSES a boundary whose proof has a hole in the middle", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`a,if=${TRUE_COND}`, `b,if=${TRUE_COND}`, `c,if=${TRUE_COND}`],
        },
      ],
      ["c"],
      { startOrdinal: 2, provenExcludedOrdinals: [0], justification: "misses ordinal 1" },
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("INVALID_START_BOUNDARY");
  });

  it("applies the boundary to the ENTRY list only, never to a callee", () => {
    // A callee is always entered at its top. Carrying a caller's boundary into
    // it would skip entries nobody proved anything about.
    const result = traverse(
      [
        { listName: "default", actions: [`a,if=${FALSE_COND}`, "call_action_list,name=child"] },
        { listName: "child", actions: [`envenom,if=${TRUE_COND}`] },
      ],
      ["envenom"],
      { startOrdinal: 1, provenExcludedOrdinals: [0], justification: "test" },
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.selectingStep.priorityOrdinal).toBe(0);
    expect(result.selectingStep.listName).toBe("child");
  });
});

describe("the trace explains the result", () => {
  it("keeps the caller in every path, rather than flattening to the leaf", () => {
    const result = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=child"] },
        { listName: "child", actions: ["call_action_list,name=grandchild"] },
        { listName: "grandchild", actions: [`envenom,if=${UNSUPPORTED_COND}`] },
      ],
      [],
    );
    expect(result.kind).toBe("UNKNOWN");
    expect(blockedPath(result)).toEqual(["default[0]", "child[0]", "grandchild[0]"]);
  });

  it("records every visited entry in visit order", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`a,if=${FALSE_COND}`, "call_action_list,name=child", `c,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`b,if=${FALSE_COND}`] },
      ],
      ["c"],
    );
    // The CALL SITE precedes its callee. A trace listing `child[0]` before the
    // `default[1]` that called it would read as though the callee were visited
    // on its own, which is exactly the caller-flattening this path model exists
    // to prevent.
    expect(result.steps.map((step) => `${step.listName}[${String(step.priorityOrdinal)}]`)).toEqual([
      "default[0]",
      "default[1]",
      "child[0]",
      "default[2]",
    ]);
  });

  it("orders a blocked nested trace caller-first as well", () => {
    const result = traverse(
      [
        { listName: "default", actions: [`a,if=${FALSE_COND}`, "call_action_list,name=child"] },
        { listName: "child", actions: [`b,if=${UNSUPPORTED_COND}`] },
      ],
      [],
    );
    expect(result.steps.map((step) => `${step.listName}[${String(step.priorityOrdinal)}]`)).toEqual([
      "default[0]",
      "default[1]",
      "child[0]",
    ]);
  });

  it("names the outcome of each step, so an UNKNOWN can be read back", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: [`a,if=${FALSE_COND}`, `call_action_list,name=child,if=${UNSUPPORTED_COND}`],
        },
        { listName: "child", actions: [`b,if=${UNSUPPORTED_COND}`] },
      ],
      [],
    );
    expect(result.steps.map((step) => step.outcome)).toEqual(["ELIMINATED_CONTINUE", "BLOCKED", "BLOCKED"]);
  });
});
