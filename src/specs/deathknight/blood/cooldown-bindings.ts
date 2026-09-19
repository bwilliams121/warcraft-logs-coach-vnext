/**
 * `cooldown.<token>.remains` and cooldown READINESS — the Blood-owned reading
 * of cooldown state (M11-B2).
 *
 * WHAT THIS COMPOSES
 *
 *     src/findings/cooldowns/token-cooldown-derivation
 *                                              the class-neutral derivation:
 *                                              one observed cast, one base,
 *                                              one modifier policy, one
 *                                              position (promoted there in
 *                                              M11-B2 from the M11-A4 Paladin
 *                                              module, verbatim)
 *     src/data/game/deathknight-blood-cooldowns
 *                                              the pinned DBC record, the
 *                                              passive-modifier CENSUS and the
 *                                              hand-reviewed dynamic absence
 *                                              proof for Dancing Rune Weapon
 *     the observed talent tree                 whether Insatiable Blade was
 *                                              demonstrably taken
 *
 * ONE TOKEN. Dancing Rune Weapon is the only Blood cooldown the slice can
 * establish: base 120,000 ms, one censused static modifier (Insatiable
 * Blade, −30,000 ms, a Blood specialization trait), no dynamic mutation in
 * the pinned module. The two subjects cast it 92 s apart, consistent with
 * the 90,000 ms effective base. Vampiric Blood is NOT pinned — Red Thirst
 * shortens it dynamically by Runic Power spent (sc_death_knight.cpp:
 * 13143-13147), and the subject's two casts are 62 s apart against a 90 s
 * DBC base — so `cooldown.vampiric_blood.*` is never read and its readiness
 * is UNKNOWN. Raise Dead's readiness is pet state; also UNKNOWN.
 *
 * WHY DANCING RUNE WEAPON MATTERS TO THE MEASUREMENT. It is the one
 * GCD-consuming entry of `high_prio_actions`, and its gate reads
 * `fight_remains` (PREDICTIVE) alongside `time>300`; the gate never resolves
 * before +300 s. A scan gets past the entry only when its cooldown is
 * PROVEN active from an observed cast, so every decision inside 90 s of a
 * Dancing Rune Weapon cast in the bundle's history passes it, and every
 * decision before the first observed cast blocks on it.
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
import { bloodCooldownAbilitiesFor } from "../../../data/game/deathknight-blood-cooldowns.js";
import type { NumericBinding } from "../../../simc/expression/evaluate.js";

/** The tokens whose cooldowns this specialization can currently establish. */
export const SUPPORTED_BLOOD_COOLDOWN_TOKENS = ["dancing_rune_weapon"] as const;

export type BloodCooldownInput = TokenCooldownInput;
export type BloodDerivedCooldown = DerivedTokenCooldown;
export type BloodTokenCooldown = TokenCooldown;

/** The Blood dataset, handed to the shared derivation. */
const BLOOD_COOLDOWN_DATASET: TokenCooldownDataset = Object.freeze({
  abilitiesFor: bloodCooldownAbilitiesFor,
  fallbackSourcePath: "engine/class_modules/sc_death_knight.cpp",
});

/** Derives one supported token's cooldown at a decision position, or `null` for an unpinned token. */
export function deriveBloodCooldown(input: BloodCooldownInput, simcToken: string): BloodTokenCooldown | null {
  return deriveTokenCooldown(BLOOD_COOLDOWN_DATASET, input, simcToken);
}

/** Every supported token at one decision, in declaration order. */
export function deriveSupportedBloodCooldowns(input: BloodCooldownInput): readonly BloodTokenCooldown[] {
  return deriveTokenCooldowns(BLOOD_COOLDOWN_DATASET, input, SUPPORTED_BLOOD_COOLDOWN_TOKENS);
}

/** The `knownCooldownRemainsSeconds` shape, from the tokens that derived a remainder. */
export function bloodCooldownBindingsFrom(
  cooldowns: readonly BloodTokenCooldown[],
): readonly { readonly name: string; readonly remainsSeconds: NumericBinding }[] {
  return tokenCooldownBindingsFrom(cooldowns);
}
