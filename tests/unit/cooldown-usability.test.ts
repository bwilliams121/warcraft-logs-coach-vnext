/**
 * The cooldown -> readiness bridge, and the one comparison that defines it.
 *
 * SimulationCraft does NOT require a cooldown to have expired:
 *
 *     cooldown_t::is_ready()  ->  queueable() <= sim.current_time()
 *     cooldown_t::queueable() ->  ready - player->cooldown_tolerance()
 *
 * so `remaining > 0` is not enough to prove an action could not fire. A bridge
 * built on it would call ready actions unusable and silently delete real
 * candidates from the priority scan. Every test here exists to pin the actual
 * rule — STRICTLY greater than the tolerance — and the boundary around it.
 */

import { describe, expect, it } from "vitest";

import { cooldownReadinessAt } from "../../src/engine/game-state/cooldowns/cooldown-usability.js";
import type { CooldownState } from "../../src/engine/game-state/cooldowns/cooldown-state.js";

const POLICY = {
  kind: "NO_MODIFIERS_PROVEN_ABSENT",
  sourcePath: "engine/class_modules/sc_rogue.cpp",
  sourceSha256: "0".repeat(64),
  claims: ["NO_DIRECT_COOLDOWN_ADJUSTMENT"],
} as const;

const ANCHOR = {
  abilityGameId: 385_627,
  actorId: 19,
  position: 3,
  castFightTimeMs: 1_000,
  locator: {
    streamId: "all",
    pageOrdinal: 0,
    indexInPage: 3,
    ingestionOrdinal: 3,
    rawType: "cast",
    reportTimeMs: 2_172_726,
  },
} as const;

/** A BOUNDED cooldown with a proven lower bound of `atLeastRemainingMs`. */
function bounded(atLeastRemainingMs: number): CooldownState {
  return {
    state: "BOUNDED",
    baseCooldownMs: 60_000,
    elapsedMs: 60_000 - atLeastRemainingMs,
    atLeastRemainingMs,
    queryFightTimeMs: ANCHOR.castFightTimeMs + (60_000 - atLeastRemainingMs),
    anchor: ANCHOR,
    modifierPolicy: POLICY,
  };
}

function unknown(reason: "NO_OBSERVED_CAST"): CooldownState {
  return { state: "UNKNOWN", reason, castStateReason: null, anchor: null };
}

describe("the threshold is the tolerance, not zero", () => {
  it("proves NOT_READY when the bound clears the tolerance", () => {
    const result = cooldownReadinessAt({ cooldown: bounded(57_198), cooldownToleranceMs: 250 });
    expect(result.state).toBe("PROVEN_NOT_READY");
    if (result.state !== "PROVEN_NOT_READY") return;
    expect(result.provenRemainingAtLeastMs).toBe(57_198);
    // The threshold is carried WITH the verdict, so a reader can see what the
    // comparison was against rather than having to know the default.
    expect(result.cooldownToleranceMs).toBe(250);
  });

  it("refuses to prove anything at 100 ms remaining", () => {
    // THE regression. SimulationCraft would queue this action; a `remains > 0`
    // bridge would have called it unusable and removed a real candidate.
    const result = cooldownReadinessAt({ cooldown: bounded(100), cooldownToleranceMs: 250 });
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    expect(result.reason).toBe("WITHIN_QUEUEING_TOLERANCE");
  });

  it("is UNKNOWN at exactly the tolerance, because queueable() is inclusive", () => {
    // `queueable() <= now` admits equality, so 250 ms remaining IS ready.
    const result = cooldownReadinessAt({ cooldown: bounded(250), cooldownToleranceMs: 250 });
    expect(result.state).toBe("UNKNOWN");
  });

  it("proves NOT_READY one millisecond above it", () => {
    const result = cooldownReadinessAt({ cooldown: bounded(251), cooldownToleranceMs: 250 });
    expect(result.state).toBe("PROVEN_NOT_READY");
  });

  it("moves the boundary when the profile moves the tolerance", () => {
    // The tolerance is a configurable option, not a constant. A profile with a
    // 2-second tolerance genuinely cannot prove a 1-second remainder unusable.
    expect(cooldownReadinessAt({ cooldown: bounded(1_000), cooldownToleranceMs: 250 }).state).toBe(
      "PROVEN_NOT_READY",
    );
    expect(cooldownReadinessAt({ cooldown: bounded(1_000), cooldownToleranceMs: 2_000 }).state).toBe(
      "UNKNOWN",
    );
  });
});

describe("an unestablished input is never filled in", () => {
  it("returns UNKNOWN when no tolerance was established", () => {
    // Emphatically NOT "fall back to 250". A bridge that picked a value here
    // would produce a verdict the profile never licensed.
    const result = cooldownReadinessAt({ cooldown: bounded(57_198), cooldownToleranceMs: null });
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    expect(result.reason).toBe("COOLDOWN_TOLERANCE_NOT_ESTABLISHED");
  });

  it("returns UNKNOWN for a nonsensical tolerance rather than coercing it", () => {
    for (const tolerance of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const result = cooldownReadinessAt({ cooldown: bounded(57_198), cooldownToleranceMs: tolerance });
      expect(result.state).toBe("UNKNOWN");
      if (result.state !== "UNKNOWN") continue;
      expect(result.reason).toBe("COOLDOWN_TOLERANCE_NOT_ESTABLISHED");
    }
  });

  it("returns UNKNOWN when the cooldown itself could not be derived", () => {
    const result = cooldownReadinessAt({
      cooldown: unknown("NO_OBSERVED_CAST"),
      cooldownToleranceMs: 250,
    });
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    // And the reason names WHICH input was missing. A single UNKNOWN would make
    // "no cast observed" and "no tolerance configured" indistinguishable.
    expect(result.reason).toBe("COOLDOWN_STATE_UNKNOWN");
  });
});

describe("only the negative direction is ever claimed", () => {
  it("has no member meaning READY, at any remaining value", () => {
    // Readiness also depends on resources, range and stance, none of which this
    // project models. A zero remainder proves the COOLDOWN is done and nothing
    // more, so there is deliberately no positive verdict to return.
    for (const remaining of [0, 1, 100, 250, 60_000]) {
      const result = cooldownReadinessAt({ cooldown: bounded(remaining), cooldownToleranceMs: 250 });
      expect(["PROVEN_NOT_READY", "UNKNOWN"]).toContain(result.state);
      expect(String(result.state)).not.toContain("READY_");
    }
  });
});
