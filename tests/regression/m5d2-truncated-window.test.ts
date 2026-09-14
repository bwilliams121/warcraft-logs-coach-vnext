/**
 * A narrower fixture must make the analyzer say LESS — never make something up.
 *
 * THE FAILURE THIS PREVENTS
 *
 * Every cooldown and DoT claim in this project is anchored on an OBSERVED event.
 * If the anchor falls outside the retrieved window, the honest answer is "not
 * established". The dangerous answer is "not on cooldown" or "not ticking",
 * because absence of the anchor looks exactly like absence of the effect.
 *
 * That is a real, cheap mistake to make: it needs no bad code, only a fixture
 * that was cut a few seconds too late. The corpus fixture's start is justified
 * BY this test rather than by assertion — cut the window later and case 1 must
 * visibly degrade from an exact answer to UNKNOWN.
 *
 * This is also the D2 §76 rule, made mechanical.
 */

import { describe, expect, it } from "vitest";

import { M5D2_CORPUS, runCase, stepAt } from "../support/m5d2-corpus.js";
import { M5D2_ANCHORS, m5d2State, m5d2TruncatedState } from "../support/m5d2-fixture.js";

const CASE_1 = M5D2_CORPUS[0];
if (CASE_1 === undefined) throw new Error("corpus case 1 missing");

/** A cut AFTER the Garrote application anchor, and before the decision. */
const CUT_PAST_THE_ANCHOR = 2_168_000;

describe("the committed window start is the minimum, and is measured", () => {
  it("resolves case 1 exactly at the committed start", () => {
    const run = runCase(CASE_1, m5d2State());
    expect(run.classified.coverage).toBe("EXACT_ENTRY");
    expect(run.classified.entry).toStrictEqual({ listName: "core_dot", priorityOrdinal: 0 });
  });

  it("keeps the Garrote application anchor, which is what makes that possible", () => {
    const times = new Set(m5d2State().fight.events.map((e) => e.reportTimeMs));
    expect(times.has(M5D2_ANCHORS.garroteApplication)).toBe(true);
    expect(M5D2_ANCHORS.garroteApplication).toBeLessThan(CUT_PAST_THE_ANCHOR);
  });

  it("degrades to UNKNOWN once that anchor is cut away", () => {
    // Not merely different — WEAKER. The claim is withdrawn, not replaced.
    const run = runCase(CASE_1, m5d2TruncatedState(CUT_PAST_THE_ANCHOR));
    expect(run.classified.coverage).toBe("UNKNOWN");
    expect(run.classified.entry).toBeNull();
    expect(run.classified.actionToken).toBeNull();
  });

  it("never claims the Garrote DoT is absent just because its anchor was cut", () => {
    // THE CORE NEGATIVE. A missing anchor must not become "no DoT", which would
    // make core_dot[0] evaluable — and evaluable on invented evidence.
    const run = runCase(CASE_1, m5d2TruncatedState(CUT_PAST_THE_ANCHOR));
    const step = stepAt(run, "core_dot", 0);
    if (step === null) return; // the scan may not reach it; that is also not a claim
    expect(step.outcome).not.toBe("SELECTED");
    expect(step.outcome).not.toBe("ELIMINATED_CONTINUE");
    if (step.gate.kind === "EVALUATED") expect(step.gate.truth).toBe("UNKNOWN_STATE");
  });

  it("never claims a cooldown is ready just because its anchor was cut", () => {
    // Same shape, the other primitive. Cutting past Deathmark and Kingsbane
    // removes both anchors; neither entry may become selectable as a result.
    const cut = M5D2_ANCHORS.kingsbaneCast + 1;
    const run = runCase(CASE_1, m5d2TruncatedState(cut));
    for (const [list, ordinal] of [
      ["cds", 0],
      ["cds", 4],
    ] as const) {
      const step = stepAt(run, list, ordinal);
      if (step === null) continue;
      expect(`${list}[${String(ordinal)}]`).toBe(`${list}[${String(ordinal)}]`);
      expect(step.outcome).not.toBe("SELECTED");
    }
    expect(run.classified.coverage).toBe("UNKNOWN");
  });

  it("degrades monotonically: no cut ever produces a STRONGER claim", () => {
    // Sweeping rather than spot-checking, because the failure mode is a single
    // unlucky width where a missing anchor happens to unblock something.
    const strength: Record<string, number> = { UNKNOWN: 0, NO_ACTION: 1, TOKEN_CONVERGED: 2, EXACT_ENTRY: 3 };
    const baseline = strength[runCase(CASE_1, m5d2State()).classified.coverage] ?? 0;
    for (const cut of [2_165_000, 2_168_000, 2_170_000, 2_172_000, 2_174_000, 2_176_000]) {
      const run = runCase(CASE_1, m5d2TruncatedState(cut));
      expect(`cut ${String(cut)} strength`).toBe(`cut ${String(cut)} strength`);
      expect(strength[run.classified.coverage] ?? 0).toBeLessThanOrEqual(baseline);
    }
  });
});
