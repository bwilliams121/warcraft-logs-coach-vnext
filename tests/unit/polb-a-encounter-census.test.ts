import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  APPROVED_EVIDENCE_PREDICATES,
  CENSUS_FACTS,
  CENSUS_PLAN,
  censusReportsAlsoEvaluated,
  parseEncounterStateCensus,
  PRODUCTION_CENSUS_REVIEW_STATE,
  REVIEWED_CLOSURE_CONTRACTS,
  type CensusDatum,
  type CensusRefusalCode,
  type CensusReviewState,
  type EncounterStateCensus,
} from "../../src/data/encounter-census/encounter-state-census-artifact.js";
import { ENCOUNTER_STATE_CENSUS } from "../../src/data/encounter-census/encounter-state-census.js";
import {
  bracketIntervals,
  minimumBracketCount,
  type BracketDeath,
  type BracketTrack,
} from "../../src/data/encounter-census/bracket-predicate.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import type { CombatActor } from "../../src/engine/normalization/actors.js";
import type { CombatPhase } from "../../src/engine/normalization/combat-fight.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../src/engine/normalization/supported-families.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import type { TemporalPosition } from "../../src/engine/state/temporal.js";
import { withEnemyCountAt } from "../../src/findings/enemy-count-bindings.js";
import {
  createEncounterStateSupplier,
  mapCensusDatum,
  PRODUCTION_ENCOUNTER_STATE_SUPPLIER,
  type CensusMappingUnknownReason,
} from "../../src/findings/encounter-state-supplier.js";
import type { AtomBindings } from "../../src/simc/expression/evaluate.js";
import { isBuiltinIdentifier } from "../../src/simc/expression/parse.js";
import { defineSpecAtomVocabulary } from "../../src/simc/expression/spec-vocabulary.js";
import { COMMITTED_DEPLOY_CALENDAR_EVIDENCE } from "../../src/simulation-context/evidence.js";
import { deriveDeploymentCalendar } from "../../src/simulation-context/intervals.js";
import { observableCategory, syntheticFight, UNVERIFIED_CATEGORY } from "../support/synthetic-fight.js";

/**
 * POLB-A: the Policy B schema, its supplier seam and the frozen census plan. No row is entered and no
 * request is made. Every test that needs a row states it here, and the positive path through a closure
 * contract uses a review state only this file holds. See agent/architecture.md "POLB-A".
 */

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const BUILD = "12.1.0.69933";
const ENCOUNTER = 3455;
const DIFFICULTY = 5;
const GAME_VERSION = 1;
const LOG_VERSION = 17;

const SYNTHETIC_CONTRACT = "SYNTHETIC_CLOSURE_CONTRACT";
const PERMISSIVE_REVIEW: CensusReviewState = {
  plan: PRODUCTION_CENSUS_REVIEW_STATE.plan,
  reviewedClosureContracts: [SYNTHETIC_CONTRACT],
  approvedPredicates: {
    ...APPROVED_EVIDENCE_PREDICATES,
    TARGET_IF_CANDIDATES: ["SYNTHETIC_CANDIDATE_PREDICATE"],
  },
};

const pulls = (counts: readonly number[]): CensusDatum["sourcePulls"] =>
  counts.map((lowerBound, index) => ({
    reportCode: `CENSUSREPORT${String(index)}`,
    reportRevision: 1,
    fightId: 1,
    gameBuild: BUILD,
    completeness: "COMPLETE" as const,
    evidenceArtifactIds: [`census-pull-${String(index)}`],
    observation: { kind: "COUNT" as const, lowerBound },
  }));

const lowerBoundDatum = (overrides: Partial<CensusDatum> = {}): CensusDatum => ({
  datumId: "active-0-30",
  fact: "ACTIVE_ENEMIES",
  actionToken: null,
  applicability: {
    encounterId: ENCOUNTER,
    difficulty: DIFFICULTY,
    gameVersion: GAME_VERSION,
    logVersion: LOG_VERSION,
    gameBuilds: [BUILD],
  },
  evidencePredicate: "BRACKETED_HOSTILE_INSTANCE_V1",
  window: { anchor: "PULL_START", fromMs: 0, toMs: 30_000 },
  value: { kind: "COUNT_BOUND", status: "BOUNDED", lowerBound: 2, upperBound: null, closureContract: null },
  completeness: "COMPLETE",
  sourcePulls: pulls([2, 2, 3, 2, 4]),
  ...overrides,
});

const closedDatum = (upperBound: number): CensusDatum =>
  lowerBoundDatum({
    value: {
      kind: "COUNT_BOUND",
      status: upperBound === 2 ? "EXACT" : "BOUNDED",
      lowerBound: 2,
      upperBound,
      closureContract: SYNTHETIC_CONTRACT,
    },
    sourcePulls: pulls([2, 2, 2, 2, 2]),
  });

const datasetOf = (data: readonly CensusDatum[]): EncounterStateCensus => ({
  schemaVersion: 1,
  datasetId: "ENCOUNTER_STATE_CENSUS",
  datasetRevision: "synthetic/1",
  acquisitionRuleId: CENSUS_PLAN.acquisitionRuleId,
  sourceCorpusRevision: "synthetic-corpus",
  data: [...data],
});

function refusalCodes(
  data: readonly CensusDatum[],
  review: CensusReviewState = PRODUCTION_CENSUS_REVIEW_STATE,
): readonly CensusRefusalCode[] {
  const parsed = parseEncounterStateCensus(datasetOf(data), review);
  return parsed.ok ? [] : parsed.refusals.map((refusal) => refusal.code);
}

interface CommittedContext {
  readonly code: string;
  readonly startTime: number;
  readonly fights: readonly {
    readonly encounterID: number;
    readonly difficulty: number;
    readonly startTime: number;
  }[];
}

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 400_000;
const SUBJECT = 15;
const BOSS = 161;
const ADD = 180;

const actor = (actorId: number, actorType: CombatActor["actorType"]): [number, CombatActor] => [
  actorId,
  {
    actorId,
    gameId: null,
    name: null,
    server: null,
    actorType,
    rawType: null,
    subType: null,
    petOwnerActorId: null,
  },
];
const CATALOG = new Map<number, CombatActor>([
  actor(SUBJECT, "PLAYER"),
  actor(BOSS, "NPC"),
  actor(ADD, "NPC"),
]);

const hit = (timestamp: number, target: number): Raw => ({
  timestamp,
  type: "damage",
  sourceID: SUBJECT,
  targetID: target,
  targetInstance: 1,
  abilityGameID: 1,
  amount: 100,
  fight: 1,
});
const debuff = (timestamp: number, target: number): Raw => ({
  timestamp,
  type: "applydebuff",
  sourceID: SUBJECT,
  targetID: target,
  targetInstance: 1,
  abilityGameID: 703,
  fight: 1,
});
const cast = (timestamp: number): Raw => ({
  timestamp,
  type: "cast",
  sourceID: SUBJECT,
  targetID: BOSS,
  abilityGameID: 2,
  fight: 1,
});

const TWO_MEMBERS: readonly Raw[] = [
  hit(2_000, BOSS),
  debuff(2_100, BOSS),
  hit(2_200, ADD),
  debuff(2_300, ADD),
  cast(5_000),
];

interface PullOptions {
  readonly events?: readonly Raw[];
  readonly phases?: readonly CombatPhase[];
  readonly phasesObserved?: boolean;
  readonly reportCode?: string;
  readonly difficulty?: number | null;
  readonly gameVersion?: number | null;
  readonly logVersion?: number;
}

function pullOf(options: PullOptions = {}): CombatState {
  const normalizer = createNormalizer({
    fightStartTimeMs: START,
    requestedRange: inclusiveRange(START, END),
    contracts: indexContracts([...SUPPORTED_TYPE_CONTRACTS]),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: START,
    nextPageTimestamp: null,
    events: options.events ?? TWO_MEMBERS,
  });
  const fight = syntheticFight({
    events: normalizer.finish().events,
    startTimeMs: START,
    endTimeMs: END,
    actors: CATALOG,
    categories: {
      AURAS: observableCategory(inclusiveRange(START, END), null),
      ENCOUNTER_PHASES:
        options.phasesObserved === false
          ? UNVERIFIED_CATEGORY
          : observableCategory(inclusiveRange(START, END), null),
    },
  });
  return createCombatState({
    ...fight,
    phases: options.phases ?? [],
    report: { ...fight.report, code: options.reportCode ?? "ANALYZEDREPORT00" },
    fight: {
      ...fight.fight,
      encounterId: ENCOUNTER,
      difficulty: options.difficulty === undefined ? DIFFICULTY : options.difficulty,
    },
    data: {
      gameVersion: options.gameVersion === undefined ? GAME_VERSION : options.gameVersion,
      logVersion: options.logVersion ?? LOG_VERSION,
    },
  });
}

const AT_DECISION: TemporalPosition = { anchor: "BEFORE_EVENT", position: 4 };

function reasonOf(
  data: readonly CensusDatum[],
  state: CombatState,
  build: string | null = BUILD,
): CensusMappingUnknownReason | "MAPPED" {
  const mapped = mapCensusDatum(datasetOf(data), state, build, {
    fact: "ACTIVE_ENEMIES",
    actionToken: null,
    at: AT_DECISION,
  });
  return mapped.state === "MAPPED" ? "MAPPED" : mapped.reason;
}

const supplierOf = (data: readonly CensusDatum[], build: string | null = BUILD) =>
  createEncounterStateSupplier({ dataset: datasetOf(data), gameBuildOf: () => build });

// ---------------------------------------------------------------------------
// The committed state
// ---------------------------------------------------------------------------

describe("the committed census holds nothing, and can hold no upper bound today", () => {
  it("has no row, no reviewed closure contract, and one approved predicate", () => {
    expect(ENCOUNTER_STATE_CENSUS.data).toEqual([]);
    expect(REVIEWED_CLOSURE_CONTRACTS).toEqual([]);
    expect(Object.entries(APPROVED_EVIDENCE_PREDICATES).filter(([, list]) => list.length > 0)).toEqual([
      ["ACTIVE_ENEMIES", ["BRACKETED_HOSTILE_INSTANCE_V1"]],
    ]);
  });

  it("the production supplier supplies nothing and leaves a count where events put it", () => {
    const state = pullOf();
    expect(PRODUCTION_ENCOUNTER_STATE_SUPPLIER.upperBoundAt(state, AT_DECISION)).toBeNull();
    expect(PRODUCTION_ENCOUNTER_STATE_SUPPLIER.targetDomainClosureAt(state, "x", AT_DECISION)).toEqual({
      closure: "OPEN",
      provenance: "",
    });
  });
});

// ---------------------------------------------------------------------------
// The frozen plan
// ---------------------------------------------------------------------------

describe("the census plan is frozen, neutral and honest about its cost", () => {
  it("is not authorized by this tranche", () => {
    expect(CENSUS_PLAN.status).toBe("PROPOSED_NOT_AUTHORIZED");
  });

  it("names a build only over an interval the deploy calendar proves", () => {
    if (!COMMITTED_DEPLOY_CALENDAR_EVIDENCE.ok) throw new Error("calendar does not load");
    const calendar = deriveDeploymentCalendar(COMMITTED_DEPLOY_CALENDAR_EVIDENCE.evidence);
    for (const partition of CENSUS_PLAN.partitions) {
      const interval = calendar.intervals.find(
        (candidate) =>
          candidate.region === partition.region && candidate.version === partition.gameBuildVersion,
      );
      expect(interval?.fromUtc, partition.partitionId).toBe(partition.provenIntervalFromUtc);
      expect(interval?.toUtc, partition.partitionId).toBe(partition.provenIntervalToUtc);
    }
  });

  const committedContexts = (): readonly CommittedContext[] =>
    ["tests/evidence/artifacts/wcl-graphql", "tests/corpus/artifacts/wcl-graphql"].flatMap((root) =>
      readdirSync(root, { recursive: false, withFileTypes: false })
        .filter((name) => name.includes("fight-context"))
        .map(
          (name) =>
            (
              JSON.parse(readFileSync(join(root, name), "utf8")) as {
                reportData: { report: CommittedContext };
              }
            ).reportData.report,
        ),
    );

  it("has exactly the partitions its rule gives on the committed fights", () => {
    if (!COMMITTED_DEPLOY_CALENDAR_EVIDENCE.ok) throw new Error("calendar does not load");
    const { intervals } = deriveDeploymentCalendar(COMMITTED_DEPLOY_CALENDAR_EVIDENCE.evidence);
    const derived = new Set<string>();
    for (const report of committedContexts()) {
      for (const fight of report.fights) {
        const at = report.startTime + fight.startTime;
        const interval = intervals.find(
          (candidate) => Date.parse(candidate.fromUtc) <= at && at < Date.parse(candidate.toUtc),
        );
        if (interval !== undefined && typeof fight.encounterID === "number" && fight.encounterID > 0) {
          derived.add(`${String(fight.encounterID)}-${String(fight.difficulty)}-${String(interval.buildId)}`);
        }
      }
    }
    expect([...derived].sort()).toEqual(
      CENSUS_PLAN.partitions.map((partition) => partition.partitionId).sort(),
    );
  });

  it("excludes every report a committed context evaluates", () => {
    const codes = new Set(committedContexts().map((report) => report.code));
    expect(codes.size).toBeGreaterThan(0);
    expect([...codes].filter((code) => !CENSUS_PLAN.excludedEvaluatedReports.includes(code))).toEqual([]);
  });

  it("adds up, and reads no ranking, parse or comparison source", () => {
    const pullCount = CENSUS_PLAN.partitions.length * CENSUS_PLAN.requiredIndependentPulls;
    const budget = CENSUS_PLAN.requestBudget;
    expect(budget.listingPages).toBe(
      CENSUS_PLAN.partitions.length * CENSUS_PLAN.discovery.maxListingPagesPerPartition,
    );
    expect(budget.contextRequests).toBe(pullCount);
    expect(budget.revisionRequests).toBe(pullCount);
    expect(budget.eventPages).toBe(pullCount * CENSUS_PLAN.limits.maxEventPagesPerPull);
    expect(
      budget.tokenRequests +
        budget.regionLookups +
        budget.listingPages +
        budget.contextRequests +
        budget.eventPages +
        budget.revisionRequests,
    ).toBe(budget.worstCaseTotal);
    expect(budget.proposedCap).toBe(budget.worstCaseTotal);

    const bytes = CENSUS_PLAN.retainedBytes;
    expect(bytes.estimatedTotalBytes).toBe(
      pullCount * (bytes.measuredPullWitnessBytes + bytes.measuredPullContextSliceBytes) +
        CENSUS_PLAN.partitions.length * bytes.estimatedListingFrameBytesPerPartition,
    );
    expect(bytes.estimatedTotalBytes).toBeGreaterThan(bytes.bytesLeftUnderNoticeLine);
    expect(JSON.stringify(CENSUS_PLAN)).not.toMatch(/rank|parse|percentile|comparison|topLog/i);
  });
});

// ---------------------------------------------------------------------------
// The schema
// ---------------------------------------------------------------------------

describe("the schema refuses what would turn an observation into a claim", () => {
  it("accepts a lower bound with every provenance field", () => {
    expect(refusalCodes([lowerBoundDatum()])).toEqual([]);
  });

  it("refuses an upper bound, an exact count or a closed set without a reviewed contract", () => {
    expect(refusalCodes([closedDatum(4)])).toEqual(["CLOSURE_WITHOUT_REVIEWED_CONTRACT"]);
    expect(refusalCodes([closedDatum(2)])).toEqual(["CLOSURE_WITHOUT_REVIEWED_CONTRACT"]);
    expect(refusalCodes([closedDatum(4)], PERMISSIVE_REVIEW)).toEqual([]);
    const observedMaximum = lowerBoundDatum({
      value: { kind: "COUNT_BOUND", status: "BOUNDED", lowerBound: 2, upperBound: 4, closureContract: null },
    });
    expect(refusalCodes([observedMaximum], PERMISSIVE_REVIEW)).toEqual(["CLOSURE_WITHOUT_REVIEWED_CONTRACT"]);

    const closedSet: CensusDatum = lowerBoundDatum({
      fact: "TARGET_IF_CANDIDATES",
      actionToken: "reapers_mark",
      evidencePredicate: "SYNTHETIC_CANDIDATE_PREDICATE",
      value: {
        kind: "CANDIDATE_SET",
        status: "EXACT",
        closure: "CLOSED",
        creatureGameIds: [259181],
        closureContract: "NOT_REVIEWED",
      },
      sourcePulls: pulls([0, 0, 0, 0, 0]).map((pull) => ({
        ...pull,
        observation: { kind: "CANDIDATES" as const, creatureGameIds: [259181] },
      })),
    });
    expect(refusalCodes([closedSet], PERMISSIVE_REVIEW)).toEqual(["CLOSURE_WITHOUT_REVIEWED_CONTRACT"]);
  });

  it("a conflict widens: 4 and 5 keep both, and neither may be chosen", () => {
    const conflicting = pulls([4, 5, 4, 5, 5]);
    const bound = (lowerBound: number): CensusDatum =>
      lowerBoundDatum({
        sourcePulls: conflicting,
        value: {
          kind: "COUNT_BOUND",
          status: "BOUNDED",
          lowerBound,
          upperBound: null,
          closureContract: null,
        },
      });
    expect(refusalCodes([bound(4)])).toEqual([]);
    expect(refusalCodes([bound(5)])).toEqual(["CONFLICT_NOT_WIDENED"]);

    const tooLowAnUpperBound = lowerBoundDatum({
      sourcePulls: conflicting,
      value: {
        kind: "COUNT_BOUND",
        status: "BOUNDED",
        lowerBound: 4,
        upperBound: 4,
        closureContract: SYNTHETIC_CONTRACT,
      },
    });
    expect(refusalCodes([tooLowAnUpperBound], PERMISSIVE_REVIEW)).toEqual([
      "CONFLICT_NOT_WIDENED",
      "STATUS_MISSTATED",
    ]);
  });

  it("two rows over one window are a conflict nobody widened", () => {
    const second = lowerBoundDatum({
      datumId: "active-20-50",
      window: { anchor: "PULL_START", fromMs: 20_000, toMs: 50_000 },
    });
    expect(refusalCodes([lowerBoundDatum(), second])).toEqual(["OVERLAPPING_WINDOWS"]);
    const adjacent = lowerBoundDatum({
      datumId: "active-30-60",
      window: { anchor: "PULL_START", fromMs: 30_000, toMs: 60_000 },
    });
    expect(refusalCodes([lowerBoundDatum(), adjacent])).toEqual([]);
    expect(refusalCodes([lowerBoundDatum(), lowerBoundDatum()])).toEqual([
      "DUPLICATE_DATUM",
      "OVERLAPPING_WINDOWS",
    ]);
  });

  it("never lets one fact stand in for another", () => {
    for (const fact of CENSUS_FACTS.filter((candidate) => candidate !== "ACTIVE_ENEMIES")) {
      const actionToken = fact === "SPELL_TARGETS" || fact === "TARGET_IF_CANDIDATES" ? "any_action" : null;
      expect(refusalCodes([lowerBoundDatum({ fact, actionToken })]), fact).toContain(
        "PREDICATE_NOT_APPROVED",
      );
    }
    expect(refusalCodes([lowerBoundDatum({ evidencePredicate: "OBSERVED_MAXIMUM" })])).toEqual([
      "PREDICATE_NOT_APPROVED",
    ]);
    expect(refusalCodes([lowerBoundDatum({ actionToken: "chomp" })])).toEqual(["ACTION_OWNERSHIP"]);
  });

  it("requires independent pulls of the datum's own build, and complete means complete", () => {
    expect(refusalCodes([lowerBoundDatum({ sourcePulls: pulls([2, 2, 2, 2]) })])).toEqual([
      "TOO_FEW_INDEPENDENT_PULLS",
    ]);
    const [first, ...rest] = pulls([2, 2, 2, 2, 2, 2]);
    if (first === undefined) throw new Error("no pull");
    expect(
      refusalCodes([lowerBoundDatum({ sourcePulls: [first, { ...first, fightId: 2 }, ...rest] })]),
    ).toEqual(["SOURCE_PULLS_NOT_INDEPENDENT"]);
    expect(
      refusalCodes([lowerBoundDatum({ sourcePulls: [{ ...first, gameBuild: "12.1.0.1" }, ...rest] })]),
    ).toEqual(["SOURCE_BUILD_NOT_APPLICABLE"]);
    expect(
      refusalCodes([lowerBoundDatum({ sourcePulls: [{ ...first, completeness: "PARTIAL" }, ...rest] })]),
    ).toEqual(["COMPLETENESS_OVERSTATED"]);
  });

  it("refuses a missing provenance field, another acquisition rule and another schema version", () => {
    for (const field of [
      "evidencePredicate",
      "window",
      "completeness",
      "applicability",
      "sourcePulls",
      "value",
    ] as const) {
      const { [field]: _dropped, ...withoutField } = lowerBoundDatum();
      const parsed = parseEncounterStateCensus({ ...datasetOf([]), data: [withoutField] });
      expect(parsed.ok, field).toBe(false);
    }
    const withoutArtifacts = lowerBoundDatum({
      sourcePulls: pulls([2, 2, 2, 2, 2]).map((pull) => ({ ...pull, evidenceArtifactIds: [] })),
    });
    expect(new Set(refusalCodes([withoutArtifacts]))).toEqual(new Set(["SHAPE"]));
    expect(parseEncounterStateCensus({ ...datasetOf([]), schemaVersion: 2 }).ok).toBe(false);
    expect(parseEncounterStateCensus({ ...datasetOf([]), sourceCorpusRevision: "" }).ok).toBe(false);
    const otherRule = parseEncounterStateCensus({ ...datasetOf([]), acquisitionRuleId: "OTHER" });
    expect(otherRule.ok).toBe(false);
  });

  it("names a census report that is also evaluated", () => {
    const dataset = datasetOf([lowerBoundDatum()]);
    expect(censusReportsAlsoEvaluated(dataset, new Set(["CENSUSREPORT3", "OTHER"]))).toEqual([
      "CENSUSREPORT3",
    ]);
    expect(censusReportsAlsoEvaluated(dataset, new Set(CENSUS_PLAN.excludedEvaluatedReports))).toEqual([]);
    expect(
      censusReportsAlsoEvaluated(ENCOUNTER_STATE_CENSUS, new Set(CENSUS_PLAN.excludedEvaluatedReports)),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The predicate
// ---------------------------------------------------------------------------

describe("the bracket predicate's window minimum is exact, never sampled", () => {
  const GAP = CENSUS_PLAN.predicate.bracketGapMs;
  const track = (
    actorId: number,
    instanceId: number | null,
    eventTimesMs: readonly number[],
  ): BracketTrack => ({
    actorId,
    instanceId,
    eventTimesMs,
  });
  const minimumOf = (
    tracks: readonly BracketTrack[],
    deaths: readonly BracketDeath[] = [],
    fromMs = 0,
    toMs = 30_000,
    coveredToMs = 100_000,
  ) => minimumBracketCount({ tracks, deaths, gapMs: GAP, fromMs, toMs, coveredToMs });

  it("finds a dip shorter than any 250 ms grid: one dies, and its replacement appears 80 ms later", () => {
    const tracks = [track(1, 1, [0, 1_010, 2_000]), track(1, 2, [1_090, 29_999])];
    const deaths = [{ actorId: 1, instanceId: 1, timeMs: 1_010 }];
    const sampled = [...Array(120).keys()].map((index) => index * 250);
    const sampledCounts = sampled.map(
      (time) => (time < 1_010 ? 1 : 0) + (time >= 1_090 && time <= 29_999 ? 1 : 0),
    );
    expect(Math.min(...sampledCounts)).toBe(1);
    expect(minimumOf(tracks, deaths)).toEqual({ kind: "MINIMUM", count: 0, atMs: 1_010 });
  });

  it("holds across a gap at the limit and not past it, and a death ends presence at its millisecond", () => {
    expect(bracketIntervals([0, GAP], GAP)).toEqual([{ fromMs: 0, toMs: GAP }]);
    expect(bracketIntervals([0, GAP + 1], GAP)).toEqual([
      { fromMs: 0, toMs: 0 },
      { fromMs: GAP + 1, toMs: GAP + 1 },
    ]);
    const silent = [track(1, 1, [0, GAP + 1])];
    expect(minimumOf(silent, [], 0, GAP + 2)).toMatchObject({ count: 0, atMs: 1 });
    const dying = [track(1, 1, [0, 5_000])];
    expect(minimumOf(dying, [{ actorId: 1, instanceId: 1, timeMs: 3_000 }], 0, 5_001)).toMatchObject({
      count: 0,
      atMs: 3_000,
    });
  });

  it("a null instance may be a numbered one, in presence and in death", () => {
    const both = [track(1, null, [0, 1_000]), track(1, 7, [0, 1_000])];
    expect(minimumOf(both, [], 0, 1_001)).toMatchObject({ count: 1 });
    const other = [track(1, null, [0, 1_000]), track(2, 7, [0, 1_000])];
    expect(minimumOf(other, [], 0, 1_001)).toMatchObject({ count: 2 });
    const deathOfNull = [track(1, 7, [0, 1_000])];
    expect(minimumOf(deathOfNull, [{ actorId: 1, instanceId: null, timeMs: 500 }], 0, 1_001)).toMatchObject({
      count: 0,
      atMs: 500,
    });
    const deathOfSibling = [track(1, 7, [0, 1_000])];
    expect(minimumOf(deathOfSibling, [{ actorId: 1, instanceId: 8, timeMs: 500 }], 0, 1_001)).toMatchObject({
      count: 1,
    });
  });

  it("refuses a window the pull does not wholly cover, rather than clipping it", () => {
    const steady = [track(1, 1, [0, 20_000, 40_000])];
    expect(minimumOf(steady, [], 30_000, 60_000, 40_000)).toEqual({ kind: "WINDOW_NOT_COVERED" });
    expect(minimumOf(steady, [], 10_000, 40_001, 40_000)).toMatchObject({ kind: "MINIMUM", count: 1 });
    expect(minimumOf(steady, [], 10_000, 10_000)).toEqual({ kind: "WINDOW_NOT_COVERED" });
  });

  it("is the plan's predicate, and a window outside every interval's edge still reads its own ends", () => {
    expect(CENSUS_PLAN.predicate.id).toBe("BRACKETED_HOSTILE_INSTANCE_V1");
    expect(minimumOf([track(1, 1, [0, 30_000])], [], 10_000, 20_000)).toMatchObject({ count: 1 });
    expect(minimumOf([], [], 10_000, 20_000)).toMatchObject({ count: 0 });
  });
});

// ---------------------------------------------------------------------------
// The mapping
// ---------------------------------------------------------------------------

describe("a datum maps onto an analyzed pull only where every key is established", () => {
  it("maps inside its window, with the citation the owner listed", () => {
    const mapped = mapCensusDatum(datasetOf([lowerBoundDatum()]), pullOf(), BUILD, {
      fact: "ACTIVE_ENEMIES",
      actionToken: null,
      at: AT_DECISION,
    });
    if (mapped.state !== "MAPPED") throw new Error(mapped.reason);
    expect(mapped.citation).toEqual({
      datasetId: "ENCOUNTER_STATE_CENSUS",
      datasetRevision: "synthetic/1",
      datumId: "active-0-30",
      acquisitionRuleId: CENSUS_PLAN.acquisitionRuleId,
      evidencePredicate: "BRACKETED_HOSTILE_INSTANCE_V1",
      sourceCorpusRevision: "synthetic-corpus",
      window: "PULL_START[0,30000)",
      completeness: "COMPLETE",
      sourcePulls: lowerBoundDatum().sourcePulls.map((pull) => ({
        reportCode: pull.reportCode,
        fightId: pull.fightId,
      })),
    });
  });

  it("is UNKNOWN for each key it cannot establish", () => {
    const row = [lowerBoundDatum()];
    expect(reasonOf([], pullOf())).toBe("NO_CURATED_DATUM");
    expect(reasonOf(row, pullOf({ difficulty: null }))).toBe("DIFFICULTY_UNKNOWN");
    expect(reasonOf(row, pullOf({ difficulty: 4 }))).toBe("NO_CURATED_DATUM");
    expect(reasonOf(row, pullOf({ gameVersion: null }))).toBe("VERSION_NOT_APPLICABLE");
    expect(reasonOf(row, pullOf({ gameVersion: 2 }))).toBe("VERSION_NOT_APPLICABLE");
    expect(reasonOf(row, pullOf({ logVersion: 18 }))).toBe("VERSION_NOT_APPLICABLE");
    expect(reasonOf(row, pullOf(), null)).toBe("BUILD_UNRESOLVED");
    expect(reasonOf(row, pullOf(), "12.1.0.69587")).toBe("BUILD_NOT_COVERED");
    expect(reasonOf(row, pullOf({ reportCode: "CENSUSREPORT2" }))).toBe("ANALYZED_REPORT_IS_CENSUS_SOURCE");
    expect(
      reasonOf(
        [lowerBoundDatum({ window: { anchor: "PULL_START", fromMs: 30_000, toMs: 60_000 } })],
        pullOf(),
      ),
    ).toBe("OUTSIDE_WINDOW");
  });

  it("does not map a census that was not complete", () => {
    const partial = lowerBoundDatum({ completeness: "PARTIAL" });
    expect(reasonOf([partial], pullOf())).toBe("CENSUS_NOT_COMPLETE");
  });

  describe("a phase window", () => {
    const phaseRow = lowerBoundDatum({
      window: { anchor: "PHASE_START", phaseId: 2, fromMs: 0, toMs: 30_000 },
    });
    const phase = (phaseId: number, startTimeMs: number): CombatPhase => ({
      phaseId,
      name: null,
      isIntermission: null,
      startTimeMs,
      fightTimeMs: startTimeMs - START,
    });

    it("maps from the pull's own transition at or before the decision", () => {
      expect(reasonOf([phaseRow], pullOf({ phases: [phase(1, START), phase(2, 3_000)] }))).toBe("MAPPED");
    });

    it("is OUTSIDE in another phase, and offsets from the transition rather than the pull", () => {
      expect(reasonOf([phaseRow], pullOf({ phases: [phase(1, START), phase(2, 5_500)] }))).toBe(
        "OUTSIDE_WINDOW",
      );
      const late = lowerBoundDatum({
        window: { anchor: "PHASE_START", phaseId: 2, fromMs: 3_000, toMs: 30_000 },
      });
      expect(reasonOf([late], pullOf({ phases: [phase(1, START), phase(2, 3_000)] }))).toBe("OUTSIDE_WINDOW");
    });

    it("is UNKNOWN when phases were not observed or no transition is held, never the pull's clock", () => {
      expect(reasonOf([phaseRow], pullOf({ phasesObserved: false, phases: [phase(2, 3_000)] }))).toBe(
        "WINDOW_ANCHOR_NOT_ESTABLISHED",
      );
      expect(reasonOf([phaseRow], pullOf({ phases: [] }))).toBe("WINDOW_ANCHOR_NOT_ESTABLISHED");
    });

    it("a window whose anchor cannot be read makes a match beside it ambiguous", () => {
      const pullRow = lowerBoundDatum({ datumId: "pull-row" });
      expect(reasonOf([phaseRow, pullRow], pullOf({ phases: [] }))).toBe("AMBIGUOUS_DATA");
      const nearby = lowerBoundDatum({
        datumId: "phase-row",
        window: { anchor: "PHASE_START", phaseId: 2, fromMs: 0, toMs: 90_000 },
      });
      expect(reasonOf([pullRow, nearby], pullOf({ phases: [phase(1, START), phase(2, 3_000)] }))).toBe(
        "AMBIGUOUS_DATA",
      );
    });
  });

  it("reads nothing after the decision: appended events cannot change the answer", () => {
    const row = [lowerBoundDatum()];
    const before = reasonOf(row, pullOf());
    const after = reasonOf(row, pullOf({ events: [...TWO_MEMBERS, hit(200_000, BOSS), cast(300_000)] }));
    expect(after).toBe(before);
    expect(after).toBe("MAPPED");
  });
});

// ---------------------------------------------------------------------------
// The seam
// ---------------------------------------------------------------------------

describe("the supplier feeds the existing count model and decides nothing itself", () => {
  const VOCABULARY = defineSpecAtomVocabulary(
    "test/census",
    [{ identifier: "active_enemies", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false }],
    isBuiltinIdentifier,
  );
  const BASE = { specAtoms: { vocabulary: VOCABULARY, bound: [] } } as unknown as AtomBindings;
  const countOf = (data: readonly CensusDatum[], state: CombatState = pullOf()) => {
    const dataset = parseEncounterStateCensus(datasetOf(data), PERMISSIVE_REVIEW);
    if (!dataset.ok) throw new Error(JSON.stringify(dataset.refusals));
    const bound = withEnemyCountAt(BASE, state, SUBJECT, 4, supplierOf(dataset.dataset.data));
    return bound.specAtoms?.bound.find((atom) => atom.key === "active_enemies")?.value;
  };

  it("a lower-bound row leaves the upper bound open", () => {
    expect(countOf([lowerBoundDatum()])).toEqual(
      withEnemyCountAt(BASE, pullOf(), SUBJECT, 4).specAtoms?.bound.find(
        (atom) => atom.key === "active_enemies",
      )?.value,
    );
    expect(countOf([lowerBoundDatum()])).toMatchObject({ binding: { state: "BOUNDED_NUMBER" } });
  });

  it("under a reviewed contract a bound narrows the count, and only through the enemy set's own rule", () => {
    expect(countOf([closedDatum(2)])).toMatchObject({ binding: { state: "KNOWN_NUMBER", value: 2 } });
    expect(countOf([closedDatum(4)])).toMatchObject({
      binding: { state: "ONE_OF_NUMBERS", values: [2, 3, 4] },
    });
  });

  it("a bound the pull's own evidence contradicts is UNKNOWN, never either number", () => {
    const threeMembers = pullOf({
      events: [
        hit(1_500, BOSS),
        debuff(1_600, BOSS),
        hit(1_700, ADD),
        debuff(1_800, ADD),
        { ...hit(1_900, ADD), targetInstance: 2 },
        { ...debuff(1_950, ADD), targetInstance: 2 },
        cast(5_000),
      ],
    });
    const supplier = supplierOf([closedDatum(2)]);
    const at: TemporalPosition = { anchor: "BEFORE_EVENT", position: 6 };
    expect(supplier.upperBoundAt(threeMembers, at)?.upperBound).toBe(2);
    const bound = withEnemyCountAt(BASE, threeMembers, SUBJECT, 6, supplier);
    expect(bound.specAtoms?.bound.find((atom) => atom.key === "active_enemies")?.value).toMatchObject({
      binding: { state: "UNKNOWN_NUMBER" },
    });
  });

  it("an upper bound that cannot be mapped is no upper bound", () => {
    const supplier = supplierOf([closedDatum(2)], null);
    expect(supplier.upperBoundAt(pullOf(), AT_DECISION)).toBeNull();
  });

  it("a target domain stays OPEN without a closed row, and a closed one cites its row", () => {
    const action = "reapers_mark";
    const candidates = (closure: "OPEN" | "CLOSED"): CensusDatum =>
      lowerBoundDatum({
        fact: "TARGET_IF_CANDIDATES",
        actionToken: action,
        evidencePredicate: "SYNTHETIC_CANDIDATE_PREDICATE",
        value: {
          kind: "CANDIDATE_SET",
          status: closure === "CLOSED" ? "EXACT" : "BOUNDED",
          closure,
          creatureGameIds: [259181],
          closureContract: closure === "CLOSED" ? SYNTHETIC_CONTRACT : null,
        },
      });
    expect(
      supplierOf([candidates("OPEN")]).targetDomainClosureAt(pullOf(), action, AT_DECISION).closure,
    ).toBe("OPEN");
    expect(supplierOf([candidates("CLOSED")]).targetDomainClosureAt(pullOf(), action, AT_DECISION)).toEqual({
      closure: "CLOSED",
      provenance: "synthetic/1#active-0-30",
    });
    expect(
      supplierOf([candidates("CLOSED")]).targetDomainClosureAt(pullOf(), "other_action", AT_DECISION).closure,
    ).toBe("OPEN");
    expect(
      supplierOf([candidates("CLOSED")], null).targetDomainClosureAt(pullOf(), action, AT_DECISION).closure,
    ).toBe("OPEN");
  });
});

// ---------------------------------------------------------------------------
// Layering
// ---------------------------------------------------------------------------

describe("the census stays neutral and apart", () => {
  const code = (file: string): string =>
    readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

  it("the shared modules name no specialization and read no event or network", () => {
    for (const file of [
      "src/data/encounter-census/encounter-state-census-artifact.ts",
      "src/data/encounter-census/encounter-state-census.ts",
      "src/data/encounter-census/bracket-predicate.ts",
      "src/findings/encounter-state-supplier.ts",
    ]) {
      const text = code(file);
      expect(text, file).not.toMatch(/\bspec(Id|Key)?\s*===|arms|devourer|rogue|paladin/i);
      expect(text, file).not.toMatch(/from\s+["'][^"']*\/(wcl|specs|simc)\//);
      expect(text, file).not.toMatch(/\bfetch\(/);
    }
  });

  it("the enemy set imports no dataset, and the corpus and evidence loaders read no census path", () => {
    expect(code("src/engine/game-state/enemies/enemy-set.ts")).not.toMatch(/encounter-census/);
    for (const file of ["tests/support/corpus/evidence-archive.ts", "scripts/corpus/build-manifest.mjs"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/policy-b-census|encounter-census/);
    }
  });
});
