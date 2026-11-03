/**
 * The aggregation domain stays pure, spec-neutral, and unable to score.
 *
 * WHY STATIC CHECKS RATHER THAN REVIEW
 *
 * Each of the three properties below fails the same way: not as a rewrite, but
 * as one convenient import or one convenient field, added to solve one real
 * problem. After that the wrong thing has somewhere to live.
 *
 *   PURITY        an aggregator that can reach a GraphQL client will eventually
 *                 be asked to fetch the one fact it is missing
 *   SPEC-NEUTRAL  an aggregator that can read a spec's result type acquires a
 *                 branch per specialization the moment a second one exists
 *   NO SCORING    a `score` field is the first thing a reporting layer reaches
 *                 for, and once it exists nobody remembers it was forbidden
 *
 * So each is enforced where it can be: by what the modules can import, and by
 * what their exported types can express.
 */

import { describe, expect, it } from "vitest";

const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

/** Repo-relative, forward-slashed paths. */
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

/** Import specifiers only. Prose in a doc comment may legitimately name a module. */
function importsOf(source: string): readonly string[] {
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^\n]*?from\s+["']([^"']+)["']/g)].map(
    (match) => match[1] ?? "",
  );
}

/** Code with comments stripped, for assertions about the vocabulary of the MODEL. */
function codeOf(path: string): string {
  return sourceOf(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const AGGREGATION_MODULES = allPaths().filter((path) => path.startsWith("src/aggregation/"));

/** Everything except the one deliberately spec-aware boundary. */
const SPEC_NEUTRAL_MODULES = AGGREGATION_MODULES.filter(
  (path) => path !== "src/aggregation/cell-projection.ts",
);

describe("the aggregation domain exists and is fully covered by these checks", () => {
  it("captured every module under src/aggregation", () => {
    // Guards against the whole file passing vacuously after a rename.
    expect(AGGREGATION_MODULES).toEqual([
      "src/aggregation/cell-projection.ts",
      "src/aggregation/cell.ts",
      // M15-F: the night's coverage disclosure, a pure function of the aggregate.
      "src/aggregation/raid-night-disclosure.ts",
      "src/aggregation/raid-night.ts",
      "src/aggregation/roster-aggregator.ts",
    ]);
  });
});

describe("the aggregation domain performs no I/O", () => {
  it.each(AGGREGATION_MODULES)("%s reaches no transport, runtime or storage", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      for (const forbidden of [
        "graphql-client",
        "token-provider",
        "paginator",
        "report-roster-query",
        "report-roster.js",
        "events-query",
        "ingest-fight",
        "preflight",
        "config/env",
        "/api/",
        "/mcp/",
        "/runtime/",
      ]) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain(forbidden);
      }
    }
  });

  it.each(AGGREGATION_MODULES)("%s calls no clock, randomness or network primitive", (path) => {
    const code = codeOf(path);
    for (const banned of ["Date.now", "new Date(", "Math.random", "fetch(", "crypto.", "performance.now"]) {
      expect(code, `${path} uses ${banned}`).not.toContain(banned);
    }
  });

  it.each(AGGREGATION_MODULES)("%s constructs no combat state", (path) => {
    const code = codeOf(path);
    for (const banned of ["createCombatState", "CombatState", "CombatFight", "CombatEvent"]) {
      expect(code, `${path} mentions ${banned}`).not.toContain(banned);
    }
  });

  it.each(AGGREGATION_MODULES)("%s runs no service, analyzer or spec resolution", (path) => {
    const code = codeOf(path);
    for (const banned of [
      "analyzeFight",
      "resolveSpecIdentity",
      "analyzerForSpec",
      "projectAnalysisResult",
      "analyze(",
    ]) {
      expect(code, `${path} calls ${banned}`).not.toContain(banned);
    }
  });
});

describe("the aggregator is spec-neutral", () => {
  it.each(SPEC_NEUTRAL_MODULES)("%s imports nothing from a specialization or SimulationCraft", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/specs/");
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/simc/");
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/engine/state/");
    }
  });

  it("roster-aggregator.ts names no specialization anywhere in its code", () => {
    const code = codeOf("src/aggregation/roster-aggregator.ts");
    for (const banned of ["rogue", "Rogue", "assassination", "Assassination", "paladin", "Paladin"]) {
      expect(code, `the aggregator mentions ${banned}`).not.toContain(banned);
    }
  });

  it("cell-projection.ts is the ONE module allowed to read a spec result type", () => {
    // `SpecAnalysis` is currently an alias for Assassination's own type. This is
    // the single, deliberately isolated extension point: when M10 adds
    // Protection Paladin, this file changes and nothing else in the domain does.
    const specifiers = importsOf(sourceOf("src/aggregation/cell-projection.ts"));
    expect(specifiers).toContain("../services/result.js");

    const others = SPEC_NEUTRAL_MODULES.flatMap((path) => importsOf(sourceOf(path)));
    expect(others).not.toContain("../services/result.js");
  });

  it("keeps the public M6 contract out of the domain entirely", () => {
    for (const path of AGGREGATION_MODULES) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/contracts/");
      }
    }
  });
});

describe("the domain has nowhere to record a judgement", () => {
  const BANNED_FIELD_WORDS = [
    "score",
    "grade",
    "rank",
    "percent",
    "accuracy",
    "rating",
    "severity",
    "priority",
    "isRecurring",
    "improving",
    "regressing",
    "correctCount",
    "goodDecisions",
    "successfulActions",
  ];

  it.each(BANNED_FIELD_WORDS)("no aggregation module declares anything named like `%s`", (word) => {
    const pattern = new RegExp(`\\b\\w*${word}\\w*\\s*[?]?\\s*:`, "i");
    for (const path of AGGREGATION_MODULES) {
      // Declarations only — a field or property name. Prose in a doc comment
      // legitimately names the things it forbids, and banning words in comments
      // would make this test brittle without making the domain safer.
      const match = pattern.exec(codeOf(path));
      expect(match?.[0] ?? null, `${path} declares ${String(match?.[0])}`).toBeNull();
    }
  });

  it("computes no ratio anywhere in the domain", () => {
    // Integers only. `match / eligibleDecisions` is not a measure of play, and
    // the arithmetic that would produce one does not appear.
    //
    // Import specifiers and string literals are removed first: a module path
    // contains slashes that are not division, and matching them would make this
    // test noisy without making the domain safer.
    for (const path of AGGREGATION_MODULES) {
      const code = codeOf(path)
        .replace(/^\s*(?:import|export)[^\n]*?from\s+["'][^"']+["'];?/gm, "")
        .replace(/"[^"]*"/g, '""')
        .replace(/'[^']*'/g, "''")
        .replace(/`[^`]*`/g, "``");

      expect(code, `${path} divides`).not.toMatch(/[)\w\]]\s*\/\s*[(\w]/);
      expect(code, `${path} uses toFixed`).not.toContain("toFixed");
    }
  });

  it("keeps the authority-compatible meaning of MATCH intact", () => {
    // `match` is named `match`, never `correct`. MATCH means the supported
    // analysis resolved the same action that was observed — not that it was
    // right.
    const code = AGGREGATION_MODULES.map(codeOf).join("\n");
    for (const drifted of ["correct", "optimal", "mistake", "successful"]) {
      expect(code.toLowerCase(), `the domain uses the word ${drifted}`).not.toContain(drifted);
    }
  });
});

describe("the domain carries no wire-contract concerns", () => {
  it("declares no public schema version, Zod schema or capability object", () => {
    // M7-E owns the public contract. An internal type that already looked like a
    // wire format would freeze one before anybody chose it.
    const code = AGGREGATION_MODULES.map(codeOf).join("\n");
    for (const banned of [
      "schemaVersion",
      "warcraft-logs-coach.",
      'from "zod"',
      "z.object",
      "CAPABILITY",
      "structuredContent",
    ]) {
      expect(code, `the domain declares ${banned}`).not.toContain(banned);
    }
  });
});
