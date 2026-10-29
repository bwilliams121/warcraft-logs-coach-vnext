/**
 * M11-G4-6: the engine-output comparison used by the functional reproduction
 * bench. It must not let different engine JSON pass as identical.
 */

import { describe, expect, it } from "vitest";

import { differingPaths, engineView, primitiveLeafCount } from "../../support/simulation/engine-json.js";

describe("differingPaths", () => {
  it("identical structures do not differ", () => {
    const value = { a: [1, { b: "x", c: null }], d: {}, e: [] };
    expect(differingPaths(value, structuredClone(value))).toEqual([]);
  });

  it("an empty container is not the same as an absent key", () => {
    expect(differingPaths({ logs: [] }, {})).toEqual(["$.logs (missing on b)"]);
    expect(differingPaths({}, { o: {} })).toEqual(["$.o (missing on a)"]);
  });

  it("only own keys count: a key named like a prototype member is still missing", () => {
    expect(differingPaths({}, JSON.parse('{"toString":1}'))).toEqual(["$.toString (missing on a)"]);
  });

  it("an array is not an object with index keys", () => {
    expect(differingPaths([1], { "0": 1 })).toEqual(["$ (array vs object)"]);
  });

  it("array lengths must agree, even when the extra element is empty", () => {
    expect(differingPaths([1], [1, {}])).toEqual(["$.length (1 vs 2)"]);
  });

  it("null, objects and primitives are distinct kinds; primitives compare exactly", () => {
    expect(differingPaths({ a: null }, { a: {} })).toEqual(["$.a (null vs object)"]);
    expect(differingPaths({ a: 0 }, { a: "0" })).toEqual(["$.a"]);
    expect(differingPaths({ a: 0.1 + 0.2 }, { a: 0.3 })).toEqual(["$.a"]);
    expect(differingPaths({ a: [1, 2] }, { a: [1, 3] })).toEqual(["$.a[1]"]);
  });
});

describe("engineView", () => {
  const report = (overrides: Record<string, unknown>) =>
    JSON.stringify({
      timestamp: "t",
      build_date: "Oct 23 2026",
      build_time: "21:06:16",
      git_revision: "ec3422d640",
      sim: { statistics: { elapsed_time_seconds: 1 }, players: [{ dps: 1 }] },
      ...overrides,
    });

  it("removes only timestamp, build_date/build_time and sim.statistics", () => {
    const a = engineView(report({}));
    const b = engineView(
      report({
        timestamp: "u",
        build_date: "Oct 29 2026",
        build_time: "13:18:09",
        sim: { statistics: { elapsed_time_seconds: 9 }, players: [{ dps: 1 }] },
      }),
    );
    expect(differingPaths(a, b)).toEqual([]);
    expect(a).toEqual({ git_revision: "ec3422d640", sim: { players: [{ dps: 1 }] } });
  });

  it("an engine identity or result difference survives the view", () => {
    const a = engineView(report({}));
    expect(differingPaths(a, engineView(report({ git_revision: "0a72e6a746" })))).toEqual(["$.git_revision"]);
    expect(
      differingPaths(a, engineView(report({ sim: { statistics: {}, players: [{ dps: 1 }], logs: [] } }))),
    ).toEqual(["$.sim.logs (missing on a)"]);
  });
});

describe("primitiveLeafCount", () => {
  it("counts primitive leaves only", () => {
    expect(primitiveLeafCount({ a: [1, { b: null }], c: {}, d: [] })).toBe(2);
  });
});
