/**
 * ONE gear-slot mapping (M11-G3-2):
 *
 *   Warcraft Logs combatantinfo gear POSITION -> canonical slot -> engine slot
 *
 * Warcraft Logs supplies no slot key; position is the only slot evidence
 * (`combatant-info.ts`, trap 2). The canonical slot names ARE the pinned
 * engine's slot tokens (util.cpp slot_type_string), so canonical -> engine is
 * the identity — written out here so no consumer re-derives it.
 *
 * Every consumer reads positions through this table; nothing indexes the WCL
 * array by a literal number.
 */

import { GEAR_SLOTS } from "../simulation/job.js";

export type GearSlot = (typeof GEAR_SLOTS)[number];

export interface GearSlotMapping {
  readonly wclPosition: number;
  readonly slot: GearSlot;
  readonly engineSlot: GearSlot;
  /**
   * Items in this slot carry no stats, so the pinned report omits them from
   * its gear echo (report_json.cpp:387). Evidence is still kept.
   */
  readonly statless: boolean;
}

export const GEAR_SLOT_MAPPINGS: readonly GearSlotMapping[] = GEAR_SLOTS.map((slot, wclPosition) => ({
  wclPosition,
  slot,
  engineSlot: slot,
  statless: slot === "shirt" || slot === "tabard",
}));

export const WCL_GEAR_POSITION_COUNT = GEAR_SLOT_MAPPINGS.length;

export function slotForPosition(position: number): GearSlotMapping | null {
  return GEAR_SLOT_MAPPINGS.find((mapping) => mapping.wclPosition === position) ?? null;
}
