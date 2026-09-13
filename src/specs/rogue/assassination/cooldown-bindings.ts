/**
 * `cooldown.<name>.remains` — the Assassination-owned reading of cooldown state.
 *
 * WHAT THIS COMPOSES
 *
 *     src/engine/game-state/cooldowns   the generic derivation
 *     src/data/game/rogue-cooldowns     the pinned base cooldown and the
 *                                       hand-reviewed modifier absence proof
 *
 * Neither half knows the other. The engine primitive takes a base cooldown and a
 * modifier policy as INPUTS and has no idea which abilities exist; the artifact
 * is data with no opinion about how it is used. This module is where the
 * specialization says "these are the cooldowns my authority conditions read, and
 * this is the evidence behind each one".
 *
 * THE MODIFIER POLICY IS CARRIED, NOT ASSUMED
 *
 * The generic primitive refuses to derive anything without a positive proof that
 * nothing can change the cooldown, because Warcraft Logs has no cooldown-reset
 * event to look for — absence of evidence would be silence, not proof. So the
 * artifact's hand-reviewed absence proof is translated into that policy here,
 * claims and source hash included. An ability whose artifact entry is missing
 * simply gets no binding, and the expression atom stays UNKNOWN_NUMBER.
 *
 * MILLISECONDS TO SECONDS, EXACTLY ONCE
 *
 * The artifact and the engine work in MILLISECONDS. SimulationCraft expressions
 * are in SECONDS. The single `/ 1000` in this file is the only place the two
 * meet, and the field it produces is named `remainsSeconds` so a caller cannot
 * mistake it. Reading 57198 as seconds would satisfy every `remains<=` threshold
 * in the pinned APL and never once look wrong.
 *
 * THE EPISTEMIC GRADE SURVIVES THE CONVERSION
 *
 * A BOUNDED derivation becomes a BOUNDED binding, not a known one. Flattening
 * "at least 57.198 s" into "57.198 s" would state a value nobody proved — and it
 * would do so invisibly, because the comparison it feeds comes out the same
 * either way. The expression layer is what must know the difference, so the
 * binding carries the whole `NumericBinding` rather than a bare number.
 */

import {
  cooldownRemainingAt,
  type CooldownModifierPolicy,
  type CooldownState,
} from "../../../engine/game-state/cooldowns/cooldown-state.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import { boundedBelowNumber, knownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";
import { cooldownForToken } from "../../../data/game/rogue-cooldowns.js";

/**
 * The cooldowns this specialization can currently establish.
 *
 * ONE token. `cds[0]` is the only supported authority line that reads a
 * cooldown, and it reads exactly this one. Entries appear when a decision needs
 * them, never speculatively.
 */
export const SUPPORTED_COOLDOWN_TOKENS = ["kingsbane"] as const;

export interface CooldownBindingInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index of the decision point. Never an ingestion ordinal. */
  readonly position: number;
}

/** One derived cooldown, with the state that produced it kept for auditing. */
export interface DerivedCooldown {
  readonly simcToken: string;
  readonly abilityGameId: number;
  readonly cooldown: CooldownState;
  /**
   * SECONDS, for a SimulationCraft expression, with its epistemic grade intact.
   *
   * `null` when nothing was derivable. An EXACT derivation becomes a known
   * number; a BOUNDED one becomes a bounded binding and NEVER a known number.
   */
  readonly remainsSeconds: NumericBinding | null;
}

/**
 * Translates the artifact's hand-reviewed absence proof into the engine's policy.
 *
 * The grade is preserved rather than upgraded: what arrives as a human's reading
 * of a C++ module leaves as `NO_MODIFIERS_PROVEN_ABSENT` carrying that module's
 * path, hash and the individual claims. A reader of the result can see exactly
 * what was checked and re-run it.
 */
function policyFrom(entry: {
  readonly modifierPolicy: {
    readonly sourcePath: string;
    readonly sourceSha256: string;
    readonly checks: readonly { readonly claim: string }[];
  };
}): CooldownModifierPolicy {
  return {
    kind: "NO_MODIFIERS_PROVEN_ABSENT",
    sourcePath: entry.modifierPolicy.sourcePath,
    sourceSha256: entry.modifierPolicy.sourceSha256,
    claims: entry.modifierPolicy.checks.map((check) => check.claim),
  };
}

/** Derives one supported cooldown at a decision position. */
export function deriveCooldown(input: CooldownBindingInput, simcToken: string): DerivedCooldown | null {
  const identity = cooldownForToken(simcToken);
  if (identity === null) return null;

  const cooldown = cooldownRemainingAt({
    state: input.state,
    actorId: input.actorId,
    abilityGameId: identity.abilityGameId,
    baseCooldownMs: identity.baseCooldownMs,
    // The CHARGE COOLDOWN, not the charge count. `_charges = 0` in DBC means
    // there is no charge system at all, so a count-based guard would have read
    // "zero charges" out of a record that says "not a charge ability".
    chargeCooldownMs: identity.chargeCooldownMs,
    modifierPolicy: policyFrom(identity),
    position: input.position,
  });

  return {
    simcToken: identity.simcToken,
    abilityGameId: identity.abilityGameId,
    cooldown,
    remainsSeconds: bindingFrom(cooldown),
  };
}

/**
 * THE ONE MILLISECONDS -> SECONDS CONVERSION, grade preserved.
 *
 * EXACT becomes a known number. BOUNDED becomes a bounded binding carrying the
 * same lower bound in seconds. UNKNOWN becomes `null`, so the atom is omitted
 * entirely and resolves UNKNOWN_NUMBER rather than zero.
 */
function bindingFrom(cooldown: CooldownState): NumericBinding | null {
  switch (cooldown.state) {
    case "EXACT":
      return knownNumber(cooldown.remainingMs / 1000);
    case "BOUNDED":
      return boundedBelowNumber(cooldown.atLeastRemainingMs / 1000, "STATE_NOT_ESTABLISHED");
    case "UNKNOWN":
      return null;
  }
}

/**
 * Every supported cooldown this specialization can establish at a position.
 *
 * Returns only the ones that were actually derived. A cooldown that came back
 * UNKNOWN is OMITTED rather than bound, so the expression atom stays
 * UNKNOWN_NUMBER — which is the honest answer and, unlike a zero, is not read as
 * "ready now".
 */
export function deriveSupportedCooldowns(input: CooldownBindingInput): readonly DerivedCooldown[] {
  const derived: DerivedCooldown[] = [];
  for (const token of SUPPORTED_COOLDOWN_TOKENS) {
    const entry = deriveCooldown(input, token);
    if (entry !== null) derived.push(entry);
  }
  return derived;
}

/** The expression-binding shape, built from derived cooldowns that are known. */
export function cooldownBindingsFrom(
  derived: readonly DerivedCooldown[],
): readonly { readonly name: string; readonly remainsSeconds: NumericBinding }[] {
  const bindings: { name: string; remainsSeconds: NumericBinding }[] = [];
  for (const entry of derived) {
    if (entry.remainsSeconds === null) continue;
    bindings.push({ name: entry.simcToken, remainsSeconds: entry.remainsSeconds });
  }
  return bindings;
}
