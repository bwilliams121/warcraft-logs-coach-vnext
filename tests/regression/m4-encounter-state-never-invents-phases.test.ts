import { describe, expect, it } from "vitest";

import { exclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import { afterEvent, endOfTimestamp } from "../../src/engine/state/temporal.js";
import {
  damageEvent,
  FIGHT_END_MS,
  partialCategory,
  phase,
  syntheticFight,
  UNVERIFIED_CATEGORY,
} from "../support/synthetic-fight.js";

/**
 * Historical failure this protects against:
 *
 * The old analyzer treated every second of a fight as equally available. A
 * thirty-second intermission, during which the boss was simply not there,
 * became a dozen confident rotational findings. The fix requires the encounter
 * layer to be able to say three different things, and to never substitute one
 * for another:
 *
 *     this WAS an intermission
 *     this was NOT an intermission
 *     we do not know
 *
 * The dangerous one is the third collapsing into the second. `isIntermission` is
 * `boolean | null` on the wire, and `if (phase.isIntermission)` reads a null as
 * false — which is the fail-open default that resurrects the bug. M4-B projects
 * it into a three-valued state so that cannot happen, and this file pins that
 * projection along with the two other places a phase could be invented:
 *
 * - an EMPTY phase list becoming "phase 1" or "not an intermission"
 * - an UNORDERED phase list being sorted into something plausible
 *
 * Actionability itself is NOT decided here. M4-B supplies the environmental
 * fact; whether an action was possible is M5's question. What matters now is
 * that M5 cannot be handed a confident `false` that nobody established.
 */

const PLAYER = 5;
const BOSS = 160;

const MIDFIGHT = [
  damageEvent({ ordinal: 0, reportTimeMs: 1500, sourceActorId: PLAYER, targetActorId: BOSS }),
  damageEvent({ ordinal: 1, reportTimeMs: 3500, sourceActorId: PLAYER, targetActorId: BOSS }),
];

describe("an unknown intermission flag never becomes a known negative", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["ENCOUNTER_PHASES"],
      events: MIDFIGHT,
      phases: [
        phase({ phaseId: 1, startTimeMs: 1000, isIntermission: false }),
        // Warcraft Logs supplied no flag for this phase.
        phase({ phaseId: 2, startTimeMs: 3000, isIntermission: null }),
      ],
    }),
  );

  it("reports UNKNOWN, not NOT_INTERMISSION", () => {
    const result = state.encounter.phaseAt(afterEvent(1));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value.intermission).toBe("UNKNOWN");
    expect(result.value.intermission).not.toBe("NOT_INTERMISSION");
  });

  it("stays distinguishable from the phase whose flag WAS false", () => {
    const known = state.encounter.phaseAt(afterEvent(0));
    const unknown = state.encounter.phaseAt(afterEvent(1));

    if (known.certainty !== "EXACT" || unknown.certainty !== "EXACT") return;
    // Two genuinely different facts. Collapsing them is how a real intermission
    // becomes a dozen rotational findings.
    expect(known.value.intermission).toBe("NOT_INTERMISSION");
    expect(unknown.value.intermission).toBe("UNKNOWN");
    expect(known.value.intermission).not.toBe(unknown.value.intermission);
  });

  it("cannot be read as false by a truthiness check", () => {
    const [known, unknown] = state.encounter.phaseIntervals;

    // The fail-open default, written out. With a nullable boolean the second
    // assertion would be `false`, and every consumer taking the easy branch
    // would silently get the wrong answer.
    expect(Boolean(known?.intermission)).toBe(true);
    expect(Boolean(unknown?.intermission)).toBe(true);

    // The raw flag is still available for provenance, and it is still null.
    expect(known?.isIntermissionRaw).toBe(false);
    expect(unknown?.isIntermissionRaw).toBeNull();
  });

  it("exposes no boolean intermission accessor to be tempted by", () => {
    for (const forbidden of ["isIntermissionAt", "wasIntermission", "inIntermission", "intermissionAt"]) {
      expect(state.encounter).not.toHaveProperty(forbidden);
    }
  });
});

describe("an empty phase list is not a phaseless fight", () => {
  const state = createCombatState(
    syntheticFight({ observedCategories: ["ENCOUNTER_PHASES"], events: MIDFIGHT, phases: [] }),
  );

  it("returns UNKNOWN rather than defaulting to phase 1", () => {
    const result = state.encounter.phaseAt(afterEvent(0));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("NO_OBSERVATION");
    // No value field at all, so there is no default a caller could read out.
    expect(result).not.toHaveProperty("value");
  });

  it("does not answer the intermission question either way", () => {
    const serialized = JSON.stringify(state.encounter.phaseAt(endOfTimestamp(3500)));

    expect(serialized).not.toContain("INTERMISSION");
    expect(serialized).not.toContain("NOT_INTERMISSION");
  });

  it("makes the same claim at every instant of the fight, which is none", () => {
    for (const position of [afterEvent(0), afterEvent(1), endOfTimestamp(FIGHT_END_MS)]) {
      expect(state.encounter.phaseAt(position).certainty).toBe("UNKNOWN");
    }
  });
});

describe("phase evidence gates the phase claim", () => {
  const PHASES = [
    phase({ phaseId: 1, startTimeMs: 1000, isIntermission: false }),
    phase({ phaseId: 2, startTimeMs: 3000, isIntermission: true }),
  ];

  it("returns UNKNOWN while the category's capability is UNVERIFIED", () => {
    const state = createCombatState(
      syntheticFight({
        events: MIDFIGHT,
        phases: PHASES,
        categories: { ENCOUNTER_PHASES: UNVERIFIED_CATEGORY },
      }),
    );
    const result = state.encounter.phaseAt(afterEvent(1));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // Having phase objects in hand is not the same as knowing the list is
    // complete. A missing transition would silently extend the phase before it.
    expect(result.reason).toBe("CAPABILITY_UNVERIFIED");
  });

  it("returns UNKNOWN while coverage is only partial", () => {
    const state = createCombatState(
      syntheticFight({
        events: MIDFIGHT,
        phases: PHASES,
        categories: { ENCOUNTER_PHASES: partialCategory([exclusiveRange(1000, 2000)]) },
      }),
    );
    const result = state.encounter.phaseAt(afterEvent(1));

    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("INSUFFICIENT_COVERAGE");
  });
});

describe("a phase list whose time runs backwards is not repaired", () => {
  const OUT_OF_ORDER = [
    phase({ phaseId: 1, startTimeMs: 1000, isIntermission: false }),
    phase({ phaseId: 2, startTimeMs: 4000, isIntermission: true }),
    phase({ phaseId: 3, startTimeMs: 2000, isIntermission: false }),
  ];

  const fight = syntheticFight({
    observedCategories: ["ENCOUNTER_PHASES"],
    events: MIDFIGHT,
    phases: OUT_OF_ORDER,
  });
  const state = createCombatState(fight);

  it("refuses every phase query rather than answering from a guessed order", () => {
    const result = state.encounter.phaseAt(afterEvent(1));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("NON_MONOTONIC_TIME");
  });

  it("keeps the violation as evidence instead of discarding it", () => {
    expect(state.encounter.phaseTimelineIntegrity.state).toBe("UNORDERED");
    if (state.encounter.phaseTimelineIntegrity.state !== "UNORDERED") return;
    // Enough context to explain the refusal, which is what makes "why did it
    // tell me this?" answerable.
    expect(state.encounter.phaseTimelineIntegrity.firstViolation.offendingStartTimeMs).toBe(2000);
  });

  it("does not mutate the fight's own phase array", () => {
    // Sorting it would invent an order Warcraft Logs never stated, and would
    // then answer confidently from that invention.
    expect(fight.phases).toBe(OUT_OF_ORDER);
    expect(fight.phases.map((entry) => entry.startTimeMs)).toEqual([1000, 4000, 2000]);
  });

  it("offers no repair primitive", () => {
    for (const forbidden of ["sortedPhases", "repairPhases", "normalizePhases"]) {
      expect(state.encounter).not.toHaveProperty(forbidden);
    }
  });
});

describe("retrospective fight timing is not dressed up as foresight", () => {
  const state = createCombatState(
    syntheticFight({
      observedCategories: ["ENCOUNTER_PHASES"],
      events: MIDFIGHT,
      phases: [phase({ phaseId: 1, startTimeMs: 1000, isIntermission: false })],
    }),
  );

  it("names the historical delta for what it is", () => {
    const result = state.encounter.observedFightEndDelta(afterEvent(0));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value).toBe(FIGHT_END_MS - 1500);
  });

  it("offers no predictive name a later evaluator could reach for", () => {
    // SimulationCraft expressions like `fight_remains` and `target.time_to_die`
    // depend on information the player did not have. The observed outcome may be
    // reported retrospectively; it must not be reachable under a name that
    // implies the player knew it at the time.
    for (const forbidden of [
      "fightRemains",
      "fight_remains",
      "timeToDie",
      "time_to_die",
      "predictedFightEnd",
      "estimatedTimeRemaining",
      "remainingTime",
    ]) {
      expect(state.encounter).not.toHaveProperty(forbidden);
    }
  });

  it("declines when the recorded end is not an observed fight end", () => {
    const inProgress = createCombatState(
      syntheticFight({ observedCategories: ["ENCOUNTER_PHASES"], events: MIDFIGHT, finality: "IN_PROGRESS" }),
    );
    const result = inProgress.encounter.observedFightEndDelta(afterEvent(0));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // For an in-progress fight the recorded end is where the RECORD stops. A
    // delta to it would look like a fight-length fact and be a retrieval
    // artefact.
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });
});
