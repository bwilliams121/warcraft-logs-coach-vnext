import { describe, expect, it } from "vitest";

import { exclusiveRange, inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import { afterEvent, beforeEvent, endOfTimestamp } from "../../src/engine/state/temporal.js";
import {
  absentCategory,
  castEvent,
  damageEvent,
  fullyObservedFight,
  NOT_OBSERVABLE_CATEGORY,
  partialCategory,
  syntheticFight,
  UNVERIFIED_CATEGORY,
} from "../support/synthetic-fight.js";

/**
 * Historical failure this protects against:
 *
 * The old analyzer answered "did the player do X?" by looking for X and, when
 * it found nothing, concluding that X did not happen. That is only sound when
 * you actually looked everywhere X could have been. A failed page, an
 * unverified category, or an ally outside the retrieved scope all produce the
 * same empty search result as a player who genuinely never acted — and the
 * coaching built on top could not tell the difference.
 *
 * The asymmetry that fixes it, exercised throughout this file:
 *
 *     a POSITIVE observation needs no coverage — we saw it, so it happened
 *     an ABSENCE claim needs complete coverage — or it is UNKNOWN
 *
 * "You never used Kingsbane" and "we could not tell whether you used
 * Kingsbane" are different sentences, and only one of them may be said here.
 */

const PLAYER = 5;
const ALLY = 11;
const BOSS = 160;
const KINGSBANE = 385627;

const CASTS_AT = 1500;

function fightWithOneCast(
  options: Parameters<typeof syntheticFight>[0] = {},
): ReturnType<typeof syntheticFight> {
  return syntheticFight({
    ...options,
    events: options.events ?? [
      castEvent({
        ordinal: 0,
        reportTimeMs: CASTS_AT,
        castPhase: "COMPLETE",
        sourceActorId: PLAYER,
        abilityGameId: KINGSBANE,
      }),
      damageEvent({ ordinal: 1, reportTimeMs: 4000, sourceActorId: PLAYER, targetActorId: BOSS }),
    ],
  });
}

function askForMissingAbility(fight: ReturnType<typeof syntheticFight>, actorId = PLAYER) {
  const state = createCombatState(fight);
  return state.lastObservedCast({
    actorId,
    // An ability nobody cast. The honest answer depends entirely on whether we
    // were in a position to have seen it.
    abilityGameId: 999_999,
    castPhase: "COMPLETE",
    before: afterEvent(1),
  });
}

describe("a coverage gap never becomes negative evidence", () => {
  it("returns UNKNOWN rather than absence when the interval is only partly covered", () => {
    const result = askForMissingAbility(
      fightWithOneCast({ categories: { CASTS: partialCategory([exclusiveRange(1000, 2000)]) } }),
    );

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // The 2000-4000 stretch was never retrieved. A cast could have happened
    // there, and "no cast found" is not evidence that none did.
    expect(result.reason).toBe("INSUFFICIENT_COVERAGE");
    expect(result).not.toHaveProperty("value");
  });

  it("returns UNKNOWN when coverage is ABSENT entirely", () => {
    const result = askForMissingAbility(fightWithOneCast({ categories: { CASTS: absentCategory() } }));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("INSUFFICIENT_COVERAGE");
  });

  it("answers absence confidently once the interval asked about IS covered", () => {
    const state = createCombatState(
      fightWithOneCast({ categories: { CASTS: partialCategory([inclusiveRange(1000, 2000)]) } }),
    );
    const result = state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: 999_999,
      castPhase: "COMPLETE",
      before: endOfTimestamp(1800),
    });

    // PARTIAL coverage is not useless. It is authoritative exactly as far as it
    // reaches, and confining the question to that interval earns a real answer.
    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value).toBeNull();
  });
});

describe("capability is never read as absence", () => {
  it("returns UNKNOWN while the category's capability is UNVERIFIED", () => {
    const result = askForMissingAbility(fightWithOneCast({ categories: { CASTS: UNVERIFIED_CATEGORY } }));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // Not knowing whether Warcraft Logs emits a category is not evidence that
    // nothing of that kind happened.
    expect(result.reason).toBe("CAPABILITY_UNVERIFIED");
  });

  it("keeps NOT_OBSERVABLE reported distinctly from UNVERIFIED", () => {
    const unverified = askForMissingAbility(fightWithOneCast({ categories: { CASTS: UNVERIFIED_CATEGORY } }));
    const notObservable = askForMissingAbility(
      fightWithOneCast({ categories: { CASTS: NOT_OBSERVABLE_CATEGORY } }),
    );

    if (unverified.certainty !== "UNKNOWN" || notObservable.certainty !== "UNKNOWN") return;
    // Both block the claim, and they are never collapsed into one another:
    // one is ignorance about the source, the other is knowledge about it.
    expect(unverified.reason).toBe("CAPABILITY_UNVERIFIED");
    expect(notObservable.reason).toBe("CAPABILITY_NOT_OBSERVABLE");
    expect(unverified.reason).not.toBe(notObservable.reason);
  });

  it("never turns an UNVERIFIED capability into a confident state", () => {
    const result = askForMissingAbility(fightWithOneCast({ categories: { CASTS: UNVERIFIED_CATEGORY } }));

    expect(result.certainty).not.toBe("EXACT");
    expect(result.certainty).not.toBe("BOUNDED");
    expect(result.certainty).not.toBe("STALE");
    expect(JSON.stringify(result)).not.toContain('"value"');
  });
});

describe("actor scope is never read as absence", () => {
  it("returns UNKNOWN for an actor the evidence does not vouch for", () => {
    // CASTS observed and completely covered, so scope is the only thing left
    // that can block the claim.
    const result = askForMissingAbility(
      fightWithOneCast({ observedCategories: ["CASTS"], actorScope: [PLAYER] }),
      ALLY,
    );

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // Under PLAYER_CONTEXT the ally's events may physically sit in the single
    // unfiltered stream. Scope declares what we vouch for, and opportunism
    // about what happens to be present is a scope widening nobody derived.
    expect(result.reason).toBe("INSUFFICIENT_SCOPE");
  });

  it("answers for the actor that IS in scope", () => {
    const result = askForMissingAbility(
      fightWithOneCast({ observedCategories: ["CASTS"], actorScope: [PLAYER] }),
      PLAYER,
    );

    expect(result.certainty).toBe("EXACT");
  });
});

describe("a positive observation never needs coverage to be believed", () => {
  it("returns the observed cast even when coverage is ABSENT", () => {
    const state = createCombatState(fightWithOneCast({ categories: { CASTS: absentCategory() } }));
    const result = state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: KINGSBANE,
      castPhase: "COMPLETE",
      before: afterEvent(1),
    });

    // The asymmetry. We have the event in hand; a retrieval deficiency
    // elsewhere does not un-observe it.
    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT" || result.value === null) return;
    expect(result.value.abilityGameId).toBe(KINGSBANE);
    expect(result.value.reportTimeMs).toBe(CASTS_AT);
  });

  it("returns the observed cast even for an actor outside the declared scope", () => {
    const state = createCombatState(
      syntheticFight({
        actorScope: [PLAYER],
        events: [
          castEvent({
            ordinal: 0,
            reportTimeMs: CASTS_AT,
            castPhase: "COMPLETE",
            sourceActorId: ALLY,
            abilityGameId: KINGSBANE,
          }),
        ],
      }),
    );
    const result = state.lastObservedCast({
      actorId: ALLY,
      abilityGameId: KINGSBANE,
      castPhase: "COMPLETE",
      before: afterEvent(0),
    });

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT" || result.value === null) return;
    expect(result.value.actorId).toBe(ALLY);
  });
});

describe("disordered time never becomes absence", () => {
  const events = [
    castEvent({
      ordinal: 0,
      reportTimeMs: 4000,
      castPhase: "COMPLETE",
      sourceActorId: PLAYER,
      abilityGameId: KINGSBANE,
    }),
    damageEvent({ ordinal: 1, reportTimeMs: 1200, sourceActorId: PLAYER, targetActorId: BOSS }),
  ];

  it("refuses an absence claim when canonical order is not a timeline", () => {
    const state = createCombatState(syntheticFight({ events }));
    const result = state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: 999_999,
      castPhase: "COMPLETE",
      before: afterEvent(1),
    });

    expect(state.temporalIntegrity.state).toBe("NON_MONOTONIC");
    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // The prefix is a range of POSITIONS. Checking coverage over it means
    // treating it as a time interval, which is only valid when the two orders
    // agree — and here they do not.
    expect(result.reason).toBe("NON_MONOTONIC_TIME");
  });

  it("still reports a cast it actually observed", () => {
    const state = createCombatState(syntheticFight({ events }));
    const result = state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: KINGSBANE,
      castPhase: "COMPLETE",
      before: afterEvent(1),
    });

    // Disordered time does not un-observe an event; it only disqualifies
    // reasoning that depends on the ordering.
    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT" || result.value === null) return;
    expect(result.value.position).toBe(0);
  });

  it("refuses an absence claim across concatenated hostility streams", () => {
    const state = createCombatState(
      syntheticFight({
        hostilityStreams: ["FRIENDLY", "ENEMY"],
        events: [
          damageEvent({ ordinal: 0, reportTimeMs: 1200, streamId: "all:friendlies" }),
          damageEvent({ ordinal: 1, reportTimeMs: 1400, streamId: "all:enemies" }),
        ],
      }),
    );
    const result = state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: KINGSBANE,
      castPhase: "COMPLETE",
      before: afterEvent(1),
    });

    // Ascending timestamps are not enough: two streams appended into one array
    // are not one chronological sequence, and pretending otherwise is how a
    // second stream's quiet opening becomes the first stream's idle time.
    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("NON_MONOTONIC_TIME");
  });
});

describe("the test fixture itself fails closed", () => {
  /**
   * The fixture is part of the safety property, not a neutral convenience.
   *
   * If `syntheticFight()` granted OBSERVABLE/COMPLETE evidence by default, a
   * test author who simply forgot to describe the evidence would be testing
   * against perfect data without knowing it — and every fail-closed assertion
   * in this file would pass for the wrong reason. Perfect evidence must be
   * something a test ASKS for, never something it inherits.
   */
  it("cannot establish an absence claim without explicitly configured evidence", () => {
    const state = createCombatState(fightWithOneCast());
    const result = state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: 999_999,
      castPhase: "COMPLETE",
      before: afterEvent(1),
    });

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("CAPABILITY_UNVERIFIED");
  });

  it("leaves every category UNVERIFIED by default, so none can be assumed", () => {
    const fight = syntheticFight();

    for (const evidence of Object.values(fight.completeness.categories)) {
      expect(evidence.capability).toBe("UNVERIFIED");
      // The UNVERIFIED branch structurally has no coverage, so there is nothing
      // for a query to read optimistically.
      expect(evidence).not.toHaveProperty("coverage");
    }
  });

  it("still reports what a default fixture positively observed", () => {
    const state = createCombatState(fightWithOneCast());
    const result = state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: KINGSBANE,
      castPhase: "COMPLETE",
      before: afterEvent(1),
    });

    // Failing closed is about what we may CLAIM, not about discarding what we
    // saw. A conservative fixture must not suppress a real observation.
    expect(result.certainty).toBe("EXACT");
  });

  it("establishes absence only once the category is named", () => {
    const withoutEvidence = askForMissingAbility(fightWithOneCast());
    const withEvidence = askForMissingAbility(fightWithOneCast({ observedCategories: ["CASTS"] }));

    expect(withoutEvidence.certainty).toBe("UNKNOWN");
    expect(withEvidence.certainty).toBe("EXACT");
  });

  it("does not let an unrelated observed category unlock the claim", () => {
    const result = askForMissingAbility(fightWithOneCast({ observedCategories: ["DAMAGE", "AURAS"] }));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    // Evidence is per category. Observing damage says nothing about whether
    // casts were retrievable.
    expect(result.reason).toBe("CAPABILITY_UNVERIFIED");
  });

  it("grants complete evidence through the explicit opt-in helper", () => {
    const result = askForMissingAbility(fullyObservedFight({ events: fightWithOneCast().events }));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value).toBeNull();
  });
});

describe("an empty fight is not a clean fight", () => {
  it("does not answer absence from an empty event list without coverage", () => {
    const state = createCombatState(syntheticFight({ events: [], categories: { CASTS: absentCategory() } }));
    const result = state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: KINGSBANE,
      castPhase: "COMPLETE",
      before: endOfTimestamp(5000),
    });

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("INSUFFICIENT_COVERAGE");
  });

  it("does answer absence from an empty event list when coverage is complete", () => {
    const state = createCombatState(syntheticFight({ events: [], observedCategories: ["CASTS"] }));
    const result = state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: KINGSBANE,
      castPhase: "COMPLETE",
      before: endOfTimestamp(5000),
    });

    // A fully retrieved fight containing no casts is an observed fact, not a
    // failure. The distinction from the previous case is the whole point.
    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value).toBeNull();
  });

  it("treats a position before the first event as a real question, not an error", () => {
    const state = createCombatState(fightWithOneCast({ observedCategories: ["CASTS"] }));
    const result = state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: KINGSBANE,
      castPhase: "COMPLETE",
      before: beforeEvent(0),
    });

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    expect(result.value).toBeNull();
  });
});
