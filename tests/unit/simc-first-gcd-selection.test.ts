/**
 * The first-GCD rescan engine, on deliberately-shaped synthetic authorities.
 *
 * WHY SYNTHETIC, AND WHY OPAQUE STATE
 *
 * This engine understands no game. It loops, branches, converges and detects
 * cycles over a scan it does not perform and a state it cannot inspect. Testing
 * it against the pinned Rogue authority would test the Rogue adapter — which
 * does not exist yet and is M5-C3c3c's job — rather than the engine.
 *
 * So the state here is two fields nobody could mistake for gameplay:
 *
 *     { disabled: Set<string>; flag: boolean }
 *
 * Transitions disable the action that fired, or flip the flag. That is enough to
 * exercise every rule, and it keeps the engine honest: if a test needed Energy
 * or a cooldown to pass, the engine would have learned something it must not
 * know.
 *
 * THE SHAPE OF EVERY TEST
 *
 *     usability drives which candidates the scan produces
 *     the lane resolver drives whether a candidate terminates the query
 *     the transition provider drives what the next scan sees
 */

import { describe, expect, it } from "vitest";

import {
  firstGcdSelectionAcrossRescans,
  ROTATIONAL_GCD_BLOCKERS,
  type NonGcdTransitionOutcome,
  type RotationalGcdResult,
  type SelectedNonGcdAction,
} from "../../src/simc/first-gcd-selection.js";
import {
  resolveOneForegroundScan,
  selectAcrossLists,
  type OneForegroundScanResult,
  type TraversalStep,
} from "../../src/simc/nested-selection.js";
import {
  provenUsable,
  unknownUsability,
  type ActionUsabilityVerdict,
} from "../../src/simc/action-applicability.js";
import { knownNumber, unknownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import type { ExecutionLane } from "../../src/data/game/ability-gcd-semantics.js";
import type { AplAction } from "../../src/simc/apl-authority.js";
import { syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

/** `combo_points=7` makes one condition definitely TRUE and one definitely FALSE. */
const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: unknownNumber("STATE_NOT_ESTABLISHED"),
  energyPct: unknownNumber("STATE_NOT_ESTABLISHED"),
  dotRemainsSeconds: unknownNumber("STATE_NOT_ESTABLISHED"),
  knownBuffs: [],
};

const TRUE_COND = "combo_points>=5";
const FALSE_COND = "combo_points<5";

/** The opaque synthetic state. Nothing here resembles a game concept. */
interface SyntheticState {
  readonly disabled: readonly string[];
  readonly flag: boolean;
}

const START: SyntheticState = { disabled: [], flag: false };

function stateKey(state: SyntheticState): string {
  return `${[...state.disabled].sort().join(",")}|${String(state.flag)}`;
}

interface HarnessOptions {
  readonly lists: readonly SyntheticListSpec[];
  readonly rootListName?: string;
  /** Tokens whose lane is GCD_CONSUMING. Everything else is NON_GCD by default. */
  readonly gcdTokens?: readonly string[];
  /** Tokens whose lane is deliberately unestablished. */
  readonly unknownLaneTokens?: readonly string[];
  /** Tokens PROVEN_USABLE. Everything else has UNKNOWN usability. */
  readonly usableTokens?: readonly string[];
  /** How each NON_GCD token transitions. Default: disable the token that fired. */
  readonly transitions?: Readonly<
    Record<string, (state: SyntheticState) => NonGcdTransitionOutcome<SyntheticState>>
  >;
  readonly initialState?: SyntheticState;
  /** Records every transition asked for, in order. */
  readonly transitionLog?: string[];
  /** Records every scan's state key, in order. */
  readonly scanLog?: string[];
}

/** The default transition: the action that fired cannot fire again. */
function disableSelf(token: string) {
  return (state: SyntheticState): NonGcdTransitionOutcome<SyntheticState> => ({
    kind: "APPLIED",
    nextState: { ...state, disabled: [...state.disabled, token] },
    timeAdvanceMs: 0,
    evidence: {
      kind: "SYNTHETIC_SELF_DISABLE",
      provenance: "synthetic test",
      stateKeyBefore: stateKey(state),
      stateKeyAfter: stateKey({ ...state, disabled: [...state.disabled, token] }),
    },
  });
}

function runEngine(options: HarnessOptions): RotationalGcdResult {
  const authority = syntheticAuthority({ lists: options.lists as SyntheticListSpec[] });
  const rootListName = options.rootListName ?? "default";

  const scanFor = (state: SyntheticState): OneForegroundScanResult => {
    options.scanLog?.push(stateKey(state));
    const usabilityFor = (action: AplAction): ActionUsabilityVerdict => {
      // A disabled token can no longer be selected. This is the ONLY channel by
      // which state reaches the scan, which is exactly the engine's contract.
      const entryId = `${action.actionToken}@${String(action.priorityOrdinal)}`;
      if (state.disabled.includes(action.actionToken) || state.disabled.includes(entryId)) {
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
      if (options.usableTokens?.includes(action.actionToken) === true) return provenUsable();
      return unknownUsability();
    };
    return resolveOneForegroundScan({
      authority,
      entryListName: rootListName,
      bindings: BINDINGS,
      usabilityFor,
    });
  };

  const laneFor = (step: TraversalStep): ExecutionLane => {
    if (options.unknownLaneTokens?.includes(step.actionToken) === true) return "UNKNOWN_LANE";
    return options.gcdTokens?.includes(step.actionToken) === true ? "GCD_CONSUMING" : "NON_GCD";
  };

  const transitionFor = (
    action: SelectedNonGcdAction,
    state: SyntheticState,
  ): NonGcdTransitionOutcome<SyntheticState> => {
    options.transitionLog?.push(`${action.step.listName}[${String(action.step.priorityOrdinal)}]`);
    const custom = options.transitions?.[action.actionToken];
    return custom === undefined ? disableSelf(action.actionToken)(state) : custom(state);
  };

  return firstGcdSelectionAcrossRescans<SyntheticState>({
    rootListName,
    initialState: options.initialState ?? START,
    stateKey,
    scanFor,
    laneFor,
    transitionFor,
  });
}

/** `list[ordinal] token` for each possible prefix action. */
function prefixLabels(result: RotationalGcdResult): readonly string[] {
  if (result.kind !== "ROTATIONAL_GCD_SELECTED") return [];
  return result.nonGcdPrefix.possibleActions.map(
    (entry) => `${entry.listName}[${String(entry.priorityOrdinal)}] ${entry.actionToken}`,
  );
}

// ==========================================================================
// 1-2. Terminals
// ==========================================================================

describe("a GCD-consuming selection terminates the query", () => {
  it("returns immediately when the first scan definitely selects a GCD action", () => {
    const result = runEngine({
      lists: [{ listName: "default", actions: [`gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.actionToken).toBe("gcd_x");
    // Zero NON_GCD actions fired, and the empty sequence is EXACTLY known.
    expect(result.nonGcdPrefix.possibleActions).toEqual([]);
    expect(result.nonGcdPrefix.exactSequenceKnown).toBe(true);
    expect(result.nonGcdPrefix.sequence).toEqual([]);
  });

  it("never asks for a transition for the terminal action", () => {
    // The query ends at SELECTION. The GCD action is not executed, so nothing
    // after it — including the OFF_GCD pass during its GCD — is in scope.
    const transitionLog: string[] = [];
    runEngine({
      lists: [{ listName: "default", actions: [`gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
      transitionLog,
    });
    expect(transitionLog).toEqual([]);
  });

  it("runs a definite NON_GCD action, rescans, and then terminates", () => {
    const scanLog: string[] = [];
    const result = runEngine({
      lists: [
        {
          listName: "default",
          actions: [`non_gcd_a,if=${TRUE_COND}`, `gcd_x,if=${TRUE_COND}`],
        },
      ],
      gcdTokens: ["gcd_x"],
      usableTokens: ["non_gcd_a", "gcd_x"],
      scanLog,
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.actionToken).toBe("gcd_x");
    expect(prefixLabels(result)).toEqual(["default[0] non_gcd_a"]);
    // TWO scans: the original, and the rescan after A executed.
    expect(scanLog).toEqual(["|false", "non_gcd_a|false"]);
  });
});

// ==========================================================================
// 3. Root restart
// ==========================================================================

describe("a NON_GCD action selected inside a child restarts at the ROOT", () => {
  it("selects an entry ABOVE the call site on the next scan", () => {
    // THE test that protects the pinned semantic, stated positively.
    //
    //     default[0] root_r   GCD, and PROVEN_UNUSABLE to begin with
    //     default[1] call child
    //     child[0]   non_gcd_a
    //
    // Scan 1 eliminates root_r and selects `child[0]`. Its transition disables
    // A and re-enables root_r. The ONLY way the answer can be `default[0]` is if
    // the next scan began again at the top of the ROOT list — resuming inside
    // `child`, or at the next ordinal, or anywhere on the old call stack, would
    // never reach an entry above the call site.
    const transitionLog: string[] = [];
    const result = runEngine({
      lists: [
        {
          listName: "default",
          actions: [`root_r,if=${TRUE_COND}`, "call_action_list,name=child"],
        },
        { listName: "child", actions: [`non_gcd_a,if=${TRUE_COND}`] },
      ],
      gcdTokens: ["root_r"],
      usableTokens: ["non_gcd_a", "root_r"],
      initialState: { disabled: ["root_r"], flag: false },
      transitions: {
        non_gcd_a: (state) => ({
          kind: "APPLIED",
          // A is spent; root_r becomes selectable.
          nextState: { disabled: ["non_gcd_a"], flag: true },
          timeAdvanceMs: 0,
          evidence: {
            kind: "SYNTHETIC_ENABLE_ROOT",
            provenance: "synthetic test",
            stateKeyBefore: stateKey(state),
            stateKeyAfter: stateKey({ disabled: ["non_gcd_a"], flag: true }),
          },
        }),
      },
      transitionLog,
    });

    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.actionToken).toBe("root_r");
    expect(result.selectingStep.listName).toBe("default");
    expect(result.selectingStep.priorityOrdinal).toBe(0);
    // The action that fired first was three coordinates away, inside the callee.
    expect(transitionLog).toEqual(["child[0]"]);
    expect(prefixLabels(result)).toEqual(["child[0] non_gcd_a"]);
  });

  it("scans the ROOT list name on every rescan, never the child", () => {
    const scanLog: string[] = [];
    runEngine({
      lists: [
        { listName: "default", actions: ["call_action_list,name=child", `gcd_x,if=${TRUE_COND}`] },
        { listName: "child", actions: [`non_gcd_a,if=${TRUE_COND}`] },
      ],
      gcdTokens: ["gcd_x"],
      usableTokens: ["non_gcd_a", "gcd_x"],
      scanLog,
    });
    // Two scans, both from the root. The engine has no way to express "resume in
    // child" — `scanFor` is only ever handed a state, and the root list name is
    // fixed for the whole query.
    expect(scanLog).toHaveLength(2);
  });

  it("selects the nested NON_GCD action, then the root GCD action", () => {
    const result = runEngine({
      lists: [
        { listName: "default", actions: ["call_action_list,name=child", `gcd_x,if=${TRUE_COND}`] },
        { listName: "child", actions: [`non_gcd_a,if=${TRUE_COND}`] },
      ],
      gcdTokens: ["gcd_x"],
      usableTokens: ["non_gcd_a", "gcd_x"],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.actionToken).toBe("gcd_x");
    // The prefix action is recorded at ITS OWN authority coordinates, in `child`.
    expect(prefixLabels(result)).toEqual(["child[0] non_gcd_a"]);
  });
});

// ==========================================================================
// 4. Chains
// ==========================================================================

describe("several NON_GCD actions chain, in APL priority order", () => {
  it("fires A, B, C and then selects X", () => {
    const transitionLog: string[] = [];
    const result = runEngine({
      lists: [
        {
          listName: "default",
          actions: [
            `non_gcd_a,if=${TRUE_COND}`,
            `non_gcd_b,if=${TRUE_COND}`,
            `non_gcd_c,if=${TRUE_COND}`,
            `gcd_x,if=${TRUE_COND}`,
          ],
        },
      ],
      gcdTokens: ["gcd_x"],
      usableTokens: ["non_gcd_a", "non_gcd_b", "non_gcd_c", "gcd_x"],
      transitionLog,
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.actionToken).toBe("gcd_x");
    // Priority order is preserved across rescans: the root restart always finds
    // the highest still-selectable entry.
    expect(transitionLog).toEqual(["default[0]", "default[1]", "default[2]"]);
    expect(prefixLabels(result)).toEqual([
      "default[0] non_gcd_a",
      "default[1] non_gcd_b",
      "default[2] non_gcd_c",
    ]);
    // ONE world, so the sequence really is known exactly.
    expect(result.nonGcdPrefix.exactSequenceKnown).toBe(true);
  });
});

// ==========================================================================
// 5-6. THE central convergence tests
// ==========================================================================

describe("an unknown-readiness NON_GCD action is explored both ways", () => {
  it("converges when the execute and skip worlds reach the same GCD action", () => {
    // A might fire and might not. X below it definitely fires. So:
    //   world A:    A executes -> disables itself -> rescan -> X
    //   world X:    A does not fire -> X
    // Both reach the SAME authority entry, so the answer is exact even though
    // the prefix is not.
    const result = runEngine({
      lists: [
        { listName: "default", actions: ["non_gcd_a", `gcd_x,if=${TRUE_COND}`] },
        // `non_gcd_a` is unconditional with UNKNOWN usability -> MAY_SELECT.
      ],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.actionToken).toBe("gcd_x");
    expect(result.selectingStep.listName).toBe("default");
    expect(result.selectingStep.priorityOrdinal).toBe(1);
    // The prefix is NOT unique: one world fired A and the other did not.
    expect(prefixLabels(result)).toEqual(["default[0] non_gcd_a"]);
    expect(result.nonGcdPrefix.exactSequenceKnown).toBe(false);
    expect(result.nonGcdPrefix.sequence).toBeNull();
  });

  it("refuses when the two worlds reach DIFFERENT GCD actions", () => {
    // A's transition makes Y selectable and X unselectable, so the execute world
    // answers Y and the skip world answers X. Neither may be chosen.
    const result = runEngine({
      lists: [
        { listName: "default", actions: ["non_gcd_a", `gcd_y,if=${TRUE_COND}`, `gcd_x,if=${TRUE_COND}`] },
      ],
      gcdTokens: ["gcd_x", "gcd_y"],
      usableTokens: ["gcd_x"],
      transitions: {
        non_gcd_a: (state) => ({
          kind: "APPLIED",
          // Disabling X leaves Y — which is ABOVE X — as the selection.
          nextState: { disabled: [...state.disabled, "non_gcd_a", "gcd_x"], flag: true },
          timeAdvanceMs: 0,
          evidence: {
            kind: "SYNTHETIC_DIVERGE",
            provenance: "synthetic test",
            stateKeyBefore: stateKey(state),
            stateKeyAfter: "diverged",
          },
        }),
      },
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    // Either a genuine divergence, or a refusal in one of the worlds. What must
    // NOT happen is a confident answer.
    expect(ROTATIONAL_GCD_BLOCKERS).toContain(result.blocker);
  });
});

// ==========================================================================
// 7-8. Prefix and identity
// ==========================================================================

describe("different prefixes may still converge on one entry", () => {
  it("keeps the terminal exact and the prefix a union", () => {
    // A and B both merely MIGHT fire; X below them definitely does. Three
    // worlds (A fires, B fires, neither) all reach X.
    const result = runEngine({
      lists: [{ listName: "default", actions: ["non_gcd_a", "non_gcd_b", `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.actionToken).toBe("gcd_x");
    expect([...prefixLabels(result)].sort()).toEqual(["default[0] non_gcd_a", "default[1] non_gcd_b"]);
    expect(result.nonGcdPrefix.exactSequenceKnown).toBe(false);
  });
});

describe("the same token at different authority entries does not converge", () => {
  it("refuses rather than reporting one of the two entries", () => {
    // TWO entries, one token. The skip world answers `default[1] gcd_x`; the
    // execute world disables that ENTRY and answers `default[2] gcd_x`. Both
    // worlds say "gcd_x" and they are not the same claim, because a SELECTED
    // result names a concrete list, ordinal, verbatim string and source line.
    const result = runEngine({
      lists: [
        {
          listName: "default",
          actions: ["non_gcd_a", `gcd_x,if=${TRUE_COND}`, `gcd_x,if=${TRUE_COND}`],
        },
      ],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
      transitions: {
        non_gcd_a: (state) => ({
          kind: "APPLIED",
          nextState: { disabled: [...state.disabled, "non_gcd_a", "gcd_x@1"], flag: true },
          timeAdvanceMs: 0,
          evidence: {
            kind: "SYNTHETIC_SHIFT_ENTRY",
            provenance: "synthetic test",
            stateKeyBefore: stateKey(state),
            stateKeyAfter: "shifted",
          },
        }),
      },
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("DIVERGENT_GCD_OUTCOMES");
    // The refusal NAMES both entries rather than picking the more common one.
    expect(result.detail).toContain("default[1]");
    expect(result.detail).toContain("default[2]");
  });

  it("converges when both worlds reach the SAME entry", () => {
    // The control for the test above: identical shape, except the transition
    // does not move the answer. Token agreement plus entry agreement converges.
    const result = runEngine({
      lists: [
        {
          listName: "default",
          actions: ["non_gcd_a", `gcd_x,if=${TRUE_COND}`, `gcd_x,if=${TRUE_COND}`],
        },
      ],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.selectingStep.priorityOrdinal).toBe(1);
  });
});

// ==========================================================================
// 9-11. Refusals
// ==========================================================================

describe("a refusal is never resolved into an answer", () => {
  it("refuses when a selectable action has no established lane", () => {
    const result = runEngine({
      lists: [{ listName: "default", actions: [`mystery,if=${TRUE_COND}`] }],
      unknownLaneTokens: ["mystery"],
      usableTokens: ["mystery"],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("UNKNOWN_EXECUTION_LANE");
    expect(result.blockedAt?.actionToken).toBe("mystery");
  });

  it("never asks for a transition for an unknown-lane action", () => {
    // It might be the answer. Executing it would assume it is not.
    const transitionLog: string[] = [];
    runEngine({
      lists: [{ listName: "default", actions: [`mystery,if=${TRUE_COND}`] }],
      unknownLaneTokens: ["mystery"],
      usableTokens: ["mystery"],
      transitionLog,
    });
    expect(transitionLog).toEqual([]);
  });

  it("refuses when a fired NON_GCD action has no supported transition", () => {
    const result = runEngine({
      lists: [{ listName: "default", actions: [`non_gcd_a,if=${TRUE_COND}`, `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["non_gcd_a", "gcd_x"],
      transitions: {
        non_gcd_a: () => ({ kind: "UNSUPPORTED", detail: "synthetic: no model for this action" }),
      },
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("TRANSITION_UNSUPPORTED");
    expect(result.blockedAt?.actionToken).toBe("non_gcd_a");
    expect(result.blockedAt?.listName).toBe("default");
    expect(result.detail).toContain("no model");
  });

  it("distinguishes an unsupported transition from an unknown one", () => {
    const result = runEngine({
      lists: [{ listName: "default", actions: [`non_gcd_a,if=${TRUE_COND}`, `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["non_gcd_a", "gcd_x"],
      transitions: {
        non_gcd_a: () => ({ kind: "UNKNOWN", detail: "synthetic: modelled, evidence insufficient" }),
      },
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("TRANSITION_UNKNOWN");
  });

  it("REFUSES a transition that advances simulated time", () => {
    // Not applied, and not silently ignored. Δt = 0 is the only supported case.
    const result = runEngine({
      lists: [{ listName: "default", actions: [`non_gcd_a,if=${TRUE_COND}`, `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["non_gcd_a", "gcd_x"],
      transitions: {
        non_gcd_a: (state) => ({
          kind: "APPLIED",
          nextState: { ...state, disabled: [...state.disabled, "non_gcd_a"] },
          timeAdvanceMs: 1,
          evidence: {
            kind: "SYNTHETIC_TIME",
            provenance: "synthetic test",
            stateKeyBefore: stateKey(state),
            stateKeyAfter: "later",
          },
        }),
      },
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_TIME_ADVANCE");
  });

  it("carries the underlying scan's own blocker when the scan refuses", () => {
    const result = runEngine({
      // `refreshable` is real pinned syntax outside the supported subset.
      lists: [{ listName: "default", actions: ["gcd_x,if=refreshable"] }],
      gcdTokens: ["gcd_x"],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("ONE_SCAN_BLOCKED");
    // The one-scan vocabulary is preserved rather than flattened into this
    // layer's, so a reader can see WHICH refusal happened.
    expect(result.scanBlocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
  });
});

// ==========================================================================
// 12-13. Cycles
// ==========================================================================

describe("no progress is a cycle, detected by state and never by depth", () => {
  it("refuses a transition that returns an equivalent state", () => {
    const result = runEngine({
      lists: [{ listName: "default", actions: [`non_gcd_a,if=${TRUE_COND}`, `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["non_gcd_a", "gcd_x"],
      transitions: {
        // Applies, reports zero time, and changes nothing. A depth cap would
        // hide this; a state key catches it on the first repeat.
        non_gcd_a: (state) => ({
          kind: "APPLIED",
          nextState: state,
          timeAdvanceMs: 0,
          evidence: {
            kind: "SYNTHETIC_NO_OP",
            provenance: "synthetic test",
            stateKeyBefore: stateKey(state),
            stateKeyAfter: stateKey(state),
          },
        }),
      },
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("NO_PROGRESS_CYCLE");
  });

  it("detects a TWO-state cycle, not merely an immediate self-loop", () => {
    // A flips the flag. With the flag set, A is still selectable and flips it
    // back. State alternates forever and no GCD is ever selected.
    const result = runEngine({
      lists: [{ listName: "default", actions: [`non_gcd_a,if=${TRUE_COND}`, `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["non_gcd_a", "gcd_x"],
      transitions: {
        non_gcd_a: (state) => ({
          kind: "APPLIED",
          nextState: { disabled: state.disabled, flag: !state.flag },
          timeAdvanceMs: 0,
          evidence: {
            kind: "SYNTHETIC_TOGGLE",
            provenance: "synthetic test",
            stateKeyBefore: stateKey(state),
            stateKeyAfter: stateKey({ disabled: state.disabled, flag: !state.flag }),
          },
        }),
      },
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("NO_PROGRESS_CYCLE");
  });
});

// ==========================================================================
// 14-15. NO_ACTION
// ==========================================================================

describe("a scan proving nothing fires is an answer, not a gap", () => {
  it("returns NO_ROTATIONAL_GCD_SELECTED when every entry is eliminated", () => {
    const result = runEngine({
      lists: [{ listName: "default", actions: [`gcd_x,if=${FALSE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
    });
    expect(result.kind).toBe("NO_ROTATIONAL_GCD_SELECTED");
  });

  it("refuses when one world selects a GCD action and another selects nothing", () => {
    // The MAY_SELECT no-selection world. `gcd_x` might fire and might not, so
    // there is no action every world agrees fires first.
    const result = runEngine({
      lists: [{ listName: "default", actions: ["gcd_x"] }],
      gcdTokens: ["gcd_x"],
      // UNKNOWN usability, unconditional gate -> MAY_SELECT, no definite winner.
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("DIVERGENT_GCD_OUTCOMES");
    expect(result.detail).toContain("returns nothing");
  });

  it("refuses when one world is blocked and another selects", () => {
    const result = runEngine({
      lists: [
        {
          listName: "default",
          actions: ["non_gcd_a", `gcd_x,if=${TRUE_COND}`],
        },
      ],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
      transitions: {
        non_gcd_a: () => ({ kind: "UNSUPPORTED", detail: "synthetic: unmodelled" }),
      },
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    // A refusal is reported in preference to a divergence: one world was never
    // explored, so claiming the worlds disagree would overstate what is known.
    expect(result.blocker).toBe("TRANSITION_UNSUPPORTED");
  });
});

// ==========================================================================
// 17-19. What stays inside one scan
// ==========================================================================

describe("the engine acts only on a scan's final resolution", () => {
  it("does not treat a variable assignment as a rescan", () => {
    const transitionLog: string[] = [];
    const scanLog: string[] = [];
    const result = runEngine({
      lists: [
        {
          listName: "default",
          actions: ["variable,name=v,value=1", `gcd_x,if=${TRUE_COND}`],
        },
      ],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
      transitionLog,
      scanLog,
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    // ONE scan and NO transition: `variable` executes and the scan continues,
    // which is C3b's job and stays there.
    expect(scanLog).toHaveLength(1);
    expect(transitionLog).toEqual([]);
  });

  it("does not treat an empty child call as a rescan", () => {
    const scanLog: string[] = [];
    const result = runEngine({
      lists: [
        { listName: "default", actions: ["call_action_list,name=child", `gcd_x,if=${TRUE_COND}`] },
        { listName: "child", actions: [`nothing,if=${FALSE_COND}`] },
      ],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x", "nothing"],
      scanLog,
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.actionToken).toBe("gcd_x");
    expect(scanLog).toHaveLength(1);
  });

  it("preserves literal APL candidate order when branching", () => {
    // Three MAY_SELECT candidates. The trace's branches must appear in the order
    // the scan produced them, which is literal priority order — not a set.
    const result = runEngine({
      lists: [{ listName: "default", actions: ["non_gcd_a", "non_gcd_b", "non_gcd_c"] }],
    });
    expect(result.trace.scan).toBe("MAY_SELECT");
    const labelled = result.trace.branches.filter((branch) => branch.entry !== null);
    expect(labelled.map((branch) => branch.entry?.actionToken)).toEqual([
      "non_gcd_a",
      "non_gcd_b",
      "non_gcd_c",
    ]);
    // And the no-selection world is present, last, and carries no entry.
    const last = result.trace.branches.at(-1);
    expect(last?.entry).toBeNull();
    expect(last?.label).toContain("no candidate fires");
  });
});

// ==========================================================================
// 20-21. Memoization and prefix honesty
// ==========================================================================

describe("shared abstract states are explored once", () => {
  it("reuses a result reached by two different prefixes", () => {
    // A and B both disable themselves AND each other, so both orders reach the
    // same state. Without memoization that state would be explored twice.
    const scanLog: string[] = [];
    const bothDisabled = (state: SyntheticState): NonGcdTransitionOutcome<SyntheticState> => ({
      kind: "APPLIED",
      nextState: { disabled: ["non_gcd_a", "non_gcd_b"], flag: state.flag },
      timeAdvanceMs: 0,
      evidence: {
        kind: "SYNTHETIC_CONVERGE",
        provenance: "synthetic test",
        stateKeyBefore: stateKey(state),
        stateKeyAfter: "non_gcd_a,non_gcd_b|false",
      },
    });
    const result = runEngine({
      lists: [{ listName: "default", actions: ["non_gcd_a", "non_gcd_b", `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
      transitions: { non_gcd_a: bothDisabled, non_gcd_b: bothDisabled },
      scanLog,
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    // The initial state plus ONE shared successor. Two scans, not three.
    expect(new Set(scanLog).size).toBe(2);
    expect(scanLog).toHaveLength(2);
  });

  it("never reports one invented prefix sequence", () => {
    const result = runEngine({
      lists: [{ listName: "default", actions: ["non_gcd_a", "non_gcd_b", `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
    });
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") throw new Error("expected a selection");
    // Several worlds, several prefixes. The summary says so rather than picking.
    expect(result.nonGcdPrefix.exactSequenceKnown).toBe(false);
    expect(result.nonGcdPrefix.sequence).toBeNull();
    expect(result.nonGcdPrefix.possibleActions.length).toBeGreaterThan(1);
  });

  it("answers 'why is X first?' from the trace", () => {
    const result = runEngine({
      lists: [{ listName: "default", actions: ["non_gcd_a", `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
    });
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") throw new Error("expected a selection");
    // Both worlds are visible, and both name the same terminal.
    expect(result.trace.branches).toHaveLength(2);
    for (const branch of result.trace.branches) {
      expect(branch.outcome).toContain("gcd_x");
    }
    expect(result.trace.outcome).toContain("SELECTED");
  });
});

// ==========================================================================
// 22. The existing one-scan API is untouched
// ==========================================================================

describe("the one-scan query keeps its own meaning", () => {
  it("still answers 'what does THIS scan select', with no rescanning", () => {
    // The same authority as the chain test above. `selectAcrossLists` sees a
    // NON_GCD action fire and reports THAT — it does not rescan, and it does not
    // reach `gcd_x`. Two queries, two answers, both correct.
    const authority = syntheticAuthority({
      lists: [{ listName: "default", actions: [`non_gcd_a,if=${TRUE_COND}`, `gcd_x,if=${TRUE_COND}`] }],
    });
    const usabilityFor = (action: AplAction): ActionUsabilityVerdict =>
      ["non_gcd_a", "gcd_x"].includes(action.actionToken) ? provenUsable() : unknownUsability();

    const oneScan = selectAcrossLists({
      authority,
      entryListName: "default",
      bindings: BINDINGS,
      usabilityFor,
    });
    expect(oneScan.kind).toBe("SELECTED");
    if (oneScan.kind !== "SELECTED") return;
    expect(oneScan.actionToken).toBe("non_gcd_a");
  });

  it("exposes the same scan unflattened, without changing it", () => {
    const authority = syntheticAuthority({
      lists: [{ listName: "default", actions: [`non_gcd_a,if=${TRUE_COND}`, `gcd_x,if=${TRUE_COND}`] }],
    });
    const usabilityFor = (action: AplAction): ActionUsabilityVerdict =>
      ["non_gcd_a", "gcd_x"].includes(action.actionToken) ? provenUsable() : unknownUsability();
    const input = { authority, entryListName: "default", bindings: BINDINGS, usabilityFor };

    const flattened = selectAcrossLists(input);
    const raw = resolveOneForegroundScan(input);
    expect(raw.kind).toBe("RESOLVED");
    if (raw.kind !== "RESOLVED" || flattened.kind !== "SELECTED") return;
    expect(raw.resolution.kind).toBe("DEFINITE");
    if (raw.resolution.kind !== "DEFINITE") return;
    // Same selection, same steps: one is the other with the flattening removed.
    expect(raw.resolution.identity).toBe(flattened.actionToken);
    expect(raw.steps.map((step) => step.outcome)).toEqual(flattened.steps.map((step) => step.outcome));
  });

  it("reports MAY_SELECT and AMBIGUOUS as different resolutions", () => {
    // The distinction the rescan engine depends on. Same shape of list; the only
    // difference is whether a candidate is PROVEN to fire.
    const lists = [{ listName: "default", actions: ["non_gcd_a", `gcd_x,if=${TRUE_COND}`] }];
    const authority = syntheticAuthority({ lists });

    const mayScan = resolveOneForegroundScan({
      authority,
      entryListName: "default",
      bindings: BINDINGS,
      usabilityFor: () => unknownUsability(),
    });
    expect(mayScan.kind === "RESOLVED" && mayScan.resolution.kind).toBe("MAY_SELECT");

    const ambiguousScan = resolveOneForegroundScan({
      authority,
      entryListName: "default",
      bindings: BINDINGS,
      usabilityFor: (action: AplAction) =>
        action.actionToken === "gcd_x" ? provenUsable() : unknownUsability(),
    });
    expect(ambiguousScan.kind === "RESOLVED" && ambiguousScan.resolution.kind).toBe("AMBIGUOUS");
  });
});
