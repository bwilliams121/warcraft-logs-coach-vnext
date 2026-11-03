/**
 * HEAL-B1: the Holy Paladin, Restoration Druid and Mistweaver Monk evaluators,
 * since HEAL-B2 the Holy Priest evaluator, and since HEAL-B3 the Discipline
 * Priest evaluator (its Atonement observation is pinned in
 * tests/unit/specs/heal-b3-discipline-priest.test.ts), and since HEAL-B4 the
 * Preservation Evoker evaluator (its empowered-cast check is pinned in
 * tests/unit/specs/heal-b4-preservation-evoker.test.ts).
 *
 * Each is run through the same cases, because each must keep the M12-D
 * verdict-category limits on its own identity and its own data:
 * - a wrong or contradictory identity stops evaluation;
 * - no raid plan is NO_AUTHORITY_AVAILABLE, never UNKNOWN, and never filled
 *   in from what the player or another healer cast;
 * - per-cast spell choice is NO_AUTHORITY_AVAILABLE whatever was cast;
 * - an assignment with no cast in its window is UNKNOWN, never a miss;
 * - a use is the player's own completed cast of ITS identified abilities: not
 *   a begincast, not an aura, not another player's cast, and not another
 *   healer specialization's cooldown;
 * - a cast-coverage gap makes the use listing UNKNOWN, never "none used";
 * - overlap with damage episodes needs the declared FULL_RAID roster.
 *
 * The shared plan rules and use facts are pinned in depth by the Restoration
 * Shaman evaluator's own tests, which run unchanged over the same shared
 * modules (HEAL-B1 moved them there without changing behavior).
 */

import { describe, expect, it } from "vitest";

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
import type { AssignmentEvaluation } from "../../../src/findings/healer-assignment-execution.js";
import type { CooldownUse, CooldownUseListing } from "../../../src/healing/cooldown-use-context.js";
import type { RaidCooldownAssignment, RaidCooldownPlan } from "../../../src/raid-plan/raid-cooldown-plan.js";
import { evaluateRestorationDruid } from "../../../src/specs/druid/restoration/evaluator.js";
import { evaluatePreservationEvoker } from "../../../src/specs/evoker/preservation/evaluator.js";
import { evaluateMistweaverMonk } from "../../../src/specs/monk/mistweaver/evaluator.js";
import { evaluateHolyPaladin } from "../../../src/specs/paladin/holy/evaluator.js";
import { evaluateDisciplinePriest } from "../../../src/specs/priest/discipline/evaluator.js";
import { evaluateHolyPriest } from "../../../src/specs/priest/holy/evaluator.js";
import type { EvidenceCategory } from "../../../src/wcl/evidence-capability.js";
import { observableCategory, partialCategory, syntheticFight } from "../../support/synthetic-fight.js";

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 100_000;
const SUBJECT = 30;
const PET = 31;
const OTHER_HEALER = 9;
const BOSS = 161;
const ROSTER = [5, OTHER_HEALER, SUBJECT] as const;
const WHOLE = inclusiveRange(START, END);
/** Spirit Link Totem: a Restoration Shaman healing cooldown, no other specialization's. */
const SPIRIT_LINK_TOTEM = 98008;

/** The parts of an evaluation every HEAL-B1 evaluator returns. */
interface Evaluated {
  readonly revision: string;
  readonly state: "EVALUATED";
  readonly subjectActorId: number;
  readonly dataset: { readonly datasetId: string; readonly artifactRevision: string };
  readonly assignment: AssignmentEvaluation;
  readonly cooldowns: {
    readonly category: "COOLDOWN";
    readonly authority: "WCL_OBSERVED_FACT";
    readonly listing: CooldownUseListing;
    readonly uses: readonly CooldownUse[];
    readonly subjectSources: readonly number[];
  };
  readonly healingDecision: { readonly status: string; readonly reason: string };
}
type Result = Evaluated | { readonly revision: string; readonly state: string; readonly reason: string };

interface Identity {
  readonly report: { readonly code: string };
  readonly fight: { readonly id: number };
  readonly player: {
    readonly sourceId: number;
    readonly className: string;
    readonly specName: string;
    readonly name: string | null;
  };
}
type Evaluate = (input: {
  fight: CombatFight;
  identity: Identity;
  plan: RaidCooldownPlan | null;
  overlapSpanMs?: number;
}) => Result;

interface Case {
  readonly label: string;
  readonly evaluate: Evaluate;
  readonly revision: string;
  readonly className: string;
  readonly specName: string;
  readonly datasetId: string;
  /** Two of its identified cooldowns, the first on a node of its own. */
  readonly cooldownA: number;
  readonly cooldownB: number;
  /** A spell of the same class that is not one of its identified healing cooldowns. */
  readonly notACooldown: number;
  /** A class string that is not this specialization's class. */
  readonly otherClassName: string;
}

const CASES: readonly Case[] = [
  {
    label: "Holy Paladin",
    evaluate: evaluateHolyPaladin as unknown as Evaluate,
    revision: "holy-paladin-evaluator/1",
    className: "Paladin",
    specName: "Holy",
    datasetId: "SIMC_DBC_PALADIN_HOLY_HEALING_COOLDOWNS",
    cooldownA: 31821, // Aura Mastery
    cooldownB: 216331, // Avenging Crusader, the activated override of talent spell 394088
    notACooldown: 6940, // Blessing of Sacrifice: an external, not identified
    otherClassName: "Priest",
  },
  {
    label: "Restoration Druid",
    evaluate: evaluateRestorationDruid as unknown as Evaluate,
    revision: "restoration-druid-evaluator/1",
    className: "Druid",
    specName: "Restoration",
    datasetId: "SIMC_DBC_DRUID_RESTORATION_HEALING_COOLDOWNS",
    cooldownA: 740, // Tranquility
    cooldownB: 391528, // Convoke the Spirits
    notACooldown: 102342, // Ironbark: an external, not identified
    otherClassName: "Priest",
  },
  {
    label: "Mistweaver Monk",
    evaluate: evaluateMistweaverMonk as unknown as Evaluate,
    revision: "mistweaver-monk-evaluator/1",
    className: "Monk",
    specName: "Mistweaver",
    datasetId: "SIMC_DBC_MONK_MISTWEAVER_HEALING_COOLDOWNS",
    cooldownA: 115310, // Revival
    cooldownB: 322118, // Invoke Yu'lon, the Jade Serpent
    notACooldown: 116849, // Life Cocoon: an external, not identified
    otherClassName: "Priest",
  },
  {
    label: "Holy Priest",
    evaluate: evaluateHolyPriest as unknown as Evaluate,
    revision: "holy-priest-evaluator/1",
    className: "Priest",
    specName: "Holy",
    datasetId: "SIMC_DBC_PRIEST_HOLY_HEALING_COOLDOWNS",
    cooldownA: 64843, // Divine Hymn
    cooldownB: 200183, // Apotheosis
    notACooldown: 47788, // Guardian Spirit: an external, not identified
    otherClassName: "Paladin",
  },
  {
    label: "Discipline Priest",
    evaluate: evaluateDisciplinePriest as unknown as Evaluate,
    revision: "discipline-priest-evaluator/1",
    className: "Priest",
    specName: "Discipline",
    datasetId: "SIMC_DBC_PRIEST_DISCIPLINE_HEALING_COOLDOWNS",
    cooldownA: 472433, // Evangelism
    cooldownB: 62618, // Power Word: Barrier
    notACooldown: 33206, // Pain Suppression: an external, not identified
    otherClassName: "Paladin",
  },
  {
    label: "Preservation Evoker",
    evaluate: evaluatePreservationEvoker as unknown as Evaluate,
    revision: "preservation-evoker-evaluator/1",
    className: "Evoker",
    specName: "Preservation",
    datasetId: "SIMC_DBC_EVOKER_PRESERVATION_HEALING_COOLDOWNS",
    cooldownA: 363534, // Rewind
    cooldownB: 359816, // Dream Flight
    notACooldown: 357170, // Time Dilation: an external, not identified
    otherClassName: "Priest",
  },
];

const ENCOUNTER = { encounterId: 2900, difficulty: 5 };

function actorsFor(className: string): ReadonlyMap<number, CombatActor> {
  const actor = (
    actorId: number,
    subType: string,
    actorType: CombatActor["actorType"],
    petOwnerActorId: number | null = null,
  ): CombatActor => ({
    actorId,
    gameId: null,
    name:
      actorId === SUBJECT ? "Subject" : actorId === OTHER_HEALER ? "Other" : actorId === 5 ? "Warrior" : null,
    server: null,
    actorType,
    rawType: actorType === "PLAYER" ? "Player" : actorType === "PET" ? "Pet" : "NPC",
    subType,
    petOwnerActorId,
  });
  return new Map([
    [5, actor(5, "Warrior", "PLAYER")],
    [OTHER_HEALER, actor(OTHER_HEALER, "Shaman", "PLAYER")],
    [SUBJECT, actor(SUBJECT, className, "PLAYER")],
    [PET, actor(PET, "Pet", "PET", SUBJECT)],
    [BOSS, actor(BOSS, "Boss", "NPC")],
  ]);
}

function fightOf(
  testCase: Case,
  raw: readonly Raw[],
  options: {
    readonly scope?: "PLAYER_CONTEXT" | "FULL_RAID";
    readonly categories?: Partial<Record<EvidenceCategory, CategoryEvidence>>;
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
    actors: actorsFor(testCase.className),
    scope: options.scope ?? "FULL_RAID",
    friendlyActorsInScope: ROSTER,
  });
}

function identityFor(
  testCase: Case,
  fight: CombatFight,
  overrides: Partial<Identity["player"]> = {},
): Identity {
  return {
    report: { code: fight.report.code },
    fight: { id: fight.fight.id },
    player: {
      sourceId: SUBJECT,
      className: testCase.className,
      specName: testCase.specName,
      name: "Subject",
      ...overrides,
    },
  };
}

const cast = (timestamp: number, source: number, ability: number, type = "cast"): Raw => ({
  timestamp,
  type,
  sourceID: source,
  targetID: -1,
  abilityGameID: ability,
  fight: 48,
});
const hit = (timestamp: number, target: number): Raw => ({
  timestamp,
  type: "damage",
  sourceID: BOSS,
  targetID: target,
  abilityGameID: 100,
  fight: 48,
  hitType: 1,
  amount: 10_000,
});
const heal = (timestamp: number, source: number, target: number): Raw => ({
  timestamp,
  type: "heal",
  sourceID: source,
  targetID: target,
  abilityGameID: 1,
  fight: 48,
  hitType: 1,
  amount: 5_000,
});

const assign = (
  plannedReportTimeMs: number,
  abilityId: number,
  assignmentId: string,
): RaidCooldownAssignment => ({
  assignmentId,
  player: { name: "Subject", realm: null },
  abilityId,
  plannedTime: { kind: "FIGHT_RELATIVE", offsetMs: plannedReportTimeMs - START },
  toleranceMs: 2_000,
  toleranceSource: "ASSIGNMENT",
  source: { lineNumber: null, index: 0, rawLine: null },
  context: { bossSpellId: null },
});

const planOf = (assignments: readonly RaidCooldownAssignment[]): RaidCooldownPlan => ({
  schema: "raid-cooldown-plan/1",
  authority: "USER_PROVIDED_RAID_PLAN",
  encounter: ENCOUNTER,
  source: { format: "STRUCTURED", label: "test plan" },
  tolerance: { defaultToleranceMs: null },
  assignments,
  importDiagnostics: [],
});

function evaluated(result: Result): Evaluated {
  if (result.state !== "EVALUATED") throw new Error(`expected EVALUATED, got ${result.state}`);
  return result as Evaluated;
}

describe.each(CASES)("$label", (testCase) => {
  const run = (
    fight: CombatFight,
    plan: RaidCooldownPlan | null = null,
    identity = identityFor(testCase, fight),
  ) => testCase.evaluate({ fight, identity, plan });

  describe("identity is validated before any evaluation", () => {
    const fight = fightOf(testCase, [cast(10_000, SUBJECT, testCase.cooldownA)]);
    it.each([
      ["another specialization", { specName: "Elsewhere" }, "NOT_THIS_SPECIALIZATION"],
      ["another class", { className: testCase.otherClassName }, "NOT_THIS_SPECIALIZATION"],
      ["an actor the fight does not list", { sourceId: 999 }, "IDENTITY_UNRESOLVED"],
      ["an actor the fight lists as another class", { sourceId: OTHER_HEALER }, "IDENTITY_CONFLICT"],
      ["a pet of the subject", { sourceId: PET }, "IDENTITY_CONFLICT"],
    ] as const)("%s is refused, with nothing evaluated", (_label, overrides, reason) => {
      expect(run(fight, null, identityFor(testCase, fight, overrides))).toEqual({
        revision: testCase.revision,
        state: "IDENTITY_REFUSED",
        reason,
      });
    });

    it("another fight is refused", () => {
      const identity = { ...identityFor(testCase, fight), fight: { id: fight.fight.id + 1 } };
      expect(run(fight, null, identity)).toMatchObject({
        state: "IDENTITY_REFUSED",
        reason: "IDENTITY_MISMATCH",
      });
    });
  });

  describe("no authority is NO_AUTHORITY_AVAILABLE, never UNKNOWN and never inferred", () => {
    // The player AND another healer cast the same identified cooldown: still no assignment.
    const fight = fightOf(testCase, [
      cast(10_000, SUBJECT, testCase.cooldownA),
      cast(10_000, OTHER_HEALER, testCase.cooldownA),
    ]);
    const result = evaluated(run(fight));

    it("ASSIGNMENT without a plan, HEALING_DECISION whatever was cast", () => {
      expect(result.revision).toBe(testCase.revision);
      expect(result.dataset.datasetId).toBe(testCase.datasetId);
      expect(result.assignment).toEqual({
        category: "ASSIGNMENT",
        status: "NO_AUTHORITY_AVAILABLE",
        reason: "NO_RAID_COOLDOWN_PLAN",
      });
      expect(result.healingDecision).toMatchObject({
        status: "NO_AUTHORITY_AVAILABLE",
        reason: "NO_APPROVED_PER_CAST_HEALER_MODEL",
      });
      expect(JSON.stringify(result)).not.toMatch(/MISSED|EARLY|LATE|INCORRECT|FAIL|SHOULD/);
    });
  });

  describe("a use is the player's own completed cast of its identified abilities, and nothing else", () => {
    const raw = [
      cast(9_000, SUBJECT, testCase.cooldownA, "begincast"), // a begincast is not a use
      { ...cast(9_500, SUBJECT, testCase.cooldownB), type: "applybuff", targetID: SUBJECT }, // an aura is not a use
      cast(10_000, SUBJECT, testCase.cooldownA),
      cast(11_000, OTHER_HEALER, testCase.cooldownB), // another player's cast
      cast(11_500, PET, testCase.cooldownB), // the pet's own cast is not the player's use
      cast(12_000, SUBJECT, testCase.notACooldown), // a class spell that is not identified
      cast(13_000, SUBJECT, SPIRIT_LINK_TOTEM), // another healer specialization's cooldown
      cast(40_000, SUBJECT, testCase.cooldownB),
    ];

    it("lists exactly its identified casts, COMPLETE under COMPLETE cast coverage, with its stated pet as a source", () => {
      const result = evaluated(run(fightOf(testCase, raw)));
      expect(result.cooldowns.listing).toEqual({ state: "COMPLETE" });
      expect(result.cooldowns.uses.map((use) => [use.cast.abilityGameId, use.cast.reportTimeMs])).toEqual([
        [testCase.cooldownA, 10_000],
        [testCase.cooldownB, 40_000],
      ]);
      expect(result.cooldowns.subjectSources).toEqual([SUBJECT, PET]);
    });

    it("a cast-coverage gap makes the listing UNKNOWN, not 'these were all of them'", () => {
      const categories = {
        CASTS: partialCategory([inclusiveRange(START, 50_000), inclusiveRange(60_000, END)]),
      };
      const result = evaluated(run(fightOf(testCase, raw, { categories })));
      expect(result.cooldowns.listing).toEqual({
        state: "UNKNOWN",
        reason: "INSUFFICIENT_COVERAGE",
        unidentifiedCasts: 0,
      });
      expect(result.cooldowns.uses).toHaveLength(2);
    });
  });

  describe("assignment execution under a supplied plan", () => {
    const raw = [cast(10_000, SUBJECT, testCase.cooldownA), cast(70_000, SUBJECT, testCase.cooldownA)];
    const plan = planOf([
      assign(12_000, testCase.cooldownA, "met"),
      assign(40_000, testCase.cooldownA, "no-cast"),
      assign(105_000, testCase.cooldownA, "after-kill"),
      assign(20_000, testCase.notACooldown, "not-identified"),
      { ...assign(20_000, testCase.cooldownA, "other-player"), player: { name: "Other", realm: null } },
    ]);
    const result = evaluated(run(fightOf(testCase, raw), plan));

    it("MET with its own cast, NOT_ACTIONABLE after the kill, and no cast in a covered window is UNKNOWN, never missed", () => {
      if (result.assignment.status !== "EVALUATED") throw new Error("expected an evaluated plan");
      expect(
        result.assignment.results.map((entry) => [
          entry.assignment.assignmentId,
          entry.status,
          entry.status === "ASSIGNMENT_UNKNOWN" ? entry.reason : null,
        ]),
      ).toEqual([
        ["met", "ASSIGNMENT_MET", null],
        ["no-cast", "ASSIGNMENT_UNKNOWN", "READINESS_NOT_ESTABLISHED"],
        ["after-kill", "ASSIGNMENT_NOT_ACTIONABLE", null],
      ]);
      expect(
        result.assignment.notEvaluated.map((entry) => [entry.assignment.assignmentId, entry.reason]),
      ).toEqual([["not-identified", "ABILITY_NOT_REGISTERED"]]);
      expect(result.assignment.assignmentsForOtherPlayers).toBe(1);
    });

    it("another specialization's identified cooldown in the plan is not evaluated as this one's", () => {
      const other = evaluated(
        run(fightOf(testCase, raw), planOf([assign(12_000, SPIRIT_LINK_TOTEM, "slt")])),
      );
      if (other.assignment.status !== "EVALUATED") throw new Error("expected an evaluated plan");
      expect(other.assignment.results).toEqual([]);
      expect(other.assignment.notEvaluated.map((entry) => entry.reason)).toEqual(["ABILITY_NOT_REGISTERED"]);
    });
  });

  describe("overlap with damage episodes is observation, over the declared roster only", () => {
    const raw = [
      cast(10_000, SUBJECT, testCase.cooldownA),
      hit(11_000, 5),
      heal(11_300, SUBJECT, 5),
      heal(11_400, PET, 5),
      heal(11_500, OTHER_HEALER, 5),
    ];

    it("under PLAYER_CONTEXT there is no overlap list at all, not an empty one", () => {
      const result = evaluated(run(fightOf(testCase, raw, { scope: "PLAYER_CONTEXT" })));
      expect(result.cooldowns.uses[0]?.overlap).toEqual({
        state: "ROSTER_NOT_IN_SCOPE",
        scope: "PLAYER_CONTEXT",
      });
    });

    it("under FULL_RAID counts the player's and its stated pet's entries, not another healer's", () => {
      const overlap = evaluated(run(fightOf(testCase, raw))).cooldowns.uses[0]?.overlap;
      if (overlap?.state !== "RECONSTRUCTED") throw new Error("expected an overlap");
      expect(overlap.listing).toEqual({ state: "COMPLETE" });
      expect(overlap.episodes[0]?.players).toEqual([
        {
          actorId: 5,
          entriesFromSubject: 2,
          coverage: { HEALING: { state: "COMPLETE" }, ABSORBS: { state: "COMPLETE" } },
        },
      ]);
    });
  });
});
