import { describe, expect, it } from "vitest";

import { discloseRaidNightCoverage } from "../../src/aggregation/raid-night-disclosure.js";
import type { ComparisonFightInput, PostHocDefinition } from "../../src/comparison-facts/fight-facts.js";
import { PublicAnalysisResultSchema } from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import { PublicCellSchema } from "../../src/contracts/raid-night-contract.js";
import { projectCell, projectRecurrence } from "../../src/contracts/raid-night-projection.js";
import { diagnose, type Diagnosis } from "../../src/diagnosis/diagnosis.js";
import type { CombatActor } from "../../src/engine/normalization/actors.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import type {
  ObservedDecisionRecord,
  ObservedDecisionView,
} from "../../src/findings/observed-decision-view.js";
import { simcProfileRelativeCountsOf, simcProfileSourcesOf } from "../../src/findings/simc-profile-view.js";
import { simcProfileFactsField } from "../../src/findings/simc-profile-fallback.js";
import { DEFAULT_AGGREGATION_CONFIG } from "../../src/reporting/aggregation-config.js";
import { buildFightReport, renderReportMarkdown } from "../../src/reporting/fight-report.js";
import { prioritizeFindings } from "../../src/reporting/prioritization.js";
import { labelPriorities, PRIORITY_LABELS } from "../../src/reporting/priority-labels.js";
import {
  restateObservedDecisions,
  simcProfileRelativeCountsOf as reportingCountsOf,
} from "../../src/reporting/restatement.js";
import { buildFightTldr, type TldrInput } from "../../src/reporting/tldr.js";
import { analyzedFightAnalysis } from "../support/aggregation-fixture.js";
import {
  aggregateOf,
  cellOf,
  comparison,
  rosterFightFor,
  rosterPlayerFor,
} from "../support/raid-night-fixture.js";
import {
  everyDecisionProfileRelative,
  profileRelative,
  realProfileFacts,
} from "../support/simc-profile-facts.js";
import { damageEvent, syntheticFight } from "../support/synthetic-fight.js";

/**
 * SIMC-FB-B: what the public surface says about a decision evaluated under the pinned SimC profile.
 *
 * The negative tests the queue names: a modeled state is never stated as observed, no sentence says an
 * unobserved target count happened, comparison behavior moves nothing, and a decision that read nothing
 * from the profile gains nothing.
 */

const FACTS = realProfileFacts();
const RUPTURE = 1943;

function decision(
  position: number,
  outcome: "MATCH" | "REJECTED" | "UNKNOWN",
  options: { authorityToken?: string | null; observedToken?: string; at?: number } = {},
): ObservedDecisionRecord {
  const at = options.at ?? 1_200 + position;
  const observedToken = options.observedToken ?? "rupture";
  const resolved = outcome !== "UNKNOWN";
  return {
    locator: {
      streamId: "s",
      pageOrdinal: 0,
      indexInPage: position,
      ingestionOrdinal: position,
      rawType: "cast",
      reportTimeMs: at,
    },
    position,
    fightTimeMs: at,
    targetActorId: 50,
    observedAbilityGameId: RUPTURE,
    observedToken,
    outcome,
    basis:
      outcome === "REJECTED"
        ? "AUTHORITY_SELECTED_DIFFERENT_TOKEN"
        : resolved
          ? "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN"
          : "AUTHORITY_SELECTION_UNRESOLVED",
    authorityCoverage: resolved ? "EXACT_ENTRY" : "UNKNOWN",
    authorityToken:
      options.authorityToken === undefined ? (resolved ? observedToken : null) : options.authorityToken,
    selectionPrecision: resolved ? "EXACT_ENTRY" : null,
    decisiveBlocker: resolved ? null : "TARGET_COUNT",
    usabilityProvenance: "OBSERVED_EXECUTION",
  };
}

function viewOf(decisions: readonly ObservedDecisionRecord[]): ObservedDecisionView {
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
      exactEntryMatches: count("MATCH"),
      tokenConvergedMatches: 0,
      selectionPrecision: [],
      unknownBases: [],
      unknownBlockerClasses: [],
      exclusions: [],
      excludedCastCount: 0,
    },
  };
}

const inputOf = (
  decisions: readonly ObservedDecisionRecord[],
  diagnosis: TldrInput["diagnosis"] = {
    assessment: "NOT_ASSESSED",
    reason: "COMPARISON_EVIDENCE_NOT_RETRIEVED",
  },
): TldrInput => ({
  gameplay: {
    status: "ANALYZED",
    specId: "rogue/assassination",
    authorityId: "SIMC_APL_ROGUE_ASSASSINATION",
    view: viewOf(decisions),
  },
  preparation: { state: "NOT_ASSESSED", reason: "NO_FIGHT_RETRIEVED" },
  diagnosis,
});

const assessedTldr = (input: TldrInput) => {
  const tldr = buildFightTldr(input);
  if (tldr.assessment !== "ASSESSED") throw new Error(`no TLDR: ${tldr.reason}`);
  return tldr;
};
const assessedReport = (input: TldrInput) => {
  const report = buildFightReport(input);
  if (report.assessment !== "ASSESSED") throw new Error(`no report: ${report.reason}`);
  return report;
};
const recordsOf = (decisions: readonly ObservedDecisionRecord[]) => {
  const restated = restateObservedDecisions(viewOf(decisions), {
    specId: "rogue/assassination",
    authorityId: "SIMC_APL_ROGUE_ASSASSINATION",
  });
  if (restated.kind !== "RESTATED") throw new Error(restated.reason);
  return restated.records;
};
const prioritized = (decisions: readonly ObservedDecisionRecord[]) => {
  const result = prioritizeFindings(recordsOf(decisions), DEFAULT_AGGREGATION_CONFIG);
  if (result.kind !== "PRIORITIZED") throw new Error(result.reason);
  return result;
};

/** A sentence that would state a count, or a state, as something the real fight held. */
const COUNT_CLAIMS = [
  /\b(\d+|one|two|three|four|five|several|multiple|many) (enem|target|add)/i,
  /\bthere (was|were) /i,
  /\b(fight|encounter|pull|boss) (had|held|contained)\b/i,
  /\bsingle[- ]target\b/i,
  /\bpatchwerk\b/i,
  /\btarget ?count\b/i,
  /\bactive_enemies\b/i,
];

const MIXED = [
  decision(1, "REJECTED", { authorityToken: "envenom" }),
  profileRelative(decision(2, "REJECTED", { authorityToken: "envenom" }), FACTS),
  profileRelative(decision(3, "MATCH"), FACTS),
  profileRelative(decision(4, "UNKNOWN"), FACTS),
  decision(5, "MATCH"),
];

describe("the record a specialization's adapter writes", () => {
  it("carries the real provenance, and names no Warcraft Logs source", () => {
    expect(FACTS.length).toBeGreaterThan(0);
    const { simcProfileFacts } = simcProfileFactsField({ profileFacts: FACTS });
    expect(simcProfileFacts).toEqual(FACTS);
    expect(JSON.stringify(FACTS)).not.toMatch(/warcraft|wcl|report|capture/i);
  });

  it("writes nothing when the fallback bound nothing, so a record stays byte-identical", () => {
    expect(simcProfileFactsField({ profileFacts: [] })).toEqual({});
    const plain = decision(1, "REJECTED");
    expect(JSON.stringify(profileRelative(plain, []))).toBe(JSON.stringify(plain));
  });

  it("an explicit empty list means no profile fact, in the counts and in the restatement", () => {
    const record = { ...decision(1, "MATCH"), simcProfileFacts: [] };
    expect(simcProfileRelativeCountsOf([record])).toBeNull();
    expect(recordsOf([record])[0]?.stateEvidence).toBe("PROVEN");
  });

  it("counts are read from the decisions, and one source is named once with each statement it cites", () => {
    expect(simcProfileRelativeCountsOf(MIXED)).toEqual({ decisions: 3, match: 1, rejected: 1, unknown: 1 });
    const { sources, sourceIndexOf } = simcProfileSourcesOf(MIXED);
    expect(sources).toHaveLength(1);
    const ids = sources[0]?.semantics.map((semantic) => semantic.semanticId) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    for (const fact of FACTS) {
      expect(sourceIndexOf(fact)).toBe(0);
      expect(ids).toContain(fact.semantic.semanticId);
    }
  });

  it("the reporting layer's own count equals the projectors'", () => {
    // Reporting reads producers' types only, so it cannot import the helper (m15a layering).
    for (const decisions of [MIXED, [decision(1, "MATCH")], []]) {
      expect(reportingCountsOf(decisions)).toEqual(simcProfileRelativeCountsOf(decisions));
    }
  });

  it("two builds are two sources", () => {
    const other = FACTS.map((fact) => ({ ...fact, clientBuild: "12.1.0.69587" }));
    const { sources, sourceIndexOf } = simcProfileSourcesOf([
      profileRelative(decision(1, "MATCH"), FACTS),
      { ...decision(2, "MATCH"), simcProfileFacts: other },
    ]);
    expect(sources.map((source) => source.clientBuild)).toEqual(["12.1.0.69933", "12.1.0.69587"]);
    expect(sourceIndexOf(other[0] as (typeof other)[number])).toBe(1);
  });
});

describe("restatement and ranking", () => {
  it("a resolved decision reads SIMC_PROFILE_RELATIVE, never PROVEN; an UNKNOWN stays INCOMPLETE", () => {
    const [proven, rejected, match, unknown, plain] = recordsOf(MIXED);
    expect(proven).toMatchObject({ stateEvidence: "PROVEN", disposition: "AUTHORITY_DIVERGENCE" });
    expect(proven).not.toHaveProperty("profileSelectedToken");
    expect(rejected).toMatchObject({
      stateEvidence: "SIMC_PROFILE_RELATIVE",
      disposition: "AUTHORITY_DIVERGENCE",
      profileSelectedToken: "envenom",
    });
    expect(match).toMatchObject({ stateEvidence: "SIMC_PROFILE_RELATIVE", profileSelectedToken: "rupture" });
    expect(unknown).toMatchObject({ stateEvidence: "INCOMPLETE", disposition: "UNKNOWN" });
    expect(unknown).not.toHaveProperty("profileSelectedToken");
    expect(plain).toMatchObject({ stateEvidence: "PROVEN", disposition: "AUTHORITY_CONSISTENT" });
  });

  it("the profile moves no actionability: a rejected decision stays observed-execution-only", () => {
    const { prioritized: items } = prioritized(MIXED);
    expect(items.map((item) => item.actionability)).toEqual([
      "OBSERVED_EXECUTION_ONLY",
      "OBSERVED_EXECUTION_ONLY",
    ]);
    expect(items.map((item) => item.standing)).not.toContain("ACTIONABLE_AUTHORITY_DIVERGENCE");
  });

  it("is not refused, and ranks after every proven divergence, whatever the occurrences", () => {
    const many = [2, 3, 4, 5, 6].map((position) =>
      profileRelative(decision(position, "REJECTED", { authorityToken: "envenom" }), FACTS),
    );
    const result = prioritized([decision(1, "REJECTED", { authorityToken: "envenom" }), ...many]);
    expect(result.refused).toEqual([]);
    expect(result.prioritized.map((item) => [item.stateEvidence, item.itemKind, item.occurrences])).toEqual([
      ["PROVEN", "SINGLE", 1],
      ["SIMC_PROFILE_RELATIVE", "PATTERN", 5],
    ]);
  });

  it("a proven and a profile-relative rejection never pool, nor do two selected tokens", () => {
    const proven = [1, 2, 3].map((position) => decision(position, "REJECTED", { authorityToken: "envenom" }));
    const envenom = [4, 5, 6].map((position) =>
      profileRelative(decision(position, "REJECTED", { authorityToken: "envenom" }), FACTS),
    );
    const garrote = [7, 8, 9].map((position) =>
      profileRelative(decision(position, "REJECTED", { authorityToken: "garrote" }), FACTS),
    );
    const result = prioritized([...proven, ...envenom, ...garrote]);
    expect(result.prioritized.map((item) => [item.stateEvidence, item.profileSelectedToken])).toEqual([
      ["PROVEN", undefined],
      ["SIMC_PROFILE_RELATIVE", "envenom"],
      ["SIMC_PROFILE_RELATIVE", "garrote"],
    ]);
  });

  it("a profile-relative divergence is LOW_PRIORITY even as a pattern, and labels never increase down the rank", () => {
    const records = [
      decision(1, "REJECTED"),
      ...[2, 3, 4].map((position) => profileRelative(decision(position, "REJECTED"), FACTS)),
    ];
    const labelling = labelPriorities(prioritized(records));
    if (labelling.kind !== "LABELLED") throw new Error("not labelled");
    const ranked = labelling.items.filter((item) => item.rank !== null);
    expect(ranked.map((item) => item.basis)).toEqual([
      "DIVERGENCE_ACTIONABILITY_UNPROVEN",
      "SIMC_PROFILE_RELATIVE_DIVERGENCE",
    ]);
    const positions = ranked.map((item) => PRIORITY_LABELS.indexOf(item.label));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(ranked.at(-1)?.label).toBe("LOW_PRIORITY");
  });

  it("an INCOMPLETE divergence is still refused", () => {
    const [record] = recordsOf([decision(1, "REJECTED")]);
    const result = prioritizeFindings(
      [{ ...(record as NonNullable<typeof record>), stateEvidence: "INCOMPLETE" }],
      DEFAULT_AGGREGATION_CONFIG,
    );
    if (result.kind !== "PRIORITIZED") throw new Error(result.reason);
    expect(result.refused[0]?.problems).toContain("DIVERGENCE_WITHOUT_PROVEN_STATE");
  });
});

describe("the TLDR", () => {
  const mixed = assessedTldr(inputOf(MIXED));

  it("the coverage sentence stays first, and the next says how much rests on the profile", () => {
    expect(mixed.lines[0]).toMatch(/^Partial analysis: /);
    expect(mixed.lines[1]).toBe(
      "3 eligible observed decisions were evaluated under the pinned SimC profile assumptions (1 MATCH, 1 REJECTED, 1 UNKNOWN). Their encounter state is the profile's model, not something this fight was observed to hold.",
    );
    expect(mixed.gameplay).toMatchObject({
      simcProfileRelative: { decisions: 3, match: 1, rejected: 1, unknown: 1 },
    });
    expect(mixed.disclosures).toContain("DECISIONS_EVALUATED_UNDER_SIMC_PROFILE");
  });

  it("says what the priority would select, separately from the proven rejection", () => {
    expect(mixed.lines).toContain(
      "The authority rejected 1 observed decision in the proven state, in 1 item.",
    );
    expect(mixed.lines).toContain(
      "Under the pinned SimC profile assumptions, the priority would not select 1 observed decision, in 1 item.",
    );
    expect(
      mixed.lines.some((line) =>
        line.includes("under the pinned SimC profile assumptions, the priority would select envenom here"),
      ),
    ).toBe(true);
    expect(mixed.highlights.map((item) => item.encounterStateBasis)).toEqual([
      undefined,
      "SIMC_PROFILE_RELATIVE",
    ]);
    expect(mixed.highlights[0]).not.toHaveProperty("profileSelectedToken");
    expect(mixed.highlights[1]?.profileSelectedToken).toBe("envenom");
  });

  it("with only profile-relative rejections, nothing says the proven state", () => {
    const tldr = assessedTldr(
      inputOf([profileRelative(decision(1, "REJECTED", { authorityToken: "envenom" }), FACTS)]),
    );
    expect(tldr.lines.join("\n")).not.toMatch(/proven state/);
    expect(tldr.lines.join("\n")).not.toMatch(/the authority rejected/i);
  });

  it("a rejection with no selected token says only that the observed action would not be selected", () => {
    const tldr = assessedTldr(
      inputOf([profileRelative(decision(1, "REJECTED", { authorityToken: null }), FACTS)]),
    );
    expect(tldr.highlights[0]?.profileSelectedToken).toBeNull();
    expect(tldr.lines.join("\n")).toContain("the priority would not select the observed action here");
  });

  it("never states a count or a state as something the fight held", () => {
    for (const line of mixed.lines) for (const claim of COUNT_CLAIMS) expect(line).not.toMatch(claim);
  });

  it("comparison behavior moves nothing: the diagnosis's state changes no disclosure of a decision", () => {
    const withStatements = assessedTldr(inputOf(MIXED, { assessment: "ASSESSED", statements: 2 }));
    const { gameplay, highlights, divergences, notAssessed, findingEffect } = withStatements;
    expect({ gameplay, highlights, divergences, notAssessed, findingEffect }).toEqual({
      gameplay: mixed.gameplay,
      highlights: mixed.highlights,
      divergences: mixed.divergences,
      notAssessed: mixed.notAssessed,
      findingEffect: mixed.findingEffect,
    });
    expect(findingEffect).toEqual({ confidence: "NONE", suppression: "NONE" });
  });
});

describe("the report", () => {
  const report = assessedReport(inputOf(MIXED));
  const [rotation] = report.categories;

  it("each entry states its evidence, and a modeled state is never PROVEN", () => {
    expect(rotation?.prioritized.map((entry) => [entry.stateEvidence, entry.profileSelectedToken])).toEqual([
      ["PROVEN", undefined],
      ["SIMC_PROFILE_RELATIVE", "envenom"],
    ]);
    // Informational entries keep their time order; neither is ranked.
    expect(rotation?.informational.map((entry) => entry.stateEvidence)).toEqual([
      "SIMC_PROFILE_RELATIVE",
      "PROVEN",
    ]);
    expect(rotation?.carried.map((entry) => entry.stateEvidence)).toEqual(["INCOMPLETE"]);
    expect(report.coverage.disclosures).toContain("DECISIONS_EVALUATED_UNDER_SIMC_PROFILE");
  });

  it("the markdown reads the entry's basis, and is still a pure function of the structure", () => {
    const { markdown } = report;
    expect(markdown).toContain("- SimC profile: 3 eligible observed decisions were evaluated");
    expect(markdown).toContain(
      "under the pinned SimC profile assumptions, the priority would select `envenom` here, not the observed action; the encounter state is modeled, not observed",
    );
    expect(markdown).toContain(
      "under the pinned SimC profile assumptions, the priority would select `rupture` here; compatible only, not an endorsement",
    );
    expect(markdown.indexOf("## Coverage")).toBeLessThan(markdown.indexOf("- SimC profile:"));
    expect(renderReportMarkdown(report)).toBe(markdown);
  });

  it("a profile-relative rejection alone never says the proven state, or a count", () => {
    const alone = assessedReport(
      inputOf([profileRelative(decision(1, "REJECTED", { authorityToken: null }), FACTS)]),
    );
    expect(alone.markdown).not.toContain("the authority rejected the observed action in the proven state");
    expect(alone.markdown).toContain("the priority would not select the observed action here");
    for (const line of alone.markdown.split("\n"))
      for (const claim of COUNT_CLAIMS) expect(line).not.toMatch(claim);
  });
});

describe("a decision that read nothing from the profile gains nothing", () => {
  const plain = [decision(1, "REJECTED"), decision(2, "MATCH"), decision(3, "UNKNOWN")];

  it("no key, code or sentence appears in the TLDR or the report", () => {
    const text = JSON.stringify([assessedTldr(inputOf(plain)), assessedReport(inputOf(plain))]);
    expect(text).not.toMatch(/simc.?profile|profileSelected|encounterState/i);
    expect(simcProfileRelativeCountsOf(plain)).toBeNull();
    expect(prioritized(plain).prioritized[0]).not.toHaveProperty("profileSelectedToken");
  });

  it("the cell, the night's totals and its recurrence are unchanged in shape", () => {
    const analysis = analyzedFightAnalysis({
      fightId: 1,
      sourceId: 7,
      comparisons: [
        comparison({
          outcome: "REJECTED",
          basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
          observedToken: "rupture",
        }),
      ],
    });
    const cell = cellOf(analysis);
    const night = aggregateOf({
      players: [rosterPlayerFor({ sourceId: 7 })],
      fights: [rosterFightFor({ fightId: 1, participants: [{ sourceId: 7, specName: "Assassination" }] })],
      cells: [cell],
    });
    expect(
      JSON.stringify([cell, night.coverage, night.recurrence, projectRecurrence(night.recurrence)]),
    ).not.toMatch(/simc.?profile/i);
    expect(discloseRaidNightCoverage(night).disclosures).not.toContain(
      "DECISIONS_EVALUATED_UNDER_SIMC_PROFILE",
    );
  });
});

describe("the raid night", () => {
  const analysis = analyzedFightAnalysis({
    fightId: 1,
    sourceId: 7,
    comparisons: [
      comparison({
        outcome: "REJECTED",
        basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
        observedToken: "rupture",
      }),
      comparison({
        outcome: "MATCH",
        basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
        observedToken: "garrote",
        selectionPrecision: "EXACT_ENTRY",
      }),
    ],
  });
  const view = analysis.observedDecisions as ObservedDecisionView;
  const tagged = { ...analysis, observedDecisions: everyDecisionProfileRelative(view, FACTS) };
  const cell = cellOf(tagged);
  const night = aggregateOf({
    players: [rosterPlayerFor({ sourceId: 7 })],
    fights: [rosterFightFor({ fightId: 1, participants: [{ sourceId: 7, specName: "Assassination" }] })],
    cells: [cell],
  });

  it("a cell says how much rests on the profile and which profile answered, and validates", () => {
    if (cell.kind !== "ANALYZED") throw new Error(cell.kind);
    expect(cell.simcProfileEvaluation?.counts).toEqual({ decisions: 2, match: 1, rejected: 1, unknown: 0 });
    const projected = PublicCellSchema.parse(projectCell("aBcDeFgH12345678", cell));
    if (projected.kind !== "ANALYZED") throw new Error(projected.kind);
    expect(projected.simcProfileEvaluation).toMatchObject({
      basis: "SIMC_PROFILE_RELATIVE",
      encounterStateObserved: false,
      coverage: { decisions: 2, rejected: 1 },
      sources: [{ clientBuild: "12.1.0.69933", aplAuthorityId: "SIMC_APL_ROGUE_ASSASSINATION" }],
    });
  });

  it("a modeled rejection stays out of rejectedPatterns, and the outcome counts stay what they are", () => {
    expect(night.recurrence.rejectedPatterns).toEqual([]);
    expect(
      night.recurrence.simcProfileRelativeRejectedPatterns?.map((group) => group.occurrenceCount),
    ).toEqual([1]);
    expect(projectRecurrence(night.recurrence).simcProfileRelativeRejectedPatterns).toHaveLength(1);
    expect(night.coverage.rejectedTotal).toBe(1);
    expect(night.coverage.simcProfileRelative).toEqual({ decisions: 2, match: 1, rejected: 1, unknown: 0 });
  });

  it("the disclosure names it, the coverage sentence stays first, and nothing states a count", () => {
    const disclosure = discloseRaidNightCoverage(night);
    expect(disclosure.disclosures).toContain("DECISIONS_EVALUATED_UNDER_SIMC_PROFILE");
    expect(disclosure.lines[0]).toMatch(/^Partial analysis: /);
    expect(
      disclosure.lines.some((line) =>
        line.startsWith(
          "2 eligible observed decisions were evaluated under the pinned SimC profile assumptions",
        ),
      ),
    ).toBe(true);
    for (const line of disclosure.lines) for (const claim of COUNT_CLAIMS) expect(line).not.toMatch(claim);
  });
});

describe("the single-fight document", () => {
  const analysis = analyzedFightAnalysis({
    fightId: 1,
    sourceId: 7,
    comparisons: [
      comparison({
        outcome: "MATCH",
        basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
        observedToken: "garrote",
        selectionPrecision: "EXACT_ENTRY",
      }),
      comparison({
        outcome: "MATCH",
        basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
        observedToken: "rupture",
        selectionPrecision: "EXACT_ENTRY",
      }),
    ],
  });
  const view = analysis.observedDecisions as ObservedDecisionView;

  it("marks exactly the decisions that read the profile, and each fact resolves in the block", () => {
    const [first, second] = view.decisions;
    const document = PublicAnalysisResultSchema.parse(
      projectAnalysisResult({
        ...analysis,
        observedDecisions: {
          ...view,
          decisions: [
            profileRelative(first as ObservedDecisionRecord, FACTS),
            second as ObservedDecisionRecord,
          ],
        },
      }),
    );
    if (document.status !== "ANALYZED") throw new Error(document.status);
    expect(document.decisions[1]).not.toHaveProperty("encounterState");
    const block = document.simcProfileEvaluation;
    expect(block).toMatchObject({
      revision: "simc-profile-evaluation/1",
      encounterStateObserved: false,
      coverage: { decisions: 1, match: 1, rejected: 0, unknown: 0 },
      findingEffect: { confidence: "NONE", suppression: "NONE", actionability: "NONE" },
    });
    const facts = document.decisions[0]?.encounterState?.facts ?? [];
    expect(facts.map((fact) => fact.fact)).toEqual(FACTS.map((fact) => fact.fact));
    for (const fact of facts) {
      const source = block?.sources[fact.sourceIndex];
      expect(source?.semantics.map((semantic) => semantic.semanticId)).toContain(fact.semanticId);
      expect(source?.category).toBe("SIMC_PROFILE_FALLBACK");
    }
    expect(JSON.stringify(block)).not.toMatch(/warcraft|wcl\b/i);
  });

  it("with no such decision there is no block and no decision key", () => {
    const document = PublicAnalysisResultSchema.parse(projectAnalysisResult(analysis));
    expect(JSON.stringify(document)).not.toMatch(/simc_?profile|encounterState/i);
  });
});

describe("a diagnosis statement", () => {
  const FOCUS = 5;
  const BOSS = 50;
  const SYNTHETIC: PostHocDefinition = { specId: "synthetic/spec", cooldownWindows: [], subActorKinds: [] };
  const actor = (actorId: number, fields: Partial<CombatActor>): [number, CombatActor] => [
    actorId,
    {
      actorId,
      gameId: null,
      name: null,
      server: null,
      actorType: "NPC",
      rawType: "NPC",
      subType: null,
      petOwnerActorId: null,
      ...fields,
    },
  ];
  let ordinal = 0;
  const hits = (count: number): CombatEvent[] =>
    Array.from({ length: count }, (_, index) =>
      damageEvent({
        ordinal: (ordinal += 1),
        reportTimeMs: 1100 + index * 10,
        sourceActorId: FOCUS,
        sourceInstanceId: 0,
        targetActorId: BOSS,
        targetInstanceId: 0,
        abilityGameId: RUPTURE,
        amount: 100,
      }),
    );
  const fightInput = (events: CombatEvent[], ref?: string): ComparisonFightInput => {
    const base = syntheticFight({
      focusActorId: FOCUS,
      actors: new Map([
        actor(FOCUS, { actorType: "PLAYER", rawType: "Rogue" }),
        actor(BOSS, { subType: "Boss", gameId: 9000 }),
      ]),
      events,
      endTimeMs: 5000,
      finality: "COMPLETED",
      observedCategories: ["DAMAGE", "CASTS", "AURAS", "ACTORS"],
    });
    const fight: CombatFight = {
      ...base,
      data: { ...base.data, logVersion: 17 },
      fight: { ...base.fight, difficulty: 5, encounterId: 3000 },
    };
    return {
      fightRef: ref ?? `${fight.report.code}#${String(fight.fight.id)}`,
      fight,
      focusActorId: FOCUS,
      basis: { kind: "COVERAGE_VOUCHED" },
      enemyNpcs: { kind: "NOT_RETRIEVED", reason: "synthetic" },
      enemyEntries: null,
      wcl: { raidEntry: null, raidTotalTimeMs: null, tables: null },
    };
  };
  const subject = fightInput(hits(6));
  const evidence = { input: { subject, comparisons: [fightInput(hits(3), "C1#1")] }, definition: SYNTHETIC };
  const diagnosisOf = (decisions: readonly ObservedDecisionRecord[]): Diagnosis => {
    const outcome = diagnose(
      {
        reportCode: subject.fight.report.code,
        reportRevision: subject.fight.report.revision,
        fightId: subject.fight.fight.id,
        sourceId: FOCUS,
        fightStartMs: subject.fight.fight.startTimeMs,
        fightEndMs: subject.fight.fight.endTimeMs,
        specId: SYNTHETIC.specId,
        authorityId: "SYNTHETIC_APL",
      },
      evidence,
      viewOf(decisions),
    );
    if (outcome.state !== "ASSESSED") throw new Error(outcome.reason);
    return outcome.diagnosis;
  };

  it("names which of its findings were resolved under the profile, and keeps them findings", () => {
    const { statements } = diagnosisOf([
      decision(1, "REJECTED"),
      profileRelative(decision(2, "REJECTED"), FACTS),
    ]);
    expect(statements[0]?.findings.map((locator) => locator.indexInPage)).toEqual([1, 2]);
    expect(statements[0]?.findingsUnderSimcProfile?.map((locator) => locator.indexInPage)).toEqual([2]);
  });

  it("carries no such field when none was", () => {
    const { statements } = diagnosisOf([decision(1, "REJECTED")]);
    expect(statements[0]).not.toHaveProperty("findingsUnderSimcProfile");
  });

  it("the profile changes which pairs become statements not at all", () => {
    const plain = diagnosisOf([decision(1, "REJECTED"), decision(2, "MATCH")]);
    const tagged = diagnosisOf([
      profileRelative(decision(1, "REJECTED"), FACTS),
      profileRelative(decision(2, "MATCH"), FACTS),
    ]);
    expect(tagged.coverage).toEqual(plain.coverage);
    expect(tagged.observations).toEqual(plain.observations);
  });
});
