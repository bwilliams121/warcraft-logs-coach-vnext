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
 * Optional gear fields are normalised ONCE, here, into `GearEnchantState` /
 * `GearGemsState` (M10-C4). An OMITTED key on a valid row is KNOWN_NONE under
 * the dated Warcraft Logs contract `WCL_GEAR_UI_SEMANTICS_REVISION` — the
 * only place that reading is made, and the only reason it is made. A key that
 * is PRESENT but null, zero or malformed is UNKNOWN: nothing about it is
 * claimed, least of all "none". No consumer reads the raw keys.
 *
 * 3. AN EMPTY SLOT IS A PLACEHOLDER ROW, NOT A MISSING ROW. Warcraft Logs
 *    fills a slot with nothing in it as `{ id: 0, quality: 1,
 *    icon: "inv_axe_02.jpg", itemLevel: 0 }` — observed on the shirt (index
 *    3), tabard (17) and off-hand (16) slots across five committed artifacts.
 *    `normalizeGear` keeps the row so the array stays positional; the
 *    `isEmptyGearSlot` reading is where a consumer learns that the row holds
 *    no item. No item has id 0 in the pinned DBC tables.
 */

import { isRecord, isSafeInteger } from "../../wcl/decode.js";
import {
  WCL_GEAR_UI_SEMANTICS_REVISION,
  type GearEnchantState,
  type GearGemsState,
  type GearPiece,
  type TalentTreeEntry,
} from "./normalized-events.js";

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
 * One optional enchant identity, under the dated contract. An OWN-property
 * check decides omission, so an inherited or `undefined`-valued key is never
 * mistaken for an absent one.
 */
export function readEnchantState(raw: Record<string, unknown>, key: string): GearEnchantState {
  if (!Object.prototype.hasOwnProperty.call(raw, key)) {
    return { state: "KNOWN_NONE", contract: WCL_GEAR_UI_SEMANTICS_REVISION };
  }
  const value = raw[key];
  if (value === null) return { state: "UNKNOWN", reason: "NULL_VALUE" };
  if (!isSafeInteger(value) || value < 0) return { state: "UNKNOWN", reason: "MALFORMED_VALUE" };
  if (value === 0) return { state: "UNKNOWN", reason: "ZERO_VALUE" };
  return { state: "KNOWN", enchantId: value };
}

/**
 * The installed gems, under the dated contract. Gems are observed as an array
 * of objects carrying `id` (or bare ids). An OMITTED key is KNOWN_NONE; a
 * present EMPTY array is KNOWN with no ids (an observed empty list); an entry
 * that yields no id makes the whole field UNKNOWN — a gem that cannot be
 * read is not a gem that is not there.
 */
export function readGemsState(raw: Record<string, unknown>): GearGemsState {
  if (!Object.prototype.hasOwnProperty.call(raw, "gems")) {
    return { state: "KNOWN_NONE", contract: WCL_GEAR_UI_SEMANTICS_REVISION };
  }
  const value = raw["gems"];
  if (value === null) return { state: "UNKNOWN", reason: "NULL_VALUE" };
  if (!Array.isArray(value)) return { state: "UNKNOWN", reason: "MALFORMED_VALUE" };
  const ids: number[] = [];
  for (const gem of value) {
    const id = isSafeInteger(gem) ? gem : isRecord(gem) ? readOptionalInteger(gem, "id") : null;
    if (id === null || id <= 0) return { state: "UNKNOWN", reason: "MALFORMED_VALUE" };
    ids.push(id);
  }
  return { state: "KNOWN", gemIds: ids };
}

/** The installed gem ids a consumer may act on, or `null` while the field is UNKNOWN. */
export function installedGemIds(gems: GearGemsState): readonly number[] | null {
  if (gems.state === "UNKNOWN") return null;
  return gems.state === "KNOWN" ? gems.gemIds : [];
}

/**
 * Whether a gear row is the placeholder Warcraft Logs writes for an empty slot
 * (trap 3 in the module comment): item id 0 AND item level 0. A row with id 0
 * and a non-zero level is not something any committed capture has shown, and
 * it is not called empty.
 */
export function isEmptyGearSlot(piece: Pick<GearPiece, "itemId" | "itemLevel">): boolean {
  return piece.itemId === 0 && piece.itemLevel === 0;
}

export function normalizeGear(value: unknown): {
  readonly pieces: readonly GearPiece[];
  readonly malformedRows: readonly number[];
} {
  if (!Array.isArray(value)) {
    return { pieces: [], malformedRows: [] };
  }
  const pieces: GearPiece[] = [];
  const malformedRows: number[] = [];
  value.forEach((entry, slotIndex) => {
    if (!isRecord(entry)) {
      malformedRows.push(slotIndex);
      return;
    }
    const itemId = readOptionalInteger(entry, "id");
    if (itemId === null) {
      malformedRows.push(slotIndex);
      return;
    }
    pieces.push({
      // Positional. There is no slot key in the payload.
      slotIndex,
      itemId,
      itemLevel: readOptionalInteger(entry, "itemLevel"),
      quality: readOptionalInteger(entry, "quality"),
      permanentEnchant: readEnchantState(entry, "permanentEnchant"),
      temporaryEnchant: readEnchantState(entry, "temporaryEnchant"),
      gems: readGemsState(entry),
      bonusIds: readOptionalIntegerArray(entry, "bonusIDs"),
      setId: readOptionalInteger(entry, "setID"),
    });
  });
  return { pieces, malformedRows };
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
