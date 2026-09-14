/**
 * The comparison matrix, exercised directly.
 *
 * Real fixtures prove the cases the committed evidence happens to contain.
 * Several outcomes this layer MUST get right do not occur there — a contradiction
 * between our own two proofs, an authority that selects nothing while a cast is
 * observed — and "we have never seen it" is not a reason to leave the behaviour
 * unpinned. Those are constructed here.
 *
 * Nothing in this file asserts that any player did anything well or badly.
 */

import { describe, expect, it } from "vitest";

import {
  COMPARISON_BASES,
  COMPARISON_OUTCOMES,
  compareObservedAction,
  type ObservedRotationalDecision,
} from "../../src/specs/rogue/assassination/observed-comparison.js";
import type { ObservedActionJudgment } from "../../src/findings/judgment.js";
import type { RotationalGcdResult, RotationalTraceNode } from "../../src/simc/first-gcd-selection.js";
import type { TraversalStep } from "../../src/simc/nested-selection.js";

const TRACE = { kind: "ROOT", entries: [] } as unknown as RotationalTraceNode;

const DECISION: ObservedRotationalDecision = {
  position: 42,
  locator: {
    streamId: "all",
    pageOrdinal: 0,
    indexInPage: 42,
    ingestionOrdinal: 42,
    rawType: "cast",
    reportTimeMs: 1_000,
  },
  actorId: 19,
  abilityGameId: 703,
  observedToken: "garrote",
  reportTimeMs: 1_000,
  fightTimeMs: 500,
  targetActorId: 21,
};

function step(listName: string, priorityOrdinal: number, actionToken: string, line: string): TraversalStep {
  return {
    listName,
    priorityOrdinal,
    actionToken,
    actionStringVerbatim: line,
  } as unknown as TraversalStep;
}

function selected(actionToken: string): RotationalGcdResult {
  return {
    kind: "ROTATIONAL_GCD_SELECTED",
    actionToken,
    selectingEntry: [],
    selectingStep: step("core_dot", 0, actionToken, `${actionToken},if=1`),
    nonGcdPrefix: { kind: "NONE" } as never,
    trace: TRACE,
  };
}

function converged(actionToken: string): RotationalGcdResult {
  return {
    kind: "ROTATIONAL_GCD_TOKEN_CONVERGED",
    actionToken,
    candidateSteps: [
      step("spend", 0, actionToken, `${actionToken},if=a`),
      step("spend", 1, actionToken, `${actionToken},if=b`),
    ],
    nonGcdPrefix: { kind: "NONE" } as never,
    trace: TRACE,
  };
}

const UNRESOLVED: RotationalGcdResult = {
  kind: "ROTATIONAL_GCD_UNKNOWN",
  blocker: "ONE_SCAN_BLOCKED",
  scanBlocker: "NO_DEFINITE_WINNER",
  blockedAt: step("default", 1, "kick", "kick"),
  detail: "",
  trace: TRACE,
};

const NOTHING_SELECTED: RotationalGcdResult = { kind: "NO_ROTATIONAL_GCD_SELECTED", trace: TRACE };

const M5A_REJECTION: ObservedActionJudgment = {
  kind: "OBSERVED_ACTION_JUDGMENT",
  status: "REJECTED_BY_AUTHORITY",
  authority: {} as never,
  trace: {} as never,
  observedState: {} as never,
  stateEvidence: [],
};

const M5A_UNKNOWN: ObservedActionJudgment = {
  kind: "OBSERVED_ACTION_JUDGMENT",
  status: "UNKNOWN",
  blocker: "ANALYZER_SURFACE_INCOMPLETE",
  authority: null,
  trace: null,
  observedState: null,
  stateEvidence: [],
  detail: "",
};

function compare(
  authorityResult: RotationalGcdResult,
  observedActionJudgment: ObservedActionJudgment | null = null,
): ReturnType<typeof compareObservedAction> {
  return compareObservedAction({
    decision: DECISION,
    authorityResult,
    observedActionJudgment,
    usabilityProvenance: "OBSERVED_EXECUTION",
  });
}

describe("the comparison vocabulary is closed and carries no grade", () => {
  it("has exactly three outcomes", () => {
    expect([...COMPARISON_OUTCOMES]).toEqual(["MATCH", "REJECTED", "UNKNOWN"]);
  });

  it("names no outcome or basis in correctness vocabulary", () => {
    // MATCH means the authority selection agreed with the observed token. It
    // does not mean correct, optimal, best, recommended or mistake-free, and no
    // member name may suggest otherwise.
    const banned = ["CORRECT", "OPTIMAL", "BEST", "MISTAKE", "SHOULD", "RECOMMEND", "IDEAL", "GOOD", "BAD"];
    for (const name of [...COMPARISON_OUTCOMES, ...COMPARISON_BASES]) {
      for (const word of banned) expect(`${name}:${word}`).toBe(`${name}:${name.includes(word) ? "" : word}`);
    }
  });
});

describe("MATCH", () => {
  it("is produced when an exact entry selects the observed token", () => {
    const result = compare(selected("garrote"));
    expect(result.outcome).toBe("MATCH");
    expect(result.basis).toBe("AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN");
    expect(result.authorityToken).toBe("garrote");
    expect(result.selectionPrecision).toBe("EXACT_ENTRY");
  });

  it("is produced by token convergence too, at WEAKER precision", () => {
    // The distinction is the point: both are MATCH, and only one of them lets a
    // consumer quote an authority entry.
    const result = compare(converged("garrote"));
    expect(result.outcome).toBe("MATCH");
    expect(result.selectionPrecision).toBe("TOKEN_CONVERGED");
    expect(result.authorityCoverage).toBe("TOKEN_CONVERGED");
  });

  it("keeps exact and token-converged distinguishable on the result itself", () => {
    expect(compare(selected("garrote")).selectionPrecision).not.toBe(
      compare(converged("garrote")).selectionPrecision,
    );
  });

  it("discloses that positive usability came from the observed execution", () => {
    // Never hidden. A MATCH usually rests on the very cast being compared.
    expect(compare(selected("garrote")).usabilityProvenance).toBe("OBSERVED_EXECUTION");
  });

  it("carries no blocker", () => {
    expect(compare(selected("garrote")).decisiveBlocker).toBeNull();
    expect(compare(selected("garrote")).rawBlocker).toBeNull();
  });
});

describe("REJECTED", () => {
  it("comes from the M5-A observed-action proof, with no replacement action", () => {
    const result = compare(UNRESOLVED, M5A_REJECTION);
    expect(result.outcome).toBe("REJECTED");
    expect(result.basis).toBe("OBSERVED_ACTION_REJECTED_BY_AUTHORITY");
    // No alternative is named, and the authority selection stayed unresolved.
    expect(result.authorityToken).toBeNull();
    expect(result.authorityCoverage).toBe("UNKNOWN");
  });

  it("also comes from the authority resolving a DIFFERENT token", () => {
    const result = compare(selected("rupture"));
    expect(result.outcome).toBe("REJECTED");
    expect(result.basis).toBe("AUTHORITY_SELECTED_DIFFERENT_TOKEN");
    expect(result.authorityToken).toBe("rupture");
  });

  it("does not treat an M5-A UNKNOWN as a rejection", () => {
    // M5-A has no positive verdict, so its UNKNOWN is not evidence either way.
    const result = compare(selected("garrote"), M5A_UNKNOWN);
    expect(result.outcome).toBe("MATCH");
    expect(result.observedActionRejected).toBe(false);
  });
});

describe("UNKNOWN", () => {
  it("is produced when the authority selection does not resolve", () => {
    const result = compare(UNRESOLVED);
    expect(result.outcome).toBe("UNKNOWN");
    expect(result.basis).toBe("AUTHORITY_SELECTION_UNRESOLVED");
    expect(result.decisiveBlocker).toBe("OBSERVED_STATE_MISSING");
    expect(result.rawBlocker).toBe("ONE_SCAN_BLOCKED/NO_DEFINITE_WINNER");
  });

  it("fails closed when the authority selects nothing but a GCD was observed", () => {
    // A model/evidence contradiction. Warcraft Logs is authoritative for what
    // happened, so the MODEL is what is in doubt — and the player's cast is
    // never labelled wrong on the strength of it.
    const result = compare(NOTHING_SELECTED);
    expect(result.outcome).toBe("UNKNOWN");
    expect(result.basis).toBe("AUTHORITY_SELECTED_NO_ACTION_DESPITE_OBSERVED_GCD");
    expect(result.outcome).not.toBe("REJECTED");
  });

  it("refuses to pick a side when the two layers contradict each other", () => {
    // M5-A proved this action unselectable; the global analysis selected it.
    // Both cannot hold. Reporting either would be choosing which of our own
    // proofs to trust, so the contradiction itself is the result.
    const result = compare(selected("garrote"), M5A_REJECTION);
    expect(result.outcome).toBe("UNKNOWN");
    expect(result.basis).toBe("INCONSISTENT_AUTHORITY_RESULTS");
    expect(result.outcome).not.toBe("MATCH");
    expect(result.outcome).not.toBe("REJECTED");
  });

  it("detects the contradiction at token-converged precision as well", () => {
    expect(compare(converged("garrote"), M5A_REJECTION).basis).toBe("INCONSISTENT_AUTHORITY_RESULTS");
  });

  it("is NOT a contradiction when the tokens differ", () => {
    // M5-A rejected Garrote and the authority selected Rupture. Those agree.
    const result = compare(selected("rupture"), M5A_REJECTION);
    expect(result.basis).toBe("OBSERVED_ACTION_REJECTED_BY_AUTHORITY");
    expect(result.outcome).toBe("REJECTED");
  });

  it("records the M5-A rejection flag on every comparison, including MATCH", () => {
    // The flag is what makes the contradiction detectable at all, so it is not
    // conditional on the outcome.
    expect(compare(selected("garrote")).observedActionRejected).toBe(false);
    expect(compare(UNRESOLVED, M5A_REJECTION).observedActionRejected).toBe(true);
  });
});
