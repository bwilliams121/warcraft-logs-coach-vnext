/**
 * The comparison domain cannot become a second gameplay authority.
 *
 * WHY STATIC CHECKS RATHER THAN REVIEW
 *
 * The same reasoning as `m7d-aggregation-layering.test.ts`, applied to a
 * sharper risk. Nobody is going to write `outcome: "REJECTED"` in a comparison
 * module on purpose. What happens instead is that somebody needs one more fact
 * to explain a difference, imports the analysis result that already has it, and
 * six months later a top player's behaviour is being rendered in the column
 * where an authority verdict used to be.
 *
 * So the properties are enforced by what the modules CAN IMPORT and by what
 * their code CAN SAY:
 *
 *   NO AUTHORITY IN      a module that can reach `src/simc` or `src/specs` will
 *                        eventually be asked to say what the player should have
 *                        pressed
 *   NO COMPARISON OUT    a spec evaluator that can reach `src/comparison` can
 *                        let another player's log change an M5 outcome — this is
 *                        the edge that would actually cause the harm
 *   NO VERDICT WORDS     MATCH and REJECTED mean something specific in this
 *                        codebase, and a descriptive layer must not be able to
 *                        spell them
 *   NO SCORING           there must be nowhere to put a similarity percentage
 *   NO CLOCK             REST and MCP execute as separate requests; a
 *                        request-time clock makes identical evidence produce
 *                        unequal documents
 *   NO PARSE RANKING     M8-A proved WCL exposes rankPercent cheaply. The domain
 *                        must have no field capable of carrying it
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
    (entry) => entry[1] ?? "",
  );
}

/** Code with comments stripped, for assertions about the vocabulary of the MODEL. */
function codeOf(path: string): string {
  return sourceOf(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const COMPARISON_MODULES = allPaths().filter((path) => path.startsWith("src/comparison/"));

/**
 * The comparison DOMAIN directory, as a path segment.
 *
 * Deliberately not the bare word. `src/specs/rogue/assassination/observed-comparison.ts`
 * is an authority module whose name contains "comparison", and matching loosely
 * would either fire on it constantly or, worse, be loosened until it matched
 * nothing.
 */
const COMPARISON_DOMAIN_IMPORT = /(?:^|\/)comparison\//;

describe("the comparison domain exists and is fully covered by these checks", () => {
  it("captured every module under src/comparison", () => {
    // Guards against the whole file passing vacuously after a rename.
    expect(COMPARISON_MODULES).toEqual([
      "src/comparison/analysis-comparability.ts",
      "src/comparison/caveats.ts",
      "src/comparison/dimension.ts",
      "src/comparison/evidence-class.ts",
      "src/comparison/player-pull-comparison.ts",
      "src/comparison/pull-comparability.ts",
      "src/comparison/pull-identity.ts",
      "src/comparison/version-evidence.ts",
    ]);
  });
});

describe("the comparison-domain matcher is neither blind nor trigger-happy", () => {
  // The matcher below guards the single most important edge in this file, and it
  // is the one thing here that could be quietly loosened into uselessness — by
  // someone making it stop firing on `observed-comparison.js`, or by someone
  // narrowing it until it no longer fires on anything. Both directions are
  // pinned so that a change to the regex breaks a test rather than a guarantee.
  it.each(["../comparison/pull-identity.js", "../../comparison/caveats.js", "src/comparison/dimension.js"])(
    "matches the domain import %s",
    (specifier) => {
      expect(specifier).toMatch(COMPARISON_DOMAIN_IMPORT);
    },
  );

  it.each(["./observed-comparison.js", "../assassination/observed-comparison.js", "./comparison-helpers.js"])(
    "does not match the unrelated authority module %s",
    (specifier) => {
      // `src/specs/rogue/assassination/observed-comparison.ts` is an AUTHORITY
      // module whose filename contains the word. A looser matcher would fire on it
      // constantly and be relaxed until it protected nothing.
      expect(specifier).not.toMatch(COMPARISON_DOMAIN_IMPORT);
    },
  );

  it("the authority module whose name contains the word really exists", () => {
    // Guards the case above against becoming hypothetical after a rename.
    expect(allPaths()).toContain("src/specs/rogue/assassination/observed-comparison.ts");
  });
});

describe("authority machinery cannot reach the comparison domain", () => {
  // THE CRUCIAL DIRECTION. Everything else in this file limits what comparison
  // can know; this limits what the authority can be told. A spec evaluator that
  // could import this domain could let another player's log participate in
  // selecting an expected action, which is the exact failure M8 exists to
  // prevent.
  const AUTHORITY_MODULES = allPaths().filter(
    (path) => path.startsWith("src/specs/") || path.startsWith("src/simc/"),
  );

  it("found authority modules to check", () => {
    expect(AUTHORITY_MODULES.length).toBeGreaterThan(20);
  });

  it.each(AUTHORITY_MODULES)("%s does not import the comparison domain", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toMatch(COMPARISON_DOMAIN_IMPORT);
    }
  });

  it("the M7 aggregation domain does not import the comparison domain either", () => {
    // Comparison reads `src/aggregation/cell.js`. The reverse edge would be a
    // cycle, and would also let the raid-night aggregate acquire comparison
    // semantics it deliberately does not have.
    for (const path of allPaths().filter((candidate) => candidate.startsWith("src/aggregation/"))) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toMatch(COMPARISON_DOMAIN_IMPORT);
      }
    }
  });
});

describe("the comparison domain cannot reach authority, state or transport", () => {
  it.each(COMPARISON_MODULES)("%s imports no authority or combat-state module", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      for (const forbidden of [
        "/simc/",
        "/specs/",
        "/engine/",
        "/contracts/",
        "/api/",
        "/mcp/",
        "/runtime/",
        "/services/",
      ]) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain(forbidden);
      }
    }
  });

  it.each(COMPARISON_MODULES)("%s reaches no transport, credential or ingestion module", (path) => {
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
        "config/env",
      ]) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain(forbidden);
      }
    }
  });

  it.each(COMPARISON_MODULES)("%s reads the M7 cell vocabulary but never its projection", (path) => {
    // `cell.ts` is pure type vocabulary with no imports of its own.
    // `cell-projection.ts` is the ONE spec-aware module in the aggregation
    // domain — it imports `services/result.js` and therefore the Assassination
    // analysis type. Importing it here would drag authority-bearing decisions
    // into a domain that must never hold one.
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain("cell-projection");
    }
  });

  it.each(COMPARISON_MODULES)("%s names no combat-state or analysis type", (path) => {
    const code = codeOf(path);
    for (const banned of [
      "CombatState",
      "CombatFight",
      "CombatEvent",
      "FightAnalysis",
      "ObservedActionComparison",
      "RotationalGcdResult",
      "EncounterStateView",
      "createCombatState",
      "analyzeFight",
    ]) {
      expect(code, `${path} mentions ${banned}`).not.toContain(banned);
    }
  });
});

describe("the comparison domain cannot spell an authority verdict", () => {
  it.each(COMPARISON_MODULES)("%s contains no MATCH or REJECTED token", (path) => {
    // Comments are stripped first: `evidence-class.ts` legitimately explains what
    // MATCH and REJECTED mean, and banning the words from prose would make the
    // domain less documented without making it safer.
    const code = codeOf(path);
    expect(code, `${path} spells MATCH`).not.toContain("MATCH");
    expect(code, `${path} spells REJECTED`).not.toContain("REJECTED");
  });

  it.each(COMPARISON_MODULES)("%s uses no evaluative gameplay word", (path) => {
    const code = codeOf(path).toLowerCase();
    for (const drifted of [
      "correct",
      "optimal",
      "mistake",
      "successful",
      "shouldhave",
      "recommended",
      "improved",
      "regressed",
    ]) {
      expect(code, `${path} uses the word ${drifted}`).not.toContain(drifted);
    }
  });
});

describe("the domain has nowhere to record a judgement or a parse ranking", () => {
  const BANNED_FIELD_WORDS = [
    "score",
    "grade",
    "rank",
    "percent",
    "percentile",
    "accuracy",
    "rating",
    "severity",
    "priority",
    "weight",
    "similarity",
    "parse",
    "expected",
    "better",
    "worse",
    "optimal",
    "correct",
  ];

  it.each(BANNED_FIELD_WORDS)("no comparison module declares anything named like `%s`", (word) => {
    // Declarations only — a field or property name. Prose in a doc comment
    // legitimately names the things it forbids.
    const pattern = new RegExp(`\\b\\w*${word}\\w*\\s*[?]?\\s*:`, "i");
    for (const path of COMPARISON_MODULES) {
      const found = pattern.exec(codeOf(path));
      expect(found?.[0] ?? null, `${path} declares ${String(found?.[0])}`).toBeNull();
    }
  });

  it("computes no ratio or rounded number anywhere in the domain", () => {
    // There is no arithmetic that could produce a similarity percentage, because
    // there is no arithmetic. Import specifiers and string literals are removed
    // first: a module path contains slashes that are not division.
    for (const path of COMPARISON_MODULES) {
      const code = codeOf(path)
        .replace(/^\s*(?:import|export)[^\n]*?from\s+["'][^"']+["'];?/gm, "")
        .replace(/"[^"]*"/g, '""')
        .replace(/'[^']*'/g, "''")
        .replace(/`[^`]*`/g, "``");

      expect(code, `${path} divides`).not.toMatch(/[)\w\]]\s*\/\s*[(\w]/);
      expect(code, `${path} uses toFixed`).not.toContain("toFixed");
      expect(code, `${path} uses Math`).not.toContain("Math.");
    }
  });
});

describe("the comparison domain is deterministic", () => {
  it.each(COMPARISON_MODULES)("%s reads no clock and generates no identifier", (path) => {
    // The M8-B review correction. REST and MCP may execute as separate requests
    // over one evidence snapshot; anything request-time makes their documents
    // unequal and breaks the parity proof that has held since M6.
    const code = codeOf(path);
    for (const banned of [
      "Date.now",
      "new Date(",
      "Date(",
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

  it.each(COMPARISON_MODULES)("%s declares no wall-clock or retrieval-time field", (path) => {
    const pattern = /\b\w*(?:retrievedAt|timestamp|nowMs|wallClock|requestId|uuid)\w*\s*[?]?\s*:/i;
    const found = pattern.exec(codeOf(path));
    expect(found?.[0] ?? null, `${path} declares ${String(found?.[0])}`).toBeNull();
  });

  it.each(COMPARISON_MODULES)("%s sorts nothing by unspecified iteration order", (path) => {
    // Every ordered array in this domain is produced by FILTERING a canonical
    // declaration list, never by sorting an input. `.sort()` on a caller-supplied
    // array would reintroduce dependence on the order an untyped Warcraft Logs
    // payload happened to arrive in.
    expect(codeOf(path), `${path} sorts`).not.toContain(".sort(");
    expect(codeOf(path), `${path} iterates object keys`).not.toContain("Object.keys(");
  });
});

describe("the comparison domain carries no wire-contract concerns", () => {
  it("declares no public schema version, Zod schema or capability object", () => {
    const code = COMPARISON_MODULES.map(codeOf).join("\n");
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
