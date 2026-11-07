import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DecisionEncounterStateSchema,
  PUBLIC_REPORT_STATE_EVIDENCE,
  PUBLIC_SIMC_PROFILE_FACTS,
  ReportCarriedEntrySchema,
  ReportPrioritizedEntrySchema,
  SimcProfileEvaluationSchema,
} from "../../src/contracts/analysis-contract.js";
import { CellSimcProfileEvaluationSchema } from "../../src/contracts/raid-night-contract.js";
import { SIMC_PROFILE_EVALUATION_REVISION } from "../../src/findings/simc-profile-view.js";
import { SIMC_PROFILE_FACTS } from "../../src/findings/simc-profile-fallback.js";
import { analyzeToolDescription } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { raidNightToolDescription } from "../../src/mcp/tools/analyze-raid-night.js";
import { STATE_EVIDENCE_STATES } from "../../src/reporting/finding-record.js";
import { PUBLIC_SPECIALIZATION_DESCRIPTIONS } from "../../src/services/analyzer-registry.js";

/**
 * SIMC-FB-B contract: the additive field and what it can express.
 *
 * It is optional everywhere, so no earlier document is invalid. It can only state that the encounter state
 * was modeled: there is no way to write `encounterStateObserved: true`, and nowhere to put a confidence
 * move or an actionability change.
 */

const SEMANTIC = {
  semanticId: "ACTIVE_ENEMIES_IS_CONSTANT_ONE",
  sourcePath: "engine/sim/sim.cpp",
  sourceSha256: "a".repeat(64),
  startLine: 1,
  endLine: 2,
  excerptSha256: "b".repeat(64),
};
const SOURCE = {
  category: "SIMC_PROFILE_FALLBACK",
  datasetId: "SIMC_PROFILE_ENVIRONMENT",
  datasetRevision: "r",
  simcCommit: "c".repeat(40),
  clientBuild: "12.1.0.69933",
  environmentCommit: "d".repeat(40),
  aplAuthorityId: "SIMC_APL_ROGUE_ASSASSINATION",
  profilePath: "profiles/x.simc",
  profileSha256: "e".repeat(64),
  environment: {
    fightStyle: "Patchwerk",
    targetCount: 1,
    raidEventCount: 0,
    distanceTargetingEnabled: false,
  },
  semantics: [SEMANTIC],
};
const BLOCK = {
  revision: "simc-profile-evaluation/1",
  basis: "SIMC_PROFILE_RELATIVE",
  encounterStateObserved: false,
  coverage: { decisions: 1, match: 1, rejected: 0, unknown: 0 },
  sources: [SOURCE],
  findingEffect: { confidence: "NONE", suppression: "NONE", actionability: "NONE" },
};
const ENCOUNTER_STATE = {
  basis: "SIMC_PROFILE_RELATIVE",
  facts: [
    { fact: "ACTIVE_ENEMIES", atomKey: "active_enemies", semanticId: SEMANTIC.semanticId, sourceIndex: 0 },
  ],
};
const COMMON_ENTRY = {
  itemKind: "SINGLE",
  producer: "OBSERVED_DECISION_VIEW",
  authority: "A",
  actionability: "OBSERVED_EXECUTION_ONLY",
  subjectToken: "rupture",
  occurrences: 1,
  firstFightTimeMs: 1,
  lastFightTimeMs: 1,
  evidence: [
    { streamId: "s", pageOrdinal: 0, indexInPage: 0, ingestionOrdinal: 0, rawType: "cast", reportTimeMs: 1 },
  ],
};

describe("the vocabularies", () => {
  it("the public facts and states equal the internal ones, and the revision is the published literal", () => {
    expect([...PUBLIC_SIMC_PROFILE_FACTS]).toEqual([...SIMC_PROFILE_FACTS]);
    expect([...PUBLIC_REPORT_STATE_EVIDENCE]).toEqual([...STATE_EVIDENCE_STATES]);
    expect(SIMC_PROFILE_EVALUATION_REVISION).toBe(BLOCK.revision);
  });
});

describe("what the block can say", () => {
  it("accepts a valid block and a valid decision field", () => {
    expect(SimcProfileEvaluationSchema.safeParse(BLOCK).success).toBe(true);
    expect(DecisionEncounterStateSchema.safeParse(ENCOUNTER_STATE).success).toBe(true);
  });

  it("cannot state the encounter state as observed, or move confidence, suppression or actionability", () => {
    for (const invalid of [
      { ...BLOCK, encounterStateObserved: true },
      { ...BLOCK, basis: "OBSERVED" },
      { ...BLOCK, findingEffect: { ...BLOCK.findingEffect, confidence: "LOWERED" } },
      { ...BLOCK, findingEffect: { ...BLOCK.findingEffect, suppression: "SUPPRESSED" } },
      { ...BLOCK, findingEffect: { ...BLOCK.findingEffect, actionability: "ACTIONABLE" } },
      { ...BLOCK, sources: [] },
      { ...BLOCK, sources: [{ ...SOURCE, category: "WCL_OBSERVED_FACT" }] },
      { ...BLOCK, sources: [{ ...SOURCE, semantics: [] }] },
      { ...BLOCK, coverage: { ...BLOCK.coverage, decisions: 0 } },
      { ...BLOCK, score: 1 },
      { ...BLOCK, enemyCount: 1 },
    ]) {
      expect(SimcProfileEvaluationSchema.safeParse(invalid).success, JSON.stringify(invalid)).toBe(false);
    }
    expect(
      CellSimcProfileEvaluationSchema.safeParse({
        basis: "SIMC_PROFILE_RELATIVE",
        encounterStateObserved: true,
        coverage: BLOCK.coverage,
        sources: [],
      }).success,
    ).toBe(false);
  });

  it("a decision's field needs a known fact, and refuses an observed basis or an extra value", () => {
    for (const invalid of [
      { ...ENCOUNTER_STATE, basis: "OBSERVED" },
      { ...ENCOUNTER_STATE, facts: [] },
      { ...ENCOUNTER_STATE, facts: [{ ...ENCOUNTER_STATE.facts[0], fact: "ENEMY_COUNT_OBSERVED" }] },
      { ...ENCOUNTER_STATE, facts: [{ ...ENCOUNTER_STATE.facts[0], value: 1 }] },
      { ...ENCOUNTER_STATE, enemies: 1 },
    ]) {
      expect(DecisionEncounterStateSchema.safeParse(invalid).success, JSON.stringify(invalid)).toBe(false);
    }
  });
});

describe("report entries", () => {
  const prioritized = {
    ...COMMON_ENTRY,
    section: "PRIORITIZED",
    position: 1,
    disposition: "AUTHORITY_DIVERGENCE",
    standing: "DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN",
    reasonCode: null,
    suppressionReason: null,
  };
  const carried = {
    ...COMMON_ENTRY,
    section: "CARRIED",
    position: null,
    disposition: "UNKNOWN",
    standing: "UNKNOWN",
    reasonCode: "TARGET_COUNT",
    suppressionReason: null,
  };

  it("a divergence is proven or profile-relative, never incomplete", () => {
    const parse = (stateEvidence: string) =>
      ReportPrioritizedEntrySchema.safeParse({ ...prioritized, stateEvidence }).success;
    expect(parse("PROVEN")).toBe(true);
    expect(parse("SIMC_PROFILE_RELATIVE")).toBe(true);
    expect(parse("INCOMPLETE")).toBe(false);
  });

  it("a carried entry resolved nothing under the profile", () => {
    const parse = (stateEvidence: string) =>
      ReportCarriedEntrySchema.safeParse({ ...carried, stateEvidence }).success;
    expect(parse("INCOMPLETE")).toBe(true);
    expect(parse("SIMC_PROFILE_RELATIVE")).toBe(false);
  });
});

describe("what the tools tell their reader", () => {
  const flatten = (text: string): string => text.replace(/\s+/g, " ");
  const analysis = flatten(analyzeToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS));
  const raidNight = flatten(raidNightToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS));

  it.each([
    "evaluated under the pinned SimC profile assumptions",
    "was not observed in this fight",
    "it does NOT say how many enemies or targets the fight held",
    "A decision without encounterState is an observed-fight evaluation",
  ])("the analysis tool says: %s", (phrase) => {
    expect(analysis).toContain(phrase);
  });

  it.each([
    "simcProfileRelativeRejectedPatterns",
    "evaluated under the pinned SimC profile assumptions",
    "they do NOT say how many enemies or targets a fight held",
  ])("the raid-night tool says: %s", (phrase) => {
    expect(raidNight).toContain(phrase);
  });
});

describe("a specialization that reads the fallback must disclose it", () => {
  const sourcesUnder = (root: string): string[] =>
    (readdirSync(root, { recursive: true, withFileTypes: false }) as string[])
      .filter((path) => path.endsWith(".ts"))
      .map((path) => join(root, path));

  it("every specialization source calling withEncounterStateAt carries profileFacts into its view", () => {
    const readers = sourcesUnder("src/specs").filter((path) =>
      readFileSync(path, "utf8").includes("withEncounterStateAt("),
    );
    for (const path of readers) {
      const specDirectory = path.split(/[\\/]/).slice(0, 4).join("/");
      const carried = sourcesUnder(specDirectory).some((file) =>
        /simcProfileFactsField\(|simcProfileFacts:/.test(readFileSync(file, "utf8")),
      );
      expect(carried, `${path} reads the fallback and discloses nothing`).toBe(true);
    }
  });

  it("the projectors read the disclosure from the view, and never import the fallback", () => {
    for (const path of [
      "src/contracts/analysis-projection.ts",
      "src/contracts/raid-night-projection.ts",
      "src/reporting/restatement.ts",
      "src/reporting/tldr.ts",
      "src/reporting/fight-report.ts",
      "src/aggregation/cell-projection.ts",
    ]) {
      expect(readFileSync(path, "utf8"), path).not.toContain("simc-profile-fallback");
    }
  });
});
