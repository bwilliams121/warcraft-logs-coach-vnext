/**
 * NON_GCD gate irrelevance — the highest-risk primitive in M5-D1.
 *
 * WHAT IT CLAIMS, AND THE ONE WORD THAT MATTERS
 *
 * It claims the gate is UNREAD, not that the gate is TRUE. The entry becomes a
 * POSSIBLE candidate whose step still records its condition as `UNSUPPORTED`, so
 * there is no path by which an unevaluated expression becomes a confident
 * selection.
 *
 * WHY IT IS SOUND FOR A NON_GCD ENTRY AND NEVER FOR A GCD ONE
 *
 *     NON_GCD   gate FALSE -> it does not fire, the scan continues
 *               gate TRUE  -> it fires, executes, and a NEW scan begins at the
 *                             root with the same relevant state
 *               Both worlds are explored, and the answer survives only if they
 *               agree — which the first-GCD engine proves rather than assumes.
 *
 *     GCD       "it fires" IS the answer. The worlds do not converge, and
 *               reporting one would be a first-GCD selection resting on an
 *               expression nobody evaluated.
 *
 * That asymmetry is guarded twice: `GateIrrelevanceEvidence` types its lane as
 * the single literal `"NON_GCD"`, and the first-GCD engine refuses a
 * GCD-consuming candidate with an unread gate structurally.
 */

import { describe, expect, it } from "vitest";

import { selectAcrossLists, resolveOneForegroundScan } from "../../src/simc/nested-selection.js";
import {
  firstGcdSelectionAcrossRescans,
  type NonGcdTransitionOutcome,
} from "../../src/simc/first-gcd-selection.js";
import {
  gateIrrelevanceNotEstablished,
  gateIrrelevant,
  noGateIrrelevance,
  type GateIrrelevance,
  type GateIrrelevanceEvidence,
} from "../../src/simc/action-applicability.js";
import { knownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import type { ExecutionLane } from "../../src/data/game/ability-gcd-semantics.js";
import { syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

/** Real pinned syntax outside the supported subset. */
const UNSUPPORTED_COND = "active_dot.garrote>1";
const TRUE_COND = "combo_points>=5";

const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: knownNumber(0),
  energyPct: knownNumber(100),
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
};

const INERT_EVIDENCE: GateIrrelevanceEvidence = {
  lane: "NON_GCD",
  transitionProvenance: "test",
  timeAdvanceMs: 0,
  progressMechanism: "COOLDOWN:120000ms",
  writesReviewed: true,
  writesOutsideDecisionProjection: true,
  detail: "synthetic inert action for this test",
};

interface State {
  readonly disabled: readonly string[];
}

const stateKey = (state: State): string => [...state.disabled].sort().join(",");

function scanWith(
  lists: readonly SyntheticListSpec[],
  irrelevantTokens: readonly string[],
  usable: readonly string[],
) {
  return resolveOneForegroundScan({
    authority: syntheticAuthority({ lists: lists as SyntheticListSpec[] }),
    entryListName: "default",
    bindings: BINDINGS,
    usabilityFor: (action) =>
      usable.includes(action.actionToken) ? { kind: "PROVEN_USABLE" } : { kind: "UNKNOWN" },
    gateIrrelevanceFor: (action): GateIrrelevance =>
      irrelevantTokens.includes(action.actionToken)
        ? gateIrrelevant(INERT_EVIDENCE)
        : gateIrrelevanceNotEstablished(),
  });
}

/** Runs the full rescan query over a synthetic authority. */
function runEngine(options: {
  readonly lists: readonly SyntheticListSpec[];
  readonly gcdTokens: readonly string[];
  readonly usableTokens: readonly string[];
  readonly irrelevantTokens?: readonly string[];
  readonly transitions?: Record<string, (state: State) => NonGcdTransitionOutcome<State>>;
}) {
  const authority = syntheticAuthority({ lists: options.lists as SyntheticListSpec[] });
  return firstGcdSelectionAcrossRescans<State>({
    rootListName: "default",
    initialState: { disabled: [] },
    stateKey,
    scanFor: (state) =>
      resolveOneForegroundScan({
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
                detail: "hypothetical prefix execution",
              },
            };
          }
          return options.usableTokens.includes(action.actionToken)
            ? { kind: "PROVEN_USABLE" }
            : { kind: "UNKNOWN" };
        },
        gateIrrelevanceFor: (action): GateIrrelevance =>
          (options.irrelevantTokens ?? []).includes(action.actionToken)
            ? gateIrrelevant(INERT_EVIDENCE)
            : gateIrrelevanceNotEstablished(),
      }),
    laneFor: (step): ExecutionLane =>
      options.gcdTokens.includes(step.actionToken) ? "GCD_CONSUMING" : "NON_GCD",
    transitionFor: (action, state) => {
      const transition = options.transitions?.[action.actionToken];
      if (transition !== undefined) return transition(state);
      return {
        kind: "APPLIED",
        nextState: { disabled: [...state.disabled, action.actionToken] },
        timeAdvanceMs: 0,
        evidence: {
          kind: "SYNTHETIC",
          provenance: "test",
          stateKeyBefore: stateKey(state),
          stateKeyAfter: stateKey({ disabled: [...state.disabled, action.actionToken] }),
        },
      };
    },
  });
}

describe("the default is unchanged: an unreadable condition blocks", () => {
  it("blocks with no resolver at all", () => {
    const result = selectAcrossLists({
      authority: syntheticAuthority({
        lists: [{ listName: "default", actions: [`inert,if=${UNSUPPORTED_COND}`] }],
      }),
      entryListName: "default",
      bindings: BINDINGS,
      usabilityFor: () => ({ kind: "UNKNOWN" }),
    });
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
  });

  it("blocks with a resolver that establishes nothing", () => {
    const scan = scanWith([{ listName: "default", actions: [`inert,if=${UNSUPPORTED_COND}`] }], [], []);
    expect(scan.kind).toBe("BLOCKED");
    if (scan.kind !== "BLOCKED") return;
    expect(scan.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
    // The refusal is recorded on the step, so a reader sees it was considered.
    expect(scan.blockedAt?.gateIrrelevance?.kind).toBe("NOT_ESTABLISHED");
  });

  it("exposes a default resolver that never establishes anything", () => {
    const resolver = noGateIrrelevance();
    expect(
      resolver({
        listName: "default",
        priorityOrdinal: 0,
        actionStringVerbatim: "inert",
        comment: null,
        sourceLine: 1,
        actionToken: "inert",
        conditionRaw: null,
        callsListName: null,
        isUnmodelledDispatch: false,
        executesAndContinues: false,
        entryKind: "PLAYER_ACTION",
        actionOptionKeys: [],
        unsupportedOptions: [],
        targetIf: null,
      }).kind,
    ).toBe("NOT_ESTABLISHED");
  });
});

describe("a proven-irrelevant gate makes the entry a POSSIBLE candidate", () => {
  it("does not block, and the scan continues past it", () => {
    const scan = scanWith(
      [{ listName: "default", actions: [`inert,if=${UNSUPPORTED_COND}`, `gcd_x,if=${TRUE_COND}`] }],
      ["inert"],
      ["gcd_x"],
    );
    expect(scan.kind).toBe("RESOLVED");
    if (scan.kind !== "RESOLVED") return;
    // Both entries are candidates: the inert one MIGHT fire, and gcd_x definitely
    // does if it does not.
    expect(scan.resolution.kind).toBe("AMBIGUOUS");
  });

  it("keeps the condition recorded as UNSUPPORTED, never as TRUE", () => {
    // THE DISTINCTION THIS PRIMITIVE LIVES OR DIES ON.
    const scan = scanWith(
      [{ listName: "default", actions: [`inert,if=${UNSUPPORTED_COND}`] }],
      ["inert"],
      [],
    );
    if (scan.kind !== "RESOLVED") throw new Error("expected a resolution");
    const step = scan.steps[0];
    expect(step?.gate.kind).toBe("UNSUPPORTED");
    expect(step?.outcome).toBe("MAY_SELECT");
    // And the evidence that licensed it travels with the step.
    expect(step?.gateIrrelevance?.kind).toBe("GATE_IRRELEVANT");
    if (step?.gateIrrelevance?.kind !== "GATE_IRRELEVANT") return;
    expect(step.gateIrrelevance.evidence.lane).toBe("NON_GCD");
    expect(step.gateIrrelevance.evidence.timeAdvanceMs).toBe(0);
  });

  it("never makes the entry a DEFINITE winner", () => {
    // An unread condition cannot be proven true, so the candidate is always
    // possible. Even a PROVEN_USABLE action cannot become definite through it.
    const scan = scanWith(
      [{ listName: "default", actions: [`inert,if=${UNSUPPORTED_COND}`] }],
      ["inert"],
      ["inert"],
    );
    if (scan.kind !== "RESOLVED") throw new Error("expected a resolution");
    expect(scan.resolution.kind).toBe("MAY_SELECT");
    expect(scan.resolution.kind).not.toBe("DEFINITE");
  });
});

describe("the first-GCD engine explores BOTH worlds", () => {
  it("converges when both worlds reach the same GCD", () => {
    // Skip world: `gcd_x` fires. Execute world: the inert action fires, the
    // scan restarts, and `gcd_x` fires anyway. Same entry, so EXACT.
    const result = runEngine({
      lists: [{ listName: "default", actions: [`inert,if=${UNSUPPORTED_COND}`, `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
      irrelevantTokens: ["inert"],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.actionToken).toBe("gcd_x");
    // The inert action appears as a POSSIBLE prefix, which is what proves the
    // execute world was actually explored rather than skipped.
    expect(result.nonGcdPrefix.possibleActions.map((entry) => entry.actionToken)).toContain("inert");
  });

  it("refuses when the two worlds reach DIFFERENT GCDs", () => {
    const result = runEngine({
      lists: [
        {
          listName: "default",
          actions: [`inert,if=${UNSUPPORTED_COND}`, `gcd_x,if=${TRUE_COND}`, `gcd_y,if=${TRUE_COND}`],
        },
      ],
      gcdTokens: ["gcd_x", "gcd_y"],
      usableTokens: ["gcd_x", "gcd_y"],
      irrelevantTokens: ["inert"],
      transitions: {
        inert: (state) => ({
          kind: "APPLIED",
          nextState: { disabled: [...state.disabled, "inert", "gcd_x"] },
          timeAdvanceMs: 0,
          evidence: {
            kind: "SYNTHETIC",
            provenance: "test",
            stateKeyBefore: stateKey(state),
            stateKeyAfter: "shifted",
          },
        }),
      },
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("DIVERGENT_GCD_OUTCOMES");
  });

  it("refuses when the fired action has no transition contract", () => {
    const result = runEngine({
      lists: [{ listName: "default", actions: [`inert,if=${UNSUPPORTED_COND}`, `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
      irrelevantTokens: ["inert"],
      transitions: { inert: () => ({ kind: "UNSUPPORTED", detail: "no reviewed contract" }) },
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("TRANSITION_UNSUPPORTED");
  });

  it("refuses when the transition's effect on state is UNKNOWN", () => {
    const result = runEngine({
      lists: [{ listName: "default", actions: [`inert,if=${UNSUPPORTED_COND}`, `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
      irrelevantTokens: ["inert"],
      transitions: { inert: () => ({ kind: "UNKNOWN", detail: "writes not established" }) },
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("TRANSITION_UNKNOWN");
  });

  it("refuses a transition that advances simulated time", () => {
    const result = runEngine({
      lists: [{ listName: "default", actions: [`inert,if=${UNSUPPORTED_COND}`, `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
      irrelevantTokens: ["inert"],
      transitions: {
        inert: (state) => ({
          kind: "APPLIED",
          nextState: { disabled: [...state.disabled, "inert"] },
          timeAdvanceMs: 1,
          evidence: {
            kind: "SYNTHETIC",
            provenance: "test",
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

  it("refuses when the action can re-fire forever", () => {
    // A transition that returns an equivalent state makes no progress, and the
    // cycle guard catches it rather than a depth limit.
    const result = runEngine({
      lists: [{ listName: "default", actions: [`inert,if=${UNSUPPORTED_COND}`, `gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
      irrelevantTokens: ["inert"],
      transitions: {
        inert: (state) => ({
          kind: "APPLIED",
          nextState: state,
          timeAdvanceMs: 0,
          evidence: {
            kind: "SYNTHETIC",
            provenance: "test",
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
});

describe("a GCD-consuming action can NEVER be gate-irrelevant", () => {
  it("refuses structurally even when a resolver claims otherwise", () => {
    // THE HARD GUARD. The resolver here lies: it claims a GCD action is inert.
    // `GateIrrelevanceEvidence` cannot describe that at the type level, and the
    // engine refuses it at runtime as well, on the STEP's own recorded gate.
    const result = runEngine({
      lists: [{ listName: "default", actions: [`gcd_x,if=${UNSUPPORTED_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
      irrelevantTokens: ["gcd_x"],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(result.blocker).toBe("UNREAD_CONDITION_ON_GCD_ACTION");
    expect(result.blockedAt?.gate.kind).toBe("UNSUPPORTED");
  });

  it("never reports a GCD selection resting on an unread condition", () => {
    const result = runEngine({
      lists: [{ listName: "default", actions: [`gcd_x,if=${UNSUPPORTED_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
      irrelevantTokens: ["gcd_x"],
    });
    expect(result.kind).not.toBe("ROTATIONAL_GCD_SELECTED");
    expect(result.kind).not.toBe("ROTATIONAL_GCD_TOKEN_CONVERGED");
  });

  it("still selects a GCD action whose condition WAS read", () => {
    // The control. The guard keys on the gate, not on the lane alone, so an
    // ordinary evaluated condition is unaffected.
    const result = runEngine({
      lists: [{ listName: "default", actions: [`gcd_x,if=${TRUE_COND}`] }],
      gcdTokens: ["gcd_x"],
      usableTokens: ["gcd_x"],
      irrelevantTokens: ["gcd_x"],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
  });
});
