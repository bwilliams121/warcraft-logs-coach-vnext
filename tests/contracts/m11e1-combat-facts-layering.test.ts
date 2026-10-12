/**
 * The observed-combat-facts domain stays factual, post-hoc, pure and unread
 * (M11-E1).
 *
 * WHAT IT WOULD TURN INTO IF NOBODY WATCHED
 *
 * A performance evaluator. Raw `amount` becomes "damage done", hitType 2
 * becomes "crit", an absent `tick` becomes "direct", two observations become
 * "the add was alive", a boss subtype becomes "the target" — and then the
 * authority branch reads a future outcome to settle a past decision. Each step
 * is one innocent identifier. So these checks are about vocabulary and about
 * who may import whom.
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

function importsOf(source: string): readonly string[] {
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^\n]*?from\s+["']([^"']+)["']/g)].map(
    (entry) => entry[1] ?? "",
  );
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
    ...[...code.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1] ?? ""),
  ];
}

const FACT_MODULES = allPaths().filter((path) => path.startsWith("src/combat-facts/"));

describe("the combat-facts domain exists and is fully covered by these checks", () => {
  it("captured every module under src/combat-facts", () => {
    expect(FACT_MODULES).toEqual([
      "src/combat-facts/activity.ts",
      "src/combat-facts/coverage.ts",
      "src/combat-facts/descriptors.ts",
      "src/combat-facts/observations.ts",
      "src/combat-facts/window-query.ts",
    ]);
  });
});

describe("it reads only normalized evidence", () => {
  it.each(FACT_MODULES)("%s imports only engine evidence, the capability vocabulary, and itself", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      const allowed =
        specifier.startsWith("./") ||
        specifier.startsWith("../engine/") ||
        specifier === "../wcl/evidence-capability.js";
      expect(allowed, `${path} imports ${specifier}`).toBe(true);
    }
  });

  it.each(FACT_MODULES)("%s calls no clock, randomness or network primitive", (path) => {
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

/**
 * A CURRENT-MILESTONE ISOLATION GUARD, NOT PERMANENT ARCHITECTURE.
 *
 * In M11-E1 nothing consumes this layer, so nothing may import it. That is
 * deliberate, but it is not a rule that the facts layer must never be read:
 * M11-G (causal damage disparity) and possibly M11-F (the reviewed enemy-set
 * model) are its intended consumers. A milestone that adds one amends this
 * guard explicitly — naming the consumer module, under its own review — rather
 * than loosening it in passing. What IS permanent is the direction below the
 * guard: the authority branch (`src/simc`, `src/specs`) must never read
 * post-hoc facts, so a future outcome can never settle a past decision.
 */
describe("nothing reads it but the reviewed M11-G2 consumer — least of all the authority branch", () => {
  /**
   * AMENDED AT M11-G2, explicitly: `src/comparison-facts/` (the post-hoc
   * comparison facts) is the reviewed consumer this guard anticipated. It is
   * itself post-hoc and unreachable from authority
   * (tests/contracts/m11g2-comparison-facts-layering.test.ts). Every other
   * module, the authority branch above all, still may not import this layer.
   */
  const CONSUMERS = "src/comparison-facts/";
  const OUTSIDE = allPaths().filter(
    (path) => !path.startsWith("src/combat-facts/") && !path.startsWith(CONSUMERS),
  );
  it("the reviewed consumer exists and is the only one", () => {
    expect(allPaths().filter((path) => path.startsWith(CONSUMERS)).length).toBeGreaterThan(0);
  });

  it("found modules to check", () => {
    expect(OUTSIDE.length).toBeGreaterThan(100);
  });

  it.each(OUTSIDE)("%s does not import the combat-facts domain", (path) => {
    // Post-hoc evidence must never settle a past decision's fight_remains,
    // time_to_die or target availability, and no public analyzer consumes it
    // in M11-E1. A future consumer is a reviewed change to this test.
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain("combat-facts");
    }
  });
});

describe("there is nowhere to write a judgement or an unproven meaning", () => {
  const FORBIDDEN_SEGMENTS = [
    // performance meaning (M1 is NOT YET PROVEN; and never a judgement)
    "effective",
    "dps",
    "hps",
    "throughput",
    "score",
    "rank",
    "ranking",
    "better",
    "worse",
    "good",
    "bad",
    "should",
    "expected",
    "waste",
    "wasted",
    "loss",
    "lost",
    // hit-type meanings (M2) and tick meaning (M3)
    "crit",
    "critical",
    "miss",
    "immune",
    "glancing",
    "direct",
    // cast EVENTS are not actions or GCDs (M11-E1.1); a reviewed later contract may derive those
    "action",
    "actions",
    "gcd",
    // enemy-set, presence and life semantics (M11-ED/F)
    "enemy",
    "enemies",
    "hostile",
    "targetable",
    "alive",
    "dead",
    "death",
    "presence",
    "present",
    "spawn",
    "despawn",
  ];

  /**
   * The ONE exception, with its reason. `DIRECT_PLAYER` is the owner-approved
   * source-scope name: events whose SOURCE is the player actor itself. It is
   * not a hit classification, and no other "direct" identifier is allowed.
   */
  const ALLOWED_IDENTIFIERS: ReadonlySet<string> = new Set(["DIRECT_PLAYER"]);

  it.each(FACT_MODULES)("%s declares no forbidden word", (path) => {
    for (const identifier of vocabularyOf(path)) {
      if (ALLOWED_IDENTIFIERS.has(identifier)) continue;
      for (const segment of segmentsOf(identifier)) {
        expect(FORBIDDEN_SEGMENTS, `${path}: ${identifier}`).not.toContain(segment);
      }
    }
  });
});
