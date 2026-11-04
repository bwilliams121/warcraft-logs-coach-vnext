import { beforeAll, describe, expect, it } from "vitest";

import type { ConsumableStatusReport } from "../../src/analysis/preparation/consumable-status.js";
import type { ComparisonFightInput } from "../../src/comparison-facts/fight-facts.js";
import { PublicAnalysisResultSchema } from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import type { EvidenceLocator } from "../../src/engine/evidence/locator.js";
import type {
  ObservedDecisionRecord,
  ObservedDecisionView,
} from "../../src/findings/observed-decision-view.js";
import type { ReportableFinding } from "../../src/reporting/finding-record.js";
import {
  buildFightTldr,
  DEFAULT_TLDR_CONFIG,
  summarizeFindings,
  type FightTldr,
  type TldrContext,
  type TldrInput,
} from "../../src/reporting/tldr.js";
import { analyzeFight } from "../../src/services/analysis-service.js";
import type { FightAnalysis } from "../../src/services/result.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { subjectInput } from "../support/m11/g2-four-fights.js";

/**
 * M15-B: the fight TLDR, from the prioritized trustworthy findings and the
 * analysis coverage. Synthetic views for every rule, and the committed M11-G2
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

function decision(position: number, fields: Partial<ObservedDecisionRecord> = {}): ObservedDecisionRecord {
  return {
    locator: loc(position),
    position,
    fightTimeMs: position * 1000,
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

const match = (position: number, fields: Partial<ObservedDecisionRecord> = {}) =>
  decision(position, { outcome: "MATCH", basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN", ...fields });
const unknown = (position: number) =>
  decision(position, {
    outcome: "UNKNOWN",
    basis: "AUTHORITY_SELECTION_UNRESOLVED",
    decisiveBlocker: "OBSERVED_STATE_MISSING",
  });

/** A view whose coverage is counted from its own decisions, as a registration builds it. */
function viewOf(decisions: ObservedDecisionRecord[], excludedCastCount = 0): ObservedDecisionView {
  const count = (outcome: string) => decisions.filter((entry) => entry.outcome === outcome).length;
  return {
    decisions,
    exclusions: [],
    coverage: {
      eligibleDecisions: decisions.length,
      match: count("MATCH"),
      rejected: count("REJECTED"),
      unknown: count("UNKNOWN"),
      resolvedComparisons: count("MATCH") + count("REJECTED"),
      exactEntryMatches: 0,
      tokenConvergedMatches: 0,
      selectionPrecision: [],
      unknownBases: [],
      unknownBlockerClasses: [],
      exclusions: [],
      excludedCastCount,
    },
  };
}

function consumables(
  combatPotion: ConsumableStatusReport["statuses"]["COMBAT_POTION"] = {
    state: "OBSERVED",
    count: 1,
    uses: [],
  },
): ConsumableStatusReport {
  return {
    revision: "preparation-consumable-status/1",
    category: "PREPARATION",
    authority: "WCL_OBSERVED_FACT",
    identityData: null,
    actorId: 5,
    statuses: {
      HEALTH_POTION: { state: "OBSERVED", count: 0, uses: [] },
      HEALTHSTONE: { state: "OBSERVED", count: 2, uses: [] },
      COMBAT_POTION: combatPotion,
    },
  };
}

const UNKNOWN_POTION = {
  state: "UNKNOWN",
  reasons: [{ code: "CAST_COVERAGE", gate: "INSUFFICIENT_COVERAGE" }],
  observedAtLeast: 1,
  uses: [],
} as unknown as ConsumableStatusReport["statuses"]["COMBAT_POTION"];

const NOT_RETRIEVED = { assessment: "NOT_ASSESSED", reason: "COMPARISON_EVIDENCE_NOT_RETRIEVED" } as const;

function analyzed(view: ObservedDecisionView, fields: Partial<TldrInput> = {}): TldrInput {
  return {
    gameplay: { status: "ANALYZED", specId: "deathknight/blood", authorityId: "BLOOD_APL", view },
    preparation: { state: "ASSESSED", report: consumables() },
    diagnosis: NOT_RETRIEVED,
    ...fields,
  };
}

type Assessed = Extract<FightTldr, { assessment: "ASSESSED" }>;
function assessed(tldr: FightTldr | undefined): Assessed {
  if (tldr?.assessment !== "ASSESSED") throw new Error(JSON.stringify(tldr));
  return tldr;
}

const BANNED_PROSE =
  /\b(correct|incorrect|mistake|optimal|ideal|best|score|grade|should|failed|failure|wrong|perfect|clean play)\b/i;

describe("coverage is disclosed first, on every status", () => {
  const cases: [string, TldrInput][] = [
    ["divergences", analyzed(viewOf([decision(1), match(2), unknown(3)]))],
    ["no divergence", analyzed(viewOf([match(1), unknown(2)]))],
    ["nothing resolved", analyzed(viewOf([unknown(1), unknown(2)]))],
    ["no decisions at all", analyzed(viewOf([]))],
    [
      "spec not supported",
      {
        gameplay: { status: "SPEC_NOT_SUPPORTED" },
        preparation: { state: "ASSESSED", report: consumables() },
        diagnosis: null,
      },
    ],
    [
      "authority not available, preparation not assessed",
      {
        gameplay: { status: "AUTHORITY_NOT_AVAILABLE" },
        preparation: { state: "NOT_ASSESSED", reason: "RETRIEVAL_FAILED" },
        diagnosis: null,
      },
    ],
  ];

  it.each(cases)("%s: PARTIAL, a coverage sentence first, and at least one disclosure", (_label, input) => {
    const tldr = assessed(buildFightTldr(input));
    expect(tldr.assessmentScope).toBe("PARTIAL");
    expect(tldr.disclosures.length).toBeGreaterThan(0);
    expect(tldr.lines[0]).toMatch(/^(Partial analysis: |Gameplay was not analyzed )/);
    expect(tldr.magnitude).toBe("NOT_USED");
    expect(tldr.findingEffect).toEqual({ confidence: "NONE", suppression: "NONE" });
  });

  it("'we could only analyze part' is distinct from 'found little to fix'", () => {
    const nothing = assessed(buildFightTldr(analyzed(viewOf([unknown(1), unknown(2)]))));
    const little = assessed(buildFightTldr(analyzed(viewOf([match(1), unknown(2)]))));
    expect(nothing.headline).toBe("NO_DECISION_RESOLVED");
    expect(little.headline).toBe("NO_AUTHORITY_DIVERGENCE_IN_ANALYZED_DECISIONS");
    // Both still say the analysis was partial, before anything else.
    for (const tldr of [nothing, little]) {
      expect(tldr.disclosures).toContain("ONLY_OBSERVED_DECISIONS_VERIFIED");
      expect(tldr.disclosures).toContain("DECISIONS_UNKNOWN");
      expect(tldr.lines[0]).toContain("are UNKNOWN");
    }
    expect(nothing.lines[1]).toBe(
      "No observed decision could be resolved, so nothing is claimed about rotational play.",
    );
    expect(little.lines[1]).toContain("describes the resolved decisions only, not the whole fight");
  });

  it("an unsupported specialization never reads as clean play", () => {
    const tldr = assessed(
      buildFightTldr({
        gameplay: { status: "SPEC_NOT_SUPPORTED" },
        preparation: { state: "ASSESSED", report: consumables() },
        diagnosis: null,
      }),
    );
    expect(tldr.headline).toBe("GAMEPLAY_NOT_ANALYZED");
    expect(tldr.gameplay).toEqual({ status: "SPEC_NOT_SUPPORTED" });
    expect(tldr.disclosures).toContain("GAMEPLAY_NOT_ANALYZED");
    expect(tldr.disclosures).not.toContain("ONLY_OBSERVED_DECISIONS_VERIFIED");
    expect(tldr.highlights).toEqual([]);
    expect(tldr.damageDiagnosis).toBeNull();
    expect(tldr.lines[0]).toContain("this is not evidence of clean play");
    expect(tldr.lines.some((line) => line.includes("diverged"))).toBe(false);
  });
});

describe("UNKNOWN never becomes certainty", () => {
  it("unknown decisions are counted and tallied, never highlighted", () => {
    const tldr = assessed(
      buildFightTldr(analyzed(viewOf([unknown(1), unknown(2), unknown(3), decision(4)]))),
    );
    expect(tldr.gameplay).toEqual({
      status: "ANALYZED",
      eligibleDecisions: 4,
      resolvedDecisions: 1,
      unknownDecisions: 3,
      excludedCasts: 0,
    });
    expect(tldr.highlights.map((highlight) => highlight.occurrences)).toEqual([1]);
    expect(tldr.divergences.records).toBe(1);
    expect(tldr.notAssessed).toEqual([{ category: "ROTATION", disposition: "UNKNOWN", records: 3 }]);
  });

  it("a consumable whose count is UNKNOWN has no count and is never zero", () => {
    const tldr = assessed(
      buildFightTldr(
        analyzed(viewOf([match(1)]), {
          preparation: { state: "ASSESSED", report: consumables(UNKNOWN_POTION) },
        }),
      ),
    );
    if (tldr.preparation.assessment !== "ASSESSED") throw new Error("not assessed");
    expect(tldr.preparation.combatPotion).toEqual({ countState: "UNKNOWN" });
    expect(tldr.preparation.healthPotion).toEqual({ countState: "OBSERVED", count: 0 });
    expect(tldr.disclosures).toContain("CONSUMABLE_COUNT_UNKNOWN");
    expect(tldr.notAssessed).toEqual([{ category: "PREPARATION", disposition: "UNKNOWN", records: 1 }]);
    const line = tldr.lines.find((entry) => entry.startsWith("Consumables used:"));
    expect(line).toContain("combat potion UNKNOWN (not zero)");
    expect(line).toContain("health potion 0");
  });

  it("preparation NOT_ASSESSED claims nothing about consumables", () => {
    const tldr = assessed(
      buildFightTldr(
        analyzed(viewOf([match(1)]), {
          preparation: { state: "NOT_ASSESSED", reason: "RETRIEVAL_FAILED" },
        }),
      ),
    );
    expect(tldr.preparation).toEqual({ assessment: "NOT_ASSESSED", reason: "RETRIEVAL_FAILED" });
    expect(tldr.disclosures).toContain("PREPARATION_NOT_ASSESSED");
    expect(tldr.lines).toContain(
      "Consumable use was not assessed (RETRIEVAL_FAILED); nothing is claimed about it.",
    );
  });

  it("an undiagnosed fight says nothing is claimed about damage", () => {
    const tldr = assessed(buildFightTldr(analyzed(viewOf([match(1)]))));
    expect(tldr.damageDiagnosis).toEqual(NOT_RETRIEVED);
    expect(tldr.disclosures).toContain("DAMAGE_DIAGNOSIS_NOT_ASSESSED");
    expect(tldr.lines.at(-1)).toBe(
      "Damage diagnosis was not assessed (COMPARISON_EVIDENCE_NOT_RETRIEVED); nothing is claimed about damage.",
    );
  });
});

describe("SUPPRESSED never becomes failure", () => {
  const context: TldrContext = {
    gameplay: {
      status: "ANALYZED",
      eligibleDecisions: 2,
      resolvedDecisions: 1,
      unknownDecisions: 0,
      excludedCasts: 0,
    },
    preparation: { assessment: "NOT_ASSESSED", reason: "NO_FIGHT_RETRIEVED" },
    diagnosis: null,
  };
  const record = (fields: Partial<ReportableFinding>): ReportableFinding => ({
    findingId: "f1",
    producer: "TEST",
    category: "COOLDOWN",
    specId: "test/spec",
    disposition: "SUPPRESSED",
    authority: "TEST_APL",
    producerStatus: "REJECTED",
    reasonCode: "TARGET_GONE",
    suppressionReason: "INTERMISSION",
    stateEvidence: "PROVEN",
    actionability: "NOT_EVALUATED",
    fightTimeMs: 1000,
    evidence: [loc(1)],
    aggregationKey: null,
    subjectToken: "deathmark",
    ...fields,
  });

  it("a suppressed record is tallied as not assessed, never highlighted or counted as a divergence", () => {
    const tldr = assessed(
      summarizeFindings(
        [
          record({}),
          record({
            findingId: "f2",
            disposition: "AUTHORITY_CONSISTENT",
            suppressionReason: null,
            reasonCode: null,
          }),
        ],
        context,
      ),
    );
    expect(tldr.highlights).toEqual([]);
    expect(tldr.divergences).toEqual({ items: 0, records: 0, actionableRecords: 0, notListedItems: 0 });
    expect(tldr.notAssessed).toEqual([{ category: "COOLDOWN", disposition: "SUPPRESSED", records: 1 }]);
    expect(tldr.headline).toBe("NO_AUTHORITY_DIVERGENCE_IN_ANALYZED_DECISIONS");
    expect(tldr.lines.join(" ")).not.toContain("deathmark");
  });

  it("a record prioritization refuses makes the whole TLDR NOT_ASSESSED, never a partial summary", () => {
    expect(summarizeFindings([record({ suppressionReason: null })], context)).toEqual({
      assessment: "NOT_ASSESSED",
      revision: "fight-tldr/1",
      reason: "FINDINGS_REFUSED",
    });
  });

  it("a divergence with no analyzed gameplay is refused as inconsistent", () => {
    const divergence = record({
      disposition: "AUTHORITY_DIVERGENCE",
      suppressionReason: null,
      reasonCode: null,
      actionability: "OBSERVED_EXECUTION_ONLY",
    });
    expect(
      summarizeFindings([divergence], { ...context, gameplay: { status: "SPEC_NOT_SUPPORTED" } }),
    ).toMatchObject({ assessment: "NOT_ASSESSED", reason: "COVERAGE_INCONSISTENT" });
  });
});

describe("highlights are the prioritized items, in order, never ranked by magnitude", () => {
  const view = viewOf(
    [
      decision(1),
      decision(2),
      decision(3),
      decision(4, { observedToken: "death_strike" }),
      decision(5, { observedToken: "blood_boil" }),
      decision(6, { observedToken: "marrowrend" }),
      decision(7, { observedToken: "soul_reaper", usabilityProvenance: "NOT_ESTABLISHED" }),
      match(8),
    ],
    12,
  );

  it("the pattern leads, standings are carried, the rest are counted and disclosed", () => {
    const tldr = assessed(buildFightTldr(analyzed(view)));
    expect(tldr.headline).toBe("AUTHORITY_DIVERGENCES_IN_ANALYZED_DECISIONS");
    expect(tldr.highlights.map((h) => [h.position, h.itemKind, h.subjectToken, h.occurrences])).toEqual([
      [1, "PATTERN", "heart_strike", 3],
      [2, "SINGLE", "death_strike", 1],
      [3, "SINGLE", "blood_boil", 1],
    ]);
    expect(tldr.highlights[0]?.evidence).toEqual([loc(1), loc(2), loc(3)]);
    expect(tldr.highlights.every((h) => h.standing === "DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN")).toBe(
      true,
    );
    expect(tldr.divergences).toEqual({ items: 5, records: 7, actionableRecords: 0, notListedItems: 2 });
    expect(tldr.disclosures).toEqual([
      "ONLY_OBSERVED_DECISIONS_VERIFIED",
      "CASTS_EXCLUDED",
      "DIVERGENCE_ACTIONABILITY_UNPROVEN",
      "DIVERGENCES_NOT_LISTED",
      "DAMAGE_DIAGNOSIS_NOT_ASSESSED",
    ]);
    expect(tldr.lines).toContain(
      "#1 heart_strike: 3 decisions the authority rejected (pattern), from 0:01 to 0:03. Whether the authority's alternative was possible is not proven.",
    );
    expect(tldr.lines).toContain("2 more divergence items are not listed here.");
  });

  it("the TLDR is independent of input order and of the highlight count's presentation", () => {
    const reversed = viewOf([...view.decisions].reverse(), 12);
    expect(buildFightTldr(analyzed(reversed))).toEqual(buildFightTldr(analyzed(view)));
    const five = assessed(buildFightTldr(analyzed(view), { ...DEFAULT_TLDR_CONFIG, maxHighlights: 5 }));
    expect(five.highlights.map((h) => h.position)).toEqual([1, 2, 3, 4, 5]);
    expect(five.highlights[4]?.standing).toBe("DIVERGENCE_ACTIONABILITY_NOT_ESTABLISHED");
    expect(five.disclosures).not.toContain("DIVERGENCES_NOT_LISTED");
  });

  it("its sentences make no correctness, blame or score claim", () => {
    for (const input of [analyzed(view), analyzed(viewOf([match(1)])), analyzed(viewOf([unknown(1)]))]) {
      for (const line of assessed(buildFightTldr(input)).lines) expect(line).not.toMatch(BANNED_PROSE);
    }
  });
});

describe("fail closed", () => {
  it("an invalid config summarizes nothing", () => {
    for (const config of [
      { ...DEFAULT_TLDR_CONFIG, maxHighlights: 0 },
      { ...DEFAULT_TLDR_CONFIG, maxHighlights: 2.5 },
      { ...DEFAULT_TLDR_CONFIG, maxHighlights: 11 },
      { ...DEFAULT_TLDR_CONFIG, revision: "fight-tldr-config/0" as never },
      {
        ...DEFAULT_TLDR_CONFIG,
        aggregation: { ...DEFAULT_TLDR_CONFIG.aggregation, defaultMinOccurrencesForPattern: 1 },
      },
    ])
      expect(buildFightTldr(analyzed(viewOf([decision(1)])), config)).toMatchObject({
        assessment: "NOT_ASSESSED",
        reason: "INVALID_TLDR_CONFIG",
      });
  });

  it("an outcome word the adapter was not reviewed for summarizes nothing", () => {
    expect(buildFightTldr(analyzed(viewOf([decision(1, { outcome: "CORRECT" })])))).toMatchObject({
      assessment: "NOT_ASSESSED",
      reason: "FINDINGS_NOT_RESTATABLE",
    });
  });

  it("coverage counts that disagree with the decisions are never stated", () => {
    const view = viewOf([decision(1), unknown(2)]);
    for (const coverage of [
      { ...view.coverage, rejected: 0 },
      { ...view.coverage, unknown: 0 },
      { ...view.coverage, eligibleDecisions: 5 },
      { ...view.coverage, resolvedComparisons: 2 },
    ])
      expect(buildFightTldr(analyzed({ ...view, coverage }))).toMatchObject({
        assessment: "NOT_ASSESSED",
        reason: "COVERAGE_INCONSISTENT",
      });
  });
});

// ---------------------------------------------------------------------------
// The committed subject fight (real Blood analysis), through the service
// ---------------------------------------------------------------------------

function identityOf(fight: CombatFight, sourceId: number, specName = "Blood"): FightIdentity {
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
    player: {
      sourceId,
      name: "Subject",
      className: specName === "Blood" ? "DeathKnight" : "Warrior",
      specName,
    },
  };
}

async function viaService(subject: ComparisonFightInput, specName: string): Promise<FightAnalysis> {
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
        identity: identityOf(subject.fight, subject.focusActorId, specName),
        rateLimit: undefined,
      }),
      ingest: async () => ({ ok: true, fight: subject.fight, rateLimit: undefined }),
    },
  );
  if (!result.ok) throw new Error(result.error.code);
  return result.analysis;
}

let blood: FightAnalysis;
let unsupported: FightAnalysis;

beforeAll(async () => {
  const subject = await subjectInput();
  blood = await viaService(subject, "Blood");
  unsupported = await viaService(subject, "Fire");
}, 180_000);

describe("the committed Blood fight, through the service", () => {
  it("summarizes the real analysis honestly", () => {
    const view = blood.observedDecisions;
    if (view === null) throw new Error("no view");
    const tldr = assessed(blood.tldr);
    expect(tldr.gameplay).toEqual({
      status: "ANALYZED",
      eligibleDecisions: view.coverage.eligibleDecisions,
      resolvedDecisions: view.coverage.resolvedComparisons,
      unknownDecisions: view.coverage.unknown,
      excludedCasts: view.coverage.excludedCastCount,
    });
    expect(tldr.divergences.records).toBe(view.coverage.rejected);
    // No view record proves the authority's alternative was possible.
    expect(tldr.divergences.actionableRecords).toBe(0);
    expect(tldr.headline).toBe("AUTHORITY_DIVERGENCES_IN_ANALYZED_DECISIONS");
    // Pinned real shape (M15-A): the 45 Heart Strike rejections lead, as a pattern.
    expect(tldr.highlights[0]).toMatchObject({
      position: 1,
      itemKind: "PATTERN",
      subjectToken: "heart_strike",
      occurrences: 45,
      standing: "DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN",
    });
    expect(tldr.notAssessed.find((row) => row.category === "ROTATION")).toEqual({
      category: "ROTATION",
      disposition: "UNKNOWN",
      records: 224,
    });
    expect(tldr.disclosures).toContain("DECISIONS_UNKNOWN");
    expect(tldr.disclosures).toContain("DAMAGE_DIAGNOSIS_NOT_ASSESSED");
    for (const line of tldr.lines) expect(line).not.toMatch(BANNED_PROSE);
  });

  it("changes nothing it summarizes: decisions and coverage are the view's", () => {
    const document = projectAnalysisResult(blood);
    const { tldr: _summary, ...untouched } = blood;
    const withoutTldr = projectAnalysisResult(untouched);
    if (document.status !== "ANALYZED" || withoutTldr.status !== "ANALYZED") throw new Error("not analyzed");
    expect(document.decisions).toEqual(withoutTldr.decisions);
    expect(document.coverage).toEqual(withoutTldr.coverage);
    expect(document.preparation).toEqual(withoutTldr.preparation);
    expect(document.diagnosis).toEqual(withoutTldr.diagnosis);
    expect("tldr" in withoutTldr).toBe(false);
  });

  it("projects to a schema-valid document carrying the same TLDR, every highlight locating a published decision", () => {
    const document = projectAnalysisResult(blood);
    expect(PublicAnalysisResultSchema.safeParse(document).success).toBe(true);
    expect(document.tldr).toEqual(JSON.parse(JSON.stringify(blood.tldr)));
    if (document.status !== "ANALYZED" || document.tldr?.assessment !== "ASSESSED") throw new Error("shape");
    const published = new Set(document.decisions.map((entry) => JSON.stringify(entry.locator)));
    for (const highlight of document.tldr.highlights)
      for (const locator of highlight.evidence) expect(published.has(JSON.stringify(locator))).toBe(true);
  });

  it("an unsupported specialization's document carries a GAMEPLAY_NOT_ANALYZED TLDR with its consumables", () => {
    const tldr = assessed(unsupported.tldr);
    expect(unsupported.analysis.status).toBe("SPEC_NOT_SUPPORTED");
    expect(tldr.headline).toBe("GAMEPLAY_NOT_ANALYZED");
    expect(tldr.highlights).toEqual([]);
    expect(tldr.damageDiagnosis).toBeNull();
    if (unsupported.preparation.state !== "ASSESSED" || tldr.preparation.assessment !== "ASSESSED")
      throw new Error("preparation not assessed");
    const report = unsupported.preparation.report;
    for (const [key, kind] of [
      ["healthPotion", "HEALTH_POTION"],
      ["healthstone", "HEALTHSTONE"],
      ["combatPotion", "COMBAT_POTION"],
    ] as const) {
      const status = report.statuses[kind];
      expect(tldr.preparation[key]).toEqual(
        status.state === "OBSERVED"
          ? { countState: "OBSERVED", count: status.count }
          : { countState: "UNKNOWN" },
      );
    }
    const document = projectAnalysisResult(unsupported);
    expect(PublicAnalysisResultSchema.safeParse(document).success).toBe(true);
    expect(document.status).toBe("SPEC_NOT_SUPPORTED");
    expect(document.tldr).toEqual(JSON.parse(JSON.stringify(unsupported.tldr)));
  });
});
