/**
 * The encounter-context contract projects domains that cannot see it, and no
 * transport exposes it yet.
 *
 * WHAT IS BEING PROTECTED
 *
 *   ONE DIRECTION  contracts read domains; domains never read contracts. That is
 *                  what keeps the whole application composition runnable under a
 *                  plain Node test project, and what stops a wire shape from
 *                  becoming the internal model.
 *
 *   NO TRANSPORT   M8-G ships a document and a runner, not a route. M8-H owns
 *                  REST, MCP and admission, and a premature endpoint would ship
 *                  an unmetered public surface.
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

const DOMAIN_PREFIXES = [
  "src/comparison/",
  "src/progression/",
  "src/external-context/",
  "src/encounter-context/",
  "src/aggregation/",
  "src/wcl/rankings/",
] as const;

describe("the M8-G modules exist", () => {
  it("captured the new contract, projection and service", () => {
    const paths = allPaths();
    for (const expected of [
      "src/contracts/encounter-context-contract.ts",
      "src/contracts/encounter-context-projection.ts",
      "src/services/encounter-context-request.ts",
      "src/services/encounter-context-service.ts",
    ]) {
      expect(paths, `missing ${expected}`).toContain(expected);
    }
  });
});

describe("domains never import the public contract", () => {
  it.each(DOMAIN_PREFIXES)("no module under %s imports src/contracts", (prefix) => {
    for (const path of allPaths().filter((candidate) => candidate.startsWith(prefix))) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/contracts/");
      }
    }
  });

  it("the application service imports no contract", () => {
    // The layering rule that lets the whole composition run without a wire
    // schema. Each transport projects for itself.
    for (const path of [
      "src/services/encounter-context-service.ts",
      "src/services/encounter-context-request.ts",
    ]) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/contracts/");
      }
    }
  });

  it("comparison and progression remain pure", () => {
    for (const prefix of ["src/comparison/", "src/progression/"]) {
      for (const path of allPaths().filter((candidate) => candidate.startsWith(prefix))) {
        for (const specifier of importsOf(sourceOf(path))) {
          for (const forbidden of ["/api/", "/mcp/", "/runtime/", "/contracts/", "graphql-client", "fetch"]) {
            expect(specifier, `${path} imports ${specifier}`).not.toContain(forbidden);
          }
        }
      }
    }
  });
});

describe("the public projection reaches no gameplay authority", () => {
  it("imports no specialization or SimulationCraft module", () => {
    for (const path of [
      "src/contracts/encounter-context-contract.ts",
      "src/contracts/encounter-context-projection.ts",
    ]) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/specs/");
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/simc/");
      }
    }
  });

  it("authority modules import no encounter-context contract or service", () => {
    const authority = allPaths().filter(
      (path) => path.startsWith("src/specs/") || path.startsWith("src/simc/"),
    );
    expect(authority.length).toBeGreaterThan(20);
    for (const path of authority) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("encounter-context");
        expect(specifier, `${path} imports ${specifier}`).not.toContain("external-context");
      }
    }
  });
});

describe("M8-H exposes encounter context on both transports", () => {
  // INVERTED IN M8-H, DELIBERATELY. These three assertions said "not yet" while
  // M8-G shipped a document with no transport. Publishing it is M8-H's entire
  // purpose, so the rules now pin that it IS exposed — on both transports, from
  // one composition — rather than being deleted.
  it("declares the /v1/encounter-context route", () => {
    const worker = codeOf("src/api/worker.ts");
    expect(worker).toContain('"/v1/encounter-context"');
    expect(worker).toContain("handleEncounterContext");
  });

  it("registers the third MCP tool and no more", () => {
    const tools = allPaths().filter((path) => path.startsWith("src/mcp/tools/"));
    expect(tools).toEqual([
      "src/mcp/tools/analyze-encounter-context.ts",
      "src/mcp/tools/analyze-raid-night.ts",
      "src/mcp/tools/analyze-warcraft-log.ts",
    ]);
  });

  it("the runtime composition wires exactly one encounter-context runner", () => {
    const code = codeOf("src/runtime/analysis-composition.ts");
    expect(code).toContain("createProductionEncounterContextRunner");
    // One factory, not one per transport.
    expect(code.match(/createProductionEncounterContextRunner/g)).toHaveLength(1);
  });

  it("changes no rate-limit binding or key", () => {
    // M8-H reuses the existing shared budget. A new key would give a caller a
    // second allowance and reopen the bypass one shared key exists to close.
    const runtime = codeOf("src/runtime/rate-limit.ts");
    expect(runtime).not.toContain("encounter");
    expect(runtime).toContain('ANALYSIS_RATE_LIMIT_KEY = "analysis:warcraft_log"');
  });

  it("charges admission only at the transport boundary", () => {
    // The double-charge guard. No limiter call may appear in the application
    // composition; if one did, a nested raid night would be metered twice.
    for (const path of [
      "src/services/encounter-context-service.ts",
      "src/services/raid-night-service.ts",
      "src/runtime/analysis-composition.ts",
    ]) {
      expect(codeOf(path), `${path} charges the limiter`).not.toContain("checkAnalysisRateLimit");
    }
    // And exactly the two public adapters do charge it.
    const chargers = allPaths().filter(
      (path) => codeOf(path).includes("checkAnalysisRateLimitCost") && !path.includes("rate-limit.ts"),
    );
    expect(chargers.sort()).toEqual([
      "src/api/worker.ts",
      "src/mcp/tools/analyze-encounter-context.ts",
      "src/mcp/tools/analyze-raid-night.ts",
    ]);
  });
});

describe("the new contract carries no clock, randomness or scoring", () => {
  const CONTRACT_MODULES = [
    "src/contracts/encounter-context-contract.ts",
    "src/contracts/encounter-context-projection.ts",
  ];

  it.each(CONTRACT_MODULES)("%s reads no clock and generates no id", (path) => {
    const code = codeOf(path);
    for (const banned of [
      "Date.now",
      "new Date(",
      "Math.random",
      "crypto.",
      "randomUUID",
      "performance.now",
    ]) {
      expect(code, `${path} uses ${banned}`).not.toContain(banned);
    }
  });

  it.each(CONTRACT_MODULES)("%s declares no retrieval-time or generated field", (path) => {
    const pattern = /\b\w*(?:retrievedAt|generatedAt|requestId|uuid)\w*\s*[?]?\s*:/i;
    const found = pattern.exec(codeOf(path));
    expect(found?.[0] ?? null, `${path} declares ${String(found?.[0])}`).toBeNull();
  });

  it("declares no scoring or ranking field", () => {
    // Declarations only. The capability object legitimately NAMES what it
    // refuses to publish, and a scan that could not tell those apart would have
    // to be weakened to stay quiet.
    const code = codeOf("src/contracts/encounter-context-contract.ts");
    for (const banned of [
      "score:",
      "rating:",
      "accuracy:",
      "grade:",
      "rank:",
      "rankPercent:",
      "percentile:",
      "amount:",
      "parseScore:",
      "progressPercentage:",
      "phaseProgress:",
      "furthestPhase:",
    ]) {
      expect(code, `the contract declares ${banned}`).not.toContain(banned);
    }
  });

  it("publishes no raw percentage field", () => {
    const code = codeOf("src/contracts/encounter-context-contract.ts");
    expect(code).not.toContain("bossPercentageRaw");
    expect(code).not.toContain("fightPercentageRaw");
  });

  it("keeps the raw percentages available internally", () => {
    // Held back from the wire, not deleted. A later checkpoint that settles the
    // scale can publish them without re-deriving anything.
    const facts = codeOf("src/engine/normalization/encounter-facts.ts");
    expect(facts).toContain("bossPercentageRaw");
    expect(facts).toContain("fightPercentageRaw");
  });
});

describe("the existing frozen contracts are untouched", () => {
  it("still declares exactly the two existing schema versions", () => {
    expect(codeOf("src/contracts/analysis-contract.ts")).toContain("warcraft-logs-coach.analysis/1");
    expect(codeOf("src/contracts/raid-night-contract.ts")).toContain("warcraft-logs-coach.raid-night/1");
  });

  it("the new contract does not redefine an existing version constant", () => {
    const code = codeOf("src/contracts/encounter-context-contract.ts");
    expect(code).not.toContain("PUBLIC_ANALYSIS_SCHEMA_VERSION =");
    expect(code).not.toContain("PUBLIC_RAID_NIGHT_SCHEMA_VERSION =");
  });
});
