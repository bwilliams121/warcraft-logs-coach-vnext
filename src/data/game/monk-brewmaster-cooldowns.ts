/**
 * Brewmaster Monk's pinned ability cooldowns (M11-C2 loader over the M11-C1
 * dataset): six entries — Blackout Kick, Expel Harm, Chi Burst, Invoke Niuzao,
 * Exploding Keg and Rushing Jade Wind — each with its DBC record, the machine
 * census of passives that modify its cooldown, and the hand-reviewed dynamic
 * absence proof against `sc_monk.cpp`. Parsed by the class-neutral
 * `ability-cooldown-artifact.ts`; this module knows nothing about any other
 * specialization's dataset.
 *
 * WHAT IS NOT PINNED, AND WHY. The five brew cooldowns (`purifying_brew`,
 * `celestial_brew`, `celestial_infusion`, `black_ox_brew`, `fortifying_brew`)
 * live in the module's `brews` container, which Keg Smash and Tiger Palm
 * (among others) shorten and Black Ox Brew resets (sc_monk.cpp:874, :2606,
 * :3122, :4168); Keg Smash and Breath of Fire carry
 * cast-driven resets; Empty the Cellar has no DBC cooldown at all. No claim
 * about any of them is made, and a decision that needs one stays UNKNOWN.
 */

import artifact from "./monk-brewmaster-cooldowns.json";
import {
  parseAbilityCooldownArtifact,
  type AbilityCooldownLoad,
  type PinnedCooldownAbility,
} from "./ability-cooldown-artifact.js";

export const BREWMASTER_MONK_COOLDOWN_DATASET_ID = "SIMC_DBC_MONK_BREWMASTER_ABILITY_COOLDOWNS";

let cached: AbilityCooldownLoad | null = null;

function load(): AbilityCooldownLoad {
  cached ??= parseAbilityCooldownArtifact(artifact, BREWMASTER_MONK_COOLDOWN_DATASET_ID);
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedBrewmasterMonkCooldowns(): AbilityCooldownLoad {
  return load();
}

/** Test seam. */
export function resetBrewmasterMonkCooldownCache(): void {
  cached = null;
}

/** Every pinned ability record for an APL token. Empty when the token is not pinned. */
export function brewmasterCooldownAbilitiesFor(simcToken: string): readonly PinnedCooldownAbility[] {
  const loaded = load();
  if (!loaded.ok) return [];
  return loaded.abilities.filter((ability) => ability.simcToken === simcToken);
}
