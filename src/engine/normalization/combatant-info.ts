/**
 * Factual gear and build observation from `combatantinfo`.
 *
 * Facts only. No BIS, no "correct enchant", no quality judgement, no
 * optimality. Those need runtime game data and a gameplay authority, neither of
 * which belongs in normalization.
 *
 * Two verified traps are respected here:
 *
 * 1. THE `talents` FIELD IS NOT THE TALENT BUILD. A live capture showed
 *    `talents: []` on a fully-talented player whose `talentTree` was populated.
 *    Reading `talents` would manufacture "this player had no talents", which is
 *    exactly missing data becoming negative evidence. Only `talentTree` is read.
 *
 * 2. GEAR SLOT IS POSITIONAL. Warcraft Logs supplies no slot key on gear
 *    entries, so the slot is the array index and nothing else.
 *
 * Optional gear fields stay optional. A missing enchant is `null`, never `0`
 * and never "no enchant"; an absent `gems` key is `null`, which is a different
 * fact from an empty list.
 */

import { isRecord, isSafeInteger } from "../../wcl/decode.js";
import type { GearPiece, TalentTreeEntry } from "./normalized-events.js";

function readOptionalInteger(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  return isSafeInteger(value) ? value : null;
}

/** `null` when the key was absent. An empty array means an observed empty list. */
function readOptionalIntegerArray(raw: Record<string, unknown>, key: string): readonly number[] | null {
  if (!(key in raw)) {
    return null;
  }
  const value = raw[key];
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter(isSafeInteger);
}

/**
 * Gems are observed as an array of objects or ids depending on the item.
 * Anything that does not yield an id is dropped rather than guessed at.
 */
function readGemIds(raw: Record<string, unknown>): readonly number[] | null {
  if (!("gems" in raw)) {
    return null;
  }
  const value = raw["gems"];
  if (!Array.isArray(value)) {
    return null;
  }
  const ids: number[] = [];
  for (const gem of value) {
    if (isSafeInteger(gem)) {
      ids.push(gem);
      continue;
    }
    if (isRecord(gem)) {
      const id = readOptionalInteger(gem, "id");
      if (id !== null) {
        ids.push(id);
      }
    }
  }
  return ids;
}

export function normalizeGear(value: unknown): readonly GearPiece[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const pieces: GearPiece[] = [];
  value.forEach((entry, slotIndex) => {
    if (!isRecord(entry)) {
      return;
    }
    const itemId = readOptionalInteger(entry, "id");
    if (itemId === null) {
      return;
    }
    pieces.push({
      // Positional. There is no slot key in the payload.
      slotIndex,
      itemId,
      itemLevel: readOptionalInteger(entry, "itemLevel"),
      quality: readOptionalInteger(entry, "quality"),
      permanentEnchantId: readOptionalInteger(entry, "permanentEnchant"),
      temporaryEnchantId: readOptionalInteger(entry, "temporaryEnchant"),
      gemIds: readGemIds(entry),
      bonusIds: readOptionalIntegerArray(entry, "bonusIDs"),
      setId: readOptionalInteger(entry, "setID"),
    });
  });
  return pieces;
}

/**
 * Reads `talentTree`, and deliberately never `talents`.
 *
 * See trap 1 in the module comment. A regression test pins this.
 */
export function normalizeTalentTree(value: unknown): readonly TalentTreeEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: TalentTreeEntry[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = readOptionalInteger(entry, "id");
    if (id === null) {
      continue;
    }
    entries.push({
      id,
      rank: readOptionalInteger(entry, "rank"),
      nodeId: readOptionalInteger(entry, "nodeID"),
    });
  }
  return entries;
}
