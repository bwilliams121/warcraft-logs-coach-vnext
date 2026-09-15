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

describe("no transport exposes encounter context yet", () => {
  it("declares no /v1/encounter-context route", () => {
    const worker = codeOf("src/api/worker.ts");
    expect(worker).not.toContain("encounter-context");
    expect(worker).not.toContain("encounterContext");
  });

  it("registers no third MCP tool", () => {
    const mcp = allPaths().filter((path) => path.startsWith("src/mcp/"));
    for (const path of mcp) {
      const code = codeOf(path);
      expect(code, `${path} mentions encounter context`).not.toContain("encounter_context");
      expect(code, `${path} mentions encounter context`).not.toContain("encounterContext");
    }
    // Exactly the two existing tools, still.
    const tools = allPaths().filter((path) => path.startsWith("src/mcp/tools/"));
    expect(tools).toEqual(["src/mcp/tools/analyze-raid-night.ts", "src/mcp/tools/analyze-warcraft-log.ts"]);
  });

  it("the runtime composition wires no encounter-context runner", () => {
    expect(codeOf("src/runtime/analysis-composition.ts")).not.toContain("EncounterContext");
  });

  it("changes no rate-limit binding", () => {
    // M8-H owns admission. The limiter is untouched here.
    const runtime = codeOf("src/runtime/rate-limit.ts");
    expect(runtime).not.toContain("encounter");
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
