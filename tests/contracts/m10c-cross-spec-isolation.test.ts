/**
 * M10-C: two specialization trees, mechanically kept apart.
 *
 * The M10-A sweep was written against the shape a second tree would take.
 * Now that it exists, this test states the concrete prohibitions in both
 * directions and the spec-neutrality of the shared SimC layer by name, so a
 * convenient cross-import or a "paladin" branch in shared code fails a test
 * rather than a review.
 *
 * M11-A2: the PAIRWISE, hand-listed parts of this file — the exact Paladin
 * module list, the list of Paladin-only data modules, and the list of
 * class-named data modules — were retired in favour of the structural,
 * N-tree sweep in `m11a2-cross-spec-isolation.test.ts`, which discovers
 * every `src/specs/<class>/<spec>/` tree and proves the same properties for
 * all of them. What stays here is what is genuinely about the M10-C seam:
 * the two trees' directional prohibitions by name, the Rogue loader
 * exception, and the SimC layer's freedom from any Paladin concept.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

function filesUnder(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: false })
    .map((entry) => `${root}/${String(entry).replace(/\\/g, "/")}`)
    .filter((path) => statSync(path).isFile())
    .sort();
}

const tsUnder = (root: string) => filesUnder(root).filter((path) => path.endsWith(".ts"));

/** Source with comments stripped: the prohibitions are on CODE. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function importSpecifiersOf(path: string): readonly string[] {
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g;
  for (const match of codeOf(path).matchAll(pattern)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

function resolveSpecifier(from: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier;
  const fromDirectory = from.slice(0, from.lastIndexOf("/"));
  const segments = [...fromDirectory.split("/"), ...specifier.split("/")];
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }
  return resolved.join("/");
}

const PALADIN_TREE = tsUnder("src/specs/paladin/protection");
const ROGUE_TREE = tsUnder("src/specs/rogue/assassination");
const SHARED_SIMC = tsUnder("src/simc");
const SHARED_FINDINGS = tsUnder("src/findings");
const ALL_SRC = tsUnder("src");

describe("the Paladin tree", () => {
  it.each(PALADIN_TREE)(
    "%s imports no Rogue module, Rogue data, Rogue authority or the Rogue loader",
    (path) => {
      for (const specifier of importSpecifiersOf(path)) {
        const resolved = resolveSpecifier(path, specifier);
        expect(resolved, `${path} imports ${specifier}`).not.toContain("src/specs/rogue/");
        expect(resolved, `${path} imports ${specifier}`).not.toMatch(/\/rogue-[a-z-]+\.(js|json)$/);
        expect(resolved, `${path} imports ${specifier}`).not.toContain("rogue-assassination.apl.json");
        expect(resolved, `${path} imports ${specifier}`).not.toContain("simc/pinned-authority.js");
        expect(resolved, `${path} imports ${specifier}`).not.toContain("assassination-transition-authority");
      }
    },
  );

  it.each(PALADIN_TREE)("%s names no Rogue authority id, dataset or spec id in code", (path) => {
    const code = codeOf(path);
    for (const forbidden of [
      "SIMC_APL_ROGUE_ASSASSINATION",
      "SIMC_DBC_ROGUE",
      "SIMC_TRAIT_ROGUE",
      "rogue/assassination",
    ]) {
      expect(code, `${path} names ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("the Rogue tree", () => {
  it.each(ROGUE_TREE)("%s imports no Paladin module or Paladin data", (path) => {
    for (const specifier of importSpecifiersOf(path)) {
      const resolved = resolveSpecifier(path, specifier);
      expect(resolved, `${path} imports ${specifier}`).not.toContain("src/specs/paladin/");
      expect(resolved, `${path} imports ${specifier}`).not.toMatch(/\/paladin-[a-z-]+\.(js|json)$/);
    }
  });

  it("the Rogue registration still reaches its authority through the shared loader, unchanged", () => {
    expect(importSpecifiersOf("src/specs/rogue/assassination/registration.ts")).toContain(
      "../../../simc/pinned-authority.js",
    );
  });
});

describe("the shared SimC layer is spec-neutral", () => {
  it.each(SHARED_SIMC)("%s imports no specialization module", (path) => {
    for (const specifier of importSpecifiersOf(path)) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/specs/");
    }
  });

  it.each(SHARED_SIMC)("%s branches on no Paladin concept", (path) => {
    const code = codeOf(path).toLowerCase();
    for (const forbidden of [
      "paladin",
      "protection",
      "lightsmith",
      "templar",
      "armament",
      "holy_power",
      "holypower",
    ]) {
      expect(code, `${path} mentions ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("the seam itself declares no identifier: the vocabulary module holds no names", () => {
    const code = codeOf("src/simc/expression/spec-vocabulary.ts");
    for (const forbidden of [
      "next_armament",
      "hero_tree",
      "apex",
      "prev_gcd",
      "consecration",
      "full_recharge_time",
    ]) {
      expect(code).not.toContain(forbidden);
    }
    // And the parser reaches a vocabulary only through the one lookup.
    const parser = codeOf("src/simc/expression/parse.ts");
    expect(parser.match(/vocabulary\?\.lookup\(/g)).toHaveLength(1);
  });

  it.each(SHARED_FINDINGS.filter((path) => !path.endsWith("/spec-id.ts")))(
    "%s names no specialization",
    (path) => {
      const code = codeOf(path).toLowerCase();
      for (const forbidden of ["paladin", "assassination"]) {
        expect(code, `${path} mentions ${forbidden}`).not.toContain(forbidden);
      }
    },
  );
});

describe("shared code reaches the two trees only through the registry", () => {
  it("exactly one module outside src/specs imports a specialization, and it imports both registrations", () => {
    const importers = ALL_SRC.filter(
      (path) =>
        !path.startsWith("src/specs/") &&
        importSpecifiersOf(path).some((specifier) =>
          resolveSpecifier(path, specifier).includes("src/specs/"),
        ),
    );
    expect(importers).toEqual(["src/services/analyzer-registry.ts"]);
  });
});
