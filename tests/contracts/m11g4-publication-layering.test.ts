/**
 * M11-G4-2: simulation publication is INTERNAL ONLY (owner decision
 * 2026-10-28).
 *
 * - `src/publication/` composes shared gates only. It is spec-agnostic and
 *   reads no analyzer, finding, cohort, WCL or reporting module.
 * - Nothing in `src` imports it: no route, service, projection, report or MCP
 *   surface can publish it. analysis/1 is unchanged.
 * - It carries no causal or coaching vocabulary: it is an observation.
 *
 * All checks run on code with comments stripped.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const ROOT = process.cwd();

const tsFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: false })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => join(dir, file).replace(/\\/g, "/"));

const code = (file: string): string =>
  readFileSync(join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const importsOf = (file: string): string[] =>
  [...code(file).matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)].map(
    (match) => match[1] ?? "",
  );

const PUBLICATION = tsFiles("src/publication");

describe("M11-G4-2 publication layering", () => {
  it("finds the modules it guards", () => {
    expect(PUBLICATION.sort()).toEqual([
      "src/publication/attainment.ts",
      "src/publication/pipeline.ts",
      "src/publication/record.ts",
    ]);
  });

  it("composes shared gates only", () => {
    const allowed = [
      /^\.\/(attainment|record)\.js$/,
      /^\.\.\/character-profile\/(binding|fidelity|profile|reconstruct|simulation-character)\.js$/,
      /^\.\.\/data\/simulation-models\/index\.js$/,
      /^\.\.\/environment\/(materiality|model|publishability|reconstruct|translate)\.js$/,
      /^\.\.\/simulation\/[a-z-]+\.js$/,
      /^\.\.\/simulation-context\/(evidence|resolve)\.js$/,
    ];
    for (const file of PUBLICATION) {
      for (const spec of importsOf(file)) {
        expect(
          allowed.some((pattern) => pattern.test(spec)),
          `${file} imports ${spec}`,
        ).toBe(true);
      }
    }
  });

  it("is internal: nothing in src imports it", () => {
    const importers = tsFiles("src")
      .filter((file) => !file.startsWith("src/publication/"))
      .filter((file) => importsOf(file).some((spec) => /(^|\/)publication\//.test(spec)));
    expect(importers).toEqual([]);
  });

  it("is spec-agnostic and carries no causal or coaching vocabulary", () => {
    for (const file of PUBLICATION) {
      const text = code(file);
      expect(text, file).not.toMatch(/deathknight|\bblood\b|paladin|rogue|monk|brewmaster/i);
      expect(text, file).not.toMatch(
        /should have|you lost|lost \d|missed|recommend|coaching|\bFinding\b|\bMATCH\b|\bREJECTED\b|because you/i,
      );
    }
  });
});
