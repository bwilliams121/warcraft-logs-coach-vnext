/**
 * M8-C context stays out of the frozen wire contracts and out of the M8-B
 * domain.
 *
 * Three boundaries, each protecting something different:
 *
 *   WIRE      `analysis/1` and `raid-night/1` are frozen. M8-G owns the public
 *             surface for encounter facts, and the way a frozen contract
 *             actually breaks is that somebody adds "just one useful field"
 *             because the data is already in scope.
 *
 *   DOMAIN    `src/comparison/` is pure. It must not learn to read a normalized
 *             fight, which would give it the retrieval dependency M8-B removed
 *             on purpose. (The general rule is asserted in
 *             `m8b-comparison-layering.test.ts`; this pins the specific module.)
 *
 *   ANALYSIS  no specialization or SimulationCraft module may read the facts.
 *             `focusedFightFor` already withholds them structurally, but an
 *             import is how that would be routed around.
 */

import { describe, expect, it } from "vitest";

import {
  PUBLIC_ANALYSIS_SCHEMA_VERSION,
  PublicAnalysisResultSchema,
} from "../../src/contracts/analysis-contract.js";
import { PUBLIC_RAID_NIGHT_SCHEMA_VERSION } from "../../src/contracts/raid-night-contract.js";

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

/** The names that would signal an M8-C fact had leaked into a layer. */
const FACT_NAMES = [
  "encounterOutcome",
  "bossPercentageRaw",
  "fightPercentageRaw",
  "lastPhaseAsAbsoluteIndex",
  "lastPhaseIsIntermission",
  "wipeCalledReportTimeMs",
] as const;

const FACT_MODULE = "encounter-facts";

describe("the frozen wire contracts are unchanged", () => {
  it("still declares the /1 schema versions", () => {
    expect(PUBLIC_ANALYSIS_SCHEMA_VERSION).toBe("warcraft-logs-coach.analysis/1");
    expect(PUBLIC_RAID_NIGHT_SCHEMA_VERSION).toBe("warcraft-logs-coach.raid-night/1");
  });

  const CONTRACT_MODULES = allPaths().filter((path) => path.startsWith("src/contracts/"));

  it("captured the contract modules", () => {
    expect(CONTRACT_MODULES).toEqual([
      "src/contracts/analysis-contract.ts",
      "src/contracts/analysis-projection.ts",
      "src/contracts/raid-night-contract.ts",
      "src/contracts/raid-night-projection.ts",
    ]);
  });

  it.each(CONTRACT_MODULES)("%s does not import the encounter-facts module", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain(FACT_MODULE);
    }
  });

  it.each(CONTRACT_MODULES)("%s names no M8-C fact", (path) => {
    const code = codeOf(path);
    for (const name of FACT_NAMES) {
      expect(code, `${path} names ${name}`).not.toContain(name);
    }
  });

  it("the analysis schema rejects an unknown encounter field", () => {
    // Proves the freeze is enforced by the schema rather than by habit: a
    // document carrying a new field is not silently accepted.
    const document = {
      schemaVersion: PUBLIC_ANALYSIS_SCHEMA_VERSION,
      status: "SPEC_NOT_SUPPORTED",
      bossPercentage: 0.04,
    };
    expect(PublicAnalysisResultSchema.safeParse(document).success).toBe(false);
  });
});

describe("no analysis-side module can read the encounter facts", () => {
  const ANALYSIS_MODULES = allPaths().filter(
    (path) => path.startsWith("src/specs/") || path.startsWith("src/simc/"),
  );

  it("found analysis modules to check", () => {
    expect(ANALYSIS_MODULES.length).toBeGreaterThan(20);
  });

  it.each(ANALYSIS_MODULES)("%s does not import the encounter-facts module", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain(FACT_MODULE);
    }
  });

  it("no specialization or SimulationCraft module names an M8-C fact", () => {
    const code = ANALYSIS_MODULES.map(codeOf).join("\n");
    for (const name of FACT_NAMES) {
      expect(code, `an analysis module names ${name}`).not.toContain(name);
    }
  });
});

describe("the M8-B comparison domain stays pure", () => {
  const COMPARISON_MODULES = allPaths().filter((path) => path.startsWith("src/comparison/"));

  it("found the comparison domain", () => {
    expect(COMPARISON_MODULES.length).toBeGreaterThan(0);
  });

  it.each(COMPARISON_MODULES)("%s does not import the encounter-facts module", (path) => {
    // M8-D will adapt these facts into the M8-B domain from OUTSIDE it. The
    // domain itself must keep taking plain values and no retrieval dependency.
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain(FACT_MODULE);
    }
  });
});

describe("the facts are not on the analyzer-facing fight type", () => {
  it("combat-fight.ts declares no encounter-outcome or zone field", () => {
    // `CombatFight` is what M4 and M5 receive. The isolation is structural: the
    // type has no such field, so no analyzer can reach one.
    const code = codeOf("src/engine/normalization/combat-fight.ts");
    for (const name of [...FACT_NAMES, "ZoneMetadata"]) {
      expect(code, `combat-fight.ts declares ${name}`).not.toContain(name);
    }
  });

  it("fight-core.ts carries them, so the facts do exist somewhere", () => {
    // Guards the check above against passing because the feature was deleted.
    const code = codeOf("src/engine/normalization/fight-core.ts");
    expect(code).toContain("encounterOutcome");
    expect(code).toContain("ZoneMetadata");
  });
});
