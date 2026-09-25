/**
 * `cooldown.<token>.remains` and cooldown READINESS — the Brewmaster-owned
 * reading of cooldown state (M11-C2).
 *
 * WHAT THIS COMPOSES
 *
 *     src/findings/cooldowns/token-cooldown-derivation
 *                                              the class-neutral derivation:
 *                                              one observed cast, one base,
 *                                              one modifier policy, one
 *                                              position
 *     src/data/game/monk-brewmaster-cooldowns  the six pinned DBC records of
 *                                              M11-C1, their passive-modifier
 *                                              CENSUS and the hand-reviewed
 *                                              dynamic absence proofs
 *     the observed talent tree                 whether each censused modifier
 *                                              was demonstrably taken
 *
 * THE SIX TOKENS, AND ONLY THESE. Exactly the abilities M11-C1 pinned:
 * `blackout_kick` (a one-charge system, 4,000 ms charge cooldown, two
 * censused Fluidity of Motion rows of −1,000 ms each), `expel_harm`,
 * `chi_burst`, `invoke_niuzao` (Efficient Training −25,000 ms, a Shado-Pan
 * hero talent), `exploding_keg` and `rushing_jade_wind` (its HASTED modifier
 * is a class passive, always active, so the shared derivation always refuses
 * it). Nothing here derives a brew cooldown,
 * a Keg Smash or Breath of Fire cooldown, or a charge count: those tokens are
 * not pinned, the derivation returns nothing for them, and their readiness is
 * UNKNOWN.
 *
 * WHAT THE SLICE READS. `cooldown.blackout_kick.remains` is the one
 * cooldown atom the Shado-Pan list reads (`shado_pan[10]` against 1.3 s);
 * the readiness of every pinned token feeds usability as ACTIVE_COOLDOWN when
 * it is PROVEN_NOT_READY, and never as anything else.
 */

import {
  deriveTokenCooldown,
  deriveTokenCooldowns,
  tokenCooldownBindingsFrom,
  type DerivedTokenCooldown,
  type TokenCooldown,
  type TokenCooldownDataset,
  type TokenCooldownInput,
} from "../../../findings/cooldowns/token-cooldown-derivation.js";
import { brewmasterCooldownAbilitiesFor } from "../../../data/game/monk-brewmaster-cooldowns.js";
import type { NumericBinding } from "../../../simc/expression/evaluate.js";

/** The tokens whose cooldowns this specialization can currently establish: exactly the M11-C1 pins. */
export const SUPPORTED_BREWMASTER_COOLDOWN_TOKENS = [
  "blackout_kick",
  "expel_harm",
  "chi_burst",
  "invoke_niuzao",
  "exploding_keg",
  "rushing_jade_wind",
] as const;

export type BrewmasterCooldownInput = TokenCooldownInput;
export type BrewmasterDerivedCooldown = DerivedTokenCooldown;
export type BrewmasterTokenCooldown = TokenCooldown;

/** The Brewmaster dataset, handed to the shared derivation. */
const BREWMASTER_COOLDOWN_DATASET: TokenCooldownDataset = Object.freeze({
  abilitiesFor: brewmasterCooldownAbilitiesFor,
  fallbackSourcePath: "engine/class_modules/monk/sc_monk.cpp",
});

/** Derives one supported token's cooldown at a decision position, or `null` for an unpinned token. */
export function deriveBrewmasterCooldown(
  input: BrewmasterCooldownInput,
  simcToken: string,
): BrewmasterTokenCooldown | null {
  return deriveTokenCooldown(BREWMASTER_COOLDOWN_DATASET, input, simcToken);
}

/** Every supported token at one decision, in declaration order. */
export function deriveSupportedBrewmasterCooldowns(
  input: BrewmasterCooldownInput,
): readonly BrewmasterTokenCooldown[] {
  return deriveTokenCooldowns(BREWMASTER_COOLDOWN_DATASET, input, SUPPORTED_BREWMASTER_COOLDOWN_TOKENS);
}

/** The `knownCooldownRemainsSeconds` shape, from the tokens that derived a remainder. */
export function brewmasterCooldownBindingsFrom(
  cooldowns: readonly BrewmasterTokenCooldown[],
): readonly { readonly name: string; readonly remainsSeconds: NumericBinding }[] {
  return tokenCooldownBindingsFrom(cooldowns);
}
