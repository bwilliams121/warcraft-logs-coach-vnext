/**
 * Factual actor identity.
 *
 * Pets and guardians are SEPARATE actors. `petOwnerActorId` is populated only
 * from what Warcraft Logs supplied (`ReportActor.petOwner`), never inferred
 * from names, timing, summon events or proximity.
 *
 * There is deliberately no owner-attribution helper in this module — no
 * `effectiveSourceId`, no `ownerOf()`, no rollup. A pet's event has the pet as
 * its source, full stop. Whether that should count toward the owner is a
 * gameplay decision owned by a specialization evaluator, and M3 does not supply
 * the primitive that would make the wrong version easy to write.
 */

import { isRecord, readInteger, readString } from "../../wcl/decode.js";

export type CombatActorType = "PLAYER" | "PET" | "NPC" | "UNKNOWN";

export interface CombatActor {
  /** `ReportActor.id` — the ID events use for sources and targets. */
  readonly actorId: number;
  readonly gameId: number | null;
  readonly name: string | null;
  readonly server: string | null;
  readonly actorType: CombatActorType;
  /** `ReportActor.type` verbatim, so an unrecognised value is not lost. */
  readonly rawType: string | null;
  /** Class for players, boss/NPC subdivision otherwise. */
  readonly subType: string | null;
  /** From `ReportActor.petOwner` ONLY. Never inferred. */
  readonly petOwnerActorId: number | null;
}

export interface ActorCatalog {
  readonly actors: ReadonlyMap<number, CombatActor>;
  /** Entries Warcraft Logs supplied without a usable `id`. Counted, not invented. */
  readonly unusableEntryCount: number;
}

function mapActorType(rawType: string | null): CombatActorType {
  switch (rawType) {
    case "Player":
      return "PLAYER";
    case "Pet":
      return "PET";
    case "NPC":
      return "NPC";
    default:
      return "UNKNOWN";
  }
}

/**
 * Normalizes `ReportMasterData.actors`.
 *
 * `ReportActor.id` is nullable in the schema. An entry without one cannot be
 * referenced by any event, so it is counted rather than given a substitute ID.
 */
export function normalizeActors(rawActors: readonly unknown[]): ActorCatalog {
  const actors = new Map<number, CombatActor>();
  let unusableEntryCount = 0;

  for (const raw of rawActors) {
    if (!isRecord(raw)) {
      unusableEntryCount += 1;
      continue;
    }
    const actorId = readInteger(raw, "id");
    if (actorId === undefined) {
      unusableEntryCount += 1;
      continue;
    }
    const rawType = readString(raw, "type") ?? null;
    actors.set(actorId, {
      actorId,
      gameId: readInteger(raw, "gameID") ?? null,
      name: readString(raw, "name") ?? null,
      server: readString(raw, "server") ?? null,
      actorType: mapActorType(rawType),
      rawType,
      subType: readString(raw, "subType") ?? null,
      petOwnerActorId: readInteger(raw, "petOwner") ?? null,
    });
  }

  return { actors, unusableEntryCount };
}
