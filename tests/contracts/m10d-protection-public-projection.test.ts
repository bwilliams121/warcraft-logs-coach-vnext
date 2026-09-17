/**
 * M10-D: the public projection of a Protection Paladin analysis is TOTAL over
 * every internal vocabulary, applies exactly one transformation, and leaks
 * nothing internal.
 *
 * WHAT "TOTAL" MEANS HERE
 *
 * Every value the Protection payload can carry in a field the view publishes
 * — exclusion reason, comparison outcome, basis, authority coverage, selection
 * precision, blocker class, usability provenance, analysis status — has a
 * public value, and that value is a member of the frozen `analysis/1` enum.
 * The shared vocabularies are pinned equal to the public ones elsewhere
 * (`m6c-analysis-contract`); this file pins the ONE Protection-owned
 * vocabulary (the exclusion reasons) and then proves the whole claim over the
 * real evidence by projecting every committed Protection input and validating
 * the document.
 *
 * THE ONE TRANSFORMATION
 *
 * `MELEE_SWING → NON_GCD_ACTION`, applied per excluded cast and to the
 * coverage tally, where rows sharing a public reason merge. Counts reconcile
 * before and after: the cell projection re-checks that arithmetic, and it is
 * asserted here on the real opener.
 */

import { describe, expect, it } from "vitest";

import { toPlayerFightCell } from "../../src/aggregation/cell-projection.js";
import {
  PUBLIC_ANALYSIS_STATUSES,
  PUBLIC_AUTHORITY_COVERAGES,
  PUBLIC_COMPARISON_BASES,
  PUBLIC_COMPARISON_OUTCOMES,
  PUBLIC_DECISION_BLOCKER_CLASSES,
  PUBLIC_EXCLUSION_REASONS,
  PUBLIC_SELECTION_PRECISIONS,
  PUBLIC_USABILITY_PROVENANCES,
  PublicAnalysisResultSchema,
} from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import { ANALYSIS_STATUSES } from "../../src/findings/analysis-envelope.js";
import { AUTHORITY_RESOLUTION_OUTCOMES } from "../../src/findings/authority-domain.js";
import type { FightAnalysis } from "../../src/services/result.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import type { CombatState } from "../../src/engine/state/combat-state.js";
import {
  analyzeObservedProtectionPaladinDecisions,
  PROTECTION_EXCLUSION_REASONS,
  type ProtectionPaladinAnalysis,
} from "../../src/specs/paladin/protection/observed-analysis.js";
import {
  PROTECTION_EXCLUSION_PUBLIC_PROJECTION,
  PROTECTION_PALADIN_REGISTRATION,
  PROTECTION_PUBLIC_EXCLUSION_ORDER,
  projectProtectionExclusionTally,
  protectionObservedDecisionView,
} from "../../src/specs/paladin/protection/registration.js";
import { PROTECTION_OFFENSIVE_AUTHORITY } from "../../src/specs/paladin/protection/authority-bindings.js";
import { PROTECTION_PALADIN_ANALYZER_ID } from "../../src/specs/paladin/protection/spec.js";
import { corpusBundleState, corpusState } from "../support/corpus/fight.js";

const PROT_ACTOR = 7;
const OPENER = "wcl-protection-paladin-a7r6-opener";
const ROTATIONAL = "wcl-protection-paladin-a7r6-rotational-45s";
const SEG = "wcl-protection-paladin-a7r6-rotational-165s";
const BUNDLE = [
  ROTATIONAL,
  `${SEG}.seg-45-60`,
  `${SEG}.seg-60-90`,
  `${SEG}.seg-90-120`,
  `${SEG}.seg-120-165`,
];
const GAP_HOLE = { fromReportTimeMs: 2_064_590, toReportTimeMs: 2_124_589 };

type Analyzed = Extract<ProtectionPaladinAnalysis, { status: "ANALYZED" }>;

function analyzed(state: CombatState): Analyzed {
  const analysis = PROTECTION_PALADIN_REGISTRATION.analyze({
    state,
    actorId: PROT_ACTOR,
    specId: "paladin/protection",
    targetActorId: null,
  }) as ProtectionPaladinAnalysis;
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}

/** The application envelope the service builds around a Protection analysis. */
function fightAnalysisOf(state: CombatState, analysis: Analyzed): FightAnalysis {
  const { fight } = state;
  const identity: FightIdentity = {
    report: {
      code: fight.report.code,
      revision: fight.report.revision,
      startTime: fight.report.startTimeUnixMs,
      endTime: fight.report.endTimeUnixMs,
    },
    data: fight.data,
    fight: {
      id: fight.fight.id,
      name: fight.fight.name,
      encounterId: fight.fight.encounterId,
      difficulty: fight.fight.difficulty,
      startTime: fight.fight.startTimeMs,
      endTime: fight.fight.endTimeMs,
    },
    player: { sourceId: PROT_ACTOR, name: "Corpusplayer", className: "Paladin", specName: "Protection" },
  };
  return {
    identity,
    specId: "paladin/protection",
    analyzerId: PROTECTION_PALADIN_ANALYZER_ID,
    scope: "PLAYER_CONTEXT",
    analysis,
    observedDecisions: PROTECTION_PALADIN_REGISTRATION.observedDecisionView(analysis),
  };
}

const INPUTS: readonly { readonly label: string; readonly state: () => CombatState }[] = [
  { label: "opener", state: () => corpusState(OPENER) },
  { label: "opener gap", state: () => corpusState(`${OPENER}.gap-before-2010000`) },
  { label: "45 s slice", state: () => corpusState(ROTATIONAL) },
  { label: "45 s gap", state: () => corpusState(`${ROTATIONAL}.gap-before-2026589`) },
  { label: "165 s bundle", state: () => corpusBundleState(BUNDLE, []) },
  {
    label: "165 s gap bundle",
    state: () => corpusBundleState([ROTATIONAL, `${SEG}.seg-45-60`, `${SEG}.seg-120-165`], [GAP_HOLE]),
  },
];

describe("the exclusion-reason projection is total and lands inside the public enum", () => {
  it("maps every internal reason, and only onto public reasons", () => {
    expect(Object.keys(PROTECTION_EXCLUSION_PUBLIC_PROJECTION).sort()).toEqual(
      [...PROTECTION_EXCLUSION_REASONS].sort(),
    );
    for (const reason of PROTECTION_EXCLUSION_REASONS) {
      expect(PUBLIC_EXCLUSION_REASONS as readonly string[]).toContain(
        PROTECTION_EXCLUSION_PUBLIC_PROJECTION[reason],
      );
    }
    expect(PROTECTION_EXCLUSION_PUBLIC_PROJECTION).toEqual({
      MELEE_SWING: "NON_GCD_ACTION",
      NON_GCD_ACTION: "NON_GCD_ACTION",
      EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
      NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
    });
    // The public vocabulary itself is unchanged by M10-D.
    expect(PUBLIC_EXCLUSION_REASONS).toEqual([
      "NON_GCD_ACTION",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "NO_AUTHORITY_TOKEN_BINDING",
    ]);
  });

  it("emits the projected tally in one deterministic order that equals the public order", () => {
    expect(PROTECTION_PUBLIC_EXCLUSION_ORDER).toEqual([...PUBLIC_EXCLUSION_REASONS]);
  });

  it("merges rows sharing a public reason by summing, preserves the total, and omits zero rows", () => {
    const merged = projectProtectionExclusionTally([
      { key: "MELEE_SWING", count: 11 },
      { key: "NON_GCD_ACTION", count: 11 },
      { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 1 },
      { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
    ]);
    expect(merged).toEqual([
      { key: "NON_GCD_ACTION", count: 22 },
      { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 1 },
      { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
    ]);
    expect(merged.reduce((sum, row) => sum + row.count, 0)).toBe(24);
    // Order of the internal rows does not change the projected rows.
    expect(
      projectProtectionExclusionTally([
        { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
        { key: "NON_GCD_ACTION", count: 11 },
        { key: "MELEE_SWING", count: 11 },
        { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 1 },
      ]),
    ).toEqual(merged);
    // Only swings: one row, no zero rows for the others.
    expect(projectProtectionExclusionTally([{ key: "MELEE_SWING", count: 3 }])).toEqual([
      { key: "NON_GCD_ACTION", count: 3 },
    ]);
    expect(projectProtectionExclusionTally([])).toEqual([]);
  });
});

describe("over the real opener", () => {
  const state = corpusState(OPENER);
  const analysis = analyzed(state);
  const view = protectionObservedDecisionView(analysis);

  it("keeps MELEE_SWING in the payload and publishes NON_GCD_ACTION in its place", () => {
    expect(analysis.excluded.filter((cast) => cast.reason === "MELEE_SWING")).toHaveLength(11);
    expect(analysis.coverage.exclusions).toEqual([
      { key: "MELEE_SWING", count: 11 },
      { key: "NON_GCD_ACTION", count: 11 },
      { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 1 },
      { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
    ]);
    expect(view.exclusions.map((record) => record.reason)).not.toContain("MELEE_SWING");
    expect(view.exclusions.filter((record) => record.reason === "NON_GCD_ACTION")).toHaveLength(22);
    expect(view.coverage.exclusions).toEqual([
      { key: "NON_GCD_ACTION", count: 22 },
      { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 1 },
      { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
    ]);
    expect(view.coverage.excludedCastCount).toBe(24);
    expect(view.exclusions).toHaveLength(24);
  });

  it("reconciles: the cell projection accepts the projected counts", () => {
    const projection = toPlayerFightCell({
      analysis: fightAnalysisOf(state, analysis),
      normalizationRevision: state.fight.provenance.normalizationRevision,
    });
    expect(projection.ok).toBe(true);
    if (!projection.ok) return;
    expect(projection.cell.kind).toBe("ANALYZED");
    if (projection.cell.kind !== "ANALYZED") return;
    expect(projection.cell.counts.excludedCastCount).toBe(24);
    expect(projection.cell.counts.exclusions.reduce((sum, row) => sum + row.count, 0)).toBe(24);
    expect(projection.cell.recurrence.exclusionPatterns.map((row) => row.key)).not.toContain(
      expect.stringContaining("MELEE_SWING"),
    );
  });

  it("publishes the pinned public totals", () => {
    const projected = projectAnalysisResult(fightAnalysisOf(state, analysis));
    if (projected.status !== "ANALYZED") throw new Error(projected.status);
    expect(projected.coverage).toEqual({
      eligibleDecisions: 21,
      match: 0,
      rejected: 0,
      unknown: 21,
      resolvedComparisons: 0,
      exactEntryMatches: 0,
      tokenConvergedMatches: 0,
      selectionPrecision: [{ key: "UNKNOWN", count: 21 }],
      unknownBases: [{ key: "AUTHORITY_SELECTION_UNRESOLVED", count: 21 }],
      unknownBlockerClasses: [{ key: "DIVERGENT_WORLDS", count: 21 }],
      exclusions: [
        { key: "NON_GCD_ACTION", count: 22 },
        { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 1 },
        { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
      ],
      excludedCastCount: 24,
    });
  });
});

describe("every committed Protection input projects to a valid document with no internal leak", () => {
  /** Every property name appearing anywhere in a JSON value. */
  function keysOf(value: unknown, into = new Set<string>()): Set<string> {
    if (Array.isArray(value)) value.forEach((entry) => keysOf(entry, into));
    else if (value !== null && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        into.add(key);
        keysOf(entry, into);
      }
    }
    return into;
  }

  const WITHHELD_KEYS = [
    "rawBlocker",
    "observedActionRejected",
    "actorId",
    "domains",
    "holyPower",
    "build",
    "resolved",
    "diagnostics",
    "auras",
    "cooldowns",
    "selection",
    "scope",
  ];
  const INTERNAL_STRINGS = [
    "MELEE_SWING",
    "TRANSITION_UNSUPPORTED",
    "DIVERGENT_GCD_OUTCOMES",
    "STATE_NOT_MODELLED",
    "STATE_NOT_ESTABLISHED",
    "NO_PINNED_AUTHORITY_FOR_DOMAIN",
    "AUTHORITY_LOAD_FAILED",
    "DOMAIN_NOT_DECLARED",
    "offensiveAuthorityGoverns",
  ];

  for (const input of INPUTS) {
    it(`${input.label}: schema-valid, every vocabulary value public, nothing withheld reaches the wire`, () => {
      const state = input.state();
      const analysis = analyzed(state);
      const projected = projectAnalysisResult(fightAnalysisOf(state, analysis));
      expect(PublicAnalysisResultSchema.safeParse(projected).success).toBe(true);
      if (projected.status !== "ANALYZED") throw new Error(projected.status);

      for (const decision of projected.decisions) {
        expect(PUBLIC_COMPARISON_OUTCOMES as readonly string[]).toContain(decision.outcome);
        expect(PUBLIC_COMPARISON_BASES as readonly string[]).toContain(decision.basis);
        expect(PUBLIC_AUTHORITY_COVERAGES as readonly string[]).toContain(decision.authorityCoverage);
        expect(PUBLIC_USABILITY_PROVENANCES as readonly string[]).toContain(decision.usabilityProvenance);
        if (decision.selectionPrecision !== null) {
          expect(PUBLIC_SELECTION_PRECISIONS as readonly string[]).toContain(decision.selectionPrecision);
        }
        if (decision.decisiveBlocker !== null) {
          expect(PUBLIC_DECISION_BLOCKER_CLASSES as readonly string[]).toContain(decision.decisiveBlocker);
        }
      }
      for (const exclusion of projected.exclusions) {
        expect(PUBLIC_EXCLUSION_REASONS as readonly string[]).toContain(exclusion.reason);
      }
      // The three outcomes partition the eligible decisions, and the tally sums to the count.
      const { coverage } = projected;
      expect(coverage.match + coverage.rejected + coverage.unknown).toBe(coverage.eligibleDecisions);
      expect(coverage.eligibleDecisions).toBe(projected.decisions.length);
      expect(coverage.exclusions.reduce((sum, row) => sum + row.count, 0)).toBe(coverage.excludedCastCount);
      expect(coverage.excludedCastCount).toBe(projected.exclusions.length);

      const json = JSON.stringify(projected);
      for (const internal of INTERNAL_STRINGS) expect(json, internal).not.toContain(internal);
      const keys = keysOf(projected);
      for (const withheld of WITHHELD_KEYS) expect(keys.has(withheld), withheld).toBe(false);
    });
  }

  it("the 45 s slice publishes its one real MATCH, and the bundle its four, unchanged by exposure", () => {
    const slice = corpusState(ROTATIONAL);
    const sliceDoc = projectAnalysisResult(fightAnalysisOf(slice, analyzed(slice)));
    if (sliceDoc.status !== "ANALYZED") throw new Error(sliceDoc.status);
    expect(sliceDoc.coverage).toMatchObject({ eligibleDecisions: 47, match: 1, rejected: 0, unknown: 46 });
    const divineToll = sliceDoc.decisions.find((decision) => decision.outcome === "MATCH");
    expect(divineToll).toMatchObject({
      observedToken: "divine_toll",
      authorityToken: "divine_toll",
      selectionPrecision: "EXACT_ENTRY",
      locator: { reportTimeMs: 2_026_655 },
    });

    const bundle = corpusBundleState(BUNDLE, []);
    const bundleDoc = projectAnalysisResult(fightAnalysisOf(bundle, analyzed(bundle)));
    if (bundleDoc.status !== "ANALYZED") throw new Error(bundleDoc.status);
    expect(bundleDoc.coverage).toMatchObject({ eligibleDecisions: 149, match: 4, rejected: 0, unknown: 145 });
    expect(
      bundleDoc.decisions
        .filter((decision) => decision.outcome === "MATCH")
        .map((decision) => [decision.observedToken, decision.locator.reportTimeMs]),
    ).toEqual([
      ["divine_toll", 2_026_655],
      ["avengers_shield", 2_074_381],
      ["divine_toll", 2_088_835],
      ["avengers_shield", 2_139_100],
    ]);
  });
});

describe("the non-analyzed statuses and their details", () => {
  it("every analysis status Protection can return is a public status", () => {
    for (const status of ANALYSIS_STATUSES) {
      expect(PUBLIC_ANALYSIS_STATUSES as readonly string[]).toContain(status);
    }
  });

  it("AUTHORITY_NOT_AVAILABLE carries a fixed, author-written detail naming no resolution outcome", () => {
    const failing = analyzeObservedProtectionPaladinDecisions({
      state: corpusState(OPENER),
      actorId: PROT_ACTOR,
      specId: "paladin/protection",
      targetActorId: null,
      authority: {
        forDomain: (domain) => ({
          outcome: "AUTHORITY_LOAD_FAILED",
          domain,
          binding: PROTECTION_OFFENSIVE_AUTHORITY,
          reason: "MALFORMED_LISTS",
          detail: "test double",
        }),
      },
    });
    expect(failing.status).toBe("AUTHORITY_NOT_AVAILABLE");
    if (failing.status === "ANALYZED") return;
    for (const outcome of AUTHORITY_RESOLUTION_OUTCOMES) expect(failing.detail).not.toContain(outcome);
    expect(failing.detail).not.toContain("MALFORMED_LISTS");
    expect(failing.detail).not.toContain("test double");
    expect(failing.detail).toBe(
      "The pinned SimulationCraft Protection Paladin authority artifact could not be resolved, so no offensive decision was evaluated.",
    );
  });

  it("PROFILE_NOT_RESOLVED and INSUFFICIENT_EVIDENCE details are fixed sentences", () => {
    // An actor the slice holds no combatant profile for.
    const noProfile = analyzeObservedProtectionPaladinDecisions({
      state: corpusState(OPENER),
      actorId: 19,
      specId: "paladin/protection",
      targetActorId: null,
    });
    expect(noProfile.status).toBe("PROFILE_NOT_RESOLVED");
    if (noProfile.status === "ANALYZED") return;
    expect(noProfile.detail).toBe(
      "No combatant profile was resolved for this actor, so build facts and action applicability could not be established.",
    );
  });
});
