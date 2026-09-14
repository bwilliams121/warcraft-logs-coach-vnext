/**
 * What this build's decision coverage actually IS, pinned as a number.
 *
 * M5-D1's coverage contract pins how much of the AUTHORITY is supported. This
 * one pins something different and more uncomfortable: how much of a REAL
 * player's fight the analyzer could actually resolve, and what stopped the rest.
 *
 * ONE DECISION IN SEVEN RESOLVES EXACTLY.
 *
 * That number is committed deliberately. A coverage figure that lives only in a
 * report is a figure nobody notices drifting; committed here, a change to it has
 * to be argued for in a diff. It may go UP when a real primitive lands. It must
 * never go up because a refusal was weakened, which is why the blocker census is
 * pinned alongside it rather than just the total.
 *
 * This is ANALYZER coverage, not report coverage. Turning it into the honest
 * disclosure a player reads is M5-E's job.
 */

import { describe, expect, it } from "vitest";

import {
  DECISION_BLOCKER_CLASSES,
  DECISION_COVERAGES,
  censusOf,
  classifyDecision,
  type DecisionCoverageResult,
} from "../../src/specs/rogue/assassination/decision-coverage.js";
import type { RotationalGcdResult, RotationalTraceNode } from "../../src/simc/first-gcd-selection.js";
import { M5D2_CORPUS, runCorpus } from "../support/m5d2-corpus.js";

const runs = runCorpus();
const census = censusOf(runs.map((r) => r.classified));

describe("the coverage vocabulary is closed", () => {
  it("has exactly four outcomes, and they are the four the engine can produce", () => {
    expect([...DECISION_COVERAGES]).toEqual(["EXACT_ENTRY", "TOKEN_CONVERGED", "NO_ACTION", "UNKNOWN"]);
  });

  it("has exactly seven blocker classes", () => {
    // Exhaustive on purpose: a new refusal reason must be classified explicitly
    // rather than falling into OTHER and disappearing from the disclosure.
    expect([...DECISION_BLOCKER_CLASSES]).toEqual([
      "OBSERVED_STATE_MISSING",
      "DIVERGENT_WORLDS",
      "TARGET_COUNT",
      "PREDICTIVE_STATE",
      "TARGETING_NOT_MODELLED",
      "USABILITY_NOT_PROVEN",
      "OTHER",
    ]);
  });
});

describe("the measured coverage of the real corpus", () => {
  it("splits seven decisions into one exact and six unknown", () => {
    expect(census.total).toBe(7);
    expect(census.byCoverage).toStrictEqual({
      EXACT_ENTRY: 1,
      TOKEN_CONVERGED: 0,
      NO_ACTION: 0,
      UNKNOWN: 6,
    });
  });

  it("attributes every unknown to a named blocker class", () => {
    const attributed = Object.values(census.byBlockerClass).reduce((a, b) => a + b, 0);
    expect(attributed).toBe(census.byCoverage.UNKNOWN);
    expect(census.byBlockerClass.OTHER).toBe(0);
  });

  it("pins the blocker census, so a weakened refusal shows up as a diff", () => {
    expect(census.byBlockerClass).toStrictEqual({
      OBSERVED_STATE_MISSING: 4,
      DIVERGENT_WORLDS: 2,
      TARGET_COUNT: 0,
      PREDICTIVE_STATE: 0,
      TARGETING_NOT_MODELLED: 0,
      USABILITY_NOT_PROVEN: 0,
      OTHER: 0,
    });
  });

  it("records that the only exact answer came from a verified observed decision", () => {
    // THE HEADLINE LIMIT OF M5, stated as an assertion rather than a comment.
    // Every case that resolved is one where the action was observed to fire.
    const exact = runs.filter((r) => r.classified.coverage === "EXACT_ENTRY");
    expect(exact).toHaveLength(1);
    for (const r of exact) expect(r.kase.purpose).toBe("AUTHORITY_VERIFICATION");
    // And the case that removes the observation, holding everything else fixed,
    // is the one that stops resolving.
    const boundary = runs.find((r) => r.kase.id === 2);
    expect(boundary?.kase.purpose).toBe("EPISTEMIC_BOUNDARY");
    expect(boundary?.classified.coverage).toBe("UNKNOWN");
  });

  it("keeps the two corpus purposes distinct and both represented", () => {
    const purposes = M5D2_CORPUS.map((c) => c.purpose);
    expect(purposes.filter((p) => p === "AUTHORITY_VERIFICATION")).toHaveLength(4);
    expect(purposes.filter((p) => p === "EPISTEMIC_BOUNDARY")).toHaveLength(3);
  });
});

const TRACE = { kind: "ROOT", entries: [] } as unknown as RotationalTraceNode;

describe("the classifier never claims more than the engine did", () => {
  it("gives a token-converged result no entry to quote", () => {
    // The whole reason TOKEN_CONVERGED is a separate member. A classifier that
    // filled in a "representative" entry would hand a consumer a provenance only
    // one world supports.
    const result: RotationalGcdResult = {
      kind: "ROTATIONAL_GCD_TOKEN_CONVERGED",
      actionToken: "envenom",
      candidateSteps: [],
      nonGcdPrefix: { kind: "NONE" } as never,
      trace: TRACE,
    };
    const classified: DecisionCoverageResult = classifyDecision(result);
    expect(classified.coverage).toBe("TOKEN_CONVERGED");
    expect(classified.actionToken).toBe("envenom");
    expect(classified.entry).toBeNull();
  });

  it("gives an unknown result no action token", () => {
    const result: RotationalGcdResult = {
      kind: "ROTATIONAL_GCD_UNKNOWN",
      blocker: "ONE_SCAN_BLOCKED",
      scanBlocker: "NO_DEFINITE_WINNER",
      blockedAt: null,
      detail: "",
      trace: TRACE,
    };
    const classified = classifyDecision(result);
    expect(classified.coverage).toBe("UNKNOWN");
    expect(classified.actionToken).toBeNull();
    expect(classified.entry).toBeNull();
    expect(classified.rawBlocker).toBe("ONE_SCAN_BLOCKED/NO_DEFINITE_WINNER");
  });

  it("classifies a permanently unbindable atom by the authority's own line", () => {
    // Reading the pinned line rather than a hard-coded entry list, so an APL
    // that stops using the atom stops producing the classification.
    const withLine = (actionStringVerbatim: string): DecisionCoverageResult =>
      classifyDecision({
        kind: "ROTATIONAL_GCD_UNKNOWN",
        blocker: "UNREAD_CONDITION_ON_GCD_ACTION",
        scanBlocker: null,
        blockedAt: {
          listName: "generate",
          priorityOrdinal: 3,
          actionToken: "fan_of_knives",
          actionStringVerbatim,
        } as never,
        detail: "",
        trace: TRACE,
      });

    expect(withLine("fan_of_knives,if=spell_targets.fan_of_knives>1").blockerClass).toBe("TARGET_COUNT");
    expect(withLine("kingsbane,if=fight_remains<20").blockerClass).toBe("PREDICTIVE_STATE");
    expect(withLine("garrote,if=target.time_to_die-remains>12").blockerClass).toBe("PREDICTIVE_STATE");
    expect(withLine("rupture,cycle_targets=1,if=combo_points>=5").blockerClass).toBe(
      "TARGETING_NOT_MODELLED",
    );
    expect(withLine("crimson_tempest,target_if=max:dot.rupture.remains").blockerClass).toBe(
      "TARGETING_NOT_MODELLED",
    );
  });

  it("does not guess a permanent reason for an ordinary evidence gap", () => {
    // A line with no unbindable atom must NOT be labelled permanent. Telling a
    // reader a closable gap is closed forever is the failure this guards.
    const classified = classifyDecision({
      kind: "ROTATIONAL_GCD_UNKNOWN",
      blocker: "ONE_SCAN_BLOCKED",
      scanBlocker: "NO_DEFINITE_WINNER",
      blockedAt: {
        listName: "default",
        priorityOrdinal: 1,
        actionToken: "kick",
        actionStringVerbatim: "kick",
      } as never,
      detail: "",
      trace: TRACE,
    });
    expect(classified.blockerClass).toBe("OBSERVED_STATE_MISSING");
    expect(classified.blockerClass).not.toBe("PREDICTIVE_STATE");
    expect(classified.blockerClass).not.toBe("TARGET_COUNT");
  });

  it("counts an empty corpus without inventing a denominator", () => {
    const empty = censusOf([]);
    expect(empty.total).toBe(0);
    expect(empty.byCoverage.EXACT_ENTRY).toBe(0);
    expect(empty.byCoverage.UNKNOWN).toBe(0);
  });
});
