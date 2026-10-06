/**
 * Which actors the retrieved evidence actually vouches for.
 *
 * TWO DIFFERENT IDEAS THAT WERE CONFLATED
 *
 *     FOCUS ACTOR            who we are analysing        `breadth.focusActorIds`
 *     EVIDENCE ACTOR SCOPE   who we have complete
 *                            evidence for, and are
 *                            permitted to reason about   `coverage.actorScope`
 *
 * Until M5-C3a the second was set to `[focusActorId]` under `PLAYER_CONTEXT` —
 * the focus actor and nobody else. That made every absence or continuity claim
 * about an ENEMY return `INSUFFICIENT_SCOPE`, including "did my Garrote stay on
 * the boss", which is a question about the player's own combat state that
 * happens to be recorded on the target.
 *
 * WHY THE NARROWER LIST WAS NOT TRUTHFUL
 *
 * `PLAYER_CONTEXT` is defined in the project's own terms as:
 *
 *     the selected player's required combat state
 *     the required enemy/target state          <-- this
 *     the required encounter/environment events
 *
 * and explicitly NOT "only events sourced by the player". `retrieval-plan.ts`
 * enforces that at the transport: the plan has no `sourceID`/`targetID` field,
 * requests one `dataType: All` stream unfiltered by actor, and omits
 * `hostilityType` (verified inert). So the capture genuinely contains every
 * actor's events for the fight window, and declaring otherwise understated what
 * we hold.
 *
 * WHAT THE SCOPE STILL FENCES OFF, AND WHY
 *
 * Ingestion scope is primarily about how much FRIENDLY RAID state is required.
 * That fence stays exactly where it was: under `PLAYER_CONTEXT` an ALLY is still
 * out of scope even though the bytes are present, so an analyzer reading ally
 * state must still return `INSUFFICIENT_SCOPE` and widen its declared scope
 * instead. `FULL_RAID` is what widens it.
 *
 * WHY A LIST AND NOT `null`
 *
 * `null` means "every actor in the stream" and would also vouch for actor ids
 * the capture never contained. An explicit list built from the master-data
 * catalog cannot do that: an id nobody observed is simply not in it, so it stays
 * out of scope and fails closed.
 *
 * WHAT THIS DOES NOT TOUCH
 *
 * Coverage RANGES and coverage STATE are untouched, and `gateAbsenceClaim`
 * checks them independently. A partial or truncated capture still fails closed
 * on the range test no matter what this function returns — scope widening cannot
 * rescue missing bytes.
 */

import type { CombatActor } from "../engine/normalization/actors.js";
import type { IngestionScope } from "../services/ingestion-scope.js";

export interface EvidenceActorScopeInput {
  readonly scope: IngestionScope;
  /** The analysed player. Always in scope. */
  readonly focusActorId: number;
  /** `ReportFight.friendlyPlayers`, verbatim. The raid, as the API reports it. */
  readonly friendlyPlayerActorIds: readonly number[];
  /** The master-data catalog. Only actors present here can enter scope. */
  readonly actors: ReadonlyMap<number, CombatActor>;
  /**
   * An analyzer declared that it reads the FOCUS player's own pets (M11-E1,
   * owner decision M5). Under PLAYER_CONTEXT it widens the vouch to exactly
   * the actors whose WCL `petOwner` is the focus actor — never another
   * player's pet, never a pet with no stated owner (those are already in scope
   * as non-ally state), never one inferred from a summon event. Absent or
   * false changes nothing.
   */
  readonly includeFocusOwnedPets?: boolean;
}

/**
 * Derives the actor scope the coverage may vouch for.
 *
 * `FULL_RAID` keeps its existing `null` — every actor in the stream — because
 * that scope is exactly the declaration that ally state was required.
 *
 * `PLAYER_CONTEXT` yields the focus actor plus every catalog actor that is not
 * friendly-raid state. Pets of friendly players are excluded with their owners:
 * a pet is its own actor, and whether a focus player's own pet counts as their
 * combat state is a question no supported decision asks yet. Excluding it fails
 * closed, so answering it later can only widen.
 */
export function deriveEvidenceActorScope(input: EvidenceActorScopeInput): readonly number[] | null {
  if (input.scope === "FULL_RAID") {
    return null;
  }

  const friendly = new Set(input.friendlyPlayerActorIds);
  const inScope = new Set<number>([input.focusActorId]);

  for (const [actorId, actor] of input.actors) {
    if (friendly.has(actorId)) continue;
    // A pet belongs to whoever owns it. `petOwnerActorId` comes from
    // `ReportActor.petOwner` and is never inferred, so this cannot mis-assign a
    // pet whose owner Warcraft Logs did not state — such a pet is treated as
    // non-friendly and enters scope, which is the same treatment an unowned NPC
    // gets and is safe: it is not ally raid state.
    if (actor.petOwnerActorId !== null && friendly.has(actor.petOwnerActorId)) {
      // The one widening (M11-E1): the focus player's OWN pets, by WCL's own
      // `petOwner` and an explicit `===` on ids (actor 0 is real).
      if (input.includeFocusOwnedPets === true && actor.petOwnerActorId === input.focusActorId) {
        inScope.add(actorId);
      }
      continue;
    }
    inScope.add(actorId);
  }

  return [...inScope].sort((left, right) => left - right);
}
