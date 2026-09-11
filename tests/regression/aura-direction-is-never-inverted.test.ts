import { describe, expect, it } from "vitest";

import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { indexContracts } from "../../src/engine/normalization/supported-families.js";
import type { DirectionFieldNames } from "../../src/engine/normalization/raw-event-fields.js";
import { sourceRef, targetRef } from "../../src/engine/normalization/normalized-events.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { ingestFight } from "../../src/wcl/ingest-fight.js";
import {
  contextResponse,
  createTestGraphqlClient,
  eventPageResponse,
  ingestionResponder,
  rawEvent,
} from "../support/wcl-harness.js";

/**
 * Historical failure this protects against:
 *
 * The old analyzer lost source/target direction and read debuffs ON the
 * selected player as debuffs APPLIED BY the selected player. Coaching built on
 * that inversion blamed players for the boss's own mechanics.
 *
 * Direction is defended in four layers, and this file exercises all of them:
 *
 * 1. separate, differently named fields — never one `actor`
 * 2. branded types, so a swap is a compile error rather than a silent bug
 * 3. aura class taken from the raw event type, never from which query returned
 *    it — the single All stream means there is no per-direction query to infer
 *    from in the first place
 * 4. no inference at all: an absent source stays null
 */

const RANGE = inclusiveRange(1000, 5000);

const FIELDS: DirectionFieldNames = {
  sourceId: "sourceID",
  sourceInstance: "sourceInstance",
  targetId: "targetID",
  targetInstance: "targetInstance",
  abilityGameId: "abilityGameID",
};

const BOSS = 42;
const PLAYER = 5;
const DEBUFF = 12345;

function normalize(events: readonly unknown[], streamId = "all") {
  const normalizer = createNormalizer({
    fightStartTimeMs: 1000,
    requestedRange: RANGE,
    contracts: indexContracts([]),
    directionFields: FIELDS,
  });
  normalizer.accept({
    streamId,
    pageOrdinal: 0,
    requestedStartTimeMs: 1000,
    nextPageTimestamp: null,
    events,
  });
  return normalizer.finish();
}

describe("a debuff ON a player is not a debuff applied BY that player", () => {
  const bossDebuffsPlayer = rawEvent(1500, "applydebuff", {
    sourceID: BOSS,
    targetID: PLAYER,
    abilityGameID: DEBUFF,
  });

  const playerDebuffsBoss = rawEvent(1500, "applydebuff", {
    sourceID: PLAYER,
    targetID: BOSS,
    abilityGameID: DEBUFF,
  });

  it("records the boss as the source and the player as the target", () => {
    const event = normalize([bossDebuffsPlayer]).events[0];

    expect(event?.source).toEqual({ actorId: BOSS, instanceId: null });
    expect(event?.target).toEqual({ actorId: PLAYER, instanceId: null });
  });

  it("never reports the player as the source of an ability used on them", () => {
    const output = normalize([bossDebuffsPlayer]);
    const event = output.events[0];

    // The exact inversion that produced the historical bug.
    expect(event?.source?.actorId).not.toBe(PLAYER);
    // And nothing anywhere in the output claims otherwise.
    const serialized = JSON.stringify(output.events);
    expect(serialized).toContain(`"actorId":${BOSS}`);
    expect(JSON.parse(serialized)[0].source.actorId).toBe(BOSS);
  });

  it("produces structurally different output for the mirrored case", () => {
    const incoming = normalize([bossDebuffsPlayer]).events[0];
    const outgoing = normalize([playerDebuffsBoss]).events[0];

    expect(incoming?.source).toEqual(outgoing?.target);
    expect(incoming?.target).toEqual(outgoing?.source);
    expect(JSON.stringify(incoming)).not.toBe(JSON.stringify(outgoing));
  });

  it("does not infer direction from which hostility stream returned the event", () => {
    // Layer 3. The same raw event yields the same direction regardless of which
    // stream carried it, so a future two-stream split cannot reintroduce the
    // bug by implying direction from the query.
    const fromAll = normalize([bossDebuffsPlayer], "all").events[0];
    const fromEnemies = normalize([bossDebuffsPlayer], "all:enemies").events[0];

    expect(fromAll?.source).toEqual(fromEnemies?.source);
    expect(fromAll?.target).toEqual(fromEnemies?.target);
  });
});

describe("branded references", () => {
  it("keeps source and target references structurally identical but nominally distinct", () => {
    const source = sourceRef(BOSS, 1);
    const target = targetRef(BOSS, 1);

    // Same data, different meaning. The brands are erased at runtime, so this
    // asserts the runtime shape; the compiler is what enforces the rest.
    expect({ ...source }).toEqual({ ...target });

    // @ts-expect-error a TargetRef is not assignable where a SourceRef is required
    const _invalid: ReturnType<typeof sourceRef> = target;
    void _invalid;
  });
});

describe("missing direction is never filled in", () => {
  it("leaves an absent source null rather than defaulting to the target", () => {
    const event = normalize([rawEvent(1500, "applybuff", { targetID: PLAYER })]).events[0];

    expect(event?.source).toBeNull();
    expect(event?.target).toEqual({ actorId: PLAYER, instanceId: null });
  });

  it("leaves an absent target null rather than defaulting to the focus player", () => {
    const event = normalize([rawEvent(1500, "cast", { sourceID: PLAYER })]).events[0];

    expect(event?.target).toBeNull();
  });
});

describe("actor instance identity", () => {
  it("keeps actorId and instanceId separate", () => {
    const event = normalize([
      rawEvent(1500, "damage", {
        sourceID: BOSS,
        sourceInstance: 3,
        targetID: PLAYER,
        targetInstance: 1,
      }),
    ]).events[0];

    expect(event?.source).toEqual({ actorId: BOSS, instanceId: 3 });
    expect(event?.target).toEqual({ actorId: PLAYER, instanceId: 1 });
  });

  it("distinguishes two instances of the same actor", () => {
    const output = normalize([
      rawEvent(1500, "damage", { sourceID: BOSS, sourceInstance: 1 }),
      rawEvent(1600, "damage", { sourceID: BOSS, sourceInstance: 2 }),
    ]);

    expect(output.events[0]?.source).not.toEqual(output.events[1]?.source);
  });

  it("does not collapse an absent instance into instance 0", () => {
    const event = normalize([rawEvent(1500, "damage", { sourceID: BOSS })]).events[0];
    // null means "Warcraft Logs supplied none", which is a different fact.
    expect(event?.source?.instanceId).toBeNull();
    expect(event?.source?.instanceId).not.toBe(0);
  });
});

describe("pets are never attributed to their owners", () => {
  it("keeps a pet as its own actor with the owner recorded separately", async () => {
    const { client } = createTestGraphqlClient(
      ingestionResponder({
        context: () =>
          contextResponse({
            actors: [
              { id: PLAYER, gameID: 111, name: "Rogue", type: "Player", subType: "Rogue" },
              { id: 88, gameID: 222, name: "Pet", type: "Pet", subType: "Pet", petOwner: PLAYER },
            ],
          }),
        pages: [() => eventPageResponse([rawEvent(1500, "damage", { sourceID: 88 })], null)],
      }),
    );

    const result = await ingestFight(
      {
        reportCode: "aBcDeFgH12345678",
        fightId: 6,
        sourceId: PLAYER,
        scope: "PLAYER_CONTEXT",
        includeResources: false,
        limit: 100,
      },
      { client, now: () => 1_700_000_000_000, directionFields: FIELDS },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const pet = result.fight.actors.get(88);
    expect(pet?.actorType).toBe("PET");
    expect(pet?.petOwnerActorId).toBe(PLAYER);

    // The pet's damage stays the pet's. Whether it should count toward the
    // owner is a gameplay decision for a specialization evaluator; ingestion
    // does not pre-empt it, and supplies no helper that would make the wrong
    // version easy to write.
    expect(result.fight.events[0]?.source).toEqual({ actorId: 88, instanceId: null });
    expect(result.fight.events[0]?.source?.actorId).not.toBe(PLAYER);
  });

  it("exposes no owner-attribution primitive on the fight", async () => {
    const { client } = createTestGraphqlClient(
      ingestionResponder({ pages: [() => eventPageResponse([], null)] }),
    );
    const result = await ingestFight(
      {
        reportCode: "aBcDeFgH12345678",
        fightId: 6,
        sourceId: PLAYER,
        scope: "PLAYER_CONTEXT",
        includeResources: false,
        limit: 100,
      },
      { client, now: () => 1_700_000_000_000 },
    );

    if (!result.ok) return;
    for (const forbidden of ["effectiveSourceId", "ownerOf", "attributeToOwner", "rollUpPets"]) {
      expect(result.fight).not.toHaveProperty(forbidden);
    }
  });
});
