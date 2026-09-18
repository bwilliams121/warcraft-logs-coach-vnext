/**
 * Holy Power at a Retribution spender decision (M11-A4) — an OBSERVATION,
 * never a replay.
 *
 * WHAT THE WIRE CARRIES. A costed Holy Power spender cast carries a
 * `classResources` entry of type 9 with the amount BEFORE its own cost
 * (M4's `PRE_COST` sampling contract, corroborated for Retribution by
 * `resource-types.ts`); a spender cast that was FREE — Divine Purpose — carries
 * no type-9 entry at all. Both M11-A4 subjects show exactly that: 51 costed
 * spender casts with `t9=n/5` and 18 free casts without, each free cast
 * coinciding with a Divine Purpose removal.
 *
 * WHAT THIS MODULE READS, AND WHAT IT REFUSES TO
 *
 *   EXACT_PRE_COST      the amount on the wire at THIS cast — the value bound
 *                       to `holy_power` for this decision
 *   NO_OBSERVATION      no entry, or an entry M4 does not grade EXACT/OBSERVED
 *                       — `holy_power` stays UNKNOWN
 *
 * No generator press is read for Holy Power (the wire carries mana there),
 * no gain is replayed from `resourcechange`, no regeneration exists, and no
 * amount is carried from one decision to the next. The generator decisions
 * that would need a reconstruction are outside the first slice.
 *
 * THE FREE-CAST ROUTE. Divine Purpose (408458) makes a spender cost nothing
 * (sc_paladin.hpp:1471-1487, `affected_by.divine_purpose_cost`). The aura
 * bindings prove it UP or DOWN at the decision; this module turns that into
 * the two usability facts the action profile reads: a spender is PROVEN
 * usable when its pinned cost is KNOWN affordable or the free route is
 * proven up, and `freeCastExcluded` is true only when Divine Purpose is
 * proven down. Empyrean Power, Divine Storm's second free route, is not
 * modelled: it is never claimed excluded, so no INSUFFICIENT_RESOURCE proof
 * about Divine Storm is ever made.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import { RESOURCE_WIRE_CONTRACTS } from "../../../data/wcl-wire/resource-types.js";
import { knownNumber, unknownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";
import type { RetributionAuraBinding } from "./aura-bindings.js";
import { HOLY_POWER_RESOURCE_ID } from "./spec.js";

/**
 * The Holy Power a cast OBSERVED. An observation record, never a state.
 */
export type HolyPowerObservation =
  | {
      readonly state: "EXACT_PRE_COST";
      readonly amount: number;
      readonly max: number | null;
      readonly cost: number | null;
    }
  | { readonly state: "NO_OBSERVATION"; readonly reason: string };

export interface RetributionCastHolyPower {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly observation: HolyPowerObservation;
}

/** The version-scoped wire type of Holy Power, or `null` when the contract is not pinned. */
export function holyPowerWireType(): number | null {
  return (
    RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === HOLY_POWER_RESOURCE_ID)?.wireType ?? null
  );
}

/** The Holy Power a cast carried, read once through M4's observation accessor. */
export function holyPowerOn(
  state: CombatState,
  position: number,
  actorId: number,
  wireType: number,
): HolyPowerObservation {
  const result = state.resources.observationOnEvent(position, actorId, wireType);
  if (result.certainty === "UNKNOWN") return { state: "NO_OBSERVATION", reason: result.reason };
  if (result.certainty !== "EXACT" || result.derivation !== "OBSERVED") {
    return { state: "NO_OBSERVATION", reason: `observation was ${result.certainty}/${result.derivation}` };
  }
  if (result.value.timing !== "PRE_COST") {
    return { state: "NO_OBSERVATION", reason: `observation timing is ${result.value.timing}, not PRE_COST` };
  }
  return {
    state: "EXACT_PRE_COST",
    amount: result.value.observedAmount,
    max: result.value.observedMax,
    cost: result.value.observedCost,
  };
}

/**
 * What the action profile may claim about spending at this decision.
 *
 *   holyPower           KNOWN from the wire, else UNKNOWN
 *   divinePurposeUp     TRUE / FALSE only from a BOUND aura, else null
 *   freeCastExcluded    true only when Divine Purpose is PROVEN down
 */
export interface RetributionSpenderFacts {
  readonly holyPower: NumericBinding;
  readonly divinePurposeUp: boolean | null;
  readonly freeCastExcluded: boolean;
}

export const UNKNOWN_SPENDER_FACTS: RetributionSpenderFacts = Object.freeze<RetributionSpenderFacts>({
  holyPower: unknownNumber("STATE_NOT_ESTABLISHED"),
  divinePurposeUp: null,
  freeCastExcluded: false,
});

export function spenderFactsFrom(
  observation: HolyPowerObservation,
  auras: readonly RetributionAuraBinding[],
): RetributionSpenderFacts {
  const divinePurpose = auras.find((binding) => binding.atomName === "divine_purpose");
  const divinePurposeUp = divinePurpose?.state === "BOUND" ? divinePurpose.up : null;
  return {
    holyPower:
      observation.state === "EXACT_PRE_COST"
        ? knownNumber(observation.amount)
        : unknownNumber("STATE_NOT_ESTABLISHED"),
    divinePurposeUp,
    freeCastExcluded: divinePurposeUp === false,
  };
}
