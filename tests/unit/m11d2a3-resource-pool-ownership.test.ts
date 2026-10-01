import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ownershipCouldBe,
  standaloneChangeOwnershipOf,
  type StandaloneChangeOwnership,
} from "../../src/engine/resources/resource-observations.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import { beforeEvent } from "../../src/engine/state/temporal.js";
import { ownCastResourceAt } from "../../src/findings/resources/own-cast-resource.js";
import { corpusState } from "../support/corpus/fight.js";
import {
  attachedResources,
  castEvent,
  classResource,
  damageEvent,
  resourceChangeEvent,
  syntheticFight,
} from "../support/synthetic-fight.js";

/**
 * M11-D2-A3 — a standalone resource change belongs to the actor whose POOL it
 * changed, not to the actor that caused it.
 *
 * Before A3 the standalone index filed every `resourcechange` under its
 * SOURCE, so a Hunter's ability that restores its pets' Focus read as four
 * changes to the Hunter's own Focus. Ownership is now read from the event's
 * own evidence — the changed type's entry on the side the verified
 * `resourceActor` discriminator names, or a source and target that are one
 * actor — and an event that establishes neither is UNRESOLVED: indexed under
 * nobody, and a history that might be missing it is UNKNOWN.
 *
 * Ownership only: no pet state, no carry, no regeneration, no Hunter gameplay.
 */

const FOCUS = 2;
const MANA = 0;
const MAELSTROM = 11;
const HUNTER = 20;
const PETS = [38, 30, 29] as const;
const FIXTURE = "wcl-resource-change-pool-ownership";

function change(
  options: Partial<Parameters<typeof resourceChangeEvent>[0]> & {
    readonly sourceActorId?: number | null;
    readonly targetActorId?: number | null;
  },
): Extract<CombatEvent, { kind: "RESOURCE_CHANGE" }> {
  return resourceChangeEvent({
    ordinal: 0,
    reportTimeMs: 1000,
    resourceType: FOCUS,
    resourceChange: 3,
    ...options,
  });
}

describe("standaloneChangeOwnershipOf reads ownership from the event, and only from the event", () => {
  it.each<[string, Extract<CombatEvent, { kind: "RESOURCE_CHANGE" }>, StandaloneChangeOwnership]>([
    [
      "the changed type's entry on the TARGET side -> the target",
      change({
        sourceActorId: HUNTER,
        targetActorId: 38,
        attachedResources: attachedResources({
          side: "TARGET",
          actorId: 38,
          classResources: [classResource(FOCUS, 100, { max: 100 })],
        }),
      }),
      { state: "RESOLVED", owner: { actorId: 38, instanceId: null }, basis: "ATTACHED_CHANGED_POOL" },
    ],
    [
      "the changed type's entry on the SOURCE side of a cross-actor event -> the source (the discriminator, not a role)",
      change({
        sourceActorId: HUNTER,
        targetActorId: 38,
        attachedResources: attachedResources({
          side: "SOURCE",
          actorId: HUNTER,
          classResources: [classResource(FOCUS, 70, { max: 100 })],
        }),
      }),
      { state: "RESOLVED", owner: { actorId: HUNTER, instanceId: null }, basis: "ATTACHED_CHANGED_POOL" },
    ],
    [
      "source and target one actor, no snapshot -> that actor",
      change({ sourceActorId: 7, targetActorId: 7, resourceType: 9, resourceChange: 1 }),
      { state: "RESOLVED", owner: { actorId: 7, instanceId: null }, basis: "SAME_ACTOR_BOTH_SIDES" },
    ],
    [
      "actor id 0 is a real actor",
      change({ sourceActorId: 0, targetActorId: 0 }),
      { state: "RESOLVED", owner: { actorId: 0, instanceId: null }, basis: "SAME_ACTOR_BOTH_SIDES" },
    ],
    [
      "cross-actor, no snapshot -> UNRESOLVED, never the source",
      change({ sourceActorId: HUNTER, targetActorId: 29 }),
      {
        state: "UNRESOLVED",
        reason: "NO_ATTACHED_POOL",
        candidateActorIds: [HUNTER, 29],
        candidatesComplete: true,
      },
    ],
    [
      "cross-actor, a snapshot without the changed type -> UNRESOLVED",
      change({
        sourceActorId: 10,
        targetActorId: 16,
        resourceType: MANA,
        resourceChange: 225,
        attachedResources: attachedResources({
          side: "TARGET",
          actorId: 16,
          classResources: [classResource(MAELSTROM, 67, { max: 125 })],
        }),
      }),
      {
        state: "UNRESOLVED",
        reason: "ATTACHMENT_LACKS_CHANGED_TYPE",
        candidateActorIds: [10, 16],
        candidatesComplete: true,
      },
    ],
    [
      "the changed type's entry on a side with no actor -> UNRESOLVED, candidates incomplete",
      change({
        sourceActorId: HUNTER,
        targetActorId: null,
        attachedResources: attachedResources({
          side: "TARGET",
          actorId: null,
          classResources: [classResource(FOCUS, 100, { max: 100 })],
        }),
      }),
      {
        state: "UNRESOLVED",
        reason: "ATTACHED_SIDE_HAS_NO_ACTOR",
        candidateActorIds: [HUNTER],
        candidatesComplete: false,
      },
    ],
    [
      "no source, no snapshot -> UNRESOLVED, candidates incomplete",
      change({ sourceActorId: null, targetActorId: 29 }),
      { state: "UNRESOLVED", reason: "NO_ATTACHED_POOL", candidateActorIds: [29], candidatesComplete: false },
    ],
    [
      "one actor id on two different instances is not one actor",
      change({ sourceActorId: 50, sourceInstanceId: 1, targetActorId: 50, targetInstanceId: 2 }),
      { state: "UNRESOLVED", reason: "NO_ATTACHED_POOL", candidateActorIds: [50], candidatesComplete: true },
    ],
  ])("%s", (_label, event, expected) => {
    expect(standaloneChangeOwnershipOf(event)).toEqual(expected);
  });

  it("names who COULD own an unresolved change, and everyone when a side is missing", () => {
    const named = standaloneChangeOwnershipOf(change({ sourceActorId: HUNTER, targetActorId: 29 }));
    expect([HUNTER, 29, 38].map((id) => ownershipCouldBe(named, id))).toEqual([true, true, false]);
    const open = standaloneChangeOwnershipOf(change({ sourceActorId: null, targetActorId: 29 }));
    expect([29, 38].map((id) => ownershipCouldBe(open, id))).toEqual([true, true]);
    const owned = standaloneChangeOwnershipOf(change({ sourceActorId: 7, targetActorId: 7 }));
    expect([7, 8].map((id) => ownershipCouldBe(owned, id))).toEqual([true, false]);
  });

  it("holds no pet, owner, class or resource-type rule", () => {
    const code = readFileSync("src/engine/resources/resource-observations.ts", "utf8").replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      "",
    );
    for (const forbidden of ["petOwner", "isPet", "Hunter", "FOCUS", "subType", "className", "specName"]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });
});

describe("the committed Hunter and pet Focus changes", () => {
  function positionOf(state: CombatState, target: number): number {
    const found = state.resources.indexes.standaloneChangePositions.filter(
      (p) => state.eventAt(p)?.target?.actorId === target,
    );
    expect(found).toHaveLength(1);
    return found[0] ?? -1;
  }

  it("files each pet's change under the pet, and only the Hunter's own change under the Hunter", () => {
    const state = corpusState(FIXTURE);
    const own = positionOf(state, HUNTER);
    expect(state.resources.standaloneChangePositionsFor(HUNTER, FOCUS)).toEqual([own]);
    for (const pet of PETS) {
      expect(state.resources.standaloneChangePositionsFor(pet, FOCUS)).toEqual([positionOf(state, pet)]);
      expect(state.resources.standaloneChangePositionsFor(HUNTER, FOCUS)).not.toContain(
        positionOf(state, pet),
      );
    }
  });

  it("keeps the Hunter as the SOURCE of every change, and every observed field verbatim", () => {
    const state = corpusState(FIXTURE);
    for (const target of [...PETS, HUNTER]) {
      const result = state.resources.standaloneChangeOnEvent(positionOf(state, target));
      expect(result.certainty).toBe("EXACT");
      if (result.certainty !== "EXACT") continue;
      expect(result.value.source?.actorId).toBe(HUNTER);
      expect(result.value.target?.actorId).toBe(target);
      expect([result.value.resourceType, result.value.resourceChange]).toEqual([FOCUS, 3]);
      expect(result.value.ownership).toEqual({
        state: "RESOLVED",
        owner: { actorId: target, instanceId: null },
        basis: "ATTACHED_CHANGED_POOL",
      });
    }
    // The discriminating evidence: waste at a pet's cap while the Hunter's own pool is not at cap.
    const pet38 = state.resources.standaloneChangeOnEvent(positionOf(state, 38));
    const hunter = state.resources.observationOnEvent(positionOf(state, HUNTER), HUNTER, FOCUS);
    expect(pet38.certainty === "EXACT" && pet38.value.reportedWasteAmount).toBe(3);
    expect(hunter.certainty === "EXACT" && [hunter.value.observedAmount, hunter.value.timing]).toEqual([
      70,
      "POST_CHANGE",
    ]);
  });

  it("indexes the Shaman's Mana change under nobody", () => {
    const state = corpusState(FIXTURE);
    const shaman = positionOf(state, 16);
    expect(state.resources.indexes.unresolvedOwnershipChangePositions).toEqual([shaman]);
    for (const actor of [10, 16])
      expect(state.resources.standaloneChangePositionsFor(actor, MANA)).toEqual([]);
  });

  it("leaves the resourceless pet capture's four changes unowned, under neither the Hunter nor the pet", () => {
    const state = corpusState("wcl-pet-sourced-events-hunter-pet-29");
    expect(state.resources.indexes.standaloneChangePositions).toHaveLength(4);
    expect(state.resources.indexes.unresolvedOwnershipChangePositions).toEqual(
      state.resources.indexes.standaloneChangePositions,
    );
    expect(state.resources.standaloneChangePositionsFor(HUNTER, FOCUS)).toEqual([]);
    expect(state.resources.standaloneChangePositionsFor(29, FOCUS)).toEqual([]);
  });

  it("cannot turn any pool's change into an own-cast snapshot", () => {
    const state = corpusState(FIXTURE);
    for (const position of state.resources.indexes.standaloneChangePositions) {
      for (const actorId of [HUNTER, ...PETS, 10, 16]) {
        for (const resourceId of ["FOCUS", "RAGE"] as const) {
          const result = ownCastResourceAt(state, { position, actorId, resourceId });
          expect(result.state === "REFUSED" && result.reason).toBe("NOT_A_CAST");
        }
      }
    }
  });
});

describe("resource history follows the pool, and refuses what it cannot attribute", () => {
  const huntersCast = (ordinal: number, reportTimeMs: number, amount: number): CombatEvent =>
    castEvent({
      ordinal,
      reportTimeMs,
      castPhase: "COMPLETE",
      sourceActorId: HUNTER,
      abilityGameId: 34_026,
      attachedResources: attachedResources({
        side: "SOURCE",
        actorId: HUNTER,
        classResources: [classResource(FOCUS, amount, { max: 100, cost: 30 })],
      }),
    });
  const toPet = (ordinal: number, reportTimeMs: number, withSnapshot: boolean): CombatEvent =>
    resourceChangeEvent({
      ordinal,
      reportTimeMs,
      sourceActorId: HUNTER,
      targetActorId: 38,
      resourceType: FOCUS,
      resourceChange: 3,
      attachedResources: withSnapshot
        ? attachedResources({
            side: "TARGET",
            actorId: 38,
            classResources: [classResource(FOCUS, 90, { max: 100 })],
          })
        : null,
    });
  const toSelf = (ordinal: number, reportTimeMs: number): CombatEvent =>
    resourceChangeEvent({
      ordinal,
      reportTimeMs,
      sourceActorId: HUNTER,
      targetActorId: HUNTER,
      resourceType: FOCUS,
      resourceChange: 3,
    });
  const query = (events: readonly CombatEvent[], actorId: number) => {
    const state = createCombatState(syntheticFight({ observedCategories: ["RESOURCES", "CASTS"], events }));
    const last = events.length - 1;
    return {
      state,
      history: state.resources.resourceHistoryAt({ actorId, resourceType: FOCUS, at: beforeEvent(last) }),
    };
  };
  const end = (ordinal: number, reportTimeMs: number): CombatEvent =>
    damageEvent({ ordinal, reportTimeMs, sourceActorId: HUNTER, targetActorId: 99 });

  it("leaves a pet's change out of the Hunter's history, and keeps the Hunter's own", () => {
    const { state, history } = query(
      [huntersCast(0, 1000, 100), toPet(1, 1100, true), toSelf(2, 1150), end(3, 1200)],
      HUNTER,
    );
    expect(history.certainty).toBe("EXACT");
    if (history.certainty !== "EXACT") return;
    expect(history.value.since.map((entry) => entry.position)).toEqual([2]);
    expect(history.value.since[0]?.change?.ownership).toMatchObject({
      state: "RESOLVED",
      basis: "SAME_ACTOR_BOTH_SIDES",
    });
    const window = state.resources.observationsWithinBefore(HUNTER, FOCUS, 3, 1000);
    expect(window.map((item) => item.entry.position)).toEqual([0, 2]);
  });

  it("gives the pet its own change", () => {
    const { history } = query([huntersCast(0, 1000, 100), toPet(1, 1100, true), end(2, 1200)], 38);
    expect(history.certainty === "EXACT" && history.value.anchor.position).toBe(1);
  });

  it("refuses the Hunter's history when an unowned change that could be the Hunter's lies after the anchor", () => {
    const { history } = query([huntersCast(0, 1000, 100), toPet(1, 1100, false), end(2, 1200)], HUNTER);
    expect(history.certainty === "UNKNOWN" && history.reason).toBe("UNSUPPORTED_DERIVATION");
  });

  it("does not let an unowned change between two named actors touch a third actor's history", () => {
    const other: CombatEvent = castEvent({
      ordinal: 0,
      reportTimeMs: 1000,
      castPhase: "COMPLETE",
      sourceActorId: 21,
      abilityGameId: 34_026,
      attachedResources: attachedResources({
        side: "SOURCE",
        actorId: 21,
        classResources: [classResource(FOCUS, 50, { max: 100, cost: 30 })],
      }),
    });
    const { history } = query([other, toPet(1, 1100, false), end(2, 1200)], 21);
    expect(history.certainty).toBe("EXACT");
  });

  it("lets an unowned change with a missing side refuse every actor's history of that resource, and no other", () => {
    const sideless: CombatEvent = resourceChangeEvent({
      ordinal: 1,
      reportTimeMs: 1100,
      sourceActorId: null,
      targetActorId: 38,
      resourceType: FOCUS,
      resourceChange: 3,
    });
    const focus = query([huntersCast(0, 1000, 100), sideless, end(2, 1200)], HUNTER).history;
    expect(focus.certainty === "UNKNOWN" && focus.reason).toBe("UNSUPPORTED_DERIVATION");
    const manaChange: CombatEvent = resourceChangeEvent({
      ordinal: 1,
      reportTimeMs: 1100,
      sourceActorId: null,
      targetActorId: 38,
      resourceType: MANA,
      resourceChange: 3,
    });
    expect(query([huntersCast(0, 1000, 100), manaChange, end(2, 1200)], HUNTER).history.certainty).toBe(
      "EXACT",
    );
  });

  it("ignores an unowned change before the anchor, exactly as an unattributed snapshot", () => {
    const { history } = query([toPet(0, 900, false), huntersCast(1, 1000, 100), end(2, 1200)], HUNTER);
    expect(history.certainty).toBe("EXACT");
  });
});
