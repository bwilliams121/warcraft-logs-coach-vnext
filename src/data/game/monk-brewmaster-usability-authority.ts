/**
 * Brewmaster Monk's pinned POSITIVE-USABILITY authority (M11-C4i): SpellRange,
 * implicit targeting, cast time, channel attributes, category siblings, power
 * rows and the machine cost-modifier census of the five spells the positive
 * usability wiring reads — the four candidates (Keg Smash, Blackout Kick,
 * Breath of Fire, Invoke Niuzao) and the corroborating Tiger Palm — produced
 * by `extract-simc-usability-authority.mjs --target monk-brewmaster` from the
 * same pinned commit as every other Brewmaster dataset, and parsed by the
 * class-neutral `usability-authority-artifact.ts`.
 *
 * WHAT THE DATA SAYS, READ BY MACHINE:
 *
 *   tiger_palm      0-5 yd   ENEMY_UNIT_TARGET         not usable while moving
 *   blackout_kick   0-5 yd   ENEMY_UNIT_TARGET         not usable while moving; category 1561 {100784}
 *   keg_smash       0-15 yd  ENEMY_UNIT_TARGET         usable while moving; category 1490 {330911}; 40 Energy,
 *                                                      census: Flow of Battle −100%, 12.0 4pc −5, Empty Barrel 0
 *   breath_of_fire  0 yd     UNTARGETED (90° cone)     no same-target range proof is possible
 *   invoke_niuzao   0-40 yd  ENEMY_TARGET_DESTINATION  usable while moving
 */

import artifact from "./monk-brewmaster-usability-authority.json";
import {
  parseUsabilityAuthorityArtifact,
  type UsabilityAuthorityLoad,
  type UsabilityAuthoritySpell,
} from "./usability-authority-artifact.js";

export const BREWMASTER_USABILITY_AUTHORITY_DATASET_ID = "SIMC_DBC_MONK_BREWMASTER_USABILITY_AUTHORITY";

let cached: UsabilityAuthorityLoad | null = null;

/** The pinned dataset, or the reason it could not be used. */
export function pinnedBrewmasterUsabilityAuthority(): UsabilityAuthorityLoad {
  cached ??= parseUsabilityAuthorityArtifact(artifact, BREWMASTER_USABILITY_AUTHORITY_DATASET_ID);
  return cached;
}

/** Test seam. */
export function resetBrewmasterUsabilityAuthorityCache(): void {
  cached = null;
}

/** The pinned record for one spell id, or `null`. */
export function brewmasterUsabilitySpell(spellId: number): UsabilityAuthoritySpell | null {
  const loaded = pinnedBrewmasterUsabilityAuthority();
  if (!loaded.ok) return null;
  return loaded.spells.find((spell) => spell.spellId === spellId) ?? null;
}

/** The pinned record for one APL token, or `null`. */
export function brewmasterUsabilitySpellForToken(simcToken: string): UsabilityAuthoritySpell | null {
  const loaded = pinnedBrewmasterUsabilityAuthority();
  if (!loaded.ok) return null;
  return loaded.spells.find((spell) => spell.simcToken === simcToken) ?? null;
}
