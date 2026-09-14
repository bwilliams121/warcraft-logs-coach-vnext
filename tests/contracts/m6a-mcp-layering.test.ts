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

  it("reaches outside src/mcp only through an explicit allowlist", () => {
    // An allowlist rather than only a denylist: a new cross-layer dependency has
    // to be added here deliberately, whatever layer it is from.
    //
    // The MCP tool legitimately needs the public contract (it is the tool's
    // output schema and projection) and the service RESULT type (to branch on
    // ok/error). Note what is NOT here: the service's `analyzeFight` itself.
    // MCP receives a runner function from the composition root, so it can reach
    // exactly one analysis path without importing the machinery behind it.
    const allowedOutside = new Set([
      "src/config/env",
      "src/contracts/analysis-contract",
      "src/contracts/analysis-projection",
      "src/services/analysis-runner",
      "src/services/result",
      "src/runtime/rate-limit",
      "src/runtime/bearer-auth",
    ]);
    for (const file of MCP_FILES) {
      for (const specifier of importSpecifiersOf(file)) {
        if (!specifier.startsWith(".")) continue;
        const resolved = resolveSpecifier(file, specifier).replace(/\.js$/, "");
        if (resolved.startsWith("src/mcp/")) continue;
        expect(`${file} -> ${resolved}`, `${file} imports ${specifier}`).toBe(
          `${file} -> ${allowedOutside.has(resolved) ? resolved : [...allowedOutside].join("|")}`,
        );
      }
    }
  });

  it("composes no analysis of its own", () => {
    // MCP calls an injected runner. If it imported the service entry point it
    // could assemble M2 -> M3 -> M4 -> M5 itself, which is the second analysis
    // path this whole layering exists to prevent.
    for (const file of MCP_FILES) {
      const code = sourceOf(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      for (const banned of [
        "analyzeFight",
        "createCombatState",
        "ingestFight",
        "createFightIngestor",
        "createPreflight",
      ]) {
        expect(`${file}:${code.includes(banned) ? banned : "clean"}`).toBe(`${file}:clean`);
      }
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

  it("imports no composition root or limiter", () => {
    for (const file of CONTRACT_FILES) {
      for (const specifier of importSpecifiersOf(file)) {
        const resolved = resolveSpecifier(file, specifier);
        expect(`${file} -> ${resolved}`, `${file} imports ${specifier}`).not.toContain("src/runtime");
      }
    }
  });

  it("cannot read configuration or secrets", () => {
    // `src/config/env.ts` is the only door to WCL_CLIENT_ID, WCL_CLIENT_SECRET
    // and ANALYSIS_AUTH_TOKEN. A projection that cannot import it cannot leak them,
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

  it("imports nothing from src/runtime", () => {
    // The composition root knows about deployments. Nothing it composes may.
    for (const root of LOWER_ROOTS) {
      for (const file of filesUnder(root)) {
        for (const specifier of importSpecifiersOf(file)) {
          const resolved = resolveSpecifier(file, specifier);
          expect(`${file} -> ${resolved}`, `${file} imports ${specifier}`).not.toContain("src/runtime");
        }
      }
    }
  });

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

  it("imports no exposure layer", () => {
    // `src/runtime/**` is the composition root and the rate limiter. Both sit
    // ABOVE the service: one binds infrastructure to it, the other decides who
    // may reach it. A service that imported either would acquire a deployment.
    for (const file of SERVICE_FILES) {
      for (const specifier of importSpecifiersOf(file)) {
        const resolved = resolveSpecifier(file, specifier);
        expect(`${file} -> ${resolved}`, `${file} imports ${specifier}`).not.toContain("src/runtime");
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

describe("the MCP tool surface is exactly one real tool", () => {
  it("registers one tool, and it is the analysis tool", () => {
    const server = sourceOf("src/mcp/server.ts");
    const registrations = [...server.matchAll(/register\w*Tool\w*\(/g)];

    expect(registrations).toHaveLength(1);
    expect(server).toContain("registerAnalyzeWarcraftLogTool");
  });

  it("no longer carries the M6-A probe", () => {
    // Deleted with its file. A probe left registered would be a second tool a
    // model could call, and an unmetered one.
    expect(MCP_FILES).not.toContain("src/mcp/tools/ping.ts");
    for (const file of MCP_FILES) {
      expect(`${file}:${sourceOf(file).includes("registerPingTool") ? "present" : "clean"}`).toBe(
        `${file}:clean`,
      );
    }
  });

  it("exposes no low-level gameplay primitive as a tool", () => {
    // The composed analysis is the product. A tool that returned aura state or
    // evaluated an APL expression would hand a model the materials to assemble
    // its own verdict.
    const tools = MCP_FILES.filter((file) => file.startsWith("src/mcp/tools/"));

    expect(tools).toEqual(["src/mcp/tools/analyze-warcraft-log.ts"]);
  });
});
