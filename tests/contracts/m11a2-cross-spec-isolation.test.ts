/**
 * M11-A2: cross-specialization isolation as a STRUCTURAL rule over N trees.
 *
 * Until M11-A2 the isolation proofs were written pairwise: the Paladin tree
 * may not import the Rogue tree, and vice versa, with each tree's module
 * list and each specialization's data files spelled out by hand. That held
 * for two trees and would have needed rewriting for the third. This file
 * DISCOVERS every specialization tree under `src/specs/<class>/<spec>/` and
 * proves the same properties for every pair, so a new tree is covered the
 * moment it exists.
 *
 * THE RULES
 *
 *   R1  One tree never imports another tree.
 *   R2  Spec-owned authority interpretation stays inside its tree: nothing
 *       outside `src/specs/<c>/<s>/` imports a module of that tree except
 *       the analyzer registry, which imports each tree's `registration.ts`
 *       and nothing else.
 *   R3  Spec-owned data — `src/data/game/<class>-<spec>-*` and
 *       `src/simc/data/<class>-<spec>.apl.json` — is imported only by its
 *       owning tree, or by other data modules of the same specialization.
 *   R4  Shared infrastructure (`src/engine`, `src/findings`, `src/simc`
 *       outside its `data/`, `src/data/game` class-neutral modules, …) may be
 *       imported by every tree. A tree may import ONLY shared modules, its
 *       own tree, and its own spec-owned or class-level data.
 *   R5  Class-level data is not spec-owned merely because the class matches:
 *       a `src/data/game/<class>-<x>-*` module where `<class>/<x>` is NOT a
 *       roster specialization is CLASS data, importable by every tree of that
 *       class and by no tree of another class.
 *   R6  Production registration ownership is explicit: each tree exports its
 *       registration from `registration.ts` and the catalog lists it (pinned
 *       in full by `m11a-registration-list-complete`).
 *   R7  Historical exceptions are FROZEN, named, and asserted exactly — they
 *       exist because the first vertical slice grew before the seams did,
 *       and they are not a pattern a later specialization may repeat.
 *
 * THE FROZEN EXCEPTIONS (M5-era Assassination layout)
 *
 *   - `src/simc/pinned-authority.ts` is Assassination's authority loader
 *     living in the shared SimC layer. It imports the Assassination APL
 *     artifact and is imported only by the Assassination tree.
 *   - `src/data/game/ability-gcd-semantics.ts` is the Assassination GCD
 *     dataset under a generic name. The shared engine imports ONE TYPE from
 *     it (`ExecutionLane`), never a value; `assassination-transition-
 *     authority.ts` and the Assassination tree import it as data.
 *   - The `rogue-*` datasets and `assassination-transition-authority.ts` /
 *     `stealth-readiness-authority.ts` are Assassination-scoped despite
 *     class-only or spec-only names. Under R5 a `rogue-*` module would read
 *     as Rogue CLASS data; these are pinned as owned by `rogue/assassination`
 *     instead, so a future Outlaw or Subtlety tree cannot import
 *     Assassination's talents by mistake.
 *
 * Comments are stripped before any import is read: the prohibitions are on
 * CODE. The M10-C pins that are specific to the SimC seam (no Paladin concept
 * in `src/simc`, the vocabulary module holds no identifier) stay in
 * `m10c-cross-spec-isolation.test.ts`.
 */

import { describe, expect, it } from "vitest";

import { pinnedSpecRoster } from "../../src/data/game/spec-roster.js";
import { SPEC_IDS } from "../../src/findings/spec-id.js";

const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.{ts,json}", {
  eager: true,
  query: "?raw",
  import: "default",
});

function repoPath(key: string): string {
  return key
    .replace(/^\.\.\/\.\.\//, "")
    .split("\\")
    .join("/");
}

const ALL_FILES: readonly string[] = Object.keys(SOURCES).map(repoPath).sort();
const TS_FILES: readonly string[] = ALL_FILES.filter((path) => path.endsWith(".ts"));

function codeOf(path: string): string {
  const source = SOURCES[`../../${path}`];
  if (source === undefined) throw new Error(`no source captured for ${path}`);
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

interface ImportEdge {
  readonly from: string;
  readonly specifier: string;
  readonly resolved: string;
  readonly typeOnly: boolean;
}

function importsOf(path: string): readonly ImportEdge[] {
  const edges: ImportEdge[] = [];
  const pattern = /(?:^|\n)\s*(import|export)(\s+type)?\s[^;]*?\sfrom\s+["']([^"']+)["']/g;
  for (const match of codeOf(path).matchAll(pattern)) {
    const specifier = match[3];
    if (specifier === undefined || !specifier.startsWith(".")) continue;
    edges.push({
      from: path,
      specifier,
      resolved: resolve(path, specifier),
      typeOnly: match[2] !== undefined,
    });
  }
  return edges;
}

/** `src/a/b.ts` + `../c/d.js` -> `src/c/d.ts`; JSON keeps its extension. */
function resolve(from: string, specifier: string): string {
  const segments = [...from.slice(0, from.lastIndexOf("/")).split("/"), ...specifier.split("/")];
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return out.join("/").replace(/\.js$/, ".ts");
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

interface SpecTree {
  readonly specId: string;
  readonly classToken: string;
  readonly specKey: string;
  readonly root: string;
  readonly files: readonly string[];
}

const TREES: readonly SpecTree[] = (() => {
  const roots = new Set<string>();
  for (const path of TS_FILES) {
    const match = /^src\/specs\/([^/]+)\/([^/]+)\//.exec(path);
    if (match !== null) roots.add(`${String(match[1])}/${String(match[2])}`);
  }
  return [...roots].sort().map((specId) => {
    const [classToken, specKey] = specId.split("/") as [string, string];
    const root = `src/specs/${specId}/`;
    return { specId, classToken, specKey, root, files: TS_FILES.filter((path) => path.startsWith(root)) };
  });
})();

/**
 * M12-D: specialization trees that are evaluators WITHOUT a registration.
 *
 * A healer evaluator has no SimulationCraft authority, so it has no SpecId,
 * no registration.ts and no APL artifact (CLAUDE.md "Healer Model Limits").
 * It is named here, exactly, and every isolation rule (R1, R3, R4, R5) still
 * applies to it; only the registration rules (R2's importer list, R6, the
 * one-APL-per-tree count) exclude it, because it registers nothing. A tree is
 * added here only by its own reviewed tranche.
 *
 * M13-A added the Augmentation Evoker support evaluator here; M13-E removed
 * it, because it is now registered (INTERNAL_ONLY, binding no authority).
 * HEAL-A removed Restoration Shaman (named here since M12-D) for the same
 * reason, so the list is empty: every specialization tree is registered.
 */
const UNREGISTERED_EVALUATOR_TREES: readonly string[] = [];
const REGISTERED_TREES: readonly SpecTree[] = TREES.filter(
  (tree) => !UNREGISTERED_EVALUATOR_TREES.includes(tree.specId),
);

/**
 * M13-E: registered trees that bind NO decision authority, and so own no APL
 * artifact. Named exactly; each must be a registered tree. The one-APL-per-tree
 * count below applies to every other registered tree. HEAL-A added Restoration
 * Shaman, the first healer registration.
 */
const AUTHORITY_FREE_REGISTERED_TREES: readonly string[] = ["evoker/augmentation", "shaman/restoration"];

const ROSTER = (() => {
  const loaded = pinnedSpecRoster();
  if (!loaded.ok) throw new Error(`roster failed to load: ${loaded.reason}`);
  return loaded;
})();
const ROSTER_KEYS = new Set(ROSTER.specializations.map((row) => row.rosterKey));

/** `src/data/game/paladin-protection-cooldowns.ts` -> `paladin/protection`, or null when not spec-named. */
function specOfDataModule(path: string): string | null {
  const match = /^src\/data\/game\/([a-z]+)-([a-z_]+)-[a-z0-9-]+\.(?:ts|json)$/.exec(path);
  if (match === null) return null;
  const candidate = `${String(match[1])}/${String(match[2])}`;
  return ROSTER_KEYS.has(candidate) ? candidate : null;
}

/** `src/simc/data/paladin-protection.apl.json` -> `paladin/protection`. */
function specOfAplArtifact(path: string): string | null {
  const match = /^src\/simc\/data\/([a-z]+)-([a-z_]+)\.apl\.json$/.exec(path);
  if (match === null) return null;
  const candidate = `${String(match[1])}/${String(match[2])}`;
  return ROSTER_KEYS.has(candidate) ? candidate : null;
}

/** `src/data/game/rogue-talents.ts` -> `rogue` when the suffix is not a spec of that class. */
function classOfClassLevelDataModule(path: string): string | null {
  const match = /^src\/data\/game\/([a-z]+)-[a-z0-9-]+\.(?:ts|json)$/.exec(path);
  if (match === null || specOfDataModule(path) !== null) return null;
  const classToken = String(match[1]);
  return ROSTER.specializations.some((row) => row.classToken === classToken) ? classToken : null;
}

// ---------------------------------------------------------------------------
// The frozen exceptions (R7)
// ---------------------------------------------------------------------------

const ASSASSINATION = "rogue/assassination";

/** Assassination-scoped modules outside the tree, under class-only or generic names. */
const ASSASSINATION_LEGACY_DATA: readonly string[] = [
  "src/data/game/ability-gcd-semantics.ts",
  "src/data/game/assassination-transition-authority.ts",
  "src/data/game/rogue-abilities.ts",
  "src/data/game/rogue-cooldowns.json",
  "src/data/game/rogue-cooldowns.ts",
  "src/data/game/rogue-dot-durations.json",
  "src/data/game/rogue-dot-durations.ts",
  "src/data/game/rogue-gcd-semantics.json",
  "src/data/game/rogue-item-effects.json",
  "src/data/game/rogue-item-effects.ts",
  "src/data/game/rogue-talents.json",
  "src/data/game/rogue-talents.ts",
  "src/data/game/stealth-readiness-authority.ts",
];

const ASSASSINATION_LOADER = "src/simc/pinned-authority.ts";

/** Who owns a module, for the purposes of R3/R5: a spec id, a class token, "shared", or a frozen owner. */
function ownerOf(
  path: string,
):
  | { readonly kind: "SPEC"; readonly specId: string }
  | { readonly kind: "CLASS"; readonly classToken: string }
  | { readonly kind: "SHARED" } {
  const tree = TREES.find((candidate) => path.startsWith(candidate.root));
  if (tree !== undefined) return { kind: "SPEC", specId: tree.specId };
  if (ASSASSINATION_LEGACY_DATA.includes(path) || path === ASSASSINATION_LOADER) {
    return { kind: "SPEC", specId: ASSASSINATION };
  }
  const spec = specOfDataModule(path) ?? specOfAplArtifact(path);
  if (spec !== null) return { kind: "SPEC", specId: spec };
  const classToken = classOfClassLevelDataModule(path);
  if (classToken !== null) return { kind: "CLASS", classToken };
  return { kind: "SHARED" };
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

describe("discovery", () => {
  it("finds every specialization tree, each registered one with a registration module", () => {
    expect(TREES.length).toBeGreaterThan(0);
    for (const tree of TREES) {
      expect(ROSTER_KEYS.has(tree.specId), `${tree.specId} is not a roster specialization`).toBe(true);
      if (UNREGISTERED_EVALUATOR_TREES.includes(tree.specId)) {
        expect(tree.files, tree.root).not.toContain(`${tree.root}registration.ts`);
      } else {
        expect(tree.files, tree.root).toContain(`${tree.root}registration.ts`);
      }
    }
  });

  it("the registered trees are exactly the known SpecIds, and every unregistered tree exists and is no SpecId", () => {
    expect(REGISTERED_TREES.map((tree) => tree.specId)).toEqual([...SPEC_IDS].sort());
    for (const specId of UNREGISTERED_EVALUATOR_TREES) {
      expect(
        TREES.map((tree) => tree.specId),
        specId,
      ).toContain(specId);
      expect([...SPEC_IDS] as string[], specId).not.toContain(specId);
    }
  });

  it("every frozen exception still exists, so the exception list cannot silently outlive its subject", () => {
    for (const path of [...ASSASSINATION_LEGACY_DATA, ASSASSINATION_LOADER]) {
      expect(ALL_FILES, path).toContain(path);
    }
  });
});

describe("R1 — one tree never imports another", () => {
  for (const tree of TREES) {
    it(`${tree.specId} imports no other tree`, () => {
      for (const file of tree.files) {
        for (const edge of importsOf(file)) {
          const other = TREES.find(
            (candidate) => candidate !== tree && edge.resolved.startsWith(candidate.root),
          );
          expect(other, `${edge.from} imports ${edge.specifier}`).toBeUndefined();
        }
      }
    });
  }
});

describe("R2 — spec-owned interpretation stays inside its tree", () => {
  it("outside src/specs, only the analyzer registry imports a tree, and only its registration.ts", () => {
    const importers = new Map<string, string[]>();
    for (const file of TS_FILES) {
      if (file.startsWith("src/specs/")) continue;
      for (const edge of importsOf(file)) {
        if (edge.resolved.startsWith("src/specs/")) {
          importers.set(file, [...(importers.get(file) ?? []), edge.resolved]);
        }
      }
    }
    expect([...importers.keys()]).toEqual(["src/services/analyzer-registry.ts"]);
    const imported = (importers.get("src/services/analyzer-registry.ts") ?? []).sort();
    expect(imported).toEqual(REGISTERED_TREES.map((tree) => `${tree.root}registration.ts`));
  });
});

describe("R3 — spec-owned data is consumed only by its owner", () => {
  const specOwnedOutsideTrees = ALL_FILES.filter((path) => {
    const owner = ownerOf(path);
    return owner.kind === "SPEC" && !path.startsWith("src/specs/");
  });

  it("finds spec-owned data for every tree, so the rule is not vacuous", () => {
    for (const tree of TREES) {
      const owned = specOwnedOutsideTrees.filter((path) => {
        const owner = ownerOf(path);
        return owner.kind === "SPEC" && owner.specId === tree.specId;
      });
      expect(owned.length, tree.specId).toBeGreaterThan(0);
    }
  });

  it.each(specOwnedOutsideTrees)("%s is imported only by its owning specialization", (path) => {
    const owner = ownerOf(path);
    if (owner.kind !== "SPEC") throw new Error("unreachable");
    for (const file of TS_FILES) {
      for (const edge of importsOf(file)) {
        if (edge.resolved !== path) continue;
        const importer = ownerOf(file);
        // The one frozen cross-layer edge: the shared engine imports a TYPE from
        // the generically named Assassination GCD module. A value import, or a
        // second such edge, fails here.
        if (file === "src/simc/first-gcd-selection.ts" && path === "src/data/game/ability-gcd-semantics.ts") {
          expect(edge.typeOnly, `${file} must import ${path} as a type only`).toBe(true);
          continue;
        }
        expect(
          importer.kind === "SPEC" && importer.specId === owner.specId,
          `${file} (${importer.kind === "SPEC" ? importer.specId : importer.kind}) imports ${path}, owned by ${owner.specId}`,
        ).toBe(true);
      }
    }
  });
});

describe("R4 — a tree imports only shared modules, itself, and its own class's data", () => {
  for (const tree of TREES) {
    it(`${tree.specId}`, () => {
      for (const file of tree.files) {
        for (const edge of importsOf(file)) {
          const owner = ownerOf(edge.resolved);
          const allowed =
            owner.kind === "SHARED" ||
            (owner.kind === "SPEC" && owner.specId === tree.specId) ||
            (owner.kind === "CLASS" && owner.classToken === tree.classToken);
          expect(allowed, `${edge.from} imports ${edge.specifier} (${JSON.stringify(owner)})`).toBe(true);
        }
      }
    });
  }
});

describe("R5 — class-level data is class data, not the first spec's", () => {
  it("classifies every src/data/game module as spec-owned, class-level or shared, with no ambiguity", () => {
    for (const path of ALL_FILES.filter((candidate) => candidate.startsWith("src/data/game/"))) {
      const spec = specOfDataModule(path);
      const classToken = classOfClassLevelDataModule(path);
      expect(spec !== null && classToken !== null, `${path} is both spec-owned and class-level`).toBe(false);
      // A class-named module that is NOT a frozen Assassination legacy dataset
      // is CLASS data by rule; today no such module exists, and the frozen
      // list is exactly the Rogue legacy set.
      if (classToken !== null) {
        expect(ASSASSINATION_LEGACY_DATA, `${path} is class-level data with no owner pinned`).toContain(path);
      }
    }
  });

  it("no tree imports another class's class-level data", () => {
    for (const tree of TREES) {
      for (const file of tree.files) {
        for (const edge of importsOf(file)) {
          const owner = ownerOf(edge.resolved);
          if (owner.kind === "CLASS")
            expect(owner.classToken, `${edge.from} imports ${edge.specifier}`).toBe(tree.classToken);
        }
      }
    }
  });
});

describe("R7 — the frozen exceptions are exactly these, and are not a pattern", () => {
  it("the Assassination loader in src/simc is imported only by the Assassination tree", () => {
    for (const file of TS_FILES) {
      for (const edge of importsOf(file)) {
        if (edge.resolved === ASSASSINATION_LOADER) {
          expect(
            file.startsWith("src/specs/rogue/assassination/"),
            `${file} imports ${ASSASSINATION_LOADER}`,
          ).toBe(true);
        }
      }
    }
  });

  it("no other module under src/simc imports an APL artifact or a specialization dataset", () => {
    for (const file of TS_FILES.filter(
      (path) => path.startsWith("src/simc/") && path !== ASSASSINATION_LOADER,
    )) {
      for (const edge of importsOf(file)) {
        const owner = ownerOf(edge.resolved);
        const isFrozenTypeEdge =
          file === "src/simc/first-gcd-selection.ts" &&
          edge.resolved === "src/data/game/ability-gcd-semantics.ts";
        expect(owner.kind === "SHARED" || isFrozenTypeEdge, `${file} imports ${edge.specifier}`).toBe(true);
      }
    }
  });

  it("every APL artifact is loaded from exactly one place, and that place belongs to its specialization", () => {
    const artifacts = ALL_FILES.filter((path) => specOfAplArtifact(path) !== null);
    for (const specId of AUTHORITY_FREE_REGISTERED_TREES) {
      expect(
        REGISTERED_TREES.map((tree) => tree.specId),
        specId,
      ).toContain(specId);
      expect(
        artifacts.map((artifact) => specOfAplArtifact(artifact)),
        specId,
      ).not.toContain(specId);
    }
    expect(artifacts.length).toBe(REGISTERED_TREES.length - AUTHORITY_FREE_REGISTERED_TREES.length);
    for (const artifact of artifacts) {
      const owner = ownerOf(artifact);
      const importers = TS_FILES.filter((file) => importsOf(file).some((edge) => edge.resolved === artifact));
      for (const importer of importers) {
        const importerOwner = ownerOf(importer);
        expect(
          importerOwner.kind === "SPEC" && owner.kind === "SPEC" && importerOwner.specId === owner.specId,
          `${importer} imports ${artifact}`,
        ).toBe(true);
      }
      expect(importers.length, artifact).toBeGreaterThan(0);
    }
  });

  it("the frozen list is the reviewed snapshot: a new generically named specialization dataset must not appear", () => {
    // Every module under src/data/game that is neither spec-named, nor
    // class-neutral by content, must be in the frozen list. Class-neutral
    // modules are recognised by NOT importing any spec-owned or class-level
    // file and NOT being class-named.
    for (const path of TS_FILES.filter((candidate) => candidate.startsWith("src/data/game/"))) {
      if (ASSASSINATION_LEGACY_DATA.includes(path) || specOfDataModule(path) !== null) continue;
      for (const edge of importsOf(path)) {
        const owner = ownerOf(edge.resolved);
        expect(owner.kind, `${path} is not frozen and not spec-named, yet imports ${edge.specifier}`).toBe(
          "SHARED",
        );
      }
    }
  });
});
