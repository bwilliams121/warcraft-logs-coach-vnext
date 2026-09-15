/**
 * Which phase an observation fell in.
 *
 * WHAT THIS MODULE IS, AND WHAT IT IS CAREFUL NOT TO BE
 *
 * It is one decision: which `TemporalPosition` an observation corresponds to.
 * It is NOT a phase lookup — `EncounterStateView.phaseAt` is the phase lookup,
 * it already fails closed correctly, and nothing here reimplements, wraps or
 * softens it. The result is returned exactly as M4 produced it, UNKNOWN reason
 * included.
 *
 * That is worth one function because the anchor choice is a real decision with a
 * real justification, and it should have exactly one home rather than being
 * re-decided at each call site.
 *
 * THE PHASE SEMANTICS THIS INHERITS, UNCHANGED
 *
 *     no phase observations at all      -> UNKNOWN (NO_OBSERVATION)
 *     before the first transition       -> UNKNOWN (AMBIGUOUS_INITIAL_STATE)
 *     phase coverage incomplete         -> UNKNOWN (INSUFFICIENT_COVERAGE)
 *     capability unverified             -> UNKNOWN (CAPABILITY_UNVERIFIED)
 *     transition list not a timeline    -> UNKNOWN (NON_MONOTONIC_TIME)
 *
 * None of those is ever defaulted to phase 1, and an invalid transition list is
 * never sorted into apparent validity. An intermission is reported as the
 * intermission it is, through `PhaseInterval.intermission`, which is itself a
 * tri-state because `isIntermission` is nullable upstream.
 *
 * M8-C METADATA IS NOT A SUBSTITUTE, AND CANNOT BE USED AS ONE
 *
 * `lastPhase` and `lastPhaseAsAbsoluteIndex` are pull-SUMMARY facts: they
 * describe where the encounter was when the fight ENDED, on two different
 * counting bases that M8-A measured disagreeing on one real kill. They say
 * nothing about an arbitrary instant. This module imports neither, and the
 * encounter-context domain imports no M8-C module at all, so the substitution is
 * not available to be made by accident.
 */

import type { PhaseInterval } from "../engine/state/encounter-state.js";
import type { CombatState } from "../engine/state/combat-state.js";
import type { StateResult } from "../engine/state/state-result.js";
import { afterEvent } from "../engine/state/temporal.js";
import type { EncounterEventObservation } from "./encounter-events.js";

/**
 * The phase placement of one observed encounter event.
 *
 * WHY `AFTER_EVENT`. The question is which phase contained this observation, so
 * the observation itself must be inside the addressed prefix — which is what
 * AFTER_EVENT means and BEFORE_EVENT does not.
 *
 * In practice both anchors resolve to the same phase, because
 * `resolveTemporalPosition` reports the anchor event's own timestamp as
 * `boundaryReportTimeMs` for either, and phase placement is keyed on that
 * instant. The choice is made explicitly anyway: relying on the two agreeing
 * would be depending on an implementation detail of a module that owes this one
 * nothing.
 */
export function phasePlacementOfObservation(
  state: CombatState,
  observation: EncounterEventObservation,
): StateResult<PhaseInterval> {
  return state.encounter.phaseAt(afterEvent(observation.position));
}
