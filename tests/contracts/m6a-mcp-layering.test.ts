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

/**
 * The public contract (M6-C) sits above the application service and below every
 * transport. It publishes a shape; it does not fetch, route, authenticate or
 * evaluate.
 *
 * The most valuable property here is what it CANNOT do. The projection receives
 * an analysis result and returns data — it never sees `Env`, so there is no path
 * by which a Warcraft Logs credential or the MCP token could reach a public
 * payload. That is worth enforcing structurally rather than trusting.
 */
describe("the public contract stays transport-neutral and secret-free", () => {
  const CONTRACT_FILES = filesUnder("src/contracts");

  it("finds the contract source files", () => {
    expect(CONTRACT_FILES).toContain("src/contracts/analysis-contract.ts");
    expect(CONTRACT_FILES).toContain("src/contracts/analysis-projection.ts");
  });

  it("imports no transport", () => {
    for (const file of CONTRACT_FILES) {
      for (const specifier of importSpecifiersOf(file)) {
        const resolved = resolveSpecifier(file, specifier);
        for (const forbidden of [
          "src/mcp",
          "src/api",
          "@modelcontextprotocol",
          "cloudflare:",
          "@cloudflare/",
        ]) {
          expect(`${file} -> ${resolved}`, `${file} imports ${specifier}`).not.toContain(forbidden);
        }
      }
    }
  });

  it("cannot read configuration or secrets", () => {
    // `src/config/env.ts` is the only door to WCL_CLIENT_ID, WCL_CLIENT_SECRET
    // and MCP_AUTH_TOKEN. A projection that cannot import it cannot leak them,
    // whatever a future field is called.
    for (const file of CONTRACT_FILES) {
      for (const specifier of importSpecifiersOf(file)) {
        const resolved = resolveSpecifier(file, specifier);
        expect(`${file} -> ${resolved}`, `${file} imports ${specifier}`).not.toContain("src/config");
      }
    }
  });

  it("names no Cloudflare or HTTP runtime type", () => {
    const banned = ["ExecutionContext", "ExportedHandler", "new Response", "new Request", "Headers("];
    for (const file of CONTRACT_FILES) {
      const code = sourceOf(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      for (const token of banned) {
        expect(`${file}:${code.includes(token) ? token : "clean"}`).toBe(`${file}:clean`);
      }
    }
  });

  it("reads no clock and generates no identifier", () => {
    // Determinism is a contract property: the same analysis must project to the
    // same bytes. A timestamp or a random id would make two identical analyses
    // differ, and would put transport metadata into an analysis-truth payload.
    const banned = ["Date.now", "new Date", "Math.random", "randomUUID", "crypto."];
    for (const file of CONTRACT_FILES) {
      const code = sourceOf(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      for (const token of banned) {
        expect(`${file}:${code.includes(token) ? token : "clean"}`).toBe(`${file}:clean`);
      }
    }
  });

  it("declares the schema without importing any internal analysis type", () => {
    // `export type PublicDecision = ObservedActionComparison` would couple every
    // consumer to M5's object layout and make an internal refactor a breaking
    // wire change. The schema is declared from scratch and its types inferred,
    // so the contract cannot re-export an internal shape — it never imports one.
    //
    // Asserted on the IMPORT LIST rather than on raw text, because the public
    // names deliberately echo the internal concepts they describe.
    const specifiers = importSpecifiersOf("src/contracts/analysis-contract.ts");

    expect([...specifiers].sort()).toEqual(["../findings/finding.js", "zod"]);
  });

  it("keeps the projection's reach narrow and explicit", () => {
    // The projection legitimately reads domain types. Pinning the exact list
    // means a new dependency is a decision rather than a drift.
    const specifiers = importSpecifiersOf("src/contracts/analysis-projection.ts");

    expect([...specifiers].sort()).toEqual([
      "../engine/evidence/locator.js",
      "../services/analyzer-registry.js",
      "../services/result.js",
      "./analysis-contract.js",
    ]);
  });
});

describe("nothing below the contract may import it", () => {
  const LOWER_ROOTS = ["src/specs", "src/engine", "src/simc", "src/findings", "src/services", "src/wcl"];

  for (const root of LOWER_ROOTS) {
    it(`${root} imports nothing from src/contracts`, () => {
      for (const file of filesUnder(root)) {
        for (const specifier of importSpecifiersOf(file)) {
          const resolved = resolveSpecifier(file, specifier);
          expect(`${file} -> ${resolved}`, `${file} imports ${specifier}`).not.toContain("src/contracts");
        }
      }
    });
  }

  it("keeps zod out of every layer below the contract", () => {
    // Zod is a wire-shape tool. Below the contract there is no wire.
    for (const root of LOWER_ROOTS) {
      for (const file of filesUnder(root)) {
        for (const specifier of importSpecifiersOf(file)) {
          expect(`${file} -> ${specifier}`).not.toContain("zod");
        }
      }
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

/**
 * The application service composes M2 -> M3 -> M4 -> M5 (M6-B). Its value is
 * that BOTH transports can call it and get identical gameplay truth, and that
 * property only survives while the service cannot see a transport.
 *
 * Enforced structurally rather than by convention: the `node` Vitest project
 * already runs these modules with no Workers runtime present, so an accidental
 * transport import shows up as a broken test rather than as a service that
 * quietly only works in one place.
 */
describe("the application service stays transport-neutral", () => {
  const SERVICE_FILES = filesUnder("src/services");

  it("finds the service source files", () => {
    expect(SERVICE_FILES).toContain("src/services/analysis-service.ts");
    expect(SERVICE_FILES).toContain("src/services/analyzer-registry.ts");
    expect(SERVICE_FILES).toContain("src/services/spec-identity.ts");
  });

  it("imports no transport layer", () => {
    for (const file of SERVICE_FILES) {
      for (const specifier of importSpecifiersOf(file)) {
        const resolved = resolveSpecifier(file, specifier);
        for (const forbidden of ["src/mcp", "src/api", "@modelcontextprotocol"]) {
          expect(`${file} -> ${resolved}`, `${file} imports ${specifier}`).not.toContain(forbidden);
        }
      }
    }
  });

  it("imports no public contract", () => {
    // The direction that must not invert. `src/contracts` sits ABOVE the
    // service and reads its types; a service that imported the wire contract
    // back would acquire a public shape it is supposed to be free of, and
    // changing the contract would start meaning changing the analyzer's caller.
    for (const file of SERVICE_FILES) {
      for (const specifier of importSpecifiersOf(file)) {
        const resolved = resolveSpecifier(file, specifier);
        expect(`${file} -> ${resolved}`, `${file} imports ${specifier}`).not.toContain("src/contracts");
      }
    }
  });

  it("imports no schema library", () => {
    // Zod belongs to the PUBLIC wire contract, which is a later milestone and a
    // separate boundary. A validation library inside the service would pull a
    // wire shape into the layer whose whole job is not to have one.
    for (const file of SERVICE_FILES) {
      for (const specifier of importSpecifiersOf(file)) {
        expect(`${file} -> ${specifier}`).not.toContain("zod");
      }
    }
  });

  it("names no Cloudflare runtime type", () => {
    // `Request`/`Response`/`ExecutionContext` are the transport's vocabulary.
    // The service speaks in requests it parsed and results it produced.
    const banned = ["cloudflare:", "@cloudflare/", "ExecutionContext", "ExportedHandler"];
    for (const file of SERVICE_FILES) {
      const code = sourceOf(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      for (const token of banned) {
        expect(`${file}:${code.includes(token) ? token : "clean"}`).toBe(`${file}:clean`);
      }
    }
  });

  it("reaches gameplay only through the analyzer registry", () => {
    // One file names a specialization evaluator. Everything else asks the
    // registry — which is what keeps `if (spec === ...)` from spreading through
    // the service as more analyzers land.
    const importers = SERVICE_FILES.filter((file) =>
      importSpecifiersOf(file).some((specifier) => resolveSpecifier(file, specifier).includes("src/specs")),
    );

    expect(importers).toEqual(["src/services/analyzer-registry.ts"]);
  });

  it("branches on no specialization by name", () => {
    // Dispatch is a registry lookup. A hard-coded spec comparison in the
    // service would be the first of the forty.
    for (const file of SERVICE_FILES) {
      if (file === "src/services/spec-identity.ts" || file === "src/services/analyzer-registry.ts") continue;
      const code = sourceOf(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(`${file}:${code.includes("rogue/assassination") ? "hardcoded" : "clean"}`).toBe(`${file}:clean`);
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
