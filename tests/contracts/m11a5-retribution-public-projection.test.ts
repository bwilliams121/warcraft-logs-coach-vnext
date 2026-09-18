/**
 * M11-A5: the public projection of a Retribution Paladin analysis is TOTAL
 * over every internal vocabulary, applies exactly two transformations, leaks
 * nothing internal, and is the same analysis the internal lookup produced.
 *
 * THE TWO TRANSFORMATIONS
 *
 *   MELEE_SWING          → NON_GCD_ACTION            (as Protection, M10-D)
 *   OUTSIDE_FIRST_SLICE  → OUTSIDE_SUPPORTED_SLICE   (M11-A5)
 *
 * The second is the one public-schema decision the promotion took: ONE
 * spec-neutral value added to `PUBLIC_EXCLUSION_REASONS` under
 * `warcraft-logs-coach.analysis/1`, by the same additive-widening precedent
 * as `paladin/protection` joining the `specId` enum in M10-D. It means the
 * observed action is intentionally outside the analyzer's currently
 * supported decision slice: not a rotational judgment, not MATCH, not
 * REJECTED, not UNKNOWN-for-missing-state, not a performance error. Nothing
 * else about the schema moved — the version string, every existing value,
 * every field — and this file pins that alongside the projection itself.
 *
 * PUBLIC/INTERNAL EQUIVALENCE. The public path does not execute different
 * Retribution decision semantics: the analysis the application service
 * dispatches for a Paladin/Retribution identity is the registration's own,
 * and the document it projects carries the internal outcomes unchanged.
 * Only projection and withholding differ, and both are asserted here.
 */

import { describe, expect, it } from "vitest";

import { toPlayerFightCell } from "../../src/aggregation/cell-projection.js";
import {
  PUBLIC_ANALYSIS_SCHEMA_VERSION,
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
import type { CombatState } from "../../src/engine/state/combat-state.js";
import { ANALYSIS_STATUSES } from "../../src/findings/analysis-envelope.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import { internalAnalyzerForSpec, PRODUCTION_CATALOG } from "../../src/services/analyzer-registry.js";
import type { FightAnalysis } from "../../src/services/result.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import { PROTECTION_EXCLUSION_PUBLIC_PROJECTION } from "../../src/specs/paladin/protection/registration.js";
import {
  RETRIBUTION_EXCLUSION_REASONS,
  type RetributionPaladinAnalysis,
} from "../../src/specs/paladin/retribution/observed-analysis.js";
import {
  projectRetributionExclusionTally,
  RETRIBUTION_EXCLUSION_VIEW_PROJECTION,
  RETRIBUTION_PALADIN_REGISTRATION,
  RETRIBUTION_VIEW_EXCLUSION_ORDER,
  retributionObservedDecisionView,
} from "../../src/specs/paladin/retribution/registration.js";
import { RETRIBUTION_PALADIN_ANALYZER_ID } from "../../src/specs/paladin/retribution/spec.js";
import { DECISION_EXCLUSION_REASONS } from "../../src/specs/rogue/assassination/observed-analysis.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { countedProductionCatalog } from "../support/catalog.js";
import { corpusBundleState, corpusState } from "../support/corpus/fight.js";

const RET_ACTOR = 6;
const RET45 = "wcl-retribution-paladin-a7r6-rotational-45s";
const SEG = "wcl-retribution-paladin-a7r6-rotational-165s";
const BUNDLE = [RET45, `${SEG}.seg-45-105`, `${SEG}.seg-105-165`];
const GTKB = "wcl-retribution-paladin-gtkb-opener";
const GTKB_ACTOR = 23;
const GAP_HOLE = { fromReportTimeMs: 2_049_582, toReportTimeMs: 2_109_589 };

type Analyzed = Extract<RetributionPaladinAnalysis, { status: "ANALYZED" }>;

function analyzed(state: CombatState, actorId = RET_ACTOR): Analyzed {
  const analysis = RETRIBUTION_PALADIN_REGISTRATION.analyze({
    state,
    actorId,
    specId: "paladin/retribution",
    targetActorId: null,
  }) as RetributionPaladinAnalysis;
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}

function identityFor(state: CombatState, actorId: number): FightIdentity {
  const { fight } = state;
  return {
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
    player: { sourceId: actorId, name: "Corpusplayer", className: "Paladin", specName: "Retribution" },
  };
}

/** The application envelope the service builds around a Retribution analysis. */
function fightAnalysisOf(state: CombatState, analysis: Analyzed, actorId = RET_ACTOR): FightAnalysis {
  return {
    identity: identityFor(state, actorId),
    specId: "paladin/retribution",
    analyzerId: RETRIBUTION_PALADIN_ANALYZER_ID,
    scope: "PLAYER_CONTEXT",
    analysis,
    observedDecisions: RETRIBUTION_PALADIN_REGISTRATION.observedDecisionView(analysis),
  };
}

const INPUTS: readonly {
  readonly label: string;
  readonly actorId: number;
  readonly state: () => CombatState;
}[] = [
  { label: "45 s slice", actorId: RET_ACTOR, state: () => corpusState(RET45) },
  { label: "165 s bundle", actorId: RET_ACTOR, state: () => corpusBundleState(BUNDLE, []) },
  {
    label: "165 s gap bundle",
    actorId: RET_ACTOR,
    state: () => corpusBundleState([RET45, `${SEG}.seg-105-165`], [GAP_HOLE]),
  },
  { label: "gtKb opener (all UNKNOWN)", actorId: GTKB_ACTOR, state: () => corpusState(GTKB) },
];

describe("the schema is analysis/1, widened by exactly one spec-neutral exclusion reason", () => {
  it("the version string is unchanged", () => {
    expect(PUBLIC_ANALYSIS_SCHEMA_VERSION).toBe("warcraft-logs-coach.analysis/1");
  });

  it("the three M6 exclusion reasons keep their position; OUTSIDE_SUPPORTED_SLICE is appended", () => {
    expect([...PUBLIC_EXCLUSION_REASONS]).toEqual([
      "NON_GCD_ACTION",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "NO_AUTHORITY_TOKEN_BINDING",
      "OUTSIDE_SUPPORTED_SLICE",
    ]);
    expect([...PUBLIC_EXCLUSION_REASONS].slice(0, 3)).toEqual([...DECISION_EXCLUSION_REASONS]);
  });

  it("no other public vocabulary moved", () => {
    expect([...PUBLIC_COMPARISON_OUTCOMES]).toEqual(["MATCH", "REJECTED", "UNKNOWN"]);
    expect([...PUBLIC_AUTHORITY_COVERAGES]).toEqual([
      "EXACT_ENTRY",
      "TOKEN_CONVERGED",
      "NO_ACTION",
      "UNKNOWN",
    ]);
    expect([...PUBLIC_SELECTION_PRECISIONS]).toEqual(["EXACT_ENTRY", "TOKEN_CONVERGED"]);
    expect([...PUBLIC_USABILITY_PROVENANCES]).toEqual(["OBSERVED_EXECUTION", "NOT_ESTABLISHED"]);
    expect([...PUBLIC_DECISION_BLOCKER_CLASSES]).toEqual([
      "OBSERVED_STATE_MISSING",
      "DIVERGENT_WORLDS",
      "TARGET_COUNT",
      "PREDICTIVE_STATE",
      "TARGETING_NOT_MODELLED",
      "USABILITY_NOT_PROVEN",
      "OTHER",
    ]);
    expect([...PUBLIC_COMPARISON_BASES]).toEqual([
      "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
      "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
      "AUTHORITY_SELECTED_DIFFERENT_TOKEN",
      "AUTHORITY_SELECTION_UNRESOLVED",
      "INCONSISTENT_AUTHORITY_RESULTS",
      "AUTHORITY_SELECTED_NO_ACTION_DESPITE_OBSERVED_GCD",
    ]);
    expect([...PUBLIC_ANALYSIS_STATUSES]).toEqual([
      "ANALYZED",
      "SPEC_NOT_SUPPORTED",
      "AUTHORITY_NOT_AVAILABLE",
      "PROFILE_NOT_RESOLVED",
      "INSUFFICIENT_EVIDENCE",
    ]);
  });

  it("only Retribution projects onto the new value: Assassination and Protection cannot emit it", () => {
    expect(DECISION_EXCLUSION_REASONS as readonly string[]).not.toContain("OUTSIDE_SUPPORTED_SLICE");
    expect(Object.values(PROTECTION_EXCLUSION_PUBLIC_PROJECTION)).not.toContain("OUTSIDE_SUPPORTED_SLICE");
    expect(Object.values(RETRIBUTION_EXCLUSION_VIEW_PROJECTION)).toContain("OUTSIDE_SUPPORTED_SLICE");
  });

  it("the value is spec-neutral: it names no specialization, no slice content, no implementation", () => {
    expect("OUTSIDE_SUPPORTED_SLICE").not.toMatch(/RET|PALADIN|SPENDER|HOLY|FIRST/i);
  });
});

describe("the exclusion-reason projection is total and lands inside the public enum", () => {
  it("maps every internal reason, and only onto public reasons, with exactly two transformations", () => {
    expect(Object.keys(RETRIBUTION_EXCLUSION_VIEW_PROJECTION).sort()).toEqual(
      [...RETRIBUTION_EXCLUSION_REASONS].sort(),
    );
    for (const reason of RETRIBUTION_EXCLUSION_REASONS) {
      expect(PUBLIC_EXCLUSION_REASONS as readonly string[]).toContain(
        RETRIBUTION_EXCLUSION_VIEW_PROJECTION[reason],
      );
    }
    expect(RETRIBUTION_EXCLUSION_VIEW_PROJECTION).toEqual({
      MELEE_SWING: "NON_GCD_ACTION",
      NON_GCD_ACTION: "NON_GCD_ACTION",
      EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
      NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
      OUTSIDE_FIRST_SLICE: "OUTSIDE_SUPPORTED_SLICE",
    });
    // Every public value, in the public order: the view's order is the enum's.
    expect(RETRIBUTION_VIEW_EXCLUSION_ORDER).toEqual([...PUBLIC_EXCLUSION_REASONS]);
  });

  it("merges rows sharing a public reason by summing, preserves the total, and omits zero rows", () => {
    const merged = projectRetributionExclusionTally([
      { key: "MELEE_SWING", count: 1 },
      { key: "NON_GCD_ACTION", count: 112 },
      { key: "OUTSIDE_FIRST_SLICE", count: 54 },
    ]);
    expect(merged).toEqual([
      { key: "NON_GCD_ACTION", count: 113 },
      { key: "OUTSIDE_SUPPORTED_SLICE", count: 54 },
    ]);
    expect(merged.reduce((sum, row) => sum + row.count, 0)).toBe(167);
    expect(projectRetributionExclusionTally([{ key: "OUTSIDE_FIRST_SLICE", count: 3 }])).toEqual([
      { key: "OUTSIDE_SUPPORTED_SLICE", count: 3 },
    ]);
    expect(projectRetributionExclusionTally([])).toEqual([]);
  });
});

describe("over the real 165 s bundle", () => {
  const state = corpusBundleState(BUNDLE, []);
  const analysis = analyzed(state);
  const view = retributionObservedDecisionView(analysis);

  it("keeps OUTSIDE_FIRST_SLICE and MELEE_SWING in the payload and publishes the public names in their place", () => {
    expect(analysis.coverage.exclusions).toEqual([
      { key: "MELEE_SWING", count: 1 },
      { key: "NON_GCD_ACTION", count: 112 },
      { key: "OUTSIDE_FIRST_SLICE", count: 54 },
    ]);
    expect(view.exclusions.map((record) => record.reason)).not.toContain("OUTSIDE_FIRST_SLICE");
    expect(view.exclusions.map((record) => record.reason)).not.toContain("MELEE_SWING");
    expect(view.exclusions.filter((record) => record.reason === "OUTSIDE_SUPPORTED_SLICE")).toHaveLength(54);
    expect(view.coverage.exclusions).toEqual([
      { key: "NON_GCD_ACTION", count: 113 },
      { key: "OUTSIDE_SUPPORTED_SLICE", count: 54 },
    ]);
    expect(view.coverage.excludedCastCount).toBe(167);
    expect(view.exclusions).toHaveLength(167);
  });

  it("a rotational cast outside the slice projects as OUTSIDE_SUPPORTED_SLICE — Judgment, Blade of Justice, Hammer of Wrath, Wake of Ashes, Divine Toll, Execution Sentence", () => {
    const projected = projectAnalysisResult(fightAnalysisOf(state, analysis));
    if (projected.status !== "ANALYZED") throw new Error(projected.status);
    const reasonOf = (reportTimeMs: number, abilityGameId: number): string | undefined =>
      projected.exclusions.find(
        (cast) => cast.reportTimeMs === reportTimeMs && cast.abilityGameId === abilityGameId,
      )?.reason;
    expect(reasonOf(2_030_059, 20271), "Judgment").toBe("OUTSIDE_SUPPORTED_SLICE");
    expect(reasonOf(2_018_755, 184575), "Blade of Justice").toBe("OUTSIDE_SUPPORTED_SLICE");
    expect(reasonOf(2_012_897, 24275), "Hammer of Wrath").toBe("OUTSIDE_SUPPORTED_SLICE");
    expect(reasonOf(2_007_870, 255937), "Wake of Ashes").toBe("OUTSIDE_SUPPORTED_SLICE");
    expect(reasonOf(2_011_286, 375576), "Divine Toll").toBe("OUTSIDE_SUPPORTED_SLICE");
    expect(reasonOf(2_007_120, 343527), "Execution Sentence").toBe("OUTSIDE_SUPPORTED_SLICE");
    // And an off-GCD cast keeps the M6 reason it always had.
    expect(reasonOf(2_005_300, 31884), "Avenging Wrath").toBe("NON_GCD_ACTION");
    // None of those casts is a decision: not MATCH, not REJECTED, not UNKNOWN.
    for (const [reportTimeMs, abilityGameId] of [
      [2_030_059, 20271],
      [2_007_870, 255937],
      [2_011_286, 375576],
    ]) {
      expect(
        projected.decisions.some(
          (decision) =>
            decision.locator.reportTimeMs === reportTimeMs &&
            decision.observedAbilityGameId === abilityGameId,
        ),
      ).toBe(false);
    }
  });

  it("reconciles: the cell projection accepts the projected counts and names the slice boundary publicly", () => {
    const projection = toPlayerFightCell({
      analysis: fightAnalysisOf(state, analysis),
      normalizationRevision: state.fight.provenance.normalizationRevision,
    });
    expect(projection.ok).toBe(true);
    if (!projection.ok) return;
    expect(projection.cell.kind).toBe("ANALYZED");
    if (projection.cell.kind !== "ANALYZED") return;
    expect(projection.cell.counts.excludedCastCount).toBe(167);
    expect(projection.cell.counts.exclusions.reduce((sum, row) => sum + row.count, 0)).toBe(167);
    const patterns = projection.cell.recurrence.exclusionPatterns.map((row) => row.key);
    expect(patterns.some((key) => key.includes("OUTSIDE_SUPPORTED_SLICE"))).toBe(true);
    expect(patterns.some((key) => key.includes("OUTSIDE_FIRST_SLICE"))).toBe(false);
    expect(patterns.some((key) => key.includes("MELEE_SWING"))).toBe(false);
  });

  it("publishes the pinned public totals: the real MATCH, the ten real REJECTED, the fifty-eight UNKNOWN", () => {
    const projected = projectAnalysisResult(fightAnalysisOf(state, analysis));
    if (projected.status !== "ANALYZED") throw new Error(projected.status);
    expect(projected.coverage).toEqual({
      eligibleDecisions: 69,
      match: 1,
      rejected: 10,
      unknown: 58,
      resolvedComparisons: 11,
      exactEntryMatches: 1,
      tokenConvergedMatches: 0,
      selectionPrecision: [
        { key: "EXACT_ENTRY", count: 3 },
        { key: "UNKNOWN", count: 66 },
      ],
      unknownBases: [{ key: "AUTHORITY_SELECTION_UNRESOLVED", count: 58 }],
      unknownBlockerClasses: [{ key: "OBSERVED_STATE_MISSING", count: 58 }],
      exclusions: [
        { key: "NON_GCD_ACTION", count: 113 },
        { key: "OUTSIDE_SUPPORTED_SLICE", count: 54 },
      ],
      excludedCastCount: 167,
    });
    const match = projected.decisions.filter((decision) => decision.outcome === "MATCH");
    expect(match).toHaveLength(1);
    expect(match[0]).toMatchObject({
      observedToken: "templars_verdict",
      observedAbilityGameId: 383328,
      authorityToken: "templars_verdict",
      basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
      authorityCoverage: "EXACT_ENTRY",
      selectionPrecision: "EXACT_ENTRY",
      decisiveBlocker: null,
      usabilityProvenance: "OBSERVED_EXECUTION",
      locator: { reportTimeMs: 2_108_996 },
    });
    const rejected = projected.decisions.filter((decision) => decision.outcome === "REJECTED");
    expect(rejected).toHaveLength(10);
    for (const decision of rejected) {
      expect(decision.observedToken).toBe("divine_storm");
      expect(decision.basis).toBe("OBSERVED_ACTION_REJECTED_BY_AUTHORITY");
      expect(decision.decisiveBlocker).toBeNull();
    }
    // The two REJECTED that the scan ALSO resolved carry the exact entry; the
    // eight by unselectability alone carry no token — coverage and outcome are
    // separate axes, and neither is collapsed into the other.
    expect(rejected.filter((decision) => decision.authorityCoverage === "EXACT_ENTRY")).toHaveLength(2);
    expect(rejected.filter((decision) => decision.authorityToken === null)).toHaveLength(8);
    const unknown = projected.decisions.filter((decision) => decision.outcome === "UNKNOWN");
    expect(unknown).toHaveLength(58);
    for (const decision of unknown) {
      expect(decision.basis).toBe("AUTHORITY_SELECTION_UNRESOLVED");
      expect(decision.decisiveBlocker).toBe("OBSERVED_STATE_MISSING");
      expect(decision.authorityToken).toBeNull();
    }
  });
});

describe("every committed Retribution input projects to a valid document with no internal leak", () => {
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

  /** Payload fields the view withholds; none may reach a public document. */
  const WITHHELD_KEYS = [
    "rawBlocker",
    "observedActionRejected",
    "actorId",
    "domains",
    "holyPower",
    "build",
    "talents",
    "heroTree",
    "twoHandedWeaponItemId",
    "foregroundProvenByObservedExecution",
    "observedCastAbilityIds",
    "resolved",
    "diagnostics",
    "auras",
    "stacks",
    "cooldowns",
    "selection",
    "unselectability",
    "blockedAt",
    "rootScanBlockedAt",
    "rootScanBlocker",
    "refusal",
    "scope",
  ];
  /** Internal-only vocabulary; none may appear as a public value. */
  const INTERNAL_STRINGS = [
    "MELEE_SWING",
    "OUTSIDE_FIRST_SLICE",
    "NO_PINNED_AUTHORITY_FOR_DOMAIN",
    "AUTHORITY_LOAD_FAILED",
    "DOMAIN_NOT_DECLARED",
    "AUTHORITY_HAS_UNMODELLED_DISPATCH",
    "TOKEN_NOT_IN_AUTHORITY",
    "UNCONDITIONAL_ENTRY",
    "CONDITION_NOT_PROVEN_FALSE",
    "APPLICABILITY_UNKNOWN",
    "TALENT_NOT_DISPROVED",
    "TALENT_NOT_SELECTED",
    "PROVEN_INACTIVE",
    "BOUND_ZERO",
    "EXACT_PRE_COST",
    "NO_OBSERVATION",
    "ONE_SCAN_BLOCKED",
    "NO_DEFINITE_WINNER",
    "call_action_list",
    "cooldowns[",
    "generators[",
    "finishers[",
    "offensiveAuthorityGoverns",
  ];

  for (const input of INPUTS) {
    it(`${input.label}: schema-valid at analysis/1, every vocabulary value public, nothing withheld reaches the wire`, () => {
      const state = input.state();
      const analysis = analyzed(state, input.actorId);
      const projected = projectAnalysisResult(fightAnalysisOf(state, analysis, input.actorId));
      expect(PublicAnalysisResultSchema.safeParse(projected).success).toBe(true);
      expect(projected.schemaVersion).toBe("warcraft-logs-coach.analysis/1");
      if (projected.status !== "ANALYZED") throw new Error(projected.status);
      expect(projected.specialization).toEqual({ specId: "paladin/retribution", gameplaySupported: true });
      expect(projected.analyzerId).toBe(RETRIBUTION_PALADIN_ANALYZER_ID);
      expect(projected.capability.scoresPerformance).toBe(false);
      expect(projected.authority.authorityId).toBe("SIMC_APL_PALADIN_RETRIBUTION");

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
        // Every eligible decision is a spender; the slice is what it says.
        expect(["divine_storm", "templars_verdict"]).toContain(decision.observedToken);
      }
      for (const exclusion of projected.exclusions) {
        expect(PUBLIC_EXCLUSION_REASONS as readonly string[]).toContain(exclusion.reason);
      }
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

  it("the internal outcomes are carried decision for decision: the payload and the document agree on every position", () => {
    const state = corpusBundleState(BUNDLE, []);
    const analysis = analyzed(state);
    const projected = projectAnalysisResult(fightAnalysisOf(state, analysis));
    if (projected.status !== "ANALYZED") throw new Error(projected.status);
    expect(
      projected.decisions.map((decision) => [decision.position, decision.outcome, decision.basis]),
    ).toEqual(
      analysis.comparisons.map((comparison) => [
        comparison.decision.position,
        comparison.outcome,
        comparison.basis,
      ]),
    );
  });

  it("the gtKb opener publishes fifteen UNKNOWN and nothing resolved, as the internal facade reports", () => {
    const state = corpusState(GTKB);
    const projected = projectAnalysisResult(fightAnalysisOf(state, analyzed(state, GTKB_ACTOR), GTKB_ACTOR));
    if (projected.status !== "ANALYZED") throw new Error(projected.status);
    expect(projected.coverage).toMatchObject({ eligibleDecisions: 15, match: 0, rejected: 0, unknown: 15 });
    expect(projected.coverage.exclusions).toEqual([
      { key: "NON_GCD_ACTION", count: 24 },
      { key: "OUTSIDE_SUPPORTED_SLICE", count: 9 },
    ]);
  });
});

describe("public/internal equivalence: the public path runs the same analyzer and projects the same result", () => {
  it("the application service's ANALYZED envelope for the Retribution subject equals the internal lookup's analysis, projected", async () => {
    const state = corpusState(RET45);
    const counted = countedProductionCatalog();
    const deps: AnalysisServiceDeps = {
      env: MCP_TEST_ENV,
      preflight: async () => ({ ok: true, identity: identityFor(state, RET_ACTOR), rateLimit: undefined }),
      ingest: async () => ({ ok: true, fight: state.fight, rateLimit: undefined }),
      registry: counted.registry,
    };
    const result = await analyzeFight(
      { reportCode: state.fight.report.code, fightId: state.fight.fight.id, sourceId: RET_ACTOR },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(counted.calls[RETRIBUTION_PALADIN_ANALYZER_ID]).toBe(1);

    // The internal path: the registration found by the internal lookup, run
    // directly over the same evidence, projected through the same projection.
    const registration = internalAnalyzerForSpec("paladin/retribution", PRODUCTION_CATALOG);
    if (registration === null) throw new Error("no Retribution registration");
    const internal = registration.analyze({
      state,
      actorId: RET_ACTOR,
      specId: "paladin/retribution",
      targetActorId: null,
    }) as RetributionPaladinAnalysis;
    if (internal.status !== "ANALYZED") throw new Error(internal.status);

    const viaService = projectAnalysisResult(result.analysis);
    const viaInternal = projectAnalysisResult(fightAnalysisOf(state, internal));
    // The service's ingested fight is the corpus fight itself, so the two
    // documents are identical field for field — same decisions, same
    // exclusions, same coverage, same authority, same identity.
    expect(viaService).toEqual(viaInternal);
    if (viaService.status !== "ANALYZED") return;
    expect(viaService.coverage).toMatchObject({ eligibleDecisions: 26, match: 0, rejected: 1, unknown: 25 });
  });
});

describe("the non-analyzed statuses", () => {
  it("every analysis status Retribution can return is a public status", () => {
    for (const status of ANALYSIS_STATUSES) {
      expect(PUBLIC_ANALYSIS_STATUSES as readonly string[]).toContain(status);
    }
  });

  it("a segment with no combatant profile projects PROFILE_NOT_RESOLVED with its fixed detail, never a smaller ANALYZED document", () => {
    const state = corpusState(`${SEG}.seg-105-165`);
    const analysis = RETRIBUTION_PALADIN_REGISTRATION.analyze({
      state,
      actorId: RET_ACTOR,
      specId: "paladin/retribution",
      targetActorId: null,
    }) as RetributionPaladinAnalysis;
    expect(analysis.status).toBe("PROFILE_NOT_RESOLVED");
    if (analysis.status === "ANALYZED") return;
    const projected = projectAnalysisResult({
      identity: identityFor(state, RET_ACTOR),
      specId: "paladin/retribution",
      analyzerId: RETRIBUTION_PALADIN_ANALYZER_ID,
      scope: "PLAYER_CONTEXT",
      analysis,
      observedDecisions: null,
    });
    expect(PublicAnalysisResultSchema.safeParse(projected).success).toBe(true);
    expect(projected).toMatchObject({
      status: "PROFILE_NOT_RESOLVED",
      specialization: { specId: "paladin/retribution", gameplaySupported: true },
      analyzerId: RETRIBUTION_PALADIN_ANALYZER_ID,
    });
    expect("decisions" in projected).toBe(false);
    expect("coverage" in projected).toBe(false);
  });
});
