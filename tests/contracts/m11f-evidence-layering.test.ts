import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * M11-F layering. Positive death facts and caster aura-carrier counts are
 * EVIDENCE: they live in `src/engine`, read only events at or before the
 * position asked about, and reach SimulationCraft authority only through a
 * declared, structural seam:
 *
 *   engine/state/death-state.ts      <- engine/auras/aura-carriers.ts, and (M11-G2)
 *                                       comparison-facts/environment-profile.ts
 *   engine/auras/aura-carriers.ts    <- specs/rogue/assassination/active-dot.ts only
 *   simc/expression/active-dot.ts    imports nothing from engine or combat-facts
 *
 * The post-hoc combat-facts layer (M11-E1) stays unreachable from authority:
 * nothing under `src/simc` or `src/specs` imports it.
 *
 * CURRENT-MILESTONE GUARD. The two importer allowlists below are an M11-F
 * isolation guard, not a permanent architecture rule. A reviewed M11-G tranche
 * may add causal-analysis consumers of positive death facts by amending them
 * explicitly. What IS permanent:
 *
 *   - evidence use is deliberate: every new consumer is a reviewed change to
 *     the dependency direction;
 *   - authority never consumes future or post-hoc evidence;
 *   - shared SimulationCraft code stays free of the evidence layer.
 */

function filesUnder(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: false })
    .map((entry) => `${root}/${String(entry).replace(/\\/g, "/")}`)
    .filter((path) => statSync(path).isFile() && path.endsWith(".ts"))
    .sort();
}

function importsOf(path: string): readonly string[] {
  const code = readFileSync(path, "utf8");
  return [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1] ?? "");
}

/** Repo-relative target of a relative import, `.js` -> `.ts`. */
function resolve(from: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier;
  const parts = from.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/").replace(/\.js$/, ".ts");
}

const SOURCES = filesUnder("src");
const importersOf = (target: string) =>
  SOURCES.filter((path) => importsOf(path).some((specifier) => resolve(path, specifier) === target));

describe("M11-F evidence layering", () => {
  it("death-state and aura-carriers import only engine modules", () => {
    for (const path of ["src/engine/state/death-state.ts", "src/engine/auras/aura-carriers.ts"]) {
      for (const specifier of importsOf(path)) {
        expect(resolve(path, specifier), `${path} imports ${specifier}`).toMatch(/^src\/engine\//);
      }
    }
  });

  it("death-state is read only through the aura-carrier evidence and the reviewed post-hoc consumers", () => {
    // AMENDED AT M11-G2, explicitly: the post-hoc environment profile reports
    // positive deaths (observedDeathsOf) as facts. It is post-hoc, unreachable
    // from authority (tests/contracts/m11g2-comparison-facts-layering.test.ts).
    //
    // AMENDED AT M12-A, explicitly: the shared death timeline hangs each of an
    // actor's positive deaths (observedDeathsOf, and nothing else from this
    // module) on the events that targeted it before. It reconstructs facts,
    // declares no judgement and is imported by nothing in production yet
    // (tests/contracts/m12a-healing-layering.test.ts).
    expect(importersOf("src/engine/state/death-state.ts")).toEqual([
      "src/comparison-facts/environment-profile.ts",
      "src/engine/auras/aura-carriers.ts",
      "src/healing/death-timeline.ts",
    ]);
  });

  it("aura-carriers is read only by the declared specialization seam", () => {
    expect(importersOf("src/engine/auras/aura-carriers.ts")).toEqual([
      "src/specs/rogue/assassination/active-dot.ts",
    ]);
  });

  it("shared SimulationCraft code imports neither the evidence layer nor post-hoc combat facts", () => {
    for (const path of SOURCES.filter((entry) => entry.startsWith("src/simc/"))) {
      for (const specifier of importsOf(path)) {
        const target = resolve(path, specifier);
        expect(target, `${path} imports ${specifier}`).not.toMatch(/^src\/(engine|combat-facts)\//);
      }
    }
  });

  it("no authority or specialization module imports post-hoc combat facts", () => {
    for (const path of SOURCES.filter((entry) => /^src\/(simc|specs|findings)\//.test(entry))) {
      for (const specifier of importsOf(path)) {
        expect(resolve(path, specifier), `${path} imports ${specifier}`).not.toMatch(/^src\/combat-facts\//);
      }
    }
  });
});
