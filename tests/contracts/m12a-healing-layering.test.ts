/**
 * The shared healing domain reconstructs facts and never judges (M12-A).
 *
 * WHAT IT WOULD TURN INTO IF NOBODY WATCHED
 *
 * A universal healer evaluator (CLAUDE.md "Role Module Boundary"): a
 * `spec === "restoration_shaman"` branch here, a "should have healed" there,
 * an HPS total because it is easy. `src/healing/` reconstructs WHEN damage
 * arrived and WHAT covered it; a specialization evaluator under
 * `src/specs/<class>/<spec>/` decides what that means. These checks are about
 * who may be imported and which words may be written.
 */

import { describe, expect, it } from "vitest";

const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

function allPaths(): readonly string[] {
  return Object.keys(SOURCES)
    .map((key) =>
      key
        .replace(/^\.\.\/\.\.\//, "")
        .split("\\")
        .join("/"),
    )
    .sort();
}

function sourceOf(path: string): string {
  const entry = SOURCES[`../../${path}`];
  if (entry === undefined) throw new Error(`no source captured for ${path}`);
  return entry;
}

/**
 * Every module specifier: `import … from` and `export … from` (multi-line
 * lists included), a bare side-effect `import "x"`, and a dynamic
 * `import("x")`.
 */
function importsOf(source: string): readonly string[] {
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/g,
    /(?:^|\n)\s*import\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((entry) => entry[1] ?? ""));
}

function codeOf(path: string): string {
  return sourceOf(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function segmentsOf(identifier: string): readonly string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/);
}

/** Identifiers and string literals the code declares or emits. */
function vocabularyOf(path: string): readonly string[] {
  const code = codeOf(path);
  return [
    ...[...code.matchAll(/\b([A-Za-z_]\w*)\b/g)].map((match) => match[1] ?? ""),
    ...[...code.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? ""),
  ];
}

const HEALING_MODULES = allPaths().filter((path) => path.startsWith("src/healing/"));

describe("the healing domain exists and is fully covered by these checks", () => {
  it("captured every module under src/healing", () => {
    expect(HEALING_MODULES).toEqual(["src/healing/death-timeline.ts"]);
  });
});

describe("it reads only the normalized fight", () => {
  it.each(HEALING_MODULES)("%s imports only the engine, the capability vocabulary, and itself", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      const allowed =
        specifier.startsWith("./") ||
        specifier.startsWith("../engine/") ||
        specifier === "../wcl/evidence-capability.js";
      expect(allowed, `${path} imports ${specifier}`).toBe(true);
    }
  });

  it.each(HEALING_MODULES)("%s calls no clock, randomness or network primitive", (path) => {
    const code = codeOf(path);
    for (const banned of [
      "Date.now",
      "new Date(",
      "Math.random",
      "crypto.",
      "performance.now",
      "fetch(",
      "process.",
    ]) {
      expect(code, `${path} uses ${banned}`).not.toContain(banned);
    }
  });
});

describe("there is nowhere to branch on a specialization or write a judgement", () => {
  const FORBIDDEN_SEGMENTS = [
    // specialization identity: interpretation belongs to src/specs/<class>/<spec>/
    "spec",
    "specialization",
    "class",
    "restoration",
    "holy",
    "discipline",
    "mistweaver",
    "preservation",
    "shaman",
    "druid",
    "priest",
    "paladin",
    "monk",
    "evoker",
    // judgement and unproven performance meaning (follow-up M1)
    "should",
    "expected",
    "correct",
    "incorrect",
    "mistake",
    "fail",
    "failed",
    "failure",
    "blame",
    "missed",
    "late",
    "early",
    "good",
    "bad",
    "better",
    "worse",
    "score",
    "rank",
    "hps",
    "dps",
    "effective",
    "throughput",
    "total",
    "sum",
    "waste",
    "wasted",
    "preventable",
    "avoidable",
    "cause",
    "caused",
    // life semantics the positive-only death facts never support (M11-F)
    "alive",
    "survived",
    "present",
  ];

  it.each(HEALING_MODULES)("%s declares no forbidden word", (path) => {
    for (const word of vocabularyOf(path)) {
      for (const segment of segmentsOf(word)) {
        expect(FORBIDDEN_SEGMENTS, `${path}: ${word}`).not.toContain(segment);
      }
    }
  });
});

/**
 * A CURRENT-MILESTONE ISOLATION GUARD, NOT PERMANENT ARCHITECTURE.
 *
 * In M12-A nothing in production consumes the healing domain. Its intended
 * consumers are healer specialization evaluators under `src/specs/` (which
 * own the verdicts) and, when it is published, the application service. The
 * milestone that adds one amends this guard explicitly, naming the consumer,
 * under its own review.
 */
describe("nothing in production reads it yet", () => {
  const OUTSIDE = allPaths().filter((path) => !path.startsWith("src/healing/"));

  it("found modules to check", () => {
    expect(OUTSIDE.length).toBeGreaterThan(100);
  });

  it.each(OUTSIDE)("%s does not import the healing domain", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toMatch(/(^|\/)healing\//);
    }
  });
});
