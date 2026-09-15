/**
 * The raid-night contract layer sees a finished aggregate and nothing else.
 *
 * WHY A STATIC IMPORT CHECK
 *
 * "The public projection performs no analysis" is easy to assert about today's
 * code and impossible to keep true by review. It fails as one convenient import,
 * added to solve one real problem — a missing field fetched from WCL, a spec
 * detail read from an evaluator — and after that the contract layer has become a
 * second place where gameplay truth is decided.
 *
 * So the guarantee is enforced where it can be: the raid-night contract and
 * projection cannot REACH transport, runtime or gameplay at all.
 *
 * IT ALSO PINS THE v1 FREEZE
 *
 * `warcraft-logs-coach.analysis/1` must not acquire a dependency on the
 * raid-night contract. The direction is one-way: raid-night imports M6's
 * capability, and M6 imports nothing from raid-night.
 */

import { describe, expect, it } from "vitest";

const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

function sourceOf(path: string): string {
  const entry = SOURCES[`../../${path}`];
  if (entry === undefined) throw new Error(`no source captured for ${path}`);
  return entry;
}

/** Import specifiers only. Prose in a doc comment may legitimately name a module. */
function importsOf(source: string): readonly string[] {
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^\n]*?from\s+["']([^"']+)["']/g)].map(
    (match) => match[1] ?? "",
  );
}

/** Code with comments stripped, for assertions about what the module DOES. */
function codeOf(path: string): string {
  return sourceOf(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const RAID_NIGHT_MODULES = [
  "src/contracts/raid-night-contract.ts",
  "src/contracts/raid-night-projection.ts",
] as const;

describe("the raid-night contract layer exists and is fully covered here", () => {
  it("captured both modules", () => {
    // Guards against the file passing vacuously after a rename.
    for (const path of RAID_NIGHT_MODULES) {
      expect(sourceOf(path).length).toBeGreaterThan(0);
    }
  });
});

describe("the raid-night contract layer reaches no gameplay, transport or runtime", () => {
  it.each(RAID_NIGHT_MODULES)("%s imports nothing forbidden", (path) => {
    const forbidden = [
      "/specs/",
      "/simc/",
      "/engine/state/",
      "/engine/auras/",
      "/engine/resources/",
      "/engine/normalization/",
      "graphql-client",
      "token-provider",
      "paginator",
      "ingest-fight",
      "preflight",
      "report-roster",
      "events-query",
      "fight-context-query",
      "config/env",
      "/runtime/",
      "/api/",
      "/mcp/",
      "/services/",
    ];

    for (const specifier of importsOf(sourceOf(path))) {
      for (const fragment of forbidden) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain(fragment);
      }
    }
  });

  it.each(RAID_NIGHT_MODULES)("%s performs no I/O, clock or randomness", (path) => {
    const code = codeOf(path);
    for (const banned of ["Date.now", "new Date(", "Math.random", "fetch(", "crypto.", "performance.now"]) {
      expect(code, `${path} uses ${banned}`).not.toContain(banned);
    }
  });

  it.each(RAID_NIGHT_MODULES)("%s constructs no combat state and runs no analyzer", (path) => {
    const code = codeOf(path);
    for (const banned of [
      "createCombatState",
      "CombatState",
      "CombatFight",
      "analyzeFight",
      "analyzerForSpec",
      "resolveSpecIdentity",
      "aggregateRaidNight",
      "verifyRaidNightInput",
    ]) {
      expect(code, `${path} references ${banned}`).not.toContain(banned);
    }
  });

  it("holds no Cloudflare or transport-framework type", () => {
    for (const path of RAID_NIGHT_MODULES) {
      const source = sourceOf(path);
      for (const banned of ["ExportedHandler", "ExecutionContext", "McpServer", "structuredContent"]) {
        expect(source, `${path} mentions ${banned}`).not.toContain(banned);
      }
    }
  });

  it("depends only on the aggregation domain, the M6 capability and Zod", () => {
    const allowedPrefixes = ["../aggregation/", "./analysis-contract.js", "./raid-night-contract.js", "zod"];
    for (const path of RAID_NIGHT_MODULES) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(
          allowedPrefixes.some((prefix) => specifier.startsWith(prefix)),
          `${path} imports unexpected module ${specifier}`,
        ).toBe(true);
      }
    }
  });
});

describe("the single-fight contract is not dragged into the aggregate", () => {
  it("v1 imports nothing from the raid-night contract", () => {
    // The direction is one-way. A dependency from v1 onto raid-night would make
    // a change here able to alter the frozen single-fight contract.
    for (const path of ["src/contracts/analysis-contract.ts", "src/contracts/analysis-projection.ts"]) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("raid-night");
      }
    }
  });

  it("the raid-night contract imports the capability rather than restating it", () => {
    // A second literal is a second promise, and two promises drift.
    const contract = sourceOf("src/contracts/raid-night-contract.ts");
    expect(contract).toContain('from "./analysis-contract.js"');
    expect(contract).toContain("CapabilitySchema");
    // The literal values must appear only in M6's file.
    const code = codeOf("src/contracts/raid-night-contract.ts");
    expect(code).not.toContain("OBSERVED_DECISION_AUTHORITY_VERIFICATION");
    expect(code).not.toContain("AUTHORITY_COMPATIBLE_ONLY");
  });

  it("the projection imports the capability CONSTANT rather than building one", () => {
    const projection = sourceOf("src/contracts/raid-night-projection.ts");
    expect(projection).toContain("CAPABILITY");
    expect(codeOf("src/contracts/raid-night-projection.ts")).not.toContain("scoresPerformance:");
  });
});

describe("the projection constructs the public shape rather than passing one through", () => {
  it("never spreads the aggregate or a cell into the public shape", () => {
    const code = codeOf("src/contracts/raid-night-projection.ts");
    // `{ ...aggregate }`, `{ ...cell }` or `parse(aggregate)` would let an
    // internal field added later become public without anyone deciding.
    //
    // Matched in OBJECT position specifically: `[...aggregate.identity.x]` is a
    // defensive array copy of one named field, which is the opposite of the
    // defect — it is exactly how a readonly list is published without aliasing.
    expect(code).not.toMatch(/\{\s*\.\.\.\s*aggregate\b/);
    expect(code).not.toMatch(/\{\s*\.\.\.\s*cell\b/);
    expect(code).not.toMatch(/parse\(\s*aggregate\s*\)/);
  });

  it("builds analysisRef itself rather than reading one from the domain", () => {
    // A caller-supplied coordinate could disagree with the cell it sits on.
    const aggregation = sourceOf("src/aggregation/cell.ts");
    expect(aggregation).not.toContain("analysisRef");
    expect(codeOf("src/contracts/raid-night-projection.ts")).toContain("analysisRefFor");
  });
});
