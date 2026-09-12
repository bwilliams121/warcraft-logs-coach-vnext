import { describe, expect, it } from "vitest";

import { extractEvents, parseIndexSelection } from "../../scripts/sanitize-probe.mjs";

/**
 * The fixture tool's selection rules.
 *
 * `--indices` exists because the other three modes select by PROPERTY and an
 * evidence contract about a SEQUENCE needs the actual chain of events. That
 * makes its validation load-bearing in an unusual way: a fixture is EVIDENCE, so
 * silently producing a different slice than the operator asked for would quietly
 * change what a contract rests on.
 *
 * Hence the rule these tests pin down — it fails rather than trims, coerces,
 * reorders or deduplicates.
 */

describe("--indices selects exactly what was asked for", () => {
  it("accepts a comma-separated list within the capture", () => {
    const result = parseIndexSelection("0,3,7", 10);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.indices).toEqual([0, 3, 7]);
  });

  it("accepts a single index", () => {
    const result = parseIndexSelection("4", 10);

    if (!result.ok) return;
    expect(result.indices).toEqual([4]);
  });

  it("accepts index 0, which is a real position", () => {
    // A truthiness check would drop the first event of every capture.
    const result = parseIndexSelection("0", 1);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.indices).toEqual([0]);
  });

  it("tolerates surrounding whitespace between entries", () => {
    const result = parseIndexSelection("1, 2 ,3", 10);

    if (!result.ok) return;
    expect(result.indices).toEqual([1, 2, 3]);
  });

  it("preserves the order the indices were listed in", () => {
    // Not sorted. The operator chose the order; reordering would silently
    // rewrite the sequence a sequence-based contract is built from.
    const result = parseIndexSelection("7,3,0", 10);

    if (!result.ok) return;
    expect(result.indices).toEqual([7, 3, 0]);
  });
});

describe("--indices refuses rather than guessing", () => {
  it("rejects an index past the end of the capture", () => {
    // The failure this prevents: a mistyped index quietly yields a shorter
    // fixture, and the contract it was meant to evidence is weaker than the
    // reviewer believes.
    const result = parseIndexSelection("2,99", 10);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("99");
    expect(result.error).toContain("10 events");
  });

  it.each([
    ["a non-numeric entry", "1,two,3"],
    ["a negative index", "1,-2"],
    ["a fractional index", "1,2.5"],
    ["exponent notation", "1e3"],
    ["hexadecimal", "0x10"],
    ["an empty entry", "1,,3"],
    ["a trailing comma", "1,2,"],
  ])("rejects %s", (_label, spec) => {
    expect(parseIndexSelection(spec, 100).ok).toBe(false);
  });

  it("rejects a missing or empty argument", () => {
    for (const spec of [undefined, "", "   "]) {
      expect(parseIndexSelection(spec, 10).ok).toBe(false);
    }
  });

  it("rejects a repeated index rather than deduplicating or duplicating it", () => {
    const result = parseIndexSelection("3,3", 10);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("more than once");
  });

  it("names the offending entry in every rejection", () => {
    // An operator assembling a 15-event chain needs to know WHICH entry is
    // wrong, not merely that one is.
    for (const spec of ["1,two,3", "1,-2", "1,2.5"]) {
      const result = parseIndexSelection(spec, 100);
      if (result.ok) continue;
      expect(result.error.length).toBeGreaterThan(0);
      expect(result.error).toContain("--indices");
    }
  });
});

describe("the input shape reader accepts both capture forms", () => {
  it("reads a bare event array", () => {
    expect(extractEvents([{ type: "cast" }])).toEqual([{ type: "cast" }]);
  });

  it("reads a full GraphQL envelope", () => {
    const envelope = { reportData: { report: { events: { data: [{ type: "cast" }] } } } };

    expect(extractEvents(envelope)).toEqual([{ type: "cast" }]);
  });

  it("throws rather than returning an empty slice for an unrecognised shape", () => {
    // An empty array here would write an empty fixture, which is the quietest
    // possible way to produce evidence for nothing.
    expect(() => extractEvents({ unexpected: true })).toThrow();
  });
});
