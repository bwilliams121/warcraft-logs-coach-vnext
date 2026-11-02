/**
 * The shared support domain reconstructs facts and never judges (M13-A).
 *
 * WHAT IT WOULD TURN INTO IF NOBODY WATCHED
 *
 * A universal support evaluator (CLAUDE.md "Role Module Boundary"): an
 * `if spec === "augmentation"` branch here, a "wrong Prescience target"
 * there, a recipient ranking because a parse looked better. `src/support/`
 * reconstructs WHEN a supporter's buff was on WHOM and what is observable
 * about that recipient; the Augmentation evaluator under
 * `src/specs/evoker/augmentation/` decides what that means, and for
 * recipient quality no authority exists. These checks are about who may be
 * imported and which words may be written. Same shape as the M12-A healing
 * guard (tests/contracts/m12a-healing-layering.test.ts).
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

/** Every module specifier: static, re-export, bare side-effect and dynamic imports. */
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

function vocabularyOf(path: string): readonly string[] {
  const code = codeOf(path);
  return [
    ...[...code.matchAll(/\b([A-Za-z_]\w*)\b/g)].map((match) => match[1] ?? ""),
    ...[...code.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? ""),
  ];
}

const SUPPORT_MODULES = allPaths().filter((path) => path.startsWith("src/support/"));

describe("the support domain exists and is fully covered by these checks", () => {
  it("captured every module under src/support", () => {
    expect(SUPPORT_MODULES).toEqual([
      "src/support/recipient-facts.ts",
      "src/support/support-aura-windows.ts",
    ]);
  });
});

describe("it reads only the normalized fight", () => {
  it.each(SUPPORT_MODULES)("%s imports only the engine, the capability vocabulary, and itself", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      const allowed =
        specifier.startsWith("./") ||
        specifier.startsWith("../engine/") ||
        specifier === "../wcl/evidence-capability.js";
      expect(allowed, `${path} imports ${specifier}`).toBe(true);
    }
  });

  it.each(SUPPORT_MODULES)(
    "%s knows no spell: no specialization runtime data, no ability id literal",
    (path) => {
      const code = codeOf(path);
      expect(code, `${path} reads game data`).not.toMatch(/data\/game\//);
      // A five-or-more-digit number in code would be a spell id; ids come from the caller.
      expect(code.match(/\b\d{5,}\b/g) ?? [], path).toEqual([]);
    },
  );

  it.each(SUPPORT_MODULES)("%s calls no clock, randomness or network primitive", (path) => {
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

  it.each(SUPPORT_MODULES)(
    "%s never compares an actor's class: it copies it as identity, verbatim",
    (path) => {
      expect(codeOf(path), path).not.toMatch(/subType\s*[!=]==|[!=]==\s*\w*\.subType/);
    },
  );
});

describe("there is nowhere to branch on a specialization or write a judgement", () => {
  const FORBIDDEN_SEGMENTS = [
    // specialization identity: interpretation belongs to src/specs/<class>/<spec>/
    "spec",
    "specialization",
    "augmentation",
    "evoker",
    "ebon",
    "might",
    "prescience",
    "breath",
    "eons",
    // recipient-quality and timing judgement: no authority exists (NO_AUTHORITY_AVAILABLE)
    "should",
    "expected",
    "correct",
    "incorrect",
    "wrong",
    "optimal",
    "best",
    "quality",
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
    "parse",
    "dps",
    "hps",
    "total",
    "sum",
    "waste",
    "wasted",
    "cause",
    "caused",
    // nominal durations are never substituted for an unobserved bound
    "nominal",
    "expiry",
    "expires",
    "pandemic",
    // life semantics the positive-only death facts never support (M11-F)
    "alive",
    "survived",
    "present",
  ];

  it.each(SUPPORT_MODULES)("%s declares no forbidden word", (path) => {
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
 * In M13-A the only consumer is the Augmentation evaluator, which owns what
 * these facts mean. It is unregistered, so nothing in the analysis service,
 * the contracts, the API or MCP reaches the support domain. A milestone that
 * adds a consumer amends this list, naming it, under its own review.
 */
const SUPPORT_CONSUMERS = ["src/specs/evoker/augmentation/evaluator.ts"];

describe("only the named consumers read it", () => {
  const OUTSIDE = allPaths().filter(
    (path) => !path.startsWith("src/support/") && !SUPPORT_CONSUMERS.includes(path),
  );

  it("every named consumer exists and is a specialization evaluator", () => {
    for (const path of SUPPORT_CONSUMERS) {
      expect(allPaths(), path).toContain(path);
      expect(path.startsWith("src/specs/"), path).toBe(true);
    }
  });

  it("found modules to check", () => {
    expect(OUTSIDE.length).toBeGreaterThan(100);
  });

  it.each(OUTSIDE)("%s does not import the support domain", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toMatch(/(^|\/)support\//);
    }
  });

  it("the Augmentation runtime data is read only by its own specialization", () => {
    const DATA_MODULE = "src/data/game/evoker-augmentation-support-abilities.ts";
    const readers = allPaths().filter(
      (path) =>
        path !== DATA_MODULE &&
        importsOf(sourceOf(path)).some((specifier) =>
          specifier.includes("evoker-augmentation-support-abilities"),
        ),
    );
    expect(readers).toEqual(["src/specs/evoker/augmentation/evaluator.ts"]);
  });
});
