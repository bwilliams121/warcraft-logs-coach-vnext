/**
 * The production composition, and the 501 that must never come back.
 *
 * WHAT THIS GUARDS
 *
 * M6-E's whole point is that the deployed Worker reaches real analysis. That is
 * a claim about wiring, and wiring is exactly the kind of thing a later
 * refactor removes by accident — a dependency dropped "temporarily", an import
 * tidied away — leaving an endpoint that still responds and no longer analyses.
 *
 * These assertions are structural rather than behavioural because the real path
 * cannot be exercised offline: invoking it would contact Warcraft Logs. So the
 * tests check that the composition root binds what it must, that no transport
 * builds a second one, and that the retired placeholder cannot return.
 *
 * NO NETWORK. Nothing here calls the runner it inspects.
 */

import { describe, expect, it } from "vitest";

import { createProductionAnalysisRunner } from "../../src/runtime/analysis-composition.js";
import { SERVICE_ERROR_CODES } from "../../src/services/result.js";
import { API_ERROR_CODES } from "../../src/api/responses.js";

/** Source text for every file, read at build time. */
const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

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

function codeOf(path: string): string {
  return sourceOf(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("the production composition root binds the real pieces", () => {
  const composition = "src/runtime/analysis-composition.ts";

  it("exists and produces a runner without touching the network", () => {
    // Constructing it must be inert: the factories it calls bind transports,
    // they do not use them. If this ever performed I/O, the test would hang or
    // fail against the pool's blocked outbound.
    const runner = createProductionAnalysisRunner({ ENVIRONMENT: "test" });

    expect(typeof runner).toBe("function");
  });

  it("binds real Warcraft Logs preflight", () => {
    // The CALL, not the import. A leftover import with no call site would
    // satisfy a looser check while the binding was gone.
    expect(codeOf(composition)).toContain("createPreflight({");
  });

  it("binds the real M3 ingestor", () => {
    // THE M6-E BINDING. If this disappears, the deployed Worker silently stops
    // retrieving combat events — which is the exact state M6-B/M6-D were in.
    expect(codeOf(composition)).toContain("createFightIngestor({");
  });

  it("passes both into the one application service", () => {
    const code = codeOf(composition);

    expect(code).toContain("analyzeFight");
    expect(code).toContain("preflight");
    expect(code).toContain("ingest");
  });

  it("shares one OAuth token cache between preflight and ingestion", () => {
    // Two caches would mean two token exchanges per analysis, against the same
    // finite quota the rate limiter exists to protect.
    const code = codeOf(composition);

    expect(code).toContain("createTokenCache");
    expect(code.match(/createTokenCache\(\)/g)).toHaveLength(1);
  });

  it("adds no second GraphQL client, OAuth flow or retry policy", () => {
    // It binds existing factories. Anything it constructed itself would be a
    // parallel transport that can drift from the one M2 and M3 established.
    //
    // Binding the global `fetch` is NOT such a construction — it is the same
    // one-line binding `wclPreflight` already does, and it is how a port gets a
    // transport at all. What must be absent is a second CLIENT built on top.
    const code = codeOf(composition);

    for (const banned of ["createGraphqlClient", "createTokenProvider", "ingestFight(", "paginate"]) {
      expect(`${banned}:${code.includes(banned) ? "present" : "clean"}`).toBe(`${banned}:clean`);
    }
  });
});

describe("there is exactly one production composition", () => {
  it("is built in one place", () => {
    // Files that CALL the ingestor factory, excluding the module that defines
    // it — a definition is not a composition.
    const callers = Object.keys(SOURCES)
      .map((key) => key.replace(/^\.\.\/\.\.\//, ""))
      .filter((file) => file !== "src/wcl/ingest-fight.ts")
      .filter((file) => codeOf(file).includes("createFightIngestor("));

    expect(callers).toEqual(["src/runtime/analysis-composition.ts"]);
  });

  it("is not rebuilt inside either transport", () => {
    // A transport that composed its own runner could disagree with the other
    // about the same fight while both looked correct.
    for (const file of [...filesUnder("src/mcp"), ...filesUnder("src/api")]) {
      const code = codeOf(file);
      for (const banned of ["createFightIngestor", "createPreflight", "createTokenCache", "analyzeFight"]) {
        expect(`${file}:${code.includes(banned) ? banned : "clean"}`).toBe(`${file}:clean`);
      }
    }
  });

  it("gives REST and MCP the same runner type from the application layer", () => {
    // MCP owned this abstraction while it was MCP's alone. Now REST consumes it
    // too, and an API that imported MCP to obtain the type would make MCP the
    // owner of REST's contract.
    expect(codeOf("src/api/worker.ts")).toContain("services/analysis-runner.js");
    for (const file of filesUnder("src/api")) {
      expect(`${file}:${codeOf(file).includes("mcp/tools/") ? "imports-mcp-tool" : "clean"}`).toBe(
        `${file}:clean`,
      );
    }
  });
});

describe("the retired not-implemented placeholder cannot return", () => {
  it("appears nowhere in production source", () => {
    // It meant "the engine works but nobody connected it". Ingestion is a
    // required dependency now, so that state is a compile error — and the code
    // that used to express it must not linger where someone could reuse it.
    for (const [key, source] of Object.entries(SOURCES)) {
      const file = key.replace(/^\.\.\/\.\.\//, "");
      expect(`${file}:${source.includes("ANALYSIS_NOT_IMPLEMENTED") ? "present" : "clean"}`).toBe(
        `${file}:clean`,
      );
    }
  });

  it("is absent from both error vocabularies", () => {
    expect([...SERVICE_ERROR_CODES]).not.toContain("ANALYSIS_NOT_IMPLEMENTED");
    expect([...API_ERROR_CODES]).not.toContain("ANALYSIS_NOT_IMPLEMENTED");
  });

  it("leaves no route able to answer 501", () => {
    // The status itself, not just the code name. A different error mapped to
    // 501 would recreate the same misleading answer.
    for (const file of filesUnder("src/api")) {
      expect(`${file}:${codeOf(file).includes("501") ? "maps-501" : "clean"}`).toBe(`${file}:clean`);
    }
  });

  it("makes ingestion a required service dependency", () => {
    const code = codeOf("src/services/analysis-service.ts");

    expect(code).toContain("readonly ingest: CombatIngestionPort;");
    expect(code).not.toContain("ingest?");
  });
});

describe("the runtime layer stays a composition root, not a second application", () => {
  const RUNTIME_FILES = filesUnder("src/runtime");

  it("contains only composition and exposure concerns", () => {
    // Composition, plus the two things that decide who may reach it and how
    // fast. Nothing that analyses anything.
    expect(RUNTIME_FILES).toEqual([
      "src/runtime/analysis-composition.ts",
      "src/runtime/bearer-auth.ts",
      "src/runtime/rate-limit.ts",
    ]);
  });

  it("imports no transport", () => {
    for (const file of RUNTIME_FILES) {
      const code = codeOf(file);
      for (const banned of ["src/mcp", "src/api", "../mcp/", "../api/", "@modelcontextprotocol"]) {
        expect(`${file}:${code.includes(banned) ? banned : "clean"}`).toBe(`${file}:clean`);
      }
    }
  });

  it("imports no gameplay evaluator", () => {
    // It binds infrastructure to the application service. It must not know what
    // a Rogue is.
    for (const file of RUNTIME_FILES) {
      const code = codeOf(file);
      for (const banned of ["src/specs", "../specs/", "../engine/", "../simc/"]) {
        expect(`${file}:${code.includes(banned) ? banned : "clean"}`).toBe(`${file}:clean`);
      }
    }
  });

  it("keeps the limiter and the bearer gate out of the application service", () => {
    // Both answer "may this caller reach this endpoint", which is a property of
    // being publicly exposed. The service produces the same analysis whoever
    // asked and however often.
    for (const file of [...filesUnder("src/services"), ...filesUnder("src/contracts")]) {
      const code = codeOf(file);
      for (const banned of [
        "RateLimiter",
        "rate-limit",
        "ANALYSIS_RATE_LIMITER",
        "bearer-auth",
        "ANALYSIS_AUTH_TOKEN",
      ]) {
        expect(`${file}:${code.includes(banned) ? banned : "clean"}`).toBe(`${file}:clean`);
      }
    }
  });
});
