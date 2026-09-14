/**
 * TOKEN_CONVERGED — a deliberately weaker result, and why it is not a weakening.
 *
 * THE TWO CLAIMS, KEPT APART
 *
 *     SELECTED         this authority ENTRY was selected. A consumer may quote
 *                      its list, ordinal, verbatim string and control-flow path.
 *     TOKEN_CONVERGED  this ACTION was selected, from one of these entries. The
 *                      entry is genuinely unresolved and there is no field a
 *                      consumer could read as one.
 *
 * The pinned `spend` list makes the distinction real rather than theoretical. At
 * maximum combo points `spend[0]` might fire and `spend[1]` definitely does, and
 * both are Envenom. "The authority selects Envenom" is true and useful; "the
 * authority selects spend[1]" is not established.
 *
 * M5-B's scoped walk has always converged on the TOKEN — `selectWithinList`
 * compares `actionToken` — so this is not a new epistemic standard. It is that
 * standard finally becoming expressible in the nested engine, which until M5-D1
 * had to collapse it into a refusal.
 */

import { describe, expect, it } from "vitest";

import { resolveOneForegroundScan, selectAcrossLists } from "../../src/simc/nested-selection.js";
import {
  firstGcdSelectionAcrossRescans,
  convergeRotationalResults,
} from "../../src/simc/first-gcd-selection.js";
import { selectWithinList } from "../../src/simc/list-selection.js";
import { knownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import type { ExecutionLane } from "../../src/data/game/ability-gcd-semantics.js";
import { syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

const TRUE_COND = "combo_points>=5";
const UNKNOWN_COND = "buff.darkest_night.up";

const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: knownNumber(0),
  energyPct: knownNumber(100),
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
};

function traverse(lists: readonly SyntheticListSpec[], usable: readonly string[] = []) {
  return selectAcrossLists({
    authority: syntheticAuthority({ lists: lists as SyntheticListSpec[] }),
    entryListName: "default",
    bindings: BINDINGS,
    usabilityFor: (action) =>
      usable.includes(action.actionToken) ? { kind: "PROVEN_USABLE" } : { kind: "UNKNOWN" },
  });
}

interface State {
  readonly disabled: readonly string[];
}
const stateKey = (state: State): string => [...state.disabled].sort().join(",");

function runEngine(options: {
  readonly lists: readonly SyntheticListSpec[];
  readonly gcdTokens: readonly string[];
  readonly usableTokens: readonly string[];
}) {
  const authority = syntheticAuthority({ lists: options.lists as SyntheticListSpec[] });
  return firstGcdSelectionAcrossRescans<State>({
    rootListName: "default",
    initialState: { disabled: [] },
    stateKey,
    scanFor: (state) => selectAcrossListsScan(authority, state, options.usableTokens),
    laneFor: (step): ExecutionLane =>
      options.gcdTokens.includes(step.actionToken) ? "GCD_CONSUMING" : "NON_GCD",
    transitionFor: (action, state) => ({
      kind: "APPLIED",
      nextState: { disabled: [...state.disabled, action.actionToken] },
      timeAdvanceMs: 0,
      evidence: {
        kind: "SYNTHETIC",
        provenance: "test",
        stateKeyBefore: stateKey(state),
        stateKeyAfter: stateKey({ disabled: [...state.disabled, action.actionToken] }),
      },
    }),
  });
}

function selectAcrossListsScan(
  authority: ReturnType<typeof syntheticAuthority>,
  state: State,
  usableTokens: readonly string[],
) {
  return resolveOneForegroundScan({
    authority,
    entryListName: "default",
    bindings: BINDINGS,
    usabilityFor: (action) => {
      if (state.disabled.includes(action.actionToken)) {
        return {
          kind: "PROVEN_UNUSABLE",
          reason: "SIMULATED_PREFIX_EXECUTION",
          evidence: {
            abilityGameId: null,
            itemId: null,
            provenRemainingAtLeastMs: null,
            cooldownToleranceMs: null,
            detail: "hypothetical",
          },
        };
      }
      return usableTokens.includes(action.actionToken) ? { kind: "PROVEN_USABLE" } : { kind: "UNKNOWN" };
    },
  });
}

describe("the one-scan engine reports token convergence", () => {
  it("converges two entries of one list that name the same token", () => {
    // The pinned `spend` shape exactly.
    const result = traverse(
      [{ listName: "default", actions: [`envenom,if=${UNKNOWN_COND}`, `envenom,if=${TRUE_COND}`] }],
      ["envenom"],
    );
    expect(result.kind).toBe("TOKEN_CONVERGED");
    if (result.kind !== "TOKEN_CONVERGED") return;
    expect(result.actionToken).toBe("envenom");
    expect(result.candidateEntries.map((step) => step.priorityOrdinal)).toEqual([0, 1]);
  });

  it("still requires SOMETHING to definitely fire", () => {
    // Two possible entries with no definite one is `MAY_SELECT`: the scan might
    // equally have returned nothing, so no action is established at all.
    const result = traverse([
      { listName: "default", actions: [`envenom,if=${UNKNOWN_COND}`, `envenom,if=${UNKNOWN_COND}`] },
    ]);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("NO_DEFINITE_WINNER");
  });

  it("refuses two entries naming DIFFERENT tokens", () => {
    const result = traverse(
      [{ listName: "default", actions: [`mutilate,if=${UNKNOWN_COND}`, `envenom,if=${TRUE_COND}`] }],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("COMPETING_POSSIBLE_ACTION");
  });

  it("keeps SELECTED entry-exact", () => {
    // THE CONTRACT M5-D1 MUST NOT WEAKEN. One surviving candidate, one entry.
    const result = traverse([{ listName: "default", actions: [`envenom,if=${TRUE_COND}`] }], ["envenom"]);
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.selectingStep.priorityOrdinal).toBe(0);
    expect(result.convergedOver).toHaveLength(1);
  });

  it("gives a TOKEN_CONVERGED result no field a consumer could read as the entry", () => {
    const result = traverse(
      [{ listName: "default", actions: [`envenom,if=${UNKNOWN_COND}`, `envenom,if=${TRUE_COND}`] }],
      ["envenom"],
    );
    if (result.kind !== "TOKEN_CONVERGED") throw new Error("expected token convergence");
    expect(result).not.toHaveProperty("selectingStep");
    expect(result).not.toHaveProperty("selectingLine");
    expect(result).not.toHaveProperty("convergedOver");
    expect(result).not.toHaveProperty("blocker");
  });

  it("converges across a CALL when the callee is token-convergent", () => {
    // `default -> spend` with two Envenom lines. The call returns an action for
    // certain, so nothing below it is reachable, and the token is established.
    const result = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=spend", `mutilate,if=${TRUE_COND}`] },
        { listName: "spend", actions: [`envenom,if=${UNKNOWN_COND}`, `envenom,if=${TRUE_COND}`] },
      ],
      ["envenom", "mutilate"],
    );
    expect(result.kind).toBe("TOKEN_CONVERGED");
    if (result.kind !== "TOKEN_CONVERGED") return;
    expect(result.actionToken).toBe("envenom");
    // The lower `mutilate` was never reached, because the call returned.
    expect(result.candidateEntries.every((step) => step.listName === "spend")).toBe(true);
  });
});

describe("M5-B's scoped walk is unchanged", () => {
  it("still returns SELECTED for the same two-Envenom shape", () => {
    // `selectWithinList` names a SUB-LIST rather than a single entry, so the
    // entry-versus-token distinction never arose there. Its behaviour must not
    // move, or M5-B's committed result would change meaning.
    const authority = syntheticAuthority({
      lists: [
        { listName: "default", actions: ["call_action_list,name=spend,if=combo_points>=5"] },
        { listName: "spend", actions: [`envenom,if=${UNKNOWN_COND}`, `envenom,if=${TRUE_COND}`] },
      ],
    });
    const result = selectWithinList(authority, "spend", BINDINGS, (action) =>
      action.actionToken === "envenom" ? "PROVEN_USABLE" : "UNKNOWN",
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(result.convergedOver.map((line) => line.priorityOrdinal)).toEqual([0, 1]);
  });
});

describe("the first-GCD engine reports token convergence", () => {
  it("reports both entries when two worlds reach the same token", () => {
    const result = runEngine({
      lists: [
        {
          listName: "default",
          actions: ["non_gcd_a", `envenom,if=${UNKNOWN_COND}`, `envenom,if=${TRUE_COND}`],
        },
      ],
      gcdTokens: ["envenom"],
      usableTokens: ["envenom"],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_TOKEN_CONVERGED");
    if (result.kind !== "ROTATIONAL_GCD_TOKEN_CONVERGED") return;
    expect(result.actionToken).toBe("envenom");
    expect(result.candidateSteps.map((step) => step.priorityOrdinal).sort()).toEqual([1, 2]);
  });

  it("keeps ROTATIONAL_GCD_SELECTED entry-exact", () => {
    const result = runEngine({
      lists: [{ listName: "default", actions: [`envenom,if=${TRUE_COND}`] }],
      gcdTokens: ["envenom"],
      usableTokens: ["envenom"],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.selectingStep.priorityOrdinal).toBe(0);
  });
});

describe("convergence across worlds", () => {
  const selected = (ordinal: number, token: string) =>
    ({
      kind: "ROTATIONAL_GCD_SELECTED",
      actionToken: token,
      selectingEntry: [{ listName: "default", priorityOrdinal: ordinal, actionToken: token }],
      selectingStep: {
        applicability: { kind: "APPLICABLE" },
        usabilityVerdict: null,
        targetingRefusal: null,
        gateIrrelevance: null,
        path: [{ listName: "default", priorityOrdinal: ordinal, actionToken: token }],
        listName: "default",
        priorityOrdinal: ordinal,
        actionToken: token,
        actionStringVerbatim: token,
        sourceLine: 100 + ordinal,
        entryKind: "PLAYER_ACTION",
        gate: { kind: "UNCONDITIONAL" },
        usability: "PROVEN_USABLE",
        outcome: "SELECTED",
      },
      nonGcdPrefix: { possibleActions: [], exactSequenceKnown: true, sequence: [] },
      trace: { stateKey: "s", rootListName: "default", scan: "DEFINITE", branches: [], outcome: "SELECTED" },
    }) as const;

  const noAction = {
    kind: "NO_ROTATIONAL_GCD_SELECTED",
    trace: { stateKey: "s", rootListName: "default", scan: "NO_ACTION", branches: [], outcome: "NO_ACTION" },
  } as const;

  it("weakens to TOKEN_CONVERGED when worlds agree on the token only", () => {
    const result = convergeRotationalResults([selected(1, "envenom"), selected(2, "envenom")]);
    expect(result.kind).toBe("ROTATIONAL_GCD_TOKEN_CONVERGED");
    if (result.kind !== "ROTATIONAL_GCD_TOKEN_CONVERGED") return;
    expect(result.candidateSteps.map((step) => step.priorityOrdinal)).toEqual([1, 2]);
  });

  it("stays entry-exact when every world reaches the same entry", () => {
    const result = convergeRotationalResults([selected(1, "envenom"), selected(1, "envenom")]);
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
  });

  it("refuses a mixture of token convergence and NO_ACTION", () => {
    // A world where nothing fires contradicts the claim outright.
    const converged = convergeRotationalResults([selected(1, "envenom"), selected(2, "envenom")]);
    const result = convergeRotationalResults([converged, noAction]);
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("DIVERGENT_GCD_OUTCOMES");
  });

  it("refuses a mixture of token convergence and a DIFFERENT token", () => {
    const converged = convergeRotationalResults([selected(1, "envenom"), selected(2, "envenom")]);
    const result = convergeRotationalResults([converged, selected(3, "mutilate")]);
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("DIVERGENT_GCD_OUTCOMES");
  });

  it("refuses a mixture of token convergence and an UNKNOWN world", () => {
    const converged = convergeRotationalResults([selected(1, "envenom"), selected(2, "envenom")]);
    const refused = {
      kind: "ROTATIONAL_GCD_UNKNOWN",
      blocker: "ONE_SCAN_BLOCKED",
      scanBlocker: "UNSUPPORTED_AUTHORITY_EXPRESSION",
      blockedAt: null,
      detail: "synthetic",
      trace: { stateKey: "s", rootListName: "default", scan: "BLOCKED", branches: [], outcome: "UNKNOWN" },
    } as const;
    const result = convergeRotationalResults([converged, refused]);
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    // A refusal is reported in preference to a divergence: a world never explored
    // is not a world that disagreed.
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("ONE_SCAN_BLOCKED");
  });

  it("collapses duplicate entries reached in several worlds", () => {
    const converged = convergeRotationalResults([selected(1, "envenom"), selected(2, "envenom")]);
    const result = convergeRotationalResults([converged, selected(1, "envenom")]);
    expect(result.kind).toBe("ROTATIONAL_GCD_TOKEN_CONVERGED");
    if (result.kind !== "ROTATIONAL_GCD_TOKEN_CONVERGED") return;
    // Two distinct entries, not three.
    expect(result.candidateSteps).toHaveLength(2);
  });
});
