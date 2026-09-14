/**
 * The shared, reusable rules for reading Warcraft Logs roster facts.
 *
 * WHY THESE LIVE TOGETHER RATHER THAN IN THEIR CALLERS
 *
 * Two modules now read the same three facts out of a report: M2's single-player
 * `identity.ts`, and M7-C's roster discovery. They ask different questions —
 * "who is this one player" versus "who was in these fights" — but the rules that
 * decide whether an answer is TRUSTWORTHY are identical, and they are exactly
 * the rules whose drift is dangerous:
 *
 *     friendlyPlayers / friendlySpecs alignment
 *     resolving a participant id to one unambiguous Player actor
 *     what counts as a usable specialization string
 *
 * Two subtly different definitions of "aligned" is how a player eventually gets
 * coached as the wrong specialization. So there is one definition, and both
 * callers share it.
 *
 * WHAT THIS MODULE IS NOT
 *
 * It holds no gameplay meaning, no analysis, and no judgement about a player.
 * It reads what Warcraft Logs reported and refuses to guess — the same standard
 * `identity.ts` already set, extracted so it can be met twice.
 */

import { isRecord, isSafeInteger, isUsableString, readString } from "./decode.js";
import { NO_ACTOR_SENTINEL } from "../engine/normalization/raw-event-fields.js";

/** `ReportActor.type` for a player. Pets and NPCs are never roster participants. */
export const PLAYER_ACTOR_TYPE = "Player";

/**
 * WCL reports an unresolved specialization as this rather than omitting it.
 *
 * Compared case-insensitively after trimming, because it is a display string
 * rather than a contract value.
 */
export const UNKNOWN_SPEC = "unknown";

/**
 * Whether a `friendlySpecs` entry names a specialization we can actually use.
 *
 * `false` for a missing entry, a blank one, and for WCL's literal `"unknown"`.
 * All three mean the same thing — Warcraft Logs did not tell us the spec — and
 * none of them may become a guess.
 */
export function isUsableSpecName(value: unknown): value is string {
  return isUsableString(value) && value.trim().toLowerCase() !== UNKNOWN_SPEC;
}

/**
 * The index-aligned participant/spec pair for one raw fight record.
 *
 * `undefined` means the alignment could not be trusted, and the caller must fail
 * closed rather than zip to the shorter array. That rule is the whole reason
 * this function exists: a misaligned spec attaches the right player to the wrong
 * specialization, which is a well-formed, undetectable lie.
 */
export interface FriendlyRoster {
  readonly friendlyPlayers: readonly number[];
  /** Entries stay `unknown`; usability is a per-participant question. */
  readonly friendlySpecs: readonly unknown[];
}

export function readFriendlyRoster(rawFight: Record<string, unknown>): FriendlyRoster | undefined {
  const friendlyPlayers = rawFight["friendlyPlayers"];
  const friendlySpecs = rawFight["friendlySpecs"];

  if (!Array.isArray(friendlyPlayers) || !friendlyPlayers.every(isSafeInteger)) {
    return undefined;
  }
  // The two arrays are index-aligned by contract. A length mismatch means the
  // alignment cannot be trusted, and a misaligned spec would silently coach the
  // right player as the wrong specialization.
  if (!Array.isArray(friendlySpecs) || friendlySpecs.length !== friendlyPlayers.length) {
    return undefined;
  }

  return { friendlyPlayers, friendlySpecs };
}

/** Why a participant id did not become a trustworthy player. */
export type ActorResolutionFailure =
  /** No actor in the report carries this id. */
  | "NOT_IN_CATALOG"
  /** Two actors claim this id, so every reference to it is ambiguous. */
  | "AMBIGUOUS_ACTOR_ID"
  /** The id resolves to a pet or NPC rather than a player. */
  | "NOT_A_PLAYER"
  /**
   * The matched record is not a usable actor record at all.
   *
   * Distinct from `IDENTITY_UNUSABLE`, which describes a well-formed Player
   * whose name or class WCL withheld. This one means the entry lacks the `type`
   * that says what it even is, so nothing about it can be trusted — including
   * whether it is a player.
   */
  | "ACTOR_RECORD_MALFORMED"
  /** A player whose name or class Warcraft Logs did not supply. */
  | "IDENTITY_UNUSABLE";

export interface ResolvedPlayerActor {
  readonly name: string;
  readonly className: string;
  /** `ReportActor.server`. Disclosure only — never part of identity. */
  readonly server: string | null;
}

export type ActorResolution =
  | { readonly ok: true; readonly actor: ResolvedPlayerActor }
  | { readonly ok: false; readonly reason: ActorResolutionFailure };

/**
 * Resolves one actor id against the report-level catalog.
 *
 * LENIENT FOR ENTRIES THAT ARE NOT THE ONE ASKED ABOUT, STRICT FOR THE ONE THAT
 * IS. A report contains hundreds of NPCs and pets; a malformed entry for a boss
 * add has no bearing on whether the requested actor is trustworthy, and failing
 * over it would be a fail-closed rule firing on irrelevant evidence.
 *
 * Actor id `0` is a real id, so the match is an `===` comparison and never a
 * truthiness test. The `-1` no-actor sentinel is rejected before the catalog is
 * consulted at all: it is not an actor that happens to be missing, it is the
 * explicit statement that no actor was identified, and a catalog that happened
 * to contain an entry for it must not be able to rescue it into a real player.
 */
export function resolvePlayerActor(actors: readonly unknown[], actorId: number): ActorResolution {
  if (actorId === NO_ACTOR_SENTINEL) {
    return { ok: false, reason: "NOT_IN_CATALOG" };
  }

  const matches = actors.filter((candidate) => isRecord(candidate) && readActorId(candidate) === actorId);

  if (matches.length === 0) {
    return { ok: false, reason: "NOT_IN_CATALOG" };
  }
  if (matches.length > 1) {
    return { ok: false, reason: "AMBIGUOUS_ACTOR_ID" };
  }

  const matched = matches[0];
  if (!isRecord(matched)) {
    return { ok: false, reason: "ACTOR_RECORD_MALFORMED" };
  }

  // Type is read before any player-only field: a pet id must be reported as a
  // pet, not as a player with a missing class.
  const type = readString(matched, "type");
  if (type === undefined) {
    return { ok: false, reason: "ACTOR_RECORD_MALFORMED" };
  }
  if (type !== PLAYER_ACTOR_TYPE) {
    return { ok: false, reason: "NOT_A_PLAYER" };
  }

  const name = readString(matched, "name");
  const className = readString(matched, "subType");
  if (name === undefined || className === undefined) {
    // The regression this exists for: WCL supplied a player, but not a usable
    // name or class. The old analyzer carried that forward as nulls alongside a
    // resolved spec. Here it stops.
    return { ok: false, reason: "IDENTITY_UNUSABLE" };
  }

  return { ok: true, actor: { name, className, server: readString(matched, "server") ?? null } };
}

/**
 * `ReportActor.id`, read strictly.
 *
 * Its own function because `readInteger` would be applied identically in the
 * filter above and in any future caller, and an id read two ways is an id that
 * can match two different sets.
 */
function readActorId(candidate: Record<string, unknown>): number | undefined {
  const value = candidate["id"];
  return isSafeInteger(value) ? value : undefined;
}
