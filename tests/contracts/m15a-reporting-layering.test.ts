import { describe, expect, it } from "vitest";

/**
 * M15-A layering: finding aggregation and prioritization reads restated
 * structured findings and nothing else.
 *
 *   src/reporting/   imports only itself, the evidence locator type, the
 *                    observed-decision view type, the preparation status
 *                    type and kind list; never the post-hoc comparison-facts
 *                    domain, whose one outside reader stays src/diagnosis/
 *   importers        since M15-B only the analysis service (which builds the
 *                    TLDR beside the result) and the service result type;
 *                    never an analyzer, SimulationCraft, finding, shared
 *                    analysis, role, diagnosis or Warcraft Logs module, and
 *                    not the public projection (it reads the TLDR through
 *                    the result type)
 *   no raw data      no Warcraft Logs, combat state or normalization import,
 *                    so reporting cannot inspect raw data to invent a finding
 */

const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});
const paths = Object.keys(SOURCES)
  .map((key) => key.replace(/^\.\.\/\.\.\//, ""))
  .sort();
const sourceOf = (path: string): string => SOURCES[`../../${path}`] ?? "";

const importsOf = (source: string): string[] =>
  [
    ...source.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gms),
    ...source.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
    ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1] as string);

function resolve(from: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier;
  const parts = from.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/").replace(/\.js$/, ".ts");
}

const REPORTING = paths.filter((path) => path.startsWith("src/reporting/"));

describe("finding prioritization's place in the tree", () => {
  it("found every reporting module", () => {
    expect(REPORTING).toEqual([
      "src/reporting/aggregation-config.ts",
      "src/reporting/finding-record.ts",
      "src/reporting/prioritization.ts",
      "src/reporting/restatement.ts",
      "src/reporting/tldr.ts",
    ]);
  });

  it("reads only restated-finding inputs, never raw data or an evaluator", () => {
    for (const path of REPORTING) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(resolve(path, specifier), `${path} imports ${specifier}`).toMatch(
          /^src\/reporting\/|^src\/engine\/evidence\/locator\.ts$|^src\/findings\/observed-decision-view\.ts$|^src\/analysis\/preparation\/consumable-status\.ts$|^src\/data\/game\/preparation-consumables\.ts$/,
        );
      }
    }
  });

  it("imports the producers' types only, except the preparation kind list", () => {
    const runtime = REPORTING.flatMap((path) =>
      [...sourceOf(path).matchAll(/^import\s+(?!type\b)[^;]*?\bfrom\s*["']([^"']+)["']/gms)]
        .map((match) => resolve(path, match[1] as string))
        .filter((target) => !target.startsWith("src/reporting/"))
        .map((target) => `${path} -> ${target}`),
    );
    expect(runtime).toEqual(["src/reporting/restatement.ts -> src/data/game/preparation-consumables.ts"]);
  });

  it("is imported only by the analysis service and the service result type (M15-B)", () => {
    const edges = paths.flatMap((path) =>
      path.startsWith("src/reporting/")
        ? []
        : importsOf(sourceOf(path))
            .map((specifier) => resolve(path, specifier))
            .filter((target) => target.startsWith("src/reporting/"))
            .map((target) => `${path} -> ${target}`),
    );
    expect(edges).toEqual([
      "src/services/analysis-service.ts -> src/reporting/tldr.ts",
      "src/services/result.ts -> src/reporting/tldr.ts",
    ]);
  });

  it("names no confidence, severity, score or impact field", () => {
    for (const path of REPORTING)
      expect(sourceOf(path), path).not.toMatch(
        /readonly (confidence|severity|score|impact)\s*:\s*(number|string)/,
      );
  });
});
