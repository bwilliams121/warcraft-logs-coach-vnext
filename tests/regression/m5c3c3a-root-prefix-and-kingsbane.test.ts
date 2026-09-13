/**
 * M5-C3c3a on real data: the root prefix, and the first GCD competitor.
 *
 * WHAT THIS MILESTONE ESTABLISHED, AND WHAT IT POINTEDLY DID NOT
 *
 * C3c3 asks a question no milestone can yet answer:
 *
 *     starting at the real decision point, and allowing zero or more NON_GCD
 *     foreground actions to execute and cause rescans, which GCD-consuming
 *     action does the pinned authority select first?
 *
 * C3c3a builds none of that loop. It makes the actions on the path
 * CLASSIFIABLE, so C3c3b can reason over them generically:
 *
 *     default[0] stealth     PROVEN_UNUSABLE(ALREADY_STEALTHED)
 *     default[1] kick        UNKNOWN        - enemy cast state is not modelled
 *     default[3] thistle_tea UNKNOWN        - fight_remains is predictive
 *     cds[4]     kingsbane   PROVEN_UNUSABLE(ACTIVE_COOLDOWN)
 *     core_dot[0] garrote    GCD_CONSUMING  - the lane of the eventual answer
 *
 * THE ONE THING NOT CLAIMED
 *
 * That the first rotational GCD is Garrote. That needs the rescan engine, which
 * does not exist, and the literal traversal still comes to rest at
 * `misc_cds[0] potion`. The last block here asserts that it still does — an
 * improvement in what we can classify must not quietly become an improvement in
 * what we claim.
 */

import { describe, expect, it } from "vitest";

import {
  M5C3C1_ACTOR,
  M5C3C1_EXPECTED,
  M5C3C1_IDS,
  M5C3C1_TARGET,
  garroteDecisionPosition,
  kingsbaneCastPosition,
  m5c3c1State,
  observedTalentEntries,
} from "../support/m5c3c1-fixture.js";
import { RESOURCE_WIRE_CONTRACTS } from "../../src/data/wcl-wire/resource-types.js";
import { resolveTalentSelection } from "../../src/data/game/rogue-talents.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import { traverseRotationalAuthority } from "../../src/specs/rogue/assassination/rotational-traversal.js";
import { authorityProfileFor } from "../../src/specs/rogue/assassination/observed-profile.js";
import {
  resolveApplicability,
  resolveUsability,
} from "../../src/specs/rogue/assassination/action-profile.js";
import { bindStealthedRogue } from "../../src/specs/rogue/assassination/stealth-state.js";
import { deriveCooldown } from "../../src/specs/rogue/assassination/cooldown-bindings.js";
import { executionLaneForToken } from "../../src/data/game/ability-gcd-semantics.js";
import { tryAbilityIdentityFor } from "../../src/data/game/rogue-abilities.js";
import type { AplAction } from "../../src/simc/apl-authority.js";

const PINNED_TOLERANCE_MS = 250;

function authorityOrThrow() {
  const loaded = pinnedAssassinationAuthority();
  if (!loaded.ok) throw new Error(`pinned authority unavailable: ${loaded.reason}`);
  return loaded.authority;
}

function wireTypeFor(resourceId: string): number {
  const contract = RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === resourceId);
  if (contract === undefined) throw new Error(`no wire contract for ${resourceId}`);
  return contract.wireType;
}

/** The real APL entry at `list[ordinal]`, so nothing here is synthesised. */
function entryAt(listName: string, priorityOrdinal: number): AplAction {
  const list = authorityOrThrow().actionsInList(listName);
  if (!list.found) throw new Error(`no list '${listName}'`);
  const action = list.actions.find((entry) => entry.priorityOrdinal === priorityOrdinal);
  if (action === undefined) throw new Error(`no ${listName}[${String(priorityOrdinal)}]`);
  return action;
}

function profileInput(toleranceMs: number | null = PINNED_TOLERANCE_MS) {
  const state = m5c3c1State();
  const profile = authorityProfileFor(state, M5C3C1_ACTOR);
  if (profile === null) throw new Error("the fixture must carry combatantinfo for actor 19");
  return {
    state,
    actorId: M5C3C1_ACTOR,
    position: garroteDecisionPosition(state),
    profile: {
      observed: profile.observed,
      simulation: { ...profile.simulation, cooldownToleranceMs: toleranceMs },
    },
  };
}

const abilityIdFor = (token: string): number | null => tryAbilityIdentityFor(token)?.spellId ?? null;

/** Usability of a real entry at Q. `observedAbilityGameId` is the Garrote cast. */
function usabilityOf(listName: string, ordinal: number, toleranceMs: number | null = PINNED_TOLERANCE_MS) {
  return resolveUsability(
    profileInput(toleranceMs),
    entryAt(listName, ordinal),
    M5C3C1_IDS.garrote,
    abilityIdFor,
  );
}

describe("default[0] stealth is proven unusable by a fact M5-C2 already had", () => {
  it("is PROVEN_UNUSABLE(ALREADY_STEALTHED)", () => {
    const verdict = usabilityOf("default", 0);
    expect(verdict.kind).toBe("PROVEN_UNUSABLE");
    if (verdict.kind !== "PROVEN_UNUSABLE") return;
    expect(verdict.reason).toBe("ALREADY_STEALTHED");
  });

  it("is APPLICABLE, because the action exists and is never background", () => {
    // The distinction the vocabulary exists for: this entry is a real foreground
    // action the scan reaches and asks about. It simply cannot succeed.
    expect(resolveApplicability(profileInput(), entryAt("default", 0)).kind).toBe("APPLICABLE");
  });

  it("names the observed aura that proved it, not a cooldown", () => {
    const state = m5c3c1State();
    const stealthed = bindStealthedRogue({
      state,
      actorId: M5C3C1_ACTOR,
      position: garroteDecisionPosition(state),
    });
    expect(stealthed.value).toBe("TRUE");
    if (stealthed.value !== "TRUE") return;

    const verdict = usabilityOf("default", 0);
    if (verdict.kind !== "PROVEN_UNUSABLE") throw new Error("expected a negative verdict");
    expect(verdict.evidence.abilityGameId).toBe(stealthed.provenBy.abilityGameId);
    // EMPHATICALLY not a timing claim. Nothing is recharging.
    expect(verdict.evidence.provenRemainingAtLeastMs).toBeNull();
    expect(verdict.evidence.cooldownToleranceMs).toBeNull();
    expect(verdict.evidence.detail).toContain("STEALTH_BASIC | STEALTH_ROGUE");
  });

  it("does NOT depend on the cooldown tolerance at all", () => {
    // A state-based refusal, so removing the tolerance changes nothing. If this
    // ever started returning UNKNOWN without a tolerance, the verdict would have
    // acquired a timing dependency it has no business having.
    for (const tolerance of [PINNED_TOLERANCE_MS, 0, null]) {
      expect(usabilityOf("default", 0, tolerance).kind, String(tolerance)).toBe("PROVEN_UNUSABLE");
    }
  });
});

describe("the rest of the root prefix stays honestly unresolved", () => {
  it("leaves default[1] kick APPLICABLE with UNKNOWN usability", () => {
    // Kick's readiness depends on whether the target had an interruptible cast,
    // which this analyzer does not model. C3c3a does not guess, and it does NOT
    // infer unready from the log showing no Kick — absence is not evidence.
    expect(resolveApplicability(profileInput(), entryAt("default", 1)).kind).toBe("APPLICABLE");
    expect(usabilityOf("default", 1).kind).toBe("UNKNOWN");
  });

  it("leaves default[3] thistle_tea APPLICABLE with UNKNOWN usability", () => {
    // Its condition is `energy.pct<30|fight_remains<10`. C3c3a models neither
    // its readiness nor its transition; both belong to C3c3c.
    expect(resolveApplicability(profileInput(), entryAt("default", 3)).kind).toBe("APPLICABLE");
    expect(usabilityOf("default", 3).kind).toBe("UNKNOWN");
  });

  it("classifies every root-prefix entry's lane", () => {
    // What C3c3b will actually consume. `variable` has no lane and needs none:
    // it executes and the scan continues, so it can never be a terminal.
    expect(executionLaneForToken("stealth")).toBe("NON_GCD");
    expect(executionLaneForToken("kick")).toBe("NON_GCD");
    expect(executionLaneForToken("thistle_tea")).toBe("NON_GCD");
    expect(executionLaneForToken("ambush")).toBe("GCD_CONSUMING");
    expect(entryAt("default", 2).entryKind).toBe("VARIABLE_ASSIGNMENT");
  });
});

describe("cds[4] kingsbane is proven unusable from its derived cooldown", () => {
  it("derives BOUNDED >= 57198 ms at Q, unchanged from C3c1", () => {
    const state = m5c3c1State();
    const derived = deriveCooldown(
      { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state) },
      "kingsbane",
    );
    expect(derived?.cooldown.state).toBe("BOUNDED");
    if (derived?.cooldown.state !== "BOUNDED") return;
    expect(derived.cooldown.atLeastRemainingMs).toBe(M5C3C1_EXPECTED.remainingMs);
    expect(derived.cooldown.atLeastRemainingMs).toBe(57_198);
    expect(derived.cooldown.anchor.position).toBe(kingsbaneCastPosition(state));
    // Still a BOUND. C3c3a consumes the lower bound; it does not promote it.
    expect(derived.cooldown.state).not.toBe("EXACT");
  });

  it("is APPLICABLE and PROVEN_UNUSABLE(ACTIVE_COOLDOWN)", () => {
    expect(resolveApplicability(profileInput(), entryAt("cds", 4)).kind).toBe("APPLICABLE");
    const verdict = usabilityOf("cds", 4);
    expect(verdict.kind).toBe("PROVEN_UNUSABLE");
    if (verdict.kind !== "PROVEN_UNUSABLE") return;
    expect(verdict.reason).toBe("ACTIVE_COOLDOWN");
    expect(verdict.evidence.abilityGameId).toBe(M5C3C1_IDS.kingsbane);
    expect(verdict.evidence.itemId).toBeNull();
    expect(verdict.evidence.provenRemainingAtLeastMs).toBe(57_198);
    expect(verdict.evidence.cooldownToleranceMs).toBe(PINNED_TOLERANCE_MS);
  });

  it("compares 57198 against the profile's 250 ms, with the margin stated", () => {
    // The margin is ~229x. Worth asserting numerically: a unit error anywhere in
    // the chain would not change the verdict here, so the verdict alone cannot
    // detect one.
    const verdict = usabilityOf("cds", 4);
    if (verdict.kind !== "PROVEN_UNUSABLE") throw new Error("expected a negative verdict");
    const remaining = verdict.evidence.provenRemainingAtLeastMs ?? 0;
    const tolerance = verdict.evidence.cooldownToleranceMs ?? 0;
    expect(remaining).toBeGreaterThan(tolerance);
    expect(remaining / tolerance).toBeGreaterThan(200);
  });

  it("refuses when the profile establishes no tolerance", () => {
    // The threshold is an INPUT. Without one there is no comparison to make, and
    // picking 250 would be a verdict the profile never licensed.
    expect(usabilityOf("cds", 4, null).kind).toBe("UNKNOWN");
  });

  it("refuses when the tolerance exceeds the proven remainder", () => {
    // A profile configured with a two-minute queueing tolerance genuinely cannot
    // prove a 57-second remainder unusable.
    expect(usabilityOf("cds", 4, 120_000).kind).toBe("UNKNOWN");
  });

  it("is GCD_CONSUMING, so C3c3b will treat it as a terminal candidate", () => {
    expect(executionLaneForToken("kingsbane")).toBe("GCD_CONSUMING");
  });
});

describe("garrote's own lane, which the eventual answer depends on", () => {
  it("is GCD_CONSUMING, from spell 703", () => {
    expect(executionLaneForToken("garrote")).toBe("GCD_CONSUMING");
    expect(entryAt("core_dot", 0).actionToken).toBe("garrote");
    expect(tryAbilityIdentityFor("garrote")?.spellId).toBe(703);
  });
});

describe("no first-GCD claim is made, and the literal traversal is unchanged", () => {
  it("still comes to rest at default[5] -> cds[3] -> misc_cds[0] potion", () => {
    // THE regression that keeps C3c3a honest. Lane data and two new negative
    // verdicts arrived; the literal next-action answer did not move, because the
    // rescan engine that would use them does not exist yet.
    const state = m5c3c1State();
    const profile = authorityProfileFor(state, M5C3C1_ACTOR);
    if (profile === null) throw new Error("expected a profile");
    const knownTalents = ["improved_garrote", "shrouded_suffocation", "blindside", "improved_ambush"]
      .map((name) => resolveTalentSelection(observedTalentEntries(state), name))
      .filter((resolution) => resolution.selection !== "UNKNOWN")
      .map((resolution) => ({ name: resolution.simcName, taken: resolution.selection === "SELECTED" }));

    const traversal = traverseRotationalAuthority({
      state,
      actorId: M5C3C1_ACTOR,
      targetActorId: M5C3C1_TARGET,
      position: garroteDecisionPosition(state),
      observedAbilityGameId: M5C3C1_IDS.garrote,
      authority: authorityOrThrow(),
      comboPointWireType: wireTypeFor("COMBO_POINTS"),
      energyWireType: wireTypeFor("ENERGY"),
      comboPointResourceId: "COMBO_POINTS",
      energyResourceId: "ENERGY",
      knownTalents,
      profile,
    });
    if (traversal.status !== "TRAVERSED") throw new Error("expected a traversal");
    expect(traversal.result.kind).toBe("UNKNOWN");
    if (traversal.result.kind !== "UNKNOWN") return;
    expect(traversal.result.blockedAt?.listName).toBe("misc_cds");
    expect(traversal.result.blockedAt?.priorityOrdinal).toBe(0);
    expect(traversal.result.blockedAt?.actionToken).toBe("potion");

    // The boundary is still C1's, and the traversal still starts at ordinal 4 —
    // so `default[0..3]` are still not visited by THIS query. Their verdicts
    // above were asked for directly, which is exactly the separation C3c3a is
    // meant to preserve.
    expect(traversal.boundary.startOrdinal).toBe(4);
    const rootSteps = traversal.result.steps.filter((step) => step.listName === "default");
    expect(rootSteps.length).toBeGreaterThan(0);
    expect(rootSteps.every((step) => step.priorityOrdinal >= 4)).toBe(true);
  });

  it("exposes no first-GCD selector anywhere in src/", async () => {
    // C3c3b's job. Asserted so the split cannot quietly close.
    const engine = await import("../../src/simc/nested-selection.js");
    expect(Object.keys(engine)).not.toContain("selectFirstGcdAcrossRescans");
  });
});
