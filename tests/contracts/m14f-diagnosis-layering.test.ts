import { describe, expect, it } from "vitest";

/**
 * M14-F layering: the reviewed diagnosis projection is the ONE module that
 * reads both the authority side (the registration's observed-decision view)
 * and the post-hoc comparison-facts domain. It runs after a result is final
 * and feeds nothing back:
 *
 *   src/diagnosis/   imports only itself, the post-hoc modules it combines,
 *                    the evidence locator type and the observed-decision view
 *   importers        only the analysis service (which attaches the outcome
 *                    beside the result), the service result type, and the
 *                    public projection
 *   authority        no analyzer, SimulationCraft, finding, shared analysis
 *                    or role module imports it
 *
 * and the deployed composition supplies no comparison evidence.
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

const DIAGNOSIS = paths.filter((path) => path.startsWith("src/diagnosis/"));
const edgesInto = (prefix: string) =>
  paths.flatMap((path) =>
    importsOf(sourceOf(path))
      .map((specifier) => resolve(path, specifier))
      .filter((target) => target.startsWith(prefix))
      .map((target) => `${path} -> ${target}`),
  );

describe("the diagnosis projection's place in the tree", () => {
  it("found every diagnosis module", () => {
    expect(DIAGNOSIS).toEqual([
      "src/diagnosis/decision-evidence.ts",
      "src/diagnosis/diagnosis.ts",
      "src/diagnosis/vocabulary.ts",
    ]);
  });

  it("reads only the post-hoc modules it combines, the locator type and the observed-decision view", () => {
    for (const path of DIAGNOSIS) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(resolve(path, specifier), `${path} imports ${specifier}`).toMatch(
          /^src\/diagnosis\/|^src\/comparison-facts\/(causal-linkage|damage-delta|fight-facts|strategy-context|timing-alignment)\.ts$|^src\/engine\/evidence\/locator\.ts$|^src\/findings\/observed-decision-view\.ts$/,
        );
      }
    }
  });

  it("is imported only by the analysis service, the service result type and the public projection", () => {
    expect(edgesInto("src/diagnosis/").filter((edge) => !edge.startsWith("src/diagnosis/"))).toEqual([
      "src/contracts/analysis-projection.ts -> src/diagnosis/diagnosis.ts",
      "src/services/analysis-service.ts -> src/diagnosis/diagnosis.ts",
      "src/services/result.ts -> src/diagnosis/diagnosis.ts",
    ]);
  });

  it("no analyzer, SimulationCraft, finding, shared analysis or role module reaches it", () => {
    const authority = paths.filter((path) =>
      /^src\/(simc|specs|findings|analysis|engine|healing|support|raid-plan|aggregation)\//.test(path),
    );
    for (const path of authority) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(resolve(path, specifier), `${path} imports ${specifier}`).not.toMatch(/^src\/diagnosis\//);
      }
    }
  });

  it("the service diagnoses only after the analyzer ran, and attaches the outcome to the envelope alone", () => {
    const service = sourceOf("src/services/analysis-service.ts");
    const ran = service.indexOf("const run = runAnalyzer(");
    const diagnosed = service.indexOf("await diagnosisFor(");
    expect(ran).toBeGreaterThan(0);
    expect(diagnosed).toBeGreaterThan(ran);
    // The outcome's one use: spread into the FightAnalysis, after the analysis it sits beside.
    const attached = service.indexOf("...(diagnosis === null ? {} : { diagnosis }),");
    expect(attached).toBeGreaterThan(diagnosed);
    expect(service.slice(diagnosed).match(/[(,]\s*diagnosis\s*[,)]/g)).toBeNull();
  });

  it("the deployed composition supplies no comparison evidence", () => {
    const wiring = paths.filter(
      (path) => path !== "src/services/analysis-service.ts" && /\bcomparisonEvidence\b/.test(sourceOf(path)),
    );
    expect(wiring).toEqual([]);
  });
});
