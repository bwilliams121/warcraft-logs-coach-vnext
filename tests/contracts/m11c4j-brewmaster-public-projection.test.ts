/**
 * M11-C4j: the public projection of a Brewmaster Monk analysis is TOTAL over
 * every internal vocabulary, applies exactly the two transformations that
 * already existed, leaks nothing internal, and is the same analysis the
 * registration produced — the M11-C4i outcomes, decision for decision.
 *
 *   MELEE_SWING          → NON_GCD_ACTION            (as Protection, M10-D)
 *   OUTSIDE_FIRST_SLICE  → OUTSIDE_SUPPORTED_SLICE   (as Retribution, M11-A5)
 *
 * THE ONE SCHEMA DECISION: `monk/brewmaster` joins the `specId` enum, by the
 * additive-widening precedent. No outcome, basis, blocker class, exclusion
 * reason, status, capability value or field moved, and
 * `warcraft-logs-coach.analysis/1` is unchanged.
 *
 * WHAT MUST NOT REACH THE WIRE: the positive-usability conclusions and their
 * per-dimension facts, the readiness aura facts, the resolver diagnostics,
 * the stopping points and the dispatch trace are INTERNAL.
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
import {
  BREWMASTER_EXCLUSION_REASONS,
  type BrewmasterMonkAnalysis,
} from "../../src/specs/monk/brewmaster/observed-analysis.js";
import {
  BREWMASTER_EXCLUSION_VIEW_PROJECTION,
  BREWMASTER_MONK_REGISTRATION,
} from "../../src/specs/monk/brewmaster/registration.js";
import { BREWMASTER_MONK_ANALYZER_ID } from "../../src/specs/monk/brewmaster/spec.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { countedProductionCatalog } from "../support/catalog.js";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";
import { corpusState, stateOfBundle } from "../support/corpus/fight.js";
import { committedCorpusFiles, validateEvidenceArchive } from "../support/corpus/loader.js";
import { PREPARATION_NOT_ASSESSED } from "../../src/services/result.js";

type Analyzed = Extract<BrewmasterMonkAnalysis, { status: "ANALYZED" }>;

interface Input {
  readonly label: string;
  readonly actor: number;
  readonly parts: readonly string[];
  /** The M11-C4i totals (MATCH / REJECTED / UNKNOWN) and the REJECTED report times. */
  readonly expected: { readonly counts: readonly [number, number, number]; readonly rejectedAt: number[] };
}

const S1_OPENER = "wcl-brewmaster-monk-gtkb-opener";
const S1_165 = "wcl-brewmaster-monk-gtkb-rotational-165s.seg-20-165";
const S1_285 = "wcl-brewmaster-monk-gtkb-full-fight.seg-165-285";
const S2_OPENER = "wcl-brewmaster-monk-rxaf-opener";
const S2_165 = "wcl-brewmaster-monk-rxaf-rotational-165s.seg-20-165";

const INPUTS: readonly Input[] = [
  {
    label: "subject 1 opener",
    actor: 4,
    parts: [S1_OPENER],
    expected: { counts: [5, 1, 9], rejectedAt: [2424688] },
  },
  {
    label: "subject 1 165 s",
    actor: 4,
    parts: [S1_OPENER, S1_165],
    expected: { counts: [71, 1, 41], rejectedAt: [2424688] },
  },
  {
    label: "subject 1 full fight",
    actor: 4,
    parts: [S1_OPENER, S1_165, S1_285],
    expected: {
      counts: [109, 10, 70],
      rejectedAt: [2424688, 2646042, 2649140, 2656832, 2657838, 2660942, 2662019, 2665774, 2683160, 2692690],
    },
  },
  {
    label: "subject 2 opener",
    actor: 11,
    parts: [S2_OPENER],
    expected: { counts: [11, 0, 6], rejectedAt: [] },
  },
  {
    label: "subject 2 165 s",
    actor: 11,
    parts: [S2_OPENER, S2_165],
    expected: { counts: [47, 1, 91], rejectedAt: [2573516] },
  },
];

async function stateOf(input: Input): Promise<CombatState> {
  if (input.parts.length === 1) return corpusState(input.parts[0] ?? "");
  const loaded = await validateEvidenceArchive(committedEvidenceArchiveFiles(), committedCorpusFiles());
  if (!loaded.ok) throw new Error("the evidence archive does not validate");
  return stateOfBundle(loaded.archive, input.parts, []);
}

function analyzed(state: CombatState, actorId: number): Analyzed {
  const analysis = BREWMASTER_MONK_REGISTRATION.analyze({
    state,
    actorId,
    specId: "monk/brewmaster",
    targetActorId: null,
  }) as BrewmasterMonkAnalysis;
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
    player: { sourceId: actorId, name: "Corpusplayer", className: "Monk", specName: "Brewmaster" },
  };
}

function fightAnalysisOf(state: CombatState, analysis: Analyzed, actorId: number): FightAnalysis {
  // M15-B: with the TLDR the service builds beside it.
  return withExpectedTldr({
    identity: identityFor(state, actorId),
    specId: "monk/brewmaster",
    analyzerId: BREWMASTER_MONK_ANALYZER_ID,
    scope: "PLAYER_CONTEXT",
    analysis,
    // As the service builds it: the shared producer over the same fight.
    preparation: { state: "ASSESSED", report: assessConsumableStatus(state.fight, actorId) },
    observedDecisions: BREWMASTER_MONK_REGISTRATION.observedDecisionView(analysis),
    // As the service builds it (M14-F): no comparison evidence is retrieved.
    diagnosis: DIAGNOSIS_NOT_RETRIEVED,
  });
}

describe("the schema is analysis/1, widened by exactly one specId", () => {
  it("the version string is unchanged", () => {
    expect(PUBLIC_ANALYSIS_SCHEMA_VERSION).toBe("warcraft-logs-coach.analysis/1");
  });

  it("monk/brewmaster is appended to the specId enum; the four earlier ids keep their position", () => {
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
      "evoker/preservation",
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

  it("Brewmaster introduces no public value of its own: its projection lands entirely inside the existing enum", () => {
    expect(Object.keys(BREWMASTER_EXCLUSION_VIEW_PROJECTION).sort()).toEqual(
      [...BREWMASTER_EXCLUSION_REASONS].sort(),
    );
    expect(BREWMASTER_EXCLUSION_VIEW_PROJECTION).toEqual({
      MELEE_SWING: "NON_GCD_ACTION",
      NON_GCD_ACTION: "NON_GCD_ACTION",
      EXECUTION_LANE_NOT_ESTABLISHED: "EXECUTION_LANE_NOT_ESTABLISHED",
      NO_AUTHORITY_TOKEN_BINDING: "NO_AUTHORITY_TOKEN_BINDING",
      OUTSIDE_FIRST_SLICE: "OUTSIDE_SUPPORTED_SLICE",
    });
  });
});

describe("every committed Brewmaster input projects to a valid document carrying the C4i outcomes, with no internal leak", () => {
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
    "build",
    "talents",
    "heroTree",
    "resolved",
    "diagnostics",
    "auras",
    "cooldowns",
    "readiness",
    "readinessAuras",
    "positiveUsability",
    "dimensions",
    "selection",
    "unselectability",
    "dispatches",
    "undecidedCandidates",
    "stoppingPoint",
    "scope",
  ];
  /** Internal-only vocabulary; none may appear as a public value. */
  const INTERNAL_STRINGS = [
    "MELEE_SWING",
    "OUTSIDE_FIRST_SLICE",
    "PROVEN_USABLE",
    "NOT_PROVEN",
    "COOLDOWN_UPPER_BOUND_ELAPSED",
    "COOLDOWN_UPPER_BOUND_SINCE_FIGHT_START",
    "PRE_COST_AT_LEAST_BASE_COST",
    "SAME_TARGET_RANGE_CONTAINED",
    "CANDIDATE_UNTARGETED",
    "CORROBORATOR_NOT_ENEMY_UNIT_TARGET",
    "RESOURCE_NOT_OBSERVED_PRE_COST",
    "RESOURCE_WIRE_VERSION_NOT_COVERED",
    "SIMULATED_PREFIX_EXECUTION",
    "AMBIGUOUS_INITIAL_STATE",
    "PROVEN_INACTIVE",
    "ONE_SCAN_BLOCKED",
    "DIVERGENT_GCD_OUTCOMES",
    "TRANSITION_UNSUPPORTED",
    "CONDITION_NOT_PROVEN_FALSE",
    "run_action_list",
    "shado_pan[",
    "master_of_harmony",
    "empty_barrel",
    "empty_the_cellar",
    "blackout_combo",
    "salsalabims_strength",
    "1262768",
  ];

  for (const input of INPUTS) {
    it(`${input.label}: schema-valid at analysis/1, the C4i totals and REJECTEDs, every value public, nothing withheld on the wire`, async () => {
      const state = await stateOf(input);
      const analysis = analyzed(state, input.actor);
      const projected = projectAnalysisResult(fightAnalysisOf(state, analysis, input.actor));
      expect(PublicAnalysisResultSchema.safeParse(projected).success).toBe(true);
      expect(projected.schemaVersion).toBe("warcraft-logs-coach.analysis/1");
      if (projected.status !== "ANALYZED") throw new Error(projected.status);
      expect(projected.specialization).toEqual({ specId: "monk/brewmaster", gameplaySupported: true });
      expect(projected.analyzerId).toBe(BREWMASTER_MONK_ANALYZER_ID);
      expect(projected.capability.scoresPerformance).toBe(false);
      expect(projected.capability.matchMeaning).toBe("AUTHORITY_COMPATIBLE_ONLY");
      expect(projected.capability.unknownIsFirstClass).toBe(true);
      expect(projected.capability.partialCoverageIsExpected).toBe(true);
      expect(projected.authority.authorityId).toBe("SIMC_APL_MONK_BREWMASTER");

      const [match, rejected, unknown] = input.expected.counts;
      expect([projected.coverage.match, projected.coverage.rejected, projected.coverage.unknown]).toEqual([
        match,
        rejected,
        unknown,
      ]);
      expect(
        projected.decisions
          .filter((decision) => decision.outcome === "REJECTED")
          .map((decision) => decision.locator.reportTimeMs),
      ).toEqual(input.expected.rejectedAt);

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
        expect(["keg_smash", "blackout_kick", "tiger_palm", "breath_of_fire", "invoke_niuzao"]).toContain(
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

      // Decision for decision, the document IS the registration's analysis.
      expect(projected.decisions).toHaveLength(analysis.comparisons.length);
      for (const [index, comparison] of analysis.comparisons.entries()) {
        const decision = projected.decisions[index];
        expect(decision?.position, String(comparison.decision.position)).toBe(comparison.decision.position);
        expect(decision?.outcome).toBe(comparison.outcome);
        expect(decision?.basis).toBe(comparison.basis);
        expect(decision?.authorityToken).toBe(comparison.authorityToken);
        expect(decision?.observedToken).toBe(comparison.decision.observedToken);
      }

      const json = JSON.stringify(projected);
      for (const internal of INTERNAL_STRINGS) expect(json, internal).not.toContain(internal);
      const keys = keysOf(projected);
      for (const withheld of WITHHELD_KEYS) expect([...keys], withheld).not.toContain(withheld);
    });
  }

  it("the cell projection reconciles and names the slice boundary publicly", async () => {
    const input = INPUTS[1];
    if (input === undefined) throw new Error("input");
    const state = await stateOf(input);
    const projection = toPlayerFightCell({
      analysis: fightAnalysisOf(state, analyzed(state, input.actor), input.actor),
      normalizationRevision: state.fight.provenance.normalizationRevision,
    });
    expect(projection.ok).toBe(true);
    if (!projection.ok || projection.cell.kind !== "ANALYZED") throw new Error("cell");
    expect(projection.cell.counts).toMatchObject({
      eligibleDecisions: 113,
      match: 71,
      rejected: 1,
      unknown: 41,
    });
    const patterns = projection.cell.recurrence.exclusionPatterns.map((row) => row.key);
    expect(patterns.some((key) => key.includes("OUTSIDE_SUPPORTED_SLICE"))).toBe(true);
    expect(patterns.some((key) => key.includes("OUTSIDE_FIRST_SLICE"))).toBe(false);
    expect(patterns.some((key) => key.includes("MELEE_SWING"))).toBe(false);
  });
});

describe("public/internal equivalence: the public path runs the same analyzer and projects the same result", () => {
  it("the application service's ANALYZED envelope equals the registration's analysis, projected, for both subjects", async () => {
    for (const input of [INPUTS[1], INPUTS[4]]) {
      if (input === undefined) throw new Error("input");
      const state = await stateOf(input);
      const counted = countedProductionCatalog();
      const deps: AnalysisServiceDeps = {
        env: MCP_TEST_ENV,
        preflight: async () => ({
          ok: true,
          identity: identityFor(state, input.actor),
          rateLimit: undefined,
        }),
        ingest: async () => ({ ok: true, fight: state.fight, rateLimit: undefined }),
        registry: counted.registry,
      };
      const result = await analyzeFight(
        { reportCode: state.fight.report.code, fightId: state.fight.fight.id, sourceId: input.actor },
        deps,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.analysis.specId).toBe("monk/brewmaster");
      expect(result.analysis.analyzerId).toBe(BREWMASTER_MONK_ANALYZER_ID);
      expect(result.analysis.scope).toBe("PLAYER_CONTEXT");
      expect(counted.calls[BREWMASTER_MONK_ANALYZER_ID]).toBe(1);
      expect(projectAnalysisResult(result.analysis)).toEqual(
        projectAnalysisResult(fightAnalysisOf(state, analyzed(state, input.actor), input.actor)),
      );
    }
    // And the internal lookup is the SAME row the public one now finds.
    expect(internalAnalyzerForSpec("monk/brewmaster", PRODUCTION_CATALOG)?.analyzerId).toBe(
      BREWMASTER_MONK_ANALYZER_ID,
    );
  });
});

describe("the refusal documents are public and carry no decisions", () => {
  it("a segment with no combatant profile projects PROFILE_NOT_RESOLVED, never a smaller ANALYZED document", () => {
    const state = corpusState(S1_165);
    const analysis = BREWMASTER_MONK_REGISTRATION.analyze({
      state,
      actorId: 4,
      specId: "monk/brewmaster",
      targetActorId: null,
    }) as BrewmasterMonkAnalysis;
    expect(analysis.status).toBe("PROFILE_NOT_RESOLVED");
    if (analysis.status === "ANALYZED") return;
    const projected = projectAnalysisResult({
      identity: identityFor(state, 4),
      specId: "monk/brewmaster",
      analyzerId: BREWMASTER_MONK_ANALYZER_ID,
      scope: "PLAYER_CONTEXT",
      analysis,
      preparation: PREPARATION_NOT_ASSESSED,
      observedDecisions: null,
    });
    expect(PublicAnalysisResultSchema.safeParse(projected).success).toBe(true);
    expect(projected.status).toBe("PROFILE_NOT_RESOLVED");
    if (projected.status === "ANALYZED") return;
    expect(projected.detail.length).toBeGreaterThan(0);
    expect(Object.keys(projected)).not.toContain("decisions");
    expect(Object.keys(projected)).not.toContain("coverage");
  });
});
