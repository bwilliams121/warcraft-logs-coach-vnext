/**
 * ONB-S5: shared resource pooling and wait semantics.
 *
 * PINNED SEMANTICS (SimulationCraft 33622e9d; see `src/simc/pooling.ts`):
 *
 *     pool_resource,for_next=1   ready iff the NEXT line is not ready now and
 *                                IS ready with the pooled resource at its
 *                                maximum (player.cpp:10765-10811); pruned with
 *                                its next line when that line is background
 *                                (action.cpp:2856-2865)
 *     pool_resource              ready iff its own `if=` holds
 *     wait / wait_until_ready /  ready only if not moving (and, for the last,
 *     wait_for_cooldown          the named cooldown is down): POSSIBLE at most
 *
 * A ready waiting line is RETURNED by the scan and casts nothing; the next
 * selection needs simulated time, so the first-GCD query refuses it.
 *
 * The central invariant: an undecidable pooling state is UNKNOWN, never a
 * confident lower-priority selection and never REJECTED.
 */

import { describe, expect, it } from "vitest";

import type { ExecutionLane } from "../../src/data/game/ability-gcd-semantics.js";
import {
  compareObservedAction,
  type ObservedRotationalDecision,
} from "../../src/findings/observed-comparison.js";
import {
  applicable,
  notApplicable,
  provenUnusable,
  provenUsable,
  unknownUsability,
  type ActionUsabilityVerdict,
} from "../../src/simc/action-applicability.js";
import { loadAplAuthority, type AplAction } from "../../src/simc/apl-authority.js";
import { classifyDecision } from "../../src/simc/decision-coverage.js";
import {
  knownNumber,
  oneOfNumbers,
  unknownNumber,
  type AtomBindings,
} from "../../src/simc/expression/evaluate.js";
import {
  firstGcdSelectionAcrossRescans,
  type RotationalGcdResult,
} from "../../src/simc/first-gcd-selection.js";
import { selectWithinList } from "../../src/simc/list-selection.js";
import {
  resolveOneForegroundScan,
  selectAcrossLists,
  TRAVERSAL_BLOCKERS,
  type NestedSelectionInput,
  type TraversalResult,
  type TraversalStep,
} from "../../src/simc/nested-selection.js";
import {
  guardedReadinessUnder,
  poolDecisionOf,
  waitActionOf,
  waitLineStructureOf,
  type GuardedReadinessAtMax,
  type PoolingQuery,
  type PoolingResolver,
} from "../../src/simc/pooling.js";
import { syntheticArtifact, syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: knownNumber(0),
  energyPct: knownNumber(30),
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
};

const TRUE = "combo_points>=5";
const FALSE = "combo_points<5";
const UNDECIDED = "buff.foo.up";

const usable = (): ActionUsabilityVerdict => provenUsable();

interface Setup {
  readonly actions: readonly string[];
  readonly extraLists?: readonly SyntheticListSpec[];
  readonly bindings?: AtomBindings;
  readonly usabilityFor?: NestedSelectionInput["usabilityFor"];
  readonly applicabilityFor?: NestedSelectionInput["applicabilityFor"];
  readonly poolingFor?: PoolingResolver;
}

function inputOf(setup: Setup): NestedSelectionInput {
  return {
    authority: syntheticAuthority({
      lists: [{ listName: "default", actions: setup.actions }, ...(setup.extraLists ?? [])],
    }),
    entryListName: "default",
    bindings: setup.bindings ?? BINDINGS,
    usabilityFor: setup.usabilityFor ?? usable,
    ...(setup.applicabilityFor === undefined ? {} : { applicabilityFor: setup.applicabilityFor }),
    ...(setup.poolingFor === undefined ? {} : { poolingFor: setup.poolingFor }),
  };
}

const scan = (setup: Setup): TraversalResult => selectAcrossLists(inputOf(setup));

/** Every token is a GCD action here, so a waiting step can never be mistaken for a zero-time one. */
function firstGcd(setup: Setup): RotationalGcdResult {
  return firstGcdSelectionAcrossRescans<string>({
    rootListName: "default",
    initialState: "s",
    stateKey: (state) => state,
    scanFor: () => resolveOneForegroundScan(inputOf(setup)),
    laneFor: (): ExecutionLane => "GCD_CONSUMING",
    transitionFor: () => ({ kind: "UNSUPPORTED", detail: "synthetic: no transitions" }),
  });
}

const stepAt = (result: { readonly steps: readonly TraversalStep[] }, ordinal: number) =>
  result.steps.find((step) => step.listName === "default" && step.priorityOrdinal === ordinal);

const readyAtMax = (): PoolingResolver => () => ({ kind: "READY_AT_MAX", basis: "synthetic" });
const notReadyAtMax = (): PoolingResolver => () => ({ kind: "NOT_READY_AT_MAX", basis: "synthetic" });

function actionOf(line: string): AplAction {
  const loaded = loadAplAuthority(syntheticArtifact({ lists: [{ listName: "default", actions: [line] }] }));
  if (!loaded.ok) throw new Error(loaded.detail);
  const lookup = loaded.authority.actionsInList("default");
  const [action] = lookup.found ? lookup.actions : [];
  if (action === undefined) throw new Error("no action");
  return action;
}

const cooldownRunning = provenUnusable("ACTIVE_COOLDOWN", {
  abilityGameId: null,
  itemId: null,
  provenRemainingAtLeastMs: 5000,
  cooldownToleranceMs: 0,
  detail: "synthetic: cooldown observed running",
});
const tooPoor = provenUnusable("INSUFFICIENT_RESOURCE", {
  abilityGameId: null,
  itemId: null,
  provenRemainingAtLeastMs: null,
  cooldownToleranceMs: null,
  detail: "synthetic: resource known below cost",
});

// ==========================================================================
// Recognition and structure
// ==========================================================================

describe("the pinned waiting-action tokens", () => {
  it("recognises exactly the four core tokens, and no `wait_for`", () => {
    expect(waitActionOf("pool_resource")).toBe("POOL_RESOURCE");
    expect(waitActionOf("wait")).toBe("WAIT");
    expect(waitActionOf("wait_until_ready")).toBe("WAIT_UNTIL_READY");
    expect(waitActionOf("wait_for_cooldown")).toBe("WAIT_FOR_COOLDOWN");
    expect(waitActionOf("wait_for")).toBeNull();
    expect(waitActionOf("ambush")).toBeNull();
  });

  it("reads the pinned Outlaw and Feral pool lines as guarding their next line", () => {
    const structure = waitLineStructureOf(actionOf("pool_resource,for_next=1"), "POOL_RESOURCE");
    expect(structure).toEqual({
      kind: "MODELLED",
      waitKind: "POOL_RESOURCE",
      guardsNext: true,
      resourceOption: null,
    });
  });

  it("refuses options whose semantics move readiness, and malformed values", () => {
    for (const line of [
      "pool_resource,for_next=1,extra_amount=20",
      "pool_resource,for_next=1,line_cd=2",
      "pool_resource,for_next=2",
      "pool_resource,for_next=1,for_next=0",
      "wait,sec=",
      "wait,name=x",
      "wait_for_cooldown,sec=1",
    ]) {
      const token = line.slice(0, line.indexOf(","));
      const kind = waitActionOf(token);
      if (kind === null) throw new Error(token);
      expect(waitLineStructureOf(actionOf(line), kind).kind, line).toBe("UNMODELLED");
    }
  });

  it("models duration-only options without reading them", () => {
    const pool = waitLineStructureOf(
      actionOf("pool_resource,for_next=1,force_wait=1,resource=energy"),
      "POOL_RESOURCE",
    );
    expect(pool).toEqual({
      kind: "MODELLED",
      waitKind: "POOL_RESOURCE",
      guardsNext: true,
      resourceOption: "energy",
    });
    expect(waitLineStructureOf(actionOf("wait,sec=0.05,if=combo_points>=5"), "WAIT").kind).toBe("MODELLED");
  });
});

describe("the pinned three-way pool rule", () => {
  it("pools only when the guarded line is not ready now and ready at the maximum", () => {
    const ready: GuardedReadinessAtMax = { kind: "READY_AT_MAX", basis: "" };
    const notReady: GuardedReadinessAtMax = { kind: "NOT_READY_AT_MAX", basis: "" };
    const unknown: GuardedReadinessAtMax = { kind: "UNKNOWN", detail: "" };
    expect(poolDecisionOf("READY", null)).toBe("GUARDED_READY");
    expect(poolDecisionOf("NOT_READY", ready)).toBe("POOLS");
    expect(poolDecisionOf("NOT_READY", notReady)).toBe("NOT_RESOURCE_LIMITED");
    expect(poolDecisionOf("NOT_READY", unknown)).toBe("UNDECIDED");
    expect(poolDecisionOf("NOT_READY", null)).toBe("UNDECIDED");
    expect(poolDecisionOf("UNDECIDED", ready)).toBe("UNDECIDED");
  });
});

// ==========================================================================
// pool_resource,for_next=1 in the nested scan
// ==========================================================================

describe("a pool line whose guarded line is ready now", () => {
  it("does not pool: the scan selects the guarded line", () => {
    const result = scan({
      actions: ["pool_resource,for_next=1", `y,if=${TRUE}`, "z"],
      poolingFor: () => {
        throw new Error("the at-maximum question must not be asked when the guarded line is ready now");
      },
    });
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("y");
    const pool = stepAt(result, 0);
    expect(pool?.outcome).toBe("POOL_NOT_READY_CONTINUE");
    expect(pool?.waitAction?.pooling?.decision).toBe("GUARDED_READY");
  });
});

describe("a pool line whose guarded line is not ready now", () => {
  it("POOLS when the guarded line is ready at the maximum: the scan ends and nothing below is reached", () => {
    const result = scan({
      actions: ["pool_resource,for_next=1", `y,if=${FALSE}`, "z"],
      poolingFor: readyAtMax(),
    });
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("pool_resource");
    expect(result.selectingStep.waitAction?.pooling?.decision).toBe("POOLS");
    expect(result.selectingStep.waitAction?.pooling?.guarded?.actionToken).toBe("y");
    expect(stepAt(result, 2)).toBeUndefined();
  });

  it("does not pool when the guarded line is not ready even at the maximum", () => {
    const result = scan({
      actions: ["pool_resource,for_next=1", `y,if=${FALSE}`, "z"],
      poolingFor: notReadyAtMax(),
    });
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("z");
    expect(stepAt(result, 0)?.waitAction?.pooling?.decision).toBe("NOT_RESOURCE_LIMITED");
  });

  it("never falls through to a confident lower selection without an at-maximum model", () => {
    // The priority short-circuit: z is definite, but the pool line above it
    // may fire, so z is not the answer.
    const result = scan({ actions: ["pool_resource,for_next=1", `y,if=${FALSE}`, "z"] });
    expect(result.kind).toBe("UNKNOWN");
    const pool = stepAt(result, 0);
    expect(pool?.outcome).toBe("MAY_SELECT");
    expect(pool?.waitAction?.pooling?.decision).toBe("UNDECIDED");
    expect(pool?.waitAction?.pooling?.atMax?.kind).toBe("UNKNOWN");
  });

  it("settles a resource-independent unusability without asking the resolver", () => {
    const result = scan({
      actions: ["pool_resource,for_next=1", "y", "z"],
      usabilityFor: (action) => (action.actionToken === "y" ? cooldownRunning : provenUsable()),
      poolingFor: () => {
        throw new Error("a running cooldown does not depend on the pooled resource");
      },
    });
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("z");
    expect(stepAt(result, 0)?.waitAction?.pooling?.decision).toBe("NOT_RESOURCE_LIMITED");
  });

  it("asks the resolver when the guarded line is unusable for want of the resource", () => {
    const queries: PoolingQuery[] = [];
    const result = scan({
      actions: ["pool_resource,for_next=1,resource=energy", "y", "z"],
      usabilityFor: (action) => (action.actionToken === "y" ? tooPoor : provenUsable()),
      poolingFor: (query) => {
        queries.push(query);
        return { kind: "READY_AT_MAX", basis: "synthetic" };
      },
    });
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("pool_resource");
    expect(queries).toHaveLength(1);
    expect(queries[0]?.guardedLine.actionToken).toBe("y");
    expect(queries[0]?.resourceOption).toBe("energy");
  });

  it("hands the resolver the scan's own variables, not re-executed ones", () => {
    let seen: PoolingQuery | null = null;
    scan({
      actions: ["variable,name=v,value=3", "pool_resource,for_next=1", `y,if=${FALSE}`, "z"],
      poolingFor: (query) => {
        seen = query;
        return { kind: "UNKNOWN", detail: "synthetic" };
      },
    });
    const variables = (seen as PoolingQuery | null)?.bindings.scanVariables?.values.get("v");
    expect(variables).toEqual(knownNumber(3));
  });
});

describe("a pool line whose guarded line is undecided now", () => {
  it("may fire, ahead of the guarded line, and nothing below becomes confident", () => {
    const result = scan({
      actions: ["pool_resource,for_next=1", `y,if=${UNDECIDED}`, "z"],
      poolingFor: readyAtMax(),
    });
    expect(result.kind).toBe("UNKNOWN");
    const pool = stepAt(result, 0);
    expect(pool?.outcome).toBe("MAY_SELECT");
    expect(pool?.waitAction?.pooling?.decision).toBe("UNDECIDED");
    const resolved = resolveOneForegroundScan(
      inputOf({ actions: ["pool_resource,for_next=1", `y,if=${UNDECIDED}`, "z"], poolingFor: readyAtMax() }),
    );
    expect(resolved.kind).toBe("RESOLVED");
    if (resolved.kind !== "RESOLVED" || resolved.resolution.kind !== "AMBIGUOUS") {
      throw new Error("expected an ambiguous resolution");
    }
    expect(resolved.resolution.candidates.map((candidate) => candidate.identity)).toEqual([
      "pool_resource",
      "y",
      "z",
    ]);
  });

  it("keeps a continuous resource an interval: an energy reading of 41 or 58 against 50 pools nothing", () => {
    const result = scan({
      actions: ["pool_resource,for_next=1", "y,if=energy.pct>=50", "z"],
      bindings: { ...BINDINGS, energyPct: oneOfNumbers([41, 58], "STATE_NOT_ESTABLISHED") },
      poolingFor: readyAtMax(),
    });
    expect(result.kind).toBe("UNKNOWN");
    expect(stepAt(result, 0)?.waitAction?.pooling?.decision).toBe("UNDECIDED");
  });

  it("is never settled by an unknown resource read as zero", () => {
    const result = scan({
      actions: ["pool_resource,for_next=1", "y,if=energy.pct>=50", "z"],
      bindings: { ...BINDINGS, energyPct: unknownNumber("STATE_NOT_ESTABLISHED") },
      poolingFor: readyAtMax(),
    });
    expect(result.kind).toBe("UNKNOWN");
  });
});

describe("pruning and the pool line's own condition", () => {
  it("is pruned with a background guarded line", () => {
    const result = scan({
      actions: ["pool_resource,for_next=1", "y", "z"],
      applicabilityFor: (action) =>
        action.actionToken === "y"
          ? notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", {
              itemId: null,
              slot: null,
              pinnedBehaviour: "synthetic: talent not taken",
            })
          : applicable(),
    });
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("z");
    expect(stepAt(result, 0)?.waitAction?.pooling?.decision).toBe("PRUNED_WITH_GUARDED_LINE");
  });

  it("is background when nothing follows it", () => {
    const result = scan({ actions: [`y,if=${FALSE}`, "pool_resource,for_next=1"] });
    expect(result.kind).toBe("NO_ACTION_SELECTED");
    expect(stepAt(result, 1)?.waitAction?.pooling).toEqual({
      guarded: null,
      resourceOption: null,
      decision: "PRUNED_WITH_GUARDED_LINE",
    });
  });

  it("is not ready when its own condition is false, and the guarded line is read as usual", () => {
    const result = scan({ actions: [`pool_resource,for_next=1,if=${FALSE}`, "y"], poolingFor: readyAtMax() });
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("y");
    expect(stepAt(result, 0)?.outcome).toBe("ELIMINATED_CONTINUE");
  });

  it("may fire, not certainly, when it pools under an undecided condition of its own", () => {
    const result = scan({
      actions: [`pool_resource,for_next=1,if=${UNDECIDED}`, `y,if=${FALSE}`, "z"],
      poolingFor: readyAtMax(),
    });
    expect(result.kind).toBe("UNKNOWN");
    expect(stepAt(result, 0)?.outcome).toBe("MAY_SELECT");
    expect(stepAt(result, 0)?.waitAction?.pooling?.decision).toBe("POOLS");
  });

  it("selects a pool line without for_next whenever its condition holds", () => {
    const result = scan({ actions: [`pool_resource,if=${TRUE}`, "z"] });
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("pool_resource");
    expect(stepAt(result, 1)).toBeUndefined();
  });
});

describe("refused pooling structures", () => {
  it.each([
    ["an extra_amount", ["pool_resource,for_next=1,extra_amount=20", "y", "z"]],
    ["a guarded variable line", ["pool_resource,for_next=1", "variable,name=v,value=1", "z"]],
    ["a guarded call", ["pool_resource,for_next=1", "call_action_list,name=other", "z"]],
    ["a guarded wait", ["pool_resource,for_next=1", "wait,sec=1", "z"]],
  ])("blocks on %s rather than guessing", (_label, actions) => {
    const result = scan({
      actions,
      extraLists: [{ listName: "other", actions: ["y"] }],
      poolingFor: readyAtMax(),
    });
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNMODELLED_WAIT_ACTION");
    expect(result.blockedAt?.priorityOrdinal).toBe(0);
  });

  it("names the new blocker in the shared vocabulary without a class or spec", () => {
    expect(TRAVERSAL_BLOCKERS).toContain("UNMODELLED_WAIT_ACTION");
  });
});

// ==========================================================================
// wait, wait_until_ready, wait_for_cooldown
// ==========================================================================

describe("wait lines", () => {
  it.each(["wait,sec=0.5", "wait_until_ready", "wait_for_cooldown,name=x"])(
    "%s whose condition holds may fire, never certainly: a lower definite line is not the answer",
    (line) => {
      const result = scan({ actions: [`${line},if=${TRUE}`, "z"] });
      expect(result.kind).toBe("UNKNOWN");
      expect(stepAt(result, 0)?.outcome).toBe("MAY_SELECT");
      expect(stepAt(result, 0)?.waitAction?.kind).toBeDefined();
    },
  );

  it("is stepped over when its condition is false", () => {
    const result = scan({ actions: [`wait,sec=0.05,if=${FALSE}`, "z"] });
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("z");
  });

  it("blocks on an unsupported condition rather than reading it", () => {
    const result = scan({ actions: ["wait,if=no_such_thing.foo.bar>1", "z"] });
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blockedAt?.priorityOrdinal).toBe(0);
  });
});

// ==========================================================================
// The first-GCD query and the observed comparison
// ==========================================================================

describe("a waiting selection in the first-GCD query", () => {
  it("is refused as APL_WAIT_SELECTED, never read as a GCD selection", () => {
    const result = firstGcd({
      actions: ["pool_resource,for_next=1", `y,if=${FALSE}`, "z"],
      poolingFor: readyAtMax(),
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("APL_WAIT_SELECTED");
    expect(result.blockedAt?.waitAction?.pooling?.decision).toBe("POOLS");
    const coverage = classifyDecision(result);
    expect(coverage.coverage).toBe("UNKNOWN");
    expect(coverage.actionToken).toBeNull();
  });

  it("refuses a world in which a wait may fire", () => {
    const result = firstGcd({ actions: [`wait,sec=1,if=${TRUE}`, "z"] });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
  });

  it("is unchanged where the pool does not fire: the guarded line is the first GCD", () => {
    const result = firstGcd({ actions: ["pool_resource,for_next=1", `y,if=${TRUE}`, "z"] });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.actionToken).toBe("y");
  });
});

describe("an observed cast against a pooling decision", () => {
  const decision = (observedToken: string): ObservedRotationalDecision => ({
    position: 0,
    locator: {} as ObservedRotationalDecision["locator"],
    actorId: 1,
    abilityGameId: 1,
    observedToken,
    reportTimeMs: 0,
    fightTimeMs: 0,
    targetActorId: null,
  });
  const pooled = firstGcd({
    actions: ["pool_resource,for_next=1", `y,if=${FALSE}`, "z"],
    poolingFor: readyAtMax(),
  });

  it.each(["z", "y", "pool_resource"])(
    "is UNKNOWN for an observed %s: never MATCH, never REJECTED",
    (token) => {
      const compared = compareObservedAction({
        decision: decision(token),
        authorityResult: pooled,
        observedActionJudgment: null,
        usabilityProvenance: "OBSERVED_EXECUTION",
      });
      expect(compared.outcome).toBe("UNKNOWN");
      expect(compared.basis).toBe("AUTHORITY_SELECTION_UNRESOLVED");
      expect(compared.rawBlocker).toBe("APL_WAIT_SELECTED");
    },
  );
});

// ==========================================================================
// The single-list walker and the resolver helper
// ==========================================================================

describe("the single-list walker", () => {
  it("never makes a waiting line its definite winner", () => {
    const authority = syntheticAuthority({
      lists: [{ listName: "default", actions: [`pool_resource,if=${TRUE}`, "z"] }],
    });
    const selection = selectWithinList(authority, "default", BINDINGS, () => "PROVEN_USABLE");
    expect(selection.kind).not.toBe("SELECTED");
  });
});

describe("guardedReadinessUnder, the resolver helper", () => {
  const at = (line: string, usability: ActionUsabilityVerdict, bindings: AtomBindings = BINDINGS) =>
    guardedReadinessUnder(actionOf(line), bindings, usability).kind;

  it("reads the guarded line under the specialization's at-maximum bindings", () => {
    const atMax = { ...BINDINGS, energyPct: knownNumber(100) };
    expect(at("y,if=energy.pct>=50", provenUsable(), atMax)).toBe("READY_AT_MAX");
    expect(at("y,if=energy.pct>=50", provenUsable())).toBe("NOT_READY_AT_MAX");
    expect(at(`y,if=${FALSE}`, provenUsable(), atMax)).toBe("NOT_READY_AT_MAX");
    expect(at("y", cooldownRunning, atMax)).toBe("NOT_READY_AT_MAX");
  });

  it("is UNKNOWN without proven usability, with an option to interpret, or with an unsupported condition", () => {
    expect(at(`y,if=${TRUE}`, unknownUsability())).toBe("UNKNOWN");
    expect(at(`y,max_energy=1,if=${TRUE}`, provenUsable())).toBe("UNKNOWN");
    expect(at("y,if=no_such_thing.foo.bar>1", provenUsable())).toBe("UNKNOWN");
  });
});
