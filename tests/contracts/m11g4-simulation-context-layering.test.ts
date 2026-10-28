/**
 * M11-G4-1: the simulation-context domain's boundaries.
 *
 * - `src/simulation-context/` resolves a log's game context. It is
 *   spec-agnostic and contains no ceiling, statistic, simulation execution,
 *   finding or coaching. It reads only its own evidence, the report-region
 *   type, and the selection context type.
 * - It never reads SimulationCraft snapshot data, analyzer authority or the
 *   simulation-model data bundles: a build is never inferred from them.
 * - Nothing on the public analysis path imports it yet (G4 publication is not
 *   built).
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

const CONTEXT = tsFiles("src/simulation-context");

describe("M11-G4-1 simulation-context layering", () => {
  it("finds the modules it guards", () => {
    expect(CONTEXT.sort()).toEqual([
      "src/simulation-context/evidence.ts",
      "src/simulation-context/intervals.ts",
      "src/simulation-context/resolve.ts",
    ]);
  });

  it("imports only its evidence, zod, the report-region type and the selection context type", () => {
    const allowed = [
      /^\.\/(evidence|intervals)\.js$/,
      /^zod$/,
      /^\.\.\/data\/simulation-context\/(build-observations|regional-restarts)\.json$/,
      /^\.\.\/wcl\/fight-context-query\.js$/,
      /^\.\.\/simulation\/model-registry\.js$/,
    ];
    for (const file of CONTEXT) {
      for (const spec of importsOf(file)) {
        expect(
          allowed.some((pattern) => pattern.test(spec)),
          `${file} imports ${spec}`,
        ).toBe(true);
      }
    }
    // Types only from outside its own evidence: no runtime dependency on WCL or selection.
    for (const file of CONTEXT) {
      for (const match of code(file).matchAll(
        /import\s+(type\s+)?\{[^}]*\}\s+from\s+["'](\.\.\/(wcl|simulation)\/[^"']+)["']/g,
      )) {
        expect(match[1], `${file} imports ${match[2] ?? ""} at runtime`).toBe("type ");
      }
    }
  });

  it("is spec-agnostic and has no ceiling, simulation or coaching vocabulary", () => {
    for (const file of CONTEXT) {
      const text = code(file);
      expect(text, file).not.toMatch(/deathknight|\bblood\b|paladin|rogue|monk|brewmaster/i);
      expect(text, file).not.toMatch(/ceiling|attainment|dps|\bMATCH\b|REJECTED|Finding|coaching|recommend/i);
      expect(text, file).not.toMatch(/simc|snapshot|sc_spell_data|client_data_version/i);
    }
  });

  it("nothing in src imports it yet", () => {
    const importers = tsFiles("src")
      .filter((file) => !file.startsWith("src/simulation-context/"))
      .filter((file) => importsOf(file).some((spec) => /(^|\/)simulation-context\//.test(spec)));
    expect(importers).toEqual([]);
  });
});
