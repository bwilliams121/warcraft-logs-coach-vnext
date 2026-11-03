/**
 * Havoc Demon Hunter's pinned ability cooldowns (ONB-A1), and the one reviewed
 * fact needed to anchor Metamorphosis on what the log reports.
 *
 * THE RECORDS. Metamorphosis (191427, 120,000 ms) and The Hunt (370965, 90,000 ms),
 * each with the machine census of passives that modify it and the hand-reviewed
 * dynamic policy against `sc_demon_hunter.cpp`, parsed by the class-neutral
 * `ability-cooldown-artifact.ts`.
 *
 * THE HUNT'S RECORD IS NEVER USED AS A BOUND. The census gives 75,000 ms with
 * Eternal Hunt (-15,000 ms). The retained fight-48 subject casts The Hunt 61,273,
 * 67,509, 65,045, 81,411 and 61,219 ms apart, faster than that bound allows, and
 * every pinned SimulationCraft commit carries the same two numbers. The pinned
 * model does not explain the wire, so The Hunt's readiness stays UNKNOWN
 * (`cooldown-bindings.ts`). The record stays in the artifact so the disagreement is
 * pinned rather than forgotten.
 *
 * METAMORPHOSIS'S ANCHOR. The action runs on 191427, and the log reports only the
 * leap's IMPACT, 200166, after the press (`metamorphosis_impact_t`,
 * sc_demon_hunter.cpp:4890-4896; `travel_time` is `min_gcd`, 1 s plus lag, :4946-4958).
 * Anchoring on the impact starts the clock too late, which could overstate what
 * remains. The delay is not assumed to be small. It is ESTABLISHED leap by leap:
 * `metamorphosis_t::execute` gains the buff at the start of the leap (:5005-5006), so
 * an application of `METAMORPHOSIS_BUFF_WIRE_ABILITY_ID` within
 * `METAMORPHOSIS_IMPACT_ANCHOR_MARGIN_MS` before the impact shows that this leap's
 * press was within the margin (`cooldown-bindings.ts`). The base is shortened by the
 * margin. A leap with no such application proves nothing, and no bound is claimed
 * from it. The retained subject's three leaps show it 923, 899 and 919 ms before the
 * impact. A player is pacified during the leap, so an unrelated application inside the
 * window is not expected; it is a stated limit of the rule.
 *
 * WHAT IS NOT PINNED, AND WHY: `extract-simc-ability-cooldowns.mjs`
 * (DEMONHUNTER_HAVOC_TARGET) records the reason for each of Eye Beam, Blade Dance,
 * Essence Break, Immolation Aura, Felblade and Vengeful Retreat. No claim is made
 * about any of them.
 */

import artifact from "./demonhunter-havoc-cooldowns.json";
import {
  parseAbilityCooldownArtifact,
  type AbilityCooldownLoad,
  type PinnedCooldownAbility,
} from "./ability-cooldown-artifact.js";

export const HAVOC_DEMON_HUNTER_COOLDOWN_DATASET_ID = "SIMC_DBC_DEMONHUNTER_HAVOC_ABILITY_COOLDOWNS";

/** The spell the log reports for a Metamorphosis leap: its impact, never the press. */
export const METAMORPHOSIS_IMPACT_WIRE_ABILITY_ID = 200166;

/** The buff a leap gains at its start: the observed edge that bounds this leap's delay. */
export const METAMORPHOSIS_BUFF_WIRE_ABILITY_ID = 162264;

/**
 * How far before the impact the leap's buff edge may sit, and what is taken off the
 * pinned base. A wider window admits a later leap and a larger base reduction withholds
 * more: the rule only ever proves what an observed edge inside the window supports.
 */
export const METAMORPHOSIS_IMPACT_ANCHOR_MARGIN_MS = 2000;

let cached: AbilityCooldownLoad | null = null;

function load(): AbilityCooldownLoad {
  cached ??= parseAbilityCooldownArtifact(artifact, HAVOC_DEMON_HUNTER_COOLDOWN_DATASET_ID);
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedHavocDemonHunterCooldowns(): AbilityCooldownLoad {
  return load();
}

/** Test seam. */
export function resetHavocDemonHunterCooldownCache(): void {
  cached = null;
}

/** Every pinned ability record for an APL token. Empty when the token is not pinned. */
export function havocCooldownAbilitiesFor(simcToken: string): readonly PinnedCooldownAbility[] {
  const loaded = load();
  if (!loaded.ok) return [];
  return loaded.abilities.filter((ability) => ability.simcToken === simcToken);
}

/**
 * The record the derivation runs on for Metamorphosis: the pinned one, anchored on
 * the impact the log reports, with its base shortened by the margin. Empty when the
 * record did not load.
 */
export function havocMetamorphosisImpactAnchoredRecord(): readonly PinnedCooldownAbility[] {
  return havocCooldownAbilitiesFor("metamorphosis").map((ability) => ({
    ...ability,
    abilityGameId: METAMORPHOSIS_IMPACT_WIRE_ABILITY_ID,
    baseCooldownMs: ability.baseCooldownMs - METAMORPHOSIS_IMPACT_ANCHOR_MARGIN_MS,
  }));
}
