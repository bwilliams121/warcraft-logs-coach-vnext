import { describe, expect, it } from "vitest";

import { exclusiveRange, inclusiveRange } from "../../src/engine/evidence/coverage.js";
import {
  boundedDerived,
  exactDerived,
  exactObserved,
  gateAbsenceClaim,
  hasSingleValue,
  isUnknown,
  staleObservation,
  unknownState,
  STATE_CERTAINTIES,
  UNKNOWN_REASONS,
  type StateResult,
} from "../../src/engine/state/state-result.js";
import {
  absentCategory,
  locatorFor,
  NOT_OBSERVABLE_CATEGORY,
  observableCategory,
  partialCategory,
  syntheticFight,
  UNVERIFIED_CATEGORY,
} from "../support/synthetic-fight.js";

const LOCATOR = locatorFor({ ordinal: 7, reportTimeMs: 2000 }, "cast");

describe("the four certainties stay distinct", () => {
  it("keeps every certainty in the vocabulary reachable and separate", () => {
    const results: readonly StateResult<number>[] = [
      exactObserved(50, [LOCATOR]),
      boundedDerived(41, 58, [LOCATOR]),
      staleObservation(50, 1500, 2000, [LOCATOR]),
      unknownState("NO_OBSERVATION"),
    ];

    expect(results.map((result) => result.certainty)).toEqual(["EXACT", "BOUNDED", "STALE", "UNKNOWN"]);
    expect(new Set(STATE_CERTAINTIES)).toEqual(new Set(results.map((result) => result.certainty)));
  });

  it("separates certainty from derivation origin", () => {
    const observed = exactObserved(50, [LOCATOR]);
    const derived = exactDerived(50, [LOCATOR]);

    // Both are EXACT. "We saw it" and "we calculated it" must stay tellable
    // apart, because a later finding may weigh them differently.
    expect(observed.certainty).toBe("EXACT");
    expect(derived.certainty).toBe("EXACT");

    // `derivation` is not readable until the UNKNOWN case is narrowed away,
    // which is the same guard that stops a caller reading a value off UNKNOWN.
    if (observed.certainty !== "EXACT" || derived.certainty !== "EXACT") return;
    expect(observed.derivation).toBe("OBSERVED");
    expect(derived.derivation).toBe("DERIVED_EXACT");
  });

  it("does not let a bounded result masquerade as a single value", () => {
    const bounded = boundedDerived(41, 58, [LOCATOR]);

    expect(bounded.certainty).toBe("BOUNDED");
    expect(hasSingleValue(bounded)).toBe(false);
    // No point estimate is offered. `[41, 58]` cannot decide `energy >= 50`,
    // and a helper handing back either bound would hide that.
    expect(bounded).not.toHaveProperty("value");
  });

  it("keeps a stale observation distinguishable from a current one", () => {
    const stale = staleObservation(50, 1500, 2000, [LOCATOR]);
    if (stale.certainty !== "STALE") return;

    expect(stale.value).toBe(50);
    expect(stale.observedAtReportTimeMs).toBe(1500);
    expect(stale.asOfReportTimeMs).toBe(2000);
    // The value is real; what is unproven is that it still held.
    expect(stale.certainty).not.toBe("EXACT");
  });
});

describe("UNKNOWN never collapses into a value", () => {
  it("carries no value, no bounds and no derivation", () => {
    const result = unknownState<number>("INSUFFICIENT_COVERAGE");

    expect(result).not.toHaveProperty("value");
    expect(result).not.toHaveProperty("lowerBound");
    expect(result).not.toHaveProperty("upperBound");
    // Nothing was derived, so there is no derivation to report either.
    expect(result).not.toHaveProperty("derivation");
  });

  it("offers no field a caller could read false, zero or empty out of", () => {
    const result = unknownState<number>("NO_OBSERVATION");
    if (result.certainty !== "UNKNOWN") return;

    // @ts-expect-error the UNKNOWN branch has no `value`, so a default cannot be read from it
    void result.value;

    expect(isUnknown(result)).toBe(true);
    expect(hasSingleValue(result)).toBe(false);
    expect(JSON.stringify(result)).not.toContain('"value"');
  });

  it("always states a reason", () => {
    for (const reason of UNKNOWN_REASONS) {
      const result = unknownState<string>(reason);
      if (result.certainty !== "UNKNOWN") continue;
      expect(result.reason).toBe(reason);
    }
  });
});

describe("provenance references M3 facts rather than copying them", () => {
  it("retains the exact locator that justified the result", () => {
    const result = exactObserved(50, [LOCATOR], "CASTS");

    expect(result.provenance.locators).toEqual([LOCATOR]);
    expect(result.provenance.locators[0]?.ingestionOrdinal).toBe(7);
    expect(result.provenance.category).toBe("CASTS");
  });

  it("supports several locators when a result rests on several observations", () => {
    const second = locatorFor({ ordinal: 9, reportTimeMs: 2100 }, "resourcechange");
    const result = exactDerived(50, [LOCATOR, second]);

    expect(result.provenance.locators.map((locator) => locator.ingestionOrdinal)).toEqual([7, 9]);
  });

  it("records provenance on UNKNOWN too, so the dead end is traceable", () => {
    const result = unknownState<number>("INSUFFICIENT_COVERAGE", [LOCATOR], "RESOURCES");

    expect(result.provenance.locators).toEqual([LOCATOR]);
    expect(result.provenance.category).toBe("RESOURCES");
  });
});

describe("absence gating: capability", () => {
  const RANGE = inclusiveRange(1000, 5000);

  it("refuses an absence claim while capability is UNVERIFIED", () => {
    const fight = syntheticFight({ categories: { TARGETABILITY: UNVERIFIED_CATEGORY } });
    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: "TARGETABILITY",
      range: RANGE,
      actorId: 5,
    });

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    // Not knowing whether Warcraft Logs can supply a category is not evidence
    // that nothing happened.
    expect(gate.reason).toBe("CAPABILITY_UNVERIFIED");
  });

  it("keeps NOT_OBSERVABLE distinguishable from UNVERIFIED by reason", () => {
    const unverified = syntheticFight({ categories: { DEATHS: UNVERIFIED_CATEGORY } });
    const notObservable = syntheticFight({ categories: { DEATHS: NOT_OBSERVABLE_CATEGORY } });

    const first = gateAbsenceClaim({
      completeness: unverified.completeness,
      category: "DEATHS",
      range: RANGE,
      actorId: 5,
    });
    const second = gateAbsenceClaim({
      completeness: notObservable.completeness,
      category: "DEATHS",
      range: RANGE,
      actorId: 5,
    });

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    if (first.ok || second.ok) return;
    // One is ignorance, the other is knowledge. Both block the claim, and they
    // are never reported as the same thing.
    expect(first.reason).toBe("CAPABILITY_UNVERIFIED");
    expect(second.reason).toBe("CAPABILITY_NOT_OBSERVABLE");
    expect(first.reason).not.toBe(second.reason);
  });

  it("permits the claim when capability is OBSERVABLE and coverage is complete", () => {
    const fight = syntheticFight({ observedCategories: ["CASTS"] });
    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: RANGE,
      actorId: 5,
    });

    expect(gate.ok).toBe(true);
  });
});

describe("absence gating: coverage", () => {
  it("refuses an absence claim across a partially covered interval", () => {
    const fight = syntheticFight({
      categories: { CASTS: partialCategory([exclusiveRange(1000, 3000)]) },
    });
    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: inclusiveRange(1000, 5000),
      actorId: 5,
    });

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    // The uncovered 3000-5000 stretch is unobserved time, not quiet time.
    expect(gate.reason).toBe("INSUFFICIENT_COVERAGE");
  });

  it("permits a claim confined to the interval that WAS covered", () => {
    const fight = syntheticFight({
      categories: { CASTS: partialCategory([inclusiveRange(1000, 3000)]) },
    });
    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: inclusiveRange(1000, 2500),
      actorId: 5,
    });

    // PARTIAL coverage is not useless — it is authoritative where it reaches.
    expect(gate.ok).toBe(true);
  });

  it("refuses a claim when coverage is ABSENT", () => {
    const fight = syntheticFight({ categories: { CASTS: absentCategory() } });
    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: inclusiveRange(1000, 5000),
      actorId: 5,
    });

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.reason).toBe("INSUFFICIENT_COVERAGE");
  });

  it("honours the inclusive upper bound rather than rounding it", () => {
    const fight = syntheticFight({
      categories: { CASTS: observableCategory(inclusiveRange(1000, 5000)) },
    });

    const atBound = gateAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: inclusiveRange(1000, 5000),
      actorId: 5,
    });
    const pastBound = gateAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: inclusiveRange(1000, 5000.5),
      actorId: 5,
    });

    expect(atBound.ok).toBe(true);
    expect(pastBound.ok).toBe(false);
  });
});

describe("absence gating: actor scope", () => {
  it("refuses an absence claim about an actor the evidence does not vouch for", () => {
    // CASTS is observed and completely covered, so scope is the ONLY thing that
    // can block the claim — which is what makes the reason below meaningful.
    const fight = syntheticFight({ observedCategories: ["CASTS"], actorScope: [5] });
    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: inclusiveRange(1000, 5000),
      actorId: 11,
    });

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    // Under PLAYER_CONTEXT the ally's events may physically be in the stream.
    // Scope is a declaration about what we vouch for, not about what happens to
    // be lying around.
    expect(gate.reason).toBe("INSUFFICIENT_SCOPE");
  });

  it("permits a claim about an actor inside the scope", () => {
    const fight = syntheticFight({ observedCategories: ["CASTS"], actorScope: [5] });
    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: inclusiveRange(1000, 5000),
      actorId: 5,
    });

    expect(gate.ok).toBe(true);
  });

  it("treats a null scope as vouching for every actor", () => {
    const fight = syntheticFight({ observedCategories: ["CASTS"], actorScope: null });
    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: inclusiveRange(1000, 5000),
      actorId: 11,
    });

    expect(gate.ok).toBe(true);
  });

  it("reports scope before coverage, since scope is the more specific failure", () => {
    const fight = syntheticFight({
      categories: { CASTS: partialCategory([exclusiveRange(1000, 2000)], [5]) },
    });
    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: inclusiveRange(1000, 5000),
      actorId: 11,
    });

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.reason).toBe("INSUFFICIENT_SCOPE");
  });

  it("still checks coverage for a claim that is not actor-specific", () => {
    const fight = syntheticFight({
      categories: { CASTS: partialCategory([exclusiveRange(1000, 2000)], [5]) },
    });
    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: inclusiveRange(1000, 5000),
      actorId: null,
    });

    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.reason).toBe("INSUFFICIENT_COVERAGE");
  });
});
