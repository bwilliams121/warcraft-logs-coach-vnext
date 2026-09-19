/**
 * `cooldown.<token>.remains` and cooldown READINESS — the Retribution-owned
 * reading of cooldown state (M11-A4).
 *
 * WHAT THIS COMPOSES
 *
 *     src/findings/cooldowns/token-cooldown-derivation
 *                                              the class-neutral derivation:
 *                                              one observed cast, one base,
 *                                              one modifier policy, one
 *                                              position — promoted there
 *                                              verbatim in M11-B2 when a
 *                                              third specialization needed
 *                                              the identical calculation
 *     src/data/game/paladin-retribution-cooldowns
 *                                              the pinned DBC record, the
 *                                              passive-modifier CENSUS and the
 *                                              hand-reviewed dynamic absence
 *                                              proof for each ability
 *     the observed talent tree                 which censused modifiers this
 *                                              actor demonstrably took
 *
 * What stays HERE is exactly what is Retribution's: which dataset answers,
 * which tokens the spender slice asks about, and the names the payload
 * carries. The rules — static modifiers folded in the safe direction only,
 * HASTED/CHARGES refused, a flat-plus-percent composition refused, a lower
 * bound never rounded into a value, the last COMPLETE cast strictly before
 * the decision as the anchor, observable resets proven absent under COMPLETE
 * AURAS coverage — are the shared primitive's and are documented there.
 *
 * ONE-CHARGE SYSTEMS. Wake of Ashes is `_charges` 1 with a 30,000 ms
 * `_charge_cooldown` and a zero `_cooldown`: the shared derivation folds the
 * CHARGE cooldown for a charge system, exactly as SimulationCraft reads it
 * (action.cpp:710-724). Blade of Justice refuses (hasted); its line is
 * decided by the exact-zero stack proofs instead.
 */

import {
  deriveTokenCooldown,
  deriveTokenCooldowns,
  tokenCooldownBindingsFrom,
  type DerivedTokenCooldown,
  type EffectiveBase,
  type StaticModifierAccounting,
  type TokenCooldown,
  type TokenCooldownDataset,
  type TokenCooldownInput,
} from "../../../findings/cooldowns/token-cooldown-derivation.js";
import { retributionCooldownAbilitiesFor } from "../../../data/game/paladin-retribution-cooldowns.js";
import type { NumericBinding } from "../../../simc/expression/evaluate.js";

export {
  effectiveBaseFor,
  dynamicMutationsAbsent,
} from "../../../findings/cooldowns/token-cooldown-derivation.js";
export type { EffectiveBase, StaticModifierAccounting };

/** The tokens whose cooldowns this specialization can currently establish (or refuse for a stated reason). */
export const SUPPORTED_RETRIBUTION_COOLDOWN_TOKENS = [
  "wake_of_ashes",
  "divine_toll",
  "execution_sentence",
  "avenging_wrath",
  "blade_of_justice",
] as const;

export type RetributionCooldownInput = TokenCooldownInput;
export type RetributionDerivedCooldown = DerivedTokenCooldown;
export type RetributionTokenCooldown = TokenCooldown;

/** The Retribution dataset, handed to the shared derivation. */
const RETRIBUTION_COOLDOWN_DATASET: TokenCooldownDataset = Object.freeze({
  abilitiesFor: retributionCooldownAbilitiesFor,
  fallbackSourcePath: "engine/class_modules/paladin/sc_paladin.cpp",
});

/** Derives one supported token's cooldown at a decision position, or `null` for an unpinned token. */
export function deriveRetributionCooldown(
  input: RetributionCooldownInput,
  simcToken: string,
): RetributionTokenCooldown | null {
  return deriveTokenCooldown(RETRIBUTION_COOLDOWN_DATASET, input, simcToken);
}

/** Every supported token at one decision, in declaration order. */
export function deriveSupportedRetributionCooldowns(
  input: RetributionCooldownInput,
): readonly RetributionTokenCooldown[] {
  return deriveTokenCooldowns(RETRIBUTION_COOLDOWN_DATASET, input, SUPPORTED_RETRIBUTION_COOLDOWN_TOKENS);
}

/** The `knownCooldownRemainsSeconds` shape, from the tokens that derived a remainder. */
export function retributionCooldownBindingsFrom(
  cooldowns: readonly RetributionTokenCooldown[],
): readonly { readonly name: string; readonly remainsSeconds: NumericBinding }[] {
  return tokenCooldownBindingsFrom(cooldowns);
}
