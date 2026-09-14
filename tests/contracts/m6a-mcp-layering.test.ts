/**
 * The MCP layer may not become a second analyzer.
 *
 * WHY THIS IS A STATIC IMPORT CHECK RATHER THAN A BEHAVIOURAL ONE
 *
 * "MCP contains no gameplay logic" is easy to assert about today's code and
 * impossible to keep true by review alone. The way it fails is not a dramatic
 * rewrite — it is one convenient import, added to solve one real problem, from a
 * transport file into a spec evaluator. After that the duplication has somewhere
 * to grow.
 *
 * So the guarantee is enforced where it can actually be enforced: MCP cannot
 * REACH the gameplay tree at all. A file that cannot import an evaluator cannot
 * quietly reimplement half of one alongside it.
 *
 * THE DIRECTION MATTERS BOTH WAYS
 *
 * MCP must not reach down into gameplay, and gameplay must not reach up into
 * MCP. The second is what keeps `analyzeObservedAssassinationDecisions` pure
 * with respect to transport — the property M5-E established and M6 inherits.
 */

import { describe, expect, it } from "vitest";

/**
 * Source text for every file in the tree, read at build time.
 *
 * `import.meta.glob` rather than a directory walk: it is exhaustive by
 * construction, so a new file under `src/mcp/` is covered the moment it exists
 * without anyone remembering to add it to a list. It also needs no Node
 * filesystem typings, which this project deliberately does not install — the
 * Worker runtime has no `node:path`, and pulling in `@types/node` to satisfy a
 * test would make Node globals look available to source code that must not use
 * them.
 */
const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

/** Repo-relative, forward-slashed paths: `src/mcp/server.ts`. */
function filesUnder(root: string): readonly string[] {
  return Object.keys(SOURCES)
    .map((key) =>
      key
        .replace(/^\.\.\/\.\.\//, "")
        .split("\\")
        .join("/"),
    )
    .filter((path) => path.startsWith(`${root}/`))
    .sort();
}

function sourceOf(path: string): string {
  const entry = SOURCES[`../../${path}`];
  if (entry === undefined) throw new Error(`no source captured for ${path}`);
  return entry;
}

/** Every layer MCP is forbidden to reach, and why it is forbidden. */
const FORBIDDEN_FOR_MCP: readonly { readonly segment: string; readonly reason: string }[] = [
  { segment: "src/specs", reason: "specialization evaluators own gameplay interpretation" },
  { segment: "src/engine", reason: "normalization and derived combat state are not transport concerns" },
  { segment: "src/simc", reason: "authority evaluation must not be reachable from a transport adapter" },
  { segment: "src/findings", reason: "findings are produced by evaluators, never by a transport" },
  { segment: "src/wcl", reason: "Warcraft Logs retrieval belongs behind the application service" },
  { segment: "src/data", reason: "runtime game data is gameplay meaning, not transport" },
];

/**
 * Every module specifier a file imports.
 *
 * Covers static `import`/`export ... from` and dynamic `import(...)`, so a
 * forbidden dependency cannot be smuggled in behind a lazy import.
 */
function importSpecifiersOf(path: string): readonly string[] {
  const source = sourceOf(path);
  const specifiers: string[] = [];
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\b[^;'"]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }
  return specifiers;
}

/** Resolves a relative specifier against its importer, so `../../engine/x` is seen for what it is. */
function resolveSpecifier(fromFile: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier;
  const fromDirectory = fromFile.slice(0, fromFile.lastIndexOf("/"));
  const segments = [...fromDirectory.split("/"), ...specifier.split("/")];
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }
  return resolved.join("/");
}

const MCP_FILES = filesUnder("src/mcp");

describe("the MCP layer exists and is being checked", () => {
  it("finds the MCP source files", () => {
    // Guards the guard: a walker that silently found nothing would make every
    // assertion below pass vacuously.
    expect(MCP_FILES.length).toBeGreaterThan(0);
    expect(MCP_FILES).toContain("src/mcp/server.ts");
    expect(MCP_FILES).toContain("src/mcp/auth.ts");
  });

  it("reads real import statements out of those files", () => {
    expect(importSpecifiersOf("src/mcp/server.ts")).toContain("@modelcontextprotocol/server");
  });
});

describe("MCP cannot reach gameplay machinery", () => {
  for (const forbidden of FORBIDDEN_FOR_MCP) {
    it(`imports nothing from ${forbidden.segment} — ${forbidden.reason}`, () => {
      for (const file of MCP_FILES) {
        for (const specifier of importSpecifiersOf(file)) {
          const resolved = resolveSpecifier(file, specifier);
          expect(`${file} -> ${resolved}`, `${file} imports ${specifier}; ${forbidden.reason}`).not.toContain(
            forbidden.segment,
          );
        }
      }
    });
  }

  it("imports only the environment type from outside src/mcp", () => {
    // Stated as an allowlist rather than only a denylist: a new cross-layer
    // dependency has to be added here deliberately, whatever layer it is from.
    const allowedOutside = new Set(["src/config/env"]);
    for (const file of MCP_FILES) {
      for (const specifier of importSpecifiersOf(file)) {
        if (!specifier.startsWith(".")) continue;
        const resolved = resolveSpecifier(file, specifier).replace(/\.js$/, "");
        if (resolved.startsWith("src/mcp/")) continue;
        expect(`${file} -> ${resolved}`).toBe(`${file} -> ${[...allowedOutside].join("|")}`);
      }
    }
  });

  it("does not invoke the analysis service in M6-A", () => {
    // M6-A proves transport only. The service is composed in M6-B and reached
    // from the real tool in M6-D; until then MCP must not call it at all.
    for (const file of MCP_FILES) {
      const source = sourceOf(file);
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(`${file}:${code.includes("analyzeFight") ? "calls" : "clean"}`).toBe(`${file}:clean`);
    }
  });
});

describe("gameplay cannot reach MCP", () => {
  const GAMEPLAY_ROOTS = ["src/specs", "src/engine", "src/simc", "src/findings", "src/services", "src/wcl"];

  for (const root of GAMEPLAY_ROOTS) {
    it(`${root} imports nothing from src/mcp`, () => {
      for (const file of filesUnder(root)) {
        for (const specifier of importSpecifiersOf(file)) {
          const resolved = resolveSpecifier(file, specifier);
          expect(`${file} -> ${resolved}`, `${file} imports ${specifier}`).not.toContain("src/mcp");
          expect(`${file} -> ${specifier}`).not.toContain("@modelcontextprotocol");
        }
      }
    });
  }

  it("keeps the M5 analysis facade free of transport dependencies", () => {
    // The property M5-E established: the facade is pure with respect to
    // transport. M6 consumes it; M6 does not get to change that.
    const specifiers = importSpecifiersOf("src/specs/rogue/assassination/observed-analysis.ts");

    for (const specifier of specifiers) {
      expect(specifier).not.toContain("@modelcontextprotocol");
      expect(specifier).not.toContain("mcp");
      expect(specifier).not.toContain("zod");
    }
  });
});

describe("the temporary probe is marked for removal", () => {
  it("says in the file that M6-D deletes it", () => {
    // The realistic failure is not that someone ships `ping` on purpose — it is
    // that nobody remembers it was temporary. The file has to say so itself.
    const source = sourceOf("src/mcp/tools/ping.ts");

    expect(source).toContain("M6-D");
    expect(source).toContain("TEMPORARY");
  });

  it("is the only tool registered", () => {
    const server = sourceOf("src/mcp/server.ts");
    const registrations = [...server.matchAll(/register\w*Tool\w*\(/g)];

    expect(registrations).toHaveLength(1);
    expect(server).toContain("registerPingTool");
  });
});
