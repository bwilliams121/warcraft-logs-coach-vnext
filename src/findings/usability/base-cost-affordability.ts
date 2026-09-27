/**
 * A POSITIVE affordability proof (M11-C4i): the RESOURCE_AFFORDABILITY
 * dimension of the positive usability contract, for a candidate action that
 * was not cast.
 *
 * THE ARGUMENT
 *
 * SimulationCraft's `action_t::ready()` refuses an action whose cost is not
 * affordable. A candidate's cost is PROVEN affordable at a decision when:
 *
 *   1. the decision's OWN cast carries an EXACT, OBSERVED, PRE_COST
 *      observation of the resource (`acceptExactPreCost`, the rule the
 *      Assassination slice already reads) — the amount the player had at the
 *      instant of the decision, before that cast's own cost;
 *   2. the observation is in the SAME units as the pinned DBC costs: the
 *      observed cast's own wire `cost` equals its own pinned DBC base cost,
 *      mechanically, at this very observation;
 *   3. the candidate's real cost cannot EXCEED its pinned DBC base cost (a
 *      caller-supplied proof: the machine cost-modifier census and the cost
 *      formula checks of the pinned usability authority);
 *   4. the observed amount is at least the candidate's base cost.
 *
 * NEVER A NEGATIVE INFERENCE. A base cost above the observed amount says
 * nothing: reductions may apply (a Brewmaster Keg Smash has a −100% free
 * proc in its census). That case, and every missing, stale, non-PRE_COST or
 * unit-uncorroborated observation, is UNKNOWN — never unaffordable.
 */

import type { StateResult } from "../../engine/state/state-result.js";
import type { ResourceAmountObservation } from "../../engine/resources/resource-observations.js";
import { acceptExactPreCost } from "../resources/exact-pre-cost.js";
import { provenDimension, unknownDimension, type DimensionResolution } from "./usability-completeness.js";

export interface BaseCostAffordabilityInput {
  /** M4's observation of the resource carried ON the decision's own cast. */
  readonly observation: StateResult<ResourceAmountObservation>;
  /** The pinned DBC base cost of the OBSERVED cast's row of this resource, or `null` when it has none. */
  readonly observedCastBaseCost: number | null;
  /** The pinned DBC base cost of the candidate's row of this resource. */
  readonly candidateBaseCost: number;
  /** Whether pinned mechanics prove the candidate's real cost cannot exceed its base cost. */
  readonly candidateCostCannotIncrease: boolean;
  /** Why (or why not), for the evidence record. */
  readonly costBoundBasis: string;
}

export function proveAffordableByBaseCost(input: BaseCostAffordabilityInput): DimensionResolution {
  const accepted = acceptExactPreCost(input.observation);
  if (!accepted.accepted) {
    return unknownDimension("RESOURCE_NOT_OBSERVED_PRE_COST", accepted.detail);
  }
  const { observation } = accepted;
  if (input.observedCastBaseCost === null || observation.observedCost === null) {
    return unknownDimension(
      "RESOURCE_UNITS_NOT_CORROBORATED",
      "the decision's own cast carries no pinned base cost or no wire cost, so the observation's units cannot be tied to the pinned DBC costs",
    );
  }
  if (observation.observedCost !== input.observedCastBaseCost) {
    return unknownDimension(
      "RESOURCE_UNITS_NOT_CORROBORATED",
      `the decision's own cast reports wire cost ${String(observation.observedCost)} against a pinned base cost of ${String(input.observedCastBaseCost)}, so the observation's units are not proven to be the DBC's`,
    );
  }
  if (!input.candidateCostCannotIncrease) {
    return unknownDimension("COST_MAY_EXCEED_BASE", input.costBoundBasis);
  }
  if (observation.observedAmount < input.candidateBaseCost) {
    return unknownDimension(
      "BASE_COST_ABOVE_OBSERVED_AMOUNT",
      `the observed amount ${String(observation.observedAmount)} is below the candidate's base cost ${String(input.candidateBaseCost)}; cost reductions may apply, so this proves nothing either way`,
    );
  }
  return provenDimension(
    "PRE_COST_AT_LEAST_BASE_COST",
    "the decision cast's own PRE_COST observation, in units corroborated by its own wire cost, is at least the candidate's pinned base cost, and pinned mechanics prove the candidate cannot cost more than that",
    {
      observedAmount: observation.observedAmount,
      observedMax: observation.observedMax,
      observedCastWireCost: observation.observedCost,
      observedCastBaseCost: input.observedCastBaseCost,
      candidateBaseCost: input.candidateBaseCost,
      costBoundBasis: input.costBoundBasis,
    },
    [observation.locator],
  );
}
