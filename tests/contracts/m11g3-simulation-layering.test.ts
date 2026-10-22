/**
 * M11-G3-1: the simulation runtime's boundaries.
 *
 * - `src/simulation/` is pure, Worker-safe code: it imports only `zod` and
 *   its own modules. No Node builtins, no filesystem, no network.
 * - It is SEPARATE from rotational authority: it imports no APL, authority,
 *   spec-evaluator, comparison, combat-facts or reporting code, and it never
 *   produces a decision verdict (MATCH / REJECTED). A simulated DPS is an
 *   input to later analysis, not a finding.
 * - The Node runner (`runner/`) reaches production code only through
 *   `src/simulation/`; nothing in `src/` imports the runner.
 * - ADD SAFETY: no simulation module can turn an observed engagement span
 *   (first/last hit) into simulated target availability. The job's
 *   `additionalTargets` accepts no element at all, and the simulation code
 *   has no first/last-hit vocabulary and no import of the modules that
 *   compute such spans.
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

const SIMULATION = tsFiles("src/simulation");
const RUNNER = tsFiles("runner");

describe("M11-G3-1 simulation layering", () => {
  it("finds the modules it guards", () => {
    expect(SIMULATION.length).toBeGreaterThanOrEqual(10);
    expect(RUNNER.length).toBeGreaterThanOrEqual(3);
  });

  it("src/simulation imports only zod and its own modules", () => {
    for (const file of SIMULATION) {
      for (const spec of importsOf(file)) {
        expect(spec === "zod" || /^\.\/[a-z-]+\.js$/.test(spec), `${file} imports ${spec}`).toBe(true);
      }
    }
  });

  it("src/simulation uses no Node builtin, filesystem, process or network API", () => {
    for (const file of SIMULATION) {
      expect(code(file), file).not.toMatch(
        /\bnode:|\brequire\(|\bprocess\.|\bfetch\(|readFileSync|import\.meta/,
      );
    }
  });

  it("the simulation runtime produces no decision verdict", () => {
    for (const file of [...SIMULATION, ...RUNNER]) {
      expect(code(file), file).not.toMatch(/\b(MATCH|REJECTED|ACCEPTED|ADVISORY_MISMATCH)\b/);
    }
  });

  // M11-G3-2 amendment (reviewed): the runner also composes character
  // reconstruction — src/character-profile/ and spec-owned character bindings.
  it("the runner reaches src/ only through src/simulation, src/character-profile and spec-owned bindings; src/ never imports the runner", () => {
    for (const file of RUNNER) {
      for (const spec of importsOf(file)) {
        const allowed =
          spec.startsWith("node:") ||
          /^\.\/[a-z-]+\.js$/.test(spec) ||
          /^\.\.\/src\/simulation\/[a-z-]+\.js$/.test(spec) ||
          /^\.\.\/src\/character-profile\/[a-z-]+\.js$/.test(spec) ||
          /^\.\.\/src\/specs\/[a-z]+\/[a-z_]+\/(simulation|character)-binding\.js$/.test(spec);
        expect(allowed, `${file} imports ${spec}`).toBe(true);
      }
    }
    for (const file of tsFiles("src")) {
      for (const spec of importsOf(file)) expect(spec, file).not.toMatch(/(^|\/)runner\//);
    }
  });

  it("src/simulation names no specialization; a spec's binding lives in its own tree", () => {
    for (const file of SIMULATION) {
      expect(code(file), file).not.toMatch(/deathknight|\bblood\b|Blood Death Knight|paladin|rogue/i);
    }
    const bindings = tsFiles("src/specs").filter((file) => file.endsWith("/simulation-binding.ts"));
    expect(bindings).toEqual(["src/specs/deathknight/blood/simulation-binding.ts"]);
  });

  // M11-G3-2 amendment (reviewed): src/character-profile/ is the one other
  // consumer — it builds the fidelity-probe job and reads the engine echo.
  // M11-G3-4 amendment (reviewed): src/environment/ translates a reconstructed
  // environment into the job's environment/consumables shape and hashes it with
  // the canonical hashing; it reads exactly the modules below and runs nothing.
  it("src/environment reads only the job schema, the model pin, canonical hashing and the tank-load directives", () => {
    for (const file of tsFiles("src/environment")) {
      for (const spec of importsOf(file).filter((candidate) => /simulation\//.test(candidate))) {
        expect(
          [
            "../simulation/job.js",
            "../simulation/model.js",
            "../simulation/canonical.js",
            "../simulation/tank-model.js",
          ],
          `${file} imports ${spec}`,
        ).toContain(spec);
      }
    }
  });

  it("outside src/simulation, only spec-owned bindings (binding type), src/character-profile and src/environment import it — no analysis path", () => {
    for (const file of tsFiles("src").filter(
      (name) =>
        !name.startsWith("src/simulation/") &&
        !name.startsWith("src/character-profile/") &&
        !name.startsWith("src/environment/"),
    )) {
      const text = code(file);
      for (const spec of importsOf(file).filter((candidate) => /simulation\//.test(candidate))) {
        // M11-G3-3 amendment (reviewed): a spec's execution facts use the shared
        // activity classifier — spec knowledge says which shared execution
        // options are active for it, never what they mean.
        if (/^src\/specs\/[a-z]+\/[a-z_]+\/execution-facts\.ts$/.test(file)) {
          expect(spec, file).toBe("../../../simulation/execution-activity.js");
          continue;
        }
        expect(file, `${file} imports ${spec}`).toMatch(
          /^src\/specs\/[a-z]+\/[a-z_]+\/simulation-binding\.ts$/,
        );
        expect(spec).toBe("../../../simulation/spec-binding.js");
        expect(text).toMatch(
          /import type \{ SimulationSpecBinding \} from "\.\.\/\.\.\/\.\.\/simulation\/spec-binding\.js"/,
        );
      }
    }
  });

  it("ADD SAFETY: no simulation code knows first/last-hit or engagement-span vocabulary", () => {
    for (const file of [...SIMULATION, ...RUNNER]) {
      expect(code(file), file).not.toMatch(
        /first_?hit|last_?hit|first_?seen|last_?seen|engagement|observedSpan|activeSpan/i,
      );
    }
  });

  it("ADD SAFETY: the job's additionalTargets accepts no element, and no raid_events text exists in the builder", () => {
    const job = code("src/simulation/job.ts");
    expect(job).toMatch(/additionalTargets:\s*z\.array\(z\.never\(\)\)\.max\(0\)/);
    expect(code("src/simulation/input-builder.ts")).not.toMatch(/raid_events|\badds\b|spawn|enemy=/);
  });
});
