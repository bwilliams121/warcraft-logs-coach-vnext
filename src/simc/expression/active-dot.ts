/**
 * `active_dot.X` and `dot.X.active_dots` as specialization atoms (M11-F).
 *
 * PINNED MEANING (commit 33622e9d): the number of targets currently carrying
 * THIS player's DoT of action X — `player_t::get_active_dots` over the
 * action's dot (player.cpp:12118-12127, 14356-14385;
 * `action_t::create_expression` "active_dots", action.cpp:3623-3631). Both
 * identifiers read the same per-caster counter. It is not `active_enemies`,
 * needs no enemy roster, and a target's demise ends its DoTs
 * (player.cpp:7219-7220).
 *
 * WHAT THIS MODULE DOES
 *
 * It turns a count a specialization established from evidence into the
 * evaluator's `NumericBinding`, under both identifiers. It reads no events
 * and knows no class: the evidence comes from `src/engine/auras/
 * aura-carriers.ts`, and the action -> aura mapping from the specialization
 * that pinned it. A proven lower bound binds `BOUNDED_NUMBER`; anything else
 * binds `UNKNOWN_NUMBER / STATE_NOT_ESTABLISHED`. No exact value is ever bound
 * without a proven upper bound, and none is available today.
 */

import { boundedBelowNumber, unknownNumber, type NumericBinding } from "./evaluate.js";
import type { SpecAtomBinding } from "./spec-vocabulary.js";

/** A specialization's pinned identity for one DoT action. */
export interface ActiveDotMapping {
  /** The SimulationCraft action token, e.g. the `X` of `active_dot.X`. */
  readonly simcToken: string;
  /** The aura identities that DoT carries on its target. */
  readonly auraAbilityGameIds: readonly number[];
  readonly auraClass: "BUFF" | "DEBUFF";
  /** Where the identity was pinned: a dataset id, revision and commit. */
  readonly provenance: string;
}

/**
 * The established count, structurally: a proven lower bound, or nothing.
 * Mirrors `CarrierCount` in the engine without importing it, so the shared
 * SimulationCraft layer stays free of the evidence layer.
 */
export type ActiveDotEvidence =
  | { readonly kind: "AT_LEAST"; readonly lowerBound: number }
  | { readonly kind: "UNKNOWN"; readonly reason: string };

/** Both identifiers SimulationCraft accepts for the same counter. */
export function activeDotIdentifiers(simcToken: string): readonly [string, string] {
  return [`active_dot.${simcToken}`, `dot.${simcToken}.active_dots`];
}

export function activeDotBinding(evidence: ActiveDotEvidence): NumericBinding {
  if (evidence.kind === "AT_LEAST" && Number.isSafeInteger(evidence.lowerBound) && evidence.lowerBound > 0) {
    return boundedBelowNumber(evidence.lowerBound, "STATE_NOT_ESTABLISHED");
  }
  return unknownNumber("STATE_NOT_ESTABLISHED");
}

/** The player-scoped atom bindings for one mapped DoT, under both identifiers. */
export function activeDotAtoms(
  mapping: ActiveDotMapping,
  evidence: ActiveDotEvidence,
): readonly SpecAtomBinding[] {
  const binding = activeDotBinding(evidence);
  return activeDotIdentifiers(mapping.simcToken).map((key) => ({
    key,
    actionToken: null,
    value: { kind: "MAGNITUDE", binding },
  }));
}
