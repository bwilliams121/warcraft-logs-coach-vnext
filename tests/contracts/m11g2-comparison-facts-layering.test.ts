import { describe, expect, it } from "vitest";

/**
 * M11-G2 layering (test W): the post-hoc comparison-facts domain and the
 * comparison capture are POST-HOC tooling. They may read the completed fight,
 * so nothing that settles a decision may read them:
 *
 *   src/comparison-facts/   imports only itself, engine evidence, the E1
 *                           combat facts, the capability vocabulary and the
 *                           comparison-table decoder; nothing outside it
 *                           imports it
 *   src/wcl/comparison/     imports only the WCL decode helpers; only the
 *                           comparison-facts domain imports it
 *   Blood post-hoc data     imports no post-hoc module
 *
 * and no G2 module has anywhere to write a judgement, a ceiling, a window
 * valuation, a hit-type meaning or a hostility claim.
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

/** Every specifier: `from "x"`, side-effect `import "x"`, dynamic `import("x")`. */
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

const FACTS = paths.filter((path) => path.startsWith("src/comparison-facts/"));
const CAPTURE = paths.filter((path) => path.startsWith("src/wcl/comparison/"));
const BLOOD_DEFINITION = "src/specs/deathknight/blood/post-hoc-definition.ts";
const importersOf = (prefix: string) =>
  paths.flatMap((path) =>
    importsOf(sourceOf(path))
      .map((specifier) => resolve(path, specifier))
      .filter((target) => target.startsWith(prefix))
      .map((target) => `${path} -> ${target}`),
  );

describe("W: post-hoc G2 modules cannot feed authority", () => {
  it("found every G2 module", () => {
    expect(FACTS).toEqual([
      "src/comparison-facts/cast-facts.ts",
      // M14-E: causal evidence linkage, under the same post-hoc rules.
      "src/comparison-facts/causal-linkage.ts",
      // M14-B: multi-log consensus, under the same post-hoc rules.
      "src/comparison-facts/consensus.ts",
      "src/comparison-facts/cooldown-windows.ts",
      // M14-D: damage-delta decomposition, under the same post-hoc rules.
      "src/comparison-facts/damage-delta.ts",
      "src/comparison-facts/damage-ledger.ts",
      "src/comparison-facts/environment-profile.ts",
      "src/comparison-facts/evidence-basis.ts",
      "src/comparison-facts/fight-facts.ts",
      "src/comparison-facts/four-fight-report.ts",
      // M14-C: strategy context, under the same post-hoc rules.
      "src/comparison-facts/strategy-context.ts",
      "src/comparison-facts/sub-actor-tree.ts",
      "src/comparison-facts/target-classification.ts",
      // M14-A: timing alignment, under the same post-hoc rules.
      "src/comparison-facts/timing-alignment.ts",
    ]);
    expect(CAPTURE).toEqual([
      "src/wcl/comparison/comparison-capture.ts",
      "src/wcl/comparison/comparison-tables.ts",
    ]);
  });

  it("the comparison-facts domain reads only evidence, E1 facts and the table decoder", () => {
    for (const path of FACTS) {
      for (const specifier of importsOf(sourceOf(path))) {
        const target = resolve(path, specifier);
        expect(target, `${path} imports ${specifier}`).toMatch(
          /^src\/(comparison-facts|engine|combat-facts)\/|^src\/wcl\/evidence-capability\.ts$|^src\/wcl\/comparison\/comparison-tables\.ts$/,
        );
      }
    }
  });

  it("nothing outside the domain imports it — no SimC, spec, finding, service or report module", () => {
    // M14-F: the reviewed diagnosis projection is the one reader outside the
    // domain (After M14-E). It runs after a result is final and feeds nothing
    // back (tests/contracts/m14f-diagnosis-layering.test.ts).
    expect(
      importersOf("src/comparison-facts/").filter(
        (edge) => !edge.startsWith("src/comparison-facts/") && !edge.startsWith("src/diagnosis/"),
      ),
    ).toEqual([]);
  });

  it("the comparison capture is imported only by the comparison-facts domain, and imports only decode helpers", () => {
    expect(
      importersOf("src/wcl/comparison/").filter(
        (edge) => !edge.startsWith("src/comparison-facts/") && !edge.startsWith("src/wcl/comparison/"),
      ),
    ).toEqual([]);
    for (const path of CAPTURE) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(resolve(path, specifier), `${path} imports ${specifier}`).toMatch(/^src\/wcl\/decode\.ts$/);
      }
    }
  });

  it("the Blood post-hoc definition is data that reads no post-hoc module", () => {
    for (const specifier of importsOf(sourceOf(BLOOD_DEFINITION))) {
      expect(resolve(BLOOD_DEFINITION, specifier)).toMatch(/^src\/data\/game\//);
    }
    expect(importersOf(BLOOD_DEFINITION)).toEqual([]);
  });

  it("the authority branch reads neither G1 nor G2 post-hoc evidence", () => {
    const authority = paths.filter((path) => /^src\/(simc|specs|findings|services|analysis)\//.test(path));
    for (const path of authority) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(resolve(path, specifier), `${path} imports ${specifier}`).not.toMatch(
          /^src\/(comparison-facts|combat-facts|cohort|wcl\/comparison|wcl\/cohort)\//,
        );
      }
    }
  });
});

describe("there is nowhere to write a judgement or an unproven meaning", () => {
  const code = (path: string) =>
    sourceOf(path)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const segments = (identifier: string) =>
    identifier
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/);
  const FORBIDDEN = [
    "should",
    "better",
    "worse",
    "loss",
    "lost",
    "ceiling",
    "efficiency",
    "expected",
    "score",
    "blame",
    "waste",
    "effective",
    "crit",
    "critical",
    "hostile",
    "attackable",
    "targetable",
    "alive",
    "recommend",
    "recommendation",
  ];
  it.each([...FACTS, BLOOD_DEFINITION])("%s declares no forbidden word", (path) => {
    const identifiers = [
      ...[...code(path).matchAll(/\b([A-Za-z_]\w*)\b/g)].map((match) => match[1] ?? ""),
      ...[...code(path).matchAll(/"([^"\n]*)"/g)].map((match) => match[1] ?? ""),
    ];
    for (const identifier of identifiers) {
      for (const segment of segments(identifier)) {
        expect(FORBIDDEN, `${path}: ${identifier}`).not.toContain(segment);
      }
    }
    expect(code(path)).not.toMatch(
      /WINDOW_VALUE|WINDOW_EFFICIENCY|EXPECTED_WINDOW_DAMAGE|AVAILABLE_TARGETS|ACTIVE_ENEMY/,
    );
  });
});
