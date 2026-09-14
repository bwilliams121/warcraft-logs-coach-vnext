/**
 * The factual roster snapshot, and the pure resolution that produces it.
 *
 * WHAT A SNAPSHOT IS
 *
 * One truthful answer to four questions, all of them about ONE report at ONE
 * revision:
 *
 *     Who is this player within this report?
 *     Which of the selected fights did they participate in?
 *     What specialization did Warcraft Logs report for each of those fights?
 *     Which exact report revision do all of those facts belong to?
 *
 * WHAT A SNAPSHOT IS NOT
 *
 * It is not analysis. There is no outcome, no coverage, no count, no status and
 * nowhere to put one. Absence is a participation fact, not a verdict; a
 * specialization change is an observation, not a regression; a specialization
 * this build cannot analyze is still recorded truthfully, because whether an
 * analyzer exists is a different question asked by a different layer.
 *
 * Pure: no network, no clock, no randomness. Given a decoded roster payload and
 * the requested fight ids, it either produces a fully populated snapshot or one
 * typed reason why it could not.
 *
 * IDENTITY IS `(reportCode, sourceId)`, AND ONLY THAT
 *
 * `masterData.actors` is a REPORT-level catalog, so within one report an actor
 * id names one actor. Names are disclosure — two raiders may legitimately share
 * one — and specialization is a per-fight observation, so neither may enter the
 * key. Cross-report identity is deliberately not attempted: nothing in this
 * repository establishes that an actor id means the same character in a
 * different report, and a key that assumed so would merge two people silently.
 */

import { isRecord, readInteger, readNullableInteger, readString } from "./decode.js";
import { NO_ACTOR_SENTINEL } from "../engine/normalization/raw-event-fields.js";
import {
  isUsableSpecName,
  readFriendlyRoster,
  resolvePlayerActor,
  type ActorResolutionFailure,
} from "./report-roster-facts.js";
import type { RosterPayload } from "./report-roster-query.js";

// ---------------------------------------------------------------------------
// Snapshot identity
// ---------------------------------------------------------------------------

/**
 * Which Warcraft Logs snapshot every fact in this object came from.
 *
 * `reportRevision` is R0 — the revision the roster query observed. Every later
 * retrieval in the same batch must agree with it, and a batch whose fights
 * straddle two revisions describes two different worlds rather than one
 * incomplete one.
 *
 * NOTE WHAT IS ABSENT, AND DELIBERATELY:
 *
 * - No generated id, no `Date.now()`, no request id. The identity of a snapshot
 *   is the report and revision it was taken from; inventing one would create an
 *   identity that two identical runs could not share.
 * - No authority commit sha. Different specializations may be evaluated against
 *   different pinned artifacts, so one sha on a report-level snapshot would be a
 *   claim the snapshot cannot support. Authority provenance belongs with the
 *   analysis that used it.
 * - No normalization revision. That describes how COMBAT EVENTS were normalized,
 *   and this snapshot contains none. It belongs where normalized events do.
 */
export interface RaidNightIdentity {
  readonly reportCode: string;
  /** R0. The Warcraft Logs report revision, never a local version of any kind. */
  readonly reportRevision: number;
  readonly logVersion: number;
  readonly gameVersion: number | null;
  readonly reportStartTimeUnixMs: number;
  readonly reportEndTimeUnixMs: number;
  /** Ascending. The fights actually found, which may be fewer than requested. */
  readonly includedFightIds: readonly number[];
}

// ---------------------------------------------------------------------------
// Players, fights, participation
// ---------------------------------------------------------------------------

/**
 * One player, as the report identifies them.
 *
 * `sourceId` is the identity. `name`, `className` and `server` are disclosure:
 * they let a human recognise who this is, and none of them is ever matched on.
 */
export interface RosterPlayer {
  readonly sourceId: number;
  readonly name: string;
  /** From `ReportActor.subType`, which is the class for players. */
  readonly className: string;
  /** `ReportActor.server`, or `null` when Warcraft Logs supplied none. */
  readonly server: string | null;
}

/**
 * One player's participation in one fight.
 *
 * Presence is established by membership in `friendlyPlayers` and is independent
 * of whether the specialization could be read — so `specName` is `null` when
 * Warcraft Logs reported no usable specialization, and that is a fact about the
 * SPEC, never a doubt about the participation.
 *
 * `null` here is never a guess, never a default, and never "absent".
 */
export interface RosterParticipant {
  readonly sourceId: number;
  /** `null` when WCL supplied no usable specialization for this participant here. */
  readonly specName: string | null;
}

/** Factual fight metadata plus who was in it. No analysis, no outcome. */
export interface RosterFight {
  readonly fightId: number;
  readonly name: string;
  /** `0` identifies trash rather than an encounter. Recorded, not judged. */
  readonly encounterId: number;
  readonly difficulty: number | null;
  readonly size: number | null;
  readonly kill: boolean | null;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  /** Ascending by `sourceId`. */
  readonly participants: readonly RosterParticipant[];
}

/**
 * The complete factual snapshot.
 *
 * `players` is the UNION across every included fight — the roster of the night,
 * not of any one pull. That union is what makes absence expressible at all: a
 * player can only be absent from a fight relative to a roster they belong to.
 */
export interface ReportRosterSnapshot {
  readonly identity: RaidNightIdentity;
  /** Ascending by `sourceId`. The union roster across the included fights. */
  readonly players: readonly RosterPlayer[];
  /** Ascending by `fightId`. */
  readonly fights: readonly RosterFight[];
  /** Ascending. Exactly what the caller asked for. */
  readonly requestedFightIds: readonly number[];
  /**
   * Ascending. Requested fights the report does not contain.
   *
   * A FACT, recorded rather than fabricated into an empty fight. What it MEANS
   * for a batch — whether one missing pull invalidates a night or is simply
   * reported — is a later layer's decision, and this one must not pre-empt it by
   * inventing a placeholder.
   */
  readonly missingRequestedFightIds: readonly number[];
}

// ---------------------------------------------------------------------------
// Participation queries
// ---------------------------------------------------------------------------

/**
 * Whether a player took part in a fight.
 *
 * Four outcomes, and the two guard variants exist so that ABSENT cannot quietly
 * absorb a question the snapshot was never asked. `ABSENT` means "this player is
 * on this night's roster and was not in this pull" — a fact about a real player
 * and a real fight, and nothing more.
 *
 * ABSENT is not UNKNOWN, not unsupported, not zero, and not poor play. Nothing
 * in this type can express any of those.
 */
export type RosterParticipation =
  | { readonly kind: "PRESENT"; readonly specName: string | null }
  | { readonly kind: "ABSENT" }
  /** The fight is not in this snapshot — not requested, or not found. */
  | { readonly kind: "FIGHT_NOT_IN_SNAPSHOT" }
  /** The player is not on this night's roster at all. */
  | { readonly kind: "NOT_IN_ROSTER" };

/**
 * Looks up one player's participation in one fight.
 *
 * Comparisons are `===` on ids throughout. Actor id `0` is a real id in this
 * data, so a truthiness test anywhere here would report a real player as absent.
 */
export function participationFor(
  snapshot: ReportRosterSnapshot,
  fightId: number,
  sourceId: number,
): RosterParticipation {
  const fight = snapshot.fights.find((candidate) => candidate.fightId === fightId);
  if (fight === undefined) {
    return { kind: "FIGHT_NOT_IN_SNAPSHOT" };
  }
  if (!snapshot.players.some((player) => player.sourceId === sourceId)) {
    return { kind: "NOT_IN_ROSTER" };
  }

  const participant = fight.participants.find((candidate) => candidate.sourceId === sourceId);
  return participant === undefined ? { kind: "ABSENT" } : { kind: "PRESENT", specName: participant.specName };
}

/** The stable within-report key. Never a name, never a specialization. */
export function playerKeyOf(reportCode: string, sourceId: number): string {
  return `${reportCode}:${String(sourceId)}`;
}

// ---------------------------------------------------------------------------
// Failure vocabulary
// ---------------------------------------------------------------------------

/**
 * Precisely which roster rule refused the data.
 *
 * Diagnostic detail, not a domain state. Every value below fails the snapshot
 * closed for the same caller-visible reason — the roster facts are not
 * trustworthy — and this enum says which fact, so a defect is debuggable without
 * inventing a public vocabulary for each one.
 */
export type RosterDefect =
  /** `friendlyPlayers`/`friendlySpecs` are not index-aligned, or not integers. */
  | "FRIENDLY_SPEC_ALIGNMENT"
  /** The `-1` no-actor sentinel appeared where a participant was expected. */
  | "UNKNOWN_ACTOR_SENTINEL"
  /** A participant id matches no actor in the report catalog. */
  | "PARTICIPANT_NOT_IN_CATALOG"
  /** A participant id resolves to a pet or NPC. */
  | "PARTICIPANT_NOT_A_PLAYER"
  /** Two actors claim one id, so every reference to it is ambiguous. */
  | "AMBIGUOUS_ACTOR_ID"
  /** A participant appears twice in one fight's `friendlyPlayers`. */
  | "DUPLICATE_PARTICIPANT"
  /** A player whose name or class Warcraft Logs did not supply. */
  | "PARTICIPANT_IDENTITY_UNUSABLE"
  /** A fight record is missing metadata the snapshot requires. */
  | "FIGHT_METADATA_UNUSABLE"
  /** Two returned fights claim one id. */
  | "DUPLICATE_FIGHT_ID"
  /** A returned fight was never requested, so the response answers another question. */
  | "UNREQUESTED_FIGHT_RETURNED";

export type RosterFailureReason =
  /** No such report, or it is private. Public + unlisted access only. */
  | "REPORT_NOT_ACCESSIBLE"
  /**
   * The caller selected no fights.
   *
   * Load-bearing rather than defensive: omitting `fightIDs` makes Warcraft Logs
   * return EVERY fight in the report, so an empty selection would silently
   * discover a different set than the one asked for. Refusing it is what keeps
   * "the fights I chose" from becoming "the whole report".
   */
  | "NO_FIGHTS_REQUESTED"
  /** The envelope decoded, but the roster facts inside it cannot be trusted. */
  | "ROSTER_DATA_INVALID";

export interface RosterFailure {
  readonly reason: RosterFailureReason;
  /** Present only for `ROSTER_DATA_INVALID`. Names the rule that fired. */
  readonly defect?: RosterDefect;
  /** The fight the defect was found in, where one applies. */
  readonly fightId?: number;
  /** The participant the defect was found on, where one applies. */
  readonly sourceId?: number;
}

export type RosterResolution =
  | { readonly ok: true; readonly snapshot: ReportRosterSnapshot }
  | { readonly ok: false; readonly failure: RosterFailure };

function invalid(defect: RosterDefect, scope?: { fightId?: number; sourceId?: number }): RosterResolution {
  return {
    ok: false,
    failure: {
      reason: "ROSTER_DATA_INVALID",
      defect,
      ...(scope?.fightId === undefined ? {} : { fightId: scope.fightId }),
      ...(scope?.sourceId === undefined ? {} : { sourceId: scope.sourceId }),
    },
  };
}

/** M7-C's defect vocabulary for each shared actor-resolution outcome. */
function defectFor(reason: ActorResolutionFailure): RosterDefect {
  switch (reason) {
    case "NOT_IN_CATALOG":
      return "PARTICIPANT_NOT_IN_CATALOG";
    case "AMBIGUOUS_ACTOR_ID":
      return "AMBIGUOUS_ACTOR_ID";
    case "NOT_A_PLAYER":
      return "PARTICIPANT_NOT_A_PLAYER";
    case "ACTOR_RECORD_MALFORMED":
    case "IDENTITY_UNUSABLE":
      return "PARTICIPANT_IDENTITY_UNUSABLE";
  }
}

const ASCENDING = (left: number, right: number): number => left - right;

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

interface ResolvedFightRecord {
  readonly fight: RosterFight;
  readonly players: readonly RosterPlayer[];
}

/**
 * Reads one raw fight record into factual roster data.
 *
 * STRICT THROUGHOUT, because every participant is a subject here. `identity.ts`
 * can afford to ignore a malformed entry for a raider nobody asked about; a
 * roster cannot, since that raider is precisely who it is reporting on.
 */
function resolveFight(
  raw: unknown,
  actors: readonly unknown[],
  requested: ReadonlySet<number>,
): { readonly ok: true; readonly value: ResolvedFightRecord } | RosterResolution {
  if (!isRecord(raw)) {
    return invalid("FIGHT_METADATA_UNUSABLE");
  }

  const fightId = readInteger(raw, "id");
  if (fightId === undefined) {
    return invalid("FIGHT_METADATA_UNUSABLE");
  }
  if (!requested.has(fightId)) {
    // The response is answering a question that was not asked. Accepting it
    // would let the discovered fight set drift from the selected one.
    return invalid("UNREQUESTED_FIGHT_RETURNED", { fightId });
  }

  const name = readString(raw, "name");
  const encounterId = readInteger(raw, "encounterID");
  const difficulty = readNullableInteger(raw, "difficulty");
  const startTimeMs = readInteger(raw, "startTime");
  const endTimeMs = readInteger(raw, "endTime");
  if (
    name === undefined ||
    encounterId === undefined ||
    difficulty === undefined ||
    startTimeMs === undefined ||
    endTimeMs === undefined
  ) {
    return invalid("FIGHT_METADATA_UNUSABLE", { fightId });
  }

  const roster = readFriendlyRoster(raw);
  if (roster === undefined) {
    return invalid("FRIENDLY_SPEC_ALIGNMENT", { fightId });
  }

  const participants: RosterParticipant[] = [];
  const players: RosterPlayer[] = [];
  const seen = new Set<number>();

  for (let index = 0; index < roster.friendlyPlayers.length; index += 1) {
    const sourceId = roster.friendlyPlayers[index];
    if (sourceId === undefined) {
      return invalid("FRIENDLY_SPEC_ALIGNMENT", { fightId });
    }

    // Checked before the catalog is consulted. `-1` is not an actor that happens
    // to be missing — it is the explicit statement that no actor was identified,
    // and it must never become a roster player or a player key.
    if (sourceId === NO_ACTOR_SENTINEL) {
      return invalid("UNKNOWN_ACTOR_SENTINEL", { fightId, sourceId });
    }
    if (seen.has(sourceId)) {
      return invalid("DUPLICATE_PARTICIPANT", { fightId, sourceId });
    }
    seen.add(sourceId);

    const resolution = resolvePlayerActor(actors, sourceId);
    if (!resolution.ok) {
      // Never silently dropped. An unresolvable participant is an identity
      // problem, and a partial player object would hide it.
      return invalid(defectFor(resolution.reason), { fightId, sourceId });
    }

    // The spec at THIS index, for THIS participant. The alignment check above is
    // what makes indexing the specs array sound.
    const rawSpec = roster.friendlySpecs[index];
    participants.push({ sourceId, specName: isUsableSpecName(rawSpec) ? rawSpec : null });
    players.push({
      sourceId,
      name: resolution.actor.name,
      className: resolution.actor.className,
      server: resolution.actor.server,
    });
  }

  return {
    ok: true,
    value: {
      fight: {
        fightId,
        name,
        encounterId,
        difficulty,
        size: readNullableInteger(raw, "size") ?? null,
        kill: typeof raw["kill"] === "boolean" ? raw["kill"] : null,
        startTimeMs,
        endTimeMs,
        participants: [...participants].sort((left, right) => ASCENDING(left.sourceId, right.sourceId)),
      },
      players,
    },
  };
}

/**
 * Resolves a decoded roster payload into a deterministic snapshot.
 *
 * ORDERING IS CANONICAL AND NEVER INHERITED FROM THE RESPONSE. Warcraft Logs
 * makes no documented ordering promise for `fights`, `actors` or
 * `friendlyPlayers`, so every collection here is sorted by a factual key:
 * fights and missing ids by fight id, players and participants by source id.
 * Two responses carrying the same facts in different array orders therefore
 * produce the same snapshot.
 */
export function resolveReportRoster(
  payload: RosterPayload,
  requestedFightIds: readonly number[],
): RosterResolution {
  if (requestedFightIds.length === 0) {
    return { ok: false, failure: { reason: "NO_FIGHTS_REQUESTED" } };
  }

  const report = payload.report;
  if (report === null) {
    return { ok: false, failure: { reason: "REPORT_NOT_ACCESSIBLE" } };
  }

  const requested = new Set(requestedFightIds);
  const fights: RosterFight[] = [];
  const playersById = new Map<number, RosterPlayer>();
  const seenFightIds = new Set<number>();

  for (const raw of report.fights) {
    const outcome = resolveFight(raw, report.actors, requested);
    if (!("value" in outcome)) {
      return outcome;
    }

    const { fight, players } = outcome.value;
    if (seenFightIds.has(fight.fightId)) {
      return invalid("DUPLICATE_FIGHT_ID", { fightId: fight.fightId });
    }
    seenFightIds.add(fight.fightId);
    fights.push(fight);

    // The union roster. A player recorded once per report, not once per pull —
    // which is what lets the same person keep one identity across a spec change.
    for (const player of players) {
      playersById.set(player.sourceId, player);
    }
  }

  const includedFightIds = [...seenFightIds].sort(ASCENDING);
  const missingRequestedFightIds = [...requested].filter((id) => !seenFightIds.has(id)).sort(ASCENDING);

  return {
    ok: true,
    snapshot: {
      identity: {
        reportCode: report.code,
        reportRevision: report.revision,
        logVersion: report.logVersion,
        gameVersion: report.gameVersion,
        reportStartTimeUnixMs: report.startTimeUnixMs,
        reportEndTimeUnixMs: report.endTimeUnixMs,
        includedFightIds,
      },
      players: [...playersById.values()].sort((left, right) => ASCENDING(left.sourceId, right.sourceId)),
      fights: [...fights].sort((left, right) => ASCENDING(left.fightId, right.fightId)),
      requestedFightIds: [...requested].sort(ASCENDING),
      missingRequestedFightIds,
    },
  };
}
