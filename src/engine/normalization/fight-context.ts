/**
 * Normalizes the typed ingestion context: fight boundaries, phases, catalogs.
 *
 * Everything here comes from typed GraphQL fields rather than the non-frozen
 * events JSON, which is why it can be implemented now — the schema itself is
 * the evidence.
 */

import { isRecord, readInteger, readNullableInteger, readString } from "../../wcl/decode.js";
import type { RawFightContextReport } from "../../wcl/fight-context-query.js";
import { isUsableSpecName, readFriendlyRoster, resolvePlayerActor } from "../../wcl/report-roster-facts.js";
import { normalizeAbilities, type AbilityCatalog } from "./abilities.js";
import { normalizeActors, type ActorCatalog } from "./actors.js";
import { mapFinality, type CombatPhase, type FightFinality } from "./combat-fight.js";
import type {
  FriendlySpecializations,
  SpecializationUnknownReason,
  StatedSpecialization,
} from "./friendly-specializations.js";
import {
  normalizeEncounterOutcome,
  normalizeZone,
  type EncounterOutcomeFacts,
  type ZoneMetadata,
} from "./encounter-facts.js";

export interface NormalizedFightHeader {
  readonly id: number;
  readonly name: string;
  readonly encounterId: number;
  readonly difficulty: number | null;
  readonly size: number | null;
  readonly kill: boolean | null;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly durationMs: number;
  readonly finality: FightFinality;
  readonly inProgressRaw: boolean | null;
  readonly friendlyPlayers: readonly number[];
  /** M13-B: each player in `friendlyPlayers`, with its stated specialization or why none is established. */
  readonly friendlySpecializations: FriendlySpecializations;
  readonly talentImportCode: string | null;
  /**
   * Pull-level outcome metadata, verbatim.
   *
   * Held as one nested object rather than six loose fields so it can be carried
   * onto the core WITHOUT entering `CombatFight.fight` — that object is shared
   * by reference with every analysis, and these facts are context that no
   * analyzer may read. See `encounter-facts.ts`.
   */
  readonly outcome: EncounterOutcomeFacts;
}

export type FightContextOutcome =
  | {
      readonly ok: true;
      readonly fight: NormalizedFightHeader;
      readonly phases: readonly CombatPhase[];
      readonly actors: ActorCatalog;
      readonly abilities: AbilityCatalog;
      /** `Report.zone`, a REPORT-level fact. `null` when WCL supplied none. */
      readonly zone: ZoneMetadata | null;
    }
  | {
      readonly ok: false;
      readonly reason: "FIGHT_NOT_FOUND" | "FIGHT_RANGE_INVALID" | "UPSTREAM_DATA_INVALID";
    };

function readBooleanOrNull(source: Record<string, unknown>, key: string): boolean | null {
  const value = source[key];
  return typeof value === "boolean" ? value : null;
}

function readIntegerArray(source: Record<string, unknown>, key: string): readonly number[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is number => Number.isSafeInteger(entry));
}

/**
 * Phase metadata for one encounter, keyed by phase id.
 *
 * `isIntermission` is nullable in the schema and stays nullable here. An absent
 * flag is not "not an intermission".
 */
function phaseMetadataFor(
  rawPhases: readonly unknown[],
  encounterId: number,
): ReadonlyMap<number, { readonly name: string | null; readonly isIntermission: boolean | null }> {
  const metadata = new Map<number, { name: string | null; isIntermission: boolean | null }>();
  for (const entry of rawPhases) {
    if (!isRecord(entry) || readInteger(entry, "encounterID") !== encounterId) {
      continue;
    }
    const phases = entry["phases"];
    if (!Array.isArray(phases)) {
      continue;
    }
    for (const phase of phases) {
      if (!isRecord(phase)) {
        continue;
      }
      const id = readInteger(phase, "id");
      if (id === undefined) {
        continue;
      }
      metadata.set(id, {
        name: readString(phase, "name") ?? null,
        isIntermission: readBooleanOrNull(phase, "isIntermission"),
      });
    }
  }
  return metadata;
}

function normalizePhases(
  rawFight: Record<string, unknown>,
  rawPhases: readonly unknown[],
  encounterId: number,
  fightStartTimeMs: number,
): readonly CombatPhase[] {
  const transitions = rawFight["phaseTransitions"];
  if (!Array.isArray(transitions)) {
    return [];
  }
  const metadata = phaseMetadataFor(rawPhases, encounterId);

  const phases: CombatPhase[] = [];
  for (const transition of transitions) {
    if (!isRecord(transition)) {
      continue;
    }
    const phaseId = readInteger(transition, "id");
    const startTimeMs = readInteger(transition, "startTime");
    if (phaseId === undefined || startTimeMs === undefined) {
      continue;
    }
    const meta = metadata.get(phaseId);
    phases.push({
      phaseId,
      name: meta?.name ?? null,
      isIntermission: meta?.isIntermission ?? null,
      startTimeMs,
      fightTimeMs: startTimeMs - fightStartTimeMs,
    });
  }
  return phases;
}

function notEstablished(reason: SpecializationUnknownReason): StatedSpecialization {
  return { state: "UNKNOWN", reason };
}

/**
 * M13-B: every friendly player's stated specialization, from the raw fight
 * record and the report's raw actor list. See `friendly-specializations.ts`.
 *
 * The rules are `report-roster-facts.ts`'s, called and never restated: the
 * alignment of `friendlyPlayers` with `friendlySpecs`, the strict resolution of
 * the id to one Player actor with a name and a class, and what counts as a
 * usable specialization string. Each player fails closed alone; only a
 * misaligned roster refuses everyone, because then no index can be trusted.
 *
 * `friendlyPlayers` is the header's own list, so the keys are exactly the
 * roster the model already holds. Actor id `0` is real; comparisons are `===`.
 */
export function readFriendlySpecializations(
  rawFight: Record<string, unknown>,
  rawActors: readonly unknown[],
  friendlyPlayers: readonly number[],
): FriendlySpecializations {
  const byActorId = new Map<number, StatedSpecialization>();
  const roster = readFriendlyRoster(rawFight);

  for (const actorId of friendlyPlayers) {
    if (byActorId.has(actorId)) continue;
    if (roster === undefined) {
      byActorId.set(actorId, notEstablished("ROSTER_NOT_ALIGNED"));
      continue;
    }
    const indexes = roster.friendlyPlayers.flatMap((id, index) => (id === actorId ? [index] : []));
    const index = indexes[0];
    if (index === undefined) {
      // Unreachable while both lists come from one record; closed, not assumed.
      byActorId.set(actorId, notEstablished("ROSTER_NOT_ALIGNED"));
      continue;
    }
    if (indexes.length > 1) {
      byActorId.set(actorId, notEstablished("DUPLICATE_PARTICIPANT"));
      continue;
    }
    const actor = resolvePlayerActor(rawActors, actorId);
    if (!actor.ok) {
      byActorId.set(actorId, notEstablished(actor.reason));
      continue;
    }
    const specName = roster.friendlySpecs[index];
    byActorId.set(
      actorId,
      isUsableSpecName(specName)
        ? { state: "STATED", specName, className: actor.actor.className, rosterIndex: index }
        : notEstablished("NOT_STATED"),
    );
  }

  return { source: "WCL_FIGHT_CONTEXT_FRIENDLY_SPECS", byActorId };
}

export function normalizeFightContext(report: RawFightContextReport, fightId: number): FightContextOutcome {
  if (report.fights.length === 0) {
    return { ok: false, reason: "FIGHT_NOT_FOUND" };
  }
  if (report.fights.length > 1) {
    return { ok: false, reason: "UPSTREAM_DATA_INVALID" };
  }

  const rawFight = report.fights[0];
  if (!isRecord(rawFight) || readInteger(rawFight, "id") !== fightId) {
    return { ok: false, reason: "UPSTREAM_DATA_INVALID" };
  }

  const name = readString(rawFight, "name");
  const encounterId = readInteger(rawFight, "encounterID");
  const difficulty = readNullableInteger(rawFight, "difficulty");
  const startTimeMs = readInteger(rawFight, "startTime");
  const endTimeMs = readInteger(rawFight, "endTime");
  if (
    name === undefined ||
    encounterId === undefined ||
    difficulty === undefined ||
    startTimeMs === undefined ||
    endTimeMs === undefined
  ) {
    return { ok: false, reason: "UPSTREAM_DATA_INVALID" };
  }

  // A zero-length or inverted fight would make every fight-relative timestamp
  // meaningless, so it fails closed rather than producing nonsense offsets.
  if (endTimeMs <= startTimeMs) {
    return { ok: false, reason: "FIGHT_RANGE_INVALID" };
  }

  const inProgressRaw = readBooleanOrNull(rawFight, "inProgress");
  const friendlyPlayers = readIntegerArray(rawFight, "friendlyPlayers");

  return {
    ok: true,
    fight: {
      id: fightId,
      name,
      encounterId,
      difficulty,
      size: readNullableInteger(rawFight, "size") ?? null,
      kill: readBooleanOrNull(rawFight, "kill"),
      startTimeMs,
      endTimeMs,
      durationMs: endTimeMs - startTimeMs,
      finality: mapFinality(inProgressRaw),
      inProgressRaw,
      friendlyPlayers,
      friendlySpecializations: readFriendlySpecializations(rawFight, report.actors, friendlyPlayers),
      // Documented null for Classic and pre-Dragonflight fights. Recorded
      // unparsed: decoding it into talent ids needs runtime game data.
      talentImportCode: readString(rawFight, "talentImportCode") ?? null,
      // Total and failure-free by construction: every field resolves to a value
      // or to null, so malformed context metadata can never fail an ingestion
      // whose combat evidence is sound.
      outcome: normalizeEncounterOutcome(rawFight),
    },
    phases: normalizePhases(rawFight, report.phases, encounterId, startTimeMs),
    actors: normalizeActors(report.actors),
    abilities: normalizeAbilities(report.abilities),
    zone: normalizeZone(report.zone),
  };
}
