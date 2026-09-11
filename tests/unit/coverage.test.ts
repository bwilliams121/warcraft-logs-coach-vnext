import { describe, expect, it } from "vitest";

import {
  classifyCoverage,
  coveredRangesContain,
  deriveCoveredRanges,
  exclusiveRange,
  inclusiveRange,
  intersectRangeLists,
  rangeContains,
  rangesAreEqual,
  type PageCoverageFact,
  type TimeRangeMs,
} from "../../src/engine/evidence/coverage.js";

/**
 * The requested range for a Warcraft Logs events query is CLOSED at both ends.
 *
 * Verified by live probe: `startTime` returns the event at exactly that
 * timestamp, and `endTime` returns events at exactly that timestamp.
 */
const REQUESTED: TimeRangeMs = inclusiveRange(1000, 5000);

function page(overrides: Partial<PageCoverageFact> & { pageOrdinal: number }): PageCoverageFact {
  return {
    requestedStartTimeMs: REQUESTED.fromReportTimeMs,
    retrieved: true,
    nextPageTimestamp: null,
    ...overrides,
  };
}

describe("interval bound semantics", () => {
  it("always includes the lower bound", () => {
    expect(rangeContains(REQUESTED, 1000)).toBe(true);
    expect(rangeContains(REQUESTED, 999)).toBe(false);
  });

  it("includes the upper bound when the range says INCLUSIVE", () => {
    // This is the verified Warcraft Logs `endTime` behaviour. An event at
    // exactly the requested end is INSIDE the requested range.
    expect(rangeContains(inclusiveRange(1000, 5000), 5000)).toBe(true);
    expect(rangeContains(inclusiveRange(1000, 5000), 5001)).toBe(false);
  });

  it("excludes the upper bound when the range says EXCLUSIVE", () => {
    // This is the pagination-cursor behaviour: the cursor is the first
    // timestamp NOT returned by the page.
    expect(rangeContains(exclusiveRange(1000, 5000), 5000)).toBe(false);
    expect(rangeContains(exclusiveRange(1000, 5000), 4999)).toBe(true);
  });

  it("treats the two bound kinds as different ranges", () => {
    expect(rangesAreEqual(inclusiveRange(1000, 5000), exclusiveRange(1000, 5000))).toBe(false);
  });

  it("does not require timestamps to be integers", () => {
    // Warcraft Logs types timestamps as Float. "Millisecond precision" in the
    // schema prose describes what the number represents, not its type — which
    // is also why no epsilon or +1ms is used anywhere to model a bound.
    expect(rangeContains(REQUESTED, 1000.5)).toBe(true);
    const ranges = deriveCoveredRanges(
      [
        page({ pageOrdinal: 0, nextPageTimestamp: 2500.25 }),
        page({ pageOrdinal: 1, requestedStartTimeMs: 2500.25 }),
      ],
      REQUESTED,
    );
    expect(ranges).toEqual([REQUESTED]);
  });
});

describe("deriveCoveredRanges", () => {
  it("gives a terminal page the requested upper bound, inclusive", () => {
    const ranges = deriveCoveredRanges([page({ pageOrdinal: 0 })], REQUESTED);
    expect(ranges).toEqual([inclusiveRange(1000, 5000)]);
    expect(coveredRangesContain(ranges, 5000)).toBe(true);
  });

  it("gives a non-terminal page an exclusive cursor bound", () => {
    const ranges = deriveCoveredRanges(
      [
        page({ pageOrdinal: 0, nextPageTimestamp: 3000 }),
        page({ pageOrdinal: 1, requestedStartTimeMs: 3000, retrieved: false }),
      ],
      REQUESTED,
    );
    expect(ranges).toEqual([exclusiveRange(1000, 3000)]);
    // The cursor instant belongs to the NEXT page, which was never retrieved.
    expect(coveredRangesContain(ranges, 3000)).toBe(false);
    expect(coveredRangesContain(ranges, 2999)).toBe(true);
  });

  it("treats a page with zero events as covering its full range", () => {
    // A quiet interval is observed absence of events, not unobserved time.
    const ranges = deriveCoveredRanges([page({ pageOrdinal: 0 })], REQUESTED);
    expect(ranges).toEqual([REQUESTED]);
    expect(classifyCoverage(ranges, REQUESTED)).toBe("COMPLETE");
  });

  it("cannot depend on event contents, because it cannot see them", () => {
    // PageCoverageFact carries no events, no timestamps and no counts, so this
    // is true by construction rather than by discipline.
    const facts = [
      page({ pageOrdinal: 0, nextPageTimestamp: 3000 }),
      page({ pageOrdinal: 1, requestedStartTimeMs: 3000 }),
    ];
    expect(deriveCoveredRanges(facts, REQUESTED)).toEqual(deriveCoveredRanges([...facts], REQUESTED));
    expect(deriveCoveredRanges(facts, REQUESTED)).toEqual([REQUESTED]);
  });

  it("chains cursor pages into the inclusive terminal bound with no gap", () => {
    const ranges = deriveCoveredRanges(
      [
        page({ pageOrdinal: 0, nextPageTimestamp: 2000 }),
        page({ pageOrdinal: 1, requestedStartTimeMs: 2000, nextPageTimestamp: 3500 }),
        page({ pageOrdinal: 2, requestedStartTimeMs: 3500 }),
      ],
      REQUESTED,
    );
    expect(ranges).toEqual([inclusiveRange(1000, 5000)]);
    // Every boundary instant between pages is covered exactly once.
    for (const instant of [1000, 2000, 3500, 4999, 5000]) {
      expect(coveredRangesContain(ranges, instant)).toBe(true);
    }
  });

  it("stops at the first failed page and keeps what came before", () => {
    const ranges = deriveCoveredRanges(
      [
        page({ pageOrdinal: 0, nextPageTimestamp: 2000 }),
        page({ pageOrdinal: 1, requestedStartTimeMs: 2000, nextPageTimestamp: 3500 }),
        page({ pageOrdinal: 2, requestedStartTimeMs: 3500, retrieved: false }),
      ],
      REQUESTED,
    );
    // Bounded by the last cursor, NOT by where the last event happened to fall.
    expect(ranges).toEqual([exclusiveRange(1000, 3500)]);
    expect(classifyCoverage(ranges, REQUESTED)).toBe("PARTIAL");
  });

  it("covers nothing when the very first page failed", () => {
    const ranges = deriveCoveredRanges([page({ pageOrdinal: 0, retrieved: false })], REQUESTED);
    expect(ranges).toEqual([]);
    expect(classifyCoverage(ranges, REQUESTED)).toBe("ABSENT");
  });

  it("ignores pages after a failure even if a later one succeeded", () => {
    const ranges = deriveCoveredRanges(
      [
        page({ pageOrdinal: 0, nextPageTimestamp: 2000 }),
        page({ pageOrdinal: 1, requestedStartTimeMs: 2000, retrieved: false }),
        page({ pageOrdinal: 2, requestedStartTimeMs: 3000, nextPageTimestamp: 4000 }),
      ],
      REQUESTED,
    );
    expect(ranges).toEqual([exclusiveRange(1000, 2000)]);
  });

  it("proves no additional coverage from a stalled or decreasing cursor", () => {
    expect(
      deriveCoveredRanges(
        [page({ pageOrdinal: 0, requestedStartTimeMs: 2000, nextPageTimestamp: 2000 })],
        REQUESTED,
      ),
    ).toEqual([]);
    expect(
      deriveCoveredRanges(
        [page({ pageOrdinal: 0, requestedStartTimeMs: 3000, nextPageTimestamp: 2000 })],
        REQUESTED,
      ),
    ).toEqual([]);
  });

  it("clamps a cursor that overshoots the requested range, keeping the requested bound", () => {
    const ranges = deriveCoveredRanges([page({ pageOrdinal: 0, nextPageTimestamp: 99_999 })], REQUESTED);
    expect(ranges).toEqual([inclusiveRange(1000, 5000)]);
  });
});

describe("classifyCoverage", () => {
  it("distinguishes ABSENT from a complete range containing no events", () => {
    expect(classifyCoverage([], REQUESTED)).toBe("ABSENT");
    expect(classifyCoverage([REQUESTED], REQUESTED)).toBe("COMPLETE");
  });

  it("does not call an exclusive range COMPLETE against an inclusive request", () => {
    // Off by exactly the final instant. Under the old uniformly half-open model
    // this was indistinguishable from full coverage.
    expect(classifyCoverage([exclusiveRange(1000, 5000)], REQUESTED)).toBe("PARTIAL");
  });

  it("treats a proper subset as PARTIAL", () => {
    expect(classifyCoverage([exclusiveRange(1000, 3000)], REQUESTED)).toBe("PARTIAL");
  });
});

describe("intersectRangeLists", () => {
  it("keeps only what every contributing stream covers", () => {
    expect(intersectRangeLists([exclusiveRange(0, 100)], [exclusiveRange(50, 200)])).toEqual([
      exclusiveRange(50, 100),
    ]);
  });

  it("takes the tighter bound kind at an equal upper value", () => {
    expect(intersectRangeLists([inclusiveRange(0, 100)], [exclusiveRange(0, 100)])).toEqual([
      exclusiveRange(0, 100),
    ]);
  });

  it("yields nothing when streams do not overlap", () => {
    expect(intersectRangeLists([exclusiveRange(0, 10)], [exclusiveRange(20, 30)])).toEqual([]);
  });

  it("keeps a single shared instant when both bounds include it", () => {
    expect(intersectRangeLists([inclusiveRange(0, 10)], [inclusiveRange(10, 20)])).toEqual([
      inclusiveRange(10, 10),
    ]);
  });
});

describe("coveredRangesContain", () => {
  it("answers per-instant coverage questions for later analysis", () => {
    const ranges = [exclusiveRange(0, 100), inclusiveRange(200, 300)];
    expect(coveredRangesContain(ranges, 50)).toBe(true);
    expect(coveredRangesContain(ranges, 150)).toBe(false);
    expect(coveredRangesContain(ranges, 100)).toBe(false);
    expect(coveredRangesContain(ranges, 300)).toBe(true);
  });
});
