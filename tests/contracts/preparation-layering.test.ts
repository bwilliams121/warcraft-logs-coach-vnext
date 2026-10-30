/**
 * The shared PREPARATION producer's boundaries (src/analysis/preparation/).
 *
 * - It is a PARALLEL producer: it reads the normalized fight, shared engine
 *   evidence primitives and its own runtime identity data. It never reads a
 *   specialization, a finding/judgment, SimulationCraft authority, the
 *   simulation side, or the post-hoc combat-facts and environment layers.
 * - No specialization imports it, so no spec evaluator can make its own
 *   gameplay result depend on preparation, or the reverse.
 *
 * Checks run on import specifiers only.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const ROOT = process.cwd();
const tsFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: false })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => join(dir, file).replace(/\\/g, "/"));
const importsOf = (file: string): string[] =>
  [
    ...readFileSync(join(ROOT, file), "utf8").matchAll(
      /(?:^|\n)\s*(?:import|export)[^\n]*?from\s+["']([^"']+)["']/g,
    ),
  ].map((match) => match[1] ?? "");

const PRODUCER = tsFiles("src/analysis/preparation");

describe("src/analysis/preparation reads only the fight, shared evidence primitives and its identity data", () => {
  const ALLOWED = [
    "../../data/game/preparation-consumables.js",
    "../../engine/evidence/coverage.js",
    "../../engine/evidence/locator.js",
    "../../engine/normalization/combat-fight.js",
    "../../engine/normalization/normalized-events.js",
    "../../engine/state/state-result.js",
    // Type only: the requirement shape the services union.
    "../../services/ingestion-scope.js",
    "./",
  ];

  it("found the producer", () => {
    expect(PRODUCER).toEqual(
      expect.arrayContaining([
        "src/analysis/preparation/consumable-status.ts",
        "src/analysis/preparation/requirement.ts",
      ]),
    );
  });

  it.each(PRODUCER)("%s imports nothing else", (file) => {
    for (const specifier of importsOf(file)) {
      expect(
        ALLOWED.some((prefix) => specifier.startsWith(prefix)),
        `${file} imports ${specifier}`,
      ).toBe(true);
    }
  });
});

describe("no specialization reaches the preparation producer", () => {
  it.each(tsFiles("src/specs"))("%s", (file) => {
    for (const specifier of importsOf(file)) {
      expect(specifier, `${file} imports ${specifier}`).not.toMatch(/analysis\/preparation/);
    }
  });
});
