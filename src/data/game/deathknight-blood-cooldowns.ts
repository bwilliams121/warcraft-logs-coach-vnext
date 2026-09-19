/**
 * Blood Death Knight's pinned ability cooldowns (M11-B2): ONE entry, Dancing
 * Rune Weapon — its DBC record, the machine census of passives that modify
 * its cooldown, and the hand-reviewed, mechanically re-checked absence proof
 * against `sc_death_knight.cpp`. Parsed by the class-neutral
 * `ability-cooldown-artifact.ts`; this module knows nothing about any
 * Paladin dataset.
 *
 * WHY ONLY ONE. Dancing Rune Weapon is the GCD-consuming entry of
 * `high_prio_actions` whose gate reads `fight_remains` and so never resolves
 * before +300 s; a scan gets past it only when its cooldown is PROVEN active
 * from an observed cast. The census establishes one modifier — Insatiable
 * Blade, a Blood specialization trait, −30,000 ms — so the effective base is
 * exactly 90,000 ms when the trait is SELECTED and a 90,000 ms lower bound
 * when it is UNKNOWN. Vampiric Blood (Red Thirst adjusts it dynamically by
 * Runic Power spent, sc_death_knight.cpp:13143-13147), Raise Dead, Blood
 * Boil, Consumption and Death and Decay are deliberately unpinned: no
 * cooldown claim about them is made, and their entries are measured as
 * UNKNOWN.
 */

import artifact from "./deathknight-blood-cooldowns.json";
import {
  parseAbilityCooldownArtifact,
  type AbilityCooldownLoad,
  type PinnedCooldownAbility,
} from "./ability-cooldown-artifact.js";

export const BLOOD_DEATH_KNIGHT_COOLDOWN_DATASET_ID = "SIMC_DBC_DEATHKNIGHT_BLOOD_ABILITY_COOLDOWNS";

let cached: AbilityCooldownLoad | null = null;

function load(): AbilityCooldownLoad {
  cached ??= parseAbilityCooldownArtifact(artifact, BLOOD_DEATH_KNIGHT_COOLDOWN_DATASET_ID);
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedBloodDeathKnightCooldowns(): AbilityCooldownLoad {
  return load();
}

/** Test seam. */
export function resetBloodDeathKnightCooldownCache(): void {
  cached = null;
}

/** Every pinned ability record for an APL token. Empty when the token is not pinned. */
export function bloodCooldownAbilitiesFor(simcToken: string): readonly PinnedCooldownAbility[] {
  const loaded = load();
  if (!loaded.ok) return [];
  return loaded.abilities.filter((ability) => ability.simcToken === simcToken);
}
