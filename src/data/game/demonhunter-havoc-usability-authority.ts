/**
 * Havoc Demon Hunter's pinned POSITIVE-USABILITY authority (ONB-A1): SpellRange,
 * implicit targeting, cast time, channel attributes, category siblings and power
 * rows of the one candidate the positive wiring reads, Reaver's Glaive, and of the
 * corroborating GCD spells a decision cast can be. Produced by
 * `extract-simc-usability-authority.mjs --target demonhunter-havoc`, parsed by the
 * class-neutral `usability-authority-artifact.ts`.
 *
 * WHAT THE DATA SAYS, READ BY MACHINE:
 *
 *   reavers_glaive  0-40 yd  ENEMY_UNIT_TARGET  usable while moving  no power row
 *   annihilation    0-5 yd   ENEMY_UNIT_TARGET  a same-target corroborator
 *   chaos_strike    0-5 yd   ENEMY_UNIT_TARGET  a same-target corroborator
 *   felblade        0-15 yd  ENEMY_UNIT_TARGET  a same-target corroborator
 *   essence_break   0-10 yd  UNTARGETED         corroborates nothing
 *   eye_beam        0-20 yd  UNTARGETED         corroborates nothing
 *
 * NO BASE-COST BOUND IS AVAILABLE. `sc_demon_hunter.cpp` overrides `cost()` five
 * times, so the extractor records none of the class-module cost claims, and
 * `costCannotExceedBase` refuses for every Havoc spell. Reaver's Glaive needs none.
 */

import artifact from "./demonhunter-havoc-usability-authority.json";
import {
  parseUsabilityAuthorityArtifact,
  type UsabilityAuthorityLoad,
  type UsabilityAuthoritySpell,
} from "./usability-authority-artifact.js";

export const HAVOC_USABILITY_AUTHORITY_DATASET_ID = "SIMC_DBC_DEMONHUNTER_HAVOC_USABILITY_AUTHORITY";

let cached: UsabilityAuthorityLoad | null = null;

/** The pinned dataset, or the reason it could not be used. */
export function pinnedHavocUsabilityAuthority(): UsabilityAuthorityLoad {
  cached ??= parseUsabilityAuthorityArtifact(artifact, HAVOC_USABILITY_AUTHORITY_DATASET_ID);
  return cached;
}

/** Test seam. */
export function resetHavocUsabilityAuthorityCache(): void {
  cached = null;
}

/** The pinned record for one spell id, or `null`. */
export function havocUsabilitySpell(spellId: number): UsabilityAuthoritySpell | null {
  const loaded = pinnedHavocUsabilityAuthority();
  if (!loaded.ok) return null;
  return loaded.spells.find((spell) => spell.spellId === spellId) ?? null;
}
