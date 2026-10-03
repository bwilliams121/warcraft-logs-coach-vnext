/**
 * M11-D3-B2: the `retarget` and `retarget_auto_attack` pseudo-actions.
 *
 * PINNED SEMANTICS (SimulationCraft 33622e9d; see `src/simc/pseudo-actions.ts`):
 *
 *     retarget_auto_attack  ready only if an auto attack is aimed somewhere
 *                           other than the target it chose; executing moves
 *                           ONLY the auto attacks. Zero time, zero GCD, and the
 *                           next selection follows at the same timestamp with
 *                           nothing in between
 *     retarget              ordinary readiness; executing moves the PLAYER's
 *                           target and every action's target to the chosen enemy
 *
 * So, for the first GCD:
 *
 *     retarget_auto_attack  its firing world converges with the continuation:
 *                           ignorable (SAFE_TO_IGNORE_FOR_FIRST_GCD)
 *     retarget              the next scan reads an enemy nobody named:
 *                           TARGET_IDENTITY_REQUIRED, fails closed
 *
 * And the distinction B1 cannot settle on its own: a `target_if` whose
 * READINESS is target-independent says nothing about a side effect that
 * depends on WHICH target was chosen.
 *
 * The central invariant, as in D3-A and B1: uncertainty is UNKNOWN, never REJECTED.
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
import { classifyDecision } from "../../src/simc/decision-coverage.js";
import { knownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import { isBuiltinIdentifier } from "../../src/simc/expression/parse.js";
import { defineSpecAtomVocabulary } from "../../src/simc/expression/spec-vocabulary.js";
import {
  firstGcdSelectionAcrossRescans,
  type NonGcdTransitionOutcome,
  type RotationalGcdResult,
} from "../../src/simc/first-gcd-selection.js";
import { selectWithinList } from "../../src/simc/list-selection.js";
import {
  resolveOneForegroundScan,
  selectAcrossLists,
  type NestedSelectionInput,
  type TraversalResult,
  type TraversalStep,
} from "../../src/simc/nested-selection.js";
import { firstGcdPseudoEffectOf, pseudoActionOf } from "../../src/simc/pseudo-actions.js";
import { targetIfVerdict } from "../../src/simc/target-if.js";
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
const P_UNKNOWN = "buff.foo.up";
const T_DEP = "debuff.bar.up";
/** A MIN/MAX score B1 proves finite, so readiness is target-independent. */
const FINITE_MIN = "target_if=min:target.time_to_die";

/** Pseudo-actions and `y` are usable as far as the scan asks; GCD tokens are y and z. */
const GCD = ["y", "z"];

interface Setup {
  readonly lists: readonly SyntheticListSpec[];
  readonly bindings?: AtomBindings;
}

const usableEverything = (): ActionUsabilityVerdict => provenUsable();

function inputOf(setup: Setup, usabilityFor: NestedSelectionInput["usabilityFor"] = usableEverything) {
  return {
    authority: syntheticAuthority({ lists: setup.lists as SyntheticListSpec[] }),
    entryListName: "default",
    bindings: setup.bindings ?? BINDINGS,
    usabilityFor,
  } satisfies NestedSelectionInput;
}

const scan = (setup: Setup): TraversalResult => selectAcrossLists(inputOf(setup));
const one = (actions: readonly string[], bindings?: AtomBindings): Setup => ({
  lists: [{ listName: "default", actions }],
  ...(bindings === undefined ? {} : { bindings }),
});

/**
 * The first-GCD query. Lanes come from a SPEC that knows nothing about
 * pseudo-actions (everything but y and z would be NON_GCD), and its
 * transitions disable what fired — so if a pseudo-action were ever executed
 * here, the result would show it.
 */
function firstGcd(setup: Setup): RotationalGcdResult {
  const disabledUsability =
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
    scanFor: (state) => resolveOneForegroundScan(inputOf(setup, disabledUsability(state))),
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

const at = (step: { readonly listName: string; readonly priorityOrdinal: number } | null | undefined) =>
  step === null || step === undefined ? null : `${step.listName}[${String(step.priorityOrdinal)}]`;
const stepAt = (result: { readonly steps: readonly TraversalStep[] }, label: string) =>
  result.steps.find((step) => at(step) === label);

function actionOf(line: string): AplAction {
  const loaded = loadAplAuthority(syntheticArtifact({ lists: [{ listName: "default", actions: [line] }] }));
  if (!loaded.ok) throw new Error(loaded.detail);
  const lookup = loaded.authority.actionsInList("default");
  const [action] = lookup.found ? lookup.actions : [];
  if (action === undefined) throw new Error("no action");
  return action;
}

function withPrevVocabulary(): AtomBindings {
  return {
    ...BINDINGS,
    specAtoms: {
      vocabulary: defineSpecAtomVocabulary(
        "synthetic/test",
        [{ identifier: "prev.y", shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false }],
        isBuiltinIdentifier,
      ),
      bound: [],
    },
  };
}

function expectNeverConfident(result: RotationalGcdResult, label: string): void {
  expect(result.kind, label).toBe("ROTATIONAL_GCD_UNKNOWN");
  for (const observed of ["y", "z", "retarget", "retarget_auto_attack"]) {
    expect(compared(result, observed), `${label} ${observed}`).toBe("UNKNOWN");
  }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

describe("the two pseudo-actions are classified independently", () => {
  it("names each token, and nothing else", () => {
    expect(pseudoActionOf("retarget")).toBe("RETARGET");
    expect(pseudoActionOf("retarget_auto_attack")).toBe("RETARGET_AUTO_ATTACK");
    expect(pseudoActionOf("auto_attack")).toBeNull();
    expect(pseudoActionOf("retargets")).toBeNull();
  });

  it("retarget needs the chosen enemy; retarget_auto_attack has no first-GCD effect", () => {
    expect(
      firstGcdPseudoEffectOf(actionOf(`retarget,${FINITE_MIN},if=${P_TRUE}`), "RETARGET", BINDINGS),
    ).toEqual({
      kind: "TARGET_IDENTITY_REQUIRED",
    });
    for (const line of [
      "retarget_auto_attack",
      `retarget_auto_attack,${FINITE_MIN},if=${P_TRUE}`,
      "retarget_auto_attack,line_cd=1,target_if=min:debuff.burning_wound.remains,if=talent.burning_wound&x>?3",
    ]) {
      expect(firstGcdPseudoEffectOf(actionOf(line), "RETARGET_AUTO_ATTACK", BINDINGS), line).toEqual({
        kind: "NO_FIRST_GCD_EFFECT",
      });
    }
  });

  it("is NOT proven irrelevant when an option could add lag, or a prev. atom could see it", () => {
    expect(
      firstGcdPseudoEffectOf(
        actionOf("retarget_auto_attack,add_queue_lag=1"),
        "RETARGET_AUTO_ATTACK",
        BINDINGS,
      ),
    ).toEqual({ kind: "NOT_PROVEN", reason: "UNMODELLED_OPTION" });
    expect(
      firstGcdPseudoEffectOf(actionOf("retarget_auto_attack"), "RETARGET_AUTO_ATTACK", withPrevVocabulary()),
    ).toEqual({ kind: "NOT_PROVEN", reason: "PREV_ATOM_DECLARED" });
  });
});

// ---------------------------------------------------------------------------
// retarget_auto_attack: SAFE_TO_IGNORE_FOR_FIRST_GCD
// ---------------------------------------------------------------------------

describe("retarget_auto_attack: its firing world converges with the continuation", () => {
  it("is never proven to fire in one scan, even TRUE and usable — and the first GCD is what follows it", () => {
    const setup = one([`retarget_auto_attack,${FINITE_MIN},if=${P_TRUE}`, "y"]);
    const result = scan(setup);
    // One scan: it MIGHT be the action returned, so y is not proven either.
    expect(result.kind === "UNKNOWN" && result.blocker).toBe("COMPETING_POSSIBLE_ACTION");
    expect(stepAt(result, "default[0]")?.outcome).toBe("MAY_SELECT");
    expect(stepAt(result, "default[0]")?.pseudoAction).toEqual({
      kind: "RETARGET_AUTO_ATTACK",
      firstGcdEffect: { kind: "NO_FIRST_GCD_EFFECT" },
    });
    // First GCD: whether it fires or not, y is next.
    const query = firstGcd(setup);
    expect(query.kind === "ROTATIONAL_GCD_SELECTED" && query.actionToken).toBe("y");
    expect(compared(query, "y")).toBe("MATCH");
  });

  it("needs nothing about its own readiness: line_cd, an unreadable if= and FIRST mode change nothing", () => {
    for (const line of [
      "retarget_auto_attack,line_cd=1,target_if=min:debuff.burning_wound.remains,if=talent.burning_wound&x>?3",
      "retarget_auto_attack,line_cd=1,target_if=min:!target.is_boss",
      `retarget_auto_attack,target_if=first:${T_DEP}`,
      `retarget_auto_attack,if=${P_UNKNOWN}`,
      "retarget_auto_attack",
    ]) {
      const query = firstGcd(one([line, "y"]));
      expect(query.kind === "ROTATIONAL_GCD_SELECTED" && query.actionToken, line).toBe("y");
    }
  });

  it("is never the reported obstacle: a later blocker is named, not the irrelevant retarget above it", () => {
    const query = firstGcd(one([`retarget_auto_attack,if=${P_TRUE}`, "y,if=active_dot.foo>1"]));
    expect(query.kind === "ROTATIONAL_GCD_UNKNOWN" && [query.scanBlocker, at(query.blockedAt)]).toEqual([
      "UNSUPPORTED_AUTHORITY_EXPRESSION",
      "default[1]",
    ]);
    // A relevant possible entry above still is the obstacle, exactly as before.
    const relevant = firstGcd(
      one([`z,if=${P_UNKNOWN}`, `retarget_auto_attack,if=${P_TRUE}`, "y,if=active_dot.foo>1"]),
    );
    expect(
      relevant.kind === "ROTATIONAL_GCD_UNKNOWN" && [relevant.scanBlocker, at(relevant.blockedAt)],
    ).toEqual(["NO_DEFINITE_WINNER", "default[0]"]);
  });

  it("with nothing after it, the first GCD is nothing — it never stands in for one", () => {
    expect(firstGcd(one([`retarget_auto_attack,if=${P_TRUE}`])).kind).toBe("NO_ROTATIONAL_GCD_SELECTED");
  });

  it("proven FALSE is recorded as eliminated, in the plain and the target_if form", () => {
    const plain = scan(one([`retarget_auto_attack,if=${P_FALSE}`, "y"]));
    expect(plain.kind === "SELECTED" && plain.actionToken).toBe("y");
    expect(stepAt(plain, "default[0]")?.outcome).toBe("ELIMINATED_CONTINUE");
    const targeted = scan(one([`retarget_auto_attack,target_if=first:${T_DEP},if=${P_FALSE}`, "y"]));
    expect(targeted.kind === "SELECTED" && targeted.actionToken).toBe("y");
    expect(stepAt(targeted, "default[0]")?.outcome).toBe("TARGET_INDEPENDENT_ELIMINATION_CONTINUE");
  });

  it("a malformed target_if fails closed: the line is not a valid APL entry", () => {
    for (const option of ["target_if=median:a", "target_if=min:"]) {
      const result = scan(one([`retarget_auto_attack,${option}`, "y"]));
      expect(result.kind === "UNKNOWN" && result.blocker, option).toBe("UNSUPPORTED_ACTION_OPTION");
      expectNeverConfident(firstGcd(one([`retarget_auto_attack,${option}`, "y"])), option);
    }
  });

  it("not proven irrelevant: an unmodelled option is refused, and a visible prev. atom blocks the query", () => {
    expectNeverConfident(firstGcd(one(["retarget_auto_attack,add_queue_lag=1", "y"])), "add_queue_lag");
    const prev = firstGcd(one([`retarget_auto_attack,if=${P_TRUE}`, "y"], withPrevVocabulary()));
    expect(prev.kind === "ROTATIONAL_GCD_UNKNOWN" && prev.blocker).toBe("TRANSITION_UNSUPPORTED");
    expectNeverConfident(prev, "prev atom");
  });
});

// ---------------------------------------------------------------------------
// retarget: TARGET_IDENTITY_REQUIRED
// ---------------------------------------------------------------------------

describe("retarget: readiness independence is not side-effect independence", () => {
  it("NEGATIVE CONTROL: B1 proves its readiness target-independent, and the query still refuses to run past it", () => {
    const line = `retarget,${FINITE_MIN},if=${P_TRUE}`;
    // B1 alone: target choice is ignorable FOR READINESS, so the scan honestly
    // returns retarget — it is the action this scan selects.
    expect(targetIfVerdict(actionOf(line), BINDINGS)).toMatchObject({ kind: "TARGET_SELECTION_IGNORABLE" });
    const result = scan(one([line, "y"]));
    expect(result.kind === "SELECTED" && result.actionToken).toBe("retarget");
    // But executing it moves every later read to an enemy nobody named.
    const query = firstGcd(one([line, "y"]));
    expect(query.kind === "ROTATIONAL_GCD_UNKNOWN" && [query.blocker, at(query.blockedAt)]).toEqual([
      "TRANSITION_UNSUPPORTED",
      "default[0]",
    ]);
    expectNeverConfident(query, "retarget proven TRUE");
  });

  it("a retarget that might fire — unknown if=, or an empty target set — still never lets y through", () => {
    // MAY_SELECT: one world fires it (identity unknown), one does not (y).
    expectNeverConfident(firstGcd(one([`retarget,${FINITE_MIN},if=${P_UNKNOWN}`, "y"])), "unknown if=");
    // Even with no target_if at all, retarget re-aims the pets.
    expectNeverConfident(firstGcd(one([`retarget,if=${P_TRUE}`, "y"])), "no target_if");
  });

  it("FIRST, a target-dependent if= and a malformed target_if are refused in the scan itself", () => {
    for (const line of [
      `retarget,target_if=first:${T_DEP}`,
      `retarget,${FINITE_MIN},if=${T_DEP}`,
      "retarget,target_if=median:a",
      "retarget,target_if=max:target.health,line_cd=5,if=fight_style.dungeonroute",
    ]) {
      const result = scan(one([line, "y"]));
      expect(result.kind === "UNKNOWN" && result.blocker, line).toBe("UNSUPPORTED_ACTION_OPTION");
      expectNeverConfident(firstGcd(one([line, "y"])), line);
    }
  });

  it("proven FALSE is eliminated whatever its target would have been", () => {
    for (const line of [`retarget,${FINITE_MIN},if=${P_FALSE}&${T_DEP}`, `retarget,if=${P_FALSE}`]) {
      const query = firstGcd(one([line, "y"]));
      expect(query.kind === "ROTATIONAL_GCD_SELECTED" && query.actionToken, line).toBe("y");
    }
  });
});

// ---------------------------------------------------------------------------
// D3-A interaction
// ---------------------------------------------------------------------------

describe("pseudo-actions inside speculative worlds keep D3-A's attribution", () => {
  const runOver = (child: readonly string[]): Setup => ({
    lists: [
      { listName: "default", actions: [`run_action_list,name=child,if=${P_UNKNOWN}`, "y"] },
      { listName: "child", actions: child },
    ],
  });

  it("a retarget in the TRUE world does not leak, and the stop is the run gate", () => {
    const query = firstGcd(runOver([`retarget,${FINITE_MIN},if=${P_UNKNOWN}`, "y"]));
    expect(query.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (query.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect([query.blocker, query.scanBlocker, at(query.blockedAt)]).toEqual([
      "ONE_SCAN_BLOCKED",
      "UNDECIDED_RUN_GATE",
      "default[0]",
    ]);
    expect(classifyDecision(query).blockerClass).not.toBe("DIVERGENT_WORLDS");
  });

  it("an auto-attack retarget beside a definite y in the TRUE world keeps D3-A's stop at the gate", () => {
    // SimulationCraft reaches y in every world here. But inside ONE scan the
    // child offers "the retarget, or y — y proven", which D3-A reads as a TRUE
    // world that definitely selects but not one action, and collapses to the
    // gate before the first-GCD query sees the worlds. D3-A is unchanged: the
    // answer stays UNKNOWN at the gate — a coverage limit, never a guess.
    const query = firstGcd(runOver([`retarget_auto_attack,if=${P_TRUE}`, "y"]));
    expect(query.kind === "ROTATIONAL_GCD_UNKNOWN" && [query.scanBlocker, at(query.blockedAt)]).toEqual([
      "UNDECIDED_RUN_GATE",
      "default[0]",
    ]);
    expectNeverConfident(query, "D3-A collapse");
  });

  it("in explored worlds the auto-attack retarget's world drops out; y-or-nothing still keeps the gate", () => {
    // Child: the retarget might fire, y might fire — the TRUE world may be
    // nothing, so the worlds are explored, and the retarget's own world drops out.
    const query = firstGcd({
      lists: [
        { listName: "default", actions: [`run_action_list,name=child,if=${P_UNKNOWN}`, `y,if=${P_UNKNOWN}`] },
        { listName: "child", actions: [`retarget_auto_attack,if=${P_TRUE}`, `y,if=${P_UNKNOWN}`] },
      ],
    });
    // TRUE world: y or nothing; FALSE world: y or nothing — the same two
    // outcomes on both sides, which still disagree with each other.
    expect(query.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(query.kind === "ROTATIONAL_GCD_UNKNOWN" && query.scanBlocker).toBe("UNDECIDED_RUN_GATE");
  });

  it("an auto-attack retarget alone in the TRUE world leaves 'nothing' there: the stop stays at the gate", () => {
    // TRUE: it fires or not, then the child is exhausted — NOTHING. FALSE: y.
    const query = firstGcd(runOver([`retarget_auto_attack,if=${P_TRUE}`]));
    expect(query.kind === "ROTATIONAL_GCD_UNKNOWN" && query.scanBlocker).toBe("UNDECIDED_RUN_GATE");
    expectNeverConfident(query, "nothing vs y");
  });

  it("is deterministic", () => {
    const setup = runOver([`retarget_auto_attack,if=${P_TRUE}`, `retarget,${FINITE_MIN}`, "y"]);
    expect(JSON.stringify(firstGcd(setup))).toBe(JSON.stringify(firstGcd(setup)));
  });
});

describe("the single-list walker reads retarget_auto_attack the same way", () => {
  it("never selects it: it is POSSIBLE at most", () => {
    const result = selectWithinList(
      syntheticAuthority({
        lists: [{ listName: "default", actions: [`retarget_auto_attack,if=${P_TRUE}`, "y"] }],
      }),
      "default",
      BINDINGS,
      () => "PROVEN_USABLE",
    );
    expect(result.kind).toBe("INDETERMINATE");
    expect(result.kind !== "LIST_ABSENT" && result.lines[0]?.outcome).toBe("POSSIBLE");
  });
});
