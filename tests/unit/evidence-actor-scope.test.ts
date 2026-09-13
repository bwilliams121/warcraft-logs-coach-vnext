/**
 * Which actors the retrieved evidence vouches for.
 *
 * M5-C3a corrected a DECLARATION, not a semantic. Under `PLAYER_CONTEXT` the
 * coverage used to claim `[focusActorId]` — the analysed player and nobody else
 * — while the retrieval plan was, and still is, an unfiltered `dataType: All`
 * stream containing every actor's events. The declaration understated what we
 * hold, and every absence or continuity claim about an ENEMY returned
 * `INSUFFICIENT_SCOPE` as a result. "Did my Garrote stay on the boss" is a
 * question about the player's own combat state that happens to be recorded on
 * the target, and it was unanswerable for a reason that was never true.
 *
 * THE FENCE THAT DID NOT MOVE, and the one these tests care most about:
 * ingestion scope is primarily about how much FRIENDLY RAID state is required.
 * An ALLY stays out of scope under `PLAYER_CONTEXT` even though the bytes are
 * present. That is the whole meaning of the scope, and widening it is what
 * `FULL_RAID` is for.
 */

import { describe, expect, it } from "vitest";

import { deriveEvidenceActorScope } from "../../src/wcl/evidence-actor-scope.js";
import type { CombatActor } from "../../src/engine/normalization/actors.js";

function actor(actorId: number, petOwnerActorId: number | null = null): CombatActor {
  return {
    actorId,
    gameId: null,
    name: `actor-${String(actorId)}`,
    server: null,
    actorType: petOwnerActorId === null ? "PLAYER" : "PET",
    rawType: petOwnerActorId === null ? "Player" : "Pet",
    subType: null,
    petOwnerActorId,
  };
}

function catalog(entries: readonly CombatActor[]): ReadonlyMap<number, CombatActor> {
  return new Map(entries.map((entry) => [entry.actorId, entry]));
}

/**
 * A small raid: the focus player, two allies, one ally's pet, two enemies, and
 * an unowned NPC.
 */
const FOCUS = 19;
const ALLY_A = 13;
const ALLY_B = 7;
const ALLY_PET = 30;
const BOSS = 21;
const ADD = 22;
const UNOWNED_PET = 31;

const ACTORS = catalog([
  actor(FOCUS),
  actor(ALLY_A),
  actor(ALLY_B),
  actor(ALLY_PET, ALLY_A),
  actor(BOSS),
  actor(ADD),
  actor(UNOWNED_PET, null),
]);

const FRIENDLY = [FOCUS, ALLY_A, ALLY_B];

describe("PLAYER_CONTEXT vouches for the player and the enemies", () => {
  it("includes the focus actor and every enemy", () => {
    const scope = deriveEvidenceActorScope({
      scope: "PLAYER_CONTEXT",
      focusActorId: FOCUS,
      friendlyPlayerActorIds: FRIENDLY,
      actors: ACTORS,
    });
    expect(scope).not.toBeNull();
    expect(scope).toContain(FOCUS);
    expect(scope).toContain(BOSS);
    expect(scope).toContain(ADD);
  });

  it("still excludes allies, which is what the scope actually means", () => {
    // The correction was about enemies. If it had also swept allies in, the
    // distinction between PLAYER_CONTEXT and FULL_RAID would have evaporated and
    // a healer analyzer would silently start reading state nobody declared.
    const scope = deriveEvidenceActorScope({
      scope: "PLAYER_CONTEXT",
      focusActorId: FOCUS,
      friendlyPlayerActorIds: FRIENDLY,
      actors: ACTORS,
    });
    expect(scope).not.toContain(ALLY_A);
    expect(scope).not.toContain(ALLY_B);
  });

  it("excludes a friendly player's pet along with its owner", () => {
    // A pet is its own actor. Whether a focus player's own pet counts as their
    // combat state is a question no supported decision asks yet, and excluding
    // it fails closed — answering it later can only widen.
    const scope = deriveEvidenceActorScope({
      scope: "PLAYER_CONTEXT",
      focusActorId: FOCUS,
      friendlyPlayerActorIds: FRIENDLY,
      actors: ACTORS,
    });
    expect(scope).not.toContain(ALLY_PET);
  });

  it("treats a pet with no stated owner as non-friendly rather than guessing", () => {
    // `petOwnerActorId` comes from `ReportActor.petOwner` and is never inferred.
    // An unowned pet gets the same treatment an unowned NPC does, which is safe:
    // it is not ally raid state.
    const scope = deriveEvidenceActorScope({
      scope: "PLAYER_CONTEXT",
      focusActorId: FOCUS,
      friendlyPlayerActorIds: FRIENDLY,
      actors: ACTORS,
    });
    expect(scope).toContain(UNOWNED_PET);
  });

  it("never vouches for an actor the capture did not contain", () => {
    // The reason this returns a LIST rather than `null`. `null` means "every
    // actor in the stream" and would also vouch for ids nobody observed.
    const scope = deriveEvidenceActorScope({
      scope: "PLAYER_CONTEXT",
      focusActorId: FOCUS,
      friendlyPlayerActorIds: FRIENDLY,
      actors: ACTORS,
    });
    expect(scope).not.toBeNull();
    if (scope === null) return;
    for (const actorId of scope) {
      const observed = actorId === FOCUS || ACTORS.has(actorId);
      expect(observed, `${String(actorId)} is not in the catalog`).toBe(true);
    }
    expect(scope).not.toContain(9_999);
  });

  it("includes the focus actor even when the catalog somehow omits them", () => {
    // Fails safe in the one direction that matters: we are always permitted to
    // reason about the actor we were asked to analyse.
    const scope = deriveEvidenceActorScope({
      scope: "PLAYER_CONTEXT",
      focusActorId: FOCUS,
      friendlyPlayerActorIds: FRIENDLY,
      actors: catalog([actor(BOSS)]),
    });
    expect(scope).toContain(FOCUS);
  });

  it("is sorted and free of duplicates, so the declaration is stable", () => {
    const scope = deriveEvidenceActorScope({
      scope: "PLAYER_CONTEXT",
      focusActorId: FOCUS,
      friendlyPlayerActorIds: FRIENDLY,
      actors: ACTORS,
    });
    if (scope === null) throw new Error("expected a list");
    expect([...scope]).toEqual([...scope].sort((left, right) => left - right));
    expect(new Set(scope).size).toBe(scope.length);
  });
});

describe("FULL_RAID keeps its existing declaration", () => {
  it("returns null, meaning every actor in the stream", () => {
    // Unchanged by M5-C3a. `FULL_RAID` is exactly the declaration that ally
    // state was required, so it has nothing to fence off.
    const scope = deriveEvidenceActorScope({
      scope: "FULL_RAID",
      focusActorId: FOCUS,
      friendlyPlayerActorIds: FRIENDLY,
      actors: ACTORS,
    });
    expect(scope).toBeNull();
  });
});

describe("the correction did not touch coverage ranges or state", () => {
  it("derives scope from the catalog alone, never from coverage", () => {
    // Scope widening cannot rescue missing bytes. A partial or truncated capture
    // still fails closed on the range test independently, and this function has
    // no access to ranges at all — which is the structural guarantee.
    const input = {
      scope: "PLAYER_CONTEXT" as const,
      focusActorId: FOCUS,
      friendlyPlayerActorIds: FRIENDLY,
      actors: ACTORS,
    };
    expect(Object.keys(input).sort()).toEqual(["actors", "focusActorId", "friendlyPlayerActorIds", "scope"]);
    expect(deriveEvidenceActorScope(input)).not.toBeNull();
  });
});
