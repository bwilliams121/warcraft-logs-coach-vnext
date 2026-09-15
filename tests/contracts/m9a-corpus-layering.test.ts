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
  type AssertionKind,
} from "../support/corpus/contract.js";
import { EXECUTABLE_KINDS, executeAssertion } from "../support/corpus/executors.js";
import { committedCorpusFiles, loadCorpusOrThrow } from "../support/corpus/loader.js";

const SRC_SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

const CORPUS_SUPPORT_SOURCES: Record<string, string> = import.meta.glob("../support/corpus/*.ts", {
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

describe("the corpus machinery is offline, deterministic and read-only", () => {
  it("consists of the contract, the loader and the executors", () => {
    expect(CORPUS_SUPPORT_PATHS).toEqual([
      "support/corpus/contract.ts",
      "support/corpus/executors.ts",
      "support/corpus/loader.ts",
    ]);
  });

  it.each(CORPUS_SUPPORT_PATHS)("%s imports no transport, runtime, service or interface module", (path) => {
    // The corpus may drive decoders and the engine. It may never drive the
    // client that could fetch a fresh copy of what it is supposed to pin.
    for (const specifier of importsOf(CORPUS_SUPPORT_SOURCES[`../${path}`] ?? "")) {
      for (const forbidden of [
        "graphql-client",
        "token-provider",
        "paginator",
        "ingest-fight",
        "preflight",
        "report-roster",
        "report-revision",
        "/runtime/",
        "/services/",
        "/api/",
        "/mcp/",
        "config/env",
        "node:fs",
        "node:child_process",
        "wcl-harness",
        "fake-fetch",
      ]) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain(forbidden);
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
        "fetch(",
        "process.",
        "readFileSync",
        "writeFileSync",
        "__dirname",
        "import.meta.url",
      ]) {
        expect(code, `${path} uses ${banned}`).not.toContain(banned);
      }
    },
  );

  it("binds the committed corpus at build time from the corpus root only", () => {
    // Raw source, not `codeOf`: the glob pattern's `/**` would read as the
    // start of a block comment to the stripper.
    const loader = CORPUS_SUPPORT_SOURCES["../support/corpus/loader.ts"] ?? "";
    expect(loader).toContain('"../../corpus/manifest.json"');
    expect(loader).toContain('"../../corpus/artifacts/**"');
    // Not the legacy fixture tree, and not the whole tests directory.
    expect(loader).not.toContain("../fixtures");
    expect(loader).not.toMatch(/glob\(\s*\[?\s*"\.\.\/\.\.\/\*\*/);
  });

  it("never writes to the file table it validates", async () => {
    const files = committedCorpusFiles();
    const frozen = Object.freeze({ ...files });

    await expect(loadCorpusOrThrow(frozen)).resolves.toBeDefined();
    expect(Object.keys(frozen).sort()).toEqual(Object.keys(files).sort());
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

  it("answers DECLARED, not pass, for a DECLARED kind", async () => {
    // A DECLARED kind that returned `ok: true` would be silent fake coverage.
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    const kase = corpus.cases[0];
    if (kase === undefined) throw new Error("the seed corpus has no cases");
    for (const [kind, def] of registered) {
      if (def.execution !== "DECLARED") continue;
      const outcome = executeAssertion(corpus, kase, { kind, params: {}, execution: "DECLARED" });
      expect(outcome.ok, kind).toBe("DECLARED");
    }
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

  it("holds no player name field in any event artifact", async () => {
    // Event payloads reference actors by numeric id. A `name` key on an event
    // would be personal data the sanitizer is supposed to have kept out.
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    for (const artifact of corpus.artifacts) {
      if (artifact.record.payloadKind !== "WCL_EVENT_ARRAY") continue;
      for (const event of artifact.json as readonly Record<string, unknown>[]) {
        expect(Object.keys(event), artifact.record.artifactId).not.toContain("name");
        expect(Object.keys(event), artifact.record.artifactId).not.toContain("server");
      }
    }
  });
});
