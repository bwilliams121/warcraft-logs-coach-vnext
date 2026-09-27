/**
 * M10-D: corpus-only evaluation machinery never reaches production analysis.
 * M11-A1: nor can the corpus EVIDENCE MODEL or the test-owned promotion gate.
 *
 * The Protection Paladin steady-state evidence is exercised by the corpus
 * through a BUNDLE of artifacts with declared holes and an evaluation window
 * that narrows which decisions an aggregate assertion counts. All of that is
 * test harness (`tests/support/corpus/`), and it must stay there: a public
 * request analyzes the fight the ingestion port retrieved, whole, and the
 * public totals a reader sees are over that fight — never over a window a
 * test chose.
 *
 * M11 adds a second thing production must never learn: which corpus cases
 * exist, what lineage an artifact has, and which spec layer owns which cases.
 * The public-promotion rule ("a PUBLIC spec needs a real-evidence MATCH or
 * REJECTED") is a TEST-TIME gate that joins the production catalog against
 * the corpus manifest. If production ever carried a case id, a layer map or a
 * lineage check, the analyzer would be coupled to its own test evidence and
 * the gate could be satisfied from inside. So the guards below are of three
 * kinds, all on CODE with comments stripped:
 *
 *   - IMPORT BOUNDARY: every relative import from `src/` resolves inside
 *     `src/`; nothing reaches `tests/`, `scripts/`, `.probe/` or a JSON file
 *     outside the tree; and no `src/` module reads the filesystem or globs
 *     the module graph, which are the only ways to read a manifest at all.
 *   - TEST-ONLY IDENTIFIERS: names that have NO production meaning — corpus
 *     bundle/window vocabulary (M10-D), corpus case/lineage/ownership
 *     vocabulary and the promotion-gate vocabulary (M11-A1) — may not appear.
 *   - SCOPED EVIDENCE CITATIONS: `SANITIZED_CAPTURE` is NOT banned outright.
 *     It is a legitimate production concept in exactly two modules — the
 *     evidence-gated event-family registry and the capability registry cite
 *     the sanitized fixture that verified them (M3). Those two citation sites
 *     are pinned as the ONLY ones, so a lineage check cannot arrive under the
 *     same name elsewhere. Likewise `artifactRevision` and `authorityId` are
 *     production authority-provenance fields and are untouched; what is
 *     banned is the corpus's `artifactId` / `caseId` identity vocabulary,
 *     which production has never had a use for.
 *
 * Why not one naive substring list: "artifact", "provenance", "capture" and
 * "evidence" are ordinary production words (authority artifacts, DBC
 * artifacts, evidence locators). A guard that forbade them would be edited
 * around within a week. A guard that forbids exact test-only identifiers and
 * pins the boundary by import path is one nobody needs to edit around.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

function filesUnder(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: false })
    .map((entry) => `${root}/${String(entry).replace(/\\/g, "/")}`)
    .filter((path) => statSync(path).isFile() && path.endsWith(".ts"))
    .sort();
}

/** Source with comments stripped: the prohibitions are on CODE. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const CORPUS_ONLY_IDENTIFIERS = [
  "evaluationWindow",
  "declaredHoles",
  "historyArtifactIds",
  "stateOfBundle",
  "bundleOverEvidence",
  "corpusBundle",
  "BundleHole",
  "BundleComposition",
  "certifiedEmpty",
  "retainedCoverage",
];

/**
 * M11-A1: the corpus evidence model and the test-owned promotion gate.
 *
 * Exact identifiers, matched on word boundaries. Every one is defined by (or
 * reserved for) `tests/support/corpus/` or the M11 promotion gate and none
 * has a production meaning: production identifies an authority by
 * `authorityId` and `artifactRevision`, never by a corpus `artifactId`; it
 * has no cases, no layers, no lineage, no derivations and no readiness.
 */
const CORPUS_MODEL_AND_PROMOTION_IDENTIFIERS = [
  // corpus identity and ownership
  "artifactId",
  "caseId",
  "owningLayer",
  "OWNING_LAYERS",
  "SPEC_LAYER_OF",
  "referencedArtifactIds",
  "parentArtifactId",
  "contractUnderTest",
  // corpus lineage (SANITIZED_CAPTURE is scoped separately, below)
  "DERIVED_FROM_CAPTURE",
  "REAL_CAPTURE",
  "LEGACY_FIXTURE_COPY",
  "derivationCertificate",
  // corpus machinery entry points
  "runCorpusHarness",
  "loadCorpus",
  "corpusFight",
  "corpusState",
  "corpusBundleState",
  "committedEventArray",
  "KNOWN_EVIDENCE_GAPS",
  // the test-owned promotion gate
  "matchCaseIds",
  "rejectedCaseIds",
  "promotionEvidence",
  "evidenceReady",
  "qualifyingAssertions",
  // M11-C4h: the two promotion gates and the negative-control lineage
  "observationGate",
  "discriminationGate",
  "SINGLE_CAST_ABILITY_SUBSTITUTION",
  "OBSERVED_TOKEN_APPLICABILITY",
];

/**
 * The ONLY production modules that may name `SANITIZED_CAPTURE`, and only as
 * the `kind` of an evidence citation (M3). Anywhere else the word is a
 * lineage check that does not belong in production.
 */
const SANITIZED_CAPTURE_CITATION_SITES = [
  "src/engine/normalization/supported-families.ts",
  "src/wcl/evidence-capability.ts",
];

/** `from "../x/y.js"` in `src/a/b.ts` -> the repo-relative path `src/x/y.js`. */
function resolveRelativeImport(from: string, specifier: string): string {
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

/** Static and dynamic import specifiers in one module's code. */
function importSpecifiersOf(code: string): readonly string[] {
  const specifiers: string[] = [];
  const statics = /(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g;
  for (const match of code.matchAll(statics)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  const dynamics = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of code.matchAll(dynamics)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

describe("production analysis carries no corpus-only window or bundle logic", () => {
  const sources = filesUnder("src");

  it("scans a non-trivial production tree", () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it("no src/ module names a corpus-only concept", () => {
    const offenders: string[] = [];
    for (const path of sources) {
      const code = codeOf(path);
      for (const identifier of CORPUS_ONLY_IDENTIFIERS) {
        if (code.includes(identifier)) offenders.push(`${path}: ${identifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no src/ module imports from tests/", () => {
    const offenders = sources.filter((path) => /from\s+["'][^"']*\/tests\//.test(codeOf(path)));
    expect(offenders).toEqual([]);
  });

  it("the bundle and window machinery exists where it belongs", () => {
    // The guard is meaningful only if the concepts are real somewhere.
    const harness = codeOf("tests/support/corpus/fight.ts");
    expect(harness).toContain("bundleOverEvidence");
    expect(harness).toContain("declaredHoles");
    const executor = codeOf("tests/support/corpus/executors/spec-protection-paladin.ts");
    expect(executor).toContain("evaluationWindow");
  });
});

describe("production cannot be coupled to the corpus evidence model or the promotion gate (M11-A1)", () => {
  const sources = filesUnder("src");

  it("every relative import from src/ resolves inside src/", () => {
    // Which also rules out a JSON, a fixture or a manifest outside the tree:
    // a relative specifier that climbs out of `src/` resolves elsewhere.
    const offenders: string[] = [];
    for (const path of sources) {
      for (const specifier of importSpecifiersOf(codeOf(path))) {
        if (!specifier.startsWith(".")) continue;
        const resolved = resolveRelativeImport(path, specifier);
        if (!resolved.startsWith("src/")) offenders.push(`${path} -> ${specifier} (${resolved})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no src/ module imports from tests/, scripts/ or .probe/ by any spelling", () => {
    const pattern = /from\s+["'][^"']*(?:\/tests\/|\/scripts\/|\/\.probe\/|^tests\/|^scripts\/)/;
    const offenders = sources.filter((path) => pattern.test(codeOf(path)));
    expect(offenders).toEqual([]);
  });

  it("no src/ module reads the filesystem or globs the module graph", () => {
    // The two mechanisms by which production could read a manifest at all.
    const offenders: string[] = [];
    for (const path of sources) {
      const code = codeOf(path);
      for (const banned of ["node:fs", "import.meta.glob", "readFileSync", "readdirSync"]) {
        if (code.includes(banned)) offenders.push(`${path}: ${banned}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no src/ module names a corpus identity, lineage, ownership or promotion identifier", () => {
    const offenders: string[] = [];
    for (const path of sources) {
      const code = codeOf(path);
      for (const identifier of CORPUS_MODEL_AND_PROMOTION_IDENTIFIERS) {
        if (new RegExp(`\\b${identifier}\\b`).test(code)) offenders.push(`${path}: ${identifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("SANITIZED_CAPTURE appears only at the two evidence-citation sites, and only as a citation kind", () => {
    const naming = sources.filter((path) => /\bSANITIZED_CAPTURE\b/.test(codeOf(path)));
    expect(naming).toEqual(SANITIZED_CAPTURE_CITATION_SITES);
    for (const path of naming) {
      const code = codeOf(path);
      // Every occurrence is `kind: "SANITIZED_CAPTURE"` — a citation of the
      // fixture that verified an event family or a capability — never a
      // comparison, a branch or a lineage predicate.
      const occurrences = code.match(/\bSANITIZED_CAPTURE\b/g) ?? [];
      const citations = code.match(/kind:\s*"SANITIZED_CAPTURE"/g) ?? [];
      expect(citations.length, path).toBe(occurrences.length);
      expect(code, path).not.toMatch(/===\s*"SANITIZED_CAPTURE"|"SANITIZED_CAPTURE"\s*===/);
    }
  });

  it("no production file lives under a corpus-, fixture- or promotion-named directory", () => {
    const offenders = sources.filter((path) => /\/(?:corpus|fixtures?|promotion)[^/]*\//.test(path));
    expect(offenders).toEqual([]);
  });

  it("the corpus model identifiers are real, where they belong", () => {
    // Meaningful only if the banned names exist somewhere: the loader and the
    // manifest contract are where the evidence model lives.
    const loader = codeOf("tests/support/corpus/loader.ts");
    for (const identifier of ["artifactId", "caseId", "referencedArtifactIds", "parentArtifactId"]) {
      expect(loader, identifier).toContain(identifier);
    }
    const contract = codeOf("tests/support/corpus/contract.ts");
    expect(contract).toContain("OWNING_LAYERS");
    expect(contract).toContain("DERIVED_FROM_CAPTURE");
  });
});
