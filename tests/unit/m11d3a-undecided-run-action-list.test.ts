/**
 * M11-D3-A: an UNDECIDED `run_action_list` gate explores both worlds.
 *
 * PINNED SEMANTICS (SimulationCraft 33622e9d; M11-B1 recorded them and D3-A
 * re-read them): a ready run entry is not ACTION_CALL, so `select_action`
 * RETURNS it (player.cpp:14264-14267); `run_action_list_t::execute` records the
 * list to restore and activates the child (action.cpp:4740-4754); the next
 * `execute_action` selects over the CHILD and restores the parent only after
 * that selection (player.cpp:7376-7386). So:
 *
 *     gate TRUE    the child replaces the parent for this selection; a child
 *                  that selects nothing is a selection of NOTHING
 *     gate FALSE   the entry is not ready; the parent continues
 *     undecided    both worlds, neither preferred
 *
 * A call differs exactly once: a callee that returns nothing falls through to
 * the caller's next ordinal (player.cpp:14255-14260). A run never does.
 *
 * THE ATTRIBUTION RULE. Exploring the worlds may CONVERGE an undecided gate;
 * it may never MOVE the stop. If every world agrees on one result, that result
 * stands. Otherwise — the worlds disagree, or either is unresolved — the stop
 * is the gate itself, classified by the gate's own predicate, exactly as before
 * the worlds were explored. An obstacle found only inside the speculative TRUE
 * child is not the stop: that child is real only if the gate holds. A gate
 * PROVEN TRUE makes the child real, and then the child's obstacle is the stop.
 *
 * The central invariant every case below checks: uncertainty is UNKNOWN,
 * never REJECTED.
 */

import { describe, expect, it } from "vitest";

import type { ExecutionLane } from "../../src/data/game/ability-gcd-semantics.js";
import {
  compareObservedAction,
  type ComparisonOutcome,
  type ObservedRotationalDecision,
} from "../../src/findings/observed-comparison.js";
import {
  allApplicable,
  provenUsable,
  unknownApplicability,
  unknownUsability,
  type ActionApplicability,
  type ActionUsabilityVerdict,
} from "../../src/simc/action-applicability.js";
import type { AplAction } from "../../src/simc/apl-authority.js";
import { classifyDecision } from "../../src/simc/decision-coverage.js";
import { knownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import { isBuiltinIdentifier } from "../../src/simc/expression/parse.js";
import { defineSpecAtomVocabulary } from "../../src/simc/expression/spec-vocabulary.js";
import {
  firstGcdSelectionAcrossRescans,
  type NonGcdTransitionOutcome,
  type RotationalGcdResult,
  type SelectedNonGcdAction,
} from "../../src/simc/first-gcd-selection.js";
import {
  resolveOneForegroundScan,
  selectAcrossLists,
  type NestedSelectionInput,
  type OneForegroundScanResult,
  type TraversalResult,
  type TraversalStep,
} from "../../src/simc/nested-selection.js";
import { syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: knownNumber(0),
  energyPct: knownNumber(100),
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
};

const TRUE_COND = "combo_points>=5";
const FALSE_COND = "combo_points<5";
/** Supported syntax whose value is never bound: an UNDECIDED gate. */
const UNKNOWN_COND = "fight_remains<15";
/** Syntax the parser refuses whole: an UNSUPPORTED condition. */
const UNSUPPORTED_COND = "active_dot.garrote>1";
/** A buff gate. `foo` is absent from `knownBuffs`, so it is unresolved — never read as down. */
const BUFF_COND = "buff.foo.up";

// ---------------------------------------------------------------------------
// Harness: one scan, and the first-GCD query over the same scan
// ---------------------------------------------------------------------------

interface Setup {
  readonly lists: readonly SyntheticListSpec[];
  readonly usable: readonly string[];
  readonly bindings?: AtomBindings;
  /** Tokens whose applicability is UNKNOWN (profile evidence missing). */
  readonly applicabilityUnknown?: readonly string[];
}

function inputOf(
  setup: Setup,
  usabilityFor: NestedSelectionInput["usabilityFor"] = (action) =>
    setup.usable.includes(action.actionToken) ? provenUsable() : unknownUsability(),
): NestedSelectionInput {
  const unknown = setup.applicabilityUnknown ?? [];
  return {
    authority: syntheticAuthority({ lists: setup.lists as SyntheticListSpec[] }),
    entryListName: "default",
    bindings: setup.bindings ?? BINDINGS,
    usabilityFor,
    applicabilityFor: (action: AplAction): ActionApplicability =>
      unknown.includes(action.actionToken)
        ? unknownApplicability("synthetic: profile evidence missing")
        : allApplicable()(action),
  };
}

/** One flattened scan. */
function scan(setup: Setup): TraversalResult {
  return selectAcrossLists(inputOf(setup));
}

/** One unflattened scan — the shape that carries the explored worlds. */
function rawScan(setup: Setup): OneForegroundScanResult {
  return resolveOneForegroundScan(inputOf(setup));
}

interface BranchState {
  readonly disabled: readonly string[];
}
const keyOf = (state: BranchState): string => [...state.disabled].sort().join(",");

interface Seen {
  readonly state: string;
  readonly token: string;
  readonly verdict: ActionUsabilityVerdict["kind"];
}

/** The first-GCD query: NON_GCD tokens fire, disable themselves in THEIR branch, and the root is rescanned. */
function firstGcd(setup: Setup, gcdTokens: readonly string[], seen: Seen[] = []): RotationalGcdResult {
  const scanFor = (state: BranchState): OneForegroundScanResult =>
    resolveOneForegroundScan(
      inputOf(setup, (action: AplAction): ActionUsabilityVerdict => {
        const verdict: ActionUsabilityVerdict = state.disabled.includes(action.actionToken)
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
          : setup.usable.includes(action.actionToken)
            ? provenUsable()
            : unknownUsability();
        seen.push({ state: keyOf(state), token: action.actionToken, verdict: verdict.kind });
        return verdict;
      }),
    );
  const laneFor = (step: TraversalStep): ExecutionLane =>
    gcdTokens.includes(step.actionToken) ? "GCD_CONSUMING" : "NON_GCD";
  const transitionFor = (
    action: SelectedNonGcdAction,
    state: BranchState,
  ): NonGcdTransitionOutcome<BranchState> => {
    const nextState = { disabled: [...state.disabled, action.actionToken] };
    return {
      kind: "APPLIED",
      nextState,
      timeAdvanceMs: 0,
      evidence: {
        kind: "SYNTHETIC",
        provenance: "synthetic test",
        stateKeyBefore: keyOf(state),
        stateKeyAfter: keyOf(nextState),
      },
    };
  };
  return firstGcdSelectionAcrossRescans<BranchState>({
    rootListName: "default",
    initialState: { disabled: [] },
    stateKey: keyOf,
    scanFor,
    laneFor,
    transitionFor,
  });
}

/** The comparison the analyzers make, against an observed token. */
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

/** A spec identifier admitted through the real vocabulary seam and never bound. */
function withVocabulary(declarations: Readonly<Record<string, "NUMERIC" | "BOOLEAN">>): AtomBindings {
  return {
    ...BINDINGS,
    specAtoms: {
      vocabulary: defineSpecAtomVocabulary(
        "synthetic/test",
        Object.entries(declarations).map(([identifier, shape]) => ({
          identifier,
          shape,
          scope: "PLAYER_SCOPED" as const,
          selfAddressing: false,
        })),
        isBuiltinIdentifier,
      ),
      bound: [],
    },
  };
}

const visited = (result: { readonly steps: readonly TraversalStep[] }): readonly string[] =>
  result.steps.map((step) => `${step.listName}[${String(step.priorityOrdinal)}]`);
const outcomeAt = (result: { readonly steps: readonly TraversalStep[] }, list: string, ordinal: number) =>
  result.steps.find((step) => step.listName === list && step.priorityOrdinal === ordinal)?.outcome;
const at = (
  step: { readonly listName: string; readonly priorityOrdinal: number } | null | undefined,
): string | null =>
  step === null || step === undefined ? null : `${step.listName}[${String(step.priorityOrdinal)}]`;

/** The stop a non-converging scan reports: the gate, with the trace an unexplored gate left. */
function expectGateStop(result: TraversalResult, blocker: string, label: string): void {
  expect(result.kind, label).toBe("UNKNOWN");
  if (result.kind !== "UNKNOWN") return;
  expect(result.blocker, label).toBe(blocker);
  expect(at(result.blockedAt), label).toBe("default[0]");
  expect(result.blockedAt?.outcome, label).toBe("BLOCKED");
  expect(visited(result), label).toEqual(["default[0]"]);
  expect(outcomeAt(result, "default", 0), label).toBe("BLOCKED");
}

const OBSERVED = ["x", "y", "z", "gcd_x", "gcd_y"];

// ---------------------------------------------------------------------------
// A–F: the gate worlds
// ---------------------------------------------------------------------------

describe("an undecided run gate's two worlds", () => {
  it("A: TRUE -> x and FALSE -> x converge on x, at token precision, and the comparison can MATCH", () => {
    const setup: Setup = {
      lists: [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${UNKNOWN_COND}`, `x,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`x,if=${TRUE_COND}`] },
      ],
      usable: ["x"],
    };
    const one = scan(setup);
    expect(one.kind === "TOKEN_CONVERGED" && one.actionToken).toBe("x");
    expect(outcomeAt(one, "default", 0)).toBe("RUN_GATE_UNDECIDED_MAY_TRANSFER");
    expect(visited(one)).toEqual(["default[0]", "child[0]", "default[1]"]);
    const query = firstGcd(setup, ["x"]);
    expect(query.kind).toBe("ROTATIONAL_GCD_TOKEN_CONVERGED");
    expect(compared(query, "x")).toBe("MATCH");
    // Every world selects x, so a different observed token is a supported
    // disagreement — the only case in this file a REJECTED may come from.
    expect(compared(query, "y")).toBe("REJECTED");
  });

  it("B: TRUE -> x and FALSE -> y diverge: UNKNOWN at the gate, the worlds explored, nothing REJECTED", () => {
    const setup: Setup = {
      lists: [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${UNKNOWN_COND}`, `y,if=${TRUE_COND}`],
        },
        { listName: "child", actions: [`x,if=${TRUE_COND}`] },
      ],
      usable: ["x", "y"],
    };
    expectGateStop(scan(setup), "UNDECIDED_RUN_GATE", "flattened");

    // Internal evidence: both worlds WERE explored, and they disagree.
    const raw = rawScan(setup);
    expect(raw.kind).toBe("BLOCKED");
    if (raw.kind !== "BLOCKED") return;
    expect(raw.blocker).toBe("UNDECIDED_RUN_GATE");
    expect(at(raw.blockedAt)).toBe("default[0]");
    expect(visited(raw)).toEqual(["default[0]"]);
    expect(raw.explored?.resolution.kind).toBe("AMBIGUOUS");
    expect(raw.explored && visited(raw.explored)).toEqual(["default[0]", "child[0]", "default[1]"]);
    expect(raw.explored && outcomeAt(raw.explored, "default", 0)).toBe("RUN_GATE_UNDECIDED_MAY_TRANSFER");

    const query = firstGcd(setup, ["x", "y"]);
    expect(query.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (query.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect([query.blocker, query.scanBlocker, at(query.blockedAt)]).toEqual([
      "ONE_SCAN_BLOCKED",
      "UNDECIDED_RUN_GATE",
      "default[0]",
    ]);
    // Never DIVERGENT_WORLDS and never a competing child entry: the gate.
    expect(classifyDecision(query).rawBlocker).toBe("ONE_SCAN_BLOCKED/UNDECIDED_RUN_GATE");
    for (const observed of OBSERVED) expect(compared(query, observed), observed).toBe("UNKNOWN");
  });

  it("C: the TRUE world is blocked (unsupported, missing state, inapplicable): UNKNOWN at the gate", () => {
    const trueWorlds: readonly {
      readonly entry: string;
      readonly unknownApplicability?: readonly string[];
    }[] = [
      { entry: `x,if=${UNSUPPORTED_COND}` },
      { entry: `x,if=${UNKNOWN_COND}` },
      { entry: `x,if=${TRUE_COND}`, unknownApplicability: ["x"] },
    ];
    for (const world of trueWorlds) {
      const setup: Setup = {
        lists: [
          {
            listName: "default",
            actions: [`run_action_list,name=child,if=${UNKNOWN_COND}`, `x,if=${TRUE_COND}`],
          },
          { listName: "child", actions: [world.entry] },
        ],
        usable: ["x"],
        ...(world.unknownApplicability === undefined
          ? {}
          : { applicabilityUnknown: world.unknownApplicability }),
      };
      // The FALSE world (x) never stands in for the unresolved TRUE world, and
      // the TRUE world's obstacle is not the stop.
      expectGateStop(scan(setup), "UNDECIDED_RUN_GATE", world.entry);
      const query = firstGcd(setup, ["x"]);
      expect(query.kind === "ROTATIONAL_GCD_UNKNOWN" && query.scanBlocker, world.entry).toBe(
        "UNDECIDED_RUN_GATE",
      );
      for (const observed of OBSERVED)
        expect(compared(query, observed), `${world.entry} ${observed}`).toBe("UNKNOWN");
    }
  });

  it("D: the FALSE world is blocked (missing state, unsupported syntax): UNKNOWN at the gate", () => {
    for (const falseWorld of [`y,if=${UNKNOWN_COND}`, `y,if=${UNSUPPORTED_COND}`]) {
      const setup: Setup = {
        lists: [
          { listName: "default", actions: [`run_action_list,name=child,if=${UNKNOWN_COND}`, falseWorld] },
          { listName: "child", actions: [`x,if=${TRUE_COND}`] },
        ],
        usable: ["x", "y"],
      };
      expectGateStop(scan(setup), "UNDECIDED_RUN_GATE", falseWorld);
      const query = firstGcd(setup, ["x", "y"]);
      expect(query.kind === "ROTATIONAL_GCD_UNKNOWN" && query.scanBlocker, falseWorld).toBe(
        "UNDECIDED_RUN_GATE",
      );
      for (const observed of OBSERVED)
        expect(compared(query, observed), `${falseWorld} ${observed}`).toBe("UNKNOWN");
    }
  });

  it("E: an empty child is NOTHING, never a fall-through, under an undecided gate and a TRUE one", () => {
    const parent = (gate: string, below: string): Setup => ({
      lists: [
        { listName: "default", actions: [`run_action_list,name=child,if=${gate}`, below] },
        { listName: "child", actions: [`y,if=${FALSE_COND}`] },
      ],
      usable: ["x", "y"],
    });
    // Undecided: TRUE selects nothing, FALSE selects x. "x or nothing" — the gate.
    const undecided = parent(UNKNOWN_COND, `x,if=${TRUE_COND}`);
    expectGateStop(scan(undecided), "UNDECIDED_RUN_GATE", "x or nothing");
    const query = firstGcd(undecided, ["x"]);
    expect(query.kind === "ROTATIONAL_GCD_UNKNOWN" && query.scanBlocker).toBe("UNDECIDED_RUN_GATE");
    for (const observed of OBSERVED) expect(compared(query, observed), observed).toBe("UNKNOWN");

    // Both worlds select nothing: that is agreement, and a proof.
    expect(scan(parent(UNKNOWN_COND, `x,if=${FALSE_COND}`)).kind).toBe("NO_ACTION_SELECTED");

    // TRUE: the child selects nothing and the parent's x is NOT fallen through to.
    const proven = scan(parent(TRUE_COND, `x,if=${TRUE_COND}`));
    expect(proven.kind).toBe("NO_ACTION_SELECTED");
    expect(outcomeAt(proven, "default", 0)).toBe("RUN_RETURNED_NO_ACTION_SCAN_ENDS");
    expect(visited(proven)).toEqual(["default[0]", "child[0]"]);
  });

  it("F: an undecided active_enemies gate whose worlds diverge is TARGET_COUNT at the gate, never REJECTED", () => {
    const setup: Setup = {
      lists: [
        { listName: "default", actions: ["run_action_list,name=aoe,if=active_enemies>=2", "gcd_x"] },
        { listName: "aoe", actions: ["gcd_y"] },
      ],
      usable: ["gcd_x", "gcd_y"],
      bindings: withVocabulary({ active_enemies: "NUMERIC" }),
    };
    expectGateStop(scan(setup), "UNDECIDED_RUN_GATE", "target count");
    const raw = rawScan(setup);
    expect(raw.kind === "BLOCKED" && raw.explored && visited(raw.explored)).toEqual([
      "default[0]",
      "aoe[0]",
      "default[1]",
    ]);

    const query = firstGcd(setup, ["gcd_x", "gcd_y"]);
    const classified = classifyDecision(query);
    expect(classified.coverage).toBe("UNKNOWN");
    expect(classified.rawBlocker).toBe("ONE_SCAN_BLOCKED/UNDECIDED_RUN_GATE");
    // The gate's own predicate classifies it — not the divergence of its worlds.
    expect(classified.blockerClass).toBe("TARGET_COUNT");
    expect(classified.blockerClass).not.toBe("DIVERGENT_WORLDS");
    expect(at(classified.blockedAt)).toBe("default[0]");
    for (const observed of OBSERVED) expect(compared(query, observed), observed).toBe("UNKNOWN");
  });

  it("missing state is never read as FALSE: reading the gate FALSE would have REJECTED an observed x", () => {
    const child = { listName: "child", actions: [`x,if=${TRUE_COND}`] };
    const asFalse = firstGcd(
      {
        lists: [
          {
            listName: "default",
            actions: [`run_action_list,name=child,if=${FALSE_COND}`, `y,if=${TRUE_COND}`],
          },
          child,
        ],
        usable: ["x", "y"],
      },
      ["x", "y"],
    );
    expect(compared(asFalse, "x")).toBe("REJECTED");
    const undecided = firstGcd(
      {
        lists: [
          {
            listName: "default",
            actions: [`run_action_list,name=child,if=${UNKNOWN_COND}`, `y,if=${TRUE_COND}`],
          },
          child,
        ],
        usable: ["x", "y"],
      },
      ["x", "y"],
    );
    expect(compared(undecided, "x")).toBe("UNKNOWN");
  });
});

// ---------------------------------------------------------------------------
// G–H: a speculative child's obstacle is not the stop; a real child's is
// ---------------------------------------------------------------------------

describe("whose obstacle is the stop", () => {
  const buffGated = (bindings: AtomBindings): Setup => ({
    lists: [
      { listName: "default", actions: [`run_action_list,name=child,if=${BUFF_COND}`, `y,if=${TRUE_COND}`] },
      // The child's first entry is a possibly-firing candidate, so the
      // applicability obstacle below it would surface through the earliest-
      // obstacle rule as a competing child entry if the child were real.
      { listName: "child", actions: [`x,if=${UNKNOWN_COND}`, `w,if=${TRUE_COND}`] },
    ],
    usable: ["x", "w", "y"],
    applicabilityUnknown: ["w"],
    bindings,
  });

  it("G: an undecided BUFF gate stays the stop when its speculative child has an applicability obstacle", () => {
    const setup = buffGated(BINDINGS);
    const one = scan(setup);
    expectGateStop(one, "UNDECIDED_RUN_GATE", "buff gate");
    if (one.kind !== "UNKNOWN") return;
    expect(one.blockedAt?.actionStringVerbatim).toContain(BUFF_COND);

    const query = firstGcd(setup, ["x", "w", "y"]);
    expect(query.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (query.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect([query.scanBlocker, at(query.blockedAt)]).toEqual(["UNDECIDED_RUN_GATE", "default[0]"]);
    // Neither the child's applicability gap nor its possible x is the stop.
    expect(query.scanBlocker).not.toBe("APPLICABILITY_NOT_ESTABLISHED");
    expect(query.blockedAt?.listName).not.toBe("child");
    // Classified by the gate's predicate: a buff carries no permanent-atom
    // marker, so it is missing observed state.
    expect(classifyDecision(query).blockerClass).toBe("OBSERVED_STATE_MISSING");
    for (const observed of [...OBSERVED, "w"]) expect(compared(query, observed), observed).toBe("UNKNOWN");
  });

  it("H: the same gate PROVEN TRUE makes the child real, and the child's obstacle becomes the stop", () => {
    const setup = buffGated({ ...BINDINGS, knownBuffs: [{ name: "foo", up: true }] });
    const one = scan(setup);
    expect(one.kind).toBe("UNKNOWN");
    if (one.kind !== "UNKNOWN") return;
    // The applicability gap at child[1] is reported through the earliest-
    // obstacle rule as the possible child[0] above it — inside the child.
    expect([one.blocker, at(one.blockedAt)]).toEqual(["NO_DEFINITE_WINNER", "child[0]"]);
    expect(outcomeAt(one, "child", 1)).toBe("BLOCKED");
    expect(one.steps.find((step) => at(step) === "child[1]")?.applicability.kind).toBe("UNKNOWN");
    expect(visited(one)).toEqual(["default[0]", "child[0]", "child[1]"]);

    // With nothing above it, the applicability gap itself is the stop.
    const direct = scan({
      ...setup,
      lists: [setup.lists[0]!, { listName: "child", actions: [`w,if=${TRUE_COND}`] }],
    });
    expect(direct.kind === "UNKNOWN" && [direct.blocker, at(direct.blockedAt)]).toEqual([
      "APPLICABILITY_NOT_ESTABLISHED",
      "child[0]",
    ]);
  });

  it("H: a nested undecided gate inside a real child is the stop, with the TRUE gate's step left blocked", () => {
    const one = scan({
      lists: [
        { listName: "default", actions: [`run_action_list,name=a,if=${TRUE_COND}`, `z,if=${TRUE_COND}`] },
        { listName: "a", actions: [`run_action_list,name=b,if=${UNKNOWN_COND}`, `y,if=${TRUE_COND}`] },
        { listName: "b", actions: [`x,if=${TRUE_COND}`] },
      ],
      usable: ["x", "y", "z"],
    });
    expect(one.kind === "UNKNOWN" && [one.blocker, at(one.blockedAt)]).toEqual([
      "UNDECIDED_RUN_GATE",
      "a[0]",
    ]);
    expect(visited(one)).toEqual(["default[0]", "a[0]"]);
    expect([outcomeAt(one, "default", 0), outcomeAt(one, "a", 0)]).toEqual(["BLOCKED", "BLOCKED"]);
  });

  it("H: the same holds one level up — an undecided call over a transferring callee stops at the call gate", () => {
    const one = scan({
      lists: [
        { listName: "default", actions: [`call_action_list,name=a,if=${UNKNOWN_COND}`, `z,if=${TRUE_COND}`] },
        { listName: "a", actions: ["run_action_list,name=b"] },
        { listName: "b", actions: [`x,if=${TRUE_COND}`] },
      ],
      usable: ["x", "z"],
    });
    expect(one.kind === "UNKNOWN" && [one.blocker, at(one.blockedAt)]).toEqual([
      "UNDECIDED_CALL_GATE_OVER_RUN",
      "default[0]",
    ]);
    // The callee was always walked; the call slot is blocked and nothing below it is reported.
    expect(visited(one)).toEqual(["default[0]", "a[0]", "b[0]"]);
    expect(outcomeAt(one, "default", 0)).toBe("BLOCKED");
  });
});

// ---------------------------------------------------------------------------
// I–J: state isolation, structure
// ---------------------------------------------------------------------------

describe("state isolation and structural cases", () => {
  it("I: a NON_GCD action fired in the TRUE world never leaks into the FALSE world's state", () => {
    const seen: Seen[] = [];
    const result = firstGcd(
      {
        lists: [
          {
            listName: "default",
            actions: [`run_action_list,name=child,if=${UNKNOWN_COND}`, `gcd_x,if=${TRUE_COND}`],
          },
          { listName: "child", actions: ["non_gcd_a", `gcd_x,if=${TRUE_COND}`] },
        ],
        usable: ["non_gcd_a", "gcd_x"],
      },
      ["gcd_x"],
      seen,
    );
    // The branch that fired non_gcd_a has its own state; every scan of the
    // initial state still sees non_gcd_a usable.
    expect(seen.filter((s) => s.state === "" && s.token === "non_gcd_a").map((s) => s.verdict)).not.toContain(
      "PROVEN_UNUSABLE",
    );
    expect(
      seen.some((s) => s.state === "non_gcd_a" && s.token === "non_gcd_a" && s.verdict === "PROVEN_UNUSABLE"),
    ).toBe(true);
    // Every world reaches gcd_x — directly, after non_gcd_a, or from the parent —
    // so the first-GCD query converges where the one scan alone could not.
    expect(result.kind === "ROTATIONAL_GCD_TOKEN_CONVERGED" && result.actionToken).toBe("gcd_x");
  });

  it("I: worlds that still disagree after the TRUE world's NON_GCD rescan keep the gate", () => {
    const lists = (afterNonGcd: string): readonly SyntheticListSpec[] => [
      {
        listName: "default",
        actions: [`run_action_list,name=child,if=${UNKNOWN_COND}`, `gcd_x,if=${TRUE_COND}`],
      },
      { listName: "child", actions: ["non_gcd_a", afterNonGcd] },
    ];
    const diverging = firstGcd(
      { lists: lists(`gcd_y,if=${TRUE_COND}`), usable: ["non_gcd_a", "gcd_x", "gcd_y"] },
      ["gcd_x", "gcd_y"],
    );
    expect(diverging.kind === "ROTATIONAL_GCD_UNKNOWN" && [diverging.blocker, diverging.scanBlocker]).toEqual(
      ["ONE_SCAN_BLOCKED", "UNDECIDED_RUN_GATE"],
    );
    for (const observed of OBSERVED) expect(compared(diverging, observed), observed).toBe("UNKNOWN");
  });

  it("J: a cycle, a self-run and a missing list under an UNDECIDED gate stop at the gate", () => {
    const cases: readonly { readonly label: string; readonly lists: readonly SyntheticListSpec[] }[] = [
      {
        label: "cycle",
        lists: [
          {
            listName: "default",
            actions: [`run_action_list,name=a,if=${UNKNOWN_COND}`, `x,if=${TRUE_COND}`],
          },
          { listName: "a", actions: ["run_action_list,name=default"] },
        ],
      },
      {
        label: "self",
        lists: [
          {
            listName: "default",
            actions: [`run_action_list,name=default,if=${UNKNOWN_COND}`, `x,if=${TRUE_COND}`],
          },
        ],
      },
      {
        label: "missing",
        lists: [
          {
            listName: "default",
            actions: [`run_action_list,name=absent,if=${UNKNOWN_COND}`, `x,if=${TRUE_COND}`],
          },
        ],
      },
    ];
    for (const { label, lists } of cases) {
      // The structural fault is met only in the speculative TRUE world, so it
      // is not the stop — and it is never stepped over to select x.
      expectGateStop(scan({ lists, usable: ["x"] }), "UNDECIDED_RUN_GATE", label);
      const query = firstGcd({ lists, usable: ["x"] }, ["x"]);
      expect(query.kind, label).toBe("ROTATIONAL_GCD_UNKNOWN");
      for (const observed of OBSERVED)
        expect(compared(query, observed), `${label} ${observed}`).toBe("UNKNOWN");
    }
  });

  it("J: the same faults under a PROVEN TRUE gate are the stop", () => {
    const cycle = scan({
      lists: [
        { listName: "default", actions: [`run_action_list,name=a,if=${TRUE_COND}`, `x,if=${TRUE_COND}`] },
        { listName: "a", actions: ["run_action_list,name=default"] },
      ],
      usable: ["x"],
    });
    expect(cycle.kind === "UNKNOWN" && cycle.blocker).toBe("CONTROL_FLOW_CYCLE");
    const missing = scan({
      lists: [
        {
          listName: "default",
          actions: [`run_action_list,name=absent,if=${TRUE_COND}`, `x,if=${TRUE_COND}`],
        },
      ],
      usable: ["x"],
    });
    expect(missing.kind === "UNKNOWN" && missing.blocker).toBe("CALLED_LIST_ABSENT");
  });
});

// ---------------------------------------------------------------------------
// Nesting under the same boundary
// ---------------------------------------------------------------------------

describe("nesting", () => {
  it("a certain call into a list whose undecided run converges converges too", () => {
    const one = scan({
      lists: [
        { listName: "default", actions: ["call_action_list,name=a", `z,if=${TRUE_COND}`] },
        { listName: "a", actions: [`run_action_list,name=b,if=${UNKNOWN_COND}`, `x,if=${TRUE_COND}`] },
        { listName: "b", actions: [`x,if=${TRUE_COND}`] },
      ],
      usable: ["x", "z"],
    });
    expect(one.kind === "TOKEN_CONVERGED" && one.actionToken).toBe("x");
  });

  it("when the callee's FALSE world falls off its end, the caller's z competes: UNKNOWN at the callee's gate", () => {
    const one = scan({
      lists: [
        { listName: "default", actions: ["call_action_list,name=a", `z,if=${TRUE_COND}`] },
        { listName: "a", actions: [`run_action_list,name=b,if=${UNKNOWN_COND}`] },
        { listName: "b", actions: [`x,if=${TRUE_COND}`] },
      ],
      usable: ["x", "z"],
    });
    expect(one.kind === "UNKNOWN" && [one.blocker, at(one.blockedAt)]).toEqual([
      "UNDECIDED_RUN_GATE",
      "a[0]",
    ]);
    // The enclosing call slot is restored to BLOCKED; z is not in the trace.
    expect(visited(one)).toEqual(["default[0]", "a[0]"]);
    expect(outcomeAt(one, "default", 0)).toBe("BLOCKED");
  });

  it("an undecided call over a list with an undecided run stops at the EARLIEST undecided gate", () => {
    const one = scan({
      lists: [
        { listName: "default", actions: [`call_action_list,name=a,if=${UNKNOWN_COND}`, `z,if=${TRUE_COND}`] },
        { listName: "a", actions: [`run_action_list,name=b,if=${UNKNOWN_COND}`] },
        { listName: "b", actions: [`x,if=${TRUE_COND}`] },
      ],
      usable: ["x", "z"],
    });
    expect(one.kind === "UNKNOWN" && [one.blocker, at(one.blockedAt)]).toEqual([
      "UNDECIDED_RUN_GATE",
      "a[0]",
    ]);
  });

  it("nested undecided runs whose every world selects x converge on x", () => {
    const one = scan({
      lists: [
        { listName: "default", actions: [`run_action_list,name=a,if=${UNKNOWN_COND}`, `x,if=${TRUE_COND}`] },
        { listName: "a", actions: [`run_action_list,name=b,if=${UNKNOWN_COND}`, `x,if=${TRUE_COND}`] },
        { listName: "b", actions: [`x,if=${TRUE_COND}`] },
      ],
      usable: ["x"],
    });
    expect(one.kind === "TOKEN_CONVERGED" && one.actionToken).toBe("x");
    expect(visited(one)).toEqual(["default[0]", "a[0]", "b[0]", "a[1]", "default[1]"]);
  });

  it("nested undecided runs that disagree stop at the OUTER gate, not the inner one", () => {
    const one = scan({
      lists: [
        { listName: "default", actions: [`run_action_list,name=a,if=${UNKNOWN_COND}`, `x,if=${TRUE_COND}`] },
        { listName: "a", actions: [`run_action_list,name=b,if=${UNKNOWN_COND}`, `x,if=${TRUE_COND}`] },
        { listName: "b", actions: [`y,if=${TRUE_COND}`] },
      ],
      usable: ["x", "y"],
    });
    expectGateStop(one, "UNDECIDED_RUN_GATE", "outer gate");
  });

  it("a list referenced twice — undecided run, then a certain call — is legal and converges on one entry", () => {
    const one = scan({
      lists: [
        {
          listName: "default",
          actions: [
            `run_action_list,name=a,if=${UNKNOWN_COND}`,
            "call_action_list,name=a",
            `z,if=${TRUE_COND}`,
          ],
        },
        { listName: "a", actions: [`x,if=${TRUE_COND}`] },
      ],
      usable: ["x", "z"],
    });
    // Both worlds select the SAME entry, a[0] — through the run in one, the call
    // in the other — so the selection is exact, not merely token-convergent.
    expect(
      one.kind === "SELECTED" && [
        one.actionToken,
        one.selectingStep.listName,
        one.selectingStep.priorityOrdinal,
      ],
    ).toEqual(["x", "a", 0]);
  });

  it("is deterministic across two identical queries", () => {
    const setup: Setup = {
      lists: [
        {
          listName: "default",
          actions: [`run_action_list,name=child,if=${UNKNOWN_COND}`, `y,if=${TRUE_COND}`],
        },
        { listName: "child", actions: ["non_gcd_a", `x,if=${TRUE_COND}`] },
      ],
      usable: ["non_gcd_a", "x", "y"],
    };
    expect(JSON.stringify(firstGcd(setup, ["x", "y"]))).toBe(JSON.stringify(firstGcd(setup, ["x", "y"])));
    expect(JSON.stringify(rawScan(setup))).toBe(JSON.stringify(rawScan(setup)));
  });
});
