import { beforeAll, describe, expect, it } from "vitest";

import type { ComparisonFightInput, PostHocDefinition } from "../../src/comparison-facts/fight-facts.js";
import type { AlignmentInput } from "../../src/comparison-facts/timing-alignment.js";
import { PublicAnalysisResultSchema } from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import {
  diagnose,
  type ComparisonEvidence,
  type ComparisonEvidencePort,
  type Diagnosis,
  type DiagnosisOutcome,
  type DiagnosisSubject,
} from "../../src/diagnosis/diagnosis.js";
import type { CombatActor } from "../../src/engine/normalization/actors.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import type {
  ObservedDecisionRecord,
  ObservedDecisionView,
} from "../../src/findings/observed-decision-view.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import type { FightAnalysis } from "../../src/services/result.js";
import { BLOOD_POST_HOC_DEFINITION } from "../../src/specs/deathknight/blood/post-hoc-definition.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { COMPARISONS, comparisonInput, subjectInput } from "../support/m11/g2-four-fights.js";
import { damageEvent, syntheticFight } from "../support/synthetic-fight.js";

/**
 * M14-F: the reviewed diagnosis projection, through the shared application
 * service, over the four committed M11-G2 fights (the subject's real Blood
 * analysis) and synthetic fights. No Warcraft Logs request is made: the
 * comparison evidence port is a test double over committed evidence.
 */

const BLOOD = BLOOD_POST_HOC_DEFINITION as unknown as PostHocDefinition;
const [C246, C116, C261] = ["COHORT246AAAAAAA#33", "COHORT116AAAAAAA#64", "COHORT261AAAAAAA#31"];
const HEART_STRIKE = 206930;

function identityOf(
  fight: CombatFight,
  sourceId: number,
  className: string,
  specName: string,
): FightIdentity {
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
    player: { sourceId, name: "Subject", className, specName },
  };
}

function serviceDeps(subject: ComparisonFightInput, port?: ComparisonEvidencePort): AnalysisServiceDeps {
  return {
    env: MCP_TEST_ENV,
    preflight: async () => ({
      ok: true,
      identity: identityOf(subject.fight, subject.focusActorId, "DeathKnight", "Blood"),
      rateLimit: undefined,
    }),
    ingest: async () => ({ ok: true, fight: subject.fight, rateLimit: undefined }),
    ...(port === undefined ? {} : { comparisonEvidence: port }),
  };
}

async function analyzed(deps: AnalysisServiceDeps, subject: ComparisonFightInput): Promise<FightAnalysis> {
  const result = await analyzeFight(
    {
      reportCode: subject.fight.report.code,
      fightId: subject.fight.fight.id,
      sourceId: subject.focusActorId,
    },
    deps,
  );
  if (!result.ok) throw new Error(result.error.code);
  if (result.analysis.analysis.status !== "ANALYZED") throw new Error(result.analysis.analysis.status);
  return result.analysis;
}

const assessed = (outcome: DiagnosisOutcome | undefined): Diagnosis => {
  if (outcome?.state !== "ASSESSED") throw new Error(`not assessed: ${JSON.stringify(outcome)}`);
  return outcome.diagnosis;
};

// ---------------------------------------------------------------------------
// The committed fights, through the service
// ---------------------------------------------------------------------------

let real: AlignmentInput;
let withEvidence: FightAnalysis;
let withoutPort: FightAnalysis;
const requests: unknown[] = [];

beforeAll(async () => {
  const comparisons: ComparisonFightInput[] = [];
  for (const fixture of COMPARISONS) comparisons.push(await comparisonInput(fixture));
  real = { subject: await subjectInput(), comparisons };
  const port: ComparisonEvidencePort = async (request) => {
    requests.push(request);
    return { input: real, definition: BLOOD };
  };
  withEvidence = await analyzed(serviceDeps(real.subject, port), real.subject);
  withoutPort = await analyzed(serviceDeps(real.subject), real.subject);
}, 180_000);

describe("the committed fights: diagnosed through the application service", () => {
  it("the comparison source is told only who was analyzed", () => {
    expect(requests).toEqual([
      {
        // The committed subject's own (pseudonymized) identity, as preflight reports it here.
        reportCode: real.subject.fight.report.code,
        reportRevision: real.subject.fight.report.revision,
        fightId: real.subject.fight.fight.id,
        sourceId: 15,
        encounterId: 2900,
        difficulty: real.subject.fight.fight.difficulty,
        specId: "deathknight/blood",
      },
    ]);
  });

  it("without comparison evidence, ANALYZED discloses NOT_ASSESSED, never an empty diagnosis", () => {
    expect(withoutPort.diagnosis).toEqual({
      state: "NOT_ASSESSED",
      reason: "COMPARISON_EVIDENCE_NOT_RETRIEVED",
    });
    const document = projectAnalysisResult(withoutPort);
    if (document.status !== "ANALYZED") throw new Error(document.status);
    expect(document.diagnosis).toEqual({
      assessment: "NOT_ASSESSED",
      reason: "COMPARISON_EVIDENCE_NOT_RETRIEVED",
    });
  });

  it("diagnosis changes nothing about the analysis: decisions and coverage are identical with or without it", () => {
    expect(withEvidence.analysis).toEqual(withoutPort.analysis);
    expect(withEvidence.observedDecisions).toEqual(withoutPort.observedDecisions);
    const a = projectAnalysisResult(withEvidence);
    const b = projectAnalysisResult(withoutPort);
    if (a.status !== "ANALYZED" || b.status !== "ANALYZED") throw new Error("not analyzed");
    expect(a.decisions).toEqual(b.decisions);
    expect(a.coverage).toEqual(b.coverage);
  });

  it("no coaching statement exists on real evidence, and every pair is labelled with why", () => {
    const diagnosis = assessed(withEvidence.diagnosis);
    expect(diagnosis.subjectFightRef).toBe("b1PmaKrd6CDfzngc#48");
    expect(diagnosis.comparisonFightRefs).toEqual([C246, C116, C261]);
    expect(diagnosis.windowIds).toEqual(["WHOLE_FIGHT"]);
    expect(diagnosis.statements).toEqual([]);
    expect(diagnosis.coverage.pairs).toBe(diagnosis.coverage.deltaRows * 3);
    expect(diagnosis.coverage.observations).toBe(diagnosis.coverage.pairs);
    expect(diagnosis.coverage.observationCauses.reduce((sum, row) => sum + row.count, 0)).toBe(
      diagnosis.coverage.pairs,
    );
    // The real Blood population, restated by the reviewed adapter: 307 decisions, 224 UNKNOWN.
    expect(diagnosis.coverage.decisionEvidence).toEqual({
      records: 307,
      resolved: 83,
      unknown: 224,
      inNoComponent: 0,
    });
  });

  it("the twelve whole-fight M14-E links rest on authority-compatible decisions only: evidence, not findings", () => {
    const diagnosis = assessed(withEvidence.diagnosis);
    const noFinding = diagnosis.observations
      .filter((observation) => observation.cause === "NO_AUTHORITY_FINDING_IN_LINK")
      .map((observation) => `${observation.rowId} > ${observation.comparisonFightRef}`);
    const all = (rowId: string) => [C246, C116, C261].map((ref) => `${rowId} > ${ref}`);
    expect(noFinding).toEqual([
      ...all("WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:49998"),
      ...all("WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:50842"),
      ...all("WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:195182"),
      ...all("WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:433895"),
    ]);
    expect(
      diagnosis.observations.filter((observation) => observation.cause === "FINDINGS_DO_NOT_MATCH_DIRECTION"),
    ).toEqual([]);
  });

  it("the 45 Heart Strike rejections make no statement while the difference's direction is undecided", () => {
    const heart = assessed(withEvidence.diagnosis).observations.filter(
      (observation) =>
        observation.rowId === `WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:${String(HEART_STRIKE)}`,
    );
    expect(heart.map((observation) => [observation.direction, observation.cause])).toEqual([
      ["UNDECIDED", "DIRECTION_UNDECIDED"],
      ["UNDECIDED", "DIRECTION_UNDECIDED"],
      ["UNDECIDED", "DIRECTION_UNDECIDED"],
    ]);
  });

  it("comparison is context: uncertified, subject-side only, no magnitude, no finding effect, phase evidence disclosed", () => {
    const diagnosis = assessed(withEvidence.diagnosis);
    expect(diagnosis.comparisonCoverage).toBe("AT_LEAST_UNCERTIFIED");
    expect(diagnosis.comparisonRole).toBe("CONTEXT_ONLY");
    expect(diagnosis.decisionEvidenceSide).toBe("SUBJECT_ONLY");
    expect(diagnosis.magnitudeAttribution).toBe("NONE");
    expect(diagnosis.findingEffect).toEqual({ suppression: "NONE", confidence: "NONE" });
    expect(diagnosis.encounterStateEvidence.map((entry) => entry.phaseEvidence)).toEqual([
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
    ]);
    expect(diagnosis.strategyThresholds.status).toBe("CANDIDATE");
    for (const observation of diagnosis.observations) {
      expect(observation.limits).toContain("COMPARISON_COVERAGE_UNCERTIFIED");
      expect(observation.limits).toContain("COMPARISON_DECISIONS_NOT_EVALUATED");
    }
  });

  it("projects to a schema-valid public document carrying the same diagnosis", () => {
    const document = projectAnalysisResult(withEvidence);
    expect(PublicAnalysisResultSchema.safeParse(document).success).toBe(true);
    if (document.status !== "ANALYZED") throw new Error(document.status);
    const diagnosis = assessed(withEvidence.diagnosis);
    if (document.diagnosis?.assessment !== "ASSESSED") throw new Error("not assessed");
    expect(document.diagnosis.comparisonFights).toEqual([C246, C116, C261].map((fightRef) => ({ fightRef })));
    expect(document.diagnosis.coverage).toEqual(diagnosis.coverage);
    expect(document.diagnosis.observations).toHaveLength(diagnosis.observations.length);
    expect(document.diagnosis.statements).toEqual([]);
  });

  it("evidence for another player, fight or specialization is never applied", async () => {
    const other: ComparisonEvidence = {
      input: { ...real, subject: { ...real.subject, focusActorId: real.subject.focusActorId + 1 } },
      definition: BLOOD,
    };
    const wrongPlayer = await analyzed(
      serviceDeps(real.subject, async () => other),
      real.subject,
    );
    expect(wrongPlayer.diagnosis).toEqual({
      state: "NOT_ASSESSED",
      reason: "COMPARISON_EVIDENCE_NOT_FOR_THIS_FIGHT",
    });
    const wrongSpec = await analyzed(
      serviceDeps(real.subject, async () => ({
        input: real,
        definition: { ...BLOOD, specId: "monk/brewmaster" },
      })),
      real.subject,
    );
    expect(wrongSpec.diagnosis).toEqual({
      state: "NOT_ASSESSED",
      reason: "COMPARISON_EVIDENCE_NOT_FOR_THIS_FIGHT",
    });
  }, 60_000);

  it("a failing or empty evidence source is a disclosed gap, never a failed analysis", async () => {
    const failed = await analyzed(
      serviceDeps(real.subject, async () => {
        throw new Error("unavailable");
      }),
      real.subject,
    );
    expect(failed.diagnosis).toEqual({ state: "NOT_ASSESSED", reason: "COMPARISON_RETRIEVAL_FAILED" });
    expect(failed.analysis).toEqual(withoutPort.analysis);
    const empty = await analyzed(
      serviceDeps(real.subject, async () => null),
      real.subject,
    );
    expect(empty.diagnosis).toEqual({ state: "NOT_ASSESSED", reason: "COMPARISON_EVIDENCE_NOT_RETRIEVED" });
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Synthetic fights: when a statement exists, and when it never does
// ---------------------------------------------------------------------------

const FOCUS = 5;
const BOSS = 50;
const RUPTURE = 1943;
const ENVENOM = 32645;
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
const hits = (count: number, ability: number) =>
  Array.from({ length: count }, (_, index) =>
    damageEvent({
      ordinal: (ordinal += 1),
      reportTimeMs: 1100 + index * 10,
      sourceActorId: FOCUS,
      sourceInstanceId: 0,
      targetActorId: BOSS,
      targetInstanceId: 0,
      abilityGameId: ability,
      amount: 100,
    }),
  );

function fightInput(
  events: CombatEvent[],
  options: { encounterId?: number; ref?: string } = {},
): ComparisonFightInput {
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
    fight: { ...base.fight, difficulty: 5, encounterId: options.encounterId ?? 3000 },
  };
  return {
    fightRef: options.ref ?? `${fight.report.code}#${String(fight.fight.id)}`,
    fight,
    focusActorId: FOCUS,
    basis: { kind: "COVERAGE_VOUCHED" },
    enemyNpcs: { kind: "NOT_RETRIEVED", reason: "synthetic" },
    enemyEntries: null,
    wcl: { raidEntry: null, raidTotalTimeMs: null, tables: null },
  };
}

function subjectOf(input: ComparisonFightInput): DiagnosisSubject {
  return {
    reportCode: input.fight.report.code,
    reportRevision: input.fight.report.revision,
    fightId: input.fight.fight.id,
    sourceId: input.focusActorId,
    fightStartMs: input.fight.fight.startTimeMs,
    fightEndMs: input.fight.fight.endTimeMs,
    specId: SYNTHETIC.specId,
    authorityId: "SYNTHETIC_APL",
  };
}

function decision(position: number, outcome: string, ability = RUPTURE, at = 1200): ObservedDecisionRecord {
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
    targetActorId: BOSS,
    observedAbilityGameId: ability,
    observedToken: "token",
    outcome,
    basis:
      outcome === "REJECTED"
        ? "OBSERVED_ACTION_REJECTED_BY_AUTHORITY"
        : "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
    authorityCoverage: "EXACT_ENTRY",
    authorityToken: "token",
    selectionPrecision: "EXACT_ENTRY",
    decisiveBlocker: null,
    usabilityProvenance: "OBSERVED_EXECUTION",
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

/** Subject: 6 Rupture and 2 Envenom events on the boss. C1: 3 Rupture and 4 Envenom. */
const SUBJECT = fightInput([...hits(6, RUPTURE), ...hits(2, ENVENOM)]);
const C1 = fightInput([...hits(3, RUPTURE), ...hits(4, ENVENOM)], { ref: "C1#1" });
const PAIR: ComparisonEvidence = { input: { subject: SUBJECT, comparisons: [C1] }, definition: SYNTHETIC };
const RUPTURE_ROW = `WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:${String(RUPTURE)}`;
const ENVENOM_ROW = `WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:${String(ENVENOM)}`;

const run = (decisions: ObservedDecisionRecord[], evidence: ComparisonEvidence | null = PAIR) =>
  diagnose(subjectOf(SUBJECT), evidence, viewOf(decisions));
const observationOf = (diagnosis: Diagnosis, rowId: string) =>
  diagnosis.observations.find((observation) => observation.rowId === rowId);

describe("synthetic: a coaching statement needs a link, a finding and a direction the finding bears on", () => {
  it("rejected Rupture casts linked to a proven higher Rupture figure make one statement, with its findings and limits", () => {
    const diagnosis = assessed(run([decision(1, "REJECTED"), decision(2, "MATCH")]));
    expect(diagnosis.statements).toHaveLength(1);
    expect(diagnosis.statements[0]).toMatchObject({
      statementKind: "AUTHORITY_FINDING_LINKED_TO_DELTA",
      rowId: RUPTURE_ROW,
      comparisonFightRef: "C1#1",
      direction: "SUBJECT_HIGHER",
      perMinuteDelta: { kind: "EXACT" },
      magnitudeAttribution: "NONE",
      environmentalContext: [],
      limits: [
        "COMPARISON_COVERAGE_UNCERTIFIED",
        "COMPARISON_DECISIONS_NOT_EVALUATED",
        "EVENT_COUNT_NOT_DAMAGE_AMOUNT",
      ],
    });
    // Only the REJECTED decision is a finding; the MATCH is evidence, not a fault.
    expect(diagnosis.statements[0]?.findings.map((locator) => locator.indexInPage)).toEqual([1]);
    expect(diagnosis.coverage.statements + diagnosis.coverage.observations).toBe(diagnosis.coverage.pairs);
  });

  it("rejected casts never explain a LOWER figure: Envenom stays an observation", () => {
    const diagnosis = assessed(run([decision(1, "REJECTED", ENVENOM)]));
    expect(diagnosis.statements).toEqual([]);
    expect(observationOf(diagnosis, ENVENOM_ROW)).toMatchObject({
      direction: "SUBJECT_LOWER",
      cause: "FINDINGS_DO_NOT_MATCH_DIRECTION",
    });
  });

  it("a link resting only on MATCH decisions is evidence, never a statement", () => {
    const diagnosis = assessed(run([decision(1, "MATCH"), decision(2, "MATCH")]));
    expect(diagnosis.statements).toEqual([]);
    expect(observationOf(diagnosis, RUPTURE_ROW)?.cause).toBe("NO_AUTHORITY_FINDING_IN_LINK");
  });

  it("UNKNOWN decisions never become a statement or a finding", () => {
    const diagnosis = assessed(run([decision(1, "UNKNOWN"), decision(2, "UNKNOWN")]));
    expect(diagnosis.statements).toEqual([]);
    expect(observationOf(diagnosis, RUPTURE_ROW)?.cause).toBe("DECISION_EVIDENCE_UNRESOLVED");
    expect(diagnosis.coverage.decisionEvidence).toEqual({
      records: 2,
      resolved: 0,
      unknown: 2,
      inNoComponent: 0,
    });
  });

  it("a rejection about another ability lends nothing to this row", () => {
    const diagnosis = assessed(run([decision(1, "REJECTED", 99999)]));
    expect(diagnosis.statements).toEqual([]);
    expect(observationOf(diagnosis, RUPTURE_ROW)?.cause).toBe("NO_DECISION_EVIDENCE_IN_SCOPE");
    expect(diagnosis.coverage.decisionEvidence.inNoComponent).toBe(1);
  });

  it("an undecided difference makes no statement however many rejections exist", () => {
    // An uncertified comparison count is a lower bound: 6 − (≥3) is NO_MORE_THAN 3, which proves no direction.
    const bound: ComparisonEvidence = {
      input: {
        subject: SUBJECT,
        comparisons: [{ ...C1, basis: { kind: "UNCERTIFIED_FILTERED_CAPTURE", reason: "synthetic" } }],
      },
      definition: SYNTHETIC,
    };
    const diagnosis = assessed(run([decision(1, "REJECTED"), decision(2, "REJECTED")], bound));
    expect(diagnosis.statements).toEqual([]);
    expect(observationOf(diagnosis, RUPTURE_ROW)).toMatchObject({
      direction: "UNDECIDED",
      perMinuteDelta: { kind: "NO_MORE_THAN" },
      cause: "DIRECTION_UNDECIDED",
    });
  });

  it("is deterministic and leaves its inputs untouched", () => {
    const decisions = [decision(1, "REJECTED"), decision(2, "MATCH")];
    const frozen = JSON.stringify(decisions);
    expect(run(decisions)).toEqual(run(decisions));
    expect(JSON.stringify(decisions)).toBe(frozen);
  });
});

describe("synthetic: NOT_ASSESSED, never an empty diagnosis", () => {
  it("no evidence: COMPARISON_EVIDENCE_NOT_RETRIEVED", () => {
    expect(run([decision(1, "REJECTED")], null)).toEqual({
      state: "NOT_ASSESSED",
      reason: "COMPARISON_EVIDENCE_NOT_RETRIEVED",
    });
  });

  it("a comparison of another encounter: COMPARISON_NOT_COMPARABLE", () => {
    const other = fightInput(hits(3, RUPTURE), { encounterId: 3001, ref: "C2#1" });
    expect(
      run([decision(1, "REJECTED")], {
        input: { subject: SUBJECT, comparisons: [other] },
        definition: SYNTHETIC,
      }),
    ).toEqual({
      state: "NOT_ASSESSED",
      reason: "COMPARISON_NOT_COMPARABLE",
    });
  });

  it("an outcome word the adapter was not reviewed for: DECISION_EVIDENCE_NOT_USABLE, never guessed", () => {
    expect(run([decision(1, "PROBABLY_FINE")])).toEqual({
      state: "NOT_ASSESSED",
      reason: "DECISION_EVIDENCE_NOT_USABLE",
    });
  });

  it("a decision outside the subject fight: DECISION_EVIDENCE_NOT_USABLE", () => {
    expect(run([decision(1, "REJECTED", RUPTURE, 999_999)])).toEqual({
      state: "NOT_ASSESSED",
      reason: "DECISION_EVIDENCE_NOT_USABLE",
    });
  });

  it("a subject that is not the analyzed fight: COMPARISON_EVIDENCE_NOT_FOR_THIS_FIGHT", () => {
    const fight = SUBJECT.fight;
    const variants: ComparisonFightInput[] = [
      { ...SUBJECT, fight: { ...fight, fight: { ...fight.fight, id: fight.fight.id + 1 } } },
      { ...SUBJECT, fight: { ...fight, report: { ...fight.report, revision: fight.report.revision + 1 } } },
      { ...SUBJECT, fight: { ...fight, report: { ...fight.report, code: "OTHERREPORT00000" } } },
      { ...SUBJECT, fight: { ...fight, fight: { ...fight.fight, endTimeMs: fight.fight.endTimeMs + 1 } } },
    ];
    for (const subject of variants) {
      expect(
        run([decision(1, "REJECTED")], { input: { subject, comparisons: [C1] }, definition: SYNTHETIC }),
      ).toEqual({
        state: "NOT_ASSESSED",
        reason: "COMPARISON_EVIDENCE_NOT_FOR_THIS_FIGHT",
      });
    }
  });

  it("the post-hoc fight label is not identity: a relabelled subject still binds by its own fight", () => {
    const relabelled = { ...SUBJECT, fightRef: "LABEL#1" };
    expect(
      run([decision(1, "REJECTED")], {
        input: { subject: relabelled, comparisons: [C1] },
        definition: SYNTHETIC,
      }).state,
    ).toBe("ASSESSED");
  });
});
