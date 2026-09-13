import { describe, expect, it } from "vitest";

import { selectWithinList, type ActionUsability, type ListSelection } from "../../src/simc/list-selection.js";
import { knownNumber, unknownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import type { AplAction } from "../../src/simc/apl-authority.js";
import { syntheticAuthority } from "../support/m5a-authority.js";

/**
 * THE ORDERED WALK, over deliberately-shaped lists.
 *
 * The real `spend` list holds three Envenom lines, which is the one shape least
 * able to prove the walk handles anything else: every token is the same, so a
 * broken convergence check would still produce the right answer. These synthetic
 * lists supply the cases the pinned authority does not contain.
 *
 * The property under test throughout: an exact selection is made only when every
 * legitimate resolution of priority AND usability names the same action.
 */

const BINDINGS: AtomBindings = {
  comboPoints: 7,
  comboPointsDeficit: 0,
  energyPct: knownNumber(100),
  knownBuffs: [],
};

/** Usability by token. Anything unlisted is UNKNOWN — never "unusable". */
function usabilityByToken(usable: readonly string[]) {
  return (action: AplAction): ActionUsability =>
    usable.includes(action.actionToken) ? "PROVEN_USABLE" : "UNKNOWN";
}

function selectIn(actions: readonly string[], usable: readonly string[] = []): ListSelection {
  const authority = syntheticAuthority({
    lists: [
      { listName: "default", actions: ["call_action_list,name=spend,if=combo_points>=5"] },
      { listName: "spend", actions: actions as string[] },
    ],
  });
  return selectWithinList(authority, "spend", BINDINGS, usabilityByToken(usable));
}

describe("a definite winner requires BOTH a true condition and proven usability", () => {
  it("selects when the condition is TRUE and the action is proven usable", () => {
    const result = selectIn(["envenom,if=energy.pct>70"], ["envenom"]);
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(result.selectingLine.priorityOrdinal).toBe(0);
  });

  it("does NOT select when the condition is TRUE but usability is unknown", () => {
    // A true condition alone would assert the ability was off cooldown, in
    // range, affordable and legal — none of which this project models.
    const result = selectIn(["envenom,if=energy.pct>70"], []);
    expect(result.kind).toBe("INDETERMINATE");
    if (result.kind !== "INDETERMINATE") return;
    expect(result.blocker).toBe("NO_DEFINITE_WINNER");
    expect(result.lines[0]?.outcome).toBe("POSSIBLE");
  });

  it("does not treat unknown usability as definite ABSENCE either", () => {
    // The mirror error. A TRUE condition with unknown usability is neither
    // "it fired" nor "it did not fire", so it can never produce the exact
    // NO_ACTION_SELECTED result.
    const result = selectIn(["envenom,if=energy.pct>70"], []);
    expect(result.kind).not.toBe("NO_ACTION_SELECTED");
    expect(result.kind).not.toBe("SELECTED");
  });

  it("eliminates a definitely-false line whatever its usability", () => {
    // A false condition cannot win even for an action we know was usable. This
    // is the one sound elimination available.
    const result = selectIn(
      ["envenom,if=combo_points<5", "mutilate,if=energy.pct>70"],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("mutilate");
    expect(result.lines[0]?.outcome).toBe("ELIMINATED");
  });
});

describe("convergence: an uncertain higher line does not block an identical token", () => {
  it("selects the token when a POSSIBLE higher line names the same action", () => {
    // This is the M5-B proof in miniature. Either the higher line fires or the
    // lower one does; both are Envenom; so Envenom is selected regardless.
    const result = selectIn(["envenom,if=buff.envenom.remains<=1", "envenom,if=energy.pct>70"], ["envenom"]);
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(result.selectingLine.priorityOrdinal).toBe(1);
    expect(result.convergedOver.map((line) => line.priorityOrdinal)).toEqual([0, 1]);
    expect(result.lines[0]?.outcome).toBe("POSSIBLE");
    expect(result.lines[1]?.outcome).toBe("DEFINITE_WINNER");
  });

  it("blocks when a POSSIBLE higher line names a DIFFERENT action", () => {
    // The priority short-circuit rule. Falling through to the definite lower
    // line would be a confident answer resting on an unresolved line above it.
    const result = selectIn(
      ["mutilate,if=buff.envenom.remains<=1", "envenom,if=energy.pct>70"],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("INDETERMINATE");
    if (result.kind !== "INDETERMINATE") return;
    expect(result.blocker).toBe("COMPETING_POSSIBLE_ACTION");
    expect(result.blockedBy?.actionToken).toBe("mutilate");
    expect(result.blockedBy?.priorityOrdinal).toBe(0);
  });

  it("blocks on a higher TRUE line with unknown usability naming a different action", () => {
    // The competing line here is not even uncertain in its CONDITION — only in
    // whether the action was usable. That is still enough to block.
    const result = selectIn(["mutilate,if=energy.pct>70", "envenom,if=energy.pct>70"], ["envenom"]);
    expect(result.kind).toBe("INDETERMINATE");
    if (result.kind !== "INDETERMINATE") return;
    expect(result.blocker).toBe("COMPETING_POSSIBLE_ACTION");
  });

  it("is not blocked by a LOWER line naming a different action", () => {
    // Lower lines are unreachable once a higher line definitely fires, so they
    // are never even evaluated.
    const result = selectIn(["envenom,if=energy.pct>70", "mutilate"], ["envenom", "mutilate"]);
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(result.lines).toHaveLength(1);
  });

  it("is not blocked by an ELIMINATED higher line naming a different action", () => {
    const result = selectIn(["mutilate,if=combo_points<5", "envenom,if=energy.pct>70"], ["envenom"]);
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
  });
});

/**
 * RE-POINTED for M5-C2. These cases used `talent.darkest_night` as their
 * unsupported example; `talent.<name>` is a supported atom now. They use
 * `pmultiplier` instead — a real identifier from the pinned `core_dot` list that
 * remains outside the subset — so the fail-closed guarantee is still exercised
 * against something genuinely unparseable rather than deleted.
 */
describe("unsupported syntax stops the walk immediately", () => {
  it("blocks rather than skipping the line", () => {
    const result = selectIn(["envenom,if=pmultiplier<=1", "envenom,if=energy.pct>70"], ["envenom"]);
    expect(result.kind).toBe("INDETERMINATE");
    if (result.kind !== "INDETERMINATE") return;
    expect(result.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
    expect(result.blockedBy?.priorityOrdinal).toBe(0);
    // The lower line was never evaluated: skipping an unparsed line would be
    // exactly the fall-through the whole-expression refusal exists to prevent.
    expect(result.lines).toHaveLength(1);
  });

  it("blocks even when every remaining line names the same token", () => {
    // Convergence must not rescue an unparsed line. We do not know what the
    // unparsed condition says, so we do not know it names this token either.
    const result = selectIn(["envenom,if=target.time_to_die<12", "envenom,if=energy.pct>70"], ["envenom"]);
    expect(result.kind).toBe("INDETERMINATE");
    if (result.kind !== "INDETERMINATE") return;
    expect(result.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
  });

  it("records the refused line with no truth value", () => {
    const result = selectIn(["envenom,if=pmultiplier<=1"], ["envenom"]);
    if (result.kind !== "INDETERMINATE") return;
    expect(result.lines[0]?.condition.kind).toBe("UNSUPPORTED");
    expect(result.lines[0]?.condition).not.toHaveProperty("truth");
  });
});

describe("NO_ACTION_SELECTED is exact, and hard to reach", () => {
  it("is produced when every line is definitively eliminated", () => {
    const result = selectIn(["envenom,if=combo_points<5", "mutilate,if=combo_points<3"], ["envenom"]);
    expect(result.kind).toBe("NO_ACTION_SELECTED");
    if (result.kind !== "NO_ACTION_SELECTED") return;
    expect(result.lines.every((line) => line.outcome === "ELIMINATED")).toBe(true);
  });

  it("is produced for an authoritative list holding zero actions", () => {
    // An entered list with nothing in it selects nothing, exactly.
    const result = selectIn([]);
    expect(result.kind).toBe("NO_ACTION_SELECTED");
    if (result.kind !== "NO_ACTION_SELECTED") return;
    expect(result.lines).toEqual([]);
  });

  it("is NOT produced when a possible winner remains through condition uncertainty", () => {
    const result = selectIn(["envenom,if=fight_remains<15"], ["envenom"]);
    expect(result.kind).toBe("INDETERMINATE");
    if (result.kind !== "INDETERMINATE") return;
    expect(result.blocker).toBe("NO_DEFINITE_WINNER");
  });

  it("is NOT produced when a possible winner remains through usability uncertainty", () => {
    const result = selectIn(["envenom,if=energy.pct>70"], []);
    expect(result.kind).toBe("INDETERMINATE");
    if (result.kind !== "INDETERMINATE") return;
    expect(result.blocker).toBe("NO_DEFINITE_WINNER");
  });

  it("is NOT produced when the only surviving line was unparseable", () => {
    const result = selectIn(["envenom,if=pmultiplier<=1"], ["envenom"]);
    expect(result.kind).not.toBe("NO_ACTION_SELECTED");
  });
});

describe("a missing list is not an empty list", () => {
  it("reports LIST_ABSENT rather than selecting nothing", () => {
    // "The authority says nothing fires" and "we could not find the list" are
    // opposite claims. Returning an empty action array for both would make them
    // indistinguishable — the same failure as reading a missing observation as
    // zero.
    const authority = syntheticAuthority({
      lists: [{ listName: "default", actions: ["envenom"] }],
    });
    const result = selectWithinList(authority, "spend", BINDINGS, usabilityByToken(["envenom"]));
    expect(result.kind).toBe("LIST_ABSENT");
    if (result.kind !== "LIST_ABSENT") return;
    expect(result.listName).toBe("spend");
  });

  it("distinguishes the two through the authority accessor itself", () => {
    const authority = syntheticAuthority({
      lists: [
        { listName: "default", actions: ["call_action_list,name=spend,if=combo_points>=5"] },
        { listName: "spend", actions: [] },
      ],
    });
    expect(authority.actionsInList("spend")).toEqual({ found: true, listName: "spend", actions: [] });
    expect(authority.actionsInList("cds")).toEqual({ found: false, listName: "cds" });
  });
});

describe("control-flow constructs inside a sub-list fail closed", () => {
  it("refuses a nested call_action_list", () => {
    const authority = syntheticAuthority({
      lists: [
        { listName: "default", actions: ["call_action_list,name=spend,if=combo_points>=5"] },
        { listName: "spend", actions: ["call_action_list,name=cds", "envenom,if=energy.pct>70"] },
        { listName: "cds", actions: ["deathmark"] },
      ],
    });
    const result = selectWithinList(authority, "spend", BINDINGS, usabilityByToken(["envenom"]));
    expect(result.kind).toBe("INDETERMINATE");
    if (result.kind !== "INDETERMINATE") return;
    expect(result.blocker).toBe("NESTED_CALL_NOT_MODELLED");
  });

  it("refuses run_action_list", () => {
    const authority = syntheticAuthority({
      lists: [
        { listName: "default", actions: ["call_action_list,name=spend,if=combo_points>=5"] },
        { listName: "spend", actions: ["run_action_list,name=cds", "envenom,if=energy.pct>70"] },
        { listName: "cds", actions: ["deathmark"] },
      ],
    });
    const result = selectWithinList(authority, "spend", BINDINGS, usabilityByToken(["envenom"]));
    expect(result.kind).toBe("INDETERMINATE");
    if (result.kind !== "INDETERMINATE") return;
    expect(result.blocker).toBe("UNMODELLED_DISPATCH_IN_LIST");
  });
});

describe("priority order is exact", () => {
  it("walks in ascending priorityOrdinal and stops at the first definite winner", () => {
    const result = selectIn(
      [
        "envenom,if=combo_points<5",
        "envenom,if=buff.envenom.remains<=1",
        "envenom,if=energy.pct>70",
        "mutilate",
      ],
      ["envenom"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.lines.map((line) => line.priorityOrdinal)).toEqual([0, 1, 2]);
    expect(result.lines.map((line) => line.outcome)).toEqual(["ELIMINATED", "POSSIBLE", "DEFINITE_WINNER"]);
    expect(result.selectingLine.priorityOrdinal).toBe(2);
  });

  it("treats an unconditional line as firing, given usability", () => {
    const result = selectIn(["envenom"], ["envenom"]);
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.lines[0]?.condition.kind).toBe("UNCONDITIONAL");
  });

  it("does not let an unconditional line fire without usability evidence", () => {
    const result = selectIn(["envenom"], []);
    expect(result.kind).toBe("INDETERMINATE");
    if (result.kind !== "INDETERMINATE") return;
    expect(result.blocker).toBe("NO_DEFINITE_WINNER");
  });
});

describe("the walk inherits the evaluator's unknown-magnitude semantics", () => {
  it("keeps a line POSSIBLE when only an unknown magnitude stands between it and firing", () => {
    const result = selectWithinList(
      syntheticAuthority({
        lists: [
          { listName: "default", actions: ["call_action_list,name=spend,if=combo_points>=5"] },
          { listName: "spend", actions: ["envenom,if=energy.pct>70|fight_remains<15"] },
        ],
      }),
      "spend",
      { ...BINDINGS, energyPct: unknownNumber("STATE_NOT_ESTABLISHED") },
      usabilityByToken(["envenom"]),
    );
    expect(result.kind).toBe("INDETERMINATE");
    if (result.kind !== "INDETERMINATE") return;
    expect(result.blocker).toBe("NO_DEFINITE_WINNER");
    expect(result.lines[0]?.outcome).toBe("POSSIBLE");
  });

  it("fires the same line once the known magnitude settles it", () => {
    const result = selectIn(["envenom,if=energy.pct>70|fight_remains<15"], ["envenom"]);
    expect(result.kind).toBe("SELECTED");
  });
});
