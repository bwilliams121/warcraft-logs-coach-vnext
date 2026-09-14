/**
 * The cell projection against REAL analyzer output.
 *
 * WHY THIS EXISTS ALONGSIDE THE SYNTHETIC UNIT TESTS
 *
 * The unit tests build exactly the comparison shapes they assert on, which makes
 * them precise and also makes them agree with themselves. This one runs the real
 * Assassination analyzer over the 1083-event M5-D2 corpus and projects whatever
 * it actually produces — so the projection is proven against the analyzer's own
 * output rather than against a fixture author's idea of it.
 *
 * It is also the honest size check. The corpus cell is what a raid night would
 * hold a hundred of, and the reason Option C was chosen over aggregating the
 * public contract is that this object is small enough to keep.
 */

import { describe, expect, it } from "vitest";

import { analyzeObservedAssassinationDecisions } from "../../src/specs/rogue/assassination/observed-analysis.js";
import { toPlayerFightCell } from "../../src/aggregation/cell-projection.js";
import type { FightAnalysis } from "../../src/services/result.js";
import { M5D2_ACTOR, m5d2Fight, m5d2State } from "../support/m5d2-fixture.js";

const analysis = analyzeObservedAssassinationDecisions({
  state: m5d2State(),
  actorId: M5D2_ACTOR,
  specId: "rogue/assassination",
  targetActorId: null,
});

const fixture = m5d2Fight();

const fightAnalysis: FightAnalysis = {
  identity: {
    report: {
      code: fixture.report.code,
      revision: fixture.report.revision,
      startTime: fixture.report.startTimeUnixMs,
      endTime: fixture.report.endTimeUnixMs,
    },
    data: fixture.data,
    fight: {
      id: fixture.fight.id,
      name: fixture.fight.name,
      encounterId: fixture.fight.encounterId,
      difficulty: fixture.fight.difficulty,
      startTime: fixture.fight.startTimeMs,
      endTime: fixture.fight.endTimeMs,
    },
    player: {
      sourceId: M5D2_ACTOR,
      name: "Fixtureplayer",
      className: "Rogue",
      specName: "Assassination",
    },
  },
  specId: "rogue/assassination",
  analyzerId: "rogue-assassination-observed-decisions",
  scope: "PLAYER_CONTEXT",
  analysis,
};

const projection = toPlayerFightCell({
  analysis: fightAnalysis,
  // Supplied by the caller that held the normalized fight, because
  // `FightAnalysis` does not carry it. See `cell-projection.ts`.
  normalizationRevision: fixture.provenance.normalizationRevision,
});

describe("a real analysis projects into a cell", () => {
  it("analyzed the corpus, so the projection is not vacuous", () => {
    expect(analysis.status).toBe("ANALYZED");
    if (analysis.status !== "ANALYZED") return;
    // The real census: 11 eligible, 1 MATCH, 10 UNKNOWN, 120 excluded casts.
    expect(analysis.coverage.eligibleDecisions).toBe(11);
    expect(analysis.coverage.excludedCastCount).toBe(120);
  });

  it("accepts the real counts, which reconcile", () => {
    expect(projection.ok).toBe(true);
  });

  it("preserves every integer exactly as the analyzer reported it", () => {
    if (!projection.ok || projection.cell.kind !== "ANALYZED") throw new Error("expected ANALYZED");
    if (analysis.status !== "ANALYZED") return;

    const { counts } = projection.cell;
    expect(counts.eligibleDecisions).toBe(analysis.coverage.eligibleDecisions);
    expect(counts.match).toBe(analysis.coverage.match);
    expect(counts.rejected).toBe(analysis.coverage.rejected);
    expect(counts.unknown).toBe(analysis.coverage.unknown);
    expect(counts.resolvedComparisons).toBe(analysis.coverage.resolvedComparisons);
    expect(counts.excludedCastCount).toBe(analysis.coverage.excludedCastCount);
  });

  it("routes the real UNKNOWNs to evidence limitations and leaves rejections empty", () => {
    if (!projection.ok || projection.cell.kind !== "ANALYZED") throw new Error("expected ANALYZED");

    const { recurrence } = projection.cell;
    // This corpus contains no decision the authority can positively prove
    // unselectable, so there is nothing to say about the player — and the ten
    // unresolved decisions are reported as what they are: the analyzer's limits.
    expect(recurrence.rejectedPatterns).toEqual([]);
    const unresolved = recurrence.evidenceLimitations.reduce((total, entry) => total + entry.count, 0);
    expect(unresolved).toBe(10);

    const excludedOccurrences = recurrence.exclusionPatterns.reduce((total, entry) => total + entry.count, 0);
    expect(excludedOccurrences).toBe(120);
  });

  it("strips the real evidence arrays and internals", () => {
    if (!projection.ok) throw new Error("expected a cell");
    const serialized = JSON.stringify(projection.cell);

    for (const key of ["comparisons", "excluded", "rawBlocker", "observedActionRejected", "locator"]) {
      expect(serialized, `cell leaked key ${key}`).not.toContain(`"${key}":`);
    }
  });

  it("collapses a real fight's analysis into a small object", () => {
    if (!projection.ok) throw new Error("expected a cell");
    // 131 decisions and excluded casts, with every locator and blocker, reduced
    // to counts and a handful of short keys. This is the memory reason the
    // narrow projection was chosen over aggregating the public contract.
    const cellBytes = JSON.stringify(projection.cell).length;
    const analysisBytes = JSON.stringify(analysis).length;

    expect(cellBytes).toBeLessThan(4000);
    expect(cellBytes * 10).toBeLessThan(analysisBytes);
  });
});
