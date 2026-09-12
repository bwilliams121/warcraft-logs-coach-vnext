import { describe, expect, it } from "vitest";

import { createCombatState } from "../../src/engine/state/combat-state.js";
import {
  afterEvent,
  beforeEvent,
  endOfTimestamp,
  startOfTimestamp,
} from "../../src/engine/state/temporal.js";
import {
  damageEvent,
  FIGHT_END_MS,
  FIGHT_START_MS,
  partialCategory,
  phase,
  syntheticFight,
  UNVERIFIED_CATEGORY,
} from "../support/synthetic-fight.js";
import { exclusiveRange } from "../../src/engine/evidence/coverage.js";

const PLAYER = 5;
const BOSS = 160;

/** Events at 1200 / 2500 / 3500 / 4500, so a query can land inside each phase. */
const TIMELINE = [
  damageEvent({ ordinal: 0, reportTimeMs: 1200, sourceActorId: PLAYER, targetActorId: BOSS }),
  damageEvent({ ordinal: 1, reportTimeMs: 2500, sourceActorId: PLAYER, targetActorId: BOSS }),
  damageEvent({ ordinal: 2, reportTimeMs: 3500, sourceActorId: PLAYER, targetActorId: BOSS }),
  damageEvent({ ordinal: 3, reportTimeMs: 4500, sourceActorId: PLAYER, targetActorId: BOSS }),
];

const THREE_PHASES = [
  phase({ phaseId: 1, startTimeMs: 1000, isIntermission: false, name: "Phase One" }),
  phase({ phaseId: 2, startTimeMs: 3000, isIntermission: true, name: "Intermission" }),
  phase({ phaseId: 3, startTimeMs: 4000, isIntermission: null, name: "Phase Two" }),
];

function phasedState(overrides: Parameters<typeof syntheticFight>[0] = {}) {
  return createCombatState(
    syntheticFight({
      observedCategories: ["ENCOUNTER_PHASES"],
      events: TIMELINE,
      phases: THREE_PHASES,
      ...overrides,
    }),
  );
}

// --------------------------------------------------------------------------
// Interval derivation
// --------------------------------------------------------------------------

describe("phase intervals are derived from starts alone", () => {
  const state = phasedState();

  it("ends each phase at the next phase's start, exclusively", () => {
    const [first, second] = state.encounter.phaseIntervals;

    expect(first?.range).toEqual(exclusiveRange(1000, 3000));
    expect(second?.range).toEqual(exclusiveRange(3000, 4000));
    // Exclusive, so the instant a phase begins belongs to the NEW phase — which
    // is what lets the boundary be expressed without an epsilon or a +1ms.
    // Warcraft Logs types timestamps as Float, so neither was available.
  });

  it("runs the final phase to the recorded fight end, inclusively", () => {
    const last = state.encounter.phaseIntervals.at(-1);

    expect(last?.phaseId).toBe(3);
    expect(last?.range.toReportTimeMs).toBe(FIGHT_END_MS);
    expect(last?.range.upperBound).toBe("INCLUSIVE");
  });

  it("puts the boundary instant in the later phase", () => {
    const atBoundary = createCombatState(
      syntheticFight({
        observedCategories: ["ENCOUNTER_PHASES"],
        phases: THREE_PHASES,
        events: [damageEvent({ ordinal: 0, reportTimeMs: 3000, sourceActorId: PLAYER })],
      }),
    ).encounter.phaseAt(afterEvent(0));

    if (atBoundary.certainty !== "EXACT") return;
    expect(atBoundary.value.phaseId).toBe(2);
  });

  it("includes the final instant of the fight", () => {
    const atEnd = state.encounter.phaseAt(endOfTimestamp(FIGHT_END_MS));

    if (atEnd.certainty !== "EXACT") return;
    expect(atEnd.value.phaseId).toBe(3);
  });

  it("resolves each event into the phase containing it", () => {
    const results = [0, 1, 2, 3].map((position) => state.encounter.phaseAt(afterEvent(position)));

    expect(
      results.map((result) => (result.certainty === "EXACT" ? result.value.phaseId : result.certainty)),
    ).toEqual([1, 1, 2, 3]);
  });

  it("reads phases without mutating them", () => {
    const phases = THREE_PHASES;
    const fight = syntheticFight({ observedCategories: ["ENCOUNTER_PHASES"], phases, events: TIMELINE });
    createCombatState(fight);

    expect(fight.phases).toBe(phases);
    expect(fight.phases.map((entry) => entry.startTimeMs)).toEqual([1000, 3000, 4000]);
  });

  it("carries a provenance handle back to the M3 fact instead of a copy", () => {
    const result = state.encounter.phaseAt(afterEvent(2));

    if (result.certainty !== "EXACT") return;
    // `phaseIndex` addresses `fight.phases[phaseIndex]`. The canonical fact is
    // not duplicated inside the result.
    expect(state.fight.phases[result.value.phaseIndex]?.phaseId).toBe(result.value.phaseId);
    expect(result.derivation).toBe("DERIVED_EXACT");
    expect(result.provenance.category).toBe("ENCOUNTER_PHASES");
  });
});

// --------------------------------------------------------------------------
// Intermission tri-state
// --------------------------------------------------------------------------

describe("intermission status is three-valued", () => {
  const state = phasedState();

  it("preserves a true flag", () => {
    const result = state.encounter.phaseAt(afterEvent(2));

    if (result.certainty !== "EXACT") return;
    expect(result.value.intermission).toBe("INTERMISSION");
    expect(result.value.isIntermissionRaw).toBe(true);
  });

  it("preserves a false flag as knowledge, not as absence", () => {
    const result = state.encounter.phaseAt(afterEvent(0));

    if (result.certainty !== "EXACT") return;
    expect(result.value.intermission).toBe("NOT_INTERMISSION");
    expect(result.value.isIntermissionRaw).toBe(false);
  });

  it("keeps a null flag unknown and never turns it into false", () => {
    const result = state.encounter.phaseAt(afterEvent(3));

    if (result.certainty !== "EXACT") return;
    // The load-bearing case. Later actionability requires POSITIVE evidence, so
    // "we do not know whether this was an intermission" must not read as "it was
    // not".
    expect(result.value.intermission).toBe("UNKNOWN");
    expect(result.value.intermission).not.toBe("NOT_INTERMISSION");
    expect(result.value.isIntermissionRaw).toBeNull();
  });

  it("cannot be collapsed to false by a truthiness check", () => {
    const unknown = state.encounter.phaseIntervals.at(-1);
    const known = state.encounter.phaseIntervals[0];

    // A nullable boolean would make `if (phase.isIntermission)` silently produce
    // the wrong one of the two. The three-valued string cannot.
    expect(Boolean(unknown?.intermission)).toBe(true);
    expect(Boolean(known?.intermission)).toBe(true);
    expect(unknown?.intermission).not.toBe(known?.intermission);
  });

  it("forms no actionability verdict", () => {
    const serialized = JSON.stringify(state.encounter.phaseIntervals).toUpperCase();
    for (const forbidden of ["ACTIONABLE", "TARGET_UNAVAILABLE", "FORCED_DOWNTIME", "SUPPRESS"]) {
      expect(serialized).not.toContain(forbidden);
    }
    for (const forbidden of ["actionabilityAt", "isActionable", "targetableAt"]) {
      expect(state.encounter).not.toHaveProperty(forbidden);
    }
  });
});

// --------------------------------------------------------------------------
// Empty phase list
// --------------------------------------------------------------------------

describe("an empty phase list establishes nothing", () => {
  const state = createCombatState(
    syntheticFight({ observedCategories: ["ENCOUNTER_PHASES"], events: TIMELINE, phases: [] }),
  );

  it("returns UNKNOWN rather than phase 1", () => {
    const result = state.encounter.phaseAt(afterEvent(0));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // M3's empty array stands for more than one upstream situation: a boss with
    // no phase system, or phases we did not obtain. Collapsing it into either
    // would manufacture encounter state.
    expect(result.reason).toBe("NO_OBSERVATION");
    expect(result).not.toHaveProperty("value");
  });

  it("does not report a non-intermission by default", () => {
    const result = state.encounter.phaseAt(afterEvent(0));

    expect(JSON.stringify(result)).not.toContain("NOT_INTERMISSION");
    expect(state.encounter.phaseIntervals).toEqual([]);
  });

  it("does not claim the fight had no phase system", () => {
    for (const forbidden of ["hasPhases", "phaseSystem", "isPhaseless", "singlePhase"]) {
      expect(state.encounter).not.toHaveProperty(forbidden);
    }
  });
});

describe("time before the first recorded transition", () => {
  it("belongs to no phase and is reported unresolved", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["ENCOUNTER_PHASES"],
        events: [damageEvent({ ordinal: 0, reportTimeMs: 1200, sourceActorId: PLAYER })],
        phases: [phase({ phaseId: 1, startTimeMs: 2000, isIntermission: false })],
      }),
    );
    const result = state.encounter.phaseAt(afterEvent(0));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // Not "phase 1 had not started yet, so phase 0". No phase vouches for the
    // instant, so no phase is reported.
    expect(result.reason).toBe("AMBIGUOUS_INITIAL_STATE");
  });
});

// --------------------------------------------------------------------------
// Order safety
// --------------------------------------------------------------------------

describe("decreasing phase starts fail closed rather than being sorted", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["ENCOUNTER_PHASES"],
      events: TIMELINE,
      phases: [
        phase({ phaseId: 1, startTimeMs: 1000, isIntermission: false }),
        phase({ phaseId: 2, startTimeMs: 4000, isIntermission: true }),
        // Backwards. M3 preserves the order it was given and does not validate it.
        phase({ phaseId: 3, startTimeMs: 2000, isIntermission: false }),
      ],
    }),
  );

  it("reports the timeline as unordered, with the first violation", () => {
    expect(state.encounter.phaseTimelineIntegrity.state).toBe("UNORDERED");
    if (state.encounter.phaseTimelineIntegrity.state !== "UNORDERED") return;
    const violation = state.encounter.phaseTimelineIntegrity.firstViolation;
    expect(violation.previousPhaseIndex).toBe(1);
    expect(violation.previousStartTimeMs).toBe(4000);
    expect(violation.offendingPhaseIndex).toBe(2);
    expect(violation.offendingStartTimeMs).toBe(2000);
  });

  it("derives no intervals at all", () => {
    expect(state.encounter.phaseIntervals).toEqual([]);
  });

  it("refuses every phase query", () => {
    for (const position of [afterEvent(0), afterEvent(3), endOfTimestamp(2500)]) {
      const result = state.encounter.phaseAt(position);
      expect(result.certainty).toBe("UNKNOWN");
      if (result.certainty !== "UNKNOWN") continue;
      expect(result.reason).toBe("NON_MONOTONIC_TIME");
    }
  });

  it("does not sort the transitions into something plausible", () => {
    // Sorting would invent an order Warcraft Logs never stated, and would answer
    // confidently from it.
    expect(state.fight.phases.map((entry) => entry.startTimeMs)).toEqual([1000, 4000, 2000]);
    expect(state.fight.phases.map((entry) => entry.phaseId)).toEqual([1, 2, 3]);
  });
});

describe("equal consecutive phase starts are degenerate, not contradictory", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["ENCOUNTER_PHASES"],
      events: TIMELINE,
      phases: [
        phase({ phaseId: 1, startTimeMs: 1000, isIntermission: false }),
        phase({ phaseId: 2, startTimeMs: 3000, isIntermission: true }),
        phase({ phaseId: 3, startTimeMs: 3000, isIntermission: false }),
      ],
    }),
  );

  it("stays ORDERED, mirroring M4-A's treatment of equal event timestamps", () => {
    expect(state.encounter.phaseTimelineIntegrity.state).toBe("ORDERED");
  });

  it("gives the zero-width phase an empty interval rather than borrowing time", () => {
    const empty = state.encounter.phaseIntervals[1];

    expect(empty?.range).toEqual(exclusiveRange(3000, 3000));
    // The instant resolves to the later phase, and the zero-width one contains
    // nothing rather than being widened to look reasonable.
    const result = state.encounter.phaseAt(afterEvent(2));
    if (result.certainty !== "EXACT") return;
    expect(result.value.phaseId).toBe(3);
  });
});

// --------------------------------------------------------------------------
// Evidence gating
// --------------------------------------------------------------------------

describe("phase state is gated by encounter-phase evidence", () => {
  it("returns CAPABILITY_UNVERIFIED rather than a phase", () => {
    const state = phasedState({
      observedCategories: [],
      categories: { ENCOUNTER_PHASES: UNVERIFIED_CATEGORY },
    });
    const result = state.encounter.phaseAt(afterEvent(2));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("CAPABILITY_UNVERIFIED");
  });

  it("returns INSUFFICIENT_COVERAGE when transitions may be missing", () => {
    const state = phasedState({
      observedCategories: [],
      categories: { ENCOUNTER_PHASES: partialCategory([exclusiveRange(1000, 2000)]) },
    });
    const result = state.encounter.phaseAt(afterEvent(2));

    if (result.certainty !== "UNKNOWN") return;
    // A missing transition would silently extend the phase before it, so the
    // claim needs the whole list.
    expect(result.reason).toBe("INSUFFICIENT_COVERAGE");
  });

  it("is not blocked by a per-actor scope, because a phase is not actor-specific", () => {
    const state = phasedState({ actorScope: [PLAYER] });
    const result = state.encounter.phaseAt(afterEvent(2));

    expect(result.certainty).toBe("EXACT");
  });

  it("still fails closed on an unresolvable position", () => {
    const result = phasedState().encounter.phaseAt(beforeEvent(99));

    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });

  it("fails closed on a timestamp query over disordered events", () => {
    const state = createCombatState(
      syntheticFight({
        observedCategories: ["ENCOUNTER_PHASES"],
        phases: THREE_PHASES,
        events: [
          damageEvent({ ordinal: 0, reportTimeMs: 4000, sourceActorId: PLAYER }),
          damageEvent({ ordinal: 1, reportTimeMs: 1200, sourceActorId: PLAYER }),
        ],
      }),
    );
    const result = state.encounter.phaseAt(startOfTimestamp(3500));

    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("NON_MONOTONIC_TIME");
  });
});

// --------------------------------------------------------------------------
// Fight timing
// --------------------------------------------------------------------------

describe("elapsed fight time is knowable at the moment", () => {
  const state = phasedState();

  it("measures from the fight start", () => {
    const result = state.encounter.elapsedFightTimeAt(afterEvent(1));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value).toBe(2500 - FIGHT_START_MS);
  });

  it("is zero at the fight start instant", () => {
    const result = state.encounter.elapsedFightTimeAt(startOfTimestamp(FIGHT_START_MS));

    if (result.certainty !== "EXACT") return;
    expect(result.value).toBe(0);
  });
});

describe("remaining time is retrospective and named so", () => {
  const state = phasedState();

  it("reports the delta to the recorded fight end", () => {
    const result = state.encounter.observedFightEndDelta(afterEvent(1));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value).toBe(FIGHT_END_MS - 2500);
  });

  it("exposes no predictive vocabulary", () => {
    // This is the observed historical outcome, not knowledge the player had. A
    // later evaluator must not be able to reach for it under a name that implies
    // otherwise.
    for (const forbidden of [
      "fightRemains",
      "fight_remains",
      "timeToDie",
      "time_to_die",
      "predictedEnd",
      "estimatedFightEnd",
      "remainingTime",
    ]) {
      expect(state.encounter).not.toHaveProperty(forbidden);
    }
    expect(Object.keys(state.encounter)).toContain("observedFightEndDelta");
  });

  it("refuses to answer for a fight that was still in progress", () => {
    const inProgress = phasedState({ finality: "IN_PROGRESS" });
    const result = inProgress.encounter.observedFightEndDelta(afterEvent(1));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // The recorded end is where the record stops, not where the fight ended, so
    // a delta to it would describe nothing real.
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });

  it("refuses to answer when finality is UNKNOWN", () => {
    const unknownFinality = phasedState({ finality: "UNKNOWN" });
    const result = unknownFinality.encounter.observedFightEndDelta(afterEvent(1));

    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });

  it("still reports elapsed time for an in-progress fight", () => {
    // Elapsed time needs only the start, which is known regardless.
    const result = phasedState({ finality: "IN_PROGRESS" }).encounter.elapsedFightTimeAt(afterEvent(1));

    expect(result.certainty).toBe("EXACT");
  });
});
