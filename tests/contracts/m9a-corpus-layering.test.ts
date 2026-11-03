/**
 * The regression corpus is test-only machinery, and production must not be
 * able to reach it.
 *
 * WHAT THIS GUARDS
 *
 * Two directions. Production code under `src/` must never import a fixture, a
 * corpus artifact or any test-support module — a Worker that bundled a corpus
 * would ship evidence as behaviour, and a service that "knew" a fixture would
 * have a second analysis path. And the corpus machinery itself must stay
 * offline and deterministic: no transport, no clock, no filesystem, so loading
 * the corpus can never refresh it, reach Warcraft Logs, or differ by machine.
 *
 * The rest pins the contract's own invariants: every EXECUTABLE kind has an
 * executor and every DECLARED kind has none, the owning layers name real source
 * roots, UNKNOWN and NO_AUTHORITY_AVAILABLE cannot be asserted in each other's
 * place, and no committed corpus byte is credential-shaped.
 */

import { describe, expect, it } from "vitest";

import {
  ASSERTION_KINDS,
  OUTCOME_CLASSES,
  OWNING_LAYERS,
  ownershipRootProblems,
  type AssertionKind,
} from "../support/corpus/contract.js";
import { EXECUTABLE_KINDS } from "../support/corpus/executors.js";
import { committedCorpusFiles, loadCorpusOrThrow } from "../support/corpus/loader.js";

const SRC_SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

const CORPUS_SUPPORT_SOURCES: Record<string, string> = import.meta.glob("../support/corpus/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

/** Any JSON left under the pre-M9-B fixture tree. Expected to be nothing. */
const LEGACY_FIXTURE_JSON: Record<string, string> = import.meta.glob("../fixtures/wcl/events/*.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

/** Every test and support module, for the coverage-policy guard. */
const TEST_SOURCES: Record<string, string> = import.meta.glob("../**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

const PRETTIER_IGNORE: Record<string, string> = import.meta.glob("../../.prettierignore", {
  eager: true,
  query: "?raw",
  import: "default",
});
const CORPUS_GIT_ATTRIBUTES: Record<string, string> = import.meta.glob("../corpus/.gitattributes", {
  eager: true,
  query: "?raw",
  import: "default",
});
const ROOT_FILES: Record<string, string> = { ...PRETTIER_IGNORE, ...CORPUS_GIT_ATTRIBUTES };

function normalizeKey(key: string, prefix: RegExp): string {
  return key.replace(prefix, "").split("\\").join("/");
}

/**
 * The directory this file lives in, under `tests/`. Vite keys a relative glob
 * match relative to the IMPORTING file, and keys a match in the importer's
 * own directory as `./x`, not `../contracts/x`.
 */
const OWN_TESTS_DIRECTORY = "contracts/";

/**
 * A `TEST_SOURCES` key as ONE repository-relative path under `tests/`
 * (M11-D1).
 *
 *     ../unit/x.test.ts   ->  unit/x.test.ts
 *     ./x.test.ts         ->  contracts/x.test.ts
 *
 * Until M11-D1 only `../` was stripped, so every `tests/contracts/` module kept
 * its `./` key, was looked up again as `.././x`, found nothing, and was checked
 * as an EMPTY source — listed, and never inspected. Any other key shape is a
 * change in how the glob is keyed, and fails loudly rather than being dropped.
 */
function testsRelativePath(globKey: string): string {
  const key = globKey.split("\\").join("/");
  const path = key.startsWith("../")
    ? key.slice("../".length)
    : key.startsWith("./")
      ? `${OWN_TESTS_DIRECTORY}${key.slice("./".length)}`
      : null;
  if (
    path === null ||
    path.startsWith(".") ||
    path.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error(`the test-source glob produced a key this guard cannot place under tests/: ${globKey}`);
  }
  return path;
}

/** Every test and support module's source, keyed by its path under `tests/` (M11-D1). */
const TEST_SOURCE_BY_PATH: ReadonlyMap<string, string> = new Map(
  Object.entries(TEST_SOURCES).map(([key, source]) => [testsRelativePath(key), source]),
);

function importsOf(source: string): readonly string[] {
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^\n]*?from\s+["']([^"']+)["']/g)].map(
    (entry) => entry[1] ?? "",
  );
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Resolves a relative specifier against the importing file's directory. */
function resolveRelative(fromPath: string, specifier: string): string {
  const segments = fromPath.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  return segments.join("/");
}

const SRC_PATHS = Object.keys(SRC_SOURCES)
  .map((key) => normalizeKey(key, /^\.\.\/\.\.\//))
  .sort();

describe("production code cannot reach the corpus or any test machinery", () => {
  it("captured the production tree", () => {
    expect(SRC_PATHS.length).toBeGreaterThan(100);
  });

  it.each(SRC_PATHS)("%s resolves every relative import inside src/", (path) => {
    for (const specifier of importsOf(SRC_SOURCES[`../../${path}`] ?? "")) {
      if (!specifier.startsWith(".")) continue;
      const resolved = resolveRelative(path, specifier);
      expect(resolved, `${path} imports ${specifier} → ${resolved}`).toMatch(/^src\//);
    }
  });

  it.each(SRC_PATHS)("%s names no tests/, fixtures/, corpus or vitest specifier", (path) => {
    for (const specifier of importsOf(SRC_SOURCES[`../../${path}`] ?? "")) {
      for (const forbidden of ["tests/", "fixtures/", "/corpus", "support/", "vitest", "manifest.json"]) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain(forbidden);
      }
    }
  });

  it("no production module globs the filesystem for evidence", () => {
    for (const path of SRC_PATHS) {
      expect(codeOf(SRC_SOURCES[`../../${path}`] ?? ""), path).not.toContain("import.meta.glob");
    }
  });
});

const CORPUS_SUPPORT_PATHS = Object.keys(CORPUS_SUPPORT_SOURCES)
  .map((key) => normalizeKey(key, /^\.\.\//))
  .sort();

/**
 * Two rings. The PURE ring — contract, loader, artifacts, fight, harness,
 * dispatcher — reaches no transport, service or interface and could run
 * anywhere. The EXECUTOR ring reaches exactly the production path its layer
 * owns, and for WCL_TRANSPORT and PUBLIC_CONTRACT that means the repository's
 * offline doubles: a recording fake fetch, faked Warcraft Logs ports. Neither
 * ring may reach the production composition root that binds the real client.
 */
const PURE_RING = [
  "support/corpus/artifacts.ts",
  "support/corpus/contract.ts",
  // M11-C4e: the evidence archive's file table and harness entry point, and
  // the promotion-evidence reader over both roots. Pure like the loader they
  // build on: no transport, service or interface.
  "support/corpus/evidence-archive.ts",
  "support/corpus/execution-context.ts",
  "support/corpus/executors.ts",
  "support/corpus/fight.ts",
  "support/corpus/harness.ts",
  "support/corpus/loader.ts",
  "support/corpus/machine-report.ts",
  "support/corpus/promotion-evidence.ts",
  "support/corpus/report.ts",
];
const EXECUTOR_RING = [
  "support/corpus/executors/application-service.ts",
  "support/corpus/executors/combat-state.ts",
  "support/corpus/executors/normalization.ts",
  "support/corpus/executors/outcome.ts",
  "support/corpus/executors/params.ts",
  "support/corpus/executors/public-contract.ts",
  "support/corpus/executors/shared-decision-engine.ts",
  "support/corpus/executors/spec-assassination.ts",
  "support/corpus/executors/spec-augmentation-evoker.ts",
  "support/corpus/executors/spec-blood-death-knight.ts",
  "support/corpus/executors/spec-brewmaster-monk.ts",
  "support/corpus/executors/spec-holy-paladin.ts",
  "support/corpus/executors/spec-mistweaver-monk.ts",
  "support/corpus/executors/spec-protection-paladin.ts",
  "support/corpus/executors/spec-restoration-druid.ts",
  "support/corpus/executors/spec-restoration-shaman.ts",
  "support/corpus/executors/spec-retribution-paladin.ts",
  "support/corpus/executors/wcl-transport.ts",
];

/** Never, from anywhere in the corpus machinery. */
const BANNED_EVERYWHERE = [
  "analysis-composition",
  "token-provider",
  "graphql-client",
  "ingest-fight",
  // The LIVE preflight port and its composition. `preflight-query.js` (the
  // query document and decoder) is not a transport and the identity executor
  // may read it.
  "wcl/preflight.js",
  "report-roster",
  "report-revision",
  "node:fs",
  "node:child_process",
  "node:net",
  "node:http",
];

/** Additionally banned from the pure ring: any transport, service or interface. */
const BANNED_IN_PURE_RING = [
  "paginator",
  "/runtime/",
  "/services/",
  "/api/",
  "/mcp/",
  "config/env",
  "wcl-harness",
  "fake-fetch",
  "analysis-transports",
  "orchestration-fixture",
];

describe("the corpus machinery is offline, deterministic and read-only", () => {
  it("consists of exactly the pure ring and the executor ring", () => {
    expect(CORPUS_SUPPORT_PATHS).toEqual([...PURE_RING, ...EXECUTOR_RING].sort());
  });

  it.each(CORPUS_SUPPORT_PATHS)(
    "%s never imports the live Warcraft Logs client or its composition",
    (path) => {
      for (const specifier of importsOf(CORPUS_SUPPORT_SOURCES[`../${path}`] ?? "")) {
        for (const forbidden of BANNED_EVERYWHERE) {
          expect(specifier, `${path} imports ${specifier}`).not.toContain(forbidden);
        }
      }
    },
  );

  it.each(PURE_RING)("%s imports no transport, runtime, service or interface module", (path) => {
    for (const specifier of importsOf(CORPUS_SUPPORT_SOURCES[`../${path}`] ?? "")) {
      for (const forbidden of BANNED_IN_PURE_RING) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain(forbidden);
      }
    }
  });

  it("lets only the transport executor reach the paginator, and only through the offline fake fetch", () => {
    for (const path of EXECUTOR_RING) {
      const specifiers = importsOf(CORPUS_SUPPORT_SOURCES[`../${path}`] ?? "");
      const reachesPaginator = specifiers.some((specifier) => specifier.includes("paginator"));
      if (path !== "support/corpus/executors/wcl-transport.ts") {
        expect(reachesPaginator, `${path} reaches the paginator`).toBe(false);
        continue;
      }
      expect(reachesPaginator).toBe(true);
      expect(specifiers.some((specifier) => specifier.includes("wcl-harness"))).toBe(true);
    }
  });

  it("lets only the public-contract executor reach the Worker and MCP", () => {
    for (const path of EXECUTOR_RING) {
      const specifiers = importsOf(CORPUS_SUPPORT_SOURCES[`../${path}`] ?? "");
      const reachesInterfaces = specifiers.some(
        (specifier) => specifier.includes("/api/") || specifier.includes("/mcp/"),
      );
      expect(reachesInterfaces, path).toBe(path === "support/corpus/executors/public-contract.ts");
    }
  });

  it("lets only the shared-decision-engine executor exercise src/simc without a specialization, and it imports nothing else", () => {
    // Correction 2 (M10-C). The shared engine is its own layer, so its executor
    // must reach the engine directly — and must not smuggle in a specialization,
    // a service, a fight builder or a normalizer, which would make its cases
    // coverage of something the layer does not own.
    const path = "support/corpus/executors/shared-decision-engine.ts";
    const specifiers = importsOf(CORPUS_SUPPORT_SOURCES[`../${path}`] ?? "");
    const production = specifiers.filter((specifier) => specifier.includes("/src/"));
    expect(production.length).toBeGreaterThan(0);
    for (const specifier of production) {
      expect(specifier, `${path} imports ${specifier}`).toMatch(/\/src\/simc\//);
    }
    // Every OTHER executor that reaches the engine does so through a specialization tree.
    for (const other of EXECUTOR_RING) {
      if (other === path) continue;
      const otherSpecifiers = importsOf(CORPUS_SUPPORT_SOURCES[`../${other}`] ?? "");
      const reachesEngine = otherSpecifiers.some((specifier) => specifier.includes("/src/simc/"));
      expect(reachesEngine, `${other} reaches src/simc directly`).toBe(false);
    }
  });

  it("lets only the application-service and public-contract executors reach the services", () => {
    const allowed = new Set([
      "support/corpus/executors/application-service.ts",
      "support/corpus/executors/public-contract.ts",
    ]);
    for (const path of EXECUTOR_RING) {
      const specifiers = importsOf(CORPUS_SUPPORT_SOURCES[`../${path}`] ?? "");
      const reachesServices = specifiers.some((specifier) => specifier.includes("/services/"));
      expect(reachesServices, path).toBe(allowed.has(path));
    }
  });

  it("lets the transport executor read the preflight QUERY but never the live preflight PORT", () => {
    const specifiers = importsOf(
      CORPUS_SUPPORT_SOURCES["../support/corpus/executors/wcl-transport.ts"] ?? "",
    );
    expect(specifiers.some((specifier) => specifier.endsWith("wcl/preflight-query.js"))).toBe(true);
    expect(specifiers.some((specifier) => specifier.endsWith("wcl/preflight.js"))).toBe(false);
    for (const path of CORPUS_SUPPORT_PATHS) {
      for (const specifier of importsOf(CORPUS_SUPPORT_SOURCES[`../${path}`] ?? "")) {
        expect(specifier, `${path} imports ${specifier}`).not.toMatch(/wcl\/preflight\.js$/);
      }
    }
  });

  it.each(CORPUS_SUPPORT_PATHS)(
    "%s reads no clock, randomness, network, filesystem or environment",
    (path) => {
      const code = codeOf(CORPUS_SUPPORT_SOURCES[`../${path}`] ?? "");
      for (const banned of [
        "Date.now",
        "new Date(",
        "Math.random",
        "randomUUID",
        "performance.now",
        "process.",
        "readFileSync",
        "writeFileSync",
        "__dirname",
        "import.meta.url",
      ]) {
        expect(code, `${path} uses ${banned}`).not.toContain(banned);
      }
      // A bare `fetch(` would be the global network primitive. `.fetch(` on a
      // Worker instance is the handler entry point and takes a Request, not a
      // socket; that one is what the parity executor legitimately calls.
      expect(code, `${path} calls the global fetch`).not.toMatch(/(?<![\w.])fetch\(/);
    },
  );

  it("binds the committed corpus at build time from the corpus root only", () => {
    // Raw source, not `codeOf`: the glob pattern's `/**` would read as the
    // start of a block comment to the stripper.
    const loader = CORPUS_SUPPORT_SOURCES["../support/corpus/loader.ts"] ?? "";
    expect(loader).toContain('"../../corpus/manifest.json"');
    expect(loader).toContain('"../../corpus/artifacts/**"');
    // Not a legacy fixture tree, and not the whole tests directory.
    expect(loader).not.toContain("../fixtures");
    expect(loader).not.toMatch(/glob\(\s*\[?\s*"\.\.\/\.\.\/\*\*/);
  });

  it("never writes to the file table it validates", async () => {
    const files = committedCorpusFiles();
    const frozen = Object.freeze({ ...files });

    await expect(loadCorpusOrThrow(frozen)).resolves.toBeDefined();
    expect(Object.keys(frozen).sort()).toEqual(Object.keys(files).sort());
  });

  it("no legacy fixture tree remains beside the corpus", () => {
    // The corpus copies are canonical. A second tree of event JSON would be a
    // second authoritative version of the same evidence.
    expect(Object.keys(LEGACY_FIXTURE_JSON)).toEqual([]);
  });
});

/**
 * ONE COVERAGE POLICY FOR CAPTURED EVIDENCE.
 *
 * A test can only grant coverage to captured events by hand if it (a) obtains
 * the raw events, (b) normalizes them itself, and (c) hands the result to a
 * fight builder with coverage of its own choosing. The shared interpreter in
 * `tests/support/corpus/fight.ts` is the only place all three may meet. Every
 * other module may do at most two of them: a normalization test may normalize
 * raw captured events and inspect the output (no fight), and a state test may
 * build synthetic fights from synthetic events (no captured raw events).
 *
 * Reading captured raw events for facts about the bytes — amounts present,
 * type strings present — is not coverage and is not restricted.
 */
describe("captured evidence receives coverage only through the shared corpus interpreter", () => {
  const CORPUS_DIR = "support/corpus/";
  const testPaths = [...TEST_SOURCE_BY_PATH.keys()].filter((path) => !path.startsWith(CORPUS_DIR)).sort();

  /**
   * The source of an enumerated module. A path with no source is a defect in
   * this guard, not an empty module, and throws: before M11-D1 a miss read as
   * `""` and every predicate passed on it silently.
   */
  function sourceAt(path: string): string {
    const source = TEST_SOURCE_BY_PATH.get(path);
    if (source === undefined)
      throw new Error(`the coverage guard enumerated ${path} but holds no source for it`);
    return source;
  }

  /** Raw captured events, however obtained. */
  function readsCapturedRawEvents(source: string): boolean {
    return (
      /\bcommittedEventArray\b/.test(source) ||
      /\bcommittedEvidence\b/.test(source) ||
      /\b[A-Z0-9_]+_RAW_EVENTS\b/.test(source)
    );
  }

  function normalizesItself(source: string): boolean {
    return importsOf(source).some((specifier) => specifier.includes("event-normalizer"));
  }

  function buildsFights(source: string): boolean {
    return importsOf(source).some(
      (specifier) => specifier.includes("synthetic-fight") || specifier.includes("state/combat-state"),
    );
  }

  it("found the test tree", () => {
    expect(testPaths.length).toBeGreaterThan(100);
  });

  // M11-D1: the enumeration itself is under test. Before this, every
  // `tests/contracts/` module was listed under a `./` key and checked as an
  // empty source, and nothing above could notice: the count still exceeded
  // 100, and the non-vacuity check below is satisfied by other directories.

  it("keys every enumerated module by one path under tests/, with no ./ or ../ left in it", () => {
    expect(TEST_SOURCE_BY_PATH.size).toBe(Object.keys(TEST_SOURCES).length);
    for (const path of testPaths) {
      expect(path, `${path} is not a normalized path under tests/`).toMatch(/^[a-z0-9_-]+\/[^.]/i);
      expect(path.split("/").every((part) => part !== "." && part !== ".." && part.length > 0)).toBe(true);
    }
  });

  it("maps every enumerated module to its source text", () => {
    for (const path of testPaths) {
      expect(sourceAt(path).trim().length, `${path} was enumerated with no source text`).toBeGreaterThan(0);
    }
  });

  it("genuinely inspects this file's own directory, tests/contracts/", () => {
    // A named, existing contract module whose text the triple rule's first
    // predicate matches (it names `committedEventArray` in order to ban it).
    // Only a guard that actually READ the file can see that.
    const named = "contracts/m10d-no-corpus-window-in-production.test.ts";
    expect(testPaths).toContain(named);
    expect(sourceAt(named)).toContain('"committedEventArray"');
    expect(readsCapturedRawEvents(sourceAt(named))).toBe(true);
    const contracts = testPaths.filter((path) => path.startsWith(OWN_TESTS_DIRECTORY));
    expect(contracts.length).toBeGreaterThan(0);
    // Real contract modules import; an empty or unread source imports nothing.
    expect(contracts.filter((path) => importsOf(sourceAt(path)).length > 0).length).toBe(contracts.length);
  });

  it("covers every test directory non-vacuously", () => {
    // Per directory, so no directory can go dark behind the others' totals:
    // each must be enumerated, and each of its modules must carry imports the
    // predicates can read.
    for (const directory of ["contracts/", "unit/", "regression/", "integration/", "support/"]) {
      const inDirectory = testPaths.filter((path) => path.startsWith(directory));
      expect(inDirectory.length, `${directory} is not enumerated`).toBeGreaterThan(0);
      expect(
        inDirectory.filter((path) => importsOf(sourceAt(path)).length > 0).length,
        `${directory} modules were enumerated without readable imports`,
      ).toBeGreaterThan(0);
    }
  });

  it.each(testPaths)("%s does not read, normalize and build a fight over captured events itself", (path) => {
    const source = sourceAt(path);
    const doesAllThree = readsCapturedRawEvents(source) && normalizesItself(source) && buildsFights(source);
    expect(doesAllThree, `${path} grants its own coverage to captured events`).toBe(false);
  });

  it("is not vacuous: each of the three predicates matches real modules, and one matches two of them", () => {
    const sources = testPaths.map(sourceAt);
    expect(sources.some(readsCapturedRawEvents)).toBe(true);
    expect(sources.some(normalizesItself)).toBe(true);
    expect(sources.some(buildsFights)).toBe(true);
    // A normalization test legitimately reads raw captured events and
    // normalizes them (no fight): the rule forbids the triple, not the pair.
    expect(sources.some((source) => readsCapturedRawEvents(source) && normalizesItself(source))).toBe(true);
  });

  it("keeps normalized captured events inside the interpreter", () => {
    // `normalizeEvents` is not exported: outside `fight.ts` there is no way to
    // obtain normalized captured events except inside a fight the interpreter
    // built. Facts about normalization leave as counts only.
    const fight = CORPUS_SUPPORT_SOURCES["../support/corpus/fight.ts"] ?? "";
    expect(fight).toMatch(/\nfunction normalizeEvents\(/);
    expect(fight).not.toMatch(/\nexport function normalizeEvents\(/);
    expect(fight).toMatch(/\nexport function normalizationFactsOf\(/);
  });

  it("exposes only the sanctioned entry points to modules outside the corpus machinery", () => {
    const allowed = new Set([
      "corpusFight",
      "corpusState",
      "corpusFightFrom",
      "corpusStateFrom",
      "normalizationFactsOf",
      "positionOfCast",
      "FightPremise",
      // M10-C5 Phase B2: the bundle analogues of corpusFight / corpusState,
      // the composer's refusal, and the evidence-level entry the bundle
      // refusal tests need to present a MUTATED part (a renamed record, a
      // duplicated boundary row) to the composer. `committedEvidence` counts
      // as reading captured raw events for the triple rule above.
      "corpusBundle",
      "corpusBundleState",
      "BundleCompositionError",
      "bundleOverEvidence",
      "committedEvidence",
      "ArtifactEvidence",
      // M11-C4i: the loader-backed analogue of corpusBundleState, the only
      // bundle entry that resolves an evidence-archive part (the composer
      // still owns reading, normalization and composition).
      "stateOfBundle",
      // M11-E2.1: the loader-backed composition itself, for the canonical
      // Blood Death Knight fixture. It is the only entry that takes a
      // committed fight-context catalog, and it exposes the composed ranges
      // and holes test A asserts. The composer still owns reading,
      // normalization, composition and the catalog's decoding.
      "bundleOf",
      "BundleComposition",
    ]);
    for (const path of testPaths) {
      const source = sourceAt(path);
      const imports = [
        ...source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'][^"']*corpus\/fight\.js["']/g),
      ];
      for (const match of imports) {
        for (const name of (match[1] ?? "").split(",")) {
          const bare =
            name
              .replace(/^\s*type\s+/, "")
              .trim()
              .split(/\s+as\s+/)[0] ?? "";
          if (bare.length === 0) continue;
          expect(allowed.has(bare), `${path} imports ${bare} from the corpus fight interpreter`).toBe(true);
        }
      }
    }
  });

  it("names every premise the interpreter accepts, so a new one is a reviewed addition", () => {
    const fight = CORPUS_SUPPORT_SOURCES["../support/corpus/fight.ts"] ?? "";
    const kinds = [...fight.matchAll(/readonly kind: "([A-Z_]+)"/g)].map((m) => m[1]);
    expect(kinds).toEqual(["TRUNCATED_BEFORE", "EVENT_REMOVED_AT", "FANNED_ACTORS"]);
  });
});

describe("assertion execution matches the registry exactly", () => {
  const registered = Object.entries(ASSERTION_KINDS) as [
    AssertionKind,
    (typeof ASSERTION_KINDS)[AssertionKind],
  ][];

  it("has an executor for every EXECUTABLE kind and for nothing else", () => {
    const executable = registered.filter(([, def]) => def.execution === "EXECUTABLE").map(([kind]) => kind);
    expect([...EXECUTABLE_KINDS].sort()).toEqual([...executable].sort());
  });

  it("has no DECLARED kind left after M9-B", async () => {
    // M9-A shipped two DECLARED kinds; both are executable now. The harness
    // path for a future DECLARED kind (NOT_EXECUTED, never a pass) is pinned in
    // the loader tests; here the registry is asserted fully executable so the
    // gate's `declaredInCorpus: 0` is a fact about the registry too.
    expect(registered.filter(([, def]) => (def.execution as string) === "DECLARED")).toEqual([]);
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    expect(corpus.coverage.declared).toBe(0);
  });

  it("maps every source root to exactly one layer, with no overlap and no nesting", () => {
    // Correction 2 (M10-C): `src/simc/` had been listed under both specialization
    // layers. The map is a partition now, and the check is not vacuous.
    expect(ownershipRootProblems()).toEqual([]);
    const owners = Object.entries(OWNING_LAYERS).filter(([, roots]) =>
      (roots as readonly string[]).includes("src/simc/"),
    );
    expect(owners.map(([layer]) => layer)).toEqual(["SHARED_DECISION_ENGINE"]);
    // M11-A2: specialization layers are rooted at the SPEC tree, never the
    // class directory, so a second specialization of either class is owned
    // by its own layer rather than counted as its sibling's coverage.
    expect(OWNING_LAYERS.SPEC_ASSASSINATION).toEqual(["src/specs/rogue/assassination/"]);
    expect(OWNING_LAYERS.SPEC_PROTECTION_PALADIN).toEqual(["src/specs/paladin/protection/"]);
    expect(
      ownershipRootProblems({ A: ["src/simc/"], B: ["src/simc/", "src/specs/"], C: ["src/specs/rogue/"] }),
    ).toEqual([
      "root src/simc/ is owned by both A and B",
      "root src/specs/rogue/ (C) is nested under src/specs/ (B)",
    ]);
  });

  it("owns every kind with a layer whose source roots exist", () => {
    for (const [kind, def] of registered) {
      const roots = OWNING_LAYERS[def.owningLayer];
      const owned = SRC_PATHS.some((path) => roots.some((root) => path.startsWith(root)));
      expect(
        owned,
        `${kind} is owned by ${def.owningLayer}, whose roots ${roots.join(", ")} hold no source`,
      ).toBe(true);
    }
  });

  it("gives every registered kind a non-empty description and at least one payload kind", () => {
    for (const [kind, def] of registered) {
      expect(def.description.length, kind).toBeGreaterThan(20);
      expect(def.payloadKinds.length, kind).toBeGreaterThan(0);
    }
  });
});

describe("UNKNOWN and NO_AUTHORITY_AVAILABLE stay distinct in the corpus vocabulary", () => {
  it("lists both outcome classes, separately", () => {
    expect(OUTCOME_CLASSES).toContain("UNKNOWN");
    expect(OUTCOME_CLASSES).toContain("NO_AUTHORITY_AVAILABLE");
    expect(new Set(OUTCOME_CLASSES).size).toBe(OUTCOME_CLASSES.length);
  });

  it("an UNKNOWN assertion cannot be satisfied by naming NO_AUTHORITY_AVAILABLE as its reason", () => {
    const parsed = ASSERTION_KINDS["COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN"].params.safeParse({
      actorId: 1,
      abilityGameId: null,
      reason: "NO_AUTHORITY_AVAILABLE",
    });
    expect(parsed.success).toBe(false);
  });

  it("no registered kind's outcome class is a blend of the two", () => {
    for (const [kind, def] of Object.entries(ASSERTION_KINDS)) {
      expect(OUTCOME_CLASSES, kind).toContain(def.outcomeClass);
    }
  });
});

describe("storage policy is enforced by tooling, not by memory", () => {
  it("prettier ignores the artifact tree so no tool rewrites evidence bytes", () => {
    const ignore = ROOT_FILES["../../.prettierignore"] ?? "";
    expect(ignore.split(/\r?\n/)).toContain("tests/corpus/artifacts/");
  });

  it("git pins LF under the corpus root", () => {
    const attributes = ROOT_FILES["../corpus/.gitattributes"] ?? "";
    expect(attributes).toMatch(/^\* text eol=lf$/m);
  });
});

describe("no committed corpus byte is credential-shaped", () => {
  // The same needles scripts/sanitize-probe.mjs refuses to write, plus the
  // test-pool sentinels that must never leak into evidence.
  const NEEDLES = [
    "client_secret",
    "access_token",
    "authorization",
    "bearer ",
    "wcl_client_secret",
    "fake-client-secret-not-real",
    "fake-analysis-token-not-real",
  ];

  it("scans the manifest and every artifact", () => {
    const files = committedCorpusFiles();
    expect(Object.keys(files).length).toBeGreaterThan(1);
    for (const [path, text] of Object.entries(files)) {
      const lowered = text.toLowerCase();
      for (const needle of NEEDLES) {
        expect(lowered, `${path} contains ${needle}`).not.toContain(needle);
      }
    }
  });

  it("holds no player name or server field in any event artifact", async () => {
    // Event payloads reference actors by numeric id. The ONE permitted `name`
    // is the public encounter name on an encounter boundary event; a `name`
    // anywhere else, or a `server` anywhere, would be personal data the
    // sanitizer is supposed to have kept out.
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    for (const artifact of corpus.artifacts) {
      if (artifact.record.payloadKind !== "WCL_EVENT_ARRAY") continue;
      for (const event of artifact.json as readonly Record<string, unknown>[]) {
        const type = String(event["type"]);
        if ("name" in event) {
          expect(type, `${artifact.record.artifactId} carries a name on a ${type} event`).toMatch(
            /^encounter(start|end)$/,
          );
        }
        expect(Object.keys(event), artifact.record.artifactId).not.toContain("server");
      }
    }
  });
});
