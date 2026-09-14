/**
 * The cooldown -> negative-usability bridge, applied to an ORDINARY ability.
 *
 * M5-C3c2 built the bridge and wired it for item use only. C3c3a wires it for
 * ordinary class abilities too, and the rule is the same rule:
 *
 *     provenLowerBoundRemaining > establishedTolerance   ->  PROVEN_UNUSABLE
 *     anything else                                      ->  UNKNOWN
 *
 * The tests below drive it through the Assassination adapter against a REAL
 * combat state, varying the profile's tolerance rather than inventing cooldown
 * numbers, so what is exercised is the comparison the analyzer will actually
 * make.
 *
 * NOTHING HERE EVER CONCLUDES AN ACTION IS READY. Readiness also depends on
 * resources, range and target validity, none of which this project models, so
 * only the negative direction is claimed.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { M5C3C1_ACTOR, M5C3C1_IDS, garroteDecisionPosition, m5c3c1State } from "../support/m5c3c1-fixture.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import { resolveUsability } from "../../src/specs/rogue/assassination/action-profile.js";
import { authorityProfileFor } from "../../src/specs/rogue/assassination/observed-profile.js";
import {
  SUPPORTED_COOLDOWN_TOKENS,
  deriveCooldown,
} from "../../src/specs/rogue/assassination/cooldown-bindings.js";
import { cooldownForToken } from "../../src/data/game/rogue-cooldowns.js";
import { tryAbilityIdentityFor } from "../../src/data/game/rogue-abilities.js";
import { UNUSABLE_REASONS } from "../../src/simc/action-applicability.js";
import type { AplAction } from "../../src/simc/apl-authority.js";

/** The proven lower bound the C3c1 derivation produces at this decision point. */
const PROVEN_REMAINING_MS = 57_198;

function authorityOrThrow() {
  const loaded = pinnedAssassinationAuthority();
  if (!loaded.ok) throw new Error(`pinned authority unavailable: ${loaded.reason}`);
  return loaded.authority;
}

function entryAt(listName: string, priorityOrdinal: number): AplAction {
  const list = authorityOrThrow().actionsInList(listName);
  if (!list.found) throw new Error(`no list '${listName}'`);
  const action = list.actions.find((entry) => entry.priorityOrdinal === priorityOrdinal);
  if (action === undefined) throw new Error(`no ${listName}[${String(priorityOrdinal)}]`);
  return action;
}

const KINGSBANE_ENTRY = () => entryAt("cds", 4);
const abilityIdFor = (token: string): number | null => tryAbilityIdentityFor(token)?.spellId ?? null;

/**
 * Usability of the Kingsbane entry under a chosen tolerance.
 *
 * `observedAbilityGameId` is the Garrote cast, i.e. NOT Kingsbane, so the
 * positive-observation short-circuit never fires and the cooldown path is what
 * is actually exercised.
 */
function verdictAtTolerance(cooldownToleranceMs: number | null) {
  const state = m5c3c1State();
  const profile = authorityProfileFor(state, M5C3C1_ACTOR);
  if (profile === null) throw new Error("expected a profile");
  return resolveUsability(
    {
      state,
      actorId: M5C3C1_ACTOR,
      position: garroteDecisionPosition(state),
      profile: {
        observed: profile.observed,
        simulation: { ...profile.simulation, cooldownToleranceMs },
      },
    },
    KINGSBANE_ENTRY(),
    M5C3C1_IDS.garrote,
    abilityIdFor,
  );
}

describe("an ordinary non-charge cooldown can prove an action unusable", () => {
  it("is PROVEN_UNUSABLE when the proven bound clears the tolerance", () => {
    const verdict = verdictAtTolerance(250);
    expect(verdict.kind).toBe("PROVEN_UNUSABLE");
    if (verdict.kind !== "PROVEN_UNUSABLE") return;
    expect(verdict.reason).toBe("ACTIVE_COOLDOWN");
    expect(verdict.evidence.provenRemainingAtLeastMs).toBe(PROVEN_REMAINING_MS);
    expect(verdict.evidence.cooldownToleranceMs).toBe(250);
    // An ABILITY, not an item. The evidence says which.
    expect(verdict.evidence.abilityGameId).toBe(M5C3C1_IDS.kingsbane);
    expect(verdict.evidence.itemId).toBeNull();
  });

  it("needs only the LOWER BOUND to exceed the tolerance", () => {
    // The C3c1 derivation is BOUNDED, never EXACT, because SimulationCraft starts
    // a cooldown with a sampled non-negative lag. A bound is sufficient here
    // precisely because the comparison is one-sided.
    const state = m5c3c1State();
    const derived = deriveCooldown(
      { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state) },
      "kingsbane",
    );
    expect(derived?.cooldown.state).toBe("BOUNDED");
    expect(verdictAtTolerance(PROVEN_REMAINING_MS - 1).kind).toBe("PROVEN_UNUSABLE");
  });

  it("is UNKNOWN at exactly the tolerance, because queueable() is inclusive", () => {
    // `queueable() <= now` admits equality, so a remainder equal to the tolerance
    // IS queueable and nothing is proven.
    expect(verdictAtTolerance(PROVEN_REMAINING_MS).kind).toBe("UNKNOWN");
  });

  it("is UNKNOWN below the tolerance", () => {
    expect(verdictAtTolerance(PROVEN_REMAINING_MS + 1).kind).toBe("UNKNOWN");
    expect(verdictAtTolerance(120_000).kind).toBe("UNKNOWN");
  });

  it("is UNKNOWN when the profile establishes no tolerance", () => {
    // Never falls back to 250. A bridge that picked a value would produce a
    // verdict the profile never licensed.
    expect(verdictAtTolerance(null).kind).toBe("UNKNOWN");
  });

  it("is UNKNOWN for an ability whose cooldown could not be derived", () => {
    // RE-POINTED for M5-D1, which added `deathmark` to the cooldown dataset. The
    // stand-in is `shiv`: a real Assassination action in the pinned `generate`
    // list that the dataset deliberately does not carry, because no supported
    // decision reads its cooldown. Absence of a derivation is not a readiness
    // claim in either direction.
    const state = m5c3c1State();
    const profile = authorityProfileFor(state, M5C3C1_ACTOR);
    if (profile === null) throw new Error("expected a profile");
    expect(deriveCooldown({ state, actorId: M5C3C1_ACTOR, position: 0 }, "shiv")).toBeNull();
    const verdict = resolveUsability(
      { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state), profile },
      entryAt("generate", 1),
      M5C3C1_IDS.garrote,
      abilityIdFor,
    );
    expect(verdict.kind).toBe("UNKNOWN");
  });

  it("never concludes an action IS ready", () => {
    // Across every tolerance, the only two answers are the negative claim and a
    // refusal. There is no positive member for the bridge to return.
    for (const tolerance of [0, 250, 57_198, 120_000, null]) {
      const verdict = verdictAtTolerance(tolerance);
      expect(["PROVEN_UNUSABLE", "UNKNOWN"], String(tolerance)).toContain(verdict.kind);
    }
  });
});

describe("charge semantics are preserved, not regressed", () => {
  it("keeps the charge-cooldown discriminator, not a charge count", () => {
    // `_charges = 0` in DBC means "no charge system at all", not "zero charges
    // available". The discriminator is `chargeCooldownMs > 0` (action.cpp:710),
    // and Kingsbane has no charge cooldown — so it takes the ordinary path.
    const identity = cooldownForToken("kingsbane");
    expect(identity?.charges).toBe(0);
    expect(identity?.chargeCooldownMs).toBe(0);
    expect(verdictAtTolerance(250).kind).toBe("PROVEN_UNUSABLE");
  });

  it("refuses rather than modelling a real charge system", () => {
    // The engine's own refusal, re-asserted from here so the wiring cannot
    // quietly start consuming a CHARGES_NOT_MODELLED cooldown as if it were a
    // plain one.
    const code = readFileSync("src/engine/game-state/cooldowns/cooldown-state.ts", "utf8");
    expect(code).toContain("CHARGES_NOT_MODELLED");
    expect(code).toContain("chargeCooldownMs > 0");
    expect(code).not.toContain("charges === 0");
  });
});

describe("the bridge is generic, not written around one ability", () => {
  it("names no ability token in the adapter's cooldown path", () => {
    // The supported set is DATA. Widening it must be a dataset change, not a new
    // branch in the actionability layer — otherwise every future ability needs
    // its own rule for a rule that is always the same.
    const code = readFileSync("src/specs/rogue/assassination/action-profile.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("kingsbane");
    expect(code).not.toContain("Kingsbane");
  });

  it("drives the supported set from the pinned dataset", () => {
    // Grown at M5-D1: `deathmark` because five reachable lines read
    // `cooldown.deathmark.remains`, and `vanish` because a readiness proof is
    // the only way to eliminate the `vanish` list — its conditions never can.
    expect([...SUPPORTED_COOLDOWN_TOKENS]).toEqual(["kingsbane", "deathmark", "vanish"]);
    for (const token of SUPPORTED_COOLDOWN_TOKENS) {
      expect(cooldownForToken(token)).not.toBeNull();
    }
  });

  it("shares one reason vocabulary with the item path", () => {
    // The item and ordinary paths produce the SAME reason, because it is the same
    // fact about the same kind of object. Two reasons would invite two rules.
    expect([...UNUSABLE_REASONS]).toContain("ACTIVE_COOLDOWN");
    const verdict = verdictAtTolerance(250);
    if (verdict.kind !== "PROVEN_UNUSABLE") throw new Error("expected a negative verdict");
    expect(verdict.reason).toBe("ACTIVE_COOLDOWN");
  });

  it("lets a positive observation win over any derivation", () => {
    // Asking about Kingsbane while Kingsbane is the observed cast: the observed
    // execution proves it WAS usable, and that must not be contradicted by a
    // derived cooldown. Checked because the ordering is easy to get wrong.
    const state = m5c3c1State();
    const profile = authorityProfileFor(state, M5C3C1_ACTOR);
    if (profile === null) throw new Error("expected a profile");
    const verdict = resolveUsability(
      { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state), profile },
      KINGSBANE_ENTRY(),
      M5C3C1_IDS.kingsbane,
      abilityIdFor,
    );
    expect(verdict.kind).toBe("PROVEN_USABLE");
  });
});
