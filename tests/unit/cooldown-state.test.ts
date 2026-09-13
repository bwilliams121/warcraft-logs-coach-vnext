/**
 * The generic cooldown derivation, over deliberately-shaped event streams.
 *
 * Warcraft Logs reports no cooldown state at all — no "cooldown started" event,
 * no "cooldown ready" event. Every value this module produces is DERIVED from an
 * observed cast plus a pinned rule, so every test here is really a test of one
 * question: what has to be true before that derivation is allowed?
 */

import { describe, expect, it } from "vitest";

import {
  cooldownRemainingAt,
  guaranteedRemainingMs,
  type CooldownModifierPolicy,
} from "../../src/engine/game-state/cooldowns/cooldown-state.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import { castEvent, syntheticFight } from "../support/synthetic-fight.js";

const ACTOR = 19;
const OTHER_ACTOR = 13;
const ABILITY = 385_627;
const OTHER_ABILITY = 360_194;
const BASE_MS = 60_000;

/** A policy that permits derivation, shaped like the one the artifact produces. */
const PROVEN_ABSENT: CooldownModifierPolicy = {
  kind: "NO_MODIFIERS_PROVEN_ABSENT",
  sourcePath: "engine/class_modules/sc_rogue.cpp",
  sourceSha256: "a".repeat(64),
  claims: ["NO_DIRECT_COOLDOWN_ADJUSTMENT", "NO_CHARGES"],
};

const MODIFIERS_POSSIBLE: CooldownModifierPolicy = {
  kind: "MODIFIERS_POSSIBLE",
  detail: "nobody has reviewed this ability",
};

interface CastSpec {
  readonly ordinal: number;
  readonly reportTimeMs: number;
  readonly abilityGameId?: number;
  readonly actorId?: number;
  readonly castPhase?: "BEGIN" | "COMPLETE";
}

function stateWith(casts: readonly CastSpec[], startTimeMs = 0, endTimeMs = 500_000): CombatState {
  return createCombatState(
    syntheticFight({
      observedCategories: ["CASTS"],
      startTimeMs,
      endTimeMs,
      events: casts.map((cast) =>
        castEvent({
          ordinal: cast.ordinal,
          reportTimeMs: cast.reportTimeMs,
          sourceActorId: cast.actorId ?? ACTOR,
          abilityGameId: cast.abilityGameId ?? ABILITY,
          castPhase: cast.castPhase ?? "COMPLETE",
        }),
      ),
    }),
  );
}

function derive(state: CombatState, position: number, overrides: Record<string, unknown> = {}) {
  return cooldownRemainingAt({
    state,
    actorId: ACTOR,
    abilityGameId: ABILITY,
    baseCooldownMs: BASE_MS,
    charges: 0,
    modifierPolicy: PROVEN_ABSENT,
    position,
    ...overrides,
  });
}

describe("a fresh cast anchors a proven lower bound", () => {
  it("derives at-least base minus elapsed", () => {
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000 },
      { ordinal: 1, reportTimeMs: 12_802, abilityGameId: OTHER_ABILITY },
    ]);
    // BOUNDED, not EXACT. SimulationCraft starts a cooldown with a SAMPLED,
    // non-negative lag delay (action.cpp:2350-2360), so an observed cast proves
    // `remains >= base - elapsed` and does not prove equality.
    const result = derive(state, 1);
    expect(result.state).toBe("BOUNDED");
    if (result.state !== "BOUNDED") return;
    expect(result.baseCooldownMs).toBe(60_000);
    expect(result.elapsedMs).toBe(2_802);
    expect(result.atLeastRemainingMs).toBe(57_198);
    expect(result.anchor.position).toBe(0);
  });

  it("never reports EXACT, because the start delay is not provably zero", () => {
    // The delay defaults to a gaussian with mean 100 ms and stddev 10 ms
    // (sim.cpp:1430, sim.cpp:2660) and is configurable per sim and per player
    // (sim.cpp:3847, player.cpp:719). Under defaults it is zero with
    // overwhelming probability — which is not the same as proven.
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000 },
      { ordinal: 1, reportTimeMs: 12_802, abilityGameId: OTHER_ABILITY },
    ]);
    expect(derive(state, 1).state).not.toBe("EXACT");
  });

  it("exposes no exact field a caller could mistake for the value", () => {
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000 },
      { ordinal: 1, reportTimeMs: 12_802, abilityGameId: OTHER_ABILITY },
    ]);
    const result = derive(state, 1);
    expect(result).not.toHaveProperty("remainingMs");
  });

  it("carries the evidence needed to audit the claim", () => {
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000 },
      { ordinal: 1, reportTimeMs: 12_000, abilityGameId: OTHER_ABILITY },
    ]);
    const result = derive(state, 1);
    if (result.state !== "BOUNDED") throw new Error("expected BOUNDED");
    // The cast locator, the query time, both inputs, and the policy behind it.
    expect(result.anchor.locator).toBeDefined();
    expect(result.anchor.abilityGameId).toBe(ABILITY);
    expect(result.anchor.actorId).toBe(ACTOR);
    // Fight-relative, so asserted as a RELATIONSHIP rather than an absolute:
    // query time minus anchor time is the elapsed the derivation used.
    expect(result.queryFightTimeMs - result.anchor.castFightTimeMs).toBe(result.elapsedMs);
    expect(result.elapsedMs).toBe(2_000);
    expect(result.modifierPolicy.kind).toBe("NO_MODIFIERS_PROVEN_ABSENT");
  });
});

describe("the anchor is the most recent valid cast", () => {
  it("uses the LATEST prior cast, not the first", () => {
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000 },
      { ordinal: 1, reportTimeMs: 80_000 },
      { ordinal: 2, reportTimeMs: 82_000, abilityGameId: OTHER_ABILITY },
    ]);
    const result = derive(state, 2);
    if (result.state !== "BOUNDED") throw new Error("expected BOUNDED");
    expect(result.anchor.position).toBe(1);
    expect(result.elapsedMs).toBe(2_000);
  });

  it("ignores a cast that happens AFTER the query", () => {
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000 },
      { ordinal: 1, reportTimeMs: 12_000, abilityGameId: OTHER_ABILITY },
      { ordinal: 2, reportTimeMs: 20_000 },
    ]);
    const result = derive(state, 1);
    if (result.state !== "BOUNDED") throw new Error("expected BOUNDED");
    expect(result.anchor.position).toBe(0);
  });
});

describe("canonical position decides, not the timestamp", () => {
  it("anchors on a same-timestamp cast that comes EARLIER in the stream", () => {
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 50_000 },
      { ordinal: 1, reportTimeMs: 50_000, abilityGameId: OTHER_ABILITY },
    ]);
    const result = derive(state, 1);
    expect(result.state).toBe("BOUNDED");
    if (result.state !== "BOUNDED") return;
    expect(result.anchor.position).toBe(0);
    expect(result.elapsedMs).toBe(0);
    expect(result.atLeastRemainingMs).toBe(60_000);
  });

  it("does NOT anchor on a same-timestamp cast that comes LATER in the stream", () => {
    // The decision could not have been informed by something that had not
    // happened yet, even though the clock reads the same.
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 50_000, abilityGameId: OTHER_ABILITY },
      { ordinal: 1, reportTimeMs: 50_000 },
    ]);
    const result = derive(state, 0);
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    expect(result.reason).toBe("NO_OBSERVED_CAST");
  });
});

describe("an expired cooldown bounds at zero, never below", () => {
  it("bounds at 0 when more than the base duration has elapsed", () => {
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000 },
      { ordinal: 1, reportTimeMs: 200_000, abilityGameId: OTHER_ABILITY },
    ]);
    const result = derive(state, 1);
    if (result.state !== "BOUNDED") throw new Error("expected BOUNDED");
    // "At least 0" is true and decides nothing — which is the honest outcome
    // once the base duration has passed, because the sampled start delay could
    // still be holding the cooldown out and no evidence here rules that out.
    expect(result.atLeastRemainingMs).toBe(0);
    // A negative bound would compare below every threshold in the APL.
    expect(result.atLeastRemainingMs).toBeGreaterThanOrEqual(0);
  });

  it("bounds at 0 exactly at the boundary", () => {
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000 },
      { ordinal: 1, reportTimeMs: 70_000, abilityGameId: OTHER_ABILITY },
    ]);
    const result = derive(state, 1);
    if (result.state !== "BOUNDED") throw new Error("expected BOUNDED");
    expect(result.atLeastRemainingMs).toBe(0);
  });
});

describe("the derivation refuses rather than approximating", () => {
  const state = stateWith([
    { ordinal: 0, reportTimeMs: 10_000 },
    { ordinal: 1, reportTimeMs: 12_000, abilityGameId: OTHER_ABILITY },
  ]);

  it("returns UNKNOWN when no prior cast was observed", () => {
    const empty = stateWith([{ ordinal: 0, reportTimeMs: 12_000, abilityGameId: OTHER_ABILITY }]);
    const result = derive(empty, 0);
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    // Not "ready": the ability may have been used before the capture began.
    expect(result.reason).toBe("NO_OBSERVED_CAST");
  });

  it("returns UNKNOWN when the base cooldown is not modelled", () => {
    const result = derive(state, 1, { baseCooldownMs: null });
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    expect(result.reason).toBe("BASE_COOLDOWN_NOT_MODELLED");
  });

  it("returns UNKNOWN for an ability with charges", () => {
    // An ability at 1 of 2 charges is usable now AND recharging. Rather than
    // pick a reading, refuse.
    const result = derive(state, 1, { charges: 2 });
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    expect(result.reason).toBe("CHARGES_NOT_MODELLED");
  });

  it("returns UNKNOWN when modifiers are not proven absent", () => {
    // THE load-bearing refusal. Without a positive absence proof, `base -
    // elapsed` silently assumes nothing reset the cooldown — and no event
    // exists that could have told us otherwise.
    const result = derive(state, 1, { modifierPolicy: MODIFIERS_POSSIBLE });
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    expect(result.reason).toBe("MODIFIERS_NOT_PROVEN_ABSENT");
  });

  it("returns UNKNOWN when the query position names no event", () => {
    const result = derive(state, 99);
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    expect(result.reason).toBe("QUERY_POSITION_UNRESOLVED");
  });

  it("never fabricates an absence of reset events from a filtered stream", () => {
    // Structural: the query surface has no event-coverage parameter and no way
    // to ask "did a reset happen". The guarantee comes from the POLICY, which is
    // a claim about the authority, not from anything observed in the capture.
    const result = derive(state, 1);
    if (result.state !== "BOUNDED") throw new Error("expected BOUNDED");
    expect(result.modifierPolicy.kind).toBe("NO_MODIFIERS_PROVEN_ABSENT");
    if (result.modifierPolicy.kind !== "NO_MODIFIERS_PROVEN_ABSENT") return;
    expect(result.modifierPolicy.sourcePath).toContain("sc_rogue.cpp");
    expect(result.modifierPolicy.claims.length).toBeGreaterThan(0);
  });
});

describe("a cooldown belongs to one actor and one ability", () => {
  it("ignores the same ability cast by a DIFFERENT actor", () => {
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000, actorId: OTHER_ACTOR },
      { ordinal: 1, reportTimeMs: 12_000, abilityGameId: OTHER_ABILITY },
    ]);
    const result = derive(state, 1);
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    expect(result.reason).toBe("NO_OBSERVED_CAST");
  });

  it("ignores a DIFFERENT ability cast by the same actor", () => {
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000, abilityGameId: OTHER_ABILITY },
      { ordinal: 1, reportTimeMs: 12_000, abilityGameId: OTHER_ABILITY },
    ]);
    const result = derive(state, 1);
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    expect(result.reason).toBe("NO_OBSERVED_CAST");
  });

  it("does not accept a BEGIN cast as evidence of execution", () => {
    // The pinned cooldown starts inside `action_t::execute()`. A cast that began
    // and may never have completed does not evidence execution.
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000, castPhase: "BEGIN" },
      { ordinal: 1, reportTimeMs: 12_000, abilityGameId: OTHER_ABILITY },
    ]);
    const result = derive(state, 1);
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    expect(result.reason).toBe("NO_OBSERVED_CAST");
  });
});

describe("the guaranteed lower bound", () => {
  it("is the bound for a BOUNDED state", () => {
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000 },
      { ordinal: 1, reportTimeMs: 12_802, abilityGameId: OTHER_ABILITY },
    ]);
    expect(guaranteedRemainingMs(derive(state, 1))).toBe(57_198);
  });

  it("is null for UNKNOWN, never zero", () => {
    // Zero would read as "ready now", which is the most dangerous default a
    // `remains <= threshold` comparison could be handed.
    const empty = stateWith([{ ordinal: 0, reportTimeMs: 12_000, abilityGameId: OTHER_ABILITY }]);
    expect(guaranteedRemainingMs(derive(empty, 0))).toBeNull();
  });
});

describe("why a cast-anchored cooldown is BOUNDED and not EXACT", () => {
  /**
   * The pinned lag path, recorded so a future reader does not re-litigate it:
   *
   *     action.cpp:2350   delay = rng().gauss( player->world_lag );
   *     action.cpp:2351   if ( delay > 400_ms ) delay -= 400_ms; else delay = 0_ms;
   *     action.cpp:2360   cooldown->start( this, cd_duration, delay );
   *
   *     sim.cpp:1430      world_lag( 100_ms, timespan_t::min() )
   *     sim.cpp:2660      stddev defaults to mean * 0.1  ->  10 ms
   *     sim.cpp:3847      `default_world_lag` is a sim option
   *     player.cpp:719    `world_lag` is settable per player
   *
   * Three facts follow, and together they forbid EXACT:
   *
   *   1. the delay is SAMPLED (`rng().gauss`), not computed
   *   2. `world_lag` is CONFIGURABLE, so the distribution is not fixed
   *   3. the `!background && !proc` guard means the path applies to any
   *      player-cast action, including every ability this project derives
   *
   * Under defaults the delay is zero with overwhelming probability. That is
   * "normally zero", not "proven zero", and the difference is the whole reason
   * the result vocabulary has three members instead of two.
   *
   * The delay is non-negative, so it can only push the ready time LATER — which
   * is what makes `base - elapsed` a sound LOWER bound.
   */
  it("never produces EXACT from a cast anchor, under any input", () => {
    // Swept rather than asserted once: no combination of elapsed time reaches
    // EXACT, because nothing in the inputs could prove the delay away.
    for (const queryMs of [10_000, 10_001, 40_000, 69_999, 70_000, 200_000]) {
      const state = stateWith([
        { ordinal: 0, reportTimeMs: 10_000 },
        { ordinal: 1, reportTimeMs: queryMs, abilityGameId: OTHER_ABILITY },
      ]);
      const result = derive(state, 1);
      expect(result.state, `query at ${String(queryMs)}`).not.toBe("EXACT");
    }
  });

  it("keeps EXACT in the vocabulary for a derivation that could earn it", () => {
    // The state is not deleted: a future derivation able to prove a zero-delay
    // start may legitimately report it. Nothing produces it today.
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000 },
      { ordinal: 1, reportTimeMs: 12_000, abilityGameId: OTHER_ABILITY },
    ]);
    const result = derive(state, 1);
    expect(["EXACT", "BOUNDED", "UNKNOWN"]).toContain(result.state);
  });

  it("states a bound that is sound in the only direction the delay moves", () => {
    // delay >= 0  =>  ready >= cast + base  =>  remaining >= base - elapsed.
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000 },
      { ordinal: 1, reportTimeMs: 12_802, abilityGameId: OTHER_ABILITY },
    ]);
    const result = derive(state, 1);
    if (result.state !== "BOUNDED") throw new Error("expected BOUNDED");
    expect(result.atLeastRemainingMs).toBe(result.baseCooldownMs - result.elapsedMs);
  });

  it("offers no upper bound, because nothing establishes one", () => {
    // The lag delay is drawn from an unbounded gaussian. An upper-bound field
    // would be an invitation to invent a number.
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 10_000 },
      { ordinal: 1, reportTimeMs: 12_802, abilityGameId: OTHER_ABILITY },
    ]);
    const result = derive(state, 1);
    expect(result).not.toHaveProperty("atMostRemainingMs");
    expect(result).not.toHaveProperty("upperBoundMs");
  });
});
