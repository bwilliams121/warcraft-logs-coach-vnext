/**
 * Encounter phase state and retrospective fight timing.
 *
 * Phases come from M3's normalized `CombatPhase[]`, which came from the typed,
 * frozen `ReportFight.phaseTransitions` field — NOT from the events JSON. This
 * module does not look at a single event to decide a phase.
 *
 * PHASES HAVE STARTS, NOT ENDS
 *
 * Warcraft Logs supplies a transition timestamp per phase and no end. The
 * intervals are therefore derived:
 *
 *     phase k      ->  [ start_k , start_{k+1} )     upper bound EXCLUSIVE
 *     final phase  ->  [ start_n , fight.end   ]     upper bound INCLUSIVE
 *
 * expressed with M3's `TimeRangeMs`, whose upper bound is explicit precisely so
 * this can be said without inventing an epsilon or a +1ms. Warcraft Logs types
 * timestamps as `Float`, so "add a millisecond" was never available.
 *
 * ORDER IS VALIDATED, NEVER REPAIRED
 *
 * M3 preserves the transition order it was given and does not sort it. If those
 * starts go backwards, this module fails closed rather than sorting them into
 * something plausible. `fight.phases` is never mutated.
 *
 * INTERMISSION IS A TRI-STATE
 *
 * `CombatPhase.isIntermission` is `boolean | null`, and `null` means UNKNOWN.
 * It must never become `false`, because later actionability requires POSITIVE
 * evidence and "we do not know whether this was an intermission" cannot be
 * allowed to read as "it was not". The projection below is a three-valued string
 * rather than a nullable boolean so that `if (phase.intermission)` cannot
 * silently produce the wrong one of the two.
 *
 * Actionability itself is NOT here. This module reports environmental facts; no
 * verdict about whether an action was possible is formed in M4-B.
 */

import type { EvidenceCategory } from "../../wcl/evidence-capability.js";
import { exclusiveRange, inclusiveRange, rangeContains, type TimeRangeMs } from "../evidence/coverage.js";
import type { CombatFight } from "../normalization/combat-fight.js";
import { gateAbsenceClaim, exactDerived, unknownState, type StateResult } from "./state-result.js";
import type { StateEnvironment } from "./state-environment.js";
import type { TemporalPosition } from "./temporal.js";

const ENCOUNTER_PHASES: EvidenceCategory = "ENCOUNTER_PHASES";

/**
 * Intermission status as three distinct answers.
 *
 * `UNKNOWN` is a value here rather than an absence, because a phase we DO know
 * about can still have an unstated intermission flag. That is different from not
 * knowing which phase was active.
 */
export type IntermissionState = "INTERMISSION" | "NOT_INTERMISSION" | "UNKNOWN";

export interface PhaseInterval {
  /** Index into `fight.phases`. The provenance handle back to the M3 fact. */
  readonly phaseIndex: number;
  /** 1-indexed and absolute within the fight: equal ids are the same phase. */
  readonly phaseId: number;
  readonly name: string | null;
  /** `CombatPhase.isIntermission` verbatim, kept alongside the projection. */
  readonly isIntermissionRaw: boolean | null;
  /** The tri-state projection. `null` becomes UNKNOWN and never NOT_INTERMISSION. */
  readonly intermission: IntermissionState;
  readonly startTimeMs: number;
  readonly fightTimeMs: number;
  /** Derived. Exclusive upper bound except for the final phase. */
  readonly range: TimeRangeMs;
}

export interface PhaseOrderViolation {
  readonly previousPhaseIndex: number;
  readonly previousStartTimeMs: number;
  readonly offendingPhaseIndex: number;
  readonly offendingStartTimeMs: number;
}

/**
 * Whether the recorded phase transitions can be read as a timeline.
 *
 * Only the FIRST violation is kept: one counterexample disqualifies interval
 * derivation, and later ones add nothing. Equal consecutive starts are NOT a
 * violation — they yield an empty interval for the earlier phase, which is
 * degenerate but not contradictory, and this mirrors M4-A treating equal event
 * timestamps as sound.
 */
export type PhaseTimelineIntegrity =
  | { readonly state: "ORDERED" }
  | { readonly state: "UNORDERED"; readonly firstViolation: PhaseOrderViolation };

function intermissionOf(isIntermission: boolean | null): IntermissionState {
  if (isIntermission === null) {
    return "UNKNOWN";
  }
  return isIntermission ? "INTERMISSION" : "NOT_INTERMISSION";
}

function findOrderViolation(fight: CombatFight): PhaseOrderViolation | null {
  for (let index = 1; index < fight.phases.length; index += 1) {
    const previous = fight.phases[index - 1];
    const current = fight.phases[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    if (current.startTimeMs < previous.startTimeMs) {
      return {
        previousPhaseIndex: index - 1,
        previousStartTimeMs: previous.startTimeMs,
        offendingPhaseIndex: index,
        offendingStartTimeMs: current.startTimeMs,
      };
    }
  }
  return null;
}

/**
 * Derives the phase intervals, or nothing when the order is not a timeline.
 *
 * `fight.phases` is read, never written. The returned intervals hold
 * `phaseIndex` rather than a copy of the `CombatPhase`, so the M3 fact stays the
 * single source and the derived interval stays traceable to it.
 */
export function derivePhaseIntervals(fight: CombatFight): readonly PhaseInterval[] {
  if (findOrderViolation(fight) !== null) {
    return [];
  }

  const intervals: PhaseInterval[] = [];
  for (let index = 0; index < fight.phases.length; index += 1) {
    const phase = fight.phases[index];
    if (phase === undefined) {
      continue;
    }
    const next = fight.phases[index + 1];
    const range =
      next === undefined
        ? inclusiveRange(phase.startTimeMs, fight.fight.endTimeMs)
        : exclusiveRange(phase.startTimeMs, next.startTimeMs);

    intervals.push({
      phaseIndex: index,
      phaseId: phase.phaseId,
      name: phase.name,
      isIntermissionRaw: phase.isIntermission,
      intermission: intermissionOf(phase.isIntermission),
      startTimeMs: phase.startTimeMs,
      fightTimeMs: phase.fightTimeMs,
      range,
    });
  }
  return intervals;
}

export interface EncounterStateView {
  /** Empty when the phase list is empty OR its order is not a timeline. */
  readonly phaseIntervals: readonly PhaseInterval[];
  readonly phaseTimelineIntegrity: PhaseTimelineIntegrity;

  /**
   * The phase active at a temporal position.
   *
   * An empty phase list produces UNKNOWN, never "phase 1" and never "no phase
   * system". M3's empty array can stand for more than one upstream situation —
   * a boss with no phases, or phases we did not obtain — and collapsing it into
   * either would manufacture encounter state.
   */
  phaseAt(position: TemporalPosition): StateResult<PhaseInterval>;

  /**
   * Time elapsed since the fight start, at a position.
   *
   * Knowable AT the moment of play, so it carries no hindsight risk.
   */
  elapsedFightTimeAt(position: TemporalPosition): StateResult<number>;

  /**
   * Milliseconds from a position to the RECORDED fight end.
   *
   * RETROSPECTIVE, and named to say so. This is not `fight_remains`, not
   * `target.time_to_die` and not a prediction: it is the observed historical
   * outcome, which the player did not possess earlier in the fight. A later
   * evaluator must not read it as knowledge available at the position.
   *
   * UNKNOWN unless finality is COMPLETED: for an in-progress or
   * unknown-finality fight the recorded end is where the record stops, not where
   * the fight ended, and a delta to it would describe nothing real.
   */
  observedFightEndDelta(position: TemporalPosition): StateResult<number>;
}

export function createEncounterState(environment: StateEnvironment): EncounterStateView {
  const { fight } = environment;
  const violation = findOrderViolation(fight);
  const phaseTimelineIntegrity: PhaseTimelineIntegrity =
    violation === null ? { state: "ORDERED" } : { state: "UNORDERED", firstViolation: violation };
  const phaseIntervals = derivePhaseIntervals(fight);

  function phaseAt(position: TemporalPosition): StateResult<PhaseInterval> {
    const resolution = environment.resolveTemporalPosition(position);
    if (!resolution.ok) {
      return unknownState(resolution.reason, [], ENCOUNTER_PHASES);
    }
    const { boundaryReportTimeMs } = resolution.prefix;

    if (phaseTimelineIntegrity.state === "UNORDERED") {
      // A source whose own timestamps go backwards is not a timeline, and there
      // is no sound answer over it. Sorting it would invent an order Warcraft
      // Logs never stated.
      return unknownState("NON_MONOTONIC_TIME", [], ENCOUNTER_PHASES);
    }

    // Claiming "phase k was active" rests on holding the WHOLE transition list:
    // a missing transition would silently extend the phase before it. That is an
    // absence claim, and it is not actor-specific.
    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: ENCOUNTER_PHASES,
      range: inclusiveRange(fight.fight.startTimeMs, boundaryReportTimeMs),
      actorId: null,
    });
    if (!gate.ok) {
      return unknownState(gate.reason, [], ENCOUNTER_PHASES);
    }

    if (phaseIntervals.length === 0) {
      // Coverage says we would have seen transitions, and there are none. That
      // still does not establish a phase, an absence of phases, or a
      // non-intermission — so the category is reported unresolved rather than
      // defaulted.
      return unknownState("NO_OBSERVATION", [], ENCOUNTER_PHASES);
    }

    const found = phaseIntervals.find((interval) => rangeContains(interval.range, boundaryReportTimeMs));
    if (found === undefined) {
      // Before the first recorded transition, or past the recorded end. No
      // phase vouches for this instant.
      return unknownState("AMBIGUOUS_INITIAL_STATE", [], ENCOUNTER_PHASES);
    }

    // Derived from the typed phase list, which carries no `EvidenceLocator` —
    // it is not an event. `phaseIndex` is the provenance handle: it addresses
    // `fight.phases[phaseIndex]` without copying it.
    return exactDerived(found, [], ENCOUNTER_PHASES);
  }

  function elapsedFightTimeAt(position: TemporalPosition): StateResult<number> {
    const resolution = environment.resolveTemporalPosition(position);
    if (!resolution.ok) {
      return unknownState(resolution.reason, [], null);
    }
    return exactDerived(resolution.prefix.boundaryReportTimeMs - fight.fight.startTimeMs, [], null);
  }

  function observedFightEndDelta(position: TemporalPosition): StateResult<number> {
    if (fight.fight.finality !== "COMPLETED") {
      return unknownState("UNSUPPORTED_DERIVATION", [], null);
    }
    const resolution = environment.resolveTemporalPosition(position);
    if (!resolution.ok) {
      return unknownState(resolution.reason, [], null);
    }
    return exactDerived(fight.fight.endTimeMs - resolution.prefix.boundaryReportTimeMs, [], null);
  }

  return {
    phaseIntervals,
    phaseTimelineIntegrity,
    phaseAt,
    elapsedFightTimeAt,
    observedFightEndDelta,
  };
}
