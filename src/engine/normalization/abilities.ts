/**
 * Factual ability identity.
 *
 * `ReportAbility` exposes no report-local id — `gameID` is the only identity
 * available, and it is nullable. An ability without one cannot be referenced,
 * so it is counted rather than given a substitute.
 *
 * Names are convenience; the ID is the fact. An event referencing a game ID
 * absent from this catalog keeps its `abilityGameId` and simply resolves to no
 * `CombatAbility` — unnamed, not dropped, not invented.
 */

import { isRecord, readInteger, readString } from "../../wcl/decode.js";

export interface CombatAbility {
  readonly gameId: number;
  readonly name: string | null;
  /** `ReportAbility.type` — the damage/spell school. */
  readonly school: string | null;
}

export interface AbilityCatalog {
  readonly abilities: ReadonlyMap<number, CombatAbility>;
  readonly unusableEntryCount: number;
}

export function normalizeAbilities(rawAbilities: readonly unknown[]): AbilityCatalog {
  const abilities = new Map<number, CombatAbility>();
  let unusableEntryCount = 0;

  for (const raw of rawAbilities) {
    if (!isRecord(raw)) {
      unusableEntryCount += 1;
      continue;
    }
    const gameId = readInteger(raw, "gameID");
    if (gameId === undefined) {
      unusableEntryCount += 1;
      continue;
    }
    abilities.set(gameId, {
      gameId,
      name: readString(raw, "name") ?? null,
      school: readString(raw, "type") ?? null,
    });
  }

  return { abilities, unusableEntryCount };
}
