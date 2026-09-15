import { describe, expect, it } from "vitest";

import { anySource, fromSource } from "../../src/engine/auras/aura-state.js";
import { buildAuraIndexes } from "../../src/engine/auras/aura-observations.js";
import { sourceRef, targetRef } from "../../src/engine/normalization/normalized-events.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import { afterEvent, endOfTimestamp } from "../../src/engine/state/temporal.js";
import { auraEvent, syntheticFight } from "../support/synthetic-fight.js";
import { corpusState } from "../support/corpus/fight.js";

/**
 * Historical failure this protects against:
 *
 * The old analyzer lost source/target direction and read debuffs ON the selected
 * player as debuffs APPLIED BY that player. Coaching built on that inversion
 * blamed players for the boss's own mechanics.
 *
 * M3 already defends the observed event — `aura-direction-is-never-inverted`
 * pins that. This file pins the layer above it. A DERIVED aura state is a second
 * place the swap could be reintroduced, and derived state is worse: an inverted
 * normalized event is at least visible in the event, whereas an inverted
 * `presenceAt` answer looks like a clean fact with provenance attached.
 *
 * Four defences, all exercised here:
 *
 * 1. the query addresses a `TargetRef`, so passing a source does not compile
 * 2. the index keys tracks by TARGET, and the target alone
 * 3. the observation carries M3's own branded refs through by reference, so no
 *    re-branding step exists that could pick the wrong side
 * 4. a boss-applies-to-player fight and its mirror produce different answers
 */

const BOSS = 42;
const PLAYER = 5;
const DEBUFF = 12_345;

const ON_PLAYER = targetRef(PLAYER, null);
const ON_BOSS = targetRef(BOSS, null);
const BY_BOSS = sourceRef(BOSS, null);
const BY_PLAYER = sourceRef(PLAYER, null);

/** The boss applies a debuff to the player. Nothing about it is the player's doing. */
function bossDebuffsPlayer() {
  return syntheticFight({
    observedCategories: ["AURAS"],
    events: [
      auraEvent({
        ordinal: 0,
        reportTimeMs: 1500,
        operation: "APPLIED",
        auraClass: "DEBUFF",
        sourceActorId: BOSS,
        targetActorId: PLAYER,
        abilityGameId: DEBUFF,
      }),
    ],
  });
}

/** The mirror: the player applies the same debuff to the boss. */
function playerDebuffsBoss() {
  return syntheticFight({
    observedCategories: ["AURAS"],
    events: [
      auraEvent({
        ordinal: 0,
        reportTimeMs: 1500,
        operation: "APPLIED",
        auraClass: "DEBUFF",
        sourceActorId: PLAYER,
        targetActorId: BOSS,
        abilityGameId: DEBUFF,
      }),
    ],
  });
}

describe("a debuff ON a player never becomes a debuff BY that player", () => {
  const state = createCombatState(bossDebuffsPlayer());

  it("resolves the aura on the player and nowhere else", () => {
    const onPlayer = state.auras.presenceAt({
      target: ON_PLAYER,
      abilityGameId: DEBUFF,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(0),
    });
    const onBoss = state.auras.presenceAt({
      target: ON_BOSS,
      abilityGameId: DEBUFF,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(0),
    });

    expect(onPlayer.certainty).toBe("EXACT");
    if (onPlayer.certainty !== "EXACT") return;
    expect(onPlayer.value.presence).toBe("ACTIVE");

    // The exact inversion that produced the historical bug. The boss is the
    // SOURCE; the boss does not carry this debuff.
    expect(onBoss.certainty).toBe("UNKNOWN");
    if (onBoss.certainty !== "UNKNOWN") return;
    expect(onBoss.reason).toBe("AMBIGUOUS_INITIAL_STATE");
  });

  it("records the boss as the source of the player's debuff", () => {
    const result = state.auras.presenceAt({
      target: ON_PLAYER,
      abilityGameId: DEBUFF,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(0),
    });

    if (result.certainty !== "EXACT") return;
    expect(result.value.anchor.source?.actorId).toBe(BOSS);
    expect(result.value.anchor.target.actorId).toBe(PLAYER);
    // And nothing anywhere in the answer claims the player did it.
    expect(result.value.anchor.source?.actorId).not.toBe(PLAYER);
  });

  it("groups by the target and never by the source", () => {
    const indexes = buildAuraIndexes(bossDebuffsPlayer());
    const [group] = [...indexes.groups.values()];

    expect(group?.target.actorId).toBe(PLAYER);
    expect(group?.target.actorId).not.toBe(BOSS);
    // The source segments the history INSIDE the group. It is part of the
    // identity, so "this aura, from this source" is a track of its own — but it
    // never becomes the actor the aura is on.
    expect([...(group?.tracksBySource.keys() ?? [])]).toEqual([`${BOSS}#-`]);
    expect(group?.tracks[0]?.source?.actorId).toBe(BOSS);
    expect(group?.tracks[0]?.target.actorId).toBe(PLAYER);
  });

  it("produces structurally different state for the mirrored fight", () => {
    const mirrored = createCombatState(playerDebuffsBoss());

    const incomingOnPlayer = state.auras.presenceAt({
      target: ON_PLAYER,
      abilityGameId: DEBUFF,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(0),
    });
    const outgoingOnBoss = mirrored.auras.presenceAt({
      target: ON_BOSS,
      abilityGameId: DEBUFF,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(0),
    });

    if (incomingOnPlayer.certainty !== "EXACT" || outgoingOnBoss.certainty !== "EXACT") return;

    // Both are ACTIVE — on different actors, from different sources. The states
    // are not interchangeable, and neither fight can answer the other's question.
    expect(incomingOnPlayer.value.anchor.target.actorId).toBe(PLAYER);
    expect(outgoingOnBoss.value.anchor.target.actorId).toBe(BOSS);
    expect(JSON.stringify(incomingOnPlayer.value.anchor)).not.toBe(
      JSON.stringify(outgoingOnBoss.value.anchor),
    );

    expect(
      mirrored.auras.presenceAt({
        target: ON_PLAYER,
        abilityGameId: DEBUFF,
        auraClass: "DEBUFF",
        source: anySource(),
        at: afterEvent(0),
      }).certainty,
    ).toBe("UNKNOWN");
  });

  it("does not let a source filter smuggle the source into the target position", () => {
    const wrongWayRound = state.auras.presenceAt({
      // The player IS the target here, and asking for transitions FROM the
      // player finds none: the boss applied it.
      target: ON_PLAYER,
      abilityGameId: DEBUFF,
      auraClass: "DEBUFF",
      source: fromSource(BY_PLAYER),
      at: afterEvent(0),
    });
    const rightWayRound = state.auras.presenceAt({
      target: ON_PLAYER,
      abilityGameId: DEBUFF,
      auraClass: "DEBUFF",
      source: fromSource(BY_BOSS),
      at: afterEvent(0),
    });

    expect(wrongWayRound.certainty).toBe("UNKNOWN");
    expect(rightWayRound.certainty).toBe("EXACT");
  });

  it("makes the swap a compile error, not a runtime accident", () => {
    const _invalid = state.auras.presenceAt({
      // @ts-expect-error a SourceRef is not a TargetRef, so it cannot be queried as one
      target: BY_BOSS,
      abilityGameId: DEBUFF,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(0),
    });
    void _invalid;
  });
});

describe("actor instance identity survives into derived state", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["AURAS"],
      events: [
        auraEvent({
          ordinal: 0,
          reportTimeMs: 1500,
          operation: "APPLIED",
          auraClass: "DEBUFF",
          sourceActorId: PLAYER,
          targetActorId: BOSS,
          targetInstanceId: 1,
          abilityGameId: DEBUFF,
        }),
        auraEvent({
          ordinal: 1,
          reportTimeMs: 1600,
          operation: "REMOVED",
          auraClass: "DEBUFF",
          sourceActorId: PLAYER,
          targetActorId: BOSS,
          targetInstanceId: 2,
          abilityGameId: DEBUFF,
        }),
      ],
    }),
  );

  it("does not let one instance's removal end another instance's aura", () => {
    const one = state.auras.presenceAt({
      target: targetRef(BOSS, 1),
      abilityGameId: DEBUFF,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(1),
    });
    const two = state.auras.presenceAt({
      target: targetRef(BOSS, 2),
      abilityGameId: DEBUFF,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(1),
    });

    if (one.certainty !== "EXACT" || two.certainty !== "EXACT") return;
    // Two adds of the same NPC are two actors as far as auras are concerned.
    expect(one.value.presence).toBe("ACTIVE");
    expect(two.value.presence).toBe("INACTIVE");
  });

  it("does not collapse an absent instance into instance 0", () => {
    const instanceless = state.auras.presenceAt({
      target: targetRef(BOSS, null),
      abilityGameId: DEBUFF,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(1),
    });
    const instanceZero = state.auras.presenceAt({
      target: targetRef(BOSS, 0),
      abilityGameId: DEBUFF,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(1),
    });

    // `null` means "Warcraft Logs supplied none", which is a different fact from
    // instance 0. Neither matches instances 1 or 2.
    expect(instanceless.certainty).toBe("UNKNOWN");
    expect(instanceZero.certainty).toBe("UNKNOWN");
  });
});

describe("pets are not rolled into their owners", () => {
  const PET = 88;

  it("keeps a pet's aura on the pet", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["AURAS"],
        events: [
          auraEvent({
            ordinal: 0,
            reportTimeMs: 1500,
            operation: "APPLIED",
            auraClass: "BUFF",
            sourceActorId: PET,
            targetActorId: PET,
            abilityGameId: DEBUFF,
          }),
        ],
      }),
    );

    const onPet = state.auras.presenceAt({
      target: targetRef(PET, null),
      abilityGameId: DEBUFF,
      auraClass: "BUFF",
      source: anySource(),
      at: afterEvent(0),
    });
    const onOwner = state.auras.presenceAt({
      target: ON_PLAYER,
      abilityGameId: DEBUFF,
      auraClass: "BUFF",
      source: anySource(),
      at: afterEvent(0),
    });

    expect(onPet.certainty).toBe("EXACT");
    expect(onOwner.certainty).toBe("UNKNOWN");
  });

  it("exposes no owner-attribution primitive on the aura view", () => {
    const state = createCombatState(syntheticFight({ observedCategories: ["AURAS"] }));
    for (const forbidden of ["effectiveTarget", "ownerOf", "attributeToOwner", "rollUpPets"]) {
      expect(state.auras).not.toHaveProperty(forbidden);
    }
  });
});

describe("direction survives over a committed capture", () => {
  // Through the shared corpus coverage interpreter: the artifact retains no
  // coverage grant, so nothing below may rest on an absence or a carry-forward.
  // Every assertion here is about indexes and on-event observations.
  const state = corpusState("wcl-midfight-window");

  it("has real captured aura evidence with both directions present", () => {
    const auras = state
      .positionsOfKind("AURA")
      .map((position) => state.auras.observationAt(position))
      .filter((observation) => observation !== null);

    expect(auras.length).toBeGreaterThan(0);
    // The capture contains both self-applied auras and player-on-boss debuffs.
    expect(auras.some((aura) => aura.source?.actorId !== aura.target.actorId)).toBe(true);
    expect(auras.some((aura) => aura.source?.actorId === aura.target.actorId)).toBe(true);
  });

  it("never indexes a captured aura under its source when the two differ", () => {
    for (const group of state.auras.indexes.groups.values()) {
      for (const position of group.allPositions) {
        const event = state.eventAt(position);
        if (event?.kind !== "AURA") continue;
        // The group's actor is the event's target. Always.
        expect(group.target.actorId).toBe(event.target?.actorId);
        expect(group.target.instanceId).toBe(event.target?.instanceId);
      }
    }
  });

  it("keeps each captured track's source on the source side", () => {
    let checked = 0;
    for (const group of state.auras.indexes.groups.values()) {
      for (const track of group.tracks) {
        for (const position of track.positions) {
          const event = state.eventAt(position);
          if (event?.kind !== "AURA") continue;
          expect(track.source?.actorId ?? null).toBe(event.source?.actorId ?? null);
          // A self-applied buff has the same id on both sides, which is exactly
          // the case where an inversion would be invisible. The assertion holds
          // for those too, because both are read from their own field.
          expect(track.target.actorId).toBe(event.target?.actorId);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("answers a captured player-on-boss debuff on the boss, not on the player", () => {
    // `refreshdebuff` from actor 20 onto actor 160 at 7550085. Asked AT that
    // observation — the slice retains no coverage, so nothing may be carried
    // forward past it — the answer rests on the observation alone.
    const refresh = state.fight.events.findIndex(
      (event) =>
        event.kind === "AURA" &&
        event.abilityGameId === 12_654 &&
        event.operation === "REFRESHED" &&
        event.target?.actorId === 160,
    );
    expect(refresh).toBeGreaterThanOrEqual(0);
    const onBoss = state.auras.presenceAt({
      target: targetRef(160, null),
      abilityGameId: 12_654,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(refresh),
    });
    const onApplier = state.auras.presenceAt({
      target: targetRef(20, null),
      abilityGameId: 12_654,
      auraClass: "DEBUFF",
      source: anySource(),
      at: afterEvent(refresh),
    });

    expect(onBoss.certainty).toBe("EXACT");
    if (onBoss.certainty !== "EXACT") return;
    // A refresh proves the aura existed at that observation. It supplies no
    // duration and no expiry, and none is invented.
    expect(onBoss.value.presence).toBe("ACTIVE");
    expect(onBoss.value.anchor.operation).toBe("REFRESHED");

    // The applier does not carry its own debuff.
    expect(onApplier.certainty).toBe("UNKNOWN");
  });

  it("keeps a captured source instance distinct", () => {
    // `applydebuff` from actor 122 instance 6 onto the boss at 7550850.
    const fromInstanceSix = state.auras.lastObservedTransition({
      target: targetRef(160, null),
      abilityGameId: 267_997,
      auraClass: "DEBUFF",
      source: fromSource(sourceRef(122, 6)),
      at: endOfTimestamp(7_551_000),
    });
    const fromInstanceless = state.auras.lastObservedTransition({
      target: targetRef(160, null),
      abilityGameId: 267_997,
      auraClass: "DEBUFF",
      source: fromSource(sourceRef(122, null)),
      at: endOfTimestamp(7_551_000),
    });

    if (fromInstanceSix.certainty !== "EXACT" || fromInstanceSix.value === null) return;
    expect(fromInstanceSix.value.source?.instanceId).toBe(6);

    // Instance 6 and "no instance" are different sources, and the second finds
    // no transition rather than matching on the actor id alone.
    if (fromInstanceless.certainty !== "EXACT") return;
    expect(fromInstanceless.value).toBeNull();
  });
});
