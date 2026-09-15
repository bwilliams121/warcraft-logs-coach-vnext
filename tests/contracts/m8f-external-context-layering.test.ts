/**
 * External context cannot become gameplay authority, and cannot fetch events.
 *
 * THE TWO FAILURES THIS GUARDS
 *
 *   AUTHORITY  a top-ranked external player is the single most tempting thing
 *              in this codebase to treat as a standard. The guard is the module
 *              graph in both directions, plus a vocabulary ban: this domain must
 *              be unable to spell MATCH, REJECTED, or an expected action.
 *
 *   EVENTS     M8-A measured one external full-event ingestion at 202
 *              subrequests against a budget already spending 810. The guard is
 *              that no module here can import an event query, a paginator, an
 *              ingestion function or a `CombatState`.
 */

import { describe, expect, it } from "vitest";

const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

function allPaths(): readonly string[] {
  return Object.keys(SOURCES)
    .map((key) =>
      key
        .replace(/^\.\.\/\.\.\//, "")
        .split("\\")
        .join("/"),
    )
    .sort();
}

function sourceOf(path: string): string {
  const entry = SOURCES[`../../${path}`];
  if (entry === undefined) throw new Error(`no source captured for ${path}`);
  return entry;
}

function importsOf(source: string): readonly string[] {
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^\n]*?from\s+["']([^"']+)["']/g)].map(
    (entry) => entry[1] ?? "",
  );
}

function codeOf(path: string): string {
  return sourceOf(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function segmentsOf(identifier: string): readonly string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/);
}

function declaredIdentifiers(path: string): readonly string[] {
  return [...codeOf(path).matchAll(/\b(\w+)\s*[?]?\s*:/g)].map((match) => match[1] ?? "");
}

const EXTERNAL_MODULES = allPaths().filter((path) => path.startsWith("src/external-context/"));
const RANKING_MODULES = allPaths().filter((path) => path.startsWith("src/wcl/rankings/"));
const M8F_MODULES = [...EXTERNAL_MODULES, ...RANKING_MODULES].sort();

describe("the M8-F domains exist and are fully covered by these checks", () => {
  it("captured every module", () => {
    expect(EXTERNAL_MODULES).toEqual([
      "src/external-context/candidate-pool.ts",
      "src/external-context/candidate-qualification.ts",
      "src/external-context/external-discovery.ts",
    ]);
    expect(RANKING_MODULES).toEqual([
      "src/wcl/rankings/candidate-metadata-query.ts",
      "src/wcl/rankings/rankings-decoder.ts",
      "src/wcl/rankings/rankings-query.ts",
    ]);
  });
});

describe("no external event ingestion is reachable", () => {
  it.each(M8F_MODULES)("%s imports no event or ingestion module", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      for (const forbidden of [
        "events-query",
        "paginator",
        "ingest-fight",
        "retrieval-plan",
        "combat-state",
      ]) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain(forbidden);
      }
    }
  });

  it.each(M8F_MODULES)("%s names no ingestion or combat-state symbol", (path) => {
    const code = codeOf(path);
    for (const banned of [
      "ingestFightCore",
      "ingestFight",
      "CombatState",
      "createCombatState",
      "CombatEvent",
      "EVENTS_QUERY",
      "paginateEventStream",
      "encounterEventsNear",
    ]) {
      expect(code, `${path} mentions ${banned}`).not.toContain(banned);
    }
  });

  it("no M8-F query document selects events", () => {
    const code = RANKING_MODULES.map(codeOf).join("\n");
    for (const banned of ["ReportEventPaginator", "dataType", "nextPageTimestamp", "includeResources"]) {
      expect(code, `a ranking query selects ${banned}`).not.toContain(banned);
    }
  });
});

describe("authority and external context are mutually isolated", () => {
  const AUTHORITY_MODULES = allPaths().filter(
    (path) => path.startsWith("src/specs/") || path.startsWith("src/simc/"),
  );

  it("found authority modules to check", () => {
    expect(AUTHORITY_MODULES.length).toBeGreaterThan(20);
  });

  it.each(M8F_MODULES)("%s imports no specialization or SimulationCraft module", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/specs/");
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/simc/");
    }
  });

  it.each(AUTHORITY_MODULES)("%s does not import external context", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/external-context/");
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/rankings/");
    }
  });

  it.each(M8F_MODULES)("%s names no analysis result type", (path) => {
    const code = codeOf(path);
    for (const banned of ["FightAnalysis", "ObservedActionComparison", "analyzeFight", "analyzerForSpec"]) {
      expect(code, `${path} mentions ${banned}`).not.toContain(banned);
    }
  });

  it.each(M8F_MODULES)("%s cannot spell an authority verdict", (path) => {
    // The QUOTED LITERAL, not the substring. `ENCOUNTER_MISMATCH` contains
    // "MATCH" and `REQUEST_REJECTED` contains "REJECTED", and both are honest
    // names for things that are not verdicts. An M5 outcome would be written as
    // the bare literal, so that is what is banned.
    const code = codeOf(path);
    expect(code, `${path} spells the MATCH verdict`).not.toMatch(/"MATCH"/);
    expect(code, `${path} spells the REJECTED verdict`).not.toMatch(/"REJECTED"/);
  });

  it("the verdict matcher is precise, not merely quiet", () => {
    // Proves the tightening above still catches a real verdict while allowing
    // the two legitimate compounds.
    expect('outcome: "MATCH"').toMatch(/"MATCH"/);
    expect('outcome: "REJECTED"').toMatch(/"REJECTED"/);
    expect('"ENCOUNTER_MISMATCH"').not.toMatch(/"MATCH"/);
    expect('"REQUEST_REJECTED"').not.toMatch(/"REJECTED"/);
  });
});

describe("the M8-B comparison domain stays pure", () => {
  it("comparison imports neither external context nor ranking transport", () => {
    for (const path of allPaths().filter((candidate) => candidate.startsWith("src/comparison/"))) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/external-context/");
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/rankings/");
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/wcl/");
      }
    }
  });

  it("external context calls M8-B rather than reimplementing a comparability rule", () => {
    const qualification = codeOf("src/external-context/candidate-qualification.ts");
    expect(qualification).toContain("assessPullComparability");
    // No local version/encounter/difficulty rule may be restated here.
    for (const banned of ["SAME_REPORT_REVISION", "EVIDENCE_CONTRADICTION", "FIELD_SEMANTICS_UNPROVEN"]) {
      expect(qualification, `qualification restates ${banned}`).not.toContain(banned);
    }
  });

  it("untyped ranking JSON is decoded outside the comparison domain", () => {
    for (const path of allPaths().filter((candidate) => candidate.startsWith("src/comparison/"))) {
      expect(codeOf(path), `${path} decodes ranking JSON`).not.toContain("rankings");
    }
  });
});

describe("the M8-D and M8-E domains are untouched by external context", () => {
  it("progression does not import external context", () => {
    for (const path of allPaths().filter((candidate) => candidate.startsWith("src/progression/"))) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/external-context/");
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/rankings/");
      }
    }
  });

  it("encounter context does not import external context", () => {
    for (const path of allPaths().filter((candidate) => candidate.startsWith("src/encounter-context/"))) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/external-context/");
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/rankings/");
      }
    }
  });

  it("external context does not import encounter-event context", () => {
    // M8-E is actor-global and EXACT only under FULL_RAID; external references
    // hold no events at all, so there is nothing for it to operate on.
    for (const path of M8F_MODULES) {
      for (const specifier of importsOf(sourceOf(path))) {
        expect(specifier, `${path} imports ${specifier}`).not.toContain("/encounter-context/");
      }
    }
  });
});

describe("the domain has nowhere to record a ranking, parse or judgement", () => {
  const BANNED_FIELD_WORDS = [
    "rank",
    "percentile",
    "percent",
    "parse",
    "score",
    "grade",
    "accuracy",
    "rating",
    "amount",
    "top",
    "best",
    "quality",
    "better",
    "worse",
    "optimal",
    "correct",
    "recommended",
    "expected",
    "representative",
    "typical",
    "consensus",
  ];

  /**
   * Identifiers vetted as legitimate despite matching a banned segment.
   *
   * Each is listed individually so an exception is a visible, argued decision
   * rather than a relaxed rule:
   *
   *   rankingPage, rankings   name the DISCOVERY SURFACE — which really is a
   *                           ranking board. Naming the source honestly is the
   *                           opposite of laundering it; what is banned is
   *                           carrying a POSITION out of that board.
   *   expectedEncounterId,    mean "what the query searched for", and exist to
   *   expectedDifficulty      detect a board row that disagrees with typed
   *                           evidence. Not an expected ACTION.
   */
  const VETTED_IDENTIFIERS = new Set([
    "rankingPage",
    "rankings",
    "expectedEncounterId",
    "expectedDifficulty",
  ]);

  it.each(BANNED_FIELD_WORDS)("no M8-F module declares anything named like `%s`", (word) => {
    for (const path of M8F_MODULES) {
      for (const identifier of declaredIdentifiers(path)) {
        if (VETTED_IDENTIFIERS.has(identifier)) continue;
        const offending = segmentsOf(identifier).some((segment) => segment.startsWith(word));
        expect(offending, `${path} declares ${identifier}`).toBe(false);
      }
    }
  });

  it("the vetted list is exhaustive and still meaningful", () => {
    // Every vetted identifier must actually be declared somewhere, so the list
    // cannot silently accumulate permissions for names nobody uses.
    const declared = new Set(M8F_MODULES.flatMap(declaredIdentifiers));
    for (const identifier of VETTED_IDENTIFIERS) {
      expect(declared.has(identifier), `${identifier} is vetted but not declared`).toBe(true);
    }
  });

  it("the banned-word matcher is precise, not merely quiet", () => {
    expect(segmentsOf("rankPercent").some((segment) => segment.startsWith("rank"))).toBe(true);
    expect(segmentsOf("parseScore").some((segment) => segment.startsWith("parse"))).toBe(true);
    // The identifiers that must NOT be flagged.
    expect(segmentsOf("reportedCount").some((segment) => segment.startsWith("rank"))).toBe(false);
    expect(segmentsOf("hardModeLevel").some((segment) => segment.startsWith("top"))).toBe(false);
  });

  it("reads no parse metric out of the ranking payload", () => {
    // `amount` is present in every live row. The decoder must never touch it.
    const decoder = codeOf("src/wcl/rankings/rankings-decoder.ts");
    expect(decoder).not.toContain('"amount"');
    expect(decoder).not.toContain('"rankPercent"');
    expect(decoder).not.toContain('"bracketPercent"');
  });

  it("names the pool without claiming representativeness", () => {
    const code = M8F_MODULES.map(codeOf).join("\n");
    expect(code).toContain("RANKINGS_DERIVED_REFERENCE_POOL");
    for (const banned of ["REPRESENTATIVE", "TYPICAL_PLAYERS", "PEER_AVERAGE", "COMMUNITY_CONSENSUS"]) {
      expect(code, `the domain declares ${banned}`).not.toContain(banned);
    }
  });
});

describe("the domain is deterministic and carries no wall clock", () => {
  it.each(M8F_MODULES)("%s reads no clock and generates no identifier", (path) => {
    const code = codeOf(path);
    for (const banned of [
      "Date.now",
      "new Date(",
      "Math.random",
      "crypto.",
      "randomUUID",
      "performance.now",
    ]) {
      expect(code, `${path} uses ${banned}`).not.toContain(banned);
    }
  });

  it.each(M8F_MODULES)("%s declares no retrieval-time or request-id field", (path) => {
    const pattern = /\b\w*(?:retrievedAt|requestId|uuid|wallClock)\w*\s*[?]?\s*:/i;
    const found = pattern.exec(codeOf(path));
    expect(found?.[0] ?? null, `${path} declares ${String(found?.[0])}`).toBeNull();
  });

  it("contains no pagination loop", () => {
    // One page. A `while`, or a `hasMorePages` used as a loop condition, is how
    // a bounded retrieval becomes a crawl.
    for (const path of M8F_MODULES) {
      const code = codeOf(path);
      expect(code, `${path} has a while loop`).not.toMatch(/\bwhile\s*\(/);
      expect(code, `${path} has a do-while`).not.toMatch(/\bdo\s*\{/);
    }
  });
});

describe("the frozen public contracts are untouched", () => {
  /**
   * The two contracts frozen before M8-F existed.
   *
   * NARROWED IN M8-G, DELIBERATELY. The original rule said NO contract may
   * import external context, which was right while no contract published it.
   * M8-G's whole purpose is a NEW document that does — so the rule now names the
   * documents it was actually protecting, rather than being deleted to make room.
   *
   * `encounter-context/1` is the sanctioned home for external references. These
   * two must never acquire them: a consumer of `analysis/1` or `raid-night/1`
   * must see the same document after M8 as before it.
   */
  const FROZEN_CONTRACT_MODULES = [
    "src/contracts/analysis-contract.ts",
    "src/contracts/analysis-projection.ts",
    "src/contracts/raid-night-contract.ts",
    "src/contracts/raid-night-projection.ts",
  ];

  it("the frozen contract modules all still exist", () => {
    // Guards the rule below against passing vacuously after a rename.
    for (const path of FROZEN_CONTRACT_MODULES) {
      expect(allPaths(), `missing ${path}`).toContain(path);
    }
  });

  it.each(FROZEN_CONTRACT_MODULES)("%s imports no external context or ranking transport", (path) => {
    for (const specifier of importsOf(sourceOf(path))) {
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/external-context/");
      expect(specifier, `${path} imports ${specifier}`).not.toContain("/rankings/");
    }
  });

  it("only the encounter-context projection may read external context", () => {
    // The one sanctioned exception, named explicitly so a second one has to be
    // added here in a diff rather than appearing quietly.
    const readers = allPaths()
      .filter((candidate) => candidate.startsWith("src/contracts/"))
      .filter((candidate) =>
        importsOf(sourceOf(candidate)).some((specifier) => specifier.includes("/external-context/")),
      );
    expect(readers).toEqual(["src/contracts/encounter-context-projection.ts"]);
  });

  it("M8-F declares no public schema or transport surface", () => {
    const code = M8F_MODULES.map(codeOf).join("\n");
    for (const banned of [
      "schemaVersion",
      "warcraft-logs-coach.",
      'from "zod"',
      "z.object",
      "structuredContent",
      "/v1/",
    ]) {
      expect(code, `the domain declares ${banned}`).not.toContain(banned);
    }
  });
});
