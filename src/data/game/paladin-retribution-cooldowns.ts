/**
 * Retribution Paladin's pinned ability cooldowns (M11-A4): the five entries
 * that sit above the unconditional `finishers` call and can preempt an
 * observed spender — Wake of Ashes, Divine Toll, Execution Sentence,
 * Avenging Wrath and Blade of Justice — each with its DBC record, the machine
 * census of passives that modify its cooldown, and the hand-reviewed,
 * mechanically re-checked absence proof against `sc_paladin.cpp` and
 * `sc_paladin_retribution.cpp`. Parsed by the class-neutral
 * `ability-cooldown-artifact.ts`; this module knows nothing about the
 * Protection dataset.
 *
 * WHAT THE CENSUS ESTABLISHED, so no reader has to re-derive it:
 *
 *   - Avenging Wrath's 120,000 ms base is shortened by 60,000 ms by the
 *     "Retribution Paladin" spec passive: always active, folded exactly;
 *   - Divine Toll is shortened 15,000 ms by Quickened Invocation, a CLASS
 *     choice node the actor's tree resolves;
 *   - Wake of Ashes is a one-charge 30,000 ms charge system with no modifier;
 *   - Execution Sentence is a plain 60,000 ms cooldown with no modifier;
 *   - Blade of Justice is HASTED by the spec passive and may carry a second
 *     charge (Improved Blade of Justice): its cooldown bindings REFUSE, as
 *     Protection's refuse every hasted ability, and its line is decided by
 *     the exact-zero stack proofs instead. It also declares three RESET
 *     sites, each with an aura signature, so a future consumer that models
 *     haste could prove them absent.
 *
 * Hammer of Wrath and Judgment are deliberately NOT pinned: Final Verdict
 * resets both on an unobservable proc (sc_paladin_retribution.cpp:720-729),
 * so no cooldown claim about them would be sound.
 */

import artifact from "./paladin-retribution-cooldowns.json";
import {
  parseAbilityCooldownArtifact,
  type AbilityCooldownLoad,
  type PinnedCooldownAbility,
} from "./ability-cooldown-artifact.js";

export const RETRIBUTION_PALADIN_COOLDOWN_DATASET_ID = "SIMC_DBC_PALADIN_RETRIBUTION_ABILITY_COOLDOWNS";

let cached: AbilityCooldownLoad | null = null;

function load(): AbilityCooldownLoad {
  cached ??= parseAbilityCooldownArtifact(artifact, RETRIBUTION_PALADIN_COOLDOWN_DATASET_ID);
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedRetributionPaladinCooldowns(): AbilityCooldownLoad {
  return load();
}

/** Test seam. */
export function resetRetributionPaladinCooldownCache(): void {
  cached = null;
}

/** Every pinned ability record for an APL token. Empty when the token is not pinned. */
export function retributionCooldownAbilitiesFor(simcToken: string): readonly PinnedCooldownAbility[] {
  const loaded = load();
  if (!loaded.ok) return [];
  return loaded.abilities.filter((ability) => ability.simcToken === simcToken);
}
