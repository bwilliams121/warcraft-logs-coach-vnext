/**
 * M11-D3-C3: `line_cd=` readiness from line-SELECTION evidence.
 *
 * PINNED SEMANTICS (SimulationCraft 33622e9d; see `src/simc/line-cooldown.ts`):
 *
 *     one timer per APL LINE (one action_t per line, each with its own
 *     cooldown_t); started at SELECTION for a foreground action, after
 *     execute() off the GCD, NEVER for a variable or a call; ready again when
 *     now - start >= duration (AT the boundary it is ready); reset to ready at
 *     every pull; precombat starts nothing
 *
 * THE EVIDENCE BOUNDARY (revised in review): the timer's start is the line's
 * SELECTION. A successful cast bounds its selection from ABOVE only, and a
 * selection may cast nothing at all. So READY needs PROVEN selection coverage,
 * NOT_READY needs a proven LOWER bound on a selection, and history built from
 * casts proves neither. Attribution: only a SOLE-ENTRY token is a line's; any
 * other cast of it is ambiguous.
 *
 * The central invariant, as before: uncertainty is UNKNOWN, never REJECTED.
 */

import { describe, expect, it } from "vitest";

import type { ExecutionLane } from "../../src/data/game/ability-gcd-semantics.js";
import {
  compareObservedAction,
  type ObservedRotationalDecision,
} from "../../src/findings/observed-comparison.js";
import { provenUsable } from "../../src/simc/action-applicability.js";
import { loadAplAuthority, type AplAction } from "../../src/simc/apl-authority.js";
import { initialScanVariables, knownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import {
  firstGcdSelectionAcrossRescans,
  type NonGcdTransitionOutcome,
  type RotationalGcdResult,
} from "../../src/simc/first-gcd-selection.js";
import {
  aplLineKey,
  lineCooldownOptionOf,
  lineCooldownReadinessAt,
  lineCooldownResolverFor,
  lineSelectionHistoryFromObservedCasts,
  type LineCooldownResolver,
  type LineSelectionHistory,
  type ObservedCast,
  type SelectionBound,
  type SelectionCoverage,
} from "../../src/simc/line-cooldown.js";
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
const P_FALSE = "combo_points<5";
/** Supported syntax, never bound: an undecided condition. */
const UNDECIDED = "buff.foo.up";
const GCD = ["y", "z", "w"];

const one = (actions: readonly string[]): SyntheticListSpec[] => [
  { listName: "default", actions: [...actions] },
];

const FULL = { fromMs: 0, toMs: 1_000_000 };
const PROVEN: SelectionCoverage = { kind: "SELECTION_COVERAGE_PROVEN", ...FULL };

/**
 * A SYNTHETIC selection history: an evidence contract no Warcraft Logs source
 * supplies today. Selection coverage defaults to PROVEN over the whole fight —
 * that is the point of building it by hand.
 */
function selectionHistory(input: {
  readonly combatStartMs?: number | null;
  readonly selectionCoverage?: SelectionCoverage;
  readonly attributed?: Readonly<Record<string, readonly SelectionBound[]>>;
  readonly ambiguous?: Readonly<Record<string, readonly SelectionBound[]>>;
}): LineSelectionHistory {
  return {
    combatStartMs: input.combatStartMs === undefined ? 0 : input.combatStartMs,
    selectionCoverage: input.selectionCoverage ?? PROVEN,
    selectionsOf: (lineKey) => ({
      attributed: input.attributed?.[lineKey] ?? [],
      ambiguous: input.ambiguous?.[lineKey] ?? [],
    }),
  };
}
/** A selection whose instant is PROVEN (synthetic only). */
const selectedExactlyAt = (ms: number): SelectionBound => ({ selectedAtLeastMs: ms, selectedAtMostMs: ms });
/** What a cast establishes about its selection: at or before it, and nothing below. */
const selectedByCastAt = (ms: number): SelectionBound => ({ selectedAtLeastMs: null, selectedAtMostMs: ms });

/** History built from OBSERVED CASTS, with cast retrieval complete over the whole fight. */
function castHistory(
  lists: readonly SyntheticListSpec[],
  casts: readonly ObservedCast[],
): LineSelectionHistory {
  return lineSelectionHistoryFromObservedCasts({
    authority: syntheticAuthority({ lists: lists as SyntheticListSpec[] }),
    combatStartMs: 0,
    observedCastCoverage: FULL,
    casts,
  });
}

const resolverAt = (history: LineSelectionHistory | null, decisionTimeMs: number, started: string[] = []) =>
  lineCooldownResolverFor({ history, decisionTimeMs, linesStartedThisDecision: started });

const readinessOf = (history: LineSelectionHistory, decisionTimeMs: number, durationMs = 10_000) =>
  lineCooldownReadinessAt({ durationMs, decisionTimeMs, lineKey: "default[0]", history });

const scan = (lists: readonly SyntheticListSpec[], lineCooldownFor?: LineCooldownResolver): TraversalResult =>
  selectAcrossLists({
    authority: syntheticAuthority({ lists: lists as SyntheticListSpec[] }),
    entryListName: "default",
    bindings: BINDINGS,
    usabilityFor: () => provenUsable(),
    ...(lineCooldownFor === undefined ? {} : { lineCooldownFor }),
  });

const selected = (result: TraversalResult) => (result.kind === "SELECTED" ? result.actionToken : result.kind);
const label = (step: { readonly listName: string; readonly priorityOrdinal: number }) => aplLineKey(step);
const stepAt = (result: { readonly steps: readonly TraversalStep[] }, line: string) =>
  result.steps.find((step) => label(step) === line);

/**
 * The first-GCD query over `lists`. Every action stays usable after it fires
 * and a transition changes NOTHING in the caller's state, so the only thing
 * that can stop a NON_GCD line firing again is its own timer.
 */
function firstGcd(
  lists: readonly SyntheticListSpec[],
  input: {
    readonly history: LineSelectionHistory | null;
    readonly decisionTimeMs: number;
    /** `false` models a caller that does not forward the decision's started lines. */
    readonly forwardStarted?: boolean;
  },
): RotationalGcdResult {
  const authority = syntheticAuthority({ lists: lists as SyntheticListSpec[] });
  return firstGcdSelectionAcrossRescans<string>({
    rootListName: "default",
    initialState: "s",
    stateKey: (state) => state,
    scanFor: (_state, decision) =>
      resolveOneForegroundScan({
        authority,
        entryListName: "default",
        bindings: BINDINGS,
        usabilityFor: () => provenUsable(),
        lineCooldownFor: resolverAt(
          input.history,
          input.decisionTimeMs,
          input.forwardStarted === false ? [] : [...decision.linesStartedThisDecision],
        ),
      }),
    laneFor: (step: TraversalStep): ExecutionLane =>
      GCD.includes(step.actionToken) ? "GCD_CONSUMING" : "NON_GCD",
    transitionFor: (_action, state): NonGcdTransitionOutcome<string> => ({
      kind: "APPLIED",
      nextState: state,
      timeAdvanceMs: 0,
      evidence: {
        kind: "SYNTHETIC",
        provenance: "synthetic test",
        stateKeyBefore: state,
        stateKeyAfter: state,
      },
    }),
  });
}

function compared(result: RotationalGcdResult, observedToken: string) {
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

function expectNeverConfident(result: RotationalGcdResult, why: string): void {
  expect(result.kind, why).toBe("ROTATIONAL_GCD_UNKNOWN");
  for (const observed of ["x", "y", "z", "w"])
    expect(compared(result, observed), `${why} ${observed}`).toBe("UNKNOWN");
}

function actionOf(line: string, listName = "default"): AplAction {
  const loaded = loadAplAuthority(syntheticArtifact({ lists: [{ listName, actions: [line] }] }));
  if (!loaded.ok) throw new Error(loaded.detail);
  const lookup = loaded.authority.actionsInList(listName);
  const [action] = lookup.found ? lookup.actions : [];
  if (action === undefined) throw new Error("no action");
  return action;
}

// ---------------------------------------------------------------------------
// The option, as pinned
// ---------------------------------------------------------------------------

describe("the line_cd option, as SimulationCraft parses it", () => {
  it("is whole milliseconds, truncated as timespan_t::from_seconds does", () => {
    expect(lineCooldownOptionOf(actionOf("x,line_cd=10"))).toMatchObject({
      kind: "DURATION",
      durationMs: 10_000,
    });
    expect(lineCooldownOptionOf(actionOf("x,line_cd=0.35,if=buff.a.up"))).toMatchObject({ durationMs: 350 });
    expect(lineCooldownOptionOf(actionOf("x,line_cd=0.3"))).toMatchObject({ durationMs: 300 });
    expect(lineCooldownOptionOf(actionOf("x,line_cd=600"))).toMatchObject({ durationMs: 600_000 });
    expect(lineCooldownOptionOf(actionOf("x,if=buff.a.up"))).toEqual({ kind: "ABSENT" });
  });

  it("refuses a value that is not a plain decimal, or one written twice", () => {
    for (const line of ["x,line_cd=soon", "x,line_cd=-1", "x,line_cd=1,line_cd=2", "x,line_cd="]) {
      expect(lineCooldownOptionOf(actionOf(line)).kind, line).toBe("MALFORMED");
      const result = scan(one([line, "y"]), resolverAt(selectionHistory({}), 5_000));
      expect(result.kind, line).toBe("UNKNOWN");
      expect(result.kind === "UNKNOWN" && result.blocker, line).toBe("UNSUPPORTED_ACTION_OPTION");
    }
  });

  it("line_cd=0 is no restriction: the timer never starts", () => {
    // Even with no history at all.
    expect(selected(scan(one(["x,line_cd=0", "y"])))).toBe("x");
    expect(readinessOf(castHistory(one(["x"]), []), 1, 0)).toEqual({
      kind: "READY",
      basis: "NO_RESTRICTION",
    });
  });
});

// ---------------------------------------------------------------------------
// The evidence boundary (review A-D)
// ---------------------------------------------------------------------------

describe("the evidence boundary: casts are not selections", () => {
  const lists = one(["w,line_cd=10", "y"]);

  it("review A — HIDDEN SELECTION: an attributed cast at t=0 cannot prove the line ready at t=15", () => {
    // Two worlds the cast log cannot tell apart:
    //
    //   World A: the line is selected at t=0 and casts; nothing since. At t=15
    //            15 s have passed and line_cd=10 is READY.
    //   World B: the same, and the line is selected AGAIN at t=12 — the timer
    //            restarts at selection (player.cpp:7390) — but the execution is
    //            dropped and nothing is cast. At t=15 the timer has 7 s to run:
    //            NOT READY.
    //
    // Both worlds produce exactly one successful cast, at t=0.
    const worldA = selectionHistory({ attributed: { "default[0]": [selectedExactlyAt(0)] } });
    const worldB = selectionHistory({
      attributed: { "default[0]": [selectedExactlyAt(0), selectedExactlyAt(12_000)] },
    });
    expect(readinessOf(worldA, 15_000).kind).toBe("READY");
    expect(readinessOf(worldB, 15_000)).toMatchObject({ kind: "NOT_READY", remainingAtLeastMs: 7_000 });

    // What the casts give, even with cast retrieval COMPLETE over the fight:
    const fromCasts = castHistory(lists, [{ actionToken: "w", observedAtMs: 0 }]);
    expect(fromCasts.selectionCoverage).toEqual({ kind: "NOT_PROVEN", observedCastCoverage: FULL });
    expect(fromCasts.selectionsOf("default[0]")).toEqual({
      attributed: [selectedByCastAt(0)],
      ambiguous: [],
    });
    expect(readinessOf(fromCasts, 15_000)).toEqual({
      kind: "UNKNOWN",
      reason: "SELECTION_COVERAGE_NOT_PROVEN",
    });
    // Neither world is chosen: the line may fire, and the answer is UNKNOWN.
    expect(scan(lists, resolverAt(fromCasts, 15_000)).kind).toBe("UNKNOWN");
    expectNeverConfident(firstGcd(lists, { history: fromCasts, decisionTimeMs: 15_000 }), "hidden selection");
  });

  it("review B — NO LOWER BOUND: a cast inside the window cannot prove the line NOT ready", () => {
    // Cast at t=8, decision at t=10, line_cd=10: the selection was at or before
    // t=8 — possibly long before. Nothing proves S > D - N = 0... and even had
    // the selection been at t=-1 (before the pull) it would not count.
    const fromCasts = castHistory(lists, [{ actionToken: "w", observedAtMs: 8_000 }]);
    expect(readinessOf(fromCasts, 10_000).kind).toBe("UNKNOWN");
    // The same bound under PROVEN selection coverage is still not NOT_READY:
    // the selection may lie anywhere up to t=8.
    expect(
      readinessOf(selectionHistory({ attributed: { "default[0]": [selectedByCastAt(8_000)] } }), 10_000),
    ).toEqual({ kind: "UNKNOWN", reason: "SELECTION_TIME_NOT_BOUNDED" });
    expectNeverConfident(firstGcd(lists, { history: fromCasts, decisionTimeMs: 10_000 }), "no lower bound");
  });

  it("review C — PROVEN LOWER BOUND: S_lo > D - N proves NOT_READY, with or without coverage", () => {
    for (const selectionCoverage of [PROVEN, { kind: "NOT_PROVEN", observedCastCoverage: null } as const]) {
      const history = selectionHistory({
        selectionCoverage,
        attributed: { "default[0]": [{ selectedAtLeastMs: 6_000, selectedAtMostMs: 7_000 }] },
      });
      // D=10, N=10: S >= 6 > 0, so D - S <= 4 < 10.
      expect(readinessOf(history, 10_000)).toEqual({
        kind: "NOT_READY",
        basis: "PROVEN_SELECTION",
        remainingAtLeastMs: 6_000,
      });
      const result = scan(lists, resolverAt(history, 10_000));
      expect(selected(result)).toBe("y");
      expect(stepAt(result, "default[0]")).toMatchObject({
        outcome: "LINE_COOLDOWN_NOT_READY_CONTINUE",
        gate: { kind: "NOT_EVALUATED", why: "LINE_COOLDOWN_NOT_READY" },
      });
    }
    // A lower bound AT D - N is not enough: S = D - N is ready (ready <= now).
    expect(
      readinessOf(
        selectionHistory({
          selectionCoverage: { kind: "NOT_PROVEN", observedCastCoverage: null },
          attributed: { "default[0]": [{ selectedAtLeastMs: 0, selectedAtMostMs: 7_000 }] },
        }),
        10_000,
      ).kind,
    ).toBe("UNKNOWN");
    // A lower bound before the pull proves nothing: such a selection was reset.
    expect(
      readinessOf(
        selectionHistory({
          combatStartMs: 5_000,
          selectionCoverage: { kind: "NOT_PROVEN", observedCastCoverage: null },
          attributed: { "default[0]": [{ selectedAtLeastMs: 4_000, selectedAtMostMs: 6_000 }] },
        }),
        10_000,
      ).kind,
    ).toBe("UNKNOWN");
  });

  it("review D — PROVEN SELECTION COVERAGE: no selection in the window proves READY", () => {
    expect(readinessOf(selectionHistory({}), 5_000)).toEqual({
      kind: "READY",
      basis: "NO_SELECTION_IN_WINDOW",
    });
    expect(selected(scan(lists, resolverAt(selectionHistory({}), 5_000)))).toBe("w");
    // A selection before the pull was reset there (reset_init at every pull).
    const beforePull = selectionHistory({
      combatStartMs: 1_000,
      selectionCoverage: { kind: "SELECTION_COVERAGE_PROVEN", fromMs: 1_000, toMs: 1_000_000 },
      attributed: { "default[0]": [selectedExactlyAt(-2_000)] },
    });
    expect(readinessOf(beforePull, 4_000).kind).toBe("READY");
    // Coverage that misses part of the window is not enough.
    const late = selectionHistory({
      selectionCoverage: { kind: "SELECTION_COVERAGE_PROVEN", fromMs: 2_000, toMs: 1_000_000 },
    });
    expect(readinessOf(late, 5_000)).toEqual({ kind: "UNKNOWN", reason: "SELECTION_COVERAGE_INCOMPLETE" });
    expect(readinessOf(late, 12_000).kind).toBe("READY");
    const early = selectionHistory({
      selectionCoverage: { kind: "SELECTION_COVERAGE_PROVEN", fromMs: 0, toMs: 4_000 },
    });
    expect(readinessOf(early, 5_000)).toMatchObject({ reason: "SELECTION_COVERAGE_INCOMPLETE" });
    // Cast coverage, however complete, is not selection coverage.
    expect(
      readinessOf(
        selectionHistory({ selectionCoverage: { kind: "NOT_PROVEN", observedCastCoverage: FULL } }),
        5_000,
      ),
    ).toEqual({ kind: "UNKNOWN", reason: "SELECTION_COVERAGE_NOT_PROVEN" });
    expect(readinessOf(selectionHistory({ combatStartMs: null }), 5_000)).toMatchObject({
      reason: "COMBAT_START_UNKNOWN",
    });
    expect(readinessOf(selectionHistory({ combatStartMs: 6_000 }), 5_000)).toMatchObject({
      reason: "DECISION_BEFORE_COMBAT",
    });
  });
});

// ---------------------------------------------------------------------------
// The boundary, under a synthetic proven-selection contract
// ---------------------------------------------------------------------------

describe("a proven selection at exactly t=0, line_cd=10, under proven selection coverage", () => {
  const history = selectionHistory({ attributed: { "default[0]": [selectedExactlyAt(0)] } });
  const lists = one(["x,line_cd=10", "y"]);

  it("at t=5 and t=9.999 the line is not ready; its condition is never read and the scan continues", () => {
    const result = scan(lists, resolverAt(history, 5_000));
    expect(selected(result)).toBe("y");
    expect(stepAt(result, "default[0]")).toMatchObject({
      outcome: "LINE_COOLDOWN_NOT_READY_CONTINUE",
      lineCooldown: {
        durationMs: 10_000,
        readiness: { kind: "NOT_READY", basis: "PROVEN_SELECTION", remainingAtLeastMs: 5_000 },
      },
    });
    expect(selected(scan(lists, resolverAt(history, 9_999)))).toBe("y");
  });

  it("at exactly t=10 it is ready (ready <= now), with no tolerance either side; at t=11 too", () => {
    const result = scan(lists, resolverAt(history, 10_000));
    expect(selected(result)).toBe("x");
    expect(stepAt(result, "default[0]")?.lineCooldown?.readiness).toEqual({
      kind: "READY",
      basis: "NO_SELECTION_IN_WINDOW",
    });
    expect(selected(scan(lists, resolverAt(history, 11_000)))).toBe("x");
  });

  it("a selection whose bounds straddle D - N decides nothing", () => {
    const straddling = selectionHistory({
      attributed: { "default[0]": [{ selectedAtLeastMs: 3_000, selectedAtMostMs: 6_000 }] },
    });
    // D=9, N=5: S in [3, 6] straddles D - N = 4.
    expect(readinessOf(straddling, 9_000, 5_000)).toEqual({
      kind: "UNKNOWN",
      reason: "SELECTION_TIME_NOT_BOUNDED",
    });
  });
});

// ---------------------------------------------------------------------------
// Review F: same-token ambiguity and line identity
// ---------------------------------------------------------------------------

describe("review F — a line is not its token", () => {
  // `w` is GCD-consuming, so whether its line fires IS the answer.
  const twoLists: SyntheticListSpec[] = [
    { listName: "default", actions: ["w,line_cd=10", "call_action_list,name=other", "y"] },
    { listName: "other", actions: [`w,if=${P_FALSE}`] },
  ];

  it("a cast another entry could have produced is ambiguous: never this line's selection", () => {
    const history = castHistory(twoLists, [{ actionToken: "w", observedAtMs: 2_000 }]);
    expect(history.selectionsOf("default[0]")).toEqual({
      attributed: [],
      ambiguous: [selectedByCastAt(2_000)],
    });
    expect(history.selectionsOf("other[0]")).toEqual({
      attributed: [],
      ambiguous: [selectedByCastAt(2_000)],
    });
    expect(scan(twoLists, resolverAt(history, 5_000)).kind).toBe("UNKNOWN");
    expectNeverConfident(firstGcd(twoLists, { history, decisionTimeMs: 5_000 }), "ambiguous cast");
    // Even under PROVEN selection coverage, an ambiguous selection in the window
    // proves nothing either way; one long before it cannot matter.
    const proven = selectionHistory({ ambiguous: { "default[0]": [selectedExactlyAt(2_000)] } });
    expect(readinessOf(proven, 5_000)).toEqual({ kind: "UNKNOWN", reason: "AMBIGUOUS_SELECTION" });
    expect(readinessOf(proven, 12_000).kind).toBe("READY");
    // And an ambiguous selection never proves NOT_READY, whatever its bounds.
    expect(
      readinessOf(
        selectionHistory({
          selectionCoverage: { kind: "NOT_PROVEN", observedCastCoverage: null },
          ambiguous: { "default[0]": [selectedExactlyAt(4_000)] },
        }),
        5_000,
      ).kind,
    ).toBe("UNKNOWN");
  });

  it("a token only one in-combat entry can produce is that entry's; precombat entries do not count", () => {
    const history = castHistory(
      [
        { listName: "precombat", actions: ["x"] },
        { listName: "default", actions: ["x,line_cd=10", "y"] },
      ],
      [{ actionToken: "x", observedAtMs: 2_000 }],
    );
    expect(history.selectionsOf("default[0]")).toEqual({
      attributed: [selectedByCastAt(2_000)],
      ambiguous: [],
    });
    expect(history.selectionsOf("precombat[0]")).toEqual({ attributed: [], ambiguous: [] });
  });

  it("two x lines keep independent timers, and casts never conflate them", () => {
    const lists = one(["x,line_cd=30", "x,line_cd=10", "y"]);
    const history = selectionHistory({
      attributed: { "default[0]": [selectedExactlyAt(0)], "default[1]": [selectedExactlyAt(0)] },
    });
    const result = scan(lists, resolverAt(history, 15_000));
    expect(stepAt(result, "default[0]")?.outcome).toBe("LINE_COOLDOWN_NOT_READY_CONTINUE");
    expect(stepAt(result, "default[1]")?.outcome).toBe("SELECTED");
    // A line started in THIS decision stops that line only.
    const prefix = scan(lists, resolverAt(selectionHistory({}), 15_000, ["default[0]"]));
    expect(stepAt(prefix, "default[0]")?.lineCooldown?.readiness).toMatchObject({
      basis: "STARTED_THIS_DECISION",
    });
    expect(stepAt(prefix, "default[1]")?.outcome).toBe("SELECTED");
    // From casts the two lines are indistinguishable: ambiguous for both.
    const observed = castHistory(lists, [{ actionToken: "x", observedAtMs: 0 }]);
    for (const line of ["default[0]", "default[1]"]) {
      expect(observed.selectionsOf(line), line).toEqual({ attributed: [], ambiguous: [selectedByCastAt(0)] });
    }
    expect(scan(lists, resolverAt(observed, 15_000)).kind).toBe("UNKNOWN");
  });
});

// ---------------------------------------------------------------------------
// No history at all
// ---------------------------------------------------------------------------

describe("without history", () => {
  const lists = one(["w,line_cd=10", "y"]);

  it("a line_cd line is UNKNOWN, whatever the spell's own cooldown says", () => {
    // usabilityFor is PROVEN_USABLE here: the SPELL is ready. The LINE is not known to be.
    const result = scan(lists);
    expect(result.kind).toBe("UNKNOWN");
    expect(stepAt(result, "default[0]")).toMatchObject({
      usability: "UNKNOWN",
      outcome: "MAY_SELECT",
      lineCooldown: { readiness: { kind: "UNKNOWN", reason: "NO_HISTORY_SUPPLIED" } },
    });
    expectNeverConfident(firstGcd(lists, { history: null, decisionTimeMs: 5_000 }), "no history");
  });

  it("an UNKNOWN timer on a NON_GCD action still converges: fired or not, the first GCD is the same", () => {
    const result = firstGcd(one(["x,line_cd=10", "y"]), { history: null, decisionTimeMs: 5_000 });
    expect(result.kind === "ROTATIONAL_GCD_SELECTED" && result.actionToken).toBe("y");
  });
});

// ---------------------------------------------------------------------------
// Review E: the analyzer's own modelled selections (D3-A worlds)
// ---------------------------------------------------------------------------

describe("review E — a line this analyzer selected earlier in the same decision", () => {
  it("is NOT_READY on the zero-time rescan of that world, from no history at all", () => {
    // The prefix selection is not reconstructed from a cast: the analyzer made
    // it, in its own modelled world, so its instant (D) is known exactly.
    //
    // With no history the line's own timer is UNKNOWN, so x MAY fire. In the
    // world where it fires, the rescan reads it NOT_READY — only because this
    // analyzer selected it there — and reaches y; the other world reaches y
    // too. Without the started line forwarded, the fired world would refire
    // forever, and the query would be UNKNOWN.
    for (const history of [null, castHistory(one(["x,line_cd=10", "y"]), [])]) {
      const result = firstGcd(one(["x,line_cd=10", "y"]), { history, decisionTimeMs: 5_000 });
      expect(result.kind === "ROTATIONAL_GCD_SELECTED" && result.actionToken).toBe("y");
      expect(
        result.kind === "ROTATIONAL_GCD_SELECTED" && result.nonGcdPrefix.possibleActions.map(label),
      ).toEqual(["default[0]"]);
      expectNeverConfident(
        firstGcd(one(["x,line_cd=10", "y"]), { history, decisionTimeMs: 5_000, forwardStarted: false }),
        "not forwarded",
      );
    }
    // Under proven-ready history x certainly fires first, exactly once.
    const exact = firstGcd(one(["x,line_cd=10", "y"]), {
      history: selectionHistory({}),
      decisionTimeMs: 5_000,
    });
    expect(exact.kind === "ROTATIONAL_GCD_SELECTED" && exact.nonGcdPrefix.sequence?.map(label)).toEqual([
      "default[0]",
    ]);
    // The control: with no timer nothing stops it firing again, which is no progress.
    const control = firstGcd(one(["x", "y"]), { history: null, decisionTimeMs: 5_000 });
    expect(control.kind === "ROTATIONAL_GCD_UNKNOWN" && control.blocker).toBe("NO_PROGRESS_CYCLE");
  });

  it("is branch state: a world in which the line did not fire never sees it", () => {
    const result = firstGcd(one([`x,line_cd=10,if=${UNDECIDED}`, "y"]), {
      history: selectionHistory({}),
      decisionTimeMs: 5_000,
    });
    // Fired-then-y and not-fired-then-y converge.
    expect(result.kind === "ROTATIONAL_GCD_SELECTED" && result.actionToken).toBe("y");
  });

  it("a caller that does not forward the started lines fails closed, never refiring into an answer", () => {
    const result = firstGcd(one(["x,line_cd=10", "y"]), {
      history: selectionHistory({}),
      decisionTimeMs: 5_000,
      forwardStarted: false,
    });
    expectNeverConfident(result, "not forwarded");
  });
});

// ---------------------------------------------------------------------------
// Variable lines
// ---------------------------------------------------------------------------

describe("line_cd on a variable line changes nothing, as pinned", () => {
  const neverReady: LineCooldownResolver = () => ({
    kind: "NOT_READY",
    basis: "PROVEN_SELECTION",
    remainingAtLeastMs: 1,
  });

  it("the line executes as if the option were absent, and its timer is never consulted", () => {
    const consulted: string[] = [];
    const spy: LineCooldownResolver = (action, durationMs) => {
      consulted.push(aplLineKey(action));
      return neverReady(action, durationMs);
    };
    const result = scan(one(["variable,name=v,value=3,line_cd=10", "y,if=variable.v>2", "z"]), spy);
    expect(selected(result)).toBe("y");
    expect(stepAt(result, "default[0]")).toMatchObject({
      outcome: "VARIABLE_EXECUTED_CONTINUE",
      variableExecution: { kind: "ASSIGNED", name: "v", executed: "PROVEN", value: knownNumber(3) },
    });
    expect(consulted).toEqual([]);
  });

  it("its own if= still decides it; a malformed line_cd is still not modelled", () => {
    const run = (line: string) => {
      const action = actionOf(line);
      const bindings: AtomBindings = { ...BINDINGS, scanVariables: initialScanVariables() };
      return executeVariableLine(
        action,
        evaluateCondition(action, bindings),
        bindings,
        initialScanVariables(),
      ).record;
    };
    expect(run(`variable,name=v,value=3,line_cd=10,if=${P_FALSE}`).kind).toBe("CONDITION_FALSE");
    expect(run(`variable,name=v,value=3,line_cd=10,if=${UNDECIDED}`)).toMatchObject({
      kind: "ASSIGNED",
      executed: "UNDECIDED",
    });
    expect(run("variable,name=v,value=3,line_cd=soon")).toMatchObject({
      kind: "NOT_MODELLED",
      reason: "UNMODELLED_OPTION",
    });
  });
});

// ---------------------------------------------------------------------------
// Retarget pseudo-actions (M11-D3-B2)
// ---------------------------------------------------------------------------

describe("retarget pseudo-actions keep their B2 semantics", () => {
  it("retarget_auto_attack,line_cd=1 still converges with the continuation; its timer is never needed", () => {
    const consulted: string[] = [];
    const lists = one(["retarget_auto_attack,line_cd=1,target_if=min:debuff.x.remains,if=buff.a.up", "y"]);
    const authority = syntheticAuthority({ lists });
    const result = firstGcdSelectionAcrossRescans<string>({
      rootListName: "default",
      initialState: "s",
      stateKey: (state) => state,
      scanFor: () =>
        resolveOneForegroundScan({
          authority,
          entryListName: "default",
          bindings: BINDINGS,
          usabilityFor: () => provenUsable(),
          lineCooldownFor: (action) => {
            consulted.push(aplLineKey(action));
            return { kind: "UNKNOWN", reason: "NO_HISTORY_SUPPLIED" };
          },
        }),
      laneFor: (step) => (GCD.includes(step.actionToken) ? "GCD_CONSUMING" : "NON_GCD"),
      transitionFor: () => ({ kind: "UNSUPPORTED", detail: "never asked" }),
    });
    expect(result.kind === "ROTATIONAL_GCD_SELECTED" && result.actionToken).toBe("y");
    expect(consulted).toEqual([]);
  });

  it("retarget,line_cd=5 never becomes a transition, however ready its timer", () => {
    const lists = one(["retarget,target_if=min:target.time_to_die,line_cd=5,if=combo_points>=5", "y"]);
    const result = firstGcd(lists, { history: selectionHistory({}), decisionTimeMs: 60_000 });
    expect(result.kind === "ROTATIONAL_GCD_UNKNOWN" && result.blocker).toBe("TRANSITION_UNSUPPORTED");
    expectNeverConfident(result, "retarget");
    // Survival's shape: a target_if the shared rule cannot read past is refused
    // before the timer is even read, exactly as before C3.
    const survival = firstGcd(one(["retarget,target_if=max:target.health,line_cd=5", "y"]), {
      history: selectionHistory({}),
      decisionTimeMs: 60_000,
    });
    expectNeverConfident(survival, "retarget survival");
    // A proven-running timer means it cannot fire at all — not that its target was identified.
    const notReady = firstGcd(lists, {
      history: selectionHistory({ attributed: { "default[0]": [selectedExactlyAt(58_000)] } }),
      decisionTimeMs: 60_000,
    });
    expect(notReady.kind === "ROTATIONAL_GCD_SELECTED" && notReady.actionToken).toBe("y");
  });
});

// ---------------------------------------------------------------------------
// Never REJECTED
// ---------------------------------------------------------------------------

describe("no false REJECTED", () => {
  it("cast-only, ambiguous, incomplete, unbounded or pull-less histories never REJECT any observed action", () => {
    const lists = one(["w,line_cd=10", "y"]);
    for (const [why, history] of [
      ["none", null],
      ["casts only, before", castHistory(lists, [{ actionToken: "w", observedAtMs: 1_000 }])],
      ["casts only, none", castHistory(lists, [])],
      [
        "late coverage",
        selectionHistory({
          selectionCoverage: { kind: "SELECTION_COVERAGE_PROVEN", fromMs: 3_000, toMs: FULL.toMs },
        }),
      ],
      ["ambiguous", selectionHistory({ ambiguous: { "default[0]": [selectedExactlyAt(1_000)] } })],
      ["unbounded", selectionHistory({ attributed: { "default[0]": [selectedByCastAt(1_000)] } })],
      ["no pull", selectionHistory({ combatStartMs: null })],
    ] as const) {
      expectNeverConfident(firstGcd(lists, { history, decisionTimeMs: 5_000 }), why);
    }
  });
});
