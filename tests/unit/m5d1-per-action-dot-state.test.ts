/**
 * M5-D1's FIRST correctness fix: `remains` is keyed by the acting action.
 *
 * THE LATENT WRONG ANSWER THIS CLOSES
 *
 * Until M5-D1, `AtomBindings` carried ONE scalar `dotRemainsSeconds`, filled from
 * Garrote, and `evaluateInWorld` returned it for every entry that mentioned bare
 * `remains`. `core_dot[3]` is RUPTURE. The moment that line became parseable — as
 * it does in M5-D1, once `refreshable` and binary `-` are supported — Rupture's
 * `remains<=` comparison would have been answered with Garrote's remaining time.
 *
 * Nothing would have looked wrong. Both are plausible numbers of seconds, both
 * move plausibly through a fight, and the resulting verdict would have been a
 * confident statement about the wrong bleed.
 *
 * THE TESTS BELOW USE DELIBERATELY DIFFERENT NUMBERS, so a regression cannot
 * pass by coincidence. Garrote is bound at 5.746 s — the real derived value at
 * the verified decision point — and Rupture at 19.0 s. Any threshold between
 * them separates a correct answer from a contaminated one.
 */

import { describe, expect, it } from "vitest";

import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  NO_ACTING_ACTION,
  actingAction,
  evaluateSimcExpression,
  knownNumber,
  unknownNumber,
  type AtomBindings,
} from "../../src/simc/expression/evaluate.js";

/** Two DoTs, two very different remainders. The gap is the whole point. */
const GARROTE_REMAINS = 5.746;
const RUPTURE_REMAINS = 19;

function bindings(overrides: Partial<AtomBindings> = {}): AtomBindings {
  return {
    comboPoints: unknownNumber("STATE_NOT_ESTABLISHED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_ESTABLISHED"),
    energyPct: unknownNumber("STATE_NOT_ESTABLISHED"),
    dotRemainsSecondsByAction: [
      { actionToken: "garrote", remainsSeconds: knownNumber(GARROTE_REMAINS) },
      { actionToken: "rupture", remainsSeconds: knownNumber(RUPTURE_REMAINS) },
    ],
    knownBuffs: [],
    ...overrides,
  };
}

function evaluate(source: string, token: string | null, overrides: Partial<AtomBindings> = {}) {
  const parsed = parseSimcExpression(source);
  if (!parsed.ok) throw new Error(`expected ${source} to parse, got ${parsed.reason}`);
  return evaluateSimcExpression(
    parsed.ast,
    source,
    bindings(overrides),
    token === null ? NO_ACTING_ACTION : actingAction(token),
  );
}

function value(source: string, token: string | null, overrides: Partial<AtomBindings> = {}): boolean | null {
  const result = evaluate(source, token, overrides);
  return result.outcome === "RESOLVED" ? result.value : null;
}

/** The `remains` atom's trace entry, or `undefined`. Never throws on UNSUPPORTED. */
function remainsAtom(token: string | null, overrides: Partial<AtomBindings> = {}) {
  const result = evaluate("remains<=14", token, overrides);
  if (result.outcome === "UNSUPPORTED") throw new Error("expected an evaluation");
  return result.trace.atoms.find((atom) => atom.key === "remains");
}

describe("the acting action decides which DoT `remains` means", () => {
  it("reads Garrote's remainder for a Garrote entry", () => {
    // 5.746 <= 14 is TRUE; 5.746 <= 5 is FALSE. Both bracket the real value.
    expect(value("remains<=14", "garrote")).toBe(true);
    expect(value("remains<=5", "garrote")).toBe(false);
  });

  it("reads Rupture's remainder for a Rupture entry", () => {
    // 19 <= 14 is FALSE, and 19 <= 20 is TRUE. The OPPOSITE answers from the
    // same expression, which is what proves the context is being read.
    expect(value("remains<=14", "rupture")).toBe(false);
    expect(value("remains<=20", "rupture")).toBe(true);
  });

  it("cannot let Rupture read Garrote's remaining time", () => {
    // THE REGRESSION. A shared scalar filled from Garrote would answer TRUE here,
    // because 5.746 <= 14. The correct answer is FALSE, because Rupture has 19 s
    // left. Pre-M5-D1 behaviour fails this line.
    expect(value("remains<=14", "rupture")).toBe(false);

    // And the mirror: Garrote must not read Rupture's.
    expect(value("remains<=14", "garrote")).toBe(true);

    // Stated as a raw number too, so a reader can see the two apart.
    expect(remainsAtom("garrote")?.value).toBe(GARROTE_REMAINS);
    expect(remainsAtom("rupture")?.value).toBe(RUPTURE_REMAINS);
  });

  it("is UNKNOWN for an action with no binding, never another action's value", () => {
    // `crimson_tempest` is a real Assassination DoT this build does not derive.
    // Absence must be UNKNOWN, not "whatever was in the map".
    expect(value("remains<=14", "crimson_tempest")).toBeNull();
    const atom = remainsAtom("crimson_tempest");
    expect(atom?.binding).toBe("UNKNOWN_NUMBER");
    expect(atom?.value).toBeNull();
    expect(atom?.unknownNumberReason).toBe("STATE_NOT_ESTABLISHED");
  });

  it("is UNKNOWN with no acting action at all", () => {
    // A `call_action_list` gate belongs to no action. Every self-addressing atom
    // must resolve UNKNOWN there rather than picking the first binding.
    expect(value("remains<=14", null)).toBeNull();
    expect(remainsAtom(null)?.binding).toBe("UNKNOWN_NUMBER");
  });

  it("defaults to no acting action when a caller omits the context", () => {
    // THE SAFE DEFAULT. A forgotten context must not silently read a binding.
    const parsed = parseSimcExpression("remains<=14");
    if (!parsed.ok) throw new Error("expected a parse");
    const result = evaluateSimcExpression(parsed.ast, "remains<=14", bindings());
    expect(result.outcome).toBe("UNRESOLVED");
  });

  it("keeps an empty map meaning `nothing established`, never zero", () => {
    // Zero would satisfy every `remains<=` threshold in the pinned APL.
    const result = evaluate("remains<=14", "garrote", { dotRemainsSecondsByAction: [] });
    expect(result.outcome).toBe("UNRESOLVED");
    const atom = remainsAtom("garrote", { dotRemainsSecondsByAction: [] });
    expect(atom?.value).not.toBe(0);
    expect(atom?.binding).toBe("UNKNOWN_NUMBER");
  });
});

describe("`refreshable` is keyed the same way", () => {
  const refreshableBindings = bindings({
    dotRefreshableByAction: [
      { actionToken: "garrote", refreshable: false },
      { actionToken: "rupture", refreshable: true },
    ],
  });

  function refreshableValue(token: string | null): boolean | null {
    const parsed = parseSimcExpression("refreshable");
    if (!parsed.ok) throw new Error("expected a parse");
    const result = evaluateSimcExpression(
      parsed.ast,
      "refreshable",
      refreshableBindings,
      token === null ? NO_ACTING_ACTION : actingAction(token),
    );
    return result.outcome === "RESOLVED" ? result.value : null;
  }

  it("gives each action its own answer", () => {
    expect(refreshableValue("garrote")).toBe(false);
    expect(refreshableValue("rupture")).toBe(true);
  });

  it("ENUMERATES rather than borrowing when the acting action is unbound", () => {
    // TRUTH-shaped, so an unbound value is explored across both worlds. That is
    // conservative: a verdict survives only if it holds either way. It is NOT
    // resolved from a neighbouring action's binding.
    expect(refreshableValue("crimson_tempest")).toBeNull();
    expect(refreshableValue(null)).toBeNull();

    const parsed = parseSimcExpression("refreshable");
    if (!parsed.ok) throw new Error("expected a parse");
    const result = evaluateSimcExpression(
      parsed.ast,
      "refreshable",
      refreshableBindings,
      actingAction("crimson_tempest"),
    );
    if (result.outcome === "UNSUPPORTED") throw new Error("expected an evaluation");
    expect(result.trace.worlds).toHaveLength(2);
    expect(result.trace.atoms.find((a) => a.key === "refreshable")?.binding).toBe("UNRESOLVED_BOOLEAN");
  });
});

describe("source and target scoping survive the keying", () => {
  it("keeps `remains` a different atom from every named DoT property", () => {
    // Bare `remains` addresses the ACTING action's own DoT. `dot.<x>.ticking`
    // addresses another action's, and the two must never share a binding.
    const parsed = parseSimcExpression("remains<=14&dot.rupture.ticking");
    if (!parsed.ok) throw new Error("expected a parse");
    const result = evaluateSimcExpression(
      parsed.ast,
      "remains<=14&dot.rupture.ticking",
      bindings({ knownDotsTicking: [{ name: "rupture", ticking: false }] }),
      actingAction("garrote"),
    );
    // Garrote's `remains` is TRUE at <=14 and `dot.rupture.ticking` is FALSE, so
    // the conjunction is FALSE — which is only reachable if the two atoms were
    // resolved from different places.
    expect(result.outcome).toBe("RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    expect(result.value).toBe(false);
  });
});
