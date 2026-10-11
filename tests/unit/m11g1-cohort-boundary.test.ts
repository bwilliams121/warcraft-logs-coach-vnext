import { describe, expect, it } from "vitest";

import {
  CANDIDATE_CONTEXT_QUERY,
  COHORT_RANKINGS_QUERY,
  SUBJECT_PERFORMANCE_QUERY,
} from "../../src/wcl/cohort/cohort-queries.js";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";

/**
 * M11-G1 boundaries. The cohort domain is a barometer that nothing reads yet:
 * it reaches no event stream (R), it is imported by no analysis, authority or
 * finding code (U, V), and its committed evidence names no third party (T).
 */

const PRODUCTION_SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});
const G1_SOURCE = /^\.\.\/\.\.\/src\/(cohort|wcl\/cohort)\//;
const g1Sources = Object.entries(PRODUCTION_SOURCES).filter(([path]) => G1_SOURCE.test(path));
/** Every module specifier: `… from "x"`, a side-effect `import "x"`, and a dynamic `import("x")`. */
const importsOf = (source: string): string[] =>
  [
    ...source.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gms),
    ...source.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
    ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1] as string);

describe("R: G1 never requests an event stream", () => {
  it("has exactly the six G1 modules", () => {
    expect(g1Sources.map(([path]) => path.replace("../../src/", "")).sort()).toEqual([
      "cohort/cohort-config.ts",
      "cohort/cohort-discovery.ts",
      "cohort/cohort-selection.ts",
      "cohort/observed-performance.ts",
      "wcl/cohort/cohort-decoders.ts",
      "wcl/cohort/cohort-queries.ts",
    ]);
  });

  it("its three documents select no events field and read no event table beyond Deaths and DamageDone", () => {
    for (const query of [SUBJECT_PERFORMANCE_QUERY, COHORT_RANKINGS_QUERY, CANDIDATE_CONTEXT_QUERY]) {
      expect(query).not.toMatch(/\bevents\s*\(/);
      expect(query).not.toMatch(/dataType:\s*(?!DamageDone\b|Deaths\b)\w+/);
      expect(query).toContain("rateLimitData");
    }
    expect(COHORT_RANKINGS_QUERY).toContain("includeCombatantInfo: false");
  });

  it("imports no paginator, event fetcher or ingestion module", () => {
    // The engine is reached for exactly one thing: the shared gear adapter
    // (and, type-only, the GearPiece it returns), so enchant and gem state
    // keeps its KNOWN / KNOWN_NONE / UNKNOWN meaning.
    const ENGINE_ALLOWED = /\/engine\/normalization\/(combatant-info|normalized-events)\.js$/;
    for (const [path, source] of g1Sources) {
      for (const specifier of importsOf(source)) {
        const edge = `${path} -> ${specifier}`;
        if (/\/engine\//.test(specifier)) {
          expect(edge).toMatch(ENGINE_ALLOWED);
          continue;
        }
        expect(edge).not.toMatch(/events|paginat|ingest|normaliz|fetch-fight|graphql-client|token-provider/);
      }
      expect(source, path).not.toMatch(/^import\s+(?!type\b)[^;]*normalized-events\.js"/m);
    }
  });
});

describe("U/V: nothing reads the cohort domain", () => {
  it("no production module outside the G1 modules imports them", () => {
    const offenders = Object.entries(PRODUCTION_SOURCES)
      .filter(([path]) => !G1_SOURCE.test(path))
      .flatMap(([path, source]) =>
        importsOf(source)
          .filter((specifier) => /(^|\/)cohort\//.test(specifier))
          .map((specifier) => `${path} -> ${specifier}`),
      );
    expect(offenders).toEqual([]);
  });

  it("the G1 modules import no SimC, specialization, finding, analysis or report module", () => {
    for (const [path, source] of g1Sources) {
      for (const specifier of importsOf(source)) {
        expect(`${path} -> ${specifier}`).not.toMatch(
          /simc|\/specs\/|findings|analysis|report|services|scoring|coaching/,
        );
      }
    }
  });
});

describe("T: the committed G1 evidence is sanitized", () => {
  const files = Object.entries(committedEvidenceArchiveFiles()).filter(([path]) => path.includes("/wcl-g1-"));
  const SUBJECT_CODE = "b1PmaKrd6CDfzngc";

  it("holds the seven G1 artifacts", () => {
    expect(files).toHaveLength(7);
  });

  const visit = (value: unknown, onEntry: (key: string, value: unknown) => void): void => {
    if (Array.isArray(value)) for (const item of value) visit(item, onEntry);
    else if (value !== null && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        onEntry(key, inner);
        visit(inner, onEntry);
      }
    }
  };

  it("every name is a pseudonym, every server is null, every report code is the subject's or a cohort pseudonym", () => {
    for (const [path, text] of files) {
      const names = new Set<unknown>();
      visit(JSON.parse(text), (key, value) => {
        if (key === "name") names.add(value);
        if (key === "server") expect(value, path).toBeNull();
        if (key === "code") expect(value, path).toMatch(new RegExp(`^(${SUBJECT_CODE}|COHORT\\d{3}A{7})$`));
      });
      for (const name of names) expect(name, path).toMatch(/^(Player\d{4}|Actor\d+)$/);
    }
  });

  it("drops guilds, character ids, GUIDs, icons and parse ranks, and carries no credential shape", () => {
    const forbiddenKeys =
      /^(guild\w*|guid|icon|canonicalID|characterID|rankPercent|percentile|parsePercent|serverRegion|region)$/i;
    for (const [path, text] of files) {
      visit(JSON.parse(text), (key) => expect(key, path).not.toMatch(forbiddenKeys));
      expect(text.toLowerCase(), path).not.toMatch(
        /client_secret|access_token|authorization|bearer |wcl_client_secret|eyj[a-z0-9_-]{10,}/,
      );
    }
  });
});
