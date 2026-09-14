/**
 * `refreshable`, and the one-sidedness that makes it safe.
 *
 * THE THING A READER WHO KNOWS THE GAME WILL GET WRONG
 *
 * World of Warcraft's DoT refresh rule is the 30 % pandemic window. That is NOT
 * what pinned SimulationCraft evaluates for a Rogue DoT. The Rogue module never
 * assigns `dot_behavior`, so every Rogue DoT keeps `action_t`'s default
 * `DOT_REFRESH_DURATION` (action.cpp:419), whose predicate is
 * `dot->ticks_left() <= 1` (action.cpp:4627-4628).
 *
 * On an 18-second Garrote the difference is 5.4 seconds versus roughly 2 — so
 * implementing the rule a reader expects would have been wrong by a factor of
 * nearly three, in the direction that makes a refresh look due when it is not.
 */

import { describe, expect, it } from "vitest";

import { bindRefreshable } from "../../src/specs/rogue/assassination/dot-refreshable.js";
import type { DotRemainsBinding } from "../../src/specs/rogue/assassination/dot-remains-state.js";
import { dotDurationForToken } from "../../src/data/game/rogue-dot-durations.js";

/** A KNOWN remainder, with the rest of the derivation filled plausibly. */
function known(remainsMs: number, token = "garrote"): DotRemainsBinding {
  const identity = dotDurationForToken(token);
  if (identity === null) throw new Error(`no pinned duration for ${token}`);
  return {
    state: "KNOWN",
    remainsSeconds: remainsMs / 1000,
    remainsMs,
    appliedDurationMs: identity.baseDurationMs,
    baseDurationMs: identity.baseDurationMs,
    derivation: { kind: "FIXED", baseDurationMs: identity.baseDurationMs },
    queryFightTimeMs: 100_000,
    anchor: {
      abilityGameId: identity.abilityGameId,
      operation: "APPLIED",
      position: 1,
      appliedAtFightTimeMs: 100_000 - (identity.baseDurationMs - remainsMs),
      locator: {
        streamId: "all",
        pageOrdinal: 0,
        indexInPage: 1,
        ingestionOrdinal: 1,
        rawType: "applydebuff",
        reportTimeMs: 100_000,
      },
    },
  };
}

function unknown(blocker: Extract<DotRemainsBinding, { state: "UNKNOWN" }>["blocker"]): DotRemainsBinding {
  return { state: "UNKNOWN", blocker, auraReason: null, anchor: null };
}

describe("the FALSE direction is proven from a base-tick bound", () => {
  it("is FALSE when the remainder exceeds one base tick", () => {
    // Garrote's base tick period is 2000 ms. At 5.746 s — the real derived value
    // at the verified decision point — at least two ticks remain, so
    // `ticks_left() <= 1` is false however hasted the player is.
    const result = bindRefreshable("garrote", known(5_746));
    expect(result.state).toBe("KNOWN");
    if (result.state !== "KNOWN") return;
    expect(result.refreshable).toBe(false);
    expect(result.proof).toBe("REMAINDER_EXCEEDS_ONE_BASE_TICK");
    expect(result.baseTickPeriodMs).toBe(2_000);
  });

  it("holds however much haste shortens the real tick period", () => {
    // The bound is one-sided BECAUSE haste only ever shortens the tick. A faster
    // tick means MORE ticks remain in the same window, which makes the FALSE
    // verdict stronger rather than weaker. Nothing in the derivation reads haste.
    for (const remainsMs of [2_001, 3_000, 5_746, 17_999]) {
      const result = bindRefreshable("garrote", known(remainsMs));
      expect(result.state, String(remainsMs)).toBe("KNOWN");
      if (result.state !== "KNOWN") continue;
      expect(result.refreshable, String(remainsMs)).toBe(false);
    }
  });

  it("holds however much exsanguination shortens it", () => {
    // `tick_time *= 1 / exsanguinated_rate` (sc_rogue.cpp:2619-2626), and the
    // rate is at least 1. Same direction, same conclusion, and again nothing
    // here reads it.
    const result = bindRefreshable("rupture", known(4_001, "rupture"));
    expect(result.state).toBe("KNOWN");
    if (result.state !== "KNOWN") return;
    expect(result.refreshable).toBe(false);
  });
});

describe("the TRUE direction needs no duration at all", () => {
  it("is TRUE when the DoT is proven NOT on the target", () => {
    // `dot_t::create_expression` returns true before touching any duration when
    // the dot is not ticking (dot.cpp:462-466). M4's proven-INACTIVE is exactly
    // that fact.
    const result = bindRefreshable("garrote", unknown("DOT_NOT_ACTIVE"));
    expect(result.state).toBe("KNOWN");
    if (result.state !== "KNOWN") return;
    expect(result.refreshable).toBe(true);
    expect(result.proof).toBe("NOT_TICKING");
    // No bound was needed, so none is claimed.
    expect(result.baseTickPeriodMs).toBeNull();
    expect(result.remainsSeconds).toBeNull();
  });
});

describe("the middle is UNKNOWN, and stays UNKNOWN", () => {
  it("refuses a ticking DoT whose remainder is within one base tick", () => {
    // Proving refreshable TRUE here would need a LOWER bound on the tick period,
    // which needs haste. The DoT might have one tick left and might have two.
    for (const remainsMs of [1, 500, 1_999, 2_000]) {
      const result = bindRefreshable("garrote", known(remainsMs));
      expect(result.state, String(remainsMs)).toBe("UNKNOWN");
      if (result.state !== "UNKNOWN") continue;
      expect(result.blocker, String(remainsMs)).toBe("WITHIN_ONE_BASE_TICK");
    }
  });

  it("refuses when the remainder itself is unestablished", () => {
    for (const blocker of [
      "AURA_STATE_UNKNOWN",
      "REFRESH_ANCHOR_HAS_NO_DERIVABLE_DURATION",
      "COMBO_POINTS_AT_APPLICATION_UNKNOWN",
    ] as const) {
      const result = bindRefreshable("garrote", unknown(blocker));
      expect(result.state, blocker).toBe("UNKNOWN");
      if (result.state !== "UNKNOWN") continue;
      expect(result.blocker, blocker).toBe("REMAINS_NOT_ESTABLISHED");
    }
  });

  it("refuses a token the pinned dataset carries no tick period for", () => {
    const result = bindRefreshable("crimson_tempest", known(9_000));
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    expect(result.blocker).toBe("TICK_PERIOD_NOT_MODELLED");
  });

  it("never answers TRUE for a ticking DoT", () => {
    // STRUCTURAL. The only TRUE this module can produce is `NOT_TICKING`, so a
    // ticking DoT can be FALSE or UNKNOWN and nothing else.
    for (const remainsMs of [1, 1_000, 2_000, 2_001, 10_000]) {
      const result = bindRefreshable("garrote", known(remainsMs));
      if (result.state !== "KNOWN") continue;
      expect(result.refreshable, String(remainsMs)).toBe(false);
    }
  });
});

describe("each DoT is keyed independently", () => {
  it("uses each token's own tick period", () => {
    // Both are 2000 ms at this commit, so the test asserts the LOOKUP rather than
    // a numeric difference: a hard-coded period would pass by accident today and
    // break silently the moment one of them changes.
    const garrote = dotDurationForToken("garrote");
    const rupture = dotDurationForToken("rupture");
    expect(garrote?.baseTickPeriodMs).toBe(2_000);
    expect(rupture?.baseTickPeriodMs).toBe(2_000);
    expect(bindRefreshable("garrote", known(2_001)).state).toBe("KNOWN");
    expect(bindRefreshable("rupture", known(2_001, "rupture")).state).toBe("KNOWN");
  });

  it("names the effect each tick period was read from", () => {
    // `_amplitude` appears on every effect and means "tick period" only on a
    // periodic-damage aura. Recording which row it came from is what lets the
    // number be re-checked rather than trusted.
    for (const token of ["garrote", "rupture"]) {
      const identity = dotDurationForToken(token);
      expect(identity, token).not.toBeNull();
      if (identity === null) continue;
      // E_APPLY_AURA (6) / A_PERIODIC_DAMAGE (3).
      expect(identity.tickPeriodBinding.effectType, token).toBe(6);
      expect(identity.tickPeriodBinding.effectSubtype, token).toBe(3);
      expect(identity.tickPeriodBinding.sourcePath, token).toBe("engine/dbc/generated/sc_spell_data.inc");
    }
  });

  it("records the duration MODEL, and Rupture's is combo-point scaled", () => {
    const garrote = dotDurationForToken("garrote");
    const rupture = dotDurationForToken("rupture");
    expect(garrote?.durationModel.kind).toBe("FIXED");
    expect(rupture?.durationModel.kind).toBe("COMBO_POINT_SCALED");
    // Rupture's BASE is four seconds — the number a fixed-duration model would
    // have used, and wrong for every cast.
    expect(rupture?.baseDurationMs).toBe(4_000);
    // Each model cites where it was read.
    expect(rupture?.durationModel.sourcePath).toBe("engine/class_modules/sc_rogue.cpp");
    expect(rupture?.durationModel.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rupture?.durationModel.finding).toContain("1 + rs->get_combo_points()");
  });
});
