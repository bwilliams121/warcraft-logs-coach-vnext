/**
 * Protection Paladin's pinned ability cooldowns (M10-C5 Phase A): the DBC
 * record of each ability the first-GCD question needed a readiness proof
 * for, the MACHINE CENSUS of passive traits that modify its cooldown, and the
 * hand-reviewed, mechanically re-checked absence proof for dynamic
 * modification in the pinned class module.
 *
 * THREE GRADES OF FACT, KEPT APART
 *
 *   MACHINE_EXTRACTED_DBC_RECORD              the base cooldown and its
 *                                             charge/category scalars
 *   MACHINE_CENSUS_OF_PASSIVE_TRAIT_EFFECTS   which traits of the class,
 *                                             selectable by this spec, would
 *                                             change that cooldown through
 *                                             SimulationCraft's generic passive
 *                                             parser, by how much, and in
 *                                             which DIRECTION
 *   HAND_REVIEWED_CPP_ABSENCE_PROOF           that nothing in the module
 *                                             resets, adjusts, hastes or
 *                                             overrides the cooldown after it
 *                                             starts
 *
 * The census is what a pure module review cannot see: Quickened Invocation
 * shortens Divine Toll by 15 s and Righteous Protector halves Sentinel's
 * cooldown without either ever touching a `cooldowns.*` handle. A consumer
 * that resolves a censused trait as SELECTED applies its value exactly; one
 * that cannot resolve it must assume the modifier in the direction it acts.
 *
 * NO MODIFIER IS APPLIED HERE. This module states the pinned facts; the
 * specialization's cooldown bindings decide what they mean for one actor.
 */

import artifact from "./paladin-protection-cooldowns.json";
import {
  parseAbilityCooldownArtifact,
  type AbilityCooldownLoad,
  type CooldownAliasGroup,
  type DynamicModifierCheck,
  type GroundEffectLifetime,
  type GroundEffectRecord,
  type KnownDynamicMutation,
  type MutationObservableSignature,
  type PassiveCooldownModifier,
  type PassiveModifierDirection,
  type PassiveModifierKind,
  type PassiveModifierOrigin,
  type PinnedCooldownAbility,
} from "./ability-cooldown-artifact.js";

export type {
  DynamicModifierCheck,
  GroundEffectLifetime,
  GroundEffectRecord,
  KnownDynamicMutation,
  MutationObservableSignature,
  PassiveCooldownModifier,
  PassiveModifierDirection,
  PassiveModifierKind,
  PassiveModifierOrigin,
};
/** The M10-C5 names, kept for every Protection consumer; the shapes are the class-neutral ones. */
export type ProtectionCooldownAbility = PinnedCooldownAbility;
export type ProtectionCooldownAliasGroup = CooldownAliasGroup;
export type ProtectionCooldownLoad = AbilityCooldownLoad;

export const PROTECTION_PALADIN_COOLDOWN_DATASET_ID = "SIMC_DBC_PALADIN_PROTECTION_ABILITY_COOLDOWNS";

let cached: ProtectionCooldownLoad | null = null;

/** The class-neutral parser (M11-A4) over THIS specialization's committed artifact. */
function load(): ProtectionCooldownLoad {
  cached ??= parseAbilityCooldownArtifact(artifact, PROTECTION_PALADIN_COOLDOWN_DATASET_ID);
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedProtectionPaladinCooldowns(): ProtectionCooldownLoad {
  return load();
}

/** Test seam. */
export function resetProtectionPaladinCooldownCache(): void {
  cached = null;
}

/**
 * Every pinned ability record for an APL token, one per ability id that the
 * token may resolve to. Empty when the token is not pinned.
 */
export function protectionCooldownAbilitiesFor(simcToken: string): readonly ProtectionCooldownAbility[] {
  const loaded = load();
  if (!loaded.ok) return [];
  return loaded.abilities.filter((ability) => ability.simcToken === simcToken);
}
