/**
 * M10-A: cross-specialization isolation, swept mechanically.
 *
 * A second specialization tree does not exist yet. These guards are written
 * against the shape it will take, so that the first Paladin module cannot
 * import a Rogue module, borrow Rogue-named game data, or reach Assassination's
 * pinned authority — and so that shared code keeps reaching specializations
 * only through the one registration boundary.
 *
 * The performance-metadata guard at the bottom reconciles an M9-C closeout
 * claim: the M8-F layering test already forbids `src/specs` and `src/simc` from
 * IMPORTING the ranking and external-context modules, but no test forbade a
 * gameplay, authority or corpus-executor module from READING selection-context
 * fields by name. This adds that token-level guard, scoped to the paths that
 * must never see them, without banning every use of the word "bracket".
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

function filesUnder(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: false })
    .map((entry) => `${root}/${String(entry).replace(/\\/g, "/")}`)
    .filter((path) => statSync(path).isFile() && (path.endsWith(".ts") || path.endsWith(".json")))
    .sort();
}

function sourceOf(path: string): string {
  return readFileSync(path, "utf8");
}

/** Source with comments stripped: the prohibitions are on CODE. */
function codeOf(path: string): string {
  return sourceOf(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function importSpecifiersOf(path: string): readonly string[] {
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g;
  const code = codeOf(path);
  for (const match of code.matchAll(pattern)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

/** Resolves a relative specifier to a repo-relative path (extension kept as written). */
function resolveSpecifier(from: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier;
  const fromDirectory = from.slice(0, from.lastIndexOf("/"));
  const segments = [...fromDirectory.split("/"), ...specifier.split("/")];
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }
  return resolved.join("/");
}

function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

const SPEC_FILES = filesUnder("src/specs").filter((path) => path.endsWith(".ts"));
const ALL_SRC = filesUnder("src").filter((path) => path.endsWith(".ts"));

/** `src/specs/<class>/<spec>` for a path under the spec tree, or null. */
function specTreeOf(path: string): string | null {
  const match = /^src\/specs\/([^/]+)\/([^/]+)\//.exec(path);
  return match === null ? null : `src/specs/${match[1] ?? ""}/${match[2] ?? ""}`;
}

function classOf(path: string): string | null {
  const match = /^src\/specs\/([^/]+)\//.exec(path);
  return match?.[1] ?? null;
}

/** Class slugs a game-data or authority module may be named for. */
const CLASS_PREFIXES = [
  "rogue",
  "paladin",
  "warrior",
  "priest",
  "mage",
  "warlock",
  "hunter",
  "shaman",
  "druid",
  "monk",
  "demon-hunter",
  "death-knight",
  "evoker",
] as const;

function classPrefixOfModule(resolved: string): string | null {
  const base = basenameOf(resolved);
  for (const prefix of CLASS_PREFIXES) {
    if (base.startsWith(`${prefix}-`) || base === `${prefix}.ts` || base === `${prefix}.json`) return prefix;
  }
  return null;
}

describe("the sweep has something to sweep", () => {
  it("finds the Assassination tree, the two Paladin trees, the Blood Death Knight tree, since M11-C2 the Brewmaster Monk tree, since M12-D the Restoration Shaman evaluator tree (registered since HEAL-A) , since M13-A, the Augmentation Evoker tree (registered since M13-E) and, since HEAL-B1, the Holy Paladin, Restoration Druid and Mistweaver Monk healer trees, and since HEAL-B2 the Holy Priest healer tree, and since HEAL-B3 the Discipline Priest healer tree", () => {
    const trees = new Set(SPEC_FILES.map(specTreeOf).filter((tree): tree is string => tree !== null));
    expect([...trees].sort()).toEqual([
      "src/specs/deathknight/blood",
      "src/specs/druid/restoration",
      "src/specs/evoker/augmentation",
      "src/specs/monk/brewmaster",
      "src/specs/monk/mistweaver",
      "src/specs/paladin/holy",
      "src/specs/paladin/protection",
      "src/specs/paladin/retribution",
      "src/specs/priest/discipline",
      "src/specs/priest/holy",
      "src/specs/rogue/assassination",
      "src/specs/shaman/restoration",
    ]);
    expect(existsSync("src/specs/paladin/protection/registration.ts")).toBe(true);
    expect(existsSync("src/specs/shaman/restoration/registration.ts")).toBe(true);
    expect(existsSync("src/specs/evoker/augmentation/registration.ts")).toBe(true);
    expect(existsSync("src/specs/paladin/holy/registration.ts")).toBe(true);
    expect(existsSync("src/specs/druid/restoration/registration.ts")).toBe(true);
    expect(existsSync("src/specs/monk/mistweaver/registration.ts")).toBe(true);
    expect(existsSync("src/specs/priest/holy/registration.ts")).toBe(true);
    expect(existsSync("src/specs/priest/discipline/registration.ts")).toBe(true);
    expect(existsSync("src/specs/paladin/retribution/registration.ts")).toBe(true);
  });

  it("reads real import statements", () => {
    expect(importSpecifiersOf("src/services/analyzer-registry.ts")).toContain(
      "../specs/rogue/assassination/registration.js",
    );
  });
});

describe("one specialization tree cannot import another", () => {
  it.each(SPEC_FILES)("%s imports nothing from another specialization tree", (path) => {
    const own = specTreeOf(path);
    for (const specifier of importSpecifiersOf(path)) {
      const resolved = resolveSpecifier(path, specifier);
      const target = specTreeOf(`${resolved}/`);
      if (target === null) continue;
      expect(target, `${path} imports ${specifier}`).toBe(own);
    }
  });

  it.each(SPEC_FILES)("%s imports no other class's game data or authority artifact", (path) => {
    const ownClass = classOf(path);
    for (const specifier of importSpecifiersOf(path)) {
      const resolved = resolveSpecifier(path, specifier);
      if (!resolved.includes("/data/game/") && !resolved.includes("/simc/data/")) continue;
      const prefix = classPrefixOfModule(resolved);
      if (prefix === null) continue;
      expect(prefix, `${path} imports ${specifier}`).toBe(ownClass);
    }
  });

  it("Assassination's pinned loader is reached only from its own tree", () => {
    // `src/simc/pinned-authority.ts` is a spec-named loader living under shared
    // SimC code. Until it is generalized, the only specialization tree that may
    // import it is the one whose artifact it loads; every other consumer must go
    // through the registration's authority access.
    const importers = ALL_SRC.filter((path) =>
      importSpecifiersOf(path).some((specifier) =>
        resolveSpecifier(path, specifier).endsWith("simc/pinned-authority.js"),
      ),
    );
    for (const importer of importers) {
      const allowed =
        importer.startsWith("src/specs/rogue/assassination/") || importer.startsWith("src/simc/");
      expect(allowed, `${importer} imports the Assassination pinned loader`).toBe(true);
    }
    expect(importers).toContain("src/specs/rogue/assassination/registration.ts");
  });
});

describe("shared code reaches specializations only through the registration boundary", () => {
  const OUTSIDE_SPECS = ALL_SRC.filter((path) => !path.startsWith("src/specs/"));

  it("exactly one module outside src/specs imports a specialization implementation", () => {
    const importers = OUTSIDE_SPECS.filter((path) =>
      importSpecifiersOf(path).some((specifier) => resolveSpecifier(path, specifier).includes("src/specs/")),
    );
    expect(importers).toEqual(["src/services/analyzer-registry.ts"]);
    // And it imports exactly the seven registrations, nothing deeper.
    const specImports = importSpecifiersOf("src/services/analyzer-registry.ts")
      .map((specifier) => resolveSpecifier("src/services/analyzer-registry.ts", specifier))
      .filter((resolved) => resolved.includes("src/specs/"))
      .sort();
    expect(specImports).toEqual([
      "src/specs/deathknight/blood/registration.js",
      "src/specs/druid/restoration/registration.js",
      "src/specs/evoker/augmentation/registration.js",
      "src/specs/monk/brewmaster/registration.js",
      "src/specs/monk/mistweaver/registration.js",
      "src/specs/paladin/holy/registration.js",
      "src/specs/paladin/protection/registration.js",
      "src/specs/paladin/retribution/registration.js",
      "src/specs/priest/discipline/registration.js",
      "src/specs/priest/holy/registration.js",
      "src/specs/rogue/assassination/registration.js",
      "src/specs/shaman/restoration/registration.js",
    ]);
  });

  it("shared authority code imports no specialization module", () => {
    for (const path of filesUnder("src/simc").filter((candidate) => candidate.endsWith(".ts"))) {
      for (const specifier of importSpecifiersOf(path)) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/specs/");
      }
    }
  });

  it("shared finding vocabulary imports no specialization module", () => {
    for (const path of filesUnder("src/findings").filter((candidate) => candidate.endsWith(".ts"))) {
      for (const specifier of importSpecifiersOf(path)) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/specs/");
      }
    }
  });

  it("public dispatch paths never use the internal lookup or a raw catalog row", () => {
    const PUBLIC_PATHS = [
      "src/services/analysis-service.ts",
      "src/services/raid-night-service.ts",
      "src/services/encounter-context-service.ts",
      ...filesUnder("src/api"),
      ...filesUnder("src/mcp"),
      ...filesUnder("src/runtime"),
      ...filesUnder("src/contracts"),
      ...filesUnder("src/aggregation"),
    ].filter((path) => path.endsWith(".ts"));
    for (const path of PUBLIC_PATHS) {
      expect(codeOf(path), `${path} uses the internal lookup`).not.toContain("internalAnalyzerForSpec");
    }
    // The raw registration rows reach nothing outside the registry: the two
    // services obtain a VALIDATED catalog through `catalogFor`, and no
    // transport, contract or aggregation module names the rows, the production
    // catalog, or a validator at all.
    for (const path of PUBLIC_PATHS) {
      expect(codeOf(path), `${path} names the raw registration rows`).not.toContain("ANALYZER_REGISTRATIONS");
    }
    for (const path of PUBLIC_PATHS.filter((candidate) => !candidate.startsWith("src/services/"))) {
      for (const banned of [
        "PRODUCTION_CATALOG",
        "validateAnalyzerCatalog",
        "requireValidatedCatalog",
        "catalogFor",
      ]) {
        expect(codeOf(path), `${path} names ${banned}`).not.toContain(banned);
      }
    }
  });

  it("no lookup surface accepts a raw registration array", () => {
    // The API shape itself: every exported lookup takes the branded catalog.
    const registry = codeOf("src/services/analyzer-registry.ts");
    for (const lookup of [
      "analyzerForSpec",
      "internalAnalyzerForSpec",
      "publicAnalyzers",
      "observedDecisionViewOf",
    ]) {
      const start = registry.indexOf(`export function ${lookup}(`);
      expect(start, `${lookup} is exported`).toBeGreaterThan(-1);
      const signature = registry.slice(start, registry.indexOf(")", start));
      expect(signature, `${lookup} does not take a ValidatedAnalyzerCatalog`).toContain(
        "catalog: ValidatedAnalyzerCatalog",
      );
    }
    expect(registry).not.toContain("new WeakMap");
    expect(registry).not.toContain("new Map<");
  });
});

describe("selection and encounter context cannot reach authority paths", () => {
  const AUTHORITY_AND_GAMEPLAY = [
    ...filesUnder("src/specs"),
    ...filesUnder("src/simc"),
    ...filesUnder("src/findings"),
  ].filter((path) => path.endsWith(".ts"));

  it.each(AUTHORITY_AND_GAMEPLAY)(
    "%s imports no ranking, external-context or encounter-context module",
    (path) => {
      for (const specifier of importSpecifiersOf(path)) {
        for (const forbidden of [
          "/rankings/",
          "/external-context/",
          "/encounter-context/",
          "/comparison/",
          "/progression/",
        ]) {
          expect(specifier, `${path} imports ${specifier}`).not.toContain(forbidden);
        }
      }
    },
  );

  /**
   * Parse-performance and ranking-position fields, by name.
   *
   * These appear legitimately in the corpus MANIFEST (as selection context), in
   * the ranking decoder and in the external-context domain. They must never be
   * READ by an evaluator, an authority module, the shared finding vocabulary,
   * the services, the engine, the game-data layer, or a corpus executor.
   */
  const SELECTION_TOKENS = ["performanceContext", "rankPercent", "bracketPercent", "totalParses"] as const;
  const MUST_NOT_READ = [
    ...filesUnder("src/specs"),
    ...filesUnder("src/simc"),
    ...filesUnder("src/findings"),
    ...filesUnder("src/services"),
    ...filesUnder("src/engine"),
    ...filesUnder("src/data"),
    ...filesUnder("tests/support/corpus/executors"),
    "tests/support/corpus/fight.ts",
    "tests/support/corpus/harness.ts",
  ].filter((path) => path.endsWith(".ts"));

  it("found the guarded modules", () => {
    expect(MUST_NOT_READ.length).toBeGreaterThan(60);
    expect(MUST_NOT_READ).toContain("tests/support/corpus/executors/spec-assassination.ts");
  });

  it.each(SELECTION_TOKENS)("no guarded module reads `%s`", (token) => {
    for (const path of MUST_NOT_READ) {
      expect(codeOf(path), `${path} reads ${token}`).not.toContain(token);
    }
  });

  it("the token guard is precise: the manifest contract legitimately declares the field", () => {
    expect(sourceOf("tests/support/corpus/contract.ts")).toContain("performanceContext");
  });
});
