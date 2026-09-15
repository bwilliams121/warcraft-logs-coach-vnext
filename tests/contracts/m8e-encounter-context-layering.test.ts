/**
 * The encounter-context domain stays factual, pure, and unable to judge.
 *
 * WHAT THIS DOMAIN WOULD TURN INTO IF NOBODY WATCHED
 *
 * An encounter-script engine. The path is short and each step looks reasonable:
 * a nearby enemy cast becomes a "mechanic", a mechanic near a death becomes the
 * "cause", a cause becomes "avoidable", and the product is telling players they
 * stood in something — from a temporal coincidence and a hard-coded ability id.
 *
 * So the checks below are less about imports than usual and more about
 * VOCABULARY. There must be nowhere to write a cause, a relevance, a mechanic
 * name or a blame, and no encounter-specific ability table to write one from.
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

/** Lower-cased camelCase segments of an identifier. */
function segmentsOf(identifier: string): readonly string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/);
}

function declaredIdentifiers(path: string): readonly string[] {
  return [...codeOf(path).matchAll(/\b(\w+)\s*[?]?\s*:/g)].map((match) => match[1] ?? "");
}

const CONTEXT_MODULES = allPaths().filter((path) => path.startsWith("src/encounter-context/"));

describe("the encounter-context domain exists and is fully covered by these checks", () => {
  it("captured every module under src/encounter-context", () => {
    expect(CONTEXT_MODULES).toEqual([
      "src/encounter-context/encounter-events.ts",
      "src/encounter-context/phase-context.ts",
      "src/encounter-context/temporal-window.ts",
    ]);
  });
});

describe("the encounter-context domain performs no I/O", () => {
  it.each(CONTEXT_MODULES)("%s reaches no transport, runtime or ingestion module", (path) => {
    // Zero WCL calls, enforced by what can be imported.
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
        "/contracts/",
      ]) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain(forbidden);
      }
    }
  });

  it.each(CONTEXT_MODULES)("%s calls no clock, randomness or network primitive", (path) => {
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
});

describe("authority machinery and encounter context are mutually isolated", () => {
  const AUTHORITY_MODULES = allPaths().filter(
    (path) => path.startsWith("src/specs/") || path.startsWith("src/simc/"),
  );

  it("found authority modules to check", () => {
    expect(AUTHORITY_MODULES.length).toBeGreaterThan(20);
  });

  it.each(CONTEXT_MODULES)("%s imports nothing from a specialization or SimulationCraft", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/specs/");
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/simc/");
    }
  });

  it.each(AUTHORITY_MODULES)("%s does not import the encounter-context domain", (path) => {
    // The direction that would actually cause harm: a spec evaluator that could
    // read "a boss cast happened nearby" would eventually let it move a verdict.
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/encounter-context/");
    }
  });

  it.each(CONTEXT_MODULES)("%s names no analysis or authority type", (path) => {
    const code = codeOf(path);
    for (const banned of [
      "FightAnalysis",
      "ObservedActionComparison",
      "RotationalGcdResult",
      "analyzeFight",
      "analyzerForSpec",
    ]) {
      expect(code, `${path} mentions ${banned}`).not.toContain(banned);
    }
  });

  it.each(CONTEXT_MODULES)("%s spells no authority verdict", (path) => {
    const code = codeOf(path);
    expect(code, `${path} spells MATCH`).not.toContain("MATCH");
    expect(code, `${path} spells REJECTED`).not.toContain("REJECTED");
  });
});

describe("the comparison and progression domains stay clear of encounter context", () => {
  it("src/comparison does not import encounter context", () => {
    // M8-B remains pure and must not learn about engine event types.
    for (const path of allPaths().filter((candidate) => candidate.startsWith("src/comparison/"))) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/encounter-context/");
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/engine/");
      }
    }
  });

  it("encounter context does not import the comparison or progression domains", () => {
    for (const path of CONTEXT_MODULES) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/comparison/");
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/progression/");
      }
    }
  });
});

describe("the domain has nowhere to record a judgement", () => {
  const BANNED_FIELD_WORDS = [
    "mistake",
    "correct",
    "incorrect",
    "optimal",
    "suboptimal",
    "shouldhave",
    "recommended",
    "avoidable",
    "preventable",
    "blame",
    "fault",
    "cause",
    "causedby",
    "relevance",
    "score",
    "performance",
    "rank",
    "percentile",
    "parse",
    "better",
    "worse",
    "improved",
    "regressed",
    "severity",
    "priority",
    "weight",
  ];

  it.each(BANNED_FIELD_WORDS)("no encounter-context module declares anything named like `%s`", (word) => {
    // Segment-prefix matching, so `because` in a string literal is not mistaken
    // for a `cause` field and the guard does not have to be weakened to stay
    // quiet. Declarations only — prose legitimately names what it forbids.
    for (const path of CONTEXT_MODULES) {
      for (const identifier of declaredIdentifiers(path)) {
        const offending = segmentsOf(identifier).some((segment) => segment.startsWith(word));
        expect(offending, `${path} declares ${identifier}`).toBe(false);
      }
    }
  });

  it("the banned-word matcher is precise, not merely quiet", () => {
    expect(segmentsOf("causedByAbilityId").some((segment) => segment.startsWith("cause"))).toBe(true);
    expect(segmentsOf("relevanceScore").some((segment) => segment.startsWith("relevance"))).toBe(true);
    // The false positive this style exists to avoid.
    expect(segmentsOf("becauseNote").some((segment) => segment.startsWith("cause"))).toBe(false);
  });

  it("computes no ratio and rounds nothing", () => {
    for (const path of CONTEXT_MODULES) {
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

describe("no encounter-specific knowledge is hard-coded", () => {
  it("names no encounter and registers no ability table", () => {
    // M8 ships zero encounter adapters. A mechanic name or an ability-id table
    // here would be guide logic wearing a type.
    const code = CONTEXT_MODULES.map(codeOf).join("\n");
    for (const banned of ["Sszorak", "Nymrissa", "MECHANIC", "mechanicName", "ENCOUNTER_ADAPTERS"]) {
      expect(code, `the domain mentions ${banned}`).not.toContain(banned);
    }
  });

  it("declares no numeric ability-id literal table", () => {
    // A bare list of spell ids is how an encounter database starts.
    for (const path of CONTEXT_MODULES) {
      expect(codeOf(path), `${path} declares an id array`).not.toMatch(/\[\s*\d{4,}\s*,/);
    }
  });
});

describe("death context is absent, and absent in the right way", () => {
  it("declares no death family, field or absence claim", () => {
    // The normalized model has no evidence-backed death family and DEATHS stays
    // UNVERIFIED. A `deaths: []` field here would read as observed absence.
    for (const path of CONTEXT_MODULES) {
      for (const identifier of declaredIdentifiers(path)) {
        expect(
          segmentsOf(identifier).some((segment) => segment.startsWith("death")),
          `${path}`,
        ).toBe(false);
      }
    }
  });

  it("records why, so the gap is not mistaken for an oversight", () => {
    // The prose is the tracked follow-up. It must survive refactors.
    const doc = sourceOf("src/encounter-context/encounter-events.ts");
    expect(doc).toContain("DEATHS");
    expect(doc).toContain("UNVERIFIED");
    expect(doc).toContain("no evidence-backed death event family");
  });

  it("does not weaken the DEATHS capability to obtain a feature", () => {
    expect(codeOf("src/wcl/evidence-capability.ts")).toContain("DEATHS: unverified(");
  });
});

describe("the domain carries no wire-contract concerns", () => {
  it("declares no public schema version, Zod schema or capability object", () => {
    const code = CONTEXT_MODULES.map(codeOf).join("\n");
    for (const banned of [
      "schemaVersion",
      "warcraft-logs-coach.",
      'from "zod"',
      "z.object",
      "structuredContent",
    ]) {
      expect(code, `the domain declares ${banned}`).not.toContain(banned);
    }
  });
});
