/**
 * M11-G3-4: the environment domain's boundaries.
 *
 * - `src/environment/` reconstructs and translates a fight environment. It is
 *   spec-agnostic: it names no specialization, and spec meaning (materiality
 *   measurements, disclosures) arrives as injected facts.
 * - It produces no finding, coaching, decision verdict, DPS, ceiling or loss:
 *   no verdict vocabulary, no causal-coaching phrases, no ceiling labels for a
 *   diagnostic.
 * - It reads only shared primitives, and nothing on the authority branch reads
 *   it except a spec's environment facts, by a TYPE-only import.
 * - ADD SAFETY: no environment module constructs a simulated target
 *   availability interval (only the type declares it), and none re-introduces
 *   the rejected first-hit/last-hit "lower environment".
 * - Spec facts live in a spec tree, one file per spec, and only Blood has one.
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

const ENVIRONMENT = tsFiles("src/environment");

describe("M11-G3-4 environment layering", () => {
  it("finds the modules it guards", () => {
    expect(ENVIRONMENT.length).toBeGreaterThanOrEqual(9);
  });

  it("imports only shared primitives and itself", () => {
    const allowed = [
      /^\.\/[a-z-]+\.js$/,
      /^\.\.\/character-profile\/(profile|pull-facts)\.js$/,
      /^\.\.\/combat-facts\/descriptors\.js$/,
      // M11 model-registry amendment (reviewed): consumables, token acceptance and
      // raid-environment identities are simulation-model data, read from the
      // NAMED model's bundle (src/data/simulation-models).
      /^\.\.\/data\/simulation-models\/index\.js$/,
      /^\.\.\/engine\/evidence\/coverage\.js$/,
      /^\.\.\/engine\/normalization\/(combat-fight|normalized-events)\.js$/,
      /^\.\.\/engine\/state\/state-result\.js$/,
      /^\.\.\/simulation\/(job|model|canonical|tank-model)\.js$/,
      /^\.\.\/wcl\/evidence-capability\.js$/,
    ];
    for (const file of ENVIRONMENT) {
      for (const spec of importsOf(file)) {
        expect(
          allowed.some((pattern) => pattern.test(spec)),
          `${file} imports ${spec}`,
        ).toBe(true);
      }
    }
  });

  it("is spec-agnostic: names no specialization", () => {
    for (const file of ENVIRONMENT) {
      expect(code(file), file).not.toMatch(
        /deathknight|\bblood\b|Blood Death Knight|paladin|rogue|monk|sanlayn|\bDK\b/i,
      );
    }
  });

  it("produces no finding, verdict, coaching, DPS figure or ceiling label", () => {
    for (const file of ENVIRONMENT) {
      const text = code(file);
      expect(text, file).not.toMatch(
        /\b(MATCH|REJECTED|ACCEPTED|ADVISORY_MISMATCH|Finding|coaching|recommend)\b/,
      );
      expect(text, file).not.toMatch(
        /should have|missed (add|uptime)|bad lust|wrong potion|lost \d|dps loss/i,
      );
      expect(text, file).not.toMatch(
        /lower ceiling|conservative ceiling|attainable|current-setup ceiling|dps\.mean|collected_data/i,
      );
    }
  });

  it("ADD SAFETY: only the type declares a simulated availability interval; no first/last-hit lower environment", () => {
    for (const file of ENVIRONMENT.filter((name) => !name.endsWith("/model.ts"))) {
      expect(code(file), file).not.toMatch(/"SIMULATED_TARGET_AVAILABLE_INTERVAL"/);
      expect(code(file), file).not.toMatch(
        /LOWER_ENVIRONMENT|UPPER_ENVIRONMENT|firstHit|lastHit|first_hit|last_hit/,
      );
    }
    // The candidate availability is UNKNOWN by construction.
    expect(code("src/environment/reconstruct.ts")).toMatch(
      /availability: unknownFact\(\s*"no approved evidence source establishes this actor's availability boundaries"/,
    );
  });

  it("nothing on the authority branch reads it, except a spec's environment facts by a type-only import", () => {
    for (const file of [
      ...tsFiles("src/simc"),
      ...tsFiles("src/specs"),
      ...tsFiles("src/findings"),
      ...tsFiles("src/engine"),
    ]) {
      const specs = importsOf(file).filter((spec) => /(^|\/)environment\//.test(spec));
      if (specs.length === 0) continue;
      expect(file, `${file} imports ${specs.join(", ")}`).toMatch(
        /^src\/specs\/[a-z]+\/[a-z_]+\/environment-facts\.ts$/,
      );
      expect(specs).toEqual(["../../../environment/materiality.js"]);
      expect(code(file)).toMatch(
        /import type \{ EnvironmentSpecFacts \} from "\.\.\/\.\.\/\.\.\/environment\/materiality\.js"/,
      );
    }
  });

  it("no analysis path reaches it: only spec facts, and no service, API or reporting module", () => {
    const outside = tsFiles("src").filter((file) => !file.startsWith("src/environment/"));
    const importers = outside.filter((file) =>
      importsOf(file).some((spec) => /(^|\/)environment\//.test(spec)),
    );
    expect(importers).toEqual(["src/specs/deathknight/blood/environment-facts.ts"]);
  });

  it("environment facts live in the spec trees, and only Blood has them", () => {
    const facts = readdirSync(join(ROOT, "src/specs"), { recursive: true, withFileTypes: false })
      .map((file) => `src/specs/${String(file).replace(/\\/g, "/")}`)
      .filter((file) => file.endsWith("/environment-facts.ts"));
    expect(facts).toEqual(["src/specs/deathknight/blood/environment-facts.ts"]);
  });
});
