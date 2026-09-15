/**
 * The progression domain stays pure, cheap, and unable to score.
 *
 * WHAT COULD GO WRONG HERE, SPECIFICALLY
 *
 *   I/O          progression consumes data M7 and M8-C already retrieved. A
 *                module that can reach a GraphQL client will eventually be asked
 *                to fetch the one fight whose facts are missing, and the
 *                zero-WCL-cost property dies quietly.
 *   AUTHORITY    an import of `src/simc` or `src/specs` would let a progression
 *                sequence re-derive a gameplay verdict instead of carrying M7's.
 *   COMPARISON   `src/comparison/` must keep its M8-B purity. This domain is the
 *                adapter that feeds it; the dependency runs one way only.
 *   SCORING      "4 of 5 pulls" is a count. "80% of pulls" is a measure, and the
 *                moment one exists somebody ranks players by it.
 *   DIRECTION    a `phaseChange` or `bossPercentageDirection` field would assert
 *                an ordinal reading of values M8-C proved are not established.
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

const PROGRESSION_MODULES = allPaths().filter((path) => path.startsWith("src/progression/"));

describe("the progression domain exists and is fully covered by these checks", () => {
  it("captured every module under src/progression", () => {
    expect(PROGRESSION_MODULES).toEqual([
      "src/progression/adjacent-change.ts",
      "src/progression/encounter-progression.ts",
      "src/progression/pull-projection.ts",
    ]);
  });
});

describe("the progression domain performs no I/O", () => {
  it.each(PROGRESSION_MODULES)("%s reaches no transport, runtime or ingestion module", (path) => {
    // The zero-WCL-cost property, enforced by what can be imported rather than
    // by anybody remembering it.
    for (const specifier of importsOf(sourceOf(path))) {
      for (const forbidden of [
        "graphql-client",
        "token-provider",
        "paginator",
        "events-query",
        "fight-context-query",
        "ingest-fight",
        "preflight",
        "report-roster",
        "report-revision",
        "config/env",
        "/api/",
        "/mcp/",
        "/runtime/",
        "/services/",
      ]) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain(forbidden);
      }
    }
  });

  it.each(PROGRESSION_MODULES)("%s calls no clock, randomness or network primitive", (path) => {
    const code = codeOf(path);
    for (const banned of [
      "Date.now",
      "new Date(",
      "Math.random",
      "crypto.",
      "randomUUID",
      "performance.now",
      "fetch(",
      "process.",
    ]) {
      expect(code, `${path} uses ${banned}`).not.toContain(banned);
    }
  });

  it.each(PROGRESSION_MODULES)("%s constructs no combat state and runs no analyzer", (path) => {
    const code = codeOf(path);
    for (const banned of [
      "CombatState",
      "CombatFight",
      "CombatEvent",
      "NormalizedFightCore",
      "createCombatState",
      "analyzeFight",
      "analyzerForSpec",
      "focusedFightFor",
    ]) {
      expect(code, `${path} mentions ${banned}`).not.toContain(banned);
    }
  });
});

describe("the progression domain reaches no gameplay authority", () => {
  it.each(PROGRESSION_MODULES)("%s imports nothing from a specialization or SimulationCraft", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/specs/");
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/simc/");
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/engine/state/");
    }
  });

  it.each(PROGRESSION_MODULES)("%s spells no authority verdict", (path) => {
    const code = codeOf(path);
    expect(code, `${path} spells MATCH`).not.toContain("MATCH");
    expect(code, `${path} spells REJECTED`).not.toContain("REJECTED");
  });

  it("only reads the encounter-facts module from the engine", () => {
    // M8-C's fact types are legitimate input. Nothing else under `src/engine`
    // is, because everything else there is combat evidence.
    for (const path of PROGRESSION_MODULES) {
      for (const specifier of importsOf(sourceOf(path))) {
        if (!specifier.includes("/engine/")) continue;
        expect(specifier, `${path} imports ${specifier}`).toContain("encounter-facts");
      }
    }
  });
});

describe("the M8-B comparison boundary runs one way", () => {
  it("progression depends on comparison", () => {
    // Non-vacuity for the rule below, and the architectural point: the adapter
    // lives HERE so that `src/comparison/` never learns about an M7 aggregate.
    const specifiers = PROGRESSION_MODULES.flatMap((path) => importsOf(sourceOf(path)));
    expect(specifiers.some((specifier) => specifier.includes("/comparison/"))).toBe(true);
  });

  it("comparison does not depend on progression", () => {
    for (const path of allPaths().filter((candidate) => candidate.startsWith("src/comparison/"))) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/progression/");
      }
    }
  });

  it("the M8-B layering test is still present and unweakened", () => {
    // M8-D must not have bought its implementation by relaxing M8-B's rules.
    // That file is the enforcement; this asserts the specific clauses M8-D would
    // have been tempted to loosen are still written down.
    const layering = Object.entries(
      import.meta.glob("../contracts/m8b-comparison-layering.test.ts", {
        eager: true,
        query: "?raw",
        import: "default",
      }),
    )[0]?.[1] as string | undefined;

    expect(layering).toBeDefined();
    expect(layering).toContain("/simc/");
    expect(layering).toContain("/specs/");
    expect(layering).toContain("/engine/");
    expect(layering).toContain("/services/");
    expect(layering).toContain("does not import the comparison domain");
  });
});

describe("the progression domain has nowhere to record a judgement", () => {
  const BANNED_FIELD_WORDS = [
    "score",
    "grade",
    "rank",
    "accuracy",
    "rating",
    "severity",
    "priority",
    "ratio",
    "rate",
    "average",
    "mean",
    "improved",
    "regressed",
    "better",
    "worse",
    "optimal",
    "correct",
    "success",
  ];

  /**
   * An identifier split into lower-cased camelCase segments.
   *
   * SUBSTRING MATCHING IS NOT GOOD ENOUGH HERE, and the failure is instructive:
   * `fromDurationMs` contains the letters "ratio" (du-RATIO-n), so a substring
   * ban on "ratio" flags a legitimate millisecond field. The temptation at that
   * point is to drop "ratio" from the list, which would remove a real guard to
   * silence a false alarm.
   *
   * Segment-prefix matching keeps both: "duration" does not start with "ratio",
   * while `matchRatio`, `successRate` and `isSuccessful` all still match.
   */
  function segmentsOf(identifier: string): readonly string[] {
    return identifier
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/);
  }

  function declaredIdentifiers(path: string): readonly string[] {
    return [...codeOf(path).matchAll(/\b(\w+)\s*[?]?\s*:/g)].map((match) => match[1] ?? "");
  }

  it.each(BANNED_FIELD_WORDS)("no progression module declares anything named like `%s`", (word) => {
    for (const path of PROGRESSION_MODULES) {
      for (const identifier of declaredIdentifiers(path)) {
        const offending = segmentsOf(identifier).some((segment) => segment.startsWith(word));
        expect(offending, `${path} declares ${identifier}`).toBe(false);
      }
    }
  });

  it("the banned-word matcher is precise, not merely quiet", () => {
    // Proves the segment matcher still catches what it is for, and that the
    // false positive that motivated it stays a non-match.
    expect(segmentsOf("fromDurationMs")).toEqual(["from", "duration", "ms"]);
    expect(segmentsOf("matchRatio").some((segment) => segment.startsWith("ratio"))).toBe(true);
    expect(segmentsOf("successRate").some((segment) => segment.startsWith("rate"))).toBe(true);
    expect(segmentsOf("isSuccessful").some((segment) => segment.startsWith("success"))).toBe(true);
    expect(segmentsOf("fromDurationMs").some((segment) => segment.startsWith("ratio"))).toBe(false);
  });

  it("declares no percentage field other than M8-C's raw pass-throughs", () => {
    // `bossPercentageRaw` and `fightPercentageRaw` are M8-C values carried
    // across unchanged, and the `Raw` suffix is what says they are
    // uninterpreted. Any OTHER percentage-shaped name would be a derived
    // measure — which is the thing that must not exist.
    for (const path of PROGRESSION_MODULES) {
      for (const match of codeOf(path).matchAll(/\b(\w*percent\w*)\s*[?]?\s*:/gi)) {
        const identifier = match[1] ?? "";
        expect(identifier, `${path} declares ${identifier}`).toMatch(/PercentageRaw$/);
      }
    }
  });

  it("derives no direction for a phase or a percentage", () => {
    // M8-C established that `lastPhase` and `lastPhaseAsAbsoluteIndex` count on
    // different bases, and that both percentages read 0.04 on a KILL. No field
    // may assert an ordinal reading of either.
    for (const path of PROGRESSION_MODULES) {
      const code = codeOf(path);
      for (const banned of [
        "phaseChange",
        "phaseDirection",
        "phaseProgress",
        "percentageChange",
        "percentageDirection",
        "progressDirection",
        "bossPercentageDelta",
      ]) {
        expect(code, `${path} declares ${banned}`).not.toContain(banned);
      }
    }
  });

  it("computes no ratio", () => {
    // `durationDeltaMs` is a subtraction and is allowed. A division is not:
    // it is how a duration difference becomes a percentage change.
    for (const path of PROGRESSION_MODULES) {
      const code = codeOf(path)
        .replace(/^\s*(?:import|export)[^\n]*?from\s+["'][^"']+["'];?/gm, "")
        .replace(/"[^"]*"/g, '""')
        .replace(/'[^']*'/g, "''")
        .replace(/`[^`]*`/g, "``");

      expect(code, `${path} divides`).not.toMatch(/[)\w\]]\s*\/\s*[(\w]/);
      expect(code, `${path} uses toFixed`).not.toContain("toFixed");
    }
  });
});

describe("the progression domain carries no wire-contract concerns", () => {
  it("declares no public schema version, Zod schema or capability object", () => {
    // M8-G/H own the public representation. An internal type that already looked
    // like a wire format would freeze one before anybody chose it.
    const code = PROGRESSION_MODULES.map(codeOf).join("\n");
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

  it.each(PROGRESSION_MODULES)("%s imports no public contract", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/contracts/");
    }
  });
});
