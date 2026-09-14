/**
 * The per-player view over one shared fight.
 *
 * WHAT THIS FILE IS DEFENDING
 *
 * Reusing one retrieval across several players is a cost optimisation, and cost
 * optimisations are exactly where evidence rules quietly get widened. The
 * tempting shortcut is one `actorScope` covering everybody who will be analysed,
 * because it makes the sharing trivial — and it hands every analysis the
 * authority to make absence claims about every other raider, which no analyzer's
 * registration ever asked for.
 *
 * So the tests below pin both halves at once:
 *
 *   SHARED    the expensive normalized structures are the SAME objects
 *   SEPARATE  the evidence scope is derived per player and excludes the others
 *
 * Either one alone is easy. Holding both is the point of the boundary.
 */

import { describe, expect, it } from "vitest";

import { focusedFightFor } from "../../src/engine/normalization/fight-core.js";
import type { CombatActor } from "../../src/engine/normalization/actors.js";
import { castEvent, syntheticFightCore } from "../support/synthetic-fight.js";

const ROGUE = 19;
const HEALER = 7;
/** Actor id `0` is a real id in this data, never a falsy placeholder. */
const ZERO_ID_PLAYER = 0;
const BOSS = 21;
const ROGUE_PET = 30;

function actor(
  actorId: number,
  actorType: CombatActor["actorType"],
  petOwnerActorId: number | null = null,
): CombatActor {
  return {
    actorId,
    gameId: null,
    name: `actor-${String(actorId)}`,
    server: null,
    actorType,
    rawType: actorType === "PLAYER" ? "Player" : actorType === "PET" ? "Pet" : "NPC",
    subType: null,
    petOwnerActorId,
  };
}

const ACTORS: ReadonlyMap<number, CombatActor> = new Map([
  [ROGUE, actor(ROGUE, "PLAYER")],
  [HEALER, actor(HEALER, "PLAYER")],
  [ZERO_ID_PLAYER, actor(ZERO_ID_PLAYER, "PLAYER")],
  [BOSS, actor(BOSS, "NPC")],
  [ROGUE_PET, actor(ROGUE_PET, "PET", ROGUE)],
]);

const FRIENDLY_PLAYERS = [ROGUE, HEALER, ZERO_ID_PLAYER];

function core() {
  return syntheticFightCore({
    actors: ACTORS,
    friendlyPlayers: FRIENDLY_PLAYERS,
    events: [
      castEvent({
        ordinal: 0,
        reportTimeMs: 1500,
        sourceActorId: ROGUE,
        abilityGameId: 703,
        castPhase: "COMPLETE",
      }),
    ],
    talentImport: { actorId: ROGUE, code: "ROGUE-BUILD-STRING" },
  });
}

/** Every category that carries coverage, with the actor scope it vouches for. */
function actorScopes(fight: ReturnType<typeof focusedFightFor>): readonly (readonly number[] | null)[] {
  return Object.values(fight.completeness.categories)
    .filter((evidence) => evidence.capability === "OBSERVABLE")
    .map((evidence) => evidence.coverage.actorScope);
}

describe("PLAYER_CONTEXT stays per player across a shared fight", () => {
  it("excludes the other raiders from each player's evidence scope", () => {
    const shared = core();
    const rogueView = focusedFightFor(shared, ROGUE, "PLAYER_CONTEXT");
    const healerView = focusedFightFor(shared, HEALER, "PLAYER_CONTEXT");

    // THE REGRESSION THIS EXISTS FOR. One scope derived over every analysed
    // actor would put both players in both lists, and each analysis could then
    // prove an absence about the other.
    for (const scope of actorScopes(rogueView)) {
      expect(scope).not.toBeNull();
      expect(scope).toContain(ROGUE);
      expect(scope).not.toContain(HEALER);
    }
    for (const scope of actorScopes(healerView)) {
      expect(scope).not.toBeNull();
      expect(scope).toContain(HEALER);
      expect(scope).not.toContain(ROGUE);
    }
  });

  it("keeps the enemy in scope for both, because the target is not ally state", () => {
    const shared = core();
    for (const player of [ROGUE, HEALER]) {
      for (const scope of actorScopes(focusedFightFor(shared, player, "PLAYER_CONTEXT"))) {
        // "Did my Garrote stay on the boss" is a question about the analysed
        // player's own combat state that happens to be recorded on the target.
        expect(scope).toContain(BOSS);
      }
    }
  });

  it("treats actor id 0 as a real player rather than an absent one", () => {
    const view = focusedFightFor(core(), ZERO_ID_PLAYER, "PLAYER_CONTEXT");
    for (const scope of actorScopes(view)) {
      expect(scope).toContain(ZERO_ID_PLAYER);
      expect(scope).not.toContain(ROGUE);
    }
    expect(view.breadth.focusActorIds).toEqual([ZERO_ID_PLAYER]);
  });

  it("excludes another player's pet with its owner", () => {
    const view = focusedFightFor(core(), HEALER, "PLAYER_CONTEXT");
    for (const scope of actorScopes(view)) {
      expect(scope).not.toContain(ROGUE_PET);
    }
  });

  it("records one focus actor per view and no friendly breadth", () => {
    const shared = core();
    expect(focusedFightFor(shared, ROGUE, "PLAYER_CONTEXT").breadth).toEqual({
      scope: "PLAYER_CONTEXT",
      focusActorIds: [ROGUE],
      friendlyActorsInScope: [],
    });
  });

  it("widens only when FULL_RAID is what was declared", () => {
    const view = focusedFightFor(core(), ROGUE, "FULL_RAID");
    expect(view.breadth.friendlyActorsInScope).toEqual(FRIENDLY_PLAYERS);
    for (const scope of actorScopes(view)) {
      expect(scope).toBeNull();
    }
  });
});

/**
 * `talentImportCode(actorID:)` is the ONE per-actor field on the context query,
 * so a fight retrieved once holds an answer about exactly one player.
 *
 * THREE STATES, AND TWO OF THEM LOOK IDENTICAL IF YOU ONLY READ THE VALUE:
 *
 *   1. queried for this actor, WCL returned a code    code
 *   2. queried for this actor, WCL returned null      null
 *   3. NEVER QUERIED for this actor                   null
 *
 * 2 and 3 are different claims. The first says we looked and there was nothing;
 * the second says we never looked. Letting 3 present as 2 would manufacture a
 * well-formed negative observation about a player we never asked about — and
 * nothing downstream could detect it, because the value is indistinguishable.
 *
 * The distinction lives where this project puts every "do we hold this"
 * question: in `completeness`. TALENTS is sourced from
 * `TYPED_GRAPHQL_FIELD_PER_ACTOR`, and a view only receives that stream when it
 * is the actor the field was requested for.
 */
describe("talent import evidence belongs to the actor it was requested for", () => {
  /** The TALENTS coverage a view is willing to vouch for. */
  function talentEvidence(fight: ReturnType<typeof focusedFightFor>) {
    const evidence = fight.completeness.categories.TALENTS;
    // Capability is a schema fact and stays OBSERVABLE for every view: Warcraft
    // Logs CAN supply this. Whether we obtained it is a coverage question.
    expect(evidence.capability).toBe("OBSERVABLE");
    if (evidence.capability !== "OBSERVABLE") throw new Error("unreachable");
    return evidence.coverage;
  }

  it("CASE 1 — queried actor, code present: value carried and coverage COMPLETE", () => {
    const view = focusedFightFor(core(), ROGUE, "PLAYER_CONTEXT");
    expect(view.talentImportCode).toBe("ROGUE-BUILD-STRING");

    const coverage = talentEvidence(view);
    expect(coverage.state).toBe("COMPLETE");
    expect(coverage.reason).toBe("COMPLETED_NORMALLY");
    expect(coverage.sourceStreamIds).toEqual(["context:typed:actor"]);
  });

  it("CASE 2 — queried actor, WCL returned null: value null but coverage COMPLETE", () => {
    // We asked, and there was genuinely nothing. Documented for Classic and
    // pre-Dragonflight fights. The evidence still vouches for this actor.
    const shared = syntheticFightCore({
      actors: ACTORS,
      friendlyPlayers: FRIENDLY_PLAYERS,
      talentImport: { actorId: ROGUE, code: null },
    });
    const view = focusedFightFor(shared, ROGUE, "PLAYER_CONTEXT");
    expect(view.talentImportCode).toBeNull();

    const coverage = talentEvidence(view);
    expect(coverage.state).toBe("COMPLETE");
    expect(coverage.reason).toBe("COMPLETED_NORMALLY");
  });

  it("CASE 3 — unqueried actor: value null AND coverage fails closed as NOT_REQUESTED", () => {
    // THE CORRECTION. Before this, a view for a player the field was never
    // requested for reported COMPLETE typed talent evidence — a claim with
    // nothing behind it.
    const view = focusedFightFor(core(), HEALER, "PLAYER_CONTEXT");
    expect(view.talentImportCode).toBeNull();

    const coverage = talentEvidence(view);
    expect(coverage.state).toBe("ABSENT");
    expect(coverage.reason).toBe("NOT_REQUESTED");
    expect(coverage.coveredRanges).toEqual([]);
    expect(coverage.sourceStreamIds).toEqual([]);
  });

  it("CASE 2 and CASE 3 are not observationally identical", () => {
    // The whole point. Both have `talentImportCode === null`; only the evidence
    // tells a reader which null this is.
    const queriedNull = focusedFightFor(
      syntheticFightCore({
        actors: ACTORS,
        friendlyPlayers: FRIENDLY_PLAYERS,
        talentImport: { actorId: ROGUE, code: null },
      }),
      ROGUE,
      "PLAYER_CONTEXT",
    );
    const neverQueried = focusedFightFor(core(), HEALER, "PLAYER_CONTEXT");

    expect(queriedNull.talentImportCode).toBe(neverQueried.talentImportCode);
    expect(talentEvidence(queriedNull).state).not.toBe(talentEvidence(neverQueried).state);
  });

  it("CASE 4 — player A's talent evidence is never attributed to player B", () => {
    const shared = core();
    for (const other of [HEALER, ZERO_ID_PLAYER, BOSS]) {
      const view = focusedFightFor(shared, other, "PLAYER_CONTEXT");
      expect(view.talentImportCode).not.toBe("ROGUE-BUILD-STRING");
      expect(view.talentImportCode).toBeNull();
      expect(talentEvidence(view).state).toBe("ABSENT");
    }
  });

  it("uses an id comparison, so actor 0 receives its own talent evidence", () => {
    // A truthiness test here would withhold actor 0's own evidence from it.
    const shared = syntheticFightCore({
      actors: ACTORS,
      friendlyPlayers: FRIENDLY_PLAYERS,
      talentImport: { actorId: ZERO_ID_PLAYER, code: "ZERO-BUILD-STRING" },
    });
    const view = focusedFightFor(shared, ZERO_ID_PLAYER, "PLAYER_CONTEXT");
    expect(view.talentImportCode).toBe("ZERO-BUILD-STRING");
    expect(talentEvidence(view).state).toBe("COMPLETE");
  });

  it("does not disturb the fight-wide typed evidence it shares a round trip with", () => {
    // ENCOUNTER_PHASES comes from `TYPED_GRAPHQL_FIELD`, which is genuinely the
    // same answer for everyone. Withholding per-actor evidence must not degrade
    // it, or the fix would have cost real evidence to buy honesty.
    for (const player of [ROGUE, HEALER, ZERO_ID_PLAYER]) {
      const phases = focusedFightFor(core(), player, "PLAYER_CONTEXT").completeness.categories
        .ENCOUNTER_PHASES;
      expect(phases.capability).toBe("OBSERVABLE");
      if (phases.capability !== "OBSERVABLE") continue;
      expect(phases.coverage.state).toBe("COMPLETE");
    }
  });
});

describe("focused views share the expensive structures", () => {
  it("reuses the normalized arrays and catalogs by reference", () => {
    const shared = core();
    const first = focusedFightFor(shared, ROGUE, "PLAYER_CONTEXT");
    const second = focusedFightFor(shared, HEALER, "PLAYER_CONTEXT");

    // IDENTITY, NOT EQUALITY. A deep copy would satisfy `toEqual` while
    // multiplying the memory cost of a raid night by the size of the raid, and
    // that is precisely the defect this boundary exists to prevent.
    for (const key of ["events", "actors", "abilities", "phases", "malformedObservations"] as const) {
      expect(first[key]).toBe(shared[key]);
      expect(second[key]).toBe(first[key]);
    }
    expect(first.provenance).toBe(shared.provenance);
    expect(first.report).toBe(shared.report);
    expect(first.data).toBe(shared.data);
    expect(first.fight).toBe(shared.fight);
    expect(first.completeness.streams).toBe(shared.streams);
  });

  it("gives each view its own evidence projection", () => {
    const shared = core();
    const first = focusedFightFor(shared, ROGUE, "PLAYER_CONTEXT");
    const second = focusedFightFor(shared, HEALER, "PLAYER_CONTEXT");

    expect(first.breadth).not.toBe(second.breadth);
    expect(first.completeness.categories).not.toBe(second.completeness.categories);
    expect(first.completeness.categories.CASTS).not.toEqual(second.completeness.categories.CASTS);
  });

  it("does not re-sort, deduplicate or filter the canonical event sequence", () => {
    const shared = syntheticFightCore({
      events: [
        // Equal timestamps are valid evidence and must survive the projection.
        castEvent({
          ordinal: 0,
          reportTimeMs: 1500,
          sourceActorId: ROGUE,
          abilityGameId: 703,
          castPhase: "COMPLETE",
        }),
        castEvent({
          ordinal: 1,
          reportTimeMs: 1500,
          sourceActorId: HEALER,
          abilityGameId: 703,
          castPhase: "COMPLETE",
        }),
        castEvent({
          ordinal: 2,
          reportTimeMs: 1200,
          sourceActorId: ROGUE,
          abilityGameId: 1943,
          castPhase: "COMPLETE",
        }),
      ],
      actors: ACTORS,
      friendlyPlayers: FRIENDLY_PLAYERS,
    });
    const view = focusedFightFor(shared, ROGUE, "PLAYER_CONTEXT");

    expect(view.events).toBe(shared.events);
    expect(view.events.map((event) => event.reportTimeMs)).toEqual([1500, 1500, 1200]);
    // A view of one player still holds every actor's events. Scope is a
    // declaration about reasoning, never a filter over the capture.
    expect(view.events).toHaveLength(3);
  });
});
