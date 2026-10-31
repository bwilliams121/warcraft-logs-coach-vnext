/**
 * M12-E: resolving a normalized plan against one fight (src/raid-plan/resolve.ts).
 *
 * - A plan for another encounter or difficulty is never applied, and a fight
 *   with no reported difficulty cannot be bound.
 * - A player resolves only to exactly one roster player: never by class or
 *   specialization, never fuzzily, never across diacritics, and never when
 *   the roster or its names are incomplete.
 * - A phase-relative time is never converted by assuming a phase boundary.
 */

import { describe, expect, it } from "vitest";

import type { CombatActor } from "../../../src/engine/normalization/actors.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import type { PlanPlayer, RaidCooldownPlan } from "../../../src/raid-plan/raid-cooldown-plan.js";
import { encounterBindingOf, resolveRaidCooldownPlan } from "../../../src/raid-plan/resolve.js";
import { syntheticFight } from "../../support/synthetic-fight.js";

const player = (actorId: number, name: string | null, server: string | null): CombatActor => ({
  actorId,
  gameId: null,
  name,
  server,
  actorType: "PLAYER",
  rawType: "Player",
  subType: "Shaman",
  petOwnerActorId: null,
});

const ROSTER = [
  player(1, "Jymblu", "Area52"),
  player(2, "Twin", "Area52"),
  player(3, "Twin", "Stormrage"),
  player(4, "Jymblú", "Area52"),
];

function fightWith(
  actors: readonly CombatActor[],
  scope: "FULL_RAID" | "PLAYER_CONTEXT" = "FULL_RAID",
): CombatFight {
  return syntheticFight({
    actors: new Map(actors.map((actor) => [actor.actorId, actor])),
    scope,
    friendlyActorsInScope: actors.map((actor) => actor.actorId),
  });
}

function planFor(
  fight: CombatFight,
  players: readonly PlanPlayer[],
  phase: string | null = null,
): RaidCooldownPlan {
  return {
    schema: "raid-cooldown-plan/1",
    authority: "USER_PROVIDED_RAID_PLAN",
    encounter: { encounterId: fight.fight.encounterId, difficulty: fight.fight.difficulty ?? 0 },
    source: { format: "STRUCTURED", label: null },
    tolerance: { defaultToleranceMs: 1_000 },
    assignments: players.map((entry, index) => ({
      assignmentId: `assignments[${String(index)}]`,
      player: entry,
      abilityId: 98008,
      plannedTime:
        phase === null
          ? { kind: "FIGHT_RELATIVE", offsetMs: 5_000 }
          : { kind: "PHASE_RELATIVE", phase, offsetMs: 5_000 },
      toleranceMs: 1_000,
      toleranceSource: "PLAN_DEFAULT",
      source: { lineNumber: null, index, rawLine: null },
      context: { bossSpellId: null },
    })),
    importDiagnostics: [],
  };
}

function playersOf(fight: CombatFight, players: readonly PlanPlayer[]) {
  const resolved = resolveRaidCooldownPlan(planFor(fight, players), fight);
  if (resolved.state !== "BOUND") throw new Error("expected a bound plan");
  return resolved.assignments.map((entry) => entry.player);
}

describe("encounter binding", () => {
  const planned = { encounterId: 3429, difficulty: 5 };

  it("matches only the same encounter id AND difficulty id", () => {
    expect(encounterBindingOf(planned, { encounterId: 3429, difficulty: 5 })).toEqual({ state: "MATCHED" });
    expect(encounterBindingOf(planned, { encounterId: 3429, difficulty: 4 }).state).toBe("MISMATCHED");
    expect(encounterBindingOf(planned, { encounterId: 3455, difficulty: 5 }).state).toBe("MISMATCHED");
  });

  it("an unreported difficulty is UNKNOWN for the same encounter, and still a mismatch for another", () => {
    expect(encounterBindingOf(planned, { encounterId: 3429, difficulty: null })).toEqual({
      state: "UNKNOWN",
      reason: "FIGHT_DIFFICULTY_NOT_REPORTED",
    });
    expect(encounterBindingOf(planned, { encounterId: 1, difficulty: null }).state).toBe("MISMATCHED");
  });

  it("an unbound plan resolves no assignment at all", () => {
    const fight = fightWith(ROSTER);
    const plan = { ...planFor(fight, [{ name: "Jymblu", realm: null }]), encounter: planned };
    expect(resolveRaidCooldownPlan(plan, fight)).toMatchObject({
      state: "NOT_BOUND",
      binding: { state: "MISMATCHED" },
    });
  });
});

describe("player identity", () => {
  const fight = fightWith(ROSTER);

  it("a unique name resolves, case-insensitively, with or without its realm", () => {
    expect(
      playersOf(fight, [
        { name: "Jymblu", realm: null },
        { name: "JYMBLU", realm: null },
        { name: "Jymblu", realm: "area52" },
      ]),
    ).toEqual([
      { state: "RESOLVED", actorId: 1 },
      { state: "RESOLVED", actorId: 1 },
      { state: "RESOLVED", actorId: 1 },
    ]);
  });

  it("diacritics are preserved: Jymblú and Jymblu are two players", () => {
    expect(playersOf(fight, [{ name: "Jymblú", realm: null }])).toEqual([{ state: "RESOLVED", actorId: 4 }]);
  });

  it("a duplicated name is AMBIGUOUS until the realm disambiguates it", () => {
    expect(
      playersOf(fight, [
        { name: "Twin", realm: null },
        { name: "Twin", realm: "Stormrage" },
      ]),
    ).toEqual([
      { state: "UNRESOLVED", reason: "AMBIGUOUS", candidateActorIds: [2, 3] },
      { state: "RESOLVED", actorId: 3 },
    ]);
  });

  it("no match is unresolved, never fuzzy-matched; a realm is compared exactly", () => {
    expect(
      playersOf(fight, [
        { name: "Jymbl", realm: null },
        { name: "Jymblu", realm: "Area 52" },
      ]),
    ).toEqual([
      { state: "UNRESOLVED", reason: "NO_MATCH", candidateActorIds: [] },
      { state: "UNRESOLVED", reason: "NO_MATCH", candidateActorIds: [1] },
    ]);
  });

  it("an unnamed roster player makes every name unprovable: never a guessed unique match", () => {
    const partial = fightWith([...ROSTER, player(9, null, null)]);
    expect(playersOf(partial, [{ name: "Jymblu", realm: null }])).toEqual([
      { state: "UNRESOLVED", reason: "ROSTER_NAMES_INCOMPLETE", candidateActorIds: [1] },
    ]);
  });

  it("a realm cannot be checked against a roster player with no server", () => {
    const serverless = fightWith([player(1, "Jymblu", null)]);
    expect(playersOf(serverless, [{ name: "Jymblu", realm: "Area52" }])[0]).toMatchObject({
      reason: "ROSTER_NAMES_INCOMPLETE",
    });
    expect(playersOf(serverless, [{ name: "Jymblu", realm: null }])[0]).toEqual({
      state: "RESOLVED",
      actorId: 1,
    });
  });

  it("without the FULL_RAID roster no name is resolved", () => {
    expect(playersOf(fightWith(ROSTER, "PLAYER_CONTEXT"), [{ name: "Jymblu", realm: null }])).toEqual([
      { state: "UNRESOLVED", reason: "ROSTER_NOT_IN_SCOPE", candidateActorIds: [] },
    ]);
  });
});

describe("planned time", () => {
  const fight = fightWith(ROSTER);

  it("FIGHT_RELATIVE resolves from the pull", () => {
    const resolved = resolveRaidCooldownPlan(planFor(fight, [{ name: "Jymblu", realm: null }]), fight);
    if (resolved.state !== "BOUND") throw new Error("expected a bound plan");
    expect(resolved.assignments[0]?.time).toEqual({
      state: "RESOLVED",
      plannedReportTimeMs: fight.fight.startTimeMs + 5_000,
    });
  });

  it("PHASE_RELATIVE stays unresolved, even phase 1, even when the fight reports phases", () => {
    const phased: CombatFight = {
      ...fight,
      phases: [
        {
          phaseId: 1,
          name: "Stage One",
          isIntermission: false,
          startTimeMs: fight.fight.startTimeMs,
          fightTimeMs: 0,
        },
        {
          phaseId: 2,
          name: "Stage Two",
          isIntermission: false,
          startTimeMs: fight.fight.startTimeMs + 60_000,
          fightTimeMs: 60_000,
        },
      ],
    };
    for (const phase of ["1", "2", "2.5"]) {
      const resolved = resolveRaidCooldownPlan(
        planFor(phased, [{ name: "Jymblu", realm: null }], phase),
        phased,
      );
      if (resolved.state !== "BOUND") throw new Error("expected a bound plan");
      expect(resolved.assignments[0]?.time).toEqual({
        state: "UNRESOLVED",
        reason: "PHASE_LABEL_NOT_MAPPED",
      });
    }
  });
});
