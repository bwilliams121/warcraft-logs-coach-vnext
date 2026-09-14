/**
 * Roster discovery may not become a gameplay layer.
 *
 * WHY THIS IS A STATIC IMPORT CHECK
 *
 * "Roster discovery is factual, not analysis" is easy to assert about today's
 * code and impossible to keep true by review alone. The way it fails is not a
 * rewrite — it is one convenient import, added to solve one real problem, from a
 * roster file into a spec evaluator or the state engine. After that, "was this
 * player any good" has somewhere to live, and the layer that was supposed to
 * answer only "who was here" starts answering more.
 *
 * So the guarantee is enforced where it can be: the roster modules cannot REACH
 * gameplay at all. A file that cannot import an evaluator cannot quietly grow
 * one beside it.
 *
 * WHAT ELSE IS PINNED HERE
 *
 * That the roster snapshot has nowhere to record a verdict. The vocabulary of
 * analysis — MATCH, UNKNOWN, coverage, scores, trends — must not appear in these
 * types, because a field is the first thing a later milestone reaches for when
 * it wants somewhere convenient to put a number.
 */

import { describe, expect, it } from "vitest";

const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

/** The M7-C modules. Listed explicitly so a new roster file must be considered. */
const ROSTER_MODULES = [
  "src/wcl/report-roster.ts",
  "src/wcl/report-roster-query.ts",
  "src/wcl/report-roster-facts.ts",
  "src/wcl/roster-snapshot.ts",
  "src/wcl/report-revision.ts",
] as const;

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

describe("the roster layer exists", () => {
  it("captured every module it claims to check", () => {
    // Guards against the whole file passing vacuously after a rename.
    for (const path of ROSTER_MODULES) {
      expect(sourceOf(path).length).toBeGreaterThan(0);
    }
  });
});

describe("roster discovery cannot reach gameplay", () => {
  it.each(ROSTER_MODULES)("%s imports no evaluator, state engine or authority", (path) => {
    const forbidden = [
      "/specs/",
      "/simc/",
      "/engine/state/",
      "/engine/auras/",
      "/engine/resources/",
      "/findings/",
      "combat-state.js",
      "fight-core.js",
      "/contracts/",
      "/mcp/",
      "/api/",
    ];

    for (const specifier of importsOf(sourceOf(path))) {
      for (const fragment of forbidden) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain(fragment);
      }
    }
  });

  it("issues no event retrieval of its own", () => {
    for (const path of ["src/wcl/report-roster.ts", "src/wcl/report-roster-query.ts"]) {
      const source = sourceOf(path);
      for (const specifier of importsOf(source)) {
        // The paginator, the events query and the retrieval plan are ingestion's.
        // Roster discovery that could reach them would eventually be asked to.
        expect(specifier, `${path} imports ${specifier}`).not.toContain("paginator.js");
        expect(specifier, `${path} imports ${specifier}`).not.toContain("events-query.js");
        expect(specifier, `${path} imports ${specifier}`).not.toContain("retrieval-plan.js");
      }
    }
  });

  it("holds no Cloudflare or transport-framework types", () => {
    for (const path of ROSTER_MODULES) {
      const source = sourceOf(path);
      for (const banned of ["ExportedHandler", "ExecutionContext", "DurableObject", "McpServer"]) {
        expect(source, `${path} mentions ${banned}`).not.toContain(banned);
      }
    }
  });
});

describe("the snapshot has nowhere to record a verdict", () => {
  /** Comments legitimately name the vocabulary they forbid. Strip them first. */
  function codeOf(path: string): string {
    return sourceOf(path)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  const BANNED = [
    "MATCH",
    "REJECTED",
    "eligibleDecisions",
    "resolvedComparisons",
    "coverage",
    "recurrence",
    "trend",
    "score",
    "grade",
    "accuracy",
    "percentage",
    "improving",
    "regressing",
    "analysisStatus",
    "SPEC_NOT_SUPPORTED",
  ];

  it.each(BANNED)("roster-snapshot.ts contains no `%s`", (word) => {
    // A roster records who was present and what they played. Every word above
    // belongs to a layer that decides what that was worth, and none of them may
    // acquire a home here by accident.
    expect(codeOf("src/wcl/roster-snapshot.ts")).not.toContain(word);
  });

  it("does not resolve specializations into analyzer support", () => {
    // Whether an analyzer exists for a spec is the registry's question, asked
    // later. Roster discovery records the specialization Warcraft Logs reported,
    // including ones this build cannot analyze.
    for (const path of ROSTER_MODULES) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier).not.toContain("spec-identity.js");
        expect(specifier).not.toContain("analyzer-registry.js");
      }
    }
  });
});

describe("one definition of reading a report revision", () => {
  it("declares the revision query in exactly one module", () => {
    const declaring = Object.keys(SOURCES)
      .map((key) =>
        key
          .replace(/^\.\.\/\.\.\//, "")
          .split("\\")
          .join("/"),
      )
      .filter((path) => sourceOf(path).includes("query CoachReportRevision"));

    // Two subtly different definitions of "read the revision" would eventually
    // disagree about what an inaccessible report means, and a mixed-revision
    // dataset would slip between them.
    expect(declaring).toEqual(["src/wcl/report-revision.ts"]);
  });

  it("declares the roster query in exactly one module", () => {
    const declaring = Object.keys(SOURCES)
      .map((key) =>
        key
          .replace(/^\.\.\/\.\.\//, "")
          .split("\\")
          .join("/"),
      )
      .filter((path) => sourceOf(path).includes("query CoachReportRoster"));

    expect(declaring).toEqual(["src/wcl/report-roster-query.ts"]);
  });
});
