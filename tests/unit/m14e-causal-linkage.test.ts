import { beforeAll, describe, expect, it } from "vitest";

import type { CombatActor } from "../../src/engine/normalization/actors.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import type { ComparisonFightInput, PostHocDefinition } from "../../src/comparison-facts/fight-facts.js";
import type { AlignmentInput } from "../../src/comparison-facts/timing-alignment.js";
import {
  linkCausalEvidence,
  type CausalEvidenceLinkage,
  type ComponentLinkage,
  type DecisionEvidenceRecord,
} from "../../src/comparison-facts/causal-linkage.js";
import { analyzeObservedBloodDeathKnightDecisions } from "../../src/specs/deathknight/blood/observed-analysis.js";
import { BLOOD_POST_HOC_DEFINITION } from "../../src/specs/deathknight/blood/post-hoc-definition.js";
import { BLOOD_DEATH_KNIGHT_REGISTRATION } from "../../src/specs/deathknight/blood/registration.js";
import { BLOOD_DEATH_KNIGHT_SPEC_ID } from "../../src/specs/deathknight/blood/spec.js";
import { damageEvent, syntheticFight } from "../support/synthetic-fight.js";
import { COMPARISONS, comparisonInput, subjectInput } from "../support/m11/g2-four-fights.js";

/**
 * M14-E causal evidence linkage over the four committed M11-G2 fights, with
 * the subject's real Blood decision results as decision evidence, plus
 * synthetic fights. No Warcraft Logs request is made.
 *
 * The Blood results are restated as records HERE, in the test: the post-hoc
 * linkage never imports the authority branch, and nothing it returns flows
 * back into one.
 */

const BLOOD = BLOOD_POST_HOC_DEFINITION as unknown as PostHocDefinition;
const FIRST_30S = { windowId: "FIRST_30S", landmarkId: "PULL", offsets: { fromMs: 0, toMs: 30_000 } };

const linked = (result: CausalEvidenceLinkage) => {
  if (result.kind !== "LINKED_EVIDENCE") throw new Error(`linkage refused: ${result.reason}`);
  return result;
};
const componentOf = (result: CausalEvidenceLinkage, rowId: string): ComponentLinkage => {
  const found = linked(result).components.find((component) => component.rowId === rowId);
  if (found === undefined) throw new Error(`no component ${rowId}`);
  return found;
};
const statuses = (component: ComponentLinkage) =>
  component.pairs.map((pair) => [pair.perMinuteDirection, pair.status, pair.cause]);

// ---------------------------------------------------------------------------
// The committed fights, with the subject's real Blood decisions
// ---------------------------------------------------------------------------

const [C246, C116, C261] = ["COHORT246AAAAAAA#33", "COHORT116AAAAAAA#64", "COHORT261AAAAAAA#31"];
const HEART_STRIKE = 206930;
const DEATH_STRIKE = 49998;
const DEATHS_CARESS = 195292;

let real: AlignmentInput;
let records: DecisionEvidenceRecord[];
let realResult: CausalEvidenceLinkage;

/** The subject's Blood observed-decision comparisons, restated as decision evidence. */
function bloodRecords(subject: ComparisonFightInput): DecisionEvidenceRecord[] {
  const analysis = analyzeObservedBloodDeathKnightDecisions({
    state: createCombatState(subject.fight),
    actorId: subject.focusActorId,
    specId: BLOOD_DEATH_KNIGHT_SPEC_ID,
    targetActorId: null,
    authority: BLOOD_DEATH_KNIGHT_REGISTRATION.authority,
  });
  if (analysis.status !== "ANALYZED") throw new Error(`expected ANALYZED, got ${analysis.status}`);
  const authority = analysis.authority?.authorityId ?? "NONE";
  return analysis.comparisons.map((comparison) => ({
    evidenceId: `blood:${String(comparison.decision.position)}`,
    fightRef: subject.fightRef,
    kind: "APL_DECISION_OUTCOME",
    basis: "AUTHORITY_BACKED",
    authority,
    producer: BLOOD_DEATH_KNIGHT_SPEC_ID,
    producerStatus: comparison.outcome,
    resolution: comparison.outcome === "UNKNOWN" ? "UNKNOWN" : "RESOLVED",
    interval: { startMs: comparison.decision.reportTimeMs, endMs: comparison.decision.reportTimeMs },
    scope: { kind: "ABILITY", sourceKind: "FOCUS", abilityGameIds: [comparison.decision.abilityGameId] },
    locators: [comparison.decision.locator],
  }));
}

beforeAll(async () => {
  const comparisons: ComparisonFightInput[] = [];
  for (const fixture of COMPARISONS) comparisons.push(await comparisonInput(fixture));
  real = { subject: await subjectInput(), comparisons };
  records = bloodRecords(real.subject);
  realResult = linkCausalEvidence(real, BLOOD, [FIRST_30S], records);
}, 120_000);

describe("the committed fights: links, never causes", () => {
  it("declares linkage only: subject-side evidence, no causal claim, no magnitude, no verdict flow, no finding effect", () => {
    const result = linked(realResult);
    expect(result.encounterId).toBe(2900);
    expect(result.subjectFightRef).toBe("b1PmaKrd6CDfzngc#48");
    expect(result.comparisonFightRefs).toEqual([C246, C116, C261]);
    expect(result.decisionEvidenceSide).toBe("SUBJECT_ONLY");
    expect(result.comparisonCoverage).toBe("AT_LEAST_UNCERTIFIED");
    expect(result.use).toBe("LINKAGE_ONLY");
    expect(result.causalClaim).toBe("NONE");
    expect(result.magnitudeAttribution).toBe("NONE");
    expect(result.verdictFlow).toBe("NONE");
    expect(result.findingEffect).toEqual({ suppression: "NONE", confidence: "NONE" });
    // The real Blood population: 307 decisions, 45 REJECTED, 38 MATCH, 224 UNKNOWN.
    const tally = (status: string) =>
      result.evidence.filter((record) => record.producerStatus === status).length;
    expect([result.evidence.length, tally("REJECTED"), tally("MATCH"), tally("UNKNOWN")]).toEqual([
      307, 45, 38, 224,
    ]);
    expect(result.evidenceInNoComponent).toEqual([]);
  });

  it("the exact LINKED pairs: only proven-direction ability rows with resolved decisions in scope", () => {
    const pairs = linked(realResult).components.flatMap((component) =>
      component.pairs
        .filter((pair) => pair.status === "LINKED")
        .map((pair) => `${component.rowId} > ${pair.comparisonFightRef}`),
    );
    const all = (rowId: string) => [C246, C116, C261].map((ref) => `${rowId} > ${ref}`);
    expect(pairs).toEqual([
      ...all("WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:49998"),
      ...all("WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:50842"),
      ...all("WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:195182"),
      ...all("WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:433895"),
      `FIRST_30S|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:49998 > ${C246}`,
    ]);
  });

  it("45 authority rejections of Heart Strike link to nothing while the delta's direction is undecided", () => {
    const heart = componentOf(
      realResult,
      `WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:${String(HEART_STRIKE)}`,
    );
    expect(heart.authorityBackedEvidenceIds).toHaveLength(45);
    expect(heart.unresolved).toHaveLength(54);
    expect(statuses(heart)).toEqual([
      ["UNDECIDED", "OBSERVATION_ONLY", "DIRECTION_UNDECIDED"],
      ["UNDECIDED", "OBSERVATION_ONLY", "DIRECTION_UNDECIDED"],
      ["UNDECIDED", "OBSERVATION_ONLY", "DIRECTION_UNDECIDED"],
    ]);
  });

  it("a link is not a fault: Death Strike links on authority MATCHes, and every limit is stated", () => {
    const death = componentOf(
      realResult,
      `WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:${String(DEATH_STRIKE)}`,
    );
    expect(death.resolvedEvidenceIds).toHaveLength(24);
    const byId = new Map(linked(realResult).evidence.map((record) => [record.evidenceId, record]));
    expect(new Set(death.resolvedEvidenceIds.map((id) => byId.get(id)?.producerStatus))).toEqual(
      new Set(["MATCH"]),
    );
    expect(death.unresolved).toHaveLength(77);
    for (const pair of death.pairs) {
      expect(pair).toMatchObject({ perMinuteDirection: "SUBJECT_LOWER", status: "LINKED", cause: null });
      expect(pair.perMinuteDelta.kind).toBe("NO_MORE_THAN");
      expect(pair.limits).toEqual([
        "COMPARISON_COVERAGE_UNCERTIFIED",
        "COMPARISON_DECISIONS_NOT_EVALUATED",
        "DELTA_IS_A_BOUND",
        "EVENT_COUNT_NOT_DAMAGE_AMOUNT",
        "UNRESOLVED_EVIDENCE_IN_SCOPE",
      ]);
    }
  });

  it("UNKNOWN decisions never support a link: Death's Caress stays an observation", () => {
    const caress = componentOf(
      realResult,
      `WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:${String(DEATHS_CARESS)}`,
    );
    expect(caress.resolvedEvidenceIds).toEqual([]);
    expect(caress.unresolved.map((entry) => entry.resolution)).toEqual([
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
    ]);
    expect(statuses(caress)).toEqual([
      ["UNDECIDED", "OBSERVATION_ONLY", "DIRECTION_UNDECIDED"],
      ["SUBJECT_LOWER", "OBSERVATION_ONLY", "DECISION_EVIDENCE_UNRESOLVED"],
      ["SUBJECT_LOWER", "OBSERVATION_ONLY", "DECISION_EVIDENCE_UNRESOLVED"],
    ]);
  });

  it("one ability's decisions never explain a total, and table and raw-amount rows never link", () => {
    const total = componentOf(realResult, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|TOTAL");
    expect(total.resolvedEvidenceIds).toEqual([]);
    expect(statuses(total).map(([, status, cause]) => [status, cause])).toEqual([
      ["OBSERVATION_ONLY", "NO_DECISION_EVIDENCE_IN_SCOPE"],
      ["OBSERVATION_ONLY", "NO_DECISION_EVIDENCE_IN_SCOPE"],
      ["OBSERVATION_ONLY", "NO_DECISION_EVIDENCE_IN_SCOPE"],
    ]);
    const tableTotal = componentOf(realResult, "WHOLE_FIGHT|WCL_TABLE_AMOUNT|TOTAL");
    expect(tableTotal.pairs.map((pair) => pair.perMinuteDirection)).toEqual([
      "SUBJECT_LOWER",
      "SUBJECT_LOWER",
      "SUBJECT_LOWER",
    ]);
    expect(tableTotal.pairs.map((pair) => pair.cause)).toEqual([
      "NO_DECISION_EVIDENCE_IN_SCOPE",
      "NO_DECISION_EVIDENCE_IN_SCOPE",
      "NO_DECISION_EVIDENCE_IN_SCOPE",
    ]);
    for (const component of linked(realResult).components.filter(
      (entry) => entry.measure !== "DAMAGE_EVENT_COUNT",
    ))
      for (const pair of component.pairs) expect(pair.status).toBe("OBSERVATION_ONLY");
  });

  it("comparison fights decide only a direction: the subject's evidence in each component never depends on them", () => {
    const alone = linkCausalEvidence(
      { subject: real.subject, comparisons: real.comparisons.slice(2) },
      BLOOD,
      [FIRST_30S],
      records,
    );
    const membership = (result: CausalEvidenceLinkage) =>
      new Map(
        linked(result).components.map((component) => [
          component.rowId,
          JSON.stringify([component.resolvedEvidenceIds, component.unresolved, component.subjectWindow]),
        ]),
      );
    const full = membership(realResult);
    for (const [rowId, value] of membership(alone)) if (full.has(rowId)) expect(value).toBe(full.get(rowId));
    expect(JSON.stringify(linked(realResult).components)).not.toMatch(/confidence/i);
  });

  it("is deterministic over the committed bytes and never alters a record", () => {
    const before = JSON.stringify(records);
    const again = linkCausalEvidence(real, BLOOD, [FIRST_30S], [...records].reverse());
    expect(JSON.stringify(again)).toBe(JSON.stringify(realResult));
    expect(JSON.stringify(records)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Synthetic fights
// ---------------------------------------------------------------------------

const FOCUS = 5;
const BOSS = 50;
const ADD = 51;
const PET_GAME_ID = 7777;
const RUPTURE = 1943;
const PET_BITE = 1;
const SYNTHETIC: PostHocDefinition = {
  specId: "synthetic/spec",
  cooldownWindows: [],
  subActorKinds: [{ kind: "SYNTHETIC_PET", gameIds: [PET_GAME_ID] }],
};

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

function input(
  fightRef: string,
  petActorId: number,
  events: (pet: number) => CombatEvent[],
): ComparisonFightInput {
  const actors = new Map<number, CombatActor>([
    actor(FOCUS, { actorType: "PLAYER", rawType: "Rogue" }),
    actor(BOSS, { subType: "Boss", gameId: 9000 }),
    actor(ADD, { gameId: 9001 }),
    actor(petActorId, { actorType: "PET", rawType: "Pet", gameId: PET_GAME_ID, petOwnerActorId: FOCUS }),
  ]);
  const base = syntheticFight({
    focusActorId: FOCUS,
    actors,
    events: events(petActorId),
    endTimeMs: 5000,
    finality: "COMPLETED",
    observedCategories: ["DAMAGE", "CASTS", "AURAS", "ACTORS"],
  });
  return {
    fightRef,
    fight: {
      ...base,
      data: { ...base.data, logVersion: 17 },
      fight: { ...base.fight, difficulty: 5, encounterId: 3000 },
    },
    focusActorId: FOCUS,
    basis: { kind: "COVERAGE_VOUCHED" },
    enemyNpcs: { kind: "NOT_RETRIEVED", reason: "synthetic" },
    enemyEntries: null,
    wcl: { raidEntry: null, raidTotalTimeMs: null, tables: null },
  };
}

let ordinal = 0;
const hits = (count: number, source: number, target: number, ability: number) =>
  Array.from({ length: count }, (_, index) =>
    damageEvent({
      ordinal: (ordinal += 1),
      reportTimeMs: 1100 + index * 10,
      sourceActorId: source,
      sourceInstanceId: 0,
      targetActorId: target,
      targetInstanceId: 0,
      abilityGameId: ability,
      amount: 100,
    }),
  );

/** Subject: 3 Rupture events on the boss, 2 pet events on the add. C1: 6 and 2. */
const PAIR: AlignmentInput = {
  subject: input("S", 60, (pet) => [...hits(3, FOCUS, BOSS, RUPTURE), ...hits(2, pet, ADD, PET_BITE)]),
  comparisons: [input("C1", 61, (pet) => [...hits(6, FOCUS, BOSS, RUPTURE), ...hits(2, pet, ADD, PET_BITE)])],
};
const EARLY = { windowId: "EARLY", landmarkId: "PULL", offsets: { fromMs: 0, toMs: 500 } };

const record = (
  fields: Partial<DecisionEvidenceRecord> & { evidenceId: string },
): DecisionEvidenceRecord => ({
  fightRef: "S",
  kind: "APL_DECISION_OUTCOME",
  basis: "AUTHORITY_BACKED",
  authority: "SYNTHETIC_APL",
  producer: "synthetic/spec",
  producerStatus: "REJECTED",
  resolution: "RESOLVED",
  interval: { startMs: 1200, endMs: 1200 },
  scope: { kind: "ABILITY", sourceKind: "FOCUS", abilityGameIds: [RUPTURE] },
  locators: [],
  ...fields,
});
const link = (evidence: DecisionEvidenceRecord[], windows = [EARLY]) =>
  linkCausalEvidence(PAIR, SYNTHETIC, windows, evidence);
const pairOf = (result: CausalEvidenceLinkage, rowId: string) => componentOf(result, rowId).pairs[0];

describe("synthetic: what a link needs", () => {
  it("a resolved, in-scope, in-window record links a proven difference, with its limits", () => {
    const result = link([record({ evidenceId: "r1" })]);
    const rupture = componentOf(result, `WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:${String(RUPTURE)}`);
    expect(rupture.resolvedEvidenceIds).toEqual(["r1"]);
    expect(rupture.pairs[0]).toMatchObject({
      perMinuteDirection: "SUBJECT_LOWER",
      perMinuteDelta: { kind: "EXACT" },
      status: "LINKED",
      cause: null,
      limits: [
        "COMPARISON_COVERAGE_UNCERTIFIED",
        "COMPARISON_DECISIONS_NOT_EVALUATED",
        "EVENT_COUNT_NOT_DAMAGE_AMOUNT",
      ],
    });
  });

  it("an EQUAL or UNDECIDED delta has nothing to link, however much evidence exists", () => {
    const pet = record({ evidenceId: "p", scope: { kind: "SOURCE", sourceKind: "SYNTHETIC_PET" } });
    const result = link([pet]);
    expect(pairOf(result, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_SOURCE:SYNTHETIC_PET")).toMatchObject({
      perMinuteDirection: "EQUAL",
      status: "OBSERVATION_ONLY",
      cause: "DIRECTION_EQUAL",
    });
    expect(
      componentOf(result, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_SOURCE:SYNTHETIC_PET").resolvedEvidenceIds,
    ).toEqual(["p"]);
    expect(
      pairOf(result, `WHOLE_FIGHT|RAW_AMOUNT_FIELD_SUM|BY_ABILITY:FOCUS:${String(RUPTURE)}`),
    ).toMatchObject({
      status: "OBSERVATION_ONLY",
      cause: "DIRECTION_UNDECIDED",
    });
  });

  it("UNKNOWN and NO_AUTHORITY_AVAILABLE are carried distinctly and never support a link", () => {
    const result = link([
      record({ evidenceId: "u", producerStatus: "UNKNOWN", resolution: "UNKNOWN" }),
      record({
        evidenceId: "n",
        producerStatus: "NO_AUTHORITY_AVAILABLE",
        resolution: "NO_AUTHORITY_AVAILABLE",
      }),
    ]);
    const rupture = componentOf(result, `WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:${String(RUPTURE)}`);
    expect(rupture.unresolved).toEqual([
      { evidenceId: "n", resolution: "NO_AUTHORITY_AVAILABLE" },
      { evidenceId: "u", resolution: "UNKNOWN" },
    ]);
    expect(rupture.pairs[0]).toMatchObject({
      status: "OBSERVATION_ONLY",
      cause: "DECISION_EVIDENCE_UNRESOLVED",
    });
  });

  it("observed facts alone link, and say no authority stands behind them", () => {
    const uptime = record({
      evidenceId: "f",
      kind: "UPTIME",
      basis: "OBSERVED_FACT",
      producerStatus: "OBSERVED",
    });
    const pair = pairOf(link([uptime]), `WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:${String(RUPTURE)}`);
    expect(pair?.status).toBe("LINKED");
    expect(pair?.limits).toContain("NO_AUTHORITY_BACKED_EVIDENCE");
  });
});

describe("synthetic: scope and window", () => {
  it("an ability record never links a total; only whole-output evidence does", () => {
    const ability = link([record({ evidenceId: "a" })]);
    expect(pairOf(ability, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|TOTAL")?.cause).toBe(
      "NO_DECISION_EVIDENCE_IN_SCOPE",
    );
    const whole = link([
      record({
        evidenceId: "w",
        kind: "ENCOUNTER_ACTIONABILITY",
        producerStatus: "NOT_ACTIONABLE",
        interval: { startMs: 1000, endMs: 1500 },
        scope: { kind: "WHOLE_OUTPUT" },
      }),
    ]);
    expect(pairOf(whole, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|TOTAL")?.status).toBe("LINKED");
    expect(pairOf(whole, `WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:${String(RUPTURE)}`)?.status).toBe(
      "LINKED",
    );
  });

  it("source, ability and target-class scopes match only their own components", () => {
    const result = link([
      record({
        evidenceId: "pet-ability",
        scope: { kind: "ABILITY", sourceKind: "SYNTHETIC_PET", abilityGameIds: [RUPTURE] },
      }),
      record({
        evidenceId: "boss",
        kind: "TARGET_CHOICE",
        scope: { kind: "TARGET_CLASS", targetClass: "BOSS_SUBTYPE" },
      }),
      record({
        evidenceId: "pet",
        kind: "COOLDOWN_ALIGNMENT",
        scope: { kind: "SOURCE", sourceKind: "SYNTHETIC_PET" },
      }),
    ]);
    // A pet-scoped Rupture record is not the focus's Rupture.
    expect(
      componentOf(result, `WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:${String(RUPTURE)}`)
        .resolvedEvidenceIds,
    ).toEqual([]);
    expect(
      componentOf(result, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_TARGET_CLASS:BOSS_SUBTYPE").resolvedEvidenceIds,
    ).toEqual(["boss"]);
    expect(pairOf(result, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_TARGET_CLASS:BOSS_SUBTYPE")?.status).toBe(
      "LINKED",
    );
    expect(
      componentOf(result, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_TARGET_CLASS:NON_BOSS_NPC").resolvedEvidenceIds,
    ).toEqual([]);
    // A source record reaches the source and its abilities.
    expect(
      componentOf(result, "WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_SOURCE:SYNTHETIC_PET").resolvedEvidenceIds,
    ).toEqual(["pet"]);
    expect(
      componentOf(result, `WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:SYNTHETIC_PET:${String(PET_BITE)}`)
        .resolvedEvidenceIds,
    ).toEqual(["pet"]);
  });

  it("a record links only the windows it meets: half-open, an instant at the end is outside", () => {
    const result = link([
      record({ evidenceId: "inside", interval: { startMs: 1200, endMs: 1200 } }),
      record({ evidenceId: "at-end", interval: { startMs: 1500, endMs: 1500 } }),
      record({ evidenceId: "late", interval: { startMs: 3000, endMs: 4000 } }),
      record({ evidenceId: "overlap", interval: { startMs: 1400, endMs: 2000 } }),
    ]);
    expect(
      componentOf(result, `EARLY|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:${String(RUPTURE)}`).resolvedEvidenceIds,
    ).toEqual(["inside", "overlap"]);
    expect(
      componentOf(result, `WHOLE_FIGHT|DAMAGE_EVENT_COUNT|BY_ABILITY:FOCUS:${String(RUPTURE)}`)
        .resolvedEvidenceIds,
    ).toEqual(["inside", "overlap", "at-end", "late"]);
  });

  it("a record that meets no component is listed, never dropped", () => {
    const result = link([
      record({ evidenceId: "other", scope: { kind: "ABILITY", sourceKind: "FOCUS", abilityGameIds: [999] } }),
    ]);
    expect(linked(result).evidenceInNoComponent).toEqual(["other"]);
  });
});

describe("synthetic: refusals", () => {
  it.each([
    ["DUPLICATE_EVIDENCE_ID", [record({ evidenceId: "x" }), record({ evidenceId: "x" })]],
    ["EVIDENCE_NOT_FROM_SUBJECT_FIGHT", [record({ evidenceId: "x", fightRef: "C1" })]],
    ["UNKNOWN_EVIDENCE_KIND", [record({ evidenceId: "x", kind: "TOP_LOG_BEHAVIOR" as never })]],
    ["INVALID_EVIDENCE_INTERVAL", [record({ evidenceId: "x", interval: { startMs: 1300, endMs: 1200 } })]],
    ["INVALID_EVIDENCE_INTERVAL", [record({ evidenceId: "x", interval: { startMs: 1200.5, endMs: 1300 } })]],
    [
      "EVIDENCE_OUTSIDE_SUBJECT_FIGHT",
      [record({ evidenceId: "x", interval: { startMs: 4000, endMs: 6000 } })],
    ],
    [
      "EMPTY_ABILITY_SCOPE",
      [record({ evidenceId: "x", scope: { kind: "ABILITY", sourceKind: "FOCUS", abilityGameIds: [] } })],
    ],
    [
      "OBSERVED_FACT_CANNOT_LACK_AUTHORITY",
      [record({ evidenceId: "x", basis: "OBSERVED_FACT", resolution: "NO_AUTHORITY_AVAILABLE" })],
    ],
  ])("%s", (reason, evidence) => {
    expect(link(evidence as DecisionEvidenceRecord[])).toMatchObject({ kind: "REFUSED", reason });
  });

  it("a refused decomposition refuses the linkage", () => {
    expect(link([], [{ ...EARLY, windowId: "WHOLE_FIGHT" }])).toEqual({
      kind: "REFUSED",
      reason: "DECOMPOSITION_REFUSED",
      decomposition: "RESERVED_WINDOW_ID",
    });
  });
});
