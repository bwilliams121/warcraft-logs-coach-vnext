/**
 * M11-G3-2: the character-profile domain's boundaries.
 *
 * - It reconstructs and checks a character; it produces no finding, no
 *   coaching and no decision verdict, and it reaches no APL, authority,
 *   findings, comparison, cohort or combat-facts code. Spec meaning arrives
 *   through an injected binding: it names no specialization.
 * - Racials and trinkets stay out of offensive scope: the domain has no
 *   racial-action or trinket-usage vocabulary, and the race it cannot resolve
 *   is never filled.
 * - It never models adds: no target-availability or engagement vocabulary.
 * - Comparison evidence cannot reach it: it imports nothing from the
 *   comparison or cohort domains (subject isolation is also enforced at
 *   runtime: every input carries its actor and a foreign actor is refused).
 *
 * All checks run on code with comments stripped.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const ROOT = process.cwd();
const files = readdirSync(join(ROOT, "src/character-profile"), { recursive: false, withFileTypes: false })
  .filter((file) => file.endsWith(".ts"))
  .map((file) => `src/character-profile/${file}`);

const code = (file: string): string =>
  readFileSync(join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const importsOf = (file: string): string[] =>
  [...code(file).matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)].map(
    (match) => match[1] ?? "",
  );

describe("M11-G3-2 character-profile layering", () => {
  it("finds the modules it guards", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it("imports only shared primitives: data/game, normalization types, simulation, wcl decode, itself", () => {
    const allowed = [
      /^\.\/[a-z-]+\.js$/,
      /^\.\.\/data\/game\/(talent-loadout|talent-selection|consumables)\.js$/,
      /^\.\.\/engine\/normalization\/(combatant-info|normalized-events)\.js$/,
      /^\.\.\/simulation\/[a-z-]+\.js$/,
      /^\.\.\/wcl\/decode\.js$/,
    ];
    for (const file of files) {
      for (const spec of importsOf(file)) {
        expect(
          allowed.some((pattern) => pattern.test(spec)),
          `${file} imports ${spec}`,
        ).toBe(true);
      }
    }
  });

  it("names no specialization; spec meaning comes only from the injected binding", () => {
    for (const file of files) {
      expect(code(file), file).not.toMatch(
        /deathknight|\bblood\b|Blood Death Knight|paladin|rogue|monk|sanlayn/i,
      );
    }
  });

  it("produces no finding, coaching or APL verdict", () => {
    for (const file of files) {
      expect(code(file), file).not.toMatch(
        /\b(REJECTED|ACCEPTED|ADVISORY_MISMATCH|Finding|coaching|recommend)\b/,
      );
    }
  });

  it("racials and trinkets stay out of offensive scope", () => {
    for (const file of files) {
      expect(code(file), file).not.toMatch(
        /racial_?action|use_racial|blood_fury|berserking|fireblood|ancestral_call|trinket_?usage|use_item/i,
      );
    }
  });

  it("models no add availability", () => {
    for (const file of files) {
      expect(code(file), file).not.toMatch(
        /first_?hit|last_?hit|engagement|additionalTargets\s*:\s*\[[^\]]/i,
      );
    }
  });

  it("only the Blood tree's character binding names Blood's character facts", () => {
    const bindings = readdirSync(join(ROOT, "src/specs"), { recursive: true, withFileTypes: false })
      .filter((file) => file.replace(/\\/g, "/").endsWith("/character-binding.ts"))
      .map((file) => `src/specs/${file.replace(/\\/g, "/")}`);
    expect(bindings).toEqual(["src/specs/deathknight/blood/character-binding.ts"]);
  });
});
