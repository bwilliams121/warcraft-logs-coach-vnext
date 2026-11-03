/**
 * M12-D: the Restoration Shaman evaluator (src/specs/shaman/restoration/).
 *
 * The negative cases matter most:
 * - no raid plan is NO_AUTHORITY_AVAILABLE, never UNKNOWN, and is never
 *   filled in from what the player or another healer cast;
 * - per-cast spell choice is NO_AUTHORITY_AVAILABLE whatever was cast;
 * - an assignment with no cast in its window is UNKNOWN, never a miss: the
 *   pinned data proves no readiness, and a coverage gap is not inactivity;
 * - only the player's own completed cast is a cooldown use: not a begincast,
 *   not an aura of the same id, not another player's cast, not the totem's;
 * - overlap with damage episodes needs the declared FULL_RAID roster, and an
 *   overlap carries no verdict;
 * - a wrong or contradictory identity stops evaluation.
 *
 * The last block reads the committed real evidence: actor 122's casts over
 * the whole of b1PmaKrd6CDfzngc fight 48, with the committed fight context
 * establishing its class and specialization. Its expected values were derived
 * from the raw artifact bytes independently of the evaluator.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { inclusiveRange } from "../../../src/engine/evidence/coverage.js";
import type { CombatActor } from "../../../src/engine/normalization/actors.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import type { CategoryEvidence } from "../../../src/engine/normalization/completeness.js";
import { createNormalizer } from "../../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../../src/engine/normalization/supported-families.js";
import {
  parseRestorationShamanHealingCooldowns,
  pinnedRestorationShamanHealingCooldowns,
} from "../../../src/data/game/shaman-restoration-healing-cooldowns.js";
import artifactJson from "../../../src/data/game/shaman-restoration-healing-cooldowns.json";
import type {
  PlannedTime,
  RaidCooldownAssignment,
  RaidCooldownPlan,
} from "../../../src/raid-plan/raid-cooldown-plan.js";
import {
  evaluateRestorationShaman,
  type AssignmentResult,
  type RestorationShamanEvaluation,
} from "../../../src/specs/shaman/restoration/evaluator.js";
import type { EvidenceCategory } from "../../../src/wcl/evidence-capability.js";
import type { FightIdentity } from "../../../src/wcl/types.js";
import { loadCommittedEvidenceArchive } from "../../support/corpus/evidence-archive.js";
import { bundleOf } from "../../support/corpus/fight.js";
import {
  absentCategory,
  observableCategory,
  partialCategory,
  syntheticFight,
} from "../../support/synthetic-fight.js";

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 100_000;
const SHAMAN = 122;
const TOTEM = 139;
const OTHER_HEALER = 9;
const BOSS = 161;
const ROSTER = [5, OTHER_HEALER, SHAMAN] as const;
const WHOLE = inclusiveRange(START, END);
const SLT = 98008;
const ASCENDANCE = 114052;
const CHAIN_HEAL = 1064;

/** Roster names, letters only. The subject's is the identity's `player.name`. */
const NAMES: Readonly<Record<number, string>> = {
  5: "Warrior",
  [OTHER_HEALER]: "Priest",
  [SHAMAN]: "Subject",
};

const actor = (actorId: number, subType: string, rawType = "Player", petOwnerActorId: number | null = null) =>
  ({
    actorId,
    gameId: null,
    name: NAMES[actorId] ?? null,
    server: null,
    actorType: rawType === "Player" ? "PLAYER" : rawType === "Pet" ? "PET" : "NPC",
    rawType,
    subType,
    petOwnerActorId,
  }) satisfies CombatActor;

const ACTORS = new Map<number, CombatActor>([
  [5, actor(5, "Warrior")],
  [OTHER_HEALER, actor(OTHER_HEALER, "Priest")],
  [SHAMAN, actor(SHAMAN, "Shaman")],
  [TOTEM, actor(TOTEM, "Pet", "Pet", SHAMAN)],
  [BOSS, actor(BOSS, "Boss", "NPC")],
]);

function identityFor(fight: CombatFight, overrides: Partial<FightIdentity["player"]> = {}): FightIdentity {
  return {
    report: { code: fight.report.code, revision: 1, startTime: 0, endTime: 0 },
    data: { logVersion: 17, gameVersion: 1 },
    fight: {
      id: fight.fight.id,
      name: fight.fight.name,
      encounterId: fight.fight.encounterId,
      difficulty: fight.fight.difficulty,
      startTime: fight.fight.startTimeMs,
      endTime: fight.fight.endTimeMs,
    },
    player: { sourceId: SHAMAN, name: "Subject", className: "Shaman", specName: "Restoration", ...overrides },
  };
}

function fightOf(
  raw: readonly Raw[],
  options: {
    readonly scope?: "PLAYER_CONTEXT" | "FULL_RAID";
    readonly categories?: Partial<Record<EvidenceCategory, CategoryEvidence>>;
    readonly actors?: ReadonlyMap<number, CombatActor>;
    readonly finality?: "COMPLETED" | "IN_PROGRESS";
  } = {},
): CombatFight {
  const normalizer = createNormalizer({
    fightStartTimeMs: START,
    requestedRange: WHOLE,
    contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: START,
    nextPageTimestamp: null,
    events: raw,
  });
  const output = normalizer.finish();
  return syntheticFight({
    events: output.events,
    malformedObservations: output.malformedObservations,
    startTimeMs: START,
    endTimeMs: END,
    categories: {
      CASTS: observableCategory(WHOLE, null),
      DAMAGE: observableCategory(WHOLE, null),
      HEALING: observableCategory(WHOLE, null),
      ABSORBS: observableCategory(WHOLE, null),
      ...options.categories,
    },
    actors: options.actors ?? ACTORS,
    scope: options.scope ?? "FULL_RAID",
    friendlyActorsInScope: ROSTER,
    ...(options.finality === undefined ? {} : { finality: options.finality }),
  });
}

const cast = (timestamp: number, source: number, ability: number, type = "cast"): Raw => ({
  timestamp,
  type,
  sourceID: source,
  targetID: -1,
  abilityGameID: ability,
  fight: 48,
});
const buff = (timestamp: number, ability: number): Raw => ({
  timestamp,
  type: "applybuff",
  sourceID: SHAMAN,
  targetID: SHAMAN,
  abilityGameID: ability,
  fight: 48,
});
const hit = (timestamp: number, target: number, ability = 100): Raw => ({
  timestamp,
  type: "damage",
  sourceID: BOSS,
  targetID: target,
  abilityGameID: ability,
  fight: 48,
  hitType: 1,
  amount: 10_000,
});
const heal = (timestamp: number, source: number, target: number): Raw => ({
  timestamp,
  type: "heal",
  sourceID: source,
  targetID: target,
  abilityGameID: 425804,
  fight: 48,
  hitType: 1,
  amount: 5_000,
});

function evaluated(result: RestorationShamanEvaluation) {
  if (result.state !== "EVALUATED") throw new Error(`expected EVALUATED, got ${result.state}`);
  return result;
}

/** The synthetic fight's encounter (tests/support/synthetic-fight.ts). */
const ENCOUNTER = { encounterId: 2900, difficulty: 5 };

/** A pull-relative plan entry, written in report time for readability. */
const assign = (
  plannedReportTimeMs: number,
  toleranceMs = 2_000,
  overrides: {
    readonly assignmentId?: string;
    readonly abilityId?: number;
    readonly name?: string;
    readonly plannedTime?: PlannedTime;
  } = {},
  fightStartMs = START,
): RaidCooldownAssignment => ({
  assignmentId: overrides.assignmentId ?? `a-${String(plannedReportTimeMs)}`,
  player: { name: overrides.name ?? "Subject", realm: null },
  abilityId: overrides.abilityId ?? SLT,
  plannedTime: overrides.plannedTime ?? {
    kind: "FIGHT_RELATIVE",
    offsetMs: plannedReportTimeMs - fightStartMs,
  },
  toleranceMs,
  toleranceSource: "ASSIGNMENT",
  source: { lineNumber: null, index: 0, rawLine: null },
  context: { bossSpellId: null },
});

const planOf = (
  assignments: readonly RaidCooldownAssignment[],
  encounter: RaidCooldownPlan["encounter"] = ENCOUNTER,
): RaidCooldownPlan => ({
  schema: "raid-cooldown-plan/1",
  authority: "USER_PROVIDED_RAID_PLAN",
  encounter,
  source: { format: "STRUCTURED", label: "test plan" },
  tolerance: { defaultToleranceMs: null },
  assignments,
  importDiagnostics: [],
});

/** Evaluates a plan bound to the fight's own encounter. */
function resultsOf(
  fight: CombatFight,
  assignments: readonly RaidCooldownAssignment[],
  identity: FightIdentity = identityFor(fight),
): readonly AssignmentResult[] {
  const encounter = { encounterId: fight.fight.encounterId, difficulty: fight.fight.difficulty ?? -1 };
  const result = evaluated(
    evaluateRestorationShaman({ fight, identity, plan: planOf(assignments, encounter) }),
  );
  if (result.assignment.status !== "EVALUATED") throw new Error("expected an evaluated plan");
  return result.assignment.results;
}

describe("the pinned healing-cooldown identity", () => {
  it("loads three spec-264 entries, each its own verbatim trait row", () => {
    const loaded = pinnedRestorationShamanHealingCooldowns();
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(loaded.cooldowns.map((entry) => [entry.abilityGameId, entry.nodeType])).toEqual([
      [SLT, "NORMAL"],
      [ASCENDANCE, "CHOICE"],
      [108280, "CHOICE"],
    ]);
  });

  it("claims nothing about cooldown, charges or duration", () => {
    for (const entry of artifactJson.healingCooldowns) {
      for (const key of Object.keys(entry)) expect(key).not.toMatch(/cooldownMs|charge|duration/i);
    }
  });

  it("fails closed on a row that is not the identity it claims", () => {
    const tampered = structuredClone(artifactJson);
    const [first] = tampered.healingCooldowns;
    if (first === undefined) throw new Error("no entry");
    first.abilityGameId = 98007;
    expect(parseRestorationShamanHealingCooldowns(tampered)).toEqual({
      ok: false,
      reason: "PINNED_ROW_MISMATCH",
    });
    const incoherent = structuredClone(artifactJson);
    incoherent.healingCooldowns[1]!.choiceSiblingAbilityGameIds = [];
    expect(parseRestorationShamanHealingCooldowns(incoherent)).toEqual({
      ok: false,
      reason: "CHOICE_SIBLINGS_INCOHERENT",
    });
  });

  it("unusable runtime data stops evaluation rather than evaluating with none", () => {
    const fight = fightOf([cast(10_000, SHAMAN, SLT)]);
    expect(
      evaluateRestorationShaman({
        fight,
        identity: identityFor(fight),
        plan: null,
        dataset: { ok: false, reason: "PINNED_ROW_MISMATCH" },
      }),
    ).toMatchObject({ state: "RUNTIME_DATA_UNAVAILABLE", reason: "PINNED_ROW_MISMATCH" });
  });
});

describe("identity is validated before any evaluation", () => {
  const fight = fightOf([cast(10_000, SHAMAN, SLT)]);

  it.each([
    ["another specialization", identityFor(fight, { specName: "Elemental" }), "NOT_THIS_SPECIALIZATION"],
    ["another class", identityFor(fight, { className: "Priest" }), "NOT_THIS_SPECIALIZATION"],
    ["an actor the fight does not list", identityFor(fight, { sourceId: 999 }), "IDENTITY_UNRESOLVED"],
    [
      "an actor the fight lists as another class",
      identityFor(fight, { sourceId: OTHER_HEALER }),
      "IDENTITY_CONFLICT",
    ],
    [
      "another fight",
      { ...identityFor(fight), fight: { ...identityFor(fight).fight, id: 7 } },
      "IDENTITY_MISMATCH",
    ],
  ] as const)("%s is refused, with nothing evaluated", (_label, identity, reason) => {
    const result = evaluateRestorationShaman({ fight, identity, plan: null });
    expect(result).toEqual({ revision: "restoration-shaman-evaluator/2", state: "IDENTITY_REFUSED", reason });
  });
});

describe("no authority means NO_AUTHORITY_AVAILABLE, never UNKNOWN and never an inferred verdict", () => {
  // The player AND another healer cast Spirit Link Totem: still no assignment.
  const fight = fightOf([
    cast(10_000, SHAMAN, SLT),
    cast(10_000, OTHER_HEALER, SLT),
    cast(20_000, SHAMAN, CHAIN_HEAL),
  ]);
  const result = evaluated(evaluateRestorationShaman({ fight, identity: identityFor(fight), plan: null }));

  it("ASSIGNMENT without a plan", () => {
    expect(result.assignment).toEqual({
      category: "ASSIGNMENT",
      status: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_RAID_COOLDOWN_PLAN",
    });
  });

  it("HEALING_DECISION, whatever was cast", () => {
    expect(result.healingDecision).toEqual({
      category: "HEALING_DECISION",
      status: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_APPROVED_PER_CAST_HEALER_MODEL",
    });
  });

  it("emits no failure vocabulary anywhere", () => {
    expect(JSON.stringify(result)).not.toMatch(/MISSED|EARLY|LATE|INCORRECT|FAIL|SHOULD/);
  });
});

describe("a cooldown use is the player's own completed cast, and nothing else", () => {
  const raw = [
    cast(9_000, SHAMAN, ASCENDANCE, "begincast"), // a begincast is not a use
    buff(9_500, ASCENDANCE), // an aura of the same id is not a use
    cast(10_000, SHAMAN, ASCENDANCE),
    cast(11_000, OTHER_HEALER, SLT), // another player's cast is not this player's use
    cast(11_500, TOTEM, 325174), // the totem's own pulse is not the player's use
    cast(12_000, SHAMAN, CHAIN_HEAL), // not an identified healing cooldown
    cast(40_000, SHAMAN, SLT),
  ];

  it("lists exactly the identified casts, COMPLETE under COMPLETE cast coverage", () => {
    const result = evaluated(
      evaluateRestorationShaman({ fight: fightOf(raw), identity: identityFor(fightOf(raw)), plan: null }),
    );
    expect(result.cooldowns.listing).toEqual({ state: "COMPLETE" });
    expect(result.cooldowns.uses.map((use) => [use.cast.abilityGameId, use.cast.reportTimeMs])).toEqual([
      [ASCENDANCE, 10_000],
      [SLT, 40_000],
    ]);
    expect(result.cooldowns.subjectSources).toEqual([SHAMAN, TOTEM]);
  });

  it("a cast-coverage gap makes the listing UNKNOWN, not 'these were all of them'", () => {
    const categories = {
      CASTS: partialCategory([inclusiveRange(START, 50_000), inclusiveRange(60_000, END)]),
    };
    const fight = fightOf(raw, { categories });
    const result = evaluated(evaluateRestorationShaman({ fight, identity: identityFor(fight), plan: null }));
    expect(result.cooldowns.listing).toEqual({
      state: "UNKNOWN",
      reason: "INSUFFICIENT_COVERAGE",
      unidentifiedCasts: 0,
    });
    expect(result.cooldowns.uses).toHaveLength(2);
  });

  it("a completed cast of the player with no ability id could be a cooldown: the listing is UNKNOWN", () => {
    const anonymous: Raw = cast(20_000, SHAMAN, 0);
    delete anonymous["abilityGameID"];
    const fight = fightOf([...raw, anonymous]);
    const result = evaluated(evaluateRestorationShaman({ fight, identity: identityFor(fight), plan: null }));
    expect(result.cooldowns.listing).toEqual({
      state: "UNKNOWN",
      reason: "UNIDENTIFIED_SUBJECT_CAST",
      unidentifiedCasts: 1,
    });
    // The known uses are kept.
    expect(result.cooldowns.uses.map((use) => use.cast.reportTimeMs)).toEqual([10_000, 40_000]);
    // Control: another player's ability-less cast does not touch this player's listing.
    const others: Raw = cast(20_000, OTHER_HEALER, 0);
    delete others["abilityGameID"];
    const control = fightOf([...raw, others]);
    expect(
      evaluated(evaluateRestorationShaman({ fight: control, identity: identityFor(control), plan: null }))
        .cooldowns.listing,
    ).toEqual({ state: "COMPLETE" });
  });
});

describe("only casts inside the encounter count, its bounds inclusive", () => {
  // The normalizer keeps out-of-range events (flagged, not clamped); the evaluator must not use them.
  const raw = [
    cast(START - 500, SHAMAN, SLT), // before the pull
    cast(START, SHAMAN, ASCENDANCE), // exactly at the start: in
    cast(END, SHAMAN, SLT), // exactly at the end: in
    cast(END + 500, SHAMAN, ASCENDANCE), // after the kill
  ];
  const fight = fightOf(raw);

  it("lists the boundary casts and neither outside one", () => {
    const result = evaluated(evaluateRestorationShaman({ fight, identity: identityFor(fight), plan: null }));
    expect(result.cooldowns.uses.map((use) => [use.cast.abilityGameId, use.cast.reportTimeMs])).toEqual([
      [ASCENDANCE, START],
      [SLT, END],
    ]);
  });

  it("an outside cast never meets an assignment; a boundary cast does", () => {
    const results = resultsOf(fight, [
      assign(START - 500, 100, { assignmentId: "pre-pull" }),
      assign(END + 500, 100, { assignmentId: "post-kill", abilityId: ASCENDANCE }),
      assign(START, 0, { assignmentId: "at-start", abilityId: ASCENDANCE }),
      assign(END, 0, { assignmentId: "at-end" }),
    ]);
    expect(results.map((entry) => [entry.assignment.assignmentId, entry.status])).toEqual([
      ["pre-pull", "ASSIGNMENT_UNKNOWN"],
      ["post-kill", "ASSIGNMENT_NOT_ACTIONABLE"],
      ["at-start", "ASSIGNMENT_MET"],
      ["at-end", "ASSIGNMENT_MET"],
    ]);
  });
});

describe("overlap with damage episodes is observation, over the declared roster only", () => {
  const raw = [
    cast(10_000, SHAMAN, SLT),
    hit(11_000, 5),
    hit(11_200, OTHER_HEALER),
    heal(11_300, SHAMAN, 5),
    heal(11_400, TOTEM, 5), // the player's stated pet
    heal(11_500, OTHER_HEALER, 5), // another healer: not the player's
    hit(30_000, 5, 200), // outside the reporting span
  ];

  it("under PLAYER_CONTEXT there is no overlap list at all, not an empty one", () => {
    const fight = fightOf(raw, { scope: "PLAYER_CONTEXT" });
    const result = evaluated(evaluateRestorationShaman({ fight, identity: identityFor(fight), plan: null }));
    expect(result.cooldowns.uses[0]?.overlap).toEqual({
      state: "ROSTER_NOT_IN_SCOPE",
      scope: "PLAYER_CONTEXT",
    });
  });

  it("under FULL_RAID lists the overlapping episode with the player's own and pet's entries", () => {
    const fight = fightOf(raw);
    const result = evaluated(evaluateRestorationShaman({ fight, identity: identityFor(fight), plan: null }));
    const overlap = result.cooldowns.uses[0]?.overlap;
    if (overlap?.state !== "RECONSTRUCTED") throw new Error("expected an overlap");
    expect(overlap.spanMs).toBe(10_000);
    expect(overlap.episodes.map((episode) => [episode.episodeAbilityGameId, episode.firstHitMs])).toEqual([
      [100, 11_000],
    ]);
    expect(overlap.episodes[0]?.players).toEqual([
      {
        actorId: 5,
        entriesFromSubject: 2,
        coverage: { HEALING: { state: "COMPLETE" }, ABSORBS: { state: "COMPLETE" } },
      },
      {
        actorId: OTHER_HEALER,
        entriesFromSubject: 0,
        coverage: { HEALING: { state: "COMPLETE" }, ABSORBS: { state: "COMPLETE" } },
      },
    ]);
  });

  it("a wider span reports the later episode too; the span is a parameter, not a judgement", () => {
    const fight = fightOf(raw);
    const result = evaluated(
      evaluateRestorationShaman({ fight, identity: identityFor(fight), plan: null, overlapSpanMs: 25_000 }),
    );
    const overlap = result.cooldowns.uses[0]?.overlap;
    expect(overlap?.state === "RECONSTRUCTED" ? overlap.episodes.length : null).toBe(2);
    expect(() =>
      evaluateRestorationShaman({ fight, identity: identityFor(fight), plan: null, overlapSpanMs: -1 }),
    ).toThrow(RangeError);
  });
});

describe("an empty overlap list means 'no overlap' only when its own coverage says so", () => {
  const overlapOfOnly = (fight: CombatFight) => {
    const result = evaluated(evaluateRestorationShaman({ fight, identity: identityFor(fight), plan: null }));
    const overlap = result.cooldowns.uses[0]?.overlap;
    if (overlap?.state !== "RECONSTRUCTED") throw new Error("expected an overlap");
    return overlap;
  };

  it("control: no damage near the cast, every roster player covered: COMPLETE and empty", () => {
    const overlap = overlapOfOnly(fightOf([cast(40_000, SHAMAN, SLT), hit(80_000, 5)]));
    expect(overlap.episodes).toEqual([]);
    expect(overlap.listing).toEqual({ state: "COMPLETE" });
  });

  it("absent DAMAGE evidence: UNKNOWN for every roster player, never an established 'no overlap'", () => {
    const overlap = overlapOfOnly(
      fightOf([cast(40_000, SHAMAN, SLT)], { categories: { DAMAGE: absentCategory() } }),
    );
    expect(overlap.episodes).toEqual([]);
    expect(overlap.listing).toMatchObject({
      state: "UNKNOWN",
      beyondFightEdge: false,
      unidentifiedHitsInSpan: 0,
    });
    expect(
      overlap.listing.state === "UNKNOWN" ? overlap.listing.uncoveredActors.map((each) => each.actorId) : [],
    ).toEqual([...ROSTER]);
  });

  it("a coverage gap inside the span: UNKNOWN, the observed episodes still listed", () => {
    const categories = {
      DAMAGE: partialCategory([inclusiveRange(START, 45_000), inclusiveRange(47_000, END)]),
    };
    const overlap = overlapOfOnly(fightOf([cast(40_000, SHAMAN, SLT), hit(41_000, 5)], { categories }));
    expect(overlap.episodes.map((episode) => episode.firstHitMs)).toEqual([41_000]);
    expect(overlap.listing).toMatchObject({ state: "UNKNOWN" });
    expect(overlap.listing.state === "UNKNOWN" ? overlap.listing.uncoveredActors : []).toEqual(
      ROSTER.map((actorId) => ({ actorId, reason: "INSUFFICIENT_COVERAGE" })),
    );
  });

  it("an uncertain boundary just before the span: a gap inside the grouping margin is UNKNOWN", () => {
    // The episode's last observed hit is 1.5 s before the cast. Unseen hits in
    // the gap could carry it into the span, so its absence there is unproven.
    const categories = {
      DAMAGE: partialCategory([inclusiveRange(START, 38_600), inclusiveRange(39_500, END)]),
    };
    const overlap = overlapOfOnly(fightOf([cast(40_000, SHAMAN, SLT), hit(38_500, 5)], { categories }));
    expect(overlap.episodes).toEqual([]);
    expect(overlap.listing.state).toBe("UNKNOWN");
    // With the margin covered, the same episode is proven not to reach the span.
    const covered = overlapOfOnly(fightOf([cast(40_000, SHAMAN, SLT), hit(37_500, 5)]));
    expect([covered.episodes, covered.listing]).toEqual([[], { state: "COMPLETE" }]);
  });

  it("an ability-less roster hit in the widened span could be an unlisted episode: UNKNOWN", () => {
    const anonymous: Raw = { ...hit(43_000, 5) };
    delete anonymous["abilityGameID"];
    const overlap = overlapOfOnly(fightOf([cast(40_000, SHAMAN, SLT), anonymous]));
    expect(overlap.listing).toMatchObject({
      state: "UNKNOWN",
      unidentifiedHitsInSpan: 1,
      uncoveredActors: [],
    });
  });

  it("a span running past the fight's end is UNKNOWN (beyondFightEdge), as for M12-B episodes", () => {
    const overlap = overlapOfOnly(fightOf([cast(95_000, SHAMAN, SLT)]));
    expect(overlap.listing).toMatchObject({ state: "UNKNOWN", beyondFightEdge: true, uncoveredActors: [] });
  });
});

describe("assignment execution under a supplied plan", () => {
  const raw = [cast(10_000, SHAMAN, SLT), cast(70_000, SHAMAN, SLT), cast(30_000, SHAMAN, CHAIN_HEAL)];

  it("MET: the player's own cast inside the window, with that cast as the actionability proof", () => {
    const [met] = resultsOf(fightOf(raw), [assign(12_000)]);
    expect(met).toMatchObject({
      status: "ASSIGNMENT_MET",
      window: { fromReportTimeMs: 10_000, toReportTimeMs: 14_000 },
      cast: { abilityGameId: SLT, reportTimeMs: 10_000 },
      actionability: { status: "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION", abilityGameId: SLT },
    });
  });

  it("no cast in a COMPLETE window is UNKNOWN (readiness not established), never MISSED", () => {
    const [result] = resultsOf(fightOf(raw), [assign(40_000)]);
    expect(result).toEqual({
      status: "ASSIGNMENT_UNKNOWN",
      assignment: expect.objectContaining({
        assignmentId: "a-40000",
        abilityGameId: SLT,
        toleranceMs: 2_000,
      }),
      reason: "READINESS_NOT_ESTABLISHED",
      resolution: null,
      nearestObservedCasts: {
        before: expect.objectContaining({ reportTimeMs: 10_000 }),
        after: expect.objectContaining({ reportTimeMs: 70_000 }),
      },
    });
  });

  it("a cast just outside the tolerance is context, never early or late", () => {
    const [result] = resultsOf(fightOf(raw), [assign(12_001)]);
    expect(result?.status).toBe("ASSIGNMENT_UNKNOWN");
  });

  it("a retrieval gap over the window is the gate's reason, not inactivity", () => {
    const categories = {
      CASTS: partialCategory([inclusiveRange(START, 35_000), inclusiveRange(50_000, END)]),
    };
    const [result] = resultsOf(fightOf(raw, { categories }), [assign(40_000)]);
    expect(result).toMatchObject({ status: "ASSIGNMENT_UNKNOWN", reason: "INSUFFICIENT_COVERAGE" });
  });

  it("an ability-less cast of the player in the window is named, not read as no cast", () => {
    const anonymous: Raw = cast(40_500, SHAMAN, 0);
    delete anonymous["abilityGameID"];
    const [result] = resultsOf(fightOf([...raw, anonymous]), [assign(40_000)]);
    expect(result).toMatchObject({ status: "ASSIGNMENT_UNKNOWN", reason: "UNIDENTIFIED_SUBJECT_CAST" });
  });

  it("NOT_ACTIONABLE only after a COMPLETED encounter's end; an in-progress fight is UNKNOWN", () => {
    const [ended] = resultsOf(fightOf(raw), [assign(110_000)]);
    expect(ended).toMatchObject({
      status: "ASSIGNMENT_NOT_ACTIONABLE",
      reason: "ENCOUNTER_ENDED_BEFORE_WINDOW",
      fightEndReportTimeMs: END,
    });
    const [open] = resultsOf(fightOf(raw, { finality: "IN_PROGRESS" }), [assign(110_000)]);
    expect(open).toMatchObject({ status: "ASSIGNMENT_UNKNOWN", reason: "WINDOW_OUTSIDE_FIGHT" });
  });

  it("an invalid hand-built entry is UNKNOWN, never evaluated", () => {
    const [bad] = resultsOf(fightOf(raw), [assign(30_000, -1, { assignmentId: "bad" })]);
    expect(bad).toMatchObject({ status: "ASSIGNMENT_UNKNOWN", reason: "ASSIGNMENT_INVALID" });
  });

  it("the player's entry for an ability it does not identify is listed, never evaluated or reinterpreted", () => {
    const fight = fightOf(raw);
    const result = evaluated(
      evaluateRestorationShaman({
        fight,
        identity: identityFor(fight),
        // Chain Heal is cast in the window, and Wind Shear is a kick: neither is a registered healing cooldown.
        plan: planOf([
          assign(30_000, 2_000, { abilityId: CHAIN_HEAL, assignmentId: "chain" }),
          assign(30_000, 2_000, { abilityId: 57994, assignmentId: "kick" }),
        ]),
      }),
    );
    if (result.assignment.status !== "EVALUATED") throw new Error("expected an evaluated plan");
    expect(result.assignment.results).toEqual([]);
    expect(
      result.assignment.notEvaluated.map((entry) => [entry.assignment.assignmentId, entry.reason]),
    ).toEqual([
      ["chain", "ABILITY_NOT_REGISTERED"],
      ["kick", "ABILITY_NOT_REGISTERED"],
    ]);
  });

  it("another player's entries are counted, not evaluated, and never become this player's", () => {
    const fight = fightOf(raw);
    const result = evaluated(
      evaluateRestorationShaman({
        fight,
        identity: identityFor(fight),
        plan: planOf([assign(12_000, 2_000, { name: "Priest" })]),
      }),
    );
    expect(result.assignment).toEqual({
      category: "ASSIGNMENT",
      status: "EVALUATED",
      authority: { kind: "USER_PROVIDED_RAID_PLAN", format: "STRUCTURED", label: "test plan" },
      results: [],
      notEvaluated: [],
      assignmentsForOtherPlayers: 1,
    });
  });
});

describe("the supplied plan is the only authority, bound to this fight (M12-E)", () => {
  const raw = [cast(10_000, SHAMAN, SLT)];

  it("a plan for another encounter or difficulty is NO_AUTHORITY_AVAILABLE, never applied", () => {
    const fight = fightOf(raw);
    for (const encounter of [
      { encounterId: 3429, difficulty: 5 },
      { encounterId: 2900, difficulty: 4 },
    ]) {
      const result = evaluated(
        evaluateRestorationShaman({
          fight,
          identity: identityFor(fight),
          plan: planOf([assign(12_000)], encounter),
        }),
      );
      expect(result.assignment).toEqual({
        category: "ASSIGNMENT",
        status: "NO_AUTHORITY_AVAILABLE",
        reason: "PLAN_NOT_FOR_THIS_FIGHT",
        binding: { state: "MISMATCHED", planned: encounter, observed: ENCOUNTER },
      });
    }
  });

  it("a fight with no reported difficulty cannot be bound: UNKNOWN, not NO_AUTHORITY_AVAILABLE", () => {
    const base = fightOf(raw);
    const fight: CombatFight = { ...base, fight: { ...base.fight, difficulty: null } };
    const result = evaluated(
      evaluateRestorationShaman({ fight, identity: identityFor(fight), plan: planOf([assign(12_000)]) }),
    );
    expect(result.assignment).toEqual({
      category: "ASSIGNMENT",
      status: "UNKNOWN",
      reason: "ENCOUNTER_BINDING_UNKNOWN",
      binding: { state: "UNKNOWN", reason: "FIGHT_DIFFICULTY_NOT_REPORTED" },
    });
  });

  it("a phase-relative entry is UNKNOWN: no phase boundary is guessed, even with the cast right there", () => {
    const [result] = resultsOf(fightOf(raw), [
      assign(10_000, 2_000, { plannedTime: { kind: "PHASE_RELATIVE", phase: "1", offsetMs: 9_000 } }),
    ]);
    expect(result).toMatchObject({
      status: "ASSIGNMENT_UNKNOWN",
      reason: "PLANNED_TIME_UNRESOLVED",
      resolution: { state: "UNRESOLVED", reason: "PHASE_LABEL_NOT_MAPPED" },
      nearestObservedCasts: { before: null, after: null },
    });
  });

  it("a name that may be this player's but is not uniquely resolved is UNKNOWN, never MET", () => {
    const twins = new Map(ACTORS);
    twins.set(5, { ...actor(5, "Warrior"), name: "subject" });
    const [ambiguous] = resultsOf(fightOf(raw, { actors: twins }), [assign(10_000)]);
    expect(ambiguous).toMatchObject({
      status: "ASSIGNMENT_UNKNOWN",
      reason: "PLAYER_NOT_RESOLVED",
      resolution: { state: "UNRESOLVED", reason: "AMBIGUOUS", candidateActorIds: [5, SHAMAN] },
    });
    const [unscoped] = resultsOf(fightOf(raw, { scope: "PLAYER_CONTEXT" }), [assign(10_000)]);
    expect(unscoped).toMatchObject({
      status: "ASSIGNMENT_UNKNOWN",
      reason: "PLAYER_NOT_RESOLVED",
      resolution: { reason: "ROSTER_NOT_IN_SCOPE" },
    });
  });

  it("this player's own name with no name in the roster is UNKNOWN, never another player's entry", () => {
    const unnamed = new Map(ACTORS);
    unnamed.set(SHAMAN, { ...actor(SHAMAN, "Shaman"), name: null });
    const fight = fightOf(raw, { actors: unnamed });
    const result = evaluated(
      evaluateRestorationShaman({ fight, identity: identityFor(fight), plan: planOf([assign(10_000)]) }),
    );
    if (result.assignment.status !== "EVALUATED") throw new Error("expected an evaluated plan");
    expect(result.assignment.assignmentsForOtherPlayers).toBe(0);
    expect(result.assignment.results).toEqual([
      expect.objectContaining({
        status: "ASSIGNMENT_UNKNOWN",
        reason: "PLAYER_NOT_RESOLVED",
        resolution: { state: "UNRESOLVED", reason: "ROSTER_NAMES_INCOMPLETE", candidateActorIds: [] },
      }),
    ]);
  });

  it("names match case-insensitively but never across diacritics", () => {
    const [cased] = resultsOf(fightOf(raw), [assign(10_000, 2_000, { name: "SUBJECT" })]);
    expect(cased?.status).toBe("ASSIGNMENT_MET");
    const fight = fightOf(raw);
    const result = evaluated(
      evaluateRestorationShaman({
        fight,
        identity: identityFor(fight),
        plan: planOf([assign(10_000, 2_000, { name: "Subjéct" })]),
      }),
    );
    if (result.assignment.status !== "EVALUATED") throw new Error("expected an evaluated plan");
    expect([result.assignment.results, result.assignment.assignmentsForOtherPlayers]).toEqual([[], 1]);
  });
});

describe("the real Restoration Shaman in the evidence archive (b1PmaKrd6CDfzngc fight 48, actor 122)", () => {
  const SEGMENTS = [
    "wcl-b1pm-fight-48-restoration-shaman-122-casts.seg-0-180",
    "wcl-b1pm-fight-48-restoration-shaman-122-casts.seg-180-345",
  ];
  const CONTEXT = "wcl-fight-context-b1pm-fight-48";
  const [FIGHT_START, FIGHT_END] = [7_436_292, 7_781_469];
  let fight: CombatFight;
  let identity: FightIdentity;
  let rawCasts: readonly Raw[];
  let roster: readonly number[];

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    const find = (id: string) => {
      const found = loaded.archive.referenceableArtifacts.find((entry) => entry.record.artifactId === id);
      if (found === undefined) throw new Error(`no artifact ${id}`);
      return found;
    };
    rawCasts = SEGMENTS.flatMap((id) => find(id).json as readonly Raw[]);
    const composed = bundleOf(loaded.archive, SEGMENTS, [], { catalogArtifactId: CONTEXT });
    // The two segments join into the whole fight with no hole.
    expect(composed.holes).toEqual([]);
    expect(composed.coveredRanges.CASTS).toEqual([
      expect.objectContaining({ fromReportTimeMs: FIGHT_START, toReportTimeMs: FIGHT_END }),
    ]);
    expect(composed.fight.breadth.scope).toBe("PLAYER_CONTEXT");
    // The specialization comes from the committed context's friendlySpecs, the class from its master data.
    const context = find(CONTEXT).json as {
      reportData: {
        report: {
          fights: {
            startTime: number;
            endTime: number;
            encounterID: number;
            difficulty: number;
            kill: boolean;
            friendlyPlayers: number[];
            friendlySpecs: string[];
          }[];
        };
      };
    };
    const fightRow = context.reportData.report.fights[0];
    if (fightRow === undefined) throw new Error("no fight");
    roster = fightRow.friendlyPlayers;
    // The composer bounds its fight by the events it holds; the encounter's
    // real bounds are the committed context's, which the grants also span.
    expect([fightRow.startTime, fightRow.endTime, fightRow.kill]).toEqual([FIGHT_START, FIGHT_END, true]);
    fight = {
      ...composed.fight,
      fight: {
        ...composed.fight.fight,
        encounterId: fightRow.encounterID,
        difficulty: fightRow.difficulty,
        startTimeMs: fightRow.startTime,
        endTimeMs: fightRow.endTime,
        durationMs: fightRow.endTime - fightRow.startTime,
      },
    };
    identity = {
      ...identityFor(fight),
      player: {
        sourceId: SHAMAN,
        name: "Subject",
        className: fight.actors.get(SHAMAN)?.subType ?? "",
        specName: fightRow.friendlySpecs[fightRow.friendlyPlayers.indexOf(SHAMAN)] ?? "",
      },
    };
  });

  it("the committed context establishes the subject as a Restoration Shaman", () => {
    expect([identity.player.className, identity.player.specName]).toEqual(["Shaman", "Restoration"]);
  });

  it("lists the four healing-cooldown casts the raw bytes hold, COMPLETE over the whole fight", () => {
    const expected = rawCasts
      .filter(
        (event) =>
          event["type"] === "cast" &&
          event["sourceID"] === SHAMAN &&
          [SLT, ASCENDANCE, 108280].includes(event["abilityGameID"] as number),
      )
      .map((event) => [event["abilityGameID"], event["timestamp"]]);
    expect(expected).toEqual([
      [ASCENDANCE, 7_469_039],
      [SLT, 7_543_726],
      [ASCENDANCE, 7_666_386],
      [SLT, 7_776_617],
    ]);
    const result = evaluated(evaluateRestorationShaman({ fight, identity, plan: null }));
    expect(result.cooldowns.listing).toEqual({ state: "COMPLETE" });
    expect(result.cooldowns.uses.map((use) => [use.cast.abilityGameId, use.cast.reportTimeMs])).toEqual(
      expected,
    );
    // Pets of 122 per the master data, never inferred from summons.
    expect(result.cooldowns.subjectSources).toEqual([122, 127, 129, 130, 134, 139, 141, 227]);
    // Cast-only evidence under PLAYER_CONTEXT: no roster, so no overlap claim at all.
    for (const use of result.cooldowns.uses) expect(use.overlap.state).toBe("ROSTER_NOT_IN_SCOPE");
    expect(result.assignment.status).toBe("NO_AUTHORITY_AVAILABLE");
    expect(result.healingDecision.status).toBe("NO_AUTHORITY_AVAILABLE");
  });

  it("a test plan over the real casts and the committed roster: met, unknown, and not actionable after the kill", () => {
    // The roster is the committed context's friendlyPlayers; the names are its master data.
    expect([fight.fight.encounterId, fight.fight.difficulty]).toEqual([3455, 5]);
    const name = fight.actors.get(SHAMAN)?.name;
    if (name === null || name === undefined) throw new Error("no name for 122");
    const rostered: CombatFight = {
      ...fight,
      breadth: { ...fight.breadth, scope: "FULL_RAID", friendlyActorsInScope: roster },
    };
    const entry = (at: number, tolerance: number, assignmentId: string) =>
      assign(at, tolerance, { assignmentId, name }, FIGHT_START);
    const results = resultsOf(rostered, [
      entry(7_544_000, 2_000, "slt-1"),
      entry(7_636_292, 3_000, "slt-200s"),
      entry(7_790_000, 2_000, "after-kill"),
    ]).map((result) => [
      result.assignment.assignmentId,
      result.status === "ASSIGNMENT_UNKNOWN" ? result.reason : result.status,
    ]);
    expect(results).toEqual([
      ["slt-1", "ASSIGNMENT_MET"],
      ["slt-200s", "READINESS_NOT_ESTABLISHED"],
      ["after-kill", "ASSIGNMENT_NOT_ACTIONABLE"],
    ]);
    // Without the roster the same name is not proven unique: UNKNOWN, not MET.
    const named = { ...identity, player: { ...identity.player, name } };
    const [unscoped] = resultsOf(fight, [entry(7_544_000, 2_000, "slt-1")], named);
    expect(unscoped).toMatchObject({ status: "ASSIGNMENT_UNKNOWN", reason: "PLAYER_NOT_RESOLVED" });
  });
});
