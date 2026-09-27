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
 *     src/data/game/monk-brewmaster-cooldowns  the seven pinned DBC records
 *                                              (M11-C1, M11-C3a), their passive-modifier
 *                                              CENSUS and the hand-reviewed
 *                                              dynamic absence proofs
 *     the observed talent tree                 whether each censused modifier
 *                                              was demonstrably taken
 *
 * THE SEVEN TOKENS, AND ONLY THESE. The six abilities M11-C1 pinned:
 * `blackout_kick` (a one-charge system, 4,000 ms charge cooldown, two
 * censused Fluidity of Motion rows of −1,000 ms each), `expel_harm`,
 * `chi_burst`, `invoke_niuzao` (Efficient Training −25,000 ms, a Shado-Pan
 * hero talent), `exploding_keg` and `rushing_jade_wind` (its HASTED modifier
 * is a class passive, always active, so the shared derivation always refuses
 * it) — and, since M11-C3a, `breath_of_fire` (15,000 ms, no charges, not
 * hasted), whose one dynamic mutation is the Keg Smash reset under Sal'salabim's
 * Strength. That reset is declared as a CAST_BY_ACTOR signature (121253): a
 * lower bound on Breath of Fire's cooldown stands only while no completed Keg
 * Smash by the actor lies strictly between the anchoring Breath of Fire and the
 * decision; otherwise its readiness is UNKNOWN. The signature is NOT
 * talent-conditioned (the shared schema has no such form, by decision): without
 * Sal'salabim's Strength an intervening Keg Smash withholds a proof it did not
 * need to withhold, which can cost coverage and can never produce a false
 * verdict. Nothing here derives a brew cooldown, a Keg Smash cooldown or a
 * charge count: those tokens are not pinned, the derivation returns nothing for
 * them, and their readiness is UNKNOWN.
 *
 * WHAT THE SLICE READS. `cooldown.blackout_kick.remains` is the one
 * cooldown atom the Shado-Pan list reads (`shado_pan[10]` against 1.3 s);
 * the readiness of every pinned token feeds usability as ACTIVE_COOLDOWN when
 * it is PROVEN_NOT_READY, and never as anything else — for Breath of Fire that
 * is what lets a scan step past `shado_pan[0]` / `shado_pan[13]`.
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

/** The tokens whose cooldowns this specialization can currently establish: the M11-C1 pins plus Breath of Fire (M11-C3a). */
export const SUPPORTED_BREWMASTER_COOLDOWN_TOKENS = [
  "blackout_kick",
  "expel_harm",
  "chi_burst",
  "invoke_niuzao",
  "exploding_keg",
  "rushing_jade_wind",
  "breath_of_fire",
] as const;

export type BrewmasterCooldownInput = TokenCooldownInput;
export type BrewmasterDerivedCooldown = DerivedTokenCooldown;
export type BrewmasterTokenCooldown = TokenCooldown;

/** The Brewmaster dataset, handed to the shared derivation. */
const BREWMASTER_COOLDOWN_DATASET: TokenCooldownDataset = Object.freeze({
  abilitiesFor: brewmasterCooldownAbilitiesFor,
  fallbackSourcePath: "engine/class_modules/monk/sc_monk.cpp",
});

/**
 * Derives one SUPPORTED token's cooldown at a decision position, or `null`
 * for a token outside `SUPPORTED_BREWMASTER_COOLDOWN_TOKENS` — including a
 * pinned one. Keg Smash is pinned since M11-C4i for the POSITIVE readiness
 * proof only; its resets make a NOT_READY lower bound unsound, so it is never
 * derived here.
 */
export function deriveBrewmasterCooldown(
  input: BrewmasterCooldownInput,
  simcToken: string,
): BrewmasterTokenCooldown | null {
  if (!(SUPPORTED_BREWMASTER_COOLDOWN_TOKENS as readonly string[]).includes(simcToken)) return null;
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
