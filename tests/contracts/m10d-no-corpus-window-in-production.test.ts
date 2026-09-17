/**
 * M10-D: corpus-only evaluation machinery never reaches production analysis.
 *
 * The Protection Paladin steady-state evidence is exercised by the corpus
 * through a BUNDLE of artifacts with declared holes and an evaluation window
 * that narrows which decisions an aggregate assertion counts. All of that is
 * test harness (`tests/support/corpus/`), and it must stay there: a public
 * request analyzes the fight the ingestion port retrieved, whole, and the
 * public totals a reader sees are over that fight — never over a window a
 * test chose.
 *
 * Two static guards, on CODE with comments stripped:
 *
 *   - no `src/` module names the corpus-only concepts;
 *   - no `src/` module imports from `tests/`.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

function filesUnder(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: false })
    .map((entry) => `${root}/${String(entry).replace(/\\/g, "/")}`)
    .filter((path) => statSync(path).isFile() && path.endsWith(".ts"))
    .sort();
}

/** Source with comments stripped: the prohibitions are on CODE. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const CORPUS_ONLY_IDENTIFIERS = [
  "evaluationWindow",
  "declaredHoles",
  "historyArtifactIds",
  "stateOfBundle",
  "bundleOverEvidence",
  "corpusBundle",
  "BundleHole",
  "BundleComposition",
  "certifiedEmpty",
  "retainedCoverage",
];

describe("production analysis carries no corpus-only window or bundle logic", () => {
  const sources = filesUnder("src");

  it("scans a non-trivial production tree", () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it("no src/ module names a corpus-only concept", () => {
    const offenders: string[] = [];
    for (const path of sources) {
      const code = codeOf(path);
      for (const identifier of CORPUS_ONLY_IDENTIFIERS) {
        if (code.includes(identifier)) offenders.push(`${path}: ${identifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no src/ module imports from tests/", () => {
    const offenders = sources.filter((path) => /from\s+["'][^"']*\/tests\//.test(codeOf(path)));
    expect(offenders).toEqual([]);
  });

  it("the bundle and window machinery exists where it belongs", () => {
    // The guard is meaningful only if the concepts are real somewhere.
    const harness = codeOf("tests/support/corpus/fight.ts");
    expect(harness).toContain("bundleOverEvidence");
    expect(harness).toContain("declaredHoles");
    const executor = codeOf("tests/support/corpus/executors/spec-protection-paladin.ts");
    expect(executor).toContain("evaluationWindow");
  });
});
