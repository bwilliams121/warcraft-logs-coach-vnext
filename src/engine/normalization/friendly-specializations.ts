/**
 * Each friendly player's Warcraft Logs-stated specialization (M13-B).
 *
 * Observed identity, read from the fight context's `friendlySpecs` at the
 * player's index in `friendlyPlayers` and from nothing else. It is the same
 * fact the identity preflight reads for the analysed player, now held for
 * every friendly participant, so support and healer analysis can ask "what
 * did this ally play" without guessing from class.
 *
 * The decoder is `readFriendlySpecializations` in `fight-context.ts`. It calls
 * the shared roster rules of `report-roster-facts.ts` (alignment, actor
 * resolution, usable specialization string), the same rules `identity.ts`
 * and roster discovery use, and restates none of them.
 *
 * FAIL CLOSED, PER PLAYER
 *
 * A player whose specialization cannot be established is UNKNOWN with the
 * rule that refused it. Never a default, never inferred from class, never
 * inferred from abilities cast. The one roster-wide refusal is misalignment:
 * if the two arrays cannot be trusted to line up, no index pairs a player
 * with a specialization, so every player is UNKNOWN.
 *
 * WHY EVERY PLAYER, WHATEVER THE SCOPE
 *
 * This is report-context identity, like the actor catalog's class
 * (`subType`), which every view already holds for every actor. It comes from
 * the typed context response, retrieved whole under either scope, and it
 * makes no claim about events. Ingestion scope fences off absence claims over
 * ally EVENT state (`breadth`, `completeness`); a stated specialization is
 * neither.
 *
 * WHAT IT IS NOT
 *
 * No role, no "is a healer", no class/specialization compatibility table:
 * those are runtime game data this model does not hold. A specialization
 * string is carried verbatim, beside the class it was stated with.
 */

import type { ActorResolutionFailure } from "../../wcl/report-roster-facts.js";

/** Why a friendly player's specialization is not established. */
export type SpecializationUnknownReason =
  /** The entry is missing, blank, not a string, or Warcraft Logs' literal "unknown" (WCL's own word). */
  | "NOT_STATED"
  /** `friendlyPlayers` / `friendlySpecs` are not index-aligned, so no entry can be paired with a player. */
  | "ROSTER_NOT_ALIGNED"
  /** The id appears more than once in `friendlyPlayers`: two entries, one player. */
  | "DUPLICATE_PARTICIPANT"
  /** The shared actor-resolution rule refused the id (`report-roster-facts.ts`). */
  | ActorResolutionFailure
  /** The actor is not in this fight's `friendlyPlayers` at all. */
  | "NOT_IN_FRIENDLY_ROSTER";

export type StatedSpecialization =
  | {
      readonly state: "STATED";
      /** `friendlySpecs` entry, verbatim. Meaningful only with `className`: "Restoration" is two classes. */
      readonly specName: string;
      /** `ReportActor.subType` of the same player, verbatim. */
      readonly className: string;
      /** Where it was stated: the player's index in `friendlyPlayers` / `friendlySpecs`. */
      readonly rosterIndex: number;
    }
  | { readonly state: "UNKNOWN"; readonly reason: SpecializationUnknownReason };

export interface FriendlySpecializations {
  /** The single source: the typed fight-context field. */
  readonly source: "WCL_FIGHT_CONTEXT_FRIENDLY_SPECS";
  /** One entry per distinct id in the fight header's `friendlyPlayers`, in roster order. */
  readonly byActorId: ReadonlyMap<number, StatedSpecialization>;
}

/**
 * One actor's stated specialization. An actor outside the friendly roster
 * (a pet, an enemy, a player who sat the pull out) is UNKNOWN with
 * NOT_IN_FRIENDLY_ROSTER, never a guess from its owner or class.
 *
 * Actor id `0` is a real id: the lookup is by key, never by truthiness.
 */
export function statedSpecializationOf(
  specializations: FriendlySpecializations,
  actorId: number,
): StatedSpecialization {
  return specializations.byActorId.get(actorId) ?? { state: "UNKNOWN", reason: "NOT_IN_FRIENDLY_ROSTER" };
}
