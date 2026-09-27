/**
 * Acceptance of an EXACT, OBSERVED, PRE_COST resource observation as decision
 * state (M5-A; shared since M11-C4i).
 *
 * Moved verbatim from `src/specs/rogue/assassination/envenom-decision.ts`,
 * which re-exports it, so the Assassination refusals and a positive
 * affordability proof read one rule: only an `EXACT` / `OBSERVED` /
 * `PRE_COST` observation carried ON the cast itself is decision state.
 * `STALE`, `EVENT_ASSOCIATED`, `BOUNDED` and a missing observation are not.
 */

import type { StateResult } from "../../engine/state/state-result.js";
import type { ResourceAmountObservation } from "../../engine/resources/resource-observations.js";

export type ExactStateAcceptance =
  | { readonly accepted: true; readonly observation: ResourceAmountObservation }
  | { readonly accepted: false; readonly detail: string };

/**
 * Whether an M4 resource result may be used as exact decision state.
 *
 * Exported so the refusals can be tested directly, including branches this
 * evaluator cannot currently reach — `observationOnEvent` never returns STALE
 * today, but the refusal must hold if that ever changes, and a rule nobody
 * tested is a rule nobody can rely on.
 */
export function acceptExactPreCost(result: StateResult<ResourceAmountObservation>): ExactStateAcceptance {
  if (result.certainty === "UNKNOWN") {
    // Notably includes NO_OBSERVATION: the event is in hand and carries no
    // combo-point entry. That is an absence of evidence, never a value of zero.
    return { accepted: false, detail: `no exact observation on the cast (${result.reason})` };
  }
  if (result.certainty === "STALE") {
    return {
      accepted: false,
      detail:
        "the latest combo-point observation predates this cast; a carried-forward value is not decision state",
    };
  }
  if (result.certainty === "BOUNDED") {
    return { accepted: false, detail: "combo points were only bounded, not exact" };
  }
  if (result.derivation !== "OBSERVED") {
    return { accepted: false, detail: `combo points were ${result.derivation}, not directly observed` };
  }
  if (result.value.timing !== "PRE_COST") {
    return {
      accepted: false,
      detail: `observation timing is ${result.value.timing}; only PRE_COST describes the amount before the cast's own cost`,
    };
  }
  return { accepted: true, observation: result.value };
}
