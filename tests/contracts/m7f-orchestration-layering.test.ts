/**
 * Orchestration and the two transports stay in their lanes.
 *
 * WHAT THIS FILE DEFENDS, AND WHY STATICALLY
 *
 * M7-F's whole claim is that REST and MCP are thin adapters over ONE shared
 * runner. That claim is not about behaviour on a good day — the transport tests
 * already prove today's outputs agree. It is about what each layer is CAPABLE of,
 * and capability is decided by imports.
 *
 * Three boundaries matter here:
 *
 *   A transport cannot analyze. Neither adapter can reach an evaluator, a combat
 *   state, the aggregator or a Warcraft Logs client, so "REST and MCP agree" is
 *   structural rather than a coincidence maintained by review.
 *
 *   Orchestration cannot serialise. `src/services/**` holds no wire schema and no
 *   transport type, which is what lets the whole composition run under a plain
 *   Node test project — and what stops a field being added to the public document
 *   by a layer that has no business deciding what is public.
 *
 *   Orchestration cannot issue its own queries. It reaches Warcraft Logs only
 *   through injected ports, which is why the cost properties are testable at all.
 *
 * ONE MORE THING IT PINS: the request bounds exist in ONE module. Two transports
 * each carrying their own copy of "at most four fights" is two promises, and the
 * one that drifts becomes a way to spend more quota than the design allows.
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

const ORCHESTRATION_MODULES = [
  "src/services/raid-night-request.ts",
  "src/services/raid-night-runner.ts",
  "src/services/raid-night-ports.ts",
  "src/services/raid-night-service.ts",
] as const;

const TRANSPORT_MODULES = ["src/api/worker.ts", "src/mcp/tools/analyze-raid-night.ts"] as const;

describe("every module this file reasons about was actually captured", () => {
  it.each([...ORCHESTRATION_MODULES, ...TRANSPORT_MODULES])("%s", (path) => {
    // Guards against the whole file passing vacuously after a rename.
    expect(sourceOf(path).length).toBeGreaterThan(0);
  });
});

describe("orchestration holds no wire contract and no transport", () => {
  it.each(ORCHESTRATION_MODULES)("%s imports nothing forbidden", (path) => {
    const forbidden = ["/contracts/", "/api/", "/mcp/", "/runtime/", "zod", "@modelcontextprotocol"];
    for (const specifier of importsOf(sourceOf(path))) {
      for (const fragment of forbidden) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain(fragment);
      }
    }
  });

  it.each(ORCHESTRATION_MODULES)("%s names no public document and no transport type", (path) => {
    const code = codeOf(path);
    for (const banned of [
      "projectRaidNightResult",
      "PublicRaidNightResult",
      "structuredContent",
      "McpServer",
      "new Response",
      "new Request(",
      "new Headers(",
    ]) {
      expect(code, `${path} references ${banned}`).not.toContain(banned);
    }
  });

  it("imports nothing outside the layers M7-F is allowed to compose", () => {
    // An ALLOW-LIST, not a deny-list. A deny-list only forbids the violations
    // somebody already thought of; this fails on any new dependency at all, which
    // forces the next one to be a decision rather than an accident.
    const allowed = [
      "../aggregation/",
      "../config/env.js",
      // M7-B's reusable core and focused view, and M4 state construction. Both
      // are public composition entry points, not private internals.
      "../engine/normalization/fight-core.js",
      "../engine/state/combat-state.js",
      // M7-C factual vocabulary, by TYPE only — no client.
      "../wcl/ingest-fight.js",
      "../wcl/report-revision.js",
      "../wcl/report-roster.js",
      "../wcl/report-url.js",
      "../wcl/retrieval-plan.js",
      "../wcl/roster-snapshot.js",
      "../findings/finding.js",
      "./",
    ];
    for (const path of ORCHESTRATION_MODULES) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(
          allowed.some((prefix) => specifier.startsWith(prefix)),
          `${path} imports unexpected module ${specifier}`,
        ).toBe(true);
      }
    }
  });

  it("reaches no specialization evaluator and no SimulationCraft internals", () => {
    // The registry is the seam. Orchestration selects a registration and calls its
    // facade; importing the Rogue evaluator or the APL parser directly would put
    // gameplay interpretation one edit away from the layer that sequences requests.
    for (const path of ORCHESTRATION_MODULES) {
      for (const specifier of importsOf(sourceOf(path))) {
        for (const fragment of ["/specs/", "/simc/", "/engine/auras/", "/engine/resources/", "comparison"]) {
          expect(specifier, `${path} imports ${specifier}`).not.toContain(fragment);
        }
      }
    }
  });

  it("the service reaches Warcraft Logs only through injected ports", () => {
    // Type-only vocabulary from `src/wcl/**` is fine and necessary — failure
    // reasons, revision outcomes, the roster snapshot. A CLIENT is not: the whole
    // reason the cost properties can be counted is that nothing here can query.
    const code = codeOf("src/services/raid-night-service.ts");
    for (const banned of [
      "createReportRoster",
      "createFightCoreIngestor",
      "createReportRevisionReader",
      "createTokenCache",
      "createGraphqlClient",
      "fetch(",
    ]) {
      expect(code, `the service references ${banned}`).not.toContain(banned);
    }
  });

  it("the service performs no clock reads and no randomness", () => {
    // A raid night must be reproducible from its inputs.
    const code = codeOf("src/services/raid-night-service.ts");
    for (const banned of ["Date.now", "new Date(", "Math.random", "performance.now"]) {
      expect(code, `the service uses ${banned}`).not.toContain(banned);
    }
  });

  it("the service does not bypass the aggregation gate", () => {
    const code = codeOf("src/services/raid-night-service.ts");
    // Both, in this order: the gate produces the branded value the aggregator
    // demands, and a cast would be the one way to reach the aggregator without it.
    expect(code).toContain("verifyRaidNightInput");
    expect(code).toContain("aggregateRaidNight");
    expect(code).not.toMatch(/as unknown as VerifiedRaidNightInput/);
    expect(code).not.toMatch(/as VerifiedRaidNightInput/);
  });
});

describe("orchestration keeps one fight and one player alive at a time", () => {
  const code = codeOf("src/services/raid-night-service.ts");

  it("accumulates no fight cores and no combat states", () => {
    // THE PROPERTY: peak memory must not scale with the request. A `CombatState`
    // over a 200k-event pull is substantial — the offline NODE benchmark puts
    // twenty of them at roughly 321 MB of Node heap — so holding all of them is
    // the difference between a bounded request and an unbounded one. Cloudflare
    // documents 128 MB per isolate, and that Node number is evidence about shape
    // and order of magnitude, NOT a measurement of a Workers isolate.
    //
    // A static check, because the alternative is measuring peak memory inside a
    // Workers isolate, which this repository has not established how to do. What
    // CAN be checked is that the code contains no collection to accumulate into.
    for (const banned of [
      "NormalizedFightCore[]",
      "CombatState[]",
      "FightCoreIngestionResult[]",
      "cores.push",
      "states.push",
      "Promise.all",
    ]) {
      expect(code, `the service references ${banned}`).not.toContain(banned);
    }
  });

  it("retains only the small per-cell facts across iterations", () => {
    // What DOES survive a loop iteration: a cell of integers and tallies, and a
    // one-line processing record. That is the whole reason the M7-D projection
    // exists.
    expect(code).toContain("const cells: PlayerFightResult[] = []");
    expect(code).toContain("const fightOutcomes: FightProcessingRecord[] = []");
  });

  it("uses no persistence layer of any kind", () => {
    // M7 aggregates one explicit selection per request, deterministically. A store
    // would introduce cache coherency and cross-report identity, neither of which
    // this milestone has established.
    for (const path of ORCHESTRATION_MODULES) {
      for (const banned of ["D1Database", "KVNamespace", "R2Bucket", "DurableObject", "caches."]) {
        expect(codeOf(path), `${path} references ${banned}`).not.toContain(banned);
      }
    }
  });
});

describe("neither transport can analyze anything", () => {
  it.each(TRANSPORT_MODULES)("%s imports no engine, no analyzer and no Warcraft Logs client", (path) => {
    const forbidden = [
      "/specs/",
      "/simc/",
      "/engine/",
      "/aggregation/",
      "graphql-client",
      "token-provider",
      "paginator",
      "ingest-fight",
      "report-roster",
      "report-revision",
      "preflight",
      "analyzer-registry",
      "spec-identity",
      "raid-night-service",
      "analysis-service",
    ];
    for (const specifier of importsOf(sourceOf(path))) {
      for (const fragment of forbidden) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain(fragment);
      }
    }
  });

  it.each(TRANSPORT_MODULES)("%s builds no combat state and runs no analyzer", (path) => {
    const code = codeOf(path);
    for (const banned of [
      "createCombatState",
      "focusedFightFor",
      "aggregateRaidNight",
      "verifyRaidNightInput",
      // Calling the INJECTED runner is the whole job. Calling the service
      // FUNCTION would be assembling a pipeline, and the import check above is
      // what forbids that — a name test here would only forbid the legitimate
      // port call.
      "analyzeFight(",
      "ENABLED_ANALYZERS",
    ]) {
      expect(code, `${path} references ${banned}`).not.toContain(banned);
    }
  });

  it("the MCP tool cannot reach the REST layer, and vice versa", () => {
    // Two adapters over one runner. A dependency either way would make one the
    // owner of the other's contract.
    for (const specifier of importsOf(sourceOf("src/mcp/tools/analyze-raid-night.ts"))) {
      expect(specifier).not.toContain("/api/");
    }
    for (const specifier of importsOf(sourceOf("src/api/worker.ts"))) {
      expect(specifier).not.toContain("/mcp/tools/");
    }
  });

  it("both transports project with the SAME shared function", () => {
    // The runner returns the internal aggregate, so each transport projects. Two
    // call sites on one pure function is fine; a second projection is not.
    for (const path of ["src/api/responses.ts", "src/mcp/tools/analyze-raid-night.ts"]) {
      expect(codeOf(path), `${path} does not project`).toContain("projectRaidNightResult");
    }
  });
});

describe("the request bounds are defined once", () => {
  const LIMIT_NAMES = ["MAX_RAID_NIGHT_FIGHTS", "MAX_RAID_NIGHT_PLAYERS", "MAX_RAID_NIGHT_CELLS"] as const;

  it.each(LIMIT_NAMES)("%s is declared in exactly one module", (name) => {
    const declaring = Object.entries(SOURCES).filter(([, source]) =>
      new RegExp(`export const ${name}\\b`).test(source),
    );
    expect(declaring.map(([path]) => path)).toEqual(["../../src/services/raid-night-request.ts"]);
  });

  it("the transports import the bounds rather than restating the numbers", () => {
    // A literal `4` in a route is a second promise, and the one that drifts is
    // how a request costs more Warcraft Logs quota than the design allows.
    const tool = codeOf("src/mcp/tools/analyze-raid-night.ts");
    expect(tool).toContain("MAX_RAID_NIGHT_FIGHTS");
    expect(tool).toContain("MAX_RAID_NIGHT_PLAYERS");
    // The worker delegates entirely — it does not even mention a bound.
    expect(codeOf("src/api/worker.ts")).toContain("parseRaidNightRequest");
  });

  it("only the parser decides what a raid-night request is", () => {
    const declaring = Object.entries(SOURCES).filter(([, source]) =>
      /export function parseRaidNightRequest\b/.test(source),
    );
    expect(declaring.map(([path]) => path)).toEqual(["../../src/services/raid-night-request.ts"]);

    // And both transports use it, rather than reading fields off a body.
    for (const path of TRANSPORT_MODULES) {
      expect(codeOf(path), `${path} does not parse with the shared parser`).toContain(
        "parseRaidNightRequest",
      );
    }
  });
});

describe("the budget is charged by the transports, on one key", () => {
  it("both transports charge the cost-aware gate", () => {
    for (const path of TRANSPORT_MODULES) {
      expect(codeOf(path), `${path} does not meter`).toContain("checkAnalysisRateLimitCost");
    }
  });

  it("the key is named in exactly one module", () => {
    const declaring = Object.entries(SOURCES).filter(([, source]) =>
      /export const ANALYSIS_RATE_LIMIT_KEY\b/.test(source),
    );
    expect(declaring.map(([path]) => path)).toEqual(["../../src/runtime/rate-limit.ts"]);

    // No transport invents its own key, which is what a per-transport budget
    // would look like.
    for (const path of TRANSPORT_MODULES) {
      expect(codeOf(path)).not.toMatch(/limit\(\s*\{\s*key:/);
    }
  });

  it("orchestration cannot meter, and does not try", () => {
    // Rate limiting answers "may this caller ask", which is a property of being
    // publicly reachable rather than of analysing a night.
    for (const path of ORCHESTRATION_MODULES) {
      expect(codeOf(path), `${path} references the limiter`).not.toContain("RateLimiter");
      expect(codeOf(path)).not.toContain("checkAnalysisRateLimit");
    }
  });
});

describe("the production raid-night runner is composed in exactly one place", () => {
  it("only the composition root builds it", () => {
    const declaring = Object.entries(SOURCES).filter(([, source]) =>
      /export function createProductionRaidNightRunner\b/.test(source),
    );
    expect(declaring.map(([path]) => path)).toEqual(["../../src/runtime/analysis-composition.ts"]);
  });

  it("the composition root is the only module that calls the service", () => {
    // A second composition could disagree with the first about the same night
    // while both looked correct.
    const callers = Object.entries(SOURCES)
      .filter(([path]) => !path.includes("raid-night-service"))
      .filter(([, source]) => /from "[^"]*raid-night-service\.js"/.test(source))
      .map(([path]) => path);
    expect(callers).toEqual(["../../src/runtime/analysis-composition.ts"]);
  });
});
