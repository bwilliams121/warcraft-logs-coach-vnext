/**
 * Factual identity resolution.
 *
 * Pure: no network, no clock, no randomness. Given a decoded preflight payload
 * and the requested identifiers, it either produces a fully populated
 * `FightIdentity` or one typed reason why it could not.
 *
 * This is NOT a specialization evaluator. It reads what Warcraft Logs reported
 * and refuses to guess. In particular the player's spec comes from the fight's
 * own participation data, never from their class, never from observed casts —
 * M2 has no casts, and inferring a spec from a class would be a guess wearing a
 * fact's clothing.
 */

import { isRecord, readInteger, readNullableInteger, readString } from "./decode.js";
import {
  isUsableSpecName,
  readFriendlyRoster,
  resolvePlayerActor,
  type ActorResolutionFailure,
} from "./report-roster-facts.js";
import type { PreflightPayload, PreflightReport } from "./preflight-query.js";
import type { FightIdentity, PreflightRequest } from "./types.js";

export type IdentityFailureReason =
  | "REPORT_NOT_ACCESSIBLE"
  | "FIGHT_NOT_FOUND"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_NOT_A_PLAYER"
  | "SOURCE_NOT_IN_FIGHT"
  | "IDENTITY_UNRESOLVED"
  | "UPSTREAM_DATA_INVALID";

export type IdentityResolution =
  | { readonly ok: true; readonly identity: FightIdentity }
  | { readonly ok: false; readonly reason: IdentityFailureReason };

function failure(reason: IdentityFailureReason): IdentityResolution {
  return { ok: false, reason };
}

interface ResolvedFight {
  readonly id: number;
  readonly name: string;
  readonly encounterId: number;
  readonly difficulty: number | null;
  readonly startTime: number;
  readonly endTime: number;
  readonly friendlyPlayers: readonly number[];
  readonly friendlySpecs: readonly unknown[];
}

type FightOutcome =
  | { readonly ok: true; readonly fight: ResolvedFight }
  | { readonly ok: false; readonly reason: IdentityFailureReason };

/**
 * The query asks for exactly one fight ID, so the server returns zero or one
 * entry. Anything else means the response does not answer the question asked.
 */
function resolveFight(report: PreflightReport, fightId: number): FightOutcome {
  if (report.fights.length === 0) {
    return { ok: false, reason: "FIGHT_NOT_FOUND" };
  }
  if (report.fights.length > 1) {
    return { ok: false, reason: "UPSTREAM_DATA_INVALID" };
  }

  const raw = report.fights[0];
  if (!isRecord(raw) || readInteger(raw, "id") !== fightId) {
    return { ok: false, reason: "UPSTREAM_DATA_INVALID" };
  }

  const name = readString(raw, "name");
  // 0 identifies trash. Valid, recorded, not interpreted here.
  const encounterId = readInteger(raw, "encounterID");
  const difficulty = readNullableInteger(raw, "difficulty");
  const startTime = readInteger(raw, "startTime");
  const endTime = readInteger(raw, "endTime");
  if (
    name === undefined ||
    encounterId === undefined ||
    difficulty === undefined ||
    startTime === undefined ||
    endTime === undefined
  ) {
    return { ok: false, reason: "UPSTREAM_DATA_INVALID" };
  }

  // The alignment rule is shared with roster discovery rather than restated —
  // see `report-roster-facts.ts`. Two definitions of "aligned" is how a player
  // eventually gets coached as the wrong specialization.
  const roster = readFriendlyRoster(raw);
  if (roster === undefined) {
    return { ok: false, reason: "UPSTREAM_DATA_INVALID" };
  }

  return {
    ok: true,
    fight: {
      id: fightId,
      name,
      encounterId,
      difficulty,
      startTime,
      endTime,
      friendlyPlayers: roster.friendlyPlayers,
      friendlySpecs: roster.friendlySpecs,
    },
  };
}

interface ResolvedActor {
  readonly name: string;
  readonly className: string;
}

type ActorOutcome =
  | { readonly ok: true; readonly actor: ResolvedActor }
  | { readonly ok: false; readonly reason: IdentityFailureReason };

/**
 * Actor-list reading is lenient for entries that are not the requested one, and
 * strict for the one that is.
 *
 * A report contains hundreds of NPCs and pets. A malformed entry for a boss add
 * has no bearing on whether the requested player's identity is trustworthy, and
 * failing the whole request over it would be a fail-closed rule firing on
 * irrelevant evidence.
 */
/** M2's failure vocabulary for each shared actor-resolution outcome. */
function identityReasonFor(reason: ActorResolutionFailure): IdentityFailureReason {
  switch (reason) {
    case "NOT_IN_CATALOG":
      return "SOURCE_NOT_FOUND";
    case "AMBIGUOUS_ACTOR_ID":
      // Two actors claiming one ID makes every later source/target reference
      // ambiguous. There is no safe way to pick one.
      return "UPSTREAM_DATA_INVALID";
    case "ACTOR_RECORD_MALFORMED":
      return "UPSTREAM_DATA_INVALID";
    case "NOT_A_PLAYER":
      return "SOURCE_NOT_A_PLAYER";
    case "IDENTITY_UNUSABLE":
      return "IDENTITY_UNRESOLVED";
  }
}

function resolveActor(report: PreflightReport, sourceId: number): ActorOutcome {
  const resolution = resolvePlayerActor(report.actors, sourceId);
  if (!resolution.ok) {
    return { ok: false, reason: identityReasonFor(resolution.reason) };
  }
  return { ok: true, actor: { name: resolution.actor.name, className: resolution.actor.className } };
}

export function resolveFightIdentity(
  payload: PreflightPayload,
  request: PreflightRequest,
): IdentityResolution {
  const report = payload.report;
  if (report === null) {
    return failure("REPORT_NOT_ACCESSIBLE");
  }

  const fightOutcome = resolveFight(report, request.fightId);
  if (!fightOutcome.ok) {
    return failure(fightOutcome.reason);
  }
  const fight = fightOutcome.fight;

  const actorOutcome = resolveActor(report, request.sourceId);
  if (!actorOutcome.ok) {
    return failure(actorOutcome.reason);
  }
  const actor = actorOutcome.actor;

  const occurrences = fight.friendlyPlayers.filter((id) => id === request.sourceId);
  if (occurrences.length === 0) {
    // A real player in the report who sat this pull out. Not a data defect.
    return failure("SOURCE_NOT_IN_FIGHT");
  }
  if (occurrences.length > 1) {
    return failure("UPSTREAM_DATA_INVALID");
  }

  const index = fight.friendlyPlayers.indexOf(request.sourceId);
  // Only the selected player's spec entry has to be usable. Another raider's
  // null or odd entry says nothing about this player.
  const specName = fight.friendlySpecs[index];
  if (!isUsableSpecName(specName)) {
    return failure("IDENTITY_UNRESOLVED");
  }

  return {
    ok: true,
    identity: {
      report: {
        code: report.code,
        revision: report.revision,
        startTime: report.startTime,
        endTime: report.endTime,
      },
      data: { logVersion: report.logVersion, gameVersion: report.gameVersion },
      fight: {
        id: fight.id,
        name: fight.name,
        encounterId: fight.encounterId,
        difficulty: fight.difficulty,
        startTime: fight.startTime,
        endTime: fight.endTime,
      },
      player: {
        sourceId: request.sourceId,
        name: actor.name,
        className: actor.className,
        specName,
      },
    },
  };
}
