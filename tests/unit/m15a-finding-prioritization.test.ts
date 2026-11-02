import { beforeAll, describe, expect, it } from "vitest";

import type { ComparisonFightInput } from "../../src/comparison-facts/fight-facts.js";
import type { EnvironmentalReason } from "../../src/comparison-facts/strategy-context.js";
import type { ConsumableStatusReport } from "../../src/analysis/preparation/consumable-status.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import type { EvidenceLocator } from "../../src/engine/evidence/locator.js";
import type {
  ObservedDecisionRecord,
  ObservedDecisionView,
} from "../../src/findings/observed-decision-view.js";
import {
  DEFAULT_AGGREGATION_CONFIG,
  type AggregationConfig,
} from "../../src/reporting/aggregation-config.js";
import {
  FINDING_DISPOSITIONS,
  SUPPRESSION_REASONS,
  type ReportableFinding,
} from "../../src/reporting/finding-record.js";
import {
  prioritizeFindings,
  type FindingPrioritization,
  type ReportItem,
} from "../../src/reporting/prioritization.js";
import { restateConsumableStatus, restateObservedDecisions } from "../../src/reporting/restatement.js";
import { analyzeFight } from "../../src/services/analysis-service.js";
import type { FightAnalysis } from "../../src/services/result.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { subjectInput } from "../support/m11/g2-four-fights.js";

/**
 * M15-A: finding aggregation and prioritization over restated structured
 * findings. Synthetic records for every rule, and the committed M11-G2
 * subject fight (the real Blood analysis) through the application service.
 * No Warcraft Logs request is made.
 */

const loc = (index: number): EvidenceLocator => ({
  streamId: "s",
  pageOrdinal: 0,
  indexInPage: index,
  ingestionOrdinal: index,
  rawType: "cast",
  reportTimeMs: 1000 + index,
});

let next = 0;
function rec(fields: Partial<ReportableFinding> = {}): ReportableFinding {
  next += 1;
  return {
    findingId: `f${String(next).padStart(3, "0")}`,
    producer: "TEST",
    category: "ROTATION",
    specId: "test/spec",
    disposition: "AUTHORITY_DIVERGENCE",
    authority: "TEST_APL",
    producerStatus: "REJECTED",
    reasonCode: null,
    suppressionReason: null,
    stateEvidence: "PROVEN",
    actionability: "DECISION_PROVEN_ACTIONABLE",
    fightTimeMs: next * 100,
    evidence: [loc(next)],
    aggregationKey: null,
    subjectToken: null,
    ...fields,
  };
}

const unknown = (fields: Partial<ReportableFinding> = {}) =>
  rec({
    disposition: "UNKNOWN",
    stateEvidence: "INCOMPLETE",
    reasonCode: "OBSERVED_STATE_MISSING",
    ...fields,
  });

function ok(result: FindingPrioritization): Extract<FindingPrioritization, { kind: "PRIORITIZED" }> {
  if (result.kind !== "PRIORITIZED") throw new Error(JSON.stringify(result));
  return result;
}

const prioritize = (records: ReportableFinding[], config: AggregationConfig = DEFAULT_AGGREGATION_CONFIG) =>
  ok(prioritizeFindings(records, config));

const idsOf = (items: readonly ReportItem[]) => items.flatMap((item) => item.findingIds);

describe("sections: only proven authority divergences are prioritized", () => {
  it("non-assessments are carried with their reason, never ranked as failures", () => {
    const records = [
      unknown({ findingId: "u" }),
      rec({
        findingId: "naa",
        disposition: "NO_AUTHORITY_AVAILABLE",
        authority: "NO_AUTHORITY_AVAILABLE",
        reasonCode: "NO_RAID_COOLDOWN_PLAN",
      }),
      rec({
        findingId: "sup",
        disposition: "SUPPRESSED",
        reasonCode: "BOSS_UNTARGETABLE",
        suppressionReason: "INTERMISSION",
      }),
      rec({ findingId: "uns", disposition: "UNSUPPORTED", reasonCode: "SPEC_NOT_SUPPORTED" }),
    ];
    const result = prioritize(records);
    expect(result.prioritized).toEqual([]);
    expect(result.informational).toEqual([]);
    expect(result.carried.map((item) => [item.findingIds[0], item.standing, item.reasonCode])).toEqual([
      ["sup", "SUPPRESSED", "BOSS_UNTARGETABLE"],
      ["u", "UNKNOWN", "OBSERVED_STATE_MISSING"],
      ["naa", "NO_AUTHORITY_AVAILABLE", "NO_RAID_COOLDOWN_PLAN"],
      ["uns", "UNSUPPORTED", "SPEC_NOT_SUPPORTED"],
    ]);
    expect(result.carried.find((item) => item.disposition === "SUPPRESSED")?.suppressionReason).toBe(
      "INTERMISSION",
    );
    expect(result.summary.actionableDivergenceRecords).toBe(0);
    expect(result.summary.nonAssessmentRecords).toBe(4);
    expect(result.summary.includesNonAssessments).toBe(true);
  });

  it("consistent results and observed facts are informational, never failures", () => {
    const result = prioritize([
      rec({ findingId: "m", disposition: "AUTHORITY_CONSISTENT", producerStatus: "MATCH" }),
      rec({
        findingId: "p",
        disposition: "OBSERVED_FACT",
        category: "PREPARATION",
        authority: "WCL_OBSERVED_FACT",
        evidence: [],
      }),
    ]);
    expect(result.prioritized).toEqual([]);
    expect(result.informational.map((item) => item.standing)).toEqual([
      "AUTHORITY_CONSISTENT",
      "OBSERVED_FACT",
    ]);
    expect(result.summary.includesNonAssessments).toBe(false);
  });

  it("UNKNOWN and NO_AUTHORITY_AVAILABLE stay distinct, and each must say which it is", () => {
    const result = prioritize([
      unknown({ findingId: "u" }),
      rec({
        findingId: "naa",
        disposition: "NO_AUTHORITY_AVAILABLE",
        authority: "NO_AUTHORITY_AVAILABLE",
        reasonCode: "X",
      }),
      // An UNKNOWN that claims no authority, and a no-authority result naming one: both refused.
      unknown({ findingId: "bad-u", authority: "NO_AUTHORITY_AVAILABLE" }),
      rec({
        findingId: "bad-naa",
        disposition: "NO_AUTHORITY_AVAILABLE",
        authority: "TEST_APL",
        reasonCode: "X",
      }),
    ]);
    expect(result.carried.map((item) => item.disposition)).toEqual(["UNKNOWN", "NO_AUTHORITY_AVAILABLE"]);
    expect(result.refused).toEqual([
      { findingId: "bad-naa", problems: ["AUTHORITY_DISPOSITION_MISMATCH"] },
      { findingId: "bad-u", problems: ["AUTHORITY_DISPOSITION_MISMATCH"] },
    ]);
  });
});

describe("ordering: evidence quality and actionability first, never magnitude", () => {
  it("orders divergences by actionability standing before anything else", () => {
    const result = prioritize([
      rec({ findingId: "not-established", actionability: "NOT_EVALUATED", fightTimeMs: 1 }),
      rec({ findingId: "observed-only", actionability: "OBSERVED_EXECUTION_ONLY", fightTimeMs: 2 }),
      rec({ findingId: "unknown-act", actionability: "UNKNOWN", fightTimeMs: 0 }),
      rec({ findingId: "proven", actionability: "DECISION_PROVEN_ACTIONABLE", fightTimeMs: 9_999 }),
    ]);
    expect(result.prioritized.map((item) => [item.rank, item.findingIds[0], item.standing])).toEqual([
      [1, "proven", "ACTIONABLE_AUTHORITY_DIVERGENCE"],
      [2, "observed-only", "DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN"],
      [3, "unknown-act", "DIVERGENCE_ACTIONABILITY_NOT_ESTABLISHED"],
      [4, "not-established", "DIVERGENCE_ACTIONABILITY_NOT_ESTABLISHED"],
    ]);
    expect(result.summary.actionableDivergenceRecords).toBe(1);
  });

  it("a pattern outranks a one-off of equal standing, never one of stronger standing", () => {
    const pattern = [1, 2, 3].map(() =>
      rec({ actionability: "OBSERVED_EXECUTION_ONLY", aggregationKey: "k" }),
    );
    const result = prioritize([
      rec({ findingId: "lone-weak", actionability: "OBSERVED_EXECUTION_ONLY" }),
      ...pattern,
      rec({ findingId: "lone-strong" }),
    ]);
    expect(result.prioritized.map((item) => [item.itemKind, item.occurrences])).toEqual([
      ["SINGLE", 1],
      ["PATTERN", 3],
      ["SINGLE", 1],
    ]);
    expect(result.prioritized[0]?.findingIds).toEqual(["lone-strong"]);
  });

  it("states that no magnitude, confidence, suppression or score is used", () => {
    const result = prioritize([rec()]);
    expect(result.magnitude).toBe("NOT_USED");
    expect(result.findingEffect).toEqual({ confidence: "NONE", suppression: "NONE", score: "NONE" });
    expect(result.orderedBy.slice(0, 2)).toEqual(["STATE_EVIDENCE", "ACTIONABILITY"]);
    const keys = Object.keys(result.prioritized[0] ?? {});
    for (const forbidden of ["confidence", "severity", "score", "impact"])
      expect(keys).not.toContain(forbidden);
  });

  it("is independent of input order", () => {
    const records = [
      rec({ aggregationKey: "a" }),
      rec({ aggregationKey: "a" }),
      rec({ aggregationKey: "a" }),
      rec({ actionability: "NOT_EVALUATED" }),
      unknown({ aggregationKey: "u" }),
      rec({ disposition: "AUTHORITY_CONSISTENT" }),
    ];
    const forward = prioritize(records);
    const backward = prioritize([...records].reverse());
    expect(backward).toEqual(forward);
  });
});

describe("aggregation: repeated findings become a pattern without inflating anything", () => {
  it("groups at the threshold and leaves smaller groups as singles", () => {
    const two = [1, 2].map(() => rec({ aggregationKey: "two" }));
    const three = [1, 2, 3].map(() => rec({ aggregationKey: "three" }));
    const result = prioritize([...two, ...three]);
    const patterns = result.prioritized.filter((item) => item.itemKind === "PATTERN");
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.findingIds).toEqual(three.map((record) => record.findingId));
    expect(patterns[0]?.evidence).toEqual(three.flatMap((record) => record.evidence));
    expect(patterns[0]?.firstFightTimeMs).toBe(three[0]?.fightTimeMs);
    expect(patterns[0]?.lastFightTimeMs).toBe(three[2]?.fightTimeMs);
    expect(result.prioritized.filter((item) => item.itemKind === "SINGLE")).toHaveLength(2);
    expect(result.summary.patterns).toBe(1);
  });

  it("never pools members whose standing differs, so a pattern has exactly its members' standing", () => {
    const records = [
      rec({ aggregationKey: "k" }),
      rec({ aggregationKey: "k" }),
      rec({ aggregationKey: "k", actionability: "NOT_EVALUATED" }),
      unknown({ aggregationKey: "k" }),
      rec({ aggregationKey: "k", reasonCode: "OTHER" }),
      rec({ aggregationKey: "k", authority: "OTHER_APL" }),
    ];
    const result = prioritize(records, { ...DEFAULT_AGGREGATION_CONFIG, defaultMinOccurrencesForPattern: 2 });
    const patterns = [...result.prioritized, ...result.carried].filter((item) => item.itemKind === "PATTERN");
    expect(patterns.map((item) => [item.occurrences, item.standing])).toEqual([
      [2, "ACTIONABLE_AUTHORITY_DIVERGENCE"],
    ]);
    expect(result.carried.map((item) => item.standing)).toEqual(["UNKNOWN"]);
  });

  it("aggregates carried non-assessments too, and they stay carried", () => {
    const result = prioritize([1, 2, 3].map(() => unknown({ aggregationKey: "u" })));
    expect(result.prioritized).toEqual([]);
    expect(result.carried).toHaveLength(1);
    expect(result.carried[0]?.itemKind).toBe("PATTERN");
    expect(result.carried[0]?.standing).toBe("UNKNOWN");
    expect(result.summary.nonAssessmentRecords).toBe(3);
  });

  it("thresholds are configurable per category", () => {
    const records = [1, 2].map(() => rec({ aggregationKey: "k" }));
    expect(prioritize(records).summary.patterns).toBe(0);
    const config: AggregationConfig = {
      ...DEFAULT_AGGREGATION_CONFIG,
      minOccurrencesForPatternByCategory: { ROTATION: 2 },
    };
    expect(prioritize(records, config).summary.patterns).toBe(1);
    const other: AggregationConfig = {
      ...DEFAULT_AGGREGATION_CONFIG,
      minOccurrencesForPatternByCategory: { COOLDOWN: 2 },
    };
    expect(prioritize(records, other).summary.patterns).toBe(0);
  });

  it("an unusable config is refused, never applied", () => {
    const bad = (config: Partial<AggregationConfig>) =>
      prioritizeFindings([rec()], { ...DEFAULT_AGGREGATION_CONFIG, ...config } as AggregationConfig);
    expect(bad({ defaultMinOccurrencesForPattern: 1 })).toEqual({
      kind: "REFUSED",
      reason: "INVALID_AGGREGATION_CONFIG",
      problems: [{ kind: "INVALID_THRESHOLD", category: "DEFAULT", value: 1 }],
    });
    expect(bad({ defaultMinOccurrencesForPattern: 2.5 }).kind).toBe("REFUSED");
    expect(bad({ minOccurrencesForPatternByCategory: { ROTATION: 0 } }).kind).toBe("REFUSED");
    expect(bad({ minOccurrencesForPatternByCategory: { BOGUS: 3 } as never }).kind).toBe("REFUSED");
    expect(bad({ revision: "finding-aggregation/0" as never }).kind).toBe("REFUSED");
  });

  it("a never-aggregated record stays single however often it repeats", () => {
    const result = prioritize([1, 2, 3, 4].map(() => rec()));
    expect(result.prioritized.every((item) => item.itemKind === "SINGLE")).toBe(true);
  });
});

describe("validation: a record that would rank on a false premise is refused", () => {
  it("the suppression reasons are exactly M14-C's named environmental reasons", () => {
    const named: Record<EnvironmentalReason, true> = {
      INTERMISSION: true,
      TARGET_UNAVAILABLE: true,
      FORCED_DOWNTIME: true,
      PHASE_TRANSITION: true,
    };
    expect([...SUPPRESSION_REASONS].sort()).toEqual(Object.keys(named).sort());
  });

  it("refuses a divergence on unproven state or without evidence", () => {
    const result = prioritize([
      rec({ findingId: "a", stateEvidence: "INCOMPLETE" }),
      rec({ findingId: "b", evidence: [] }),
    ]);
    expect(result.prioritized).toEqual([]);
    expect(result.refused).toEqual([
      { findingId: "a", problems: ["DIVERGENCE_WITHOUT_PROVEN_STATE"] },
      { findingId: "b", problems: ["DIVERGENCE_WITHOUT_EVIDENCE"] },
    ]);
    expect(result.summary.includesNonAssessments).toBe(true);
  });

  it("refuses suppression without a named environmental reason, and a reason on anything else", () => {
    const result = prioritize([
      rec({ findingId: "a", disposition: "SUPPRESSED", reasonCode: "X", suppressionReason: null }),
      rec({
        findingId: "b",
        disposition: "SUPPRESSED",
        reasonCode: "X",
        suppressionReason: "SIMILAR_TOP_LOGS" as never,
      }),
      rec({ findingId: "c", suppressionReason: "INTERMISSION" }),
    ]);
    expect(result.refused.map((entry) => [entry.findingId, entry.problems])).toEqual([
      ["a", ["SUPPRESSION_REASON_MISMATCH"]],
      ["b", ["SUPPRESSION_REASON_MISMATCH"]],
      ["c", ["SUPPRESSION_REASON_MISMATCH"]],
    ]);
  });

  it("refuses missing authority, missing reasons, unknown vocabulary and duplicate ids", () => {
    const result = prioritize([
      rec({ findingId: "dup" }),
      rec({ findingId: "dup" }),
      rec({ findingId: "no-auth", authority: "" }),
      unknown({ findingId: "no-reason", reasonCode: null }),
      rec({ findingId: "cat", category: "DPS" as never }),
      rec({ findingId: "disp", disposition: "MISTAKE" as never }),
      rec({ findingId: "act", actionability: "ACTIONABLE" as never }),
      rec({ findingId: "key", aggregationKey: "" }),
      rec({ findingId: "time", fightTimeMs: Number.NaN }),
      rec({ findingId: "" }),
    ]);
    expect(result.prioritized).toEqual([]);
    expect(Object.fromEntries(result.refused.map((entry) => [entry.findingId, entry.problems]))).toEqual({
      "": ["EMPTY_FINDING_ID"],
      act: ["UNKNOWN_ACTIONABILITY"],
      cat: ["UNKNOWN_CATEGORY"],
      disp: ["UNKNOWN_DISPOSITION"],
      dup: ["DUPLICATE_FINDING_ID"],
      key: ["EMPTY_AGGREGATION_KEY"],
      "no-auth": ["MISSING_AUTHORITY"],
      "no-reason": ["MISSING_REASON_CODE"],
      time: ["INVALID_FIGHT_TIME"],
    });
    expect(result.refused.filter((entry) => entry.findingId === "dup")).toHaveLength(2);
  });

  it("accounts for every input record exactly once", () => {
    const records = [
      rec(),
      rec({ aggregationKey: "k" }),
      rec({ aggregationKey: "k" }),
      rec({ aggregationKey: "k" }),
      unknown(),
      rec({ evidence: [] }),
    ];
    const result = prioritize(records);
    const placed = [
      ...idsOf(result.prioritized),
      ...idsOf(result.informational),
      ...idsOf(result.carried),
      ...result.refused.map((entry) => entry.findingId),
    ];
    expect([...placed].sort()).toEqual(records.map((record) => record.findingId).sort());
    expect(result.summary.inputRecords).toBe(records.length);
    expect(result.summary.recordsByDisposition.map((entry) => entry.disposition)).toEqual([
      ...FINDING_DISPOSITIONS,
    ]);
  });
});

// ---------------------------------------------------------------------------
// The reviewed restatements
// ---------------------------------------------------------------------------

function decision(position: number, fields: Partial<ObservedDecisionRecord> = {}): ObservedDecisionRecord {
  return {
    locator: loc(position),
    position,
    fightTimeMs: position * 10,
    targetActorId: 2,
    observedAbilityGameId: 100,
    observedToken: "heart_strike",
    outcome: "REJECTED",
    basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
    authorityCoverage: "EXACT_ENTRY",
    authorityToken: "marrowrend",
    selectionPrecision: "EXACT_ENTRY",
    decisiveBlocker: null,
    usabilityProvenance: "OBSERVED_EXECUTION",
    ...fields,
  };
}

const viewOf = (decisions: ObservedDecisionRecord[]): ObservedDecisionView => ({
  decisions,
  exclusions: [],
  coverage: {
    eligibleDecisions: decisions.length,
    match: 0,
    rejected: 0,
    unknown: 0,
    resolvedComparisons: 0,
    exactEntryMatches: 0,
    tokenConvergedMatches: 0,
    selectionPrecision: [],
    unknownBases: [],
    unknownBlockerClasses: [],
    exclusions: [],
    excludedCastCount: 0,
  },
});

const IDENTITY = { specId: "deathknight/blood", authorityId: "BLOOD_APL" };

function restated(view: ObservedDecisionView): ReportableFinding[] {
  const result = restateObservedDecisions(view, IDENTITY);
  if (result.kind !== "RESTATED") throw new Error(JSON.stringify(result));
  return [...result.records];
}

describe("observed-decision view restatement", () => {
  it("maps REJECTED, MATCH and UNKNOWN, and never claims the alternative was actionable", () => {
    const records = restated(
      viewOf([
        decision(1),
        decision(2, { outcome: "MATCH", basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN" }),
        decision(3, {
          outcome: "UNKNOWN",
          basis: "AUTHORITY_SELECTION_UNRESOLVED",
          decisiveBlocker: "OBSERVED_STATE_MISSING",
        }),
        decision(4, {
          outcome: "UNKNOWN",
          basis: "AUTHORITY_SELECTION_UNRESOLVED",
          usabilityProvenance: "NOT_ESTABLISHED",
        }),
      ]),
    );
    expect(
      records.map((record) => [
        record.disposition,
        record.stateEvidence,
        record.actionability,
        record.reasonCode,
      ]),
    ).toEqual([
      ["AUTHORITY_DIVERGENCE", "PROVEN", "OBSERVED_EXECUTION_ONLY", null],
      ["AUTHORITY_CONSISTENT", "PROVEN", "OBSERVED_EXECUTION_ONLY", null],
      ["UNKNOWN", "INCOMPLETE", "OBSERVED_EXECUTION_ONLY", "OBSERVED_STATE_MISSING"],
      ["UNKNOWN", "INCOMPLETE", "NOT_EVALUATED", "AUTHORITY_SELECTION_UNRESOLVED"],
    ]);
    expect(
      records.every((record) => record.authority === "BLOOD_APL" && record.category === "ROTATION"),
    ).toBe(true);
    expect(records[0]?.evidence).toEqual([loc(1)]);
    const result = prioritize(records);
    expect(result.summary.actionableDivergenceRecords).toBe(0);
    expect(result.prioritized.map((item) => item.standing)).toEqual([
      "DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN",
    ]);
  });

  it("refuses an outcome or usability word it was not reviewed for", () => {
    expect(
      restateObservedDecisions(viewOf([decision(1), decision(7, { outcome: "CORRECT" })]), IDENTITY),
    ).toEqual({
      kind: "REFUSED",
      reason: "UNREVIEWED_DECISION_OUTCOME",
      position: 7,
    });
    expect(restateObservedDecisions(viewOf([decision(8, { outcome: "toString" })]), IDENTITY).kind).toBe(
      "REFUSED",
    );
    expect(
      restateObservedDecisions(viewOf([decision(9, { usabilityProvenance: "ASSUMED" })]), IDENTITY),
    ).toEqual({
      kind: "REFUSED",
      reason: "UNREVIEWED_USABILITY_PROVENANCE",
      position: 9,
    });
    expect(restateObservedDecisions(viewOf([decision(1)]), { ...IDENTITY, authorityId: "" }).kind).toBe(
      "REFUSED",
    );
  });

  it("repeated rejections of one observed ability for one reason form one pattern", () => {
    const records = restated(
      viewOf([decision(1), decision(2), decision(3), decision(4, { observedToken: "death_strike" })]),
    );
    const result = prioritize(records);
    expect(result.prioritized.map((item) => [item.itemKind, item.occurrences])).toEqual([
      ["PATTERN", 3],
      ["SINGLE", 1],
    ]);
  });
});

function consumableReport(statuses: ConsumableStatusReport["statuses"]): ConsumableStatusReport {
  return {
    revision: "preparation-consumable-status/1",
    category: "PREPARATION",
    authority: "WCL_OBSERVED_FACT",
    identityData: null,
    actorId: 5,
    statuses,
  };
}

describe("preparation restatement", () => {
  it("reports all three kinds; a zero is a fact, an UNKNOWN is never a zero, neither is a failure", () => {
    const report = consumableReport({
      HEALTH_POTION: { state: "OBSERVED", count: 0, uses: [] },
      HEALTHSTONE: {
        state: "OBSERVED",
        count: 1,
        uses: [{ spellId: 6262, name: "Healthstone", timing: "IN_FIGHT", evidence: loc(40) }],
      },
      COMBAT_POTION: {
        state: "UNKNOWN",
        reasons: [
          { code: "CAST_COVERAGE", gate: { kind: "X" } as never },
          { code: "AURA_COVERAGE", gate: { kind: "Y" } as never },
        ],
        observedAtLeast: 0,
        uses: [],
      },
    });
    const result = restateConsumableStatus(report);
    if (result.kind !== "RESTATED") throw new Error("refused");
    expect(
      result.records.map((record) => [
        record.findingId,
        record.disposition,
        record.reasonCode,
        record.authority,
      ]),
    ).toEqual([
      ["preparation:5:HEALTH_POTION", "OBSERVED_FACT", null, "WCL_OBSERVED_FACT"],
      ["preparation:5:HEALTHSTONE", "OBSERVED_FACT", null, "WCL_OBSERVED_FACT"],
      ["preparation:5:COMBAT_POTION", "UNKNOWN", "AURA_COVERAGE+CAST_COVERAGE", "WCL_OBSERVED_FACT"],
    ]);
    expect(result.records[1]?.evidence).toEqual([loc(40)]);
    const prioritized = prioritize([...result.records]);
    expect(prioritized.prioritized).toEqual([]);
    // Whole-fight items in one category order by item id.
    expect(prioritized.informational.map((item) => item.findingIds[0])).toEqual([
      "preparation:5:HEALTHSTONE",
      "preparation:5:HEALTH_POTION",
    ]);
    expect(prioritized.carried.map((item) => item.findingIds[0])).toEqual(["preparation:5:COMBAT_POTION"]);
  });
});

// ---------------------------------------------------------------------------
// The committed subject fight (real Blood analysis), through the service
// ---------------------------------------------------------------------------

function identityOf(fight: CombatFight, sourceId: number): FightIdentity {
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
    player: { sourceId, name: "Subject", className: "DeathKnight", specName: "Blood" },
  };
}

let realAnalysis: FightAnalysis;

beforeAll(async () => {
  const subject: ComparisonFightInput = await subjectInput();
  const result = await analyzeFight(
    {
      reportCode: subject.fight.report.code,
      fightId: subject.fight.fight.id,
      sourceId: subject.focusActorId,
    },
    {
      env: MCP_TEST_ENV,
      preflight: async () => ({
        ok: true,
        identity: identityOf(subject.fight, subject.focusActorId),
        rateLimit: undefined,
      }),
      ingest: async () => ({ ok: true, fight: subject.fight, rateLimit: undefined }),
    },
  );
  if (!result.ok) throw new Error(result.error.code);
  realAnalysis = result.analysis;
}, 180_000);

describe("the committed Blood fight", () => {
  it("restates every decision and every consumable kind, and prioritizes them honestly", () => {
    const { analysis, observedDecisions, preparation } = realAnalysis;
    if (analysis.status !== "ANALYZED" || observedDecisions === null) throw new Error(analysis.status);
    if (preparation.state !== "ASSESSED") throw new Error(preparation.state);
    const decisions = restateObservedDecisions(observedDecisions, {
      specId: analysis.specId,
      authorityId: analysis.authority.authorityId,
    });
    const consumables = restateConsumableStatus(preparation.report);
    if (decisions.kind !== "RESTATED" || consumables.kind !== "RESTATED") throw new Error("refused");
    expect(decisions.records).toHaveLength(observedDecisions.decisions.length);
    expect(consumables.records).toHaveLength(3);

    const result = prioritize([...decisions.records, ...consumables.records]);
    const { coverage } = observedDecisions;
    expect(result.refused).toEqual([]);
    expect(result.summary.prioritizedRecords).toBe(coverage.rejected);
    expect(result.summary.nonAssessmentRecords).toBe(
      coverage.unknown + consumables.records.filter((record) => record.disposition === "UNKNOWN").length,
    );
    // No view record proves the authority's alternative was possible: nothing is ranked as actionable.
    expect(result.summary.actionableDivergenceRecords).toBe(0);
    expect(result.summary.includesNonAssessments).toBe(coverage.unknown > 0);
    expect(result.prioritized.every((item) => item.disposition === "AUTHORITY_DIVERGENCE")).toBe(true);
    // Pinned real shape: 307 decisions, 83 resolved, 224 UNKNOWN (M14-F); the
    // 45 Heart Strike rejections are the leading pattern.
    expect(observedDecisions.decisions).toHaveLength(307);
    expect(coverage.unknown).toBe(224);
    expect(result.prioritized[0]?.itemKind).toBe("PATTERN");
    expect(result.prioritized[0]?.occurrences).toBe(45);
  });
});
