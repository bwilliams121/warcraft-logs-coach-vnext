/**
 * A focused view changes nothing about the analysis it carries.
 *
 * WHAT IS BEING PROVED
 *
 * The M5-D2 corpus is 1083 real events from a real Assassination pull, and five
 * existing test files assert concrete outcomes over it — a MATCH on Garrote, a
 * REJECTED Envenom, an UNKNOWN Deathmark blocked on predictive state, and the
 * exclusion census. Those assertions stand on a fight whose evidence vouches for
 * EVERY actor, because the corpus fixture predates any notion of focus.
 *
 * M7-B analyses that same player through a `PLAYER_CONTEXT` view of a fight
 * retrieved once for a whole raid. The evidence scope is genuinely narrower: the
 * analysed player, the enemies, and nobody else's ally state. So the question
 * this file answers is whether narrowing it changed a single conclusion.
 *
 * It compares the WHOLE analyzer result — every comparison, every outcome, every
 * blocker class, every exclusion, the full coverage census — not a summary.
 * Matching counts would not be enough: two runs can agree on how many decisions
 * were UNKNOWN while disagreeing about which ones, and about why.
 *
 * WHY THIS IS THE STRONGEST AVAILABLE EQUIVALENCE TEST
 *
 * It runs the real analyzer over real evidence through the real state engine.
 * The only thing that differs between the two sides is the evidence projection
 * under test.
 */

import { describe, expect, it } from "vitest";

import { analyzeObservedAssassinationDecisions } from "../../src/specs/rogue/assassination/observed-analysis.js";
import { focusedFightFor } from "../../src/engine/normalization/fight-core.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import type { CombatActor } from "../../src/engine/normalization/actors.js";
import { syntheticFightCore } from "../support/synthetic-fight.js";
import { M5D2_ACTOR, M5D2_TARGET, m5d2Fight, m5d2State } from "../support/m5d2-fixture.js";

const SUPPORTED_SPEC = "rogue/assassination";
/** The second enemy present in the slice. Named so the catalog is not guesswork. */
const SECOND_ENEMY = 22;

function actor(actorId: number, actorType: CombatActor["actorType"]): CombatActor {
  return {
    actorId,
    gameId: null,
    name: `actor-${String(actorId)}`,
    server: null,
    actorType,
    rawType: actorType === "PLAYER" ? "Player" : "NPC",
    subType: actorType === "PLAYER" ? "Rogue" : "Boss",
    petOwnerActorId: null,
  };
}

/**
 * The corpus slice as an actor-independent core.
 *
 * The events are the SAME normalized array the corpus fixture produced — this
 * re-projects the evidence view around them rather than re-normalizing, so any
 * difference in the result can only come from the projection.
 */
function corpusCore() {
  const fixture = m5d2Fight();
  return syntheticFightCore({
    events: fixture.events,
    startTimeMs: fixture.fight.startTimeMs,
    endTimeMs: fixture.fight.endTimeMs,
    actors: new Map<number, CombatActor>([
      [M5D2_ACTOR, actor(M5D2_ACTOR, "PLAYER")],
      [M5D2_TARGET, actor(M5D2_TARGET, "NPC")],
      [SECOND_ENEMY, actor(SECOND_ENEMY, "NPC")],
    ]),
    friendlyPlayers: [M5D2_ACTOR],
    talentImport: { actorId: M5D2_ACTOR, code: null },
  });
}

function analyze(state: ReturnType<typeof createCombatState>) {
  return analyzeObservedAssassinationDecisions({
    state,
    actorId: M5D2_ACTOR,
    specId: SUPPORTED_SPEC,
    targetActorId: null,
  });
}

const baseline = analyze(m5d2State());
const focused = analyze(createCombatState(focusedFightFor(corpusCore(), M5D2_ACTOR, "PLAYER_CONTEXT")));

describe("the real Assassination analysis survives the focused evidence view", () => {
  it("analyzed the corpus on both sides, so the comparison is not vacuous", () => {
    // A test that compared two SPEC_NOT_SUPPORTED results would pass and prove
    // nothing. This pins that both sides did real work first, and states the
    // baseline census so a future change to the corpus cannot silently shrink
    // what the equivalence above is standing on.
    //
    // `rejected` is 0 here and that is correct: the corpus slice contains no
    // decision this build can positively prove unselectable. The REJECTED path
    // is exercised by `m5e-real-decision-comparisons.test.ts` over a different
    // fixture, and asserting it here would be asserting the wrong fight.
    expect(baseline.status).toBe("ANALYZED");
    expect(focused.status).toBe("ANALYZED");
    if (baseline.status !== "ANALYZED" || focused.status !== "ANALYZED") return;

    expect(baseline.coverage.eligibleDecisions).toBe(11);
    expect(baseline.coverage.match).toBe(1);
    expect(baseline.coverage.unknown).toBe(10);
    expect(baseline.coverage.excludedCastCount).toBe(120);
    // Two distinct blocker classes and five distinct observed tokens: the
    // comparison below is ranging over real variety, not one repeated shape.
    expect(baseline.coverage.unknownBlockerClasses.map((row) => row.key)).toEqual([
      "OBSERVED_STATE_MISSING",
      "DIVERGENT_WORLDS",
    ]);
    expect(new Set(baseline.comparisons.map((comparison) => comparison.decision.observedToken)).size).toBe(5);
  });

  it("produces a deep-equal analysis, decision for decision", () => {
    // THE HEADLINE. Not counts — the entire result, including every
    // comparison's basis, authority token, selection precision, decisive
    // blocker, raw blocker and evidence locator.
    expect(focused).toEqual(baseline);
  });

  it("keeps every UNKNOWN blocked for the same reason", () => {
    if (baseline.status !== "ANALYZED" || focused.status !== "ANALYZED") return;
    // Called out separately from the whole-object comparison because this is the
    // failure mode a narrower scope would actually cause: an absence claim that
    // can no longer be made returns INSUFFICIENT_SCOPE, and a decision that used
    // to resolve silently becomes UNKNOWN. Naming it makes a future regression
    // report itself in the vocabulary of the defect.
    expect(focused.coverage.unknownBlockerClasses).toEqual(baseline.coverage.unknownBlockerClasses);
    expect(focused.coverage.unknown).toBe(baseline.coverage.unknown);
    expect(focused.coverage.resolvedComparisons).toBe(baseline.coverage.resolvedComparisons);
  });

  it("excludes exactly the same casts for exactly the same reasons", () => {
    if (baseline.status !== "ANALYZED" || focused.status !== "ANALYZED") return;
    expect(focused.excluded).toEqual(baseline.excluded);
    expect(focused.coverage.exclusions).toEqual(baseline.coverage.exclusions);
  });
});

describe("the narrowing is real, not an absence of narrowing", () => {
  it("fences ally state off while keeping the analysed player and the enemies", () => {
    // Guards against the test passing because the focused view quietly vouched
    // for every actor. If this ever reads `null`, the equivalence above stops
    // meaning anything.
    const view = focusedFightFor(corpusCore(), M5D2_ACTOR, "PLAYER_CONTEXT");
    const casts = view.completeness.categories.CASTS;
    expect(casts.capability).toBe("OBSERVABLE");
    if (casts.capability !== "OBSERVABLE") return;
    expect(casts.coverage.actorScope).toEqual([M5D2_ACTOR, M5D2_TARGET, SECOND_ENEMY]);
  });

  it("was compared against a fixture that vouches for every actor", () => {
    const fixtureCasts = m5d2Fight().completeness.categories.CASTS;
    expect(fixtureCasts.capability).toBe("OBSERVABLE");
    if (fixtureCasts.capability !== "OBSERVABLE") return;
    expect(fixtureCasts.coverage.actorScope).toBeNull();
  });
});
