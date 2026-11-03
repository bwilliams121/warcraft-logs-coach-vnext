/**
 * M11-B12: the public projection of a Blood Death Knight analysis is TOTAL
 * over every internal vocabulary, applies exactly two transformations that
 * already existed, leaks nothing internal, and is the same analysis the
 * internal lookup produced.
 *
 * THE TWO TRANSFORMATIONS, BOTH OLDER THAN THIS MILESTONE
 *
 *   MELEE_SWING          → NON_GCD_ACTION            (as Protection, M10-D)
 *   OUTSIDE_FIRST_SLICE  → OUTSIDE_SUPPORTED_SLICE   (as Retribution, M11-A5)
 *
 * SO THE SCHEMA DECISION THIS PROMOTION TOOK IS EXACTLY ONE: `deathknight/
 * blood` joins the `specId` enum, by the same additive-widening precedent as
 * `paladin/protection` in M10-D and `paladin/retribution` in M11-A5. No
 * outcome, basis, blocker class, exclusion reason, status, capability value
 * or field moved, and `warcraft-logs-coach.analysis/1` is unchanged. This
 * file pins that alongside the projection itself.
 *
 * WHAT MUST NOT REACH THE WIRE. Blood's payload is the richest in the build:
 * order-invariant stack sets and presence proofs, remains floors, Rune
 * affordability, Blood Debt counts, censuses, dispatch traces, resolver
 * diagnostics, root-scan stopping entries. Every one of them is INTERNAL —
 * the view never carries them and no public document may name them.
 *
 * PUBLIC/INTERNAL EQUIVALENCE. The public path does not execute different
 * Blood decision semantics: the analysis the application service dispatches
 * for a DeathKnight/Blood identity is the registration's own, and the
 * document it projects carries the internal outcomes unchanged — 42 MATCH,
 * 9 REJECTED, 72 UNKNOWN over the committed bundle, exactly M11-B10's.
 */

import { assessConsumableStatus } from "../../src/analysis/preparation/consumable-status.js";
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
  PUBLIC_SPEC_IDS,
  PUBLIC_USABILITY_PROVENANCES,
  PublicAnalysisResultSchema,
} from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import { DIAGNOSIS_NOT_RETRIEVED } from "../../src/diagnosis/diagnosis.js";
import { withExpectedTldr } from "../support/tldr.js";
import type { CombatState } from "../../src/engine/state/combat-state.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import { internalAnalyzerForSpec, PRODUCTION_CATALOG } from "../../src/services/analyzer-registry.js";
import type { FightAnalysis } from "../../src/services/result.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import {
  BLOOD_EXCLUSION_VIEW_PROJECTION,
  BLOOD_DEATH_KNIGHT_REGISTRATION,
  BLOOD_VIEW_EXCLUSION_ORDER,
  bloodObservedDecisionView,
  projectBloodExclusionTally,
} from "../../src/specs/deathknight/blood/registration.js";
import {
  BLOOD_EXCLUSION_REASONS,
  type BloodDeathKnightAnalysis,
} from "../../src/specs/deathknight/blood/observed-analysis.js";
import { BLOOD_DEATH_KNIGHT_ANALYZER_ID } from "../../src/specs/deathknight/blood/spec.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { countedProductionCatalog } from "../support/catalog.js";
import { corpusBundleState, corpusState } from "../support/corpus/fight.js";
import { PREPARATION_NOT_ASSESSED } from "../../src/services/result.js";

const BLOOD = 14;
const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
const SEG = "wcl-blood-death-knight-a7r6-rotational-165s";
const BUNDLE = [BLOOD45, `${SEG}.seg-45-105`, `${SEG}.seg-105-165`];
const GTKB = "wcl-blood-death-knight-gtkb-opener";

type Analyzed = Extract<BloodDeathKnightAnalysis, { status: "ANALYZED" }>;

function analyzed(state: CombatState, actorId = BLOOD): Analyzed {
  const analysis = BLOOD_DEATH_KNIGHT_REGISTRATION.analyze({
    state,
    actorId,
    specId: "deathknight/blood",
    targetActorId: null,
  }) as BloodDeathKnightAnalysis;
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
    player: { sourceId: actorId, name: "Corpusplayer", className: "DeathKnight", specName: "Blood" },
  };
}

/** The application envelope the service builds around a Blood analysis. */
function fightAnalysisOf(state: CombatState, analysis: Analyzed, actorId = BLOOD): FightAnalysis {
  // M15-B: with the TLDR the service builds beside it.
  return withExpectedTldr({
    identity: identityFor(state, actorId),
    specId: "deathknight/blood",
    analyzerId: BLOOD_DEATH_KNIGHT_ANALYZER_ID,
    scope: "PLAYER_CONTEXT",
    analysis,
    // As the service builds it: the shared producer over the same fight.
    preparation: { state: "ASSESSED", report: assessConsumableStatus(state.fight, actorId) },
    observedDecisions: BLOOD_DEATH_KNIGHT_REGISTRATION.observedDecisionView(analysis),
    // As the service builds it (M14-F): no comparison evidence is retrieved.
    diagnosis: DIAGNOSIS_NOT_RETRIEVED,
  });
}

const INPUTS: readonly {
  readonly label: string;
  readonly state: () => CombatState;
}[] = [
  { label: "45 s slice", state: () => corpusState(BLOOD45) },
  { label: "165 s bundle", state: () => corpusBundleState(BUNDLE, []) },
  { label: "gtKb opener (one MATCH, twenty UNKNOWN)", state: () => corpusState(GTKB) },
];

describe("the schema is analysis/1, widened by exactly one specId", () => {
  it("the version string is unchanged", () => {
    expect(PUBLIC_ANALYSIS_SCHEMA_VERSION).toBe("warcraft-logs-coach.analysis/1");
  });

  it("deathknight/blood was appended to the specId enum after the three earlier ids (monk/brewmaster follows it since M11-C4j)", () => {
    expect([...PUBLIC_SPEC_IDS]).toEqual([
      "rogue/assassination",
      "paladin/protection",
      "paladin/retribution",
      "deathknight/blood",
      "monk/brewmaster",
      "evoker/augmentation",
      "shaman/restoration",
      "paladin/holy",
      "monk/mistweaver",
      "priest/holy",
    ]);
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
    expect([...PUBLIC_EXCLUSION_REASONS]).toEqual([
      "NON_GCD_ACTION",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "NO_AUTHORITY_TOKEN_BINDING",
      "OUTSIDE_SUPPORTED_SLICE",
    ]);
    expect([...PUBLIC_ANALYSIS_STATUSES]).toEqual([
      "ANALYZED",
      "SPEC_NOT_SUPPORTED",
      "AUTHORITY_NOT_AVAILABLE",
      "PROFILE_NOT_RESOLVED",
      "INSUFFICIENT_EVIDENCE",
    ]);
  });

  it("Blood introduces no public value of its own: its projection lands entirely inside the existing enum", () => {
    expect(Object.keys(BLOOD_EXCLUSION_VIEW_PROJECTION).sort()).toEqual([...BLOOD_EXCLUSION_REASONS].sort());
    for (const reason of BLOOD_EXCLUSION_REASONS) {
      expect(PUBLIC_EXCLUSION_REASONS as readonly string[]).toContain(
        BLOOD_EXCLUSION_VIEW_PROJECTION[reason],
      );
    }
    expect(BLOOD_EXCLUSION_VIEW_PROJECTION).toEqual({
      MELEE_SWING: "NON_GCD_ACTION",
      NON_GCD_ACTION: "NON_GCD_ACTION",
      EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
      NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
      OUTSIDE_FIRST_SLICE: "OUTSIDE_SUPPORTED_SLICE",
    });
    expect(BLOOD_VIEW_EXCLUSION_ORDER).toEqual([...PUBLIC_EXCLUSION_REASONS]);
  });

  it("merges rows sharing a public reason by summing, preserves the total, and omits zero rows", () => {
    const merged = projectBloodExclusionTally([
      { key: "MELEE_SWING", count: 87 },
      { key: "NON_GCD_ACTION", count: 47 },
      { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
      { key: "OUTSIDE_FIRST_SLICE", count: 13 },
    ]);
    expect(merged).toEqual([
      { key: "NON_GCD_ACTION", count: 134 },
      { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
      { key: "OUTSIDE_SUPPORTED_SLICE", count: 13 },
    ]);
    expect(merged.reduce((sum, row) => sum + row.count, 0)).toBe(148);
    expect(projectBloodExclusionTally([])).toEqual([]);
  });
});

describe("over the real 165 s bundle", () => {
  const state = corpusBundleState(BUNDLE, []);
  const analysis = analyzed(state);
  const view = bloodObservedDecisionView(analysis);

  it("keeps the internal exclusion names in the payload and publishes the public ones in their place", () => {
    expect(analysis.coverage.exclusions).toEqual([
      { key: "MELEE_SWING", count: 87 },
      { key: "NON_GCD_ACTION", count: 47 },
      { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
      { key: "OUTSIDE_FIRST_SLICE", count: 13 },
    ]);
    expect(view.exclusions.map((record) => record.reason)).not.toContain("OUTSIDE_FIRST_SLICE");
    expect(view.exclusions.map((record) => record.reason)).not.toContain("MELEE_SWING");
    expect(view.coverage.exclusions).toEqual([
      { key: "NON_GCD_ACTION", count: 134 },
      { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
      { key: "OUTSIDE_SUPPORTED_SLICE", count: 13 },
    ]);
    expect(view.coverage.excludedCastCount).toBe(148);
    expect(view.exclusions).toHaveLength(148);
  });

  it("publishes the pinned public totals: M11-B10's 42 MATCH, 9 REJECTED and 72 UNKNOWN, unchanged by exposure", () => {
    const projected = projectAnalysisResult(fightAnalysisOf(state, analysis));
    if (projected.status !== "ANALYZED") throw new Error(projected.status);
    expect(projected.coverage).toEqual({
      eligibleDecisions: 123,
      match: 42,
      rejected: 9,
      unknown: 72,
      resolvedComparisons: 51,
      exactEntryMatches: 38,
      tokenConvergedMatches: 4,
      selectionPrecision: [
        { key: "EXACT_ENTRY", count: 47 },
        { key: "TOKEN_CONVERGED", count: 4 },
        { key: "UNKNOWN", count: 72 },
      ],
      unknownBases: [{ key: "AUTHORITY_SELECTION_UNRESOLVED", count: 72 }],
      unknownBlockerClasses: [
        { key: "OBSERVED_STATE_MISSING", count: 35 },
        { key: "DIVERGENT_WORLDS", count: 37 },
      ],
      exclusions: [
        { key: "NON_GCD_ACTION", count: 134 },
        { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
        { key: "OUTSIDE_SUPPORTED_SLICE", count: 13 },
      ],
      excludedCastCount: 148,
    });
  });

  it("the supported slice is what the limits say: five observed tokens, and the three named actions excluded", () => {
    const projected = projectAnalysisResult(fightAnalysisOf(state, analysis));
    if (projected.status !== "ANALYZED") throw new Error(projected.status);
    expect([...new Set(projected.decisions.map((decision) => decision.observedToken))].sort()).toEqual([
      "blood_boil",
      "death_strike",
      "deaths_caress",
      "heart_strike",
      "marrowrend",
    ]);
    // Death and Decay, Dancing Rune Weapon and Consumption are observed, not
    // judged: they are excluded, and they are not decisions.
    const reasonOf = (abilityGameId: number): string | undefined =>
      projected.exclusions.find((cast) => cast.abilityGameId === abilityGameId)?.reason;
    expect(reasonOf(43265), "Death and Decay").toBe("OUTSIDE_SUPPORTED_SLICE");
    expect(reasonOf(49028), "Dancing Rune Weapon").toBe("OUTSIDE_SUPPORTED_SLICE");
    for (const abilityGameId of [43265, 49028]) {
      expect(projected.decisions.some((decision) => decision.observedAbilityGameId === abilityGameId)).toBe(
        false,
      );
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
    expect(projection.cell.counts.excludedCastCount).toBe(148);
    expect(projection.cell.counts.exclusions.reduce((sum, row) => sum + row.count, 0)).toBe(148);
    const patterns = projection.cell.recurrence.exclusionPatterns.map((row) => row.key);
    expect(patterns.some((key) => key.includes("OUTSIDE_SUPPORTED_SLICE"))).toBe(true);
    expect(patterns.some((key) => key.includes("OUTSIDE_FIRST_SLICE"))).toBe(false);
    expect(patterns.some((key) => key.includes("MELEE_SWING"))).toBe(false);
  });
});

describe("every committed Blood input projects to a valid document with no internal leak", () => {
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
    "resources",
    "build",
    "talents",
    "heroTree",
    "resolved",
    "diagnostics",
    "auras",
    "stacks",
    "remains",
    "runicPower",
    "runeAffordability",
    "cooldowns",
    "selection",
    "unselectability",
    "dispatches",
    "undecidedCandidates",
    "stoppingPoint",
    "windowOrderInvariance",
    "possibleStacks",
    "scope",
  ];
  /** Internal-only vocabulary; none may appear as a public value. */
  const INTERNAL_STRINGS = [
    "MELEE_SWING",
    "OUTSIDE_FIRST_SLICE",
    // The Blood evidence classes M11-B4 … M11-B10 built.
    "WINDOW_ORDER_INVARIANT_BOUNDED",
    "WINDOW_ORDER_INVARIANT_SET",
    "WINDOW_ORDER_INVARIANT_PRESENCE",
    "EXACT_STACK_OBSERVATION",
    "EXACT_STACK_APPLICATION",
    "COUNT_AMBIGUOUS_SINCE_OBSERVATION",
    "COUNT_EXCEEDS_PINNED_MAX",
    "PRE_DECISION_WINDOW_TRANSITION",
    "AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION",
    "GAIN_ANCHOR_EXACT",
    "GAIN_ANCHOR_BOUNDED",
    "PROVEN_INACTIVE",
    "PERMANENT_ACTIVE",
    "OWN_PRE_COST_AFFORDABLE",
    "NO_RUNE_OBSERVATION",
    "POST_SPEND_NOT_OBSERVED",
    "CARRIED_EXACT",
    "ONE_OF_NUMBERS",
    "BOUNDED_NUMBER",
    // Authority-traversal internals.
    "ONE_SCAN_BLOCKED",
    "NO_DEFINITE_WINNER",
    "DIVERGENT_GCD_OUTCOMES",
    "UNCONDITIONAL_ENTRY",
    "CONDITION_NOT_PROVEN_FALSE",
    "APPLICABILITY:consumption",
    "run_action_list",
    "san_gift",
    "sanlayn[",
    "deathbringer[",
    "high_prio_actions",
    // Blood's own atom names.
    "bone_shield",
    "blood_debt",
    "essence_of_the_blood_queen",
    "gift_of_the_sanlayn",
    "vampiric_strike",
    "fight_remains",
  ];

  for (const input of INPUTS) {
    it(`${input.label}: schema-valid at analysis/1, every vocabulary value public, nothing withheld reaches the wire`, () => {
      const state = input.state();
      const analysis = analyzed(state);
      const projected = projectAnalysisResult(fightAnalysisOf(state, analysis));
      expect(PublicAnalysisResultSchema.safeParse(projected).success).toBe(true);
      expect(projected.schemaVersion).toBe("warcraft-logs-coach.analysis/1");
      if (projected.status !== "ANALYZED") throw new Error(projected.status);
      expect(projected.specialization).toEqual({ specId: "deathknight/blood", gameplaySupported: true });
      expect(projected.analyzerId).toBe(BLOOD_DEATH_KNIGHT_ANALYZER_ID);
      expect(projected.capability.scoresPerformance).toBe(false);
      expect(projected.capability.unknownIsFirstClass).toBe(true);
      expect(projected.capability.partialCoverageIsExpected).toBe(true);
      expect(projected.authority.authorityId).toBe("SIMC_APL_DEATHKNIGHT_BLOOD");

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
        expect(["death_strike", "heart_strike", "blood_boil", "marrowrend", "deaths_caress"]).toContain(
          decision.observedToken,
        );
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
      for (const withheld of WITHHELD_KEYS) expect([...keys], withheld).not.toContain(withheld);
    });
  }

  it("the internal outcomes are carried decision for decision: the payload and the document agree on every position", () => {
    const state = corpusBundleState(BUNDLE, []);
    const analysis = analyzed(state);
    const projected = projectAnalysisResult(fightAnalysisOf(state, analysis));
    if (projected.status !== "ANALYZED") throw new Error(projected.status);
    expect(projected.decisions).toHaveLength(analysis.comparisons.length);
    for (const [index, comparison] of analysis.comparisons.entries()) {
      const decision = projected.decisions[index];
      expect(decision?.position, String(comparison.decision.position)).toBe(comparison.decision.position);
      expect(decision?.outcome).toBe(comparison.outcome);
      expect(decision?.basis).toBe(comparison.basis);
      expect(decision?.authorityToken).toBe(comparison.authorityToken);
      expect(decision?.selectionPrecision).toBe(comparison.selectionPrecision);
      expect(decision?.observedToken).toBe(comparison.decision.observedToken);
    }
  });

  it("the gtKb opener publishes one MATCH and twenty UNKNOWN, as the internal facade reports", () => {
    const state = corpusState(GTKB);
    const analysis = analyzed(state);
    const projected = projectAnalysisResult(fightAnalysisOf(state, analysis));
    if (projected.status !== "ANALYZED") throw new Error(projected.status);
    expect(projected.coverage.eligibleDecisions).toBe(21);
    expect(projected.coverage.match).toBe(1);
    expect(projected.coverage.rejected).toBe(0);
    expect(projected.coverage.unknown).toBe(20);
  });
});

describe("public/internal equivalence: the public path runs the same analyzer and projects the same result", () => {
  it("the application service's ANALYZED envelope for the Blood subject equals the internal lookup's analysis, projected", async () => {
    const state = corpusState(BLOOD45);
    const counted = countedProductionCatalog();
    const deps: AnalysisServiceDeps = {
      env: MCP_TEST_ENV,
      preflight: async () => ({ ok: true, identity: identityFor(state, BLOOD), rateLimit: undefined }),
      ingest: async () => ({ ok: true, fight: state.fight, rateLimit: undefined }),
      registry: counted.registry,
    };
    const result = await analyzeFight(
      { reportCode: state.fight.report.code, fightId: state.fight.fight.id, sourceId: BLOOD },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.specId).toBe("deathknight/blood");
    expect(result.analysis.analyzerId).toBe(BLOOD_DEATH_KNIGHT_ANALYZER_ID);
    expect(counted.calls[BLOOD_DEATH_KNIGHT_ANALYZER_ID]).toBe(1);

    const throughService = projectAnalysisResult(result.analysis);
    const throughInternal = projectAnalysisResult(fightAnalysisOf(state, analyzed(state)));
    expect(throughService).toEqual(throughInternal);

    // And the internal lookup is the SAME row the public one now finds.
    expect(internalAnalyzerForSpec("deathknight/blood", PRODUCTION_CATALOG)?.analyzerId).toBe(
      BLOOD_DEATH_KNIGHT_ANALYZER_ID,
    );
  });
});

describe("the non-analyzed statuses are public and carry no decisions", () => {
  it("every status Blood can return is a public status", () => {
    for (const status of [
      "SPEC_NOT_SUPPORTED",
      "AUTHORITY_NOT_AVAILABLE",
      "PROFILE_NOT_RESOLVED",
      "INSUFFICIENT_EVIDENCE",
    ]) {
      expect(PUBLIC_ANALYSIS_STATUSES as readonly string[]).toContain(status);
    }
  });

  it("a segment with no combatant profile projects PROFILE_NOT_RESOLVED, never a smaller ANALYZED document", () => {
    const state = corpusState(`${SEG}.seg-45-105`);
    const analysis = BLOOD_DEATH_KNIGHT_REGISTRATION.analyze({
      state,
      actorId: BLOOD,
      specId: "deathknight/blood",
      targetActorId: null,
    }) as BloodDeathKnightAnalysis;
    expect(analysis.status).toBe("PROFILE_NOT_RESOLVED");
    if (analysis.status === "ANALYZED") return;
    const projected = projectAnalysisResult({
      identity: identityFor(state, BLOOD),
      specId: "deathknight/blood",
      analyzerId: BLOOD_DEATH_KNIGHT_ANALYZER_ID,
      scope: "PLAYER_CONTEXT",
      analysis,
      preparation: PREPARATION_NOT_ASSESSED,
      observedDecisions: null,
    });
    expect(PublicAnalysisResultSchema.safeParse(projected).success).toBe(true);
    expect(projected.status).toBe("PROFILE_NOT_RESOLVED");
    // A refusal document carries the reason and nothing evaluative.
    if (projected.status === "ANALYZED") return;
    expect(projected.detail.length).toBeGreaterThan(0);
    expect(Object.keys(projected)).not.toContain("decisions");
    expect(Object.keys(projected)).not.toContain("coverage");
    expect(Object.keys(projected)).not.toContain("authority");
  });
});
