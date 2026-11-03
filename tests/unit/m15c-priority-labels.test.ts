import { beforeAll, describe, expect, it } from "vitest";

import type { ComparisonFightInput } from "../../src/comparison-facts/fight-facts.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import type { EvidenceLocator } from "../../src/engine/evidence/locator.js";
import { DEFAULT_AGGREGATION_CONFIG } from "../../src/reporting/aggregation-config.js";
import { SUPPRESSION_REASONS, type ReportableFinding } from "../../src/reporting/finding-record.js";
import {
  buildImpactEstimatorRegistry,
  DEFAULT_IMPACT_ESTIMATOR_REGISTRY,
  estimateImpact,
  IMPACT_ESTIMATORS,
  type ImpactEstimator,
} from "../../src/reporting/impact-estimators.js";
import {
  prioritizeFindings,
  type FindingPrioritization,
  type ReportItem,
} from "../../src/reporting/prioritization.js";
import {
  labelPriorities,
  PRIORITY_LABELS,
  type LabelledItem,
  type PriorityLabelling,
} from "../../src/reporting/priority-labels.js";
import { restateConsumableStatus, restateObservedDecisions } from "../../src/reporting/restatement.js";
import { analyzeFight } from "../../src/services/analysis-service.js";
import type { FightAnalysis } from "../../src/services/result.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { subjectInput } from "../support/m11/g2-four-fights.js";

/**
 * M15-C: impact is non-numeric prioritization (owner decision 2026-11-02).
 * Synthetic records for every label rule and every non-result, the empty
 * numeric-estimator extension point, and the committed M11-G2 subject fight
 * (the real Blood analysis) through the application service. No Warcraft
 * Logs request is made.
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

const nonAssessment = (
  disposition: ReportableFinding["disposition"],
  fields: Partial<ReportableFinding> = {},
) =>
  rec({
    disposition,
    stateEvidence: "INCOMPLETE",
    reasonCode: `${disposition}_REASON`,
    authority: disposition === "NO_AUTHORITY_AVAILABLE" ? "NO_AUTHORITY_AVAILABLE" : "TEST_APL",
    ...fields,
  });

function prioritized(records: readonly ReportableFinding[]) {
  const result = prioritizeFindings(records, DEFAULT_AGGREGATION_CONFIG);
  if (result.kind !== "PRIORITIZED") throw new Error(result.reason);
  return result;
}

function labelled(result: FindingPrioritization): Extract<PriorityLabelling, { kind: "LABELLED" }> {
  const labelling = labelPriorities(result);
  if (labelling.kind !== "LABELLED") throw new Error(labelling.reason);
  return labelling;
}

const labelOf = (labelling: Extract<PriorityLabelling, { kind: "LABELLED" }>, findingId: string) => {
  const item = labelling.items.find((entry) => entry.itemId.includes(findingId));
  if (item === undefined) throw new Error(findingId);
  return item;
};

const pattern = (count: number, fields: Partial<ReportableFinding>) =>
  Array.from({ length: count }, () => rec({ aggregationKey: "k", ...fields }));

describe("the label rule", () => {
  it("labels a repeated actionable divergence HIGH, a single one MEDIUM", () => {
    const repeated = pattern(3, { subjectToken: "a" });
    const single = rec({ subjectToken: "b" });
    const labelling = labelled(prioritized([...repeated, single]));
    const [first, second] = labelling.items;
    expect(first).toMatchObject({ itemKind: "PATTERN", label: "HIGH_PRIORITY", rank: 1 });
    expect(first?.basis).toBe("REPEATED_ACTIONABLE_DIVERGENCE");
    expect(second).toMatchObject({ itemKind: "SINGLE", label: "MEDIUM_PRIORITY", rank: 2 });
  });

  it("labels a divergence whose actionability is unproven LOW, even as a long pattern", () => {
    const observedOnly = pattern(40, { actionability: "OBSERVED_EXECUTION_ONLY", subjectToken: "x" });
    const unevaluated = rec({ actionability: "NOT_EVALUATED" });
    const unknownActionability = rec({ actionability: "UNKNOWN" });
    const actionable = rec();
    const labelling = labelled(prioritized([...observedOnly, unevaluated, unknownActionability, actionable]));
    expect(labelOf(labelling, actionable.findingId).label).toBe("MEDIUM_PRIORITY");
    for (const id of [observedOnly[0]!.findingId, unevaluated.findingId, unknownActionability.findingId]) {
      expect(labelOf(labelling, id)).toMatchObject({
        label: "LOW_PRIORITY",
        basis: "DIVERGENCE_ACTIONABILITY_UNPROVEN",
      });
    }
    // Forty unproven occurrences never outrank one proven-actionable divergence.
    expect(labelOf(labelling, actionable.findingId).rank).toBe(1);
  });

  it("a below-threshold group stays SINGLE items, each MEDIUM, never HIGH", () => {
    const pair = pattern(2, { subjectToken: "p" });
    const labelling = labelled(prioritized(pair));
    expect(labelling.items.map((item) => item.label)).toEqual(["MEDIUM_PRIORITY", "MEDIUM_PRIORITY"]);
  });

  it("never lets a label increase down the M15-A ranking", () => {
    const records = [
      ...pattern(5, { subjectToken: "a" }),
      ...pattern(3, { subjectToken: "b", actionability: "OBSERVED_EXECUTION_ONLY" }),
      rec(),
      rec({ actionability: "NOT_EVALUATED" }),
      ...pattern(4, { subjectToken: "c", category: "COOLDOWN" }),
      rec({ disposition: "AUTHORITY_CONSISTENT", producerStatus: "MATCH" }),
      nonAssessment("UNKNOWN"),
    ];
    const labelling = labelled(prioritized(records));
    const strengths = labelling.items.map((item) => PRIORITY_LABELS.indexOf(item.label));
    expect(strengths).toEqual([...strengths].sort((a, b) => a - b));
    const ranks = labelling.items.filter((item) => item.rank !== null).map((item) => item.rank);
    expect(ranks).toEqual(ranks.map((_, index) => index + 1));
  });

  it("restates every item exactly once, in M15-A order, and counts every label", () => {
    const records = [
      rec(),
      rec({ disposition: "OBSERVED_FACT", producerStatus: "OBSERVED" }),
      nonAssessment("UNKNOWN"),
    ];
    const result = prioritized(records);
    const labelling = labelled(result);
    expect(labelling.items.map((item) => item.itemId)).toEqual(
      [...result.prioritized, ...result.informational, ...result.carried].map((item) => item.itemId),
    );
    expect(labelling.itemsByLabel).toEqual([
      { label: "HIGH_PRIORITY", items: 0 },
      { label: "MEDIUM_PRIORITY", items: 1 },
      { label: "LOW_PRIORITY", items: 0 },
      { label: "NOT_PRIORITIZED", items: 2 },
    ]);
  });

  it("states what it means and what it never produces", () => {
    const labelling = labelled(prioritized([rec()]));
    expect(labelling).toMatchObject({
      revision: "finding-priority-label/1",
      prioritizationRevision: "finding-prioritization/1",
      meaning: "WHERE_TO_LOOK_FIRST",
      numericEstimate: "NOT_PRODUCED",
      producerSeverity: "NOT_DECLARED",
      inputs: ["SECTION", "STANDING", "STATE_EVIDENCE", "ITEM_KIND"],
      findingEffect: { confidence: "NONE", suppression: "NONE", score: "NONE" },
    });
  });
});

describe("no penalty and no priority for a non-result", () => {
  it("labels UNKNOWN, NO_AUTHORITY_AVAILABLE, UNSUPPORTED and SUPPRESSED NOT_PRIORITIZED", () => {
    const unknown = nonAssessment("UNKNOWN");
    const noAuthority = nonAssessment("NO_AUTHORITY_AVAILABLE");
    const unsupported = nonAssessment("UNSUPPORTED");
    const suppressed = nonAssessment("SUPPRESSED", { suppressionReason: SUPPRESSION_REASONS[0] });
    const labelling = labelled(prioritized([unknown, noAuthority, unsupported, suppressed]));
    for (const record of [unknown, noAuthority, unsupported, suppressed])
      expect(labelOf(labelling, record.findingId)).toMatchObject({
        section: "CARRIED",
        label: "NOT_PRIORITIZED",
        basis: "NON_ASSESSMENT",
        rank: null,
      });
  });

  it("a long UNKNOWN pattern stays NOT_PRIORITIZED", () => {
    const unknowns = Array.from({ length: 30 }, () =>
      nonAssessment("UNKNOWN", { aggregationKey: "u", subjectToken: "u" }),
    );
    const labelling = labelled(prioritized(unknowns));
    expect(labelling.items).toHaveLength(1);
    expect(labelling.items[0]).toMatchObject({
      itemKind: "PATTERN",
      occurrences: 30,
      label: "NOT_PRIORITIZED",
    });
  });

  it("labels consistent results and observed facts NOT_PRIORITIZED, a zero count included", () => {
    const consistent = rec({ disposition: "AUTHORITY_CONSISTENT", producerStatus: "MATCH" });
    const zeroUse = rec({
      disposition: "OBSERVED_FACT",
      producerStatus: "OBSERVED",
      category: "PREPARATION",
      authority: "WCL_OBSERVED_FACT",
      specId: null,
    });
    const labelling = labelled(prioritized([consistent, zeroUse]));
    for (const record of [consistent, zeroUse])
      expect(labelOf(labelling, record.findingId)).toMatchObject({
        label: "NOT_PRIORITIZED",
        basis: "INFORMATIONAL",
      });
  });

  it("never labels a refused record, and labels nothing when prioritization refused", () => {
    const broken = rec({ stateEvidence: "INCOMPLETE" });
    const labelling = labelled(prioritized([broken, rec()]));
    expect(labelling.unlabelledRefused).toEqual([broken.findingId]);
    expect(labelling.items.some((item) => item.itemId.includes(broken.findingId))).toBe(false);

    const refusedCall = prioritizeFindings([rec()], {
      ...DEFAULT_AGGREGATION_CONFIG,
      defaultMinOccurrencesForPattern: 1,
    });
    expect(labelPriorities(refusedCall)).toEqual({ kind: "NOT_LABELLED", reason: "PRIORITIZATION_REFUSED" });
  });

  it("a hand-built PRIORITIZED item that is not a PROVEN divergence gains no priority", () => {
    const result = prioritized([rec()]);
    const forged = { ...result.prioritized[0]!, stateEvidence: "INCOMPLETE" as const };
    const labelling = labelled({ ...result, prioritized: [forged] });
    expect(labelling.items[0]).toMatchObject({ label: "NOT_PRIORITIZED", basis: "NON_ASSESSMENT" });
  });
});

const DECLARATION: Omit<ImpactEstimator, "estimate"> = {
  estimatorId: "test-estimator",
  authority: "TEST_SIM_MODEL",
  supports: { specIds: ["test/spec"], builds: ["build-1"], categories: ["ROTATION"] },
  evidenceRequirements: ["DECISION_STATE"],
  uncertainty: "BOUNDED_INTERVAL",
  units: "TEST_UNITS",
  provenance: { source: "test", revision: "r1", generatedAt: "2026-11-03" },
};

const estimator = (
  estimate: ImpactEstimator["estimate"],
  fields: Partial<ImpactEstimator> = {},
): ImpactEstimator => ({
  ...DECLARATION,
  estimate,
  ...fields,
});

const registryOf = (...estimators: ImpactEstimator[]) => {
  const registry = buildImpactEstimatorRegistry(estimators);
  if (registry.kind !== "REGISTRY") throw new Error(JSON.stringify(registry.refused));
  return registry;
};

describe("the numeric impact estimator extension point", () => {
  const result = prioritized([
    rec(),
    nonAssessment("UNKNOWN"),
    rec({ disposition: "OBSERVED_FACT", producerStatus: "OBSERVED" }),
  ]);
  const divergence = result.prioritized[0] as ReportItem;
  const carried = result.carried[0] as ReportItem;
  const informational = result.informational[0] as ReportItem;

  it("ships with no estimator registered, so every item is NOT_AVAILABLE", () => {
    expect(IMPACT_ESTIMATORS).toEqual([]);
    expect(DEFAULT_IMPACT_ESTIMATOR_REGISTRY).toMatchObject({ kind: "REGISTRY", estimators: [] });
    expect(estimateImpact(divergence, "build-1")).toEqual({
      kind: "NOT_AVAILABLE",
      reason: "NO_ESTIMATOR_REGISTERED",
    });
    expect(estimateImpact(carried, "build-1")).toEqual({
      kind: "NOT_AVAILABLE",
      reason: "NOT_A_PRIORITIZED_DIVERGENCE",
    });
  });

  it("never estimates a non-result or an informational item, even with an estimator registered", () => {
    let calls = 0;
    const registry = registryOf(
      estimator(
        () => {
          calls += 1;
          return { kind: "BOUNDED", lower: 1, upper: 2 };
        },
        { supports: { ...DECLARATION.supports, categories: ["ROTATION", "PREPARATION"] } },
      ),
    );
    for (const item of [carried, informational])
      expect(estimateImpact(item, "build-1", registry)).toEqual({
        kind: "NOT_AVAILABLE",
        reason: "NOT_A_PRIORITIZED_DIVERGENCE",
      });
    expect(calls).toBe(0);
  });

  it("restates a supported bounded estimate with its declaration", () => {
    const registry = registryOf(estimator(() => ({ kind: "BOUNDED", lower: 1, upper: 4 })));
    expect(estimateImpact(divergence, "build-1", registry)).toEqual({
      kind: "ESTIMATED",
      estimatorId: "test-estimator",
      authority: "TEST_SIM_MODEL",
      units: "TEST_UNITS",
      uncertainty: "BOUNDED_INTERVAL",
      lower: 1,
      upper: 4,
      provenance: DECLARATION.provenance,
    });
  });

  it("an undeclared spec, category or build has no standard; an unknown build is UNKNOWN", () => {
    const registry = registryOf(estimator(() => ({ kind: "BOUNDED", lower: 1, upper: 4 })));
    const otherSpec = { ...divergence, specId: "other/spec" };
    const otherCategory = { ...divergence, category: "COOLDOWN" as const };
    const noSpec = { ...divergence, specId: null };
    for (const item of [otherSpec, otherCategory, noSpec])
      expect(estimateImpact(item, "build-1", registry)).toEqual({
        kind: "NOT_AVAILABLE",
        reason: "NO_ESTIMATOR_SUPPORTS_ITEM",
      });
    expect(estimateImpact(divergence, "build-2", registry)).toEqual({
      kind: "NOT_AVAILABLE",
      reason: "NO_ESTIMATOR_SUPPORTS_ITEM",
    });
    expect(estimateImpact(divergence, null, registry)).toEqual({
      kind: "UNKNOWN",
      estimatorId: null,
      reasonCode: "BUILD_NOT_ESTABLISHED",
    });
  });

  it("selects by spec, category and build together, whatever the registration order", () => {
    const first = estimator(() => ({ kind: "BOUNDED", lower: 1, upper: 2 }), {
      estimatorId: "first",
      supports: { ...DECLARATION.supports, builds: ["build-1"] },
    });
    const second = estimator(() => ({ kind: "BOUNDED", lower: 3, upper: 4 }), {
      estimatorId: "second",
      supports: { ...DECLARATION.supports, builds: ["build-2"] },
    });
    for (const order of [
      [first, second],
      [second, first],
    ]) {
      const registry = registryOf(...order);
      expect(estimateImpact(divergence, "build-1", registry)).toMatchObject({
        kind: "ESTIMATED",
        estimatorId: "first",
        lower: 1,
      });
      expect(estimateImpact(divergence, "build-2", registry)).toMatchObject({
        kind: "ESTIMATED",
        estimatorId: "second",
        lower: 3,
      });
      expect(estimateImpact(divergence, "build-3", registry)).toEqual({
        kind: "NOT_AVAILABLE",
        reason: "NO_ESTIMATOR_SUPPORTS_ITEM",
      });
      expect(estimateImpact(divergence, null, registry)).toEqual({
        kind: "UNKNOWN",
        estimatorId: null,
        reasonCode: "BUILD_NOT_ESTABLISHED",
      });
    }
  });

  it("never repairs an undecided, malformed or failing estimate into a number", () => {
    const cases: [ImpactEstimator["estimate"], string][] = [
      [() => ({ kind: "UNKNOWN", reasonCode: "STATE_MISSING" }), "STATE_MISSING"],
      [() => ({ kind: "UNKNOWN", reasonCode: "" }), "ESTIMATOR_UNKNOWN_WITHOUT_REASON"],
      [() => ({ kind: "BOUNDED", lower: 5, upper: 1 }), "ESTIMATE_MALFORMED"],
      [() => ({ kind: "BOUNDED", lower: Number.NaN, upper: 1 }), "ESTIMATE_MALFORMED"],
      [() => ({ kind: "BOUNDED", lower: 0, upper: Number.POSITIVE_INFINITY }), "ESTIMATE_MALFORMED"],
      [
        () => {
          throw new Error("boom");
        },
        "ESTIMATOR_FAILED",
      ],
    ];
    for (const [estimate, reasonCode] of cases)
      expect(estimateImpact(divergence, "build-1", registryOf(estimator(estimate)))).toEqual({
        kind: "UNKNOWN",
        estimatorId: "test-estimator",
        reasonCode,
      });
  });

  it("refuses the whole registry for any undeclared field, and for overlapping authority", () => {
    const ok = () => ({ kind: "BOUNDED" as const, lower: 1, upper: 2 });
    const broken: [Partial<ImpactEstimator>, string][] = [
      [{ estimatorId: "" }, "EMPTY_ESTIMATOR_ID"],
      [{ authority: "" }, "MISSING_AUTHORITY"],
      [{ authority: "NO_AUTHORITY_AVAILABLE" }, "NO_AUTHORITY_ESTIMATOR"],
      [{ supports: { ...DECLARATION.supports, specIds: [] } }, "EMPTY_SUPPORTED_SPECS"],
      [{ supports: { ...DECLARATION.supports, builds: [] } }, "EMPTY_SUPPORTED_BUILDS"],
      [{ supports: { ...DECLARATION.supports, categories: [] } }, "EMPTY_SUPPORTED_CATEGORIES"],
      [{ supports: { ...DECLARATION.supports, categories: ["DPS" as never] } }, "UNKNOWN_CATEGORY"],
      [{ evidenceRequirements: [] }, "EMPTY_EVIDENCE_REQUIREMENTS"],
      [{ uncertainty: "POINT" as never }, "UNSUPPORTED_UNCERTAINTY"],
      [{ units: "" }, "MISSING_UNITS"],
      [{ provenance: { ...DECLARATION.provenance, revision: "" } }, "MISSING_PROVENANCE"],
    ];
    for (const [fields, problem] of broken) {
      const registry = buildImpactEstimatorRegistry([
        estimator(ok),
        estimator(ok, { estimatorId: "bad", ...fields }),
      ]);
      expect(registry.kind, problem).toBe("REFUSED");
      if (registry.kind === "REFUSED")
        expect(registry.refused.flatMap((entry) => entry.problems)).toContain(problem);
      expect(estimateImpact(divergence, "build-1", registry)).toEqual({
        kind: "NOT_AVAILABLE",
        reason: "REGISTRY_REFUSED",
      });
    }
    const duplicate = buildImpactEstimatorRegistry([
      estimator(ok),
      estimator(ok, { supports: { ...DECLARATION.supports, builds: ["b9"] } }),
    ]);
    expect(duplicate.kind === "REFUSED" && duplicate.refused[0]?.problems).toContain(
      "DUPLICATE_ESTIMATOR_ID",
    );
    const overlap = buildImpactEstimatorRegistry([estimator(ok), estimator(ok, { estimatorId: "second" })]);
    expect(overlap).toEqual({
      kind: "REFUSED",
      refused: [
        { estimatorId: "test-estimator", problems: ["OVERLAPPING_SUPPORT"] },
        { estimatorId: "second", problems: ["OVERLAPPING_SUPPORT"] },
      ],
    });
  });

  it("an estimate never changes a label or a rank", () => {
    const records = [...pattern(3, { subjectToken: "a" }), rec(), rec({ actionability: "NOT_EVALUATED" })];
    const before = labelled(prioritized(records));
    const registry = registryOf(estimator(() => ({ kind: "BOUNDED", lower: 1000, upper: 9000 })));
    const result2 = prioritized(records);
    for (const item of result2.prioritized) estimateImpact(item, "build-1", registry);
    expect(labelled(result2)).toEqual(before);
  });
});

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
  it("labels nothing above LOW: no divergence is proven actionable, and no impact is available", () => {
    const { analysis, observedDecisions, preparation } = realAnalysis;
    if (analysis.status !== "ANALYZED" || observedDecisions === null) throw new Error(analysis.status);
    if (preparation.state !== "ASSESSED") throw new Error(preparation.state);
    const decisions = restateObservedDecisions(observedDecisions, {
      specId: analysis.specId,
      authorityId: analysis.authority.authorityId,
    });
    const consumables = restateConsumableStatus(preparation.report);
    if (decisions.kind !== "RESTATED" || consumables.kind !== "RESTATED") throw new Error("refused");
    const result = prioritized([...decisions.records, ...consumables.records]);
    const labelling = labelled(result);

    const count = (label: LabelledItem["label"]) =>
      labelling.itemsByLabel.find((entry) => entry.label === label)?.items;
    expect(count("HIGH_PRIORITY")).toBe(0);
    expect(count("MEDIUM_PRIORITY")).toBe(0);
    expect(count("LOW_PRIORITY")).toBe(result.prioritized.length);
    expect(count("NOT_PRIORITIZED")).toBe(result.informational.length + result.carried.length);
    expect(labelling.unlabelledRefused).toEqual([]);

    // The leading item is still the 45-occurrence Heart Strike pattern (M15-A).
    expect(labelling.items[0]).toMatchObject({
      itemKind: "PATTERN",
      occurrences: 45,
      rank: 1,
      label: "LOW_PRIORITY",
      standing: "DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN",
    });
    // Every UNKNOWN decision is carried, NOT_PRIORITIZED, never a penalty.
    const unknownRecords = labelling.items
      .filter((item) => item.standing === "UNKNOWN")
      .reduce((sum, item) => sum + item.occurrences, 0);
    expect(unknownRecords).toBe(224);
    expect(
      labelling.items
        .filter((item) => item.standing === "UNKNOWN")
        .every((item) => item.label === "NOT_PRIORITIZED"),
    ).toBe(true);

    for (const item of [...result.prioritized, ...result.informational, ...result.carried])
      expect(estimateImpact(item, null).kind).toBe("NOT_AVAILABLE");
  });
});
