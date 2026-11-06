/**
 * ONB-S3R: what the replay found on Destruction Warlock, pinned on synthetic events of the same shape.
 *
 * The retained captures of A7R6kxPJ1hC8YQ4w fight 7 are not committed, so the four real MATCH of its Summon Infernal
 * presses are recorded in agent/architecture.md "ONB-S3R". This test keeps the rule they rest on, through the real
 * facade: the subject's own debuff on two bosses proves `active_enemies>=2`, and nothing weaker does. It also keeps
 * the next blocker: a later line waits on the earlier cooldown nothing reads, and is never rejected over it.
 */

import { describe, expect, it } from "vitest";

import destructionTalents from "../../../src/data/game/warlock-destruction-talents.json";
import { inclusiveRange } from "../../../src/engine/evidence/coverage.js";
import type { CombatActor } from "../../../src/engine/normalization/actors.js";
import { createNormalizer } from "../../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../../src/engine/normalization/supported-families.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import { analyzeObservedDestructionWarlockDecisions } from "../../../src/specs/warlock/destruction/observed-analysis.js";
import { observableCategory, syntheticFight, UNVERIFIED_CATEGORY } from "../../support/synthetic-fight.js";

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 90_000;
const SUBJECT = 7;
const BOSS_A = 21;
const BOSS_B = 22;
const WITHER_DEBUFF = 445474;
const CONFLAGRATE = 17962;
const SUMMON_INFERNAL = 1122;
const MALEVOLENCE = 442726;

const HELLCALLER = [
  "chaos_bolt",
  "conflagrate",
  "shadowburn",
  "soul_fire",
  "summon_infernal",
  "havoc",
  "wither",
  "malevolence",
];

function actor(actorId: number, actorType: CombatActor["actorType"]): [number, CombatActor] {
  return [
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
}

const combatantInfo: Raw = {
  timestamp: START,
  type: "combatantinfo",
  sourceID: SUBJECT,
  specID: 267,
  gear: [],
  fight: 1,
  talentTree: HELLCALLER.map((name) => {
    const row = destructionTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, rank: 1, nodeID: row.traitNodeId };
  }),
};
const cast = (timestamp: number, ability: number): Raw => ({
  timestamp,
  type: "cast",
  sourceID: SUBJECT,
  targetID: BOSS_A,
  abilityGameID: ability,
  fight: 1,
});
const hit = (timestamp: number, target: number): Raw => ({
  timestamp,
  type: "damage",
  sourceID: SUBJECT,
  targetID: target,
  abilityGameID: CONFLAGRATE,
  amount: 100,
  fight: 1,
});
const wither = (timestamp: number, type: string, target: number): Raw => ({
  timestamp,
  type,
  sourceID: SUBJECT,
  targetID: target,
  abilityGameID: WITHER_DEBUFF,
  fight: 1,
});

function analyzed(raw: readonly Raw[], options: { readonly auras?: boolean } = {}) {
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
    events: [combatantInfo, ...raw],
  });
  const state = createCombatState(
    syntheticFight({
      events: normalizer.finish().events,
      startTimeMs: START,
      endTimeMs: END,
      actors: new Map([actor(SUBJECT, "PLAYER"), actor(BOSS_A, "NPC"), actor(BOSS_B, "NPC")]),
      categories: {
        CASTS: observableCategory(inclusiveRange(START, END), null),
        AURAS:
          options.auras === false
            ? UNVERIFIED_CATEGORY
            : observableCategory(inclusiveRange(START, END), null),
      },
    }),
  );
  const analysis = analyzeObservedDestructionWarlockDecisions({
    state,
    actorId: SUBJECT,
    specId: "warlock/destruction",
    targetActorId: null,
  });
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}

/** The opening of the real subjects: a first instant, then both bosses hit and carrying the subject's Wither. */
const OPENING: readonly Raw[] = [
  cast(1_100, CONFLAGRATE),
  hit(1_100, BOSS_A),
  hit(1_100, BOSS_B),
  wither(1_101, "applydebuff", BOSS_A),
  wither(1_101, "applydebuff", BOSS_B),
];

const atDecision = (analysis: ReturnType<typeof analyzed>, ability: number) => {
  const index = analysis.comparisons.findIndex((row) => row.decision.abilityGameId === ability);
  if (index < 0) throw new Error(`no decision for ${String(ability)}`);
  return { comparison: analysis.comparisons[index], resolved: analysis.resolved[index] };
};
const gateOf = (row: ReturnType<typeof atDecision>) =>
  row.resolved?.selection.dispatches.find((step) => step.at === "default[3]");

describe("a proven lower bound opens the area list", () => {
  it("two bosses carrying the subject's debuff prove the gate, and a press of the list's first line MATCHes", () => {
    const row = atDecision(analyzed([...OPENING, cast(2_400, SUMMON_INFERNAL)]), SUMMON_INFERNAL);
    expect(gateOf(row)).toMatchObject({ calleeListName: "aoe_hc", outcome: "CALL_SELECTED", gate: "TRUE" });
    expect(row.comparison?.outcome).toBe("MATCH");
    expect(row.comparison?.basis).toBe("AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN");
  });

  it("the MATCH needs both: one boss carrying the debuff leaves the count open, and the same press is UNKNOWN", () => {
    const row = atDecision(
      analyzed([
        cast(1_100, CONFLAGRATE),
        hit(1_100, BOSS_A),
        hit(1_100, BOSS_B),
        wither(1_101, "applydebuff", BOSS_A),
        cast(2_400, SUMMON_INFERNAL),
      ]),
      SUMMON_INFERNAL,
    );
    expect(gateOf(row)?.gate).toBe("UNKNOWN_STATE");
    expect(row.comparison?.outcome).toBe("UNKNOWN");
  });

  it("an earlier appearance is not presence: a debuff removed before the decision leaves the count open", () => {
    const row = atDecision(
      analyzed([...OPENING, wither(2_000, "removedebuff", BOSS_B), cast(2_400, SUMMON_INFERNAL)]),
      SUMMON_INFERNAL,
    );
    expect(gateOf(row)?.gate).toBe("UNKNOWN_STATE");
    expect(row.comparison?.outcome).toBe("UNKNOWN");
  });

  it("missing aura coverage proves nothing: the same events with no aura evidence stay UNKNOWN", () => {
    const row = atDecision(
      analyzed([...OPENING, cast(2_400, SUMMON_INFERNAL)], { auras: false }),
      SUMMON_INFERNAL,
    );
    expect(gateOf(row)?.gate).toBe("UNKNOWN_STATE");
    expect(row.comparison?.outcome).toBe("UNKNOWN");
  });
});

describe("the next blocker", () => {
  it("Malevolence right after Summon Infernal waits on that cooldown, which nothing reads, and is never rejected", () => {
    const analysis = analyzed([...OPENING, cast(2_400, SUMMON_INFERNAL), cast(3_400, MALEVOLENCE)]);
    const row = atDecision(analysis, MALEVOLENCE);
    expect(gateOf(row)?.gate).toBe("TRUE");
    expect(row.comparison?.outcome).toBe("UNKNOWN");
    expect(row.resolved?.selection.undecidedCandidates).toEqual([
      expect.objectContaining({ at: "aoe_hc[0] summon_infernal", atoms: ["USABILITY:summon_infernal"] }),
    ]);
    expect(analysis.coverage.rejected).toBe(0);
  });

  it("another instant on an open area list is UNKNOWN, never rejected for not being the list's first line", () => {
    const analysis = analyzed([...OPENING, cast(2_400, CONFLAGRATE)]);
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
    expect(analysis.coverage.rejected).toBe(0);
    expect(analysis.coverage.match).toBe(0);
  });
});
