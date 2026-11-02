/**
 * The shared recipient cooldown registry stays shared data (M13-C).
 *
 * `src/data/game/recipient-cooldown-identities.ts` answers "which reviewed
 * cooldown ids does specialization X have?" for analysis of ANOTHER player.
 * It would become a back door around specialization isolation if it imported
 * a specialization's dataset, and a universal evaluator if it branched on a
 * specialization. These checks keep it a validated table with one lookup.
 * The drift check against each source dataset is
 * tests/unit/data/recipient-cooldown-identities.test.ts.
 */

import { describe, expect, it } from "vitest";

const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

const REGISTRY = "src/data/game/recipient-cooldown-identities.ts";

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

function codeOf(path: string): string {
  const entry = SOURCES[`../../${path}`];
  if (entry === undefined) throw new Error(`no source captured for ${path}`);
  return entry.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Every module specifier: static, re-export, bare side-effect and dynamic imports. */
function importsOf(code: string): readonly string[] {
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/g,
    /(?:^|\n)\s*import\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...code.matchAll(pattern)].map((entry) => entry[1] ?? ""));
}

describe("the recipient cooldown registry", () => {
  it("imports only its own artifact, the pinned roster and the stated-specialization type", () => {
    expect([...importsOf(codeOf(REGISTRY))].sort()).toEqual([
      "../../engine/normalization/friendly-specializations.js",
      "./recipient-cooldown-identities.json",
      "./spec-roster.js",
    ]);
  });

  it("compares no specialization or class literal: the lookup is a table read", () => {
    const code = codeOf(REGISTRY);
    expect(code).not.toMatch(/(className|specName|rosterKey)\s*[!=]==\s*["']/);
    expect(code).not.toMatch(/["']\s*[!=]==\s*\w*\.?(className|specName|rosterKey)/);
    // A five-or-more-digit number in code would be a spell id; ids live in the artifact.
    expect(code.match(/\b\d{5,}\b/g) ?? []).toEqual([]);
  });

  it("is read only by the named consumers, each a specialization evaluator", () => {
    const CONSUMERS = ["src/specs/evoker/augmentation/evaluator.ts"];
    const readers = allPaths().filter(
      (path) =>
        path !== REGISTRY &&
        importsOf(codeOf(path)).some((specifier) => specifier.includes("recipient-cooldown-identities")),
    );
    expect(readers).toEqual(CONSUMERS);
  });
});
