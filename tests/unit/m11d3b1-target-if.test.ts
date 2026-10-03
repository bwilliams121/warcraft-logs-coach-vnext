/**
 * M11-D3-B1: the `target_if` subset decidable WITHOUT an enemy-set model.
 *
 * PINNED SEMANTICS (SimulationCraft 33622e9d, re-read for B1; see
 * `src/simc/target-if.ts`): `action_ready` runs `ready()`, then
 * `select_target()`, then `if=` ON THE CHOSEN TARGET (action.cpp:2567-2629).
 * FIRST only finds a target whose expression is non-zero (> 0 with one
 * candidate); MIN/MAX choose a candidate whenever one scores a finite value
 * (action.cpp:5353-5446). `call_action_list` never selects a target at all
 * (action.cpp:4672-4685).
 *
 * So, without knowing the enemies:
 *
 *     MIN/MAX, finite score, `if=` absent or player-only  -> an ordinary line
 *     any mode, a player-only `if=` conjunct FALSE         -> eliminated
 *     everything else                                      -> refused, UNKNOWN
 *
 * The central invariant, as in D3-A: uncertainty is UNKNOWN, never REJECTED.
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
import { loadAplAuthority, targetIfStructureOf, type AplAction } from "../../src/simc/apl-authority.js";
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
  type OneForegroundScanResult,
  type TraversalResult,
  type TraversalStep,
} from "../../src/simc/nested-selection.js";
import { scoreFinitenessOf, targetIfVerdict } from "../../src/simc/target-if.js";
import { syntheticArtifact, syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: knownNumber(0),
  energyPct: knownNumber(100),
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
};

/** Player-scoped, proven TRUE / FALSE at 7 combo points. */
const P_TRUE = "combo_points>=5";
const P_FALSE = "combo_points<5";
/** Player-scoped and UNKNOWN: `foo` is absent from `knownBuffs`, never read as down. */
const P_UNKNOWN = "buff.foo.up";
/** Target-scoped: an aura ON the enemy, which differs by enemy. */
const T_DEP = "debuff.bar.up";
/** Outside the supported subset: its dependence cannot be classified. */
const UNSUPPORTED = "target.health.pct<20";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface Setup {
  readonly lists: readonly SyntheticListSpec[];
  readonly usable: readonly string[];
  readonly bindings?: AtomBindings;
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
      unknown.includes(action.actionToken) ? unknownApplicability("synthetic") : allApplicable()(action),
  };
}

const scan = (setup: Setup): TraversalResult => selectAcrossLists(inputOf(setup));
const rawScan = (setup: Setup): OneForegroundScanResult => resolveOneForegroundScan(inputOf(setup));

/** One list, `default`, holding `actions`. */
const one = (
  actions: readonly string[],
  usable: readonly string[] = ["x", "y", "z"],
  extra: Partial<Setup> = {},
) => ({ lists: [{ listName: "default", actions }], usable, ...extra }) satisfies Setup;

function firstGcd(setup: Setup, gcdTokens: readonly string[]): RotationalGcdResult {
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
        : setup.usable.includes(action.actionToken)
          ? provenUsable()
          : unknownUsability();
  return firstGcdSelectionAcrossRescans<readonly string[]>({
    rootListName: "default",
    initialState: [],
    stateKey: (state) => [...state].sort().join(","),
    scanFor: (state) => resolveOneForegroundScan(inputOf(setup, disabledUsability(state))),
    laneFor: (step: TraversalStep): ExecutionLane =>
      gcdTokens.includes(step.actionToken) ? "GCD_CONSUMING" : "NON_GCD",
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
const visited = (result: { readonly steps: readonly TraversalStep[] }) =>
  result.steps.map((step) => at(step));

function actionOf(line: string): AplAction {
  const loaded = loadAplAuthority(syntheticArtifact({ lists: [{ listName: "default", actions: [line] }] }));
  if (!loaded.ok) throw new Error(loaded.detail);
  const lookup = loaded.authority.actionsInList("default");
  const [action] = lookup.found ? lookup.actions : [];
  if (action === undefined) throw new Error("no action");
  return action;
}

/** Expects UNKNOWN at `default[0]` on the refusal blocker, and never MATCH or REJECTED for any token. */
function expectRefusedAtFirstLine(setup: Setup, reason: string | null, label: string): void {
  const result = scan(setup);
  expect(result.kind, label).toBe("UNKNOWN");
  if (result.kind !== "UNKNOWN") return;
  expect(result.blocker, label).toBe("UNSUPPORTED_ACTION_OPTION");
  expect(at(result.blockedAt), label).toBe("default[0]");
  expect(result.blockedAt?.targetingRefusal?.kind, label).toBe("REFUSED");
  expect(result.blockedAt?.gate, label).toEqual({ kind: "NOT_EVALUATED", why: "UNSUPPORTED_TARGETING" });
  const refusal = result.blockedAt?.targetingRefusal;
  if (refusal?.kind === "REFUSED") expect(refusal.targetIf?.reason ?? null, label).toBe(reason);
  const query = firstGcd(setup, ["x", "y", "z"]);
  for (const observed of ["x", "y", "z"])
    expect(compared(query, observed), `${label} ${observed}`).toBe("UNKNOWN");
}

// ---------------------------------------------------------------------------
// The line representation
// ---------------------------------------------------------------------------

describe("target_if is read structurally", () => {
  it("reads the mode and expression; no prefix is FIRST; the mode is case-insensitive", () => {
    expect(targetIfStructureOf("x,target_if=min:target.health.pct,if=a")).toEqual({
      kind: "WELL_FORMED",
      mode: "MIN",
      modeWritten: true,
      expressionRaw: "target.health.pct",
    });
    expect(targetIfStructureOf("x,target_if=MAX:dot.y.remains")).toMatchObject({ mode: "MAX" });
    expect(targetIfStructureOf("x,target_if=first:refreshable")).toMatchObject({
      mode: "FIRST",
      modeWritten: true,
    });
    expect(targetIfStructureOf("x,target_if=refreshable|debuff.y.up")).toEqual({
      kind: "WELL_FORMED",
      mode: "FIRST",
      modeWritten: false,
      expressionRaw: "refreshable|debuff.y.up",
    });
    expect(targetIfStructureOf("x,if=a")).toBeNull();
    // It is a derived field of the line, not a string match at the call site.
    expect(actionOf("x,target_if=min:a,if=b").targetIf).toMatchObject({ kind: "WELL_FORMED", mode: "MIN" });
    expect(actionOf("x,if=b").targetIf).toBeNull();
  });

  it("K (structure): an unknown mode, an empty expression and two target_if options are MALFORMED", () => {
    expect(targetIfStructureOf("x,target_if=median:a")).toEqual({
      kind: "MALFORMED",
      reason: "UNKNOWN_MODE",
    });
    expect(targetIfStructureOf("x,target_if=min:")).toEqual({
      kind: "MALFORMED",
      reason: "EMPTY_EXPRESSION",
    });
    expect(targetIfStructureOf("x,target_if=")).toEqual({ kind: "MALFORMED", reason: "EMPTY_EXPRESSION" });
    expect(targetIfStructureOf("x,target_if=min:a,target_if=max:b")).toEqual({
      kind: "MALFORMED",
      reason: "MULTIPLE_TARGET_IF",
    });
  });
});

// ---------------------------------------------------------------------------
// The finiteness proof: positive, compositional, fail-closed
// ---------------------------------------------------------------------------

describe("a MIN/MAX score is ignorable only when it is POSITIVELY PROVEN finite", () => {
  const finite = (score: string, bindings: AtomBindings = BINDINGS) =>
    scoreFinitenessOf(score, bindings.specAtoms?.vocabulary);

  it("G: truth-valued scores are 0 or 1 under the pinned semantics, whatever their operands", () => {
    // Comparisons and logical operators are C++ bools (expressions.cpp:333-358,
    // 384-433), so even an unproven operand cannot make them non-finite.
    for (const score of [
      "remains<3",
      "combo_points>=5",
      "buff.foo.up|refreshable",
      "!dot.y.ticking",
      "debuff.bar.up",
    ]) {
      expect(finite(score), score).toEqual({ kind: "PROVEN_FINITE", bound: 1 });
    }
    expect(finite("talent.foo")).toEqual({ kind: "PROVEN_FINITE", bound: 1 });
    expect(finite("buff.foo.up")).toEqual({ kind: "PROVEN_FINITE", bound: 1 });
  });

  it("G: target.time_to_die is a timespan_t in seconds, and bounded arithmetic over proven operands stays proven", () => {
    expect(finite("target.time_to_die")).toEqual({ kind: "PROVEN_FINITE", bound: 2 ** 63 / 1000 });
    expect(finite("2*talent.foo+1")).toEqual({ kind: "PROVEN_FINITE", bound: 3 });
    expect(finite("target.time_to_die-3*debuff.bar.up")).toMatchObject({ kind: "PROVEN_FINITE" });
  });

  it("H: division and modulus are never proven: they do not even parse in the supported subset", () => {
    for (const score of ["target.time_to_die%2", "target.time_to_die%%2", "1%0", "a/b"]) {
      expect(finite(score), score).toEqual({
        kind: "NOT_PROVEN_FINITE",
        reason: "SCORE_UNSUPPORTED",
        at: null,
      });
    }
  });

  it("H: arithmetic whose bound could overflow is not proven", () => {
    const chain = Array.from({ length: 21 }, () => "target.time_to_die").join("*");
    expect(finite(chain)).toMatchObject({ kind: "NOT_PROVEN_FINITE", reason: "ARITHMETIC_BOUND_EXCEEDED" });
  });

  it("E: atoms with no audited pinned domain are not proven, even where they are obviously numbers", () => {
    expect(finite("target.health.pct")).toMatchObject({
      kind: "NOT_PROVEN_FINITE",
      reason: "SCORE_UNSUPPORTED",
    });
    for (const [score, at] of [
      ["remains", "remains"],
      ["buff.foo.remains", "buff.foo.remains"],
      ["buff.foo.stack", "buff.foo.stack"],
      ["combo_points", "combo_points"],
      ["fight_remains", "fight_remains"],
      ["cooldown.foo.remains", "cooldown.foo.remains"],
      // A truth node HERE, a stack COUNT in SimulationCraft: shape is not domain.
      ["buff.foo.react", "buff.foo.react"],
    ] as const) {
      expect(finite(score), score).toEqual({ kind: "NOT_PROVEN_FINITE", reason: "NO_AUDITED_DOMAIN", at });
    }
    // An unproven operand poisons arithmetic, but not a comparison over it.
    expect(finite("remains+1")).toMatchObject({ kind: "NOT_PROVEN_FINITE", at: "remains" });
    expect(finite("remains+1>2")).toMatchObject({ kind: "PROVEN_FINITE" });
  });

  it("F: a spec-declared identifier is never proven finite by its scope or shape declaration", () => {
    for (const shape of ["NUMERIC", "BOOLEAN"] as const) {
      const bindings: AtomBindings = {
        ...BINDINGS,
        specAtoms: {
          vocabulary: defineSpecAtomVocabulary(
            "synthetic/test",
            [{ identifier: "spec_score", shape, scope: "PLAYER_SCOPED", selfAddressing: false }],
            isBuiltinIdentifier,
          ),
          bound: [],
        },
      };
      expect(finite("spec_score", bindings), shape).toEqual({
        kind: "NOT_PROVEN_FINITE",
        reason: "NO_AUDITED_DOMAIN",
        at: "spec_score",
      });
      // So it is NOT enough to ignore MIN/MAX target choice, even with a TRUE player-only if=.
      expect(
        targetIfVerdict(actionOf(`x,target_if=min:spec_score,if=${P_TRUE}`), bindings),
        shape,
      ).toMatchObject({ kind: "REFUSED", reason: "SCORE_NOT_PROVEN_FINITE" });
    }
  });
});

describe("the revised MIN/MAX rule, case by case", () => {
  it("A: MIN with a proven-finite score and a player-only TRUE if= ignores target choice", () => {
    const verdict = targetIfVerdict(actionOf(`x,target_if=min:target.time_to_die,if=${P_TRUE}`), BINDINGS);
    expect(verdict).toMatchObject({
      kind: "TARGET_SELECTION_IGNORABLE",
      scoreFiniteness: { kind: "PROVEN_FINITE" },
    });
    expect(scan(one([`x,target_if=min:target.time_to_die,if=${P_TRUE}`, "y"]))).toMatchObject({
      kind: "SELECTED",
      actionToken: "x",
    });
  });

  it("B: MAX with a proven-finite score does the same", () => {
    expect(scan(one([`x,target_if=max:debuff.bar.up,if=${P_TRUE}`, "y"]))).toMatchObject({
      kind: "SELECTED",
      actionToken: "x",
    });
  });

  it("C: a proven-finite score with a FALSE player-only if= is skipped", () => {
    const result = scan(one([`x,target_if=max:target.time_to_die,if=${P_FALSE}`, "y"]));
    expect(result.kind === "SELECTED" && result.actionToken).toBe("y");
  });

  it("D: a proven-finite score with an UNKNOWN player-only if= is UNKNOWN", () => {
    const result = scan(one([`x,target_if=min:target.time_to_die,if=${P_UNKNOWN}`, "y"]));
    expect(result.kind).toBe("UNKNOWN");
    expect(stepAt(result, "default[0]")?.outcome).toBe("MAY_SELECT");
  });

  it("E: an unproven score keeps target choice relevant: refused, whatever the if= says", () => {
    for (const score of ["target.health.pct", "dot.barbed_shot.remains", "remains", "buff.foo.remains"]) {
      expectRefusedAtFirstLine(
        one([`x,target_if=min:${score},if=${P_TRUE}`, "y"]),
        "SCORE_NOT_PROVEN_FINITE",
        score,
      );
      expectRefusedAtFirstLine(
        one([`x,target_if=max:${score}`, "y"]),
        "SCORE_NOT_PROVEN_FINITE",
        `${score} no if=`,
      );
    }
  });

  it("I: a FALSE independent conjunct still eliminates a line whose score is NOT proven finite", () => {
    for (const score of ["target.health.pct", "remains", "dot.y.remains%2"]) {
      const result = scan(one([`x,target_if=min:${score},if=${P_FALSE}&${T_DEP}`, "y"]));
      expect(result.kind === "SELECTED" && result.actionToken, score).toBe("y");
      expect(stepAt(result, "default[0]")?.outcome, score).toBe("TARGET_INDEPENDENT_ELIMINATION_CONTINUE");
    }
    // And on a run.
    const run = scan({
      lists: [
        {
          listName: "default",
          actions: [`run_action_list,name=child,target_if=min:target.health.pct,if=${P_FALSE}`, "y"],
        },
        { listName: "child", actions: ["x"] },
      ],
      usable: ["x", "y"],
    });
    expect(run.kind === "SELECTED" && run.actionToken).toBe("y");
  });

  it("J: FIRST stays unsupported even when its expression is proven finite", () => {
    expect(finite01("debuff.bar.up")).toBe(true);
    expectRefusedAtFirstLine(
      one([`x,target_if=first:debuff.bar.up,if=${P_TRUE}`, "y"]),
      "FIRST_MODE_NEEDS_ENEMY_SET",
      "J",
    );
    expectRefusedAtFirstLine(
      one([`x,target_if=first:target.time_to_die`, "y"]),
      "FIRST_MODE_NEEDS_ENEMY_SET",
      "J2",
    );
  });
});

function finite01(score: string): boolean {
  return scoreFinitenessOf(score).kind === "PROVEN_FINITE";
}

// ---------------------------------------------------------------------------
// A–E: MIN / MAX
// ---------------------------------------------------------------------------

describe("MIN and MAX: target identity is ignorable only when it cannot matter", () => {
  it("A: MIN with a player-only TRUE if= selects the line without knowing the target", () => {
    const result = scan(one([`x,target_if=min:target.time_to_die,if=${P_TRUE}`, "y"]));
    expect(result.kind === "SELECTED" && result.actionToken).toBe("x");
    const line = stepAt(result, "default[0]");
    expect(line?.outcome).toBe("SELECTED");
    expect(line?.targetingRefusal?.kind).toBe("TARGET_SELECTION_IGNORABLE");
    expect(line?.gate.kind === "EVALUATED" && line.gate.truth).toBe("TRUE");
    const query = firstGcd(one([`x,target_if=min:target.time_to_die,if=${P_TRUE}`, "y"]), ["x", "y"]);
    expect(compared(query, "x")).toBe("MATCH");
    // A supported selection, so a different observed token is a real disagreement.
    expect(compared(query, "y")).toBe("REJECTED");
  });

  it("B: MAX with a player-only TRUE if= does the same", () => {
    const result = scan(one([`x,target_if=max:debuff.bar.up,if=${P_TRUE}`, "y"]));
    expect(result.kind === "SELECTED" && result.actionToken).toBe("x");
    expect(stepAt(result, "default[0]")?.targetingRefusal?.kind).toBe("TARGET_SELECTION_IGNORABLE");
  });

  it("A/B: MIN or MAX with NO if= is ready whenever the plain line is: a finite score always chooses a target", () => {
    for (const mode of ["min", "max"]) {
      const result = scan(one([`x,target_if=${mode}:target.time_to_die`, "y"]));
      expect(result.kind === "SELECTED" && result.actionToken, mode).toBe("x");
      const record = stepAt(result, "default[0]")?.targetingRefusal;
      expect(record?.kind === "TARGET_SELECTION_IGNORABLE" && record.targetIf.condition, mode).toBe("ABSENT");
    }
  });

  it("C: MIN/MAX with a player-only FALSE if= is skipped safely", () => {
    for (const mode of ["min", "max"]) {
      const result = scan(one([`x,target_if=${mode}:target.time_to_die,if=${P_FALSE}`, "y"]));
      expect(result.kind === "SELECTED" && result.actionToken, mode).toBe("y");
      const line = stepAt(result, "default[0]");
      expect(line?.outcome, mode).toBe("TARGET_INDEPENDENT_ELIMINATION_CONTINUE");
      expect(line?.targetingRefusal?.kind, mode).toBe("ELIMINATED_FOR_EVERY_TARGET");
    }
  });

  it("D: MIN/MAX with a player-only UNKNOWN if= is UNKNOWN, never FALSE", () => {
    for (const mode of ["min", "max"]) {
      const setup = one([`x,target_if=${mode}:target.time_to_die,if=${P_UNKNOWN}`, "y"]);
      const result = scan(setup);
      // x MIGHT fire and y definitely would: something fires, which is undecided.
      expect(result.kind === "UNKNOWN" && result.blocker, mode).toBe("COMPETING_POSSIBLE_ACTION");
      expect(stepAt(result, "default[0]")?.outcome, mode).toBe("MAY_SELECT");
      expect(stepAt(result, "default[0]")?.outcome, mode).not.toBe("ELIMINATED_CONTINUE");
      const query = firstGcd(setup, ["x", "y"]);
      for (const observed of ["x", "y"])
        expect(compared(query, observed), `${mode} ${observed}`).toBe("UNKNOWN");
    }
  });

  it("E: MIN/MAX with a target-dependent if= stays UNKNOWN on the target-selection blocker", () => {
    for (const mode of ["min", "max"]) {
      expectRefusedAtFirstLine(
        one([`x,target_if=${mode}:target.time_to_die,if=${P_TRUE}&${T_DEP}`, "y"]),
        "CONDITION_TARGET_DEPENDENT",
        mode,
      );
    }
    // Classified as target selection, never as divergent worlds.
    const query = firstGcd(one([`x,target_if=min:target.health.pct,if=${T_DEP}`, "y"]), ["x", "y"]);
    const classified = classifyDecision(query);
    expect(classified.rawBlocker).toBe("ONE_SCAN_BLOCKED/UNSUPPORTED_ACTION_OPTION");
    expect(classified.blockerClass).toBe("TARGETING_NOT_MODELLED");
  });

  it("E: other target-scoped atoms are dependent too: refreshable, remains, dot ticking, time to die", () => {
    for (const condition of ["refreshable", "remains<3", "dot.y.ticking", "target.time_to_die>10"]) {
      expectRefusedAtFirstLine(
        one([`x,target_if=min:target.time_to_die,if=${condition}`, "y"]),
        "CONDITION_TARGET_DEPENDENT",
        condition,
      );
    }
  });

  it("a score that might be infinite or NaN is refused: MIN/MAX could choose no target at all", () => {
    expectRefusedAtFirstLine(
      one([`x,target_if=min:dot.y.remains%cooldown.z.remains,if=${P_TRUE}`, "y"]),
      "SCORE_NOT_PROVEN_FINITE",
      "division",
    );
  });
});

// ---------------------------------------------------------------------------
// F–G: FIRST
// ---------------------------------------------------------------------------

describe("FIRST stays a gate on the enemy set", () => {
  it("F: FIRST with a target-dependent expression is UNKNOWN", () => {
    expectRefusedAtFirstLine(
      one([`x,target_if=first:${T_DEP},if=${P_TRUE}`, "y"]),
      "FIRST_MODE_NEEDS_ENEMY_SET",
      "F",
    );
    // No prefix is FIRST.
    expectRefusedAtFirstLine(
      one([`x,target_if=refreshable|${T_DEP}`, "y"]),
      "FIRST_MODE_NEEDS_ENEMY_SET",
      "bare",
    );
  });

  it("G: FIRST never assumes a qualifying target exists, even when everything readable is TRUE", () => {
    expectRefusedAtFirstLine(
      one([`x,target_if=first:${P_TRUE},if=${P_TRUE}`, "y"]),
      "FIRST_MODE_NEEDS_ENEMY_SET",
      "player-only FIRST",
    );
    expectRefusedAtFirstLine(
      one([`x,target_if=first:${P_TRUE}`, "y"]),
      "FIRST_MODE_NEEDS_ENEMY_SET",
      "no if=",
    );
  });
});

// ---------------------------------------------------------------------------
// H–I: independent conjuncts
// ---------------------------------------------------------------------------

describe("a player-only conjunct settles the line only when it is proven FALSE", () => {
  it("H: a FALSE independent conjunct eliminates the line whatever the target-dependent remainder, in every mode", () => {
    for (const option of [
      "target_if=min:target.time_to_die",
      "target_if=max:a",
      "target_if=first:refreshable",
    ]) {
      const result = scan(one([`x,${option},if=${P_FALSE}&${T_DEP}`, "y"]));
      expect(result.kind === "SELECTED" && result.actionToken, option).toBe("y");
      expect(stepAt(result, "default[0]")?.outcome, option).toBe("TARGET_INDEPENDENT_ELIMINATION_CONTINUE");
    }
    // Through normal expression semantics, not text: talent false is the same proof.
    const talent = scan(
      one([`x,target_if=min:target.time_to_die,if=talent.foo&${T_DEP}`, "y"], ["x", "y"], {
        bindings: { ...BINDINGS, knownTalents: [{ name: "foo", taken: false }] },
      }),
    );
    expect(talent.kind === "SELECTED" && talent.actionToken).toBe("y");
  });

  it("I: an UNKNOWN independent conjunct does not eliminate: UNKNOWN", () => {
    expectRefusedAtFirstLine(
      one([`x,target_if=min:target.time_to_die,if=${P_UNKNOWN}&${T_DEP}`, "y"]),
      "CONDITION_TARGET_DEPENDENT",
      "unknown conjunct",
    );
    // A TRUE independent conjunct proves nothing either.
    expectRefusedAtFirstLine(
      one([`x,target_if=min:target.time_to_die,if=${P_TRUE}&${T_DEP}`, "y"]),
      "CONDITION_TARGET_DEPENDENT",
      "true conjunct",
    );
    // An unknown talent is not a false talent.
    expectRefusedAtFirstLine(
      one([`x,target_if=min:target.time_to_die,if=talent.foo&${T_DEP}`, "y"]),
      "CONDITION_TARGET_DEPENDENT",
      "unknown talent",
    );
  });
});

// ---------------------------------------------------------------------------
// J: run_action_list and call_action_list
// ---------------------------------------------------------------------------

describe("J: target_if on dispatch entries", () => {
  const runOver = (runLine: string, child: readonly string[], below = "y"): Setup => ({
    lists: [
      { listName: "default", actions: [runLine, below] },
      { listName: "child", actions: child },
    ],
    usable: ["x", "y", "w"],
  });

  it("a run with a target-dependent target_if explores both worlds and stops AT the run line when they disagree", () => {
    const setup = runOver(`run_action_list,name=child,target_if=min:target.health.pct,if=${T_DEP}`, ["x"]);
    const result = scan(setup);
    expect(result.kind === "UNKNOWN" && [result.blocker, at(result.blockedAt)]).toEqual([
      "UNSUPPORTED_ACTION_OPTION",
      "default[0]",
    ]);
    expect(visited(result)).toEqual(["default[0]"]);
    const raw = rawScan(setup);
    expect(raw.kind === "BLOCKED" && raw.explored && raw.explored.steps.map((step) => at(step))).toEqual([
      "default[0]",
      "child[0]",
      "default[1]",
    ]);
    const query = firstGcd(setup, ["x", "y"]);
    const classified = classifyDecision(query);
    expect(classified.rawBlocker).toBe("ONE_SCAN_BLOCKED/UNSUPPORTED_ACTION_OPTION");
    expect(classified.blockerClass).not.toBe("DIVERGENT_WORLDS");
    expect(classified.blockerClass).toBe("TARGETING_NOT_MODELLED");
    for (const observed of ["x", "y", "z"]) expect(compared(query, observed), observed).toBe("UNKNOWN");
  });

  it("a speculative child obstacle never replaces the target_if run line as the stop", () => {
    const setup: Setup = {
      ...runOver(`run_action_list,name=child,target_if=first:${T_DEP}`, ["w"]),
      applicabilityUnknown: ["w"],
    };
    const result = scan(setup);
    expect(result.kind === "UNKNOWN" && [result.blocker, at(result.blockedAt)]).toEqual([
      "UNSUPPORTED_ACTION_OPTION",
      "default[0]",
    ]);
  });

  it("a run whose worlds agree converges even though target selection is unknown", () => {
    const result = scan(
      runOver(`run_action_list,name=child,target_if=min:target.time_to_die,if=${T_DEP}`, ["y"]),
    );
    expect(result.kind === "TOKEN_CONVERGED" && result.actionToken).toBe("y");
  });

  it("a run with an ignorable target_if is an ordinary run gate: TRUE transfers, undecided is D3-A's", () => {
    const entered = scan(
      runOver(`run_action_list,name=child,target_if=min:target.time_to_die,if=${P_TRUE}`, ["x"]),
    );
    expect(entered.kind === "SELECTED" && entered.actionToken).toBe("x");
    expect(stepAt(entered, "default[0]")?.outcome).toBe("RUN_ENTERED_SCAN_ENDS");
    expect(stepAt(entered, "default[0]")?.targetingRefusal?.kind).toBe("TARGET_SELECTION_IGNORABLE");

    const undecided = scan(
      runOver(`run_action_list,name=child,target_if=min:target.time_to_die,if=${P_UNKNOWN}`, ["x"]),
    );
    expect(undecided.kind === "UNKNOWN" && [undecided.blocker, at(undecided.blockedAt)]).toEqual([
      "UNDECIDED_RUN_GATE",
      "default[0]",
    ]);
  });

  it("an ignorable target_if is never the attributed frontier: the class comes from what is undecided in if=", () => {
    // `buff.foo.up` is what is undecided; target selection was proven not to
    // matter, so the `target_if` text on the line must not classify the stop.
    const onBuff = classifyDecision(
      firstGcd(
        runOver(`run_action_list,name=child,target_if=min:target.time_to_die,if=${P_UNKNOWN}`, ["x"]),
        ["x", "y"],
      ),
    );
    expect(onBuff.rawBlocker).toBe("ONE_SCAN_BLOCKED/UNDECIDED_RUN_GATE");
    expect(onBuff.blockerClass).toBe("OBSERVED_STATE_MISSING");
    const predictive = classifyDecision(
      firstGcd(
        runOver("run_action_list,name=child,target_if=min:target.time_to_die,if=fight_remains<15", ["x"]),
        ["x", "y"],
      ),
    );
    expect(predictive.blockerClass).toBe("PREDICTIVE_STATE");
  });

  it("a run eliminated by a FALSE player-only conjunct is skipped; the parent continues", () => {
    const result = scan(
      runOver(`run_action_list,name=child,target_if=min:target.time_to_die,if=${P_FALSE}&${T_DEP}`, ["x"]),
    );
    expect(result.kind === "SELECTED" && result.actionToken).toBe("y");
    expect(stepAt(result, "default[0]")?.outcome).toBe("TARGET_INDEPENDENT_ELIMINATION_CONTINUE");
    expect(visited(result)).toEqual(["default[0]", "default[1]"]);
  });

  it("a run whose if= is unsupported is refused before anything is explored", () => {
    const setup = runOver(`run_action_list,name=child,target_if=min:target.time_to_die,if=${UNSUPPORTED}`, [
      "x",
    ]);
    const raw = rawScan(setup);
    expect(raw.kind === "BLOCKED" && [raw.blocker, raw.explored]).toEqual([
      "UNSUPPORTED_ACTION_OPTION",
      undefined,
    ]);
    expect(visited(raw)).toEqual(["default[0]"]);
  });

  it("a call's target_if has no effect on readiness: its gate is read as written", () => {
    const result = scan({
      lists: [
        {
          listName: "default",
          actions: [`call_action_list,name=child,target_if=first:${T_DEP},if=${P_TRUE}`, "y"],
        },
        { listName: "child", actions: ["x"] },
      ],
      usable: ["x", "y"],
    });
    expect(result.kind === "SELECTED" && result.actionToken).toBe("x");
    expect(stepAt(result, "default[0]")?.outcome).toBe("CALL_SELECTED");
  });
});

// ---------------------------------------------------------------------------
// K–L: fail closed
// ---------------------------------------------------------------------------

describe("K: a malformed target_if fails closed", () => {
  it("refuses an unknown mode, an empty expression and a doubled option — even over a FALSE player conjunct", () => {
    for (const option of [
      "target_if=median:a",
      "target_if=min:",
      "target_if=",
      "target_if=min:a,target_if=max:b",
    ]) {
      expectRefusedAtFirstLine(one([`x,${option},if=${P_FALSE}`, "y"]), "TARGET_IF_MALFORMED", option);
      const result = scan(one([`x,${option},if=${P_FALSE}`, "y"]));
      const refusal = result.kind === "UNKNOWN" ? result.blockedAt?.targetingRefusal : null;
      expect(refusal?.kind === "REFUSED" && refusal.failure, option).toBe("PROOF_NOT_ATTEMPTED");
    }
  });

  it("refuses a malformed target_if on a call and on a run", () => {
    const call = scan({
      lists: [
        { listName: "default", actions: ["call_action_list,name=child,target_if=median:a", "y"] },
        { listName: "child", actions: ["x"] },
      ],
      usable: ["x", "y"],
    });
    expect(call.kind === "UNKNOWN" && call.blocker).toBe("UNSUPPORTED_ACTION_OPTION");
    const run = scan({
      lists: [
        { listName: "default", actions: ["run_action_list,name=child,target_if=median:a", "y"] },
        { listName: "child", actions: ["x"] },
      ],
      usable: ["x", "y"],
    });
    expect(run.kind === "UNKNOWN" && run.blocker).toBe("UNSUPPORTED_ACTION_OPTION");
  });

  it("refuses target_if beside another targeting option outright, as before", () => {
    const result = scan(one([`x,target_if=min:a,cycle_targets=1,if=${P_FALSE}`, "y"]));
    expect(result.kind === "UNKNOWN" && result.blocker).toBe("UNSUPPORTED_ACTION_OPTION");
  });
});

describe("L: unknown dependency is never player-only", () => {
  it("an if= outside the supported subset is refused, not classified", () => {
    expectRefusedAtFirstLine(
      one([`x,target_if=min:target.time_to_die,if=${UNSUPPORTED}&${P_TRUE}`, "y"]),
      "CONDITION_UNSUPPORTED",
      "unsupported atom",
    );
  });

  it("a spec atom carries the scope its specialization declared — TARGET_SCOPED is dependent, PLAYER_SCOPED is not", () => {
    const withAtom = (scope: "PLAYER_SCOPED" | "TARGET_SCOPED"): AtomBindings => ({
      ...BINDINGS,
      specAtoms: {
        vocabulary: defineSpecAtomVocabulary(
          "synthetic/test",
          [{ identifier: "spec_atom", shape: "BOOLEAN", scope, selfAddressing: false }],
          isBuiltinIdentifier,
        ),
        bound: [{ key: "spec_atom", actionToken: null, value: { kind: "TRUTH", value: true } }],
      },
    });
    const line = "x,target_if=min:target.time_to_die,if=spec_atom";
    expect(targetIfVerdict(actionOf(line), withAtom("TARGET_SCOPED"))).toMatchObject({
      kind: "REFUSED",
      reason: "CONDITION_TARGET_DEPENDENT",
    });
    expect(targetIfVerdict(actionOf(line), withAtom("PLAYER_SCOPED"))).toMatchObject({
      kind: "TARGET_SELECTION_IGNORABLE",
    });
    // Without a declaration the identifier does not parse at all.
    expect(targetIfVerdict(actionOf(line), BINDINGS)).toMatchObject({
      kind: "REFUSED",
      reason: "CONDITION_UNSUPPORTED",
    });
  });
});

// ---------------------------------------------------------------------------
// No later decision may depend on which enemy was chosen
// ---------------------------------------------------------------------------

describe("what B1 does not claim", () => {
  it("a NON_GCD action selected through an ignorable target_if is not executed: its target is unknown", () => {
    const query = firstGcd(one([`x,target_if=min:target.time_to_die,if=${P_TRUE}`, "y"]), ["y"]);
    expect(query.kind === "ROTATIONAL_GCD_UNKNOWN" && [query.blocker, at(query.blockedAt)]).toEqual([
      "TRANSITION_UNSUPPORTED",
      "default[0]",
    ]);
    for (const observed of ["x", "y"]) expect(compared(query, observed), observed).toBe("UNKNOWN");
  });

  it("the single-list walker applies the same rule", () => {
    const authority = (actions: readonly string[]) =>
      syntheticAuthority({ lists: [{ listName: "default", actions: actions as string[] }] });
    const select = (actions: readonly string[]) =>
      selectWithinList(authority(actions), "default", BINDINGS, () => "PROVEN_USABLE");
    expect(select([`x,target_if=min:target.time_to_die,if=${P_TRUE}`, "y"])).toMatchObject({
      kind: "SELECTED",
      actionToken: "x",
    });
    expect(select([`x,target_if=min:target.time_to_die,if=${P_FALSE}`, "y"])).toMatchObject({
      kind: "SELECTED",
      actionToken: "y",
    });
    expect(select([`x,target_if=min:target.time_to_die,if=${T_DEP}`, "y"])).toMatchObject({
      kind: "INDETERMINATE",
      blocker: "UNSUPPORTED_ACTION_OPTION",
    });
    expect(select([`x,target_if=first:${P_TRUE}`, "y"])).toMatchObject({
      kind: "INDETERMINATE",
      blocker: "UNSUPPORTED_ACTION_OPTION",
    });
  });

  it("is deterministic", () => {
    const setup = runOverDeterminism();
    expect(JSON.stringify(rawScan(setup))).toBe(JSON.stringify(rawScan(setup)));
    expect(JSON.stringify(firstGcd(setup, ["x", "y"]))).toBe(JSON.stringify(firstGcd(setup, ["x", "y"])));
  });
});

function runOverDeterminism(): Setup {
  return {
    lists: [
      {
        listName: "default",
        actions: [
          `run_action_list,name=child,target_if=min:target.time_to_die,if=${T_DEP}`,
          `x,target_if=max:a,if=${P_TRUE}`,
        ],
      },
      { listName: "child", actions: ["y"] },
    ],
    usable: ["x", "y"],
  };
}
